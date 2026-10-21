import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  createNotification,
  notifyStaffRoleAtBranch,
} from '../../notifications/services/notification.service.ts';
import {
  isPetAssessed,
  recomputeBookingPaymentStatus,
  resolveBookingItems,
  round2,
} from './booking.service.ts';
import { checkCapacity } from './capacity.service.ts';
import type { Booking } from '../booking.types.ts';

/** A booking can still be repriced while it hasn't been finished. */
const REPRICEABLE_STATUSES: readonly Booking['status'][] = [
  'Pending',
  'Late',
  'In Progress',
];

/** Who is told when the now-known cage size turns out to be full. */
const CAGE_ALERT_ROLES = ['Receptionist', 'Front Desk'];

type AssessedPet = Parameters<typeof isPetAssessed>[0] & { id: string };

interface WaitingItem {
  id: string;
  service_id: string | null;
  package_id: string | null;
  price_at_booking: number;
  duration_minutes_at_booking: number;
}

export interface AssessmentRepriceResult {
  /** Bookings moved from their estimate to the pet's real price. */
  repriced: Array<{ bookingId: string; totalPrice: number }>;
  /** Bookings that could not be repriced, and why - the assessment itself
   * still stands; staff sort these out by hand. */
  failed: Array<{ bookingId: string; reason: string }>;
}

function formatPeso(amount: number): string {
  return `PHP ${amount.toFixed(2)}`;
}

/** A zero-priced, zero-duration package row is the free package a long Hotel
 * stay was awarded (resolveFreePackageAward) - never repriced, it stays free. */
function isFreeAward(item: WaitingItem): boolean {
  return (
    item.package_id !== null &&
    Number(item.price_at_booking) === 0 &&
    item.duration_minutes_at_booking === 0
  );
}

async function repriceOne(booking: Booking, pet: AssessedPet): Promise<number> {
  const { data: itemRows, error: itemsError } = await supabase
    .from('booking_items')
    .select(
      'id, service_id, package_id, price_at_booking, duration_minutes_at_booking'
    )
    .eq('booking_id', booking.id);

  if (itemsError) throw new Error(itemsError.message);

  const items = (itemRows ?? []) as WaitingItem[];
  const priced = items.filter((item) => !isFreeAward(item));

  // The same pricing createBooking runs, now that the pet has a size and a
  // coat - so the result is exactly what an assessed pet would have paid.
  const resolved = await resolveBookingItems(
    priced.map((item) =>
      item.service_id
        ? { service_id: item.service_id }
        : { package_id: item.package_id as string }
    ),
    pet,
    true,
    booking.service_category,
    booking.branch_id,
    booking.scheduled_start,
    booking.scheduled_end,
    true,
    // Pay at checkout never gets the Hotel long-stay rate.
    !booking.pay_at_checkout
  );

  let totalPrice = 0;

  for (const [index, item] of priced.entries()) {
    const price = resolved[index].price_at_booking;
    totalPrice = round2(totalPrice + price);

    if (price !== Number(item.price_at_booking)) {
      const { error } = await supabase
        .from('booking_items')
        .update({ price_at_booking: price })
        .eq('id', item.id);

      if (error) throw new Error(error.message);
    }
  }

  const nowIso = new Date().toISOString();
  const owesNothing = totalPrice <= 0;

  // Guarded on the flag itself, so two saves of the same assessment racing
  // each other can only ever bill the booking once.
  const { data: claimed, error: updateError } = await supabase
    .from('bookings')
    .update({
      total_price: totalPrice,
      awaiting_assessment: false,
      updated_at: nowIso,
      ...(owesNothing ? { payment_status: 'Fully Paid', paid_at: nowIso } : {}),
    })
    .eq('id', booking.id)
    .eq('awaiting_assessment', true)
    .select('id')
    .maybeSingle();

  if (updateError) throw new Error(updateError.message);
  if (!claimed) return totalPrice; // Already repriced by a concurrent save.

  if (!owesNothing) {
    // The bill createBooking held back: one charge for the whole (real)
    // amount, for the cashier to collect at the counter.
    const { error: chargeError } = await supabase.rpc(
      'create_initial_booking_charge',
      {
        p_booking_id: booking.id,
        p_scheme: 'full',
        p_net_total: totalPrice,
        p_downpayment_amount: null,
      }
    );

    if (chargeError) throw new Error(chargeError.message);

    await recomputeBookingPaymentStatus(booking.id);
  }

  return totalPrice;
}

/** Hotel only: the booking reserved "any cage" while the pet had no size.
 * Now that it has one, say so if that size is full for the dates. */
async function alertIfCageSizeFull(booking: Booking, pet: AssessedPet) {
  if (booking.service_category !== 'Hotel' || !pet.weight_class) return;

  const capacity = await checkCapacity({
    branchId: booking.branch_id,
    serviceCategory: 'Hotel',
    scheduledStart: booking.scheduled_start,
    scheduledEnd: booking.scheduled_end,
    petWeightClass: pet.weight_class,
    excludeBookingId: booking.id,
  });

  if (capacity.available) return;

  for (const role of CAGE_ALERT_ROLES) {
    await notifyStaffRoleAtBranch({
      role,
      branchId: booking.branch_id,
      eventType: 'booking_confirmed',
      title: 'No cage of the right size for a Hotel booking',
      message: `This pet was just assessed as size ${pet.weight_class}, and every ${pet.weight_class}-size cage is taken for its Hotel dates. The booking was made before the pet's size was known - please arrange another cage.`,
      relatedBookingId: booking.id,
    });
  }
}

/**
 * Custom change (book before assessment, 20261013264): called when staff
 * record a pet's weight class and coat type. Every booking made for that pet
 * while it was unassessed (bookings.awaiting_assessment) holds only an
 * estimated price and no charge; this moves each one to the pet's real price
 * and posts its bill for the cashier, so payment can be taken at the counter.
 *
 * Never throws for a single booking's failure - the assessment that
 * triggered it has already been saved and must stand. Failures come back in
 * `failed` for the caller to report.
 */
export async function repriceBookingsAwaitingAssessment(
  petId: string
): Promise<AssessmentRepriceResult> {
  const result: AssessmentRepriceResult = { repriced: [], failed: [] };

  const { data: petRow, error: petError } = await supabase
    .from('pets')
    .select('id, customer_id, pet_type, weight_class, coat_type')
    .eq('id', petId)
    .maybeSingle();

  if (petError || !petRow) return result;

  const pet = petRow as AssessedPet;

  // Half an assessment (a weight but no coat yet) prices nothing.
  if (!isPetAssessed(pet)) return result;

  const { data: bookingRows, error: bookingsError } = await supabase
    .from('bookings')
    .select('*')
    .eq('pet_id', petId)
    .eq('awaiting_assessment', true)
    .in('status', REPRICEABLE_STATUSES);

  if (bookingsError) return result;

  for (const booking of (bookingRows ?? []) as Booking[]) {
    try {
      const totalPrice = await repriceOne(booking, pet);

      result.repriced.push({ bookingId: booking.id, totalPrice });

      await createNotification({
        recipientCustomerId: booking.customer_id,
        eventType: 'booking_confirmed',
        title: 'Your booking price is final',
        message: `Your pet has been assessed. The final price for your ${booking.service_category} booking is ${formatPeso(totalPrice)}, payable at the counter.`,
        relatedBookingId: booking.id,
      });

      await alertIfCageSizeFull(booking, pet);
    } catch (error) {
      result.failed.push({
        bookingId: booking.id,
        reason: (error as Error).message ?? 'Could not update this booking',
      });
    }
  }

  return result;
}
