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
