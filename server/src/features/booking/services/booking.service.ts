import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';
import { getServiceById } from '../../maintenance/services/services.service.ts';
import { getPackageById } from '../../maintenance/services/packages.service.ts';
import { getPromoById } from '../../maintenance/services/promos.service.ts';
import { getDiscountById } from '../../discounts/services/discounts.service.ts';
import {
  BOOKING_MARK_PAID_ROLES,
  ONLINE_PAYMENT_METHODS,
  OVERRIDABLE_BOOKING_STATUSES,
  OVERRIDABLE_PAYMENT_STAGES,
  type Booking,
  type PaymentStage,
  type ServiceCategory,
} from '../booking.types.ts';
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

const BOOKING_SELECT = '*, booking_items(*), staff_picker_preferences(*)';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface PetRow {
  id: string;
  customer_id: string;
  weight_class: 'S' | 'M' | 'L' | 'XL' | null;
  coat_type: 'SC' | 'LC' | null;
}

/** Client interview finding: weight_class/coat_type are staff-only-set
 * (...073_m02_pets_assessment_lock.sql) and start out NULL - a pet in that
 * state can only book a service flagged requires_assessed_pet = false (the
 * seeded "Initial Assessment" service), never a package. */
function isPetAssessed(pet: PetRow): boolean {
  return pet.weight_class !== null && pet.coat_type !== null;
}

interface CreateBookingParams {
  requesterId: string;
  input: CreateBookingInput;
}

/**
 * M11's notifications table is Sprint 6 scope, so the booking_confirmed
 * notification (email + in-app) is a stub/log call - it must never block
 * booking creation waiting on a real send (Guide #51 dev notes). Fires on
 * every successful creation now (booking-status revision retired the
 * 'Confirmed' status value, but M11's booking_confirmed event still refers
 * to "a booking was successfully made", not that specific status name).
 * TODO(Sprint 6, M11): replace with the real notification dispatch.
 */
function sendBookingCreatedNotificationStub(booking: Booking): void {
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

interface ResolvedBookingItem {
  service_id: string | null;
  package_id: string | null;
  price_at_booking: number;
  duration_minutes_at_booking: number;
}

/**
 * Multi-item bookings revision: a booking now holds N services/packages
 * (checkbox multiselect on the client, replacing the old exactly-one
 * service_id/package_id column pair plus the Grooming-only booking_addons
 * side table). Every item must belong to the booking's own service_category -
 * services carry that directly; packages have no category column of their
 * own, so it's enforced by checking every member service's category instead
 * (the DB's old num_nonnulls check constraint used to give this for free by
 * only ever allowing one service OR one package on the booking itself).
 */
/**
 * Hotel is priced per night, not a flat one-time fee - "how many nights" is
 * never sent as its own field (only scheduled_start/scheduled_end, which
 * the client already computes as start + nights * duration), so it's
 * derived here the same way, per item: how many of THIS item's own
 * duration_minutes fit in the actual scheduled window. Every other
 * category prices a booking_items row at exactly 1x its catalog price.
 */
function resolveQuantity(
  serviceCategory: ServiceCategory,
  scheduledStart: string,
  scheduledEnd: string,
  itemDurationMinutes: number
): number {
  if (serviceCategory !== 'Hotel' || itemDurationMinutes <= 0) return 1;

  const totalMinutes =
    (new Date(scheduledEnd).getTime() - new Date(scheduledStart).getTime()) /
    60000;

  return Math.max(1, Math.round(totalMinutes / itemDurationMinutes));
}

async function resolveBookingItem(
  itemInput: CreateBookingInput['items'][number],
  pet: PetRow,
  petAssessed: boolean,
  serviceCategory: ServiceCategory,
  branchId: string,
  scheduledStart: string,
  scheduledEnd: string
): Promise<ResolvedBookingItem> {
  if ('service_id' in itemInput) {
    const service = await getServiceById(itemInput.service_id);

    if (!service.is_active) {
      throwWithStatus(400, `Service "${service.name}" is inactive`);
    }

    if (service.category !== serviceCategory) {
      throwWithStatus(
        400,
        `Service "${service.name}" does not match service_category`
      );
    }

    if (!petAssessed && service.requires_assessed_pet) {
      throwWithStatus(
        403,
        `This pet must be assessed by staff (weight class and coat type recorded onsite) before booking "${service.name}"`
      );
    }

    const durationMinutes = service.duration_minutes ?? 60;
    const quantity = resolveQuantity(
      serviceCategory,
      scheduledStart,
      scheduledEnd,
      durationMinutes
    );

    return {
      service_id: service.id,
      package_id: null,
      price_at_booking: round2(resolveServicePrice(service, pet) * quantity),
      duration_minutes_at_booking: durationMinutes,
    };
  }

  if (!petAssessed) {
    throwWithStatus(
      403,
      'This pet must be assessed by staff (weight class and coat type recorded onsite) before booking a package'
    );
  }

  const pkg = await getPackageById(itemInput.package_id);

  if (!pkg.is_active) {
    throwWithStatus(400, `Package "${pkg.name}" is inactive`);
  }

  if (pkg.branch_id !== branchId) {
    throwWithStatus(400, `Package "${pkg.name}" belongs to another branch`);
  }

  const memberServiceIds = (pkg.package_services ?? []).map(
    (link) => link.service_id
  );

  let memberDurationMinutes = 0;

  if (memberServiceIds.length > 0) {
    const { data: memberServices, error } = await supabase
      .from('services')
      .select('id, category, duration_minutes')
      .in('id', memberServiceIds);

    if (error) throwWithStatus(400, error.message);

    const rows = (memberServices ?? []) as Array<{
      id: string;
      category: ServiceCategory;
      duration_minutes: number | null;
    }>;

    const offCategory = rows.find((row) => row.category !== serviceCategory);
    if (offCategory) {
      throwWithStatus(
        400,
        `Package "${pkg.name}" includes services outside ${serviceCategory}`
      );
    }

    memberDurationMinutes = rows.reduce(
      (sum, row) => sum + (row.duration_minutes ?? 0),
      0
    );
  }

  const packageDurationMinutes = memberDurationMinutes || 60;
  const packageQuantity = resolveQuantity(
    serviceCategory,
    scheduledStart,
    scheduledEnd,
    packageDurationMinutes
  );

  return {
    service_id: null,
    package_id: pkg.id,
    price_at_booking: round2(Number(pkg.bundled_price) * packageQuantity),
    duration_minutes_at_booking: packageDurationMinutes,
  };
}

async function resolveBookingItems(
  items: CreateBookingInput['items'],
  pet: PetRow,
  petAssessed: boolean,
  serviceCategory: ServiceCategory,
  branchId: string,
  scheduledStart: string,
  scheduledEnd: string
): Promise<ResolvedBookingItem[]> {
  const resolved: ResolvedBookingItem[] = [];

  // Sequential, not Promise.all: each item may 400/403 with a message naming
  // that specific service/package, which reads clearer than an
  // out-of-order Promise.all rejection would.
  for (const item of items) {
    resolved.push(
      await resolveBookingItem(
        item,
        pet,
        petAssessed,
        serviceCategory,
        branchId,
        scheduledStart,
        scheduledEnd
      )
    );
  }

  return resolved;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function resolveBranchScope(
  branchId: string
): Promise<'makati' | 'southwoods'> {
  const { data, error } = await supabase
    .from('branches')
    .select('name')
    .eq('id', branchId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Branch not found');

  return data.name.toLowerCase() === 'makati' ? 'makati' : 'southwoods';
}

interface PromoCapRow {
  cap_type: 'percentage' | 'flat';
  cap_value: number;
}

/** Mirrors billing/discountPromoEvaluation.service.ts's identical helper -
 * duplicated rather than imported so the booking feature doesn't depend on
 * billing (billing already depends on booking, not the other way around). */
async function getPromoCapAmount(
  branchId: string,
  subtotal: number
): Promise<number> {
  const { data: branchRow, error: branchError } = await supabase
    .from('promo_cap_configuration')
    .select('cap_type, cap_value')
    .eq('branch_id', branchId)
    .maybeSingle();

  if (branchError) throwWithStatus(400, branchError.message);

  const capRow: PromoCapRow | null =
    branchRow ??
    (
      await supabase
        .from('promo_cap_configuration')
        .select('cap_type, cap_value')
        .is('branch_id', null)
        .maybeSingle()
    ).data;

  if (!capRow)
    throwWithStatus(500, 'No default promo cap configuration row exists');

  return capRow.cap_type === 'percentage'
    ? (subtotal * Number(capRow.cap_value)) / 100
    : Number(capRow.cap_value);
}

interface DiscountPromoResolution {
  selectedDiscountId: string | null;
  discountAmount: number;
  selectedPromoId: string | null;
  promoAmount: number;
}

/**
 * Applying a discount/promo at booking creation (rather than only at cashier
 * checkout) so the customer sees the real price upfront. A discount needs
 * staff physically present to verify a Senior Citizen/PWD ID, so it's
 * restricted to money-handling roles (BOOKING_MARK_PAID_ROLES, same set that
 * can Mark as Paid) and, since ID verification implies in-person payment, to
 * Cash bookings only. A promo has neither restriction - it's self-service,
 * like a coupon code. Locked in here, checkout later renders these stored
 * amounts as-is instead of re-evaluating scope matches itself (see
 * buildCheckoutPreview in checkoutAggregation.service.ts) - two independent
 * evaluations of the same rules could disagree and would be confusing to
 * reconcile at the register.
 */
async function resolveDiscountAndPromo(
  input: CreateBookingInput,
  staffRole: string | null,
  resolvedItems: ResolvedBookingItem[],
  totalPrice: number
): Promise<DiscountPromoResolution> {
  let selectedDiscountId: string | null = null;
  let discountAmount = 0;

  if (input.discount_id) {
    if (!staffRole || !BOOKING_MARK_PAID_ROLES.includes(staffRole)) {
      throwWithStatus(
        403,
        'Only money-handling staff may apply a discount (ID must be verified onsite)'
      );
    }

    if (input.payment_method !== 'Cash') {
      throwWithStatus(400, 'Discounts can only be applied to Cash bookings');
    }

    const discount = await getDiscountById(input.discount_id);

    if (!discount.is_active) {
      throwWithStatus(400, `Discount "${discount.name}" is inactive`);
    }

    if (discount.branch_id !== input.branch_id) {
      throwWithStatus(
        400,
        `Discount "${discount.name}" belongs to another branch`
      );
    }

    const scopeMatches =
      (discount.scope_type === 'service' &&
        resolvedItems.some(
          (item) => item.service_id === discount.scope_service_id
        )) ||
      (discount.scope_type === 'package' &&
        resolvedItems.some(
          (item) => item.package_id === discount.scope_package_id
        )) ||
      (discount.scope_type === 'category' &&
        discount.scope_category === input.service_category);

    if (!scopeMatches) {
      throwWithStatus(
        400,
        `Discount "${discount.name}" does not apply to the selected items`
      );
    }

    discountAmount = round2(
      discount.discount_type === 'Percentage'
        ? (totalPrice * Number(discount.value)) / 100
        : Math.min(Number(discount.value), totalPrice)
    );
    selectedDiscountId = discount.id;
  }

  let selectedPromoId: string | null = null;
  let promoAmount = 0;

  if (input.promo_id) {
    const promo = await getPromoById(input.promo_id);

    if (!promo.is_active) {
      throwWithStatus(400, `Promo "${promo.name}" is inactive`);
    }

    const today = new Date().toISOString().slice(0, 10);
    if (promo.start_date && promo.start_date > today) {
      throwWithStatus(400, `Promo "${promo.name}" has not started yet`);
    }
    if (promo.end_date && promo.end_date < today) {
      throwWithStatus(400, `Promo "${promo.name}" has ended`);
    }

    if (promo.branch_scope !== 'both') {
      const branchScope = await resolveBranchScope(input.branch_id);
      if (promo.branch_scope !== branchScope) {
        throwWithStatus(
          400,
          `Promo "${promo.name}" is not available at this branch`
        );
      }
    }

    const scopeMatches =
      promo.scope_type === 'all_services' ||
      (promo.promo_scope ?? []).some((scopeRow) =>
        resolvedItems.some(
          (item) =>
            (scopeRow.service_id && scopeRow.service_id === item.service_id) ||
            (scopeRow.package_id && scopeRow.package_id === item.package_id)
        )
      );

    if (!scopeMatches) {
      throwWithStatus(
        400,
        `Promo "${promo.name}" does not apply to the selected items`
      );
    }

    const rawAmount = round2(
      promo.discount_type === 'Percentage'
        ? (totalPrice * Number(promo.value)) / 100
        : Math.min(Number(promo.value), totalPrice)
    );
    const capAmount = await getPromoCapAmount(input.branch_id, totalPrice);

    promoAmount = Math.min(rawAmount, round2(capAmount));
    selectedPromoId = promo.id;
  }

  return { selectedDiscountId, discountAmount, selectedPromoId, promoAmount };
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

  const petAssessed = isPetAssessed(pet as PetRow);

  // #53: the actual enforcement boundary, before any capacity check.
  await assertVeterinaryBranchEligibility({
    branchId: input.branch_id,
    serviceCategory: input.service_category,
  });

  // Pricing snapshot from Epic A's catalog (services/packages lookups #40/#41),
  // one row per selected item (multi-item bookings revision).
  const resolvedItems = await resolveBookingItems(
    input.items,
    pet as PetRow,
    petAssessed,
    input.service_category,
    input.branch_id,
    input.scheduled_start,
    input.scheduled_end
  );

  const totalPrice = resolvedItems.reduce(
    (sum, item) => sum + item.price_at_booking,
    0
  );

  const downpaymentAmount =
    input.service_category === 'Hotel'
      ? Math.round(totalPrice * HOTEL_DOWNPAYMENT_RATE * 100) / 100
      : null;

  const { selectedDiscountId, discountAmount, selectedPromoId, promoAmount } =
    await resolveDiscountAndPromo(input, staffRole, resolvedItems, totalPrice);

  // Booking-status revision: there is no more payment gate on the initial
  // status - every booking starts 'Pending' and holds its capacity/staff-
  // time slot immediately (ACTIVE_BOOKING_STATUSES), regardless of category
  // or payment method. payment_confirmed is still recorded as data (it
  // drives the automatic Pending->...->Paid fast path once the service
  // completes - see completeBooking below), it just no longer gates status
  // at creation time.
  const paymentConfirmed =
    input.service_category === 'Veterinary'
      ? false
      : (input.payment_confirmed ?? false);
  const status: Booking['status'] = 'Pending';

  // Staff resolution (Grooming/Veterinary) happens before the generic
  // capacity check because for these categories staff availability IS the
  // capacity check.
  const staffResolution = await resolveStaffAssignment(input);

  if (
    input.service_category === 'Hotel' ||
    input.service_category === 'Daycare'
  ) {
    // The authoritative submission-time check - never skipped even though the
    // Slot Picker already ran the same check read-only (Guide #51). Hotel/
    // Daycare services are never assessment-exempt, so the petAssessed gate
    // above already guarantees weight_class is non-null here.
    const capacity = await checkCapacity({
      branchId: input.branch_id,
      serviceCategory: input.service_category,
      scheduledStart: input.scheduled_start,
      scheduledEnd: input.scheduled_end,
      petWeightClass: (pet as PetRow).weight_class!,
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
      scheduled_start: input.scheduled_start,
      scheduled_end: input.scheduled_end,
      assigned_staff_id: staffResolution.assignedStaffId,
      status,
      total_price: totalPrice,
      downpayment_amount: downpaymentAmount,
      payment_method: input.payment_method ?? null,
      payment_confirmed: paymentConfirmed,
      selected_discount_id: selectedDiscountId,
      selected_promo_id: selectedPromoId,
      discount_amount: discountAmount,
      promo_amount: promoAmount,
      special_instructions: input.special_instructions ?? null,
      hotel_preferences: input.hotel_preferences ?? null,
    })
    .select('*')
    .maybeSingle();

  if (insertError || !inserted) {
    throwWithStatus(400, insertError?.message ?? 'Failed to create booking');
  }

  const booking = inserted as Booking;

  const { error: itemsError } = await supabase.from('booking_items').insert(
    resolvedItems.map((item) => ({
      booking_id: booking.id,
      ...item,
    }))
  );

  if (itemsError) {
    await supabase.from('bookings').delete().eq('id', booking.id);
    throwWithStatus(400, itemsError.message);
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
  // the same capacity-taken error the flow diagram describes. Every booking
  // holds capacity from 'Pending' onward now (booking-status revision), so
  // this always runs, not just for a payment-confirmed booking.
  const won = await confirmCapacityAfterInsert(booking);

  if (!won) {
    await supabase.from('bookings').delete().eq('id', booking.id);
    throwWithStatus(
      409,
      'Capacity was taken between slot selection and payment — please select another slot'
    );
  }

  sendBookingCreatedNotificationStub(booking);

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

  const [withNoShow] = await applyNoShowTransition([booking]);
  return withNoShow;
}

export interface ListBookingsFilters {
  branchId?: string;
  /** YYYY-MM-DD, matched against scheduled_start's calendar date (UTC). */
  date?: string;
  /** Inclusive date-range bounds (UTC calendar dates) - either may be given
   * alone. Ignored when `date` is also given. */
  dateFrom?: string;
  dateTo?: string;
  serviceCategory?: ServiceCategory;
  status?: Booking['status'];
  /** A staff UUID (exact match), or the sentinel 'unassigned' for
   * assigned_staff_id IS NULL ("No preference" bookings that haven't been
   * auto-assigned yet). Bookings Queue's own "assigned to me / no
   * preference" filter - the client resolves "me" to the viewer's own id
   * before sending it, this layer only ever sees a concrete value. */
  assignedStaffId?: string;
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

  if (filters.assignedStaffId === 'unassigned') {
    query = query.is('assigned_staff_id', null);
  } else if (filters.assignedStaffId) {
    query = query.eq('assigned_staff_id', filters.assignedStaffId);
  }

  if (filters.date) {
    const dayStart = `${filters.date}T00:00:00.000Z`;
    const dayEnd = new Date(
      new Date(dayStart).getTime() + 24 * 60 * 60 * 1000
    ).toISOString();

    query = query
      .gte('scheduled_start', dayStart)
      .lt('scheduled_start', dayEnd);
  } else {
    if (filters.dateFrom) {
      query = query.gte('scheduled_start', `${filters.dateFrom}T00:00:00.000Z`);
    }

    if (filters.dateTo) {
      const exclusiveEnd = new Date(
        new Date(`${filters.dateTo}T00:00:00.000Z`).getTime() +
          24 * 60 * 60 * 1000
      ).toISOString();

      query = query.lt('scheduled_start', exclusiveEnd);
    }
  }

  const { data, error } = await query.order('scheduled_start', {
    ascending: true,
  });

  if (error) throwWithStatus(400, error.message);

  const withNoShow = await applyNoShowTransition((data ?? []) as Booking[]);

  // A row flipped to No-show by the lazy transition above may no longer
  // match an explicit status filter the caller asked for (e.g. "show me
  // Pending bookings") - re-filter rather than return a stale match.
  return filters.status
    ? withNoShow.filter((booking) => booking.status === filters.status)
    : withNoShow;
}

/**
 * No-show is a lazy, read-time transition - no cron/scheduled-job infra
 * exists in this app. Any Pending booking whose scheduled_start has already
 * passed is flipped to No-show the moment it's next read through
 * getBookingById/listBookings, matching "the label did not change from
 * pending to in-progress" as the definition of a no-show. A single bulk
 * update covers every stale row in the result set, not one query per row.
 */
async function applyNoShowTransition(bookings: Booking[]): Promise<Booking[]> {
  const now = new Date();
  const staleIds = bookings
    .filter(
      (booking) =>
        booking.status === 'Pending' &&
        new Date(booking.scheduled_start).getTime() < now.getTime()
    )
    .map((booking) => booking.id);

  if (staleIds.length === 0) return bookings;

  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'No-show', updated_at: now.toISOString() })
    .in('id', staleIds)
    .select(BOOKING_SELECT);

  if (error) throwWithStatus(400, error.message);

  const updatedById = new Map(
    ((data ?? []) as Booking[]).map((row) => [row.id, row])
  );

  return bookings.map((booking) => updatedById.get(booking.id) ?? booking);
}

interface AdvanceStatusParams {
  bookingId: string;
}

async function getRawBookingById(bookingId: string): Promise<Booking> {
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_SELECT)
    .eq('id', bookingId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Booking not found');

  return data as Booking;
}

async function updateBookingRow(
  bookingId: string,
  update: Record<string, unknown>
): Promise<Booking> {
  const { data, error } = await supabase
    .from('bookings')
    .update(update)
    .eq('id', bookingId)
    .select(BOOKING_SELECT)
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Failed to update booking');
  }

  return data as Booking;
}

/**
 * Manual Start action: Pending -> In Progress. Staff-only, enforced at the
 * route level (booking.routes.ts) - this function only checks the booking
 * is in a startable state, so it's also safely callable internally by a
 * category's own "the service physically began" trigger (Hotel/Daycare
 * check-in) without a second HTTP round-trip.
 */
export async function startBooking({
  bookingId,
}: AdvanceStatusParams): Promise<Booking> {
  const booking = await getRawBookingById(bookingId);

  if (booking.status !== 'Pending') {
    throwWithStatus(409, `A ${booking.status} booking cannot be started`);
  }

  const now = new Date().toISOString();
  return updateBookingRow(bookingId, {
    status: 'In Progress',
    started_at: now,
    updated_at: now,
  });
}

/**
 * Manual Complete action: In Progress -> Completed. When the booking was
 * already paid online (payment_method is GCash/Maya and payment_confirmed
 * is true), payment_stage is also auto-advanced straight to 'Paid' here -
 * the money was already collected before the service even started, so
 * there's no separate "Mark as Paid" click to wait for. Every pay-at-counter
 * booking (Cash/Card/Bank Transfer/Grabmart/Pickaroo, or an online booking
 * that was never actually confirmed) lands on Completed with payment_stage
 * left as-is, for a cashier to advance later via advancePaymentStage.
 */
export async function completeBooking({
  bookingId,
}: AdvanceStatusParams): Promise<Booking> {
  const booking = await getRawBookingById(bookingId);

  if (booking.status !== 'In Progress') {
    throwWithStatus(409, `A ${booking.status} booking cannot be completed`);
  }

  const now = new Date().toISOString();
  const onlinePrepaid =
    booking.payment_method !== null &&
    booking.payment_confirmed &&
    ONLINE_PAYMENT_METHODS.includes(booking.payment_method);

  return updateBookingRow(bookingId, {
    status: 'Completed',
    completed_at: now,
    ...(onlinePrepaid ? { payment_stage: 'Paid', paid_at: now } : {}),
    updated_at: now,
  });
}

interface OverrideStatusParams {
  bookingId: string;
  status: (typeof OVERRIDABLE_BOOKING_STATUSES)[number];
}

/**
 * Admin/Superadmin-only direct status set, forward OR backward - e.g.
 * undoing an accidental Complete back to In Progress. Route-gated to
 * BOOKING_STATUS_OVERRIDE_ROLES (booking.routes.ts); this function trusts
 * that gate and only reshapes the row itself. Unlike start/complete, this
 * never rejects based on the booking's current status - any of the three
 * overridable statuses can move to any other. Doesn't touch payment_stage
 * or paid_at at all - those move independently via
 * advancePaymentStage/overridePaymentStage now.
 *
 * started_at/completed_at are filled the first time a status is reached and
 * preserved on a later revisit (so reverting Completed -> In Progress ->
 * Completed again doesn't fabricate a new completed_at), but cleared once no
 * longer applicable (so reverting to In Progress drops a stale completed_at
 * that would otherwise misrepresent "already completed").
 */
export async function overrideBookingStatus({
  bookingId,
  status,
}: OverrideStatusParams): Promise<Booking> {
  const booking = await getRawBookingById(bookingId);
  const now = new Date().toISOString();

  const startedAt = status === 'Pending' ? null : (booking.started_at ?? now);
  const completedAt =
    status === 'Completed' ? (booking.completed_at ?? now) : null;

  return updateBookingRow(bookingId, {
    status,
    started_at: startedAt,
    completed_at: completedAt,
    updated_at: now,
  });
}

interface AdvancePaymentStageParams {
  bookingId: string;
  choice?: 'advance' | 'onsite';
}

/**
 * Manual "Advance" action for the payment_stage track - independent of
 * `status`'s own Pending -> In Progress -> Completed -> Paid lifecycle (see
 * PaymentStage's dev note in booking.types.ts). From Unpaid, the caller must
 * say whether this is an advance payment (money collected before the
 * service happens - moves to 'Paid in Advance') or a normal onsite payment
 * (collected once, in full - moves straight to 'Paid'). From 'Paid in
 * Advance', the only next step is settling the remaining balance, so no
 * choice is needed - it always advances straight to 'Paid'.
 */
export async function advancePaymentStage({
  bookingId,
  choice,
}: AdvancePaymentStageParams): Promise<Booking> {
  const booking = await getRawBookingById(bookingId);

  if (booking.payment_stage === 'Paid') {
    throwWithStatus(409, 'This booking is already fully paid');
  }

  let nextStage: PaymentStage;

  if (booking.payment_stage === 'Paid in Advance') {
    nextStage = 'Paid';
  } else if (choice === 'advance') {
    nextStage = 'Paid in Advance';
  } else if (choice === 'onsite') {
    nextStage = 'Paid';
  } else {
    throwWithStatus(
      400,
      'Specify whether this is an advance payment or a normal onsite payment'
    );
  }

  return updateBookingRow(bookingId, {
    payment_stage: nextStage,
    updated_at: new Date().toISOString(),
  });
}

interface OverridePaymentStageParams {
  bookingId: string;
  paymentStage: (typeof OVERRIDABLE_PAYMENT_STAGES)[number];
}

/** Admin/Superadmin-only direct set (forward or backward) - mirrors
 * overrideBookingStatus above, e.g. undoing an accidental Advance click.
 * Route-gated to BOOKING_STATUS_OVERRIDE_ROLES (booking.routes.ts); this
 * function trusts that gate. */
export async function overridePaymentStage({
  bookingId,
  paymentStage,
}: OverridePaymentStageParams): Promise<Booking> {
  return updateBookingRow(bookingId, {
    payment_stage: paymentStage,
    updated_at: new Date().toISOString(),
  });
}
