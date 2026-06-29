import type { StaffAuthCredentials, TotpCodePayload } from '../modules/validators/staffAuth.validator';

interface StaffApiResponse<T> {
  data: T | null;
  error: Error | null;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<StaffApiResponse<T>> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  const payload = await response.json();

  if (!response.ok) {
    return { data: null, error: new Error(payload.error ?? 'Request failed') };
  }

  return { data: payload as T, error: null };
}

export async function login(credentials: StaffAuthCredentials) {
  return requestJson<{ success: boolean }>('/staff/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function mfaEnroll() {
  return requestJson<{ qrCodeUri: string }>('/staff/mfa/enroll', {
    method: 'POST',
  });
}

export async function mfaVerify(payload: TotpCodePayload) {
  return requestJson<{ success: boolean }>('/staff/mfa/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function forgotPassword(payload: Pick<StaffAuthCredentials, 'username'>) {
  return requestJson<{ success: boolean }>('/staff/forgot-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
