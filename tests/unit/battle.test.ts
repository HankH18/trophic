/**
 * tests/unit/battle.test.ts — build-doc §10.1 unit surface for core/battle.ts (lane A3).
 *
 *   "damage formula table-driven against hand-computed cases incl. Predation and Beast +10%;
 *    status tick math; catch/flee clamps; XP curve; effective-stat incl. metamorphic jump."
 *
 * Every expected number below is computed BY HAND in the comment above it, from the shipped
 * data/species.json base stats and data/balance.json tunables, so a human can check the arithmetic
 * without running anything. Catch and flee live in tests/unit/catch.test.ts.
 *
 * The RNG here is a SCRIPTED double, not a generator: it hands back exactly the floats the case
 * needs, in core/battle.ts's documented draw order (damage roll, then crit, then one per chanced
 * effect), and THROWS when a test draws more than it scripted — a miscounted draw fails loudly
 * instead of silently cycling. No Math.random anywhere (G11).
 */

import { describe, expect, it } from "vitest";
import { ROLES } from "../../core/types";
import { validateContent } from "../../core/schemas";
import { subsystemRng } from "../../core/rng";
import { baitMatchFor, deriveFoodWeb, indexSpecies, toEcoNode } from "../../core/foodweb";
import {
  baitMatchOf,
  chooseEnemyAction,
  computeDamage,
  effectiveSpeed,
  effectiveStats,
  hasMetamorphosed,
  illegalActionReason,
  makeBattleContext,
  makeBattler,
  movesKnownAt,
  predationOracleFromWebs,
  startBattle,
  statusChipFraction,
  step,
  typeMultiplier,
  unwiredPredationOracle,
  xpGain,
  xpOf,
  xpToNext,
  type BattleContext,
} from "../../core/battle";
import type {
  AgeClass,
  Balance,
  BattleAction,
  BattleEvent,
  BattleInput,
  BattleState,
  Battler,
  BattlerSpec,
  Content,
  FoodWeb,
  MoveDef,
  SpeciesLine,
  Trait,
} from "../../core/types";
import gymJson from "../../fixtures/battle-scripts/gym-01-maribel.json";
import wildJson from "../../fixtures/battle-scripts/wild-catch-r1-nibbin.json";
import fleeJson from "../../fixtures/battle-scripts/flee-r2-fenmaw.json";

const content: Content = validateContent();
const B: Balance = content.balance;

/** A scripted float source. Loud on exhaustion — see the file header. */
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

/** A cycling float source for long replays (fixtures). */
function cyclic(values: readonly number[]): { float(): number } {
  let i = 0;
  return {
    float(): number {
      const v = values[i % values.length];
      i += 1;
      return v ?? 0;
    },
  };
}

/**
 * TEST DOUBLE for core/foodweb.ts (lane A2, not present when this suite was written).
 * `FoodWeb` is core/types.ts's shape and `predationOracleFromWebs` is the real reader, so the
 * production path under test is unchanged — only the derivation is stood in for. battle.ts never
 * derives an edge itself (G3 / build-doc §8.3).
 */
function webOf(nodeId: string, edges: Record<string, string[]>): FoodWeb {
  return { nodeId, edges, floraFeeders: [] };
}

function ctxWith(edges: Record<string, string[]>): BattleContext {
  return makeBattleContext(content, predationOracleFromWebs([webOf("test", edges)]));
}

/** A balance clone with one group overridden — the INV-3 "retuning touches balance only" shape. */
function retuned(patch: (b: Balance) => void): Balance {
  const clone = structuredClone(B) as Balance;
  patch(clone);
  return clone;
}

/** balance.moveEffects.magnitude is a Record, so a missing key is a loud failure, not `undefined`. */
const magnitude = (key: string): number => {
  const value = B.moveEffects.magnitude[key];
  if (value === undefined) throw new Error(`no balance.moveEffects.magnitude.${key}`);
  return value;
};

const NO_WEB = ctxWith({});
const line = (id: string): SpeciesLine => {
  const found = content.species.find((s) => s.id === id);
  if (!found) throw new Error(`no species line ${id}`);
  return found;
};
const move = (id: string): MoveDef => {
  const found = content.moves.moves.find((m) => m.id === id);
  if (!found) throw new Error(`no move ${id}`);
  return found;
};

function battler(
  lineId: string,
  age: AgeClass,
  level: number,
  side: "player" | "enemy" = "player",
  ctx: BattleContext = NO_WEB,
  traits: Trait[] = [],
): Battler {
  const spec: BattlerSpec = { uid: `${lineId}-${side}`, lineId, age, level, traits };
  return makeBattler(spec, side, ctx, { isWild: side === "enemy", enteredOnTurn: 1 });
}

/* ════════════════════════════════════════════════════════════════════════════
 * Effective stats — build-doc §7.4 / bible §2.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("effective stats (build-doc §7.4: base × ageMult × (1 + 0.02 × level) + traitMods)", () => {
  it("applies age multiplier and the level coefficient", () => {
    // mosslet-line base def 75, Plant (no Beast bonus), Adult ×1.0, level 10 ⇒ 1 + 0.02×10 = 1.2
    //   75 × 1.0 × 1.2 = 90
    expect(battler("mosslet-line", "A", 10).stats.def).toBe(90);
    // RE-DERIVED for the T-10 halving of balance.age.multiplier (J 0.75 → 0.875, E 1.15 → 1.075;
    // A is neutral and did not move, which is why the Adult line above is unchanged). Half the
    // deviation from neutral, not half the value — see data/balance.json `age._multiplier`.
    // Juvenile ×0.875: 75 × 0.875 × 1.2 = 78.75  → 79
    expect(battler("mosslet-line", "J", 10).stats.def).toBe(79);
    // Elder ×1.075:    75 × 1.075 × 1.2 = 96.75  → 97
    expect(battler("mosslet-line", "E", 10).stats.def).toBe(97);
  });

  it("gives Beast +10% BASE stats instead of an offensive advantage (bible §1)", () => {
    // nibbin-line is Beast, base atk 60, Adult, level 10:
    //   60 × 1.10 × 1.0 × 1.2 = 79.2 → 79
    expect(battler("nibbin-line", "A", 10).stats.atk).toBe(79);
    // Same line with the bonus tuned to zero:  60 × 1.0 × 1.2 = 72
    const noBeast = retuned((b) => {
      b.types.beastBaseStatBonus = 0;
    });
    expect(effectiveStats({ line: line("nibbin-line"), age: "A", level: 10, balance: noBeast }).atk).toBe(72);
    // And the bonus reaches every stat, not just Attack: hp 80 × 1.1 × 1.2 = 105.6 → 106
    expect(battler("nibbin-line", "A", 10).stats.hp).toBe(106);
    // A non-Beast line is untouched by it: mosslet atk 50 × 1.0 × 1.2 = 60
    expect(battler("mosslet-line", "A", 10).stats.atk).toBe(60);
  });

  it("applies the metamorphic ×1.15 exactly once, at and after the J→A transition", () => {
    // cindril-line (metamorphic) and webvern-line (not) share base atk 70, so the ONLY difference
    // between these numbers is the jump.
    expect(line("cindril-line").metamorphic).toBe(true);
    expect(line("webvern-line").metamorphic).toBe(false);
    expect(line("cindril-line").baseStats.atk).toBe(line("webvern-line").baseStats.atk);

    // The J and E rows are RE-DERIVED for the T-10 age halving (J 0.75 → 0.875, E 1.15 → 1.075).
    // The metamorphic ×1.15 is deliberately NOT halved — it is build-doc §7.4's separate once-only
    // term, not the J/A/E multiplier — so the Adult rows below are untouched, and this test's whole
    // claim (the jump lands exactly once) is unchanged. Only the age factor moved.
    // Juvenile — no jump yet:            70 × 0.875 × (1 + 0.02) = 62.475 → 62
    expect(battler("cindril-line", "J", 1).stats.atk).toBe(62);
    expect(battler("webvern-line", "J", 1).stats.atk).toBe(62);
    // Adult — jump applied ONCE:         70 × 1.000 × 1.15 × 1.02 = 82.11  → 82
    expect(battler("cindril-line", "A", 1).stats.atk).toBe(82);
    //   …against the non-metamorphic:    70 × 1.000 × 1.02        = 71.4   → 71
    expect(battler("webvern-line", "A", 1).stats.atk).toBe(71);
    // Elder — STILL exactly one jump:    70 × 1.075 × 1.15 × 1.02 = 88.268 → 88
    //   (twice would be 70 × 1.075 × 1.15² × 1.02 = 101.5 → 102, which this pins out)
    expect(battler("cindril-line", "E", 1).stats.atk).toBe(88);
    expect(battler("webvern-line", "E", 1).stats.atk).toBe(77);

    expect(hasMetamorphosed(line("cindril-line"), "J")).toBe(false);
    expect(hasMetamorphosed(line("cindril-line"), "A")).toBe(true);
    expect(hasMetamorphosed(line("cindril-line"), "E")).toBe(true);
    expect(hasMetamorphosed(line("webvern-line"), "E")).toBe(false);
    // An explicit flag overrides the age (a J that has not yet transitioned stays un-jumped).
    expect(hasMetamorphosed(line("cindril-line"), "A", false)).toBe(false);
  });

  it("adds trait modifiers as a flat ±10% of the pre-trait stat (bible §2)", () => {
    const thickPelt = B.traits.pool.find((t) => t.id === "thick-pelt");
    expect(thickPelt).toBeDefined();
    // RE-DERIVED for the T-10 age halving: the Elder factor is 1.075, not 1.15. The CLAIM this
    // test makes — that the trait is a flat ±10% of the PRE-TRAIT stat — is unchanged, and the two
    // numbers below still stand in exactly that ratio (109.263 = 99.33 × 1.1).
    // nibbin-line Elder level 10 def: 70 × 1.1(Beast) × 1.075 × 1.2 = 99.33
    //   + Thick Pelt (+10%):          99.33 × 1.1 = 109.263 → 109
    const withTrait = effectiveStats({
      line: line("nibbin-line"),
      age: "E",
      level: 10,
      balance: B,
      traits: [thickPelt as Trait],
    });
    expect(withTrait.def).toBe(109);
    // …and 99.33 → 99 without it.
    expect(battler("nibbin-line", "E", 10).stats.def).toBe(99);
  });

  it("knows exactly the moves its level has unlocked (bible §3: 1/5/10/15)", () => {
    const cindril = line("cindril-line");
    expect(movesKnownAt(cindril, 1, B)).toEqual(["singe"]);
    expect(movesKnownAt(cindril, 4, B)).toEqual(["singe"]);
    expect(movesKnownAt(cindril, 5, B)).toEqual(["singe", "pyre"]);
    expect(movesKnownAt(cindril, 10, B)).toEqual(["singe", "pyre", "ambush"]);
    expect(movesKnownAt(cindril, 15, B)).toEqual(["singe", "pyre", "ambush", "lure"]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Damage — build-doc §7.4:
 *   damage = (atk × movePower / def) × typeMult × predation × roll(0.9, 1.1)
 *
 * Every case scripts [0.5, 0.99]:
 *   draw 1 = 0.5  ⇒ roll = 0.9 + 0.5 × (1.1 − 0.9) = 1.0 exactly
 *   draw 2 = 0.99 ⇒ no crit (the highest crit chance in this file is
 *                    0.04 + 0.0008 × 72 ins = 0.0976)
 * ════════════════════════════════════════════════════════════════════════════ */

const MID_ROLL_NO_CRIT = [0.5, 0.99];

describe("damage formula (build-doc §7.4), hand-computed", () => {
  it("neutral: Maul (Beast 70) Nibbin → Mosslet", () => {
    // atk 79 (60 × 1.1 × 1.0 × 1.2) · def 90 (75 × 1.2) · Beast strongVs nothing, and Plant's
    // strongVs is [Water, Earth] so Beast is not resisted either ⇒ ×1.0 · no predation ⇒ ×1.0
    //   79 × 70 / 90 = 61.444… × 1.0 × 1.0 × 1.0 = 61.444… → floor 61
    const result = computeDamage(
      battler("nibbin-line", "A", 10),
      battler("mosslet-line", "A", 10, "enemy"),
      move("maul"),
      scripted(MID_ROLL_NO_CRIT),
      NO_WEB,
    );
    expect(result).toEqual({ amount: 61, effectiveness: "neutral", predation: false, crit: false, evadeMult: 1 });
  });

  it("super-effective: Pyre (Fire 70) Vulkindle → Mosslet", () => {
    // atk 97 (70 × 1.15 metamorphic × 1.2) · def 90 · Fire strongVs Plant ⇒ ×1.5
    //   97 × 70 / 90 = 75.444… × 1.5 = 113.166… → floor 113
    const result = computeDamage(
      battler("cindril-line", "A", 10),
      battler("mosslet-line", "A", 10, "enemy"),
      move("pyre"),
      scripted(MID_ROLL_NO_CRIT),
      NO_WEB,
    );
    expect(result).toEqual({ amount: 113, effectiveness: "super", predation: false, crit: false, evadeMult: 1 });
  });

  it("resisted: Riptide (Water 70) Rillisk → Mosslet", () => {
    // atk 97 (70 × 1.15 × 1.2) · def 90 · Plant strongVs Water ⇒ ×0.67
    //   97 × 70 / 90 = 75.444… × 0.67 = 50.548… → floor 50
    const result = computeDamage(
      battler("puddlisk-line", "A", 10),
      battler("mosslet-line", "A", 10, "enemy"),
      move("riptide"),
      scripted(MID_ROLL_NO_CRIT),
      NO_WEB,
    );
    expect(result).toEqual({ amount: 50, effectiveness: "resisted", predation: false, crit: false, evadeMult: 1 });
  });

  it("dual-type defender multiplies both halves: Pyre → Barkhide (Plant/Earth)", () => {
    // atk 97 · def 102 (85 × 1.2) · Fire strongVs Plant ⇒ ×1.5, Earth strongVs Fire ⇒ ×0.67
    //   97 × 70 / 102 = 66.568… × 1.5 × 0.67 = 66.801… → floor 66
    const result = computeDamage(
      battler("cindril-line", "A", 10),
      battler("barkhide-line", "A", 10, "enemy"),
      move("pyre"),
      scripted(MID_ROLL_NO_CRIT),
      NO_WEB,
    );
    // The MULTIPLIER is the product of both halves — 1.5 × 0.67 = 1.005 — and the damage above is
    // computed from it. The reported BAND is not: one strong half and one resisted half cancel, so
    // the renderer is told "neutral" rather than announcing a super-effective hit worth +0.5%
    // (build-doc §15 C3 — the log is what the scene narrates from). This case previously pinned
    // "super", which is how the mismatch shipped.
    expect(result).toEqual({ amount: 66, effectiveness: "neutral", predation: false, crit: false, evadeMult: 1 });
    expect(typeMultiplier("Fire", ["Plant", "Earth"], content.moves.typeChart, B).mult).toBeCloseTo(1.005, 10);
    expect(typeMultiplier("Fire", ["Plant", "Earth"], content.moves.typeChart, B).band).toBe("neutral");
  });

  it("bands a matchup by its NET interactions, never by the float product", () => {
    const chart = content.moves.typeChart;
    // One-sided cases are unchanged: Fire→Plant is strong, Fire→Water is resisted.
    expect(typeMultiplier("Fire", ["Plant"], chart, B)).toEqual({ mult: 1.5, band: "super" });
    expect(typeMultiplier("Fire", ["Water"], chart, B).band).toBe("resisted");
    // Two strong halves stay super (1.5² = 2.25); two resisted halves stay resisted (0.67²).
    expect(typeMultiplier("Fire", ["Plant", "Poison"], chart, B)).toMatchObject({ band: "super" });
    expect(typeMultiplier("Fire", ["Water", "Earth"], chart, B)).toMatchObject({ band: "resisted" });
    // Mixed cancels — and does so for every dual-typed line the roster actually fields.
    expect(typeMultiplier("Fire", ["Water", "Poison"], chart, B).band).toBe("neutral"); // Mirefin
    expect(typeMultiplier("Fire", ["Plant", "Earth"], chart, B).band).toBe("neutral"); // Barkhide
    // A retune that widens the gap does not change the reading either: the band counts, it does not
    // measure, so it cannot drift with balance.json.
    const wide = retuned((b) => {
      b.types.superEffective = 3;
      b.types.resisted = 0.5;
    });
    expect(typeMultiplier("Fire", ["Plant", "Earth"], chart, wide)).toEqual({ mult: 1.5, band: "neutral" });
    // Typeless role/utility moves land at the neutral multiplier with a neutral band.
    expect(typeMultiplier(null, ["Plant", "Earth"], chart, B)).toEqual({ mult: B.types.neutral, band: "neutral" });
  });

  it("PREDATION applies ×1.25 iff the derived diet contains the defender's line", () => {
    // Fenmaw → Reedrick is bible §5's exceptions row, so the derived web carries the edge.
    // atk 108 (90 × 1.2) · def 90 (75 × 1.2) · Water into Plant/Wind: Plant strongVs Water ⇒ ×0.67
    //   and Wind strongVs Water ⇒ ×0.67, so typeMult = 0.4489
    //   108 × 70 / 90 = 84 exactly
    //   with predation:    84 × 0.4489 × 1.25 = 47.134… → floor 47
    const fed = ctxWith({ "fenmaw-line": ["reedrick-line", "mirefin-line"] });
    const withPredation = computeDamage(
      battler("fenmaw-line", "A", 10, "player", fed),
      battler("reedrick-line", "A", 10, "enemy", fed),
      move("riptide"),
      scripted(MID_ROLL_NO_CRIT),
      fed,
    );
    expect(withPredation).toEqual({ amount: 47, effectiveness: "resisted", predation: true, crit: false, evadeMult: 1 });

    //   without it:        84 × 0.4489        = 37.707… → floor 37
    const starved = ctxWith({ "fenmaw-line": [] });
    const withoutPredation = computeDamage(
      battler("fenmaw-line", "A", 10, "player", starved),
      battler("reedrick-line", "A", 10, "enemy", starved),
      move("riptide"),
      scripted(MID_ROLL_NO_CRIT),
      starved,
    );
    expect(withoutPredation).toEqual({ amount: 37, effectiveness: "resisted", predation: false, crit: false, evadeMult: 1 });
    // 47 / 37.707… is the 1.25 of build-doc §7.4 — the bump is real, not rounding.
    expect(B.types.predation).toBe(1.25);
  });

  it("Trample carries bible §3's +25 power against a Producer, and nothing against others", () => {
    // atk 79 · Loamunder def 102 (85 × 1.2) · Loamunder is a Producer ⇒ power 50 + 25 = 75
    //   79 × 75 / 102 = 58.088… → floor 58
    expect(
      computeDamage(
        battler("nibbin-line", "A", 10),
        battler("loamunder-line", "A", 10, "enemy"),
        move("trample"),
        scripted(MID_ROLL_NO_CRIT),
        NO_WEB,
      ).amount,
    ).toBe(58);
    // Mosslet is a Grazer ⇒ power stays 50, def 90:  79 × 50 / 90 = 43.888… → floor 43
    expect(
      computeDamage(
        battler("nibbin-line", "A", 10),
        battler("mosslet-line", "A", 10, "enemy"),
        move("trample"),
        scripted(MID_ROLL_NO_CRIT),
        NO_WEB,
      ).amount,
    ).toBe(43);
  });

  it("spends the damage roll across its full 0.9–1.1 band, then the crit roll", () => {
    const attacker = battler("nibbin-line", "A", 10);
    const defender = battler("mosslet-line", "A", 10, "enemy");
    const maul = move("maul");
    // roll draw 0 ⇒ 0.9:  61.444… × 0.9 = 55.3 → 55
    expect(computeDamage(attacker, defender, maul, scripted([0, 0.99]), NO_WEB).amount).toBe(55);
    // roll draw ~1 ⇒ 1.1: 61.444… × 1.1 = 67.588… → 67
    expect(computeDamage(attacker, defender, maul, scripted([0.999999, 0.99]), NO_WEB).amount).toBe(67);
    // crit draw below the chance ⇒ ×1.5: 61.444… × 1.5 = 92.166… → 92
    const crit = computeDamage(attacker, defender, maul, scripted([0.5, 0]), NO_WEB);
    expect(crit).toEqual({ amount: 92, effectiveness: "neutral", predation: false, crit: true, evadeMult: 1 });
  });

  it("never deals less than balance.damage.minDamage", () => {
    // A Producer swinging its weakest move into the tankiest Elder still registers.
    const weak = battler("loamunder-line", "J", 1);
    const wall = battler("barkhide-line", "E", 40, "enemy");
    const result = computeDamage(weak, wall, move("sunder"), scripted([0, 0.99]), NO_WEB);
    expect(result.amount).toBeGreaterThanOrEqual(B.damage.minDamage);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Statuses — bible §2 / build-doc §7.4. Exactly four, one at a time, newest wins.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("status tick math (build-doc §7.4)", () => {
  it("Burn chips a flat 6% of max HP and Toxin ramps 4% +2%/turn to its cap", () => {
    expect(statusChipFraction({ name: "Burn", turnsActive: 0 }, B)).toBeCloseTo(0.06, 10);
    expect(statusChipFraction({ name: "Burn", turnsActive: 7 }, B)).toBeCloseTo(0.06, 10);
    // 4% + 2% × turnsActive
    expect(statusChipFraction({ name: "Toxin", turnsActive: 0 }, B)).toBeCloseTo(0.04, 10);
    expect(statusChipFraction({ name: "Toxin", turnsActive: 1 }, B)).toBeCloseTo(0.06, 10);
    expect(statusChipFraction({ name: "Toxin", turnsActive: 2 }, B)).toBeCloseTo(0.08, 10);
    // capped at balance.status.toxinMaxFracPerTurn = 0.20, reached at turnsActive 8
    expect(statusChipFraction({ name: "Toxin", turnsActive: 8 }, B)).toBeCloseTo(0.2, 10);
    expect(statusChipFraction({ name: "Toxin", turnsActive: 40 }, B)).toBeCloseTo(0.2, 10);
    // Soak and Daze do not chip at all.
    expect(statusChipFraction({ name: "Soak", turnsActive: 3 }, B)).toBe(0);
    expect(statusChipFraction({ name: "Daze", turnsActive: 3 }, B)).toBe(0);
  });

  it("ramps Toxin over successive turns inside a real battle", () => {
    // Sporantle (Producer, Poison/Plant, base atk 60/def 75/hp 85) vs Loamunder (Producer,
    // Earth/Plant, base hp 85 → max HP 85 × 1.2 = 102).
    //
    // THE ASSERTION BELOW IS UNCHANGED — [4, 6, 8] and max HP 102 are exactly what they were. What
    // moved is the STAGE. This used to throw Blight on all three turns, justified by "both are slow
    // tanks, so the fight lasts"; T-11 re-spent the Producer template (atk 40 → 60), that sentence
    // stopped being true, and Loamunder now dies on turn 3 before the third tick can be observed.
    // Turns 2 and 3 are Regrow instead — Sporantle's own role move, which heals and deals no
    // damage — so the three turns of the ramp happen. The draw-script guard the old version relied
    // on (0.9 ≥ 0.2 keeps Blight from re-applying Toxin and resetting the ramp) is replaced by a
    // stronger, direct claim at the bottom: turnsActive is 3, which a re-application could not be.
    const ctx = NO_WEB;
    const input: BattleInput = {
      seed: 1,
      kind: "wild",
      playerParty: [{ uid: "spore", lineId: "sporantle-line", age: "A", level: 10, traits: [] }],
      enemyParty: [{ uid: "loam", lineId: "loamunder-line", age: "A", level: 10, traits: [] }],
    };
    let { state } = startBattle(input, ctx);
    expect(state.battlers["loam"]?.maxHp).toBe(102);
    const ticks: number[] = [];
    // Turn 1 draws: [damage roll, crit, Blight's 20% Toxin roll] then the enemy's [roll, crit];
    // 0.05 < 0.2 applies Toxin. Regrow does no damage and rolls no status, so turns 2 and 3 draw
    // only the enemy's two.
    const turns: Array<{ moveId: string; draws: number[] }> = [
      { moveId: "blight", draws: [0.5, 0.99, 0.05, 0.5, 0.99] },
      { moveId: "regrow", draws: [0.5, 0.99] },
      { moveId: "regrow", draws: [0.5, 0.99] },
    ];
    for (const { moveId, draws } of turns) {
      const out = step(state, { kind: "move", moveId }, scripted(draws), ctx);
      state = out.state;
      for (const e of out.events) if (e.t === "statusTick") ticks.push(e.amount);
    }
    // floor(102 × 0.04) = 4 · floor(102 × 0.06) = 6 · floor(102 × 0.08) = 8
    expect(ticks).toEqual([4, 6, 8]);
    expect(state.battlers["loam"]?.status?.name).toBe("Toxin");
    // The ramp is driven by turnsActive, so this is the claim the three amounts above rest on: one
    // application, carried three turns. A re-application anywhere would read 1 or 2 here and the
    // amounts would have flattened.
    expect(state.battlers["loam"]?.status?.turnsActive).toBe(3);
  });

  it("keeps exactly one status: the newest replaces the old", () => {
    const ctx = NO_WEB;
    const input: BattleInput = {
      seed: 2,
      kind: "wild",
      playerParty: [{ uid: "spore", lineId: "sporantle-line", age: "A", level: 10, traits: [] }],
      enemyParty: [{ uid: "loam", lineId: "loamunder-line", age: "A", level: 10, traits: [] }],
    };
    const started = startBattle(input, ctx);
    // Hand the reducer a state where the target is already Burned three turns deep.
    const burned: BattleState = structuredClone(started.state);
    const target = burned.battlers["loam"];
    if (!target) throw new Error("no target");
    target.status = { name: "Burn", turnsActive: 3 };
    const out = step(burned, { kind: "move", moveId: "blight" }, scripted([0.5, 0.99, 0.05, 0.5, 0.99]), ctx);
    const applied = out.events.find((e) => e.t === "statusApplied");
    expect(applied).toEqual({ t: "statusApplied", uid: "loam", status: "Toxin", replaced: "Burn" });
    expect(out.state.battlers["loam"]?.status).toEqual({ name: "Toxin", turnsActive: 1 });
    // The replaced Burn's 6% never ticks again — the single tick this turn is Toxin's 4%.
    const tick = out.events.find((e) => e.t === "statusTick");
    expect(tick).toEqual({ t: "statusTick", uid: "loam", status: "Toxin", amount: 4 });
  });

  it("Daze skips the actor's turn 25% of the time, and Soak takes 30% off Speed", () => {
    const ctx = NO_WEB;
    const input: BattleInput = {
      seed: 3,
      kind: "wild",
      playerParty: [{ uid: "spore", lineId: "sporantle-line", age: "A", level: 10, traits: [] }],
      enemyParty: [{ uid: "loam", lineId: "loamunder-line", age: "A", level: 10, traits: [] }],
    };
    const started = startBattle(input, ctx);
    const dazed: BattleState = structuredClone(started.state);
    const me = dazed.battlers["spore"];
    if (!me) throw new Error("no battler");
    me.status = { name: "Daze", turnsActive: 0 };
    // draw 1 = 0.1 < 0.25 ⇒ the turn is skipped; the enemy still acts ([roll, crit]).
    const skipped = step(dazed, { kind: "move", moveId: "blight" }, scripted([0.1, 0.5, 0.99]), ctx);
    expect(skipped.events.some((e) => e.t === "statusSkip" && e.uid === "spore")).toBe(true);
    expect(skipped.events.some((e) => e.t === "moveUsed" && e.uid === "spore")).toBe(false);
    // draw 1 = 0.3 ≥ 0.25 ⇒ it acts: [Daze roll, roll, crit, Toxin roll] then the enemy's two.
    const acted = step(dazed, { kind: "move", moveId: "blight" }, scripted([0.3, 0.5, 0.99, 0.9, 0.5, 0.99]), ctx);
    expect(acted.events.some((e) => e.t === "moveUsed" && e.uid === "spore")).toBe(true);

    // Soak: pollywisp spd 50 × 1.2 = 60 → × 0.7 = 42.
    const soaked = battler("pollywisp-line", "A", 10);
    expect(effectiveSpeed(soaked, B)).toBe(60);
    const wet: Battler = { ...soaked, status: { name: "Soak", turnsActive: 0 } };
    expect(effectiveSpeed(wet, B)).toBeCloseTo(42, 10);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Turn order — bible §3 Ambush, Speed, Soak.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("turn order (build-doc §7.4 / bible §3)", () => {
  const ctx = NO_WEB;
  const input: BattleInput = {
    seed: 4,
    kind: "wild",
    // webvern spd 80 × 1.2 = 96 · skir spd 85 × 1.2 = 102 ⇒ the enemy is faster.
    playerParty: [{ uid: "web", lineId: "webvern-line", age: "A", level: 10, traits: [] }],
    enemyParty: [{ uid: "skir", lineId: "skir-line", age: "A", level: 10, traits: [] }],
  };

  function firstActor(events: readonly BattleEvent[]): string | undefined {
    for (const e of events) if (e.t === "moveUsed") return e.uid;
    return undefined;
  }

  it("orders by Speed when neither side has priority", () => {
    const started = startBattle(input, ctx);
    const out = step(started.state, { kind: "move", moveId: "miasma" }, cyclic([0.5, 0.99]), ctx);
    expect(firstActor(out.events)).toBe("skir");
  });

  it("makes Ambush always-first on the entry turn — and only then", () => {
    const started = startBattle(input, ctx);
    // Turn 1 IS the entry turn for both, but the enemy's argmax picks Squall (70) over Ambush (60),
    // so only the player carries priority.
    const entry = step(started.state, { kind: "move", moveId: "ambush" }, cyclic([0.5, 0.99]), ctx);
    expect(firstActor(entry.events)).toBe("web");
    expect(chooseEnemyAction(started.state, ctx)).toEqual({ kind: "move", moveId: "squall" });

    // Same battle, same turn, but the player entered earlier ⇒ Speed decides again.
    const veteran: BattleState = structuredClone(started.state);
    const me = veteran.battlers["web"];
    if (!me) throw new Error("no battler");
    me.enteredOnTurn = 0;
    const later = step(veteran, { kind: "move", moveId: "ambush" }, cyclic([0.5, 0.99]), ctx);
    expect(firstActor(later.events)).toBe("skir");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * XP — build-doc §7.4. xpGain = 12 + 4 × enemyLevel × ageBonus(E:1.3); xpToNext = 15 × l^1.4.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("XP curve and the level cap (build-doc §7.4)", () => {
  it("computes xpGain with the Elder bonus", () => {
    // 12 + 4 × 10 × 1.0 = 52
    expect(xpGain(battler("mosslet-line", "A", 10, "enemy"), B)).toBe(52);
    // 12 + 4 × 10 × 1.3 = 64
    expect(xpGain(battler("mosslet-line", "E", 10, "enemy"), B)).toBe(64);
    // 12 + 4 × 1 × 1.0 = 16
    expect(xpGain(battler("mosslet-line", "J", 1, "enemy"), B)).toBe(16);
  });

  it("computes xpToNext = 15 × level^1.4", () => {
    expect(xpToNext(1, B)).toBeCloseTo(15, 10); // 15 × 1 = 15
    expect(xpToNext(2, B)).toBeCloseTo(39.5852, 3); // 15 × 2^1.4 = 15 × 2.63902 = 39.5852
    expect(xpToNext(10, B)).toBeCloseTo(376.783, 3); // 15 × 10^1.4
    expect(xpToNext(40, B)).toBeCloseTo(2624.069, 3); // 15 × 40^1.4
  });

  it("opens a battler on the XP its spec carries, and on zero when it carries none", () => {
    // The read-back half of the XP loop. `core/save.ts` `applyBattleAftermath` has always written a
    // creature's banked XP OUT after a fight; `makeBattler` held a hard `xp: 0`, so nothing ever
    // read it back and a level only ever arrived when ONE fight covered a whole `xpToNext(level)`.
    // The whole loop — save → spec → battler → save — is bound in tests/unit/xp-carry.test.ts;
    // this case pins the reducer's end of it, where the `0` used to be.
    const carried: BattlerSpec = { uid: "carried", lineId: "mosslet-line", age: "A", level: 5, traits: [], xp: 88 };
    expect(xpOf(makeBattler(carried, "player", NO_WEB, { isWild: false, enteredOnTurn: 1 }))).toBe(88);
    // A gym slot, a wild encounter and a rival's roster all spec no `xp` at all — the default has
    // to stay a default.
    expect(xpOf(battler("mosslet-line", "A", 5))).toBe(0);
  });

  it("levels up from a faint, banking the remainder", () => {
    const ctx = NO_WEB;
    // A level-1 Mosslet finishing an Adult level-10 Nibbin banks 52 XP.
    // 52 ≥ xpToNext(1) = 15 ⇒ level 2 with 37 left; 37 < xpToNext(2) = 39.585 ⇒ it stops there.
    const input: BattleInput = {
      seed: 5,
      kind: "wild",
      playerParty: [{ uid: "moss", lineId: "mosslet-line", age: "A", level: 1, traits: [] }],
      enemyParty: [{ uid: "nib", lineId: "nibbin-line", age: "A", level: 10, traits: [], curHp: 1 }],
    };
    const started = startBattle(input, ctx);
    const out = step(started.state, { kind: "move", moveId: "bramble" }, cyclic([0.5, 0.99]), ctx);
    expect(out.events.some((e) => e.t === "faint" && e.uid === "nib")).toBe(true);
    expect(out.events.find((e) => e.t === "xpGained")).toEqual({ t: "xpGained", uid: "moss", amount: 52 });
    const levelUps = out.events.filter((e) => e.t === "levelUp");
    expect(levelUps).toHaveLength(1);
    expect(levelUps[0]).toMatchObject({ t: "levelUp", uid: "moss", level: 2 });
    const moss = out.state.battlers["moss"];
    expect(moss?.level).toBe(2);
    expect(xpOf(moss as Battler)).toBeCloseTo(37, 10);
    expect(out.state.outcome).toBe("win");
  });

  it("learns the slot move whose unlock level it just reached", () => {
    const ctx = NO_WEB;
    const input: BattleInput = {
      seed: 6,
      kind: "wild",
      playerParty: [{ uid: "moss", lineId: "mosslet-line", age: "A", level: 4, traits: [] }],
      enemyParty: [{ uid: "nib", lineId: "nibbin-line", age: "A", level: 10, traits: [], curHp: 1 }],
    };
    const started = startBattle(input, ctx);
    const primed: BattleState = structuredClone(started.state);
    // 100 banked + 52 from the faint = 152 ≥ xpToNext(4) = 15 × 4^1.4 = 104.5 ⇒ level 5,
    // which is the type2 unlock: mosslet-line's movePool.type2 is "overgrow".
    Object.assign(primed.battlers["moss"] as Battler, { xp: 100 });
    const out = step(primed, { kind: "move", moveId: "bramble" }, cyclic([0.5, 0.99]), ctx);
    const levelUp = out.events.find((e) => e.t === "levelUp");
    expect(levelUp).toEqual({ t: "levelUp", uid: "moss", level: 5, learnedMoveId: "overgrow" });
    expect(out.state.battlers["moss"]?.moves).toContain("overgrow");
  });

  it("never passes the level cap", () => {
    const ctx = NO_WEB;
    const input: BattleInput = {
      seed: 7,
      kind: "wild",
      playerParty: [{ uid: "moss", lineId: "mosslet-line", age: "A", level: B.xp.levelCap, traits: [] }],
      enemyParty: [{ uid: "nib", lineId: "nibbin-line", age: "E", level: 40, traits: [], curHp: 1 }],
    };
    const started = startBattle(input, ctx);
    const primed: BattleState = structuredClone(started.state);
    Object.assign(primed.battlers["moss"] as Battler, { xp: 99_999 });
    const out = step(primed, { kind: "move", moveId: "bramble" }, cyclic([0.5, 0.99]), ctx);
    expect(out.events.some((e) => e.t === "xpGained")).toBe(true);
    expect(out.events.some((e) => e.t === "levelUp")).toBe(false);
    expect(out.state.battlers["moss"]?.level).toBe(B.xp.levelCap);
    expect(B.xp.levelCap).toBe(40);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * KO semantics — Hard Req 8 / bible §13.14: faint only, never death.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("KO is a faint and nothing else (Hard Req 8)", () => {
  it("leaves the knocked-out battler in the state, fainted at 0 HP", () => {
    const ctx = NO_WEB;
    const input: BattleInput = {
      seed: 8,
      kind: "wild",
      playerParty: [{ uid: "moss", lineId: "mosslet-line", age: "A", level: 10, traits: [] }],
      enemyParty: [{ uid: "nib", lineId: "nibbin-line", age: "A", level: 10, traits: [], curHp: 1 }],
    };
    const started = startBattle(input, ctx);
    const out = step(started.state, { kind: "move", moveId: "bramble" }, cyclic([0.5, 0.99]), ctx);
    const ko = out.state.battlers["nib"];
    expect(ko).toBeDefined();
    expect(ko?.fainted).toBe(true);
    expect(ko?.curHp).toBe(0);
    expect(Object.keys(out.state.battlers)).toContain("nib");
    expect(out.state.outcome).toBe("win");
  });

  it("chip damage can faint but the battler is still there afterwards", () => {
    const ctx = NO_WEB;
    const input: BattleInput = {
      seed: 9,
      kind: "wild",
      playerParty: [{ uid: "spore", lineId: "sporantle-line", age: "A", level: 10, traits: [] }],
      enemyParty: [{ uid: "loam", lineId: "loamunder-line", age: "A", level: 10, traits: [], curHp: 1 }],
    };
    const started = startBattle(input, ctx);
    const burning: BattleState = structuredClone(started.state);
    const victim = burning.battlers["loam"];
    if (!victim) throw new Error("no victim");
    victim.status = { name: "Burn", turnsActive: 0 };
    victim.curHp = 2;
    // The player uses the non-damaging Regrow so only the end-of-turn Burn tick can land the KO.
    const out = step(burning, { kind: "move", moveId: "regrow" }, scripted([0.5, 0.99]), ctx);
    expect(out.events.some((e) => e.t === "statusTick" && e.uid === "loam")).toBe(true);
    expect(out.events.some((e) => e.t === "faint" && e.uid === "loam")).toBe(true);
    expect(out.state.battlers["loam"]?.curHp).toBe(0);
    expect(out.state.outcome).toBe("win");
  });

  it("logs the HP an overkill actually removed, not the roll that overshot it", () => {
    // WAS: `dealDamage` clamped the STATE at zero (`max(0, curHp - amount)`) and then logged the
    // UNCLAMPED `amount`. A creature at 1 HP hit for 26 lost 1 HP and the log said 26, so the
    // narration read "−26 HP" over a bar that moved one pixel — and build-doc §7.4's renderer
    // contract ("replaying the log from the state at the start of the step reproduces the state at
    // the end") was false for every knockout. `game/battle-view.ts` papered over it with a clamp of
    // its own, which is the same defect one level up: two authorities on one number.
    //
    // The event carries the damage DEALT. The damage ROLLED is not lost — `computeDamage` is
    // exported and returns it, which is where the balance harness and the formula tests read it
    // (build-doc §7.4). Nothing outside the formula wants the overshoot, so no second field is
    // added to carry it.
    const ctx = NO_WEB;
    const input: BattleInput = {
      seed: 8,
      kind: "wild",
      playerParty: [{ uid: "moss", lineId: "mosslet-line", age: "A", level: 10, traits: [] }],
      enemyParty: [{ uid: "nib", lineId: "nibbin-line", age: "A", level: 10, traits: [], curHp: 1 }],
    };
    const started = startBattle(input, ctx);
    expect(started.state.battlers["nib"]?.curHp).toBe(1);
    const out = step(started.state, { kind: "move", moveId: "bramble" }, cyclic([0.5, 0.99]), ctx);

    // The roll is unchanged and still reachable at the formula's own boundary: Bramble into this
    // defender on the mid roll with no crit is 26, four-and-twenty more than the target owns.
    const roll = computeDamage(
      battler("mosslet-line", "A", 10),
      battler("nibbin-line", "A", 10, "enemy"),
      move("bramble"),
      scripted(MID_ROLL_NO_CRIT),
      ctx,
    );
    expect(roll.amount).toBe(26);

    // …and the log reports the one point of HP that actually left the creature.
    const hit = out.events.find((e) => e.t === "damage" && e.uid === "nib");
    expect(hit?.t === "damage" ? hit.amount : -1).toBe(1);
    expect(out.state.battlers["nib"]?.curHp).toBe(0);
  });

  it("logs the HP an overkilling status chip actually removed", () => {
    // The same arithmetic, at the other site that moves HP without going through `dealDamage`.
    // loamunder-line at level 10 has 102 max HP and balance.status Burn chips 6% ⇒ floor(6.12) = 6.
    // Standing at 2 HP, the tick removes 2.
    const ctx = NO_WEB;
    const input: BattleInput = {
      seed: 9,
      kind: "wild",
      playerParty: [{ uid: "spore", lineId: "sporantle-line", age: "A", level: 10, traits: [] }],
      enemyParty: [{ uid: "loam", lineId: "loamunder-line", age: "A", level: 10, traits: [], curHp: 1 }],
    };
    const started = startBattle(input, ctx);
    const burning: BattleState = structuredClone(started.state);
    const victim = burning.battlers["loam"];
    if (!victim) throw new Error("no victim");
    expect(victim.maxHp).toBe(102);
    expect(Math.floor(victim.maxHp * statusChipFraction({ name: "Burn", turnsActive: 0 }, B))).toBe(6);
    victim.status = { name: "Burn", turnsActive: 0 };
    victim.curHp = 2;
    const out = step(burning, { kind: "move", moveId: "regrow" }, scripted([0.5, 0.99]), ctx);
    const tick = out.events.find((e) => e.t === "statusTick" && e.uid === "loam");
    expect(tick?.t === "statusTick" ? tick.amount : -1).toBe(2);
    expect(out.state.battlers["loam"]?.curHp).toBe(0);
  });

  it("BINDS — every HP-moving event in every fixture equals the HP that actually moved", () => {
    // The standing reconstruction test (`carries enough in events[] to redraw every HP bar`) reads
    // `faint` as "set the tally to 0", so it reconciles an overshoot instead of catching it: the
    // gym fixture carried five overkills under a green suite. This walks the same logs with NO
    // reconciliation, so the deltas have to close on their own.
    for (const script of SCRIPTS) {
      const ctx = makeBattleContext(content, predationOracleFromWebs([script.foodWeb]));
      const hp = new Map<string, number>();
      for (const [uid, b] of Object.entries(startBattle(script.input, ctx).state.battlers)) hp.set(uid, b.curHp);
      const { state, events } = replay(script);
      for (const e of events) {
        if (e.t !== "damage" && e.t !== "statusTick" && e.t !== "heal") continue;
        const before = hp.get(e.uid) ?? 0;
        const after = e.t === "heal" ? before + e.amount : before - e.amount;
        expect(after, `${script.id}: ${e.t} on ${e.uid} took ${String(e.amount)} from ${String(before)}`).toBeGreaterThanOrEqual(0);
        hp.set(e.uid, after);
      }
      for (const [uid, battler] of Object.entries(state.battlers)) {
        if (events.some((e) => e.t === "levelUp" && e.uid === uid)) continue; // maxHp moved; §15 C3
        expect(hp.get(uid), `${script.id}: ${uid}`).toBe(battler.curHp);
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Action-script fixtures — build-doc §11: "fixtures/battle-scripts/*.json (action logs incl. gym
 * fights)", used by these tests AND by the demo-recording flow.
 * ════════════════════════════════════════════════════════════════════════════ */

interface BattleScript {
  id: string;
  seed: number;
  rngScript: number[];
  foodWeb: FoodWeb;
  input: BattleInput;
  actions: BattleAction[];
  expect: {
    outcome: string;
    turns: number;
    events: number;
    eventDigest: string;
    finalHp?: Record<string, number>;
    caughtUid?: string | null;
  };
}

/** FNV-1a over the serialized event log — a one-line regression lock on the whole replay. */
function digest(events: readonly BattleEvent[]): string {
  const text = JSON.stringify(events);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function replay(script: BattleScript): { state: BattleState; events: BattleEvent[] } {
  const ctx = makeBattleContext(content, predationOracleFromWebs([script.foodWeb]));
  const rng = cyclic(script.rngScript);
  const started = startBattle(script.input, ctx);
  let state = started.state;
  const events: BattleEvent[] = [...started.events];
  for (const action of script.actions) {
    const out = step(state, action, rng, ctx);
    state = out.state;
    events.push(...out.events);
  }
  return { state, events };
}

const SCRIPTS: BattleScript[] = [
  gymJson as unknown as BattleScript,
  wildJson as unknown as BattleScript,
  fleeJson as unknown as BattleScript,
];

describe("fixtures/battle-scripts replay headlessly (build-doc §11)", () => {
  for (const script of SCRIPTS) {
    it(`${script.id} reproduces its recorded outcome and event log`, () => {
      const { state, events } = replay(script);
      expect(state.outcome).toBe(script.expect.outcome);
      expect(state.turn).toBe(script.expect.turns);
      expect(events).toHaveLength(script.expect.events);
      expect(digest(events)).toBe(script.expect.eventDigest);
      for (const [uid, hp] of Object.entries(script.expect.finalHp ?? {})) {
        expect(state.battlers[uid]?.curHp).toBe(hp);
      }
      if (script.expect.caughtUid !== undefined) {
        expect(state.caughtUid ?? null).toBe(script.expect.caughtUid);
      }
    });

    it(`${script.id} replays byte-identically a second time (L10 determinism)`, () => {
      expect(JSON.stringify(replay(script).events)).toBe(JSON.stringify(replay(script).events));
    });
  }

  it("keeps the gym fixture's enemy party equal to data/gyms.json (bible §7, Hard Req 9)", () => {
    // The embedded food web is re-derived and compared below; the ROSTER was hand-transcribed with
    // nothing watching it, so a gyms.json retune would leave the fixture silently stale while its
    // event digest — which locks the recording, not the source — stayed green.
    const gym = gymJson as unknown as BattleScript;
    const leader = content.gyms.find((g) => g.id === "maribel");
    if (!leader) throw new Error("no gym leader maribel");
    const fromData = [...leader.slots, leader.signature];
    const shape = (s: { lineId: string; age: string; level: number; traits?: Trait[]; nickname?: string }) => ({
      lineId: s.lineId,
      age: s.age,
      level: s.level,
      traits: s.traits ?? [],
      nickname: s.nickname ?? null,
    });
    expect(gym.input.enemyParty.map(shape)).toEqual(fromData.map(shape));
    // …and the fixture's own uids stay distinct. The roster carried two Nibbins until the
    // duplicate was cut; the check stays, because a repeated line is legal in every roster.
    expect(new Set(gym.input.enemyParty.map((s) => s.uid)).size).toBe(gym.input.enemyParty.length);
  });

  it("carries enough in events[] to redraw every HP bar (build-doc §15 C3)", () => {
    // The honest renderer contract: the scene NARRATES from events[] and reads absolutes off the
    // state. This proves the narration half is complete for HP — replaying the log's deltas from
    // the opening state reproduces the closing state exactly — and names the one event that moves
    // a bar without carrying the number (levelUp raises maxHp), so the gap is stated, not assumed.
    function checkReconstruction(opening: BattleState, closing: BattleState, events: readonly BattleEvent[]): number {
      const hp = new Map<string, number>();
      for (const [uid, b] of Object.entries(opening.battlers)) hp.set(uid, b.curHp);
      const levelled = new Set<string>();
      for (const e of events) {
        if (e.t === "damage" || e.t === "statusTick") hp.set(e.uid, (hp.get(e.uid) ?? 0) - e.amount);
        if (e.t === "heal") hp.set(e.uid, (hp.get(e.uid) ?? 0) + e.amount);
        if (e.t === "faint") hp.set(e.uid, 0);
        if (e.t === "levelUp") levelled.add(e.uid);
        if ("uid" in e) expect(closing.battlers[e.uid]).toBeDefined(); // every sprite resolves
      }
      let reconstructed = 0;
      for (const [uid, battler] of Object.entries(closing.battlers)) {
        if (levelled.has(uid)) continue; // maxHp moved; the scene re-reads the state on a levelUp
        expect(hp.get(uid)).toBe(battler.curHp);
        reconstructed += 1;
      }
      return reconstructed;
    }

    for (const script of SCRIPTS) {
      const ctx = makeBattleContext(content, predationOracleFromWebs([script.foodWeb]));
      const { state, events } = replay(script);
      expect(checkReconstruction(startBattle(script.input, ctx).state, state, events)).toBeGreaterThan(0);
    }

    // The fixtures never heal, so a purpose-built fight covers the other three HP deltas: a
    // fractional self-heal (Regrow), a heal-for-damage (Scrounge), a salve, and a Burn chip.
    const ctx = NO_WEB;
    const input: BattleInput = {
      seed: 40,
      kind: "gym",
      playerParty: [
        { uid: "crow", lineId: "carricrow-line", age: "A", level: 30, traits: [], curHp: 30 },
        { uid: "spore", lineId: "sporantle-line", age: "A", level: 30, traits: [], curHp: 30 },
      ],
      enemyParty: [{ uid: "loam", lineId: "loamunder-line", age: "J", level: 5, traits: [] }],
      bag: { salve: 2 },
    };
    const opening = startBattle(input, ctx).state;
    const burning: BattleState = structuredClone(opening);
    const victim = burning.battlers["loam"];
    if (!victim) throw new Error("no victim");
    victim.status = { name: "Burn", turnsActive: 0 };
    let state = burning;
    const events: BattleEvent[] = [];
    const script: BattleAction[] = [
      { kind: "item", itemId: B.medicine.salveItemId }, // fracMaxHp heal on the active battler
      { kind: "move", moveId: "scrounge" }, // heal-for-damage-dealt (bible §3)
      { kind: "switch", uid: "spore" },
      { kind: "move", moveId: "regrow" }, // self-heal 30% of max HP
    ];
    for (const action of script) {
      if (state.outcome !== null) break;
      const out = step(state, action, cyclic([0.5, 0.99, 0.9]), ctx);
      state = out.state;
      events.push(...out.events);
    }
    expect(events.filter((e) => e.t === "heal").length).toBeGreaterThanOrEqual(3);
    expect(events.some((e) => e.t === "statusTick")).toBe(true);
    expect(checkReconstruction(burning, state, events)).toBeGreaterThan(0);
  });

  it("the gym fight is a full one: every roster slot is fielded and knocked out", () => {
    const gym = gymJson as unknown as BattleScript;
    const { state, events } = replay(gym);
    expect(gym.input.kind).toBe("gym");
    // bible §7 as amended — gym 1 roster size, signature included. Read off
    // gyms.json rather than retyped, so this asserts "the fixture fields the WHOLE roster" and
    // cannot drift into asserting a stale number of its own.
    expect(gym.input.enemyParty).toHaveLength(content.gyms.find((g) => g.id === "maribel")!.slots.length + 1);
    for (const spec of gym.input.enemyParty) {
      expect(state.battlers[spec.uid]?.fainted).toBe(true);
    }
    expect(state.outcome).toBe("win");
    // Every beat the Phaser scene has to narrate shows up in the log (§15 C3); the case above
    // proves the log's numbers actually reconstruct the fight rather than merely occurring.
    const kinds = new Set(events.map((e) => e.t));
    for (const needed of ["battleStart", "turnStart", "moveUsed", "damage", "faint", "switched", "xpGained", "battleEnd"]) {
      expect(kinds.has(needed as BattleEvent["t"])).toBe(true);
    }
    // Every damage event carries its effectiveness tier, predation flag and crit flag.
    for (const e of events) {
      if (e.t !== "damage") continue;
      expect(["super", "neutral", "resisted"]).toContain(e.effectiveness);
      expect(typeof e.predation).toBe("boolean");
      expect(typeof e.crit).toBe("boolean");
    }
    // Predation is live in this fight: the player's Skir eats Grazers, per the derived web.
    expect(events.some((e) => e.t === "damage" && e.predation)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Action legality — the reducer rejects rather than improvises.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("action handling", () => {
  const ctx = NO_WEB;
  const input: BattleInput = {
    seed: 11,
    kind: "gym",
    playerParty: [
      { uid: "a", lineId: "mosslet-line", age: "A", level: 10, traits: [] },
      { uid: "b", lineId: "nibbin-line", age: "A", level: 10, traits: [] },
    ],
    enemyParty: [{ uid: "e", lineId: "loamunder-line", age: "A", level: 10, traits: [] }],
    bag: { weighted: 1 },
  };

  it("refuses a snare in a trainer battle and a flee from a gym (state untouched, refusal logged)", () => {
    // The state must not move — that is the invariant. The refusal is also ANNOUNCED: an empty
    // event list is indistinguishable from "a turn happened and nothing occurred", which left a UI
    // unable to explain a dead button and a harness able to spin on one forever. `actionRejected`
    // was added to the BattleEvent union at integration (lane A3 reported it as a blocker it could
    // not fix, core/types.ts being another lane's file).
    const started = startBattle(input, ctx);
    const snare = step(started.state, { kind: "snare", tier: "weighted" }, scripted([]), ctx);
    expect(snare.events).toEqual([{ t: "actionRejected", reason: "only a wild creature can be snared" }]);
    expect(snare.state).toBe(started.state);
    const flee = step(started.state, { kind: "flee" }, scripted([]), ctx);
    expect(flee.events).toHaveLength(1);
    expect(flee.events[0]?.t).toBe("actionRejected");
    expect(flee.state).toBe(started.state);
    // The reason a caller reads BEFORE stepping is the same string the event carries.
    expect(flee.events[0]).toEqual({
      t: "actionRejected",
      reason: illegalActionReason(started.state, { kind: "flee" }, ctx),
    });
  });

  it("refuses a switch to a fainted teammate, and once the active faints only a switch is taken", () => {
    const started = startBattle(input, ctx);
    const downed: BattleState = structuredClone(started.state);
    const a = downed.battlers["a"];
    const b = downed.battlers["b"];
    if (!a || !b) throw new Error("no battlers");
    b.fainted = true;
    b.curHp = 0;
    expect(step(downed, { kind: "switch", uid: "b" }, scripted([]), ctx).events).toEqual([
      { t: "actionRejected", reason: "that teammate has fainted" },
    ]);

    a.fainted = true;
    a.curHp = 0;
    b.fainted = false;
    b.curHp = b.maxHp;
    // Anything other than a switch is refused while the active battler is down, and says why …
    const blocked = step(downed, { kind: "move", moveId: "bramble" }, scripted([]), ctx);
    expect(blocked.events).toHaveLength(1);
    expect(blocked.events[0]?.t).toBe("actionRejected");
    expect(blocked.events[0]).toMatchObject({ reason: expect.stringContaining("switch") });
    expect(blocked.state.activePlayerUid).toBe("a");
    // … and the switch itself is free: no turnStart, no enemy reply, the turn counter holds.
    const swap = step(downed, { kind: "switch", uid: "b" }, scripted([]), ctx);
    expect(swap.events).toEqual([{ t: "switched", side: "player", fromUid: "a", toUid: "b" }]);
    expect(swap.state.activePlayerUid).toBe("b");
    expect(swap.state.turn).toBe(downed.turn);
  });

  it("spends the turn on a switch, and the enemy attacks the incoming battler", () => {
    const started = startBattle(input, ctx);
    const out = step(started.state, { kind: "switch", uid: "b" }, scripted([0.5, 0.99]), ctx);
    expect(out.events[0]).toEqual({ t: "turnStart", turn: 1 });
    expect(out.events.some((e) => e.t === "switched" && e.toUid === "b")).toBe(true);
    const damage = out.events.find((e) => e.t === "damage");
    expect(damage?.t === "damage" ? damage.uid : undefined).toBe("b");
    expect(out.state.turn).toBe(2);
    // The incoming battler's entry turn is the next one — its Ambush is not spent by the switch.
    expect(out.state.battlers["b"]?.enteredOnTurn).toBe(2);
  });

  it("heals with a salve and cures with a tonic (bible §11 medicines)", () => {
    const started = startBattle({ ...input, bag: { salve: 1, tonic: 1 } }, ctx);
    const hurt: BattleState = structuredClone(started.state);
    const a = hurt.battlers["a"];
    if (!a) throw new Error("no battler");
    a.curHp = 10;
    a.status = { name: "Burn", turnsActive: 1 };
    const healed = step(hurt, { kind: "item", itemId: B.medicine.salveItemId }, scripted([0.5, 0.99]), ctx);
    // salveHealFracMaxHp 0.5 of mosslet's 96 max HP = 48
    expect(healed.events.find((e) => e.t === "heal")).toEqual({ t: "heal", uid: "a", amount: 48 });
    expect(healed.state.bag["salve"]).toBe(0);
    const cured = step(hurt, { kind: "item", itemId: B.medicine.tonicItemId }, scripted([0.5, 0.99]), ctx);
    expect(cured.events.some((e) => e.t === "statusCleared" && e.status === "Burn")).toBe(true);
    expect(cured.state.battlers["a"]?.status).toBeNull();
    // An empty bag entry is refused outright — and the refusal is in the log.
    const empty: BattleState = { ...hurt, bag: { salve: 0 } };
    expect(step(empty, { kind: "item", itemId: "salve" }, scripted([]), ctx).events).toEqual([
      { t: "actionRejected", reason: "no salve left" },
    ]);
  });

  it("throws loudly on a move the battler has not unlocked", () => {
    const started = startBattle(input, ctx);
    expect(() => step(started.state, { kind: "move", moveId: "lure" }, scripted([]), ctx)).toThrow(/does not know/);
  });

  it("throws loudly when handed an RNG that is not a unit-interval source", () => {
    const started = startBattle(input, ctx);
    const uint32 = { next: () => 2_147_483_647 };
    expect(() => step(started.state, { kind: "move", moveId: "bramble" }, uint32, ctx)).toThrow(/not a float in \[0, 1\)/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Wiring to core/rng.ts (lane A2). This suite's other cases drive the reducer with a scripted
 * double so the arithmetic is hand-checkable; this one proves the REAL seeded stream drops in
 * without an adapter, so nothing above is green only because of the double (build-doc §8.1).
 * ════════════════════════════════════════════════════════════════════════════ */

describe("core/rng.ts drives the reducer as-is", () => {
  const tag = B.rng.subsystemTags[0]; // "battle" — never a literal at the call site (G11)

  function fight(seed: number): BattleEvent[] {
    const ctx = NO_WEB;
    const input: BattleInput = {
      seed,
      kind: "wild",
      playerParty: [{ uid: "p", lineId: "sporantle-line", age: "A", level: 12, traits: [] }],
      enemyParty: [{ uid: "w", lineId: "loamunder-line", age: "A", level: 12, traits: [] }],
    };
    const rng = subsystemRng(seed, tag as string);
    const started = startBattle(input, ctx);
    let state = started.state;
    const events: BattleEvent[] = [...started.events];
    for (let i = 0; i < 20 && state.outcome === null; i += 1) {
      const out = step(state, { kind: "move", moveId: "blight" }, rng, ctx);
      state = out.state;
      events.push(...out.events);
    }
    return events;
  }

  it("accepts the Rng class without an adapter and stays deterministic per seed", () => {
    expect(tag).toBe("battle");
    const a = fight(B.rng.defaultSeed);
    const b = fight(B.rng.defaultSeed);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(a.some((e) => e.t === "damage")).toBe(true);
    // A different seed must be able to tell a different story.
    const other = fight(B.rng.defaultSeed + 1);
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(a));
  });
});

describe("the event log ends exactly at battleEnd", () => {
  it("does not fire a KO'ing move's self-heal after the battle is already over", () => {
    const ctx = NO_WEB;
    // Carricrow's role move is Scrounge — "40 power, heal for damage dealt" (bible §3). Landing
    // the last KO with it must not append a `heal` after `battleEnd`.
    const input: BattleInput = {
      seed: 12,
      kind: "wild",
      playerParty: [{ uid: "crow", lineId: "carricrow-line", age: "A", level: 10, traits: [], curHp: 10 }],
      enemyParty: [{ uid: "moss", lineId: "mosslet-line", age: "A", level: 10, traits: [], curHp: 1 }],
    };
    const started = startBattle(input, ctx);
    const out = step(started.state, { kind: "move", moveId: "scrounge" }, scripted([0.5, 0.99]), ctx);
    expect(out.events.some((e) => e.t === "faint" && e.uid === "moss")).toBe(true);
    expect(out.events.at(-1)).toEqual({ t: "battleEnd", outcome: "win" });
    expect(out.events.some((e) => e.t === "heal")).toBe(false);
    // …while the same move heals normally when the battle carries on.
    const twoUp: BattleInput = { ...input, enemyParty: [...input.enemyParty, { uid: "moss2", lineId: "mosslet-line", age: "A", level: 10, traits: [] }] };
    const started2 = startBattle(twoUp, ctx);
    const out2 = step(started2.state, { kind: "move", moveId: "scrounge" }, scripted([0.5, 0.99, 0.5, 0.99]), ctx);
    expect(out2.events.some((e) => e.t === "heal" && e.uid === "crow")).toBe(true);
    expect(out2.state.outcome).toBeNull();
  });
});

describe("Burrow/Roost and the un-wired food web", () => {
  const ctx = NO_WEB;
  const input: BattleInput = {
    seed: 13,
    kind: "wild",
    // pollywisp spd 50 × 1.3 = 65 vs nibbin spd 45 × 1.1 × 1.3 = 64.35 → 64, so the evader moves
    // first and the evasion is up before the swing lands.
    playerParty: [{ uid: "polly", lineId: "pollywisp-line", age: "A", level: 15, traits: [] }],
    enemyParty: [{ uid: "nib", lineId: "nibbin-line", age: "A", level: 15, traits: [] }],
  };

  it("ducks the hit even when the user is SLOWER than its opponent", () => {
    // The evade used to be written as a mid-turn marker read for the rest of the turn, so a user
    // that acted second had already been hit: Burrow was strictly dominated for every creature
    // slower than its opponent — roughly half the roster. An evade now resolves first.
    const slow: BattleInput = {
      seed: 14,
      kind: "wild",
      // nibbin spd 45 × 1.1 × 1.3 = 64 vs skir spd 85 × 1.3 = 111 ⇒ the enemy is much faster.
      playerParty: [{ uid: "nib", lineId: "nibbin-line", age: "A", level: 15, traits: [] }],
      enemyParty: [{ uid: "skir", lineId: "skir-line", age: "A", level: 15, traits: [] }],
    };
    const started = startBattle(slow, ctx);
    expect(effectiveSpeed(started.state.battlers["skir"] as Battler, B)).toBeGreaterThan(
      effectiveSpeed(started.state.battlers["nib"] as Battler, B),
    );
    const undodged = step(started.state, { kind: "move", moveId: "trample" }, scripted([0.5, 0.99, 0.5, 0.99]), ctx);
    const full = undodged.events.find((e) => e.t === "damage" && e.uid === "nib");
    const ducked = step(started.state, { kind: "move", moveId: "burrow-roost" }, scripted([0.5, 0.99]), ctx);
    const cut = ducked.events.find((e) => e.t === "damage" && e.uid === "nib");
    const fullAmount = full?.t === "damage" ? full.amount : 0;
    const cutAmount = cut?.t === "damage" ? cut.amount : 0;
    expect(fullAmount).toBeGreaterThan(0);
    // ×(1 − evasionBonus), the same magnitude the faster case below gets.
    expect(cutAmount).toBe(Math.floor(fullAmount * (1 - magnitude("evasionBonus"))));
    // The evader still moved second in Speed terms — it is the evade's priority that saves it, and
    // the priority does not leak to other moves.
    expect(ducked.events.filter((e) => e.t === "moveUsed").map((e) => e.uid)).toEqual(["nib", "skir"]);
    expect(undodged.events.filter((e) => e.t === "moveUsed").map((e) => e.uid)).toEqual(["skir", "nib"]);
  });

  it("ANNOUNCES the duck in the event log, immediately before the reduced hit", () => {
    /*
     * `evaded` was added to the BattleEvent union at INTEGRATION. bible §3's "+evasion" is
     * implemented as damage reduction, so without an event the reduced number
     * is the only trace and a renderer cannot tell a duck from a weak hit — build-doc §4 makes the
     * scene "a renderer of its event log". Lane A3 reported this as a blocker it could not fix,
     * core/types.ts being another lane's file.
     */
    const slow: BattleInput = {
      seed: 14,
      kind: "wild",
      playerParty: [{ uid: "nib", lineId: "nibbin-line", age: "A", level: 15, traits: [] }],
      enemyParty: [{ uid: "skir", lineId: "skir-line", age: "A", level: 15, traits: [] }],
    };
    const started = startBattle(slow, ctx);
    const ducked = step(started.state, { kind: "move", moveId: "burrow-roost" }, scripted([0.5, 0.99]), ctx);
    const kinds = ducked.events.map((e) => e.t);
    const evadedAt = kinds.indexOf("evaded");
    expect(evadedAt, "no `evaded` event for a hit that was demonstrably reduced").toBeGreaterThanOrEqual(0);
    // It precedes the damage it explains, so a scene can play the duck then the (reduced) hit.
    expect(kinds[evadedAt + 1]).toBe("damage");
    expect(ducked.events[evadedAt]).toEqual({
      t: "evaded",
      uid: "nib",
      reduction: 1 - magnitude("evasionBonus"),
    });

    // …and a turn with no evade up carries no such event: the flag is not always-on decoration.
    const plain = step(started.state, { kind: "move", moveId: "trample" }, scripted([0.5, 0.99, 0.5, 0.99]), ctx);
    expect(plain.events.some((e) => e.t === "evaded")).toBe(false);
  });

  it("ANNOUNCES the lure going up and being cleared by a switch (bible §3)", () => {
    // `lureChanged` was added at INTEGRATION for the same reason: bible §3's Lure changes catch
    // odds "on this target this battle", and nothing in the log said so.
    const wild: BattleInput = {
      seed: 5,
      kind: "wild",
      nodeId: "r1",
      playerParty: [{ uid: "p", lineId: "cindril-line", age: "A", level: 18, traits: [] }],
      enemyParty: [
        { uid: "e1", lineId: "nibbin-line", age: "J", level: 4, traits: [] },
        { uid: "e2", lineId: "nibbin-line", age: "J", level: 4, traits: [] },
      ],
      bag: { weighted: 3 },
    };
    const started = startBattle(wild, ctx);
    const lured = step(started.state, { kind: "move", moveId: "lure" }, scripted([0.5, 0.99, 0.5, 0.99]), ctx);
    expect(lured.state.lureActive).toBe(true);
    expect(lured.events.filter((e) => e.t === "lureChanged")).toEqual([{ t: "lureChanged", active: true }]);
    // Idempotent: using it again while it is already up is not a second announcement.
    const again = step(lured.state, { kind: "move", moveId: "lure" }, scripted([0.5, 0.99, 0.5, 0.99]), ctx);
    expect(again.events.some((e) => e.t === "lureChanged")).toBe(false);
    // And the log says when it goes away, which is what a renderer needs to take the icon down.
    const enemySwap: BattleState = structuredClone(lured.state);
    const e1 = enemySwap.battlers["e1"];
    if (!e1) throw new Error("no enemy");
    e1.fainted = true;
    e1.curHp = 0;
    const after = step(enemySwap, { kind: "move", moveId: "singe" }, scripted([0.5, 0.99, 0.5, 0.99, 0.5, 0.99, 0.5, 0.99]), ctx);
    expect(after.state.lureActive).toBe(false);
    expect(after.events.some((e) => e.t === "lureChanged" && e.active === false)).toBe(true);
  });

  it("cuts the damage of the hit it ducks, for exactly one turn", () => {
    const started = startBattle(input, ctx);
    // Nibbin's Maul into a Wind/Plant defender is neutral:
    //   atk 86 (60 × 1.1 × 1.3) × 70 / def 91 (70 × 1.3) = 66.15… → 66 undodged
    //   × (1 − evasionBonus 0.3) = 46.30… → 46 while Burrow is up
    const ducked = step(started.state, { kind: "move", moveId: "burrow-roost" }, scripted([0.5, 0.99]), ctx);
    const hit = ducked.events.find((e) => e.t === "damage");
    expect(hit?.t === "damage" ? hit.amount : 0).toBe(46);
    // balance.additions.A3.json evadeTurns = 1 ⇒ it is gone by the next turn.
    //
    // Polly's maximum is 98 and the ducked blow left it at 52, so the undodged 66 would be an
    // OVERKILL — and `dealDamage` logs the HP it actually removes, so the event would read 52 and
    // the fight would end in a loss here. That is the zero-clamp talking, not the evade, and the
    // clamp has its own cases in the KO block. Topping the evader up removes the confound: the
    // expected 66 is unchanged, still read off the damage event, and now genuinely dealt.
    const healthy: BattleState = structuredClone(ducked.state);
    const evader = healthy.battlers["polly"];
    if (!evader) throw new Error("no evader");
    expect(evader.curHp).toBe(52);
    evader.curHp = evader.maxHp;
    const after = step(healthy, { kind: "move", moveId: "trample" }, scripted([0.5, 0.99, 0.5, 0.99]), ctx);
    const full = after.events.filter((e) => e.t === "damage").find((e) => e.uid === "polly");
    expect(full?.t === "damage" ? full.amount : 0).toBe(66);
    expect(after.state.battlers["polly"]?.fainted).toBe(false);
  });

  it("throws rather than quietly reporting 'no predation' when foodweb.ts is not wired", () => {
    const unwired = makeBattleContext(content, unwiredPredationOracle());
    expect(() =>
      computeDamage(
        battler("fenmaw-line", "A", 10),
        battler("reedrick-line", "A", 10, "enemy"),
        move("riptide"),
        scripted(MID_ROLL_NO_CRIT),
        unwired,
      ),
    ).toThrow(/no PredationOracle wired/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Wiring to core/foodweb.ts (lane A2). build-doc §8.3 `no_shadow_tables`: the food web and the
 * bait lookup have exactly one home, and battle.ts is a READER of it. These cases run the real
 * derivation over the shipped node files so nothing above is green only because of the doubles.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("predation and bait read core/foodweb.ts's derivation", () => {
  const idx = indexSpecies(content.species);
  const nodeWeb = (nodeId: string): FoodWeb => {
    const node = content.nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error(`no node ${nodeId}`);
    return deriveFoodWeb(toEcoNode(node), idx, B);
  };

  it("applies the 1.25 to a predator/prey pair the DERIVED Marsh web actually contains", () => {
    const web = nodeWeb("r2");
    const ctx = makeBattleContext(content, predationOracleFromWebs([web]));
    // bible §5's exceptions row, derived rather than asserted: Fenmaw eats Reedrick at R2.
    expect(web.edges["fenmaw-line"]).toContain("reedrick-line");
    const fed = computeDamage(
      battler("fenmaw-line", "A", 10, "player", ctx),
      battler("reedrick-line", "A", 10, "enemy", ctx),
      move("riptide"),
      scripted(MID_ROLL_NO_CRIT),
      ctx,
    );
    expect(fed).toEqual({ amount: 47, effectiveness: "resisted", predation: true, crit: false, evadeMult: 1 });
    // …and the reverse edge does not exist, so the prey gets no bonus swinging back.
    const back = computeDamage(
      battler("reedrick-line", "A", 10, "player", ctx),
      battler("fenmaw-line", "A", 10, "enemy", ctx),
      move("squall"),
      scripted(MID_ROLL_NO_CRIT),
      ctx,
    );
    expect(back.predation).toBe(false);
  });

  it("agrees with core/foodweb.ts's own baitMatchFor across every node's whole matrix", () => {
    // Every shipped node, because the rules only diverge at the edges: bible §4 leaves Steppe and
    // Vale without a creature Producer, so a flora-grazing target there can only
    // be baited through `floraFeeders` — a case r1 and r2 cannot reach.
    let floraOnlyRoleMatches = 0;
    for (const node of content.nodes) {
      const eco = toEcoNode(node);
      const web = deriveFoodWeb(eco, idx, B);
      const ctx = makeBattleContext(content, predationOracleFromWebs([web]));
      const tags = [undefined, ...ROLES, ...Object.keys(node.populations)];
      for (const targetId of Object.keys(node.populations)) {
        for (const tag of tags) {
          const mine = baitMatchOf(tag, targetId, ctx);
          expect(mine).toBe(baitMatchFor(tag, targetId, eco, idx, B, web));
          if (
            tag === "Producer" &&
            mine === "role" &&
            web.floraFeeders.includes(targetId) &&
            (web.edges[targetId] ?? []).length === 0
          ) {
            floraOnlyRoleMatches += 1;
          }
        }
      }
    }
    // …and that edge really is reached, so the rule above is under test and not just described.
    expect(floraOnlyRoleMatches).toBeGreaterThan(0);
  });

  it("lets a caller hand foodweb.ts's matcher straight to the oracle", () => {
    const node = content.nodes.find((n) => n.id === "r2");
    if (!node) throw new Error("no node r2");
    const eco = toEcoNode(node);
    const web = deriveFoodWeb(eco, idx, B);
    const oracle = predationOracleFromWebs([web]);
    const wired = makeBattleContext(content, {
      ...oracle,
      baitMatch: (tag, targetLineId) => baitMatchFor(tag, targetLineId, eco, idx, B, web),
    });
    expect(baitMatchOf("reedrick-line", "mirefin-line", wired)).toBe("species");
    expect(baitMatchOf("Grazer", "mirefin-line", wired)).toBe("role");
    expect(baitMatchOf("Apex", "mirefin-line", wired)).toBe("none");
  });

  it("keeps every fixture's recorded web equal to the current derivation", () => {
    // Compared as SETS, which is what an edge list is: `predationOracleFromWebs` folds both into
    // `Set`s, so the order core/foodweb.ts happens to emit them in changes no answer and is not
    // part of the contract. Every predator, every prey line and every flora feeder must still match
    // exactly — a genuinely different derivation fails here.
    const asSets = (web: FoodWeb) => ({
      nodeId: web.nodeId,
      edges: Object.fromEntries(
        Object.entries(web.edges)
          .map(([k, v]) => [k, [...v].sort()] as const)
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
      floraFeeders: [...web.floraFeeders].sort(),
    });
    for (const script of SCRIPTS) {
      const nodeId = script.foodWeb.nodeId;
      expect(script.input.nodeId).toBe(nodeId);
      expect(asSets(script.foodWeb)).toEqual(asSets(nodeWeb(nodeId)));
    }
  });

  it("reads the diet of the node the battle is AT, not the union of every web handed in", () => {
    // build-doc §7.3 derives edges per node and §7.4 defines predation as "the attacker's derived
    // diet includes the defender's line". A battle handed several webs (a gym fight given the
    // region) used to union them, applying the ×1.25 to pairs no single node's derivation contains.
    const r1 = nodeWeb("r1");
    const r2 = nodeWeb("r2");
    const both = makeBattleContext(content, predationOracleFromWebs([r1, r2]));
    // Fenmaw eats Mirefin at R2; neither line lives at R1, so R1's web has no such edge.
    expect(r2.edges["fenmaw-line"]).toContain("mirefin-line");
    expect(r1.edges["fenmaw-line"] ?? []).not.toContain("mirefin-line");
    expect(both.predation.eats("fenmaw-line", "mirefin-line", "r2")).toBe(true);
    expect(both.predation.eats("fenmaw-line", "mirefin-line", "r1")).toBe(false);
    // A battle that names no node still gets the union — the documented fallback.
    expect(both.predation.eats("fenmaw-line", "mirefin-line")).toBe(true);
    // …and the reducer passes BattleState.nodeId down, so the same fight is worth 1.25× at R2 and
    // 1.0× at R1 with the identical oracle.
    const fight = (nodeId: string): boolean => {
      const input: BattleInput = {
        seed: 30,
        kind: "wild",
        nodeId,
        playerParty: [{ uid: "p", lineId: "fenmaw-line", age: "A", level: 10, traits: [] }],
        enemyParty: [{ uid: "w", lineId: "mirefin-line", age: "A", level: 10, traits: [] }],
      };
      const out = step(startBattle(input, both).state, { kind: "move", moveId: "riptide" }, cyclic([0.5, 0.99]), both);
      const hit = out.events.find((e) => e.t === "damage" && e.uid === "w");
      return hit?.t === "damage" ? hit.predation : false;
    };
    expect(fight("r2")).toBe(true);
    expect(fight("r1")).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The metamorphic latch survives a level-up — build-doc §7.4 "adds ×1.15 ONCE".
 * ════════════════════════════════════════════════════════════════════════════ */

describe("a battler stays the creature it was built as", () => {
  const ctx = NO_WEB;

  function levelledOnce(spec: BattlerSpec): Battler {
    const input: BattleInput = {
      seed: 31,
      kind: "wild",
      playerParty: [spec],
      enemyParty: [{ uid: "prey", lineId: "loamunder-line", age: "A", level: 10, traits: [], curHp: 1 }],
    };
    const started = startBattle(input, ctx);
    const out = step(started.state, { kind: "move", moveId: "singe" }, cyclic([0.5, 0.99, 0.9]), ctx);
    const after = out.state.battlers[spec.uid];
    if (!after) throw new Error("battler vanished");
    expect(out.events.some((e) => e.t === "levelUp")).toBe(true);
    return after;
  }

  it("does not grow a phantom ×1.15 when it levels up mid-battle", () => {
    // A metamorphic Adult that has NOT transitioned (the spec says so) levels up: the recompute
    // must use the flag it was built with, not re-derive the latch from the age class.
    const cindril = line("cindril-line");
    const after = levelledOnce({ uid: "x", lineId: "cindril-line", age: "A", level: 1, traits: [], metamorphosed: false });
    expect(after.level).toBe(2);
    expect(after.stats).toEqual(
      effectiveStats({ line: cindril, age: "A", level: after.level, balance: B, metamorphosed: false }),
    );
    // …and that is a real 15% away from the number the age default would have produced.
    const withJump = effectiveStats({ line: cindril, age: "A", level: after.level, balance: B, metamorphosed: true });
    expect(after.stats.atk / withJump.atk).toBeCloseTo(1 / B.age.metamorphicJump, 2);
  });

  it("does not LOSE the jump either, when a Juvenile carries it explicitly", () => {
    const cindril = line("cindril-line");
    const after = levelledOnce({ uid: "x", lineId: "cindril-line", age: "J", level: 1, traits: [], metamorphosed: true });
    expect(after.stats).toEqual(
      effectiveStats({ line: cindril, age: "J", level: after.level, balance: B, metamorphosed: true }),
    );
  });

  it("keeps the age default for a wild catch that carries no flag (bible §4)", () => {
    const cindril = line("cindril-line");
    const after = levelledOnce({ uid: "x", lineId: "cindril-line", age: "A", level: 1, traits: [] });
    expect(after.stats).toEqual(
      effectiveStats({ line: cindril, age: "A", level: after.level, balance: B, metamorphosed: true }),
    );
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Stat-mod durations are turns of the BATTLE, and their end is in the log.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("in-battle stat modifiers (bible §3 durations)", () => {
  const ctx = NO_WEB;
  const input: BattleInput = {
    seed: 32,
    kind: "gym",
    playerParty: [
      { uid: "a", lineId: "sporantle-line", age: "A", level: 20, traits: [] },
      { uid: "b", lineId: "sporantle-line", age: "A", level: 20, traits: [] },
    ],
    enemyParty: [{ uid: "e", lineId: "loamunder-line", age: "A", level: 5, traits: [] }],
  };

  it("ticks down on the BENCH too, so a buff cannot be parked and brought back", () => {
    let state = startBattle(input, ctx).state;
    state = step(state, { kind: "move", moveId: "harden" }, cyclic([0.5, 0.99]), ctx).state;
    const up = 1 + magnitude("utilityStatMod");
    expect(state.battlers["a"]?.statMods.def).toBeCloseTo(up, 10);
    // defaultStatModTurns 3, one of which was this turn ⇒ 2 left.
    expect(state.battlers["a"]?.statModTurns["harden"]).toBe(B.moveEffects.defaultStatModTurns - 1);

    state = step(state, { kind: "switch", uid: "b" }, cyclic([0.5, 0.99]), ctx).state;
    expect(state.activePlayerUid).toBe("b");
    // The switch spent a turn, so the benched buff is down to 1 …
    expect(state.battlers["a"]?.statModTurns["harden"]).toBe(1);
    const expiring = step(state, { kind: "move", moveId: "regrow" }, cyclic([0.5, 0.99]), ctx);
    state = expiring.state;
    // … and gone the turn after, whether or not its owner was on the field.
    expect(state.battlers["a"]?.statModTurns).toEqual({});
    expect(state.battlers["a"]?.statMods.def).toBe(1);
    // Switching back in returns an ordinary battler, not a still-buffed one.
    state = step(state, { kind: "switch", uid: "a" }, cyclic([0.5, 0.99]), ctx).state;
    expect(state.battlers["a"]?.statMods.def).toBe(1);
  });

  it("announces the expiry in events[], so the renderer can take the icon down (§15 C3)", () => {
    let state = startBattle(input, ctx).state;
    const applied = step(state, { kind: "move", moveId: "harden" }, cyclic([0.5, 0.99]), ctx);
    state = applied.state;
    expect(applied.events).toContainEqual({
      t: "statChanged",
      uid: "a",
      stat: "def",
      direction: "up",
      turns: B.moveEffects.defaultStatModTurns,
    });
    const seen: BattleEvent[] = [];
    for (let i = 0; i < B.moveEffects.defaultStatModTurns && state.outcome === null; i += 1) {
      const out = step(state, { kind: "move", moveId: "regrow" }, cyclic([0.5, 0.99]), ctx);
      state = out.state;
      seen.push(...out.events.filter((e) => e.t === "statChanged"));
    }
    // Exactly one expiry event, naming the same stat and direction, with turns 0 = "it ended".
    expect(seen).toEqual([{ t: "statChanged", uid: "a", stat: "def", direction: "up", turns: 0 }]);
    expect(state.battlers["a"]?.statMods.def).toBe(1);
  });

  it("says how long a mod is FOR, and the state says how long is LEFT", () => {
    // The two numbers differ by one on purpose, and the difference is exactly the turn the mod was
    // applied on: `statChanged.turns` is data/moves.json's stated duration (Terrify's 2, Harden's
    // balance default), `statModTurns` is what remains once that turn is over. A renderer counts
    // down from the state, not from the event — and never has to infer the end, because the
    // expiry has an event of its own (the case above).
    const started = startBattle(input, ctx);
    const out = step(started.state, { kind: "move", moveId: "harden" }, cyclic([0.5, 0.99]), ctx);
    const applied = out.events.find((e) => e.t === "statChanged");
    const stated = B.moveEffects.defaultStatModTurns;
    expect(applied?.t === "statChanged" ? applied.turns : 0).toBe(stated);
    expect(out.state.battlers["a"]?.statModTurns["harden"]).toBe(stated - 1);
    // …and the mod really is in force for `stated` turns of play: it is still up on turn `stated`
    // and gone on the one after.
    let state = out.state;
    for (let turn = 2; turn <= stated; turn += 1) {
      expect(state.battlers["a"]?.statMods.def).toBeCloseTo(1 + magnitude("utilityStatMod"), 10);
      state = step(state, { kind: "move", moveId: "regrow" }, cyclic([0.5, 0.99]), ctx).state;
    }
    expect(state.battlers["a"]?.statMods.def).toBe(1);
  });

  it("gives Terrify the two turns bible §3 states, counted in battle turns", () => {
    const terrify = move("terrify");
    const effect = terrify.effects.find((e) => e.kind === "statMod");
    expect(effect?.kind === "statMod" ? effect.turns : undefined).toBe(2);
    // THE ASSERTIONS BELOW ARE UNCHANGED — two turns, then expiry with its own event. What moved is
    // the apex's level: 20 → 40. T-11 re-spent the Producer template (atk 40 → 60), so a level-20
    // Loamunder now two-shots a level-20 Fenmaw and the battle ENDED on turn 2 — the countdown never
    // reached its end and the test was measuring a dead fight rather than an expiring modifier. At
    // the level cap the apex survives the two turns it is being asked to count. Nothing about
    // Terrify's duration is level-dependent; the level only keeps the stage standing.
    const fight: BattleInput = {
      seed: 33,
      kind: "wild",
      playerParty: [{ uid: "apex", lineId: "fenmaw-line", age: "A", level: 40, traits: [] }],
      enemyParty: [{ uid: "prey", lineId: "loamunder-line", age: "A", level: 20, traits: [] }],
    };
    let state = startBattle(fight, ctx).state;
    const down = 1 - magnitude("utilityStatMod");
    // Turn 1 — Terrify lands. One of its two turns is spent, and the mod that survives the end of
    // this turn is the one in force during turn 2.
    state = step(state, { kind: "move", moveId: "terrify" }, cyclic([0.5, 0.99]), ctx).state;
    expect(state.battlers["prey"]?.statMods.atk).toBeCloseTo(down, 10);
    expect(state.battlers["prey"]?.statModTurns["terrify"]).toBe(1);
    // Turn 2 — the second of the two turns; it expires at the end of it, so turn 3 is unmodified.
    const second = step(state, { kind: "move", moveId: "riptide" }, cyclic([0.5, 0.99]), ctx);
    state = second.state;
    expect(state.battlers["prey"]?.statModTurns).toEqual({});
    expect(state.battlers["prey"]?.statMods.atk).toBe(1);
    expect(second.events).toContainEqual({ t: "statChanged", uid: "prey", stat: "atk", direction: "down", turns: 0 });
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * `balance.types.neutral` is the type chart's neutral multiplier and nothing else.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("retuning the type chart moves only the type term (build-doc §6 INV-3)", () => {
  const attacker = () => battler("nibbin-line", "A", 10);
  const defender = () => battler("mosslet-line", "A", 10, "enemy");

  it("scales a typeless move linearly, not cubically", () => {
    // Trample is typeless, so `types.neutral` is the ONLY type term in its damage. It used to stand
    // in for the absent predation and crit multipliers as well, so doubling it multiplied by 8.
    const base = computeDamage(attacker(), defender(), move("trample"), scripted(MID_ROLL_NO_CRIT), NO_WEB).amount;
    const doubled = ctxWith({});
    doubled.balance = retuned((b) => {
      b.types.neutral = B.types.neutral * 2;
    });
    const after = computeDamage(attacker(), defender(), move("trample"), scripted(MID_ROLL_NO_CRIT), doubled).amount;
    expect(after).toBeGreaterThanOrEqual(base * 2 - 1);
    expect(after).toBeLessThanOrEqual(base * 2 + 1);
  });

  it("leaves the crit multiplier and the predation bonus exactly as balance.json states them", () => {
    const fed = ctxWith({ "nibbin-line": ["mosslet-line"] });
    // Hand-computed: 79 × 70 / 90 = 61.444… ⇒ plain floor 61, crit floor(61.444 × 1.5) = 92,
    // predation floor(61.444 × 1.25) = 76. The ratios below carry the floor, hence precision 1.
    const plain = computeDamage(attacker(), defender(), move("maul"), scripted([0.5, 0.99]), NO_WEB).amount;
    const crit = computeDamage(attacker(), defender(), move("maul"), scripted([0.5, 0]), NO_WEB);
    expect(plain).toBe(61);
    expect(crit.amount).toBe(92);
    expect(crit.crit).toBe(true);
    expect(crit.amount / plain).toBeCloseTo(B.damage.critMultiplier, 1);
    const eaten = computeDamage(
      battler("nibbin-line", "A", 10, "player", fed),
      battler("mosslet-line", "A", 10, "enemy", fed),
      move("maul"),
      scripted([0.5, 0.99]),
      fed,
    );
    expect(eaten.predation).toBe(true);
    expect(eaten.amount).toBe(76);
    expect(eaten.amount / plain).toBeCloseTo(B.types.predation, 1);
    // Both ratios survive a type-chart retune untouched, because neither factor is a type factor.
    const shifted = ctxWith({ "nibbin-line": ["mosslet-line"] });
    shifted.balance = retuned((b) => {
      b.types.neutral = 0.5;
    });
    const plainShifted = computeDamage(attacker(), defender(), move("maul"), scripted([0.5, 0.99]), shifted).amount;
    const critShifted = computeDamage(attacker(), defender(), move("maul"), scripted([0.5, 0]), shifted).amount;
    expect(critShifted / plainShifted).toBeCloseTo(B.damage.critMultiplier, 2);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Legality — the reducer rejects, and says why (build-doc §7.4 / bible §11).
 * ════════════════════════════════════════════════════════════════════════════ */

describe("illegal actions are refused AND explained", () => {
  const ctx = NO_WEB;
  const base: BattleInput = {
    seed: 34,
    kind: "gym",
    playerParty: [
      { uid: "a", lineId: "mosslet-line", age: "A", level: 10, traits: [] },
      { uid: "b", lineId: "nibbin-line", age: "A", level: 10, traits: [] },
    ],
    enemyParty: [{ uid: "e", lineId: "loamunder-line", age: "A", level: 10, traits: [] }],
    bag: { salve: 5, tonic: 5 },
  };

  function withBenchDown(): BattleState {
    const started = startBattle(base, ctx);
    const state: BattleState = structuredClone(started.state);
    const bench = state.battlers["b"];
    if (!bench) throw new Error("no bench");
    bench.fainted = true;
    bench.curHp = 0;
    return state;
  }

  it("cannot heal a fainted teammate back onto the field (KO = faint, Hard Req 8)", () => {
    const state = withBenchDown();
    const action: BattleAction = { kind: "item", itemId: B.medicine.salveItemId, targetUid: "b" };
    expect(illegalActionReason(state, action, ctx)).toMatch(/fainted/);
    const out = step(state, action, scripted([]), ctx);
    // Refused, state untouched — and the refusal carries the same reason the caller could have
    // asked for beforehand, so a UI can grey the button AND explain it after the fact.
    expect(out.events).toEqual([{ t: "actionRejected", reason: illegalActionReason(state, action, ctx) }]);
    expect(out.state).toBe(state);
    // The invariant the property suite asserts, and the one the old behaviour broke: a battler is
    // fainted exactly when it is at 0 HP. A consumed salve used to leave curHp>0 && fainted.
    for (const b of Object.values(out.state.battlers)) expect(b.fainted).toBe(b.curHp === 0);
    expect(out.state.bag["salve"]).toBe(5); // …and the medicine is not spent
    // A tonic on the same corpse is refused for the same reason.
    const downed = out.state.battlers["b"];
    if (!downed) throw new Error("no bench");
    downed.status = { name: "Burn", turnsActive: 1 };
    expect(illegalActionReason(out.state, { kind: "item", itemId: B.medicine.tonicItemId, targetUid: "b" }, ctx)).toMatch(/fainted/);
  });

  it("does not spend a medicine that would do nothing", () => {
    const started = startBattle(base, ctx);
    // Salve at full HP …
    expect(illegalActionReason(started.state, { kind: "item", itemId: "salve" }, ctx)).toMatch(/full HP/);
    expect(step(started.state, { kind: "item", itemId: "salve" }, scripted([]), ctx).events).toEqual([
      { t: "actionRejected", reason: illegalActionReason(started.state, { kind: "item", itemId: "salve" }, ctx) },
    ]);
    // … tonic with no status …
    expect(illegalActionReason(started.state, { kind: "item", itemId: "tonic" }, ctx)).toMatch(/no status/);
    expect(step(started.state, { kind: "item", itemId: "tonic" }, scripted([]), ctx).events).toEqual([
      { t: "actionRejected", reason: illegalActionReason(started.state, { kind: "item", itemId: "tonic" }, ctx) },
    ]);
    // The bag is untouched by a refusal — no medicine is spent for nothing.
    expect(step(started.state, { kind: "item", itemId: "salve" }, scripted([]), ctx).state.bag["salve"]).toBe(
      started.state.bag["salve"],
    );
    // … and both are legal the moment they have something to do.
    const hurt: BattleState = structuredClone(started.state);
    const a = hurt.battlers["a"];
    if (!a) throw new Error("no battler");
    a.curHp = 10;
    a.status = { name: "Burn", turnsActive: 1 };
    expect(illegalActionReason(hurt, { kind: "item", itemId: "salve" }, ctx)).toBeNull();
    expect(illegalActionReason(hurt, { kind: "item", itemId: "tonic" }, ctx)).toBeNull();
    expect(step(hurt, { kind: "item", itemId: "salve" }, scripted([0.5, 0.99]), ctx).state.bag["salve"]).toBe(4);
  });

  it("names the reason for every other refusal, so a UI can grey the button", () => {
    const started = startBattle(base, ctx);
    expect(illegalActionReason(started.state, { kind: "snare", tier: "base" }, ctx)).toMatch(/wild/);
    expect(illegalActionReason(started.state, { kind: "flee" }, ctx)).toMatch(/trainer/);
    expect(illegalActionReason(started.state, { kind: "switch", uid: "a" }, ctx)).toMatch(/already out/);
    expect(illegalActionReason(started.state, { kind: "switch", uid: "e" }, ctx)).toMatch(/own team/);
    expect(illegalActionReason(started.state, { kind: "switch", uid: "ghost" }, ctx)).toMatch(/no battler/);
    expect(illegalActionReason(started.state, { kind: "item", itemId: "rocket" }, ctx)).toMatch(/not a battle medicine/);
    expect(illegalActionReason(withBenchDown(), { kind: "switch", uid: "b" }, ctx)).toMatch(/fainted/);
    // A legal action reports null — the predicate and the reason never disagree.
    expect(illegalActionReason(started.state, { kind: "switch", uid: "b" }, ctx)).toBeNull();
    expect(illegalActionReason(started.state, { kind: "move", moveId: "bramble" }, ctx)).toBeNull();
    // A finished battle refuses everything, with a reason of its own.
    const over: BattleState = { ...started.state, outcome: "win" };
    expect(illegalActionReason(over, { kind: "move", moveId: "bramble" }, ctx)).toMatch(/already over/);
  });

  it("settles a corrupt field instead of swinging at a corpse forever", () => {
    // A state assembled outside the reducer (a save, a fixture, a test) can arrive with a fainted
    // battler still fielded. `handleFaint` returns immediately for an already-fainted victim, so
    // the old reducer produced turn after turn of `damage` at a 0-HP enemy with no `win` — a fight
    // that could never end.
    const twoEnemies: BattleInput = {
      ...base,
      kind: "wild",
      enemyParty: [
        { uid: "e", lineId: "loamunder-line", age: "A", level: 10, traits: [] },
        { uid: "e2", lineId: "loamunder-line", age: "A", level: 10, traits: [] },
      ],
    };
    const started = startBattle(twoEnemies, ctx);
    const corrupt: BattleState = structuredClone(started.state);
    const downed = corrupt.battlers["e"];
    if (!downed) throw new Error("no enemy");
    downed.fainted = true;
    downed.curHp = 0;
    const out = step(corrupt, { kind: "move", moveId: "bramble" }, cyclic([0.5, 0.99]), ctx);
    expect(out.events[0]).toEqual({ t: "switched", side: "enemy", fromUid: "e", toUid: "e2" });
    expect(out.state.activeEnemyUid).toBe("e2");
    // …and the turn then happens normally against the replacement, not against the corpse.
    expect(out.events.some((e) => e.t === "damage" && e.uid === "e2")).toBe(true);
    expect(out.events.some((e) => e.t === "damage" && e.uid === "e")).toBe(false);

    // With nothing left to field, the battle simply resolves.
    const allDown: BattleState = structuredClone(out.state);
    for (const uid of allDown.enemyOrder) {
      const b = allDown.battlers[uid];
      if (!b) continue;
      b.fainted = true;
      b.curHp = 0;
    }
    const won = step(allDown, { kind: "move", moveId: "bramble" }, cyclic([0.5, 0.99]), ctx);
    expect(won.state.outcome).toBe("win");
    expect(won.events.at(-1)).toEqual({ t: "battleEnd", outcome: "win" });

    const wiped: BattleState = structuredClone(started.state);
    for (const uid of wiped.playerOrder) {
      const b = wiped.battlers[uid];
      if (!b) continue;
      b.fainted = true;
      b.curHp = 0;
    }
    const lost = step(wiped, { kind: "move", moveId: "bramble" }, cyclic([0.5, 0.99]), ctx);
    expect(lost.state.outcome).toBe("loss");
  });

  it("refuses to start a battle nobody can field, and fields the first STANDING battler", () => {
    // An all-fainted side made every action a legal no-op with no outcome: the battle could never
    // end. A party may still CARRY a fainted member — it just may not be made only of them.
    const wiped: BattleInput = {
      ...base,
      playerParty: base.playerParty.map((s) => ({ ...s, curHp: 0 })),
    };
    expect(() => startBattle(wiped, ctx)).toThrow(/player party is already fainted/);
    const enemyWiped: BattleInput = {
      ...base,
      enemyParty: base.enemyParty.map((s) => ({ ...s, curHp: 0 })),
    };
    expect(() => startBattle(enemyWiped, ctx)).toThrow(/enemy party is already fainted/);
    const mixed: BattleInput = {
      ...base,
      playerParty: [{ ...(base.playerParty[0] as BattlerSpec), curHp: 0 }, base.playerParty[1] as BattlerSpec],
    };
    const started = startBattle(mixed, ctx);
    expect(started.state.activePlayerUid).toBe("b");
    expect(started.events[0]).toMatchObject({ t: "battleStart", playerUid: "b" });
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Every tunable the reducer advertises is one the reducer actually reads (INV-3).
 * ════════════════════════════════════════════════════════════════════════════ */

describe("balance tunables are wired, not decorative", () => {
  const ctx = NO_WEB;
  const burnFight: BattleInput = {
    seed: 35,
    kind: "gym",
    playerParty: [{ uid: "p", lineId: "sporantle-line", age: "A", level: 20, traits: [] }],
    enemyParty: [{ uid: "e", lineId: "loamunder-line", age: "A", level: 20, traits: [] }],
  };

  function burnFor(turns: number, balance: Balance): { name: string; turnsActive: number } | null {
    const c = makeBattleContext({ species: content.species, moves: content.moves, balance }, predationOracleFromWebs([]));
    let state = startBattle(burnFight, c).state;
    const target = state.battlers["e"];
    if (!target) throw new Error("no target");
    target.status = { name: "Burn", turnsActive: 0 };
    for (let i = 0; i < turns && state.outcome === null; i += 1) {
      state = step(state, { kind: "move", moveId: "regrow" }, cyclic([0.5, 0.99]), c).state;
    }
    return state.battlers["e"]?.status ?? null;
  }

  it("reads balance.status.persistUntilCured instead of shipping it as a decoy", () => {
    // Shipped `true`: build-doc §7.4 names no expiry, so nothing but a tonic takes a status off.
    expect(B.status.persistUntilCured).toBe(true);
    expect(burnFor(6, B)).toMatchObject({ name: "Burn", turnsActive: 6 });
    // Flipped: the status wears off, and the log says so. A flag nothing reads is worse than a
    // literal, because retuning it looks applied.
    const off = retuned((b) => {
      b.status.persistUntilCured = false;
    });
    expect(burnFor(6, off)).toBeNull();
  });

  it("reads balance.battle, and a missing or malformed group throws instead of defaulting", () => {
    // Lane A3 wrote these two into data/balance.additions.A3.json because balance.json belonged to
    // another lane; the integrator merged the `battle` group and deleted that file. There is no
    // fallback source any more, so the failure this guards is now the full one: a group that is
    // absent (because zBalance strips undeclared keys), mistyped, or half-merged must be LOUD —
    // a silent default is exactly "the retune of balance.json looks applied and is not" (INV-3).
    const withGroup = retuned(() => {});
    (withGroup as unknown as Record<string, unknown>)["battle"] = { evadeTurns: 4, statusWearOffTurns: 9 };
    const merged = makeBattleContext({ species: content.species, moves: content.moves, balance: withGroup }, predationOracleFromWebs([]));
    expect(merged.evadeTurns).toBe(4);
    expect(merged.statusWearOffTurns).toBe(9);

    const halfMerged = retuned(() => {});
    (halfMerged as unknown as Record<string, unknown>)["battle"] = { evadeTurns: 4 };
    expect(() =>
      makeBattleContext({ species: content.species, moves: content.moves, balance: halfMerged }, predationOracleFromWebs([])),
    ).toThrow(/statusWearOffTurns/);

    const mistyped = retuned(() => {});
    (mistyped as unknown as Record<string, unknown>)["battle"] = { evadeTurns: "1", statusWearOffTurns: 3 };
    expect(() =>
      makeBattleContext({ species: content.species, moves: content.moves, balance: mistyped }, predationOracleFromWebs([])),
    ).toThrow(/not a finite number/);

    // …and with no group at all there is nowhere left to fall back to, so it throws.
    const absent = retuned(() => {});
    delete (absent as unknown as Record<string, unknown>)["battle"];
    expect(() =>
      makeBattleContext({ species: content.species, moves: content.moves, balance: absent }, predationOracleFromWebs([])),
    ).toThrow(/balance\.battle is missing/);

    // The shipped, validated balance.json really does carry it — this is the live path.
    expect(NO_WEB.evadeTurns).toBe(B.battle.evadeTurns);
    expect(NO_WEB.statusWearOffTurns).toBe(B.battle.statusWearOffTurns);
  });
});
