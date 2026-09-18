import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  deleteOrAnonymizeCustomer,
  getCustomerAutoDeletePolicyDays,
} from '../services/customerArchive.service.ts';

/**
 * Settings > Danger > "Deactivate account" starts a countdown (admin-
 * configurable via the Policies config tile's customer_deactivation_auto_
 * delete_days): once that many days have passed since deactivated_at with
 * no reactivation, the account is permanently removed - either a real hard
 * delete or, if the customer has booking/transaction/credit history, an
 * anonymize-in-place fallback (see deleteOrAnonymizeCustomer).
 *
 * Unlike promoExpiry.job.ts/creditExpiry.job.ts, this has no paired
 * pg_cron/SQL-function counterpart: the delete-vs-anonymize branching
 * needs per-row try/catch, which PL/pgSQL makes far more awkward than TS.
 * Same daily setTimeout-recursion shape as those jobs otherwise, and the
 * same known limitation: only runs while the server process is alive.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const RUN_HOUR = 0;
const RUN_MINUTE = 10;

async function findDueCustomerIds(): Promise<string[]> {
  const thresholdDays = await getCustomerAutoDeletePolicyDays();
  const cutoff = new Date(
    Date.now() - thresholdDays * DAY_MS
  ).toISOString();

  const { data, error } = await supabase
    .from('customer_profiles')
    .select('id')
    .eq('is_active', false)
    .is('anonymized_at', null)
    .not('deactivated_at', 'is', null)
    .lte('deactivated_at', cutoff);

  if (error) {
    throw new Error(`Customer auto-delete lookup failed: ${error.message}`);
  }

  return (data ?? []).map((row) => row.id as string);
}

/** Each customer is isolated: one failure (e.g. a transient DB error) must
 * not block the rest of the batch, so errors are logged per-row rather than
 * thrown - matching the other jobs' failure-isolation pattern. */
export async function runCustomerAutoDeleteJob(): Promise<number> {
  const customerIds = await findDueCustomerIds();
  let processed = 0;

  for (const customerId of customerIds) {
    try {
      await deleteOrAnonymizeCustomer(customerId);
      processed += 1;
    } catch (error) {
      console.error( // eslint-disable-line no-console
        `Customer auto-delete failed for ${customerId}:`,
        error
      );
    }
  }

  return processed;
}

export function msUntilNextRun(now: Date = new Date()): number {
  const next = new Date(now);
  next.setHours(RUN_HOUR, RUN_MINUTE, 0, 0);

  if (next.getTime() <= now.getTime()) {
    next.setTime(next.getTime() + DAY_MS);
  }

  return next.getTime() - now.getTime();
}

export function startCustomerAutoDeleteScheduler(): () => void {
  let timer: ReturnType<typeof setTimeout>;

  const runAndReschedule = async () => {
    try {
      await runCustomerAutoDeleteJob();
    } catch (error) {
      console.error(error); // eslint-disable-line no-console
    }

    timer = setTimeout(runAndReschedule, msUntilNextRun());
  };

  timer = setTimeout(runAndReschedule, msUntilNextRun());

  return () => clearTimeout(timer);
}
