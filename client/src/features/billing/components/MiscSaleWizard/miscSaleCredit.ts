import type { PaymentFields } from '../../billing.types';

export function isPayingByCredit(payment: PaymentFields): boolean {
  // 'Credit' isn't a PaymentMethod (it's misc-sale/Transactions-only), so
  // compare as a string - same as PaymentMethodForm.
  return (payment.payment_method as string) === 'Credit';
}

/** The Credit method is only selectable when the customer's branch balance
 * covers the whole sale. */
export function canPayByCredit(
  availableCredit: number | null,
  creditTotal: number | null
): boolean {
  return (
    availableCredit !== null &&
    creditTotal !== null &&
    availableCredit >= creditTotal
  );
}
