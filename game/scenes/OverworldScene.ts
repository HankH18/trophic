/**
 * game/scenes/OverworldScene.ts — build-doc §15 lane C2, "overworld: painted map + mask movement +
 * encounters off node JSON". 25% of the effort allocation (§1, vertical-slice walkability) and on
 * the never-cut list.
 *
 * build-doc §4's runtime narrative, steps 2–3 and 5, are this scene:
 *   2. render the node's painted map (+ its year variant), query the collision mask, tint by season;
 *   3. "A foray step rolls encounters: weights are **live population counts** from the node state
 *      (dead species literally stop appearing)";
 *   5. "Ticks accrue (travel/foray/inn)."
 *
 * WHAT THIS SCENE DOES NOT DO, on purpose:
 *   • It contains no damage, catch or turn-order arithmetic — a battle belongs to core/battle.ts and
 *     C3's scene renders its event log (L11).
 *   • It contains no encounter or spawn TABLE and no bias of any kind. Every weight comes from
 *     core/foodweb.ts through game/encounters.ts (G3). It does not know what a predator is (G6).
 *   • It does not run the year turn. `core/lifecycle.ts` owns that and C6 owns its UX; this scene
 *     spends the ticks, reports the boundary, and hands it over.
 *   • It writes no moralising copy about catching (G7). The HUD shows counts.
 *
 * ══ INTERIORS ARE A SECOND VIEW MODE OF THIS SCENE, NOT A SECOND SCENE ══
 *
 * Stepping onto a building's doorway re-dresses this scene in place. That is not a new mechanism:
 * {@link OverworldScene.travelTo} has always been exactly that move — same scene, new geometry, new
 * picture, player repositioned — and pointing it at a `core/interiors.ts` blueprint instead of a
 * node file reuses movement, collision, `interact`, the HUD, the two clocks and the save unchanged.
 * A separate Phaser scene would have had to re-mount every one of them and keep them in step.
 *
 * The three things that ARE different indoors, each stated where it happens:
 *   • `save.currentNode` KEEPS NAMING THE TOWN, and `save.interiorId` says which room. See
 *     `core/types.ts` `SaveFile.interiorId` for the nine call sites that throw or answer silently
 *     wrong on a location id they do not know.
 *   • No encounter is rolled and no foray tick is charged — {@link OverworldScene.onStepCompleted}.
 *   • Entering and leaving cost NOTHING: no tick, no action-log entry. Position is not on the
 *     replay tape, entering changes no simulated state, and `core/save.ts`'s contract is that an
 *     entry is either a price or an absolute consequence. A `ClockActionKind` for it would light up
 *     five exhaustive switches to charge zero.
 *
 * SEAMS FOR THE OTHER LANES. Every hand-off is an optional hook on {@link OverworldHooks}. When a
 * hook is absent the scene does the honest minimal thing itself and says so on screen, so the
 * vertical slice is walkable today; when C1/C3/C5/C6 land, they pass hooks and the defaults switch
 * off. That is why the defaults are all observable rather than silent.
 */

import Phaser from "phaser";
import {
  advanceAction,
  seasonOf,
  type ClockActionKind,
  type ClockEvent,
  type ClockState,
  type YearEndReason,
} from "../../core/clock";
import { defaultContext, stepRegionStates, type SimContext } from "../../core/ecosim";
import { indexSpecies, type EcoNode, type SpeciesIndex } from "../../core/foodweb";
import { deriveStream, subsystemRng, type Rng } from "../../core/rng";
import { validateContent } from "../../core/schemas";
import {
  appendAction,
  newSave,
  openStreams,
  type RngStreams,
  type SaveEnvelope,
} from "../../core/save";
import type {
  Balance,
  CollisionGrid,
  Content,
  GameAction,
  GymLeader,
  NodeFile,
  RivalEncounter,
  SaveFile,
  Season,
} from "../../core/types";
/*
 * THE INTERIOR MODEL, AND NOTHING ELSE FROM IT. `core/interiors.ts` holds the blueprints, their
 * schema and the second pass over the ASCII plan that reads its anchors; it deliberately does NOT
 * build a collision grid, because `core/` may not import `game/` — so this file is the first (and
 * only) production caller of `gridFromAscii` on a plan. See {@link OverworldScene.interiorGrid}.
 */
import {
  PLAN_DOOR,
  interiorById,
  interiorsOf,
  planCellsWith,
  planSize,
  stepFrom,
  type InteriorAnchor,
  type InteriorBlueprint,
  type PlanCell,
} from "../../core/interiors";
import {
  cellTopLeftWorld,
  chooseSpawnTile,
  gridConsistencyProblem,
  gridFromAscii,
  loadCollision,
  tileGridSize,
  tileWalkable,
  worldCellPx,
  type LoadedCollision,
  type MaskPixels,
} from "../collision";
import {
  absenceCauseOf,
  rollForayStep,
  stepsPerForay,
  totalActiveWeight,
  encounterTable,
  type Encounter,
  type ForayContext,
} from "../encounters";
import {
  applyBattleResult,
  applyWildBattleOutcome,
  buildWildBattle,
  isStanding,
  liveNodeOf,
  wildBattleProblem,
} from "../wild-battle";
import {
  BLACKOUT_ENTRY_ID,
  applyBlackoutRecovery,
  applyInnRest,
  blackoutCharges,
  blackoutRecoveryFor,
  blackoutTicks,
  innNodeIds,
  innRestFor,
  innkeeperAt,
  restBeatAt,
} from "../../core/recovery";
import {
  MapView,
  drawCollisionOverlay,
  drawInteriorFootprint,
  ensureNodeArt,
  interiorAssetPath,
  nodeArtKeys,
  paintedInteriorKey,
  playerPlaceholderKey,
  queueNodeArt,
  readMaskPixels,
} from "../mapview";
import { seasonTintLabel } from "../season-tint";
import { SCENE_KEYS, sceneRegistered } from "../scene-keys";
import {
  actOf,
  awardBadge,
  markRunCompleteShown,
  prologueExitFlags,
  runCompleteShown,
  runIsComplete,
  setQuestFlags,
  unlockActOf,
} from "../../core/acts";
import { enterPendingActs, heirStreamKey } from "../../core/lifecycle";
import { activeWindows, syncEventFlags } from "../../core/regional-events";
import { buildGymBattle, gymAtNode, gymBattleProblem, gymBattleWon } from "../gym-battle";
import {
  DIALOGUE,
  applyRunFlags,
  autoplayEntryFor,
  battleEntryFor,
  battleOutcomeKind,
  dialogueContext,
  propDialogueFor,
  runHeadless,
  talkEntryFor,
  transcript,
  type DialogueRunState,
} from "../dialogue-runner";
import {
  buildRivalBattle,
  rivalAtNode,
  rivalBattleProblem,
  rivalBattleWon,
  rivalEncounterStanding,
} from "../rival";
import {
  buildVellsireBattle,
  epilogueShown,
  finaleNodeId,
  finaleUnlocked,
  resolveVellsireCatch,
  resolveVellsireWithoutBattle,
  vellsireAttempt,
  vellsireBattleOutcomeLabel,
  vellsireBattleProblem,
  vellsireResolved,
} from "../finale";
import {
  linesMetAt,
  questReports,
  recordLineMet,
  releaseCandidate,
  releaseRefusal,
  releaseIntoNode,
  stillOwed,
  syncQuestFlags,
} from "../quests";
import { propAt, propLabel, propsOf } from "../props";
import { createDialogueScene, type DialogueSceneData } from "./DialogueScene";
import {
  DEFAULT_SEASON_METER_STYLE,
  SeasonMeterHud,
  actionCosts,
  phaserMeterSurface,
  previewAction,
  seasonMeterModel,
  type SeasonMeterStyle,
} from "../ui/SeasonMeter";
/*
 * THE BLACKOUT CURTAIN'S ONE COLOUR. `void` is the palette's own name for it — "deepest shade —
 * screen letterbox, the field behind the combatants" — so the black screen is the same black every
 * other letterbox in the game is, and a re-freeze of `data/palette.json` moves all of them at once.
 * A `0x000000` typed here would be the one colour on this screen the palette does not own.
 */
import { roleColor } from "../ui/Palette";
import {
  actEntryBeats,
  beatLines,
  driveYearTurn,
  finishYearTurn,
  yearTurnTrigger,
  type YearCarry,
  type YearTurnDrive,
  type YearTurnSceneData,
} from "./YearTurnScene";
import {
  DIRECTIONS,
  chooseDirection,
  createMovement,
  delta,
  movementConfig,
  newlyPressed,
  placeAt,
  queueInput,
  spriteWorldPosition,
  update as updateMovement,
  type Direction,
  type MovementConfig,
  type MovementState,
} from "../movement";
// TYPE ONLY. `game/scenes/BattleScene.ts` value-imports Phaser, and so does this file — but the
// hand-off must stay a shape, not a module edge: importing the CLASS here would make the overworld
// and the battle scene a cycle through `game/main.ts`'s scene list.
import type { BattleSceneData } from "./BattleScene";

export const OVERWORLD_SCENE_KEY = "Overworld";

/**
 * Subsystem stream names. build-doc §8.1 declares the set in `balance.rng.subsystemTags`, and
 * {@link OverworldScene.streamFor} checks these two are in it at boot rather than trusting the
 * spelling — so a retune that renames a tag fails loudly here instead of silently handing the
 * overworld a fresh stream at draw zero.
 */
const ENCOUNTER_STREAM = "encounter";
const SIM_STREAM = "sim";
const BATTLE_STREAM = "battle";
/*
 * The heir roll's subsystem tag is NOT declared here. It is `LIFECYCLE_STREAM` in core/lifecycle.ts,
 * beside `heirStreamKey`, which is the one place the heir stream's key is spelled and the one place
 * that checks the tag against `balance.rng.subsystemTags`. A copy of it here is exactly how the two
 * replay harnesses ended up modelling a stream the game no longer used.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * Seams
 * ──────────────────────────────────────────────────────────────────────────── */

export interface OverworldHooks {
  /**
   * A wild creature was met. OVERRIDE, not the wiring: when this is absent the scene launches the
   * battle itself ({@link OverworldScene.beginWildBattle}) and applies the catch through
   * `game/wild-battle.ts`, so the catch→survey loop is reachable by playing.
   *
   * It used to be the ONLY route, and nothing supplied it: `game/boot.ts` passed `onSaveChanged`
   * and nothing else, so a wild encounter in the shipped game flashed a banner and ended there. Two
   * in-game years of real play produced 56 encounters and moved zero populations. A seam is not a
   * hand-off until something is on the other side of it, so the default is now the real thing and
   * this hook is for a lane that wants to take it over.
   */
  onEncounter?: (encounter: Encounter, scene: OverworldScene) => void;
  /**
   * C5/C6. The clock crossed a boundary. Returning `true` means "I handled these" and the scene
   * runs none of its own defaults — which is the seam that stops the season being stepped twice.
   */
  onClockEvents?: (events: ClockEvent[], scene: OverworldScene) => boolean | void;
  /** C1. The save changed — persist it (with `withStreamState(save, scene.streams)`). */
  onSaveChanged?: (save: SaveEnvelope, scene: OverworldScene) => void;
  /** C7/C9. The player travelled the adjacency graph. */
  onTravel?: (from: string, to: string, scene: OverworldScene) => void;
  /**
   * C7. The PROLOGUE. Return `true` to say "I own the opening beat" — the overworld then writes no
   * story flag of its own and the act ladder's first rung is entirely yours.
   *
   * ⚠ THIS SEAM EXISTS BECAUSE THE LADDER'S FIRST RUNG HAD NO WRITER. `balance.acts.gates` opens
   * act 1 on `story.opening.done`, which only `data/dialogue.json` writes — and nothing in `game/`
   * reads that file. Measured on a brand-new save through the real scene: act 0,
   * `unlockedNodeIds` = `["hearthollow"]`, `travelTo("r1")` REFUSED. The act gate on travel had
   * turned an open region into one the player could not leave. Absent this hook the
   * scene writes {@link core/acts.prologueExitFlags} once the starter is in hand and SAYS SO on
   * screen — the same declared stand-in `game/boot.ts` `startingParty` already ships for the
   * starter itself, and it switches off the moment a lane takes this hook.
   */
  onOpeningBeat?: (scene: OverworldScene) => boolean | void;
  /**
   * C3/C7. The player challenged the leader standing in this town. Return `true` to say "I launched
   * the fight" — the overworld then does nothing further and the badge is yours to award through
   * {@link OverworldScene.winGym}.
   *
   * Absent it the scene fights the leader itself, through `game/gym-battle.ts` and C3's battle
   * scene, and writes the badge on a `"win"` and on nothing else.
   */
  onGymChallenge?: (gym: GymLeader, scene: OverworldScene) => boolean | void;
  /**
   * C7. The run's final beat has been earned — `core/acts.ts` `runIsComplete` of this save, which
   * is an ACT condition and never a date. It fires ONCE per save: the hand-over is latched in
   * `questFlags` (`RUN_COMPLETE_SHOWN_FLAG`), so a reload of a finished run does not replay it and
   * neither does the next year turn.
   *
   * This is the seam the ending hangs off (Hard Req 7's epilogue survey, the Vellsire choice). Until
   * something takes it, the overworld says so on screen, which is the honest minimum. Nothing stops
   * afterwards: the calendar is unbounded, the player may keep playing, and `isOver` — which used
   * to answer "has the calendar passed year 6" and refused ticks, encounter rolls and year turns —
   * is gone with the six-year cap it enforced.
   */
  onRunComplete?: (save: SaveEnvelope, scene: OverworldScene) => void;
}

export interface OverworldSceneData {
  /** Validated content. Omitted ⇒ the scene validates it itself (works standalone). */
  content?: Content;
  /** The live save. Omitted ⇒ a fresh one seeded from `balance.rng.defaultSeed`. */
  save?: SaveEnvelope;
  /** Streams positioned by `openStreams`. Omitted ⇒ opened from the save. */
  streams?: RngStreams;
  hooks?: OverworldHooks;
  /** Node to start at. Omitted ⇒ `save.currentNode`. */
  startNode?: string;
  /** Walk pace override, ms per tile. Presentation only (see game/movement.ts). */
  msPerTile?: number;
}

/** A beat the overworld has taken responsibility for and not yet put on screen. */
interface PendingEntry {
  entryId: string;
  /** The name the flags it writes are reported under — {@link OverworldScene.finishDialogue}. */
  who: string;
  then?: (() => void) | undefined;
  /** Whether this beat is read against a blacked-out screen. See `curtainWanted`. */
  curtain: boolean;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The scene
 * ──────────────────────────────────────────────────────────────────────────── */

export class OverworldScene extends Phaser.Scene {
  content!: Content;
  balance!: Balance;
  species!: SpeciesIndex;
  save!: SaveEnvelope;
  streams!: RngStreams;

  /** The node file (shipped, immutable) the player is standing in. */
  node!: NodeFile;
  /** The node as the ecology sees it — `save.nodeStates` merged onto the file. Rebuilt on demand. */
  collision!: LoadedCollision;
  mapView!: MapView;
  movement!: MovementState;
  movementCfg!: MovementConfig;

  /**
   * The building the player is standing inside, or null outdoors.
   *
   * DERIVED FROM THE SAVE ON EVERY `init`, never latched independently of it — see
   * {@link adoptInterior}. A Phaser scene instance survives a `scene.start`, so a field the save did
   * not agree with would come back after a trip to the in-run menu and put the player in a room the
   * save says they left.
   */
  private interior: InteriorBlueprint | null = null;
  /**
   * The room's collision, parsed from its ASCII plan by `game/collision.ts` `gridFromAscii` — the
   * engine's own parser, so a wall in the picture and a wall the player bumps into are the same
   * cell by construction. `core/interiors.ts` pins its own solidity predicate to this function's
   * answer cell-for-cell, which is what makes that true across the seam.
   *
   * ⚠ `collisionCellPx` IS PASSED EXPLICITLY, and `gridDimensions()` must not be used to derive it:
   * that function computes a cell size from the map's NATIVE width over the 64-cell lattice, which
   * is meaningless for a room a dozen cells wide. `core/interiors.ts`'s header says the same.
   *
   * The town's own {@link collision} is left standing beside this, untouched, because the player is
   * coming back out of that door — and because it is the node's authored mask, which a room's plan
   * is not. {@link activeGrid} is the one place the two are chosen between.
   */
  private interiorGrid: CollisionGrid | null = null;
  /** The room's footprint stand-in (game/mapview.ts `drawInteriorFootprint`). Rebuilt every create. */
  private interiorView!: Phaser.GameObjects.Graphics;
  /**
   * The room's PAINTING, when one exists — the interior half of what {@link MapView} is for a node.
   *
   * Null until a painted room is actually stood in, and nulled again on every `create` because a
   * restart tears the display list down while the fields survive (the asymmetry {@link overlay} and
   * {@link interiorView} are rebuilt for). Made on demand rather than up front because there is no
   * key to make it with until then: no room is painted yet, and `add.image` on a key the loader
   * never got is a Phaser warning and a blank object. When it is null the footprint is what is on
   * screen, and that is the path every shipped room takes today.
   */
  private interiorArt: Phaser.GameObjects.Image | null = null;

  private hooks: OverworldHooks = {};
  private startNodeId: string | null = null;
  private msPerTile: number | undefined;
  private simContext!: SimContext;

  private player!: Phaser.GameObjects.Image;
  private overlay!: Phaser.GameObjects.Graphics;
  private overlayVisible = false;
  private hud!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  /**
   * L8's meter (game/ui/SeasonMeter.ts) — the one readout of the clock on this screen. It carries one
   * pip per `clock.ticksPerYear`, which is why this line no longer says how many: it said "16-pip"
   * and the year is 52 ticks long now.
   */
  private meterHud!: SeasonMeterHud;
  /** True while the year-turn sequence has the screen; this scene is paused and spends no ticks. */
  private yearTurnRunning = false;
  /** True while a wild battle has the screen. Same contract as `yearTurnRunning`. */
  private battleRunning = false;
  /** True while the dialogue box has the screen. Same contract again. */
  private dialogueRunning = false;
  /**
   * True for exactly as long as a box's `onDone` is running — i.e. while a beat is HANDING BACK.
   *
   * ⚠ A `scene.launch` MADE IN THIS WINDOW IS UNDONE BY THE BOX THAT IS CLOSING, AND THAT ENDED
   * EVERY RUN A PARTY WIPE HAPPENED IN. `game/scenes/DialogueScene.ts` `finish()` is two
   * statements — `this.onDone(this.state)` and then `this.scene.stop()` — and Phaser applies
   * `ScenePlugin` calls as an ordered queue (`SceneManager.processQueue`), so everything the
   * overworld does inside `onDone` is queued AHEAD of the box's own teardown. A chained
   * {@link playEntry} therefore queued `start(Dialogue, next)` and `pause(Overworld)`, and the
   * closing box then queued `stop(Dialogue)` behind both: the new box was shut down the instant it
   * started and the overworld was left paused with nothing alive to resume it. Traced on the wipe
   * path — the blackout narration played, the innkeeper's beat never appeared, and arrows, [C],
   * [E] and ESC were all dead with the game loop still running at ~110fps and no console error.
   *
   * `pause`/`resume` are NOT ref-counted (Phaser `Systems.pause` flips a boolean and warns
   * "Cannot pause non-running Scene" on a second one — no such warning was ever logged, which is
   * what ruled the double-pause reading out), so a balanced count is no defence: the run ended
   * `…resume, pause` and the last operation is the one the player lives with.
   */
  private handingBack = false;
  /**
   * The beat asked for during that window, waiting for a frame of its own — see {@link openBox}.
   *
   * Held rather than launched, and drained at the top of {@link update}: by then `onDone` has
   * returned, the closing box has queued its own `stop`, and the launch lands after it. The
   * overworld is un-paused for that one frame and deliberately does nothing else with it.
   */
  private pendingEntry: PendingEntry | null = null;
  /**
   * The full-screen black a blackout beat is read against, or null while the map is up.
   *
   * A display-list object, so a restart destroys it and the FIELD would still point at the corpse —
   * the same asymmetry {@link create} nulls `interiorArt` for.
   */
  private curtain: Phaser.GameObjects.Rectangle | null = null;
  /** The last line a player actually read, for the HUD. Empty before anything has been said. */
  private lastSpoken = "";

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private dirKeys: Array<{ dir: Direction; keys: Phaser.Input.Keyboard.Key[] }> = [];
  private overlayKey?: Phaser.Input.Keyboard.Key;
  private innKey?: Phaser.Input.Keyboard.Key;
  private gymKey?: Phaser.Input.Keyboard.Key;
  private talkKey?: Phaser.Input.Keyboard.Key;
  private releaseKey?: Phaser.Input.Keyboard.Key;
  private travelKeys: Phaser.Input.Keyboard.Key[] = [];
  /**
   * Directions held on the previous frame, so {@link chooseDirection} can tell a NEW press from a
   * held one — Gold's "most recent press wins", which is what stops a direction held into a wall
   * from locking out a second direction with an open path in front of it.
   */
  private heldLastFrame: ReadonlySet<Direction> = new Set<Direction>();

  /** Movement steps since the last foray tick was charged (build-doc §7.2). */
  private stepsSinceTick = 0;
  private encountersMet = 0;
  private lastEncounter: Encounter | null = null;
  private lastNote = "";
  private travelling = false;
  private hudDirty = true;
  /**
   * The VIEW the current geometry was built for — {@link viewId}, i.e. the interior's id when the
   * player is inside one and the node's id when they are not. `buildNodeView` respawns the player
   * only when this changes — see its header for the teleport-on-every-ESC defect that made it
   * necessary, which an interior would otherwise reintroduce: a trip to the in-run menu taken while
   * indoors comes back through `create()` → `buildNodeView`, and comparing against the NODE id
   * alone would say "same place" and then keep a tile that belongs to the other geometry.
   */
  private viewNodeId: string | null = null;
  /** Non-null when the player is standing somewhere they should not be able to stand. Printed. */
  private spawnProblem: string | null = null;
  /**
   * The prop covering the arrival tile, when the spawn could not be placed clear of one. Printed.
   *
   * NOT THE SAME QUESTION AS {@link spawnProblem}, and that is why it is a second field. A spawn
   * problem is "there is nowhere legal to stand"; this is "there is somewhere legal to stand and
   * every one of them is inside a prop's reach" — a mask the loader calls perfectly healthy, on
   * which `interact()` nonetheless answers with a signpost from wherever the player is put down,
   * because it asks `propUnderPlayer()` before it asks the room.
   *
   * `chooseSpawnTile` reports it rather than resolving it, deliberately: a prop is a spawn
   * PREFERENCE and not collision (game/collision.ts `firstWalkableTile`), so the fallback spiral is
   * right to land the player there — and then the only thing left to do about it is say so. It is
   * null on every shipped node today, which is exactly the state a readout is for keeping true.
   */
  private spawnInsideProp: string | null = null;
  /**
   * Cutscenes {@link playPendingCutscene} has already fired this visit.
   *
   * The corpus closes each of its own cutscenes with a flag, so this only guards a corpus edit that
   * ships one which does not — and against that the alternative is an overworld that plays the same
   * beat every frame for ever.
   */
  private autoplayed = new Set<string>();
  /**
   * Entries [E] has already produced in the node the player is standing in.
   *
   * Cleared on arrival at a node. It is what makes every eligible line in a room REACHABLE — see
   * `talkEntryFor`, and the `maren.crash-survey` / `maren.keystone.4` priority collision it names.
   */
  private spokenHere = new Set<string>();

  /**
   * What to do once the box has finished — the fight after a `battle-pre`, the finale after the
   * Vellsire choice.
   *
   * A FIELD RATHER THAN A CALLBACK CHAINED INSIDE `playEntry`, because `finishDialogue` ends by
   * calling {@link playPendingCutscene}: a beat that runs straight into a cutscene must launch its
   * battle AFTER that cutscene, not underneath it, or the fight and the box own the screen at once.
   * The continuation therefore rides along until no dialogue is running, and is cleared before it is
   * called so a re-entrant run cannot fire it twice.
   */
  private afterDialogue: (() => void) | null = null;

  constructor() {
    super(OVERWORLD_SCENE_KEY);
  }

  /* ── boot ─────────────────────────────────────────────────────────────── */

  init(data: OverworldSceneData = {}): void {
    this.content = data.content ?? validateContent();
    this.balance = this.content.balance;
    this.species = indexSpecies(this.content.species);
    this.hooks = data.hooks ?? {};
    this.startNodeId = data.startNode ?? null;
    this.msPerTile = data.msPerTile;

    this.save =
      data.save ??
      newSave(
        {
          seed: this.balance.rng.defaultSeed,
          currentNode: this.startNodeId ?? this.firstWalkableNodeId(),
          nodes: this.content.nodes,
        },
        this.balance,
      );
    if (this.startNodeId && this.startNodeId !== this.save.currentNode) {
      this.save = { ...this.save, currentNode: this.startNodeId };
    }
    this.streams = data.streams ?? openStreams(this.save, this.balance);
    this.simContext = defaultContext();

    const problem = gridConsistencyProblem(this.balance);
    if (problem) console.warn(`[overworld] ${problem}`);
    const cellProblem = interiorCellProblem(this.balance);
    if (cellProblem) console.warn(`[overworld] ${cellProblem}`);

    this.node = this.nodeFile(this.save.currentNode);
    // BEFORE `buildNodeView`, which asks {@link activeGrid} whether the standing tile is still legal
    // and lands the player on the room's arrival cell when it is not.
    this.adoptInterior(this.save.interiorId ?? null);
    this.movementCfg = movementConfig(this.balance, this.msPerTile);
    /*
     * THE FORAY ODOMETER IS THE SAVE'S, and it is read back here.
     *
     * It used to be scene state and nothing else, so quitting mid-excursion refunded the walk: 47 of
     * the 48 steps a foray tick is charged for could be banked, saved, reloaded and banked again,
     * for ever, at no cost on the meter. `SaveFile.forayStepsSinceTick` is where it lives now.
     * `?? 0` because the field is optional: a save written before it existed opens on a fresh
     * excursion rather than failing to load (INV-2).
     */
    this.stepsSinceTick = this.save.forayStepsSinceTick ?? 0;

    /*
     * A Phaser scene INSTANCE outlives a restart — `scene.start` shuts the scene down and re-runs
     * `init`/`create` on the same object — so every field above survives a trip to the in-run menu.
     * That is what lets the player's tile survive (see `buildNodeView`), and it is also what makes
     * these two dangerous: a restart taken while another scene had the screen would come back with
     * a latch still set and freeze the overworld's input or its clock forever. They are the
     * "in flight" flags of a flight that no longer exists.
     */
    this.travelling = false;
    this.yearTurnRunning = false;
    this.battleRunning = false;
    this.dialogueRunning = false;
    // …and the beat that was one frame from opening. It is dropped rather than replayed on the
    // other side of the restart: `dialogueRunning` is cleared on the line above for the reason the
    // comment gives, and a queued entry outliving that would open a box over a scene that has just
    // rebuilt its whole display list. Every autoplay entry closes itself with a flag, so a cutscene
    // lost here is still pending; a `then` continuation is not, and this is the only path that can
    // drop one — a restart taken inside the single frame between a beat closing and the next
    // opening, which needs the in-run menu to be keyed in that frame.
    this.pendingEntry = null;
    this.handingBack = false;
    this.autoplayed = new Set<string>();
    this.spokenHere = new Set<string>();
    this.heldLastFrame = new Set<Direction>();
  }

  preload(): void {
    queueNodeArt(this, nodeArtKeys(this.node, this.save.year, this.balance));
  }

  create(): void {
    this.buildNodeView();

    this.player = this.add
      .image(0, 0, playerPlaceholderKey(this, this.balance))
      .setDisplaySize(this.balance.map.playerSpriteW, this.balance.map.playerSpriteH)
      .setDepth(20);

    /*
     * The Graphics object is new on every `create`; `overlayVisible` is an instance field and is
     * NOT. Building it hidden regardless left the two disagreeing after every trip to the in-run
     * menu — the flag said the overlay was on, the object was off, and the next [C] press turned the
     * flag off instead of the overlay on, so the player had to press it twice. The preference is the
     * thing worth keeping across a restart; the object is the thing that has to be told.
     */
    this.overlay = this.add.graphics().setDepth(10).setVisible(this.overlayVisible);
    if (this.overlayVisible) drawCollisionOverlay(this.overlay, this.activeGrid(), this.balance);

    // Above the (hidden) painting, below the collision overlay and the player. Built on every
    // `create` for the same reason the overlay is: the display list is torn down by a restart and
    // the fields are not.
    this.interiorView = this.add.graphics().setDepth(INTERIOR_DEPTH);
    // The image is the display list's, so a restart destroyed it and this field would otherwise
    // still be pointing at the corpse. `syncViewMode` remakes it if a painted room is up.
    this.interiorArt = null;
    // Same asymmetry, same fix — and there is nothing to remake: `init` has already dropped the
    // queued beat the curtain would have been raised for.
    this.curtain = null;
    this.syncViewMode();

    const camera = this.cameras.main;
    this.applyCameraBounds();
    camera.startFollow(this.player, true);

    // L8's season meter is HUD, not a menu: it is on screen while the overworld is. The widget is
    // game/ui/SeasonMeter.ts's — this scene used to print `year N · tick t/16 · season` as plain
    // text instead (a 16-tick year, back then), which is a second readout of the same clock and left
    // the meter L8 names mounted nowhere in the game.
    this.meterHud = new SeasonMeterHud(phaserMeterSurface(this, METER_STYLE), METER_STYLE);

    /*
     * WRAPPED, and the width is the screen's. Without it the HUD text object sized itself to its
     * longest line — measured at 1044px on a 480px virtual screen — so the provenance line, the one
     * that distinguishes a placeholder from real art, was cut off mid-sentence at the right edge
     * ("… SYNTHESISED co"), and the dark panel behind the text spanned the whole canvas including
     * the player. TitleScene and BootScene both already wrap; this one did not.
     */
    const wrapWidth = Math.max(1, this.scale.width - HUD_PAD * 2);
    this.hud = this.add
      .text(HUD_PAD, METER_STYLE.y + METER_STYLE.cellH + METER_STYLE.cellGap + HUD_LINE_PX, "", HUD_STYLE)
      .setWordWrapWidth(wrapWidth, true)
      .setScrollFactor(0)
      .setDepth(100);
    this.banner = this.add
      .text(HUD_PAD, this.scale.height - HUD_PAD, "", BANNER_STYLE)
      .setWordWrapWidth(wrapWidth, true)
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(100);

    /*
     * BOTH CLOCKS ARE BROUGHT UP TO DATE BEFORE THE FIRST FRAME — AND AFTER THE BANNER EXISTS.
     *
     * ⚠ THE ORDER IS LOAD-BEARING. These two calls used to stand at the TOP of `create()`, thirty
     * lines above `this.banner = this.add.text(...)`, and both of them flash banners: `advanceActs`
     * once per raid event and again through `completeRun`. So loading any save with a pending act-4
     * entry — three badges, i.e. the shipped Cullbrand raid — or a finished run threw
     * `TypeError: Cannot read properties of undefined (reading 'setText')` out of `flashBanner`
     * and the overworld never built. Reproduced twice with the repo's own Phaser recorder rig, and
     * once in the whole suite. A scene's own hand-offs may not run before the objects they report
     * through exist.
     *
     * `advanceActs` enters any act the save has earned and not yet entered — which for a brand-new
     * save is the prologue, and for a loaded one is nothing at all (the entry is latched in
     * `questFlags`, so this is idempotent and costs nothing). `syncEvents` republishes bible §9's
     * open windows, because a save can be loaded standing in the middle of one and the flags are a
     * projection of the clock, not state the save carries.
     */
    this.ensureDialogueScene();
    this.advanceActs();
    this.syncEvents();
    this.syncQuests();

    this.bindKeys();
    this.syncPlayerSprite();
    this.refreshHud();
    // The cutscene the corpus has waiting for this node, played without being asked for — the
    // opening beat is one, and a beat the player has to guess a key for is a beat that does not fire.
    this.playPendingCutscene();
  }

  /**
   * Register the dialogue box with the running game if the scene list has not.
   *
   * ⚠ WHY THIS IS HERE AND NOT IN `game/main.ts`. That file is the ONE place that names a scene
   * class, and adding `createDialogueScene(Phaser)` to its `SCENES` array is the one-line change
   * that makes this method dead code — it is not made here because `game/main.ts` and
   * `game/boot.ts` belong to another stream in this wave. Until then, the alternative was shipping
   * the whole authored corpus behind a scene key nothing had registered, which is precisely the
   * failure `game/main.ts`'s own header warns about: "a scene that is not in this list does not
   * exist" — the year turn and the retirement card were built, tested and left unregistered, and
   * the never-cut Legacy beat was
   * reachable from the test suite and from nowhere else.
   *
   * `scene.add` is asked for rather than assumed: a headless rig stands up the slice of Phaser it
   * needs, and a scene that crashed during `create` because the stub had no `add` would take the
   * whole overworld with it. When it is absent the dialogue still plays — headlessly, out loud (see
   * {@link playEntry}).
   */
  private ensureDialogueScene(): void {
    if (sceneRegistered(this, SCENE_KEYS.dialogue)) return;
    const manager = this.scene as unknown as {
      add?: (key: string, scene: unknown, autoStart?: boolean) => unknown;
    };
    if (typeof manager.add !== "function") return;
    try {
      manager.add(SCENE_KEYS.dialogue, createDialogueScene(Phaser), false);
    } catch (err) {
      console.warn(`[overworld] could not register "${SCENE_KEYS.dialogue}": ${describe(err)}`);
    }
  }

  /* ── node view ────────────────────────────────────────────────────────── */

  private firstWalkableNodeId(): string {
    const walkable = this.content.nodes.find((n) => n.walkable);
    const first = walkable ?? this.content.nodes[0];
    if (!first) throw new Error("content has no nodes — data/nodes/ is empty");
    return first.id;
  }

  nodeFile(id: string): NodeFile {
    const node = this.content.nodes.find((n) => n.id === id);
    if (!node) throw new Error(`no node "${id}" in data/nodes/`);
    return node;
  }

  /**
   * The live node: the shipped file with the save's populations, flora and recentDeaths on it.
   *
   * ⚠ THE ONE PLACE THE POPULATION FALLBACK IS DECIDED. Every reader of a count on this screen goes
   * through here — the encounter roll, the HUD's survey lines, the encounter banner. It used to be
   * two: this function fell back to the shipped file when a node had no `nodeStates` entry (the
   * INV-2 "a save that predates this node" case), while `countOf` independently fell back to 0. The
   * HUD then printed every line as `0` while creatures kept spawning at the shipped weights, and an
   * encounter banner read `pollywisp-line J L8 — count 0`. That is build-doc §8.3's two answers to
   * one number, on the number Hard Req 2 is about.
   */
  liveNode(id: string = this.node.id): EcoNode {
    // Delegated, not restated: `liveNodeOf` (game/wild-battle.ts) is the one place the fallback is
    // decided, so the catch that moves a count and the roll that reads it cannot drift apart.
    return liveNodeOf(this.content, this.save, id);
  }

  /**
   * Sample the mask (once) and build the map image. ONE mask serves EVERY year (Hard Req 5, which
   * says "one mask per node, reused by all year variants") — the year only ever reaches `MapView`,
   * never `loadCollision`. It used to say "all six years"; the calendar has no sixth year to stop
   * at, and the mask does not care.
   *
   * ⚠ IT RESPAWNS ONLY WHEN THE NODE CHANGED. This used to place the player at
   * `firstWalkableTile(...) ?? {col:0,row:0}` unconditionally, and `create()` runs it on every scene
   * start — so ESC into the in-run menu and back teleported the player from wherever they were to
   * the middle of the map (measured: {40,41} → {32,32}) and threw away their partial foray progress
   * with it. A Phaser scene instance survives a restart, so the tile is still on `this.movement`
   * when we get here; the only question is whether it is still a legal tile in the view being built.
   *
   * The `?? {col:0,row:0}` is gone for the same reason: (0,0) is blocked on any bordered grid, so a
   * broken mask spawned the player inside geometry with nothing on screen saying so.
   * {@link chooseSpawnTile} returns the sentence instead, and the HUD prints it.
   */
  private buildNodeView(): void {
    const keys = nodeArtKeys(this.node, this.save.year, this.balance);
    const pixels = readMaskPixelsSafe(this, keys.maskKey);
    this.collision = loadCollision(this.node.id, keys.maskPath, pixels, this.balance);

    this.mapView?.destroy();
    this.mapView = new MapView(this, {
      node: this.node,
      year: this.save.year,
      season: this.currentSeason(),
      balance: this.balance,
    });

    /*
     * THE PROPS ARE HANDED OVER, and leaving them off is a live defect rather than a missed
     * option. `interact()` asks `propUnderPlayer()` before it asks the room, so an arrival tile
     * inside a prop's `interactionRadius` makes that prop the only thing [E] can reach from where
     * the player is put down — measured at `bowerdeep`, whose market sign covers the blind spawn
     * at 88.0 world px against a 96 px radius, putting a town that ships two quest chains, an
     * innkeeper and a vendor one unprompted step out of reach. `SpawnOptions.props` is a spawn
     * PREFERENCE and not collision (game/collision.ts `firstWalkableTile`): it spirals once for a
     * prop-clear tile and falls back to the original spiral unchanged, so a node whose every
     * walkable tile is covered still spawns exactly where it used to.
     */
    const spawn = chooseSpawnTile(this.collision.grid, this.balance, { props: propsOf(this.node) });
    this.spawnProblem = spawn.problem;
    // Indoors the landing is the blueprint's `arrival` and not this tile (see below), so a reading
    // about the town's spawn would be a readout about somewhere the player is not standing.
    this.spawnInsideProp =
      this.interior !== null || spawn.insideProp == null
        ? null
        : `spawn ${String(spawn.tile.col)},${String(spawn.tile.row)} is inside prop ${spawn.insideProp} ` +
          `— no walkable tile on ${this.node.id} is clear of one, so [E] here reads the prop`;
    /*
     * ⚠ INDOORS THE LANDING IS THE BLUEPRINT'S, NOT `chooseSpawnTile`'S, and that is exactly why
     * `InteriorBlueprint.arrival` exists. `chooseSpawnTile` spirals out from the centre of the fixed
     * 64×64 tile lattice (`tileGridSize`) — on a room thirteen cells wide every one of those tiles is
     * outside the room, so it walks the whole lattice, finds the first cell the room's grid does not
     * mark solid (out of bounds reads as BLOCKED, so it finds nothing at all inside the plan) and
     * lands the player in a far corner of a room that has none. It also cannot find a doorway.
     */
    const landing = this.interior === null ? spawn.tile : cellTile(this.interior.arrival);

    const standing: MovementState | undefined = this.movement;
    const sameNode = this.viewNodeId === this.viewId();
    if (standing !== undefined && sameNode && this.canEnter(standing.tile)) {
      // Same node, still a legal tile: keep the position and the foray progress. `placeAt` drops any
      // step in flight, which is right — the tween belongs to a frame loop that has been torn down.
      this.movement = placeAt(standing, standing.tile, standing.facing);
    } else {
      /*
       * THE PLAYER IS RESPAWNED; THE FORAY ODOMETER IS NOT RESET, and it used to be.
       *
       * `this.stepsSinceTick = 0` stood here and fired whenever the node changed — i.e. on every
       * travel. Walking 47 of the 48 steps a foray tick is charged for and then travelling gave the
       * walk back for free, so a player who hopped nodes could forage a region indefinitely and
       * never pay a foray tick; travel was a way of buying time rather than spending it. Hank:
       * *"I see no reason why stepsSinceTick should reset after a fast travel."* There is none —
       * the counter measures WALKING, not a place, and the tick it charges is one price for one
       * excursion however many rooms that excursion crossed. Removing it makes travel dearer, not
       * cheaper: the progress is kept, so the next foray tick arrives sooner.
       *
       * Nothing else needed it. `buildNodeView` has two callers — {@link create} and
       * {@link travelTo} — and on a fresh scene the counter is already whatever the save carries
       * (see {@link init}), which is 0 for a new game and the banked walk for a reload.
       */
      this.movement = standing !== undefined ? placeAt(standing, landing) : createMovement(landing);
    }
    this.viewNodeId = this.viewId();

    this.lastNote = this.viewNote();
    this.hudDirty = true;
  }

  /* ── interiors (core/interiors.ts) ─────────────────────────────────────── */

  /**
   * The building the player is inside, or null. A read for the other lanes and for the tests; the
   * scene's own copy is {@link interior} and nothing outside may set it.
   */
  currentInterior(): InteriorBlueprint | null {
    return this.interior;
  }

  /** Which geometry is on screen — the room's id indoors, the node's id outdoors. */
  private viewId(): string {
    return this.interior?.id ?? this.node.id;
  }

  /**
   * The grid every walkability question is asked of.
   *
   * ⚠ ONE PLACE, not a branch at each call site. `canEnter`, the collision overlay and the camera
   * all read through here, so a room and a town can never be half-swapped: the same defect shape as
   * `liveNode`'s two fallbacks, which printed one population and spawned another.
   */
  private activeGrid(): CollisionGrid {
    return this.interiorGrid ?? this.collision.grid;
  }

  /**
   * The HUD's provenance line for whichever view is up.
   *
   * IT SAYS WHICH OF THE TWO IS ON SCREEN, because that is the whole job of a provenance line and
   * the map's has always done it (`MapView.status.note` prints either the path or `PLACEHOLDER map
   * — … not built`). A room that keeps announcing `FOOTPRINT … NOT painted art` after its painting
   * lands is a readout that has quietly become a lie, and the readout is the only thing on screen
   * that can tell the two apart. Identifiers and integers (G7).
   */
  private viewNote(): string {
    const bp = this.interior;
    if (bp === null) return `${this.mapView.status.note} · ${this.collision.note}`;
    const size = planSize(bp.plan);
    const plan = `${size.cols}×${size.rows} plan cells from data/interiors/${bp.id}.json`;
    const painted = paintedInteriorKey(this, bp.id);
    return painted === null
      ? `FOOTPRINT interior ${bp.id} — ${plan}; NOT painted art`
      : `interior ${bp.id} — ${interiorAssetPath(bp.id)} over ${plan}`;
  }

  /**
   * Bring {@link interior} and {@link interiorGrid} into line with what the save says.
   *
   * REFUSES, LOUDLY, RATHER THAN LEAVING THE PLAYER IN A ROOM THAT DOES NOT EXIST. Two ways a save
   * can name one: a build that no longer ships that blueprint, and a save whose `currentNode` was
   * moved without its `interiorId` (which nothing does today — travel is refused indoors — but a
   * hand-edited save is a supported input, `core/save.ts` says so). Either way the player is put
   * back outdoors and the save is corrected, because the alternative is a black room with no door.
   */
  private adoptInterior(id: string | null): void {
    const found = id === null ? null : interiorById(id);
    const problem =
      id === null || found === null
        ? id === null
          ? null
          : `save.interiorId "${id}" is not a shipped interior`
        : found.parentNode !== this.save.currentNode
          ? `save.interiorId "${id}" belongs to "${found.parentNode}", not "${this.save.currentNode}"`
          : null;
    if (problem !== null) {
      console.warn(`[overworld] ${problem} — the player is placed outdoors`);
      this.save = withoutInteriorId(this.save);
    }
    this.interior = problem === null ? found : null;
    this.interiorGrid =
      this.interior === null
        ? null
        : // The engine's own parser, on the blueprint's own plan, at the balance cell size (G11).
          gridFromAscii(this.interior.id, this.interior.plan, this.balance.map.collisionCellPx);
  }

  /**
   * Show the room or the town: one picture is up at a time, and the camera is bounded to it.
   *
   * A ROOM HAS TWO WAYS OF BEING DRAWN and the choice is made per room, exactly as it is per node —
   * `MapView` draws `r1.png` if the art lane has shipped it and a stand-in if it has not, and this
   * asks `paintedInteriorKey` the same question about `assets/final/interiors/<id>.png`. Today the
   * answer is null for every shipped room and the footprint is what is on screen; the branch above
   * it is what stops being dead the day a painting lands, with no further change here.
   *
   * G1 IS NOT BENT BY THE PAINTED BRANCH. It is ONE image at the room's own size — no tileset, no
   * slicing, no atlas — sized to the same rectangle `drawInteriorFootprint` fills, `grid.cols` by
   * `grid.rows` cells of `worldCellPx` each, with its top-left at world (0,0). It is sized rather
   * than left at its natural pixels for the reason the map is (`MapView`'s constructor): the picture
   * has to line up with the geometry the player is walking, and the geometry is the ASCII plan.
   */
  private syncViewMode(): void {
    const grid = this.interiorGrid;
    const bp = this.interior;
    this.mapView.setVisible(grid === null);

    const painted = grid === null || bp === null ? null : paintedInteriorKey(this, bp.id);
    if (grid !== null && painted !== null) {
      const cell = worldCellPx(grid, this.balance);
      this.interiorArt ??= this.add.image(0, 0, painted).setOrigin(0, 0).setDepth(INTERIOR_DEPTH);
      this.interiorArt.setTexture(painted).setDisplaySize(grid.cols * cell, grid.rows * cell).setVisible(true);
      this.interiorView.setVisible(false);
      this.interiorView.clear();
    } else {
      this.interiorArt?.setVisible(false);
      this.interiorView.setVisible(grid !== null);
      if (grid !== null) drawInteriorFootprint(this.interiorView, grid, this.balance);
      else this.interiorView.clear();
    }
    this.applyCameraBounds();
  }

  /**
   * Bound the camera to whatever is on screen.
   *
   * `Math.max` against the screen because a room is SMALLER than the 480×320 viewport (build-doc
   * §7.6) and a camera bounded tighter than its own viewport has nothing to clamp to.
   */
  private applyCameraBounds(): void {
    const grid = this.interiorGrid;
    if (grid === null) {
      this.cameras.main.setBounds(0, 0, this.mapView.worldWidth, this.mapView.worldHeight);
      return;
    }
    const cell = worldCellPx(grid, this.balance);
    this.cameras.main.setBounds(
      0,
      0,
      Math.max(grid.cols * cell, this.scale.width),
      Math.max(grid.rows * cell, this.scale.height),
    );
  }

  /**
   * The tile in the PARENT TOWN a building's door stands on.
   *
   * `InteriorDoor.x/y` are map-NATIVE pixels — the same space `PropPlacement.x/y` uses (build-doc
   * §7.6: the painted town is 1024² native, rendered at `mapRenderScale`). Both conversions are read
   * from `balance.map` and neither assumes the other (G11): a world pixel is a native pixel times
   * `mapRenderScale`, and a tile is `tileStepPx` world pixels.
   */
  doorTileOf(bp: InteriorBlueprint): { col: number; row: number } {
    const world = { x: bp.door.x * this.balance.map.mapRenderScale, y: bp.door.y * this.balance.map.mapRenderScale };
    const step = this.balance.map.tileStepPx;
    return { col: Math.floor(world.x / step), row: Math.floor(world.y / step) };
  }

  /**
   * The HUD's doorway readout: where the way out is when indoors, where every way in is when not.
   *
   * The town maps carry no painted door yet and the collision mask cannot mark one — a threshold is
   * walkable floor, indistinguishable from the grass beside it — so without this line a shipped
   * building is a tile the player has no way to find. It is a readout, not a verdict (G7): a name
   * and two integers.
   */
  private doorLines(): string[] {
    const bp = this.interior;
    if (bp !== null) {
      const size = planSize(bp.plan);
      const out = planDoorCell(bp);
      return [
        `inside ${bp.name} (${bp.id}) · ${size.cols}×${size.rows} cells` +
          (out === null ? "" : ` · out at ${out.col},${out.row}`),
      ];
    }
    return interiorsOf(this.node.id).map((each) => {
      const at = this.doorTileOf(each);
      return `door ${each.id} at tile ${at.col},${at.row}`;
    });
  }

  /** The building whose town door stands on this tile, or null. Outdoors only. */
  private doorwayAt(tile: { col: number; row: number }): InteriorBlueprint | null {
    for (const bp of interiorsOf(this.node.id)) {
      const at = this.doorTileOf(bp);
      if (at.col === tile.col && at.row === tile.row) return bp;
    }
    return null;
  }

  /**
   * Go inside. FREE — no tick, no action-log entry, no clock event. See this file's header.
   *
   * The player lands on {@link InteriorBlueprint.arrival}, facing the way they walked in. Both are
   * read off the plan rather than off `door.facing`: `core/interiors.ts` refuses any blueprint whose
   * arrival is not exactly one orthogonal step from the `D` cell, so the step from the doorway to
   * the arrival IS the direction of travel, and deriving it that way cannot disagree with the
   * picture the art lane is drawing.
   */
  private enterInterior(bp: InteriorBlueprint): void {
    const door = planDoorCell(bp);
    if (door === null) {
      // core/interiors.ts refuses a plan without exactly one `D` at import, so this is unreachable
      // through the shipped data — and a silent no-op would be a door that does nothing.
      this.flashBanner(`${bp.id} — the plan draws no doorway`);
      return;
    }
    const arrival = cellTile(bp.arrival);
    this.interior = bp;
    this.interiorGrid = gridFromAscii(bp.id, bp.plan, this.balance.map.collisionCellPx);
    this.save = { ...this.save, interiorId: bp.id };
    this.movement = placeAt(this.movement, arrival, stepFacing(door, bp.arrival) ?? this.movement.facing);
    this.viewNodeId = this.viewId();
    this.spawnProblem = this.canEnter(arrival)
      ? null
      : `arrival ${arrival.col},${arrival.row} of ${bp.id} is not walkable in its own plan`;
    this.syncViewMode();
    this.syncPlayerSprite();
    this.lastNote = this.viewNote();
    this.hudDirty = true;
    this.refreshHud();
    this.hooks.onSaveChanged?.(this.save, this);
    this.flashBanner(`entered ${bp.name} (${bp.id})`);
  }

  /**
   * Come back out — onto THE DOOR THEY USED, never the town's spawn tile.
   *
   * `chooseSpawnTile` would put them in the middle of the map: it is the answer to "where does a
   * player who has no position stand", and a player leaving a building has one. The building's own
   * `door.x/y` is that position.
   *
   * ⚠ IF THAT TILE IS BLOCKED BY THE TOWN'S MASK THE PLAYER IS STUCK IN GEOMETRY, so it is SAID —
   * on the HUD, persistently, through the same `spawnProblem` line a broken mask reports through.
   * The door positions in `data/interiors/*.json` are provisional by their own admission
   * (`door._note`), so this is the line that will find a re-pin that never happened.
   */
  private leaveInterior(): void {
    const bp = this.interior;
    if (bp === null) return;
    const door = planDoorCell(bp);
    const tile = this.doorTileOf(bp);
    const facing = door === null ? this.movement.facing : (stepFacing(bp.arrival, door) ?? this.movement.facing);
    this.interior = null;
    this.interiorGrid = null;
    this.save = withoutInteriorId(this.save);
    this.movement = placeAt(this.movement, tile, facing);
    this.viewNodeId = this.viewId();
    this.spawnProblem = this.canEnter(tile)
      ? null
      : `the doorway of ${bp.id} lands on ${this.node.id} tile ${tile.col},${tile.row}, which the ` +
        `collision mask blocks — the player is standing in geometry`;
    this.syncViewMode();
    this.syncPlayerSprite();
    this.lastNote = this.viewNote();
    this.hudDirty = true;
    this.refreshHud();
    this.hooks.onSaveChanged?.(this.save, this);
    this.flashBanner(`left ${bp.name} → ${this.node.id} ${tile.col},${tile.row}`);
  }

  /**
   * [E] inside a building.
   *
   * The town's props are deliberately NOT consulted here. `propAt` measures WORLD distance, and a
   * room is drawn at world origin — so a prop placed near the top-left of a town would answer a
   * press made inside a shop on the other side of it. What is in reach indoors is the blueprint's
   * anchors, and nothing else.
   */
  private interactIndoors(bp: InteriorBlueprint): void {
    const tile = this.movement.tile;
    const anchor = bp.anchors.find((a) => a.col === tile.col && a.row === tile.row);
    if (!anchor) {
      this.flashBanner(`${bp.name} — nothing here`);
      return;
    }
    const entryId = interiorEntryId(bp, anchor);
    if (entryId === null) {
      this.flashBanner(`${bp.id}.${anchor.id} — nothing to say`);
      return;
    }
    this.playEntry(entryId, `${bp.name} · ${anchor.id}`);
  }

  /* ── input ────────────────────────────────────────────────────────────── */

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    this.cursors = keyboard.createCursorKeys();
    const codes = Phaser.Input.Keyboard.KeyCodes;
    this.dirKeys = [
      { dir: "up", keys: [keyboard.addKey(codes.W)] },
      { dir: "down", keys: [keyboard.addKey(codes.S)] },
      { dir: "left", keys: [keyboard.addKey(codes.A)] },
      { dir: "right", keys: [keyboard.addKey(codes.D)] },
    ];
    this.overlayKey = keyboard.addKey(codes.C);
    this.travelKeys = [codes.ONE, codes.TWO, codes.THREE, codes.FOUR, codes.FIVE, codes.SIX].map(
      (code) => keyboard.addKey(code),
    );
    // L8 prices three actions and the shell only ever spent two of them, so `clock.innTicks` was a
    // tunable nothing could reach and no player action could straddle a year boundary. [R] rests.
    this.innKey = keyboard.addKey(codes.R);
    // [G] challenges the leader standing in this town. The act ladder's only numeric input is
    // badges and `winGym` had no caller in the whole repo, so every act above the prologue was
    // unreachable and the never-cut slice stopped at Route 1. See {@link challengeGym}.
    this.gymKey = keyboard.addKey(codes.G);
    // [E] READS. It is the key the whole C7 layer hangs off: an NPC line, a quest offer, a turn-in,
    // an antler stone. Before it existed, `data/dialogue.json` — 499 lines, 211 entries, 62
    // speakers — had no route to a player at all.
    this.talkKey = keyboard.addKey(codes.E);
    // [X] RELEASES. bible §9's *Restock the Shallows* is the "release verb intro" and there was no
    // release verb: `applyRelease` and the `{t:"release"}` replay arm shipped with no producer
    // anywhere in `game/`. See `game/quests.ts` `releaseIntoNode`.
    this.releaseKey = keyboard.addKey(codes.X);
  }

  private pressedDirections(): Direction[] {
    const out: Direction[] = [];
    const c = this.cursors;
    if (c?.up.isDown) out.push("up");
    if (c?.down.isDown) out.push("down");
    if (c?.left.isDown) out.push("left");
    if (c?.right.isDown) out.push("right");
    for (const entry of this.dirKeys) {
      if (entry.keys.some((k) => k.isDown)) out.push(entry.dir);
    }
    return out;
  }

  /* ── frame ────────────────────────────────────────────────────────────── */

  override update(_time: number, delta: number): void {
    /*
     * ⚠ FIRST, AND THE FRAME IS SPENT ON IT. A beat asked for while the previous box was handing
     * back could not be launched then ({@link handingBack} says why), so it is opened here — one
     * frame later, with the closing box's own `stop` already applied. Nothing else happens in this
     * frame: no key is read, no step is taken and no encounter is rolled, so the single un-paused
     * frame between two beats of a chain cannot be walked or fought through.
     */
    const pending = this.pendingEntry;
    if (pending !== null) {
      this.pendingEntry = null;
      this.openBox(pending);
      return;
    }
    if (this.overlayKey && Phaser.Input.Keyboard.JustDown(this.overlayKey)) this.toggleOverlay();
    if (this.innKey && Phaser.Input.Keyboard.JustDown(this.innKey)) this.restAtInn();
    if (this.gymKey && Phaser.Input.Keyboard.JustDown(this.gymKey)) this.challengeGym();
    if (this.talkKey && Phaser.Input.Keyboard.JustDown(this.talkKey)) this.interact();
    if (this.releaseKey && Phaser.Input.Keyboard.JustDown(this.releaseKey)) this.releaseHere();

    this.travelKeys.forEach((key, i) => {
      if (Phaser.Input.Keyboard.JustDown(key)) {
        const target = this.node.adjacency[i];
        if (target) void this.travelTo(target);
      }
    });

    // Tracked BEFORE the travel guard, so keys held across a node transition are not mistaken for
    // fresh presses on the first frame in the new node.
    const pressed = this.pressedDirections();
    const fresh = newlyPressed(pressed, this.heldLastFrame);
    this.heldLastFrame = new Set<Direction>(pressed);

    if (this.travelling) return;

    // `chooseDirection`, not `resolveInput`: the choice has to know what is in front of the player,
    // or a direction held into a wall wins the tie every frame and locks out a direction with an
    // open path. See game/movement.ts.
    this.movement = queueInput(
      this.movement,
      chooseDirection(pressed, this.movement, (tile) => this.canEnter(tile), fresh),
    );
    const result = updateMovement(this.movement, delta, (tile) => this.canEnter(tile), this.movementCfg);
    this.movement = result.state;

    for (const event of result.events) {
      if (event.t === "stepCompleted") this.onStepCompleted();
    }

    this.syncPlayerSprite();
    // The HUD re-derives the whole encounter table, so it refreshes when something CHANGED rather
    // than every frame — build-doc §12 asks for 60fps at 480×320, and a per-frame re-derivation of
    // the node's weights is the one avoidable allocation on the walkability path.
    if (result.events.length > 0) this.hudDirty = true;
    if (this.hudDirty) {
      this.hudDirty = false;
      this.refreshHud();
    }
  }

  /**
   * The one walkability question, asked of the packed bitfield (build-doc §7.6) — the node's mask
   * outdoors, the room's parsed plan indoors ({@link activeGrid}).
   */
  canEnter(tile: { col: number; row: number }): boolean {
    return tileWalkable(this.activeGrid(), tile.col, tile.row, this.balance);
  }

  private syncPlayerSprite(): void {
    const pos = spriteWorldPosition(this.movement, this.movementCfg);
    this.player.setPosition(pos.x, pos.y);
  }

  private toggleOverlay(): void {
    this.overlayVisible = !this.overlayVisible;
    this.overlay.setVisible(this.overlayVisible);
    this.hudDirty = true;
    if (this.overlayVisible) drawCollisionOverlay(this.overlay, this.activeGrid(), this.balance);
  }

  /* ── the foray ────────────────────────────────────────────────────────── */

  /**
   * A completed tile step IS a foray step (build-doc §4): it rolls an encounter at
   * `balance.encounter.encounterChancePerStep`, and every `stepsPerForay` of them charges the one
   * tick §3 L8 prices a foray at.
   */
  private onStepCompleted(): void {
    /*
     * ⚠ A STEP TAKEN INDOORS IS NOT A FORAY STEP. This one clause is BOTH place guards, deliberately
     * placed above everything rather than repeated inside each:
     *
     *   • the encounter roll below drew from the encounter stream on EVERY completed step, with no
     *     place check at all, so a lap of an inn's common room met wild animals;
     *   • the odometer (`stepsSinceTick += 1`), the save write of it, and the foray charge
     *     (`chargingForay`) all sit further down and would otherwise price that lap.
     *
     * NOT SPELLED AS A THIRD TERM ON `chargingForay`. That condition already carries a state guard
     * (`&& !this.yearTurnRunning`, which stops a charge vanishing into a `spendTicks` that refuses
     * silently), and extending it would suppress only the CHARGE — leaving the roll, the increment
     * and the save write running, so indoors would still meet creatures, still bank steps, and pay
     * the tick on the first step back outside. The place question is asked once, above all four.
     *
     * ⚠ AND THE ODOMETER IS NOT ADVANCED EITHER, which is a separate decision from not charging.
     * A foray is an excursion that can meet something: build-doc §4 defines a foray step as the step
     * that "rolls encounters", and §3 L8 prices exactly that. Suppressing the roll while still
     * banking the step would sell the player a hunt they cannot take — a tick charged for walking to
     * a shop counter, where the same tick outdoors buys a chance of an animal. Nothing is refunded
     * by this: the banked walk is kept, exactly as it is across a travel (Hank: *"I see no reason
     * why stepsSinceTick should reset after a fast travel"*), so a player who ducks inside at 47 of
     * 48 steps comes back out still owing the 48th. Free, not reset.
     */
    if (this.interior !== null) {
      this.leaveThroughDoorway();
      return;
    }

    /*
     * NO CALENDAR GUARD. A refusal used to stand here too — the encounter roll was skipped once
     * `isOver` was true, "so nothing is drawn from the encounter stream in a year the game does not
     * have". Every year is a year the game has.
     */
    const encounter = rollForayStep(this.forayContext(), this.streamFor(ENCOUNTER_STREAM));
    if (encounter) {
      this.encountersMet += 1;
      this.lastEncounter = encounter;
      this.hudDirty = true;
      /*
       * THE SIGN CARD. bible §9's *First Signs* asks the player to "walk Meadow Reach and bring me
       * three. Any three." — and a sign card is what you get "when you read a track, a scrape, a
       * fresh cast of droppings", i.e. from the forage itself. Meeting a line at a node records it;
       * `game/quests.ts` counts the DISTINCT ones. Recorded before the hand-off below, because a
       * hand-off launches a scene and pauses this one.
       */
      this.save = recordLineMet(this.save, encounter.nodeId, encounter.lineId);
      this.flashBanner(
        `${encounter.lineId} ${encounter.age} L${encounter.level} — count ${this.countOf(encounter.lineId)}`,
      );
    }

    /*
     * THE TICK IS SPENT BEFORE THE HAND-OFF, and the order matters. `spendTicks` can cross a season
     * boundary or end the year, and the year turn launches a scene and pauses this one — so handing
     * the encounter over FIRST would launch two scenes for one step and pause the overworld twice.
     * The encounter itself was already rolled against the season the step was taken in, above, so
     * nothing about WHICH animal was met depends on this ordering.
     */
    this.stepsSinceTick += 1;
    /*
     * ⚠ THE ODOMETER IS ZEROED IF AND ONLY IF THE TICK IS REALLY CHARGED — the foray side of the
     * identity {@link handOffToBattle} states for the battle side ("a fight launches if and only if
     * its tick was charged"). {@link spendTicks} RETURNS WITHOUT CHARGING while `yearTurnRunning`,
     * and it does so silently, which is safe only for a caller that has already decided there is
     * nothing to do. This caller had not: it zeroed the odometer on the line above and wrote the
     * zero into the save on the line below, so the charge vanished and every step of the excursion
     * that earned it vanished with it — a foray the player walked and was not billed for, and no
     * `onSaveChanged` for the reset either, because the notification sits in the other branch.
     *
     * ⚠ IT IS REACHABLE, and the route is a same-FRAME one rather than a same-key one. "The scene is
     * paused, so this cannot run" is true of LATER frames and false of this one, for a reason worth
     * writing down: `ScenePlugin.pause` does not pause anything — it is
     * `this.manager.queueOp('pause', …)` (node_modules/phaser/src/scene/ScenePlugin.js), and the
     * queue is drained by `SceneManager.update`'s `processQueue()` at the top of the NEXT frame. So
     * the pause {@link beginYearTurn} asks for is still pending while the rest of this `update()`
     * runs, and {@link update} handles the inn and gym keys BEFORE it drains the movement events.
     * The sequence: walk with the odometer one step short of `encounter.stepsPerForay`, press the
     * inn key on the frame a tile step lands, and let that inn fill the meter — `restAtInn` →
     * `spendTicks("inn")` → `beginYearTurn` raises the flag, and then the same `update()` walks the
     * completed step into here. `game/movement.ts` `update` resolves up to `MAX_STEPS_PER_UPDATE`
     * steps from one long frame, which is a second route to the same line. Every OTHER consumer of
     * a handed-over screen is already refused — `restAtInn`, `challengeGym`, `interact`,
     * `releaseHere` and `travelTo` all open on `isHandedOver()`, and `handOffToBattle` carries the
     * battle half of this exact hazard — so this was the one way in.
     *
     * NOT ZEROING BANKS THE STEP rather than dropping it: `stepsSinceTick` stays at or above
     * `stepsPerForay`, so the next step the player takes on the other side of the turn charges the
     * foray that was owed. The debt is in the scene AND in the save, which is what the write below
     * is for.
     */
    const chargingForay = this.stepsSinceTick >= stepsPerForay(this.balance) && !this.yearTurnRunning;
    if (chargingForay) this.stepsSinceTick = 0;
    /*
     * …AND THE ODOMETER IS WRITTEN INTO THE SAVE ON EVERY STEP, not only when it rolls over. It is
     * save state (`SaveFile.forayStepsSinceTick`), and whoever persists the save persists whatever
     * `this.save` says at that moment — so a step that did not update it is a step the player gets
     * back for free by reloading. `spendTicks` reports the save change itself, so the notification
     * below is the OTHER 47 steps' and the two never double up.
     */
    this.save = { ...this.save, forayStepsSinceTick: this.stepsSinceTick };
    if (chargingForay) this.spendTicks("foray", { t: "foray", nodeId: this.node.id });
    else this.hooks.onSaveChanged?.(this.save, this);

    if (encounter) {
      // The hook is an override; without one the scene fights it (see OverworldHooks.onEncounter).
      if (this.hooks.onEncounter) this.hooks.onEncounter(encounter, this);
      else this.beginWildBattle(encounter);
      /*
       * …AND THE THRESHOLD WAITS. A step that met something has handed the screen over (or is about
       * to, on the next frame — `ScenePlugin.pause` is queued, not immediate), and walking the
       * player into a building underneath a fight would put two views on one screen. They are
       * standing ON the doorway; the next step onto it takes them in, and that step is charged like
       * any other, so nothing here is free.
       */
      return;
    }

    /*
     * THE DOORWAY, LAST — AFTER the roll and after the tick, on purpose.
     *
     * Checking it first and returning would make the step onto a threshold FREE, and a free step is
     * farmable: leaving a building lands the player on that very tile, so stepping off and back on
     * would cost one step's ticks instead of two, for ever, next to every door in the game. The
     * price of walking is not what a door changes.
     */
    if (!this.isHandedOver()) this.enterThroughDoorway();
  }

  /** Outdoors: the step landed on a building's door tile, so go in. */
  private enterThroughDoorway(): void {
    const doorway = this.doorwayAt(this.movement.tile);
    if (doorway !== null) this.enterInterior(doorway);
  }

  /** Indoors: the step landed on the plan's `D` cell, so come back out. */
  private leaveThroughDoorway(): void {
    const bp = this.interior;
    if (bp === null) return;
    const door = planDoorCell(bp);
    if (door === null) return;
    const tile = this.movement.tile;
    if (door.col === tile.col && door.row === tile.row) this.leaveInterior();
  }

  /* ── the hand-off to a fight (build-doc §3 L8's fourth price) ─────────────── */

  /**
   * Hand the screen to ONE fight — the only place `clock.battleTicks` is charged and the only place
   * `SCENE_KEYS.battle` is launched.
   *
   * All four fights come through here — the wild encounter, the gym, the rival and the finale's
   * snare — because before it there were four near-identical bodies (`battleRunning = true` →
   * `scene.launch` → `scene.pause`) and no shared step between them. The charge is one line that a
   * fifth call site cannot forget to write.
   *
   * THE PRICE IS LEVIED ONCE, AT LAUNCH, and never per turn taken inside the fight (a move is
   * `{t:"battleAction"}` and costs nothing). So a fight that is FLED is charged and a fight that is
   * LOST is charged — both of them happened — while a fight refused before it starts (an empty
   * party, a badge already won, an act not yet reached, a rival already fought, an unregistered
   * battle scene) is not charged at all, because nothing happened.
   *
   * ⚠ A FIGHT LAUNCHES IF AND ONLY IF ITS TICK WAS CHARGED. The two refusals below are what make
   * that an identity rather than a hope, and each of them is a way the price silently went missing:
   *
   *   • {@link spendTicks} RETURNS WITHOUT CHARGING while `yearTurnRunning`, and a wild battle is
   *     launched from {@link onStepCompleted} five lines after that same function spent a foray
   *     tick — so a foray tick that ended the year would have made the encounter's half-tick free,
   *     once a year, for ever, with nothing to go red. The fight is refused HERE, above the charge:
   *     the year turn has the screen, no fight starts, and there is nothing to charge for.
   *     `beginWildBattle` refused on this condition already; `launchGymBattle` never did.
   *   • THE CHARGE ITSELF CAN FILL THE METER — `ticksPerYear - battleTicks` is a real clock
   *     position — and `spendTicks` then hands the screen to the year turn. Launching on top of
   *     that would put two scenes on screen for one keypress and pause the overworld twice. So the
   *     fight is refused, out loud, and the charge STANDS: the year really did turn, and the
   *     challenge can be made again on the other side of it. The fight is deliberately NOT held
   *     across the turn — `data` names the party as it stood BEFORE it, and build-doc §7.5 retires
   *     creatures out of that party, so a held fight would field a battler the save no longer has.
   *
   * Returns whether the fight was launched. Every refusal is SAID, on the same terms every other
   * refusal in this scene is said.
   */
  private handOffToBattle(data: BattleSceneData, action: GameAction, what: string): boolean {
    if (this.battleRunning || this.yearTurnRunning) {
      this.flashBanner(`${what} — the screen is already handed over`);
      return false;
    }
    /*
     * NOTHING STANDING IS REFUSED HERE, NOT DISCOVERED INSIDE THE REDUCER.
     *
     * ⚠ THIS IS NO LONGER THE PLAYER SIDE'S ONLY GUARD, and the note that said so is gone: all four
     * `*BattleProblem` launchers now count STANDING creatures rather than party MEMBERS, so a party
     * made only of fainted creatures is refused before it ever reaches here. What is left is what
     * only this line can do:
     *
     *   • THE ENEMY SIDE. `core/battle.ts` `startBattle` refuses an unfieldable party on EITHER
     *     side, and no `*BattleProblem` can see the opponent — it is built by `build*Battle`, out of
     *     content and the live node, after every one of those checks has already run.
     *   • THE ACTUAL `BattleInput`. This is asked of `data.input`, the specs the reducer is really
     *     handed, and not of the save they were derived from. It is therefore the LAST point before
     *     the reducer, and the only one where the question and the answer cannot have drifted apart.
     *
     * `core/battle.ts` `startBattle` throws "every battler in the player party is already fainted —
     * there is nothing to field." A throw is a crash where a refusal belongs; below the charge it
     * would be a crash with the tick spent and the overworld already paused.
     */
    const unfieldable = this.unfieldableProblem(data.input);
    if (unfieldable) {
      this.flashBanner(`${what} — ${unfieldable}`);
      return false;
    }

    this.spendTicks("battle", action);
    if (this.yearTurnRunning) {
      this.flashBanner(`${what} — the year turned first`);
      return false;
    }

    this.battleRunning = true;
    this.scene.launch(SCENE_KEYS.battle, data);
    this.scene.pause();
    return true;
  }

  /**
   * Why `core/battle.ts` could not field this fight, or null — the reducer's own `standing` test,
   * asked one step earlier so the answer is a sentence on the banner and not an exception.
   *
   * A party may CARRY fainted members; it may not be made only of them.
   *
   * THE PREDICATE IS `game/wild-battle.ts` `isStanding`, IMPORTED, on BOTH sides. It used to be
   * re-spelled here as `curHp === undefined || curHp > 0` — the reducer's condition written out a
   * second time, in a second file, where it can drift from the one `startBattle` actually applies.
   * A drift between two spellings of a precondition is only found by the throw the precondition
   * exists to prevent, so there is one spelling and everything asks it.
   */
  private unfieldableProblem(input: BattleSceneData["input"]): string | null {
    const anyStanding = (party: BattleSceneData["input"]["playerParty"]): boolean => party.some(isStanding);
    if (!anyStanding(input.playerParty)) return "nothing in the party is standing";
    if (!anyStanding(input.enemyParty)) return "nothing is standing on the other side";
    return null;
  }

  /* ── the wild battle (build-doc §1 beat 1's only route) ───────────────────── */

  /**
   * Hand the encounter to `core/battle.ts` through C3's scene, then apply what came back.
   *
   * THIS SCENE STILL KNOWS NO RULES. It builds a `BattleInput` and a `BattleContext` in
   * `game/wild-battle.ts` (engine-free, testable headlessly), launches the renderer, and on the way
   * back calls `applyWildBattleOutcome`, whose population write is `core/ecosim.ts` `applyCatch` —
   * the same function `core/save.ts`'s replay reaches. There is no damage, catch-probability or
   * population arithmetic in this file, and adding one here would be the defect L11 exists to stop.
   *
   * Every refusal is SAID. A battle that cannot start (an empty party, an unregistered scene) used
   * to be indistinguishable from an encounter that was never routed anywhere at all.
   */
  beginWildBattle(encounter: Encounter): void {
    if (this.battleRunning || this.yearTurnRunning) return;

    const problem = wildBattleProblem(this.save);
    if (problem) {
      this.flashBanner(`${encounter.lineId} met — no battle: ${problem}`);
      return;
    }
    if (!sceneRegistered(this, SCENE_KEYS.battle)) {
      this.flashBanner(`${encounter.lineId} met — "${SCENE_KEYS.battle}" is not registered`);
      return;
    }

    let build: ReturnType<typeof buildWildBattle>;
    try {
      build = buildWildBattle({
        content: this.content,
        save: this.save,
        encounter,
        node: this.liveNode(encounter.nodeId),
      });
    } catch (err) {
      this.flashBanner(`battle refused: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    const data: BattleSceneData = {
      ctx: build.ctx,
      input: build.input,
      // build-doc §8.1 — the seeded battle stream, positioned where the save left it. Not a fresh
      // one per fight: a new stream at draw zero would make every battle of a run replay the same
      // numbers, and `streamFor` fails loudly rather than inventing a tag that is not declared.
      rng: this.streamFor(BATTLE_STREAM),
      projectedRetirementYears: this.projectedRetirementYears(),
      onFinished: (result) => {
        this.finishWildBattle(encounter, build.ctx, result);
      },
    };

    this.handOffToBattle(data, { t: "battle", kind: "wild", nodeId: encounter.nodeId }, `${encounter.lineId} met`);
  }

  /** `OwnedCreature.projectedRetirementYear` per uid — core/lifecycle.ts's number, not a new one. */
  private projectedRetirementYears(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const creature of this.save.party) out[creature.uid] = creature.projectedRetirementYear;
    return out;
  }

  /**
   * Hard Req 2, on the live path: the count moves, the tape records it, and the HUD says both
   * numbers. G7 — the banner is identifiers and arithmetic, and nothing else.
   */
  private finishWildBattle(
    encounter: Encounter,
    ctx: BattleSceneData["ctx"],
    result: Parameters<NonNullable<BattleSceneData["onFinished"]>>[0],
  ): void {
    this.battleRunning = false;
    this.scene.stop(SCENE_KEYS.battle);
    this.scene.resume();
    this.hudDirty = true;
    /*
     * THE FIGHT, AND THEN ITS PRIZE — `applyBattleResult` (game/wild-battle.ts) BEFORE the catch
     * writer below. It is the one writer of `curHp`, `level`, `xp` and the bag off a finished
     * fight, and it had NO production caller: an audit drove this very scene through real
     * `core/battle.ts` fights and found a snare spent in the reducer still sitting in the bag
     * afterwards, and four battles that left no `battleAftermath` entry on the tape at all. The
     * order is safe either way — the aftermath names only the battlers that were FIELDED, and a
     * creature caught in this fight is not one of them — but written this way the tape reads as
     * the fight and then its prize.
     */
    this.save = applyBattleResult(this.save, result.state);

    const applied = applyWildBattleOutcome({
      save: this.save,
      content: this.content,
      state: result.state,
      ctx,
      caught: result.caught,
    });
    if (!applied) {
      this.flashBanner(`${encounter.lineId} — ${result.state.outcome ?? "unresolved"}`);
    } else {
      if (applied.problem !== null) {
        this.flashBanner(`catch problem: ${applied.problem}`);
      }
      this.save = applied.save;
      // A catch can close a quest — *Ferryman's Wager* is an Elder in the party and *Silk Shortage*
      // is three adults off Bowerdeep Wilds — so the tracker is asked here, where the party moved.
      this.syncQuests();
      this.hooks.onSaveChanged?.(this.save, this);
      this.refreshHud();
      this.flashBanner(
        `caught ${encounter.lineId} at ${encounter.nodeId} — ${applied.before} → ${applied.after}`,
      );
    }

    /*
     * ⚠ ON THE WAY OUT, AND ON BOTH ARMS. The `!applied` arm used to `return` here, and it is the
     * arm every fight the player LOST takes — i.e. every fight a blackout can follow. A snare can
     * also hold on the last turn of a fight the party did not survive, so the caught arm needs it
     * too: a caught creature does not put the rest of the party back on its feet. There is no beat
     * of this launcher's to be the continuation of — a wild fight says nothing when it ends.
     */
    this.recoverFromBlackout();
  }

  /* ── C7: the corpus, played (build-doc §15 C7) ───────────────────────────── */

  /**
   * The context every dialogue lookup on this screen resolves against.
   *
   * `game/dialogue-runner.ts` builds it from the save through the two clocks' own authorities —
   * `core/acts.ts` for the act, `core/clock.ts` for the season — and through `liveNodeOf` for the
   * populations, so a population clause in a line reads the same integer the HUD prints.
   */
  dialogueCtx(): ReturnType<typeof dialogueContext> {
    return dialogueContext(this.save, this.content);
  }

  /** The prop the player is standing at, or null. Radii are `props[]`'s, never the collision grid. */
  propUnderPlayer(): ReturnType<typeof propAt> {
    return propAt(this.node, spriteWorldPosition(this.movement, this.movementCfg), this.balance);
  }

  /**
   * [E] — READ WHAT IS HERE.
   *
   * A prop wins over a person: the player walked to the antler stone on purpose, and a room-wide
   * greeting answering a deliberate approach to a standing stone is the wrong answer to the
   * question they asked. Every refusal is SAID, on the same terms `challengeGym` refuses — a silent
   * no-op here is indistinguishable from a key that is not bound.
   */
  interact(): void {
    if (this.isHandedOver() || this.travelling) return;
    // Turn-ins come due against the save, not against a moment — so the flags are brought up to
    // date BEFORE the lookup, or the giver's `done` entry is not eligible on the press that earned
    // it and the player has to walk away and come back.
    this.syncQuests();

    // Indoors the room's anchors are what is in reach, and the town's props are not — see
    // {@link interactIndoors} for why that is a correctness point and not a preference.
    const inside = this.interior;
    if (inside !== null) {
      this.interactIndoors(inside);
      return;
    }

    const prop = this.propUnderPlayer();
    if (prop) {
      const entry = this.tryDialogue(() => propDialogueFor(DIALOGUE, prop.id, this.node.id, this.dialogueCtx()));
      if (entry) {
        this.playEntry(entry.id, propLabel(prop));
        return;
      }
      this.flashBanner(`${propLabel(prop)} — nothing more to read`);
      return;
    }

    const talk = this.tryDialogue(() =>
      talkEntryFor(DIALOGUE, this.node.id, this.dialogueCtx(), this.spokenHere),
    );
    if (talk) {
      // Remembered so the NEXT press gets the next thing the room has to say. See `talkEntryFor`:
      // without this, one permanently-eligible high-priority line starves every chain step under it.
      this.spokenHere.add(talk.id);
      this.playEntry(talk.id, talk.speaker);
      return;
    }
    this.flashBanner(`${this.node.id} — nobody has anything to say`);
  }

  /**
   * Play whatever the corpus has queued for this node without being asked — the opening beat, the
   * act arrivals, both Greaves cutscenes.
   *
   * The set of already-played entries is per scene VISIT, not per save: the corpus closes each of
   * its own cutscenes with a flag, so this only guards against a corpus edit that ships one which
   * does not, and against that the alternative is a locked game.
   */
  playPendingCutscene(then?: () => void): void {
    // An arrival beat is the TOWN's and is keyed on its node id; playing one at the player while
    // they are standing in a shop is the beat firing in the wrong room. It is not lost — every
    // autoplay entry the corpus ships closes itself with a flag, so an unplayed one is still
    // pending when they step back outside.
    //
    // `then` runs whether or not anything was queued, on {@link playBattleOutcome}'s terms: it is
    // what {@link recoverFromBlackout} is handed through {@link afterFinale}, and a blackout that
    // only happened when the corpus had a line ready would be a wiped party left standing.
    if (this.isHandedOver() || this.travelling || this.interior !== null) {
      then?.();
      return;
    }
    const entry = this.tryDialogue(() => autoplayEntryFor(DIALOGUE, this.node.id, this.dialogueCtx()));
    if (!entry || this.autoplayed.has(entry.id)) {
      then?.();
      return;
    }
    this.autoplayed.add(entry.id);
    this.playEntry(entry.id, entry.speaker, then);
  }

  /**
   * Hand an entry to the box — or, when there is no box, play it headlessly and say so.
   *
   * SAME DISCIPLINE AS THE YEAR TURN'S unregistered retirement card, and for the same reason: a
   * beat that silently does not happen is worse than a degraded one, and the flags the corpus
   * writes are the act ladder's and the quest system's inputs. The headless answer takes the FIRST
   * option of every choice, which on the opening chain CHOOSES THE PLAYER'S STARTER — so it is
   * reported on the banner and in the console rather than passed off as normal.
   */
  playEntry(entryId: string, who: string, then?: () => void): void {
    if (this.dialogueRunning) {
      // The continuation must not be dropped on the floor: a `battle-pre` that cannot open its box
      // would otherwise be a fight that never starts, silently.
      if (then) then();
      return;
    }

    if (!sceneRegistered(this, SCENE_KEYS.dialogue)) {
      let state: DialogueRunState;
      try {
        state = runHeadless(DIALOGUE, entryId);
      } catch (err) {
        this.flashBanner(`dialogue refused: ${describe(err)}`);
        return;
      }
      console.info(
        `[overworld] "${SCENE_KEYS.dialogue}" is not registered — ${entryId} played headlessly, ` +
          `${String(state.choicesTaken.length)} choice(s) answered with the first option`,
      );
      // Not inside a box, so nothing is about to tear one down behind this — see {@link handBack}.
      this.handBack(state, who, then, false);
      if (state.choicesTaken.length > 0) {
        this.flashBanner(`${entryId} played headlessly · ${state.choicesTaken.map((c) => c.text).join(" / ")}`);
      }
      return;
    }

    this.dialogueRunning = true;
    const pending: PendingEntry = { entryId, who, then, curtain: this.curtainWanted(entryId) };
    /*
     * ⚠ NOT LAUNCHED FROM INSIDE THE CLOSING BOX'S `onDone` — see {@link handingBack} for the
     * softlock that was. The latch is raised here and NOT lowered until {@link update} opens the
     * box, which is what keeps the rest of `finishDialogue` reading "a beat is up": the guard on
     * `afterDialogue` (`next && !this.dialogueRunning`) is how a cutscene chained out of
     * {@link playPendingCutscene} keeps its place in front of a queued continuation, and a latch
     * that stayed false across the gap would run both of them in the same frame.
     */
    if (this.handingBack) {
      this.pendingEntry = pending;
      return;
    }
    this.openBox(pending);
  }

  /**
   * Put a beat on screen: raise its curtain, hand it to the box, and give the box the screen.
   *
   * The tail of {@link playEntry}, split out because {@link update} opens the queued one and the
   * two must be the same act — a second spelling of "launch the box" is how one of them comes to
   * pause the overworld and the other not to.
   */
  private openBox(pending: PendingEntry): void {
    if (pending.curtain) this.raiseCurtain();
    const data: DialogueSceneData = {
      entryId: pending.entryId,
      file: DIALOGUE,
      onDone: (state) => {
        this.scene.resume();
        // `true`: this callback IS `DialogueScene.finish()`, one statement ahead of that scene's
        // own `this.scene.stop()`.
        this.handBack(state, pending.who, pending.then, true);
        // The curtain comes down when the CHAIN ends, not when this beat does: the blackout's
        // narration hands straight on to the innkeeper, and a screen that flashed the map back
        // between the two would be the black screen going out in the middle of the sentence it
        // exists to carry.
        if (!this.dialogueRunning) this.dropCurtain();
      },
    };
    this.scene.launch(SCENE_KEYS.dialogue, data);
    this.scene.pause();
  }

  /**
   * Adopt what a finished run wrote, then run whatever was chained behind it.
   *
   * ONE SPELLING FOR BOTH WAYS A BEAT CAN END — the box's `onDone` and {@link playEntry}'s headless
   * answer. They used to be two, three lines apart, and `afterDialogue` is set in both: a
   * continuation that reached one and not the other is a fight that never starts or an ending that
   * never plays, silently.
   *
   * `insideTheBox` is the one thing the two do NOT share, and it is the whole of the softlock: see
   * {@link handingBack}. The `finally` matters — `finishDialogue` runs the act ladder, the quest
   * sync and the finale check, and a throw out of any of them would otherwise leave the latch up
   * and every later beat queued for a frame that never comes.
   */
  private handBack(
    state: DialogueRunState,
    who: string,
    then: (() => void) | undefined,
    insideTheBox: boolean,
  ): void {
    this.dialogueRunning = false;
    if (then) this.afterDialogue = then;
    if (!insideTheBox) {
      this.finishDialogue(state, who);
      return;
    }
    this.handingBack = true;
    try {
      this.finishDialogue(state, who);
    } finally {
      this.handingBack = false;
    }
  }

  /**
   * Back from the box: adopt what the corpus wrote, then re-ask every question those flags feed.
   *
   * `story.opening.done` opens act 1, a quest's `done` flag closes an offer, `chain.*.complete`
   * takes an Ancient out of the sign-chain gate — so the act ladder, the event windows and the
   * quest tracker are all re-run here rather than at the next tick, where the player would be
   * standing in a region the flags say has already opened.
   */
  private finishDialogue(state: DialogueRunState, who: string): void {
    this.scene.stop(SCENE_KEYS.dialogue);
    this.save = applyRunFlags(this.save, state);
    const said = transcript(DIALOGUE, state);
    this.lastSpoken = said[said.length - 1] ?? "";
    if (state.problem !== null) this.flashBanner(state.problem);
    this.syncQuests();
    this.advanceActs();
    this.syncEvents();
    this.hudDirty = true;
    this.refreshHud();
    this.hooks.onSaveChanged?.(this.save, this);
    const wrote = Object.keys(state.flags);
    if (wrote.length > 0) this.flashBanner(`${who} · ${wrote.join(" ")}`);
    // A chain of cutscenes (the opening beat runs straight into the two tutorials) plays through
    // rather than making the player press a key nothing tells them about.
    this.playPendingCutscene();
    /*
     * THE VELLSIRE CHOICE IS A DIALOGUE THAT STARTS A FIGHT. `sanctum.vellsire.approach`'s "Set the
     * snare." writes `story.vellsire.attempt` and nothing else — the OUTCOME is a battle's, and this
     * is where that battle is opened. The stand-aside branch writes its own resolution in the same
     * `setFlags`, so it is already resolved by the time this runs and falls straight through to the
     * released epilogue that `playPendingCutscene` just queued.
     */
    this.maybeBeginFinale();
    const next = this.afterDialogue;
    if (next && !this.dialogueRunning) {
      this.afterDialogue = null;
      next();
    }
  }

  /* ── the black screen (T-29) ─────────────────────────────────────────────── */

  /**
   * Whether this beat is read against a blacked-out screen.
   *
   * ⚠ T-29 SAYS "A DIALOGUE WITH A BLACK BACKGROUND SAYING YOU PASSED OUT", AND THE BUILD DREW THE
   * ORDINARY BOX OVER THE LIVE MAP. `core/recovery.ts` names the entry and this file draws it; the
   * note that used to stand at {@link recoverFromBlackout} step 4 — that a `narration` speaker is a
   * single space, "which is what makes it read as a black screen" — was a claim about the NAME
   * PLATE, and an empty name plate over a sunlit town with the debug HUD on top of it is not a
   * black screen. Traced on a real wipe: the map, the props and sixteen lines of diagnostics were
   * all still on screen behind the narration.
   *
   * The identity is the ENTRY, not the speaker: `narration` is a general-purpose voice the corpus
   * uses elsewhere, and blacking the screen out for all of it would take the map away from lines
   * that are about the map.
   */
  private curtainWanted(entryId: string): boolean {
    return entryId === BLACKOUT_ENTRY_ID;
  }

  /**
   * Black out the whole virtual screen, above everything this scene draws including the HUD.
   *
   * Screen space, not world space — `setScrollFactor(0)`, the same as the HUD and the banner — so
   * it does not slide off with the camera. The box is a SEPARATE scene launched on top of this one,
   * so it draws over the curtain whatever depth this is given.
   */
  private raiseCurtain(): void {
    if (this.curtain !== null) return;
    this.curtain = this.add
      .rectangle(0, 0, this.balance.map.virtualWidth, this.balance.map.virtualHeight, roleColor("void"))
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(CURTAIN_DEPTH);
  }

  /** Take it down. Safe to ask when there is none — every beat's hand-back does. */
  private dropCurtain(): void {
    this.curtain?.destroy();
    this.curtain = null;
  }

  /**
   * Ask the corpus a question and answer `undefined` rather than crash the overworld.
   *
   * `conditionHolds` fails LOUD on a context off either clock — deliberately, because an act clause
   * quietly evaluating false is how the finale stops firing with nothing going red — and
   * `DIALOGUE` itself throws at load on a malformed corpus. Neither is a reason for a black screen
   * mid-walk, so the throw is reported and the overworld carries on without the line. This is also
   * the guard that keeps the prologue stand-in reachable if the corpus ever fails to resolve.
   */
  private tryDialogue<T>(ask: () => T | undefined): T | undefined {
    try {
      return ask();
    } catch (err) {
      this.flashBanner(`dialogue refused: ${describe(err)}`);
      return undefined;
    }
  }

  /**
   * Write every quest flag that has come due — `game/quests.ts` `syncQuestFlags`.
   *
   * Asked from every place the save can move, exactly as {@link syncEvents} is, and for the same
   * reason: a quest's completion is a standing fact about the save, not an edge somebody has to be
   * watching for. Idempotent, so asking often costs nothing.
   */
  private syncQuests(): void {
    const before = this.save;
    this.save = syncQuestFlags(this.save, this.content);
    if (this.save !== before) this.hudDirty = true;
  }

  /**
   * [X] — PUT ONE BACK. bible §9's release verb, which had no verb.
   *
   * The count moves through `core/ecosim.ts` `applyRelease` and the move is taped, so a reload and
   * a replay land on the same integer (L10). G7: the banner is the identifiers and two numbers.
   */
  releaseHere(): void {
    if (this.isHandedOver() || this.travelling) return;
    /*
     * NOT FROM INSIDE A BUILDING. `releaseIntoNode` puts the creature back into `this.node.id` —
     * still the town while the player is indoors — so the move would be silently right in the
     * arithmetic and plainly wrong on the screen: a count moves in the region while the player is
     * standing at a shop counter. G7 is not the issue; the issue is that the release verb is about
     * a PLACE, and the place it would name is not the one the player is in.
     */
    if (this.interior !== null) {
      this.flashBanner(`${this.interior.name} — step outside to release`);
      return;
    }
    const candidate = releaseCandidate(this.save, this.node.id);
    if (!candidate) {
      // The reason is READ, not restated. `game/quests.ts` `releaseRefusal` distinguishes the two
      // cases the old single sentence conflated: a party that would be emptied, and held stock that
      // simply has no count at THIS node — which is the reachable one, because the Legacy beat boxes
      // a starter-line heir and no starter line lives at r2.
      this.flashBanner(releaseRefusal(this.save, this.node.id) ?? `no release`);
      return;
    }
    const applied = releaseIntoNode(this.save, this.content, candidate.uid, this.node.id);
    if (applied.problem !== null) {
      this.flashBanner(`release problem: ${applied.problem}`);
      return;
    }
    this.save = applied.save;
    this.syncQuests();
    this.hudDirty = true;
    this.refreshHud();
    this.hooks.onSaveChanged?.(this.save, this);
    this.flashBanner(
      `released ${candidate.lineId} at ${this.node.id} — ${String(applied.before)} → ${String(applied.after)}`,
    );
  }

  /** The question game/encounters.ts answers, built from live state only. */
  forayContext(nodeId: string = this.node.id): ForayContext {
    const ctx: ForayContext = {
      node: this.liveNode(nodeId),
      species: this.species,
      balance: this.balance,
      season: this.currentSeason(),
      // THE ACT, NOT THE YEAR. The wild level band is act 1's band while the player is in act 1,
      // whether that is calendar year 1 or year 20 — see game/encounters.ts `rollLevel`.
      act: this.act(),
    };
    const unlocked = this.unlockedSignChains(nodeId);
    if (unlocked.size > 0) ctx.unlockedSignChains = unlocked;
    return ctx;
  }

  /**
   * Sign-chains the player has completed (bible §4 gates the Ancients behind them).
   *
   * ⚠ THIS USED TO READ A PREFIX NOTHING WROTE. It collected flags beginning `signChain:` — a
   * spelling that appears in this file and in no other file, no data file and no test, so the set
   * was empty for every save that could ever exist and the gate was passing by absence. The corpus
   * does write the completions: `chain.vellsire.complete`, `chain.undermere.complete`,
   * `chain.kilnback.complete`, each set by the last step of its chain.
   *
   * `core/foodweb.ts` keys the gate by LINE id (`unlocked?.has(lineId)`), not by chain id, so the
   * two have to be joined. The join is the chain's own middle segment against the shipped species
   * ids — `chain.vellsire.complete` → the gated line whose id starts `vellsire`. That coupling is a
   * DEVIATION: the explicit form is a `signChain` field on `SpeciesLine`, which is a
   * `core/types.ts` + `data/species.json` change this stream does not own. It is derived rather
   * than typed — no species id appears here, which the species-name gate in
   * tests/property/foodweb.test.ts requires and which also means a renamed line follows the data.
   */
  private unlockedSignChains(nodeId: string = this.node.id): ReadonlySet<string> {
    /*
     * ⚠ THE FINALE NODE IS GATED ON THE FINALE, NOT ON THE CHAIN ALONE (balance.encounter
     * .finaleGatedNode). `maren.keystone.6` writes `chain.vellsire.complete` at act 6 with NO
     * Greaves requirement, and `data/nodes/sanctum.json` ships `vellsire-line {count:1}` — so before
     * this clause a player could complete the chain, walk into the Sanctum, forage, roll the stag
     * and snare it, after which the approach cutscene narrated an animal the survey said was gone
     * and offered a catch-or-release choice that was already moot. bible §8's finale is a scripted
     * meeting (`game/finale.ts`), which is exactly why gating the WEIGHT TABLE here is safe: the
     * resolver builds its own battler and never asks this question. The other two Ancients are
     * unaffected — neither lives at this node.
     */
    if (nodeId === finaleNodeId(this.balance) && !finaleUnlocked(this.save, this.balance)) {
      return new Set<string>();
    }
    const gatedTag = this.balance.encounter.signChainGatedHabitatTag;
    const gatedLines = this.content.species.filter((s) => s.habitat.includes(gatedTag));
    const out = new Set<string>();
    for (const [flag, value] of Object.entries(this.save.questFlags)) {
      if (value !== true || !flag.startsWith(CHAIN_FLAG_PREFIX) || !flag.endsWith(CHAIN_COMPLETE_SUFFIX)) {
        continue;
      }
      const stem = flag.slice(CHAIN_FLAG_PREFIX.length, flag.length - CHAIN_COMPLETE_SUFFIX.length);
      if (stem.length === 0) continue;
      for (const line of gatedLines) {
        if (line.id.startsWith(stem)) out.add(line.id);
      }
    }
    return out;
  }

  /** Every sign chain the save has completed, by CHAIN id — what the HUD reports. */
  completedSignChains(): string[] {
    const out: string[] = [];
    for (const [flag, value] of Object.entries(this.save.questFlags)) {
      if (value !== true || !flag.startsWith(CHAIN_FLAG_PREFIX) || !flag.endsWith(CHAIN_COMPLETE_SUFFIX)) {
        continue;
      }
      out.push(flag.slice(CHAIN_FLAG_PREFIX.length, flag.length - CHAIN_COMPLETE_SUFFIX.length));
    }
    return out.sort();
  }

  /**
   * Hard Req 2 — the real number, read through {@link liveNode} so the HUD, the banner and the
   * encounter roll can never disagree about it (build-doc §8.3). `liveNode` resolves
   * `save.nodeStates` when there is a state and the shipped file when there is not; reading
   * `save.nodeStates` directly here is what made those two numbers differ.
   *
   * Takes an optional already-resolved node so a caller printing every line pays for one resolution
   * rather than one per line.
   */
  countOf(lineId: string, nodeId: string = this.node.id, resolved?: EcoNode): number {
    const node = resolved ?? this.liveNode(nodeId);
    return node.populations[lineId]?.count ?? 0;
  }

  /* ── the clock ────────────────────────────────────────────────────────── */

  clock(): ClockState {
    // `subTick` defaults to 0 so a save written before the fraction existed reads as a whole tick.
    return { year: this.save.year, tick: this.save.tick, subTick: this.save.subTick ?? 0 };
  }

  currentSeason(): Season {
    return seasonOf(this.clock(), this.balance);
  }

  /**
   * The run's final beat is behind the player — `core/acts.ts` `runIsComplete` of this save.
   *
   * ⚠ THIS USED TO BE A DATE. It read `core/clock.ts` `isOver` — "the calendar has passed year 6" —
   * and it gated ticks, encounter rolls and the year turn on it, so the game had a deadline nobody
   * designed. It is an ACT condition now: the finale fires whenever the player earns it,
   * and a player who never earns it plays forever. Nothing here refuses a tick.
   */
  runIsOver(): boolean {
    return runIsComplete(this.save, this.content.gyms, this.balance);
  }

  /** The act this save is in — badges and quest flags, never the calendar (`core/acts.ts`). */
  act(): number {
    return actOf(this.save, this.content.gyms, this.balance);
  }

  /**
   * bible §9's regional events open right now — each one a season window, `clock.ticksPerSeason`
   * ticks long. The number is deliberately not respelled here: it has already moved once (a 16-tick
   * year became `ticksPerYear` 52 / `ticksPerSeason` 13) and is expected to move again after
   * playtesting, and this line said "4-tick" for as long as that was false.
   */
  openEvents(): ReturnType<typeof activeWindows> {
    return activeWindows(this.save, this.clock(), {
      species: this.content.species,
      nodeStates: this.save.nodeStates,
    }, this.balance);
  }

  /**
   * Rest at the inn: build-doc §3 L8's third action, and the only one that costs more than one tick.
   *
   * ⚠ IT WAS UNREACHABLE. `spendTicks` was typed `"travel" | "foray"` and had exactly two call
   * sites, both costing 1 tick — so no player action could ever straddle a year boundary, which made
   * `balance.clock.innTicks` a tunable nothing read and `finishYearTurn`'s carry a path nothing
   * walked. Measured for contrast: `previewAction({year:1,tick:15}, "inn")` → cost 2, endsYear true,
   * afterTick 1. The town is `save.currentNode` — the node schema has no separate inn prop, and
   * inventing one would be content (G2).
   *
   * ⚠ IT NOW HEALS WHAT IT CHARGES FOR, AND IT DID NOT. This was `spendTicks` plus a banner: it took
   * `clock.innTicks` and touched the party not at all. Harmless while damage evaporated between
   * fights; not harmless since `game/wild-battle.ts` `applyBattleResult` began writing `curHp` back
   * and `core/lifecycle.ts` began carrying a zero through the year turn unchanged. The consequence
   * was that a damaged-but-not-wiped party's only route to full was to LOSE a fight on purpose —
   * `2 × innTicks + 1 × travelTicks` and a forced relocation ({@link recoverFromBlackout}) — while
   * the inn standing in front of the player cost `innTicks` and did nothing. Meanwhile
   * `balance.medicine.innRestFullHeal` was `true` with exactly one reader, the blackout's wake, and
   * bible §11 reads "inn rest (full heal, 2 ticks)".
   *
   * ⚠ NO SECOND RESTORE. `core/recovery.ts` `applyInnRest` selects with the same `restoredUids` the
   * blackout selects with and writes through the same `core/save.ts` `applyBlackout`; the only thing
   * this scene decides is WHEN. See that module's §5 for why the heal rides as its own absolute tape
   * entry instead of being derived from the `{t:"inn"}` price beside it.
   *
   * ⚠ CONSEQUENCE BEFORE PRICE, exactly as {@link recoverFromBlackout} step 1 is: the heal is on the
   * save before a year turn the charge triggers, or a save write, or the HUD can read it. The two
   * cannot come apart in between — `isHandedOver()` above already covers `yearTurnRunning`, which is
   * the one condition {@link spendTicks} refuses on, so a rest that healed can never be a rest that
   * was not charged.
   *
   * A FULL PARTY RESTING IS NOT AN ERROR AND NOT A REFUSAL. `innRestFor` answers null, the price is
   * levied anyway, and no tape entry is written — the inn's cost is `clock.innTicks` whatever state
   * the party is in, because a price that depended on how hurt the party was would be a second
   * pricing rule beside `core/clock.ts`'s.
   */
  /**
   * WHY [R] WOULD BE REFUSED WHERE THE PLAYER IS STANDING, as the sentence it is refused with —
   * or null, meaning rest. The HUD reads the same answer, so the key and the readout cannot drift.
   *
   * ⚠ THERE WAS NO SUCH QUESTION, AND ITS ABSENCE WAS A LIVE DEFECT. {@link restAtInn} guarded on
   * `isHandedOver() || travelling` and nothing else, while `innKey` is bound unconditionally and
   * polled every frame: [R] on Route 4 with the party at 1 HP healed it whole for `clock.innTicks`
   * and printed `inn at r4 · 2 ticks · 1 restored`, and [R] at a shop counter did the same, because
   * `save.currentNode` keeps naming the TOWN while the player is indoors. Every other
   * place-sensitive verb here already asks — {@link releaseHere}, {@link challengeGym},
   * {@link travelTo} and {@link playPendingCutscene} each refuse indoors out loud — so this was the
   * one omission, not a decision. It also priced the blackout against a baseline that was not true:
   * `core/recovery.ts`'s header argues the extra `innTicks + travelTicks` on the premise that an inn
   * is a way back to full "only for a player who is STANDING IN A TOWN", and an inn that works on a
   * route is a cheaper wipe cure than the wipe cure.
   *
   * THE INN NODES ARE `core/recovery.ts` `innNodeIds()`, IMPORTED AND NEVER RESTATED. That function
   * is the corpus's own authority — a speaker tagged `innkeeper` and homed to a node, INTERSECTED
   * with that speaker having a `service` beat there, refusing loudly when the two readings disagree
   * — and until this guard it had exactly one consumer, the blackout's `wakeNodeFor`. A list of inn
   * nodes written out in this file would be the second table G3 forbids. It is not
   * `content.gyms[].town` either, and that near miss is why the derivation is worth importing:
   * `greaves` stands at `sanctum`, which has no inn, no innkeeper and no beds.
   *
   * ⚠ INDOORS IS REFUSED EXCEPT IN THE TOWN'S OWN INN — the one room where "step outside" would be
   * the wrong sentence, and the exception is read out of shipped content rather than out of a name:
   *   • `data/interiors/hearthollow-inn.json` ships a `service` anchor whose `_purpose` is "the tile
   *     the player stands on to trigger the rest service — the full heal that costs inn ticks", so
   *     the room is authored to be rested in;
   *   • `core/recovery.ts` `restoreParty` PUTS `interiorId` BACK after the write, and says why in
   *     its own words: "[R] is live inside a room — `data/interiors/hearthollow-inn.json` is a room
   *     the player can be standing in when they press it". A blanket indoor refusal here would make
   *     that branch dead code and this file the reason another module's comment had gone false.
   * The test is the INNKEEPER: `innkeeperAt` names the speaker who keeps the inn at this node, and
   * the room is theirs when they are the speaker standing in it. A supply store has a shopkeeper
   * standing in it and is refused, which is the case that was traced.
   */
  private restRefusal(townId: string): string | null {
    if (!innNodeIds().includes(townId)) return `no inn at ${townId}`;
    const inside = this.interior;
    if (inside === null) return null;
    return this.isInnRoom(townId, inside) ? null : `${inside.name} — step outside to rest`;
  }

  /**
   * Whether this room is the one the town's innkeeper keeps — the test {@link restRefusal} makes
   * and the one {@link innRoomAt} searches with, written once.
   *
   * `innkeeperAt` names the speaker; the room is theirs when that speaker stands in it. Not a name
   * match on the id: `hearthollow-supply` would pass a name match on nothing but a hyphen.
   */
  private isInnRoom(townId: string, bp: InteriorBlueprint): boolean {
    const keeper = innkeeperAt(townId);
    return (
      bp.parentNode === townId &&
      keeper !== null &&
      bp.anchors.some((a) => a.kind === "speaker" && a.target === keeper)
    );
  }

  /**
   * The room the town's innkeeper keeps, or null where the town ships no interior at all.
   *
   * Null is the ordinary answer at three of the five inn towns — see {@link recoverFromBlackout}
   * step 2, which degrades to waking in the town rather than inventing a room (G2).
   */
  private innRoomAt(townId: string): InteriorBlueprint | null {
    return interiorsOf(townId).find((bp) => this.isInnRoom(townId, bp)) ?? null;
  }

  restAtInn(townId: string = this.save.currentNode): void {
    if (this.isHandedOver() || this.travelling) return;
    // WHERE, before what: see {@link restRefusal}. Said rather than silently ignored, on the same
    // terms every other refusal in this scene is said.
    const refusal = this.restRefusal(townId);
    if (refusal !== null) {
      this.flashBanner(refusal);
      return;
    }
    const rest = innRestFor(this.save, this.balance, isStanding);
    if (rest !== null) this.save = applyInnRest(this.save, rest);
    this.spendTicks("inn", { t: "inn", townId });
    // G7 — identifiers and arithmetic, and nothing about the player. The count is `healed` and not
    // `restored`: under `innRestFullHeal` the record names the whole fieldable party whether or not
    // anybody was hurt, so `restored.length` would report the same number for a rest that changed
    // nothing. Absent entirely when nothing was healed, rather than a "0" the player must interpret.
    const healed = rest === null ? "" : ` · ${String(rest.healed.length)} restored`;
    this.flashBanner(`inn at ${townId} · ${String(actionCosts(this.balance).inn)} ticks${healed}`);
  }

  /**
   * NOTHING IS STANDING — the black screen, the inn, and the price (`core/recovery.ts`).
   *
   * Hank, verbatim: *"When your team is wiped, a dialogue shows up with a black background saying
   * you passed out or something like that, and then you wake up at the inn"*, and *"it should use
   * twice the inn ticks, in addition to the cost of one fast travel."* Without it a wiped save has
   * no action left that can change its state: all four launchers refuse a party with nothing
   * standing, and `core/lifecycle.ts` keeps a zero at zero through the year turn. This is also the
   * explicit penalty docs/TICKETS.md T-12 asks for — the same thing seen from the other side.
   *
   * ⚠ {@link restAtInn} HEALS NOW, AND THIS IS STILL NOT REDUNDANT. The inn is a way back to full
   * for a player STANDING IN A TOWN with a key to press. A wipe happens mid-fight, and this method
   * is called from the last statement of all four finish handlers — the player never regains control
   * holding a wiped party, and a wipe on Route 1 has no inn to walk to in any case. So the two never
   * compete on price: `innTicks` buys a night's rest where you already are, and the extra
   * `innTicks + travelTicks` here buys the second night and the CARRY, which is the half the player
   * cannot perform for themselves.
   *
   * ⚠ CALLED AT THE END OF EVERY FIGHT AND IT IS A NO-OP UNLESS ONE IS OWED.
   * `blackoutRecoveryFor` answers null for a party with anything on its feet AND for an empty one,
   * which is a different state and belongs to the opening beat, not to an inn.
   *
   * ⚠ IT MUST RUN AFTER {@link applyBattleResult} HAS BEEN WRITTEN TO `this.save`, and in all four
   * launchers it does — `applyBattleResult` is the first statement of the finish handler and this
   * is reached from the last. It is the ONLY writer that can put a party member at zero from a
   * fight; while it had no caller this method was a permanent no-op, and a call placed above it
   * still would be.
   *
   * ⚠ IT IS THE CONTINUATION OF THE FIGHT'S OWN BEAT, NEVER THE OTHER WAY ROUND. The leader's
   * `battle-loss`, Wick's, the finale's epilogue — each is played first and this is what runs when
   * its box closes. Two reasons, and the second is the one that was measured:
   *   • it is the order the ruling's own reference has. In Pokémon the trainer finishes speaking,
   *     and THEN the screen goes black.
   *   • THE BEATS THAT FOLLOW ARE KEYED ON THE NODE THE PLAYER IS STANDING ON, and this method
   *     moves them. {@link playPendingCutscene} asks the corpus what is queued for `this.node.id`,
   *     and `maren.epilogue.released` / `maren.epilogue.caught` are `cutscene`s at `sanctum` while
   *     `maren.finale` is one at `sanctum-approach`. Blacking out first carries the player two
   *     nodes away and none of the three is eligible any more — measured: losing the Vellsire
   *     fight left the released epilogue unplayed, which is half of a never-cut beat. (It is not
   *     LOST — every autoplay entry closes itself with a flag, so it is still pending when the
   *     player walks back — but "the ending arrives after a hike" is not the beat.) Played first,
   *     the epilogue fires at the ring and the blackout follows it.
   * {@link playEntry} refuses while a box is open, so the two can never be fired side by side:
   * whichever went second would silently not happen.
   *
   * ⚠ THE ORDER IS CONSEQUENCE → MOVE → PRICE → SPEECH, and each step is where it is for a reason:
   *   1. `applyBlackoutRecovery` writes the tape entry, the restored party, the wake node and the
   *      corpus cue. FIRST, so that anything the price triggers — a season boundary, a year turn, a
   *      save write — reads a save that is already coherent.
   *   2. `enterNode` makes the move real on screen, SYNCHRONOUSLY. Deliberately NOT `travelTo`:
   *      there is no adjacency between a route and the town you are carried to, the act gate is
   *      travel's refusal and not this one's, and `travelTo` would charge a second travel tick.
   *      Travel awaits `ensureNodeArt` before it adopts a node; this does not, because the whole
   *      of step 4 is a black screen drawn over the load — and because a wake finishing in a
   *      microtask would leave `save.currentNode` and `this.node` naming different nodes for as
   *      long as it took (see {@link enterNode}). The art is asked for anyway, and the view is
   *      rebuilt IF the wait actually produced a texture: a wake node whose map has never been
   *      loaded would otherwise keep its placeholder and its synthesised collision grid until the
   *      next travel, which is a walkable map the mask does not agree with.
   *      …AND THEN INTO THE ROOM, where the town ships one — see the body. `enterNode` alone moves
   *      the player to the TOWN, and at every town that keeps an inn that is the town they were
   *      already standing in, so for five of the twelve nodes step 2 was the identity.
   *   3. the charges — one `spendTicks` per element of `core/recovery.ts` `BLACKOUT_COST`, which is
   *      `["inn", "inn", "travel"]`. They are ORDINARY priced entries, and that is what makes the
   *      blackout cost the same on the replay path (`game/year-replay.ts` `clockFromLog` prices
   *      them straight out of `balance.clock`) with nothing added to `ClockActionKind`, to
   *      `GameAction`, to `TICK_COSTING` or to `actionCosts`.
   *   4. the beat, by ID, ON A BLACKED-OUT SCREEN. The corpus gates `narration.blackout` on the cue
   *      step 1 raised, and `finishDialogue` -> `applyRunFlags` lowers it again with the entry's own
   *      `setFlags`. `DialogueScene` draws the name plate from the speaker and `narration`'s is a
   *      single space, so nobody appears to be talking — ⚠ but that is ALL an empty name plate does,
   *      and this line used to claim it "is what makes it read as a black screen". It is not:
   *      {@link curtainWanted} is, and until it existed the narration was read over the live map.
   *      The innkeeper's SHIPPED rest beat follows it, so "you wake up at the inn" is her own
   *      voice and not a word of new copy.
   *
   * ⚠ THE CHARGE IS NOT ATOMIC, SAID OUT LOUD BECAUSE {@link spendTicks} REFUSES SILENTLY. If the
   * first inn fills the year meter, `beginYearTurn` raises `yearTurnRunning` and the remaining two
   * charges vanish — a discount of up to three ticks in a narrow window. It is not a corruption:
   * `spendTicks` appends nothing when it refuses, so the tape and the clock still agree and the
   * replay lands where the live run did, and step 1 has already left the save coherent. Closing it
   * means teaching `spendTicks` to take a LIST and handle the crossed boundaries once, which is a
   * bigger change than this trigger and is the owner's call.
   */
  recoverFromBlackout(): void {
    if (this.battleRunning || this.yearTurnRunning || this.travelling) return;
    const recovery = blackoutRecoveryFor(this.save, this.content, isStanding);
    if (recovery === null) return;

    // Step outside first: `currentNode` is about to move, and a save whose `interiorId` names a
    // room in the town it just left is the broken state `travelTo` refuses travel to avoid.
    if (this.interior !== null) this.leaveInterior();

    // 1. the consequence.
    this.save = applyBlackoutRecovery(this.save, recovery);

    // 2. the move, on screen.
    const target = this.nodeFile(recovery.wakeNode);
    const keys = nodeArtKeys(target, this.save.year, this.balance);
    const artMissing = !this.textures.exists(keys.mapKey) || !this.textures.exists(keys.maskKey);
    this.enterNode(target);
    /*
     * …AND INTO THE ROOM, WHICH IS THE HALF THE RULING NAMES AND THE MOVE USED TO STOP SHORT OF.
     * T-29 is "a dialogue with a black background saying you passed out, and then you wake at the
     * inn"; `wakeNodeFor` answers the TOWN, and at the five towns that keep one that town is the
     * one they already stood in — so for a wipe in Hearthollow step 2 was the identity and the
     * player woke on the tile they fell on, with the prose describing a ceiling and a fire they
     * were nowhere near. Traced: tile 18,29 before the fight and 18,29 after the whole recovery,
     * with the inn door at 18,24 and its interior never entered.
     *
     * ⚠ AFTER `enterNode`, NEVER BEFORE: {@link adoptInterior}'s own rule is that a room belongs to
     * `save.currentNode`, and `enterNode` is what moves it. The room is derived the way
     * {@link restRefusal} derives the same fact — {@link innRoomAt} is the one spelling of it.
     *
     * ⚠ THREE OF THE FIVE INN TOWNS SHIP NO INTERIOR AT ALL (`data/interiors/` holds Hearthollow's
     * and Brackwater's and no others), so at those the player wakes standing in the town. That is a
     * content gap and not a decision this file may close by inventing a room (G2); it degrades to
     * exactly the old behaviour and nowhere else changes.
     */
    const room = this.innRoomAt(target.id);
    if (room !== null) this.enterInterior(room);
    if (artMissing) {
      void ensureNodeArt(this, keys).then(() => {
        // Guarded on all three counts: the player may have moved on, the fetch may have found
        // nothing real to fetch (`ensureNodeArt` resolves immediately then), and a rebuild that
        // changes no texture is a MapView destroyed and remade for nothing.
        if (this.node.id !== target.id) return;
        if (!this.textures.exists(keys.mapKey) && !this.textures.exists(keys.maskKey)) return;
        this.enterNode(target);
        // `enterNode` rebuilds the TOWN's view and does not know which of the two is on screen —
        // travel is always outdoors, this is not any more. Without it the town's map would be
        // remade visible under a player who is standing in a room.
        this.syncViewMode();
      });
    }

    // 3. the price.
    for (const charge of blackoutCharges(recovery)) this.spendTicks(charge.kind, charge.action);

    this.syncQuests();
    this.hudDirty = true;
    this.refreshHud();
    this.hooks.onSaveChanged?.(this.save, this);
    // G7 — identifiers and arithmetic, exactly as `restAtInn`'s banner is. The prose says nothing
    // about ticks and the banner says nothing about the player.
    this.flashBanner(`${recovery.wakeNode} · ${String(blackoutTicks(this.balance))} ticks`);

    /*
     * ⚠ THE PRICE MAY HAVE TAKEN THE SCREEN, AND THE BEAT MAY NOT BE LAUNCHED ON TOP OF IT. This is
     * {@link handOffToBattle}'s guard, in the same shape and for the same reason: `spendTicks` can
     * reach `beginYearTurn`, which is a synchronous `scene.launch` + `scene.pause`, and step 4 below
     * asks {@link playEntry} — which reads `dialogueRunning` and knew nothing about the year turn.
     * Losing a fight on the last tick or two of a year therefore put TWO full-screen scenes up for
     * one wipe and paused the overworld twice, against a `scene.resume` that is not ref-counted, so
     * the overworld came back while the second scene was still drawing. The window is any position
     * from which one of the THREE charges fills the meter — the last `blackoutTicks` ticks of a
     * year, not only the last one — and it was traced at tick 50 of 52, where the first fills it.
     *
     * THE CHARGE STANDS AND THE CONSEQUENCE STANDS — steps 1 to 3 have already happened and the year
     * really did turn. What is given up is the SPEECH, which is the only part of this that can be
     * given up: `BLACKOUT_CUE_FLAG` is a latch and only the beat lowers it, so the corpus still says
     * the beat is owed and the HUD's own `flags owed` count says so too. The alternative — holding
     * the beat across the turn — would play a wake-up written for the party as it stood BEFORE
     * build-doc §7.5 retired creatures out of it.
     */
    if (this.yearTurnRunning) {
      this.flashBanner(`${recovery.wakeNode} — the year turned first`);
      return;
    }

    // 4. the black screen, and then the room.
    const rest = restBeatAt(recovery.wakeNode, this.dialogueCtx());
    this.playEntry(BLACKOUT_ENTRY_ID, "narration", rest && (() => this.playEntry(rest.id, rest.speaker)));
  }

  /**
   * A gym win: a BADGE, and the act it may advance. It does NOT end the year.
   *
   * ⚠ THIS USED TO END THE YEAR, and that was L8's second trigger: "year = gym victory or full
   * meter". Hank dropped it — *"I don't want the passage of time to be forced based on gyms or
   * stages"* — and the perverse incentive went with it: under the old rule, winning a gym COST the
   * player the rest of that year's ticks, so the reward for succeeding was to lose up to fifteen
   * forays of a year that had already been paid for.
   *
   * What a win does now is write the badge flag, which is the act model's only numeric input, and
   * then enter every act that badge earned — firing that act's scripted Cullbrand raid at a named
   * node (bible §9). The gym itself, its roster and its dialogue are C3/C7's; this scene owns the
   * two clocks and hands the beats over.
   */
  /**
   * Fight the leader standing in this town — the act ladder's only source of badges.
   *
   * ⚠ WITHOUT THIS THE GAME HAD NO SECOND ACT. `winGym` is what writes a badge flag and it had no
   * caller anywhere in the repo; `balance.acts.gates` opens Brackwater and Route 2 at one badge, so
   * the never-cut vertical slice (build-doc §16: Hearthollow → R1 → Brackwater → R2) stopped dead
   * at Route 1 and the finale was unreachable. The fight itself is `game/gym-battle.ts` +
   * `core/battle.ts` through C3's scene, exactly as a wild encounter is; a lane that wants to own
   * the challenge takes {@link OverworldHooks.onGymChallenge} and this stands down.
   *
   * EVERY REFUSAL IS SAID. A town with no leader, a badge already won, a leader whose act the
   * player has not reached, an empty party and an unregistered battle scene each print their own
   * sentence — a silent no-op here is indistinguishable from a key that is not bound.
   */
  challengeGym(nodeId: string = this.node.id): void {
    if (this.isHandedOver() || this.travelling) return;
    // The leader stands in the town, not in the inn. Said rather than silently ignored, on the same
    // terms every other refusal in this method is said.
    if (this.interior !== null) {
      this.flashBanner(`${this.interior.name} — step outside to challenge`);
      return;
    }

    const gym = gymAtNode(this.content, nodeId);
    if (!gym) {
      /*
       * A ROUTE HAS NO LEADER, BUT IT MAY HAVE THE RIVAL. The arrival trigger is the primary one
       * (see {@link challengeRival}), and this is the way back to an encounter the player was in no
       * state to take when they walked in — without it, a fainted party at the moment of arrival
       * means walking out and back in is the only way to find him again.
       */
      if (rivalAtNode(this.content, nodeId)) {
        this.challengeRival(nodeId);
        return;
      }
      this.flashBanner(`no leader at ${nodeId}`);
      return;
    }
    if (this.hooks.onGymChallenge?.(gym, this) === true) return;

    const problem = gymBattleProblem(this.save, gym, this.content);
    if (problem) {
      this.flashBanner(`${gym.id} — ${problem}`);
      return;
    }
    if (!sceneRegistered(this, SCENE_KEYS.battle)) {
      this.flashBanner(`${gym.id} — "${SCENE_KEYS.battle}" is not registered`);
      return;
    }

    // The leader speaks BEFORE the fight, and the fight is launched from that run's continuation —
    // see `playBattlePre`. Every refusal above has already been answered, so nothing here can leave
    // the player holding a speech with no battle behind it.
    this.playBattlePre(gym.id, gym.town, () => this.launchGymBattle(gym));
  }

  /**
   * Play a fighter's `battle-pre`, then do the thing.
   *
   * ⚠ A MISSING ENTRY FLASHES A BANNER AND STILL FIGHTS. Gym-leader speaker ids happen to equal gym
   * ids today (`maribel/odo/vesper/sable/noct/greaves` in both `data/gyms.json` and the speaker
   * table) and the rival's id is `RivalEncounter.id`, so the join is by convention rather than by
   * construction. A future divergence would make `battleEntryFor` return `undefined` — and a silent
   * `undefined` there is a badge that can never be won, which is strictly worse than a fight with no
   * speech in front of it. So the gap is SAID and the fight goes ahead.
   */
  private playBattlePre(speaker: string, node: string, then: () => void): void {
    const entry = this.tryDialogue(() =>
      battleEntryFor(DIALOGUE, speaker, node, "battle-pre", this.dialogueCtx()),
    );
    if (!entry) {
      this.flashBanner(`${speaker} — no battle-pre at ${node}`);
      then();
      return;
    }
    this.playEntry(entry.id, entry.speaker, then);
  }

  /**
   * Play a fighter's `battle-win` or `battle-loss`.
   *
   * ⚠ CALLED AFTER THE BADGE IS WRITTEN, AND THAT ORDER IS LOAD-BEARING. `maribel.post.win` and its
   * four siblings write `gym.<id>.beaten` themselves and `greaves.finale.post` writes
   * `story.greaves.beaten` — so playing this before `awardBadge` would advance the act ladder in the
   * middle of the scene announcing it, and `runIsComplete`'s two authored conditions would arrive in
   * the wrong order. `winGym` first, the speech second.
   */
  private playBattleOutcome(speaker: string, node: string, won: boolean, then?: () => void): void {
    const kind = battleOutcomeKind(won);
    const entry = this.tryDialogue(() => battleEntryFor(DIALOGUE, speaker, node, kind, this.dialogueCtx()));
    if (!entry) {
      this.flashBanner(`${speaker} — no ${kind} at ${node}`);
      then?.();
      return;
    }
    this.playEntry(entry.id, entry.speaker, then);
  }

  /** The fight itself, once the leader has spoken. */
  private launchGymBattle(gym: GymLeader): void {
    let build: ReturnType<typeof buildGymBattle>;
    try {
      build = buildGymBattle({
        content: this.content,
        save: this.save,
        gym,
        node: this.liveNode(gym.town),
      });
    } catch (err) {
      this.flashBanner(`gym refused: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    const data: BattleSceneData = {
      ctx: build.ctx,
      input: build.input,
      rng: this.streamFor(BATTLE_STREAM),
      projectedRetirementYears: this.projectedRetirementYears(),
      onFinished: (result) => {
        this.battleRunning = false;
        this.scene.stop(SCENE_KEYS.battle);
        this.scene.resume();
        this.hudDirty = true;
        // The damage, the levels and the bag, before anything reads the party again — see
        // `finishWildBattle` for why this call is the one that was missing.
        this.save = applyBattleResult(this.save, result.state);
        // A badge on a WIN and on nothing else — `gymBattleWon` enumerates the outcome rather than
        // reading "not a loss", so a fled fight is not a badge.
        const won = gymBattleWon(result.state);
        if (won) this.winGym(gym.id);
        else this.flashBanner(`${gym.id} — ${result.state.outcome ?? "unresolved"}`);
        // …and THEN the leader answers it. See `playBattleOutcome` for why this order is not free,
        // and `recoverFromBlackout` for why the black screen comes after her line and not before it.
        this.playBattleOutcome(gym.id, gym.town, won, () => this.recoverFromBlackout());
      },
    };

    this.handOffToBattle(data, { t: "battle", kind: "gym", nodeId: gym.town }, gym.id);
  }

  /* ── the rival (content-bible §8) ──────────────────────────────────────── */

  /**
   * bible §8 — "Wick … **battles you each act**", on the route he has been working.
   *
   * ⚠ WITHOUT THIS THE RIVAL DID NOT EXIST. `data/dialogue.json` ships eighteen Wick entries — six
   * pre-battle speeches, six wins, six losses, 37 lines — and before `game/rival.ts` there was no
   * roster, no trigger and no module: he appeared in the shipped game as one always-eligible
   * greeting in Brackwater. `maren.finale`, on the never-cut finale path, gates on
   * `story.greaves.entered`, which nothing but his act-6 encounter writes.
   *
   * THE TRIGGER IS ARRIVAL, not a key: he is standing on the route when you walk onto it, which is
   * how a Gold rival behaves and what "the routes he's worked are visibly degraded when you reach
   * them" describes. It runs after the tick has been spent (see {@link travelTo}) so a seasonal
   * clause reads the season the player arrived in.
   *
   * WHETHER THE ENCOUNTER IS STILL STANDING IS THE CORPUS'S ANSWER, not a second model here:
   * `rivalEncounterStanding` asks for the `battle-pre` entry, whose own `when` carries the act floor
   * and `flagsUnset: ["rival.act<N>.fought"]`. Every refusal is SAID, on the same terms
   * {@link challengeGym} refuses.
   */
  challengeRival(nodeId: string = this.node.id): void {
    if (this.isHandedOver() || this.travelling || this.dialogueRunning) return;

    const rival = rivalAtNode(this.content, nodeId);
    if (!rival) return;
    const pre = this.tryDialogue(() => rivalEncounterStanding(DIALOGUE, rival, this.dialogueCtx()));
    // Already fought, or the act floor is not reached: the corpus said so, and neither is a problem
    // to report — an empty route is the normal state of six of them at any given moment.
    if (!pre) return;

    const problem = rivalBattleProblem(this.save, rival, this.content);
    if (problem) {
      this.flashBanner(`${rival.id} — ${problem}`);
      return;
    }
    if (!sceneRegistered(this, SCENE_KEYS.battle)) {
      this.flashBanner(`${rival.id} — "${SCENE_KEYS.battle}" is not registered`);
      return;
    }
    this.playEntry(pre.id, pre.speaker, () => this.launchRivalBattle(rival));
  }

  /**
   * The rival fight. NO BADGE, on purpose: `core/acts.ts`'s only numeric input is gym badges, and a
   * rival who moved the act ladder would put the region's gates behind a fight the bible does not
   * put them behind.
   */
  private launchRivalBattle(rival: RivalEncounter): void {
    if (this.battleRunning || this.yearTurnRunning) return;

    let build: ReturnType<typeof buildRivalBattle>;
    try {
      build = buildRivalBattle({
        content: this.content,
        save: this.save,
        rival,
        node: this.liveNode(rival.node),
      });
    } catch (err) {
      this.flashBanner(`rival refused: ${describe(err)}`);
      return;
    }

    const data: BattleSceneData = {
      ctx: build.ctx,
      input: build.input,
      rng: this.streamFor(BATTLE_STREAM),
      projectedRetirementYears: this.projectedRetirementYears(),
      onFinished: (result) => {
        this.battleRunning = false;
        this.scene.stop(SCENE_KEYS.battle);
        this.scene.resume();
        this.hudDirty = true;
        // Same one writer, same position — see `finishWildBattle`.
        this.save = applyBattleResult(this.save, result.state);
        const won = rivalBattleWon(result.state);
        this.flashBanner(`${rival.id} act ${String(rival.act)} — ${result.state.outcome ?? "unresolved"}`);
        // The entry writes `rival.act<N>.fought` on a WIN only, so a loss leaves the encounter
        // standing — which is what `wick.act6.loss` promises in words ("Come back when your team has
        // slept") and what it could not do while the loss closed itself. The blackout follows his
        // line rather than preceding it, for the reason `recoverFromBlackout` gives.
        this.playBattleOutcome(rival.id, rival.node, won, () => this.recoverFromBlackout());
      },
    };

    this.handOffToBattle(data, { t: "battle", kind: "rival", nodeId: rival.node }, rival.id);
  }

  /* ── the finale (content-bible §8 / build-doc §16's never-cut Vellsire beat) ── */

  /**
   * Open the Vellsire fight when the player has just set the snare.
   *
   * Asked from {@link finishDialogue}, i.e. from every place a dialogue run can have written
   * `story.vellsire.attempt`. `game/finale.ts` owns everything about the encounter; this decides
   * WHEN, and reports the degraded answer when the battle scene is not there to decide it.
   */
  private maybeBeginFinale(): void {
    if (this.dialogueRunning || this.battleRunning || this.yearTurnRunning) return;
    if (vellsireResolved(this.save)) return;
    if (vellsireAttempt(this.save) !== "catch") return;

    const problem = vellsireBattleProblem(this.save);
    if (problem) {
      this.flashBanner(`the ring — ${problem}`);
      return;
    }
    if (!sceneRegistered(this, SCENE_KEYS.battle)) {
      /*
       * SAME DISCIPLINE AS `playEntry`'s headless answer, and for the same reason: a beat that
       * silently does not happen is worse than a degraded one, and this beat is the last thirty
       * seconds of the demo. The snare cannot be rolled without the reducer's scene, so the attempt
       * resolves the way a failed snare resolves — released — and it is SAID, not passed off.
       */
      const resolved = resolveVellsireWithoutBattle(this.save);
      if (!resolved) return;
      this.save = resolved.save;
      this.flashBanner(`the ring — "${SCENE_KEYS.battle}" is not registered · ${resolved.outcome}`);
      this.afterFinale();
      return;
    }

    let build: ReturnType<typeof buildVellsireBattle>;
    try {
      build = buildVellsireBattle({
        content: this.content,
        save: this.save,
        act: this.act(),
        rng: this.streamFor(ENCOUNTER_STREAM),
        node: this.liveNode(finaleNodeId(this.balance)),
      });
    } catch (err) {
      this.flashBanner(`the ring refused: ${describe(err)}`);
      return;
    }

    const data: BattleSceneData = {
      ctx: build.ctx,
      input: build.input,
      rng: this.streamFor(BATTLE_STREAM),
      projectedRetirementYears: this.projectedRetirementYears(),
      onFinished: (result) => {
        this.battleRunning = false;
        this.scene.stop(SCENE_KEYS.battle);
        this.scene.resume();
        this.hudDirty = true;
        // Same one writer, same position — see `finishWildBattle`. Before `resolveVellsireCatch`,
        // which is this fight's catch writer.
        this.save = applyBattleResult(this.save, result.state);
        const resolution = resolveVellsireCatch({
          save: this.save,
          content: this.content,
          state: result.state,
          caught: result.caught,
        });
        this.save = resolution.save;
        if (resolution.problem !== null) this.flashBanner(`catch problem: ${resolution.problem}`);
        const applied = resolution.applied;
        this.flashBanner(
          applied
            ? `${build.lineId} at ${build.nodeId} — ${String(applied.before)} → ${String(applied.after)}`
            : `${build.lineId} — ${vellsireBattleOutcomeLabel(result.state)} · ${resolution.outcome}`,
        );
        // `afterFinale` ends in `playPendingCutscene`, and BOTH epilogues are cutscenes at
        // `sanctum` — so the blackout is what runs when the ending's box closes, never before it.
        this.afterFinale(() => this.recoverFromBlackout());
      },
    };

    this.handOffToBattle(data, { t: "battle", kind: "ancient", nodeId: build.nodeId }, "the ring");
  }

  /**
   * Adopt the resolution and let the corpus answer it — one of the two epilogues is now eligible.
   *
   * `then` is passed straight through to the epilogue's box, so a caller can put something after
   * the ending. {@link recoverFromBlackout} is the one that does: both epilogues are `cutscene`s at
   * `sanctum`, so a blackout taken BEFORE them would carry the player off the node they are keyed
   * on and neither would be eligible.
   */
  private afterFinale(then?: () => void): void {
    this.syncQuests();
    this.advanceActs();
    this.syncEvents();
    this.hudDirty = true;
    this.refreshHud();
    this.hooks.onSaveChanged?.(this.save, this);
    this.playPendingCutscene(then);
  }

  winGym(gymId: string): void {
    if (this.isHandedOver() || this.travelling) return;
    const before = this.act();
    this.save = appendAction(this.save, { t: "gymVictory", gymId });
    this.save = { ...this.save, ...awardBadge(this.save, gymId, this.balance) };
    this.advanceActs();
    const after = this.act();
    this.flashBanner(
      after === before
        ? `badge ${gymId} · act ${String(after)}`
        : `badge ${gymId} · act ${String(before)} → ${String(after)}`,
    );
    this.hudDirty = true;
    this.hooks.onSaveChanged?.(this.save, this);
  }

  /**
   * Enter every act the save has earned and not yet entered, playing each one's scripts.
   *
   * `core/lifecycle.ts` `enterPendingActs` owns the population floor and the `recentDeaths` credit,
   * exactly as the year turn does for aging; this scene only decides WHEN, and reports what moved.
   * Idempotent — the entered act is latched in `questFlags`, so calling it on every save change
   * costs nothing and cannot re-apply a decrement.
   */
  private advanceActs(): void {
    this.openPrologue();
    const before = this.save;
    /*
     * REPORTED, NEVER THROWN OUT OF `create()`. `enterPendingActs` fails loudly on a raid script
     * naming a node or a line the save does not have (a one-letter typo would otherwise be a beat
     * that quietly does not happen), and `actEntryBeats` fails loudly on a scheduled harvest that
     * emitted no event. Both are right to fail — but this runs during scene construction, and an
     * exception here is a black screen rather than a message. The act is NOT latched when the entry
     * throws, so the next `create()` tries again: this is a deferral with a sentence on screen, not
     * a swallow.
     */
    let entry: ReturnType<typeof enterPendingActs>;
    try {
      entry = enterPendingActs(this.save, {
        balance: this.balance,
        gyms: this.content.gyms,
      });
    } catch (err) {
      this.flashBanner(`act entry refused: ${err instanceof Error ? err.message : String(err)}`);
      this.maybeCompleteRun();
      return;
    }
    if (entry.actsEntered.length > 0) {
      this.save = entry.save;
      /*
       * The act-entry beats, not a second formatting of the same numbers. `actEntryBeats` +
       * `beatLines` (game/scenes/YearTurnScene.ts) is C6's presentation of a raid and it had no
       * caller outside a test — so the running game hand-rolled its own one-liner and the presenter
       * that was built for this moment was never exercised by it. Hard Req 2's numbers now reach
       * the screen through the module that owns them (G7: identifiers and arithmetic, nothing else).
       */
      try {
        for (const beat of actEntryBeats(before, entry, this.content)) {
          this.flashBanner(beatLines(beat).join(" · "));
        }
      } catch (err) {
        this.flashBanner(`act beats refused: ${err instanceof Error ? err.message : String(err)}`);
      }
      this.syncEvents();
    }
    this.maybeCompleteRun();
  }

  /**
   * The act ladder's first rung — MAREN'S OPENING CHAIN, and a stand-in only when that chain cannot
   * be resolved.
   *
   * `balance.acts.gates` opens act 1 on `story.opening.done`, and the only thing that writes it is
   * `data/dialogue.json`'s `maren.starter.*` — the three branches of Maren's opening cutscene.
   * Nothing in `game/` read that file, so measured through the real scene on a brand-new
   * save: act 0, one unlocked node, `travelTo("r1")` refused. The act gate on
   * travel had made build-doc §16's never-cut vertical slice unreachable by playing.
   *
   * THE ORDER HERE IS THE WHOLE POINT, and it now reads: a lane that took the hook, then the
   * CORPUS, then the stand-in.
   *
   *   1. `hooks.onOpeningBeat` still wins, unchanged — a lane that owns the beat owns it.
   *   2. {@link openingBeatEntry} asks whether the corpus can actually deliver those flags from
   *      here: an eligible cutscene at this node from which a `goto`/choice path reaches an entry
   *      that writes one of them. When it can, this method writes NOTHING and says nothing — the
   *      cutscene plays itself out of `create()` / {@link playPendingCutscene}, and the player
   *      chooses their own starter. The "provisional" banner and the console line below are gone
   *      from that path entirely, which is the visible difference.
   *   3. Only if the corpus cannot answer — a resolution failure, an edited corpus, an act off the
   *      ladder — does the stand-in run, on exactly the terms it always did, out loud. It is kept
   *      deliberately: without it a corpus that fails to load is a game locked inside Hearthollow
   *      for ever, and that is a worse failure than a declared stand-in.
   */
  private openPrologue(): void {
    // Asked only while the rung is actually unclimbed, so a lane owning the beat is not re-asked
    // once its own flags are written and the question has no answer left to give.
    const flags = prologueExitFlags(this.balance).filter((f) => this.save.questFlags[f] !== true);
    if (flags.length === 0) return;
    if (this.hooks.onOpeningBeat?.(this) === true) {
      /*
       * "I own the opening beat" has to mean the WHOLE beat. Without this the hook switched the
       * stand-in off and the corpus's own opening cutscene then autoplayed anyway out of
       * `create()`, wrote `story.opening.done` itself, and handed the lane an act it had not yet
       * decided to grant — the same seam broken from the other side. Marking the corpus's beat as
       * already played is how the scene stands down completely.
       */
      const owned = this.openingBeatEntry(flags);
      if (owned !== null) this.autoplayed.add(owned);
      return;
    }
    if (this.openingBeatEntry(flags) !== null) return;
    if (this.save.party.length === 0) {
      this.flashBanner(`act ${String(this.act())} · prologue open · ${flags.join(" ")} unwritten`);
      return;
    }
    this.save = setQuestFlags(this.save, flags);
    console.info(
      `[overworld] the corpus has no opening beat that writes ${flags.join(", ")} from ` +
        `${this.node.id} — standing in so the act ladder can be climbed. This is the fallback; ` +
        `data/dialogue.json's opening chain is the real path.`,
    );
    this.flashBanner(`opening beat stood in · ${flags.join(" ")} · act ${String(this.act())}`);
    this.hooks.onSaveChanged?.(this.save, this);
  }

  /**
   * The corpus's opening beat for this node, or null.
   *
   * "Opening beat" is not a name this file knows — it is DERIVED: an autoplayable cutscene that is
   * eligible right now and from which some `goto` or choice path reaches an entry writing one of
   * the prologue's exit flags. That derivation is what makes the fallback in {@link openPrologue}
   * honest rather than superstitious: it stands in only when the corpus provably cannot deliver.
   */
  private openingBeatEntry(flags: readonly string[]): string | null {
    const start = this.tryDialogue(() => autoplayEntryFor(DIALOGUE, this.node.id, this.dialogueCtx()));
    if (!start) return null;
    const wanted = new Set(flags);
    const seen = new Set<string>();
    const queue = [start.id];
    while (queue.length > 0) {
      const id = queue.pop() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      const entry = DIALOGUE.entries.find((e) => e.id === id);
      if (!entry) continue;
      for (const key of Object.keys(entry.setFlags ?? {})) if (wanted.has(key)) return start.id;
      for (const choice of entry.choices ?? []) {
        for (const key of Object.keys(choice.setFlags ?? {})) if (wanted.has(key)) return start.id;
        if (choice.goto !== undefined) queue.push(choice.goto);
      }
      if (entry.goto !== undefined) queue.push(entry.goto);
    }
    return null;
  }

  /**
   * Republish bible §9's open event windows into the save's quest flags.
   *
   * `data/dialogue.json` gates on `event.festival.open` and nothing has ever written it. This is
   * that writer.
   *
   * ⚠ CALLED AFTER EVERY TICK SPEND, not "at every season boundary and every act entry". That
   * sentence stood here and it was wrong by one moment — the most important one. `core/clock.ts`
   * `advance` deliberately emits NO `seasonBoundary` on the year-filling tick, so a scene syncing
   * only inside the `seasonBoundary` arm never re-synced at the year turn: measured,
   * `event.festival.open` stayed true for **two consecutive season windows** — the whole final
   * season of year N plus the whole first season of year N+1 — with the festival's dialogue firing
   * in spring. THE READING IS HISTORY, NOT THE RULE: it was 8 consecutive open ticks, taken under
   * the then-shipped 16-tick year where a season was four ticks. A window is `clock.ticksPerSeason`
   * ticks long, whatever that key holds today, and this line will not respell it.
   * Deleting that one call site turned ZERO tests red, because the suite
   * called `syncEventFlags` by hand at a clock the game never reached (stub blindness). It is asked
   * from the three places the save can move — {@link create}, {@link spendTicks} and the year turn's
   * own `finish` — plus act entry, which moves a raid latch.
   */
  private syncEvents(): void {
    this.save = syncEventFlags(this.save, this.clock(), {
      species: this.content.species,
      nodeStates: this.save.nodeStates,
    }, this.balance);
  }

  /**
   * Spend one action's ticks (travel 1 / foray 1 / inn 2 / battle 0.5) through core/clock.ts, log
   * the action, and deal with whatever boundary it crossed.
   *
   * ⚠ IT REFUSES WHILE THE YEAR TURN HAS THE SCREEN, and that refusal is silent — which is safe
   * only because every caller has already decided there is nothing to do. {@link handOffToBattle}
   * is the one that had to be taught it: a charge levied here while `yearTurnRunning` would simply
   * vanish, and the fight it belonged to would go ahead free.
   */
  private spendTicks(kind: ClockActionKind, action: GameAction): void {
    if (this.yearTurnRunning) return;
    /*
     * NO GUARD ON THE CALENDAR. A refusal used to stand here — `if (this.runIsOver()) return` over
     * `core/clock.ts` `isOver` — so the game stopped accepting player actions once the calendar
     * passed year 6. There is no year 6: the calendar is unbounded, ticks are always spent,
     * and a player standing in year 20 forays exactly as one in year 2 does.
     */
    this.save = appendAction(this.save, action);
    // The tick the action STARTED on, kept because the year turn has to be handed a save that is
    // still standing in the year the clock is about to end (build-doc §7.5 runs on year N and
    // returns year N+1). Advancing first and reverting later would run the turn a year late.
    const tickBefore = this.save.tick;
    const advanced = advanceAction(this.clock(), kind, this.balance);
    // ALL THREE NUMBERS, not two. `subTick` is where a battle's half tick lives until a second one
    // completes it (core/clock.ts `ClockState`); dropping it here would round every fractional
    // charge to nothing and make battles free in pairs.
    this.save = {
      ...this.save,
      year: advanced.clock.year,
      tick: advanced.clock.tick,
      subTick: advanced.clock.subTick,
    };
    this.handleClockEvents(advanced.events, tickBefore);
    // Windows are a projection of the clock, so they are republished after EVERY tick spend and not
    // only on the cue the clock happens to emit — see {@link syncEvents} for the 8-tick festival.
    // Before `onSaveChanged`, so what is persisted carries the flags the clock actually implies.
    this.syncEvents();
    // …and so are quest completions: *The Fallow Field* closes when a YEAR turns, which is a thing
    // the clock does and not a thing the player presses a key for.
    this.syncQuests();
    this.hudDirty = true;
    this.hooks.onSaveChanged?.(this.save, this);
  }

  /**
   * ⚠ THE SEAM MOST LIKELY TO BE RE-BROKEN. `seasonBoundary` fires on the first
   * `seasonOrder.length - 1` multiples of `clock.ticksPerSeason` and NOT on the last one — the
   * year's FOURTH season step belongs to `runYearTurn` (build-doc §7.5 step 5). Running the sim on
   * both cues ran five seasons a year and inflated every six-year trajectory by 25%. So: this
   * scene steps the sim on `seasonBoundary` and never on `yearEnd`.
   *
   * The cadence is named off the balance keys and not off the numbers they hold today: they have
   * already moved once (a 16-tick year became `ticksPerYear` 52 / `ticksPerSeason` 13) and are
   * expected to move again after playtesting, so a comment quoting the ticks goes stale in silence.
   *
   * If `hooks.onClockEvents` returns true the owner (C5/C6) handled everything and none of the below
   * runs — which is how the two lanes avoid becoming the same defect again.
   */
  private handleClockEvents(events: ClockEvent[], tickBefore: number): void {
    if (events.length === 0) return;
    if (this.hooks.onClockEvents?.(events, this) === true) return;

    for (const event of events) {
      if (event.t === "seasonBoundary") {
        this.runSeasonStep(event.seasonEnded);
      } else if (event.t === "yearBegin") {
        this.mapView.setYear(this.node, event.year);
        // {@link viewNote}, not the town's map note spelled out again: indoors the note describes
        // the ROOM the player is standing in, and this line overwrote it with the town's the moment
        // a year began — the same provenance line reading `PLACEHOLDER map` for a map that is not on
        // screen. Outdoors the two are the same string, which is why it went unseen; a year can turn
        // indoors because the inn's own [R] is the one action a room affords.
        this.lastNote = this.viewNote();
      }
    }
    this.mapView.setSeason(this.currentSeason());

    /*
     * build-doc §4 step 5 as amended — the year turn runs when the meter fills at
     * `clock.ticksPerYear`, and at nothing else. (The quote used to name tick 16; the meter's length
     * is a balance key and this line must not re-spell whatever number it holds.)
     * ONE trigger per action: `yearTurnTrigger` collapses the clock's `yearEnd` events, which is what
     * stopped a shell watching for §4's two triggers from firing two turns for one action. The turn
     * itself is core/lifecycle.ts's and its UX is game/scenes/YearTurnScene.ts's; this scene only
     * decides WHEN — and it never decides that the calendar has run out, because it cannot.
     */
    const trigger = yearTurnTrigger({ clock: this.clock(), events });
    if (trigger) this.beginYearTurn(trigger.endedYear, trigger.reason, tickBefore, trigger.carry);
  }

  /**
   * The run is over: say so, and hand it to whoever owns the ending — ONCE.
   *
   * An ACT condition (`core/acts.ts` `runIsComplete`), reached whenever the player earns it. It used
   * to be called from the year turn's own completion, because the run ended when the calendar did;
   * the calendar does not end. The year it happened in is reported because it is a real
   * fact about this playthrough, not because it was a deadline.
   *
   * ⚠ THE LATCH IS THE POINT. `runIsComplete` is a standing condition, not an edge: nothing clears
   * `story.greaves.beaten` and nothing takes a badge back, so re-testing it on every year turn fired
   * the ending once a year for ever — measured at three `onRunComplete` calls across three year
   * turns of one finished run, i.e. C7/C9's epilogue survey replaying annually. The latch is in the
   * SAVE (`RUN_COMPLETE_SHOWN_FLAG`), so a reload of a finished run does not replay it either, and
   * that is what makes it safe to ask this from every place the save may have changed.
   */
  private maybeCompleteRun(): void {
    /*
     * ⚠ THE CONDITION WAS `this.runIsOver()`, AND THAT FIRED THE ENDING A WHOLE BEAT TOO EARLY.
     *
     * `runIsComplete` returns true on `badgeCount >= gyms.length` as well as on the flag, and
     * `launchGymBattle`'s `onFinished` runs `winGym` — which reaches this through `advanceActs` —
     * BEFORE `playBattleOutcome` plays `greaves.finale.post`. So on the sixth badge this latched
     * with `story.greaves.beaten` still unwritten, before `sanctum.vellsire.approach` had been
     * offered and before either epilogue. Measured: awarding all six badges to a fresh save made
     * `runIsComplete` true while `story.greaves.beaten` was `undefined`.
     *
     * That is fatal for what the hook is FOR. `onRunComplete` carries Hard Req 7's epilogue survey,
     * whose whole subject is the difference the Vellsire choice made — and because the latch is
     * one-shot, firing it here reported the region BEFORE the choice and then never fired again:
     * `afterFinale` → `advanceActs` → here hits the `runCompleteShown` early return.
     *
     * The ending's own predicate is `story.epilogue.shown`, written by `maren.epilogue.caught` and
     * `maren.epilogue.released` — i.e. the run's last cutscene has actually played. `runIsOver()`
     * is unchanged and stays the ACT question it is (the HUD's "run complete", the act ladder).
     */
    if (!epilogueShown(this.save) || runCompleteShown(this.save)) return;
    this.save = markRunCompleteShown(this.save);
    this.flashBanner(`run complete · Y${String(this.save.year)} · act ${String(this.act())}`);
    this.hooks.onRunComplete?.(this.save, this);
    this.hooks.onSaveChanged?.(this.save, this);
  }

  /* ── the year turn (build-doc §4 step 5 / §7.5) ───────────────────────── */

  /**
   * Hand the year over: run the turn on the save as it stood in the ending year, then play it.
   *
   * The year turn also owes this year its FOURTH season step (build-doc §7.5 step 5) — which is why
   * `handleClockEvents` above steps the sim on `seasonBoundary` and never on `yearEnd`. Running both
   * inflates every six-year trajectory by 25%.
   */
  private beginYearTurn(
    endedYear: number,
    reason: YearEndReason,
    tickBefore: number,
    /*
     * THE WHOLE CARRY, BOTH NUMBERS. This used to be a bare `carryTick` and the fraction reached
     * `finishYearTurn` only because `driveYearTurn` falls back to `save.subTick` off the save handed
     * over — which is right for THIS caller (it hands over a save already standing on the
     * post-action clock) and wrong for one that hands over the save as it stood before the action.
     * Correct by accident is one refactor away from wrong: `yearTurnTrigger` reports both halves off
     * the one clock, so both halves travel.
     */
    carry: YearCarry,
  ): void {
    if (this.yearTurnRunning) return;

    /*
     * THE VERSION BOTH BRANCHES DESCEND FROM. The turn is a FORK of the save: it runs on
     * `atEndedYear` below and commits frames later, while `this.save` goes on moving in the
     * meantime — see {@link rebaseOntoYearTurn}, which is where the two are put back together and
     * where the reason this is kept is written out. Held before `atEndedYear` is built, because
     * `atEndedYear` is already a rewrite (of `year`/`tick`) and is therefore not the fork point.
     */
    const forkedFrom = this.save;

    // The save the turn runs on is the one that is still standing in the ending year: `spendTicks`
    // has already moved `save.year`/`save.tick` to where the clock now is.
    const atEndedYear: SaveEnvelope = { ...this.save, year: endedYear, tick: tickBefore };

    let drive: YearTurnDrive;
    try {
      /*
       * THE HEIR STREAM. `balance.rng.subsystemTags` declares "lifecycle" (added 2026-08-26 — until
       * then it declared exactly three, battle/sim/encounter, and this line composed its key out of
       * the SIM tag because build-doc §8.1's per-subsystem stream for the heir roll did not exist to
       * name). `core/lifecycle.ts` `heirStreamKey` checks the tag is really there before it is used.
       *
       * ⚠ THE KEY IS NOT SPELLED HERE ANY MORE, and it must never be spelled here again. While this
       * line composed it, two test harnesses that replicate the year turn — one of them the Legacy
       * demo-beat test — carried their own copy of the old `sim:heir:y<N>` and went on replaying a
       * stream the game had stopped using, green throughout. `heirStreamKey` is the single spelling;
       * those harnesses import it now.
       *
       * ⚠ IT IS STILL KEYED PER YEAR TURN, deliberately, and NOT a persistent "lifecycle" stream
       * opened by `streamFor`.
       * A persistent subsystem stream carries a POSITION, and the heir roll's position is the one
       * thing that must not depend on history: it used to be a CHILD of the live sim stream
       * (`deriveStream`), which cost the sim stream a draw per year turn and made every heir roll
       * depend on how many draws the ECOLOGY happened to have taken — the exact cross-coupling
       * `deriveStream`'s own header warns about — and it put the roll where neither core/save.ts
       * `replay` nor a mid-run reload could reproduce it. Keyed on (seed, subsystem, year) through
       * core/rng.ts's own `subsystemRng` (`hashSeed` + a fresh state), it is the same roll in a live
       * run, in a reloaded run and in a replay, and it moves no other stream by a single draw.
       */
      const heirStream = subsystemRng(this.save.seed, heirStreamKey(this.balance, endedYear));
      drive = driveYearTurn(atEndedYear, {
        content: this.content,
        simRng: this.streamFor(SIM_STREAM),
        lifecycleRng: () => heirStream.nextFloat(),
        endedYear,
        reason,
        carry,
        // The same context the three clock-boundary steps above use, so the year's four season steps
        // are all taken against one context rather than three against this one and a fourth against
        // core's memoised `defaultContext()`.
        context: this.simContext,
      });
    } catch (err) {
      this.flashBanner(`year ${endedYear} turn refused: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    const finish = (save: SaveEnvelope): void => {
      this.yearTurnRunning = false;
      /*
       * ⚠ NOT `this.save = save`. The turn commits a descendant of a save that was snapshotted
       * before it started, so a plain assignment throws away every write the live branch made while
       * the sequence held the screen — the odometer that was measured, and `syncEvents` /
       * `syncQuests` / `recordLineMet` / a fight still answering from its own scene besides.
       * {@link rebaseOntoYearTurn} carries the whole reason and the conflict rule.
       */
      this.save = rebaseOntoYearTurn(forkedFrom, this.save, save);
      this.node = this.nodeFile(this.save.currentNode);
      this.mapView.setYear(this.node, this.save.year);
      this.mapView.setSeason(this.currentSeason());
      /*
       * THE YEAR TURN MOVES BOTH THINGS THE WINDOWS ARE DERIVED FROM, so it republishes them. The
       * turn commits a save carrying the questFlags the year ENDED with — festival open — and it
       * takes the year's fourth season step, which moves every node's flora. Without this the
       * festival flag survived into the next spring and a bloom that closed at the turn stayed
       * published. The clock emits no `seasonBoundary` here by design, so nothing else would
       * have asked.
       */
      this.syncEvents();
      this.hudDirty = true;
      this.refreshHud();
      this.hooks.onSaveChanged?.(this.save, this);
      this.flashBanner(`year ${endedYear} ended (${reason}) → Y${String(this.save.year)}`);
      /*
       * NOT "the last year has turned". There is no last year and a year turn cannot make
       * a run complete — only an act condition can. It is asked here because another scene may have
       * written the finale flag while this one was paused, and it is safe to ask from anywhere
       * because {@link maybeCompleteRun} is latched in the save.
       */
      this.maybeCompleteRun();
    };

    /*
     * ASK BEFORE STARTING. `scene.launch` on an unregistered key warns to the console and does
     * nothing — which, with the turn already run and the seeded stream already advanced, would strand
     * the player in an overworld whose save has silently moved a year. If the sequence is not
     * registered the turn is still COMMITTED (headlessly, with core's own documented default for an
     * unanswered prompt) and the miss is said out loud.
     */
    if (!sceneRegistered(this, SCENE_KEYS.yearTurn)) {
      while (!drive.flow.done()) drive.flow.chooseHeir();
      // `drive.carry` — the whole position, the same seam `game/scenes/YearTurnScene.ts` `finish()`
      // commits the WATCHED turn through. This line was migrated first and that one was left on the
      // deprecated `carryTick` for a while, which is how one year turn came to have two commits that
      // read different halves of the same carry. There is no ticks-only spelling left to pick.
      finish(finishYearTurn(drive.flow.result(), drive.tickBefore, drive.carry));
      this.flashBanner(`year ${endedYear} ran headlessly — "${SCENE_KEYS.yearTurn}" is not registered`);
      return;
    }

    this.yearTurnRunning = true;
    const data: YearTurnSceneData = {
      drive,
      onDone: (save) => {
        this.scene.resume();
        finish(save);
      },
    };
    this.scene.launch(SCENE_KEYS.yearTurn, data);
    this.scene.pause();
  }

  /** build-doc §7.3 over the whole region, on the save's own `nodeStates` (§7.8: that IS the sim). */
  private runSeasonStep(season: Season): void {
    this.save = appendAction(this.save, { t: "seasonStep", season });
    const result = stepRegionStates(
      this.content.nodes,
      this.save.nodeStates,
      season,
      this.streamFor(SIM_STREAM),
      this.simContext,
    );
    this.save = { ...this.save, nodeStates: result.states };
  }

  /* ── travel ───────────────────────────────────────────────────────────── */

  /**
   * Put the player IN a node: adopt it, rebuild the view, and reset the room.
   *
   * Extracted from {@link travelTo} rather than copied, because {@link recoverFromBlackout} moves
   * the player too and a second spelling of "enter a node" is how one of them ends up missing the
   * camera bounds or the overlay redraw. It does NOT charge, refuse or play anything: travel's
   * adjacency check, its act gate and its tick belong to travel, and the blackout's price belongs
   * to the blackout. It does not clear the interior either — both callers settle that first, on
   * their own terms (`travelTo` refuses indoors; the blackout steps outside).
   *
   * ⚠ SYNCHRONOUS, AND THE ART IS THE CALLER'S. `ensureNodeArt` is the only thing about entering a
   * node that has to wait, and the two callers want to wait differently: travel holds the player on
   * the old map until the new one is decoded, while the blackout has a full-screen black narration
   * beat over the load and can adopt the node at once. Leaving the await inside would have forced
   * the blackout to finish in a microtask nobody holds — which is a real hazard and not only a test
   * inconvenience: between the save write and the microtask, `save.currentNode` and `this.node`
   * would name different nodes, which is exactly the half-swapped state `liveNode` and
   * {@link activeGrid} exist to prevent, and any travel keyed in that window would race it.
   */
  private enterNode(target: NodeFile): void {
    this.node = target;
    // A new room has its own conversation: what was said in the last one must not suppress a
    // line here (see `talkEntryFor`).
    this.spokenHere = new Set<string>();
    this.save = { ...this.save, currentNode: target.id };
    this.buildNodeView();
    this.applyCameraBounds();
    if (this.overlayVisible) drawCollisionOverlay(this.overlay, this.activeGrid(), this.balance);
    this.syncPlayerSprite();
  }

  /**
   * Move along the node adjacency graph, spending the one tick build-doc §3 L8 prices travel at.
   *
   * DEVIATION (reported, not silently taken): the node schema carries no exit or portal positions —
   * `props[]` is antler stones, shrines, idols and sign cards — so there is nothing in the data that
   * says where an edge of the map leads. Travel is therefore an explicit action keyed on
   * `adjacency`, not a walk-off-the-edge, and the HUD lists the destinations. A door prop kind would
   * change this, and that is a content decision, not one to invent here (G2).
   */
  async travelTo(nodeId: string): Promise<void> {
    if (this.travelling) return;
    /*
     * ⚠ REFUSED FROM INSIDE A BUILDING, AND THIS ONE IS NOT MERELY INCOHERENT — IT IS A BROKEN
     * STATE. `buildNodeView` below rebuilds the TOWN's geometry, but `interior`/`interiorGrid` and
     * `save.interiorId` would still name a room in the town just left: the player would be walking
     * an inn's floor plan over Route 1's map, with `save.currentNode` and `save.interiorId`
     * disagreeing about which building they are in. Clearing the interior here instead would make
     * a keypress teleport the player out of a door they never walked through.
     */
    if (this.interior !== null) {
      this.flashBanner(`${this.interior.name} — step outside to travel`);
      return;
    }
    if (!this.node.adjacency.includes(nodeId)) return;
    /*
     * ACT GATING. content-bible §6 lists the six towns and their routes in order and the
     * bible labels that column "Yr"; it is an ACT, and `balance.acts.gates` is where it lives. A
     * node whose act the player has not reached is not travelled to — which is the mechanism that
     * used to be the calendar's, and the reason the calendar could be decoupled without the region
     * opening all at once. A node no gate names is left open rather than closed: `core/acts.ts`
     * `ungatedNodeIds` reports that gap instead of this scene silently locking content (G2).
     *
     * ⚠ A GATE IS ONLY LEGITIMATE IF ITS KEY EXISTS. When this refusal was added, neither of the
     * ladder's two inputs had a writer in the shipped build — `story.opening.done` is dialogue's
     * and `winGym` had no caller — so it locked every new save inside Hearthollow for ever and took
     * build-doc §16's never-cut vertical slice with it. Both writers exist now ({@link openPrologue},
     * {@link challengeGym}); the gate stands because the ladder can be climbed, and if that ever
     * stops being true this refusal is the first thing that must go.
     */
    const needed = unlockActOf(nodeId, this.balance);
    if (needed !== null && this.act() < needed) {
      this.flashBanner(`${nodeId} opens in act ${String(needed)} · act ${String(this.act())}`);
      return;
    }
    const from = this.node.id;
    this.travelling = true;
    try {
      const target = this.nodeFile(nodeId);
      await ensureNodeArt(this, nodeArtKeys(target, this.save.year, this.balance));
      this.enterNode(target);
      this.spendTicks("travel", { t: "travel", to: target.id });
      this.hooks.onTravel?.(from, target.id, this);
      this.flashBanner(`travelled ${from} → ${target.id}`);
    } finally {
      this.travelling = false;
    }
    // A new node may have a cutscene waiting — the act arrivals and both Greaves beats are keyed on
    // one. Outside the `finally` so it runs with `travelling` already false, and after the tick has
    // been spent, so an arrival beat gated on a season reads the season the player arrived in.
    this.playPendingCutscene();
    // …and the rival may be standing on it (bible §8, "battles you each act"). AFTER the cutscene,
    // so an act arrival is not talked over by a fight; `challengeRival` stands down while a box is
    // open and the route is still there when it closes.
    this.challengeRival();
  }

  /* ── streams ──────────────────────────────────────────────────────────── */

  /**
   * The named subsystem stream (build-doc §8.1). Checked against `balance.rng.subsystemTags` rather
   * than assumed, so a renamed tag is a loud failure and not a silent fresh stream at draw zero.
   */
  streamFor(tag: string): Rng {
    if (!this.balance.rng.subsystemTags.includes(tag)) {
      throw new Error(`balance.rng.subsystemTags has no "${tag}" stream — the overworld needs it`);
    }
    const stream = this.streams[tag];
    if (!stream) throw new Error(`stream "${tag}" was never opened (core/save.ts openStreams)`);
    return stream;
  }

  /* ── HUD ──────────────────────────────────────────────────────────────── */

  private flashBanner(text: string): void {
    this.banner.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.banner);
    this.tweens.add({ targets: this.banner, alpha: 0.35, duration: BANNER_FADE_MS, delay: BANNER_HOLD_MS });
  }

  /**
   * G7: numbers only. Nothing here comments on what the player has done to a population; it prints
   * the count and the derived weight and stops.
   */
  private refreshHud(): void {
    // The meter IS the clock readout (L8). No second copy of the same three numbers in the text HUD.
    this.meterHud.render(seasonMeterModel(this.clock(), this.balance));
    // ONE resolution of the live node for the whole HUD: the table below and every count beside it
    // are read off the same object the encounter roll is about to be handed (see `liveNode`).
    const ctx = this.forayContext();
    const table = encounterTable(ctx);
    const active = table.filter((e) => e.active && e.weight > 0);
    const lines: string[] = [
      `${this.node.name} (${this.node.id}) · ${this.node.biome}`,
      `foray ${this.stepsSinceTick}/${stepsPerForay(this.balance)} steps · encounters ${this.encountersMet}`,
      // A door with nothing on screen pointing at it is a door nobody finds. Indoors this is the way
      // out; outdoors it is every way in. Identifiers and integers only (G7).
      ...this.doorLines(),
      `tile ${this.movement.tile.col},${this.movement.tile.row} facing ${this.movement.facing}`,
      `party ${this.save.party.length}/${this.balance.party.maxPartySize} · box ${this.save.box.length}`,
      `weight ${totalActiveWeight(table).toFixed(1)} over ${active.length}/${table.length} lines`,
    ];
    for (const entry of table) {
      const count = this.countOf(entry.lineId, this.node.id, ctx.node);
      // Four causes, not two. A gated Ancient sitting at a real count of 1 used to print the same
      // word as a line the player had wiped out (Hard Req 10 / bible §5) — see game/encounters.ts.
      const why = entry.active ? "" : ` (${absenceCauseOf(entry, count)})`;
      lines.push(`  ${entry.lineId}: ${count}${why}`);
    }
    if (this.lastEncounter) {
      lines.push(`last: ${this.lastEncounter.lineId} ${this.lastEncounter.age} L${this.lastEncounter.level}`);
    }
    if (this.spawnProblem) lines.push(this.spawnProblem);
    // Same channel, same reason: a mask the loader calls healthy can still put the player down
    // where the talk key is answered by a signpost, and nothing else on screen would say so.
    if (this.spawnInsideProp) lines.push(this.spawnInsideProp);
    // Hard Req 6 — the season reading is a runtime tint. `provisional` is on while its hues are a
    // placeholder rather than data (game/season-tint.ts), and it says so on screen for the same
    // reason the map placeholder does.
    const tint = this.mapView.tint;
    lines.push(`tint ${seasonTintLabel(tint)}${tint.provisional ? " · PROVISIONAL hues" : ""}`);
    lines.push(this.lastNote);
    /*
     * L8's three prices, and what the next one would DO — both read from core/clock.ts through
     * game/ui/SeasonMeter.ts (`actionCosts` runs `ticksForAction`; `previewAction` runs the REAL
     * transition on a copy). The HUD counts nothing itself, so a retune of `balance.clock` moves the
     * prices on screen and the world together (INV-3) — and the two functions that answer "what will
     * this cost and what will it cross", which nothing in the running game asked, are now on screen.
     */
    {
      const costs = actionCosts(this.balance);
      const next = previewAction(this.clock(), "foray", this.balance);
      const crossing = next.endsYear
        ? "ends the year"
        : next.seasonsCrossed.length > 0
          ? `ends ${next.seasonsCrossed.join(", ")}`
          : `${String(next.after.ticksLeftInSeason)} to the next season`;
      // FOUR prices, because L8 now has four. A fight costs `clock.battleTicks` at launch and the
      // HUD said so nowhere, which is how a price becomes invisible to the person paying it.
      lines.push(
        `ticks travel ${String(costs.travel)} · foray ${String(costs.foray)} · inn ${String(costs.inn)}` +
          ` · battle ${String(costs.battle)} · next foray ${crossing}`,
      );
    }
    // Two clocks on the HUD, side by side and never mixed: the act above, the year in the meter.
    lines.push(`act ${String(this.act())}${this.runIsOver() ? " · run complete" : ""}`);
    const open = this.openEvents();
    if (open.length > 0) {
      lines.push(
        `events ${open.map((w) => `${w.id} (${String(w.closesAt - w.openedAt)}t ${w.season})`).join(" · ")}`,
      );
    }
    this.node.adjacency.forEach((id, i) => {
      const needed = unlockActOf(id, this.balance);
      const shut = needed !== null && this.act() < needed;
      lines.push(`[${i + 1}] travel → ${id}${shut ? ` · act ${String(needed)}` : ""}`);
    });
    // The badge is the act ladder's only numeric input, so the key that earns one is on screen
    // beside the two that spend ticks — and the leader is NAMED, because a key with nothing behind
    // it reads exactly like a key that is not bound.
    const gym = gymAtNode(this.content, this.node.id);
    if (gym) {
      const problem = gymBattleProblem(this.save, gym, this.content);
      lines.push(
        `[G] challenge ${gym.name} (${gym.id}) · act ${String(gym.act)}${problem ? ` · ${problem}` : ""}`,
      );
    }
    /*
     * C7's readouts. Every one of these is a NUMBER or an IDENTIFIER (G7): what is in arm's reach,
     * how many quests are open, how many sign cards this node has yielded, which chains are closed
     * and how many of the corpus's owed flags are still owed. Nothing here says what any of it
     * means. It is a readout, not a verdict.
     */
    {
      // Indoors the town's props are out of reach by construction — `interact` does not ask for
      // them — so the HUD must not offer one either, or [E] promises something it will not do.
      const inside = this.interior;
      const prop = inside === null ? this.propUnderPlayer() : null;
      const props = propsOf(this.node);
      if (inside !== null) {
        const tile = this.movement.tile;
        const anchor = inside.anchors.find((a) => a.col === tile.col && a.row === tile.row);
        lines.push(
          `[E] ${anchor ? anchor.id : "nothing here"} · anchors ${String(inside.anchors.length)} in ${inside.id}`,
        );
      } else {
        lines.push(
          `[E] ${prop ? `read ${propLabel(prop)}` : "talk"} · props ${String(props.length)} here` +
            ` · cards ${String(new Set(linesMetAt(this.save, this.node.id)).size)}`,
        );
      }
      const reports = questReports(this.save, this.content);
      const open = reports.filter((r) => r.stage === "accepted" || r.stage === "open");
      const done = reports.filter((r) => r.stage === "done").length;
      lines.push(
        `quests ${String(done)}/${String(reports.length)} closed` +
          (open.length > 0 ? ` · open ${open.map((r) => `${r.id}${r.met ? "*" : ""}`).join(" ")}` : ""),
      );
      const chains = this.completedSignChains();
      lines.push(
        `chains ${chains.length > 0 ? chains.join(" ") : "none"}` +
          ` · flags owed ${String(stillOwed(this.save).length)}`,
      );
      const candidate = releaseCandidate(this.save, this.node.id);
      // Same reader as the key, so the advertisement cannot drift from the behaviour.
      lines.push(
        candidate
          ? `[X] release ${candidate.lineId} here`
          : `[X] ${releaseRefusal(this.save, this.node.id) ?? "release unavailable"}`,
      );
      if (this.lastSpoken.length > 0) lines.push(`said: ${this.lastSpoken}`);
    }
    /*
     * [R] IS ADVERTISED ONLY WHERE IT WORKS, on the terms the two context-dependent verbs above are:
     * [G] is absent at a node with no leader, and [X] prints the reason it would refuse. This line
     * promised the inn unconditionally — on a route, and at a shop counter — and while
     * {@link restAtInn} did not ask where the player was standing the HUD was accurately
     * advertising a defect. It is the SAME sentence the key prints, from the same reader
     * ({@link restRefusal}), so the readout and the refusal cannot drift apart.
     */
    const restHere = this.restRefusal(this.save.currentNode);
    lines.push(`[C] collision overlay · [R] ${restHere ?? "inn"}`);
    this.hud.setText(lines);
  }

  /* ── read-only accessors for the other lanes ──────────────────────────── */

  /** Cell rectangle in world space — the collision editor and C7's prop placement want this. */
  cellRect(col: number, row: number): { x: number; y: number } {
    return cellTopLeftWorld(this.collision.grid, col, row, this.balance);
  }

  /** Tile lattice size, for anything that wants to place something on the grid. */
  tiles(): { cols: number; rows: number } {
    return tileGridSize(this.balance);
  }

  /*
   * The three counters the HUD prints, exposed so a test can assert BEHAVIOUR rather than scrape the
   * rendered string. They are reads, not seams: nothing may set them from outside.
   */

  /** Wild creatures met since this scene instance was created. */
  encountersMetCount(): number {
    return this.encountersMet;
  }

  /** The last wild creature met, or null if none has been. */
  lastEncounterMet(): Encounter | null {
    return this.lastEncounter;
  }

  /** Completed tile steps since the last foray tick was charged (build-doc §4). */
  forayStepsSinceTick(): number {
    return this.stepsSinceTick;
  }

  /** True while a wild battle, the year-turn sequence or the dialogue box has the screen. */
  isHandedOver(): boolean {
    return this.battleRunning || this.yearTurnRunning || this.dialogueRunning;
  }

  /** True while the dialogue box has the screen. */
  isSpeaking(): boolean {
    return this.dialogueRunning;
  }

  /** The last line the player actually read, or "" before anything has been said. */
  lastLineSpoken(): string {
    return this.lastSpoken;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Presentation constants — not gameplay tunables (G11)
 * ──────────────────────────────────────────────────────────────────────────── */

const HUD_PAD = 6;
const HUD_LINE_PX = 12;
const BANNER_HOLD_MS = 1200;
const BANNER_FADE_MS = 400;
/**
 * Where the interior footprint sits in the display list: above the map (0), below the collision
 * overlay (10) and the player (20). Presentation, like every other depth in this file.
 */
const INTERIOR_DEPTH = 1;

/**
 * Where the blackout curtain sits: above the HUD (100) and the banner, because a black screen with
 * the diagnostics still legible on top of it is not one. Presentation, like every other depth here.
 */
const CURTAIN_DEPTH = 200;

/**
 * Where the L8 meter sits. Presentation only — the tick counts, the season boundaries and the pip
 * count are all `game/ui/SeasonMeter.ts`'s read of `balance.clock` (G11).
 */
const METER_STYLE: SeasonMeterStyle = { ...DEFAULT_SEASON_METER_STYLE, x: HUD_PAD, y: HUD_PAD };
/**
 * The corpus's own spelling for a sign chain's completion — `chain.<id>.complete`, written by the
 * last step of each of the three Ancient chains in `data/dialogue.json`. Flag-name grammar, not a
 * gameplay constant (G11), and the same shape `balance.acts.badgeFlagPrefix` uses for badges.
 */
const CHAIN_FLAG_PREFIX = "chain.";
const CHAIN_COMPLETE_SUFFIX = ".complete";

/** An error's sentence, for a banner. */
function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Interiors — the pure half, so it can be reasoned about without a scene
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * ONE PLAN CELL IS ONE MOVEMENT TILE — the identity every cell reference in a blueprint stands on,
 * checked rather than assumed.
 *
 * `core/interiors.ts` states it in prose ("collisionCellPx is 16, the world cell is 16 ×
 * mapRenderScale = 32, and tileStepPx is 32") and nothing enforced it: `gridConsistencyProblem`
 * relates `collisionCols`, `collisionCellPx` and `mapNativePx` and says nothing about `tileStepPx`.
 * A retune that moved the tile step off the world cell would leave every arrival cell, every anchor
 * and every doorway pointing at a tile the player never stands on — silently, because both numbers
 * would still be internally consistent. Returns the sentence, or null when they agree.
 */
function interiorCellProblem(balance: Balance): string | null {
  const worldCell = balance.map.collisionCellPx * balance.map.mapRenderScale;
  if (worldCell === balance.map.tileStepPx) return null;
  return (
    `balance.map: collisionCellPx × mapRenderScale = ${String(worldCell)}, not tileStepPx ` +
    `${String(balance.map.tileStepPx)} — one interior plan cell is no longer one movement tile`
  );
}

/** A plan cell as a movement tile. Same numbers; two vocabularies, joined in one place. */
function cellTile(cell: PlanCell): { col: number; row: number } {
  return { col: cell.col, row: cell.row };
}

/**
 * The plan's doorway cell. `core/interiors.ts` refuses any blueprint that does not draw exactly one
 * `D`, so `[0]` is the whole answer for shipped data; null is kept as a value so a caller cannot
 * dereference a hole from a hand-built blueprint.
 */
function planDoorCell(bp: InteriorBlueprint): PlanCell | null {
  return planCellsWith(bp.plan, PLAN_DOOR)[0] ?? null;
}

/**
 * The walk direction from one plan cell to an ADJACENT one, or null when they are not neighbours.
 *
 * Derived from `game/movement.ts`'s own `delta`, so the facing a door hands the player is spelled by
 * the same table that moves them. Deliberately NOT read off `InteriorDoor.facing`: the plan and that
 * field could drift, and the plan is what the player walks.
 */
function stepFacing(from: PlanCell, to: PlanCell): Direction | null {
  for (const dir of DIRECTIONS) {
    const step = delta(dir);
    if (from.col + step.dCol === to.col && from.row + step.dRow === to.row) return dir;
  }
  return null;
}

/**
 * The dialogue entry an anchor plays, or null.
 *
 * A `service` anchor names its entry outright — `core/interiors.ts` validates that the id is one of
 * the eleven shipped `kind:"service"` entries and that its speaker is homed to this town, so no
 * selector is needed and none is invented.
 *
 * A `speaker` anchor resolves THROUGH the service that faces them: `InteriorServiceAnchor.faces`
 * points at the fixture or the person the service is transacted with, and the blueprint's own
 * validation refuses a service that faces open floor. For all four shipped rooms this is the same
 * line either way — each of Aldis, Kett, Elsbet and Hild has exactly one entry in the whole corpus,
 * and it is their service.
 *
 * HANDOFF: `game/dialogue-runner.ts` — a general per-speaker selector (`selectEntry` across
 * `TALK_KINDS` for one speaker at one node) belongs beside `talkEntryFor`. Until it exists, a
 * speaker anchor nobody transacts with is silent, and this says so rather than guessing an entry.
 */
function interiorEntryId(bp: InteriorBlueprint, anchor: InteriorAnchor): string | null {
  if (anchor.kind === "service") return anchor.target;
  for (const other of bp.anchors) {
    if (other.kind !== "service") continue;
    const faced = stepFrom({ col: other.col, row: other.row }, other.faces);
    if (faced.col === anchor.col && faced.row === anchor.row) return other.target;
  }
  return null;
}

/**
 * The save with `interiorId` REMOVED, not set to undefined.
 *
 * `core/save.ts` `canonicalize` walks the object's own keys, so a key holding `undefined` would be
 * carried into the JSON as `null` or dropped depending on the walk — and `zSaveFileFor` would then
 * either refuse it or delete it. Absent is the outdoor state and there is no other spelling of it.
 */
function withoutInteriorId(save: SaveEnvelope): SaveEnvelope {
  if (save.interiorId === undefined) return save;
  const next: SaveEnvelope = { ...save };
  delete next.interiorId;
  return next;
}

/**
 * Put the year turn's commit back on top of a save that has moved underneath it.
 *
 * ⚠ THE YEAR TURN FORKS THE SAVE, AND THE FORK USED TO WIN OUTRIGHT. `beginYearTurn` snapshots
 * `atEndedYear` from `this.save` while it is still inside the `spendTicks` that ended the year, and
 * `finish(save)` — frames later, once the sequence has been watched — assigned that snapshot's
 * descendant straight over `this.save`. Every write the LIVE branch made in between was therefore
 * discarded, silently, whatever it was. `this.save = save` is a rebase, not an assignment.
 *
 * ⚠ THE WINDOW IS REACHABLE, and not only across the frames the sequence holds. `ScenePlugin.pause`
 * pauses nothing on the spot — it is `this.manager.queueOp('pause', …)`, drained at the top of the
 * NEXT frame — so the rest of the current `update()` runs after the turn has begun. Measured
 * instance: [R] pressed on the frame a tile step lands ends the year and then walks the step into
 * `onStepCompleted`, whose `forayStepsSinceTick` write landed in the window; the scene read 48 and
 * the save read 47, so a player who quit before their next step lost the banked walk. That is one
 * writer of several. `spendTicks` finishes with `syncEvents` + `syncQuests` AFTER `handleClockEvents`
 * has begun the turn, so two writes land in this window on EVERY watched year turn; `recordLineMet`
 * lands there on a step that met a line; and a fight or a dialogue that was already on screen when
 * the turn began answers into it from its own scene. Naming the odometer here would have fixed the
 * instance and left the class.
 *
 * A THREE-WAY MERGE ON TOP-LEVEL KEYS, which is what makes it general: `forkedFrom` is the version
 * both branches descend from, so a key the live branch moved and the turn did not is the live
 * branch's, and everything else is the turn's. Reference equality is the whole test and it is exact
 * here because every writer in this scene replaces `this.save` with a fresh object rather than
 * mutating one — a key nobody touched still holds the very object `forkedFrom` holds.
 *
 * ⚠ WHERE BOTH BRANCHES MOVED A KEY, THE TURN WINS, deliberately. The turn owns `nodeStates` (§7.8:
 * that IS the sim), `party`/`box` (§7.5's aging and retirement) and the clock, and letting a stale
 * live value beat the turn's own commit would lose the cascade and the fourth season step — a worse
 * defect than the one this exists to fix. It also settles `actionLog`, which is the one key L10
 * turns on: `appendYearTurn` always appends the turn's entries, so the turn's log is always the one
 * that survives and `core/save.ts` `replay` still sees a gapless sequence it can reproduce.
 *
 * ⚠ `questFlags` IS MERGED A KEY AT A TIME, and that is not a special case for a field — it is what
 * the field IS. core/lifecycle.ts calls it "the save's own extensible bag (build-doc §7.8)": its
 * keys are independent facts, not one fact, and it is where almost everything that writes in this
 * window writes — `syncEvents`, `syncQuests`, `recordLineMet`'s sign cards, the act flags, the badge
 * flags, every `story.*` a dialogue sets. The turn stakes a claim on exactly ONE of those keys
 * (`core/lifecycle.ts` `YEAR_TURN_FLAG`), so resolving the bag as a single unit would hand the turn
 * every fact in it and lose the lot. Resolved per key, the turn keeps its own flag and nothing else
 * moves. Merged {@link rebaseYearTurnFlags}.
 */
function rebaseOntoYearTurn(
  forkedFrom: SaveEnvelope,
  live: SaveEnvelope,
  committed: SaveEnvelope,
): SaveEnvelope {
  // The common case and the headless one: nothing wrote while the turn ran, so there is no merge to
  // do and the committed save is handed back as the very object the turn built.
  if (live === forkedFrom) return committed;
  let merged: SaveEnvelope = committed;
  for (const key of Object.keys(live) as Array<keyof SaveEnvelope>) {
    // The bag is resolved below, per fact rather than per field.
    if (key === "questFlags") continue;
    const liveMoved = live[key] !== forkedFrom[key];
    const turnMoved = committed[key] !== forkedFrom[key];
    if (liveMoved && !turnMoved) merged = { ...merged, [key]: live[key] };
  }
  const questFlags = rebaseYearTurnFlags(forkedFrom.questFlags, live.questFlags, committed.questFlags);
  return questFlags === merged.questFlags ? merged : { ...merged, questFlags };
}

/**
 * The same three-way merge, one flag at a time — see {@link rebaseOntoYearTurn} for why the bag is
 * resolved per key and not as a unit.
 *
 * A flag the live branch DELETED is not carried across: only keys present in `live` are considered,
 * so a deletion loses to whatever the turn holds. That is deliberate and it is also harmless here,
 * because the only deleter is `core/regional-events.ts` `syncEventFlags` (it rebuilds the bag
 * without its own published window booleans) and `beginYearTurn`'s `finish` re-runs `syncEvents` on
 * the MERGED save immediately after this returns, which drops them again. Carrying deletions across
 * generally would let a stale live branch delete a flag the turn had just written.
 */
function rebaseYearTurnFlags(
  forkedFrom: SaveFile["questFlags"],
  live: SaveFile["questFlags"],
  committed: SaveFile["questFlags"],
): SaveFile["questFlags"] {
  if (live === forkedFrom) return committed;
  let merged = committed;
  for (const [flag, value] of Object.entries(live)) {
    const liveMoved = value !== forkedFrom[flag];
    const turnMoved = committed[flag] !== forkedFrom[flag];
    if (!liveMoved || turnMoved) continue;
    if (merged === committed) merged = { ...committed };
    merged[flag] = value;
  }
  return merged;
}

const HUD_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "ui-monospace, Menlo, Consolas, monospace",
  fontSize: "10px",
  color: "#e8f0e0",
  backgroundColor: "#0d0f0ccc",
  padding: { x: 4, y: 3 },
};

const BANNER_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "ui-monospace, Menlo, Consolas, monospace",
  fontSize: "11px",
  color: "#ffe9b0",
  backgroundColor: "#0d0f0ccc",
  padding: { x: 5, y: 3 },
};

/**
 * `readMaskPixels` wrapped so a browser without a 2D context, or a headless run, degrades to the
 * synthesised grid rather than throwing during `create()`.
 */
function readMaskPixelsSafe(scene: Phaser.Scene, maskKey: string): MaskPixels | null {
  try {
    return readMaskPixels(scene, maskKey);
  } catch {
    return null;
  }
}

export default OverworldScene;
