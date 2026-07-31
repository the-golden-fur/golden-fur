import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { PaymongoWebhookEvent } from './paymongo.service.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

export interface WebhookConfirmationResult {
  handled: boolean;
  transactionId: string | null;
}

/**
 * Issue #83 AC-2/AC-3: flips a portal GCash/Maya transaction from Pending
 * to Fully Paid on webhook receipt, with no cashier action. Idempotent by
 * construction - a second delivery for an already-confirmed transaction
 * finds no row still in 'Pending' (the conditional UPDATE's WHERE clause
 * excludes it) and is a no-op, matching the single-writer conditional-
 * update pattern hotel checkout.service.ts already established for its own
 * race guard.
 *
 * A 'failed' event is logged and otherwise a no-op - the transaction stays
 * Pending so the customer can retry the same booking/misc-sale checkout;
 * no automatic cancellation/cleanup path is specified for this epic.
 */
export async function confirmPaymongoWebhookEvent(
  event: PaymongoWebhookEvent
): Promise<WebhookConfirmationResult> {
  if (event.status !== 'paid') {
    // eslint-disable-next-line no-console
    console.warn(
      `PayMongo webhook reported non-paid status for source ${event.sourceId} (event ${event.eventId})`
    );
    return { handled: false, transactionId: null };
  }

  const { data: updated, error } = await supabase
    .from('transactions')
    .update({
      payment_status: 'Fully Paid',
      webhook_confirmed_at: new Date().toISOString(),
    })
    .eq('payment_reference', event.sourceId)
    .eq('payment_status', 'Pending')
    .select('id')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);

  return { handled: Boolean(updated), transactionId: updated?.id ?? null };
}
