/**
 * tests/unit/doorway-threshold.test.ts — a shipped door is a threshold ON A BUILDING, standing on
 * the cell the map itself declares, in the collision mask the browser actually plays.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 * ═════════════════════════════════════════════════════════════════════════════════════════════════
 * The owner played the deployed build and reported, verbatim: **"none of the doors work."** He walks
 * up to a building and cannot get in. Meanwhile fifteen door tests in
 * `tests/unit/overworld-scene.test.ts` were green, and the step machinery in `game/movement.ts` was
 * measured innocent (§4 below).
 *
 * The green was evidence of the wrong thing. `tests/unit/overworld-scene.test.ts` says so in its own
 * words, at its §15 header: *"The stub loads no textures, so `buildNodeView` reads a null mask and
 * the grid the scene walks is `synthesiseBorderCollision`'s"* — an open rectangle, walkable
 * everywhere but its one-cell border — and its `goInside` helper repeats it: *"the synthesised town
 * grid is open everywhere but its border."* So every one of those tests teleports the player one
 * tile back from `doorTileOf(bp)` and steps them onto it across ground that is walkable BECAUSE
 * NOTHING WAS LOADED. Any coordinate whatever passes. The door tests could not have failed if the
 * door had been pinned to the middle of the ocean — and one of them very nearly is.
 *
 * Measured against the shipped masks in `assets/final/maps/`, on the current data:
 *
 *   hearthollow-inn      tile (18,24)   standable, but the nearest building is 3 tiles north
 *   hearthollow-supply   tile (44,23)   standable, and 30 rows from the supply shop it names
 *   brackwater-inn       tile (18,23)   BLOCKED — open water. Unstandable, unreachable, at any fps
 *   brackwater-supply    tile (18,37)   standable, no building on any side
 *
 * All four `data/interiors/*.json` `door` blocks still carry the placeholder they were authored
 * with, and each says so in its own `_note`: *"PROVISIONAL PLACEMENT … The door x/y above is
 * provisional and must be re-pinned against the painted map."* It never was. Meanwhile the painted
 * map has known exactly where its doors are the whole time: `tools/mapgen/layouts/*.txt` — the file
 * that stamps BOTH the painting and the mask — writes a `D` door-anchor cell for every building,
 * legend entry `door-anchor`, *"the walkable cell a building is entered from"*, and names the
 * building each one belongs to in its own header. Hearthollow's says outright: *"Every door is on
 * the building's SOUTH face and every one of them is the end of a lane."*
 *
 * So the assertions below are made against the two shipped artefacts and never against a fixture:
 * the layout that IS the map, and the mask PNG decoded through `loadCollision` — the same call
 * `OverworldScene.buildNodeView` makes. What a test can reach through a null pointer is exactly what
 * the last one certified.
 *
 * ⚠ NOTHING HERE TESTS THE STEP MACHINE'S RULES; `tests/unit/skip-walk.test.ts` and
 * `tests/unit/collision.test.ts` own those. §4 drives the machine only to KILL a hypothesis about
 * it, and it is the one section expected to be green.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { validateContent } from "../../core/schemas";
import { findLayoutGrid } from "../../core/foodweb";
import { INTERIORS, type InteriorBlueprint } from "../../core/interiors";
import type { Balance, CollisionGrid, NodeFile } from "../../core/types";
import { DEFAULT_LEGEND } from "../../tools/mapgen/legend";
import { readRaster } from "../../tools/postprocess/raster";
import {
  chooseSpawnTile,
  isBlocked,
  loadCollision,
  tileGridSize,
  tileWalkable,
  type MaskPixels,
} from "../../game/collision";
import {
  chooseDirection,
  createMovement,
  delta,
  movementConfig,
  newlyPressed,
  queueInput,
  update as updateMovement,
  type Direction,
  type TilePosition,
} from "../../game/movement";

const content = validateContent();
const balance: Balance = content.balance;
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The legend's door-anchor character, looked up rather than typed, so a renamed char follows. */
const DOOR_CHARS: ReadonlySet<string> = new Set(
  DEFAULT_LEGEND.filter((e) => e.kind === "door-anchor").map((e) => e.char),
);

/**
 * A compass facing as a walk direction. Two vocabularies for one lattice: `InteriorDoor.facing` is
 * written in compass words and `game/movement.ts` moves in `up/down/left/right`. Joined here rather
 * than restated as deltas, so the door's arithmetic is the movement module's own.
 */
const AS_DIRECTION: Readonly<Record<string, Direction>> = {
  north: "up",
  south: "down",
  east: "right",
  west: "left",
};

/** The tile a door's blueprint puts it on — `OverworldScene.doorTileOf`'s arithmetic, restated. */
function doorTile(bp: InteriorBlueprint): TilePosition {
  const step = balance.map.tileStepPx;
  return {
    col: Math.floor((bp.door.x * balance.map.mapRenderScale) / step),
    row: Math.floor((bp.door.y * balance.map.mapRenderScale) / step),
  };
}

/**
 * The cell a door's threshold BACKS ONTO — the building it belongs to.
 *
 * A door that faces south is cut into a building's south wall: you approach from the south and the
 * mass is to the north. So the building side is one step AGAINST the facing.
 */
function buildingSideOf(bp: InteriorBlueprint): TilePosition {
  const dir = AS_DIRECTION[bp.door.facing];
  expect(dir, `${bp.id}: door.facing "${bp.door.facing}" is not a compass point`).toBeDefined();
  const d = delta(dir as Direction);
  const at = doorTile(bp);
  return { col: at.col - d.dCol, row: at.row - d.dRow };
}

/** The layout's grid rows, isolated the way the GAME isolates them (`core/foodweb.ts`). */
function layoutRows(nodeId: string): string[] {
  const text = readFileSync(resolve(ROOT, `tools/mapgen/layouts/${nodeId}.txt`), "utf8");
  const parse = findLayoutGrid(text, balance.map.collisionCols);
  expect(parse.ambiguous, `${nodeId}: two runs tie for the grid — the layout is ambiguous`).toBe(false);
  expect(parse.rows.length, `${nodeId}: the layout has no grid`).toBe(balance.map.collisionRows);
  return parse.rows;
}

/** Every door-anchor cell the layout declares, as movement tiles. */
function declaredDoorTiles(nodeId: string): TilePosition[] {
  const out: TilePosition[] = [];
  const rows = layoutRows(nodeId);
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r] as string;
    for (let c = 0; c < row.length; c += 1) {
      if (!DOOR_CHARS.has(row[c] as string)) continue;
      // The cell's CENTRE through the same two conversions the scene uses, so a retune of
      // `collisionCellPx`, `mapRenderScale` or `tileStepPx` moves both readings together (G11).
      const nativeX = c * balance.map.collisionCellPx + balance.map.collisionCellPx / 2;
      const nativeY = r * balance.map.collisionCellPx + balance.map.collisionCellPx / 2;
      out.push({
        col: Math.floor((nativeX * balance.map.mapRenderScale) / balance.map.tileStepPx),
        row: Math.floor((nativeY * balance.map.mapRenderScale) / balance.map.tileStepPx),
      });
    }
  }
  return out;
}

/** The PNG on disk as the engine's `MaskPixels` — RGBA, exactly as a texture read hands it over. */
async function shippedPixels(path: string): Promise<MaskPixels> {
  const raster = await readRaster(resolve(ROOT, path));
  return { width: raster.width, height: raster.height, data: raster.data, channels: 4 };
}

interface TownGeometry {
  node: NodeFile;
  /** The grid the BROWSER plays: the shipped PNG through `buildNodeView`'s own call. */
  authored: CollisionGrid;
  /** The grid the scene TEST harness plays: `pixels: null`, so the synthesised open rectangle. */
  synthesised: CollisionGrid;
  /** Every tile a walk from the spawn tile can reach on the authored grid. */
  reachable: ReadonlySet<string>;
}

const TOWN_IDS = [...new Set(INTERIORS.map((bp) => bp.parentNode))].sort();

const TOWNS = new Map<string, TownGeometry>(
  await Promise.all(
    TOWN_IDS.map(async (id): Promise<[string, TownGeometry]> => {
      const node = content.nodes.find((n) => n.id === id);
      expect(node, `${id} is a parentNode of a shipped interior but not a shipped node`).toBeDefined();
      const real = node as NodeFile;
      // The line `OverworldScene.buildNodeView` runs, with no options, so the sampler falls to its
      // shipped defaults (`dark-blocks`, `majority`).
      const authored = loadCollision(id, real.collisionMask, await shippedPixels(real.collisionMask), balance);
      expect(authored.source, `${id}: ${authored.note}`).toBe("authored");
      const synthesised = loadCollision(id, real.collisionMask, null, balance).grid;
      return [id, { node: real, authored: authored.grid, synthesised, reachable: walkFrom(authored.grid, real) }];
    }),
  ),
);

/**
 * Every tile a WALK can reach from where the scene puts the player down.
 *
 * Flood fill over `tileWalkable`, four-connected — the only moves `game/movement.ts` can make. The
 * start is `chooseSpawnTile` with the node's props, which is the call `OverworldScene` itself makes,
 * so an island of standable ground the player is never on the right side of counts as unreachable
 * here exactly as it is unreachable there.
 */
function walkFrom(grid: CollisionGrid, node: NodeFile): ReadonlySet<string> {
  const size = tileGridSize(balance);
  const start = chooseSpawnTile(grid, balance, { props: node.props }).tile;
  const seen = new Set<string>([`${start.col},${start.row}`]);
  const queue: TilePosition[] = [start];
  while (queue.length > 0) {
    const at = queue.shift() as TilePosition;
    for (const dir of ["up", "down", "left", "right"] as const) {
      const d = delta(dir);
      const next = { col: at.col + d.dCol, row: at.row + d.dRow };
      const key = `${next.col},${next.row}`;
      if (seen.has(key)) continue;
      if (next.col < 0 || next.row < 0 || next.col >= size.cols || next.row >= size.rows) continue;
      if (!tileWalkable(grid, next.col, next.row, balance)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return seen;
}

/**
 * The FIRST step of a four-connected route from `start` to `target`, or null if none exists.
 *
 * Breadth-first, so it is the shortest one, and it is FOUND rather than written down — a hand-typed
 * route would have to be re-typed every time the map is repainted, which is the kind of maintenance
 * that ends with a test being deleted.
 *
 * ⚠ ONE STEP AT A TIME, RE-ASKED AT EVERY LANDING, and that is not laziness. `game/movement.ts`
 * `update` starts the NEXT step inside the same frame the previous one lands, out of the buffer
 * `queueInput` filled before the frame — that is what makes a held key walk continuously. A driver
 * that pressed a pre-computed list of directions and advanced its index per landing would therefore
 * repeat the old direction one step past every corner and walk somewhere else. Re-planning from the
 * step's DESTINATION (`state.step.to`, which is `chooseDirection`'s own origin for a buffered
 * direction) is what a player does with their eyes and what keeps the two in step.
 */
function firstStepTo(town: TownGeometry, start: TilePosition, target: TilePosition): Direction | null {
  if (start.col === target.col && start.row === target.row) return null;
  const size = tileGridSize(balance);
  const from = new Map<string, { at: TilePosition; dir: Direction }>();
  const seen = new Set<string>([`${start.col},${start.row}`]);
  const queue: TilePosition[] = [start];
  while (queue.length > 0) {
    const at = queue.shift() as TilePosition;
    if (at.col === target.col && at.row === target.row) break;
    for (const dir of ["up", "down", "left", "right"] as const) {
      const d = delta(dir);
      const next = { col: at.col + d.dCol, row: at.row + d.dRow };
      const key = `${next.col},${next.row}`;
      if (seen.has(key)) continue;
      if (next.col < 0 || next.row < 0 || next.col >= size.cols || next.row >= size.rows) continue;
      if (!tileWalkable(town.authored, next.col, next.row, balance)) continue;
      seen.add(key);
      from.set(key, { at, dir });
      queue.push(next);
    }
  }
  if (!seen.has(`${target.col},${target.row}`)) return null;
  let cursor = target;
  let first: Direction | null = null;
  while (!(cursor.col === start.col && cursor.row === start.row)) {
    const step = from.get(`${cursor.col},${cursor.row}`);
    if (step === undefined) return null;
    first = step.dir;
    cursor = step.at;
  }
  return first;
}

const ROOM_IDS = INTERIORS.map((bp) => bp.id);
const roomById = new Map(INTERIORS.map((bp) => [bp.id, bp]));
const townOf = (bp: InteriorBlueprint): TownGeometry => TOWNS.get(bp.parentNode) as TownGeometry;

/* ════════════════════════════════════════════════════════════════════════════
 * §1 the door stands on the cell the map itself declares
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 every shipped door is pinned to its map's own door anchor", () => {
  it("the scope is every shipped interior, and every town that has one ships a layout", () => {
    expect(ROOM_IDS.length, "no interiors are shipped, so this file proves nothing").toBeGreaterThan(0);
    for (const id of TOWN_IDS) expect(declaredDoorTiles(id).length, `${id} declares no door anchor`).toBeGreaterThan(0);
  });

  /**
   * DERIVED, NOT ENUMERATED (G2). The expected set is every `D` the town's layout draws — the file
   * that stamps the painting and the mask from one document — so this cannot be satisfied by editing
   * a list here. It does not assert WHICH building a room belongs to, only that the coordinate is a
   * door of that town at all; the layout headers name the buildings, and that mapping is the owner's
   * to confirm, not a test's to invent.
   */
  it.each(ROOM_IDS)("%s: its door.x/y lands on a door anchor the layout draws", (id) => {
    const bp = roomById.get(id) as InteriorBlueprint;
    const at = doorTile(bp);
    const declared = declaredDoorTiles(bp.parentNode);
    expect(
      declared.some((d) => d.col === at.col && d.row === at.row),
      `${id}: data/interiors/${id}.json puts the door at native (${bp.door.x},${bp.door.y}) = tile ` +
        `${at.col},${at.row}, which is not a door of ${bp.parentNode}. The layout draws its doors at ` +
        `${declared.map((d) => `${d.col},${d.row}`).join(" · ")} — re-pin door.x/y onto one of those ` +
        `(a cell's centre is native (${balance.map.collisionCellPx}·col + ` +
        `${balance.map.collisionCellPx / 2}, ${balance.map.collisionCellPx}·row + ` +
        `${balance.map.collisionCellPx / 2})).`,
    ).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 …and it is a threshold the player can walk onto, in the SHIPPED mask
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 the door tile, in the collision mask the browser plays", () => {
  it.each(ROOM_IDS)("%s: the player can stand on it", (id) => {
    const bp = roomById.get(id) as InteriorBlueprint;
    const at = doorTile(bp);
    expect(
      tileWalkable(townOf(bp).authored, at.col, at.row, balance),
      `${id}: tile ${at.col},${at.row} is BLOCKED in ${townOf(bp).node.collisionMask}. ` +
        `OverworldScene.enterThroughDoorway only fires on a step that LANDS on the door tile, and ` +
        `game/movement.ts refuses to start a step into a blocked tile — so this door can never be ` +
        `entered, at any frame rate, on any machine.`,
    ).toBe(true);
  });

  it.each(ROOM_IDS)("%s: a walk from the spawn tile reaches it", (id) => {
    const bp = roomById.get(id) as InteriorBlueprint;
    const at = doorTile(bp);
    expect(
      townOf(bp).reachable.has(`${at.col},${at.row}`),
      `${id}: tile ${at.col},${at.row} is not four-connected to the tile the scene spawns the ` +
        `player on. Standable ground the player cannot walk to is a door that does not work.`,
    ).toBe(true);
  });

  /**
   * THE ONE THAT CATCHES A DOOR IN A FIELD. A threshold is cut into a building; the mass is on the
   * far side of it. Without this clause every assertion above is satisfied by a patch of open grass,
   * which is exactly what three of the four shipped doors were: standable, reachable, and nowhere
   * near the building whose name they carry. The player walks to the painted door, bumps the wall,
   * and reports that none of the doors work — because on his screen none of them do.
   */
  it.each(ROOM_IDS)("%s: the building it opens into is on the other side of it", (id) => {
    const bp = roomById.get(id) as InteriorBlueprint;
    const at = doorTile(bp);
    const behind = buildingSideOf(bp);
    expect(
      isBlocked(townOf(bp).authored, behind.col, behind.row),
      `${id}: the door at tile ${at.col},${at.row} faces ${bp.door.facing}, so ${behind.col},` +
        `${behind.row} should be the building it lets you into — and that cell is WALKABLE in ` +
        `${townOf(bp).node.collisionMask}. This door is a patch of open ground with a room behind ` +
        `nothing. Nothing on screen marks it and nothing stops the player walking through where the ` +
        `building is painted.`,
    ).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 why the fifteen green door tests could not see any of it
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 the geometry the scene test harness plays on is not the geometry the browser plays on", () => {
  /**
   * This one is expected to stay green FOREVER, including after the doors are re-pinned. It is not a
   * regression guard; it is the standing statement of a blind spot, kept next to the assertions it
   * explains. `tests/unit/overworld-scene.test.ts` mounts the scene against a stub that loads no
   * textures, so `readMaskPixelsSafe` hands `loadCollision` a null and the town it walks is
   * `synthesiseBorderCollision`'s open rectangle. On that grid EVERY coordinate inside the border is
   * standable, so no door coordinate can fail there — which is why "15 door tests pass" and "none of
   * the doors work" were both true at once.
   */
  it("the synthesised grid marks every shipped door tile standable, whatever the mask says", () => {
    const disagreements: string[] = [];
    for (const bp of INTERIORS) {
      const at = doorTile(bp);
      const town = townOf(bp);
      expect(
        tileWalkable(town.synthesised, at.col, at.row, balance),
        `${bp.id}: even the synthesised grid blocks ${at.col},${at.row} — it is outside the map`,
      ).toBe(true);
      if (!tileWalkable(town.authored, at.col, at.row, balance)) disagreements.push(bp.id);
    }
    // Recorded, not asserted either way: after the re-pin this list is empty and the point of the
    // test is unchanged — the harness would have said "standable" for all four regardless.
    expect(Array.isArray(disagreements)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4 the held-key hypothesis, killed by measurement
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * `OverworldScene.enterThroughDoorway` reads `this.movement.tile` rather than the event's own tile,
 * and its comment concedes the cost: *"a frame long enough to land two steps can walk OVER a
 * threshold without going in."* A player crossing town holds a direction down, so if a held key
 * skated over thresholds it would produce "none of the doors work" exactly.
 *
 * It does not. What follows drives `game/movement.ts` through the scene's own per-frame shape —
 * `chooseDirection` → `queueInput` → `update` → replay the events, reading `movement.tile` on each
 * `stepCompleted` the way the scene does — over open ground, and measures where the skip begins.
 */

const cfg = movementConfig(balance);
const OPEN = (): boolean => true;

/** One frame of `OverworldScene.update`'s movement half, including the door question it asks. */
function frame(
  state: ReturnType<typeof createMovement>,
  held: ReadonlySet<Direction>,
  heldLastFrame: ReadonlySet<Direction>,
  dtMs: number,
  door: TilePosition,
): { state: ReturnType<typeof createMovement>; landed: TilePosition[]; entered: boolean } {
  const fresh = newlyPressed(held, heldLastFrame);
  let next = queueInput(state, chooseDirection(held, state, OPEN, fresh));
  const result = updateMovement(next, dtMs, OPEN, cfg);
  next = result.state;
  const landed: TilePosition[] = [];
  let entered = false;
  for (const event of result.events) {
    if (event.t !== "stepCompleted") continue;
    landed.push(event.tile);
    // `enterThroughDoorway` asks `doorwayAt(this.movement.tile)` — the FIELD, already advanced to
    // the frame's last landing, not the event's own tile. Reproduced deliberately.
    if (next.tile.col === door.col && next.tile.row === door.row) entered = true;
  }
  return { state: next, landed, entered };
}

/** Walk `tiles` steps right from the origin at `dtMs` a frame, with the key held the whole way. */
function holdWalk(dtMs: number, tiles: number, door: TilePosition): { landed: TilePosition[]; entered: boolean } {
  let state = createMovement({ col: 0, row: 0 }, "right");
  const held = new Set<Direction>(["right"]);
  let last = new Set<Direction>();
  const landed: TilePosition[] = [];
  let entered = false;
  // A generous frame budget: enough frames to walk `tiles` even at one step per frame.
  const frames = Math.ceil((tiles * Math.max(1, balance.map.walkMsPerTile)) / dtMs) + tiles + 4;
  for (let i = 0; i < frames && landed.length < tiles; i += 1) {
    const out = frame(state, held, last, dtMs, door);
    state = out.state;
    last = new Set(held);
    landed.push(...out.landed);
    entered ||= out.entered;
  }
  return { landed, entered };
}

describe("§4 a held direction does not skate over a threshold at any playable frame rate", () => {
  /** 60fps, the rate build-doc §12 budgets for. */
  const SIXTY_FPS_MS = 1000 / 60;

  it("at 60fps a held key lands on every tile it crosses, threshold included", () => {
    const door = { col: 5, row: 0 };
    const walk = holdWalk(SIXTY_FPS_MS, 10, door);
    expect(
      walk.landed.map((t) => t.col),
      "a held key skipped a tile at 60fps",
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(walk.entered, "the door in the middle of a held walk was never entered at 60fps").toBe(true);
  });

  it("it holds at every frame length a real machine produces, down to 15fps", () => {
    const door = { col: 5, row: 0 };
    for (const fps of [60, 50, 30, 24, 20, 15]) {
      const walk = holdWalk(1000 / fps, 10, door);
      expect(walk.landed.length, `${fps}fps dropped a landing`).toBe(10);
      expect(walk.entered, `${fps}fps walked over the threshold without entering`).toBe(true);
    }
  });

  /**
   * WHERE THE SKIP ACTUALLY BEGINS, measured rather than argued. A frame has to be longer than one
   * whole tile step for two landings to share it, and only then can the first landing's door go
   * unasked. `walkMsPerTile` is 160 on the shipped balance, so the first frame that can skip is
   * ~6fps — a rate at which the game is not being played. This is recorded because it is the ONE
   * true thing about the held-key hypothesis, and it is not the owner's bug.
   */
  it("the first frame length that can skip a threshold is longer than a whole tile step", () => {
    const door = { col: 5, row: 0 };
    const step = Math.max(1, balance.map.walkMsPerTile);
    // Just under one tile step: never two landings in a frame, so never a skip.
    expect(holdWalk(step - 1, 10, door).entered, "a sub-step frame skipped the door").toBe(true);
    // Well over one tile step: two landings share a frame and the threshold can go unasked.
    const skipped = holdWalk(step * 2 + 1, 10, door);
    expect(skipped.landed.length, "the long frame did not actually land two steps at once").toBe(10);
    expect(
      step - 1,
      `a frame must exceed one whole tile step (${step}ms ⇒ ${(1000 / step).toFixed(1)}fps) before a ` +
        `threshold can be skipped; the owner's report is not this`,
    ).toBeGreaterThan(1000 / 60);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §5 the whole thing at once: a real walk, on the real mask, into a real door
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The composition the two halves above never make on their own.
 *
 * §1–§3 are geometry with no walk in them; `tests/unit/overworld-scene.test.ts` is a walk with no
 * geometry in it (the synthesised open rectangle). Between the two, "the player can get from where
 * the game puts them down to the inside of a building" was asserted by nothing at all — and it was
 * false for every building in the game while the whole suite was green.
 *
 * So this walks it: the shipped mask's own walkability as `canEnter`, `game/movement.ts` at the
 * 60fps build-doc §12 budgets, a route the flood fill FOUND rather than one typed here, and the door
 * question asked exactly where `OverworldScene.onStepCompleted` asks it — of `movement.tile` after
 * the frame's events have been applied. No Phaser: the scene contributes only the shape of the
 * frame, and that shape is reproduced rather than imported.
 */
describe("§5 a walk from the spawn tile reaches the threshold and lands on it", () => {
  it.each(ROOM_IDS)("%s: the player walks in through the front door", (id) => {
    const bp = roomById.get(id) as InteriorBlueprint;
    const town = townOf(bp);
    const target = doorTile(bp);
    const canEnter = (t: TilePosition): boolean => tileWalkable(town.authored, t.col, t.row, balance);
    const spawn = chooseSpawnTile(town.authored, balance, { props: town.node.props }).tile;
    expect(
      firstStepTo(town, spawn, target),
      `${id}: no walk reaches tile ${target.col},${target.row} from the spawn tile ${spawn.col},${spawn.row}`,
    ).not.toBeNull();

    let state = createMovement(spawn);
    let last = new Set<Direction>();
    let entered = false;
    // A generous bound in FRAMES, not in steps: at 60fps and 160ms a tile this is ~180 tile steps,
    // several times the longest walk either town can ask for. A driver that stops walking fails on
    // the assertion below instead of spinning.
    for (let f = 0; f < 1800 && !entered; f += 1) {
      // Where the player will be when the buffered direction is applied — `chooseDirection`'s own
      // origin, so the plan and the movement module never disagree about which step is next.
      const origin = state.step ? state.step.to : state.tile;
      const next = firstStepTo(town, origin, target);
      const held = next === null ? new Set<Direction>() : new Set<Direction>([next]);
      const fresh = newlyPressed(held, last);
      state = queueInput(state, chooseDirection(held, state, canEnter, fresh));
      const result = updateMovement(state, 1000 / 60, canEnter, cfg);
      state = result.state;
      last = held;
      for (const event of result.events) {
        if (event.t !== "stepCompleted") continue;
        // `enterThroughDoorway`'s own question, on the field it really reads.
        if (state.tile.col === target.col && state.tile.row === target.row) entered = true;
      }
      if (next === null && state.step === null) break;
    }
    expect(
      entered,
      `${id}: the walk never landed on ${target.col},${target.row}, so the door never opened`,
    ).toBe(true);
  });
});
