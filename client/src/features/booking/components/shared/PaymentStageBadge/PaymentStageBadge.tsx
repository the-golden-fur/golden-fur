import type { PaymentStage } from '../../../booking.types';
import styles from './PaymentStageBadge.module.css';

interface PaymentStageBadgeProps {
  stage: PaymentStage;
}

const STAGE_CLASSNAME: Record<PaymentStage, keyof typeof styles> = {
  Unpaid: 'unpaid',
  'Paid in Advance': 'paidInAdvance',
  Paid: 'paid',
};

/**
 * Unpaid/Paid in Advance/Paid pill - independent of BookingStatusBadge
 * (payment_stage tracks only when money changed hands, not the service
 * lifecycle). Reuses the same pending/in-progress/paid color tokens as
 * BookingStatusBadge so the two pills read as related but stay visually
 * distinguishable by their "Payment:" prefix, not by inventing a new palette.
 */
export function PaymentStageBadge({ stage }: PaymentStageBadgeProps) {
  return (
    <span className={styles[STAGE_CLASSNAME[stage]]}>Payment: {stage}</span>
  );
}
