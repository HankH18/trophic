/**
 * game/rival.ts — content-bible §8's rival, who had no trigger, no roster and no module.
 *
 * ══ WHY THIS FILE EXISTS ══
 * The bible says Wick "battles you each act" and that "his team always includes Carricrow".
 * `data/dialogue.json` ships all eighteen of those battles as authored copy — six `battle-pre`, six
 * `battle-win`, six `battle-loss`, 37 lines. Measured before this module existed: `grep -rli rival
 * game/ core/ data/*.json` returned only doc comments, `data/gyms.json` held six leaders and no
 * rival, and Wick existed in the shipped game as exactly ONE always-eligible greeting in Brackwater.
 * `maren.finale` — Maren's send-off at the rim, on the never-cut finale path — gates on
 * `story.greaves.entered`, and the only writer of that flag was `wick.act6.win`.
 *
 * This is the same shape as `game/gym-battle.ts` and it is deliberately its sibling, not its
 * subclass: it turns a `RivalEncounter` (data/gyms.json `rival[]`) into a `BattleInput` +
 * `BattleContext` and reads the outcome back.
 *
 * ══ WHAT IT IS NOT ALLOWED TO BE ══
 * • **No second "has he been fought" model.** The corpus already answers that:
 *   `wick.act<N>.pre` carries `flagsUnset: ["rival.act<N>.fought"]`, and `battleEntryFor` resolves
 *   it through `core/dialogue-schema.ts` `conditionHolds` — the repo's one condition resolver. This
 *   module never constructs a `rival.*` flag key, so a corpus rename moves the gate on its own.
 *   {@link rivalEncounterStanding} is that question, asked the one legal way.
 * • **No rules.** No damage, turn-order, XP or roster arithmetic. His team is
 *   `[...rival.slots, rival.signature]` mapped one-for-one onto `BattlerSpec`.
 * • **No content invented (G2).** No line, level or age is written here; the file reads
 *   `content.rival` and nothing else. `data/gyms.json`'s `_rival` note records what is authored and
 *   under which constraint.
 * • **No badge.** `kind: "trainer"`, and nothing here touches `awardBadge`. The act ladder's only
 *   numeric input is gym badges; the rival must not move it.
 * • **No engine.** No Phaser import, so the whole hand-off runs in a node test with no DOM.
 *
 * NUMBERS (G11): `balance.party.maxPartySize` through `partySpecs`, and the save's own bag. No
 * literal. RANDOMNESS (G11): the injected `core/rng.ts` battle stream — the rival fight is seeded
 * exactly as a wild one is.
 */

import {
  makeBattleContext,
  predationOracleFromWebs,
  type BattleContext,
} from "../core/battle";
import { deriveFoodWeb, indexSpecies, type EcoNode } from "../core/foodweb";
import { actOf } from "../core/acts";
import type { DialogueContext, DialogueEntry, DialogueFile } from "../core/dialogue-schema";
import type { SaveEnvelope } from "../core/save";
import type {
  BattleInput,
  BattlerSpec,
  BattleState,
  Content,
  GymTeamSlot,
  RivalEncounter,
} from "../core/types";
import { battleEntryFor } from "./dialogue-runner";
import { partySpecs } from "./wild-battle";

/* ────────────────────────────────────────────────────────────────────────────
 * Which encounter is standing where
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The rival encounter posted at `nodeId`, or null.
 *
 * Keyed on `RivalEncounter.node`, which `core/schemas.ts` proves unique per node and per act. A node
 * with no rival is the normal case — the six towns have none — and is reported as null rather than
 * defaulted to the current act's row, which would put Wick in a town the bible does not put him in.
 */
export function rivalAtNode(content: Content, nodeId: string): RivalEncounter | null {
  return content.rival.find((r) => r.node === nodeId) ?? null;
}

/**
 * The `battle-pre` entry that is still standing here, or undefined.
 *
 * ⚠ THE CORPUS IS THE GATE, and asking it this way is the point. `wick.act<N>.pre`'s `when` is
 * `{actMin: N, flagsUnset: ["rival.act<N>.fought"]}`: the act FLOOR (deliberately a floor and not an
 * equality — beating gym N puts the player in act N+1 while they may never have walked rN, and an
 * equality would delete that encounter for good) and the one flag his `battle-win` writes. Both
 * clauses are resolved by `conditionHolds`, so this module holds no act model and constructs no flag
 * key, and a corpus edit to either moves the trigger with it.
 */
export function rivalEncounterStanding(
  file: DialogueFile,
  rival: RivalEncounter,
  ctx: DialogueContext,
): DialogueEntry | undefined {
  return battleEntryFor(file, rival.id, rival.node, "battle-pre", ctx);
}

/**
 * Why the player cannot fight the rival right now, or null when they can.
 *
 * Returned rather than thrown, and on the same terms `gymBattleProblem` refuses: the overworld
 * prints this string. An arrival-triggered fight can otherwise strand a fainted party on a route
 * with nothing on screen to say why nothing happened.
 *
 * "Has he already been fought" is NOT asked here — {@link rivalEncounterStanding} asks the corpus.
 */
export function rivalBattleProblem(
  save: SaveEnvelope,
  rival: RivalEncounter,
  content: Content,
): string | null {
  if (partySpecs(save).length === 0) return "no creature in the party — nothing can be sent out";
  const act = actOf(save, content.gyms, content.balance);
  if (act < rival.act) return `${rival.id} act ${String(rival.act)} · act ${String(act)}`;
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * RivalEncounter → BattleInput
 * ──────────────────────────────────────────────────────────────────────────── */

/** bible §8 — the rival's whole team, rank and file first, Carricrow last. */
export function rivalRoster(rival: RivalEncounter): GymTeamSlot[] {
  return [...rival.slots, rival.signature];
}

/** One roster slot as the reducer takes it. A field mapping — no rule, no derived number. */
export function rivalBattlerSpec(slot: GymTeamSlot, rivalId: string, act: number, index: number): BattlerSpec {
  const spec: BattlerSpec = {
    uid: `rival-${rivalId}-${String(act)}-${String(index)}`,
    lineId: slot.lineId,
    age: slot.age,
    level: slot.level,
    traits: (slot.traits ?? []).map((t) => ({ ...t })),
  };
  if (slot.nickname !== undefined) spec.nickname = slot.nickname;
  return spec;
}

/** The rival's team, in the order they are sent out. */
export function rivalParty(rival: RivalEncounter): BattlerSpec[] {
  return rivalRoster(rival).map((slot, i) => rivalBattlerSpec(slot, rival.id, rival.act, i));
}

export interface RivalBattleBuild {
  input: BattleInput;
  ctx: BattleContext;
}

/**
 * Everything `BattleScene` needs for one rival fight.
 *
 * The `PredationOracle` is built from the food web at the node the fight happens on, exactly as
 * `buildGymBattle` and `buildWildBattle` build theirs — §7.4's predation bonus is per-node and
 * `core/foodweb.ts` is the only module that may compute a diet edge (G3/G6). `nodeId` is
 * deliberately NOT set: a trainer fight decrements no population, and setting it would point
 * `caughtIndividual` at a node.
 */
export function buildRivalBattle(opts: {
  content: Content;
  save: SaveEnvelope;
  rival: RivalEncounter;
  /** The live node (`liveNodeOf(content, save, rival.node)`). */
  node: EcoNode;
}): RivalBattleBuild {
  const { content, save, rival, node } = opts;
  const idx = indexSpecies(content.species);
  const web = deriveFoodWeb(node, idx, content.balance);
  const ctx = makeBattleContext(content, predationOracleFromWebs([web]));

  const input: BattleInput = {
    seed: save.seed,
    kind: "trainer",
    playerParty: partySpecs(save),
    enemyParty: rivalParty(rival),
    bag: { ...save.items },
  };
  return { input, ctx };
}

/**
 * Did the player beat the rival?
 *
 * `"win"` and nothing else, enumerated rather than written as `!== "loss"` — the same discipline
 * `gymBattleWon` uses, and for the same reason: a fled fight is not a win, and a new outcome member
 * must be a decision rather than a free one.
 */
export function rivalBattleWon(state: Pick<BattleState, "outcome">): boolean {
  return state.outcome === "win";
}
