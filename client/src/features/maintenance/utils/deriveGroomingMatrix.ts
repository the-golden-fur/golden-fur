import type {
  CoatType,
  PricingConfiguration,
  WeightClass,
} from '../maintenance.types';

export interface GroomingMatrixCell {
  weight_class: WeightClass;
  coat_type: CoatType;
  price: number;
}

const WEIGHT_CLASSES: WeightClass[] = ['S', 'M', 'L', 'XL'];
const COAT_TYPES: CoatType[] = ['SC', 'LC'];

const SIZE_MULTIPLIER_FIELD: Record<WeightClass, keyof PricingConfiguration> = {
  S: 'size_s_multiplier',
  M: 'size_m_multiplier',
  L: 'size_l_multiplier',
  XL: 'size_xl_multiplier',
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Client-side mirror of server/src/features/maintenance/utils/deriveGroomingMatrix.ts
 * (#81) - needed here too so the service form's preview can compute a live
 * matrix from a not-yet-saved base_price, with no round trip to the server.
 * There is no shared module between the client and server builds, so keep
 * this formula in sync with the server copy if it ever changes.
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
