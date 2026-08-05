import { supabase } from '../../../config/supabase/supabase.config.ts';

/**
 * Issue #93: wraps migration 098's expire_credits() Postgres function. The
 * preferred mechanism is that migration's own conditional pg_cron schedule
 * (only created when the extension is installed - see that migration's DO
 * block); pg_cron availability is an Open Item, so this manual-trigger
 * function is the PRIMARY mechanism when it isn't available, not just a
 * verification aid - credits.controller.ts (#95) exposes it as an Admin/
 * Superadmin-only endpoint.
 *
 * Returns the number of issuance rows swept.
 */
export async function runCreditExpiryJob(): Promise<number> {
  const { data, error } = await supabase.rpc('expire_credits');

  if (error) {
    throw new Error(`Credit expiry job failed: ${error.message}`);
  }

  return typeof data === 'number' ? data : 0;
}
