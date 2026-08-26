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
 * cells rejected a variant whose walkable pixels were byte-identical. Both are B1 repair wave 2
 * (DEVIATIONS-lane-b B-D39, B-D40). What this file does about it:
 *
 *   · every size is tried at FIVE positions and BOTH displacements, on every real map;
 *   · the additive half of an aging pass (rot blotches) is asserted to PASS on real art, because
 *     the criterion that catches a displacement must not catch a mark appearing;
 *   · the isolation the walkable restriction is specified to give is asserted directly — zero
 *     walkable edge pixels may move for a change confined to blocked cells — with the coupling it
 *     replaces asserted to still exist over the whole frame, so the fix is proved to be the cause;
 *   · the rejection MESSAGE is asserted to name a rectangle that overlaps the thing that moved;
 *   · the collision-mask encoding this all rests on gets its own block, including a test that goes
 *     RED the day a real mask lands, because none of these numbers has ever seen one (B-D49).
 *
 * No Math.random anywhere (G11): every pattern is a closed-form function of (x, y).
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
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

const REAL_MAPS = [
  'assets/approved-trials/town-map.png',
  'assets/raw/palette-trials/pt-map-brackwater.png',
  'assets/raw/palette-trials/pt-map-cindershelf.png',
  'assets/raw/palette-trials/pt-map-duskhollow.png',
  'assets/raw/palette-trials/pt-map-r2.png',
].filter((p) => existsSync(resolve(REPO_ROOT, p)));

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
          const moved = moveBlock(map, 300, 300, 8 * CELL, CELL, 20, 900);
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
          for (const [px, py] of MOVE_POSITIONS) {
            for (const cells of [1, 2]) {
              const moved = moveBlock(map, px, py, 4 * CELL, cells * CELL, 20, 900);
              const v = run(map, moved, mask);
              expect(v.accepted, `${rel} 64px at (${px},${py}) moved ${cells} cell(s): ${v.reason}`).toBe(false);
              // …and it fails LOCALLY. The frame-wide ratio is 0.973–0.997 on every one of these:
              // §8.2's own criterion (1) says ACCEPT to all 50, which is the whole reason (2) exists.
              expect(v.globalPass, `${rel} 64px at (${px},${py})`).toBe(true);
              expect(v.localPass).toBe(false);
            }
          }
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
          const v = run(map, moveBlock(map, x0, y0, S, CELL, 20, 900), mask);
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
       * B-D40: the walkable restriction must ISOLATE, not merely restrict.
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
          const cand = moveBlock(map, px, py, 4 * CELL, CELL, 20, 900);
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
   * THE RESIDUAL — the gate's own false-ACCEPT limit, pinned (B-D39 / BF-26).
   *
   * The header of tools/overlay-diff/diff.ts states the POSITIVE result: a 64px feature displaced
   * by ONE collision cell is rejected at 25 of 25 (map, position) pairs. That is true and it is
   * tested above. What it did not state, and what nothing tested, is where the gate stops working:
   * HALVE the feature to 32px — 2×2 collision cells, still a real object, smaller than the 32×48
   * player — and a one-cell displacement is ACCEPTED at some pairs. B-D39 measured 8 of 25.
   *
   * This test exists so that number cannot move in silence. It is a CHARACTERISATION test: it
   * asserts what the gate does today, not what it ought to do. If a retune of `balance.overlayDiff`
   * changes it — in either direction — this goes red and whoever is here has to look at the
   * residual, decide deliberately, and update B-D39 and diff.ts's header with the new figure.
   * A green run here is NOT a claim that 32px false-accepts are acceptable. It is the opposite:
   * it is the limit being held still where a reader of tools/overlay-diff/ can see it.
   * ────────────────────────────────────────────────────────────────────────── */
  it(
    'STATES THE LIMIT: a 32px feature displaced one cell is still ACCEPTED at some pairs (B-D39)',
    async () => {
      const acceptedAt: string[] = [];
      const rejectedAt: string[] = [];
      for (const rel of REAL_MAPS) {
        const map = await readRaster(resolve(REPO_ROOT, rel));
        const mask = maskFromLuminance(map);
        for (const [px, py] of MOVE_POSITIONS) {
          // 2 × CELL = 32px, against the 4 × CELL = 64px the test above rejects at 25 of 25.
          const v = run(map, moveBlock(map, px, py, 2 * CELL, CELL, 20, 900), mask);
          (v.accepted ? acceptedAt : rejectedAt).push(`${rel.split('/').pop()}@(${px},${py})`);
        }
      }
      const total = acceptedAt.length + rejectedAt.length;
      expect(total, 'the sweep must cover every (map, position) pair').toBe(REAL_MAPS.length * MOVE_POSITIONS.length);

      // The residual is real: the gate does NOT catch every 32px displacement.
      expect(
        acceptedAt.length,
        `32px displacements accepted at: ${acceptedAt.join(', ') || 'none'}`,
      ).toBeGreaterThan(0);
      // …and it is not a total failure either: at most pairs a 32px move IS caught.
      expect(rejectedAt.length, `32px displacements rejected at: ${rejectedAt.join(', ')}`).toBeGreaterThan(0);

      // PINNED. Change this only together with B-D39 and the header of tools/overlay-diff/diff.ts.
      expect(
        { accepted: acceptedAt.length, of: total },
        `the residual moved — accepted at ${acceptedAt.join(', ')}`,
      ).toEqual({ accepted: 8, of: 25 });

      // And the half that matters most: whatever the count, the 64px case above must stay at 0
      // accepted. A retune that "fixes" 32px by loosening nothing is fine; one that tightens 32px
      // by loosening 64px is the failure this pair of tests is arranged to catch.
      expect(acceptedAt.length).toBeLessThan(total);
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
 * The collision-mask encoding (B-D49).
 *
 * tools/collision-editor/ is EMPTY, `npm run collision` points into it, and not one of the twelve
 * masks data/nodes/*.json names exists on disk — so the encoding tools/overlay-diff/mask.ts declares
 * has no producer and Hard Req 5 has never been measured against a mask a human authored. That is a
 * cross-lane blocker and it is stated as one. What CAN be pinned from here is pinned here, so that
 * whatever the editor eventually emits has a specification to fail against rather than a comment.
 * ════════════════════════════════════════════════════════════════════════════ */

describe('collision-mask encoding — mask.ts is the single declaration (B-D49)', () => {
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

  it('STATES THE GAP: no mask any node names exists, so the gate is unmeasured against real art', () => {
    // Deliberately asserted rather than left in a comment: the day someone authors these, this test
    // goes red and whoever is here has to come and re-measure the claims in diff.ts's header
    // against a real mask instead of a luminance-derived stand-in.
    const missing = content.nodes.filter((n) => !existsSync(resolve(REPO_ROOT, n.collisionMask)));
    expect(
      missing.length,
      'a collision mask now exists — re-measure B-D39/B-D40 against it and update this test',
    ).toBe(content.nodes.length);
  });
});
