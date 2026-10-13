import styles from './AwaitingAssessmentBadge.module.css';

/**
 * Book before assessment: marks a booking made for a pet staff have not
 * assessed yet (bookings.awaiting_assessment) - its price is an estimate,
 * nothing has been charged, and it cannot be started until the pet's weight
 * and coat are recorded. Shown beside the status pill wherever staff or the
 * customer see the booking, so the unpaid state reads as "waiting on the
 * assessment", not as an overdue payment.
 */
export function AwaitingAssessmentBadge() {
  return (
    <span
      className={styles.badge}
      title="This pet has not been assessed yet. The price is an estimate until staff record its weight and coat."
    >
      Awaiting assessment
    </span>
  );
}
