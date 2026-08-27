/**
 * game/gym-battle.ts — the join between standing in a town and earning the badge that opens the
 * next act.
 *
 * ══ WHY THIS FILE EXISTS ══
 * `core/acts.ts` has exactly one numeric input: badges. `balance.acts.gates` opens Brackwater and
 * Route 2 at one badge, Bowerdeep at two, and the Sanctum at five, and
 * `game/scenes/OverworldScene.ts` `travelTo` refuses a node whose act the player has not reached.
 * `OverworldScene.winGym` — the method that writes a badge flag — HAD NO CALLER ANYWHERE. Measured
 * through the real scene on a brand-new save: act 0, one unlocked node (`hearthollow`), travel to
 * `r1` refused, and no reachable route to a badge from there. Build-doc §16's never-cut
 * vertical slice is Hearthollow → R1 → Brackwater → R2, and two of those four needed a badge that
 * nothing in the shipped game could award.
 *
 * This module is the missing half, and it is the same shape as `game/wild-battle.ts`: it turns a
 * `GymLeader` (data/gyms.json) into a `BattleInput` + `BattleContext`, and reads the outcome back.
 * The scene supplies the launch; this decides what is launched.
 *
 * ══ WHAT IT IS NOT ALLOWED TO BE ══
 * • **No rules.** No damage, turn-order, XP or roster arithmetic. The leader's team is
 *   `[...gym.slots, gym.signature]` — data/gyms.json's own two fields, mapped one-for-one onto
 *   `BattlerSpec` — and every number in the fight is `core/battle.ts`'s.
 * • **No content invented (G2).** No leader, roster, level or type is written here; the file reads
 *   `content.gyms` and nothing else. A town with no leader is reported, never invented.
 * • **No engine.** No Phaser import, so the whole hand-off is exercised in a node test with no DOM.
 * • **No second act model.** Which act a leader belongs to is `GymLeader.act`; whether the player
 *   may fight them is `core/acts.ts` `actOf`. Nothing here derives either.
 * • **No moralising copy (G7).** Nothing in this file produces a player-facing string at all.
 *
 * NUMBERS (G11): `balance.party.maxPartySize` through `partySpecs`, and the save's own bag. No
 * literal. RANDOMNESS (G11): the injected `core/rng.ts` battle stream — the fight is seeded exactly
 * as a wild one is, so a replayed run fights the same battle.
 */

import {
  makeBattleContext,
  predationOracleFromWebs,
  type BattleContext,
} from "../core/battle";
import { deriveFoodWeb, indexSpecies, type EcoNode } from "../core/foodweb";
import { actOf, hasBadge } from "../core/acts";
import type { SaveEnvelope } from "../core/save";
import type {
  BattleInput,
  BattlerSpec,
  BattleState,
  Content,
  GymLeader,
  GymTeamSlot,
} from "../core/types";
import { partyProblem, partySpecs } from "./wild-battle";

/* ────────────────────────────────────────────────────────────────────────────
 * Which leader is standing where
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The leader whose gym is in `nodeId`, or null.
 *
 * Keyed on `GymLeader.town`, which is content-bible §7's own column. A node with no leader is the
 * normal case — the six routes have none — and is reported as null rather than defaulted to the
 * act's leader, which would put a gym on a route the bible does not put one on (G2).
 */
export function gymAtNode(content: Content, nodeId: string): GymLeader | null {
  return content.gyms.find((gym) => gym.town === nodeId) ?? null;
}

/**
 * Why the player cannot fight `gym` right now, or null when they can.
 *
 * Returned rather than thrown, and rather than being discovered inside the reducer: the overworld
 * prints this string. The act clause is the one that matters — a leader stands in a town the act
 * ladder has already opened, so being able to STAND there is not on its own permission to fight.
 */
export function gymBattleProblem(
  save: SaveEnvelope,
  gym: GymLeader,
  content: Content,
): string | null {
  // The party clause is `game/wild-battle.ts`'s, not a second reading of it: it refuses an EMPTY
  // party and an all-fainted one, and the second used to fall through to `startBattle`'s throw.
  const party = partyProblem(save);
  if (party !== null) return party;
  if (hasBadge(save, gym.id, content.balance)) return `badge ${gym.id} already won`;
  const act = actOf(save, content.gyms, content.balance);
  if (act < gym.act) return `${gym.id} is act ${String(gym.act)} · act ${String(act)}`;
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * GymLeader → BattleInput
 * ──────────────────────────────────────────────────────────────────────────── */

/** bible §7 — the leader's whole team, rank and file first, signature last. */
export function gymRoster(gym: GymLeader): GymTeamSlot[] {
  return [...gym.slots, gym.signature];
}

/** One roster slot as the reducer takes it. A field mapping — no rule, no derived number. */
export function gymBattlerSpec(slot: GymTeamSlot, gymId: string, index: number): BattlerSpec {
  const spec: BattlerSpec = {
    uid: `gym-${gymId}-${String(index)}`,
    lineId: slot.lineId,
    age: slot.age,
    level: slot.level,
    traits: (slot.traits ?? []).map((t) => ({ ...t })),
  };
  if (slot.nickname !== undefined) spec.nickname = slot.nickname;
  return spec;
}

/** The leader's team, in the order they are sent out. */
export function gymParty(gym: GymLeader): BattlerSpec[] {
  return gymRoster(gym).map((slot, i) => gymBattlerSpec(slot, gym.id, i));
}

export interface GymBattleBuild {
  input: BattleInput;
  ctx: BattleContext;
}

/**
 * Everything `BattleScene` needs for one gym fight.
 *
 * The `PredationOracle` is built from the food web at the town the fight happens in, exactly as
 * `buildWildBattle` builds it at the node the encounter happened at — §7.4's predation bonus is
 * per-node and `core/foodweb.ts` is the only module that may compute a diet edge (G3/G6). `nodeId`
 * is deliberately NOT set on the input: a gym fight decrements no population, and setting it would
 * point `caughtIndividual` at a node (`core/battle.ts` refuses a snare in a gym anyway, but the
 * seam should not need that refusal to be safe).
 */
export function buildGymBattle(opts: {
  content: Content;
  save: SaveEnvelope;
  gym: GymLeader;
  /** The live town node (`liveNodeOf(content, save, gym.town)`). */
  node: EcoNode;
}): GymBattleBuild {
  const { content, save, gym, node } = opts;
  const idx = indexSpecies(content.species);
  const web = deriveFoodWeb(node, idx, content.balance);
  const ctx = makeBattleContext(content, predationOracleFromWebs([web]));

  const input: BattleInput = {
    seed: save.seed,
    kind: "gym",
    playerParty: partySpecs(save),
    enemyParty: gymParty(gym),
    // The bag IS the save's items (build-doc §7.8) — the same read `buildWildBattle` makes. The
    // harness's `gymBag` hands its model player one salve per member; a real player carries what
    // they bought, which is the number the economy tunes.
    bag: { ...save.items },
  };
  return { input, ctx };
}

/**
 * Did the player beat the leader?
 *
 * `"win"` and nothing else. A `"fled"` is not a badge, and `"caught"`/`"escaped"` cannot happen in
 * a gym (the reducer refuses a snare there) — enumerated rather than written as `!== "loss"` so a
 * new outcome member is a decision instead of a free badge.
 *
 * ⚠ THIS IS THE BADGE, NOT THE COST. What the fight did to the party's HP, levels and bag is
 * `game/wild-battle.ts` `applyBattleResult(save, state)` — the ONE writer all four launchers share,
 * on the same terms they share `partyProblem`. A gym fight is where a party is most likely to be
 * wiped, so a finish handler that awards the badge and does not take the cost is the half-wiring
 * this file's sibling clause exists to prevent.
 */
export function gymBattleWon(state: Pick<BattleState, "outcome">): boolean {
  return state.outcome === "win";
}
