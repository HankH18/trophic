/**
 * tools/overlay-diff/diff.ts — build-doc §8.2, the gate that makes "one mask, six years" true.
 *
 * Hard Req 5 is that ONE collision mask is authored per node and survives all six years. Nothing
 * enforces that by construction: img2img at denoise 0.35 (§9.5) usually preserves layout and
 * sometimes does not, and "usually" is how you ship a year-4 map where the player walks into a
 * building that moved. This is the measurement that turns that from a hope into a gate.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO CRITERIA, BOTH BINDING. The second one exists because the first one alone was measured
 * to be arithmetically incapable of catching the failure mode img2img actually produces.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   (1) §8.2 verbatim — IoU of the dilated Sobel edge maps, RESTRICTED to the walkable cells of
 *       the collision mask, must reach `balance.overlayDiff.iouThreshold`.
 *
 *   (2) NO DRIFTED REGION LARGE ENOUGH TO STAND IN — the same IoU computed PER COLLISION CELL;
 *       a cell scoring under the threshold is "drifted"; the largest 4-connected run of drifted
 *       cells must be smaller than the player's own footprint in cells
 *       (`ceil(playerSpriteW / collisionCellPx) × ceil(playerSpriteH / collisionCellPx)`).
 *
 * Why (2) had to be added. A single frame-wide ratio cannot fail on a local change: displacing a
 * fraction f of the edge pixels gives IoU ≈ (1−f)/(1+f), which stays ≥ 0.85 for every f ≤ 0.081.
 * That is not a theoretical bound — it was measured through this CLI on the real 1024² painted map:
 * a 256×256 block (16×16 collision cells) shifted 64px = 4 cells scored 0.8557 and was ACCEPTED, a
 * whole building ERASED scored up to 0.9848 and was ACCEPTED, and up to 324 of the 4096 collision
 * cells could be wrong while the gate said ACCEPT. Global translation was caught with an enormous
 * margin (a 2px whole-frame shift scores 0.7138) — but img2img at denoise 0.35 does not translate
 * the frame, it re-imagines regions, which is precisely the mode that passed.
 *
 * Criterion (2) is measured in COLLISION CELLS because that is the unit the collision mask is
 * authored in, and the size limit is the PLAYER'S FOOTPRINT because that is the physical statement
 * of the failure: a repaint that changes an area too small to hold the player cannot change where
 * the player may stand; one that changes a larger contiguous area can. Both numbers come from
 * `balance.map` (G11), so retuning them is an edit to data/balance.json and not to this directory.
 *
 * Measured separation on five real 1024² painted maps (see tests/unit/overlay-diff.test.ts):
 * every layout move down to a 64px feature displaced by ONE collision cell is rejected, while a
 * linear tint of any depth scores ≥ 0.9947 and is accepted.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WALKABLE RESTRICTION, AND ITS COST — stated because it is not free.
 * ─────────────────────────────────────────────────────────────────────────────
 * §8.2 restricts the comparison to walkable cells, and the reason is sound: a year variant is
 * SUPPOSED to change — docks rot, canopies thin, vents flare (bible §6) — and what must not move is
 * where the player can walk. But the cells the restriction throws away are the cells that carry the
 * structure: measured on assets/approved-trials/town-map.png, edges are 3.01× denser in the BLOCKED
 * cells (30.5% of pixels) than in the walkable ones (10.1%). The restriction therefore makes the
 * global ratio MORE forgiving of a moved building, not less — under the old single-criterion gate
 * it was the specific thing that turned a correct rejection into an acceptance. Criterion (2) is
 * what makes the restriction safe: a building that moves out of a blocked cell moves INTO walkable
 * ones, and those cells drift together in one contiguous run. `unrestrictedIou` is reported
 * alongside so the cost stays visible rather than being an argument in a comment.
 *
 * Two refusals are deliberate:
 *   · sizes must match. A candidate at a different resolution is not comparable, and silently
 *     resampling one to fit would blur precisely the edges being measured.
 *   · an empty union is REJECTED, not scored 1.0. Two images with no edges inside the walkable area
 *     carry no evidence either way, and a blank generation is the most likely way to produce it —
 *     the arithmetic "0/0 = perfect match" would wave through the single worst candidate.
 */
import type { Raster } from '../postprocess/raster.ts';
import { edgeMap, type EdgeOptions } from './edges.ts';
import { allWalkable, walkableMaskFor, type CellGrid } from './mask.ts';

export class OverlayDiffError extends Error {}

/** A rectangle of collision cells — the smallest drift that counts as a layout change. */
export interface CellFootprint {
  cols: number;
  rows: number;
}

export interface OverlayDiffConfig extends EdgeOptions {
  iouThreshold: number;
  /**
   * The player's footprint in collision cells. A contiguous drifted region of at least
   * `cols × rows` cells fails criterion (2). Derived from `balance.map` by `overlayDiffConfig()`.
   */
  driftFootprint: CellFootprint;
}

export interface OverlayDiffResult {
  iou: number;
  accepted: boolean;
  threshold: number;
  intersection: number;
  union: number;
  /** Pixels inside walkable cells — the population the IoU is computed over. */
  walkable: number;
  baseEdges: number;
  candidateEdges: number;
  /** §8.2's own criterion (1) in isolation. */
  globalPass: boolean;
  /** Criterion (2) in isolation. */
  localPass: boolean;
  /** Walkable collision cells that carried edge evidence in at least one of the two images. */
  cellsCompared: number;
  /** Of those, the ones whose own IoU fell under the threshold. */
  cellsDrifted: number;
  /** Largest 4-connected run of drifted cells. */
  largestDrift: number;
  /** `driftFootprint.cols × driftFootprint.rows` — the size at which a drifted run fails. */
  driftLimit: number;
  /** Top-left cell of the largest drifted run, for the operator to go and look at. */
  worstDrift?: { cx: number; cy: number };
  /** The same IoU with the walkable restriction lifted — reported so the restriction's cost is visible. */
  unrestrictedIou: number;
  /** Set when the comparison carries no evidence; `accepted` is false whenever this is set. */
  degenerate?: string;
  reason: string;
}

export interface OverlayDiffInput {
  base: Raster;
  candidate: Raster;
  /** Omit only when no mask has been authored yet — the result says so out loud. */
  mask?: Raster;
  grid: CellGrid;
  config: OverlayDiffConfig;
}

interface CellSpan {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Cell bounds, identical to the convention mask.ts samples the collision mask with. */
function spanOf(c: number, count: number, extent: number): { lo: number; hi: number } {
  const lo = Math.floor((c * extent) / count);
  const hi = Math.min(extent, Math.max(lo + 1, Math.floor(((c + 1) * extent) / count)));
  return { lo, hi };
}

export function overlayDiff(input: OverlayDiffInput): OverlayDiffResult {
  const { base, candidate, mask, grid, config } = input;
  if (base.width !== candidate.width || base.height !== candidate.height) {
    throw new OverlayDiffError(
      `base is ${base.width}x${base.height} but the candidate is ${candidate.width}x${candidate.height}. ` +
        'A year variant is generated at the base map size (§9.5); resampling one to match would blur ' +
        'the very edges this gate measures.',
    );
  }
  if (grid.cols <= 0 || grid.rows <= 0) {
    throw new OverlayDiffError(`bad collision grid ${grid.cols}x${grid.rows}`);
  }
  const foot = config.driftFootprint;
  if (!Number.isInteger(foot.cols) || !Number.isInteger(foot.rows) || foot.cols < 1 || foot.rows < 1) {
    throw new OverlayDiffError(
      `bad drift footprint ${foot.cols}x${foot.rows} cells. It comes from balance.map ` +
        '(playerSpriteW/H over collisionCellPx) and must be at least one cell in each direction.',
    );
  }
  const width = base.width;
  const height = base.height;
  const eb = edgeMap(base, config);
  const ec = edgeMap(candidate, config);
  const walk = mask ? walkableMaskFor(mask, grid, width, height) : allWalkable(width, height);

  let intersection = 0;
  let union = 0;
  let walkable = 0;
  let baseEdges = 0;
  let candidateEdges = 0;
  let allIntersection = 0;
  let allUnion = 0;
  for (let i = 0; i < walk.length; i++) {
    const a = eb[i]!;
    const b = ec[i]!;
    if (a && b) allIntersection++;
    if (a || b) allUnion++;
    if (!walk[i]) continue;
    walkable++;
    if (a) baseEdges++;
    if (b) candidateEdges++;
    if (a && b) intersection++;
    if (a || b) union++;
  }

  // ── criterion (2): the same ratio, per collision cell.
  const cellCount = grid.cols * grid.rows;
  const drifted = new Uint8Array(cellCount);
  const xs: CellSpan[] = [];
  for (let cx = 0; cx < grid.cols; cx++) {
    const sx = spanOf(cx, grid.cols, width);
    xs.push({ x0: sx.lo, x1: sx.hi, y0: 0, y1: 0 });
  }
  // A cell carrying less evidence than ONE dilated edge pixel occupies cannot be judged either way;
  // scoring it would turn a stray pixel of texture into a layout verdict. Derived from `dilatePx`.
  const minCellEvidence = (2 * config.dilatePx + 1) ** 2;
  let cellsCompared = 0;
  let cellsDrifted = 0;
  for (let cy = 0; cy < grid.rows; cy++) {
    const sy = spanOf(cy, grid.rows, height);
    for (let cx = 0; cx < grid.cols; cx++) {
      const sx = xs[cx]!;
      let ci = 0;
      let cu = 0;
      let anyWalkable = false;
      for (let y = sy.lo; y < sy.hi; y++) {
        const row = y * width;
        for (let x = sx.x0; x < sx.x1; x++) {
          const i = row + x;
          if (!walk[i]) continue;
          anyWalkable = true;
          const a = eb[i]!;
          const b = ec[i]!;
          if (a && b) ci++;
          if (a || b) cu++;
        }
      }
      if (!anyWalkable || cu < minCellEvidence) continue; // blocked, or carries no evidence either way
      cellsCompared++;
      if (ci / cu < config.iouThreshold) {
        drifted[cy * grid.cols + cx] = 1;
        cellsDrifted++;
      }
    }
  }
  const largest = largestRun(drifted, grid);
  const driftLimit = foot.cols * foot.rows;

  const iou = union === 0 ? 0 : intersection / union;
  const unrestrictedIou = allUnion === 0 ? 0 : allIntersection / allUnion;
  const globalPass = iou >= config.iouThreshold;
  const localPass = largest.size < driftLimit;
  const result: OverlayDiffResult = {
    iou,
    accepted: false,
    threshold: config.iouThreshold,
    intersection,
    union,
    walkable,
    baseEdges,
    candidateEdges,
    globalPass,
    localPass,
    cellsCompared,
    cellsDrifted,
    largestDrift: largest.size,
    driftLimit,
    unrestrictedIou,
    reason: '',
  };
  if (largest.at) result.worstDrift = largest.at;

  if (walkable === 0) {
    result.globalPass = false;
    result.localPass = false;
    result.degenerate = 'the collision mask marks no walkable cells at all';
    result.reason = `REJECT — ${result.degenerate}; there is nothing to compare inside.`;
    return result;
  }
  if (union === 0) {
    result.globalPass = false;
    result.localPass = false;
    result.degenerate = 'neither image has any edge inside the walkable cells';
    result.reason =
      `REJECT — ${result.degenerate}. That is almost always a blank or near-uniform generation, ` +
      'and scoring it 1.0 would wave through the worst possible candidate.';
    return result;
  }

  result.accepted = globalPass && localPass;
  if (result.accepted) {
    result.reason =
      `ACCEPT — IoU ${iou.toFixed(4)} ≥ ${config.iouThreshold} over ${walkable} walkable px, and the ` +
      `largest drifted region is ${largest.size} collision cell(s), under the ${foot.cols}×${foot.rows}` +
      `-cell player footprint (§8.2 + Hard Req 5).`;
  } else if (!globalPass && !localPass) {
    result.reason =
      `REJECT — IoU ${iou.toFixed(4)} < ${config.iouThreshold} AND ${largest.size} collision cells ` +
      `drifted together at ${cellAt(largest.at)}: the layout moved inside the walkable cells, so the ` +
      `one collision mask (Hard Req 5) would no longer fit this year.`;
  } else if (!globalPass) {
    result.reason =
      `REJECT — IoU ${iou.toFixed(4)} < ${config.iouThreshold}: the layout moved inside the walkable ` +
      `cells, so the one collision mask (Hard Req 5) would no longer fit this year.`;
  } else {
    result.reason =
      `REJECT — IoU ${iou.toFixed(4)} clears ${config.iouThreshold} overall, but ${largest.size} ` +
      `collision cells drifted TOGETHER at ${cellAt(largest.at)} — at or over the ${foot.cols}×${foot.rows}` +
      `-cell player footprint (${driftLimit} cells). A frame-wide ratio cannot see a local move; this ` +
      `is one. ${cellsDrifted} of ${cellsCompared} compared cells drifted in all.`;
  }
  return result;
}

function cellAt(at?: { cx: number; cy: number }): string {
  return at ? `cell (${at.cx}, ${at.cy})` : 'no cell';
}

/** Largest 4-connected run of drifted cells, and where it starts (lowest row, then lowest column). */
function largestRun(drifted: Uint8Array, grid: CellGrid): { size: number; at?: { cx: number; cy: number } } {
  const seen = new Uint8Array(drifted.length);
  const stack: number[] = [];
  let best = 0;
  let at: { cx: number; cy: number } | undefined;
  for (let s = 0; s < drifted.length; s++) {
    if (!drifted[s] || seen[s]) continue;
    let size = 0;
    let minCy = grid.rows;
    let minCx = grid.cols;
    stack.length = 0;
    stack.push(s);
    seen[s] = 1;
    while (stack.length > 0) {
      const p = stack.pop()!;
      size++;
      const cx = p % grid.cols;
      const cy = (p - cx) / grid.cols;
      if (cy < minCy || (cy === minCy && cx < minCx)) {
        minCy = cy;
        minCx = cx;
      }
      if (cx > 0) push(p - 1);
      if (cx < grid.cols - 1) push(p + 1);
      if (cy > 0) push(p - grid.cols);
      if (cy < grid.rows - 1) push(p + grid.cols);
    }
    if (size > best) {
      best = size;
      at = { cx: minCx, cy: minCy };
    }
  }
  return at ? { size: best, at } : { size: best };

  function push(q: number): void {
    if (drifted[q] && !seen[q]) {
      seen[q] = 1;
      stack.push(q);
    }
  }
}

/**
 * §8.2 / §9.5's regeneration ladder: "regenerated at lower denoise (start 0.35, step −0.05, floor
 * 0.2)", capped at `maxRegenAttempts`. Returns the next denoise to try, or null when the ladder is
 * spent — at which point §9.5 says that year reuses the nearest passing variant, and G4 says a
 * failing variant is NEVER accepted by hand without a DEVIATIONS entry.
 *
 * `tools/comfy/comfy-batch.ts` walks this ladder on the live path; it is not documentation.
 */
export function nextDenoise(
  current: number,
  cfg: { denoiseStep: number; denoiseFloor: number },
): number | null {
  const next = Number((current - cfg.denoiseStep).toFixed(4));
  return next < cfg.denoiseFloor ? null : next;
}
