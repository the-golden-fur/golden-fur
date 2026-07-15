import type { CorsOptions } from 'cors';

export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    const allowedOrigins = parseAllowedOrigins(
      process.env.CORS_ALLOWED_ORIGINS
    );

    // No Origin header (e.g. server-to-server, curl, same-origin) - allow.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
};
