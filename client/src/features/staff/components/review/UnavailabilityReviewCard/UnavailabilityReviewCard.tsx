import { useState } from 'react';
import type { PendingUnavailabilityBlock } from '../../../staff.types';
import styles from './UnavailabilityReviewCard.module.css';

interface UnavailabilityReviewCardProps {
  block: PendingUnavailabilityBlock;
  onApprove: () => void;
  onDeny: (denialReason?: string) => void;
}

function getInitials(displayName: string) {
  return displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function formatWindow(startTime: string, endTime: string, isFullDay: boolean) {
  if (isFullDay) {
    const date = new Date(startTime).toLocaleDateString();
    return `Full day off – ${date}`;
  }

  const start = new Date(startTime).toLocaleString();
  const end = new Date(endTime).toLocaleString();
  return `${start} – ${end}`;
}

export function UnavailabilityReviewCard({
  block,
  onApprove,
  onDeny,
}: UnavailabilityReviewCardProps) {
  const [isDenying, setIsDenying] = useState(false);
  const [denialReason, setDenialReason] = useState('');

  const staffName = block.staff?.display_name ?? 'Unknown staff member';

  const confirmDeny = () => {
    const trimmed = denialReason.trim();
    onDeny(trimmed ? trimmed : undefined);
  };

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        {block.staff?.profile_photo_url ? (
          <img
            className={styles.avatar}
            src={block.staff.profile_photo_url}
            alt={`${staffName}'s avatar`}
          />
        ) : (
          <span className={styles.avatarFallback} aria-hidden="true">
            {getInitials(staffName)}
          </span>
        )}
        <div className={styles.identity}>
          <h3 className={styles.name}>{staffName}</h3>
          {block.staff?.role ? (
            <span className={styles.roleBadge}>{block.staff.role}</span>
          ) : null}
        </div>
      </div>

      <p className={styles.window}>
        {formatWindow(block.start_time, block.end_time, block.is_full_day)}
      </p>

      {block.requested_reviewer ? (
        <p className={styles.requestedFor}>
          Requested for: {block.requested_reviewer.display_name}
        </p>
      ) : null}

      {block.reason ? <p className={styles.reason}>{block.reason}</p> : null}

      {!block.reviewable ? (
        <p className={styles.note}>
          Awaiting review from another Admin, Supervisor, or Superadmin.
        </p>
      ) : isDenying ? (
        <div className={styles.denyForm}>
          <label className={styles.field}>
            <span className={styles.label}>Reason (optional)</span>
            <input
              className={styles.input}
              type="text"
              value={denialReason}
              onChange={(event) => setDenialReason(event.target.value)}
            />
          </label>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.denyButton}
              onClick={confirmDeny}
            >
              Confirm deny
            </button>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={() => setIsDenying(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.approveButton}
            onClick={onApprove}
          >
            Approve
          </button>
          <button
            type="button"
            className={styles.denyButton}
            onClick={() => setIsDenying(true)}
          >
            Deny
          </button>
        </div>
      )}
    </article>
  );
}
