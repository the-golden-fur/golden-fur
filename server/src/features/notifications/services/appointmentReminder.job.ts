import { supabase } from '../../../config/supabase/supabase.config.ts';
import { createNotification } from './notification.service.ts';
import { sendAppointmentReminderEmail } from '../../../shared/email/appointmentReminderEmail.ts';
import {
  DEFAULT_REMINDER_OFFSET_MINUTES,
  type NotificationPreferences,
} from '../notifications.types.ts';

/**
 * Issue #99, reworked for configurable reminder timing (Settings >
 * Preferences: "Set when does reminder appear"): used to run once/day at a
 * fixed 8am and check bookings scheduled "tomorrow" - that can't honor a
 * per-customer offset (15 min / 1h / 3h / 1 day / 2 days before), so this
 * now polls every 15 minutes (the finest preset) instead. Mirrors
 * maintenance/jobs/promoExpiry.job.ts's exact in-process setTimeout
 * scheduler shape (no external job-runner package).
 *
 * A booking is only ever reminded once - bookings.reminder_sent_at is
 * claimed via a conditional UPDATE (single-writer pattern, same as
 * webhookConfirmation.service.ts's own idempotent UPDATE) before sending,
 * so a booking whose customer disabled both notification channels for this
 * event still only gets evaluated once past its fire time, not re-checked
 * on every subsequent poll for the rest of the lookahead window.
 */

const POLL_INTERVAL_MS = 15 * 60 * 1000;
// Widest offset preset is 2 days (2880 min) - the lookahead window has to
// reach at least that far ahead so a booking's fire time is ever inside the
// query's range in the first place.
const LOOKAHEAD_MS = 3 * 24 * 60 * 60 * 1000;

interface ReminderBookingRow {
  id: string;
  customer_id: string;
  branch_id: string;
  service_category: string;
  scheduled_start: string;
}

async function resolveReminderOffsetByCustomer(
  customerIds: string[]
): Promise<Map<string, number>> {
  const offsetByCustomer = new Map<string, number>();
  if (customerIds.length === 0) return offsetByCustomer;

  const { data } = await supabase
    .from('customer_profiles')
    .select('id, notification_preferences')
    .in('id', customerIds);

  for (const row of data ?? []) {
    const preferences = row.notification_preferences as
      | NotificationPreferences
      | undefined;
    const offset = preferences?.appointment_reminder?.reminder_offset_minutes;

    offsetByCustomer.set(
      row.id as string,
      typeof offset === 'number' ? offset : DEFAULT_REMINDER_OFFSET_MINUTES
    );
  }

  return offsetByCustomer;
}

/** Exported for the batch itself to be tested without waiting on the
 * scheduler's real clock. */
export async function runAppointmentReminderJob(
  now: Date = new Date()
): Promise<number> {
  const windowEnd = new Date(now.getTime() + LOOKAHEAD_MS).toISOString();

  const { data, error } = await supabase
    .from('bookings')
    .select('id, customer_id, branch_id, service_category, scheduled_start')
    .in('status', ['Pending', 'In Progress'])
    .is('reminder_sent_at', null)
    .gte('scheduled_start', now.toISOString())
    .lt('scheduled_start', windowEnd);

  if (error) {
    throw new Error(`Appointment reminder job failed: ${error.message}`);
  }

  const bookings = (data ?? []) as ReminderBookingRow[];
  if (bookings.length === 0) return 0;

  const offsetByCustomer = await resolveReminderOffsetByCustomer([
    ...new Set(bookings.map((booking) => booking.customer_id)),
  ]);

  let sentCount = 0;

  for (const booking of bookings) {
    const offsetMinutes =
      offsetByCustomer.get(booking.customer_id) ??
      DEFAULT_REMINDER_OFFSET_MINUTES;
    const fireAtMs =
      new Date(booking.scheduled_start).getTime() - offsetMinutes * 60_000;

    if (now.getTime() < fireAtMs) continue;

    const { data: claimed } = await supabase
      .from('bookings')
      .update({ reminder_sent_at: now.toISOString() })
      .eq('id', booking.id)
      .is('reminder_sent_at', null)
      .select('id')
      .maybeSingle();

    // A concurrent run already claimed this booking - not our send.
    if (!claimed) continue;

    await sendAppointmentReminderNotification(booking);
    sentCount += 1;
  }

  return sentCount;
}

async function sendAppointmentReminderNotification(
  booking: ReminderBookingRow
): Promise<void> {
  try {
    const [{ data: customer }, { data: branch }] = await Promise.all([
      supabase
        .from('customer_profiles')
        .select('account_email')
        .eq('id', booking.customer_id)
        .maybeSingle(),
      supabase
        .from('branches')
        .select('name')
        .eq('id', booking.branch_id)
        .maybeSingle(),
    ]);

    const scheduledDate = new Date(
      booking.scheduled_start
    ).toLocaleDateString();
    const scheduledTime = new Date(booking.scheduled_start).toLocaleTimeString(
      [],
      { hour: '2-digit', minute: '2-digit' }
    );

    await createNotification({
      recipientCustomerId: booking.customer_id,
      eventType: 'appointment_reminder',
      title: 'Appointment reminder',
      message: `Reminder: your ${booking.service_category} appointment is on ${scheduledDate} at ${scheduledTime}.`,
      relatedBookingId: booking.id,
      sendEmail: customer?.account_email
        ? () =>
            sendAppointmentReminderEmail({
              to: customer.account_email,
              serviceCategory: booking.service_category,
              branchName: branch?.name ?? '',
              scheduledDate,
              scheduledTime,
            })
        : undefined,
    });
  } catch (error) {
    console.error(
      `Failed to send appointment_reminder notification for booking ${booking.id}:`,
      error
    );
  }
}

/**
 * Starts the poller; returns a stop function. A run failure (or an
 * individual booking's notification failure, already swallowed inside
 * sendAppointmentReminderNotification) is logged and never crashes the
 * server process - the next poll picks up the slack.
 */
export function startAppointmentReminderScheduler(): () => void {
  let timer: ReturnType<typeof setTimeout>;

  const runAndReschedule = async () => {
    try {
      await runAppointmentReminderJob();
    } catch (error) {
      console.error(error);
    }

    timer = setTimeout(runAndReschedule, POLL_INTERVAL_MS);
  };

  timer = setTimeout(runAndReschedule, POLL_INTERVAL_MS);

  return () => clearTimeout(timer);
}
