/**
 * tests/unit/mapgen.test.ts — the layout artefacts, driven through the real generator and the real
 * engine.
 *
 * WHAT THE GREEN IS EVIDENCE OF, stated up front so nobody has to infer it:
 *
 *   · The twelve `.txt` files ON DISK are read and checked. Not a fixture, not a copy the test
 *     builds — the artefacts a human is expected to hand-edit. A bad hand edit turns this red.
 *   · The spawn is proved through `chooseSpawnTile` / `firstWalkableTile` IMPORTED FROM
 *     `game/collision.ts`, over the grid `gridFromAscii` builds from those files. Nothing here
 *     reimplements the ring search, so if the engine changes where the player lands, the layouts
 *     are re-judged rather than quietly diverging.
 *   · The mask is produced by `maskRasterFrom` — the engine's own encoder — and judged by
 *     `readMask` with NO options, which is what ships (`OverworldScene.buildNodeView` calls
 *     `loadCollision(...)` with none, so `sampleMask` falls to `dark-blocks` / `majority`).
 *   · The last describe block is a SABOTAGE CONTROL. Every check above is fed a deliberately broken
 *     layout and asserted to FAIL. A gate that cannot be shown to fail is decoration, and the
 *     checks in `tools/mapgen/verify.ts` are the same functions the seeder refuses to write past —
 *     so if they could not fail, the seeder's refusal would be theatre too.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { validateContent } from '../../core/schemas';
import type { Balance, Content, NodeFile } from '../../core/types';
import {
  chooseSpawnTile,
  emptyGrid,
  firstWalkableTile,
  gridDimensions,
  isBlocked,
  maskRasterFrom,
  readMask,
  setBlocked,
  tileGridSize,
  tileWalkable,
} from '../../game/collision';

import {
  anchorsOf,
  collisionGridOf,
  layoutDims,
  parseLayout,
  serialiseLayout,
  type LayoutDoc,
} from '../../tools/mapgen/layout';
import { placements, buildChain, type NodePlacement } from '../../tools/mapgen/nodes';
import { controlRasterOf, maskRasterOf, writeMask } from '../../tools/mapgen/render';
import { MAPGEN, seedLayout } from '../../tools/mapgen/seed';
import { layoutPath } from '../../tools/mapgen/paths';
import {
  FOOTPRINT_MAX_NATIVE_PX,
  FOOTPRINT_MIN_NATIVE_PX,
  checkEdgeCorridors,
  checkFootprintBand,
  checkFootprintClearance,
  checkMaskRoundTrip,
  checkPropAnchors,
  checkReachability,
  checkSettlementOnly,
  checkSpawn,
  edgeCorridors,
  footprintsOf,
  verifyLayout,
  KIND_BUILDING,
} from '../../tools/mapgen/verify';

/* ────────────────────────────────────────────────────────────────────────────
 * Fixtures — loaded once. Twelve 1024² mask round trips is real work.
 * ──────────────────────────────────────────────────────────────────────────── */

let content: Content;
let balance: Balance;
let all: Array<{ placement: NodePlacement; node: NodeFile; doc: LayoutDoc }>;

beforeAll(() => {
  content = validateContent();
  balance = content.balance;
  all = placements(content).map((placement) => ({
    placement,
    node: placement.node,
    doc: parseLayout(placement.node.id, readFileSync(layoutPath(placement.node.id), 'utf8'), balance),
  }));
});

/**
 * Byte equality for the big rasters. `expect(Array.from(a)).toEqual(Array.from(b))` on two 4 MB
 * buffers is correct and takes twenty seconds; this takes none, and on a mismatch it reports the
 * first differing index, which is more use than a four-million-element diff.
 */
function sameBytes(a: Uint8ClampedArray, b: Uint8ClampedArray): true | string {
  if (a.length !== b.length) return `lengths differ: ${a.length} vs ${b.length}`;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return `first difference at byte ${i}: ${String(a[i])} vs ${String(b[i])}`;
  }
  return true;
}

/** A copy of a doc with one rectangle overpainted. Used only to build broken layouts. */
function withRect(doc: LayoutDoc, ch: string, col: number, row: number, w: number, h: number): LayoutDoc {
  const body = doc.body.map((line, r) => {
    if (r < row || r >= row + h) return line;
    const chars = Array.from(line);
    for (let c = col; c < col + w && c < chars.length; c += 1) chars[c] = ch;
    return chars.join('');
  });
  return { ...doc, body };
}

function withCell(doc: LayoutDoc, ch: string, col: number, row: number): LayoutDoc {
  return withRect(doc, ch, col, row, 1, 1);
}

/** Every cell of one character, so a broken layout can be built on clear ground. */
function cellsWithout(doc: LayoutDoc, chars: readonly string[]): LayoutDoc {
  const drop = new Set(chars);
  return { ...doc, body: doc.body.map((line) => Array.from(line, (c) => (drop.has(c) ? '.' : c)).join('')) };
}

/* ════════════════════════════════════════════════════════════════════════════
 * 0. The coordinate space, from balance.map and nothing else
 * ════════════════════════════════════════════════════════════════════════════ */

describe('the layout grid is derived from balance.map, not assumed', () => {
  it('is collisionCols × collisionRows, and that tiles mapNativePx exactly', () => {
    const dims = layoutDims(balance);
    expect(dims.cols).toBe(balance.map.collisionCols);
    expect(dims.rows).toBe(balance.map.collisionRows);
    expect(dims.cols * dims.cellPx).toBe(balance.map.mapNativePx);
    expect(dims.rows * dims.cellPx).toBe(balance.map.mapNativePx);
    // The engine derives cellPx the other way round; the two derivations must agree or a layout
    // authored at one would sample at the other.
    expect(gridDimensions(balance).cellPx).toBe(dims.cellPx);
  });

  it('every shipped layout body is exactly that many rows of that many characters', () => {
    const dims = layoutDims(balance);
    for (const { doc, node } of all) {
      expect(doc.body.length, node.id).toBe(dims.rows);
      for (const [i, line] of doc.body.entries()) expect(line.length, `${node.id} row ${i}`).toBe(dims.cols);
    }
  });

  it('parses and re-serialises to the bytes on disk — the file IS the artefact', () => {
    for (const { doc, node } of all) {
      expect(serialiseLayout(doc), node.id).toBe(readFileSync(layoutPath(node.id), 'utf8'));
    }
  });

  it('covers all twelve nodes, in chain order, one layout each', () => {
    expect(all).toHaveLength(content.nodes.length);
    expect(all.map((a) => a.node.id)).toEqual(buildChain(content).map((n) => n.id));
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 1. Edge corridors
 * ════════════════════════════════════════════════════════════════════════════ */

describe('1 — edge corridors match the declared adjacency, on the declared edges', () => {
  it('has exactly adjacency.length edge-touching corridors at every node', () => {
    for (const { doc, node } of all) {
      expect(edgeCorridors(doc).length, node.id).toBe(node.adjacency.length);
    }
  });

  it('puts them on top (onward) and bottom (back), never left or right', () => {
    for (const { doc, node, placement } of all) {
      const found = edgeCorridors(doc);
      expect(found.filter((c) => c.edge === 'left'), node.id).toHaveLength(0);
      expect(found.filter((c) => c.edge === 'right'), node.id).toHaveLength(0);
      expect(found.filter((c) => c.edge === 'top').length, `${node.id} top`).toBe(placement.onward === null ? 0 : 1);
      expect(found.filter((c) => c.edge === 'bottom').length, `${node.id} bottom`).toBe(placement.back === null ? 0 : 1);
      expect(checkEdgeCorridors(doc, node, placement), node.id).toEqual([]);
    }
  });

  it('seals both ends of the chain on the edge that leads nowhere', () => {
    const chain = buildChain(content);
    const head = all[0];
    const tail = all[all.length - 1];
    expect(head?.node.id).toBe(chain[0]?.id);
    expect(tail?.node.id).toBe(chain[chain.length - 1]?.id);
    // Hearthollow is the head: one adjacency, on TOP. The Sanctum is the terminus: one, on BOTTOM.
    expect(head && edgeCorridors(head.doc).map((c) => c.edge)).toEqual(['top']);
    expect(tail && edgeCorridors(tail.doc).map((c) => c.edge)).toEqual(['bottom']);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2. The spawn, through the real engine functions
 * ════════════════════════════════════════════════════════════════════════════ */

describe('2 — the spawn resolves to walkable ground', () => {
  it('the search lattice really is centre-origin at map scale', () => {
    const tiles = tileGridSize(balance);
    const midCol = Math.floor(tiles.cols / 2);
    const midRow = Math.floor(tiles.rows / 2);
    // 2048 world px / 32 px per tile = 64 tiles, so the middle tile is 32.
    expect(tiles.cols).toBe((balance.map.mapNativePx * balance.map.mapRenderScale) / balance.map.tileStepPx);
    expect(tiles.rows).toBe(tiles.cols);
    // Tile 32 starts at world 1024, which at ×2 render scale is native 512 — the map's centre.
    expect((midCol * balance.map.tileStepPx) / balance.map.mapRenderScale).toBe(balance.map.mapNativePx / 2);
    expect((midRow * balance.map.tileStepPx) / balance.map.mapRenderScale).toBe(balance.map.mapNativePx / 2);

    // Proved by construction, not by arithmetic alone: a grid where ONLY the centre cell is walkable
    // must hand back exactly that tile. If the ring search began anywhere else it would return null.
    const dims = gridDimensions(balance);
    const grid = emptyGrid('lattice-probe', dims);
    for (let r = 0; r < dims.rows; r += 1) for (let c = 0; c < dims.cols; c += 1) setBlocked(grid, c, r, true);
    setBlocked(grid, midCol, midRow, false);
    expect(firstWalkableTile(grid, balance)).toEqual({ col: midCol, row: midRow });
  });

  it('chooseSpawnTile reports no problem and lands on a walkable tile at every node', () => {
    for (const { doc, node } of all) {
      const grid = collisionGridOf(doc);
      const choice = chooseSpawnTile(grid, balance);
      expect(choice.problem, node.id).toBeNull();
      expect(tileWalkable(grid, choice.tile.col, choice.tile.row, balance), node.id).toBe(true);
      expect(checkSpawn(doc, balance), node.id).toEqual([]);
    }
  });

  it('the Sanctum spawns on ground even though its prop occupies the exact centre cell', () => {
    // data/nodes/sanctum.json puts `sanctum-antler-ring` at native (512,512) — the spawn cell.
    // The decision (tools/mapgen/seed.ts) is that the prop anchor keeps the character and the cell
    // stays walkable, because an anchor is walkable by construction and chooseSpawnTile reads the
    // grid, never a character. This asserts the outcome, not the intent.
    const sanctum = all.find((a) => a.node.id === 'sanctum');
    expect(sanctum).toBeDefined();
    if (!sanctum) return;
    const prop = sanctum.node.props.find((p) => p.x === 512 && p.y === 512);
    expect(prop, 'the collision this test exists for has moved — re-read data/nodes/sanctum.json').toBeDefined();

    const dims = layoutDims(balance);
    const col = Math.floor(512 / dims.cellPx);
    const row = Math.floor(512 / dims.cellPx);
    const grid = collisionGridOf(sanctum.doc);
    expect(isBlocked(grid, col, row)).toBe(false);
    expect(chooseSpawnTile(grid, balance)).toEqual({ tile: { col, row }, problem: null });

    // And it is the PROP anchor standing there, not a spawn anchor that overwrote it.
    const anchors = anchorsOf(sanctum.doc).filter((a) => a.col === col && a.row === row);
    expect(anchors.map((a) => a.kind)).toEqual(['prop-anchor']);
    expect(anchorsOf(sanctum.doc).some((a) => a.kind === 'spawn-anchor')).toBe(false);
    expect(sanctum.doc.header.join('\n')).toContain('is also an authored prop position');
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3. Prop anchors
 * ════════════════════════════════════════════════════════════════════════════ */

describe('3 — every authored prop has an anchor on it', () => {
  it('within half a cell on each axis, which is exactly the quantisation error', () => {
    let checked = 0;
    for (const { doc, node } of all) {
      expect(checkPropAnchors(doc, node), node.id).toEqual([]);
      const anchors = anchorsOf(doc).filter((a) => a.kind === 'prop-anchor');
      expect(anchors.length, node.id).toBe(node.props.length);
      for (const p of node.props) {
        const hit = anchors.find((a) => a.col === Math.floor(p.x / doc.dims.cellPx) && a.row === Math.floor(p.y / doc.dims.cellPx));
        expect(hit, `${node.id} / ${p.id}`).toBeDefined();
        if (hit) {
          expect(Math.abs(hit.centreX - p.x)).toBeLessThanOrEqual(doc.dims.cellPx / 2);
          expect(Math.abs(hit.centreY - p.y)).toBeLessThanOrEqual(doc.dims.cellPx / 2);
        }
        checked += 1;
      }
    }
    // The corpus is seventeen props across twelve nodes; if that changes, this number should be
    // updated deliberately rather than the loop quietly checking fewer things.
    expect(checked).toBe(content.nodes.reduce((n, x) => n + x.props.length, 0));
    expect(checked).toBe(17);
  });

  it('and every anchor is on ground the player can actually reach', () => {
    for (const { doc, node } of all) {
      expect(checkReachability(doc, balance), node.id).toEqual([]);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 4, 5, 6. Building footprints
 * ════════════════════════════════════════════════════════════════════════════ */

describe('4 — every footprint is in the 85–140 native-px band on BOTH axes', () => {
  it('width and height alike', () => {
    let seen = 0;
    for (const { doc, node } of all) {
      for (const f of footprintsOf(doc)) {
        expect(f.nativeW, `${node.id} width`).toBeGreaterThanOrEqual(FOOTPRINT_MIN_NATIVE_PX);
        expect(f.nativeW, `${node.id} width`).toBeLessThanOrEqual(FOOTPRINT_MAX_NATIVE_PX);
        expect(f.nativeH, `${node.id} height`).toBeGreaterThanOrEqual(FOOTPRINT_MIN_NATIVE_PX);
        expect(f.nativeH, `${node.id} height`).toBeLessThanOrEqual(FOOTPRINT_MAX_NATIVE_PX);
        expect(f.rectangular, `${node.id} rectangular`).toBe(true);
        seen += 1;
      }
      expect(checkFootprintBand(doc), node.id).toEqual([]);
    }
    const settlements = all.filter((a) => a.placement.settlement).length;
    expect(seen).toBe(settlements * MAPGEN.buildingsPerSettlement);
    expect(seen).toBeGreaterThan(0);
  });
});

describe('5 — no footprint overlaps another, the corridor, or the centre region', () => {
  it('at any node', () => {
    for (const { doc, node } of all) {
      expect(checkFootprintClearance(doc), node.id).toEqual([]);
    }
  });
});

describe('6 — routes and the Sanctum emit zero building footprints', () => {
  it('only the five leader towns below the terminus carry buildings', () => {
    const withBuildings = all.filter((a) => footprintsOf(a.doc).length > 0).map((a) => a.node.id);
    const settlements = all.filter((a) => a.placement.settlement).map((a) => a.node.id);
    expect(withBuildings.sort()).toEqual(settlements.sort());
    expect(withBuildings).not.toContain('sanctum');
    expect(withBuildings).not.toContain('sanctum-approach');
    for (const id of ['r1', 'r2', 'r3', 'r4', 'r5']) expect(withBuildings).not.toContain(id);
    for (const { doc, placement, node } of all) {
      expect(checkSettlementOnly(doc, placement.settlement), node.id).toEqual([]);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 7. The mask round trip
 * ════════════════════════════════════════════════════════════════════════════ */

describe('7 — ASCII → grid → maskRasterFrom → readMask round-trips exactly', () => {
  it('readMask calls every one of the twelve usable, with no problems at all', () => {
    for (const { doc, node } of all) {
      const grid = collisionGridOf(doc);
      const reading = readMask(node.id, maskRasterFrom(grid, balance), balance);
      expect(reading.health.problems, node.id).toEqual([]);
      expect(reading.health.usable, node.id).toBe(true);
      expect(reading.health.transparentPixels, node.id).toBe(0);
      expect(reading.health.totalPixels, node.id).toBe(balance.map.mapNativePx ** 2);
      expect(checkMaskRoundTrip(doc, balance), node.id).toEqual([]);
    }
  });

  it('re-reading reproduces the same grid, cell for cell and bit for bit', () => {
    for (const { doc, node } of all) {
      const grid = collisionGridOf(doc);
      const back = readMask(node.id, maskRasterFrom(grid, balance), balance).grid;
      expect(back.cols, node.id).toBe(grid.cols);
      expect(back.rows, node.id).toBe(grid.rows);
      expect(Array.from(back.bits), node.id).toEqual(Array.from(grid.bits));
    }
  });

  it('survives a real PNG on disk, not just the in-memory buffer', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'trophic-mapgen-'));
    try {
      const first = all[0];
      expect(first).toBeDefined();
      if (!first) return;
      const path = join(dir, 'mask.png');
      await writeMask(path, first.doc, balance);
      const { readMaskPixelsFromDisk } = await import('../../tools/mapgen/render');
      const pixels = await readMaskPixelsFromDisk(path);
      const reading = readMask(first.node.id, pixels, balance);
      expect(reading.health.problems).toEqual([]);
      expect(reading.health.usable).toBe(true);
      expect(Array.from(reading.grid.bits)).toEqual(Array.from(collisionGridOf(first.doc).bits));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 8. Determinism
 * ════════════════════════════════════════════════════════════════════════════ */

describe('8 — running it twice yields byte-identical output', () => {
  it('the seeder writes the same text both times, for all twelve', () => {
    for (const { placement, node } of all) {
      const a = seedLayout(placement, balance);
      const b = seedLayout(placement, balance);
      expect(serialiseLayout(b.doc), node.id).toBe(serialiseLayout(a.doc));
      expect(b.notes, node.id).toEqual(a.notes);
    }
  });

  it('the renderers produce the same bytes both times, for all twelve', () => {
    for (const { doc, node } of all) {
      const m1 = maskRasterOf(doc, balance);
      const m2 = maskRasterOf(doc, balance);
      expect(m1.width, `${node.id} mask width`).toBe(balance.map.mapNativePx);
      expect(m1.data.length, `${node.id} mask length`).toBe(balance.map.mapNativePx ** 2 * 4);
      expect(sameBytes(m1.data, m2.data), `${node.id} mask`).toBe(true);

      const c1 = controlRasterOf(doc, balance);
      const c2 = controlRasterOf(doc, balance);
      expect(c1.width, node.id).toBe(balance.map.mapNativePx);
      expect(sameBytes(c1.data, c2.data), `${node.id} control`).toBe(true);
    }
  });

  it('every mask pixel is opaque and is exactly 0 or 255 on every colour channel', () => {
    // The contract `readMask` enforces, asserted on the bytes rather than inferred from its verdict:
    // alpha 255 everywhere (a single transparent pixel makes the file unusable), and a true 1-bit
    // mask so that `majority` and `any` sampling cannot disagree about a cell.
    for (const { doc, node } of all) {
      const data = maskRasterOf(doc, balance).data;
      for (let i = 0; i < data.length; i += 4) {
        const ink = data[i];
        if (ink !== 0 && ink !== 255) throw new Error(`${node.id}: byte ${i} is ${String(ink)}, not 0 or 255`);
        if (data[i + 1] !== ink || data[i + 2] !== ink) throw new Error(`${node.id}: pixel ${i / 4} is not greyscale`);
        if (data[i + 3] !== 255) throw new Error(`${node.id}: pixel ${i / 4} has alpha ${String(data[i + 3])}`);
      }
      expect(true, node.id).toBe(true);
    }
  });

  it('two runs of the seeder produce the same PNG file, byte for byte', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'trophic-mapgen-det-'));
    try {
      const one = all[0];
      expect(one).toBeDefined();
      if (!one) return;
      const a = join(dir, 'a.png');
      const b = join(dir, 'b.png');
      await writeMask(a, seedLayout(one.placement, balance).doc, balance);
      await writeMask(b, seedLayout(one.placement, balance).doc, balance);
      expect(readFileSync(b).equals(readFileSync(a))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 9. THE SABOTAGE CONTROL
 *
 * Each check above is fed a deliberately broken layout and must FAIL. Where a check passes on the
 * real artefact and fails on the sabotage, the green above is evidence of something. Where it would
 * pass on both, it is decoration — and this repo has shipped several of those.
 * ════════════════════════════════════════════════════════════════════════════ */

describe('9 — sabotage: every check is shown to be capable of failing', () => {
  let base: { placement: NodePlacement; node: NodeFile; doc: LayoutDoc };
  let route: { placement: NodePlacement; node: NodeFile; doc: LayoutDoc };

  beforeAll(() => {
    const town = all.find((a) => a.placement.settlement);
    const r = all.find((a) => !a.placement.settlement && a.node.adjacency.length === 2);
    expect(town).toBeDefined();
    expect(r).toBeDefined();
    if (!town || !r) throw new Error('the corpus no longer has a settlement and a two-ended route');
    base = town;
    route = r;
  });

  it('THREE adjacencies against a two-mouth layout — checkEdgeCorridors fails', () => {
    const honest: NodeFile = route.node;
    expect(checkEdgeCorridors(route.doc, honest, route.placement)).toEqual([]);

    const lying: NodeFile = { ...honest, adjacency: [...honest.adjacency, 'hearthollow'] };
    const problems = checkEdgeCorridors(route.doc, lying, route.placement);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toContain('adjacency declares 3');
  });

  it('a hole punched in the LEFT edge — checkEdgeCorridors fails', () => {
    const holed = withRect(route.doc, '.', 0, 30, 1, 3);
    const problems = checkEdgeCorridors(holed, route.node, route.placement);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toContain('left edge is open');
    expect(edgeCorridors(holed).some((c) => c.edge === 'left')).toBe(true);
  });

  it('a prop at (0,0) with no anchor there — checkPropAnchors fails', () => {
    const honest = route.node;
    expect(checkPropAnchors(route.doc, honest)).toEqual([]);

    const moved: NodeFile = {
      ...honest,
      props: honest.props.map((p, i) => (i === 0 ? { ...p, x: 0, y: 0 } : p)),
    };
    const problems = checkPropAnchors(route.doc, moved);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toContain('native (0,0)');
  });

  it('a 300-native-px footprint — checkFootprintBand fails on BOTH axes', () => {
    expect(checkFootprintBand(base.doc)).toEqual([]);
    const cells = Math.ceil(300 / base.doc.dims.cellPx); // 19 cells = 304 native px
    const clear = cellsWithout(base.doc, ['B']);
    const huge = withRect(clear, 'B', 20, 20, cells, cells);
    const problems = checkFootprintBand(huge);
    expect(problems.length).toBeGreaterThanOrEqual(2);
    expect(problems.join(' ')).toContain('native px WIDE');
    expect(problems.join(' ')).toContain('native px TALL');
    expect(footprintsOf(huge)[0]?.nativeH).toBeGreaterThan(FOOTPRINT_MAX_NATIVE_PX);
  });

  it('a footprint UNDER the band fails too — the band is a band, not a ceiling', () => {
    const clear = cellsWithout(base.doc, ['B']);
    const tiny = withRect(clear, 'B', 20, 20, 3, 3); // 48 native px
    expect(checkFootprintBand(tiny).join(' ')).toContain('outside 85–140');
  });

  it('two footprints touching at a corner — checkFootprintClearance fails', () => {
    expect(checkFootprintClearance(base.doc)).toEqual([]);
    const clear = cellsWithout(base.doc, ['B']);
    // One clear column between them is the minimum, and it is enough: legal, and the check is quiet.
    const legal = withRect(withRect(clear, 'B', 20, 20, 6, 6), 'B', 27, 20, 6, 6);
    expect(checkFootprintClearance(legal)).toEqual([]);
    // Corner-to-corner: still two separate 4-connected regions, but with no clear cell on EITHER
    // axis between their boxes. This is the case the pair rule exists for.
    const corner = withRect(withRect(clear, 'B', 20, 20, 6, 6), 'B', 26, 26, 6, 6);
    expect(footprintsOf(corner)).toHaveLength(2);
    const problems = checkFootprintClearance(corner);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toContain('flush or overlapping');
  });

  it('two footprints laid FLUSH merge into one, and the band check is what fails', () => {
    // Named because the obvious expectation is wrong: side-by-side buildings are 4-connected, so
    // they are ONE region, and the pair rule never sees two of anything. The over-wide extent is
    // what gives them away. tools/mapgen/verify.ts records this division of labour.
    const clear = cellsWithout(base.doc, ['B']);
    const flush = withRect(withRect(clear, 'B', 20, 20, 6, 6), 'B', 26, 20, 6, 6);
    expect(footprintsOf(flush)).toHaveLength(1);
    expect(footprintsOf(flush)[0]?.nativeW).toBe(12 * flush.dims.cellPx);
    expect(checkFootprintClearance(flush)).toEqual([]);
    expect(checkFootprintBand(flush).join(' ')).toContain('192 native px WIDE');
  });

  it('an L of footprints with the lane in the notch — checkFootprintClearance fails', () => {
    const clear = cellsWithout(base.doc, ['B']);
    const lane = clear.body.flatMap((line, r) =>
      Array.from(line).flatMap((c, col) =>
        c === ':' && col >= 14 && col <= 48 && r >= 14 && r <= 48 ? [[col, r] as const] : [],
      ),
    );
    const cell = lane[Math.floor(lane.length / 2)];
    expect(cell, 'the layout has no mid-map lane cell to build an L around').toBeDefined();
    if (!cell) return;
    const [lc, lr] = cell;
    // Two rectangles meeting at one edge, so they are ONE region whose bounding box has a notch —
    // and the lane cell sits in the notch, untouched and still spelled `:`.
    const ell = withRect(withRect(clear, 'B', lc - 8, lr - 3, 6, 6), 'B', lc - 3, lr + 3, 6, 6);
    expect(footprintsOf(ell)).toHaveLength(1);
    expect(ell.body[lr]?.[lc]).toBe(':');
    const problems = checkFootprintClearance(ell);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toContain('path-corridor cell');
  });

  it('a footprint that EATS a lane run is caught by reachability, not by clearance', () => {
    // The honest statement of the blind spot: painting a building straight over the lane deletes
    // the characters the clearance check would have compared against. What it cannot delete is the
    // consequence — the mouth on the far side is no longer walkable-to.
    const clear = cellsWithout(base.doc, ['B']);
    const mouth = anchorsOf(clear).find((a) => a.kind === 'edge-mouth');
    expect(mouth).toBeDefined();
    if (!mouth) return;
    const cut = mouth.row < clear.dims.rows / 2 ? mouth.row + 6 : mouth.row - 6;
    const severed = withRect(clear, 'B', 0, cut, clear.dims.cols, 3);
    expect(checkFootprintClearance(severed).join(' ')).not.toContain('path-corridor cell');
    const problems = checkReachability(severed, balance);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toContain('sealed off from the centre');
  });

  it('a building on a route — checkSettlementOnly fails', () => {
    expect(checkSettlementOnly(route.doc, route.placement.settlement)).toEqual([]);
    const built = withRect(cellsWithout(route.doc, ['B']), 'B', 20, 20, 7, 7);
    const problems = checkSettlementOnly(built, false);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toContain('not a settlement');
    // …and the same layout judged as a settlement is fine, so the check is about the node, not the shape.
    expect(checkSettlementOnly(built, true)).toEqual([]);
  });

  it('ONE alpha-0 pixel in the mask — readMask refuses the file', () => {
    const grid = collisionGridOf(base.doc);
    const clean = maskRasterFrom(grid, balance);
    expect(readMask(base.node.id, clean, balance).health.usable).toBe(true);

    const sabotaged = new Uint8ClampedArray(clean.data as unknown as ArrayLike<number>);
    sabotaged[3] = 0; // the very first pixel's alpha
    const reading = readMask(base.node.id, { width: clean.width, height: clean.height, data: sabotaged, channels: 4 }, balance);
    expect(reading.health.usable).toBe(false);
    expect(reading.health.transparentPixels).toBe(1);
    expect(reading.health.problems.join(' ')).toContain('must be fully ' + 'opaque');
  });

  it('a spawn cell walled in — checkSpawn fails through the real engine functions', () => {
    expect(checkSpawn(base.doc, balance)).toEqual([]);
    // Blocking every cell is the only way to make firstWalkableTile give up: it rings outward from
    // the middle and will happily find ground twenty cells away, which is the point of asserting
    // the CENTRE cell separately.
    const sealed: LayoutDoc = { ...base.doc, body: base.doc.body.map((l) => '#'.repeat(l.length)) };
    const problems = checkSpawn(sealed, balance);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toContain('NO WALKABLE TILE');

    const centreOnly = withCell(base.doc, '#', Math.floor(base.doc.dims.cols / 2), Math.floor(base.doc.dims.rows / 2));
    expect(checkSpawn(centreOnly, balance).join(' ')).toContain('centre cell');
  });

  it('a prop sealed behind a wall — checkReachability fails', () => {
    expect(checkReachability(base.doc, balance)).toEqual([]);
    const anchor = anchorsOf(base.doc).find((a) => a.kind === 'prop-anchor');
    expect(anchor).toBeDefined();
    if (!anchor) return;
    // A ring of wall around the anchor: the cell is still walkable, the mask is still usable, and
    // nothing the player can do will get them to it. This is the failure `readMask` cannot see.
    let walled = base.doc;
    for (let r = anchor.row - 1; r <= anchor.row + 1; r += 1) {
      for (let c = anchor.col - 1; c <= anchor.col + 1; c += 1) {
        if (c === anchor.col && r === anchor.row) continue;
        walled = withCell(walled, '#', c, r);
      }
    }
    const problems = checkReachability(walled, balance);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toContain('sealed off from the centre');
    expect(readMask(base.node.id, maskRasterFrom(collisionGridOf(walled), balance), balance).health.usable).toBe(true);
  });

  it('verifyLayout — the one function the seeder refuses to write past — fails on all of it at once', () => {
    expect(
      verifyLayout({
        doc: base.doc,
        node: base.node,
        balance,
        back: base.placement.back,
        onward: base.placement.onward,
        settlement: base.placement.settlement,
      }),
    ).toEqual([]);

    const cells = Math.ceil(300 / base.doc.dims.cellPx);
    let broken = withRect(base.doc, '.', 0, 30, 1, 3); // hole in the left edge
    broken = withRect(broken, 'B', 20, 20, cells, cells); // a 304px footprint
    // THREE adjacencies, so the count is wrong however many holes the sabotage punched. (An earlier
    // draft added one adjacency and one left-edge hole, and the two errors cancelled: two declared,
    // two found. The count clause was silent and the test was asserting a message it never emitted.)
    const lying: NodeFile = {
      ...base.node,
      adjacency: [...base.node.adjacency, 'brackwater', 'bowerdeep'],
      props: base.node.props.map((p, i) => (i === 0 ? { ...p, x: 0, y: 0 } : p)),
    };
    const problems = verifyLayout({
      doc: broken,
      node: lying,
      balance,
      back: base.placement.back,
      onward: base.placement.onward,
      settlement: base.placement.settlement,
    });
    expect(problems.length).toBeGreaterThanOrEqual(4);
    const text = problems.join(' | ');
    expect(text).toContain('left edge is open');
    expect(text).toContain('adjacency declares 3');
    expect(text).toContain('native (0,0)');
    expect(text).toContain('native px WIDE');
  });

  it('the legend refuses a character that is both an anchor and a wall', async () => {
    const { assertLegendWellFormed, DEFAULT_LEGEND, LegendError } = await import('../../tools/mapgen/legend');
    expect(() => assertLegendWellFormed(DEFAULT_LEGEND)).not.toThrow();
    expect(() =>
      assertLegendWellFormed([
        ...DEFAULT_LEGEND,
        { char: 'X', kind: 'trap', blocks: true, anchor: true, control: [1, 2, 3], note: 'both' },
      ]),
    ).toThrow(LegendError);
  });

  it('the parser refuses a body of the wrong size, and a character it has never heard of', () => {
    const good = readFileSync(layoutPath(base.node.id), 'utf8');
    expect(() => parseLayout(base.node.id, good, balance)).not.toThrow();
    const short = good.split('\n').slice(0, -3).join('\n');
    expect(() => parseLayout(base.node.id, short, balance)).toThrow(/expected 64/);

    const lines = good.split('\n');
    const cut = lines.indexOf('---');
    expect(cut).toBeGreaterThan(0);
    const firstBody = lines[cut + 1];
    expect(firstBody).toBeDefined();
    if (firstBody !== undefined) lines[cut + 1] = `Z${firstBody.slice(1)}`;
    expect(() => parseLayout(base.node.id, lines.join('\n'), balance)).toThrow(/not in the legend/);
    expect(() => parseLayout(base.node.id, good.replace('---\n', ''), balance)).toThrow(/separator/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The whole contract, at every node, in one line
 * ════════════════════════════════════════════════════════════════════════════ */

describe('every shipped layout is in contract', () => {
  it('verifyLayout is silent for all twelve', () => {
    for (const { doc, node, placement } of all) {
      expect(
        verifyLayout({ doc, node, balance, back: placement.back, onward: placement.onward, settlement: placement.settlement }),
        node.id,
      ).toEqual([]);
    }
  });

  it('and the region kinds the checks name are the ones the legend actually spells', () => {
    // KIND_BUILDING is a string, not an enum member — this is the one place the two meet, and it is
    // asserted rather than assumed, because "open string" and "typo" look identical.
    const kinds = new Set(all.flatMap((a) => footprintsOf(a.doc).map((f) => f.kind)));
    expect([...kinds]).toEqual([KIND_BUILDING]);
  });
});
