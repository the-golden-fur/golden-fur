import { Link } from 'react-router';
import { Modal } from '../../../../shared/components/Modal/Modal';
import type { ConflictedBooking } from '../../../booking/booking.types';
import styles from './SlotConflictModal.module.css';

interface SlotConflictModalProps {
  bookings: ConflictedBooking[];
  onClose: () => void;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Slot-conflict notification: mounted on CustomerPortalPage (the dashboard,
 * `/portal`) and opened automatically whenever GET /bookings/conflicts/mine
 * returns one or more still-Pending bookings that lost their date/time/
 * staff/cage slot to another customer's payment - modeled on
 * StaffAuthGuard's always-mounted MfaSetupModal (a boolean/list resolved
 * from a mount-time fetch drives an unconditionally-rendered modal).
 *
 * No "dismissed forever" state: closing it (X button or backdrop click)
 * only hides it for this visit - it reappears on the next dashboard load
 * until every listed booking is rescheduled, which clears its
 * slot_conflict_at server-side (reschedule.service.ts). Each row links to
 * `/portal/bookings?open=<id>` - the same `?open=` deep-link convention
 * NotificationsPage already uses - which auto-opens that booking's details
 * on the My Bookings page, where Reschedule is one of its existing actions.
 */
export function SlotConflictModal({
  bookings,
  onClose,
}: SlotConflictModalProps) {
  return (
    <Modal
      isOpen={bookings.length > 0}
      title={
        bookings.length === 1
          ? 'A booking slot is no longer available'
          : `${bookings.length} booking slots are no longer available`
      }
      onClose={onClose}
    >
      <p className={styles.intro}>
        Another customer paid their downpayment before you did for the following{' '}
        {bookings.length === 1 ? 'booking' : 'bookings'}. Please update the
        date, time, staff, or cage on each one below.
      </p>

      <ul className={styles.list}>
        {bookings.map((booking) => (
          <li key={booking.id}>
            <Link
              to={`/portal/bookings?open=${booking.id}`}
              className={styles.row}
              onClick={onClose}
            >
              <span className={styles.rowTitle}>
                {booking.service_category}
                {booking.pet_name ? ` - ${booking.pet_name}` : ''}
              </span>
              <span className={styles.rowMeta}>
                {booking.branch_name ?? 'Branch'} &middot;{' '}
                {formatDateTime(booking.scheduled_start)}
              </span>
              {booking.conflict_notice ? (
                <span className={styles.rowNotice}>
                  {booking.conflict_notice}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
