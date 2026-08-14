import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../api/notifications.api';
import type { Notification } from '../../notifications.types';
import { NotificationDropdown } from '../NotificationDropdown/NotificationDropdown';
import styles from './NotificationBell.module.css';

interface NotificationBellProps {
  accessToken: string;
  /** Route to the full notifications page - passed through to the dropdown's "View all" link. */
  notificationsHref: string;
}

/**
 * Bell icon with an unread-count badge (aliasing
 * --color-notification-unread-*, not a new hue) - opens NotificationDropdown
 * on click. Owns the inbox fetch and optimistic read-state updates so the
 * dropdown itself stays a plain presentational panel. Rendered for both
 * staff and customers (StaffAuthGuard/CustomerAuthGuard).
 */
export function NotificationBell({
  accessToken,
  notificationsHref,
}: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void listNotifications(accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      setNotifications(result.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // AC-3: clicking a notification marks it read and updates the unread
  // count immediately via local state, without waiting for a full inbox
  // refetch.
  async function handleSelect(notification: Notification) {
    if (notification.is_read) {
      return;
    }

    setNotifications((current) =>
      current.map((item) =>
        item.id === notification.id ? { ...item, is_read: true } : item
      )
    );

    await markNotificationRead(notification.id, accessToken);
  }

  // AC-4: mark-all-as-read clears the badge to zero and marks every row in
  // the dropdown read, same optimistic-update pattern.
  async function handleMarkAllRead() {
    setNotifications((current) =>
      current.map((item) => ({ ...item, is_read: true }))
    );

    await markAllNotificationsRead(accessToken);
  }

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Notifications"
        onClick={() => setIsOpen((current) => !current)}
      >
        <Bell size={18} aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className={styles.badge}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>
      {isOpen ? (
        <div className={styles.dropdownAnchor}>
          <NotificationDropdown
            notifications={notifications}
            isLoading={isLoading}
            error={error}
            unreadCount={unreadCount}
            onSelect={(notification) => void handleSelect(notification)}
            onMarkAllRead={() => void handleMarkAllRead()}
            notificationsHref={notificationsHref}
            onViewAll={() => setIsOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
