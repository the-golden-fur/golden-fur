import type { TransactionRecord } from '../../reports.types';

/** "Down payment" / "Full payment" / "Balance payment" / "-" - shared by the
 * table, the board, and the customer portal page. */
export function paymentChoiceLabel(
  record: Pick<TransactionRecord, 'payment_choice'>
): string {
  if (record.payment_choice === 'downpayment') return 'Down payment';
  if (record.payment_choice === 'full') return 'Full payment';
  if (record.payment_choice === 'balance') return 'Balance payment';
  return '-';
}

export function transactionTypeLabel(
  record: Pick<TransactionRecord, 'transaction_type' | 'misc_sale_description'>
): string {
  return record.transaction_type === 'miscellaneous_sale'
    ? (record.misc_sale_description ?? 'Miscellaneous sale')
    : 'Booking payment';
}

/** DB stores 'Pending' for an unsettled online payment - "Due payment" reads
 * better next to "Partially Paid" / "Fully Paid". */
export function paymentStatusLabel(status: string): string {
  return status === 'Pending' ? 'Due payment' : status;
}
