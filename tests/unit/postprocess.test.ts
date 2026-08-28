/**
 * tests/unit/postprocess.test.ts — build-doc §10.4's "postprocess idempotency".
 *
 * §9.3 ends with "Every step idempotent and re-runnable from raw/". That sentence has two halves
 * and they are different claims, so both are tested and neither is allowed to stand in for the
 * other:
 *
 *   STEP IDEMPOTENCE   f(f(x)) === f(x), byte for byte, for trim, downscale, quantize and
 *                      background removal, each on its own.
 *   RE-RUNNABLE        the whole chain, run from `assets/raw/` twice, writes byte-identical PNGs.
 *                      This is the one that actually protects the assets, because it is the thing
 *                      an operator does — and it is only true if the PNG ENCODER is deterministic
 *                      too, which is why the encoder options are pinned in raster.ts.
 *
 * And one claim §9.3 does NOT make, tested so nobody assumes it: the chain is not a fixed point
 * over its own output, and `processRow` refuses to be pointed at its own destination.
 *
 * The palette test is the gate-B0 one. It swaps in a DIFFERENT palette file and checks that quantize
 * follows the FILE rather than a compiled-in copy — which is what makes §8.4's freeze a value swap
 * and not a code change. That stopped being hypothetical while this was being written: gate B0
 * froze `data/palette.json` mid-session, from placeholder hexes to the k-means fit over the approved
 * trials, and nothing here needed to change. The test asserts the tool REPORTS the frozen flag
 * truthfully, not that it holds any particular value.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import type { Raster } from '../../tools/postprocess/raster.ts';
import { blankRaster, cloneRaster, idx, rastersEqual, readRaster, writeRaster } from '../../tools/postprocess/raster.ts';
import type { BackgroundOptions, Rgb } from '../../tools/postprocess/steps.ts';
import {
  WHITE,
  fitResample,
  nearestResample,
  quantize,
  removeFlatBackground,
  sampleBackgroundKey,
  trimBackground,
} from '../../tools/postprocess/steps.ts';
import type { PaletteRgb } from '../../tools/postprocess/palette.ts';
import { loadPalette, loadPaletteFile, parseHex, paletteIsFrozen, PALETTE_PATH, REPO_ROOT } from '../../tools/postprocess/palette.ts';
import {
  backgroundForClass,
  backgroundOf,
  classOf,
  finalPathOf,
  processRaster,
  processRow,
  rawPathOf,
  recipeFor,
} from '../../tools/postprocess/chain.ts';
import { toSprite } from '../../tools/comfy/player-views.ts';
import { atlasDescriptor, packAtlas } from '../../tools/postprocess/atlas.ts';
import { fontScale, makePlaceholder, placeholderLabel, wrapLabel } from '../../tools/postprocess/placeholder.ts';
import { loadManifest, type ClassSpec, type ManifestFile, type ManifestRow } from '../../tools/comfy/comfy-batch.ts';
import { writePlaceholders, writeStandInDeclaration } from '../../tools/postprocess/run.ts';

const PALETTE = loadPalette();

let tmp: string;
let manifest: ManifestFile;
/**
 * The background key + tolerance THIS FILE keys on, read from the manifest like every other call
 * site. Not `{ key: WHITE, tolerance: 12 }`: a test that carries its own copy of the number
 * is one more place it can drift, and the whole point of the section at the bottom is that the
 * number has exactly one home. Assigned in `beforeAll` because the manifest read is async.
 */
let BG: BackgroundOptions;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'trophic-postprocess-'));
  manifest = await loadManifest();
  BG = await backgroundForClass('player');
});
afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Fixtures — deterministic, closed-form, no Math.random (G11).
 * ──────────────────────────────────────────────────────────────────────────── */

function px(r: Raster, x: number, y: number, [red, g, b, a]: [number, number, number, number]): void {
  const i = idx(r, x, y);
  r.data[i] = red;
  r.data[i + 1] = g;
  r.data[i + 2] = b;
  r.data[i + 3] = a;
}

/** A 1024²-shaped stand-in for a raw generation: a subject on plain white, off-centre. */
function rawSprite(size = 128): Raster {
  const r = blankRaster(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) px(r, x, y, [255, 255, 255, 255]);
  const x0 = Math.floor(size * 0.28);
  const y0 = Math.floor(size * 0.2);
  const w = Math.floor(size * 0.34);
  const h = Math.floor(size * 0.52);
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const body: [number, number, number, number] = [
        40 + ((x * 7) % 160),
        30 + ((y * 5) % 170),
        60 + ((x + y) % 140),
        255,
      ];
      px(r, x, y, body);
    }
  }
  // A white highlight ENCLOSED by the subject — a colour-keyed matte would punch a hole here.
  for (let y = y0 + 6; y < y0 + 12; y++) for (let x = x0 + 6; x < x0 + 12; x++) px(r, x, y, [255, 255, 255, 255]);
  return r;
}

function distinctColours(r: Raster): Set<number> {
  const s = new Set<number>();
  for (let i = 0; i < r.data.length; i += 4) {
    s.add((r.data[i]! << 24) | (r.data[i + 1]! << 16) | (r.data[i + 2]! << 8) | r.data[i + 3]!);
  }
  return s;
}

/* ════════════════════════════════════════════════════════════════════════════
 * Step idempotence — each step, on its own
 * ════════════════════════════════════════════════════════════════════════════ */

describe('§9.3 steps are individually idempotent', () => {
  const src = rawSprite();

  it('trim: the second pass finds nothing left to trim', () => {
    const once = trimBackground(src, BG);
    const twice = trimBackground(once, BG);
    expect(once.width).toBeLessThan(src.width);
    expect(rastersEqual(once, twice)).toBe(true);
  });

  it('trim is stable even when the trimmed border is mostly subject — the sampled-key failure', () => {
    // A subject that fills all but one row/column. A median-border key would read a SUBJECT colour
    // on the second pass and eat the sprite; the declared white key cannot.
    const r = blankRaster(16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(r, x, y, [255, 255, 255, 255]);
    for (let y = 1; y < 16; y++) for (let x = 1; x < 16; x++) px(r, x, y, [10, 20, 30, 255]);
    const once = trimBackground(r, BG);
    expect(once.width).toBe(15);
    expect(rastersEqual(trimBackground(once, BG), once)).toBe(true);
    // …and the diagnostic sampler really would have read a subject colour, which is the point.
    expect(sampleBackgroundKey(once)).toEqual({ r: 10, g: 20, b: 30 });
  });

  it('downscale: resampling something already at target is the identity', () => {
    const once = fitResample(src, 96, 96);
    const twice = fitResample(once, 96, 96);
    expect(once.width).toBe(96);
    expect(rastersEqual(once, twice)).toBe(true);
    expect(rastersEqual(nearestResample(once, 96, 96), once)).toBe(true);
  });

  it('quantize: every palette colour is its own nearest neighbour', () => {
    const once = quantize(src, PALETTE);
    const twice = quantize(once, PALETTE);
    expect(rastersEqual(once, twice)).toBe(true);
  });

  it('quantize emits ONLY palette colours', () => {
    const out = quantize(src, PALETTE);
    const allowed = new Set(PALETTE.map((c) => (c.r << 16) | (c.g << 8) | c.b));
    for (let i = 0; i < out.data.length; i += 4) {
      expect(allowed.has((out.data[i]! << 16) | (out.data[i + 1]! << 8) | out.data[i + 2]!)).toBe(true);
    }
  });

  it('background removal: an already-transparent border is still background', () => {
    const once = removeFlatBackground(src, BG);
    const twice = removeFlatBackground(once, BG);
    expect(rastersEqual(once, twice)).toBe(true);
    expect(once.data[idx(once, 0, 0) + 3]).toBe(0);
  });

  it('background removal keeps a white highlight that the subject encloses', () => {
    const out = removeFlatBackground(src, BG);
    const inside = idx(out, Math.floor(128 * 0.28) + 8, Math.floor(128 * 0.2) + 8);
    expect(out.data[inside + 3]).toBe(255);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The chain, from raw/, twice
 * ════════════════════════════════════════════════════════════════════════════ */

describe('the chain is re-runnable from assets/raw/ (§9.3)', () => {
  it('the PNG encoder itself is deterministic — without that, nothing below is true', async () => {
    const r = rawSprite(64);
    const a = join(tmp, 'enc-a.png');
    const b = join(tmp, 'enc-b.png');
    await writeRaster(a, r);
    await writeRaster(b, r);
    expect(await readFile(a)).toEqual(await readFile(b));
    expect(rastersEqual(await readRaster(a), r)).toBe(true);
  });

  it('running processRow twice from the same raw file writes identical bytes', async () => {
    const row = manifest.rows.find((r) => r.class === 'creature-battle')!;
    const raw = rawPathOf(manifest, row, tmp);
    await mkdir(dirname(raw), { recursive: true });
    await writeRaster(raw, rawSprite(256));

    const first = await processRow(manifest, row, { root: tmp, palette: PALETTE });
    expect(first.skipped).toBeUndefined();
    const bytes1 = await readFile(first.to);
    await processRow(manifest, row, { root: tmp, palette: PALETTE });
    const bytes2 = await readFile(first.to);
    expect(bytes2).toEqual(bytes1);

    const out = await readRaster(first.to);
    expect(`${out.width}x${out.height}`).toBe(row.targetSize);
  });

  it('a row with no raw file is skipped, not faked', async () => {
    const row = manifest.rows.find((r) => r.id === 'trainer-maren')!;
    const res = await processRow(manifest, row, { root: join(tmp, 'empty'), palette: PALETTE });
    expect(res.skipped).toBe('no-raw-file');
  });

  it('refuses to run over its own output — the chain is not a fixed point (see chain.ts)', async () => {
    const row = manifest.rows.find((r) => r.class === 'creature-battle')!;
    const selfRow: ManifestRow = { ...row, file: row.finalFile };
    await expect(processRow(manifest, selfRow, { root: tmp, palette: PALETTE })).rejects.toThrow(/same path/);
  });

  it('the map recipe matches §9.3: quantize, size retained, NO background removal, no trim', () => {
    for (const cls of ['map-town', 'map-route', 'map-site', 'map-variant']) {
      const spec = classOf(manifest, cls);
      expect(spec.postprocess.removeBackground, cls).toBe(false);
      expect(spec.postprocess.quantize, cls).toBe(true);
      expect(spec.postprocess.trim, cls).toBe(false);
      expect(spec.targetW).toBe(1024);
      expect(spec.targetH).toBe(1024);
    }
  });

  it('a map keeps its own frame and its opacity through the chain', () => {
    const map = blankRaster(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) px(map, x, y, [255, 255, 255, 255]);
    px(map, 4, 4, [10, 90, 20, 255]);
    const recipe = { ...recipeFor(classOf(manifest, 'map-town')), targetW: 64, targetH: 64 };
    const out = processRaster(map, recipe, PALETTE);
    expect(out.width).toBe(64);
    for (let i = 3; i < out.data.length; i += 4) expect(out.data[i]).toBe(255);
  });

  it('sprite classes letterbox instead of stretching', () => {
    // `nearestResample` maps each axis independently, so the approved player (content aspect
    // 0.574) forced into 32×48 (0.667) came out 1.16× too wide.
    // The fix is per-class policy, not a code branch: every class whose sprite
    // is a subject on a background sets `fit: true`, which preserves aspect and pads.
    for (const cls of ['player', 'npc-static', 'overworld-mini', 'creature-battle', 'trainer-battle', 'prop']) {
      expect(classOf(manifest, cls).postprocess.fit, cls).toBe(true);
    }
  });

  it('…and the approved player really does come out 32×48 with its aspect intact', async () => {
    const row = manifest.rows.find((r) => r.id === 'player-front')!;
    const src = resolve(REPO_ROOT, row.file!);
    if (!existsSync(src)) return; // the approval lives in assets/approved-trials/; skip if absent
    const raw = await readRaster(src);
    const trimmed = trimBackground(raw, BG);
    const out = processRaster(raw, recipeFor(classOf(manifest, row.class), row), PALETTE);
    expect(`${out.width}x${out.height}`).toBe(row.targetSize);

    let minX = out.width;
    let maxX = -1;
    let minY = out.height;
    let maxY = -1;
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        if (out.data[idx(out, x, y) + 3]! === 0) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const outAspect = (maxX - minX + 1) / (maxY - minY + 1);
    const srcAspect = trimmed.width / trimmed.height;
    // Within one pixel of rounding at this size. A stretched sprite would be ~16% out.
    expect(Math.abs(outAspect - srcAspect)).toBeLessThan(0.03);
  });

  it('the painted dex class is CUT, and the chain has no unquantized class left', () => {
    /*
     * WHAT THIS TEST USED TO SAY, AND WHY IT IS INVERTED RATHER THAN DELETED.
     *
     * It read `classOf(manifest, 'dex-painted').postprocess` and asserted the whole chain was off —
     * "§9.3 prescribes no chain for a watercolour". The owner took build-doc §15's cut line C-4
     * ("the dex uses the existing creature sprites"), so that class no longer exists and the
     * assertion has no subject. Deleting the test would leave nothing saying the class is gone, and
     * a `rebuild` that quietly reintroduced it would be green here; so it asserts the CUT instead,
     * the same way the creature-back and player-view rulings are held.
     *
     * The second half is the consequence nothing else states: `dex-painted` was the ONLY class with
     * `quantize: false`. Every class the pipeline still declares goes through the frozen palette,
     * which is what `tests/gates/asset-palette-contract.test.ts` assumes of everything it decodes.
     * That assumption was previously true-with-an-exception; now it is simply true, and this is
     * where it would go red if a new unquantized class were added without saying so.
     */
    expect(() => classOf(manifest, 'dex-painted')).toThrow(/manifest\.classes has no "dex-painted"/);
    const classes = Object.entries(manifest.classes);
    expect(classes.length, 'no classes to check — this loop would be vacuous').toBeGreaterThan(8);
    for (const [name, spec] of classes) {
      expect(spec.postprocess.quantize, `class "${name}" skips the palette quantize`).toBe(true);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * palette.json is read LIVE — gate B0's freeze is a value swap (§8.4)
 * ════════════════════════════════════════════════════════════════════════════ */

describe('palette.json is read live, not compiled in', () => {
  it('is still a placeholder, and says so', () => {
    const p = loadPaletteFile();
    expect(p.colors).toHaveLength(p.colorCount);
    // Not an assertion that it MUST be unfrozen — when gate B0 freezes it this still passes; the
    // point is that the tool reports the truth either way.
    expect(typeof paletteIsFrozen()).toBe('boolean');
    expect(paletteIsFrozen()).toBe(p.frozen);
  });

  it('quantize follows a different palette FILE with no code change', async () => {
    const swapped = join(tmp, 'palette-frozen.json');
    await writeFile(
      swapped,
      JSON.stringify({
        frozen: true,
        frozenAt: '2026-01-01',
        source: 'test double for the gate-B0 freeze',
        colorCount: 2,
        colors: [
          { id: 'c00', hex: '#000000' },
          { id: 'c01', hex: '#ffffff' },
        ],
      }),
      'utf8',
    );
    const twoTone = loadPalette(swapped);
    expect(twoTone).toHaveLength(2);
    const out = quantize(rawSprite(32), twoTone);
    const used = new Set<string>();
    for (let i = 0; i < out.data.length; i += 4) used.add(`${out.data[i]},${out.data[i + 1]},${out.data[i + 2]}`);
    expect([...used].sort()).toEqual(['0,0,0', '255,255,255']);
    // The shipped palette is untouched by that — the swap is per-call, not global state.
    expect(loadPalette(PALETTE_PATH).length).toBe(loadPaletteFile().colorCount);
  });

  it('rejects a malformed palette instead of quantizing to garbage', async () => {
    const bad = join(tmp, 'palette-bad.json');
    await writeFile(bad, JSON.stringify({ frozen: false, colorCount: 2, colors: [{ id: 'c00', hex: 'green' }] }), 'utf8');
    expect(() => loadPalette(bad)).toThrow();
    expect(() => parseHex('#12345')).toThrow(/not a #rrggbb/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §9.3 step 3 is COUPLED TO THE PALETTE — the invariant a palette freeze can break
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * WHY THIS SECTION EXISTS AND WHY A NUMBER ALONE WOULD NOT DO.
 *
 * §9.3 runs background removal (step 3) AFTER quantize (step 2). Removal matches a DECLARED key —
 * white, because every §9.2 prompt ends in `plain white background` — but by the time it runs, no
 * pixel is white any more: the whole frame has been snapped to `data/palette.json`. So what step 3
 * must actually match is not white, it is *whatever the palette maps white to*, and that colour
 * moves every time the palette is re-fit.
 *
 * It moved. `backgroundTolerance` was 12; the frozen palette's white-image is `#fdfdfb`, 4 off
 * white, and passed by luck. Both re-freeze candidates put their white-image at 13 and 20 — outside
 * 12 — and removal then cleared ZERO pixels on real art (measured through this chain on the
 * approved player and on two 1024² creature trials: the entire fitted subject box stayed opaque,
 * i.e. every sprite would ship with an opaque off-white rectangle behind it).
 *
 * The tolerance is now 24, which restores removal under all three palettes. But 24 is not the fix —
 * the fix is the INVARIANT below, because the next palette freeze can move the white-image again and
 * a number in a config file cannot notice. Two conditions, and they pull in opposite directions:
 *
 *   1. the palette's image of the background key must be INSIDE the tolerance, or step 3 removes
 *      nothing and the background ships;
 *   2. every OTHER swatch must be OUTSIDE it, or the flood fill spreads into a second colour and
 *      eats light content.
 *
 * Condition 2 is the reason the tolerance cannot simply be raised until it always works.
 * The palettes are discovered from disk rather than listed, so a palette added by a future freeze
 * is bound by this the moment it lands.
 */

/** Max per-channel deviation — exactly what `isBackgroundPixel` thresholds. */
function channelDeviation(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

/** What the palette maps a colour to, computed by the REAL quantizer rather than a re-implementation. */
function paletteImageOf(colour: { r: number; g: number; b: number }, palette: readonly PaletteRgb[]): Rgb {
  const one = blankRaster(1, 1);
  px(one, 0, 0, [colour.r, colour.g, colour.b, 255]);
  const q = quantize(one, palette);
  return { r: q.data[0]!, g: q.data[1]!, b: q.data[2]! };
}

/* ────────────────────────────────────────────────────────────────────────────
 * …AND THE SAME TRAP AGAIN, ONE TOLERANCE OVER
 *
 * Everything above reads `backgroundTolerance` AND ONLY THAT. Step 3 no longer runs on one number.
 * `removeFlatBackground` SEEDS at `tolerance` and GROWS at `shadowTolerance` (`creature-battle`
 * declares 50), and the second number is what clears the soft cast-shadow puddle the generator draws
 * under a creature — 4,929 pixels across the 75 battle sprites, every one of them the palette's
 * image of white or of the shadow swatch.
 *
 * A test that never reads a number cannot tell a working value of it from a broken one. The
 * assertions above are green at shadowTolerance 50, at 24 (the fix switched off, the puddle ships
 * opaque again) and at 90 (the flood eats every light swatch in the palette) — because the input
 * they look at is identical in all three. That is the §0.5 failure in `tools/artverify/
 * EVAL-STANDARD.md`, and a palette re-freeze is exactly the event that walks into it: move the
 * shadow swatch past 50 and the fix silently stops working; pull the next swatch in under 50 and
 * the flood silently starts eating light content. Neither turns anything red today.
 *
 * So the same two-sided invariant is asserted for the GROW tolerance, per palette:
 *
 *   1. EXACTLY TWO swatches are inside it — the palette's image of the declared key, and the one
 *      swatch the shadow quantizes to. One means the puddle survives; that is the state that
 *      shipped. Three means the flood has reached a swatch that is content somewhere.
 *   2. The THIRD-lightest is strictly outside, so a freeze that merely gets close is red too.
 *
 * MEASURED, NOT RE-DERIVED. "Inside" is decided by RUNNING `removeFlatBackground` with the options
 * `processRaster` hands it — `backgroundOf(recipeFor(spec))`, the same call and the same pairing.
 * `isBackgroundPixel` is private to steps.ts, and a second copy of `Math.abs(…) <= tol` in this file
 * would be one more thing that can drift from the operator it claims to describe.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Does step 3's flood GROW into this swatch, according to the shipped flood itself?
 *
 * The probe is a 3×3 whose RING is the palette's image of the declared key and whose CENTRE is the
 * candidate swatch. Every ring cell is on the frame edge, so the ring is what `seed()` admits at
 * `tolerance`; the centre touches no edge, so the only way it can ever clear is `push()` growing
 * into it at `shadowTolerance`. The separation is the whole point — a 1-pixel-tall probe would put
 * the candidate on the border and measure `tolerance`, which is the number that is already tested.
 */
function floodGrowsInto(
  swatch: { r: number; g: number; b: number },
  keyImage: Rgb,
  bg: BackgroundOptions,
): boolean {
  const r = blankRaster(3, 3);
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      const c = x === 1 && y === 1 ? swatch : keyImage;
      px(r, x, y, [c.r, c.g, c.b, 255]);
    }
  }
  const out = removeFlatBackground(r, bg);
  return out.data[idx(out, 1, 1) + 3] === 0;
}

/** A raster of flat swatches, so a probe can be written as a picture. */
function swatchRaster(rows: ReadonlyArray<ReadonlyArray<{ r: number; g: number; b: number }>>): Raster {
  const h = rows.length;
  const w = rows[0]!.length;
  const r = blankRaster(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px(r, x, y, [rows[y]![x]!.r, rows[y]![x]!.g, rows[y]![x]!.b, 255]);
  return r;
}

/** Every palette file the repo carries, found on disk — data/ and the trial proposals alike. */
function discoverPalettes(): Array<{ label: string; path: string }> {
  const found: Array<{ label: string; path: string }> = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/^palette.*\.json$/.test(entry.name)) found.push({ label: full.slice(REPO_ROOT.length + 1), path: full });
    }
  };
  walk(resolve(REPO_ROOT, 'data'));
  walk(resolve(REPO_ROOT, 'assets/approved-trials'));
  return found;
}

/** A subject that does NOT fill its own bounding box, so trim leaves real background for step 3. */
function discSprite(size = 128): Raster {
  const r = blankRaster(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) px(r, x, y, [255, 255, 255, 255]);
  const c = (size - 1) / 2;
  const rad = size * 0.45;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x - c) ** 2 + (y - c) ** 2 > rad * rad) continue;
      px(r, x, y, [40 + ((x * 7) % 160), 30 + ((y * 5) % 170), 60 + ((x + y) % 140), 255]);
    }
  }
  // A white highlight enclosed by the subject: the flood fill must never reach it, at any tolerance.
  for (let y = Math.floor(c) - 3; y <= Math.floor(c) + 3; y++) {
    for (let x = Math.floor(c) - 3; x <= Math.floor(c) + 3; x++) px(r, x, y, [255, 255, 255, 255]);
  }
  return r;
}

describe('§9.3 step 3 survives a palette swap', () => {
  const palettes = discoverPalettes();

  /** The classes step 3 actually runs for. Read inside the test bodies: `manifest` is async. */
  const removalClasses = (): Array<[string, ClassSpec]> =>
    Object.entries(manifest.classes).filter(([, s]) => s.postprocess.removeBackground);

  /** …and the subset that opts into the second, looser GROW tolerance. */
  const shadowClasses = (): Array<[string, ClassSpec]> =>
    removalClasses().filter(([, s]) => s.postprocess.shadowTolerance !== undefined);

  it('finds the palettes on disk, including the frozen one', () => {
    expect(palettes.map((p) => p.label)).toContain('data/palette.json');
    // The two re-freeze proposals are bound by everything below exactly as the frozen palette is.
    expect(palettes.length).toBeGreaterThanOrEqual(1);
  });

  it('at least one class actually runs background removal — otherwise this suite proves nothing', () => {
    expect(removalClasses().length).toBeGreaterThan(0);
    expect(removalClasses().map(([n]) => n)).toContain('creature-battle');
  });

  it('at least one class declares shadowTolerance — otherwise every shadow assertion below is vacuous', () => {
    // FAIL CLOSED. Every shadow assertion is a loop over `shadowClasses()`, and a loop over an empty
    // list passes. Delete the key from the manifest and the invariant that keeps 4,929 shadow pixels
    // clearing would evaporate with nothing turning red — the same fail-open shape the layout gate's
    // closed character set was built to avoid. If the opt-in is ever genuinely withdrawn, this test
    // is the thing that has to be edited ON PURPOSE, in the same commit, with the reason written down.
    expect(
      shadowClasses().map(([n]) => n),
      'no manifest class declares postprocess.shadowTolerance — the cast-shadow removal is off, and ' +
        'the two-swatch invariant below is checking nothing at all',
    ).toContain('creature-battle');
    // …and the number really is the looser of the two, or `removeFlatBackground` grows at `tolerance`
    // and the whole section is describing a step that does not happen.
    for (const [name, spec] of shadowClasses()) {
      const recipe = recipeFor(spec);
      expect(
        recipe.backgroundShadowTolerance,
        `${name} declares shadowTolerance ${String(spec.postprocess.shadowTolerance)}, which is not ` +
          `looser than backgroundTolerance ${String(recipe.backgroundTolerance)} — the opt-in buys nothing`,
      ).toBeGreaterThan(recipe.backgroundTolerance);
    }
  });

  it('every removing class declares the key the generator produces — `plain white background` (§9.2)', () => {
    for (const [name, spec] of removalClasses()) {
      expect(parseHex(spec.postprocess.backgroundKey), `${name} declares a key that is not white`).toEqual(WHITE);
    }
  });

  for (const { label, path } of palettes) {
    describe(label, () => {
      it('maps the background key INSIDE every removing class’s tolerance — or step 3 is a no-op', () => {
        const palette = loadPalette(path);
        for (const [name, spec] of removalClasses()) {
          const key = parseHex(spec.postprocess.backgroundKey);
          const image = paletteImageOf(key, palette);
          const dev = channelDeviation(image, key);
          expect(
            dev,
            `${label}: ${name} declares key ${spec.postprocess.backgroundKey}; this palette maps it to ` +
              `rgb(${image.r},${image.g},${image.b}), ${dev} off — outside backgroundTolerance ` +
              `${spec.postprocess.backgroundTolerance}, so removeFlatBackground would clear NOTHING and ` +
              `every ${name} sprite would ship with an opaque rectangle behind it.`,
          ).toBeLessThanOrEqual(spec.postprocess.backgroundTolerance);
        }
      });

      it('keeps every OTHER swatch OUTSIDE the tolerance — or the fill eats light content', () => {
        const palette = loadPalette(path);
        for (const [name, spec] of removalClasses()) {
          const tol = spec.postprocess.backgroundTolerance;
          const key = parseHex(spec.postprocess.backgroundKey);
          const image = paletteImageOf(key, palette);
          const inside = palette.filter((c) => channelDeviation(c, key) <= tol);
          expect(
            inside.map((c) => c.hex),
            `${label}: ${name} tolerance ${tol} admits ${inside.length} swatches. Exactly one — the ` +
              'palette’s image of the background key — may be inside it, or the fill spreads into a ' +
              'second colour and eats light content.',
          ).toEqual([palette.find((c) => c.r === image.r && c.g === image.g && c.b === image.b)!.hex]);
          // The second-lightest swatch's margin, asserted rather than assumed: a freeze that merely
          // gets close is the same defect one step later.
          const outside = palette
            .map((c) => channelDeviation(c, key))
            .filter((d) => d > tol)
            .sort((a, b) => a - b);
          expect(outside[0]!, `${label}: ${name}'s second-lightest swatch is only ${outside[0]} off the key`).toBeGreaterThan(tol);
        }
      });

      it('admits EXACTLY the key’s image and the shadow swatch inside shadowTolerance — and no third', () => {
        const palette = loadPalette(path);
        for (const [name, spec] of shadowClasses()) {
          const recipe = recipeFor(spec);
          const bg = backgroundOf(recipe);
          const tol = recipe.backgroundShadowTolerance;
          const key = parseHex(spec.postprocess.backgroundKey);
          const image = paletteImageOf(key, palette);
          const imageHex = palette.find((c) => c.r === image.r && c.g === image.g && c.b === image.b)!.hex;

          const byDistance = [...palette].sort((a, b) => channelDeviation(a, key) - channelDeviation(b, key));
          const show = (c: PaletteRgb): string => `${c.id} ${c.hex} (${String(channelDeviation(c, key))} off)`;
          // Decided by the shipped flood with the shipped options, not by a second copy of its threshold.
          const inside = byDistance.filter((c) => floodGrowsInto(c, image, bg));

          expect(
            inside.map(show),
            `${label}: ${name} grows at shadowTolerance ${String(tol)}, which admits ${String(inside.length)} ` +
              'swatch(es). EXACTLY TWO may be inside: the palette’s image of the background key, and the ' +
              'one swatch the cast shadow quantizes to. Fewer means the shadow puddle survives and every ' +
              'sprite ships with an opaque pale smear under it; more means the flood has reached a swatch ' +
              'that is light CONTENT somewhere and will eat it.',
          ).toEqual(byDistance.slice(0, 2).map(show));
          expect(inside[0]!.hex, `${label}: ${name}'s nearest admitted swatch is not the key's image`).toBe(imageHex);

          // The third-lightest, STRICTLY outside — a freeze that merely gets close is the same defect
          // one freeze later. Cross-checked two ways: the flood refuses it, and the margin is real.
          const third = byDistance[2]!;
          expect(floodGrowsInto(third, image, bg), `${label}: ${name} flood reached ${show(third)}`).toBe(false);
          expect(
            channelDeviation(third, key),
            `${label}: ${name}'s third-lightest swatch ${show(third)} is not clear of shadowTolerance ${String(tol)}`,
          ).toBeGreaterThan(tol);

          // AND THE NUMBER IS WHAT DOES THE WORK. At `backgroundTolerance` — what every class that has
          // NOT opted in grows at, and what this class grew at before the shadow fix — the flood stops
          // at the key's image. So the second swatch is inside because of `shadowTolerance` and for no
          // other reason, which is the claim the assertion above would otherwise only imply.
          const atBackgroundTolerance = byDistance.filter((c) =>
            floodGrowsInto(c, image, { key: bg.key, tolerance: recipe.backgroundTolerance }),
          );
          expect(
            atBackgroundTolerance.map(show),
            `${label}: ${name} admits these at backgroundTolerance ${String(recipe.backgroundTolerance)} — ` +
              'if the shadow swatch is already among them, `shadowTolerance` is not the thing clearing it ' +
              'and this palette has moved the two tolerances on top of each other.',
          ).toEqual([show(byDistance[0]!)]);
        }
      });

      it('widens the GROW only — an enclosed shadow region is kept, and one at the frame edge is not seeded', () => {
        // The safety argument `removeFlatBackground`'s header makes for raising the grow tolerance,
        // asserted rather than believed. Both probes are written in the palette's own swatches: the
        // shadow swatch is the second-lightest (the one the test above pins as admitted), and the
        // subject colour is the swatch FURTHEST from the key, so neither is a colour typed here.
        const palette = loadPalette(path);
        for (const [name, spec] of shadowClasses()) {
          const bg = backgroundOf(recipeFor(spec));
          const key = parseHex(spec.postprocess.backgroundKey);
          const image = paletteImageOf(key, palette);
          const byDistance = [...palette].sort((a, b) => channelDeviation(a, key) - channelDeviation(b, key));
          const shadow = byDistance[1]!;
          const subject = byDistance[byDistance.length - 1]!;

          // ENCLOSED: a pale region ringed by subject is unreachable from the border at ANY tolerance.
          const enclosed = swatchRaster([
            [image, image, image, image, image],
            [image, subject, subject, subject, image],
            [image, subject, shadow, subject, image],
            [image, subject, subject, subject, image],
            [image, image, image, image, image],
          ]);
          const afterEnclosed = removeFlatBackground(enclosed, bg);
          expect(
            afterEnclosed.data[idx(afterEnclosed, 2, 2) + 3],
            `${label}: ${name} punched out a ${shadow.hex} region the subject encloses — at shadowTolerance ` +
              'the flood is reaching pale pixels it cannot see a path to',
          ).toBe(255);
          expect(afterEnclosed.data[idx(afterEnclosed, 0, 0) + 3], `${label}: ${name} left the corner opaque`).toBe(0);

          // SEEDS STAY STRICT: the shadow swatch ON the frame edge, with no backdrop anywhere, is a
          // pale wing touching the border. `seed()` reads `tolerance`, so nothing may start here.
          const edge = swatchRaster([
            [subject, subject, subject],
            [shadow, subject, subject],
            [subject, subject, subject],
          ]);
          const afterEdge = removeFlatBackground(edge, bg);
          for (let i = 3; i < afterEdge.data.length; i += 4) {
            expect(
              afterEdge.data[i],
              `${label}: ${name} seeded a flood on ${shadow.hex} at the frame edge — shadowTolerance has ` +
                'leaked into seeding, and a pale wing that merely touches the border will be erased',
            ).toBe(255);
          }
        }
      });

      it('really does clear the background through the whole chain, and only the background', () => {
        const palette = loadPalette(path);
        for (const [name, spec] of removalClasses()) {
          const recipe = { ...recipeFor(spec), targetW: 64, targetH: 64 };
          const src = discSprite();
          const withRemoval = processRaster(src, recipe, palette);
          const withoutRemoval = processRaster(src, { ...recipe, removeBackground: false }, palette);
          const image = paletteImageOf(parseHex(spec.postprocess.backgroundKey), palette);
          const bgColour = `${image.r},${image.g},${image.b}`;

          let cleared = 0;
          let enclosedBackgroundKept = 0;
          const clearedColours = new Set<string>();
          for (let i = 0; i < withRemoval.data.length; i += 4) {
            if (withoutRemoval.data[i + 3]! === 0) continue;
            const colour = `${withoutRemoval.data[i]},${withoutRemoval.data[i + 1]},${withoutRemoval.data[i + 2]}`;
            if (withRemoval.data[i + 3]! === 0) {
              cleared++;
              clearedColours.add(colour);
            } else if (colour === bgColour) {
              enclosedBackgroundKept++;
            }
          }
          expect(cleared, `${label}: ${name} removal cleared nothing — the background would ship`).toBeGreaterThan(0);
          expect([...clearedColours], `${label}: ${name} removal reached a colour that is not the background`).toEqual([
            bgColour,
          ]);
          // The corner is background and must go; the highlight the subject encloses must not.
          expect(withRemoval.data[idx(withRemoval, 0, 0) + 3], `${label}: ${name} corner`).toBe(0);
          expect(enclosedBackgroundKept, `${label}: ${name} enclosed highlight was punched out`).toBeGreaterThan(0);
        }
      });

      /**
       * The ship path itself, not a re-assembly of it. Everything above proves the invariant holds
       * for the classes in the manifest and for `processRaster`; none of it looked at the OTHER
       * program that runs §9.3's chain. `player-views.ts` did carry its own `tolerance: 12`, and so
       * every test above was green while the player's front/back/side sprites came out as solid
       * 32x48 rectangles under both re-freeze candidates (measured: 1536/1536 opaque, 0 cleared).
       * This calls the real exported function.
       */
      it('tools/comfy/player-views.ts::toSprite clears the background under this palette too', async () => {
        const src = resolve(REPO_ROOT, 'assets/approved-trials/player-APPROVED.png');
        expect(existsSync(src), `${src} is the approved player static; it is tracked, not generated`).toBe(true);
        const palette = loadPalette(path);
        const out = await toSprite(src, palette);

        const total = out.width * out.height;
        let opaque = 0;
        for (let i = 3; i < out.data.length; i += 4) if (out.data[i]! !== 0) opaque++;
        expect(
          opaque,
          `${label}: player-views toSprite left all ${total} pixels opaque — background removal ` +
            'cleared NOTHING, so the player would ship inside an off-white rectangle.',
        ).toBeLessThan(total);
        expect(out.data[idx(out, 0, 0) + 3], `${label}: player-views toSprite left the corner opaque`).toBe(0);

        // Not "something got cleared" — the border came away and the subject did not. The approved
        // static is a centred figure, so a healthy cut takes a fifth of the frame at least.
        expect(total - opaque, `${label}: only ${total - opaque}/${total} px cleared`).toBeGreaterThan(total / 5);
        expect(opaque, `${label}: toSprite ate the subject`).toBeGreaterThan(total / 3);
      });
    });
  }
});

/* ════════════════════════════════════════════════════════════════════════════
 * …AND THE TOLERANCE HAS EXACTLY ONE HOME
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * WHY THE INVARIANT ABOVE WAS NOT ENOUGH.
 *
 * Everything above is parameterised over `manifest.classes.<c>.postprocess`, so it can only see the
 * callers that READ that block. Four did not. `tools/comfy/player-views.ts` — the documented rebuild
 * command for the player's back and side sprites — and the three `tools/palette/*.mjs` scripts that
 * generate the at-game-size evidence the palette decision rests on each declared their own
 * `{ key: WHITE, tolerance: 12 }`. The whole suite stayed green while the number they used was the
 * broken one, because a test that reads the manifest cannot notice a caller that doesn't.
 *
 * So the property asserted here is structural rather than numeric: **no file that runs §9.3's
 * background steps may name a tolerance of its own.** A number with five homes is only ever in sync
 * by coincidence, and coincidence is exactly what shipped the defect — `data/palette.json` maps
 * white to 4 off, which is inside 12 by luck.
 *
 * Two rules, and they close different holes:
 *   1. no numeric tolerance literal anywhere under `tools/` — catches `tolerance: 12` and `TOL = 12`;
 *   2. any file calling `trimBackground`/`removeFlatBackground` must get its options from
 *      `backgroundForClass` — catches a caller that builds the object out of a differently-named
 *      constant, which rule 1 would read straight past.
 *
 * What this does NOT catch, stated so nobody over-reads the green: a caller that imports
 * `backgroundForClass` and then passes a hand-built object anyway. Rule 1 catches that only in its
 * literal form.
 */

const TOOLS_ROOT = resolve(REPO_ROOT, 'tools');

/** Source files under tools/, so the scan is over the shipping tools rather than a hand-written list. */
function toolSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full);
      } else if (/\.(ts|mjs|tsx)$/.test(entry.name)) out.push(full);
    }
  };
  walk(TOOLS_ROOT);
  return out;
}

/**
 * Comments removed before matching, so the PROSE explaining the defect — which necessarily quotes
 * `tolerance: 12` — does not read as the defect. The `//` rule spares `://` so a URL in a string
 * does not swallow the rest of its line.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('§9.3 step 3’s tolerance has ONE home — the manifest (G11)', () => {
  const sources = toolSources().map((file) => ({
    file,
    rel: file.slice(REPO_ROOT.length + 1),
    code: stripComments(readFileSync(file, 'utf8')),
  }));

  it('finds the tools it is supposed to be scanning', () => {
    const rels = sources.map((s) => s.rel);
    expect(rels).toContain('tools/comfy/player-views.ts');
    expect(rels).toContain('tools/palette/at-game-size.mjs');
    expect(rels).toContain('tools/palette/at-game-size-compare.mjs');
    expect(rels).toContain('tools/palette/cross-view.mjs');
    expect(rels).toContain('tools/postprocess/chain.ts');
  });

  it('no tool declares a background tolerance of its own (G11)', () => {
    const offenders: string[] = [];
    for (const { rel, code } of sources) {
      for (const [i, line] of code.split('\n').entries()) {
        // `tolerance: 12` — an inline background-options object.
        // `TOL = 12` / `const TOLERANCE = 12` — a module constant feeding one.
        // The `\w*` prefix is load-bearing: `BackgroundOptions` grew a SECOND number,
        // `shadowTolerance`, and `\btolerance` cannot match inside `shadowTolerance` — there is no
        // word boundary in the middle of an identifier. A rule that reads past the newest tolerance
        // is a rule that only ever protected the one that already had a test.
        if (/\b\w*tolerance\s*:\s*\d/i.test(line) || /\b(?:TOL|TOLERANCE)\s*=\s*\d/i.test(line)) {
          offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
        }
      }
    }
    expect(
      offenders,
      'A background tolerance is a property of the PALETTE, not of the file using it: §9.3 runs\n' +
        'removal after quantize, so the number has to admit whatever the palette maps white to, and\n' +
        'that moves on every re-fit. Read it from `classes.<c>.postprocess.backgroundTolerance` via\n' +
        '`backgroundForClass(<class>)` in tools/postprocess/chain.ts. A local copy is in sync only by\n' +
        'coincidence — which is exactly how the player shipped inside an opaque box (BF-5).\n' +
        `Offending line(s):\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('every caller of the background steps resolves its options from the manifest', () => {
    // chain.ts IS the resolver and steps.ts defines the steps; everything else must go through them.
    const exempt = new Set(['tools/postprocess/chain.ts', 'tools/postprocess/steps.ts']);
    const callers = sources.filter(
      (s) => !exempt.has(s.rel) && /\b(?:trimBackground|removeFlatBackground)\s*\(/.test(s.code),
    );
    expect(
      callers.length,
      'no caller found outside tools/postprocess — the scan is looking in the wrong place',
    ).toBeGreaterThan(0);

    const unbound = callers.filter((s) => !/\bbackgroundForClass\b/.test(s.code)).map((s) => s.rel);
    expect(
      unbound,
      'These run §9.3’s background steps without asking the manifest what key and tolerance to use.\n' +
        'Import `backgroundForClass` from tools/postprocess/chain.ts and await it for the class the\n' +
        'file is processing. Building the options any other way opts the file out of the palette\n' +
        'invariant above, and that is the whole of BF-5.',
    ).toEqual([]);
  });

  it('the resolver returns exactly what the manifest says, for every class', async () => {
    for (const [name, spec] of Object.entries(manifest.classes)) {
      const bg = await backgroundForClass(name);
      expect(bg.tolerance, name).toBe(spec.postprocess.backgroundTolerance);
      expect(bg.key, name).toEqual(parseHex(spec.postprocess.backgroundKey));
      // BOTH numbers, or the second one is resolved by nothing. Drop the `??` line out of
      // `recipeFor` and `shadowTolerance` silently becomes `backgroundTolerance` for every class —
      // the cast-shadow removal off, 75 sprites back in pale puddles, and every palette invariant
      // above still green because they all read the recipe rather than the manifest.
      expect(bg.shadowTolerance, `${name} shadowTolerance`).toBe(
        spec.postprocess.shadowTolerance ?? spec.postprocess.backgroundTolerance,
      );
      // …and the default really is the fallback, not a coincidence: a class that declares nothing
      // must come back with the two numbers equal, which is what keeps every non-opted-in class
      // byte-identical to what it produced before the second tolerance existed.
      if (spec.postprocess.shadowTolerance === undefined) {
        expect(bg.shadowTolerance, `${name} did not opt in but grows at a different number`).toBe(bg.tolerance);
      }
    }
    await expect(backgroundForClass('no-such-class')).rejects.toThrow(/no "no-such-class"/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Atlas packing (§9.3 step 4)
 * ════════════════════════════════════════════════════════════════════════════ */

describe('atlas packing is deterministic', () => {
  const entries = ['zeta', 'alpha', 'mid'].map((id) => ({ id, raster: rawSprite(16) }));

  it('frames do not depend on input order and do not overlap', () => {
    const a = packAtlas(entries, { maxWidth: 40, padding: 1 });
    const b = packAtlas([...entries].reverse(), { maxWidth: 40, padding: 1 });
    expect(a.frames).toEqual(b.frames);
    expect(rastersEqual(a.image, b.image)).toBe(true);
    const boxes = Object.values(a.frames);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i]!;
        const q = boxes[j]!;
        const overlap = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
        expect(overlap).toBe(false);
      }
    }
  });

  it('copies each sprite in at its frame', () => {
    const atlas = packAtlas(entries, { maxWidth: 40, padding: 1 });
    const f = atlas.frames['alpha']!;
    const src = entries.find((e) => e.id === 'alpha')!.raster;
    expect(atlas.image.data[idx(atlas.image, f.x + 3, f.y + 3)]).toBe(src.data[idx(src, 3, 3)]);
  });

  it('refuses a duplicate id and a sprite wider than the atlas', () => {
    expect(() => packAtlas([entries[0]!, entries[0]!], { maxWidth: 40, padding: 1 })).toThrow(/duplicate/);
    expect(() => packAtlas(entries, { maxWidth: 8, padding: 1 })).toThrow(/atlas is 8px/);
  });

  it('the descriptor sorts frames so the JSON diffs cleanly', () => {
    const json = JSON.parse(atlasDescriptor(packAtlas(entries, { maxWidth: 40, padding: 1 }), 'x.png')) as {
      frames: Record<string, unknown>;
    };
    expect(Object.keys(json.frames)).toEqual(['alpha', 'mid', 'zeta']);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Placeholders — honest by construction
 * ════════════════════════════════════════════════════════════════════════════ */

describe('placeholders never look like finished art', () => {
  it('is a flat block with a border and the id on it, and only palette colours', () => {
    const p = makePlaceholder('battle-fenmaw-e-front', 96, 96, { palette: PALETTE });
    const colours = distinctColours(p);
    // Exactly two: the block and the ink. Nothing that could read as rendered art.
    expect(colours.size).toBe(2);
    const allowed = new Set(PALETTE.map((c) => (c.r << 24) | (c.g << 16) | (c.b << 8) | 255));
    for (const c of colours) expect(allowed.has(c)).toBe(true);
    expect(p.data[idx(p, 0, 0) + 3]).toBe(255);
  });

  it('is deterministic in the id, and different ids get different blocks', () => {
    const a = makePlaceholder('mini-nibbin', 32, 32, { palette: PALETTE });
    const b = makePlaceholder('mini-nibbin', 32, 32, { palette: PALETTE });
    expect(rastersEqual(a, b)).toBe(true);
    const c = makePlaceholder('mini-skir', 32, 32, { palette: PALETTE });
    expect(rastersEqual(a, c)).toBe(false);
  });

  it('shows the WHOLE id at a 96² battle frame — a truncated label names the wrong asset', () => {
    const id = 'battle-fenmaw-e-front';
    const scale = fontScale(id.toUpperCase(), 96, 96);
    const lines = wrapLabel(id.toUpperCase(), 96, scale);
    expect(scale).toBeGreaterThan(1);
    expect(lines.join('')).toBe(id.toUpperCase());
    expect(lines.length * 6 * scale).toBeLessThanOrEqual(94);
  });

  it('survives the smallest target in the manifest without throwing', () => {
    const smallest = manifest.rows
      .map((r) => r.targetSize.split('x').map(Number) as [number, number])
      .reduce((a, b) => (a[0] * a[1] <= b[0] * b[1] ? a : b));
    const p = makePlaceholder('prop-sunken-idol', smallest[0], smallest[1], { palette: PALETTE });
    expect(p.width).toBe(smallest[0]);
    expect(wrapLabel('PROP-SUNKEN-IDOL', smallest[0]).length).toBeGreaterThan(0);
  });

  /*
   * The REAL writer, not a hand-built stand-in for it. This used to do
   * `writeRaster(dest, makePlaceholder(row.id, …))` — which is the superseded label convention,
   * constructed here and then asserted on, so it would have gone on encoding `row.id` for ever
   * however `writePlaceholders` was labelling things. `tools/postprocess/run.ts` owns the label; ask
   * it. (`tests/unit/postprocess-run.test.ts` reads the PIXELS back and proves which string it used;
   * what is asserted here is the destination.)
   */
  it('writes to the row destination the node data already references', async () => {
    const row = manifest.rows.find((r) => r.id === 'map-hearthollow')!;
    const report = await writePlaceholders(manifest, (r) => r.id === row.id, { force: true, root: tmp });
    expect(report.written).toEqual([finalPathOf(row, tmp)]);
    expect(resolve(finalPathOf(row, tmp))).toBe(resolve(tmp, 'assets/final/maps/hearthollow.png'));
    expect(existsSync(finalPathOf(row, tmp))).toBe(true);
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * …and it DECLARES them, at the root of the shipping tree.
   *
   * Two defects are being held closed here, and the second is the one that cost something.
   *
   *   1. NOTHING WROTE THE DECLARATION. `writePlaceholders` created exactly the files that must be
   *      declared and declared none of them; `assets/final/dex-painted/stand-ins.json` was
   *      hand-authored and hand-maintained. `tests/gates/stand-in-declaration.test.ts` caught a
   *      wrong list after the fact, which is right, but the writer is the only thing that can be
   *      right by construction.
   *   2. IT LIVED INSIDE A CLASS DIRECTORY, so cut line C-4 — a ruling about the dex, nothing to do
   *      with placeholders — deleted the repository's entire placeholder register along with the
   *      class. THAT is the property asserted at the end of this test, and it is asserted by doing
   *      the thing that broke it: deleting a whole class directory and looking for the register.
   * ────────────────────────────────────────────────────────────────────────── */
  it('declares what it wrote, at the shipping root, where no single class can delete it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trophic-declare-'));
    try {
      const row = manifest.rows.find((r) => r.id === 'map-hearthollow')!;
      const other = manifest.rows.find((r) => r.id === 'battle-cindril-j-front')!;
      const report = await writePlaceholders(
        manifest,
        (r) => r.id === row.id || r.id === other.id,
        { force: true, root },
      );
      expect(report.written).toHaveLength(2);

      // The declaration is at the ROOT of the shipping tree, not beside either class's PNGs.
      const declaration = resolve(root, 'assets/final/stand-ins.json');
      expect(report.declared.file).toBe('assets/final/stand-ins.json');
      expect(existsSync(declaration), 'no declaration was written at the shipping root').toBe(true);
      expect(existsSync(resolve(root, 'assets/final/maps/stand-ins.json'))).toBe(false);
      expect(existsSync(resolve(root, 'assets/final/creature-battle/stand-ins.json'))).toBe(false);

      // …and it lists exactly what was written, under the label the GAME resolves the path to —
      // the same convention `tests/gates/stand-in-declaration.test.ts` reconciles against.
      const listed = (JSON.parse(readFileSync(declaration, 'utf8')) as { standIns: string[] }).standIns;
      expect(listed).toEqual([placeholderLabel(other.finalFile), placeholderLabel(row.finalFile)].sort());
      expect(report.declared.standIns).toEqual(listed);
      expect(listed).toContain('maps/hearthollow');

      // REAL ART LANDING AT A DECLARED PATH DROPS THE ID, because the list is derived from the
      // pixels rather than appended to. Overwrite one placeholder with something that is not one.
      await writeRaster(finalPathOf(row, root), rawSprite(16));
      const again = await writeStandInDeclaration(root);
      expect(again.standIns).toEqual([placeholderLabel(other.finalFile)]);
      expect(again.standIns).not.toContain('maps/hearthollow');

      // The authored prose survives a regeneration: this function owns the LIST, not the record of
      // why the file exists. (`_source` here stands in for the shipped file's `_what`/`_whyItLivesHere`.)
      const doc = JSON.parse(readFileSync(declaration, 'utf8')) as Record<string, unknown>;
      doc['_source'] = 'authored, and must not be regenerated away';
      await writeFile(declaration, JSON.stringify(doc, null, 2), 'utf8');
      await writeStandInDeclaration(root);
      expect(
        (JSON.parse(readFileSync(declaration, 'utf8')) as Record<string, unknown>)['_source'],
        'the writer discarded the authored prose',
      ).toBe('authored, and must not be regenerated away');

      // THE PROPERTY THE RULING ASKED FOR, done rather than argued: delete an entire class
      // directory and the register is still there, still naming the OTHER class's placeholder.
      await rm(resolve(root, 'assets/final/creature-battle'), { recursive: true, force: true });
      expect(existsSync(declaration), 'deleting one class took the register with it').toBe(true);
      const survivors = (JSON.parse(readFileSync(declaration, 'utf8')) as { standIns: string[] }).standIns;
      expect(survivors).toEqual([placeholderLabel(other.finalFile)]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Raster invariants
 * ════════════════════════════════════════════════════════════════════════════ */

describe('raster helpers', () => {
  it('clone is deep — a mutated copy does not touch the original', () => {
    const a = rawSprite(8);
    const b = cloneRaster(a);
    b.data[0] = (b.data[0]! + 1) & 0xff;
    expect(rastersEqual(a, b)).toBe(false);
  });

  it('rejects a malformed size', () => {
    expect(() => blankRaster(0, 8)).toThrow();
    expect(() => nearestResample(rawSprite(8), 0, 8)).toThrow(/bad target/);
  });

  it('an all-background image trims to 1×1 rather than throwing mid-batch', () => {
    const white = blankRaster(8, 8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px(white, x, y, [255, 255, 255, 255]);
    const t = trimBackground(white, BG);
    expect([t.width, t.height]).toEqual([1, 1]);
  });
});
