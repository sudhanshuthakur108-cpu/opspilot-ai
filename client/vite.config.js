import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // The empty prefix loads every variable for use here; only VITE_* ones reach the browser.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': env.API_PROXY_TARGET || 'http://localhost:3000',
      },
    },
    test: {
      environment: 'jsdom',
    },
  };
});
