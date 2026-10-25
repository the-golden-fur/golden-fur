import type { Promo } from '../../maintenance/maintenance.types';

/**
 * How much more the booking subtotal needs before this promo can be used -
 * 0 when it already qualifies. A promo's cap (min_spend) is the minimum
 * order, for any discount type. Mirrors the server's own check in
 * booking.service.ts's resolveDiscountAndPromos.
 */
export function promoMinSpendShortfall(promo: Promo, subtotal: number): number {
  if (promo.min_spend == null) return 0;
  return Math.max(0, Number(promo.min_spend) - subtotal);
}
