import type { Booking } from '../../../booking/booking.types';
import type { CheckInPayload } from '../../hotel.types';

/**
 * One-click check-in payload: send exactly what the customer captured at
 * booking time (`bookings.hotel_preferences`) and let the server do the
 * rest - auto-resolve the cage (the pet's weight-class size, first
 * Available one) and, when the booking named no medications, auto-fill
 * from the pet's current prescription (see
 * server/.../careInstructions.service.ts).
 *
 * The `hotel_preferences.*` shapes are field-for-field the same as the
 * check-in `*InstructionPayload` shapes, so they pass straight through.
 * Staff who need to review or correct any of this before checking in use
 * the row's "..." menu -> "View booking details" instead.
 */
export function buildQuickCheckInPayload(booking: Booking): CheckInPayload {
  const prefs = booking.hotel_preferences;

  return {
    booking_id: booking.id,
    feeding: prefs?.feeding ?? [],
    walking: prefs?.walking ?? [],
    playing: prefs?.playing ?? [],
    // Omitted (not []) when the booking named no medications, so the server
    // falls back to the pet's current prescription rather than recording an
    // empty medication list verbatim.
    medications:
      prefs && prefs.medications.length > 0 ? prefs.medications : undefined,
    notify_opt_in: false,
  };
}
