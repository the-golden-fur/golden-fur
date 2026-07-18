import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';
import { getServiceById } from '../../maintenance/services/services.service.ts';
import { getPackageById } from '../../maintenance/services/packages.service.ts';
import type { Booking, ServiceCategory } from '../booking.types.ts';
import type { CreateBookingInput } from '../modules/validators/booking.validator.ts';
import { assertVeterinaryBranchEligibility } from './veterinaryEligibility.service.ts';
import {
  checkCapacity,
  confirmCapacityAfterInsert,
} from './capacity.service.ts';
import {
  autoAssignStaff,
  isStaffPickerEnabled,
  listAvailableStaff,
} from './staffPicker.service.ts';

/** Hardcoded per Modules-Features baseline (Guide #51 dev notes) - the
 * configurable policy_configurations.downpayment_percent column is explicitly
 * out of this epic's stub scope (Sprint 5, M09). */
const HOTEL_DOWNPAYMENT_RATE = 0.5;

const BOOKING_SELECT = '*, booking_addons(*), staff_picker_preferences(*)';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface PetRow {
  id: string;
  customer_id: string;
  weight_class: 'S' | 'M' | 'L' | 'XL';
  coat_type: 'SC' | 'LC';
}

interface CreateBookingParams {
  requesterId: string;
  input: CreateBookingInput;
}

/**
 * M11's notifications table is Sprint 6 scope, so the booking_confirmed
 * notification (email + in-app) is a stub/log call - it must never block
 * booking confirmation waiting on a real send (Guide #51 dev notes).
 * TODO(Sprint 6, M11): replace with the real notification dispatch.
 */
function sendBookingConfirmedNotificationStub(booking: Booking): void {
  // eslint-disable-next-line no-console
  console.info(
    `[M11 stub] booking_confirmed notification for booking ${booking.id} (customer ${booking.customer_id})`
  );
}

/**
 * Grooming price is tiered by the pet's size/coat when a matching
 * service_pricing_tiers cell exists; base_price otherwise (and always for the
 * other categories).
 */
function resolveServicePrice(
  service: Awaited<ReturnType<typeof getServiceById>>,
  pet: PetRow
): number {
  if (service.category === 'Grooming') {
    const tier = (service.service_pricing_tiers ?? []).find(
      (row) =>
        row.weight_class === pet.weight_class && row.coat_type === pet.coat_type
    );

    if (tier) return Number(tier.price);
  }

  return Number(service.base_price);
}

interface PricedAddon {
  service_id: string;
  price_at_booking: number;
}

async function resolveAddons(
  addonServiceIds: string[] | undefined,
  serviceCategory: ServiceCategory
): Promise<PricedAddon[]> {
  if (!addonServiceIds?.length) return [];

  // Add-ons are a Grooming concept per Modules-Features ("applicable to
  // Grooming services").
  if (serviceCategory !== 'Grooming') {
    throwWithStatus(400, 'Add-ons only apply to Grooming bookings');
  }

  const { data, error } = await supabase
    .from('services')
    .select('id, base_price, is_active')
    .in('id', addonServiceIds);

  if (error) throwWithStatus(400, error.message);

  const rows = (data ?? []) as Array<{
    id: string;
    base_price: number;
    is_active: boolean;
  }>;

  for (const addonId of addonServiceIds) {
    const row = rows.find((candidate) => candidate.id === addonId);

    if (!row) throwWithStatus(404, `Add-on service ${addonId} not found`);
    if (!row.is_active) {
      throwWithStatus(400, `Add-on service ${addonId} is inactive`);
    }
  }

  // price_at_booking snapshots the current price so later catalog changes
  // never retroactively alter historical bookings (#50 schema note).
  return addonServiceIds.map((addonId) => {
    const row = rows.find((candidate) => candidate.id === addonId)!;
    return { service_id: addonId, price_at_booking: Number(row.base_price) };
  });
}

interface StaffResolution {
  assignedStaffId: string | null;
  preferenceType: 'no_preference' | 'specific' | null;
  preferredStaffId: string | null;
  staffPickerShown: boolean;
}

/**
 * Grooming/Veterinary staff assignment at confirmation time:
 * - a specific preference is re-verified against the RPC (the single-staff
 *   call shape) - if that staff member no longer passes all three conditions
 *   the booking is rejected rather than silently reassigned;
 * - "No preference" (or the Staff Picker toggle being disabled, which must
 *   behave identically per #52 AC-3) auto-assigns the next eligible staff
 *   member.
 */
async function resolveStaffAssignment(
  input: CreateBookingInput
): Promise<StaffResolution> {
  const category = input.service_category;

  if (category !== 'Grooming' && category !== 'Veterinary') {
    return {
      assignedStaffId: null,
      preferenceType: null,
      preferredStaffId: null,
      staffPickerShown: false,
    };
  }

  const pickerEnabled = await isStaffPickerEnabled(input.branch_id, category);
  const preference = pickerEnabled ? input.staff_preference : undefined;

  if (preference?.type === 'specific') {
    const verified = await listAvailableStaff({
      branchId: input.branch_id,
      serviceCategory: category,
      scheduledStart: input.scheduled_start,
      scheduledEnd: input.scheduled_end,
      staffId: preference.staff_id,
    });

    if (verified.length === 0) {
      throwWithStatus(
        409,
        'The selected staff member is no longer available for the requested time'
      );
    }

    return {
      assignedStaffId: preference.staff_id!,
      preferenceType: 'specific',
      preferredStaffId: preference.staff_id!,
      staffPickerShown: true,
    };
  }

  const assigned = await autoAssignStaff({
    branchId: input.branch_id,
    serviceCategory: category,
    scheduledStart: input.scheduled_start,
    scheduledEnd: input.scheduled_end,
  });

  if (!assigned) {
    throwWithStatus(
      409,
      `No eligible staff available for a ${category} booking at the requested time`
    );
  }

  return {
    assignedStaffId: assigned.staff_id,
    preferenceType: 'no_preference',
    preferredStaffId: null,
    // Audit flag: was the picker enabled at the time of this booking (#50
    // schema note), independent of later toggle changes.
    staffPickerShown: pickerEnabled,
  };
}

/**
 * Issue #51: booking creation with automatic confirmation - no manual review
 * step exists anywhere in this flow. Order of operations per the Guide:
 * ownership validation -> #53's Veterinary branch guard (fail fast, before
 * any capacity check) -> pricing snapshot -> payment gate -> authoritative
 * capacity check -> INSERT -> post-insert race re-verification (AC-5).
 */
export async function createBooking({
  requesterId,
  input,
}: CreateBookingParams): Promise<Booking> {
  const staffRole = await getStaffRoleOrNull(requesterId);

  // Customer callers may only book for themselves (#51 AC-6); staff callers
  // (the receptionist walk-in/phone-in flow) must name the customer and are
  // recorded as created_by_staff_id.
  let customerId: string;
  let createdByStaffId: string | null = null;

  if (staffRole) {
    if (!input.customer_id) {
      throwWithStatus(
        400,
        'customer_id is required when staff create a booking on behalf of a customer'
      );
    }

    customerId = input.customer_id;
    createdByStaffId = requesterId;
  } else {
    if (input.customer_id && input.customer_id !== requesterId) {
      throwWithStatus(403, 'Customers can only create their own bookings');
    }

    customerId = requesterId;
  }

  const { data: pet, error: petError } = await supabase
    .from('pets')
    .select('id, customer_id, weight_class, coat_type')
    .eq('id', input.pet_id)
    .maybeSingle();

  if (petError) throwWithStatus(400, petError.message);
  if (!pet) throwWithStatus(404, 'Pet not found');

  if ((pet as PetRow).customer_id !== customerId) {
    throwWithStatus(403, 'Pet does not belong to this customer');
  }

  // #53: the actual enforcement boundary, before any capacity check.
  await assertVeterinaryBranchEligibility({
    branchId: input.branch_id,
    serviceCategory: input.service_category,
  });

  // Pricing snapshot from Epic A's catalog (services/packages lookups #40/#41).
  let basePrice: number;

  if (input.service_id) {
    const service = await getServiceById(input.service_id);

    if (!service.is_active) {
      throwWithStatus(400, 'The selected service is inactive');
    }

    if (service.category !== input.service_category) {
      throwWithStatus(
        400,
        'service_category does not match the selected service'
      );
    }

    basePrice = resolveServicePrice(service, pet as PetRow);
  } else {
    const pkg = await getPackageById(input.package_id!);

    if (!pkg.is_active) {
      throwWithStatus(400, 'The selected package is inactive');
    }

    if (pkg.branch_id !== input.branch_id) {
      throwWithStatus(400, 'The selected package belongs to another branch');
    }

    basePrice = Number(pkg.bundled_price);
  }

  const addons = await resolveAddons(
    input.addon_service_ids,
    input.service_category
  );

  const totalPrice =
    basePrice + addons.reduce((sum, addon) => sum + addon.price_at_booking, 0);

  const downpaymentAmount =
    input.service_category === 'Hotel'
      ? Math.round(totalPrice * HOTEL_DOWNPAYMENT_RATE * 100) / 100
      : null;

  // Payment gate (#51 AC-4): Hotel/Grooming/Daycare only reach Confirmed once
  // payment_confirmed = true; Veterinary confirms with no payment gate. A
  // pay-at-counter booking (payment_confirmed = false, #58 AC-4) persists as
  // Pending until the Sprint 5 M08 cashier-confirmation flow exists to
  // promote it - it does not occupy capacity (all capacity counts filter on
  // status = 'Confirmed').
  // TODO(Sprint 5, M08): cashier-side payment confirmation promotes Pending
  // bookings to Confirmed (re-running the capacity check at that moment).
  const paymentConfirmed =
    input.service_category === 'Veterinary'
      ? false
      : (input.payment_confirmed ?? false);
  const status =
    input.service_category === 'Veterinary' || paymentConfirmed
      ? 'Confirmed'
      : 'Pending';

  // Staff resolution (Grooming/Veterinary) happens before the generic
  // capacity check because for these categories staff availability IS the
  // capacity check.
  const staffResolution = await resolveStaffAssignment(input);

  if (
    input.service_category === 'Hotel' ||
    input.service_category === 'Daycare'
  ) {
    // The authoritative submission-time check - never skipped even though the
    // Slot Picker already ran the same check read-only (Guide #51).
    const capacity = await checkCapacity({
      branchId: input.branch_id,
      serviceCategory: input.service_category,
      scheduledStart: input.scheduled_start,
      scheduledEnd: input.scheduled_end,
      petWeightClass: (pet as PetRow).weight_class,
    });

    if (!capacity.available) {
      throwWithStatus(409, capacity.reason ?? 'No capacity available');
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('bookings')
    .insert({
      customer_id: customerId,
      pet_id: input.pet_id,
      branch_id: input.branch_id,
      created_by_staff_id: createdByStaffId,
      service_category: input.service_category,
      service_id: input.service_id ?? null,
      package_id: input.package_id ?? null,
      scheduled_start: input.scheduled_start,
      scheduled_end: input.scheduled_end,
      assigned_staff_id: staffResolution.assignedStaffId,
      status,
      total_price: totalPrice,
      downpayment_amount: downpaymentAmount,
      payment_method: input.payment_method ?? null,
      payment_confirmed: paymentConfirmed,
      special_instructions: input.special_instructions ?? null,
    })
    .select('*')
    .maybeSingle();

  if (insertError || !inserted) {
    throwWithStatus(400, insertError?.message ?? 'Failed to create booking');
  }

  const booking = inserted as Booking;

  if (addons.length > 0) {
    const { error: addonError } = await supabase.from('booking_addons').insert(
      addons.map((addon) => ({
        booking_id: booking.id,
        ...addon,
      }))
    );

    if (addonError) {
      await supabase.from('bookings').delete().eq('id', booking.id);
      throwWithStatus(400, addonError.message);
    }
  }

  if (staffResolution.preferenceType) {
    const { error: preferenceError } = await supabase
      .from('staff_picker_preferences')
      .insert({
        booking_id: booking.id,
        preference_type: staffResolution.preferenceType,
        preferred_staff_id: staffResolution.preferredStaffId,
        staff_picker_shown: staffResolution.staffPickerShown,
      });

    if (preferenceError) {
      await supabase.from('bookings').delete().eq('id', booking.id);
      throwWithStatus(400, preferenceError.message);
    }
  }

  // AC-5: with no client-side transaction, the post-insert re-count decides
  // races deterministically - the loser's row is removed and the caller gets
  // the same capacity-taken error the flow diagram describes.
  if (status === 'Confirmed') {
    const won = await confirmCapacityAfterInsert(booking);

    if (!won) {
      await supabase.from('bookings').delete().eq('id', booking.id);
      throwWithStatus(
        409,
        'Capacity was taken between slot selection and payment — please select another slot'
      );
    }

    sendBookingConfirmedNotificationStub(booking);
  }

  return getBookingById({ requesterId, bookingId: booking.id });
}

interface GetBookingParams {
  requesterId: string;
  bookingId: string;
}

export async function getBookingById({
  requesterId,
  bookingId,
}: GetBookingParams): Promise<Booking> {
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_SELECT)
    .eq('id', bookingId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Booking not found');

  const booking = data as Booking;

  if (booking.customer_id !== requesterId) {
    const staffRole = await getStaffRoleOrNull(requesterId);

    if (!staffRole) {
      throwWithStatus(403, 'Forbidden');
    }
  }

  return booking;
}

export interface ListBookingsFilters {
  branchId?: string;
  /** YYYY-MM-DD, matched against scheduled_start's calendar date (UTC). */
  date?: string;
  serviceCategory?: ServiceCategory;
  status?: Booking['status'];
}

interface ListBookingsParams {
  requesterId: string;
  filters: ListBookingsFilters;
}

/**
 * Supporting infra for #59 (customer's own bookings list) and #60
 * (Receptionist Bookings Queue) - neither issue in the merged #51-#54
 * backend exposed a list endpoint (only POST /bookings and GET
 * /bookings/:id existed). A customer caller is always scoped to their own
 * rows regardless of which filters they pass, mirroring the RLS policy
 * (#50 AC-3) even though this server-side client runs with the service role
 * and RLS isn't itself the enforcement here.
 */
export async function listBookings({
  requesterId,
  filters,
}: ListBookingsParams): Promise<Booking[]> {
  const staffRole = await getStaffRoleOrNull(requesterId);

  let query = supabase.from('bookings').select(BOOKING_SELECT);

  if (!staffRole) {
    query = query.eq('customer_id', requesterId);
  } else if (filters.branchId) {
    query = query.eq('branch_id', filters.branchId);
  }

  if (filters.serviceCategory) {
    query = query.eq('service_category', filters.serviceCategory);
  }

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.date) {
    const dayStart = `${filters.date}T00:00:00.000Z`;
    const dayEnd = new Date(
      new Date(dayStart).getTime() + 24 * 60 * 60 * 1000
    ).toISOString();

    query = query
      .gte('scheduled_start', dayStart)
      .lt('scheduled_start', dayEnd);
  }

  const { data, error } = await query.order('scheduled_start', {
    ascending: true,
  });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as Booking[];
}
