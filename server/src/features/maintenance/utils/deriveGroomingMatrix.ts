import type {
  CoatType,
  PricingConfiguration,
  WeightClass,
} from '../maintenance.types.ts';

export interface GroomingMatrixCell {
  weight_class: WeightClass;
  coat_type: CoatType;
  price: number;
}

const WEIGHT_CLASSES: WeightClass[] = ['S', 'M', 'L', 'XL'];
const COAT_TYPES: CoatType[] = ['SC', 'LC'];

const SIZE_MULTIPLIER_FIELD: Record<
  WeightClass,
  keyof PricingConfiguration
> = {
  S: 'size_s_multiplier',
  M: 'size_m_multiplier',
  L: 'size_l_multiplier',
  XL: 'size_xl_multiplier',
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Pure derivation (#81): (base_price, pricing_configuration) -> the 8-cell
 * S/M/L/XL x SC/LC matrix. Long Coat is the Short Coat cell plus a flat
 * add-on, per Modules-Features ("a flat add-on for long coat").
 *
 * Client-side has its own copy of this exact formula (no shared module
 * between the two builds) - keep the two in sync if this changes.
 */
export function deriveGroomingMatrix(
  basePrice: number,
  config: PricingConfiguration
): GroomingMatrixCell[] {
  return WEIGHT_CLASSES.flatMap((weightClass) => {
    const multiplier = config[SIZE_MULTIPLIER_FIELD[weightClass]] as number;
    const sizePrice = basePrice * multiplier;

    return COAT_TYPES.map((coatType) => ({
      weight_class: weightClass,
      coat_type: coatType,
      price: round2(
        coatType === 'LC' ? sizePrice + config.long_coat_addon : sizePrice
      ),
    }));
  });
}
