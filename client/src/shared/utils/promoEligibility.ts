/**
 * Custom change (promo variations, session 86): client mirror of
 * server/src/shared/services/promoEligibility/promoEligibility.service.ts -
 * "is this promo live right now," covering both promo_type values. Used by
 * the booking flow's own applicable-promos preview so a weekly-recurring
 * promo shows/hides correctly without waiting on a round trip.
 *
 * Duplicated (not shared) since the client and server can't share a TS
 * module across that boundary in this codebase - same reasoning as this
 * project's other client/server duplicated helpers (e.g. the promo cap
 * math, see applyPromoCap.ts).
 */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

function toManilaDate(date: Date): Date {
  return new Date(date.getTime() + MANILA_OFFSET_MS);
}

/** 0=Sunday..6=Saturday, matching Date#getUTCDay(). */
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
