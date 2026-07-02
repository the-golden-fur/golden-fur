import type {
  CustomerLoginPayload,
  CustomerSignupPayload,
  OAuthCallbackResult,
} from '../customerAuth.types';

interface AuthApiResult<T> {
  data: T | null;
  error: string | null;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const AUTH_PREFIX = '/auth';

async function parseResponse<T>(response: Response): Promise<AuthApiResult<T>> {
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

async function postJson<T>(path: string, body: unknown) {
  const response = await fetch(`${API_BASE_URL}${AUTH_PREFIX}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return parseResponse<T>(response);
}

export async function signup(payload: CustomerSignupPayload) {
  return postJson<{ message: string }>('/customers/signup', payload);
}

export async function login(payload: CustomerLoginPayload) {
  return postJson<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>('/customers/login', payload);
}

export async function signInWithGoogle() {
  return {
    data: { provider: 'google' as const },
    error: null,
  } satisfies AuthApiResult<{ provider: 'google' }>;
}

export async function signInWithFacebook() {
  return {
    data: { provider: 'facebook' as const },
    error: null,
  } satisfies AuthApiResult<{ provider: 'facebook' }>;
}

export async function handleOAuthCallback(): Promise<
  AuthApiResult<OAuthCallbackResult>
> {
  return {
    data: {
      provider: 'google',
      merged: false,
    },
    error: null,
  };
}
