import { supabase } from '../../../config/supabase/supabase.config.ts';

/**
 * Application-level fallback for Issue #42's promo expiry (the preferred
 * pg_cron schedule is created by migration ...032 only when the extension is
 * installed - see that migration's DO block). Both paths call the same
 * deactivate_expired_promos() Postgres function, which only touches
 * date-bounded promos: a NULL end_date (condition-based) row is never
 * auto-deactivated.
 *
 * Known limitation, flagged per the Guide: this scheduler only runs while
 * the server process is alive. The promos GET additionally filters expired
 * rows at read time (promos.service.ts), so a missed run never surfaces an
 * expired promo as active to the booking flow.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Daily at 00:05 server time, mirroring the pg_cron schedule ('5 0 * * *'). */
const RUN_HOUR = 0;
const RUN_MINUTE = 5;

export async function runPromoExpiryJob(): Promise<number> {
  const { data, error } = await supabase.rpc('deactivate_expired_promos');

  if (error) {
    throw new Error(`Promo expiry job failed: ${error.message}`);
  }

  return typeof data === 'number' ? data : 0;
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
 * Starts the daily scheduler; returns a stop function. Failures are logged
 * and swallowed so a transient DB error never crashes the server process -
 * the next scheduled run (and the read-time filter) picks up the slack.
 */
export function startPromoExpiryScheduler(): () => void {
  let timer: ReturnType<typeof setTimeout>;

  const runAndReschedule = async () => {
    try {
      await runPromoExpiryJob();
    } catch (error) {
      console.error(error); // eslint-disable-line no-console
    }

    timer = setTimeout(runAndReschedule, msUntilNextRun());
  };

  timer = setTimeout(runAndReschedule, msUntilNextRun());

  return () => clearTimeout(timer);
}
