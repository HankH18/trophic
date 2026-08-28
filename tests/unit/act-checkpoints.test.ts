/**
 * tests/unit/act-checkpoints.test.ts — the committed act checkpoints are the states they claim.
 *
 * WHAT THE GREEN HERE IS EVIDENCE OF, stated first so nobody has to guess.
 *
 * A checkpoint is a TAPE (`fixtures/act-checkpoints/*.json`), and loading one is `core/save.ts`
 * `replay`. So every assertion below is about a save that was REBUILT FROM RECORDED PLAYER ACTIONS
 * by the production reducers — not about a save anybody typed. That is the entire reason the
 * checkpoints are tapes: a hand-authored save JSON can encode a state the rules cannot produce, and
 * a suite standing on one measures the fixture. If a tape stops being replayable, `loadCheckpoint`
 * throws and every test in this file dies at once, which is the intended failure.
 *
 * NOTHING HERE WRITES DOWN WHAT AN ACT MEANS. The badge window, the unlocked node set, the end
 * condition and the act itself are all recomputed from `core/acts.ts` against `data/balance.json`
 * and `data/gyms.json`. A retune of the act ladder moves this file's expectations with it; a
 * checkpoint that no longer reaches its act turns red.
 *
 * ⚠ THE ACT MODEL HAS NO OPINION ABOUT THE CLOCK, AND §3 IS WRITTEN THAT WAY ON PURPOSE.
 * `core/acts.ts` says it in capitals — "THE CLOCK IS NOT AN INPUT… If a future caller wants 'act at
 * year N', the answer is that the question is malformed." So the clock a checkpoint loads with
 * cannot be derived from its act; it is derived from the TAPE, by `game/year-replay.ts`
 * `clockFromLog`, which is the only thing that knows what a recorded run's calendar was.
 */

import { describe, expect, it } from "vitest";

import {
  actGates,
  actOf,
  badgeCount,
  firstAct,
  gateForAct,
  gateSatisfied,
  hasBadge,
  lastAct,
  prologueExitFlags,
  runIsComplete,
  unlockedNodeIds,
} from "@core/acts";
import { validateContent } from "@core/schemas";
import { MemoryStorage, serialize, type SaveEnvelope } from "@core/save";
import type { ActionLogEntry, Balance, Content } from "@core/types";

import { startNewGame } from "@game/boot";
import { registry } from "@game/registry";
import { PROVISIONAL_STARTER_UID } from "@game/wild-battle";
import { clockFromLog } from "@game/year-replay";

import {
  RUN_COMPLETE_ID,
  applyPrologue,
  checkpointActs,
  checkpointIds,
  checkpointInitialSave,
  claimOf,
  loadAllCheckpoints,
  loadCheckpoint,
  prologueCheckpointId,
  replayTape,
  startClock,
  type LoadedCheckpoint,
} from "@tools/checkpoints/checkpoints";

const content: Content = validateContent();
const balance: Balance = content.balance;

/** Loaded once: eight replays of up to 344 recorded actions is not free, and none of them mutate. */
const loaded: LoadedCheckpoint[] = loadAllCheckpoints({ content });
const byId = new Map(loaded.map((c) => [c.file.id, c]));

function must(id: string): LoadedCheckpoint {
  const c = byId.get(id);
  if (!c) throw new Error(`no checkpoint "${id}"`);
  return c;
}

/** The tape's own count of one action kind. */
function count(tape: readonly ActionLogEntry[], t: string): number {
  return tape.filter((e) => e.action.t === t).length;
}

/* ════════════════════════════════════════════════════════════════════════════
 * §1 The rig is the real game — the initial save is `startNewGame`'s, not a copy of it
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 a checkpoint starts from the save the shipped new-game path produces", () => {
  /*
   * WHY THIS TEST IS THE FOUNDATION OF THE OTHER FOUR SECTIONS. `replay` rebuilds a run from
   * (initial save, tape). The tape is recorded, so the only thing a checkpoint could get wrong
   * without anybody noticing is the SAVE IT REPLAYS ONTO — and `tools/checkpoints/checkpoints.ts`
   * cannot import `game/boot.ts` to build it: `tests/gates/guardrails.test.ts`
   * `no_phaser_in_node_reachable` forbids a node-side tool from reaching a module that type-imports
   * a scene, and boot type-imports two. So `startNodeOf` and `provisionalStarterOf` RESTATE the two
   * rules boot applies, and THIS TEST is what stops the restatement drifting: it drives the real
   * `startNewGame` through a MemoryStorage-backed registry and compares bytes, uid, level, age and
   * traits included. A change to how a new run is seeded reddens here instead of silently
   * relocating every checkpoint.
   */
  it("BINDS — checkpointInitialSave is byte-identical to what startNewGame writes", () => {
    registry.setContent(content);
    registry.setStorage(new MemoryStorage());
    const seed = balance.rng.defaultSeed;

    const result = startNewGame({ slot: 1, seed });
    expect(result.error).toBeNull();
    const fromBoot: SaveEnvelope = registry.save();
    registry.endSession();

    expect(serialize(checkpointInitialSave(content, seed))).toBe(serialize(fromBoot));
  });

  it("the comparison above can fail — a different seed is a different save", () => {
    // The negative control: without it, the assertion above would also pass if both sides were the
    // same constant object for a reason that had nothing to do with boot.
    const seed = balance.rng.defaultSeed;
    expect(serialize(checkpointInitialSave(content, seed))).not.toBe(
      serialize(checkpointInitialSave(content, seed + 1)),
    );
  });

  it("every committed checkpoint was recorded from that same run — one seed, one region", () => {
    for (const c of loaded) expect(c.file.seed).toBe(loaded[0]?.file.seed);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 Each checkpoint is at the act it is named for — derived from core/acts.ts
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 the act model's own answers, recomputed against every checkpoint", () => {
  it("the set of checkpoints is exactly the set the act ladder asks for", () => {
    // Derived from `balance.acts.gates`: adding a seventh act to data/balance.json makes this red
    // rather than leaving the new act permanently unexamined.
    expect(loaded.map((c) => c.file.id)).toEqual(checkpointIds(balance));
    expect(checkpointActs(balance).length).toBeGreaterThan(1);
  });

  it.each(checkpointIds(balance))("%s — actOf answers the act the id claims", (id) => {
    const c = must(id);
    expect(actOf(c.save, content.gyms, balance)).toBe(claimOf(id, balance).act);
  });

  it.each(checkpointIds(balance))("%s — the badge count sits inside that act's rung", (id) => {
    const c = must(id);
    const act = claimOf(id, balance).act;
    const badges = badgeCount(c.save, content.gyms, balance);
    // The floor is the gate's own badge requirement, read out of `balance.acts.gates`.
    expect(badges).toBeGreaterThanOrEqual(gateForAct(act, balance)?.badges ?? 0);
    /*
     * The CEILING is "the next gate is not satisfied", NOT "fewer badges than the next gate wants".
     * Those are different claims and the second one is false on the shipped ladder — act 1's rung is
     * distinguished from act 0's by a FLAG at zero badges, so `badges < above.badges` reads
     * `0 < 0` and fails on a checkpoint that is perfectly correct. (Written the wrong way first;
     * this test caught it.) `gateSatisfied` is what `actOf` itself asks, so this is the act model's
     * own sentence rather than a paraphrase of it — and it is the stronger of the two, because it
     * covers the flag clauses a badge count cannot see.
     */
    const above = gateForAct(act + 1, balance);
    if (above) expect(gateSatisfied(above, c.save, content.gyms, balance)).toBe(false);
    // …and every badge it has is a real leader's, never a stray `gym.*.beaten`-shaped key.
    expect(content.gyms.filter((g) => hasBadge(c.save, g.id, balance)).length).toBe(badges);
  });

  it.each(checkpointIds(balance))("%s — every gate clause below the act actually holds", (id) => {
    const c = must(id);
    const act = claimOf(id, balance).act;
    for (const gate of actGates(balance)) {
      if (gate.act > act) continue;
      for (const flag of gate.flags) {
        expect(c.save.questFlags[flag], `${id}: gate ${String(gate.act)} needs "${flag}"`).toBe(true);
      }
    }
  });

  it.each(checkpointIds(balance))("%s — runIsComplete answers what the id claims", (id) => {
    expect(runIsComplete(must(id).save, content.gyms, balance)).toBe(claimOf(id, balance).runComplete);
  });

  it.each(checkpointIds(balance))("%s — the player is standing on a node that act opens", (id) => {
    const c = must(id);
    const open = unlockedNodeIds(claimOf(id, balance).act, balance);
    expect(c.unlockedNodes).toEqual(open);
    // A checkpoint that dropped the player on a node the act ladder has not opened would load into
    // an unplayable save — the one failure a "correct act" assertion cannot see on its own.
    expect(open, `${id} stands on "${c.save.currentNode}"`).toContain(c.save.currentNode);
  });

  it.each(checkpointIds(balance))("%s — the party is fieldable and made of real species", (id) => {
    const c = must(id);
    expect(c.save.party.length).toBeGreaterThan(0);
    const lines = new Set(content.species.map((s) => s.id));
    for (const creature of [...c.save.party, ...c.save.box]) expect(lines).toContain(creature.lineId);
    expect(c.save.party.length).toBeLessThanOrEqual(balance.party.maxPartySize);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 The clock — read off the TAPE, because the act model has none
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 the calendar a checkpoint loads on is the one its own tape records", () => {
  it.each(checkpointIds(balance))("%s — {year, tick, subTick} equals clockFromLog", (id) => {
    /*
     * NOT "the clock the act says": `core/acts.ts` deliberately has no year parameter and must never
     * get one. What a checkpoint's calendar IS derivable from is the tape — every `ActionLogEntry`
     * carries the `{year, tick, subTick}` it was taken at and `balance.clock` prices the four
     * costing actions — which is exactly what `game/year-replay.ts` `clockFromLog` reads back.
     */
    const c = must(id);
    expect({ year: c.save.year, tick: c.save.tick, subTick: c.save.subTick ?? 0 }).toEqual(
      clockFromLog(startClock(balance), c.file.tape, balance),
    );
  });

  it("the calendar advances across the ladder — later acts are recorded later in the run", () => {
    const years = checkpointIds(balance).map((id) => must(id).save.year);
    for (let i = 1; i < years.length; i += 1) {
      expect(years[i] ?? 0).toBeGreaterThanOrEqual(years[i - 1] ?? 0);
    }
    // …and it really does move, so this is not vacuous on a run that never turned a year.
    expect(years[years.length - 1] ?? 0).toBeGreaterThan(years[0] ?? 0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4 One run, not eight fabrications
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 the checkpoints are cuts of a single recorded run", () => {
  it("each tape is a strict prefix of the next", () => {
    /*
     * The structural proof that the eight files came from ONE drive. Without it, someone
     * regenerating a single checkpoint would leave a set that individually passed every assertion
     * above while describing runs that never happened in the same region.
     */
    const ids = checkpointIds(balance);
    for (let i = 1; i < ids.length; i += 1) {
      const prev = must(ids[i - 1] as string).file.tape;
      const next = must(ids[i] as string).file.tape;
      expect(next.length).toBeGreaterThanOrEqual(prev.length);
      expect(JSON.stringify(next.slice(0, prev.length))).toBe(JSON.stringify(prev));
    }
    // …and the ladder is not eight copies of the same empty tape.
    expect(must(RUN_COMPLETE_ID).file.tape.length).toBeGreaterThan(0);
  });

  it("the tape is gapless and numbered from zero, exactly as replay demands", () => {
    for (const c of loaded) {
      c.file.tape.forEach((entry, i) => expect(entry.seq).toBe(i));
    }
  });

  it("only the prologue act is recorded before the opening beat", () => {
    const prologueId = prologueCheckpointId(balance);
    expect(must(prologueId).file.prologue).toBe(false);
    for (const c of loaded) if (c.file.id !== prologueId) expect(c.file.prologue).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §5 The beats the checkpoints exist for — the late-game content an audit keeps missing
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§5 the ladder actually reaches the beats it was built to reach", () => {
  it("there is a checkpoint BEFORE the first gym — no badges, and the first leader still standing", () => {
    const first = must(`act-${String(firstAct(balance) + 1)}`);
    expect(badgeCount(first.save, content.gyms, balance)).toBe(0);
    for (const gym of content.gyms) expect(hasBadge(first.save, gym.id, balance)).toBe(false);
  });

  it("every badge count from none to all of them has a checkpoint standing at it", () => {
    // Derived from data/gyms.json: adding a seventh leader leaves a rung with no checkpoint and
    // reddens here, rather than leaving that stretch of the run permanently unexamined.
    const counts = new Set(loaded.map((c) => badgeCount(c.save, content.gyms, balance)));
    for (let n = 0; n <= content.gyms.length; n += 1) expect(counts).toContain(n);
  });

  it("the CASCADE beat is reachable — a checkpoint sits on the far side of a year turn", () => {
    /*
     * build-doc §1 beat 1 opens year 2 with the region a year older. The tape has to contain a real
     * `{t:"yearTurn"}` for that to be a state a checkpoint can hand anybody, and the year turn is
     * what ages every creature, steps the fourth season and swaps the map variants.
     */
    const withTurns = loaded.filter((c) => count(c.file.tape, "yearTurn") > 0);
    expect(withTurns.length).toBeGreaterThan(0);
    const earliest = withTurns[0] as LoadedCheckpoint;
    expect(earliest.save.year).toBeGreaterThan(balance.clock.startYear);
    // Strictly more year turns as the ladder climbs — the later checkpoints really are later runs.
    const turns = loaded.map((c) => count(c.file.tape, "yearTurn"));
    expect(turns[turns.length - 1] ?? 0).toBeGreaterThan(turns[0] ?? 0);
  });

  it("the LEGACY beat is reachable — one checkpoint holds the starter, a later one holds its heir", () => {
    /*
     * build-doc §1 beat 2: "the starter retires before the league; its heir fights the finale". The
     * uid is `game/wild-battle.ts` PROVISIONAL_STARTER_UID, imported rather than spelled, and the
     * retirement is a `{t:"retirement"}` entry on the tape — the one half of the beat `replay` can
     * rebuild, because `core/lifecycle.ts` `yearTurnActions` mints it.
     */
    const holdsStarter = loaded.filter((c) =>
      c.save.party.some((m) => m.uid === PROVISIONAL_STARTER_UID),
    );
    const afterRetirement = loaded.filter((c) => count(c.file.tape, "retirement") > 0);
    expect(holdsStarter.length).toBeGreaterThan(0);
    expect(afterRetirement.length).toBeGreaterThan(0);

    // The retirement happens AFTER the last checkpoint that still holds the starter…
    const lastWithStarter = holdsStarter[holdsStarter.length - 1] as LoadedCheckpoint;
    const firstAfter = afterRetirement[0] as LoadedCheckpoint;
    expect(firstAfter.file.tape.length).toBeGreaterThan(lastWithStarter.file.tape.length);
    // …and what stands in the party afterwards is a DIFFERENT individual, fieldable.
    expect(firstAfter.save.party.some((m) => m.uid === PROVISIONAL_STARTER_UID)).toBe(false);
    expect(firstAfter.save.party.length).toBeGreaterThan(0);
    // …and the beat is before the league: the run is not over when the heir takes over.
    expect(runIsComplete(lastWithStarter.save, content.gyms, balance)).toBe(false);
  });

  it("the finale's own act is reachable, with the Sanctum open and the run not yet over", () => {
    const preFinale = must(`act-${String(lastAct(balance))}`);
    expect(runIsComplete(preFinale.save, content.gyms, balance)).toBe(false);
    expect(badgeCount(preFinale.save, content.gyms, balance)).toBe(content.gyms.length - 1);
    // Every node the region has is open by the last act — which is what makes this the checkpoint
    // an epilogue or a survey audit starts from.
    expect(preFinale.unlockedNodes.length).toBeGreaterThan(
      unlockedNodeIds(firstAct(balance), balance).length,
    );
  });

  it("the finished run is reachable — every leader beaten, which is what ends it", () => {
    const done = must(RUN_COMPLETE_ID);
    expect(runIsComplete(done.save, content.gyms, balance)).toBe(true);
    expect(badgeCount(done.save, content.gyms, balance)).toBe(content.gyms.length);
    // …and it got there through the tape, not through the off-tape story flag: `core/acts.ts`
    // `runIsComplete` reads two things, and only the badge half can be recorded.
    expect(count(done.file.tape, "gymVictory")).toBe(content.gyms.length);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §6 What the tape cannot carry — measured, not assumed
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§6 the off-tape prelude is real, and it is the only thing outside the recording", () => {
  it("BINDS — without the prelude the same tape replays to a different act", () => {
    /*
     * THE MEASUREMENT BEHIND THE DESIGN. `core/types.ts` `GameAction` is a closed union with no
     * member that can carry a quest flag, so `story.opening.done` — the whole of act 1's gate in
     * `balance.acts.gates` — cannot be recorded. This drives that: replay the act-1 tape onto an
     * initial save that has NOT had the prologue applied, and the act model answers the prologue act
     * instead. It is why `CheckpointFile.prologue` exists and why it is a boolean rather than a
     * hand-written flag list.
     */
    const id = `act-${String(firstAct(balance) + 1)}`;
    const c = must(id);
    const initial = checkpointInitialSave(content, c.file.seed);

    const withPrelude = replayTape(applyPrologue(initial, content.gyms, balance), c.file.tape, content);
    expect(actOf(withPrelude, content.gyms, balance)).toBe(claimOf(id, balance).act);

    const without = replayTape(initial, c.file.tape, content);
    expect(actOf(without, content.gyms, balance)).toBe(firstAct(balance));
    expect(actOf(without, content.gyms, balance)).not.toBe(claimOf(id, balance).act);
  });

  it("the prelude writes only flags the act ladder itself asks for", () => {
    // A checkpoint cannot smuggle state in through the prelude, because the prelude is code both
    // the generator and the loader run and its flag names come out of `balance.acts.gates`.
    const initial = checkpointInitialSave(content, balance.rng.defaultSeed);
    const after = applyPrologue(initial, content.gyms, balance);
    const added = Object.keys(after.questFlags).filter((k) => !(k in initial.questFlags));
    for (const flag of prologueExitFlags(balance)) expect(added).toContain(flag);
    // `enterPendingActs` adds its own latch and nothing else; nothing here invents a story flag.
    expect(added.length).toBeLessThanOrEqual(prologueExitFlags(balance).length + 1);
  });

  it("each checkpoint says out loud what its recording left out", () => {
    for (const c of loaded) {
      expect(c.file.notOnTape.length).toBeGreaterThan(0);
      // The loader repeats it, so an agent that only reads the return value is still told.
      expect(c.provenance.join("\n")).toContain("NOT on the tape");
      expect(c.provenance.join("\n")).toContain("host-applied: currentNode");
    }
  });

  it("the ecology a checkpoint loads with really was stepped — the season step ran on the replay path", () => {
    /*
     * WHAT THIS IS EVIDENCE OF, and what it is not. `replay` steps the region off
     * `subsystemRng(seed, sim)` from draw 0, exactly as the live drive did, so the counts a
     * checkpoint loads with are the recorded run's — the generator refuses to emit a tape whose
     * replay disagrees with the run byte for byte, which is where that equality is proven. What
     * THIS test adds is the thing that equality cannot see: that the numbers moved AT ALL. A
     * `replay` handed no `ecosimStep`, or one that served every node back unstepped, would produce a
     * region frozen at year 1 — and a frozen region equals a frozen region perfectly well.
     */
    const done = must(RUN_COMPLETE_ID);
    const untouched = checkpointInitialSave(content, done.file.seed);
    let moved = 0;
    for (const nodeId of Object.keys(untouched.nodeStates)) {
      const before = untouched.nodeStates[nodeId];
      const after = done.save.nodeStates[nodeId];
      if (!before || !after) continue;
      for (const lineId of Object.keys(before.populations)) {
        if (before.populations[lineId]?.count !== after.populations[lineId]?.count) moved += 1;
      }
    }
    expect(moved).toBeGreaterThan(0);
    // …and the tape really did ask for those steps, so the movement is the recording's and not a
    // side effect of something else touching nodeStates.
    expect(count(done.file.tape, "seasonStep")).toBeGreaterThan(0);
  });
});
