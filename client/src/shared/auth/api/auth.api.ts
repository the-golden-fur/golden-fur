import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Session } from '../auth.types';

interface AuthApiResponse<T> {
  data: T;
  error: Error | null;
}

/**
 * `aal` (Authenticator Assurance Level) is a claim inside the access token's
 * JWT payload - it is not a field on `session.user`, unlike what a plain
 * `session.user.aal` read might suggest. Reading it off `user` always
 * silently returns `undefined`, which made MFA guards think aal2 was never
 * reached even right after a successful verify, looping back to the
 * challenge page forever. Decode it from the token instead.
 */
export function getSessionAal(session: Session | null): string | null {
  const token = session?.access_token;
  if (!token) {
    return null;
  }

  const payload = token.split('.')[1];
  if (!payload) {
    return null;
  }

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(base64)) as { aal?: string };
    return decoded.aal ?? null;
  } catch {
    return null;
  }
}

/**
 * Staff and customers share one Supabase Auth user table/session shape, so
 * the storage backend can't be picked at client-construction time by role -
 * it isn't known yet. Instead this always writes to sessionStorage (cleared
 * the moment the browser/tab closes) and mirrors into localStorage only
 * while PERSIST_FLAG_KEY is set. Customer login/signup/OAuth call
 * setSessionPersistence(true) before establishing a session so their session
 * survives a browser restart; staff flows never do, so closing the browser
 * signs them out even though the underlying Supabase session/refresh token
 * would otherwise still be valid.
 */
const PERSIST_FLAG_KEY = 'gf-auth-persist';

function isPersistenceEnabled(): boolean {
  try {
    return window.localStorage.getItem(PERSIST_FLAG_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Call with `true` right before establishing a customer session (login,
 * signup, OAuth callback) so it survives closing the browser; staff flows
 * leave this unset/false so their session is sessionStorage-only. */
export function setSessionPersistence(persist: boolean): void {
  try {
    if (persist) {
      window.localStorage.setItem(PERSIST_FLAG_KEY, 'true');
    } else {
      window.localStorage.removeItem(PERSIST_FLAG_KEY);
    }
  } catch {
    // Storage unavailable (e.g. private-mode edge cases) - falls back to
    // sessionStorage-only behavior, which is the safer default anyway.
  }
}

const dualStorage = {
  getItem(key: string): string | null {
    try {
      return (
        window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key)
      );
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      // ignore
    }
    try {
      if (isPersistenceEnabled()) {
        window.localStorage.setItem(key, value);
      } else {
        window.localStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
  },
  removeItem(key: string): void {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

let authClient: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (authClient) {
    return authClient;
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: dualStorage,
      // Handled manually in customerAuth.api.ts's handleOAuthCallback().
      // With this on, the SDK auto-consumes and strips the OAuth redirect's
      // URL fragment the moment any auth call runs (e.g. AuthProvider's own
      // getSession() on mount) - which races ahead of the callback page and
      // silently discards a failed exchange's error before our code can
      // read it.
      detectSessionInUrl: false,
    },
  });

  return authClient;
}

export async function getSession() {
  const client = getSupabaseClient();

  if (!client) {
    return {
      data: { session: null as Session | null },
      error: null,
    } as AuthApiResponse<{ session: Session | null }>;
  }

  return client.auth.getSession();
}

export function onAuthStateChange(
  callback: (event: string, session: Session | null) => void
) {
  const client = getSupabaseClient();

  if (!client) {
    return {
      data: {
        subscription: {
          unsubscribe: () => undefined,
        },
      },
      error: null,
    } as AuthApiResponse<{ subscription: { unsubscribe: () => void } }>;
  }

  return client.auth.onAuthStateChange(callback);
}

export async function signOut() {
  const client = getSupabaseClient();
  setSessionPersistence(false);

  if (!client) {
    return { error: null } as { error: Error | null };
  }

  return client.auth.signOut();
}

export async function refreshSession() {
  const client = getSupabaseClient();

  if (!client) {
    return {
      data: { session: null as Session | null },
      error: null,
    } as AuthApiResponse<{ session: Session | null }>;
  }

  return client.auth.refreshSession();
}

export async function setSession(accessToken: string, refreshToken: string) {
  const client = getSupabaseClient();

  if (!client) {
    return {
      data: { session: null as Session | null },
      error: null,
    } as AuthApiResponse<{ session: Session | null }>;
  }

  return client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
}
