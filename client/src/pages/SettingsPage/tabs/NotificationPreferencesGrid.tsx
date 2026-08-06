import { useEffect, useState } from 'react';
import { ToggleSwitch } from '../../../shared/components/ToggleSwitch/ToggleSwitch';
import {
  getNotificationPreferences,
  updateNotificationPreference,
  type NotificationChannel,
  type NotificationPreferences,
} from '../../../shared/api/preferences.api';
import type { ThemeRole } from '../../../shared/providers/ThemeProvider/themeContext';
import type { NotificationEventType } from '../../../features/notifications/notifications.types';
import styles from '../SettingsPage.module.css';

interface NotificationPreferencesGridProps {
  role: ThemeRole;
  userId: string;
  accessToken: string;
}

/**
 * The 8 notification_event_type values split by which recipient column
 * notification.service.ts actually writes to (server/src/features/.../
 * bookingNotifications.service.ts, careLogNotifications.service.ts,
 * checkoutAggregation.service.ts, appointmentReminder.job.ts use
 * recipientCustomerId; staffManagement.service.ts and staffAuth.controller.ts's
 * forgot-password handler use recipientStaffId) - there's no code path that
 * fires any of the 6 booking/payment/care-log events for a staff recipient,
 * or account_created/password_reset for a customer, so each role only ever
 * sees the subset it can actually receive. Every staff role (including Admin
 * and Superadmin) shares the same 2 staff-facing event types - the event
 * catalog has no admin-only event today.
 */
const EVENT_TYPES_BY_ROLE: Record<
  ThemeRole,
  { type: NotificationEventType; label: string }[]
> = {
  staff: [
    { type: 'account_created', label: 'Account created' },
    { type: 'password_reset', label: 'Password reset requested' },
  ],
  customer: [
    { type: 'booking_confirmed', label: 'Booking made' },
    { type: 'appointment_reminder', label: 'Booking reminder' },
    { type: 'booking_rescheduled', label: 'Booking rescheduled' },
    { type: 'booking_cancelled', label: 'Booking cancellation' },
    { type: 'payment_confirmed', label: 'Payment confirmed' },
    { type: 'care_log_completed', label: 'Pet care log completed' },
  ],
};

const DEFAULT_CHANNEL_PREFERENCE = { email: true, in_browser: true };

export function NotificationPreferencesGrid({
  role,
  userId,
  accessToken,
}: NotificationPreferencesGridProps) {
  const [preferences, setPreferences] =
    useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    void getNotificationPreferences(role, userId).then((result) => {
      if (isMounted) {
        setPreferences(result);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [role, userId]);

  const setChannel = (
    eventType: NotificationEventType,
    channel: NotificationChannel,
    enabled: boolean
  ) => {
    setPreferences((current) => {
      const base = current ?? ({} as NotificationPreferences);
      return {
        ...base,
        [eventType]: {
          ...DEFAULT_CHANNEL_PREFERENCE,
          ...base[eventType],
          [channel]: enabled,
        },
      };
    });
  };

  const handleToggle = (
    eventType: NotificationEventType,
    channel: NotificationChannel,
    enabled: boolean
  ) => {
    setChannel(eventType, channel, enabled);

    void updateNotificationPreference(
      role,
      accessToken,
      eventType,
      channel,
      enabled
    ).then((result) => {
      if (result.error) {
        setChannel(eventType, channel, !enabled);
      }
    });
  };

  const events = EVENT_TYPES_BY_ROLE[role];

  if (isLoading) {
    return <p className={styles.copy}>Loading notification preferences...</p>;
  }

  return (
    <div className={styles.notificationGrid}>
      <div className={styles.notificationGridHeader}>
        <span />
        <span>Email</span>
        <span>In-browser</span>
      </div>
      {events.map(({ type, label }) => {
        const channelPreference =
          preferences?.[type] ?? DEFAULT_CHANNEL_PREFERENCE;

        return (
          <div key={type} className={styles.notificationGridRow}>
            <span className={styles.notificationGridLabel}>{label}</span>
            <ToggleSwitch
              checked={channelPreference.email}
              onChange={(checked) => handleToggle(type, 'email', checked)}
              label={`Email notifications for ${label}`}
              hideLabel
            />
            <ToggleSwitch
              checked={channelPreference.in_browser}
              onChange={(checked) => handleToggle(type, 'in_browser', checked)}
              label={`In-browser notifications for ${label}`}
              hideLabel
            />
          </div>
        );
      })}
    </div>
  );
}
