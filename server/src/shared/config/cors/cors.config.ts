import type { CorsOptions } from 'cors';

export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function buildCorsOptions(
  rawOrigins: string | undefined = process.env.CORS_ALLOWED_ORIGINS
): CorsOptions {
  const allowedOrigins = parseAllowedOrigins(rawOrigins);

  return {
    origin(origin, callback) {
      // No Origin header (same-origin requests, curl, server-to-server) -
      // nothing to check against an allowlist, so let it through.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  };
}

export const corsOptions = buildCorsOptions();
