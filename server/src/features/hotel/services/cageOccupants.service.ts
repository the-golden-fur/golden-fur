import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { CageOccupant, CageOccupantPayment } from '../hotel.types.ts';
import {
  DAYCARE_OVERDUE_FEE_PER_HOUR,
  DAYCARE_OVERDUE_GRACE_MINUTES,
} from '../../daycare/modules/daycareCharge.util.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface OccupantBookingRow {
  id: string;
  scheduled_end: string;
  payment_status: 'Pending' | 'Partially Paid' | 'Fully Paid';
  pay_at_checkout: boolean;
}

function occupantPayment(booking: OccupantBookingRow): CageOccupantPayment {
  if (booking.pay_at_checkout) return 'pay_at_checkout';
  if (booking.payment_status === 'Fully Paid') return 'paid';
  if (booking.payment_status === 'Partially Paid') return 'partially_paid';
  return 'unpaid';
}

interface ActiveStayRow {
  id: string;
  cage_id: string;
  stay_type: 'Hotel' | 'Daycare';
  booking_id: string | null;
  pet_id: string;
  check_in_at: string | null;
}

/**
 * Who is in each occupied cage at a branch, and when they're expected to
 * leave - for the Cage Occupancy page's checkout countdown. A cage is only
 * ever occupied by a checked-in pet (an Active `stays` row, Hotel or
 * Daycare), so that is the one source here: one entry per Active stay.
 *
 * expected_checkout_at is the booking's own scheduled_end, i.e. what was
 * entered when booking: Hotel's check-in + number of nights, Daycare's
 * start + number of hours. A walk-in Daycare session with no booking behind
 * it has no agreed pickup time, so it's null there.
 *
 * payment says how the stay is being paid for (see CageOccupant). A
 * pay-at-checkout booking's end time is only an estimate, so it carries no
 * overdue fee either - checkout bills the time actually stayed instead.
 */
export async function listCageOccupants(
  // null = every branch (a Superadmin's "All branches" view).
  branchId: string | null
): Promise<CageOccupant[]> {
  let staysQuery = supabase
    .from('stays')
    .select('id, cage_id, stay_type, booking_id, pet_id, check_in_at')
    .eq('status', 'Active');

  if (branchId) staysQuery = staysQuery.eq('branch_id', branchId);

  const { data: stayRows, error: staysError } = await staysQuery;

  if (staysError) throwWithStatus(400, staysError.message);

  const stays = (stayRows ?? []) as ActiveStayRow[];
  if (stays.length === 0) return [];

  const bookingIds = stays
    .map((stay) => stay.booking_id)
    .filter((id): id is string => id !== null);
  const bookingById = new Map<string, OccupantBookingRow>();

  if (bookingIds.length > 0) {
    const { data: bookingRows, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, scheduled_end, payment_status, pay_at_checkout')
      .in('id', bookingIds);

    if (bookingsError) throwWithStatus(400, bookingsError.message);

    for (const row of (bookingRows ?? []) as OccupantBookingRow[]) {
      bookingById.set(row.id, row);
    }
  }

  const { data: petRows, error: petsError } = await supabase
    .from('pets')
    .select('id, name, customer_id')
    .in('id', [...new Set(stays.map((stay) => stay.pet_id))]);

  if (petsError) throwWithStatus(400, petsError.message);

  const pets = (petRows ?? []) as Array<{
    id: string;
    name: string;
    customer_id: string | null;
  }>;
  const petById = new Map(pets.map((row) => [row.id, row]));

  const ownerIds = [
    ...new Set(
      pets
        .map((row) => row.customer_id)
        .filter((id): id is string => id !== null)
    ),
  ];
  const ownerNameById = new Map<string, string>();

  if (ownerIds.length > 0) {
    const { data: ownerRows, error: ownersError } = await supabase
      .from('customer_profiles')
      .select('id, full_name')
      .in('id', ownerIds);

    if (ownersError) throwWithStatus(400, ownersError.message);

    for (const row of (ownerRows ?? []) as Array<{
      id: string;
      full_name: string;
    }>) {
      ownerNameById.set(row.id, row.full_name);
    }
  }

  return stays.map((stay) => {
    const pet = petById.get(stay.pet_id);
    const booking = stay.booking_id
      ? (bookingById.get(stay.booking_id) ?? null)
      : null;
    const payment = booking ? occupantPayment(booking) : null;
    const chargesOverdueFee =
      stay.stay_type === 'Daycare' && payment !== 'pay_at_checkout';

    return {
      stay_id: stay.id,
      cage_id: stay.cage_id,
      pet_name: pet?.name ?? null,
      owner_name: pet?.customer_id
        ? (ownerNameById.get(pet.customer_id) ?? null)
        : null,
      service: stay.stay_type,
      booking_id: stay.booking_id,
      since: stay.check_in_at,
      expected_checkout_at: booking?.scheduled_end ?? null,
      overdue_fee_per_hour: chargesOverdueFee
        ? DAYCARE_OVERDUE_FEE_PER_HOUR
        : null,
      overdue_grace_minutes: chargesOverdueFee
        ? DAYCARE_OVERDUE_GRACE_MINUTES
        : null,
      payment,
    };
  });
}
