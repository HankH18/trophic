/**
 * tests/unit/quests.test.ts — THE QUEST LAYER, DRIVEN THE WAY A PLAYER DRIVES IT.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS, and how it differs from `tests/gates/quest-layer.test.ts`
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * The gate asserts STRUCTURE: that every quest fills its three flag roles, that no turn-in comes
 * due on a save nobody has spoken on, that a deadline in the copy is a deadline in the objective.
 * It builds its states by hand because it has to — it is describing shapes.
 *
 * This file asserts the PATH. Nothing below sets a quest flag by hand. Every flag that moves is
 * moved by the same three things the game moves it with:
 *
 *   • `talkEntryFor` / `propDialogueFor` — the shipped selectors, against a real save;
 *   • `runHeadless` + `applyRunFlags` — the shipped runner, playing the entry the selector chose;
 *   • `syncQuestFlags` — the shipped tracker, run after every move exactly as `OverworldScene` runs it.
 *
 * That is the distinction the whole wave turns on. A quest can be structurally perfect and still be
 * unreachable, and four of the repairs below (`B8`, `B11`, `B13`, `H10`) are defects a hand-built
 * state cannot see because a hand-built state never has to get from the offer to the turn-in.
 *
 * ⚠ It reads `data/dialogue.json`'s line text in exactly one place — §7's proof that a finished
 * town still has something to say — and writes none of it. A parallel prose lane owns every string.
 */

import { describe, expect, it } from "vitest";

import { awardBadge } from "@core/acts";
import {
  DIALOGUE,
  externallyGrantedFlags,
  type DialogueEntry,
  type FlagValue,
} from "@core/dialogue-schema";
import { newOwnedCreature, runYearTurn } from "@core/lifecycle";
import { questDefinitions, questStage, type QuestDefinition } from "@core/quests";
import { validateContent } from "@core/schemas";
import { appendAction, deserialize, newSave, serialize, type SaveEnvelope } from "@core/save";
import type { AgeClass, Balance, Content, OwnedCreature, SpeciesLine } from "@core/types";
import {
  applyRunFlags,
  autoplayEntryFor,
  dialogueContext,
  propDialogueFor,
  runHeadless,
  talkEntryFor,
} from "@game/dialogue-runner";
import {
  QUEST_OBJECTIVES,
  dexIdentities,
  lapsedFlag,
  linesMetFlag,
  releaseCandidate,
  releaseIntoNode,
  stillOwed,
  syncQuestFlags,
} from "@game/quests";
import { liveNodeOf } from "@game/wild-battle";

const content: Content = validateContent();
const balance: Balance = content.balance;
const DEFS: readonly QuestDefinition[] = questDefinitions(DIALOGUE);

const defOf = (id: string): QuestDefinition => {
  const found = DEFS.find((d) => d.id === id);
  if (!found) throw new Error(`no quest "${id}" in the shipped corpus`);
  return found;
};

function fresh(nodeId = "hearthollow"): SaveEnvelope {
  return newSave({ seed: balance.rng.defaultSeed, currentNode: nodeId, nodes: content.nodes }, balance);
}

/** A save standing in act `act`: the opening done, plus the badges that act costs. */
function atAct(act: number, nodeId = "hearthollow"): SaveEnvelope {
  let save: SaveEnvelope = { ...fresh(nodeId), questFlags: { "story.opening.done": true } };
  for (let i = 0; i < act - 1 && i < content.gyms.length; i += 1) {
    const gym = content.gyms[i];
    if (gym) save = { ...save, ...awardBadge(save, gym.id, balance) };
  }
  return save;
}

const ORDINARY_LINES: readonly SpeciesLine[] = content.species.filter((s) => !s.ancient);
function lineAt(index: number): SpeciesLine {
  const line = ORDINARY_LINES[index % ORDINARY_LINES.length];
  if (!line) throw new Error("data/species.json ships no non-Ancient line");
  return line;
}

function creature(uid: string, age: AgeClass, line: SpeciesLine = lineAt(0)): OwnedCreature {
  return newOwnedCreature(
    { uid, lineId: line.id, age, level: balance.xp.starterLevel, caughtYear: balance.clock.startYear },
    line,
    balance,
  );
}

/* ── the three verbs a player has ────────────────────────────────────────── */

/**
 * Talk once, at a node, the way [E] does: the shipped selector picks, the shipped runner plays, the
 * flags land, the tracker runs. Returns the entry the ROOM answered with, so a test can assert what
 * the player actually heard rather than what it hoped they would.
 */
function talk(
  save: SaveEnvelope,
  nodeId: string,
  said: Set<string> = new Set(),
  pick = 0,
): { save: SaveEnvelope; entry: DialogueEntry | undefined } {
  const entry = talkEntryFor(DIALOGUE, nodeId, dialogueContext(save, content), said);
  if (!entry) return { save: syncQuestFlags(save, content), entry: undefined };
  said.add(entry.id);
  const state = runHeadless(DIALOGUE, entry.id, () => pick);
  expect(state.problem, entry.id).toBeNull();
  return { save: syncQuestFlags(applyRunFlags(save, state), content), entry };
}

/** Keep talking at a node until the entry with this id is the one the room answers, then play it. */
function talkUntil(save: SaveEnvelope, nodeId: string, entryId: string, pick = 0): SaveEnvelope {
  const said = new Set<string>();
  let next = save;
  for (let i = 0; i < DIALOGUE.entries.length; i += 1) {
    const chosen = talkEntryFor(DIALOGUE, nodeId, dialogueContext(next, content), said);
    if (!chosen) break;
    said.add(chosen.id);
    const state = runHeadless(DIALOGUE, chosen.id, () => (chosen.id === entryId ? pick : 0));
    expect(state.problem, chosen.id).toBeNull();
    next = syncQuestFlags(applyRunFlags(next, state), content);
    if (chosen.id === entryId) return next;
  }
  throw new Error(`"${entryId}" never became the room's answer at ${nodeId}`);
}

/**
 * Take one creature out of a node, exactly as `applyCatchToSave` logs it.
 *
 * `which` picks among the node's own lines. It matters for the census: a line's three age forms can
 * share ONE name (`sporantle-line` is Sporantle at J, A and E), so two ages of one line are one dex
 * identity and two lines are two — which is the shipped data's answer, not this test's.
 */
function catchAt(save: SaveEnvelope, nodeId: string, uid: string, age: AgeClass, which = 0): SaveEnvelope {
  const node = content.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`no node ${nodeId}`);
  const lines = Object.keys(node.populations);
  const lineId = lines[which % lines.length];
  if (lineId === undefined) throw new Error(`${nodeId} has no populations`);
  const line = content.species.find((s) => s.id === lineId);
  if (!line) throw new Error(`no species ${lineId}`);
  const caught = creature(uid, age, line);
  const withCreature: SaveEnvelope = { ...save, party: [...save.party, caught] };
  return syncQuestFlags(appendAction(withCreature, { t: "catch", nodeId, lineId, uid }), content);
}

/** Turn the year with the real lifecycle, then re-run the tracker as the scene does. */
function turnYear(save: SaveEnvelope): SaveEnvelope {
  const turned = runYearTurn(save, { species: content.species, balance, nodes: content.nodes });
  return syncQuestFlags({ ...save, ...turned.save }, content);
}

const isSet = (save: SaveEnvelope, key: string): boolean => save.questFlags[key] === true;

/* ════════════════════════════════════════════════════════════════════════════
 * §1 The bill the corpus hands the game
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 what the corpus is owed", () => {
  it("a fresh save owes exactly the flags the corpus reads and never writes", () => {
    expect(stillOwed(fresh())).toEqual(externallyGrantedFlags(DIALOGUE));
  });

  it("every quest the corpus declares is closable: a definition, an objective and all three roles", () => {
    for (const def of DEFS) {
      expect(QUEST_OBJECTIVES[def.id], `${def.id} has no objective row`).toBeDefined();
      expect(def.owedFlag, `${def.id} has no turn-in flag`).not.toBeNull();
      expect(def.acceptFlag, `${def.id} has no acceptance`).not.toBeNull();
      expect(def.completionFlags.length, `${def.id} has no terminal state`).toBeGreaterThan(0);
    }
  });

  it("BINDS — a value-carrying write is a record, not a completion", () => {
    // `tolm.quest.fallow.done.kept` writes `quest.fallow-field.done: true` AND
    // `quest.fallow-field.result: "kept"`. Only the first is a completion; the second is what the
    // annual re-arm in §3 deliberately leaves standing. If this ever flips, §3 dies silently.
    expect(defOf("fallow-field").completionFlags).toEqual(["quest.fallow-field.done"]);
    expect(defOf("silk-shortage").completionFlags).toEqual(["quest.silk-shortage.done"]);
  });

  /*
   * BINDS `core/quests.ts`'s role resolution to the corpus's FILE ORDER.
   *
   * Every candidate set on the shipped corpus is a singleton, so `[...set][0]` and
   * `[...set].sort()[0]` agree on every present answer — which is exactly why the alphabet
   * survived in that file behind a comment saying it had been removed. No assertion over the
   * SHIPPED corpus can tell the two apart. The only way to bind it is to build a corpus where
   * file order and the alphabet disagree, and both cases below are ones the corpus is expected
   * to grow: a lapse the game records (`.lapsed` < `.taken`) and an ending the game computes
   * (`.complete` < `.milestone`).
   *
   * Under the alphabet each of these silently moves a role onto the NEW key, `syncQuestFlags`
   * stops writing the quest's real turn-in, and every other test stays green.
   */
  it("BINDS — a later variant cannot steal a role from the entry that authored it first", () => {
    const after = (id: string, extra: Partial<DialogueEntry>): typeof DIALOGUE => {
      const at = DIALOGUE.entries.findIndex((e) => e.id === id);
      expect(at, `${id} is not in the corpus`).toBeGreaterThanOrEqual(0);
      const anchor = DIALOGUE.entries[at]!;
      const added = {
        speaker: anchor.speaker,
        node: anchor.node,
        kind: "quest",
        priority: 55,
        lines: [{ text: "…" }],
        ...extra,
      } as DialogueEntry;
      return {
        ...DIALOGUE,
        entries: [...DIALOGUE.entries.slice(0, at + 1), added, ...DIALOGUE.entries.slice(at + 1)],
      };
    };

    // A lapse the game records. "lapsed" < "taken", so the alphabet moves ACCEPTANCE onto a key
    // that is only ever written `false` — the wager could then never be accepted or turned in.
    const withLapse = after("sel.quest.wager.accepted", {
      id: "audit.wager.lapsed",
      quest: "ferrymans-wager",
      when: { flagsSet: ["quest.ferrymans-wager.lapsed"] },
      setFlags: { "quest.ferrymans-wager.lapsed": false },
    });
    const wager = questDefinitions(withLapse).find((d) => d.id === "ferrymans-wager")!;
    expect(wager.acceptFlag).toBe("quest.ferrymans-wager.taken");
    expect(wager.owedFlag).toBe("quest.ferrymans-wager.turnin");

    // An ending the game computes. "complete" < "milestone", so the alphabet moves the TURN-IN —
    // and `completionFlags` is derived from `owedFlag`, so the census loses its terminal state too.
    const censusLast = DIALOGUE.entries.filter((e) => e.quest === "star-census").at(-1)!;
    const withEnding = after(censusLast.id, {
      id: "audit.census.complete",
      quest: "star-census",
      when: { flagsSet: ["quest.star-census.complete"] },
    });
    const census = questDefinitions(withEnding).find((d) => d.id === "star-census")!;
    expect(census.owedFlag).toBe("quest.star-census.milestone");
    expect(census.completionFlags).toEqual(defOf("star-census").completionFlags);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 Ferryman's Wager — a deadline that was in three lines of copy and no code
 * ════════════════════════════════════════════════════════════════════════════ */

/** Accept the wager the way a player does: hear Sel out and take the first choice. */
function takeTheWager(): SaveEnvelope {
  const save = talkUntil(atAct(2, "brackwater"), "brackwater", "sel.quest.wager.offer", 0);
  expect(isSet(save, "quest.ferrymans-wager.taken")).toBe(true);
  return save;
}

describe("§2 Ferryman's Wager", () => {
  it("an Elder that aged on the bench does not close it — the starter used to", () => {
    // bible §9's push-your-luck showcase, closed from anywhere in the region by the player's own
    // first creature reaching its third year. The party holds an Elder and the tape is empty.
    let save = takeTheWager();
    save = syncQuestFlags({ ...save, party: [...save.party, creature("bench-elder", "E")] }, content);
    expect(save.questFlags["quest.ferrymans-wager.turnin"]).toBeUndefined();
  });

  it("an Elder taken out of the marsh in the year it was wagered closes it", () => {
    let save = takeTheWager();
    save = catchAt(save, "r2", "channel-elder", "E");
    expect(isSet(save, "quest.ferrymans-wager.turnin")).toBe(true);

    // …and the giver's own line is what writes `.done`, exactly as authored.
    save = talkUntil(save, "brackwater", "sel.quest.wager.done");
    expect(isSet(save, "quest.ferrymans-wager.done")).toBe(true);
  });

  it("the same Elder, taken after the year turned, does not — the window is shut", () => {
    let save = takeTheWager();
    save = turnYear(save);
    save = catchAt(save, "r2", "late-elder", "E");
    expect(save.questFlags["quest.ferrymans-wager.turnin"]).toBeUndefined();
  });

  it("BINDS — the same catch in the same year DOES close it, so the deadline is the only difference", () => {
    const save = catchAt(takeTheWager(), "r2", "in-time", "E");
    expect(isSet(save, "quest.ferrymans-wager.turnin")).toBe(true);
  });

  it("a lapse re-opens the offer and still reaches Undermere step 4", () => {
    let save = takeTheWager();
    const acceptedAt = save.questFlags["quest.ferrymans-wager.acceptedAt"];
    expect(typeof acceptedAt).toBe("number");

    // The year turns on an unmet wager.
    save = turnYear(save);
    expect(isSet(save, lapsedFlag("ferrymans-wager"))).toBe(true);
    expect(save.questFlags["quest.ferrymans-wager.taken"]).toBeUndefined();
    expect(save.questFlags["quest.ferrymans-wager.acceptedAt"]).toBeUndefined();
    expect(questStage(defOf("ferrymans-wager"), save.questFlags)).toBe("unoffered");

    // ⚠ THE REASON CLEARING IS MANDATORY: `chain.undermere.step4` gates on this quest's `.done`,
    // so a lapse that could not be retried would dead-end the Undermere chain and its Ancient.
    save = talkUntil(save, "brackwater", "sel.quest.wager.offer", 0);
    expect(isSet(save, "quest.ferrymans-wager.taken")).toBe(true);
    save = catchAt(save, "r2", "second-try", "E");
    save = talkUntil(save, "brackwater", "sel.quest.wager.done");
    expect(isSet(save, "quest.ferrymans-wager.done")).toBe(true);

    const tale3 = DIALOGUE.entries.find((e) => e.id === "sel.tale.3");
    expect(tale3?.when?.flagsSet).toContain("quest.ferrymans-wager.done");
  });

  it("does not lapse in the year it was taken, however many ticks are spent", () => {
    const save = syncQuestFlags({ ...takeTheWager(), tick: balance.clock.ticksPerSeason }, content);
    expect(save.questFlags[lapsedFlag("ferrymans-wager")]).toBeUndefined();
    expect(isSet(save, "quest.ferrymans-wager.taken")).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 The Fallow Field — an annual arrangement its own flags forbade
 * ════════════════════════════════════════════════════════════════════════════ */

/** Play the whole arrangement once, from Tolm's offer to whichever ending the count produces. */
function settleTheField(from: SaveEnvelope): SaveEnvelope {
  let save = talkUntil(from, "hearthollow", "tolm.quest.fallow.offer", 0);
  expect(isSet(save, "quest.fallow-field.taken")).toBe(true);
  save = turnYear(save);
  expect(isSet(save, "quest.fallow-field.turnin")).toBe(true);

  const said = new Set<string>();
  for (let i = 0; i < DIALOGUE.entries.length; i += 1) {
    const step = talk(save, "hearthollow", said);
    save = step.save;
    if (step.entry === undefined) break;
    if (isSet(save, "quest.fallow-field.done")) return save;
  }
  throw new Error("the field never settled");
}

describe("§3 The Fallow Field", () => {
  it("settles, remembers HOW it settled, and comes round the year after — which it could not", () => {
    let save = settleTheField(atAct(1));
    const result = save.questFlags["quest.fallow-field.result"];
    expect(typeof result).toBe("string");
    expect(questStage(defOf("fallow-field"), save.questFlags)).toBe("done");

    // The settlement year is stamped, and nothing moves until the calendar does.
    save = syncQuestFlags(save, content);
    expect(isSet(save, "quest.fallow-field.done")).toBe(true);

    save = turnYear(save);
    expect(save.questFlags["quest.fallow-field.done"]).toBeUndefined();
    expect(save.questFlags["quest.fallow-field.taken"]).toBeUndefined();
    expect(save.questFlags["quest.fallow-field.turnin"]).toBeUndefined();
    // The one thing the re-arm keeps: how last year went. It is the only place in 499 lines a
    // quest outcome is remembered, and the re-offer variants are authored against it.
    expect(save.questFlags["quest.fallow-field.result"]).toBe(result);

    // And the offer is the room's answer again.
    const again = talkEntryFor(DIALOGUE, "hearthollow", dialogueContext(save, content), new Set());
    expect(again?.quest).toBe("fallow-field");
  });

  it("the re-arm is edged on the year turn, not standing: a second settlement takes another year", () => {
    let save = settleTheField(atAct(1));
    // Two syncs in the settlement year change nothing — this is the trap RUN_COMPLETE_SHOWN_FLAG
    // exists for, and `syncQuestFlags` runs on every save move.
    const twice = syncQuestFlags(syncQuestFlags(save, content), content);
    expect(twice.questFlags).toEqual(syncQuestFlags(save, content).questFlags);
    expect(isSet(twice, "quest.fallow-field.done")).toBe(true);

    save = turnYear(twice);
    expect(save.questFlags["quest.fallow-field.done"]).toBeUndefined();
    save = settleTheField(save);
    expect(isSet(save, "quest.fallow-field.done")).toBe(true);
  });

  it("BINDS — no other quest re-arms: a finished one stays finished across a year turn", () => {
    let save = talkUntil(atAct(2, "brackwater"), "brackwater", "sel.quest.wager.offer", 0);
    save = catchAt(save, "r2", "held", "E");
    save = talkUntil(save, "brackwater", "sel.quest.wager.done");
    expect(isSet(save, "quest.ferrymans-wager.done")).toBe(true);
    save = turnYear(turnYear(save));
    expect(isSet(save, "quest.ferrymans-wager.done")).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4 Forge a Legacy — the only quest on the never-cut LEGACY beat
 * ════════════════════════════════════════════════════════════════════════════ */

function retire(save: SaveEnvelope): SaveEnvelope {
  return syncQuestFlags(
    appendAction(save, {
      t: "retirement",
      choice: { kind: "boon", parentUid: "elder", targetUid: "heir", stat: "atk" },
    }),
    content,
  );
}

describe("§4 Forge a Legacy", () => {
  it("does not turn itself in on the first retirement anywhere in the region", () => {
    const save = retire(atAct(4, "cindershelf"));
    expect(isSet(save, "lifecycle.first-retirement")).toBe(true);
    expect(save.questFlags["quest.forge-a-legacy.turnin"]).toBeUndefined();
    expect(questStage(defOf("forge-a-legacy"), save.questFlags)).toBe("unoffered");
  });

  it("the player hears the ask BEFORE the thank-you", () => {
    let save = retire(atAct(4, "cindershelf"));

    // The room's first quest answer at Cindershelf must be the offer, not `bram.quest.forge.done`.
    const said = new Set<string>();
    let heardOffer = false;
    for (let i = 0; i < DIALOGUE.entries.length; i += 1) {
      const step = talk(save, "cindershelf", said);
      save = step.save;
      if (step.entry === undefined) break;
      if (step.entry.id === "bram.quest.forge.offer") {
        heardOffer = true;
        break;
      }
      expect(step.entry.id, "the thank-you was reached before the ask").not.toBe("bram.quest.forge.done");
    }
    expect(heardOffer, "Bram never asked").toBe(true);
    expect(isSet(save, "quest.forge-a-legacy.taken")).toBe(true);

    /*
     * ⚠ THIS TAIL USED TO GO STRAIGHT TO `talkUntil(…, "bram.quest.forge.done")` WITH NOTHING IN
     * BETWEEN, and it passed — which is the whole defect, asserted as the contract. The objective
     * was `{kind: "flagSet", flag: lifecycle.first-retirement}`, the same flag the OFFER gates on,
     * so the turn-in came due in the `syncQuestFlags` call immediately after the offer and the
     * quest closed in two consecutive [E] presses at Cindershelf. The ordering half of this test
     * (ask before thank-you) was right and is untouched; what was missing was any requirement that
     * the player DO the thing.
     *
     * So the offer's own copy is now driven: "Bring it here and I'll set it." Nothing is set by
     * hand — a travel is appended to the action tape exactly as the overworld appends it, and the
     * real tracker reads it.
     */
    const beforeTravel = syncQuestFlags(save, content);
    expect(
      beforeTravel.questFlags["quest.forge-a-legacy.turnin"],
      "the turn-in came due without the player going anywhere",
    ).toBeUndefined();

    save = appendAction(save, { t: "travel", to: "r4" });
    save = appendAction(save, { t: "travel", to: "cindershelf" });

    save = talkUntil(save, "cindershelf", "bram.quest.forge.done");
    expect(isSet(save, "quest.forge-a-legacy.done")).toBe(true);
  });

  it("BINDS — with no retirement anywhere, Bram never asks", () => {
    const save = syncQuestFlags(atAct(4, "cindershelf"), content);
    expect(save.questFlags["lifecycle.first-retirement"]).toBeUndefined();
    const offer = DIALOGUE.entries.find((e) => e.id === "bram.quest.forge.offer");
    expect(offer?.when?.flagsSet).toContain("lifecycle.first-retirement");
    expect(save.questFlags["quest.forge-a-legacy.taken"]).toBeUndefined();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §5 The Star Census — one milestone, ever
 * ════════════════════════════════════════════════════════════════════════════ */

/** Grow the census by one identity, the way a catch does. */
function enterOneIdentity(save: SaveEnvelope, index: number): SaveEnvelope {
  const line = lineAt(index);
  return syncQuestFlags({ ...save, party: [...save.party, creature(`dex-${String(index)}`, "J", line)] }, content);
}

/** Hear Ives out, and collect the plate the first identity owes. Leaves the census level. */
function openTheCensus(): SaveEnvelope {
  let save = talkUntil(enterOneIdentity(atAct(5, "duskhollow"), 0), "duskhollow", "ives.quest.census.offer");
  expect(isSet(save, "quest.star-census.offered")).toBe(true);
  // The standing offer owes a plate the moment the observatory has a census to read at all.
  expect(isSet(save, "quest.star-census.milestone"), "no first plate").toBe(true);
  save = talkUntil(save, "duskhollow", "ives.quest.census.milestone");
  expect(save.questFlags["quest.star-census.milestone"], "the plate was not consumed").toBeUndefined();
  expect(save.questFlags["quest.star-census.paid"], "the receipt was not consumed").toBeUndefined();
  return save;
}

describe("§5 The Star Census", () => {
  it("pays a plate for the SECOND rise as well as the first", () => {
    let save = openTheCensus();

    // The census grows again. THIS is the assertion that failed before the pump existed: the
    // re-arm write in `syncQuestFlags` was dead because nothing ever cleared the owed flag, so the
    // census paid exactly one milestone for the whole run.
    save = enterOneIdentity(save, 1);
    expect(isSet(save, "quest.star-census.milestone"), "no second plate").toBe(true);

    // …and a third, once collected and grown again. A loop, not a one-shot.
    save = talkUntil(save, "duskhollow", "ives.quest.census.milestone");
    save = enterOneIdentity(save, 2);
    expect(isSet(save, "quest.star-census.milestone"), "no third plate").toBe(true);
  });

  it("does not pay twice for the same census", () => {
    const save = syncQuestFlags(syncQuestFlags(openTheCensus(), content), content);
    expect(save.questFlags["quest.star-census.milestone"]).toBeUndefined();
  });

  it("BINDS — the milestone entry is what the room answers with while a plate is owed", () => {
    const save = enterOneIdentity(openTheCensus(), 1);
    const answer = talkEntryFor(DIALOGUE, "duskhollow", dialogueContext(save, content), new Set());
    expect(answer?.id).toBe("ives.quest.census.milestone");
  });

  it("and goes quiet the moment the plate is in hand", () => {
    const save = openTheCensus();
    const answer = talkEntryFor(DIALOGUE, "duskhollow", dialogueContext(save, content), new Set());
    expect(answer?.id).not.toBe("ives.quest.census.milestone");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §6 The dex does not shrink when the player does what the game teaches
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§6 the dex is a record, not a shelf", () => {
  it("a release does not cost an identity", () => {
    let save = atAct(2, "brackwater");
    save = catchAt(save, "r2", "keep", "J", 0);
    save = catchAt(save, "r2", "give-back", "A", 1);
    const before = dexIdentities(save, content);
    expect(before).toBeGreaterThan(1);

    const applied = releaseIntoNode(save, content, "give-back", "r2");
    expect(applied.problem).toBeNull();
    save = syncQuestFlags(applied.save, content);

    expect(save.party.some((c) => c.uid === "give-back")).toBe(false);
    expect(dexIdentities(save, content)).toBe(before);
  });

  it("Restock the Shallows' four releases cost the census nothing", () => {
    // Two never-cut systems used to contradict: the quest asks for four releases and each one
    // decremented the census the observatory pays for.
    let save = atAct(2, "brackwater");
    for (let i = 0; i < 4; i += 1) save = catchAt(save, "r2", `put-back-${String(i)}`, "A", i);
    const before = dexIdentities(save, content);
    expect(before).toBeGreaterThan(3);

    for (let i = 0; i < 4; i += 1) {
      const applied = releaseIntoNode(save, content, `put-back-${String(i)}`, "r2");
      expect(applied.problem).toBeNull();
      save = syncQuestFlags(applied.save, content);
    }
    expect(dexIdentities(save, content)).toBe(before);
  });

  it("BINDS — the release verb really moved the world: the node count falls by one and survives a reload", () => {
    let save = atAct(2, "brackwater");
    save = catchAt(save, "r2", "one", "J");
    save = catchAt(save, "r2", "two", "J");
    const candidate = releaseCandidate(save);
    expect(candidate).not.toBeNull();

    const applied = releaseIntoNode(save, content, String(candidate?.uid), "r2");
    expect(applied.problem).toBeNull();
    expect(applied.after).toBe(applied.before + 1);

    const reloaded = deserialize(serialize(applied.save), balance);
    const line = String(candidate?.lineId);
    expect(liveNodeOf(content, reloaded, "r2").populations[line]?.count).toBe(applied.after);
  });

  it("the census never falls across a year turn either", () => {
    let save = atAct(2, "brackwater");
    save = catchAt(save, "r2", "ager", "E");
    const before = dexIdentities(save, content);
    save = turnYear(save);
    expect(dexIdentities(save, content)).toBeGreaterThanOrEqual(before);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §7 A finished quest stops being the town's voice
 * ════════════════════════════════════════════════════════════════════════════ */

/** Everything the corpus can write, so a "finished" save is finished the way the corpus finishes it. */
function finished(def: QuestDefinition): SaveEnvelope {
  const offer = DIALOGUE.entries.find((e) => e.quest === def.id);
  const act = offer?.when?.actMin ?? 1;
  const flags: Record<string, FlagValue> = {};
  if (def.acceptFlag !== null) flags[def.acceptFlag] = true;
  if (def.owedFlag !== null) flags[def.owedFlag] = true;
  for (const f of def.completionFlags) flags[f] = true;
  const base = atAct(Math.max(act, 1), def.node);
  return { ...base, questFlags: { ...base.questFlags, ...flags } };
}

describe("§7 a finished quest's thank-you does not become the town's greeting", () => {
  it("no giver's completion line is still eligible after it has fired", () => {
    for (const def of DEFS) {
      const save = finished(def);
      const ctx = dialogueContext(save, content);
      const answer = talkEntryFor(DIALOGUE, def.node, ctx, new Set());
      const turnIns = DIALOGUE.entries
        .filter((e) => e.quest === def.id && (e.when?.flagsSet ?? []).includes(String(def.owedFlag)))
        .map((e) => e.id);
      expect(turnIns.length, `${def.id} has no turn-in entry`).toBeGreaterThan(0);
      expect(turnIns, `${def.id}: ${String(answer?.id)} still answers the room`).not.toContain(answer?.id);
    }
  });

  it("and the town is not silenced by the closing: every giver's node still answers", () => {
    // The failure mode the fix could have introduced. `talkEntryFor` walks quest FIRST, so closing
    // a quest's entries hands the room to lore/service/greeting — and a room with nothing left
    // would be a worse bug than the one being fixed.
    for (const def of DEFS) {
      const answer = talkEntryFor(DIALOGUE, def.node, dialogueContext(finished(def), content), new Set());
      expect(answer, `${def.node} went silent once ${def.id} finished`).toBeDefined();
      expect(answer?.lines.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("BINDS — before the turn-in, the completion line IS what the room answers", () => {
    // Proves the probe above is asking a live question rather than a dead one.
    const def = defOf("first-signs");
    const base = finished(def);
    const owed: Record<string, FlagValue> = { ...base.questFlags };
    for (const f of def.completionFlags) delete owed[f];
    const answer = talkEntryFor(DIALOGUE, def.node, dialogueContext({ ...base, questFlags: owed }, content), new Set());
    expect(answer?.id).toBe("maren.quest.first-signs.done");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §8 Vellsire's Trail — Orrin's hand-off, made true
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * A PLAYER at the top of the badge ladder, walking the whole region: reading every prop it has not
 * read and talking to every room that still has something new to say, with `syncQuestFlags` after
 * each — which is `OverworldScene`'s own loop. Returns when nothing new is left.
 *
 * Nothing is seeded but the two things a player earns by FORAGING rather than by speaking: the sign
 * cards on Meadow Reach, which is what *First Signs* counts.
 */
function walkTheRegion(): SaveEnvelope {
  let save: SaveEnvelope = atAct(content.gyms.length + 1, "hearthollow");
  const r1 = content.nodes.find((n) => n.id === "r1");
  save = {
    ...save,
    questFlags: { ...save.questFlags, [linesMetFlag("r1")]: Object.keys(r1?.populations ?? {}).join(" ") },
  };
  save = syncQuestFlags(save, content);

  const read = new Set<string>();
  const budget = DIALOGUE.entries.length * 3;
  for (let i = 0; i < budget; i += 1) {
    let next: DialogueEntry | undefined;
    for (const node of content.nodes) {
      const ctx = dialogueContext(save, content);
      // A cutscene plays ITSELF on arrival, which is how the survey tutorial hands out
      // `quest.first-signs.offered` — the flag the whole Vellsire chain hangs off.
      const scene = autoplayEntryFor(DIALOGUE, node.id, ctx);
      if (scene && !read.has(scene.id)) next = scene;
      if (next) break;
      for (const prop of node.props) {
        const entry = propDialogueFor(DIALOGUE, prop.id, node.id, ctx);
        if (entry && !read.has(entry.id)) {
          next = entry;
          break;
        }
      }
      if (next) break;
      const talkable = talkEntryFor(DIALOGUE, node.id, ctx, read);
      if (talkable && !read.has(talkable.id)) next = talkable;
      if (next) break;
    }
    if (!next) break;
    read.add(next.id);
    const state = runHeadless(DIALOGUE, next.id);
    expect(state.problem, next.id).toBeNull();
    save = syncQuestFlags(applyRunFlags(save, state), content);
  }
  return save;
}

describe("§8 Vellsire's Trail feeds the chain it belongs to", () => {
  it("all six antler stones close the quest, and the quest is what opens Maren's last keystone", () => {
    // Every stone is read through the shipped prop selector and every quest flag is written by the
    // shipped tracker; no `trail.stone.*`, `quest.vellsires-trail.*` or `chain.vellsire.*` flag is
    // set by hand anywhere in this test.
    const save = walkTheRegion();

    const stones = [...new Set(DIALOGUE.entries.flatMap((e) => Object.keys(e.setFlags ?? {})))].filter((f) =>
      f.startsWith("trail.stone."),
    );
    expect(stones.length).toBeGreaterThan(0);
    for (const stone of stones) expect(isSet(save, stone), `${stone} was never read`).toBe(true);

    expect(isSet(save, "quest.vellsires-trail.taken"), "Orrin's offer was never taken").toBe(true);
    expect(isSet(save, "quest.vellsires-trail.turnin"), "six stones did not close the trail").toBe(true);
    expect(isSet(save, "quest.vellsires-trail.done"), "Orrin never took the file").toBe(true);

    // …and the chain's last keystone fired only after that turn-in. Before this clause the
    // eleven-step chain's payoff was reachable with the quest that points at it untouched.
    expect(isSet(save, "chain.vellsire.complete"), "the chain never completed").toBe(true);
  });

  it("BINDS — Maren's last keystone refuses to fire while Orrin's turn-in is unheard", () => {
    const keystone = DIALOGUE.entries.find((e) => e.id === "maren.keystone.6");
    expect(keystone?.when?.flagsSet).toContain("quest.vellsires-trail.done");
    const save: SaveEnvelope = {
      ...atAct(content.gyms.length + 1, "sanctum-approach"),
      questFlags: { "story.opening.done": true, "chain.vellsire.step9": true },
    };
    const answer = talkEntryFor(DIALOGUE, "sanctum-approach", dialogueContext(save, content), new Set());
    expect(answer?.id).not.toBe("maren.keystone.6");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §9 The tracker's own properties, across every new branch
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§9 syncQuestFlags", () => {
  it("is idempotent on a save carrying a settled field, a collected plate and a lapsed wager", () => {
    let save = settleTheField(atAct(5, "hearthollow"));
    save = talkUntil(enterOneIdentity({ ...save, currentNode: "duskhollow" }, 0), "duskhollow", "ives.quest.census.offer");
    save = enterOneIdentity(save, 1);
    save = talkUntil(save, "duskhollow", "ives.quest.census.milestone");
    save = talkUntil({ ...save, currentNode: "brackwater" }, "brackwater", "sel.quest.wager.offer", 0);
    save = turnYear(save);

    const once = syncQuestFlags(save, content);
    const twice = syncQuestFlags(once, content);
    expect(twice.questFlags).toEqual(once.questFlags);
  });

  it("writes no turn-in for a quest whose acceptance the player never gave", () => {
    // A save that has DONE everything and SAID nothing: badges, a full party, a tape of catches,
    // releases, travels and a retirement — and not one flag any dialogue entry ever wrote.
    let save: SaveEnvelope = { ...atAct(content.gyms.length + 1), party: [creature("j", "J"), creature("a", "A")] };
    for (const node of content.nodes) {
      save = appendAction(save, { t: "travel", to: node.id });
      save = { ...save, questFlags: { ...save.questFlags, [linesMetFlag(node.id)]: Object.keys(node.populations).join(" ") } };
    }
    save = retire(save);
    for (let i = 0; i < 4; i += 1) save = catchAt(save, "r2", `x${String(i)}`, "A");

    const after = syncQuestFlags(save, content);
    for (const def of DEFS) {
      expect(after.questFlags[String(def.owedFlag)], `${def.id} closed itself`).toBeUndefined();
    }
  });
});
