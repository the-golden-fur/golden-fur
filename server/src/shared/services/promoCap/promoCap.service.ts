/**
 * Custom change (promos/coupons multiselect booking step, session 86): pure
 * cap-application math extracted from discountPromoEvaluation.service.ts's
 * evaluatePromos (the checkout-time auto-stacking fallback), so
 * booking.service.ts's resolveDiscountAndPromos can apply the exact same
 * promo_cap_configuration rule authoritatively at booking time instead of
 * only ever seeing it at checkout. No DB access here - callers fetch the
 * effective PromoCapRow themselves (each feature already has its own
 * near-identical fetch helper - getPromoCapAmount in booking.service.ts,
 * getEffectivePromoCap in discountPromoEvaluation.service.ts - which is
 * fine to keep duplicated per this codebase's existing precedent for that
 * specific DB round trip; only the math moves here).
 */

export interface PromoCapRow {
  cap_type: 'percentage' | 'flat' | 'count';
  cap_value: number;
}

export interface CappableCandidate<T> {
  key: T;
  amount: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Sorts candidates largest-amount-first, then applies the cap:
 * - 'count': the top cap_value candidates are kept at full value, the rest
 *   dropped entirely (no partial-amount trimming - a "count" cap has no
 *   notion of a fractional promo/coupon).
 * - 'percentage'/'flat': candidates are kept in order until the running
 *   total would cross the cap amount; the one that would cross it is
 *   trimmed to exactly fill the remaining headroom, and nothing after it is
 *   applied.
 */
export function applyPromoCap<T>(
  candidates: CappableCandidate<T>[],
  cap: PromoCapRow,
  subtotal: number
): CappableCandidate<T>[] {
  if (candidates.length === 0) return [];

  const sorted = [...candidates].sort((a, b) => b.amount - a.amount);

  if (cap.cap_type === 'count') {
    const maxCount = Math.max(0, Math.trunc(Number(cap.cap_value)));
    return sorted.slice(0, maxCount);
  }

  const capAmount =
    cap.cap_type === 'percentage'
      ? (subtotal * Number(cap.cap_value)) / 100
      : Number(cap.cap_value);

  const applied: CappableCandidate<T>[] = [];
  let remainingCap = capAmount;

  for (const candidate of sorted) {
    if (remainingCap <= 0) break;

    const appliedAmount = Math.min(candidate.amount, remainingCap);
    remainingCap = round2(remainingCap - appliedAmount);

    applied.push({ key: candidate.key, amount: appliedAmount });
  }

  return applied;
}
