/**
 * tools/mapgen/seed.ts — the SEEDER: a starting layout per node, from what the node genuinely says.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS NOT
 * ═════════════════════════════════════════════════════════════════════════════
 * It is not a deriver, and the difference has been measured. An earlier pass built the best layout
 * `data/nodes/*.json` can justify — border, a gap on each declared edge, an open middle, a marker per
 * prop — for all twelve nodes, and it came out 7 to 14 cells different, out of 4096, from the
 * placeholder `synthesiseBorderCollision` already produces. The reason is in the schema: `zNodeFile`
 * has exactly TWO spatial fields, `adjacency` (a list of strings) and `props[].x/y` (seventeen points
 * across the whole region). There is no building data, no terrain data, no path shape. A pure
 * deriver cannot know more than the data knows, and the data knows almost nothing about shape.
 *
 * So layouts are AUTHORED, and this file writes the first draft. What it puts on the page comes from
 * four node facts and one seeded stream:
 *
 *   · `adjacency`  → which edges have a corridor mouth, via the chain in tools/mapgen/nodes.ts
 *   · `props[].x/y`→ a `prop-anchor` on the cell each one falls in
 *   · `biome`      → which characters the ground and the masses are spelled with
 *   · the region   → whether this node is a settlement, and therefore has buildings
 *   · `Rng`        → everything else: where the lane wanders, where the thickets sit, where the
 *                    buildings stand. Seeded from the node id, so it is the same every run, and
 *                    different for every node.
 *
 * THE OUTPUT IS A STARTING POINT FOR A HUMAN TO EDIT. It is deliberately not a finished map: nothing
 * here knows that Bowerdeep is built on one plank walk or that Brackwater stands on piles over open
 * water. It knows the map is legal, connected, and shaped differently from its neighbours. The
 * header of every file it writes says so in the first line.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NO `Math.random`, EVER (G11)
 * ═════════════════════════════════════════════════════════════════════════════
 * Every draw comes from `core/rng.ts`'s seeded xorshift128, keyed by `hashSeed(SEED_BASE, tag)`.
 * That is what makes "twice yields byte-identical output" a property rather than a hope.
 */

import { createRng, hashSeed, type Rng } from '../../core/rng.ts';
import type { Balance, NodeFile } from '../../core/types.ts';
import { DEFAULT_LEGEND, legendHeaderLines, type LegendEntry } from './legend.ts';
import {
  layoutDims,
  parseLayout,
  type LayoutDims,
  type LayoutDoc,
} from './layout.ts';
import type { NodePlacement } from './nodes.ts';
import { verifyLayout } from './verify.ts';

export class SeedError extends Error {}

/* ────────────────────────────────────────────────────────────────────────────
 * Shape constants.
 *
 * These are the seeder's TASTE, not the game's rules. Nothing here reaches the sim, a battle or a
 * save; every one of them is a first-draft default a human is expected to paint over. They are
 * gathered in one object so that changing the look of the seed is one edit in one place, which is
 * the same discipline `data/balance.json` applies to the numbers that ARE gameplay (G11).
 * ──────────────────────────────────────────────────────────────────────────── */

export const MAPGEN = {
  /** Mixed with the node id to key the stream. "TROP" as ASCII; any fixed value would do. */
  seedBase: 0x54_52_4f_50,
  /**
   * The boundary band's thickness, in cells. Each NODE draws its own band from these — a thin one
   * reads as open country running off the edge of the picture, a thick one as a place hemmed in —
   * and then the thickness varies again ALONG each edge. Twelve maps with the same frame is the
   * first thing that makes a set look machine-made.
   */
  borderMinLo: 1,
  borderMinHi: 3,
  borderExtraLo: 2,
  borderExtraHi: 5,
  /** The largest band any node can draw. Everything that insets from the edge uses this. */
  borderCapCells: 8,
  /**
   * Terrain masses per node, and the cell count of each. The ranges are wide on purpose: a node
   * that draws 5 masses of 8 cells and a node that draws 21 of 80 are a thin heath and a closed
   * wood, and the difference is what stops two maps of the same biome reading as one map.
   */
  blobsMin: 5,
  blobsMax: 22,
  blobCellsMin: 6,
  blobCellsMax: 90,
  /**
   * The open region at the map centre. `centreRadius` is its mean radius in cells; the boundary is
   * then pushed in and out by three harmonics so it comes out as a clearing rather than as a
   * compass circle. A perfect disc at dead centre on all twelve maps was the single most mechanical
   * thing on the first contact sheet, and it was in every frame.
   */
  centreRadius: 5,
  centreWobble: 1.7,
  /**
   * How far the clearing's CENTROID may sit off the map's centre, in cells. The clearing must
   * CONTAIN the centre cell — that is where `firstWalkableTile` starts — but nothing says it has to
   * be concentric with it, and a pale lozenge at exactly the same spot in twelve frames is the
   * loudest "one template, twelve seeds" tell a contact sheet can carry. Kept under the radius so
   * the centre cell is inside the blob by construction, not by luck.
   */
  centreOffsetCells: 4,
  /** The lane's width in cells, and the columns it is allowed to wander between. */
  laneWidthMin: 2,
  laneWidthMax: 3,
  laneMarginCells: 8,
  /**
   * Per row of lane: chance of a lateral step, and chance the drift reverses. Both are drawn PER
   * NODE from these ranges rather than fixed, so one region's track runs nearly straight and
   * another's switchbacks across half the map. Twelve lanes that meander at the same rate read as
   * twelve renders of one lane, whatever else differs around them.
   */
  laneLateralLo: 0.25,
  laneLateralHi: 0.85,
  laneDriftFlipLo: 0.06,
  laneDriftFlipHi: 0.34,
  /**
   * A prop this far (in cells) from the nearest lane cell gets a SPUR cut to it. The spur is the
   * one piece of lane shape that comes from the node's own data rather than from the stream: the
   * seventeen authored prop positions are scattered differently at every node, so the track network
   * is a different shape at every node. A spur never reaches an edge — it would be an exit the
   * adjacency does not declare — so it is clamped well inside the boundary band.
   */
  spurDistanceCells: 7,
  /**
   * Buildings per settlement. Five, because five is what the shipped town briefs describe
   * ("a farming hamlet of five buildings", "five tarred timber buildings", "five buildings strung
   * out in a loose line") — transcribed, not chosen (G2).
   */
  buildingsPerSettlement: 5,
  /** Footprint side in cells. At the shipped 16px cell this is 96–128 native px, inside the band. */
  buildingCellsMin: 6,
  buildingCellsMax: 8,
  /** Placement attempts before the arrangement gives up and falls back to uniform sampling. */
  arrangedAttempts: 250,
  uniformAttempts: 500,
} as const;

/**
 * Biome → the characters this node's ground and masses are spelled with.
 *
 * Not content, and not an invention of new content: the keys are exactly the `biome` strings
 * `data/nodes/*.json` already ships, and the values are legend characters. A marsh's masses are
 * water, a steppe's are rock, a forest's are trunks. An unfamiliar biome falls back to open ground
 * and the generic wall, and says so in the file header rather than guessing.
 */
const BIOME_TEXTURE: Readonly<Record<string, { ground: string; mass: string }>> = {
  Meadow: { ground: ',', mass: 'T' },
  Marsh: { ground: '.', mass: 'W' },
  Forest: { ground: ',', mass: 'T' },
  Steppe: { ground: '.', mass: 'R' },
  Vale: { ground: ',', mass: 'R' },
  Sanctum: { ground: '.', mass: 'R' },
};
const UNKNOWN_BIOME_TEXTURE = { ground: '.', mass: '#' } as const;

/**
 * How a settlement arranges its buildings. Three shapes, one drawn per town from its own stream, so
 * two towns do not come out as the same five rectangles in different places. Still a first draft:
 * the arrangement is a starting composition, not the town's real plan.
 */
const ARRANGEMENTS = ['around-green', 'along-lane', 'clustered'] as const;
type Arrangement = (typeof ARRANGEMENTS)[number];

/* ────────────────────────────────────────────────────────────────────────────
 * A mutable character canvas
 * ──────────────────────────────────────────────────────────────────────────── */

interface Canvas {
  cols: number;
  rows: number;
  cells: string[];
  /** True where the outer boundary band was painted — buildings and props may never sit here. */
  border: boolean[];
  blocks: (ch: string) => boolean;
}

function makeCanvas(dims: LayoutDims, fill: string, legend: readonly LegendEntry[]): Canvas {
  const blocking = new Set(legend.filter((e) => e.blocks).map((e) => e.char));
  return {
    cols: dims.cols,
    rows: dims.rows,
    cells: new Array<string>(dims.cols * dims.rows).fill(fill),
    border: new Array<boolean>(dims.cols * dims.rows).fill(false),
    blocks: (ch) => blocking.has(ch),
  };
}

const inb = (cv: Canvas, c: number, r: number): boolean => c >= 0 && r >= 0 && c < cv.cols && r < cv.rows;
const at = (cv: Canvas, c: number, r: number): string => cv.cells[r * cv.cols + c] ?? '#';
const put = (cv: Canvas, c: number, r: number, ch: string): void => {
  if (inb(cv, c, r)) cv.cells[r * cv.cols + c] = ch;
};
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/* ────────────────────────────────────────────────────────────────────────────
 * The passes
 * ──────────────────────────────────────────────────────────────────────────── */

/** A bounded random walk used as a thickness profile, so an edge reads as a shoreline, not a ruler. */
function edgeProfile(n: number, rng: Rng, min: number, max: number): number[] {
  const out = new Array<number>(n);
  let v = rng.int(min, max + 1);
  for (let i = 0; i < n; i += 1) {
    if (rng.chance(0.34)) v = clamp(v + (rng.chance(0.5) ? 1 : -1), min, max);
    out[i] = v;
  }
  return out;
}

/** This node's own band, drawn once. Never wider than `borderCapCells`, never thinner than one cell. */
function drawBand(rng: Rng): { min: number; max: number } {
  const min = rng.int(MAPGEN.borderMinLo, MAPGEN.borderMinHi + 1);
  const max = Math.min(MAPGEN.borderCapCells, min + rng.int(MAPGEN.borderExtraLo, MAPGEN.borderExtraHi + 1));
  return { min, max };
}

function paintBorder(cv: Canvas, rng: Rng, mass: string, band: { min: number; max: number }): void {
  const top = edgeProfile(cv.cols, rng, band.min, band.max);
  const bottom = edgeProfile(cv.cols, rng, band.min, band.max);
  const left = edgeProfile(cv.rows, rng, band.min, band.max);
  const right = edgeProfile(cv.rows, rng, band.min, band.max);
  const mark = (c: number, r: number): void => {
    put(cv, c, r, mass);
    if (inb(cv, c, r)) cv.border[r * cv.cols + c] = true;
  };
  for (let c = 0; c < cv.cols; c += 1) {
    for (let r = 0; r < (top[c] ?? band.min); r += 1) mark(c, r);
    for (let r = 0; r < (bottom[c] ?? band.min); r += 1) mark(c, cv.rows - 1 - r);
  }
  for (let r = 0; r < cv.rows; r += 1) {
    for (let c = 0; c < (left[r] ?? band.min); c += 1) mark(c, r);
    for (let c = 0; c < (right[r] ?? band.min); c += 1) mark(cv.cols - 1 - c, r);
  }
}

function paintBlobs(cv: Canvas, rng: Rng, mass: string, centre: { col: number; row: number }): void {
  const count = rng.int(MAPGEN.blobsMin, MAPGEN.blobsMax + 1);
  const keepOut = MAPGEN.centreRadius + MAPGEN.centreWobble + 2;
  const inset = MAPGEN.borderCapCells + 1;
  for (let b = 0; b < count; b += 1) {
    let sc = 0;
    let sr = 0;
    let tries = 0;
    do {
      sc = rng.int(inset, cv.cols - inset);
      sr = rng.int(inset, cv.rows - inset);
      tries += 1;
    } while (tries < 32 && Math.hypot(sc - centre.col, sr - centre.row) < keepOut);
    if (Math.hypot(sc - centre.col, sr - centre.row) < keepOut) continue;

    const want = rng.int(MAPGEN.blobCellsMin, MAPGEN.blobCellsMax + 1);
    const members: Array<[number, number]> = [[sc, sr]];
    put(cv, sc, sr, mass);
    // A blob boxed in by the boundary band, the centre keep-out or its own cells can never reach
    // `want`. The cap ends the growth rather than the process: a thicket that came out smaller than
    // it wanted is a fine thicket, and an unbounded accretion loop is a hang. (It was one.)
    let stalls = 0;
    while (members.length < want && stalls < want * 8) {
      stalls += 1;
      const from = members[rng.int(0, members.length)];
      if (!from) break;
      const dir = rng.int(0, 4);
      const nc = from[0] + (dir === 0 ? 1 : dir === 1 ? -1 : 0);
      const nr = from[1] + (dir === 2 ? 1 : dir === 3 ? -1 : 0);
      if (!inb(cv, nc, nr)) continue;
      if (cv.border[nr * cv.cols + nc] === true) continue;
      if (Math.hypot(nc - centre.col, nr - centre.row) < keepOut) continue;
      if (at(cv, nc, nr) === mass) continue;
      put(cv, nc, nr, mass);
      members.push([nc, nr]);
    }
  }
}

/**
 * The clearing at the map centre — a lobed blob, not a disc. Three harmonics of the polar angle,
 * with amplitudes and phases drawn from this node's stream, so no two clearings share an outline.
 * The centre cell itself is always inside, whatever the harmonics do, because that cell is where
 * `firstWalkableTile` begins.
 */
function carveClearing(cv: Canvas, rng: Rng, spawn: { col: number; row: number }, ch: string): void {
  const centre = {
    col: spawn.col + rng.int(-MAPGEN.centreOffsetCells, MAPGEN.centreOffsetCells + 1),
    row: spawn.row + rng.int(-MAPGEN.centreOffsetCells, MAPGEN.centreOffsetCells + 1),
  };
  const amp = [
    rng.range(-MAPGEN.centreWobble, MAPGEN.centreWobble),
    rng.range(-MAPGEN.centreWobble * 0.7, MAPGEN.centreWobble * 0.7),
    rng.range(-MAPGEN.centreWobble * 0.5, MAPGEN.centreWobble * 0.5),
  ];
  const phase = [rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2)];
  const reach = Math.ceil(MAPGEN.centreRadius + MAPGEN.centreWobble * 2.2);
  for (let r = centre.row - reach; r <= centre.row + reach; r += 1) {
    for (let c = centre.col - reach; c <= centre.col + reach; c += 1) {
      if (!inb(cv, c, r)) continue;
      const dx = c - centre.col;
      const dy = r - centre.row;
      const d = Math.hypot(dx, dy);
      const theta = Math.atan2(dy, dx);
      const edge =
        MAPGEN.centreRadius +
        (amp[0] ?? 0) * Math.sin(theta + (phase[0] ?? 0)) +
        (amp[1] ?? 0) * Math.sin(2 * theta + (phase[1] ?? 0)) +
        (amp[2] ?? 0) * Math.sin(3 * theta + (phase[2] ?? 0));
      if (d > Math.max(2, edge) + 0.5) continue;
      put(cv, c, r, ch);
    }
  }
  // The spawn cell is inside the clearing whatever the harmonics and the offset did — walked back
  // in a straight line so it is CONNECTED to the blob, not an island of clearing character.
  let c = centre.col;
  let r = centre.row;
  while (c !== spawn.col || r !== spawn.row) {
    if (c !== spawn.col) c += Math.sign(spawn.col - c);
    else r += Math.sign(spawn.row - r);
    put(cv, c, r, ch);
  }
}

/**
 * Walk one lane from the centre out to an edge row, one row per step, with a persistent lateral
 * drift that reverses now and then.
 *
 * MONOTONE IN ROW, ALWAYS. That is not a stylistic choice: a walk that could revisit a row would be
 * able to run along the edge row and open a corridor twenty cells wide, and `checkEdgeCorridors`
 * counts contiguous runs. Because the mouth column is wherever the walk ARRIVES rather than a target
 * it has to steer back to, there is never a horizontal closing segment at all.
 */
interface LaneStyle {
  width: number;
  lateral: number;
  flip: number;
}

function carveLane(cv: Canvas, rng: Rng, fromCol: number, fromRow: number, toRow: number, style: LaneStyle, ch: string): number {
  const width = style.width;
  const lo = MAPGEN.laneMarginCells;
  const hi = cv.cols - 1 - MAPGEN.laneMarginCells;
  const step = toRow > fromRow ? 1 : -1;
  const left = Math.floor((width - 1) / 2);
  const right = width - 1 - left;
  const paint = (c: number, r: number): void => {
    for (let x = c - left; x <= c + right; x += 1) put(cv, x, r, ch);
  };

  let col = clamp(fromCol, lo, hi);
  let drift = rng.chance(0.5) ? 1 : -1;
  for (let row = fromRow; ; row += step) {
    paint(col, row);
    if (row === toRow) return col;
    if (rng.chance(style.flip)) drift = -drift;
    if (rng.chance(style.lateral)) {
      const next = clamp(col + drift, lo, hi);
      if (next !== col) {
        col = next;
        paint(col, row);
      }
    }
  }
}

/**
 * A dead-end branch off the lane, cut toward a point the lane does not pass near.
 *
 * NEVER PAINTS A BOUNDARY CELL. A spur that reached the map edge would be a corridor the node's
 * `adjacency` does not declare, and `checkEdgeCorridors` counts corridors, not intentions. Guarding
 * the paint is cheaper and more honest than clamping the walk and hoping.
 */
function carveSpur(
  cv: Canvas,
  rng: Rng,
  from: readonly [number, number],
  to: readonly [number, number],
  ch: string,
): void {
  let c = from[0];
  let r = from[1];
  const paint = (x: number, y: number): void => {
    for (const [px, py] of [
      [x, y],
      [x + 1, y],
    ] as const) {
      if (!inb(cv, px, py)) continue;
      if (cv.border[py * cv.cols + px] === true) continue;
      put(cv, px, py, ch);
    }
  };
  paint(c, r);
  let guard = 0;
  while ((c !== to[0] || r !== to[1]) && guard < 4 * (cv.cols + cv.rows)) {
    guard += 1;
    const dc = Math.sign(to[0] - c);
    const dr = Math.sign(to[1] - r);
    if (dc !== 0 && (dr === 0 || rng.chance(0.5))) c += dc;
    else r += dr;
    paint(c, r);
  }
}

/** Cells reachable from the centre over walkable characters. Used to keep the map connected. */
function reachable(cv: Canvas, centre: { col: number; row: number }): Set<number> {
  const out = new Set<number>();
  if (cv.blocks(at(cv, centre.col, centre.row))) return out;
  const stack: Array<[number, number]> = [[centre.col, centre.row]];
  out.add(centre.row * cv.cols + centre.col);
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur) break;
    const [c, r] = cur;
    const nbrs: Array<[number, number]> = [
      [c + 1, r],
      [c - 1, r],
      [c, r + 1],
      [c, r - 1],
    ];
    for (const [nc, nr] of nbrs) {
      if (!inb(cv, nc, nr)) continue;
      const key = nr * cv.cols + nc;
      if (out.has(key)) continue;
      if (cv.blocks(at(cv, nc, nr))) continue;
      out.add(key);
      stack.push([nc, nr]);
    }
  }
  return out;
}

/**
 * Join a walkable cell to the main body if a thicket happened to close around it. A short spur, cut
 * to the nearest cell that IS connected. Cheaper and more honest than re-rolling the whole node:
 * the thickets that made the pocket stay where they are, and the map gains a path into it.
 */
function connectToMain(cv: Canvas, centre: { col: number; row: number }, col: number, row: number, ground: string): boolean {
  const main = reachable(cv, centre);
  if (main.has(row * cv.cols + col)) return false;
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (const key of main) {
    const c = key % cv.cols;
    const r = Math.floor(key / cv.cols);
    const d = Math.abs(c - col) + Math.abs(r - row);
    if (d < bestD) {
      bestD = d;
      best = [c, r];
    }
  }
  if (!best) return false;
  let [c, r] = [col, row];
  const [tc, tr] = best;
  while (c !== tc || r !== tr) {
    if (c !== tc) c += Math.sign(tc - c);
    else r += Math.sign(tr - r);
    // NEVER cut through the boundary band: a spur that reached the map edge would open an exit the
    // adjacency does not declare, and `checkEdgeCorridors` would (rightly) refuse the file. If the
    // spur cannot get through, the cell stays sealed and `verifyLayout` fails loudly at the end —
    // which is the correct outcome, and is not a thing that can happen quietly.
    if (cv.border[r * cv.cols + c] === true) continue;
    if (cv.blocks(at(cv, c, r))) put(cv, c, r, ground);
  }
  return true;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Buildings
 * ──────────────────────────────────────────────────────────────────────────── */

interface Footprint {
  col: number;
  row: number;
  w: number;
  h: number;
}

function canPlace(cv: Canvas, f: Footprint, placed: readonly Footprint[], reserved: ReadonlySet<number>): boolean {
  if (f.col < 1 || f.row < 1 || f.col + f.w > cv.cols - 1 || f.row + f.h > cv.rows - 1) return false;
  for (let r = f.row; r < f.row + f.h; r += 1) {
    for (let c = f.col; c < f.col + f.w; c += 1) {
      if (cv.border[r * cv.cols + c] === true) return false;
      if (reserved.has(r * cv.cols + c)) return false;
    }
  }
  // One clear cell between footprints, on at least one axis — the same rule checkFootprintClearance
  // applies to the finished file, applied here so a rejected candidate never reaches it.
  for (const p of placed) {
    const separated =
      f.col + f.w < p.col || p.col + p.w < f.col || f.row + f.h < p.row || p.row + p.h < f.row;
    if (!separated) return false;
  }
  return true;
}

/**
 * Where a settlement's Nth building wants to stand, by plan.
 *
 * The three plans are pulled APART on purpose. An earlier pass had all three sampling from
 * overlapping distributions, and at contact-sheet size they were indistinguishable — five red
 * squares, scattered, three times. A plan that cannot be recognised is not a plan.
 *
 *   around-green  a tight ring hugging the clearing, one building per fifth of the circle
 *   along-lane    a street: buildings evenly spaced down the lane, alternating sides, held close
 *   clustered     a tight yard well off the lane, everything within a few cells of one point
 */
function arrangedCandidate(
  rng: Rng,
  mode: Arrangement,
  centre: { col: number; row: number },
  lane: ReadonlyArray<[number, number]>,
  cluster: { col: number; row: number },
  index: number,
  w: number,
  h: number,
): Footprint {
  if (mode === 'around-green') {
    const angle = (index * 2 * Math.PI) / MAPGEN.buildingsPerSettlement + rng.range(-0.35, 0.35);
    const radius = rng.range(MAPGEN.centreRadius + 4, MAPGEN.centreRadius + 8);
    return {
      col: Math.round(centre.col + Math.cos(angle) * radius - w / 2),
      row: Math.round(centre.row + Math.sin(angle) * radius - h / 2),
      w,
      h,
    };
  }
  if (mode === 'along-lane' && lane.length > 0) {
    const down = [...lane].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const step = down.length / (MAPGEN.buildingsPerSettlement + 1);
    const pick = Math.min(down.length - 1, Math.round(step * (index + 1)) + rng.int(-2, 3));
    const anchor = down[Math.max(0, pick)] ?? [centre.col, centre.row];
    const side = index % 2 === 0 ? 1 : -1;
    const offset = rng.int(3, 6);
    return { col: anchor[0] + side * offset - (side < 0 ? w - 1 : 0), row: anchor[1] - Math.floor(h / 2), w, h };
  }
  return {
    col: cluster.col + rng.int(-7, 8) - Math.floor(w / 2),
    row: cluster.row + rng.int(-7, 8) - Math.floor(h / 2),
    w,
    h,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The seeder proper
 * ──────────────────────────────────────────────────────────────────────────── */

export interface SeedOutcome {
  doc: LayoutDoc;
  /** Decisions the seeder had to make that a reader must not discover by diffing. */
  notes: string[];
}

export function seedLayout(
  placement: NodePlacement,
  balance: Balance,
  legend: readonly LegendEntry[] = DEFAULT_LEGEND,
): SeedOutcome {
  const node: NodeFile = placement.node;
  const dims = layoutDims(balance);
  const rng = createRng(hashSeed(MAPGEN.seedBase, `mapgen:${node.id}`));
  const notes: string[] = [];

  const texture = BIOME_TEXTURE[node.biome];
  if (!texture) {
    notes.push(
      `biome "${node.biome}" has no texture row in tools/mapgen/seed.ts, so the ground is plain and ` +
        `the masses are the generic wall character. Add a row rather than hand-spelling this file.`,
    );
  }
  const { ground, mass } = texture ?? UNKNOWN_BIOME_TEXTURE;

  const centre = { col: Math.floor(dims.cols / 2), row: Math.floor(dims.rows / 2) };
  const cv = makeCanvas(dims, ground, legend);

  const band = drawBand(rng);
  paintBorder(cv, rng, mass, band);
  paintBlobs(cv, rng, mass, centre);
  carveClearing(cv, rng, centre, 'o');

  /* ── the lane, and the mouths the adjacency declares ─────────────────────
   * The chain (tools/mapgen/nodes.ts) fixes the convention: BOTTOM is back toward the first town,
   * TOP is onward toward the terminus. Each declared adjacency is exactly one mouth. */
  const laneStyle: LaneStyle = {
    width: rng.int(MAPGEN.laneWidthMin, MAPGEN.laneWidthMax + 1),
    lateral: rng.range(MAPGEN.laneLateralLo, MAPGEN.laneLateralHi),
    flip: rng.range(MAPGEN.laneDriftFlipLo, MAPGEN.laneDriftFlipHi),
  };
  const laneCells: Array<[number, number]> = [];
  const recordLane = (): void => {
    for (let r = 0; r < cv.rows; r += 1) {
      for (let c = 0; c < cv.cols; c += 1) if (at(cv, c, r) === ':') laneCells.push([c, r]);
    }
  };
  if (placement.onward !== null) {
    const mouth = carveLane(cv, rng, centre.col, centre.row, 0, laneStyle, ':');
    put(cv, mouth, 0, '^');
  }
  if (placement.back !== null) {
    const mouth = carveLane(cv, rng, centre.col, centre.row, cv.rows - 1, laneStyle, ':');
    put(cv, mouth, cv.rows - 1, '^');
  }
  recordLane();

  /* ── spurs to the props the lane misses ──────────────────────────────────
   * The one piece of track shape that comes from the node's own data. Seventeen prop positions are
   * scattered differently across the twelve nodes, so the branch pattern is different at every one
   * of them — which is the difference between a set of maps and a set of copies of one map. */
  for (const prop of node.props) {
    const pc = Math.floor(prop.x / dims.cellPx);
    const pr = Math.floor(prop.y / dims.cellPx);
    let nearest: [number, number] | null = null;
    let nearestD = Infinity;
    for (const [lc, lr] of laneCells) {
      const d = Math.hypot(lc - pc, lr - pr);
      if (d < nearestD) {
        nearestD = d;
        nearest = [lc, lr];
      }
    }
    if (nearest !== null && nearestD > MAPGEN.spurDistanceCells) {
      carveSpur(cv, rng, nearest, [pc, pr], ':');
      notes.push(`a spur was cut from the lane to prop "${prop.id}" at cell (${pc},${pr})`);
    }
  }
  laneCells.length = 0;
  recordLane();

  /* ── prop anchors ────────────────────────────────────────────────────────
   * A prop is a point on the painted map, not geometry (core/types.ts:135 — "interaction radius,
   * never baked into collision"), so its cell is FORCED walkable: any blocking character in the
   * 3×3 around it is cleared to ground, and the cell itself takes the anchor character. Floor
   * characters already there are left alone, so a prop standing on the lane keeps the lane. */
  const reserved = new Set<number>();
  for (const prop of node.props) {
    const col = Math.floor(prop.x / dims.cellPx);
    const row = Math.floor(prop.y / dims.cellPx);
    if (!inb(cv, col, row)) {
      throw new SeedError(
        `node "${node.id}": prop "${prop.id}" at native (${prop.x},${prop.y}) is cell (${col},${row}), ` +
          `outside the ${dims.cols}×${dims.rows} grid`,
      );
    }
    if (cv.border[row * cv.cols + col] === true) {
      throw new SeedError(
        `node "${node.id}": prop "${prop.id}" at native (${prop.x},${prop.y}) falls inside the boundary ` +
          `band at cell (${col},${row}). Clearing it would open a hole in the map edge; move the prop ` +
          `in data/nodes/ or thin the band.`,
      );
    }
    for (let r = row - 1; r <= row + 1; r += 1) {
      for (let c = col - 1; c <= col + 1; c += 1) {
        if (!inb(cv, c, r)) continue;
        if (cv.border[r * cv.cols + c] === true) continue;
        if (cv.blocks(at(cv, c, r))) put(cv, c, r, ground);
      }
    }
    const under = at(cv, col, row);
    if (under !== ground && under !== '.' && under !== ',') {
      notes.push(`prop "${prop.id}" sits on a ${under === 'o' ? 'centre-clearing' : under === ':' ? 'path-corridor' : under} cell at (${col},${row}); the anchor character takes the cell and the cell stays walkable`);
    }
    put(cv, col, row, '*');
    for (let r = row - 1; r <= row + 1; r += 1) {
      for (let c = col - 1; c <= col + 1; c += 1) if (inb(cv, c, r)) reserved.add(r * cv.cols + c);
    }
    if (connectToMain(cv, centre, col, row, ground)) {
      notes.push(`prop "${prop.id}" at (${col},${row}) had closed in behind a thicket; a spur was cut to it`);
    }
  }
  for (const key of reachableKeys(cv, centre, ':')) reserved.add(key);
  for (const key of reachableKeys(cv, centre, 'o')) reserved.add(key);
  for (const key of reachableKeys(cv, centre, '^')) reserved.add(key);

  /* ── buildings, settlements only ─────────────────────────────────────── */
  const placed: Footprint[] = [];
  if (placement.settlement) {
    const mode: Arrangement = ARRANGEMENTS[rng.int(0, ARRANGEMENTS.length)] ?? 'clustered';
    notes.push(`arrangement: ${mode} — a first composition drawn from this node's own stream, not a plan`);
    const cluster = {
      col: centre.col + (rng.chance(0.5) ? 1 : -1) * rng.int(8, 17),
      row: centre.row + (rng.chance(0.5) ? 1 : -1) * rng.int(8, 17),
    };
    for (let i = 0; i < MAPGEN.buildingsPerSettlement; i += 1) {
      const w = rng.int(MAPGEN.buildingCellsMin, MAPGEN.buildingCellsMax + 1);
      const h = rng.int(MAPGEN.buildingCellsMin, MAPGEN.buildingCellsMax + 1);
      let chosen: Footprint | null = null;
      for (let a = 0; a < MAPGEN.arrangedAttempts && chosen === null; a += 1) {
        const cand = arrangedCandidate(rng, mode, centre, laneCells, cluster, i, w, h);
        if (canPlace(cv, cand, placed, reserved) && keepsConnected(cv, centre, cand)) chosen = cand;
      }
      for (let a = 0; a < MAPGEN.uniformAttempts && chosen === null; a += 1) {
        const cand: Footprint = {
          col: rng.int(band.max + 1, cv.cols - band.max - 1 - w),
          row: rng.int(band.max + 1, cv.rows - band.max - 1 - h),
          w,
          h,
        };
        if (canPlace(cv, cand, placed, reserved) && keepsConnected(cv, centre, cand)) chosen = cand;
      }
      if (chosen === null) {
        throw new SeedError(
          `node "${node.id}": could not place building ${i + 1} of ${MAPGEN.buildingsPerSettlement} ` +
            `(${w}×${h} cells) without covering the lane, the centre, a prop or another building. ` +
            `The seeder does not ship a settlement with fewer buildings than it set out to place.`,
        );
      }
      for (let r = chosen.row; r < chosen.row + chosen.h; r += 1) {
        for (let c = chosen.col; c < chosen.col + chosen.w; c += 1) put(cv, c, r, 'B');
      }
      placed.push(chosen);
      placeDoor(cv, centre, chosen, ground);
    }
  }

  /* ── the spawn marker, and the one cell where two claims meet ────────────
   *
   * THE SANCTUM COLLISION, decided here and nowhere else.
   *
   * `data/nodes/sanctum.json` puts `sanctum-antler-ring` at native (512,512) — the exact centre, and
   * therefore the exact cell `firstWalkableTile` starts its ring search on. "Open region at the
   * centre" and "a marker at each prop" want the same cell.
   *
   * The resolution is that they are not actually competing for the same thing. What the spawn needs
   * is that the cell be WALKABLE; `chooseSpawnTile` searches the grid and never reads a character.
   * The `@` is documentary — it tells a human editing the file where the player will appear. Every
   * anchor character is walkable by construction (tools/mapgen/legend.ts refuses one that is not),
   * so a prop anchor on the centre cell satisfies the spawn's requirement completely.
   *
   * So: the PROP ANCHOR KEEPS THE CELL, `@` is not written, and the coincidence is recorded in the
   * file header — never silently. `checkSpawn` then proves it through the real engine functions.
   */
  if (at(cv, centre.col, centre.row) === '*') {
    notes.push(
      `the spawn cell (${centre.col},${centre.row}) — native (${centre.col * dims.cellPx},${centre.row * dims.cellPx}) — ` +
        `is also an authored prop position, so the prop-anchor character keeps it and no spawn-anchor ` +
        `is written. The cell is walkable, which is all chooseSpawnTile requires.`,
    );
  } else if (cv.blocks(at(cv, centre.col, centre.row))) {
    throw new SeedError(`node "${node.id}": the centre cell (${centre.col},${centre.row}) came out blocked`);
  } else {
    put(cv, centre.col, centre.row, '@');
  }

  const header = headerFor(placement, dims, notes, legend).map((l) => (l.length === 0 ? '#' : `# ${l}`));
  const doc = parseLayout(node.id, [...header, '---', ...toBody(cv), ''].join('\n'), balance, legend);
  const problems = verifyLayout({
    doc,
    node,
    balance,
    back: placement.back,
    onward: placement.onward,
    settlement: placement.settlement,
  });
  if (problems.length > 0) {
    throw new SeedError(
      `the seeder produced an out-of-contract layout for "${node.id}" and refuses to write it:\n  · ` +
        problems.join('\n  · '),
    );
  }
  return { doc, notes };
}

/** Cells of one character that the centre can reach — used to reserve the lane against buildings. */
function reachableKeys(cv: Canvas, centre: { col: number; row: number }, ch: string): Set<number> {
  const out = new Set<number>();
  const main = reachable(cv, centre);
  for (const key of main) {
    const c = key % cv.cols;
    const r = Math.floor(key / cv.cols);
    if (at(cv, c, r) === ch) out.add(key);
  }
  return out;
}

/** Would this footprint cut the map in two? Asked BEFORE the footprint is painted. */
function keepsConnected(cv: Canvas, centre: { col: number; row: number }, f: Footprint): boolean {
  const before = new Map<number, string>();
  for (let r = f.row; r < f.row + f.h; r += 1) {
    for (let c = f.col; c < f.col + f.w; c += 1) {
      before.set(r * cv.cols + c, at(cv, c, r));
      put(cv, c, r, 'B');
    }
  }
  const anchorsAndMouths: Array<[number, number]> = [];
  for (let r = 0; r < cv.rows; r += 1) {
    for (let c = 0; c < cv.cols; c += 1) {
      const ch = at(cv, c, r);
      if (ch === '*' || ch === '^' || ch === 'D') anchorsAndMouths.push([c, r]);
    }
  }
  const main = reachable(cv, centre);
  const ok = anchorsAndMouths.every(([c, r]) => main.has(r * cv.cols + c));
  for (const [key, ch] of before) put(cv, key % cv.cols, Math.floor(key / cv.cols), ch);
  return ok;
}

/** One walkable cell against the side of a building that faces the middle of the map. */
function placeDoor(cv: Canvas, centre: { col: number; row: number }, f: Footprint, ground: string): void {
  const midCol = f.col + Math.floor(f.w / 2);
  const midRow = f.row + Math.floor(f.h / 2);
  const sides: Array<[number, number]> = [
    [midCol, f.row - 1],
    [midCol, f.row + f.h],
    [f.col - 1, midRow],
    [f.col + f.w, midRow],
  ];
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (const [c, r] of sides) {
    if (!inb(cv, c, r)) continue;
    if (cv.border[r * cv.cols + c] === true) continue;
    const ch = at(cv, c, r);
    if (ch === '*' || ch === '@' || ch === '^' || ch === 'B' || ch === 'D') continue;
    const d = Math.hypot(c - centre.col, r - centre.row);
    if (d < bestD) {
      bestD = d;
      best = [c, r];
    }
  }
  if (!best) return;
  const [dc, dr] = best;
  if (cv.blocks(at(cv, dc, dr))) put(cv, dc, dr, ground);
  put(cv, dc, dr, 'D');
  connectToMain(cv, centre, dc, dr, ground);
}

function toBody(cv: Canvas): string[] {
  const out: string[] = [];
  for (let r = 0; r < cv.rows; r += 1) {
    let line = '';
    for (let c = 0; c < cv.cols; c += 1) line += at(cv, c, r);
    out.push(line);
  }
  return out;
}

/** The header. It declares the coordinate space, cites what it was seeded from, and says what it isn't. */
function headerFor(
  placement: NodePlacement,
  dims: LayoutDims,
  notes: readonly string[],
  legend: readonly LegendEntry[],
): string[] {
  const n = placement.node;
  const half = dims.cellPx / 2;
  const lines: string[] = [
    `SEEDED STARTING LAYOUT for "${n.id}" — NOT A FINISHED MAP. Edit it by hand.`,
    '',
    'Written by tools/mapgen/seed.ts. It knows four things about this node: which edges its',
    'adjacency declares, where its props stand, what biome it is, and whether it is a settlement.',
    'It does not know what this place looks like. Re-running the seeder OVERWRITES hand edits',
    'unless --force is withheld; the renderers read this file, not the seeder.',
    '',
    '── coordinate space ─────────────────────────────────────────────────────────',
    `space        map-native pixels, origin TOP-LEFT (data/nodes/*.json props[].x/y are in this space)`,
    `grid         ${dims.cols} cols × ${dims.rows} rows, one character per collision cell`,
    `cell         ${dims.cellPx} native px  (balance.map.collisionCellPx; ${dims.nativePx}/${dims.cols} = ${dims.nativePx / dims.cols})`,
    `map          ${dims.nativePx} × ${dims.nativePx} native px, rendered ×${dims.worldCellPx / dims.cellPx} → ${dims.nativePx * (dims.worldCellPx / dims.cellPx)} world px`,
    `tiles        ${dims.tileCols} × ${dims.tileRows} movement tiles of ${dims.worldCellPx} world px`,
    `col ← x      col = floor(nativeX / ${dims.cellPx});  a cell's centre is native (${dims.cellPx}·col + ${half}, ${dims.cellPx}·row + ${half})`,
    `centre       native (${dims.nativePx / 2}, ${dims.nativePx / 2}) = cell (${Math.floor(dims.cols / 2)}, ${Math.floor(dims.rows / 2)}) = the tile firstWalkableTile starts on`,
    '',
    '── seeded from ──────────────────────────────────────────────────────────────',
    `biome        ${n.biome}`,
    `adjacency    ${n.adjacency.join(', ') || '(none)'}`,
    `bottom edge  ${placement.back ?? '— sealed; this is the head of the chain'}`,
    `top edge     ${placement.onward ?? '— sealed; this is the terminus'}`,
    `settlement   ${placement.settlement ? 'yes — building footprints are placed' : 'no — zero building footprints'}`,
    `props        ${n.props.length === 0 ? '(none)' : n.props.map((p) => `${p.id} @ (${p.x},${p.y}) → cell (${Math.floor(p.x / dims.cellPx)},${Math.floor(p.y / dims.cellPx)})`).join('; ')}`,
  ];
  if (notes.length > 0) {
    lines.push('', '── decisions this file made ─────────────────────────────────────────────────');
    for (const note of notes) lines.push(`· ${note}`);
  }
  lines.push('', '── legend (tools/mapgen/legend.ts) ──────────────────────────────────────────');
  lines.push(...legendHeaderLines(legend));
  lines.push(
    '',
    `Only "#"-class characters block. tools/mapgen/layout.ts normalises every WALL character to "#"`,
    `before game/collision.ts gridFromAscii sees it; ANCH characters parse as floor and are read again`,
    `on a second pass. Region kinds are open strings — add a row to the legend, not a case to a switch.`,
  );
  return lines;
}
