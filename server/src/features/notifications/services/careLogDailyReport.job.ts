import { supabase } from '../../../config/supabase/supabase.config.ts';
import { resolveEffectivePolicy } from '../../booking/services/staffPicker.service.ts';
import { isEmailNotificationEnabled } from './notification.service.ts';
import { sendCareLogDailyReportEmail } from '../../../shared/email/careLogDailyReportEmail.ts';

/**
 * Nightly care summary: ONE email per active hotel stay per day, bucketing
 * that day's care-log tasks into Completed / Missed / Still scheduled. This
 * replaces the old "email on every completed task" behaviour, which on a busy
 * hotel day could spend dozens of the Brevo free plan's 300/day quota on a
 * single pet.
 *
 * Scheduler shape: an in-process hourly poll (no external job-runner
 * package). Each tick from RUN_HOUR onward runs the batch; the
 * care_log_daily_reports claim row makes every tick after the first a no-op
 * for stays already summarised today, so an hourly cadence is cheap and a
 * server restart at, say, 21:40 still produces that evening's summaries on
 * the next tick rather than losing the day. Gated per branch by
 * policy_configurations.care_log_daily_report_enabled (default true) and per
 * customer by their 'care_log_completed' email preference.
 */

const POLL_INTERVAL_MS = 60 * 60 * 1000;

/** From 21:00 server time onward - late enough that most of the day's tasks
 * are done, early enough that the customer still gets it the same evening.
 * The hourly poll keeps retrying through the rest of the evening. */
const RUN_HOUR = 21;

interface ActiveHotelStayRow {
  id: string;
  branch_id: string;
  pet_id: string;
}

interface CareLogEntryRow {
  description: string;
  status: string;
}

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Exported so the batch can be tested without the scheduler's real clock. */
export async function runCareLogDailyReportJob(
  now: Date = new Date()
): Promise<number> {
  const reportDate = localDateString(now);

  const { data: stayRows, error: staysError } = await supabase
    .from('stays')
    .select('id, branch_id, pet_id')
    .eq('status', 'Active')
    .eq('stay_type', 'Hotel');

  if (staysError) {
    throw new Error(`Care-log daily report job failed: ${staysError.message}`);
  }

  const stays = (stayRows ?? []) as ActiveHotelStayRow[];
  if (stays.length === 0) return 0;

  // Resolve the per-branch enable flag once per distinct branch.
  const branchIds = [...new Set(stays.map((stay) => stay.branch_id))];
  const enabledByBranch = new Map<string, boolean>();
  await Promise.all(
    branchIds.map(async (branchId) => {
      try {
        const policy = await resolveEffectivePolicy(branchId);
        enabledByBranch.set(branchId, policy.care_log_daily_report_enabled);
      } catch {
        enabledByBranch.set(branchId, false);
      }
    })
  );

  let sentCount = 0;

  for (const stay of stays) {
    if (!enabledByBranch.get(stay.branch_id)) continue;

    // Claim this (stay, date) before doing any work - lost claim = another
    // run (or a pre-restart run) already handled it.
    const { data: claimed, error: claimError } = await supabase
      .from('care_log_daily_reports')
      .upsert(
        { stay_id: stay.id, report_date: reportDate },
        { onConflict: 'stay_id,report_date', ignoreDuplicates: true }
      )
      .select('stay_id')
      .maybeSingle();

    if (claimError || !claimed) continue;

    try {
      if (await sendStayDailyReport(stay, reportDate)) {
        sentCount += 1;
      }
    } catch (error) {
      // Best-effort per stay - one failure never stops the rest. The claim
      // row stays, so a failed send is not retried (same trade-off as the
      // appointment reminder job): better a missed summary than a retry loop
      // against the daily quota.
      console.error(
        `Failed to send care-log daily report for stay ${stay.id}:`,
        error
      );
    }
  }

  return sentCount;
}

async function sendStayDailyReport(
  stay: ActiveHotelStayRow,
  reportDate: string
): Promise<boolean> {
  const { data: entryRows } = await supabase
    .from('care_log_entries')
    .select('description, status')
    .eq('stay_id', stay.id)
    .eq('scheduled_date', reportDate);

  const entries = (entryRows ?? []) as CareLogEntryRow[];

  const [{ data: pet }, { data: branch }] = await Promise.all([
    supabase
      .from('pets')
      .select('name, customer_id')
      .eq('id', stay.pet_id)
      .maybeSingle(),
    supabase
      .from('branches')
      .select('name')
      .eq('id', stay.branch_id)
      .maybeSingle(),
  ]);

  if (!pet?.customer_id) return false;

  const emailEnabled = await isEmailNotificationEnabled({
    recipientCustomerId: pet.customer_id as string,
    eventType: 'care_log_completed',
  });
  if (!emailEnabled) return false;

  const { data: customer } = await supabase
    .from('customer_profiles')
    .select('account_email')
    .eq('id', pet.customer_id)
    .maybeSingle();

  if (!customer?.account_email) return false;

  const completed = entries
    .filter((entry) => entry.status === 'Completed')
    .map((entry) => entry.description);
  const missed = entries
    .filter((entry) => entry.status === 'Missed')
    .map((entry) => entry.description);
  const stillOpen = entries
    .filter(
      (entry) =>
        entry.status === 'Pending' ||
        entry.status === 'In Progress' ||
        entry.status === 'Backlog'
    )
    .map((entry) => entry.description);

  await sendCareLogDailyReportEmail({
    to: customer.account_email,
    petName: (pet.name as string) ?? 'your pet',
    branchName: (branch?.name as string) ?? '',
    reportDate,
    completed,
    missed,
    stillOpen,
  });

  return true;
}

/** Whether the batch should run at `now` - only from RUN_HOUR (21:00) local
 * time onward. Before then a run would summarise a day that isn't over. */
export function shouldRunAt(now: Date = new Date()): boolean {
  return now.getHours() >= RUN_HOUR;
}

/**
 * Starts the hourly poller; returns a stop function. Failures are logged and
 * swallowed so a transient DB error never crashes the server process - the
 * next hourly tick picks up the slack, and the claim ledger means a repeat
 * tick never re-sends.
 */
export function startCareLogDailyReportScheduler(): () => void {
  let timer: ReturnType<typeof setTimeout>;

  const runAndReschedule = async () => {
    try {
      if (shouldRunAt()) {
        await runCareLogDailyReportJob();
      }
    } catch (error) {
      console.error(error); // eslint-disable-line no-console
    }

    timer = setTimeout(runAndReschedule, POLL_INTERVAL_MS);
  };

  timer = setTimeout(runAndReschedule, POLL_INTERVAL_MS);

  return () => clearTimeout(timer);
}
