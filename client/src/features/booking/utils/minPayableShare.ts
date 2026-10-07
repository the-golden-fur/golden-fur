/**
 * The share of a booking's price the customer always pays, whatever
 * discount, promos and coupons are selected. Mirrors the server's
 * MIN_PAYABLE_SHARE (booking.service.ts), which is the authoritative check -
 * this copy only lets the Review step say so before the booking is submitted.
 */
export const MIN_PAYABLE_SHARE = 0.5;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Whether the selected reductions take off more than is allowed. A booking
 * with no price has nothing to reduce. */
export function exceedsReductionLimit(
  subtotal: number,
  reduction: number
): boolean {
  if (subtotal <= 0) return false;

  return round2(reduction) > round2(subtotal * (1 - MIN_PAYABLE_SHARE));
}

export const REDUCTION_LIMIT_MESSAGE = `Discounts and promos can take off at most ${Math.round((1 - MIN_PAYABLE_SHARE) * 100)}% of the price. Remove one to continue.`;
