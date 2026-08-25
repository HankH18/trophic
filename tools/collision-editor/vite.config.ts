/**
 * tools/collision-editor/vite.config.ts — the second Vite target build-doc §5 asks for.
 *
 * `npm run collision` ran `vite --config tools/collision-editor/vite.config.ts` against a file that
 * did not exist, so the command failed on a rolldown config-load error and the directory stayed
 * empty. That left the mask contract with two declarations (game/collision.ts and
 * tools/overlay-diff/mask.ts) that disagreed and no producer to arbitrate them — see
 * game/collision.ts's `MaskPolarity` header.
 *
 * The aliases and `publicDir` are the ROOT project's, not this directory's: the editor imports
 * `game/collision.ts` verbatim (it must sample exactly what the runtime samples) and serves the same
 * `public/assets` the game does, so a mask is drawn over the painting the player will actually see.
 */
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const repo = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  publicDir: repo('public'),
  resolve: {
    alias: {
      '@core': repo('core'),
      '@game': repo('game'),
      '@data': repo('data'),
      '@tools': repo('tools'),
    },
  },
  server: { port: 5174 },
  build: { outDir: repo('dist/collision-editor'), emptyOutDir: true, target: 'es2022' },
});
