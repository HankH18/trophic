/**
 * tests/unit/skip-walk.test.ts — THE SKIP, as arithmetic.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * THE DECISION THIS FILE BINDS. Hank, with the design agent, verbatim:
 *
 *     "we're switching to the player character always being facing forward and doing the skipping
 *      movement as it moves around."
 *
 * So the sprite never turns — the view is `PLAYER_FORWARD_VIEW` whichever way the player walks —
 * and while moving it hops. `MovementState.facing` survives as a MOVEMENT fact (Gold's bump, an
 * interior arrival's orientation) and stops being a DRAWING one.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * WHY THERE ARE TWO FILES. This one drives the pure functions — `game/movement.ts`'s `skipOffsetPx`
 * / `skipHopIndex` and `game/mapview.ts`'s `playerSkipStep` — where the arithmetic can be pinned
 * exactly: the peak height, the landing, the phase across a multi-step frame, the fact that the
 * offset is a function of movement PROGRESS and of nothing else. §18 of
 * `tests/unit/overworld-scene.test.ts` drives the REAL scene through the same behaviour, because a
 * pure function that nothing calls is not a skip.
 *
 * THE ONE PROPERTY BOTH FILES EXIST FOR: the hop is PRESENTATION. It may not move the logical tile,
 * may not change a collision answer, and may not move the point a prop's interaction radius is
 * measured from. `spriteWorldPosition` is that point — `OverworldScene.propUnderPlayer` and
 * `game/collision.ts`'s spawn check both ask it — which is exactly why the hop is NOT folded into
 * it and is instead subtracted at the sprite, one statement before the pixels.
 */

import { describe, expect, it, vi } from "vitest";

/*
 * `game/mapview.ts` value-imports Phaser for one constant (`Phaser.Loader.Events.COMPLETE`), and
 * `import "phaser"` throws `window is not defined` under vitest's node environment. The stub carries
 * that constant and nothing else — deliberately too small to stand in for the engine, so nothing
 * here can accidentally test Phaser. Same stub, same reason, as tests/gates/dex-path-contract.test.ts.
 */
vi.mock("phaser", () => ({ default: { Loader: { Events: { COMPLETE: "complete" } } } }));

import { validateContent } from "../../core/schemas";
import type { Balance } from "../../core/types";
import {
  DIRECTIONS,
  createMovement,
  movementConfig,
  placeAt,
  queueInput,
  skipConfig,
  skipHopIndex,
  skipOffsetPx,
  spriteWorldPosition,
  stepProgress,
  update,
  type Direction,
  type MovementState,
  type SkipConfig,
} from "../../game/movement";
// eslint-disable-next-line import/first -- must follow the phaser mock above.
import {
  PLAYER_FORWARD_VIEW,
  PLAYER_STEPS,
  PLAYER_VIEWS,
  playerArtId,
  playerArtIds,
  playerSkipStep,
} from "../../game/mapview";

const content = validateContent();
const balance: Balance = content.balance;
const skip: SkipConfig = skipConfig(balance);

/** Everywhere is walkable — this file is about the motion, never about a map. */
const OPEN = (): boolean => true;
/** A pace that divides evenly, so a fraction of a step is an exact number of milliseconds. */
const STEP_MS = 100;
const cfg = movementConfig(balance, STEP_MS);

/** Standing on the origin tile with `dir` held, so the next `update` starts a step. */
function heldAt(dir: Direction): MovementState {
  return queueInput(createMovement({ col: 0, row: 0 }), dir);
}

/** Advance one state by `ms`, everything walkable. */
function tick(state: MovementState, ms: number): MovementState {
  return update(state, ms, OPEN, cfg).state;
}

/* ════════════════════════════════════════════════════════════════════════════
 * 1. The numbers are balance.json's, and they reached a reader (INV-3)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the skip's two numbers are balance keys, and the retune lands", () => {
  it("skipConfig reads the file — not a default this file wrote down", () => {
    expect(skip.hopPx).toBe(balance.map.skipHopPx);
    expect(skip.hopsPerTile).toBe(balance.map.skipHopsPerTile);
    // Survived `zBalance`'s strip, which is the whole of INV-3: a key declared in JSON alone parses
    // to `undefined` and reaches nobody. `tests/gates/guardrails.test.ts` walks every leaf; this is
    // the same claim asked of the consumer, which is the half a leaf-walk cannot make.
    expect(Number.isFinite(skip.hopPx), "balance.map.skipHopPx did not survive validation").toBe(true);
    expect(Number.isInteger(skip.hopsPerTile)).toBe(true);
    expect(skip.hopPx).toBeGreaterThan(0);
    expect(skip.hopsPerTile).toBeGreaterThan(0);
  });

  it("BINDS — retuning the amplitude changes the drawn height, through the shipped function", () => {
    const mid = tick(heldAt("right"), STEP_MS / 2);
    const shipped = skipOffsetPx(mid, skip);
    const taller = skipOffsetPx(mid, { ...skip, hopPx: skip.hopPx * 3 });
    expect(shipped, "the fixture is not mid-hop, so this measures nothing").toBeGreaterThan(0);
    expect(taller).toBeCloseTo(shipped * 3);
  });

  it("BINDS — retuning the cadence changes how many times the sprite leaves the ground per tile", () => {
    const landings = (hopsPerTile: number): number => {
      let touched = 0;
      let state = heldAt("right");
      // Sample the whole step finely and count how often the offset comes back to the ground.
      for (let i = 1; i < STEP_MS; i += 1) {
        state = tick(state, 1);
        if (state.step && skipOffsetPx(state, { ...skip, hopsPerTile }) === 0) touched += 1;
      }
      return touched;
    };
    // One hop never touches down inside the step; two touch down once, at the halfway point.
    expect(landings(1)).toBe(0);
    expect(landings(2)).toBe(1);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2. The arc: zero at rest, zero at every landing, `hopPx` at the top
 * ════════════════════════════════════════════════════════════════════════════ */

describe("skipOffsetPx is a hop — it starts on the ground and ends on the ground", () => {
  it("standing still, the sprite is on the ground", () => {
    const still = createMovement({ col: 4, row: 4 });
    expect(skipOffsetPx(still, skip)).toBe(0);
    expect(skipHopIndex(still, skip), "a standing player is on no hop").toBe(-1);
    expect(playerSkipStep(skipHopIndex(still, skip))).toBe(PLAYER_STEPS[0]);
  });

  it("mid-step it is off the ground, and at the top it is exactly skipHopPx", () => {
    const mid = tick(heldAt("up"), STEP_MS / 2);
    expect(mid.step, "the fixture never started a step").not.toBeNull();
    expect(stepProgress(mid)).toBeCloseTo(0.5);
    // The peak is the balance key itself — read from balance.json, not from skipOffsetPx.
    expect(skipOffsetPx(mid, skip)).toBeCloseTo(balance.map.skipHopPx);
  });

  it("it never goes negative, never exceeds the peak, and is on the ground at the tile boundary", () => {
    let state = heldAt("right");
    let sawAir = false;
    for (let ms = 1; ms <= STEP_MS; ms += 1) {
      state = tick(state, 1);
      const off = skipOffsetPx(state, skip);
      expect(off, `offset went negative at ${String(ms)}ms`).toBeGreaterThanOrEqual(0);
      expect(off, `offset overshot the peak at ${String(ms)}ms`).toBeLessThanOrEqual(skip.hopPx + 1e-9);
      if (off > 0) sawAir = true;
    }
    expect(sawAir, "the sprite never left the ground, so the bounds above proved nothing").toBe(true);
    // The last millisecond landed the tile; a landed player is standing, so the hop is over.
    expect(state.tile).toEqual({ col: 1, row: 0 });
    expect(skipOffsetPx(state, skip), "the sprite is still in the air on the tile it landed on").toBe(0);
  });

  it("the arc is the same whichever way the player walks — the hop has no direction", () => {
    const heights = DIRECTIONS.map((dir) => skipOffsetPx(tick(heldAt(dir), STEP_MS / 3), skip));
    expect(heights[0], "the sample is not mid-hop").toBeGreaterThan(0);
    for (const h of heights) expect(h).toBeCloseTo(heights[0] as number);
  });

  it("PURE — the same movement state always draws the same height, with no clock and no draw", () => {
    const mid = tick(heldAt("left"), STEP_MS / 4);
    const first = skipOffsetPx(mid, skip);
    const again = skipOffsetPx(mid, skip);
    // Ten more evaluations, interleaved with other work, all identical: the offset consults nothing
    // but its arguments. `Math.random` is banned repo-wide (G11) and a wall clock would make the
    // picture depend on when the frame landed — replaying a seed would not replay the screen.
    for (let i = 0; i < 10; i += 1) {
      void skipOffsetPx(tick(heldAt("down"), i + 1), skip);
      expect(skipOffsetPx(mid, skip)).toBe(first);
    }
    expect(again).toBe(first);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3. The hop index and the frame it picks
 * ════════════════════════════════════════════════════════════════════════════ */

describe("skipHopIndex counts hops, and the lead foot alternates", () => {
  it("it advances one hop per tile at the shipped cadence, and never goes backwards", () => {
    let state = queueInput(createMovement({ col: 0, row: 0 }), "right");
    let previous = -1;
    const seen: number[] = [];
    for (let i = 0; i < STEP_MS * 4; i += 1) {
      state = tick(state, 1);
      const hop = skipHopIndex(state, skip);
      if (hop < 0) continue;
      expect(hop, "the hop counter went backwards mid-walk").toBeGreaterThanOrEqual(previous);
      previous = hop;
      if (seen[seen.length - 1] !== hop) seen.push(hop);
    }
    expect(seen.length, "four tiles produced no hops at all").toBeGreaterThan(0);
    // Contiguous from zero: no hop is skipped and none is repeated out of order.
    expect(seen).toEqual(seen.map((_, i) => i));
    // …and the cadence really is at least one hop per tile walked.
    expect(state.stepsTaken, "the walk covered no ground").toBeGreaterThan(1);
    expect(seen.length).toBeGreaterThanOrEqual(state.stepsTaken * skip.hopsPerTile);
  });

  it("playerSkipStep alternates the moving frames and never rests while moving", () => {
    const moving = PLAYER_STEPS.slice(1);
    expect(moving.length, "the key grammar has no moving frames to alternate between").toBeGreaterThan(1);
    for (let hop = 0; hop < moving.length * 3; hop += 1) {
      const step = playerSkipStep(hop);
      expect(step, "a hop was drawn on the resting frame").not.toBe(PLAYER_STEPS[0]);
      expect(moving, `hop ${String(hop)} picked a frame outside the grammar`).toContain(step);
      expect(step, "the lead foot did not change between consecutive hops").not.toBe(playerSkipStep(hop + 1));
    }
    // …and the resting frame is what a standing player gets, which is the only negative case.
    expect(playerSkipStep(-1)).toBe(PLAYER_STEPS[0]);
  });

  it("the frame is DERIVED from PLAYER_STEPS — every answer is a key the pipeline can produce", () => {
    const reachable = new Set(PLAYER_STEPS.map((step) => playerArtId(PLAYER_FORWARD_VIEW, step)));
    for (let hop = -1; hop < 8; hop += 1) {
      expect(playerArtIds(), `hop ${String(hop)} asked for a key no manifest row can satisfy`).toContain(
        playerArtId(PLAYER_FORWARD_VIEW, playerSkipStep(hop)),
      );
    }
    expect(reachable.size).toBe(PLAYER_STEPS.length);
  });

  it("the forward view is one of the pipeline's views, and it is the FIRST one", () => {
    expect(PLAYER_VIEWS).toContain(PLAYER_FORWARD_VIEW);
    // Named rather than spelled out at the call sites: reversing the ruling is an edit to one line.
    expect(PLAYER_FORWARD_VIEW).toBe("front");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 4. THE MULTI-STEP FRAME — `update` resolves up to MAX_STEPS_PER_UPDATE at once
 * ════════════════════════════════════════════════════════════════════════════ */

describe("one long frame skips exactly like many short ones", () => {
  /**
   * `game/movement.ts::update` carries overrun time into the next step and will land up to
   * `MAX_STEPS_PER_UPDATE` (8) tiles out of a single `update`. A skip kept as a mutable counter
   * ticked once per `stepCompleted` would have to be replayed event by event to stay in phase;
   * `skipHopIndex` is COUNTED from `stepsTaken`, so there is nothing to fall out of phase with. This
   * is the assertion that says so.
   */
  const STEPS = 8;

  it("eight steps in one update land on the same tile, the same hop and the same height", () => {
    let short = queueInput(createMovement({ col: 0, row: 0 }), "right");
    for (let i = 0; i < STEPS; i += 1) short = tick(short, STEP_MS);
    const long = tick(queueInput(createMovement({ col: 0, row: 0 }), "right"), STEP_MS * STEPS);

    expect(short.stepsTaken, "the short run did not walk the whole distance").toBe(STEPS);
    expect(long.stepsTaken, "the long frame was clipped — this compares two truncated walks").toBe(STEPS);
    expect(long.tile).toEqual(short.tile);
    expect(skipHopIndex(long, skip)).toBe(skipHopIndex(short, skip));
    expect(skipOffsetPx(long, skip)).toBe(skipOffsetPx(short, skip));
    expect(playerSkipStep(skipHopIndex(long, skip))).toBe(playerSkipStep(skipHopIndex(short, skip)));
    expect(spriteWorldPosition(long, cfg)).toEqual(spriteWorldPosition(short, cfg));
  });

  it("a frame that lands several steps and stops mid-tile is still in phase", () => {
    // Two and a half steps in one frame, against two frames and a half-frame.
    const long = tick(queueInput(createMovement({ col: 0, row: 0 }), "down"), STEP_MS * 2 + STEP_MS / 2);
    let short = queueInput(createMovement({ col: 0, row: 0 }), "down");
    short = tick(short, STEP_MS);
    short = tick(short, STEP_MS);
    short = tick(short, STEP_MS / 2);

    expect(long.step, "the fixture did not stop mid-tile, so nothing here is about phase").not.toBeNull();
    expect(stepProgress(long)).toBeCloseTo(0.5);
    expect(long.tile).toEqual(short.tile);
    expect(skipHopIndex(long, skip)).toBe(skipHopIndex(short, skip));
    expect(skipOffsetPx(long, skip)).toBe(skipOffsetPx(short, skip));
    // …and it is genuinely airborne, so "in phase" is not "both on the ground".
    expect(skipOffsetPx(long, skip)).toBeGreaterThan(0);
  });

  it("the hop does not restart at every tile — consecutive steps chain into one continuous skip", () => {
    // The last instant of one step and the first of the next are both on the ground, and the middle
    // of each is at the peak. That is what makes it a skip rather than a stutter.
    let state = queueInput(createMovement({ col: 0, row: 0 }), "right");
    const peaks: number[] = [];
    for (let step = 0; step < 3; step += 1) {
      state = tick(state, STEP_MS / 2);
      peaks.push(skipOffsetPx(state, skip));
      state = tick(state, STEP_MS / 2);
      expect(skipOffsetPx(state, skip), `tile ${String(step)} did not land on the ground`).toBe(0);
    }
    expect(peaks).toHaveLength(3);
    for (const peak of peaks) expect(peak).toBeCloseTo(balance.map.skipHopPx);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 5. PRESENTATION ONLY — the hop moves the picture and nothing else
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the skip cannot move the player", () => {
  it("spriteWorldPosition — the point props and spawns are measured from — carries no hop", () => {
    /*
     * THE DEFECT THIS FORBIDS. `OverworldScene.propUnderPlayer()` calls
     * `propAt(node, spriteWorldPosition(movement, cfg), balance)`, and `game/collision.ts`
     * `chooseSpawnTile` asks the same function whether a spawn tile is clear of a prop. Fold the hop
     * into it and a sign becomes talkable at the top of a bounce and not at the bottom.
     *
     * Asserted as a magnitude, not as a shape: at the peak the sprite is `skipHopPx` above the point
     * this function returns, so if the two ever agree mid-hop the hop has leaked into the reach.
     */
    const mid = tick(heldAt("right"), STEP_MS / 2);
    const reach = spriteWorldPosition(mid, cfg);
    const drawnY = reach.y - skipOffsetPx(mid, skip);
    expect(reach.y - drawnY, "the sprite is drawn where the reach is measured — the hop is not real").toBeCloseTo(
      balance.map.skipHopPx,
    );
    // The hop is VERTICAL. Asserted as a bound rather than by restating the formula: a hop is a
    // height, so nothing it produces may reach an x, and the peak stays inside half a tile so the
    // sprite never floats into the row above.
    expect(skip.hopPx * 2).toBeLessThanOrEqual(balance.map.tileStepPx);
  });

  it("the walk is identical under a hop three tiles tall and a hop of one pixel", () => {
    /*
     * The strongest form of "presentation only" available without a scene: run the SAME scripted
     * walk under two wildly different skips and compare everything the simulation can see — the
     * logical tile, and the world point `propUnderPlayer` and `chooseSpawnTile` measure from. Only
     * the DRAWN height may differ, and it must, or the comparison above is vacuous.
     */
    const tall: SkipConfig = { hopPx: balance.map.tileStepPx * 3, hopsPerTile: skip.hopsPerTile };
    const flat: SkipConfig = { hopPx: 1, hopsPerTile: skip.hopsPerTile };

    const run = (s: SkipConfig): { tiles: string[]; feet: string[]; drawn: string[] } => {
      let state = createMovement({ col: 5, row: 5 });
      const tiles: string[] = [];
      const feet: string[] = [];
      const drawn: string[] = [];
      for (const dir of ["right", "down", "left", "up", "right", "right"] as const) {
        state = queueInput(state, dir);
        for (let i = 0; i < 4; i += 1) {
          state = tick(state, STEP_MS / 4);
          tiles.push(`${String(state.tile.col)},${String(state.tile.row)}`);
          const p = spriteWorldPosition(state, cfg);
          feet.push(`${p.x.toFixed(4)},${p.y.toFixed(4)}`);
          drawn.push(`${p.x.toFixed(4)},${(p.y - skipOffsetPx(state, s)).toFixed(4)}`);
        }
      }
      return { tiles, feet, drawn };
    };

    const a = run(tall);
    const b = run(flat);
    expect(a.tiles.length, "the scripted walk took no samples").toBeGreaterThan(10);
    expect(new Set(a.tiles).size, "the walk never moved, so identical tiles prove nothing").toBeGreaterThan(1);
    expect(b.tiles, "a taller hop walked a different path").toEqual(a.tiles);
    expect(b.feet, "a taller hop moved the point props are measured from").toEqual(a.feet);
    // …and it really did draw differently, so the two equalities above are not comparing nothing.
    expect(b.drawn).not.toEqual(a.drawn);
    const mid = tick(heldAt("right"), STEP_MS / 2);
    expect(skipOffsetPx(mid, tall)).toBeGreaterThan(balance.map.tileStepPx);
    expect(skipOffsetPx(mid, flat)).toBeLessThan(balance.map.tileStepPx);
  });

  it("a teleport lands clean — no hop survives placeAt", () => {
    const airborne = tick(heldAt("right"), STEP_MS / 2);
    expect(skipOffsetPx(airborne, skip), "the fixture is not airborne").toBeGreaterThan(0);
    const landed = placeAt(airborne, { col: 9, row: 9 });
    expect(skipOffsetPx(landed, skip)).toBe(0);
    expect(skipHopIndex(landed, skip)).toBe(-1);
    expect(playerSkipStep(skipHopIndex(landed, skip))).toBe(PLAYER_STEPS[0]);
  });

  it("the bump does not hop — a blocked press turns the model and leaves the sprite standing", () => {
    // Gold's bump is a real mechanic (it is how you face a sign). It starts no step, so there is
    // nothing to hop through, and `facing` moves while the picture does not.
    const wall = queueInput(createMovement({ col: 0, row: 0 }, "down"), "up");
    const after = update(wall, STEP_MS, () => false, cfg).state;
    expect(after.tile).toEqual({ col: 0, row: 0 });
    expect(after.facing, "the bump did not turn the model").toBe("up");
    expect(skipOffsetPx(after, skip)).toBe(0);
    expect(playerSkipStep(skipHopIndex(after, skip))).toBe(PLAYER_STEPS[0]);
  });
});
