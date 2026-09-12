import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';
import {
  sendBookingConfirmedNotification,
  sendCombinedBookingGroupConfirmedEmail,
  sendStaffAssignedNotification,
} from './bookingNotifications.service.ts';
import {
  createNotification,
  notifyStaffRoleAtBranch,
} from '../../notifications/services/notification.service.ts';
import type {
  Booking,
  BookingGroup,
  BookingSource,
  HotelBookingPreferences,
  PaymentScheme,
  ServiceCategory,
} from '../booking.types.ts';
import type { CreateBookingGroupInput } from '../modules/validators/booking.validator.ts';
import {
  assertVeterinarianTreatedCustomer,
  assertVeterinaryBranchEligibility,
} from './veterinaryEligibility.service.ts';
import {
  checkCapacity,
  confirmCapacityAfterInsert,
} from './capacity.service.ts';
import {
  assertMeetsBookingLeadTime,
  resolveEffectivePolicy,
} from './staffPicker.service.ts';
import {
  isCagePickerEnabled,
  verifyCagePreference,
} from './cagePicker.service.ts';
import {
  getBookingById,
  isPetAssessed,
  resolveBookingItems,
  resolveDiscountAndPromo,
  resolveFreePackageAward,
  resolveStaffAssignment,
  round2,
  type PetRow,
  type ResolvedBookingItem,
} from './booking.service.ts';

/** Mirrors booking.service.ts's own copy exactly - duplicated rather than
 * imported (it's a private module constant there) to keep this file's
 * dependency on booking.service.ts limited to its exported surface. */
const PAST_SLOT_GRACE_MS = 15 * 60_000;

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface CreateBookingGroupParams {
  requesterId: string;
  input: CreateBookingGroupInput;
}

type BookingGroupSubInput = CreateBookingGroupInput['bookings'][number];

interface ResolvedSubBooking {
  petId: string;
  serviceCategory: ServiceCategory;
  bookingSource: BookingSource;
  scheduledStart: string;
  scheduledEnd: string;
  resolvedItems: ResolvedBookingItem[];
  totalPrice: number;
  staffResolution: Awaited<ReturnType<typeof resolveStaffAssignment>>;
  preferredCageId: string | null;
  specialInstructions: string | null;
  hotelPreferences: HotelBookingPreferences | null;
  freePackageAward: Awaited<ReturnType<typeof resolveFreePackageAward>>;
}

/** In-request capacity guard (no analog in single-booking createBooking):
 * two sub-bookings in the SAME checkout can't be inserted yet (nothing is
 * written until every sub-booking has been resolved), so the DB-backed
 * checkCapacity/get_staff_availability calls run below can't see each
 * other's not-yet-inserted claim. This tracks "which staff/cage windows has
 * an earlier sub-booking in THIS request already claimed" so the second one
 * competing for the same slot is rejected before either is ever inserted,
 * rather than racing confirmCapacityAfterInsert after the fact (that
 * post-insert race is still the right tool against OTHER customers'
 * concurrent requests - this is purely about this one request's own
 * siblings). */
function claimWindowOrThrow(
  claims: Map<string, Array<{ start: number; end: number }>>,
  key: string,
  start: number,
  end: number,
  subjectLabel: 'staff' | 'cage' | 'pet',
  // How many overlapping claims this key may hold before the NEXT one is
  // rejected. 1 for cage/pet (never shareable); for staff it's
  // policy_configurations.max_concurrent_bookings_per_staff (20260908178),
  // so an admin who allows one groomer to take N pets at once doesn't get a
  // spurious in-request 409 that the DB-backed check would have let through.
  capacity = 1
): void {
  const existing = claims.get(key) ?? [];
  const overlapping = existing.filter(
    (window) => start < window.end && window.start < end
  );

  if (overlapping.length >= capacity) {
    const message =
      subjectLabel === 'pet'
        ? 'This pet already has another booking in this checkout at an overlapping time — please choose a different time for one of them'
        : `Two bookings in this checkout are competing for the same ${subjectLabel} slot — please choose a different time or ${
            subjectLabel === 'staff' ? 'staff member' : 'cage'
          } for one of them`;
    throwWithStatus(409, message);
  }

  claims.set(key, [...existing, { start, end }]);
}

/** Deletes every row this request created so far, in an order safe
 * regardless of the booking_groups<->bookings FK's own ON DELETE behavior:
 * member bookings first (their booking_items/staff_picker_preferences cascade
 * via `on delete cascade`, same as a single booking's own rollback), then the
 * group row itself. Best-effort - a failure here is logged, not thrown, so
 * it never masks the original error that triggered the rollback. */
async function rollbackBookingGroup(
  bookingGroupId: string | null,
  bookingIds: string[]
): Promise<void> {
  try {
    if (bookingIds.length > 0) {
      await supabase.from('bookings').delete().in('id', bookingIds);
    }
    if (bookingGroupId) {
      await supabase.from('booking_groups').delete().eq('id', bookingGroupId);
    }
  } catch (rollbackError) {
    // eslint-disable-next-line no-console
    console.error('bookingGroup rollback failed:', rollbackError);
  }
}

/**
 * Multi-booking checkout: creates SEVERAL independent `bookings` rows (each
 * its own pet/category/services/date-time/staff/cage) that share ONE
 * payment - one discount, one promo, one downpayment/payment-scheme
 * decision, one transaction (or downpayment+balance pair). Mirrors
 * createBooking's exact per-booking business rules (see booking.service.ts),
 * just resolved once per sub-booking and then combined for the
 * shared-payment decisions (discount/promo, downpayment, the initial
 * charge). See bookingGroup.service.spec.ts and the booking-capacity-agent
 * spec this was scaffolded from for the full step-by-step rationale.
 */
export async function createBookingGroup({
  requesterId,
  input,
}: CreateBookingGroupParams): Promise<{
  booking_group: BookingGroup;
  bookings: Booking[];
}> {
  const staffRole = await getStaffRoleOrNull(requesterId);

  // Step 1: customer/staff resolution - identical rule to createBooking.
  let customerId: string;
  let createdByStaffId: string | null = null;

  if (staffRole) {
    if (!input.customer_id) {
      throwWithStatus(
        400,
        'customer_id is required when staff create a booking group on behalf of a customer'
      );
    }

    customerId = input.customer_id;
    createdByStaffId = requesterId;

    // vet-bookings-queue-access: mirrors createBooking's own check - a
    // Veterinarian may only book a customer they've actually treated.
    if (staffRole === 'Veterinarian') {
      await assertVeterinarianTreatedCustomer({
        veterinarianId: requesterId,
        customerId,
      });
    }
  } else {
    if (input.customer_id && input.customer_id !== requesterId) {
      throwWithStatus(403, 'Customers can only create their own bookings');
    }

    customerId = requesterId;
  }

  // Resolved once, up front, off the group's single shared branch_id -
  // reused both for each Online sub-booking's own lead-time check inside the
  // loop below (step 2g - lead time is genuinely per-slot) and, after the
  // loop, for the once-per-group downpayment computation (step 5). Only
  // fetched at all when at least one sub-booking is Online - an all-Walk-in
  // group never needs it (mirrors createBooking's own Walk-in skip).
  const hasOnlineSubBooking = input.bookings.some(
    (sub) => (sub.booking_source ?? 'Online') !== 'Walk-in'
  );
  const policy = hasOnlineSubBooking
    ? await resolveEffectivePolicy(input.branch_id)
    : null;

  const resolvedSubBookings: ResolvedSubBooking[] = [];
  const claimedStaffWindows = new Map<
    string,
    Array<{ start: number; end: number }>
  >();
  const claimedCageWindows = new Map<
    string,
    Array<{ start: number; end: number }>
  >();
  // Same-pet self-conflict guard (mirrors claimedStaffWindows/
  // claimedCageWindows above) - keyed by pet_id rather than staff/cage id, so
  // one pet can never end up with two overlapping sub-bookings in the same
  // checkout regardless of category (Grooming + Daycare at the same time is
  // just as nonsensical as two Groomings). Server-side backstop for the
  // client's own SlotPicker exclusion (CustomerBookingFlowPage's
  // samePetBundleWindows) - scoped to Online sub-bookings only, same
  // walk-in exemption rationale as the client side.
  const claimedPetWindows = new Map<
    string,
    Array<{ start: number; end: number }>
  >();

  // Step 2: resolve every sub-booking's own pricing/eligibility/staff/cage,
  // in order. Nothing is inserted here - see step 7 onward.
  for (const subInput of input.bookings) {
    const resolved = await resolveSubBooking({
      subInput,
      branchId: input.branch_id,
      customerId,
      staffRole,
      policy,
      claimedStaffWindows,
      claimedCageWindows,
      claimedPetWindows,
    });

    resolvedSubBookings.push(resolved);
  }

  // Step 3/4: combined pricing, discount/promo resolved ONCE against the
  // flattened union of every sub-booking's resolved items.
  const combinedTotalPrice = resolvedSubBookings.reduce(
    (sum, sub) => sum + sub.totalPrice,
    0
  );
  const allResolvedItems = resolvedSubBookings.flatMap(
    (sub) => sub.resolvedItems
  );

  // A discount's 'category' scope only makes sense against a single
  // category - when the group's sub-bookings span more than one category,
  // this is left undefined so a category-scoped discount simply never
  // matches (fails safe) rather than arbitrarily picking one sub-booking's
  // category. 'service'/'package' scoped discounts are unaffected - they
  // already match against the flattened item list above.
  const subBookingCategories = new Set(
    resolvedSubBookings.map((sub) => sub.serviceCategory)
  );
  const uniformCategory =
    subBookingCategories.size === 1 ? [...subBookingCategories][0] : undefined;

  const { selectedDiscountId, discountAmount, selectedPromoId, promoAmount } =
    await resolveDiscountAndPromo(
      {
        branch_id: input.branch_id,
        discount_id: input.discount_id,
        promo_id: input.promo_id,
        service_category: uniformCategory,
      } as unknown as Parameters<typeof resolveDiscountAndPromo>[0],
      staffRole,
      allResolvedItems,
      combinedTotalPrice
    );

  const combinedNetTotal = round2(
    combinedTotalPrice - discountAmount - promoAmount
  );

  // Step 5: downpayment resolved ONCE, off the combined net total - skipped
  // entirely for an all-Walk-in group (no `policy` was even fetched).
  let downpaymentRequired = false;
  let downpaymentAmount: number | null = null;
  let downpaymentHoldHours = 24;

  if (policy) {
    downpaymentRequired = policy.downpayment_enabled;
    downpaymentHoldHours = policy.downpayment_hold_hours ?? 24;
    downpaymentAmount = downpaymentRequired
      ? round2(
          policy.downpayment_type === 'Percentage'
            ? combinedNetTotal * ((policy.downpayment_amount ?? 0) / 100)
            : Math.min(policy.downpayment_amount ?? 0, combinedNetTotal)
        )
      : null;
  }

  // Step 6: same "does this ever need a charge" / "fully-discounted, owes
  // nothing" rules as createBooking, generalized to the group - a
  // Veterinary-only group never gets an upfront charge at all (priced during
  // the visit), matching every one of its member bookings individually.
  const requiresUpfrontCharge = resolvedSubBookings.some(
    (sub) => sub.serviceCategory !== 'Veterinary'
  );
  const nothingOwed = requiresUpfrontCharge && combinedNetTotal <= 0;

  const holdsSlot = !downpaymentRequired;
  const downpaymentDueAt = holdsSlot
    ? null
    : new Date(
        Date.now() + downpaymentHoldHours * 60 * 60 * 1000
      ).toISOString();

  const paymentScheme: PaymentScheme =
    downpaymentRequired && input.payment_scheme === 'downpayment'
      ? 'downpayment'
      : 'full';

  const groupPaymentStatus = nothingOwed ? 'Fully Paid' : 'Pending';
  const nowIso = new Date().toISOString();

  // Step 7: insert the one booking_groups row this whole checkout shares.
  const { data: insertedGroup, error: groupInsertError } = await supabase
    .from('booking_groups')
    .insert({
      customer_id: customerId,
      branch_id: input.branch_id,
      created_by_staff_id: createdByStaffId,
      selected_discount_id: selectedDiscountId,
      selected_promo_id: selectedPromoId,
      discount_amount: discountAmount,
      promo_amount: promoAmount,
      net_total: combinedNetTotal,
      downpayment_amount: downpaymentAmount,
      downpayment_required: downpaymentRequired,
      downpayment_due_at: downpaymentDueAt,
      payment_status: groupPaymentStatus,
      ...(nothingOwed ? { paid_at: nowIso } : {}),
    })
    .select('*')
    .maybeSingle();

  if (groupInsertError || !insertedGroup) {
    throwWithStatus(
      400,
      groupInsertError?.message ?? 'Failed to create booking group'
    );
  }

  const bookingGroup = insertedGroup as BookingGroup;
  const insertedBookingIds: string[] = [];
  const insertedBookingRows: Booking[] = [];

  // Step 8/9: insert every sub-booking + its items/preferences, all-or-
  // nothing for the whole group.
  for (const sub of resolvedSubBookings) {
    const status: Booking['status'] =
      sub.bookingSource === 'Walk-in' ? 'In Progress' : 'Pending';

    const { data: insertedBooking, error: bookingInsertError } = await supabase
      .from('bookings')
      .insert({
        customer_id: customerId,
        pet_id: sub.petId,
        branch_id: input.branch_id,
        created_by_staff_id: createdByStaffId,
        service_category: sub.serviceCategory,
        booking_source: sub.bookingSource,
        scheduled_start: sub.scheduledStart,
        scheduled_end: sub.scheduledEnd,
        assigned_staff_id: sub.staffResolution.assignedStaffId,
        status,
        ...(sub.bookingSource === 'Walk-in' ? { started_at: nowIso } : {}),
        total_price: sub.totalPrice,
        booking_group_id: bookingGroup.id,
        // Discount/promo/downpayment now live only on booking_groups (see
        // its own dev note) - every grouped booking's own copies of these
        // columns are null/0/false.
        downpayment_amount: null,
        downpayment_required: false,
        downpayment_due_at: null,
        payment_status: groupPaymentStatus,
        ...(nothingOwed ? { paid_at: nowIso } : {}),
        payment_method: null,
        payment_confirmed: false,
        selected_discount_id: null,
        selected_promo_id: null,
        discount_amount: 0,
        promo_amount: 0,
        special_instructions: sub.specialInstructions,
        hotel_preferences: sub.hotelPreferences,
        preferred_cage_id: sub.preferredCageId,
      })
      .select('*')
      .maybeSingle();

    if (bookingInsertError || !insertedBooking) {
      await rollbackBookingGroup(bookingGroup.id, insertedBookingIds);
      throwWithStatus(
        400,
        bookingInsertError?.message ?? 'Failed to create booking'
      );
    }

    const booking = insertedBooking as Booking;
    insertedBookingIds.push(booking.id);
    insertedBookingRows.push(booking);

    const { error: itemsError } = await supabase.from('booking_items').insert(
      sub.resolvedItems.map((item) => ({
        booking_id: booking.id,
        service_id: item.service_id,
        package_id: item.package_id,
        price_at_booking: item.price_at_booking,
        duration_minutes_at_booking: item.duration_minutes_at_booking,
      }))
    );

    if (itemsError) {
      await rollbackBookingGroup(bookingGroup.id, insertedBookingIds);
      throwWithStatus(400, itemsError.message);
    }

    if (sub.staffResolution.preferenceType) {
      const { error: preferenceError } = await supabase
        .from('staff_picker_preferences')
        .insert({
          booking_id: booking.id,
          preference_type: sub.staffResolution.preferenceType,
          preferred_staff_id: sub.staffResolution.preferredStaffId,
          staff_picker_shown: sub.staffResolution.staffPickerShown,
        });

      if (preferenceError) {
        await rollbackBookingGroup(bookingGroup.id, insertedBookingIds);
        throwWithStatus(400, preferenceError.message);
      }
    }
  }

  // Step 10: post-insert race re-verification - all-or-nothing for the
  // whole group (downpayment, and therefore slot-holding, is a group-wide
  // decision: either every online sub-booking holds its slot, or none do).
  if (holdsSlot) {
    for (const booking of insertedBookingRows) {
      const won = await confirmCapacityAfterInsert(
        booking,
        policy?.max_concurrent_bookings_per_staff ?? 1
      );

      if (!won) {
        await rollbackBookingGroup(bookingGroup.id, insertedBookingIds);
        throwWithStatus(
          409,
          'Capacity was taken between slot selection and payment — please select another slot'
        );
      }
    }
  }

  // Step 11: confirmation notifications, per sub-booking, same rule as
  // createBooking (isConfirmedAtCreation). Email is collapsed to ONE combined
  // send for the whole cart unless the branch policy opts into per-booking
  // (booking_group_email_mode) - the per-booking in-app rows are written
  // either way. `policy` is null only for an all-Walk-in group, so resolve
  // the mode directly in that case.
  // `policy` is the full row whenever any sub-booking is Online; only an
  // all-Walk-in group leaves it null and needs a dedicated resolve here.
  const emailMode = (policy ?? (await resolveEffectivePolicy(input.branch_id)))
    .booking_group_email_mode;
  const combineGroupEmail = emailMode === 'combined';
  const confirmedAtCreation: Booking[] = [];

  for (let i = 0; i < insertedBookingRows.length; i += 1) {
    const booking = insertedBookingRows[i];
    const sub = resolvedSubBookings[i];
    const isConfirmedAtCreation =
      booking.booking_source === 'Walk-in' ||
      booking.service_category === 'Veterinary';

    if (isConfirmedAtCreation) {
      await sendBookingConfirmedNotification(booking, {
        skipEmail: combineGroupEmail,
      });
      confirmedAtCreation.push(booking);

      if (sub.staffResolution.preferenceType === 'specific') {
        await sendStaffAssignedNotification(booking);
      }
    }
  }

  if (combineGroupEmail && confirmedAtCreation.length > 0) {
    await sendCombinedBookingGroupConfirmedEmail(
      customerId,
      input.branch_id,
      confirmedAtCreation
    );
  }

  // Step 12: ONE initial charge for the whole group (best-effort - a
  // failure here must not undo the group).
  if (requiresUpfrontCharge && !nothingOwed && combinedNetTotal > 0) {
    try {
      const { error: chargeRpcError } = await supabase.rpc(
        'create_initial_booking_group_charge',
        {
          p_booking_group_id: bookingGroup.id,
          p_scheme: paymentScheme,
          p_net_total: combinedNetTotal,
          p_downpayment_amount:
            paymentScheme === 'downpayment' ? downpaymentAmount : null,
        }
      );
      if (chargeRpcError) throw new Error(chargeRpcError.message);
    } catch (chargeError) {
      // eslint-disable-next-line no-console
      console.error('create_initial_booking_group_charge failed:', chargeError);
    }
  }

  // Step 13: free-package-award notifications, per sub-booking that earned
  // one - not deduplicated across the group (mirrors createBooking, which
  // fires one set per awarding booking).
  for (let i = 0; i < insertedBookingRows.length; i += 1) {
    const booking = insertedBookingRows[i];
    const freePackageAward = resolvedSubBookings[i].freePackageAward;
    if (!freePackageAward) continue;

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

  // Step 14: return the group row plus every member booking, re-fetched
  // (via getBookingById, same as createBooking's own final line) so
  // booking_items/staff_picker_preferences are embedded.
  const bookings = await Promise.all(
    insertedBookingIds.map((bookingId) =>
      getBookingById({ requesterId, bookingId })
    )
  );

  return { booking_group: bookingGroup, bookings };
}

interface ResolveSubBookingParams {
  subInput: BookingGroupSubInput;
  branchId: string;
  customerId: string;
  staffRole: string | null;
  policy: Awaited<ReturnType<typeof resolveEffectivePolicy>> | null;
  claimedStaffWindows: Map<string, Array<{ start: number; end: number }>>;
  claimedCageWindows: Map<string, Array<{ start: number; end: number }>>;
  claimedPetWindows: Map<string, Array<{ start: number; end: number }>>;
}

/** One sub-booking's worth of createBooking's own pipeline (pet ownership ->
 * #53 guard -> pricing snapshot -> free-package award -> booking_source ->
 * (Online only) past-slot + lead-time -> staff/cage resolution -> the
 * in-request capacity guard -> the authoritative Hotel/Daycare capacity
 * check). Does NOT touch discount/promo or the downpayment policy - those
 * are resolved once, at the group level, by the caller after every
 * sub-booking has gone through this. Does NOT insert anything. */
async function resolveSubBooking({
  subInput,
  branchId,
  customerId,
  staffRole,
  policy,
  claimedStaffWindows,
  claimedCageWindows,
  claimedPetWindows,
}: ResolveSubBookingParams): Promise<ResolvedSubBooking> {
  const { data: petRow, error: petError } = await supabase
    .from('pets')
    .select('id, customer_id, pet_type, weight_class, coat_type')
    .eq('id', subInput.pet_id)
    .maybeSingle();

  if (petError) throwWithStatus(400, petError.message);
  if (!petRow) throwWithStatus(404, 'Pet not found');

  const pet = petRow as PetRow;

  if (pet.customer_id !== customerId) {
    throwWithStatus(403, 'Pet does not belong to this customer');
  }

  const petAssessed = isPetAssessed(pet);

  await assertVeterinaryBranchEligibility({
    branchId,
    serviceCategory: subInput.service_category,
  });

  const resolvedItems = await resolveBookingItems(
    subInput.items,
    pet,
    petAssessed,
    subInput.service_category,
    branchId,
    subInput.scheduled_start,
    subInput.scheduled_end
  );

  const freePackageAward = await resolveFreePackageAward({
    pet_id: subInput.pet_id,
    branch_id: branchId,
    service_category: subInput.service_category,
    items: subInput.items,
    scheduled_start: subInput.scheduled_start,
    scheduled_end: subInput.scheduled_end,
  } as unknown as Parameters<typeof resolveFreePackageAward>[0]);

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

  const bookingSource: BookingSource = subInput.booking_source ?? 'Online';

  if (bookingSource === 'Walk-in' && !staffRole) {
    throwWithStatus(403, 'Only staff may create a walk-in booking');
  }

  if (bookingSource === 'Online') {
    if (
      new Date(subInput.scheduled_start).getTime() <
      Date.now() - PAST_SLOT_GRACE_MS
    ) {
      throwWithStatus(
        422,
        'That time has already passed — please choose a later slot'
      );
    }

    // `policy` is only null when every sub-booking in the group is Walk-in
    // (see createBookingGroup) - an Online sub-booking here guarantees it
    // was fetched.
    await assertMeetsBookingLeadTime(
      policy!,
      subInput.scheduled_start,
      branchId
    );
  }

  const staffResolution = await resolveStaffAssignment({
    branch_id: branchId,
    service_category: subInput.service_category,
    scheduled_start: subInput.scheduled_start,
    scheduled_end: subInput.scheduled_end,
    staff_preference: subInput.staff_preference,
  } as unknown as Parameters<typeof resolveStaffAssignment>[0]);

  const preferredCageId =
    subInput.service_category === 'Hotel' &&
    subInput.cage_preference?.type === 'specific' &&
    (await isCagePickerEnabled(subInput.service_category))
      ? await verifyCagePreference(
          subInput.cage_preference.cage_id!,
          branchId,
          pet.pet_type,
          staffRole ? undefined : (pet.weight_class ?? undefined)
        )
      : null;

  const startMs = new Date(subInput.scheduled_start).getTime();
  const endMs = new Date(subInput.scheduled_end).getTime();

  // Same-pet self-conflict guard - Online sub-bookings only (mirrors the
  // client's own SlotPicker exclusion and this codebase's established
  // walk-in-gets-fewer-restrictions pattern: a receptionist walking a pet
  // through two services back-to-back on-site needs no guardrail here).
  if (bookingSource === 'Online') {
    claimWindowOrThrow(
      claimedPetWindows,
      subInput.pet_id,
      startMs,
      endMs,
      'pet'
    );
  }

  if (staffResolution.assignedStaffId) {
    // `policy` is only null for an all-Walk-in group (see createBookingGroup) -
    // those keep the strict capacity of 1; a receptionist bundling several
    // walk-ins onto one staff member at the same instant is already an
    // unusual case and the stricter guard is the safe default.
    claimWindowOrThrow(
      claimedStaffWindows,
      staffResolution.assignedStaffId,
      startMs,
      endMs,
      'staff',
      policy?.max_concurrent_bookings_per_staff ?? 1
    );
  }

  if (preferredCageId) {
    claimWindowOrThrow(
      claimedCageWindows,
      preferredCageId,
      startMs,
      endMs,
      'cage'
    );
  }

  if (
    subInput.service_category === 'Hotel' ||
    subInput.service_category === 'Daycare'
  ) {
    // The DB-backed check still matters for OTHER customers' existing
    // bookings - the in-request guard above only covers this request's own
    // not-yet-inserted siblings.
    const capacity = await checkCapacity({
      branchId,
      serviceCategory: subInput.service_category,
      scheduledStart: subInput.scheduled_start,
      scheduledEnd: subInput.scheduled_end,
      petWeightClass: pet.weight_class!,
    });

    if (!capacity.available) {
      throwWithStatus(409, capacity.reason ?? 'No capacity available');
    }
  }

  return {
    petId: subInput.pet_id,
    serviceCategory: subInput.service_category,
    bookingSource,
    scheduledStart: subInput.scheduled_start,
    scheduledEnd: subInput.scheduled_end,
    resolvedItems,
    totalPrice,
    staffResolution,
    preferredCageId,
    specialInstructions: subInput.special_instructions ?? null,
    hotelPreferences: subInput.hotel_preferences ?? null,
    freePackageAward,
  };
}
