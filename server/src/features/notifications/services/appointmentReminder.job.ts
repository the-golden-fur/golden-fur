import { supabase } from '../../../config/supabase/supabase.config.ts';
import { createNotification } from './notification.service.ts';
import { sendAppointmentReminderEmail } from '../../../shared/email/appointmentReminderEmail.ts';

/**
 * Issue #99: a genuinely new daily CRON - no scheduler infrastructure
 * existed anywhere in the app before this issue. Mirrors
 * maintenance/jobs/promoExpiry.job.ts's exact in-process setTimeout
 * scheduler shape (no external job-runner package) rather than introducing
 * a new dependency like node-cron - the app already has one working
 * precedent for "no background job runner" and this reuses that shape.
 *
 * Fires at 8:00 AM server time, once per booking whose scheduled_start
 * falls tomorrow (calendar date) and whose status is still Pending or
 * In Progress - a Completed/Cancelled/No-show booking never gets a reminder.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const RUN_HOUR = 8;
const RUN_MINUTE = 0;

interface ReminderBookingRow {
  id: string;
  customer_id: string;
  branch_id: string;
  service_category: string;
  scheduled_start: string;
}

function tomorrowRange(now: Date): { start: string; end: string } {
  const start = new Date(now);
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start.getTime() + DAY_MS);

  return { start: start.toISOString(), end: end.toISOString() };
}

/** Exported for the batch itself to be tested without waiting on the
 * scheduler's real clock. */
export async function runAppointmentReminderJob(
  now: Date = new Date()
): Promise<number> {
  const { start, end } = tomorrowRange(now);

  const { data, error } = await supabase
    .from('bookings')
    .select('id, customer_id, branch_id, service_category, scheduled_start')
    .in('status', ['Pending', 'In Progress'])
    .gte('scheduled_start', start)
    .lt('scheduled_start', end);

  if (error) {
    throw new Error(`Appointment reminder job failed: ${error.message}`);
  }

  const bookings = (data ?? []) as ReminderBookingRow[];

  for (const booking of bookings) {
    await sendAppointmentReminderNotification(booking);
  }

  return bookings.length;
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
      message: `Reminder: your ${booking.service_category} appointment is tomorrow, ${scheduledDate} at ${scheduledTime}.`,
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

export function msUntilNextRun(now: Date = new Date()): number {
  const next = new Date(now);
  next.setHours(RUN_HOUR, RUN_MINUTE, 0, 0);

  if (next.getTime() <= now.getTime()) {
    next.setTime(next.getTime() + DAY_MS);
  }

  return next.getTime() - now.getTime();
}

/**
 * Starts the daily scheduler; returns a stop function. A run failure (or an
 * individual booking's notification failure, already swallowed inside
 * sendAppointmentReminderNotification) is logged and never crashes the
 * server process - the next scheduled run picks up the slack, mirroring
 * promoExpiry.job.ts's precedent (AC-4: zero matching bookings completes
 * without error and sends zero notifications).
 */
export function startAppointmentReminderScheduler(): () => void {
  let timer: ReturnType<typeof setTimeout>;

  const runAndReschedule = async () => {
    try {
      await runAppointmentReminderJob();
    } catch (error) {
      console.error(error);
    }

    timer = setTimeout(runAndReschedule, msUntilNextRun());
  };

  timer = setTimeout(runAndReschedule, msUntilNextRun());

  return () => clearTimeout(timer);
}
