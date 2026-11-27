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

type StatusLike = Pick<TransactionRecord, 'payment_status'> &
  Partial<Pick<TransactionRecord, 'voided_at'>>;

/** DB stores 'Pending' for an unsettled online payment - "Due payment" reads
 * better next to "Partially Paid" / "Fully Paid". A voided Pending charge
 * (a dead charge left behind by a cancelled booking - see voidTransaction)
 * reads as "Voided" instead - it stays payment_status 'Pending' in the DB,
 * so this needs the whole record (not just the bare status) to tell the two
 * apart. A bare status string (transactionGrouping.ts's "Group by: Status"
 * title, which groups strictly by the raw payment_status column) is still
 * accepted and never reads as Voided, since it isn't any one row. */
export function paymentStatusLabel(input: string | StatusLike): string {
  const status = typeof input === 'string' ? input : input.payment_status;
  const voidedAt = typeof input === 'string' ? null : input.voided_at;

  if (voidedAt) return 'Voided';
  return status === 'Pending' ? 'Due payment' : status;
}

/** 'due' | 'partial' | 'paid' | 'void' - which payment-status tint a
 * transaction row (table) or card (board) gets. Shared so both views
 * colour the same way; each view maps the tone to its own CSS module
 * class. */
export type PaymentTone = 'due' | 'partial' | 'paid' | 'void';

export function paymentTone(record: StatusLike): PaymentTone {
  if (record.voided_at) return 'void';
  if (record.payment_status === 'Fully Paid') return 'paid';
  if (record.payment_status === 'Partially Paid') return 'partial';
  return 'due';
}
