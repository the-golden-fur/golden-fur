import type { Promo } from '../maintenance.types';
import { describeSpinTriggers, spinWheelValueLabel } from './spinWheelPromo';

/**
 * Display strings shared by the Promos tab's gallery card (PromoCard) and
 * its table/list views (AdminPromoConfigPage). Session 114: a spin-wheel
 * promo has no discount of its own, so its "value" is its reward pool and
 * its "window" is its trigger conditions.
 */

export function formatPromoValue(promo: Promo): string {
  if (promo.promo_type === 'spin_wheel') return spinWheelValueLabel(promo);

  const value = Number(promo.value ?? 0);
  return promo.discount_type === 'Percentage'
    ? `${value}% off`
    : `PHP ${value.toFixed(2)} off`;
}

export function promoWindowText(promo: Promo): string {
  if (promo.promo_type === 'spin_wheel') {
    const triggers = describeSpinTriggers(promo.spin_wheel_promo_settings);
    return promo.start_date && promo.end_date
      ? `${triggers} (${promo.start_date} to ${promo.end_date})`
      : triggers;
  }

  return promo.condition_note
    ? promo.condition_note
    : promo.start_date && promo.end_date
      ? `${promo.start_date} to ${promo.end_date}`
      : 'No window set';
}
