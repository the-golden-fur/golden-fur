import type { Session as SupabaseSession } from '@supabase/supabase-js';

/** Alias of the real Supabase session shape — do not redeclare its fields here. */
export type Session = SupabaseSession;

/** Minimal identity subset exposed to the rest of the app (derived from Session.user). */
export interface AuthUser {
  id: string;
  email?: string | null;
  role?: string | null;
  app_metadata?: Record<string, unknown>;
}

export interface JwtPayload {
  sub?: string;
  email?: string;
  role?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}
