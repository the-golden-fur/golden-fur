import type {
  PolicyConfiguration,
  UpdatePolicyPayload,
} from '../booking.types';

interface PolicyApiResult<T> {
  data: T | null;
  error: string | null;
}

// booking.routes.ts is mounted at the server root, same as staff.routes.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

async function parseBody<T>(response: Response): Promise<PolicyApiResult<T>> {
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

/** All-staff read - every policy_configurations row (system default +
 * per-branch overrides). Used both by the Policies admin page and by
 * read-only consumers (Monthly Schedule's lunch-break badge, the Reschedule
 * button's client-side notice-period gate). */
export async function listPolicyConfigurations(
  accessToken: string
): Promise<PolicyApiResult<PolicyConfiguration[]>> {
  const response = await fetch(`${API_BASE_URL}/bookings/policy`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ policies: PolicyConfiguration[] }>(response);
  return { data: result.data?.policies ?? null, error: result.error };
}

/** Admin/Superadmin write. `branch_id: null`/omitted targets the system-wide
 * default row; a uuid targets (or creates) that branch's override row. */
export async function updatePolicyConfiguration(
  accessToken: string,
  payload: UpdatePolicyPayload
): Promise<PolicyApiResult<PolicyConfiguration>> {
  const response = await fetch(`${API_BASE_URL}/bookings/policy`, {
    method: 'PATCH',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ policy: PolicyConfiguration }>(response);
  return { data: result.data?.policy ?? null, error: result.error };
}

/**
 * Effective policy for a branch, mirroring the server's
 * resolveEffectivePolicy(): the branch-specific row wins whole-row if one
 * exists, otherwise the seeded system-wide default (branch_id null) row.
 */
export function resolveEffectivePolicy(
  policies: PolicyConfiguration[],
  branchId: string | null
): PolicyConfiguration | null {
  const branchRow = branchId
    ? policies.find((row) => row.branch_id === branchId)
    : undefined;
  const defaultRow = policies.find((row) => row.branch_id === null);

  return branchRow ?? defaultRow ?? null;
}
