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
 * **The condition model carries two independent clocks (the authorised L8 amendment).** ACTS —
 * `act` / `actMin` / `actMax` — are the story clock, and every story beat gates on them so it fires
 * whenever the player earns it, in any calendar year. The CALENDAR — `years` / `yearMin` /
 * `yearMax` — is the world's clock: it is unbounded, it never waits for the player, and only
 * world-ageing copy should read it. `conditionHolds()` / `selectEntry()` remain the single
 * resolution path for both.
 *
 * ⚠ **THIS MODULE OWNS NO ACT MODEL.** `core/acts.ts` is the repo's only authority on which act a
 * save is in, and `actFromFlags()` below is a one-line delegation to it — not a second derivation.
 * It used to be one (`1 + badgesBeaten`), and it disagreed with `actOf()` at exactly one point: the
 * PROLOGUE. `balance.acts.first` is **0** — a brand-new save has not finished Maren's opening chain
 * and act 1 opens on `story.opening.done` — while `1 + beaten` could never return 0. Every entry in
 * the opening chain was therefore gated `act: [1]` against a game that hands this module act 0, and
 * the chain that WRITES `story.opening.done` was inside the gate it needed: an unopenable game whose
 * only symptom was silence. A second derivation of a value that already has an authority is the bug,
 * every time; the fix is that there is now one implementation and this file is not it.
 */

import { z } from "zod";
import { actOf, firstAct, lastAct } from "./acts";
import { ROLES, SEASONS, SNARE_TIERS } from "./types";
import type { Balance, GymLeader, Season } from "./types";

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
 * **Two independent axes (the L8 amendment).** `act*` is the STORY clock — badges and quest
 * flags — and it is what a story beat must gate on, so the beat fires whenever the player earns it.
 * `years*` is the WORLD clock — ticks → seasons → years — and it is unbounded, so a calendar clause
 * must have a sensible reading at year 12 as well as year 6. Neither axis drives the other; an
 * entry may legitimately carry both (an act beat that also waits for the world to age).
 */
export interface DialogueCondition {
  /**
   * Exact acts (`FIRST_ACT..LAST_ACT`) this entry belongs to.
   *
   * An equality CLOSES the entry the moment the act advances, so it is only right where the beat is
   * genuinely of that act and nowhere else — the prologue, and each act's arrival pointer. For
   * anything a player can walk past and come back to, use `actMin`: town N's gym and route N open in
   * the same act, so a beat pinned to act N on route N is lost by anyone who takes the badge first.
   */
  act?: number[];
  actMin?: number;
  actMax?: number;
  /**
   * Exact in-game years this entry belongs to. The calendar is unbounded, so an exact-year
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
  /**
   * Items this entry puts in the player's bag when it plays. Keys are bag ids; counts are added.
   *
   * ⚠ **THIS DECLARATION ALONE ENFORCES NOTHING, AND ITS ABSENCE FROM THE SCHEMA IS NOT A COMPILE
   * ERROR.** An object type that lacks an optional property is still assignable to one that has it,
   * so a corpus with no `grants` anywhere typechecks either way, and `zDialogueEntry` is a
   * `strictObject`: had this field been added here and NOT to the schema below, the first entry to
   * author it would fail at BOOT with an `unrecognized_keys` validation error rather than at
   * `tsc`. The interface and the `grants:` line in `zDialogueEntry` are one edit in two places and
   * must always move together.
   *
   * Two things about a granted id are checked in {@link validateDialogueFile}, not here: that the id
   * is a real bag id, and that the entry granting it can only fire once.
   */
  grants?: Record<string, number>;
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
 * The SHAPE of a bag id — and deliberately nothing more than the shape.
 *
 * It is NOT `zId`: a role-generic bait tag is a `Role` name (`Producer`, `Grazer`), which is
 * capitalised, and `zId` admits only lowercase. Widening the regex to fit them is exactly why a
 * regex cannot be the real check here — `^[A-Za-z0-9]…$` happily admits `snair`. The CLOSED set of
 * ids that actually exist is resolved as a cross-reference in {@link validateDialogueFile} against
 * {@link BAG_ITEM_IDS}, the same way node ids, species line ids and sign chains already are.
 */
const zItemId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "bag ids are identifier-shaped");

/**
 * G11 / INV-4 — nothing gameplay-shaped is re-typed here; it is READ from the shipped content.
 *
 * **`clock.yearsTotal` no longer means "the last year".** Under the authorised L8 amendment the
 * calendar never ends: years advance on ticks alone, and story progression runs on the act axis
 * instead. So `yearsTotal` is now the NOMINAL span — the year count a normally
 * paced run reaches, a correlation and not a cap — and it is deliberately NOT a bound on `zYear`.
 * It is exported so callers and tests reason about pacing from the same number the sim uses.
 */
export const NOMINAL_YEARS: number = balanceJson.clock.yearsTotal;

/**
 * The calendar's first year, read from `clock.startYear`. The calendar has no last year,
 * so this is the only bound the year axis has, and it is a floor rather than a range.
 */
export const FIRST_YEAR: number = balanceJson.clock.startYear;
const FLORA_MAX: number = balanceJson.ecosim.floraMax;

/**
 * The two shipped files `core/acts.ts` reads, typed for it.
 *
 * A JSON import widens every string to `string`, so the raw modules do not structurally satisfy
 * `Balance` / `GymLeader` even though they ARE those files. `core/schemas.ts` validates both against
 * zod at boot (INV-3), and `actOf()` reads only `acts.*` off the balance and `id` off each gym, so
 * the assertion is an adapter and not a claim about unvalidated data. Deliberately not an import of
 * `core/schemas.ts`: that module validates the entire content bundle at load, which this one has no
 * business doing.
 */
const ACT_BALANCE = balanceJson as unknown as Balance;
const ACT_GYMS = gymsJson.gyms as unknown as readonly GymLeader[];

/**
 * The gym ids, in act order, taken from the shipped gym table — bible §6 gives each act exactly one
 * gym. Read as ids only, never through the table's own act index field, so a rename of that field
 * (the L8 amendment moved it `year` → `act`) cannot reach in here.
 *
 * ⚠ This is **not** the act ladder and its length is **not** the last act. There are six gyms and
 * seven acts, because act 0 is the prologue. Using the gym count as an act bound is what made a
 * prologue-only line unauthorable; the bounds below come from `balance.acts`, which is the file that
 * actually defines the ladder.
 */
export const ACT_GYM_IDS: readonly string[] = gymsJson.gyms.map((g) => g.id);

/**
 * The act range, READ from `balance.acts` (G11/INV-4 — no act number is typed here).
 *
 * `FIRST_ACT` is the prologue: a save that has not finished Maren's opening chain. It is a real,
 * reachable state that every new save starts in, so a condition must be able to name it — `zAct`
 * admits it, and `data/dialogue.json` uses it for the opening cutscene, the three starter branches
 * and nothing else. `LAST_ACT` is the last act the region HAS. Neither is a deadline: the calendar
 * runs past both and nothing expires.
 */
export const FIRST_ACT: number = firstAct(ACT_BALANCE);
export const LAST_ACT: number = lastAct(ACT_BALANCE);

/**
 * The act a set of quest flags puts a save in — **a delegation, not a derivation**.
 *
 * `core/acts.ts` `actOf()` is the repo's only act authority and this is a convenience signature over
 * it for callers that hold a flag bag rather than a whole save. It must never grow a body: the
 * previous body (`1 + badgesBeaten`, clamped at the gym count) was a second opinion that returned 1
 * for a brand-new save where `actOf()` returns 0, which silently made the whole opening chain
 * unreachable in the real game while every dialogue test passed.
 */
export function actFromFlags(flags: Readonly<Record<string, FlagValue>>): number {
  return actOf({ questFlags: { ...flags } }, ACT_GYMS, ACT_BALANCE);
}

/** The calendar is unbounded, so a year in a condition has a floor and no ceiling. */
const zYear = z.number().int().min(FIRST_YEAR);
const zAct = z.number().int().min(FIRST_ACT).max(LAST_ACT);

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
    // The schema half of `DialogueEntry.grants` — see the field's comment for why BOTH halves are
    // required. A count is a whole number of items and at least one: `.min(1)` is that structural
    // identity and not a tunable, so no gameplay constant is typed here (G11).
    grants: z.record(zItemId, z.number().int().min(1)).optional(),
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

/** The medicine ids, READ from `balance.medicine` — `BattleAction {kind:"item", itemId}` resolves these. */
const MEDICINE_IDS: readonly string[] = [balanceJson.medicine.salveItemId, balanceJson.medicine.tonicItemId];

/**
 * THE CLOSED SET OF BAG IDS a `grants` key may name — assembled from the shipped vocabulary, never
 * typed here (G11/INV-4), exactly as {@link NODE_IDS}, {@link LINE_IDS} and {@link SIGN_CHAINS} are.
 *
 * A bag key is one of exactly three things, and every one of them already has an authority:
 *   · a SNARE TIER — `core/types.ts` `SNARE_TIERS`, the same list `BattleAction {kind:"snare"}` takes;
 *   · a MEDICINE — `balance.medicine.salveItemId` / `.tonicItemId`, ids that live in the balance so
 *     `core/battle.ts` resolves an item without a literal;
 *   · a BAIT TAG — build-doc §7.2 defines one as a species line id (species-specific bait) or a ROLE
 *     name (role-generic bait), which is precisely the question `game/battle-input.ts` `isBaitTag`
 *     asks and `core/foodweb.ts` `baitMatchFor` answers. No bait table is introduced or consulted
 *     (G3): this is the same vocabulary read from the same two places.
 *
 * A grant key outside this set names an item the bag will hold, `bagHas` will report, and no pane,
 * snare or bait rule will ever recognise — an entry that hands the player a word.
 */
export const BAG_ITEM_IDS: ReadonlySet<string> = new Set<string>([
  ...SNARE_TIERS,
  ...MEDICINE_IDS,
  ...LINE_IDS,
  ...ROLES,
]);

/**
 * node id -> (species line id -> that line's `carryCap` AT THAT NODE).
 *
 * The region-wide {@link LINE_IDS} cannot answer "does this node carry this line", and that is the
 * question a `population` clause actually asks — see the check in {@link validateDialogueFile}.
 */
const NODE_POPULATIONS: ReadonlyMap<string, ReadonlyMap<string, number>> = new Map(
  NODE_FILES.map((n) => [
    n.id,
    new Map(
      Object.entries(n.populations as Record<string, { carryCap: number }>).map(([id, p]) => [
        id,
        p.carryCap,
      ]),
    ),
  ]),
);

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

/* ── the grant graph ─────────────────────────────────────────────────────── */

/*
 * ⚠ WHY A GRAPH AND NOT A FIELD CHECK.
 *
 * The rule a granting entry has to satisfy is "it cannot play twice". The per-entry self-latch check
 * further down asserts only that the entry writes a flag its own `when` forbids — and an adversarial
 * reviewer walked past that three separate times, each time with a corpus the per-entry check
 * accepted and a measured run that played the grant again:
 *
 *   A. A CHOICE ON THE GRANTING ENTRY REWRITES THE LATCH TO FALSE. `game/dialogue-runner.ts:386`
 *      merges the choice over the entry — its own comment says "The ENTRY's flags are written first
 *      and the CHOICE's second, so a choice that restates a key wins" — so `setFlags` alone is not
 *      what the run actually writes. The measured run wrote `{"tutorial.snare.done": false}` and the
 *      entry was eligible again. (The self-latch docblock anticipated the OPPOSITE case, a choice
 *      SUPPLYING the latch, and missed this one.)
 *   B. AN UNCONDITIONAL `goto` BYPASSES THE LATCH ENTIRELY. `enter()` at
 *      `game/dialogue-runner.ts:330-340` never calls `conditionHolds`, because "`goto` is
 *      unconditional by design" (:325). A REPEATABLE predecessor pointed at the granting entry
 *      therefore replays it with its latch already set and its own `when` never consulted. Nothing
 *      about the granting entry, read alone, can see this: the hole is in the predecessor.
 *   C. A DIFFERENT ENTRY LOWERS THE LATCH. `conditionHolds` reads `flagsUnset` as "absent OR false",
 *      so one `{"tutorial.snare.done": false}` anywhere in the corpus re-opens the door. The
 *      per-entry check never asks who ELSE writes the key.
 *
 * So the question is asked of the corpus as a whole: **an entry is CLOSED when it names a flag in
 * its own `when.flagsUnset` that (a) every path out of it writes to a value other than false, and
 * (b) nothing anywhere in the corpus writes to false.** A granting entry must be closed, and so must
 * every entry that can reach it through `goto`.
 *
 * That is not a stricter reading of the shipped corpus; it is the reading that makes the shipped
 * corpus safe ON PURPOSE. `maren.opening` writes no flags at all and is closed by its CONTINUATION —
 * all three of its choices lead to a starter entry, and every starter writes `story.opening.done`,
 * which is exactly what `maren.opening.when.flagsUnset` requires. A rule that only looked at an
 * entry's own `setFlags` would have to reject it.
 */

/**
 * A BRANCH out of an entry: the flags the runner writes when the player leaves by this route, and
 * the entry that route continues into.
 *
 * It mirrors `game/dialogue-runner.ts` rather than re-imagining it, because a model that disagreed
 * with the runner would be a second opinion about the very thing it is guarding:
 *
 *   · An entry with NO choices leaves through `leaveEntry` (:343) — `setFlags` is written, then
 *     `goto` is followed or the run ends.
 *   · An entry WITH choices never reaches `leaveEntry`: `advanceRun` (:357) refuses to move while
 *     `awaitingChoice`, so `chooseOption` (:372) is the only way out and the entry's own `goto` is
 *     dead code. Each choice is a branch, and its flags are `{...entry.setFlags, ...choice.setFlags}`
 *     because :386 merges the choice OVER the entry. That merge is evasion A, in one expression.
 */
interface RunBranch {
  readonly flags: Readonly<Record<string, FlagValue>>;
  readonly next: string | undefined;
  /** How a diagnostic names this route to an author. */
  readonly label: string;
}

function branchesOf(e: DialogueEntry): RunBranch[] {
  const choices = e.choices ?? [];
  if (choices.length === 0) {
    return [{ flags: e.setFlags ?? {}, next: e.goto, label: "the entry itself" }];
  }
  return choices.map((c) => ({
    flags: { ...(e.setFlags ?? {}), ...(c.setFlags ?? {}) },
    next: c.goto,
    label: `choice "${c.text}"`,
  }));
}

/** The keys a write leaves RAISED — `conditionHolds` treats absent and `false` alike, so `false` is not one. */
function raisedKeys(bag: Readonly<Record<string, FlagValue>>): string[] {
  return Object.entries(bag)
    .filter(([, v]) => v !== false)
    .map(([k]) => k);
}

interface GrantGraph {
  readonly index: ReadonlyMap<string, DialogueEntry>;
  /** entry id -> the entries whose `goto` (entry or choice) enters it. */
  readonly preds: ReadonlyMap<string, ReadonlySet<string>>;
  /** flag key -> the entries that write it to `false` anywhere in the corpus. */
  readonly lowered: ReadonlyMap<string, ReadonlySet<string>>;
  readonly mayWrite: Map<string, ReadonlySet<string>>;
  readonly guaranteed: Map<string, ReadonlySet<string>>;
  /** The entries on the current DFS path, so a `goto` cycle terminates the walk. */
  readonly onPath: Set<string>;
}

function buildGrantGraph(file: DialogueFile): GrantGraph {
  const index = new Map(file.entries.map((e) => [e.id, e] as const));
  const preds = new Map<string, Set<string>>();
  const lowered = new Map<string, Set<string>>();
  for (const e of file.entries) {
    for (const b of branchesOf(e)) {
      if (b.next !== undefined) {
        const into = preds.get(b.next) ?? new Set<string>();
        into.add(e.id);
        preds.set(b.next, into);
      }
      for (const [k, v] of Object.entries(b.flags)) {
        if (v !== false) continue;
        const writers = lowered.get(k) ?? new Set<string>();
        writers.add(e.id);
        lowered.set(k, writers);
      }
    }
  }
  return { index, preds, lowered, mayWrite: new Map(), guaranteed: new Map(), onPath: new Set() };
}

/** Every flag key written ANYWHERE downstream of `startId`, following `goto` — a may-write set. */
function writesReachableFrom(g: GrantGraph, startId: string): ReadonlySet<string> {
  const cached = g.mayWrite.get(startId);
  if (cached !== undefined) return cached;
  const out = new Set<string>();
  const seen = new Set<string>();
  const stack: string[] = [startId];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    const e = g.index.get(id);
    if (e === undefined) continue;
    for (const b of branchesOf(e)) {
      for (const k of Object.keys(b.flags)) out.add(k);
      if (b.next !== undefined) stack.push(b.next);
    }
  }
  g.mayWrite.set(startId, out);
  return out;
}

/**
 * The flags that are still RAISED when EVERY run through `id` ends — a must-write set.
 *
 * This is the half of the answer the per-entry check cannot compute. A flag counts only if every
 * branch out of the entry ends with it raised, so a single choice that writes it `false` (evasion A)
 * or a downstream entry that might overwrite it removes it from the answer.
 *
 * Deliberately conservative in two places, and conservative here means STRICTER — it can only shrink
 * the answer, so it can only refuse a corpus, never wave one through:
 *   · a key written on this entry counts only if NOTHING downstream writes it at all (a may-write
 *     set is cheaper and safer than trying to decide which downstream write lands last);
 *   · a `goto` cycle contributes nothing, which is also what happens at runtime — `enter()`'s loop
 *     guard (:331) ends the run when a chain re-enters an entry it has already played.
 * The memo is keyed by entry alone; with cycles that can cache a smaller set than a path-sensitive
 * walk would produce, which is the safe direction, and the shipped `goto` graph is acyclic.
 */
function guaranteedWrites(g: GrantGraph, id: string): ReadonlySet<string> {
  const cached = g.guaranteed.get(id);
  if (cached !== undefined) return cached;
  const entry = g.index.get(id);
  if (entry === undefined || g.onPath.has(id)) return new Set<string>();

  g.onPath.add(id);
  let out: Set<string> | undefined;
  for (const b of branchesOf(entry)) {
    const here = raisedKeys(b.flags);
    let survives: Set<string>;
    if (b.next === undefined) {
      survives = new Set(here);
    } else {
      survives = new Set(guaranteedWrites(g, b.next));
      const mayOverwrite = writesReachableFrom(g, b.next);
      for (const k of here) if (!mayOverwrite.has(k)) survives.add(k);
    }
    out = out === undefined ? survives : new Set([...out].filter((k) => survives.has(k)));
  }
  g.onPath.delete(id);

  const result: ReadonlySet<string> = out ?? new Set<string>();
  g.guaranteed.set(id, result);
  return result;
}

/**
 * The flags that CLOSE an entry: named in its own `when.flagsUnset`, raised on every path out of it,
 * and never written `false` by anything in the corpus. A non-empty result means the entry cannot be
 * SELECTED a second time; an empty one means it is repeatable.
 *
 * An entry with no `flagsUnset` at all is repeatable by definition, and that is the common case — a
 * greeting, an ambient line, a shopkeeper. Nothing is wrong with a repeatable entry; it is only a
 * problem when it hands out items, or when it can `goto` into something that does.
 */
function closingFlags(g: GrantGraph, e: DialogueEntry): string[] {
  const required = e.when?.flagsUnset ?? [];
  if (required.length === 0) return [];
  const guaranteed = guaranteedWrites(g, e.id);
  return required.filter((k) => guaranteed.has(k) && !g.lowered.has(k));
}

/**
 * Every entry that can reach `targetId` through `goto` edges, transitively.
 *
 * TRANSITIVE because the hole is: `enter()` does not consult conditions, so a repeatable entry two
 * `goto` hops upstream replays the whole chain below it. The shipped corpus is exactly that shape —
 * `maren.opening` → `maren.starter.*` → `maren.tutorial.snare` — and only the transitive walk
 * reaches `maren.opening`, which is the entry a player actually stands in front of.
 */
function gotoAncestorsOf(g: GrantGraph, targetId: string): string[] {
  const seen = new Set<string>();
  const stack: string[] = [...(g.preds.get(targetId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    for (const p of g.preds.get(id) ?? []) stack.push(p);
  }
  // A cycle back onto the granting entry is the runner's loop guard's business, not this check's.
  seen.delete(targetId);
  return [...seen].sort();
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

    /*
     * ⚠ A GRANT HAS TWO SILENT FAILURE MODES, AND NEITHER PERMANENT GATE CAN SEE EITHER.
     *
     * `tests/gates/reachability.test.ts` and `tests/gates/quest-layer.test.ts` ask whether an
     * authored LINE can reach the screen. A grant is not a line; it is a write to the player's bag
     * that happens when the entry plays, so a corpus can be fully reachable and still be wrong in
     * both of the ways below. They are checked here because here is the only place that sees them.
     *
     * 1. AN ID NOBODY HONOURS. The bag is `Record<string, number>` and nothing downstream refuses a
     *    key: `bagHas`/`bagConsume` (core/battle.ts) work on any string, and `game/battle-input.ts`
     *    routes a bag key to a pane by ASKING what it is — a snare tier, a medicine, a bait tag.
     *    A key that is none of the three is stock the player owns and can never use, and it fails
     *    by being invisible. So the id is resolved against {@link BAG_ITEM_IDS}, a CROSS-REFERENCE
     *    against the shipped vocabulary — not a regex, which would admit `snair` and every other
     *    near-miss of a real id.
     *
     * 2. A LINE THAT MINTS ITEMS FOR EVER. This is the one that matters. An entry's `grants` fires
     *    every time the entry PLAYS, and an entry stays eligible until something makes it
     *    ineligible. `conditionHolds` is the only rule about eligibility, and the only self-closing
     *    shape it admits is the LATCH: the entry writes a flag in `setFlags` that its own
     *    `when.flagsUnset` requires to be absent, so the write that ends the beat is the write that
     *    closes the door. Without it a granting entry is a cutscene the player can re-enter — walk
     *    out, walk back, take three more snares, for the rest of the run — and nothing in the suite
     *    goes red, because every line involved was reachable and every id was real.
     *
     *    The latch must be on the ENTRY's own `setFlags`, not a choice's: a choice-written flag is
     *    only written on the branch the player happens to take, so an entry latched by one of its
     *    choices is unlatched down every other branch. And the written value must not be `false` —
     *    `conditionHolds` reads `flagsUnset` as "absent OR false", so `{latch: false}` is the latch
     *    being lowered again in the same breath it is raised (`quest-layer` GATE 2c, whose
     *    turn-in rule this check is modelled on, refuses the same shape for the same reason).
     *
     *    ⚠ THIS CHECK IS NECESSARY AND NOT SUFFICIENT, AND ON ITS OWN IT WAS DEFEATED THREE WAYS.
     *    It reads one entry's own fields, and three of the four ways a grant fires twice are not
     *    visible from inside the entry: a choice that rewrites the latch after `setFlags` has been
     *    read, a repeatable `goto` predecessor that never consults the latch at all, and a different
     *    entry that lowers it. Those are settled in THE GRANT GRAPH below, which asks the same
     *    question of the whole corpus. Both halves run; this one names the field, that one names the
     *    path.
     */
    if (e.grants !== undefined) {
      for (const itemId of Object.keys(e.grants)) {
        if (!BAG_ITEM_IDS.has(itemId)) {
          issues.push(
            `${where}: grants "${itemId}", which is not a bag id — a grant key must be a snare tier ` +
              `(${SNARE_TIERS.join(", ")}), a medicine from balance.medicine (${MEDICINE_IDS.join(", ")}), ` +
              `or a bait tag: a species line id from data/species.json or a role (${ROLES.join(", ")})`,
          );
        }
      }
      const written = Object.entries(e.setFlags ?? {});
      const unset = new Set(e.when?.flagsUnset ?? []);
      const latches = written.filter(([k, v]) => unset.has(k) && v !== false);
      if (latches.length === 0) {
        issues.push(
          `${where}: grants [${Object.keys(e.grants).join(", ")}] but is not self-latching — it writes ` +
            `[${written.map(([k, v]) => `${k}=${String(v)}`).join(", ") || "nothing"}] and its own ` +
            `when.flagsUnset is [${[...unset].join(", ") || "empty"}], so nothing it sets closes it. ` +
            `An entry that grants items must write a flag in setFlags — to a value other than false — ` +
            `that its own when.flagsUnset requires to be unset; otherwise it hands out its items ` +
            `every time it plays, and it can play as often as the player walks back in`,
        );
      }
    }

    /*
     * ⚠ A POPULATION CLAUSE IS CHECKED AGAINST THE NODE'S OWN NUMBERS, NOT THE REGION'S.
     *
     * Both checks below used to be one line against the GLOBAL `LINE_IDS`, and that is a hole a
     * reachability gate cannot close from the outside. `conditionHolds` reads
     * `ctx.populations[node]?.[lineId]` and returns false the moment the count is `undefined`, so
     * `{node: "hearthollow", lineId: "vellsire-line"}` — a real node, a real line, and a line that
     * node has never carried — is a clause that is FALSE in every world state the sim can produce,
     * for ever. It validated. So did a threshold no node could reach: the Sanctum's Ancient ships
     * at `count 1, breedRate 0, carryCap 1`, so `gte 2` there is the never-cut finale gated on an
     * arithmetic impossibility.
     *
     * Only the permanently-FALSE direction is refused. `lt`/`lte` above the cap is vacuously true
     * rather than dead — noise, not a lost beat — and refusing it would reject an author writing a
     * deliberate "however many there are" clause.
     */
    for (const p of e.when?.population ?? []) {
      const popNode = NODE_POPULATIONS.get(p.node);
      if (popNode === undefined) {
        issues.push(`${where}: population condition names unknown node "${p.node}"`);
        continue;
      }
      if (!LINE_IDS.has(p.lineId)) {
        issues.push(`${where}: population condition names unknown species line "${p.lineId}"`);
        continue;
      }
      const cap = popNode.get(p.lineId);
      if (cap === undefined) {
        issues.push(
          `${where}: population condition reads "${p.lineId}" at node "${p.node}", which has no ` +
            `population of that line — the clause can never hold (node carries: ` +
            `${[...popNode.keys()].sort().join(", ")})`,
        );
        continue;
      }
      const unreachable =
        (p.op === "gte" && p.value > cap) ||
        (p.op === "gt" && p.value >= cap) ||
        (p.op === "eq" && p.value > cap);
      if (unreachable) {
        issues.push(
          `${where}: population condition "${p.lineId}" ${p.op} ${String(p.value)} at node ` +
            `"${p.node}" is above that line's carryCap ${String(cap)} — the clause can never hold`,
        );
      }
    }
    for (const f of e.when?.floraStock ?? []) {
      if (!NODE_IDS.has(f.node)) issues.push(`${where}: floraStock condition names unknown node "${f.node}"`);
    }
  }

  /*
   * THE GRANT GRAPH — the three checks the per-entry latch check above cannot make.
   *
   * Each one closes a measured evasion of that check: a corpus that passed it and still played its
   * grant a second time. The reasoning is in the block comment above {@link branchesOf}; the
   * per-check notes below name the runner line that makes each hole possible.
   *
   * Skipped entirely when nothing grants, so a corpus with no `grants` pays nothing for it.
   */
  const granting = file.entries.filter((e) => e.grants !== undefined);
  if (granting.length > 0) {
    const graph = buildGrantGraph(file);
    for (const e of granting) {
      const where = `entry "${e.id}"`;
      const items = Object.keys(e.grants ?? {}).sort().join(", ");
      const required = new Set(e.when?.flagsUnset ?? []);
      const ownLatches = Object.entries(e.setFlags ?? {})
        .filter(([k, v]) => required.has(k) && v !== false)
        .map(([k]) => k);
      // No own latch at all is the per-entry check's complaint, already filed. Saying it twice in
      // two vocabularies would make one defect read like two.
      if (ownLatches.length === 0) continue;

      /*
       * EVASION A — the latch does not survive the entry.
       *
       * `chooseOption` (game/dialogue-runner.ts:386) writes `{...entry.setFlags, ...choice.setFlags}`
       * — the choice wins on any key it restates — so what the run actually leaves behind is the
       * MERGE, not `setFlags`. A choice restating the latch as `false` was measured writing
       * `{"tutorial.snare.done": false}`, after which the entry was eligible again. The same
       * arithmetic catches a downstream entry that overwrites the latch before the run ends.
       */
      const surviving = ownLatches.filter((k) => guaranteedWrites(graph, e.id).has(k));
      if (surviving.length === 0) {
        const openRoutes = branchesOf(e)
          .filter((b) => !raisedKeys(b.flags).some((k) => ownLatches.includes(k)))
          .map((b) => b.label);
        issues.push(
          `${where}: grants [${items}] and latches on [${ownLatches.join(", ")}], but no latch survives the ` +
            `run — ${openRoutes.length > 0 ? `${openRoutes.join(" and ")} leaves without one raised` : "a path out of it ends with every latch lowered"}. ` +
            `A choice's setFlags are merged OVER the entry's (game/dialogue-runner.ts:386, "a choice that ` +
            `restates a key wins"), so a choice restating the latch as false lowers it and the entry is ` +
            `eligible again. Every branch out of a granting entry must end with one of its latch flags raised`,
        );
      } else {
        /*
         * EVASION C — a DIFFERENT entry lowers the latch.
         *
         * `conditionHolds` reads `flagsUnset` as "absent OR false", so one `{latch: false}` anywhere
         * in the corpus re-opens the granting entry. The per-entry check is per-entry and never asks
         * who else writes the key; this does.
         */
        const standing = surviving.filter((k) => !graph.lowered.has(k));
        if (standing.length === 0) {
          const named = surviving
            .map((k) => `"${k}" by [${[...(graph.lowered.get(k) ?? [])].sort().join(", ")}]`)
            .join("; ");
          issues.push(
            `${where}: grants [${items}] and latches on [${surviving.join(", ")}], but every one of those ` +
              `flags is written false elsewhere in the corpus — ${named}. conditionHolds reads ` +
              `when.flagsUnset as "absent OR false", so a false write anywhere re-opens this entry and it ` +
              `hands out its items again. Nothing outside a granting entry may lower its latch`,
          );
        }
      }

      /*
       * EVASION B — an unconditional `goto` bypasses the latch entirely.
       *
       * `enter()` (game/dialogue-runner.ts:330-340) never calls `conditionHolds`, because "`goto` is
       * unconditional by design" (:325). So a REPEATABLE entry that can reach this one through
       * `goto` replays the grant with the latch already set and this entry's `when` never consulted;
       * the measured run played ["maren.idle.repeatable", "maren.tutorial.snare",
       * "maren.tutorial.survey"] with `tutorial.snare.done` already true and no problem reported.
       *
       * The shipped corpus survives this on purpose rather than by luck: `maren.opening` is closed by
       * `story.opening.done`, which all three of its choices reach a writer of, and each
       * `maren.starter.*` is closed by writing it itself. Nothing enforced that before this check;
       * a single repeatable entry pointed at `maren.tutorial.snare` was all it took.
       */
      for (const ancestorId of gotoAncestorsOf(graph, e.id)) {
        const ancestor = graph.index.get(ancestorId);
        if (ancestor === undefined) continue;
        if (closingFlags(graph, ancestor).length > 0) continue;
        const forbids = ancestor.when?.flagsUnset ?? [];
        const guarantees = [...guaranteedWrites(graph, ancestorId)].sort();
        // Two different ways to be open, and they need different diagnostics: the predecessor
        // forbids nothing it is sure to write (author it a latch), or it does and somebody else
        // writes that flag false (delete the false write).
        const wouldClose = forbids.filter((k) => guarantees.includes(k));
        const why =
          wouldClose.length > 0
            ? `it forbids [${wouldClose.join(", ")}] and every path out of it raises that, but ` +
              wouldClose
                .map((k) => `"${k}" is written false by [${[...(graph.lowered.get(k) ?? [])].sort().join(", ")}]`)
                .join("; ")
            : `it forbids [${forbids.join(", ") || "nothing"}] and every path out of it raises ` +
              `[${guarantees.join(", ") || "nothing"}], which do not meet`;
        issues.push(
          `${where}: grants [${items}] but "${ancestorId}" reaches it through goto and can play more than ` +
            `once — ${why}. goto is unconditional ` +
            `(game/dialogue-runner.ts:325) and enter() never calls conditionHolds (:330-340), so that entry ` +
            `replays the grant with this entry's latch already set and its when never consulted. Every entry ` +
            `that can reach a granting entry through goto must itself be closed: it must forbid a flag that ` +
            `every path out of it raises and that nothing in the corpus writes false`,
        );
      }
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
   * The STORY clock, `FIRST_ACT..LAST_ACT` (0..6 as shipped — act 0 is the prologue).
   *
   * Required, never optional: an act gate that silently passed because nobody supplied an act is how
   * the finale stops firing without anything going red. `core/acts.ts` `actOf(save, gyms, balance)`
   * is the canonical derivation and `actFromFlags(flags)` is the same function under a flags-only
   * signature — the game layer must call one of them rather than re-deriving the badge ladder,
   * exactly as it must call `conditionHolds` rather than re-deriving condition resolution.
   *
   * **Out of range is an exception, not `false`.** `assertContext` below refuses an act outside the
   * ladder, because the alternative — every `act` clause quietly evaluating false — is the identical
   * silent failure the "required, never optional" rule above exists to prevent, and it is what an
   * act model that started at 1 while the game started at 0 actually did.
   */
  act: number;
  /** The WORLD clock. Unbounded — this may be any year ≥ 1, well past `NOMINAL_YEARS`. */
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

/**
 * Fail loud on a context off either clock.
 *
 * An act outside `FIRST_ACT..LAST_ACT` makes every `act` / `actMin` clause false and every entry
 * without one eligible — a game that renders the fallback line everywhere and reports nothing. A
 * year below the calendar's first is the same shape on the other axis. Both are caller bugs and both
 * are cheap to catch here, at the one function every lookup goes through.
 */
function assertContext(ctx: DialogueContext): void {
  if (!Number.isInteger(ctx.act) || ctx.act < FIRST_ACT || ctx.act > LAST_ACT) {
    throw new DialogueValidationError([
      `DialogueContext.act is ${String(ctx.act)}, outside the act ladder ${String(FIRST_ACT)}..${String(LAST_ACT)} ` +
        "(data/balance.json acts.first/acts.last). Derive it with core/acts.ts actOf(), never by counting badges.",
    ]);
  }
  if (!Number.isInteger(ctx.year) || ctx.year < FIRST_YEAR) {
    throw new DialogueValidationError([
      `DialogueContext.year is ${String(ctx.year)}, before the calendar's first year ${String(FIRST_YEAR)} ` +
        "(data/balance.json clock.startYear). The calendar has no upper bound; it does have a start.",
    ]);
  }
}

/** True when every clause of `when` holds against `ctx`. An absent `when` is always true. */
export function conditionHolds(when: DialogueCondition | undefined, ctx: DialogueContext): boolean {
  assertContext(ctx);
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
 * THE selection rule, in one place: of the entries a caller is willing to consider, the
 * highest-priority ELIGIBLE one, ties broken by file order.
 *
 * Every other selector in the repo is this function under a narrower `match`. That is deliberate:
 * `selectEntry` (speaker, node, kind) cannot answer a PROP question — two shell-kiln shrines stand
 * in Cindershelf and both are read off the same `prop-shell-kiln-shrine` speaker in the same node
 * with the same kind, so a (speaker, node, kind) lookup cannot tell the mine shrine from the deep
 * one and would answer whichever the conditions happened to admit. The game layer needs that
 * question answered and must NOT grow its own priority loop to answer it — a second implementation
 * of "which entry wins" is the same class of defect a second act model was.
 */
export function selectEntryWhere(
  file: DialogueFile,
  ctx: DialogueContext,
  match: (entry: DialogueEntry) => boolean,
): DialogueEntry | undefined {
  // Checked here as well as in conditionHolds: a request with no candidate entries at all never
  // reaches conditionHolds, and "nothing to say" must not be how a bad act reports itself.
  assertContext(ctx);
  let best: DialogueEntry | undefined;
  let bestPriority = -1;
  for (const e of file.entries) {
    if (!match(e)) continue;
    if (!conditionHolds(e.when, ctx)) continue;
    const p = e.priority ?? 0;
    if (p > bestPriority) {
      best = e;
      bestPriority = p;
    }
  }
  return best;
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
  return selectEntryWhere(
    file,
    ctx,
    (e) => e.speaker === speaker && e.node === node && e.kind === kind,
  );
}

/**
 * The entry a PROP reads out right now — the one question `selectEntry` structurally cannot answer.
 *
 * `propId` is the discriminator, and the node is checked as well because `validateDialogueFile`
 * already refuses an entry whose `propId` lives in another node: asking for both means a corpus that
 * ever drifted would return nothing rather than the wrong prop's line.
 */
export function selectPropEntry(
  file: DialogueFile,
  propId: string,
  node: string,
  ctx: DialogueContext,
): DialogueEntry | undefined {
  return selectEntryWhere(file, ctx, (e) => e.propId === propId && e.node === node);
}

/** The entry with this id, or undefined. `goto` targets are validated, so this resolves them. */
export function entryById(file: DialogueFile, id: string): DialogueEntry | undefined {
  return file.entries.find((e) => e.id === id);
}

/** The speaker record behind an id — the name plate a dialogue box draws. */
export function speakerById(file: DialogueFile, id: string): DialogueSpeaker | undefined {
  return file.speakers.find((s) => s.id === id);
}

/* ── what the corpus asks the GAME for ───────────────────────────────────── */

/** Every flag key the corpus reads, in a condition of any kind. */
export function flagsRead(file: DialogueFile): ReadonlySet<string> {
  const out = new Set<string>();
  for (const e of file.entries) {
    for (const k of e.when?.flagsSet ?? []) out.add(k);
    for (const k of e.when?.flagsUnset ?? []) out.add(k);
    for (const fe of e.when?.flagEquals ?? []) out.add(fe.key);
  }
  return out;
}

/** Every flag key the corpus writes, from an entry's `setFlags` or a choice's. */
export function flagsWritten(file: DialogueFile): ReadonlySet<string> {
  const out = new Set<string>();
  for (const e of file.entries) {
    for (const k of Object.keys(e.setFlags ?? {})) out.add(k);
    for (const c of e.choices ?? []) for (const k of Object.keys(c.setFlags ?? {})) out.add(k);
  }
  return out;
}

/**
 * The flags the corpus READS and never writes — the bill it hands the game layer.
 *
 * DERIVED, never listed. A writer that ships against a hand-written list of these stops covering
 * the corpus the moment the corpus moves.
 * Sorted so callers and tests see one order.
 */
export function externallyGrantedFlags(file: DialogueFile): string[] {
  const written = flagsWritten(file);
  return [...flagsRead(file)].filter((k) => !written.has(k)).sort();
}
