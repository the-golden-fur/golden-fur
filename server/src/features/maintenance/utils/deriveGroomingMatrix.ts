import type {
  CoatType,
  PricingConfiguration,
  PricingRuleType,
  WeightClass,
} from '../maintenance.types.ts';

export interface GroomingMatrixCell {
  weight_class: WeightClass;
  coat_type: CoatType;
  price: number;
}

const WEIGHT_CLASSES: WeightClass[] = ['S', 'M', 'L', 'XL'];
const COAT_TYPES: CoatType[] = ['SC', 'LC'];

const SIZE_RULE_FIELDS: Record<
  WeightClass,
  { type: keyof PricingConfiguration; value: keyof PricingConfiguration }
> = {
  S: { type: 'size_s_rule_type', value: 'size_s_rule_value' },
  M: { type: 'size_m_rule_type', value: 'size_m_rule_value' },
  L: { type: 'size_l_rule_type', value: 'size_l_rule_value' },
  XL: { type: 'size_xl_rule_type', value: 'size_xl_rule_value' },
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Applies one pricing rule to a running price. `multiplier` scales the
 * running total; `flat`/`percentage` add a delta on top of it. `percentage`
 * is always computed against the service's own base_price, never the
 * running (already size-adjusted) total, so combining a size rule and the
 * coat rule never depends on evaluation order for that part of the math.
 */
function applyRule(
  runningPrice: number,
  basePrice: number,
  type: PricingRuleType,
  value: number
): number {
  switch (type) {
    case 'multiplier':
      return runningPrice * value;
    case 'flat':
      return runningPrice + value;
    case 'percentage':
      return runningPrice + (basePrice * value) / 100;
  }
}

/**
 * Pure derivation (#81; custom change: configurable pricing rules):
 * (base_price, pricing_configuration) -> the 8-cell S/M/L/XL x SC/LC
 * matrix. Each size has its own independently-configurable rule
 * (multiplier/flat add-on/percentage add-on); Long Coat is one more rule
 * applied on top of the size-adjusted price.
 *
 * Client-side has its own copy of this exact formula (no shared module
 * between the two builds) - keep the two in sync if this changes.
 */
export function deriveGroomingMatrix(
  basePrice: number,
  config: PricingConfiguration
): GroomingMatrixCell[] {
  return WEIGHT_CLASSES.flatMap((weightClass) => {
    const fields = SIZE_RULE_FIELDS[weightClass];
    const sizeType = config[fields.type] as PricingRuleType;
    const sizeValue = config[fields.value] as number;
    const sizeAdjusted = applyRule(basePrice, basePrice, sizeType, sizeValue);

    return COAT_TYPES.map((coatType) => ({
      weight_class: weightClass,
      coat_type: coatType,
      price: round2(
        coatType === 'LC'
          ? applyRule(
              sizeAdjusted,
              basePrice,
              config.coat_long_rule_type,
              config.coat_long_rule_value
            )
          : sizeAdjusted
      ),
    }));
  });
}
