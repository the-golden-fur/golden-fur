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
 * Read-only S/M/L/XL x SC/LC grid, derived live from a base price and the
 * shared pricing_configuration (#81) - shown on the Grooming service form,
 * the Pricing Configuration page's own illustrative preview, and (custom
 * change: package pricing redesign) the package builder's own matrix
 * toggle, so all three surfaces can never disagree (same deriveGroomingMatrix
 * call). Generic on purpose - basePrice isn't always a Grooming service's own
 * base_price, so the legend doesn't name a specific source.
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
        Size &amp; coat pricing matrix - derived, read-only
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
