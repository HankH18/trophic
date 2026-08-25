/**
 * tests/unit/dialogue-runner.test.ts — THE LINE REACHES A PLAYER (build-doc §15 C7 / Q7).
 *
 * WHAT THIS FILE IS FOR, and why the 87 tests in `tests/unit/dialogue.test.ts` are not enough.
 * Those tests prove `data/dialogue.json` is well-formed, self-consistent and truthful about the
 * game's rules. Every one of them was green while **nothing in `game/` read the file** — verified,
 * and stated in docs/QUEUED-CHANGES.md: "no file in `game/` calls `selectEntry` or
 * `conditionHolds`". 499 lines, 211 entries, 62 speakers, and a green suite that could not tell you
 * whether one of them had ever been spoken.
 *
 * So this file asserts the claim the other one structurally cannot: an entry is SELECTED against a
 * real save, PLAYED to its end, and the flags it writes land where the act ladder and the quest
 * system read them. §6 is the anti-stub test — it fails if `game/` ever stops calling the resolver,
 * which is the exact state the repo was in before this change.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { actOf, awardBadge } from "@core/acts";
import { seasonOf } from "@core/clock";
import {
  DIALOGUE,
  conditionHolds,
  externallyGrantedFlags,
  selectEntry,
  selectEntryWhere,
  type DialogueEntry,
  type FlagValue,
} from "@core/dialogue-schema";
import { newSave, type SaveEnvelope } from "@core/save";
import { validateContent } from "@core/schemas";
import type { Balance, Content } from "@core/types";
import {
  advanceRun,
  applyRunFlags,
  autoplayEntryFor,
  awaitingChoice,
  beginRun,
  chooseOption,
  currentChoices,
  currentLine,
  currentSpeaker,
  dialogueContext,
  propDialogueFor,
  runHeadless,
  TALK_KINDS,
  talkEntryFor,
  transcript,
} from "@game/dialogue-runner";
import { liveNodeOf } from "@game/wild-battle";

const content: Content = validateContent();
const balance: Balance = content.balance;

function fresh(nodeId = "hearthollow"): SaveEnvelope {
  return newSave({ seed: balance.rng.defaultSeed, currentNode: nodeId, nodes: content.nodes }, balance);
}

function withFlags(save: SaveEnvelope, flags: Record<string, FlagValue>): SaveEnvelope {
  return { ...save, questFlags: { ...save.questFlags, ...flags } };
}

/** Every badge, so the act ladder is at its top and every act-gated chain step is eligible. */
function fullyBadged(save: SaveEnvelope): SaveEnvelope {
  let out = save;
  for (const gym of content.gyms) out = { ...out, ...awardBadge(out, gym.id, balance) };
  return out;
}

/* ════════════════════════════════════════════════════════════════════════════
 * §1 The context is the two clocks and the live world — not a third opinion
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 dialogueContext", () => {
  it("takes its act from core/acts.ts and its season from core/clock.ts, never from a local rule", () => {
    let save = fresh();
    for (const gym of content.gyms.slice(0, 3)) save = { ...save, ...awardBadge(save, gym.id, balance) };
    save = withFlags(save, { "story.opening.done": true });
    save = { ...save, year: 9, tick: 6 };

    const ctx = dialogueContext(save, content);
    expect(ctx.act).toBe(actOf(save, content.gyms, balance));
    expect(ctx.year).toBe(save.year);
    expect(ctx.season).toBe(seasonOf({ year: save.year, tick: save.tick }, balance));
    expect(ctx.flags).toBe(save.questFlags);
  });

  it("reads populations through the SAME resolver the encounter roll and the HUD use", () => {
    /*
     * build-doc §8.3's two-answers defect, on the numbers Hard Req 2 is about: a population clause
     * in a line must read the integer the ledger prints. `liveNodeOf` is the one place the
     * `nodeStates`-or-shipped-file fallback is decided, and the context goes through it.
     */
    const save = fresh();
    const ctx = dialogueContext(save, content);
    for (const node of content.nodes) {
      const live = liveNodeOf(content, save, node.id);
      expect(ctx.floraStock[node.id]).toBe(live.floraStock);
      for (const [lineId, pop] of Object.entries(live.populations)) {
        expect(ctx.populations[node.id]?.[lineId], `${node.id}/${lineId}`).toBe(pop.count);
      }
    }
  });

  it("a live count MOVES the context — a clause on it is not reading the shipped file", () => {
    const save = fresh();
    const nodeId = "hearthollow";
    const state = save.nodeStates[nodeId];
    expect(state).toBeDefined();
    const lineId = Object.keys(state!.populations)[0] as string;
    const crashed: SaveEnvelope = {
      ...save,
      nodeStates: {
        ...save.nodeStates,
        [nodeId]: {
          ...state!,
          populations: { ...state!.populations, [lineId]: { ...state!.populations[lineId]!, count: 0 } },
        },
      },
    };
    expect(dialogueContext(save, content).populations[nodeId]?.[lineId]).toBeGreaterThan(0);
    expect(dialogueContext(crashed, content).populations[nodeId]?.[lineId]).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 Selection goes through core/dialogue-schema.ts, including the question
 *    (speaker, node, kind) structurally cannot answer
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 selection", () => {
  it("selectPropEntry tells Cindershelf's two shrines apart; selectEntry cannot", () => {
    /*
     * THE DEFECT A SECOND PRIORITY LOOP WOULD HAVE HIDDEN. `cindershelf-shrine-mine` and
     * `cindershelf-shrine-deep` are both read off `prop-shell-kiln-shrine`, in `cindershelf`, with
     * kind `prop` — every component of `selectEntry`'s key. Their entries are steps 2 and 5 of the
     * kilnback chain, so reading the WRONG one is reading a step out of order.
     */
    const shrines = DIALOGUE.entries.filter(
      (e) => e.kind === "prop" && e.node === "cindershelf" && e.speaker === "prop-shell-kiln-shrine",
    );
    expect(shrines.length, "the corpus no longer ships two shrine entries").toBeGreaterThan(1);
    expect(new Set(shrines.map((e) => e.propId)).size).toBe(shrines.length);

    const save = fullyBadged(withFlags(fresh("cindershelf"), { "story.opening.done": true }));
    // Step 1 read, step 2 not: only the MINE shrine is eligible.
    const atStep1 = dialogueContext(withFlags(save, { "chain.kilnback.step1": true }), content);
    expect(propDialogueFor(DIALOGUE, "cindershelf-shrine-mine", "cindershelf", atStep1)?.id).toBe(
      "prop.cindershelf-shrine-mine",
    );
    expect(propDialogueFor(DIALOGUE, "cindershelf-shrine-deep", "cindershelf", atStep1)).toBeUndefined();

    // …and at step 4 the DEEP shrine is the one that answers.
    const atStep4 = dialogueContext(
      withFlags(save, { "chain.kilnback.step1": true, "chain.kilnback.step2": true, "chain.kilnback.step3": true, "chain.kilnback.step4": true }),
      content,
    );
    expect(propDialogueFor(DIALOGUE, "cindershelf-shrine-deep", "cindershelf", atStep4)?.id).toBe(
      "prop.cindershelf-shrine-deep",
    );
    expect(propDialogueFor(DIALOGUE, "cindershelf-shrine-mine", "cindershelf", atStep4)).toBeUndefined();
  });

  it("a prop lookup never answers with another node's prop", () => {
    const save = fullyBadged(withFlags(fresh(), { "story.opening.done": true }));
    const ctx = dialogueContext(save, content);
    for (const entry of DIALOGUE.entries.filter((e) => e.propId !== undefined)) {
      for (const node of content.nodes) {
        const got = propDialogueFor(DIALOGUE, entry.propId as string, node.id, ctx);
        if (got) expect(got.node, `${entry.id} answered for ${node.id}`).toBe(node.id);
      }
    }
  });

  it("one permanently-eligible line cannot starve a chain step under it", () => {
    /*
     * A REACHABILITY HAZARD FOUND BY WIRING, and the reason `talkEntryFor` takes a `said` set.
     *
     * `maren.crash-survey` is `kind: "lore"` in Cindershelf at **priority 52**, gated on act ≥ 4 and
     * Route 4's apex at or under one individual, and it writes NO flag — so once the act-4 Cullbrand
     * raid has driven that count down it is eligible for ever. `maren.keystone.4` — Vellsire chain
     * step 6 — is `kind: "lore"` in the same room at **priority 50**. "The room's highest-priority
     * eligible line" therefore answers with the survey every single press, step 6 never fires,
     * `chain.vellsire.complete` is never written, and the Ancient hunt the whole chain exists for
     * cannot be finished. Nothing goes red: the corpus is still valid and every dialogue test still
     * passes.
     *
     * The copy is NOT touched (G2). The fix is in the wiring, and this is what binds it.
     */
    const survey = DIALOGUE.entries.find((e) => e.id === "maren.crash-survey") as DialogueEntry;
    const step6 = DIALOGUE.entries.find((e) => e.id === "maren.keystone.4") as DialogueEntry;
    expect(survey.setFlags, "the survey line now closes itself — re-read this test").toBeUndefined();
    expect(survey.priority ?? 0).toBeGreaterThan(step6.priority ?? 0);

    let save = fullyBadged(
      withFlags(fresh("cindershelf"), {
        "story.opening.done": true,
        "chain.vellsire.unlocked": true,
        "chain.vellsire.step1": true,
        "chain.vellsire.step2": true,
        "chain.vellsire.step3": true,
        "chain.vellsire.step4": true,
        "chain.vellsire.step5": true,
        // Cindershelf's OTHER chain read out, so the room's lore winner is the collision under
        // test rather than a Kilnback step that closes itself the moment it is heard.
        "chain.kilnback.step1": true,
        "chain.kilnback.step2": true,
        "chain.kilnback.step3": true,
        "chain.kilnback.step4": true,
        "chain.kilnback.step5": true,
        "chain.kilnback.step6": true,
        "chain.kilnback.complete": true,
      }),
    );
    // The state the raid produces: Route 4's apex at the floor the survey line waits for.
    const r4 = save.nodeStates["r4"];
    expect(r4).toBeDefined();
    const apex = survey.when?.population?.[0]?.lineId as string;
    save = {
      ...save,
      nodeStates: {
        ...save.nodeStates,
        r4: { ...r4!, populations: { ...r4!.populations, [apex]: { ...r4!.populations[apex]!, count: 0 } } },
      },
    };
    const ctx = dialogueContext(save, content);
    expect(conditionHolds(survey.when, ctx)).toBe(true);
    expect(conditionHolds(step6.when, ctx)).toBe(true);

    // Within the LORE kind — where both of them live — the survey is the winner, every time.
    const loreWinner = (): string | undefined =>
      selectEntryWhere(DIALOGUE, ctx, (e) => e.node === "cindershelf" && e.kind === "lore")?.id;
    expect(loreWinner()).toBe("maren.crash-survey");
    expect(loreWinner()).toBe("maren.crash-survey");

    // With it, the step is reached in a bounded number of presses — which is all the guarantee has
    // to be, because every other line in the room closes itself when it is read.
    const said = new Set<string>();
    let reached = false;
    for (let press = 0; press < DIALOGUE.entries.length && !reached; press += 1) {
      const entry = talkEntryFor(DIALOGUE, "cindershelf", ctx, said);
      if (!entry || said.has(entry.id)) break;
      said.add(entry.id);
      if (entry.id === "maren.keystone.4") reached = true;
    }
    expect(reached, "Vellsire chain step 6 is unreachable at Cindershelf").toBe(true);
  });

  it("once every eligible line has been heard the room repeats rather than falling silent", () => {
    const save = withFlags(fresh(), { "story.opening.done": true });
    const ctx = dialogueContext(save, content);
    const said = new Set<string>();
    for (let i = 0; i < DIALOGUE.entries.length; i += 1) {
      const entry = talkEntryFor(DIALOGUE, "hearthollow", ctx, said);
      expect(entry, "the room went silent").toBeDefined();
      if (said.has(entry!.id)) break;
      said.add(entry!.id);
    }
    expect(said.size).toBeGreaterThan(0);
    expect(talkEntryFor(DIALOGUE, "hearthollow", ctx, said)).toBeDefined();
  });

  it("the talk order puts QUEST ahead of GREETING, or every offer in the game is unreachable", () => {
    /*
     * A greeting with no `when` is eligible for ever. Any walk order that reached one first would
     * make every quest offer and every turn-in in the corpus dead copy while the corpus stayed
     * green — the same shape of failure this whole file exists to catch.
     */
    const save = withFlags(fresh(), { "story.opening.done": true, "quest.first-signs.offered": true });
    const ctx = dialogueContext(save, content);
    const greeting = selectEntry(DIALOGUE, "maren", "hearthollow", "greeting", ctx);
    expect(greeting, "maren has no greeting to be shadowed by").toBeDefined();
    expect(talkEntryFor(DIALOGUE, "hearthollow", ctx)?.kind).toBe("quest");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 A run — the corpus PLAYED
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 the run", () => {
  it("walks a multi-line entry one line at a time, verbatim", () => {
    const entry = DIALOGUE.entries.find((e) => e.id === "maren.opening") as DialogueEntry;
    expect(entry.lines.length).toBeGreaterThan(1);

    let state = beginRun(DIALOGUE, entry.id);
    const seen: string[] = [];
    for (let i = 0; i < entry.lines.length; i += 1) {
      seen.push(currentLine(DIALOGUE, state).text);
      if (i < entry.lines.length - 1) state = advanceRun(DIALOGUE, state);
    }
    expect(seen).toEqual(entry.lines.map((l) => l.text));
    // The name plate is the speaker table's own `name`, not an id and not an invention.
    expect(currentSpeaker(DIALOGUE, state)?.id).toBe(entry.speaker);
  });

  it("stops at a choice and refuses to be advanced past it", () => {
    let state = beginRun(DIALOGUE, "maren.opening");
    while (!awaitingChoice(DIALOGUE, state)) state = advanceRun(DIALOGUE, state);
    expect(currentChoices(DIALOGUE, state).length).toBe(3);
    const stuck = advanceRun(DIALOGUE, state);
    expect(stuck).toBe(state);
  });

  it("THE OPENING BEAT: playing it writes story.opening.done, and the act ladder moves", () => {
    /*
     * This is the flag that had no writer in `game/` at all. `balance.acts.gates` opens act 1 on it,
     * `OverworldScene` stood in for it, and the corpus's own three starter branches are what set
     * it. Here the corpus does.
     */
    const save = fresh();
    expect(actOf(save, content.gyms, balance)).toBe(balance.acts.first);

    const ctx = dialogueContext(save, content);
    const opening = autoplayEntryFor(DIALOGUE, save.currentNode, ctx);
    expect(opening?.id, "the corpus has no opening cutscene at the start node").toBe("maren.opening");

    // Every branch of the choice, not just the first — a starter the player picks must not decide
    // whether the game opens.
    const branches = (opening?.choices ?? []).length;
    expect(branches).toBe(3);
    for (let i = 0; i < branches; i += 1) {
      const state = runHeadless(DIALOGUE, opening!.id, () => i);
      expect(state.finished).toBe(true);
      expect(state.problem).toBeNull();
      expect(state.flags["story.opening.done"], `branch ${String(i)}`).toBe(true);
      expect(typeof state.flags["story.starter"]).toBe("string");
      // …and the chain runs on into the two tutorials, which is where the first quest is offered.
      expect(state.flags["tutorial.snare.done"]).toBe(true);
      expect(state.flags["tutorial.ledger.done"]).toBe(true);
      expect(state.flags["quest.first-signs.offered"]).toBe(true);

      const after = applyRunFlags(save, state);
      expect(actOf(after, content.gyms, balance)).toBe(balance.acts.first + 1);
    }
  });

  it("the three starter branches are three different starters", () => {
    const picked = [0, 1, 2].map((i) => runHeadless(DIALOGUE, "maren.opening", () => i).flags["story.starter"]);
    expect(new Set(picked).size).toBe(3);
  });

  it("a choice's own flags are written, and the branch it names is the one that plays", () => {
    const save = withFlags(fresh(), { "story.opening.done": true });
    const badged = { ...save, ...awardBadge(save, content.gyms[0]!.id, balance) };
    const ctx = dialogueContext(badged, content);
    const offer = selectEntry(DIALOGUE, "sel", "brackwater", "quest", ctx);
    expect(offer?.id).toBe("sel.quest.wager.offer");

    const taken = runHeadless(DIALOGUE, offer!.id, () => 0);
    expect(taken.flags["quest.ferrymans-wager.taken"]).toBe(true);
    expect(taken.visited).toContain("sel.quest.wager.accepted");

    const declined = runHeadless(DIALOGUE, offer!.id, () => 1);
    expect(declined.flags["quest.ferrymans-wager.taken"]).toBeUndefined();
    expect(declined.visited).toContain("sel.quest.wager.declined");
  });

  it("the transcript is the authored text and nothing else — no line is invented (G2)", () => {
    const state = runHeadless(DIALOGUE, "maren.opening", () => 0);
    const authored = new Set(DIALOGUE.entries.flatMap((e) => e.lines.map((l) => l.text)));
    const said = transcript(DIALOGUE, state);
    expect(said.length).toBeGreaterThan(5);
    for (const line of said) expect(authored.has(line), line).toBe(true);
  });

  it("a goto that revisits an entry ends the run and SAYS SO — it does not hang", () => {
    // The corpus ships no loop; the guard is what stops a corpus edit from hanging a scene that
    // owns the keyboard, so it is asserted directly on a hand-built file.
    const looped = {
      speakers: DIALOGUE.speakers,
      entries: [
        { ...(DIALOGUE.entries.find((e) => e.id === "maren.greeting.act1") as DialogueEntry), id: "a", goto: "b" },
        { ...(DIALOGUE.entries.find((e) => e.id === "maren.greeting.act1") as DialogueEntry), id: "b", goto: "a" },
      ],
    };
    const state = runHeadless(looped, "a");
    expect(state.finished).toBe(true);
    expect(state.problem).toMatch(/already played/u);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4 An Ancient chain, walked step by step until chain.*.complete is true
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Walk a sign chain the way a player would: at every node and every prop, ask the corpus what is
 * eligible right now, play it, adopt its flags, and go round again.
 *
 * Nothing here knows the chain's shape — no step list, no order. That is the point: if the wiring
 * only worked because the test walked the steps in the order the corpus declares them, it would
 * prove nothing about a player who arrives at the stones in a different order.
 */
function walkChain(start: SaveEnvelope, chainId: string): { save: SaveEnvelope; steps: string[] } {
  let save = start;
  const steps: string[] = [];
  /*
   * A PLAYER, not a chain-walker: it talks to whoever has something to say and reads whatever is in
   * front of it, in whatever order the corpus's own priorities produce, and the chain advances as a
   * consequence.
   *
   * That is the only honest shape. Two chains share a room and the corpus prices them against each
   * other — `sel.tale.1` sits at priority 55 in Brackwater and `maren.keystone.2` at 50 — so the
   * Undermere line is what a player hears first and the Vellsire step only becomes the room's
   * winner once it has been. A walk that filtered for one chain would be asserting against a game
   * nobody plays.
   *
   * Read-once, for the same reason `OverworldScene` remembers what has been said: some entries are
   * eligible for ever and write nothing — `prop.sanctum-antler-ring` is the caldera-heart stone.
   */
  const read = new Set<string>();
  const budget = DIALOGUE.entries.length * 3;
  for (let i = 0; i < budget; i += 1) {
    const ctx = dialogueContext(save, content);
    let next: DialogueEntry | undefined;
    for (const node of content.nodes) {
      for (const prop of node.props) {
        const entry = propDialogueFor(DIALOGUE, prop.id, node.id, ctx);
        if (entry && !read.has(entry.id)) {
          next = entry;
          break;
        }
      }
      if (next) break;
      const talk = talkEntryFor(DIALOGUE, node.id, ctx, read);
      // `talkEntryFor` repeats the room's winner once everything eligible has been heard; a walker
      // that took that answer would re-read one line for ever.
      if (talk && !read.has(talk.id)) next = talk;
      if (next) break;
    }
    if (!next) break;
    read.add(next.id);
    const state = runHeadless(DIALOGUE, next.id);
    expect(state.problem, next.id).toBeNull();
    save = applyRunFlags(save, state);
    if (next.signChain === chainId && Object.keys(state.flags).length > 0) steps.push(next.id);
  }
  return { save, steps };
}

describe("§4 the Ancient chains reach chain.*.complete", () => {
  const chains = [
    { id: "vellsire-chain", flag: "chain.vellsire.complete", seed: { "chain.vellsire.unlocked": true } },
    { id: "undermere-chain", flag: "chain.undermere.complete", seed: { "quest.ferrymans-wager.done": true } },
    { id: "kilnback-chain", flag: "chain.kilnback.complete", seed: {} },
  ] as const;

  it.each(chains.map((c) => [c.id, c] as const))(
    "%s advances step by step and completes",
    (_id, chain) => {
      /*
       * The chains were UNCOMPLETABLE: `docs/QUEUED-CHANGES.md` — "nothing reads
       * `chain.*.complete`, so the three Ancient hunts cannot be completed" — and nothing wrote the
       * steps either, because nothing played the entries that write them.
       *
       * The two seeds are the corpus's own gates, not shortcuts: the Vellsire chain's trailhead
       * requires `chain.vellsire.unlocked`, which is *First Signs*' reward, and Undermere step 4
       * requires `quest.ferrymans-wager.done`. tests/unit/quests.test.ts proves those two halves
       * through the real scene; this one proves the chain on top of them.
       */
      let save = fullyBadged(withFlags(fresh(), { "story.opening.done": true, ...chain.seed }));
      expect(save.questFlags[chain.flag]).toBeUndefined();
      expect(actOf(save, content.gyms, balance)).toBe(balance.acts.last);

      const walked = walkChain(save, chain.id);
      save = walked.save;
      expect(walked.steps.length, "no step of the chain was playable").toBeGreaterThan(3);
      expect(save.questFlags[chain.flag], `${chain.id} never completed`).toBe(true);
    },
  );

  it("a chain step is NOT eligible before the step under it has been read", () => {
    // The gate, asserted in the direction that binds: the corpus's step conditions are what make
    // the walk a walk rather than a list, so a step with its predecessor unread must be refused.
    const save = fullyBadged(withFlags(fresh(), { "story.opening.done": true }));
    const ctx = dialogueContext(save, content);
    const step2 = DIALOGUE.entries.find((e) => e.id === "prop.r1-antler-north") as DialogueEntry;
    expect(conditionHolds(step2.when, ctx)).toBe(false);
    const unlocked = dialogueContext(
      withFlags(save, { "chain.vellsire.unlocked": true, "chain.vellsire.step1": true }),
      content,
    );
    expect(conditionHolds(step2.when, unlocked)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §5 The corpus's bill, derived rather than listed
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§5 externallyGrantedFlags", () => {
  it("is derived from the file, and covers flagEquals as well as flagsSet", () => {
    const owed = externallyGrantedFlags(DIALOGUE);
    // docs/STORY-REVIEW.md §3 enumerates twelve by hand; the file carries more, and the two it
    // misses are the ones nobody noticed had no writer (D-INT-4).
    expect(owed.length).toBeGreaterThanOrEqual(12);
    expect(owed).toContain("story.vellsire.outcome");
    expect(owed).toContain("story.vellsire.resolved");
    for (const key of owed) {
      const writtenSomewhere = DIALOGUE.entries.some(
        (e) =>
          Object.keys(e.setFlags ?? {}).includes(key) ||
          (e.choices ?? []).some((c) => Object.keys(c.setFlags ?? {}).includes(key)),
      );
      expect(writtenSomewhere, `${key} IS written by the corpus`).toBe(false);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §6 ANTI-STUB — `game/` really does consume the resolver
 * ════════════════════════════════════════════════════════════════════════════ */

function gameSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) out.push(full);
    }
  };
  walk("game");
  return out;
}

/** Source with comments stripped, so a MENTION of a function is not mistaken for a call. */
function executable(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/u, ""))
    .join("\n");
}

describe("§6 the anti-stub gate — game/ imports and CALLS the dialogue resolver", () => {
  it("at least one production file in game/ imports core/dialogue-schema", () => {
    /*
     * THE STATE THIS FILE EXISTS TO MAKE UNREPEATABLE. Before this change the answer was zero, and
     * every dialogue test in the repo was green anyway. Discovered by walking, never by a list: the
     * BF-3 stand-in named ten files by hand and the wiring landed in an eleventh.
     */
    const importers = gameSources().filter((f) =>
      /from\s+["'](?:@core\/dialogue-schema|\.\.?\/[^"']*dialogue-schema)["']/u.test(executable(readFileSync(f, "utf8"))),
    );
    expect(importers, "no file in game/ imports the dialogue schema").not.toHaveLength(0);
  });

  it("at least one production file in game/ CALLS the resolver, not merely names it", () => {
    const callers = gameSources().filter((f) => {
      const code = executable(readFileSync(f, "utf8"));
      return /\b(?:selectEntryWhere|selectEntry|selectPropEntry|propDialogueFor|conditionHolds)\s*\(/u.test(code);
    });
    expect(callers, "no file in game/ calls selectEntry / conditionHolds").not.toHaveLength(0);
  });

  it("the OVERWORLD is one of them — the resolver is reached by playing, not only by a test", () => {
    const scene = executable(readFileSync("game/scenes/OverworldScene.ts", "utf8"));
    for (const call of ["talkEntryFor(", "autoplayEntryFor(", "propDialogueFor(", "dialogueContext("]) {
      expect(scene, `OverworldScene never calls ${call})`).toContain(call);
    }
    // …and it hands what it selected to the box, rather than resolving and dropping it.
    expect(scene).toMatch(/scene\.launch\(\s*SCENE_KEYS\.dialogue/u);
  });

  it("the runner does not reimplement condition resolution", () => {
    /*
     * The rule from docs/QUEUED-CHANGES.md Q7, asserted: "core/dialogue-schema.ts already exports
     * conditionHolds() and selectEntry(), so the game layer must NOT reinvent condition
     * resolution". A second resolver is the defect a second ACT model already was — it agreed
     * everywhere except the prologue, and made the whole opening chain unreachable.
     */
    const runner = executable(readFileSync("game/dialogue-runner.ts", "utf8"));
    for (const clause of ["actMin", "actMax", "yearMin", "yearMax", "flagsUnset", "flagEquals"]) {
      expect(runner, `game/dialogue-runner.ts resolves \`${clause}\` itself`).not.toContain(clause);
    }
    expect(runner).toMatch(/selectEntryWhere|selectPropEntry/u);
  });
});
