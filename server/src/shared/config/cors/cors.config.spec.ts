import { afterEach, describe, expect, it } from 'vitest';
import { corsOptions } from './cors.config.ts';

describe('corsOptions', () => {
  const ORIGINAL_ENV = process.env.CORS_ALLOWED_ORIGINS;

  afterEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = ORIGINAL_ENV;
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
});
