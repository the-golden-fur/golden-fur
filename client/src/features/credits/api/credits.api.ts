import type { CreditBalance, CreditTransaction } from '../credits.types';

interface CreditsApiResult<T> {
  data: T | null;
  error: string | null;
}

// credits.routes.ts is mounted at the server root, same as booking.routes.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

async function parseBody<T>(response: Response): Promise<CreditsApiResult<T>> {
  const body = (await response.json().catch(() => null)) as T | null;

  if (body === null) {
    return { data: null, error: 'Request failed. Please try again.' };
  }

  return { data: body, error: null };
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * Issue #95: a customer caller omits customerId (resolves to themself, per
 * the customer portal's own use); a staff caller (Cashier/Admin/Superadmin)
 * must provide it - the server enforces both, this just shapes the query.
 */
export async function listCreditBalances(
  accessToken: string,
  customerId?: string
): Promise<CreditsApiResult<CreditBalance[]>> {
  const query = customerId ? `?customer_id=${customerId}` : '';
  const response = await fetch(`${API_BASE_URL}/credits/balances${query}`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ balances: CreditBalance[] }>(response);
  // `balance` is a PG numeric(10,2) - supabase-js/PostgREST serialize it as a
  // string, and the server casts the row through untouched. Coerce here so
  // every consumer (navbar sum, per-branch cards) does number math, not
  // string concatenation ("0" + "500.00" -> "0500.00").
  const balances = result.data?.balances?.map((row) => ({
    ...row,
    balance: Number(row.balance),
  }));
  return { data: balances ?? null, error: result.error };
}

export async function listCreditHistory(
  accessToken: string,
  branchId: string,
  customerId?: string
): Promise<CreditsApiResult<CreditTransaction[]>> {
  const params = new URLSearchParams({ branch_id: branchId });
  if (customerId) params.set('customer_id', customerId);

  const response = await fetch(`${API_BASE_URL}/credits/history?${params}`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ history: CreditTransaction[] }>(response);
  // `amount` is a PG numeric - same string-serialization caveat as balances above.
  const history = result.data?.history?.map((row) => ({
    ...row,
    amount: Number(row.amount),
  }));
  return { data: history ?? null, error: result.error };
}

/** Admin/Superadmin-only manual expiry trigger (#93) - the primary
 * mechanism, not just a verification aid, in any environment without
 * pg_cron. */
export async function runCreditExpiry(
  accessToken: string
): Promise<CreditsApiResult<{ expired_count: number }>> {
  const response = await fetch(`${API_BASE_URL}/credits/expire`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<{ expired_count: number }>(response);
}
