import { deriveGroomingMatrix } from '../../utils/deriveGroomingMatrix';
import {
  COAT_TYPES,
  WEIGHT_CLASSES,
  type CoatType,
  type PricingConfiguration,
  type WeightClass,
} from '../../maintenance.types';
import { cellKey, type CellDrafts, type CellKey } from './pricingCellDrafts';
import styles from './PricingMatrixEditor.module.css';

const WEIGHT_LABELS: Record<WeightClass, string> = {
  S: 'Small (S)',
  M: 'Medium (M)',
  L: 'Large (L)',
  XL: 'Extra Large (XL)',
};

const COAT_LABELS: Record<CoatType, string> = {
  SC: 'Short coat',
  LC: 'Long coat',
};

interface PricingMatrixEditorProps {
  /** The price the formula starts from: a service's base price, or a
   * package's bundled price. */
  basePrice: number;
  configuration: PricingConfiguration;
  /** This item's own cell prices, keyed by cell - see pricingCellDrafts. */
  drafts: CellDrafts;
  onChange: (drafts: CellDrafts) => void;
  /** Admins see the prices but can't change them (Superadmin-only). */
  readOnly?: boolean;
}

/**
 * Custom change (per-item weight x coat pricing): the S/M/L/XL x short/long
 * coat price grid of one Grooming service or package. Every cell starts at
 * the shared Pricing Configuration formula's price for `basePrice` (the same
 * deriveGroomingMatrix the server uses); a Superadmin types over any cell to
 * give this item its own price there, and "Use formula" puts it back. A cell
 * left on the formula keeps following it when the base price or the formula
 * changes.
 */
export function PricingMatrixEditor({
  basePrice,
  configuration,
  drafts,
  onChange,
  readOnly = false,
}: PricingMatrixEditorProps) {
  const matrix = deriveGroomingMatrix(basePrice, configuration);

  const formulaPrice = (weightClass: WeightClass, coatType: CoatType) =>
    matrix.find(
      (cell) => cell.weight_class === weightClass && cell.coat_type === coatType
    )?.price ?? 0;

  function setDraft(key: CellKey, value: string | null) {
    const next = { ...drafts };
    if (value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onChange(next);
  }

  return (
    <fieldset className={styles.editor}>
      <legend className={styles.legend}>Price by weight class and coat</legend>
      <p className={styles.hint}>
        {readOnly
          ? 'Only a Superadmin can change these prices.'
          : 'Each price starts from the Pricing Configuration formula. Type over any of them to give this item its own price.'}
      </p>

      <div className={styles.grid}>
        <span aria-hidden="true" />
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
              const key = cellKey(weightClass, coatType);
              const draft = drafts[key];
              const isCustom = draft !== undefined;
              const formula = formulaPrice(weightClass, coatType);
              const label = `${WEIGHT_LABELS[weightClass]}, ${COAT_LABELS[coatType].toLowerCase()} price`;

              return (
                <div
                  key={coatType}
                  className={isCustom ? styles.cellCustom : styles.cell}
                >
                  {readOnly ? (
                    <span className={styles.readOnlyPrice} aria-label={label}>
                      ₱{(isCustom ? Number(draft) : formula).toFixed(2)}
                    </span>
                  ) : (
                    <label className={styles.inputWrap}>
                      <span className={styles.currency} aria-hidden="true">
                        ₱
                      </span>
                      <input
                        className={styles.input}
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        aria-label={label}
                        value={isCustom ? draft : formula.toFixed(2)}
                        onChange={(event) => setDraft(key, event.target.value)}
                      />
                    </label>
                  )}
                  <span className={styles.cellMeta}>
                    {isCustom ? 'Own price' : 'Formula'}
                    {isCustom && !readOnly ? (
                      <button
                        type="button"
                        className={styles.resetButton}
                        aria-label={`Use the formula price for ${label}`}
                        onClick={() => setDraft(key, null)}
                      >
                        Use formula
                      </button>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </fieldset>
  );
}
