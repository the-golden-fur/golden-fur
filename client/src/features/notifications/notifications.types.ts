/** Client mirror of the server's NotificationEventType (notifications.types.ts). */
export type NotificationEventType =
  | 'account_created'
  | 'password_reset'
  | 'booking_confirmed'
  | 'booking_rescheduled'
  | 'payment_confirmed'
  | 'appointment_reminder'
  | 'booking_cancelled'
  | 'care_log_completed'
  | 'message_received';

export interface Notification {
  id: string;
  recipient_staff_id: string | null;
  recipient_customer_id: string | null;
  event_type: NotificationEventType;
  title: string;
  message: string;
  related_booking_id: string | null;
  related_thread_id: string | null;
  is_read: boolean;
  is_starred: boolean;
  is_deleted: boolean;
  created_at: string;
}
