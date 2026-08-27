/**
 * core/types.ts — the complete type surface for TROPHIC.
 *
 * build-doc §7 "Data Models (fully typed)". Pure TypeScript, ZERO engine imports
 * (locked decision L11: the balance harness and the tests import the same module the game runs).
 *
 * Every other lane reads this file and must never need to edit it. Where the build doc names a
 * field, the field name and type here are that name and type verbatim. Additive fields beyond the
 * build doc are marked `[additive]`.
 *
 * NOTE ON CONSTANTS (guardrail G11 / INV-4): nothing in this file is a gameplay number. The `as
 * const` tuples below are the *vocabulary* the schemas and iteration order are built from — the
 * closed set of type names, roles, ages, seasons, statuses and stat keys. All tunable magnitudes
 * live in data/balance.json and are typed by `Balance` at the bottom of this file.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * §7.1 Species
 * ──────────────────────────────────────────────────────────────────────────── */

/** bible §1 — eight types. */
export const TYPE_NAMES = ["Beast", "Fire", "Water", "Plant", "Earth", "Wind", "Poison", "Dark"] as const;
export type TypeName = (typeof TYPE_NAMES)[number];

/** bible §4/§5 — trophic roles. `AncientApex` never participates in the derived web (eats nothing). */
export const ROLES = ["Producer", "Grazer", "Mesopredator", "Apex", "Scavenger", "AncientApex"] as const;
export type Role = (typeof ROLES)[number];

/** build-doc §3 L9 — J3/A2/E1 lifespans. */
export const AGE_CLASSES = ["J", "A", "E"] as const;
export type AgeClass = (typeof AGE_CLASSES)[number];

/** build-doc §7.1 / bible §5 — the four seasonal windows, in clock order. */
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];

/** bible §2 — five stats. Instinct drives crit, bait success and sign-reading quality. */
export const STAT_KEYS = ["hp", "atk", "def", "spd", "ins"] as const;
export type StatKey = (typeof STAT_KEYS)[number];
/** Every stat except HP can be modified in-battle. */
export type ModifiableStatKey = Exclude<StatKey, "hp">;

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  ins: number;
}

/**
 * `habitat` entries are node biome tags, plus two sentinels the bible uses in its habitat column:
 *   "roaming" — build-doc §7.1: all habitats (Carricrow).
 *   "starter" — bible §4 rows 1–3: not wild-spawning; obtained from Warden Maren.
 *   "hidden"  — bible §4 "Steppe (hidden)" / "Marsh (hidden)": present in the node but gated behind
 *               a sign-card chain; the tag rides alongside the real biome tag.
 * Anything else must match a NodeFile.biome (enforced by tests/unit/transcription.test.ts).
 */
export const HABITAT_SENTINELS = ["roaming", "starter", "hidden"] as const;
export type HabitatSentinel = (typeof HABITAT_SENTINELS)[number];

/** build-doc §7.3 — Ancients eat nothing; each exerts a presence effect on the sim instead. */
export const PRESENCE_EFFECTS = ["keystoneBreed", "ventWarmth", "waterTable"] as const;
export type PresenceEffect = (typeof PRESENCE_EFFECTS)[number];

/**
 * The SHAPES a presence effect can take. A structural vocabulary, not a per-Ancient enumeration:
 * `data/species.json` carries exactly one line per effect NAME, so a branch on the name would be
 * `if (this is Undermere)` — the species-shaped branch G6 forbids and the code literal G11 forbids.
 * Lives here (not in core/ecosim.ts) because `Balance.ecosim.presenceEffects` is typed against it
 * and core/types.ts may not import from a sibling module. core/ecosim.ts re-exports it.
 *
 *   `breedMult`     — multiply every line's breeding in range (the typeless keystone).
 *   `typeBreedMult` — multiply breeding of lines carrying `type`.
 *   `typeBreedFloor`— raise the breedRate of lines carrying `type` to at least the magnitude.
 */
export const PRESENCE_MODES = ["breedMult", "typeBreedMult", "typeBreedFloor"] as const;
export type PresenceMode = (typeof PRESENCE_MODES)[number];

/** How one Ancient presence effect acts (bible §4). Entirely data. */
export interface PresenceEffectRule {
  mode: PresenceMode;
  /** The type the effect acts on; absent = it acts on every line in range. */
  type?: TypeName;
  /** Key into `balance.ecosim` holding the magnitude — the number itself never lives here (G11). */
  magnitudeKey: string;
}

/**
 * Move-pool slot names, in unlock order (bible §3 / build-doc §7.1).
 * The unlock LEVELS are not here and must never be: they are gameplay constants and live in
 * `balance.moves.slotUnlockLevels`, keyed by these names (G11 / INV-4).
 */
export const MOVE_SLOTS = ["type1", "type2", "role", "utility"] as const;
export type MoveSlot = (typeof MOVE_SLOTS)[number];

export interface MovePool {
  type1: string;
  type2: string;
  role: string;
  utility: string;
}

/** build-doc §7.1 — species.json entry. 27 lines. */
export interface SpeciesLine {
  id: string; // "mirefin-line"
  dexIds: string[]; // named identities for dex art (35 total incl. age names)
  formNames: Record<AgeClass, string>; // e.g. {J:"Bogling", A:"Mirefin", E:"Mirefin"}
  types: Record<AgeClass, TypeName[]>; // per-age (metamorphic lines shift here)
  role: Record<AgeClass, Role>; // per-age (Bogling Grazer -> Mirefin Mesopredator)
  habitat: string[]; // node biome tags; "roaming" = all
  baseStats: Stats; // 30–100 per stat (bible §2)
  metamorphic: boolean; // true => ×1.15 extra on J->A transition
  ancient: boolean; // never ages, always E, exempt from year turns
  seasonalWindow?: Season; // only the 4 migrants have this
  movePool: MovePool; // ids into moves.json; slot unlock levels live in balance.moves.slotUnlockLevels
  dietExceptions?: string[]; // extra prey line-ids (Fenmaw -> Reedrick)
  presenceEffect?: PresenceEffect; // Ancients only
  /**
   * [additive] bible §5: "Apex eats Mesopredators and **large** Grazers".
   * build-doc §7.1 has no field carrying "large", so the §7.3 derivation could not be written
   * without one. Set only on Barkhide (the sole "Grazer (large)" in bible §4).
   */
  sizeClass?: "large";
}

/* ────────────────────────────────────────────────────────────────────────────
 * §7.2 Node — THE chokepoint schema
 * ──────────────────────────────────────────────────────────────────────────── */

/** bible §4 — environmental decorations that double as sign-chain trailheads. */
export const PROP_KINDS = ["antler-stone", "shell-kiln-shrine", "sunken-idol", "sign-card"] as const;
export type PropKind = (typeof PROP_KINDS)[number];

/** build-doc §7.6 — props overlay the painted map; interaction radius, never baked into collision. */
export interface PropPlacement {
  id: string;
  kind: PropKind;
  /** Position in map-native pixels (1024² painted map space). */
  x: number;
  y: number;
  interactionRadius: number;
  /** Sign-chain this trailhead belongs to, if any (bible §4: Kilnback / Undermere / Vellsire chains). */
  signChain?: string;
  label?: string;
}

export interface NodePopulation {
  count: number; // integer individuals; survey shows THIS number
  breedRate: number; // per-season fractional growth
  carryCap: number;
}

/** build-doc §7.2. `spawnTables: never` is deliberate — encounter weights are DERIVED (G3). */
export interface NodeFile {
  id: string;
  name: string;
  biome: string;
  adjacency: string[]; // node graph edges
  walkable: boolean; // false => vignette card fallback
  mapAsset: string; // base painted map
  yearVariants: Partial<Record<2 | 3 | 4 | 5 | 6, string>>; // only overlay-diff-passed variants listed
  collisionMask: string; // ONE per node, all years (Hard Req 5)
  floraStock: number; // abstract producer stock, 0–100
  populations: Record<string, NodePopulation>; // key = species line id
  props: PropPlacement[]; // antler stones, shrines, idols — sign-chain trailheads
  spawnTables?: never; // deliberately untyped: encounter weights are DERIVED (G3)
}

/** Live per-node sim state carried in the save (build-doc §7.8 `nodeStates`). */
export interface NodeState {
  populations: Record<string, NodePopulation>;
  floraStock: number;
  /** build-doc §7.3 step 5 — accumulator that drives Scavenger encounter weight. */
  recentDeaths: number;
}

/* ────────────────────────────────────────────────────────────────────────────
 * §7.3 Food web (shape only — derivation lives in core/foodweb.ts)
 * ──────────────────────────────────────────────────────────────────────────── */

/** Derived, never stored (G3 / §8.3): the only producer of this shape is core/foodweb.ts. */
export interface FoodWeb {
  nodeId: string;
  /** predator line id -> prey line ids present at this node. */
  edges: Record<string, string[]>;
  /** line ids that graze the node's abstract flora stock. */
  floraFeeders: string[];
}

/** Derived encounter weighting for one species at one node (G3: computed, never a table). */
export interface EncounterWeight {
  lineId: string;
  weight: number;
  /** false when a migrant is out of its seasonalWindow — dex/sign cards read this (Hard Req 10). */
  active: boolean;
  dormantReason?: "dormant" | "migrating";
}

/* ────────────────────────────────────────────────────────────────────────────
 * §7.4 Battle
 * ──────────────────────────────────────────────────────────────────────────── */

/** bible §2 — four statuses. One at a time, newest wins (build-doc §7.4). */
export const STATUS_NAMES = ["Burn", "Toxin", "Soak", "Daze"] as const;
export type StatusName = (typeof STATUS_NAMES)[number];

export interface ActiveStatus {
  name: StatusName;
  /** Turns the status has been active — Toxin ramps off this (build-doc §7.4). */
  turnsActive: number;
}

/** bible §1 — the chart SHAPE is content (moves.json); the multiplier VALUES are tunable (balance.json). */
export interface TypeChartEntry {
  /** Types this type deals ×superEffective to. */
  strongVs: TypeName[];
  /** Types this type takes ×superEffective FROM (the exact dual of strongVs). */
  weakVs: TypeName[];
}
export type TypeChart = Record<TypeName, TypeChartEntry>;

export const MOVE_KINDS = ["type", "role", "utility"] as const;
export type MoveKind = (typeof MOVE_KINDS)[number];

/** bible §3 — "one light (~40 power, secondary effect) + one heavy (~70 power) per type". */
export type MoveWeight = "light" | "heavy";

export type MoveEffect =
  | { kind: "inflictStatus"; status: StatusName; chance: number }
  | {
      kind: "statMod";
      target: "self" | "enemy";
      stat: ModifiableStatKey;
      direction: "up" | "down";
      /** Key into balance.moveEffects.magnitude — magnitudes the bible did not state (G11). */
      magnitudeKey: string;
      /** Secondary-effect probability (bible §3: light type moves are "20% Burn"-shaped). 1 = always. */
      chance?: number;
      /** Duration in turns when the bible states one (Terrify: 2); omitted = balance default. */
      turns?: number;
    }
  | { kind: "heal"; mode: "fracMaxHp" | "damageDealt"; amount?: number }
  | { kind: "bonusVsRole"; role: Role; bonusPower: number }
  | { kind: "priority"; scope: "entryTurn" | "always" }
  | { kind: "evade"; skipTurn: true; magnitudeKey: string }
  | { kind: "catchOdds"; multiplierKey: "lureMult" };

export interface MoveDef {
  id: string;
  name: string;
  kind: MoveKind;
  /** null for role and utility moves (typeless). */
  type: TypeName | null;
  weight?: MoveWeight; // type moves only
  power: number; // 0 = non-damaging
  role?: Role; // role moves only: which role learns it
  effects: MoveEffect[];
  /** The bible's own parenthetical for this move, transcribed. */
  text: string;
  /** [additive] display alias — bible §3 lists one utility as "Burrow/Roost". */
  altName?: string;
  coined?: boolean; // true => name coined by the agent (G15 IP sweep)
}

export interface MovesFile {
  moves: MoveDef[];
  typeChart: TypeChart;
}

export type EffectivenessBand = "super" | "neutral" | "resisted";

/** bible §2 — traits are flat ±10% modifiers with names; the 10% lives in balance.json. */
export interface Trait {
  id: string;
  name: string;
  stat: StatKey;
  direction: "up" | "down";
  rarity: "common" | "rare";
}

/** build-doc §7.5 — retirement BOON: permanent +10% to one stat, named after the retiree. */
export interface Boon {
  id: string;
  name: string;
  stat: StatKey;
  sourceUid: string;
  sourceFormName: string;
  grantedYear: number;
}

export const SNARE_TIERS = ["base", "weighted", "master"] as const;
export type SnareTier = (typeof SNARE_TIERS)[number];

export const BAIT_MATCHES = ["none", "role", "species"] as const;
export type BaitMatch = (typeof BAIT_MATCHES)[number];

/** Serialized combatant spec — the input side of a battle (build-doc §7.4). */
export interface BattlerSpec {
  uid: string;
  lineId: string;
  age: AgeClass;
  level: number;
  traits: Trait[];
  boons?: Boon[];
  /** Optional HP carry-in; omitted = full. */
  curHp?: number;
  /**
   * Optional XP carry-in — XP banked toward the next level (build-doc §7.4); omitted = 0.
   *
   * ⚠ THIS FIELD IS THE READ-BACK HALF OF THE XP LOOP. `core/save.ts` `applyBattleAftermath` has
   * always written `OwnedCreature.xp` OUT after a fight; with no field to carry one back IN,
   * `core/battle.ts` `makeBattler` started every battler at 0 and the banked total was discarded at
   * the next fight's first frame. Measured on shipped balance, that made levelling nearly
   * unreachable from wild fights: a level-5 creature needs `xpToNext(5)` ≈ 142.8 and one level-5
   * Adult enemy pays `xpGain` = 32, so only a long roster in a single fight could cover it. (It was
   * not literally impossible — at level 1 the first enemy pays 16 against a threshold of 15 — but
   * every level above the first was.)
   *
   * Carried, never derived: `game/wild-battle.ts` `battlerSpecOf` copies the owned creature's field
   * verbatim, so what a battler enters a fight with is a pure function of the save and a replay
   * (L10) sees the same number.
   */
  xp?: number;
  /** Optional explicit move ids; omitted = derived from the line's movePool at this level. */
  moves?: string[];
  nickname?: string;
  /** true once the metamorphic J->A jump has been applied (build-doc §7.4). */
  metamorphosed?: boolean;
}

export const BATTLE_KINDS = ["wild", "trainer", "gym", "ancient"] as const;
export type BattleKind = (typeof BATTLE_KINDS)[number];

/** build-doc §7.4 — "Battle runs entirely in core/battle.ts off a serialized BattleInput". */
export interface BattleInput {
  seed: number;
  kind: BattleKind;
  playerParty: BattlerSpec[];
  enemyParty: BattlerSpec[];
  /** Node the encounter happened at — catch success decrements THIS node's population. */
  nodeId?: string;
  /** Snares/baits/medicines carried into this battle: item id -> quantity. */
  bag?: Record<string, number>;
}

/** Live combatant inside BattleState. */
export interface Battler {
  uid: string;
  lineId: string;
  formName: string;
  nickname?: string;
  age: AgeClass;
  level: number;
  types: TypeName[];
  role: Role;
  /** Effective stats per build-doc §7.4 (base × ageMult × (1 + 0.02 × level) + traitMods). */
  stats: Stats;
  maxHp: number;
  curHp: number;
  status: ActiveStatus | null;
  /** Multiplicative in-battle modifiers from statMod effects; 1.0 = unmodified. */
  statMods: Record<ModifiableStatKey, number>;
  /** Remaining turns per active statMod source, keyed by move id. */
  statModTurns: Record<string, number>;
  moves: string[];
  traits: Trait[];
  side: "player" | "enemy";
  isWild: boolean;
  fainted: boolean;
  /** Turn index this battler entered on — Ambush is "always first on entry turn" (bible §3). */
  enteredOnTurn: number;
}

export type BattleAction =
  | { kind: "move"; moveId: string }
  | { kind: "switch"; uid: string }
  | { kind: "item"; itemId: string; targetUid?: string }
  | { kind: "snare"; tier: SnareTier; baitId?: string }
  | { kind: "flee" };

export type BattleOutcome = "win" | "loss" | "fled" | "caught" | "escaped";

export interface BattleState {
  seed: number;
  kind: BattleKind;
  turn: number;
  battlers: Record<string, Battler>;
  playerOrder: string[];
  enemyOrder: string[];
  activePlayerUid: string;
  activeEnemyUid: string;
  /** Lure raises catch odds "on this target this battle" (bible §3). */
  lureActive: boolean;
  bag: Record<string, number>;
  nodeId?: string;
  outcome: BattleOutcome | null;
  /** Set when outcome === "caught": the wild battler that was snared. */
  caughtUid?: string;
}

export type BattleEvent =
  | { t: "battleStart"; kind: BattleKind; playerUid: string; enemyUid: string }
  | { t: "turnStart"; turn: number }
  | { t: "moveUsed"; uid: string; moveId: string }
  | {
      t: "damage";
      uid: string;
      amount: number;
      effectiveness: EffectivenessBand;
      predation: boolean;
      crit: boolean;
    }
  | { t: "heal"; uid: string; amount: number }
  | { t: "statusApplied"; uid: string; status: StatusName; replaced: StatusName | null }
  | { t: "statusTick"; uid: string; status: StatusName; amount: number }
  | { t: "statusSkip"; uid: string; status: StatusName }
  | { t: "statusCleared"; uid: string; status: StatusName }
  | { t: "statChanged"; uid: string; stat: ModifiableStatKey; direction: "up" | "down"; turns: number }
  | { t: "faint"; uid: string }
  | { t: "switched"; side: "player" | "enemy"; fromUid: string; toUid: string }
  | { t: "itemUsed"; itemId: string; uid: string }
  | { t: "snareThrown"; uid: string; tier: SnareTier; chance: number; shakes: number; caught: boolean }
  | { t: "caught"; uid: string; lineId: string; nodeId?: string }
  | { t: "fleeAttempt"; uid: string; chance: number; success: boolean }
  | { t: "xpGained"; uid: string; amount: number }
  | { t: "levelUp"; uid: string; level: number; learnedMoveId?: string }
  /*
   * The three below were added at INTEGRATION. Lane A3 needed them and could not add them:
   * core/types.ts was another lane's file, so it left them as a reported blocker and worked around
   * each one. build-doc §4 makes the Phaser scene "a renderer of its event log", so a beat that
   * never reaches the log is a beat the scene cannot narrate.
   */
  /** bible §3 Burrow/Roost — the defender's incoming damage was reduced by an active evade. */
  | { t: "evaded"; uid: string; reduction: number }
  /** bible §3 Lure — catch odds on the current target changed (raised, or cleared by a switch). */
  | { t: "lureChanged"; active: boolean }
  /**
   * The action was refused and NOTHING happened. Without this, `step()` answered an illegal action
   * with an empty event list, indistinguishable from a turn in which nothing occurred — so a UI
   * could not grey the button and a harness could spin on it forever. `reason` is
   * `illegalActionReason`'s string; it is a diagnostic, not player-facing copy (G7).
   */
  | { t: "actionRejected"; reason: string }
  | { t: "battleEnd"; outcome: BattleOutcome };

/** build-doc §7.4 — "Battle is a pure reducer: (BattleState, Action, rng) => {state, events[]}". */
export interface BattleStepResult {
  state: BattleState;
  events: BattleEvent[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * §7.5 Party, Aging, Retirement
 * ──────────────────────────────────────────────────────────────────────────── */

/** build-doc §7.5, verbatim. */
export interface OwnedCreature {
  uid: string;
  lineId: string;
  age: AgeClass;
  level: number;
  caughtYear: number;
  yearsRemaining: number; // J:3 A:2 E:1 at catch
  traits: Trait[];
  relicSlot?: string;
  boons: Boon[];
  projectedRetirementYear: number; // displayed on card (Hard Req from bible)
  /** [additive] carried so §7.4 can apply the metamorphic ×1.15 exactly once. */
  metamorphosed?: boolean;
  nickname?: string;
  xp?: number;
  curHp?: number;
  /** true while the creature sits in the box — boxed creatures still age (G10). */
  boxed?: boolean;
}

/** build-doc §7.5 step 3 — the player chooses HEIR or BOON when a creature reaches 0 years. */
export type RetirementChoice =
  | {
      kind: "heir";
      parentUid: string;
      /** 1–2 randomly chosen parent traits (count from balance.retirement). */
      inheritedTraitIds: string[];
      heirUid: string;
    }
  | { kind: "boon"; parentUid: string; targetUid: string; stat: StatKey };

export interface RetirementPrompt {
  parentUid: string;
  lineId: string;
  formName: string;
  level: number;
  traits: Trait[];
  relicSlot?: string;
  /** Candidate traits the heir could inherit. */
  inheritableTraitIds: string[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * §7.6 Maps & Collision
 * ──────────────────────────────────────────────────────────────────────────── */

/** build-doc §7.6 — 1-bit mask sampled on a 16px grid into a packed bitfield at build time. */
export interface CollisionGrid {
  nodeId: string;
  cols: number;
  rows: number;
  cellPx: number;
  /** Packed bitfield, row-major; 1 = blocked. */
  bits: Uint8Array;
}

/* ────────────────────────────────────────────────────────────────────────────
 * §7.7 Gyms — ghost-compatible schema (G8: schema only, never a ghost feature)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface GymTeamSlot {
  lineId: string;
  age: AgeClass;
  level: number;
  traits?: Trait[];
  nickname?: string;
}

export interface GymLeader {
  id: string;
  town: string;
  type: TypeName | "mixed";
  slots: GymTeamSlot[];
  signature: GymTeamSlot;
  source: "fixed" | "ghost";
  /** [additive] display name ("Magnate Greaves"). */
  name: string;
  /**
   * The ACT this leader belongs to — bible §7's leftmost column, which the bible labels "Yr".
   *
   * ⚠ RENAMED FROM `year`. It was never a calendar year: the harness has always read it as
   * "how far along the player is" (`tools/harness/player.ts` `actNodeIds`), and content-bible §6's
   * "Six acts = six years" equation is what made the two look like one axis. Under the amended L8
   * the calendar is unbounded and story progression is `core/acts.ts`'s, so a leader beaten in
   * calendar year 11 is still the act-4 leader. The field is named for the axis it is on so nobody
   * re-conflates them.
   */
  act: number;
}

/**
 * content-bible §8 — the RIVAL's standing encounter for one act.
 *
 * "Wick — a Cullbrand Company apprentice your age. **Battles you each act.** … **His team always
 * includes Carricrow**." Both clauses were unbuilt: `data/gyms.json` held six leaders and no rival,
 * nothing in `game/` mentioned him, and all eighteen of his `battle-*` entries were unreachable.
 *
 * Deliberately NOT a `GymLeader`:
 *   • no `town` — he stands on a ROUTE, and `gymAtNode` keys on `town`, so a rival row in `gyms[]`
 *     would put a badge-awarding gym on Route 1;
 *   • no `type` and no `source` — he is not a type-specialist and there is no ghost variant of him;
 *   • no `name` — the display name is `data/dialogue.json`'s speaker table, which already carries
 *     it and which the voice lane owns.
 *
 * `id` is the DIALOGUE SPEAKER id, because that is the join: the battle-kind selector asks the
 * corpus for (speaker, node, kind) and the corpus's own `when` decides whether the encounter is
 * still standing. There is no second "has he been fought" model in code.
 */
export interface RivalEncounter {
  /** The `data/dialogue.json` speaker id — the join to his eighteen `battle-*` entries. */
  id: string;
  /** The act this encounter belongs to (`core/acts.ts` `actOf`), never a calendar year. */
  act: number;
  /** The node he is standing on — a route, or the Sanctum approach in the last act. */
  node: string;
  slots: GymTeamSlot[];
  /** bible §8 — "his team always includes Carricrow"; this is that slot, sent out last. */
  signature: GymTeamSlot;
}

/* ────────────────────────────────────────────────────────────────────────────
 * §7.8 Save
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * One party member as a finished battle left it. ABSOLUTE values, never deltas.
 *
 * Absolute because the tape has to be replayable out of order-independence trouble: a delta applied
 * twice is wrong twice, while `curHp = 7` applied twice is still 7. `core/save.ts` `replay` and the
 * live path apply the SAME record through the SAME function — `core/save.ts` `applyBattleAftermath`
 * — so there is no second answer to "what did that fight cost".
 *
 * ⚠ IT LIVES HERE RATHER THAN IN `core/save.ts` BECAUSE `GameAction` NAMES IT, and this file has
 * ZERO imports and must keep them (see the header, and the `PRESENCE_MODES` note: core/types.ts may
 * not import from a sibling module). A union member typed against a sibling's interface is therefore
 * not expressible, and restating the shape inline would be two homes for one record. `core/save.ts`
 * re-exports both names, so every existing importer is untouched.
 */
export interface BattleAftermathMember {
  uid: string;
  /** `Battler.curHp` at the last event of the fight. 0 = fainted. */
  curHp: number;
  /** `Battler.level` — the reducer's, after any in-battle level-up. */
  level: number;
  /** XP banked toward the next level (`core/battle.ts` `xpOf`). */
  xp: number;
}

/**
 * Everything one battle changed about the save's party and bag. The XP CARRY-IN caveat this record
 * is half of is written where the applier is, on `core/save.ts` `applyBattleAftermath`.
 */
export interface BattleAftermath {
  party: BattleAftermathMember[];
  /** The bag as the reducer left it — `BattleState.bag`, which items were spent out of. */
  items: Record<string, number>;
}

/**
 * One blackout, as the tape carries it. ABSOLUTE values, never deltas — the same rule
 * {@link BattleAftermathMember} states and for the same reason: applied twice it must still say the
 * same thing.
 *
 * `restored` is a list of uids and NOT a list of HP numbers, and that is the absolute form here:
 * "full" is one value, and this codebase already spells it — `game/wild-battle.ts` `isStanding`,
 * "`curHp === undefined` means full". So `core/save.ts` `applyBlackout` RESTORES by deleting
 * `curHp`, which is exactly the state `core/lifecycle.ts` `newOwnedCreature` leaves a creature in
 * and exactly what `core/battle.ts` `makeBattler` reads as `maxHp`. Writing numbers instead would
 * mean a third spelling of build-doc §7.4's effective-stat formula living in a file that has no
 * business knowing it.
 *
 * ⚠ IT LIVES HERE RATHER THAN IN `core/save.ts` FOR THE REASON {@link BattleAftermathMember} DOES,
 * and it moved here for that reason: `GameAction` names it, and this file has ZERO imports and must
 * keep them. `core/save.ts` re-exports the name, so every existing importer is untouched. The move
 * costs nothing — the record is two primitives and drags no dependency behind it.
 */
export interface BlackoutRecovery {
  /** The node the player wakes in. A node with an inn — `core/recovery.ts` `wakeNodeFor` picks it. */
  wakeNode: string;
  /** Every party uid put back on its feet, at full. Absolute; re-applying it changes nothing. */
  restored: readonly string[];
}

export type GameAction =
  | { t: "travel"; to: string }
  | { t: "foray"; nodeId: string }
  | { t: "inn"; townId: string }
  /**
   * A battle STARTING — the clock cost, not the fight. `battleAction` below is a move inside one
   * and is free; this is the single `clock.battleTicks` charge levied at launch. It carries the
   * launch site so a replay can tell a wild encounter from a gym, a rival or the finale.
   */
  | { t: "battle"; kind: "wild" | "gym" | "rival" | "ancient"; nodeId: string }
  | { t: "battleAction"; action: BattleAction }
  /**
   * What a finished fight left on the party and the bag — absolute, and applied by
   * `core/save.ts` `applyBattleAftermath` on the live path and the replay path alike.
   */
  | { t: "battleAftermath"; aftermath: BattleAftermath }
  /**
   * A catch — the population write AND the creature. `gained` is the individual
   * `core/lifecycle.ts` `newOwnedCreature` built, carried WHOLE and ABSOLUTE (applied twice it is
   * still the same creature), because NOTHING else on the tape can rebuild it: the encounter roll,
   * the trait roll and the fight that fixed its age, level and traits are not logged at all. Without
   * it `core/save.ts` `replay` applied the population half and dropped the creature, and locked
   * decision L10 was false for every run containing a catch. Optional so a tape written before it
   * still loads and replays unchanged (INV-2); `core/save.ts` `catchAction` is the constructor that
   * fills it in, and `applyCaught` is the one applier both paths come through.
   */
  | { t: "catch"; nodeId: string; lineId: string; uid: string; gained?: OwnedCreature }
  | { t: "release"; nodeId: string; lineId: string; uid: string }
  | { t: "seasonStep"; season: Season }
  | { t: "gymVictory"; gymId: string }
  | { t: "yearTurn"; year: number }
  | { t: "retirement"; choice: RetirementChoice }
  /**
   * A WIPED party put back on its feet — where the player woke and who stood up, absolute, and
   * applied by `core/save.ts` `applyBlackout` on the live path and the replay path alike. It is the
   * only action that moves `currentNode` without a `travel` of its own reaching a replay handler,
   * so a tape replayed without it leaves the player on the route they went down on with a party
   * still at zero — the unactable save `core/recovery.ts` exists to prevent.
   *
   * ⚠ IT CARRIES NO PRICE. The blackout's cost is levied as the priced entries `core/recovery.ts`
   * `BLACKOUT_COST` names — two `inn`s and a `travel` — and an entry is a price or a consequence
   * and never both.
   */
  | { t: "blackout"; recovery: BlackoutRecovery }
  /**
   * ONE NIGHT AT AN INN — who it put at full, absolute, and applied by `core/save.ts`
   * `restoreParty` on the live path and the replay path alike. `restored` is a uid list for the
   * reason {@link BlackoutRecovery}'s is: "full" is the DELETED `curHp`, so the entry needs no
   * predicate and no stat formula to be applied, and applying it twice is applying it once.
   *
   * ⚠ IT CARRIES NO PRICE, and here that is load-bearing rather than doctrinal. The rest's cost is
   * the `{t:"inn", townId}` entry `game/scenes/OverworldScene.ts` `restAtInn` writes beside it,
   * which `game/year-replay.ts` `clockFromLog` prices out of `balance.clock.innTicks`. Deriving the
   * heal from that priced entry instead would fire it on the TWO `{t:"inn"}` entries
   * `core/recovery.ts` `BLACKOUT_COST` levies as well — the blackout restored three times, by two
   * rules that disagree the moment `balance.medicine.innRestFullHeal` is retuned to false.
   *
   * ⚠ IT NEEDS A NAMED `case` IN `replay` AND IT WENT WITHOUT ONE. `core/recovery.ts` minted this
   * entry while `replay`'s switch had no arm for it, so an inn rest fell through `default` and
   * applied NOTHING: live the party came back at full, replayed it stayed hurt, and L10 was false
   * for any run that slept. Nothing player-facing broke only because `replay` has no production
   * caller yet — the invariant was the casualty, and it is the invariant the demo's determinism
   * tests stand on.
   */
  | { t: "innRest"; restored: readonly string[] };

/** build-doc §8.1 / L10 — identical (seed, actionLog) ⇒ byte-identical final save. */
export interface ActionLogEntry {
  seq: number;
  year: number;
  tick: number;
  /**
   * The sub-tick the action was taken at. Optional so a log written before battles cost time still
   * satisfies the type and replays as `0`; `appendAction` always writes it. Without it a replay of
   * a log containing an odd number of half-tick battles lands a sub-tick short of the original,
   * which L10 forbids — identical (seed, actionLog) must give a byte-identical save.
   */
  subTick?: number;
  action: GameAction;
}

/** build-doc §7.8. Migration: refuse older versions with a clear message (demo scope). */
export interface SaveFile {
  /**
   * build-doc §7.8 shows `{version:1, …}`; 1 is the shipped VALUE, not the rule. The one home for
   * the number is `balance.party.saveVersion` (INV-3: retuning balance touches balance.json only),
   * and core/save.ts checks a loaded save against it. Pinning `1` as a TYPE here made bumping that
   * tunable produce a save the build that wrote it could not load — resolved at integration.
   */
  version: number;
  seed: number;
  year: number;
  tick: number;
  /**
   * The fraction of a tick owed but not yet whole — see `ClockState.subTick`. Optional on the type
   * so a save written before battles cost time still satisfies it and reads as `0`; `core/save.ts`
   * always writes it.
   */
  subTick?: number;
  /**
   * Steps walked since the last foray tick was charged, persisted so quitting mid-excursion does
   * not refund the walk. It used to be scene state only, which made a save-and-reload a free reset
   * of the odometer; that is the same hole as the node-change reset removed alongside it.
   */
  forayStepsSinceTick?: number;
  currentNode: string;
  /**
   * The building interior the player is standing INSIDE — a `core/interiors.ts`
   * `InteriorBlueprint.id`. Absent means outdoors, which is why it is optional: every save written
   * before interiors existed loads and opens outside (INV-2), and every save written outdoors omits
   * it entirely rather than carrying a null.
   *
   * ⚠ `currentNode` KEEPS NAMING THE TOWN while this is set, and that is not a convenience — it is
   * the reason an interior is modelled this way at all. Nine places resolve a location by id and
   * throw or answer wrong on one they do not know: `OverworldScene.nodeFile`, `game/wild-battle.ts`
   * `liveNodeOf` and its eighteen callers, `forayContext`, and `game/survey-view.ts`; two more fail
   * SILENTLY (`SurveyScene`'s `indexOf` → -1 → node[0], and `unlockActOf(unknown)` → null, which
   * makes the act gate PASS). An interior id in `currentNode` would therefore throw inside
   * `Scene.init` and hand the player a black canvas on reload. It never goes there.
   *
   * It is not on the replay tape either, and must not be: entering a building costs no tick and
   * changes no simulated state, and `core/save.ts`'s contract is that a log entry is either a price
   * or an absolute consequence. Position is not modelled by the tape, so a replay of a save written
   * indoors reproduces the same world with the player outside it — which is the same thing the tape
   * already does with `movement.tile`.
   */
  interiorId?: string;
  party: OwnedCreature[];
  box: OwnedCreature[];
  money: number;
  items: Record<string, number>;
  questFlags: Record<string, boolean | number | string>;
  /** full NodeFile.populations + floraStock per node — this IS the live sim. */
  nodeStates: Record<string, NodeState>;
  actionLog: ActionLogEntry[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * Palette (build-doc §8.4) — 32 colors, k-means over the approved trial set, frozen at gate B0.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface PaletteSwatch {
  id: string;
  hex: string;
}

export interface PaletteFile {
  /** false until gate B0 freezes it; the freeze is a value swap, not a schema change. */
  frozen: boolean;
  frozenAt: string | null;
  source: string;
  colorCount: number;
  colors: PaletteSwatch[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * Balance (data/balance.json) — EVERY tunable. G11/INV-4: no gameplay constant in code.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface Balance {
  /** bible §1 — multiplier values (the chart SHAPE is content and lives in moves.json). */
  types: {
    superEffective: number;
    resisted: number;
    neutral: number;
    /** build-doc §7.4 — attacker's derived diet includes defender's line. */
    predation: number;
    /** bible §1 — Beast is strong vs nothing and gets +10% base stats instead. */
    beastBaseStatBonus: number;
  };
  age: {
    multiplier: Record<AgeClass, number>;
    /** build-doc §7.4 — metamorphic J->A adds ×1.15 once. */
    metamorphicJump: number;
    /** build-doc §3 L9 / bible §4 — lifespan on catch. */
    lifespanYears: Record<AgeClass, number>;
    /** Years spent in each class before advancing (J->A->E). */
    yearsInClass: Record<AgeClass, number>;
  };
  stats: {
    levelCoefficient: number;
    traitModPct: number;
    boonModPct: number;
    baseStatMin: number;
    baseStatMax: number;
  };
  /**
   * bible §2 — "Traits: flat ±10% modifiers with names. 1 per wild creature, +1 slot via
   * inheritance, Elders roll rare traits." The magnitude is `stats.traitModPct`; the pool carries
   * only identity, so no trait repeats a number (G11).
   */
  traits: {
    slotsPerWildCreature: number;
    inheritedSlotBonus: number;
    maxSlots: number;
    /** Chance an Elder's roll comes from the rare pool instead of the common one. */
    elderRareChance: number;
    pool: Trait[];
  };
  damage: {
    rollMin: number;
    rollMax: number;
    critMultiplier: number;
    critChanceBase: number;
    critChancePerInstinct: number;
    minDamage: number;
  };
  status: {
    /**
     * NOTE: the light-type-move apply chance is deliberately NOT here. bible §3 states it per move
     * ("Singe (40, 20% Burn)"), so it is content and has exactly one home: the move's own
     * `inflictStatus.chance` in moves.json. Two homes for one number is a retune that silently does
     * nothing (INV-3).
     */
    burnChipFracPerTurn: number;
    toxinChipFracPerTurn: number;
    toxinRampPerTurn: number;
    toxinMaxFracPerTurn: number;
    soakSpdMult: number;
    dazeSkipChance: number;
    /** build-doc §7.4 — one status at a time, newest wins; none expire on their own. */
    persistUntilCured: boolean;
  };
  /** bible §3 — "4 move slots … unlocked at levels 1/5/10/15", keyed by movePool slot name. */
  moves: {
    slotUnlockLevels: Record<MoveSlot, number>;
  };
  /** Magnitudes for effects the bible names but does not number (G11 keeps them out of code). */
  moveEffects: {
    magnitude: Record<string, number>;
    defaultStatModTurns: number;
  };
  /**
   * Battle-reducer tunables the bible names without numbering (merged at integration from
   * data/balance.additions.A3.json). `evadeTurns` is how long a Burrow/Roost evade lasts (bible §3
   * "skip turn, +evasion"); `statusWearOffTurns` is consulted ONLY when `status.persistUntilCured`
   * is false — inert at ship, present so flipping the advertised flag actually changes behaviour.
   */
  battle: {
    evadeTurns: number;
    statusWearOffTurns: number;
  };
  catch: {
    baseCatch: Record<AgeClass, number>;
    baseCatchAncient: number;
    snareTier: Record<SnareTier, number>;
    baitMult: Record<BaitMatch, number>;
    /**
     * build-doc §7.4 as amended 2026-08-25 — bible §2's "bait success" job for
     * Instinct. The bait term is multiplied by `1 + instinctBaitSlope × (insShare − instinctBaitPivot)`,
     * where `insShare` is the CATCHING creature's Instinct as a fraction of its five effective stats.
     * `instinctBaitPivot` is the allocation at which the term is 1 (the roster median, 45/300).
     */
    instinctBaitPivot: number;
    instinctBaitSlope: number;
    lureMult: number;
    hpTermOffset: number;
    hpTermDivisor: number;
    clampMin: number;
    clampMax: number;
    shakes: number;
  };
  /**
   * bible §11 — "Medicines — salve (field heal), tonic (status cure), inn rest (full heal, 2
   * ticks)." The bible names the effects without numbering them, so the magnitudes are tunables;
   * the item ids live here too so `BattleAction {kind:"item"; itemId}` resolves without a code
   * literal (G11). The inn's tick cost is `clock.innTicks`.
   */
  medicine: {
    salveItemId: string;
    salveHealFracMaxHp: number;
    tonicItemId: string;
    tonicClearsStatus: boolean;
    innRestFullHeal: boolean;
  };
  xp: {
    base: number;
    perEnemyLevel: number;
    ageBonus: Record<AgeClass, number>;
    toNextCoefficient: number;
    toNextExponent: number;
    levelCap: number;
    starterLevel: number;
  };
  flee: {
    base: number;
    spdCoefficient: number;
    clampMin: number;
    clampMax: number;
  };
  ecosim: {
    foodFactorClampMin: number;
    foodFactorClampMax: number;
    starveThreshold: number;
    starveRate: number;
    predationDraw: number;
    keystoneBreedMult: number;
    ventWarmthBreedMult: number;
    waterTableBreedFloor: number;
    presenceRadiusNodes: number;
    recentDeathsDecayPerSeason: number;
    /**
     * Which age class's `role` drives the derived web for an age-structured line (bible §5: "the
     * population sim tracks the line as one age-structured species", while NodeFile.populations
     * carries one scalar count). "A" = the adult role.
     */
    webRoleAgeClass: AgeClass;
    /**
     * demand[s] = count[s] × demandPerIndividual[role of s]. Per-ROLE: one global figure cannot
     * make an Apex starve when its prey crash without starving every Mesopredator at the shipped
     * state. A role whose value is 0 has NO live diet (bible §5: Producers photosynthesise,
     * Scavengers "eat nothing live", Ancients "eat nothing") — those use `noDietFoodFactor` and
     * skip the §7.3 step-2 starvation check entirely.
     */
    demandPerIndividual: Record<Role, number>;
    /** foodFactor for a role with no live diet (demandPerIndividual = 0). Never starves. */
    noDietFoodFactor: number;
    floraPreyUnitsPerPoint: number;
    floraRegenPerSeason: number;
    floraMin: number;
    floraMax: number;
    populationFloor: number;
    /**
     * [merged at integration from data/balance.additions.A2.json] build-doc §7.3 steps 2 and 4
     * leave a gap between them: `deaths = count × starveRate` alone lets a starving population of
     * 3 sit at 1 individual indefinitely, so `apex count → 0` (§10.2) is a likelihood, not a law.
     * These two make starvation terminal. General rules over every species at every node (G6).
     */
    starveMinDeathsPerSeason: number;
    starveSuppressesBirths: boolean;
    /** bible §4 — how each Ancient presence effect acts, and on what. Keyed by effect name. */
    presenceEffects: Partial<Record<PresenceEffect, PresenceEffectRule>>;
  };
  /**
   * [merged at integration from data/balance.additions.A2.json] build-doc §10.2 states the
   * `cascade_emerges` property in numbers. They are thresholds of the CLAIM, not of the sim, so
   * they live in data rather than as literals in the property test.
   */
  cascade: {
    preyForcedFraction: number;
    forcingSeasons: number;
    apexCollapseSeasons: number;
    mesoReleaseSeasons: number;
    /** Fraction of seeds where a meso forced to ≥1 is still alive when the apex reaches 0. */
    mesoSurvivesForcingMinFraction: number;
    /** Fraction of generated cascades that leave a mesopredator to be released. */
    releaseCoverageMinFraction: number;
  };
  clock: {
    ticksPerSeason: number;
    ticksPerYear: number;
    /**
     * TIME RESOLUTION — how finely an action cost may be expressed, and the reason the clock can
     * charge half a tick without a float ever entering `ClockState`.
     *
     * Every cost below is written in TICKS, as a human reads them ("a battle costs half a tick"),
     * and is converted once, at the edge, into an integer count of sub-ticks:
     * `Math.round(cost * subTicksPerTick)`. All clock arithmetic downstream of that conversion is
     * integer, so a replay is byte-identical and no accumulated float drift is possible — which is
     * the whole reason this key exists rather than a `tick: number` that happens to hold 0.5.
     *
     * It is the ONLY thing to change to make finer costs expressible: raise it to 4 and quarter
     * ticks become legal, to 10 and tenths do. `core/schemas.ts` refuses any cost that is not an
     * exact multiple of `1 / subTicksPerTick`, so an unrepresentable cost is a boot failure and
     * never a silent rounding.
     */
    subTicksPerTick: number;
    travelTicks: number;
    forayTicks: number;
    innTicks: number;
    /** Charged once per battle, at launch — see `OverworldScene.launchBattle`. */
    battleTicks: number;
    seasonOrder: Season[];
    startYear: number;
    startTick: number;
    yearsTotal: number;
  };
  encounter: {
    /**
     * build-doc §4: "A foray step rolls encounters" (plural) while §3 L8 charges a foray ONE tick.
     * A foray is therefore an excursion of `stepsPerForay` rolls at `encounterChancePerStep` each;
     * the product with clock.ticksPerYear is the player's maximum encounters per year at one node,
     * which is what makes the year-1 over-catch beat reachable (build-doc §1 / §15 I2).
     */
    stepsPerForay: number;
    /**
     * Chance of meeting something on ONE step **taken on an encounter tile**. It is not the chance
     * per walked step: see `encounterTileFraction`, which is the other half of the product.
     */
    encounterChancePerStep: number;
    /**
     * GRASS GATING — the fraction of a node's walkable cells that are encounter tiles.
     *
     * Encounters do not roll on every walked step; they roll on the tall-grass share of the map.
     * The effective per-step rate is `encounterTileFraction * encounterChancePerStep`, so this key
     * is the lever on how dense the region is without touching what an encounter tile itself is
     * worth.
     *
     * It is a NUMBER rather than a mask because no maps exist yet — `assets/final/` holds one empty
     * file and 287 of 288 manifest rows are unstarted. When painted maps land, each node gains an
     * encounter mask beside its `collisionMask` and the sampled share replaces this value per node;
     * this stays as the fallback for any node that declares none, which is why it is a fraction of
     * walkable cells and not a step count. Nothing about the roll order changes when that happens.
     */
    encounterTileFraction: number;
    outOfSeasonWeight: number;
    scavengerRecentDeathsDivisor: number;
    /**
     * Habitat tag marking a line as gated behind a sign-card chain (bible §4: the Ancients are
     * "very hard catches, gated behind rare sign-card chains"). A line carrying it is held out of
     * the ordinary derived encounter pool until its chain completes — the rule lives here so no
     * lane has to hard-code "hidden" or special-case `ancient` (G11).
     */
    signChainGatedHabitatTag: string;
    /**
     * The node whose sign-chain-gated lines stay out of the ordinary encounter pool until the
     * finale has been earned (`acts.runCompleteFlag`).
     *
     * bible §8's finale is a scripted meeting in the Sanctum ring, not a foray roll. Without this
     * the chain alone unlocked it: `maren.keystone.6` writes `chain.vellsire.complete` at act 6 with
     * no Greaves requirement, so a player could walk into the Sanctum, forage, roll the stag and
     * snare it before the approach cutscene had ever played — and the cutscene then narrated an
     * animal the survey said was gone. The FLAG is not repeated here on purpose: `acts
     * .runCompleteFlag` already spells it and `core/acts.ts` `runCompleteFlag()` is the reader, so
     * this key names only the NODE the gate applies at. The other two Ancients (`kilnback-line` at
     * cindershelf, `undermere-line` on r2) are unaffected and stay wild.
     */
    finaleGatedNode: string;
    ageWeights: Record<AgeClass, number>;
    levelByYear: number[];
    levelJitter: number;
    minLevel: number;
  };
  retirement: {
    heirLevelFactor: number;
    heirInheritedTraitsMin: number;
    heirInheritedTraitsMax: number;
    /**
     * [merged at integration from data/balance.additions.A4.json] floor on an heir's level —
     * `floor(parentLevel × heirLevelFactor)` gives 0 for a level-1 parent, and bible §2 says
     * "Levels 1–40". `encounter.minLevel` is a different rule (the WILD encounter floor).
     */
    heirLevelMin: number;
    /**
     * [merged at integration from data/balance.additions.A4.json] how many boons ONE stat may
     * carry. build-doc §7.5 step 3 sizes the boon (+10%) but counts nothing, so six Elders
     * retiring on one turn could put +60% on one survivor. Matched to `traits.maxSlots`.
     */
    boonMaxStacksPerStat: number;
    /**
     * NOTE: there is deliberately no `boonStatPct` here. The boon's magnitude is
     * `stats.boonModPct` and has exactly one home — the duplicate was deleted at integration:
     * core/battle.ts read one key and core/lifecycle.ts the other, so retuning either alone made
     * the creature card and the battle disagree.
     */
  };
  /**
   * The ACT MODEL (core/acts.ts) — the second of the game's two clocks.
   *
   * Acts are driven by badges and quest flags and NEVER by time. They gate town/route unlocks,
   * story beats, the Cullbrand raids, rival encounters and the finale; the calendar drives aging,
   * retirement, the ecosim's season steps, map year-variant art and the season tint, and the two do
   * not touch.
   *
   * The gate ROWS are content-bible §6/§7 transcribed (which town, which route, which leader), and
   * the thresholds are tunables — both live here because balance.json is the one file `core/` may
   * read numbers from (G11) and because a gate is a rule, not a roster.
   */
  acts: {
    /** The act a save satisfying no gate is in — the prologue. */
    first: number;
    /** The last act the region has. NOT a year, and nothing caps the calendar at it. */
    last: number;
    /** `${badgeFlagPrefix}${gym.id}${badgeFlagSuffix}` is the quest flag a beaten gym writes. */
    badgeFlagPrefix: string;
    badgeFlagSuffix: string;
    /** The flag that says the run's final beat is behind the player. No calendar clause. */
    runCompleteFlag: string;
    /**
     * One row per act, ascending. A save is in the HIGHEST act whose row is satisfied — every row
     * below it must be satisfied too, which the schema checks by requiring the badge counts to be
     * non-decreasing.
     */
    gates: Array<{
      act: number;
      /** Badges required — the count of gyms whose badge flag is set. */
      badges: number;
      /** Quest flags that must all be truthy. */
      flags: string[];
      /** Node ids this act opens (content-bible §6's town + route rows). */
      nodes: string[];
    }>;
  };
  /**
   * bible §9's four regional events, as SEASON-LONG WINDOWS.
   *
   * Hank, 2026-08-25: *"events like that last for a whole season and not just for one in-game
   * day."* A window opens on a season boundary, stays open for `clock.ticksPerSeason` ticks and
   * closes at the next boundary. core/regional-events.ts owns the derivation.
   */
  regionalEvents: {
    /**
     * Fraction of `ecosim.floraMax` a node's flora must reach AT A SEASON BOUNDARY for that node to
     * be in a Bloom Year window for the season — bible §9's "a route whose producers thrive".
     * Latched at the boundary on purpose: re-reading it every tick would make the event flicker,
     * which is the "one in-game day" failure the season window exists to fix.
     */
    bloomFloraFraction: number;
    /**
     * A window publishes itself as the quest flag `${windowFlagPrefix}${windowId}${windowFlagSuffix}`.
     * The shipped names make the festival's flag `event.festival.open` — the flag data/dialogue.json
     * already reads and which nothing wrote.
     */
    windowFlagPrefix: string;
    windowFlagSuffix: string;
  };
  /**
   * [merged at integration from data/balance.additions.A4.json] bible §9 — "Cullbrand Harvest raids
   * (scripted per act, populations visibly drop at a named node)". Data, never code: act entry
   * applies whatever this list says, and a raid may only decrement what it harvests — the predator
   * collapse above it must EMERGE from the §7.3 rules (G6).
   *
   * ⚠ `raids[].year` was RENAMED to `act`. The raid used to be applied by the year turn
   * that BEGAN its year; it is now applied on entry to its act, so Cindershelf is entered
   * mid-collapse whether the player arrives in calendar year 2 or year 11 (content-bible §6).
   * The group keeps the name `yearEvents` because build-doc §7.5 step 5 names it that; only the
   * axis the raids are keyed on has moved.
   */
  yearEvents: {
    /**
     * The fraction of a target's STANDING stock a strip-harvest takes.
     *
     * `targets[].remove` is a body count authored against the node's shipped state, and a node the
     * act ladder has not opened yet still breeds every season — so once the raid was keyed on the
     * act rather than the calendar, the same script that gutted r4 at an early arrival became a
     * dent at a late one. The applied harvest is `max(remove, round(count × this))`: the authored
     * number is the FLOOR of the harvest, and this is what carries it at any standing stock.
     */
    harvestFractionOfStanding: number;
    raids: Array<{
      id: string;
      act: number;
      nodeId: string;
      targets: Array<{ lineId: string; remove: number }>;
    }>;
  };
  overlayDiff: {
    iouThreshold: number;
    sobelThreshold: number;
    dilatePx: number;
    denoiseStart: number;
    denoiseStep: number;
    denoiseFloor: number;
    maxRegenAttempts: number;
    /**
     * build-doc §8.2 criterion (2) — the largest walkable-mask drift a year variant may carry,
     * in collision cells. Was derived from `map.playerSpriteW/H ÷ map.collisionCellPx` inside
     * `tools/overlay-diff/config.ts`, which put the §9.5 acceptance criterion out of INV-3's reach.
     */
    driftFootprintCells: { cols: number; rows: number };
  };
  map: {
    virtualWidth: number;
    virtualHeight: number;
    mapNativePx: number;
    mapRenderScale: number;
    collisionCellPx: number;
    collisionCols: number;
    collisionRows: number;
    playerSpriteW: number;
    playerSpriteH: number;
    tileStepPx: number;
    propInteractionRadiusDefault: number;
    /** build-doc §9.3 downscale target — "battle 96²". Square, so one number. */
    battleSpritePx: number;
    /** build-doc §9.3 downscale target — "minis 32²". Square, so one number. */
    miniSpritePx: number;
    /**
     * Presentation walk pace, ms per tile. NOT a simulation number — a foray is counted in steps
     * (`encounter.stepsPerForay`), so a faster walk costs the same ticks and moves no population —
     * but it was a literal in `game/movement.ts` and INV-3 says a retune touches balance.json alone.
     */
    walkMsPerTile: number;
  };
  party: {
    maxPartySize: number;
    maxBoxSize: number;
    saveSlots: number;
    saveVersion: number;
  };
  economy: {
    innCost: number;
    snarePrice: Record<SnareTier, number>;
    baitPrice: Record<BaitMatch, number>;
    salvePrice: number;
    tonicPrice: number;
    trainerPayoutPerLevel: number;
  };
  audio: {
    seasonLowpassHz: Record<Season, number>;
    seasonBrightness: Record<Season, number>;
    yearDarkenPerYear: number;
  };
  /**
   * Hard Requirement 6 — the four season HUES the runtime tint multiplies over the painted map.
   * Channels are 0–255 (255 = leave this channel alone; `setTint` multiplies); `overlayAlpha` is
   * the optional full-screen overlay pass above the tinted map. The two magnitudes that dim them
   * live in `audio` (`seasonBrightness`, `yearDarkenPerYear`) and always did — these are the hues,
   * which were literals in `game/season-tint.ts` until 2026-08-26.
   */
  seasonTint: Record<Season, { r: number; g: number; b: number; overlayAlpha: number }>;
  harness: {
    seeds: number;
    gymWinRateTargets: Array<[number, number]>;
    roundRobinMin: number;
    roundRobinMax: number;
    maxBattleTurns: number;
    /**
     * build-doc §1 demo beat 1 + §15 I2 — the reference player the over-catch feasibility gate
     * assumes: one walkable node, this snare tier and bait, throwing at this HP fraction, allowed
     * this many years to drive an Apex's prey pool under `ecosim.starveThreshold`.
     */
    overcatch: {
      yearsBudget: number;
      snareTier: SnareTier;
      baitMatch: BaitMatch;
      referenceHpFrac: number;
    };
  };
  perf: {
    ecosimStepBudgetMs: number;
    megaNodeMarginMultiplier: number;
    battleActionBudgetMs: number;
    saveSerializeBudgetMs: number;
    bootBudgetMs: number;
  };
  rng: {
    defaultSeed: number;
    subsystemTags: string[];
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The validated content bundle (core/schemas.ts validateContent()).
 * ──────────────────────────────────────────────────────────────────────────── */

export interface Content {
  species: SpeciesLine[];
  moves: MovesFile;
  gyms: GymLeader[];
  /** bible §8's rival, one row per act. Ships beside the leaders in data/gyms.json. */
  rival: RivalEncounter[];
  balance: Balance;
  palette: PaletteFile;
  nodes: NodeFile[];
}
