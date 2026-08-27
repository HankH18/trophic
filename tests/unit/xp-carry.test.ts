/**
 * tests/unit/xp-carry.test.ts — experience is read back IN, not only written OUT.
 *
 * ══ WHAT WAS TRUE BEFORE THIS SUITE ══
 * `core/save.ts` `applyBattleAftermath` has always written `OwnedCreature.xp` back onto the save
 * after a fight. Nothing ever read it: `core/types.ts` `BattlerSpec` had no `xp` field, so
 * `core/battle.ts` `makeBattler` opened every battler at a hard `xp: 0` and the banked total was
 * discarded at the first frame of the next fight. A creature therefore levelled only when ONE fight
 * covered a whole `xpToNext(level)` on its own.
 *
 * That is not merely slow, it is a different game. Measured here against shipped balance, and the
 * figures are asserted below rather than quoted:
 *   • level 5 — `xpToNext(5)` ≈ 142.774, one level-5 Adult pays `xpGain` = 32. Five and a half
 *     enemies in a single fight, so no wild encounter could ever do it.
 *   • level 1 — `xpToNext(1)` = 15, one level-1 Adult pays 16. So a single-enemy fight COULD level
 *     a level-1 creature, and only a level-1 one. The "no single fight can ever level anything"
 *     reading is true from level 2 up and false at the bottom; both halves are pinned here because
 *     the distinction is what says the carry-in fixes a hole rather than papering over a tuning.
 *
 * ══ WHAT THIS SUITE BINDS ══
 * The four seams of the loop, each named so a break says which one went:
 *   §1 `makeBattler` reads `spec.xp` (and an absent one is still 0).
 *   §2 `game/wild-battle.ts` `battlerSpecOf` — and so `partySpecs`, which every launcher shares —
 *      copies the owned creature's banked XP onto the spec.
 *   §3 the loop CLOSES: XP survives a fight, lands on the save, and opens the next fight.
 *   §4 the measured figures, and the level-up they now let a fight reach.
 *
 * DETERMINISM (L10): every number carried in comes off the save. Nothing here reads a clock, an
 * iteration order or a fresh RNG draw, which is why §3 can assert the second fight opens at exactly
 * the number the first one banked.
 *
 * RANDOMNESS (G11): `core/rng.ts` `subsystemRng` on the input's own seed — the same stream the
 * shipped launchers open — never `Math.random`.
 */

import { describe, expect, it } from "vitest";
import { validateContent } from "../../core/schemas";
import { subsystemRng } from "../../core/rng";
import { deriveFoodWeb, indexSpecies, toEcoNode } from "../../core/foodweb";
import {
  makeBattleContext,
  makeBattler,
  predationOracleFromWebs,
  startBattle,
  step,
  xpGain,
  xpOf,
  xpToNext,
  type BattleContext,
} from "../../core/battle";
import { newSave, type SaveEnvelope } from "../../core/save";
import {
  applyBattleResult,
  battlerSpecOf,
  buildWildBattle,
  partySpecs,
  provisionalStarter,
} from "../../game/wild-battle";
import type { Encounter } from "../../game/encounters";
import type {
  Balance,
  BattleEvent,
  BattleInput,
  BattlerSpec,
  BattleState,
  Content,
  NodeFile,
  OwnedCreature,
} from "../../core/types";

const content: Content = validateContent();
const B: Balance = content.balance;

/** The route the sibling persistence suite measures at, so a fixture here is the fixture there. */
const NODE = "r1";

function nodeFile(id: string): NodeFile {
  const found = content.nodes.find((n) => n.id === id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
}

const ctx: BattleContext = makeBattleContext(
  content,
  predationOracleFromWebs([deriveFoodWeb(toEcoNode(nodeFile(NODE)), indexSpecies(content.species), B)]),
);

/** The shipped starter line — read from data, never named here (G2). */
function starterLineId(): string {
  const base = provisionalStarter(content);
  if (!base) throw new Error("data ships no starter line — this suite's fixture cannot be built");
  return base.lineId;
}

const LINE = starterLineId();

function starter(): OwnedCreature {
  const base = provisionalStarter(content);
  if (!base) throw new Error("data ships no starter line — this suite's fixture cannot be built");
  return base;
}

/** A save standing on the route, carrying `party`. */
function saveWith(party: OwnedCreature[]): SaveEnvelope {
  const save = newSave({ seed: 4242, currentNode: NODE, nodes: content.nodes }, B);
  return { ...save, party };
}

function spec(over: Partial<BattlerSpec> & Pick<BattlerSpec, "uid" | "level">): BattlerSpec {
  return { lineId: LINE, age: "A", traits: [], ...over };
}

/**
 * Play one fight to a terminal outcome, the player always taking the active battler's first move.
 *
 * The turn cap is a rig guard, not a rule: a rejected action makes no progress, which without a cap
 * is a hang rather than a failure.
 */
function playOut(input: BattleInput): { state: BattleState; events: BattleEvent[] } {
  const rng = subsystemRng(input.seed, "battle");
  let state = startBattle(input, ctx).state;
  const events: BattleEvent[] = [];
  for (let turn = 0; state.outcome === null && turn < 500; turn += 1) {
    const active = state.battlers[state.activePlayerUid];
    const moveId = active?.moves[0];
    if (moveId === undefined) throw new Error("the active player battler knows no moves");
    const out = step(state, { kind: "move", moveId }, rng, ctx);
    state = out.state;
    events.push(...out.events);
  }
  return { state, events };
}

/**
 * One fight against ONE enemy that is already down to its last hit point, so the player's first
 * connecting move ends it. The enemy's level — not its HP — is what `xpGain` reads, which is the
 * whole point: this isolates "how much XP does a single-enemy fight pay" from "can the player win".
 */
function soloFight(player: BattlerSpec, enemyLevel: number): { state: BattleState; events: BattleEvent[] } {
  return playOut({
    seed: 99,
    kind: "trainer",
    playerParty: [player],
    enemyParty: [spec({ uid: "solo-enemy", level: enemyLevel, curHp: 1 })],
  });
}

/* ════════════════════════════════════════════════════════════════════════════
 * §1 — core/battle.ts: makeBattler reads spec.xp
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 makeBattler opens a battler on its banked XP (build-doc §7.4)", () => {
  it("carries a spec's banked XP onto the battler", () => {
    const banked = 77;
    const built = makeBattler(spec({ uid: "p", level: 5, xp: banked }), "player", ctx, {
      isWild: false,
      enteredOnTurn: 1,
    });
    expect(xpOf(built)).toBe(banked);
  });

  it("still opens at zero when the spec carries no XP", () => {
    // The default has to stay a default: a gym slot, a wild encounter and a rival's roster all
    // build specs with no `xp` at all, and none of them may inherit a stale number.
    const built = makeBattler(spec({ uid: "p", level: 5 }), "player", ctx, {
      isWild: false,
      enteredOnTurn: 1,
    });
    expect(xpOf(built)).toBe(0);
  });

  it("carries XP independently of every other carry-in on the same spec", () => {
    // Guards against a fix that reads the wrong field — `curHp` is the neighbouring optional and
    // was the one already wired, so an xp that silently tracked it would look right in §1 alone.
    const built = makeBattler(spec({ uid: "p", level: 5, xp: 41, curHp: 3 }), "player", ctx, {
      isWild: false,
      enteredOnTurn: 1,
    });
    expect(xpOf(built)).toBe(41);
    expect(built.curHp).toBe(3);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 — game/wild-battle.ts: the owned creature's XP reaches the spec
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 battlerSpecOf carries banked XP out of the save", () => {
  it("copies the owned creature's xp onto the spec", () => {
    const creature: OwnedCreature = { ...starter(), xp: 58 };
    expect(battlerSpecOf(creature).xp).toBe(58);
  });

  it("leaves xp absent when the creature has none", () => {
    const creature = starter();
    expect(creature.xp).toBeUndefined();
    expect(battlerSpecOf(creature).xp).toBeUndefined();
  });

  it("carries it through partySpecs — the one read all four launchers share", () => {
    // wild, gym, rival and finale all build `playerParty` from `partySpecs(save)`, so this is the
    // assertion that says the fix reaches every fight and not only the wild one.
    const save = saveWith([{ ...starter(), xp: 91 }]);
    expect(partySpecs(save).map((s) => s.xp)).toEqual([91]);
  });

  it("reaches the reducer through the shipped wild launcher", () => {
    const save = saveWith([{ ...starter(), xp: 64 }]);
    const encounter: Encounter = {
      nodeId: NODE,
      lineId: LINE,
      age: "J",
      level: 2,
      traits: [],
    };
    const built = buildWildBattle({
      content,
      save,
      encounter,
      node: toEcoNode(nodeFile(NODE)),
    });
    const opening = startBattle(built.input, built.ctx).state;
    expect(xpOf(opening.battlers[save.party[0]!.uid]!)).toBe(64);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 — the loop closes: banked XP survives a fight and opens the next one
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 XP accumulates across fights instead of evaporating between them", () => {
  /**
   * The enemy these fights are fought against: a Juvenile at level 1, on its last hit point.
   *
   * Level and age are the fixture's, not a rule — but they are load-bearing as a RIG, so here is
   * why. The shipped starter is a Juvenile, and an Adult of the same line at the starter's own
   * level hits for more than the starter's whole HP bar on a crit: the fight ended `loss` on turn
   * one, before any XP could be banked. This suite measures accumulation, not survival, so the
   * enemy is the weakest the reducer will build and the fight is decided by the player's first
   * move. What it pays is `xpGain` against level 1 = 16, which is what makes the count in the
   * second case a real count.
   */
  function weakEnemy(uid: string): BattlerSpec {
    return { uid, lineId: LINE, age: "J", level: 1, traits: [], curHp: 1 };
  }

  /** One solo fight through the real writeback: play it, then apply the aftermath to the save. */
  function fightAndBank(save: SaveEnvelope, uid: string): SaveEnvelope {
    const { state } = playOut({
      seed: save.seed,
      kind: "trainer",
      playerParty: partySpecs(save),
      enemyParty: [weakEnemy(uid)],
      bag: { ...save.items },
    });
    expect(state.outcome).toBe("win");
    return applyBattleResult(save, state);
  }

  it("banks the fight's XP onto the save and opens the NEXT fight on that number", () => {
    const first = fightAndBank(saveWith([starter()]), "banked-enemy");
    const banked = first.party[0]?.xp;
    expect(banked).toBeGreaterThan(0);

    // The read-back, stated as an identity rather than a range: the second fight's opening battler
    // holds exactly what the first one left on the save. Before `BattlerSpec.xp` this was 0.
    const reopened = startBattle(
      {
        seed: first.seed,
        kind: "trainer",
        playerParty: partySpecs(first),
        enemyParty: [spec({ uid: "second-enemy", level: B.xp.starterLevel })],
      },
      ctx,
    ).state;
    expect(xpOf(reopened.battlers[first.party[0]!.uid]!)).toBe(banked);
  });

  it("sums across fights until a level arrives that no single fight could pay for", () => {
    // The behavioural claim, and the one that fails outright without the carry-in. A level-5
    // starter needs xpToNext(5) ≈ 142.8 and one of these enemies pays 16, so the level can only
    // arrive from the SUM — and it must arrive. A grind that never levels IS the old bug.
    const level = B.xp.starterLevel;
    const perFight = xpGain(
      makeBattler(weakEnemy("payout-probe"), "enemy", ctx, { isWild: true, enteredOnTurn: 1 }),
      B,
    );
    expect(perFight).toBeLessThan(xpToNext(level, B));

    let save = saveWith([starter()]);
    expect(save.party[0]?.level).toBe(level);
    let fights = 0;
    while (save.party[0]!.level === level && fights < 40) {
      save = fightAndBank(save, `grind-${String(fights)}`);
      fights += 1;
      // Heal between fights so the run measures XP and not attrition; `curHp` is the writeback's
      // other half and has its own suite. Dropping the key is what "unhurt" means to
      // `battlerSpecOf` — it is the absence of a carry-in, not a zero.
      save = {
        ...save,
        party: save.party.map((c) => {
          const { curHp: _healed, ...rest } = c;
          return rest;
        }),
      };
    }
    expect(save.party[0]!.level).toBe(level + 1);
    // More than one fight was needed — otherwise this case would pass with the carry-in reverted.
    expect(fights).toBeGreaterThan(1);
    // …and the remainder was BANKED, not dropped: crossing the threshold leaves what is over.
    expect(save.party[0]!.xp).toBeGreaterThanOrEqual(0);
    expect(save.party[0]!.xp).toBeLessThan(xpToNext(level + 1, B));
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4 — the measured figures, and the level-up carry-in now lets a fight reach
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 what one single-enemy fight is worth on shipped balance", () => {
  /** `xpGain` reads the DEFEATED battler; built through the reducer so no formula is retyped. */
  function payoutForEnemyAtLevel(level: number): number {
    return xpGain(makeBattler(spec({ uid: "e", level }), "enemy", ctx, { isWild: true, enteredOnTurn: 1 }), B);
  }

  it("pays 32 against a level-5 Adult, where levelling costs ~142.8", () => {
    expect(payoutForEnemyAtLevel(5)).toBe(32); // 12 + 4 × 5 × 1.0
    expect(xpToNext(5, B)).toBeCloseTo(142.774, 3); // 15 × 5^1.4
    expect(payoutForEnemyAtLevel(5)).toBeLessThan(xpToNext(5, B));
  });

  it("pays 16 against a level-1 Adult, where levelling costs 15", () => {
    // The bottom of the curve is the exception, and it is narrow: 16 ≥ 15 by one point, at level 1
    // and nowhere above it.
    expect(payoutForEnemyAtLevel(1)).toBe(16); // 12 + 4 × 1 × 1.0
    expect(xpToNext(1, B)).toBeCloseTo(15, 10); // 15 × 1^1.4
    expect(payoutForEnemyAtLevel(1)).toBeGreaterThanOrEqual(xpToNext(1, B));
  });

  it("levels a level-1 creature in ONE fight", () => {
    const { state, events } = soloFight(spec({ uid: "one", level: 1 }), 1);
    expect(state.outcome).toBe("win");
    expect(events.filter((e) => e.t === "levelUp")).toHaveLength(1);
    expect(state.battlers["one"]?.level).toBe(2);
  });

  it("does NOT level a level-5 creature in one fight, banking the payout instead", () => {
    const { state, events } = soloFight(spec({ uid: "five", level: B.xp.starterLevel }), B.xp.starterLevel);
    expect(state.outcome).toBe("win");
    expect(events.some((e) => e.t === "levelUp")).toBe(false);
    expect(state.battlers["five"]?.level).toBe(B.xp.starterLevel);
    expect(xpOf(state.battlers["five"]!)).toBe(payoutForEnemyAtLevel(B.xp.starterLevel));
  });

  it("levels that same level-5 creature when it walks in already close to the threshold", () => {
    // This is what changes about the game when carry-in lands, stated plainly: the identical fight
    // against the identical enemy now produces a mid-battle level-up, because the creature no
    // longer arrives with an empty bank. Deterministic — the carried number is the save's.
    const level = B.xp.starterLevel;
    const banked = Math.ceil(xpToNext(level, B)) - payoutForEnemyAtLevel(level);
    const { state, events } = soloFight(spec({ uid: "five", level, xp: banked }), level);
    expect(state.outcome).toBe("win");
    expect(events.filter((e) => e.t === "levelUp")).toHaveLength(1);
    expect(state.battlers["five"]?.level).toBe(level + 1);
  });

  it("one point short of the threshold is still one point short", () => {
    // The boundary from the other side, so the case above is testing the threshold and not merely
    // that a large number levels.
    const level = B.xp.starterLevel;
    const banked = Math.ceil(xpToNext(level, B)) - payoutForEnemyAtLevel(level) - 2;
    const { state, events } = soloFight(spec({ uid: "five", level, xp: banked }), level);
    expect(state.outcome).toBe("win");
    expect(events.some((e) => e.t === "levelUp")).toBe(false);
    expect(state.battlers["five"]?.level).toBe(level);
  });
});
