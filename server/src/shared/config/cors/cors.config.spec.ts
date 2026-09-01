import { afterEach, describe, expect, it } from 'vitest';
import { corsOptions } from './cors.config.ts';

describe('corsOptions', () => {
  const ORIGINAL_ENV = process.env.CORS_ALLOWED_ORIGINS;
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  afterEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = ORIGINAL_ENV;
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  function checkOrigin(origin: string | undefined) {
    return new Promise<{ err: Error | null; allow?: boolean }>((resolve) => {
      const originCheck = corsOptions.origin as (
        _origin: string | undefined,
        _callback: (_err: Error | null, _allow?: boolean) => void
      ) => void;

      originCheck(origin, (err, allow) => resolve({ err, allow }));
    });
  }

  it('allows an origin listed in CORS_ALLOWED_ORIGINS', async () => {
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173';

    const result = await checkOrigin('http://localhost:5173');

    expect(result.err).toBeNull();
    expect(result.allow).toBe(true);
  });

  it('rejects an origin not on the list', async () => {
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173';

    const result = await checkOrigin('http://evil.example.com');

    expect(result.err).toBeInstanceOf(Error);
  });

  it('parses a comma-separated multi-origin value, including surrounding whitespace', async () => {
    process.env.CORS_ALLOWED_ORIGINS =
      'http://localhost:5173, https://staging.goldenfur.app ,http://localhost:4000';

    const first = await checkOrigin('http://localhost:5173');
    const second = await checkOrigin('https://staging.goldenfur.app');
    const third = await checkOrigin('http://localhost:4000');

    expect(first.allow).toBe(true);
    expect(second.allow).toBe(true);
    expect(third.allow).toBe(true);
  });

  it('allows requests with no Origin header (server-to-server, curl)', async () => {
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173';

    const result = await checkOrigin(undefined);

    expect(result.err).toBeNull();
    expect(result.allow).toBe(true);
  });

  it('allows any localhost port outside production (Vite port fallback)', async () => {
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173';
    process.env.NODE_ENV = 'development';

    for (const origin of [
      'http://localhost:5174',
      'http://localhost:5180',
      'http://127.0.0.1:5175',
    ]) {
      const result = await checkOrigin(origin);
      expect(result.allow, origin).toBe(true);
    }
  });

  it('does NOT loosen to localhost in production', async () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://app.goldenfur.example';
    process.env.NODE_ENV = 'production';

    const result = await checkOrigin('http://localhost:5174');

    expect(result.err).toBeInstanceOf(Error);
  });
});
