/**
 * game/raw-text.d.ts — the type for Vite's `?raw` text imports.
 *
 * `game/encounters.ts` imports the twelve hand-authored ASCII layouts as strings, the same way
 * `core/schemas.ts` imports the twelve node JSONs as objects: statically, so the content is in the
 * bundle and no lane has to go looking for a file at run time. Vite, `vite build` and vitest all
 * understand `?raw`; TypeScript needs to be told what it hands back, and an ambient declaration
 * cannot live inside a module, which is why this is its own file.
 *
 * It is deliberately narrow — `*.txt?raw` and nothing else — so it types the one import shape the
 * project actually uses rather than blessing every query suffix a bundler might invent.
 */
declare module "*.txt?raw" {
  const content: string;
  export default content;
}
