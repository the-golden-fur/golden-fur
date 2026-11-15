import type { DeveloperStats } from '../developer.types';

interface DeveloperApiResult<T> {
  data: T | null;
  error: string | null;
}

// developer.routes.ts is mounted at the server root, same as reports.routes.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

/** Developer/Superadmin only. */
export async function getDeveloperStats(
  accessToken: string
): Promise<DeveloperApiResult<DeveloperStats>> {
  const response = await fetch(`${API_BASE_URL}/developer/stats`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const body = (await response.json().catch(() => null)) as {
    stats?: DeveloperStats;
  } | null;

  if (!body?.stats) {
    return { data: null, error: 'Request failed. Please try again.' };
  }

  return { data: body.stats, error: null };
}
