import type { Booking, EffectivePolicy } from '../booking.types.ts';

export interface RescheduleFeeParams {
  policy: EffectivePolicy;
  /** The booking BEFORE this reschedule's update - reschedule_count is the
   * count of reschedules already completed, and total_price already
   * reflects the booking_items-derived multi-item total (no aggregation
   * needed here). */
  booking: Pick<Booking, 'reschedule_count' | 'total_price'>;
}

/**
 * Issue #92: flat/percentage fee against the booking's real total_price
 * (multi-item, booking_items-derived - never assumed to come from one
 * service/package row), applied only once the configured free-reschedule
 * allowance is exhausted. Staff Picker visibility is NOT this issue's
 * concern - it shipped complete in Sprint 2 #52.
 *
 * Pure function, no DB access: reschedule.service.ts already has both the
 * resolved policy (from evaluateNoticePeriod's return) and the booking row
 * in hand, so this writes no query of its own - its result is folded into
 * the same `bookings` update reschedule.service.ts was already making.
 *
 * Returns null when no fee applies (disabled, or still within the free
 * allowance) - reschedule.service.ts writes that straight to
 * pending_reschedule_fee_amount, clearing any earlier value.
 */
export function calculateRescheduleFee({
  policy,
  booking,
}: RescheduleFeeParams): number | null {
  if (!policy.reschedule_fee_enabled) {
    return null;
  }

  const allowance = policy.reschedule_free_allowance;

  // NULL = unlimited free reschedules (documented default) - a fee never
  // applies regardless of how many reschedules have happened.
  if (allowance === null || booking.reschedule_count < allowance) {
    return null;
  }

  if (
    policy.reschedule_fee_type === null ||
    policy.reschedule_fee_value === null
  ) {
    return null;
  }

  const fee =
    policy.reschedule_fee_type === 'Flat'
      ? policy.reschedule_fee_value
      : (booking.total_price * policy.reschedule_fee_value) / 100;

  return Math.round(fee * 100) / 100;
}
