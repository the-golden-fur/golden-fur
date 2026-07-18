import type { BookingStatus } from '../../../booking.types';
import styles from './BookingStatusBadge.module.css';

interface BookingStatusBadgeProps {
  status: BookingStatus;
}

const STATUS_CLASSNAME: Record<BookingStatus, keyof typeof styles> = {
  Confirmed: 'confirmed',
  Completed: 'completed',
  Pending: 'pending',
  Cancelled: 'cancelled',
  'No-show': 'noshow',
};

/**
 * Confirmed/Completed/Pending/Cancelled/No-show pill, built once here (#55)
 * and reused by #59 (customer bookings list) and #60 (receptionist queue).
 */
export function BookingStatusBadge({ status }: BookingStatusBadgeProps) {
  return (
    <span className={styles[STATUS_CLASSNAME[status]]}>{status}</span>
  );
}
