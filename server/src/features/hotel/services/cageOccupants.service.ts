import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { CageOccupant } from '../hotel.types.ts';
import {
  DAYCARE_OVERDUE_FEE_PER_HOUR,
  DAYCARE_OVERDUE_GRACE_MINUTES,
} from '../../daycare/modules/daycareCharge.util.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
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
 */
export async function listCageOccupants(
  branchId: string
): Promise<CageOccupant[]> {
  const { data: stayRows, error: staysError } = await supabase
    .from('stays')
    .select('id, cage_id, stay_type, booking_id, pet_id, check_in_at')
    .eq('branch_id', branchId)
    .eq('status', 'Active');

  if (staysError) throwWithStatus(400, staysError.message);

  const stays = (stayRows ?? []) as ActiveStayRow[];
  if (stays.length === 0) return [];

  const bookingIds = stays
    .map((stay) => stay.booking_id)
    .filter((id): id is string => id !== null);
  const scheduledEndByBookingId = new Map<string, string>();

  if (bookingIds.length > 0) {
    const { data: bookingRows, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, scheduled_end')
      .in('id', bookingIds);

    if (bookingsError) throwWithStatus(400, bookingsError.message);

    for (const row of (bookingRows ?? []) as Array<{
      id: string;
      scheduled_end: string;
    }>) {
      scheduledEndByBookingId.set(row.id, row.scheduled_end);
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
      expected_checkout_at: stay.booking_id
        ? (scheduledEndByBookingId.get(stay.booking_id) ?? null)
        : null,
      overdue_fee_per_hour:
        stay.stay_type === 'Daycare' ? DAYCARE_OVERDUE_FEE_PER_HOUR : null,
      overdue_grace_minutes:
        stay.stay_type === 'Daycare' ? DAYCARE_OVERDUE_GRACE_MINUTES : null,
    };
  });
}
