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
import type { Balance, Content, GameAction, GymLeader, NodeFile, Season } from "../../core/types";
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
import { enterPendingActs } from "../../core/lifecycle";
import { activeWindows, syncEventFlags } from "../../core/regional-events";
import { buildGymBattle, gymAtNode, gymBattleProblem, gymBattleWon } from "../gym-battle";
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

/* ────────────────────────────────────────────────────────────────────────────
 * Seams
 * ──────────────────────────────────────────────────────────────────────────── */

export interface OverworldHooks {
  /**
   * A wild creature was met. OVERRIDE, not the wiring: when this is absent the scene launches the
   * battle itself ({@link OverworldScene.beginWildBattle}) and applies the catch through
   * `game/wild-battle.ts`, so the catch→ledger loop is reachable by playing.
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
   * This is the seam the ending hangs off (Hard Req 7's epilogue ledger, the Vellsire choice). Until
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

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private dirKeys: Array<{ dir: Direction; keys: Phaser.Input.Keyboard.Key[] }> = [];
  private overlayKey?: Phaser.Input.Keyboard.Key;
  private innKey?: Phaser.Input.Keyboard.Key;
  private gymKey?: Phaser.Input.Keyboard.Key;
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
    this.advanceActs();
    this.syncEvents();

    this.bindKeys();
    this.syncPlayerSprite();
    this.refreshHud();
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
   * through here — the encounter roll, the HUD's ledger lines, the encounter banner. It used to be
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
    this.hooks.onSaveChanged?.(this.save, this);
    this.refreshHud();
    this.flashBanner(
      `caught ${encounter.lineId} at ${encounter.nodeId} — ${applied.before} → ${applied.after}`,
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
    const unlocked = this.unlockedSignChains();
    if (unlocked.size > 0) ctx.unlockedSignChains = unlocked;
    return ctx;
  }

  /**
   * Sign-chains the player has completed (bible §4 gates the Ancients behind them). C7 owns the
   * chains; until then the set is empty, which is the correct year-1 state — and it means the
   * finale legendary cannot roll as an ordinary wild encounter.
   */
  private unlockedSignChains(): ReadonlySet<string> {
    const out = new Set<string>();
    for (const [flag, value] of Object.entries(this.save.questFlags)) {
      if (value === true && flag.startsWith(SIGN_CHAIN_FLAG_PREFIX)) {
        out.add(flag.slice(SIGN_CHAIN_FLAG_PREFIX.length));
      }
    }
    return out;
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
        if (gymBattleWon(result.state)) this.winGym(gym.id);
        else this.flashBanner(`${gym.id} — ${result.state.outcome ?? "unresolved"}`);
      },
    };

    this.battleRunning = true;
    this.scene.launch(SCENE_KEYS.battle, data);
    this.scene.pause();
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
   * Open the prologue when nothing else will — the act ladder's first rung, and the one that had no
   * writer in the shipped build.
   *
   * `balance.acts.gates` opens act 1 on `story.opening.done`, written only by `data/dialogue.json`,
   * which nothing in `game/` reads (docs/QUEUED-CHANGES.md Q7). Measured through the real scene on
   * a brand-new save: act 0, one unlocked node, `travelTo("r1")` refused — the act gate on travel
   * had made build-doc §16's never-cut vertical slice unreachable by playing.
   *
   * So the scene stands in, on the same terms `game/boot.ts` `startingParty` already stands in for
   * the starter itself (docs/DEVIATIONS-lane-c2.md C2-D6): only when no lane has taken
   * {@link OverworldHooks.onOpeningBeat}, only once the prologue's shipped content has actually
   * been handed over (a creature is in the party — bible §6's Hearthollow is "starter choice,
   * bait-crafting intro, tutorial forage"), never inventing a flag NAME (they are read out of
   * `balance.acts.gates` by `prologueExitFlags`), and always out loud. When C7's opening chain
   * lands it writes those flags itself and this is simply not reached.
   */
  private openPrologue(): void {
    // Asked only while the rung is actually unclimbed, so a lane owning the beat is not re-asked
    // once its own flags are written and the question has no answer left to give.
    const flags = prologueExitFlags(this.balance).filter((f) => this.save.questFlags[f] !== true);
    if (flags.length === 0) return;
    if (this.hooks.onOpeningBeat?.(this) === true) return;
    if (this.save.party.length === 0) {
      this.flashBanner(`act ${String(this.act())} · prologue open · ${flags.join(" ")} unwritten`);
      return;
    }
    this.save = setQuestFlags(this.save, flags);
    console.info(
      `[overworld] no opening beat yet — granting ${flags.join(", ")} so the act ladder can be ` +
        `climbed. Lane C7's opening chain replaces this by taking OverworldHooks.onOpeningBeat.`,
    );
    this.flashBanner(`opening beat stood in · ${flags.join(" ")} · act ${String(this.act())}`);
    this.hooks.onSaveChanged?.(this.save, this);
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
   * turns of one finished run, i.e. C7/C9's epilogue ledger replaying annually. The latch is in the
   * SAVE (`RUN_COMPLETE_SHOWN_FLAG`), so a reload of a finished run does not replay it either, and
   * that is what makes it safe to ask this from every place the save may have changed.
   */
  private maybeCompleteRun(): void {
    if (!this.runIsOver() || runCompleteShown(this.save)) return;
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
       * ⚠ THERE IS NO "lifecycle" SUBSYSTEM STREAM. `balance.rng.subsystemTags` declares exactly
       * three — battle, sim, encounter — so build-doc §8.1's per-subsystem stream for the heir roll
       * does not exist to open, and adding one needs data/balance.json + core/types.ts +
       * core/schemas.ts in one change (core/ is not this lane's to edit). Reported as a blocker.
       *
       * Until it exists, the heir rolls come from a stream keyed on (save seed, year turn) —
       * core/rng.ts's own `subsystemRng`, i.e. `hashSeed` + a fresh state, with the tag composed
       * from the sim tag so it is legibly parented. It used to be a CHILD of the live sim stream
       * (`deriveStream`), which cost the sim stream a draw per year turn and made every heir roll
       * depend on how many draws the ECOLOGY happened to have taken — the exact cross-coupling
       * `deriveStream`'s own header warns about, and it put the roll's position where neither
       * core/save.ts `replay` nor a mid-run reload could reproduce it. Keyed on the seed and the
       * year, it is the same roll in a live run, in a reloaded run, and in a replay, and it moves no
       * other stream by a single draw.
       */
      const heirStream = subsystemRng(this.save.seed, `${SIM_STREAM}:heir:y${String(endedYear)}`);
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
   * G7: numbers only. The ledger is the moral — nothing here comments on what the player has done to
   * a population; it prints the count and the derived weight and stops.
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

  /** True while a wild battle or the year-turn sequence has the screen. */
  isHandedOver(): boolean {
    return this.battleRunning || this.yearTurnRunning;
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
/** Quest-flag prefix a completed sign chain sets. C7 owns the chains; this reads them. */
const SIGN_CHAIN_FLAG_PREFIX = "signChain:";

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
