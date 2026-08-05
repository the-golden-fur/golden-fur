import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';
import { CREDIT_STAFF_ROLES } from '../credits.types.ts';
import type { CreditBalance, CreditTransaction } from '../credits.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface RequesterScopedParams {
  requesterId: string;
  /** Omitted (or equal to the requester) for a customer's own self-read;
   * required for a staff caller (#95 AC-3). */
  customerId?: string;
}

/**
 * Same single-endpoint role-branching shape listBookings() already
 * establishes (booking.service.ts): a customer with no staff role can only
 * ever resolve to themself; a staff caller must be one of CREDIT_STAFF_ROLES
 * and must name the customer they want to look up.
 */
async function resolveTargetCustomerId({
  requesterId,
  customerId,
}: RequesterScopedParams): Promise<string> {
  const staffRole = await getStaffRoleOrNull(requesterId);

  if (!staffRole) {
    if (customerId && customerId !== requesterId) {
      throwWithStatus(403, 'Forbidden');
    }
    return requesterId;
  }

  if (!CREDIT_STAFF_ROLES.includes(staffRole)) {
    throwWithStatus(403, 'Forbidden');
  }

  if (!customerId) {
    throwWithStatus(400, 'customer_id is required');
  }

  return customerId;
}

/**
 * Issue #90 (stub read path) / #95 (full): every branch balance a customer
 * has - credit is branch-locked (UNIQUE(customer_id, branch_id) at the DB
 * layer), so there is one row per branch the customer has ever cancelled a
 * qualifying Hotel booking at, not a single cross-branch total.
 */
export async function listCreditBalances(
  params: RequesterScopedParams
): Promise<CreditBalance[]> {
  const targetCustomerId = await resolveTargetCustomerId(params);

  const { data, error } = await supabase
    .from('credit_balances')
    .select('*')
    .eq('customer_id', targetCustomerId)
    .order('branch_id');

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as CreditBalance[];
}

interface ListHistoryParams extends RequesterScopedParams {
  branchId: string;
}

/**
 * Full issuance/redemption/expiry history for one (customer, branch) pair -
 * scoped to a single branch's credit_balances row, matching the branch-lock.
 * Returns an empty list (not a 404) when the customer has never had a
 * balance at that branch.
 */
export async function listCreditHistory({
  branchId,
  ...requesterScoped
}: ListHistoryParams): Promise<CreditTransaction[]> {
  const targetCustomerId = await resolveTargetCustomerId(requesterScoped);

  const { data: balanceRow, error: balanceError } = await supabase
    .from('credit_balances')
    .select('id')
    .eq('customer_id', targetCustomerId)
    .eq('branch_id', branchId)
    .maybeSingle();

  if (balanceError) throwWithStatus(400, balanceError.message);
  if (!balanceRow) return [];

  const { data, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('credit_balance_id', (balanceRow as { id: string }).id)
    .order('created_at', { ascending: false });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as CreditTransaction[];
}
