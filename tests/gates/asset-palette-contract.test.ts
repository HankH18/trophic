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
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import sharp from 'sharp';

import { loadPalette, loadPaletteFile, REPO_ROOT, type PaletteRgb } from '../../tools/postprocess/palette.ts';
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
}

const hexAt = (d: Buffer, i: number): string =>
  '#' + [d[i]!, d[i + 1]!, d[i + 2]!].map((v) => v.toString(16).padStart(2, '0')).join('');

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
      lines.push(
        `  ${path.padEnd(44)} ${`${d.width}×${d.height}`.padStart(9)} ` +
          `${String(d.swatches.size).padStart(3)} colours  meanΔE ${mean.toFixed(3)}  ` +
          `off ${offPixels}px/${offenders.length}c` +
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
    console.log(
      `\nasset-palette-contract — ADVISORY drift, ${COVERED.length} shipped PNG(s) vs the frozen ` +
        `${palette.length}-colour palette\n${lines.join('\n')}\n`,
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
