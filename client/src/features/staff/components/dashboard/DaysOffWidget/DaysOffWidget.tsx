import { Link } from 'react-router';
import { UnavailabilityBlockBadge } from '../../badges/UnavailabilityBlockBadge/UnavailabilityBlockBadge';
import styles from './DaysOffWidget.module.css';

interface DaysOffWidgetProps {
  staffId: string;
  accessToken: string;
}

/**
 * Dashboard widget - the caller's own current availability at a glance
 * (UnavailabilityBlockBadge, same as DaysOffPage), with a click-through to
 * request or review time off. Not a QueueWidgetCard: availability is a
 * status, not a count, so it doesn't fit that shell's count/latest shape.
 */
export function DaysOffWidget({ staffId, accessToken }: DaysOffWidgetProps) {
  return (
    <Link to="/staff/days-off" className={styles.card}>
      <h2 className={styles.title}>Days Off</h2>
      <p className={styles.copy}>Request a day off, or check your status.</p>
      <UnavailabilityBlockBadge staffId={staffId} accessToken={accessToken} />
    </Link>
  );
}
