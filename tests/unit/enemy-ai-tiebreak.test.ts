/**
 * tests/unit/enemy-ai-tiebreak.test.ts — T-27. core/battle.ts §14's enemy policy is documented as a
 * "deterministic argmax on expected damage … ties to the earliest move in the pool". This file is
 * the second half of that sentence.
 *
 * WHY IT EXISTS. `balance.types.superEffective` is 1.5, so a 40-power super-effective move and a
 * 60-power neutral one are exactly tied on paper — 40 × 1.5 = 60 × 1.0, and both products are
 * representable. The policy used to rank on the whole §7.4 product, `((atk × power) / def) × mult ×
 * predation × midRoll`, and those two orderings of the same number differ in the last bit. Measured
 * over the six shipped gym rosters as the enemy against every non-Ancient line × J/A/E at the
 * slot's level — 2160 pairs — 59 tied on paper, 20 of those came out unequal as doubles, and in 13
 * the argmax threw the NEUTRAL move where the earlier super-effective one was promised. Which one
 * won was decided by the attacker's Attack stat, i.e. by its age and traits.
 *
 * The fix is not a loosened comparison: the argmax is still a strict `>` over exact doubles. What
 * changed is the KEY — the four factors that are the same positive number for every move in one
 * pool (`atk`, `def`, `predation`, `midRoll`) are dropped, because in exact arithmetic they cannot
 * reorder anything and in floating point they are the entire source of the noise.
 *
 * So the tests below are in three layers: the measured case, the law over the whole shipped space,
 * and the invariance that law rests on. No RNG is drawn anywhere here — the policy consumes none.
 */

import { describe, expect, it } from "vitest";
import { validateContent } from "../../core/schemas";
import {
  chooseEnemyAction,
  makeBattleContext,
  predationOracleFromWebs,
  startBattle,
  typeMultiplier,
  type BattleContext,
} from "../../core/battle";
import type {
  AgeClass,
  Balance,
  BattleState,
  Battler,
  BattlerSpec,
  Content,
  FoodWeb,
  GymTeamSlot,
  MoveDef,
  SpeciesLine,
  Trait,
} from "../../core/types";
import { AGE_CLASSES } from "../../core/types";

const content: Content = validateContent();
const B: Balance = content.balance;

/** The derivation is core/foodweb.ts's job (G3); these stand in only for its OUTPUT. */
function ctxWith(edges: Record<string, string[]>): BattleContext {
  const web: FoodWeb = { nodeId: "test", edges, floraFeeders: [] };
  return makeBattleContext(content, predationOracleFromWebs([web]));
}

const NO_WEB = ctxWith({});

const move = (id: string): MoveDef => {
  const found = content.moves.moves.find((m) => m.id === id);
  if (!found) throw new Error(`no move ${id}`);
  return found;
};

/** Every gym slot the shipped rosters field, signature included — the enemy side of the sweep. */
const GYM_SLOTS: ReadonlyArray<{ gymId: string; slot: GymTeamSlot }> = [...content.gyms]
  .sort((a, b) => a.act - b.act)
  .flatMap((gym) => [...gym.slots, gym.signature].map((slot) => ({ gymId: gym.id, slot })));

/** bible §4 — Ancients are never fielded by a leader and never fight as the player's creature. */
const CATCHABLE_LINES: readonly SpeciesLine[] = content.species.filter((line) => !line.ancient);

/**
 * One fight, built the way tools/harness/gym-sim.ts builds a gym battle: no node, so predation
 * falls back to the union of whatever webs the context holds.
 */
function fieldedAgainst(
  enemySpec: BattlerSpec,
  playerSpec: BattlerSpec,
  ctx: BattleContext = NO_WEB,
): BattleState {
  return startBattle(
    { seed: 1, kind: "gym", playerParty: [playerSpec], enemyParty: [enemySpec] },
    ctx,
  ).state;
}

function specForSlot(slot: GymTeamSlot): BattlerSpec {
  return {
    uid: "leader",
    lineId: slot.lineId,
    age: slot.age,
    level: slot.level,
    traits: (slot.traits ?? []).map((t) => ({ ...t })),
  };
}

function specForLine(line: SpeciesLine, age: AgeClass, level: number, traits: Trait[] = []): BattlerSpec {
  return { uid: "mine", lineId: line.id, age, level, traits };
}

function chosenMoveId(state: BattleState, ctx: BattleContext): string {
  const action = chooseEnemyAction(state, ctx);
  if (action.kind !== "move") throw new Error(`the enemy policy returned a "${action.kind}", not a move`);
  return action.moveId;
}

const battlerIn = (state: BattleState, uid: string): Battler => {
  const found = state.battlers[uid];
  if (!found) throw new Error(`no battler "${uid}" on the field`);
  return found;
};

/**
 * The ranking key, restated from build-doc §7.4 rather than imported: power (with bible §3's role
 * bonus) times the type multiplier, and nothing else. Restating it is the point — a test that
 * imported the policy's own key would agree with any key the policy happened to use.
 */
function rankOf(moveId: string, defender: Battler): number {
  const m = move(moveId);
  if (m.power <= 0) return 0;
  let power = m.power;
  for (const effect of m.effects) {
    if (effect.kind === "bonusVsRole" && effect.role === defender.role) power += effect.bonusPower;
  }
  const { mult } = typeMultiplier(m.type, defender.types, content.moves.typeChart, B);
  return power * mult;
}

/** The move the docblock promises: the FIRST entry of the pool that attains the highest key. */
function promisedMoveId(attacker: Battler, defender: Battler): string {
  const ranked = attacker.moves.map((id) => ({ id, rank: rankOf(id, defender) }));
  const best = Math.max(...ranked.map((r) => r.rank));
  const first = ranked.find((r) => r.rank === best);
  if (!first) throw new Error(`"${attacker.uid}" knows no moves`);
  return first.id;
}

/* ════════════════════════════════════════════════════════════════════════════
 * 1. The measured case — Odo's Mirefin, from the T-27 sweep.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the measured T-27 case — Odo's Mirefin against a Vulkindle", () => {
  // data/gyms.json: Odo fields mirefin-line (A) at level 14. data/species.json: its pool is
  // [dous, miasma, ambush, …], the player's cindril-line is Fire at every age.
  const enemy = specForSlot({ lineId: "mirefin-line", age: "A", level: 14 });
  const player = specForLine(
    CATCHABLE_LINES.find((l) => l.id === "cindril-line") ?? (() => { throw new Error("no cindril-line"); })(),
    "A",
    14,
  );

  it("the two moves really are tied — this is a tie-break, not a preference", () => {
    const state = fieldedAgainst(enemy, player);
    const defender = battlerIn(state, "mine");
    // dous: 40 power, Water into Fire ⇒ ×balance.types.superEffective (1.5) = 60.
    // ambush: 60 power, typeless ⇒ ×1 = 60. Both products are exact in binary.
    expect(rankOf("dous", defender)).toBe(rankOf("ambush", defender));
    expect(B.types.superEffective).toBe(1.5);
    expect(move("dous").power * B.types.superEffective).toBe(move("ambush").power);

    // …and the full §7.4 product, which the policy used to rank on, does NOT tie them. This is the
    // defect in one line: an ulp of rounding, standing between a super-effective move and a
    // neutral one. If this ever stops being true the shipped numbers have moved, and the case
    // above stops being the case that was measured.
    const attacker = battlerIn(state, "leader");
    const midRoll = (B.damage.rollMin + B.damage.rollMax) / 2;
    const full = (moveId: string): number => {
      const m = move(moveId);
      const { mult } = typeMultiplier(m.type, defender.types, content.moves.typeChart, B);
      return ((attacker.stats.atk * m.power) / defender.stats.def) * mult * midRoll;
    };
    expect(full("dous")).not.toBe(full("ambush"));
    expect(full("ambush")).toBeGreaterThan(full("dous"));
  });

  it("throws `dous` — the earlier move in the pool, as core/battle.ts §14 promises", () => {
    const state = fieldedAgainst(enemy, player);
    const attacker = battlerIn(state, "leader");
    // Pool order is what the rule appeals to, so pin it: dous is genuinely earlier than ambush.
    expect(attacker.moves.indexOf("dous")).toBeLessThan(attacker.moves.indexOf("ambush"));
    expect(chosenMoveId(state, NO_WEB)).toBe("dous");
  });

  it("throws it against the Elder form too — the same tie, a different Defence stat", () => {
    // cindril-line is Fire and Mesopredator at J, A and E alike, so the pool's ranking is identical
    // at all three ages and only the defender's Defence moves. The Adult and the Elder are the two
    // ages the sweep caught going the wrong way.
    for (const age of AGE_CLASSES) {
      const state = fieldedAgainst(enemy, specForLine(
        CATCHABLE_LINES.find((l) => l.id === "cindril-line") ?? (() => { throw new Error("no cindril-line"); })(),
        age,
        14,
      ));
      expect(chosenMoveId(state, NO_WEB), `cindril-line (${age})`).toBe("dous");
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2. The law — over every fight the shipped gym rosters can produce.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("ties go to the earliest move in the pool — over the whole shipped gym space", () => {
  it("every gym slot, against every catchable line at J/A/E, throws the promised move", () => {
    expect(GYM_SLOTS.length).toBe(30); // 3/4/5/6/6/6, signature included (Hard Req 9 as amended)
    expect(CATCHABLE_LINES.length).toBeGreaterThanOrEqual(20);

    const wrong: string[] = [];
    let pairs = 0;
    let ties = 0;
    for (const { gymId, slot } of GYM_SLOTS) {
      const enemy = specForSlot(slot);
      for (const line of CATCHABLE_LINES) {
        for (const age of AGE_CLASSES) {
          pairs += 1;
          const state = fieldedAgainst(enemy, specForLine(line, age, slot.level));
          const attacker = battlerIn(state, "leader");
          const defender = battlerIn(state, "mine");
          const promised = promisedMoveId(attacker, defender);
          const actual = chosenMoveId(state, NO_WEB);
          if (actual !== promised) {
            wrong.push(
              `[${gymId}] ${slot.lineId}(${slot.age},L${String(slot.level)}) vs ${line.id}(${age}): ` +
                `threw "${actual}", pool order promises "${promised}"`,
            );
          }
          // How many of these fights are decided by the tie-break at all — if this ever reads 0 the
          // sweep has stopped covering the thing it was written for.
          const ranks = attacker.moves.map((id) => rankOf(id, defender));
          const best = Math.max(...ranks);
          if (best > 0 && ranks.filter((r) => r === best).length > 1) ties += 1;
        }
      }
    }
    expect(pairs).toBe(2160);
    expect(ties).toBeGreaterThanOrEqual(13);
    expect(wrong, wrong.join("\n")).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3. The invariance the law rests on.
 *
 * `atk`, `def`, `predation` and `midRoll` are the same positive number for every move in one pool,
 * so they cannot reorder it. tests/unit/harness.test.ts already pins that argument for predation
 * alone; these pin it for the rest, which is what makes the tie-break well defined rather than a
 * function of whichever creature happens to be holding the moves.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("no factor common to the pool can change what the enemy throws", () => {
  it("the defender's Defence cannot: same types, same role, three ages, one answer", () => {
    const differed: string[] = [];
    for (const { gymId, slot } of GYM_SLOTS) {
      const enemy = specForSlot(slot);
      for (const line of CATCHABLE_LINES) {
        // Only lines whose types AND role are constant across the ages: anywhere else the pool's
        // ranking legitimately changes with the age, and a difference would prove nothing.
        const types = AGE_CLASSES.map((a) => line.types[a].join("/"));
        const roles = AGE_CLASSES.map((a) => line.role[a]);
        if (new Set(types).size > 1 || new Set(roles).size > 1) continue;
        const answers = AGE_CLASSES.map((age) =>
          chosenMoveId(fieldedAgainst(enemy, specForLine(line, age, slot.level)), NO_WEB),
        );
        if (new Set(answers).size > 1) {
          differed.push(
            `[${gymId}] ${slot.lineId}(${slot.age}) vs ${line.id}: ` +
              AGE_CLASSES.map((a, i) => `${a}→${String(answers[i])}`).join(" "),
          );
        }
      }
    }
    expect(differed, differed.join("\n")).toEqual([]);
  });

  it("the attacker's Attack cannot: a +10% trait is not a move-choice", () => {
    // balance.traits.pool's atk-up common trait. The magnitude is balance.stats.traitModPct — the
    // trait carries only its direction (G11), so nothing here is a literal.
    const jaw = B.traits.pool.find((t) => t.stat === "atk" && t.direction === "up");
    if (!jaw) throw new Error("balance.traits.pool has no atk-up trait");

    const differed: string[] = [];
    for (const { gymId, slot } of GYM_SLOTS) {
      if ((slot.traits ?? []).length > 0) continue; // a shipped slot's own traits are content
      for (const line of CATCHABLE_LINES) {
        for (const age of AGE_CLASSES) {
          const player = specForLine(line, age, slot.level);
          const bare = chosenMoveId(fieldedAgainst(specForSlot(slot), player), NO_WEB);
          const buffed = chosenMoveId(
            fieldedAgainst({ ...specForSlot(slot), traits: [{ ...jaw }] }, player),
            NO_WEB,
          );
          if (bare !== buffed) {
            differed.push(`[${gymId}] ${slot.lineId}(${slot.age}) vs ${line.id}(${age}): ${bare} → ${buffed}`);
          }
        }
      }
    }
    expect(differed, differed.join("\n")).toEqual([]);
  });

  it("the §7.4 predation bonus cannot: the web is not a move-choice either", () => {
    const differed: string[] = [];
    for (const { gymId, slot } of GYM_SLOTS) {
      for (const line of CATCHABLE_LINES) {
        for (const age of AGE_CLASSES) {
          const enemy = specForSlot(slot);
          const player = specForLine(line, age, slot.level);
          // The same fight, once with the leader's creature eating the player's and once without.
          const fed = ctxWith({ [slot.lineId]: [line.id] });
          const without = chosenMoveId(fieldedAgainst(enemy, player, NO_WEB), NO_WEB);
          const with_ = chosenMoveId(fieldedAgainst(enemy, player, fed), fed);
          if (without !== with_) {
            differed.push(`[${gymId}] ${slot.lineId}(${slot.age}) vs ${line.id}(${age}): ${without} → ${with_}`);
          }
        }
      }
    }
    expect(differed, differed.join("\n")).toEqual([]);
  });

  it("and the policy is a function of the state alone — the same state, the same answer, no draws", () => {
    // build-doc §8.1: the enemy policy consumes zero rng draws, which is why a scripted battle
    // stream is hand-checkable. It takes no rng argument at all; this pins that calling it is free
    // of hidden state as well.
    for (const { slot } of GYM_SLOTS) {
      const state = fieldedAgainst(
        specForSlot(slot),
        specForLine(CATCHABLE_LINES[0] ?? (() => { throw new Error("no lines"); })(), "A", slot.level),
      );
      const first = chooseEnemyAction(state, NO_WEB);
      expect(chooseEnemyAction(state, NO_WEB)).toEqual(first);
      expect(chooseEnemyAction(state, NO_WEB)).toEqual(first);
    }
  });
});
