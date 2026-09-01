import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { buildApiProxy } from './vite.proxy.config';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix so this also picks up non-VITE_-prefixed vars - this one
  // is Node-context only (read here, not by browser code), so it deliberately
  // isn't VITE_-prefixed like the client's Supabase config.
  const env = loadEnv(mode, process.cwd(), '');

  // Where the local Express API listens (see server/.env's SERVER_PORT).
  // Override via client/.env's API_PROXY_TARGET if the server runs elsewhere.
  const apiTarget = env.API_PROXY_TARGET ?? 'http://localhost:3000';

  return {
    root: fileURLToPath(new URL('.', import.meta.url)),
    plugins: [react()],
    server: {
      // One entry per server route file, generated from API_ROUTE_PREFIXES
      // in vite.proxy.config.ts - see that file for how to add a route and
      // the guard test that stops one being forgotten.
      proxy: buildApiProxy(apiTarget) as Record<string, ProxyOptions>,
    },
  };
});
