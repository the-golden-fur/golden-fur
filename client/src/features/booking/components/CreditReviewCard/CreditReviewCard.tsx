import type { CreditReviewQueueItem } from '../../booking.types';
import styles from './CreditReviewCard.module.css';

interface CreditReviewCardProps {
  item: CreditReviewQueueItem;
  petName: string;
  ownerName: string;
  onApprove: () => void;
  onDeny: () => void;
  isSubmitting: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Unknown date';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/**
 * Manual-cancellation-credit-review custom change: one pending
 * cancellation_logs row - the reason a staff member needs to judge, plus
 * what approving would actually credit, so the decision isn't made blind.
 */
export function CreditReviewCard({
  item,
  petName,
  ownerName,
  onApprove,
  onDeny,
  isSubmitting,
}: CreditReviewCardProps) {
  const {
    booking,
    amount_paid: amountPaid,
    potential_credit_amount: potentialCreditAmount,
  } = item;

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.name}>{petName}</h3>
        <span className={styles.categoryBadge}>{booking.service_category}</span>
      </div>

      <span className={styles.meta}>Owner: {ownerName}</span>
      <span className={styles.meta}>
        Cancelled {formatDate(booking.cancelled_at)}
      </span>

      <p className={styles.reason}>
        {booking.cancellation_reason
          ? `"${booking.cancellation_reason}"`
          : 'No reason given.'}
      </p>

      <div className={styles.amounts}>
        <span>Paid: ₱{amountPaid.toFixed(2)}</span>
        <span>Would credit: ₱{potentialCreditAmount.toFixed(2)}</span>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.approveButton}
          disabled={isSubmitting}
          onClick={onApprove}
        >
          Approve credit
        </button>
        <button
          type="button"
          className={styles.denyButton}
          disabled={isSubmitting}
          onClick={onDeny}
        >
          Deny
        </button>
      </div>
    </article>
  );
}
