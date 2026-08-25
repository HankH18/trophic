/**
 * core/battle.ts — the TROPHIC battle reducer.
 *
 * build-doc §7.4: "Battle is a pure reducer: `(BattleState, Action, rng) => {state, events[]}`.
 * The Phaser scene replays `events[]`. Test surface = feed action scripts headless."
 * build-doc §15 lane A3. Locked decision L11: pure TypeScript, ZERO engine imports.
 *
 * PURITY CONTRACT
 *   `step()` never mutates its input: it deep-clones the state, works on the clone, and returns it.
 *   Every random decision is drawn from the injected rng — there is no `Math.random` anywhere in
 *   this file (guardrail G11 / build-doc §8.1), and no clock, no I/O, no rendering.
 *
 * CONSTANTS (G11 / INV-4)
 *   No gameplay number is written in this file. Everything is read from `data/balance.json`
 *   (typed as `Balance`, whose `battle` group was merged in at integration from the lane's former
 *   `data/balance.additions.A3.json`) or from the content JSON. The only bare numerals below are
 *   structural identities that appear in the build-doc formulas themselves (the `1 +` of
 *   `1 + 0.02×level`, the 0 floor on hit points, `turn + 1`, and `ABSENT` — the multiplicative
 *   identity for a factor that does not apply), never a tunable. In particular `types.neutral` is
 *   the type chart's neutral multiplier and is never reused as "×nothing": it is a tunable the
 *   balance harness moves, and a second job would make moving it break unrelated systems (INV-3).
 *
 * RENDERER CONTRACT (build-doc §15 C3)
 *   The scene NARRATES from `events[]` and READS numbers off `BattleState`. Every delta is in the
 *   log (damage, heal, status chip, stat mod applied AND expired), so replaying it from the state
 *   at the start of a step reproduces the state at the end; absolutes (HP, maxHp, level, form name,
 *   types, `statMods`, `lureActive`) are read from the state. See docs/DEVIATIONS-lane-a3.md for
 *   the three events the `BattleEvent` union cannot express yet.
 *
 * RNG DRAW ORDER (fixed, so a scripted stream is hand-checkable; tests depend on it)
 *   per acting battler:  1. Daze skip roll (only when the actor's status is Daze)
 *                        2. damage roll, then crit roll (only for a move with power > 0)
 *                        3. one roll per `move.effects` entry that carries a `chance`
 *   snare: up to `balance.catch.shakes` rolls (stops at the first failed shake)
 *   flee:  exactly one roll.
 *   Nothing else consumes the stream — the enemy policy is deterministic argmax (see
 *   `chooseEnemyAction`), and turn order breaks exact ties in the player's favour rather than
 *   spending a draw. An `evade` move (bible §3 Burrow/Roost) resolves before the opponent's action,
 *   which spends no draw either.
 */

import { MOVE_SLOTS, STAT_KEYS } from "./types";
import type {
  ActiveStatus,
  AgeClass,
  BaitMatch,
  Balance,
  BattleAction,
  BattleEvent,
  BattleInput,
  BattleOutcome,
  BattleState,
  BattleStepResult,
  Battler,
  BattlerSpec,
  Boon,
  EffectivenessBand,
  FoodWeb,
  ModifiableStatKey,
  MoveDef,
  MovesFile,
  Role,
  SnareTier,
  SpeciesLine,
  Stats,
  StatusName,
  Trait,
  TypeChart,
  TypeName,
} from "./types";
// build-doc §8.3 `no_shadow_tables` — "no file other than core/foodweb.ts may compute diet edges".
// battle.ts states no part of the §7.2 bait rule itself; it hands foodweb.ts back the edges the
// oracle already derived and reads the answer (see `baitMatchOf`).
import { baitMatchFor, indexSpecies, type EcoNode, type SpeciesIndex } from "./foodweb";

/* ════════════════════════════════════════════════════════════════════════════
 * 1. The two interfaces battle.ts needs from other lanes.
 *
 * Lane A2 owns core/rng.ts and core/foodweb.ts. Neither existed when this module was written, so
 * battle.ts declares the NARROW slice it needs and takes it by injection: it writes no RNG of its
 * own (G11) and derives no diet edges of its own (G3 / build-doc §8.3 `no_shadow_tables`).
 * The one thing it no longer takes by injection is the §7.2 BAIT RULE — `baitMatchOf` calls
 * foodweb.ts's `baitMatchFor` directly, because an optional hook that callers forget to wire is a
 * duplicate rule waiting to drift, and an agreement test is not the same as being unable to differ.
 * ════════════════════════════════════════════════════════════════════════════ */

/** build-doc §8.1 — the seeded stream, narrowed to the one operation battle needs. */
export interface BattleRng {
  /** Uniform float in [0, 1). */
  float(): number;
}

/**
 * Shapes accepted by {@link asBattleRng}. core/rng.ts may name its unit-interval draw `float`,
 * `nextFloat` or `next`, or hand back a bare closure; all four wire up without an adapter written
 * at the call site. A source that returns something outside [0,1) — a raw uint32, say — throws
 * LOUDLY rather than silently producing plausible-looking damage.
 */
export type RngSource =
  | BattleRng
  | { nextFloat(): number }
  | { next(): number }
  | (() => number);

export function asBattleRng(src: RngSource): BattleRng {
  let draw: () => number;
  if (typeof src === "function") {
    draw = src;
  } else if (typeof (src as BattleRng).float === "function") {
    draw = () => (src as BattleRng).float();
  } else if (typeof (src as { nextFloat(): number }).nextFloat === "function") {
    draw = () => (src as { nextFloat(): number }).nextFloat();
  } else if (typeof (src as { next(): number }).next === "function") {
    draw = () => (src as { next(): number }).next();
  } else {
    throw new Error(
      "core/battle.ts: the RNG source exposes none of float() / nextFloat() / next() and is not " +
        "callable. Pass core/rng.ts's seeded battle stream (build-doc §8.1).",
    );
  }
  return {
    float(): number {
      const v = draw();
      if (!(typeof v === "number" && v >= 0 && v < 1)) {
        throw new Error(
          `core/battle.ts: the RNG source returned ${String(v)}, which is not a float in [0, 1). ` +
            "battle.ts consumes unit-interval draws only — adapt core/rng.ts's integer stream " +
            "before passing it in.",
        );
      }
      return v;
    },
  };
}

/**
 * build-doc §7.4 — "predation = 1.25 if attacker's derived diet includes defender's line", and
 * bible §1 — "the web is a second, learnable type chart".
 *
 * The web is DERIVED (core/foodweb.ts, build-doc §7.3); battle.ts only reads the derivation. This
 * oracle is the read interface. G3: constructing one from anything other than foodweb.ts's output
 * would be a second diet table.
 */
export interface PredationOracle {
  /**
   * True iff `predatorLineId`'s derived diet at `nodeId` contains `preyLineId`.
   *
   * build-doc §7.3 derives edges PER NODE, so the node the battle happens at is part of the
   * question: `Skir eats Nibbin` can be true at R1 and false at a node where neither lives. When
   * `nodeId` is omitted (or names a node the oracle was not built with) the answer falls back to
   * the union of every web the oracle holds.
   */
  eats(predatorLineId: string, preyLineId: string, nodeId?: string): boolean;
  /** The derived diet of `predatorLineId` at `nodeId` — used for bait matching (build-doc §7.2). */
  dietOf(predatorLineId: string, nodeId?: string): readonly string[];
  /** `FoodWeb.floraFeeders` — the lines that graze the node's abstract flora stock. */
  feedsOnFlora?(lineId: string, nodeId?: string): boolean;
  /**
   * core/foodweb.ts exposes the same §7.2 bait lookup as `baitMatchFor`. A caller wired to it
   * should pass it here so the two never drift; when it is absent, {@link baitMatchOf} routes the
   * oracle's own edges through that very function rather than restating the rule.
   */
  baitMatch?(baitTag: string | undefined, targetLineId: string, nodeId?: string): BaitMatch;
}

/** One node's slice of the derivation, plus the union used when the battle names no node. */
interface WebView {
  diets: Map<string, Set<string>>;
  flora: Set<string>;
}

function addEdges(view: WebView, web: FoodWeb): void {
  for (const [predator, prey] of Object.entries(web.edges)) {
    let set = view.diets.get(predator);
    if (!set) {
      set = new Set<string>();
      view.diets.set(predator, set);
    }
    for (const p of prey) set.add(p);
  }
  for (const feeder of web.floraFeeders) view.flora.add(feeder);
}

/**
 * The ONLY sanctioned way to build an oracle: read `FoodWeb.edges` as produced by
 * core/foodweb.ts. Pass every web the battle could touch (the encounter's node is enough for a
 * wild battle; a gym battle may be handed the union of the region's webs).
 *
 * Each web is kept UNDER ITS OWN `nodeId` as well as folded into the union, so a battle that knows
 * where it is happening (`BattleState.nodeId`) gets that node's derivation and nothing else — the
 * union would otherwise apply the §7.4 predation bonus to pairs no single node's web contains.
 */
export function predationOracleFromWebs(webs: readonly FoodWeb[]): PredationOracle {
  const byNode = new Map<string, WebView>();
  const union: WebView = { diets: new Map(), flora: new Set() };
  for (const web of webs) {
    let view = byNode.get(web.nodeId);
    if (!view) {
      view = { diets: new Map(), flora: new Set() };
      byNode.set(web.nodeId, view);
    }
    addEdges(view, web);
    addEdges(union, web);
  }
  const viewFor = (nodeId?: string): WebView =>
    (nodeId === undefined ? undefined : byNode.get(nodeId)) ?? union;
  return {
    eats: (predatorLineId, preyLineId, nodeId) =>
      viewFor(nodeId).diets.get(predatorLineId)?.has(preyLineId) ?? false,
    dietOf: (predatorLineId, nodeId) => [...(viewFor(nodeId).diets.get(predatorLineId) ?? [])],
    feedsOnFlora: (lineId, nodeId) => viewFor(nodeId).flora.has(lineId),
  };
}

/**
 * A placeholder for callers that have not wired core/foodweb.ts yet. It THROWS on use — a battle
 * that silently reported "no predation" would quietly delete a documented 1.25× from the game and
 * nothing would go red.
 */
export function unwiredPredationOracle(): PredationOracle {
  const fail = (): never => {
    throw new Error(
      "core/battle.ts: no PredationOracle wired. Derive the node's FoodWeb with core/foodweb.ts " +
        "and pass predationOracleFromWebs([web]) — build-doc §7.4 predation, G3.",
    );
  };
  return { eats: fail, dietOf: fail };
}

/* ════════════════════════════════════════════════════════════════════════════
 * 2. Context — the validated content the reducer reads. Never mutated.
 * ════════════════════════════════════════════════════════════════════════════ */

/** The slice of `Content` (core/schemas.ts `validateContent()`) that battle.ts reads. */
export interface BattleContent {
  species: readonly SpeciesLine[];
  moves: MovesFile;
  balance: Balance;
}

export interface BattleContext {
  species: ReadonlyMap<string, SpeciesLine>;
  /** The same lines as `species`, in the shape core/foodweb.ts's §7.2 bait rule takes. */
  speciesIndex: SpeciesIndex;
  moves: ReadonlyMap<string, MoveDef>;
  typeChart: TypeChart;
  balance: Balance;
  predation: PredationOracle;
  /**
   * Turns a Burrow/Roost evade lasts. bible §3 names the move ("skip turn, +evasion") without a
   * duration, so the number is a tunable and lives in `balance.battle.evadeTurns` (G11).
   */
  evadeTurns: number;
  /**
   * Turns a status survives when `balance.status.persistUntilCured` is FALSE. The shipped flag is
   * true, so this is inert at ship; it exists because a tunable nothing reads is a knob that lies
   * (build-doc §6 INV-3). Same data home as `evadeTurns`.
   */
  statusWearOffTurns: number;
}

/** The `battle` group's keys — declared once so a typo cannot reach the lookup below. */
type BattleTunableKey = keyof Balance["battle"];

/**
 * build-doc §6 INV-3/INV-4 — read a `battle` tunable from data/balance.json's `battle` group.
 *
 * The group was merged in at integration; there is deliberately NO fallback source any more. A
 * missing, mistyped or half-merged group THROWS rather than substituting a default, because the
 * failure this guards against is exactly a retune of balance.json that looks applied and is not:
 * `zBalance` parses with `z.object` and STRIPS keys it does not declare, so a group present in the
 * file but absent from the schema would arrive here as `undefined`. Loud is the only safe answer.
 */
function battleTunable(balance: Balance, key: BattleTunableKey): number {
  const group = (balance as unknown as Record<string, unknown>)["battle"];
  if (group === undefined) {
    throw new Error(
      "core/battle.ts: balance.battle is missing. data/balance.json must carry the `battle` group " +
        "AND core/schemas.ts zBalance must declare it — z.object strips undeclared keys, so a " +
        "group in the file that the schema does not know about never reaches this reader (INV-3).",
    );
  }
  if (typeof group !== "object" || group === null) {
    throw new Error(
      `core/battle.ts: balance.battle is ${typeof group}, not an object.`,
    );
  }
  const value = (group as Record<string, unknown>)[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(
    `core/battle.ts: balance.battle.${key} is ${String(value)}, not a finite number. The group ` +
      "must carry every key core/types.ts `Balance[\"battle\"]` declares — a half-merge makes " +
      "retuning balance.json a no-op (INV-3).",
  );
}

export function makeBattleContext(content: BattleContent, predation: PredationOracle): BattleContext {
  const species = new Map<string, SpeciesLine>();
  for (const line of content.species) species.set(line.id, line);
  const moves = new Map<string, MoveDef>();
  for (const move of content.moves.moves) moves.set(move.id, move);
  return {
    species,
    speciesIndex: indexSpecies([...content.species]),
    moves,
    typeChart: content.moves.typeChart,
    balance: content.balance,
    predation,
    evadeTurns: battleTunable(content.balance, "evadeTurns"),
    statusWearOffTurns: battleTunable(content.balance, "statusWearOffTurns"),
  };
}

/**
 * build-doc §7.4's exact reducer signature, closed over the content. The Phaser scene, the
 * fixtures and the balance harness all take one of these.
 */
export function createBattleEngine(ctx: BattleContext): {
  start(input: BattleInput): BattleStepResult;
  step(state: BattleState, action: BattleAction, rng: RngSource): BattleStepResult;
} {
  return {
    start: (input) => startBattle(input, ctx),
    step: (state, action, rng) => step(state, action, rng, ctx),
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 * 3. Small helpers.
 * ════════════════════════════════════════════════════════════════════════════ */

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`core/battle.ts: ${what}`);
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function lineOf(ctx: BattleContext, lineId: string): SpeciesLine {
  return must(ctx.species.get(lineId), `unknown species line "${lineId}" (data/species.json)`);
}

function moveOf(ctx: BattleContext, moveId: string): MoveDef {
  return must(ctx.moves.get(moveId), `unknown move "${moveId}" (data/moves.json)`);
}

function magnitudeOf(ctx: BattleContext, key: string): number {
  return must(
    ctx.balance.moveEffects.magnitude[key],
    `move-effect magnitude "${key}" is not in balance.moveEffects.magnitude`,
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * 4. Effective stats — build-doc §7.4 / bible §2.
 *
 *   Effective stat = base × ageMult × (1 + 0.02 × level) + traitMods
 *   ageMult .75 / 1.0 / 1.15; a metamorphic line adds ×1.15 ONCE at the J→A transition;
 *   Beast gets +10% BASE stats instead of an offensive type advantage (bible §1).
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * build-doc §7.4 — "metamorphic J→A adds ×1.15 once". The jump is a boolean factor, never an
 * accumulator, so it cannot apply twice: an Elder of a metamorphic line carries exactly one.
 * `explicit` is `BattlerSpec.metamorphosed` / `OwnedCreature.metamorphosed`; when it is absent the
 * age answers, because bible §4 says wild adults of a metamorphic line only appear evolved.
 */
export function hasMetamorphosed(line: SpeciesLine, age: AgeClass, explicit?: boolean): boolean {
  if (!line.metamorphic) return false;
  return explicit ?? age !== "J";
}

export interface EffectiveStatArgs {
  line: SpeciesLine;
  age: AgeClass;
  level: number;
  balance: Balance;
  traits?: readonly Trait[];
  boons?: readonly Boon[];
  metamorphosed?: boolean;
}

export function effectiveStats(args: EffectiveStatArgs): Stats {
  const { line, age, level, balance } = args;
  const types = line.types[age];
  // bible §1 — Beast is strong vs nothing and gets +10% base stats instead.
  const beastMult = types.includes("Beast") ? 1 + balance.types.beastBaseStatBonus : 1;
  const ageMult = balance.age.multiplier[age];
  const metaMult = hasMetamorphosed(line, age, args.metamorphosed) ? balance.age.metamorphicJump : 1;
  const levelMult = 1 + balance.stats.levelCoefficient * level;

  const out: Stats = { hp: 0, atk: 0, def: 0, spd: 0, ins: 0 };
  for (const key of STAT_KEYS) {
    const raw = line.baseStats[key] * beastMult * ageMult * metaMult * levelMult;
    // bible §2 — "Traits: flat ±10% modifiers with names"; build-doc §7.4 adds them after the
    // multiplicative chain, so the ±10% is taken against the pre-trait effective stat.
    let mods = 0;
    for (const trait of args.traits ?? []) {
      if (trait.stat !== key) continue;
      mods += raw * balance.stats.traitModPct * (trait.direction === "up" ? 1 : -1);
    }
    // build-doc §7.5 step 3 — a retirement BOON is a permanent +10% to one stat.
    for (const boon of args.boons ?? []) {
      if (boon.stat !== key) continue;
      mods += raw * balance.stats.boonModPct;
    }
    out[key] = Math.max(1, Math.round(raw + mods));
  }
  return out;
}

/** bible §3 — "4 move slots … unlocked at levels 1/5/10/15" (levels live in balance.json). */
export function movesKnownAt(line: SpeciesLine, level: number, balance: Balance): string[] {
  const known: string[] = [];
  for (const slot of MOVE_SLOTS) {
    if (level >= balance.moves.slotUnlockLevels[slot]) known.push(line.movePool[slot]);
  }
  return known;
}

/** The move a level-up unlocks, if that level is exactly a slot's unlock level. */
function moveUnlockedAt(line: SpeciesLine, level: number, balance: Balance): string | undefined {
  for (const slot of MOVE_SLOTS) {
    if (balance.moves.slotUnlockLevels[slot] === level) return line.movePool[slot];
  }
  return undefined;
}

/* ════════════════════════════════════════════════════════════════════════════
 * 5. Battlers.
 *
 * `Battler` (core/types.ts, read-only to this lane) carries no XP field and no boons, but the
 * reducer must accumulate XP across a multi-enemy fight and must be able to RECOMPUTE stats on a
 * level-up without losing a retirement boon. Rather than edit another lane's file, battle.ts
 * extends the interface additively; `BattleBattler` is assignable to `Battler`, so a
 * `BattleState` full of them is still exactly the build-doc §7.4 shape.
 * ════════════════════════════════════════════════════════════════════════════ */

export interface BattleBattler extends Battler {
  /** XP banked toward the next level (build-doc §7.4 XP curve). */
  xp: number;
  /** build-doc §7.5 — permanent +10% boons, needed to rebuild stats on level-up. */
  boons: Boon[];
  /**
   * build-doc §7.4 — whether this individual carries the metamorphic ×1.15. Resolved ONCE at
   * construction from `BattlerSpec.metamorphosed` (falling back to the age, per bible §4) and then
   * carried, so a mid-battle level-up recomputes the same creature it started as. `Battler`
   * (core/types.ts, another lane's file) has no field for it, which is exactly how a battler specced
   * `metamorphosed:false` used to gain a phantom 15% on its first level-up.
   */
  metamorphosed?: boolean;
}

export function xpOf(battler: Battler): number {
  return (battler as Partial<BattleBattler>).xp ?? 0;
}

export function boonsOf(battler: Battler): readonly Boon[] {
  return (battler as Partial<BattleBattler>).boons ?? [];
}

/**
 * The metamorphic latch this battler was BUILT with. `undefined` on a hand-assembled `Battler`
 * (a save-file state, a test double) — the caller then falls back to the age, which is what
 * {@link hasMetamorphosed} does with an absent flag.
 */
export function metamorphosedOf(battler: Battler): boolean | undefined {
  return (battler as Partial<BattleBattler>).metamorphosed;
}

function asBattleBattler(battler: Battler): BattleBattler {
  const b = battler as BattleBattler;
  return b.xp === undefined || b.boons === undefined
    ? { ...b, xp: b.xp ?? 0, boons: b.boons ?? [] }
    : b;
}

const NO_STAT_MODS = (): Record<ModifiableStatKey, number> => ({ atk: 1, def: 1, spd: 1, ins: 1 });

export function makeBattler(
  spec: BattlerSpec,
  side: "player" | "enemy",
  ctx: BattleContext,
  opts: { isWild: boolean; enteredOnTurn: number },
): BattleBattler {
  const line = lineOf(ctx, spec.lineId);
  const level = clamp(spec.level, 1, ctx.balance.xp.levelCap);
  // Resolve the latch ONCE here (spec flag, else the age per bible §4) and carry it, so every later
  // stat recompute — a level-up, above all — is the same creature.
  const metamorphosed = hasMetamorphosed(line, spec.age, spec.metamorphosed);
  const stats = effectiveStats({
    line,
    age: spec.age,
    level,
    balance: ctx.balance,
    traits: spec.traits,
    boons: spec.boons,
    metamorphosed,
  });
  const maxHp = stats.hp;
  return {
    uid: spec.uid,
    lineId: spec.lineId,
    formName: line.formNames[spec.age],
    ...(spec.nickname === undefined ? {} : { nickname: spec.nickname }),
    age: spec.age,
    level,
    types: [...line.types[spec.age]],
    role: line.role[spec.age],
    stats,
    maxHp,
    curHp: spec.curHp === undefined ? maxHp : clamp(spec.curHp, 0, maxHp),
    status: null,
    statMods: NO_STAT_MODS(),
    statModTurns: {},
    moves: spec.moves ? [...spec.moves] : movesKnownAt(line, level, ctx.balance),
    traits: spec.traits.map((t) => ({ ...t })),
    side,
    isWild: opts.isWild,
    fainted: spec.curHp === 0,
    enteredOnTurn: opts.enteredOnTurn,
    xp: 0,
    boons: (spec.boons ?? []).map((b) => ({ ...b })),
    metamorphosed,
  };
}

/** build-doc §7.4 — the wild side of a wild/ancient encounter is the catchable one. */
function enemyIsWild(kind: BattleInput["kind"]): boolean {
  return kind === "wild" || kind === "ancient";
}

export function startBattle(input: BattleInput, ctx: BattleContext): BattleStepResult {
  if (input.playerParty.length === 0 || input.enemyParty.length === 0) {
    throw new Error("core/battle.ts: startBattle needs at least one battler on each side.");
  }
  const battlers: Record<string, Battler> = {};
  const playerOrder: string[] = [];
  const enemyOrder: string[] = [];
  const wild = enemyIsWild(input.kind);
  for (const spec of input.playerParty) {
    battlers[spec.uid] = makeBattler(spec, "player", ctx, { isWild: false, enteredOnTurn: 1 });
    playerOrder.push(spec.uid);
  }
  for (const spec of input.enemyParty) {
    battlers[spec.uid] = makeBattler(spec, "enemy", ctx, { isWild: wild, enteredOnTurn: 1 });
    enemyOrder.push(spec.uid);
  }
  // A party may CARRY fainted members (a spec with curHp 0) but may not be made only of them: the
  // reducer would field a corpse, every action would be a legal no-op and no outcome could ever be
  // reached. The active battler is therefore the first STANDING one on each side, and a side with
  // none is a caller error in the same class as an empty party — loud, not silently unplayable.
  const standing = (order: readonly string[]): string | undefined =>
    order.find((uid) => battlers[uid]?.fainted === false);
  const activePlayerUid = must(
    standing(playerOrder),
    "startBattle: every battler in the player party is already fainted — there is nothing to field.",
  );
  const activeEnemyUid = must(
    standing(enemyOrder),
    "startBattle: every battler in the enemy party is already fainted — there is nothing to field.",
  );
  const state: BattleState = {
    seed: input.seed,
    kind: input.kind,
    turn: 1,
    battlers,
    playerOrder,
    enemyOrder,
    activePlayerUid,
    activeEnemyUid,
    lureActive: false,
    bag: { ...(input.bag ?? {}) },
    ...(input.nodeId === undefined ? {} : { nodeId: input.nodeId }),
    outcome: null,
  };
  const events: BattleEvent[] = [
    { t: "battleStart", kind: input.kind, playerUid: activePlayerUid, enemyUid: activeEnemyUid },
  ];
  return { state, events };
}

/* ── deep clone: the purity contract (build-doc §7.4 "pure reducer") ───────── */

function cloneBattler(battler: Battler): BattleBattler {
  const b = asBattleBattler(battler);
  return {
    ...b,
    types: [...b.types],
    stats: { ...b.stats },
    status: b.status ? { ...b.status } : null,
    statMods: { ...b.statMods },
    statModTurns: { ...b.statModTurns },
    moves: [...b.moves],
    traits: b.traits.map((t) => ({ ...t })),
    boons: b.boons.map((x) => ({ ...x })),
  };
}

function cloneState(state: BattleState): BattleState {
  const battlers: Record<string, Battler> = {};
  for (const [uid, battler] of Object.entries(state.battlers)) battlers[uid] = cloneBattler(battler);
  return {
    ...state,
    battlers,
    playerOrder: [...state.playerOrder],
    enemyOrder: [...state.enemyOrder],
    bag: { ...state.bag },
  };
}

function battlerAt(state: BattleState, uid: string): BattleBattler {
  return asBattleBattler(must(state.battlers[uid], `no battler "${uid}" in this battle`));
}

/* ════════════════════════════════════════════════════════════════════════════
 * 6. Damage — build-doc §7.4.
 *
 *   damage = (atk × movePower / def) × typeMult × predation × roll(0.9, 1.1)
 *
 * Crit rides on the end of the chain: bible §2 makes Instinct the crit stat, and the §7.4 damage
 * event carries a `crit` flag, so the multiplier is applied after the roll. Every factor is a
 * balance.json value.
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * bible §1 via data/moves.json `typeChart`: attacker type A vs defender type D is
 * super-effective when D ∈ strongVs[A] and resisted when A ∈ strongVs[D]. A dual-typed defender
 * multiplies both of its types' results (Fire into Plant/Earth = 1.5 × 0.67).
 * Role and utility moves are typeless and always land at the neutral multiplier.
 *
 * The reported BAND counts interactions rather than reading the product back: 1.5 × 0.67 = 1.005 is
 * a matchup that is both strong and resisted, and announcing "super-effective" for a hit worth
 * +0.5% misleads the renderer (build-doc §15 C3 — the event log is what it draws from). One strong
 * half and one resisted half cancel to `neutral`; the MULTIPLIER is untouched either way.
 */
export function typeMultiplier(
  moveType: TypeName | null,
  defenderTypes: readonly TypeName[],
  chart: TypeChart,
  balance: Balance,
): { mult: number; band: EffectivenessBand } {
  const neutral = balance.types.neutral;
  if (moveType === null) return { mult: neutral, band: "neutral" };
  let mult = neutral;
  let net = 0; // +1 per super-effective half, −1 per resisted half
  const attackerEntry = must(chart[moveType], `type "${moveType}" missing from the type chart`);
  for (const defType of defenderTypes) {
    if (attackerEntry.strongVs.includes(defType)) {
      mult *= balance.types.superEffective;
      net += 1;
      continue;
    }
    const defEntry = must(chart[defType], `type "${defType}" missing from the type chart`);
    if (defEntry.strongVs.includes(moveType)) {
      mult *= balance.types.resisted;
      net -= 1;
    }
  }
  const band: EffectivenessBand = net > 0 ? "super" : net < 0 ? "resisted" : "neutral";
  return { mult, band };
}

/** bible §3 — Trample is "50 power, +25 vs Producer". */
function movePowerVs(move: MoveDef, defenderRole: Role): number {
  let power = move.power;
  for (const effect of move.effects) {
    if (effect.kind === "bonusVsRole" && effect.role === defenderRole) power += effect.bonusPower;
  }
  return power;
}

/** bible §2 — Soak is −30% Speed; in-battle stat mods are multiplicative. */
export function effectiveSpeed(battler: Battler, balance: Balance): number {
  const soak = battler.status?.name === "Soak" ? balance.status.soakSpdMult : 1;
  return battler.stats.spd * battler.statMods.spd * soak;
}

function statWithMods(battler: Battler, key: ModifiableStatKey, balance: Balance): number {
  if (key === "spd") return effectiveSpeed(battler, balance);
  return battler.stats[key] * battler.statMods[key];
}

/** Burrow/Roost: while the evade is up the defender takes reduced damage (see DEVIATIONS note). */
function evadeReduction(defender: Battler, ctx: BattleContext): number {
  for (const [moveId, turns] of Object.entries(defender.statModTurns)) {
    if (turns <= 0) continue;
    const move = ctx.moves.get(moveId);
    if (!move) continue;
    for (const effect of move.effects) {
      if (effect.kind === "evade") return 1 - magnitudeOf(ctx, effect.magnitudeKey);
    }
  }
  return 1;
}

export interface DamageResult {
  amount: number;
  effectiveness: EffectivenessBand;
  predation: boolean;
  crit: boolean;
  /**
   * The Burrow/Roost multiplier that was applied to this hit — 1 when no evade was up. Surfaced so
   * the reducer can emit `{t:"evaded"}`: bible §3's "+evasion" is implemented as damage reduction
   * (DEVIATIONS D-A3-3), which is otherwise invisible in the log and therefore unnarratable.
   */
  evadeMult: number;
}

/**
 * The multiplicative identity for a factor that is ABSENT (no predation, no crit, no lure).
 *
 * It is deliberately NOT `balance.types.neutral`: that is the type chart's neutral multiplier, an
 * advertised tunable (bible §1 "Exact multipliers are tunable via the balance harness"). Using it
 * as "×nothing" made a retune of the type chart rescale typeless damage cubically and move catch
 * odds, which breaks build-doc §6 INV-3. 1 is arithmetic, not a gameplay constant (G11).
 */
const ABSENT = 1;

export function computeDamage(
  attacker: Battler,
  defender: Battler,
  move: MoveDef,
  rng: BattleRng,
  ctx: BattleContext,
  nodeId?: string,
): DamageResult {
  const balance = ctx.balance;
  const atk = statWithMods(attacker, "atk", balance);
  const def = statWithMods(defender, "def", balance);
  const power = movePowerVs(move, defender.role);
  const { mult, band } = typeMultiplier(move.type, defender.types, ctx.typeChart, balance);
  // build-doc §7.4 — predation is the DERIVED food web read back (G3): never a table here. §7.3
  // derives edges PER NODE, so the battle's own node is part of the question.
  const predation = ctx.predation.eats(attacker.lineId, defender.lineId, nodeId);
  const predationMult = predation ? balance.types.predation : ABSENT;
  // draw 1: the 0.9–1.1 damage roll.
  const roll = balance.damage.rollMin + rng.float() * (balance.damage.rollMax - balance.damage.rollMin);
  // draw 2: crit, whose chance is driven by Instinct (bible §2).
  const critChance = balance.damage.critChanceBase + balance.damage.critChancePerInstinct * statWithMods(attacker, "ins", balance);
  const crit = rng.float() < critChance;
  const critMult = crit ? balance.damage.critMultiplier : ABSENT;
  const evadeMult = evadeReduction(defender, ctx);
  const raw = ((atk * power) / def) * mult * predationMult * roll * critMult * evadeMult;
  return { amount: Math.max(balance.damage.minDamage, Math.floor(raw)), effectiveness: band, predation, crit, evadeMult };
}

/* ════════════════════════════════════════════════════════════════════════════
 * 7. Catch, flee, XP — build-doc §7.4 (build-doc additions, tunable).
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * build-doc §7.2 — "Bait lookup: bait matches target if bait's tag ∈ target's derived diet".
 * A bait's tag is either a ROLE (the cheap role-generic bait of bible §11) or a species line id
 * (the better species-specific bait). Matching reads the DERIVED web through the oracle; there is
 * no bait table anywhere (G3).
 */
/**
 * The node slot of `baitMatchFor`. `baitMatchFor` only derives a web from it when no web is passed,
 * and battle.ts always passes one, so this fills the argument and is never read. (battle.ts holds
 * no node state — Hard Req 2 / G3.)
 */
const NO_NODE: EcoNode = { id: "", biome: "", adjacency: [], floraStock: 0, populations: {} };

export function baitMatchOf(
  baitId: string | undefined,
  targetLineId: string,
  ctx: BattleContext,
  nodeId?: string,
): BaitMatch {
  // core/foodweb.ts's own `baitMatchFor` wins whenever the caller wired it — one lookup, one home.
  if (ctx.predation.baitMatch) return ctx.predation.baitMatch(baitId, targetLineId, nodeId);
  if (baitId === undefined) return "none";
  // No wired hook: hand foodweb.ts the edges the oracle ALREADY derived and let it answer. battle.ts
  // states no part of the rule (species-vs-role tag, the flora-Producer case, the role age class) —
  // build-doc §8.3 `no_shadow_tables` is met structurally, not by an agreement test.
  const view: FoodWeb = {
    nodeId: nodeId ?? "",
    edges: { [targetLineId]: [...ctx.predation.dietOf(targetLineId, nodeId)] },
    floraFeeders: ctx.predation.feedsOnFlora?.(targetLineId, nodeId) === true ? [targetLineId] : [],
  };
  return baitMatchFor(baitId, targetLineId, NO_NODE, ctx.speciesIndex, ctx.balance, view);
}

/**
 * bible §2's SECOND job for Instinct — "bait success" — as build-doc §7.4 was amended on
 * 2026-08-25 (docs/DEVIATIONS.md D-A5-1, authorised by Hank off docs/ACTIONS-FROM-HARNESS.md A3).
 * Until the amendment `catchChance` never read Instinct at all and `computeDamage` read it only for
 * crit, which bought ~2.9% expected damage over the roster's whole 40-point spread — so Instinct
 * measured as the STRONGEST and NEGATIVE predictor of round-robin win rate (r = -0.582, 44,928
 * battles, docs/BALANCE-REPORT.md §3.1). Every point spent on it was a point taken from a stat that
 * worked.
 *
 *     instinctBait(c) = 1 + instinctBaitSlope × (insShare(c) − instinctBaitPivot)
 *     insShare(c)     = c.ins / (c.hp + c.atk + c.def + c.spd + c.ins)
 *
 * Three decisions this shape encodes, none of them arbitrary:
 *
 *  1. **The SHARE, not the raw stat.** Every non-Ancient line spends exactly 300 base points
 *     (data/species.json `_statRule`), so allocation is what a point of Instinct actually costs.
 *     The age, level, metamorphic and Beast multipliers are common to all five stats and cancel out
 *     of the ratio, which is what keeps this a rebalance of WHO catches well rather than a catch
 *     rate that climbs with the player's level.
 *  2. **Effective stats, but NOT `statMods`.** Traits and retirement boons are part of the creature
 *     and count (bible §2 "Keen Eye: +10% Instinct"); a Harden or a Screech is transient battle
 *     state, and reading it here would make raising your own Defense lower your catch odds.
 *  3. **No clamp on the term itself.** It is continuous and strictly increasing in Instinct over
 *     the whole reachable range, and positive over the whole MATHEMATICALLY possible one — at
 *     share 0 the shipped constants give 1 + 3 × (0 − 0.15) = 0.55 — so it can never flip the sign
 *     of a probability. The §7.4 .02–.95 clamp is still the only clamp, and still binds.
 *
 * An absent catcher answers with the pivot creature's value, exactly 1 (`ABSENT`): a caller that
 * models a catch without naming a thrower — the balance harness's mode (c), `tools/harness/full-run.ts`
 * — gets the pre-amendment formula rather than a silent zero-Instinct penalty.
 */
export function catchInstinctMultiplier(catcher: Battler | undefined, balance: Balance): number {
  if (catcher === undefined) return ABSENT;
  const cfg = balance.catch;
  let total = 0;
  for (const key of STAT_KEYS) total += catcher.stats[key];
  if (total === 0) return ABSENT;
  const insShare = catcher.stats.ins / total;
  return ABSENT + cfg.instinctBaitSlope * (insShare - cfg.instinctBaitPivot);
}

/**
 * build-doc §7.4 as amended 2026-08-25 (DEVIATIONS D-A5-1) —
 *   p = baseCatch(age) × snareTier × (baitMult × instinctBait(catcher)) × (2 − hpFrac)/2 × lureMult,
 * clamped .02–.95. Ancients use their own base (bible §4: "very hard catches").
 *
 * `catcher` is the creature THROWING the snare — the one whose Instinct reads the animal. It is
 * optional so that a caller with no thrower keeps the pre-amendment answer; see
 * {@link catchInstinctMultiplier}.
 */
export function catchChance(
  target: Battler,
  tier: SnareTier,
  baitId: string | undefined,
  lureActive: boolean,
  ctx: BattleContext,
  nodeId?: string,
  catcher?: Battler,
): number {
  const cfg = ctx.balance.catch;
  const line = lineOf(ctx, target.lineId);
  const base = line.ancient ? cfg.baseCatchAncient : cfg.baseCatch[target.age];
  const snare = cfg.snareTier[tier];
  // bible §2 — the bait term is where Instinct lives: "bait success" is the catcher's read of the
  // animal, so the §7.2 bait multiplier is scaled rather than a sixth factor being bolted on.
  const bait = cfg.baitMult[baitMatchOf(baitId, target.lineId, ctx, nodeId)] * catchInstinctMultiplier(catcher, ctx.balance);
  const hpFrac = target.maxHp === 0 ? 0 : target.curHp / target.maxHp;
  const hpTerm = (cfg.hpTermOffset - hpFrac) / cfg.hpTermDivisor;
  const lure = lureActive ? cfg.lureMult : ABSENT;
  return clamp(base * snare * bait * hpTerm * lure, cfg.clampMin, cfg.clampMax);
}

/**
 * build-doc §7.4 — pFlee = 0.4 + 0.4 × (mySpd/theirSpd), clamp .1–.95.
 *
 * A zero-Speed opponent is the formula's own limit, not a special case: `mySpd / 0` is +Infinity and
 * the clamp answers `clampMax`. (Substituting the clamp for the RATIO — a probability where a speed
 * ratio belongs — landed on 0.4 + 0.4 × 0.95 = 0.78 instead.) Only 0/0 has no limit; the ratio is
 * then taken as +Infinity too, since a chase between two motionless creatures is trivially escaped.
 */
export function fleeChance(mine: Battler, theirs: Battler, balance: Balance): number {
  const mySpd = effectiveSpeed(mine, balance);
  const theirSpd = effectiveSpeed(theirs, balance);
  const ratio = theirSpd === 0 ? Number.POSITIVE_INFINITY : mySpd / theirSpd;
  return clamp(balance.flee.base + balance.flee.spdCoefficient * ratio, balance.flee.clampMin, balance.flee.clampMax);
}

/** build-doc §7.4 — xpGain = 12 + 4 × enemyLevel × ageBonus(E:1.3). */
export function xpGain(defeated: Battler, balance: Balance): number {
  return Math.floor(balance.xp.base + balance.xp.perEnemyLevel * defeated.level * balance.xp.ageBonus[defeated.age]);
}

/** build-doc §7.4 — xpToNext(l) = 15 × l^1.4. */
export function xpToNext(level: number, balance: Balance): number {
  return balance.xp.toNextCoefficient * Math.pow(level, balance.xp.toNextExponent);
}

/* ════════════════════════════════════════════════════════════════════════════
 * 8. Statuses — bible §2 / build-doc §7.4.
 *   Burn 6%/turn chip · Toxin 4% ramping +2%/turn · Soak −30% Speed · Daze 25% skip.
 *   Exactly four, one at a time, newest wins, none expire on their own.
 * ════════════════════════════════════════════════════════════════════════════ */

function applyStatus(events: BattleEvent[], target: BattleBattler, status: StatusName): void {
  const replaced = target.status ? target.status.name : null;
  target.status = { name: status, turnsActive: 0 };
  events.push({ t: "statusApplied", uid: target.uid, status, replaced });
}

/** The per-turn chip fraction of a status, 0 for the two that do not chip. */
export function statusChipFraction(status: ActiveStatus, balance: Balance): number {
  switch (status.name) {
    case "Burn":
      return balance.status.burnChipFracPerTurn;
    case "Toxin":
      // "4% ramping +2%/turn": tick 1 is 4%, tick 2 is 6%, … capped by toxinMaxFracPerTurn.
      return Math.min(
        balance.status.toxinChipFracPerTurn + balance.status.toxinRampPerTurn * status.turnsActive,
        balance.status.toxinMaxFracPerTurn,
      );
    case "Soak":
    case "Daze":
      return 0;
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 * 9. In-battle stat modifiers.
 *
 * `Battler.statModTurns` is keyed by MOVE ID, so the multiplier a mod contributes is always
 * recoverable from data/moves.json + balance.moveEffects.magnitude. Recomputing the whole product
 * from the live keys each turn (instead of multiplying in and dividing out) keeps the numbers
 * exact no matter how mods overlap.
 * ════════════════════════════════════════════════════════════════════════════ */

function recomputeStatMods(battler: BattleBattler, ctx: BattleContext): void {
  const mods = NO_STAT_MODS();
  for (const [moveId, turns] of Object.entries(battler.statModTurns)) {
    if (turns <= 0) continue;
    const move = ctx.moves.get(moveId);
    if (!move) continue;
    for (const effect of move.effects) {
      if (effect.kind !== "statMod") continue;
      const magnitude = magnitudeOf(ctx, effect.magnitudeKey);
      mods[effect.stat] *= effect.direction === "up" ? 1 + magnitude : 1 - magnitude;
    }
  }
  battler.statMods = mods;
}

/**
 * `turns` on a `statChanged` event is the number of turns the modifier is in force COUNTING THE ONE
 * it is applied on — the number data/moves.json states (Terrify: 2) and the number bible §3 states.
 * `Battler.statModTurns` holds the same quantity, so at the end of the step it reads one lower: the
 * turn the mod was applied on is over. A renderer that wants a live countdown reads `statModTurns`
 * off the state each turn; the event says how long the mod is FOR, and the `turns: 0` event
 * {@link expireStatMods} emits says when it is over.
 */
function applyStatMod(
  events: BattleEvent[],
  target: BattleBattler,
  move: MoveDef,
  effect: Extract<MoveDef["effects"][number], { kind: "statMod" }>,
  ctx: BattleContext,
): void {
  const turns = effect.turns ?? ctx.balance.moveEffects.defaultStatModTurns;
  target.statModTurns[move.id] = turns;
  recomputeStatMods(target, ctx);
  events.push({ t: "statChanged", uid: target.uid, stat: effect.stat, direction: effect.direction, turns });
}

/* ════════════════════════════════════════════════════════════════════════════
 * 10. Faint, XP, level-up. KO = FAINT ONLY — there is no battle death anywhere in TROPHIC
 *     (Hard Req 8 / bible §13.14: lifespan is the mortality system).
 * ════════════════════════════════════════════════════════════════════════════ */

function finish(state: BattleState, events: BattleEvent[], outcome: BattleOutcome): void {
  state.outcome = outcome;
  events.push({ t: "battleEnd", outcome });
}

function firstStanding(state: BattleState, order: readonly string[]): string | undefined {
  for (const uid of order) {
    if (!battlerAt(state, uid).fainted) return uid;
  }
  return undefined;
}

function levelUps(state: BattleState, events: BattleEvent[], battler: BattleBattler, ctx: BattleContext): void {
  const balance = ctx.balance;
  const line = lineOf(ctx, battler.lineId);
  while (battler.level < balance.xp.levelCap && battler.xp >= xpToNext(battler.level, balance)) {
    battler.xp -= xpToNext(battler.level, balance);
    battler.level += 1;
    const before = battler.maxHp;
    battler.stats = effectiveStats({
      line,
      age: battler.age,
      level: battler.level,
      balance,
      traits: battler.traits,
      boons: battler.boons,
      // The latch the battler was BUILT with — never re-derived from the age here, or a battler
      // specced `metamorphosed:false` would gain a phantom ×1.15 the moment it levelled.
      metamorphosed: hasMetamorphosed(line, battler.age, battler.metamorphosed),
    });
    battler.maxHp = battler.stats.hp;
    battler.curHp = Math.min(battler.maxHp, battler.curHp + (battler.maxHp - before));
    const learned = moveUnlockedAt(line, battler.level, balance);
    if (learned !== undefined && !battler.moves.includes(learned)) battler.moves.push(learned);
    events.push({
      t: "levelUp",
      uid: battler.uid,
      level: battler.level,
      ...(learned === undefined ? {} : { learnedMoveId: learned }),
    });
  }
}

function awardXp(state: BattleState, events: BattleEvent[], defeated: BattleBattler, ctx: BattleContext): void {
  const recipientUid = battlerAt(state, state.activePlayerUid).fainted
    ? firstStanding(state, state.playerOrder)
    : state.activePlayerUid;
  if (recipientUid === undefined) return;
  const recipient = battlerAt(state, recipientUid);
  const amount = xpGain(defeated, ctx.balance);
  recipient.xp += amount;
  events.push({ t: "xpGained", uid: recipient.uid, amount });
  levelUps(state, events, recipient, ctx);
}

/** The enemy side always fields its next standing battler; with none left, the player has won. */
function fieldNextEnemy(state: BattleState, events: BattleEvent[], fromUid: string): void {
  const next = firstStanding(state, state.enemyOrder);
  if (next === undefined) {
    finish(state, events, "win");
    return;
  }
  events.push({ t: "switched", side: "enemy", fromUid, toUid: next });
  state.activeEnemyUid = next;
  // The replacement acts for the first time next turn — that is its Ambush "entry turn".
  battlerAt(state, next).enteredOnTurn = state.turn + 1;
  // bible §3 — Lure raises catch odds "on this target this battle"; a new target clears it.
  if (state.lureActive) {
    state.lureActive = false;
    events.push({ t: "lureChanged", active: false });
  }
}

function handleFaint(state: BattleState, events: BattleEvent[], victim: BattleBattler, ctx: BattleContext): void {
  if (victim.fainted) return;
  victim.fainted = true;
  victim.curHp = 0;
  events.push({ t: "faint", uid: victim.uid });
  if (victim.side === "enemy") {
    awardXp(state, events, victim, ctx);
    fieldNextEnemy(state, events, victim.uid);
    return;
  }
  if (firstStanding(state, state.playerOrder) === undefined) finish(state, events, "loss");
  // Otherwise the caller must send {kind:"switch"} — the reducer never picks the player's team.
}

/**
 * The field invariant, restated at the top of every step: a fainted battler is never fielded.
 *
 * The reducer maintains this itself (see {@link handleFaint}) and `startBattle` now refuses a side
 * that cannot field anyone, so this only fires for a state assembled outside the reducer — a save,
 * a fixture, a test. Without it, a fainted active enemy is hit forever with no `win` (`handleFaint`
 * returns immediately for an already-fainted victim) and `chooseEnemyAction` swings a corpse's
 * moves. Returns true when the battle ended here.
 */
function settleField(state: BattleState, events: BattleEvent[]): boolean {
  if (firstStanding(state, state.playerOrder) === undefined) {
    finish(state, events, "loss");
    return true;
  }
  if (battlerAt(state, state.activeEnemyUid).fainted) {
    fieldNextEnemy(state, events, state.activeEnemyUid);
    if (state.outcome !== null) return true;
  }
  return false;
}

function dealDamage(state: BattleState, events: BattleEvent[], target: BattleBattler, amount: number, ctx: BattleContext, meta: Omit<DamageResult, "amount">): void {
  target.curHp = Math.max(0, target.curHp - amount);
  // Announced BEFORE the damage so a renderer can play the duck, then the (reduced) hit.
  if (meta.evadeMult !== ABSENT) events.push({ t: "evaded", uid: target.uid, reduction: meta.evadeMult });
  events.push({
    t: "damage",
    uid: target.uid,
    amount,
    effectiveness: meta.effectiveness,
    predation: meta.predation,
    crit: meta.crit,
  });
  if (target.curHp <= 0) handleFaint(state, events, target, ctx);
}

function heal(events: BattleEvent[], target: BattleBattler, amount: number): void {
  const healed = Math.min(amount, target.maxHp - target.curHp);
  if (healed <= 0) return;
  target.curHp += healed;
  events.push({ t: "heal", uid: target.uid, amount: healed });
}

/* ════════════════════════════════════════════════════════════════════════════
 * 11. Using a move.
 * ════════════════════════════════════════════════════════════════════════════ */

function performMove(
  state: BattleState,
  events: BattleEvent[],
  actor: BattleBattler,
  defender: BattleBattler,
  moveId: string,
  rng: BattleRng,
  ctx: BattleContext,
): void {
  if (!actor.moves.includes(moveId)) {
    throw new Error(`core/battle.ts: ${actor.uid} does not know "${moveId}" (knows ${actor.moves.join(", ")}).`);
  }
  const move = moveOf(ctx, moveId);
  events.push({ t: "moveUsed", uid: actor.uid, moveId });

  let dealt = 0;
  if (move.power > 0) {
    const result = computeDamage(actor, defender, move, rng, ctx, state.nodeId);
    dealt = result.amount;
    dealDamage(state, events, defender, result.amount, ctx, {
      effectiveness: result.effectiveness,
      predation: result.predation,
      crit: result.crit,
      evadeMult: result.evadeMult,
    });
  }

  // A KO that ends the battle ends the move too: `battleEnd` must be the last event in the log
  // the renderer replays (build-doc §15 C3), so no secondary effect may fire after it.
  if (state.outcome !== null) return;

  for (const effect of move.effects) {
    switch (effect.kind) {
      case "inflictStatus": {
        if (defender.fainted) break;
        if (rng.float() >= effect.chance) break;
        applyStatus(events, defender, effect.status);
        break;
      }
      case "statMod": {
        const target = effect.target === "self" ? actor : defender;
        if (target.fainted) break;
        if (effect.chance !== undefined && rng.float() >= effect.chance) break;
        applyStatMod(events, target, move, effect, ctx);
        break;
      }
      case "heal": {
        if (effect.mode === "fracMaxHp") {
          const amount = Math.floor(actor.maxHp * must(effect.amount, `move "${move.id}" heals a fraction but names none`));
          heal(events, actor, amount);
        } else {
          heal(events, actor, dealt);
        }
        break;
      }
      case "evade": {
        // bible §3 Burrow/Roost — "skip turn, +evasion". The skip is inherent (the move does
        // nothing else this turn); the evasion runs to the end of the turn. It is worth something
        // to a slower creature only because an evade move resolves FIRST — see `movePriority`.
        actor.statModTurns[move.id] = ctx.evadeTurns;
        break;
      }
      case "catchOdds": {
        // bible §3 — Lure is the PLAYER's utility: "raise catch odds on this target this battle".
        // Only the player throws snares, so an enemy that used it would otherwise be handing the
        // player a ×1.5 on its own head.
        if (actor.side === "player" && !state.lureActive) {
          state.lureActive = true;
          events.push({ t: "lureChanged", active: true });
        }
        break;
      }
      case "bonusVsRole":
      case "priority":
        // Folded into movePowerVs / turn order respectively.
        break;
    }
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 * 12. The other four actions.
 * ════════════════════════════════════════════════════════════════════════════ */

/** Bag stock is optional: a key absent from `bag` is untracked (the harness carries no bag). */
function bagHas(state: BattleState, key: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(state.bag, key)) return true;
  return (state.bag[key] ?? 0) > 0;
}

function bagConsume(state: BattleState, key: string): void {
  if (!Object.prototype.hasOwnProperty.call(state.bag, key)) return;
  state.bag[key] = (state.bag[key] ?? 0) - 1;
}

/**
 * build-doc §7.4 catch. The reducer NEVER touches node state (Hard Req 2 / G3): a successful
 * catch sets `outcome:"caught"` + `caughtUid` and emits the `caught` event, and the caller applies
 * the population decrement — see {@link caughtIndividual}.
 */
function performSnare(
  state: BattleState,
  events: BattleEvent[],
  target: BattleBattler,
  tier: SnareTier,
  baitId: string | undefined,
  rng: BattleRng,
  ctx: BattleContext,
  catcher: BattleBattler,
): void {
  const chance = catchChance(target, tier, baitId, state.lureActive, ctx, state.nodeId, catcher);
  bagConsume(state, tier);
  if (baitId !== undefined) bagConsume(state, baitId);
  // Each shake is an independent check at p^(1/shakes), so all shakes passing has probability
  // exactly `chance` — the §7.4 formula — while the shake count is real drama, not decoration.
  const shakeCount = ctx.balance.catch.shakes;
  const perShake = Math.pow(chance, 1 / shakeCount);
  let shakes = 0;
  while (shakes < shakeCount && rng.float() < perShake) shakes += 1;
  const caught = shakes === shakeCount;
  events.push({ t: "snareThrown", uid: target.uid, tier, chance, shakes, caught });
  if (!caught) return;
  events.push({
    t: "caught",
    uid: target.uid,
    lineId: target.lineId,
    ...(state.nodeId === undefined ? {} : { nodeId: state.nodeId }),
  });
  state.caughtUid = target.uid;
  finish(state, events, "caught");
}

function performFlee(
  state: BattleState,
  events: BattleEvent[],
  mine: BattleBattler,
  theirs: BattleBattler,
  rng: BattleRng,
  ctx: BattleContext,
): void {
  const chance = fleeChance(mine, theirs, ctx.balance);
  const success = rng.float() < chance;
  events.push({ t: "fleeAttempt", uid: mine.uid, chance, success });
  if (success) finish(state, events, "fled");
}

/**
 * bible §11 medicines. {@link illegalActionReason} has already established that the target is a
 * standing member of the player's team and that the medicine has something to do — a medicine is
 * never spent for nothing, and never on a fainted battler (there is no revive in TROPHIC).
 */
function performItem(
  state: BattleState,
  events: BattleEvent[],
  itemId: string,
  targetUid: string | undefined,
  ctx: BattleContext,
): void {
  const uid = targetUid ?? state.activePlayerUid;
  const target = battlerAt(state, uid);
  bagConsume(state, itemId);
  events.push({ t: "itemUsed", itemId, uid });
  const med = ctx.balance.medicine;
  if (itemId === med.salveItemId) {
    heal(events, target, Math.floor(target.maxHp * med.salveHealFracMaxHp));
    return;
  }
  if (itemId === med.tonicItemId && med.tonicClearsStatus && target.status) {
    const cleared = target.status.name;
    target.status = null;
    events.push({ t: "statusCleared", uid, status: cleared });
  }
}

function performSwitch(state: BattleState, events: BattleEvent[], toUid: string, entersOnTurn: number): void {
  const from = state.activePlayerUid;
  events.push({ t: "switched", side: "player", fromUid: from, toUid });
  state.activePlayerUid = toUid;
  battlerAt(state, toUid).enteredOnTurn = entersOnTurn;
}

/* ════════════════════════════════════════════════════════════════════════════
 * 13. Turn order — bible §3 / build-doc §7.4.
 *   Speed decides; Ambush is "always first on entry turn". An exact Speed tie resolves in the
 *   player's favour, which spends no RNG draw and keeps a scripted stream hand-checkable.
 * ════════════════════════════════════════════════════════════════════════════ */

function movePriority(battler: Battler, action: BattleAction, state: BattleState, ctx: BattleContext): number {
  if (action.kind !== "move") return 0;
  const move = ctx.moves.get(action.moveId);
  if (!move) return 0;
  for (const effect of move.effects) {
    // bible §3 Burrow/Roost — "skip turn, +evasion". A duck that lands AFTER the blow it is ducking
    // mitigates nothing, so the evade resolves first; without this the move did literally nothing
    // for any creature slower than its opponent, which is roughly half the roster. This is a rule,
    // not a tunable: the evade's own duration is `battle.evadeTurns` in data (G11).
    if (effect.kind === "evade") return 1;
    if (effect.kind !== "priority") continue;
    if (effect.scope === "always") return 1;
    if (effect.scope === "entryTurn" && battler.enteredOnTurn === state.turn) return 1;
  }
  return 0;
}

function resolveOrder(
  state: BattleState,
  playerAction: BattleAction,
  enemyAction: BattleAction,
  ctx: BattleContext,
): Array<"player" | "enemy"> {
  const player = battlerAt(state, state.activePlayerUid);
  const enemy = battlerAt(state, state.activeEnemyUid);
  const pPriority = movePriority(player, playerAction, state, ctx);
  const ePriority = movePriority(enemy, enemyAction, state, ctx);
  if (pPriority !== ePriority) return pPriority > ePriority ? ["player", "enemy"] : ["enemy", "player"];
  const pSpeed = effectiveSpeed(player, ctx.balance);
  const eSpeed = effectiveSpeed(enemy, ctx.balance);
  return eSpeed > pSpeed ? ["enemy", "player"] : ["player", "enemy"];
}

/* ════════════════════════════════════════════════════════════════════════════
 * 14. Enemy policy.
 *
 * Deterministic argmax on expected damage (mid-roll, no crit), ties to the earliest move in the
 * pool. It consumes NO rng draws, so it cannot disturb the documented draw order, and it makes the
 * balance harness's win rates a property of the numbers rather than of a dice-rolling AI.
 * ════════════════════════════════════════════════════════════════════════════ */

function expectedDamage(
  attacker: Battler,
  defender: Battler,
  move: MoveDef,
  ctx: BattleContext,
  nodeId?: string,
): number {
  if (move.power <= 0) return 0;
  const balance = ctx.balance;
  const atk = statWithMods(attacker, "atk", balance);
  const def = statWithMods(defender, "def", balance);
  const power = movePowerVs(move, defender.role);
  const { mult } = typeMultiplier(move.type, defender.types, ctx.typeChart, balance);
  const predation = ctx.predation.eats(attacker.lineId, defender.lineId, nodeId) ? balance.types.predation : ABSENT;
  const midRoll = (balance.damage.rollMin + balance.damage.rollMax) / 2;
  return ((atk * power) / def) * mult * predation * midRoll;
}

export function chooseEnemyAction(state: BattleState, ctx: BattleContext): BattleAction {
  const enemy = battlerAt(state, state.activeEnemyUid);
  const player = battlerAt(state, state.activePlayerUid);
  let bestId = must(enemy.moves[0], `battler "${enemy.uid}" knows no moves`);
  let bestScore = -1;
  for (const moveId of enemy.moves) {
    const score = expectedDamage(enemy, player, moveOf(ctx, moveId), ctx, state.nodeId);
    if (score > bestScore) {
      bestScore = score;
      bestId = moveId;
    }
  }
  return { kind: "move", moveId: bestId };
}

/* ════════════════════════════════════════════════════════════════════════════
 * 15. End of turn — status chip, then stat-mod expiry.
 * ════════════════════════════════════════════════════════════════════════════ */

function tickStatus(state: BattleState, events: BattleEvent[], battler: BattleBattler, ctx: BattleContext): void {
  const status = battler.status;
  if (!status || battler.fainted) return;
  const fraction = statusChipFraction(status, ctx.balance);
  if (fraction > 0) {
    const amount = Math.max(ctx.balance.damage.minDamage, Math.floor(battler.maxHp * fraction));
    battler.curHp = Math.max(0, battler.curHp - amount);
    events.push({ t: "statusTick", uid: battler.uid, status: status.name, amount });
  }
  status.turnsActive += 1;
  // build-doc §7.4 — KO is a faint; chip damage can faint but never kills (Hard Req 8).
  if (battler.curHp <= 0) {
    handleFaint(state, events, battler, ctx);
    return;
  }
  // balance.status.persistUntilCured — shipped `true`: nothing but a tonic takes a status off, which
  // is build-doc §7.4's reading ("one status at a time, newest wins", no expiry named). The flag is
  // READ here so that flipping it in the balance harness actually changes behaviour: with `false` a
  // status wears off after `battle.statusWearOffTurns` turns and says so in the log.
  if (!ctx.balance.status.persistUntilCured && status.turnsActive >= ctx.statusWearOffTurns) {
    battler.status = null;
    events.push({ t: "statusCleared", uid: battler.uid, status: status.name });
  }
}

/**
 * Tick one battler's stat-mod durations down and announce anything that ran out.
 *
 * EVERY battler, not just the two on the field: `Battler.statModTurns` is measured in battle turns
 * (bible §3 gives Terrify "2 turns"), so a buff parked on the bench must not be frozen at full
 * strength waiting to be switched back in. And the expiry is an EVENT, because the event log is the
 * renderer's only narration channel (build-doc §15 C3) — a buff icon that goes up on `statChanged`
 * needs a moment to come down. `turns: 0` on a `statChanged` means exactly that: this modifier ended.
 */
function expireStatMods(events: BattleEvent[], battler: BattleBattler, ctx: BattleContext): void {
  for (const moveId of Object.keys(battler.statModTurns)) {
    const left = (battler.statModTurns[moveId] ?? 0) - 1;
    if (left > 0) {
      battler.statModTurns[moveId] = left;
      continue;
    }
    delete battler.statModTurns[moveId];
    const move = ctx.moves.get(moveId);
    for (const effect of move?.effects ?? []) {
      if (effect.kind !== "statMod") continue;
      events.push({ t: "statChanged", uid: battler.uid, stat: effect.stat, direction: effect.direction, turns: 0 });
    }
  }
  recomputeStatMods(battler, ctx);
}

function endOfTurn(state: BattleState, events: BattleEvent[], ctx: BattleContext): void {
  // The chip is a fact about the creature ON THE FIELD (a benched creature is not fighting), so the
  // status tick stays on the active pair; durations below are a fact about the TURN and so are not.
  const actives = [state.activePlayerUid, state.activeEnemyUid];
  for (const uid of actives) {
    if (state.outcome !== null) return;
    tickStatus(state, events, battlerAt(state, uid), ctx);
  }
  if (state.outcome !== null) return;
  for (const uid of Object.keys(state.battlers)) {
    expireStatMods(events, battlerAt(state, uid), ctx);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 * 16. The reducer — build-doc §7.4.
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Why the reducer would reject this action — `null` when it would accept it.
 *
 * Exported because `step()`'s only answer to an illegal action is "the state you gave me, and no
 * events", which a UI cannot tell apart from "nothing happened" and a harness can spin on forever.
 * Callers grey out (or skip) an action by asking here FIRST; the string is the reason to show.
 */
export function illegalActionReason(state: BattleState, action: BattleAction, ctx: BattleContext): string | null {
  if (state.outcome !== null) return "this battle is already over";
  const activePlayer = state.battlers[state.activePlayerUid];
  // While the active battler is down, the only thing the player may do is send someone else out.
  if (activePlayer?.fainted === true && action.kind !== "switch") {
    return "the active battler has fainted — only a switch is accepted";
  }
  switch (action.kind) {
    case "move":
      return null;
    case "switch": {
      const target = state.battlers[action.uid];
      if (target === undefined) return `no battler "${action.uid}" in this battle`;
      if (target.side !== "player") return "only the player's own team can be switched in";
      // KO = faint, and there is no revive in battle (Hard Req 8 / bible §11 medicines are a heal
      // and a status cure), so a fainted teammate can never come back out.
      if (target.fainted) return "that teammate has fainted";
      if (target.uid === state.activePlayerUid) return "that battler is already out";
      return null;
    }
    case "item": {
      const med = ctx.balance.medicine;
      if (action.itemId !== med.salveItemId && action.itemId !== med.tonicItemId) {
        return `"${action.itemId}" is not a battle medicine (balance.medicine)`;
      }
      if (!bagHas(state, action.itemId)) return `no ${action.itemId} left`;
      const target = state.battlers[action.targetUid ?? state.activePlayerUid];
      if (target === undefined) return `no battler "${action.targetUid ?? ""}" in this battle`;
      if (target.side !== "player") return "medicines are for the player's own team";
      // The defect this guards: a salve on a FAINTED teammate healed it above 0 without clearing
      // `fainted`, producing a battler that broke the reducer's own `fainted === (curHp === 0)`
      // invariant, could never be switched in, and still counted as down for the loss check.
      if (target.fainted) return "that battler has fainted — a medicine cannot revive it";
      if (action.itemId === med.salveItemId && target.curHp >= target.maxHp) {
        return "that battler is already at full HP";
      }
      if (action.itemId === med.tonicItemId && target.status === null) {
        return "that battler has no status to cure";
      }
      return null;
    }
    case "snare": {
      const target = state.battlers[state.activeEnemyUid];
      if (target === undefined) return "no enemy is fielded";
      if (!target.isWild) return "only a wild creature can be snared";
      if (target.fainted) return "that creature has fainted — there is nothing to snare";
      if (!bagHas(state, action.tier)) return `no ${action.tier} snare left`;
      if (action.baitId !== undefined && !bagHas(state, action.baitId)) return `no ${action.baitId} bait left`;
      return null;
    }
    case "flee":
      return enemyIsWild(state.kind) ? null : "there is no fleeing a trainer battle";
  }
}

/** Actions the reducer rejects outright: it returns the state untouched and no events. */
export function isActionLegal(state: BattleState, action: BattleAction, ctx: BattleContext): boolean {
  return illegalActionReason(state, action, ctx) === null;
}

function performAction(
  state: BattleState,
  events: BattleEvent[],
  side: "player" | "enemy",
  action: BattleAction,
  rng: BattleRng,
  ctx: BattleContext,
): void {
  const actorUid = side === "player" ? state.activePlayerUid : state.activeEnemyUid;
  const actor = battlerAt(state, actorUid);
  if (actor.fainted) return;
  // bible §2 — Daze: 25% chance to skip the turn. One draw, before anything else the actor does.
  if (actor.status?.name === "Daze" && rng.float() < ctx.balance.status.dazeSkipChance) {
    events.push({ t: "statusSkip", uid: actor.uid, status: "Daze" });
    return;
  }
  const opponentUid = side === "player" ? state.activeEnemyUid : state.activePlayerUid;
  switch (action.kind) {
    case "move":
      performMove(state, events, actor, battlerAt(state, opponentUid), action.moveId, rng, ctx);
      return;
    case "switch":
      // Switching spends the turn; the incoming battler's "entry turn" is the next one.
      performSwitch(state, events, action.uid, state.turn + 1);
      return;
    case "item":
      performItem(state, events, action.itemId, action.targetUid, ctx);
      return;
    case "snare":
      // The ACTOR is the catcher — build-doc §7.4's amended bait term reads its Instinct. (Only the
      // player ever reaches this case: `illegalActionReason` refuses a snare outside a wild/ancient
      // encounter, and `chooseEnemyAction` is an argmax over moves and never returns one.)
      performSnare(state, events, battlerAt(state, opponentUid), action.tier, action.baitId, rng, ctx, actor);
      return;
    case "flee":
      performFlee(state, events, actor, battlerAt(state, opponentUid), rng, ctx);
      return;
  }
}

/**
 * build-doc §7.4 — `(BattleState, Action, rng) => {state, events[]}`.
 *
 * One call resolves one whole turn: the player's action, the enemy's reply (chosen by
 * {@link chooseEnemyAction}), the end-of-turn status chip and stat-mod expiry. The input state is
 * never mutated. The event log is the renderer's only input (build-doc §15 C3).
 *
 * Two calls are no-ops that return the input state unchanged (the very same object) and no events:
 *   · the battle is already over (`state.outcome !== null`);
 *   · the action is rejected by {@link isActionLegal} (a snare in a gym, an empty bag, a switch to
 *     a fainted teammate, a salve on a battler that needs none).
 * A caller that needs to tell those apart — a UI greying out a button, a harness choosing its next
 * action — asks {@link illegalActionReason} BEFORE stepping; it names the reason in one string.
 *
 * While the player's active battler is fainted the ONLY accepted action is `switch`, and that
 * switch is free — it does not spend the turn and the enemy does not act.
 *
 * RENDERER CONTRACT (build-doc §15 C3). The scene NARRATES from `events[]` — every hit, faint,
 * status, stat mod (including its expiry, a `statChanged` with `turns: 0`), catch and level-up is
 * in there, in order — and READS the numbers off `state`: HP bars, max HP, levels, form names,
 * types, `statMods`, `lureActive`. The log carries deltas, not absolutes, so replaying it from the
 * state at the start of the step reproduces the state at the end exactly; it is not a substitute
 * for the state itself.
 */
/**
 * The reason string for an action refused at the top of `step()`. `illegalActionReason` answers for
 * the action itself; this adds the one case only the reducer knows about — the player's active
 * battler has fainted and the only legal action is a switch.
 */
function rejectionFor(state: BattleState, action: BattleAction, ctx: BattleContext): string {
  return (
    illegalActionReason(state, action, ctx) ??
    `the active battler has fainted; only a switch is legal (got "${action.kind}")`
  );
}

export function step(state: BattleState, action: BattleAction, rngSource: RngSource, ctx: BattleContext): BattleStepResult {
  if (state.outcome !== null) return { state, events: [] };
  const rng = asBattleRng(rngSource);

  // A state assembled outside the reducer can arrive with a fainted battler still fielded. Settle
  // the field before anything reads it — otherwise the fight is swung at a corpse forever.
  if (
    battlerAt(state, state.activeEnemyUid).fainted ||
    firstStanding(state, state.playerOrder) === undefined
  ) {
    const settled = cloneState(state);
    const settleEvents: BattleEvent[] = [];
    if (settleField(settled, settleEvents)) return { state: settled, events: settleEvents };
    // The field now holds standing battlers on both sides, so the ordinary path applies; its events
    // follow the settling ones in the log.
    const out = step(settled, action, rng, ctx);
    return { state: out.state, events: [...settleEvents, ...out.events] };
  }

  if (battlerAt(state, state.activePlayerUid).fainted) {
    if (action.kind !== "switch") {
      // A fainted active may only be replaced. Say so in the log — an empty result is
      // indistinguishable from "the turn happened and nothing occurred" (build-doc §4 renderer).
      return { state, events: [{ t: "actionRejected", reason: rejectionFor(state, action, ctx) }] };
    }
    const reason = illegalActionReason(state, action, ctx);
    if (reason !== null) return { state, events: [{ t: "actionRejected", reason }] };
    const s = cloneState(state);
    const events: BattleEvent[] = [];
    performSwitch(s, events, action.uid, s.turn);
    return { state: s, events };
  }

  const rejection = illegalActionReason(state, action, ctx);
  if (rejection !== null) return { state, events: [{ t: "actionRejected", reason: rejection }] };

  const s = cloneState(state);
  const events: BattleEvent[] = [];
  events.push({ t: "turnStart", turn: s.turn });

  const enemyAction = chooseEnemyAction(s, ctx);
  // Both intents are chosen against the field as it stands at the top of the turn. If the first
  // action knocks a battler out, its replacement enters but does NOT act this turn — so an action
  // is skipped when the side that chose it is no longer fielding the battler that chose it.
  const chosenBy = { player: s.activePlayerUid, enemy: s.activeEnemyUid };
  const stillFielded = (who: "player" | "enemy"): boolean =>
    chosenBy[who] === (who === "player" ? s.activePlayerUid : s.activeEnemyUid);

  if (action.kind === "move") {
    for (const who of resolveOrder(s, action, enemyAction, ctx)) {
      if (s.outcome !== null) break;
      if (!stillFielded(who)) continue;
      performAction(s, events, who, who === "player" ? action : enemyAction, rng, ctx);
    }
  } else {
    performAction(s, events, "player", action, rng, ctx);
    if (s.outcome === null && stillFielded("enemy")) performAction(s, events, "enemy", enemyAction, rng, ctx);
  }

  if (s.outcome === null) {
    endOfTurn(s, events, ctx);
    if (s.outcome === null) s.turn += 1;
  }
  return { state: s, events };
}

/* ════════════════════════════════════════════════════════════════════════════
 * 17. The catch hand-off.
 *
 * Hard Req 2 — "Catching decrements the real population of that species at that node". build-doc
 * §4 step 4 — "Catch success moves one individual from node population to party/box". battle.ts
 * must NOT mutate node state (that would be a second writer of the single source of truth, G3),
 * so it reports the individual and the caller applies it.
 * ════════════════════════════════════════════════════════════════════════════ */

export interface CaughtIndividual {
  uid: string;
  lineId: string;
  formName: string;
  age: AgeClass;
  level: number;
  traits: Trait[];
  /** The node whose `populations[lineId].count` the caller must decrement. */
  nodeId?: string;
  /** bible §4 — caught Ancients are exempt from year-turn aging (Hard Req 4 / G10). */
  ancient: boolean;
  /**
   * build-doc §7.4 — whether this individual already carries the metamorphic ×1.15, so the caller
   * can stamp `OwnedCreature.metamorphosed` instead of guessing. Without it, core/lifecycle.ts and
   * core/battle.ts each had to re-derive the latch from the age and could disagree by 15% on the
   * same creature (bible §4: "Wild adults of a line only appear in evolved form").
   */
  metamorphosed: boolean;
}

/** Non-null exactly when `state.outcome === "caught"`. */
export function caughtIndividual(state: BattleState, ctx: BattleContext): CaughtIndividual | null {
  if (state.outcome !== "caught" || state.caughtUid === undefined) return null;
  const battler = battlerAt(state, state.caughtUid);
  const line = lineOf(ctx, battler.lineId);
  return {
    uid: battler.uid,
    lineId: battler.lineId,
    formName: battler.formName,
    age: battler.age,
    level: battler.level,
    traits: battler.traits.map((t) => ({ ...t })),
    ...(state.nodeId === undefined ? {} : { nodeId: state.nodeId }),
    ancient: line.ancient,
    metamorphosed: hasMetamorphosed(line, battler.age, battler.metamorphosed),
  };
}
