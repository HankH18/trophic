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
 *   (2) NO DRIFTED REGION LARGE ENOUGH TO MATTER — the same IoU computed PER COLLISION CELL; a
 *       cell scoring under the threshold is "drifted"; drifted cells are grouped into 8-connected
 *       REGIONS, and a region fails if EITHER
 *         · it holds as many JUDGED cells as the player's own footprint
 *           (`ceil(playerSpriteW / collisionCellPx) × ceil(playerSpriteH / collisionCellPx)` = 6), OR
 *         · the base's edge pixels that have GONE inside it reach `driftLimit × (2·dilatePx+1)²`
 *           — one dilated edge blob per cell of that footprint (6 × 25 = 150 px).
 *       LOST edges, not total disagreement: what a collision mask cannot survive is structure
 *       leaving, and a year variant ADDING marks is the whole point of §9.5.
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
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE SECOND CLAUSE OF (2) EXISTS: A CELL COUNT ALONE MEASURED THE WRONG THING.
 * ─────────────────────────────────────────────────────────────────────────────
 * The first version of criterion (2) was "largest 4-CONNECTED RUN of drifted cells < 6", plus a rule
 * that skipped any cell carrying fewer than one dilated blob (25 px) of edge union. Both halves were
 * measured wrong on the five real maps in this repo:
 *
 *   · THE SKIP DISCARDED THE STRONGEST EVIDENCE THERE IS. A cell whose two edge maps share NOTHING
 *     (ci = 0, cu = 10) is total disagreement, not "no evidence either way" — and it was dropped.
 *     Measured on pt-map-brackwater at (300,300): of the cells around a displaced building, four
 *     scored IoU 0.00 and were skipped for holding 8–24 union pixels.
 *   · THE SKIPPED CELLS THEN BROKE THE RUN. A drifted region is not 4-connected: the interior of a
 *     building carries no edges at all, so one displaced object leaves an outline of drifted cells
 *     with holes and diagonals in it. The run therefore came out at 2–4 cells against a limit of 6.
 *
 * Net effect, reproduced: a 64×64 px feature — LARGER than the 32×48 player — displaced by one whole
 * collision cell was ACCEPTED at 3 of 25 (map, position) pairs, on pt-map-brackwater and
 * pt-map-cindershelf. The mask still blocked the strip it vacated and left the strip it newly
 * covered walkable, which is exactly the Hard Req 5 failure this gate exists to stop.
 *
 * The fix is to measure the region the way a region is: 8-connected, every cell that carries any
 * evidence kept IN the region (so its pixels are counted and it cannot punch a hole), the evidence
 * floor demoted to deciding only whether a cell's own RATIO counts toward the footprint clause, and
 * a second clause on the LOST edge area inside the region. The area clause is what catches a drift
 * that is one cell tall and four cells long — a horizontally displaced object — which no
 * cell-count-in-a-run can ever reach.
 *
 * Criterion (2) is measured in COLLISION CELLS because that is the unit the collision mask is
 * authored in, and the size limit is the PLAYER'S FOOTPRINT because that is the physical statement
 * of the failure. Every number in it is derived from `balance.map` and `balance.overlayDiff` (G11) —
 * `driftLimit` is the footprint in cells and `(2·dilatePx+1)²` is the area one dilated edge pixel
 * occupies — so retuning the gate is an edit to data/balance.json and not to this directory.
 *
 * Measured separation on five real 1024² painted maps (see tests/unit/overlay-diff.test.ts), at 5
 * positions each: a 64px feature displaced by ONE collision cell is rejected at 25 of 25 pairs
 * (worst-region LOST edges 151–1550 px against the 150 px limit), while a linear tint of any depth
 * (≤ 40 lost), a synthetic weathering pass (≤ 112 lost) and 24 hard 5×5 rot blotches (≤ 25 lost,
 * 227–259 GAINED) are all accepted.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AND THE RESIDUAL, WHICH IS THE OTHER HALF OF THAT SENTENCE (B-D39).
 * ─────────────────────────────────────────────────────────────────────────────
 * 25 of 25 is where the gate WORKS, not where it stops. HALVE the feature and it stops: a 32px
 * feature — 2×2 collision cells, an object smaller than the 32×48 player — displaced by one cell is
 * still ACCEPTED at **8 of the same 25 (map, position) pairs**. At 48px it is accepted at 1 of 25.
 * And the tightest true positive kept has ONE PIXEL of margin: 151 lost against a limit of 150.
 * So the honest statement of this gate is: it catches a displaced object at player scale and above,
 * it does not reliably catch one below that, and it is one pixel from not catching the smallest
 * case it does. `tests/unit/overlay-diff.test.ts` pins the 32px count so a retune of
 * `balance.overlayDiff` cannot move that boundary in silence — in either direction.
 *
 * The OTHER direction is unmeasured and is the bigger unknown: the false-REJECT rate on real aged
 * variants (B-D25). The largest drift seen on real material ran 7–18 cells against a limit of 6 on
 * 3 of 5 maps, but no §9.5 img2img run has ever happened, so nothing here has been pointed at an
 * actual year variant. Neither number is a reason to hand-wave a REJECT: G4 forbids overriding one.
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
 * ones, and those cells drift together in one region. `unrestrictedIou` is reported alongside so the
 * cost stays visible rather than being an argument in a comment — and it is deliberately computed
 * from a SECOND pair of whole-frame edge maps, because the ones the gate scores are normalised to
 * the walkable population (see `edgeMap`) and so are not the whole-frame measurement it claims to be.
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
   * The player's footprint in collision cells. A drifted region of at least `cols × rows` cells —
   * or one holding that many cells' worth of disagreeing edge pixels — fails criterion (2).
   * Derived from `balance.map` by `overlayDiffConfig()`.
   */
  driftFootprint: CellFootprint;
}

/** One 8-connected group of drifted collision cells, and everything measured about it. */
export interface DriftRegion {
  /** Drifted cells in the region. */
  cells: number;
  /**
   * Of those, the cells carrying at least one dilated edge pixel's worth of union evidence
   * (`(2·dilatePx+1)²`). A cell holding 8 union pixels is real evidence of DISAGREEMENT — it stays in
   * the region and its pixels are counted below — but its own RATIO is not a verdict about a cell,
   * so it does not count toward the footprint clause.
   */
  judgedCells: number;
  /**
   * Base edge pixels inside the region, in walkable pixels only, that the candidate does NOT have.
   * Structure that WAS there and is now gone — the thing a collision mask authored against the base
   * can no longer be right about. This is the quantity criterion (2) fails on.
   */
  lostEdges: number;
  /**
   * Candidate edge pixels the base does not have. Reported, never failed on: rot, moss, scorch and
   * new grain are what bible §6's aging arcs ADD, and adding a mark does not move a layout. Measured
   * on all five real maps: 24 hard 5×5 rot blotches score 227–259 gained against 0–25 lost, while a
   * 64px feature displaced ONE cell scores 151–1550 lost.
   */
  gainedEdges: number;
  /** `lostEdges + gainedEdges` — every walkable edge pixel the two maps disagree about here. */
  disagreement: number;
  /** Inclusive cell bounds. */
  cellRect: { cx0: number; cy0: number; cx1: number; cy1: number };
  /** The same rectangle in image pixels, so the operator looks at the right part of the map. */
  pixelRect: { x0: number; y0: number; x1: number; y1: number };
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
  /** Cells in the worst drifted region — the one that decided `localPass`. */
  largestDrift: number;
  /** `driftFootprint.cols × driftFootprint.rows` — the judged-cell count at which a region fails. */
  driftLimit: number;
  /**
   * `driftLimit × (2·dilatePx+1)²` — the LOST-edge area, in walkable pixels, at which a drifted
   * region fails regardless of how few cells it spans. One dilated edge blob per cell of the
   * player's footprint.
   */
  lostEdgeLimit: number;
  /** Top-left cell of the worst drifted region, for the operator to go and look at. */
  worstDrift?: { cx: number; cy: number };
  /** The worst drifted region in full — bounds in cells AND in pixels, and what was measured in it. */
  worstRegion?: DriftRegion;
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
  const walk = mask ? walkableMaskFor(mask, grid, width, height) : allWalkable(width, height);
  // The edge maps the gate SCORES are normalised over the walkable population, so that a repaint
  // confined to blocked cells cannot move the measurement inside the walkable ones (see `edgeMap`).
  const eb = edgeMap(base, config, walk);
  const ec = edgeMap(candidate, config, walk);
  // `unrestrictedIou` is what §8.2 would have scored with no mask at all, so it has to come from
  // whole-frame-normalised maps; reusing the pair above would silently report a third thing.
  const [fb, fc] = mask ? [edgeMap(base, config), edgeMap(candidate, config)] : [eb, ec];

  let intersection = 0;
  let union = 0;
  let walkable = 0;
  let baseEdges = 0;
  let candidateEdges = 0;
  let allIntersection = 0;
  let allUnion = 0;
  for (let i = 0; i < walk.length; i++) {
    if (fb[i] && fc[i]) allIntersection++;
    if (fb[i] || fc[i]) allUnion++;
    if (!walk[i]) continue;
    const a = eb[i]!;
    const b = ec[i]!;
    walkable++;
    if (a) baseEdges++;
    if (b) candidateEdges++;
    if (a && b) intersection++;
    if (a || b) union++;
  }

  // ── criterion (2): the same ratio, per collision cell, then grouped into regions.
  //
  // EVERY cell that carries any evidence is judged. An earlier version skipped cells holding fewer
  // than one dilated blob (25 px) of union — which threw away cells scoring IoU 0.00 on 8–24 px of
  // total disagreement, and, worse, punched holes in the region they belonged to. Noise control
  // lives in the REGION test below, where there are six cells' worth of evidence to be robust with,
  // not in a per-cell skip that silently deletes the strongest evidence the gate can have.
  const cellCount = grid.cols * grid.rows;
  const drifted = new Uint8Array(cellCount);
  const cellJudged = new Uint8Array(cellCount);
  const cellLost = new Int32Array(cellCount);
  const cellGained = new Int32Array(cellCount);
  const minCellEvidence = (2 * config.dilatePx + 1) ** 2;
  const xs: CellSpan[] = [];
  for (let cx = 0; cx < grid.cols; cx++) {
    const sx = spanOf(cx, grid.cols, width);
    xs.push({ x0: sx.lo, x1: sx.hi, y0: 0, y1: 0 });
  }
  let cellsCompared = 0;
  let cellsDrifted = 0;
  for (let cy = 0; cy < grid.rows; cy++) {
    const sy = spanOf(cy, grid.rows, height);
    for (let cx = 0; cx < grid.cols; cx++) {
      const sx = xs[cx]!;
      let ci = 0;
      let cu = 0;
      let lost = 0;
      let gained = 0;
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
          if (a && !b) lost++;
          if (!a && b) gained++;
        }
      }
      if (!anyWalkable || cu === 0) continue; // blocked, or neither map has an edge here at all
      cellsCompared++;
      if (ci / cu < config.iouThreshold) {
        const k = cy * grid.cols + cx;
        drifted[k] = 1;
        if (cu >= minCellEvidence) cellJudged[k] = 1;
        cellLost[k] = lost;
        cellGained[k] = gained;
        cellsDrifted++;
      }
    }
  }
  const driftLimit = foot.cols * foot.rows;
  const lostEdgeLimit = driftLimit * minCellEvidence;
  const worst = worstRegion(
    { drifted, judged: cellJudged, lost: cellLost, gained: cellGained },
    grid,
    width,
    height,
    driftLimit,
    lostEdgeLimit,
  );

  const iou = union === 0 ? 0 : intersection / union;
  const unrestrictedIou = allUnion === 0 ? 0 : allIntersection / allUnion;
  const globalPass = iou >= config.iouThreshold;
  const localPass =
    worst === undefined || (worst.judgedCells < driftLimit && worst.lostEdges < lostEdgeLimit);
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
    largestDrift: worst?.cells ?? 0,
    driftLimit,
    lostEdgeLimit,
    unrestrictedIou,
    reason: '',
  };
  if (worst) {
    result.worstRegion = worst;
    result.worstDrift = { cx: worst.cellRect.cx0, cy: worst.cellRect.cy0 };
  }

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

  // The wording below states only what was MEASURED, and points at the pixels that were measured.
  // An earlier version told the operator "the layout moved inside the walkable cells" and named a
  // cell — in a case where zero walkable pixels differed and the change was 760 px from the cell it
  // cited. G4 forbids overriding a REJECT by hand, so the message is the operator's only lead; a
  // message that asserts an inference it has not checked sends them to the wrong part of the map.
  const where = worst
    ? `cells (${worst.cellRect.cx0}, ${worst.cellRect.cy0})–(${worst.cellRect.cx1}, ${worst.cellRect.cy1}) ` +
      `= px (${worst.pixelRect.x0}, ${worst.pixelRect.y0})–(${worst.pixelRect.x1}, ${worst.pixelRect.y1})`
    : 'no region';
  const regionFacts = worst
    ? `${worst.cells} drifted cell(s) (${worst.judgedCells} of them carrying a full edge blob) spanning ` +
      `${where}, where ${worst.lostEdges} base edge px are GONE and ${worst.gainedEdges} are NEW`
    : 'no drifted region at all';
  const localLimits = `limits: ${driftLimit} judged cells (the ${foot.cols}×${foot.rows}-cell player ` +
    `footprint) or ${lostEdgeLimit} lost px`;
  // Named in every rejection because it is the rule the operator is about to want to argue with.
  const rule =
    'Hard Req 5 asks ONE collision mask to fit all six years, and this candidate\'s edges inside the ' +
    'walkable cells do not match the base\'s. G4: a variant that has not passed overlay-diff is never ' +
    'accepted by hand — regenerate at the next denoise on the §9.5 ladder.';

  if (result.accepted) {
    result.reason =
      `ACCEPT — IoU ${iou.toFixed(4)} ≥ ${config.iouThreshold} over ${walkable} walkable px, and the ` +
      `worst drifted region is ${regionFacts} — under both local limits (${localLimits}) ` +
      `(§8.2 + Hard Req 5).`;
  } else if (!globalPass && !localPass) {
    result.reason =
      `REJECT — IoU ${iou.toFixed(4)} < ${config.iouThreshold} over the walkable cells, AND one ` +
      `drifted region reaches a local limit: ${regionFacts} (${localLimits}). The edge maps disagree ` +
      `frame-wide and in one place in particular; go and look at ${where}. ${rule}`;
  } else if (!globalPass) {
    result.reason =
      `REJECT — IoU ${iou.toFixed(4)} < ${config.iouThreshold} over ${walkable} walkable px. No single ` +
      `region reached a local limit (worst: ${regionFacts}), so the disagreement is spread across the ` +
      `frame: ${cellsDrifted} of ${cellsCompared} compared cells drifted. That is a whole-frame repaint, ` +
      `not one moved feature. ${rule}`;
  } else {
    result.reason =
      `REJECT — IoU ${iou.toFixed(4)} clears ${config.iouThreshold} frame-wide, but one drifted region ` +
      `reaches a local limit: ${regionFacts} (${localLimits}). A frame-wide ratio cannot see a local ` +
      `change; this is one. ${cellsDrifted} of ${cellsCompared} compared cells drifted in all. ` +
      `Go and look at ${where}. ${rule}`;
  }
  return result;
}

/**
 * The drifted region that decides `localPass`: drifted cells grouped 8-connected, and the one that
 * comes closest to a limit reported in full.
 *
 * 8-connected, not 4: one displaced object leaves an OUTLINE of drifted cells, and an outline runs
 * diagonally and passes over cells that carry no edges at all. Measured on pt-map-brackwater at
 * (300,300), a 64px feature displaced one cell produced a 4-connected run of 3 cells and an
 * 8-connected region of 9 — the same physical region, counted two ways, one of which cleared a limit
 * of 6 and one of which did not.
 *
 * "Closest to a limit" is `max(judgedCells / driftLimit, lostEdges / lostEdgeLimit)`, so the region
 * reported is the one that actually drove the verdict rather than merely the widest one.
 *
 * WHY THE LIMIT IS ON LOST EDGES AND NOT ON TOTAL DISAGREEMENT. A year variant is SUPPOSED to add
 * marks — bible §6's arcs are rot, moss, scorch and thinning canopy — and a mark that appears on
 * open ground moves nothing: the collision mask authored against the base is still exactly right.
 * What invalidates that mask is structure that has GONE from where it was. Measured on the five real
 * maps in this repo, that distinction is the whole gate: 24 hard 5×5 rot blotches score 227–259
 * gained and 0–25 lost, a synthetic weathering pass scores ≤ 112 lost, a linear tint ≤ 40 lost — and
 * a 64px feature displaced by ONE collision cell scores 151–1550 lost at 25 of 25 (map, position)
 * pairs, because displacing a thing always vacates where it was. Failing on TOTAL disagreement
 * instead was measured to reject the rot blotches (242 px) while still accepting the tightest real
 * displacement (151 px) — i.e. exactly backwards.
 *
 * WHERE THIS STOPS WORKING, stated here as well as in the file header because this function is
 * where the limit is decided: 151 against 150 is one pixel of margin, and a feature half that size
 * falls off the other side. A 32px feature displaced one cell is ACCEPTED at 8 of those same 25
 * pairs (B-D39). Pinned by tests/unit/overlay-diff.test.ts so a retune cannot move it quietly.
 */
function worstRegion(
  cellData: { drifted: Uint8Array; judged: Uint8Array; lost: Int32Array; gained: Int32Array },
  grid: CellGrid,
  width: number,
  height: number,
  driftLimit: number,
  lostEdgeLimit: number,
): DriftRegion | undefined {
  const { drifted, judged, lost, gained } = cellData;
  const seen = new Uint8Array(drifted.length);
  const stack: number[] = [];
  let best: DriftRegion | undefined;
  let bestScore = -1;
  for (let s = 0; s < drifted.length; s++) {
    if (!drifted[s] || seen[s]) continue;
    let cells = 0;
    let judgedCells = 0;
    let lostEdges = 0;
    let gainedEdges = 0;
    let cx0 = grid.cols;
    let cy0 = grid.rows;
    let cx1 = -1;
    let cy1 = -1;
    stack.length = 0;
    stack.push(s);
    seen[s] = 1;
    while (stack.length > 0) {
      const p = stack.pop()!;
      cells++;
      if (judged[p]) judgedCells++;
      lostEdges += lost[p]!;
      gainedEdges += gained[p]!;
      const cx = p % grid.cols;
      const cy = (p - cx) / grid.cols;
      if (cx < cx0) cx0 = cx;
      if (cx > cx1) cx1 = cx;
      if (cy < cy0) cy0 = cy;
      if (cy > cy1) cy1 = cy;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) continue;
          const q = ny * grid.cols + nx;
          if (drifted[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    const score = Math.max(judgedCells / driftLimit, lostEdges / lostEdgeLimit);
    if (score > bestScore) {
      bestScore = score;
      const lo = spanOf(cx0, grid.cols, width);
      const hi = spanOf(cx1, grid.cols, width);
      const loY = spanOf(cy0, grid.rows, height);
      const hiY = spanOf(cy1, grid.rows, height);
      best = {
        cells,
        judgedCells,
        lostEdges,
        gainedEdges,
        disagreement: lostEdges + gainedEdges,
        cellRect: { cx0, cy0, cx1, cy1 },
        pixelRect: { x0: lo.lo, y0: loY.lo, x1: hi.hi - 1, y1: hiY.hi - 1 },
      };
    }
  }
  return best;
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
