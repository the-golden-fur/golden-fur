/**
 * Custom change (promo variations, session 86): shared "is this promo live
 * right now" predicate, covering both promo_type values
 * (20260913195_custom_promos_add_weekly_recurring_type.sql) - replaces three
 * separate copies of the old date-only check that used to live in
 * promos.service.ts's listPromos, booking.service.ts's
 * resolveDiscountAndPromo(s), and discountPromoEvaluation.service.ts's
 * evaluatePromos.
 *
 * Fixed +8h offset for Asia/Manila (no DST, same convention already used
 * SQL-side by the credit-expiry-at-Manila-end-of-day migrations) rather than
 * a timezone library - duplicated in
 * client/src/shared/utils/promoEligibility.ts since client and server can't
 * share a TS module across that boundary (same reasoning as
 * getPromoCapAmount's own duplication note in booking.service.ts).
 */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

function toManilaDate(date: Date): Date {
  return new Date(date.getTime() + MANILA_OFFSET_MS);
}

/** 0=Sunday..6=Saturday, matching both JS's Date#getDay()/getUTCDay() and
 * Postgres's extract(dow from ...) - neither side of the stack remaps it. */
export function manilaDayOfWeek(date: Date = new Date()): number {
  return toManilaDate(date).getUTCDay();
}

/** YYYY-MM-DD, matching promos.start_date/end_date's date column shape. */
export function manilaDateString(date: Date = new Date()): string {
  return toManilaDate(date).toISOString().slice(0, 10);
}

export type PromoType = 'date_range' | 'weekly_recurring';

export interface PromoEligibilityInput {
  is_active: boolean;
  promo_type: PromoType;
  start_date: string | null;
  end_date: string | null;
  days_of_week: number[] | null;
}

/**
 * A date_range promo is eligible within [start_date, end_date] (either
 * bound optional). A weekly_recurring promo is eligible on any of
 * days_of_week, Manila-local, AND (if set) still within an optional overall
 * start_date/end_date campaign window on top of the day match.
 */
export function isPromoCurrentlyEligible(
  promo: PromoEligibilityInput,
  now: Date = new Date()
): boolean {
  if (!promo.is_active) return false;

  const today = manilaDateString(now);
  if (promo.start_date && promo.start_date > today) return false;
  if (promo.end_date && promo.end_date < today) return false;

  if (promo.promo_type === 'weekly_recurring') {
    return (promo.days_of_week ?? []).includes(manilaDayOfWeek(now));
  }

  return true;
}
