/**
 * tests/unit/edge-mouth-travel.test.ts — an edge of the map leads where the LAYOUT says it leads,
 * and the cell it leads from is one the layout itself draws.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 * ═════════════════════════════════════════════════════════════════════════════════════════════════
 * The owner played the deployed build and reported, verbatim: **"I should be able to go to the next
 * region by walking up the path. Instead, that appears to be blocking behind a button right now."**
 *
 * `OverworldScene.travelTo` carried a declared deviation saying why it was a button: *"the node
 * schema carries no exit or portal positions … so there is nothing in the data that says where an
 * edge of the map leads."* True of the SCHEMA, false of the MAP. `tools/mapgen/legend.ts` has
 * defined legend kind `edge-mouth` — *"the cell where a corridor meets the map edge; one per
 * declared adjacency"* — since the layouts were written, `tools/mapgen/layouts/*.txt` draws a `^`
 * for every adjacency, and each layout's header names which neighbour each edge serves. The `^` is
 * simply flattened to walkable floor when the mask is rasterised (`tools/mapgen/layout.ts`
 * `normalisedAscii`: `blocks: false` ⇒ `.`), so nothing survived into the shipped PNG for a runtime
 * to read.
 *
 * THIS IS THE DOORS' CONTRACT, APPLIED TO REGIONS. `tests/unit/doorway-threshold.test.ts` exists
 * because every `data/interiors/*.json` door carried the placeholder it was authored with — each
 * `_note` saying it *"must be re-pinned against the painted map"*, and it never was, while the
 * layout had been drawing the right cell all along. `data/nodes/*.json` `edgeMouths[]` is the same
 * kind of pinned coordinate, so it gets the same kind of gate on the same two shipped artefacts:
 * the layout that IS the map, and the mask PNG decoded through `loadCollision`.
 *
 * ⚠ THE COORDINATE IS READ OFF THE GRID, NEVER OFF THE HEADER PROSE, and that is not fastidiousness.
 * `tools/mapgen/layouts/r2.txt` still says *"^ (31,63) jetty plank"* and *"bottom [(30,32)]"* in its
 * anchors block; its own decisions block, further down the same file, records **"THE JETTY AND THE
 * BOTTOM MOUTH MOVED TO COL 38"**. The grid agrees with the decision, not the prose. So §1 parses
 * the 64×64 body for `^` and reads the header ONLY for the edge→node assignment, which is the one
 * thing the grid cannot say.
 *
 * §0 the scope · §1 the coordinate is a `^` the layout draws · §2 the destination is the layout
 * header's own · §3 the mask the browser plays can be walked to it · §4 the seams are reciprocal ·
 * §5 sabotage — every binding above is shown to be capable of failing.
 *
 * The SCENE half — that a step onto the cell is a travel, that a locked exit refuses, that the walk
 * and the key write the same tape entry, and the round trip — is §26 of
 * `tests/unit/overworld-scene.test.ts`, which is where the harness that can drive a step lives.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { findLayoutGrid } from "@core/foodweb";
import { validateContent } from "@core/schemas";
import type { Balance, CollisionGrid, Content, EdgeMouth, NodeFile } from "@core/types";
import {
  chooseSpawnTile,
  loadCollision,
  reachableTiles,
  tileGridSize,
  tileKey,
  tileWalkable,
  type MaskPixels,
} from "@game/collision";
import { solidBodyTiles } from "@game/npcs";
import { DEFAULT_LEGEND } from "../../tools/mapgen/legend";
import { readRaster } from "../../tools/postprocess/raster";

const content: Content = validateContent();
const balance: Balance = content.balance;
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SIZE = tileGridSize(balance);

/** The legend's edge-mouth character, looked up rather than typed, so a renamed char follows. */
const MOUTH_CHARS: ReadonlySet<string> = new Set(
  DEFAULT_LEGEND.filter((e) => e.kind === "edge-mouth").map((e) => e.char),
);

/** The layout's grid rows, isolated the way the GAME isolates them (`core/foodweb.ts`). */
function layoutRows(nodeId: string): string[] {
  const text = readFileSync(resolve(ROOT, `tools/mapgen/layouts/${nodeId}.txt`), "utf8");
  const parse = findLayoutGrid(text, balance.map.collisionCols);
  expect(parse.ambiguous, `${nodeId}: two runs tie for the grid — the layout is ambiguous`).toBe(false);
  expect(parse.rows.length, `${nodeId}: the layout has no grid`).toBe(balance.map.collisionRows);
  return parse.rows;
}

/** The header of a layout — every `#` line ABOVE the grid, verbatim. */
function layoutHeader(nodeId: string): string[] {
  const text = readFileSync(resolve(ROOT, `tools/mapgen/layouts/${nodeId}.txt`), "utf8");
  return text.split("\n").filter((line) => line.startsWith("#"));
}

/** Every `^` the layout draws, as movement tiles, in reading order. */
function declaredMouthTiles(nodeId: string): { col: number; row: number }[] {
  const out: { col: number; row: number }[] = [];
  const rows = layoutRows(nodeId);
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r] as string;
    for (let c = 0; c < row.length; c += 1) {
      if (!MOUTH_CHARS.has(row[c] as string)) continue;
      // The cell's CENTRE through the same two conversions the scene uses, so a retune of
      // `collisionCellPx`, `mapRenderScale` or `tileStepPx` moves both readings together (G11).
      out.push(nativeTile({
        x: c * balance.map.collisionCellPx + balance.map.collisionCellPx / 2,
        y: r * balance.map.collisionCellPx + balance.map.collisionCellPx / 2,
      }));
    }
  }
  return out;
}

/** `OverworldScene.mouthTileOf`'s arithmetic, restated — map-native pixels to a movement tile. */
function nativeTile(at: { x: number; y: number }): { col: number; row: number } {
  return {
    col: Math.floor((at.x * balance.map.mapRenderScale) / balance.map.tileStepPx),
    row: Math.floor((at.y * balance.map.mapRenderScale) / balance.map.tileStepPx),
  };
}

/**
 * Which neighbour the layout's own header assigns to each edge.
 *
 * TWO AUTHORED SHAPES SHIP, and both are handled because both are the map's own statement. Eleven
 * layouts write one line per edge — `# bottom edge  r1 …` / `# top edge  r2 …`. `r2.txt` writes it
 * on the adjacency line instead — `# adjacency  brackwater = BOTTOM edge, bowerdeep = TOP edge.`
 * A `— sealed` edge (hearthollow's bottom, sanctum's top: the two ends of the chain) names no node
 * and is deliberately absent from the result rather than mapped to anything.
 */
function headerEdges(nodeId: string): Map<"top" | "bottom", string> {
  const out = new Map<"top" | "bottom", string>();
  for (const line of layoutHeader(nodeId)) {
    const plain = /^#\s*(top|bottom) edge\s+(?:—\s*)?([a-z0-9-]+)/.exec(line);
    if (plain) {
      const side = plain[1] as "top" | "bottom";
      const named = plain[2] as string;
      if (named !== "sealed" && !out.has(side)) out.set(side, named);
    }
    for (const m of line.matchAll(/([a-z0-9-]+)\s*=\s*(BOTTOM|TOP) edge/g)) {
      const side = (m[2] as string).toLowerCase() as "top" | "bottom";
      if (!out.has(side)) out.set(side, m[1] as string);
    }
  }
  return out;
}

/** The edge a tile sits on, in the header's own vocabulary. */
function sideOf(tile: { col: number; row: number }): "top" | "bottom" | "neither" {
  if (tile.row === 0) return "top";
  if (tile.row === SIZE.rows - 1) return "bottom";
  return "neither";
}

interface Loaded {
  node: NodeFile;
  grid: CollisionGrid;
  spawn: { col: number; row: number };
  reachable: ReadonlySet<string>;
}

async function shippedPixels(path: string): Promise<MaskPixels> {
  const raster = await readRaster(resolve(ROOT, path));
  return { width: raster.width, height: raster.height, data: raster.data, channels: 4 };
}

const LOADED: Loaded[] = await Promise.all(
  content.nodes.map(async (node): Promise<Loaded> => {
    const loaded = loadCollision(node.id, node.collisionMask, await shippedPixels(node.collisionMask), balance);
    expect(loaded.source, `${node.id}: ${loaded.note}`).toBe("authored");
    const spawn = chooseSpawnTile(loaded.grid, balance, { props: node.props }).tile;
    // Blocked by the BODIES as well as the mask — the world the player actually walks, since the
    // owner ruled people and props solid. A mouth reachable only by walking through a person is not
    // reachable. (`tests/unit/npc-prop-collision.test.ts` owns the bodies; this borrows them.)
    const bodies = solidBodyTiles(node, null, loaded.grid, balance);
    return { node, grid: loaded.grid, spawn, reachable: reachableTiles(loaded.grid, balance, spawn, bodies) };
  }),
);

const loadedOf = (id: string): Loaded => LOADED.find((l) => l.node.id === id) as Loaded;
const EVERY_MOUTH: Array<{ node: NodeFile; mouth: EdgeMouth }> = content.nodes.flatMap((node) =>
  (node.edgeMouths ?? []).map((mouth) => ({ node, mouth })),
);
const CASES = EVERY_MOUTH.map(({ node, mouth }) => [`${node.id} → ${mouth.to}`, node, mouth] as const);

/* ════════════════════════════════════════════════════════════════════════════
 * §0 the scope is every shipped node, and there is something to check
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§0 the scope", () => {
  it("every shipped node declares exactly one edge mouth per declared adjacency", () => {
    expect(content.nodes.length).toBe(12);
    for (const node of content.nodes) {
      const mouths = node.edgeMouths ?? [];
      expect(
        mouths.length,
        `${node.id}: ${String(mouths.length)} edge mouths for ${String(node.adjacency.length)} adjacency ` +
          `entries (${node.adjacency.join(", ")}). The legend says "one per declared adjacency", and a ` +
          `neighbour with no mouth is a neighbour the player cannot walk to.`,
      ).toBe(node.adjacency.length);
      expect([...mouths].map((m) => m.to).sort()).toEqual([...node.adjacency].sort());
      for (const mouth of mouths) {
        expect(mouth._note.length, `${node.id} → ${mouth.to}: the pin has no note`).toBeGreaterThan(80);
      }
    }
    expect(EVERY_MOUTH.length, "no mouths ship, so this file proves nothing").toBe(22);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §1 the coordinate is a cell the map itself draws
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 every mouth is pinned to a `^` its own layout draws", () => {
  it("every layout draws exactly as many `^` cells as its node declares adjacencies", () => {
    for (const node of content.nodes) {
      expect(declaredMouthTiles(node.id).length, `${node.id}: layout vs adjacency`).toBe(node.adjacency.length);
    }
  });

  it.each(CASES)("%s: its x/y lands on an edge-mouth cell the layout draws", (_label, node, mouth) => {
    const at = nativeTile(mouth);
    const declared = declaredMouthTiles(node.id);
    expect(
      declared.some((d) => d.col === at.col && d.row === at.row),
      `${node.id} → ${mouth.to}: data/nodes/${node.id}.json puts the mouth at native ` +
        `(${String(mouth.x)},${String(mouth.y)}) = tile ${at.col},${at.row}, which is not an edge mouth of ` +
        `${node.id}. The layout draws its mouths at ${declared.map((d) => `${d.col},${d.row}`).join(" · ")} — ` +
        `re-pin x/y onto one of those (a cell's centre is native (${String(balance.map.collisionCellPx)}·col + ` +
        `${String(balance.map.collisionCellPx / 2)}, ${String(balance.map.collisionCellPx)}·row + ` +
        `${String(balance.map.collisionCellPx / 2)})).`,
    ).toBe(true);
  });

  it("no two mouths of one node share a cell, and every one is on a border row", () => {
    for (const node of content.nodes) {
      const seen = new Set<string>();
      for (const mouth of node.edgeMouths ?? []) {
        const at = nativeTile(mouth);
        expect(seen.has(tileKey(at)), `${node.id}: two mouths on cell ${tileKey(at)}`).toBe(false);
        seen.add(tileKey(at));
        expect(
          sideOf(at),
          `${node.id} → ${mouth.to}: tile ${at.col},${at.row} is not on a border row, so walking to ` +
            `it is not walking off the map`,
        ).not.toBe("neither");
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 the destination is the LAYOUT HEADER's, not a mapping invented in code
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 where a mouth leads is the layout's own statement", () => {
  it("every layout header assigns a node to every edge it opens", () => {
    for (const node of content.nodes) {
      const edges = headerEdges(node.id);
      const sides = new Set(declaredMouthTiles(node.id).map((t) => sideOf(t)));
      for (const side of sides) {
        expect(
          edges.get(side as "top" | "bottom"),
          `tools/mapgen/layouts/${node.id}.txt draws a mouth on the ${String(side)} edge and its header ` +
            `names no node for that edge. THIS IS A FINDING, NOT A THING TO GUESS: bind it by reading ` +
            `the header, or record the ambiguity in docs/STATUS.md (G2).`,
        ).toBeDefined();
      }
    }
  });

  it.each(CASES)("%s: the destination is the one its layout header assigns to that edge", (_label, node, mouth) => {
    const at = nativeTile(mouth);
    const side = sideOf(at) as "top" | "bottom";
    const named = headerEdges(node.id).get(side);
    expect(
      mouth.to,
      `${node.id}: the mouth at tile ${at.col},${at.row} is on the ${side} edge, which ` +
        `tools/mapgen/layouts/${node.id}.txt assigns to "${String(named)}" — but data/nodes/${node.id}.json ` +
        `sends it to "${mouth.to}". The data and the map disagree about where a region's edge leads.`,
    ).toBe(named);
  });

  it("the header assignment is READ, not assumed — the parser finds all twenty-two", () => {
    // A regex that matched nothing would make the assertion above vacuous on every case (undefined
    // vs undefined never happens, but a silently-empty map would still be worth catching early).
    const found = content.nodes.flatMap((n) => [...headerEdges(n.id).values()]);
    expect(found.length, "the header parser read no edge assignments at all").toBe(22);
    for (const id of found) expect(content.nodes.some((n) => n.id === id), `header names "${id}"`).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 …and the player can actually get there, in the mask the browser plays
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 the mouth tile, in the collision mask the browser plays", () => {
  it.each(CASES)("%s: the player can stand on it", (_label, node, mouth) => {
    const at = nativeTile(mouth);
    expect(
      tileWalkable(loadedOf(node.id).grid, at.col, at.row, balance),
      `${node.id} → ${mouth.to}: tile ${at.col},${at.row} is BLOCKED in ${node.collisionMask}. ` +
        `OverworldScene fires travel on a step that LANDS on the mouth, and game/movement.ts refuses ` +
        `to start a step into a blocked tile — so this exit can never be used, at any frame rate.`,
    ).toBe(true);
  });

  it.each(CASES)("%s: a walk from the spawn tile reaches it, with every body standing", (_label, node, mouth) => {
    const at = nativeTile(mouth);
    expect(
      loadedOf(node.id).reachable.has(tileKey(at)),
      `${node.id} → ${mouth.to}: tile ${at.col},${at.row} is not four-connected to the tile the scene ` +
        `spawns the player on. Standable ground the player cannot walk to is an exit that does not work.`,
    ).toBe(true);
  });

  it.each(CASES)("%s: the cell one step INWARD is where an arrival lands, and it is standable", (_label, node, mouth) => {
    /*
     * `OverworldScene.seamArrival` puts a player arriving from the far side one step in from the
     * mouth, never ON it — the mouth is on the border row, which the synthesised placeholder grid
     * blocks, so an arrival pinned to it would strand the player the moment a mask failed to load.
     * Asserted on the AUTHORED grid here; the placeholder's own border is what makes it safe there.
     */
    const at = nativeTile(mouth);
    const inward = { col: at.col, row: at.row === 0 ? 1 : at.row - 1 };
    const l = loadedOf(node.id);
    expect(tileWalkable(l.grid, inward.col, inward.row, balance), `${node.id}: ${tileKey(inward)} blocked`).toBe(
      true,
    );
    expect(l.reachable.has(tileKey(inward)), `${node.id}: ${tileKey(inward)} unreachable`).toBe(true);
  });

  it("a mouth sits in a NARROW gap in the border — the trigger can never swallow a whole wall", () => {
    /*
     * `edgeExitAt` widens the trigger from the `^` to the contiguous walkable run of its border row,
     * so the two cells beside the anchor are not dead ends the player walks into for nothing. That
     * widening is only safe while the run is a GAP. Measured on the shipped masks: every one of the
     * twenty-two is exactly three cells wide, which is the painted opening and nothing more.
     */
    for (const { node, mouth } of EVERY_MOUTH) {
      const at = nativeTile(mouth);
      const grid = loadedOf(node.id).grid;
      let lo = at.col;
      let hi = at.col;
      while (lo - 1 >= 0 && tileWalkable(grid, lo - 1, at.row, balance)) lo -= 1;
      while (hi + 1 < SIZE.cols && tileWalkable(grid, hi + 1, at.row, balance)) hi += 1;
      const width = hi - lo + 1;
      /*
       * EXACTLY THREE, not "narrow enough". `edgeExitAt`'s widening argument rests on this being the
       * painted opening and nothing more, and all twenty-two are 3 — so a tolerance would let a
       * repaint quietly widen a gap to five while the safety argument still claimed three.
       */
      expect(width, `${node.id} → ${mouth.to}: the border run at row ${at.row} is ${String(width)} cells`).toBe(3);
      expect(at.col, `${node.id} → ${mouth.to}: the anchor is outside its own run`).toBeGreaterThanOrEqual(lo);
      expect(at.col).toBeLessThanOrEqual(hi);
    }
  });

  it("two mouths of one node never share a border run, so a cell can only lead one way", () => {
    for (const node of content.nodes) {
      const runs = (node.edgeMouths ?? []).map((m) => {
        const at = nativeTile(m);
        const grid = loadedOf(node.id).grid;
        let lo = at.col;
        let hi = at.col;
        while (lo - 1 >= 0 && tileWalkable(grid, lo - 1, at.row, balance)) lo -= 1;
        while (hi + 1 < SIZE.cols && tileWalkable(grid, hi + 1, at.row, balance)) hi += 1;
        return { row: at.row, lo, hi, to: m.to };
      });
      for (let i = 0; i < runs.length; i += 1) {
        for (let j = i + 1; j < runs.length; j += 1) {
          const a = runs[i] as (typeof runs)[number];
          const b = runs[j] as (typeof runs)[number];
          if (a.row !== b.row) continue;
          expect(
            a.hi < b.lo || b.hi < a.lo,
            `${node.id}: the runs to ${a.to} and ${b.to} overlap on row ${String(a.row)} — one cell ` +
              `would lead two ways and the first one found would win`,
          ).toBe(true);
        }
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4 the seams — a way out is a way back in
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 every seam is reciprocal", () => {
  it.each(CASES)("%s: the far side has a mouth that leads back here", (_label, node, mouth) => {
    const far = content.nodes.find((n) => n.id === mouth.to);
    expect(far, `${node.id}: "${mouth.to}" is not a shipped node`).toBeDefined();
    const back = ((far as NodeFile).edgeMouths ?? []).find((m) => m.to === node.id);
    expect(
      back,
      `${node.id} → ${mouth.to} is one-way: ${mouth.to} declares no mouth back to ${node.id}, so a ` +
        `player who walks out of ${node.id} has no seam to arrive on and no seam to walk home through.`,
    ).toBeDefined();
  });

  it.each(CASES)("%s: both sides of the seam are on the same column, as the layouts wrote them", (_label, node, mouth) => {
    /*
     * NOT A REQUIREMENT OF THE CODE — a fact about the authored maps, asserted because it is what
     * makes the seam read as continuous ground: you walk off the top of one map at column 41 and
     * arrive at column 41 on the bottom of the next. `tools/mapgen/layouts/hearthollow.txt` says so
     * in its own header: "the timber field gate, which now stands on r1's bottom mouth (also col
     * 41)". If a repaint moves one side, this is where it is noticed.
     */
    const far = content.nodes.find((n) => n.id === mouth.to) as NodeFile;
    const back = (far.edgeMouths ?? []).find((m) => m.to === node.id) as EdgeMouth;
    expect(nativeTile(back).col, `${node.id} ↔ ${mouth.to}: the seam is offset`).toBe(nativeTile(mouth).col);
  });

  it("the twelve nodes are one chain, and both ends are sealed", () => {
    const ends = content.nodes.filter((n) => (n.edgeMouths ?? []).length === 1).map((n) => n.id);
    expect(ends.sort(), "the region is not a chain with two ends").toEqual(["hearthollow", "sanctum"]);
    // Walk it, mouth to mouth, and confirm the walk visits every node — i.e. the mouths ALONE (not
    // `adjacency`) describe a connected region.
    const seen = new Set<string>(["hearthollow"]);
    const queue = ["hearthollow"];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      const node = content.nodes.find((n) => n.id === id) as NodeFile;
      for (const m of node.edgeMouths ?? []) {
        if (seen.has(m.to)) continue;
        seen.add(m.to);
        queue.push(m.to);
      }
    }
    expect(seen.size, "walking the mouths does not reach every node").toBe(12);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §5 sabotage — every assertion above can actually fail
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§5 the bindings are load-bearing", () => {
  it("SABOTAGE: a mouth moved off its `^` is caught by §1", () => {
    const node = content.nodes.find((n) => n.id === "hearthollow") as NodeFile;
    const real = (node.edgeMouths ?? [])[0] as EdgeMouth;
    const moved = { ...real, x: real.x + balance.map.collisionCellPx * 4 };
    const at = nativeTile(moved);
    expect(
      declaredMouthTiles(node.id).some((d) => d.col === at.col && d.row === at.row),
      "a mouth shifted four cells along the border still landed on an anchor — §1 cannot fail",
    ).toBe(false);
  });

  it("SABOTAGE: a mouth pointed at the wrong neighbour is caught by §2", () => {
    const node = content.nodes.find((n) => n.id === "r1") as NodeFile;
    const real = (node.edgeMouths ?? []).find((m) => m.to === "brackwater") as EdgeMouth;
    const swapped = { ...real, to: "hearthollow" };
    const side = sideOf(nativeTile(swapped)) as "top" | "bottom";
    expect(
      swapped.to === headerEdges(node.id).get(side),
      "r1's top mouth pointed at hearthollow still matched the header — §2 cannot fail",
    ).toBe(false);
  });

  it("SABOTAGE: a mouth on unreachable ground is caught by §3", () => {
    const l = loadedOf("brackwater");
    // Brackwater is 3287 of 4096 cells blocked; a cell in the middle of that mass is standable
    // nowhere. Find one, and confirm the reachability check refuses it.
    let blocked: { col: number; row: number } | null = null;
    for (let row = 0; row < SIZE.rows && blocked === null; row += 1) {
      for (let col = 0; col < SIZE.cols; col += 1) {
        if (!tileWalkable(l.grid, col, row, balance)) {
          blocked = { col, row };
          break;
        }
      }
    }
    expect(blocked, "brackwater's mask has no blocked cell at all — the reader is broken").not.toBeNull();
    expect(
      l.reachable.has(tileKey(blocked as { col: number; row: number })),
      "a cell inside solid geometry read as reachable — §3 cannot fail",
    ).toBe(false);
  });

  it("SABOTAGE: a one-way seam is caught by §4's own predicate", () => {
    /*
     * ⚠ THE FIRST VERSION OF THIS WAS A TAUTOLOGY and is worth recording rather than quietly
     * replacing: it filtered `m.to !== "hearthollow"` out of an array and then asserted the result
     * contained no `hearthollow`. That is `Array.filter`'s contract, not §4's — it would have passed
     * with §4 deleted. The predicate below is §4's own, run against a doctored corpus.
     */
    const doctored = content.nodes.map((n) =>
      n.id === "r1" ? { ...n, edgeMouths: (n.edgeMouths ?? []).filter((m) => m.to !== "hearthollow") } : n,
    );
    const reciprocal = (fromId: string, toId: string): boolean => {
      const far = doctored.find((n) => n.id === toId);
      return far !== undefined && (far.edgeMouths ?? []).some((m) => m.to === fromId);
    };
    expect(reciprocal("hearthollow", "r1"), "§4's reciprocity predicate cannot see a severed seam").toBe(false);
    // …and it still answers TRUE on the shipped corpus, so it is not simply always false.
    expect(reciprocal("r1", "brackwater"), "§4's predicate is false on a healthy seam too").toBe(true);
  });
});
