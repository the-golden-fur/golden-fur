import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';
import {
  sendBookingConfirmedNotification,
  sendStaffAssignedNotification,
} from './bookingNotifications.service.ts';
import { getServiceById } from '../../maintenance/services/services.service.ts';
import { getPackageById } from '../../maintenance/services/packages.service.ts';
import { getPromoById } from '../../maintenance/services/promos.service.ts';
import { getDiscountById } from '../../discounts/services/discounts.service.ts';
import { getPricingConfiguration } from '../../maintenance/services/pricingConfiguration.service.ts';
import { deriveGroomingMatrix } from '../../maintenance/utils/deriveGroomingMatrix.ts';
import {
  createNotification,
  notifyStaffRoleAtBranch,
} from '../../notifications/services/notification.service.ts';
import {
  BOOKING_MARK_PAID_ROLES,
  DOWNPAYMENT_EXPIRED_CANCELLATION_REASON,
  ONLINE_PAYMENT_METHODS,
  OVERRIDABLE_BOOKING_STATUSES,
  OVERRIDABLE_PAYMENT_STAGES,
  type Booking,
  type BookingSource,
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
  assertMeetsNoticeLeadTime,
  autoAssignStaff,
  isStaffPickerEnabled,
  listAvailableStaff,
  resolveEffectivePolicy,
} from './staffPicker.service.ts';
import {
  isCagePickerEnabled,
  verifyCagePreference,
} from './cagePicker.service.ts';

const BOOKING_SELECT = '*, booking_items(*), staff_picker_preferences(*)';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

export interface PetRow {
  id: string;
  customer_id: string;
  pet_type: 'Dog' | 'Cat';
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
 * Custom change (pricing matrix fix): weight/coat-derived pricing is now
 * opt-in per service (`use_pricing_matrix`), not automatic for every
 * Grooming row - the board shows individual add-on services (Nail Trim,
 * Ear Cleaning, etc.) at one flat price regardless of size/coat, and only
 * Bath/Blow-dry/Brushing actually varying by size. Cats are always flat
 * regardless of the service's own flag - "Cat has no weight class or coat
 * type" (the board shows one flat Cat price, never a size/coat cell) - so a
 * Cat pet skips the tier lookup even for a matrix-enabled service.
 *
 * Grooming price is tiered by the pet's size/coat when a matching
 * service_pricing_tiers cell exists; base_price otherwise (and always for
 * the other categories, a non-matrix service, or a Cat).
 */
interface PriceableService {
  category: ServiceCategory;
  base_price: number;
  use_pricing_matrix: boolean;
  service_pricing_tiers?: Array<{
    weight_class: string;
    coat_type: string;
    price: number;
  }>;
}

export function resolveServicePrice(
  service: PriceableService,
  pet: PetRow
): number {
  if (
    service.category === 'Grooming' &&
    service.use_pricing_matrix &&
    pet.pet_type !== 'Cat'
  ) {
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

  const isAvailableAtBranch = (pkg.package_branch_availability ?? []).some(
    (row) => row.branch_id === branchId && row.is_available
  );

  if (!isAvailableAtBranch) {
    throwWithStatus(400, `Package "${pkg.name}" belongs to another branch`);
  }

  const memberServiceIds = (pkg.package_services ?? []).map(
    (link) => link.service_id
  );

  let memberDurationMinutes = 0;
  let memberRows: Array<{
    id: string;
    category: ServiceCategory;
    duration_minutes: number | null;
  }> = [];

  if (memberServiceIds.length > 0) {
    const { data: memberServices, error } = await supabase
      .from('services')
      .select('id, category, duration_minutes')
      .in('id', memberServiceIds);

    if (error) throwWithStatus(400, error.message);

    memberRows = (memberServices ?? []) as typeof memberRows;

    const offCategory = memberRows.find(
      (row) => row.category !== serviceCategory
    );
    if (offCategory) {
      throwWithStatus(
        400,
        `Package "${pkg.name}" includes services outside ${serviceCategory}`
      );
    }

    memberDurationMinutes = memberRows.reduce(
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

  const packagePrice = await resolvePackagePrice(pkg, pet);

  return {
    service_id: null,
    package_id: pkg.id,
    price_at_booking: round2(packagePrice * packageQuantity),
    duration_minutes_at_booking: packageDurationMinutes,
  };
}

/**
 * Custom change (package pricing redesign): matrix pricing now applies
 * directly to the *package's own* bundled_price, the same way a standalone
 * Grooming service's own base_price runs through deriveGroomingMatrix -
 * not by re-aggregating each member service's own per-pet price. A member
 * service's own `use_pricing_matrix` flag only governs that service when
 * it's booked on its own; once bundled into a package, only the package's
 * own flag applies. This replaced an earlier
 * per-member-aggregation design that required a member's own matrix flag
 * AND the package's own flag to agree before anything changed, which was
 * confusing in the admin package builder (a plain member "diluted" the
 * total, and toggling the package flag alone did nothing without a matrix
 * member already selected). Falls back to the flat `bundled_price` whenever
 * the package isn't matrix-enabled, and for a Cat pet regardless (mirrors
 * resolveServicePrice's own Cat exemption - the S/M/L/XL matrix is a dog
 * weight-class scale).
 */
export async function resolvePackagePrice(
  pkg: Pick<
    Awaited<ReturnType<typeof getPackageById>>,
    'bundled_price' | 'use_pricing_matrix'
  >,
  pet: PetRow
): Promise<number> {
  if (!pkg.use_pricing_matrix || pet.pet_type === 'Cat') {
    return Number(pkg.bundled_price);
  }

  const pricingConfiguration = await getPricingConfiguration();
  const cell = deriveGroomingMatrix(
    Number(pkg.bundled_price),
    pricingConfiguration
  ).find(
    (row) =>
      row.weight_class === pet.weight_class && row.coat_type === pet.coat_type
  );

  return cell?.price ?? Number(pkg.bundled_price);
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

interface FreePackageAward {
  packageId: string;
  packageName: string;
  nights: number;
}

/**
 * Custom change (Hotel fixed-price service + free package trigger): "when
 * nights # condition is reached... notify the customer and receptionist,
 * and update the booking receipt" (board: "5+ nights with free Golden
 * Package"). Hotel bookings are single-select (one service, per
 * CustomerBookingFlowPage), so the one Hotel service_id item in `items` (if
 * any) is checked against its own min_nights_for_free_package/
 * free_package_name. The package is resolved by name (not a direct FK) and
 * then checked against package_branch_availability for the booking's own
 * branch - packages are no longer one row per branch (see migration
 * 20260818134_custom_package_branch_availability.sql), so a name match alone
 * isn't enough to confirm it's actually offered at this branch.
 */
async function resolveFreePackageAward(
  input: CreateBookingInput
): Promise<FreePackageAward | null> {
  if (input.service_category !== 'Hotel') return null;

  const hotelServiceItem = input.items.find(
    (item): item is { service_id: string } => 'service_id' in item
  );
  if (!hotelServiceItem) return null;

  const service = await getServiceById(hotelServiceItem.service_id);
  if (!service.min_nights_for_free_package || !service.free_package_name) {
    return null;
  }

  const nights = resolveQuantity(
    input.service_category,
    input.scheduled_start,
    input.scheduled_end,
    service.duration_minutes ?? 1440
  );

  if (nights < service.min_nights_for_free_package) return null;

  // Custom change: a package name is no longer guaranteed unique to one
  // branch (that guarantee came from the old MA22 one-row-per-branch model),
  // so this can no longer assume at most one row matches by name alone -
  // fetch every same-named active package and pick the one actually
  // available at this booking's branch.
  const { data: candidates, error } = await supabase
    .from('packages')
    .select('id, name, package_branch_availability(branch_id, is_available)')
    .eq('name', service.free_package_name)
    .eq('is_active', true)
    .returns<
      Array<{
        id: string;
        name: string;
        package_branch_availability: {
          branch_id: string;
          is_available: boolean;
        }[];
      }>
    >();

  if (error || !candidates) return null;

  const pkg = candidates.find((candidate) =>
    (candidate.package_branch_availability ?? []).some(
      (row) => row.branch_id === input.branch_id && row.is_available
    )
  );

  if (!pkg) return null;

  return { packageId: pkg.id, packageName: pkg.name, nights };
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

    // Custom change (unify active/available): is_active is now fully
    // derived from branch availability (discounts.service.ts), so checking
    // it here would be redundant with the branch-specific check below -
    // "available at this branch" already implies "active" by construction.
    const isAvailableAtBranch = (
      discount.discount_branch_availability ?? []
    ).some((row) => row.branch_id === input.branch_id && row.is_available);

    if (!isAvailableAtBranch) {
      throwWithStatus(
        400,
        `Discount "${discount.name}" is not available at this branch`
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

    const isAvailableAtBranch = (promo.promo_branch_availability ?? []).some(
      (row) => row.branch_id === input.branch_id && row.is_available
    );

    if (!isAvailableAtBranch) {
      throwWithStatus(
        400,
        `Promo "${promo.name}" is not available at this branch`
      );
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
 *
 * Walk-in booking flow: `booking_source` ('Online', default, or 'Walk-in',
 * staff-only) branches two things - the down payment policy is skipped
 * entirely for a walk-in (no slot-holding risk, the customer/pet is already
 * physically present) and its initial status is 'In Progress' rather than
 * 'Pending'. The capacity/staff/cage assignment pipeline below is otherwise
 * identical for both - a walk-in still needs a real free slot right now, it
 * just isn't picked from a future calendar.
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

  // Walk-in booking flow: 'Walk-in' means the customer/pet is physically at
  // the branch right now, being registered on the spot by a receptionist -
  // mirrors the customer_id-requires-staff check above. Default is 'Online'
  // (unchanged behavior for every existing caller).
  const bookingSource: BookingSource = input.booking_source ?? 'Online';

  if (bookingSource === 'Walk-in' && !staffRole) {
    throwWithStatus(403, 'Only staff may create a walk-in booking');
  }

  const { data: pet, error: petError } = await supabase
    .from('pets')
    .select('id, customer_id, pet_type, weight_class, coat_type')
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

  const freePackageAward = await resolveFreePackageAward(input);

  if (freePackageAward) {
    resolvedItems.push({
      service_id: null,
      package_id: freePackageAward.packageId,
      price_at_booking: 0,
      duration_minutes_at_booking: 0,
    });
  }

  const totalPrice = resolvedItems.reduce(
    (sum, item) => sum + item.price_at_booking,
    0
  );

  // Discounts and promos are resolved BEFORE the down payment is computed
  // (advisor addendum: "Discounts and promos apply before downpayment is
  // calculated"). resolveDiscountAndPromo doesn't depend on the down
  // payment, so it runs first and the down payment is taken against the
  // discounted net total, not the gross sum of items.
  const { selectedDiscountId, discountAmount, selectedPromoId, promoAmount } =
    await resolveDiscountAndPromo(input, staffRole, resolvedItems, totalPrice);

  const netTotal = round2(totalPrice - discountAmount - promoAmount);

  // Custom change: downpayment moved from a per-catalog-item flag to a
  // single per-transaction policy_configurations config (20260828143),
  // applied once against the whole booking's discounted netTotal - see
  // resolveDownpaymentPolicy in staffPicker.service.ts.
  //
  // Down-payment slot gate (20260829146-148 + advisor addendum A1-A4): an
  // Online booking that requires a down payment and hasn't paid any of it
  // is a "pencil booking" - it sits Pending, holds NO slot (the capacity
  // filters exclude it), and auto-cancels after downpayment_hold_hours if
  // still unpaid (applyDownpaymentExpiry). An actual payment is what turns
  // it into a real, slot-holding reservation.
  //
  // Walk-in booking flow: a walk-in never touches the down payment policy or
  // the minimum-notice window (the customer/pet is physically present,
  // paying in full at the counter, #122).
  let downpaymentRequired = false;
  let downpaymentAmount: number | null = null;
  let downpaymentHoldHours = 24;

  if (bookingSource === 'Online') {
    // One effective-policy resolve feeds both the down-payment config and
    // the minimum-notice lead time (advisor addendum): an Online booking's
    // slot must sit at least notice_period_days out. This is the
    // authoritative gate behind the Slot Picker's own floored calendar - a
    // direct API call can't book inside the window.
    const policy = await resolveEffectivePolicy(input.branch_id);

    assertMeetsNoticeLeadTime(policy, input.scheduled_start);

    downpaymentRequired = policy.downpayment_enabled;
    downpaymentHoldHours = policy.downpayment_hold_hours ?? 24;
    downpaymentAmount = downpaymentRequired
      ? round2(
          policy.downpayment_type === 'Percentage'
            ? netTotal * ((policy.downpayment_amount ?? 0) / 100)
            : Math.min(policy.downpayment_amount ?? 0, netTotal)
        )
      : null;
  }

  // payment_confirmed is trusted only for a STAFF-created booking (a
  // receptionist collecting payment at the counter - a walk-in, or an
  // Online booking made on someone's behalf). A customer's own
  // self-service Online booking is never created pre-paid: they pay
  // afterward through the Pay flow (customerBookingPayment.service.ts), or
  // a cashier marks it paid on arrival. This is the down-payment slot
  // gate's enforcement point - an unpaid customer booking that requires a
  // down payment holds no slot (advisor addendum A1: no zero-payment slot
  // reservation).
  const paymentConfirmed =
    input.service_category === 'Veterinary'
      ? false
      : staffRole
        ? (input.payment_confirmed ?? false)
        : false;
  const status: Booking['status'] =
    bookingSource === 'Walk-in' ? 'In Progress' : 'Pending';

  // payment_stage at creation. A confirmed payment (staff collected it at
  // the counter, or an online method was actually charged) lands on 'Paid'
  // - or 'Paid in Advance' when only the down payment was taken. Everything
  // else falls through to the column default 'Unpaid', which is what makes
  // an unpaid Online booking read as "Unconfirmed" in the queue (see
  // deriveBookingConfirmationState) - no staff alert, not checkinable, until
  // a payment is recorded. Walk-ins and Veterinary (priced during the
  // visit) are never gated this way.
  const paymentStage: Booking['payment_stage'] | undefined = paymentConfirmed
    ? downpaymentRequired && input.payment_choice === 'downpayment'
      ? 'Paid in Advance'
      : 'Paid'
    : downpaymentRequired
      ? 'Unpaid'
      : undefined;

  // Whether this booking actually reserves its capacity/staff-time slot. A
  // down-payment-required Online booking still sitting fully Unpaid does
  // not - the capacity checks below are skipped for it, and it stays out
  // of every other booking's overlap count (capacity.service.ts /
  // get_staff_availability Check 2).
  const holdsSlot = !(downpaymentRequired && paymentStage === 'Unpaid');

  // Down-payment slot gate: the auto-cancel deadline, snapshotted from the
  // effective policy so a later policy change never moves an existing one.
  // Only a down-payment-required Online booking sitting Unpaid gets one.
  const downpaymentDueAt = holdsSlot
    ? null
    : new Date(
        Date.now() + downpaymentHoldHours * 60 * 60 * 1000
      ).toISOString();

  // Staff resolution (Grooming/Veterinary) happens before the generic
  // capacity check because for these categories staff availability IS the
  // capacity check.
  const staffResolution = await resolveStaffAssignment(input);

  // Cage preference (Hotel only, custom change) - advisory-only, so an
  // invalid/no-longer-available preference silently degrades to null rather
  // than rejecting the booking; check-in's own suggestCage/assignCage flow
  // re-validates and lets the receptionist re-pick regardless.
  //
  // Custom change (cage size booking restriction): a customer (no
  // staffRole) can only ever have a preference honored when it matches
  // their own pet's weight_class - mirrors CagePickerList's disabled tiles
  // client-side, enforced here too so a direct API call can't bypass it. A
  // staff-created (receptionist) booking passes no size restriction.
  const preferredCageId =
    input.service_category === 'Hotel' &&
    input.cage_preference?.type === 'specific' &&
    (await isCagePickerEnabled(input.service_category))
      ? await verifyCagePreference(
          input.cage_preference.cage_id!,
          input.branch_id,
          staffRole ? undefined : ((pet as PetRow).weight_class ?? undefined)
        )
      : null;

  if (
    holdsSlot &&
    (input.service_category === 'Hotel' || input.service_category === 'Daycare')
  ) {
    // The authoritative submission-time check - never skipped even though the
    // Slot Picker already ran the same check read-only (Guide #51). Hotel/
    // Daycare services are never assessment-exempt, so the petAssessed gate
    // above already guarantees weight_class is non-null here.
    //
    // Down-payment slot gate: skipped when !holdsSlot - an unpaid pencil
    // booking reserves nothing, so it neither consumes capacity nor is
    // blocked by a full slot (multiple customers may pencil-book the same
    // slot; whoever pays first reserves it - re-checked in
    // advancePaymentStage).
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
      booking_source: bookingSource,
      scheduled_start: input.scheduled_start,
      scheduled_end: input.scheduled_end,
      assigned_staff_id: staffResolution.assignedStaffId,
      status,
      // A walk-in is created directly at 'In Progress' (no separate Start
      // action will ever fire for it) - set started_at up front to match,
      // same as startBooking does for the online Pending -> In Progress
      // transition.
      ...(bookingSource === 'Walk-in'
        ? { started_at: new Date().toISOString() }
        : {}),
      total_price: totalPrice,
      downpayment_amount: downpaymentAmount,
      downpayment_required: downpaymentRequired,
      downpayment_due_at: downpaymentDueAt,
      ...(paymentStage ? { payment_stage: paymentStage } : {}),
      payment_method: input.payment_method ?? null,
      payment_confirmed: paymentConfirmed,
      selected_discount_id: selectedDiscountId,
      selected_promo_id: selectedPromoId,
      discount_amount: discountAmount,
      promo_amount: promoAmount,
      special_instructions: input.special_instructions ?? null,
      hotel_preferences: input.hotel_preferences ?? null,
      preferred_cage_id: preferredCageId,
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
      service_id: item.service_id,
      package_id: item.package_id,
      price_at_booking: item.price_at_booking,
      duration_minutes_at_booking: item.duration_minutes_at_booking,
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
  // the same capacity-taken error the flow diagram describes.
  //
  // Down-payment slot gate: skipped for a pencil booking (!holdsSlot) - it
  // reserves nothing, so it neither wins nor loses this race, and it would
  // in fact always "lose" here since the capacity queries now exclude it
  // (SLOT_HOLD_PAID_OR_FILTER). Its capacity is re-verified when it pays
  // (advancePaymentStage).
  if (holdsSlot) {
    const won = await confirmCapacityAfterInsert(booking);

    if (!won) {
      await supabase.from('bookings').delete().eq('id', booking.id);
      throwWithStatus(
        409,
        'Capacity was taken between slot selection and payment — please select another slot'
      );
    }
  }

  // An unpaid Online booking is "Unconfirmed" (see
  // deriveBookingConfirmationState) - it isn't a secured appointment yet, so
  // neither the customer's "booking confirmed" alert nor the assigned
  // staff's "you were picked" alert fires here. Both are sent instead when a
  // payment is recorded (advancePaymentStage). Walk-ins and Veterinary
  // (priced during the visit) are confirmed on creation as before.
  const isConfirmedAtCreation =
    bookingSource === 'Walk-in' ||
    input.service_category === 'Veterinary' ||
    paymentConfirmed;

  if (isConfirmedAtCreation) {
    await sendBookingConfirmedNotification(booking);

    if (staffResolution.preferenceType === 'specific') {
      await sendStaffAssignedNotification(booking);
    }
  }

  if (freePackageAward) {
    // Reuses the 'booking_confirmed' event type rather than adding a ninth
    // (notifications.types.ts documents the enum as "exact 8 values per
    // Modules-Features") - this notification is itself an update to the
    // just-confirmed Hotel booking, so the existing event type already fits.
    const message = `${freePackageAward.nights}+ nights unlocked a free ${freePackageAward.packageName} for this stay.`;

    await createNotification({
      recipientCustomerId: booking.customer_id,
      eventType: 'booking_confirmed',
      title: 'Free package unlocked!',
      message,
      relatedBookingId: booking.id,
    });

    await notifyStaffRoleAtBranch({
      role: 'Receptionist',
      branchId: booking.branch_id,
      eventType: 'booking_confirmed',
      title: 'Free package unlocked for a Hotel booking',
      message: `${message} (Booking ${booking.id})`,
      relatedBookingId: booking.id,
    });
  }

  return getBookingById({ requesterId, bookingId: booking.id });
}

/** Custom change: duplicate-booking prevention at pet selection - "still
 * not resolved" means either the booking hasn't finished yet (Pending/In
 * Progress), or it finished but was never paid for (Completed with
 * payment_stage still 'Unpaid' - see UNPAID_CONFLICT_STATUS below). This is
 * still deliberately narrower than ACTIVE_BOOKING_STATUSES (which also
 * includes 'Completed' unconditionally, for the staff-availability overlap
 * check's own different purpose): a *paid* Completed booking means the
 * service already happened and was settled, so the pet is free to be
 * booked again. Cancelled/No-show bookings never block, regardless of
 * payment_stage - no service was rendered on them and nothing is owed. */
const UNRESOLVED_BOOKING_STATUSES: readonly Booking['status'][] = [
  'Pending',
  'In Progress',
];

/** A Completed booking only conflicts when it's also still Unpaid - see
 * UNRESOLVED_BOOKING_STATUSES above. Queried alongside those statuses so
 * listPetBookingConflicts can apply the payment_stage check itself. */
const UNPAID_CONFLICT_STATUS: Booking['status'] = 'Completed';

interface PetBookingConflictsParams {
  requesterId: string;
  customerId: string;
}

export interface PetBookingConflict {
  pet_id: string;
  booking_id: string;
  service_category: Booking['service_category'];
  scheduled_start: string;
}

/**
 * Custom change: which of a customer's pets currently have an unresolved
 * booking (any category, not just Hotel/Daycare - live feedback after
 * duplicate Grooming bookings for the same pet/time slipped through the
 * original Hotel/Daycare-only version) - the booking flow's pet-selection
 * step (both customer self-service and staff-assisted, since both use the
 * same CustomerBookingFlowPage) disables a flagged pet, and clicking it
 * offers a way to go manage the existing booking instead. Category isn't
 * chosen until a later step, so this can't scope to "the same category
 * being booked now" - it's deliberately category-agnostic. One conflict
 * per pet (the earliest-scheduled unresolved booking) is enough to block
 * selection and to link to.
 */
export async function listPetBookingConflicts({
  requesterId,
  customerId,
}: PetBookingConflictsParams): Promise<PetBookingConflict[]> {
  if (customerId !== requesterId) {
    const staffRole = await getStaffRoleOrNull(requesterId);
    if (!staffRole) {
      throwWithStatus(403, 'Forbidden');
    }
  }

  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, pet_id, service_category, scheduled_start, status, payment_stage'
    )
    .eq('customer_id', customerId)
    .in('status', [...UNRESOLVED_BOOKING_STATUSES, UNPAID_CONFLICT_STATUS])
    .order('scheduled_start', { ascending: true });

  if (error) throwWithStatus(400, error.message);

  const conflictByPetId = new Map<string, PetBookingConflict>();

  for (const row of (data ?? []) as Array<{
    id: string;
    pet_id: string;
    service_category: Booking['service_category'];
    scheduled_start: string;
    status: Booking['status'];
    payment_stage: PaymentStage;
  }>) {
    const isUnresolved =
      UNRESOLVED_BOOKING_STATUSES.includes(row.status) ||
      (row.status === UNPAID_CONFLICT_STATUS && row.payment_stage === 'Unpaid');
    if (!isUnresolved) continue;
    if (conflictByPetId.has(row.pet_id)) continue;
    conflictByPetId.set(row.pet_id, {
      pet_id: row.pet_id,
      booking_id: row.id,
      service_category: row.service_category,
      scheduled_start: row.scheduled_start,
    });
  }

  return [...conflictByPetId.values()];
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

  const [withExpiry] = await applyDownpaymentExpiry([booking]);
  const [withNoShow] = await applyNoShowTransition([withExpiry]);
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
  /** Custom change (bookings/payments queue paid/unpaid filter) - exact
   * match against payment_stage, independent of `status` above (see
   * PaymentStage's own dev note in booking.types.ts). */
  paymentStage?: Booking['payment_stage'];
  /** A staff UUID (exact match), or the sentinel 'unassigned' for
   * assigned_staff_id IS NULL ("No preference" bookings that haven't been
   * auto-assigned yet). Bookings Queue's own "assigned to me / no
   * preference" filter - the client resolves "me" to the viewer's own id
   * before sending it, this layer only ever sees a concrete value. */
  assignedStaffId?: string;
  /** Custom change (P-1 roadmap item: generic downpayment) - opt-in, used
   * only by the Hotel/Daycare check-in queue pickers (HotelBookingPicker/
   * DaycareBookingPicker) to exclude a Pending/In Progress booking whose
   * downpayment hasn't been paid yet. Left off for every other caller
   * (customer's own bookings list, the receptionist bookings queue, the
   * payments queue) - those need to keep showing an unpaid booking so it can
   * actually be paid. Mirrors the same predicate grooming.service.ts/
   * consultation.service.ts apply directly. */
  excludeUnpaidDownpayment?: boolean;
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

  if (filters.paymentStage) {
    query = query.eq('payment_stage', filters.paymentStage);
  }

  if (filters.assignedStaffId === 'unassigned') {
    query = query.is('assigned_staff_id', null);
  } else if (filters.assignedStaffId) {
    query = query.eq('assigned_staff_id', filters.assignedStaffId);
  }

  if (filters.excludeUnpaidDownpayment) {
    query = query.or('downpayment_required.eq.false,payment_stage.neq.Unpaid');
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

  const withExpiry = await applyDownpaymentExpiry((data ?? []) as Booking[]);
  const withNoShow = await applyNoShowTransition(withExpiry);

  // A row flipped to No-show / Cancelled by a lazy transition above may no
  // longer match an explicit status filter the caller asked for (e.g.
  // "show me Pending bookings") - re-filter rather than return a stale
  // match.
  return filters.status
    ? withNoShow.filter((booking) => booking.status === filters.status)
    : withNoShow;
}

/**
 * Down-payment slot gate (advisor addendum A4): an unpaid,
 * down-payment-required Online booking auto-cancels once its
 * `downpayment_due_at` passes. Lazy, read-time - same rationale and bulk-
 * update shape as applyNoShowTransition (no cron infra exists in this app).
 * Runs BEFORE the no-show pass so an expired-and-never-paid booking reads
 * as Cancelled ("down payment not received"), not No-show. The slot itself
 * was never held while the booking was unpaid, so this only tidies the
 * dead row + lets the customer be notified.
 */
async function applyDownpaymentExpiry(bookings: Booking[]): Promise<Booking[]> {
  const now = new Date();
  const expiredIds = bookings
    .filter(
      (booking) =>
        booking.status === 'Pending' &&
        booking.downpayment_required &&
        booking.payment_stage === 'Unpaid' &&
        booking.downpayment_due_at !== null &&
        new Date(booking.downpayment_due_at).getTime() < now.getTime()
    )
    .map((booking) => booking.id);

  if (expiredIds.length === 0) return bookings;

  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'Cancelled',
      cancelled_at: now.toISOString(),
      cancellation_reason: DOWNPAYMENT_EXPIRED_CANCELLATION_REASON,
      updated_at: now.toISOString(),
    })
    .in('id', expiredIds)
    .select(BOOKING_SELECT);

  if (error) throwWithStatus(400, error.message);

  const updatedById = new Map(
    ((data ?? []) as Booking[]).map((row) => [row.id, row])
  );

  return bookings.map((booking) => updatedById.get(booking.id) ?? booking);
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
 *
 * Confirmation-status gate: an unpaid Online booking is "Unconfirmed" - not
 * a secured appointment. Checking it in would strand it In Progress,
 * invisible to its own module queue (which excludes unpaid rows) and no
 * longer swept by applyDownpaymentExpiry. Record the payment first
 * (Payments Queue). Veterinary is exempt - it's priced during the visit,
 * so there's nothing to collect before the consultation starts.
 */
export async function startBooking({
  bookingId,
}: AdvanceStatusParams): Promise<Booking> {
  const booking = await getRawBookingById(bookingId);

  if (booking.status !== 'Pending') {
    throwWithStatus(409, `A ${booking.status} booking cannot be started`);
  }

  if (
    booking.booking_source === 'Online' &&
    booking.service_category !== 'Veterinary' &&
    booking.payment_stage === 'Unpaid'
  ) {
    throwWithStatus(
      409,
      "This booking hasn't been paid yet, so it can't be checked in. Record the payment on the Payments Queue first."
    );
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
  // Custom change (P-1 roadmap item: generic downpayment): a booking
  // already sitting at 'Paid in Advance' only had its downpayment collected
  // online (createBooking's payment_choice === 'downpayment' path) - the
  // remaining balance is still owed, so this fast path must not blindly
  // re-advance it straight to 'Paid'. Every other booking (payment_stage
  // still 'Unpaid' here, same as before this feature existed) is unaffected.
  const onlinePrepaid =
    booking.payment_stage !== 'Paid in Advance' &&
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
  /** The staff member recording the payment at the counter. Set for the
   * Payments Queue "Mark as Paid" action - a transactions row is written for
   * that payment. Omitted for the PayMongo webhook path, which already has
   * its own transactions row from payForBooking. */
  processedByStaffId?: string | null;
}

/**
 * Records one payment against a booking - a transactions row plus a single
 * matching line item (keeping SUM(line_total) = total_amount). One row per
 * payment event so the Payments Queue and Transaction History show the
 * down payment, the balance, or a full payment separately, each linked to
 * the booking. Best-effort: a failure here is logged by the caller, never
 * blocks the payment-stage advance.
 */
async function recordBookingPaymentTransaction(params: {
  booking: Booking;
  fromStage: PaymentStage;
  toStage: PaymentStage;
  processedByStaffId: string | null;
}): Promise<void> {
  const { booking, fromStage, toStage, processedByStaffId } = params;

  const netTotal = round2(
    booking.total_price - booking.discount_amount - booking.promo_amount
  );
  const downpayment = round2(booking.downpayment_amount ?? 0);

  let amount: number;
  let paymentChoice: 'downpayment' | 'full';
  let description: string;

  if (fromStage === 'Unpaid' && toStage === 'Paid in Advance') {
    amount = downpayment;
    paymentChoice = 'downpayment';
    description = 'Down payment';
  } else if (fromStage === 'Paid in Advance' && toStage === 'Paid') {
    amount = round2(netTotal - downpayment);
    paymentChoice = 'full';
    description = 'Remaining balance';
  } else {
    amount = netTotal;
    paymentChoice = 'full';
    description = 'Full payment';
  }

  if (amount <= 0) return;

  const { data: transaction, error } = await supabase
    .from('transactions')
    .insert({
      booking_id: booking.id,
      customer_id: booking.customer_id,
      branch_id: booking.branch_id,
      transaction_type: 'booking_payment',
      payment_method: booking.payment_method ?? 'Cash',
      payment_status: toStage === 'Paid' ? 'Fully Paid' : 'Partially Paid',
      subtotal_amount: amount,
      total_amount: amount,
      payment_choice: paymentChoice,
      processed_by_staff_id: processedByStaffId,
    })
    .select('id')
    .single();

  if (error || !transaction) {
    throw new Error(error?.message ?? 'Failed to record the payment');
  }

  const { error: lineError } = await supabase
    .from('transaction_line_items')
    .insert({
      transaction_id: transaction.id,
      line_item_type: 'service',
      description,
      quantity: 1,
      unit_price: amount,
      line_total: amount,
    });

  if (lineError) throw new Error(lineError.message);
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
  processedByStaffId,
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

  const nowIso = new Date().toISOString();
  const updated = await updateBookingRow(bookingId, {
    payment_stage: nextStage,
    ...(nextStage === 'Paid' ? { paid_at: nowIso } : {}),
    updated_at: nowIso,
  });

  // Down-payment slot gate: a down-payment-required booking that was still
  // Unpaid held NO slot (capacity.service.ts / get_staff_availability
  // exclude it). Paying it now turns it into a real reservation - so
  // re-verify capacity, exactly as createBooking does post-insert. If the
  // slot filled with paid bookings while this one sat unpaid, revert the
  // payment stage and reject: the money hasn't actually been taken here
  // (the cashier/webhook is about to), and the customer must reschedule.
  if (
    booking.payment_stage === 'Unpaid' &&
    booking.downpayment_required &&
    (updated.status === 'Pending' || updated.status === 'In Progress') &&
    !(await confirmCapacityAfterInsert(updated))
  ) {
    await updateBookingRow(bookingId, {
      payment_stage: 'Unpaid',
      updated_at: new Date().toISOString(),
    });
    throwWithStatus(
      409,
      'That time slot filled up before this payment - please reschedule the booking to an open slot'
    );
  }

  // Best-effort payment record + confirmation alerts - neither should ever
  // undo a payment the cashier just took, so a failure is logged, not
  // thrown. The transaction row is only written for the staff "Mark as
  // Paid" path (processedByStaffId set); the webhook path already has one.
  try {
    if (processedByStaffId != null) {
      await recordBookingPaymentTransaction({
        booking: updated,
        fromStage: booking.payment_stage,
        toStage: nextStage,
        processedByStaffId,
      });
    }

    // The first payment on a still-Pending Online booking is what
    // "confirms" it - fire the alerts createBooking held back while it was
    // Unconfirmed (customer "booking confirmed", plus the assigned staff's
    // "you were picked" when the customer chose them specifically).
    if (
      booking.payment_stage === 'Unpaid' &&
      updated.status === 'Pending' &&
      updated.booking_source === 'Online'
    ) {
      await sendBookingConfirmedNotification(updated);

      const preferences = Array.isArray(updated.staff_picker_preferences)
        ? updated.staff_picker_preferences
        : updated.staff_picker_preferences
          ? [updated.staff_picker_preferences]
          : [];
      if (
        preferences.some(
          (preference) => preference?.preference_type === 'specific'
        )
      ) {
        await sendStaffAssignedNotification(updated);
      }
    }
  } catch (error) {
    console.error(
      'advancePaymentStage post-update side effects failed:',
      error
    );
  }

  return updated;
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
