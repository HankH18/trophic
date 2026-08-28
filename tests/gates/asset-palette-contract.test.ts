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
 * 6. **A second reading sits beside it — WHOLE-IMAGE EDGE DENSITY — because the colour count alone
 *    cannot tell a good map from the one this project has been shipping.** Two maps can hold the
 *    same sixteen colours and be, respectively, flat and wrong or textured and right. Both satisfy
 *    a colour-count check identically, and the flat one is the failure that has actually been
 *    shipping. (This claim used to be stated as "16 colours at ~~9%~~ against 16 colours at
 *    ~~45%~~" — ⚠ those are the withdrawn ~~8.83%~~ and ~~44.74%~~ rounded to a digit, and they are
 *    struck for the reason the WITHDRAWN-OPERATOR RULE below gives. The claim never needed them.)
 *    Note 4's principle — reuse the repo's instrument — was applied here and it **failed the
 *    measurement**:
 *    §8.2's Sobel is structurally blind to a one-pixel dither, so `edgePercent` defines its own
 *    operator and the control below proves both halves of that. Reuse an existing instrument, but
 *    measure that it can see the thing before you trust it.
 *
 * 7. **A third reading sits beside those two — THE GROUND READING — and it is THREE numbers, not
 *    one, because every single-number version of it has a degenerate case that scores top marks.**
 *    A patch reads as structured only if it holds a small palette, HELD DENSELY, and INTERLEAVED
 *    rather than pooled. Drop any one of the three and something worthless passes: drop density and
 *    a LoRA's 2,451 near-identical colours pass; drop plurality and a blank rectangle passes; drop
 *    interleaving and a flat field with three regions in it passes. The GROUND READING section
 *    below has the measurements for all three, the sampling rule, and its weaknesses.
 *
 * 8. **Every number this file emits prints the definition of the operator that produced it.** Two
 *    figures for one property have been produced twice in this project's history, and both times
 *    the cause was the same: a measurement quoted without its instrument attached. One of them —
 *    Gold's whole-map edge density — is struck through in the WHOLE-IMAGE EDGE READING section
 *    below rather than deleted, with the reason, because the trail is worth more than the tidiness.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * THE WITHDRAWN-OPERATOR RULE — read this before quoting, comparing to, or deriving from any edge
 * figure that appears anywhere in this file
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * **THE WITHDRAWAL IS ON THE INSTRUMENT, NOT ON A LIST OF NUMBERS.** Every figure produced by the
 * unpublished luminance neighbour-difference operator at threshold 25 is withdrawn — wherever it
 * appears, in this file, in a doc, in a commit message, or in a number nobody has written down yet.
 * That operator was never published, and a second lane could not reproduce its headline figure at
 * any threshold.
 *
 * So the question to ask of a figure is **"was it made with that instrument?"** — never "is it on
 * the list?". A list invites the second question, and the second question is exactly how a withdrawn
 * figure survives a withdrawal: it was not enumerated, so it gets read as sound. This file has
 * already made that mistake once, in writing, about `6.89%`. The figures that HAVE been written down
 * — 47.51 · 43.59 · 8.83 · 44.74 · the amplitude ladder 12.88 / 24.09 / 40.02 / 63.77 · 6.89 ·
 * 54.84 · 60.10 — are worked examples of the rule, not the extent of it. Rounded restatements of
 * them (a "45%", a "9%") are the same figures wearing fewer digits and go the same way.
 *
 * **What the withdrawal does NOT reach**, because these come from other instruments that reproduce:
 *   • the COLOUR counts standing beside the struck figures — 16, 17 and 43 colours. Counting
 *     distinct colours reproduces exactly, and this file re-derives the Gold half of it from the
 *     reference PNGs on every run (`GOLD_BAND_LOW/HIGH/MEAN`, 12–18, mean 16.0).
 *   • `28.2` luminance points between Gold's two grass greens. That is a colour difference computed
 *     from reference pixels, not an edge-density percentage, and it reproduces.
 *   • `GOLD_EDGE_LOW/HIGH/MEAN` below, and every figure this file prints. They come from THIS file's
 *     own `edgePercent` over PNGs in the tree and are re-asserted against them every run — a
 *     different operator entirely, live rather than quoted. **Do not touch them.**
 *
 * **Struck, never deleted.** A withdrawn figure stays on the page in `~~strikethrough~~` with a ⚠
 * beside it, because the trail is worth more than the tidiness — and because a number that has been
 * deleted cannot be recognised when it walks back in. **Every argument these figures were making
 * survives the loss of them.** Each site below says which argument that is and what may be cited in
 * its place; the replacement is nearly always this file's own 44.34%-whole-image-against-0.00%-ground
 * synthetic, which carries its operator with it.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
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
import published from '../../tools/artverify/published-measurements.json';

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
  /** WHOLE-IMAGE edge density. Objects supply most of it — see `edgePercent`. Not a ground figure. */
  edgePct: number;
  /** Median patch's effective colour count — see THE GROUND READING section. */
  conc: number;
  /** Median patch's alternation. The axis `conc` is blind to; neither is printed alone. */
  altPct: number;
  /** Median patch's top-three share, printed BESIDE those two and never instead of them. */
  concTopThreePct: number;
  /** How many patches the medians were taken over, so a one-patch reading is visible as one. */
  concPatches: number;
}

const hexAt = (d: Buffer, i: number): string =>
  '#' + [d[i]!, d[i + 1]!, d[i + 2]!].map((v) => v.toString(16).padStart(2, '0')).join('');

/**
 * Percent of pixels whose colour differs from the pixel to their RIGHT or BELOW, **over EVERY PIXEL
 * OF THE IMAGE**.
 *
 * ── THE REGION IS PART OF THE DEFINITION, AND THIS ONE IS *NOT* A GROUND MEASUREMENT ─────────────
 * **A whole-map number is not a ground measurement, and objects supply most of it.** Buildings,
 * trees and props are keyline-dense by construction, so they carry an edge figure upward while the
 * ground underneath stays flat — and the ground is the thing every finding in this file is actually
 * about. The art session isolated this on their own numbers: a dither that read ~~44.74%~~ across a
 * whole map read ~~6.89%~~ on the ground alone. Same image, same operator, **more than six-fold
 * apart**, and the gap is furniture.
 *
 * ⚠ **BOTH OF THOSE FIGURES ARE WITHDRAWN — the whole-map one AND the ground one.** They are the
 * same unpublished luminance neighbour-difference operator at threshold 25, pointed at two regions of
 * one image; `tools/artverify/EVAL-STANDARD.md` withdraws the operator, and the withdrawal therefore
 * follows every figure it produced rather than an enumerated set. See THE WITHDRAWN-OPERATOR RULE in
 * this file's header. An earlier revision of this very comment recorded 6.89% as "NOT named in that
 * withdrawal, and OPEN". That was wrong twice: it was made with the withdrawn instrument, and asking
 * whether a figure is *named* is precisely the question the rule exists to replace.
 *
 * **THE ARGUMENT IS UNTOUCHED, AND IT IS THE PART THAT MATTERS: a whole-map aggregate cannot stand
 * in for a ground measurement, because objects are keyline-dense by construction and carry the figure
 * upward while the ground underneath stays flat.** That is still sound; what it has lost is the right
 * to be quoted as a measurement. This file reproduces the same point independently, on its own
 * synthetic, with the operator attached — **44.34% whole-image against 0.00% on the ground**, in
 * `THE GROUND READING discriminates` below. Cite THAT pair wherever the withdrawn one used to be
 * cited. It is the one that carries its instrument with it.
 *
 * Measured here on a synthetic built for it — flat ground, seven of sixteen 64² cells filled with
 * dense keyline object — `edgePercent` reads **44.34%** while the ground-patch reading reads
 * **0.00%**. That case ships below in `THE GROUND READING discriminates` precisely so that the two
 * cannot quietly be treated as the same property again.
 *
 * **This is a DIFFERENT ERROR from the operator error recorded in the GROUND-TEXTURE section, and it
 * compounds with it.** Two figures called "edge density" taken with different operators cost this
 * project two evenings; two figures called "texture" measured over different REGIONS is the same
 * trap wearing different clothes. So: every number this file prints carries BOTH its operator and
 * its region, and **an `edgePct` figure may never be compared with a ground-patch figure** — not
 * against `altPct` below, not against anything the art session measures on ground alone.
 *
 * ── WHY IT STAYS ANYWAY, RATHER THAN BEING DELETED IN FAVOUR OF THE GROUND READING ───────────────
 * Judged rather than assumed. It stays, for three reasons that are about what it CAN see:
 *   1. **It is the only reading here that sees composition at all.** The ground reading takes a
 *      MEDIAN over patches, which is designed to find the typical material and therefore designed to
 *      ignore the buildings. A map that lost every object would read identically on `conc`/`altPct`
 *      and drop sharply here. That is worth knowing, and nothing else in this file would notice.
 *   2. **`GOLD_EDGE_LOW/HIGH/MEAN` are derived from it** over the same eight captures and re-asserted
 *      against them every run. It is a live, corroborated instrument, not a legacy figure.
 *   3. **Its negative control is load-bearing** — `the ground-texture reading discriminates` is what
 *      records, in measurement rather than in prose, that §8.2's Sobel cannot see a one-pixel dither.
 * What it does NOT get to keep is an ambiguous name: the advisory column is `img-edge`, never
 * `texture`, and the legend states its region on every line it appears in.
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

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * THE GROUND READING — three numbers over one patch, because every one-number version has a
 * degenerate case that scores top marks
 *
 * ── WHAT SETTLED THE FIRST HALF ──────────────────────────────────────────────────────────────────
 * A 64×64 patch of open ground, the share held by the top three EXACT-RGB colours, and how many
 * distinct colours the patch spends:
 *
 *     Gold new-bark              78.9%     ~~8~~ colours ⚠
 *     our postprocess dither     78.3%       12
 *     C64 LoRA output             6.3%     2451
 *     plain generation, no LoRA   4.9%     2385
 *
 * **That is the difference between a look and a structure.** The LoRA's ground is ~2,451 colours
 * differing by about one per channel — continuous noise that reads as stipple to the eye and to any
 * operator that counts neighbour differences. Gold spends a handful of colours, three of them
 * covering 79%.
 *
 * ⚠ **GOLD'S OPEN GROUND IS 3–4 COLOURS, NOT 6–9, AND THE `8` IN THAT ROW SITS INSIDE THE WITHDRAWN
 * RANGE.** The 6–9 figure came from five inherited patch coordinates that turned out to be
 * four-fifths trees, ledges and fences: a contaminated sample, measuring furniture and reporting it
 * as ground — the same region fault `edgePercent`'s note records in the other axis, arrived at from
 * the other direction. Struck rather than deleted, per the header rule. **The top-three SHARE half of
 * that row (78.9%) is a different reading and is unaffected**; it is the one hand-picked figure the
 * sampling rule below exists to replace with a median. And the correction is corroborated inside this
 * file rather than taken on trust: `GOLD_CONC_LOW/HIGH` are re-derived from the eight Gen-2 captures
 * on every run and read **2.62–3.80 effective colours per median 64² patch**. That is a different
 * reading from a distinct count — effective, not distinct — but it points the same way: Gold's ground
 * spends three to four colours' worth of variation, not eight or nine.
 *
 * **AND THE PALETTE HAS NEVER BEEN THE CONSTRAINT.** The lane that owns `tools/artverify/`
 * EVAL-STANDARD.md measured both projections: **Gold's ground projects onto our frozen 32-colour
 * palette LOSSLESSLY** — every colour it spends already has an exact home — **while our own raw
 * ground projects onto ONE swatch.** So the dither is not under-amplifying variation against a
 * palette too small to hold it; it is starting from something the palette sees as a single flat
 * colour, and no amount of amplitude turns one swatch into a weave. Widening the palette buys
 * nothing here, and that pair of projections is the answer to every proposal that it would.
 *
 * Neither edge operator can see it. `edgePercent` above counts colour CHANGES, and its own note
 * already concedes the limit: an unquantized airbrushed image reads near 100% for the same reason a
 * checkerboard does — so on raw generator output, which is precisely the case that matters here, it
 * SATURATES and cannot rank. A luminance-threshold operator fails differently: it is at the mercy of
 * the threshold. Gold's two grass greens differ by 28.2 luminance points and a slightly softer
 * dither by 3.2, so a fixed threshold of 25 calls the first texture and the second nothing.
 * Concentration is immune to both — no threshold, no gradient — and separates the cases by more than
 * an order of magnitude. Measured on this repo's own gitignored generator output with the rule
 * below: `assets/raw/map-town/map-hearthollow.png` reads **2059.85** effective colours and
 * `map-brackwater.png` **258.87**, against a Gold band of 2.6–3.8.
 *
 * ── FIRST TRAP: CONCENTRATION ALONE REWARDS FLATNESS ─────────────────────────────────────────────
 * **A single-colour field has a top-three share of 100% — better than Gold's 78.9%.** A reading that
 * reported the share and nothing else would say a blank green rectangle is the best map in the
 * project. So the share is NOT the reading. The reading is the share expressed as a COUNT: the
 * **effective number of colours**, `1 / Σ pᵢ²` over the patch's exact-RGB shares — the reciprocal of
 * the Herfindahl concentration index, which is what "concentration" means when it is measured rather
 * than eyeballed. It is 1.0 for one colour and N for N colours used evenly, and in between it is the
 * number of colours the patch *effectively* spends. Both degenerate cases fall off opposite ends:
 *
 *     a flat fill        → 1.00      (the mathematical floor, BELOW the band)
 *     Gold-like ground   → 2.6–3.8   (the band, derived below)
 *     continuous noise   → hundreds  (far ABOVE the band)
 *
 * ── SECOND TRAP, AND THE REASON THERE IS A THIRD NUMBER: A HISTOGRAM IS BLIND TO ARRANGEMENT ─────
 * **Three colours in LARGE FLAT PATCHES score identically to three colours INTERLEAVED PER PIXEL.**
 * One of those is Gold's dithered grass; the other is a flat field with three regions in it. This is
 * not an argument — it is measured below, over two synthetics built from the SAME index function so
 * their histograms are the same to three decimal places:
 *
 *     pooled (8px blocks)      concentration 2.9985   distinct 3   top-three 100.00%   alternation  11.11%
 *     interleaved (per pixel)  concentration 3.0000   distinct 3   top-three 100.00%   alternation 100.00%
 *
 * Concentration cannot tell them apart because concentration is a histogram, and a histogram does
 * not know where the pixels are. So a third axis, and the one Gold's ground actually differs on:
 *
 *     **ALTERNATION — the percent of adjacent opaque pixel pairs (each pixel against its right and
 *     its below neighbour) whose exact RGB values differ.**
 *
 * A patch reads as structured only when all three hold: **a small palette, held densely, and
 * interleaved rather than pooled.** Drop any one and something worthless passes.
 *
 * This operator was validated before it was trusted, which is the rule that has caught four bad
 * instruments in this file's history. Independently of the art session's own measurement, the median
 * 64² patch over the eight Gen-2 captures reads **48.73%** here, against the **48.7%** they report
 * for Gold new-bark ground and **53.2%** for a source that dithers well. Two operators, two
 * sessions, one number — which is what the withdrawn edge figure in the section above did NOT do.
 *
 * ── WHAT ALTERNATION IS *NOT* ────────────────────────────────────────────────────────────────────
 * It is a close relative of `edgePercent` and shares that operator's blind spot: it counts colour
 * changes, so continuous noise reads near 100% on it (map-hearthollow's raw output: **98.87%**).
 * **Alternation on its own is therefore as gameable as edge density and means nothing alone** — it
 * is the axis concentration is blind to, and concentration is the axis it is blind to. That is why
 * they are printed as a pair and why neither is printed without the other. It differs from
 * `edgePercent` in scope rather than in kind: `edgePercent` is a whole-image pixel aggregate and is
 * what the GOLD_EDGE band is derived from, while alternation is the median of the SAME 64² patches
 * concentration is measured over, so the three numbers describe one patch and can be reasoned about
 * together. A useful cross-read: `1 − 1/concentration` is the alternation the same histogram would
 * give if its pixels were scattered at random — 70.6% for Gold's 3.4 effective colours, against the
 * 48.7% Gold actually reads, so Gold's grass is a REGULAR weave, not a random one.
 *
 * ── THE SAMPLING RULE, AND ITS WEAKNESSES ────────────────────────────────────────────────────────
 * The 78.9% figure came from a HAND-PICKED patch of open ground. A gate cannot hand-pick, and the
 * choice is not neutral: taking the most concentrated patch rewards flat areas, and taking one fixed
 * location may land on a building. So, for all three numbers alike:
 *
 *   **Tile the image into non-overlapping 64×64 patches anchored at (0,0), measure each over its
 *   opaque pixels, and report the MEDIAN of each reading across patches.**
 *
 * The median is the point of it: the extremes at both ends are exactly the patches a hand-picker
 * would be accused of choosing, and half the image has to move before a figure does.
 *
 * **Weakness, stated rather than papered over: the median patch is the map's most typical material,
 * so this reports the texture of whatever the map is mostly made of and says nothing about
 * composition.** On a map that is two-thirds open water it reports the water. That is the right
 * failure to have — Gold's discipline lives in the ground, and the ground is what a median finds —
 * but a map holding a beautifully dithered town in the corner of a flat field reads flat, and a map
 * of nothing but ground reads exactly as well as a map with a town on it. Second weakness, in the
 * other direction: two large flat regions inside one patch look to CONCENTRATION like two colours
 * used densely. Alternation is what catches that one, which is the whole reason it exists; the
 * median is what keeps boundary patches from dominating either figure.
 *
 * Three more limits worth naming. The right and bottom remainder shorter than a full patch is NOT
 * sampled, so a strip up to 63px is unmeasured; over dozens of patches that does not move a median,
 * and clipping partial patches instead would bias them low by measuring fewer pixels. Alternation is
 * measured only over pairs where BOTH pixels are opaque, so a sprite's silhouette edge is not
 * counted as texture. And 64px is 4×4 Gold tiles but only 2×2 of ours (`balance.map.tileStepPx` is
 * 32 against Gen 2's 16), so our maps are read through a window covering a quarter as much content —
 * fewer materials per patch, which pushes OUR numbers toward the flat end, not toward the band. The
 * figure is fixed in pixels because that is what the settling measurement used, and a per-image tile
 * size is not knowable for a reference capture without asserting one.
 *
 * **A whole-image aggregate is not this measurement**, and the numbers below are not the hand-picked
 * ones: under this rule the eight Gen-2 captures read 2.62–3.80 effective colours and 28.72–64.24%
 * alternation, and both bands are re-derived from them here exactly as the colour and texture bands
 * are.
 *
 * ── AND BOTH ARE ADVISORY, FOR THE REASON THE OTHER TWO READINGS ARE ─────────────────────────────
 * Any target figure can be hit by turning a knob while the picture gets worse, and the art session
 * has already made that error three times in one night in its own lane. What is asserted is the
 * INSTRUMENT — that it separates the four cases below, that neither a flat fill nor a pooled field
 * can reach the band, and that a broken reading cannot look like a pass. `1 / Σ pᵢ²` is ≥ 1 for any
 * non-empty patch, so a concentration below 1 is not a flatter picture; it is a broken instrument,
 * and the advisory asserts that floor per file.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The patch the settling measurement used. Not a gameplay constant, so G11 does not reach it — same
 * standing as `MIN_DISTINCT_NATIVE` and the Gold bands, argued at the vacuity floors below.
 */
const GROUND_PATCH_PX = 64;

/**
 * The alpha at or above which a pixel is OPAQUE, and therefore counted. Every figure this file
 * publishes — `colours`, `edge`, `conc`, `alt` — is taken over exactly this population, so the
 * threshold is part of each operator's definition and not an implementation detail.
 *
 * ⚠ **IT LIVES HERE BECAUSE IT USED TO LIVE IN THREE PLACES AND ONLY THE THIRD WAS CHECKED.** The
 * value was a bare `128` inside `patchProfile` and a second bare `128` inside `census`, with a
 * third hand-typed copy in `tools/artverify/published-measurements.json` — and the assertion that
 * called itself a live-constant check compared the JSON literal with a literal typed beside it.
 * Measured: changing BOTH operators to 200 left this file GREEN, while the same mutation applied to
 * `GROUND_PATCH_PX` — the one parameter compared against the actual named constant — went red. A
 * "the record still matches the code" assertion is only that if the code has ONE place to read.
 */
const OPAQUE_ALPHA_MIN = 128;

interface PatchProfile {
  /** `1 / Σ pᵢ²` over exact-RGB shares: the effective number of colours the patch spends. */
  effective: number;
  /** Percent of adjacent opaque pairs (right and below) whose exact RGB values differ. */
  alternationPct: number;
  /** Percent held by the three most common colours. A reading aid; see the first trap above. */
  topThreePct: number;
}

/** One patch's ground profile over OPAQUE pixels, or `null` when the patch has none. */
function patchProfile(
  data: Buffer,
  width: number,
  height: number,
  x0: number,
  y0: number,
  size: number,
): PatchProfile | null {
  const xEnd = Math.min(x0 + size, width);
  const yEnd = Math.min(y0 + size, height);
  const opaqueAt = (x: number, y: number): boolean => data[(y * width + x) * 4 + 3]! >= OPAQUE_ALPHA_MIN;
  const rgbAt = (x: number, y: number): number => {
    const i = (y * width + x) * 4;
    return (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
  };

  const counts = new Map<number, number>();
  let opaque = 0;
  let pairs = 0;
  let differing = 0;
  for (let y = y0; y < yEnd; y += 1) {
    for (let x = x0; x < xEnd; x += 1) {
      if (!opaqueAt(x, y)) continue;
      opaque += 1;
      const c = rgbAt(x, y);
      counts.set(c, (counts.get(c) ?? 0) + 1);
      // Pairs stay INSIDE the patch, so a patch's alternation is a property of the patch and the
      // grid cannot leak one patch's material into its neighbour's reading.
      if (x + 1 < xEnd && opaqueAt(x + 1, y)) {
        pairs += 1;
        if (rgbAt(x + 1, y) !== c) differing += 1;
      }
      if (y + 1 < yEnd && opaqueAt(x, y + 1)) {
        pairs += 1;
        if (rgbAt(x, y + 1) !== c) differing += 1;
      }
    }
  }
  if (opaque === 0) return null;

  let sumSquares = 0;
  for (const n of counts.values()) {
    const p = n / opaque;
    sumSquares += p * p;
  }
  const ranked = [...counts.values()].sort((a, b) => b - a);
  const topThree = (ranked[0] ?? 0) + (ranked[1] ?? 0) + (ranked[2] ?? 0);
  return {
    effective: 1 / sumSquares,
    // A one-pixel opaque island has no pair to compare; 0% is the honest reading, not a divide.
    alternationPct: pairs === 0 ? 0 : (100 * differing) / pairs,
    topThreePct: (100 * topThree) / opaque,
  };
}

const median = (vs: readonly number[]): number => {
  if (vs.length === 0) return Number.NaN;
  const s = [...vs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

interface GroundReading {
  /** Median patch concentration — `1 / Σ pᵢ²`, effective colours. */
  effective: number;
  /** Median patch alternation — percent of adjacent opaque pairs that differ. */
  alternationPct: number;
  /** Median patch top-three share. Printed beside the other two, never instead of them. */
  topThreePct: number;
  /** How many patches the medians were taken over, so a one-patch reading is visible as one. */
  patches: number;
}

/**
 * The median 64×64 patch's ground reading. An image too small for one whole patch is measured as a
 * single patch covering all of it — a 32×48 sprite is legitimate art and must not read as "no
 * measurement", which is the shape a vacuous pass takes.
 */
function groundReading(data: Buffer, width: number, height: number): GroundReading {
  const profiles: PatchProfile[] = [];
  if (width < GROUND_PATCH_PX || height < GROUND_PATCH_PX) {
    const p = patchProfile(data, width, height, 0, 0, Math.max(width, height));
    if (p) profiles.push(p);
  } else {
    for (let y = 0; y + GROUND_PATCH_PX <= height; y += GROUND_PATCH_PX) {
      for (let x = 0; x + GROUND_PATCH_PX <= width; x += GROUND_PATCH_PX) {
        const p = patchProfile(data, width, height, x, y, GROUND_PATCH_PX);
        if (p) profiles.push(p);
      }
    }
  }
  return {
    effective: median(profiles.map((p) => p.effective)),
    alternationPct: median(profiles.map((p) => p.alternationPct)),
    topThreePct: median(profiles.map((p) => p.topThreePct)),
    patches: profiles.length,
  };
}

/**
 * The definitions that travel with every number this file prints — see header note 8. **REGION is
 * part of the definition, not a footnote**: a whole-image figure and a ground-patch figure are
 * different measurements even when the operator is identical, and the six-fold gap recorded on
 * `edgePercent` is what that costs when it goes unstated. Nothing in the WHOLE-IMAGE group may be
 * compared with anything in the GROUND-PATCH group.
 */
const OPERATOR_LEGEND = [
  '  region + operator, because a figure is not quotable without both:',
  '    WHOLE-IMAGE — every pixel, so objects (keyline-dense) supply most of it:',
  '      colours   = distinct exact-RGB colours over ALL opaque pixels',
  '      img-edge  = percent of pixels differing from the pixel to their right or below',
  `    GROUND-PATCH — MEDIAN over non-overlapping ${GROUND_PATCH_PX}² patches, so it reports the`,
  '                   TYPICAL material and largely ignores the objects:',
  '      conc      = 1/Σpᵢ² per patch (effective colours; 1.00 = flat, hundreds = continuous noise)',
  '      alt       = percent of adjacent opaque pairs in the patch whose colours differ',
  '      top3      = share held by the three commonest colours in the patch',
  '    img-edge and alt both count colour changes and are NOT comparable: on one synthetic —',
  '    flat ground, dense objects — they read 44.34% and 0.00%.',
].join('\n');

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

  const ground = groundReading(data, info.width, info.height);
  const c: Census = {
    path: repoRelative,
    bytes,
    width: info.width,
    height: info.height,
    opaque: 0,
    alphaValues: new Set(),
    swatches: new Map(),
    edgePct: edgePercent(data, info.width, info.height),
    conc: ground.effective,
    altPct: ground.alternationPct,
    concTopThreePct: ground.topThreePct,
    concPatches: ground.patches,
  };
  for (let i = 0; i < data.length; i += 4) {
    c.alphaValues.add(data[i + 3]!);
    if (data[i + 3]! < OPAQUE_ALPHA_MIN) continue;
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
 * THE WHOLE-IMAGE EDGE READING — the half a colour count cannot see
 *
 * ⚠ **IT WAS CALLED "GROUND TEXTURE" AND THAT NAME WAS WRONG ABOUT ITS REGION.** `edgePercent`
 * walks every pixel of the image, and objects — keyline-dense by construction — supply most of what
 * it reports. The full finding, the six-fold measured gap, and the judgement to keep the reading
 * under an unambiguous name are on `edgePercent` itself. Nothing below is a ground figure.
 *
 * **The colour count alone cannot tell a good map from the one this project has been shipping.** Two
 * maps can hold the same sixteen colours and be, respectively, flat and wrong or textured and right;
 * both satisfy a colour-count check identically, and the flat one is the failure that has actually
 * been shipping. So the count is printed beside a second reading and neither is printed alone.
 * (⚠ This was written as "16 colours at ~~9%~~ against 16 colours at ~~45%~~". Those are the
 * withdrawn ~~8.83%~~ and ~~44.74%~~ rounded to a digit — a rounded restatement of a withdrawn
 * figure is the same figure — and the claim stands without either.)
 *
 * The art session's diagnosis of the "MS Paint" verdict is a POSTPROCESS fact, not a generation one:
 * **Gold never uses a flat fill anywhere.** Grass is a dense checkerboard between two greens, paths
 * are a fine dot pattern, tree masses are a repeating dark/light weave — and their measurement is
 * that the texture is in the GROUND, not in the objects: a 32×32 tile of plain New Bark grass, seven
 * colours and not one keyline pixel, tiled to 1024², carries ~~43.59%~~ of their whole-map ~~47.51%~~
 * on its own, against ~~8.83%~~ for our best output.
 *
 * ⚠ **THOSE FIGURES ARE WITHDRAWN AS UNSOURCED — struck rather than deleted, so the trail survives.**
 * Their author cannot reproduce 47.51% at any threshold and has withdrawn it pending republication
 * WITH THE OPERATOR ATTACHED. **The withdrawal is on the operator — the unpublished luminance
 * neighbour-difference operator at threshold 25 — and so it reaches EVERY figure that operator
 * produced, not the three struck in the paragraph above.** See THE WITHDRAWN-OPERATOR RULE in the
 * file header before quoting anything from this section. An independent re-measurement of the same
 * eight captures reads
 * **50.4–78.8% at 1:1 native** and **30.3–51.5% density-matched at 2×** — two answers for one
 * property, which is what a figure quoted without its instrument always produces. It may come back
 * sound; until it does, do not cite it, do not compare anything to it, and do not derive from it.
 *
 * **What survived and what did not, and why, is the lesson worth keeping:** the COLOUR figures over
 * these same eight captures — 12–18, mean 16.0 — reproduce EXACTLY, and `GOLD_EDGE_LOW/HIGH/MEAN`
 * below are derived from THIS FILE's own operator over the same PNGs and re-asserted against them
 * every run, so they are unaffected and must not be touched. The derived constants survived and the
 * quoted one did not, because one carries its instrument with it and the other does not. Every
 * number this file emits therefore prints its operator's definition beside it.
 *
 * `tools/artverify/ground-comparison.png` is 96 native pixels of Gold ground against ours at 6×, and
 * it is the one artefact in this finding a number cannot substitute for. Look at it.
 *
 * ── TWO FACTS, KEPT SPLIT, BECAUSE A COMBINED SENTENCE GETS HALF-IMPLEMENTED ─────────────────────
 *   **A — ordered dither buys EDGE DENSITY.** It does nothing to the colour count.
 *   **B — a per-map colour subset buys COLOUR DISCIPLINE.** It does nothing to edge density.
 * Measured by the art session, each disproving the other's sufficiency: dither at amplitude 45
 * without the subset → ~~40.02%~~ **in 43 colours**; the subset without dither → **16 colours** at
 * ~~12.88%~~; both together → ~~44.74%~~ **in 16**, against Gold's ~~47.51%~~ **in 17**.
 *
 * ⚠ **ALL FOUR EDGE FIGURES IN THAT COMPARISON ARE WITHDRAWN — ours and Gold's alike.** They are one
 * unpublished operator's output, and the withdrawal follows the operator rather than a list of
 * numbers (THE WITHDRAWN-OPERATOR RULE, file header). Successive revisions of this line struck two of
 * the four and then three, each time leaving whichever figure had not been enumerated standing —
 * which is exactly what an enumerated withdrawal does to the figures it forgot to enumerate, and the
 * reason the rule is now written as a property of the instrument.
 *
 * **The COLOUR halves — 43, 16, 16, 17 — are unaffected and carry the whole of fact B on their own.**
 * They come from counting distinct colours, which reproduces exactly, and this file re-derives Gold's
 * half of it from the reference PNGs every run (`GOLD_BAND_LOW/HIGH/MEAN`, 12–18, mean 16.0).
 * **Fact A survives unchanged in substance too** — ordered dither moves edge density and does nothing
 * to the colour count — it simply has no quotable number attached to it any more. Do one and the map
 * is still wrong in the other axis, and the number you were watching will have improved.
 *
 * ── AND IT IS ADVISORY, MORE FIRMLY THAN THE COLOUR COUNT IS ─────────────────────────────────────
 * **An edge-density figure is even more gameable than a colour count**, because the art session
 * measured the response to dither amplitude as near-linear — 0 → ~~12.88%~~, 24 → ~~24.09%~~,
 * 40 → ~~40.02%~~, 56 → ~~63.77%~~ — so a generator can be tuned to ANY figure you name.
 *
 * ⚠ **THE LADDER IS WITHDRAWN, AND THE IRONY IN THAT IS WORTH KEEPING RATHER THAN TIDYING AWAY.**
 * The ladder is the ARGUMENT FOR the withdrawal — a figure a knob can be dialled to any value of is
 * worthless without the instrument that produced it — and it was itself produced by the withdrawn
 * instrument, so it is worthless in precisely the way it warns about. Four rungs, one operator, all
 * four struck (THE WITHDRAWN-OPERATOR RULE, file header). **The claim outlives its numbers**: the
 * response to dither amplitude is monotone and roughly proportional, amplitude is a knob, and a knob
 * that reaches any target is what makes the target meaningless. Nothing in this file asserts on the
 * ladder and nothing should ever be tuned toward a figure it produced.
 *
 * They have already hit the failure that implies: applied globally the dither speckles roofs and
 * walls, so a thatched roof comes out
 * dirty rather than textured. **A map that reached the band by ruining its buildings would pass a
 * hard assertion on this number.** That is the clearest worked example this project has of the §16
 * standing caution — two numbers both moving the right way while the artefact gets worse — so this
 * reading fails nothing, and the control below binds the INSTRUMENT instead.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * ⚠ THE CAPTURE TABLES ARE READ FROM A PUBLISHED FILE, BECAUSE THE PIXELS ARE NOT IN THE REPOSITORY.
 *
 * ⚠ AND THIS BLOCK'S PREVIOUS COMMENT SAID THE OPPOSITE, IN THE ONE PLACE IT MATTERED. It read
 * "they are committed (`git ls-files -- assets/reference`)" and made an absent capture a hard
 * failure on that basis. That was true when it was written and is false now: `.gitignore` carries
 * `assets/reference/**` on the owner's instruction — they are Nintendo's own sprite, tile and UI
 * bitmaps, held as pipeline input and never redistributed — and the ten that had already been
 * committed were untracked with `git rm --cached` (commit 1da8cf0), which kept them on this disk
 * and removed them from every clone. **So this arm went red in CI on every commit, for the absence
 * and not for a defect**, and a verification that can only be green where extra files happen to
 * exist is not evidence about the codebase anyone else builds.
 *
 * The repair is not to restore the pixels (they are third-party art and stay out) and not to skip
 * over their absence (that is the vacuous pass the whole file exists to refuse). **A measurement of
 * an image is not the image**: the ten measurements are PUBLISHED in
 * `tools/artverify/published-measurements.json` — tracked, present in every clone — with their
 * operator, their parameters and their corpus (by sha256) recorded beside them, which is the
 * standard `tools/artverify/EVAL-STANDARD.md` applies before a figure may be quoted at all. That
 * file withdrew seven figures and a four-rung amplitude ladder for exactly the omission this avoids.
 *
 * The assertion is then in two halves, and BOTH are real:
 *   · ALWAYS, in CI — the published rows are internally consistent, their parameters still equal
 *     this file's live operator constants, the four bands are derived from the rows rather than
 *     typed beside them, and build-doc §8.4 still quotes the figures it says it derived.
 *   · WHERE THE CORPUS EXISTS — every PNG is re-measured and must reproduce its published row
 *     EXACTLY, sha256 included. That half is stronger than what it replaces: the old loop asserted
 *     only band MEMBERSHIP, so a wrong per-file figure that left the min, max and mean alone was
 *     never checked against a pixel.
 *
 * The skip condition is "the corpus is absent", and it is itself ASSERTED rather than assumed —
 * see `the reference corpus is present in full, or absent in full for the recorded reason`. A
 * partly-present corpus, a tracked file gone missing, or a path that has gone stale all red there.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** One reference capture: a real console map PNG at native size, and what it measures. */
interface ReferenceCapture {
  file: string;
  /** The bytes the figures below were measured over. A refetch or a re-crop is a different image. */
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  colours: number;
  /** Percent of pixels differing from the pixel right or below — `edgePercent`, not §8.2's Sobel. */
  edge: number;
  /** Median 64×64 patch's effective colour count — `groundReading().effective`. */
  conc: number;
  /** Median 64×64 patch's alternation percent — `groundReading().alternationPct`. */
  alt: number;
}

const PUBLISHED_REF = published.referenceCaptures;
const asCapture = (r: (typeof PUBLISHED_REF.captures)[number]): ReferenceCapture => ({
  file: r.file,
  sha256: r.sha256,
  bytes: r.bytes,
  width: r.width,
  height: r.height,
  colours: r.colours,
  edge: r.edge,
  conc: r.conc,
  alt: r.alt,
});

/** Gen 2 (Gold/Silver/Crystal), native size, measured 2026-08-27. All four bands come from these. */
const GOLD_CAPTURES: readonly ReferenceCapture[] = PUBLISHED_REF.captures
  .filter((r) => r.group === 'gen2')
  .map(asCapture);

/**
 * Gen 3 (Ruby/Sapphire), same method, same day. Not a style source for colour — T-17 cites RSE for
 * how top-down elevation is drawn, and 49 against Gold's 16 is a second reason not to mix the two on
 * this axis. They are here because they are the control: a counter that read every image as "about
 * fifteen" would satisfy the Gold rows and fail these.
 */
const RSE_CAPTURES: readonly ReferenceCapture[] = PUBLISHED_REF.captures
  .filter((r) => r.group === 'gen3')
  .map(asCapture);

const ALL_CAPTURES: readonly ReferenceCapture[] = [...GOLD_CAPTURES, ...RSE_CAPTURES];
const CAPTURES_PRESENT = ALL_CAPTURES.filter((r) => existsSync(resolve(REPO_ROOT, r.file)));
const CAPTURES_ABSENT = ALL_CAPTURES.filter((r) => !existsSync(resolve(REPO_ROOT, r.file)));
/** The re-measurement half runs only over a corpus that is ENTIRELY here. Partial is a failure. */
const CORPUS_COMPLETE = CAPTURES_ABSENT.length === 0 && ALL_CAPTURES.length > 0;

const sha256Of = (repoRelative: string): string =>
  createHash('sha256').update(readFileSync(resolve(REPO_ROOT, repoRelative))).digest('hex');

/** True when git has the path in the index. `--error-unmatch` exits non-zero for anything else. */
function gitTracks(repoRelative: string): boolean {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', repoRelative], { cwd: REPO_ROOT, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** True when a .gitignore rule excludes the path. Exit 1 means "not ignored", which is not an error. */
function gitIgnores(repoRelative: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', repoRelative], { cwd: REPO_ROOT, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * The .gitignore PATTERN that excludes a path, as git itself reports it — `null` when none does.
 * `git check-ignore -v` prints `<source>:<line>:<pattern>\t<pathname>`, so the record's stated rule
 * can be compared with the rule actually doing the work instead of being taken on trust.
 */
function gitIgnoreRuleFor(repoRelative: string): string | null {
  try {
    const out = execFileSync('git', ['check-ignore', '-v', '--', repoRelative], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    const head = (out.split('\n')[0] ?? '').split('\t')[0] ?? '';
    const parts = head.split(':');
    return parts.length >= 3 ? parts.slice(2).join(':') : null;
  } catch {
    return null;
  }
}

/**
 * ⛔ THE EVIDENCE THAT AN ABSENT PATH IS A REAL PATH.
 *
 * `gitIgnores()` answers a question about a PATTERN, not about a file: `assets/reference/**` matches
 * every string under that directory, so an invented filename is "ignored" exactly as convincingly as
 * a real one. Measured: rewriting all ten capture paths to `…-STALE.png` left this file GREEN, under
 * an assertion whose own message said a stale path would red it.
 *
 * These ten captures were COMMITTED once and removed with `git rm --cached` in `1da8cf0`, so their
 * bytes are still in this repository's history. `git show 1da8cf0^:<path>` therefore reproduces each
 * one exactly, sha256 and byte count included — and a path that never existed has no such blob. That
 * is the strongest evidence available without redistributing anything: the blob is read, hashed and
 * discarded, never written to the tree.
 *
 * ⚠ It requires HISTORY. `actions/checkout@v4` clones at depth 1 by default, so on CI as configured
 * today the commit is not there and this check cannot run — it says so loudly rather than passing
 * quietly. (`fetch-depth: 0` would give CI both this and the re-measurement; that is a third-party
 * asset decision for the owner, not for this file.)
 */
const HISTORY_REV = `${PUBLISHED_REF.corpus.untrackedInCommit}^`;

function historyIsAvailable(): boolean {
  try {
    if (execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim() === 'true')
      return false;
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${HISTORY_REV}^{commit}`], { cwd: REPO_ROOT, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** The bytes a path held at `HISTORY_REV`, or `null` when nothing was committed at that path. */
function blobAtHistoryRev(repoRelative: string): Buffer | null {
  try {
    return execFileSync('git', ['show', `${HISTORY_REV}:${repoRelative}`], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

const HISTORY_AVAILABLE = historyIsAvailable();

/**
 * This gate's own repo-relative path and source. The record names this file as the publisher of
 * every figure in it AND as the implementation of all four operators; both are claims about a file
 * that can be read, so they are read.
 */
const SELF_PATH = 'tests/gates/asset-palette-contract.test.ts';
const SELF_SOURCE = readFileSync(resolve(REPO_ROOT, SELF_PATH), 'utf8');

/** `"<file> :: <symbol>(…) -> …"` → the symbol, or `null` if the string is not that shape. */
function implementationSymbol(impl: string): { file: string; symbol: string } | null {
  const [file, rest] = impl.split(' :: ');
  if (file === undefined || rest === undefined) return null;
  const symbol = rest.split('(')[0]?.trim() ?? '';
  return symbol === '' ? null : { file, symbol };
}

/** True when the file declares the symbol as a function or a const — the two forms this file uses. */
const declaresSymbol = (source: string, symbol: string): boolean =>
  new RegExp(`(?:^|\\n)(?:export )?(?:async )?function ${symbol}\\(`).test(source) ||
  new RegExp(`(?:^|\\n)(?:export )?const ${symbol}(?::| =)`).test(source);

if (!CORPUS_COMPLETE) {
  // ⛔ LOUD, NAMED, AND IN THE LOG OF EVERY RUN THAT CANNOT MEASURE THE PIXELS. A skip that reads
  // like a pass is the exact failure `tests/gates/reachability.test.ts` exists because of, so the
  // reason is printed where nobody can miss it and the assertion that the reason is TRUE runs below.
  console.warn(
    `\n⚠ REFERENCE CORPUS ABSENT — ${CAPTURES_PRESENT.length} of ${ALL_CAPTURES.length} captures on disk.\n` +
      '  The band re-measurement is SKIPPED, and it is skipped for a reason this file asserts rather\n' +
      '  than assumes: assets/reference/** is DELIBERATELY UNTRACKED third-party input (Nintendo\'s\n' +
      '  own tile and UI bitmaps, .gitignore rule `assets/reference/**`, untracked in commit\n' +
      '  1da8cf0). It is not a broken path and there is nothing to restore.\n' +
      '  The published figures in tools/artverify/published-measurements.json are still asserted, in\n' +
      '  full, by the two tests that always run. What is NOT proved here is that they still match\n' +
      '  the pixels — only a tree holding assets/reference/ can prove that.\n' +
      CAPTURES_ABSENT.map((r) => `    ABSENT  ${r.file}`).join('\n') +
      '\n',
  );
}

/**
 * How many reference captures the two tables above are required to hold, pinned as a literal.
 *
 * ⚠ **THIS EXISTS BECAUSE THE REFERENCE ARM ONCE PASSED WITH THE CORPUS GONE.** `mv
 * assets/reference /tmp` and the whole file read **42 passed (42)**, identical to baseline: the
 * band check skipped every absent file with a `continue`, nothing asserted the checked count, and
 * every published Gold band — 12–18 colours, 51–79% edge, 2.6–3.8 concentration, 28.7–64.3%
 * alternation — collapsed into a literal compared against a literal **in this same file**. That is
 * exactly the vacuous pass header note 2 refuses everywhere else in this gate, living inside the
 * one arm whose whole job is to prove the bands are sourced from real pixels. A skip is not a pass.
 *
 * A count rather than a mere non-zero floor, because the arm can be emptied from EITHER side: the
 * PNGs can leave the tree, or rows can leave the tables. `COVERED` above has the same shape of
 * guard and it is the reason a deleted shipped asset reds instead of shrinking the loop.
 *
 * ⚠ **THE TWO SIDES ARE NOW GUARDED IN DIFFERENT PLACES, AND THAT IS DELIBERATE.** The PNGs have
 * left the tree — permanently, for every clone (see the capture-table header) — so "the corpus is
 * gone" can no longer be a failure. It is a SKIP, and the skip is legitimate only because the
 * always-running `the reference corpus is present in full, or absent in full for the recorded
 * reason` proves the absence is the recorded, untracked, ignored one. THIS count still guards the
 * other side, everywhere, including in a clean clone: rows leaving the published record is a
 * failure and always will be, because the record is tracked and its absence has no excuse.
 *
 * Not a gameplay constant, so G11 does not reach it — it counts rows in a table of somebody else's
 * shipped art, exactly as `GOLD_BAND_LOW` and the vacuity floors do.
 */
const REFERENCE_CAPTURE_COUNT = 10;

/**
 * How many decimal places every measured figure in the published record carries.
 * `parameters.rounding` states it — "figures below are the operator's output rounded to 2 decimal
 * places; `colours` is exact" — and that sentence is asserted against the rows themselves below,
 * so it is a checkable claim rather than a caption.
 */
const ROW_DECIMALS = 2;

/** Round DOWN / UP / to nearest at a decimal precision the RECORD supplies, never one typed here. */
const floorAt = (v: number, dp: number): number => Math.floor(v * 10 ** dp) / 10 ** dp;
const ceilAt = (v: number, dp: number): number => Math.ceil(v * 10 ** dp) / 10 ** dp;
const roundAt = (v: number, dp: number): number => Number(v.toFixed(dp));

/**
 * THE RECORD'S OWN DERIVATION RULE, EXECUTED — `bands._derivation` states it in prose and this is
 * the only place it exists as arithmetic. Both precisions are read OUT OF THE RECORD, which is the
 * point: a rule stated in words beside figures it cannot reproduce is worse than no rule, and that
 * is precisely what was here. `conc.mean` was published as 3.42 and `alt.mean` as 48.73 under a
 * sentence saying the mean is "rounded to the stated precision" with `precision: 1` beside it — 3.4
 * and 48.7. Nothing compared the two, because `precision` was only ever matched literal-to-literal
 * against a literal in this file. The figures were right (every row in this record is published at
 * two decimals) and the SENTENCE was wrong, so the rule now names its two precisions separately:
 * `precision` rounds the band edges OUTWARD, `meanPrecision` rounds the mean.
 */
function deriveBand(
  values: readonly number[],
  spec: { readonly precision: number; readonly meanPrecision: number },
): { low: number; high: number; mean: number } {
  return {
    low: floorAt(Math.min(...values), spec.precision),
    high: ceilAt(Math.max(...values), spec.precision),
    mean: roundAt(values.reduce((a, b) => a + b, 0) / values.length, spec.meanPrecision),
  };
}

/** The four bands, paired with the record rows they are published in. Iterated, never retyped. */
const BAND_SPECS = [
  ['colours', PUBLISHED_REF.bands.colours],
  ['edge', PUBLISHED_REF.bands.edge],
  ['conc', PUBLISHED_REF.bands.conc],
  ['alt', PUBLISHED_REF.bands.alt],
] as const;

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

/**
 * The colour-concentration band, same eight captures, same day, same outward rounding — effective
 * colours per median 64×64 patch, from the measured extremes 2.62 and 3.80.
 *
 * **This band is two-sided in a way the other two are not, and that is the whole design.** A number
 * BELOW it is a flat fill — a single colour reads exactly 1.00, the mathematical floor of
 * `1 / Σ pᵢ²` — and a number far above it is continuous noise wearing texture's clothes, which is
 * what an unquantized generator returns (2059.85 measured on this repo's own raw map output). A
 * naive concentration reading — "share held by the top three colours" — has only ONE bad end: a
 * blank rectangle scores 100% and wins. Expressing the same concentration as an effective COUNT is
 * what puts the blank rectangle at the bottom instead of the top, and it is the reason the reading
 * is a count rather than the percentage every measurement above is quoted in.
 *
 * Same fossil risk as the other two bands and the same guard: the literals are asserted against
 * `GOLD_CAPTURES` below, and the captures are re-measured against the band.
 */
const GOLD_CONC_LOW = 2.6;
const GOLD_CONC_HIGH = 3.8;
const GOLD_CONC_MEAN = 3.42;

/**
 * The alternation band, same eight captures, same rule, same outward rounding — percent of adjacent
 * opaque pairs that differ, in the median 64² patch, from the measured extremes 28.72 and 64.24.
 *
 * **The mean is the corroborated number here, not the extremes.** 48.73 is what this operator makes
 * of the eight Gen-2 captures; 48.7 is what the art session independently reports for Gold new-bark
 * ground with an operator of their own. `the alternation operator reproduces the figure it was
 * validated against` below holds them together so a silent drift in either cannot pass.
 *
 * ⚠ **BUT THE AGREEMENT IS NOT CORROBORATION, AND THIS COMMENT USED TO SAY IT WAS.** It read "two
 * instruments agreeing to a tenth of a point is the thing the withdrawn edge figure never managed".
 * Two instruments, two sessions — and **two different REGIONS**. `GOLD_ALT_MEAN` is this operator
 * over eight WHOLE CAPTURES, which the paragraph below states outright; `REPORTED_GOLD_ALT` is a
 * figure for Gold GROUND. A whole-map number standing in for a ground number is the precise error
 * the WHOLE-IMAGE EDGE READING section above exists to catch, and this file committed it about
 * itself. The owning lane's hand-verified Gold open ground alternates at **56.5%** (route-29 tall
 * grass, 704,192) and **78.2%** (short grass, 448,104) — **neither is 48.7**, which is what you would
 * expect if the two sides are measuring different things and landing on one number by coincidence.
 * **Keep the constant and keep the assertion** — the figure is not withdrawn, it is an alternation
 * reading rather than a threshold-25 edge density, and two operators do reproduce it. What is
 * retired is the CLAIM that their agreement is evidence about ground.
 *
 * The spread is wide (28.7–64.3) because these are whole maps, not hand-picked ground: Olivine is
 * mostly flat sea and pier, Route 29 is almost all dithered grass. That width is why this band flags
 * far less than the concentration one does, and why it is a reading aid rather than a target.
 */
const GOLD_ALT_LOW = 28.7;
const GOLD_ALT_HIGH = 64.3;
const GOLD_ALT_MEAN = 48.73;

/** What the art session reports for Gold ground, measured with a different operator. */
const REPORTED_GOLD_ALT = 48.7;

const bandLabel = `${GOLD_BAND_LOW}–${GOLD_BAND_HIGH}`;
const edgeBandLabel = `${GOLD_EDGE_LOW.toFixed(0)}–${GOLD_EDGE_HIGH.toFixed(0)}%`;
const concBandLabel = `${GOLD_CONC_LOW.toFixed(1)}–${GOLD_CONC_HIGH.toFixed(1)}`;
const altBandLabel = `${GOLD_ALT_LOW.toFixed(1)}–${GOLD_ALT_HIGH.toFixed(1)}%`;

const outsideMark = (v: number, lo: number, hi: number): string => (v > hi ? ' ▲ ' : v < lo ? ' ▼ ' : ' = ');

/** `▲`/`▼` when a map sits outside the Gold band, blank when it is inside or is not a map. */
function bandFlag(c: Census, isMap: boolean): string {
  return isMap ? outsideMark(c.swatches.size, GOLD_BAND_LOW, GOLD_BAND_HIGH) : '   ';
}

/** The same, for the ground-texture reading. */
function edgeFlag(c: Census, isMap: boolean): string {
  return isMap ? outsideMark(c.edgePct, GOLD_EDGE_LOW, GOLD_EDGE_HIGH) : '   ';
}

/** The same, for colour concentration. ▼ here means FLATTER than Gold, ▲ means mushier. */
function concFlag(c: Census, isMap: boolean): string {
  return isMap ? outsideMark(c.conc, GOLD_CONC_LOW, GOLD_CONC_HIGH) : '   ';
}

/** The same, for alternation. ▼ means POOLED into regions where Gold interleaves. */
function altFlag(c: Census, isMap: boolean): string {
  return isMap ? outsideMark(c.altPct, GOLD_ALT_LOW, GOLD_ALT_HIGH) : '   ';
}

/** A reference capture measured exactly the way `census` measures a shipped asset. */
async function referenceColours(
  file: string,
): Promise<{ colours: number; edge: number; conc: number; alt: number; width: number; height: number; bytes: number }> {
  const c = await census(file);
  return {
    colours: c.swatches.size,
    edge: c.edgePct,
    conc: c.conc,
    alt: c.altPct,
    width: c.width,
    height: c.height,
    // Published beside the sha256 and, until now, checked only for being greater than zero — so a
    // row could publish 12,345 bytes for a 25,813-byte file and no run would ever say so.
    bytes: c.bytes,
  };
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

    // ⛔ THE RECORD'S OWN RULE, RUN OVER THE RECORD'S OWN ROWS, BEFORE ANYTHING ELSE IS COMPARED.
    // `bands._derivation` is a sentence describing arithmetic; a sentence that cannot produce the
    // figures printed underneath it is a false provenance, and this file already shipped one — see
    // the note on `deriveBand`. Both precisions come out of the record, so the rule and the figures
    // are checked against each other rather than each against a copy in this file.
    const BAND_VALUES: Record<string, readonly number[]> = {
      colours: counts,
      edge: GOLD_CAPTURES.map((r) => r.edge),
      conc: GOLD_CAPTURES.map((r) => r.conc),
      alt: GOLD_CAPTURES.map((r) => r.alt),
    };
    const cannotDerive = BAND_SPECS.flatMap(([name, band]) => {
      const d = deriveBand(BAND_VALUES[name]!, band);
      if (d.low === band.low && d.high === band.high && d.mean === band.mean) return [];
      return [
        `${name}: the record publishes {low ${band.low}, high ${band.high}, mean ${band.mean}}; its ` +
          `own derivation over its own ${BAND_VALUES[name]!.length} Gold rows, at the precisions it ` +
          `states (edges ${band.precision} dp outward, mean ${band.meanPrecision} dp), gives ` +
          `{low ${d.low}, high ${d.high}, mean ${d.mean}}`,
      ];
    });
    expect(
      cannotDerive,
      'tools/artverify/published-measurements.json states a derivation it cannot perform on its own ' +
        'rows:\n  ' +
        cannotDerive.join('\n  ') +
        '\nOne of the three is wrong — the rows, the figures, or the stated precisions. Decide which ' +
        'and fix THAT; do not retype a figure until the sentence stops being true.',
    ).toEqual([]);

    const dColours = deriveBand(counts, PUBLISHED_REF.bands.colours);
    expect(dColours.low, `the published band floor ${GOLD_BAND_LOW} is not the lowest recorded capture`).toBe(
      GOLD_BAND_LOW,
    );
    expect(dColours.high, `the published band ceiling ${GOLD_BAND_HIGH} is not the highest recorded capture`).toBe(
      GOLD_BAND_HIGH,
    );
    expect(
      dColours.mean,
      `the published band mean ${GOLD_BAND_MEAN} disagrees with the recorded captures (${counts.join('/')})`,
    ).toBe(GOLD_BAND_MEAN);

    // The ground-texture band, same table, same guard. Rounded OUTWARD from the extremes so the
    // captures the band is derived from are inside it rather than on its rim.
    const edges = BAND_VALUES.edge!;
    const dEdge = deriveBand(edges, PUBLISHED_REF.bands.edge);
    expect(
      dEdge.low,
      `the published edge-band floor ${GOLD_EDGE_LOW} is not the lowest recorded capture, rounded down`,
    ).toBe(GOLD_EDGE_LOW);
    expect(
      dEdge.high,
      `the published edge-band ceiling ${GOLD_EDGE_HIGH} is not the highest recorded capture, rounded up`,
    ).toBe(GOLD_EDGE_HIGH);
    expect(
      dEdge.mean,
      `the published edge-band mean ${GOLD_EDGE_MEAN} disagrees with the recorded captures ` +
        `(${edges.map((e) => e.toFixed(2)).join('/')})`,
    ).toBe(GOLD_EDGE_MEAN);

    // The colour-concentration band, same table, same guard, same outward rounding.
    const concs = BAND_VALUES.conc!;
    const dConc = deriveBand(concs, PUBLISHED_REF.bands.conc);
    expect(
      dConc.low,
      `the published concentration floor ${GOLD_CONC_LOW} is not the lowest recorded capture, rounded down`,
    ).toBe(GOLD_CONC_LOW);
    expect(
      dConc.high,
      `the published concentration ceiling ${GOLD_CONC_HIGH} is not the highest recorded capture, rounded up`,
    ).toBe(GOLD_CONC_HIGH);
    expect(
      dConc.mean,
      `the published concentration mean ${GOLD_CONC_MEAN} disagrees with the recorded captures ` +
        `(${concs.map((c) => c.toFixed(2)).join('/')})`,
    ).toBe(GOLD_CONC_MEAN);

    // The band must have somewhere to be wrong in BOTH directions. A floor at or below 1.0 would
    // put a flat fill inside it — the first trap THE GROUND READING is built around — and the whole
    // reason concentration is expressed as a count and not as the top-three share.
    expect(
      GOLD_CONC_LOW,
      'the concentration floor is at or below 1.0, which is what a single flat colour reads. A band ' +
        'a blank rectangle sits inside is the vacuous pass this reading exists to avoid.',
    ).toBeGreaterThan(1);

    // The alternation band, same table, same guard, same outward rounding.
    const alts = BAND_VALUES.alt!;
    const dAlt = deriveBand(alts, PUBLISHED_REF.bands.alt);
    expect(
      dAlt.low,
      `the published alternation floor ${GOLD_ALT_LOW} is not the lowest recorded capture, rounded down`,
    ).toBe(GOLD_ALT_LOW);
    expect(
      dAlt.high,
      `the published alternation ceiling ${GOLD_ALT_HIGH} is not the highest recorded capture, rounded up`,
    ).toBe(GOLD_ALT_HIGH);
    expect(
      dAlt.mean,
      `the published alternation mean ${GOLD_ALT_MEAN} disagrees with the recorded captures ` +
        `(${alts.map((a) => a.toFixed(2)).join('/')})`,
    ).toBe(GOLD_ALT_MEAN);

    // A floor at or below zero would put a flat fill inside the alternation band too — the same
    // vacuity in the other axis, and worth asserting separately because the two bands are derived
    // independently and either could be re-derived without the other.
    expect(
      GOLD_ALT_LOW,
      'the alternation floor is at or below 0%, which is what a flat fill and a pooled field read',
    ).toBeGreaterThan(0);
  });

  /* ──────────────────────────────────────────────────────────────────────────────────────────────
   * THE HALF THAT ALWAYS RUNS — the published record, checked against itself and against the code.
   *
   * Every assertion in this block holds in a clean clone that has never had a single reference PNG.
   * It is the half that catches the record drifting from its own operator, the bands drifting from
   * the rows, and the documents drifting from the evidence they cite. The re-measurement below is
   * the other half — the record against the pixels — and it can only run where the pixels are.
   * ────────────────────────────────────────────────────────────────────────────────────────────── */

  it('the published reference record is internally consistent, and its parameters are the live ones', () => {
    // 1. THE ROWS. The record can be emptied or duplicated from either side, so the shape is pinned.
    expect(
      ALL_CAPTURES.length,
      `tools/artverify/published-measurements.json holds ${ALL_CAPTURES.length} capture rows, not ` +
        `the pinned ${REFERENCE_CAPTURE_COUNT}. Every band this file publishes is corroborated by ` +
        'exactly these rows; a shorter table publishes a band over measurements that are not there.',
    ).toBe(REFERENCE_CAPTURE_COUNT);
    expect(GOLD_CAPTURES.length, 'the Gold group is not eight captures').toBe(8);
    expect(RSE_CAPTURES.length, 'the Gen-3 control is not two captures').toBe(2);
    expect(new Set(ALL_CAPTURES.map((r) => r.file)).size, 'a capture file is published twice').toBe(
      ALL_CAPTURES.length,
    );
    expect(
      new Set(ALL_CAPTURES.map((r) => r.sha256)).size,
      'two capture rows share a sha256 — the same image is published twice under two names, and the ' +
        'band it contributes to is then derived from seven images and a copy',
    ).toBe(ALL_CAPTURES.length);

    const malformed = ALL_CAPTURES.filter(
      (r) =>
        !/^[0-9a-f]{64}$/.test(r.sha256) ||
        !r.file.startsWith(`${PUBLISHED_REF.corpus.root}/`) ||
        !Number.isInteger(r.colours) ||
        r.colours <= 0 ||
        !(r.bytes > 0) ||
        !(r.width > 0) ||
        !(r.height > 0) ||
        !Number.isFinite(r.edge) ||
        !Number.isFinite(r.conc) ||
        !Number.isFinite(r.alt),
    );
    expect(malformed.map((r) => r.file), 'a published capture row is not a well-formed measurement').toEqual([]);

    // 2. THE FIGURES MUST BE PHYSICALLY POSSIBLE. `1/Σpᵢ²` is ≥ 1 for any non-empty patch and a
    // percentage is in [0,100]; a row outside those is a broken instrument's output published as a
    // measurement, which is the one thing this record must never be able to launder.
    for (const r of ALL_CAPTURES) {
      expect(r.conc, `${r.file}: published concentration below 1.0 is a broken instrument, not a flatter picture`)
        .toBeGreaterThanOrEqual(1);
      expect(r.edge, `${r.file}: published edge density outside 0–100%`).toBeGreaterThanOrEqual(0);
      expect(r.edge, `${r.file}: published edge density outside 0–100%`).toBeLessThanOrEqual(100);
      expect(r.alt, `${r.file}: published alternation outside 0–100%`).toBeGreaterThanOrEqual(0);
      expect(r.alt, `${r.file}: published alternation outside 0–100%`).toBeLessThanOrEqual(100);
      expect(
        r.colours,
        `${r.file}: published at ${r.colours} distinct colours over ${r.width}×${r.height} = ` +
          `${r.width * r.height} pixels, which is more colours than the image has pixels`,
      ).toBeLessThanOrEqual(r.width * r.height);
    }

    // 3. THE PARAMETERS. A figure is not quotable without the operator that made it, and an operator
    // is not the same operator at a different patch size. These are published beside the numbers and
    // asserted against the constants this file actually runs, so a retune cannot leave the figures
    // standing as though nothing had happened.
    expect(
      PUBLISHED_REF.parameters.groundPatchPx,
      `the record publishes a ${PUBLISHED_REF.parameters.groundPatchPx}px ground patch; this file ` +
        `measures ${GROUND_PATCH_PX}px. The conc and alt columns are MEDIANS OVER PATCHES — change ` +
        'the patch and every one of them is a different measurement. Re-measure and republish.',
    ).toBe(GROUND_PATCH_PX);
    expect(
      PUBLISHED_REF.parameters.opaqueAlphaMin,
      `the record publishes an opacity threshold of ${PUBLISHED_REF.parameters.opaqueAlphaMin}; this ` +
        `file counts a pixel from alpha ${OPAQUE_ALPHA_MIN} up. The published figures were then taken ` +
        'over a different set of pixels than this file measures. Re-measure and republish.',
    ).toBe(OPAQUE_ALPHA_MIN);

    // 4. THE BANDS THE RECORD ITSELF PUBLISHES must be the ones this file derives, or a reader of
    // the JSON and a reader of the gate get different answers to the same question.
    expect(
      {
        colours: PUBLISHED_REF.bands.colours,
        edge: PUBLISHED_REF.bands.edge,
        conc: PUBLISHED_REF.bands.conc,
        alt: PUBLISHED_REF.bands.alt,
      },
      'the bands published in tools/artverify/published-measurements.json are not the bands this ' +
        'gate derives from the same rows. One of the two was edited and the other was not.',
    ).toEqual({
      colours: { low: GOLD_BAND_LOW, high: GOLD_BAND_HIGH, mean: GOLD_BAND_MEAN, precision: 0, meanPrecision: ROW_DECIMALS },
      edge: { low: GOLD_EDGE_LOW, high: GOLD_EDGE_HIGH, mean: GOLD_EDGE_MEAN, precision: 1, meanPrecision: ROW_DECIMALS },
      conc: { low: GOLD_CONC_LOW, high: GOLD_CONC_HIGH, mean: GOLD_CONC_MEAN, precision: 1, meanPrecision: ROW_DECIMALS },
      alt: { low: GOLD_ALT_LOW, high: GOLD_ALT_HIGH, mean: GOLD_ALT_MEAN, precision: 1, meanPrecision: ROW_DECIMALS },
    });

    // …and `parameters.rounding` — "the operator's output rounded to 2 decimal places; `colours` is
    // exact" — is a claim about the rows, so it is checked against them. It is also what makes
    // `meanPrecision` above the right number rather than a taste: the mean of figures published at
    // two decimals is published at two decimals.
    const overPrecise = ALL_CAPTURES.filter(
      (r) =>
        !Number.isInteger(r.colours) ||
        roundAt(r.edge, ROW_DECIMALS) !== r.edge ||
        roundAt(r.conc, ROW_DECIMALS) !== r.conc ||
        roundAt(r.alt, ROW_DECIMALS) !== r.alt,
    );
    expect(
      overPrecise.map((r) => `${r.file}: edge ${r.edge} conc ${r.conc} alt ${r.alt} colours ${r.colours}`),
      `parameters.rounding says every figure in this record is the operator's output at ` +
        `${ROW_DECIMALS} decimal places and that \`colours\` is exact. These rows are not, so either ` +
        'the record was republished at a different precision and the caption was not, or a figure ' +
        'was typed rather than measured.',
    ).toEqual([]);
    expect(
      PUBLISHED_REF.crossOperatorAgreement.reportedGoldAlt,
      "the record's independently-reported Gold alternation is not this file's REPORTED_GOLD_ALT",
    ).toBe(REPORTED_GOLD_ALT);

    // 5. THE CONTROL MUST STILL BE A CONTROL, from the record alone. Gen 3 is here to prove the
    // instruments discriminate; if the published Gen-3 rows sat inside the Gold bands, the
    // re-measurement below would be asserting a tautology on every tree that can run it.
    for (const r of RSE_CAPTURES) {
      expect(
        r.colours,
        `${r.file} is published at ${r.colours} colours, inside the Gold band ${bandLabel}. The Gen-3 ` +
          'rows are the discrimination control; a control that does not discriminate is not a weaker ' +
          'control, it is a false one.',
      ).toBeGreaterThan(GOLD_BAND_HIGH);
      expect(
        r.conc,
        `${r.file} is published at ${r.conc} effective colours, inside the Gold band ${concBandLabel}`,
      ).toBeGreaterThan(GOLD_CONC_HIGH);
    }

    /* 6. EVERY OTHER FIELD THE RECORD PUBLISHES, BOUND TO SOMETHING THAT CAN CONTRADICT IT.
     *
     * ⚠ Written because five published fields were mutated and none of them reddened anything:
     * `captures[].bytes`, `operator.groundPatchSource`, `corpus.gitignoreRule`, an aggregate in the
     * companion record, and `operators.*.implementation`, which was never read at all. A figure or a
     * path in an evidence record that nothing checks is decoration that reads as evidence, and this
     * record's whole purpose is to be the evidence. Anything published here is either asserted or
     * removed. */
    expect(
      PUBLISHED_REF.publishedBy,
      'the record names a different file as the publisher of these figures than the file asserting them',
    ).toBe(SELF_PATH);

    // The four operators are the four bands. An operator row leaving the record would take a
    // definition and a region with it and leave the band it produced looking self-evident.
    expect(
      Object.keys(PUBLISHED_REF.operators)
        .filter((k) => !k.startsWith('_'))
        .sort(),
      'the record publishes a different set of operators than the set of bands it publishes',
    ).toEqual(BAND_SPECS.map(([n]) => n).slice().sort());

    // …and each one names a symbol in THIS file. `implementation` is the field that makes a figure
    // re-runnable — EVAL-STANDARD.md refuses a figure without one — so it is checked as a reference
    // rather than read as a caption. The region is cross-checked against the symbol: only
    // `groundReading` measures over patches, so only its operators may claim the ground-patch region.
    const opRows = [
      ['colours', PUBLISHED_REF.operators.colours],
      ['edge', PUBLISHED_REF.operators.edge],
      ['conc', PUBLISHED_REF.operators.conc],
      ['alt', PUBLISHED_REF.operators.alt],
    ] as const;
    const badOps = opRows.flatMap(([name, op]) => {
      const parsed = implementationSymbol(op.implementation);
      if (parsed === null) return [`${name}: implementation "${op.implementation}" is not "<file> :: <symbol>(…)"`];
      if (parsed.file !== SELF_PATH) return [`${name}: implementation names ${parsed.file}, not ${SELF_PATH}`];
      if (!declaresSymbol(SELF_SOURCE, parsed.symbol))
        return [`${name}: implementation names ${parsed.symbol}(), which ${SELF_PATH} does not declare`];
      const expectedRegion = parsed.symbol === 'groundReading' ? 'ground-patch' : 'whole-image';
      if (op.region !== expectedRegion)
        return [`${name}: region "${op.region}" but ${parsed.symbol}() measures ${expectedRegion}`];
      if (op.definition.trim() === '') return [`${name}: no definition`];
      return [];
    });
    expect(
      badOps,
      'an operator row in tools/artverify/published-measurements.json does not point at a real ' +
        `operator:\n  ${badOps.join('\n  ')}\n` +
        'A figure whose operator cannot be re-run is withdrawn by tools/artverify/EVAL-STANDARD.md ' +
        'before it may be quoted; a record that names one that does not exist is worse than one that ' +
        'names none.',
    ).toEqual([]);

    // THE CORPUS FIELDS. `trackedInGit` is checked against git in "the reference corpus is present in
    // full…"; here it is checked for INTERNAL sense: a file is in a clean clone exactly when git
    // tracks it, so the two flags may not disagree.
    expect(
      PUBLISHED_REF.corpus.presentInACleanClone,
      'the record says these captures are untracked AND present in a clean clone, or tracked AND ' +
        'absent from one. A clean clone holds exactly what git tracks.',
    ).toBe(PUBLISHED_REF.corpus.trackedInGit);

    // The .gitignore rule the record blames the absence on must be the rule git actually applies.
    // `gitIgnores()` alone only says SOME rule matches, which a moved or widened rule also satisfies.
    const wrongRule = ALL_CAPTURES.map((r) => ({ file: r.file, rule: gitIgnoreRuleFor(r.file) })).filter(
      (e) => e.rule !== PUBLISHED_REF.corpus.gitignoreRule,
    );
    expect(
      wrongRule.map((e) => `${e.file}: git applies ${e.rule ?? 'no rule'}, the record publishes ${PUBLISHED_REF.corpus.gitignoreRule}`),
      'the record names a .gitignore rule that is not the one excluding these captures:\n  ' +
        wrongRule.map((e) => `${e.file} → ${e.rule ?? 'NOT IGNORED'}`).join('\n  ') +
        '\nThe recorded reason for the absence is that rule. If the rule moved, the recorded reason ' +
        'moved with it and the record has to say so.',
    ).toEqual([]);

    // `howToObtain` is the only route the next reader has to the corpus. It names a tracked file, so
    // the file is required to be there — a pointer into nothing is how a deliberate absence turns
    // into an unexplained one.
    const howTo = PUBLISHED_REF.corpus.howToObtain.split(/\s/)[0] ?? '';
    expect(
      existsSync(resolve(REPO_ROOT, howTo)),
      `corpus.howToObtain points at ${howTo}, which is not in this tree. It is the record's only ` +
        'route back to the corpus.',
    ).toBe(true);

    // The commit the record blames for the untracking must be a commit. When history is shallow this
    // cannot be resolved and the capture-provenance test below says so; the string is still checked
    // for shape here so a typo cannot hide behind a shallow clone.
    expect(
      PUBLISHED_REF.corpus.untrackedInCommit,
      'corpus.untrackedInCommit is not a git object name',
    ).toMatch(/^[0-9a-f]{7,40}$/);
  });

  it('the reference corpus is present in full, or absent in full for the recorded reason', () => {
    // ⛔ THE SKIP CONDITION, ASSERTED RATHER THAN ASSUMED. The re-measurement below is conditional
    // on this corpus, and the ONLY absence that licenses skipping it is the recorded one: the files
    // are deliberately untracked third-party input. Everything else — a partly-present corpus, a
    // tracked file gone missing, a path that has gone stale, a `.gitignore` rule that has moved —
    // reds HERE, so a bare `existsSync` can never be mistaken for a clean bill of health.
    // ⛔ AND THEY MAY NEVER BE COMMITTED, present or absent. This is the owner's instruction and it
    // is not a preference: they are Nintendo's own sprite, tile and UI bitmaps, held as pipeline
    // input and never redistributed. It is asserted HERE because the obvious way to make the
    // re-measurement run in CI is to commit them, and that repair is forbidden — the figures are
    // published instead, which is what the rest of this block is for.
    const committed = ALL_CAPTURES.map((r) => r.file).filter(gitTracks);
    expect(
      committed,
      `${committed.length} reference capture(s) are TRACKED IN GIT: ${committed.join(' ')}. These are ` +
        'third-party bitmaps kept out of the repository on the owner\'s instruction (.gitignore rule ' +
        '`assets/reference/**`, untracked in commit 1da8cf0). If this was done to make the ' +
        're-measurement below run in CI, that is the one repair this whole arrangement exists to ' +
        'refuse — untrack them again (`git rm --cached`) and leave the published record to carry the ' +
        'figures.',
    ).toEqual([]);

    // …and the corpus README stays, present or absent, because it is what tells the next reader what
    // the set is and how to re-fetch it. Losing it turns a deliberate absence into an unexplained
    // one — and it is the ONE file in that directory .gitignore deliberately un-ignores, so its
    // disappearance is always a deletion somebody made.
    expect(
      existsSync(resolve(REPO_ROOT, 'assets/reference/README.md')),
      'assets/reference/README.md is gone. It is the tracked record of what the reference corpus is ' +
        'and how to re-fetch it — the only thing standing between "deliberately absent" and "nobody ' +
        'knows what used to be here".',
    ).toBe(true);

    if (CORPUS_COMPLETE) {
      expect(CAPTURES_ABSENT, 'the corpus is complete').toEqual([]);
      return;
    }

    expect(
      CAPTURES_PRESENT.map((r) => r.file),
      `the reference corpus is PARTLY present: ${CAPTURES_PRESENT.length} of ${ALL_CAPTURES.length} ` +
        'captures are on disk. That is neither of the two legal states. A partial corpus means some ' +
        'bands would be re-measured and others silently taken on trust, which is the mixed evidence ' +
        'this file refuses. Restore the rest or move them all aside.',
    ).toEqual([]);

    // The tracked-and-missing case is already red above (a tracked capture is a failure whether the
    // file is there or not), so what is left to check is that the absence is the IGNORED one — i.e.
    // that a `.gitignore` rule actually explains it, rather than the path having gone stale.
    const wrong: string[] = [];
    for (const r of ALL_CAPTURES) {
      if (!gitIgnores(r.file)) {
        wrong.push(
          `${r.file}: absent, untracked, and NOT matched by any .gitignore rule. The recorded reason ` +
            'is the `assets/reference/**` rule; an absence that is not that one is a stale path in ' +
            'the published record, and every figure published for it is unsourced.',
        );
        continue;
      }
      // ⛔ …AND THE DIRECTORY IT WOULD LIVE IN MUST BE ABSENT TOO. The rule above is about a
      // PATTERN: `assets/reference/**` matches every string under that directory, so an invented
      // filename passes it exactly as convincingly as a real one — measured, by rewriting all ten
      // paths to `…-STALE.png` and watching this file stay green under an assertion whose own
      // message promised a stale path would red it. A clone that does not have the corpus does not
      // have the DIRECTORY either (`.gitignore` un-ignores only README.md and .gitkeep, so nothing
      // creates `gen2/` or `gen3/`). A directory that IS here with a published file missing from it
      // is therefore not the deliberate absence — it is a path that has gone stale under an
      // untracked corpus, which is where a stale path is hardest to notice and cheapest to make.
      const dir = dirname(r.file);
      if (existsSync(resolve(REPO_ROOT, dir))) {
        wrong.push(
          `${r.file}: ${dir}/ IS on this disk and this capture is not in it. The recorded absence is ` +
            'the whole corpus being absent, which takes its directories with it; a file missing from ' +
            'a directory that is here is a stale path in the published record.',
        );
      }
    }
    expect(
      wrong,
      'the reference corpus is absent, but not for the reason the published record gives:\n  ' +
        wrong.join('\n  ') +
        '\nThe recorded reason is that assets/reference/** holds Nintendo\'s own sprite, tile and UI ' +
        'bitmaps — pipeline input, never redistributed — which .gitignore excludes and which commit ' +
        '1da8cf0 untracked. That absence is permanent and intended. Any OTHER absence is a defect.',
    ).toEqual([]);
  });

  it.skipIf(!HISTORY_AVAILABLE)(
    'every published capture is a path this repository once held, at the bytes it publishes' +
      (HISTORY_AVAILABLE
        ? ''
        : ` — SKIPPED, NO HISTORY: ${HISTORY_REV} is not in this checkout (a shallow clone, which is ` +
          'what actions/checkout@v4 makes at its default depth of 1). Nothing here is taken on trust ' +
          'instead: the ignore RULE and the corpus DIRECTORIES are still asserted by the two tests ' +
          'above, which run everywhere. Only the byte-level provenance is out of reach.'),
    () => {
      // ⛔ THE ASSERTION THAT AN ABSENT PATH IS A REAL PATH — see the note on `blobAtHistoryRev`.
      // Everything else about these ten rows is checked against the record or against a pattern; this
      // is the only check that can tell a capture that exists from a filename somebody typed. The
      // blobs are read out of history, hashed, and discarded. Nothing is written to the tree: these
      // are third-party bitmaps and committing one back is the repair this whole arrangement refuses.
      const wrong: string[] = [];
      for (const r of ALL_CAPTURES) {
        const blob = blobAtHistoryRev(r.file);
        if (blob === null) {
          wrong.push(
            `${r.file}: NOTHING WAS EVER COMMITTED AT THIS PATH — \`git show ${HISTORY_REV}:${r.file}\` ` +
              'finds no blob. The record publishes a sha256, a byte count and four measurements for a ' +
              'file this repository has never held. Either the path is stale (the corpus was renamed ' +
              'or re-fetched and the record was not republished) or the row is fabricated.',
          );
          continue;
        }
        const sha = createHash('sha256').update(blob).digest('hex');
        if (sha !== r.sha256) {
          wrong.push(`${r.file}: the blob at ${HISTORY_REV} hashes to ${sha}, the record publishes ${r.sha256}`);
        }
        if (blob.length !== r.bytes) {
          wrong.push(`${r.file}: the blob at ${HISTORY_REV} is ${blob.length} bytes, the record publishes ${r.bytes}`);
        }
      }
      expect(
        wrong,
        'the published capture rows are not the files this repository untracked in ' +
          `${PUBLISHED_REF.corpus.untrackedInCommit}:\n  ${wrong.join('\n  ')}\n` +
          'This is the check that distinguishes a deliberately absent file from a path that never ' +
          'existed — `.gitignore` matching cannot, because its rule is a directory glob and matches ' +
          'any invented name underneath it just as well.',
      ).toEqual([]);
    },
  );

  it('build-doc §8.4 still quotes the bands this gate derives', () => {
    // The half that catches a DOCUMENT drifting from its own evidence. §8.4 states these figures as
    // measurements of the eight Gold captures; the captures are gone from every clone, so without
    // this the doc's numbers would be the only surviving copy and nothing would ever compare them
    // with the record they came from. Matching is on the NUMBERS, built from the constants — a
    // reword survives, a changed figure does not.
    const doc = readFileSync(resolve(REPO_ROOT, 'docs/build-doc.md'), 'utf8');
    const quoted: { what: string; token: string }[] = [
      { what: 'the colour band extremes', token: `${GOLD_BAND_LOW} to ${GOLD_BAND_HIGH}` },
      { what: 'the colour band mean', token: `mean ${GOLD_BAND_MEAN.toFixed(1)}` },
      {
        what: "the gate's own edge band, quoted in the withdrawal note as GOLD_EDGE_LOW / HIGH / MEAN",
        token: `${GOLD_EDGE_LOW.toFixed(1)} / ${GOLD_EDGE_HIGH.toFixed(1)} / ${GOLD_EDGE_MEAN.toFixed(1)}`,
      },
      {
        what: 'the edge band as the advisory prints it',
        token: `${GOLD_EDGE_LOW.toFixed(0)}–${GOLD_EDGE_HIGH.toFixed(0)}%, mean ${GOLD_EDGE_MEAN.toFixed(1)}`,
      },
      { what: 'the independently reported Gold alternation', token: `${REPORTED_GOLD_ALT}%` },
    ];
    const stale = quoted.filter((q) => !doc.includes(q.token));
    expect(
      stale.map((q) => `${q.what}: docs/build-doc.md no longer contains "${q.token}"`),
      'docs/build-doc.md has drifted from the measurements it says it derived:\n  ' +
        stale.map((q) => `${q.what} — expected the text "${q.token}"`).join('\n  ') +
        '\nEither the band moved and the document was not updated, or the document was reworded ' +
        'through a figure. The captures these numbers come from are not in any clone (see the ' +
        'published record), so the document and the gate are the only two copies left and they must ' +
        'agree. Fix the document — do not delete this assertion.',
    ).toEqual([]);
  });

  it('the alternation operator reproduces the figure it was validated against', () => {
    // Two operators, two sessions, TWO REGIONS, one number. The third of those was missing here and
    // it changes what this proves: `GOLD_ALT_MEAN` is eight whole captures, `REPORTED_GOLD_ALT` is
    // Gold ground, so their agreement is a coincidence of unlike quantities rather than corroboration
    // — see the ⚠ note at the constants. The assertion is still worth keeping, and is unchanged: it
    // pins the AGREEMENT, not the value: if either side re-measures and the two stop matching, that
    // is exactly when somebody needs to look,
    // because a figure whose instrument has silently moved is how this project got two answers for
    // one property twice already.
    expect(
      Math.abs(GOLD_ALT_MEAN - REPORTED_GOLD_ALT),
      `this file's alternation operator makes ${GOLD_ALT_MEAN}% of the eight Gen-2 captures; the art ` +
        `session independently reports ${REPORTED_GOLD_ALT}% for Gold ground with an operator of ` +
        'their own. They no longer agree. Re-measure BOTH and republish each with its operator ' +
        'attached before either figure is quoted anywhere — do not simply move this constant.',
    ).toBeLessThan(2);
  });

  it('the ground-texture reading discriminates — and §8.2\'s Sobel, measured, does NOT', () => {
    // The control that makes the advisory worth reading. A reading that answered the same number for
    // a flat fill and for a dithered ground would look exactly like a clean bill of health, and the
    // obvious instrument to have reused does precisely that: a 3×3 Sobel cancels on a period-2
    // checkerboard, because the x±1 samples in each row share parity. Measured here rather than
    // asserted in a comment, because the comment above this file's `edgePercent` claims it.
    //
    // ⚠ DIGIT COLLISION, and it is a trap for whoever reads this output next. At this 128² build
    // `edgePercent` reads flat at 0.78% — the SAME TWO DIGITS as the Sobel pair below it (0.78 /
    // 0.78). Three 0.78s, two different operators, inside one control about how they DIFFER. They
    // are not agreeing: the Sobel is structurally blind, while `edgePercent` is reading an image
    // that genuinely is nearly flat. At 256² with the object box scaled to 96-160 the same operator
    // reads 0.39 / 93.94 and the collision disappears, which is the build the docs quote.
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

  it('THE GROUND READING discriminates — flat, pooled, interleaved, Gold, and object-heavy', () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // THE MOST IMPORTANT TEST IN THIS FILE. It is the only part that proves the reading can see
    // what it claims to measure, and it exists because FOUR instruments have now been proposed for
    // this property and three of them were wrong:
    //
    //   1. §8.2's Sobel                — blind to a one-pixel dither (asserted, one test above)
    //   2. luminance-threshold edges   — at the mercy of the threshold; 28.2 points vs 3.2
    //   3. colour concentration alone  — blind to ARRANGEMENT, which is cases B and C below
    //   4. the three together          — what ships, and what these four cases bind
    //
    // Case B against case C is the one that killed instrument 3, and it is built so that it cannot
    // be argued with: both images come from the SAME index function over the same three colours,
    // evaluated on 8px blocks for B and per pixel for C. Their histograms are therefore the same to
    // three decimal places, so concentration, distinct count and top-three share are all IDENTICAL,
    // and only the arrangement differs. One of them is a flat field with three regions in it; the
    // other is what Gold's grass does.
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    const N = 256;
    const GROUND: ReadonlyArray<readonly [number, number, number]> = [
      [58, 90, 42],
      [86, 122, 60],
      [40, 72, 32],
    ];
    /** Deterministic, never Math.random (G11). Each colour takes a third of any full period. */
    const pick = (u: number, v: number): readonly [number, number, number] => GROUND[(u + 2 * v) % 3]!;
    const BLOCK_PX = 8;
    /**
     * Case E's furniture: seven of the sixteen 64² cells filled with dense keyline object, the rest
     * left as flat ground. Seven of sixteen is chosen so that GROUND still wins the median patch
     * (nine cells) while objects carry a large share of the whole-image pixel count — which is
     * exactly the shape of a real map, and exactly the shape that makes a whole-image edge figure
     * look like texture the ground does not have.
     */
    const OBJECT_CELLS = new Set(['0,0', '1,0', '2,0', '0,1', '3,1', '1,2', '2,3']);
    const KEYLINE: ReadonlyArray<readonly [number, number, number]> = [
      [40, 30, 24],
      [150, 120, 80],
      [90, 70, 50],
      [20, 16, 12],
    ];
    const paint = (kind: 'flat' | 'pooled' | 'interleaved' | 'objects'): Buffer => {
      const b = Buffer.alloc(N * N * 4);
      for (let y = 0; y < N; y += 1) {
        for (let x = 0; x < N; x += 1) {
          const c =
            kind === 'objects'
              ? OBJECT_CELLS.has(`${Math.floor(x / GROUND_PATCH_PX)},${Math.floor(y / GROUND_PATCH_PX)}`)
                ? KEYLINE[(x * 3 + y * 5) % 4]!
                : GROUND[0]!
              : kind === 'flat'
              ? GROUND[0]!
              : kind === 'pooled'
                ? pick(Math.floor(x / BLOCK_PX), Math.floor(y / BLOCK_PX))
                : pick(x, y);
          const i = (y * N + x) * 4;
          b[i] = c[0];
          b[i + 1] = c[1];
          b[i + 2] = c[2];
          b[i + 3] = 255;
        }
      }
      return b;
    };

    // Case D is not a synthetic: it is the eight real Gen-2 captures, already re-measured against
    // the published band by `the reference captures still measure what the band quotes them as
    // measuring`. Here it enters as the recorded table, which that test holds to the live pixels.
    const goldAlts = GOLD_CAPTURES.map((r) => r.alt);
    const goldConcs = GOLD_CAPTURES.map((r) => r.conc);

    const flat = groundReading(paint('flat'), N, N);
    const pooled = groundReading(paint('pooled'), N, N);
    const interleaved = groundReading(paint('interleaved'), N, N);
    const objectHeavy = paint('objects');
    const objectGround = groundReading(objectHeavy, N, N);
    const objectWhole = edgePercent(objectHeavy, N, N);

    /* ── A. FLAT FILL — one colour ────────────────────────────────────────────────────────────── */
    expect(flat.effective, 'A flat fill: one colour must read exactly 1.00 effective colours').toBeCloseTo(1, 6);
    expect(flat.alternationPct, 'A flat fill: no two neighbours differ, so alternation must be 0%').toBeCloseTo(0, 6);
    expect(
      flat.effective,
      `A flat fill reads ${flat.effective.toFixed(2)} effective colours, inside the Gold band ` +
        `${concBandLabel}. A blank rectangle passing as Gold-like ground is the degenerate case this ` +
        'reading exists to refuse.',
    ).toBeLessThan(GOLD_CONC_LOW);
    expect(flat.alternationPct, 'A flat fill sits inside the alternation band').toBeLessThan(GOLD_ALT_LOW);
    // The inversion that is the whole reason the published reading is a COUNT and not the share the
    // settling measurement was quoted in: on the SHARE the blank rectangle wins outright.
    //
    // ⚠ **THIS ASSERTED `flat.topThreePct >= interleaved.topThreePct` AND THAT COMPARISON COULD NOT
    // FAIL.** Measured, both sides read exactly 100.00 — 1.000×, no sign at all. `GROUND` holds
    // THREE colours, so a top-THREE share is 100% for every synthetic built from it, the flat fill
    // and the per-pixel weave alike; the comparison was a literal against the same literal wearing
    // a different variable name. The claim it was making is the one 7525041's own message states —
    // "a blank rectangle scores 100% on top-three share, beating Gold's 78.9%" — and `interleaved`
    // was never able to stand in for Gold's 78.9%, because it saturates.
    //
    // So the comparison is replaced by the general form of the same claim, which is stronger than
    // "beats 78.9" and which a partner image is not needed to state: **the share has its MAXIMUM at
    // the degenerate image.** 100% is the algebraic ceiling of a share — nothing can score better
    // than a blank field — exactly as 1.00 is the floor of `1/Σpᵢ²`, asserted three lines above.
    // The two ends together ARE the inversion: same image, first on the share, last on the count.
    // This one reds if `patchProfile.topThreePct` ever stops being maximal on a flat patch — an
    // off-by-one in the `ranked` slice, a wrong denominator, or a share reported so that flatness
    // is penalised. That is a failure it can have; the old one had none.
    expect(
      flat.topThreePct,
      `a flat fill reads ${flat.topThreePct.toFixed(2)}% on the top-three SHARE rather than the 100% ` +
        'ceiling. The share being MAXIMAL on a blank field is the whole reason the published reading ' +
        'is an effective COUNT, so either the share operator is broken or the first trap has changed ' +
        'shape — re-measure before touching anything.',
    ).toBe(100);
    // …and the other end of the same image, which is what makes it an inversion rather than one
    // reading: on the published COUNT the blank field comes LAST. This half was always real —
    // 1.0000 against 3.0000 — and is untouched.
    expect(flat.effective, 'and on the published reading the blank field must come LAST').toBeLessThan(
      interleaved.effective,
    );

    /* ── B vs C. SAME HISTOGRAM, OPPOSITE ARRANGEMENT ─────────────────────────────────────────── */
    // First prove the premise: if these two did NOT share a histogram, the comparison after it would
    // prove nothing at all.
    expect(
      Math.abs(pooled.effective - interleaved.effective),
      `the pooled (${pooled.effective.toFixed(4)}) and interleaved (${interleaved.effective.toFixed(4)}) ` +
        'synthetics no longer share a histogram, so they no longer isolate ARRANGEMENT. Rebuild them ' +
        'from one index function before reading anything below.',
    ).toBeLessThan(0.01);
    expect(pooled.topThreePct, 'pooled and interleaved must have the same top-three share').toBeCloseTo(
      interleaved.topThreePct,
      6,
    );

    // …and now the failure that concentration alone cannot see. Three colours in large flat patches
    // score as well as three colours interleaved per pixel on EVERY histogram measure; alternation
    // is the only one of the three numbers that separates them, and it separates them by ~9×.
    expect(
      pooled.alternationPct,
      `three colours pooled into ${BLOCK_PX}px blocks read ${pooled.alternationPct.toFixed(2)}% ` +
        'alternation — a flat field with regions in it must read LOW, because its neighbours mostly ' +
        'match. This is the case that disqualified concentration on its own.',
    ).toBeLessThan(20);
    expect(
      interleaved.alternationPct,
      `the same three colours interleaved per pixel read ${interleaved.alternationPct.toFixed(2)}%; a ` +
        'weave whose every neighbour differs must read HIGH',
    ).toBeGreaterThan(80);
    expect(
      interleaved.alternationPct / Math.max(pooled.alternationPct, 0.01),
      'pooled and interleaved are not separated by a wide margin; alternation is not seeing ' +
        'arrangement, and with it blind the reading is back to being a histogram',
    ).toBeGreaterThan(4);

    /* ── D. GOLD'S OWN CAPTURES ───────────────────────────────────────────────────────────────── */
    // Gold must land between the two synthetic extremes on alternation — a real dithered ground is
    // neither a pooled field nor a perfect checkerboard — and its concentration must sit in the
    // small-palette regime rather than at the flat floor.
    const goldAltMean = goldAlts.reduce((a, b) => a + b, 0) / goldAlts.length;
    expect(
      goldAltMean,
      `Gold's eight captures average ${goldAltMean.toFixed(2)}% alternation, at or below the ` +
        `${pooled.alternationPct.toFixed(2)}% a POOLED field reads. Either the captures moved or the ` +
        'operator is not measuring arrangement.',
    ).toBeGreaterThan(pooled.alternationPct);
    expect(
      goldAltMean,
      `Gold averages ${goldAltMean.toFixed(2)}%, at or above the ${interleaved.alternationPct.toFixed(2)}% ` +
        'of a per-pixel weave. Real ground is not a perfect checkerboard; a reading that says it is ' +
        'has saturated.',
    ).toBeLessThan(interleaved.alternationPct);
    expect(
      Math.min(...goldConcs),
      'a Gold capture reads at or below the flat floor on concentration',
    ).toBeGreaterThan(flat.effective);

    /* ── E. FLAT GROUND, DENSE OBJECTS — THE REGION FAULT, NOT THE OPERATOR FAULT ─────────────── */
    // The second error the art session separated, and it is about WHERE a number is measured rather
    // than HOW. Their dither read ~~44.74%~~ across a whole map and ~~6.89%~~ on the ground alone —
    // the same image, six-fold apart, the gap entirely furniture.
    //
    // ⚠ BOTH figures are WITHDRAWN. They are one unpublished operator pointed at two regions, and the
    // withdrawal is on the operator, not on an enumerated set of numbers — THE WITHDRAWN-OPERATOR
    // RULE, file header. An earlier revision of this comment recorded 6.89% as "not named in that
    // withdrawal, and OPEN"; not being named is not a clean bill of health, and that is the whole
    // reason the rule is now stated as a property of the instrument.
    //
    // THE ARGUMENT IS UNTOUCHED — a whole-map aggregate is not a ground measurement, because objects
    // are keyline-dense and carry the figure upward — and THIS CASE is what may be cited for it:
    // 44.34% whole-image against 0.00% ground, measured right here, on a synthetic built for it, with
    // the operator attached. That is why the case exists and why the withdrawn quotation was never
    // the load-bearing part. `edgePercent` walks every pixel, so it carries that fault by
    // construction; the ground reading takes a median over patches, so it does not. This case pins
    // the difference so the two can never quietly be read as one property again.
    expect(
      objectWhole,
      `flat ground with dense objects reads ${objectWhole.toFixed(2)}% WHOLE-IMAGE edge. It must read ` +
        'HIGH — that is the whole point: objects are keyline-dense and a whole-image operator counts ' +
        'them. If this fell, the synthetic stopped containing objects and case E proves nothing.',
    ).toBeGreaterThan(40);
    expect(
      objectGround.alternationPct,
      `the same image reads ${objectGround.alternationPct.toFixed(2)}% GROUND-PATCH alternation. It ` +
        'must read LOW: the ground is flat, and a reading that calls it textured is reporting the ' +
        'buildings. If these two ever converge, one of them is not measuring the region its name says.',
    ).toBeLessThan(5);
    expect(
      objectGround.effective,
      'and the ground concentration of a flat ground must still be the flat floor, objects or not',
    ).toBeCloseTo(1, 6);

    // …and the control that proves the gap above is REGION and not operator. Both readings count
    // colour changes, so on a UNIFORM image — no objects, one material everywhere — they must agree.
    // Without this, case E could be explained away as two operators simply disagreeing.
    const uniformWhole = edgePercent(paint('interleaved'), N, N);
    expect(
      Math.abs(uniformWhole - interleaved.alternationPct),
      `on a uniform image the whole-image (${uniformWhole.toFixed(2)}%) and ground-patch ` +
        `(${interleaved.alternationPct.toFixed(2)}%) readings disagree. They count the same thing, so ` +
        'a gap here means the operators differ — and case E above would then be measuring that, not ' +
        'the region.',
    ).toBeLessThan(1);
    expect(
      Math.abs(objectWhole - objectGround.alternationPct),
      'the object-heavy image does not separate the two regions, so nothing distinguishes a ' +
        'whole-image figure from a ground figure and the advisory may as well print one number',
    ).toBeGreaterThan(30);

    /* ── AND A BROKEN READING MUST NOT LOOK LIKE A PASS ───────────────────────────────────────── */
    // `1 / Σ pᵢ²` is ≥ 1 for any non-empty patch, so anything below 1 — 0.0 most of all — is the
    // instrument having failed, never a flatter picture. The advisory asserts the same floor per
    // file. Alternation has no such algebraic floor above zero, which is exactly why a constant 0.0
    // there is caught by case C above instead.
    for (const [label, r] of [['flat', flat], ['pooled', pooled], ['interleaved', interleaved]] as const) {
      expect(Number.isFinite(r.effective), `${label}: concentration is not a finite number`).toBe(true);
      expect(Number.isFinite(r.alternationPct), `${label}: alternation is not a finite number`).toBe(true);
      expect(
        r.effective,
        `${label}: concentration below 1.0 is a broken instrument, not a flat image`,
      ).toBeGreaterThanOrEqual(1);
      expect(r.patches, `${label}: measured over zero patches`).toBeGreaterThan(0);
    }

    const row = (label: string, conc: number, alt: number, tail: string): string =>
      `  ${label.padEnd(34)} conc ${conc.toFixed(4).padStart(8)}  alt ${alt.toFixed(2).padStart(6)}%  ${tail}\n`;
    console.log(
      '\nasset-palette-contract — GROUND READING, the cases\n' +
        row('A flat fill', flat.effective, flat.alternationPct, `top3 ${flat.topThreePct.toFixed(2)}%`) +
        row(
          `B three colours, ${BLOCK_PX}px blocks`,
          pooled.effective,
          pooled.alternationPct,
          `top3 ${pooled.topThreePct.toFixed(2)}%`,
        ) +
        row(
          'C the same three, interleaved',
          interleaved.effective,
          interleaved.alternationPct,
          `top3 ${interleaved.topThreePct.toFixed(2)}%`,
        ) +
        row(
          `D Gold, ${GOLD_CAPTURES.length} captures (means)`,
          GOLD_CONC_MEAN,
          goldAltMean,
          `band ${concBandLabel} / ${altBandLabel}`,
        ) +
        row(
          'E flat ground, dense objects',
          objectGround.effective,
          objectGround.alternationPct,
          `whole-image img-edge ${objectWhole.toFixed(2)}%`,
        ) +
        '  B and C share a histogram to three decimals. Concentration cannot tell them apart;\n' +
        '  alternation separates them ~9×. That is why the reading is three numbers and not one.\n' +
        '  E is the REGION fault, not the operator fault: one image, whole-image ' +
        `${objectWhole.toFixed(2)}% against\n  ground-patch ${objectGround.alternationPct.toFixed(2)}%. ` +
        'The gap is buildings. A whole-image edge figure is not a\n  ground measurement and the two ' +
        'may never be compared.\n' +
        OPERATOR_LEGEND +
        '\n',
    );
  });
  // ⛔ THE ONLY SKIP IN THIS FILE, AND IT IS NOT A SILENT ONE. It runs where `assets/reference/`
  // exists and is reported as SKIPPED — never as passed — where it does not, above a console banner
  // naming the reason. The reason itself is asserted by `the reference corpus is present in full, or
  // absent in full for the recorded reason`, which always runs: a partial corpus, a tracked file
  // gone missing, or a path no .gitignore rule matches all red there rather than skipping here.
  // The published figures are asserted in full, always, by the two tests above. What is skipped is
  // ONLY the claim that they still match pixels no clone has.
  // ⚠ The reason is carried in the TITLE and not only in the banner above, because vitest's default
  // reporter drops console output from a file with no failures — so on a green CI run the banner is
  // not printed and the title is the only place the skip can announce itself.
  it.skipIf(!CORPUS_COMPLETE)(
    'the reference captures still measure what the band quotes them as measuring' +
      (CORPUS_COMPLETE
        ? ''
        : ' — SKIPPED, CORPUS ABSENT: assets/reference/** is deliberately untracked third-party ' +
          'input and is in no clone. The published figures are still asserted in full by "the ' +
          'published reference record is internally consistent"; only the claim that they match the ' +
          'pixels is skipped, and the absence is asserted to be the recorded one.'),
    async () => {
    // THE ONE FAILURE THAT ACTUALLY HAPPENED. The first captures of these maps were browser
    // screenshots, resampled to 642×574 from a 320×288 source — not even a clean 2× — and they held
    // 673 to 2,080 distinct colours, every one of them invented by interpolation. A band derived from
    // those would have been wrong by two orders of magnitude, and the advisory would have gone on
    // printing an authoritative-looking comparison against it.
    //
    // ⚠ **AND AN ABSENT CAPTURE USED TO BE A HARD FAILURE HERE, ON A PREMISE THAT IS NO LONGER
    // TRUE.** This comment read: "Wrong on the facts — `git ls-files -- assets/reference` lists all
    // ten of these PNGs, so they are committed repo content." It did, and they were. Then
    // `.gitignore` gained `assets/reference/**` on the owner's instruction — Nintendo's own tile and
    // UI bitmaps, pipeline input, never redistributed — and commit 1da8cf0 untracked all ten with
    // `git rm --cached`. They stayed on this disk and left every clone. The assertion built on the
    // old premise then failed on every CI run, naming ten files nobody could restore, and a red that
    // cannot go green is not evidence about anything.
    //
    // What the old comment got exactly right, and what is preserved: with the directory moved aside
    // the whole file once read **42 passed (42)**, because a `continue` over a missing file skips
    // every assertion under it and nothing counted what had been checked. **A skip is not a pass.**
    // So the corpus is still asserted COMPLETE before anything is measured — this arm never runs on
    // a partial one — the count is still pinned, and `checked` is still asserted against it. What
    // changed is only WHERE the absence is handled: `it.skipIf` above, over a condition that the
    // always-running `the reference corpus is present in full, or absent in full for the recorded
    // reason` proves is the deliberate one.
    //
    // ⚠ **AND THE PER-FILE FIGURES ARE NOW ASSERTED, WHICH THEY NEVER WERE.** The recorded columns
    // were printed in the message and used to derive the bands — never compared with the pixels. A
    // row whose conc was typed as 3.37 when the file measures 3.31 would have passed here forever
    // and moved the band mean the day someone re-derived it. Equality with the published row is
    // asserted first, then membership of the band: the first catches the record drifting from the
    // art, the second catches the band drifting from the record.
    //
    // Deliberately NOT extended to "every PNG under assets/reference/ must appear in a table" —
    // `gen2-ui/` is the ui-frames lane's (tools/ui-frames/raster.ts), and reaching into it would red
    // on somebody else's directory for no defect here.
    const checked: string[] = [];
    const missing = ALL_CAPTURES.map((r) => r.file).filter((f) => !existsSync(resolve(REPO_ROOT, f)));
    expect(
      missing,
      `${missing.length} of the ${ALL_CAPTURES.length} reference captures are absent, and this arm ` +
        'ran anyway. `it.skipIf(!CORPUS_COMPLETE)` above exists precisely so that cannot happen — ' +
        'if this fires, the completeness gate and the skip condition have parted company and every ' +
        'band below is being verified over a subset without saying so.',
    ).toEqual([]);
    expect(
      ALL_CAPTURES.length,
      `the capture tables hold ${ALL_CAPTURES.length} rows, not the pinned ` +
        `${REFERENCE_CAPTURE_COUNT}. The arm can be emptied from either side — the PNGs can leave ` +
        'the tree or the rows can leave the tables — and a floor of one would not notice the second.',
    ).toBe(REFERENCE_CAPTURE_COUNT);

    // ⛔ THE CORPUS IS THE ONE THE FIGURES WERE MEASURED OVER, byte for byte. Without this a
    // refetched or re-cropped capture would be measured, land inside the band, and quietly certify
    // a published row that was never taken from it — which is the "resampled screenshot" failure
    // this test was written for, wearing a legitimate-looking file name.
    const wrongPixels = ALL_CAPTURES.filter((r) => sha256Of(r.file) !== r.sha256).map(
      (r) => `${r.file}: on disk ${sha256Of(r.file)}, published ${r.sha256}`,
    );
    expect(
      wrongPixels,
      'a reference capture on disk is not the image the published figures were measured over:\n  ' +
        wrongPixels.join('\n  ') +
        '\nThe published row is a measurement OF SPECIFIC BYTES. Re-measure the whole corpus and ' +
        'republish tools/artverify/published-measurements.json — including the sha256 — rather than ' +
        'assuming the new file measures like the old one.',
    ).toEqual([]);

    /** Every figure is published to two decimals; compare at that precision, not at float exactness. */
    const at2 = (v: number): number => Number(v.toFixed(2));

    for (const ref of GOLD_CAPTURES) {
      const m = await referenceColours(ref.file);
      checked.push(
        `${ref.file} ${m.width}×${m.height} ${m.colours}c (rec ${ref.colours}) ` +
          `edge ${m.edge.toFixed(2)}% (rec ${ref.edge.toFixed(2)}%) ` +
          `conc ${m.conc.toFixed(2)} (rec ${ref.conc.toFixed(2)}) ` +
          `alt ${m.alt.toFixed(2)}% (rec ${ref.alt.toFixed(2)}%)`,
      );
      // EQUALITY FIRST. The band assertions below say "this capture is still Gold-like"; this one
      // says "the published row is still true of this file". Only the second can catch a figure
      // that was mistyped, or re-measured under a changed operator and never republished — and the
      // bands are derived from these rows, so a wrong row silently moves the band.
      expect(
        {
          colours: m.colours,
          edge: at2(m.edge),
          conc: at2(m.conc),
          alt: at2(m.alt),
          width: m.width,
          height: m.height,
          bytes: m.bytes,
        },
        `${ref.file} no longer measures what tools/artverify/published-measurements.json publishes ` +
          'for it. The bands in this file are DERIVED from that row, so this figure moving moves the ' +
          'band. Re-measure the whole corpus, republish the record (the console line below is the ' +
          'measurement), and re-derive the bands — do not edit one row to make this green.',
      ).toEqual({
        colours: ref.colours,
        edge: at2(ref.edge),
        conc: at2(ref.conc),
        alt: at2(ref.alt),
        width: ref.width,
        height: ref.height,
        bytes: ref.bytes,
      });
      expect(
        m.conc,
        `${ref.file} reads ${m.conc.toFixed(2)} effective colours per median patch, outside the band ` +
          `${concBandLabel} the eight Gold captures define. Same rule as the other two bands: either ` +
          'this capture was refetched from a different source, or the band needs re-deriving.',
      ).toBeGreaterThanOrEqual(GOLD_CONC_LOW);
      expect(m.conc, `${ref.file}: ${m.conc.toFixed(2)} effective colours, above ${concBandLabel}`).toBeLessThanOrEqual(
        GOLD_CONC_HIGH,
      );
      expect(
        m.alt,
        `${ref.file} reads ${m.alt.toFixed(2)}% alternation, outside the band ${altBandLabel} the eight ` +
          'Gold captures define. This is also the guard on the cross-operator agreement: the band ' +
          `mean ${GOLD_ALT_MEAN}% is what matches the ${REPORTED_GOLD_ALT}% reported independently, ` +
          'so a capture drifting here moves a figure two sessions currently agree on.',
      ).toBeGreaterThanOrEqual(GOLD_ALT_LOW);
      expect(m.alt, `${ref.file}: ${m.alt.toFixed(2)}% alternation, above ${altBandLabel}`).toBeLessThanOrEqual(
        GOLD_ALT_HIGH,
      );
      expect(
        m.edge,
        `${ref.file} reads ${m.edge.toFixed(2)}% WHOLE-IMAGE edge density, outside the band ${edgeBandLabel} ` +
          'the ' +
          'eight Gold captures define. Either this capture was refetched from a different source, or ' +
          'the band needs re-deriving from the new measurements — it is not a defect in shipped art.',
      ).toBeGreaterThanOrEqual(GOLD_EDGE_LOW);
      expect(
        m.edge,
        `${ref.file}: ${m.edge.toFixed(2)}% WHOLE-IMAGE edge density, above ${edgeBandLabel}`,
      ).toBeLessThanOrEqual(
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
      const m = await referenceColours(ref.file);
      checked.push(
        `${ref.file} ${m.width}×${m.height} ${m.colours}c (rec ${ref.colours}) ` +
          `edge ${m.edge.toFixed(2)}% (rec ${ref.edge.toFixed(2)}%) ` +
          `conc ${m.conc.toFixed(2)} (rec ${ref.conc.toFixed(2)}) ` +
          `alt ${m.alt.toFixed(2)}% (rec ${ref.alt.toFixed(2)}%)`,
      );
      // Same equality as the Gold rows. The control is only a control while its published figures
      // are true of the file — a Gen-3 row that drifted toward the Gold band and was never
      // re-published would turn the discrimination test below into a tautology.
      expect(
        {
          colours: m.colours,
          edge: at2(m.edge),
          conc: at2(m.conc),
          alt: at2(m.alt),
          width: m.width,
          height: m.height,
          bytes: m.bytes,
        },
        `${ref.file} no longer measures what tools/artverify/published-measurements.json publishes ` +
          'for it. These two rows are the discrimination control; re-measure and republish the whole ' +
          'record rather than editing one row.',
      ).toEqual({
        colours: ref.colours,
        edge: at2(ref.edge),
        conc: at2(ref.conc),
        alt: at2(ref.alt),
        width: ref.width,
        height: ref.height,
        bytes: ref.bytes,
      });
      expect(
        m.colours,
        `${ref.file} measures ${m.colours}; Gen 3 RSE was measured at ${ref.colours}, which is three ` +
          'times the Gold mean. If this one reads inside the Gold band, the counter is not ' +
          'discriminating and every figure in the advisory is suspect.',
      ).toBeGreaterThan(GOLD_BAND_HIGH);
      // The same control for the concentration reading, on the same footing. Gen 3 spends more
      // colour per patch than Gen 2 does; an instrument that answered "about three" for every piece
      // of pixel art would satisfy all eight Gold rows and be worthless.
      expect(
        m.conc,
        `${ref.file} reads ${m.conc.toFixed(2)} effective colours, inside the Gold band ` +
          `${concBandLabel}. Gen 3 was measured at ${ref.conc.toFixed(2)}; if it now reads Gold-like, ` +
          'this reading is not discriminating on real art and the advisory column is suspect.',
      ).toBeGreaterThan(GOLD_CONC_HIGH);
      // **Gen 3 is NOT a control for ALTERNATION, and pretending otherwise would be the same defect
      // this file keeps catching.** RSE reads 34.29% and 53.22% — squarely inside the Gold band —
      // because RSE dithers its ground too; the two generations differ in how much COLOUR they
      // spend, not in whether they interleave it. So nothing is asserted here on that axis, and the
      // control for alternation is the pooled-vs-interleaved synthetic pair instead, which isolates
      // arrangement by holding the histogram fixed. A control that does not discriminate is not a
      // weaker control, it is a false one.
    }

    // The count of what was actually measured, asserted rather than printed. The two guards above
    // make an absent file and a shrunken table red on their own; this one is the backstop against
    // the third shape — a loop that ran over fewer rows than the tables hold — and it is what turns
    // "the console said 10" into something the suite fails on. `checked` is appended once per row
    // in each loop, so it is the count of captures whose band assertions actually executed.
    expect(
      checked.length,
      `${checked.length} reference capture(s) were measured, not the pinned ` +
        `${REFERENCE_CAPTURE_COUNT}. Every band this file publishes is corroborated by exactly ` +
        'these measurements; a loop that ran over fewer rows than the tables hold leaves the ' +
        'difference asserting nothing at all.',
    ).toBe(REFERENCE_CAPTURE_COUNT);

    console.log(
      `\nasset-palette-contract — reference band ${bandLabel} (mean ${GOLD_BAND_MEAN.toFixed(1)}), ` +
        `whole-image edge ${edgeBandLabel} (mean ${GOLD_EDGE_MEAN.toFixed(1)}%), ` +
        `concentration ${concBandLabel} (mean ${GOLD_CONC_MEAN.toFixed(2)}), ` +
        `alternation ${altBandLabel} (mean ${GOLD_ALT_MEAN.toFixed(2)}%), ` +
        `${checked.length} of ${REFERENCE_CAPTURE_COUNT} capture(s) verified\n` +
        checked.map((l) => `  ${l}`).join('\n') +
        '\n  The corpus is asserted COMPLETE before anything is measured, and each capture is\n' +
        '  asserted to be the exact bytes its published row was taken from (sha256). These PNGs are\n' +
        '  the only source the four bands have, and they are in NO clone: the figures live in\n' +
        '  tools/artverify/published-measurements.json, which this run has just re-derived from the\n' +
        '  pixels. A tree without the corpus asserts that record in full and skips only this.\n' +
        OPERATOR_LEGEND +
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
          `img-edge ${d.edgePct.toFixed(1).padStart(5)}%${edgeFlag(d, isMap)}` +
          `conc ${d.conc.toFixed(2).padStart(6)}${concFlag(d, isMap)}` +
          `alt ${d.altPct.toFixed(1).padStart(5)}%${altFlag(d, isMap)}` +
          `top3 ${d.concTopThreePct.toFixed(1).padStart(5)}%  ` +
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
        // Same guard for the concentration column, and it is a real one rather than a formality:
        // `1 / Σ pᵢ²` cannot be below 1 for a patch that holds a pixel, so a 0.0 or a NaN in this
        // column is the measurement having broken — which, left unasserted, prints as the flattest
        // possible reading and reads exactly like a picture that needs work.
        expect(Number.isFinite(d.conc), `${path}: colour concentration is not a finite number`).toBe(true);
        expect(
          d.conc,
          `${path}: concentration ${d.conc} is below 1.0, which no image can be. The reading is broken, ` +
            'not the art — a flat fill reads exactly 1.00.',
        ).toBeGreaterThanOrEqual(1);
        expect(Number.isFinite(d.altPct), `${path}: alternation is not a finite number`).toBe(true);
        expect(d.altPct, `${path}: alternation ${d.altPct}% is outside 0–100`).toBeGreaterThanOrEqual(0);
        expect(d.altPct, `${path}: alternation ${d.altPct}% is outside 0–100`).toBeLessThanOrEqual(100);
        expect(d.concPatches, `${path}: the ground reading was taken over zero patches`).toBeGreaterThan(0);
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
        `${edgeBandLabel} whole-image edge (mean ${GOLD_EDGE_MEAN.toFixed(1)}%), ` +
        `${concBandLabel} effective colours per median 64² patch (mean ${GOLD_CONC_MEAN.toFixed(2)}), ` +
        `${altBandLabel} alternation (mean ${GOLD_ALT_MEAN.toFixed(2)}%).\n` +
        `  ${maps.length} shipped map(s) run ${spreadOf(maps.map((d) => d.swatches.size), 0)} colours, ` +
        `${spreadOf(maps.map((d) => d.edgePct), 1)}% whole-image edge, ` +
        `${spreadOf(maps.map((d) => d.conc), 2)} concentration ` +
        `and ${spreadOf(maps.map((d) => d.altPct), 1)}% alternation.\n` +
        '  ALL OF THESE ARE READING AIDS AND FAIL NOTHING, and they are separate facts, not one:\n' +
        '  dither buys edge density and does nothing to the colour count; a per-map subset buys colour\n' +
        '  discipline and does nothing to edge density; concentration separates a small palette used\n' +
        '  densely from continuous noise that merely LOOKS dithered, and is blind to arrangement;\n' +
        '  alternation is the arrangement axis and is blind to everything else. A patch reads as\n' +
        '  structured only with all three: a small palette, held densely, INTERLEAVED not pooled.\n' +
        '  REGION SPLITS THEM AGAIN: img-edge is WHOLE-IMAGE, conc/alt/top3 are GROUND-PATCH. A map can\n' +
        '  raise img-edge by adding buildings while its ground stays flat — one synthetic reads 44.34%\n' +
        '  whole-image and 0.00% ground — so the two groups never compare, in either direction.\n' +
        '  A cap on any of them is a number a generator can be tuned to hit while the picture gets\n' +
        '  worse — see the GOLD BAND, WHOLE-IMAGE EDGE and GROUND READING sections at the top of this\n' +
        '  file, and `tools/artverify/ground-comparison.png`, which a number cannot substitute for.\n' +
        '  ▼ on conc means FLATTER than Gold, ▲ mushier; ▼ on alt means POOLED where Gold interleaves.\n' +
        '  `top3` is printed beside conc and never instead of it — a blank rectangle scores 100% on the\n' +
        '  share, 1.00 on the count and 0.0% on alternation.\n' +
        '  The palette CONTAINS the region; one map USES a subset of it.\n' +
        OPERATOR_LEGEND +
        '\n',
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
