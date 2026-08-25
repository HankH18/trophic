/**
 * game/movement.ts — Gold-style grid movement.
 *
 * build-doc §7.6: "Player logical sprite 32×48, tile step 32px, grid movement Gold-style."
 *
 * What "Gold-style" means here, concretely, and each clause is a test:
 *   • The player's position is a TILE, never a float. The float is only the tween between tiles.
 *   • One step is one whole tile. A step, once started, always finishes — there is no stopping or
 *     turning mid-tile, which is exactly what makes an encounter roll "per step" a well-defined
 *     thing (game/encounters.ts) instead of a per-frame lottery.
 *   • Four directions. NO DIAGONALS, ever — {@link queueInput} takes one direction, so the
 *     impossible state is not representable rather than filtered out later.
 *   • Input is QUEUED: a direction pressed during a step is remembered and applied the instant the
 *     step lands, so holding a key walks continuously and a turn at a corner never drops a frame.
 *   • Pressing into a wall TURNS you and does not move you (the Gold "bump"). That is a real
 *     mechanic, not a failure: it is how you face a sign or a prop to interact with it.
 *
 * **Grid-locked in WORLD space regardless of the painted art's projection.** The maps are painted
 * three-quarter overhead (build-doc §9.2), which is a look, not a coordinate system. This module
 * knows only an axis-aligned 32px lattice over the 2048² world; nothing here ever consults the
 * picture. That is the whole reason the one-mask-six-years claim (Hard Req 5) survives the art
 * ageing under it.
 *
 * ENGINE-FREE. No Phaser import: the scene owns keyboard reading and drawing, this owns the rules.
 *
 * NUMBERS (G11): the tile step and the sprite size are `balance.map`. Walk PACE is not in
 * balance.json and is not a gameplay constant — it changes how the game feels, not what the
 * simulation does — so it is a presentation default here, overridable per call. Flagged in the lane
 * report: if pace should be tunable it wants a `balance.map` key, and data/ was read-only to C2.
 */

import type { Balance } from "../core/types";

/* ────────────────────────────────────────────────────────────────────────────
 * Directions — a closed set of four (no diagonal is representable)
 * ──────────────────────────────────────────────────────────────────────────── */

export const DIRECTIONS = ["up", "down", "left", "right"] as const;
export type Direction = (typeof DIRECTIONS)[number];

const DELTAS: Record<Direction, { dCol: number; dRow: number }> = {
  up: { dCol: 0, dRow: -1 },
  down: { dCol: 0, dRow: 1 },
  left: { dCol: -1, dRow: 0 },
  right: { dCol: 1, dRow: 0 },
};

export function delta(dir: Direction): { dCol: number; dRow: number } {
  return DELTAS[dir];
}

export function isDirection(value: string): value is Direction {
  return (DIRECTIONS as readonly string[]).includes(value);
}

/* ────────────────────────────────────────────────────────────────────────────
 * State
 * ──────────────────────────────────────────────────────────────────────────── */

export interface TilePosition {
  col: number;
  row: number;
}

/** The tween in flight. Null while the player is standing still on a tile. */
export interface StepInFlight {
  from: TilePosition;
  to: TilePosition;
  dir: Direction;
  elapsedMs: number;
  durationMs: number;
}

export interface MovementState {
  /** Logical tile. This is the position; everything else is presentation. */
  tile: TilePosition;
  facing: Direction;
  step: StepInFlight | null;
  /** Direction buffered during a step, applied the moment it lands. */
  queued: Direction | null;
  /**
   * Completed steps since this state was created. game/encounters.ts counts forays in these:
   * `balance.encounter.stepsPerForay` of them is one foray, i.e. one clock tick (build-doc §3 L8).
   */
  stepsTaken: number;
}

export interface MovementConfig {
  /** build-doc §7.6 — 32px tile step, in WORLD pixels. */
  tileStepPx: number;
  /** Milliseconds one tile takes. Presentation pace, not a balance tunable (see file header). */
  msPerTile: number;
  /** build-doc §7.6 — the 32×48 logical sprite, for {@link spriteWorldPosition}. */
  spriteW: number;
  spriteH: number;
}

/**
 * Presentation pace. Four tiles a second reads as a brisk Gold walk at the 480×320 virtual
 * resolution; it is a feel value, deliberately not in balance.json, and every call site can override
 * it. It is NOT a gameplay constant: no simulation number, encounter rate or population depends on
 * it — a foray is counted in STEPS, so a faster walk costs exactly the same ticks.
 */
const DEFAULT_MS_PER_TILE = 160;

export function movementConfig(balance: Balance, msPerTile = DEFAULT_MS_PER_TILE): MovementConfig {
  return {
    tileStepPx: balance.map.tileStepPx,
    msPerTile,
    spriteW: balance.map.playerSpriteW,
    spriteH: balance.map.playerSpriteH,
  };
}

export function createMovement(start: TilePosition, facing: Direction = "down"): MovementState {
  return { tile: { ...start }, facing, step: null, queued: null, stepsTaken: 0 };
}

export function isMoving(state: MovementState): boolean {
  return state.step !== null;
}

/** The tile a step in this direction would land on. */
export function targetTile(from: TilePosition, dir: Direction): TilePosition {
  const d = delta(dir);
  return { col: from.col + d.dCol, row: from.row + d.dRow };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Events — what the scene reacts to
 * ──────────────────────────────────────────────────────────────────────────── */

export type MovementEvent =
  /** Turned on the spot without moving: either a deliberate turn or a bump into a wall. */
  | { t: "turned"; facing: Direction; bumped: boolean }
  | { t: "stepStarted"; dir: Direction; from: TilePosition; to: TilePosition }
  /**
   * A whole tile has been travelled. THIS is a "foray step" (build-doc §4: "A foray step rolls
   * encounters") — the scene rolls an encounter here and nowhere else.
   */
  | { t: "stepCompleted"; dir: Direction; tile: TilePosition; stepsTaken: number }
  /** Tried to enter a blocked tile. The player turned to face it and stayed put. */
  | { t: "blocked"; dir: Direction; from: TilePosition; into: TilePosition };

export interface MovementResult {
  state: MovementState;
  events: MovementEvent[];
}

/** Can the player stand here? The scene supplies this from game/collision.ts. */
export type TilePredicate = (tile: TilePosition) => boolean;

/* ────────────────────────────────────────────────────────────────────────────
 * Input
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Register a direction press. Pure: hands back a new state with the direction buffered.
 *
 * The buffer holds exactly ONE direction — the latest — which is what makes held-key movement
 * continuous and cornering responsive without ever producing a diagonal. Passing null clears it
 * (all keys released), so the player stops at the end of the current tile rather than coasting.
 */
export function queueInput(state: MovementState, dir: Direction | null): MovementState {
  if (state.queued === dir) return state;
  return { ...state, queued: dir };
}

/**
 * Resolve simultaneous key presses to at most one direction. NO DIAGONALS: the pressed set is
 * reduced to a single answer here, once, rather than being carried around as a vector.
 *
 * `previous` (the direction already being held) wins a tie, so running along a wall while brushing
 * the perpendicular key does not stutter; otherwise the fixed order of {@link DIRECTIONS} decides,
 * which makes the answer deterministic and therefore testable.
 */
export function resolveInput(
  pressed: Iterable<Direction>,
  previous: Direction | null = null,
): Direction | null {
  const set = new Set<Direction>(pressed);
  if (set.size === 0) return null;
  if (previous && set.has(previous)) return previous;
  for (const dir of DIRECTIONS) if (set.has(dir)) return dir;
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The step machine
 * ──────────────────────────────────────────────────────────────────────────── */

function beginStep(
  state: MovementState,
  dir: Direction,
  canEnter: TilePredicate,
  cfg: MovementConfig,
  events: MovementEvent[],
): MovementState {
  const turned = state.facing !== dir;
  const to = targetTile(state.tile, dir);

  if (!canEnter(to)) {
    // Gold's bump: you face the wall, you do not enter it. Both facts are events, because the scene
    // needs the facing (to interact with what you bumped) and the block (to play the bump sound).
    if (turned) events.push({ t: "turned", facing: dir, bumped: true });
    events.push({ t: "blocked", dir, from: { ...state.tile }, into: to });
    return { ...state, facing: dir };
  }

  if (turned) events.push({ t: "turned", facing: dir, bumped: false });
  events.push({ t: "stepStarted", dir, from: { ...state.tile }, to });
  return {
    ...state,
    facing: dir,
    step: { from: { ...state.tile }, to, dir, elapsedMs: 0, durationMs: Math.max(1, cfg.msPerTile) },
  };
}

/**
 * Sanity bound on steps resolved in one update. A frame long enough to hit this is a debugger
 * breakpoint or a backgrounded tab, and walking a hundred tiles on resume would roll a hundred
 * encounters the player never took.
 */
const MAX_STEPS_PER_UPDATE = 8;

/**
 * Advance movement by `dtMs`.
 *
 * Time that overruns the end of a step CARRIES into the next one, so a long frame walks the same
 * distance as several short ones and a slow machine does not silently under-walk (which would make
 * the per-step encounter rate depend on frame rate — a gameplay number set by hardware).
 *
 * The loop is bounded by `dtMs`, not by iterations: each pass consumes at least one whole step's
 * duration, and `durationMs` is clamped to ≥ 1.
 */
export function update(
  state: MovementState,
  dtMs: number,
  canEnter: TilePredicate,
  cfg: MovementConfig,
): MovementResult {
  const events: MovementEvent[] = [];
  let next = state;
  let remaining = Math.max(0, dtMs);

  // Standing still: start a step if one is queued.
  if (!next.step && next.queued) next = beginStep(next, next.queued, canEnter, cfg, events);

  let guard = 0;
  while (next.step && remaining > 0) {
    guard += 1;
    if (guard > MAX_STEPS_PER_UPDATE) break;

    const step = next.step;
    const left = step.durationMs - step.elapsedMs;
    if (remaining < left) {
      next = { ...next, step: { ...step, elapsedMs: step.elapsedMs + remaining } };
      remaining = 0;
      break;
    }

    remaining -= left;
    const landed: MovementState = {
      ...next,
      tile: { ...step.to },
      facing: step.dir,
      step: null,
      stepsTaken: next.stepsTaken + 1,
    };
    events.push({ t: "stepCompleted", dir: step.dir, tile: { ...step.to }, stepsTaken: landed.stepsTaken });
    next = landed.queued ? beginStep(landed, landed.queued, canEnter, cfg, events) : landed;
  }

  return { state: next, events };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Presentation
 * ──────────────────────────────────────────────────────────────────────────── */

/** Interpolated world position of the player's FEET tile, top-left corner. */
export function worldPosition(state: MovementState, cfg: MovementConfig): { x: number; y: number } {
  const step = state.step;
  if (!step) return { x: state.tile.col * cfg.tileStepPx, y: state.tile.row * cfg.tileStepPx };
  const t = Math.min(1, step.elapsedMs / step.durationMs);
  const fromX = step.from.col * cfg.tileStepPx;
  const fromY = step.from.row * cfg.tileStepPx;
  return {
    x: fromX + (step.to.col - step.from.col) * cfg.tileStepPx * t,
    y: fromY + (step.to.row - step.from.row) * cfg.tileStepPx * t,
  };
}

/**
 * Where to draw the 32×48 sprite, as a CENTRE point.
 *
 * The sprite is taller than the tile because the art overhangs upward (head and cap); its feet sit
 * on the tile. So the centre is half a tile in from the left and half a SPRITE up from the tile's
 * bottom edge — which is what makes a character standing at the foot of a painted rock overlap it
 * correctly instead of floating.
 */
export function spriteWorldPosition(
  state: MovementState,
  cfg: MovementConfig,
): { x: number; y: number } {
  const feet = worldPosition(state, cfg);
  return { x: feet.x + cfg.tileStepPx / 2, y: feet.y + cfg.tileStepPx - cfg.spriteH / 2 };
}

/** 0..1 through the current step — the walk-cycle frame picker and the bob (build-doc §9.6). */
export function stepProgress(state: MovementState): number {
  const step = state.step;
  if (!step) return 0;
  return Math.min(1, step.elapsedMs / step.durationMs);
}

/** Teleport (a node transition): drop any step in flight and land clean on a tile. */
export function placeAt(
  state: MovementState,
  tile: TilePosition,
  facing: Direction = state.facing,
): MovementState {
  return { ...state, tile: { ...tile }, facing, step: null, queued: null };
}
