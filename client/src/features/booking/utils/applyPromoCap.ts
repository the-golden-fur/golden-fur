/**
 * Custom change (promos/coupons multiselect booking step, session 86):
 * client mirror of
 * server/src/shared/services/promoCap/promoCap.service.ts's applyPromoCap -
 * used by the new Promos & Coupons booking step to show a live, correctly
 * capped running total as the customer/receptionist checks boxes, instead
 * of an optimistic uncapped sum. The server re-applies this same math
 * authoritatively at submit time - this is a preview only.
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
