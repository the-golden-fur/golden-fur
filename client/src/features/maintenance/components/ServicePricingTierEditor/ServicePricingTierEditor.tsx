import {
  COAT_TYPES,
  WEIGHT_CLASSES,
  type CoatType,
  type PricingTierInput,
  type WeightClass,
} from '../../maintenance.types';
import styles from './ServicePricingTierEditor.module.css';

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

interface ServicePricingTierEditorProps {
  /** Sparse map keyed by `${weight}:${coat}`; missing cells render empty. */
  tiers: PricingTierInput[];
  onChange: (tiers: PricingTierInput[]) => void;
}

function tierKey(weightClass: WeightClass, coatType: CoatType) {
  return `${weightClass}:${coatType}`;
}

/**
 * Grid input for the Grooming weight_class x coat_type price matrix (#45).
 * Only rendered by callers when the selected category is Grooming - hidden
 * entirely for other categories per the issue's dev notes, so the component
 * itself carries no category logic.
 */
export function ServicePricingTierEditor({
  tiers,
  onChange,
}: ServicePricingTierEditorProps) {
  const byKey = new Map(
    tiers.map((tier) => [tierKey(tier.weight_class, tier.coat_type), tier])
  );

  const handleCellChange = (
    weightClass: WeightClass,
    coatType: CoatType,
    rawValue: string
  ) => {
    const next = tiers.filter(
      (tier) =>
        tierKey(tier.weight_class, tier.coat_type) !==
        tierKey(weightClass, coatType)
    );

    if (rawValue !== '') {
      next.push({
        weight_class: weightClass,
        coat_type: coatType,
        price: Number(rawValue),
      });
    }

    onChange(next);
  };

  return (
    <fieldset className={styles.editor}>
      <legend className={styles.legend}>
        Size &amp; coat pricing matrix (Grooming)
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
            {COAT_TYPES.map((coatType) => {
              const tier = byKey.get(tierKey(weightClass, coatType));
              return (
                <input
                  key={coatType}
                  className={styles.priceInput}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  aria-label={`${WEIGHT_LABELS[weightClass]} / ${COAT_LABELS[coatType]} price`}
                  value={tier === undefined ? '' : String(tier.price)}
                  onChange={(event) =>
                    handleCellChange(weightClass, coatType, event.target.value)
                  }
                />
              );
            })}
          </div>
        ))}
      </div>
    </fieldset>
  );
}
