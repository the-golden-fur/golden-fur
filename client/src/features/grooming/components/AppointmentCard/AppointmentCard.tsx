import type { BookingStatus } from '../../../booking/booking.types';
import { BookingStatusBadge } from '../../../booking/components/shared/BookingStatusBadge/BookingStatusBadge';
import type { GroomingSession } from '../../grooming.types';
import type { GroomingTransitionTarget } from '../../api/grooming.api';
import styles from './AppointmentCard.module.css';

/**
 * Booking-status revision: the "advance" button is now keyed off the
 * joined booking's status (bookings.status), not a grooming-local field -
 * grooming_sessions dropped its own status column entirely. Pending ->
 * Start (In Progress); In Progress -> Complete (Completed); anything else
 * (Completed/Paid/Cancelled/No-show) has nothing forward for this card to
 * do - Mark as Paid is a queue-level/cashier action, not this card's
 * concern.
 */
const ADVANCE_ACTION: Partial<
  Record<BookingStatus, { target: GroomingTransitionTarget; label: string }>
> = {
  Pending: { target: 'In Progress', label: 'Start' },
  'In Progress': { target: 'Completed', label: 'Complete' },
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
  onAdvance: (
    sessionId: string,
    targetStatus: GroomingTransitionTarget
  ) => void;
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
  const bookingStatus = session.booking?.status;
  const advanceAction = bookingStatus
    ? ADVANCE_ACTION[bookingStatus]
    : undefined;

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
        {bookingStatus ? <BookingStatusBadge status={bookingStatus} /> : null}
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

      {advanceAction ? (
        <button
          type="button"
          className={styles.primaryButton}
          disabled={isAdvancing}
          onClick={() => onAdvance(session.id, advanceAction.target)}
        >
          {isAdvancing ? 'Updating...' : advanceAction.label}
        </button>
      ) : null}
    </li>
  );
}
