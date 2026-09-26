import type { TransactionRecord } from '../../reports.types';
import { paymentStatusLabel } from './transactionDisplay';

export type TransactionGroupBy = 'booking' | 'customer' | 'status' | 'none';

export const GROUP_BY_OPTIONS: { value: TransactionGroupBy; label: string }[] =
  [
    { value: 'booking', label: 'Booking' },
    { value: 'customer', label: 'Customer' },
    { value: 'status', label: 'Payment status' },
    { value: 'none', label: 'None' },
  ];

export interface TransactionGroup {
  key: string;
  title: string;
  /** Secondary line under the title - customer, booking date, etc. */
  meta: string | null;
  /** Booking groups only: the parent booking's own payment-status rollup
   * (not any single transaction's), shown as a pill on the group header. */
  bookingStatus: string | null;
  /** Booking groups only: what the booking costs after discount/promo. */
  netTotal: number | null;
  items: TransactionRecord[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { dateStyle: 'medium' });
}

function bookingGroup(
  key: string,
  items: TransactionRecord[]
): Omit<TransactionGroup, 'items'> {
  const first = items[0];

  if (first.transaction_type === 'miscellaneous_sale') {
    return {
      key,
      title: 'Miscellaneous sales',
      meta: 'Not tied to a booking',
      bookingStatus: null,
      netTotal: null,
    };
  }

  if (!first.booking_id && first.booking_group_id) {
    return {
      key,
      title: 'Multi-booking checkout',
      meta: first.customer_name,
      bookingStatus: null,
      netTotal: null,
    };
  }

  const booking = items.find((item) => item.bookings)?.bookings ?? null;
  const petName = booking?.pets?.name ?? null;
  const service = booking?.service_category ?? 'Booking';

  return {
    key,
    title: petName ? `${service} · ${petName}` : `${service} booking`,
    meta:
      [
        first.customer_name,
        booking?.scheduled_start
          ? `Booked for ${formatDate(booking.scheduled_start)}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ') || null,
    bookingStatus: booking?.payment_status ?? null,
    netTotal: booking
      ? booking.total_price - booking.discount_amount - booking.promo_amount
      : null,
  };
}

function keyFor(transaction: TransactionRecord, groupBy: TransactionGroupBy) {
  switch (groupBy) {
    case 'booking':
      if (transaction.transaction_type === 'miscellaneous_sale') return 'misc';
      return (
        transaction.booking_id ??
        transaction.booking_group_id ??
        `txn:${transaction.id}`
      );
    case 'customer':
      return transaction.customer_id;
    case 'status':
      return transaction.payment_status;
    default:
      return 'all';
  }
}

/**
 * Buckets the (already filtered + sorted) Transactions rows for the table
 * view's group headers. Groups appear in the order their first row appears,
 * so the active sort still decides which group comes first (e.g. newest
 * first puts the booking with the latest payment on top), and rows keep
 * that sort inside each group. Returns one headerless group for 'none'.
 */
export function groupTransactions(
  rows: TransactionRecord[],
  groupBy: TransactionGroupBy
): TransactionGroup[] {
  const buckets = new Map<string, TransactionRecord[]>();
  for (const row of rows) {
    const key = keyFor(row, groupBy);
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }

  return Array.from(buckets, ([key, items]) => {
    const base: Omit<TransactionGroup, 'items'> =
      groupBy === 'booking'
        ? bookingGroup(key, items)
        : groupBy === 'customer'
          ? {
              key,
              title: items[0].customer_name ?? 'Unknown customer',
              meta: null,
              bookingStatus: null,
              netTotal: null,
            }
          : groupBy === 'status'
            ? {
                key,
                title: paymentStatusLabel(key),
                meta: null,
                bookingStatus: null,
                netTotal: null,
              }
            : {
                key,
                title: '',
                meta: null,
                bookingStatus: null,
                netTotal: null,
              };
    return { ...base, items };
  });
}
