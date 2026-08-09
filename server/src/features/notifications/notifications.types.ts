/**
 * Mirrors the notification_event_type enum (migration 20260805094, Issue
 * #96) - exact 8 values per Modules-Features.
 */
export const NOTIFICATION_EVENT_TYPES = [
  'account_created',
  'password_reset',
  'booking_confirmed',
  'booking_rescheduled',
  'payment_confirmed',
  'appointment_reminder',
  'booking_cancelled',
  'care_log_completed',
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const NOTIFICATION_CHANNELS = ['email', 'in_browser'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type NotificationChannelPreference = Record<
  NotificationChannel,
  boolean
>;

/** Presets for "how long before the appointment should the reminder fire" -
 * only meaningful on the 'appointment_reminder' event's preference entry.
 * 1440 (1 day before) matches the reminder job's pre-existing fixed
 * behavior, kept as the default so an unset preference doesn't change
 * anything for a customer who's never touched this setting. */
export const REMINDER_OFFSET_MINUTES_OPTIONS = [
  15, 60, 180, 1440, 2880,
] as const;
export type ReminderOffsetMinutes =
  (typeof REMINDER_OFFSET_MINUTES_OPTIONS)[number];
export const DEFAULT_REMINDER_OFFSET_MINUTES: ReminderOffsetMinutes = 1440;

export type NotificationEventPreference = NotificationChannelPreference & {
  /** Only ever set on the 'appointment_reminder' entry - see
   * REMINDER_OFFSET_MINUTES_OPTIONS. */
  reminder_offset_minutes?: number;
};

export type NotificationPreferences = Record<
  NotificationEventType,
  NotificationEventPreference
>;

export interface Notification {
  id: string;
  recipient_staff_id: string | null;
  recipient_customer_id: string | null;
  event_type: NotificationEventType;
  title: string;
  message: string;
  related_booking_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface CreateNotificationParams {
  recipientStaffId?: string | null;
  recipientCustomerId?: string | null;
  eventType: NotificationEventType;
  title: string;
  message: string;
  relatedBookingId?: string | null;
  /**
   * Best-effort email leg - the caller builds the actual send call (each of
   * the 8 event types needs different template params, so notification.
   * service.ts stays decoupled from all six templates' specific shapes)
   * and hands it here as a thunk. Omitted entirely for password_reset (no
   * Resend template exists for that event - see Sprint6-EpicA-Guide's Spec
   * Tensions). Never blocks or rolls back the notification row - a
   * rejection is caught and logged, not rethrown.
   */
  sendEmail?: () => Promise<void>;
}
