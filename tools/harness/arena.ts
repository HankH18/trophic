/**
 * tools/harness/arena.ts — run one battle to its end, headlessly.
 *
 * build-doc §10.5: "headless autobattler importing core/battle.ts". Locked decision L11 is the
 * reason this is only ~150 lines: the reducer is `(state, action, rng) => {state, events[]}` with no
 * engine in it, so "run a battle" is a loop over `step()`. Nothing here re-implements a rule.
 *
 * G11: no gameplay constant is written here. The turn cap is `balance.harness.maxBattleTurns`; the
 * damage roll bounds, the type multipliers and the predation bonus all come from `Balance`.
 * §8.1/G11: the only randomness is `core/rng.ts`'s seeded stream.
 */

import { effectiveSpeed, startBattle, step, typeMultiplier } from "../../core/battle";
import type { BattleContext } from "../../core/battle";
import { subsystemRng } from "../../core/rng";
import type {
  Balance,
  BattleAction,
  BattleInput,
  BattleOutcome,
  BattleState,
  Battler,
  MoveDef,
} from "../../core/types";

/** A battle that hit `balance.harness.maxBattleTurns` without either side falling over. */
export const STALLED = "stalled" as const;
export type ArenaOutcome = BattleOutcome | typeof STALLED;

export interface ArenaResult {
  outcome: ArenaOutcome;
  /** Reducer turns actually resolved. */
  turns: number;
  /** Player battlers still standing at the end. */
  playerStanding: number;
  enemyStanding: number;
}

/** How a side picks its action. Pure: given the same state it must return the same action. */
export type ActionPolicy = (state: BattleState, ctx: BattleContext) => BattleAction;

/* ────────────────────────────────────────────────────────────────────────────
 * Move scoring
 *
 * This mirrors core/battle.ts's own `expectedDamage` (its enemy policy) rather than inventing a
 * second damage model: attack and defence with their in-battle modifiers, the move's power plus any
 * role bonus, the type multiplier, the mid-point of the damage roll, and — optionally — the §7.4
 * predation bonus. `expectedDamage` is not exported, so the arithmetic is restated here; every
 * factor is read from the same `Balance` and the same `typeMultiplier` the reducer uses, and
 * `tests/unit/harness.test.ts` pins the two together by asserting the harness's own scoring picks
 * the same move as `chooseEnemyAction` when predation is switched on.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Attack/defence with their in-battle modifiers, as core/battle.ts's `statWithMods` reads them. */
function statOf(battler: Battler, key: "atk" | "def"): number {
  return battler.stats[key] * battler.statMods[key];
}

/** bible §3 — a role move may carry a flat power bonus against one role (Trample vs Producers). */
function powerAgainst(move: MoveDef, defenderRole: Battler["role"]): number {
  let power = move.power;
  for (const effect of move.effects) {
    if (effect.kind === "bonusVsRole" && effect.role === defenderRole) power += effect.bonusPower;
  }
  return power;
}

export interface ScoringOptions {
  /**
   * Whether the chooser knows the food web. bible §1 calls the derived web "a second, LEARNABLE
   * type chart" — so a player who has not learned it yet scores moves without the §7.4 predation
   * bonus. See tools/harness/player.ts for why the reasonable-player model turns this off.
   */
  usePredation: boolean;
  /** The node the battle happens at; §7.3 derives edges per node. */
  nodeId?: string | undefined;
}

export function expectedDamageOf(
  attacker: Battler,
  defender: Battler,
  move: MoveDef,
  ctx: BattleContext,
  opts: ScoringOptions,
): number {
  if (move.power <= 0) return 0;
  const balance = ctx.balance;
  const atk = statOf(attacker, "atk");
  const def = statOf(defender, "def");
  const power = powerAgainst(move, defender.role);
  const { mult } = typeMultiplier(move.type, defender.types, ctx.typeChart, balance);
  const predation =
    opts.usePredation && ctx.predation.eats(attacker.lineId, defender.lineId, opts.nodeId)
      ? balance.types.predation
      : 1;
  const midRoll = (balance.damage.rollMin + balance.damage.rollMax) / 2;
  return ((atk * power) / def) * mult * predation * midRoll;
}

/**
 * The highest-expected-damage move this attacker knows, ties broken by pool order — the same rule
 * core/battle.ts's `chooseEnemyAction` uses, so a mirror match is decided by the numbers rather
 * than by two different AIs.
 */
export function bestMoveId(
  attacker: Battler,
  defender: Battler,
  ctx: BattleContext,
  opts: ScoringOptions,
): string {
  const first = attacker.moves[0];
  if (first === undefined) throw new Error(`tools/harness: "${attacker.uid}" knows no moves`);
  let bestId = first;
  let bestScore = -1;
  for (const moveId of attacker.moves) {
    const move = ctx.moves.get(moveId);
    if (!move) throw new Error(`tools/harness: unknown move "${moveId}" (data/moves.json)`);
    const score = expectedDamageOf(attacker, defender, move, ctx, opts);
    if (score > bestScore) {
      bestScore = score;
      bestId = moveId;
    }
  }
  return bestId;
}

/** Speed, exactly as the reducer reads it (Soak included) — used only for reporting. */
export function speedOf(battler: Battler, balance: Balance): number {
  return effectiveSpeed(battler, balance);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The loop
 * ──────────────────────────────────────────────────────────────────────────── */

function standing(state: BattleState, order: readonly string[]): number {
  let n = 0;
  for (const uid of order) if (state.battlers[uid]?.fainted === false) n += 1;
  return n;
}

/**
 * Run one battle to completion.
 *
 * The stream is `subsystemRng(input.seed, battleTag)` — build-doc §8.1's per-subsystem seeding, so
 * two harness runs with the same seed draw the same numbers and a reported win rate can be
 * re-derived. There is no `Math.random` anywhere in this repo (G11).
 *
 * A `step()` that returns the SAME state object refused the action (core/battle.ts returns the
 * input state and a single `actionRejected` event). That is a bug in the policy, not a turn, and it
 * would otherwise spin forever — so it throws.
 */
export function runBattle(
  input: BattleInput,
  ctx: BattleContext,
  policy: ActionPolicy,
  battleTag: string,
): ArenaResult {
  const maxTurns = ctx.balance.harness.maxBattleTurns;
  const rng = subsystemRng(input.seed, battleTag);
  let state = startBattle(input, ctx).state;
  let turns = 0;

  while (state.outcome === null && turns < maxTurns) {
    const action = policy(state, ctx);
    const result = step(state, action, rng, ctx);
    if (result.state === state) {
      const rejected = result.events.find((e) => e.t === "actionRejected");
      throw new Error(
        `tools/harness: the policy offered an action the reducer refused — ` +
          `${rejected && rejected.t === "actionRejected" ? rejected.reason : "no reason given"} ` +
          `(action ${JSON.stringify(action)})`,
      );
    }
    state = result.state;
    turns += 1;
  }

  return {
    outcome: state.outcome ?? STALLED,
    turns,
    playerStanding: standing(state, state.playerOrder),
    enemyStanding: standing(state, state.enemyOrder),
  };
}

/**
 * The policy both sides use in the §10.5(b) round-robin: full argmax INCLUDING the predation
 * bonus — identical to `core/battle.ts`'s own enemy policy, so the chart measures the numbers and
 * not a difference between two AIs. Consumes no RNG draws.
 */
export function mirrorPolicy(nodeId?: string): ActionPolicy {
  return (state, ctx) => {
    const active = state.battlers[state.activePlayerUid];
    const enemy = state.battlers[state.activeEnemyUid];
    if (!active || !enemy) throw new Error("tools/harness: the field is empty");
    if (active.fainted) {
      const next = state.playerOrder.find((uid) => state.battlers[uid]?.fainted === false);
      if (next === undefined) throw new Error("tools/harness: nothing left to switch to");
      return { kind: "switch", uid: next };
    }
    return { kind: "move", moveId: bestMoveId(active, enemy, ctx, { usePredation: true, nodeId }) };
  };
}
