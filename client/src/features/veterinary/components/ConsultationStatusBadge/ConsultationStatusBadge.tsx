import type { ConsultationStatus } from '../../veterinary.types';
import styles from './ConsultationStatusBadge.module.css';

interface ConsultationStatusBadgeProps {
  status: ConsultationStatus;
}

const STATUS_CLASSNAME: Record<ConsultationStatus, keyof typeof styles> = {
  Pending: 'pending',
  Ongoing: 'ongoing',
  Completed: 'completed',
};

/** Issue #70: Pending/Ongoing/Completed pill for the Veterinary Console -
 * its own token set, distinct from BookingStatusBadge/GroomingStatusBadge
 * (execution-record state, not booking state). */
export function ConsultationStatusBadge({
  status,
}: ConsultationStatusBadgeProps) {
  return <span className={styles[STATUS_CLASSNAME[status]]}>{status}</span>;
}
