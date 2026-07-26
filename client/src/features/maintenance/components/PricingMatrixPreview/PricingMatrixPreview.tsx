import { deriveGroomingMatrix } from '../../utils/deriveGroomingMatrix';
import {
  COAT_TYPES,
  WEIGHT_CLASSES,
  type CoatType,
  type PricingConfiguration,
  type WeightClass,
} from '../../maintenance.types';
import styles from './PricingMatrixPreview.module.css';

const WEIGHT_LABELS: Record<WeightClass, string> = {
  S: 'Small (S)',
  M: 'Medium (M)',
  L: 'Large (L)',
  XL: 'Extra Large (XL)',
};

const COAT_LABELS: Record<CoatType, string> = {
  SC: 'Short Coat (SC)',
  LC: 'Long Coat (LC)',
};

interface PricingMatrixPreviewProps {
  basePrice: number;
  configuration: PricingConfiguration;
}

/**
 * Read-only S/M/L/XL x SC/LC grid, derived live from base_price and the
 * shared pricing_configuration (#81) - shown on both the Grooming service
 * form and the Pricing Configuration page's own illustrative preview, so the
 * two surfaces can never disagree (same deriveGroomingMatrix call).
 */
export function PricingMatrixPreview({
  basePrice,
  configuration,
}: PricingMatrixPreviewProps) {
  const matrix = deriveGroomingMatrix(basePrice, configuration);

  const priceFor = (weightClass: WeightClass, coatType: CoatType) =>
    matrix.find(
      (cell) => cell.weight_class === weightClass && cell.coat_type === coatType
    )?.price ?? 0;

  return (
    <fieldset className={styles.preview}>
      <legend className={styles.legend}>
        Size &amp; coat pricing matrix (Grooming) - derived, read-only
      </legend>
      <div className={styles.grid} role="grid">
        <span className={styles.cornerCell} aria-hidden="true" />
        {COAT_TYPES.map((coatType) => (
          <span key={coatType} className={styles.headerCell}>
            {COAT_LABELS[coatType]}
          </span>
        ))}
        {WEIGHT_CLASSES.map((weightClass) => (
          <div key={weightClass} className={styles.row}>
            <span className={styles.headerCell}>
              {WEIGHT_LABELS[weightClass]}
            </span>
            {COAT_TYPES.map((coatType) => (
              <span key={coatType} className={styles.priceCell}>
                PHP {priceFor(weightClass, coatType).toFixed(2)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </fieldset>
  );
}
