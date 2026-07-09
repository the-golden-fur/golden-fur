import type { ThemeRole } from '../providers/ThemeProvider/themeContext';
import type {
  MfaSessionResponse,
  MfaStatusResponse,
  MfaUnenrollResponse,
  TotpEnrollResponse,
} from '../auth/mfa.types';

interface MfaApiResult<T> {
  data: T | null;
  error: string | null;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const AUTH_PREFIX = '/auth';

const MFA_PATHS_BY_ROLE: Record<
  ThemeRole,
  { enroll: string; verify: string; status: string; unenroll: string }
> = {
  staff: {
    enroll: '/staff/mfa/enroll',
    verify: '/staff/mfa/verify',
    status: '/staff/mfa/status',
    unenroll: '/staff/mfa/unenroll',
  },
  customer: {
    enroll: '/customers/mfa/enroll',
    verify: '/customers/mfa/verify',
    status: '/customers/mfa/status',
    unenroll: '/customers/mfa/unenroll',
  },
};

async function parseResponse<T>(response: Response): Promise<MfaApiResult<T>> {
  const body = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null;

  if (!response.ok) {
    const errorMessage =
      body && typeof body === 'object' && 'error' in body && body.error
        ? body.error
        : 'Request failed. Please try again.';

    return { data: null, error: errorMessage };
  }

  return { data: body as T, error: null };
}

export async function getMfaStatus(
  role: ThemeRole,
  accessToken: string
): Promise<MfaApiResult<MfaStatusResponse>> {
  const response = await fetch(
    `${API_BASE_URL}${AUTH_PREFIX}${MFA_PATHS_BY_ROLE[role].status}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  return parseResponse<MfaStatusResponse>(response);
}

export async function enrollMfa(
  role: ThemeRole,
  accessToken: string
): Promise<MfaApiResult<TotpEnrollResponse>> {
  const response = await fetch(
    `${API_BASE_URL}${AUTH_PREFIX}${MFA_PATHS_BY_ROLE[role].enroll}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  return parseResponse<TotpEnrollResponse>(response);
}

export async function verifyMfa(
  role: ThemeRole,
  code: string,
  accessToken: string
): Promise<MfaApiResult<MfaSessionResponse>> {
  const response = await fetch(
    `${API_BASE_URL}${AUTH_PREFIX}${MFA_PATHS_BY_ROLE[role].verify}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ code }),
    }
  );

  return parseResponse<MfaSessionResponse>(response);
}

export async function unenrollMfa(
  role: ThemeRole,
  accessToken: string
): Promise<MfaApiResult<MfaUnenrollResponse>> {
  const response = await fetch(
    `${API_BASE_URL}${AUTH_PREFIX}${MFA_PATHS_BY_ROLE[role].unenroll}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  return parseResponse<MfaUnenrollResponse>(response);
}
