import type { GroomingSession, GroomingStatus } from '../../grooming.types';
import { GroomingStatusBadge } from '../GroomingStatusBadge/GroomingStatusBadge';
import styles from './AppointmentCard.module.css';

const NEXT_STATUS: Partial<Record<GroomingStatus, GroomingStatus>> = {
  Waiting: 'In Progress',
  'In Progress': 'Completed',
};

const ADVANCE_LABEL: Partial<Record<GroomingStatus, string>> = {
  Waiting: 'Mark In Progress',
  'In Progress': 'Mark Completed',
};

export interface AppointmentCardProps {
  session: GroomingSession;
  petName: string;
  ownerName: string;
  breed: string | null;
  weightClass: string;
  coatType: string;
  serviceLabel: string;
  addonLabels: string[];
  specialInstructions: string | null;
  isAdvancing: boolean;
  onAdvance: (sessionId: string, targetStatus: GroomingStatus) => void;
}

/**
 * Issue #68: one card per today's grooming appointment. Status buttons are
 * single-direction and disappear once Completed (AC-3) - #64's backend has
 * no "reopen" path, so there is nothing for a button to do at that point.
 */
export function AppointmentCard({
  session,
  petName,
  ownerName,
  breed,
  weightClass,
  coatType,
  serviceLabel,
  addonLabels,
  specialInstructions,
  isAdvancing,
  onAdvance,
}: AppointmentCardProps) {
  const nextStatus = NEXT_STATUS[session.status];

  return (
    <li className={styles.card}>
      <div className={styles.header}>
        <div className={styles.identity}>
          <h3 className={styles.petName}>{petName}</h3>
          <span className={styles.subtitle}>
            Owner: {ownerName}
            {breed ? ` · ${breed}` : ''}
          </span>
        </div>
        <GroomingStatusBadge status={session.status} />
      </div>

      <div className={styles.badges}>
        <span className={styles.badge}>{weightClass}</span>
        <span className={styles.badge}>{coatType}</span>
      </div>

      <p className={styles.serviceLabel}>{serviceLabel}</p>

      {addonLabels.length > 0 ? (
        <p className={styles.addons}>Add-ons: {addonLabels.join(', ')}</p>
      ) : null}

      {specialInstructions ? (
        <p className={styles.instructions}>
          Special instructions: {specialInstructions}
        </p>
      ) : null}

      {nextStatus ? (
        <button
          type="button"
          className={styles.primaryButton}
          disabled={isAdvancing}
          onClick={() => onAdvance(session.id, nextStatus)}
        >
          {isAdvancing ? 'Updating...' : ADVANCE_LABEL[session.status]}
        </button>
      ) : null}
    </li>
  );
}
