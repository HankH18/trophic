/**
 * tests/unit/npc-prop-collision.test.ts — a body standing on the map is SOLID, and no body may seal
 * anything off.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 * ═════════════════════════════════════════════════════════════════════════════════════════════════
 * The owner played the deployed build and reported, verbatim: **"the NPCs have no collisions."** He
 * walks straight through fifty people. He then ruled, verbatim: **"props should have collisions
 * too."** `game/npcs.ts` `npcOccupiedTiles`, `game/props.ts` `propOccupiedTiles` and
 * `OverworldScene.canEnter` are that fix; this file is what holds it up.
 *
 * ⚠ THE HARD PART IS NOT "THE CELL IS BLOCKED" — IT IS THAT NOTHING ELSE BROKE.
 * Blocking sixty-seven cells — 46 people and 17 props out on the twelve maps, plus the four authored
 * `@` cells in the rooms — can strand the player or seal something off. An NPC in a doorway, in a
 * corridor or in a one-tile gap makes a door, a shop or a whole region unreachable, and the failure
 * is invisible until somebody walks there. `scatterCandidates` already
 * refuses the spawn tile, every doorway, every edge mouth and every prop's reach — but EXCLUSION IS
 * NOT CONNECTIVITY: two people either side of a one-cell gap close it without either of them
 * standing on anything excluded. So the assertions below are stated over the whole reachable world:
 *
 *     a body may remove ITS OWN CELL from what a walk can reach, and nothing else.
 *
 * ⚠ AND IT IS MEASURED ON THE SHIPPED MASKS, NEVER ON A FIXTURE, for a reason this project has paid
 * for twice. `tests/unit/overworld-scene.test.ts` mounts against a stub that loads no textures, so
 * `buildNodeView` reads a null mask and the town it walks is `synthesiseBorderCollision`'s open
 * rectangle — every cell inside the border standable. Fifteen door tests passed for months on that
 * grid while one door sat in open water (`tests/unit/doorway-threshold.test.ts` §3). Every grid here
 * is `loadCollision` over `assets/final/maps/*-mask.png`, decoded by `tools/postprocess/raster.ts` —
 * the same call `OverworldScene.buildNodeView` makes.
 *
 * ⚠ AND THE INSTRUMENT IS CHECKED BEFORE ANY READING IS BELIEVED (§0). A reader handed a buffer in
 * a shape it does not accept returns a grid with ZERO blocked cells rather than failing, and every
 * question then answers "walkable". That happened, and the answer was reported to another lane as
 * fact. §0 is the control: does this reader see any wall at all, on a town the HUD itself calls
 * 2467 cells blocked?
 *
 * §0 the instrument · §1 the mask is untouched and the body is solid · §2 CONNECTIVITY, per node ·
 * §3 a prop is authored, never moved, and must stay readable · §4 the four rooms ·
 * §5 determinism (G11 / L10) · §6 sabotage — the rule refuses a cell that would seal a corridor
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { DIALOGUE, type DialogueFile } from "@core/dialogue-schema";
import { hashSeed } from "@core/rng";
import {
  INTERIORS,
  interiorsOf,
  planCellsWith,
  planCharAt,
  PLAN_DOOR,
  PLAN_SPEAKER,
  stepFrom,
  type InteriorBlueprint,
} from "@core/interiors";
import { validateContent } from "@core/schemas";
import type { Balance, CollisionGrid, Content, NodeFile } from "@core/types";
import {
  blockedCount,
  chooseSpawnTile,
  gridFromAscii,
  loadCollision,
  reachableTiles,
  tileGridSize,
  tileKey,
  tileWalkable,
  type MaskPixels,
} from "@game/collision";
import { createMovement, movementConfig, spriteWorldPosition } from "@game/movement";
import {
  npcOccupiedTiles,
  npcSpeakersHomedAt,
  scatterCandidates,
  scatteredNpcPlacements,
  solidBodyTiles,
  interiorPlacedSpeakerIds,
  type NpcPlacement,
} from "@game/npcs";
import { propInReach, propOccupiedTiles, propTile } from "@game/props";
import { readRaster } from "../../tools/postprocess/raster";

const content: Content = validateContent();
const balance: Balance = content.balance;
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SIZE = tileGridSize(balance);

/** The shipped PNG as the engine's `MaskPixels` — RGBA, exactly as a texture read hands it over. */
async function shippedPixels(path: string): Promise<MaskPixels> {
  const raster = await readRaster(resolve(ROOT, path));
  return { width: raster.width, height: raster.height, data: raster.data, channels: 4 };
}

interface Loaded {
  node: NodeFile;
  /** The grid the BROWSER plays: the shipped PNG through `buildNodeView`'s own call. */
  grid: CollisionGrid;
  /** Every body on it — people and props together, exactly as `canEnter` reads them. */
  bodies: ReadonlySet<string>;
  people: NpcPlacement[];
  spawn: { col: number; row: number };
  /** Every tile a walk reaches with NOTHING blocked but the mask. */
  bare: ReadonlySet<string>;
  /** Every tile a walk reaches with every body standing. */
  live: ReadonlySet<string>;
}

const LOADED: Loaded[] = await Promise.all(
  content.nodes.map(async (node): Promise<Loaded> => {
    const loaded = loadCollision(node.id, node.collisionMask, await shippedPixels(node.collisionMask), balance);
    expect(loaded.source, `${node.id}: ${loaded.note}`).toBe("authored");
    const grid = loaded.grid;
    const spawn = chooseSpawnTile(grid, balance, { props: node.props }).tile;
    const bodies = solidBodyTiles(node, null, grid, balance);
    return {
      node,
      grid,
      bodies,
      people: scatteredNpcPlacements(node, grid, balance),
      spawn,
      bare: reachableTiles(grid, balance, spawn),
      live: reachableTiles(grid, balance, spawn, bodies),
    };
  }),
);

/** Where a player standing on this tile is, for a reach test — `interact()`'s own point. */
function standingAt(tile: { col: number; row: number }): { x: number; y: number } {
  return spriteWorldPosition(createMovement(tile), movementConfig(balance));
}

/** The tile a map-native coordinate falls in — `OverworldScene.doorTileOf`'s arithmetic. */
function nativeTile(at: { x: number; y: number }): { col: number; row: number } {
  return {
    col: Math.floor((at.x * balance.map.mapRenderScale) / balance.map.tileStepPx),
    row: Math.floor((at.y * balance.map.mapRenderScale) / balance.map.tileStepPx),
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 * §0 the instrument — before any walkability reading is believed
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§0 the grids under test are real geometry, not an all-walkable reader", () => {
  it("every shipped mask decodes to a grid with a plausible number of walls", () => {
    expect(LOADED.length, "no nodes were loaded, so nothing below proves anything").toBe(12);
    for (const { node, grid } of LOADED) {
      const blocked = blockedCount(grid);
      const cells = grid.cols * grid.rows;
      expect(
        blocked,
        `${node.id}: the decoded grid has ZERO blocked cells of ${String(cells)}. That is what a ` +
          `reader handed a buffer shape it does not accept returns — it does not throw, it answers ` +
          `"walkable" to everything, and every assertion in this file would then pass vacuously.`,
      ).toBeGreaterThan(0);
      // Not merely non-zero: a real painted map is substantially walls. Hearthollow's HUD reports
      // 2467 of 4096; the loosest honest floor is "more than a rounding error and not the whole map".
      expect(blocked, `${node.id}: only ${String(blocked)} of ${String(cells)} cells blocked`).toBeGreaterThan(
        cells / 10,
      );
      expect(blocked, `${node.id}: ${String(blocked)} of ${String(cells)} blocked — no floor left`).toBeLessThan(
        cells,
      );
    }
  });

  it("the spawn tile is standable and the walk from it reaches most of the map", () => {
    for (const { node, grid, spawn, bare } of LOADED) {
      expect(tileWalkable(grid, spawn.col, spawn.row, balance), `${node.id}: spawn is in geometry`).toBe(true);
      expect(bare.size, `${node.id}: the walk from spawn reaches ${String(bare.size)} tiles`).toBeGreaterThan(100);
    }
  });

  it("there ARE bodies to be solid — 46 people and 17 props outdoors, 4 more in the rooms", () => {
    const people = LOADED.reduce((n, l) => n + l.people.length, 0);
    const props = LOADED.reduce((n, l) => n + l.node.props.length, 0);
    const indoors = INTERIORS.reduce((n, bp) => n + npcOccupiedTiles(nodeOf(bp.parentNode), bp, gridOf(bp.parentNode), balance).size, 0);
    expect(people, "no people are placed outdoors, so §1–§2 assert nothing").toBeGreaterThan(40);
    expect(props, "no props are placed, so §3 asserts nothing").toBeGreaterThan(10);
    expect(indoors, "no people are placed indoors, so §4 asserts nothing").toBe(4);
  });
});

const gridOf = (id: string): CollisionGrid => (LOADED.find((l) => l.node.id === id) as Loaded).grid;
const nodeOf = (id: string): NodeFile => (LOADED.find((l) => l.node.id === id) as Loaded).node;
const loadedOf = (id: string): Loaded => LOADED.find((l) => l.node.id === id) as Loaded;

/* ════════════════════════════════════════════════════════════════════════════
 * §1 the body is solid — and the mask it stands on is untouched
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 a body blocks its cell, and the collision mask never learns about it", () => {
  it("every scattered person's cell is in the solid overlay", () => {
    for (const { node, people, bodies } of LOADED) {
      for (const p of people) {
        expect(bodies.has(tileKey(p)), `${node.id}: ${p.speakerId} at ${p.col},${p.row} is walked through`).toBe(
          true,
        );
      }
    }
  });

  it("every prop's cell is in the solid overlay — the owner's ruling, one cell per prop", () => {
    for (const { node, bodies } of LOADED) {
      for (const prop of node.props) {
        const at = propTile(prop, balance);
        expect(bodies.has(tileKey(at)), `${node.id}: ${prop.id} at ${at.col},${at.row} is walked through`).toBe(
          true,
        );
      }
    }
  });

  it("a prop occupies ONE cell, never its interaction radius", () => {
    /*
     * Reach and occupancy are different quantities. `interactionRadius` defaults to 48 map-native px
     * = 96 world px = three tiles, so a footprint derived from it would make a sign card a 3×3 wall.
     * The count is the check: one key per prop, and no prop's neighbour is blocked ON ITS ACCOUNT.
     */
    for (const { node } of LOADED) {
      const cells = propOccupiedTiles(node.props, balance);
      expect(cells.size, `${node.id}: props occupy ${String(cells.size)} cells for ${String(node.props.length)} props`).toBe(
        node.props.length,
      );
    }
  });

  it("THE MASK IS UNTOUCHED: every occupied cell is still walkable geometry", () => {
    /*
     * build-doc §7.6 makes collision a property of the PAINTED map. A body is not geometry, and
     * baking one in would make the mask disagree with the picture it was sampled from — and would
     * make `scatterCandidates` feed on its own output, so the cast would drift on every rebuild.
     * This is the assertion that the overlay stayed an overlay.
     */
    for (const { node, grid, bodies } of LOADED) {
      for (const key of bodies) {
        const [col = -1, row = -1] = key.split(",").map(Number);
        expect(
          tileWalkable(grid, col, row, balance),
          `${node.id}: cell ${key} is BLOCKED IN THE MASK — a body has been baked into the geometry`,
        ).toBe(true);
      }
    }
  });

  it("nobody stands on a spawn tile, a doorway, an edge mouth, or inside a prop's reach", () => {
    for (const { node, people, spawn } of LOADED) {
      const doors = interiorsOf(node.id).map((bp) => nativeTile(bp.door));
      const mouths = (node.edgeMouths ?? []).map((m) => nativeTile(m));
      for (const p of people) {
        expect({ col: p.col, row: p.row }, `${node.id}: ${p.speakerId} is on the spawn tile`).not.toEqual(spawn);
        for (const d of doors) {
          expect({ col: p.col, row: p.row }, `${node.id}: ${p.speakerId} is in a doorway`).not.toEqual(d);
        }
        for (const m of mouths) {
          expect({ col: p.col, row: p.row }, `${node.id}: ${p.speakerId} is standing in the way out`).not.toEqual(m);
        }
        for (const prop of node.props) {
          expect(
            propInReach(prop, standingAt(p), balance),
            `${node.id}: ${p.speakerId} is inside ${prop.id}'s reach, where [E] can never answer for them`,
          ).toBe(false);
        }
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 CONNECTIVITY — the acceptance test. Not "the cell is blocked".
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 no body seals anything off, on any shipped node", () => {
  /*
   * ⚠ THIS SECTION IS THE OUTCOME, NOT THE GUARANTEE, AND THE DIFFERENCE IS MEASURED.
   *
   * Re-deriving every placement with the connectivity clause DELETED from
   * `game/npcs.ts` `scatteredNpcPlacements` gives byte-identical cells on all twelve shipped nodes:
   * the hashed cell already seals nothing, every time, so §2 is green with the whole rule removed.
   * That is a fact about today's masks, not evidence about the rule. §6's synthetic corridor is what
   * actually holds the rule up; §2 is what notices if a repaint ever changes the fact.
   */

  /**
   * THE WHOLE CLAIM, AS ONE NUMBER. Blocking every body may cost the walk exactly the body cells it
   * could previously reach, and not one tile more. Stated as a set difference rather than as a list
   * of things to check, so it covers the doors, the edge mouths, the props, the people and every
   * patch of ground nobody has thought to name — including the ones a future repaint invents.
   */
  it.each(LOADED.map((l) => [l.node.id, l] as const))(
    "%s: the reachable world loses the bodies and nothing else",
    (_id, l) => {
      const lostBeyondTheBodies = [...l.bare].filter((k) => !l.live.has(k) && !l.bodies.has(k));
      expect(
        lostBeyondTheBodies,
        `${l.node.id}: standing the bodies up cut ${String(lostBeyondTheBodies.length)} tiles off the ` +
          `map that a walk from the spawn tile could reach before — e.g. ` +
          `${lostBeyondTheBodies.slice(0, 12).join(" · ")}. Some door, exit or corner is now sealed ` +
          `behind somebody. game/npcs.ts scatteredNpcPlacements is meant to refuse a cell that does ` +
          `this; either its move rule failed, or a PROP (which may never be moved — G2) is the cut.`,
      ).toEqual([]);
    },
  );

  it.each(LOADED.map((l) => [l.node.id, l] as const))("%s: every interior door is still reachable", (_id, l) => {
    const doors = interiorsOf(l.node.id);
    for (const bp of doors) {
      const at = nativeTile(bp.door);
      expect(
        l.live.has(tileKey(at)),
        `${l.node.id}: the door of ${bp.id} at ${at.col},${at.row} cannot be walked to with the ` +
          `bodies standing. A shop nobody can enter is the same defect as a door pinned to the ocean.`,
      ).toBe(true);
    }
  });

  it.each(LOADED.map((l) => [l.node.id, l] as const))("%s: every way out of the region is still reachable", (_id, l) => {
    const mouths = l.node.edgeMouths ?? [];
    expect(mouths.length, `${l.node.id} declares no edge mouth`).toBe(l.node.adjacency.length);
    for (const m of mouths) {
      const at = nativeTile(m);
      expect(
        l.live.has(tileKey(at)),
        `${l.node.id}: the edge mouth to ${m.to} at ${at.col},${at.row} cannot be walked to with the ` +
          `bodies standing — the region is a trap.`,
      ).toBe(true);
    }
  });

  it.each(LOADED.map((l) => [l.node.id, l] as const))("%s: every person can still be walked up to", (_id, l) => {
    for (const p of l.people) {
      const canTalkFrom = [...l.live].filter((key) => {
        const [col = -1, row = -1] = key.split(",").map(Number);
        return propInReach(p, standingAt({ col, row }), balance);
      });
      expect(
        canTalkFrom.length,
        `${l.node.id}: ${p.speakerId} at ${p.col},${p.row} — there is no tile the player can reach ` +
          `from which [E] answers for them. A solid person with no approach is a person deleted.`,
      ).toBeGreaterThan(0);
    }
  });

  it("the candidate list is not a rounding error — every node has room to spare", () => {
    for (const { node, grid, people } of LOADED) {
      if (people.length === 0) continue;
      expect(scatterCandidates(node, grid, balance).length, node.id).toBeGreaterThan(people.length * 10);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 a prop is authored — it may never be moved, and it must stay readable
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 the seventeen props: solid, unmoved, and still readable", () => {
  it("a prop's solid cell is the cell its AUTHORED coordinate falls in — nothing has been relocated", () => {
    /*
     * G2. Unlike a person's, a prop's position is authored in `data/nodes/*.json` and may not be
     * nudged: a prop that sealed a corridor would be a finding to report, not a placement to change.
     * So the occupancy is asserted to be a pure restatement of the shipped coordinate.
     */
    for (const { node } of LOADED) {
      for (const prop of node.props) {
        expect(propTile(prop, balance)).toEqual(nativeTile(prop));
      }
    }
  });

  it("every prop is still readable: a reachable cell remains inside its reach", () => {
    /*
     * ⚠ THE ONE THAT MATTERS FOR THE SIGN CARDS. A prop whose own cell is solid is only still a prop
     * if the player can stand somewhere within `interactionRadius` of it and press [E]. Four of the
     * seventeen are `sign-card` props whose entire purpose is to be read. Measured through the two
     * calls `interact()` itself makes — `spriteWorldPosition` then `propInReach` — and NOT argued
     * from the numbers, because the player's standing point has already moved once (`playerSpriteH`
     * 48 → 32) and reach is sensitive to it.
     */
    for (const l of LOADED) {
      for (const prop of l.node.props) {
        const readableFrom = [...l.live].filter((key) => {
          const [col = -1, row = -1] = key.split(",").map(Number);
          return propInReach(prop, standingAt({ col, row }), balance);
        });
        expect(
          readableFrom.length,
          `${l.node.id}: ${prop.id} at ${propTile(prop, balance).col},${propTile(prop, balance).row} can no ` +
            `longer be read from anywhere the player can walk to. Making its cell solid took the prop ` +
            `out of the game.`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("no prop stands on a spawn tile, a doorway or an edge mouth", () => {
    for (const { node, spawn } of LOADED) {
      const doors = interiorsOf(node.id).map((bp) => nativeTile(bp.door));
      const mouths = (node.edgeMouths ?? []).map((m) => nativeTile(m));
      for (const prop of node.props) {
        const at = propTile(prop, balance);
        expect(at, `${node.id}: ${prop.id} stands on the spawn tile`).not.toEqual(spawn);
        for (const d of doors) expect(at, `${node.id}: ${prop.id} stands in a doorway`).not.toEqual(d);
        for (const m of mouths) expect(at, `${node.id}: ${prop.id} stands in the way out`).not.toEqual(m);
      }
    }
  });

  it("the spawn search never puts the player inside a prop", () => {
    for (const { node, grid } of LOADED) {
      const spawn = chooseSpawnTile(grid, balance, { props: node.props }).tile;
      expect(
        propOccupiedTiles(node.props, balance).has(tileKey(spawn)),
        `${node.id}: the player is put down standing inside ${String(node.props.length)} solid props`,
      ).toBe(false);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4 the four rooms — small, and far likelier to seal something
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 indoors: the plan's `@` cell is occupied in fact, and the room still works", () => {
  const roomGrid = (bp: InteriorBlueprint): CollisionGrid =>
    gridFromAscii(bp.id, bp.plan, balance.map.collisionCellPx);

  it.each(INTERIORS.map((bp) => [bp.id, bp] as const))(
    "%s: the person stands on the plan's own `@`, and the PLAN still calls it floor",
    (_id, bp) => {
      const cells = npcOccupiedTiles(nodeOf(bp.parentNode), bp, roomGrid(bp), balance);
      expect(cells.size, `${bp.id} places nobody`).toBe(1);
      for (const key of cells) {
        const [col = -1, row = -1] = key.split(",").map(Number);
        expect(
          planCharAt(bp.plan, col, row),
          `${bp.id}: the body at ${key} is not standing on the plan's speaker cell`,
        ).toBe(PLAN_SPEAKER);
        // The parser's reading is unchanged — this is the `_legend`'s own sentence, asserted:
        // "the collision parser treats this cell as walkable floor; it is occupied in fact".
        expect(tileWalkable(roomGrid(bp), col, row, balance), `${bp.id}: "@" was baked into the plan grid`).toBe(
          true,
        );
      }
    },
  );

  it.each(INTERIORS.map((bp) => [bp.id, bp] as const))(
    "%s: standing the person up seals nothing in the room",
    (_id, bp) => {
      const grid = roomGrid(bp);
      const bodies = npcOccupiedTiles(nodeOf(bp.parentNode), bp, grid, balance);
      const start = { col: bp.arrival.col, row: bp.arrival.row };
      const bare = reachableTiles(grid, balance, start);
      const live = reachableTiles(grid, balance, start, bodies);
      const lost = [...bare].filter((k) => !live.has(k) && !bodies.has(k));
      expect(
        lost,
        `${bp.id}: the person standing up cut ${String(lost.length)} floor cells off the arrival tile — ` +
          `${lost.join(" · ")}. An authored @ cell may NOT be moved (G2); if this fires, the plan ` +
          `itself is what has to change, and that is the owner's call.`,
      ).toEqual([]);
    },
  );

  it.each(INTERIORS.map((bp) => [bp.id, bp] as const))(
    "%s: every anchor with something to say is still standable, and the way out still is",
    (_id, bp) => {
      const grid = roomGrid(bp);
      const bodies = npcOccupiedTiles(nodeOf(bp.parentNode), bp, grid, balance);
      const live = reachableTiles(grid, balance, { col: bp.arrival.col, row: bp.arrival.row }, bodies);
      /*
       * ⚠ THE ONE THAT PROVES NO AUTHORED CONTENT WAS LOST. `interactIndoors` matches an anchor on
       * the player's EXACT tile, so blocking the `@` cell removes a route to whatever that anchor
       * plays — unless the same entry is reachable another way, which it is: `interiorEntryId`
       * resolves a speaker anchor THROUGH the service anchor that faces it, so `@` and its `S` cell
       * name the same entry, and `S` is untouched. Asserted per room rather than argued: every
       * SERVICE anchor is still standable, and each faces the speaker (or a counter) beside it.
       */
      for (const anchor of bp.anchors) {
        if (anchor.kind !== "service") continue;
        expect(
          live.has(tileKey(anchor)),
          `${bp.id}: the service tile ${anchor.id} at ${anchor.col},${anchor.row} cannot be reached ` +
            `with ${bp.name}'s keeper standing on their own cell — the shop or the inn is shut.`,
        ).toBe(true);
      }
      /*
       * …AND THE DICHOTOMY ITSELF, which the paragraph above used to only assert in prose.
       * `interiorEntryId` resolves a SPEAKER anchor by finding the service anchor whose `faces` step
       * lands on it. So for every `@` cell exactly one of two things is true, and both are safe:
       *   (a) a service anchor faces it — the same entry is reachable by standing on that service
       *       tile, which the loop above has just proved reachable; or
       *   (b) nothing faces it — `interiorEntryId` already returned null there, so standing on the
       *       person said "nothing to say" before this change and says it after.
       * `brackwater-supply` is case (b): its shop faces a trestle, not Hild.
       */
      for (const anchor of bp.anchors) {
        if (anchor.kind !== "speaker") continue;
        const facedBy = bp.anchors.filter((other) => {
          if (other.kind !== "service") return false;
          const faced = stepFrom({ col: other.col, row: other.row }, other.faces);
          return faced.col === anchor.col && faced.row === anchor.row;
        });
        expect(
          facedBy.length,
          `${bp.id}: ${String(facedBy.length)} service anchors face the speaker cell ${anchor.col},` +
            `${anchor.row}. Blocking an "@" is only free while its entry is reachable from a service ` +
            `tile (one facer) or was never reachable at all (none) — two facers means two entries ` +
            `resolve from one cell and one of them has just been taken out of the game.`,
        ).toBeLessThanOrEqual(1);
        for (const other of facedBy) {
          expect(live.has(tileKey(other)), `${bp.id}: ${other.id} faces the keeper but is unreachable`).toBe(true);
        }
      }
      // …and the way back out to the town. `core/interiors.ts` refuses any plan without exactly one
      // `D`, so `planCellsWith` returning a single cell is the shipped guarantee, not an assumption.
      const doors = planCellsWith(bp.plan, PLAN_DOOR);
      expect(doors.length, `${bp.id} does not draw exactly one doorway`).toBe(1);
      expect(
        live.has(tileKey(doors[0] as { col: number; row: number })),
        `${bp.id}: the doorway out is sealed behind the person standing in the room`,
      ).toBe(true);
    },
  );

  it("the town's cast is not carried into its rooms, and the room's is not scattered outside", () => {
    for (const bp of INTERIORS) {
      const indoors = interiorPlacedSpeakerIds(bp.parentNode);
      const outdoors = loadedOf(bp.parentNode).people.map((p) => p.speakerId);
      for (const id of indoors) expect(outdoors, `${id} is solid in two places at once`).not.toContain(id);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §5 determinism — G11 / L10
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§5 the same inputs give the same solid world", () => {
  it("building the overlay twice gives the identical set", () => {
    for (const { node, grid } of LOADED) {
      const a = [...solidBodyTiles(node, null, grid, balance)].sort();
      const b = [...solidBodyTiles(node, null, grid, balance)].sort();
      expect(b, node.id).toEqual(a);
    }
  });

  it("the connectivity rule did not smuggle in a clock, a counter or a roll", () => {
    /*
     * The rule walks the band and floods the map; if any of that consulted anything but shipped data
     * the two builds above could still agree by luck within one process. This is the source check
     * that backs them.
     *
     * ⚠ COMMENTS STRIPPED FIRST, and `tests/unit/npcs.test.ts` learnt this the same way: both
     * modules STATE the rule they obey in their own headers ("NO `Math.random`, anywhere, ever"), so
     * a naive substring search finds the forbidden token inside the very prose forbidding it and the
     * assertion inverts.
     */
    for (const rel of ["game/npcs.ts", "game/props.ts", "game/collision.ts"]) {
      const code = codeOf(rel);
      // The title says "a clock, a counter or a roll", so all three are asked for rather than the
      // one that is easy to grep. A module reading the wall clock would place people differently on
      // two runs of the same save, which the byte-identity check above cannot see within one process.
      for (const forbidden of ["Math.random", "Date.now", "performance.now", "new Date"]) {
        expect(code, `${rel} reaches for ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

/** A module with its comment lines removed — see the assertion above for why that is required. */
function codeOf(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\*|\/\*|\/\/)/.test(line))
    .join("\n");
}

/* ════════════════════════════════════════════════════════════════════════════
 * §6 SABOTAGE — does the rule actually refuse a cell that would seal a corridor?
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§6 the move rule is load-bearing, not decorative", () => {
  /**
   * A map whose entire walkable world is a ONE-CELL-WIDE DEAD-END CORRIDOR running east from the
   * spawn tile.
   *
   * ⚠ THIS FIXTURE IS SHAPED SO THAT EXACTLY ONE CELL IS ADMISSIBLE, and the first version of this
   * section was not — that is why it is written this way and the note is worth more than the code.
   * The first attempt was two rooms joined by one cell on an otherwise open 64×64 map: perfectly
   * valid as a chokepoint, and completely undiscriminating as a test, because the hashed cell falls
   * on one of ~3800 candidates and misses the chokepoint whatever the rule does. Deleting the
   * connectivity clause from `game/npcs.ts` left it GREEN. A sabotage that cannot fail is not a
   * sabotage.
   *
   * In a 1-wide corridor every cell except the FAR END is a cut vertex: standing on any of them
   * severs everything beyond from the spawn tile. So there is exactly one cell the rule may choose,
   * it is not the one the hash names, and no amount of luck can reach it by accident.
   */
  const CORRIDOR_ROW = 32;
  const CORRIDOR_FROM = 32; // the spawn tile — `chooseSpawnTile` spirals from the lattice centre
  const CORRIDOR_TO = 45;

  function corridorNode(): { node: NodeFile; grid: CollisionGrid; farEnd: { col: number; row: number } } {
    const rows: string[] = [];
    for (let row = 0; row < SIZE.rows; row += 1) {
      if (row !== CORRIDOR_ROW) {
        rows.push("#".repeat(SIZE.cols));
        continue;
      }
      const line = Array.from({ length: SIZE.cols }, (_v, col) =>
        col >= CORRIDOR_FROM && col <= CORRIDOR_TO ? "." : "#",
      );
      rows.push(line.join(""));
    }
    const grid = gridFromAscii("corridor", rows.join("\n"), balance.map.collisionCellPx);
    const node: NodeFile = { ...(nodeOf("r1") as NodeFile), id: "corridor", props: [], edgeMouths: [], adjacency: [] };
    return { node, grid, farEnd: { col: CORRIDOR_TO, row: CORRIDOR_ROW } };
  }

  /** One speaker, homed at the sabotage node, so exactly one cell gets chosen. */
  function oneSpeakerAt(nodeId: string): DialogueFile {
    const donor = npcSpeakersHomedAt("r1", DIALOGUE)[0];
    expect(donor, "r1 homes no npc-static speaker, so this section cannot be built").toBeDefined();
    return { ...DIALOGUE, speakers: [{ ...(donor as (typeof DIALOGUE.speakers)[number]), home: nodeId }] };
  }

  it("the fixture really is a corridor: the spawn is at one end and every cell but the far one is a cut", () => {
    // THE CONTROL. Without it this section could pass by testing a map with no chokepoint at all.
    const { node, grid, farEnd } = corridorNode();
    const spawn = chooseSpawnTile(grid, balance, { props: node.props }).tile;
    expect(spawn, "the spawn is not at the head of the corridor").toEqual({ col: CORRIDOR_FROM, row: CORRIDOR_ROW });
    const bare = reachableTiles(grid, balance, spawn);
    expect(bare.size, "the corridor is not the whole walkable world").toBe(CORRIDOR_TO - CORRIDOR_FROM + 1);

    const candidates = scatterCandidates(node, grid, balance);
    expect(candidates.length, "the corridor offers no cells to stand on").toBe(CORRIDOR_TO - CORRIDOR_FROM);
    const admissible = candidates.filter(
      (at) => reachableTiles(grid, balance, spawn, new Set([tileKey(at)])).size === bare.size - 1,
    );
    expect(admissible, "more than one cell is admissible, so the assertion below is not decisive").toEqual([farEnd]);
  });

  it("SABOTAGE: the hash names a cell that would sever the corridor, and the rule refuses it", () => {
    const { node, grid, farEnd } = corridorNode();
    const file = oneSpeakerAt("corridor");
    const candidates = scatterCandidates(node, grid, balance);

    // What the hash alone would pick — step 2 of the rule, re-derived from outside the module. This
    // is the cell a build with the connectivity clause deleted lands on, and it severs the corridor.
    const speaker = npcSpeakersHomedAt("corridor", file)[0];
    const hashed = candidates[hashSeed(0, (speaker as { id: string }).id) % candidates.length];
    expect(hashed, "the band arithmetic changed and this section no longer models it").toBeDefined();
    expect(
      hashed,
      "the hash happens to name the one admissible cell, so this sabotage would pass without the rule",
    ).not.toEqual(farEnd);

    const placed = scatteredNpcPlacements(node, grid, balance, file);
    expect(placed.length, "the sabotage node placed nobody, so this proves nothing").toBe(1);
    const at = placed[0] as NpcPlacement;
    expect(
      { col: at.col, row: at.row },
      `${at.speakerId} was placed at ${at.col},${at.row}, which severs the corridor. The only cell a ` +
        `body may stand on here is the far end ${farEnd.col},${farEnd.row}; the move rule in ` +
        `game/npcs.ts scatteredNpcPlacements did not fire.`,
    ).toEqual(farEnd);
  });

  it("SABOTAGE: a person placed in a doorway is caught by §2's own assertion", () => {
    /*
     * §2's claim is that no body seals anything. This drives the ASSERTION rather than the placement
     * rule: take a shipped town, stand somebody on its door tile by hand, and confirm the door
     * reachability check goes red. Without this, §2 could be green because it never fails.
     */
    const l = loadedOf("hearthollow");
    const bp = interiorsOf("hearthollow")[0] as InteriorBlueprint;
    const door = nativeTile(bp.door);
    const sabotaged = new Set([...l.bodies, tileKey(door)]);
    const live = reachableTiles(l.grid, balance, l.spawn, sabotaged);
    expect(
      live.has(tileKey(door)),
      "standing a body ON the door tile left the door reachable — §2's door check cannot fail",
    ).toBe(false);
  });

  it("SABOTAGE: a prop cell that is walked through is caught by §1's own assertion", () => {
    const l = loadedOf("r1");
    const prop = l.node.props[0];
    expect(prop, "r1 ships no prop").toBeDefined();
    const withoutProps = npcOccupiedTiles(l.node, null, l.grid, balance);
    expect(
      withoutProps.has(tileKey(propTile(prop as (typeof l.node.props)[number], balance))),
      "the people-only overlay already contains the prop cell, so §1's prop check proves nothing",
    ).toBe(false);
    expect(l.bodies.has(tileKey(propTile(prop as (typeof l.node.props)[number], balance)))).toBe(true);
  });
});
