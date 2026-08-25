// Copies assets/final -> public/assets so Vite serves them by URL at runtime.
// assets/final stays the canonical committed location (build-doc §5); public/assets is a build artifact.
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const SRC = new URL('../assets/final/', import.meta.url);
const DEST = new URL('../public/assets/', import.meta.url);

await rm(DEST, { recursive: true, force: true });
await mkdir(DEST, { recursive: true });
if (existsSync(SRC)) await cp(SRC, DEST, { recursive: true });
console.info('[sync-assets] assets/final -> public/assets');
