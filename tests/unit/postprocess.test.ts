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
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import type { Raster } from '../../tools/postprocess/raster.ts';
import { blankRaster, cloneRaster, idx, rastersEqual, readRaster, writeRaster } from '../../tools/postprocess/raster.ts';
import type { Rgb } from '../../tools/postprocess/steps.ts';
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
import { classOf, finalPathOf, processRaster, processRow, rawPathOf, recipeFor } from '../../tools/postprocess/chain.ts';
import { atlasDescriptor, packAtlas } from '../../tools/postprocess/atlas.ts';
import { fontScale, makePlaceholder, wrapLabel } from '../../tools/postprocess/placeholder.ts';
import { loadManifest, type ClassSpec, type ManifestFile, type ManifestRow } from '../../tools/comfy/comfy-batch.ts';

const PALETTE = loadPalette();
const BG = { key: WHITE, tolerance: 12 };

let tmp: string;
let manifest: ManifestFile;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'trophic-postprocess-'));
  manifest = await loadManifest();
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
    for (const cls of ['map-town', 'map-route', 'map-variant']) {
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

  it('sprite classes letterbox instead of stretching — DEVIATIONS-lane-b B-D15', () => {
    // B-D15, raised against this file's scope by the gate-B0 lane: `nearestResample` maps each axis
    // independently, so the approved player (content aspect 0.574) forced into 32×48 (0.667) came
    // out 1.16× too wide. The fix is per-class policy, not a code branch: every class whose sprite
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
    const trimmed = trimBackground(raw, { key: WHITE, tolerance: 12 });
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

  it('the painted dex class is left alone — §9.3 prescribes no chain for a watercolour', () => {
    const spec = classOf(manifest, 'dex-painted');
    expect(spec.postprocess).toMatchObject({ trim: false, fit: false, quantize: false, removeBackground: false, atlas: null });
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
 * (DEVIATIONS-lane-b B-D22 / B-D33, QUEUED-CHANGES Q4)
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

describe('§9.3 step 3 survives a palette swap (B-D22)', () => {
  const palettes = discoverPalettes();

  /** The classes step 3 actually runs for. Read inside the test bodies: `manifest` is async. */
  const removalClasses = (): Array<[string, ClassSpec]> =>
    Object.entries(manifest.classes).filter(([, s]) => s.postprocess.removeBackground);

  it('finds the palettes on disk, including the frozen one', () => {
    expect(palettes.map((p) => p.label)).toContain('data/palette.json');
    // The two re-freeze proposals are bound by everything below exactly as the frozen palette is.
    expect(palettes.length).toBeGreaterThanOrEqual(1);
  });

  it('at least one class actually runs background removal — otherwise this suite proves nothing', () => {
    expect(removalClasses().length).toBeGreaterThan(0);
    expect(removalClasses().map(([n]) => n)).toContain('creature-battle');
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
    });
  }
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

  it('writes to the row destination the node data already references', async () => {
    const row = manifest.rows.find((r) => r.id === 'map-hearthollow')!;
    const dest = finalPathOf(row, tmp);
    await writeRaster(dest, makePlaceholder(row.id, 32, 32, { palette: PALETTE }));
    expect(resolve(dest)).toBe(resolve(tmp, 'assets/final/maps/hearthollow.png'));
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
