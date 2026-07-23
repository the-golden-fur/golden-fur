import type { CheckInPayload, DaycareSession } from '../daycare.types';

interface DaycareApiResult<T> {
  data: T | null;
  error: string | null;
}

// daycare.routes.ts (server) is mounted at the server root (not under
// /auth), same as grooming.routes.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

async function parseBody<T>(response: Response): Promise<DaycareApiResult<T>> {
  const body = (await response.json().catch(() => null)) as T | null;

  if (body === null) {
    return { data: null, error: 'Request failed. Please try again.' };
  }

  return { data: body, error: null };
}

function jsonHeaders(accessToken: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function checkInDaycareSession(
  accessToken: string,
  payload: CheckInPayload
): Promise<DaycareApiResult<DaycareSession>> {
  const response = await fetch(`${API_BASE_URL}/daycare/check-in`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ session: DaycareSession }>(response);
  return { data: result.data?.session ?? null, error: result.error };
}

export async function checkOutDaycareSession(
  sessionId: string,
  accessToken: string
): Promise<DaycareApiResult<DaycareSession>> {
  const response = await fetch(
    `${API_BASE_URL}/daycare/sessions/${sessionId}/checkout`,
    {
      method: 'POST',
      headers: jsonHeaders(accessToken),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ session: DaycareSession }>(response);
  return { data: result.data?.session ?? null, error: result.error };
}
