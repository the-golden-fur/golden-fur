import type { BookingStatus } from '../../../booking.types';
import styles from './BookingStatusBadge.module.css';

interface BookingStatusBadgeProps {
  status: BookingStatus;
}

const STATUS_CLASSNAME: Record<BookingStatus, keyof typeof styles> = {
  Pending: 'pending',
  'In Progress': 'inProgress',
  Completed: 'completed',
  Paid: 'paid',
  Cancelled: 'cancelled',
  'No-show': 'noshow',
};

/**
 * Pending/In Progress/Completed/Paid/Cancelled/No-show pill, built once
 * here (#55) and reused everywhere a booking's status is shown - the
 * receptionist queue, customer bookings list, and (booking-status revision)
 * every category's own execution UI (Grooming/Veterinary/Daycare/Hotel),
 * which no longer maintain their own separate status badge/vocabulary.
 */
export function BookingStatusBadge({ status }: BookingStatusBadgeProps) {
  return <span className={styles[STATUS_CLASSNAME[status]]}>{status}</span>;
}
