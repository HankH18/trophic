/**
 * tests/unit/acts.test.ts — the ACT model (core/acts.ts), TROPHIC's second clock.
 *
 * Authorised by Hank: *"the game should progress based on the player
 * going through the gyms and side events, not based on year progression. Simply switch out the time
 * check points for event check points."*
 *
 * The whole file exists to hold ONE property that nothing else can hold for it: **the calendar and
 * the act do not touch.** Every test below is either "a badge moved the act" or "a year did not",
 * and the two are asserted against each other rather than separately — a suite that only checked
 * `actOf` returned the right number would pass just as happily on a model that read `save.year`.
 */

import { describe, expect, it } from "vitest";
import {
  ACT_ENTERED_FLAG,
  ActError,
  actGates,
  actOf,
  awardBadge,
  badgeCount,
  badgeFlagFor,
  firstAct,
  gateForAct,
  gateSatisfied,
  gymForAct,
  hasBadge,
  lastAct,
  lastActEntered,
  markActEntered,
  markRunCompleteShown,
  nodeUnlockedAt,
  pendingActEntries,
  prologueExitFlags,
  RUN_COMPLETE_SHOWN_FLAG,
  runCompleteFlag,
  runCompleteShown,
  runIsComplete,
  setQuestFlags,
  ungatedNodeIds,
  unlockActOf,
  unlockedNodeIds,
} from "../../core/acts";
import { advanceAction, createClock } from "../../core/clock";
import { enterPendingActs, runYearTurn } from "../../core/lifecycle";
import { newSave, type SaveEnvelope } from "../../core/save";
import { validateContent } from "../../core/schemas";
import type { Balance, SaveFile } from "../../core/types";

const content = validateContent();
const balance = content.balance;
const gyms = content.gyms;
const nodes = content.nodes;

const fresh = (): SaveEnvelope =>
  newSave({ seed: balance.rng.defaultSeed, currentNode: "hearthollow", nodes }, balance);

/** The ordered leaders, act 1 first. */
const ladder = [...gyms].sort((a, b) => a.act - b.act);

/** A save that has done the opening and beaten the first `n` leaders — nothing else. */
function withBadges(n: number, save: SaveEnvelope = fresh()): SaveEnvelope {
  let out: SaveEnvelope = { ...save, questFlags: { ...save.questFlags, "story.opening.done": true } };
  for (let i = 0; i < n; i += 1) {
    const gym = ladder[i];
    if (!gym) break;
    out = { ...out, ...awardBadge(out, gym.id, balance) };
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════ */

describe("acts — the gates are data, and the data is a ladder", () => {
  it("reads every gate from balance.acts and invents none", () => {
    const gates = actGates(balance);
    expect(gates.length).toBeGreaterThan(0);
    expect(firstAct(balance)).toBe(balance.acts.first);
    expect(lastAct(balance)).toBe(balance.acts.last);
    // Consecutive, ascending, non-decreasing badge cost — the ladder core/schemas.ts checks at boot.
    gates.forEach((gate, i) => {
      if (i === 0) expect(gate.act).toBe(firstAct(balance));
      else expect(gate.act).toBe((gates[i - 1]?.act ?? -1) + 1);
      expect(gate.badges).toBeGreaterThanOrEqual(gates[i - 1]?.badges ?? 0);
    });
    // Every leader sits on a gated act, so no gym is unreachable by the act model.
    for (const gym of gyms) expect(gateForAct(gym.act, balance)).not.toBeNull();
    expect(gymForAct(ladder[0]?.act ?? -1, gyms)?.id).toBe(ladder[0]?.id);
  });

  it("fails loudly when the act model is stripped out of balance rather than defaulting open", () => {
    /*
     * INV-3. `core/schemas.ts` validates balance.json with `z.object`, which STRIPS unknown keys, so
     * a group that is in the file but not in the schema silently never arrives. An act model that
     * defaulted to "everything unlocked" would be that failure wearing a playable disguise.
     */
    const stripped = { ...balance, acts: undefined } as unknown as Balance;
    expect(() => actOf(fresh(), gyms, stripped)).toThrow(ActError);
    expect(() => actOf(fresh(), gyms, stripped)).toThrow(/balance\.acts is missing/u);
    const empty = { ...balance, acts: { ...balance.acts, gates: [] } } as Balance;
    expect(() => unlockedNodeIds(3, empty)).toThrow(ActError);
  });

  it("the badge flag is the one data/dialogue.json already reads", () => {
    expect(badgeFlagFor("maribel", balance)).toBe("gym.maribel.beaten");
    expect(runCompleteFlag(balance)).toBe("story.greaves.beaten");
    const save = awardBadge(fresh(), "maribel", balance);
    expect(hasBadge(save, "maribel", balance)).toBe(true);
    expect(hasBadge(save, "odo", balance)).toBe(false);
    expect(badgeCount(save, gyms, balance)).toBe(1);
    // Counted over the SHIPPED leaders, so a stray flag cannot buy an act.
    const stray = { ...save, questFlags: { ...save.questFlags, "gym.nobody.beaten": true } };
    expect(badgeCount(stray, gyms, balance)).toBe(1);
  });
});

describe("acts — AN ACT ADVANCES ON A BADGE AND NEVER ON A YEAR TURN", () => {
  it("a badge advances the act; nothing else does", () => {
    let save = fresh();
    expect(actOf(save, gyms, balance)).toBe(firstAct(balance));

    // The prologue's own flag is the act-0 → act-1 gate, and it is a FLAG, not a date.
    save = { ...save, questFlags: { ...save.questFlags, "story.opening.done": true } };
    expect(actOf(save, gyms, balance)).toBe(1);

    for (let i = 0; i < ladder.length - 1; i += 1) {
      const before = actOf(save, gyms, balance);
      const gym = ladder[i];
      if (!gym) break;
      save = { ...save, ...awardBadge(save, gym.id, balance) };
      expect(actOf(save, gyms, balance)).toBe(before + 1);
    }
    expect(actOf(save, gyms, balance)).toBe(lastAct(balance));
  });

  it("A YEAR TURN MOVES NO ACT — twelve of them, and the act never budges", () => {
    /*
     * The decoupling, from the calendar's side. Twelve year turns is double the six years the old
     * model equated with six acts; the act stays exactly where the badges left it.
     */
    for (const badges of [0, 1, 3, 5]) {
      let save: SaveFile = withBadges(badges);
      const act = actOf(save, gyms, balance);
      for (let i = 0; i < 12; i += 1) {
        save = runYearTurn(save, { species: content.species, balance, nodes }).save;
        expect(actOf(save, gyms, balance)).toBe(act);
      }
      expect(save.year).toBe(balance.clock.startYear + 12);
      expect(actOf(save, gyms, balance)).toBe(act);
    }
  });

  it("A PLAYER AT YEAR 10 IN ACT 1 IS LEGAL, and so is one at year 3 forever", () => {
    // No fail state, no time limit, no year cap: neither of these is an error and nothing reports one.
    const slow: SaveFile = { ...withBadges(0), year: 10, tick: 7 };
    expect(actOf(slow, gyms, balance)).toBe(1);
    expect(runIsComplete(slow, gyms, balance)).toBe(false);
    expect(() => runYearTurn(slow, { species: content.species, balance, nodes })).not.toThrow();

    // And a fast one: every badge earned while the calendar is still in its first year.
    const fast = withBadges(ladder.length - 1);
    expect(fast.year).toBe(balance.clock.startYear);
    expect(actOf(fast, gyms, balance)).toBe(lastAct(balance));
  });

  it("spending a whole year's ticks changes no act, and the act is not a function of the clock", () => {
    let save: SaveFile = withBadges(2);
    const act = actOf(save, gyms, balance);
    let clock = createClock(balance);
    for (let i = 0; i < balance.clock.ticksPerYear * 3; i += 1) {
      clock = advanceAction(clock, "foray", balance).clock;
      save = { ...save, year: clock.year, tick: clock.tick };
      expect(actOf(save, gyms, balance)).toBe(act);
    }
    expect(save.year).toBeGreaterThan(balance.clock.startYear);
  });
});

describe("acts — the run ends on an act condition and on nothing else", () => {
  it("runIsComplete is a flag, never a date", () => {
    const late: SaveFile = { ...withBadges(ladder.length - 1), year: 99 };
    expect(runIsComplete(late, gyms, balance)).toBe(false);
    const done = { ...late, questFlags: { ...late.questFlags, [runCompleteFlag(balance)]: true } };
    expect(runIsComplete(done, gyms, balance)).toBe(true);
    // …and it is still true in the start year: earning it early ends the run early.
    const early: SaveFile = { ...(done as SaveFile), year: balance.clock.startYear };
    expect(runIsComplete(early, gyms, balance)).toBe(true);
  });

  /*
   * THE DEFECT THIS PINS, and it is the one that makes "the player reaches the ending and sees
   * nothing" real. `balance.acts.runCompleteFlag` is `story.greaves.beaten`, which ONLY
   * data/dialogue.json writes — and nothing in game/ reads that file. So the
   * only end condition in the game was unreachable in the shipped build, where the calendar
   * condition it replaced did fire. `onRunComplete` is the seam Hard Req 7's epilogue survey and
   * the Vellsire choice hang off, and it is on build-doc §16's never-cut list.
   */
  it("BINDS — beating every leader completes the run, with no dialogue flag at all", () => {
    const all = withBadges(ladder.length);
    expect(badgeCount(all, gyms, balance)).toBe(gyms.length);
    expect(all.questFlags[runCompleteFlag(balance)]).toBeUndefined();
    expect(runIsComplete(all, gyms, balance)).toBe(true);

    // One short is not the ending — the disjunction cannot become "nearly finished counts".
    expect(runIsComplete(withBadges(ladder.length - 1), gyms, balance)).toBe(false);
  });

  it("does not complete VACUOUSLY when a content set has no leaders", () => {
    // `badgeCount >= gyms.length` is trivially true of an empty roster; a run with no gyms ends on
    // the story flag or not at all, never on the first frame.
    expect(runIsComplete(fresh(), [], balance)).toBe(false);
    const flagged = {
      ...fresh(),
      questFlags: { ...fresh().questFlags, [runCompleteFlag(balance)]: true },
    };
    expect(runIsComplete(flagged, [], balance)).toBe(true);
  });

  it("the hand-over latch is a save flag, so an ending cannot replay on a reload", () => {
    const done = withBadges(ladder.length);
    expect(runCompleteShown(done)).toBe(false);
    const shown = markRunCompleteShown(done);
    expect(runCompleteShown(shown)).toBe(true);
    // Pure, and idempotent: marking twice is the same save.
    expect(markRunCompleteShown(shown)).toEqual(shown);
    expect(done.questFlags[RUN_COMPLETE_SHOWN_FLAG]).toBeUndefined();
  });
});

describe("acts — the prologue's exit condition is read from the gates, never spelled in code", () => {
  it("prologueExitFlags IS the act-1 gate's flag list", () => {
    const gate = gateForAct(firstAct(balance) + 1, balance);
    expect(gate).not.toBeNull();
    expect(prologueExitFlags(balance)).toEqual(gate?.flags);
    // Non-empty on the shipped ladder: this is the rung that had no writer in game/.
    expect(prologueExitFlags(balance).length).toBeGreaterThan(0);
    // A copy, not the live array — writing through it must not retune balance.acts.
    prologueExitFlags(balance).push("story.injected");
    expect(prologueExitFlags(balance)).toEqual(gate?.flags);
  });

  it("setting them is exactly what moves a fresh save off the prologue", () => {
    const start = fresh();
    expect(actOf(start, gyms, balance)).toBe(firstAct(balance));
    expect(unlockedNodeIds(actOf(start, gyms, balance), balance)).toEqual(
      gateForAct(firstAct(balance), balance)?.nodes,
    );
    const opened = setQuestFlags(start, prologueExitFlags(balance));
    expect(actOf(opened, gyms, balance)).toBe(firstAct(balance) + 1);
    // Pure — the input save is untouched.
    expect(actOf(start, gyms, balance)).toBe(firstAct(balance));
  });
});

describe("acts — what an act opens (content-bible §6's towns and routes)", () => {
  it("unlocks are cumulative and every gated node is a real node", () => {
    const seen = new Set<string>();
    for (const gate of actGates(balance)) {
      for (const nodeId of gate.nodes) {
        expect(nodes.some((n) => n.id === nodeId), nodeId).toBe(true);
        seen.add(nodeId);
      }
      const open = unlockedNodeIds(gate.act, balance);
      expect(open).toEqual([...seen].sort());
      for (const nodeId of seen) expect(nodeUnlockedAt(nodeId, gate.act, balance)).toBe(true);
    }
    // Reaching the last act does not close the first act's town.
    expect(nodeUnlockedAt("hearthollow", lastAct(balance), balance)).toBe(true);
  });

  it("a node is shut before its act and open from it on", () => {
    for (const gate of actGates(balance)) {
      for (const nodeId of gate.nodes) {
        expect(unlockActOf(nodeId, balance)).toBeLessThanOrEqual(gate.act);
        const opensAt = unlockActOf(nodeId, balance) as number;
        if (opensAt > firstAct(balance)) {
          expect(nodeUnlockedAt(nodeId, opensAt - 1, balance)).toBe(false);
        }
        expect(nodeUnlockedAt(nodeId, opensAt, balance)).toBe(true);
      }
    }
  });

  it("reports nodes no act opens rather than treating them as open (G2)", () => {
    const ids = nodes.map((n) => n.id);
    // The shipped region: every node is gated, so the honest report is empty.
    expect(ungatedNodeIds(ids, balance)).toEqual([]);
    // And it BINDS: an invented node comes back as ungated rather than silently unlocked.
    expect(ungatedNodeIds([...ids, "moonbase"], balance)).toEqual(["moonbase"]);
    expect(unlockActOf("moonbase", balance)).toBeNull();
  });
});

describe("acts — entry fires once per act, in order", () => {
  it("pending entries are every act reached and not yet entered, ascending", () => {
    const save = fresh();
    expect(lastActEntered(save, balance)).toBe(firstAct(balance) - 1);
    expect(pendingActEntries(save, gyms, balance)).toEqual([firstAct(balance)]);

    // Two gates satisfied by one write: BOTH are pending, so no act's beats are skipped.
    const jumped = withBadges(1);
    expect(pendingActEntries(jumped, gyms, balance)).toEqual([0, 1, 2]);

    const marked = markActEntered(jumped, 1);
    expect(lastActEntered(marked, balance)).toBe(1);
    expect(pendingActEntries(marked, gyms, balance)).toEqual([2]);
    expect(marked.questFlags[ACT_ENTERED_FLAG]).toBe(1);
  });

  it("entering is idempotent — the latch survives, so a raid cannot be applied twice", () => {
    const raid = balance.yearEvents.raids[0];
    expect(raid).toBeDefined();
    if (!raid) return;
    let save: SaveFile = withBadges(raid.act - 1);
    expect(actOf(save, gyms, balance)).toBe(raid.act);

    const first = enterPendingActs(save, { balance, gyms });
    save = first.save;
    expect(first.actsEntered).toContain(raid.act);
    const counted = save.nodeStates[raid.nodeId]?.populations[raid.targets[0]?.lineId ?? ""]?.count;

    for (let i = 0; i < 5; i += 1) {
      const again = enterPendingActs(save, { balance, gyms });
      expect(again.actsEntered).toEqual([]);
      save = again.save;
    }
    expect(save.nodeStates[raid.nodeId]?.populations[raid.targets[0]?.lineId ?? ""]?.count).toBe(counted);
  });

  it("gateSatisfied is all-of on flags and at-least on badges", () => {
    const gate = { act: 99, badges: 2, flags: ["a", "b"], nodes: [] };
    const two = withBadges(2);
    expect(gateSatisfied(gate, two, gyms, balance)).toBe(false);
    const withA = { ...two, questFlags: { ...two.questFlags, a: true } };
    expect(gateSatisfied(gate, withA, gyms, balance)).toBe(false);
    const withBoth = { ...withA, questFlags: { ...withA.questFlags, a: true, b: true } };
    expect(gateSatisfied(gate, withBoth, gyms, balance)).toBe(true);
    // One badge short is short, however many flags are set.
    const oneShort = { ...withBadges(1), questFlags: { ...withBoth.questFlags } };
    expect(gateSatisfied(gate, { ...oneShort, questFlags: { a: true, b: true } }, gyms, balance)).toBe(false);
  });
});
