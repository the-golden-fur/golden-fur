/**
 * TODO(Epic B, #90): Epic B (M09 Policy Enforcement + M10 Credit Balance
 * Management, Issues #88-#95) has not been built or even guide-documented
 * in this repo yet - credit_balances/credit_transactions do not exist. Per
 * the Sprint5-EpicA-Guide's own contingency ("build the credit-lookup call
 * behind a thin interface... TODO(Epic B, #90): replace stub credit lookup
 * once credit_balances is merged"), checkoutAggregation.service.ts and
 * miscSale.service.ts call only the two functions below - swapping in the
 * real credit_balances-backed implementation once Epic B ships is a
 * one-file change, no caller needs to know it happened.
 */

export interface CreditApplication {
  /** Amount actually applied - always 0 until Epic B ships. */
  appliedAmount: number;
}

export async function getAvailableCredit(
  _customerId: string,
  _branchId: string
): Promise<number> {
  return 0;
}

/**
 * Real implementation (Epic B, #90) will: read credit_balances scoped to
 * (customerId, branchId), cap requestedAmount at MIN(available_balance,
 * transactionTotal), and atomically insert a credit_transactions row +
 * decrement credit_balances in the same DB transaction as the
 * transactions/transaction_line_items insert (Issue #84 dev notes). Until
 * then this is a no-op that applies nothing, regardless of what the client
 * requested - callers must not assume requestedAmount was honored.
 */
export async function applyCredit(
  _customerId: string,
  _branchId: string,
  _requestedAmount: number
): Promise<CreditApplication> {
  return { appliedAmount: 0 };
}
