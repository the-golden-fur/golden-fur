import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  server: {
    proxy: {
      '/auth/customers': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/auth/staff': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // staff.routes.ts is mounted at the server root (not under /auth), but
      // '/staff/profile' etc. are also client-side page routes. Only proxy
      // fetch/XHR calls to the API; let browser navigations (Accept: text/html)
      // fall through to the SPA so hard refreshes on those routes still work.
      '/staff': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        bypass(req) {
          if (req.headers.accept?.includes('text/html')) {
            return '/index.html';
          }
        },
      },
    },
  },
});
