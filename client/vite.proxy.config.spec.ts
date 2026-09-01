import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_ROUTE_PREFIXES, buildApiProxy } from './vite.proxy.config';

// vitest runs with cwd = the client package root.
const SERVER_FEATURES_DIR = join(
  process.cwd(),
  '..',
  'server',
  'src',
  'features'
);

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return full.endsWith('.routes.ts') ? [full] : [];
  });
}

/**
 * Every path literal in a *.routes.ts file that starts with `/` - e.g.
 * '/bookings/:id/pay', '/customers/login' (the sub-routers mounted at
 * '/auth' contribute '/customers/...' and '/staff/...').
 */
function serverRoutePaths(): string[] {
  const paths = new Set<string>();
  for (const file of routeFiles(SERVER_FEATURES_DIR)) {
    const src = readFileSync(file, 'utf8');
    for (const match of src.matchAll(
      /['"`](\/[a-zA-Z][\w-]*(?:\/[\w:*-]+)*)/g
    )) {
      // '/auth' itself is only a mount point (router.use('/auth', ...)); the
      // real paths come from the sub-routers.
      if (match[1] !== '/auth') paths.add(match[1]);
    }
  }
  return [...paths];
}

describe('vite dev proxy', () => {
  it('covers every server route path with a proxy prefix', () => {
    const uncovered = serverRoutePaths().filter((routePath) => {
      // The '/auth' sub-routers define '/customers/...' and '/staff/...';
      // the proxy prefixes them back to '/auth/customers' and '/auth/staff'.
      const candidates = routePath.startsWith('/customers/')
        ? [routePath, `/auth${routePath}`]
        : routePath.startsWith('/staff/')
          ? [routePath, `/auth${routePath}`]
          : [routePath];

      return !candidates.some((candidate) =>
        API_ROUTE_PREFIXES.some(
          (prefix) => candidate === prefix || candidate.startsWith(`${prefix}/`)
        )
      );
    });

    expect(
      uncovered,
      `these server routes have no matching entry in API_ROUTE_PREFIXES ` +
        `(client/vite.proxy.config.ts) - requests to them fall through to ` +
        `Vite's SPA fallback instead of Express:\n  ${uncovered.join('\n  ')}`
    ).toEqual([]);
  });

  it('builds a proxy entry per prefix, all pointing at the target', () => {
    const proxy = buildApiProxy('http://localhost:3000');
    expect(Object.keys(proxy).sort()).toEqual([...API_ROUTE_PREFIXES].sort());
    for (const entry of Object.values(proxy)) {
      expect(entry.target).toBe('http://localhost:3000');
      expect(entry.changeOrigin).toBe(true);
    }
  });

  it('lets browser navigations to /staff and /branches fall through to the SPA', () => {
    const proxy = buildApiProxy('http://localhost:3000');
    for (const prefix of ['/staff', '/branches']) {
      const bypass = proxy[prefix].bypass;
      expect(bypass).toBeTypeOf('function');
      expect(bypass?.({ headers: { accept: 'text/html' } })).toBe(
        '/index.html'
      );
      expect(
        bypass?.({ headers: { accept: 'application/json' } })
      ).toBeUndefined();
    }
  });
});
