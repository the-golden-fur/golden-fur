import type { Branch, UpdateBranchPayload } from '../maintenance.types';

interface BranchesApiResult<T> {
  data: T | null;
  error: string | null;
}

// branches.routes.ts is mounted at the server root, same as
// maintenance.routes.ts and staff.routes.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

async function parseBody<T>(
  response: Response
): Promise<BranchesApiResult<T>> {
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

/**
 * Superadmin System Configuration - full branch read, distinct from
 * maintenance.api.ts's listBranches (a lightweight, RLS-only read every
 * staff role can do for branch-name dropdowns).
 */
export async function listBranchesFull(
  accessToken: string
): Promise<BranchesApiResult<Branch[]>> {
  const response = await fetch(`${API_BASE_URL}/branches`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ branches: Branch[] }>(response);
  return { data: result.data?.branches ?? null, error: result.error };
}

export async function updateBranch(
  branchId: string,
  accessToken: string,
  payload: UpdateBranchPayload
): Promise<BranchesApiResult<Branch>> {
  const response = await fetch(`${API_BASE_URL}/branches/${branchId}`, {
    method: 'PATCH',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ branch: Branch }>(response);
  return { data: result.data?.branch ?? null, error: result.error };
}
