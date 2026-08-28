/**
 * tests/unit/starter-choice.test.ts — THE STARTER CHOICE, MADE REAL.
 *
 * ⚠ WHAT THIS FILE EXISTS TO STOP, MEASURED THROUGH THE REAL NEW-GAME PATH BEFORE THE FIX:
 *
 *     party after startNewGame: [{"uid":"provisional-starter","lineId":"cindril-line"}]
 *     branch 0 "I'll take the Cindril."  → story.starter=cindril-line  · party [=cindril-line]
 *     branch 1 "I'll take the Puddlisk." → story.starter=puddlisk-line · party [=cindril-line]
 *     branch 2 "I'll take the Thornlet." → story.starter=thornlet-line · party [=cindril-line]
 *
 * `data/dialogue.json`'s three `maren.starter.*` branches each wrote `story.starter`, and that flag
 * had NO READER anywhere in `game/` or `core/` — only the corpus and four tests mentioned it. Every
 * player walked out of Hearthollow with the FIRST starter line in `data/species.json` order,
 * whatever they picked, because `game/boot.ts` `startingParty` seeds
 * `game/wild-battle.ts` `provisionalStarter` and nothing ever revised it. build-doc §1's second
 * never-cut beat is the legacy one — "the starter retires before the league; its heir fights the
 * finale" — so the animal that retires was chosen by data order rather than by the player, and the
 * opening's one decision was decoration.
 *
 * THE RIG IS THE GAME, NOT A FIXTURE. Every save here comes out of `game/boot.ts` `startNewGame`,
 * the corpus is the shipped `DIALOGUE`, the entry is whichever cutscene `autoplayEntryFor` says is
 * playing at the start node, and the two writes are `applyRunFlags` then `applyRunGrants` — the
 * pair `game/scenes/OverworldScene.ts` `finishDialogue` makes, called with the two arguments the
 * scene passes it. No species id, no line id, no entry id and no branch count is typed into this
 * file (G2): they are all read off `data/` and asserted non-vacuous first.
 */

import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DialogueEntry } from "../../core/dialogue-schema";
import { validateContent } from "../../core/schemas";
import {
  MemoryStorage,
  applyStarterChoice,
  canonicalStringify,
  deserialize,
  replay,
  serialize,
  SaveCorruptError,
  type SaveEnvelope,
} from "../../core/save";
import { newOwnedCreature } from "../../core/lifecycle";
import type { Balance, Content, OwnedCreature, SpeciesLine } from "../../core/types";
import { startNewGame } from "../../game/boot";
import { registry } from "../../game/registry";
import {
  DIALOGUE,
  STARTER_FLAG,
  applyRunFlags,
  applyRunGrants,
  applyRunStarter,
  autoplayEntryFor,
  dialogueContext,
  runHeadless,
  type DialogueRunState,
} from "../../game/dialogue-runner";
import { starterLines } from "../../game/wild-battle";

const content: Content = validateContent();
const balance: Balance = content.balance;

/* ────────────────────────────────────────────────────────────────────────────
 * The rig — the real new-game path, and the corpus's own opening beat
 * ──────────────────────────────────────────────────────────────────────────── */

/** A brand-new run, seeded by `game/boot.ts` exactly as the NEW GAME row does. */
function newRun(): SaveEnvelope {
  registry.setContent(content);
  registry.setStorage(new MemoryStorage());
  const started = startNewGame({ slot: 0, seed: balance.rng.defaultSeed });
  expect(started.ok, started.error ?? "startNewGame refused").toBe(true);
  return registry.save();
}

/** The cutscene the overworld autoplays at the node a new run begins in. */
function openingBeat(save: SaveEnvelope): DialogueEntry {
  const entry = autoplayEntryFor(DIALOGUE, save.currentNode, dialogueContext(save, content));
  expect(entry, `no autoplay cutscene at "${save.currentNode}" — the opening beat is unreachable`)
    .toBeDefined();
  return entry as DialogueEntry;
}

/** Play the opening chain answering its choices with branch `index`, as a player at the box would. */
function playBranch(save: SaveEnvelope, index: number): DialogueRunState {
  const state = runHeadless(DIALOGUE, openingBeat(save).id, () => index);
  expect(state.finished).toBe(true);
  expect(state.problem).toBeNull();
  return state;
}

/**
 * THE TWO WRITES `OverworldScene.finishDialogue` MAKES, in its order and with its arity.
 *
 * `applyRunGrants(save, state)` — two arguments, no content — is the call the scene actually makes
 * (asserted against the scene's source in §0), so the content this path needs has to come from
 * `game/registry.ts`, which is where `BootScene` puts it. Passing content here would prove the
 * wiring works in a shape the game never uses.
 */
function finishDialogueWrites(save: SaveEnvelope, state: DialogueRunState): SaveEnvelope {
  return applyRunGrants(applyRunFlags(save, state), state);
}

const STARTER_LINES: readonly SpeciesLine[] = starterLines(content);
const STARTER_LINE_IDS: ReadonlySet<string> = new Set(STARTER_LINES.map((l) => l.id));

/** The creature a save is holding out of the starter lines — the one the choice re-lines. */
function heldStarter(save: SaveEnvelope): OwnedCreature {
  const found = save.party.find((c) => STARTER_LINE_IDS.has(c.lineId));
  expect(found, "the run holds no starter-line creature — the rig is broken, not the code")
    .toBeDefined();
  return found as OwnedCreature;
}

const REPLAY_DEPS = {
  gyms: content.gyms,
  species: content.species,
  balance,
  nodes: content.nodes,
};

let consoleErrors: string[];
let consoleWarns: string[];

beforeEach(() => {
  consoleErrors = [];
  consoleWarns = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    consoleWarns.push(args.map(String).join(" "));
  });
  // `startingParty` announces the stand-in on `console.info`; left unmuted it prints once per run.
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ════════════════════════════════════════════════════════════════════════════
 * §0 The rig — every section below is vacuous if one of these is false
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§0 the rig", () => {
  it("the corpus's opening beat offers a real choice between distinct starter lines", () => {
    const save = newRun();
    const opening = openingBeat(save);
    const choices = opening.choices ?? [];
    expect(choices.length, `"${opening.id}" offers no choice — there is no starter to choose`)
      .toBeGreaterThan(1);

    const picked = choices.map((_c, i) => playBranch(save, i).flags[STARTER_FLAG]);
    // Every branch names a line, they are not all the same line, and each one is a line
    // `data/species.json` actually carries and marks with the "starter" habitat sentinel.
    for (const [i, lineId] of picked.entries()) {
      expect(typeof lineId, `branch ${String(i)} writes no ${STARTER_FLAG}`).toBe("string");
      expect(STARTER_LINE_IDS, `branch ${String(i)} names "${String(lineId)}"`)
        .toContain(lineId as string);
    }
    expect(new Set(picked).size, "the branches all name the same starter").toBe(choices.length);
  });

  it("a new run is seeded with exactly one starter-line creature, and no logged action yet", () => {
    const save = newRun();
    expect(save.party.filter((c) => STARTER_LINE_IDS.has(c.lineId))).toHaveLength(1);
    /*
     * ⚠ THE FACT THE WHOLE DESIGN RESTS ON. `core/types.ts` `GameAction` carries no `starter`
     * member, so the choice cannot go on the tape — and what keeps L10 true anyway is that the
     * opening cutscene is eligible at the node a new run begins in, BEFORE a single action has been
     * logged. The save the choice re-lines is therefore still the run's INITIAL save, the one
     * `replay` is handed. If this ever stops being true, `applyRunStarter` says so at
     * `console.error` and §4 is the section that binds it.
     */
    expect(save.actionLog).toHaveLength(0);
    expect(openingBeat(save).id).toBeTruthy();
  });

  it("the scene really does route its dialogue writes through applyRunGrants", () => {
    /*
     * The one thing a headless rig cannot show by running: that `OverworldScene.finishDialogue` is
     * the caller, with this arity. Read off the scene's source rather than asserted about a copy of
     * it — if the seam moves, the sections below stop being evidence about the game and this line
     * is what says so.
     */
    const scene = readFileSync("game/scenes/OverworldScene.ts", "utf8");
    expect(scene).toContain("applyRunFlags(this.save, state)");
    expect(scene).toContain("applyRunGrants(this.save, state)");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §1 THE DEFECT — the party's line is the line the player chose
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 every branch hands over the starter it names", () => {
  it("the party's creature line equals story.starter, for EVERY authored branch", () => {
    const save = newRun();
    const choices = openingBeat(save).choices ?? [];

    for (const [index, choice] of choices.entries()) {
      const state = playBranch(save, index);
      const chosen = state.flags[STARTER_FLAG] as string;
      const after = finishDialogueWrites(save, state);

      expect(after.party.map((c) => c.lineId), `"${choice.text}"`).toContain(chosen);
      expect(heldStarter(after).lineId, `"${choice.text}" left the player holding the wrong animal`)
        .toBe(chosen);
      // …and the flag on the SAVE agrees with the creature, not just the run state.
      expect(after.questFlags[STARTER_FLAG]).toBe(chosen);
    }
  });

  it("the slot is re-lined, not duplicated — one creature in, one creature out", () => {
    const save = newRun();
    const before = heldStarter(save);
    const choices = openingBeat(save).choices ?? [];

    for (const [index] of choices.entries()) {
      const after = finishDialogueWrites(save, playBranch(save, index));
      expect(after.party).toHaveLength(save.party.length);
      expect(after.box).toEqual(save.box);
      // The uid survives, so nothing that already referred to the player's first creature is stale.
      expect(after.party.map((c) => c.uid)).toEqual(save.party.map((c) => c.uid));
      expect(heldStarter(after).uid).toBe(before.uid);
    }
  });

  it("what the line DERIVES is rebuilt, not carried over from the stand-in", () => {
    /*
     * `yearsRemaining` and `projectedRetirementYear` are the LINE's answers (`core/lifecycle.ts`
     * `newOwnedCreature`), and the legacy beat is a statement about exactly those numbers. A swap
     * that only rewrote `lineId` would leave a Thornlet wearing a Cindril's retirement year — the
     * defect one layer down, and invisible until the year the starter did not retire.
     */
    const save = newRun();
    const stand = heldStarter(save);
    const choices = openingBeat(save).choices ?? [];

    for (const [index] of choices.entries()) {
      const state = playBranch(save, index);
      const chosen = state.flags[STARTER_FLAG] as string;
      const line = content.species.find((l) => l.id === chosen);
      expect(line, `data/species.json has no "${chosen}"`).toBeDefined();

      const expected = newOwnedCreature(
        {
          uid: stand.uid,
          lineId: chosen,
          age: stand.age,
          level: stand.level,
          caughtYear: stand.caughtYear,
        },
        line as SpeciesLine,
        balance,
      );
      const got = heldStarter(finishDialogueWrites(save, state));
      expect(canonicalStringify(got)).toBe(canonicalStringify(expected));
    }
  });

  it("choosing the line already held changes nothing at all", () => {
    const save = newRun();
    const state = playBranch(save, 0);
    const held = heldStarter(save);
    // Only meaningful while some branch DOES name the line the stand-in carries; asserted, not
    // assumed, so a data reorder turns this into a skip-free failure rather than a vacuous pass.
    const sameBranch = (openingBeat(save).choices ?? []).findIndex(
      (_c, i) => playBranch(save, i).flags[STARTER_FLAG] === held.lineId,
    );
    expect(sameBranch, "no branch names the line the stand-in carries").toBeGreaterThanOrEqual(0);
    const after = applyRunStarter(save, playBranch(save, sameBranch));
    expect(after).toBe(save);
    expect(state.flags[STARTER_FLAG]).toBeTruthy();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 The choice survives a save/load round trip
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 serialize → deserialize keeps the starter", () => {
  it("every branch's party comes back byte-identical through storage", () => {
    const save = newRun();
    const choices = openingBeat(save).choices ?? [];

    for (const [index, choice] of choices.entries()) {
      const state = playBranch(save, index);
      const after = finishDialogueWrites(save, state);
      const reloaded = deserialize(serialize(after), balance);

      expect(canonicalStringify(reloaded.party), choice.text).toBe(canonicalStringify(after.party));
      expect(heldStarter(reloaded).lineId).toBe(state.flags[STARTER_FLAG]);
      expect(reloaded.questFlags[STARTER_FLAG]).toBe(state.flags[STARTER_FLAG]);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 The tape still replays (L10)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 replay of the run's tape reproduces the same party", () => {
  it("the run's initial save replays its tape to the same save, byte for byte", () => {
    const save = newRun();
    const choices = openingBeat(save).choices ?? [];

    for (const [index, choice] of choices.entries()) {
      const state = playBranch(save, index);
      /*
       * ⚠ THE INITIAL SAVE CARRIES THE CHOSEN STARTER AND AN EMPTY TAPE, AND THAT IS THE DESIGN
       * RATHER THAN A DODGE. The starter is part of ESTABLISHING the run, like the seed and the
       * node states — the beat plays before any action is logged (§0 binds that) — so it belongs to
       * the save `replay` documents itself as taking, "the INITIAL save of a run". The FLAGS and the
       * re-lining are the two writes that reach it; `applyRunGrants` is the one that starts the
       * tape, and everything on that tape has to rebuild from here, party included.
       */
      const flagged = applyRunFlags(save, state);
      const initial = applyRunStarter(flagged, state);
      expect(initial.actionLog, "the beat put something on the tape before the run began")
        .toHaveLength(0);

      const after = applyRunGrants(flagged, state);
      expect(after.actionLog.length, "the opening chain logged nothing to replay")
        .toBeGreaterThan(0);

      const replayed = replay(initial, after.actionLog, REPLAY_DEPS);
      expect(canonicalStringify(replayed.party), choice.text).toBe(canonicalStringify(after.party));
      expect(canonicalStringify(replayed), choice.text).toBe(canonicalStringify(after));
    }
  });

  it("the beat puts nothing new on the tape — only the grant the chain already wrote", () => {
    const save = newRun();
    const withStarter = applyRunStarter(save, playBranch(save, 1));
    // The re-lining itself logs NOTHING, which is exactly why §0's "no logged action yet" matters:
    // `core/types.ts` GameAction has no `starter` member for it to log (see `applyStarterChoice`).
    expect(withStarter.actionLog).toEqual(save.actionLog);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4 It refuses quietly nowhere
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 the degraded paths say so out loud", () => {
  it("a choice taken after the tape started is APPLIED, and reported as un-replayable", () => {
    const save = newRun();
    const state = playBranch(save, 1);
    const chosen = state.flags[STARTER_FLAG] as string;
    // A run that has already logged something — the state the design's L10 argument does not cover.
    const midRun: SaveEnvelope = {
      ...save,
      actionLog: [{ seq: 0, year: save.year, tick: save.tick, subTick: 0, action: { t: "foray", nodeId: save.currentNode } }],
    };

    const after = applyRunStarter(midRun, state);
    // The player's choice wins — a beat that silently does not happen is worse than a degraded one.
    expect(heldStarter(after).lineId).toBe(chosen);
    expect(consoleErrors.join("\n")).toContain("L10");
  });

  it("a run with no starter-line creature to re-line is reported, not silently skipped", () => {
    const save = newRun();
    const partyless: SaveEnvelope = { ...save, party: [] };
    const after = applyRunStarter(partyless, playBranch(save, 1));
    expect(after).toBe(partyless);
    expect(consoleWarns.join("\n")).toContain("no starter-line creature");
  });

  it("a run that wrote no starter flag is untouched, and says nothing", () => {
    const save = newRun();
    const quiet: DialogueRunState = {
      entryId: openingBeat(save).id,
      lineIndex: 0,
      finished: true,
      flags: {},
      granted: {},
      visited: [],
      choicesTaken: [],
      problem: null,
    };
    expect(applyRunStarter(save, quiet)).toBe(save);
    expect(consoleErrors).toEqual([]);
    expect(consoleWarns).toEqual([]);
  });

  it("core refuses a line data/species.json does not carry, and a uid the save does not hold", () => {
    const save = newRun();
    const held = heldStarter(save);
    const deps = { species: content.species, balance };
    expect(() => applyStarterChoice(save, held.uid, "not-a-line", deps)).toThrow(SaveCorruptError);
    const real = STARTER_LINES.find((l) => l.id !== held.lineId);
    expect(real, "data ships only one starter line").toBeDefined();
    expect(() => applyStarterChoice(save, "not-a-uid", (real as SpeciesLine).id, deps))
      .toThrow(SaveCorruptError);
  });
});
