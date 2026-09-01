import {
  DOWNPAYMENT_EXPIRED_CANCELLATION_REASON,
  type Booking,
  type BookingConfirmationState,
} from './booking.types';

type ConfirmationInput = Pick<
  Booking,
  | 'status'
  | 'payment_status'
  | 'booking_source'
  | 'service_category'
  | 'cancellation_reason'
>;

/**
 * Collapses a booking's independent `status`, `payment_stage` and
 * `booking_source` axes into the single lifecycle label the receptionist
 * queue speaks (see BookingConfirmationState). Deliberately derived, not
 * stored - a stored copy would drift from `payment_stage` the moment a
 * cashier records a payment.
 *
 * - Online + Pending + nobody has paid  -> Unconfirmed  (not a secured
 *   booking - no staff alert, can't be checked in yet)
 * - Pending otherwise (paid, walk-in, or Veterinary - which is priced
 *   during the visit, so there is nothing to collect up front)  -> Confirmed
 * - In Progress                          -> In service   (live in a module queue)
 * - Completed                            -> Completed
 * - Cancelled by the expiry sweep        -> Expired
 * - Cancelled otherwise                  -> Cancelled
 * - No-show                              -> No-show
 */
export function deriveBookingConfirmationState(
  booking: ConfirmationInput
): BookingConfirmationState {
  switch (booking.status) {
    case 'In Progress':
      return 'In service';
    case 'Completed':
      return 'Completed';
    case 'No-show':
      return 'No-show';
    case 'Cancelled':
      return booking.cancellation_reason ===
        DOWNPAYMENT_EXPIRED_CANCELLATION_REASON
        ? 'Expired'
        : 'Cancelled';
    case 'Pending':
    default: {
      const awaitingPayment =
        booking.booking_source === 'Online' &&
        booking.service_category !== 'Veterinary' &&
        booking.payment_status === 'Pending';
      return awaitingPayment ? 'Unconfirmed' : 'Confirmed';
    }
  }
}

/** Short helper text shown under an Unconfirmed row / on hover elsewhere. */
export const BOOKING_CONFIRMATION_HINT: Record<
  BookingConfirmationState,
  string
> = {
  Unconfirmed:
    "Not paid yet - this booking isn't secured. Staff aren't notified and it can't be checked in until a payment is recorded.",
  Confirmed: 'Payment recorded - ready to check in when the customer arrives.',
  'In service': 'Checked in - being handled on its service queue.',
  Completed: 'Service finished.',
  Expired: 'Auto-cancelled - the down payment was never paid in time.',
  Cancelled: 'Cancelled.',
  'No-show': 'The customer never arrived for this appointment.',
};
