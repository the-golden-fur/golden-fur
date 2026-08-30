import type { PaymentStage } from '../../../booking.types';
import styles from './PaymentStageBadge.module.css';

interface PaymentStageBadgeProps {
  stage: PaymentStage;
  /** 'default' (elsewhere): "Payment: Partially Paid". 'billing' (Payments
   * Queue, where this is the only status on the row): "Due payment" /
   * "Partially Paid" / "Fully Paid", no prefix. */
  context?: 'default' | 'billing';
}

const STAGE_CLASSNAME: Record<PaymentStage, keyof typeof styles> = {
  Unpaid: 'unpaid',
  'Paid in Advance': 'paidInAdvance',
  Paid: 'paid',
};

/**
 * Down-payment slot gate (§6 / advisor: "marking it as paid shows partially
 * paid instead of fully paid"): 'Paid in Advance' is the state where only
 * the down payment has been collected and a balance is still due, so it
 * reads as "Partially Paid". The DB enum value is unchanged (it's
 * load-bearing across billing/DSR/checkout) - this is a display mapping only.
 */
const STAGE_LABEL: Record<
  'default' | 'billing',
  Record<PaymentStage, string>
> = {
  default: {
    Unpaid: 'Payment: Unpaid',
    'Paid in Advance': 'Payment: Partially Paid',
    Paid: 'Payment: Paid',
  },
  billing: {
    Unpaid: 'Due payment',
    'Paid in Advance': 'Partially Paid',
    Paid: 'Fully Paid',
  },
};

/**
 * Unpaid/Partially Paid/Paid pill - independent of BookingStatusBadge
 * (payment_stage tracks only when money changed hands, not the service
 * lifecycle). Reuses the same pending/in-progress/paid color tokens as
 * BookingStatusBadge so the two pills read as related but stay visually
 * distinguishable by their "Payment:" prefix, not by inventing a new palette.
 */
export function PaymentStageBadge({
  stage,
  context = 'default',
}: PaymentStageBadgeProps) {
  return (
    <span className={styles[STAGE_CLASSNAME[stage]]}>
      {STAGE_LABEL[context][stage]}
    </span>
  );
}
