/**
 * tools/harness/player.ts — THE REASONABLE PLAYER MODEL.
 *
 * build-doc §10.5(a) asks for "a scripted 'reasonable player' party per year vs each gym roster".
 * A harness whose player model is a black box tunes toward nonsense, so the model is stated here in
 * full, in one file, and restated verbatim in the generated report. Every clause below is derived
 * from shipped data — there is no invented number anywhere in this file (G11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * THE MODEL, IN EIGHT CLAUSES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 1. WHERE THEY HAVE BEEN.  At gym `Y` the player has visited the towns of gyms 1..Y and every node
 *    adjacent to them (data/gyms.json `town` + data/nodes/*.json `adjacency`). Nothing from later
 *    acts is available. At gym 1 that is the starting town and its one route.
 *
 * 2. WHAT THEY COULD OWN.  Every line with a live population at one of those nodes that is not held
 *    behind a sign-card chain (`balance.encounter.signChainGatedHabitatTag`) and is not an Ancient
 *    (bible §4: "very hard catches, gated behind rare sign-card chains"), PLUS the starter lines —
 *    identified structurally as the lines that appear in no node's populations at all, which is
 *    exactly what "not wild-spawning; obtained from Warden Maren" means in the data.
 *
 * 3. HOW BIG THE TEAM IS.  The same size as the leader's, capped by `balance.party.maxPartySize`.
 *    Gym rosters are 4/4/5/6/6/6 including the signature, so the player fields 4/4/5/6/6/6. One
 *    slot is always a starter line — bible §8: Warden Maren hands you one and you keep it.
 *
 * 4. WHAT LEVEL.  Two models are run and both are reported, because the truth is bracketed by them
 *    and picking one silently would be the black box this file exists to avoid:
 *      · TRAINED   — the leader's rank-and-file level (`max` over `gym.slots`). A player who arrived
 *                    at parity with the gym's team and two levels under its signature.
 *      · UNTRAINED — `balance.encounter.levelByYear[Y-1]`, the level the region's own wild
 *                    population sits at in that act. A player who caught what they met and never
 *                    ground a level. On shipped data this is exactly four levels below TRAINED.
 *
 * 5. WHAT AGE.  Each member's age class is drawn from `balance.encounter.ageWeights` — the shipped
 *    wild age distribution (J 0.5 / A 0.4 / E 0.1). The team came out of the grass, so it is aged
 *    like the grass.
 *
 * 6. WHAT TRAITS.  `balance.traits.slotsPerWildCreature` per creature, drawn from
 *    `balance.traits.pool`. Elders roll the rare pool with probability
 *    `balance.traits.elderRareChance` (bible §2: "Elders roll rare traits"); everyone else rolls
 *    common — which includes the FIVE negative common traits. A wild-caught team carries its duds.
 *
 * 7. WHICH TEAM THEY FIELD.  `--party-drafts` candidate teams are drawn from the pool and the best
 *    one is kept: FIRST by how many of the leader's creatures it can hit super-effectively with a
 *    move it actually knows at this level, THEN by the team's total effective stats (`effectiveStats`
 *    from core/battle.ts, so age multipliers, the metamorphic jump, the Beast bonus and the rolled
 *    traits all count). That is a player who thought about the matchup for a minute and fielded the
 *    best animals they had — not a player who solved it. Ties keep the first draft, so the choice is
 *    a deterministic function of the seed.
 *
 * 8. HOW THEY PLAY.  The "reasonable rather than perfect" clause. It is deliberately NOT a
 *    move-choice handicap:
 *      · Move choice is the SAME greedy argmax-on-expected-damage the gym leader uses
 *        (core/battle.ts `chooseEnemyAction`). Identical on purpose — a win rate then measures the
 *        two TEAMS, not a gap between two AIs.
 *        (An earlier version of this model handicapped the player by scoring moves without the §7.4
 *        predation bonus, on the theory that bible §1's "second, learnable type chart" is something
 *        a mid-run player has not learned. That handicap is INERT and the harness proved it: the
 *        predation factor depends only on (attacker line, defender line), so it multiplies every one
 *        of an attacker's moves by the same number and cannot move the argmax. The reducer applies
 *        the bonus to the damage whether or not the chooser knew about it. The finding is in the
 *        report; the dead clause is not in the model.)
 *      · They never set up and never fish for status. Screech, Harden, Quicken, Snarl, Focus,
 *        Terrify, Burrow/Roost and Lure are all 0-power and so always score 0. A perfect player
 *        opens with Screech.
 *      · They never switch for type advantage. The only switch is the forced one after a faint,
 *        taken in party order.
 *      · They carry one salve per party member (`balance.medicine.salveItemId`) and spend one only
 *        when it BUYS something: the creature must be below `balance.medicine.salveHealFracMaxHp` of
 *        its maximum (so no healing overflows) AND the heal must exceed the damage the enemy's best
 *        move is expected to do this turn (so the turn spent healing is not simply handed over).
 *        Measured, unconditional healing at the same threshold cost the player 76 percentage points
 *        against the year-6 leader — a salve that does not outpace the incoming damage is a
 *        surrendered turn, and a reasonable player learns that fast. No tonics.
 *      · The policy consumes ZERO rng draws, exactly like the enemy policy. A reported win rate is
 *        therefore a property of the numbers, not of a dice-rolling AI.
 *
 * WHAT THE MODEL DELIBERATELY DOES NOT DO, and which way each omission pushes the win rate:
 *      · no switching for type advantage                          (pushes DOWN)
 *      · no setup moves, no status fishing, no Lure               (pushes DOWN)
 *      · no tonics; one salve per member and only when it pays    (pushes DOWN)
 *      · no relics, no boons, no inherited second trait slot      (pushes DOWN)
 *      · the pool is the whole wild roster, so a draft can field a Producer or a Scavenger (DOWN)
 *      · the team is drafted best-of-N rather than caught one by one (pushes UP)
 *      · every member is at the same level, none benched under-levelled (pushes UP)
 *      · the player seat itself is worth a great deal: an exact Speed tie resolves in the player's
 *        favour and a replacement enemy does not act on the turn it enters (pushes UP — see the
 *        mirror-match measurement in the report)
 */

import { effectiveStats, movesKnownAt, typeMultiplier } from "../../core/battle";
import type { BattleContext } from "../../core/battle";
import type { Rng } from "../../core/rng";
import { AGE_CLASSES, STAT_KEYS } from "../../core/types";
import type {
  AgeClass,
  Balance,
  BattleAction,
  BattlerSpec,
  GymLeader,
  GymTeamSlot,
  SpeciesLine,
  Trait,
} from "../../core/types";
import type { ActionPolicy } from "./arena";
import { bestMoveId, expectedDamageOf } from "./arena";
import type { LoadedContent } from "./content";

/** The two level models of clause 4. */
export const LEVEL_MODELS = ["trained", "untrained"] as const;
export type LevelModel = (typeof LEVEL_MODELS)[number];

/* ────────────────────────────────────────────────────────────────────────────
 * Clause 1–2 — where the player has been, and what they could own
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Clause 1: the town of every gym up to `act`, plus each town's adjacent nodes.
 *
 * The parameter was called `year` and always meant this — the harness has read `gyms.json`'s index
 * as "how far along the player is" since it was written, which is the evidence that the field was
 * never a calendar year (D-Q3-1). It is named for what it is now.
 */
export function actNodeIds(act: number, loaded: LoadedContent): string[] {
  const byId = new Map(loaded.nodes.map((n) => [n.id, n]));
  const out = new Set<string>();
  for (const gym of loaded.gyms) {
    if (gym.act > act) continue;
    const town = byId.get(gym.town);
    if (!town) continue;
    out.add(town.id);
    for (const adj of town.adjacency) if (byId.has(adj)) out.add(adj);
  }
  return [...out].sort();
}

/** The lines that appear in no node's populations — data's own definition of "not wild-spawning". */
export function starterLines(loaded: LoadedContent): SpeciesLine[] {
  const wild = new Set<string>();
  for (const node of loaded.nodes) for (const id of Object.keys(node.populations)) wild.add(id);
  return loaded.content.species.filter((line) => !line.ancient && !wild.has(line.id));
}

/** Clause 2: the pool a reasonable player at gym `act` could have drawn their team from. */
export function candidateLines(act: number, loaded: LoadedContent): SpeciesLine[] {
  const gatedTag = loaded.balance.encounter.signChainGatedHabitatTag;
  const ids = new Set<string>();
  for (const nodeId of actNodeIds(act, loaded)) {
    const node = loaded.nodes.find((n) => n.id === nodeId);
    if (!node) continue;
    for (const [lineId, pop] of Object.entries(node.populations)) {
      if (pop.count <= 0) continue;
      const line = loaded.species.byId.get(lineId);
      if (!line || line.ancient) continue;
      if (line.habitat.includes(gatedTag)) continue;
      ids.add(lineId);
    }
  }
  const wild = loaded.content.species.filter((line) => ids.has(line.id));
  return [...starterLines(loaded), ...wild].sort((a, b) => a.id.localeCompare(b.id));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Clauses 3–6 — building the team
 * ──────────────────────────────────────────────────────────────────────────── */

/** The leader's whole team, signature last (bible §7 roster sizes 4/4/5/6/6/6). */
export function gymRoster(gym: GymLeader): GymTeamSlot[] {
  return [...gym.slots, gym.signature];
}

/** Clause 3. */
export function partySizeFor(gym: GymLeader, balance: Balance): number {
  return Math.min(gymRoster(gym).length, balance.party.maxPartySize);
}

/** Clause 4. */
export function playerLevelFor(gym: GymLeader, balance: Balance, model: LevelModel): number {
  if (model === "trained") {
    return gym.slots.reduce((best, slot) => Math.max(best, slot.level), 1);
  }
  /*
   * `balance.encounter.levelByYear` is indexed by the leader's ACT here, and always was — the array
   * was tuned against the gym ramp in data/gyms.json (its own `_levelByYear` note says so), which is
   * an act ladder. `game/encounters.ts` `rollLevel` now indexes it by the ACT too (D-Q3-10): it used
   * to read the CALENDAR YEAR, which under an unbounded decoupled calendar put a player still in
   * act 1 against level 34–38 wild creatures by year 6. So the two readings agree and this model's
   * UNTRAINED player is the one the overworld actually produces. The KEY keeps its shipped name —
   * renaming it is data + core/types.ts + core/schemas.ts + this file, and is a mechanical
   * follow-up rather than part of the change that found it.
   */
  const byAct = balance.encounter.levelByYear;
  const level = byAct[gym.act - 1] ?? byAct[byAct.length - 1];
  return Math.max(balance.encounter.minLevel, level ?? balance.encounter.minLevel);
}

/** Clause 5 — the shipped wild age distribution. */
function rollAge(balance: Balance, rng: Rng): AgeClass {
  return rng.pickWeighted([...AGE_CLASSES], (age) => balance.encounter.ageWeights[age]) ?? "A";
}

/** Clause 6 — one wild trait, rare pool only for Elders. */
function rollTraits(age: AgeClass, balance: Balance, rng: Rng): Trait[] {
  const out: Trait[] = [];
  for (let i = 0; i < balance.traits.slotsPerWildCreature; i++) {
    const rare = age === "E" && rng.chance(balance.traits.elderRareChance);
    const pool = balance.traits.pool.filter((t) => (t.rarity === "rare") === rare);
    const picked = rng.pick(pool.length > 0 ? pool : balance.traits.pool);
    if (picked) out.push({ ...picked });
  }
  return out;
}

/**
 * Clause 7's first key — how many of the leader's creatures this draft can hit super-effectively
 * with a move it actually knows at this level.
 */
export function coverageScore(
  draft: readonly SpeciesLine[],
  level: number,
  gym: GymLeader,
  ctx: BattleContext,
): number {
  const balance = ctx.balance;
  let covered = 0;
  for (const slot of gymRoster(gym)) {
    const defenderLine = ctx.species.get(slot.lineId);
    if (!defenderLine) continue;
    const defenderTypes = defenderLine.types[slot.age];
    const hit = draft.some((line) =>
      movesKnownAt(line, level, balance).some((moveId) => {
        const move = ctx.moves.get(moveId);
        if (!move || move.power <= 0) return false;
        return typeMultiplier(move.type, defenderTypes, ctx.typeChart, balance).band === "super";
      }),
    );
    if (hit) covered += 1;
  }
  return covered;
}

/**
 * Clause 7's second key — the draft's total effective stats, through core/battle.ts's own
 * `effectiveStats`, so the age multiplier, the metamorphic jump, the Beast base-stat bonus and the
 * rolled traits are all counted exactly as the reducer counts them.
 */
export function draftStrength(
  draft: readonly SpeciesLine[],
  ages: readonly AgeClass[],
  traits: readonly Trait[][],
  level: number,
  balance: Balance,
): number {
  let total = 0;
  draft.forEach((line, i) => {
    const stats = effectiveStats({
      line,
      age: ages[i] ?? "A",
      level,
      balance,
      traits: traits[i] ?? [],
    });
    for (const key of STAT_KEYS) total += stats[key];
  });
  return total;
}

/** Draw `count` distinct lines from `pool`, uniformly, consuming the seeded stream. */
function sampleDistinct(pool: readonly SpeciesLine[], count: number, rng: Rng): SpeciesLine[] {
  const remaining = [...pool];
  const out: SpeciesLine[] = [];
  while (out.length < count && remaining.length > 0) {
    const i = rng.int(0, remaining.length);
    const [picked] = remaining.splice(i, 1);
    if (picked) out.push(picked);
  }
  return out;
}

/** Clause 3 — one slot is always a starter, then the rest of the team from the act's pool. */
function draftLines(
  pool: readonly SpeciesLine[],
  starters: readonly SpeciesLine[],
  size: number,
  rng: Rng,
): SpeciesLine[] {
  const starter = rng.pick(starters);
  if (!starter) return sampleDistinct(pool, size, rng);
  const rest = sampleDistinct(
    pool.filter((line) => line.id !== starter.id),
    Math.max(0, size - 1),
    rng,
  );
  return [starter, ...rest];
}

export interface DraftedParty {
  specs: BattlerSpec[];
  lineIds: string[];
  level: number;
  coverage: number;
  /** How many of the leader's creatures the draft covers, out of the roster size. */
  rosterSize: number;
}

/**
 * Build the party a reasonable player fields against `gym`.
 *
 * `drafts` candidate teams are drawn and the best-covering one is fielded — "a player who thought
 * about it for a minute", not "a player who solved it". Ties keep the first draft, so the choice is
 * a deterministic function of the seed.
 */
export function draftParty(
  gym: GymLeader,
  loaded: LoadedContent,
  rng: Rng,
  drafts: number,
  model: LevelModel,
  levelOffset = 0,
  /** Force every member to one age class — the control that prices `balance.encounter.ageWeights`. */
  forcedAge?: AgeClass,
  /** Override clause 3's party size — the control that prices "the player brought a full team". */
  forcedSize?: number,
): DraftedParty {
  const balance = loaded.balance;
  const pool = candidateLines(gym.act, loaded);
  if (pool.length === 0) throw new Error(`tools/harness: no candidate species for gym "${gym.id}"`);
  const starters = starterLines(loaded);
  const size = Math.min(forcedSize ?? partySizeFor(gym, balance), pool.length, balance.party.maxPartySize);
  // The level cap is a real ceiling (`makeBattler` clamps to it), so the reported level must be
  // clamped here too — a sweep cell that says L46 when the creature fights at 40 is a lie.
  const level = Math.min(balance.xp.levelCap, Math.max(1, playerLevelFor(gym, balance, model) + levelOffset));

  let bestLines: SpeciesLine[] = [];
  let bestAges: AgeClass[] = [];
  let bestTraits: Trait[][] = [];
  let bestCoverage = -1;
  let bestStrength = -1;
  for (let attempt = 0; attempt < drafts; attempt++) {
    const lines = draftLines(pool, starters, size, rng);
    const ages = lines.map(() => forcedAge ?? rollAge(balance, rng));
    const traits = ages.map((age) => rollTraits(age, balance, rng));
    const coverage = coverageScore(lines, level, gym, loaded.battle);
    const strength = draftStrength(lines, ages, traits, level, balance);
    // Clause 7: coverage first, raw quality second, first draft wins a tie.
    const better = coverage > bestCoverage || (coverage === bestCoverage && strength > bestStrength);
    if (better) {
      bestCoverage = coverage;
      bestStrength = strength;
      bestLines = lines;
      bestAges = ages;
      bestTraits = traits;
    }
  }

  const specs: BattlerSpec[] = bestLines.map((line, i) => ({
    uid: `p${i}`,
    lineId: line.id,
    age: bestAges[i] ?? "A",
    level,
    traits: bestTraits[i] ?? [],
  }));

  return {
    specs,
    lineIds: bestLines.map((l) => l.id),
    level,
    coverage: bestCoverage,
    rosterSize: gymRoster(gym).length,
  };
}

/** The leader's team as battler specs. Content, verbatim from data/gyms.json (G2). */
export function gymParty(gym: GymLeader): BattlerSpec[] {
  return gymRoster(gym).map((slot, i) => {
    const spec: BattlerSpec = {
      uid: `e${i}`,
      lineId: slot.lineId,
      age: slot.age,
      level: slot.level,
      traits: (slot.traits ?? []).map((t) => ({ ...t })),
    };
    if (slot.nickname !== undefined) spec.nickname = slot.nickname;
    return spec;
  });
}

/** The bag a reasonable player carries into a gym: one salve per party member, nothing else. */
export function gymBag(partySize: number, balance: Balance): Record<string, number> {
  return { [balance.medicine.salveItemId]: partySize };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Clause 8 — the policy
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The reasonable player's action policy. Pure and draw-free: the same state always yields the same
 * action, so the win rate a seed produces is reproducible from the seed alone.
 */
export function reasonablePolicy(nodeId?: string): ActionPolicy {
  return (state, ctx): BattleAction => {
    const balance = ctx.balance;
    const active = state.battlers[state.activePlayerUid];
    const enemy = state.battlers[state.activeEnemyUid];
    if (!active || !enemy) throw new Error("tools/harness: the field is empty");

    // Forced switch — the reducer accepts nothing else while the active creature is down.
    if (active.fainted) {
      const next = state.playerOrder.find((uid) => state.battlers[uid]?.fainted === false);
      if (next === undefined) throw new Error("tools/harness: nothing left to switch to");
      return { kind: "switch", uid: next };
    }

    // A salve, but only when it buys a turn: nothing overflows AND the heal outpaces the hit.
    const salveId = balance.medicine.salveItemId;
    const salvesLeft = state.bag[salveId] ?? 0;
    const hpFrac = active.maxHp === 0 ? 0 : active.curHp / active.maxHp;
    if (salvesLeft > 0 && hpFrac < balance.medicine.salveHealFracMaxHp) {
      const heal = Math.floor(active.maxHp * balance.medicine.salveHealFracMaxHp);
      const incoming = expectedIncoming(enemy, active, ctx, nodeId);
      if (heal > incoming) return { kind: "item", itemId: salveId, targetUid: active.uid };
    }

    // Otherwise: hit it, with the same greedy argmax the leader's own AI uses.
    return { kind: "move", moveId: bestMoveId(active, enemy, ctx, { usePredation: true, nodeId }) };
  };
}

/** What the enemy's best move is expected to do to `defender` this turn (mid-roll, no crit). */
function expectedIncoming(
  attacker: NonNullable<Parameters<typeof bestMoveId>[0]>,
  defender: NonNullable<Parameters<typeof bestMoveId>[1]>,
  ctx: BattleContext,
  nodeId?: string,
): number {
  const moveId = bestMoveId(attacker, defender, ctx, { usePredation: true, nodeId });
  const move = ctx.moves.get(moveId);
  if (!move) return 0;
  return expectedDamageOf(attacker, defender, move, ctx, { usePredation: true, nodeId });
}
