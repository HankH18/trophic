/**
 * game/quests.ts — the WRITERS for the flags `data/dialogue.json` reads and nothing sets.
 *
 * THE HOLE THIS CLOSES. Ten side quests ship with finished copy and every one of them closes on a
 * flag no system writes; `core/dialogue-schema.ts` `externallyGrantedFlags` derives that bill from
 * the corpus (fourteen keys as shipped). Until this module existed, every one of those quests could
 * be opened and never closed, `chain.*.complete` was unreachable, and *Forge a Legacy* waited on a
 * `lifecycle.first-retirement` that the retirement flow never published.
 *
 * ⚠ AND THEN NOTHING TESTED IT. 2095 tests were green across 42 files and not one assertion
 * anywhere exercised this module or `core/quests.ts`, which is how four defects shipped invisibly:
 * a wager closed by the player's own starter ageing on the bench, a legacy quest that turned itself
 * in before the player met its giver, a census that paid exactly one milestone for a whole run, and
 * an annual arrangement whose own flags forbade the year after. They are repaired here and in
 * `core/quests.ts`; `tests/gates/quest-layer.test.ts` pins the shapes and
 * `tests/unit/quests.test.ts` drives every one of them down the path a player takes. Every
 * departure the repairs required is logged as **D-Q9-*** in `docs/DEVIATIONS.md`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THE OBJECTIVE TABLE IS IN `game/` AND NOT IN `data/balance.json` — READ THIS BEFORE MOVING IT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Every quantity in {@link QUEST_OBJECTIVES} is CONTENT transcribed from a shipped line, quoted
 * beside it. Its proper home is `data/balance.json`, and it is not there for one measured reason:
 * `tests/gates/guardrails.test.ts` "balance_keys_survive_validation" requires every leaf of
 * balance.json to be declared in BOTH `core/types.ts` `Balance` and `core/schemas.ts` `zBalance`
 * (`z.object` strips what it does not declare, so an undeclared knob is a decoy). Those two files
 * belong to another stream in this wave, so adding the block would have shipped a red gate. The
 * three-file change that gives this table its real home is logged as **D-Q7-2** in
 * `docs/DEVIATIONS.md`.
 *
 * Two things the table therefore may NOT do, and does not:
 *   • **name a species.** `tests/property/foodweb.test.ts` "no shipping source names a species"
 *     forbids a species id or form name as a string literal anywhere in `core/`, `game/` or
 *     `tools/` — so "four Boglings" is transcribed as "four individuals put back into Brackmarsh",
 *     and every such narrowing is named in the row's `deviation` field rather than lost. G2.
 *   • **name a role.** Same gate, `no_shadow_tables`.
 *
 * `core/quests.ts` holds the vocabulary and the pure evaluator and has no numbers at all; this file
 * holds the numbers and the wiring. That is the whole split.
 */

import {
  DIALOGUE,
  externallyGrantedFlags,
  flagsWritten,
  type DialogueFile,
  type FlagValue,
} from "@core/dialogue-schema";
import { seasonOf } from "@core/clock";
import { applyRelease, toNodeState } from "@core/ecosim";
import {
  flagIsSet,
  hasRetired,
  objectiveHolds,
  questDefinitions,
  questStage,
  type QuestDefinition,
  type QuestObjective,
  type QuestStage,
  type QuestWorld,
} from "@core/quests";
import { appendAction, type SaveEnvelope } from "@core/save";
import type { AgeClass, Content, OwnedCreature } from "@core/types";
import { liveNodeOf, nodeFileOf } from "./wild-battle";

/* ────────────────────────────────────────────────────────────────────────────
 * Bookkeeping flags this module writes, and nothing reads but this module
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The three suffixes the tracker stamps onto a quest's own namespace.
 *
 * They are flag-name GRAMMAR, not content — the same kind of thing `balance.acts.badgeFlagPrefix`
 * and the overworld's `signChain:` prefix are. Nothing in `data/dialogue.json` reads them; they
 * exist so that "when did this quest start" survives a reload and a replay (L10) instead of living
 * in a scene field that a `scene.start` throws away.
 */
const ACCEPTED_AT_SUFFIX = ".acceptedAt";
const ACCEPTED_YEAR_SUFFIX = ".acceptedYear";
const MET_LINES_SUFFIX = ".linesMet";
const MILESTONE_AT_SUFFIX = ".milestoneAt";
const SETTLED_YEAR_SUFFIX = ".settledYear";

/**
 * The one flag this module writes that a quest giver does read, and it is a RECORD rather than
 * bookkeeping: `quest.<id>.lapsed` says a deadline ran out.
 *
 * It is written only for an objective whose own kind carries the deadline (see
 * {@link objectiveLapsesAtYearTurn}), so a quest cannot acquire a failure state by accident.
 */
const LAPSED_SUFFIX = ".lapsed";

/** Where the tracker records which species lines the player has met at a node. */
export function linesMetFlag(nodeId: string): string {
  return `sign.${nodeId}${MET_LINES_SUFFIX}`;
}

function acceptedAtFlag(questId: string): string {
  return `quest.${questId}${ACCEPTED_AT_SUFFIX}`;
}

function acceptedYearFlag(questId: string): string {
  return `quest.${questId}${ACCEPTED_YEAR_SUFFIX}`;
}

function milestoneAtFlag(questId: string): string {
  return `quest.${questId}${MILESTONE_AT_SUFFIX}`;
}

function settledYearFlag(questId: string): string {
  return `quest.${questId}${SETTLED_YEAR_SUFFIX}`;
}

/** The record a quest leaves when its deadline ran out — read by the giver, written only here. */
export function lapsedFlag(questId: string): string {
  return `quest.${questId}${LAPSED_SUFFIX}`;
}

/** The corpus's namespace for facts the creature LIFECYCLE owns rather than a quest giver. */
const LIFECYCLE_NAMESPACE = "lifecycle.";

/**
 * `lifecycle.first-retirement`, resolved out of the corpus rather than typed.
 *
 * It is the flag the corpus reads, never writes, and that lives in the lifecycle namespace — so a
 * rename in `data/dialogue.json` moves the writer with it instead of leaving a silent hole of
 * exactly the kind this whole module exists to close. The fallback spelling is only reached if the
 * corpus stops reading it at all, in which case nothing depends on the answer.
 */
function retirementMilestoneFlag(file: DialogueFile): string {
  const written = flagsWritten(file);
  for (const entry of file.entries) {
    for (const key of entry.when?.flagsSet ?? []) {
      if (written.has(key)) continue;
      if (key.startsWith(LIFECYCLE_NAMESPACE)) return key;
    }
  }
  return `${LIFECYCLE_NAMESPACE}first-retirement`;
}

/** The one spelling, resolved once at load. */
export const RETIREMENT_MILESTONE_FLAG: string = retirementMilestoneFlag(DIALOGUE);

/* ────────────────────────────────────────────────────────────────────────────
 * The objective table — CONTENT, transcribed, with the line each row came from
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * bible §9 / `data/dialogue.json`, one row per quest — the OBJECTIVE each giver is waiting on.
 *
 * ⚠ EVERY CITATION BELOW IS A COMMENT, NEVER A STRING. `tests/property/foodweb.test.ts`
 * "no shipping source names a species" forbids a species id or form name as a STRING LITERAL
 * anywhere in `core/`, `game/` or `tools/` — and the authored lines these rows transcribe are full
 * of them. Quoting them in a `source:` field turned that gate red on the first run, which is the
 * gate working: content in code is exactly what it exists to stop. The quotes live where a reader
 * needs them and the compiler cannot ship them.
 *
 * The four vertical-slice quests build-doc §15 C7 names first — First Signs, The Fallow Field,
 * Restock the Shallows, Ferryman's Wager — are never cut, and they are the four mechanised most
 * literally.
 */
export const QUEST_OBJECTIVES: Readonly<Record<string, QuestObjective>> = {
  /* ── the four never-cut slice quests ─────────────────────────────────────
   *
   * FIRST SIGNS — maren.quest.first-signs.offer:
   *   "Walk Meadow Reach and bring me three. Any three."
   * DEVIATION: a sign card is not an item in the shipped schema — `data/nodes/*` carries no
   * inventory and `save.items` carries snares, baits and medicines. The card is therefore the
   * FORAGE ITSELF: three DISTINCT lines met on Meadow Reach (r1). Maren's own done line names
   * three of them, and "any three" is what the offer asks for.
   */
  "first-signs": { kind: "distinctLinesMetAt", node: "r1", count: 3 },

  /* THE FALLOW FIELD — tolm.quest.fallow.accepted:
   *   "Count's twenty-four; I'll walk it myself at the turn of the year and we'll compare books."
   * NO DEVIATION, and the twenty-four is deliberately NOT transcribed: the corpus already carries
   * it, as the `population` clause on tolm.quest.fallow.done.kept, and `conditionHolds` resolves
   * it. The turn-in flag means only "harvest has come"; which of the two authored endings then
   * fires is the live count's answer, exactly as authored. This module never reads that count.
   */
  "fallow-field": { kind: "yearTurnedSinceAccepted" },

  /* RESTOCK THE SHALLOWS — nessa.quest.restock.offer / .accepted:
   *   "I want four ... put back into that water" / "Put them in on the Brackmarsh side."
   * DEVIATION: the SPECIES is not checked (see the header). Four individuals released into
   * Brackmarsh (r2) close it, whichever line they are. Nessa's done line reads "the Brackmarsh
   * count on my board goes up by four", which is true of any four.
   */
  "restock-the-shallows": { kind: "releasesAt", node: "r2", count: 4 },

  /* FERRYMAN'S WAGER — sel.quest.wager.offer:
   *   "An Elder ..., caught and brought back before the year turns."
   * DEVIATION: the SPECIES is not checked (see the header); any Elder taken out of the marsh
   * closes it. Everything else in that sentence is now checked, and none of it was: the row shipped
   * as `{kind:"holdsAge", age:"E"}`, which is a fact about the party and not about the player. A
   * Juvenile starter becomes an Elder in its third year (`balance.age.lifespanYears.J`), so the
   * player's own first creature closed bible §9's push-your-luck showcase by ageing on the bench,
   * from anywhere in the region, with an empty action tape — and the deadline the copy states three
   * times (the offer, `sel.quest.wager.done`, `sel.tale.3`) existed nowhere in the code.
   *   • CAUGHT — the objective reads the action tape.
   *   • BROUGHT BACK — the age is read off the individual, so one released or retired since does
   *     not count (`core/quests.ts` `countCatches`).
   *   • BEFORE THE YEAR TURNS — the window closes at the year turn, and a lapse re-opens the offer
   *     (see {@link syncQuestFlags}). `chain.undermere.step4` gates on this quest's `.done`, so a
   *     lapse that could not be retried would dead-end the Undermere chain and its Ancient.
   * The marsh is Brackmarsh (r2), which is where the channel Sel names is.
   */
  "ferrymans-wager": { kind: "catchesAtBeforeYearTurn", node: "r2", age: "E", count: 1 },

  /* ── the six above cut line C-3 ──────────────────────────────────────────
   *
   * SILK SHORTAGE — halder.quest.silk.offer:
   *   "Three ..., my price, or walk away and tell her I asked."
   * DEVIATION: species unchecked (see the header); the AGE is checked, because both sides of the
   * authored dilemma are about adults — "three adults out of the canopy is more than the canopy
   * replaces in a year". Taken on Bowerdeep Wilds (r3), which is where the canopy is.
   */
  "silk-shortage": { kind: "catchesAt", node: "r3", age: "A", count: 3 },

  /* LANTERNLESS NIGHT — pell.quest.lanternless.offer:
   *   "I need a walk to the eastern stair and back with the relight kit." / "One night. Autumn only"
   * DEVIATION: "the eastern stair" is not a place the node graph carries, so the walk is
   * transcribed as its shape — leave Bowerdeep and come back, in autumn. The season is the
   * authored gate and is checked exactly.
   */
  "lanternless-night": { kind: "returnedTo", node: "bowerdeep", season: "autumn" },

  /* AFTER THE CRASH — gerta.quest.crash.offer:
   *   "Five counts on Cinder Steppe. ... Bring me all five and the flora reading with them."
   * DEVIATION: the counts and the flora reading come off the SURVEY, which reads the live save from
   * anywhere — so the only part of this that is a fact about the PLAYER is having stood on Cinder
   * Steppe (r4). A record of which nodes were actually walked would tighten it; the survey keeps none.
   */
  "after-the-crash": { kind: "visitedSince", node: "r4" },

  /* FORGE A LEGACY — bram.quest.forge.offer:
   *   "One of yours has run out of years, then." / "Bring it here and I'll set it."
   * DEVIATION: the relic and the ingot are not items the shipped economy carries, so no cost is
   * taken. The retirement is real: `lifecycle.first-retirement` is derived from the action tape by
   * `syncQuestFlags` below, and it is itself one of the flags nothing wrote.
   *
   * ⚠ WAS `{kind: "flagSet", flag: RETIREMENT_MILESTONE_FLAG}` AND THAT MADE THE QUEST HOLLOW.
   * `bram.quest.forge.offer` REQUIRES `lifecycle.first-retirement` in its own `when.flagsSet`, so
   * an objective naming that same flag is true at the instant the offer becomes eligible. The
   * offer writes its own acceptance (D-Q9-7), so the very next `syncQuestFlags` — the one
   * `OverworldScene.interact` runs before the next [E] — found the quest `accepted` with its
   * objective already satisfied and wrote the turn-in. Measured: two consecutive [E] presses at
   * Cindershelf, no travel, no catch, no release, and the Legacy beat's side quest closed itself.
   *
   * The objective is now the verb the offer's own copy names — "Bring it here and I'll set it" —
   * transcribed as arriving at Bram's town after taking the job. D-Q9-7 refused the plan's
   * `{visitedSince, node: "r4"}` because the shipped copy says HERE and not Cinder Steppe; this is
   * that same objection honoured, with `here` resolved to the node the offer is spoken in. No
   * prose moves, so the pair D-Q9-7 said must land together is not split. DEVIATIONS D-W3-2.
   */
  "forge-a-legacy": { kind: "visitedSince", node: "cindershelf" },

  /* THE STAR CENSUS — ives.quest.census.milestone:
   *   "Another milestone. Here's the plate, still tacky" / "Thirty-five identities in the full
   *   census."
   * DEVIATION: the only quest of the ten with no terminal state, and its flag is repeatable — so a
   * milestone is paid whenever the census has GROWN since the last plate, rather than at a step
   * size nothing in the copy states. Inventing a step would be inventing content (G2).
   */
  "star-census": { kind: "dexIdentitiesRisen" },

  /* VELLSIRE'S TRAIL — orrin.quest.trail.offer / .done:
   *   "Walk the trail in order and bring me what the stones say." / "All six."
   * NO DEVIATION, and nothing is transcribed: the six stones ARE the six `trail.stone.*` flags the
   * corpus's own antler-stone prop entries write, so the objective reads the corpus rather than a
   * copy of it. Six is never typed anywhere.
   */
  "vellsires-trail": { kind: "everyCorpusFlagWithPrefix", prefix: "trail.stone." },
};

/* ────────────────────────────────────────────────────────────────────────────
 * Which quests come round again — CONTENT, transcribed, with the line each came from
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Quests whose arrangement is ANNUAL: both authored endings promise it comes back, and until this
 * existed the flags forbade it.
 *
 * THE FALLOW FIELD — `tolm.quest.fallow.done.kept`: "Same arrangement next year, if you're still
 * walking." `tolm.quest.fallow.done.short`: "Offer's the same next spring. Numbers are the
 * numbers." And `tolm.quest.fallow.offer` gates on `flagsUnset:["quest.fallow-field.done",
 * "quest.fallow-field.taken"]`, both of which the turn-in sets permanently — so the one quest whose
 * whole subject is an arrangement that "comes back every year I'm farming" could be entered once.
 *
 * A quest id is an IDENTIFIER, not content — the same kind of key {@link QUEST_OBJECTIVES} is
 * indexed by — so no species, role or quantity is named here. The re-arm itself is generic and
 * lives in {@link syncQuestFlags}; *The Star Census* uses the same mechanism on a different clock.
 */
export const ANNUAL_QUESTS: ReadonlySet<string> = new Set(["fallow-field"]);

/**
 * Does this objective's own kind say the window shuts at the year turn?
 *
 * Read off the kind's NAME, exactly as `tests/gates/quest-layer.test.ts` reads it, so a second
 * deadline-shaped objective added later lapses without this predicate being edited — and so that
 * nothing here has to carry a list of which quests may fail.
 */
function objectiveLapsesAtYearTurn(objective: QuestObjective): boolean {
  return /BeforeYearTurn/.test(objective.kind);
}

/** A quest whose owed flag re-arms as soon as its cycle is collected, rather than at a date. */
function objectiveRepeatsPerCycle(objective: QuestObjective): boolean {
  return objective.kind === "dexIdentitiesRisen";
}

/* ────────────────────────────────────────────────────────────────────────────
 * Reading the world a quest is judged against
 * ──────────────────────────────────────────────────────────────────────────── */

/** Where the tracker accumulates the dex. Grammar, like `sign.<node>.linesMet` beside it. */
const DEX_ENTERED_FLAG = "dex.entered";

/** One creature's dex identity — the line and its age FORM, which is what bible §9 counts. */
function dexIdentityOf(creature: OwnedCreature, content: Content): string {
  const line = content.species.find((s) => s.id === creature.lineId);
  const form = line?.formNames[creature.age];
  return form === undefined ? `${creature.lineId}:${creature.age}` : `${creature.lineId}:${form}`;
}

/**
 * Every dex identity the player has ENTERED — the record, not the shelf.
 *
 * ⚠ THIS USED TO COUNT WHAT THE PLAYER WAS HOLDING, and that made the census shrink when the player
 * did the thing the game teaches. Ives's own copy says *"Every identity you've **entered**"*, and
 * `[...save.party, ...save.box]` is what they still have: releasing decremented it, a retirement
 * that replaced a retiree with a differently-aged heir decremented it, and *Restock the Shallows*
 * asks for four releases. The two verbs the game is built to teach were the two that destroyed
 * census progress, and `dexIdentitiesRisen` — a strictly-increasing objective — was measured
 * against a number that could fall.
 *
 * It is now MONOTONIC by construction: the union of everything already recorded with everything
 * currently held. {@link syncQuestFlags} writes the union back, so the record survives the release.
 *
 * WHY AN ACCUMULATOR AND NOT THE TAPE. The plan for this repair preferred deriving it from
 * `save.actionLog` and adding no store. It cannot be done: `core/types.ts` `GameAction` records a
 * catch as `{t:"catch", nodeId, lineId, uid}` and carries **no age**, so a creature caught and
 * since released leaves a tape entry from which the age FORM — the half Ives counts separately —
 * is not recoverable. The accumulator sits beside `sign.<node>.linesMet`, which is the same shape
 * for the same reason, and is written from the one place every save move already passes through.
 */
export function dexIdentitySet(save: SaveEnvelope, content: Content): Set<string> {
  const seen = new Set<string>(listFlag(save, DEX_ENTERED_FLAG));
  for (const creature of [...save.party, ...save.box]) seen.add(dexIdentityOf(creature, content));
  return seen;
}

/** How many identities the census has recorded. Never falls. */
export function dexIdentities(save: SaveEnvelope, content: Content): number {
  return dexIdentitySet(save, content).size;
}

function numberFlag(save: SaveEnvelope, key: string): number | null {
  const value = save.questFlags[key];
  return typeof value === "number" ? value : null;
}

function listFlag(save: SaveEnvelope, key: string): string[] {
  const value = save.questFlags[key];
  if (typeof value !== "string" || value.length === 0) return [];
  return value.split(" ");
}

/** The lines the player has met at a node, as the tracker recorded them. */
export function linesMetAt(save: SaveEnvelope, nodeId: string): string[] {
  return listFlag(save, linesMetFlag(nodeId));
}

/**
 * Record that the player has met a line at a node — the sign card a forage yields.
 *
 * Idempotent and order-stable, because it is the store *First Signs* counts and a duplicated entry
 * would make three sightings of one animal look like three cards.
 */
export function recordLineMet(save: SaveEnvelope, nodeId: string, lineId: string): SaveEnvelope {
  const key = linesMetFlag(nodeId);
  const met = listFlag(save, key);
  if (met.includes(lineId)) return save;
  return { ...save, questFlags: { ...save.questFlags, [key]: [...met, lineId].join(" ") } };
}

/** The whole world an objective is evaluated against, built from the save. */
export function questWorld(
  save: SaveEnvelope,
  content: Content,
  def: QuestDefinition,
  file: DialogueFile = DIALOGUE,
): QuestWorld {
  const acceptedAt = numberFlag(save, acceptedAtFlag(def.id));
  const linesMet: Record<string, readonly string[]> = {};
  for (const node of content.nodes) linesMet[node.id] = linesMetAt(save, node.id);
  return {
    year: save.year,
    season: seasonOf({ year: save.year, tick: save.tick }, content.balance),
    flags: save.questFlags,
    actions: save.actionLog,
    actionsSinceAccepted: acceptedAt === null ? save.actionLog : save.actionLog.slice(acceptedAt),
    party: save.party,
    box: save.box,
    linesMetAt: linesMet,
    dexIdentities: dexIdentities(save, content),
    dexIdentitiesAtLastMilestone: numberFlag(save, milestoneAtFlag(def.id)),
    acceptedYear: numberFlag(save, acceptedYearFlag(def.id)),
    corpusWrittenFlags: flagsWritten(file),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The tracker
 * ──────────────────────────────────────────────────────────────────────────── */

export interface QuestReport {
  id: string;
  stage: QuestStage;
  objective: QuestObjective | null;
  met: boolean;
  owedFlag: string | null;
}

/** Every quest, with where it stands and whether its objective is met right now. */
export function questReports(
  save: SaveEnvelope,
  content: Content,
  file: DialogueFile = DIALOGUE,
): QuestReport[] {
  return questDefinitions(file).map((def) => {
    const objective = QUEST_OBJECTIVES[def.id];
    const stage = questStage(def, save.questFlags);
    return {
      id: def.id,
      stage,
      objective: objective ?? null,
      met: objective === undefined ? false : objectiveHolds(objective, questWorld(save, content, def, file)),
      owedFlag: def.owedFlag,
    };
  });
}

/** Drop keys from a save's quest flags. The only place this module UNSETS anything. */
function clearFlags(save: SaveEnvelope, keys: readonly string[]): SaveEnvelope {
  const drop = new Set(keys);
  let touched = false;
  const flags: Record<string, FlagValue> = {};
  for (const [k, v] of Object.entries(save.questFlags)) {
    if (drop.has(k)) {
      touched = true;
      continue;
    }
    flags[k] = v;
  }
  return touched ? { ...save, questFlags: flags } : save;
}

/** Everything one cycle of a quest writes: the acceptance, the turn-in, the endings, the stamps. */
function cycleFlagsOf(def: QuestDefinition): string[] {
  return [
    ...(def.acceptFlag === null ? [] : [def.acceptFlag]),
    ...(def.owedFlag === null ? [] : [def.owedFlag]),
    ...def.completionFlags,
    acceptedAtFlag(def.id),
    acceptedYearFlag(def.id),
    settledYearFlag(def.id),
  ];
}

/**
 * ⚠ THE ONE PLACE A QUEST FLAG IS UNSET, and three separate repairs need it.
 *
 * A quest that can be finished twice needs its cycle taken down before it can be put up again, and
 * every one of the three shipped cases had the same shape and none of them had the code:
 *
 *   • **THE STAR CENSUS re-arms as soon as its plate is collected.** `syncQuestFlags` skipped any
 *     quest whose owed flag was set, nothing ever cleared `quest.star-census.milestone`, and so the
 *     re-arm write two screens below — `due[milestoneAtFlag(...)]` — was dead after the first
 *     grant. The census paid exactly one milestone, ever. The corpus now records the collection
 *     (the milestone entry writes its own completion flag), and the pair is cleared here.
 *   • **THE FALLOW FIELD re-arms a year after it settles.** Both endings promise it; the offer's
 *     `flagsUnset` forbade it. The settlement year is stamped when the ending fires, and a further
 *     year turning takes the whole cycle down — except the RESULT, which is deliberately left
 *     standing as the record of how last year went (`core/quests.ts` explains why a value-carrying
 *     write is not a completion).
 *   • **FERRYMAN'S WAGER lapses.** The deadline is in the objective's kind; when the year turns on
 *     an unmet one, the acceptance comes down so the offer returns, and `quest.<id>.lapsed` records
 *     that it ran out. Clearing is not polish: `chain.undermere.step4` gates on this quest's
 *     `.done`, so a lapse that could not be retried would dead-end the Undermere chain.
 *
 * Every branch is EDGE-TRIGGERED by construction rather than by a watcher: each one clears the very
 * flags its own condition reads, so a second run in the same moment finds nothing to do. That is
 * what keeps this module idempotent, which `tests/gates/quest-layer.test.ts` asserts directly.
 */
function settleCycles(
  save: SaveEnvelope,
  defs: readonly QuestDefinition[],
  content: Content,
  file: DialogueFile,
): SaveEnvelope {
  let next = save;
  for (const def of defs) {
    const objective = QUEST_OBJECTIVES[def.id];
    if (objective === undefined) continue;
    const finished = def.completionFlags.length > 0 && def.completionFlags.every((f) => flagIsSet(next.questFlags, f));

    if (objectiveRepeatsPerCycle(objective)) {
      // The plate has been collected: take the milestone and the receipt down together, so the
      // next growth in the census can arm it again.
      if (finished && def.owedFlag !== null && flagIsSet(next.questFlags, def.owedFlag)) {
        next = clearFlags(next, [def.owedFlag, ...def.completionFlags]);
      }
      continue;
    }

    if (ANNUAL_QUESTS.has(def.id)) {
      if (!finished) continue;
      const settled = numberFlag(next, settledYearFlag(def.id));
      if (settled === null) {
        next = { ...next, questFlags: { ...next.questFlags, [settledYearFlag(def.id)]: next.year } };
      } else if (next.year > settled) {
        // A further year has turned since the settlement. The arrangement comes round again; the
        // RESULT stays, because it is the only place in the corpus a quest outcome is remembered.
        next = clearFlags(next, cycleFlagsOf(def));
      }
      continue;
    }

    if (objectiveLapsesAtYearTurn(objective)) {
      if (def.owedFlag === null || flagIsSet(next.questFlags, def.owedFlag)) continue;
      if (questStage(def, next.questFlags) !== "accepted") continue;
      const acceptedYear = numberFlag(next, acceptedYearFlag(def.id));
      if (acceptedYear === null || next.year <= acceptedYear) continue;
      // The objective is checked one last time before the window is called shut, so a run that
      // completed it in the same moment the year turned is not failed by evaluation order.
      if (objectiveHolds(objective, questWorld(next, content, def, file))) continue;
      next = clearFlags(next, [
        ...(def.acceptFlag === null ? [] : [def.acceptFlag]),
        acceptedAtFlag(def.id),
        acceptedYearFlag(def.id),
      ]);
      next = { ...next, questFlags: { ...next.questFlags, [lapsedFlag(def.id)]: true } };
    }
  }
  return next;
}

/**
 * Bring the save's quest bookkeeping up to date, and write every flag that has come due.
 *
 * Called from every place the save can move, exactly as `syncEventFlags` is, and for the same
 * reason: a quest's completion is a standing fact about the save, not an edge somebody has to be
 * watching for. Idempotent — running it twice writes nothing the first run did not.
 *
 * Five things happen here and nowhere else:
 *   1. **the dex is accumulated.** {@link dexIdentitySet} is monotonic only because the union is
 *      written back, and this is the one call every save move already passes through.
 *   2. **`lifecycle.first-retirement` is published** off the action tape. It is read by
 *      *Forge a Legacy* and by Maren, and nothing has ever written it.
 *   3. **a finished cycle is taken down** — see {@link settleCycles}. Before the stamps, because a
 *      quest whose acceptance was just cleared must not be re-stamped in the same call.
 *   4. **the acceptance is stamped.** The corpus writes `quest.<id>.taken` (or `.offered`); this
 *      records WHEN, so "four released since you took this on" and "a year has turned" are
 *      answerable after a reload.
 *   5. **the turn-in flag is written** when the quest is accepted and its objective holds. The
 *      authored `done` entry's own `when` then decides what the giver actually says — which is why
 *      *The Fallow Field*'s two endings still branch on the live Loamunder count and this module
 *      never looks at it.
 */
export function syncQuestFlags(
  save: SaveEnvelope,
  content: Content,
  file: DialogueFile = DIALOGUE,
): SaveEnvelope {
  let next = save;
  const defs = questDefinitions(file);

  const entered = [...dexIdentitySet(next, content)].sort().join(" ");
  if (entered.length > 0 && next.questFlags[DEX_ENTERED_FLAG] !== entered) {
    next = { ...next, questFlags: { ...next.questFlags, [DEX_ENTERED_FLAG]: entered } };
  }

  const flags: Record<string, FlagValue> = {};

  if (hasRetired(next.actionLog) && !flagIsSet(next.questFlags, RETIREMENT_MILESTONE_FLAG)) {
    flags[RETIREMENT_MILESTONE_FLAG] = true;
  }
  next = { ...next, questFlags: { ...next.questFlags, ...flags } };

  next = settleCycles(next, defs, content, file);

  const stamps: Record<string, FlagValue> = {};
  for (const def of defs) {
    const accepted = def.acceptFlag === null || flagIsSet(next.questFlags, def.acceptFlag);
    if (accepted && numberFlag(next, acceptedAtFlag(def.id)) === null) {
      stamps[acceptedAtFlag(def.id)] = next.actionLog.length;
      stamps[acceptedYearFlag(def.id)] = next.year;
    }
  }

  // The stamps above must be visible to the objectives below, or a quest accepted and completed
  // inside one sync would measure its progress from the wrong point on the tape.
  next = { ...next, questFlags: { ...next.questFlags, ...stamps } };

  const due: Record<string, FlagValue> = {};
  for (const def of defs) {
    if (def.owedFlag === null) continue;
    if (flagIsSet(next.questFlags, def.owedFlag)) continue;
    const stage = questStage(def, next.questFlags);
    if (stage !== "accepted" && stage !== "open") continue;
    const objective = QUEST_OBJECTIVES[def.id];
    if (objective === undefined) continue;
    if (!objectiveHolds(objective, questWorld(next, content, def, file))) continue;
    due[def.owedFlag] = true;
    // A repeatable milestone re-arms: the census pays a plate once per growth, not once per press.
    // The high-water mark is what `dexIdentitiesRisen` compares against, and it is only reachable
    // a second time because `settleCycles` takes the collected plate down again.
    if (objectiveRepeatsPerCycle(objective)) {
      due[milestoneAtFlag(def.id)] = dexIdentities(next, content);
    }
  }

  if (Object.keys(due).length === 0) return next;
  return { ...next, questFlags: { ...next.questFlags, ...due } };
}

/**
 * A quest turn-in flag can only be written once the quest is accepted, so this reports the ones
 * that are still owed — what the HUD prints and what a test asserts shrinks as a run is played.
 */
export function stillOwed(
  save: SaveEnvelope,
  file: DialogueFile = DIALOGUE,
): string[] {
  // `externallyGrantedFlags` covers `flagEquals` as well as `flagsSet`, which is where the two
  // `story.vellsire.*` outcome keys live — a hand-rolled scan of `flagsSet` alone misses them, and
  // missing them is exactly how they came to have no writer at all (D-INT-4).
  return externallyGrantedFlags(file).filter((key) => !flagIsSet(save.questFlags, key));
}

/* ────────────────────────────────────────────────────────────────────────────
 * The release verb — bible §9's "release verb intro", which had no verb
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ReleaseApplication {
  save: SaveEnvelope;
  before: number;
  after: number;
  released: OwnedCreature | null;
  problem: string | null;
}

/**
 * Put one of the player's creatures back into the node they are standing in.
 *
 * ⚠ THIS VERB DID NOT EXIST. `core/ecosim.ts` `applyRelease` and `core/save.ts`'s `{t:"release"}`
 * replay arm have shipped since Lane A, and **nothing in `game/` ever produced one** — so bible
 * §9's *Restock the Shallows* ("release captured Boglings; **release verb intro**") and Maren's own
 * `maren.tutorial.release` ("One more thing the snare does, backwards. You can open it.") both
 * taught a verb the player could not perform. It lives beside the quest that introduces it.
 *
 * It is the exact mirror of `game/wild-battle.ts` `applyCatchToSave`: the SAME population resolver
 * (`liveNodeOf`), the same `toNodeState` write, and a tape entry the replay already knows how to
 * apply — so a released individual survives a reload and a replay at the same number (L10).
 *
 * G7: it reports two integers and the identifiers, and says nothing about what releasing means.
 */
export function releaseIntoNode(
  save: SaveEnvelope,
  content: Content,
  uid: string,
  nodeId: string = save.currentNode,
): ReleaseApplication {
  const creature = save.party.find((c) => c.uid === uid) ?? save.box.find((c) => c.uid === uid);
  if (!creature) {
    return { save, before: 0, after: 0, released: null, problem: `no creature "${uid}" in party or box` };
  }
  if (!nodeFileOf(content, nodeId)) {
    return { save, before: 0, after: 0, released: null, problem: `no node "${nodeId}" in data/nodes/` };
  }

  const live = liveNodeOf(content, save, nodeId);
  const before = live.populations[creature.lineId]?.count ?? 0;
  let next;
  try {
    next = applyRelease(live, creature.lineId, content.balance);
  } catch (err) {
    return {
      save,
      before,
      after: before,
      released: null,
      problem: err instanceof Error ? err.message : String(err),
    };
  }
  const after = next.populations[creature.lineId]?.count ?? before;

  let out = appendAction(save, { t: "release", nodeId, lineId: creature.lineId, uid });
  out = {
    ...out,
    party: out.party.filter((c) => c.uid !== uid),
    box: out.box.filter((c) => c.uid !== uid),
    nodeStates: { ...out.nodeStates, [nodeId]: toNodeState(next) },
  };
  return { save: out, before, after, released: creature, problem: null };
}

/**
 * Who the release verb would put back — the last creature the player caught that is not the only
 * one they have.
 *
 * The party is never emptied by a release: an empty party is what `wildBattleProblem` refuses a
 * battle for, so a verb that could produce one would be a verb that can end the run.
 */
export function releaseCandidate(save: SaveEnvelope): OwnedCreature | null {
  if (save.box.length > 0) return save.box[save.box.length - 1] ?? null;
  if (save.party.length <= 1) return null;
  return save.party[save.party.length - 1] ?? null;
}

/** The age classes a quest objective may name, re-exported so a caller need not reach into core. */
export type { AgeClass };
