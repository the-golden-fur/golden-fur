import { CircleAlert, CircleCheck, Clock } from 'lucide-react';
import type { VaccinationRecordStatus } from '../../../customer.types';
import styles from './VaccinationStatusBadge.module.css';

const BADGE: Record<
  VaccinationRecordStatus,
  { label: string; className: string; Icon: typeof CircleCheck }
> = {
  verified: {
    label: 'Verified by clinic',
    className: styles.verified,
    Icon: CircleCheck,
  },
  pending: {
    label: 'Pending verification',
    className: styles.pending,
    Icon: Clock,
  },
  rejected: {
    label: 'Rejected',
    className: styles.rejected,
    Icon: CircleAlert,
  },
};

/** Whether the clinic has checked a vaccination record - icon plus words,
 * never colour alone. Information only: nothing in booking reads it. */
export function VaccinationStatusBadge({
  status,
}: {
  status: VaccinationRecordStatus;
}) {
  const { label, className, Icon } = BADGE[status];

  return (
    <span className={`${styles.badge} ${className}`}>
      <Icon size={12} aria-hidden="true" />
      {label}
    </span>
  );
}
