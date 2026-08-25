/**
 * tests/unit/catch.test.ts — build-doc §10.1 "catch/flee clamps" for core/battle.ts (lane A3).
 *
 *   catch: p = baseCatch(age) × snareTier × baitMult × (2 − hpFrac)/2 × lureMult, clamp .02–.95
 *   flee:  pFlee = 0.4 + 0.4 × (mySpd/theirSpd), clamp .1–.95
 *
 * Both clamps are proved to BIND, not merely to exist: each is fed an input whose unclamped value
 * is outside the band. Where the shipped constants cannot reach a clamp, the case retunes a COPY
 * of balance.json (the INV-3 shape: retuning touches balance only) and says so.
 *
 * Every expected number is hand-computed in the comment above it. The RNG is the scripted double
 * from tests/unit/battle.test.ts — no Math.random anywhere (G11).
 */

import { describe, expect, it } from "vitest";
import { validateContent } from "../../core/schemas";
import {
  baitMatchOf,
  catchChance,
  caughtIndividual,
  effectiveStats,
  fleeChance,
  hasMetamorphosed,
  illegalActionReason,
  makeBattleContext,
  makeBattler,
  predationOracleFromWebs,
  startBattle,
  step,
  type BattleContext,
} from "../../core/battle";
import type {
  AgeClass,
  Balance,
  BattleInput,
  BattleState,
  Battler,
  Content,
  FoodWeb,
  SpeciesLine,
} from "../../core/types";

const content: Content = validateContent();
const B: Balance = content.balance;

/**
 * A scripted float source: hands back exactly the draws the case needs, in core/battle.ts's
 * documented order, and throws when a test draws more than it scripted. (Deliberately duplicated
 * from tests/unit/battle.test.ts rather than imported — importing one test file from another makes
 * vitest collect its suites twice.)
 */
function scripted(values: readonly number[]): { float(): number } {
  let i = 0;
  return {
    float(): number {
      const v = values[i];
      if (v === undefined) {
        throw new Error(`scripted rng exhausted after ${String(i)} draws — the case scripted ${String(values.length)}`);
      }
      i += 1;
      return v;
    },
  };
}

/**
 * TEST DOUBLE for core/foodweb.ts (lane A2). The Marsh web as bible §5 derives it: Fenmaw (Apex)
 * eats Mesopredators and its Reedrick exception; Mirefin (Mesopredator) eats the Grazers.
 * battle.ts reads this through the real `predationOracleFromWebs` and derives nothing itself (G3).
 */
const MARSH: FoodWeb = {
  nodeId: "r2",
  edges: {
    "fenmaw-line": ["mirefin-line", "reedrick-line"],
    "mirefin-line": ["reedrick-line"],
  },
  floraFeeders: ["reedrick-line"],
};

function ctxWith(balance: Balance = B): BattleContext {
  return makeBattleContext(
    { species: content.species, moves: content.moves, balance },
    predationOracleFromWebs([MARSH]),
  );
}

const CTX = ctxWith();

function retuned(patch: (b: Balance) => void): Balance {
  const clone = structuredClone(B) as Balance;
  patch(clone);
  return clone;
}

function target(lineId: string, age: AgeClass, level: number, ctx: BattleContext = CTX, hpFrac = 1): Battler {
  const b = makeBattler({ uid: `wild-${lineId}`, lineId, age, level, traits: [] }, "enemy", ctx, {
    isWild: true,
    enteredOnTurn: 1,
  });
  b.curHp = Math.round(b.maxHp * hpFrac);
  return b;
}

/* ════════════════════════════════════════════════════════════════════════════
 * Catch chance.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("catch chance (build-doc §7.4)", () => {
  it("uses baseCatch per age class", () => {
    // Full HP ⇒ (2 − 1)/2 = 0.5; base snare ×1.0; no bait ×1.0; no lure ×1.0.
    // J: 0.5 × 0.5 = 0.25 · A: 0.3 × 0.5 = 0.15 · E: 0.15 × 0.5 = 0.075
    expect(catchChance(target("mirefin-line", "J", 5), "base", undefined, false, CTX)).toBeCloseTo(0.25, 10);
    expect(catchChance(target("mirefin-line", "A", 5), "base", undefined, false, CTX)).toBeCloseTo(0.15, 10);
    expect(catchChance(target("mirefin-line", "E", 5), "base", undefined, false, CTX)).toBeCloseTo(0.075, 10);
  });

  it("uses the Ancient base, not the Elder one (bible §4: very hard catches)", () => {
    // baseCatchAncient 0.05 × 0.5 = 0.025 — an order below the 0.075 an ordinary Elder would give.
    expect(catchChance(target("vellsire-line", "E", 40), "base", undefined, false, CTX)).toBeCloseTo(0.025, 10);
  });

  it("scales with snare tier (bible §11: base / weighted / master)", () => {
    // 0.5 × {1.0, 1.5, 2.2} × 0.5 = 0.25 · 0.375 · 0.55
    const j = target("mirefin-line", "J", 5);
    expect(catchChance(j, "base", undefined, false, CTX)).toBeCloseTo(0.25, 10);
    expect(catchChance(j, "weighted", undefined, false, CTX)).toBeCloseTo(0.375, 10);
    expect(catchChance(j, "master", undefined, false, CTX)).toBeCloseTo(0.55, 10);
  });

  it("rises as the target's HP falls, through (2 − hpFrac)/2", () => {
    // A at full HP:      0.3 × (2 − 1.0)/2 = 0.15
    // A at half HP:      0.3 × (2 − 0.5)/2 = 0.225
    // A at 10% HP:       0.3 × (2 − 0.1)/2 = 0.285
    expect(catchChance(target("mirefin-line", "A", 20, CTX, 1), "base", undefined, false, CTX)).toBeCloseTo(0.15, 6);
    expect(catchChance(target("mirefin-line", "A", 20, CTX, 0.5), "base", undefined, false, CTX)).toBeCloseTo(0.225, 2);
    expect(catchChance(target("mirefin-line", "A", 20, CTX, 0.1), "base", undefined, false, CTX)).toBeCloseTo(0.285, 2);
  });

  it("multiplies by the Lure the bible gives the utility move", () => {
    // 0.3 × 0.5 × 1.5 = 0.225
    expect(catchChance(target("mirefin-line", "A", 5), "base", undefined, true, CTX)).toBeCloseTo(0.225, 10);
  });

  it("matches bait through the DERIVED diet, never a bait table (build-doc §7.2 / G3)", () => {
    // Mirefin's derived diet is [reedrick-line], whose adult role is Grazer.
    expect(baitMatchOf("reedrick-line", "mirefin-line", CTX)).toBe("species"); // the prey line itself
    expect(baitMatchOf("Grazer", "mirefin-line", CTX)).toBe("role"); // a role-generic bait
    expect(baitMatchOf("Producer", "mirefin-line", CTX)).toBe("none"); // nothing in its diet is one
    expect(baitMatchOf("mosslet-line", "mirefin-line", CTX)).toBe("none"); // a Forest Grazer it never eats
    expect(baitMatchOf(undefined, "mirefin-line", CTX)).toBe("none");
    // Fenmaw eats Mirefin, so a Mirefin bait is species-specific for it but useless the other way.
    expect(baitMatchOf("mirefin-line", "fenmaw-line", CTX)).toBe("species");
    expect(baitMatchOf("fenmaw-line", "mirefin-line", CTX)).toBe("none");
    // And a Scavenger, which bible §5 says "eats nothing live", cannot be baited at all.
    expect(baitMatchOf("Grazer", "carricrow-line", CTX)).toBe("none");

    // 0.3 × 1.0 × {1.0, 1.5, 2.0} × 0.5 = 0.15 · 0.225 · 0.30
    const a = target("mirefin-line", "A", 5);
    expect(catchChance(a, "base", undefined, false, CTX)).toBeCloseTo(0.15, 10);
    expect(catchChance(a, "base", "Grazer", false, CTX)).toBeCloseTo(0.225, 10);
    expect(catchChance(a, "base", "reedrick-line", false, CTX)).toBeCloseTo(0.3, 10);
  });

  it("BINDS the upper clamp at .95", () => {
    // J × master × species bait × half HP × lure:
    //   0.5 × 2.2 × 2.0 × 0.75 × 1.5 = 2.475 — well past the band, so the clamp is doing work.
    const j = target("mirefin-line", "J", 5, CTX, 0.5);
    expect(catchChance(j, "master", "reedrick-line", true, CTX)).toBe(B.catch.clampMax);
    expect(B.catch.clampMax).toBe(0.95);
    // Nudging the clamp proves this value came from it and not from the formula.
    const looser = ctxWith(retuned((b) => {
      b.catch.clampMax = 0.99;
    }));
    expect(catchChance(j, "master", "reedrick-line", true, looser)).toBe(0.99);
  });

  it("does not move when the TYPE CHART is retuned (build-doc §6 INV-3)", () => {
    // The catch formula has no type term. `balance.types.neutral` was standing in as the "no lure"
    // multiplier, so retuning an advertised type-chart tunable silently halved or doubled catch
    // odds — a knob with a second, undocumented job is the exact INV-3 trap.
    const a = target("mirefin-line", "A", 5);
    const before = catchChance(a, "base", undefined, false, CTX);
    for (const factor of [0.5, 2]) {
      const shifted = ctxWith(retuned((b) => {
        b.types.neutral = b.types.neutral * factor;
        b.types.superEffective = b.types.superEffective * factor;
        b.types.resisted = b.types.resisted * factor;
      }));
      expect(catchChance(target("mirefin-line", "A", 5, shifted), "base", undefined, false, shifted)).toBe(before);
    }
    // …while the lure multiplier, which the formula DOES name, still moves it.
    expect(catchChance(a, "base", undefined, true, CTX)).toBeCloseTo(before * B.catch.lureMult, 10);
  });

  it("BINDS the lower clamp at .02", () => {
    // Nothing in the shipped table can reach it — the floor of the shipped space is an Ancient at
    // full HP with a base snare and no bait: 0.05 × 0.5 = 0.025, still above .02. So this case
    // retunes a COPY of balance.json (INV-3) to get under the floor.
    expect(catchChance(target("vellsire-line", "E", 40), "base", undefined, false, CTX)).toBeGreaterThan(B.catch.clampMin);
    const brutal = ctxWith(retuned((b) => {
      b.catch.baseCatchAncient = 0.001;
    }));
    // 0.001 × 1.0 × 1.0 × 0.5 = 0.0005 ⇒ clamped up to .02
    expect(catchChance(target("vellsire-line", "E", 40, brutal), "base", undefined, false, brutal)).toBe(B.catch.clampMin);
    expect(B.catch.clampMin).toBe(0.02);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Throwing a snare inside the reducer.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("snare throws (build-doc §7.4 / Hard Req 2)", () => {
  const wild: BattleInput = {
    seed: 21,
    kind: "wild",
    nodeId: "r2",
    playerParty: [{ uid: "p", lineId: "fenmaw-line", age: "A", level: 20, traits: [] }],
    enemyParty: [{ uid: "w", lineId: "mirefin-line", age: "J", level: 6, traits: [] }],
    bag: { base: 2, weighted: 1, "reedrick-line": 1 },
  };

  it("shakes balance.catch.shakes times, all of which must pass", () => {
    const started = startBattle(wild, CTX);
    // p = 0.25 (J, base snare, no bait, full HP) ⇒ each shake passes below 0.25^(1/3) = 0.62996.
    // Three draws under it ⇒ three shakes ⇒ caught.
    const caught = step(started.state, { kind: "snare", tier: "base" }, scripted([0.5, 0.5, 0.5]), CTX);
    const thrown = caught.events.find((e) => e.t === "snareThrown");
    expect(thrown).toEqual({ t: "snareThrown", uid: "w", tier: "base", chance: 0.25, shakes: 3, caught: true });
    expect(caught.state.outcome).toBe("caught");
    expect(caught.state.caughtUid).toBe("w");
    expect(caught.events.some((e) => e.t === "caught" && e.nodeId === "r2")).toBe(true);
    // A catch ends the battle before the wild creature gets its turn.
    expect(caught.events.some((e) => e.t === "damage")).toBe(false);
    expect(B.catch.shakes).toBe(3);
  });

  it("reports the shake it broke on and lets the wild creature act", () => {
    const started = startBattle(wild, CTX);
    // draw 1 passes (0.5 < 0.63), draw 2 fails (0.7 ≥ 0.63) ⇒ one shake, no catch;
    // the enemy then attacks, spending [damage roll, crit].
    const missed = step(started.state, { kind: "snare", tier: "base" }, scripted([0.5, 0.7, 0.5, 0.99]), CTX);
    expect(missed.events.find((e) => e.t === "snareThrown")).toEqual({
      t: "snareThrown",
      uid: "w",
      tier: "base",
      chance: 0.25,
      shakes: 1,
      caught: false,
    });
    expect(missed.state.outcome).toBeNull();
    expect(missed.events.some((e) => e.t === "damage" && e.uid === "p")).toBe(true);
    expect(missed.state.bag["base"]).toBe(1); // the snare is spent either way
  });

  it("hands the caught individual to the CALLER instead of touching node state (G3)", () => {
    const started = startBattle(wild, CTX);
    const caught = step(started.state, { kind: "snare", tier: "base" }, scripted([0.5, 0.5, 0.5]), CTX);
    const individual = caughtIndividual(caught.state, CTX);
    expect(individual).toEqual({
      uid: "w",
      lineId: "mirefin-line",
      formName: "Bogling", // bible §4 — the Mirefin line's juvenile identity
      age: "J",
      level: 6,
      traits: [],
      nodeId: "r2",
      ancient: false,
      // A Bogling has not metamorphosed yet — the hand-off says so rather than leaving the caller
      // to re-derive it (see the case below for why that mattered).
      metamorphosed: false,
    });
    // Nothing in the battle state is a node population: the decrement is the caller's move.
    expect(Object.keys(caught.state)).not.toContain("populations");
    expect(Object.keys(caught.state)).not.toContain("nodeStates");
    // …and it is null until a catch actually lands.
    expect(caughtIndividual(started.state, CTX)).toBeNull();
  });

  it("hands over the metamorphic latch so the party card and the battle cannot disagree", () => {
    // bible §4 — "Wild adults of a line only appear in evolved form", so a wild-caught Mirefin
    // ADULT already carries the ×1.15 and the hand-off must say so. Without this field the caller
    // had to re-derive the latch, and core/lifecycle.ts's opposite default made the same creature
    // 15% weaker on its card than in the battle it was caught in.
    const adultFight: BattleInput = {
      ...wild,
      seed: 26,
      enemyParty: [{ uid: "w", lineId: "mirefin-line", age: "A", level: 6, traits: [] }],
      bag: { master: 1 },
    };
    const started = startBattle(adultFight, CTX);
    // p = 0.3 × 2.2 × 0.5 = 0.33 ⇒ each shake needs a draw under 0.33^(1/3) = 0.6910.
    const caught = step(started.state, { kind: "snare", tier: "master" }, scripted([0.1, 0.1, 0.1]), CTX);
    const individual = caughtIndividual(caught.state, CTX);
    expect(individual?.metamorphosed).toBe(true);
    expect(individual?.formName).toBe("Mirefin");
    // …and the stats the battler was built with are the ones that latch implies.
    const line = content.species.find((s) => s.id === "mirefin-line");
    if (!line) throw new Error("no mirefin-line");
    expect(caught.state.battlers["w"]?.stats).toEqual(
      effectiveStats({ line, age: "A", level: 6, balance: B, metamorphosed: true }),
    );
    // A non-metamorphic line always reports false, whatever its age.
    expect(hasMetamorphosed(content.species.find((s) => s.id === "fenmaw-line") as SpeciesLine, "E")).toBe(false);
  });

  it("flags a caught Ancient so the caller can exempt it from year-turn aging (G10)", () => {
    const ancientFight: BattleInput = {
      seed: 22,
      kind: "ancient",
      nodeId: "sanctum",
      playerParty: [{ uid: "p", lineId: "fenmaw-line", age: "A", level: 40, traits: [] }],
      enemyParty: [{ uid: "vell", lineId: "vellsire-line", age: "E", level: 40, traits: [] }],
      bag: {},
    };
    const started = startBattle(ancientFight, CTX);
    // p = 0.05 × 2.2 × 0.5 = 0.055 ⇒ each shake needs a draw under 0.055^(1/3) = 0.3803.
    const caught = step(started.state, { kind: "snare", tier: "master" }, scripted([0.1, 0.1, 0.1]), CTX);
    expect(caught.state.outcome).toBe("caught");
    expect(caughtIndividual(caught.state, CTX)?.ancient).toBe(true);
  });

  it("never snares a target that has already fainted", () => {
    // A 0-HP target scores (2 − 0)/2 = 1.0 on the HP term — the best catch odds in the game — and
    // `caughtIndividual` would hand the caller a corpse to decrement out of the node population
    // (Hard Req 2). KO is a faint, and a fainted wild creature is out of the fight.
    const twoUp: BattleInput = {
      ...wild,
      seed: 27,
      enemyParty: [
        { uid: "w", lineId: "mirefin-line", age: "J", level: 6, traits: [] },
        { uid: "w2", lineId: "mirefin-line", age: "J", level: 6, traits: [] },
      ],
    };
    const started = startBattle(twoUp, CTX);
    const downed: BattleState = structuredClone(started.state);
    const victim = downed.battlers["w"];
    if (!victim) throw new Error("no target");
    victim.fainted = true;
    victim.curHp = 0;
    // The guard itself: a snare aimed at a fainted battler is not a legal action.
    expect(illegalActionReason(downed, { kind: "snare", tier: "base" }, CTX)).toMatch(/fainted/);
    // …and the reducer never lets it come up, because a fainted battler is not left on the field:
    // the throw lands on the replacement, and the corpse is not what gets caught.
    const thrown = step(downed, { kind: "snare", tier: "base" }, scripted([0.1, 0.1, 0.1]), CTX);
    expect(thrown.events.some((e) => e.t === "switched" && e.side === "enemy" && e.toUid === "w2")).toBe(true);
    const snare = thrown.events.find((e) => e.t === "snareThrown");
    expect(snare?.t === "snareThrown" ? snare.uid : null).toBe("w2");
    expect(caughtIndividual(thrown.state, CTX)?.uid).toBe("w2");

    // With no replacement behind it, the fight is simply already won — no throw, no bag spend.
    const soloDown: BattleState = structuredClone(started.state);
    const only = soloDown.battlers["w"];
    if (!only) throw new Error("no target");
    only.fainted = true;
    only.curHp = 0;
    soloDown.enemyOrder = ["w"];
    const over = step(soloDown, { kind: "snare", tier: "base" }, scripted([]), CTX);
    expect(over.state.outcome).toBe("win");
    expect(over.events.some((e) => e.t === "snareThrown")).toBe(false);
    expect(over.state.bag["base"]).toBe(2);
  });

  it("ignores a Lure used by the ENEMY (bible §3 makes it the player's utility)", () => {
    const enemyLure: BattleInput = {
      seed: 28,
      kind: "wild",
      nodeId: "r2",
      playerParty: [{ uid: "p", lineId: "fenmaw-line", age: "A", level: 20, traits: [] }],
      // A crafted move list: the wild creature knows nothing but Lure, so it must use it.
      enemyParty: [{ uid: "w", lineId: "mirefin-line", age: "A", level: 6, traits: [], moves: ["lure"] }],
      bag: { base: 2 },
    };
    const started = startBattle(enemyLure, CTX);
    const out = step(started.state, { kind: "move", moveId: "riptide" }, scripted([0.5, 0.99]), CTX);
    expect(out.events.some((e) => e.t === "moveUsed" && e.uid === "w" && e.moveId === "lure")).toBe(true);
    expect(out.state.lureActive).toBe(false);
  });

  it("carries the Lure move's multiplier into the throw (bible §3)", () => {
    const lureFight: BattleInput = {
      seed: 23,
      kind: "wild",
      nodeId: "r2",
      // A starter is the line that fields Lure; at level 15 the utility slot is unlocked.
      playerParty: [{ uid: "p", lineId: "puddlisk-line", age: "A", level: 15, traits: [] }],
      enemyParty: [{ uid: "w", lineId: "mirefin-line", age: "A", level: 6, traits: [] }],
      bag: {},
    };
    const started = startBattle(lureFight, CTX);
    expect(started.state.lureActive).toBe(false);
    // Lure spends the turn; the wild Mirefin replies with [damage roll, crit].
    const lured = step(started.state, { kind: "move", moveId: "lure" }, scripted([0.5, 0.99]), CTX);
    expect(lured.state.lureActive).toBe(true);
    // 0.3 × 1.0 × 1.0 × 0.5 × 1.5 = 0.225 — the throw sees the lure without being told about it.
    const thrown = step(lured.state, { kind: "snare", tier: "base" }, scripted([0.1, 0.1, 0.1]), CTX);
    const event = thrown.events.find((e) => e.t === "snareThrown");
    expect(event?.t === "snareThrown" ? event.chance : 0).toBeCloseTo(0.225, 10);
    // …which is exactly the un-lured chance times balance.catch.lureMult.
    expect(catchChance(target("mirefin-line", "A", 6), "base", undefined, false, CTX) * B.catch.lureMult).toBeCloseTo(0.225, 10);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Flee.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("flee chance (build-doc §7.4)", () => {
  const skir = () => makeBattler({ uid: "s", lineId: "skir-line", age: "A", level: 10, traits: [] }, "player", CTX, { isWild: false, enteredOnTurn: 1 });
  const fenmaw = () => makeBattler({ uid: "f", lineId: "fenmaw-line", age: "A", level: 10, traits: [] }, "enemy", CTX, { isWild: true, enteredOnTurn: 1 });

  it("is 0.4 + 0.4 × (mySpd/theirSpd)", () => {
    // Fenmaw spd 35 × 1.2 = 42; Skir spd 85 × 1.2 = 102.
    //   Fenmaw fleeing Skir: 0.4 + 0.4 × (42/102) = 0.5647…
    expect(fleeChance(fenmaw(), skir(), B)).toBeCloseTo(0.564706, 6);
  });

  it("BINDS the upper clamp at .95", () => {
    //   Skir fleeing Fenmaw: 0.4 + 0.4 × (102/42) = 1.3714… — far outside the band.
    expect(fleeChance(skir(), fenmaw(), B)).toBe(B.flee.clampMax);
    expect(B.flee.clampMax).toBe(0.95);
    const looser = retuned((b) => {
      b.flee.clampMax = 0.99;
    });
    expect(fleeChance(skir(), fenmaw(), looser)).toBe(0.99);
  });

  it("BINDS the lower clamp at .1", () => {
    // With the shipped constants the floor is unreachable — the base term alone is 0.4, so the
    // formula can never dip below it (worth knowing: the lower clamp is inert until `flee.base` is
    // retuned). This case retunes a COPY (INV-3) so the clamp has something to do:
    //   base 0 + 0.1 × (42/102) = 0.04118 ⇒ clamped up to .1
    expect(fleeChance(fenmaw(), skir(), B)).toBeGreaterThan(B.flee.clampMin);
    const stuck = retuned((b) => {
      b.flee.base = 0;
      b.flee.spdCoefficient = 0.1;
    });
    expect(fleeChance(fenmaw(), skir(), stuck)).toBe(B.flee.clampMin);
    expect(B.flee.clampMin).toBe(0.1);
  });

  it("takes the formula's own limit against a motionless opponent, not the clamp as a ratio", () => {
    // mySpd / 0 is +Infinity, which the clamp already answers correctly: 0.95. Substituting
    // `flee.clampMax` for the RATIO instead put a probability where a speed ratio belongs and
    // landed on 0.4 + 0.4 × 0.95 = 0.78 — under the cap the formula demands.
    const frozen: Battler = { ...fenmaw(), stats: { ...fenmaw().stats, spd: 0 } };
    expect(fleeChance(skir(), frozen, B)).toBe(B.flee.clampMax);
    expect(fleeChance(skir(), frozen, B)).not.toBeCloseTo(0.78, 6);
    // …including when BOTH are motionless (0/0 has no limit, so the cap stands rather than a NaN).
    const alsoFrozen: Battler = { ...skir(), stats: { ...skir().stats, spd: 0 } };
    expect(fleeChance(alsoFrozen, frozen, B)).toBe(B.flee.clampMax);
    expect(Number.isNaN(fleeChance(alsoFrozen, frozen, B))).toBe(false);
  });

  it("reads Speed through Soak (bible §2: −30% Speed)", () => {
    const soaked: Battler = { ...fenmaw(), status: { name: "Soak", turnsActive: 0 } };
    // 0.4 + 0.4 × (42 × 0.7 / 102) = 0.4 + 0.4 × 0.28824 = 0.51529…
    expect(fleeChance(soaked, skir(), B)).toBeCloseTo(0.515294, 6);
  });

  it("ends the battle on a successful flee and hands the turn over on a failed one", () => {
    const input: BattleInput = {
      seed: 24,
      kind: "wild",
      nodeId: "r2",
      playerParty: [{ uid: "s", lineId: "skir-line", age: "A", level: 10, traits: [] }],
      enemyParty: [{ uid: "f", lineId: "fenmaw-line", age: "A", level: 10, traits: [] }],
      bag: {},
    };
    const started = startBattle(input, CTX);
    const away = step(started.state, { kind: "flee" }, scripted([0.5]), CTX);
    expect(away.events.find((e) => e.t === "fleeAttempt")).toEqual({
      t: "fleeAttempt",
      uid: "s",
      chance: 0.95,
      success: true,
    });
    expect(away.state.outcome).toBe("fled");
    expect(away.events.at(-1)).toEqual({ t: "battleEnd", outcome: "fled" });

    // 0.96 ≥ 0.95 ⇒ the escape fails and the Fenmaw takes its swing ([damage roll, crit]).
    // (Under the §7.4 damage formula that swing knocks the Skir out, which is the point of the
    //  clamp: a failed flee costs the turn.)
    const cornered = step(started.state, { kind: "flee" }, scripted([0.96, 0.5, 0.99]), CTX);
    expect(cornered.events.find((e) => e.t === "fleeAttempt")).toMatchObject({ success: false });
    expect(cornered.state.outcome).not.toBe("fled");
    expect(cornered.events.some((e) => e.t === "damage" && e.uid === "s")).toBe(true);
  });
});

/* ── a guard on the state the fixtures depend on ─────────────────────────── */

describe("the reducer never writes node state", () => {
  it("keeps BattleState to the build-doc §7.4 shape", () => {
    const started = startBattle(
      {
        seed: 25,
        kind: "wild",
        nodeId: "r2",
        playerParty: [{ uid: "p", lineId: "fenmaw-line", age: "A", level: 20, traits: [] }],
        enemyParty: [{ uid: "w", lineId: "mirefin-line", age: "J", level: 6, traits: [] }],
      },
      CTX,
    );
    const state: BattleState = started.state;
    expect(Object.keys(state).sort()).toEqual(
      ["activeEnemyUid", "activePlayerUid", "bag", "battlers", "enemyOrder", "kind", "lureActive", "nodeId", "outcome", "playerOrder", "seed", "turn"].sort(),
    );
  });
});
