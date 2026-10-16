import type { TransactionReceiptPrintoutProps } from '../../../../shared/components/TransactionReceiptPrintout/TransactionReceiptPrintout';
import type { BranchLetterhead } from '../../../maintenance/api/maintenance.api';
import type { TransactionRecord } from '../../reports.types';
import {
  paymentChoiceLabel,
  paymentStatusLabel,
  transactionTypeLabel,
} from './transactionDisplay';

/** What a transaction's printed receipt reads - the Transactions page and a
 * pet's Service History both print from this, so a reprint matches the
 * original slip. */
export type ReceiptTransaction = Pick<
  TransactionRecord,
  | 'id'
  | 'created_at'
  | 'customer_name'
  | 'transaction_type'
  | 'misc_sale_description'
  | 'payment_choice'
  | 'payment_method'
  | 'payment_status'
  | 'total_amount'
  | 'transaction_line_items'
> & {
  bookings: {
    service_category: string;
    pets?: { name: string } | null;
  } | null;
};

/** Short, stable reference printed on the slip and as its barcode. */
export function receiptReference(transactionId: string): string {
  return transactionId.replace(/-/g, '').slice(0, 12).toUpperCase();
}

/** Every TransactionReceiptPrintout prop except onDone. */
export function receiptPropsFor(
  transaction: ReceiptTransaction,
  branch: BranchLetterhead | undefined
): Omit<TransactionReceiptPrintoutProps, 'onDone'> {
  const isUnpaid = transaction.payment_status === 'Pending';

  return {
    branchName: branch?.name ?? null,
    branchAddress: branch?.address ?? null,
    branchContactNumber: branch?.contact_number ?? null,
    title: isUnpaid ? 'Payment Due' : 'Receipt',
    reference: receiptReference(transaction.id),
    date: transaction.created_at,
    customerName: transaction.customer_name,
    petName: transaction.bookings?.pets?.name ?? null,
    description: transactionTypeLabel(transaction),
    service: transaction.bookings?.service_category ?? null,
    paymentLabel: transaction.payment_choice
      ? paymentChoiceLabel(transaction)
      : null,
    method: isUnpaid ? null : transaction.payment_method,
    statusLabel: paymentStatusLabel(transaction.payment_status),
    amount: transaction.total_amount,
    // A Daycare bill is itemized - booked hours, overdue hours, the night of
    // a pet not picked up before closing.
    lines:
      transaction.bookings?.service_category === 'Daycare'
        ? transaction.transaction_line_items
        : undefined,
  };
}
