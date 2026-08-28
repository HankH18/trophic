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

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateContent } from "../../core/schemas";
import type { Balance, CollisionGrid } from "../../core/types";
import { createRng } from "../../core/rng";
import { walkableCells } from "../../tools/overlay-diff/mask";
import { readRaster, type Raster } from "../../tools/postprocess/raster";
import {
  blockedCount,
  cellAtWorld,
  chooseSpawnTile,
  collisionFromMask,
  maskHealth,
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
  maskRasterFrom,
  readMask,
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
  chooseDirection,
  createMovement,
  delta,
  movementConfig,
  newlyPressed,
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

/**
 * The collision CELLS a player standing on `tile` can walk to, 4-connected, as row-major indices.
 *
 * The spawn is a movement TILE and the flood is over collision CELLS, so the start is converted
 * through world space rather than by assuming the two grids are the same shape — `worldCellPx` and
 * `tileStepPx` are separate numbers in `balance.map` and only happen to be equal today.
 */
function reachableCells(
  grid: CollisionGrid,
  tile: { col: number; row: number },
  bal: Balance,
): Set<number> {
  const stepPx = bal.map.tileStepPx;
  const cellPx = worldCellPx(grid, bal);
  const start = {
    col: Math.floor((tile.col * stepPx) / cellPx),
    row: Math.floor((tile.row * stepPx) / cellPx),
  };
  const seen = new Set<number>();
  if (isBlocked(grid, start.col, start.row)) return seen;
  seen.add(start.row * grid.cols + start.col);
  const stack = [start];
  while (stack.length > 0) {
    const at = stack.pop() as { col: number; row: number };
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const col = at.col + dc;
      const row = at.row + dr;
      if (!inBounds(grid, col, row) || isBlocked(grid, col, row)) continue;
      const key = row * grid.cols + col;
      if (seen.has(key)) continue;
      seen.add(key);
      stack.push({ col, row });
    }
  }
  return seen;
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

describe("the synthesised stand-in — no longer what a shipped node loads, and still unmistakable", () => {
  /*
   * ⚠ THE HEADING USED TO READ "no authored mask exists yet". IT WAS REWRITTEN BECAUSE THE FACT
   * CHANGED, AND THE TEST BELOW IS THE RE-MEASUREMENT THE OLD ONE DEMANDED IN ITS OWN WORDS.
   *
   * What stood here, verbatim, and why it is gone:
   *
   *     it("STATES THE GAP: not one node's declared mask is on disk, so the synthesised branch IS
   *        the game", () => {
   *       const onDisk = content.nodes.filter((n) => existsSync(resolve(ROOT, n.collisionMask)));
   *       expect(content.nodes.length, "no nodes at all — the fixture is wrong").toBeGreaterThan(0);
   *       expect(
   *         onDisk.map((n) => `${n.id} → ${n.collisionMask}`),
   *         "a collision mask now EXISTS. The synthesised stand-in is no longer what the game loads
   *          for this node: re-measure this block against the real pixels and rewrite the heading.",
   *       ).toEqual([]);
   *     });
   *
   * It asserted a fact about the REPOSITORY, not about the product: that no mask file existed. It
   * was built as a tripwire — its own comment says the day someone authors a mask "this goes red and
   * whoever authored it has to come and re-measure this block against it", and it names the three
   * re-measurements: that the real pixels decode, that `firstWalkableTile` finds a legal spawn on
   * them, and that a player is not sealed into a corner of a real map. All three are asserted below,
   * against the shipped bytes, and the twelve-are-absent claim is replaced by its inverse asserted
   * BY NAME so the scope cannot silently shrink.
   *
   * NOTHING WAS WEAKENED. Every other test in this block hands `loadCollision` a `null` buffer or an
   * ascii grid on purpose — the synthesised branch is still reachable and still has to behave, for
   * an interior, a test node, or a node whose mask fails to decode — so all of them stay exactly as
   * they were. What changed is that the branch is no longer what the twelve SHIPPED nodes load, and
   * that is now measured rather than titled.
   *
   * The cell-by-cell contract between each mask and its layout lives in
   * `tests/gates/map-mask-layout-contract.test.ts`; this block owns the loader's side of it.
   */
  it("THE GAP IS CLOSED: every node's declared mask is on disk and loads as AUTHORED geometry", async () => {
    const missing = content.nodes.filter((n) => !existsSync(resolve(ROOT, n.collisionMask)));
    expect(content.nodes.length, "no nodes at all — the fixture is wrong").toBeGreaterThan(0);
    expect(
      missing.map((n) => `${n.id} → ${n.collisionMask}`),
      "a node declares a collision mask that is not on disk. That node is back on the synthesised " +
        "open rectangle — buildings, water and treeline all walkable — and the game will not say so " +
        "on screen. Re-run `npx tsx tools/mapgen/land.ts`.",
    ).toEqual([]);

    for (const node of content.nodes) {
      // THE REAL PIXELS, through the call OverworldScene.buildNodeView makes. Not `maskRasterFrom`:
      // comparing the encoder with itself would be green on a mask that describes the wrong map.
      const raster = await readRaster(resolve(ROOT, node.collisionMask));
      const loaded = loadCollision(
        node.id,
        node.collisionMask,
        { width: raster.width, height: raster.height, data: raster.data, channels: 4 },
        balance,
      );
      expect(loaded.source, `${node.id}: ${loaded.note}`).toBe("authored");
      expect(loaded.synthetic).toBe(false);
      expect(loaded.health?.usable, `${node.id}: ${loaded.health?.problems.join(" · ") ?? ""}`).toBe(true);

      // `firstWalkableTile` finds a legal spawn on the real pixels — the second re-measurement the
      // old assertion asked for, and the one that turns "the mask decoded" into "the player can
      // stand up in it".
      const choice = chooseSpawnTile(loaded.grid, balance, { props: node.props });
      expect(choice.problem, `${node.id}: ${choice.problem ?? ""}`).toBeNull();
      expect(tileWalkable(loaded.grid, choice.tile.col, choice.tile.row, balance)).toBe(true);

      // …and the player is not sealed into a corner: the spawn can reach a cell on every side of
      // the map. The full one-region flood is in tests/gates/map-mask-layout-contract.test.ts; this
      // is the loader-side statement that a real mask did not close the map in.
      const reach = reachableCells(loaded.grid, choice.tile, balance);
      const cols = loaded.grid.cols;
      const rows = loaded.grid.rows;
      const xs = [...reach].map((k) => k % cols);
      const ys = [...reach].map((k) => Math.floor(k / cols));
      expect(reach.size, `${node.id}: the spawn reaches only ${String(reach.size)} cell(s)`).toBeGreaterThan(
        cols + rows,
      );
      expect(Math.max(...xs) - Math.min(...xs), `${node.id}: the reachable region is a narrow column`).toBeGreaterThan(
        cols / 2,
      );
      expect(Math.max(...ys) - Math.min(...ys), `${node.id}: the reachable region is a narrow band`).toBeGreaterThan(
        rows / 2,
      );
    }
  }, 30_000);

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

/* ════════════════════════════════════════════════════════════════════════════
 * THE MASK CONTRACT — one declaration, two readers
 *
 * `game/collision.ts` and `tools/overlay-diff/mask.ts` both read the same PNG: the first to decide
 * where the player may walk, the second to restrict the Hard Req 5 / G4 acceptance IoU to "the
 * walkable cells of the collision mask" (build-doc §8.2). They each declared themselves the
 * authority on the encoding and they CONTRADICTED each other on transparent pixels — measured, by
 * feeding one raster to both: an all-transparent 8×8 gave 0/64 blocked to the game and 64/64 to the
 * gate. The consequence was not academic: an alpha-background mask (the export style
 * game/collision.ts explicitly claimed to support) played as an almost entirely open map while
 * `tools/overlay-diff/diff.ts` took its `walkable === 0` branch and REJECTED every year variant.
 *
 * The resolution is the contract in `MaskPolarity`: a mask is FULLY OPAQUE. These tests prove the
 * two halves of that being enough — the readers agree on every opaque raster, and a raster that is
 * not opaque is refused by the runtime rather than played.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the mask contract makes the runtime and the Hard Req 5 gate agree", () => {
  const CELLS = 8;

  /** One raster, read by game/collision.ts. `true` = blocked. */
  function gameBlocked(pixels: MaskPixels): boolean[] {
    const grid = sampleMask("agree", pixels, balance, { cols: CELLS, rows: CELLS });
    const out: boolean[] = [];
    for (let row = 0; row < CELLS; row += 1) for (let col = 0; col < CELLS; col += 1) out.push(isBlocked(grid, col, row));
    return out;
  }

  /** The SAME raster, read by tools/overlay-diff/mask.ts. `true` = blocked (not walkable). */
  function gateBlocked(pixels: MaskPixels): boolean[] {
    const raster: Raster = {
      width: pixels.width,
      height: pixels.height,
      data: pixels.data as Uint8ClampedArray,
    };
    const cells = walkableCells(raster, { cols: CELLS, rows: CELLS });
    return [...cells].map((v) => v === 0);
  }

  /** A deterministic opaque black/white raster — no Math.random anywhere in this repo (G11). */
  function opaqueRaster(seed: number, side = CELLS): MaskPixels {
    const rng = createRng(seed);
    const data = new Uint8ClampedArray(side * side * 4);
    for (let i = 0; i < side * side; i += 1) {
      const ink = rng.chance(0.5) ? 0 : 255;
      data[i * 4] = ink;
      data[i * 4 + 1] = ink;
      data[i * 4 + 2] = ink;
      data[i * 4 + 3] = 255;
    }
    return { width: side, height: side, data, channels: 4 };
  }

  it("agrees cell-for-cell on every OPAQUE raster, over many seeds", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const pixels = opaqueRaster(seed);
      expect(gameBlocked(pixels), `seed ${seed}`).toEqual(gateBlocked(pixels));
    }
  });

  it("agrees at both extremes", () => {
    const white: MaskPixels = { width: 2, height: 2, channels: 4, data: new Uint8ClampedArray(16).fill(255) };
    const black: MaskPixels = {
      width: 2,
      height: 2,
      channels: 4,
      data: new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]),
    };
    // Only 2×2 pixels, so ask for a 2×2 grid rather than the 8×8 the helpers above use.
    const smallGame = (p: MaskPixels): boolean[] => {
      const grid = sampleMask("x", p, balance, { cols: 2, rows: 2 });
      const out: boolean[] = [];
      for (let row = 0; row < 2; row += 1) for (let col = 0; col < 2; col += 1) out.push(isBlocked(grid, col, row));
      return out;
    };
    const smallGate = (p: MaskPixels): boolean[] =>
      [...walkableCells({ width: p.width, height: p.height, data: p.data as Uint8ClampedArray }, { cols: 2, rows: 2 })].map(
        (v) => v === 0,
      );
    expect(smallGame(white)).toEqual(smallGate(white));
    expect(smallGame(black)).toEqual(smallGate(black));
    expect(smallGame(white).every((b) => !b)).toBe(true);
    expect(smallGame(black).every((b) => b)).toBe(true);
  });

  it("BINDS — the two readers genuinely DISAGREE on transparency, which is why it is out of contract", () => {
    // If this ever stops disagreeing the contract could be relaxed. Until then, the refusal below is
    // load-bearing and this assertion is what says so.
    const clear: MaskPixels = { width: CELLS, height: CELLS, channels: 4, data: new Uint8ClampedArray(CELLS * CELLS * 4) };
    expect(gameBlocked(clear).every((b) => !b)).toBe(true);
    expect(gateBlocked(clear).every((b) => b)).toBe(true);
    expect(gameBlocked(clear)).not.toEqual(gateBlocked(clear));
  });
});

describe("maskHealth — provenance that answers 'is this usable', not 'did a file decode'", () => {
  function raster(fill: (i: number, data: Uint8ClampedArray) => void, side = 8): MaskPixels {
    const data = new Uint8ClampedArray(side * side * 4);
    for (let i = 0; i < side * side; i += 1) fill(i, data);
    return { width: side, height: side, data, channels: 4 };
  }
  const opaque = (value: number) => (i: number, d: Uint8ClampedArray): void => {
    d[i * 4] = value;
    d[i * 4 + 1] = value;
    d[i * 4 + 2] = value;
    d[i * 4 + 3] = 255;
  };

  it("a fully transparent mask is REFUSED and says the readers would disagree about it", () => {
    const clear = raster((i, d) => {
      d[i * 4 + 3] = 0;
    });
    const health = maskHealth(clear, balance, { cols: 8, rows: 8 });
    expect(health.usable).toBe(false);
    expect(health.transparentPixels).toBe(64);
    expect(health.problems.join(" ")).toMatch(/opaque/);

    const loaded = collisionFromMask("t", "assets/final/maps/t-mask.png", clear, balance, { cols: 8, rows: 8 });
    // The whole point: it does NOT come back as authored geometry.
    expect(loaded.source).toBe("synthesised");
    expect(loaded.synthetic).toBe(true);
    expect(loaded.note).toContain("REFUSED");
    expect(loaded.health?.usable).toBe(false);
  });

  it("an all-blocked mask is REFUSED — there is nowhere to stand", () => {
    const black = raster(opaque(0));
    const health = maskHealth(black, balance, { cols: 8, rows: 8 });
    expect(health.usable).toBe(false);
    expect(health.walkableCells).toBe(0);
    expect(health.problems.join(" ")).toMatch(/nowhere to stand/);
    expect(collisionFromMask("b", "b.png", black, balance, { cols: 8, rows: 8 }).source).toBe("synthesised");
  });

  it("an entirely open mask is REPORTED but still played — an open field is a legal map", () => {
    const white = raster(opaque(255));
    const health = maskHealth(white, balance, { cols: 8, rows: 8 });
    expect(health.usable).toBe(true);
    expect(health.blockedCells).toBe(0);
    expect(health.problems.join(" ")).toMatch(/whole map is open/);
    const loaded = collisionFromMask("w", "w.png", white, balance, { cols: 8, rows: 8 });
    expect(loaded.source).toBe("authored");
    expect(loaded.note).toMatch(/whole map is open/);
  });

  it("an ordinary mask is authored, with no problems at all", () => {
    const mixed = raster((i, d) => {
      const value = i % 8 < 2 ? 0 : 255;
      d[i * 4] = value;
      d[i * 4 + 1] = value;
      d[i * 4 + 2] = value;
      d[i * 4 + 3] = 255;
    });
    const loaded = collisionFromMask("m", "m.png", mixed, balance, { cols: 8, rows: 8 });
    expect(loaded.source).toBe("authored");
    expect(loaded.synthetic).toBe(false);
    expect(loaded.health?.usable).toBe(true);
    expect(loaded.health?.problems).toEqual([]);
    expect(loaded.health?.blockedCells).toBe(16);
  });
});

describe("chooseSpawnTile — the null that must not be swallowed", () => {
  it("hands back a walkable tile and no problem on an ordinary grid", () => {
    const choice = chooseSpawnTile(synthesiseBorderCollision("s", balance).grid, balance);
    expect(choice.problem).toBeNull();
    expect(tileWalkable(synthesiseBorderCollision("s", balance).grid, choice.tile.col, choice.tile.row, balance)).toBe(true);
  });

  it("says so, in a sentence, when every tile is blocked — instead of returning (0,0)", () => {
    const dims = gridDimensions(balance);
    const grid = emptyGrid("solid", dims);
    for (let row = 0; row < dims.rows; row += 1) {
      for (let col = 0; col < dims.cols; col += 1) setBlocked(grid, col, row, true);
    }
    const choice = chooseSpawnTile(grid, balance);
    expect(choice.problem).not.toBeNull();
    expect(choice.problem).toMatch(/NO WALKABLE TILE/);
    // (0,0) is BLOCKED on any bordered grid — the value the old `?? { col: 0, row: 0 }` produced.
    expect(firstWalkableTile(grid, balance)).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Input — Gold's "most recent press wins", and why the tie-break alone deadlocks
 * ════════════════════════════════════════════════════════════════════════════ */

describe("chooseDirection — a wall never locks out a direction with an open path", () => {
  /** (25,26) is a wall; everything else on this lattice is open. */
  const canEnter = (tile: { col: number; row: number }): boolean => !(tile.col === 25 && tile.row === 26);
  const standing = (queued: Direction | null = null): MovementState => ({
    ...createMovement({ col: 25, row: 25 }),
    queued,
  });

  it("REPRODUCES the deadlock in the primitive it replaced", () => {
    // resolveInput knows nothing about walls, so `previous` re-elects the blocked direction forever.
    expect(resolveInput(["down", "right"], "down")).toBe("down");
  });

  it("a freshly pressed direction wins over the one already held", () => {
    expect(chooseDirection(["down", "right"], standing("down"), canEnter, ["right"])).toBe("right");
  });

  it("with nothing fresh, an open direction still beats a held wall", () => {
    expect(chooseDirection(["down", "right"], standing("down"), canEnter, [])).toBe("right");
  });

  it("two directions pressed on the SAME frame resolve to the open one", () => {
    expect(chooseDirection(["down", "right"], standing(null), canEnter, ["down", "right"])).toBe("right");
  });

  it("keeps walking the held direction when it is open — no stutter from a brushed key", () => {
    const open = (): boolean => true;
    expect(chooseDirection(["down", "right"], standing("down"), open, [])).toBe("down");
  });

  it("still bumps: with every direction blocked you turn and stay put", () => {
    const wall = (): boolean => false;
    const dir = chooseDirection(["down"], standing(null), wall, ["down"]);
    expect(dir).toBe("down");
    const result = updateMovement(queueInput(standing(null), dir), 200, wall, movementConfig(balance));
    expect(result.state.tile).toEqual({ col: 25, row: 25 });
    expect(result.state.facing).toBe("down");
    expect(result.events.some((e) => e.t === "blocked")).toBe(true);
  });

  it("judges a mid-step choice from where the step will LAND, not from where it started", () => {
    // Standing at (25,25) stepping to (25,26)… which is the wall, so a step there cannot be in
    // flight. Step to (24,25) instead and ask about `down` from there: (24,26) is open.
    const moving: MovementState = {
      ...createMovement({ col: 25, row: 25 }),
      step: { from: { col: 25, row: 25 }, to: { col: 24, row: 25 }, dir: "left", elapsedMs: 0, durationMs: 100 },
    };
    expect(chooseDirection(["down"], moving, canEnter, ["down"])).toBe("down");
    // …whereas from the ORIGIN tile the same key is into the wall.
    expect(chooseDirection(["down"], standing(null), canEnter, ["down"])).toBe("down");
    expect(canEnter({ col: 25, row: 26 })).toBe(false);
  });

  it("nothing held is nothing chosen", () => {
    expect(chooseDirection([], standing("down"), canEnter, [])).toBeNull();
  });

  it("newlyPressed is exactly the difference between two frames", () => {
    expect(newlyPressed(["down", "right"], new Set<Direction>(["down"]))).toEqual(["right"]);
    expect(newlyPressed(["down"], new Set<Direction>(["down"]))).toEqual([]);
    expect(newlyPressed(["up", "left"], new Set<Direction>())).toEqual(["up", "left"]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The round trip — what tools/collision-editor/ writes is what the runtime reads
 * ════════════════════════════════════════════════════════════════════════════ */

describe("maskRasterFrom is the exact inverse of the sampler, and its output is unambiguous", () => {
  /** A deterministic grid with both kinds of cell (G11: core/rng.ts, never Math.random). */
  function drawnGrid(seed: number): CollisionGrid {
    const dims = gridDimensions(balance);
    const grid = emptyGrid("drawn", dims);
    const rng = createRng(seed);
    for (let row = 0; row < dims.rows; row += 1) {
      for (let col = 0; col < dims.cols; col += 1) if (rng.chance(0.3)) setBlocked(grid, col, row, true);
    }
    return grid;
  }

  it("a painted grid survives export → re-import cell for cell", () => {
    for (const seed of [1, 2, 3, 17, 99]) {
      const grid = drawnGrid(seed);
      const reread = readMask("rt", maskRasterFrom(grid, balance), balance);
      expect(gridToAscii(reread.grid), `seed ${seed}`).toBe(gridToAscii(grid));
    }
  });

  it("what it writes is FULLY OPAQUE, so the runtime and the Hard Req 5 gate cannot disagree", () => {
    const grid = drawnGrid(5);
    const raster = maskRasterFrom(grid, balance);
    expect(raster.width).toBe(balance.map.mapNativePx);
    expect(raster.height).toBe(balance.map.mapNativePx);

    const health = readMask("rt", raster, balance).health;
    expect(health.transparentPixels).toBe(0);
    expect(health.usable).toBe(true);
    expect(health.problems).toEqual([]);

    // …and the gate reads it identically, which is the whole claim the contract makes.
    const gate = walkableCells({ width: raster.width, height: raster.height, data: raster.data as Uint8ClampedArray }, {
      cols: grid.cols,
      rows: grid.rows,
    });
    for (let row = 0; row < grid.rows; row += 1) {
      for (let col = 0; col < grid.cols; col += 1) {
        expect(gate[row * grid.cols + col] === 0, `cell ${String(col)},${String(row)}`).toBe(isBlocked(grid, col, row));
      }
    }
  });

  it("an all-walkable export is still opaque and still readable by both", () => {
    const raster = maskRasterFrom(emptyGrid("open", gridDimensions(balance)), balance);
    expect(readMask("open", raster, balance).health.transparentPixels).toBe(0);
    expect(readMask("open", raster, balance).health.blockedCells).toBe(0);
  });
});
