import { Link } from 'react-router';
import type { Notification } from '../../notifications.types';
import { NotificationList } from '../NotificationList/NotificationList';
import styles from './NotificationDropdown.module.css';

interface NotificationDropdownProps {
  notifications: Notification[];
  isLoading: boolean;
  error: string | null;
  unreadCount: number;
  onSelect: (notification: Notification) => void;
  onMarkAllRead: () => void;
  /** Route to the full notifications page - "View all" navigates here. */
  notificationsHref: string;
  onViewAll: () => void;
}

/**
 * Issue #100: the staff-facing dropdown panel opened by NotificationBell -
 * renders through the shared NotificationList (same component #101's
 * customer tab uses) with a "Mark all as read" action on top, inherited
 * tokens only (no styling of its own beyond layout/positioning).
 */
export function NotificationDropdown({
  notifications,
  isLoading,
  error,
  unreadCount,
  onSelect,
  onMarkAllRead,
  notificationsHref,
  onViewAll,
}: NotificationDropdownProps) {
  return (
    <div className={styles.panel} role="menu" aria-label="Notifications">
      <div className={styles.header}>
        <span className={styles.heading}>Notifications</span>
        <button
          type="button"
          className={styles.markAllButton}
          onClick={onMarkAllRead}
          disabled={unreadCount === 0}
        >
          Mark all as read
        </button>
      </div>
      <div className={styles.body}>
        <NotificationList
          notifications={notifications}
          isLoading={isLoading}
          error={error}
          onSelect={onSelect}
        />
      </div>
      <Link
        to={notificationsHref}
        className={styles.viewAllLink}
        onClick={onViewAll}
      >
        View all
      </Link>
    </div>
  );
}
