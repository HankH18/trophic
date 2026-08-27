/**
 * tests/unit/spawn-props.test.ts — T-39. The spawn tile and the props that overlay it.
 *
 * ══ THE DEFECT THIS BINDS ══
 * `chooseSpawnTile` spirals out from the centre of the 64×64 tile lattice, so the player lands on
 * tile (32,32) — standing point world (1040,1032) — on every node whose centre is walkable. Two of
 * the twelve shipped node files place a prop whose interaction radius contains that point:
 *
 *   sanctum   · sanctum-antler-ring   native (512,512) · 17.9 world px away · radius 96
 *   bowerdeep · bowerdeep-sign-market native (520,560) · 88.0 world px away · radius 96
 *
 * `OverworldScene.interact()` gives a prop absolute priority over everything else a node has to say
 * ("a prop wins over a person"), so at Bowerdeep — twenty-two talk entries, two quest chains — [E]
 * answered with the market notice from the arrival tile and from one tile east, and reached
 * `halder.quest.silk.offer` only from two tiles away. The town would not talk to a player who had
 * not first walked out of a sign's radius, and nothing said so.
 *
 * ══ WHAT IS ASSERTED, AND WHAT DELIBERATELY IS NOT ══
 * The rule is a spawn PREFERENCE, not a collision change: build-doc §7.6 says props "overlay the
 * painted map" and are "not baked into collision", and §4 below is here to keep that true — the
 * covered tile is still walkable and still enterable, and the player may walk onto the stone and
 * read it. What changed is only where they are PUT when they did not choose.
 *
 * §3 is the totality clause: when EVERY walkable tile is inside some radius the function must still
 * return a tile rather than nothing, and must say which prop won.
 *
 * Engine-free: nothing here imports Phaser, and the standing point is the same
 * `spriteWorldPosition` the interact key uses, so a spawn this file calls clear cannot be a prop the
 * interact key then reads.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateContent } from "../../core/schemas";
import type { Balance, NodeFile, PropPlacement } from "../../core/types";
import {
  blockedCount,
  chooseSpawnTile,
  emptyGrid,
  firstWalkableTile,
  gridDimensions,
  loadCollision,
  setBlocked,
  tileGridSize,
  tileWalkable,
  worldCellPx,
} from "../../game/collision";
import { createMovement, movementConfig, spriteWorldPosition } from "../../game/movement";
import { propAt, propInReach, propsInReach } from "../../game/props";

const content = validateContent();
const balance: Balance = content.balance;
const cfg = movementConfig(balance);

/** Where the player's sprite stands on this tile — `OverworldScene.propUnderPlayer()`'s own point. */
function standingAt(tile: { col: number; row: number }): { x: number; y: number } {
  return spriteWorldPosition(createMovement(tile), cfg);
}

/**
 * The grid the game loads for this node TODAY: `loadCollision` with no pixels, because not one
 * declared mask is on disk (asserted in tests/unit/collision.test.ts, which goes red the day one
 * lands). Whatever that returns, the invariants below are about the grid it returns.
 */
function gridOf(node: NodeFile) {
  return loadCollision(node.id, node.collisionMask, null, balance).grid;
}

/** The prop-clear tiles of a grid — how §3 knows whether an alternative existed at all. */
function clearTileExists(node: NodeFile): boolean {
  const grid = gridOf(node);
  const tiles = tileGridSize(balance);
  for (let row = 0; row < tiles.rows; row += 1) {
    for (let col = 0; col < tiles.cols; col += 1) {
      if (!tileWalkable(grid, col, row, balance)) continue;
      if (propsInReach(node, standingAt({ col, row }), balance).length === 0) return true;
    }
  }
  return false;
}

const PROPPED = content.nodes.filter((n) => n.props.length > 0);

/** The lattice centre the spiral starts from — derived, never typed in (G11). */
const MID = {
  col: Math.floor(tileGridSize(balance).cols / 2),
  row: Math.floor(tileGridSize(balance).rows / 2),
};

/* ════════════════════════════════════════════════════════════════════════════
 * 1. The spawn is not inside a prop's reach where an alternative exists
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 a spawn tile is never inside a prop's interaction radius when a clear tile exists", () => {
  it("no node at all — the fixture is wrong", () => {
    expect(content.nodes.length).toBeGreaterThan(0);
    expect(PROPPED.length).toBeGreaterThan(0);
  });

  it.each(content.nodes.map((n) => [n.id, n] as const))(
    "%s spawns clear of every prop it ships",
    (_id, node) => {
      expect(clearTileExists(node), "no clear tile exists — §3 is the test for that map").toBe(true);
      const spawn = chooseSpawnTile(gridOf(node), balance, { props: node.props });
      expect(spawn.problem).toBeNull();
      expect(spawn.insideProp).toBeNull();
      expect(
        propsInReach(node, standingAt(spawn.tile), balance).map((p) => p.id),
        `${node.id} spawns inside a prop's radius`,
      ).toEqual([]);
    },
  );

  it("and the interact key therefore reads the ROOM, not a prop nobody walked to", () => {
    // Asked through `propAt` — the exact function `OverworldScene.interact()` branches on — rather
    // than through a second distance test, so this cannot pass while the interact key disagrees.
    for (const node of content.nodes) {
      const spawn = chooseSpawnTile(gridOf(node), balance, { props: node.props });
      expect(propAt(node, standingAt(spawn.tile), balance), node.id).toBeNull();
    }
  });

  it("THE TWO NODES THAT MEASURED THE DEFECT actually move, and land on ground", () => {
    /*
     * Named because they are the evidence, not because the rule is theirs: without the preference
     * both land on the lattice centre inside a radius. If a node file moves its prop this goes red
     * and the finding has to be re-measured rather than inherited — which is the point.
     */
    const centre = MID;
    const measured = ["bowerdeep", "sanctum"];
    for (const id of measured) {
      const node = content.nodes.find((n) => n.id === id);
      expect(node, `node "${id}" is gone — re-measure this block`).toBeDefined();
      if (!node) continue;
      const grid = gridOf(node);

      // Precondition: the centre IS covered, so this node has something to prove.
      expect(tileWalkable(grid, centre.col, centre.row, balance), id).toBe(true);
      expect(
        propsInReach(node, standingAt(centre), balance).map((p) => p.id),
        `${id}: the centre is no longer inside a prop radius — re-measure`,
      ).not.toEqual([]);

      const spawn = chooseSpawnTile(grid, balance, { props: node.props });
      expect(spawn.tile, id).not.toEqual(centre);
      expect(tileWalkable(grid, spawn.tile.col, spawn.tile.row, balance), id).toBe(true);
      expect(propAt(node, standingAt(spawn.tile), balance), id).toBeNull();
    }
  });

  it("the clear tile it picks is still the closest to the centre — spiral order is unchanged", () => {
    const tiles = tileGridSize(balance);
    const mid = MID;
    const ringOf = (t: { col: number; row: number }): number =>
      Math.max(Math.abs(t.col - mid.col), Math.abs(t.row - mid.row));
    for (const node of PROPPED) {
      const grid = gridOf(node);
      const chosen = chooseSpawnTile(grid, balance, { props: node.props }).tile;
      for (let row = 0; row < tiles.rows; row += 1) {
        for (let col = 0; col < tiles.cols; col += 1) {
          if (ringOf({ col, row }) >= ringOf(chosen)) continue;
          if (!tileWalkable(grid, col, row, balance)) continue;
          expect(
            propsInReach(node, standingAt({ col, row }), balance).length,
            `${node.id}: (${String(col)},${String(row)}) is clear and nearer the centre than the spawn`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2. Passing no props is byte-identical to before the option existed
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 the option is opt-in — a caller that asks nothing gets exactly the old answer", () => {
  it("firstWalkableTile without props still lands on the lattice centre of a synthesised grid", () => {
    for (const node of content.nodes) {
      expect(firstWalkableTile(gridOf(node), balance), node.id).toEqual(MID);
    }
  });

  it("an empty props array is the same as no props at all", () => {
    for (const node of PROPPED) {
      const grid = gridOf(node);
      expect(firstWalkableTile(grid, balance, { props: [] }), node.id).toEqual(
        firstWalkableTile(grid, balance),
      );
    }
  });

  it("chooseSpawnTile reports NO insideProp when nobody asked — absent, not a manufactured null", () => {
    const node = PROPPED[0];
    expect(node).toBeDefined();
    if (!node) return;
    const bare = chooseSpawnTile(gridOf(node), balance);
    expect("insideProp" in bare).toBe(false);
    expect(bare).toEqual({ tile: MID, problem: null });
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3. TOTALITY — a map where every walkable tile is covered still yields a tile
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 the rule is a preference and the function stays total", () => {
  /** A grid with exactly one walkable tile, at the lattice centre. */
  function oneTileGrid(): ReturnType<typeof emptyGrid> {
    const dims = gridDimensions(balance);
    const grid = emptyGrid("boxed-in", dims);
    for (let row = 0; row < dims.rows; row += 1) {
      for (let col = 0; col < dims.cols; col += 1) setBlocked(grid, col, row, true);
    }
    // Unblock exactly the cells the centre tile's footprint touches — the range `rectBlocked`
    // itself scans, derived from `worldCellPx` rather than assumed to be one cell.
    const cell = worldCellPx(grid, balance);
    const step = balance.map.tileStepPx;
    const from = { col: Math.floor((MID.col * step) / cell), row: Math.floor((MID.row * step) / cell) };
    const to = {
      col: Math.ceil((MID.col * step + step) / cell) - 1,
      row: Math.ceil((MID.row * step + step) / cell) - 1,
    };
    for (let row = from.row; row <= to.row; row += 1) {
      for (let col = from.col; col <= to.col; col += 1) setBlocked(grid, col, row, false);
    }
    return grid;
  }

  /** A prop sitting exactly on the standing point of tile (32,32), authored in map-native px. */
  function propOnCentre(id: string): PropPlacement {
    const at = standingAt(MID);
    return {
      id,
      kind: "antler-stone",
      x: at.x / balance.map.mapRenderScale,
      y: at.y / balance.map.mapRenderScale,
      interactionRadius: balance.map.propInteractionRadiusDefault,
    };
  }

  it("every walkable tile inside a radius: it returns the tile anyway, and names the prop", () => {
    const grid = oneTileGrid();
    const props = [propOnCentre("only-prop")];
    const only = MID;

    // Precondition: exactly one walkable tile, and it is covered.
    expect(tileWalkable(grid, only.col, only.row, balance)).toBe(true);
    expect(propInReach(props[0]!, standingAt(only), balance)).toBe(true);

    const tile = firstWalkableTile(grid, balance, { props });
    expect(tile, "the preference swallowed the only legal tile").not.toBeNull();
    expect(tile).toEqual(only);

    const spawn = chooseSpawnTile(grid, balance, { props });
    expect(spawn.tile).toEqual(only);
    expect(spawn.problem).toBeNull();
    expect(spawn.insideProp).toBe("only-prop");
  });

  it("the preference never turns a tile into no tile, on any shipped node", () => {
    for (const node of content.nodes) {
      const grid = gridOf(node);
      const bare = firstWalkableTile(grid, balance);
      const preferred = firstWalkableTile(grid, balance, { props: node.props });
      expect(bare, node.id).not.toBeNull();
      expect(preferred, `${node.id}: the preference returned null where the plain spiral did not`)
        .not.toBeNull();
    }
  });

  it("a genuinely solid grid still reports the mask problem, props or no props", () => {
    const dims = gridDimensions(balance);
    const grid = emptyGrid("solid", dims);
    for (let row = 0; row < dims.rows; row += 1) {
      for (let col = 0; col < dims.cols; col += 1) setBlocked(grid, col, row, true);
    }
    expect(firstWalkableTile(grid, balance, { props: [propOnCentre("p")] })).toBeNull();
    const spawn = chooseSpawnTile(grid, balance, { props: [propOnCentre("p")] });
    expect(spawn.problem).toMatch(/NO WALKABLE TILE/);
    expect(spawn.tile).toEqual(MID);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 4. build-doc §7.6 — this did NOT bake props into collision
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 a prop still overlays the map and never blocks it", () => {
  it("the tile the spawn moved OFF is still walkable, and the player may walk onto the prop", () => {
    for (const node of PROPPED) {
      const grid = gridOf(node);
      for (const prop of node.props) {
        // The tile the prop's own anchor sits on: still ground, whatever the spawn rule prefers.
        const col = Math.floor((prop.x * balance.map.mapRenderScale) / balance.map.tileStepPx);
        const row = Math.floor((prop.y * balance.map.mapRenderScale) / balance.map.tileStepPx);
        const tiles = tileGridSize(balance);
        if (col <= 0 || row <= 0 || col >= tiles.cols - 1 || row >= tiles.rows - 1) continue;
        expect(tileWalkable(grid, col, row, balance), `${node.id}/${prop.id}`).toBe(true);
      }
    }
  });

  it("supplying props changes not one blocked cell", () => {
    for (const node of PROPPED) {
      const before = blockedCount(gridOf(node));
      chooseSpawnTile(gridOf(node), balance, { props: node.props });
      expect(blockedCount(gridOf(node)), node.id).toBe(before);
    }
  });

  it("nothing in game/collision.ts turns a prop into geometry", () => {
    // Structural: the module reads props through `propInReach` only — a boolean about a point —
    // and has no way to write one into the bitfield.
    const src = readSource();
    expect(src).not.toMatch(/setBlocked\s*\([^)]*prop/i);
    expect(src).toMatch(/propInReach/);
  });
});

/** Executable source of game/collision.ts, comments stripped — as collision.test.ts reads it. */
function readSource(): string {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  return readFileSync(`${root}game/collision.ts`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
