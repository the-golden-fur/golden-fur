/**
 * Credit lookup + redemption for checkout / misc-sale / transaction-payment.
 *
 * Epic B (credit_balances / credit_transactions) has shipped, so this is no
 * longer a stub - getAvailableCredit reads the real branch-locked balance
 * and applyCredit wraps the atomic redeem_credit() Postgres function
 * (upsert-decrement the balance + insert a signed redemption row in one DB
 * transaction). The filename is kept so the existing callers
 * (checkoutAggregation.service.ts, miscSale.service.ts) don't need to
 * change their import paths.
 */
import { supabase } from '../../../config/supabase/supabase.config.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

export interface CreditApplication {
  /** Amount actually redeemed - MIN(requested, available), 0 when nothing
   * was applied (no balance row, or a non-positive request). */
  appliedAmount: number;
}

/**
 * The customer's redeemable credit at one branch (credit is branch-locked -
 * UNIQUE(customer_id, branch_id)). 0 when the customer has never had a
 * balance at that branch.
 */
export async function getAvailableCredit(
  customerId: string,
  branchId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('credit_balances')
    .select('balance')
    .eq('customer_id', customerId)
    .eq('branch_id', branchId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);

  return data ? Number((data as { balance: number | string }).balance) : 0;
}

/**
 * Redeems MIN(requestedAmount, available) against the (customer, branch)
 * balance via the atomic redeem_credit() RPC and reports how much was
 * actually applied. transactionId links the resulting redemption row to the
 * transaction it paid down - omitted by the pre-existing checkout /
 * misc-sale callers (they insert the transaction after this call), which is
 * acceptable: credit_transactions.transaction_id is nullable.
 */
export async function applyCredit(
  customerId: string,
  branchId: string,
  requestedAmount: number,
  transactionId?: string
): Promise<CreditApplication> {
  const available = await getAvailableCredit(customerId, branchId);
  const appliedAmount = Math.max(0, Math.min(requestedAmount, available));

  if (appliedAmount <= 0) return { appliedAmount: 0 };

  const { error } = await supabase.rpc('redeem_credit', {
    p_customer_id: customerId,
    p_branch_id: branchId,
    p_amount: appliedAmount,
    p_transaction_id: transactionId ?? null,
  });

  if (error) throwWithStatus(400, error.message);

  return { appliedAmount };
}
