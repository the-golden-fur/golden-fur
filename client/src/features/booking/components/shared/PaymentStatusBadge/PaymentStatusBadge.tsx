import type { PaymentStatus } from '../../../booking.types';
import styles from './PaymentStatusBadge.module.css';

interface PaymentStatusBadgeProps {
  status: PaymentStatus;
  /** 'default' (elsewhere): "Payment: Partially Paid". 'billing' (the
   * Transactions page, where this is the only status on the row):
   * "Due payment" / "Partially Paid" / "Fully Paid", no prefix. */
  context?: 'default' | 'billing';
}

const STATUS_CLASSNAME: Record<PaymentStatus, keyof typeof styles> = {
  Pending: 'unpaid',
  'Partially Paid': 'paidInAdvance',
  'Fully Paid': 'paid',
};

const STATUS_LABEL: Record<
  'default' | 'billing',
  Record<PaymentStatus, string>
> = {
  default: {
    Pending: 'Payment: Pending',
    'Partially Paid': 'Payment: Partially Paid',
    'Fully Paid': 'Payment: Fully Paid',
  },
  billing: {
    Pending: 'Due payment',
    'Partially Paid': 'Partially Paid',
    'Fully Paid': 'Fully Paid',
  },
};

/**
 * Pending / Partially Paid / Fully Paid pill - the same vocabulary at the
 * booking-rollup and per-transaction grains. Independent of
 * BookingStatusBadge (payment progress vs service lifecycle); reuses the
 * same colour tokens so the two pills read as related.
 */
export function PaymentStatusBadge({
  status,
  context = 'default',
}: PaymentStatusBadgeProps) {
  return (
    <span className={styles[STATUS_CLASSNAME[status]]}>
      {STATUS_LABEL[context][status]}
    </span>
  );
}
