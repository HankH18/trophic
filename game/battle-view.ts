/**
 * game/battle-view.ts — the TROPHIC battle RENDERER's brain. Lane C3 (build-doc §15).
 *
 * THE ARCHITECTURAL BET (build-doc §7.4 / §15 C3, locked decision L11)
 * ────────────────────────────────────────────────────────────────────
 * `core/battle.ts` is a pure reducer `(state, action, rng) => {state, events[]}`. This module is the
 * other half of that bet: it turns `events[]` into an ORDERED LIST OF VISUAL STEPS and contains
 * **zero battle rules**. There is no damage formula here, no type chart, no catch probability, no
 * turn order, no XP curve, no legality check. Everything this file knows about what happened, it
 * read out of the log; everything it knows about the world right now, it read off `BattleState`.
 *
 * That is enforced three ways, not merely intended:
 *   1. This file imports from `core/` **only `core/types.ts`, and only as `import type`** — it is
 *      structurally incapable of calling `computeDamage`, `catchChance`, `typeMultiplier`,
 *      `fleeChance`, `xpGain`, `step` or any other rule, because none of them is in scope.
 *   2. It imports no engine (`phaser` appears nowhere), so the same compile runs headless in vitest
 *      and inside the Phaser scene. `game/scenes/BattleScene.ts` is the only place tweens live.
 *   3. `tests/unit/battle-view.test.ts` asserts 1 and 2 by reading this file's own source, and
 *      asserts the compiled steps against a real event log replayed out of `core/battle.ts`.
 *
 * WHAT "NO RULES" COSTS, AND WHERE THE SEAMS ARE (read before adding anything)
 * ───────────────────────────────────────────────────────────────────────────
 * The log carries DELTAS; the state carries ABSOLUTES. So the compiler keeps a display-only HP
 * ledger seeded from the snapshot at the start of the step and moves it by the log's own numbers
 * (`damage.amount`, `heal.amount`, `statusTick.amount`) — that is the §7.4 renderer contract
 * ("replaying the log from the state at the start of the step reproduces the state at the end"),
 * not a second implementation of anything. `syncTo(state)` then re-reads the authoritative numbers,
 * so the ledger can never become the source of truth: it exists to give a tween a start and an end.
 *
 * Every step also carries `playerAt` / `enemyAt`: the DISPLAY STATE OF THE FIELDED PAIR AT THAT
 * POINT IN THE LOG. That is not a convenience — it is the fix for a reproduced defect. A scene that
 * asked the view for "the current snapshot" while a queue of steps was still playing got the state
 * at the END of the whole reducer step, because `push(events, stateAfter)` syncs immediately. The
 * player's HP therefore emptied on their own buff, two steps before the blow that emptied it was
 * drawn. The step's own carried state is the only correct source for "what should the card read
 * right now", so the scene never reads `snapshot` mid-playback.
 *
 * Three beats the event union cannot express, handled honestly rather than recomputed (all three
 * reported as MISSING EVENTS by lane C3 — see docs/DEVIATIONS-lane-c3.md):
 *   · `levelUp` carries the new LEVEL but not the new `maxHp`/`curHp`, and core/battle.ts raises
 *     both on a level-up (core/battle.ts:944-945). The new level comes off the log; the new maxHp is
 *     RE-READ off the `BattleState` the reducer returned (the same absolute read `syncTo` does,
 *     wired through `BattleViewAbsolutes`) rather than derived, because deriving it means calling
 *     `effectiveStats` — a rules function. With no state to read, the ledger marks its maxHp
 *     UNKNOWN instead of quietly keeping the stale one. `curHp`'s matching rise is core's rule and
 *     is left to the end-of-step resync; the step stays flagged `resyncRequired`.
 *   · `xpGained` carries the AMOUNT but not `xpAfter`/`xpToNext`, so a proportional XP bar is not
 *     computable from the log. Computing it here would mean calling `xpToNext` — a rules function.
 *     The step therefore reports the number only, which is also what G7 asks for.
 *   · `moveUsed` carries no TARGET, and data/moves.json marks harden/quicken/focus `target:"self"`
 *     (regrow is a self-heal, burrow-roost a self-evade). The first cut of this file inferred "the
 *     target is the other active battler", which is simply wrong for those five moves. There is no
 *     honest inference available, so the field is GONE rather than guessed: a projectile animation
 *     needs core to log the target.
 *   · `damage` carries no ATTACKER, so `ViewStep.hit.attackerUid` is inferred from the `moveUsed`
 *     immediately in front of it. That is exact for every event core can emit today (one `damage`
 *     call site, reached only from `performMove`, right after its own `moveUsed`), and the inference
 *     is now CONSUMED the moment it is spent, so a second `damage` with no move in front of it
 *     reports `null` rather than crediting whoever last swung. See `actorUid` in the compiler.
 *
 * COPY (guardrail G7, Hard Requirement 8)
 * ───────────────────────────────────────
 * Captions are identifiers and numbers. There is no moralizing copy about catching anywhere in this
 * file, and KO is FAINT ONLY — no word in the death family appears in any string here.
 *
 * ONE STRING NEVER BECOMES A CAPTION: `actionRejected.reason`. core/types.ts calls it "a diagnostic,
 * not player-facing copy (G7)" and the first cut made it the `rejected` step's caption, which put it
 * on screen verbatim. It now travels on `ViewStep.rejected.reason` — a field no message box reads —
 * and the caption is `""`. That is the only uncontrolled channel into the narration line there was,
 * and it is closed at the compiler rather than guarded at the scene.
 *
 * CONSTANTS (G11)
 * ───────────────
 * The only numbers in this file are `VIEW_TIMING`, which are animation durations in milliseconds —
 * presentation, not gameplay. No gameplay constant is written here; every gameplay number the view
 * shows (damage, catch chance, shake count, XP, levels, HP) arrives from the event log or the state.
 */

import type {
  BattleEvent,
  BattleKind,
  BattleOutcome,
  BattleState,
  Battler,
  EffectivenessBand,
  ModifiableStatKey,
  SnareTier,
  StatusName,
  TypeName,
} from "../core/types";

/* ════════════════════════════════════════════════════════════════════════════
 * 1. Timing. Presentation only — milliseconds of animation, never a gameplay
 *    tunable, so G11's "constants live in data/balance.json" does not apply.
 *    Kept in one table so the whole battle can be paced from a single place.
 * ════════════════════════════════════════════════════════════════════════════ */

export const VIEW_TIMING = {
  open: 700,
  turn: 220,
  attack: 260,
  evade: 220,
  hit: 420,
  critExtra: 180,
  heal: 340,
  status: 360,
  statMod: 300,
  faint: 640,
  swap: 480,
  item: 340,
  shake: 360,
  caught: 760,
  flee: 460,
  xp: 300,
  levelUp: 560,
  lure: 260,
  rejected: 420,
  close: 900,
} as const;

/* ════════════════════════════════════════════════════════════════════════════
 * 2. The snapshot — a READ of BattleState, never a computation over it.
 * ════════════════════════════════════════════════════════════════════════════ */

/** Everything the view needs to draw one combatant. Every field is copied, none is derived. */
export interface BattlerView {
  uid: string;
  side: "player" | "enemy";
  lineId: string;
  formName: string;
  nickname?: string;
  /**
   * `nickname ?? formName` — the raw label. NOT what the message line prints: two battlers of the
   * same species field the same string, and the gym demo beat is exactly that fight. The narration
   * qualifies a colliding name (see `nameOf` in the compiler); the card qualifies by position and
   * by the level it already prints.
   */
  displayName: string;
  age: string;
  level: number;
  types: readonly TypeName[];
  curHp: number;
  maxHp: number;
  status: StatusName | null;
  statMods: Readonly<Record<ModifiableStatKey, number>>;
  /**
   * Which in-battle modifiers are up and which are down — the ARROWS the card draws.
   *
   * `statMods` is a read of `BattleState` and is only correct at a sync point; the log's own
   * `statChanged` carries a `direction` and no magnitude, so an arrow is the most the compiler can
   * honestly track between syncs. It is a display fact, not a multiplier.
   */
  statArrows: Readonly<Partial<Record<ModifiableStatKey, "up" | "down">>>;
  fainted: boolean;
  isWild: boolean;
}

/** The arrows a `statMods` record implies. Display only — a read of the sign, never a magnitude. */
function arrowsOf(statMods: Readonly<Record<ModifiableStatKey, number>>): Partial<Record<ModifiableStatKey, "up" | "down">> {
  const arrows: Partial<Record<ModifiableStatKey, "up" | "down">> = {};
  for (const [stat, value] of Object.entries(statMods) as [ModifiableStatKey, number][]) {
    if (value > 1) arrows[stat] = "up";
    else if (value < 1) arrows[stat] = "down";
  }
  return arrows;
}

export interface BattleViewSnapshot {
  turn: number;
  kind: BattleKind;
  activePlayerUid: string;
  activeEnemyUid: string;
  lureActive: boolean;
  outcome: BattleOutcome | null;
  battlers: Readonly<Record<string, BattlerView>>;
}

function viewOf(battler: Battler): BattlerView {
  return {
    uid: battler.uid,
    side: battler.side,
    lineId: battler.lineId,
    formName: battler.formName,
    ...(battler.nickname === undefined ? {} : { nickname: battler.nickname }),
    displayName: battler.nickname ?? battler.formName,
    age: battler.age,
    level: battler.level,
    types: [...battler.types],
    curHp: battler.curHp,
    maxHp: battler.maxHp,
    status: battler.status === null ? null : battler.status.name,
    statMods: { ...battler.statMods },
    statArrows: arrowsOf(battler.statMods),
    fainted: battler.fainted,
    isWild: battler.isWild,
  };
}

/** Read a `BattleState` into the view's own shape. A copy, so the view never aliases engine state. */
export function snapshotOf(state: BattleState): BattleViewSnapshot {
  const battlers: Record<string, BattlerView> = {};
  for (const [uid, battler] of Object.entries(state.battlers)) battlers[uid] = viewOf(battler);
  return {
    turn: state.turn,
    kind: state.kind,
    activePlayerUid: state.activePlayerUid,
    activeEnemyUid: state.activeEnemyUid,
    lureActive: state.lureActive,
    outcome: state.outcome,
    battlers,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 * 3. Naming. The view never looks a name up in content — the scene, which already
 *    holds the validated content, hands the lookups in. Absent, ids are the labels,
 *    which is exactly what the headless tests want.
 * ════════════════════════════════════════════════════════════════════════════ */

export interface BattleViewNames {
  /** Display name for a battler; the snapshot's own `displayName` is the fallback. */
  battler?(uid: string): string | undefined;
  /** data/moves.json `name` for a move id. */
  move?(moveId: string): string | undefined;
  /** Display name for a bag item id. `itemLabel` is the fallback. */
  item?(itemId: string): string | undefined;
  /** data/moves.json `type` for a move id — drives the attack flash colour, nothing else. */
  moveType?(moveId: string): TypeName | null | undefined;
  /**
   * Who the player is fighting, for the opening line of a `trainer` / `gym` battle.
   *
   * `BattleInput` and `battleStart` carry no trainer identity (core/types.ts:319-328, :386), so the
   * view CANNOT know that the gym across the table is Maribel — it only knows which creature she
   * fielded first. Naming that creature as the opponent is what the first cut did, and it made the
   * never-cut gym beat open with "Gym battle: Nibbin". Absent this hook the caption now names the
   * kind and stops. Reported as a core gap; the caller supplies the name until core logs it.
   */
  opponent?(): string | undefined;
}

/**
 * Absolutes the LOG cannot carry, read off the `BattleState` the reducer returned.
 *
 * This is the same class of read as {@link BattleView.syncTo} — a number copied off engine state,
 * never a number derived here. It exists for exactly one beat: `levelUp` raises `maxHp` inside
 * core (core/battle.ts:944) and logs only the new level, so every HP payload emitted after it in
 * the same reducer step would otherwise be sized against a maximum that is known to be stale.
 */
export interface BattleViewAbsolutes {
  maxHp?(uid: string): number | undefined;
}

/**
 * A bag item's label when no content lookup supplies one.
 *
 * data/ has no item-name table (`balance.medicine` carries ids; bait ids are bag keys), so the only
 * honest label is the id itself, typeset. This capitalises and un-hyphenates — it coins no noun and
 * adds no word, so G2 is untouched — and `BattleViewNames.item` overrides it the day a table exists.
 */
export function itemLabel(itemId: string): string {
  return itemId
    .split(/[-_\s]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/* ════════════════════════════════════════════════════════════════════════════
 * 4. The visual vocabulary. One step = one thing the player sees happen, in order.
 * ════════════════════════════════════════════════════════════════════════════ */

/** Fields every step carries. `hold` is how long the scene should dwell on it. */
interface StepBase {
  hold: number;
  /** Message-line text. Identifiers and numbers only (G7). */
  caption: string;
  /**
   * The pair FIELDED at this point in the log.
   *
   * A faint-and-replace happens in the MIDDLE of a reducer step, so the pair on the field when the
   * first blow lands is not the pair on the field when the step ends. A renderer that read the
   * post-step `BattleState` to decide "which sprite is this?" would attribute the first half of such
   * a turn to the wrong combatant — visibly wrong in the gym fight, which swaps seven times. Every
   * step therefore carries the actives as they stood when the event was logged.
   */
  activePlayerUid: string;
  activeEnemyUid: string;
  /**
   * The two fielded battlers' DISPLAY STATE at this point in the log — what both cards should read
   * while this step is on screen.
   *
   * The scene must paint from this and never from `BattleView.snapshot`, which has already been
   * advanced to the end of the whole reducer step by `push(events, stateAfter)`. Reading the
   * snapshot mid-playback showed the player the HP they would have after a blow that had not been
   * drawn yet (a reproduced defect — see this file's header).
   *
   * `null` only when the uid is absent from the snapshot the compile started from.
   */
  playerAt: BattlerView | null;
  enemyAt: BattlerView | null;
  /**
   * Is a Lure up against the fielded enemy AT THIS POINT IN THE LOG?
   *
   * bible §3 makes Lure per-target and per-battle, and it is the largest single lever the player has
   * on catch odds — build-doc §7.2's `lureMult`. The compiler always tracked it (`lureChanged` moves
   * it, `snapshotOf` reads it off `BattleState.lureActive`), but nothing on screen read the tracked
   * value: the whole on-screen life of a Lure was one 260ms caption, and by the time the snare was
   * thrown the only trace of the thing that raised its odds had scrolled away. Carrying it per STEP
   * — for the same reason `playerAt`/`enemyAt` are carried — lets a card draw a persistent chip
   * without ever reading `BattleView.snapshot` mid-playback.
   */
  lureActive: boolean;
}

export type ViewStep =
  | (StepBase & { kind: "battleOpen"; battleKind: BattleKind; playerUid: string; enemyUid: string })
  | (StepBase & { kind: "turnBanner"; turn: number })
  /** No `targetUid`: `moveUsed` carries no target and five shipped moves target self. See header. */
  | (StepBase & {
      kind: "attack";
      uid: string;
      moveId: string;
      moveName: string;
      moveType: TypeName | null;
    })
  /** bible §3 Burrow/Roost — the duck plays BEFORE the (reduced) hit, as core logs it. */
  | (StepBase & { kind: "evade"; uid: string; reduction: number })
  | (StepBase & {
      kind: "hit";
      uid: string;
      attackerUid: string | null;
      amount: number;
      effectiveness: EffectivenessBand;
      crit: boolean;
      predation: boolean;
      hpFrom: number;
      hpTo: number;
      maxHp: number;
    })
  | (StepBase & { kind: "heal"; uid: string; amount: number; hpFrom: number; hpTo: number; maxHp: number })
  | (StepBase & { kind: "statusApply"; uid: string; status: StatusName; replaced: StatusName | null })
  | (StepBase & {
      kind: "statusTick";
      uid: string;
      status: StatusName;
      amount: number;
      hpFrom: number;
      hpTo: number;
      maxHp: number;
    })
  | (StepBase & { kind: "statusSkip"; uid: string; status: StatusName })
  | (StepBase & { kind: "statusClear"; uid: string; status: StatusName })
  /** `turns === 0` is core/battle.ts's "this modifier ended" — the arrow comes back down. */
  | (StepBase & {
      kind: "statMod";
      uid: string;
      stat: ModifiableStatKey;
      direction: "up" | "down";
      turns: number;
      ended: boolean;
    })
  /** KO is FAINT ONLY (Hard Req 8). There is no death in TROPHIC's battles. */
  | (StepBase & { kind: "faint"; uid: string; side: "player" | "enemy" })
  | (StepBase & { kind: "swap"; side: "player" | "enemy"; fromUid: string; toUid: string })
  | (StepBase & { kind: "item"; itemId: string; itemName: string; uid: string })
  | (StepBase & {
      kind: "snareThrow";
      uid: string;
      tier: SnareTier;
      chance: number;
      shakes: number;
      caught: boolean;
    })
  | (StepBase & { kind: "caught"; uid: string; lineId: string; nodeId: string | null })
  | (StepBase & { kind: "flee"; uid: string; chance: number; success: boolean })
  /** Amount only: a proportional bar would need `xpToNext`, which is a rules function. */
  | (StepBase & { kind: "xp"; uid: string; amount: number })
  | (StepBase & {
      kind: "levelUp";
      uid: string;
      level: number;
      learnedMoveId: string | null;
      learnedMoveName: string | null;
      /** The log carries no post-level HP; the scene must `syncTo(state)` before sizing the bar. */
      resyncRequired: true;
    })
  | (StepBase & { kind: "lure"; active: boolean })
  /**
   * A refusal. `reason` is core's `illegalActionReason` string and core/types.ts calls it "a
   * diagnostic, not player-facing copy (G7)", so it is NOT the caption — the caption is `""`. The
   * scene records `reason` (`BattleScene.lastRefusal()`) and never prints it.
   */
  | (StepBase & { kind: "rejected"; reason: string; diagnostic: true })
  | (StepBase & { kind: "battleClose"; outcome: BattleOutcome });

export type ViewStepKind = ViewStep["kind"];

/* ════════════════════════════════════════════════════════════════════════════
 * 5. The compiler.
 *
 * `compileBattleEvents(events, snapshot, names?)` is a PURE function: same log and
 * same snapshot in, same steps out, every time. It walks the log once, in order,
 * and never looks ahead — the log's order IS the visual order (build-doc §7.4:
 * "`battleEnd` must be the last event in the log the renderer replays").
 * ════════════════════════════════════════════════════════════════════════════ */

const PERCENT = 100;

/** A percentage, rounded for display. The log's `chance` is a probability in [0,1]. */
function pct(chance: number): string {
  return `${String(Math.round(chance * PERCENT))}%`;
}

const EFFECTIVENESS_CAPTION: Record<EffectivenessBand, string> = {
  super: "Super effective",
  neutral: "",
  resisted: "Resisted",
};

const OUTCOME_CAPTION: Record<BattleOutcome, string> = {
  win: "Battle won",
  loss: "Party down",
  fled: "Escaped",
  caught: "Caught",
  escaped: "It got away",
};

/**
 * How a snare throw ends, in the log's own vocabulary. `caught` is core's event name (`t:"caught"`);
 * `not caught` is its negation, formed the way this file already negates `fleeAttempt`'s success
 * ("could not escape"). Nothing here is an adjective or a judgement (G7).
 */
const SNARE_RESULT: Record<"caught" | "free", string> = {
  caught: "caught",
  free: "not caught",
};

const KIND_CAPTION: Record<BattleKind, string> = {
  wild: "A wild creature appears",
  trainer: "Trainer battle",
  gym: "Gym battle",
  ancient: "An Ancient stirs",
};

/**
 * In a `wild` or `ancient` fight the creature on the other side IS the opponent, so naming it is
 * the truth. In a `trainer` or `gym` fight the opponent is a person the log never names, and the
 * first cut printed the leader's first creature instead — "Gym battle: Nibbin" opened the never-cut
 * gym beat. Absent a caller-supplied name, the caption names the kind and stops rather than
 * misattributing. See {@link BattleViewNames.opponent}.
 */
const KIND_NAMES_THE_ENEMY_BATTLER: Record<BattleKind, boolean> = {
  wild: true,
  ancient: true,
  trainer: false,
  gym: false,
};

function openingCaption(kind: BattleKind, opponent: string | undefined, enemyName: () => string): string {
  const head = KIND_CAPTION[kind];
  if (opponent !== undefined && opponent !== "") return `${head}: ${opponent}`;
  return KIND_NAMES_THE_ENEMY_BATTLER[kind] ? `${head}: ${enemyName()}` : head;
}

/**
 * Mutable display ledger for one battler while a log is being walked.
 *
 * `view` IS the battler's current display state: a copy of the opening snapshot's row, moved by the
 * log's own deltas. `maxHpKnown` goes false at a level-up with no state to re-read from, so a later
 * clamp uses the log's number rather than a maximum the compiler knows is stale.
 */
interface Ledger {
  view: BattlerView;
  maxHpKnown: boolean;
}

/** `Omit` distributed across a union — plain `Omit` would collapse `ViewStep` into one flat shape. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A step as the walker writes it, before {@link compileBattleEvents} stamps the fielded pair on. */
type StepDraft = DistributiveOmit<
  ViewStep,
  "activePlayerUid" | "activeEnemyUid" | "playerAt" | "enemyAt" | "lureActive"
>;

export interface CompileResult {
  steps: ViewStep[];
  /** The snapshot advanced by the log's deltas — the §7.4 replay identity, for tests and for tweens. */
  snapshot: BattleViewSnapshot;
}

export function compileBattleEvents(
  events: readonly BattleEvent[],
  snapshot: BattleViewSnapshot,
  names: BattleViewNames = {},
  absolutes: BattleViewAbsolutes = {},
): CompileResult {
  const ledgers = new Map<string, Ledger>();
  for (const [uid, view] of Object.entries(snapshot.battlers)) {
    ledgers.set(uid, {
      view: { ...view, displayName: names.battler?.(uid) ?? view.displayName },
      maxHpKnown: true,
    });
  }

  let turn = snapshot.turn;
  let activePlayerUid = snapshot.activePlayerUid;
  let activeEnemyUid = snapshot.activeEnemyUid;
  let lureActive = snapshot.lureActive;
  let outcome = snapshot.outcome;

  /**
   * The battler whose MOVE is currently resolving. Narration bookkeeping, not turn order.
   *
   * This is the ONE piece of information the view needs that the event log does not carry:
   * `BattleEvent.damage` has no `attackerUid`, so `ViewStep.hit.attackerUid` is INFERRED from the
   * `moveUsed` immediately before it. That inference is exact for every event core can emit today —
   * `core/battle.ts` pushes `damage` from exactly one site (`dealDamage`), reached from exactly one
   * caller (`performMove`), immediately after its own `moveUsed` — but it is an undeclared coupling,
   * and a future damage with no preceding move (recoil, a reflected hit, an environmental tick)
   * would have been attributed to whoever last swung.
   *
   * So the attribution is CONSUMED: cleared the moment it is spent, as well as at `turnStart` and
   * `switched`. A second `damage` with no new `moveUsed` in front of it reports `attackerUid: null`,
   * which is the honest answer, instead of naming the wrong combatant. Reported as the core gap
   * C3-G7 in docs/DEVIATIONS-lane-c3.md; one field on the event closes it.
   */
  let actorUid: string | null = null;

  const steps: ViewStep[] = [];

  /**
   * Stamp the currently fielded pair onto every step as it is emitted.
   *
   * The cast is the one in this file, and it is doing nothing clever: `StepDraft` is `ViewStep`
   * with exactly the two stamped fields removed from every member of the union, so re-adding them
   * reconstitutes the member the caller wrote. It exists so 22 call sites do not each repeat the
   * stamp (and cannot each forget it).
   */
  const emit = (draft: StepDraft): void => {
    steps.push({
      ...draft,
      activePlayerUid,
      activeEnemyUid,
      // A COPY, frozen at emit time: the ledger keeps moving, and a step must keep the picture the
      // player is looking at while it is on screen.
      playerAt: ledgers.has(activePlayerUid) ? { ...ledgerOf(activePlayerUid).view } : null,
      enemyAt: ledgers.has(activeEnemyUid) ? { ...ledgerOf(activeEnemyUid).view } : null,
      lureActive,
    } as ViewStep);
  };

  const ledgerOf = (uid: string): Ledger =>
    ledgers.get(uid) ?? {
      view: {
        uid,
        side: "enemy",
        lineId: "",
        formName: uid,
        displayName: names.battler?.(uid) ?? uid,
        age: "",
        level: 0,
        types: [],
        curHp: 0,
        maxHp: 0,
        status: null,
        statMods: {} as Readonly<Record<ModifiableStatKey, number>>,
        statArrows: {},
        fainted: false,
        isWild: false,
      },
      maxHpKnown: false,
    };

  /**
   * The narration label for a battler.
   *
   * `nickname ?? formName` alone is ambiguous the moment both sides field the same species — which
   * is precisely the shipped gym fight (the player's nibbin-line against Maribel's), where six
   * consecutive lines all read "Nibbin". A colliding name is therefore qualified with the level the
   * card already prints, and — if the levels collide too — with core's own word for the side. No
   * noun is coined and no adjective is added: G7's "numbers, not judgements" is the whole rule.
   */
  const nameOf = (uid: string): string => {
    const me = ledgerOf(uid).view;
    const clashes = [activePlayerUid, activeEnemyUid]
      .filter((other) => other !== uid && ledgers.has(other))
      .map((other) => ledgerOf(other).view)
      .filter((other) => other.displayName === me.displayName);
    if (clashes.length === 0) return me.displayName;
    const qualified = `${me.displayName} Lv ${String(me.level)}`;
    return clashes.every((other) => other.level !== me.level) ? qualified : `${qualified} (${me.side})`;
  };

  const moveName = (moveId: string): string => names.move?.(moveId) ?? moveId;
  const itemName = (itemId: string): string => names.item?.(itemId) ?? itemLabel(itemId);

  /** Apply a hit-shaped delta and report the tween's endpoints. The log's own number moves it. */
  const drain = (uid: string, amount: number): { hpFrom: number; hpTo: number; maxHp: number } => {
    const ledger = ledgerOf(uid);
    const hpFrom = ledger.view.curHp;
    const hpTo = Math.max(0, hpFrom - amount);
    ledger.view.curHp = hpTo;
    return { hpFrom, hpTo, maxHp: ledger.view.maxHp };
  };

  for (const event of events) {
    switch (event.t) {
      case "battleStart": {
        activePlayerUid = event.playerUid;
        activeEnemyUid = event.enemyUid;
        emit({
          kind: "battleOpen",
          hold: VIEW_TIMING.open,
          battleKind: event.kind,
          playerUid: event.playerUid,
          enemyUid: event.enemyUid,
          caption: openingCaption(event.kind, names.opponent?.(), () => nameOf(event.enemyUid)),
        });
        break;
      }

      case "turnStart": {
        turn = event.turn;
        actorUid = null;
        emit({ kind: "turnBanner", hold: VIEW_TIMING.turn, turn: event.turn, caption: `Turn ${String(event.turn)}` });
        break;
      }

      case "moveUsed": {
        actorUid = event.uid;
        emit({
          kind: "attack",
          hold: VIEW_TIMING.attack,
          uid: event.uid,
          moveId: event.moveId,
          moveName: moveName(event.moveId),
          moveType: names.moveType?.(event.moveId) ?? null,
          caption: `${nameOf(event.uid)} used ${moveName(event.moveId)}`,
        });
        break;
      }

      case "evaded": {
        emit({
          kind: "evade",
          hold: VIEW_TIMING.evade,
          uid: event.uid,
          reduction: event.reduction,
          caption: `${nameOf(event.uid)} is under cover (×${String(event.reduction)})`,
        });
        break;
      }

      case "damage": {
        const hp = drain(event.uid, event.amount);
        // Spend the inference (see `actorUid`): whoever swung is credited with THIS blow and no
        // later one. A second `damage` with no `moveUsed` in front of it has no known attacker.
        const attackerUid = actorUid;
        actorUid = null;
        const band = EFFECTIVENESS_CAPTION[event.effectiveness];
        const tags: string[] = [];
        if (band !== "") tags.push(band);
        if (event.crit) tags.push("Critical");
        if (event.predation) tags.push("Predation");
        emit({
          kind: "hit",
          hold: VIEW_TIMING.hit + (event.crit ? VIEW_TIMING.critExtra : 0),
          uid: event.uid,
          attackerUid,
          amount: event.amount,
          effectiveness: event.effectiveness,
          crit: event.crit,
          predation: event.predation,
          ...hp,
          caption: `${nameOf(event.uid)} −${String(event.amount)} HP${tags.length === 0 ? "" : ` · ${tags.join(" · ")}`}`,
        });
        break;
      }

      case "heal": {
        const ledger = ledgerOf(event.uid);
        const hpFrom = ledger.view.curHp;
        // core/battle.ts:1037 already clamps the amount it logs (`min(amount, maxHp - curHp)`), so
        // the log's own number is the whole delta. The clamp here is a DISPLAY guard against a
        // hand-built log, and it is skipped when the maximum is known to be stale (a level-up with
        // no state to re-read from) — capping a post-level heal at the pre-level maximum was a
        // reproduced defect.
        const hpTo = ledger.maxHpKnown ? Math.min(ledger.view.maxHp, hpFrom + event.amount) : hpFrom + event.amount;
        ledger.view.curHp = hpTo;
        emit({
          kind: "heal",
          hold: VIEW_TIMING.heal,
          uid: event.uid,
          amount: event.amount,
          hpFrom,
          hpTo,
          maxHp: ledger.view.maxHp,
          caption: `${nameOf(event.uid)} +${String(event.amount)} HP`,
        });
        break;
      }

      case "statusApplied": {
        ledgerOf(event.uid).view.status = event.status;
        emit({
          kind: "statusApply",
          hold: VIEW_TIMING.status,
          uid: event.uid,
          status: event.status,
          replaced: event.replaced,
          caption:
            event.replaced === null
              ? `${nameOf(event.uid)}: ${event.status}`
              : `${nameOf(event.uid)}: ${event.replaced} → ${event.status}`,
        });
        break;
      }

      case "statusTick": {
        const hp = drain(event.uid, event.amount);
        emit({
          kind: "statusTick",
          hold: VIEW_TIMING.status,
          uid: event.uid,
          status: event.status,
          amount: event.amount,
          ...hp,
          caption: `${nameOf(event.uid)}: ${event.status} −${String(event.amount)} HP`,
        });
        break;
      }

      case "statusSkip": {
        emit({
          kind: "statusSkip",
          hold: VIEW_TIMING.status,
          uid: event.uid,
          status: event.status,
          caption: `${nameOf(event.uid)}: ${event.status} — turn skipped`,
        });
        break;
      }

      case "statusCleared": {
        ledgerOf(event.uid).view.status = null;
        emit({
          kind: "statusClear",
          hold: VIEW_TIMING.status,
          uid: event.uid,
          status: event.status,
          caption: `${nameOf(event.uid)}: ${event.status} cleared`,
        });
        break;
      }

      case "statChanged": {
        const ended = event.turns === 0;
        const arrow = event.direction === "up" ? "↑" : "↓";
        // The log carries a direction and no magnitude, so the ledger tracks the ARROW. Replaced,
        // never mutated in place, because every emitted step holds a shallow copy of this view.
        const modded = ledgerOf(event.uid).view;
        const arrows = { ...modded.statArrows };
        if (ended) delete arrows[event.stat];
        else arrows[event.stat] = event.direction;
        modded.statArrows = arrows;
        emit({
          kind: "statMod",
          hold: VIEW_TIMING.statMod,
          uid: event.uid,
          stat: event.stat,
          direction: event.direction,
          turns: event.turns,
          ended,
          caption: ended
            ? `${nameOf(event.uid)}: ${event.stat}${arrow} ended`
            : `${nameOf(event.uid)}: ${event.stat}${arrow} (${String(event.turns)})`,
        });
        break;
      }

      case "faint": {
        const ledger = ledgerOf(event.uid);
        ledger.view.fainted = true;
        ledger.view.curHp = 0;
        emit({
          kind: "faint",
          hold: VIEW_TIMING.faint,
          uid: event.uid,
          side: ledger.view.side,
          caption: `${nameOf(event.uid)} fainted`,
        });
        break;
      }

      case "switched": {
        if (event.side === "player") activePlayerUid = event.toUid;
        else activeEnemyUid = event.toUid;
        actorUid = null;
        emit({
          kind: "swap",
          hold: VIEW_TIMING.swap,
          side: event.side,
          fromUid: event.fromUid,
          toUid: event.toUid,
          caption: `${nameOf(event.toUid)} steps in`,
        });
        break;
      }

      case "itemUsed": {
        emit({
          kind: "item",
          hold: VIEW_TIMING.item,
          itemId: event.itemId,
          itemName: itemName(event.itemId),
          uid: event.uid,
          caption: `${itemName(event.itemId)} → ${nameOf(event.uid)}`,
        });
        break;
      }

      case "snareThrown": {
        // The RESULT is on the caption, both ways.
        //
        // It used to be absent, so a throw that failed and a throw that succeeded printed the same
        // line and the only difference on screen was that a `caught` step followed one of them: a
        // failed snare read as a throw followed by silence, with nothing saying the creature was
        // still there. `SNARE_RESULT` negates core's own event name (`t:"caught"`) — the same way
        // `fleeAttempt`'s failure already reads "could not escape" — so no noun is coined, no
        // judgement is added, and G7's "numbers, not adjectives" is untouched.
        emit({
          kind: "snareThrow",
          hold: VIEW_TIMING.shake * (event.shakes + 1),
          uid: event.uid,
          tier: event.tier,
          chance: event.chance,
          shakes: event.shakes,
          caught: event.caught,
          caption: `${event.tier} snare · ${pct(event.chance)} · ${String(event.shakes)} shakes · ${
            SNARE_RESULT[event.caught ? "caught" : "free"]
          }`,
        });
        break;
      }

      case "caught": {
        emit({
          kind: "caught",
          hold: VIEW_TIMING.caught,
          uid: event.uid,
          lineId: event.lineId,
          nodeId: event.nodeId ?? null,
          caption: `${nameOf(event.uid)} caught`,
        });
        break;
      }

      case "fleeAttempt": {
        emit({
          kind: "flee",
          hold: VIEW_TIMING.flee,
          uid: event.uid,
          chance: event.chance,
          success: event.success,
          caption: event.success
            ? `${nameOf(event.uid)} escaped · ${pct(event.chance)}`
            : `${nameOf(event.uid)} could not escape · ${pct(event.chance)}`,
        });
        break;
      }

      case "xpGained": {
        emit({
          kind: "xp",
          hold: VIEW_TIMING.xp,
          uid: event.uid,
          amount: event.amount,
          caption: `${nameOf(event.uid)} +${String(event.amount)} XP`,
        });
        break;
      }

      case "levelUp": {
        const learned = event.learnedMoveId ?? null;
        // The new LEVEL is in the log. The new maxHp is not (core/battle.ts:944 raises it from
        // `effectiveStats`, a rules function), so it is RE-READ off the state the reducer returned.
        // With no state to read from, the ledger says so instead of keeping a number it knows is
        // stale — every later HP payload in the same step was being sized against it.
        const levelled = ledgerOf(event.uid);
        levelled.view.level = event.level;
        const raised = absolutes.maxHp?.(event.uid);
        if (raised === undefined) levelled.maxHpKnown = false;
        else {
          levelled.view.maxHp = raised;
          levelled.maxHpKnown = true;
        }
        emit({
          kind: "levelUp",
          hold: VIEW_TIMING.levelUp,
          uid: event.uid,
          level: event.level,
          learnedMoveId: learned,
          learnedMoveName: learned === null ? null : moveName(learned),
          resyncRequired: true,
          caption:
            learned === null
              ? `${nameOf(event.uid)} → Lv ${String(event.level)}`
              : `${nameOf(event.uid)} → Lv ${String(event.level)} · ${moveName(learned)}`,
        });
        break;
      }

      case "lureChanged": {
        lureActive = event.active;
        emit({
          kind: "lure",
          hold: VIEW_TIMING.lure,
          active: event.active,
          caption: event.active ? "Lure active" : "Lure cleared",
        });
        break;
      }

      case "actionRejected": {
        // THE CAPTION IS EMPTY, DELIBERATELY.
        //
        // `StepBase.caption` is "message-line text" — the thing the narration box prints. Putting
        // core's `reason` there put a string core/types.ts:425 calls "a diagnostic, not player-facing
        // copy (G7)" straight onto the screen: the shipped scene printed
        // `only a wild creature can be snared` as the story of the fight, and its own docstring
        // claimed it did not. The compiler is now structurally incapable of that — the diagnostic
        // travels on `reason`, which no message box reads, and the caption carries nothing.
        //
        // It stays EMPTY rather than becoming a player-facing line because neither document supplies
        // one and writing one here would be inventing content (docs/DEVIATIONS-lane-c3.md C3-G4).
        // The player-facing answer to "why can't I do that" is the greyed row.
        emit({
          kind: "rejected",
          hold: VIEW_TIMING.rejected,
          reason: event.reason,
          diagnostic: true,
          caption: "",
        });
        break;
      }

      case "battleEnd": {
        outcome = event.outcome;
        emit({
          kind: "battleClose",
          hold: VIEW_TIMING.close,
          outcome: event.outcome,
          caption: OUTCOME_CAPTION[event.outcome],
        });
        break;
      }
    }
  }

  // Every absolute the ledger tracked — including the LEVEL a `levelUp` moved, which the first cut
  // dropped, so the compiled snapshot reported the pre-level value indefinitely when no `stateAfter`
  // was passed. `displayName` is restored from the input so a `names.battler` override cannot leak
  // into a snapshot that is compared against `BattleState`.
  const battlers: Record<string, BattlerView> = {};
  for (const [uid, view] of Object.entries(snapshot.battlers)) {
    battlers[uid] = { ...ledgerOf(uid).view, displayName: view.displayName };
  }

  return {
    steps,
    snapshot: { turn, kind: snapshot.kind, activePlayerUid, activeEnemyUid, lureActive, outcome, battlers },
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 * 6. The player.
 *
 * A queue of compiled steps plus the snapshot they animate against. The scene
 * pumps it; a test drains it. It holds no timers, so it is engine-agnostic and
 * the same object is exercised headlessly and in Phaser.
 * ════════════════════════════════════════════════════════════════════════════ */

export class BattleView {
  private queue: ViewStep[] = [];
  private view: BattleViewSnapshot;
  private readonly names: BattleViewNames;
  /** Every step ever compiled, in order — the scene's log and the test's assertion surface. */
  readonly played: ViewStep[] = [];

  constructor(state: BattleState, names: BattleViewNames = {}) {
    this.view = snapshotOf(state);
    this.names = names;
  }

  /** The view's current picture of the fight. Absolutes, read from the last sync plus log deltas. */
  get snapshot(): BattleViewSnapshot {
    return this.view;
  }

  get pending(): number {
    return this.queue.length;
  }

  /**
   * Queue one reducer step's worth of events.
   *
   * Pass `stateAfter` (the `BattleStepResult.state` core just returned) and the view re-reads every
   * absolute from it once the deltas are compiled — that is what keeps a `levelUp`'s new max HP,
   * which the log does not carry, correct without this file computing a single stat.
   */
  push(events: readonly BattleEvent[], stateAfter?: BattleState): ViewStep[] {
    // `stateAfter` also serves the compile itself: a `levelUp` raises maxHp inside core and logs
    // only the level, and maxHp cannot change again inside one reducer step except by another
    // level-up. Reading it here is the same absolute read `syncTo` does, one beat earlier.
    const absolutes: BattleViewAbsolutes =
      stateAfter === undefined ? {} : { maxHp: (uid: string): number | undefined => stateAfter.battlers[uid]?.maxHp };
    const { steps, snapshot } = compileBattleEvents(events, this.view, this.names, absolutes);
    this.view = snapshot;
    this.queue.push(...steps);
    this.played.push(...steps);
    if (stateAfter !== undefined) this.syncTo(stateAfter);
    return steps;
  }

  /** Re-read the authoritative absolutes. The ledger animates; `BattleState` decides. */
  syncTo(state: BattleState): void {
    this.view = snapshotOf(state);
  }

  /** Next step to play, or `undefined` when the queue is empty. */
  next(): ViewStep | undefined {
    return this.queue.shift();
  }

  /** Drain the queue — what a headless test or a "skip animation" button does. */
  drain(): ViewStep[] {
    const out = this.queue;
    this.queue = [];
    return out;
  }

  /** Total dwell time of everything still queued, in milliseconds. */
  pendingDuration(): number {
    let total = 0;
    for (const step of this.queue) total += step.hold;
    return total;
  }
}

/** The step kinds, in the order they are declared above — used by tests and by the scene's switch. */
export const VIEW_STEP_KINDS: readonly ViewStepKind[] = [
  "battleOpen",
  "turnBanner",
  "attack",
  "evade",
  "hit",
  "heal",
  "statusApply",
  "statusTick",
  "statusSkip",
  "statusClear",
  "statMod",
  "faint",
  "swap",
  "item",
  "snareThrow",
  "caught",
  "flee",
  "xp",
  "levelUp",
  "lure",
  "rejected",
  "battleClose",
];
