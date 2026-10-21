import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getFixedPrice } from '../../maintenance/services/petTypePriceOverrides.service.ts';
import {
  longStayTermsAtBranch,
  type LongStayTerms,
} from '../../maintenance/utils/branchServicePrice.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * Custom change (Hotel long-stay rate, 20261013260): the long-stay deal that
 * governs a stay AFTER it has been booked - or null when none does, in which
 * case the caller keeps doing what it did before (an extension at the item's
 * own nightly rate, a late checkout at the flat placeholder fee).
 *
 * The long-stay rate only covers the nights booked up front. A night added
 * later - a stay extension, a late checkout, extra nights on a
 * pay-at-checkout stay - is `regularRate`, the service's ordinary price at
 * the booking's branch (PHP 850 in Makati, PHP 500 in Southwoods), however
 * long the stay was booked for.
 *
 * Null too for a pet whose type has a fixed price at this branch: booking
 * charges that pet the fixed price whatever the nights (resolveServicePrice),
 * so neither rate here is what its stay costs.
 */
export async function resolveLongStayTerms(
  serviceId: string | null,
  branchId: string,
  petId: string
): Promise<LongStayTerms | null> {
  if (!serviceId) return null;

  const { data: service, error: serviceError } = await supabase
    .from('services')
    .select(
      'category, base_price, long_stay_nightly_price, min_nights_for_free_package, service_branch_availability(branch_id, price_override, long_stay_price_override)'
    )
    .eq('id', serviceId)
    .maybeSingle();

  if (serviceError) throwWithStatus(400, serviceError.message);
  if (!service || (service as { category: string }).category !== 'Hotel') {
    return null;
  }

  const terms = longStayTermsAtBranch(
    service as Parameters<typeof longStayTermsAtBranch>[0],
    branchId
  );

  if (!terms) return null;

  const { data: pet, error: petError } = await supabase
    .from('pets')
    .select('pet_type')
    .eq('id', petId)
    .maybeSingle();

  if (petError) throwWithStatus(400, petError.message);

  const petType = (pet as { pet_type: string | null } | null)?.pet_type;

  if (petType && (await getFixedPrice(petType, branchId)) !== null) {
    return null;
  }

  return terms;
}

/**
 * The same, looked up from a booking: its pet, and the first of its service
 * items that carries a long-stay deal. Hotel is single-select, so there is
 * at most one. Used by Hotel checkout.
 */
export async function resolveBookingLongStayTerms(
  bookingId: string,
  branchId: string
): Promise<LongStayTerms | null> {
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('pet_id')
    .eq('id', bookingId)
    .maybeSingle();

  if (bookingError) throwWithStatus(400, bookingError.message);

  const petId = (booking as { pet_id: string } | null)?.pet_id;
  if (!petId) return null;

  const { data: items, error: itemsError } = await supabase
    .from('booking_items')
    .select('service_id')
    .eq('booking_id', bookingId);

  if (itemsError) throwWithStatus(400, itemsError.message);

  for (const item of (items ?? []) as Array<{ service_id: string | null }>) {
    const terms = await resolveLongStayTerms(item.service_id, branchId, petId);
    if (terms) return terms;
  }

  return null;
}
