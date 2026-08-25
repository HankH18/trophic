import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  base: './',
  publicDir: 'public',
  resolve: {
    alias: {
      '@core': r('./core'),
      '@game': r('./game'),
      '@data': r('./data'),
      '@tools': r('./tools'),
    },
  },
  server: { port: 5173 },
  build: { outDir: 'dist', target: 'es2022', assetsInlineLimit: 0 },
});
