import { PAYMENT_METHODS, type PaymentFields } from '../../billing.types';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import { CreditApplicationPanel } from '../CreditApplicationPanel/CreditApplicationPanel';
import { PaymentMethodForm } from '../PaymentMethodForm/PaymentMethodForm';
import { canPayByCredit, isPayingByCredit } from './miscSaleCredit';
import styles from './MiscSaleWizard.module.css';

/** 'Credit' pays the whole sale from the customer's branch balance. It is
 * always listed - misc sales are how a customer's credit gets used up -
 * but only selectable when the balance covers the sale. */
const MISC_SALE_METHODS = [...PAYMENT_METHODS, 'Credit'] as const;

interface PaymentStepProps {
  payment: PaymentFields;
  onPaymentChange: (next: PaymentFields) => void;
  creditToApply: number;
  onCreditChange: (amount: number) => void;
  amountDue: number;
  /** The customer's credit at this branch; null while loading/unavailable. */
  availableCredit: number | null;
  creditError: string | null;
  /** What the sale costs if paid by Credit (Cash-only discounts dropped). */
  creditTotal: number | null;
}

/** Step 4 of the misc-sale wizard: CreditApplicationPanel (partial credit
 * on top of another method) plus PaymentMethodForm, which now also offers
 * Credit for the whole amount. */
export function PaymentStep({
  payment,
  onPaymentChange,
  creditToApply,
  onCreditChange,
  amountDue,
  availableCredit,
  creditError,
  creditTotal,
}: PaymentStepProps) {
  const payingByCredit = isPayingByCredit(payment);
  const creditCovers = canPayByCredit(availableCredit, creditTotal);
  const creditLabel =
    availableCredit === null
      ? 'Credit'
      : `Credit (${formatCurrency(availableCredit)} available)`;

  return (
    <>
      {payingByCredit ? null : (
        <CreditApplicationPanel
          availableBalance={availableCredit ?? 0}
          transactionTotal={amountDue}
          creditToApply={creditToApply}
          onChange={onCreditChange}
        />
      )}
      <PaymentMethodForm
        value={payment}
        onChange={(next) => {
          // Credit pays everything itself - drop any partial top-up.
          if (isPayingByCredit(next)) onCreditChange(0);
          onPaymentChange(next);
        }}
        amountDue={Math.max(0, amountDue - creditToApply)}
        methods={MISC_SALE_METHODS}
        disabledMethods={creditCovers ? [] : ['Credit']}
        methodLabels={{ Credit: creditLabel }}
        methodDescribedBy={creditCovers ? undefined : 'credit-method-hint'}
      />
      {creditError ? (
        <p className={styles.errorBanner} role="alert">
          {creditError}
        </p>
      ) : !creditCovers && availableCredit !== null && creditTotal !== null ? (
        <p id="credit-method-hint" className={styles.copy}>
          Credit can&apos;t pay for this sale: the customer has{' '}
          {formatCurrency(availableCredit)} at this branch and{' '}
          {formatCurrency(creditTotal)} is due.
        </p>
      ) : null}
    </>
  );
}
