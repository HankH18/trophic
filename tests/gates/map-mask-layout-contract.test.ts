/**
 * tests/gates/map-mask-layout-contract.test.ts — the shipped painting and the shipped collision mask
 * are stamped from ONE text file, so they cannot disagree about where a wall is. Measured, per node,
 * cell by cell, against the files in `assets/final/maps/`.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS GATE EXISTS
 * ═════════════════════════════════════════════════════════════════════════════════════════════════
 * Until the masks landed, every one of the twelve nodes was played on a SYNTHESISED grid — an open
 * rectangle walkable except its one-cell border (`game/collision.ts::synthesiseBorderCollision`),
 * because `loadCollision` gets `pixels: null` when the declared mask is not on disk. Measured against
 * the layouts that draw those maps, between 30.3% (duskhollow) and 74.2% (brackwater) of every node
 * was walkable that its own geometry says is not: buildings, open water, rock and treeline were all
 * walk-through. The suite was fully green over that, because every collision test handed
 * `loadCollision` a `null` buffer or an ascii literal and therefore drove the branch it named
 * whatever the repo actually held.
 *
 * So the assertions here are deliberately made against the SHIPPED BYTES and through the SHIPPED
 * CALL — `loadCollision(node.id, node.collisionMask, <pixels decoded from the PNG>, balance)`, which
 * is `OverworldScene.buildNodeView`'s own line — never against `maskRasterFrom`, the encoder that
 * produced the file. A test that re-ran the producer and compared it with itself would be green on a
 * mask that describes the wrong map.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════
 * THE THREE READERS OF ONE LAYOUT, AND WHY EACH IS USED HERE RATHER THAN RESTATED
 * ═════════════════════════════════════════════════════════════════════════════════════════════════
 * 1. BLOCKING IS DERIVED FROM `tools/mapgen/legend.ts` `DEFAULT_LEGEND`, never hand-typed. A
 *    hand-typed walkable set has already caused a real error on this lane by omitting `~`
 *    (`shallow` — "walkable water margin — wadeable, not a wall"). The legend is the one place that
 *    says which characters block; this file filters it and does not enumerate it.
 * 2. THE GRID IS ISOLATED WITH `core/foodweb.ts::findLayoutGrid` — the GAME's parse, the one
 *    `encounterMaskFor` uses — and NOT with `tools/mapgen/layout.ts::parseLayout`, which is the
 *    PRODUCER's parse (a `---` split). They are two independent readings of the same file, so
 *    comparing the mask against this one binds the two parses together as a side effect. A layout
 *    whose header grew a `---` line, or whose grid moved, would separate them and fail here.
 * 3. THE ENCOUNTER MASK is asked of `game/encounters.ts::encounterMaskFor`, the live one the
 *    overworld rolls against — not rebuilt from the character.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS GATE DOES **NOT** COVER, SAID OUT LOUD
 * ═════════════════════════════════════════════════════════════════════════════════════════════════
 * It does not check that the PAINTING is a fresh composition of the layout. The composer is
 * `tools/mapgen/compose/compose.py` and running it needs Python with Pillow, which nothing else in
 * `npm run test` depends on; a gate that shelled out to an interpreter the suite does not otherwise
 * require would be red on a working tree for a reason that is not a defect. That check is
 * `npx tsx tools/mapgen/land.ts --check`, which recomposes into a scratch directory and byte-compares
 * both artefacts. What IS covered here is that the painting exists, decodes, and shares the mask's
 * coordinate space exactly — so the two line up pixel for pixel — and
 * `tests/gates/asset-palette-contract.test.ts` covers its pixels against the frozen 32.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateContent } from "../../core/schemas";
import { cellRollsEncounters, findLayoutGrid } from "../../core/foodweb";
import type { Balance, CollisionGrid, NodeFile } from "../../core/types";
import { DEFAULT_LEGEND } from "../../tools/mapgen/legend";
import { readRaster } from "../../tools/postprocess/raster";
import {
  blockedCount,
  cellTopLeftWorld,
  chooseSpawnTile,
  isBlocked,
  loadCollision,
  tileWalkable,
  worldCellPx,
  type LoadedCollision,
  type MaskPixels,
} from "../../game/collision";
import { encounterMaskFor } from "../../game/encounters";
// `game/placeholder.ts` imports Phaser as a TYPE only, so it loads in the `node` environment this
// suite runs in. `game/mapview.ts` imports it as a value and would need a DOM; its two key helpers
// (`mapTextureKey`, `maskTextureKey`) are both one call to `assetId`, so the collision check below
// uses that directly rather than dragging an engine into a gate.
import { assetId, hasRealAsset, realAssetUrl } from "../../game/placeholder";
import {
  createMovement,
  movementConfig,
  queueInput,
  update as updateMovement,
  type Direction,
} from "../../game/movement";

const content = validateContent();
const balance: Balance = content.balance;
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * The characters the player cannot stand on, from the legend rather than from a list here.
 *
 * `game/encounters.ts` builds the identical set for the encounter mask's denominator by the same
 * filter; that duplication is two readers of one table, not two tables.
 */
const BLOCKING_CHARS: ReadonlySet<string> = new Set(
  DEFAULT_LEGEND.filter((e) => e.blocks).map((e) => e.char),
);

/** The legend's `building-footprint` character — looked up, so a renamed char follows the table. */
const BUILDING_CHARS: ReadonlySet<string> = new Set(
  DEFAULT_LEGEND.filter((e) => e.kind === "building-footprint").map((e) => e.char),
);

const layoutFile = (nodeId: string): string => resolve(ROOT, `tools/mapgen/layouts/${nodeId}.txt`);

/** The layout's grid rows, isolated the way the GAME isolates them. See the header, point 2. */
function layoutRows(nodeId: string): string[] {
  const text = readFileSync(layoutFile(nodeId), "utf8");
  const parse = findLayoutGrid(text, balance.map.collisionCols);
  if (parse.ambiguous) throw new Error(`${nodeId}: two runs tie for the grid — the layout is ambiguous`);
  return parse.rows;
}

/** The PNG on disk, as the engine's `MaskPixels`. RGBA, four channels, exactly as a texture read. */
async function shippedPixels(path: string): Promise<MaskPixels> {
  const raster = await readRaster(resolve(ROOT, path));
  return { width: raster.width, height: raster.height, data: raster.data, channels: 4 };
}

interface Loaded {
  node: NodeFile;
  rows: string[];
  collision: LoadedCollision;
  grid: CollisionGrid;
}

/**
 * Every node loaded ONCE, through the shipped call. Top-level await rather than `beforeAll` so the
 * per-node `it.each` rows below are named by the data instead of by an index.
 */
const LOADED: Loaded[] = await Promise.all(
  content.nodes.map(async (node) => {
    const pixels = await shippedPixels(node.collisionMask);
    // The line OverworldScene.buildNodeView runs, with no options, so the sampler falls to its
    // shipped defaults (`dark-blocks`, `majority`).
    const collision = loadCollision(node.id, node.collisionMask, pixels, balance);
    return { node, rows: layoutRows(node.id), collision, grid: collision.grid };
  }),
);

const byId = new Map(LOADED.map((l) => [l.node.id, l]));
const NODE_IDS = content.nodes.map((n) => n.id);

/* ════════════════════════════════════════════════════════════════════════════
 * 1. The files are there, and they are the artefacts the data names
 * ════════════════════════════════════════════════════════════════════════════ */

describe("every node that declares a collision mask ships one", () => {
  it("the scope is non-empty and is every node in data/nodes/", () => {
    expect(content.nodes.length).toBeGreaterThan(0);
    for (const node of content.nodes) {
      expect(typeof node.collisionMask, `${node.id} declares no mask path`).toBe("string");
      expect(node.collisionMask.length).toBeGreaterThan(0);
    }
  });

  it.each(NODE_IDS)("%s: the declared mask and map are both on disk and non-empty", (id) => {
    const node = content.nodes.find((n) => n.id === id)!;
    for (const [what, path] of [
      ["mask", node.collisionMask],
      ["map", node.mapAsset],
    ] as const) {
      const abs = resolve(ROOT, path);
      expect(existsSync(abs), `${id}: the ${what} ${path} is not on disk`).toBe(true);
      expect(statSync(abs).size, `${id}: the ${what} ${path} is zero bytes`).toBeGreaterThan(0);
    }
  });

  it.each(NODE_IDS)("%s: the mask decodes, and the game accepts it as AUTHORED geometry", (id) => {
    const { collision, grid } = byId.get(id)!;
    // Not "a file decoded" — `collisionFromMask` refuses a transparent, empty or all-blocked mask
    // and falls back to the synthesised placeholder, so this is the assertion that the shipped
    // bytes are a mask the game will actually play on.
    expect(collision.source, `${id}: ${collision.note}`).toBe("authored");
    expect(collision.synthetic).toBe(false);
    expect(collision.health?.usable, `${id}: ${collision.health?.problems.join(" · ") ?? ""}`).toBe(true);
    expect(collision.health?.transparentPixels).toBe(0);
    expect(grid.cols).toBe(balance.map.collisionCols);
    expect(grid.rows).toBe(balance.map.collisionRows);
  });

  it.each(NODE_IDS)("%s: both are REGISTERED assets, so the loader will actually ask for them", (id) => {
    const node = content.nodes.find((n) => n.id === id)!;
    // The last link in the chain from "the file is on disk" to "the game has the pixels".
    // `game/mapview.ts::queueNodeArt` skips any path whose `realAssetUrl` is null — that is how an
    // unbuilt asset avoids a 404 — so a mask that is on disk but outside `game/placeholder.ts`'s
    // build-time glob would never be requested, `readMaskPixels` would return null, and
    // `loadCollision` would synthesise the open rectangle again with nothing red anywhere.
    for (const [what, path] of [
      ["mask", node.collisionMask],
      ["map", node.mapAsset],
    ] as const) {
      expect(hasRealAsset(path), `${id}: the ${what} ${path} is not in the shipped asset census`).toBe(true);
      expect(realAssetUrl(path), `${id}: the ${what} ${path} has no served URL`).not.toBeNull();
    }
    // The two must not collide on one texture key, or the map would overwrite the mask.
    expect(assetId(node.collisionMask)).not.toBe(assetId(node.mapAsset));
  });

  it.each(NODE_IDS)("%s: the painting and the mask share one coordinate space, pixel for pixel", async (id) => {
    const node = content.nodes.find((n) => n.id === id)!;
    const map = await readRaster(resolve(ROOT, node.mapAsset));
    const mask = await readRaster(resolve(ROOT, node.collisionMask));
    // The layout is one character per `collisionCellPx` of a `mapNativePx` square; both artefacts
    // are stamped over that same square, so a mismatch means one of them is not this layout's.
    expect(map.width, `${id}: the painting is ${map.width}px wide`).toBe(balance.map.mapNativePx);
    expect(map.height).toBe(balance.map.mapNativePx);
    expect(mask.width, `${id}: the mask is ${mask.width}px wide`).toBe(map.width);
    expect(mask.height).toBe(map.height);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2. THE CENTRAL CLAIM — the mask's blocked cells ARE the layout's walls
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the shipped mask is the layout, cell for cell", () => {
  it.each(NODE_IDS)("%s: every one of the 4096 cells agrees with its layout character", (id) => {
    const { rows, grid } = byId.get(id)!;
    expect(rows.length, `${id}: the layout grid is ${rows.length} rows`).toBe(balance.map.collisionRows);

    const disagreements: string[] = [];
    let blockedInLayout = 0;
    for (let row = 0; row < balance.map.collisionRows; row += 1) {
      const line = rows[row] as string;
      expect(line.length, `${id}: layout row ${String(row)} is ${String(line.length)} chars`).toBe(
        balance.map.collisionCols,
      );
      for (let col = 0; col < balance.map.collisionCols; col += 1) {
        const ch = line[col] as string;
        const shouldBlock = BLOCKING_CHARS.has(ch);
        if (shouldBlock) blockedInLayout += 1;
        const doesBlock = isBlocked(grid, col, row);
        if (shouldBlock !== doesBlock) {
          disagreements.push(
            `(${String(col)},${String(row)}) layout "${ch}" ⇒ ${shouldBlock ? "BLOCKED" : "walkable"}, ` +
              `mask ⇒ ${doesBlock ? "BLOCKED" : "walkable"}`,
          );
        }
      }
    }
    expect(
      disagreements.slice(0, 12),
      `${id}: ${String(disagreements.length)} of ${String(
        balance.map.collisionCols * balance.map.collisionRows,
      )} cells disagree between tools/mapgen/layouts/${id}.txt and ${
        content.nodes.find((n) => n.id === id)!.collisionMask
      }. The two are supposed to be stamped from that one file — re-run \`npx tsx tools/mapgen/land.ts\`.`,
    ).toEqual([]);
    // Bound the comparison rather than trusting it: a layout of all floor and a mask of all floor
    // would agree on every cell and prove nothing.
    expect(blockedInLayout, `${id}: the layout blocks nothing at all`).toBeGreaterThan(0);
    expect(blockedInLayout, `${id}: the layout blocks everything`).toBeLessThan(
      balance.map.collisionCols * balance.map.collisionRows,
    );
    expect(blockedCount(grid)).toBe(blockedInLayout);
  });

  it("the walkable set the masks ship is NOT the synthesised border rectangle they replaced", () => {
    // The stand-in blocked only the one-cell border: 2·cols + 2·rows − 4 cells. Every shipped mask
    // must block substantially more than that, or nothing about the game changed when it landed.
    const border = 2 * balance.map.collisionCols + 2 * balance.map.collisionRows - 4;
    for (const { node, grid } of LOADED) {
      expect(
        blockedCount(grid),
        `${node.id} blocks ${String(blockedCount(grid))} cells — the synthesised placeholder blocked ` +
          `${String(border)}, so this mask says nothing the stand-in did not`,
      ).toBeGreaterThan(border);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3. Through the RUNNING GAME's collision, not through the encoder
 * ════════════════════════════════════════════════════════════════════════════ */

describe("a building footprint is unenterable in the collision the game actually queries", () => {
  /**
   * `OverworldScene.canEnter` is `tileWalkable(activeGrid(), col, row, balance)` and movement asks
   * nothing else, so these two assertions are the whole of what stops the player walking through a
   * house. Neither touches `maskRasterFrom`.
   */
  it.each(NODE_IDS)("%s: every building cell is refused by tileWalkable and bumps a real step", (id) => {
    const { rows, grid } = byId.get(id)!;
    const step = balance.map.tileStepPx;
    const cell = worldCellPx(grid, balance);
    // The tile anchored at a cell's top-left lies inside that cell only while a tile is no larger
    // than a cell. Asserted rather than assumed, so a retune of `tileStepPx` fails here loudly
    // instead of quietly testing the cell next door.
    expect(step, "a movement tile is larger than a collision cell — this mapping no longer holds").toBeLessThanOrEqual(
      cell,
    );

    const buildings: Array<{ col: number; row: number }> = [];
    for (let row = 0; row < rows.length; row += 1) {
      const line = rows[row] as string;
      for (let col = 0; col < line.length; col += 1) {
        if (BUILDING_CHARS.has(line[col] as string)) buildings.push({ col, row });
      }
    }
    // Routes have no buildings; the settlement rule is `tools/mapgen/nodes.ts`'s, not this file's,
    // so a node with none is skipped by having nothing to iterate rather than by a named exception.
    for (const b of buildings) {
      const top = cellTopLeftWorld(grid, b.col, b.row, balance);
      const tile = { col: Math.floor(top.x / step), row: Math.floor(top.y / step) };
      expect(
        tileWalkable(grid, tile.col, tile.row, balance),
        `${id}: the player can stand on the building footprint at cell (${String(b.col)},${String(b.row)})`,
      ).toBe(false);
    }

    // And drive the step machine into one, from a walkable neighbour, exactly as a held key does.
    const cfg = movementConfig(balance);
    const dirs: Array<[Direction, number, number]> = [
      ["right", -1, 0],
      ["left", 1, 0],
      ["down", 0, -1],
      ["up", 0, 1],
    ];
    let bumped = 0;
    for (const b of buildings) {
      for (const [dir, dc, dr] of dirs) {
        const from = { col: b.col + dc, row: b.row + dr };
        if (!tileWalkable(grid, from.col, from.row, balance)) continue;
        const result = updateMovement(
          queueInput(createMovement(from), dir),
          cfg.msPerTile,
          (t) => tileWalkable(grid, t.col, t.row, balance),
          cfg,
        );
        expect(
          result.events.some((e) => e.t === "blocked"),
          `${id}: stepping ${dir} from (${String(from.col)},${String(from.row)}) into the building at ` +
            `(${String(b.col)},${String(b.row)}) was not blocked`,
        ).toBe(true);
        expect(result.state.tile).toEqual(from);
        bumped += 1;
      }
    }
    if (buildings.length > 0) {
      expect(bumped, `${id}: no building cell had a walkable neighbour to bump from`).toBeGreaterThan(0);
    }
  });

  it("at least one node ships a building footprint, so the assertion above is not vacuous", () => {
    const withBuildings = LOADED.filter(({ rows }) =>
      rows.some((line) => Array.from(line).some((ch) => BUILDING_CHARS.has(ch))),
    ).map(({ node }) => node.id);
    expect(withBuildings.length, "no node's layout draws a single building").toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 4. The two masks derived from one file do not contradict each other
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the encounter mask and the collision mask agree", () => {
  it.each(NODE_IDS)("%s: every cell that rolls an encounter is a cell the player can stand on", (id) => {
    const { grid } = byId.get(id)!;
    const mask = encounterMaskFor(id, balance);
    expect(mask, `${id} has no encounter mask, but it has a layout and a collision mask`).not.toBeNull();
    const stranded: string[] = [];
    for (let row = 0; row < mask!.rows; row += 1) {
      for (let col = 0; col < mask!.cols; col += 1) {
        if (cellRollsEncounters(mask!, col, row) && isBlocked(grid, col, row)) {
          stranded.push(`(${String(col)},${String(row)})`);
        }
      }
    }
    expect(
      stranded.slice(0, 12),
      `${id}: ${String(stranded.length)} encounter cell(s) are blocked by the collision mask. Both ` +
        `derive from tools/mapgen/layouts/${id}.txt, so they cannot honestly disagree.`,
    ).toEqual([]);
    expect(mask!.encounterCells, `${id} draws no encounter terrain at all`).toBeGreaterThan(0);
    // The denominator the node's encounter-terrain share is taken over is the same walkable count
    // the collision grid reports — two derivations of one number, bound rather than assumed.
    expect(mask!.walkableCells).toBe(mask!.cols * mask!.rows - blockedCount(grid));
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 5. The masks are PLAYABLE — nobody is sealed in, and nowhere is cut off
 * ════════════════════════════════════════════════════════════════════════════ */

describe("a real mask does not strand the player", () => {
  it.each(NODE_IDS)("%s: the spawn is walkable and reported without a problem", (id) => {
    const { node, grid } = byId.get(id)!;
    const choice = chooseSpawnTile(grid, balance, { props: node.props });
    expect(choice.problem, `${id}: ${choice.problem ?? ""}`).toBeNull();
    expect(tileWalkable(grid, choice.tile.col, choice.tile.row, balance)).toBe(true);
  });

  it.each(NODE_IDS)("%s: every walkable cell is reachable from the spawn — one region, no islands", (id) => {
    const { node, grid } = byId.get(id)!;
    const choice = chooseSpawnTile(grid, balance, { props: node.props });
    const cols = grid.cols;
    const rows = grid.rows;
    // The spawn is a movement TILE; the flood is over collision CELLS. Convert through world space
    // rather than assuming the two grids are the same shape.
    const stepPx = balance.map.tileStepPx;
    const cellPx = worldCellPx(grid, balance);
    const start = {
      col: Math.floor((choice.tile.col * stepPx) / cellPx),
      row: Math.floor((choice.tile.row * stepPx) / cellPx),
    };
    const seen = new Set<number>([start.row * cols + start.col]);
    const stack = [start];
    while (stack.length > 0) {
      const at = stack.pop()!;
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const c = at.col + dc;
        const r = at.row + dr;
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const key = r * cols + c;
        if (seen.has(key) || isBlocked(grid, c, r)) continue;
        seen.add(key);
        stack.push({ col: c, row: r });
      }
    }
    const walkable = cols * rows - blockedCount(grid);
    expect(
      walkable - seen.size,
      `${id}: ${String(walkable - seen.size)} walkable cell(s) are cut off from the spawn at ` +
        `(${String(start.col)},${String(start.row)}). An island the player cannot reach is authored ` +
        `ground nobody can walk on.`,
    ).toBe(0);
  });
});
