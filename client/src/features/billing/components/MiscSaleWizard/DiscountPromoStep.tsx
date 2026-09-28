import type {
  MiscSaleDiscountOption,
  MiscSaleOptions,
  MiscSalePreview,
  MiscSalePromoOption,
} from '../../billing.types';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import styles from './MiscSaleWizard.module.css';

interface DiscountPromoStepProps {
  options: MiscSaleOptions | null;
  optionsError: string | null;
  selectedDiscountIds: string[];
  selectedPromoIds: string[];
  onDiscountIdsChange: (ids: string[]) => void;
  onPromoIdsChange: (ids: string[]) => void;
  preview: MiscSalePreview | null;
  isPreviewLoading: boolean;
  previewError: string | null;
}

function valueLabel(
  option: Pick<MiscSaleDiscountOption, 'discount_type' | 'value'>
): string {
  return option.discount_type === 'Percentage'
    ? `${option.value}% off`
    : `${formatCurrency(option.value)} off`;
}

function toggle(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

function promoEndLabel(promo: MiscSalePromoOption): string | null {
  if (!promo.end_date) return null;
  return `Ends ${new Date(promo.end_date).toLocaleDateString([], {
    dateStyle: 'medium',
  })}`;
}

/**
 * Step 3 of the misc-sale wizard: the cashier picks from the discounts and
 * promos the admin configured for misc sales at this branch (GET
 * /billing/misc-sale/options - misc-sale-scoped discounts, all-services
 * promos), rather than the old hardcoded Senior/PWD checkboxes over an
 * auto-apply engine. The server re-checks every pick and still applies the
 * branch promo cap and the Cash-only discount rule, so the "Applied" lines
 * below (from the live preview) are the source of truth, not the ticks.
 */
export function DiscountPromoStep({
  options,
  optionsError,
  selectedDiscountIds,
  selectedPromoIds,
  onDiscountIdsChange,
  onPromoIdsChange,
  preview,
  isPreviewLoading,
  previewError,
}: DiscountPromoStepProps) {
  const appliedLines = preview
    ? [...preview.discountLines, ...preview.promoLines]
    : [];

  return (
    <div className={styles.stepContent}>
      {optionsError ? (
        <p className={styles.errorBanner} role="alert">
          {optionsError}
        </p>
      ) : !options ? (
        <p className={styles.copy}>Loading discounts and promos...</p>
      ) : (
        <>
          <fieldset className={styles.optionGroup}>
            <legend className={styles.label}>Discounts</legend>
            {options.discounts.length === 0 ? (
              <p className={styles.copy}>
                No discounts are set up for misc sales at this branch.
              </p>
            ) : (
              <>
                <ul className={styles.optionList}>
                  {options.discounts.map((discount) => (
                    <li key={discount.id}>
                      <label className={styles.optionRow}>
                        <input
                          type="checkbox"
                          checked={selectedDiscountIds.includes(discount.id)}
                          onChange={() =>
                            onDiscountIdsChange(
                              toggle(selectedDiscountIds, discount.id)
                            )
                          }
                        />
                        <span className={styles.optionName}>
                          {discount.name}
                          {discount.is_mandated ? (
                            <span className={styles.optionMeta}>
                              Check a valid ID before applying
                            </span>
                          ) : null}
                        </span>
                        <span className={styles.optionValue}>
                          {valueLabel(discount)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className={styles.copy}>
                  Discounts only apply when the sale is paid in Cash, picked on
                  the next step.
                </p>
              </>
            )}
          </fieldset>

          <fieldset className={styles.optionGroup}>
            <legend className={styles.label}>Promos</legend>
            {options.promos.length === 0 ? (
              <p className={styles.copy}>
                No promos are running for misc sales at this branch.
              </p>
            ) : (
              <ul className={styles.optionList}>
                {options.promos.map((promo) => {
                  const endLabel = promoEndLabel(promo);
                  return (
                    <li key={promo.id}>
                      <label className={styles.optionRow}>
                        <input
                          type="checkbox"
                          checked={selectedPromoIds.includes(promo.id)}
                          onChange={() =>
                            onPromoIdsChange(toggle(selectedPromoIds, promo.id))
                          }
                        />
                        <span className={styles.optionName}>
                          {promo.name}
                          {endLabel ? (
                            <span className={styles.optionMeta}>
                              {endLabel}
                            </span>
                          ) : null}
                        </span>
                        <span className={styles.optionValue}>
                          {valueLabel(promo)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>
        </>
      )}

      <div className={styles.field} aria-live="polite">
        <span className={styles.label}>Applied</span>
        {isPreviewLoading ? (
          <p className={styles.copy}>Updating total...</p>
        ) : previewError ? (
          <p className={styles.errorBanner} role="alert">
            {previewError}
          </p>
        ) : preview ? (
          <>
            {appliedLines.length === 0 ? (
              <p className={styles.copy}>No discounts or promos applied.</p>
            ) : (
              appliedLines.map((line) => (
                <p
                  className={styles.summaryLine}
                  key={`${line.line_item_type}-${line.reference_id}`}
                >
                  <span>{line.description}</span>
                  <span>{formatCurrency(line.line_total)}</span>
                </p>
              ))
            )}
            <p className={styles.summaryLineTotal}>
              <span>Running total</span>
              <span>{formatCurrency(preview.preCreditTotal)}</span>
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
