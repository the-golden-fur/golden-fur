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
      scopes: 'email profile',
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
      // Supabase needs an email to create/match the user; without an
      // explicit scope, Facebook may only return public_profile and the
      // exchange fails silently on Supabase's side.
      scopes: 'email',
    },
  });

  return {
    data: null,
    error: error?.message ?? null,
  };
}

/**
 * Supabase's OAuth redirect appends the result to the URL fragment
 * (#access_token=...&refresh_token=... on success, or
 * #error=...&error_description=... on failure) rather than to the query
 * string. detectSessionInUrl is off (see auth.api.ts), so nothing consumes
 * this fragment automatically - we own reading it, and must clear it
 * ourselves once read so tokens don't linger in the URL/history.
 */
function readAndClearOAuthHash(): URLSearchParams {
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);

  window.history.replaceState(
    null,
    '',
    window.location.pathname + window.location.search
  );

  return params;
}

function readOAuthErrorFromParams(params: URLSearchParams): string | null {
  const description = params.get('error_description');
  const code = params.get('error');

  if (description) {
    return decodeURIComponent(description.replace(/\+/g, ' '));
  }
  if (code) {
    return code;
  }
  return null;
}

export async function handleOAuthCallback(): Promise<
  AuthApiResult<OAuthCallbackResult>
> {
  const client = getSupabaseClient();

  if (!client) {
    return { data: null, error: 'Supabase client is not configured' };
  }

  const hashParams = readAndClearOAuthHash();
  // Best-effort only: this sessionStorage marker does not reliably survive
  // the redirect through the OAuth provider and back (observed cleared by
  // the browser in production testing), so it must never gate whether we
  // attempt to establish the session - the fragment's own tokens are the
  // authoritative signal that a callback is actually in progress.
  const provider = getStoredOAuthProvider();
  clearStoredOAuthProvider();

  const providerError = readOAuthErrorFromParams(hashParams);
  if (providerError) {
    return { data: null, error: providerError };
  }

  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');

  if (!accessToken || !refreshToken) {
    return { data: null, error: 'OAuth session could not be established' };
  }

  const { data: setSessionData, error: setSessionError } =
    await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

  if (setSessionError || !setSessionData.session) {
    return {
      data: null,
      error: setSessionError?.message ?? 'OAuth session could not be established',
    };
  }

  const session = setSessionData.session;

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
