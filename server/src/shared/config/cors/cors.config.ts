import type { CorsOptions } from 'cors';

export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/** Any http(s)://localhost or 127.0.0.1 origin, with or without a port. */
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Outside production, allow any localhost origin regardless of port. Vite
 * picks the next free port (5174, 5175, ...) when 5173 is taken - e.g. a
 * second `npm run dev`, or a stale instance still holding 5173 - and that
 * would otherwise fail CORS against the single port in
 * CORS_ALLOWED_ORIGINS. Production stays on the explicit allow-list only.
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // server-to-server, curl, same-origin
  if (parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS).includes(origin)) {
    return true;
  }
  return process.env.NODE_ENV !== 'production' && LOCALHOST_ORIGIN.test(origin);
}

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
};
