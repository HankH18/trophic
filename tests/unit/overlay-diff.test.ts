/**
 * tests/unit/overlay-diff.test.ts — the named test `overlay_diff` (build-doc §10.4).
 *
 * §10.4 names it exactly: "`overlay_diff` self-test on synthetic pairs (translated layout must fail,
 * texture-only change must pass)". Both halves are here, and both run against the LIVE
 * `balance.overlayDiff` numbers rather than constants of their own — so if someone retunes the
 * threshold in data/balance.json (INV-3), this test measures the new gate and not a remembered one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE USED TO PROVE, AND WHY THAT WAS NOT ENOUGH.
 * ─────────────────────────────────────────────────────────────────────────────
 * The previous version passed 18/18 while the gate had three reproduced critical defects, because
 * of three specific weaknesses this file now closes:
 *
 *   1. IT RAN AT THE WRONG SCALE. The fixture was 256² while the collision grid comes from balance
 *      (64×64), so every case ran on 4px collision cells instead of the game's 16px — and the test
 *      named "fails a layout translated by a single collision cell" passed `collisionCellPx` = 16
 *      into a 256² image, which is FOUR of that fixture's own cells. Every fixture here is
 *      `balance.map.mapNativePx` square, so a cell is a cell.
 *   2. BOTH "TRANSLATED LAYOUT" CASES MOVED THE ENTIRE FRAME. Global translation is caught with an
 *      enormous margin (a 2px whole-frame shift scores 0.7138 on the real map), so those tests could
 *      never go red for the reason they claimed. img2img at denoise 0.35 does not translate the
 *      frame; it re-imagines regions. Every layout case below moves PART of the map and leaves the
 *      rest byte-identical, which is the mode that used to pass.
 *   3. THE ONE TEST THAT MOVED A BUILDING ASSERTED THE WRONG PROPERTY. It checked only that
 *      `restricted.iou > unrestricted.iou` — and its own fixture scored 0.8620 ACCEPT restricted
 *      against 0.7192 REJECT unrestricted, i.e. it green-lit the walkable restriction turning a
 *      correct rejection into an acceptance. That case is below, asserting `accepted` in both.
 *
 * It also asserted the brightness bug as a feature ("a 10% dim drops the huts' contrast under the
 * Sobel threshold … and it clears 0.85 by under 0.02"). On the real painted map that same 10% dim
 * scored 0.8197 and was REJECTED with the layout byte-identical. Contrast invariance is now a
 * property, asserted directly.
 *
 * REAL ART, NOT ONLY SYNTHETICS. Five real 1024² generated maps live in the repo, so the headline
 * cases run on those too. A synthetic town proves the arithmetic; a painted map is what the gate
 * will actually see.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AND THEN THIS FILE PASSED 38/38 WHILE TWO MORE REPRODUCED DEFECTS WERE LIVE.
 * ─────────────────────────────────────────────────────────────────────────────
 * The rewrite above fixed the SCALE and the SHAPE of the fixtures and then measured them at ONE
 * POINT. Its real-map block moved a single block size (8×CELL = 128px) at a single position
 * (300,300) on each map — so it could not see that a 64×64 px feature, LARGER than the 32×48
 * player, displaced by one whole collision cell was ACCEPTED on pt-map-brackwater at (300,300) and
 * on pt-map-cindershelf at (500,200) and (400,400). Nor that a change confined entirely to BLOCKED
 * cells rejected a variant whose walkable pixels were byte-identical. What this file does about it:
 *
 *   · every size is tried at FIVE positions and BOTH displacements, on every real map;
 *   · the additive half of an aging pass (rot blotches) is asserted to PASS on real art, because
 *     the criterion that catches a displacement must not catch a mark appearing;
 *   · the isolation the walkable restriction is specified to give is asserted directly — zero
 *     walkable edge pixels may move for a change confined to blocked cells — with the coupling it
 *     replaces asserted to still exist over the whole frame, so the fix is proved to be the cause;
 *   · the rejection MESSAGE is asserted to name a rectangle that overlaps the thing that moved;
 *   · the collision-mask encoding this all rests on gets its own block, including a test that goes
 *     RED the day a real mask lands, because none of these numbers has ever seen one.
 *
 * No Math.random anywhere (G11): every pattern is a closed-form function of (x, y).
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Raster } from '../../tools/postprocess/raster.ts';
import { blankRaster, idx, readRaster } from '../../tools/postprocess/raster.ts';
import { REPO_ROOT } from '../../tools/postprocess/palette.ts';
import {
  contrastRange,
  CONTRAST_TAIL,
  dilate,
  edgeMap,
  luminance,
  nextDenoise,
  overlayDiff,
  sobelMagnitude,
  thresholdEdges,
  walkableCells,
  walkableMaskFor,
  cellsToRaster,
  MASK_ENCODING,
  SOBEL_MAX,
} from '../../tools/overlay-diff/index.ts';
import { collisionGrid, denoiseLadder, driftFootprint, overlayDiffConfig } from '../../tools/overlay-diff/config.ts';
import { validateContent } from '../../core/schemas';
import published from '../../tools/artverify/published-measurements.json';

const content = validateContent();
const CFG = overlayDiffConfig(content.balance);
const GRID = collisionGrid(content.balance);
const LADDER = denoiseLadder(content.balance);
const MAP = content.balance.map;

/** The production map size. A 256² fixture would run this gate on 4px cells; the game uses 16px. */
const SIZE = MAP.mapNativePx;
const CELL = MAP.collisionCellPx;

/* ────────────────────────────────────────────────────────────────────────────
 * Synthetic map construction, at the size the game actually paints.
 * Everything is hard-edged and high-contrast so the edge map is unambiguous and the
 * assertions are about the GATE, not about whether a fixture landed near a threshold.
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

/** Colour a rectangle by a per-pixel function of the existing value — texture, never geometry. */
function repaint(src: Raster, f: (v: number, x: number, y: number) => number): Raster {
  const r = blankRaster(src.width, src.height);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      setPx(r, x, y, Math.max(0, Math.min(255, Math.round(f(getPx(src, x, y), x, y)))));
    }
  }
  return r;
}

const HUTS = [
  { x: 6, y: 6, w: 8, h: 7 },
  { x: 44, y: 7, w: 9, h: 7 },
  { x: 7, y: 43, w: 8, h: 8 },
  { x: 45, y: 45, w: 9, h: 8 },
] as const; // positions in COLLISION CELLS

/** Open ground, two crossing paths, four huts and a pond. `moveHut` shifts hut 0 and nothing else. */
function baseMap(moveHutCells = 0): Raster {
  const r = blankRaster(SIZE, SIZE);
  rect(r, 0, 0, SIZE, SIZE, 120); // ground
  rect(r, 28 * CELL, 0, 7 * CELL, SIZE, 230); // north-south path
  rect(r, 0, 28 * CELL, SIZE, 7 * CELL, 230); // east-west path
  HUTS.forEach((h, i) => {
    const d = i === 0 ? moveHutCells * CELL : 0;
    rect(r, h.x * CELL + d, h.y * CELL + d, h.w * CELL, h.h * CELL, 20);
  });
  rect(r, 38 * CELL, 37 * CELL, 8 * CELL, 6 * CELL, 60); // pond
  return r;
}

/** The collision mask for that layout: paths and open ground walkable, huts and pond not. */
function collisionMask(): Raster {
  const r = blankRaster(SIZE, SIZE);
  rect(r, 0, 0, SIZE, SIZE, 255);
  for (const h of HUTS) rect(r, h.x * CELL, h.y * CELL, h.w * CELL, h.h * CELL, 0);
  rect(r, 38 * CELL, 37 * CELL, 8 * CELL, 6 * CELL, 0);
  return r;
}

/**
 * A texture-only aged variant: the layout is untouched, the surface is not.
 *   · a global tint, as an aged pass does
 *   · fine grain, closed-form
 *   · small blotches of rot/moss, which DO register as edges — so the score is a real measurement
 *     and not a tautology.
 */
function texturedVariant(base: Raster, tint = 0.94, blotches = 24): Raster {
  const r = repaint(base, (v, x, y) => v * tint + 4 * Math.sin(x / 7.5) * Math.cos(y / 9.5));
  for (let i = 0; i < blotches; i++) {
    const bx = 8 + ((i * 149) % (SIZE - 24));
    const by = 8 + ((i * 251) % (SIZE - 24));
    rect(r, bx, by, 5, 5, 40);
  }
  return r;
}

/*
 * A NOTE ON THE BLOTCH COUNT, because it is a tuned fixture parameter and pretending otherwise
 * would be dishonest. This synthetic town is five flat tones, so only 3.3% of its pixels are edges
 * — far sparser than a painted map (10.1% inside walkable cells on the real town map). Speckle
 * therefore weighs much more heavily here than on real art: 24 blotches score 0.9210, 64 score
 * 0.8218 and are REJECTED. That is a property of §8.2's IoU, not of this fixture; the number is set
 * where the change is plainly visible to the edge map (IoU < 1, ~37 cells touched) while remaining
 * a texture pass. The real-map block below is what proves the gate on real edge density.
 */

/** The whole painting, shifted. Caught easily — kept because §10.4 names it. */
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

/** ONE hut erased, everything else byte-identical. Ground repainted where it stood. */
function erasedHut(base: Raster): Raster {
  const r = blankRaster(SIZE, SIZE);
  r.data.set(base.data);
  const h = HUTS[0]!;
  rect(r, h.x * CELL, h.y * CELL, h.w * CELL, h.h * CELL, 120);
  return r;
}

const run = (base: Raster, candidate: Raster, mask?: Raster) =>
  overlayDiff({ base, candidate, ...(mask ? { mask } : {}), grid: GRID, config: CFG });

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
    expect(GRID).toEqual({ cols: MAP.collisionCols, rows: MAP.collisionRows });
    // The drift footprint is the player's own, in cells — a division of balance.map, not a new knob.
    expect(CFG.driftFootprint).toEqual(driftFootprint(content.balance));
    expect(CFG.driftFootprint).toEqual({
      cols: Math.ceil(MAP.playerSpriteW / MAP.collisionCellPx),
      rows: Math.ceil(MAP.playerSpriteH / MAP.collisionCellPx),
    });
  });

  it('RUNS AT THE PRODUCTION SCALE — one fixture cell is one collision cell', () => {
    // The old fixture was 256² against a 64×64 grid, i.e. 4px cells: every walkable-cell claim in
    // this file was measured at a scale the game never uses, and dilatePx=2 was four times more
    // forgiving relative to a cell than in production.
    expect(base.width).toBe(MAP.mapNativePx);
    expect(base.width / GRID.cols).toBe(MAP.collisionCellPx);
    expect(base.height / GRID.rows).toBe(MAP.collisionCellPx);
  });

  it('a texture-only change PASSES', () => {
    const result = run(base, texturedVariant(base), mask);
    expect(result.accepted, result.reason).toBe(true);
    expect(result.iou).toBeGreaterThanOrEqual(CFG.iouThreshold);
    // …and the change was real: a variant that left the edge map untouched would score exactly 1
    // and prove nothing at all.
    expect(result.iou).toBeLessThan(1);
    expect(result.union).toBeGreaterThan(result.intersection);
  });

  it('an identical candidate scores 1.0 — the gate is not rejecting everything', () => {
    const result = run(base, baseMap(), mask);
    expect(result.iou).toBe(1);
    expect(result.cellsDrifted).toBe(0);
    expect(result.largestDrift).toBe(0);
    expect(result.accepted).toBe(true);
  });

  it('a translated layout FAILS (§10.4, verbatim)', () => {
    const result = run(base, translatedVariant(base, CELL, CELL), mask);
    expect(result.accepted, result.reason).toBe(false);
    expect(result.iou).toBeLessThan(CFG.iouThreshold);
    expect(result.reason).toMatch(/collision mask/);
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * THE FAILURE MODE img2img ACTUALLY PRODUCES: part of the map moves, the rest does not.
   * Every one of these was ACCEPTED by the single-frame-ratio gate.
   * ────────────────────────────────────────────────────────────────────────── */

  it('a SINGLE BUILDING moved by one collision cell FAILS, with the rest of the frame untouched', () => {
    const moved = baseMap(1);
    const result = run(base, moved, mask);
    expect(result.accepted, result.reason).toBe(false);
    // …and it fails on the LOCAL criterion, because a frame-wide ratio cannot see a local move.
    expect(result.localPass, `IoU ${result.iou} drift ${result.largestDrift}`).toBe(false);
    expect(result.largestDrift).toBeGreaterThanOrEqual(result.driftLimit);
    expect(result.worstDrift).toBeDefined();
  });

  it('…and at every displacement from one cell to eight, monotonically obviously', () => {
    for (const cells of [1, 2, 4, 8]) {
      const result = run(base, baseMap(cells), mask);
      expect(result.accepted, `moved ${cells} cell(s): ${result.reason}`).toBe(false);
    }
  });

  it('…and the global IoU ALONE would have accepted the small ones — that is the defect, measured', () => {
    // Closed form: displacing a fraction f of the edge pixels gives IoU ≈ (1−f)/(1+f), which is
    // ≥ 0.85 for every f ≤ 0.081. So a frame-wide ratio is arithmetically incapable of failing a
    // change confined to a small part of the frame, however wrong that part is.
    const oneCell = run(base, baseMap(1), mask);
    expect(oneCell.globalPass).toBe(true); // §8.2's own criterion says yes…
    expect(oneCell.localPass).toBe(false); // …and the layout has still moved.
    expect(oneCell.accepted).toBe(false);
  });

  it('a building ERASED entirely FAILS — the mask would still block open ground', () => {
    const result = run(base, erasedHut(base), mask);
    expect(result.accepted, result.reason).toBe(false);
    expect(result.largestDrift).toBeGreaterThanOrEqual(result.driftLimit);
  });

  it('a texture pass over a moved building still FAILS — repainting does not launder a layout change', () => {
    const result = run(base, texturedVariant(baseMap(2)), mask);
    expect(result.accepted, result.reason).toBe(false);
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Contrast invariance — bible §6's aging arcs are TONE passes.
   * ────────────────────────────────────────────────────────────────────────── */

  it('a linear tint of ANY depth is invariant: the edge map does not move with the brightness', () => {
    for (const tint of [0.98, 0.94, 0.9, 0.8, 0.7, 1.15]) {
      const dimmed = repaint(base, (v) => v * tint);
      const result = run(base, dimmed, mask);
      expect(result.accepted, `tint ${tint}: ${result.reason}`).toBe(true);
      expect(result.iou, `tint ${tint}`).toBeGreaterThan(0.99);
    }
  });

  it('BINDS — the invariance comes from normalising to the image\'s own contrast, not from luck', () => {
    // The reading of `sobelThreshold` is what changed. Against the RAW luminance a 10% dim moves
    // every gradient by 10%, so edges sitting near the threshold flip en masse; against the image's
    // own contrast range they do not move at all.
    const dim = repaint(base, (v) => v * 0.9);
    const rawBase = thresholdEdges(sobelMagnitude(luminance(base), SIZE, SIZE), CFG.sobelThreshold);
    const rawDim = thresholdEdges(sobelMagnitude(luminance(dim), SIZE, SIZE), CFG.sobelThreshold);
    const rawSame = rawBase.every((v, i) => v === rawDim[i]);
    expect(rawSame).toBe(false); // the raw reading DOES move with brightness…

    const normBase = edgeMap(base, CFG);
    const normDim = edgeMap(dim, CFG);
    let differing = 0;
    for (let i = 0; i < normBase.length; i++) if (normBase[i] !== normDim[i]) differing++;
    // …and the normalised one is stable to within 8-bit rounding of the tint itself.
    expect(differing / normBase.length).toBeLessThan(0.001);
  });

  it('structure at ORDINARY painted contrast registers as an edge — it used to vanish entirely', () => {
    // Measured before the fix: with the threshold read as a fraction of 4√2 full scale, an edge
    // needed ΔL ≥ 0.3557 in a single pixel. A dark-brown building (lum 0.225) on mid-green ground
    // (lum 0.518) is ΔL = 0.293 and produced ZERO edge pixels, so moving it scored IoU exactly
    // 1.0000 and was ACCEPTED.
    const town = (shift: number): Raster => {
      const r = blankRaster(SIZE, SIZE);
      const put = (x0: number, y0: number, w: number, h: number, c: [number, number, number]) => {
        for (let y = y0; y < y0 + h; y++) {
          for (let x = x0; x < x0 + w; x++) {
            if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
            const i = idx(r, x, y);
            r.data[i] = c[0];
            r.data[i + 1] = c[1];
            r.data[i + 2] = c[2];
            r.data[i + 3] = 255;
          }
        }
      };
      put(0, 0, SIZE, SIZE, [120, 140, 90]); // ground, lum .518
      put(0, 30 * CELL, SIZE, 5 * CELL, [135, 150, 105]);
      put(30 * CELL, 0, 5 * CELL, SIZE, [135, 150, 105]);
      put(12 * CELL + shift, 12 * CELL + shift, 14 * CELL, 11 * CELL, [70, 55, 45]); // building, lum .225
      put(40 * CELL, 40 * CELL, 15 * CELL, 12 * CELL, [70, 55, 45]);
      return r;
    };
    const b = town(0);
    const edges = edgeMap(b, CFG);
    expect(edges.reduce<number>((n, v) => n + v, 0)).toBeGreaterThan(0);

    const identical = run(b, town(0));
    expect(identical.iou).toBe(1);
    expect(identical.accepted).toBe(true);

    for (const cells of [1, 2]) {
      const moved = run(b, town(cells * CELL));
      expect(moved.accepted, `moved ${cells} cell(s): ${moved.reason}`).toBe(false);
      expect(moved.iou, `moved ${cells} cell(s)`).toBeLessThan(1);
    }
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * The walkable restriction — §8.2's, including the part §8.2 does not mention.
   * ────────────────────────────────────────────────────────────────────────── */

  it('the walkable restriction is REAL — it scores fewer pixels than the whole frame', () => {
    const restricted = run(base, texturedVariant(base), mask);
    const unrestricted = run(base, texturedVariant(base));
    expect(restricted.walkable).toBeLessThan(unrestricted.walkable);
    expect(unrestricted.walkable).toBe(SIZE * SIZE);
  });

  it('the restriction COSTS: it throws away the cells that carry most of the structure', () => {
    // Measured on assets/approved-trials/town-map.png: edges are 3.01× denser in the BLOCKED cells
    // (30.5% of pixels) than in the walkable ones (10.1%). §8.2 mandates the restriction and it is
    // right to — a year variant is supposed to change, and what must not move is where the player
    // walks — but the cost is a fact, not a footnote, so it is measured here.
    const edges = edgeMap(base, CFG);
    const walk = walkableMaskFor(mask, GRID, SIZE, SIZE);
    let walkEdges = 0;
    let walkPx = 0;
    let blockedEdges = 0;
    let blockedPx = 0;
    for (let i = 0; i < walk.length; i++) {
      if (walk[i]) {
        walkPx++;
        if (edges[i]) walkEdges++;
      } else {
        blockedPx++;
        if (edges[i]) blockedEdges++;
      }
    }
    expect(blockedPx).toBeGreaterThan(0);
    expect(blockedEdges / blockedPx).toBeGreaterThan(walkEdges / walkPx);
  });

  it('THE CASE THAT USED TO PROVE THE WRONG THING: rebuilt huts are REJECTED restricted AND unrestricted', () => {
    // The old test built exactly this fixture, measured restricted 0.8620 ACCEPT against
    // unrestricted 0.7192 REJECT — the walkable restriction converting a correct rejection into an
    // acceptance — and then asserted only `restricted.iou > unrestricted.iou`, green-lighting it.
    // The assertion that matters is `accepted`, in both.
    const rebuilt = texturedVariant(base);
    const a = HUTS[0]!;
    const b = HUTS[1]!;
    rect(rebuilt, a.x * CELL, a.y * CELL, a.w * CELL, a.h * CELL, 108);
    rect(rebuilt, b.x * CELL, b.y * CELL, b.w * CELL, b.h * CELL, 108);
    rect(rebuilt, (a.x + 2) * CELL, (a.y + 2) * CELL, (a.w - 2) * CELL, (a.h - 2) * CELL, 15);
    rect(rebuilt, (b.x + 2) * CELL, (b.y + 2) * CELL, (b.w - 2) * CELL, (b.h - 2) * CELL, 15);

    const restricted = run(base, rebuilt, mask);
    const unrestricted = run(base, rebuilt);
    expect(restricted.accepted, `restricted: ${restricted.reason}`).toBe(false);
    expect(unrestricted.accepted, `unrestricted: ${unrestricted.reason}`).toBe(false);
    // The result reports both, so the restriction's effect is visible rather than argued in a comment.
    expect(restricted.unrestrictedIou).toBeCloseTo(unrestricted.iou, 10);
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Refusals
   * ────────────────────────────────────────────────────────────────────────── */

  it('BINDS — raising the threshold above the textured score turns the pass into a fail', () => {
    const loose = run(base, texturedVariant(base), mask);
    const strict = overlayDiff({
      base,
      candidate: texturedVariant(base),
      mask,
      grid: GRID,
      config: { ...CFG, iouThreshold: Math.min(1, loose.iou + 0.001) },
    });
    expect(loose.accepted).toBe(true);
    expect(strict.accepted).toBe(false);
  });

  it('BINDS — shrinking the drift footprint to one cell rejects what the player footprint allows', () => {
    const textured = texturedVariant(base);
    expect(run(base, textured, mask).accepted).toBe(true);
    const paranoid = overlayDiff({
      base,
      candidate: textured,
      mask,
      grid: GRID,
      config: { ...CFG, driftFootprint: { cols: 1, rows: 1 } },
    });
    expect(paranoid.localPass).toBe(false);
    expect(paranoid.globalPass).toBe(true); // the frame-wide ratio is unchanged; only the locality is
  });

  it('refuses a candidate of a different size rather than resampling the edges away', () => {
    expect(() => run(base, blankRaster(128, 128), mask)).toThrow(
      new RegExp(`base is ${SIZE}x${SIZE} but the candidate is 128x128`),
    );
  });

  it('refuses a nonsense drift footprint instead of silently disabling the local criterion', () => {
    expect(() =>
      overlayDiff({ base, candidate: baseMap(), mask, grid: GRID, config: { ...CFG, driftFootprint: { cols: 0, rows: 3 } } }),
    ).toThrow(/drift footprint/);
  });

  it('REJECTS the degenerate cases instead of scoring them 1.0', () => {
    const flat = repaint(base, () => 120);
    const blank = run(flat, blankRaster(SIZE, SIZE), mask);
    expect(blank.accepted).toBe(false);
    expect(blank.degenerate).toMatch(/any edge/);

    const blocked = repaint(base, () => 0);
    const noWalkable = run(base, baseMap(), blocked);
    expect(noWalkable.accepted).toBe(false);
    expect(noWalkable.degenerate).toMatch(/walkable/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The same claims, on the real painted maps this repo actually holds.
 *
 * A synthetic town proves the arithmetic. These are 1024² z_image_turbo outputs — the thing the
 * gate will be pointed at — and every headline case is re-measured on each of them.
 * ════════════════════════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────────────────────────────────
 * THE CORPUS IS PUBLISHED, BECAUSE FOUR FIFTHS OF IT IS NOT IN THE REPOSITORY.
 *
 * ⚠ THIS BLOCK EXISTS BECAUSE THE RESIDUAL TEST BELOW PASSED HERE AND FAILED IN CI, AND THE
 * DIFFERENCE WAS FOUR FILES NOBODY CLONING THIS REPO HAS EVER HAD.
 *
 * Five real 1024² painted maps are named. Exactly ONE — `assets/approved-trials/town-map.png` — is
 * tracked. The other four live under `assets/raw/palette-trials/`, and `.gitignore` carries
 * `assets/raw/**`: they are generator output, kept out of the repository on purpose. So the old
 * `.filter(existsSync)` silently produced a FIVE-map corpus on the machine that generated them and
 * a ONE-map corpus everywhere else, and every test in the block below quietly measured a fifth as
 * much in CI as it did here. The residual test then failed in CI for the only honest reason
 * available to it — on town-map alone a 32px displacement is accepted at 0 of 5 pairs, so
 * `acceptedAt.length > 0` could not hold — and that red said "the corpus is missing" while reading
 * like "the gate regressed".
 *
 * A measurement of an image is not the image. The 25 verdicts are PUBLISHED, in
 * `tools/artverify/published-measurements.json`, with the operator, the fixture, the corpus (by
 * sha256) and the balance they were taken at recorded beside them — the standard
 * `tools/artverify/EVAL-STANDARD.md` applies before any figure may be quoted. What that buys:
 *
 *   · a clean clone re-measures the 5 pairs it CAN reach, for real, against the published verdicts,
 *     and verifies town-map's sha256 first so those verdicts are known to be about these pixels;
 *   · the other 20 are asserted against the published table rather than silently not measured;
 *   · every absent map is asserted to be absent for the RECORDED reason — untracked and ignored —
 *     so a deleted tracked map, or a path that has gone stale, reds instead of shrinking the loop.
 *
 * The corpus is read from the published record rather than typed here, so there is exactly one list
 * and it cannot drift from the verdicts measured over it.
 * ──────────────────────────────────────────────────────────────────────────── */

const RESIDUAL = published.overlayDiff32pxResidual;

/** Every map the published verdicts were measured over — the corpus, not the subset this tree holds. */
const PUBLISHED_MAPS: readonly string[] = RESIDUAL.corpus.maps.map((m) => m.file);

const REAL_MAPS = PUBLISHED_MAPS.filter((p) => existsSync(resolve(REPO_ROOT, p)));
const ABSENT_MAPS = PUBLISHED_MAPS.filter((p) => !existsSync(resolve(REPO_ROOT, p)));

const sha256Of = (rel: string): string =>
  createHash('sha256').update(readFileSync(resolve(REPO_ROOT, rel))).digest('hex');

/** True when git has the path in the index. `--error-unmatch` exits non-zero for anything else. */
function gitTracks(rel: string): boolean {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', rel], { cwd: REPO_ROOT, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** True when a .gitignore rule excludes the path. Exit 1 means "not ignored", which is not an error. */
function gitIgnores(rel: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', rel], { cwd: REPO_ROOT, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * The .gitignore PATTERN excluding a path, as git reports it — `git check-ignore -v` prints
 * `<source>:<line>:<pattern>\t<pathname>`. `gitIgnores()` only answers "some rule matches", which a
 * rule that has moved or widened satisfies just as well as the one the record names.
 */
function gitIgnoreRuleFor(rel: string): string | null {
  try {
    const out = execFileSync('git', ['check-ignore', '-v', '--', rel], {
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

/** True when this repository's history holds at least one commit touching the path. */
function everCommitted(rel: string): boolean {
  try {
    const out = execFileSync('git', ['log', '--all', '--oneline', '-1', '--', rel], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return out.trim() !== '';
  } catch {
    return false;
  }
}

/**
 * ⚠ AND WHETHER `everCommitted` CAN BE ASKED AT ALL. `actions/checkout@v4` clones at depth 1 by
 * default, and in a shallow clone `git log --all -- <path>` reports nothing for every path the tip
 * commit did not touch — indistinguishable from "never committed". Asserting the record's
 * `everCommitted: true` against that would red in CI and only in CI, which is the exact shape of
 * failure this record exists to have removed. So the NEGATIVE half of the claim is checked only
 * where history is here; the positive half needs no history at all, because a tracked file is in
 * HEAD by definition.
 */
const HISTORY_AVAILABLE = ((): boolean => {
  try {
    return (
      execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim() ===
      'false'
    );
  } catch {
    return false;
  }
})();

/* ────────────────────────────────────────────────────────────────────────────
 * THE CORPUS HAS EXACTLY TWO LEGAL STATES, AND A PARTIAL ONE IS NOT A THIRD.
 *
 * ⚠ THIS EXISTS BECAUSE A PARTIAL CORPUS TURNED A LOUD FAILURE INTO A SILENT PASS. The residual
 * test pinned its counts behind `if (REAL_MAPS.length === PUBLISHED_MAPS.length)`, so deleting ONE
 * generator map — `pt-map-cindershelf.png`, which contributes four of the eight accepted verdicts —
 * dropped the file from 73 passed to 68 passed with nothing red. Under the code this replaced, the
 * same tree went RED. A skip condition that widens on its own is worse than the red it replaced.
 *
 * And `tests/gates/asset-palette-contract.test.ts` — written in the same commit, over the same
 * problem — already refused exactly this: "a partial corpus means some bands would be re-measured
 * and others silently taken on trust, which is the mixed evidence this file refuses". Two files
 * ruling opposite ways on one state is not a nuance, it is one of them being wrong. This is the one
 * that was wrong, and the refusing rule is the one that stands.
 *
 * The two legal states, and why they are the only two:
 *   · WHOLE — every published map is here. The machine that generated them; all 25 pairs measurable.
 *   · AS CLONED — exactly the tracked map is here and every untracked one is absent. What a clone
 *     has, permanently, because `.gitignore` carries `assets/raw/**`; 5 pairs measurable.
 * Anything between the two is a tree somebody has been editing, and the sweep silently shrinks to
 * fit it. Both counts are pinned below so the shrink cannot go unnoticed either.
 * ──────────────────────────────────────────────────────────────────────────── */

const TRACKED_MAPS: readonly string[] = RESIDUAL.corpus.maps.filter((m) => m.trackedInGit).map((m) => m.file);
const UNTRACKED_MAPS: readonly string[] = RESIDUAL.corpus.maps.filter((m) => !m.trackedInGit).map((m) => m.file);
const UNTRACKED_PRESENT = UNTRACKED_MAPS.filter((p) => existsSync(resolve(REPO_ROOT, p)));

/** Every published map is on this disk. */
const CORPUS_WHOLE = ABSENT_MAPS.length === 0 && PUBLISHED_MAPS.length > 0;
/** Exactly what a clone has: the tracked map, and none of the untracked ones. */
const CORPUS_AS_CLONED = UNTRACKED_PRESENT.length === 0;

/**
 * Every way this tree is neither WHOLE nor AS CLONED. Collected once, asserted in the always-running
 * corpus test AND again inside the sweep, so the sweep cannot run over a state nobody has vouched for.
 */
function corpusStateProblems(): string[] {
  const problems: string[] = [];
  for (const m of RESIDUAL.corpus.maps) {
    const present = existsSync(resolve(REPO_ROOT, m.file));
    const tracked = gitTracks(m.file);
    if (tracked !== m.trackedInGit) {
      problems.push(`${m.file}: the record says trackedInGit=${m.trackedInGit}, git says ${tracked}`);
      continue;
    }
    if (present) continue;
    if (tracked) {
      problems.push(`${m.file}: TRACKED and missing from the working tree — restore it, this is not the recorded absence`);
      continue;
    }
    if (!gitIgnores(m.file)) {
      problems.push(
        `${m.file}: absent, untracked, and NOT ignored by any .gitignore rule. The recorded reason ` +
          'is `assets/raw/**` generator output; an absence that is not that one is a stale path or ' +
          'a file nobody ever committed, and either way the published verdicts for it are unsourced',
      );
      continue;
    }
    // ⛔ …AND THE DIRECTORY IT WOULD LIVE IN MUST BE ABSENT TOO. `assets/raw/**` is a directory
    // glob, so `git check-ignore` says yes to any invented name underneath it — measured, by
    // rewriting all four pt-map rows to `…-NEVER-EXISTED.png` and watching this file stay green.
    // These four have NO history to check them against (`git log --all -- assets/raw/palette-trials/`
    // is empty; they were never committed), so the directory is the only witness there is: a clone
    // does not have `assets/raw/palette-trials/` at all, and a disk that DOES have it and does not
    // have the named map is holding a stale path, not the deliberate absence.
    const dir = dirname(m.file);
    if (existsSync(resolve(REPO_ROOT, dir))) {
      problems.push(
        `${m.file}: ${dir}/ IS on this disk and this map is not in it. The recorded absence is the ` +
          'whole generator directory being absent, which is what a clone has; a map missing from a ' +
          'directory that is here is a stale path in the published record',
      );
    }
  }
  if (!CORPUS_WHOLE && !CORPUS_AS_CLONED) {
    problems.push(
      `the corpus is PARTLY present: ${UNTRACKED_PRESENT.length} of the ${UNTRACKED_MAPS.length} ` +
        'untracked maps are on disk and the rest are not. That is neither legal state — some pairs ' +
        'would be re-measured and the rest taken on trust, which is the mixed evidence this file ' +
        'refuses, exactly as tests/gates/asset-palette-contract.test.ts refuses it for the reference ' +
        `captures. Present: ${UNTRACKED_PRESENT.join(' ') || 'none'}. Restore the rest or move them all aside.`,
    );
  }
  return problems;
}

/**
 * The open-ground patch the fixture copies over the vacated block, as (x, y) in map pixels. Named
 * because the record publishes it and the record HAD IT TRANSPOSED — `groundPatchSource: [900, 20]`
 * against a `moveBlock(…, 20, 900)` whose `gx` is 20 and whose `gy` is 900 — and nothing read the
 * field, so nothing said so. The verdicts are unaffected: the operator never moved, only the note
 * beside it was wrong.
 */
const GROUND_PATCH_SOURCE: readonly [number, number] = [20, 900];
const [GPX, GPY] = GROUND_PATCH_SOURCE;

/** This file's own repo-relative path and source — the record names it, so the name is checked. */
const SELF_PATH = 'tests/unit/overlay-diff.test.ts';
const SELF_SOURCE = readFileSync(resolve(REPO_ROOT, SELF_PATH), 'utf8');

/**
 * `"<file> :: <symbol>() and <symbol>()"` → the file and the symbols it names. Every `name()` in the
 * tail counts; when the tail names none in that form, its first word is taken as the symbol, which
 * is how `"tools/overlay-diff/index.ts :: overlayDiff — called, never reimplemented"` resolves.
 */
function implementationRefs(spec: string): { file: string; symbols: string[] } | null {
  const [file, rest] = spec.split(' :: ');
  if (file === undefined || rest === undefined) return null;
  const called = [...rest.matchAll(/([A-Za-z_$][\w$]*)\(\)/g)].map((m) => m[1]!);
  if (called.length > 0) return { file, symbols: called };
  const first = rest.trim().split(/[\s(]/)[0] ?? '';
  return /^[A-Za-z_$][\w$]*$/.test(first) ? { file, symbols: [first] } : null;
}

/**
 * True when a source PROVIDES the symbol: declares it as a function or a const, or re-exports it —
 * `tools/overlay-diff/index.ts` is a barrel and provides `overlayDiff` by the third route.
 */
const declaresSymbol = (source: string, symbol: string): boolean =>
  new RegExp(`(?:^|\\n)(?:export )?(?:async )?function ${symbol}\\(`).test(source) ||
  new RegExp(`(?:^|\\n)(?:export )?const ${symbol}(?::| =)`).test(source) ||
  new RegExp(`export\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}`).test(source);

if (ABSENT_MAPS.length > 0) {
  // Loud, named, and in the log of every run that measures less than the published record. A skip
  // that reads like a pass is the failure this whole block exists to remove.
  console.warn(
    `\n⚠ overlay_diff REAL-MAP CORPUS INCOMPLETE — ${REAL_MAPS.length} of ${PUBLISHED_MAPS.length} maps present.\n` +
      ABSENT_MAPS.map((p) => `    ABSENT  ${p}`).join('\n') +
      '\n  These are generator output under assets/raw/**, which .gitignore excludes; they are not in ' +
      'any clone.\n  The 32px residual below re-measures only the pairs this tree can reach and asserts the ' +
      'rest\n  against tools/artverify/published-measurements.json. The absence is asserted to be the ' +
      'recorded\n  one — see "every map absent from this tree is absent for the recorded reason".\n',
  );
}

/** A mask derived from the painting's own luminance: bright ground/paths walkable, dark mass not. */
function maskFromLuminance(src: Raster): Raster {
  const m = blankRaster(src.width, src.height);
  const lum = luminance(src);
  for (let i = 0; i < lum.length; i++) {
    const v = lum[i]! >= 0.45 ? 255 : 0;
    m.data[i * 4] = v;
    m.data[i * 4 + 1] = v;
    m.data[i * 4 + 2] = v;
    m.data[i * 4 + 3] = 255;
  }
  return m;
}

/** Move an S×S block by `d` px, filling the vacated area with a patch of open ground. */
function moveBlock(src: Raster, x0: number, y0: number, S: number, d: number, gx: number, gy: number): Raster {
  const o = blankRaster(src.width, src.height);
  o.data.set(src.data);
  const copy = (sx: number, sy: number, dx: number, dy: number) => {
    if (dx < 0 || dy < 0 || dx >= o.width || dy >= o.height) return;
    const si = idx(src, Math.min(src.width - 1, sx), Math.min(src.height - 1, sy));
    const di = idx(o, dx, dy);
    o.data[di] = src.data[si]!;
    o.data[di + 1] = src.data[si + 1]!;
    o.data[di + 2] = src.data[si + 2]!;
    o.data[di + 3] = 255;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) copy(gx + x, gy + y, x0 + x, y0 + y);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) copy(x0 + x, y0 + y, x0 + x + d, y0 + y + d);
  return o;
}

/** The five positions every size is tried at — one is the (300,300) the old block only ever used. */
const MOVE_POSITIONS = [
  [300, 300],
  [500, 200],
  [200, 500],
  [400, 400],
  [600, 600],
] as const;

/** 24 hard 5×5 rot marks — the additive half of bible §6's aging arcs, at their harshest. */
function blotched(src: Raster): Raster {
  const o = blankRaster(src.width, src.height);
  o.data.set(src.data);
  for (let i = 0; i < 24; i++) {
    const bx = 8 + ((i * 149) % (src.width - 24));
    const by = 8 + ((i * 251) % (src.height - 24));
    for (let y = by; y < by + 5; y++) {
      for (let x = bx; x < bx + 5; x++) {
        const k = idx(o, x, y);
        o.data[k] = 40;
        o.data[k + 1] = 36;
        o.data[k + 2] = 30;
        o.data[k + 3] = 255;
      }
    }
  }
  return o;
}

/** A mask that blocks ONLY a square in the top-left corner — everything else is walkable. */
function cornerMask(width: number, height: number, side: number): Raster {
  const m = blankRaster(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(m, x, y);
      const v = x < side && y < side ? 0 : 255;
      m.data[i] = v;
      m.data[i + 1] = v;
      m.data[i + 2] = v;
      m.data[i + 3] = 255;
    }
  }
  return m;
}

/** A soft additive glow — "vents flare" (bible §6), the local emissive event, closed-form (G11). */
function glow(src: Raster, cx: number, cy: number, radius: number, strength: number): Raster {
  const o = blankRaster(src.width, src.height);
  o.data.set(src.data);
  for (let y = Math.max(0, cy - radius); y < Math.min(src.height, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x < Math.min(src.width, cx + radius); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > radius) continue;
      const k = idx(o, x, y);
      const f = strength * (1 - d / radius);
      for (let c = 0; c < 3; c++) {
        o.data[k + c] = Math.max(0, Math.min(255, Math.round(src.data[k + c]! + 255 * f)));
      }
    }
  }
  return o;
}

/* ════════════════════════════════════════════════════════════════════════════
 * THE HALF THAT ALWAYS RUNS — the published record, and what this tree can reach.
 *
 * Every assertion in this block holds in a clean clone with no `assets/raw/` at all. It is the
 * half that catches the published table drifting from itself, the fixture drifting from the table,
 * and the balance drifting out from under both. The re-measurement below is the other half: it
 * catches the table drifting from the pixels, and it can only run where the pixels are.
 * ════════════════════════════════════════════════════════════════════════════ */

describe('overlay_diff — the published 32px residual, and the corpus it was measured over', () => {
  it('the published corpus is five maps at five positions, named and hashed', () => {
    expect(PUBLISHED_MAPS.length, 'the published corpus is not five maps').toBe(5);
    expect(new Set(PUBLISHED_MAPS).size, 'the published corpus repeats a map').toBe(PUBLISHED_MAPS.length);
    for (const m of RESIDUAL.corpus.maps) {
      expect(m.sha256, `${m.file}: sha256 is not 64 hex characters — a corpus row with no identity`).toMatch(
        /^[0-9a-f]{64}$/,
      );
      expect(m.width, `${m.file}: published width`).toBe(MAP.mapNativePx);
      expect(m.height, `${m.file}: published height`).toBe(MAP.mapNativePx);
    }
    expect(
      new Set(RESIDUAL.corpus.maps.map((m) => m.sha256)).size,
      'two corpus rows share a sha256 — the same image is published twice under two names',
    ).toBe(PUBLISHED_MAPS.length);

    // The fixture parameters are DERIVED from balance here and RECORDED there; they may not part.
    expect(RESIDUAL.operator.blockPx, 'published blockPx is not 2 collision cells').toBe(2 * CELL);
    expect(RESIDUAL.operator.displacementPx, 'published displacementPx is not one collision cell').toBe(CELL);
    expect(
      RESIDUAL.positions.map((p) => [p[0], p[1]]),
      'the published positions are not the positions this file sweeps',
    ).toEqual(MOVE_POSITIONS.map((p) => [p[0], p[1]]));

    // ⛔ AND THE GROUND PATCH THE FIXTURE COPIES FROM, which nothing read. It was published as
    // `[900, 20]` against a `moveBlock(…, gx = 20, gy = 900)` — the two transposed — and the field
    // was mutated to `[10, 10]` in a sabotage sweep without a single test noticing. It is part of
    // the operator: a different patch of ground is a different candidate image and therefore a
    // different verdict.
    expect(
      RESIDUAL.operator.groundPatchSource.map((v) => v),
      `the record publishes the fixture's open-ground patch at (${RESIDUAL.operator.groundPatchSource.join(', ')}); ` +
        `moveBlock() copies from (${GPX}, ${GPY}). A different patch is a different candidate image.`,
    ).toEqual([GPX, GPY]);

    // …and the two files the operator claims to be implemented in must declare what it names. A
    // figure whose operator cannot be re-run is withdrawn by tools/artverify/EVAL-STANDARD.md before
    // it may be quoted; a record naming an operator that does not exist is worse than one naming none.
    const specs: { what: string; spec: string }[] = [
      { what: 'operator.implementation', spec: RESIDUAL.operator.implementation },
      { what: 'operator.fixture', spec: RESIDUAL.operator.fixture },
    ];
    const badSpecs = specs.flatMap(({ what, spec }) => {
      const parsed = implementationRefs(spec);
      if (parsed === null) return [`${what}: "${spec}" is not "<file> :: <symbol>"`];
      const abs = resolve(REPO_ROOT, parsed.file);
      if (!existsSync(abs)) return [`${what}: names ${parsed.file}, which is not in this tree`];
      const source = parsed.file === SELF_PATH ? SELF_SOURCE : readFileSync(abs, 'utf8');
      return parsed.symbols
        .filter((s) => !declaresSymbol(source, s))
        .map((s) => `${what}: names ${s}(), which ${parsed.file} does not declare`);
    });
    expect(
      badSpecs,
      `the published operator does not point at a real operator:\n  ${badSpecs.join('\n  ')}`,
    ).toEqual([]);
  });

  it('the published verdict table is complete and its aggregate is its own count', () => {
    // The table can be emptied from either side — rows can leave it, or maps can leave the corpus —
    // so both the shape and the count are pinned rather than trusted.
    const pairs = RESIDUAL.pairs;
    expect(
      pairs.length,
      `the published table holds ${pairs.length} verdicts, not the ${PUBLISHED_MAPS.length} maps × ` +
        `${MOVE_POSITIONS.length} positions the corpus above declares. A table shorter than its own ` +
        'corpus publishes an aggregate over rows that are not there.',
    ).toBe(PUBLISHED_MAPS.length * MOVE_POSITIONS.length);

    const keys = pairs.map((p) => `${p.map}@(${p.x},${p.y})`);
    expect(new Set(keys).size, 'the published table repeats a (map, position) pair').toBe(keys.length);
    const expected = PUBLISHED_MAPS.flatMap((m) => MOVE_POSITIONS.map(([x, y]) => `${m}@(${x},${y})`));
    expect([...keys].sort(), 'the published table is not exactly the corpus × the positions').toEqual(
      [...expected].sort(),
    );

    const accepted = pairs.filter((p) => p.accepted);
    expect(
      { accepted: accepted.length, of: pairs.length },
      `the published aggregate ${RESIDUAL.aggregate.accepted} of ${RESIDUAL.aggregate.of} disagrees ` +
        `with the table it summarises (${accepted.length} of ${pairs.length} rows say accepted). One ` +
        'of the two was edited and the other was not, which is the fossil this record exists to make ' +
        'impossible.',
    ).toEqual({ accepted: RESIDUAL.aggregate.accepted, of: RESIDUAL.aggregate.of });

    // The claim itself, asserted from the published table rather than from whatever this tree could
    // reach: the residual is REAL (some pairs accept) and it is not total (some reject). In a clean
    // clone only one map is present and it accepts none of its five, so measuring these two
    // properties from the reachable subset would report the opposite of what is true.
    expect(accepted.length, 'the published residual accepts nothing — the limit it states is not a limit').toBeGreaterThan(0);
    expect(
      pairs.length - accepted.length,
      'the published residual rejects nothing — a gate that accepts every 32px displacement is not ' +
        'a residual, it is a broken gate',
    ).toBeGreaterThan(0);

    // ⛔ THE COMPANION CLAIM — the 64px half of the pair, whose whole job is to make a retune that
    // "fixes" 32px by loosening 64px impossible to do quietly. Its `accepted: 0` was mutated to 7
    // and NOTHING in this repository read the field. Here is its shape; the number itself is
    // re-measured against real pixels in "REJECTS a 64px feature…" on every map this tree holds.
    const cc = RESIDUAL.companionClaim;
    expect(cc.of, 'the companion claim does not cover the same corpus × positions the residual does').toBe(
      PUBLISHED_MAPS.length * MOVE_POSITIONS.length,
    );
    expect(cc.blockPx, 'the companion claim is not the DOUBLE-size case — it is the same size as the residual').toBe(
      4 * CELL,
    );
    expect(cc.blockPx, 'the companion block is not twice the residual block').toBe(2 * RESIDUAL.operator.blockPx);
    expect(
      cc.accepted,
      `the companion claim publishes ${cc.accepted} of ${cc.of} 64px displacements ACCEPTED. It must ` +
        'stay at 0: a retune that tightens the 32px residual by loosening the 64px case is exactly ' +
        'the failure the pair of claims is arranged to catch, and a non-zero count here would need a ' +
        'per-pair table of its own before it could be quoted — the residual has one for that reason.',
    ).toBe(0);
  });

  it('the residual was measured at the balance this tree still carries', () => {
    // In a clean clone twenty of the twenty-five verdicts cannot be re-measured, so what keeps them
    // worth anything is that the CONDITIONS have not moved. `balance.overlayDiff` is INV-3's to
    // retune; when it is retuned this reds and names the knob, instead of the count moving with no
    // cause attached.
    const m = RESIDUAL.measuredWith;
    expect(
      {
        collisionCellPx: m.collisionCellPx,
        mapNativePx: m.mapNativePx,
        gridCols: m.gridCols,
        gridRows: m.gridRows,
        iouThreshold: m.iouThreshold,
        sobelThreshold: m.sobelThreshold,
        dilatePx: m.dilatePx,
        driftFootprintCols: m.driftFootprintCols,
        driftFootprintRows: m.driftFootprintRows,
      },
      'the published 32px residual was measured at a balance this tree no longer carries. The figure ' +
        'is a CHARACTERISATION of the gate at particular settings — re-measure it with the whole ' +
        'corpus present and republish, or put the settings back. Do not edit the count alone.',
    ).toEqual({
      collisionCellPx: MAP.collisionCellPx,
      mapNativePx: MAP.mapNativePx,
      gridCols: GRID.cols,
      gridRows: GRID.rows,
      iouThreshold: content.balance.overlayDiff.iouThreshold,
      sobelThreshold: CFG.sobelThreshold,
      dilatePx: CFG.dilatePx,
      driftFootprintCols: CFG.driftFootprint.cols,
      driftFootprintRows: CFG.driftFootprint.rows,
    });
  });

  it('every map absent from this tree is absent for the recorded reason, and every tracked one is here', () => {
    // ⛔ THE SKIP CONDITION, ASSERTED. The re-measurement below covers only the maps this tree
    // holds, and the ONLY absence that licenses is "the file is deliberately untracked generator
    // output". A tracked map that has gone missing, or a path that has gone stale, is a broken
    // checkout and must red here rather than quietly shrink the sweep.
    const wrong = corpusStateProblems();
    expect(
      wrong,
      `the real-map corpus is not in one of its two legal states:\n  ${wrong.join('\n  ')}\n` +
        'Legal states are (a) WHOLE — every published map is present — or (b) AS CLONED — the tracked ' +
        'map is present and every untracked one is absent, ignored, and absent along with its whole ' +
        'directory. Anything between the two is a tree somebody has been editing, and the sweep below ' +
        'shrinks silently to fit it.',
    ).toEqual([]);

    // …and at least the tracked part of the corpus must be reachable, or the re-measurement below
    // measures nothing at all and `describe.runIf` would skip the block in silence.
    expect(TRACKED_MAPS.length, 'no map in the published corpus is tracked — nothing can be re-measured anywhere').toBeGreaterThan(0);
    expect(
      TRACKED_MAPS.filter((p) => !REAL_MAPS.includes(p)),
      'a tracked corpus map is not in REAL_MAPS, so the sweep below cannot reach a single real pixel',
    ).toEqual([]);

    // The number of pairs the sweep may cover is therefore one of exactly TWO numbers, and both are
    // pinned. Without this, "how many pairs did we measure" is answered by whatever happened to be
    // on the disk — which is how deleting one map took the file from 73 passed to 68 passed with
    // nothing red.
    expect(
      REAL_MAPS.length,
      `${REAL_MAPS.length} of the ${PUBLISHED_MAPS.length} published maps are on this disk. The only ` +
        `two legal counts are ${PUBLISHED_MAPS.length} (WHOLE) and ${TRACKED_MAPS.length} (AS CLONED).`,
    ).toBe(CORPUS_WHOLE ? PUBLISHED_MAPS.length : TRACKED_MAPS.length);

    // ⛔ EVERY FIELD THE CORPUS BLOCK PUBLISHES, BOUND. `gitignoreRule` was mutated to "nonsense/**"
    // and nothing noticed, because `gitIgnores()` only ever asked whether SOME rule matched.
    const wrongRule = UNTRACKED_MAPS.map((p) => ({ file: p, rule: gitIgnoreRuleFor(p) })).filter(
      (e) => e.rule !== RESIDUAL.corpus.gitignoreRule,
    );
    expect(
      wrongRule.map((e) => `${e.file}: git applies ${e.rule ?? 'NO RULE'}, the record publishes ${RESIDUAL.corpus.gitignoreRule}`),
      'the record names a .gitignore rule that is not the one excluding these maps. The recorded ' +
        'reason for their absence IS that rule; if the rule moved, the recorded reason moved with it.',
    ).toEqual([]);

    // …and whether each map was ever committed, which is the difference between "this path is real
    // and history can prove it" and "this path is real only because it is on somebody's disk". The
    // four generator maps are the second kind and the record says so; asserting the claim keeps it
    // honest in both directions — if one is ever committed, the record has to stop saying it wasn't.
    const wrongHistory = RESIDUAL.corpus.maps.flatMap((m) => {
      // The POSITIVE half needs no history: a tracked file is in HEAD by definition, so it is
      // committed, and a shallow clone knows that as well as a full one does.
      if (m.trackedInGit) {
        return m.everCommitted ? [] : [`${m.file}: git tracks it, so it IS committed; the record says everCommitted=false`];
      }
      // The NEGATIVE half — "this path was never committed" — is only askable where history is here.
      // In a shallow clone `git log` reports nothing for every path the tip commit did not touch,
      // which is not the same answer and must not be read as one.
      if (!HISTORY_AVAILABLE) return [];
      const seen = everCommitted(m.file);
      return seen === m.everCommitted
        ? []
        : [`${m.file}: the record says everCommitted=${m.everCommitted}, git log --all says ${seen}`];
    });
    expect(
      wrongHistory,
      'the record misstates which corpus maps this repository has ever held:\n  ' +
        wrongHistory.join('\n  ') +
        '\nIt matters because history is the only evidence that an ABSENT path is a real path. The ' +
        'reference-capture corpus has it; these four generator maps do not, and the record must not ' +
        'imply otherwise.',
    ).toEqual([]);

    expect(RESIDUAL.publishedBy, 'the record names a different file as the publisher of these verdicts').toBe(SELF_PATH);
  });
});

describe.runIf(REAL_MAPS.length > 0)('overlay_diff on the real painted maps', () => {
  it('there are real 1024² maps in the repo to measure against', () => {
    expect(REAL_MAPS.length).toBeGreaterThanOrEqual(1);
  });

  for (const rel of REAL_MAPS) {
    describe(rel.split('/').pop()!, () => {
      it(
        'accepts an identical frame and every depth of linear tint, and REJECTS a moved building',
        async () => {
          const map = await readRaster(resolve(REPO_ROOT, rel));
          expect(map.width).toBe(MAP.mapNativePx);
          const mask = maskFromLuminance(map);

          const same = run(map, { ...map, data: new Uint8ClampedArray(map.data) }, mask);
          expect(same.iou, `${rel} identical`).toBe(1);
          expect(same.accepted).toBe(true);

          for (const tint of [0.94, 0.9, 0.8]) {
            const dimmed = blankRaster(map.width, map.height);
            for (let i = 0; i < map.data.length; i += 4) {
              dimmed.data[i] = Math.round(map.data[i]! * tint);
              dimmed.data[i + 1] = Math.round(map.data[i + 1]! * tint);
              dimmed.data[i + 2] = Math.round(map.data[i + 2]! * tint);
              dimmed.data[i + 3] = 255;
            }
            const r = run(map, dimmed, mask);
            // Before the contrast fix, ×0.90 alone scored 0.8197 on the real map and was REJECTED
            // with the layout byte-identical — the gate was on course to reject every year variant.
            expect(r.accepted, `${rel} tint ${tint}: ${r.reason}`).toBe(true);
            expect(r.iou, `${rel} tint ${tint}`).toBeGreaterThan(0.98);
          }

          // 128px = 8 collision cells of building, displaced by one cell. Under the old gate a
          // 256×256 block displaced FOUR cells scored 0.8557 and was ACCEPTED.
          const moved = moveBlock(map, 300, 300, 8 * CELL, CELL, GPX, GPY);
          const verdict = run(map, moved, mask);
          expect(verdict.accepted, `${rel} moved building: ${verdict.reason}`).toBe(false);
          expect(verdict.largestDrift).toBeGreaterThanOrEqual(verdict.driftLimit);
        },
        60_000,
      );

      /* ────────────────────────────────────────────────────────────────────────
       * THE SIZE AND THE POSITION THE OLD TEST NEVER TRIED.
       *
       * The previous version of this block moved ONE size (8×CELL = 128px) at ONE position
       * (300,300) on each map, and passed — while a 64×64 px feature, which is LARGER than the
       * 32×48 player, displaced by ONE collision cell was ACCEPTED on pt-map-brackwater at
       * (300,300) (IoU 0.9917) and on pt-map-cindershelf at (500,200) and (400,400). A single
       * (size, position) pair cannot support the claim "every layout move down to a 64px feature
       * is rejected"; five positions and two displacements can, and do.
       * ──────────────────────────────────────────────────────────────────────── */
      it(
        'REJECTS a 64px feature — bigger than the 32×48 player — at FIVE positions and BOTH displacements',
        async () => {
          const map = await readRaster(resolve(REPO_ROOT, rel));
          const mask = maskFromLuminance(map);
          const stillAccepted: string[] = [];
          const accepted1Cell: string[] = [];
          const wrongCriterion: string[] = [];
          for (const [px, py] of MOVE_POSITIONS) {
            for (const cells of [1, 2]) {
              const moved = moveBlock(map, px, py, 4 * CELL, cells * CELL, GPX, GPY);
              const v = run(map, moved, mask);
              const at = `(${px},${py}) moved ${cells} cell(s)`;
              // Collected rather than asserted in the loop, so one acceptance does not abort the
              // sweep before the count below has anything to compare — and so a failure names every
              // pair that moved instead of only the first.
              if (v.accepted) {
                stillAccepted.push(`${at}: ${v.reason}`);
                if (cells === 1) accepted1Cell.push(at);
              }
              // …and it fails LOCALLY. The frame-wide ratio is 0.973–0.997 on every one of these:
              // §8.2's own criterion (1) says ACCEPT to all 50, which is the whole reason (2) exists.
              if (!v.globalPass || v.localPass) {
                wrongCriterion.push(`${at}: globalPass ${v.globalPass}, localPass ${v.localPass} — ${v.reason}`);
              }
            }
          }
          expect(stillAccepted, `${rel} 64px ACCEPTED at:\n  ${stillAccepted.join('\n  ')}`).toEqual([]);
          expect(
            wrongCriterion,
            `${rel}: a 64px displacement must pass §8.2's frame-wide criterion and fail its local one — ` +
              `that split is the whole reason criterion (2) exists:\n  ${wrongCriterion.join('\n  ')}`,
          ).toEqual([]);

          // ⛔ AND THE PUBLISHED COMPANION CLAIM IS COMPARED AGAINST THIS MEASUREMENT, not merely
          // printed next to it. `companionClaim.accepted: 0 of 25` is a UNIVERSAL statement — no
          // (map, position) pair accepts — so it must hold over this map's five one-cell pairs too,
          // and the published count scaled to them is what the sweep is checked against. Mutating
          // that 0 to a 7 used to change nothing anywhere in this repository. The day the count is
          // legitimately non-zero, this equality is the right place to red: the claim would then
          // need a per-pair table of its own, exactly as the 32px residual has one.
          const publishedAcceptedHere =
            (RESIDUAL.companionClaim.accepted * MOVE_POSITIONS.length) / RESIDUAL.companionClaim.of;
          expect(
            accepted1Cell.length,
            `${rel}: 64px displaced ONE cell was accepted at ${accepted1Cell.join(', ') || 'no position'}. ` +
              `tools/artverify/published-measurements.json publishes companionClaim ` +
              `${RESIDUAL.companionClaim.accepted} of ${RESIDUAL.companionClaim.of}, which over this ` +
              `map's ${MOVE_POSITIONS.length} pairs is ${publishedAcceptedHere}. The 64px case and the ` +
              '32px residual are one pair of claims: a retune that tightens one by loosening the other ' +
              'is what they exist together to catch, so neither may move without the other being read.',
          ).toBe(publishedAcceptedHere);
        },
        120_000,
      );

      it(
        'the rejection points the operator at the pixels that actually moved (§8.2 + G4)',
        async () => {
          // G4 forbids overriding a REJECT by hand, so the message is the operator's only lead.
          // An earlier version told them "the layout moved inside the walkable cells" and named a
          // cell ~760 px from the change, in a case where ZERO walkable pixels differed at all.
          const map = await readRaster(resolve(REPO_ROOT, rel));
          const mask = maskFromLuminance(map);
          const [x0, y0, S] = [400, 400, 4 * CELL];
          const v = run(map, moveBlock(map, x0, y0, S, CELL, GPX, GPY), mask);
          expect(v.accepted).toBe(false);
          const box = v.worstRegion?.pixelRect;
          expect(box, v.reason).toBeDefined();
          // The region the message cites must OVERLAP the block that moved — not merely exist.
          expect(box!.x1, `${rel}: cited ${JSON.stringify(box)} vs block ${x0},${y0}+${S}`).toBeGreaterThanOrEqual(x0 - CELL);
          expect(box!.x0).toBeLessThanOrEqual(x0 + S + CELL);
          expect(box!.y1).toBeGreaterThanOrEqual(y0 - CELL);
          expect(box!.y0).toBeLessThanOrEqual(y0 + S + CELL);
          // …and the reason quotes that same rectangle in pixels, so the operator never has to
          // convert cells to pixels by hand to find it.
          expect(v.reason).toContain(`px (${box!.x0}, ${box!.y0})–(${box!.x1}, ${box!.y1})`);
        },
        60_000,
      );

      it(
        'ACCEPTS rot blotches — a year variant ADDS marks, and adding a mark moves no layout',
        async () => {
          // bible §6's aging arcs are additive: rot, moss, scorch. The local criterion fails on
          // LOST base edges for exactly this reason. Failing on TOTAL disagreement instead was
          // measured to reject these (227–259 px gained) while still accepting the tightest real
          // displacement (151 px lost) — the wrong way round.
          const map = await readRaster(resolve(REPO_ROOT, rel));
          const mask = maskFromLuminance(map);
          const v = run(map, blotched(map), mask);
          expect(v.accepted, `${rel} rot blotches: ${v.reason}`).toBe(true);
          expect(v.worstRegion?.gainedEdges ?? 0, `${rel} gained`).toBeGreaterThan(100);
          expect(v.worstRegion?.lostEdges ?? 0, `${rel} lost`).toBeLessThan(v.lostEdgeLimit);
        },
        60_000,
      );

      /* ────────────────────────────────────────────────────────────────────────
       * The walkable restriction must ISOLATE, not merely restrict.
       * ──────────────────────────────────────────────────────────────────────── */
      it(
        'a change confined to BLOCKED cells does not move the measurement inside the walkable ones',
        async () => {
          const map = await readRaster(resolve(REPO_ROOT, rel));
          const W = map.width;
          const H = map.height;
          const mask = cornerMask(W, H, 16 * CELL); // blocks the top-left 256×256 only
          const walk = walkableMaskFor(mask, GRID, W, H);
          const cand = glow(map, 120, 120, 96, 1.0); // radius 96 at (120,120): inside the corner

          let changedWalkable = 0;
          for (let i = 0; i < W * H; i++) {
            const k = i * 4;
            const differs =
              map.data[k] !== cand.data[k] ||
              map.data[k + 1] !== cand.data[k + 1] ||
              map.data[k + 2] !== cand.data[k + 2];
            if (differs && walk[i]) changedWalkable++;
          }
          expect(changedWalkable, `${rel}: the fixture must change ONLY blocked pixels`).toBe(0);

          // The coupling was real and this is the half that proves the fix binds: measured over the
          // WHOLE frame, the same change moves the contrast range and therefore the edge map.
          const wholeFrame = contrastRange(luminance(map));
          const wholeFrameCand = contrastRange(luminance(cand));
          expect(wholeFrameCand.range, `${rel}: whole-frame range must move`).not.toBeCloseTo(wholeFrame.range, 4);
          // Measured over the walkable population — the population §8.2 scores — it does not.
          expect(contrastRange(luminance(cand), CONTRAST_TAIL, walk).range).toBeCloseTo(
            contrastRange(luminance(map), CONTRAST_TAIL, walk).range,
            10,
          );

          const eb = edgeMap(map, CFG, walk);
          const ec = edgeMap(cand, CFG, walk);
          let movedInsideWalkable = 0;
          for (let i = 0; i < W * H; i++) if (walk[i] && eb[i] !== ec[i]) movedInsideWalkable++;
          expect(movedInsideWalkable, `${rel}: walkable edge pixels moved`).toBe(0);

          const v = run(map, cand, mask);
          // Before the fix, on town-map.png this exact fixture scored IoU 0.9535 and was REJECTED
          // for "7 collision cells drifted TOGETHER at cell (53, 34)" — 760 px from the change.
          expect(v.iou, `${rel}: ${v.reason}`).toBe(1);
          expect(v.accepted).toBe(true);
        },
        60_000,
      );
    });
  }
  /* ──────────────────────────────────────────────────────────────────────────
   * The evidence floor that used to delete the strongest evidence there is.
   * Swept across every map and every position, because a cell that thin does not appear
   * at every (map, position) pair — and a test that only tries one pair is how the
   * 64px false-accept survived a green suite in the first place.
   * ────────────────────────────────────────────────────────────────────────── */
  it(
    'a cell whose two edge maps share NOTHING is counted, however little evidence it holds',
    async () => {
      // The old rule skipped any cell holding fewer than one dilated blob (25 px) of edge union as
      // "carrying no evidence either way". A cell with ci = 0 and cu = 10 is the OPPOSITE of that:
      // it is total disagreement on the evidence it has, and dropping it also punched a hole in the
      // region it belonged to. Asserted as the general property, not as one number: every walkable
      // cell where the two maps share no edge pixel at all must be counted as drifted.
      let thinOnesOverall = 0;
      for (const rel of REAL_MAPS) {
        const map = await readRaster(resolve(REPO_ROOT, rel));
        const mask = maskFromLuminance(map);
        const walk = walkableMaskFor(mask, GRID, map.width, map.height);
        const eb = edgeMap(map, CFG, walk);
        for (const [px, py] of MOVE_POSITIONS) {
          const cand = moveBlock(map, px, py, 4 * CELL, CELL, GPX, GPY);
          const v = run(map, cand, mask);
          const ec = edgeMap(cand, CFG, walk);
          let zeroOverlapCells = 0;
          for (let cy = 0; cy < GRID.rows; cy++) {
            for (let cx = 0; cx < GRID.cols; cx++) {
              let ci = 0;
              let cu = 0;
              for (let y = cy * CELL; y < (cy + 1) * CELL; y++) {
                for (let x = cx * CELL; x < (cx + 1) * CELL; x++) {
                  const i = y * map.width + x;
                  if (!walk[i]) continue;
                  if (eb[i] && ec[i]) ci++;
                  if (eb[i] || ec[i]) cu++;
                }
              }
              if (cu === 0 || ci > 0) continue;
              zeroOverlapCells++;
              if (cu < (2 * CFG.dilatePx + 1) ** 2) thinOnesOverall++;
            }
          }
          expect(zeroOverlapCells, `${rel} at (${px},${py}): fixture must disagree totally somewhere`).toBeGreaterThan(0);
          expect(v.cellsDrifted, `${rel} at (${px},${py}): ${v.reason}`).toBeGreaterThanOrEqual(zeroOverlapCells);
        }
      }
      // …and the sweep really did contain cells the old 25px floor would have dropped, so the
      // assertion above is measuring the rule that changed and not a vacuous inequality.
      expect(thinOnesOverall, 'no cell under the old 25px floor appeared anywhere in the sweep').toBeGreaterThan(0);
    },
    180_000,
  );

  /* ──────────────────────────────────────────────────────────────────────────
   * THE RESIDUAL — the gate's own false-ACCEPT limit, pinned.
   *
   * The header of tools/overlay-diff/diff.ts states the POSITIVE result: a 64px feature displaced
   * by ONE collision cell is rejected at 25 of 25 (map, position) pairs. That is true and it is
   * tested above. What it did not state, and what nothing tested, is where the gate stops working:
   * HALVE the feature to 32px — 2×2 collision cells, still a real object, smaller than the 32×48
   * player — and a one-cell displacement is ACCEPTED at some pairs. Measured: 8 of 25.
   *
   * This test exists so that number cannot move in silence. It is a CHARACTERISATION test: it
   * asserts what the gate does today, not what it ought to do. If a retune of `balance.overlayDiff`
   * changes it — in either direction — this goes red and whoever is here has to look at the
   * residual, decide deliberately, and update diff.ts's header with the new figure.
   * A green run here is NOT a claim that 32px false-accepts are acceptable. It is the opposite:
   * it is the limit being held still where a reader of tools/overlay-diff/ can see it.
   *
   * ⚠ AND IT USED TO BE PINNED AS A BARE AGGREGATE OVER A CORPUS FOUR FIFTHS OF THE WORLD DOES NOT
   * HAVE. `expect({ accepted, of: total }).toEqual({ accepted: 8, of: 25 })` was green here and red
   * in every clean clone, where `total` is 5 — and the assertion above it, "the residual is real",
   * failed first, because on `town-map.png` alone a 32px displacement is accepted at NONE of its
   * five positions. Two true statements about a one-map corpus, presented as a regression in the
   * gate.
   *
   * So the 25 verdicts are published PER PAIR in tools/artverify/published-measurements.json, and
   * this test re-measures every pair it can reach and asserts it against the published verdict.
   * A clean clone measures 5 real pairs instead of 0 and checks the other 20 for internal
   * consistency in the block above; this machine measures all 25. Neither is a skip: the aggregate
   * claim is asserted from the published table (always), and the published table is asserted
   * against the pixels (wherever the pixels are).
   * ────────────────────────────────────────────────────────────────────────── */
  it(
    'STATES THE LIMIT: a 32px feature displaced one cell is still ACCEPTED at some pairs',
    async () => {
      // ⛔ THE CORPUS STATE, REFUSED BEFORE A SINGLE PIXEL IS READ. The always-running test above
      // asserts the same thing, and it is asserted AGAIN here because this is the arm whose scope
      // moves with the disk: `measured.length` is derived from REAL_MAPS, so on a partial corpus the
      // sweep quietly measures less and the pins below are skipped by a guard that widens with it.
      // Measured: deleting `pt-map-cindershelf.png` — four of the eight accepted verdicts — took the
      // file from 73 passed to 68 passed with nothing red, where the code this replaced went RED.
      const stateProblems = corpusStateProblems();
      expect(
        stateProblems,
        `this tree's corpus is in neither legal state, so the sweep below would measure a subset ` +
          `nobody has vouched for:\n  ${stateProblems.join('\n  ')}\n` +
          'WHOLE (all five maps) or AS CLONED (the tracked map only). A partial corpus means some ' +
          'pairs are re-measured and the rest taken on trust, which is the mixed evidence ' +
          'tests/gates/asset-palette-contract.test.ts refuses for the reference captures and which ' +
          'this file now refuses for the same reason.',
      ).toEqual([]);

      const verdictOf = new Map(RESIDUAL.pairs.map((p) => [`${p.map}@(${p.x},${p.y})`, p.accepted]));
      const measured: { map: string; x: number; y: number; accepted: boolean }[] = [];
      const acceptedAt: string[] = [];
      const rejectedAt: string[] = [];
      const disagreed: string[] = [];
      const wrongPixels: string[] = [];

      for (const rel of REAL_MAPS) {
        // The published verdicts are about particular bytes. Verify the bytes before quoting the
        // verdicts, or a refetched or re-cropped map would be silently certified by a table that
        // was never measured over it.
        const row = RESIDUAL.corpus.maps.find((m) => m.file === rel)!;
        const sha = sha256Of(rel);
        if (sha !== row.sha256) {
          wrongPixels.push(`${rel}: sha256 ${sha}, published ${row.sha256}`);
          continue;
        }
        const map = await readRaster(resolve(REPO_ROOT, rel));
        const mask = maskFromLuminance(map);
        for (const [px, py] of MOVE_POSITIONS) {
          // 2 × CELL = 32px, against the 4 × CELL = 64px the test above rejects at 25 of 25.
          const v = run(map, moveBlock(map, px, py, 2 * CELL, CELL, GPX, GPY), mask);
          measured.push({ map: rel, x: px, y: py, accepted: v.accepted });
          (v.accepted ? acceptedAt : rejectedAt).push(`${rel.split('/').pop()}@(${px},${py})`);
          const key = `${rel}@(${px},${py})`;
          const wasPublished = verdictOf.get(key);
          if (wasPublished !== v.accepted) {
            disagreed.push(`${key}: measured ${v.accepted ? 'ACCEPTED' : 'rejected'}, published ${wasPublished ? 'ACCEPTED' : 'rejected'}`);
          }
        }
      }

      // Printed BEFORE the assertions, so a red still hands the reader the table it measured —
      // republishing needs the numbers, and a failure that swallows them costs a second 180s run.
      console.log(
        `\noverlay_diff 32px residual — published ${RESIDUAL.aggregate.accepted} of ` +
          `${RESIDUAL.aggregate.of}; re-measured ${measured.length} pair(s) over ` +
          `${REAL_MAPS.length} of ${PUBLISHED_MAPS.length} corpus map(s)` +
          (REAL_MAPS.length === PUBLISHED_MAPS.length
            ? ' — THE WHOLE CORPUS.\n'
            : '.\n  NOT re-measured (deliberately untracked, see the published record):\n' +
              ABSENT_MAPS.map((p) => `    ${p}`).join('\n') +
              '\n  Those pairs are asserted against the published table, never skipped.\n') +
          '  measured table (paste into tools/artverify/published-measurements.json to republish):\n' +
          measured
            .map((m) => `    { "map": ${JSON.stringify(m.map)}, "x": ${m.x}, "y": ${m.y}, "accepted": ${m.accepted} },`)
            .join('\n') +
          '\n',
      );

      expect(
        wrongPixels,
        `a corpus map on disk is not the image the published verdicts were measured over:\n  ` +
          `${wrongPixels.join('\n  ')}\nThe verdicts below are about specific bytes. Re-measure the ` +
          'whole corpus and republish rather than assuming the new file behaves like the old one.',
      ).toEqual([]);

      expect(
        measured.length,
        `the sweep measured ${measured.length} pairs; the ${REAL_MAPS.length} map(s) present × ` +
          `${MOVE_POSITIONS.length} positions is ${REAL_MAPS.length * MOVE_POSITIONS.length}. A loop ` +
          'that ran over fewer pairs than this tree can reach leaves the difference asserting nothing.',
      ).toBe(REAL_MAPS.length * MOVE_POSITIONS.length);

      // …and that product is one of exactly TWO numbers, both pinned, because the corpus has exactly
      // two legal states. The assertion above alone cannot notice a shrinking sweep — it compares the
      // sweep with the disk, and the disk is the thing that shrank.
      const WHOLE_PAIRS = PUBLISHED_MAPS.length * MOVE_POSITIONS.length;
      const CLONED_PAIRS = TRACKED_MAPS.length * MOVE_POSITIONS.length;
      expect(
        measured.length,
        `the sweep covered ${measured.length} (map, position) pairs. The only two legal counts are ` +
          `${WHOLE_PAIRS} — the whole published corpus — and ${CLONED_PAIRS}, which is every pair a ` +
          'clone can reach. Any other number is a corpus somebody has been editing.',
      ).toBe(CORPUS_WHOLE ? WHOLE_PAIRS : CLONED_PAIRS);

      // ⛔ THE HALF THAT CATCHES THE NUMBERS DRIFTING FROM THE ART. Every pair this tree can reach
      // must reproduce its published verdict exactly. This is the assertion that reds if the gate
      // is retuned, if a fixture changes, or if the published table was edited to make something
      // green — and it reds on the machine that has the corpus, which is where the repair is.
      expect(
        disagreed,
        `${disagreed.length} of the ${measured.length} re-measured pairs disagree with ` +
          `tools/artverify/published-measurements.json:\n  ${disagreed.join('\n  ')}\n` +
          'Either the gate moved or the published table is stale. Re-measure the FULL corpus (all ' +
          `${PUBLISHED_MAPS.length} maps — a partial re-publication is a table half of which was ` +
          "measured under different conditions), republish, and update diff.ts's header with the new " +
          'figure. Do not edit the published verdicts to match a partial sweep.',
      ).toEqual([]);

      // PINNED, and only assertable where the whole corpus is — on `town-map.png` alone a 32px
      // displacement is accepted at NONE of its five positions, so these four claims would report the
      // opposite of what is true. On an AS-CLONED tree the same claim is made from the published
      // table by "the published verdict table is complete and its aggregate is its own count" above,
      // which runs everywhere.
      //
      // ⚠ THE GUARD IS `CORPUS_WHOLE`, NOT A BARE LENGTH COMPARISON, and the difference is the whole
      // of what this file got wrong. `REAL_MAPS.length === PUBLISHED_MAPS.length` is false for a
      // clone AND false for a tree missing one map, so it silently swallowed the second along with
      // the first. `CORPUS_WHOLE` is the same test, but a partial corpus can no longer reach it: it
      // is refused at the top of this arm and by the always-running corpus test.
      if (CORPUS_WHOLE) {
        const total = acceptedAt.length + rejectedAt.length;
        expect(total, 'the sweep must cover every (map, position) pair').toBe(
          PUBLISHED_MAPS.length * MOVE_POSITIONS.length,
        );
        expect(
          acceptedAt.length,
          `32px displacements accepted at: ${acceptedAt.join(', ') || 'none'}`,
        ).toBeGreaterThan(0);
        expect(rejectedAt.length, `32px displacements rejected at: ${rejectedAt.join(', ')}`).toBeGreaterThan(0);
        // Change this only together with the header of tools/overlay-diff/diff.ts.
        expect(
          { accepted: acceptedAt.length, of: total },
          `the residual moved — accepted at ${acceptedAt.join(', ')}`,
        ).toEqual({ accepted: RESIDUAL.aggregate.accepted, of: RESIDUAL.aggregate.of });
        // And the half that matters most: whatever the count, the 64px case above must stay at 0
        // accepted. A retune that "fixes" 32px by loosening nothing is fine; one that tightens 32px
        // by loosening 64px is the failure this pair of tests is arranged to catch.
        expect(acceptedAt.length).toBeLessThan(total);
      }
    },
    180_000,
  );
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

  it('contrastRange reports the range the image actually uses, and is invariant to a linear tint', () => {
    const r = blankRaster(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) setPx(r, x, y, x < 32 ? 60 : 200);
    const full = contrastRange(luminance(r));
    expect(full.lo).toBeCloseTo(60 / 255, 2);
    expect(full.hi).toBeCloseTo(200 / 255, 2);
    expect(full.flat).toBe(false);

    const dim = blankRaster(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) setPx(dim, x, y, x < 32 ? 30 : 100);
    const half = contrastRange(luminance(dim));
    expect(half.range).toBeLessThan(full.range); // the RAW range halves…
    // …and normalising by it is what makes the edge map identical.
    const a = edgeMap(r, CFG);
    const b = edgeMap(dim, CFG);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('a flat image has no contrast range and therefore no edges — not "every pixel is an edge"', () => {
    const flat = blankRaster(32, 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) setPx(flat, x, y, 120);
    const cr = contrastRange(luminance(flat));
    expect(cr.flat).toBe(true);
    expect(edgeMap(flat, CFG).reduce<number>((n, v) => n + v, 0)).toBe(0);
  });

  it('a single outlier pixel cannot set the contrast scale for the whole frame', () => {
    const r = blankRaster(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) setPx(r, x, y, x < 128 ? 60 : 200);
    const before = contrastRange(luminance(r));
    setPx(r, 0, 0, 255);
    setPx(r, 1, 0, 0);
    const after = contrastRange(luminance(r));
    expect(after.lo).toBeCloseTo(before.lo, 6);
    expect(after.hi).toBeCloseTo(before.hi, 6);
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
    const m = blankRaster(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) setPx(m, x, y, x < 32 ? 255 : 0);
    const cells = walkableCells(m, { cols: 8, rows: 8 });
    expect(cells.slice(0, 4)).toEqual(new Uint8Array([1, 1, 1, 1]));
    expect(cells.slice(4, 8)).toEqual(new Uint8Array([0, 0, 0, 0]));
  });

  it('a transparent mask pixel is BLOCKED, not walkable', () => {
    const m = blankRaster(4, 4); // all zeroes => alpha 0
    expect(Array.from(walkableCells(m, { cols: 2, rows: 2 }))).toEqual([0, 0, 0, 0]);
  });

  it('walkableMaskFor expands cells back over the map at map resolution', () => {
    const m = blankRaster(8, 8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) setPx(m, x, y, y < 4 ? 255 : 0);
    const px = walkableMaskFor(m, { cols: 2, rows: 2 }, 16, 16);
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

/* ════════════════════════════════════════════════════════════════════════════
 * The collision-mask encoding.
 *
 * tools/collision-editor/ is EMPTY, `npm run collision` points into it, and not one of the twelve
 * masks data/nodes/*.json names exists on disk — so the encoding tools/overlay-diff/mask.ts declares
 * has no producer and Hard Req 5 has never been measured against a mask a human authored. That is a
 * cross-lane blocker and it is stated as one. What CAN be pinned from here is pinned here, so that
 * whatever the editor eventually emits has a specification to fail against rather than a comment.
 * ════════════════════════════════════════════════════════════════════════════ */

describe('collision-mask encoding — mask.ts is the single declaration', () => {
  /** A hand-authored walkability grid: a cross of open ground through a blocked field. */
  function authored(): Uint8Array {
    const cells = new Uint8Array(GRID.cols * GRID.rows);
    for (let cy = 0; cy < GRID.rows; cy++) {
      for (let cx = 0; cx < GRID.cols; cx++) {
        const walk = (cx >= 28 && cx < 35) || (cy >= 28 && cy < 35) || (cx + cy) % 17 === 0;
        cells[cy * GRID.cols + cx] = walk ? 1 : 0;
      }
    }
    return cells;
  }

  it('round-trips: cells -> raster -> cells is the identity at cell resolution', () => {
    const cells = authored();
    expect(Array.from(walkableCells(cellsToRaster(cells, GRID), GRID))).toEqual(Array.from(cells));
  });

  it('a mask authored at 64×64 and the SAME mask at 1024² read identically', () => {
    // mask.ts claims this in prose ("both are read the same way") and nothing measured it. It is
    // load-bearing: whatever the collision editor writes, this is the freedom it is being promised.
    const cells = authored();
    const atCellRes = cellsToRaster(cells, GRID);
    const atMapRes = cellsToRaster(cells, GRID, MAP.collisionCellPx);
    expect(atCellRes.width).toBe(GRID.cols);
    expect(atMapRes.width).toBe(MAP.mapNativePx);
    expect(Array.from(walkableCells(atCellRes, GRID))).toEqual(Array.from(walkableCells(atMapRes, GRID)));

    // …and the whole gate agrees, not just the sampler: same verdict, same numbers, both ways.
    const base = baseMap();
    for (const [label, cand] of [
      ['texture', texturedVariant(base)],
      ['moved building', baseMap(2)],
    ] as const) {
      const a = run(base, cand, atCellRes);
      const b = run(base, cand, atMapRes);
      expect(a.accepted, `${label}: ${a.reason}`).toBe(b.accepted);
      expect(a.iou).toBeCloseTo(b.iou, 12);
      expect(a.largestDrift).toBe(b.largestDrift);
      expect(a.walkable).toBe(b.walkable);
    }
  });

  it('the declared encoding IS what the reader reads — swatch by swatch', () => {
    const probe = blankRaster(4, 1);
    const put = (x: number, rgba: readonly number[]) => {
      const i = idx(probe, x, 0);
      probe.data[i] = rgba[0]!;
      probe.data[i + 1] = rgba[1]!;
      probe.data[i + 2] = rgba[2]!;
      probe.data[i + 3] = rgba[3]!;
    };
    put(0, MASK_ENCODING.walkableRgba);
    put(1, MASK_ENCODING.blockedRgba);
    put(2, [255, 255, 255, 0]); // white but TRANSPARENT — unpainted is never "walk here"
    put(3, [127, 127, 127, 255]); // luminance 0.498, a hair under the threshold
    expect(Array.from(walkableCells(probe, { cols: 4, rows: 1 }))).toEqual([1, 0, 0, 0]);
    expect(MASK_ENCODING.transparentIsBlocked).toBe(true);
    expect(MASK_ENCODING.rule).toBe('majority');
  });

  it('majority, not "any": a cell that is half blocked is blocked', () => {
    const m = blankRaster(4, 1); // one cell, four pixels
    for (let x = 0; x < 4; x++) {
      const i = idx(m, x, 0);
      const v = x < 2 ? 255 : 0; // exactly half walkable
      m.data[i] = v;
      m.data[i + 1] = v;
      m.data[i + 2] = v;
      m.data[i + 3] = 255;
    }
    expect(walkableCells(m, { cols: 1, rows: 1 })[0]).toBe(0);
    m.data[idx(m, 2, 0)] = 255;
    m.data[idx(m, 2, 0) + 1] = 255;
    m.data[idx(m, 2, 0) + 2] = 255;
    expect(walkableCells(m, { cols: 1, rows: 1 })[0]).toBe(1);
  });

  it('cellsToRaster refuses a mismatched grid or a nonsense scale instead of writing a wrong mask', () => {
    expect(() => cellsToRaster(new Uint8Array(3), GRID)).toThrow(/cell array is 3/);
    expect(() => cellsToRaster(authored(), GRID, 0)).toThrow(/bad scale/);
    expect(() => cellsToRaster(authored(), GRID, 1.5)).toThrow(/bad scale/);
  });

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
   * THE RE-MEASUREMENT THE STATED GAP DEMANDED. It is not a constant bump; it is a finding.
   *
   * What stood here, verbatim:
   *
   *     it('STATES THE GAP: no mask any node names exists, so the gate is unmeasured against real
   *        art', () => {
   *       const missing = content.nodes.filter((n) => !existsSync(resolve(REPO_ROOT,
   *                                                                       n.collisionMask)));
   *       expect(
   *         missing.length,
   *         'a collision mask now exists — re-measure the residual limits against it and update
   *          this test',
   *       ).toBe(content.nodes.length);
   *     });
   *
   * It asserted a fact about the REPOSITORY — that no mask file existed — as a tripwire, and its own
   * message names the work it was holding: re-measure the residual limits against a real mask
   * instead of a luminance-derived stand-in. Twelve masks now ship, each stamped from the same
   * 64×64 layout as the painting beside it, so the tripwire has fired and this block is what it
   * fired for. The absence assertion is replaced, not deleted: the inverse is asserted below, by
   * name, so the scope cannot shrink silently.
   *
   * ⚠ AND THE RE-MEASUREMENT FOUND SOMETHING. `maskFromLuminance` — the stand-in every real-map
   * case in this file uses — leaves 98.5%–100% of the frame walkable on eleven of the twelve
   * composed maps (cindershelf, whose ground is dark basalt, is the outlier at 14.5%). It was
   * therefore barely a restriction at all, and §8.2's restriction is what diff.ts's header calls
   * "not free": "the cells the restriction throws away are the cells that carry the structure".
   * An AUTHORED mask throws away 36%–80% of the frame instead of 0%–1.5%, and criterion (2) is
   * measurably less sensitive through it — an 8-cell building displaced by one cell, which this
   * file asserts is REJECTED on all five stand-in maps, is ACCEPTED on three of the twelve. That is
   * recorded as an assertion below rather than as prose, because it is exactly the kind of number
   * this file exists to stop anyone from remembering wrong.
   * ══════════════════════════════════════════════════════════════════════════════════════════════ */
  describe('THE GAP IS CLOSED — the restriction, measured against the shipped masks', () => {
    it('every node ships the mask it declares, so nothing here runs on a stand-in by default', () => {
      const missing = content.nodes.filter((n) => !existsSync(resolve(REPO_ROOT, n.collisionMask)));
      expect(content.nodes.length).toBeGreaterThan(0);
      expect(
        missing.map((n) => n.id),
        'a node no longer ships its collision mask — the gate falls back to `allWalkable` for it, ' +
          'which is the whole-frame comparison §8.2 says not to make. Re-run `npx tsx tools/mapgen/land.ts`.',
      ).toEqual([]);
    });

    it(
      'the authored mask is a REAL restriction, and a much tighter one than the luminance stand-in',
      async () => {
        const rows: string[] = [];
        for (const node of content.nodes) {
          const map = await readRaster(resolve(REPO_ROOT, node.mapAsset));
          const mask = await readRaster(resolve(REPO_ROOT, node.collisionMask));
          const total = map.width * map.height;
          const authoredWalk = walkableMaskFor(mask, GRID, map.width, map.height).reduce((n, v) => n + v, 0);
          const standInWalk = walkableMaskFor(maskFromLuminance(map), GRID, map.width, map.height).reduce(
            (n, v) => n + v,
            0,
          );
          const authoredPct = (100 * authoredWalk) / total;
          const standInPct = (100 * standInWalk) / total;
          rows.push(`${node.id} authored ${authoredPct.toFixed(1)}% / stand-in ${standInPct.toFixed(1)}%`);
          // A restriction that discards nothing is `allWalkable` wearing a mask file, and one that
          // discards everything scores an empty union, which the gate REJECTS rather than scoring.
          expect(authoredPct, `${node.id}: the mask restricts nothing`).toBeLessThan(100);
          expect(authoredPct, `${node.id}: the mask leaves nowhere to measure`).toBeGreaterThan(0);
        }
        console.info(`  overlay-diff walkable population per node:\n    ${rows.join('\n    ')}`);
      },
      60_000,
    );

    it(
      'through a real mask on real art: identical scores 1.0 and a linear tint still PASSES',
      async () => {
        for (const node of content.nodes) {
          const map = await readRaster(resolve(REPO_ROOT, node.mapAsset));
          const mask = await readRaster(resolve(REPO_ROOT, node.collisionMask));
          const same = run(map, { ...map, data: new Uint8ClampedArray(map.data) }, mask);
          expect(same.iou, `${node.id} identical`).toBe(1);
          expect(same.accepted).toBe(true);
          // Contrast invariance is the property that kept the gate from rejecting every year
          // variant; it is asserted here through an authored mask rather than only a derived one.
          const dimmed = blankRaster(map.width, map.height);
          for (let i = 0; i < map.data.length; i += 4) {
            dimmed.data[i] = Math.round(map.data[i]! * 0.94);
            dimmed.data[i + 1] = Math.round(map.data[i + 1]! * 0.94);
            dimmed.data[i + 2] = Math.round(map.data[i + 2]! * 0.94);
            dimmed.data[i + 3] = 255;
          }
          const r = run(map, dimmed, mask);
          expect(r.accepted, `${node.id} tint 0.94: ${r.reason}`).toBe(true);
          expect(r.iou, `${node.id} tint 0.94`).toBeGreaterThan(0.98);
        }
      },
      120_000,
    );

    it(
      'THE FINDING: criterion (2) is weaker through an authored mask — three nodes accept a moved building',
      async () => {
        /*
         * ⛔ THIS IS NOT A CONTRACT ANYONE WANTS. It is a MEASUREMENT, pinned by name so that it
         * cannot be forgotten and cannot change in silence — the same discipline this file applies
         * to the 32px count in `diff.ts`'s RESIDUAL section.
         *
         * The case is the file's own headline: a 128px (8 collision cells) block of the painting,
         * displaced by exactly one cell, with the vacated area filled from open ground. Through the
         * luminance stand-in it is asserted REJECTED on all five real maps above. Through the
         * shipped authored masks it is ACCEPTED on bowerdeep, r4 and r5, because those maps'
         * displaced structure lands mostly in cells the mask calls blocked, and the restriction
         * discards them before the ratio is taken.
         *
         * If this set changes, the gate's reach changed. That may be because the composer's tiles
         * changed (the paintings are recomposed by `tools/mapgen/land.ts`), because the layouts
         * changed, or because `balance.overlayDiff` was retuned. In every one of those cases the
         * right response is to re-measure and re-decide it here — NOT to widen the expectation
         * until the observed set fits inside it. §9.5 gates no shipped variant today
         * (`yearVariants` is empty on all twelve nodes), so nothing is being waved through; what is
         * being recorded is the sensitivity the gate WILL have on the day one is generated.
         */
        const accepted: string[] = [];
        for (const node of content.nodes) {
          const map = await readRaster(resolve(REPO_ROOT, node.mapAsset));
          const mask = await readRaster(resolve(REPO_ROOT, node.collisionMask));
          const moved = run(map, moveBlock(map, 300, 300, 8 * CELL, CELL, GPX, GPY), mask);
          if (moved.accepted) accepted.push(node.id);
        }
        expect(
          accepted,
          'the set of nodes on which §8.2 criterion (2) FAILS to catch a player-scale displacement ' +
            'through the shipped collision mask has changed. Go and re-measure the residual limits ' +
            'in tools/overlay-diff/diff.ts against the new masks before touching this line.',
        ).toEqual(['bowerdeep', 'r4', 'r5']);
      },
      120_000,
    );
  });
});
