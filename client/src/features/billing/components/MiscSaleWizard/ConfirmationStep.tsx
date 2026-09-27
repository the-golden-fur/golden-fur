import type { CustomerProfile } from '../../../customers/customer.types';
import type {
  MiscSalePreview,
  MiscSaleResponse,
  PaymentFields,
} from '../../billing.types';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import styles from './MiscSaleWizard.module.css';

interface ConfirmationStepProps {
  customer: CustomerProfile | null;
  payment: PaymentFields;
  creditToApply: number;
  preview: MiscSalePreview | null;
  isPreviewLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  result: MiscSaleResponse | null;
  onConfirm: () => void;
}

/**
 * Step 5 of the misc-sale wizard (session 115) - the plan left this and
 * Payment's exact shape up to the implementer. Shows the same live
 * `preview` the Discount/Promo step used, but now reflecting whatever
 * payment method was actually picked (Cash-only discounts may appear or
 * disappear versus what Discount/Promo showed) - this is the authoritative
 * total shown before the cashier commits.
 */
export function ConfirmationStep({
  customer,
  payment,
  creditToApply,
  preview,
  isPreviewLoading,
  isSubmitting,
  error,
  result,
  onConfirm,
}: ConfirmationStepProps) {
  const total = preview
    ? Math.max(0, preview.preCreditTotal - creditToApply)
    : null;

  return (
    <div className={styles.field}>
      <span className={styles.label}>Confirmation</span>

      <p className={styles.summaryLine}>
        <span>Customer</span>
        <span>{customer?.full_name ?? '-'}</span>
      </p>

      {isPreviewLoading || !preview ? (
        <p className={styles.copy}>Calculating total...</p>
      ) : (
        <>
          {preview.itemLines.map((line, index) => (
            <p
              className={styles.summaryLine}
              key={`${line.reference_id ?? line.description}-${index}`}
            >
              <span>
                {line.description}
                {line.quantity > 1 ? ` x${line.quantity}` : ''}
              </span>
              <span>{formatCurrency(line.line_total)}</span>
            </p>
          ))}
          {[...preview.discountLines, ...preview.promoLines].map((line) => (
            <p
              className={styles.summaryLine}
              key={`${line.reference_id}-${line.description}`}
            >
              <span>{line.description}</span>
              <span>{formatCurrency(line.line_total)}</span>
            </p>
          ))}
          {creditToApply > 0 ? (
            <p className={styles.summaryLine}>
              <span>Credit applied</span>
              <span>-{formatCurrency(creditToApply)}</span>
            </p>
          ) : null}
          <p className={styles.summaryLine}>
            <span>Payment method</span>
            <span>{payment.payment_method}</span>
          </p>
          <p className={styles.summaryLineTotal}>
            <span>Amount due</span>
            <span>{formatCurrency(total ?? 0)}</span>
          </p>
        </>
      )}

      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <p className={styles.successBanner}>
          Sale recorded - {result.transaction.payment_status}.
          {result.changeAmount !== null
            ? ` Change: ${formatCurrency(result.changeAmount)}`
            : ''}
        </p>
      ) : (
        <button
          type="button"
          className={styles.button}
          disabled={isSubmitting || isPreviewLoading || !preview}
          onClick={onConfirm}
        >
          {isSubmitting ? 'Recording...' : 'Confirm & record sale'}
        </button>
      )}
    </div>
  );
}
