import type { Notification } from '../notifications.types';

interface NotificationsApiResult<T> {
  data: T | null;
  error: string | null;
}

// notifications.routes.ts (server) is mounted at the server root, same as
// billing.routes.ts / hotel.routes.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

async function parseBody<T>(
  response: Response
): Promise<NotificationsApiResult<T>> {
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
 * Issues #97/#100/#101: the one shared inbox endpoint - staff and customer
 * callers hit the same route, the server resolves which inbox to return.
 */
export async function listNotifications(
  accessToken: string
): Promise<NotificationsApiResult<Notification[]>> {
  const response = await fetch(`${API_BASE_URL}/notifications`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ notifications: Notification[] }>(response);
  return { data: result.data?.notifications ?? null, error: result.error };
}

export async function markNotificationRead(
  notificationId: string,
  accessToken: string
): Promise<NotificationsApiResult<Notification>> {
  const response = await fetch(
    `${API_BASE_URL}/notifications/${notificationId}/read`,
    { method: 'PATCH', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ notification: Notification }>(response);
  return { data: result.data?.notification ?? null, error: result.error };
}

export async function markAllNotificationsRead(
  accessToken: string
): Promise<NotificationsApiResult<null>> {
  const response = await fetch(`${API_BASE_URL}/notifications/read-all`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}
