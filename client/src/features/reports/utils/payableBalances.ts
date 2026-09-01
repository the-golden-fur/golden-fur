import type { TransactionRecord } from '../reports.types';

export interface PayableBalance {
  bookingId: string;
  serviceCategory: string;
  /** netTotal - settled, from the loaded rows. A date filter that hides
   * settled rows can make this read high; the server re-checks on submit. */
  remaining: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Payment/transactions rework, gap B: the bookings a viewer can add a
 * customer-chosen partial balance payment to - 'Partially Paid' (a down
 * payment settled, a balance still owed), with no charge already awaiting
 * settlement and a positive remaining balance.
 */
export function payableBalances(
  transactions: TransactionRecord[]
): PayableBalance[] {
  const byBooking = new Map<string, TransactionRecord[]>();

  for (const transaction of transactions) {
    if (
      transaction.transaction_type === 'booking_payment' &&
      transaction.booking_id
    ) {
      const rows = byBooking.get(transaction.booking_id) ?? [];
      rows.push(transaction);
      byBooking.set(transaction.booking_id, rows);
    }
  }

  const result: PayableBalance[] = [];

  for (const [bookingId, rows] of byBooking) {
    const booking = rows.find((row) => row.bookings)?.bookings;
    if (!booking || booking.payment_status !== 'Partially Paid') continue;
    if (rows.some((row) => row.payment_status === 'Pending')) continue;

    const net = round2(
      booking.total_price - booking.discount_amount - booking.promo_amount
    );
    const settled = round2(
      rows
        .filter((row) => row.payment_status !== 'Pending')
        .reduce((sum, row) => sum + row.total_amount, 0)
    );
    const remaining = round2(net - settled);

    if (remaining > 0) {
      result.push({
        bookingId,
        serviceCategory: booking.service_category,
        remaining,
      });
    }
  }

  return result;
}
