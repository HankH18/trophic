/**
 * core/dialogue-schema.ts — the zod schema and TypeScript surface for `data/dialogue.json`.
 *
 * build-doc §4 lists `dialogue.json` in the content-data block and §7 requires every content file
 * to be "validated against these at boot with zod (fail loud on drift)". This module is that
 * validation for dialogue, and only for dialogue: it never touches core/schemas.ts or
 * core/types.ts, which other lanes own. Pure TypeScript, zero engine imports (L11).
 *
 * The schema is deliberately STRICT. Every object is a `strictObject`, so a typo'd key is an error
 * rather than a silently dropped field, and every cross-reference in the file is resolved against
 * the real content: speaker ids, node ids, species line ids, prop ids, sign-chain ids and
 * `goto` targets. A malformed entry is rejected, not repaired.
 *
 * `_`-prefixed top-level keys are documentation (the same convention every other data file uses)
 * and are stripped before parsing.
 *
 * **The condition model carries two independent clocks (Q3, the authorised L8 amendment).** ACTS —
 * `act` / `actMin` / `actMax`, derived from badges and quest flags by `actFromFlags()` — are the
 * story clock, and every story beat gates on them so it fires whenever the player earns it, in any
 * calendar year. The CALENDAR — `years` / `yearMin` / `yearMax` — is the world's clock: it is
 * unbounded, it never waits for the player, and only world-ageing copy should read it.
 * `conditionHolds()` / `selectEntry()` remain the single resolution path for both.
 */

import { z } from "zod";
import { SEASONS } from "./types";
import type { Season } from "./types";

import balanceJson from "../data/balance.json";
import dialogueJson from "../data/dialogue.json";
import gymsJson from "../data/gyms.json";
import speciesJson from "../data/species.json";
import hearthollowJson from "../data/nodes/hearthollow.json";
import r1Json from "../data/nodes/r1.json";
import brackwaterJson from "../data/nodes/brackwater.json";
import r2Json from "../data/nodes/r2.json";
import bowerdeepJson from "../data/nodes/bowerdeep.json";
import r3Json from "../data/nodes/r3.json";
import cindershelfJson from "../data/nodes/cindershelf.json";
import r4Json from "../data/nodes/r4.json";
import duskhollowJson from "../data/nodes/duskhollow.json";
import r5Json from "../data/nodes/r5.json";
import sanctumApproachJson from "../data/nodes/sanctum-approach.json";
import sanctumJson from "../data/nodes/sanctum.json";

/* ── vocabulary ──────────────────────────────────────────────────────────── */

/**
 * What a speaker IS, which decides how the budget in bible §13.13 applies to them
 * (~10 lines for `named`, ~3 for `ambient`) and which sprite class draws them.
 */
export const SPEAKER_KINDS = ["named", "generic", "ambient", "prop"] as const;
export type SpeakerKind = (typeof SPEAKER_KINDS)[number];

/**
 * What a dialogue entry IS, which decides when the game asks for it.
 * `prop` entries are read off a `PropPlacement` (build-doc §7.6) rather than an NPC.
 */
export const DIALOGUE_KINDS = [
  "cutscene",
  "greeting",
  "ambient",
  "lore",
  "quest",
  "service",
  "battle-pre",
  "battle-win",
  "battle-loss",
  "prop",
] as const;
export type DialogueKind = (typeof DIALOGUE_KINDS)[number];

/** Comparison used by the live-state clauses (population / floraStock). */
export const COMPARE_OPS = ["lt", "lte", "eq", "gte", "gt"] as const;
export type CompareOp = (typeof COMPARE_OPS)[number];

/** Values a quest flag may hold — mirrors `SaveFile.questFlags` (build-doc §7.8). */
export type FlagValue = boolean | number | string;

/* ── types ───────────────────────────────────────────────────────────────── */

export interface DialogueSpeaker {
  id: string;
  /** Display name shown in the name plate. Generic/ambient speakers use their trade. */
  name: string;
  kind: SpeakerKind;
  /** Free-text role tag ("mentor", "gym-leader", "innkeeper") — flavour for tooling, not logic. */
  role?: string;
  /** Node this speaker stands in, when they stand in exactly one. Props have none. */
  home?: string;
  /** Asset manifest row id (tools/comfy/manifest.json) that draws this speaker. */
  portrait: string;
}

/** Reads the LIVE node state (`SaveFile.nodeStates[node].populations[lineId].count`). */
export interface PopulationCondition {
  node: string;
  lineId: string;
  op: CompareOp;
  value: number;
}

/** Reads the LIVE node state (`SaveFile.nodeStates[node].floraStock`, 0–100). */
export interface FloraCondition {
  node: string;
  op: CompareOp;
  value: number;
}

export interface FlagEquals {
  key: string;
  value: FlagValue;
}

/**
 * Every clause present must hold for the entry to be eligible. An absent clause is not a
 * constraint; an empty `when` object means "always eligible" (the fallback).
 *
 * **Two independent axes (Q3 / the L8 amendment).** `act*` is the STORY clock — badges and quest
 * flags — and it is what a story beat must gate on, so the beat fires whenever the player earns it.
 * `years*` is the WORLD clock — ticks → seasons → years — and it is unbounded, so a calendar clause
 * must have a sensible reading at year 12 as well as year 6. Neither axis drives the other; an
 * entry may legitimately carry both (an act beat that also waits for the world to age).
 */
export interface DialogueCondition {
  /** Exact acts (1..ACTS_TOTAL) this entry belongs to. */
  act?: number[];
  actMin?: number;
  actMax?: number;
  /**
   * Exact in-game years this entry belongs to. Q3: the calendar is unbounded, so an exact-year
   * equality is almost always wrong for anything but a one-off — prefer `yearMin` (forward-open).
   */
  years?: number[];
  yearMin?: number;
  yearMax?: number;
  /** Seasonal gating — used by the migrant-driven content (bible §5). */
  seasons?: Season[];
  flagsSet?: string[];
  flagsUnset?: string[];
  flagEquals?: FlagEquals[];
  population?: PopulationCondition[];
  floraStock?: FloraCondition[];
}

export interface DialogueLine {
  text: string;
  /** Speaker override for a line inside a multi-speaker scene. Defaults to the entry's speaker. */
  speaker?: string;
}

export interface DialogueChoice {
  text: string;
  /** Entry to continue into when this choice is taken. */
  goto?: string;
  setFlags?: Record<string, FlagValue>;
}

export interface DialogueEntry {
  id: string;
  speaker: string;
  /** Node this entry can fire in. */
  node: string;
  kind: DialogueKind;
  /** Side-quest id (bible §9) this entry belongs to. */
  quest?: string;
  /** Sign chain this entry advances (bible §4 Ancient lore surfaces). */
  signChain?: string;
  /** 1-based position within `signChain`. */
  chainStep?: number;
  /** Prop this entry is read off, for `kind: "prop"` and prop-anchored cutscenes. */
  propId?: string;
  /** Highest matching entry wins. Default 0. */
  priority?: number;
  when?: DialogueCondition;
  lines: DialogueLine[];
  choices?: DialogueChoice[];
  setFlags?: Record<string, FlagValue>;
  /** Unconditional continuation after the last line (used to chain cutscene beats). */
  goto?: string;
}

export interface DialogueFile {
  speakers: DialogueSpeaker[];
  entries: DialogueEntry[];
}

/* ── schema ──────────────────────────────────────────────────────────────── */

const zId = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, "ids are lowercase kebab/dot ids");
const zFlagKey = z.string().regex(/^[a-z0-9][a-zA-Z0-9._-]*$/, "flag keys are dotted identifiers");
const zFlagValue: z.ZodType<FlagValue> = z.union([z.boolean(), z.number(), z.string()]);
const zFlagBag = z.record(zFlagKey, zFlagValue);
const zCompareOp = z.enum(COMPARE_OPS);

/**
 * G11 / INV-4 — nothing gameplay-shaped is re-typed here; it is READ from the shipped content.
 *
 * **`clock.yearsTotal` no longer means "the last year".** Under Q3 (the authorised L8 amendment, see
 * docs/DEVIATIONS.md) the calendar never ends: years advance on ticks alone, and story progression
 * runs on the act axis instead. So `yearsTotal` is now the NOMINAL span — the year count a normally
 * paced run reaches, a correlation and not a cap — and it is deliberately NOT a bound on `zYear`.
 * It is exported so callers and tests reason about pacing from the same number the sim uses.
 */
export const NOMINAL_YEARS: number = balanceJson.clock.yearsTotal;
const FLORA_MAX: number = balanceJson.ecosim.floraMax;

/**
 * The acts, in order, taken from the shipped gym table — bible §6 gives each act exactly one gym,
 * and `data/gyms.json` is the file that says how many there are. Read as a COUNT and as ids, never
 * through the table's own act/year index field, so renaming that field (Q3) cannot reach in here.
 */
export const ACT_GYM_IDS: readonly string[] = gymsJson.gyms.map((g) => g.id);
export const ACTS_TOTAL: number = ACT_GYM_IDS.length;

/**
 * Q3: acts are driven by badges and quest flags, never by time. The badge ladder is the spine —
 * each gym beaten opens the next act — and the per-beat quest/story prerequisites are expressed as
 * ordinary `flagsSet` clauses on the entries themselves.
 *
 * The final act's leader (Greaves) is the finale rather than a gate, so beating him cannot open an
 * act that does not exist; the clamp is what says so.
 */
export function actFromFlags(flags: Readonly<Record<string, FlagValue>>): number {
  let beaten = 0;
  for (const id of ACT_GYM_IDS) {
    const v = flags[`gym.${id}.beaten`];
    if (v !== undefined && v !== false) beaten += 1;
  }
  const act = 1 + beaten;
  return act > ACTS_TOTAL ? ACTS_TOTAL : act;
}

/** Q3 — the calendar is unbounded, so a year in a condition has a floor and no ceiling. */
const zYear = z.number().int().min(1);
const zAct = z.number().int().min(1).max(ACTS_TOTAL);

export const zDialogueSpeaker: z.ZodType<DialogueSpeaker> = z.strictObject({
  id: zId,
  name: z.string().min(1),
  kind: z.enum(SPEAKER_KINDS),
  role: z.string().min(1).optional(),
  home: zId.optional(),
  portrait: z.string().min(1),
});

export const zPopulationCondition: z.ZodType<PopulationCondition> = z.strictObject({
  node: zId,
  lineId: zId,
  op: zCompareOp,
  value: z.number().int().min(0),
});

export const zFloraCondition: z.ZodType<FloraCondition> = z.strictObject({
  node: zId,
  op: zCompareOp,
  value: z.number().int().min(0).max(FLORA_MAX),
});

export const zFlagEquals: z.ZodType<FlagEquals> = z.strictObject({
  key: zFlagKey,
  value: zFlagValue,
});

export const zDialogueCondition: z.ZodType<DialogueCondition> = z
  .strictObject({
    act: z.array(zAct).min(1).optional(),
    actMin: zAct.optional(),
    actMax: zAct.optional(),
    years: z.array(zYear).min(1).optional(),
    yearMin: zYear.optional(),
    yearMax: zYear.optional(),
    seasons: z.array(z.enum(SEASONS)).min(1).optional(),
    flagsSet: z.array(zFlagKey).min(1).optional(),
    flagsUnset: z.array(zFlagKey).min(1).optional(),
    flagEquals: z.array(zFlagEquals).min(1).optional(),
    population: z.array(zPopulationCondition).min(1).optional(),
    floraStock: z.array(zFloraCondition).min(1).optional(),
  })
  .refine(
    (c) => c.yearMin === undefined || c.yearMax === undefined || c.yearMin <= c.yearMax,
    "yearMin must not exceed yearMax",
  )
  .refine(
    (c) => c.years === undefined || (c.yearMin === undefined && c.yearMax === undefined),
    "use either an explicit `years` list or a yearMin/yearMax range, never both",
  )
  .refine(
    (c) => c.actMin === undefined || c.actMax === undefined || c.actMin <= c.actMax,
    "actMin must not exceed actMax",
  )
  .refine(
    (c) => c.act === undefined || (c.actMin === undefined && c.actMax === undefined),
    "use either an explicit `act` list or an actMin/actMax range, never both",
  );

export const zDialogueLine: z.ZodType<DialogueLine> = z.strictObject({
  text: z.string().min(1).max(400),
  speaker: zId.optional(),
});

export const zDialogueChoice: z.ZodType<DialogueChoice> = z.strictObject({
  text: z.string().min(1).max(120),
  goto: zId.optional(),
  setFlags: zFlagBag.optional(),
});

export const zDialogueEntry: z.ZodType<DialogueEntry> = z
  .strictObject({
    id: zId,
    speaker: zId,
    node: zId,
    kind: z.enum(DIALOGUE_KINDS),
    quest: zId.optional(),
    signChain: zId.optional(),
    chainStep: z.number().int().min(1).optional(),
    propId: zId.optional(),
    priority: z.number().int().min(0).optional(),
    when: zDialogueCondition.optional(),
    lines: z.array(zDialogueLine).min(1).max(8),
    choices: z.array(zDialogueChoice).min(1).max(4).optional(),
    setFlags: zFlagBag.optional(),
    goto: zId.optional(),
  })
  .refine((e) => e.chainStep === undefined || e.signChain !== undefined, "chainStep requires signChain")
  .refine((e) => e.kind !== "prop" || e.propId !== undefined, "a prop entry must name its propId");

export const zDialogueFile: z.ZodType<DialogueFile> = z.strictObject({
  speakers: z.array(zDialogueSpeaker).min(1),
  entries: z.array(zDialogueEntry).min(1),
});

/* ── cross-reference validation ──────────────────────────────────────────── */

const NODE_FILES = [
  hearthollowJson,
  r1Json,
  brackwaterJson,
  r2Json,
  bowerdeepJson,
  r3Json,
  cindershelfJson,
  r4Json,
  duskhollowJson,
  r5Json,
  sanctumApproachJson,
  sanctumJson,
] as const;

/** Every node id in `data/nodes/`. */
export const NODE_IDS: ReadonlySet<string> = new Set(NODE_FILES.map((n) => n.id));

/** propId -> the node it is placed in (build-doc §7.2 `props[]`). */
export const PROP_NODE: ReadonlyMap<string, string> = new Map(
  NODE_FILES.flatMap((n) => n.props.map((p) => [p.id, n.id] as const)),
);

/** Every `signChain` declared by a prop placement — the closed set of chain ids. */
export const SIGN_CHAINS: ReadonlySet<string> = new Set(
  NODE_FILES.flatMap((n) => n.props.flatMap((p) => ("signChain" in p && p.signChain ? [p.signChain] : []))),
);

/** Every species line id in `data/species.json`. */
export const LINE_IDS: ReadonlySet<string> = new Set(speciesJson.species.map((s) => s.id));

export class DialogueValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(
      `TROPHIC dialogue validation failed (${issues.length} issue${issues.length === 1 ? "" : "s"}):\n` +
        issues.map((i) => `  • ${i}`).join("\n"),
    );
    this.name = "DialogueValidationError";
    this.issues = issues;
  }
}

/** Strip the `_`-prefixed documentation keys every content file carries. */
function stripDocKeys(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!k.startsWith("_")) out[k] = v;
  }
  return out;
}

/**
 * Validate an arbitrary dialogue bundle: shape first, then every cross-reference that makes the
 * file usable at runtime. Throws `DialogueValidationError` listing every problem found.
 */
export function validateDialogueFile(raw: unknown): DialogueFile {
  const issues: string[] = [];
  const parsed = zDialogueFile.safeParse(stripDocKeys(raw));
  if (!parsed.success) {
    throw new DialogueValidationError([`dialogue.json: ${z.prettifyError(parsed.error)}`]);
  }
  const file = parsed.data;

  const speakerIds = new Set<string>();
  for (const s of file.speakers) {
    if (speakerIds.has(s.id)) issues.push(`duplicate speaker id "${s.id}"`);
    speakerIds.add(s.id);
    if (s.home !== undefined && !NODE_IDS.has(s.home)) {
      issues.push(`speaker "${s.id}": home "${s.home}" is not a node in data/nodes/`);
    }
    if (s.kind === "prop" && s.home !== undefined) {
      issues.push(`speaker "${s.id}": prop speakers are placed by propId, not by home`);
    }
  }

  const entryIds = new Set<string>();
  for (const e of file.entries) {
    if (entryIds.has(e.id)) issues.push(`duplicate entry id "${e.id}"`);
    entryIds.add(e.id);
  }

  for (const e of file.entries) {
    const where = `entry "${e.id}"`;
    if (!speakerIds.has(e.speaker)) issues.push(`${where}: speaker "${e.speaker}" is not declared in speakers[]`);
    if (!NODE_IDS.has(e.node)) issues.push(`${where}: node "${e.node}" is not a node in data/nodes/`);

    for (const l of e.lines) {
      if (l.speaker !== undefined && !speakerIds.has(l.speaker)) {
        issues.push(`${where}: line speaker override "${l.speaker}" is not declared in speakers[]`);
      }
    }

    if (e.goto !== undefined && !entryIds.has(e.goto)) {
      issues.push(`${where}: goto "${e.goto}" is not an entry id`);
    }
    for (const c of e.choices ?? []) {
      if (c.goto !== undefined && !entryIds.has(c.goto)) {
        issues.push(`${where}: choice goto "${c.goto}" is not an entry id`);
      }
    }

    if (e.propId !== undefined) {
      const propNode = PROP_NODE.get(e.propId);
      if (propNode === undefined) {
        issues.push(`${where}: propId "${e.propId}" is not a prop in any node file`);
      } else if (propNode !== e.node) {
        issues.push(`${where}: propId "${e.propId}" lives in node "${propNode}", not "${e.node}"`);
      }
    }

    if (e.signChain !== undefined && !SIGN_CHAINS.has(e.signChain)) {
      issues.push(
        `${where}: signChain "${e.signChain}" is not declared by any prop placement ` +
          `(known: ${[...SIGN_CHAINS].sort().join(", ")})`,
      );
    }

    for (const p of e.when?.population ?? []) {
      if (!NODE_IDS.has(p.node)) issues.push(`${where}: population condition names unknown node "${p.node}"`);
      if (!LINE_IDS.has(p.lineId)) {
        issues.push(`${where}: population condition names unknown species line "${p.lineId}"`);
      }
    }
    for (const f of e.when?.floraStock ?? []) {
      if (!NODE_IDS.has(f.node)) issues.push(`${where}: floraStock condition names unknown node "${f.node}"`);
    }
  }

  if (issues.length > 0) throw new DialogueValidationError(issues);
  return file;
}

/** Validate the shipped `data/dialogue.json`. */
export function validateDialogue(): DialogueFile {
  return validateDialogueFile(dialogueJson);
}

/** The shipped dialogue, validated once at module load — import this, not the raw JSON. */
export const DIALOGUE: DialogueFile = validateDialogue();

/* ── read helpers (pure; the game layer owns the actual state) ───────────── */

/** Live state a condition is evaluated against. Supplied by the caller; never read from here. */
export interface DialogueContext {
  /**
   * The STORY clock, 1..ACTS_TOTAL. Required, never optional: an act gate that silently passed
   * because nobody supplied an act is how the finale stops firing without anything going red.
   * `actFromFlags(flags)` is the canonical derivation — the game layer should call it rather than
   * re-deriving the badge ladder, exactly as it must call `conditionHolds` rather than re-deriving
   * condition resolution.
   */
  act: number;
  /** The WORLD clock. Q3: unbounded — this may be any year ≥ 1, well past `NOMINAL_YEARS`. */
  year: number;
  season: Season;
  flags: Readonly<Record<string, FlagValue>>;
  /** nodeId -> lineId -> live individual count. */
  populations: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** nodeId -> live flora stock, 0–100. */
  floraStock: Readonly<Record<string, number>>;
}

function compare(a: number, op: CompareOp, b: number): boolean {
  switch (op) {
    case "lt":
      return a < b;
    case "lte":
      return a <= b;
    case "eq":
      return a === b;
    case "gte":
      return a >= b;
    case "gt":
      return a > b;
  }
}

/** True when every clause of `when` holds against `ctx`. An absent `when` is always true. */
export function conditionHolds(when: DialogueCondition | undefined, ctx: DialogueContext): boolean {
  if (when === undefined) return true;
  if (when.act !== undefined && !when.act.includes(ctx.act)) return false;
  if (when.actMin !== undefined && ctx.act < when.actMin) return false;
  if (when.actMax !== undefined && ctx.act > when.actMax) return false;
  if (when.years !== undefined && !when.years.includes(ctx.year)) return false;
  if (when.yearMin !== undefined && ctx.year < when.yearMin) return false;
  if (when.yearMax !== undefined && ctx.year > when.yearMax) return false;
  if (when.seasons !== undefined && !when.seasons.includes(ctx.season)) return false;
  for (const k of when.flagsSet ?? []) {
    const v = ctx.flags[k];
    if (v === undefined || v === false) return false;
  }
  for (const k of when.flagsUnset ?? []) {
    const v = ctx.flags[k];
    if (v !== undefined && v !== false) return false;
  }
  for (const fe of when.flagEquals ?? []) {
    if (ctx.flags[fe.key] !== fe.value) return false;
  }
  for (const p of when.population ?? []) {
    const count = ctx.populations[p.node]?.[p.lineId];
    if (count === undefined || !compare(count, p.op, p.value)) return false;
  }
  for (const f of when.floraStock ?? []) {
    const stock = ctx.floraStock[f.node];
    if (stock === undefined || !compare(stock, f.op, f.value)) return false;
  }
  return true;
}

/**
 * The entry the game should play for a (speaker, node, kind) request: the highest-priority
 * eligible entry, ties broken by file order. Returns undefined when nothing is eligible.
 */
export function selectEntry(
  file: DialogueFile,
  speaker: string,
  node: string,
  kind: DialogueKind,
  ctx: DialogueContext,
): DialogueEntry | undefined {
  let best: DialogueEntry | undefined;
  let bestPriority = -1;
  for (const e of file.entries) {
    if (e.speaker !== speaker || e.node !== node || e.kind !== kind) continue;
    if (!conditionHolds(e.when, ctx)) continue;
    const p = e.priority ?? 0;
    if (p > bestPriority) {
      best = e;
      bestPriority = p;
    }
  }
  return best;
}
