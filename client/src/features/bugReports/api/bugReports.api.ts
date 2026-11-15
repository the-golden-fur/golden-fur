import type {
  BugReport,
  BugReportStatus,
  CreateBugReportPayload,
} from '../bugReports.types';

interface BugReportsApiResult<T> {
  data: T | null;
  error: string | null;
}

// bugReports.routes.ts is mounted at the server root, same as booking.routes.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

async function parseBody<T>(
  response: Response
): Promise<BugReportsApiResult<T>> {
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

/** Open to any authenticated customer or staff member - the mascot widget's
 * "Report a bug / feature request" form, from either audience. */
export async function createBugReport(
  payload: CreateBugReportPayload,
  accessToken: string
): Promise<BugReportsApiResult<BugReport>> {
  const response = await fetch(`${API_BASE_URL}/bug-reports`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ report: BugReport }>(response);
  return { data: result.data?.report ?? null, error: result.error };
}

/** Developer/Superadmin only (BUG_REPORT_MANAGER_ROLES). */
export async function listBugReports(
  accessToken: string
): Promise<BugReportsApiResult<BugReport[]>> {
  const response = await fetch(`${API_BASE_URL}/bug-reports`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ reports: BugReport[] }>(response);
  return { data: result.data?.reports ?? null, error: result.error };
}

export async function updateBugReportStatus(
  reportId: string,
  status: BugReportStatus,
  accessToken: string
): Promise<BugReportsApiResult<BugReport>> {
  const response = await fetch(
    `${API_BASE_URL}/bug-reports/${reportId}/status`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify({ status }),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ report: BugReport }>(response);
  return { data: result.data?.report ?? null, error: result.error };
}
