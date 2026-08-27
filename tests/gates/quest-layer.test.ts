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
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * AND THEN IT NEVER LOOKED INSIDE A ROW
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Everything above sections 2f/2g checks a `QuestObjective`'s KIND. Its NODE, its COUNT, its AGE
 * and its SEASON were read by nothing here and by nothing in `tests/gates/reachability.test.ts`,
 * which counted a quest's turn-in flag as written on the strength of `QUEST_OBJECTIVES[def.id] !==
 * undefined`. Measured: five single-field edits to `game/quests.ts` left the entire 2,801-test
 * suite byte-identical, among them a count that makes a shipped quest permanently impossible and
 * three that send the player to a place their giver never mentions. Sections 2f and 2g are those
 * two questions — can the world supply it, and is it the errand the copy describes — and GATE 2d
 * now MEASURES a quest's window instead of recognising a deadline by the spelling of its kind.
 */

import { describe, expect, it } from "vitest";

import { awardBadge } from "../../core/acts";
import { seasonOf } from "../../core/clock";
import {
  DIALOGUE,
  flagsWritten,
  type DialogueEntry,
  type DialogueFile,
  type FlagValue,
} from "../../core/dialogue-schema";
import { applyCatch, fromNodeState, stepRegionStates, toNodeState } from "../../core/ecosim";
import { toEcoNode } from "../../core/foodweb";
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
import { createRng } from "../../core/rng";
import { validateContent } from "../../core/schemas";
import { appendAction, catchAction, newSave, type SaveEnvelope } from "../../core/save";
import { AGE_CLASSES, SEASONS } from "../../core/types";
import type { AgeClass, NodeFile, NodeState, OwnedCreature, Season, SpeciesLine } from "../../core/types";
import { dialogueContext, talkEntryFor } from "../../game/dialogue-runner";
import { rollAge } from "../../game/encounters";
import {
  QUEST_OBJECTIVES,
  lapsedFlag,
  linesMetFlag,
  questWorld,
  recordLineMet,
  releaseIntoNode,
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

/**
 * A copy of the shipped corpus with entries rewritten — the sabotage bench for {@link chainHoles}.
 *
 * `data/dialogue.json` is never touched: the prose lane owns every string in it, and a gate that
 * can only be proven by editing the thing it guards is a gate nobody will prove twice.
 */
function corpusWith(rewrite: (e: DialogueEntry) => DialogueEntry): DialogueFile {
  return { speakers: DIALOGUE.speakers, entries: DIALOGUE.entries.map(rewrite) };
}

/**
 * ⚠ IT TAKES THE CORPUS AS AN ARGUMENT, AND THAT IS WHAT MAKES IT PROVABLE. Three of the seven
 * sub-checks that used to live here could not fail (see the notes inside), and the reason nobody
 * noticed for a whole wave is that this function read the shipped corpus off module scope: there
 * was no way to hand it a broken one. Every fact it needs is now derived from `file`, so the
 * binders below feed it a deliberately damaged copy of `data/dialogue.json` and watch it report.
 */
function chainHoles(file: DialogueFile = DIALOGUE): ChainHole[] {
  const out: ChainHole[] = [];
  const read = flagsReadByCorpus(file);
  const truthy = corpusTruthyWriters(file);
  const entryById = new Map<string, DialogueEntry>(file.entries.map((e) => [e.id, e]));
  for (const def of questDefinitions(file)) {
    if (def.acceptFlag === null) {
      out.push({
        quest: def.id,
        role: "acceptance",
        detail:
          "no flag the corpus WRITES and one of this quest's own entries READS with flagsSet — so " +
          'questStage() returns "open" from a standing start and the turn-in can precede the offer',
      });
    } else {
      /*
       * ⚠ THE TWO CHECKS THAT USED TO STAND HERE COULD NOT FAIL, AND A CHECK THAT CANNOT FAIL
       * CERTIFIES. `core/quests.ts` resolves `acceptFlag` as the intersection of "written somewhere
       * in the corpus" with "read with flagsSet by one of this quest's own entries" — so
       * `WRITTEN.has(acceptFlag)` and `READ.has(acceptFlag)` were re-asking the very walk that
       * produced the answer. Both were true by construction, on every corpus, for ever.
       *
       * What they were reaching for is answerable from OUTSIDE that walk, and this is it: the
       * acceptance has to be written SET — a `false` write is a latch being lowered, which is
       * exactly what `sel.quest.wager.lost` and `narration.blackout` do to their own preconditions
       * — by an entry standing where the giver stands, because a job the player takes on in some
       * other town is not this giver's offer.
       */
      const writers = truthy.get(def.acceptFlag) ?? [];
      if (writers.length === 0) {
        out.push({
          quest: def.id,
          role: "acceptance",
          detail:
            `"${def.acceptFlag}" is never written SET by any entry or choice — the corpus only ever ` +
            `lowers it. questStage() can never leave "unoffered", so syncQuestFlags never writes the ` +
            "turn-in and the whole quest is dead copy",
        });
      } else if (!writers.some((id) => entryById.get(id)?.node === def.node)) {
        out.push({
          quest: def.id,
          role: "acceptance",
          detail:
            `"${def.acceptFlag}" is written only by [${writers.join(", ")}], and not one of those ` +
            `stands in "${def.node}" where ${def.giver} does — nothing at the giver's own node can ` +
            "put the player into this quest",
        });
      }
    }

    if (def.owedFlag === null) {
      out.push({ quest: def.id, role: "turn-in", detail: "no turn-in flag at all — the quest cannot be closed" });
    } else {
      /*
       * ⚠ AND THE THIRD TAUTOLOGY WAS `!READ.has(def.owedFlag)`. `owedFlag` is the quest-namespace
       * flag the corpus READS and nothing writes, so "is it read" was already answered by the walk
       * that found it. The real question is WHO reads it: `core/quests.ts` collects the bill over
       * EVERY entry in the file, so a turn-in can perfectly well be read only from outside the
       * quest — `chain.undermere.step4` reads *Ferryman's Wager*'s `.done` that way — and a quest
       * whose own giver never reads its turn-in comes due in silence, with no line to answer it.
       */
      const owed = def.owedFlag;
      const readers = questEntries(file, def.id).filter(
        (e) =>
          (e.when?.flagsSet ?? []).includes(owed) ||
          (e.when?.flagEquals ?? []).some((fe) => fe.key === owed),
      );
      if (readers.length === 0) {
        out.push({
          quest: def.id,
          role: "turn-in",
          detail:
            `"${owed}" is read by no entry of this quest — it is read only from outside it, so the ` +
            "flag comes due and the giver has nothing to say about it",
        });
      }
      if (QUEST_OBJECTIVES[def.id] === undefined) {
        out.push({
          quest: def.id,
          role: "turn-in",
          detail: `"${owed}" has no writer: syncQuestFlags skips a quest with no objective row`,
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
      if (!read.has(flag)) {
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
    // …and the writer is `maren.tutorial.survey`, an entry with no `quest` field at all. It fills
    // the role because it stands in Maren's own node, which is what the acceptance check asks.
    const writers = CORPUS_TRUTHY_WRITERS.get("quest.first-signs.offered") ?? [];
    expect(writers).toContain("maren.tutorial.survey");
    expect(writers.some((id) => ENTRY_BY_ID.get(id)?.node === defOf("first-signs").node)).toBe(true);
    expect(chainHoles().some((h) => h.quest === "first-signs")).toBe(false);
  });

  /**
   * BINDS the acceptance census AGAINST the one it replaced, on real shipped data.
   *
   * The old check asked `WRITTEN.has(flag)` — a key census. Two flags in the shipped corpus are
   * written by nothing but a `false`, and both are written by the very entry that requires them:
   * `sel.quest.wager.lost` lowers `quest.ferrymans-wager.lapsed` and `narration.blackout` lowers
   * `story.blackout.woke`. A key census calls those corpus-written; the value census does not, and
   * that difference is the whole reason a self-satisfied precondition could pass review.
   */
  it("BINDS — a flag the corpus only ever writes FALSE is not counted as written", () => {
    for (const key of ["quest.ferrymans-wager.lapsed", "story.blackout.woke"]) {
      expect(WRITTEN.has(key), `${key} is no longer written at all — this binder is stale`).toBe(true);
      expect(CORPUS_TRUTHY_WRITERS.has(key), `${key} is now written SET somewhere`).toBe(false);
    }
  });

  /* ── the three replaced sub-checks, each fed a corpus that breaks it ────────────────────── */

  it("BINDS — an acceptance the corpus only lowers is reported", () => {
    const lowered = corpusWith((e) =>
      e.id !== "sel.quest.wager.offer"
        ? e
        : {
            ...e,
            choices: (e.choices ?? []).map((c) =>
              c.setFlags?.["quest.ferrymans-wager.taken"] === true
                ? { ...c, setFlags: { ...c.setFlags, "quest.ferrymans-wager.taken": false } }
                : c,
            ),
          },
    );
    const holes = chainHoles(lowered);
    expect(holes.some((h) => h.quest === "ferrymans-wager" && h.role === "acceptance")).toBe(true);
    // …and the shipped corpus is clean, so the red above is the sabotage and nothing else.
    expect(chainHoles().some((h) => h.quest === "ferrymans-wager")).toBe(false);
  });

  it("BINDS — an acceptance written only in another town is reported", () => {
    // *First Signs* is the case the old suffix-shaped thinking got wrong twice over: its acceptance
    // is written by `maren.tutorial.survey`, an entry with no `quest` field, and what makes that
    // legitimate is WHERE it stands. Move it and the player can no longer take the job from Maren.
    const moved = corpusWith((e) =>
      e.id !== "maren.tutorial.survey" ? e : { ...e, node: "cindershelf" },
    );
    const holes = chainHoles(moved);
    expect(holes.some((h) => h.quest === "first-signs" && h.role === "acceptance")).toBe(true);
  });

  it("BINDS — a turn-in only read from outside the quest is reported", () => {
    // The flag still resolves as the quest's `owedFlag` — `core/quests.ts` collects the bill over
    // every entry in the file — but no entry OF the quest reads it any more, so it comes due and
    // Sel has nothing to say. This is precisely what `!READ.has(def.owedFlag)` could never see.
    const relabelled = corpusWith((e) =>
      e.id !== "sel.quest.wager.done" ? e : { ...e, quest: "first-signs" },
    );
    const holes = chainHoles(relabelled);
    expect(defOf("ferrymans-wager").owedFlag).toBe("quest.ferrymans-wager.turnin");
    expect(holes.some((h) => h.quest === "ferrymans-wager" && h.role === "turn-in")).toBe(true);
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
 * THE MEASURED WORLD — what a player can actually reach, hold, take and stand in
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ⚠ EVERY CEILING BELOW IS READ OR DRIVEN, NEVER TYPED. The checks after this section judge the
 * CONTENTS of a `QuestObjective` — its node, its count, its age, its season — and a ceiling typed
 * out here would stop covering the content set added after it was typed, which is the same failure
 * one level up from the one these gates exist for.
 *
 *   HOLD_CAPACITY   `balance.party` — `core/quests.ts` `countCatches` reads the age off the
 *                   individual the tape names, so a catch only counts while the player still HAS
 *                   it. The party plus the box is therefore a hard ceiling on any `count` of
 *                   catches, and it is the ceiling that makes an impossible count impossible.
 *   linesAt         `data/nodes/*` — the only lines that can be met, taken or put back at a node.
 *   yieldCeilingAt  Σ carryCap × the seasons in a run. A SOUND over-estimate: a node is clamped to
 *                   carryCap every season (`core/ecosim.ts` `clampPopulationCount`), so it cannot
 *                   hand over more than that in a season however it is played.
 *   TAKEABLE_AT     a MEASURED FLOOR, driven through the real `applyCatch`/`stepRegionStates`: what
 *                   a player who empties the node every season actually gets out of it. A floor and
 *                   not a ceiling — a gentler player who lets it breed back takes more — so it is
 *                   used only to prove a node yields SOMETHING and to cap the driver below.
 *   TRAVELABLE      the shipped `adjacency` graph, walked from the node a new save starts in.
 *   AGES_ROLLED     the real `rollAge` drawn two thousand times: the age classes an encounter can
 *                   actually produce. An objective naming an age the roller never returns is one no
 *                   player can meet.
 *   TICK_OF_SEASON  the real `seasonOf` over every tick of a year: which seasons the clock reaches.
 */

const NODE_BY_ID: ReadonlyMap<string, NodeFile> = new Map(content.nodes.map((n) => [n.id, n]));
const ENTRY_BY_ID: ReadonlyMap<string, DialogueEntry> = new Map(DIALOGUE.entries.map((e) => [e.id, e]));

/** The species lines a node ships — the only ones a player can meet, take or put back there. */
function linesAt(nodeId: string): string[] {
  return Object.keys(NODE_BY_ID.get(nodeId)?.populations ?? {});
}

/** The first line at a node that is not an Ancient — an Ancient is forced to Elder and never ages. */
function ordinaryLineAt(nodeId: string): string | null {
  for (const lineId of linesAt(nodeId)) {
    if (content.species.find((s) => s.id === lineId)?.ancient !== true) return lineId;
  }
  return null;
}

/** Individuals the player can hold at once. A catch counts only while they still have it. */
const HOLD_CAPACITY = balance.party.maxPartySize + balance.party.maxBoxSize;

const SEASONS_IN_RUN = balance.clock.yearsTotal * SEASONS.length;

/** Σ carryCap at a node: the most individuals that can ever stand there at one moment. */
function standingCapAt(nodeId: string): number {
  return Object.values(NODE_BY_ID.get(nodeId)?.populations ?? {}).reduce((n, p) => n + p.carryCap, 0);
}

/** A SOUND ceiling on everything a node can hand over across a whole run. Deliberately generous. */
function yieldCeilingAt(nodeId: string): number {
  return standingCapAt(nodeId) * SEASONS_IN_RUN;
}

/**
 * What the REAL catch path hands over at each node across a whole run — a measured FLOOR.
 *
 * The region is stepped through `stepRegionStates` exactly as a played run steps it, and every
 * season the target node is emptied one `applyCatch` at a time, counting only the calls that
 * actually moved the number down. A population at zero does not breed, so this greedy reading is
 * the floor rather than the ceiling; {@link yieldCeilingAt} is the sound over-estimate.
 */
const TAKEABLE_AT: ReadonlyMap<string, number> = (() => {
  const out = new Map<string, number>();
  for (const target of content.nodes) {
    const rng = createRng(balance.rng.defaultSeed);
    let nodes = content.nodes.map((f) => toEcoNode(f));
    let taken = 0;
    for (let year = 0; year < balance.clock.yearsTotal; year += 1) {
      for (const season of SEASONS) {
        nodes = nodes.map((n) => {
          if (n.id !== target.id) return n;
          let cur = n;
          for (const lineId of Object.keys(cur.populations)) {
            for (;;) {
              const before = cur.populations[lineId]?.count ?? 0;
              if (before <= 0) break;
              const next = applyCatch(cur, lineId, balance);
              if ((next.populations[lineId]?.count ?? before) >= before) break;
              cur = next;
              taken += 1;
            }
          }
          return cur;
        });
        const states: Record<string, NodeState> = {};
        for (const n of nodes) states[n.id] = toNodeState(n);
        const stepped = stepRegionStates(content.nodes, states, season, rng).states;
        nodes = content.nodes.map((f) => {
          const next = stepped[f.id];
          return next === undefined ? toEcoNode(f) : fromNodeState(f, next);
        });
      }
    }
    out.set(target.id, taken);
  }
  return out;
})();

/** Hops from `from` to `to` over the shipped adjacency, `to` last, or null when there is no path. */
function pathTo(from: string, to: string): string[] | null {
  if (!NODE_BY_ID.has(from) || !NODE_BY_ID.has(to)) return null;
  const prev = new Map<string, string>();
  const seen = new Set<string>([from]);
  const queue: string[] = [from];
  while (queue.length > 0) {
    const at = queue.shift() as string;
    if (at === to) break;
    for (const next of NODE_BY_ID.get(at)?.adjacency ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, at);
      queue.push(next);
    }
  }
  if (!seen.has(to)) return null;
  const hops: string[] = [];
  let cur = to;
  while (cur !== from) {
    hops.unshift(cur);
    const back = prev.get(cur);
    if (back === undefined) return null;
    cur = back;
  }
  return hops;
}

/** Every node a player can walk to from where a new save starts. */
const TRAVELABLE: ReadonlySet<string> = new Set(
  content.nodes.map((n) => n.id).filter((id) => id === freshSave().currentNode || pathTo(freshSave().currentNode, id) !== null),
);

/** The age classes the REAL roller produces. Driven, not read off the weights table. */
const AGES_ROLLED: ReadonlySet<AgeClass> = (() => {
  const rng = createRng(balance.rng.defaultSeed);
  const seen = new Set<AgeClass>();
  for (let i = 0; i < 2000; i += 1) seen.add(rollAge(balance, rng));
  return seen;
})();

/** The first tick of each season the clock actually reaches, judged by the real `seasonOf`. */
const TICK_OF_SEASON: ReadonlyMap<Season, number> = (() => {
  const out = new Map<Season, number>();
  for (let tick = 0; tick < balance.clock.ticksPerYear; tick += 1) {
    const season = seasonOf({ year: balance.clock.startYear, tick, subTick: 0 }, balance);
    if (!out.has(season)) out.set(season, tick);
  }
  return out;
})();

/** The seasons the shipped clock actually reaches over a year. */
const SEASONS_LIVED: ReadonlySet<Season> = new Set(TICK_OF_SEASON.keys());

/**
 * flag -> the entries that write it SET, in the sense `core/quests.ts` `flagIsSet` means.
 *
 * A `false` write is excluded on purpose and it is not hypothetical: `narration.blackout` and
 * `sel.quest.wager.lost` both write their OWN precondition to `false` to close themselves, and a
 * census that counts the key rather than the value reports those two flags as corpus-written when
 * the only thing the corpus does with them is lower a latch somebody else raised.
 */
function corpusTruthyWriters(file: DialogueFile): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const e of file.entries) {
    const bags = [e.setFlags ?? {}, ...(e.choices ?? []).map((c) => c.setFlags ?? {})];
    for (const bag of bags) {
      for (const [k, v] of Object.entries(bag)) {
        if (v === false) continue;
        const list = out.get(k);
        if (list) {
          if (!list.includes(e.id)) list.push(e.id);
        } else out.set(k, [e.id]);
      }
    }
  }
  return out;
}

const CORPUS_TRUTHY_WRITERS: ReadonlyMap<string, string[]> = corpusTruthyWriters(DIALOGUE);

/* ── the satisfier: a player who does what the objective says, and cannot exceed the world ── */

/** A creature of a line the shipped content carries, so a release into its node is a real release. */
function creatureOfLine(uid: string, age: AgeClass, lineId: string): OwnedCreature {
  const line = content.species.find((s) => s.id === lineId);
  if (!line) throw new Error(`data/species.json ships no line "${lineId}"`);
  return newOwnedCreature(
    { uid, lineId, age, level: balance.xp.starterLevel, caughtYear: balance.clock.startYear },
    line,
    balance,
  );
}

/** Put `n` creatures of `age` in the player's hands, party first and the rest boxed. */
function holding(save: SaveEnvelope, n: number, age: AgeClass, lineId: string): SaveEnvelope {
  const held = Array.from({ length: n }, (_, i) => creatureOfLine(`held-${age}-${String(i)}`, age, lineId));
  return { ...save, party: held.slice(0, balance.party.maxPartySize), box: held.slice(balance.party.maxPartySize) };
}

/** Walk there, through the real graph. A node with no path is a node the objective cannot name. */
function travelTo(save: SaveEnvelope, to: string): SaveEnvelope {
  // Already standing in it: the copy that says "come back here" means leaving and returning, so the
  // walk starts with one step out to a real neighbour rather than with a no-op.
  const start = save.currentNode === to ? (NODE_BY_ID.get(to)?.adjacency[0] ?? null) : save.currentNode;
  if (start === null) return save;
  let out = save;
  if (start !== save.currentNode) {
    out = { ...appendAction(out, { t: "travel", to: start }), currentNode: start };
  }
  const hops = pathTo(start, to);
  if (hops === null) return save;
  for (const hop of hops) out = { ...appendAction(out, { t: "travel", to: hop }), currentNode: hop };
  return out;
}

/** Stand in a season the clock actually reaches. */
function atSeason(save: SaveEnvelope, season: Season): SaveEnvelope {
  const tick = TICK_OF_SEASON.get(season);
  return tick === undefined ? save : { ...save, tick, subTick: 0 };
}

/** The act the quest's own offer opens in, read off the corpus. */
function offerActOf(def: QuestDefinition): number {
  const offer = questEntries(DIALOGUE, def.id)[0];
  const act = offer?.when?.actMin ?? (offer?.when?.act !== undefined ? Math.min(...offer.when.act) : 1);
  return Math.max(act, 1);
}

/** Standing where the giver stands, at the act the offer opens in, with the job taken on. */
function acceptedSave(def: QuestDefinition): SaveEnvelope {
  let save: SaveEnvelope = { ...saveAtAct(offerActOf(def)), currentNode: def.node };
  if (def.acceptFlag !== null) {
    save = { ...save, questFlags: { ...save.questFlags, [def.acceptFlag]: true } };
  }
  // The real tracker stamps WHEN it was taken; everything counted below is counted from there.
  return syncQuestFlags(save, content);
}

/**
 * Do what the objective says, bounded everywhere by the measured world.
 *
 * ⚠ THIS READS THE OBJECTIVE, AND THAT IS NOT THE TAUTOLOGY IT LOOKS LIKE. A player reads it too —
 * it is the thing that tells them where to walk and what to take. What makes the result a real
 * measurement is that NOTHING here can exceed a capacity that came from somewhere else: the count
 * of catches is capped by what the player can hold and by what the node yields, the node must be
 * one the graph can reach, the age must be one the roller produces, the season must be one the
 * clock reaches, and a release goes through the real `releaseIntoNode` and can be refused. An
 * objective the shipped world cannot supply comes back unsatisfied, which is the whole question.
 */
function performObjective(save: SaveEnvelope, objective: QuestObjective): SaveEnvelope {
  switch (objective.kind) {
    case "report":
      return save;

    case "distinctLinesMetAt": {
      let out = save;
      for (const lineId of linesAt(objective.node)) out = recordLineMet(out, objective.node, lineId);
      return out;
    }

    case "holdsAge":
      if (!AGES_ROLLED.has(objective.age)) return save;
      return holding(save, 1, objective.age, ORDINARY_LINE.id);

    case "catchesAt":
    case "catchesAtBeforeYearTurn": {
      const lineId = ordinaryLineAt(objective.node);
      if (lineId === null || !AGES_ROLLED.has(objective.age)) return save;
      const taken = Math.min(objective.count, TAKEABLE_AT.get(objective.node) ?? 0, HOLD_CAPACITY);
      let out = holding(save, taken, objective.age, lineId);
      for (const held of [...out.party, ...out.box]) {
        // The REAL tape builder. `core/quests.ts` `countCatches` reads the age off the individual
        // the entry carries, and a hand-built `{t:"catch"}` without it states no age at all — so a
        // gate that assembled its own entry would report every catch objective unsatisfiable the
        // moment the tape grew a field. `catchAction` cannot drift from what the game writes.
        out = appendAction(out, catchAction(objective.node, held));
      }
      return out;
    }

    case "releasesAt": {
      const lineId = ordinaryLineAt(objective.node);
      if (lineId === null) return save;
      const wanted = Math.min(objective.count, yieldCeilingAt(objective.node));
      let out = holding(save, wanted, "A", lineId);
      for (const held of [...out.party, ...out.box]) {
        // The real verb, which refuses a node that cannot take this line back.
        const applied = releaseIntoNode(out, content, held.uid, objective.node);
        if (applied.problem !== null) break;
        out = applied.save;
      }
      return out;
    }

    case "returnedTo":
      return atSeason(travelTo(save, objective.node), objective.season);

    case "visitedSince":
      return travelTo(save, objective.node);

    case "flagSet": {
      // Set it only if something OUTSIDE this test writes it; otherwise the player never gets it.
      if ((CORPUS_TRUTHY_WRITERS.get(objective.flag) ?? []).length === 0) return save;
      return { ...save, questFlags: { ...save.questFlags, [objective.flag]: true } };
    }

    case "everyCorpusFlagWithPrefix": {
      const flags: Record<string, FlagValue> = { ...save.questFlags };
      for (const [flag, writers] of CORPUS_TRUTHY_WRITERS) {
        if (flag.startsWith(objective.prefix) && writers.length > 0) flags[flag] = true;
      }
      return { ...save, questFlags: flags };
    }

    case "yearTurnedSinceAccepted":
      return balance.clock.yearsTotal > 1 ? { ...save, year: save.year + 1 } : save;

    case "dexIdentitiesRisen": {
      const age = [...AGES_ROLLED][0];
      return age === undefined ? save : holding(save, 1, age, ORDINARY_LINE.id);
    }
  }
}

/** The save of a player who took the job on and then did exactly what it asked. */
function satisfierSave(def: QuestDefinition, objective: QuestObjective): SaveEnvelope {
  return performObjective(acceptedSave(def), objective);
}

/** Did the real tracker write this quest's turn-in on that save? */
function turnInLandsOn(def: QuestDefinition, save: SaveEnvelope): boolean {
  if (def.owedFlag === null) return false;
  if (flagIsSet(save.questFlags, def.owedFlag)) return false; // it was already there: nothing landed
  return flagIsSet(syncQuestFlags(save, content).questFlags, def.owedFlag);
}

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
interface DeadlineMarker {
  pattern: RegExp;
  reads: string;
  /** The season the phrase names, when it names one — this is what F6 was missing. */
  season: Season | null;
}

const DEADLINE_MARKERS: readonly DeadlineMarker[] = [
  { pattern: /\bbefore the year turns?\b/i, reads: "before the year turns", season: null },
  { pattern: /\bbefore the season (turns|ends|closes)\b/i, reads: "before the season ends", season: null },
  // Derived from SEASONS rather than typed as an alternation, so a fifth season would be covered.
  ...SEASONS.map((season) => ({
    pattern: new RegExp(`\\b${season} only\\b`, "i"),
    reads: `${season} only`,
    season,
  })),
  { pattern: /\bone night\b/i, reads: "one night", season: null },
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

function deadlineClaims(questId: string): { entryId: string; reads: string; season: Season | null }[] {
  const out: { entryId: string; reads: string; season: Season | null }[] = [];
  for (const { entryId, text } of questCopy(questId)) {
    for (const marker of DEADLINE_MARKERS) {
      if (marker.pattern.test(text)) out.push({ entryId, reads: marker.reads, season: marker.season });
    }
  }
  return out;
}

/**
 * The window an objective actually has, MEASURED by driving it — never read off its kind's name.
 *
 * ⚠ THIS REPLACES A PREDICATE THAT COULD ONLY SAY "A BOUND EXISTS", AND SAID IT WRONG.
 * It was `/BeforeYearTurn|Deadline|Expires/i.test(objective.kind)` plus a special case for
 * `returnedTo`, and it had two holes that a green gate hid:
 *
 *   1. **It proved existence, not identity.** *Lanternless Night*'s copy says "Autumn only" and its
 *      objective carries a season; the predicate could not tell WHICH season, so changing `autumn`
 *      to `spring` — a quest the player can now only close in the wrong half of the year, with
 *      three lines of copy still saying otherwise — moved the whole suite by zero assertions.
 *   2. **It was BROADER than the implementation.** `game/quests.ts` `objectiveLapsesAtYearTurn`
 *      matches `/BeforeYearTurn/` and nothing else, so a kind spelled `catchesAtDeadline` satisfied
 *      this gate and would never have lapsed in the shipped game. A gate looser than its own
 *      subject certifies behaviour that cannot happen.
 *
 * So both halves are now driven against the real modules:
 *
 *   `seasons` — the objective is PERFORMED and then evaluated by the real `objectiveHolds` with the
 *               save's clock moved to each season the calendar reaches. A proper subset of SEASONS
 *               is a season bound, and the subset says exactly which season it is.
 *   `lapses`  — the quest is accepted and left unmet while a year turns, through the real
 *               `syncQuestFlags`, and the answer is whether `quest.<id>.lapsed` actually appears.
 *               Nothing is inferred from a kind's spelling; if the implementation stops honouring a
 *               deadline, this goes false and the gate reports the quest that promised one.
 */
interface MeasuredWindow {
  seasons: Season[];
  lapsesAtYearTurn: boolean;
}

/** The seasons the corpus itself gates this quest on — `when.seasons`, structure and not prose. */
function seasonsGatingQuest(questId: string): Set<Season> {
  const out = new Set<Season>();
  for (const e of questEntries(DIALOGUE, questId)) for (const season of e.when?.seasons ?? []) out.add(season);
  return out;
}

function measureWindow(def: QuestDefinition, objective: QuestObjective): MeasuredWindow {
  const performed = satisfierSave(def, objective);
  const seasons = [...SEASONS].filter((season) =>
    objectiveHolds(objective, questWorld(atSeason(performed, season), content, def)),
  );
  const accepted = acceptedSave(def);
  const later: SaveEnvelope = { ...accepted, year: accepted.year + 1 };
  const lapsed = flagIsSet(syncQuestFlags(later, content).questFlags, lapsedFlag(def.id));
  return { seasons, lapsesAtYearTurn: lapsed };
}

describe("GATE 2d — a deadline the copy states is the deadline the objective HAS", () => {
  it("the marker list is calibrated against copy that actually ships", () => {
    // If no quest's copy trips any marker the gate is decoration.
    const tripped = QUEST_IDS.filter((id) => deadlineClaims(id).length > 0);
    expect(tripped.length).toBeGreaterThan(0);
  });

  it("every quest whose copy states a deadline has a MEASURED bound, in the season the copy names", () => {
    const offenders: string[] = [];
    for (const id of QUEST_IDS) {
      const claims = deadlineClaims(id);
      if (claims.length === 0) continue;
      const objective = QUEST_OBJECTIVES[id];
      if (objective === undefined) continue; // section 0 reports a missing row
      const window = measureWindow(defOf(id), objective);
      const bounded = window.lapsesAtYearTurn || window.seasons.length < SEASONS.length;
      const reads = claims.map((c) => `${c.entryId} ("${c.reads}")`).join(", ");
      if (!bounded) {
        offenders.push(
          `  • ${id} — objective ${JSON.stringify(objective)} was DRIVEN and never closes: it holds in ` +
            `all ${String(SEASONS.length)} seasons and a year turning on it writes no lapse. The copy ` +
            `states a bound ${String(claims.length)} time(s): ${reads}`,
        );
        continue;
      }
      for (const claim of claims) {
        if (claim.season === null) continue;
        if (window.seasons.length === 1 && window.seasons[0] === claim.season) continue;
        offenders.push(
          `  • ${id} — the copy says "${claim.reads}" in ${claim.entryId}, but the objective ` +
            `${JSON.stringify(objective)} was measured holding in [${window.seasons.join(", ")}]. ` +
            `A player reading that line waits for ${claim.season} and the mechanism is somewhere else.`,
        );
      }
    }
    const message = [
      `${String(offenders.length)} quest(s) promise a deadline the mechanism does not keep.`,
      "The copy is not the bug — the objective is. G2: the line stays, the row moves.",
      ...offenders,
    ].join("\n");
    expect(offenders.length === 0 || message).toBe(true);
  });

  /**
   * The season half, taken off the corpus's own STRUCTURE rather than off its prose.
   *
   * `pell.quest.lanternless.offer` carries `when.seasons: ["autumn"]`, so the game will only ever
   * offer that walk in autumn — and the objective ships `returnedTo` with a season of its own.
   * Nothing checked that the two agreed, and they are the same fact stated twice: measured, moving
   * the objective's season from `autumn` to `spring` leaves a quest that can only be TAKEN in
   * autumn and only CLOSED in spring, and the whole suite stayed byte-identical.
   *
   * Deliberately one-directional. A season-gated offer does not oblige an objective to carry a
   * season — a spring-only offer to catch three at Meadow Reach is a perfectly good quest — so the
   * check fires only when a season bound was MEASURED and it lies outside the seasons the corpus
   * will hand the quest out in.
   */
  it("a quest the corpus offers in one season does not close in another", () => {
    const offenders: string[] = [];
    for (const id of QUEST_IDS) {
      const gating = seasonsGatingQuest(id);
      if (gating.size === 0) continue;
      const objective = QUEST_OBJECTIVES[id];
      if (objective === undefined) continue;
      const window = measureWindow(defOf(id), objective);
      if (window.seasons.length === 0 || window.seasons.length === SEASONS.length) continue;
      const outside = window.seasons.filter((s) => !gating.has(s));
      if (outside.length === 0) continue;
      offenders.push(
        `  • ${id} — the corpus only offers this quest in [${[...gating].join(", ")}] (when.seasons on its ` +
          `own entries), and the objective ${JSON.stringify(objective)} was measured closing in ` +
          `[${window.seasons.join(", ")}]. The player is handed the job in one season and can only ` +
          `finish it in another.`,
      );
    }
    expect(
      offenders.length === 0 ||
        [`${String(offenders.length)} quest(s) are offered in one season and close in another:`, ...offenders].join("\n"),
    ).toBe(true);
  });

  it("BINDS — the measurement is real: the shipped season objective holds in ONE season, and the shipped deadline lapses", () => {
    // *Lanternless Night* is offered in autumn only and must be measured shut in the other three
    // seasons. If this ever reports four, the driver stopped performing the objective and both
    // checks above would be passing on a bound they never saw.
    const lantern = QUEST_OBJECTIVES["lanternless-night"];
    expect(lantern).toBeDefined();
    const gating = seasonsGatingQuest("lanternless-night");
    expect(gating.size).toBe(1);
    const lanternWindow = measureWindow(defOf("lanternless-night"), lantern as QuestObjective);
    expect(lanternWindow.seasons).toHaveLength(1);
    expect(gating.has(lanternWindow.seasons[0] as Season)).toBe(true);

    // …and the sabotage, on a copy of the row: the same objective in any OTHER season is measured
    // closing outside the seasons the corpus hands the quest out in.
    for (const season of SEASONS) {
      if (gating.has(season)) continue;
      const moved = { ...(lantern as QuestObjective & { kind: "returnedTo" }), season };
      const movedWindow = measureWindow(defOf("lanternless-night"), moved);
      expect(movedWindow.seasons, `${season} was not measured as the new window`).toEqual([season]);
      expect(movedWindow.seasons.every((s) => gating.has(s))).toBe(false);
    }

    // Ferryman's Wager says "before the year turns" and must actually lapse when one does.
    const wager = QUEST_OBJECTIVES["ferrymans-wager"];
    expect(wager).toBeDefined();
    expect(measureWindow(defOf("ferrymans-wager"), wager as QuestObjective).lapsesAtYearTurn).toBe(true);
  });

  it("BINDS — 'bounded' is measured behaviour and not a spelling", () => {
    // The negative half. *After the Crash* ships `visitedSince`, which is forward-open: once the
    // player has stood on the steppe it is true for ever. Driven, it holds in every season and no
    // year turn lapses it — so the measurement can tell an open objective from a closed one, and
    // the two assertions above are not both reading the same "yes".
    const crash = QUEST_OBJECTIVES["after-the-crash"];
    expect(crash).toBeDefined();
    const window = measureWindow(defOf("after-the-crash"), crash as QuestObjective);
    expect(window.seasons).toHaveLength(SEASONS.length);
    expect(window.lapsesAtYearTurn).toBe(false);
    // …and this is what the predicate that used to stand here would have said about a kind that
    // merely SPELLED itself like a deadline. The spelling test is gone; nothing above consults a
    // kind's name, so a name the implementation does not honour can no longer certify a bound.
    expect(/BeforeYearTurn|Deadline|Expires/i.test("visitedSinceDeadline")).toBe(true);
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
 * 2f — THE CONTENTS OF THE ROW: its node, its count, its age, its season
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ⚠ UNTIL THIS SECTION EXISTED, NEITHER PERMANENT GATE EVER LOOKED INSIDE A `QuestObjective`.
 * Everything above reads the row's KIND; `tests/gates/reachability.test.ts` counted a quest's
 * turn-in flag as having a writer on the strength of `QUEST_OBJECTIVES[def.id] !== undefined` —
 * THE ROW'S EXISTENCE. Measured on the shipped tree: five single-field edits to `game/quests.ts`
 * left the whole suite byte-identical, and one of them (a count of 999 at a node that yields 70
 * individuals, held by a player who can carry 66) makes a shipped quest permanently impossible
 * while every gate stays green.
 *
 * Two different questions are asked here.
 *
 *   CAPACITY — pure, over {@link objectiveComplaint}: is the value in the row one the SHIPPED WORLD
 *              can supply? It takes the table as an argument, so the binders below sabotage a copy
 *              of it and watch the gate go red without one production file being touched.
 *   DRIVEN   — the objective is PERFORMED through the real verbs and the real `syncQuestFlags` is
 *              asked whether the turn-in landed. The second half of that check is what keeps it
 *              honest: the same quest, accepted and NOT performed, must produce nothing.
 */

/** Everything the region hands over across a run, summed — the census has to have something to eat. */
const TOTAL_TAKEABLE = [...TAKEABLE_AT.values()].reduce((n, v) => n + v, 0);

/** Flags a run of the REAL tracker was seen writing. Observed, not declared. */
const GAME_WRITTEN_FLAGS: ReadonlySet<string> = (() => {
  const before = freshSave();
  const retired = appendAction(before, {
    t: "retirement",
    choice: { kind: "boon", parentUid: "gate-parent", targetUid: "gate-target", stat: "atk" },
  });
  const after = syncQuestFlags(retired, content);
  const out = new Set<string>();
  for (const key of Object.keys(after.questFlags)) {
    if (before.questFlags[key] === undefined) out.add(key);
  }
  return out;
})();

function placeComplaint(nodeId: string): string | null {
  if (!NODE_BY_ID.has(nodeId)) return `names node "${nodeId}", which data/nodes/ does not carry`;
  if (!TRAVELABLE.has(nodeId)) {
    return `names node "${nodeId}", which no path over the shipped adjacency reaches from where a new save starts`;
  }
  return null;
}

function countIsFree(count: number): string {
  return `asks for ${String(count)}, which is already true the moment the quest is taken on — the turn-in comes due in the same syncQuestFlags call as the acceptance`;
}

function ageComplaint(age: AgeClass): string {
  return `names age class "${age}", which the real rollAge never returned in two thousand draws (it produces ${[...AGES_ROLLED].join(", ")}), so no encounter can hand the player one`;
}

/**
 * Why no player can ever satisfy this objective, or null when one can.
 *
 * Pure over the measured world, and it takes no quest id, so it can be run against a table this
 * file makes up. Every ceiling it cites is a SOUND over-estimate — `yieldCeilingAt` is Σ carryCap
 * per season, `HOLD_CAPACITY` is the whole party plus the whole box — so a complaint is never the
 * measurement being pessimistic: it is the row asking for something the shipped world has not got.
 */
function objectiveComplaint(objective: QuestObjective): string | null {
  switch (objective.kind) {
    case "report":
      return null;

    case "distinctLinesMetAt": {
      const place = placeComplaint(objective.node);
      if (place !== null) return place;
      if (objective.count < 1) return countIsFree(objective.count);
      const lines = linesAt(objective.node).length;
      if (objective.count > lines) {
        return `asks for ${String(objective.count)} distinct lines at "${objective.node}", and data/nodes/${objective.node}.json ships ${String(lines)} — the cards that would close it do not exist`;
      }
      return null;
    }

    case "releasesAt": {
      const place = placeComplaint(objective.node);
      if (place !== null) return place;
      if (ordinaryLineAt(objective.node) === null) {
        return `puts individuals back into "${objective.node}", which carries no ordinary line to put back — core/ecosim.ts applyRelease refuses a line the node has no population for`;
      }
      if (objective.count < 1) return countIsFree(objective.count);
      const ceiling = yieldCeilingAt(objective.node);
      if (objective.count > ceiling) {
        return `asks for ${String(objective.count)} releases at "${objective.node}", above the ${String(ceiling)} individuals that node can ever hold across the ${String(balance.clock.yearsTotal)}-year run (Σ carryCap × ${String(SEASONS_IN_RUN)} seasons)`;
      }
      return null;
    }

    case "holdsAge":
      return AGES_ROLLED.has(objective.age) ? null : ageComplaint(objective.age);

    case "catchesAt":
    case "catchesAtBeforeYearTurn": {
      const place = placeComplaint(objective.node);
      if (place !== null) return place;
      if (!AGES_ROLLED.has(objective.age)) return ageComplaint(objective.age);
      if (objective.age !== "E" && ordinaryLineAt(objective.node) === null) {
        return `wants a "${objective.age}" out of "${objective.node}", where every line is an Ancient — core/lifecycle.ts forces an Ancient to Elder and G10 keeps it there`;
      }
      if ((TAKEABLE_AT.get(objective.node) ?? 0) === 0) {
        return `takes individuals out of "${objective.node}", and the real catch path yields none there across a whole run`;
      }
      if (objective.count < 1) return countIsFree(objective.count);
      if (objective.count > HOLD_CAPACITY) {
        return `asks for ${String(objective.count)} individuals taken at "${objective.node}", but core/quests.ts countCatches reads the age off the individual the tape names, so a catch counts only while the player still HAS it — and balance.party holds ${String(balance.party.maxPartySize)} + ${String(balance.party.maxBoxSize)} = ${String(HOLD_CAPACITY)}`;
      }
      const ceiling = yieldCeilingAt(objective.node);
      if (objective.count > ceiling) {
        return `asks for ${String(objective.count)} individuals taken at "${objective.node}", above the ${String(ceiling)} that node can ever hand over across the run`;
      }
      return null;
    }

    case "returnedTo": {
      const place = placeComplaint(objective.node);
      if (place !== null) return place;
      if (!SEASONS_LIVED.has(objective.season)) {
        return `waits for "${objective.season}", which the shipped clock never reaches — seasonOf over a whole year gives [${[...SEASONS_LIVED].join(", ")}]`;
      }
      return null;
    }

    case "visitedSince":
      return placeComplaint(objective.node);

    case "flagSet": {
      if ((CORPUS_TRUTHY_WRITERS.get(objective.flag) ?? []).length > 0) return null;
      if (GAME_WRITTEN_FLAGS.has(objective.flag)) return null;
      return `waits on flag "${objective.flag}", which no entry writes SET and which no observed run of syncQuestFlags produced`;
    }

    case "everyCorpusFlagWithPrefix": {
      const matching = [...CORPUS_TRUTHY_WRITERS.keys()].filter((f) => f.startsWith(objective.prefix));
      if (matching.length > 0) return null;
      return `waits on every corpus flag under "${objective.prefix}", and the corpus writes none — objectiveHolds returns false for an empty set, so it can never be met`;
    }

    case "yearTurnedSinceAccepted":
      return balance.clock.yearsTotal > 1
        ? null
        : `waits for a year to turn, and balance.clock says the run is ${String(balance.clock.yearsTotal)} year(s) long`;

    case "dexIdentitiesRisen":
      return TOTAL_TAKEABLE > 0
        ? null
        : "waits for the census to grow, and the region yields no individual to enter into it";
  }
}

interface Unsatisfiable {
  quest: string;
  why: string;
  objective: QuestObjective;
}

function unsatisfiableObjectives(table: Readonly<Record<string, QuestObjective>>): Unsatisfiable[] {
  const out: Unsatisfiable[] = [];
  for (const [quest, objective] of Object.entries(table)) {
    const why = objectiveComplaint(objective);
    if (why !== null) out.push({ quest, why, objective });
  }
  return out;
}

function formatUnsatisfiable(rows: readonly Unsatisfiable[]): string {
  return [
    `${String(rows.length)} quest objective(s) name something the shipped world cannot supply. The`,
    "quest can be offered and accepted and never closed, and nothing else in the suite notices,",
    "because syncQuestFlags simply never writes the turn-in:",
    ...rows.map((r) => `  • ${r.quest} — ${JSON.stringify(r.objective)}\n      ${r.why}`),
  ].join("\n");
}

describe("GATE 2f — the objective's node, count, age and season are ones a player can meet", () => {
  it("the measured world is a measurement, not an empty set", () => {
    // Every ceiling the gate leans on has to have come back with something, or a green below means
    // "nothing was checked". This is the anti-vacuity half and it is deliberately noisy.
    expect(HOLD_CAPACITY).toBeGreaterThan(0);
    expect(SEASONS_IN_RUN).toBeGreaterThan(0);
    expect([...AGES_ROLLED].sort()).toEqual([...AGE_CLASSES].sort());
    expect([...SEASONS_LIVED].sort()).toEqual([...SEASONS].sort());
    expect(TRAVELABLE.size).toBe(content.nodes.length);
    expect(TOTAL_TAKEABLE).toBeGreaterThan(0);
    for (const node of content.nodes) {
      expect(linesAt(node.id).length, `${node.id} ships no populations`).toBeGreaterThan(0);
      expect(TAKEABLE_AT.get(node.id) ?? 0, `${node.id} yields nothing to the real catch path`).toBeGreaterThan(0);
      expect(yieldCeilingAt(node.id)).toBeGreaterThanOrEqual(TAKEABLE_AT.get(node.id) ?? 0);
    }
    expect(CORPUS_TRUTHY_WRITERS.size).toBeGreaterThan(0);
    expect(GAME_WRITTEN_FLAGS.size).toBeGreaterThan(0);
  });

  it("every shipped objective names a node, a count, an age and a season the world can supply", () => {
    const rows = unsatisfiableObjectives(QUEST_OBJECTIVES);
    expect(rows.length === 0 || formatUnsatisfiable(rows)).toBe(true);
  });

  /**
   * THE DRIVEN HALF, and the one that answers "does the mechanism work" rather than "is the row
   * plausible". Each quest is taken on at the act its own offer opens in, at the node its own giver
   * stands in, and then the objective is performed through the real verbs with every quantity
   * capped by the measured world. The real `syncQuestFlags` decides whether the turn-in landed.
   *
   * The negative half is what stops this being a tautology: the same quest, accepted and left
   * alone, must produce NOTHING. If both halves came back true the driver would be writing the
   * answer rather than earning it.
   */
  it("every quest's turn-in lands when the objective is done — and does not land when it is not", () => {
    const silent: string[] = [];
    const premature: string[] = [];
    for (const def of DEFS) {
      const objective = QUEST_OBJECTIVES[def.id];
      if (objective === undefined) continue; // section 0 reports a missing row
      if (!turnInLandsOn(def, satisfierSave(def, objective))) {
        silent.push(
          `  • ${def.id} — objective ${JSON.stringify(objective)} was PERFORMED (accepted at ${def.node}, ` +
            `act ${String(offerActOf(def))}) and syncQuestFlags still never wrote "${String(def.owedFlag)}". ` +
            `${objectiveComplaint(objective) ?? "the capacity check found nothing wrong, so the mechanism is where it broke"}`,
        );
      }
      if (turnInLandsOn(def, acceptedSave(def))) {
        premature.push(
          `  • ${def.id} — "${String(def.owedFlag)}" was written on a save that took the job on and did ` +
            "NOTHING, so the objective is satisfied by the acceptance itself",
        );
      }
    }
    const message = [
      `${String(silent.length)} quest(s) cannot be closed by a player who does exactly what they ask,`,
      `and ${String(premature.length)} close themselves the moment they are taken on:`,
      ...silent,
      ...premature,
    ].join("\n");
    expect(silent.length === 0 && premature.length === 0 ? true : message).toBe(true);
  });

  /* ── the sabotages, run against a COPY of the table so no production file moves ── */

  it("BINDS — a count above what the player can hold is reported, with the number", () => {
    const shipped = QUEST_OBJECTIVES["silk-shortage"];
    expect(shipped).toBeDefined();
    const sabotaged = { ...QUEST_OBJECTIVES, "silk-shortage": { ...(shipped as QuestObjective), count: 999 } };
    const rows = unsatisfiableObjectives(sabotaged as Readonly<Record<string, QuestObjective>>);
    expect(rows.map((r) => r.quest)).toContain("silk-shortage");
    expect(formatUnsatisfiable(rows)).toContain(String(HOLD_CAPACITY));
    // …and the shipped table is clean, so the red above is the 999 and nothing else.
    expect(unsatisfiableObjectives(QUEST_OBJECTIVES)).toEqual([]);
  });

  it("BINDS — a count above the distinct lines a node ships is reported", () => {
    const sabotaged = { ...QUEST_OBJECTIVES, "first-signs": { kind: "distinctLinesMetAt", node: "r1", count: linesAt("r1").length + 1 } };
    const rows = unsatisfiableObjectives(sabotaged as Readonly<Record<string, QuestObjective>>);
    expect(rows.map((r) => r.quest)).toContain("first-signs");
  });

  it("BINDS — a count of zero is reported, because it is true before the player moves", () => {
    const sabotaged = { ...QUEST_OBJECTIVES, "restock-the-shallows": { kind: "releasesAt", node: "r2", count: 0 } };
    expect(unsatisfiableObjectives(sabotaged as Readonly<Record<string, QuestObjective>>).map((r) => r.quest)).toContain(
      "restock-the-shallows",
    );
  });

  it("BINDS — a node data/nodes/ does not carry is reported", () => {
    const sabotaged = { ...QUEST_OBJECTIVES, "after-the-crash": { kind: "visitedSince", node: "the-eastern-stair" } };
    expect(unsatisfiableObjectives(sabotaged as Readonly<Record<string, QuestObjective>>).map((r) => r.quest)).toContain(
      "after-the-crash",
    );
  });

  it("BINDS — a prefix the corpus writes nothing under is reported", () => {
    const sabotaged = {
      ...QUEST_OBJECTIVES,
      "vellsires-trail": { kind: "everyCorpusFlagWithPrefix", prefix: "trail.cairn." },
    };
    expect(unsatisfiableObjectives(sabotaged as Readonly<Record<string, QuestObjective>>).map((r) => r.quest)).toContain(
      "vellsires-trail",
    );
  });

  it("BINDS — the driver really can fail: a sabotaged objective is not satisfiable on its own save", () => {
    // The pure check above and the driven check share nothing but the objective, so this is the
    // proof that the DRIVER — not just the capacity arithmetic — refuses an impossible row.
    const def = defOf("silk-shortage");
    const shipped = QUEST_OBJECTIVES["silk-shortage"];
    expect(shipped).toBeDefined();
    const impossible: QuestObjective = { ...(shipped as QuestObjective & { kind: "catchesAt" }), count: 999 };
    const performed = satisfierSave(def, impossible);
    expect(objectiveHolds(impossible, questWorld(performed, content, def))).toBe(false);
    // …and the same driver satisfies the shipped row on the same save shape.
    expect(objectiveHolds(shipped as QuestObjective, questWorld(satisfierSave(def, shipped as QuestObjective), content, def))).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2g — the objective goes where the copy sends the player, for what the copy asks
 * ════════════════════════════════════════════════════════════════════════════
 *
 * GATE 2f asks whether the world CAN supply the row. This asks whether the row is the errand the
 * giver actually described — the other half of the same defect, and the half that survives every
 * capacity check: `restock-the-shallows` moved from r2 to `brackwater` is perfectly satisfiable
 * and completely wrong, because Nessa says "Brackmarsh side" four times and Brackmarsh is r2.
 * Measured: that edit, and `silk-shortage` r3 → r1, and `after-the-crash` r4 → hearthollow, all
 * left the entire suite byte-identical.
 *
 * A place is admitted two ways, and both are derived:
 *   • the quest's own copy says the node's shipped display name, or
 *   • the objective is a COME-BACK shape (`visitedSince` / `returnedTo`) and the node is the giver's
 *     own — which is what "Bring it here" and "out to the eastern stair and back" mean.
 * Anything else is reported, and the shipped tree's one exception is named below with its reason.
 */

const RETURN_SHAPED: ReadonlySet<string> = new Set(["visitedSince", "returnedTo"]);

/** Node ids whose shipped display name appears in this quest's own authored copy. READ ONLY. */
function nodesNamedInCopy(questId: string): Set<string> {
  const text = questCopy(questId)
    .map((c) => c.text)
    .join("\n");
  const out = new Set<string>();
  for (const node of content.nodes) {
    const escaped = node.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(text)) out.add(node.id);
  }
  return out;
}

/**
 * The one shipped objective whose node its own copy never names, reviewed and measured.
 *
 * A row here is a decision, not a shrug, and it does not wave the node through on its own: the test
 * re-derives from `data/nodes/` that the exempted node is next door to the giver, so the exemption
 * can only ever cover a place the giver could plausibly be pointing at.
 */
const UNNAMED_OBJECTIVE_NODES: readonly { quest: string; node: string; why: string }[] = [
  {
    quest: "ferrymans-wager",
    node: "r2",
    why:
      "Sel names the water by its features — \"the channel\", \"the deep\", \"this dock\", \"the reed side\" " +
      "— and never once by the node's display name. Brackmarsh is the marsh adjacent to the node Sel " +
      "stands in, and the adjacency is re-derived below rather than taken on trust.",
  },
];

/** Numbers a quest's copy actually states. The lexicon is language, not content. */
const NUMBER_WORDS: ReadonlyMap<string, number> = new Map([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
]);

function countsStatedInCopy(questId: string): Set<number> {
  const out = new Set<number>();
  for (const { text } of questCopy(questId)) {
    for (const [word, value] of NUMBER_WORDS) {
      if (new RegExp(`\\b${word}\\b`, "i").test(text)) out.add(value);
    }
    for (const digits of text.match(/\b\d+\b/g) ?? []) out.add(Number(digits));
  }
  return out;
}

describe("GATE 2g — the objective is the errand the copy describes", () => {
  it("the name scan finds shipped place names in shipped copy", () => {
    // If no quest's copy names any node, every admission below is coming from the come-back clause
    // and the place check is decoration.
    const naming = QUEST_IDS.filter((id) => nodesNamedInCopy(id).size > 0);
    expect(naming.length).toBeGreaterThan(2);
    expect([...nodesNamedInCopy("after-the-crash")]).toContain("r4");
  });

  it("every objective's node is one the quest's own copy sends the player to", () => {
    const offenders: { quest: string; node: string }[] = [];
    const detail: string[] = [];
    for (const def of DEFS) {
      const objective = QUEST_OBJECTIVES[def.id];
      if (objective === undefined || !("node" in objective)) continue;
      const named = nodesNamedInCopy(def.id);
      if (named.has(objective.node)) continue;
      if (RETURN_SHAPED.has(objective.kind) && objective.node === def.node) continue;
      offenders.push({ quest: def.id, node: objective.node });
      detail.push(
        `  • ${def.id} — objective ${JSON.stringify(objective)} sends the player to "${objective.node}", ` +
          `and ${def.giver}'s own lines name [${[...named].join(", ") || "no node at all"}]. ` +
          `The giver stands in "${def.node}".`,
      );
    }
    const message = [
      `${String(offenders.length)} objective(s) name a place the quest's copy never sends the player to.`,
      "The copy is not the bug — the row is. G2: the line stays, the objective moves.",
      ...detail,
    ].join("\n");
    expect(
      offenders.map((o) => `${o.quest}|${o.node}`).sort(),
      message,
    ).toEqual(UNNAMED_OBJECTIVE_NODES.map((e) => `${e.quest}|${e.node}`).sort());

    // The exemption is not a blank cheque: an exempted node must be next door to its giver.
    for (const exempt of UNNAMED_OBJECTIVE_NODES) {
      const def = defOf(exempt.quest);
      expect(NODE_BY_ID.get(def.node)?.adjacency ?? [], `${exempt.quest} exempts a node the giver is not next to`).toContain(
        exempt.node,
      );
    }
  });

  it("every objective's count is a number the quest's copy actually states", () => {
    const offenders: string[] = [];
    for (const def of DEFS) {
      const objective = QUEST_OBJECTIVES[def.id];
      if (objective === undefined || !("count" in objective)) continue;
      const stated = countsStatedInCopy(def.id);
      if (stated.has(objective.count)) continue;
      offenders.push(
        `  • ${def.id} — the objective asks for ${String(objective.count)}, and the quest's own copy ` +
          `states [${[...stated].sort((a, b) => a - b).join(", ")}]. A quantity the giver never says ` +
          "is a quantity the player cannot know, whether it is reachable or not.",
      );
    }
    expect(
      offenders.length === 0 ||
        [`${String(offenders.length)} objective(s) ask for a quantity the copy never states:`, ...offenders].join("\n"),
    ).toBe(true);
  });

  it("BINDS — moving an objective to a place the copy does not name is reported", () => {
    const moved: { quest: string; node: string }[] = [];
    for (const [quest, node] of [
      ["silk-shortage", "r1"],
      ["restock-the-shallows", "brackwater"],
      ["after-the-crash", "hearthollow"],
    ] as const) {
      const shipped = QUEST_OBJECTIVES[quest];
      expect(shipped).toBeDefined();
      const sabotaged = { ...(shipped as QuestObjective), node } as QuestObjective & { node: string };
      const def = defOf(quest);
      const named = nodesNamedInCopy(quest);
      const admitted =
        named.has(sabotaged.node) || (RETURN_SHAPED.has(sabotaged.kind) && sabotaged.node === def.node);
      if (!admitted) moved.push({ quest, node });
    }
    // All three are the measured mutations that used to leave the suite byte-identical.
    expect(moved.map((m) => m.quest)).toEqual(["silk-shortage", "restock-the-shallows", "after-the-crash"]);
  });

  it("BINDS — a count the copy never states is reported", () => {
    expect(countsStatedInCopy("silk-shortage").has(3)).toBe(true);
    expect(countsStatedInCopy("silk-shortage").has(999)).toBe(false);
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
