import type { GroomingStatus } from '../../grooming.types';
import styles from './GroomingStatusBadge.module.css';

interface GroomingStatusBadgeProps {
  status: GroomingStatus;
}

const STATUS_CLASSNAME: Record<GroomingStatus, keyof typeof styles> = {
  Waiting: 'waiting',
  'In Progress': 'inProgress',
  Completed: 'completed',
};

/** Issue #68: Waiting/In Progress/Completed pill for the Groomer Dashboard -
 * a distinct token set from BookingStatusBadge (execution-record state, not
 * booking state). */
export function GroomingStatusBadge({ status }: GroomingStatusBadgeProps) {
  return <span className={styles[STATUS_CLASSNAME[status]]}>{status}</span>;
}
