/**
 * tools/mapgen/verify.ts — the properties a layout must hold, as functions that return sentences.
 *
 * WHY THESE LIVE IN THE TOOL AND NOT IN THE TEST FILE. Two reasons, and the second is the one that
 * matters:
 *
 *   1. `tools/mapgen/seed.ts` runs every one of them before it writes a file, so the generator is
 *      STRUCTURALLY INCAPABLE of emitting a layout that fails them. It does not "try to" satisfy
 *      the contract; it refuses to produce output that does not.
 *   2. `tests/unit/mapgen.test.ts` imports the SAME functions and runs them against the layouts on
 *      disk — which a human is expected to edit by hand. So the test is not checking that the
 *      generator agrees with a paraphrase of itself; it is checking the artefact against the one
 *      statement of the rule, and a bad hand edit goes red.
 *
 * Every function returns `string[]`: empty means conforming. That shape is what makes the sabotage
 * control in the test file possible — a deliberately broken layout is fed to these same functions
 * and the test asserts they come back NON-empty. A gate that cannot be shown to fail is decoration.
 */

import {
  chooseSpawnTile,
  firstWalkableTile,
  isBlocked,
  maskRasterFrom,
  readMask,
  tileGridSize,
  tileWalkable,
} from '../../game/collision.ts';
import type { Balance, NodeFile } from '../../core/types.ts';
import { legendIndex } from './legend.ts';
import {
  anchorsOf,
  cellsOfKinds,
  charAt,
  collisionGridOf,
  reachableFrom,
  regionsOf,
  type LayoutDoc,
  type LayoutRegion,
} from './layout.ts';

/* ────────────────────────────────────────────────────────────────────────────
 * Kind names this file reasons about. Strings, not an enum — see legend.ts.
 * ──────────────────────────────────────────────────────────────────────────── */

export const KIND_BUILDING = 'building-footprint';
export const KIND_CORRIDOR = 'path-corridor';
export const KIND_CENTRE = 'centre-clearing';
export const KIND_MOUTH = 'edge-mouth';
export const KIND_PROP = 'prop-anchor';

/**
 * The band a building footprint's extent must fall in, in MAP-NATIVE pixels, on BOTH axes.
 *
 * Measured, not chosen: it is the range the real generated-map corpus put a readable building in.
 * Below ~85px a footprint reads as a shed or as noise at the shipped render scale; above ~140px the
 * sampler renders one building as a district. HEIGHT is the axis that failed worse in the corpus —
 * an isometric roof grows upward and the footprint follows it — so the band is applied to height
 * with the same strictness as to width, which is the part a width-only check kept missing.
 *
 * It is here rather than in `data/balance.json` because it constrains an ART ARTEFACT and never
 * reaches the sim, the battle reducer or a save; G11 governs gameplay constants. If a later pass
 * decides the mask geometry it produces IS a gameplay number, moving it into `balance.map` is a
 * one-line change and this comment is the reason to record.
 *
 * At the shipped 16px cell this admits spans of 6, 7 or 8 cells (96 / 112 / 128 native px).
 */
export const FOOTPRINT_MIN_NATIVE_PX = 85;
export const FOOTPRINT_MAX_NATIVE_PX = 140;

/* ────────────────────────────────────────────────────────────────────────────
 * 1. Edges — corridors, and the two edges that must stay sealed
 * ──────────────────────────────────────────────────────────────────────────── */

export type EdgeName = 'top' | 'bottom' | 'left' | 'right';

export interface EdgeCorridor {
  edge: EdgeName;
  /** Contiguous walkable cells on the outermost ring, along that edge. */
  from: number;
  to: number;
}

/** Every contiguous run of walkable cells that touches the map edge, by edge. */
export function edgeCorridors(doc: LayoutDoc): EdgeCorridor[] {
  const index = legendIndex(doc.legend);
  const { cols, rows } = doc.dims;
  const walkable = (c: number, r: number): boolean => {
    const e = index.get(charAt(doc, c, r));
    return e !== undefined && !e.blocks;
  };
  const out: EdgeCorridor[] = [];
  const scan = (edge: EdgeName, n: number, at: (i: number) => [number, number]): void => {
    let run: number | null = null;
    for (let i = 0; i < n; i += 1) {
      const [c, r] = at(i);
      if (walkable(c, r)) {
        if (run === null) run = i;
      } else if (run !== null) {
        out.push({ edge, from: run, to: i - 1 });
        run = null;
      }
    }
    if (run !== null) out.push({ edge, from: run, to: n - 1 });
  };
  scan('top', cols, (i) => [i, 0]);
  scan('bottom', cols, (i) => [i, rows - 1]);
  scan('left', rows, (i) => [0, i]);
  scan('right', rows, (i) => [cols - 1, i]);
  return out;
}

/**
 * The corridors must be exactly the node's declared adjacencies, on the edges the chain convention
 * assigns: BOTTOM back toward the first town, TOP onward toward the terminus. Left and right are
 * sealed, always — the region is a north–south chain and a hole in a side wall is an exit to
 * nowhere that `chooseSpawnTile` and the movement code would both happily walk into.
 */
export function checkEdgeCorridors(
  doc: LayoutDoc,
  node: NodeFile,
  edges: { back: string | null; onward: string | null },
): string[] {
  const problems: string[] = [];
  const found = edgeCorridors(doc);
  const declared = node.adjacency.length;

  const sides = found.filter((c) => c.edge === 'left' || c.edge === 'right');
  for (const s of sides) {
    problems.push(`"${node.id}": the ${s.edge} edge is open at ${s.from}–${s.to}; left and right must be sealed`);
  }
  if (found.length !== declared) {
    const summary = found.map((c) => `${c.edge}:${c.from}–${c.to}`).join(', ') || '(none)';
    problems.push(
      `"${node.id}": ${found.length} edge-touching corridor(s) [${summary}] but adjacency declares ${declared} ` +
        `(${node.adjacency.join(', ') || 'none'})`,
    );
  }
  const wantTop = edges.onward !== null ? 1 : 0;
  const wantBottom = edges.back !== null ? 1 : 0;
  const gotTop = found.filter((c) => c.edge === 'top').length;
  const gotBottom = found.filter((c) => c.edge === 'bottom').length;
  if (gotTop !== wantTop) {
    problems.push(
      `"${node.id}": ${gotTop} corridor(s) on the TOP edge, expected ${wantTop} ` +
        `(onward = ${edges.onward ?? 'nothing — this is the terminus'})`,
    );
  }
  if (gotBottom !== wantBottom) {
    problems.push(
      `"${node.id}": ${gotBottom} corridor(s) on the BOTTOM edge, expected ${wantBottom} ` +
        `(back = ${edges.back ?? 'nothing — this is the head of the chain'})`,
    );
  }
  return problems;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2. The spawn — asked of the REAL engine functions, not of a copy of them
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Runs `chooseSpawnTile` / `firstWalkableTile` from `game/collision.ts` over the grid this layout
 * actually produces. Nothing here reimplements the ring search; if the engine's idea of where the
 * player lands ever changes, this check changes with it and the layouts are re-judged.
 *
 * It also asserts the lattice the search runs on IS the centre-origin map-scale one this whole tool
 * assumes: `tileGridSize` must be square and even, so `floor(cols/2)` is the middle, and the middle
 * tile must correspond to native (nativePx/2, nativePx/2).
 */
export function checkSpawn(doc: LayoutDoc, balance: Balance): string[] {
  const problems: string[] = [];
  const grid = collisionGridOf(doc);
  const tiles = tileGridSize(balance);
  const midCol = Math.floor(tiles.cols / 2);
  const midRow = Math.floor(tiles.rows / 2);

  const midNativeX = (midCol * balance.map.tileStepPx) / balance.map.mapRenderScale;
  const midNativeY = (midRow * balance.map.tileStepPx) / balance.map.mapRenderScale;
  const wantNative = balance.map.mapNativePx / 2;
  if (midNativeX !== wantNative || midNativeY !== wantNative) {
    problems.push(
      `the spawn search lattice is not centre-origin at map scale: firstWalkableTile starts at tile ` +
        `(${midCol},${midRow}), which is native (${midNativeX},${midNativeY}), not (${wantNative},${wantNative}). ` +
        `The "open region at the map centre" this tool carves would not be where the player lands.`,
    );
  }

  const first = firstWalkableTile(grid, balance);
  const choice = chooseSpawnTile(grid, balance);
  if (first === null) problems.push(`"${doc.nodeId}": firstWalkableTile found no walkable tile at all`);
  if (choice.problem !== null) problems.push(`"${doc.nodeId}": ${choice.problem}`);
  if (!tileWalkable(grid, choice.tile.col, choice.tile.row, balance)) {
    problems.push(
      `"${doc.nodeId}": chooseSpawnTile returned tile (${choice.tile.col},${choice.tile.row}), which is BLOCKED — ` +
        `the player would be standing in geometry`,
    );
  }
  if (isBlocked(grid, midCol, midRow)) {
    problems.push(`"${doc.nodeId}": the centre cell (${midCol},${midRow}) is blocked`);
  }
  return problems;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3. Props — every authored (x,y) has an anchor on it
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Tolerance is EXACTLY the quantisation error and no more: a prop at native (x,y) falls in cell
 * `floor(x/cellPx)`, whose centre is at most `cellPx/2` away on each axis. Anything larger means the
 * anchor was MOVED off its prop — which is the failure this check exists to catch, so widening the
 * tolerance to accommodate it would delete the check.
 */
export function propAnchorToleranceNativePx(doc: LayoutDoc): number {
  return doc.dims.cellPx / 2;
}

export function checkPropAnchors(doc: LayoutDoc, node: NodeFile): string[] {
  const problems: string[] = [];
  const tol = propAnchorToleranceNativePx(doc);
  const anchors = anchorsOf(doc).filter((a) => a.kind === KIND_PROP);
  for (const prop of node.props) {
    const hit = anchors.find(
      (a) => Math.abs(a.centreX - prop.x) <= tol && Math.abs(a.centreY - prop.y) <= tol,
    );
    if (!hit) {
      const near = anchors
        .map((a) => `(${a.col},${a.row})`)
        .join(' ');
      problems.push(
        `"${node.id}": prop "${prop.id}" at native (${prop.x},${prop.y}) — cell ` +
          `(${Math.floor(prop.x / doc.dims.cellPx)},${Math.floor(prop.y / doc.dims.cellPx)}) — has no ` +
          `${KIND_PROP} within ±${tol}px. Anchors present: ${near || '(none)'}`,
      );
    }
  }
  const extra = anchors.length - node.props.length;
  if (extra > 0) {
    problems.push(`"${node.id}": ${anchors.length} ${KIND_PROP}s for ${node.props.length} authored props`);
  }
  return problems;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 4 & 5 & 6. Building footprints
 * ──────────────────────────────────────────────────────────────────────────── */

export function footprintsOf(doc: LayoutDoc): LayoutRegion[] {
  return regionsOf(doc, (e) => e.kind === KIND_BUILDING).filter((r) => r.kind === KIND_BUILDING);
}

/** Width AND height in the band. Height is checked with the same strictness as width, deliberately. */
export function checkFootprintBand(doc: LayoutDoc): string[] {
  const problems: string[] = [];
  for (const f of footprintsOf(doc)) {
    const where = `at cell (${f.col0},${f.row0})`;
    if (f.nativeW < FOOTPRINT_MIN_NATIVE_PX || f.nativeW > FOOTPRINT_MAX_NATIVE_PX) {
      problems.push(
        `"${doc.nodeId}": footprint ${where} is ${f.nativeW} native px WIDE, outside ` +
          `${FOOTPRINT_MIN_NATIVE_PX}–${FOOTPRINT_MAX_NATIVE_PX}`,
      );
    }
    if (f.nativeH < FOOTPRINT_MIN_NATIVE_PX || f.nativeH > FOOTPRINT_MAX_NATIVE_PX) {
      problems.push(
        `"${doc.nodeId}": footprint ${where} is ${f.nativeH} native px TALL, outside ` +
          `${FOOTPRINT_MIN_NATIVE_PX}–${FOOTPRINT_MAX_NATIVE_PX}`,
      );
    }
    if (!f.rectangular) {
      problems.push(
        `"${doc.nodeId}": footprint ${where} is not a solid rectangle (${f.cells} cells in a ` +
          `${f.col1 - f.col0 + 1}×${f.row1 - f.row0 + 1} box), so its extent is not its footprint`,
      );
    }
  }
  return problems;
}

/**
 * No footprint may overlap another, the corridor, or the centre region.
 *
 * "Overlap" is checked on the BOUNDING BOX plus a one-cell gap, not on the cell set. Two footprints
 * cannot literally share a cell — a cell holds one character — so a cell-set test would pass
 * trivially. What this catches is a footprint whose BOX swallows ground that belongs to something
 * else: two buildings touching at a corner, or an L of buildings with the lane running through the
 * notch.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS CHECK CANNOT SEE, and which check does
 * ─────────────────────────────────────────────────────────────────────────────
 * A single rectangular footprint painted straight over a run of lane ERASES those characters, and a
 * check that reads the finished file has nothing left to compare against: the box and the region
 * are the same cells, and every one of them says `building-footprint`. Two footprints laid flush
 * side by side likewise merge into ONE 4-connected region rather than staying two.
 *
 * Neither case is unguarded, and it is worth naming which guard catches which, because "the
 * clearance check passed" is otherwise read as "nothing is on the lane":
 *   · a footprint that eats a mid-lane run SEVERS the lane, and `checkReachability` finds the mouth
 *     it cut off — a mask can be perfectly usable and still be unplayable, and that is the check
 *     that knows the difference;
 *   · two footprints laid flush become one over-wide region, and `checkFootprintBand` fails it on
 *     extent — 12 cells is 192 native px against a 140 ceiling.
 * The sabotage control in tests/unit/mapgen.test.ts exercises all three routes, so the division of
 * labour is asserted rather than described.
 */
export function checkFootprintClearance(doc: LayoutDoc): string[] {
  const problems: string[] = [];
  const footprints = footprintsOf(doc);
  const cols = doc.dims.cols;
  const forbidden = new Map<number, string>();
  for (const key of cellsOfKinds(doc, [KIND_CORRIDOR, KIND_MOUTH])) forbidden.set(key, KIND_CORRIDOR);
  for (const key of cellsOfKinds(doc, [KIND_CENTRE])) forbidden.set(key, KIND_CENTRE);

  for (let i = 0; i < footprints.length; i += 1) {
    const a = footprints[i];
    if (!a) continue;
    for (let j = i + 1; j < footprints.length; j += 1) {
      const b = footprints[j];
      if (!b) continue;
      // Separated iff expanding either box by one cell still leaves them disjoint on some axis.
      const separated =
        a.col1 + 1 < b.col0 || b.col1 + 1 < a.col0 || a.row1 + 1 < b.row0 || b.row1 + 1 < a.row0;
      if (!separated) {
        problems.push(
          `"${doc.nodeId}": footprints at (${a.col0},${a.row0}) and (${b.col0},${b.row0}) are flush or ` +
            `overlapping — every pair needs at least one clear cell between them`,
        );
      }
    }
    for (let row = a.row0; row <= a.row1; row += 1) {
      for (let col = a.col0; col <= a.col1; col += 1) {
        const hit = forbidden.get(row * cols + col);
        if (hit !== undefined) {
          problems.push(
            `"${doc.nodeId}": the footprint at (${a.col0},${a.row0}) covers ${hit} cell (${col},${row})`,
          );
        }
      }
    }
  }
  return problems;
}

/** Routes and the terminus site emit zero footprints. */
export function checkSettlementOnly(doc: LayoutDoc, settlement: boolean): string[] {
  const found = footprintsOf(doc);
  if (settlement || found.length === 0) return [];
  return [
    `"${doc.nodeId}": ${found.length} building footprint(s) on a node that is not a settlement — ` +
      `routes and the terminus site carry none`,
  ];
}

/* ────────────────────────────────────────────────────────────────────────────
 * 7. Reachability — a corridor nobody can walk to is not a corridor
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Not in the brief's list, and kept anyway. A layout can satisfy every check above and still seal a
 * prop inside a courtyard or wall a mouth off behind a building: each cell is walkable, the counts
 * are right, and the map is unplayable. `readMask` would call it usable, because "some cell is
 * walkable" is all it asks.
 */
export function checkReachability(doc: LayoutDoc, balance: Balance): string[] {
  const problems: string[] = [];
  const cols = doc.dims.cols;
  const midCol = Math.floor(tileGridSize(balance).cols / 2);
  const midRow = Math.floor(tileGridSize(balance).rows / 2);
  const reached = reachableFrom(doc, midCol, midRow);
  if (reached.size === 0) {
    problems.push(`"${doc.nodeId}": the centre cell (${midCol},${midRow}) is blocked, so nothing is reachable`);
    return problems;
  }
  for (const a of anchorsOf(doc)) {
    if (!reached.has(a.row * cols + a.col)) {
      problems.push(
        `"${doc.nodeId}": the ${a.kind} at cell (${a.col},${a.row}) is walkable but sealed off from the ` +
          `centre — no walk reaches it`,
      );
    }
  }
  for (const c of edgeCorridors(doc)) {
    const at = c.edge === 'top' ? [c.from, 0] : c.edge === 'bottom' ? [c.from, doc.dims.rows - 1] : c.edge === 'left' ? [0, c.from] : [cols - 1, c.from];
    const [ec, er] = at as [number, number];
    if (!reached.has(er * cols + ec)) {
      problems.push(`"${doc.nodeId}": the ${c.edge}-edge corridor at ${c.from}–${c.to} is sealed off from the centre`);
    }
  }
  return problems;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 8. The mask round trip
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * ASCII → grid → `maskRasterFrom` → `readMask` → grid, and the two grids must be bit-identical.
 *
 * `maskRasterFrom` is the engine's own encoder and the declared inverse of `sampleMask`; going
 * through it rather than writing a second encoder is the whole point. `readMask` is then asked for
 * its verdict with NO options, which is what ships: `OverworldScene.buildNodeView` calls
 * `loadCollision(...)` with none, so `sampleMask` falls to `polarity: 'dark-blocks'` and
 * `policy: 'majority'`.
 */
export function checkMaskRoundTrip(doc: LayoutDoc, balance: Balance): string[] {
  const problems: string[] = [];
  const grid = collisionGridOf(doc);
  const pixels = maskRasterFrom(grid, balance);
  const reading = readMask(doc.nodeId, pixels, balance);
  if (!reading.health.usable) {
    problems.push(`"${doc.nodeId}": readMask refuses the mask — ${reading.health.problems.join(' · ')}`);
  }
  if (reading.grid.cols !== grid.cols || reading.grid.rows !== grid.rows) {
    problems.push(
      `"${doc.nodeId}": round trip changed the grid size, ${grid.cols}×${grid.rows} → ` +
        `${reading.grid.cols}×${reading.grid.rows}`,
    );
    return problems;
  }
  let differing = 0;
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      if (isBlocked(grid, col, row) !== isBlocked(reading.grid, col, row)) differing += 1;
    }
  }
  if (differing > 0) {
    problems.push(`"${doc.nodeId}": ${differing} of ${grid.cols * grid.rows} cells changed across the mask round trip`);
  }
  return problems;
}

/* ────────────────────────────────────────────────────────────────────────────
 * All of it
 * ──────────────────────────────────────────────────────────────────────────── */

export interface VerifyInput {
  doc: LayoutDoc;
  node: NodeFile;
  balance: Balance;
  back: string | null;
  onward: string | null;
  settlement: boolean;
}

/** Every check, in one list. Empty ⇒ the layout is in contract. */
export function verifyLayout(input: VerifyInput): string[] {
  const { doc, node, balance } = input;
  return [
    ...checkEdgeCorridors(doc, node, { back: input.back, onward: input.onward }),
    ...checkSpawn(doc, balance),
    ...checkPropAnchors(doc, node),
    ...checkFootprintBand(doc),
    ...checkFootprintClearance(doc),
    ...checkSettlementOnly(doc, input.settlement),
    ...checkReachability(doc, balance),
    ...checkMaskRoundTrip(doc, balance),
  ];
}
