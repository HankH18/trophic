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
  Content,
  GameAction,
  GymLeader,
  NodeFile,
  RivalEncounter,
  Season,
} from "../../core/types";
import {
  cellTopLeftWorld,
  chooseSpawnTile,
  gridConsistencyProblem,
  loadCollision,
  tileGridSize,
  tileWalkable,
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
  applyWildBattleOutcome,
  buildWildBattle,
  liveNodeOf,
  wildBattleProblem,
} from "../wild-battle";
import {
  MapView,
  drawCollisionOverlay,
  ensureNodeArt,
  nodeArtKeys,
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
import {
  actEntryBeats,
  beatLines,
  driveYearTurn,
  finishYearTurn,
  yearTurnTrigger,
  type YearTurnDrive,
  type YearTurnSceneData,
} from "./YearTurnScene";
import {
  chooseDirection,
  createMovement,
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
   * runs none of its own defaults — which is the seam that stops the season being stepped twice
   * (the integration defect I4 in LANE-A-STATUS §7, in its cross-lane form).
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
   * reads that file (docs/QUEUED-CHANGES.md Q7). Measured on a brand-new save through the real
   * scene: act 0, `unlockedNodeIds` = `["hearthollow"]`, `travelTo("r1")` REFUSED. The act gate on
   * travel had turned an open region into one the player could not leave. Absent this hook the
   * scene writes {@link core/acts.prologueExitFlags} once the starter is in hand and SAYS SO on
   * screen — the same declared stand-in `game/boot.ts` `startingParty` already ships for the
   * starter itself (docs/DEVIATIONS-lane-c2.md C2-D6), and it switches off the moment a lane takes
   * this hook.
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
   * is gone with the six-year cap it enforced (D-Q3-1).
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

  private hooks: OverworldHooks = {};
  private startNodeId: string | null = null;
  private msPerTile: number | undefined;
  private simContext!: SimContext;

  private player!: Phaser.GameObjects.Image;
  private overlay!: Phaser.GameObjects.Graphics;
  private overlayVisible = false;
  private hud!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  /** The L8 16-pip meter (game/ui/SeasonMeter.ts) — the one readout of the clock on this screen. */
  private meterHud!: SeasonMeterHud;
  /** True while the year-turn sequence has the screen; this scene is paused and spends no ticks. */
  private yearTurnRunning = false;
  /** True while a wild battle has the screen. Same contract as `yearTurnRunning`. */
  private battleRunning = false;
  /** True while the dialogue box has the screen. Same contract again. */
  private dialogueRunning = false;
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

  /** Movement steps since the last foray tick was charged (build-doc §7.2 / DEVIATIONS D18). */
  private stepsSinceTick = 0;
  private encountersMet = 0;
  private lastEncounter: Encounter | null = null;
  private lastNote = "";
  private travelling = false;
  private hudDirty = true;
  /**
   * The node the CURRENT view was built for. `buildNodeView` respawns the player only when this
   * changes — see its header for the teleport-on-every-ESC defect that made it necessary.
   */
  private viewNodeId: string | null = null;
  /** Non-null when the player is standing somewhere they should not be able to stand. Printed. */
  private spawnProblem: string | null = null;
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

    this.node = this.nodeFile(this.save.currentNode);
    this.movementCfg = movementConfig(this.balance, this.msPerTile);

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
    if (this.overlayVisible) drawCollisionOverlay(this.overlay, this.collision.grid, this.balance);

    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.mapView.worldWidth, this.mapView.worldHeight);
    camera.startFollow(this.player, true);

    // L8's season meter is HUD, not a menu: it is on screen while the overworld is. The widget is
    // game/ui/SeasonMeter.ts's — this scene used to print `year N · tick t/16 · season` as plain
    // text instead, which is a second readout of the same clock and left the 16-pip meter L8 names
    // mounted nowhere in the game.
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
     * BOTH CLOCKS ARE BROUGHT UP TO DATE BEFORE THE FIRST FRAME (D-Q2-2 / D-Q3-1) — AND AFTER THE
     * BANNER EXISTS.
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
   * `game/boot.ts` belong to another stream in this wave (logged as **D-Q7-1** in
   * docs/DEVIATIONS.md). Until then, the alternative was shipping the whole authored corpus behind
   * a scene key nothing had registered, which is precisely the failure `game/main.ts`'s own header
   * warns about: "a scene that is not in this list does not exist" — the year turn and the
   * retirement card were built, tested and left unregistered, and the never-cut Legacy beat was
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
   * at (D-Q3-1), and the mask does not care.
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

    const spawn = chooseSpawnTile(this.collision.grid, this.balance);
    this.spawnProblem = spawn.problem;

    const standing: MovementState | undefined = this.movement;
    const sameNode = this.viewNodeId === this.node.id;
    if (standing !== undefined && sameNode && this.canEnter(standing.tile)) {
      // Same node, still a legal tile: keep the position and the foray progress. `placeAt` drops any
      // step in flight, which is right — the tween belongs to a frame loop that has been torn down.
      this.movement = placeAt(standing, standing.tile, standing.facing);
    } else {
      this.movement = standing !== undefined ? placeAt(standing, spawn.tile) : createMovement(spawn.tile);
      this.stepsSinceTick = 0;
    }
    this.viewNodeId = this.node.id;

    this.lastNote = `${this.mapView.status.note} · ${this.collision.note}`;
    this.hudDirty = true;
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

  /** The one walkability question, asked of the packed bitfield (build-doc §7.6). */
  canEnter(tile: { col: number; row: number }): boolean {
    return tileWalkable(this.collision.grid, tile.col, tile.row, this.balance);
  }

  private syncPlayerSprite(): void {
    const pos = spriteWorldPosition(this.movement, this.movementCfg);
    this.player.setPosition(pos.x, pos.y);
  }

  private toggleOverlay(): void {
    this.overlayVisible = !this.overlayVisible;
    this.overlay.setVisible(this.overlayVisible);
    this.hudDirty = true;
    if (this.overlayVisible) drawCollisionOverlay(this.overlay, this.collision.grid, this.balance);
  }

  /* ── the foray ────────────────────────────────────────────────────────── */

  /**
   * A completed tile step IS a foray step (build-doc §4 / DEVIATIONS D18): it rolls an encounter at
   * `balance.encounter.encounterChancePerStep`, and every `stepsPerForay` of them charges the one
   * tick §3 L8 prices a foray at.
   */
  private onStepCompleted(): void {
    /*
     * NO CALENDAR GUARD. A refusal used to stand here too — the encounter roll was skipped once
     * `isOver` was true, "so nothing is drawn from the encounter stream in a year the game does not
     * have". Every year is a year the game has (D-Q3-1).
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
    if (this.stepsSinceTick >= stepsPerForay(this.balance)) {
      this.stepsSinceTick = 0;
      this.spendTicks("foray", { t: "foray", nodeId: this.node.id });
    }

    if (encounter) {
      // The hook is an override; without one the scene fights it (see OverworldHooks.onEncounter).
      if (this.hooks.onEncounter) this.hooks.onEncounter(encounter, this);
      else this.beginWildBattle(encounter);
    }
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

    this.battleRunning = true;
    this.scene.launch(SCENE_KEYS.battle, data);
    this.scene.pause();
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

    const applied = applyWildBattleOutcome({
      save: this.save,
      content: this.content,
      state: result.state,
      ctx,
      caught: result.caught,
    });
    if (!applied) {
      this.flashBanner(`${encounter.lineId} — ${result.state.outcome ?? "unresolved"}`);
      return;
    }
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

  /* ── C7: the corpus, played (build-doc §15 C7 / QUEUED-CHANGES Q7) ────────── */

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
  playPendingCutscene(): void {
    if (this.isHandedOver() || this.travelling) return;
    const entry = this.tryDialogue(() => autoplayEntryFor(DIALOGUE, this.node.id, this.dialogueCtx()));
    if (!entry || this.autoplayed.has(entry.id)) return;
    this.autoplayed.add(entry.id);
    this.playEntry(entry.id, entry.speaker);
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

    const finish = (state: DialogueRunState): void => {
      this.dialogueRunning = false;
      if (then) this.afterDialogue = then;
      this.finishDialogue(state, who);
    };

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
      finish(state);
      if (state.choicesTaken.length > 0) {
        this.flashBanner(`${entryId} played headlessly · ${state.choicesTaken.map((c) => c.text).join(" / ")}`);
      }
      return;
    }

    const data: DialogueSceneData = {
      entryId,
      file: DIALOGUE,
      onDone: (state) => {
        this.scene.resume();
        finish(state);
      },
    };
    this.dialogueRunning = true;
    this.scene.launch(SCENE_KEYS.dialogue, data);
    this.scene.pause();
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
    const candidate = releaseCandidate(this.save);
    if (!candidate) {
      this.flashBanner(`no release: the party would be empty`);
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
   * DEVIATION (**D-Q7-3**): the explicit form is a `signChain` field on `SpeciesLine`, which is a
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
    return { year: this.save.year, tick: this.save.tick };
  }

  currentSeason(): Season {
    return seasonOf(this.clock(), this.balance);
  }

  /**
   * The run's final beat is behind the player — `core/acts.ts` `runIsComplete` of this save.
   *
   * ⚠ THIS USED TO BE A DATE. It read `core/clock.ts` `isOver` — "the calendar has passed year 6" —
   * and it gated ticks, encounter rolls and the year turn on it, so the game had a deadline nobody
   * designed (D-Q3-1). It is an ACT condition now: the finale fires whenever the player earns it,
   * and a player who never earns it plays forever. Nothing here refuses a tick.
   */
  runIsOver(): boolean {
    return runIsComplete(this.save, this.content.gyms, this.balance);
  }

  /** The act this save is in — badges and quest flags, never the calendar (`core/acts.ts`). */
  act(): number {
    return actOf(this.save, this.content.gyms, this.balance);
  }

  /** bible §9's regional events open right now — each one a 4-tick season window (D-Q2-2). */
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
   */
  restAtInn(townId: string = this.save.currentNode): void {
    if (this.isHandedOver() || this.travelling) return;
    this.spendTicks("inn", { t: "inn", townId });
    this.flashBanner(`inn at ${townId} · ${String(actionCosts(this.balance).inn)} ticks`);
  }

  /**
   * A gym win: a BADGE, and the act it may advance. It does NOT end the year (D-Q2-1).
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
        // A badge on a WIN and on nothing else — `gymBattleWon` enumerates the outcome rather than
        // reading "not a loss", so a fled fight is not a badge.
        const won = gymBattleWon(result.state);
        if (won) this.winGym(gym.id);
        else this.flashBanner(`${gym.id} — ${result.state.outcome ?? "unresolved"}`);
        // …and THEN the leader answers it. See `playBattleOutcome` for why this order is not free.
        this.playBattleOutcome(gym.id, gym.town, won);
      },
    };

    this.battleRunning = true;
    this.scene.launch(SCENE_KEYS.battle, data);
    this.scene.pause();
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
        const won = rivalBattleWon(result.state);
        this.flashBanner(`${rival.id} act ${String(rival.act)} — ${result.state.outcome ?? "unresolved"}`);
        // The entry writes `rival.act<N>.fought` on a WIN only, so a loss leaves the encounter
        // standing — which is what `wick.act6.loss` promises in words ("Come back when your team has
        // slept") and what it could not do while the loss closed itself.
        this.playBattleOutcome(rival.id, rival.node, won);
      },
    };

    this.battleRunning = true;
    this.scene.launch(SCENE_KEYS.battle, data);
    this.scene.pause();
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
        this.afterFinale();
      },
    };

    this.battleRunning = true;
    this.scene.launch(SCENE_KEYS.battle, data);
    this.scene.pause();
  }

  /** Adopt the resolution and let the corpus answer it — one of the two epilogues is now eligible. */
  private afterFinale(): void {
    this.syncQuests();
    this.advanceActs();
    this.syncEvents();
    this.hudDirty = true;
    this.refreshHud();
    this.hooks.onSaveChanged?.(this.save, this);
    this.playPendingCutscene();
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
   * Nothing in `game/` read that file (docs/QUEUED-CHANGES.md Q7), so measured through the real
   * scene on a brand-new save: act 0, one unlocked node, `travelTo("r1")` refused. The act gate on
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
   * Republish bible §9's open event windows into the save's quest flags (D-Q2-2).
   *
   * `data/dialogue.json` gates on `event.festival.open` and nothing has ever written it. This is
   * that writer.
   *
   * ⚠ CALLED AFTER EVERY TICK SPEND, not "at every season boundary and every act entry". That
   * sentence stood here and it was wrong by one moment — the most important one. `core/clock.ts`
   * `advance` deliberately emits NO `seasonBoundary` on the year-filling tick (integration defect
   * I4), so a scene syncing only inside the `seasonBoundary` arm never re-synced at the year turn:
   * measured, `event.festival.open` stayed true for **8 consecutive ticks** — the whole final season
   * of year N plus the whole first season of year N+1 — against a 4-tick window, with the festival's
   * dialogue firing in spring. Deleting that one call site turned ZERO tests red, because the suite
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
   * Spend one action's ticks (travel 1 / foray 1 / inn 2) through core/clock.ts, log the action, and
   * deal with whatever boundary it crossed.
   */
  private spendTicks(kind: ClockActionKind, action: GameAction): void {
    if (this.yearTurnRunning) return;
    /*
     * NO GUARD ON THE CALENDAR. A refusal used to stand here — `if (this.runIsOver()) return` over
     * `core/clock.ts` `isOver` — so the game stopped accepting player actions once the calendar
     * passed year 6. There is no year 6 (D-Q3-1): the calendar is unbounded, ticks are always spent,
     * and a player standing in year 20 forays exactly as one in year 2 does.
     */
    this.save = appendAction(this.save, action);
    // The tick the action STARTED on, kept because the year turn has to be handed a save that is
    // still standing in the year the clock is about to end (build-doc §7.5 runs on year N and
    // returns year N+1). Advancing first and reverting later would run the turn a year late.
    const tickBefore = this.save.tick;
    const advanced = advanceAction(this.clock(), kind, this.balance);
    this.save = { ...this.save, year: advanced.clock.year, tick: advanced.clock.tick };
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
   * ⚠ THE SEAM MOST LIKELY TO BE RE-BROKEN (LANE-A-STATUS §5). `seasonBoundary` fires at ticks 4, 8
   * and 12 only; the year's FOURTH season step belongs to `runYearTurn` (build-doc §7.5 step 5).
   * Running the sim on both cues ran five seasons a year and inflated every six-year trajectory by
   * 25%. So: this scene steps the sim on `seasonBoundary` and never on `yearEnd`.
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
        this.lastNote = `${this.mapView.status.note} · ${this.collision.note}`;
      }
    }
    this.mapView.setSeason(this.currentSeason());

    /*
     * build-doc §4 step 5 as amended — "At tick 16 the year turn runs", and at nothing else (D-Q2-1).
     * ONE trigger per action: `yearTurnTrigger` collapses the clock's `yearEnd` events, which is what
     * stopped a shell watching for §4's two triggers from firing two turns for one action. The turn
     * itself is core/lifecycle.ts's and its UX is game/scenes/YearTurnScene.ts's; this scene only
     * decides WHEN — and it never decides that the calendar has run out, because it cannot.
     */
    const trigger = yearTurnTrigger({ clock: this.clock(), events });
    if (trigger) this.beginYearTurn(trigger.endedYear, trigger.reason, tickBefore, trigger.carryTick);
  }

  /**
   * The run is over: say so, and hand it to whoever owns the ending — ONCE.
   *
   * An ACT condition (`core/acts.ts` `runIsComplete`), reached whenever the player earns it. It used
   * to be called from the year turn's own completion, because the run ended when the calendar did;
   * the calendar does not end (D-Q3-1). The year it happened in is reported because it is a real
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
   * is integration defect I4 (LANE-A-STATUS §7), a 25% inflation of every six-year trajectory.
   */
  private beginYearTurn(
    endedYear: number,
    reason: YearEndReason,
    tickBefore: number,
    carryTick: number,
  ): void {
    if (this.yearTurnRunning) return;

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
        carryTick,
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
      this.save = save;
      this.node = this.nodeFile(this.save.currentNode);
      this.mapView.setYear(this.node, this.save.year);
      this.mapView.setSeason(this.currentSeason());
      /*
       * THE YEAR TURN MOVES BOTH THINGS THE WINDOWS ARE DERIVED FROM, so it republishes them. The
       * turn commits a save carrying the questFlags the year ENDED with — festival open — and it
       * takes the year's fourth season step, which moves every node's flora. Without this the
       * festival flag survived into the next spring and a bloom that closed at the turn stayed
       * published. The clock emits no `seasonBoundary` here by design (I4), so nothing else would
       * have asked.
       */
      this.syncEvents();
      this.hudDirty = true;
      this.refreshHud();
      this.hooks.onSaveChanged?.(this.save, this);
      this.flashBanner(`year ${endedYear} ended (${reason}) → Y${String(this.save.year)}`);
      /*
       * NOT "the last year has turned". There is no last year (D-Q3-1) and a year turn cannot make
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
      finish(finishYearTurn(drive.flow.result(), drive.tickBefore, drive.carryTick));
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
    if (!this.node.adjacency.includes(nodeId)) return;
    /*
     * ACT GATING (D-Q3-1). content-bible §6 lists the six towns and their routes in order and the
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
      this.node = target;
      // A new room has its own conversation: what was said in the last one must not suppress a
      // line here (see `talkEntryFor`).
      this.spokenHere = new Set<string>();
      this.save = { ...this.save, currentNode: target.id };
      this.buildNodeView();
      this.cameras.main.setBounds(0, 0, this.mapView.worldWidth, this.mapView.worldHeight);
      if (this.overlayVisible) drawCollisionOverlay(this.overlay, this.collision.grid, this.balance);
      this.syncPlayerSprite();
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
      lines.push(
        `ticks travel ${String(costs.travel)} · foray ${String(costs.foray)} · inn ${String(costs.inn)}` +
          ` · next foray ${crossing}`,
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
      const prop = this.propUnderPlayer();
      const props = propsOf(this.node);
      lines.push(
        `[E] ${prop ? `read ${propLabel(prop)}` : "talk"} · props ${String(props.length)} here` +
          ` · cards ${String(new Set(linesMetAt(this.save, this.node.id)).size)}`,
      );
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
      const candidate = releaseCandidate(this.save);
      lines.push(candidate ? `[X] release ${candidate.lineId} here` : "[X] release · party would be empty");
      if (this.lastSpoken.length > 0) lines.push(`said: ${this.lastSpoken}`);
    }
    lines.push("[C] collision overlay · [R] inn");
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

  /** Completed tile steps since the last foray tick was charged (build-doc §4 / DEVIATIONS D18). */
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
