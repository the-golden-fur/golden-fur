import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix so this also picks up non-VITE_-prefixed vars - this one
  // is Node-context only (read here, not by browser code), so it deliberately
  // isn't VITE_-prefixed like the client's Supabase config.
  const env = loadEnv(mode, process.cwd(), '');

  // Single source of truth for where the local Express API listens (see
  // server/.env's SERVER_PORT) - override via client/.env's
  // API_PROXY_TARGET if the server runs elsewhere. Every proxy rule below
  // points here; only '/staff' differs, adding a bypass on top.
  const apiProxy = {
    target: env.API_PROXY_TARGET ?? 'http://localhost:3000',
    changeOrigin: true,
  };

  return {
    root: fileURLToPath(new URL('.', import.meta.url)),
    plugins: [react()],
    server: {
      proxy: {
        '/auth/customers': apiProxy,
        '/auth/staff': apiProxy,
        // staff.routes.ts is mounted at the server root (not under /auth), but
        // '/staff/profile' etc. are also client-side page routes. Only proxy
        // fetch/XHR calls to the API; let browser navigations (Accept: text/html)
        // fall through to the SPA so hard refreshes on those routes still work.
        '/staff': {
          ...apiProxy,
          bypass(req) {
            if (req.headers.accept?.includes('text/html')) {
              return '/index.html';
            }
          },
        },
        // customer.routes.ts (server) is mounted at the server root, same as
        // staff.routes.ts - but unlike '/staff', neither '/customers' nor
        // '/pets' collides with a client-side page route (those live under
        // '/portal/...' and '/staff/admin/customers'), so no bypass is needed.
        '/customers': apiProxy,
        '/pets': apiProxy,
        // maintenance.routes.ts (server) is mounted at the server root, same
        // as staff.routes.ts - but the client-side page routes live under
        // '/staff/admin/maintenance/...', not bare '/maintenance', so no
        // bypass is needed here.
        '/maintenance': apiProxy,
        // discounts.routes.ts (server) is mounted at the server root, same
        // as maintenance.routes.ts - the client-side page route lives under
        // '/staff/admin/discounts', not bare '/discounts', so no bypass is
        // needed here either.
        '/discounts': apiProxy,
        // booking.routes.ts (server) is mounted at the server root, same as
        // maintenance.routes.ts - the client-side page routes live under
        // '/portal/book/...', '/portal/bookings', and
        // '/staff/bookings/queue', not bare '/bookings', so no bypass is
        // needed here either (#55 Guide notes).
        '/bookings': apiProxy,
        // grooming.routes.ts / daycare.routes.ts / veterinary.routes.ts
        // (server) are all mounted at the server root, same as
        // booking.routes.ts - their client-side page routes live under
        // '/staff/grooming/...', '/staff/daycare/...', and
        // '/staff/veterinary/...', not these bare prefixes, so no bypass is
        // needed for any of them either (Sprint 3 Epic A, #66-#70).
        '/grooming': apiProxy,
        '/daycare': apiProxy,
        '/veterinary': apiProxy,
      },
    },
  };
});
