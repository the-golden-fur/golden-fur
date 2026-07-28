import type { GroomingSession } from '../grooming.types';

interface GroomingApiResult<T> {
  data: T | null;
  error: string | null;
}

export interface GroomingQueueResult {
  sessions: GroomingSession[];
}

/** Booking-status revision: the only two forward transitions a grooming
 * session's Start/Complete action can request - mirrors the server's
 * transitionGroomingStatusValidator. */
export type GroomingTransitionTarget = 'In Progress' | 'Completed';

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

export interface GroomingQueueDateRange {
  /** YYYY-MM-DD, inclusive. Omitted (both) defaults to today, server-side. */
  dateFrom?: string;
  dateTo?: string;
}

export async function listGroomingQueue(
  accessToken: string,
  dateRange: GroomingQueueDateRange = {}
): Promise<GroomingApiResult<GroomingQueueResult>> {
  const params = new URLSearchParams();
  if (dateRange.dateFrom) params.set('date_from', dateRange.dateFrom);
  if (dateRange.dateTo) params.set('date_to', dateRange.dateTo);

  const queryString = params.toString();
  const response = await fetch(
    `${API_BASE_URL}/grooming/queue${queryString ? `?${queryString}` : ''}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ sessions: GroomingSession[] }>(response);

  if (!result.data) {
    return { data: null, error: result.error };
  }

  return {
    data: { sessions: result.data.sessions },
    error: null,
  };
}

export async function transitionGroomingStatus(
  sessionId: string,
  accessToken: string,
  status: GroomingTransitionTarget
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
