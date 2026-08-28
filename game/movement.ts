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
 *   • `facing` IS NOT WHAT IS DRAWN. The player always faces the viewer and skips as they move —
 *     see "The skip" at the bottom of this file for the ruling and for why the hop is deliberately
 *     not folded into {@link spriteWorldPosition}.
 *
 * **Grid-locked in WORLD space regardless of the painted art's projection.** The maps are painted
 * three-quarter overhead (build-doc §9.2), which is a look, not a coordinate system. This module
 * knows only an axis-aligned 32px lattice over the 2048² world; nothing here ever consults the
 * picture. That is the whole reason the one-mask-six-years claim (Hard Req 5) survives the art
 * ageing under it.
 *
 * ENGINE-FREE. No Phaser import: the scene owns keyboard reading and drawing, this owns the rules.
 *
 * NUMBERS (G11): the tile step, the sprite size and the walk pace are all `balance.map` — there is
 * no gameplay constant written in this file. Pace was a literal (`DEFAULT_MS_PER_TILE = 160`) on the
 * argument that it changes how the game FEELS rather than what the simulation does, which is true
 * and is still written on {@link movementConfig} — but INV-3 says a retune is an edit to
 * data/balance.json and nothing else, and a number no retune can reach is a number in the wrong
 * place whatever it governs. It is now `balance.map.walkMsPerTile`, still overridable per call.
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
  /** Milliseconds one tile takes — `balance.map.walkMsPerTile` unless a call site overrides it. */
  msPerTile: number;
  /** build-doc §7.6 — the 32×48 logical sprite, for {@link spriteWorldPosition}. */
  spriteW: number;
  spriteH: number;
}

/**
 * Presentation pace, from `balance.map.walkMsPerTile`. The shipped 160ms is four tiles a second,
 * which reads as a brisk Gold walk at the 480×320 virtual resolution.
 *
 * It is a FEEL value rather than a simulation one — no encounter rate or population depends on it,
 * because a foray is counted in STEPS (`balance.encounter.stepsPerForay`), so a faster walk costs
 * exactly the same ticks. That is why it can be overridden per call (the scene tests drive movement
 * at their own pace). It still belongs in balance.json: it was a literal here, and INV-3 says a
 * retune is an edit to data/balance.json and nothing else. The override is a parameter, not a
 * second home — pass nothing and the file decides.
 */
export function movementConfig(balance: Balance, msPerTile = balance.map.walkMsPerTile): MovementConfig {
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
 *
 * ⚠ THIS IS THE TIE-BREAK PRIMITIVE, NOT THE INPUT RULE. It knows nothing about walls, so on its own
 * it deadlocks: hold a direction into a wall and its `previous` clause re-elects that direction
 * every frame, and a second direction with an open path in front of it never gets a turn. The scene
 * calls {@link chooseDirection}, which is the whole rule. See that function's header.
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

/**
 * Which of the currently-held directions the player actually goes, given what is in front of them.
 *
 * THE DEFECT THIS EXISTS TO FIX, measured in the running game: the player stood at (25,25) with
 * (25,26) blocked and (26,25) wide open, held Down (bump, `queued` stays "down"), then ALSO held
 * Right — and did not move for as long as both keys were down. {@link resolveInput}'s `previous`
 * clause re-elected the blocked direction on every frame, and a bump never clears `queued`
 * (`beginStep` returns `{...state, facing: dir}` and deliberately leaves the buffer alone). The
 * player was frozen with an open path under their thumb. Pokémon Gold, which this module's header
 * cites, resolves it the other way round: the most recent press wins.
 *
 * The rule, as an ordered candidate list — first candidate whose target tile is enterable wins:
 *
 *   1. **directions pressed THIS frame** (Gold's "most recent press wins"). Several in one frame is
 *      a tie, broken by {@link DIRECTIONS} order so the answer stays a function of the inputs;
 *   2. the direction already buffered, if it is still held — continuous walking, no stutter when a
 *      perpendicular key is brushed;
 *   3. everything else held, in {@link DIRECTIONS} order.
 *
 * If NO candidate is enterable the first one is returned anyway, so walking into a wall still turns
 * you and still emits the bump: Gold's bump is a mechanic (it is how you face a sign), not a
 * failure, and this function must not quietly swallow it.
 *
 * `canEnter` is asked about the tile the step would START from — the destination of a step already
 * in flight, otherwise the current tile — so a direction buffered mid-step is judged against where
 * the player will actually be when it is applied.
 */
export function chooseDirection(
  pressed: Iterable<Direction>,
  state: MovementState,
  canEnter: TilePredicate,
  justPressed: Iterable<Direction> = [],
): Direction | null {
  const held = new Set<Direction>(pressed);
  if (held.size === 0) return null;

  const fresh = new Set<Direction>();
  for (const dir of justPressed) if (held.has(dir)) fresh.add(dir);

  const candidates: Direction[] = [];
  const push = (dir: Direction | null | undefined): void => {
    if (dir && held.has(dir) && !candidates.includes(dir)) candidates.push(dir);
  };
  for (const dir of DIRECTIONS) if (fresh.has(dir)) push(dir);
  push(state.queued);
  for (const dir of DIRECTIONS) push(dir);

  const origin = state.step ? state.step.to : state.tile;
  for (const dir of candidates) if (canEnter(targetTile(origin, dir))) return dir;
  return candidates[0] ?? null;
}

/**
 * Directions held now that were not held on the previous frame.
 *
 * Kept here rather than in the scene because "most recent press wins" is a movement rule, and the
 * scene's job is only to say which keys are down. Pure: hand it both frames' sets.
 */
export function newlyPressed(
  pressed: Iterable<Direction>,
  heldLastFrame: ReadonlySet<Direction>,
): Direction[] {
  const out: Direction[] = [];
  const now = new Set<Direction>(pressed);
  for (const dir of DIRECTIONS) if (now.has(dir) && !heldLastFrame.has(dir)) out.push(dir);
  return out;
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

/**
 * 0..1 through the current step — the skip's PHASE (build-doc §9.6 step 4's bob).
 *
 * It used to say "the walk-cycle frame picker and the bob". There is no frame picker: §9.6's bob is
 * procedural and the player is ONE sprite (`game/mapview.ts` {@link playerArtIds}). That sentence is
 * corrected rather than deleted because it is what made a three-frame walk cycle look like the
 * shipped plan to more than one reader.
 */
export function stepProgress(state: MovementState): number {
  const step = state.step;
  if (!step) return 0;
  return Math.min(1, step.elapsedMs / step.durationMs);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The skip
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE PLAYER DOES NOT TURN. Hank's ruling, verbatim: *"we're switching to the player character
 *  always being facing forward and doing the skipping movement as it moves around."*
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * So {@link MovementState.facing} survives as a MOVEMENT fact and stops being a DRAWING one. It is
 * still what Gold's bump sets, still what {@link placeAt} carries through a door, and still what the
 * `turned` event reports — every one of those is about where the player is pointed in the model, and
 * `game/scenes/OverworldScene.ts` uses it to orient an interior arrival. Nothing reads it to pick a
 * texture any more; the view is always the forward one (`game/mapview.ts` `PLAYER_FORWARD_VIEW`).
 *
 * WHY THE HOP LIVES HERE AND NOT IN {@link spriteWorldPosition}. Because that function is not only
 * the draw position: `OverworldScene.propUnderPlayer()` asks it where the player is standing, and
 * `game/collision.ts` `chooseSpawnTile` asks it whether a spawn is clear of props. A hop folded into
 * it would move the point a prop's interaction radius is measured from — a sign you could talk to at
 * the top of a bounce and not at the bottom. The hop is therefore a SEPARATE offset that only the
 * scene's sprite-sync adds, and `tests/unit/skip-walk.test.ts` asserts the separation directly.
 *
 * PURE, and a function of movement PROGRESS rather than of any clock. `Math.random` is banned
 * repo-wide (G11) and a wall clock would make the sprite's position depend on when the frame landed,
 * which is the same defect wearing a different hat: replaying a seed would not replay the picture.
 * Everything below is decided by `(stepsTaken, elapsedMs / durationMs)` and nothing else, so a
 * frame long enough to resolve eight steps lands on exactly the offset the eight short frames would
 * have — see {@link skipHopIndex} on why the index is counted from `stepsTaken` rather than
 * incremented per landing.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface SkipConfig {
  /** Peak hop height above the resting draw position, in world px — `balance.map.skipHopPx`. */
  hopPx: number;
  /** Widest lateral lean, in world px — `balance.map.skipSwayPx`. */
  swayPx: number;
  /** Hops per tile step — `balance.map.skipHopsPerTile`. A whole number ≥ 1. */
  hopsPerTile: number;
}

/** The skip's three numbers, from balance.json. No literal here is a tunable (G11). */
export function skipConfig(balance: Balance): SkipConfig {
  return {
    hopPx: balance.map.skipHopPx,
    swayPx: balance.map.skipSwayPx,
    hopsPerTile: wholeHops(balance.map.skipHopsPerTile),
  };
}

/**
 * At least one whole hop per tile.
 *
 * `core/schemas.ts` already refuses anything else at boot, so this can never fire on shipped data.
 * It is here because these functions are called with a hand-built {@link SkipConfig} in tests and in
 * the balance harness, and a fractional or zero divisor would silently produce a hop that never
 * lands rather than a loud failure.
 */
function wholeHops(hopsPerTile: number): number {
  const whole = Math.trunc(hopsPerTile);
  return whole < 1 ? 1 : whole;
}

/**
 * Which hop of the whole walk is in the air right now — a monotone counter, `-1` while standing.
 *
 * COUNTED, NEVER INCREMENTED. `stepsTaken × hopsPerTile + the hop within this step` is a pure
 * function of the movement state, so the multi-step frame costs nothing: `game/movement.ts::update`
 * can land up to `MAX_STEPS_PER_UPDATE` steps between two draws, and an index kept as a mutable
 * counter ticked once per `stepCompleted` would have to be replayed event by event to stay in phase.
 * This cannot fall out of phase, because there is nothing to fall out of phase WITH.
 *
 * Its parity is which foot leads (`game/mapview.ts` `playerSkipStep`).
 */
export function skipHopIndex(state: MovementState, skip: SkipConfig): number {
  if (!state.step) return -1;
  const hops = wholeHops(skip.hopsPerTile);
  // `stepProgress` is clamped to 1, so the floor can reach `hops`; the last hop of the step owns it.
  const within = Math.min(hops - 1, Math.floor(stepProgress(state) * hops));
  return state.stepsTaken * hops + within;
}

/**
 * How far ABOVE its resting position the sprite is drawn, in world px. Never negative.
 *
 * Zero while standing still and zero at every landing, which is what makes the motion a skip rather
 * than a drift: `4p(1−p)` is the ballistic arc a thrown thing follows — 0 at both ends, `hopPx` at
 * the top — evaluated on `p`, the fraction through the CURRENT hop. Because `hopsPerTile` is a whole
 * number, `p` returns to 0 exactly on the tile boundary, so consecutive steps chain into one
 * continuous skip instead of jerking at each tile.
 *
 * A parabola rather than a sine on purpose: a hop is a ballistic arc, and this needs no trig, so the
 * offset is exact float arithmetic that replays bit-for-bit from the same movement state.
 */
export function skipOffsetPx(state: MovementState, skip: SkipConfig): number {
  if (!state.step) return 0;
  const hops = wholeHops(skip.hopsPerTile);
  const t = stepProgress(state) * hops;
  const p = t - Math.floor(t);
  return skip.hopPx * 4 * p * (1 - p);
}

/** Teleport (a node transition): drop any step in flight and land clean on a tile. */
export function placeAt(
  state: MovementState,
  tile: TilePosition,
  facing: Direction = state.facing,
): MovementState {
  return { ...state, tile: { ...tile }, facing, step: null, queued: null };
}
