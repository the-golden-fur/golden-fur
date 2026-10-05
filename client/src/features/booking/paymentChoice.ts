import type {
  BookingSource,
  PaymentScheme,
  ServiceCategory,
} from './booking.types';

interface PayAtCheckoutInput {
  /** The staff New Booking page - never the customer portal. */
  isStaff: boolean;
  /** The branch's policy_configurations.pay_at_checkout_enabled. */
  enabled: boolean;
  bookings: ReadonlyArray<{
    category: ServiceCategory | '';
    bookingSource: BookingSource;
  }>;
}

/**
 * Whether the Review step offers "Pay at checkout". Mirrors the server's own
 * rule (createBooking / createBookingGroup): staff only, the branch allows
 * it, and every booking in the checkout is a Walk-in Hotel or Daycare
 * booking - the two categories billed by the time the pet actually stays.
 */
export function isPayAtCheckoutAvailable({
  isStaff,
  enabled,
  bookings,
}: PayAtCheckoutInput): boolean {
  return (
    isStaff &&
    enabled &&
    bookings.length > 0 &&
    bookings.every(
      (booking) =>
        booking.bookingSource === 'Walk-in' &&
        (booking.category === 'Hotel' || booking.category === 'Daycare')
    )
  );
}

/**
 * The payment scheme actually in effect for a remembered choice. The choice
 * outlives the options it was made from (the list can change after it was
 * picked - a booking switched to Online, a Grooming booking added), so a
 * choice no longer on offer falls back to full payment instead of being
 * submitted.
 */
export function resolvePaymentChoice(
  choice: PaymentScheme,
  options: { downpaymentRequired: boolean; payAtCheckoutAvailable: boolean }
): PaymentScheme {
  if (choice === 'pay_at_checkout') {
    return options.payAtCheckoutAvailable ? 'pay_at_checkout' : 'full';
  }

  if (choice === 'downpayment') {
    return options.downpaymentRequired ? 'downpayment' : 'full';
  }

  return 'full';
}
