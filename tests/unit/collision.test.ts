/**
 * tests/unit/collision.test.ts — the collision mask and the movement it gates (build-doc §7.6).
 *
 * The three things lane C2 was told to prove, each a describe block below:
 *   1. collision sampling matches a hand-built mask;
 *   2. a blocked cell is genuinely unenterable from all four directions;
 *   3. one mask serves all six years (Hard Req 5) — asserted structurally, since a per-year mask is
 *      unrepresentable if nothing in the module takes a year.
 *
 * These run with no Phaser: game/collision.ts and game/movement.ts import no engine, which is what
 * lets the collision editor and the balance harness reuse them and what lets this file exist.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateContent } from "../../core/schemas";
import type { Balance } from "../../core/types";
import {
  blockedCount,
  cellAtWorld,
  cellTopLeftWorld,
  cloneGrid,
  debugOverlayRects,
  emptyGrid,
  firstWalkableTile,
  gridConsistencyProblem,
  gridDimensions,
  gridFromAscii,
  gridToAscii,
  inBounds,
  isBlocked,
  loadCollision,
  packedByteLength,
  rectBlocked,
  sampleMask,
  setBlocked,
  synthesiseBorderCollision,
  tileGridSize,
  tileWalkable,
  worldCellPx,
  worldSizePx,
  type MaskPixels,
} from "../../game/collision";
import {
  DIRECTIONS,
  createMovement,
  delta,
  movementConfig,
  queueInput,
  resolveInput,
  spriteWorldPosition,
  targetTile,
  update as updateMovement,
  worldPosition,
  type Direction,
  type MovementState,
} from "../../game/movement";

const content = validateContent();
const balance: Balance = content.balance;
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/* ────────────────────────────────────────────────────────────────────────────
 * Helpers — a mask you can read in the diff
 * ──────────────────────────────────────────────────────────────────────────── */

/** '#' = dark ink = blocked (the mask contract); '.' = white = walkable. */
function pixelsFromAscii(ascii: string, scale = 1): MaskPixels {
  const rows = ascii
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const cols = rows.reduce((max, l) => Math.max(max, l.length), 0);
  const width = cols * scale;
  const height = rows.length * scale;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const row = rows[Math.floor(y / scale)] ?? "";
    for (let x = 0; x < width; x += 1) {
      const ch = row[Math.floor(x / scale)] ?? ".";
      const value = ch === "#" ? 0 : 255;
      const base = (y * width + x) * 4;
      data[base] = value;
      data[base + 1] = value;
      data[base + 2] = value;
      data[base + 3] = 255;
    }
  }
  return { width, height, data, channels: 4 };
}

function normalise(ascii: string): string {
  return ascii
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

/** Executable source with comments stripped — for the structural assertions. */
function executable(relPath: string): string {
  const src = readFileSync(`${ROOT}${relPath}`, "utf8");
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/* ════════════════════════════════════════════════════════════════════════════
 * 1. Sampling matches a hand-built mask
 * ════════════════════════════════════════════════════════════════════════════ */

describe("collision sampling — build-doc §7.6", () => {
  const ascii = `
    ########
    #......#
    #.##...#
    #.##...#
    #......#
    #...##.#
    #......#
    ########
  `;

  it("one pixel per cell reproduces the hand-built mask exactly", () => {
    const grid = sampleMask("hand", pixelsFromAscii(ascii), balance, { cols: 8, rows: 8 });
    expect(gridToAscii(grid)).toBe(normalise(ascii));
  });

  it("a supersampled mask reproduces the same cells", () => {
    // 16× more pixels, same picture: the sampler must be reading the whole cell, not one corner.
    const grid = sampleMask("hand", pixelsFromAscii(ascii, 4), balance, { cols: 8, rows: 8 });
    expect(gridToAscii(grid)).toBe(normalise(ascii));
  });

  it("a mask at a different resolution than the grid still lands on the right cells", () => {
    // 8 ascii cells sampled into a 4×4 grid: each grid cell covers a 2×2 block of ascii cells.
    const grid = sampleMask("hand", pixelsFromAscii(ascii, 3), balance, { cols: 4, rows: 4 });
    expect(grid.cols).toBe(4);
    expect(grid.rows).toBe(4);
    // The border ring is solid in the source, so every edge cell of the coarse grid is ≥ half ink.
    for (let i = 0; i < 4; i += 1) {
      expect(isBlocked(grid, i, 0)).toBe(true);
      expect(isBlocked(grid, i, 3)).toBe(true);
      expect(isBlocked(grid, 0, i)).toBe(true);
      expect(isBlocked(grid, 3, i)).toBe(true);
    }
  });

  it("majority and any are different rules, and each is the rule it says it is", () => {
    // One cell is 1/4 ink: below majority, above "any".
    const pixels: MaskPixels = {
      width: 2,
      height: 2,
      channels: 4,
      data: new Uint8ClampedArray([
        0, 0, 0, 255, /* dark */ 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      ]),
    };
    const majority = sampleMask("q", pixels, balance, { cols: 1, rows: 1, policy: "majority" });
    const any = sampleMask("q", pixels, balance, { cols: 1, rows: 1, policy: "any" });
    expect(isBlocked(majority, 0, 0)).toBe(false);
    expect(isBlocked(any, 0, 0)).toBe(true);
    // …and the DEFAULT is majority. Without this the two rules are only proven to differ, not to be
    // the right way round for the runtime, which is the sampling every node actually gets.
    const byDefault = sampleMask("q", pixels, balance, { cols: 1, rows: 1 });
    expect(isBlocked(byDefault, 0, 0)).toBe(false);
  });

  it("polarity is a contract, and inverting it inverts the grid", () => {
    const pixels = pixelsFromAscii(ascii);
    const dark = sampleMask("d", pixels, balance, { cols: 8, rows: 8, polarity: "dark-blocks" });
    const light = sampleMask("l", pixels, balance, { cols: 8, rows: 8, polarity: "light-blocks" });
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        expect(isBlocked(light, col, row)).toBe(!isBlocked(dark, col, row));
      }
    }
  });

  it("a fully transparent pixel is unpainted, therefore walkable, whatever its colour", () => {
    const pixels: MaskPixels = {
      width: 1,
      height: 1,
      channels: 4,
      data: new Uint8ClampedArray([0, 0, 0, 0]), // black but transparent
    };
    const grid = sampleMask("t", pixels, balance, { cols: 1, rows: 1 });
    expect(isBlocked(grid, 0, 0)).toBe(false);
  });

  it("is a PACKED bitfield, not an array of booleans", () => {
    const dims = gridDimensions(balance);
    const grid = emptyGrid("packed", dims);
    expect(grid.bits).toBeInstanceOf(Uint8Array);
    expect(grid.bits.length).toBe(packedByteLength(dims.cols, dims.rows));
    // build-doc §7.6's shipped grid: 64×64 cells = 4096 bits = 512 bytes.
    expect(grid.bits.length * 8).toBeGreaterThanOrEqual(dims.cols * dims.rows);
    expect(grid.bits.length).toBeLessThan(dims.cols * dims.rows);
  });

  it("every cell round-trips through the packing", () => {
    const dims = gridDimensions(balance);
    const grid = emptyGrid("rt", dims);
    const marked: Array<[number, number]> = [];
    for (let i = 0; i < dims.cols * dims.rows; i += 37) {
      const col = i % dims.cols;
      const row = Math.floor(i / dims.cols);
      setBlocked(grid, col, row, true);
      marked.push([col, row]);
    }
    for (const [col, row] of marked) expect(isBlocked(grid, col, row)).toBe(true);
    expect(blockedCount(grid)).toBe(marked.length);
    setBlocked(grid, marked[0]![0], marked[0]![1], false);
    expect(blockedCount(grid)).toBe(marked.length - 1);
  });

  it("the shipped balance.map states one consistent grid", () => {
    expect(gridConsistencyProblem(balance)).toBeNull();
    const dims = gridDimensions(balance);
    expect(dims.cellPx).toBe(balance.map.collisionCellPx);
  });

  it("out of bounds reads as blocked — the world is the painted map and nothing else", () => {
    const grid = emptyGrid("oob", gridDimensions(balance));
    expect(inBounds(grid, -1, 0)).toBe(false);
    expect(isBlocked(grid, -1, 0)).toBe(true);
    expect(isBlocked(grid, 0, -1)).toBe(true);
    expect(isBlocked(grid, grid.cols, 0)).toBe(true);
    expect(isBlocked(grid, 0, grid.rows)).toBe(true);
    expect(isBlocked(grid, 0, 0)).toBe(false);
  });

  it("an empty raster samples to an all-walkable grid rather than throwing", () => {
    const grid = sampleMask("empty", { width: 0, height: 0, data: [] }, balance);
    expect(blockedCount(grid)).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * World-space geometry
 * ════════════════════════════════════════════════════════════════════════════ */

describe("world-space conversion — build-doc §7.6 (1024² native rendered 2× = 2048² world)", () => {
  const grid = emptyGrid("w", gridDimensions(balance));

  it("the world is the native map times the render scale", () => {
    const world = worldSizePx(balance);
    expect(world.width).toBe(balance.map.mapNativePx * balance.map.mapRenderScale);
    expect(world.height).toBe(world.width);
  });

  it("a collision cell is one tile step wide on the shipped numbers", () => {
    // Not assumed by the code — every query converts explicitly — but true of the shipped balance,
    // and worth pinning: if a retune breaks it, the movement grid and the mask stop lining up.
    expect(worldCellPx(grid, balance)).toBe(balance.map.tileStepPx);
    const tiles = tileGridSize(balance);
    expect(tiles.cols).toBe(grid.cols);
    expect(tiles.rows).toBe(grid.rows);
  });

  it("world point ↔ cell round-trips", () => {
    const cell = worldCellPx(grid, balance);
    for (const [col, row] of [
      [0, 0],
      [7, 13],
      [grid.cols - 1, grid.rows - 1],
    ] as const) {
      const topLeft = cellTopLeftWorld(grid, col, row, balance);
      expect(topLeft).toEqual({ x: col * cell, y: row * cell });
      expect(cellAtWorld(grid, topLeft.x, topLeft.y, balance)).toEqual({ col, row });
      expect(cellAtWorld(grid, topLeft.x + cell - 1, topLeft.y + cell - 1, balance)).toEqual({ col, row });
    }
  });

  it("rectBlocked is half-open: a one-cell footprint tests exactly one cell", () => {
    const g = cloneGrid(grid);
    setBlocked(g, 5, 5, true);
    const cell = worldCellPx(g, balance);
    expect(rectBlocked(g, { x: 4 * cell, y: 5 * cell, w: cell, h: cell }, balance)).toBe(false);
    expect(rectBlocked(g, { x: 5 * cell, y: 5 * cell, w: cell, h: cell }, balance)).toBe(true);
    // Straddling the boundary by a pixel DOES touch the blocked cell — that is the point of a rect.
    expect(rectBlocked(g, { x: 4 * cell + 1, y: 5 * cell, w: cell, h: cell }, balance)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2. A blocked cell is unenterable from all four directions
 * ════════════════════════════════════════════════════════════════════════════ */

describe("a blocked cell is genuinely unenterable", () => {
  const cfg = movementConfig(balance);
  const WALL = { col: 20, row: 20 };

  function wallGrid() {
    const grid = emptyGrid("wall", gridDimensions(balance));
    setBlocked(grid, WALL.col, WALL.row, true);
    return grid;
  }

  /** The tile you must stand on to walk `dir` into the wall. */
  function approachFrom(dir: Direction): { col: number; row: number } {
    const d = delta(dir);
    return { col: WALL.col - d.dCol, row: WALL.row - d.dRow };
  }

  function walk(state: MovementState, dir: Direction, grid = wallGrid(), frames = 200) {
    let s = queueInput(state, dir);
    const events = [];
    for (let i = 0; i < frames; i += 1) {
      const r = updateMovement(s, cfg.msPerTile, (tile) => tileWalkable(grid, tile.col, tile.row, balance), cfg);
      s = r.state;
      events.push(...r.events);
    }
    return { state: s, events };
  }

  it.each(DIRECTIONS)("cannot be entered walking %s, however long the key is held", (dir) => {
    const start = approachFrom(dir);
    const result = walk(createMovement(start, dir === "up" ? "down" : "up"), dir);
    expect(result.state.tile).toEqual(start);
    expect(result.state.facing).toBe(dir);
    expect(result.events.some((e) => e.t === "blocked")).toBe(true);
    expect(result.events.some((e) => e.t === "stepCompleted")).toBe(false);
    expect(result.state.stepsTaken).toBe(0);
  });

  it.each(DIRECTIONS)("the same start tile CAN be left in a direction with no wall (%s control)", (dir) => {
    const start = approachFrom(dir);
    const away = DIRECTIONS.find((d) => d !== dir && targetTile(start, d).col !== WALL.col) ?? "up";
    const control = walk(createMovement(start), away);
    expect(control.state.stepsTaken).toBeGreaterThan(0);
    expect(control.state.tile).not.toEqual(start);
  });

  it("bumping a wall turns you to face it — that is how you face a sign", () => {
    const start = approachFrom("right");
    const result = walk(createMovement(start, "up"), "right", wallGrid(), 1);
    expect(result.state.facing).toBe("right");
    expect(result.events.some((e) => e.t === "turned" && e.bumped)).toBe(true);
  });

  it("a step already in flight always finishes on a whole tile", () => {
    const grid = emptyGrid("open", gridDimensions(balance));
    let s = queueInput(createMovement({ col: 5, row: 5 }), "right");
    const can = (tile: { col: number; row: number }) => tileWalkable(grid, tile.col, tile.row, balance);
    // Release the key mid-step: the tile still completes, and nothing lands on a fraction.
    s = updateMovement(s, cfg.msPerTile / 2, can, cfg).state;
    s = queueInput(s, null);
    const finished = updateMovement(s, cfg.msPerTile, can, cfg);
    expect(finished.state.tile).toEqual({ col: 6, row: 5 });
    expect(Number.isInteger(finished.state.tile.col)).toBe(true);
    expect(finished.state.step).toBeNull();
  });

  it("the synthesised border keeps the player on the map from every direction", () => {
    const loaded = synthesiseBorderCollision("edge", balance);
    const tiles = tileGridSize(balance);
    const can = (tile: { col: number; row: number }) => tileWalkable(loaded.grid, tile.col, tile.row, balance);
    for (const dir of DIRECTIONS) {
      let s = queueInput(createMovement({ col: Math.floor(tiles.cols / 2), row: Math.floor(tiles.rows / 2) }), dir);
      for (let i = 0; i < tiles.cols + tiles.rows; i += 1) s = updateMovement(s, cfg.msPerTile, can, cfg).state;
      expect(s.tile.col).toBeGreaterThanOrEqual(1);
      expect(s.tile.row).toBeGreaterThanOrEqual(1);
      expect(s.tile.col).toBeLessThanOrEqual(tiles.cols - 2);
      expect(s.tile.row).toBeLessThanOrEqual(tiles.rows - 2);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Gold-style movement rules
 * ════════════════════════════════════════════════════════════════════════════ */

describe("Gold-style grid movement — build-doc §7.6", () => {
  const cfg = movementConfig(balance);
  const open = emptyGrid("open", gridDimensions(balance));
  const can = (tile: { col: number; row: number }) => tileWalkable(open, tile.col, tile.row, balance);

  it("has exactly four directions and none of them is diagonal", () => {
    expect(DIRECTIONS.length).toBe(4);
    for (const dir of DIRECTIONS) {
      const d = delta(dir);
      expect(Math.abs(d.dCol) + Math.abs(d.dRow)).toBe(1);
    }
  });

  it("resolveInput never returns two directions, and holding one wins the tie", () => {
    expect(resolveInput(["up", "left"])).toBe("up");
    expect(resolveInput(["up", "left"], "left")).toBe("left");
    expect(resolveInput([])).toBeNull();
  });

  it("one step is one whole tile of tileStepPx", () => {
    let s = queueInput(createMovement({ col: 3, row: 3 }), "down");
    s = updateMovement(s, cfg.msPerTile, can, cfg).state;
    expect(s.tile).toEqual({ col: 3, row: 4 });
    expect(worldPosition(s, cfg)).toEqual({ x: 3 * balance.map.tileStepPx, y: 4 * balance.map.tileStepPx });
  });

  it("mid-step the sprite is between tiles, never off the line", () => {
    let s = queueInput(createMovement({ col: 3, row: 3 }), "right");
    s = updateMovement(s, cfg.msPerTile / 2, can, cfg).state;
    const pos = worldPosition(s, cfg);
    expect(pos.y).toBe(3 * balance.map.tileStepPx);
    expect(pos.x).toBeGreaterThan(3 * balance.map.tileStepPx);
    expect(pos.x).toBeLessThan(4 * balance.map.tileStepPx);
  });

  it("held input walks continuously — queued input applies the instant a step lands", () => {
    let s = queueInput(createMovement({ col: 0, row: 0 }), "right");
    for (let i = 0; i < 10; i += 1) s = updateMovement(s, cfg.msPerTile, can, cfg).state;
    expect(s.tile.col).toBe(10);
    expect(s.stepsTaken).toBe(10);
  });

  it("a long frame carries its overrun into the next step instead of losing distance", () => {
    const one = updateMovement(queueInput(createMovement({ col: 0, row: 0 }), "right"), cfg.msPerTile * 3, can, cfg);
    expect(one.state.stepsTaken).toBe(3);
  });

  it("the 32×48 sprite stands with its feet on the tile", () => {
    const s = createMovement({ col: 4, row: 4 });
    const centre = spriteWorldPosition(s, cfg);
    const feet = worldPosition(s, cfg);
    expect(centre.x).toBe(feet.x + balance.map.tileStepPx / 2);
    expect(centre.y + balance.map.playerSpriteH / 2).toBe(feet.y + balance.map.tileStepPx);
    expect(cfg.spriteW).toBe(balance.map.playerSpriteW);
    expect(cfg.spriteH).toBe(balance.map.playerSpriteH);
  });

  it("movement reads its tile step from balance.json, never a literal (G11)", () => {
    expect(cfg.tileStepPx).toBe(balance.map.tileStepPx);
    const code = executable("game/movement.ts");
    expect(code).toMatch(/balance\.map\.tileStepPx/);
    expect(code).not.toMatch(/\bMath\.random\b/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3. One mask, six years (Hard Req 5) — and the honest placeholder
 * ════════════════════════════════════════════════════════════════════════════ */

describe("Hard Req 5 — ONE collision mask serves all six years", () => {
  it("no function in game/collision.ts takes, reads or names a year", () => {
    // Structural, not aspirational: a per-year mask is not addressable from this module, so no lane
    // can add one without the change being visible here.
    const code = executable("game/collision.ts");
    expect(code).not.toMatch(/year/i);
    expect(code).not.toMatch(/yearVariants/);
  });

  it("every shipped node declares exactly one mask path", () => {
    for (const node of content.nodes) {
      expect(typeof node.collisionMask).toBe("string");
      expect(node.collisionMask.length).toBeGreaterThan(0);
    }
  });
});

describe("no authored mask exists yet — the stand-in says so and cannot be mistaken for one", () => {
  it("a node with no mask pixels gets a SYNTHESISED grid, flagged three ways", () => {
    const node = content.nodes.find((n) => n.id === "r1");
    expect(node).toBeDefined();
    const loaded = loadCollision("r1", node!.collisionMask, null, balance);
    expect(loaded.source).toBe("synthesised");
    expect(loaded.synthetic).toBe(true);
    expect(loaded.note).toMatch(/SYNTHESISED/);
    expect(loaded.note).toMatch(/NOT an authored mask/);
    expect(loaded.maskPath).toBe(node!.collisionMask);
  });

  it("the synthesised grid is walkable everywhere but the border", () => {
    const { grid } = synthesiseBorderCollision("s", balance);
    expect(isBlocked(grid, 0, 0)).toBe(true);
    expect(isBlocked(grid, grid.cols - 1, grid.rows - 1)).toBe(true);
    expect(isBlocked(grid, 1, 1)).toBe(false);
    expect(isBlocked(grid, grid.cols - 2, grid.rows - 2)).toBe(false);
    expect(blockedCount(grid)).toBe(2 * grid.cols + 2 * grid.rows - 4);
  });

  it("real pixels produce an AUTHORED grid, and only that path may", () => {
    const grid = pixelsFromAscii("##\n..");
    const loaded = loadCollision("m", "assets/final/maps/m-mask.png", grid, balance, { cols: 2, rows: 2 });
    expect(loaded.source).toBe("authored");
    expect(loaded.synthetic).toBe(false);
    expect(loaded.note).toMatch(/authored mask/);
  });

  it("the player spawns somewhere legal on a synthesised grid", () => {
    const { grid } = synthesiseBorderCollision("s", balance);
    const spawn = firstWalkableTile(grid, balance);
    expect(spawn).not.toBeNull();
    expect(tileWalkable(grid, spawn!.col, spawn!.row, balance)).toBe(true);
  });

  it("a grid with no walkable tile reports null rather than spawning in a wall", () => {
    const dims = gridDimensions(balance);
    const grid = emptyGrid("solid", dims);
    for (let row = 0; row < dims.rows; row += 1) {
      for (let col = 0; col < dims.cols; col += 1) setBlocked(grid, col, row, true);
    }
    expect(firstWalkableTile(grid, balance)).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Debug overlay — the collision editor reuses this exact geometry
 * ════════════════════════════════════════════════════════════════════════════ */

describe("debug overlay", () => {
  it("covers exactly the blocked cells, in world space", () => {
    const grid = gridFromAscii("t", "#..#\n.##.\n....\n####", balance.map.collisionCellPx);
    const cell = worldCellPx(grid, balance);
    const rects = debugOverlayRects(grid, balance);
    const area = rects.reduce((sum, r) => sum + r.w * r.h, 0);
    expect(area).toBe(blockedCount(grid) * cell * cell);
    for (const rect of rects) {
      expect(rect.x % cell).toBe(0);
      expect(rect.y % cell).toBe(0);
      const { col, row } = cellAtWorld(grid, rect.x, rect.y, balance);
      expect(isBlocked(grid, col, row)).toBe(true);
    }
  });

  it("merges a run into one rectangle rather than emitting one per cell", () => {
    const grid = gridFromAscii("run", "####", balance.map.collisionCellPx);
    const rects = debugOverlayRects(grid, balance);
    expect(rects.length).toBe(1);
    expect(rects[0]!.w).toBe(4 * worldCellPx(grid, balance));
  });

  it("an all-walkable grid draws nothing", () => {
    expect(debugOverlayRects(emptyGrid("none", gridDimensions(balance)), balance)).toEqual([]);
  });

  it("ascii round-trips, so a failing expectation is readable", () => {
    const ascii = "#.#\n.#.\n##.";
    const grid = gridFromAscii("rt", ascii, balance.map.collisionCellPx);
    expect(gridToAscii(grid)).toBe(ascii);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * G1 / L11 — no tilesets, no engine
 * ════════════════════════════════════════════════════════════════════════════ */

describe("guardrails this lane must not break", () => {
  it.each(["game/collision.ts", "game/movement.ts"])("%s imports no engine", (relPath) => {
    const code = executable(relPath);
    expect(code).not.toMatch(/from\s+["']phaser["']/);
    expect(code).not.toMatch(/\bPhaser\b/);
  });

  it("G1 — nothing here builds or slices a tileset", () => {
    const code = executable("game/collision.ts") + executable("game/mapview.ts");
    expect(code).not.toMatch(/tileset|tilemap|createFromTiles|putTileAt/i);
  });
});
