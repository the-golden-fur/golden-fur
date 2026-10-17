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

/** A cancelled booking can't take a payment (the server answers 409), so
 * neither page offers "Pay" or a balance payment for one. Group
 * transactions carry no booking row and are left to the server. */
export function isBookingCancelled(
  record: Pick<TransactionRecord, 'bookings'>
): boolean {
  return record.bookings?.status === 'Cancelled';
}

/** DB stores 'Pending' for an unsettled online payment - "Due payment" reads
 * better next to "Partially Paid" / "Fully Paid". */
export function paymentStatusLabel(status: string): string {
  return status === 'Pending' ? 'Due payment' : status;
}

/** 'due' | 'partial' | 'paid' - which payment-status tint a transaction row
 * (table) or card (board) gets. Shared so both views colour the same way;
 * each view maps the tone to its own CSS module class. */
export type PaymentTone = 'due' | 'partial' | 'paid';

export function paymentTone(status: string): PaymentTone {
  if (status === 'Fully Paid') return 'paid';
  if (status === 'Partially Paid') return 'partial';
  return 'due';
}
