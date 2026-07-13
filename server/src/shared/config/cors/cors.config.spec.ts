import { describe, expect, it, vi } from 'vitest';
import type { CorsOptions } from 'cors';
import { buildCorsOptions, parseAllowedOrigins } from './cors.config.ts';

type OriginCallback = (_err: Error | null, _allow?: boolean) => void;

function checkOrigin(
  options: CorsOptions,
  origin: string | undefined,
  callback: OriginCallback
) {
  const originCheck = options.origin as (
    _origin: string | undefined,
    _callback: OriginCallback
  ) => void;

  originCheck(origin, callback);
}

describe('parseAllowedOrigins', () => {
  it('splits a comma-separated value and trims whitespace', () => {
    expect(
      parseAllowedOrigins(
        'http://localhost:5173, https://app.goldenfur.com ,  https://staging.goldenfur.com'
      )
    ).toEqual([
      'http://localhost:5173',
      'https://app.goldenfur.com',
      'https://staging.goldenfur.com',
    ]);
  });

  it('returns a single-item array for one origin with no commas', () => {
    expect(parseAllowedOrigins('http://localhost:5173')).toEqual([
      'http://localhost:5173',
    ]);
  });

  it('returns an empty array for undefined or empty input', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins('')).toEqual([]);
  });

  it('drops empty segments from trailing/stray commas', () => {
    expect(parseAllowedOrigins('http://localhost:5173,,')).toEqual([
      'http://localhost:5173',
    ]);
  });
});

describe('buildCorsOptions', () => {
  it('allows a request from an origin on the allowlist', () => {
    const options = buildCorsOptions(
      'http://localhost:5173,https://app.goldenfur.com'
    );
    const callback = vi.fn();

    checkOrigin(options, 'https://app.goldenfur.com', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('rejects a request from an origin not on the allowlist', () => {
    const options = buildCorsOptions('http://localhost:5173');
    const callback = vi.fn();

    checkOrigin(options, 'https://evil.example.com', callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, allowed] = callback.mock.calls[0]!;
    expect(error).toBeInstanceOf(Error);
    expect(allowed).toBeUndefined();
  });

  it('allows requests with no Origin header (same-origin/server-to-server)', () => {
    const options = buildCorsOptions('http://localhost:5173');
    const callback = vi.fn();

    checkOrigin(options, undefined, callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('sets credentials to true', () => {
    const options = buildCorsOptions('http://localhost:5173');

    expect(options.credentials).toBe(true);
  });
});
