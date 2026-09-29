import type { ThemeRole } from '../providers/ThemeProvider/themeContext';
import type {
  MfaMethod,
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
  {
    enroll: string;
    emailRequestCode: string;
    verify: string;
    status: string;
    unenroll: string;
    preference: string;
  }
> = {
  staff: {
    enroll: '/staff/mfa/enroll',
    emailRequestCode: '/staff/mfa/email/request-code',
    verify: '/staff/mfa/verify',
    status: '/staff/mfa/status',
    unenroll: '/staff/mfa/unenroll',
    preference: '/staff/mfa/preference',
  },
  customer: {
    enroll: '/customers/mfa/enroll',
    emailRequestCode: '/customers/mfa/email/request-code',
    verify: '/customers/mfa/verify',
    status: '/customers/mfa/status',
    unenroll: '/customers/mfa/unenroll',
    preference: '/customers/mfa/preference',
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

/** `fetch` itself throws on a network failure (connection dropped, dev
 * server mid-restart, offline) rather than resolving - every caller here is
 * a login/MFA step gating a `setIsSubmitting(false)`, so an uncaught throw
 * leaves that button disabled forever with no visible error (the reported
 * "random freeze" on login). Catching here, once, means every MFA call is
 * safe by construction instead of each caller needing its own try/catch. */
async function fetchJson<T>(
  url: string,
  init?: RequestInit
): Promise<MfaApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return {
      data: null,
      error: 'Could not reach the server. Check your connection and try again.',
    };
  }

  return parseResponse<T>(response);
}

export async function getMfaStatus(
  role: ThemeRole,
  accessToken: string
): Promise<MfaApiResult<MfaStatusResponse>> {
  return fetchJson<MfaStatusResponse>(
    `${API_BASE_URL}${AUTH_PREFIX}${MFA_PATHS_BY_ROLE[role].status}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

export async function enrollMfa(
  role: ThemeRole,
  accessToken: string,
  method: MfaMethod = 'authenticator'
): Promise<MfaApiResult<TotpEnrollResponse>> {
  return fetchJson<TotpEnrollResponse>(
    `${API_BASE_URL}${AUTH_PREFIX}${MFA_PATHS_BY_ROLE[role].enroll}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ method }),
    }
  );
}

/** Emails a fresh code for the 'email' method - required before the user can
 * enter one, both when switching to it mid-login ("Other ways to verify")
 * and for a "Resend code" action. Not needed for 'authenticator' (the code
 * already lives in the user's own app) or for enrolling 'email' for the
 * first time (enrollMfa sends the first code itself). */
export async function requestMfaEmailCode(
  role: ThemeRole,
  accessToken: string
): Promise<MfaApiResult<{ sent: boolean }>> {
  return fetchJson<{ sent: boolean }>(
    `${API_BASE_URL}${AUTH_PREFIX}${MFA_PATHS_BY_ROLE[role].emailRequestCode}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
}

interface VerifyMfaOptions {
  method?: MfaMethod;
  rememberDevice?: boolean;
}

export async function verifyMfa(
  role: ThemeRole,
  code: string,
  accessToken: string,
  { method = 'authenticator', rememberDevice = false }: VerifyMfaOptions = {}
): Promise<MfaApiResult<MfaSessionResponse>> {
  return fetchJson<MfaSessionResponse>(
    `${API_BASE_URL}${AUTH_PREFIX}${MFA_PATHS_BY_ROLE[role].verify}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        code,
        method,
        remember_device: rememberDevice,
      }),
    }
  );
}

export async function unenrollMfa(
  role: ThemeRole,
  accessToken: string,
  method: MfaMethod
): Promise<MfaApiResult<MfaUnenrollResponse>> {
  return fetchJson<MfaUnenrollResponse>(
    `${API_BASE_URL}${AUTH_PREFIX}${MFA_PATHS_BY_ROLE[role].unenroll}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ method }),
    }
  );
}

export async function setMfaPreference(
  role: ThemeRole,
  accessToken: string,
  preferredMethod: MfaMethod
): Promise<MfaApiResult<{ preferred_method: MfaMethod }>> {
  return fetchJson<{ preferred_method: MfaMethod }>(
    `${API_BASE_URL}${AUTH_PREFIX}${MFA_PATHS_BY_ROLE[role].preference}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ preferred_method: preferredMethod }),
    }
  );
}
