import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { CreditTransaction } from '../credits.types.ts';

export interface IssueCreditParams {
  customerId: string;
  branchId: string;
  /** The converted amount (paid amount x conversion rate) - always positive. */
  amount: number;
  /** null when the best-effort cancellation_logs write failed (#117) -
   * credit_transactions.cancellation_log_id is nullable, so issuance still
   * proceeds. */
  cancellationLogId: string | null;
  /** Pre-computed by the caller from policy_configurations.credit_expiry_*
   * at the moment of issuance (#88) - null when credit_expiry_enabled is
   * false. */
  expiresAt: string | null;
}

/**
 * Issue #93: converts a qualifying cancellation's credit amount (a configured
 * share of what the customer paid - computed by cancellation.service.ts)
 * into a branch-locked credit_balances increment plus an issuance credit_
 * transactions row - called by cancellation.service.ts (#91) once it has
 * confirmed the notice-period check qualifies.
 *
 * Wraps migration 097's issue_credit() Postgres function rather than doing
 * a select-then-write here: AC-1 requires the balance increment and the
 * issuance row to be atomic, which a two-step application-layer read-modify
 * -write across separate PostgREST round trips can't guarantee.
 *
 * Returns null (never throws) on failure - the caller must treat that as
 * "no credit was issued" and leave the triggering cancellation_logs row's
 * credit_issued at its default false, rather than assuming success.
 */
export async function issueCredit(
  params: IssueCreditParams
): Promise<CreditTransaction | null> {
  const { data, error } = await supabase.rpc('issue_credit', {
    p_customer_id: params.customerId,
    p_branch_id: params.branchId,
    p_amount: params.amount,
    p_cancellation_log_id: params.cancellationLogId,
    p_expires_at: params.expiresAt,
  });

  if (error || !data) {
    console.error(
      // eslint-disable-line no-console
      'issueCredit failed:',
      error?.message ?? 'no row returned'
    );
    return null;
  }

  return data as CreditTransaction;
}
