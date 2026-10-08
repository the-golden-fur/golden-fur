import { supabase } from '../../../config/supabase/supabase.config.ts';
import { createNotification } from '../../notifications/services/notification.service.ts';
import {
  sendCheckoutReminderEmail,
  sendCheckoutTimeReachedEmail,
  type StayCheckoutEmailParams,
} from '../../../shared/email/stayCheckoutEmail.ts';
import {
  DAYCARE_OVERDUE_FEE_PER_HOUR,
  DAYCARE_OVERDUE_GRACE_MINUTES,
} from '../../daycare/modules/daycareCharge.util.ts';

/**
 * Custom change (checkout countdown notifications, grown out of the Daycare
 * overdue checkout fee job): tells the owner of a booked, checked-in Hotel
 * or Daycare pet about its checkout time - the booking's scheduled_end,
 * which is also what the Cage Occupancy page counts down to:
 *
 * 1. 'checkout_reminder' - 15 minutes before the checkout time, so the owner
 *    still has time to make it.
 * 2. 'daycare_overdue' - once the countdown is complete (the checkout time
 *    has arrived) and the pet is still checked in. The event keeps its
 *    original name so existing notification preferences still apply, but
 *    now covers Hotel stays too.
 *
 * Only a Daycare booking that isn't pay-at-checkout mentions the hourly
 * overdue fee (same rule as cageOccupants.service.ts) - a pay-at-checkout
 * booking is billed for the time actually stayed instead, and Hotel has no
 * hourly fee.
 *
 * Mirrors appointmentReminder.job.ts's in-process setTimeout poller and its
 * claim-then-send dedupe: stays.checkout_reminder_notified_at and
 * stays.overdue_notified_at are each claimed via a conditional UPDATE before
 * sending, so each notice goes out at most once per stay however many polls
 * pass. A reminder whose window was missed entirely (e.g. the server was
 * down) is skipped rather than sent late - the countdown-complete notice
 * covers it. A walk-in (no booking) has no checkout time and is never
 * picked up here.
 */

/** Every minute, so each notice lands close to its moment - the old 5-min
 * poll could be up to 5 minutes late, a third of the reminder's lead time. */
const POLL_INTERVAL_MS = 60 * 1000;

export const CHECKOUT_REMINDER_LEAD_MINUTES = 15;

const DEFAULT_TIMEZONE = 'Asia/Manila';

interface ActiveStayRow {
  id: string;
  booking_id: string;
  pet_id: string;
  branch_id: string;
  stay_type: 'Hotel' | 'Daycare';
  checkout_reminder_notified_at: string | null;
}

interface DueBookingRow {
  id: string;
  customer_id: string;
  scheduled_end: string;
  pay_at_checkout: boolean;
}

type CheckoutNotice = 'reminder' | 'time_reached';

/** Exported for the batch itself to be tested without waiting on the
 * scheduler's real clock. Returns how many notifications were sent. */
export async function runStayCheckoutJob(
  now: Date = new Date()
): Promise<number> {
  const { data: stayRows, error } = await supabase
    .from('stays')
    .select(
      'id, booking_id, pet_id, branch_id, stay_type, checkout_reminder_notified_at'
    )
    .eq('status', 'Active')
    .in('stay_type', ['Hotel', 'Daycare'])
    // Once the countdown-complete notice is out there is nothing left to
    // send for this stay.
    .is('overdue_notified_at', null)
    .not('booking_id', 'is', null);

  if (error) {
    throw new Error(`Stay checkout job failed: ${error.message}`);
  }

  const stays = (stayRows ?? []) as ActiveStayRow[];
  if (stays.length === 0) return 0;

  const reminderFrom = new Date(
    now.getTime() + CHECKOUT_REMINDER_LEAD_MINUTES * 60 * 1000
  );

  const { data: bookingRows, error: bookingsError } = await supabase
    .from('bookings')
    .select('id, customer_id, scheduled_end, pay_at_checkout')
    .in(
      'id',
      stays.map((stay) => stay.booking_id)
    )
    .lte('scheduled_end', reminderFrom.toISOString());

  if (bookingsError) {
    throw new Error(`Stay checkout job failed: ${bookingsError.message}`);
  }

  const dueBookingById = new Map(
    ((bookingRows ?? []) as DueBookingRow[]).map((row) => [row.id, row])
  );

  let sentCount = 0;

  for (const stay of stays) {
    const booking = dueBookingById.get(stay.booking_id);
    if (!booking) continue;

    const isTimeReached =
      new Date(booking.scheduled_end).getTime() <= now.getTime();

    if (!isTimeReached && stay.checkout_reminder_notified_at !== null) {
      continue;
    }

    const notice: CheckoutNotice = isTimeReached ? 'time_reached' : 'reminder';
    const claimColumn =
      notice === 'time_reached'
        ? 'overdue_notified_at'
        : 'checkout_reminder_notified_at';

    const { data: claimed } = await supabase
      .from('stays')
      .update({ [claimColumn]: now.toISOString() })
      .eq('id', stay.id)
      .is(claimColumn, null)
      .select('id')
      .maybeSingle();

    // A concurrent run already claimed this notice - not our send.
    if (!claimed) continue;

    await sendStayCheckoutNotification(notice, stay, booking);
    sentCount += 1;
  }

  return sentCount;
}

function formatCheckoutTime(scheduledEnd: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(scheduledEnd));
}

async function sendStayCheckoutNotification(
  notice: CheckoutNotice,
  stay: ActiveStayRow,
  booking: DueBookingRow
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
          .select('name, timezone')
          .eq('id', stay.branch_id)
          .maybeSingle(),
        supabase
          .from('pets')
          .select('name')
          .eq('id', stay.pet_id)
          .maybeSingle(),
      ]);

    const petName = pet?.name ?? 'Your pet';
    const stayLabel =
      stay.stay_type === 'Hotel' ? 'hotel stay' : 'daycare session';
    const checkoutTime = formatCheckoutTime(
      booking.scheduled_end,
      branch?.timezone ?? DEFAULT_TIMEZONE
    );
    const overdueFee =
      stay.stay_type === 'Daycare' && !booking.pay_at_checkout
        ? {
            feePerHour: DAYCARE_OVERDUE_FEE_PER_HOUR,
            graceMinutes: DAYCARE_OVERDUE_GRACE_MINUTES,
          }
        : null;
    const feeSentence = overdueFee
      ? ` An overdue fee of ₱${overdueFee.feePerHour} per hour applies once pickup is more than ${overdueFee.graceMinutes} minutes late and is added to your bill at checkout.`
      : '';

    const emailParams: StayCheckoutEmailParams | null = customer?.account_email
      ? {
          to: customer.account_email,
          petName,
          branchName: branch?.name ?? '',
          stayLabel,
          checkoutTime,
          overdueFee,
        }
      : null;

    if (notice === 'reminder') {
      await createNotification({
        recipientCustomerId: booking.customer_id,
        eventType: 'checkout_reminder',
        title: 'Checkout in 15 minutes',
        message: `${petName}'s ${stayLabel} checkout time is ${checkoutTime} - ${CHECKOUT_REMINDER_LEAD_MINUTES} minutes from now.${feeSentence}`,
        relatedBookingId: booking.id,
        sendEmail: emailParams
          ? () => sendCheckoutReminderEmail(emailParams)
          : undefined,
      });
      return;
    }

    await createNotification({
      recipientCustomerId: booking.customer_id,
      eventType: 'daycare_overdue',
      title: 'Checkout time is up',
      message: `${petName}'s ${stayLabel} checkout time (${checkoutTime}) has arrived. Please pick ${petName} up as soon as you can.${feeSentence}`,
      relatedBookingId: booking.id,
      sendEmail: emailParams
        ? () => sendCheckoutTimeReachedEmail(emailParams)
        : undefined,
    });
  } catch (error) {
    console.error(
      `Failed to send ${notice} checkout notification for stay ${stay.id}:`,
      error
    );
  }
}

/**
 * Starts the poller; returns a stop function. A run failure (or an
 * individual stay's notification failure, already swallowed inside
 * sendStayCheckoutNotification) is logged and never crashes the server
 * process - the next poll picks up the slack.
 */
export function startStayCheckoutScheduler(): () => void {
  let timer: ReturnType<typeof setTimeout>;

  const runAndReschedule = async () => {
    try {
      await runStayCheckoutJob();
    } catch (error) {
      console.error(error);
    }

    timer = setTimeout(runAndReschedule, POLL_INTERVAL_MS);
  };

  timer = setTimeout(runAndReschedule, POLL_INTERVAL_MS);

  return () => clearTimeout(timer);
}
