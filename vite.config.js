import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '0.0.0.0', allowedHosts: ['.e2b.app'], headers: { 'Cache-Control': 'no-store, max-age=0' } },
  preview: { host: '0.0.0.0', allowedHosts: ['.e2b.app'], headers: { 'Cache-Control': 'no-store, max-age=0' } },
});
