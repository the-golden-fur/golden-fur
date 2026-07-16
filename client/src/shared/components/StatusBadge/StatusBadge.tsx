import styles from './StatusBadge.module.css';

interface StatusBadgeProps {
  isActive: boolean;
}

/**
 * Active/Inactive "enabled for sale" pill, shared by all four Epic A admin
 * pages (#45-#48). Deliberately distinct from Sprint 1's availability badge -
 * "active" here means the row is sellable, not that a staff member is free.
 */
export function StatusBadge({ isActive }: StatusBadgeProps) {
  return (
    <span className={isActive ? styles.active : styles.inactive}>
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}
