import { getSupabaseClient } from '../../../../shared/auth/api/auth.api';
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
  return postJson<{
    message: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  }>('/customers/signup', payload);
}

export async function login(payload: CustomerLoginPayload) {
  return postJson<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>('/customers/login', payload);
}

function getStoredOAuthProvider() {
  return window.sessionStorage.getItem('oauthProvider') as
    | 'google'
    | 'facebook'
    | null;
}

function clearStoredOAuthProvider() {
  window.sessionStorage.removeItem('oauthProvider');
}

export async function signInWithGoogle() {
  const client = getSupabaseClient();

  if (!client) {
    return { data: null, error: 'Supabase client is not configured' };
  }

  window.sessionStorage.setItem('oauthProvider', 'google');

  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  return {
    data: null,
    error: error?.message ?? null,
  };
}

export async function signInWithFacebook() {
  const client = getSupabaseClient();

  if (!client) {
    return { data: null, error: 'Supabase client is not configured' };
  }

  window.sessionStorage.setItem('oauthProvider', 'facebook');

  const { error } = await client.auth.signInWithOAuth({
    provider: 'facebook',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  return {
    data: null,
    error: error?.message ?? null,
  };
}

export async function handleOAuthCallback(): Promise<
  AuthApiResult<OAuthCallbackResult>
> {
  const client = getSupabaseClient();

  if (!client) {
    return { data: null, error: 'Supabase client is not configured' };
  }

  const provider = getStoredOAuthProvider();

  if (!provider) {
    return { data: null, error: 'OAuth session could not be established' };
  }

  const sessionResponse = await client.auth.getSession();
  const session = sessionResponse.data?.session;

  if (!session?.access_token) {
    return { data: null, error: 'OAuth session could not be established' };
  }

  const response = await fetch(
    `${API_BASE_URL}${AUTH_PREFIX}/customers/oauth/callback`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  );

  const body = (await response.json().catch(() => null)) as {
    action?: string;
    error?: string;
  } | null;

  clearStoredOAuthProvider();

  if (!response.ok) {
    const errorMessage =
      body && typeof body === 'object' && body.error
        ? body.error
        : 'OAuth callback failed';
    return { data: null, error: errorMessage };
  }

  return {
    data: {
      provider,
      merged: body?.action === 'merged',
      access_token: session.access_token,
      refresh_token: session.refresh_token ?? '',
    },
    error: null,
  };
}
