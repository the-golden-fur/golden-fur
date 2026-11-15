import type { ServiceDone } from '../../veterinary/veterinary.types';
import type { FrontDeskQueueRow } from '../frontDesk.types';

interface FrontDeskApiResult<T> {
  data: T | null;
  error: string | null;
}

// frontDesk.routes.ts (server) is mounted at the server root, same as
// hotel.routes.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

/** branchId is only honored for a Superadmin; 'all' means every branch. */
export async function listFrontDeskQueue(
  accessToken: string,
  branchId?: string
): Promise<FrontDeskApiResult<FrontDeskQueueRow[]>> {
  const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
  const response = await fetch(`${API_BASE_URL}/front-desk/queue${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const body = (await response.json().catch(() => null)) as {
    rows?: FrontDeskQueueRow[];
  } | null;

  return body?.rows
    ? { data: body.rows, error: null }
    : { data: null, error: 'Request failed. Please try again.' };
}

async function advance(
  url: string,
  accessToken: string,
  body?: unknown
): Promise<FrontDeskApiResult<true>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });

  return response.ok
    ? { data: true, error: null }
    : { data: null, error: await parseError(response) };
}

export function startFrontDeskBooking(bookingId: string, accessToken: string) {
  return advance(
    `${API_BASE_URL}/front-desk/bookings/${bookingId}/start`,
    accessToken
  );
}

export function completeFrontDeskBooking(
  bookingId: string,
  accessToken: string,
  servicesDone: ServiceDone[] = []
) {
  return advance(
    `${API_BASE_URL}/front-desk/bookings/${bookingId}/complete`,
    accessToken,
    { services_done: servicesDone }
  );
}
