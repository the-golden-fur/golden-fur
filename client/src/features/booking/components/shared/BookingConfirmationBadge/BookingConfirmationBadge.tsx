import type { Booking, BookingConfirmationState } from '../../../booking.types';
import { deriveBookingConfirmationState } from '../../../bookingConfirmation';
import styles from './BookingConfirmationBadge.module.css';

interface BookingConfirmationBadgeProps {
  booking: Pick<
    Booking,
    | 'status'
    | 'payment_status'
    | 'booking_source'
    | 'service_category'
    | 'cancellation_reason'
  >;
}

const STATE_CLASSNAME: Record<BookingConfirmationState, keyof typeof styles> = {
  Unconfirmed: 'unconfirmed',
  Confirmed: 'confirmed',
  'In service': 'inService',
  Completed: 'completed',
  Expired: 'expired',
  Cancelled: 'cancelled',
  'No-show': 'noshow',
};

/**
 * The receptionist bookings queue's lifecycle pill - replaces
 * BookingStatusBadge on that page only. It folds `payment_stage` into the
 * label so an unpaid pencil booking reads as "Unconfirmed" instead of a
 * bare "Pending" the receptionist has to cross-reference against a separate
 * payment badge. Everywhere else (module execution UIs, etc.)
 * BookingStatusBadge stays - they care about the raw service lifecycle, not
 * whether the money is in. See deriveBookingConfirmationState.
 */
export function BookingConfirmationBadge({
  booking,
}: BookingConfirmationBadgeProps) {
  const state = deriveBookingConfirmationState(booking);
  return <span className={styles[STATE_CLASSNAME[state]]}>{state}</span>;
}
