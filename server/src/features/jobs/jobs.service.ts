import { runStayCheckoutJob } from '../hotel/jobs/stayCheckout.job.ts';
import { runAppointmentReminderJob } from '../notifications/services/appointmentReminder.job.ts';
import {
  runCareLogDailyReportJob,
  shouldRunAt as shouldRunCareLogDailyReport,
} from '../notifications/services/careLogDailyReport.job.ts';

/** Per-job outcome of one tick: how many notices went out, or why it
 * failed. `null` means the job had nothing to do at this hour. */
export type JobTickResult = Record<string, number | null | { error: string }>;

/**
 * Runs every time-sensitive notification job once. Called each minute by
 * Supabase pg_cron through POST /jobs/tick (see jobs.routes.ts) - the
 * in-process setTimeout pollers in app.ts can't be relied on in production,
 * where the Render free-plan server sleeps when idle and its timers stop.
 *
 * Each job keeps its own claim-then-send dedupe, so a tick overlapping an
 * in-process poll (or another tick) never double-sends. One job failing
 * never stops the others.
 */
export async function runDueJobs(
  now: Date = new Date()
): Promise<JobTickResult> {
  const jobs: Record<string, () => Promise<number | null>> = {
    stayCheckout: () => runStayCheckoutJob(now),
    appointmentReminder: () => runAppointmentReminderJob(now),
    careLogDailyReport: () =>
      shouldRunCareLogDailyReport(now)
        ? runCareLogDailyReportJob(now)
        : Promise.resolve(null),
  };

  const result: JobTickResult = {};

  for (const [name, run] of Object.entries(jobs)) {
    try {
      result[name] = await run();
    } catch (error) {
      console.error(`Job tick: ${name} failed:`, error); // eslint-disable-line no-console
      result[name] = {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  return result;
}
