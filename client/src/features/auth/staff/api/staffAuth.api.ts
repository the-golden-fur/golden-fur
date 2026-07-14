import { getSupabaseClient } from '../../../../shared/auth/api/auth.api';
import type {
  StaffAuthMessageResponse,
  StaffForgotPasswordPayload,
  StaffLoginPayload,
  StaffLoginResponse,
  TotpChallengePayload,
  TotpEnrollResponse,
} from '../staffAuth.types';

interface StaffApiResult<T> {
  data: T | null;
  error: string | null;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const AUTH_PREFIX = '/auth';

async function parseResponse<T>(
  response: Response
): Promise<StaffApiResult<T>> {
  const body = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null;

  if (!response.ok) {
    const errorMessage =
      body && typeof body === 'object' && 'error' in body && body.error
        ? body.error
        : 'Request failed. Please try again.';

    return {
      data: null,
      error: errorMessage,
    };
  }

  return {
    data: body as T,
    error: null,
  };
}

async function postJson<T>(
  path: string,
  body: unknown,
  accessToken?: string | null
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${AUTH_PREFIX}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  return parseResponse<T>(response);
}

export function login(payload: StaffLoginPayload) {
  return postJson<StaffLoginResponse>('/staff/login', payload);
}

export function mfaEnroll(accessToken: string | null) {
  return postJson<TotpEnrollResponse>('/staff/mfa/enroll', {}, accessToken);
}

export function mfaVerify(
  payload: TotpChallengePayload,
  accessToken: string | null
) {
  return postJson<StaffLoginResponse | StaffAuthMessageResponse>(
    '/staff/mfa/verify',
    payload,
    accessToken
  );
}

export function forgotPassword(payload: StaffForgotPasswordPayload) {
  return postJson<StaffAuthMessageResponse>('/staff/forgot-password', payload);
}

/**
 * `detectSessionInUrl` is disabled on the shared client (see auth.api.ts),
 * mirroring the customer OAuth callback's own manual-exchange pattern -
 * Supabase's password-recovery redirect carries the same
 * access_token/refresh_token hash-fragment shape as an OAuth callback,
 * just with `type=recovery` instead of a provider name.
 */
export async function establishRecoverySession(): Promise<StaffApiResult<null>> {
  const client = getSupabaseClient();

  if (!client) {
    return { data: null, error: 'Supabase client is not configured' };
  }

  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);

  window.history.replaceState(
    null,
    '',
    window.location.pathname + window.location.search
  );

  const errorDescription = params.get('error_description');
  if (errorDescription) {
    return {
      data: null,
      error: decodeURIComponent(errorDescription.replace(/\+/g, ' ')),
    };
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (!accessToken || !refreshToken) {
    return {
      data: null,
      error: 'Reset link is invalid or has expired. Request a new one.',
    };
  }

  const { error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: null, error: null };
}

export async function updateStaffPassword(
  password: string
): Promise<StaffApiResult<null>> {
  const client = getSupabaseClient();

  if (!client) {
    return { data: null, error: 'Supabase client is not configured' };
  }

  const { error } = await client.auth.updateUser({ password });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: null, error: null };
}
