/**
 * core/schemas.ts — zod schemas mirroring core/types.ts.
 *
 * build-doc §7: "All content is TypeScript-typed via core/types.ts; JSON files are validated
 * against these at boot with zod (fail loud on drift)."
 *
 * Two entry points:
 *   validateContent()        — parses every shipped data/*.json (statically imported, so this works
 *                              in the browser at boot AND headless in vitest/the harness; no fs, no
 *                              engine imports — locked decision L11).
 *   validateBundle(raw)      — the same validation over an arbitrary bundle, so tests can prove the
 *                              schema actually binds by feeding it corrupted copies.
 *
 * Beyond per-file shape this module enforces the CROSS-FILE invariants that make the content a
 * single source of truth: every movePool id resolves to a move, every node population key resolves
 * to a species line whose habitat matches that node's biome, adjacency is symmetric, the bible §1
 * type chart is its own exact dual, and base stats sit inside the band declared in balance.json.
 */

import { z } from "zod";
import {
  AGE_CLASSES,
  BAIT_MATCHES,
  HABITAT_SENTINELS,
  MOVE_KINDS,
  MOVE_SLOTS,
  PRESENCE_EFFECTS,
  PRESENCE_MODES,
  PROP_KINDS,
  ROLES,
  SEASONS,
  SNARE_TIERS,
  STAT_KEYS,
  STATUS_NAMES,
  TYPE_NAMES,
} from "./types";
import type {
  Balance,
  Boon,
  Content,
  GymLeader,
  MoveDef,
  MovesFile,
  NodeFile,
  OwnedCreature,
  PaletteFile,
  SaveFile,
  SpeciesLine,
  Trait,
  TypeChart,
} from "./types";

import speciesJson from "../data/species.json";
import movesJson from "../data/moves.json";
import gymsJson from "../data/gyms.json";
import balanceJson from "../data/balance.json";
import paletteJson from "../data/palette.json";
import hearthollowJson from "../data/nodes/hearthollow.json";
import r1Json from "../data/nodes/r1.json";
import brackwaterJson from "../data/nodes/brackwater.json";
import r2Json from "../data/nodes/r2.json";
import bowerdeepJson from "../data/nodes/bowerdeep.json";
import r3Json from "../data/nodes/r3.json";
import cindershelfJson from "../data/nodes/cindershelf.json";
import r4Json from "../data/nodes/r4.json";
import duskhollowJson from "../data/nodes/duskhollow.json";
import r5Json from "../data/nodes/r5.json";
import sanctumApproachJson from "../data/nodes/sanctum-approach.json";
import sanctumJson from "../data/nodes/sanctum.json";

/* ── vocabulary ──────────────────────────────────────────────────────────── */

export const zTypeName = z.enum(TYPE_NAMES);
export const zRole = z.enum(ROLES);
export const zAgeClass = z.enum(AGE_CLASSES);
export const zSeason = z.enum(SEASONS);
export const zStatKey = z.enum(STAT_KEYS);
export const zModifiableStatKey = z.enum(["atk", "def", "spd", "ins"]);
export const zStatusName = z.enum(STATUS_NAMES);
export const zSnareTier = z.enum(SNARE_TIERS);
export const zBaitMatch = z.enum(BAIT_MATCHES);
export const zPresenceEffect = z.enum(PRESENCE_EFFECTS);
export const zPropKind = z.enum(PROP_KINDS);
export const zMoveKind = z.enum(MOVE_KINDS);

const zInt = z.number().int();
const zNonNegInt = zInt.min(0);
const zFrac = z.number().min(0).max(1);

export const zStats = z.strictObject({
  hp: z.number(),
  atk: z.number(),
  def: z.number(),
  spd: z.number(),
  ins: z.number(),
});

/* ── §7.1 species.json ───────────────────────────────────────────────────── */

export const zTrait: z.ZodType<Trait> = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  stat: zStatKey,
  direction: z.enum(["up", "down"]),
  rarity: z.enum(["common", "rare"]),
});

export const zSpeciesLine: z.ZodType<SpeciesLine> = z.strictObject({
  id: z.string().min(1),
  dexIds: z.array(z.string().min(1)).min(1),
  formNames: z.record(zAgeClass, z.string().min(1)),
  types: z.record(zAgeClass, z.array(zTypeName).min(1).max(2)),
  role: z.record(zAgeClass, zRole),
  habitat: z.array(z.string().min(1)).min(1),
  baseStats: z.strictObject({
    hp: zInt,
    atk: zInt,
    def: zInt,
    spd: zInt,
    ins: zInt,
  }),
  metamorphic: z.boolean(),
  ancient: z.boolean(),
  seasonalWindow: zSeason.optional(),
  movePool: z.strictObject({
    type1: z.string().min(1),
    type2: z.string().min(1),
    role: z.string().min(1),
    utility: z.string().min(1),
  }),
  dietExceptions: z.array(z.string().min(1)).optional(),
  presenceEffect: zPresenceEffect.optional(),
  sizeClass: z.literal("large").optional(),
});

export const zSpeciesFile = z.object({ species: z.array(zSpeciesLine).min(1) });

/* ── §7.4 moves.json (moves + the bible §1 type chart SHAPE) ─────────────── */

const zMoveEffect = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("inflictStatus"), status: zStatusName, chance: zFrac }),
  z.strictObject({
    kind: z.literal("statMod"),
    target: z.enum(["self", "enemy"]),
    stat: zModifiableStatKey,
    direction: z.enum(["up", "down"]),
    magnitudeKey: z.string().min(1),
    chance: zFrac.optional(),
    turns: zInt.min(1).optional(),
  }),
  z.strictObject({
    kind: z.literal("heal"),
    mode: z.enum(["fracMaxHp", "damageDealt"]),
    amount: zFrac.optional(),
  }),
  z.strictObject({ kind: z.literal("bonusVsRole"), role: zRole, bonusPower: z.number() }),
  z.strictObject({ kind: z.literal("priority"), scope: z.enum(["entryTurn", "always"]) }),
  z.strictObject({ kind: z.literal("evade"), skipTurn: z.literal(true), magnitudeKey: z.string().min(1) }),
  z.strictObject({ kind: z.literal("catchOdds"), multiplierKey: z.literal("lureMult") }),
]);

export const zMoveDef: z.ZodType<MoveDef> = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: zMoveKind,
  type: zTypeName.nullable(),
  weight: z.enum(["light", "heavy"]).optional(),
  power: z.number().min(0),
  role: zRole.optional(),
  effects: z.array(zMoveEffect),
  text: z.string(),
  altName: z.string().optional(),
  coined: z.boolean().optional(),
});

export const zTypeChart: z.ZodType<TypeChart> = z.record(
  zTypeName,
  z.strictObject({ strongVs: z.array(zTypeName), weakVs: z.array(zTypeName) }),
);

export const zMovesFile: z.ZodType<MovesFile> = z.object({
  moves: z.array(zMoveDef).min(1),
  typeChart: zTypeChart,
});

/* ── §7.2 nodes/*.json ───────────────────────────────────────────────────── */

export const zPropPlacement = z.strictObject({
  id: z.string().min(1),
  kind: zPropKind,
  x: z.number(),
  y: z.number(),
  interactionRadius: z.number().positive(),
  signChain: z.string().min(1).optional(),
  label: z.string().optional(),
});

export const zNodePopulation = z.strictObject({
  count: zNonNegInt,
  breedRate: z.number().min(0),
  carryCap: zNonNegInt,
});

export const zNodeFile: z.ZodType<NodeFile> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  biome: z.string().min(1),
  adjacency: z.array(z.string().min(1)),
  walkable: z.boolean(),
  mapAsset: z.string().min(1),
  yearVariants: z.partialRecord(z.enum(["2", "3", "4", "5", "6"]), z.string().min(1)),
  collisionMask: z.string().min(1),
  floraStock: z.number().min(0),
  populations: z.record(z.string().min(1), zNodePopulation),
  props: z.array(zPropPlacement),
  // G3: `spawnTables` must never appear as data — encounter weights are DERIVED.
  spawnTables: z.undefined().optional(),
});

/* ── §7.7 gyms.json ──────────────────────────────────────────────────────── */

export const zGymTeamSlot = z.strictObject({
  lineId: z.string().min(1),
  age: zAgeClass,
  level: zInt.min(1),
  traits: z.array(zTrait).optional(),
  nickname: z.string().min(1).optional(),
});

export const zGymLeader: z.ZodType<GymLeader> = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  year: zInt.min(1),
  town: z.string().min(1),
  type: z.union([zTypeName, z.literal("mixed")]),
  source: z.enum(["fixed", "ghost"]),
  slots: z.array(zGymTeamSlot).min(1),
  signature: zGymTeamSlot,
});

export const zGymsFile = z.object({ gyms: z.array(zGymLeader).min(1) });

/* ── palette.json (build-doc §8.4) ───────────────────────────────────────── */

export const zPaletteFile: z.ZodType<PaletteFile> = z.object({
  frozen: z.boolean(),
  frozenAt: z.string().nullable(),
  source: z.string().min(1),
  colorCount: zInt.min(1),
  colors: z.array(z.strictObject({ id: z.string().min(1), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) })),
});

/* ── balance.json (G11: every tunable) ───────────────────────────────────── */

const zAgeRecord = z.record(zAgeClass, z.number());
const zSeasonRecord = z.record(zSeason, z.number());

export const zBalance: z.ZodType<Balance> = z.object({
  types: z.object({
    superEffective: z.number().positive(),
    resisted: z.number().positive(),
    neutral: z.number().positive(),
    predation: z.number().positive(),
    beastBaseStatBonus: z.number().min(0),
  }),
  age: z.object({
    multiplier: zAgeRecord,
    metamorphicJump: z.number().positive(),
    lifespanYears: z.record(zAgeClass, zInt.min(1)),
    yearsInClass: z.record(zAgeClass, zInt.min(1)),
  }),
  stats: z.object({
    levelCoefficient: z.number().min(0),
    traitModPct: zFrac,
    boonModPct: zFrac,
    baseStatMin: zInt.min(1),
    baseStatMax: zInt.min(1),
  }),
  traits: z.object({
    slotsPerWildCreature: zInt.min(1),
    inheritedSlotBonus: zNonNegInt,
    maxSlots: zInt.min(1),
    elderRareChance: zFrac,
    pool: z.array(zTrait).min(1),
  }),
  damage: z.object({
    rollMin: z.number().positive(),
    rollMax: z.number().positive(),
    critMultiplier: z.number().positive(),
    critChanceBase: zFrac,
    critChancePerInstinct: z.number().min(0),
    minDamage: z.number().min(0),
  }),
  status: z.object({
    burnChipFracPerTurn: zFrac,
    toxinChipFracPerTurn: zFrac,
    toxinRampPerTurn: zFrac,
    toxinMaxFracPerTurn: zFrac,
    soakSpdMult: z.number().positive(),
    dazeSkipChance: zFrac,
    persistUntilCured: z.boolean(),
  }),
  moves: z.object({
    slotUnlockLevels: z.record(z.enum(MOVE_SLOTS), zInt.min(1)),
  }),
  moveEffects: z.object({
    magnitude: z.record(z.string().min(1), z.number()),
    defaultStatModTurns: zInt.min(1),
  }),
  // Merged at integration from data/balance.additions.A3.json. A `battle` group missing from this
  // schema would be STRIPPED by z.object and core/battle.ts would never see a retune of it (INV-3).
  battle: z.object({
    evadeTurns: zNonNegInt,
    statusWearOffTurns: zInt.min(1),
  }),
  catch: z.object({
    baseCatch: z.record(zAgeClass, zFrac),
    baseCatchAncient: zFrac,
    snareTier: z.record(zSnareTier, z.number().positive()),
    baitMult: z.record(zBaitMatch, z.number().positive()),
    lureMult: z.number().positive(),
    hpTermOffset: z.number(),
    hpTermDivisor: z.number().positive(),
    clampMin: zFrac,
    clampMax: zFrac,
    shakes: zInt.min(1),
  }),
  medicine: z.object({
    salveItemId: z.string().min(1),
    salveHealFracMaxHp: zFrac,
    tonicItemId: z.string().min(1),
    tonicClearsStatus: z.boolean(),
    innRestFullHeal: z.boolean(),
  }),
  xp: z.object({
    base: z.number().min(0),
    perEnemyLevel: z.number().min(0),
    ageBonus: zAgeRecord,
    toNextCoefficient: z.number().positive(),
    toNextExponent: z.number().positive(),
    levelCap: zInt.min(1),
    starterLevel: zInt.min(1),
  }),
  flee: z.object({
    base: z.number(),
    spdCoefficient: z.number(),
    clampMin: zFrac,
    clampMax: zFrac,
  }),
  ecosim: z.object({
    foodFactorClampMin: z.number().min(0),
    foodFactorClampMax: z.number().min(0),
    starveThreshold: z.number().min(0),
    starveRate: zFrac,
    predationDraw: z.number().min(0),
    keystoneBreedMult: z.number().positive(),
    ventWarmthBreedMult: z.number().positive(),
    waterTableBreedFloor: z.number().min(0),
    presenceRadiusNodes: zNonNegInt,
    recentDeathsDecayPerSeason: zFrac,
    webRoleAgeClass: zAgeClass,
    // Every role must carry a demand figure — a missing role would be an undefined divisor in the
    // §7.3 step-2 starvation check, which is exactly how Producers/Scavengers/Ancients got killed.
    demandPerIndividual: z.record(zRole, z.number().min(0)),
    noDietFoodFactor: z.number().positive(),
    floraPreyUnitsPerPoint: z.number().min(0),
    floraRegenPerSeason: z.number().min(0),
    floraMin: z.number().min(0),
    floraMax: z.number().positive(),
    populationFloor: z.number().min(0),
    // Merged at integration from data/balance.additions.A2.json.
    starveMinDeathsPerSeason: z.number().min(0),
    starveSuppressesBirths: z.boolean(),
    // The effect NAME never reaches a conditional in core/ecosim.ts — `mode` is the vocabulary a
    // branch may read (G6/G11). A rule with a type must not be `breedMult`, and vice versa.
    presenceEffects: z.record(
      z.enum(PRESENCE_EFFECTS),
      z
        .object({
          mode: z.enum(PRESENCE_MODES),
          type: z.enum(TYPE_NAMES).optional(),
          magnitudeKey: z.string().min(1),
        })
        .refine((r) => (r.mode === "breedMult") === (r.type === undefined), {
          message: 'mode "breedMult" takes no type; every other mode needs one',
        }),
    ),
  }),
  // Merged at integration from data/balance.additions.A2.json — build-doc §10.2's thresholds.
  cascade: z.object({
    preyForcedFraction: zFrac,
    forcingSeasons: zInt.min(1),
    apexCollapseSeasons: zInt.min(1),
    mesoReleaseSeasons: zInt.min(1),
    mesoSurvivesForcingMinFraction: zFrac,
    releaseCoverageMinFraction: zFrac,
  }),
  clock: z.object({
    ticksPerSeason: zInt.min(1),
    ticksPerYear: zInt.min(1),
    travelTicks: zNonNegInt,
    forayTicks: zNonNegInt,
    innTicks: zNonNegInt,
    seasonOrder: z.array(zSeason).length(4),
    startYear: zInt.min(1),
    startTick: zNonNegInt,
    yearsTotal: zInt.min(1),
  }),
  encounter: z.object({
    stepsPerForay: zInt.min(1),
    encounterChancePerStep: zFrac,
    outOfSeasonWeight: z.number().min(0),
    scavengerRecentDeathsDivisor: z.number().positive(),
    signChainGatedHabitatTag: z.enum(HABITAT_SENTINELS),
    ageWeights: zAgeRecord,
    levelByYear: z.array(zInt.min(1)).min(1),
    levelJitter: zNonNegInt,
    minLevel: zInt.min(1),
  }),
  retirement: z.object({
    heirLevelFactor: z.number().positive(),
    heirInheritedTraitsMin: zNonNegInt,
    heirInheritedTraitsMax: zNonNegInt,
    // Merged at integration from data/balance.additions.A4.json. `boonStatPct` is deliberately
    // absent: the boon's magnitude is `stats.boonModPct` and has exactly one home (D-A4-13).
    heirLevelMin: zInt.min(1),
    boonMaxStacksPerStat: zInt.min(1),
  }),
  // Merged at integration from data/balance.additions.A4.json — build-doc §7.5 step 5 raid scripts.
  yearEvents: z.object({
    raids: z.array(
      z.object({
        id: z.string().min(1),
        year: zInt.min(1),
        nodeId: z.string().min(1),
        targets: z.array(z.object({ lineId: z.string().min(1), remove: zInt.min(1) })).min(1),
      }),
    ),
  }),
  overlayDiff: z.object({
    iouThreshold: zFrac,
    sobelThreshold: z.number().min(0),
    dilatePx: zNonNegInt,
    denoiseStart: zFrac,
    denoiseStep: zFrac,
    denoiseFloor: zFrac,
    maxRegenAttempts: zNonNegInt,
  }),
  map: z.object({
    virtualWidth: zInt.min(1),
    virtualHeight: zInt.min(1),
    mapNativePx: zInt.min(1),
    mapRenderScale: z.number().positive(),
    collisionCellPx: zInt.min(1),
    collisionCols: zInt.min(1),
    collisionRows: zInt.min(1),
    playerSpriteW: zInt.min(1),
    playerSpriteH: zInt.min(1),
    tileStepPx: zInt.min(1),
    propInteractionRadiusDefault: z.number().positive(),
  }),
  party: z.object({
    maxPartySize: zInt.min(1),
    maxBoxSize: zInt.min(1),
    saveSlots: zInt.min(1),
    saveVersion: zInt.min(1),
  }),
  economy: z.object({
    innCost: z.number().min(0),
    snarePrice: z.record(zSnareTier, z.number().min(0)),
    baitPrice: z.record(zBaitMatch, z.number().min(0)),
    salvePrice: z.number().min(0),
    tonicPrice: z.number().min(0),
    trainerPayoutPerLevel: z.number().min(0),
  }),
  audio: z.object({
    seasonLowpassHz: zSeasonRecord,
    seasonBrightness: zSeasonRecord,
    yearDarkenPerYear: z.number().min(0),
  }),
  harness: z.object({
    seeds: zInt.min(1),
    gymWinRateTargets: z.array(z.tuple([zFrac, zFrac])).min(1),
    roundRobinMin: zFrac,
    roundRobinMax: zFrac,
    maxBattleTurns: zInt.min(1),
    overcatch: z.object({
      yearsBudget: z.number().positive(),
      snareTier: zSnareTier,
      baitMatch: zBaitMatch,
      referenceHpFrac: zFrac,
    }),
  }),
  perf: z.object({
    ecosimStepBudgetMs: z.number().positive(),
    megaNodeMarginMultiplier: z.number().positive(),
    battleActionBudgetMs: z.number().positive(),
    saveSerializeBudgetMs: z.number().positive(),
    bootBudgetMs: z.number().positive(),
  }),
  rng: z.object({
    defaultSeed: zInt,
    subsystemTags: z.array(z.string().min(1)).min(1),
  }),
});

/* ── §7.5 / §7.8 runtime shapes (save validation for the game shell) ─────── */

export const zBoon: z.ZodType<Boon> = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  stat: zStatKey,
  sourceUid: z.string().min(1),
  sourceFormName: z.string().min(1),
  grantedYear: zInt.min(1),
});

export const zOwnedCreature: z.ZodType<OwnedCreature> = z.strictObject({
  uid: z.string().min(1),
  lineId: z.string().min(1),
  age: zAgeClass,
  level: zInt.min(1),
  caughtYear: zInt.min(1),
  yearsRemaining: zNonNegInt,
  traits: z.array(zTrait),
  relicSlot: z.string().optional(),
  boons: z.array(zBoon),
  projectedRetirementYear: zInt.min(1),
  metamorphosed: z.boolean().optional(),
  nickname: z.string().optional(),
  xp: z.number().min(0).optional(),
  curHp: z.number().min(0).optional(),
  boxed: z.boolean().optional(),
});

export const zNodeState = z.strictObject({
  populations: z.record(z.string().min(1), zNodePopulation),
  floraStock: z.number().min(0),
  recentDeaths: z.number().min(0),
});

/**
 * build-doc §7.8. `actionLog` is left permissive on purpose: it is a replay tape whose entries are
 * produced and consumed by core/, and pinning the GameAction union here would make every lane that
 * adds an action edit this file (INV-1/INV-2 spirit).
 */
export const zSaveFile: z.ZodType<SaveFile> = z.object({
  // A positive integer, not a literal: the VALUE is balance.party.saveVersion and core/save.ts
  // checks a loaded save against it. A second pin here made a version bump unloadable (D-A4-18).
  version: zInt.min(1),
  seed: zInt,
  year: zInt.min(1),
  tick: zNonNegInt,
  currentNode: z.string().min(1),
  party: z.array(zOwnedCreature),
  box: z.array(zOwnedCreature),
  money: z.number().min(0),
  items: z.record(z.string().min(1), zNonNegInt),
  questFlags: z.record(z.string().min(1), z.union([z.boolean(), z.number(), z.string()])),
  nodeStates: z.record(z.string().min(1), zNodeState),
  actionLog: z.array(
    z.object({ seq: zNonNegInt, year: zInt.min(1), tick: zNonNegInt, action: z.any() }),
  ) as unknown as z.ZodType<SaveFile["actionLog"]>,
});

/* ── validation entry points ─────────────────────────────────────────────── */

export interface RawContentBundle {
  species: unknown;
  moves: unknown;
  gyms: unknown;
  balance: unknown;
  palette: unknown;
  nodes: unknown[];
}

/**
 * Content cardinalities, NOT balance tunables (so G11/INV-4 does not apply): changing either
 * changes the game rather than its tuning. Hard Req 8 fixes the 28-move pool; Hard Req 10 fixes
 * seasonal spawns at exactly four migrants.
 */
const MOVE_POOL_SIZE = 28;
const SEASONAL_MIGRANT_COUNT = 4;

/**
 * G3 — no second encounter/spawn/bait table may exist, under any key name.
 *
 * Two layers, because either alone has a hole. The regex catches an obviously-named table and says
 * so in the error; the key allow-list catches a table smuggled in under an innocent name
 * ("weights", "rollTable", "lootTable"), which the regex misses and which zod would otherwise
 * STRIP silently — leaving neither the gate nor the typecheck anything to complain about.
 * `_`-prefixed keys are documentation (every node file carries `_source` / `_pyramid`) and are the
 * only unknown keys allowed through.
 */
const SECOND_TABLE_KEY = /spawn|encounter|bait/i;
const NODE_FILE_KEYS: ReadonlySet<string> = new Set([
  "id",
  "name",
  "biome",
  "adjacency",
  "walkable",
  "mapAsset",
  "yearVariants",
  "collisionMask",
  "floraStock",
  "populations",
  "props",
]);

export class ContentValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(
      `TROPHIC content validation failed (${issues.length} issue${issues.length === 1 ? "" : "s"}):\n` +
        issues.map((i) => `  • ${i}`).join("\n"),
    );
    this.name = "ContentValidationError";
    this.issues = issues;
  }
}

function parseOrCollect<T>(label: string, schema: z.ZodType<T>, value: unknown, issues: string[]): T | null {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  issues.push(`${label}: ${z.prettifyError(result.error).replace(/\n/g, "\n      ")}`);
  return null;
}

/**
 * Validate an arbitrary content bundle. Throws ContentValidationError listing every problem found —
 * per-file shape first, then the cross-file invariants that make the data a single source of truth.
 */
export function validateBundle(raw: RawContentBundle): Content {
  const issues: string[] = [];

  const speciesFile = parseOrCollect("species.json", zSpeciesFile, raw.species, issues);
  const movesFile = parseOrCollect("moves.json", zMovesFile, raw.moves, issues);
  const gymsFile = parseOrCollect("gyms.json", zGymsFile, raw.gyms, issues);
  const balance = parseOrCollect("balance.json", zBalance, raw.balance, issues);
  const palette = parseOrCollect("palette.json", zPaletteFile, raw.palette, issues);

  const nodes: NodeFile[] = [];
  raw.nodes.forEach((n, i) => {
    const label = typeof n === "object" && n !== null && "id" in n ? `nodes/${String((n as { id: unknown }).id)}.json` : `nodes[${i}]`;
    // G3, checked on the RAW object: a second table is a second table whatever it is called, and
    // zod would otherwise strip an undeclared key silently.
    if (typeof n === "object" && n !== null) {
      for (const key of Object.keys(n)) {
        if (SECOND_TABLE_KEY.test(key)) {
          issues.push(`${label}: key "${key}" — encounter weights are DERIVED from populations, never tabled (G3)`);
        } else if (!NODE_FILE_KEYS.has(key) && !key.startsWith("_")) {
          issues.push(
            `${label}: unknown key "${key}" — a node file carries exactly ${[...NODE_FILE_KEYS].join("/")} ` +
              `(plus _-prefixed documentation). Anything else is a second table by another name (G3)`,
          );
        }
      }
    }
    const parsed = parseOrCollect(label, zNodeFile, n, issues);
    if (parsed) nodes.push(parsed);
  });

  if (!speciesFile || !movesFile || !gymsFile || !balance || !palette || nodes.length !== raw.nodes.length) {
    throw new ContentValidationError(issues);
  }

  const species = speciesFile.species;
  const gyms = gymsFile.gyms;
  const moveIds = new Set(movesFile.moves.map((m) => m.id));
  const speciesIds = new Set(species.map((s) => s.id));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const biomes = new Set(nodes.map((n) => n.biome));
  const sentinels = new Set<string>(HABITAT_SENTINELS);

  // ── species cross-checks ────────────────────────────────────────────────
  if (speciesIds.size !== species.length) issues.push("species.json: duplicate line ids");
  for (const s of species) {
    for (const [slot, id] of Object.entries(s.movePool)) {
      if (!moveIds.has(id)) issues.push(`species ${s.id}: movePool.${slot} "${id}" is not a move in moves.json`);
    }
    for (const d of s.dietExceptions ?? []) {
      if (!speciesIds.has(d)) issues.push(`species ${s.id}: dietException "${d}" is not a species line`);
    }
    for (const h of s.habitat) {
      if (!sentinels.has(h) && !biomes.has(h)) issues.push(`species ${s.id}: habitat "${h}" is not a node biome`);
    }
    for (const [stat, value] of Object.entries(s.baseStats)) {
      if (value < balance.stats.baseStatMin || value > balance.stats.baseStatMax) {
        issues.push(
          `species ${s.id}: baseStats.${stat} = ${value} outside balance.stats band ` +
            `${balance.stats.baseStatMin}–${balance.stats.baseStatMax}`,
        );
      }
    }
    // build-doc §7.1 / bible §4 — Ancients: always AncientApex, never age, presence effect set.
    const ancientRoles = AGE_CLASSES.every((a) => s.role[a] === "AncientApex");
    if (s.ancient !== ancientRoles) {
      issues.push(`species ${s.id}: ancient=${s.ancient} but AncientApex-in-all-ages=${ancientRoles}`);
    }
    if (s.ancient && !s.presenceEffect) issues.push(`species ${s.id}: ancient line has no presenceEffect (bible §4)`);
    if (!s.ancient && s.presenceEffect) issues.push(`species ${s.id}: presenceEffect on a non-Ancient line`);
    const distinctForms = new Set(AGE_CLASSES.map((a) => s.formNames[a]));
    if (distinctForms.size !== s.dexIds.length) {
      issues.push(`species ${s.id}: dexIds (${s.dexIds.length}) do not match its distinct form names (${distinctForms.size})`);
    }
    // bible §4 — all three Ancients are "very hard catches, gated behind rare sign-card chains".
    // Without the gate tag an Ancient derives as an ordinary wild encounter off its node count.
    if (s.ancient && !s.habitat.includes(balance.encounter.signChainGatedHabitatTag)) {
      issues.push(
        `species ${s.id}: ancient line is missing the "${balance.encounter.signChainGatedHabitatTag}" habitat tag — ` +
          `it would derive as an ordinary encounter (bible §4 gates every Ancient behind a sign-card chain)`,
      );
    }
    if (!s.ancient && s.habitat.includes(balance.encounter.signChainGatedHabitatTag)) {
      issues.push(`species ${s.id}: only Ancients may carry the "${balance.encounter.signChainGatedHabitatTag}" gate tag`);
    }
  }
  // Hard Req 10 — seasonal spawns v1-lite: exactly 4 migrants, one per season.
  const migrants = species.filter((s) => s.seasonalWindow);
  if (migrants.length !== SEASONAL_MIGRANT_COUNT) {
    issues.push(`species.json: expected exactly ${SEASONAL_MIGRANT_COUNT} seasonal migrants (Hard Req 10), found ${migrants.length}`);
  }
  if (new Set(migrants.map((s) => s.seasonalWindow)).size !== migrants.length) {
    issues.push("species.json: seasonal migrants must cover distinct seasons (bible §5)");
  }

  // ── moves cross-checks ──────────────────────────────────────────────────
  if (moveIds.size !== movesFile.moves.length) issues.push("moves.json: duplicate move ids");
  // Hard Req 8 — 28-move pool.
  if (movesFile.moves.length !== MOVE_POOL_SIZE) {
    issues.push(`moves.json: expected the ${MOVE_POOL_SIZE}-move pool (Hard Req 8), found ${movesFile.moves.length}`);
  }
  // bible §1 — strongVs and weakVs must be exact duals, or the chart contradicts itself.
  for (const attacker of TYPE_NAMES) {
    for (const defender of movesFile.typeChart[attacker].strongVs) {
      if (!movesFile.typeChart[defender].weakVs.includes(attacker)) {
        issues.push(`typeChart: ${attacker} is strong vs ${defender} but ${defender} does not list ${attacker} in weakVs`);
      }
    }
    for (const source of movesFile.typeChart[attacker].weakVs) {
      if (!movesFile.typeChart[source].strongVs.includes(attacker)) {
        issues.push(`typeChart: ${attacker} is weak vs ${source} but ${source} does not list ${attacker} in strongVs`);
      }
    }
  }

  // ── trait pool cross-checks (bible §2) ──────────────────────────────────
  const traitPool = new Map(balance.traits.pool.map((t) => [t.id, t]));
  if (traitPool.size !== balance.traits.pool.length) issues.push("balance.json: duplicate trait ids in traits.pool");
  if (!balance.traits.pool.some((t) => t.rarity === "rare")) {
    issues.push("balance.json: traits.pool has no rare trait, but bible §2 says Elders roll rare traits");
  }
  if (balance.traits.maxSlots < balance.traits.slotsPerWildCreature + balance.traits.inheritedSlotBonus) {
    issues.push("balance.json: traits.maxSlots is smaller than slotsPerWildCreature + inheritedSlotBonus");
  }

  // ── gym cross-checks ────────────────────────────────────────────────────
  for (const g of gyms) {
    for (const slot of [...g.slots, g.signature]) {
      if (!speciesIds.has(slot.lineId)) issues.push(`gym ${g.id}: slot lineId "${slot.lineId}" is not a species line`);
      if (slot.level > balance.xp.levelCap) issues.push(`gym ${g.id}: level ${slot.level} exceeds balance.xp.levelCap ${balance.xp.levelCap}`);
      // A roster trait must BE a pool trait — otherwise gyms.json is a second, private trait table.
      for (const t of slot.traits ?? []) {
        const pooled = traitPool.get(t.id);
        if (!pooled) issues.push(`gym ${g.id}: trait "${t.id}" is not in balance.traits.pool`);
        else if (pooled.name !== t.name || pooled.stat !== t.stat || pooled.direction !== t.direction || pooled.rarity !== t.rarity) {
          issues.push(`gym ${g.id}: trait "${t.id}" disagrees with balance.traits.pool`);
        }
      }
    }
    if (!nodeIds.has(g.town)) issues.push(`gym ${g.id}: town "${g.town}" is not a node`);
  }

  // ── node cross-checks ───────────────────────────────────────────────────
  if (nodeIds.size !== nodes.length) issues.push("nodes: duplicate node ids");
  for (const n of nodes) {
    if ("spawnTables" in n) issues.push(`node ${n.id}: spawnTables must never exist as data — encounter weights are DERIVED (G3)`);
    for (const a of n.adjacency) {
      if (!nodeIds.has(a)) issues.push(`node ${n.id}: adjacency "${a}" is not a node`);
      else {
        const other = nodes.find((m) => m.id === a);
        if (other && !other.adjacency.includes(n.id)) issues.push(`node ${n.id}: adjacency to "${a}" is not symmetric`);
      }
    }
    if (n.floraStock < balance.ecosim.floraMin || n.floraStock > balance.ecosim.floraMax) {
      issues.push(`node ${n.id}: floraStock ${n.floraStock} outside balance.ecosim flora band`);
    }
    for (const [lineId, pop] of Object.entries(n.populations)) {
      const s = species.find((x) => x.id === lineId);
      if (!s) {
        issues.push(`node ${n.id}: population key "${lineId}" is not a species line`);
        continue;
      }
      if (!s.habitat.includes(n.biome) && !s.habitat.includes("roaming")) {
        issues.push(`node ${n.id}: ${lineId} habitat ${JSON.stringify(s.habitat)} does not include biome "${n.biome}"`);
      }
      if (pop.count > pop.carryCap) issues.push(`node ${n.id}: ${lineId} count ${pop.count} exceeds carryCap ${pop.carryCap}`);
    }
    const propIds = new Set(n.props.map((p) => p.id));
    if (propIds.size !== n.props.length) issues.push(`node ${n.id}: duplicate prop ids`);
  }

  // ── palette cross-check (build-doc §8.4) ────────────────────────────────
  if (palette.colors.length !== palette.colorCount) {
    issues.push(`palette.json: colorCount ${palette.colorCount} does not match ${palette.colors.length} colors`);
  }

  if (issues.length > 0) throw new ContentValidationError(issues);

  return { species, moves: movesFile, gyms, balance, palette, nodes };
}

/** Every shipped node file, in graph order (build-doc §5 data/nodes/). */
export const SHIPPED_NODE_JSON: unknown[] = [
  hearthollowJson,
  r1Json,
  brackwaterJson,
  r2Json,
  bowerdeepJson,
  r3Json,
  cindershelfJson,
  r4Json,
  duskhollowJson,
  r5Json,
  sanctumApproachJson,
  sanctumJson,
];

/** The shipped bundle exactly as it sits in data/ — raw, unvalidated. */
export function shippedBundle(): RawContentBundle {
  return {
    species: speciesJson,
    moves: movesJson,
    gyms: gymsJson,
    balance: balanceJson,
    palette: paletteJson,
    nodes: SHIPPED_NODE_JSON,
  };
}

/**
 * build-doc §7 — boot-time validation. Parses every data/*.json and throws a readable
 * ContentValidationError on drift. Call this once at boot; hold the result.
 */
export function validateContent(): Content {
  return validateBundle(shippedBundle());
}
