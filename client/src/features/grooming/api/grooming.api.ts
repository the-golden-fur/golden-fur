import type { GroomingSession, GroomingStatus } from '../grooming.types';

interface GroomingApiResult<T> {
  data: T | null;
  error: string | null;
}

// grooming.routes.ts (server) is mounted at the server root (not under
// /auth), same as booking.routes.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

async function parseBody<T>(response: Response): Promise<GroomingApiResult<T>> {
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

export async function listGroomingQueue(
  accessToken: string
): Promise<GroomingApiResult<GroomingSession[]>> {
  const response = await fetch(`${API_BASE_URL}/grooming/queue`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ sessions: GroomingSession[] }>(response);
  return { data: result.data?.sessions ?? null, error: result.error };
}

export async function transitionGroomingStatus(
  sessionId: string,
  accessToken: string,
  status: GroomingStatus
): Promise<GroomingApiResult<GroomingSession>> {
  const response = await fetch(
    `${API_BASE_URL}/grooming/sessions/${sessionId}/status`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify({ status }),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ session: GroomingSession }>(response);
  return { data: result.data?.session ?? null, error: result.error };
}
