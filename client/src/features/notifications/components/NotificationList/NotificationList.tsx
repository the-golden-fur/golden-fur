import type { Notification } from '../../notifications.types';
import styles from './NotificationList.module.css';

interface NotificationListProps {
  notifications: Notification[];
  isLoading: boolean;
  error: string | null;
  onSelect: (notification: Notification) => void;
}

function formatTimestamp(createdAt: string): string {
  return new Date(createdAt).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Issue #100/#101: one shared list-rendering implementation for both the
 * staff NotificationDropdown and the customer portal's notifications page -
 * not two near-duplicate ones. Unread rows are highlighted with the new
 * --color-notification-unread-* token pair (aliases the existing amber
 * "needs attention" tier, not a new hue - Sprint6-EpicA-Design.xlsx ->
 * Styles). Clicking any row marks it read via onSelect; the caller owns the
 * actual API call and optimistic-update state (both call sites do this
 * slightly differently - dropdown updates a badge count, the portal page
 * just re-renders the list).
 */
export function NotificationList({
  notifications,
  isLoading,
  error,
  onSelect,
}: NotificationListProps) {
  if (isLoading) {
    return <p className={styles.copy}>Loading notifications...</p>;
  }

  if (error) {
    return (
      <p className={styles.errorBanner} role="alert">
        {error}
      </p>
    );
  }

  if (notifications.length === 0) {
    return <p className={styles.copy}>No notifications yet.</p>;
  }

  return (
    <ul className={styles.list}>
      {notifications.map((notification) => (
        <li key={notification.id}>
          <button
            type="button"
            className={notification.is_read ? styles.item : styles.itemUnread}
            onClick={() => onSelect(notification)}
          >
            <span className={styles.title}>{notification.title}</span>
            <p className={styles.message}>{notification.message}</p>
            <span className={styles.timestamp}>
              {formatTimestamp(notification.created_at)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
