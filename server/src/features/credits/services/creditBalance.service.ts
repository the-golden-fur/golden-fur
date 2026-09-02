import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';
import { CREDIT_STAFF_ROLES } from '../credits.types.ts';
import type { CreditBalance, CreditTransaction } from '../credits.types.ts';
import {
  manilaDayKey,
  manilaEndOfDayIso,
} from '../modules/creditExpiry.util.ts';

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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface ActiveIssuanceLot {
  amount: number;
  expires_at: string;
}

/**
 * The soonest upcoming expiry for a branch balance and how much actually
 * goes with it. Mirrors expire_credits()'s FIFO/"only down to the current
 * balance" rule: the lots on the soonest Manila calendar day lose
 * min(their nominal total, balance) - redemptions since issuance leave less
 * to expire. Grouped per day (not per exact second) so lots issued hours
 * apart on the same day count as one expiry.
 *
 * `lots` must already be filtered to not-yet-swept issuance rows with a
 * non-null expires_at and sorted ascending by expires_at.
 */
function nextExpiry(
  lots: ActiveIssuanceLot[],
  balance: number
): Pick<CreditBalance, 'next_expires_at' | 'next_expires_amount'> {
  if (lots.length === 0 || balance <= 0) {
    return { next_expires_at: null, next_expires_amount: null };
  }

  const soonestDay = manilaDayKey(lots[0].expires_at);
  const nominalDueSoonest = lots
    .filter((lot) => manilaDayKey(lot.expires_at) === soonestDay)
    .reduce((sum, lot) => sum + lot.amount, 0);

  const amount = Math.min(nominalDueSoonest, balance);
  if (amount <= 0) {
    return { next_expires_at: null, next_expires_amount: null };
  }

  return {
    next_expires_at: manilaEndOfDayIso(soonestDay),
    next_expires_amount: round2(amount),
  };
}

/**
 * Issue #90 (stub read path) / #95 (full): every branch balance a customer
 * has - credit is branch-locked (UNIQUE(customer_id, branch_id) at the DB
 * layer), so there is one row per branch the customer has ever cancelled a
 * qualifying Hotel booking at, not a single cross-branch total.
 *
 * Each row is enriched with next_expires_at / next_expires_amount so the
 * navbar credit pill and its hover popover can show "₱X expires <date>"
 * without a per-branch history round trip.
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

  const rows = (data ?? []) as CreditBalance[];
  if (rows.length === 0) return rows;

  // Best-effort enrichment: the raw balances (navbar pill, /portal/credits)
  // must still load if this expiry-lot query fails - just without the
  // next_expires_* hint.
  const { data: lotRows, error: lotError } = await supabase
    .from('credit_transactions')
    .select('credit_balance_id, amount, expires_at')
    .in(
      'credit_balance_id',
      rows.map((row) => row.id)
    )
    .eq('transaction_type', 'issuance')
    .is('expired_at', null)
    .not('expires_at', 'is', null)
    .order('expires_at', { ascending: true });

  if (lotError) {
    // eslint-disable-next-line no-console
    console.error(
      'listCreditBalances: expiry enrichment failed, returning bare balances:',
      lotError.message
    );
    return rows.map((row) => ({
      ...row,
      balance: Number(row.balance),
      next_expires_at: null,
      next_expires_amount: null,
    }));
  }

  const lotsByBalance = new Map<string, ActiveIssuanceLot[]>();
  for (const lot of (lotRows ?? []) as {
    credit_balance_id: string;
    amount: number | string;
    expires_at: string;
  }[]) {
    const list = lotsByBalance.get(lot.credit_balance_id) ?? [];
    list.push({ amount: Number(lot.amount), expires_at: lot.expires_at });
    lotsByBalance.set(lot.credit_balance_id, list);
  }

  return rows.map((row) => ({
    ...row,
    balance: Number(row.balance),
    ...nextExpiry(lotsByBalance.get(row.id) ?? [], Number(row.balance)),
  }));
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
