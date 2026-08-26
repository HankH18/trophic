/**
 * tests/gates/quest-layer.test.ts — THE QUEST LAYER, WHICH HAD NO TESTS AT ALL.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * `core/quests.ts` (the objective evaluator) and `game/quests.ts` (the ten-row objective table, the
 * flag writers, the release verb) are what make ten authored side quests closable. Before this file
 * the suite was 2095 green across 42 test files and **not one assertion anywhere exercised either
 * module.** Four separate quest defects shipped invisibly behind that green:
 *
 *   • *Forge a Legacy* turns itself in the first time anything retires — before the player has ever
 *     stood in Cindershelf or heard Bram ask. Its turn-in objective is `{kind:"flagSet", flag:
 *     lifecycle.first-retirement}` and that is the SAME flag its offer gates on, and it has no
 *     acceptance, so `questStage` returns "open" from a standing start.
 *   • *The Star Census* pays its one and only milestone before the player has met Ives.
 *   • *Ferryman's Wager* ships `{kind:"holdsAge", age:"E"}` against copy that says
 *     "caught and brought back before the year turns" — the player's own starter closes it by
 *     ageing on the bench, and the deadline is in three lines of copy and nowhere in the code.
 *   • Every quest's thank-you line stays eligible for ever, at priority 59–61, above every greeting
 *     in the room, so a town whose quests are finished answers [E] with its completion lines on
 *     every visit until the end of the run.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * THE DISCIPLINE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Every check below drives the REAL modules against the REAL shipped corpus and the REAL content
 * loader — `questDefinitions(DIALOGUE)`, `QUEST_OBJECTIVES`, `syncQuestFlags`, `objectiveHolds`,
 * `talkEntryFor`. There is no hand-built fixture quest table anywhere in this file, because the
 * whole point of `core/quests.ts` is that the bill is derived from the shipped corpus: a fixture
 * would prove the fixture.
 *
 * Two things this file reads but never writes: `data/dialogue.json`'s line text and choice text. It
 * scans the authored copy for the promises the copy makes (a deadline, a catch) and asserts the
 * MECHANISM matches. A parallel prose lane owns every one of those strings.
 */

import { describe, expect, it } from "vitest";

import { awardBadge } from "../../core/acts";
import {
  DIALOGUE,
  type DialogueEntry,
  type DialogueFile,
  type FlagValue,
} from "../../core/dialogue-schema";
import { newOwnedCreature } from "../../core/lifecycle";
import {
  flagIsSet,
  objectiveHolds,
  questDefinitions,
  questEntries,
  questIds,
  questStage,
  type QuestDefinition,
  type QuestObjective,
} from "../../core/quests";
import { validateContent } from "../../core/schemas";
import { appendAction, newSave, type SaveEnvelope } from "../../core/save";
import type { AgeClass, OwnedCreature, SpeciesLine } from "../../core/types";
import { dialogueContext, talkEntryFor } from "../../game/dialogue-runner";
import {
  QUEST_OBJECTIVES,
  linesMetFlag,
  questWorld,
  syncQuestFlags,
} from "../../game/quests";

const content = validateContent();
const balance = content.balance;

const QUEST_IDS = questIds(DIALOGUE);
const DEFS: readonly QuestDefinition[] = questDefinitions(DIALOGUE);
const defOf = (id: string): QuestDefinition => {
  const found = DEFS.find((d) => d.id === id);
  if (!found) throw new Error(`no quest "${id}" in the shipped corpus`);
  return found;
};

const freshSave = (): SaveEnvelope =>
  newSave({ seed: balance.rng.defaultSeed, currentNode: "hearthollow", nodes: content.nodes }, balance);

/** A save standing in act `act`: the opening chain done, plus the badges that act costs. */
function saveAtAct(act: number): SaveEnvelope {
  let save = freshSave();
  save = { ...save, questFlags: { ...save.questFlags, "story.opening.done": true } };
  for (let i = 0; i < act - 1 && i < content.gyms.length; i += 1) {
    const gym = content.gyms[i];
    if (gym) save = { ...save, ...awardBadge(save, gym.id, balance) };
  }
  return save;
}

/** The first shipped line that is not an Ancient — Ancients are forced to Elder and never age. */
const ORDINARY_LINE: SpeciesLine = (() => {
  const line = content.species.find((s) => !s.ancient);
  if (!line) throw new Error("data/species.json ships no non-Ancient line");
  return line;
})();

function creature(uid: string, age: AgeClass, boxed = false): OwnedCreature {
  return newOwnedCreature(
    { uid, lineId: ORDINARY_LINE.id, age, level: balance.xp.starterLevel, caughtYear: balance.clock.startYear, boxed },
    ORDINARY_LINE,
    balance,
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * 0. The corpus and the table agree on what the ten quests ARE
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the quest layer under test is the shipped one", () => {
  it("drives the real corpus, not a fixture", () => {
    expect(QUEST_IDS.length).toBe(10);
    expect(DEFS.map((d) => d.id).sort()).toEqual([...QUEST_IDS].sort());
  });

  it("every quest the corpus declares has a row in QUEST_OBJECTIVES", () => {
    const missing = QUEST_IDS.filter((id) => QUEST_OBJECTIVES[id] === undefined);
    expect(
      missing.length === 0 ||
        `quests with no objective row — syncQuestFlags skips them, so their turn-in flag has no ` +
          `writer and their whole .done branch is dead copy: ${missing.join(", ")}`,
    ).toBe(true);
  });

  it("every row in QUEST_OBJECTIVES belongs to a quest the corpus declares", () => {
    const stale = Object.keys(QUEST_OBJECTIVES).filter((id) => !QUEST_IDS.includes(id));
    expect(stale.length === 0 || `objective rows for quests no entry carries: ${stale.join(", ")}`).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2a — the offer → accept → turn-in → done chain is CLOSED
 * ════════════════════════════════════════════════════════════════════════════ */

/** Every flag key any entry READS, in any clause. */
function flagsReadByCorpus(file: DialogueFile): Set<string> {
  const out = new Set<string>();
  for (const e of file.entries) {
    for (const k of e.when?.flagsSet ?? []) out.add(k);
    for (const k of e.when?.flagsUnset ?? []) out.add(k);
    for (const fe of e.when?.flagEquals ?? []) out.add(fe.key);
  }
  return out;
}

/** Every flag key any entry or choice WRITES. */
function flagsWrittenByCorpus(file: DialogueFile): Set<string> {
  const out = new Set<string>();
  for (const e of file.entries) {
    for (const k of Object.keys(e.setFlags ?? {})) out.add(k);
    for (const c of e.choices ?? []) for (const k of Object.keys(c.setFlags ?? {})) out.add(k);
  }
  return out;
}

const READ = flagsReadByCorpus(DIALOGUE);
const WRITTEN = flagsWrittenByCorpus(DIALOGUE);

/**
 * The three ROLES a quest's flag chain has to fill, and why they are checked as roles rather than
 * as the literal `.taken` / `.turnin` / `.done` spellings.
 *
 * Nine of the ten quests spell acceptance `quest.<id>.taken`; *First Signs* spells it
 * `quest.first-signs.offered` and fills the role perfectly well. A gate that demanded the suffix
 * would report a false positive there and miss nothing real. `core/quests.ts` already derives the
 * role — `acceptFlag`, `owedFlag`, `completionFlags` — so the gate asks the module the game asks.
 * The literal keys are reported in the failure message so a reader still sees the spelling.
 */
interface ChainHole {
  quest: string;
  role: "acceptance" | "turn-in" | "completion";
  detail: string;
}

function chainHoles(): ChainHole[] {
  const out: ChainHole[] = [];
  for (const def of DEFS) {
    if (def.acceptFlag === null) {
      out.push({
        quest: def.id,
        role: "acceptance",
        detail:
          "no flag the corpus WRITES and one of this quest's own entries READS with flagsSet — so " +
          'questStage() returns "open" from a standing start and the turn-in can precede the offer',
      });
    } else {
      if (!WRITTEN.has(def.acceptFlag)) {
        out.push({ quest: def.id, role: "acceptance", detail: `"${def.acceptFlag}" is read and never written` });
      }
      if (!READ.has(def.acceptFlag)) {
        out.push({ quest: def.id, role: "acceptance", detail: `"${def.acceptFlag}" is written and never read` });
      }
    }

    if (def.owedFlag === null) {
      out.push({ quest: def.id, role: "turn-in", detail: "no turn-in flag at all — the quest cannot be closed" });
    } else {
      if (!READ.has(def.owedFlag)) {
        out.push({ quest: def.id, role: "turn-in", detail: `"${def.owedFlag}" is written and never read` });
      }
      if (QUEST_OBJECTIVES[def.id] === undefined) {
        out.push({
          quest: def.id,
          role: "turn-in",
          detail: `"${def.owedFlag}" has no writer: syncQuestFlags skips a quest with no objective row`,
        });
      }
    }

    if (def.completionFlags.length === 0) {
      out.push({
        quest: def.id,
        role: "completion",
        detail:
          "no entry unlocked by the turn-in writes a flag in this quest's namespace — questStage() " +
          'can never return "done", so the quest has no terminal state',
      });
    }
    for (const flag of def.completionFlags) {
      if (!READ.has(flag)) {
        out.push({ quest: def.id, role: "completion", detail: `"${flag}" is written and never read` });
      }
    }
  }
  return out;
}

describe("GATE 2a — the offer → accept → turn-in → done chain is closed", () => {
  it("every quest fills all three flag roles, both written and read", () => {
    const holes = chainHoles();
    const message = [
      `${String(holes.length)} hole(s) in the ten quests' flag chains. A role that is written and`,
      "never read is dead bookkeeping; a role that is read and never written is dead copy:",
      ...holes.map((h) => `  • ${h.quest} — ${h.role}: ${h.detail}`),
      "",
      "Resolved roles, for reference:",
      ...DEFS.map(
        (d) =>
          `  ${d.id}: accept=${String(d.acceptFlag)} owed=${String(d.owedFlag)} ` +
          `completion=[${d.completionFlags.join(", ")}]`,
      ),
    ].join("\n");
    expect(holes.length === 0 || message).toBe(true);
  });

  it("BINDS — the role check is not vacuous: it resolves First Signs' non-standard acceptance", () => {
    // The one quest that does not spell acceptance `.taken` still fills the role, and the gate
    // must not report it. If this ever goes red, the check has become a suffix match.
    expect(defOf("first-signs").acceptFlag).toBe("quest.first-signs.offered");
    expect(WRITTEN.has("quest.first-signs.offered")).toBe(true);
    expect(READ.has("quest.first-signs.offered")).toBe(true);
    expect(chainHoles().some((h) => h.quest === "first-signs")).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2b — a quest cannot turn itself in before its offer is reachable
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * A save that has DONE everything and SAID nothing.
 *
 * Every world fact an objective can read is maximal — a party spanning all three age classes, sign
 * cards for every line at every node, a tape carrying travels, catches, releases and a retirement —
 * while `questFlags` carries nothing any dialogue entry ever wrote. That is a real state: a player
 * can walk out of the prologue and forage for a year without talking to anyone.
 *
 * Nothing may come due on it. A turn-in written here is a quest that closed before it was ever
 * offered, and the giver's thank-you will be the first thing the player ever hears them say.
 */
function busyButSilentSave(): SaveEnvelope {
  const party: OwnedCreature[] = [creature("gate-j", "J"), creature("gate-a", "A"), creature("gate-e", "E")];
  let save: SaveEnvelope = { ...saveAtAct(content.gyms.length + 1), party };
  // Reset every flag a dialogue entry could have written; the badges and the opening are the only
  // things the player earned by playing rather than by speaking.
  const flags: Record<string, FlagValue> = {};
  for (const [k, v] of Object.entries(save.questFlags)) if (!WRITTEN.has(k)) flags[k] = v;
  save = { ...save, questFlags: flags };

  for (const node of content.nodes) {
    save = {
      ...save,
      questFlags: { ...save.questFlags, [linesMetFlag(node.id)]: Object.keys(node.populations).join(" ") },
    };
    save = appendAction(save, { t: "travel", to: node.id });
    const lineId = Object.keys(node.populations)[0];
    if (lineId !== undefined) {
      for (const c of party) save = appendAction(save, { t: "catch", nodeId: node.id, lineId, uid: c.uid });
      save = appendAction(save, { t: "release", nodeId: node.id, lineId, uid: party[0]?.uid ?? "gate-j" });
      save = appendAction(save, { t: "release", nodeId: node.id, lineId, uid: party[0]?.uid ?? "gate-j" });
      save = appendAction(save, { t: "release", nodeId: node.id, lineId, uid: party[0]?.uid ?? "gate-j" });
      save = appendAction(save, { t: "release", nodeId: node.id, lineId, uid: party[0]?.uid ?? "gate-j" });
    }
  }
  save = appendAction(save, {
    t: "retirement",
    choice: { kind: "boon", parentUid: "gate-e", targetUid: "gate-a", stat: "atk" },
  });
  return save;
}

describe("GATE 2b — a quest cannot turn itself in before its offer is reachable", () => {
  it("no turn-in comes due on a save that has done everything and spoken to nobody", () => {
    const before = busyButSilentSave();
    const after = syncQuestFlags(before, content);
    const premature = DEFS.filter(
      (d) => d.owedFlag !== null && !flagIsSet(before.questFlags, d.owedFlag) && flagIsSet(after.questFlags, d.owedFlag),
    );
    const message = [
      `${String(premature.length)} quest(s) wrote a turn-in flag on a save whose questFlags carry`,
      "nothing any dialogue entry ever wrote — the player has never met the giver:",
      ...premature.map(
        (d) =>
          `  • ${d.id} — wrote "${String(d.owedFlag)}"; acceptFlag=${String(d.acceptFlag)}, ` +
          `objective=${JSON.stringify(QUEST_OBJECTIVES[d.id])}`,
      ),
      "",
      "A quest with acceptFlag === null is 'open' from a standing start, so nothing stands between",
      "its objective and its turn-in. The giver's thank-you then out-prioritises their own offer.",
    ].join("\n");
    expect(premature.length === 0 || message).toBe(true);
  });

  /**
   * The named witness, because *Forge a Legacy* is the only quest on the never-cut LEGACY beat.
   * One retirement anywhere in the region — the beat the game is built around — closes it, and the
   * same `syncQuestFlags` call that publishes `lifecycle.first-retirement` writes the turn-in.
   */
  it("Forge a Legacy does not close on the first retirement anywhere", () => {
    const save = appendAction(saveAtAct(4), {
      t: "retirement",
      choice: { kind: "boon", parentUid: "gate-parent", targetUid: "gate-target", stat: "atk" },
    });
    const after = syncQuestFlags(save, content);
    expect(after.questFlags["lifecycle.first-retirement"]).toBe(true);
    expect(after.questFlags[String(defOf("forge-a-legacy").owedFlag)]).toBeUndefined();
  });

  it("The Star Census does not pay a milestone before the player has met the observatory", () => {
    const save: SaveEnvelope = { ...saveAtAct(5), party: [creature("gate-j", "J")] };
    const after = syncQuestFlags(save, content);
    expect(after.questFlags[String(defOf("star-census").owedFlag)]).toBeUndefined();
  });

  it("BINDS — the silent save really does satisfy the objectives, so a pass is not a vacuous pass", () => {
    const save = busyButSilentSave();
    const satisfied = DEFS.filter((d) => {
      const objective = QUEST_OBJECTIVES[d.id];
      return objective !== undefined && objectiveHolds(objective, questWorld(save, content, d));
    });
    // If nothing were satisfiable on this save the gate above would pass for the wrong reason.
    expect(satisfied.length).toBeGreaterThan(3);
  });

  /**
   * THE CLASS, NOT THE INSTANCE — and the two assertions above are structurally blind to it.
   *
   * Both measure a save whose `questFlags` carry nothing any entry ever wrote. On such a save the
   * quest is `unoffered`, `syncQuestFlags` skips it, and no turn-in is written — so both pass while
   * a quest whose OBJECTIVE IS THE FLAG ITS OWN OFFER GATES ON completes itself one keypress after
   * being offered. Measured on *Forge a Legacy*: `bram.quest.forge.offer` requires
   * `lifecycle.first-retirement` and its objective WAS `{kind: "flagSet", flag:
   * lifecycle.first-retirement}`, so the offer's own `setFlags` promoted the quest to `accepted`
   * with the objective already true. Two consecutive [E] presses at Cindershelf — no travel, no
   * catch, no release — took it and turned it in.
   *
   * The mechanical statement of "already true the moment it is offered" is: an objective must not
   * name a flag its offer reads with `flagsSet`. An objective is a thing the player DOES after
   * accepting; a precondition of the offer is a thing that has already happened.
   */
  it("no quest's objective is a flag its own offer already requires", () => {
    const collapsed: string[] = [];
    for (const def of DEFS) {
      const objective = QUEST_OBJECTIVES[def.id];
      if (objective === undefined || objective.kind !== "flagSet") continue;
      const offers = DIALOGUE.entries.filter(
        (e) => e.quest === def.id && (e.when?.flagsSet ?? []).includes(objective.flag),
      );
      for (const e of offers) {
        collapsed.push(
          `  • ${def.id} — objective is flagSet "${objective.flag}", which ${e.id} already ` +
            "requires in when.flagsSet, so the objective is true the instant the offer is eligible",
        );
      }
    }
    const message = [
      `${String(collapsed.length)} quest(s) have an objective that is already satisfied at the`,
      "moment they are offered, so the turn-in comes due in the very syncQuestFlags call that",
      "follows the offer and the quest closes in two consecutive [E] presses:",
      ...collapsed,
    ].join("\n");
    expect(collapsed.length === 0 || message).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2c — a completed quest's thank-you cannot outrank the room for ever
 * ════════════════════════════════════════════════════════════════════════════ */

/** The entries a quest's turn-in flag unlocks — its thank-you lines. */
function turnInEntries(def: QuestDefinition): DialogueEntry[] {
  if (def.owedFlag === null) return [];
  const owed = def.owedFlag;
  return questEntries(DIALOGUE, def.id).filter((e) => (e.when?.flagsSet ?? []).includes(owed));
}

/** A save with this quest fully finished, at the act its offer opens in. */
function finishedSave(def: QuestDefinition): SaveEnvelope {
  const offer = questEntries(DIALOGUE, def.id)[0];
  const act = offer?.when?.actMin ?? (offer?.when?.act !== undefined ? Math.min(...offer.when.act) : 1);
  let save = saveAtAct(Math.max(act, 1));
  const flags: Record<string, FlagValue> = { ...save.questFlags };
  if (def.acceptFlag !== null) flags[def.acceptFlag] = true;
  if (def.owedFlag !== null) flags[def.owedFlag] = true;
  for (const f of def.completionFlags) flags[f] = true;
  save = { ...save, questFlags: flags, currentNode: def.node };
  return save;
}

describe("GATE 2c — a finished quest's thank-you does not outrank the room for ever", () => {
  it("the room does not answer a fresh visit with a completed quest's completion line", () => {
    const offenders: string[] = [];
    for (const def of DEFS) {
      const save = finishedSave(def);
      const ctx = dialogueContext(save, content);
      // A FRESH VISIT: `said` is empty, exactly as it is the moment the player walks into the node.
      const answer = talkEntryFor(DIALOGUE, def.node, ctx);
      if (answer === undefined) continue;
      if (turnInEntries(def).some((e) => e.id === answer.id)) {
        offenders.push(
          `  • ${def.id} — [E] at ${def.node} answers "${answer.id}" ` +
            `(priority ${String(answer.priority ?? 0)}), and it stays eligible for the rest of the run`,
        );
      }
    }
    const message = [
      `${String(offenders.length)} finished quest(s) still answer the room first, on every visit:`,
      ...offenders,
      "",
      "talkEntryFor walks TALK_KINDS with `quest` FIRST, and these sit at priority 59–61 above every",
      "greeting (0), ambient (0), service (0) and lore (50–52) in the same node. An entry that writes",
      "a flag and does not name that flag in its own `when.flagsUnset` never closes itself.",
    ].join("\n");
    expect(offenders.length === 0 || message).toBe(true);
  });

  it("structurally — every turn-in entry closes itself on a flag it writes", () => {
    const open: string[] = [];
    for (const def of DEFS) {
      for (const e of turnInEntries(def)) {
        const writes = Object.keys(e.setFlags ?? {});
        const unset = new Set(e.when?.flagsUnset ?? []);
        if (writes.length === 0) {
          open.push(`  • ${e.id} (${def.id}) — writes nothing, so it can never stop being eligible`);
        } else if (!writes.some((k) => unset.has(k))) {
          open.push(
            `  • ${e.id} (${def.id}) — writes [${writes.join(", ")}] and forbids none of them ` +
              `(flagsUnset: [${[...unset].join(", ")}])`,
          );
        }
      }
    }
    expect(
      open.length === 0 ||
        [`${String(open.length)} turn-in entr(ies) stay eligible after firing:`, ...open].join("\n"),
    ).toBe(true);
  });

  it("BINDS — the fresh-visit probe really is asking the shipped selector", () => {
    // A finished-quest save at Hearthollow must at least produce SOME answer; a probe that always
    // returned undefined would make the gate above green for the wrong reason.
    const save = finishedSave(defOf("first-signs"));
    expect(talkEntryFor(DIALOGUE, "hearthollow", dialogueContext(save, content))).toBeDefined();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2d — a deadline in the copy is a deadline in the objective
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Phrases that state a BOUND on when the thing must be done.
 *
 * ⚠ A DEADLINE IS NOT A WAIT, and the distinction is the whole of this check. *The Fallow Field*
 * says "I'll walk it myself at the turn of the year" and "twenty-four of them there at harvest" —
 * that is the player waiting for a settlement date, and `{kind:"yearTurnedSinceAccepted"}` models
 * it exactly. *Ferryman's Wager* says "caught and brought back BEFORE the year turns" — that is a
 * clock running out. Only the second shape is listed here.
 *
 * Every pattern below was taken from a line that actually ships; none is speculative.
 */
const DEADLINE_MARKERS: readonly { pattern: RegExp; reads: string }[] = [
  { pattern: /\bbefore the year turns?\b/i, reads: "before the year turns" },
  { pattern: /\bbefore the season (turns|ends|closes)\b/i, reads: "before the season ends" },
  { pattern: /\b(spring|summer|autumn|winter) only\b/i, reads: "<season> only" },
  { pattern: /\bone night\b/i, reads: "one night" },
];

/** Every string of authored copy a quest owns. READ ONLY — the prose lane owns these. */
function questCopy(questId: string): { entryId: string; text: string }[] {
  const out: { entryId: string; text: string }[] = [];
  for (const e of questEntries(DIALOGUE, questId)) {
    for (const l of e.lines) out.push({ entryId: e.id, text: l.text });
    for (const c of e.choices ?? []) out.push({ entryId: e.id, text: c.text });
  }
  return out;
}

function deadlineClaims(questId: string): { entryId: string; reads: string }[] {
  const out: { entryId: string; reads: string }[] = [];
  for (const { entryId, text } of questCopy(questId)) {
    for (const marker of DEADLINE_MARKERS) {
      if (marker.pattern.test(text)) out.push({ entryId, reads: marker.reads });
    }
  }
  return out;
}

/**
 * Objective kinds that BOUND the window the objective must be met in.
 *
 * `returnedTo` carries a season and is checked against the live season, so it expires. `holdsAge`,
 * `distinctLinesMetAt`, `releasesAt`, `catchesAt`, `visitedSince`, `flagSet`,
 * `everyCorpusFlagWithPrefix` and `dexIdentitiesRisen` are all forward-open — once true they stay
 * true. `yearTurnedSinceAccepted` is a WAIT, not a bound: it becomes true and never becomes false.
 *
 * The name test is forward-looking on purpose: an objective kind added later whose name says it
 * closes at the year turn counts without this list having to be edited.
 */
function objectiveIsTimeBounded(objective: QuestObjective): boolean {
  if (objective.kind === "returnedTo") return true;
  return /BeforeYearTurn|Deadline|Expires/i.test(objective.kind);
}

describe("GATE 2d — a deadline the copy states is a deadline the objective has", () => {
  it("the marker list is calibrated against copy that actually ships", () => {
    // If no quest's copy trips any marker the gate is decoration.
    const tripped = QUEST_IDS.filter((id) => deadlineClaims(id).length > 0);
    expect(tripped.length).toBeGreaterThan(0);
  });

  it("every quest whose copy states a deadline has one in its objective", () => {
    const offenders: string[] = [];
    for (const id of QUEST_IDS) {
      const claims = deadlineClaims(id);
      if (claims.length === 0) continue;
      const objective = QUEST_OBJECTIVES[id];
      if (objective === undefined || objectiveIsTimeBounded(objective)) continue;
      offenders.push(
        `  • ${id} — objective ${JSON.stringify(objective)} has no time bound, but the copy states one ` +
          `${String(claims.length)} time(s): ${claims.map((c) => `${c.entryId} ("${c.reads}")`).join(", ")}`,
      );
    }
    const message = [
      `${String(offenders.length)} quest(s) promise a deadline the mechanism does not keep.`,
      "The copy is not the bug — the objective is. G2: the line stays, the row moves.",
      ...offenders,
    ].join("\n");
    expect(offenders.length === 0 || message).toBe(true);
  });

  it("BINDS — a season-bounded objective satisfies a season deadline", () => {
    // Lanternless Night says "<season> only" and ships `returnedTo` with a season. It must not be
    // reported; if it ever is, the time-bound predicate has stopped recognising a real bound.
    expect(deadlineClaims("lanternless-night").length).toBeGreaterThan(0);
    const objective = QUEST_OBJECTIVES["lanternless-night"];
    expect(objective).toBeDefined();
    expect(objective !== undefined && objectiveIsTimeBounded(objective)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2e — an objective may not be satisfiable without doing the thing the copy asks
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Phrases that say the player must TAKE the thing and BRING it — a fact about the action tape, not
 * about what happens to be in the party. Taken verbatim in shape from shipped copy.
 */
const ACQUISITION_MARKERS: readonly { pattern: RegExp; reads: string }[] = [
  { pattern: /\bcaught and brought back\b/i, reads: "caught and brought back" },
  { pattern: /\btook? (an?|the) .{0,30}\bout of the\b/i, reads: "took … out of the …" },
];

/** Objective kinds that read the ACTION TAPE — what the player did, not what they hold. */
function objectiveReadsTheTape(objective: QuestObjective): boolean {
  switch (objective.kind) {
    case "catchesAt":
    case "releasesAt":
    case "visitedSince":
    case "returnedTo":
      return true;
    default:
      return /^catchesAt/.test(objective.kind);
  }
}

describe("GATE 2e — the objective is the thing the copy describes", () => {
  it("a quest whose copy says the player must CATCH it does not accept a creature they merely hold", () => {
    const offenders: string[] = [];
    for (const id of QUEST_IDS) {
      const claims: string[] = [];
      for (const { entryId, text } of questCopy(id)) {
        for (const marker of ACQUISITION_MARKERS) {
          if (marker.pattern.test(text)) claims.push(`${entryId} ("${marker.reads}")`);
        }
      }
      if (claims.length === 0) continue;
      const objective = QUEST_OBJECTIVES[id];
      if (objective === undefined || objectiveReadsTheTape(objective)) continue;
      offenders.push(
        `  • ${id} — objective ${JSON.stringify(objective)} never reads the action tape, so it is ` +
          `satisfiable without the catch the copy asks for: ${claims.join(", ")}`,
      );
    }
    expect(
      offenders.length === 0 ||
        [
          `${String(offenders.length)} objective(s) can be met without doing what the copy describes:`,
          ...offenders,
        ].join("\n"),
    ).toBe(true);
  });

  /**
   * The named witness. `{kind:"holdsAge", age:"E"}` is a fact about the party, and a Juvenile
   * starter becomes an Elder in its third year (`balance.age.lifespanYears.J`) — so the player's own
   * first creature closes the wager while they are nowhere near the marsh and have caught nothing.
   */
  it("an Elder that aged on the bench does not close Ferryman's Wager", () => {
    const def = defOf("ferrymans-wager");
    const objective = QUEST_OBJECTIVES["ferrymans-wager"];
    expect(objective).toBeDefined();
    if (objective === undefined) return;

    // A save with exactly one creature, an Elder, and an EMPTY action tape: nothing was ever caught.
    const save: SaveEnvelope = { ...saveAtAct(2), party: [creature("bench-elder", "E")] };
    expect(save.actionLog).toHaveLength(0);
    expect(save.party[0]?.age).toBe("E");

    expect(objectiveHolds(objective, questWorld(save, content, def))).toBe(false);
  });

  it("BINDS — the witness save WOULD close an objective that is about holding an Elder", () => {
    // Proves the save is well-formed and the evaluator is running: the same save satisfies the
    // holds-an-Elder reading, which is precisely the reading the wager must not use.
    const def = defOf("ferrymans-wager");
    const save: SaveEnvelope = { ...saveAtAct(2), party: [creature("bench-elder", "E")] };
    const holdsElder: QuestObjective = { kind: "holdsAge", age: "E" };
    expect(objectiveHolds(holdsElder, questWorld(save, content, def))).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The tracker itself — the properties every check above leans on
 * ════════════════════════════════════════════════════════════════════════════ */

describe("syncQuestFlags — the properties the gates above assume", () => {
  it("is idempotent: a second run writes nothing the first did not", () => {
    const once = syncQuestFlags(busyButSilentSave(), content);
    const twice = syncQuestFlags(once, content);
    expect(twice.questFlags).toEqual(once.questFlags);
  });

  it("never advances a quest whose acceptance the player has not given", () => {
    const save = busyButSilentSave();
    const after = syncQuestFlags(save, content);
    for (const def of DEFS) {
      if (def.acceptFlag === null) continue;
      expect(questStage(def, after.questFlags)).toBe("unoffered");
    }
  });
});
