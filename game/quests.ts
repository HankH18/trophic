/**
 * game/quests.ts — the WRITERS for the flags `data/dialogue.json` reads and nothing sets.
 *
 * THE HOLE THIS CLOSES. Ten side quests ship with finished copy and every one of them closes on a
 * flag no system writes; `core/dialogue-schema.ts` `externallyGrantedFlags` derives that bill from
 * the corpus (fourteen keys as shipped). Until this module existed, every one of those quests could
 * be opened and never closed, `chain.*.complete` was unreachable, and *Forge a Legacy* waited on a
 * `lifecycle.first-retirement` that the retirement flow never published.
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

export interface QuestObjectiveRow {
  objective: QuestObjective;
  /** The authored line the row transcribes. Verbatim; never a paraphrase (G2). */
  source: string;
  /**
   * Where the transcription is NARROWER or WIDER than the copy, said out loud. `null` means the
   * mechanism is exactly what the line asks for.
   */
  deviation: string | null;
}

/**
 * bible §9 / `data/dialogue.json`, one row per quest.
 *
 * The four vertical-slice quests build-doc §15 C7 names first — First Signs, The Fallow Field,
 * Restock the Shallows, Ferryman's Wager — are the four that are never cut, and they are the four
 * whose objectives are mechanised most literally.
 */
export const QUEST_OBJECTIVES: Readonly<Record<string, QuestObjectiveRow>> = {
  /* ── the four never-cut slice quests ───────────────────────────────────── */
  "first-signs": {
    objective: { kind: "distinctLinesMetAt", node: "r1", count: 3 },
    source: "\"Walk Meadow Reach and bring me three. Any three.\" (maren.quest.first-signs.offer)",
    deviation:
      "A sign card is not an item in the shipped schema — `data/nodes/*.json` has no inventory and " +
      "`items` carries snares, baits and medicines. The card is therefore the FORAGE ITSELF: three " +
      "DISTINCT lines met on Meadow Reach. Maren's own done line names three of them, and 'any " +
      "three' is what the offer asks for.",
  },
  "fallow-field": {
    objective: { kind: "yearTurnedSinceAccepted" },
    source:
      "\"Count's twenty-four; I'll walk it myself at the turn of the year and we'll compare books.\" " +
      "(tolm.quest.fallow.accepted)",
    deviation:
      "None. The twenty-four is NOT transcribed here on purpose — the corpus already carries it, as " +
      "the `population` clause on tolm.quest.fallow.done.kept, and `conditionHolds` resolves it. The " +
      "turn-in flag means only 'harvest has come'; which of the two authored endings then fires is " +
      "the live Loamunder count's answer, exactly as authored.",
  },
  "restock-the-shallows": {
    objective: { kind: "releasesAt", node: "r2", count: 4 },
    source:
      "\"I want four Boglings put back into that water\" / \"Put them in on the Brackmarsh side.\" " +
      "(nessa.quest.restock.offer, nessa.quest.restock.accepted)",
    deviation:
      "The SPECIES is not checked — a source may not name one (see the header). Four individuals " +
      "released into Brackmarsh close it, whichever line they are. Nessa's done line reads 'the " +
      "Brackmarsh count on my board goes up by four', which is true of any four.",
  },
  "ferrymans-wager": {
    objective: { kind: "holdsAge", age: "E" },
    source:
      "\"An Elder Mirefin, caught and brought back before the year turns.\" (sel.quest.wager.offer)",
    deviation:
      "The SPECIES is not checked (see the header): holding any Elder closes it. The AGE is, which " +
      "is the half the beat is about — \"Elders are one year from retiring, so you're spending a " +
      "year of something to prove a point.\"",
  },

  /* ── the six above cut line C-3 ────────────────────────────────────────── */
  "silk-shortage": {
    objective: { kind: "catchesAt", node: "r3", age: "A", count: 3 },
    source: "\"Three Webvern, my price, or walk away and tell her I asked.\" (halder.quest.silk.offer)",
    deviation:
      "Species unchecked (see the header); the AGE is checked because both sides of the authored " +
      "dilemma are about adults — \"three adults out of the canopy is more than the canopy replaces " +
      "in a year\". Taken on Bowerdeep Wilds, which is where the canopy is.",
  },
  "lanternless-night": {
    objective: { kind: "returnedTo", node: "bowerdeep", season: "autumn" },
    source:
      "\"I need a walk to the eastern stair and back with the relight kit.\" / \"One night. Autumn " +
      "only\" (pell.quest.lanternless.offer)",
    deviation:
      "'The eastern stair' is not a place the node graph carries, so the walk is transcribed as its " +
      "shape: leave Bowerdeep and come back, in autumn. The season is the authored gate and is " +
      "checked exactly.",
  },
  "after-the-crash": {
    objective: { kind: "visitedSince", node: "r4" },
    source:
      "\"Five counts on Cinder Steppe. … Bring me all five and the flora reading with them.\" " +
      "(gerta.quest.crash.offer)",
    deviation:
      "The counts and the flora reading are the LEDGER's, and the ledger reads the live save from " +
      "anywhere — so the only part of the survey that is a fact about the player is having stood on " +
      "Cinder Steppe. A ledger-visit record would tighten this and the ledger scene keeps none.",
  },
  "forge-a-legacy": {
    objective: { kind: "flagSet", flag: "lifecycle.first-retirement" },
    source:
      "\"One of yours has run out of years, then.\" / \"Bring it here and I'll set it.\" " +
      "(bram.quest.forge.offer)",
    deviation:
      "The relic and the ingot are not items the shipped economy carries, so the cost is not taken. " +
      "The retirement is: `lifecycle.first-retirement` is derived from the action tape by " +
      "{@link syncQuestFlags} and is itself one of the flags nothing wrote.",
  },
  "star-census": {
    objective: { kind: "dexIdentitiesRisen" },
    source:
      "\"Another milestone. Here's the plate, still tacky\" / \"Thirty-five identities in the full " +
      "census.\" (ives.quest.census.milestone)",
    deviation:
      "The only quest of the ten with no terminal state, and the flag is repeatable — so a " +
      "milestone is paid whenever the census has GROWN since the last plate, rather than at a " +
      "step size nothing in the copy states. Inventing a step would be inventing content.",
  },
  "vellsires-trail": {
    objective: { kind: "everyCorpusFlagWithPrefix", prefix: "trail.stone." },
    source:
      "\"Walk the trail in order and bring me what the stones say.\" / \"All six.\" " +
      "(orrin.quest.trail.offer, orrin.quest.trail.done)",
    deviation:
      "None, and nothing is transcribed: the six stones ARE the six `trail.stone.*` flags the " +
      "corpus's own antler-stone prop entries write, so the objective reads the corpus rather than " +
      "a copy of it. Six is never typed anywhere.",
  },
};

/* ────────────────────────────────────────────────────────────────────────────
 * Reading the world a quest is judged against
 * ──────────────────────────────────────────────────────────────────────────── */

/** Every named dex identity the player is currently holding — bible §9's "identities you've entered". */
export function dexIdentities(save: SaveEnvelope, content: Content): number {
  const byId = new Map(content.species.map((s) => [s.id, s]));
  const seen = new Set<string>();
  for (const creature of [...save.party, ...save.box]) {
    const line = byId.get(creature.lineId);
    const form = line?.formNames[creature.age];
    seen.add(form === undefined ? `${creature.lineId}:${creature.age}` : `${creature.lineId}:${form}`);
  }
  return seen.size;
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
    const row = QUEST_OBJECTIVES[def.id];
    const stage = questStage(def, save.questFlags);
    return {
      id: def.id,
      stage,
      objective: row?.objective ?? null,
      met: row === undefined ? false : objectiveHolds(row.objective, questWorld(save, content, def, file)),
      owedFlag: def.owedFlag,
    };
  });
}

/**
 * Bring the save's quest bookkeeping up to date, and write every flag that has come due.
 *
 * Called from every place the save can move, exactly as `syncEventFlags` is, and for the same
 * reason: a quest's completion is a standing fact about the save, not an edge somebody has to be
 * watching for. Idempotent — running it twice writes nothing the first run did not.
 *
 * Three things happen here and nowhere else:
 *   1. **the acceptance is stamped.** The corpus writes `quest.<id>.taken` (or `.offered`); this
 *      records WHEN, so "four released since you took this on" and "a year has turned" are
 *      answerable after a reload.
 *   2. **`lifecycle.first-retirement` is published** off the action tape. It is read by
 *      *Forge a Legacy* and by Maren, and nothing has ever written it.
 *   3. **the turn-in flag is written** when the quest is accepted and its objective holds. The
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
  const flags: Record<string, FlagValue> = {};

  if (hasRetired(next.actionLog) && !flagIsSet(next.questFlags, RETIREMENT_MILESTONE_FLAG)) {
    flags[RETIREMENT_MILESTONE_FLAG] = true;
  }

  for (const def of questDefinitions(file)) {
    const accepted = def.acceptFlag === null || flagIsSet(next.questFlags, def.acceptFlag);
    if (accepted && numberFlag(next, acceptedAtFlag(def.id)) === null) {
      flags[acceptedAtFlag(def.id)] = next.actionLog.length;
      flags[acceptedYearFlag(def.id)] = next.year;
    }
  }

  // The stamps above must be visible to the objectives below, or a quest accepted and completed
  // inside one sync would measure its progress from the wrong point on the tape.
  next = { ...next, questFlags: { ...next.questFlags, ...flags } };

  const due: Record<string, FlagValue> = {};
  for (const def of questDefinitions(file)) {
    if (def.owedFlag === null) continue;
    if (flagIsSet(next.questFlags, def.owedFlag)) continue;
    const stage = questStage(def, next.questFlags);
    if (stage !== "accepted" && stage !== "open") continue;
    const row = QUEST_OBJECTIVES[def.id];
    if (row === undefined) continue;
    if (!objectiveHolds(row.objective, questWorld(next, content, def, file))) continue;
    due[def.owedFlag] = true;
    // A repeatable milestone re-arms: the census pays a plate once per growth, not once per press.
    if (row.objective.kind === "dexIdentitiesRisen") {
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
