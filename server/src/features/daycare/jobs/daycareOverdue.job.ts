import { supabase } from '../../../config/supabase/supabase.config.ts';
import { createNotification } from '../../notifications/services/notification.service.ts';
import { sendDaycareOverdueEmail } from '../../../shared/email/daycareOverdueEmail.ts';
import {
  DAYCARE_OVERDUE_FEE_PER_HOUR,
  DAYCARE_OVERDUE_GRACE_MINUTES,
} from '../modules/daycareCharge.util.ts';

/**
 * Custom change (Daycare overdue checkout fee): tells the owner once when
 * their booked Daycare pet is still checked in past its booked end time
 * (the booking's scheduled_end), so the per-hour overdue fee billed at
 * checkout (daycareBilling.service.ts) never comes as a surprise. Fires as
 * soon as the booked end passes - before the grace period is up - so the
 * owner still has the chance to make it in time.
 *
 * Mirrors notifications/services/appointmentReminder.job.ts's in-process
 * setTimeout poller and its claim-then-send dedupe: stays.overdue_notified_at
 * is claimed via a conditional UPDATE before sending, so a stay is only ever
 * notified once however many polls pass while the pet is still there. A
 * walk-in (no booking) has no booked end time and is never picked up here.
 */

const POLL_INTERVAL_MS = 5 * 60 * 1000;

interface ActiveDaycareStayRow {
  id: string;
  booking_id: string;
  pet_id: string;
  branch_id: string;
}

interface OverdueBookingRow {
  id: string;
  customer_id: string;
  scheduled_end: string;
}

/** Exported for the batch itself to be tested without waiting on the
 * scheduler's real clock. */
export async function runDaycareOverdueJob(
  now: Date = new Date()
): Promise<number> {
  const { data: stayRows, error } = await supabase
    .from('stays')
    .select('id, booking_id, pet_id, branch_id')
    .eq('stay_type', 'Daycare')
    .eq('status', 'Active')
    .is('overdue_notified_at', null)
    .not('booking_id', 'is', null);

  if (error) {
    throw new Error(`Daycare overdue job failed: ${error.message}`);
  }

  const stays = (stayRows ?? []) as ActiveDaycareStayRow[];
  if (stays.length === 0) return 0;

  const { data: bookingRows, error: bookingsError } = await supabase
    .from('bookings')
    .select('id, customer_id, scheduled_end')
    .in(
      'id',
      stays.map((stay) => stay.booking_id)
    )
    .lt('scheduled_end', now.toISOString());

  if (bookingsError) {
    throw new Error(`Daycare overdue job failed: ${bookingsError.message}`);
  }

  const overdueBookingById = new Map(
    ((bookingRows ?? []) as OverdueBookingRow[]).map((row) => [row.id, row])
  );

  let sentCount = 0;

  for (const stay of stays) {
    const booking = overdueBookingById.get(stay.booking_id);
    if (!booking) continue;

    const { data: claimed } = await supabase
      .from('stays')
      .update({ overdue_notified_at: now.toISOString() })
      .eq('id', stay.id)
      .is('overdue_notified_at', null)
      .select('id')
      .maybeSingle();

    // A concurrent run already claimed this stay - not our send.
    if (!claimed) continue;

    await sendDaycareOverdueNotification(stay, booking);
    sentCount += 1;
  }

  return sentCount;
}

async function sendDaycareOverdueNotification(
  stay: ActiveDaycareStayRow,
  booking: OverdueBookingRow
): Promise<void> {
  try {
    const [{ data: customer }, { data: branch }, { data: pet }] =
      await Promise.all([
        supabase
          .from('customer_profiles')
          .select('account_email')
          .eq('id', booking.customer_id)
          .maybeSingle(),
        supabase
          .from('branches')
          .select('name')
          .eq('id', stay.branch_id)
          .maybeSingle(),
        supabase
          .from('pets')
          .select('name')
          .eq('id', stay.pet_id)
          .maybeSingle(),
      ]);

    const petName = pet?.name ?? 'Your pet';
    const scheduledEndTime = new Date(booking.scheduled_end).toLocaleTimeString(
      [],
      { hour: '2-digit', minute: '2-digit' }
    );

    await createNotification({
      recipientCustomerId: booking.customer_id,
      eventType: 'daycare_overdue',
      title: 'Pet past checkout time',
      message: `${petName} is past the booked daycare checkout time (${scheduledEndTime}). An overdue fee of ₱${DAYCARE_OVERDUE_FEE_PER_HOUR} per hour applies once pickup is more than ${DAYCARE_OVERDUE_GRACE_MINUTES} minutes late and is added to your bill at checkout.`,
      relatedBookingId: booking.id,
      sendEmail: customer?.account_email
        ? () =>
            sendDaycareOverdueEmail({
              to: customer.account_email,
              petName,
              branchName: branch?.name ?? '',
              scheduledEndTime,
              feePerHour: DAYCARE_OVERDUE_FEE_PER_HOUR,
              graceMinutes: DAYCARE_OVERDUE_GRACE_MINUTES,
            })
        : undefined,
    });
  } catch (error) {
    console.error(
      `Failed to send daycare_overdue notification for stay ${stay.id}:`,
      error
    );
  }
}

/**
 * Starts the poller; returns a stop function. A run failure (or an
 * individual stay's notification failure, already swallowed inside
 * sendDaycareOverdueNotification) is logged and never crashes the server
 * process - the next poll picks up the slack.
 */
export function startDaycareOverdueScheduler(): () => void {
  let timer: ReturnType<typeof setTimeout>;

  const runAndReschedule = async () => {
    try {
      await runDaycareOverdueJob();
    } catch (error) {
      console.error(error);
    }

    timer = setTimeout(runAndReschedule, POLL_INTERVAL_MS);
  };

  timer = setTimeout(runAndReschedule, POLL_INTERVAL_MS);

  return () => clearTimeout(timer);
}
