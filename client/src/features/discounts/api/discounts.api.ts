import type {
  CreateDiscountPayload,
  Discount,
  UpdateDiscountPayload,
} from '../discounts.types';

interface DiscountsApiResult<T> {
  data: T | null;
  error: string | null;
}

// discounts.routes.ts is mounted at the server root (not under /auth), same
// as maintenance.routes.ts and staff.routes.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

async function parseBody<T>(
  response: Response
): Promise<DiscountsApiResult<T>> {
  const body = (await response.json().catch(() => null)) as T | null;

  if (body === null) {
    return { data: null, error: 'Request failed. Please try again.' };
  }

  return { data: body, error: null };
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

function jsonHeaders(accessToken: string): HeadersInit {
  return { 'Content-Type': 'application/json', ...authHeaders(accessToken) };
}

export interface ListDiscountsFilters {
  branchId?: string;
  activeOnly?: boolean;
}

/**
 * Deliberately does not default activeOnly to true - the management view
 * (#48) must show mandated-but-off rows so an Admin can toggle them on;
 * activeOnly is only for a future consumer/checkout view (M08).
 */
export async function listDiscounts(
  accessToken: string,
  filters: ListDiscountsFilters = {}
): Promise<DiscountsApiResult<Discount[]>> {
  const params = new URLSearchParams();

  if (filters.branchId) {
    params.set('branch_id', filters.branchId);
  }

  if (filters.activeOnly) {
    params.set('active_only', 'true');
  }

  const query = params.size > 0 ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/discounts${query}`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ discounts: Discount[] }>(response);
  return { data: result.data?.discounts ?? null, error: result.error };
}

export async function createDiscount(
  accessToken: string,
  payload: CreateDiscountPayload
): Promise<DiscountsApiResult<Discount>> {
  const response = await fetch(`${API_BASE_URL}/discounts`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ discount: Discount }>(response);
  return { data: result.data?.discount ?? null, error: result.error };
}

export async function updateDiscount(
  discountId: string,
  accessToken: string,
  payload: UpdateDiscountPayload
): Promise<DiscountsApiResult<Discount>> {
  const response = await fetch(`${API_BASE_URL}/discounts/${discountId}`, {
    method: 'PATCH',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ discount: Discount }>(response);
  return { data: result.data?.discount ?? null, error: result.error };
}
