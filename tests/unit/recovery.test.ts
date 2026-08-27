/**
 * tests/unit/recovery.test.ts — a wiped party can carry on, and it costs exactly what Hank priced.
 *
 * ══ WHAT WAS TRUE BEFORE, AND WHY IT ONLY BECAME TRUE RECENTLY ══
 * `game/wild-battle.ts` `applyBattleResult` writes `curHp` back to the save. Before that, damage
 * evaporated between fights and an all-fainted party was not a state the game could reach. It is
 * reachable now, and three shipped behaviours then close around it: `core/lifecycle.ts` keeps a
 * zero at zero through the year turn, the inn charges ticks and heals nothing, and all four
 * `*BattleProblem` launchers refuse a party with nothing standing. §6 below is that dead end,
 * demonstrated through the real reducer and then reopened.
 *
 * ══ WHAT IS PROVED, EACH WRITTEN TO BE ABLE TO FAIL ══
 *   §1 the wipe is DETECTED — through `game/wild-battle.ts` `isStanding`, the one spelling — and an
 *      empty party and a party with anything left standing are both told apart from it;
 *   §2 the recovery RESTORES: the party comes back to full, in the spelling the reducer reads as
 *      full, and a fight can be launched off the result;
 *   §3 the destination rule is TOTAL over all twelve shipped nodes, always lands on a node with an
 *      inn, and never lands on one gated above the node it was reached from;
 *   §4 the price is exactly two inns plus one travel, composed from `balance.clock`, and it is
 *      levied ONCE — measured by driving the real clock and re-reading the tape;
 *   §5 L10 — the entry replays to the state the live path landed on, and applying it twice is
 *      applying it once;
 *   §6 THE RUN CANNOT BE BLOCKED: a save wiped at any of the twelve nodes yields a save that can
 *      act;
 *   §7 the beat is cued by the recovery and closed by itself, so a black-screen line is reachable
 *      exactly while a blackout is owed and at no other time;
 *   §8 THE INN HEALS WHAT IT CHARGES FOR — the same selection and the same write as the blackout,
 *      at `clock.innTicks` and with no move; a full party resting is charged and not refused; the
 *      consequence rides its own absolute tape entry and carries no price; and the two recoveries
 *      stay coherent about what the blackout's extra ticks are buying.
 *
 * ══ WHY NO FIXTURE NAMES A SPECIES, A TOWN, A TICK COUNT OR AN HP NUMBER ══
 * Every one of them is READ: the wipe is produced by playing a shipped matchup to a loss, the inn
 * nodes come from the corpus, the graph comes from `data/nodes/`, the price comes from
 * `balance.clock`. Naming one would be G2 or G11, and a fixture pinned to today's numbers would go
 * red for a reason that is not the seam under test.
 *
 * No engine import: every module under test is engine-free on purpose (L11).
 */

import { describe, expect, it } from "vitest";

import { unlockActOf } from "@core/acts";
import { startBattle, step as battleStep, type BattleContext } from "@core/battle";
import { advanceAction, subTicksForAction, ticksForAction, type ClockState } from "@core/clock";
import { DIALOGUE, conditionHolds, entryById } from "@core/dialogue-schema";
import { toEcoNode } from "@core/foodweb";
import { INTERIORS } from "@core/interiors";
import {
  BLACKOUT_COST,
  BLACKOUT_CUE_FLAG,
  BLACKOUT_ENTRY_ID,
  INN_REST_ACTION,
  RecoveryError,
  applyBlackoutRecovery,
  applyInnRest,
  blackoutCharges,
  blackoutRecoveryFor,
  blackoutSubTicks,
  blackoutTicks,
  innNodeIds,
  innRestFor,
  innkeeperAt,
  partyIsDown,
  readInnRest,
  restBeatAt,
  restoreParty,
  wakeNodeFor,
} from "@core/recovery";
import { subsystemRng } from "@core/rng";
import { validateContent } from "@core/schemas";
import {
  BLACKOUT_ACTION,
  SaveCorruptError,
  appendAction,
  applyBlackout,
  blackoutAction,
  canonicalStringify,
  deserialize,
  newSave,
  readBlackout,
  replay,
  serialize,
  type BlackoutRecovery,
  type SaveEnvelope,
} from "@core/save";
import type { BattleInput, BattleState, Content, NodeFile, OwnedCreature } from "@core/types";
import { TALK_KINDS, dialogueContext, talkEntryFor } from "@game/dialogue-runner";
import type { Encounter } from "@game/encounters";
import {
  applyBattleResult,
  buildWildBattle,
  isStanding,
  partyProblem,
  provisionalStarter,
  standingSpecs,
  wildBattleProblem,
} from "@game/wild-battle";
import { clockFromLog } from "@game/year-replay";

const content: Content = validateContent();
const balance = content.balance;

/** The route the sibling persistence file measures at, so a fixture here is the fixture there. */
const NODE = "r1";

/** Every node the region ships, read from content — the domain §3 and §6 must be total over. */
const ALL_NODE_IDS: readonly string[] = content.nodes.map((n) => n.id);

function nodeFile(id: string): NodeFile {
  const found = content.nodes.find((n) => n.id === id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
}

function starter(): OwnedCreature {
  const base = provisionalStarter(content);
  if (!base) throw new Error("data ships no starter line — the fixture cannot be built");
  return base;
}

function saveAt(nodeId: string, party: OwnedCreature[]): SaveEnvelope {
  const save = newSave({ seed: 4242, currentNode: nodeId, nodes: content.nodes }, balance);
  return { ...save, party };
}

/** The active player battler's first move — the reducer's own list, never a move id typed here. */
function firstMove(state: BattleState): Parameters<typeof battleStep>[1] {
  const active = state.battlers[state.activePlayerUid];
  const moveId = active?.moves[0];
  if (moveId === undefined) throw new Error("the active player battler knows no moves");
  return { kind: "move", moveId };
}

function playOut(input: BattleInput, ctx: BattleContext, cap = 4000): BattleState {
  const rng = subsystemRng(input.seed, "battle");
  let state = startBattle(input, ctx).state;
  for (let turn = 0; state.outcome === null && turn < cap; turn += 1) {
    state = battleStep(state, firstMove(state), rng, ctx).state;
  }
  return state;
}

/**
 * A save whose party was REALLY knocked down, through the shipped launcher and the real reducer.
 *
 * ⚠ NOT HAND-BUILT, and that is the anti-stub-blindness half of this file: a party hand-written
 * with `curHp: 0` proves that the recovery handles a shape a test typed, not that a fight can
 * produce it. A level-1 starter against a level-capped wild is the same rig
 * `tests/unit/battle-persistence.test.ts` §5 uses to reach this state, and the loss is asserted
 * before anything is read off it.
 */
function wipedAt(nodeId: string): { before: SaveEnvelope; after: SaveEnvelope } {
  const before = saveAt(nodeId, [{ ...starter(), level: 1 }]);
  const lines = Object.keys(nodeFile(NODE).populations);
  const encounter: Encounter = {
    nodeId: NODE,
    lineId: lines[0] as string,
    age: "J",
    level: balance.xp.levelCap,
    traits: [],
  };
  const built = buildWildBattle({
    content,
    save: before,
    encounter,
    node: toEcoNode(nodeFile(NODE)),
  });
  const state = playOut(built.input, built.ctx);
  if (state.outcome !== "loss") {
    throw new Error(
      `the wipe rig did not lose at ${nodeId} (outcome ${String(state.outcome)}) — every assertion ` +
        "below would then be about a party that was never knocked down. Re-find the matchup; do " +
        "not weaken the assertion.",
    );
  }
  return { before, after: { ...applyBattleResult(before, state), currentNode: nodeId } };
}

const recoveryOf = (save: SaveEnvelope): BlackoutRecovery => {
  const found = blackoutRecoveryFor(save, content, isStanding);
  if (!found) throw new Error("blackoutRecoveryFor answered null on a save it should recover");
  return found;
};

/**
 * The whole LIVE sequence the shell performs, in one place: the consequence first, then the three
 * charges, each logged at the clock it was taken at and then advanced through the real clock.
 *
 * The order is the shell's and it is load-bearing — see `core/recovery.ts` `applyBlackoutRecovery`.
 * Having it here rather than inline in two tests is what lets §5 strip ONE entry out of a REAL
 * tape: a tape with only the consequence on it cannot show that the priced entries beside it are
 * prices and not a second way to move the player.
 */
function liveBlackout(save: SaveEnvelope): {
  recovery: BlackoutRecovery;
  start: ClockState;
  save: SaveEnvelope;
} {
  const recovery = recoveryOf(save);
  const start: ClockState = { year: save.year, tick: save.tick, subTick: save.subTick ?? 0 };
  let next = applyBlackoutRecovery(save, recovery);
  for (const charge of blackoutCharges(recovery)) {
    next = appendAction(next, charge.action);
    const advanced = advanceAction(
      { year: next.year, tick: next.tick, subTick: next.subTick ?? 0 },
      charge.kind,
      balance,
    );
    next = { ...next, year: advanced.clock.year, tick: advanced.clock.tick, subTick: advanced.clock.subTick };
  }
  return { recovery, start, save: next };
}

/* ════════════════════════════════════════════════════════════════════════════
 * §1 The wipe is detected — and told apart from the two states that look like it
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 a wiped party is detected", () => {
  it("a party knocked down by a real fight reads as down", () => {
    const { before, after } = wipedAt(NODE);
    // THE RIG FIRST: the same save was upright before the fight, so the assertion below is about
    // the fight and not about the fixture.
    expect(partyIsDown(before, isStanding)).toBe(false);
    expect(standingSpecs(after)).toHaveLength(0);
    expect(partyIsDown(after, isStanding)).toBe(true);
  });

  it("a party with anything still standing is NOT down", () => {
    const { after } = wipedAt(NODE);
    const upright: SaveEnvelope = { ...after, party: [...after.party, { ...starter(), uid: "spare" }] };
    expect(partyIsDown(upright, isStanding)).toBe(false);
    expect(blackoutRecoveryFor(upright, content, isStanding)).toBeNull();
  });

  it("an EMPTY party is a different state and gets a different answer", () => {
    /*
     * `partyProblem` reports both as a refusal and is right to. But nothing went down, so there is
     * nothing to put back up, and charging a blackout for it would be a price with no consequence.
     * The opening beat owns that state.
     */
    const empty = saveAt(NODE, []);
    expect(partyProblem(empty)).toContain("no creature");
    expect(partyIsDown(empty, isStanding)).toBe(false);
    expect(blackoutRecoveryFor(empty, content, isStanding)).toBeNull();
  });

  it("a BOXED creature does not keep a wiped party on its feet", () => {
    // `partySpecs` filters `boxed !== true`, so a boxed creature is never fielded and cannot be the
    // reason a fight is refused — nor the reason a blackout is not owed.
    const { after } = wipedAt(NODE);
    const withBoxed: SaveEnvelope = {
      ...after,
      party: [...after.party, { ...starter(), uid: "boxed-one", boxed: true }],
    };
    expect(partyIsDown(withBoxed, isStanding)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 The recovery restores
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 the recovery puts the party back on its feet", () => {
  it("every party member comes back at full — the spelling core/battle.ts reads as full", () => {
    const { after } = wipedAt(NODE);
    expect(after.party.every((c) => c.curHp === 0)).toBe(true);

    const recovered = applyBlackoutRecovery(after, recoveryOf(after));
    for (const creature of recovered.party) {
      // `curHp` ABSENT, not zero and not a computed number: `game/wild-battle.ts` isStanding —
      // "`curHp === undefined` means full" — and `core/battle.ts` makeBattler reads it as maxHp.
      expect(Object.prototype.hasOwnProperty.call(creature, "curHp")).toBe(false);
      expect(isStanding(creature)).toBe(true);
    }
  });

  it("a boxed creature is left exactly as it was", () => {
    const { after } = wipedAt(NODE);
    const boxed: OwnedCreature = { ...starter(), uid: "boxed-one", boxed: true, curHp: 1 };
    const save: SaveEnvelope = { ...after, party: [...after.party, boxed] };
    const recovered = applyBlackoutRecovery(save, recoveryOf(save));
    expect(recovered.party.find((c) => c.uid === "boxed-one")?.curHp).toBe(1);
  });

  it("level and xp are untouched — a blackout heals, it does not un-fight the fight", () => {
    const { after } = wipedAt(NODE);
    const recovered = applyBlackoutRecovery(after, recoveryOf(after));
    for (const before of after.party) {
      const now = recovered.party.find((c) => c.uid === before.uid);
      expect(now?.level).toBe(before.level);
      expect(now?.xp).toBe(before.xp);
    }
  });

  it("an interior is left, because currentNode has moved out from under it", () => {
    const { after } = wipedAt(NODE);
    const indoors: SaveEnvelope = { ...after, interiorId: "hearthollow-inn" };
    const recovered = applyBlackoutRecovery(indoors, recoveryOf(indoors));
    expect(Object.prototype.hasOwnProperty.call(recovered, "interiorId")).toBe(false);
  });

  it("a recovery naming a uid the save does not have is refused LOUDLY", () => {
    const { after } = wipedAt(NODE);
    const bogus: BlackoutRecovery = { wakeNode: innNodeIds()[0] as string, restored: ["not-in-this-save"] };
    expect(() => applyBlackout(after, bogus)).toThrow(SaveCorruptError);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 The destination rule is TOTAL
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 where the player wakes, over every node the region ships", () => {
  it("the rig covers the whole region, and most of it has no inn", () => {
    // Otherwise §3 could be total over a domain of towns and prove nothing about a route.
    expect(ALL_NODE_IDS.length).toBeGreaterThanOrEqual(12);
    const inns = new Set(innNodeIds());
    expect(ALL_NODE_IDS.filter((id) => !inns.has(id)).length).toBeGreaterThan(inns.size);
  });

  it("three independent readings of 'there is an inn here' agree", () => {
    /*
     * `innNodeIds` intersects two of them itself. The third is the corpus's rest beats read
     * directly, and it is here because the near miss is expensive: `content.gyms[].town` also looks
     * like the town list and is NOT — its sixth row is the Sanctum, which has no inn, no innkeeper
     * and no beds, and a rule built on it would carry a wiped player INTO the finale's node.
     */
    const inns = [...innNodeIds()].sort();
    const restNodes = [
      ...new Set(
        DIALOGUE.entries
          .filter((e) => e.kind === "service" && innkeeperAt(e.node) === e.speaker)
          .map((e) => e.node),
      ),
    ].sort();
    expect(restNodes).toEqual(inns);

    const gymTowns = [...new Set(content.gyms.map((g) => g.town))];
    expect(gymTowns.filter((t) => !inns.includes(t)).length, "the near miss is still a near miss").toBeGreaterThan(0);
  });

  it("every node answers, and every answer is a node with an inn", () => {
    const inns = new Set(innNodeIds());
    for (const id of ALL_NODE_IDS) {
      const wake = wakeNodeFor(id, content);
      expect(inns.has(wake), `${id} woke at "${wake}", which has no inn`).toBe(true);
    }
  });

  it("a town wakes in itself", () => {
    for (const id of innNodeIds()) expect(wakeNodeFor(id, content)).toBe(id);
  });

  it("no destination is act-gated above the node it was reached from", () => {
    /*
     * THE TIEBREAK IS WHAT THIS MEASURES. Each of the routes between two towns is one hop from
     * both, and waking in the LATER one would put the player inside a town whose act gate they may
     * not have passed — a save standing somewhere the game refuses to travel to.
     */
    const gate = (id: string): number => unlockActOf(id, balance) ?? 0;
    let ties = 0;
    for (const id of ALL_NODE_IDS) {
      const wake = wakeNodeFor(id, content);
      expect(gate(wake), `${id} → ${wake} is gated above ${id}`).toBeLessThanOrEqual(gate(id));
      const inns = new Set(innNodeIds());
      if (nodeFile(id).adjacency.filter((n) => inns.has(n)).length > 1) ties += 1;
    }
    // …and the property is not vacuous: the region really does ship nodes with two inns one hop away.
    expect(ties, "no node has a tie, so the tiebreak was never exercised").toBeGreaterThan(0);
  });

  it("a node the region does not carry is refused, not guessed at", () => {
    /*
     * THE MESSAGE, not merely the class. `wakeNodeFor` has two refusals and they both throw
     * `RecoveryError`, so asserting the class alone passed a sabotage that deleted this guard and
     * fell through into the other one — measured, in this file's own sabotage sweep.
     */
    expect(() => wakeNodeFor("atlantis", content)).toThrow(RecoveryError);
    expect(() => wakeNodeFor("atlantis", content)).toThrow(/atlantis.*is not a node in data\/nodes/);
  });

  it("BINDS — a region with no inn reachable is reported rather than defaulted", () => {
    // Every node an island: the graph can no longer reach an inn from a route.
    const islands: Content = {
      ...content,
      nodes: content.nodes.map((n) => ({ ...n, adjacency: [] })),
    };
    const inns = new Set(innNodeIds());
    const route = ALL_NODE_IDS.find((id) => !inns.has(id)) as string;
    expect(() => wakeNodeFor(route, islands)).toThrow(RecoveryError);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4 The price
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 the price is two inns and one travel, charged once", () => {
  it("the cost list is exactly Hank's ruling, and carries no number of its own", () => {
    expect([...BLACKOUT_COST]).toEqual(["inn", "inn", "travel"]);
    expect(blackoutTicks(balance)).toBe(
      ticksForAction("inn", balance) + ticksForAction("inn", balance) + ticksForAction("travel", balance),
    );
    expect(blackoutSubTicks(balance)).toBe(
      subTicksForAction("inn", balance) +
        subTicksForAction("inn", balance) +
        subTicksForAction("travel", balance),
    );
  });

  it("it is composed from balance and not pinned to today's values", () => {
    /*
     * The retune test: move `clock.innTicks` and the blackout must move with it, by twice as much.
     * A price that survived this unchanged would be a literal somewhere.
     */
    const dearer = { ...balance, clock: { ...balance.clock, innTicks: balance.clock.innTicks + 1 } };
    expect(blackoutTicks(dearer)).toBe(blackoutTicks(balance) + 2);
  });

  it("the charges are three tape entries the clock and the log already understand", () => {
    /*
     * ASKED OF EVERY NODE, not of one. Measured in this file's sabotage sweep: at Route 1 the wake
     * node IS Hearthollow, so a charge hard-coded to "hearthollow" passed a single-node version of
     * this test unchanged. Five of the twelve nodes wake somewhere else.
     */
    const seen = new Set<string>();
    for (const id of ALL_NODE_IDS) {
      const recovery: BlackoutRecovery = { wakeNode: wakeNodeFor(id, content), restored: [] };
      seen.add(recovery.wakeNode);
      const charges = blackoutCharges(recovery);
      expect(charges.map((c) => c.kind)).toEqual([...BLACKOUT_COST]);
      for (const charge of charges) {
        // Both name the wake node, because both are true of it.
        const named =
          charge.action.t === "inn"
            ? charge.action.townId
            : charge.action.t === "travel"
              ? charge.action.to
              : null;
        expect(named, `${id} → ${recovery.wakeNode}`).toBe(recovery.wakeNode);
      }
    }
    expect(seen.size, "every node woke in the same town — the loop proves nothing").toBeGreaterThan(1);
  });

  it("driven through the real clock, the meter moves by exactly the composed price — once", () => {
    const { after } = wipedAt(NODE);
    const { start, save } = liveBlackout(after);

    const per = balance.clock.subTicksPerTick;
    const spent =
      (save.year - start.year) * balance.clock.ticksPerYear * per +
      (save.tick * per + save.subTick!) -
      (start.tick * per + start.subTick);
    expect(spent).toBe(blackoutSubTicks(balance));

    // …and the tape says the same thing, which is what makes the price survive a reload (L10).
    expect(clockFromLog(start, save.actionLog, balance)).toEqual({
      year: save.year,
      tick: save.tick,
      subTick: save.subTick,
    });
  });

  it("the CONSEQUENCE entry carries no price of its own — a price and a consequence, never both", () => {
    /*
     * `game/year-replay.ts` `clockFromLog` prices an entry by its `t`. If `blackout` were ever a
     * `ClockActionKind` the three entries beside it would be charged twice over.
     */
    const { after } = wipedAt(NODE);
    const recovery = recoveryOf(after);
    const start: ClockState = { year: after.year, tick: after.tick, subTick: after.subTick ?? 0 };
    const taped = appendAction(after, blackoutAction(recovery));
    expect(clockFromLog(start, taped.actionLog, balance)).toEqual(start);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §5 L10 — the tape replays to where the live path landed
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§5 determinism (build-doc §8.1 / L10)", () => {
  const deps = { gyms: content.gyms, species: content.species, balance, nodes: content.nodes };

  it("replaying the tape reproduces the party and the node the live path produced", () => {
    const { before, after } = wipedAt(NODE);
    const live = applyBlackoutRecovery(after, recoveryOf(after));

    // THE RIG FIRST: if the recovery changed nothing, an empty replay would agree trivially.
    expect(canonicalStringify(live.party)).not.toBe(canonicalStringify(after.party));
    expect(live.currentNode).not.toBe(after.currentNode);

    const replayed = replay({ ...before, actionLog: [] }, live.actionLog, deps);
    expect(canonicalStringify(replayed.party)).toBe(canonicalStringify(live.party));
    expect(replayed.currentNode).toBe(live.currentNode);
  });

  it("and it is the BLACKOUT ENTRY that carries it — the priced entries beside it are only prices", () => {
    /*
     * ⚠ THE TAPE HERE IS THE WHOLE LIVE ONE, CHARGES INCLUDED, and that is the difference between
     * this test and a decorative one. Measured in this file's sabotage sweep: against a tape
     * carrying only the consequence, teaching `replay` to move `currentNode` on a `travel` entry
     * was INVISIBLE, because there was no `travel` entry to teach it about. The blackout's price
     * IS a `travel` to the wake node, so the entry that looks most like a second way to move the
     * player is sitting right next to the one that really does it.
     */
    const { before, after } = wipedAt(NODE);
    const { save: live } = liveBlackout(after);
    expect(
      live.actionLog.some((e) => e.action.t === "travel"),
      "the rig's tape has no travel charge on it — the stripping below proves nothing",
    ).toBe(true);

    const stripped = live.actionLog
      .filter((e) => (e.action as { t: string }).t !== BLACKOUT_ACTION)
      .map((e, i) => ({ ...e, seq: i }));
    const replayed = replay({ ...before, actionLog: [] }, stripped, deps);
    expect(replayed.currentNode).toBe(before.currentNode);
    expect(replayed.party.every((c) => c.curHp === 0)).toBe(true);
  });

  it("the entry is ABSOLUTE — applied twice it is applied once", () => {
    const { after } = wipedAt(NODE);
    const recovery = recoveryOf(after);
    const once = applyBlackout(after, recovery);
    const twice = applyBlackout(once, recovery);
    expect(serialize(twice)).toBe(serialize(once));
  });

  it("the entry survives the save round-trip rather than being deleted on load", () => {
    const { after } = wipedAt(NODE);
    const live = applyBlackoutRecovery(after, recoveryOf(after));
    const reloaded = deserialize(serialize(live), balance);
    const entry = reloaded.actionLog.find((e) => (e.action as { t: string }).t === BLACKOUT_ACTION);
    expect(entry, "the tape lost the blackout on the way through storage").toBeDefined();
    expect(readBlackout(entry?.action)).toEqual({
      wakeNode: live.currentNode,
      restored: after.party.map((c) => c.uid),
    });
  });

  it("a malformed entry is null rather than a throw, so a hand-edited tape stays readable", () => {
    expect(readBlackout({ t: BLACKOUT_ACTION })).toBeNull();
    expect(readBlackout({ t: BLACKOUT_ACTION, recovery: { wakeNode: "", restored: [] } })).toBeNull();
    expect(readBlackout({ t: BLACKOUT_ACTION, recovery: { wakeNode: "x", restored: [1] } })).toBeNull();
    expect(readBlackout({ t: "travel", to: "x" })).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §6 THE RUN CANNOT BE BLOCKED
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§6 a wiped save can act again, wherever it went down", () => {
  it("the dead end is real before the recovery exists to open it", () => {
    const { after } = wipedAt(NODE);
    // The three shipped behaviours that close around a wipe, each asserted rather than assumed.
    expect(wildBattleProblem(after)).not.toBeNull();
    expect(after.party.every((c) => c.curHp === 0)).toBe(true);
  });

  it("at every one of the twelve shipped nodes", () => {
    const inns = new Set(innNodeIds());
    for (const id of ALL_NODE_IDS) {
      const { after } = wipedAt(id);
      expect(wildBattleProblem(after), `${id}: the rig was not blocked to begin with`).not.toBeNull();

      const recovered = applyBlackoutRecovery(after, recoveryOf(after));

      expect(partyProblem(recovered), `${id}: still blocked after the recovery`).toBeNull();
      expect(wildBattleProblem(recovered)).toBeNull();
      expect(standingSpecs(recovered).length).toBeGreaterThan(0);
      expect(inns.has(recovered.currentNode), `${id}: woke somewhere with no inn`).toBe(true);
      // …and the save is still a save: it loads.
      expect(() => deserialize(serialize(recovered), balance)).not.toThrow();
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §7 The beat
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§7 the black-screen beat is cued by the recovery and closed by itself", () => {
  const entry = entryById(DIALOGUE, BLACKOUT_ENTRY_ID);

  it("the entry ships, gated on the cue, and lowers the cue itself", () => {
    expect(entry, `${BLACKOUT_ENTRY_ID} is not in the corpus`).toBeDefined();
    expect(entry?.when?.flagsSet).toEqual([BLACKOUT_CUE_FLAG]);
    expect(entry?.setFlags?.[BLACKOUT_CUE_FLAG]).toBe(false);
    // `kind: "service"` is already walked by a selector in game/ — no new kind was invented.
    expect(TALK_KINDS).toContain(entry?.kind);
  });

  it("the recovery raises the cue, and nothing else on the save does", () => {
    const { after } = wipedAt(NODE);
    expect(after.questFlags[BLACKOUT_CUE_FLAG]).toBeUndefined();
    const recovered = applyBlackoutRecovery(after, recoveryOf(after));
    expect(recovered.questFlags[BLACKOUT_CUE_FLAG]).toBe(true);
  });

  it("the cue is NOT on the tape — no corpus flag is, and replay has no beat to lower it", () => {
    const { before, after } = wipedAt(NODE);
    const live = applyBlackoutRecovery(after, recoveryOf(after));
    const replayed = replay({ ...before, actionLog: [] }, live.actionLog, {
      gyms: content.gyms,
      species: content.species,
      balance,
      nodes: content.nodes,
    });
    expect(replayed.questFlags[BLACKOUT_CUE_FLAG]).toBeUndefined();
    // Absent and `false` are the same answer to every reader of the corpus, which is the point.
    expect(conditionHolds(entry?.when, ctxWithCue(replayed, undefined))).toBe(false);
    expect(conditionHolds(entry?.when, ctxWithCue(replayed, false))).toBe(false);
  });

  it("[E] cannot reach it while the cue is down, and can while it is up", () => {
    /*
     * ⚠ THIS IS WHY THE BEAT IS GATED AT ALL. `talkEntryFor` walks `service`, and it drops the
     * already-said exclusion once everything eligible has been heard — so an UNGATED black-screen
     * line is reachable by anyone pressing the interact key often enough in the town it sits in.
     */
    const node = entry?.node as string;
    const down = saveAt(node, [starter()]);
    const said = new Set(DIALOGUE.entries.filter((e) => e.node === node).map((e) => e.id));
    said.delete(BLACKOUT_ENTRY_ID);
    expect(talkEntryFor(DIALOGUE, node, dialogueContext(down, content), said)?.id).not.toBe(
      BLACKOUT_ENTRY_ID,
    );

    const up: SaveEnvelope = { ...down, questFlags: { ...down.questFlags, [BLACKOUT_CUE_FLAG]: true } };
    expect(conditionHolds(entry?.when, dialogueContext(up, content))).toBe(true);
  });

  it("the wake town's innkeeper is reused rather than re-authored — every one of them has a beat", () => {
    /*
     * "…and then you wake up at the inn." The room is the innkeeper's already-shipped rest beat, so
     * the only NEW copy this feature carries is the one black-screen entry above. This asks the
     * question through the real selector, at every node a blackout can end at.
     */
    const ctx = dialogueContext(saveAt(NODE, [starter()]), content);
    for (const town of innNodeIds()) {
      const speaker = innkeeperAt(town);
      expect(speaker, `${town} has an inn and no innkeeper`).not.toBeNull();
      const rest = restBeatAt(town, ctx);
      expect(rest, `${speaker ?? "?"} has no service beat at ${town} to wake into`).toBeDefined();
      expect(rest?.speaker).toBe(speaker);
      expect(rest?.node).toBe(town);
    }
    // …and it answers nothing at a node with no inn, rather than reaching for somebody else's beat.
    const inns = new Set(innNodeIds());
    const route = ALL_NODE_IDS.find((id) => !inns.has(id)) as string;
    expect(restBeatAt(route, ctx)).toBeUndefined();
  });
});

/** A dialogue context with the cue forced to a value, for the absent-vs-false read above. */
function ctxWithCue(save: SaveEnvelope, value: boolean | undefined): ReturnType<typeof dialogueContext> {
  const flags = { ...save.questFlags };
  if (value === undefined) delete flags[BLACKOUT_CUE_FLAG];
  else flags[BLACKOUT_CUE_FLAG] = value;
  return { ...dialogueContext(save, content), flags };
}

/* ════════════════════════════════════════════════════════════════════════════
 * §8 THE INN HEALS WHAT IT CHARGES FOR
 *
 * ⚠ WHAT WAS TRUE BEFORE. `game/scenes/OverworldScene.ts` `restAtInn` was `spendTicks("inn", …)`
 * and a banner — it took `clock.innTicks` and touched the party not at all — while
 * `balance.medicine.innRestFullHeal` was `true` with exactly ONE reader, `restoredUids`, reached
 * only from the blackout's wake. Bible §11 reads "inn rest (full heal, 2 ticks)". So the inn was
 * the one thing that flag is named for and the one place it was not used, and a damaged party's
 * only route back to full was to LOSE a fight on purpose: the blackout, at `2 × innTicks +
 * 1 × travelTicks` and a forced relocation, next to an inn that cost `innTicks` and did nothing.
 *
 * Every fixture below is READ or PLAYED, on this file's standing terms: the damage comes out of the
 * real reducer through `game/wild-battle.ts` `applyBattleResult`, the selection rule comes out of
 * `balance.medicine`, and the price comes out of `balance.clock`.
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * A save whose party took REAL damage and is still on its feet — the state the inn exists for and
 * the one a blackout can never be in ({@link partyIsDown} is false of it by construction).
 *
 * ⚠ SEARCHED, NOT ASSUMED. A level-capped starter against a level-1 wild can win without being
 * touched at all, and a test written against that fixture would assert that the inn healed a
 * creature which was never hurt. The loop walks the enemy level down from the cap and takes the
 * first fight that is BOTH a win and left somebody below `maxHp` and above zero — read off the
 * reducer's own battler, which is the only place `maxHp` is spelled.
 */
function hurtAt(nodeId: string): { before: SaveEnvelope; after: SaveEnvelope; hurtUid: string } {
  const before = saveAt(nodeId, [{ ...starter(), level: balance.xp.levelCap }]);
  const lineId = Object.keys(nodeFile(NODE).populations)[0] as string;
  const tried: string[] = [];
  for (let level = balance.xp.levelCap; level >= 1; level -= 1) {
    const encounter: Encounter = { nodeId: NODE, lineId, age: "J", level, traits: [] };
    const built = buildWildBattle({
      content,
      save: before,
      encounter,
      node: toEcoNode(nodeFile(NODE)),
    });
    const state = playOut(built.input, built.ctx);
    const marked = state.playerOrder.filter((uid) => {
      const b = state.battlers[uid];
      return b !== undefined && b.curHp > 0 && b.curHp < b.maxHp;
    });
    tried.push(`L${String(level)} → ${String(state.outcome)} (${String(marked.length)} hurt)`);
    if (state.outcome !== "win" || marked.length === 0) continue;
    return {
      before,
      after: { ...applyBattleResult(before, state), currentNode: nodeId },
      hurtUid: marked[0] as string,
    };
  }
  throw new Error(
    `no shipped matchup at ${nodeId} left the party hurt AND standing — every assertion in §8 ` +
      `would then be about a party that was never damaged. Re-find the matchup; do not weaken the ` +
      `assertion.\n${tried.join("\n")}`,
  );
}

const restOf = (save: SaveEnvelope, bal = balance): InnRestOf => {
  const found = innRestFor(save, bal, isStanding);
  if (!found) throw new Error("innRestFor answered null on a save it should have restored");
  return found;
};

type InnRestOf = NonNullable<ReturnType<typeof innRestFor>>;

describe("§8.1 a damaged party is restored, in the one spelling of full", () => {
  it("the rig really is hurt and really is standing — neither wiped nor untouched", () => {
    const { before, after, hurtUid } = hurtAt(NODE);
    expect(partyIsDown(after, isStanding), "the rig wiped — that is §2's state, not §8's").toBe(false);
    expect(blackoutRecoveryFor(after, content, isStanding)).toBeNull();
    const hurt = after.party.find((c) => c.uid === hurtUid);
    expect(hurt?.curHp, "the fight wrote no HP back onto the save").toBeGreaterThan(0);
    // …and it was FULL before, so the number above is the fight's and not the fixture's.
    expect(before.party.find((c) => c.uid === hurtUid)?.curHp).toBeUndefined();
  });

  it("the rest deletes curHp rather than writing a number, and the reducer reads that as full", () => {
    const { after } = hurtAt(NODE);
    const rested = applyInnRest(after, restOf(after));
    for (const creature of rested.party) {
      /*
       * ⚠ ABSENT, not zero and not a computed maximum. `core/types.ts` `BlackoutRecovery` says why:
       * "full" already has one spelling in this codebase — `game/wild-battle.ts` `isStanding`,
       * "`curHp === undefined` means full" — and a rest that wrote numbers would be a third copy of
       * build-doc §7.4's effective-stat formula in a module with no business knowing it.
       */
      expect(creature.curHp, `${creature.uid} kept an explicit HP number`).toBeUndefined();
      expect(isStanding(creature)).toBe(true);
    }
    // The party is otherwise untouched: a rest is not a level-up and not a move.
    expect(rested.party.map((c) => c.uid)).toEqual(after.party.map((c) => c.uid));
    expect(rested.party.map((c) => c.level)).toEqual(after.party.map((c) => c.level));
    expect(rested.currentNode).toBe(after.currentNode);
  });

  it("it is the BLACKOUT'S OWN WRITE, not a second one — byte for byte on the party", () => {
    /*
     * The anti-drift assertion. `restoreParty` routes through `core/save.ts` `applyBlackout`; if it
     * ever grows a private copy of that four-line map the two sides of this stop agreeing, which is
     * the exact defect class the blackout's `restored`-is-uids design exists to prevent.
     */
    const { after } = hurtAt(NODE);
    const uids = after.party.map((c) => c.uid);
    const viaTheInn = restoreParty(after, uids);
    const viaTheBlackout = applyBlackout(after, { wakeNode: after.currentNode, restored: uids });
    expect(canonicalStringify(viaTheInn.party)).toBe(canonicalStringify(viaTheBlackout.party));
  });

  it("a uid the save does not have is refused loudly, exactly as the blackout refuses one", () => {
    const { after } = hurtAt(NODE);
    expect(() => restoreParty(after, ["somebody-else"])).toThrow(SaveCorruptError);
  });

  it("resting inside the inn does not put the save outdoors", () => {
    /*
     * `applyBlackout` clears `interiorId` because it MOVES the player. A rest moves nobody, and [R]
     * is live inside a room — `data/interiors/hearthollow-inn.json` is a room the player can be
     * standing in when they press it — so clearing it would leave `save.currentNode` outdoors while
     * the scene still drew the inn's floor plan.
     */
    const { after } = hurtAt(NODE);
    const room = INTERIORS.find((bp) => bp.parentNode === wakeNodeFor(NODE, content));
    expect(room, "no shipped interior at the wake town — this test has nothing to assert").toBeDefined();
    const inside: SaveEnvelope = { ...after, currentNode: room!.parentNode, interiorId: room!.id };
    expect(applyInnRest(inside, restOf(inside)).interiorId).toBe(room!.id);
  });
});

describe("§8.2 a full party may rest — it is charged, not refused and not thrown at", () => {
  it("innRestFor answers null, and null means 'levy the price, write nothing'", () => {
    const { before } = hurtAt(NODE);
    expect(before.party.every((c) => c.curHp === undefined), "the rig is not at full").toBe(true);
    expect(innRestFor(before, balance, isStanding)).toBeNull();
  });

  it("and the restore itself is a no-op on such a save rather than an error", () => {
    // Belt and braces: even asked directly, with the whole party named, nothing changes and nothing
    // throws. The null above is an optimisation of the tape, not the thing that keeps this safe.
    const { before } = hurtAt(NODE);
    expect(serialize(restoreParty(before, before.party.map((c) => c.uid)))).toBe(serialize(before));
  });

  it("an EMPTY party is null too, and for a different reason than a full one", () => {
    // There is nobody to restore, which is not the same statement as "nobody is hurt" — but the
    // shell reads both the same way, and neither may throw at a player pressing a key.
    const empty = saveAt(NODE, []);
    expect(innRestFor(empty, balance, isStanding)).toBeNull();
    expect(() => restoreParty(empty, [])).not.toThrow();
  });
});

describe("§8.3 what a rest restores is read from balance, not assumed", () => {
  /**
   * One member knocked to zero by a real fight and one hurt-but-standing from another — the state
   * `innRestFullHeal` actually decides, and the one a blackout can never be in (§2's party is down
   * to the last creature, so both branches of `restoredUids` name the same uids there).
   */
  function mixed(): SaveEnvelope {
    const down = wipedAt(NODE).after;
    const { after: up, hurtUid } = hurtAt(NODE);
    const downed = down.party.map((c) => ({ ...c, uid: `${c.uid}-down` }));
    const standing = up.party.map((c) => ({ ...c, uid: `${c.uid}-up` }));
    const save: SaveEnvelope = { ...up, party: [...downed, ...standing] };
    // THE RIG FIRST, both halves: a party that is entirely down is §2's state and a party that is
    // entirely upright cannot tell the two branches apart.
    expect(save.party.some((c) => isStanding(c)), "the mixed rig has nobody upright").toBe(true);
    expect(save.party.some((c) => !isStanding(c)), "the mixed rig has nobody down").toBe(true);
    expect(save.party.some((c) => c.uid.startsWith(hurtUid) && c.curHp !== undefined)).toBe(true);
    return save;
  }

  it("with innRestFullHeal ON, every fieldable member comes back — the shipped reading", () => {
    expect(balance.medicine.innRestFullHeal, "shipped balance changed; §8.3 reads it, not a literal").toBe(true);
    const save = mixed();
    const rest = restOf(save);
    expect([...rest.restored].sort()).toEqual(save.party.map((c) => c.uid).sort());
    expect(applyInnRest(save, rest).party.every((c) => c.curHp === undefined)).toBe(true);
  });

  it("with it OFF, only the ones that are DOWN — the flag is branched on, not quoted", () => {
    /*
     * THE RETUNE TEST, and it is the reason this feature is not a second answer to "what is a full
     * heal". The false branch is the floor Hank's closed ruling requires ("this forced choice
     * prevents the game from being blocked") and no more than that: a hurt-but-standing creature
     * stays hurt.
     */
    const thrifty = { ...balance, medicine: { ...balance.medicine, innRestFullHeal: false } };
    const save = mixed();
    const rest = restOf(save, thrifty);
    const down = save.party.filter((c) => !isStanding(c)).map((c) => c.uid);
    expect([...rest.restored].sort()).toEqual([...down].sort());
    expect(down.length, "nobody was down — the two branches cannot differ here").toBeGreaterThan(0);
    expect(rest.restored.length, "the two branches named the same uids").toBeLessThan(save.party.length);

    const rested = applyInnRest(save, rest);
    for (const creature of rested.party) {
      if (down.includes(creature.uid)) expect(creature.curHp, creature.uid).toBeUndefined();
      else expect(creature.curHp, `${creature.uid} was healed by the OFF branch`).toBeGreaterThan(0);
    }
  });

  it("`healed` counts what actually changed, which is not what `restored` names", () => {
    /*
     * Under the ON branch `restored` is the whole fieldable party whether or not anybody was hurt,
     * so it is the wrong number to show a player. The banner counts `healed`; the tape carries
     * `restored`. This asserts they really are different numbers on a shipped-balance save.
     */
    const save = mixed();
    const untouched = { ...starter(), uid: "never-fought" };
    const withAFullOne: SaveEnvelope = { ...save, party: [...save.party, untouched] };
    const rest = restOf(withAFullOne);
    expect(rest.restored).toContain(untouched.uid);
    expect(rest.healed).not.toContain(untouched.uid);
    expect(rest.healed.length).toBeLessThan(rest.restored.length);
  });
});

describe("§8.4 the tape carries the consequence, and carries no price", () => {
  it("one entry per rest, absolute, and readable back off the log", () => {
    const { after } = hurtAt(NODE);
    const rest = restOf(after);
    const rested = applyInnRest(after, rest);
    const added = rested.actionLog.slice(after.actionLog.length);
    expect(added).toHaveLength(1);
    expect(readInnRest(added[0]?.action)).toEqual([...rest.restored]);
  });

  it("applied twice it is applied once", () => {
    const { after } = hurtAt(NODE);
    const uids = restOf(after).restored;
    const once = restoreParty(after, uids);
    expect(serialize(restoreParty(once, uids))).toBe(serialize(once));
  });

  it("it survives the save round-trip rather than being deleted on load", () => {
    /*
     * `core/schemas.ts` `zSaveFileFor` validates `actionLog[].action` as a `looseObject`, which is
     * what lets a new entry ship without touching that file — and what this asserts rather than
     * assumes. A `z.object` would hand back `{t}` alone and the uid list would be gone.
     */
    const { after } = hurtAt(NODE);
    const rest = restOf(after);
    const reloaded = deserialize(serialize(applyInnRest(after, rest)), balance);
    const entry = reloaded.actionLog.find((e) => (e.action as { t: string }).t === INN_REST_ACTION);
    expect(entry, "the tape lost the inn rest on the way through storage").toBeDefined();
    expect(readInnRest(entry?.action)).toEqual([...rest.restored]);
  });

  it("a malformed entry is null rather than a throw, so a hand-edited tape stays readable", () => {
    expect(readInnRest({ t: INN_REST_ACTION })).toBeNull();
    expect(readInnRest({ t: INN_REST_ACTION, restored: "not-a-list" })).toBeNull();
    expect(readInnRest({ t: INN_REST_ACTION, restored: [1] })).toBeNull();
    expect(readInnRest({ t: INN_REST_ACTION, restored: [""] })).toBeNull();
    expect(readInnRest({ t: "inn", townId: "hearthollow" })).toBeNull();
    expect(readInnRest(null)).toBeNull();
  });

  it("THE CONSEQUENCE ENTRY MOVES NO CLOCK — a price or a consequence, never both", () => {
    /*
     * ⚠ THIS IS WHY THE HEAL IS NOT DERIVED FROM THE `{t:"inn"}` PRICE SITTING BESIDE IT.
     * `game/year-replay.ts` `clockFromLog` prices an entry by its `t`; if the consequence were
     * folded into the priced entry there would be two answers to what the rest cost. And
     * `BLACKOUT_COST` levies TWO `{t:"inn"}` entries of its own — a heal derived from the price
     * would fire on those as well, restoring the blackout three times by two different rules.
     */
    const { after } = hurtAt(NODE);
    const start: ClockState = { year: after.year, tick: after.tick, subTick: after.subTick ?? 0 };
    const taped = applyInnRest(after, restOf(after));
    expect(clockFromLog(start, taped.actionLog, balance)).toEqual(start);
  });
});

describe("§8.5 L10 — the entry is enough to replay the rest", () => {
  const deps = { gyms: content.gyms, species: content.species, balance, nodes: content.nodes };

  /**
   * The applier `core/save.ts` `replay` will make a named `case` of, injected here through the
   * `applyOther` hook its `default` arm already calls for exactly this — "a host that DOES
   * understand the entry can still act on it" (INV-2). It is the SAME `restoreParty` the live path
   * writes through, so this proves the ENTRY is sufficient, not that a second writer agrees.
   */
  const withTheInnRest = {
    ...deps,
    applyOther: (save: SaveEnvelope, entry: { action: unknown }): SaveEnvelope => {
      const uids = readInnRest(entry.action);
      return uids ? restoreParty(save, uids) : save;
    },
  };

  it("replaying the tape reproduces the party the live rest produced", () => {
    const { before, after } = hurtAt(NODE);
    const live = applyInnRest(after, restOf(after));

    // THE RIG FIRST: if the rest changed nothing, an empty replay would agree trivially.
    expect(canonicalStringify(live.party)).not.toBe(canonicalStringify(after.party));

    const replayed = replay({ ...after, actionLog: [] }, live.actionLog, withTheInnRest);
    expect(canonicalStringify(replayed.party)).toBe(canonicalStringify(live.party));
    expect(before.currentNode).toBe(after.currentNode); // a rest moves nobody, so neither does this
  });

  it("…and it is the ENTRY that carries it: drop the entry and the replay stays hurt", () => {
    const { after } = hurtAt(NODE);
    const live = applyInnRest(after, restOf(after));
    const stripped = live.actionLog
      .filter((e) => readInnRest(e.action) === null)
      .map((e, i) => ({ ...e, seq: i }));
    expect(
      stripped.length,
      "the rig's tape had no inn-rest entry to strip — the comparison below proves nothing",
    ).toBe(live.actionLog.length - 1);
    const replayed = replay({ ...after, actionLog: [] }, stripped, withTheInnRest);
    expect(canonicalStringify(replayed.party)).toBe(canonicalStringify(after.party));
  });
});

describe("§8.6 the inn and the blackout stay coherent about what the extra ticks buy", () => {
  it("the blackout costs exactly one more night plus the carry — measured as a distance", () => {
    /*
     * NOT `toBeGreaterThan`. A sign test passes at 1.001×, and the property that matters is the
     * COMPOSITION: the blackout is the inn's rest twice over plus the fast travel it performs on
     * the player's behalf. Before the inn healed, the "inn" in `BLACKOUT_COST` was a unit of
     * nothing; it now names a thing the player can buy on its own, so the arithmetic has to close.
     */
    const rest = ticksForAction("inn", balance);
    expect(blackoutTicks(balance) - rest).toBe(rest + ticksForAction("travel", balance));
  });

  it("and it stays composed when the inn is retuned — neither side is pinned to today's number", () => {
    const dearer = { ...balance, clock: { ...balance.clock, innTicks: balance.clock.innTicks + 1 } };
    expect(blackoutTicks(dearer) - ticksForAction("inn", dearer)).toBe(
      ticksForAction("inn", dearer) + ticksForAction("travel", dearer),
    );
  });

  it("what keeps the blackout necessary is the ROUTE, not the restore — said out loud", () => {
    /*
     * ⚠ THE REDUNDANCY CHECK, and its answer is uncomfortable enough to assert rather than assume:
     * `innRestFor` WOULD restore a wiped party. It is a pure read and it does not ask how the save
     * got that way, so the thing that keeps `applyBlackoutRecovery` from being dead code is not this
     * module at all — it is that a wipe happens on a route, mid-fight, with all four launchers
     * refusing and the shell resolving the blackout before control returns. A player never holds a
     * wiped party and a free keypress at the same time.
     *
     * The half this file can own is the pair below. The other half — that the wipe is resolved
     * before the player can act, and that the blackout MOVES them — is
     * `tests/unit/overworld-scene.test.ts` §17's, and it is asserted there at nodes where the wake
     * node differs from the node the player went down on.
     */
    const { after } = wipedAt(NODE);
    expect(partyIsDown(after, isStanding)).toBe(true);
    expect(wildBattleProblem(after), "the wiped rig could still launch a fight").not.toBeNull();
    expect(innRestFor(after, balance, isStanding), "a wiped party is restorable BY THE FUNCTION").not.toBeNull();

    // …and only the blackout carries them somewhere an inn exists. The rest does not move anybody.
    const recovery = blackoutRecoveryFor(after, content, isStanding);
    expect(recovery?.wakeNode, `a wipe at ${NODE} woke where it fell`).not.toBe(after.currentNode);
    expect(new Set(innNodeIds()).has(recovery!.wakeNode)).toBe(true);
    expect(applyInnRest(after, restOf(after)).currentNode).toBe(after.currentNode);
  });
});
