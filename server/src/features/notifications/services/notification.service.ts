import { supabase } from '../../../config/supabase/supabase.config.ts';
import type {
  CreateNotificationParams,
  Notification,
  NotificationPreferences,
} from '../notifications.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface RecipientPreferences {
  email: boolean;
  inBrowser: boolean;
}

// Preferences live on staff_profiles/customer_profiles (Settings >
// Preferences) as a jsonb map keyed by event type, not on the notifications
// table itself. A recipient with no matching row, or no entry for this
// specific event_type (shouldn't happen in practice - every event type has a
// default in the column's migration default), defaults to both channels on
// rather than silently going dark.
async function getRecipientPreferences(
  params: CreateNotificationParams
): Promise<RecipientPreferences> {
  const table = params.recipientStaffId
    ? 'staff_profiles'
    : 'customer_profiles';
  const recipientId = params.recipientStaffId ?? params.recipientCustomerId;

  const { data } = await supabase
    .from(table)
    .select('notification_preferences')
    .eq('id', recipientId)
    .maybeSingle();

  const preferences = data?.notification_preferences as
    | NotificationPreferences
    | undefined;
  const eventPreference = preferences?.[params.eventType];

  return {
    email: eventPreference?.email ?? true,
    inBrowser: eventPreference?.in_browser ?? true,
  };
}

/**
 * Issue #97: the ONE write path every event-triggering module calls into
 * (Issues #98, #99, plus the account_created/password_reset call sites this
 * issue adds directly) - writes the notifications row first, unconditionally,
 * then best-effort sends the email leg where the caller supplied one. A
 * Resend failure is logged for admin review but never rolls back the row or
 * rethrows, mirroring Modules-Features' own "a failed send is logged for
 * admin review but does not roll back any system state" requirement and the
 * non-blocking pattern already established for account_created's email
 * (staffManagement.service.ts).
 *
 * Both legs are now gated independently on the recipient's own Settings >
 * Preferences toggles: the row is only inserted (and thus only ever shows up
 * in the bell/portal inbox) if in_browser_notifications_enabled is true, and
 * the email thunk is only invoked if email_notifications_enabled is true -
 * a recipient can opt out of either channel without affecting the other.
 */
export async function createNotification(
  params: CreateNotificationParams
): Promise<Notification | null> {
  const preferences = await getRecipientPreferences(params);

  let notification: Notification | null = null;

  if (preferences.inBrowser) {
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        recipient_staff_id: params.recipientStaffId ?? null,
        recipient_customer_id: params.recipientCustomerId ?? null,
        event_type: params.eventType,
        title: params.title,
        message: params.message,
        related_booking_id: params.relatedBookingId ?? null,
      })
      .select('*')
      .maybeSingle();

    if (error || !data) {
      throwWithStatus(400, error?.message ?? 'Failed to create notification');
    }

    notification = data as Notification;
  }

  if (preferences.email && params.sendEmail) {
    try {
      await params.sendEmail();
    } catch (emailError) {
      console.error(`Failed to send ${params.eventType} email:`, emailError);
    }
  }

  return notification;
}

interface InboxParams {
  recipientId: string;
}

export async function getInboxForStaff({
  recipientId,
}: InboxParams): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_staff_id', recipientId)
    .order('created_at', { ascending: false });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as Notification[];
}

export async function getInboxForCustomer({
  recipientId,
}: InboxParams): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_customer_id', recipientId)
    .order('created_at', { ascending: false });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as Notification[];
}

interface MarkReadParams {
  notificationId: string;
  recipientId: string;
  isStaff: boolean;
}

/**
 * Scoped to the caller's own recipient column - an id belonging to someone
 * else's inbox silently matches zero rows (404) rather than leaking whether
 * it exists, mirroring markAllRead's own "only mine" scoping below. Only
 * is_read is ever written here at the application layer, per #96's dev
 * notes on UPDATE being restricted to that one column by convention.
 */
export async function markRead({
  notificationId,
  recipientId,
  isStaff,
}: MarkReadParams): Promise<Notification> {
  const recipientColumn = isStaff
    ? 'recipient_staff_id'
    : 'recipient_customer_id';

  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq(recipientColumn, recipientId)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Notification not found');

  return data as Notification;
}

interface MarkAllReadParams {
  recipientId: string;
  isStaff: boolean;
}

export async function markAllRead({
  recipientId,
  isStaff,
}: MarkAllReadParams): Promise<void> {
  const recipientColumn = isStaff
    ? 'recipient_staff_id'
    : 'recipient_customer_id';

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq(recipientColumn, recipientId)
    .eq('is_read', false);

  if (error) throwWithStatus(400, error.message);
}
