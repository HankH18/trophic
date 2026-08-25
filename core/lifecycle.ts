/**
 * core/lifecycle.ts — aging, the year turn, retirement and heirs.
 *
 * build-doc §7.5 "Party, Aging, Retirement", locked decision L9 (J3/A2/E1 lifespans, ×0.75/1.0/1.15,
 * hybrid metamorphic model, heir-or-boon retirement) and Hard Requirement 4 ("Everything ages at
 * year turns, including boxed creatures. Sole exception: caught Ancients.").
 *
 * Pure TypeScript, ZERO engine imports (L11) and zero gameplay literals (G11/INV-4): every number
 * used here is read from `Balance` (data/balance.json). This file contains no ambient randomness;
 * it arrives as an injected `RandomFn` that the caller builds from the save seed with core/rng.ts
 * (build-doc §8.1).
 *
 * ⚠ `core/schemas.ts` validates balance.json with a plain zod `z.object`, which STRIPS unknown
 * keys. `retirement.heirLevelMin` / `retirement.boonMaxStacksPerStat` / top-level `yearEvents` were
 * merged into balance.json at integration and declared in BOTH `Balance` (core/types.ts) and
 * `zBalance` (core/schemas.ts) — without the schema entry a key in the file never reaches these
 * accessors and every retune of it is silently ignored (INV-3). `tests/gates/schemas.test.ts`
 * (`balance_keys_survive_validation`) gates every leaf of balance.json against exactly that.
 * See docs/DEVIATIONS-lane-a4.md D-A4-11.
 *
 * The module is a set of PURE state transitions. `runYearTurn` never mutates its input and never
 * asks a question: creatures that reach zero years come back as `RetirementPrompt[]`, so the Phaser
 * year-turn scene (C6) can present the choice and the headless balance harness (A5) can answer it
 * without a UI.
 */

import type {
  ActionLogEntry,
  AgeClass,
  Balance,
  Boon,
  NodeFile,
  NodeState,
  OwnedCreature,
  RetirementChoice,
  RetirementPrompt,
  Role,
  SaveFile,
  Season,
  SpeciesLine,
  StatKey,
  Trait,
  TypeName,
} from "./types";
import { AGE_CLASSES } from "./types";
/*
 * build-doc §7.4 owns ONE metamorphic rule, and core/battle.ts is where it is written. Composing it
 * here (rather than restating it) is what keeps a wild-caught Adult of a metamorphic line worth the
 * same in the creature card, the harness and the battle: bible §4 — "Wild adults of a line only
 * appear in evolved form". core/battle.ts imports nothing from this module, so there is no cycle.
 */
import { hasMetamorphosed } from "./battle";

/* ────────────────────────────────────────────────────────────────────────────
 * Injected collaborators — lifecycle owns none of these implementations.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Uniform float in [0, 1). build-doc §8.1: "One seeded xorshift128 stream per subsystem, seeds
 * derived from save seed + subsystem tag", and §8.1 bans ambient randomness. The year turn takes the
 * stream as a function so core/lifecycle.ts never constructs (or duplicates) core/rng.ts — the
 * caller passes `makeRng(save.seed, "sim")`.
 */
export type RandomFn = () => number;

/**
 * build-doc §7.3 `ecosim.step(node, season, rng)`, injected. Lifecycle knows only that a year turn
 * owes each node its 4th season step (build-doc §7.5 step 5); core/ecosim.ts owns what that means.
 */
export type EcosimStepFn = (nodeId: string, state: NodeState, season: Season) => NodeState;

/** Raised for a caller error the types cannot rule out (missing species, unknown boon target, …). */
export class LifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LifecycleError";
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * "Never" sentinel — Ancients (Hard Req 4 / G10)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * bible §4: Ancients "do not age and do not evolve — permanently Elder stage". They therefore have
 * no retirement year, but `OwnedCreature.projectedRetirementYear` is a `number` that core/schemas.ts
 * validates as a positive integer, so "never" needs a value rather than a null. MAX_SAFE_INTEGER is
 * that value: it is an integer, it survives JSON round-trips exactly, and no real year can reach it.
 *
 * This is a sentinel, not a gameplay constant — nothing about the game changes if it changes — so
 * G11/INV-4 does not put it in balance.json. Read it through `isNever()`, never by comparison.
 */
export const NEVER = Number.MAX_SAFE_INTEGER;

/** True for the Ancients' "no retirement year" / "no years remaining" sentinel. */
export function isNever(value: number): boolean {
  return value >= NEVER;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Species lookup helpers
 * ──────────────────────────────────────────────────────────────────────────── */

export type SpeciesIndex = ReadonlyMap<string, SpeciesLine>;

export function indexSpecies(species: readonly SpeciesLine[]): SpeciesIndex {
  const map = new Map<string, SpeciesLine>();
  for (const line of species) map.set(line.id, line);
  return map;
}

export function lineOf(index: SpeciesIndex, lineId: string): SpeciesLine {
  const line = index.get(lineId);
  if (!line) throw new LifecycleError(`unknown species line "${lineId}" — not in species.json`);
  return line;
}

/** bible §4 — the line's identity at an age class ("Bogling" at J, "Mirefin" at A/E). */
export function formNameOf(line: SpeciesLine, age: AgeClass): string {
  return line.formNames[age];
}

export function typesOf(line: SpeciesLine, age: AgeClass): TypeName[] {
  return line.types[age];
}

export function roleOf(line: SpeciesLine, age: AgeClass): Role {
  return line.role[age];
}

/** build-doc §7.5 step 4 / G10 — the sole exception to the everything-ages rule. */
export function isAncient(creature: OwnedCreature, index: SpeciesIndex): boolean {
  return lineOf(index, creature.lineId).ancient;
}

/** J → A → E; E is terminal. */
export function nextAgeClass(age: AgeClass): AgeClass {
  const i = AGE_CLASSES.indexOf(age);
  const next = AGE_CLASSES[i + 1];
  return next ?? age;
}

/* ────────────────────────────────────────────────────────────────────────────
 * balance.json accessors for the year-turn tunables (G11)
 *
 * All three were merged into data/balance.json at integration and are declared in `Balance` and in
 * `zBalance`. They keep dedicated accessors because callers (C6's year-turn scene, the A5 harness)
 * read them by name and because a missing value must fail loud, not default silently.
 * ──────────────────────────────────────────────────────────────────────────── */

/** build-doc §7.5 step 5 / bible §9 — "Cullbrand Harvest raids (scripted per act …)". */
export interface RaidTarget {
  lineId: string;
  remove: number;
}

export interface RaidScript {
  id: string;
  year: number;
  nodeId: string;
  targets: RaidTarget[];
}

/** Minimum level an heir can land on (bible §2: "Levels 1–40"). */
export function heirLevelMin(balance: Balance): number {
  return requireTunable(balance.retirement.heirLevelMin, "retirement.heirLevelMin");
}

/**
 * How many boons on ONE stat a single creature may carry (build-doc §7.5 step 3 states the +10%
 * but bounds nothing). Without a bound, a party of six Elders retiring in one turn stacks six
 * boons on one teammate for +60% — a number the §10.5 round-robin band cannot survive.
 */
export function boonMaxStacksPerStat(balance: Balance): number {
  return requireTunable(
    balance.retirement.boonMaxStacksPerStat,
    "retirement.boonMaxStacksPerStat",
  );
}

/**
 * INV-3/INV-4 — a tunable that is absent because zod stripped it must fail loud, never default.
 * A silent default is the exact shape of "retuning balance.json looks applied and is not".
 */
function requireTunable(value: number | undefined, path: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new LifecycleError(
    `core/lifecycle.ts: balance.${path} is ${String(value)}, not a finite number. It must be in ` +
      "data/balance.json AND declared in core/types.ts `Balance` and core/schemas.ts `zBalance` — " +
      "z.object strips undeclared keys, so a key in the file the schema does not know about never " +
      "reaches this reader (INV-3).",
  );
}

/** The scripted year events. Data, never code — see G6: a raid may only decrement what it harvests. */
export function yearEventsOf(balance: Balance, override?: readonly RaidScript[]): readonly RaidScript[] {
  if (override) return override;
  const raids = balance.yearEvents?.raids;
  if (!Array.isArray(raids)) {
    throw new LifecycleError(
      "core/lifecycle.ts: balance.yearEvents.raids is missing. build-doc §7.5 step 5's raid " +
        "scripts are DATA (data/balance.json) and must also be declared in `Balance` + `zBalance`; " +
        "an empty list is how a year with no raid is expressed, never an absent group (INV-3).",
    );
  }
  return raids;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Projected retirement year — bible §12 hard requirement, displayed on the creature card
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * bible §12 lists "team/creature summary (shows projected retirement year)" as a screen, so this is
 * a hard requirement and must be answerable at ANY moment, not only during a year turn.
 *
 * The identity is `currentYear + yearsRemaining`, which is invariant across a year turn: the turn
 * adds one to the year and takes one off the remainder. Ancients return the `NEVER` sentinel.
 */
export function projectedRetirementYear(
  creature: OwnedCreature,
  currentYear: number,
  line: SpeciesLine,
): number {
  if (line.ancient) return NEVER;
  if (isNever(creature.yearsRemaining)) return NEVER;
  return currentYear + creature.yearsRemaining;
}

/** Same, resolving the species line from an index. */
export function projectedRetirementYearOf(
  creature: OwnedCreature,
  currentYear: number,
  index: SpeciesIndex,
): number {
  return projectedRetirementYear(creature, currentYear, lineOf(index, creature.lineId));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Stat contributions the aging system owns (composed by core/battle.ts, build-doc §7.4)
 * ──────────────────────────────────────────────────────────────────────────── */

/** bible §2 — Juvenile ×0.75 · Adult ×1.0 · Elder ×1.15. */
export function ageMultiplier(age: AgeClass, balance: Balance): number {
  return balance.age.multiplier[age];
}

/**
 * build-doc §7.4 — "metamorphic J→A adds ×1.15 once".
 *
 * The rule has ONE implementation, `core/battle.ts` `hasMetamorphosed`, and this composes it. The
 * `metamorphosed` latch answers when it is present (a creature raised from J through the year turn);
 * when it is absent the AGE answers, because bible §4 says "wild adults of a line only appear in
 * evolved form". Restating the rule here is how a wild-caught Mirefin Adult ended up 15% weaker on
 * the creature card than an identical raised one — see docs/DEVIATIONS-lane-a4.md D-A4-12.
 */
export function metamorphicStatMultiplier(
  creature: OwnedCreature,
  line: SpeciesLine,
  balance: Balance,
): number {
  return hasMetamorphosed(line, creature.age, creature.metamorphosed)
    ? balance.age.metamorphicJump
    : 1;
}

/** The whole aging contribution to a stat: age multiplier × the once-only metamorphic jump. */
export function ageFormMultiplier(
  creature: OwnedCreature,
  line: SpeciesLine,
  balance: Balance,
): number {
  return ageMultiplier(creature.age, balance) * metamorphicStatMultiplier(creature, line, balance);
}

/**
 * build-doc §7.5 step 3 — BOON: "a chosen teammate gains a permanent +10% to one stat". Boons stack
 * additively, so two boons on one stat read as +20% rather than +21%, and the count is capped at
 * `boonMaxStacksPerStat` so a mass retirement cannot mint an arbitrary multiplier.
 *
 * The percentage is `balance.stats.boonModPct` — the SAME key core/battle.ts `effectiveStats` reads.
 * balance.json also carries `retirement.boonStatPct` with the same value today; two homes for one
 * number is exactly what its own `_singleSource` rule forbids, and reading the other one is how the
 * card and the battle silently disagreed under a retune (docs/DEVIATIONS-lane-a4.md D-A4-13).
 */
export function boonMultiplier(creature: OwnedCreature, stat: StatKey, balance: Balance): number {
  let n = 0;
  for (const boon of creature.boons) if (boon.stat === stat) n += 1;
  return 1 + balance.stats.boonModPct * Math.min(n, boonMaxStacksPerStat(balance));
}

/**
 * The uids a BOON may legally be granted to right now: everything the player still owns, minus
 * anyone already carrying the cap on that stat. C6 greys the BOON button out when this is empty
 * (the whole party retiring in one turn is the common case, not an edge case), and `advanceYear`
 * uses it to refuse an illegal choice without losing the year turn.
 */
export function boonTargetUids(save: SaveFile, balance: Balance, stat?: StatKey): string[] {
  const cap = boonMaxStacksPerStat(balance);
  const out: string[] = [];
  for (const c of [...save.party, ...save.box]) {
    if (stat !== undefined) {
      let n = 0;
      for (const boon of c.boons) if (boon.stat === stat) n += 1;
      if (n >= cap) continue;
    }
    out.push(c.uid);
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Construction
 * ──────────────────────────────────────────────────────────────────────────── */

export interface NewCreatureOpts {
  uid: string;
  lineId: string;
  age: AgeClass;
  level: number;
  caughtYear: number;
  traits?: Trait[];
  relicSlot?: string;
  nickname?: string;
  boxed?: boolean;
  xp?: number;
  curHp?: number;
  /** Overrides the bible §4 default ("wild adults only appear in evolved form"). */
  metamorphosed?: boolean;
}

/**
 * build-doc §7.5 — `yearsRemaining` is "J:3 A:2 E:1 at catch" (balance.age.lifespanYears).
 * bible §4 — a caught Ancient is "permanently Elder stage" and exempt from year turns, so it is
 * forced to E and given the `NEVER` sentinel rather than a countdown.
 *
 * The metamorphic latch is stamped AT CATCH for a metamorphic line caught above Juvenile, so the
 * stored creature says what it is instead of leaving every reader to re-derive it (bible §4: wild
 * adults of a line only appear in evolved form).
 */
export function newOwnedCreature(
  opts: NewCreatureOpts,
  line: SpeciesLine,
  balance: Balance,
): OwnedCreature {
  const age: AgeClass = line.ancient ? "E" : opts.age;
  const yearsRemaining = line.ancient ? NEVER : balance.age.lifespanYears[age];
  const creature: OwnedCreature = {
    uid: opts.uid,
    lineId: line.id,
    age,
    level: opts.level,
    caughtYear: opts.caughtYear,
    yearsRemaining,
    traits: opts.traits ? opts.traits.map((t) => ({ ...t })) : [],
    boons: [],
    projectedRetirementYear: line.ancient ? NEVER : opts.caughtYear + yearsRemaining,
  };
  if (hasMetamorphosed(line, age, opts.metamorphosed)) creature.metamorphosed = true;
  if (opts.relicSlot !== undefined) creature.relicSlot = opts.relicSlot;
  if (opts.nickname !== undefined) creature.nickname = opts.nickname;
  if (opts.boxed !== undefined) creature.boxed = opts.boxed;
  if (opts.xp !== undefined) creature.xp = opts.xp;
  if (opts.curHp !== undefined) creature.curHp = opts.curHp;
  return creature;
}

/**
 * bible §12 / build-doc §15 C4 — the creature summary card shows a projected retirement year, and
 * an heir born late enough projects PAST the last year the game has (balance.clock.yearsTotal). The
 * number stays honest; this is the flag that lets the card render it as "beyond the league" rather
 * than promising a year 7 that never arrives. See docs/DEVIATIONS-lane-a4.md D-A4-14.
 */
export function retiresBeyondFinalYear(creature: OwnedCreature, balance: Balance): boolean {
  if (isNever(creature.projectedRetirementYear)) return false;
  const finalYear = balance.clock.startYear + balance.clock.yearsTotal - 1;
  return creature.projectedRetirementYear > finalYear;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Events — the year turn's log. G7: identifiers and numbers only, never copy.
 * ──────────────────────────────────────────────────────────────────────────── */

export type Cohort = "party" | "box";

export type YearTurnEvent =
  | { t: "yearStart"; year: number }
  | { t: "ancientSkipped"; uid: string; lineId: string; where: Cohort }
  | {
      t: "aged";
      uid: string;
      where: Cohort;
      fromAge: AgeClass;
      toAge: AgeClass;
      yearsRemaining: number;
      projectedRetirementYear: number;
    }
  | {
      /**
       * build-doc §7.5 step 2 — "metamorphic transitions apply name/type/role/stat-jump", and
       * build-doc §4 makes "the Phaser scene a renderer of its event log". Every age transition
       * that CHANGES the identity gets one of these, so the A→E beat (Vulkindle → Pyrevane, bible
       * §4 "one name per age form") is announced as loudly as the J→A one. The stat jump is a
       * separate `metamorphosed` event because it happens exactly once, at J→A.
       */
      t: "formChanged";
      uid: string;
      lineId: string;
      where: Cohort;
      fromAge: AgeClass;
      toAge: AgeClass;
      fromFormName: string;
      toFormName: string;
      types: TypeName[];
      role: Role;
    }
  | {
      t: "metamorphosed";
      uid: string;
      lineId: string;
      fromFormName: string;
      toFormName: string;
      types: TypeName[];
      role: Role;
      statJump: number;
    }
  | { t: "retirementDue"; uid: string; lineId: string; formName: string; level: number; where: Cohort }
  | { t: "seasonStep"; nodeId: string; season: Season }
  | { t: "raid"; eventId: string; nodeId: string; lineId: string; removed: number; remaining: number }
  | { t: "mapVariant"; nodeId: string; year: number; mapAsset: string }
  | {
      t: "heirBorn";
      parentUid: string;
      heirUid: string;
      lineId: string;
      level: number;
      inheritedTraitIds: string[];
      relicSlot: string | null;
      where: Cohort;
    }
  | { t: "boonGranted"; parentUid: string; targetUid: string; stat: StatKey; boonId: string }
  /**
   * A decision the caller handed in that could not be applied (a BOON with no surviving target, a
   * capped target, a trait the parent never had). The year turn is NOT discarded: the rolled HEIR
   * is applied instead and this says so, because the alternative — throwing out of `advanceYear` —
   * takes the season step, the raid and the map swap down with it.
   */
  | { t: "choiceRejected"; parentUid: string; kind: RetirementChoice["kind"]; reason: string }
  /**
   * Emitted when the turn leaves the player with zero creatures in the party. The overworld and
   * battle scenes cannot be handed a save with an empty party and no warning.
   */
  | { t: "partyEmpty"; year: number };

/** build-doc §7.5 step 6 — the year-variant swap the overworld applies after the turn. */
export interface MapVariantSwap {
  nodeId: string;
  year: number;
  mapAsset: string;
}

/* ────────────────────────────────────────────────────────────────────────────
 * (1)(2)(4) Aging one creature
 * ──────────────────────────────────────────────────────────────────────────── */

export interface AgeResult {
  creature: OwnedCreature;
  /** true when `yearsRemaining` reached 0 — build-doc §7.5 step 3 takes over. */
  retiring: boolean;
  events: YearTurnEvent[];
}

/**
 * One year of aging for ONE non-Ancient creature, build-doc §7.5 steps (1) and (2).
 *
 * Class advancement is derived from balance, not hard-coded: a creature always ENTERS a class at
 * the start of it, so the years it has spent in its current class are
 * `lifespanYears[age] - yearsRemaining`, and it advances once that reaches `yearsInClass[age]`.
 * With the shipped 3/2/1 lifespans and 1/1/1 class lengths that is "advance every year", and it
 * stays correct if either table is retuned.
 */
export function ageOneYear(
  creature: OwnedCreature,
  line: SpeciesLine,
  newYear: number,
  balance: Balance,
  where: Cohort,
): AgeResult {
  // build-doc §7.5 step 4 — Ancients are skipped entirely (G10, Hard Req 4). Callers filter first;
  // this guard makes it impossible to age one by mistake from a new call site.
  if (line.ancient) {
    return {
      creature,
      retiring: false,
      events: [{ t: "ancientSkipped", uid: creature.uid, lineId: creature.lineId, where }],
    };
  }

  const events: YearTurnEvent[] = [];

  // build-doc §7.5 step 1 — "yearsRemaining--".
  const yearsRemaining = Math.max(0, creature.yearsRemaining - 1);

  // build-doc §7.5 step 1 — "age class advances J→A→E on its schedule".
  const fromAge = creature.age;
  const yearsSpentInClass = balance.age.lifespanYears[fromAge] - yearsRemaining;
  const advances = yearsRemaining > 0 && yearsSpentInClass >= balance.age.yearsInClass[fromAge];
  const toAge: AgeClass = advances ? nextAgeClass(fromAge) : fromAge;

  const aged: OwnedCreature = {
    ...creature,
    age: toAge,
    yearsRemaining,
    projectedRetirementYear: newYear + yearsRemaining,
    traits: creature.traits.map((t) => ({ ...t })),
    boons: creature.boons.map((b) => ({ ...b })),
  };

  // build-doc §7.5 step 2 — "metamorphic transitions apply name/type/role/stat-jump".
  // Name, types and role are per-age columns in species.json, so they follow `age` for free; the
  // event carries the new ones so the UI can announce them. The ×1.15 stat jump is a latch set
  // exactly once, at J→A, and never applied again (so A→E does not compound it).
  const jumps = line.metamorphic && fromAge === "J" && toAge === "A" && aged.metamorphosed !== true;
  if (jumps) aged.metamorphosed = true;

  /*
   * The age multiplier grows (J 0.75 → A 1.0 → E 1.15) and the metamorphic latch multiplies on top,
   * so max HP grows at every transition. `curHp` is an absolute number: carried through unchanged it
   * would silently reduce the creature's HP FRACTION every year (a full Juvenile waking up at ~75%
   * as an Adult). Every term of build-doc §7.4's effective stat except the age form is unchanged by
   * aging, and the trait/boon modifiers are proportional to the raw stat, so effective HP scales
   * exactly with the age form — the ratio below preserves the fraction without lifecycle needing to
   * know the creature's max HP. A fainted creature (0) stays fainted. See DEVIATIONS D-A4-15.
   */
  if (creature.curHp !== undefined) {
    const before = ageFormMultiplier(creature, line, balance);
    const after = ageMultiplier(toAge, balance) * (aged.metamorphosed === true ? balance.age.metamorphicJump : 1);
    aged.curHp =
      creature.curHp <= 0 ? creature.curHp : Math.max(1, Math.round((creature.curHp * after) / before));
  }

  events.push({
    t: "aged",
    uid: aged.uid,
    where,
    fromAge,
    toAge,
    yearsRemaining,
    projectedRetirementYear: aged.projectedRetirementYear,
  });

  // The identity beat. bible §4 gives the starters "one name per age form", so Cindril→Vulkindle
  // (J→A) and Vulkindle→Pyrevane (A→E) are BOTH identity changes the renderer has to show; only
  // the first is a metamorphosis. Non-metamorphic lines keep one identity and emit nothing.
  if (fromAge !== toAge) {
    const fromFormName = formNameOf(line, fromAge);
    const toFormName = formNameOf(line, toAge);
    const fromTypes = typesOf(line, fromAge);
    const toTypes = typesOf(line, toAge);
    const typesChanged =
      fromTypes.length !== toTypes.length || toTypes.some((t, i) => fromTypes[i] !== t);
    if (fromFormName !== toFormName || typesChanged || roleOf(line, fromAge) !== roleOf(line, toAge)) {
      events.push({
        t: "formChanged",
        uid: aged.uid,
        lineId: line.id,
        where,
        fromAge,
        toAge,
        fromFormName,
        toFormName,
        types: toTypes.slice(),
        role: roleOf(line, toAge),
      });
    }
  }

  if (jumps) {
    events.push({
      t: "metamorphosed",
      uid: aged.uid,
      lineId: line.id,
      fromFormName: formNameOf(line, fromAge),
      toFormName: formNameOf(line, toAge),
      types: typesOf(line, toAge).slice(),
      role: roleOf(line, toAge),
      statJump: balance.age.metamorphicJump,
    });
  }

  // build-doc §7.5 step 3 — "any creature at 0 → retirement flow".
  const retiring = yearsRemaining <= 0;
  if (retiring) {
    events.push({
      t: "retirementDue",
      uid: aged.uid,
      lineId: line.id,
      formName: formNameOf(line, aged.age),
      level: aged.level,
      where,
    });
  }

  return { creature: aged, retiring, events };
}

/**
 * build-doc §7.5 step 3's prompt plus the cohort the retiree came from.
 *
 * [additive] `where` is not in build-doc §7.1's `RetirementPrompt`, and without it the heir of a
 * BOXED parent gets pushed onto the active party whenever there is room — the box quietly promoting
 * juveniles onto the player's team. See docs/DEVIATIONS-lane-a4.md D-A4-16.
 */
export interface YearRetirementPrompt extends RetirementPrompt {
  where: Cohort;
}

/** build-doc §7.5 step 3 — the choice the UI presents and the harness answers. */
export function retirementPromptFor(
  creature: OwnedCreature,
  line: SpeciesLine,
  where: Cohort = "party",
): YearRetirementPrompt {
  const prompt: YearRetirementPrompt = {
    parentUid: creature.uid,
    lineId: creature.lineId,
    formName: formNameOf(line, creature.age),
    level: creature.level,
    traits: creature.traits.map((t) => ({ ...t })),
    inheritableTraitIds: creature.traits.map((t) => t.id),
    where,
  };
  if (creature.relicSlot !== undefined) prompt.relicSlot = creature.relicSlot;
  return prompt;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The year turn — build-doc §7.5, steps 1–6 in order
 * ──────────────────────────────────────────────────────────────────────────── */

export interface YearTurnDeps {
  species: readonly SpeciesLine[];
  balance: Balance;
  /** Node files, for step 6's year-variant swap. Omitted = no swaps reported. */
  nodes?: readonly NodeFile[];
  /** core/ecosim.ts, injected for step 5. Omitted = the season step is skipped and reported as such. */
  ecosimStep?: EcosimStepFn;
  /** Overrides the scripted year events (tests, harness scenarios). */
  yearEvents?: readonly RaidScript[];
}

export interface YearTurnResult {
  save: SaveFile;
  /** build-doc §7.5 step 3 — one per creature that reached 0 years, party first then box. */
  prompts: YearRetirementPrompt[];
  /** The retirees themselves, already removed from party/box. */
  retired: OwnedCreature[];
  events: YearTurnEvent[];
  /** build-doc §7.5 step 6. */
  mapVariantSwaps: MapVariantSwap[];
  /** false when no `ecosimStep` was injected, so a caller cannot mistake a skipped sim for a no-op sim. */
  seasonStepRan: boolean;
  /**
   * True when `save` comes back with an empty party. On `runYearTurn` this is provisional — the
   * retirement flow can still put heirs back — so the value that matters to a caller is
   * `advanceYear`'s, taken after every prompt has been answered.
   */
  partyEmpty: boolean;
}

/**
 * Where the year turn records the last year it completed.
 *
 * build-doc §4 gives the turn TWO triggers ("At gym victory or tick 16"), so firing it twice for one
 * year is reachable from the game shell, and the second firing would re-apply the scripted Cullbrand
 * raid, re-age everyone and re-retire. `questFlags` is the save's own extensible bag (build-doc
 * §7.8) and is the only field this module may add to without editing core/types.ts. Namespaced so a
 * quest flag cannot collide with it. See docs/DEVIATIONS-lane-a4.md D-A4-17.
 */
export const YEAR_TURN_FLAG = "lifecycle.lastYearTurn";

/** The last year a year turn completed for, or null if none has. */
export function lastYearTurnOf(save: SaveFile): number | null {
  const raw = save.questFlags[YEAR_TURN_FLAG];
  return typeof raw === "number" ? raw : null;
}

/** False when a year turn for this save's next year has already run (C6 checks before firing). */
export function canRunYearTurn(save: SaveFile): boolean {
  const last = lastYearTurnOf(save);
  return last === null || last < save.year + 1;
}

/**
 * Run one year turn. Pure: `save` is not mutated.
 *
 * The turn ENDS year N and BEGINS year N+1 (build-doc §4: "At gym victory or tick 16, the year turn
 * runs"), so the resulting save carries `year = N+1` and the tick meter resets.
 */
export function runYearTurn(save: SaveFile, deps: YearTurnDeps): YearTurnResult {
  const { balance } = deps;
  const index = indexSpecies(deps.species);
  const newYear = save.year + 1;

  if (!canRunYearTurn(save)) {
    throw new LifecycleError(
      `the year turn for year ${newYear} has already run (${YEAR_TURN_FLAG}=${String(
        lastYearTurnOf(save),
      )}) — running it twice would re-apply the year's scripted events`,
    );
  }

  const events: YearTurnEvent[] = [{ t: "yearStart", year: newYear }];
  const prompts: YearRetirementPrompt[] = [];
  const retired: OwnedCreature[] = [];

  /*
   * build-doc §7.5 steps (1), (2) and (4).
   *
   * Party and box are aged by ONE pass over one list of cohorts, deliberately. G10 ("do not skip
   * year-turn aging for boxed creatures") is the rule an implementation quietly skips, so there is
   * no second call site here that could drift from the first: to age the party at all you must run
   * the loop that also ages the box.
   */
  const cohorts: Array<[Cohort, readonly OwnedCreature[]]> = [
    ["party", save.party],
    ["box", save.box],
  ];
  const survivors: Record<Cohort, OwnedCreature[]> = { party: [], box: [] };

  for (const [where, members] of cohorts) {
    for (const member of members) {
      const line = lineOf(index, member.lineId);
      const result = ageOneYear(member, line, newYear, balance, where);
      events.push(...result.events);
      if (result.retiring) {
        retired.push(result.creature);
        prompts.push(retirementPromptFor(result.creature, line, where));
      } else {
        survivors[where].push(result.creature);
      }
    }
  }

  // build-doc §7.5 step 5, first half — "node sims run their 4th season step".
  const seasonOrder = balance.clock.seasonOrder;
  const lastSeason = seasonOrder[seasonOrder.length - 1];
  const nodeStates: Record<string, NodeState> = {};
  let seasonStepRan = false;
  for (const nodeId of Object.keys(save.nodeStates)) {
    const state = save.nodeStates[nodeId];
    if (!state) continue;
    if (deps.ecosimStep && lastSeason !== undefined) {
      nodeStates[nodeId] = deps.ecosimStep(nodeId, cloneNodeState(state), lastSeason);
      events.push({ t: "seasonStep", nodeId, season: lastSeason });
      seasonStepRan = true;
    } else {
      nodeStates[nodeId] = cloneNodeState(state);
    }
  }

  // build-doc §7.5 step 5, second half — "year events fire (Cullbrand raid scripts decrement
  // scripted node populations at named nodes)". G6: the script only removes what it harvests; any
  // collapse above it in the web must emerge from the §7.3 rules on later season steps.
  for (const raid of yearEventsOf(balance, deps.yearEvents)) {
    if (raid.year !== newYear) continue;
    const state = nodeStates[raid.nodeId];
    /*
     * A raid naming a node or a line that is not there used to be skipped in silence, which makes a
     * one-letter typo in the raid script a beat that quietly does not happen ("populations visibly
     * drop at a named node", bible §9). The raid list is authored data with no schema of its own, so
     * this IS its validation, and it fails the same way core/save.ts fails a log that does not
     * belong to its save.
     */
    if (!state) {
      throw new LifecycleError(
        `year event "${raid.id}" names node "${raid.nodeId}", which this save has no state for`,
      );
    }
    for (const target of raid.targets) {
      const pop = state.populations[target.lineId];
      if (!pop) {
        throw new LifecycleError(
          `year event "${raid.id}" harvests "${target.lineId}" at "${raid.nodeId}", ` +
            `which has no such population`,
        );
      }
      // The floor decides how many individuals actually died: computing `removed` before applying
      // it over-reports the harvest and over-credits `recentDeaths`, which is the Scavenger
      // encounter weight (build-doc §7.2) and a ledger number (Hard Req 2).
      const remaining = Math.max(balance.ecosim.populationFloor, pop.count - target.remove);
      const removed = Math.max(0, pop.count - remaining);
      state.populations[target.lineId] = { ...pop, count: remaining };
      state.recentDeaths += removed;
      events.push({
        t: "raid",
        eventId: raid.id,
        nodeId: raid.nodeId,
        lineId: target.lineId,
        removed,
        remaining,
      });
    }
  }

  // build-doc §7.5 step 6 — "map year-variant swap if present".
  const mapVariantSwaps: MapVariantSwap[] = [];
  for (const node of deps.nodes ?? []) {
    const mapAsset = variantForExactYear(node, newYear);
    if (mapAsset === null) continue;
    mapVariantSwaps.push({ nodeId: node.id, year: newYear, mapAsset });
    events.push({ t: "mapVariant", nodeId: node.id, year: newYear, mapAsset });
  }

  const next: SaveFile = {
    ...save,
    year: newYear,
    tick: balance.clock.startTick,
    party: survivors.party,
    box: survivors.box,
    nodeStates,
    questFlags: { ...save.questFlags, [YEAR_TURN_FLAG]: newYear },
  };

  const partyEmpty = next.party.length === 0;
  return { save: next, prompts, retired, events, mapVariantSwaps, seasonStepRan, partyEmpty };
}

/** Deep copy of one node's live sim state. Exported so replay can be as defensive as the year turn. */
export function cloneNodeState(state: NodeState): NodeState {
  const populations: Record<string, NodeState["populations"][string]> = {};
  for (const key of Object.keys(state.populations)) {
    const pop = state.populations[key];
    if (pop) populations[key] = { ...pop };
  }
  return { populations, floraStock: state.floraStock, recentDeaths: state.recentDeaths };
}

/** The variant listed for exactly this year, or null. Year 1 always uses the base map. */
function variantForExactYear(node: NodeFile, year: number): string | null {
  const variants = node.yearVariants as Partial<Record<number, string>>;
  return variants[year] ?? null;
}

/**
 * build-doc §9.5 — "≤ 3 regen attempts per variant, then that year reuses the nearest passing
 * variant (visual continuity beats variant count)". The overworld asks this, not the raw record.
 */
export function mapAssetForYear(node: NodeFile, year: number, balance: Balance): string {
  const firstVariantYear = balance.clock.startYear + 1;
  for (let y = year; y >= firstVariantYear; y -= 1) {
    const asset = variantForExactYear(node, y);
    if (asset !== null) return asset;
  }
  return node.mapAsset;
}

/* ────────────────────────────────────────────────────────────────────────────
 * (3) Retirement — HEIR or BOON
 * ──────────────────────────────────────────────────────────────────────────── */

/** Deterministic, RNG-free: the same parent retiring in the same year always names the same heir. */
export function heirUidFor(parentUid: string, year: number): string {
  return `${parentUid}-heir-y${year}`;
}

/** bible §11 — "Relics — from retirement, craftable at the forge into held items". */
export function relicSlotForHeir(prompt: RetirementPrompt): string {
  return prompt.relicSlot ?? `relic-${prompt.parentUid}`;
}

export function boonIdFor(parentUid: string, stat: StatKey): string {
  return `boon-${parentUid}-${stat}`;
}

/**
 * build-doc §7.5 step 3 — roll the HEIR offer: "inherits 1–2 randomly chosen parent traits".
 *
 * The count and the picks both come from the injected seeded stream (G11: never the platform RNG). The
 * candidate pool is the parent's own trait ids, so an heir can only ever inherit — never gain a
 * trait the parent did not have.
 */
export function rollHeirChoice(
  prompt: RetirementPrompt,
  rng: RandomFn,
  balance: Balance,
  year: number,
): RetirementChoice {
  const pool = prompt.inheritableTraitIds.slice();

  const hardMax = Math.min(balance.retirement.heirInheritedTraitsMax, balance.traits.maxSlots);
  const hi = Math.min(hardMax, pool.length);
  const lo = Math.min(balance.retirement.heirInheritedTraitsMin, hi);
  const count = lo + Math.floor(rng() * (hi - lo + 1));

  // Seeded Fisher–Yates over the parent's own trait ids.
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = pool[i];
    const b = pool[j];
    if (a === undefined || b === undefined) continue;
    pool[i] = b;
    pool[j] = a;
  }

  return {
    kind: "heir",
    parentUid: prompt.parentUid,
    inheritedTraitIds: pool.slice(0, Math.min(count, pool.length)),
    heirUid: heirUidFor(prompt.parentUid, year),
  };
}

export interface RetirementDeps {
  species: readonly SpeciesLine[];
  balance: Balance;
}

export interface RetirementResult {
  save: SaveFile;
  events: YearTurnEvent[];
  /** Present on the HEIR path. */
  heir?: OwnedCreature;
  /** Present on the BOON path. */
  boon?: Boon;
}

/**
 * Why this choice cannot be applied to this save, or null when it can.
 *
 * Separated from `resolveRetirement` so `advanceYear` can ASK before it acts. Asking first is what
 * keeps an unanswerable BOON (the whole party retired together, so there is no teammate left) from
 * throwing out of the middle of a year turn and taking the season step, the Cullbrand raid and the
 * map swap with it — and from leaving the seeded stream advanced past a turn the caller never got a
 * result for (build-doc §8.1: identical (seed, actionLog) ⇒ byte-identical save).
 */
export function retirementChoiceProblem(
  save: SaveFile,
  prompt: RetirementPrompt,
  choice: RetirementChoice,
  balance: Balance,
): string | null {
  if (choice.parentUid !== prompt.parentUid) {
    return `retirement choice is for "${choice.parentUid}" but the prompt is for "${prompt.parentUid}"`;
  }

  if (choice.kind === "heir") {
    const own = new Set(prompt.traits.map((t) => t.id));
    for (const id of choice.inheritedTraitIds) {
      if (!own.has(id)) {
        return `heir cannot inherit trait "${id}" — it is not one of ${prompt.parentUid}'s traits`;
      }
    }
    if (
      save.party.length >= balance.party.maxPartySize &&
      save.box.length >= balance.party.maxBoxSize
    ) {
      return `no room for the heir of "${prompt.parentUid}": party and box are both full`;
    }
    return null;
  }

  const legal = boonTargetUids(save, balance, choice.stat);
  if (!legal.includes(choice.targetUid)) {
    const owned = boonTargetUids(save, balance);
    if (!owned.includes(choice.targetUid)) {
      return owned.length === 0
        ? `boon target "${choice.targetUid}" is not owned — no creature survived this year turn, ` +
            `so BOON has no legal target`
        : `boon target "${choice.targetUid}" is not in the party or the box`;
    }
    return (
      `boon target "${choice.targetUid}" already carries ${String(boonMaxStacksPerStat(balance))} ` +
      `boons on ${choice.stat}`
    );
  }
  return null;
}

/**
 * Apply one retirement choice. Pure; `save` is not mutated.
 *
 * The parent is already out of the party/box (`runYearTurn` removed it), so its data arrives in the
 * `prompt` — which is also exactly what the UI was shown and what the harness answered.
 */
export function resolveRetirement(
  save: SaveFile,
  prompt: RetirementPrompt | YearRetirementPrompt,
  choice: RetirementChoice,
  deps: RetirementDeps,
): RetirementResult {
  const invalid = retirementChoiceProblem(save, prompt, choice, deps.balance);
  if (invalid !== null) throw new LifecycleError(invalid);
  const { balance } = deps;
  const index = indexSpecies(deps.species);

  if (choice.kind === "heir") {
    // build-doc §7.5 step 3 — HEIR: "new J of same line, level = floor(parent×0.5), inherits 1–2
    // randomly chosen parent traits + parent's relic slot unlocked".
    const line = lineOf(index, prompt.lineId);
    const rawLevel = Math.floor(prompt.level * balance.retirement.heirLevelFactor);
    const level = Math.min(balance.xp.levelCap, Math.max(heirLevelMin(balance), rawLevel));

    const byId = new Map(prompt.traits.map((t) => [t.id, t] as const));
    const inherited: Trait[] = [];
    for (const id of choice.inheritedTraitIds) {
      const trait = byId.get(id);
      if (!trait) continue; // unreachable: retirementChoiceProblem rejects it above.
      if (inherited.length >= balance.traits.maxSlots) break;
      inherited.push({ ...trait });
    }

    const heir = newOwnedCreature(
      {
        uid: choice.heirUid,
        lineId: line.id,
        age: "J",
        level,
        caughtYear: save.year,
        traits: inherited,
        relicSlot: relicSlotForHeir(prompt),
      },
      line,
      balance,
    );

    /*
     * The heir takes its parent's place — the cohort the parent retired FROM, falling back to the
     * other one only when that cohort is full. A box retiree's heir joining the active party is the
     * box promoting juveniles onto the player's team without being asked; build-doc §7.5 does not
     * say to do that, so it does not happen.
     */
    const party = save.party.map((c) => c);
    const box = save.box.map((c) => c);
    const parentCohort: Cohort = (prompt as YearRetirementPrompt).where ?? "party";
    const roomInParty = party.length < balance.party.maxPartySize;
    const roomInBox = box.length < balance.party.maxBoxSize;
    let where: Cohort;
    if (parentCohort === "box" ? roomInBox : !roomInParty && roomInBox) {
      where = "box";
      heir.boxed = true;
      box.push(heir);
    } else if (roomInParty) {
      where = "party";
      party.push(heir);
    } else {
      throw new LifecycleError(
        `no room for the heir of "${prompt.parentUid}": party and box are both full`,
      );
    }

    return {
      save: { ...save, party, box },
      heir,
      events: [
        {
          t: "heirBorn",
          parentUid: prompt.parentUid,
          heirUid: heir.uid,
          lineId: heir.lineId,
          level: heir.level,
          inheritedTraitIds: inherited.map((t) => t.id),
          relicSlot: heir.relicSlot ?? null,
          where,
        },
      ],
    };
  }

  // build-doc §7.5 step 3 — BOON: "chosen teammate gains permanent +10% to one stat, named after
  // the retiree".
  const boon: Boon = {
    id: boonIdFor(prompt.parentUid, choice.stat),
    name: `${prompt.formName}'s Legacy`,
    stat: choice.stat,
    sourceUid: prompt.parentUid,
    sourceFormName: prompt.formName,
    grantedYear: save.year,
  };

  // The target was checked by `retirementChoiceProblem` above — it is owned and under the cap.
  const grant = (c: OwnedCreature): OwnedCreature =>
    c.uid === choice.targetUid ? { ...c, boons: [...c.boons, boon] } : c;
  const party = save.party.map(grant);
  const box = save.box.map(grant);

  return {
    save: { ...save, party, box },
    boon,
    events: [
      {
        t: "boonGranted",
        parentUid: prompt.parentUid,
        targetUid: choice.targetUid,
        stat: choice.stat,
        boonId: boon.id,
      },
    ],
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Headless driver — one year turn with its retirement choices answered
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * How a caller answers a retirement prompt. Returning `null` takes the default HEIR roll, which is
 * what keeps the never-cut legacy beat (build-doc §1: "starter retires before the league; its heir
 * fights the finale") true even for a player who never opens the menu.
 */
export type RetirementDecider = (
  prompt: YearRetirementPrompt,
  save: SaveFile,
) => RetirementChoice | null;

export interface AdvanceYearDeps extends YearTurnDeps {
  /** Seeded stream for the heir rolls (build-doc §8.1). */
  rng: RandomFn;
  decide?: RetirementDecider;
}

/** A decision that could not be applied, and the rolled HEIR that was applied instead. */
export interface RejectedChoice {
  parentUid: string;
  offered: RetirementChoice;
  applied: RetirementChoice;
  reason: string;
}

export interface AdvanceYearResult extends YearTurnResult {
  /** The choice actually applied for each prompt, in prompt order — this is what the action log records. */
  choices: RetirementChoice[];
  /** Non-empty when a decision was refused; the turn still completed. */
  rejected: RejectedChoice[];
}

/**
 * Run a year turn AND resolve every retirement it raised. This is the entry point the year-turn
 * scene (C6) and the balance harness (A5) share, so both drive identical state transitions.
 *
 * The heir roll is drawn for every prompt regardless of the decision taken, so the seeded stream
 * advances the same way whatever the player picks — determinism does not depend on player choice.
 */
export function advanceYear(save: SaveFile, deps: AdvanceYearDeps): AdvanceYearResult {
  const turn = runYearTurn(save, deps);
  let current = turn.save;
  const events = [...turn.events];
  const choices: RetirementChoice[] = [];
  const rejected: RejectedChoice[] = [];

  for (const prompt of turn.prompts) {
    const rolled = rollHeirChoice(prompt, deps.rng, deps.balance, current.year);
    const decided = deps.decide ? deps.decide(prompt, current) : null;
    let choice = decided ?? rolled;

    /*
     * Ask before acting. A BOON whose target did not survive the same turn is the COMMON case (a
     * party caught together in year 1 reaches zero years together), and the old behaviour — let
     * `resolveRetirement` throw — discarded the entire year turn including its season step and the
     * scripted raid, after the seeded stream had already advanced. The rolled HEIR is the documented
     * default for an unanswered prompt, so it is also the honest fallback for an unanswerable one,
     * and the rejection is reported rather than swallowed.
     */
    const problem = retirementChoiceProblem(current, prompt, choice, deps.balance);
    if (problem !== null) {
      events.push({ t: "choiceRejected", parentUid: prompt.parentUid, kind: choice.kind, reason: problem });
      rejected.push({ parentUid: prompt.parentUid, offered: choice, applied: rolled, reason: problem });
      choice = rolled;
    }

    const result = resolveRetirement(current, prompt, choice, deps);
    current = result.save;
    events.push(...result.events);
    choices.push(choice);
  }

  const partyEmpty = current.party.length === 0;
  if (partyEmpty) events.push({ t: "partyEmpty", year: current.year });

  return { ...turn, save: current, events, choices, rejected, partyEmpty };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Action-log entries for the year turn (build-doc §7.8 / §8.1)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The replay tape entries one year turn produces, in application order.
 *
 * `seq` continues the save's own log — build-doc §8.1's "identical (seed, actionLog) ⇒
 * byte-identical final save" is a claim about the log too, and a producer that stamps 0 on every
 * entry makes a live save that can never equal its own replay (which numbers from 0 upward). The
 * default reads `result.save.actionLog`, which `runYearTurn` carries through untouched, so a caller
 * that keeps its log in the save gets correct numbering for free; `seqStart` is for a caller that
 * keeps the tape somewhere else. `core/save.ts` `appendYearTurn` does the whole thing.
 */
export function yearTurnActions(
  result: AdvanceYearResult,
  tickBefore: number,
  seqStart?: number,
): ActionLogEntry[] {
  const year = result.save.year;
  const last = result.save.actionLog[result.save.actionLog.length - 1];
  let seq = seqStart ?? (last ? last.seq + 1 : 0);
  const entries: ActionLogEntry[] = [
    { seq, year: year - 1, tick: tickBefore, action: { t: "yearTurn", year } },
  ];
  for (const choice of result.choices) {
    seq += 1;
    entries.push({ seq, year, tick: result.save.tick, action: { t: "retirement", choice } });
  }
  return entries;
}
