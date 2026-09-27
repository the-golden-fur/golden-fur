import type { MiscSalePreview } from '../../billing.types';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import styles from './MiscSaleWizard.module.css';

interface DiscountPromoStepProps {
  seniorCitizenEligible: boolean;
  pwdEligible: boolean;
  onSeniorCitizenChange: (value: boolean) => void;
  onPwdChange: (value: boolean) => void;
  preview: MiscSalePreview | null;
  isPreviewLoading: boolean;
  previewError: string | null;
}

/**
 * Step 3 of the misc-sale wizard (session 115): the real discounts/promos
 * engine, extended with a new 'misc_sale' discount scope (migration
 * 20260927217) - same auto-apply-by-scope model CashierCheckoutPage
 * already uses, not a manual code-entry field. Senior Citizen/PWD discounts
 * only ever apply for Cash (paymentMethod.service.ts's own rule, mirrored
 * server-side in evaluateMiscSaleDiscounts) - the note below is shown
 * unconditionally since Payment hasn't been picked yet at this step; the
 * Confirmation step's own preview re-evaluates with whatever method was
 * actually chosen and is the source of truth.
 */
export function DiscountPromoStep({
  seniorCitizenEligible,
  pwdEligible,
  onSeniorCitizenChange,
  onPwdChange,
  preview,
  isPreviewLoading,
  previewError,
}: DiscountPromoStepProps) {
  return (
    <div className={styles.field}>
      <span className={styles.label}>Discount / Promo</span>

      <label className={styles.checkboxField}>
        <input
          type="checkbox"
          checked={seniorCitizenEligible}
          onChange={(event) => onSeniorCitizenChange(event.target.checked)}
        />
        Senior Citizen
      </label>
      <label className={styles.checkboxField}>
        <input
          type="checkbox"
          checked={pwdEligible}
          onChange={(event) => onPwdChange(event.target.checked)}
        />
        PWD
      </label>
      <p className={styles.copy}>
        Government-mandated discounts only apply when the sale is paid in Cash -
        picked on the next step.
      </p>

      {isPreviewLoading ? (
        <p className={styles.copy}>Checking for applicable discounts...</p>
      ) : previewError ? (
        <p className={styles.errorBanner} role="alert">
          {previewError}
        </p>
      ) : preview ? (
        <>
          {preview.discountLines.length === 0 &&
          preview.promoLines.length === 0 ? (
            <p className={styles.copy}>
              No discounts or promos apply right now.
            </p>
          ) : (
            <>
              {[...preview.discountLines, ...preview.promoLines].map((line) => (
                <p
                  className={styles.summaryLine}
                  key={`${line.reference_id}-${line.description}`}
                >
                  <span>{line.description}</span>
                  <span>{formatCurrency(line.line_total)}</span>
                </p>
              ))}
            </>
          )}
          <p className={styles.summaryLineTotal}>
            <span>Running total</span>
            <span>{formatCurrency(preview.preCreditTotal)}</span>
          </p>
        </>
      ) : null}
    </div>
  );
}
