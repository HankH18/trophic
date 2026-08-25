/**
 * tests/unit/overlay-diff.test.ts — the named test `overlay_diff` (build-doc §10.4).
 *
 * §10.4 names it exactly: "`overlay_diff` self-test on synthetic pairs (translated layout must fail,
 * texture-only change must pass)". Both halves are here, on pairs this file builds itself, and both
 * run against the LIVE `balance.overlayDiff` numbers rather than constants of their own — so if
 * someone retunes the threshold in data/balance.json (INV-3), this test measures the new gate and
 * not a remembered one.
 *
 * The texture-only case additionally asserts `iou < 1`. A synthetic "texture change" that happens to
 * leave the edge map untouched would score a perfect 1.0 and pass vacuously — proving only that the
 * function returns a number. The change here is deliberately visible to the Sobel operator (aged
 * blotches, a global tint, fine grain) and still has to clear 0.85, which is the actual claim §8.2
 * makes about img2img at denoise 0.35.
 *
 * No Math.random anywhere (G11): every pattern is a closed-form function of (x, y).
 */
import { describe, expect, it } from 'vitest';
import type { Raster } from '../../tools/postprocess/raster.ts';
import { blankRaster, idx } from '../../tools/postprocess/raster.ts';
import {
  dilate,
  luminance,
  nextDenoise,
  overlayDiff,
  sobelMagnitude,
  thresholdEdges,
  walkableCells,
  walkableMaskFor,
  SOBEL_MAX,
} from '../../tools/overlay-diff/index.ts';
import { collisionGrid, denoiseLadder, overlayDiffConfig } from '../../tools/overlay-diff/config.ts';
import { validateContent } from '../../core/schemas';

const content = validateContent();
const CFG = overlayDiffConfig(content.balance);
const GRID = collisionGrid(content.balance);
const LADDER = denoiseLadder(content.balance);

const SIZE = 256;

/* ────────────────────────────────────────────────────────────────────────────
 * Synthetic map construction. Everything is hard-edged and high-contrast so the
 * edge map is unambiguous and the assertions are about the GATE, not about
 * whether a fixture happened to land near the Sobel threshold.
 * ──────────────────────────────────────────────────────────────────────────── */

function setPx(r: Raster, x: number, y: number, v: number): void {
  if (x < 0 || y < 0 || x >= r.width || y >= r.height) return;
  const i = idx(r, x, y);
  r.data[i] = v;
  r.data[i + 1] = v;
  r.data[i + 2] = v;
  r.data[i + 3] = 255;
}

function getPx(r: Raster, x: number, y: number): number {
  const cx = Math.max(0, Math.min(r.width - 1, x));
  const cy = Math.max(0, Math.min(r.height - 1, y));
  return r.data[idx(r, cx, cy)]!;
}

function rect(r: Raster, x0: number, y0: number, w: number, h: number, v: number): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPx(r, x, y, v);
}

/** A layout: open ground, a crossing path, four huts and a pond. Hard edges throughout. */
function baseMap(): Raster {
  const r = blankRaster(SIZE, SIZE);
  rect(r, 0, 0, SIZE, SIZE, 120); // ground
  rect(r, 110, 0, 28, SIZE, 230); // north-south path
  rect(r, 0, 110, SIZE, 28, 230); // east-west path
  rect(r, 24, 24, 46, 40, 20); // hut NW
  rect(r, 176, 30, 52, 44, 20); // hut NE
  rect(r, 30, 172, 44, 48, 20); // hut SW
  rect(r, 180, 180, 50, 46, 20); // hut SE
  rect(r, 150, 148, 34, 26, 60); // pond
  return r;
}

/**
 * The collision mask for that layout: the paths and the open ground are walkable, the huts and the
 * pond are not. Authored at map resolution here; `walkableCells` reduces it to the 64×64 grid the
 * game actually moves on.
 */
function collisionMask(): Raster {
  const r = blankRaster(SIZE, SIZE);
  rect(r, 0, 0, SIZE, SIZE, 255);
  rect(r, 24, 24, 46, 40, 0);
  rect(r, 176, 30, 52, 44, 0);
  rect(r, 30, 172, 44, 48, 0);
  rect(r, 180, 180, 50, 46, 0);
  rect(r, 150, 148, 34, 26, 0);
  return r;
}

/**
 * A texture-only aged variant: the layout is untouched, the surface is not.
 *   · a global tint, as an aged pass does
 *   · fine grain, closed-form and far below the Sobel threshold
 *   · small blotches of rot/moss, which DO register as edges — so the score is a real measurement
 *     and not a tautology.
 *
 * `tint` is a parameter because the two settings measure different things: 0.94 is an ordinary aged
 * pass and must clear the bar comfortably, while 0.9 is aggressive enough to push the huts' own
 * contrast under the Sobel threshold and lands within 0.02 of it. Both must pass, and the second is
 * the one that would notice if the operator or the normalisation quietly changed.
 */
function texturedVariant(base: Raster, tint = 0.94, blotches = 16): Raster {
  const r = blankRaster(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const grain = 4 * Math.sin(x / 7.5) * Math.cos(y / 9.5);
      setPx(r, x, y, Math.max(0, Math.min(255, Math.round(getPx(base, x, y) * tint + grain))));
    }
  }
  for (let i = 0; i < blotches; i++) {
    const bx = 8 + ((i * 37) % (SIZE - 16));
    const by = 8 + ((i * 61) % (SIZE - 16));
    rect(r, bx, by, 3, 3, 40);
  }
  return r;
}

/** The failure case §8.2 exists to catch: the same painting, shifted. The mask no longer fits it. */
function translatedVariant(base: Raster, dx: number, dy: number): Raster {
  const r = blankRaster(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const sx = x - dx;
      const sy = y - dy;
      const inside = sx >= 0 && sy >= 0 && sx < SIZE && sy < SIZE;
      setPx(r, x, y, inside ? getPx(base, sx, sy) : 120);
    }
  }
  return r;
}

/* ════════════════════════════════════════════════════════════════════════════
 * overlay_diff — build-doc §10.4
 * ════════════════════════════════════════════════════════════════════════════ */

describe('overlay_diff — build-doc §8.2 / §10.4', () => {
  const base = baseMap();
  const mask = collisionMask();

  it('reads its numbers from data/balance.json, not from constants of its own (G11 / INV-3)', () => {
    expect(CFG.iouThreshold).toBe(content.balance.overlayDiff.iouThreshold);
    expect(CFG.sobelThreshold).toBe(content.balance.overlayDiff.sobelThreshold);
    expect(CFG.dilatePx).toBe(content.balance.overlayDiff.dilatePx);
    expect(GRID).toEqual({ cols: content.balance.map.collisionCols, rows: content.balance.map.collisionRows });
  });

  it('a texture-only change PASSES', () => {
    const result = overlayDiff({ base, candidate: texturedVariant(base), mask, grid: GRID, config: CFG });
    expect(result.accepted, result.reason).toBe(true);
    expect(result.iou).toBeGreaterThanOrEqual(CFG.iouThreshold);
    // …and the change was real: a variant that left the edge map untouched would score exactly 1
    // and prove nothing at all.
    expect(result.iou).toBeLessThan(1);
    expect(result.union).toBeGreaterThan(result.intersection);
  });

  it('an AGGRESSIVE texture pass still passes, but only just — the bar is where §8.2 put it', () => {
    // A 10% dim drops the huts' own contrast (100/255) under the Sobel threshold, so ~780 base edge
    // pixels vanish on top of the blotches. This is the realistic worst case for an aged variant
    // that has not moved anything, and it clears 0.85 by under 0.02.
    const result = overlayDiff({ base, candidate: texturedVariant(base, 0.9, 16), mask, grid: GRID, config: CFG });
    expect(result.accepted, result.reason).toBe(true);
    expect(result.iou).toBeGreaterThanOrEqual(CFG.iouThreshold);
    expect(result.iou).toBeLessThan(CFG.iouThreshold + 0.05);
  });

  it('a translated layout FAILS', () => {
    const result = overlayDiff({ base, candidate: translatedVariant(base, 12, 12), mask, grid: GRID, config: CFG });
    expect(result.accepted, result.reason).toBe(false);
    expect(result.iou).toBeLessThan(CFG.iouThreshold);
    expect(result.reason).toMatch(/collision mask/);
  });

  it('fails a layout translated by a single collision cell — the smallest drift that breaks the mask', () => {
    const cell = content.balance.map.collisionCellPx;
    const result = overlayDiff({
      base,
      candidate: translatedVariant(base, cell, 0),
      mask,
      grid: GRID,
      config: CFG,
    });
    expect(result.accepted, `IoU ${result.iou}`).toBe(false);
  });

  it('an identical candidate scores 1.0 — the gate is not rejecting everything', () => {
    const result = overlayDiff({ base, candidate: baseMap(), mask, grid: GRID, config: CFG });
    expect(result.iou).toBe(1);
    expect(result.accepted).toBe(true);
  });

  it('BINDS — raising the threshold above the textured score turns the pass into a fail', () => {
    const loose = overlayDiff({ base, candidate: texturedVariant(base), mask, grid: GRID, config: CFG });
    const strict = overlayDiff({
      base,
      candidate: texturedVariant(base),
      mask,
      grid: GRID,
      config: { ...CFG, iouThreshold: Math.min(1, loose.iou + 0.001) },
    });
    expect(loose.accepted).toBe(true);
    expect(strict.accepted).toBe(false);
    expect(strict.iou).toBeCloseTo(loose.iou, 10);
  });

  it('restricting to walkable cells is what lets an aged variant pass at all', () => {
    // Rebuild the huts somewhere else entirely — a change the collision mask already blocks.
    const rebuilt = texturedVariant(base);
    rect(rebuilt, 24, 24, 46, 40, 108);
    rect(rebuilt, 176, 30, 52, 44, 108);
    rect(rebuilt, 40, 34, 30, 26, 15);
    rect(rebuilt, 186, 40, 34, 30, 15);
    const restricted = overlayDiff({ base, candidate: rebuilt, mask, grid: GRID, config: CFG });
    const unrestricted = overlayDiff({ base, candidate: rebuilt, grid: GRID, config: CFG });
    expect(restricted.iou).toBeGreaterThan(unrestricted.iou);
    expect(restricted.walkable).toBeLessThan(unrestricted.walkable);
  });

  it('refuses a candidate of a different size rather than resampling the edges away', () => {
    expect(() => overlayDiff({ base, candidate: blankRaster(128, 128), mask, grid: GRID, config: CFG })).toThrow(
      /base is 256x256 but the candidate is 128x128/,
    );
  });

  it('REJECTS the degenerate cases instead of scoring them 1.0', () => {
    const flat = blankRaster(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) setPx(flat, x, y, 120);
    const blank = overlayDiff({ base: flat, candidate: blankRaster(SIZE, SIZE), mask, grid: GRID, config: CFG });
    expect(blank.accepted).toBe(false);
    expect(blank.degenerate).toMatch(/any edge/);

    const blocked = blankRaster(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) setPx(blocked, x, y, 0);
    const noWalkable = overlayDiff({ base, candidate: baseMap(), mask: blocked, grid: GRID, config: CFG });
    expect(noWalkable.accepted).toBe(false);
    expect(noWalkable.degenerate).toMatch(/walkable/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The pieces, so a failure above localises
 * ════════════════════════════════════════════════════════════════════════════ */

describe('overlay-diff internals', () => {
  it('luminance is Rec. 709 and composites alpha over white', () => {
    const r = blankRaster(2, 1);
    r.data.set([255, 255, 255, 255, 0, 0, 0, 0]);
    const lum = luminance(r);
    expect(lum[0]).toBeCloseTo(1, 6);
    expect(lum[1]).toBeCloseTo(1, 6); // transparent black over white is white
  });

  it('a clean step gives a normalised Sobel magnitude of 4/(4√2), and a flat field gives zero', () => {
    const step = blankRaster(8, 8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) setPx(step, x, y, x < 4 ? 0 : 255);
    const mag = sobelMagnitude(luminance(step), 8, 8);
    expect(mag[3 * 8 + 3]!).toBeCloseTo(4 / SOBEL_MAX, 5);
    const flat = blankRaster(8, 8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) setPx(flat, x, y, 90);
    expect(Math.max(...sobelMagnitude(luminance(flat), 8, 8))).toBe(0);
  });

  it('dilate grows a single pixel into a (2r+1)² square and is order-independent', () => {
    const m = new Uint8Array(11 * 11);
    m[5 * 11 + 5] = 1;
    const d = dilate(m, 11, 11, 2);
    expect(d.reduce((a, b) => a + b, 0)).toBe(25);
    expect(d[3 * 11 + 3]).toBe(1);
    expect(d[2 * 11 + 5]).toBe(0);
    expect(dilate(m, 11, 11, 0)).toEqual(m);
  });

  it('thresholdEdges is a plain comparison against the tunable', () => {
    const mag = Float32Array.from([0, 0.2, 0.25, 0.9]);
    expect(Array.from(thresholdEdges(mag, 0.25))).toEqual([0, 0, 1, 1]);
  });

  it('walkableCells reduces a mask to the collision grid by majority vote', () => {
    const mask = blankRaster(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) setPx(mask, x, y, x < 32 ? 255 : 0);
    const cells = walkableCells(mask, { cols: 8, rows: 8 });
    expect(cells.slice(0, 4)).toEqual(new Uint8Array([1, 1, 1, 1]));
    expect(cells.slice(4, 8)).toEqual(new Uint8Array([0, 0, 0, 0]));
  });

  it('a transparent mask pixel is BLOCKED, not walkable', () => {
    const mask = blankRaster(4, 4); // all zeroes => alpha 0
    expect(Array.from(walkableCells(mask, { cols: 2, rows: 2 }))).toEqual([0, 0, 0, 0]);
  });

  it('walkableMaskFor expands cells back over the map at map resolution', () => {
    const mask = blankRaster(8, 8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) setPx(mask, x, y, y < 4 ? 255 : 0);
    const px = walkableMaskFor(mask, { cols: 2, rows: 2 }, 16, 16);
    expect(px[0]).toBe(1);
    expect(px[15 * 16 + 15]).toBe(0);
  });

  it('the denoise ladder walks 0.35 → 0.20 and then stops (§8.2 / §9.5)', () => {
    const seen: number[] = [];
    let d: number | null = LADDER.denoiseStart;
    while (d !== null) {
      seen.push(d);
      d = nextDenoise(d, LADDER);
    }
    expect(seen[0]).toBe(LADDER.denoiseStart);
    expect(seen[seen.length - 1]).toBeGreaterThanOrEqual(LADDER.denoiseFloor);
    expect(nextDenoise(LADDER.denoiseFloor, LADDER)).toBeNull();
    expect(seen).toEqual([0.35, 0.3, 0.25, 0.2]);
  });
});
