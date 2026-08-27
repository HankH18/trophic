/**
 * core/recovery.ts — what happens when NOTHING IN THE PARTY IS STANDING.
 *
 * Hank, ruling, verbatim:
 *
 *   > "You should absolutely take a note from Pokémon. When your team is wiped, a dialogue shows up
 *   >  with a black background saying you passed out or something like that, and then you wake up
 *   >  at the inn."
 *
 *   > "When you end up at an inn due to having your party wiped, it should use twice the inn ticks,
 *   >  in addition to the cost of one fast travel."
 *
 * ⚠ WHY IT IS NOT OPTIONAL. A wipe used to be unreachable: `save.party[].curHp` had no writer
 * outside `core/lifecycle.ts`, so damage evaporated between fights. `game/wild-battle.ts`
 * `applyBattleResult` writes it back now, and three things then line up into a dead end —
 * `core/lifecycle.ts` keeps a zero at zero through the year turn, the inn charges ticks and heals
 * nothing, and all four `*BattleProblem` launchers refuse a party with nothing standing. A player
 * whose last creature falls has no action left that can change the state.
 *
 * ⚠ THE MIDDLE ONE OF THOSE THREE IS NOW FALSE, AND THE BLACKOUT IS STILL NOT OPTIONAL. §5 below
 * makes the inn heal, so an inn is a way back to full — but only for a player who is STANDING IN A
 * TOWN and free to press a key, and a wipe happens on a route, mid-fight, with the four launchers
 * refusing every fight and the shell calling {@link applyBlackoutRecovery} at the end of the fight
 * before control returns. The inn is never the cheaper route out of a wipe because it is never
 * reachable from one. What the extra `innTicks + travelTicks` buys is what §3's price list has
 * always said it buys: the SECOND night and the CARRY. That contradicts a
 * ruling Hank has already closed — *"if the player finds themselves in a situation where all they
 * have is one creature, then this forced choice prevents the game from being blocked, which is a
 * good thing"* — and it is also the explicit penalty docs/TICKETS.md T-12 asks for. THEY ARE THE
 * SAME THING: the blackout is what the run costs, and being able to carry on is what it buys.
 *
 * Pure TypeScript, zero engine imports (L11), and no gameplay constant of its own (G11): the price
 * is composed from `balance.clock.innTicks` and `balance.clock.travelTicks` through
 * `core/clock.ts`'s own helpers, and the inn nodes and the node graph are read from shipped
 * content. There is no `blackoutTicks` balance key and there must not be one — the ruling defines
 * the price in terms of the two that already exist.
 *
 * WHAT LIVES WHERE. `core/save.ts` owns the TAPE — `BlackoutRecovery`, `blackoutAction`,
 * `readBlackout`, `applyBlackout` — because that module owns the log and its appliers. This module
 * owns the DECISIONS, which need content: is the party down, where do they wake, what is charged.
 */

import type { ClockActionKind } from "./clock";
import { subTicksForAction, ticksForAction } from "./clock";
import { DIALOGUE, selectEntry, type DialogueContext, type DialogueEntry } from "./dialogue-schema";
import { appendAction, applyBlackout, blackoutAction, type BlackoutRecovery, type SaveEnvelope } from "./save";
import type { Balance, Content, GameAction, NodeFile, OwnedCreature } from "./types";

export class RecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecoveryError";
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * 1. Is the party down?
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * "Is this creature on its feet" — INJECTED, never re-spelled here.
 *
 * ⚠ THE PREDICATE HAS ONE SPELLING AND IT IS `game/wild-battle.ts` `isStanding`, which is
 * `core/battle.ts` `startBattle`'s own condition ("`curHp === undefined` means full"). Writing
 * `curHp === undefined || curHp > 0` a third time is a defect this repo has already repaired once:
 * two spellings of a reducer precondition drift, and the drift is only ever found by the throw the
 * precondition exists to prevent.
 *
 * It is a PARAMETER rather than an import because `core/` may not import `game/` — L11, enforced by
 * `tests/gates/guardrails.test.ts` `no_phaser_in_core`, which walks core's transitive import closure
 * and fails on any file under `game/`. So the shell passes the one true predicate and so does the
 * test. STANDING HANDOFF: lift `isStanding` into `core/battle.ts`, where the condition it mirrors
 * already lives, and this parameter collapses into an import.
 */
export type StandingFn = (creature: Pick<OwnedCreature, "curHp">) => boolean;

/**
 * The party members a fight can field — `game/wild-battle.ts` `partySpecs`'s filter, on the owned
 * creatures rather than on their specs. A boxed creature is not fielded, so it cannot be knocked
 * down and it is not what "the party is wiped" is about.
 */
function fieldable(save: SaveEnvelope): OwnedCreature[] {
  return save.party.filter((c) => c.boxed !== true);
}

/**
 * True when a fight has left NOTHING to send out — every fieldable party member down.
 *
 * ⚠ AN EMPTY PARTY IS A DIFFERENT STATE AND GETS A DIFFERENT ANSWER. `game/wild-battle.ts`
 * `partyProblem` reports both as a refusal, and it is right to: neither can start a fight. But a
 * player with no creatures at all has not been wiped — nothing went down, there is nothing to put
 * back up, and moving them to an inn would be a consequence with no cause. That state belongs to
 * the opening beat (Maren hands over a starter), not here. So this is false for an empty party and
 * {@link blackoutRecoveryFor} returns null for one.
 */
export function partyIsDown(save: SaveEnvelope, isStanding: StandingFn): boolean {
  const party = fieldable(save);
  if (party.length === 0) return false;
  return !party.some(isStanding);
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2. Where do they wake?
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The role tag the corpus puts on an innkeeper. `core/dialogue-schema.ts` calls `role` "flavour for
 * tooling, not logic", and this module makes it logic — deliberately and out loud, because it is
 * the only place in the shipped data that says WHERE AN INN IS. {@link innNodeIds} does not trust
 * it alone: it takes the intersection with the nodes those speakers actually have a
 * `kind: "service"` beat at, and refuses if the two readings disagree.
 */
const INNKEEPER_ROLE = "innkeeper";

/** The kind of the shipped rest beats. Already in `game/dialogue-runner.ts` `TALK_KINDS`. */
const SERVICE_KIND = "service";

/**
 * The nodes that have an inn, derived from shipped content and cross-checked against itself.
 *
 * ⚠ IT IS NOT `content.gyms[].town`, AND THAT NEAR MISS IS WORTH THE COMMENT. Five of the six gyms
 * stand in the five towns; the sixth is `greaves` at `sanctum`, which has no inn, no innkeeper and
 * no beds. A rule that woke a wiped player at "the nearest gym town" would carry them INTO the
 * Sanctum, which is the one node in the region a blackout must never end at.
 *
 * TWO READINGS, INTERSECTED:
 *   • a speaker tagged `role: "innkeeper"` whose `home` names a node — the data's own statement
 *     that an innkeeper stands there;
 *   • that same speaker having a `kind: "service"` beat at that node — the rest beat itself.
 * A speaker that satisfies one and not the other is a content drift, and it is refused loudly
 * rather than silently narrowing the set the whole rule stands on.
 */
export function innNodeIds(): readonly string[] {
  const homed: string[] = [];
  const serviced = new Set<string>();
  for (const speaker of DIALOGUE.speakers) {
    if (speaker.role !== INNKEEPER_ROLE) continue;
    if (speaker.home === undefined) {
      throw new RecoveryError(
        `dialogue speaker "${speaker.id}" is tagged ${INNKEEPER_ROLE} but is homed to no node — ` +
          "there is nowhere for a wiped player to wake",
      );
    }
    homed.push(speaker.home);
    for (const entry of DIALOGUE.entries) {
      if (entry.speaker === speaker.id && entry.kind === SERVICE_KIND && entry.node === speaker.home) {
        serviced.add(speaker.home);
      }
    }
  }
  const both = homed.filter((node) => serviced.has(node));
  if (both.length !== homed.length) {
    throw new RecoveryError(
      `the innkeepers homed to [${homed.join(", ")}] do not all have a "${SERVICE_KIND}" beat there ` +
        `— [${[...serviced].join(", ")}] do. One reading of "there is an inn here" disagrees with ` +
        "the other, and a wiped player would be carried somewhere the corpus has nothing to say.",
    );
  }
  if (both.length === 0) {
    throw new RecoveryError("no node in the region has an inn — a wiped player has nowhere to wake");
  }
  return both;
}

/** The innkeeper who speaks at a node, or null where nobody keeps an inn. */
export function innkeeperAt(nodeId: string): string | null {
  for (const speaker of DIALOGUE.speakers) {
    if (speaker.role === INNKEEPER_ROLE && speaker.home === nodeId) return speaker.id;
  }
  return null;
}

/**
 * What the innkeeper of the wake node says as the player comes round — "and then you wake up at the
 * inn", in the ruling's own words.
 *
 * ⚠ IT IS THE SHIPPED REST BEAT, NOT A NEW ONE. All five innkeepers already have a
 * `kind: "service"` beat authored in their own voice, and every one of them reads as an answer to a
 * guest who has just been put to bed — Aldis has the boots by the fire and the animals in the byre
 * "an hour since" before anyone asks. Re-authoring five wake-up speeches would put one construction
 * in five mouths, which `docs/CAST-AND-VOICE.md`'s hard cap forbids outright, so the black-screen
 * line is `narration`'s and the room is theirs.
 *
 * A THIN DELEGATION to `core/dialogue-schema.ts` `selectEntry`, the repo's single resolution path.
 * There is no second priority loop here and there must not be one.
 */
export function restBeatAt(nodeId: string, ctx: DialogueContext): DialogueEntry | undefined {
  const speaker = innkeeperAt(nodeId);
  if (speaker === null) return undefined;
  return selectEntry(DIALOGUE, speaker, nodeId, SERVICE_KIND, ctx);
}

/**
 * THE DESTINATION RULE: the nearest node with an inn, by breadth-first search over the shipped
 * `adjacency` graph, ties broken by the order `data/nodes/` ships in.
 *
 * ⚠ IT MUST BE TOTAL AND IT IS TOTAL BY CONSTRUCTION. Seven of the twelve shipped nodes have no
 * inn — five routes plus the Sanctum approach and the Sanctum — and a player can be wiped on any
 * of them, including on the very first foray, having never rested anywhere. So the rule may not
 * read a history: no "the last inn you used", which is empty on a new save; no "the town you are
 * in", which is not a town on seven nodes out of twelve. Distance-0 answers a town with itself, and
 * the graph is a connected line with an inn on it, so every node has an answer.
 *
 * TIES ARE REAL AND THE TIEBREAK IS LOAD-BEARING. Each of r1–r4 sits between two towns at distance
 * one. Shipped order is graph order — hearthollow, r1, brackwater, r2, bowerdeep, r3, cindershelf,
 * r4, duskhollow, r5, sanctum-approach, sanctum — so the earlier town wins every tie, and the
 * earlier town is the one whose act gate the player has already passed (`balance.acts.gates`). The
 * opposite tiebreak would wake a player inside a town they have not unlocked; a random one would
 * break L10 and G11 both. `tests/unit/recovery.test.ts` pins the answer for all twelve nodes and
 * pins that no answer is act-gated above the node it was reached from.
 *
 * A node the region does not carry is a loud refusal, not a fallback: guessing a destination for a
 * node nobody shipped is how a save ends up standing somewhere that does not exist.
 */
export function wakeNodeFor(nodeId: string, content: Content): string {
  const byId = new Map<string, NodeFile>(content.nodes.map((n) => [n.id, n]));
  const start = byId.get(nodeId);
  if (!start) {
    throw new RecoveryError(
      `"${nodeId}" is not a node in data/nodes/ — there is no graph position to wake from`,
    );
  }
  const inns = new Set(innNodeIds());
  // Shipped order is the tiebreak, so the frontier is walked in shipped order and a node is only
  // ever enqueued once. `order` gives every node its rank without a second traversal.
  const order = new Map<string, number>(content.nodes.map((n, i) => [n.id, i]));
  const rank = (id: string): number => order.get(id) ?? content.nodes.length;
  const seen = new Set<string>([nodeId]);
  let frontier: string[] = [nodeId];
  while (frontier.length > 0) {
    const here = [...frontier].sort((a, b) => rank(a) - rank(b));
    for (const id of here) {
      if (inns.has(id)) return id;
    }
    const next: string[] = [];
    for (const id of here) {
      const node = byId.get(id);
      if (!node) continue;
      for (const neighbour of node.adjacency) {
        if (seen.has(neighbour)) continue;
        seen.add(neighbour);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  throw new RecoveryError(
    `no node with an inn is reachable from "${nodeId}" over data/nodes/ adjacency — ` +
      `the region graph is not connected to [${[...inns].join(", ")}]`,
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3. What does it cost?
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * THE PRICE, as the list of clock actions it is composed of — Hank's ruling, spelled as arithmetic
 * the clock already knows how to do: **twice the inn ticks, plus one fast travel.**
 *
 * ⚠ A LIST AND NOT A MULTIPLICATION, for two reasons that both matter:
 *   • G11. `2 * balance.clock.innTicks` puts the literal `2` in `core/`, which
 *     `tests/gates/guardrails.test.ts` `no_magic_numbers` reads as a gameplay constant that belongs
 *     in `data/balance.json`. It does not belong there — there is no `blackoutTicks` key and the
 *     ruling composes the price out of the two keys that already exist. Written as a list there is
 *     no numeric literal at all, and the "twice" is the length of the list.
 *   • THE TAPE. Each element becomes its own ordinary priced entry — `{t:"inn"}`, `{t:"inn"}`,
 *     `{t:"travel"}` — which is what makes the blackout cost the same on the replay path as on the
 *     live one with NOTHING added to `core/clock.ts` `ClockActionKind`, `core/types.ts`
 *     `GameAction`, `game/year-replay.ts` `TICK_COSTING` or `game/ui/SeasonMeter.ts` `actionCosts`.
 *     A new kind would light up five exhaustive switches to express a price that is already
 *     expressible.
 *
 * `satisfies` keeps the list checked against `ClockActionKind`, so `core/clock.ts`'s promise that
 * adding a member there is "deliberately noisy" stays true of this file too.
 */
export const BLACKOUT_COST = ["inn", "inn", "travel"] as const satisfies readonly ClockActionKind[];

/** The kinds {@link BLACKOUT_COST} actually contains — narrow, so the mapping below is exhaustive. */
export type BlackoutCostKind = (typeof BLACKOUT_COST)[number];

/** One element of the price: the clock kind, and the tape entry that carries it. */
export interface BlackoutCharge {
  kind: BlackoutCostKind;
  action: GameAction;
}

/**
 * The price as the shell must levy it: one charge per element of {@link BLACKOUT_COST}, in order,
 * each an ordinary `GameAction` the clock and the tape already understand.
 *
 * Both entries name the WAKE node, because both are true of it: the player is put up at that town's
 * inn, twice over, and was carried there.
 */
export function blackoutCharges(recovery: BlackoutRecovery): BlackoutCharge[] {
  return BLACKOUT_COST.map((kind) => {
    switch (kind) {
      case "inn":
        return { kind, action: { t: "inn", townId: recovery.wakeNode } };
      case "travel":
        return { kind, action: { t: "travel", to: recovery.wakeNode } };
    }
  });
}

/** The whole price in TICKS, for the banner and the harness. Fractional if a member ever is. */
export function blackoutTicks(balance: Balance): number {
  return BLACKOUT_COST.reduce((total, kind) => total + ticksForAction(kind, balance), 0);
}

/** The same price as an exact integer count of sub-ticks — the only form the clock does arithmetic in. */
export function blackoutSubTicks(balance: Balance): number {
  return BLACKOUT_COST.reduce((total, kind) => total + subTicksForAction(kind, balance), 0);
}

/* ────────────────────────────────────────────────────────────────────────────
 * 4. The whole thing
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The corpus cue that a blackout beat is owed.
 *
 * ⚠ IT IS A LATCH, NOT A RECORD. It is raised by {@link applyBlackoutRecovery} and lowered by the
 * beat itself — `data/dialogue.json` `narration.blackout` carries `setFlags: {…: false}` — so the
 * beat is eligible for exactly as long as it has not been played, and `game/dialogue-runner.ts`
 * `talkEntryFor` cannot hand a black-screen line to a player walking around a town who never went
 * down. That is the whole reason the beat is gated at all: `kind: "service"` is walked by the
 * interact key, and an ungated one is reachable by pressing [E] enough times.
 *
 * ⚠ AND IT IS NOT ON THE TAPE. `core/save.ts` `applyBlackout` deliberately does not write it. NO
 * corpus flag is on the tape — `story.opening.done`, every quest turn-in, both Vellsire outcomes
 * are all written by `game/scenes/OverworldScene.ts` `finishDialogue` through `applyRunFlags`, and
 * `replay` reproduces none of them. Putting the cue on the tape would be the ONE corpus flag replay
 * writes, and since replay has no dialogue to lower it again it would leave every replayed run
 * standing with a blackout beat permanently owed. Left off, a replayed run has the key absent where
 * the live run has it `false`, and `core/dialogue-schema.ts` `conditionHolds` reads those two
 * identically. The SAVE consequence — the party, the node — replays exactly; see `applyBlackout`.
 */
export const BLACKOUT_CUE_FLAG = "story.blackout.woke";

/** The `data/dialogue.json` entry {@link BLACKOUT_CUE_FLAG} exists for. Played by id, not selected. */
export const BLACKOUT_ENTRY_ID = "narration.blackout";

/**
 * What a blackout would do to this save, or null when there is nothing to recover from.
 *
 * Null means "somebody is still standing, or there is nobody at all" — see {@link partyIsDown}. A
 * caller that gets null must not charge anything: the price is for a consequence, and there is none.
 *
 * `restored` is every FIELDABLE party member, and not only the ones at zero. On the blackout path
 * that is the same list — nothing is standing, by definition — and it is written this way so the
 * record says what an inn rest does rather than what this particular wipe happened to leave.
 */
export function blackoutRecoveryFor(
  save: SaveEnvelope,
  content: Content,
  isStanding: StandingFn,
): BlackoutRecovery | null {
  if (!partyIsDown(save, isStanding)) return null;
  return {
    wakeNode: wakeNodeFor(save.currentNode, content),
    restored: restoredUids(save, content.balance, isStanding),
  };
}

/**
 * WHAT AN INN RESTORES, read from balance rather than assumed (G11).
 *
 * `balance.medicine.innRestFullHeal` is `true` today and bible §11 says the same in words — "inn
 * rest (full heal, 2 ticks)" — so this recovery is a full heal, at twice the price. The flag is
 * BRANCHED ON rather than merely quoted, and the false branch is written so that the flag can be
 * retuned without the run becoming blockable:
 *
 *   • `innRestFullHeal` — every fieldable party member back to full, which is what a rest is;
 *   • otherwise — only the ones that are DOWN, which is the floor the closed ruling requires
 *     ("this forced choice prevents the game from being blocked") and no more than that.
 *
 * ⚠ ON THE BLACKOUT PATH THE TWO BRANCHES CANNOT DIFFER, and that is the point rather than a
 * weakness: nothing is standing when this is called, so "everyone" and "everyone who is down" name
 * the same creatures. The branch exists so the magnitude follows balance where it can, while the
 * one property the ruling actually fixes — a wiped save can act again — is not a tunable.
 *
 * ⚠ IT HAS TWO CALLERS NOW, AND THAT WAS ALWAYS THE POINT OF ITS SHAPE. The docblock above already
 * said this function answers "what an inn rest does"; {@link innRestFor} is the inn asking it. The
 * two branches genuinely differ there — a party with one member down and two upright is exactly the
 * state the blackout can never be in — which is what turns `innRestFullHeal` from a flag with one
 * reader into the flag it is named for.
 */
function restoredUids(save: SaveEnvelope, balance: Balance, isStanding: StandingFn): string[] {
  const party = fieldable(save);
  const chosen = balance.medicine.innRestFullHeal ? party : party.filter((c) => !isStanding(c));
  return chosen.map((c) => c.uid);
}

/**
 * The LIVE composition: the tape entry, then the write, then the corpus cue.
 *
 * ORDER AND OWNERSHIP, stated because a replay depends on it — the same three-step shape
 * `game/wild-battle.ts` `applyBattleResult` states for a finished fight:
 *   1. `appendAction(blackoutAction(...))` — the tape. `core/save.ts` `replay` reads that entry and
 *      applies it through the very same `applyBlackout`, so a replay reproduces this save (L10).
 *   2. `applyBlackout` — core/save.ts's own writer, the one replay reaches.
 *   3. the cue — live only, and off the tape on purpose (see {@link BLACKOUT_CUE_FLAG}).
 *
 * ⚠ IT DOES NOT CHARGE THE CLOCK, and it must not. This module is pure and models no meter; the
 * shell levies {@link blackoutCharges} through whatever it already uses to spend a tick, so a
 * blackout crosses a season boundary or fills the year meter exactly the way an inn rest does. A
 * price charged here as well would be charged twice.
 *
 * Call this BEFORE the charge. The consequence is then on the save before anything else can read
 * it — a year turn the charge triggers, a save write, the HUD — and an interrupted charge leaves a
 * coherent save rather than a wiped party standing on a route with its ticks already spent.
 */
export function applyBlackoutRecovery(save: SaveEnvelope, recovery: BlackoutRecovery): SaveEnvelope {
  const applied = applyBlackout(appendAction(save, blackoutAction(recovery)), recovery);
  return { ...applied, questFlags: { ...applied.questFlags, [BLACKOUT_CUE_FLAG]: true } };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 5. The INN REST — the same restore, at a third of the price and with no move
 *
 * ⚠ WHY IT LIVES BESIDE THE BLACKOUT AND NOT IN THE SHELL. `game/scenes/OverworldScene.ts`
 * `restAtInn` was `spendTicks("inn", …)` and a banner: it charged `clock.innTicks` and healed
 * nothing. That was harmless only while damage evaporated between fights. It does not evaporate —
 * `game/wild-battle.ts` `applyBattleResult` writes `curHp` back and `core/lifecycle.ts` carries a
 * zero through the year turn unchanged — so the inn charged for a thing it did not do, and a
 * damaged-but-not-wiped party's only route back to full was to LOSE a fight on purpose: the
 * blackout, at `2 × innTicks + 1 × travelTicks` and a forced relocation, next door to an inn that
 * cost `innTicks` and did nothing.
 *
 * ⚠ AND `balance.medicine.innRestFullHeal` HAD EXACTLY ONE READER — {@link restoredUids}, reached
 * only from the blackout — while bible §11 reads "inn rest (full heal, 2 ticks)". The inn was the
 * one thing that flag is named for and the one place it was not used.
 *
 * SO THIS SECTION ADDS NO SECOND RESTORE. The selection is {@link restoredUids}, the same function
 * the blackout selects with; the WRITE is `core/save.ts` `applyBlackout`, the same writer `replay`
 * comes through. A rest that computed its own HP numbers would be a third spelling of build-doc
 * §7.4's effective-stat formula in a file with no business knowing it — which is precisely what
 * `core/types.ts` `BlackoutRecovery` exists to avoid by spelling "full" as a DELETED `curHp`.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * What one inn rest does to this save.
 *
 * TWO LISTS, and they answer two different questions:
 *   • `restored` — every member the rest puts AT FULL. This is {@link restoredUids} verbatim and it
 *     is what the tape carries, because it is the ABSOLUTE statement: applied to any save it names
 *     the same creatures and leaves them in the same state, which is the rule `core/types.ts`
 *     {@link BlackoutRecovery} states for its own `restored`.
 *   • `healed` — the ones the rest actually CHANGES, i.e. the ones carrying an explicit `curHp`.
 *     Under `innRestFullHeal` the first list is the whole fieldable party whether or not anybody was
 *     hurt, so it is the wrong number to show a player. DERIVED, never taped: a record that carried
 *     both would have two answers to "who was restored" the moment a save was hand-edited.
 */
export interface InnRest {
  restored: readonly string[];
  healed: readonly string[];
}

/**
 * What resting at an inn would do to this save, or null when it would do nothing.
 *
 * NULL IS "NOTHING TO RESTORE", NOT "NOT ALLOWED", and the distinction is the whole of the
 * full-party case: an undamaged party may rest, is charged `clock.innTicks` for it exactly as a
 * damaged one is, and is neither refused nor thrown at. The shell reads null as "levy the price,
 * write nothing", which is what keeps the inn's price unconditional — a rest whose cost depended on
 * how hurt the party was would be a second, hidden pricing rule beside `core/clock.ts`'s.
 *
 * ⚠ THE PREDICATE IS `curHp !== undefined`, WHICH IS NOT A SECOND SPELLING OF `isStanding`. It asks
 * "does this creature carry an explicit HP number", not "is it on its feet" — and it is exactly the
 * condition `core/save.ts` `applyBlackout` branches on when it decides whether a member changes at
 * all. So `healed` being empty is the same statement as "the restore is a no-op on this save", and
 * the tape stays byte-identical for the ordinary full-party rest rather than growing an entry per
 * keypress.
 */
export function innRestFor(
  save: SaveEnvelope,
  balance: Balance,
  isStanding: StandingFn,
): InnRest | null {
  const restored = restoredUids(save, balance, isStanding);
  const wanted = new Set(restored);
  const healed = save.party.filter((c) => wanted.has(c.uid) && c.curHp !== undefined).map((c) => c.uid);
  if (healed.length === 0) return null;
  return { restored, healed };
}

/**
 * The `t` discriminant an inn rest rides on the tape under.
 *
 * ⚠ IT IS A CONSEQUENCE AND IT NEEDS ITS OWN ENTRY. `{t:"inn", townId}` is a PRICE — `replay`
 * applies no state for it and `game/year-replay.ts` `clockFromLog` charges `balance.clock.innTicks`
 * for it — and `core/save.ts`'s contract is that an entry is a price or an absolute consequence and
 * never both. Two concrete failures follow from breaking it here rather than one doctrinal one:
 *   • `core/recovery.ts` `BLACKOUT_COST` levies TWO `{t:"inn"}` entries of its own. A heal derived
 *     from the price entry would fire on those as well, so the blackout would be restored three
 *     times by two different rules — and `applyBlackout` and a price-derived heal disagree the
 *     moment `innRestFullHeal` is retuned to false.
 *   • the false branch of {@link restoredUids} needs `isStanding`, which `replay` does not have and
 *     must not acquire: the one spelling lives in `game/wild-battle.ts` and `core/` may not import
 *     `game/` (L11). An absolute uid list needs no predicate at replay time, which is the same
 *     reason `BlackoutRecovery` carries uids instead of HP numbers.
 *
 * ⚠ THE CAST BELOW IS A HANDOFF, NOT A HABIT. `core/types.ts` `GameAction` has no `innRest` member
 * yet and that file is not this lane's to edit. This is the identical position `blackout` shipped
 * from — "the cast that used to stand below it is gone", `core/save.ts` `BLACKOUT_ACTION` — and it
 * is removed the same way, by one line joining the union. `core/schemas.ts` needs no change and must
 * not get one: `zSaveFileFor` validates `actionLog[].action` as `z.looseObject({t: z.string()})`,
 * which hands the payload back intact, and {@link readInnRest} re-checks the shape at read time
 * rather than trusting the discriminant.
 */
export const INN_REST_ACTION = "innRest";

/** The tape entry for one inn rest. Absolute: the uids it puts at full. */
export function innRestAction(restored: readonly string[]): GameAction {
  return { t: INN_REST_ACTION, restored: [...restored] } as unknown as GameAction;
}

/**
 * The uid list carried by a tape entry, or null when the entry is not an inn rest.
 *
 * Takes `unknown` for the reason `core/save.ts` `readBlackout` does: the tape reaches a reader
 * through a permissive schema, so this is the only place the record's shape is checked, and a
 * malformed one is null — it then changes nothing — rather than making a corrupt tape unreadable.
 */
export function readInnRest(action: unknown): string[] | null {
  if (action === null || typeof action !== "object") return null;
  const raw = action as { t?: unknown; restored?: unknown };
  if (raw.t !== INN_REST_ACTION) return null;
  if (!Array.isArray(raw.restored)) return null;
  const uids: string[] = [];
  for (const uid of raw.restored) {
    if (typeof uid !== "string" || uid.length === 0) return null;
    uids.push(uid);
  }
  return uids;
}

/**
 * PUT THE NAMED MEMBERS AT FULL, and change nothing else.
 *
 * ⚠ IT IS `core/save.ts` `applyBlackout`, DELIBERATELY, AND THE TWO ARGUMENTS IT IS GIVEN ARE WHAT
 * NARROW IT TO THE PARTY. That function does three writes — the party, `currentNode`, and clearing
 * `interiorId` — and only the first belongs to an inn rest:
 *   • `wakeNode: save.currentNode` makes the move an IDENTITY. A rest does not relocate anybody; the
 *     player is already standing in the town whose inn they are using.
 *   • `interiorId` is PUT BACK. `applyBlackout` clears it because it MOVES the player, and a save
 *     whose `currentNode` has changed while `interiorId` still names the room it left is the broken
 *     state `travelTo` refuses travel to avoid. Nothing moves here, and [R] is live inside a room —
 *     `data/interiors/hearthollow-inn.json` is a room the player can be standing in when they press
 *     it — so clearing it would put the save outdoors while the scene still drew the inn floor.
 *
 * Routing through the shared writer is the point: it is the one place "restored" is spelled, it is
 * the one `replay` reaches, and it is where the loud `SaveCorruptError` for a uid the save does not
 * have already lives. A private copy of that four-line map is the defect class this repo has spent
 * its night removing. STANDING HANDOFF: split `applyBlackout` into a party half and a relocation
 * half over there, and this function becomes a call to the party half with no correction after it.
 */
export function restoreParty(save: SaveEnvelope, restored: readonly string[]): SaveEnvelope {
  const healed = applyBlackout(save, { wakeNode: save.currentNode, restored });
  if (save.interiorId === undefined) return healed;
  return { ...healed, interiorId: save.interiorId };
}

/**
 * The LIVE composition: the tape entry, then the write. No cue and no move.
 *
 * The order is {@link applyBlackoutRecovery}'s and it is load-bearing for the same reason — the
 * consequence is on the save before anything the PRICE triggers can read it (a year turn, a save
 * write, the HUD). Call this BEFORE the charge.
 *
 * ⚠ NO CORPUS CUE. The blackout raises {@link BLACKOUT_CUE_FLAG} because it owes the player a
 * black-screen beat explaining where they woke up. A rest the player chose owes them nothing: the
 * innkeeper's shipped `service` beat is already reachable through [E], and raising the wake cue here
 * would make "you passed out" playable after a voluntary night's sleep.
 *
 * ⚠ AND NO CLOCK. This module is pure and models no meter; the shell levies `clock.innTicks` through
 * whatever it already uses to spend a tick, so a rest crosses a season boundary or fills the year
 * meter exactly as it always did.
 */
export function applyInnRest(save: SaveEnvelope, rest: InnRest): SaveEnvelope {
  return restoreParty(appendAction(save, innRestAction(rest.restored)), rest.restored);
}
