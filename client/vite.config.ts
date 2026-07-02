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
    },
  },
});
