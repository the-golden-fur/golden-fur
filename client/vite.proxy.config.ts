/**
 * Dev-server API proxy, in one place.
 *
 * Every server route file (`server/src/features/**\/*.routes.ts`) is mounted
 * at the Express root under a bare first-segment prefix (`/credits/...`,
 * `/bookings/...`). In dev the client talks to those over relative URLs, so
 * Vite has to forward them to Express instead of answering with its own SPA
 * fallback HTML (the silent failure mode: `response.ok` is true, JSON parse
 * throws, the feature just looks empty).
 *
 * Add a prefix to `API_ROUTE_PREFIXES` when you add a route file. The guard
 * test in `vite.proxy.config.spec.ts` reads the server's route files and
 * fails if any prefix is missing here, so it can't be silently forgotten.
 */
export const API_ROUTE_PREFIXES = [
  '/auth/customers',
  '/auth/staff',
  '/billing',
  '/bookings',
  '/branches',
  '/catalog',
  '/credits',
  '/customers',
  '/daycare',
  '/discounts',
  '/grooming',
  '/hotel',
  '/maintenance',
  '/messages',
  '/notifications',
  '/pets',
  '/public',
  '/reports',
  '/staff',
  '/veterinary',
] as const;

/**
 * Prefixes that ALSO match a client-side page route (`/staff/...` pages,
 * the `/branches` marketing page). Only proxy XHR/fetch calls; let a
 * browser navigation (Accept: text/html) fall through to the SPA so a hard
 * refresh on those routes still works.
 */
const HTML_BYPASS_PREFIXES = new Set<string>(['/staff', '/branches']);

interface BypassRequest {
  headers: { accept?: string | string[] };
}

/** Shape of one Vite `server.proxy` entry (structural - avoids a type-only
 * dependency on vite/node in this shared-with-tests module). */
export interface ApiProxyEntry {
  target: string;
  changeOrigin: true;
  bypass?: (req: BypassRequest) => string | undefined;
}

export function buildApiProxy(target: string): Record<string, ApiProxyEntry> {
  const htmlBypass = (req: BypassRequest): string | undefined => {
    const accept = req.headers.accept;
    const value = Array.isArray(accept) ? accept.join(',') : (accept ?? '');
    return value.includes('text/html') ? '/index.html' : undefined;
  };

  return Object.fromEntries(
    API_ROUTE_PREFIXES.map((prefix) => [
      prefix,
      HTML_BYPASS_PREFIXES.has(prefix)
        ? { target, changeOrigin: true as const, bypass: htmlBypass }
        : { target, changeOrigin: true as const },
    ])
  );
}
