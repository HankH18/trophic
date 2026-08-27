/**
 * tests/gates/asset-palette-contract.test.ts — "consistent bit count across every image", measured.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS BINDS, AND WHY IT IS THIS SET AND NOT A WIDER ONE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 32 colours is 5 bits, so "one frozen palette" and "consistent bit count" are the same requirement
 * said twice. `tests/gates/player-art-contract.test.ts` made that measurable for the three player
 * views — this file is the general case: EVERY IMAGE THE BUNDLE SHIPS.
 *
 * **The covered set is every `*.png` the repo ships out of `assets/final/`.** That is not a scope
 * this file invented. `game/placeholder.ts` globs `assets/final/**\/*.png` at BUILD time and
 * registers each hit as a real asset; `queueRealAssets` then hands every one of them to
 * `scene.load.image`. A PNG under that directory is, by construction, a texture the player sees.
 * `assets/raw/**` is gitignored generator output and is not shipped, so it is not bound.
 *
 * THE COVERED SET IS THE UNION OF WHAT GIT TRACKS AND WHAT IS ON DISK, which is the only shape that
 * survives the sabotage this gate was asked to withstand. A gate whose scope is a directory listing
 * cannot notice a DELETION: the file leaves the listing, the loop shrinks, and the suite goes green
 * over the absence. Asking git what the repo has committed under `assets/final/` gives an answer
 * that does not move when someone removes the file from the working tree, so a deleted asset fails
 * here instead of silently ceasing to be checked. The on-disk half of the union covers the opposite
 * case: art dropped into the shipping directory and not yet committed is bound the moment it lands.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY MANIFEST STATUS IS *NOT* THE SCOPE — this was checked against the data, and it is inverted
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * The obvious rule is "files behind a row a human signed off must be palette-clean" — `approved` and
 * `final` cannot be written by any tool, so they are a human signature. Measured against
 * `tools/comfy/manifest.json` as it stands, that rule binds nothing and would be wrong where it did:
 *
 *   • 288 rows. 287 are `pending`; exactly ONE is `approved` (`player-front`).
 *   • That one row's `finalFile` — `assets/final/player/player-front.png` — DOES NOT EXIST.
 *   • Its `file` — `assets/approved-trials/player-APPROVED.png` — does exist, and carries 69,511
 *     distinct colours. That is correct and must stay correct: an approved row's `file` is the raw
 *     1024² trial that postprocess consumes, not the quantized output postprocess produces. A gate
 *     demanding 32 colours of it would be demanding the input look like the output.
 *   • Meanwhile all 10 files that DO exist under `assets/final/` are `pending` rows — and all 10
 *     are already exactly palette-clean.
 *
 * So status answers "has a human blessed this picture", and this gate asks "has this file been
 * through quantize" — two different questions, and sorting by the first would have bound zero
 * postprocessed pixels. The shipping directory answers the second directly.
 *
 * And the WIP verdicts on the maps are not a reason to loosen this either. `tools/artverify` is
 * explicit that it "is not a gate" and that "a REJECT here does not move a row's status": its
 * verdicts are contextual — is this the right town, are the edge exits the ones adjacency says.
 * Palette conformance is mechanical, produced by `tools/postprocess/steps.ts::quantize`, and is
 * orthogonal to whether the composition is any good. A map can be REJECT-for-content and exactly
 * on-palette, and every one of the ten currently is. Binding them therefore costs no false red.
 *
 * **Do not widen this to `assets/**`.** `assets/approved-trials/*.png` are the approved 1024²
 * trials — 54k to 354k distinct colours, by design. `assets/raw/**` is generator output. Both are
 * upstream of quantize; a gate over them would be red forever for no defect, and a gate everyone
 * has learned to ignore is worse than no gate. The advisory census below is where non-shipping
 * files get reported, and it never fails.
 *
 * COLLISION MASKS ARE EXCLUDED, BY DATA RATHER THAN BY FILENAME. Every `data/nodes/*.json` declares
 * a `collisionMask` under `assets/final/maps/`. Those are written by `game/collision.ts` at ink 0
 * and 255 — `#000000` / `#ffffff`, neither of which the frozen palette contains — so the day the
 * masks land, an unqualified sweep of the shipping directory would go red on twelve files that are
 * data, not art. The exclusion reads the `collisionMask` fields rather than matching `-mask.png`,
 * so it follows the data if the naming ever changes.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * THE DISCIPLINE, INHERITED FROM player-art-contract.test.ts
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 1. **The palette is read from `data/palette.json` at test time**, through the same `loadPalette()`
 *    the quantize step uses. T-24 existed because 21 hex literals were fossilised in a tool's source
 *    and went on being written after the re-freeze moved every value; a copied hex list in the gate
 *    meant to catch fossils would be the same defect wearing a badge.
 *
 * 2. **Nothing may pass vacuously.** Missing, zero-byte, entirely transparent, and single-flat-colour
 *    files each fail with their own message. Those are not hypothetical: the art session has measured
 *    Comfy Cloud returning well-formed 1024² PNGs that are entirely black, and a `for` loop over such
 *    a file reports "0 off-palette pixels" — a clean bill of health for a black square.
 *
 * 3. **Offending pixels are reported as hex values and coordinates, not as a count.** "8 off-palette
 *    pixels" told nobody anything; "#f9db10 at (18,6)" is the dead literal from the previous freeze,
 *    and says which repair is needed.
 *
 * 4. **The CIEDE2000 readout is ADVISORY and reuses the repo's existing implementation.**
 *    `tools/palette/color.mjs::deltaE2000` is what `fit.mjs`, `compare.mjs`, `validate.mjs` and the
 *    decision sheet all measured the freeze with. A second colour metric here could disagree with
 *    the one the palette was chosen by and nobody would know which was lying, so this file imports
 *    that one. It is loaded through a computed specifier because the module is untyped `.mjs` and a
 *    static import trips TS7016 under `strict` — the alternative was a duplicate implementation,
 *    which is the exact failure being avoided.
 *
 * 5. **The distinct-colour count is printed against a measured reference band, because on its own it
 *    means nothing.** "brackwater 31 colours" told nobody whether 31 was disciplined or a mess. The
 *    band, and the reason there is no cap, are in the GOLD BAND section below.
 *
 * 6. **A second reading sits beside it — GROUND TEXTURE — because the colour count alone cannot tell
 *    a good map from the one this project has been shipping.** A map at 16 colours and 9% edge
 *    density is flat and wrong; a map at 16 colours and 45% is right. Both satisfy a colour-count
 *    check identically, and the flat one is the failure that has actually been shipping. Note 4's
 *    principle — reuse the repo's instrument — was applied here and it **failed the measurement**:
 *    §8.2's Sobel is structurally blind to a one-pixel dither, so `edgePercent` defines its own
 *    operator and the control below proves both halves of that. Reuse an existing instrument, but
 *    measure that it can see the thing before you trust it.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import sharp from 'sharp';

import { loadPalette, loadPaletteFile, REPO_ROOT, type PaletteRgb } from '../../tools/postprocess/palette.ts';
import type { Raster } from '../../tools/postprocess/raster.ts';
import {
  contrastNormalise,
  contrastRange,
  luminance,
  sobelMagnitude,
  thresholdEdges,
} from '../../tools/overlay-diff/edges.ts';
import balance from '../../data/balance.json';

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * The repo's CIEDE2000, not a second one.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

interface Lab {
  L: number;
  a: number;
  b: number;
}
interface ColorModule {
  rgbToLab(r: number, g: number, b: number): Lab;
  deltaE2000(c1: Lab, c2: Lab): number;
}
/** Computed so TypeScript does not try to resolve types for an untyped `.mjs` — see note 4 above. */
const COLOR_MJS = new URL('../../tools/palette/color.mjs', import.meta.url).href;
const color = (await import(/* @vite-ignore */ COLOR_MJS)) as ColorModule;

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Scope
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * `game/placeholder.ts::FINAL_DIR`. It is a string here rather than an import because that constant
 * is module-private, but it is not left unbound: `the shipping root is where the node data says it
 * is` below fails if `data/nodes/*.json` ever stops naming files underneath it.
 */
const SHIPPED_ROOT = 'assets/final';

const isPng = (p: string): boolean => p.toLowerCase().endsWith('.png');
const rel = (abs: string): string => relative(REPO_ROOT, abs).split('\\').join('/');

/** Every path `data/nodes/*.json` declares, split into the art and the collision masks. */
function nodeDeclarations(): { mapAssets: string[]; masks: string[] } {
  const dir = resolve(REPO_ROOT, 'data/nodes');
  const mapAssets: string[] = [];
  const masks: string[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const node = JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
      mapAsset?: string;
      collisionMask?: string;
    };
    if (typeof node.mapAsset === 'string') mapAssets.push(node.mapAsset);
    if (typeof node.collisionMask === 'string') masks.push(node.collisionMask);
  }
  return { mapAssets, masks };
}

const DECLARED = nodeDeclarations();
/** Masks are engine data at ink 0/255, not palette art. Derived from the field, never from `-mask`. */
const EXCLUDED = new Set(DECLARED.masks.map((p) => p.replace(/^\.?\/+/, '')));

/**
 * What git has committed under the shipping directory. This is the half of the scope that does not
 * move when a file is deleted from the working tree, and it is why deleting a covered asset is a
 * red rather than a silent shrink of the loop.
 */
function committedShippedPngs(): string[] {
  let out: string;
  try {
    out = execFileSync('git', ['ls-files', '-z', '--', SHIPPED_ROOT], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    // Loudly, never a skip: without git the scope silently degrades to a directory listing and the
    // deletion case stops being covered at all.
    throw new Error(
      `asset-palette-contract: \`git ls-files -- ${SHIPPED_ROOT}\` failed (${String(e)}). This gate ` +
        'asks git what the repo ships so that a DELETED asset still fails; it will not fall back to ' +
        'a directory listing, because that is the vacuous pass it exists to prevent.',
    );
  }
  return out.split('\0').filter((p) => p.length > 0 && isPng(p));
}

/** What is physically on disk under the shipping directory, committed or not. */
function presentShippedPngs(): string[] {
  const root = resolve(REPO_ROOT, SHIPPED_ROOT);
  if (!existsSync(root)) {
    throw new Error(
      `asset-palette-contract: ${SHIPPED_ROOT}/ does not exist. That directory is where finished art ` +
        'lives (build-doc §5) and what `game/placeholder.ts` globs; its absence is a broken tree, ' +
        'not an empty scope.',
    );
  }
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile() && isPng(entry.name)) found.push(rel(abs));
    }
  };
  walk(root);
  return found;
}

const COMMITTED = committedShippedPngs();
const PRESENT = presentShippedPngs();
const COVERED = [...new Set([...COMMITTED, ...PRESENT])].filter((p) => !EXCLUDED.has(p)).sort();

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Decode
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

interface Swatch {
  count: number;
  /** First occurrence, so a report can name a pixel rather than only a colour. */
  x: number;
  y: number;
}

interface Census {
  path: string;
  bytes: number;
  width: number;
  height: number;
  opaque: number;
  alphaValues: Set<number>;
  /** `#rrggbb` -> occurrence, over OPAQUE pixels only. */
  swatches: Map<string, Swatch>;
  /** Percent of pixels on a §8.2 Sobel edge — see the GROUND TEXTURE section. */
  edgePct: number;
}

const hexAt = (d: Buffer, i: number): string =>
  '#' + [d[i]!, d[i + 1]!, d[i + 2]!].map((v) => v.toString(16).padStart(2, '0')).join('');

/**
 * Percent of pixels whose colour differs from the pixel to their RIGHT or BELOW.
 *
 * ── WHY THIS OPERATOR AND NOT §8.2's SOBEL, WHICH WAS TRIED FIRST ────────────────────────────────
 * `tools/overlay-diff/edges.ts` is the repo's existing edge instrument and the obvious thing to reuse
 * — header note 4's principle. It was measured against this job and it is **structurally blind to the
 * exact texture this reading exists to see.** A 3×3 Sobel cancels on a period-2 checkerboard: the
 * `x±1` samples in each row share parity, so `Gx` and `Gy` are identically zero. Measured on a 256²
 * synthetic — flat ground with one object **0.78%**, the same image with a one-pixel dithered ground
 * **0.78%**, the same number to two decimals, while this operator reads **0.39%** and **93.94%**.
 * That control ships below as `the ground-texture reading discriminates`, on the same footing as the
 * CIEDE2000 one: a reading that answered 0.78 for both would have looked like a clean bill of health.
 *
 * **That is a fact about `overlay-diff` worth carrying**, not a complaint: the §8.2 year-variant gate
 * will not see ground dither at all. Benign there — it measures LAYOUT drift and dither is not layout
 * — but it means the gate cannot be used to check that a re-dithered variant kept its texture.
 *
 * ── THE HONEST LIMIT OF THIS OPERATOR ────────────────────────────────────────────────────────────
 * It counts colour CHANGES, so it cannot tell deliberate texture from smooth gradient noise: an
 * unquantized airbrushed image reads near 100% for the same reason a checkerboard does. It is only
 * meaningful over an image with flat colour runs — and every asset it is printed for has already been
 * asserted, above, to be an exact member of a 32-colour frozen palette. The assertion is what makes
 * the reading mean anything, so do not lift this function out of this file without it.
 */
function edgePercent(data: Buffer, width: number, height: number): number {
  const total = width * height;
  if (total === 0) return Number.NaN;
  const rgbAt = (x: number, y: number): number => {
    const i = (y * width + x) * 4;
    return (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
  };
  let on = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const c = rgbAt(x, y);
      if ((x + 1 < width && rgbAt(x + 1, y) !== c) || (y + 1 < height && rgbAt(x, y + 1) !== c)) on += 1;
    }
  }
  return (100 * on) / total;
}

/**
 * Decode one shipped PNG. Throws rather than returning an empty census for every way a file can be
 * absent or unreadable, so no caller can loop over nothing and call the silence a pass.
 */
async function census(repoRelative: string): Promise<Census> {
  const abs = resolve(REPO_ROOT, repoRelative);
  if (!existsSync(abs)) {
    throw new Error(
      `${repoRelative} is committed under ${SHIPPED_ROOT}/ but is missing from the working tree. ` +
        'This gate asserts over shipped pixels: an absent covered file is a failure, never a skip. ' +
        'If the asset was retired on purpose, commit the deletion and it leaves the covered set.',
    );
  }
  const bytes = statSync(abs).size;
  if (bytes === 0) {
    throw new Error(`${repoRelative} is a zero-byte file. A truncated write is not an empty pass.`);
  }
  let data: Buffer;
  let info: { width: number; height: number };
  try {
    const out = await sharp(abs).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    data = out.data;
    info = out.info;
  } catch (e) {
    throw new Error(`${repoRelative} (${bytes} bytes) did not decode as a PNG: ${String(e)}`);
  }

  const c: Census = {
    path: repoRelative,
    bytes,
    width: info.width,
    height: info.height,
    opaque: 0,
    alphaValues: new Set(),
    swatches: new Map(),
    edgePct: edgePercent(data, info.width, info.height),
  };
  for (let i = 0; i < data.length; i += 4) {
    c.alphaValues.add(data[i + 3]!);
    if (data[i + 3]! < 128) continue;
    c.opaque += 1;
    const h = hexAt(data, i);
    const seen = c.swatches.get(h);
    if (seen) seen.count += 1;
    else {
      const cell = i / 4;
      c.swatches.set(h, { count: 1, x: cell % info.width, y: Math.floor(cell / info.width) });
    }
  }
  return c;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Measurement helpers
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

const legalHexes = (palette: readonly PaletteRgb[]): Set<string> =>
  new Set(palette.map((c) => c.hex.toLowerCase()));

interface Offender {
  hex: string;
  count: number;
  x: number;
  y: number;
  deltaE: number;
  nearest: string;
}

/**
 * Nearest palette entry by SQUARED EUCLIDEAN DISTANCE IN sRGB, ties to the lowest index — the
 * selection `tools/postprocess/steps.ts::quantize` makes, restated nowhere else. The error is then
 * *reported* in CIEDE2000, which is the same split `tools/palette/compare.mjs` and `validate.mjs`
 * use ("nearest by squared euclidean distance in sRGB — and reported in CIEDE2000"). Picking the
 * nearest by ΔE instead would produce a number that quietly disagrees with every other measurement
 * taken of this palette.
 */
function nearestIndex(palette: readonly PaletteRgb[], r: number, g: number, b: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.length; i += 1) {
    const p = palette[i]!;
    const d = (p.r - r) ** 2 + (p.g - g) ** 2 + (p.b - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

const rgbOf = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
};

function deltaEToPalette(palette: readonly PaletteRgb[], hex: string): { deltaE: number; nearest: string } {
  const [r, g, b] = rgbOf(hex);
  const k = nearestIndex(palette, r, g, b);
  const p = palette[k]!;
  return {
    deltaE: color.deltaE2000(color.rgbToLab(r, g, b), color.rgbToLab(p.r, p.g, p.b)),
    nearest: p.hex.toLowerCase(),
  };
}

function offendersIn(c: Census, palette: readonly PaletteRgb[]): Offender[] {
  const legal = legalHexes(palette);
  const out: Offender[] = [];
  for (const [hex, s] of c.swatches) {
    if (legal.has(hex)) continue;
    out.push({ hex, count: s.count, x: s.x, y: s.y, ...deltaEToPalette(palette, hex) });
  }
  return out.sort((a, b) => b.count - a.count);
}

/** Mean CIEDE2000 from every opaque pixel to the palette entry quantize would snap it to. */
function meanDeltaE(c: Census, palette: readonly PaletteRgb[]): number {
  if (c.opaque === 0) return Number.NaN;
  let sum = 0;
  for (const [hex, s] of c.swatches) sum += deltaEToPalette(palette, hex).deltaE * s.count;
  return sum / c.opaque;
}

/** At most `max` offenders spelled out, so a broken file gives a usable message and not a novel. */
function describeOffenders(list: Offender[], max = 12): string {
  const shown = list
    .slice(0, max)
    .map((o) => `${o.hex} ×${o.count} first@(${o.x},${o.y}) ΔE${o.deltaE.toFixed(1)}→${o.nearest}`);
  const more = list.length > max ? ` … and ${list.length - max} more colour(s)` : '';
  return shown.join('; ') + more;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Vacuity floors
 *
 * These are numbers a BROKEN file cannot reach, not numbers a good one should hit, so they do not
 * need re-tuning when the art moves. G11 governs gameplay constants; a floor that separates "an
 * image" from "a decode that happened to succeed" is neither, and the precedent file sets its own
 * for the same reason.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * One distinct opaque colour is the all-black-1024² failure the art session has measured coming
 * back from Comfy Cloud, and zero is an entirely transparent file. Deliberately not higher: a
 * three-colour `ui-frame` is legitimate art, and a floor that fails it would be crying wolf.
 */
const MIN_DISTINCT_ANY = 2;

/**
 * At map-native size the floor can be much stronger without any wolf risk — `balance.map.mapNativePx`
 * is 1024² by build-doc §7.6, and the ten shipped maps carry 17 to 32 distinct colours. Seven would
 * mean the generator returned something that is not a picture.
 */
const NATIVE_PX = balance.map.mapNativePx;
const MIN_DISTINCT_NATIVE = 8;

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * THE GOLD BAND — what a distinct-colour count means, and why there is no cap
 *
 * The advisory below has always printed a per-asset distinct-colour count. It was uninterpretable:
 * nobody reading "brackwater 31 colours" knows what a Gold map costs. The art session measured ten
 * real console maps at true native resolution — **eight Gen-2 Johto maps run 12 to 18 distinct
 * opaque colours, mean 16.0**, and the two Gen-3 RSE captures beside them both run **49**. Those ten
 * figures were reproduced here on 2026-08-27, file by file, before this section was written; the
 * per-file numbers are in `GOLD_CAPTURES` and `RSE_CAPTURES` and are asserted against the PNGs.
 *
 * Measured the same way on the same day, the ten shipped maps run **17 to 32, mean 27.0** — r2 uses
 * all 32 of the frozen palette, brackwater 31. Gold's discipline is severe, and it is most of why its
 * texture reads as deliberate rather than mushy.
 *
 * **This does not contradict a larger palette; it is the other half of the same design.** The palette
 * should CONTAIN enough colour for every biome the region has to paint; any single map should USE
 * about sixteen of them. A per-scene subset drawn from a wider shared set is closer to how the
 * hardware being imitated actually worked than one global list everything dips into. The trap, stated
 * as a trap so nobody reads the two facts as opposed: **48 available and 16 used is correct;
 * 48 available and 31 used is the bug.**
 *
 * ── WHY THE COUNT IS ADVISORY AND NOT ASSERTED ──────────────────────────────────────────────────
 * A cap at the top of the Gold band was considered and REJECTED, for two independent reasons.
 *
 * 1. **It is arithmetically incapable of being both binding and defensible.** Every opaque pixel is
 *    already asserted to be an exact palette colour, so a file that passes that assertion cannot
 *    hold more distinct colours than the palette has entries. Any cap at or above `palette.length`
 *    therefore CANNOT FAIL — the vacuous gate this file's header refuses to ship — and any cap below
 *    it is a judgement about how much of the palette a picture may spend, which is taste with a
 *    number painted on it. Note also which direction Gen 3 falls: RSE's own maps sit at 49, so a cap
 *    tight enough to bind would fail a shipped, defensible pixel-art style.
 * 2. **A countable cap is exactly the thing that gets optimised while the picture gets worse.** The
 *    art session made that error three times in one night in its own lane and named it: *"I optimised
 *    the countable contract and destroyed the picture."* Running ControlNet at strength 0.9 improved
 *    every number being watched — edge density, distinct colours, flat area — and produced art the
 *    owner rejected outright. A generator can be tuned to hit 18 by dithering colour away; it cannot
 *    be tuned to compose.
 *
 * So the count binds nothing and is a reading aid. **What IS asserted is the instrument**: that the
 * published band matches the captures it was derived from, and that those captures still measure what
 * they are quoted as measuring. That is the failure that actually occurred — the first reference
 * captures were browser screenshots, resampled to 642×574 from a 320×288 source, and read 673 to
 * 2,080 colours because interpolation invented them. A band quoted from those would have been wrong
 * by two orders of magnitude and nothing here would have noticed. It would now.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * THE GROUND-TEXTURE READING — the half a colour count cannot see
 *
 * **The colour count alone cannot tell a good map from the one this project has been shipping.** A
 * map at 16 colours and 9% edge density is flat and wrong; a map at 16 colours and 45% is right. Both
 * satisfy a colour-count check identically, and the flat one is the failure that has actually been
 * shipping. So the count is printed beside a second reading and neither is printed alone.
 *
 * The art session's diagnosis of the "MS Paint" verdict is a POSTPROCESS fact, not a generation one:
 * **Gold never uses a flat fill anywhere.** Grass is a dense checkerboard between two greens, paths
 * are a fine dot pattern, tree masses are a repeating dark/light weave — and their measurement is
 * that the texture is in the GROUND, not in the objects: a 32×32 tile of plain New Bark grass, seven
 * colours and not one keyline pixel, tiled to 1024², carries **43.59%** of their whole-map **47.51%**
 * on its own, against **8.83%** for our best output. **Those four figures are theirs and were taken
 * with a different operator from this file's** — do not compare them to the numbers printed below;
 * the band here is derived from the same reference PNGs re-measured with the operator above, so it is
 * internally consistent, which is the property that makes it readable.
 * `tools/artverify/ground-comparison.png` is 96 native pixels of Gold ground against ours at 6×, and
 * it is the one artefact in this finding a number cannot substitute for. Look at it.
 *
 * ── TWO FACTS, KEPT SPLIT, BECAUSE A COMBINED SENTENCE GETS HALF-IMPLEMENTED ─────────────────────
 *   **A — ordered dither buys EDGE DENSITY.** It does nothing to the colour count.
 *   **B — a per-map colour subset buys COLOUR DISCIPLINE.** It does nothing to edge density.
 * Measured by the art session, each disproving the other's sufficiency: dither at amplitude 45
 * without the subset → **40.02% in 43 colours**; the subset without dither → **16 colours at
 * 12.88%**; both together → **44.74% in 16**, against Gold's 47.51% in 17. Do one and the map is
 * still wrong in the other axis, and the number you were watching will have improved.
 *
 * ── AND IT IS ADVISORY, MORE FIRMLY THAN THE COLOUR COUNT IS ─────────────────────────────────────
 * **An edge-density figure is even more gameable than a colour count**, because the art session
 * measured the response to dither amplitude as near-linear — 0 → 12.88%, 24 → 24.09%, 40 → 40.02%,
 * 56 → 63.77% — so a generator can be tuned to ANY figure you name. They have already hit the failure
 * that implies: applied globally the dither speckles roofs and walls, so a thatched roof comes out
 * dirty rather than textured. **A map that reached 47% by ruining its buildings would pass a hard
 * assertion on this number.** That is the clearest worked example this project has of the §16
 * standing caution — two numbers both moving the right way while the artefact gets worse — so this
 * reading fails nothing, and the control below binds the INSTRUMENT instead.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** One reference capture: a real console map PNG at native size, and what it measures. */
interface ReferenceCapture {
  file: string;
  colours: number;
  /** Percent of pixels differing from the pixel right or below — `edgePercent`, not §8.2's Sobel. */
  edge: number;
}

/** Gen 2 (Gold/Silver/Crystal), native size, measured 2026-08-27. Both bands are derived from these. */
const GOLD_CAPTURES: readonly ReferenceCapture[] = [
  { file: 'assets/reference/gen2/johto-route-29-gsc.png', colours: 12, edge: 78.65 },
  { file: 'assets/reference/gen2/johto-route-42-gsc.png', colours: 13, edge: 64.51 },
  { file: 'assets/reference/gen2/azalea-town-gsc.png', colours: 15, edge: 71.32 },
  { file: 'assets/reference/gen2/new-bark-town-gsc.png', colours: 17, edge: 58.88 },
  { file: 'assets/reference/gen2/violet-city-gs.png', colours: 17, edge: 67.73 },
  { file: 'assets/reference/gen2/cherrygrove-city-gsc.png', colours: 18, edge: 57.68 },
  { file: 'assets/reference/gen2/johto-route-32-gsc.png', colours: 18, edge: 63.81 },
  { file: 'assets/reference/gen2/olivine-city-gs.png', colours: 18, edge: 51.03 },
];

/**
 * Gen 3 (Ruby/Sapphire), same method, same day. Not a style source for colour — T-17 cites RSE for
 * how top-down elevation is drawn, and 49 against Gold's 16 is a second reason not to mix the two on
 * this axis. They are here because they are the control: a counter that read every image as "about
 * fifteen" would satisfy the Gold rows and fail these.
 */
const RSE_CAPTURES: readonly ReferenceCapture[] = [
  { file: 'assets/reference/gen3/fortree-city-rs.png', colours: 49, edge: 73.25 },
  { file: 'assets/reference/gen3/lavaridge-town-rs.png', colours: 49, edge: 50.50 },
];

/**
 * The band the advisory prints and the docs publish. Held as literals so they can go STALE against
 * `GOLD_CAPTURES`, and asserted against it below — this repo has paid for a fossilised anchor more
 * than once (T-24's 21 dead hex literals, T-25's stale comments), and a band nobody re-derives is
 * the same defect in a nicer coat. G11 governs gameplay constants; a reference measurement of
 * somebody else's shipped art is neither a gameplay constant nor a threshold anything must hit.
 */
const GOLD_BAND_LOW = 12;
const GOLD_BAND_HIGH = 18;
const GOLD_BAND_MEAN = 16.0;

/**
 * The ground-texture band, same eight captures, same day, rounded OUTWARD to one decimal from the
 * measured extremes (51.03 and 78.65). Same fossil risk as the colour band and the same guard.
 */
const GOLD_EDGE_LOW = 51.0;
const GOLD_EDGE_HIGH = 78.7;
const GOLD_EDGE_MEAN = 64.2;

const bandLabel = `${GOLD_BAND_LOW}–${GOLD_BAND_HIGH}`;
const edgeBandLabel = `${GOLD_EDGE_LOW.toFixed(0)}–${GOLD_EDGE_HIGH.toFixed(0)}%`;

const outsideMark = (v: number, lo: number, hi: number): string => (v > hi ? ' ▲ ' : v < lo ? ' ▼ ' : ' = ');

/** `▲`/`▼` when a map sits outside the Gold band, blank when it is inside or is not a map. */
function bandFlag(c: Census, isMap: boolean): string {
  return isMap ? outsideMark(c.swatches.size, GOLD_BAND_LOW, GOLD_BAND_HIGH) : '   ';
}

/** The same, for the ground-texture reading. */
function edgeFlag(c: Census, isMap: boolean): string {
  return isMap ? outsideMark(c.edgePct, GOLD_EDGE_LOW, GOLD_EDGE_HIGH) : '   ';
}

/** A reference capture measured exactly the way `census` measures a shipped asset. */
async function referenceColours(
  file: string,
): Promise<{ colours: number; edge: number; width: number; height: number }> {
  const c = await census(file);
  return { colours: c.swatches.size, edge: c.edgePct, width: c.width, height: c.height };
}

/** The map assets, by what `data/nodes/*.json` declares — never by directory name or by pixel size. */
const DECLARED_MAPS = new Set(DECLARED.mapAssets.map((p) => p.replace(/^\.?\/+/, '')));

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * The gate
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Per file: the census, or the reason there isn't one. Kept apart so each file reds on its own. */
const decoded = new Map<string, Census | Error>();

beforeAll(async () => {
  for (const p of COVERED) {
    try {
      decoded.set(p, await census(p));
    } catch (e) {
      decoded.set(p, e instanceof Error ? e : new Error(String(e)));
    }
  }
}, 120_000);

const censusOf = (p: string): Census => {
  const d = decoded.get(p);
  if (d === undefined) throw new Error(`${p}: never decoded — the covered set moved under the suite`);
  if (d instanceof Error) throw d;
  return d;
};

describe('asset palette contract — every shipped PNG, decoded', () => {
  /* ──────────────────────────────────────────────────────────────────────────────────────────────
   * 0. The scope itself may not be empty, and may not be a directory listing.
   * ────────────────────────────────────────────────────────────────────────────────────────────── */

  it('covers a non-empty set of shipped PNGs', () => {
    expect(
      COVERED.length,
      `nothing under ${SHIPPED_ROOT}/ is covered. git tracks ${COMMITTED.length} PNG(s) there and ` +
        `${PRESENT.length} are on disk, minus ${EXCLUDED.size} declared collision mask(s). A gate ` +
        'over zero files is the vacuous pass this one exists to prevent.',
    ).toBeGreaterThan(0);
  });

  it('the covered set is anchored to git, so a DELETED asset cannot leave it silently', () => {
    // The load-bearing property of the scope. If git ever answers nothing, the covered set collapses
    // to whatever happens to be on disk and deletion stops being detectable — which is precisely the
    // failure mode this gate was built against, so it is asserted rather than assumed.
    expect(
      COMMITTED.length,
      `git ls-files reports no committed PNG under ${SHIPPED_ROOT}/. Either the shipped art is ` +
        'untracked, or git answered from the wrong tree; in both cases deleting a covered file ' +
        'would go unnoticed here.',
    ).toBeGreaterThan(0);
  });

  it('the shipping root is where the node data says it is', () => {
    // Keeps `SHIPPED_ROOT` from becoming a fossil: every node's `mapAsset` is a path into the
    // shipping directory, so if that directory is ever relocated this fails and names the fix.
    const stray = DECLARED.mapAssets.filter((p) => !p.startsWith(`${SHIPPED_ROOT}/`));
    expect(
      stray,
      `data/nodes/*.json declares map art outside ${SHIPPED_ROOT}/: ${stray.join(' ')}. This gate's ` +
        'scope constant is stale — point it at wherever finished art now lives.',
    ).toEqual([]);
    expect(DECLARED.mapAssets.length, 'no node declares a mapAsset').toBeGreaterThan(0);
  });

  it('the palette measured against is the FROZEN one', () => {
    const file = loadPaletteFile();
    expect(file.frozen, 'data/palette.json is not frozen; every asset below is provisional').toBe(true);
    expect(loadPalette().length, 'data/palette.json carries no colours').toBeGreaterThan(0);
  });

  it('the CIEDE2000 instrument discriminates', () => {
    // Without this, an advisory that always printed 0.000 — because the metric was broken rather
    // than because the art was clean — would read exactly like a clean bill of health.
    const palette = loadPalette();
    const first = palette[0]!;
    expect(deltaEToPalette(palette, first.hex.toLowerCase()).deltaE, 'ΔE of a palette colour to itself').toBe(0);
    const black = color.rgbToLab(0, 0, 0);
    const white = color.rgbToLab(255, 255, 255);
    expect(color.deltaE2000(black, white), 'ΔE black→white').toBeGreaterThan(10);
  });

  it('the Gold band the advisory prints is derived from the captures, not typed beside them', () => {
    // The band is quoted in the advisory, in build-doc §8.4 and in STATUS. Three copies of a number
    // whose source is a table right above it is how a figure fossilises: someone re-measures, edits
    // the table, and the published band goes on saying what it always said.
    const counts = GOLD_CAPTURES.map((r) => r.colours);
    expect(counts.length, 'no Gold reference capture is recorded; the band has no source').toBeGreaterThan(0);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    expect(Math.min(...counts), `the published band floor ${GOLD_BAND_LOW} is not the lowest recorded capture`).toBe(
      GOLD_BAND_LOW,
    );
    expect(Math.max(...counts), `the published band ceiling ${GOLD_BAND_HIGH} is not the highest recorded capture`).toBe(
      GOLD_BAND_HIGH,
    );
    expect(
      Number(mean.toFixed(1)),
      `the published band mean ${GOLD_BAND_MEAN} disagrees with the recorded captures (${counts.join('/')})`,
    ).toBe(GOLD_BAND_MEAN);

    // The ground-texture band, same table, same guard. Rounded OUTWARD from the extremes so the
    // captures the band is derived from are inside it rather than on its rim.
    const edges = GOLD_CAPTURES.map((r) => r.edge);
    const edgeMean = edges.reduce((a, b) => a + b, 0) / edges.length;
    expect(
      Math.floor(Math.min(...edges) * 10) / 10,
      `the published edge-band floor ${GOLD_EDGE_LOW} is not the lowest recorded capture, rounded down`,
    ).toBe(GOLD_EDGE_LOW);
    expect(
      Math.ceil(Math.max(...edges) * 10) / 10,
      `the published edge-band ceiling ${GOLD_EDGE_HIGH} is not the highest recorded capture, rounded up`,
    ).toBe(GOLD_EDGE_HIGH);
    expect(
      Number(edgeMean.toFixed(1)),
      `the published edge-band mean ${GOLD_EDGE_MEAN} disagrees with the recorded captures ` +
        `(${edges.map((e) => e.toFixed(2)).join('/')})`,
    ).toBe(GOLD_EDGE_MEAN);
  });

  it('the ground-texture reading discriminates — and §8.2\'s Sobel, measured, does NOT', () => {
    // The control that makes the advisory worth reading. A reading that answered the same number for
    // a flat fill and for a dithered ground would look exactly like a clean bill of health, and the
    // obvious instrument to have reused does precisely that: a 3×3 Sobel cancels on a period-2
    // checkerboard, because the x±1 samples in each row share parity. Measured here rather than
    // asserted in a comment, because the comment above this file's `edgePercent` claims it.
    const N = 128;
    const ground = [58, 90, 42];
    const speck = [86, 122, 60];
    const object = [90, 64, 48];
    const build = (dithered: boolean): Buffer => {
      const b = Buffer.alloc(N * N * 4);
      for (let y = 0; y < N; y += 1) {
        for (let x = 0; x < N; x += 1) {
          const i = (y * N + x) * 4;
          const inObject = x >= 48 && x < 80 && y >= 48 && y < 80;
          const c = inObject ? object : dithered && (x + y) % 2 === 1 ? speck : ground;
          b[i] = c[0]!;
          b[i + 1] = c[1]!;
          b[i + 2] = c[2]!;
          b[i + 3] = 255;
        }
      }
      return b;
    };
    const sobelPercent = (data: Buffer): number => {
      const raster: Raster = {
        width: N,
        height: N,
        data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
      };
      const lum = luminance(raster);
      const mag = sobelMagnitude(contrastNormalise(lum, contrastRange(lum)), N, N);
      const edges = thresholdEdges(mag, balance.overlayDiff.sobelThreshold);
      let on = 0;
      for (let i = 0; i < edges.length; i += 1) if (edges[i]) on += 1;
      return (100 * on) / edges.length;
    };

    const flat = edgePercent(build(false), N, N);
    const dithered = edgePercent(build(true), N, N);
    expect(flat, 'a flat ground with one object should read near zero').toBeLessThan(5);
    expect(dithered, 'a one-pixel dithered ground should read high').toBeGreaterThan(80);
    expect(dithered / Math.max(flat, 0.01), 'the reading barely moves between flat and dithered').toBeGreaterThan(10);

    // …and the negative half: the instrument that WOULD have been reused is blind to it. If this ever
    // stops being true the note on `edgePercent` needs rewriting, not deleting.
    const sFlat = sobelPercent(build(false));
    const sDith = sobelPercent(build(true));
    expect(
      Math.abs(sDith - sFlat),
      `§8.2's Sobel now separates flat (${sFlat.toFixed(2)}%) from dithered (${sDith.toFixed(2)}%). It ` +
        'did not when this file chose a different operator, and the reason recorded at `edgePercent` ' +
        'is now stale — re-measure before trusting either note.',
    ).toBeLessThan(1);
  });

  it('the reference captures still measure what the band quotes them as measuring', async () => {
    // THE ONE FAILURE THAT ACTUALLY HAPPENED. The first captures of these maps were browser
    // screenshots, resampled to 642×574 from a 320×288 source — not even a clean 2× — and they held
    // 673 to 2,080 distinct colours, every one of them invented by interpolation. A band derived from
    // those would have been wrong by two orders of magnitude, and the advisory would have gone on
    // printing an authoritative-looking comparison against it.
    //
    // The assertion is membership of the band rather than equality with the recorded figure, so a
    // legitimately re-cropped capture does not red while a resampled one — three orders of magnitude
    // out — cannot pass. Absent captures are REPORTED and do not fail: `assets/reference/` is a
    // reference corpus owned by the art lane, not shipped pixels, and its absence costs the band its
    // corroboration rather than putting a defect in the bundle. Every present one is asserted.
    const checked: string[] = [];
    const missing: string[] = [];

    for (const ref of GOLD_CAPTURES) {
      if (!existsSync(resolve(REPO_ROOT, ref.file))) {
        missing.push(ref.file);
        continue;
      }
      const m = await referenceColours(ref.file);
      checked.push(
        `${ref.file} ${m.width}×${m.height} ${m.colours}c (rec ${ref.colours}) ` +
          `edge ${m.edge.toFixed(2)}% (rec ${ref.edge.toFixed(2)}%)`,
      );
      expect(
        m.edge,
        `${ref.file} reads ${m.edge.toFixed(2)}% ground texture, outside the band ${edgeBandLabel} the ` +
          'eight Gold captures define. Either this capture was refetched from a different source, or ' +
          'the band needs re-deriving from the new measurements — it is not a defect in shipped art.',
      ).toBeGreaterThanOrEqual(GOLD_EDGE_LOW);
      expect(m.edge, `${ref.file}: ${m.edge.toFixed(2)}% ground texture, above ${edgeBandLabel}`).toBeLessThanOrEqual(
        GOLD_EDGE_HIGH,
      );
      expect(
        m.colours,
        `${ref.file} measures ${m.colours} distinct opaque colours at ${m.width}×${m.height}; the Gold ` +
          `band ${bandLabel} is derived from it and from seven others like it. A count in the hundreds ` +
          'or thousands means this capture is a RESAMPLED screenshot rather than a native-size frame, ' +
          'and every figure quoted from it is unsourced — refetch at native size. A count near the band ' +
          `but outside it means the band itself needs re-deriving from the new measurements.`,
      ).toBeGreaterThanOrEqual(GOLD_BAND_LOW);
      expect(m.colours, `${ref.file}: ${m.colours} colours, above the band ${bandLabel}`).toBeLessThanOrEqual(
        GOLD_BAND_HIGH,
      );
    }

    // The control. A counter that answered "about fifteen" for every image would satisfy all eight
    // rows above and tell us nothing; Gen 3 sits far outside the band on the same instrument.
    for (const ref of RSE_CAPTURES) {
      if (!existsSync(resolve(REPO_ROOT, ref.file))) {
        missing.push(ref.file);
        continue;
      }
      const m = await referenceColours(ref.file);
      checked.push(
        `${ref.file} ${m.width}×${m.height} ${m.colours}c (rec ${ref.colours}) ` +
          `edge ${m.edge.toFixed(2)}% (rec ${ref.edge.toFixed(2)}%)`,
      );
      expect(
        m.colours,
        `${ref.file} measures ${m.colours}; Gen 3 RSE was measured at ${ref.colours}, which is three ` +
          'times the Gold mean. If this one reads inside the Gold band, the counter is not ' +
          'discriminating and every figure in the advisory is suspect.',
      ).toBeGreaterThan(GOLD_BAND_HIGH);
    }

    console.log(
      `\nasset-palette-contract — reference band ${bandLabel} (mean ${GOLD_BAND_MEAN.toFixed(1)}), ` +
        `${checked.length} capture(s) verified, ${missing.length} absent\n` +
        checked.map((l) => `  ${l}`).join('\n') +
        (missing.length > 0
          ? `\n  ABSENT, so the band is uncorroborated by them: ${missing.join(' ')}\n` +
            '  (assets/reference/ is the art lane\'s reference corpus, not shipped art; absence is not a defect)'
          : '') +
        '\n',
    );
  }, 60_000);

  /* ──────────────────────────────────────────────────────────────────────────────────────────────
   * 1. Nothing may pass vacuously.
   * ────────────────────────────────────────────────────────────────────────────────────────────── */

  it.each(COVERED)('%s: is present, non-empty, and decodes', (path) => {
    // `censusOf` rethrows the missing / zero-byte / undecodable reason with the file named.
    const c = censusOf(path);
    expect(c.bytes, `${path}: zero bytes`).toBeGreaterThan(0);
    expect(c.width, `${path}: zero width`).toBeGreaterThan(0);
    expect(c.height, `${path}: zero height`).toBeGreaterThan(0);
  });

  it.each(COVERED)('%s: is a real image, not an empty or flat one', (path) => {
    const c = censusOf(path);

    // An entirely transparent decode reports 0 opaque pixels, and every palette assertion below
    // would then pass over nothing at all.
    expect(
      c.opaque,
      `${path} carries no opaque pixel at all (${c.width}×${c.height}, alpha values ` +
        `${[...c.alphaValues].sort((a, b) => a - b).join('/')}). An empty image is not a clean image.`,
    ).toBeGreaterThan(0);

    const floor = c.width >= NATIVE_PX && c.height >= NATIVE_PX ? MIN_DISTINCT_NATIVE : MIN_DISTINCT_ANY;
    expect(
      c.swatches.size,
      `${path} holds ${c.swatches.size} distinct opaque colour(s) at ${c.width}×${c.height} — ` +
        `${[...c.swatches.keys()].slice(0, 8).join(' ')}. A well-formed PNG of one flat colour is ` +
        'the all-black return the art session has measured from the cloud; it decodes fine and ' +
        'reports zero off-palette pixels.',
    ).toBeGreaterThanOrEqual(floor);
  });

  /* ──────────────────────────────────────────────────────────────────────────────────────────────
   * 2. Every opaque pixel is an EXACT frozen palette colour.
   * ────────────────────────────────────────────────────────────────────────────────────────────── */

  it.each(COVERED)('%s: every opaque pixel is an exact data/palette.json colour', (path) => {
    const palette = loadPalette(); // read from disk at test time — never a list copied into here
    const c = censusOf(path);
    const offenders = offendersIn(c, palette);
    const offPixels = offenders.reduce((n, o) => n + o.count, 0);
    expect(
      offPixels,
      `${path} holds ${offPixels} px in ${offenders.length} colour(s) the frozen palette does not ` +
        `contain: ${describeOffenders(offenders)}. Each ΔE is that colour's CIEDE2000 distance to ` +
        'the entry quantize would have snapped it to — a small one says the file drifted after ' +
        'quantize (a re-encode, a composite, an interpolating resize), a large one says something ' +
        'wrote a colour from outside the frozen set entirely. Re-run the postprocess pipeline for ' +
        'this asset rather than editing the palette.',
    ).toBe(0);
  });

  /* ──────────────────────────────────────────────────────────────────────────────────────────────
   * 3. ADVISORY. Never fails on drift — it only reports it, early.
   * ────────────────────────────────────────────────────────────────────────────────────────────── */

  it('ADVISORY: mean CIEDE2000 to the frozen palette, per shipped asset', () => {
    const palette = loadPalette();
    const lines: string[] = [];
    for (const path of COVERED) {
      const d = decoded.get(path);
      if (d instanceof Error || d === undefined) {
        lines.push(`  ${path.padEnd(44)} —  (no census: ${d instanceof Error ? d.message.slice(0, 80) : 'absent'})`);
        continue;
      }
      const offenders = offendersIn(d, palette);
      const offPixels = offenders.reduce((n, o) => n + o.count, 0);
      const mean = meanDeltaE(d, palette);
      const isMap = DECLARED_MAPS.has(path);
      lines.push(
        `  ${path.padEnd(44)} ${`${d.width}×${d.height}`.padStart(9)} ` +
          `${String(d.swatches.size).padStart(3)}c${bandFlag(d, isMap)}` +
          `texture ${d.edgePct.toFixed(1).padStart(5)}%${edgeFlag(d, isMap)}` +
          `meanΔE ${mean.toFixed(3)}  off ${offPixels}px/${offenders.length}c` +
          (offenders.length > 0 ? `  worst ${describeOffenders(offenders, 3)}` : ''),
      );
      // Guards the INSTRUMENT, not the art: over a file that HAS opaque pixels, a NaN or negative
      // mean means every reading in this table is meaningless. Drift itself is reported and never
      // fails here, and a file with no opaque pixels is skipped rather than asserted on — the
      // "is a real image" check above already reds on it, and an advisory that piles a second
      // failure onto an already-failing file is an advisory that can fail on its own.
      if (d.opaque > 0) {
        expect(Number.isFinite(mean), `${path}: mean ΔE is not a finite number`).toBe(true);
        expect(mean, `${path}: mean ΔE is negative`).toBeGreaterThanOrEqual(0);
      }
    }
    const maps = COVERED.filter((p) => DECLARED_MAPS.has(p))
      .map((p) => decoded.get(p))
      .filter((d): d is Census => d !== undefined && !(d instanceof Error));
    const spreadOf = (vs: number[], dp: number): string =>
      vs.length === 0
        ? 'no map decoded'
        : `${Math.min(...vs).toFixed(dp)}–${Math.max(...vs).toFixed(dp)}, mean ` +
          (vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(dp);
    console.log(
      `\nasset-palette-contract — ADVISORY drift, ${COVERED.length} shipped PNG(s) vs the frozen ` +
        `${palette.length}-colour palette\n${lines.join('\n')}\n` +
        `  ▼ below / = inside / ▲ above the measured Gold bands, over ${GOLD_CAPTURES.length} ` +
        `native-size Gen-2 maps: ${bandLabel} colours (mean ${GOLD_BAND_MEAN.toFixed(1)}), ` +
        `${edgeBandLabel} ground texture (mean ${GOLD_EDGE_MEAN.toFixed(1)}%).\n` +
        `  ${maps.length} shipped map(s) run ${spreadOf(maps.map((d) => d.swatches.size), 0)} colours ` +
        `and ${spreadOf(maps.map((d) => d.edgePct), 1)}% texture.\n` +
        '  BOTH ARE READING AIDS AND FAIL NOTHING, and they are two facts, not one: dither buys\n' +
        '  texture and does nothing to the colour count; a per-map subset buys colour discipline and\n' +
        '  does nothing to texture. A cap on either is a number a generator can be tuned to hit while\n' +
        '  the picture gets worse — see the GOLD BAND and GROUND-TEXTURE sections at the top of this\n' +
        '  file, and `tools/artverify/ground-comparison.png`, which a number cannot substitute for.\n' +
        '  The palette CONTAINS the region; one map USES a subset of it.\n',
    );
  });

  it('ADVISORY: how much of the declared art programme has landed', () => {
    // The census the parent brief asked for, over everything that is NOT bound: 288 manifest rows
    // name a `finalFile`, and this says how many exist. It fails on nothing — an unbuilt asset is
    // the normal state of a row, not a defect.
    const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, 'tools/comfy/manifest.json'), 'utf8')) as {
      rows: Array<{ id: string; class: string; status: string; finalFile: string }>;
    };
    const byClass = new Map<string, { declared: number; built: number; statuses: Set<string> }>();
    for (const row of manifest.rows) {
      const slot = byClass.get(row.class) ?? { declared: 0, built: 0, statuses: new Set<string>() };
      slot.declared += 1;
      slot.statuses.add(row.status);
      if (existsSync(resolve(REPO_ROOT, row.finalFile))) slot.built += 1;
      byClass.set(row.class, slot);
    }
    const built = [...byClass.values()].reduce((n, s) => n + s.built, 0);
    const lines = [...byClass.entries()]
      .sort()
      .map(
        ([cls, s]) =>
          `  ${cls.padEnd(18)} ${String(s.built).padStart(3)}/${String(s.declared).padEnd(4)} built   ` +
          `statuses: ${[...s.statuses].sort().join(',')}`,
      );
    console.log(
      `\nasset-palette-contract — ADVISORY coverage: ${built}/${manifest.rows.length} declared ` +
        `finalFile(s) exist on disk\n${lines.join('\n')}\n` +
        '  (unbuilt is the normal state of a row; nothing here fails)\n',
    );
    expect(manifest.rows.length, 'tools/comfy/manifest.json declares no rows').toBeGreaterThan(0);
  });
});
