/**
 * core/quests.ts — the quest MODEL: what the shipped corpus asks the game for, and how to tell
 * whether it has been done. Build-order C7 / docs/QUEUED-CHANGES.md Q3b.
 *
 * THE PROBLEM THIS FILE EXISTS FOR. `data/dialogue.json` carries ten finished side quests and every
 * one of them gates its completion on a flag the corpus READS and nothing WRITES — ten `*.turnin` /
 * `*.milestone` keys, plus `lifecycle.first-retirement` and `event.festival.open`, plus the two
 * `story.vellsire.*` outcome flags D-INT-4 names. Until something writes them, every one of those
 * quests is copy that can be opened and never closed.
 *
 * ⚠ WRITING THE FLAG WAS ONLY HALF OF IT, and the second half had no tests at all (Q9 / D-Q9-*).
 * A quest also has to be UNCLOSABLE before it is offered, has to stop speaking once it is finished,
 * and — for the two the copy says come round again — has to be able to open a second time. All
 * three are properties of the shapes below, not of the writer:
 *   • `acceptFlag` is what stands between a standing objective and its own turn-in. *Forge a
 *     Legacy* had none, so it closed on the first retirement anywhere in the region, before the
 *     player had ever stood in Cindershelf.
 *   • `completionFlags` is what "finished" means, and it is now boolean `true` only — a
 *     value-carrying write is a RECORD of an outcome, and counting one as a completion is what made
 *     an annually repeating quest impossible to build.
 *   • the file's own ORDER, not the alphabet, decides which flag fills a role, so a corpus that
 *     grows a second candidate cannot silently move the turn-in the game writes.
 *
 * TWO RULES SHAPE EVERYTHING BELOW.
 *
 *   1. **The bill is DERIVED from the corpus, never listed.** `externallyGrantedFlags` (see
 *      core/dialogue-schema.ts) computes "read and never written" from the shipped file.
 *      `docs/STORY-REVIEW.md` §3 enumerates twelve of them by hand and the hand list is already two
 *      short of the file; a writer built against a hand list stops covering the corpus the moment
 *      the corpus moves. Every quest fact this module publishes — which flag a quest owes, which
 *      flag accepts it, which entry offers it — is read out of `data/dialogue.json`.
 *
 *   2. **This module holds no OBJECTIVE.** "Three sign cards", "four Boglings", "an Elder Mirefin"
 *      are CONTENT — quantities and species stated in the authored copy — and content does not live
 *      in `core/` (G2/G3, and the species-name gate in tests/property/foodweb.test.ts enforces the
 *      species half of that directly). What lives here is the VOCABULARY an objective is written in
 *      and the pure evaluator for it; the table itself is `game/quests.ts`, which cites the authored
 *      line behind every row. That split is also why there is not a single numeric literal below.
 *
 * Pure TypeScript, zero engine imports (L11), and it reaches nothing outside `core/` and `data/`.
 */

import type { DialogueEntry, DialogueFile, FlagValue } from "./dialogue-schema";
import { flagsWritten } from "./dialogue-schema";
import type { ActionLogEntry, AgeClass, OwnedCreature, Season } from "./types";

/* ────────────────────────────────────────────────────────────────────────────
 * The corpus's own account of a quest
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A flag belongs to quest `id` when its key contains `.<id>.`.
 *
 * Deliberately not `"quest." + id`: the namespace is then a grammar this file has to know, and the
 * one flag that does not follow it (`quest.first-signs.offered` is written by an entry with no
 * `quest` field at all — the survey tutorial) is exactly the kind of thing a hard-coded namespace
 * gets wrong. Containment is enough because no quest id in the corpus collides with the `chain.` /
 * `story.` / `trail.` / `rival.` / `tutorial.` namespaces.
 */
export function flagBelongsToQuest(flag: string, questId: string): boolean {
  return flag.includes(`.${questId}.`);
}

/** Every quest id the corpus declares, in file order. */
export function questIds(file: DialogueFile): string[] {
  const out: string[] = [];
  for (const e of file.entries) {
    if (e.quest !== undefined && !out.includes(e.quest)) out.push(e.quest);
  }
  return out;
}

/** Every entry belonging to a quest, in file order. */
export function questEntries(file: DialogueFile, questId: string): DialogueEntry[] {
  return file.entries.filter((e) => e.quest === questId);
}

export interface QuestDefinition {
  id: string;
  /** The speaker who offers and closes it — the corpus's first entry for the quest. */
  giver: string;
  /** The node that speaker stands in for this quest. */
  node: string;
  /**
   * The flag the corpus reads and nothing writes: what the GAME owes this quest. Exactly one for
   * every shipped quest; `null` would mean a quest that closes itself, and none does.
   */
  owedFlag: string | null;
  /**
   * The flag that means "the player has taken this on" — a quest-scoped flag the corpus WRITES and
   * another of its own entries reads with `flagsSet`.
   *
   * `null` is a real answer, not a gap: *Forge a Legacy* opens off `lifecycle.first-retirement` and
   * *The Star Census* is a standing offer, so neither has an acceptance to record.
   */
  acceptFlag: string | null;
  /** Quest-scoped flags written by the entries that the owed flag unlocks — "this is finished". */
  completionFlags: string[];
}

/**
 * Read a quest out of the corpus.
 *
 * `owedFlag` is the intersection of "this quest's namespace" with "read and never written", which
 * is the definition of the hole this module fills.
 */
export function questDefinition(file: DialogueFile, questId: string): QuestDefinition | null {
  const entries = questEntries(file, questId);
  const first = entries[0];
  if (!first) return null;

  const written = flagsWritten(file);
  const owed = new Set<string>();
  const acceptable = new Set<string>();
  for (const e of file.entries) {
    for (const k of e.when?.flagsSet ?? []) {
      if (!flagBelongsToQuest(k, questId)) continue;
      if (written.has(k)) {
        // Written somewhere and required by an entry of this quest: an acceptance, not a bill.
        if (e.quest === questId) acceptable.add(k);
      } else {
        owed.add(k);
      }
    }
    for (const fe of e.when?.flagEquals ?? []) {
      if (flagBelongsToQuest(fe.key, questId) && !written.has(fe.key)) owed.add(fe.key);
    }
  }

  /*
   * ⚠ THE CORPUS'S OWN ORDER DECIDES, NOT THE ALPHABET. Both sets above are filled by a walk over
   * `file.entries` in file order, so `[...set][0]` is the flag the EARLIEST entry names — and both
   * were `[...set].sort()[0]` until a second candidate made that a trap rather than a tie-break.
   *
   * A quest may legitimately grow a second unwritten namespace flag: an ending gated on something
   * the game computes (`quest.star-census.complete`), a lapse the game records
   * (`quest.ferrymans-wager.lapsed`). Under the alphabet, "complete" < "milestone" and
   * "lapsed" < "taken", so adding either entry would silently move `owedFlag` / `acceptFlag` onto
   * the NEW key — and `syncQuestFlags` writes exactly one owed flag, so the quest's real turn-in
   * would stop being written at all, with every test still green. File order cannot do that: the
   * offer and its turn-in are authored before any later variant.
   *
   * Today every set below is a singleton, so this changes no answer; it stops a later corpus edit
   * from changing one.
   */
  const owedFlag = [...owed][0] ?? null;
  const completion = new Set<string>();
  if (owedFlag !== null) {
    for (const e of entries) {
      if (!(e.when?.flagsSet ?? []).includes(owedFlag)) continue;
      for (const [k, v] of Object.entries(e.setFlags ?? {})) {
        if (!flagBelongsToQuest(k, questId)) continue;
        /*
         * A COMPLETION IS A PREDICATE, NOT A RECORD, and the distinction is load-bearing.
         *
         * `tolm.quest.fallow.done.kept` writes two flags in the quest's namespace:
         * `quest.fallow-field.done: true` — "this is finished" — and
         * `quest.fallow-field.result: "kept"` — WHICH ending fired. Counting the second as a
         * completion makes `questStage` return "done" for as long as the record exists, and the
         * record is deliberately the one thing *The Fallow Field*'s annual re-arm keeps when it
         * clears the rest (game/quests.ts). A re-armed quest whose stage is permanently "done" is
         * skipped by `syncQuestFlags`, so its turn-in is never written again: the repeat the two
         * authored endings promise cannot be built while a value-carrying write counts here.
         *
         * `true` is therefore the whole test. A string or a number is an outcome the story
         * remembers; only a boolean `true` asserts the quest is over.
         */
        if (v !== true) continue;
        completion.add(k);
      }
    }
  }

  return {
    id: questId,
    giver: first.speaker,
    node: first.node,
    owedFlag,
    acceptFlag: [...acceptable][0] ?? null,
    completionFlags: [...completion].sort(),
  };
}

/** Every quest the corpus declares, resolved. */
export function questDefinitions(file: DialogueFile): QuestDefinition[] {
  const out: QuestDefinition[] = [];
  for (const id of questIds(file)) {
    const def = questDefinition(file, id);
    if (def) out.push(def);
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Stage
 * ──────────────────────────────────────────────────────────────────────────── */

export type QuestStage = "unoffered" | "open" | "accepted" | "turnedIn" | "done";

/** True when a flag is set in the sense `conditionHolds` means it: present and not `false`. */
export function flagIsSet(flags: Readonly<Record<string, FlagValue>>, key: string): boolean {
  const v = flags[key];
  return v !== undefined && v !== false;
}

/**
 * Where a quest stands, read off the save's flags alone.
 *
 * `open` is a quest whose offer the player has seen (or that needs no acceptance) but has not
 * accepted; `unoffered` is one whose acceptance flag exists and is unset AND whose offer the corpus
 * has not yet published. The two are collapsed deliberately for a quest with no acceptance: a
 * standing offer is always open.
 */
export function questStage(def: QuestDefinition, flags: Readonly<Record<string, FlagValue>>): QuestStage {
  if (def.completionFlags.some((f) => flagIsSet(flags, f))) return "done";
  if (def.owedFlag !== null && flagIsSet(flags, def.owedFlag)) return "turnedIn";
  if (def.acceptFlag === null) return "open";
  return flagIsSet(flags, def.acceptFlag) ? "accepted" : "unoffered";
}

/* ────────────────────────────────────────────────────────────────────────────
 * Objectives — the VOCABULARY. The table is game/quests.ts's (see the header).
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * What a quest asks the player to have done. Every variant is answerable from the SAVE alone —
 * the action tape, the party, the flags and the two clocks — because a quest whose completion is
 * not a fact about the save is a quest that cannot be replayed (L10) or tested.
 */
export type QuestObjective =
  /** Come back and say so. The authored `done` entry's own `when` decides what it then says. */
  | { kind: "report" }
  /** Distinct species lines the player has met at a node — the sign cards a forage yields. */
  | { kind: "distinctLinesMetAt"; node: string; count: number }
  /** Individuals put back into a node since the quest was accepted (the release verb). */
  | { kind: "releasesAt"; node: string; count: number }
  /** The player is holding a creature of this age class, in party or box. */
  | { kind: "holdsAge"; age: AgeClass }
  /** Individuals of this age taken at a node since the quest was accepted. */
  | { kind: "catchesAt"; node: string; age: AgeClass; count: number }
  /**
   * `catchesAt` with the year the quest was accepted in as a DEADLINE — the shape a line like
   * "caught and brought back before the year turns" states.
   *
   * Two halves, and the bug it was built for needed both. The catch half is a fact about the tape,
   * so a creature that merely aged into the wanted class on the bench does not answer it; the year
   * half closes the window, so the same tape stops answering it once the calendar has moved. The
   * kind's NAME carries the deadline on purpose: `tests/gates/quest-layer.test.ts` recognises a
   * time-bounded objective by `/BeforeYearTurn|Deadline|Expires/`, so a future sibling declares
   * itself without that gate having to be edited.
   */
  | { kind: "catchesAtBeforeYearTurn"; node: string; age: AgeClass; count: number }
  /** Travelled back into a node, in a given season, since the quest was accepted. */
  | { kind: "returnedTo"; node: string; season: Season }
  /** Has stood in a node at some point since the quest was accepted. */
  | { kind: "visitedSince"; node: string }
  /** A flag written elsewhere in the game (a lifecycle milestone, another quest's reward). */
  | { kind: "flagSet"; flag: string }
  /** Every flag the CORPUS writes under this prefix is set — e.g. the six antler stones. */
  | { kind: "everyCorpusFlagWithPrefix"; prefix: string }
  /** A year has turned since the quest was accepted ("I'll walk it myself at the turn of the year"). */
  | { kind: "yearTurnedSinceAccepted" }
  /** The dex has grown since the last milestone was paid — a repeatable, terminal-less objective. */
  | { kind: "dexIdentitiesRisen" };

/** Every fact an objective may be evaluated against. Supplied by the game layer; never read here. */
export interface QuestWorld {
  year: number;
  season: Season;
  flags: Readonly<Record<string, FlagValue>>;
  /** The whole tape. */
  actions: readonly ActionLogEntry[];
  /** The tape from the moment the quest was accepted — the same array when it never was. */
  actionsSinceAccepted: readonly ActionLogEntry[];
  party: readonly OwnedCreature[];
  box: readonly OwnedCreature[];
  /** node id -> the species lines the player has met there. The tracker records these. */
  linesMetAt: Readonly<Record<string, readonly string[]>>;
  /** Distinct dex identities recorded so far. */
  dexIdentities: number;
  /** Identities recorded when the last milestone was paid, or null if none has been. */
  dexIdentitiesAtLastMilestone: number | null;
  /** The calendar year the quest was accepted in, or null when the acceptance was never stamped. */
  acceptedYear: number | null;
  /** Every flag the CORPUS writes — for `everyCorpusFlagWithPrefix`. */
  corpusWrittenFlags: ReadonlySet<string>;
}

function ageOfLoggedCatch(world: QuestWorld, uid: string): AgeClass | null {
  for (const creature of [...world.party, ...world.box]) {
    if (creature.uid === uid) return creature.age;
  }
  return null;
}

/**
 * Individuals of `age` taken at `node` since the quest was accepted.
 *
 * The tape records a catch as `{nodeId, lineId, uid}` and carries no age (`core/types.ts`
 * `GameAction`), so the age is read off the individual the uid names — which also means a creature
 * released or retired since is no longer counted. That is the right reading for both callers: the
 * copy they transcribe says *brought back*, and something the player no longer has was not.
 */
function countCatches(world: QuestWorld, node: string, age: AgeClass): number {
  let seen = 0;
  for (const entry of world.actionsSinceAccepted) {
    const a = entry.action;
    if (a.t !== "catch" || a.nodeId !== node) continue;
    if (ageOfLoggedCatch(world, a.uid) !== age) continue;
    seen += 1;
  }
  return seen;
}

/**
 * Does the objective hold?
 *
 * Pure, total, and free of every number: each variant's quantity arrives on the objective itself,
 * which is what lets `game/quests.ts` cite the authored line each quantity was transcribed from.
 */
export function objectiveHolds(objective: QuestObjective, world: QuestWorld): boolean {
  switch (objective.kind) {
    case "report":
      return true;

    case "distinctLinesMetAt": {
      const met = world.linesMetAt[objective.node] ?? [];
      return new Set(met).size >= objective.count;
    }

    case "releasesAt": {
      let seen = 0;
      for (const entry of world.actionsSinceAccepted) {
        const a = entry.action;
        if (a.t === "release" && a.nodeId === objective.node) seen += 1;
      }
      return seen >= objective.count;
    }

    case "holdsAge":
      return [...world.party, ...world.box].some((c) => c.age === objective.age);

    case "catchesAt":
      return countCatches(world, objective.node, objective.age) >= objective.count;

    case "catchesAtBeforeYearTurn": {
      // The deadline. `acceptedYear` is stamped when the quest is taken, so "the year has not
      // turned since" is exactly "the calendar year is still the one it was taken in". A quest
      // that was never stamped has no window and cannot be inside one.
      if (world.acceptedYear === null || world.year !== world.acceptedYear) return false;
      return countCatches(world, objective.node, objective.age) >= objective.count;
    }

    case "returnedTo":
      if (world.season !== objective.season) return false;
      return world.actionsSinceAccepted.some((e) => e.action.t === "travel" && e.action.to === objective.node);

    case "visitedSince":
      return world.actionsSinceAccepted.some((e) => e.action.t === "travel" && e.action.to === objective.node);

    case "flagSet":
      return flagIsSet(world.flags, objective.flag);

    case "everyCorpusFlagWithPrefix": {
      const wanted = [...world.corpusWrittenFlags].filter((f) => f.startsWith(objective.prefix));
      if (wanted.length === 0) return false;
      return wanted.every((f) => flagIsSet(world.flags, f));
    }

    case "yearTurnedSinceAccepted":
      return world.acceptedYear !== null && world.year > world.acceptedYear;

    case "dexIdentitiesRisen": {
      const last = world.dexIdentitiesAtLastMilestone;
      if (world.dexIdentities === 0) return false;
      return last === null || world.dexIdentities > last;
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Milestones the LIFECYCLE owes, not a quest giver
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * True once the run has retired a creature — the fact `lifecycle.first-retirement` names.
 *
 * Read off the action tape rather than latched at the moment it happens, so a reloaded save and a
 * replayed one answer identically (L10). `core/lifecycle.ts` owns the retirement itself; this only
 * reads that it occurred.
 */
export function hasRetired(actions: readonly ActionLogEntry[]): boolean {
  return actions.some((e) => e.action.t === "retirement");
}
