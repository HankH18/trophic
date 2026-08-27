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
  RivalEncounter,
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
/** A non-negative amount that may be fractional — tick costs, which can be half a tick. */
const zNonNegNum = z.number().min(0);
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

/** Declared as a shape so the G3 raw-key sweep below can read the file's own key list (see
 *  CONTENT_FILE_KEYS) instead of a hand-maintained copy of it that can drift out of step. */
const zSpeciesFileShape = { species: z.array(zSpeciesLine).min(1) };
export const zSpeciesFile = z.object(zSpeciesFileShape);

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

const zMovesFileShape = {
  moves: z.array(zMoveDef).min(1),
  typeChart: zTypeChart,
};
export const zMovesFile: z.ZodType<MovesFile> = z.object(zMovesFileShape);

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

const zNodeFileShape = {
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
};
export const zNodeFile: z.ZodType<NodeFile> = z.object(zNodeFileShape);

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
  // RENAMED from `year`: this is an ACT index, and the calendar no longer bounds it.
  act: zNonNegInt,
  town: z.string().min(1),
  type: z.union([zTypeName, z.literal("mixed")]),
  source: z.enum(["fixed", "ghost"]),
  slots: z.array(zGymTeamSlot).min(1),
  signature: zGymTeamSlot,
});

/**
 * bible §8's rival, declared beside the leaders because it is the same kind of thing: a fixed,
 * authored roster the player fights on a schedule. It is a SEPARATE array rather than a seventh
 * `gyms[]` row because `game/gym-battle.ts` `gymAtNode` keys on `town` and `winGym` awards a badge
 * — a rival row inside `gyms[]` would put a badge-awarding gym on Route 1 and invert the act ladder.
 *
 * ⚠ Declaring it here is what makes it ARRIVE. `zGymsFile` parses with `z.object`, which strips
 * undeclared keys in silence (INV-3), so an undeclared `rival` block would sit in the file, pass
 * validation and never reach a reader. `CONTENT_FILE_KEYS` reads its allow-list off
 * `zGymsFileShape`, so adding the key here also extends the G3 raw-key sweep that guards the file.
 */
export const zRivalEncounter: z.ZodType<RivalEncounter> = z.strictObject({
  id: z.string().min(1),
  act: zNonNegInt,
  node: z.string().min(1),
  slots: z.array(zGymTeamSlot).min(1),
  signature: zGymTeamSlot,
});

const zGymsFileShape = { gyms: z.array(zGymLeader).min(1), rival: z.array(zRivalEncounter).min(1) };
export const zGymsFile = z.object(zGymsFileShape);

/* ── palette.json (build-doc §8.4) ───────────────────────────────────────── */

/**
 * The CONTRACT, not the colours. build-doc §8.4 fixes the size ("32 colors, k-means over the
 * approved trial set, frozen at gate B0"), and gate B0 is a value swap rather than a restructure:
 * the hexes are free to change and are pinned NOWHERE, while the id sequence, the count and the
 * freeze claim are what every downstream consumer indexes against, and they are checked in
 * validateBundle().
 */
const zPaletteFileShape = {
  frozen: z.boolean(),
  // build-doc §15 gate B0. `frozen: true` is a claim that the freeze HAPPENED, so it must carry the
  // date it happened on; `frozen: false` must carry none. Either half alone lets the file lie.
  frozenAt: z.string().regex(/^\d{4}-\d{2}-\d{2}([T ].*)?$/).nullable(),
  source: z.string().min(1),
  colorCount: zInt.min(1),
  colors: z.array(z.strictObject({ id: z.string().min(1), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) })),
};
export const zPaletteFile: z.ZodType<PaletteFile> = z.object(zPaletteFileShape);

/* ── balance.json (G11: every tunable) ───────────────────────────────────── */

const zAgeRecord = z.record(zAgeClass, z.number());
const zSeasonRecord = z.record(zSeason, z.number());

/**
 * A season-tint colour channel.
 *
 * ⚠ NO UPPER BOUND, and that is not laxity. `game/season-tint.ts` `hueOf` normalises every preset
 * so its brightest channel is the maximum before the two magnitudes are applied, and `packRgb`
 * clamps on the way out — so a preset is a RATIO and (1000, 800, 600) is the same hue as
 * (255, 204, 153). An 8-bit ceiling here would assert a convention nothing downstream depends on,
 * and it would put a magic number in `core/` to do it (INV-4). What IS load-bearing is below: a
 * channel cannot be negative, and a preset cannot be all zeroes.
 */
const zTintChannel = z.number().min(0);

const zBalanceShape = {
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
    // build-doc §7.4 as amended. The pivot is an Instinct SHARE, so it is a
    // fraction; the slope is a rate per unit of share and is unbounded above but must not be
    // negative, or a point of Instinct would once again cost catch odds instead of buying them.
    instinctBaitPivot: zFrac,
    instinctBaitSlope: z.number().min(0),
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
  /*
   * THE CADENCE IS CROSS-VALIDATED, and it has to be. Before this refine every key below was
   * bounded independently, so four different retunes passed zod, booted and played while silently
   * breaking the clock — measured, all four: an 18/4 year never fired `yearEnd` and discarded the
   * overshoot; a 12/4 year opened the regional-event festival window on zero ticks of twelve; a
   * 20/4 year stepped winter TWICE, re-opening the five-season-steps regression that inflated every
   * trajectory by 25%; and 2 ticks per season made ticks 8-15 all read "winter". None of them was
   * a code change. The owner expects to retune these numbers again after playtesting, so the guard
   * has to live where a data edit meets it.
   */
  clock: z
    .object({
      ticksPerSeason: zInt.min(1),
      ticksPerYear: zInt.min(1),
      subTicksPerTick: zInt.min(1),
      travelTicks: zNonNegNum,
      forayTicks: zNonNegNum,
      innTicks: zNonNegNum,
      battleTicks: zNonNegNum,
      seasonOrder: z.array(zSeason).length(4),
      startYear: zInt.min(1),
      startTick: zNonNegInt,
      // NOT a cap — the EXPECTED year count under normal pacing. The calendar is unbounded.
      yearsTotal: zInt.min(1),
    })
    .superRefine((c, ctx) => {
      const fail = (message: string, path: string): void => {
        ctx.addIssue({ code: "custom", message, path: [path] });
      };
      // R1 — a year is a whole number of seasons, and exactly seasonOrder.length of them.
      if (c.ticksPerYear !== c.ticksPerSeason * c.seasonOrder.length) {
        fail(
          `ticksPerYear must be ticksPerSeason x seasonOrder.length ` +
            `(${String(c.ticksPerSeason)} x ${String(c.seasonOrder.length)} = ` +
            `${String(c.ticksPerSeason * c.seasonOrder.length)}), got ${String(c.ticksPerYear)}`,
          "ticksPerYear",
        );
      }
      // R2 — the run cannot start past the end of its own first year.
      if (c.startTick >= c.ticksPerYear) {
        fail(
          `startTick ${String(c.startTick)} must be inside the year (< ticksPerYear ${String(c.ticksPerYear)})`,
          "startTick",
        );
      }
      // R3 — every cost must be expressible at the declared resolution, or it would be rounded.
      const costs = {
        travelTicks: c.travelTicks,
        forayTicks: c.forayTicks,
        innTicks: c.innTicks,
        battleTicks: c.battleTicks,
      } as const;
      for (const [key, value] of Object.entries(costs)) {
        const sub = value * c.subTicksPerTick;
        if (Math.abs(sub - Math.round(sub)) > 1e-9) {
          fail(
            `${key} ${String(value)} is not an exact multiple of 1/subTicksPerTick ` +
              `(1/${String(c.subTicksPerTick)}) — raise subTicksPerTick to express it`,
            key,
          );
        }
        // R4 — no single action may cost a whole season. One that did could cross two boundaries
        // at once, and the season-boundary consumers are written for one crossing per action.
        if (value >= c.ticksPerSeason) {
          fail(
            `${key} ${String(value)} must cost less than a season (ticksPerSeason ${String(c.ticksPerSeason)})`,
            key,
          );
        }
      }
    }),
  // The act model (core/acts.ts) — the second clock. Badges and flags only; never time.
  acts: z.object({
    first: zNonNegInt,
    last: zNonNegInt,
    badgeFlagPrefix: z.string().min(1),
    badgeFlagSuffix: z.string().min(1),
    runCompleteFlag: z.string().min(1),
    gates: z
      .array(
        z.object({
          act: zNonNegInt,
          badges: zNonNegInt,
          flags: z.array(z.string().min(1)),
          nodes: z.array(z.string().min(1)),
        }),
      )
      .min(1),
  }),
  // bible §9's four regional events as season-long windows (core/regional-events.ts).
  regionalEvents: z.object({
    bloomFloraFraction: zFrac,
    windowFlagPrefix: z.string().min(1),
    windowFlagSuffix: z.string().min(1),
  }),
  encounter: z.object({
    stepsPerForay: zInt.min(1),
    encounterChancePerStep: zFrac,
    // Grass gating — the share of walkable cells that are encounter tiles. 1 means the whole map
    // rolls, which is what shipped before the gate existed and is a legal (if dense) retune.
    encounterTileFraction: zFrac,
    outOfSeasonWeight: z.number().min(0),
    scavengerRecentDeathsDivisor: z.number().positive(),
    signChainGatedHabitatTag: z.enum(HABITAT_SENTINELS),
    finaleGatedNode: z.string().min(1),
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
    // absent: the boon's magnitude is `stats.boonModPct` and has exactly one home.
    heirLevelMin: zInt.min(1),
    boonMaxStacksPerStat: zInt.min(1),
  }),
  // Merged at integration from data/balance.additions.A4.json — build-doc §7.5 step 5 raid scripts.
  yearEvents: z.object({
    // A strip-harvest takes the standing stock. `max(remove, round(count × this))`.
    harvestFractionOfStanding: zFrac,
    raids: z.array(
      z.object({
        id: z.string().min(1),
        // RE-KEYED from `year`: a raid fires on ENTRY TO ITS ACT, not on a year turn.
        act: zNonNegInt,
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
    // build-doc §8.2 criterion (2). A zero-cell tolerance rejects every variant ever generated, so
    // the smallest meaningful value is one cell on each axis; the real floor (the player's own
    // footprint) is a cross-file identity and is bound in tests/unit/balance-inv3.test.ts.
    driftFootprintCells: z.object({ cols: zInt.min(1), rows: zInt.min(1) }),
  }),
  /**
   * build-doc §7.6, verbatim: "Painted maps 1024×1024 native rendered 2× (2048² world). Collision
   * mask: 1-bit PNG at map native res, sampled on a 16px grid (64×64 cells) into a packed bitfield
   * at build time. Player logical sprite 32×48, tile step 32px, grid movement Gold-style."
   *
   * Those numbers are NOT eleven free integers. The doc's own arithmetic ties three pairs together,
   * and typing them independently let each half drift alone with the whole suite green: setting
   * `mapNativePx` to 512 left `collisionCols` at 64, i.e. a collision grid covering twice the map
   * it is sampled from — a silent 2× walkability offset, not a cosmetic one. game/collision.ts
   * derives its cell size as `mapNativePx / cols` and its world size as `mapNativePx ×
   * mapRenderScale`, so the identities below are the difference between a mask that lines up with
   * the painting and one that does not. They are enforced HERE so boot refuses the drift, rather
   * than in a consumer that a different entry point can bypass.
   */
  map: z
    .object({
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
      // build-doc §9.3 downscale targets — "battle 96², overworld chars 32×48, minis 32²". The
      // overworld pair has been playerSpriteW/H all along; these are the other two.
      battleSpritePx: zInt.min(1),
      miniSpritePx: zInt.min(1),
      // Presentation pace (game/movement.ts). A step that takes zero ms is not a step, so min 1.
      walkMsPerTile: zInt.min(1),
    })
    .superRefine((m, ctx) => {
      // "at map native res, sampled on a 16px grid (64×64 cells)" — the cell count IS the division.
      const cells = m.mapNativePx / m.collisionCellPx;
      for (const axis of ["collisionCols", "collisionRows"] as const) {
        if (m[axis] !== cells) {
          ctx.addIssue({
            code: "custom",
            path: [axis],
            message:
              `${axis} is ${String(m[axis])}, but a ${String(m.collisionCellPx)}px grid over a ` +
              `${String(m.mapNativePx)}px map has ${String(cells)} cells per axis — the collision grid ` +
              `would not cover the painting it is sampled from (build-doc §7.6)`,
          });
        }
      }
      // "rendered 2×" + "sampled on a 16px grid" + "tile step 32px": one mask cell at render scale
      // is exactly one tile step. game/collision.ts relies on that coincidence to keep the movement
      // grid and the collision grid the same grid.
      const cellInWorldPx = m.collisionCellPx * m.mapRenderScale;
      if (m.tileStepPx !== cellInWorldPx) {
        ctx.addIssue({
          code: "custom",
          path: ["tileStepPx"],
          message:
            `tileStepPx is ${String(m.tileStepPx)}, but one ${String(m.collisionCellPx)}px collision cell ` +
            `rendered at ${String(m.mapRenderScale)}× is ${String(cellInWorldPx)} world px — a step that is ` +
            `not one cell puts the movement grid out of step with the collision grid (build-doc §7.6)`,
        });
      }
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
  /**
   * Hard Requirement 6 — the four season hues `game/season-tint.ts` multiplies over the painted
   * map. A channel outside 0–255 is not a colour `setTint` can take, and an alpha outside 0–1 is
   * not an alpha, so both are bounded here rather than clamped silently at the frame that needed
   * them. One preset per `Season`, exhaustively — `z.record` over the enum requires every key, so a
   * season added to the type without a hue is a boot failure, not an untinted map.
   */
  seasonTint: z.record(
    zSeason,
    z
      .object({
        r: zTintChannel,
        g: zTintChannel,
        b: zTintChannel,
        overlayAlpha: zFrac,
      })
      .superRefine((preset, ctx) => {
        // `hueOf` returns black for a peak of zero rather than dividing by it, so an all-zero
        // preset is not a validation error anywhere downstream — it is a season that paints the
        // map black with no warning. It is refused here, at boot, where it can still be read.
        if (Math.max(preset.r, preset.g, preset.b) <= 0) {
          ctx.addIssue({
            code: "custom",
            message:
              "every channel of this season's tint is 0 — `setTint` MULTIPLIES, so this season " +
              "would paint the map black rather than tint it (Hard Requirement 6)",
          });
        }
      }),
  ),
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
};

export const zBalance: z.ZodType<Balance> = z.object(zBalanceShape);

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
 * build-doc §7.8, parameterised by the party bounds so the ONE home for `maxPartySize` /
 * `maxBoxSize` stays balance.json (G11 / INV-3). A hand-edited or corrupted slot reaches
 * core/save.ts `replay()` through this schema and nothing else, so the caps have to be here: a
 * seven-member party used to parse cleanly and only fail later, deep inside the reducer, as a
 * battler with no slot to stand in.
 *
 * `actionLog[].action` stays permissive BY DESIGN and that has not changed: it is a replay tape
 * whose entries are produced and consumed by core/, and pinning the GameAction union here would
 * make every lane that adds an action edit this file (INV-1/INV-2 spirit). What IS pinned is the
 * one thing every entry must have to be dispatchable at all — a non-empty `t` discriminant. A tape
 * entry whose action is `null`, a number, or `{}` cannot be replayed by anything, so accepting it
 * only moves the failure from load time to replay time.
 */
export function zSaveFileFor(party: Balance["party"]): z.ZodType<SaveFile> {
  return z.object({
    // A positive integer, not a literal: the VALUE is balance.party.saveVersion and core/save.ts
    // checks a loaded save against it. A second pin here made a version bump unloadable.
    version: zInt.min(1),
    seed: zInt,
    year: zInt.min(1),
    tick: zNonNegInt,
    /*
     * DECLARED, OR ZOD DELETES THEM. `z.object` strips keys it does not know, and `deserialize()`
     * runs every load through this schema — so an undeclared field is not merely unvalidated, it is
     * silently discarded on the round trip. Both of these exist to stop the player being refunded
     * time they already spent: `subTick` is the half-tick a battle costs, and `forayStepsSinceTick`
     * is the walk banked toward the next foray tick. Dropping them made quitting mid-excursion a
     * free reset of both, which is exactly the hole their own doc-comments say they close.
     * Optional because a save written before either existed is still loadable and reads as 0.
     */
    subTick: zNonNegInt.optional(),
    forayStepsSinceTick: zNonNegInt.optional(),
    currentNode: z.string().min(1),
    /*
     * …AND SO IS THIS ONE, FOR THE SAME REASON. `interiorId` is which building the player is
     * standing inside (`core/interiors.ts`); `currentNode` still names the town. Undeclared, the
     * `z.object` above would delete it on every load and the bug would read as "reloading puts me
     * outside", which is indistinguishable from the feature working. Optional because absent IS the
     * outdoor state — there is no null form — and because a save written before interiors existed
     * has to keep loading (INV-2).
     *
     * NOT cross-checked against the shipped blueprints here: this schema validates SHAPE, and
     * `data/interiors/` is not one of its inputs. A save naming an interior this build does not
     * ship is put back outdoors, loudly, by `game/scenes/OverworldScene.ts` — the layer that holds
     * both the save and the blueprint set.
     */
    interiorId: z.string().min(1).optional(),
    party: z.array(zOwnedCreature).max(party.maxPartySize),
    box: z.array(zOwnedCreature).max(party.maxBoxSize),
    money: z.number().min(0),
    items: z.record(z.string().min(1), zNonNegInt),
    questFlags: z.record(z.string().min(1), z.union([z.boolean(), z.number(), z.string()])),
    nodeStates: z.record(z.string().min(1), zNodeState),
    actionLog: z.array(
      z.object({
        seq: zNonNegInt,
        year: zInt.min(1),
        tick: zNonNegInt,
        // Same reason as the save's own `subTick` above — undeclared means deleted on load, and a
        // log that loses its fractions no longer replays to the save it came from (L10 / §8.1).
        subTick: zNonNegInt.optional(),
        action: z.looseObject({ t: z.string().min(1) }),
      }),
    ),
  }) as unknown as z.ZodType<SaveFile>;
}

/**
 * The save schema for the SHIPPED balance. `data/balance.json` is already this module's static
 * import and is the single home of the bounds (INV-3), so reading them here adds no second copy.
 * A lane holding a validated `Balance` (an overridden harness file, say) should call
 * `zSaveFileFor(balance.party)` instead of this constant.
 */
export const zSaveFile: z.ZodType<SaveFile> = zSaveFileFor(balanceJson.party);

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
 * seasonal spawns at exactly four migrants; Hard Req 9 fixes the gym rosters at "sizes 3/4/5/6/6/6"
 * INCLUDING the signature, which also fixes the leader count at six; build-doc §8.4 fixes the
 * palette at "32 colors … frozen at gate B0".
 *
 * Gym 1 is 3, not the originally-shipped 4: build-doc Hard Req 9 and bible §7 both read 4/4/5/6/6/6
 * until Hank authorised reducing Maribel to three creatures on the strength of the balance harness
 * (gym 1 measured 26.0% against an 80–95% target — the hardest fight in the game). The ramp is
 * otherwise untouched, so the array still says "the first gym is the smallest and they grow".
 *
 * The species count (27) and node count (12) are deliberately NOT here — §6 INV-1/INV-2 say adding
 * a species or a node touches JSON and assets only, "no code", so a cardinality pinned in this file
 * would make the invariant false. Their identity is held by tests/unit/transcription.test.ts, which
 * reads the shipped files directly. See tests/gates/schemas.test.ts for the argument in full.
 */
const MOVE_POOL_SIZE = 28;
const SEASONAL_MIGRANT_COUNT = 4;
const GYM_ROSTER_SIZES: readonly number[] = [3, 4, 5, 6, 6, 6];
const PALETTE_SWATCH_COUNT = 32;

/** build-doc §8.4: the ids are positional and are the stable contract. */
const paletteSwatchId = (index: number): string => `c${String(index).padStart(2, "0")}`;

/**
 * G3 — no second encounter/spawn/bait table may exist, under any key name, in ANY content file.
 * Hard Req 3: "No second table may exist"; build-doc §8.3: "no encounter-weight literal tables
 * anywhere". Neither clause is scoped to data/nodes/, and the sweep used to be: a top-level
 * `spawnTables` on species.json, `encounterWeights` on moves.json and `baitTable` on gyms.json were
 * all ACCEPTED, because those files parse with `z.object`, which strips undeclared keys in silence.
 *
 * Two layers, because either alone has a hole. The regex catches an obviously-named table and says
 * so in the error; the key allow-list catches a table smuggled in under an innocent name
 * ("weights", "rollTable", "lootTable", "dietEdges", "typeChartMultipliers"), which the regex
 * misses. The allow-list is consulted FIRST — balance.json's own `encounter` and `catch` groups are
 * legitimate names that the regex would otherwise flag.
 *
 * The allow-lists are read off each schema's own shape rather than retyped, so a key added to a
 * schema cannot fall out of step with the sweep that guards it. `_`-prefixed keys are documentation
 * (every content file carries `_source` / `_comment` / `_pyramid`) and are the only unknown keys
 * allowed through — which is also why the file schemas are not `z.strictObject`: strict would
 * reject the documentation, and this sweep is strictly stronger anyway (it sees the raw object,
 * before zod strips anything).
 */
const SECOND_TABLE_KEY = /spawn|encounter|bait/i;

/** Node files get their own const because the message names the list; `spawnTables` is declared in
 *  the shape as `z.undefined()` precisely so it is NOT a legal key. */
const NODE_FILE_KEYS: ReadonlySet<string> = new Set(
  Object.keys(zNodeFileShape).filter((k) => k !== "spawnTables"),
);

const CONTENT_FILE_KEYS: ReadonlyArray<readonly [string, ReadonlySet<string>]> = [
  ["species.json", new Set(Object.keys(zSpeciesFileShape))],
  ["moves.json", new Set(Object.keys(zMovesFileShape))],
  ["gyms.json", new Set(Object.keys(zGymsFileShape))],
  ["palette.json", new Set(Object.keys(zPaletteFileShape))],
  ["balance.json", new Set(Object.keys(zBalanceShape))],
];

/**
 * Report every top-level key of `raw` that is neither declared by the file's schema nor `_`-prefixed
 * documentation. Runs on the RAW object, before zod has had a chance to strip anything.
 */
function sweepFileKeys(label: string, raw: unknown, allowed: ReadonlySet<string>, issues: string[]): void {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return;
  for (const key of Object.keys(raw)) {
    if (allowed.has(key) || key.startsWith("_")) continue;
    if (SECOND_TABLE_KEY.test(key)) {
      issues.push(`${label}: key "${key}" — encounter weights are DERIVED from populations, never tabled (G3)`);
    } else {
      issues.push(
        `${label}: unknown key "${key}" — this file carries exactly ${[...allowed].join("/")} ` +
          `(plus _-prefixed documentation). Anything else is a second table by another name (G3)`,
      );
    }
  }
}

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

  // G3 on the RAW objects, before zod strips anything (see CONTENT_FILE_KEYS).
  const rawByLabel: Record<string, unknown> = {
    "species.json": raw.species,
    "moves.json": raw.moves,
    "gyms.json": raw.gyms,
    "palette.json": raw.palette,
    "balance.json": raw.balance,
  };
  for (const [label, allowed] of CONTENT_FILE_KEYS) {
    sweepFileKeys(label, rawByLabel[label], allowed, issues);
  }

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
    sweepFileKeys(label, n, NODE_FILE_KEYS, issues);
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
  // bible §1 — the chart must be well formed BEFORE it is checked for duality, because the dual
  // check is `includes()`-based and `includes()` is blind to both multiplicity and reflexivity: a
  // type listed twice in strongVs, and a type strong against ITSELF, were each accepted and each
  // reached core/battle.ts `typeMultiplier` as a matchup that resolves against its own defender.
  for (const attacker of TYPE_NAMES) {
    const entry = movesFile.typeChart[attacker];
    for (const [label, list] of [
      ["strongVs", entry.strongVs],
      ["weakVs", entry.weakVs],
    ] as const) {
      if (new Set(list).size !== list.length) {
        issues.push(`typeChart: ${attacker}.${label} lists the same type more than once`);
      }
      if (list.includes(attacker)) {
        issues.push(`typeChart: ${attacker} is listed in its own ${label} — a type has no matchup against itself`);
      }
    }
    const both = entry.strongVs.filter((t) => entry.weakVs.includes(t));
    if (both.length > 0) {
      issues.push(`typeChart: ${attacker} is both strong and weak vs ${both.join(", ")}`);
    }
  }
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
  // Hard Req 9 — "Gym rosters fixed per bible §7", counting the signature, AS AMENDED to
  // 3/4/5/6/6/6 (Maribel reduced to three on Hank's authorisation). The sizes
  // were held only by tests/unit/transcription.test.ts, so the shipped tree was safe but the BOOT
  // validator was not: gym 6 grown to seven, or a seventh leader appearing, all parsed cleanly —
  // and boot is what stands between a live save and corrupt content. Gym 1 at 4 now fails here too,
  // which is what makes the amendment a decision rather than a drift.
  if (gyms.length !== GYM_ROSTER_SIZES.length) {
    issues.push(`gyms.json: expected ${GYM_ROSTER_SIZES.length} leaders (Hard Req 9), found ${gyms.length}`);
  }
  gyms.forEach((g, i) => {
    const expected = GYM_ROSTER_SIZES[i];
    if (expected === undefined) return; // count already reported above
    const size = g.slots.length + 1; // + signature
    if (size !== expected) {
      issues.push(
        `gym ${g.id}: roster of ${size} (${g.slots.length} slots + signature), but Hard Req 9 fixes ` +
          `gym ${i + 1} at ${expected}`,
      );
    }
  });
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
    if (g.act < balance.acts.first || g.act > balance.acts.last) {
      issues.push(
        `gym ${g.id}: act ${g.act} is outside balance.acts ${balance.acts.first}..${balance.acts.last}`,
      );
    }
  }

  /* ── rival cross-checks (bible §8) ──────────────────────────────────────
   *
   * The same reads the leaders get, plus the two invariants that are specific to a rival:
   *   • ONE encounter per act, and one per node. `game/rival.ts` resolves him by node, and two rows
   *     on one route would make "which fight is standing here" ambiguous in a way the corpus (which
   *     has exactly one `wick.act<N>.pre` per route) could not answer.
   *   • He must stay UNDER that act's leader. The badge ladder is the act model's only numeric
   *     input; a rival who out-levels the leader inverts it, and the plan's own risk note calls this
   *     out. Checked against the leader's WEAKEST slot, so it holds for the whole roster.
   */
  const rival = gymsFile.rival;
  const rivalActs = new Set<number>();
  const rivalNodes = new Set<string>();
  for (const r of rival) {
    for (const slot of [...r.slots, r.signature]) {
      if (!speciesIds.has(slot.lineId)) issues.push(`rival ${r.id} act ${r.act}: slot lineId "${slot.lineId}" is not a species line`);
      if (slot.level > balance.xp.levelCap) {
        issues.push(`rival ${r.id} act ${r.act}: level ${slot.level} exceeds balance.xp.levelCap ${balance.xp.levelCap}`);
      }
      for (const t of slot.traits ?? []) {
        const pooled = traitPool.get(t.id);
        if (!pooled) issues.push(`rival ${r.id} act ${r.act}: trait "${t.id}" is not in balance.traits.pool`);
      }
    }
    if (!nodeIds.has(r.node)) issues.push(`rival ${r.id} act ${r.act}: node "${r.node}" is not a node`);
    if (r.act < balance.acts.first || r.act > balance.acts.last) {
      issues.push(`rival ${r.id}: act ${r.act} is outside balance.acts ${balance.acts.first}..${balance.acts.last}`);
    }
    if (rivalActs.has(r.act)) issues.push(`rival ${r.id}: two encounters share act ${r.act} (bible §8: he battles you each act)`);
    rivalActs.add(r.act);
    if (rivalNodes.has(r.node)) issues.push(`rival ${r.id}: two encounters share node "${r.node}"`);
    rivalNodes.add(r.node);
    const leader = gyms.find((g) => g.act === r.act);
    if (leader) {
      const floor = Math.min(...[...leader.slots, leader.signature].map((s) => s.level));
      for (const slot of [...r.slots, r.signature]) {
        if (slot.level >= floor) {
          issues.push(
            `rival ${r.id} act ${r.act}: level ${slot.level} is not under leader ${leader.id}'s weakest slot ` +
              `(${floor}) — the rival must not out-level the badge that opens the next act`,
          );
        }
      }
    }
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

  // ── act-model cross-checks ──────────────────────────────────────────────
  // The act gates are the second clock's whole definition, and every id in them is a reference into
  // data/nodes/. A gate naming a node that does not exist is a town that never unlocks; a gate list
  // that is not ascending is an act a save can skip; a leader on an act with no gate is a gym the
  // act model cannot reach. None of those raises an error anywhere else.
  const actRows = balance.acts.gates;
  if (balance.acts.last < balance.acts.first) {
    issues.push(
      `balance.json: acts.last ${balance.acts.last} is below acts.first ${balance.acts.first}`,
    );
  }
  const gatedActs = new Set<number>();
  let previousBadges = -1;
  actRows.forEach((gate, i) => {
    if (gatedActs.has(gate.act)) issues.push(`balance.json: duplicate acts.gates row for act ${gate.act}`);
    gatedActs.add(gate.act);
    if (gate.act < balance.acts.first || gate.act > balance.acts.last) {
      issues.push(
        `balance.json: acts.gates[${i}] is act ${gate.act}, outside acts ${balance.acts.first}..${balance.acts.last}`,
      );
    }
    if (i > 0 && gate.act !== (actRows[i - 1]?.act ?? -1) + 1) {
      issues.push(`balance.json: acts.gates must be consecutive and ascending; row ${i} is act ${gate.act}`);
    }
    // A save is in the HIGHEST satisfied act, so a later act asking for FEWER badges would be
    // reachable before the act below it — the gates would no longer be a ladder.
    if (gate.badges < previousBadges) {
      issues.push(
        `balance.json: acts.gates[${i}] (act ${gate.act}) needs ${gate.badges} badges, fewer than the act below it`,
      );
    }
    previousBadges = gate.badges;
    for (const nodeId of gate.nodes) {
      if (!nodeIds.has(nodeId)) {
        issues.push(`balance.json: acts.gates[${i}] unlocks node "${nodeId}", which is not a node`);
      }
    }
  });
  if (!gatedActs.has(balance.acts.first)) {
    issues.push(`balance.json: acts.gates has no row for acts.first (${balance.acts.first})`);
  }
  for (const g of gyms) {
    if (!gatedActs.has(g.act)) issues.push(`gym ${g.id}: act ${g.act} has no acts.gates row`);
  }
  // The badge ladder has to be climbable: the last act may not ask for more badges than the region
  // has gyms below it, or the finale is unreachable no matter how long the player plays.
  const topGate = actRows[actRows.length - 1];
  if (topGate && topGate.badges > gyms.length) {
    issues.push(
      `balance.json: acts.gates tops out at ${topGate.badges} badges but gyms.json ships ${gyms.length} leaders`,
    );
  }

  // ── raid cross-checks (bible §9 "scripted per act") ─────────────────────
  // The raids are DATA, and every id in them is a reference into two other files. A raid naming a
  // node or a line that does not exist is an act entry that silently decrements nothing — the
  // Cindershelf "mid-collapse" beat quietly not happening, with no error anywhere.
  const raidIds = new Set<string>();
  for (const raid of balance.yearEvents.raids) {
    if (raidIds.has(raid.id)) issues.push(`balance.json: duplicate yearEvents.raids id "${raid.id}"`);
    raidIds.add(raid.id);
    if (!nodeIds.has(raid.nodeId)) {
      issues.push(`balance.json: raid "${raid.id}" targets node "${raid.nodeId}", which is not a node`);
    }
    // Keyed on the ACT now, and the calendar no longer bounds anything: the only unreachable raid
    // is one authored for an act the region does not have.
    if (!gatedActs.has(raid.act)) {
      issues.push(
        `balance.json: raid "${raid.id}" fires in act ${raid.act}, which has no acts.gates row — no act entry can apply it`,
      );
    }
    for (const t of raid.targets) {
      if (!speciesIds.has(t.lineId)) {
        issues.push(`balance.json: raid "${raid.id}" targets "${t.lineId}", which is not a species line`);
      }
    }
  }

  // ── palette cross-check (build-doc §8.4) ────────────────────────────────
  // The CONTRACT, never the colours: gate B0 is a value swap, so the hexes are legitimately in
  // flux. What Lane B indexes against — the count, the positional ids, and whether the file's
  // freeze claim is true — had no gate at all: a `c00` → `z00` rename and a `frozen: false → true`
  // both survived the full suite.
  if (palette.colors.length !== palette.colorCount) {
    issues.push(`palette.json: colorCount ${palette.colorCount} does not match ${palette.colors.length} colors`);
  }
  if (palette.colors.length !== PALETTE_SWATCH_COUNT) {
    issues.push(
      `palette.json: expected the ${PALETTE_SWATCH_COUNT}-swatch palette (build-doc §8.4), found ${palette.colors.length}`,
    );
  }
  palette.colors.forEach((c, i) => {
    const expected = paletteSwatchId(i);
    if (c.id !== expected) {
      issues.push(
        `palette.json: swatch ${i} is "${c.id}", expected "${expected}" — the ids are positional and are ` +
          `the stable contract the art pipeline indexes against`,
      );
    }
  });
  if (palette.frozen !== (palette.frozenAt !== null)) {
    issues.push(
      `palette.json: frozen=${palette.frozen} but frozenAt=${JSON.stringify(palette.frozenAt)} — a freeze ` +
        `claim without its gate-B0 date, or a date without the claim, is a false statement about §15 gate B0`,
    );
  }

  if (issues.length > 0) throw new ContentValidationError(issues);

  return { species, moves: movesFile, gyms, rival, balance, palette, nodes };
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
