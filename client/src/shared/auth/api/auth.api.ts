import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Session } from '../auth.types';

interface AuthApiResponse<T> {
  data: T;
  error: Error | null;
}

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
      detectSessionInUrl: true,
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
