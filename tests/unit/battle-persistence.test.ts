/**
 * tests/unit/battle-persistence.test.ts — a fight now costs something, and the cost survives it.
 *
 * ══ WHAT WAS TRUE BEFORE, MEASURED ══
 * `save.party[].curHp` had ZERO writers. The only assignments anywhere were `core/lifecycle.ts`'s
 * creation-time one and the year turn's proportional rescale of an already-defined value;
 * `game/wild-battle.ts` only ever READ it, to fill `BattlerSpec.curHp` on the way IN. So damage
 * evaporated between fights. `OwnedCreature.level` and `.xp` were never assigned in `game/` at all,
 * so a creature carried six in-game years was exactly as strong on the last day as the first. And
 * `BattleInput.bag` was `{ ...save.items }` — a copy, copied again inside the reducer — so
 * consumables were infinite. Losing a battle cost nothing and winning one gained nothing permanent.
 *
 * ══ WHAT IS PROVED BELOW, EACH WRITTEN TO BE ABLE TO FAIL ══
 *   §1 the aftermath record is the PLAYER side of the reducer's final state, and nothing else;
 *   §2 damage survives one battle AND is carried into the next one, through the real launcher;
 *   §3 experience and level survive — on a rig that first proves a level-up actually happened;
 *   §4 a consumed snare is gone from the save, and spending the last one makes the throw illegal;
 *   §5 a party wiped in a fight is refused the next one — the JOIN between this write and the
 *      guard `tests/unit/battle-launch-guards.test.ts` already binds, which could not fire before,
 *      because no party could arrive at a fight already down;
 *   §6 L10 — the tape replays to the same party and the same bag, byte for byte;
 *   §7 the tape survives the save round-trip, so the entry is not silently deleted on load;
 *   §8 the write is absolute, so applying it twice is applying it once;
 *   §9 an aftermath naming a creature the save does not have is refused loudly.
 *
 * ══ WHY NO FIXTURE HERE NAMES A SPECIES, A LEVEL OR AN HP NUMBER ══
 * The matchups are FOUND, by running the fights the node actually ships (see {@link hurtEncounter}
 * and {@link grindRoster}). Two reasons, and the second is the load-bearing one: naming a species
 * would be G2, and a fixture pinned to today's damage numbers would go red whenever
 * `data/species.json`, `data/balance.json` or `core/battle.ts`'s enemy policy moved — for a reason
 * that is not the seam under test. Every assertion below ties the SAVE to the reducer's own final
 * state and then checks that the state really moved, so it measures the persistence seam and
 * nothing else.
 *
 * No engine import: every module under test is engine-free on purpose (L11).
 *
 * ══ WHAT THIS FILE CANNOT SEE, SAID OUT LOUD ══
 * It calls `applyBattleResult` ITSELF, so it binds the FUNCTION and not the WIRING. That is not a
 * quibble: the four launchers in `game/scenes/OverworldScene.ts` did not call it at all, every test
 * here passed identically with the wiring absent, and three docstrings — `game/gym-battle.ts`,
 * `game/rival.ts`, `game/finale.ts` — described it as "the ONE writer all four launchers share"
 * while zero launchers shared it. Measured then, driving the real scene through real fights: a
 * snare was spent in the reducer and was still in the bag afterwards, and four battles produced no
 * `battleAftermath` entry on the tape.
 *
 * The call sites are exercised in `tests/unit/overworld-scene.test.ts` §3.1, which walks REAL
 * encounters, fights them through the real reducer and asserts the EFFECTS on the save — and §3.1
 * is the only place in the repo where losing one of those four calls can go red. "The launcher
 * writes it back" is a claim about that file, never about this one.
 */

import { describe, expect, it } from "vitest";

import {
  makeBattleContext,
  predationOracleFromWebs,
  startBattle,
  step as battleStep,
  xpOf,
  type BattleContext,
} from "@core/battle";
import { deriveFoodWeb, indexSpecies, toEcoNode } from "@core/foodweb";
import { subsystemRng } from "@core/rng";
import { validateContent } from "@core/schemas";
import {
  applyBattleAftermath,
  BATTLE_AFTERMATH_ACTION,
  canonicalStringify,
  deserialize,
  newSave,
  replay,
  SaveCorruptError,
  serialize,
  type SaveEnvelope,
} from "@core/save";
import type {
  BattleInput,
  BattlerSpec,
  BattleState,
  Content,
  NodeFile,
  OwnedCreature,
} from "@core/types";
import {
  applyBattleResult,
  battleAftermath,
  battlerSpecOf,
  buildWildBattle,
  partyProblem,
  partySpecs,
  provisionalStarter,
  standingSpecs,
  wildBattleProblem,
} from "@game/wild-battle";
import type { Encounter } from "@game/encounters";

const content: Content = validateContent();
const balance = content.balance;

/** The route the sibling files measure at, so a fixture here is the fixture there. */
const NODE = "r1";

function nodeFile(id: string): NodeFile {
  const found = content.nodes.find((n) => n.id === id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
}

/** The lines the shipped node actually carries — read from data, never named here (G2). */
const NODE_LINES = Object.keys(nodeFile(NODE).populations);

function starter(): OwnedCreature {
  const base = provisionalStarter(content);
  if (!base) throw new Error("data ships no starter line — the fixture cannot be built");
  return base;
}

/** A save standing on the route, carrying `party` and whatever bag the test needs. */
function saveWith(party: OwnedCreature[], items: Record<string, number> = {}): SaveEnvelope {
  const save = newSave({ seed: 4242, currentNode: NODE, nodes: content.nodes }, balance);
  return { ...save, party, items };
}

function ctxAt(nodeId: string): BattleContext {
  const web = deriveFoodWeb(toEcoNode(nodeFile(nodeId)), indexSpecies(content.species), balance);
  return makeBattleContext(content, predationOracleFromWebs([web]));
}

function encounterOf(lineId: string, level: number): Encounter {
  return { nodeId: NODE, lineId, age: "J", level, traits: [] };
}

/** Some encounter the node offers — for the tests that need A battle, not a particular one. */
function anyEncounter(level: number): Encounter {
  return encounterOf(NODE_LINES[0] as string, level);
}

/**
 * Play a battle to a terminal outcome with the player taking `pick(state)` every turn.
 *
 * The turn cap is a rig guard, not a rule: an action the reducer rejects produces an
 * `actionRejected` event and no progress, which without a cap is a hang rather than a failure.
 */
function playOut(
  input: BattleInput,
  ctx: BattleContext,
  pick: (state: BattleState) => Parameters<typeof battleStep>[1],
  cap = 4000,
): BattleState {
  const rng = subsystemRng(input.seed, "battle");
  let state = startBattle(input, ctx).state;
  for (let turn = 0; state.outcome === null && turn < cap; turn += 1) {
    state = battleStep(state, pick(state), rng, ctx).state;
  }
  return state;
}

/** The active player battler's first move — the reducer's own list, never a move id typed here. */
function firstMove(state: BattleState): Parameters<typeof battleStep>[1] {
  const active = state.battlers[state.activePlayerUid];
  const moveId = active?.moves[0];
  if (moveId === undefined) throw new Error("the active player battler knows no moves");
  return { kind: "move", moveId };
}

/** One wild fight through the shipped launcher, played out. */
function wildFight(save: SaveEnvelope, enc: Encounter): BattleState {
  const built = buildWildBattle({ content, save, encounter: enc, node: toEcoNode(nodeFile(NODE)) });
  return playOut(built.input, built.ctx, firstMove);
}

let hurtEncounterCache: Encounter | null = null;

/**
 * An encounter the starter WINS but does not walk away from untouched — found by running every
 * matchup the node ships, not chosen by name. Memoised so the search runs once.
 *
 * "Hurt but standing" is exactly the state §2 needs and the state that did not previously exist:
 * before this writeback a fight left no mark either way, and after it a fight the player LOSES
 * leaves a party that cannot be fielded again (that is §5's business, not this one's).
 */
function hurtEncounter(): Encounter {
  if (hurtEncounterCache) return hurtEncounterCache;
  for (const lineId of NODE_LINES) {
    for (let level = 1; level <= balance.xp.starterLevel; level += 1) {
      const enc = encounterOf(lineId, level);
      const save = saveWith([starter()]);
      const state = wildFight(save, enc);
      const battler = state.battlers[save.party[0]!.uid];
      if (!battler) continue;
      if (state.outcome === "win" && battler.curHp > 0 && battler.curHp < battler.maxHp) {
        hurtEncounterCache = enc;
        return enc;
      }
    }
  }
  throw new Error(
    `no matchup at ${NODE} leaves the starter hurt but standing — §2's fixture needs re-finding, ` +
      `not its assertion weakening`,
  );
}

/** A long enemy roster, as `BattlerSpec[]`. Age and level are the roster's, never a rule. */
function roster(lineId: string, count: number, age: BattlerSpec["age"]): BattlerSpec[] {
  const out: BattlerSpec[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({ uid: `grind-${String(i)}`, lineId, age, level: 1, traits: [] });
  }
  return out;
}

function grindInput(save: SaveEnvelope, enemyParty: BattlerSpec[]): BattleInput {
  return {
    seed: save.seed,
    kind: "trainer",
    playerParty: partySpecs(save),
    enemyParty,
    bag: { ...save.items },
  };
}

let grindRosterCache: BattlerSpec[] | null = null;

/**
 * A roster long enough that the reducer really LEVELS the starter, found the same way.
 *
 * The count is a fixture size, not a tunable — but which line it is made of is measured, because
 * on the shipped table most of the node's lines beat a level-5 starter one-on-one and a roster of
 * those would only ever prove that the player can lose.
 */
function grindRoster(): BattlerSpec[] {
  if (grindRosterCache) return grindRosterCache;
  /*
   * FIXTURE RE-FOUND AGAIN, exactly as the throw below instructs, and NO assertion moved: the
   * checks at the call sites still demand a win AND a level gained.
   *
   * PREVIOUSLY (kept, because it explains the count): 12 -> 48 because the fixture is sized against
   * the cost of leaving `xp.starterLevel`, and both terms moved under Hank's "make the whole game
   * easier": the starter is handed over at 14 rather than 5, and the curve is 38 × l^1.0 rather
   * than 15 × l^1.4, so the first level-up costs 38 × 14 = 532 where it used to cost
   * 15 × 5^1.4 = 142.8. A level-1 Elder of a Route 1 line pays 12 + 4 × 1 × 1.3 = 17, so 12 of them
   * bank 204 — short of 532. 48 banks 816.
   *
   * NOW: the AGE is searched rather than fixed at Elder, because `damage.divisor` (1 -> 4, the term
   * that ties hit size to HP size) broke the sentence this fixture rested on — "the starter
   * survives the roster because it one-shots each enemy, and `fieldNextEnemy` does not let a
   * replacement act on the turn it enters." It no longer one-shots, so every enemy now gets to
   * swing back, and a 48-long roster became a war of attrition with no healing in it. MEASURED at
   * the shipped constants, level-1 ELDERS, best line first: carricrow 16 kills of 48 before the
   * starter died, bramblehog 11, pollywisp 7, skir 7, nibbin 2, loamunder 2 — no line survivable,
   * which is exactly what the throw was reporting. Against level-1 JUVENILES (age multiplier 0.875
   * rather than 1.075, so they are both squishier and weaker) carricrow-line goes the distance:
   * 48/48, the starter ends at 121/131 HP and reaches level 15.
   *
   * So the SEARCH widened and the DEMAND did not. Ages are tried weakest-first, which is the order
   * that finds a survivable roster soonest; the assertions at the call sites are untouched, and the
   * throw still fires if nothing works.
   */
  const count = 48;
  for (const age of ["J", "A", "E"] as const) {
    for (const lineId of NODE_LINES) {
      const save = saveWith([starter()]);
      const enemies = roster(lineId, count, age);
      const state = playOut(grindInput(save, enemies), ctxAt(NODE), firstMove);
      const battler = state.battlers[save.party[0]!.uid];
      if (!battler) continue;
      if (state.outcome === "win" && battler.level > save.party[0]!.level) {
        grindRosterCache = enemies;
        return enemies;
      }
    }
  }
  throw new Error(
    `no line at ${NODE} gives the starter a roster it can farm to a level-up — §3's fixture needs ` +
      `re-finding, not its assertion weakening`,
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * §1 The record
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 battleAftermath — the player side of the reducer's final state, and nothing else", () => {
  it("carries every fielded party member, in the order the reducer fields them", () => {
    const party = [starter(), { ...starter(), uid: "second" }];
    const save = saveWith(party);
    const built = buildWildBattle({
      content,
      save,
      encounter: anyEncounter(3),
      node: toEcoNode(nodeFile(NODE)),
    });
    const state = startBattle(built.input, built.ctx).state;
    const aftermath = battleAftermath(state);
    expect(aftermath.party.map((m) => m.uid)).toEqual(state.playerOrder);
    expect(aftermath.party.map((m) => m.uid)).toEqual(partySpecs(save).map((s) => s.uid));
  });

  it("does NOT carry the wild creature — a caught animal is in `battlers` too", () => {
    const save = saveWith([starter()], { master: 9 });
    const built = buildWildBattle({
      content,
      save,
      encounter: anyEncounter(3),
      node: toEcoNode(nodeFile(NODE)),
    });
    const state = startBattle(built.input, built.ctx).state;
    const enemyUid = state.enemyOrder[0] as string;
    expect(Object.keys(state.battlers)).toContain(enemyUid);
    expect(battleAftermath(state).party.map((m) => m.uid)).not.toContain(enemyUid);
  });

  it("carries the bag as the reducer left it, not as the save handed it in", () => {
    const save = saveWith([starter()], { master: 3 });
    const built = buildWildBattle({
      content,
      save,
      encounter: anyEncounter(3),
      node: toEcoNode(nodeFile(NODE)),
    });
    const state = playOut(built.input, built.ctx, () => ({ kind: "snare", tier: "master" }));
    expect(battleAftermath(state).items).toEqual(state.bag);
    expect(state.bag.master).toBeLessThan(3);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 Damage survives a battle — and the next one starts from it
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 health persists", () => {
  function hurtOne(): { before: SaveEnvelope; after: SaveEnvelope; state: BattleState } {
    const before = saveWith([starter()]);
    const state = wildFight(before, hurtEncounter());
    return { before, after: applyBattleResult(before, state), state };
  }

  it("writes the reducer's own curHp onto the party — and the party really was hurt", () => {
    const { before, after, state } = hurtOne();
    expect(state.outcome).not.toBeNull();
    const uid = before.party[0]!.uid;
    const battler = state.battlers[uid]!;

    // THE RIG FIRST: a fight nobody was scratched in would make the assertion below vacuous.
    expect(battler.curHp, "nothing was damaged — this fixture proves nothing").toBeLessThan(
      battler.maxHp,
    );
    // Before: the field had no writer at all, so it was not even defined.
    expect(before.party[0]!.curHp).toBeUndefined();
    expect(after.party[0]!.curHp).toBe(battler.curHp);
  });

  it("carries into the NEXT fight through the real launcher, not just onto the field", () => {
    const { after, state } = hurtOne();
    const uid = after.party[0]!.uid;
    expect(battlerSpecOf(after.party[0]!).curHp).toBe(state.battlers[uid]!.curHp);

    const next = buildWildBattle({
      content,
      save: after,
      encounter: hurtEncounter(),
      node: toEcoNode(nodeFile(NODE)),
    });
    const fielded = startBattle(next.input, next.ctx).state.battlers[uid]!;
    expect(fielded.curHp).toBe(state.battlers[uid]!.curHp);
    expect(fielded.curHp).toBeLessThan(fielded.maxHp);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 Experience and level survive
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 experience persists", () => {
  function grind(): { before: SaveEnvelope; after: SaveEnvelope; state: BattleState } {
    const before = saveWith([starter()]);
    const state = playOut(grindInput(before, grindRoster()), ctxAt(NODE), firstMove);
    return { before, after: applyBattleResult(before, state), state };
  }

  it("writes the reducer's level and banked xp back onto the party", () => {
    const { before, after, state } = grind();
    const uid = before.party[0]!.uid;

    // THE RIG FIRST. Without a level-up this test would pass on a no-op writeback.
    expect(state.outcome, "the grind never resolved — the measurement below is void").toBe("win");
    expect(
      state.battlers[uid]!.level,
      "nobody levelled — lengthen the roster rather than weakening the assertion",
    ).toBeGreaterThan(before.party[0]!.level);

    expect(before.party[0]!.level).toBe(balance.xp.starterLevel);
    expect(before.party[0]!.xp).toBeUndefined();
    expect(after.party[0]!.level).toBe(state.battlers[uid]!.level);
    expect(after.party[0]!.xp).toBe(xpOf(state.battlers[uid]!));
  });

  it("a levelled creature is stronger the NEXT fight — the level is what the launcher fields", () => {
    const { before, after } = grind();
    const uid = before.party[0]!.uid;
    const fieldedFrom = (save: SaveEnvelope): { level: number; maxHp: number } => {
      const built = buildWildBattle({
        content,
        save,
        encounter: anyEncounter(3),
        node: toEcoNode(nodeFile(NODE)),
      });
      const battler = startBattle(built.input, built.ctx).state.battlers[uid]!;
      return { level: battler.level, maxHp: battler.maxHp };
    };
    const opening = fieldedFrom(before);
    const grown = fieldedFrom(after);
    expect(grown.level).toBeGreaterThan(opening.level);
    expect(grown.maxHp).toBeGreaterThan(opening.maxHp);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4 The bag is finite
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 items persist", () => {
  it("a thrown snare is gone from the save, and the next fight is handed the smaller bag", () => {
    const before = saveWith([starter()], { master: 3 });
    const built = buildWildBattle({
      content,
      save: before,
      encounter: anyEncounter(3),
      node: toEcoNode(nodeFile(NODE)),
    });
    const state = playOut(built.input, built.ctx, () => ({ kind: "snare", tier: "master" }));

    // THE RIG FIRST: a fight in which no snare was thrown proves nothing about spending one.
    expect(state.bag.master, "no snare was thrown — this fixture proves nothing").toBeLessThan(3);

    const after = applyBattleResult(before, state);
    expect(before.items.master).toBe(3);
    expect(after.items.master).toBe(state.bag.master);

    const next = buildWildBattle({
      content,
      save: after,
      encounter: anyEncounter(3),
      node: toEcoNode(nodeFile(NODE)),
    });
    expect(next.input.bag?.master).toBe(state.bag.master);
  });

  it("spending the last one makes the throw illegal in the next fight, not free", () => {
    const before = saveWith([starter()], { master: 1 });
    const built = buildWildBattle({
      content,
      save: before,
      encounter: anyEncounter(3),
      node: toEcoNode(nodeFile(NODE)),
    });
    const state = playOut(built.input, built.ctx, () => ({ kind: "snare", tier: "master" }));
    expect(state.bag.master).toBe(0);

    const after = applyBattleResult(before, state);
    expect(after.items.master).toBe(0);

    const next = buildWildBattle({
      content,
      save: after,
      encounter: anyEncounter(3),
      node: toEcoNode(nodeFile(NODE)),
    });
    const opened = startBattle(next.input, next.ctx);
    const rng = subsystemRng(next.input.seed, "battle");
    const { events } = battleStep(opened.state, { kind: "snare", tier: "master" }, rng, next.ctx);
    expect(events.some((e) => e.t === "actionRejected")).toBe(true);
    expect(events.some((e) => e.t === "snareThrown")).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §5 The join with the guard that already exists
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§5 a party wiped in a fight is refused the next one", () => {
  /**
   * `tests/unit/battle-launch-guards.test.ts` already binds that all four launchers refuse an
   * all-fainted party — with a party hand-built to be fainted. What could not be tested until now
   * is that a party can ARRIVE at a fight that way, because before this writeback no fight left
   * anybody hurt. This is that join, and it is the reason the guard is not decoration.
   */
  it("the same save passes the guard before the fight and is refused after it", () => {
    const weak: OwnedCreature = { ...starter(), level: 1 };
    const before = saveWith([weak]);
    expect(wildBattleProblem(before)).toBeNull();
    expect(standingSpecs(before)).toHaveLength(1);

    const state = wildFight(before, anyEncounter(balance.xp.levelCap));
    expect(state.outcome, "the rig did not lose — the refusal below would prove nothing").toBe(
      "loss",
    );

    const after = applyBattleResult(before, state);
    expect(after.party[0]!.curHp).toBe(0);
    expect(standingSpecs(after)).toHaveLength(0);
    // The party still HAS a member, so it is the standing clause that must fire, not the empty one.
    expect(after.party).toHaveLength(1);
    expect(partyProblem(after)).toContain("standing");
    expect(wildBattleProblem(after)).not.toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §6 L10 — the tape replays to the same party and the same bag
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§6 determinism (build-doc §8.1 / L10)", () => {
  const deps = {
    gyms: content.gyms,
    species: content.species,
    balance,
    nodes: content.nodes,
  };

  function fought(): { before: SaveEnvelope; live: SaveEnvelope } {
    const before = saveWith([starter()], { master: 4 });
    const state = wildFight(before, hurtEncounter());
    return { before, live: applyBattleResult(before, state) };
  }

  it("core/save.ts's replay of the tape lands exactly where the live path landed", () => {
    const { before, live } = fought();

    // THE RIG FIRST: if the fight changed nothing, an empty replay would agree with it trivially.
    expect(canonicalStringify(live.party)).not.toBe(canonicalStringify(before.party));

    const replayed = replay({ ...before, actionLog: [] }, live.actionLog, deps);
    expect(canonicalStringify(replayed.party)).toBe(canonicalStringify(live.party));
    expect(canonicalStringify(replayed.items)).toBe(canonicalStringify(live.items));
    // L10 in full for everything this write touches, survey and log included.
    expect(serialize(replayed)).toBe(serialize(live));
  });

  it("and it is the AFTERMATH ENTRY that carries it — a tape without it replays untouched", () => {
    /*
     * The sibling above would be satisfied by any tape that happened to reproduce the save; this
     * one names the mechanism. Strip the aftermath entry — renumbering, because `replay` refuses a
     * log with a gap — and the replayed party is the party that never fought. Written this way
     * because the sibling stayed GREEN under a sabotage that removed replay's aftermath arm
     * entirely (two identical replays of a tape agree whether or not either applies anything), and
     * a test that survives the deletion of the code it is about binds nothing.
     */
    const { before, live } = fought();
    const stripped = live.actionLog
      .filter((e) => (e.action as { t: string }).t !== BATTLE_AFTERMATH_ACTION)
      .map((e, i) => ({ ...e, seq: i }));
    expect(stripped.length).toBeLessThan(live.actionLog.length);

    const without = replay({ ...before, actionLog: [] }, stripped, deps);
    expect(canonicalStringify(without.party)).toBe(canonicalStringify(before.party));
    expect(canonicalStringify(without.party)).not.toBe(canonicalStringify(live.party));

    const withIt = replay({ ...before, actionLog: [] }, live.actionLog, deps);
    expect(canonicalStringify(withIt.party)).toBe(canonicalStringify(live.party));
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §7 The entry survives being saved and loaded
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§7 the tape entry round-trips through storage", () => {
  it("survives serialize → deserialize with its payload intact, and still replays", () => {
    const before = saveWith([starter()], { master: 4 });
    const live = applyBattleResult(before, wildFight(before, hurtEncounter()));

    /*
     * `core/schemas.ts` validates `actionLog[].action` as `z.looseObject({ t })` — "permissive BY
     * DESIGN". A `z.object` there would STRIP the payload on load (its own comment says an
     * undeclared field is "not merely unvalidated, it is silently discarded"), and the aftermath
     * would replay as a no-op. This is the check of that claim rather than a reading of it.
     */
    const reloaded = deserialize(serialize(live), balance);
    expect(serialize(reloaded)).toBe(serialize(live));

    const replayed = replay({ ...before, actionLog: [] }, reloaded.actionLog, {
      gyms: content.gyms,
      species: content.species,
      balance,
      nodes: content.nodes,
    });
    expect(canonicalStringify(replayed.party)).toBe(canonicalStringify(live.party));
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §8/§9 The writer itself
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§8 the write is absolute, so replaying it twice is replaying it once", () => {
  it("applying one aftermath twice equals applying it once", () => {
    const save = saveWith([starter()], { master: 2 });
    const uid = save.party[0]!.uid;
    const aftermath = { party: [{ uid, curHp: 4, level: 9, xp: 11 }], items: { master: 1 } };
    const once = applyBattleAftermath(save, aftermath);
    const twice = applyBattleAftermath(once, aftermath);
    expect(serialize(twice)).toBe(serialize(once));
    expect(once.party[0]!.curHp).toBe(4);
    expect(once.party[0]!.level).toBe(9);
    expect(once.party[0]!.xp).toBe(11);
    expect(once.items).toEqual({ master: 1 });
  });

  it("replaces the bag rather than merging it — a spent stack does not come back", () => {
    const save = saveWith([starter()], { master: 2, base: 5 });
    const uid = save.party[0]!.uid;
    const applied = applyBattleAftermath(save, {
      party: [{ uid, curHp: 1, level: 1, xp: 0 }],
      items: { master: 1 },
    });
    expect(applied.items).toEqual({ master: 1 });
  });

  it("leaves a boxed creature alone — it was never on the field", () => {
    const boxed: OwnedCreature = { ...starter(), uid: "boxed", boxed: true, curHp: 3 };
    const save = saveWith([starter(), boxed]);
    const applied = applyBattleAftermath(save, {
      party: [{ uid: save.party[0]!.uid, curHp: 1, level: 1, xp: 0 }],
      items: {},
    });
    expect(applied.party[1]!.curHp).toBe(3);
  });
});

describe("§9 an aftermath that does not belong to this save is refused loudly", () => {
  it("throws SaveCorruptError rather than quietly skipping the member", () => {
    const save = saveWith([starter()]);
    expect(() =>
      applyBattleAftermath(save, {
        party: [{ uid: "not-in-this-party", curHp: 0, level: 1, xp: 0 }],
        items: {},
      }),
    ).toThrow(SaveCorruptError);
  });

  it("a tape entry whose payload is malformed changes nothing rather than crashing the load", () => {
    const save = saveWith([starter()]);
    const log = [
      {
        seq: 0,
        year: save.year,
        tick: save.tick,
        subTick: 0,
        // A half-record: the discriminant is right, the body is not.
        action: { t: "battleAftermath", aftermath: { party: "no" } } as never,
      },
    ];
    const replayed = replay({ ...save, actionLog: [] }, log, {
      gyms: content.gyms,
      species: content.species,
      balance,
      nodes: content.nodes,
    });
    expect(canonicalStringify(replayed.party)).toBe(canonicalStringify(save.party));
  });
});
