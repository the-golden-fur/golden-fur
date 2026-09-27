import type { PaymentFields } from '../../billing.types';
import { CreditApplicationPanel } from '../CreditApplicationPanel/CreditApplicationPanel';
import { PaymentMethodForm } from '../PaymentMethodForm/PaymentMethodForm';

interface PaymentStepProps {
  payment: PaymentFields;
  onPaymentChange: (next: PaymentFields) => void;
  creditToApply: number;
  onCreditChange: (amount: number) => void;
  amountDue: number;
}

/** Step 4 of the misc-sale wizard (session 115) - unchanged
 * CreditApplicationPanel/PaymentMethodForm, just relocated from the old
 * single-page form onto their own step. */
export function PaymentStep({
  payment,
  onPaymentChange,
  creditToApply,
  onCreditChange,
  amountDue,
}: PaymentStepProps) {
  return (
    <>
      <CreditApplicationPanel
        availableBalance={0}
        transactionTotal={amountDue}
        creditToApply={creditToApply}
        onChange={onCreditChange}
      />
      <PaymentMethodForm
        value={payment}
        onChange={onPaymentChange}
        amountDue={Math.max(0, amountDue - creditToApply)}
      />
    </>
  );
}
