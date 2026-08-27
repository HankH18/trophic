/**
 * core/interiors.ts — the building interiors: model, schema and loader.
 *
 * WHAT AN INTERIOR IS, AND WHAT IT IS NOT
 * ───────────────────────────────────────
 * An interior is **not a node.** It is a separate model keyed to its parent town by
 * `parentNode`, and `SaveFile.currentNode` keeps naming the TOWN while the player is inside one.
 * Every existing node reader therefore keeps resolving, unchanged.
 *
 * That is a decision with measured reasons, recorded here because the alternative looks tempting
 * from a distance:
 *   • a 13th `data/nodes/*.json` needs a painted base map — `tests/unit/manifest.test.ts` asserts
 *     one manifest `mapAsset` row per node — and it trips six hard-pinned node counts across
 *     `tests/gates/schemas.test.ts`, `tests/gates/guardrails.test.ts` (a filesystem walk, so it
 *     fires even for a node nothing registers) and `tests/unit/transcription.test.ts`;
 *   • it would make "node" mean two things: an ecological entity, and an entity with no ecology.
 *
 * G3 — AN INTERIOR CARRIES NO POPULATIONS. A floor plan names cells and anchors; it never names a
 * species. There is no `populations`, no `spawnTables`, no weight of any kind in this file or in
 * `data/interiors/*.json`, and there never may be. Ecology lives on the node.
 *
 * G2 — NOTHING HERE IS INVENTED. Every blueprint carries `_featureSource`, quoting the shipped
 * dialogue line each physical feature was derived from, in the same discipline
 * `tools/comfy/manifest.json`'s `_nodes` block uses. Where the canon says nothing, the blueprint
 * says so in `_canonSilent` rather than filling the gap with a plausible guess.
 *
 * ══ THE ASCII PLAN, AND WHY THIS FILE DOES NOT PARSE IT INTO A GRID ══
 *
 * `game/collision.ts`'s `gridFromAscii(nodeId, ascii, cellPx)` is the ONE thing that turns an ASCII
 * picture into a `CollisionGrid`. It blocks `#` and treats every other character as floor — which
 * is the load-bearing property this model is built on: a plan can carry `D` for a doorway, `@` for
 * a person and `S` for a service tile, and those parse as walkable floor while a SECOND PASS over
 * the same string — this file — reads them as anchors.
 *
 * This module deliberately does NOT build a grid, pack bits, or duplicate that parser:
 *   • `core/` may not import `game/`. That is not opinion — `tests/gates/guardrails.test.ts`'s
 *     `no_phaser_in_core` walks core's transitive import closure and fails on any file under
 *     `game/`, and separately pins core's reachable package set to exactly `["zod"]`.
 *   • So phase 2 (the Phaser scene) calls `gridFromAscii(bp.id, bp.plan, balance.map.collisionCellPx)`
 *     itself. Pass `collisionCellPx` — `gridDimensions()` derives its own cell size from the map's
 *     native width and breaks at any room narrower than the full 64-cell lattice.
 *
 * The one predicate that unavoidably overlaps is "is this cell solid", and it is declared exactly
 * once, here, as {@link PLAN_SOLID}. `tests/unit/interiors.test.ts` pins this file's answer to
 * `gridFromAscii`'s answer cell-for-cell across every shipped plan and a set of adversarial ones,
 * so the day the two disagree is a red test rather than a player walking through a counter.
 * The standing HANDOFF is to collapse the overlap by moving the lexer into `core/`.
 *
 * SCALE. One plan cell is one movement tile, exactly, at any room size: `collisionCellPx` is 16,
 * the world cell is 16 × `mapRenderScale` = 32, and `tileStepPx` is 32. Nothing here needs to know
 * that, which is why no number below is a dimension.
 *
 * ARRIVAL IS EXPLICIT, ON PURPOSE. `game/collision.ts`'s `chooseSpawnTile` spirals out from the
 * centre of a fixed 64x64 lattice, so on a room a dozen tiles wide it lands far outside the room.
 * It cannot find a door. {@link InteriorBlueprint.arrival} carries the cell instead.
 *
 * NUMBERS (G11). There is no gameplay constant in this file. Room dimensions are read off the
 * plan; door positions and anchor cells are read off the blueprint JSON. The only literals are 0
 * and 1 — an index base and a step — which is what the no_magic_numbers gate calls a structural
 * identity.
 */

import { z } from "zod";

import { DIALOGUE } from "./dialogue-schema";

import hearthollowInnJson from "../data/interiors/hearthollow-inn.json";
import hearthollowSupplyJson from "../data/interiors/hearthollow-supply.json";
import brackwaterInnJson from "../data/interiors/brackwater-inn.json";
import brackwaterSupplyJson from "../data/interiors/brackwater-supply.json";

/* ────────────────────────────────────────────────────────────────────────────
 * The plan alphabet — one declaration, and the legend every blueprint restates
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The solid cell. **The only character `gridFromAscii` blocks**, so it is the only character that
 * can stand for anything the player cannot walk through: an outside wall, a partition, a counter,
 * a trestle. Which of those a given solid run is, is not guessed from the picture — a `service`
 * anchor's {@link InteriorAnchor.faces} points at the fixture it transacts across, and the
 * anchor's `_purpose` names it in plain words.
 */
export const PLAN_SOLID = "#";

/** Open floor. Nothing stands on it. */
export const PLAN_FLOOR = ".";

/** The doorway cell: the threshold, cut into a wall run, that leads back out to the parent town. */
export const PLAN_DOOR = "D";

/** The cell a named speaker stands on. Walkable to the parser; occupied in fact. */
export const PLAN_SPEAKER = "@";

/** The cell the player stands on to trigger a service. */
export const PLAN_SERVICE = "S";

/** Every character a plan may legally contain. A plan carrying anything else is refused. */
export const PLAN_ALPHABET: readonly string[] = [
  PLAN_SOLID,
  PLAN_FLOOR,
  PLAN_DOOR,
  PLAN_SPEAKER,
  PLAN_SERVICE,
];

export const FACINGS = ["north", "south", "east", "west"] as const;
export type Facing = (typeof FACINGS)[number];

/** Unit step for a facing, in plan cells. Only -1, 0 and 1 appear: a facing is one cell of travel. */
const FACING_STEP: Record<Facing, { dCol: number; dRow: number }> = {
  north: { dCol: 0, dRow: -1 },
  south: { dCol: 0, dRow: 1 },
  east: { dCol: 1, dRow: 0 },
  west: { dCol: -1, dRow: 0 },
};

/* ────────────────────────────────────────────────────────────────────────────
 * The model
 * ──────────────────────────────────────────────────────────────────────────── */

/** A cell of the ASCII plan. Column 0, row 0 is the top-left character of the first line. */
export interface PlanCell {
  col: number;
  row: number;
}

/**
 * Where an interior's door stands in its PARENT TOWN.
 *
 * `x`/`y` are map-NATIVE pixels — the same space `PropPlacement.x/y` uses (build-doc §7.6: the
 * painted town is 1024² native, rendered at `mapRenderScale`). `facing` is the compass direction
 * the player approaches from, and it agrees with the wall the plan cuts `D` into.
 */
export interface InteriorDoor {
  /** Plain words about this placement — including how provisional it is. Documentation. */
  _note: string;
  x: number;
  y: number;
  facing: Facing;
}

/** The tile a service is triggered from, or the tile a named speaker occupies. */
export type InteriorAnchorKind = "service" | "speaker";

interface InteriorAnchorBase {
  /** Unique within the blueprint. Names the anchor for the scene layer, not for the player. */
  id: string;
  col: number;
  row: number;
  /** Plain words, for whoever draws the room. Documentation: `_`-prefixed, never player-facing. */
  _purpose: string;
}

/**
 * A service anchor. `target` is an EXISTING `data/dialogue.json` entry whose `kind` is `"service"`
 * — one of the eleven the corpus already ships. No new dialogue kind is invented, and none may be:
 * `service` is already in `game/dialogue-runner.ts`'s `TALK_KINDS` and already selector-proven.
 */
export interface InteriorServiceAnchor extends InteriorAnchorBase {
  kind: "service";
  target: string;
  /**
   * The direction from this tile toward the thing the service is transacted across. The cell one
   * step that way is either {@link PLAN_SOLID} — a counter or a trestle — or {@link PLAN_SPEAKER}.
   * A service anchor facing open floor is a service with nothing to transact with, and is refused.
   */
  faces: Facing;
}

/** A speaker anchor. `target` is an EXISTING `data/dialogue.json` speaker id. */
export interface InteriorSpeakerAnchor extends InteriorAnchorBase {
  kind: "speaker";
  target: string;
}

export type InteriorAnchor = InteriorServiceAnchor | InteriorSpeakerAnchor;

/**
 * One building interior: the architectural footprint and nothing else.
 *
 * Colour, style, materials and decoration are deliberately absent — they belong to the art lane,
 * which paints to this footprint. What is here is the load-bearing geometry: how big the room is,
 * where its door is, where the player lands, and which tile does what.
 */
export interface InteriorBlueprint {
  /** What kind of thing this file is, restated per file so a blueprint stands alone. */
  _shape: string;
  /** Stable id. Not a node id, and must not collide with one. */
  id: string;
  /** The town node this interior belongs to. `save.currentNode` keeps naming THIS while inside. */
  parentNode: string;
  /** Short display name. Kept under prose length on purpose — this file is scanned for copy. */
  name: string;
  /**
   * The room in plain words: its size in cells, and which wall the doorway is cut into. Written for
   * whoever draws the room, and checked against the picture — {@link blueprintProblems} refuses a
   * `_room` that does not name the plan's actual width and height, because a legend that has
   * drifted from the drawing is worse than none: the art lane builds to the sentence.
   */
  _room: string;
  door: InteriorDoor;
  /**
   * The cell the player stands on when they come through the door, carried explicitly. It is
   * walkable and it is exactly one orthogonal step from the `D` cell — {@link blueprintProblems}
   * refuses anything else, because "walkable" alone would let the player land across the room.
   */
  arrival: PlanCell;
  /** The floor plan. See {@link PLAN_ALPHABET}. */
  plan: string;
  /** Character → plain words. Documentation for whoever draws the room. */
  _legend: Record<string, string>;
  /** Why this room looks like this: the shipped lines each feature was derived from (G2). */
  _featureSource: string;
  /** What the canon does not say. A gap is flagged here, never filled with an invention (G2). */
  _canonSilent: string[];
  anchors: InteriorAnchor[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * Reading the plan — the second pass gridFromAscii deliberately does not make
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The plan's lines, trimmed and blank-stripped.
 *
 * This is the ONE place this file overlaps `gridFromAscii`, whose own lexing is
 * `split("\n").map(trim).filter(length > 0)`. It is written identically on purpose, and
 * `tests/unit/interiors.test.ts` pins the two together cell-for-cell. See the header.
 */
export function planLines(plan: string): string[] {
  return plan
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** The plan's extent in cells: rows is the line count, cols the widest line. */
export function planSize(plan: string): { cols: number; rows: number } {
  const lines = planLines(plan);
  return { cols: lines.reduce((max, l) => Math.max(max, l.length), 0), rows: lines.length };
}

/** The character at a cell, or null when the cell is off the plan (including a short line). */
export function planCharAt(plan: string, col: number, row: number): string | null {
  const line = planLines(plan)[row];
  if (line === undefined) return null;
  return line[col] ?? null;
}

/** True when a cell is {@link PLAN_SOLID}. Pinned to `gridFromAscii`'s blocking by test. */
export function planCellIsSolid(plan: string, col: number, row: number): boolean {
  return planCharAt(plan, col, row) === PLAN_SOLID;
}

/** The marker a given anchor kind must be standing on. */
export function markerFor(kind: InteriorAnchorKind): string {
  return kind === "service" ? PLAN_SERVICE : PLAN_SPEAKER;
}

/** The cell one step from `from` in `facing`. */
export function stepFrom(from: PlanCell, facing: Facing): PlanCell {
  const step = FACING_STEP[facing];
  return { col: from.col + step.dCol, row: from.row + step.dRow };
}

/** Every cell carrying `marker`, in reading order. */
export function planCellsWith(plan: string, marker: string): PlanCell[] {
  const out: PlanCell[] = [];
  planLines(plan).forEach((line, row) => {
    for (let col = 0; col < line.length; col += 1) {
      if (line[col] === marker) out.push({ col, row });
    }
  });
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Schema
 * ──────────────────────────────────────────────────────────────────────────── */

const zPlanCell: z.ZodType<PlanCell> = z.strictObject({
  col: z.int().min(0),
  row: z.int().min(0),
});

const zFacing = z.enum(FACINGS);

const zInteriorDoor: z.ZodType<InteriorDoor> = z.strictObject({
  _note: z.string().min(1),
  x: z.number().min(0),
  y: z.number().min(0),
  facing: zFacing,
});

/*
 * WHY THESE THREE ARE `satisfies` AND NOT `: z.ZodType<…>` — a zod 4 constraint, not a preference.
 *
 * `z.discriminatedUnion` takes members constrained to `$ZodTypeDiscriminable<"kind">`, an interface
 * whose `_zod.propValues` records the literal values each member's discriminator can hold. A
 * `ZodObject` carries that; the WIDENED alias `z.ZodType<T>` does not — its `propValues` is
 * `PropValues | undefined`. So annotating a member as `z.ZodType<InteriorServiceAnchor>` erases
 * exactly the property the union needs, the member no longer satisfies the constraint, and the
 * union's inferred output collapses to `unknown` (which is the second half of the same failure:
 * `ZodDiscriminatedUnion<…, "kind">` then will not fit `z.ZodType<InteriorAnchor>` either).
 *
 * `satisfies` checks the same assignability the annotation checked — the schema is still proven,
 * at compile time, to produce exactly the declared interface — while leaving the expression's own
 * type alone, so the `ZodObject` reaches `discriminatedUnion` intact. Nothing is loosened: drop a
 * field from `InteriorServiceAnchor`'s schema and the `satisfies` still fails. `core/schemas.ts`'s
 * `zMoveEffect` solves the same problem by leaving its members anonymous inside the union call;
 * this keeps the per-member interface check that pattern gives up.
 */

const zServiceAnchor = z.strictObject({
  id: z.string().min(1),
  kind: z.literal("service"),
  target: z.string().min(1),
  col: z.int().min(0),
  row: z.int().min(0),
  faces: zFacing,
  _purpose: z.string().min(1),
}) satisfies z.ZodType<InteriorServiceAnchor>;

const zSpeakerAnchor = z.strictObject({
  id: z.string().min(1),
  kind: z.literal("speaker"),
  target: z.string().min(1),
  col: z.int().min(0),
  row: z.int().min(0),
  _purpose: z.string().min(1),
}) satisfies z.ZodType<InteriorSpeakerAnchor>;

const zInteriorAnchor = z.discriminatedUnion("kind", [
  zServiceAnchor,
  zSpeakerAnchor,
]) satisfies z.ZodType<InteriorAnchor>;

export const zInteriorBlueprint: z.ZodType<InteriorBlueprint> = z.strictObject({
  _shape: z.string().min(1),
  id: z.string().min(1),
  parentNode: z.string().min(1),
  name: z.string().min(1),
  _room: z.string().min(1),
  door: zInteriorDoor,
  arrival: zPlanCell,
  plan: z.string().min(1),
  _legend: z.record(z.string().min(1), z.string().min(1)),
  _featureSource: z.string().min(1),
  _canonSilent: z.array(z.string().min(1)),
  anchors: z.array(zInteriorAnchor).min(1),
});

/* ────────────────────────────────────────────────────────────────────────────
 * The corpus this validates against — existing content only (G2)
 * ──────────────────────────────────────────────────────────────────────────── */

/** The eleven shipped `kind: "service"` entry ids. An anchor names one; it never authors one. */
export const SERVICE_ENTRY_IDS: ReadonlySet<string> = new Set(
  DIALOGUE.entries.filter((e) => e.kind === "service").map((e) => e.id),
);

/** Every shipped speaker id. */
export const SPEAKER_IDS: ReadonlySet<string> = new Set(DIALOGUE.speakers.map((s) => s.id));

/** Speaker id → the town they are `home`d to, for the parent-town cross-check. */
const SPEAKER_HOME: ReadonlyMap<string, string | undefined> = new Map(
  DIALOGUE.speakers.map((s) => [s.id, s.home]),
);

/** Service entry id → the speaker who says it. */
const SERVICE_SPEAKER: ReadonlyMap<string, string> = new Map(
  DIALOGUE.entries.filter((e) => e.kind === "service").map((e) => [e.id, e.speaker]),
);

/* ────────────────────────────────────────────────────────────────────────────
 * Validation — loud refusal, never a degraded default
 * ──────────────────────────────────────────────────────────────────────────── */

export class InteriorValidationError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`data/interiors: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
    this.name = "InteriorValidationError";
    this.problems = problems;
  }
}

/** Every structural complaint about one already-schema-valid blueprint. Empty means sound. */
export function blueprintProblems(bp: InteriorBlueprint): string[] {
  const out: string[] = [];
  const where = `${bp.id}`;
  const { cols, rows } = planSize(bp.plan);
  const lines = planLines(bp.plan);

  if (cols === 0 || rows === 0) {
    out.push(`${where}: the plan is empty — a room with no cells`);
    return out;
  }

  // A ragged plan is a plan whose right-hand wall is missing on some rows, and `gridFromAscii`
  // pads it with WALKABLE cells — so the player leaks out of the room through a typo.
  for (const [row, line] of lines.entries()) {
    if (line.length !== cols) {
      out.push(`${where}: plan row ${String(row)} is ${String(line.length)} cells, not ${String(cols)} — ragged plans leak walkable cells`);
    }
    for (let col = 0; col < line.length; col += 1) {
      const ch = line[col] as string;
      if (!PLAN_ALPHABET.includes(ch)) {
        out.push(`${where}: plan cell (${String(col)},${String(row)}) is "${ch}", which is not in the plan alphabet`);
      }
    }
  }

  // Exactly one doorway. Two doors is two destinations and the model carries one — and it is also
  // what the canon says: tools/comfy/manifest.json's map-town skeleton, the only sentence in the
  // project that legislates doors at all, reads "every building has one clearly visible door".
  const doors = planCellsWith(bp.plan, PLAN_DOOR);
  if (doors.length !== 1) {
    out.push(`${where}: the plan draws ${String(doors.length)} "${PLAN_DOOR}" cells — a blueprint carries exactly one doorway`);
  }

  // The art lane builds to `_room`, not to the picture, so a `_room` that has drifted from the
  // plan is a room drawn to the wrong size. It must name the plan's real width and height.
  for (const [label, value] of [["width", cols], ["height", rows]] as const) {
    if (!bp._room.includes(String(value))) {
      out.push(`${where}: the plan is ${String(cols)}x${String(rows)} cells but _room never says ${String(value)} — its stated ${label} has drifted from the drawing`);
    }
  }

  // Arrival must be on the plan, and must not be solid. `chooseSpawnTile` cannot find this cell.
  const arrivalChar = planCharAt(bp.plan, bp.arrival.col, bp.arrival.row);
  if (arrivalChar === null) {
    out.push(`${where}: arrival (${String(bp.arrival.col)},${String(bp.arrival.row)}) is off a ${String(cols)}x${String(rows)} plan`);
  } else if (arrivalChar === PLAN_SOLID) {
    out.push(`${where}: arrival (${String(bp.arrival.col)},${String(bp.arrival.row)}) is solid — the player would stand inside geometry`);
  }

  // AND IT MUST BE AT THE DOOR. `arrival` exists at all because `chooseSpawnTile` cannot find a
  // doorway (see the header); a cell that is merely walkable satisfies that badly. The player who
  // steps onto a threshold has to appear ON THE OTHER SIDE OF IT, not somewhere else in the room —
  // an arrival three cells away reads on screen as a teleport, and an arrival ON the door cell puts
  // the player standing on the trigger that sends them straight back out. One orthogonal step.
  const door = doors[0];
  if (door !== undefined && arrivalChar !== null) {
    const stepsAway = Math.abs(bp.arrival.col - door.col) + Math.abs(bp.arrival.row - door.row);
    if (stepsAway !== 1) {
      out.push(
        `${where}: arrival (${String(bp.arrival.col)},${String(bp.arrival.row)}) is ${String(stepsAway)} cells from the doorway ` +
          `(${String(door.col)},${String(door.row)}) — the player must land one step through the threshold they walked in by`,
      );
    }
  }

  // Every legend key must be a character the plan actually uses, and every character the plan uses
  // must be in the legend. A legend that drifts from the picture is worse than no legend: the art
  // team draws what it says.
  const used = new Set(lines.join("").split(""));
  for (const ch of used) {
    if (bp._legend[ch] === undefined) out.push(`${where}: the plan uses "${ch}" but the legend does not explain it`);
  }
  for (const ch of Object.keys(bp._legend)) {
    if (!used.has(ch)) out.push(`${where}: the legend explains "${ch}" but the plan never uses it`);
  }

  const seenAnchorIds = new Set<string>();
  const seenCells = new Set<string>();
  for (const anchor of bp.anchors) {
    const name = `${where}.${anchor.id}`;
    if (seenAnchorIds.has(anchor.id)) out.push(`${name}: duplicate anchor id`);
    seenAnchorIds.add(anchor.id);

    const cellKey = `${String(anchor.col)},${String(anchor.row)}`;
    if (seenCells.has(cellKey)) out.push(`${name}: two anchors share cell (${cellKey})`);
    seenCells.add(cellKey);

    const ch = planCharAt(bp.plan, anchor.col, anchor.row);
    const expected = markerFor(anchor.kind);
    if (ch === null) {
      out.push(`${name}: cell (${cellKey}) is off a ${String(cols)}x${String(rows)} plan`);
    } else if (ch !== expected) {
      out.push(`${name}: cell (${cellKey}) holds "${ch}", not the "${expected}" its ${anchor.kind} kind requires`);
    }
    // Restated independently of the marker check: the marker IS walkable to `gridFromAscii`, and
    // this is the assertion that says so out loud rather than trusting the alphabet to stay sane.
    if (ch !== null && planCellIsSolid(bp.plan, anchor.col, anchor.row)) {
      out.push(`${name}: cell (${cellKey}) is solid — an anchor must stand on a walkable cell`);
    }

    if (anchor.kind === "service") {
      if (!SERVICE_ENTRY_IDS.has(anchor.target)) {
        out.push(`${name}: target "${anchor.target}" is not a shipped kind:"service" dialogue entry — an anchor names one, it never authors one`);
      }
      const home = SPEAKER_HOME.get(SERVICE_SPEAKER.get(anchor.target) ?? "");
      if (home !== undefined && home !== bp.parentNode) {
        out.push(`${name}: "${anchor.target}" is spoken by someone homed to "${home}", not "${bp.parentNode}"`);
      }
      const faced = stepFrom({ col: anchor.col, row: anchor.row }, anchor.faces);
      const facedChar = planCharAt(bp.plan, faced.col, faced.row);
      if (facedChar !== PLAN_SOLID && facedChar !== PLAN_SPEAKER) {
        out.push(`${name}: facing ${anchor.faces} it looks at "${String(facedChar)}" — a service is transacted across a counter ("${PLAN_SOLID}") or with a person ("${PLAN_SPEAKER}")`);
      }
    } else {
      if (!SPEAKER_IDS.has(anchor.target)) {
        out.push(`${name}: target "${anchor.target}" is not a shipped dialogue speaker`);
      }
      const home = SPEAKER_HOME.get(anchor.target);
      if (home !== undefined && home !== bp.parentNode) {
        out.push(`${name}: "${anchor.target}" is homed to "${home}", not "${bp.parentNode}"`);
      }
    }
  }

  return out;
}

/**
 * Parse and check a list of raw blueprints. Throws {@link InteriorValidationError} on any problem.
 *
 * REFUSES AN EMPTY LIST. A loader that returns `[]` when it was pointed at nothing reports success
 * for having found no interiors, which is the exact shape of a green suite certifying an absence.
 */
export function validateInteriors(raw: readonly unknown[]): InteriorBlueprint[] {
  if (raw.length === 0) {
    throw new InteriorValidationError([
      "no interiors were loaded at all — an empty interior set is a broken load, not an empty game",
    ]);
  }

  const problems: string[] = [];
  const parsed: InteriorBlueprint[] = [];
  for (const [index, item] of raw.entries()) {
    const result = zInteriorBlueprint.safeParse(item);
    if (!result.success) {
      problems.push(`interior #${String(index)}: ${z.prettifyError(result.error)}`);
      continue;
    }
    parsed.push(result.data);
  }

  const seen = new Set<string>();
  for (const bp of parsed) {
    if (seen.has(bp.id)) problems.push(`${bp.id}: duplicate interior id`);
    seen.add(bp.id);
    problems.push(...blueprintProblems(bp));
  }

  if (problems.length > 0) throw new InteriorValidationError(problems);
  return parsed;
}

/** The shipped blueprints, raw, exactly as they sit in `data/interiors/`. */
export const SHIPPED_INTERIOR_JSON: readonly unknown[] = [
  hearthollowInnJson,
  hearthollowSupplyJson,
  brackwaterInnJson,
  brackwaterSupplyJson,
];

/** The validated shipped interiors. Throws at import time on drift, the way the dialogue corpus does. */
export const INTERIORS: readonly InteriorBlueprint[] = validateInteriors(SHIPPED_INTERIOR_JSON);

/** Every interior belonging to a town, in shipped order. Empty when the town has none authored. */
export function interiorsOf(parentNode: string): InteriorBlueprint[] {
  return INTERIORS.filter((bp) => bp.parentNode === parentNode);
}

/** One interior by id, or null. Null is a caller's problem to handle, never a silent default. */
export function interiorById(id: string): InteriorBlueprint | null {
  return INTERIORS.find((bp) => bp.id === id) ?? null;
}
