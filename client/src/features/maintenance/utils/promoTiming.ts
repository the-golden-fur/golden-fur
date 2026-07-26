export type PromoTiming = 'Upcoming' | 'Active' | 'Ended';

interface PromoWindow {
  start_date: string | null;
  end_date: string | null;
}

/**
 * Classifies a promo's date window relative to today for the Promos
 * subpage's Timing filter/badge. A promo with no window (condition-based,
 * legacy data) is always 'Active' - there's no date restriction to compare
 * it against.
 */
export function getPromoTiming(
  promo: PromoWindow,
  todayDateString: string = new Date().toISOString().slice(0, 10)
): PromoTiming {
  if (promo.end_date && promo.end_date < todayDateString) {
    return 'Ended';
  }

  if (promo.start_date && promo.start_date > todayDateString) {
    return 'Upcoming';
  }

  return 'Active';
}
