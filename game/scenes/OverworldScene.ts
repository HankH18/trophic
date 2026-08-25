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
  type ClockEvent,
  type ClockState,
} from "../../core/clock";
import {
  defaultContext,
  fromNodeState,
  stepRegionStates,
  type SimContext,
} from "../../core/ecosim";
import { indexSpecies, toEcoNode, type EcoNode, type SpeciesIndex } from "../../core/foodweb";
import { deriveStream, type Rng } from "../../core/rng";
import { validateContent } from "../../core/schemas";
import {
  appendAction,
  newSave,
  openStreams,
  type RngStreams,
  type SaveEnvelope,
} from "../../core/save";
import type { Balance, Content, GameAction, NodeFile, Season } from "../../core/types";
import {
  cellTopLeftWorld,
  firstWalkableTile,
  gridConsistencyProblem,
  loadCollision,
  tileGridSize,
  tileWalkable,
  type LoadedCollision,
  type MaskPixels,
} from "../collision";
import {
  rollForayStep,
  stepsPerForay,
  totalActiveWeight,
  encounterTable,
  type Encounter,
  type ForayContext,
} from "../encounters";
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
  DEFAULT_SEASON_METER_STYLE,
  SeasonMeterHud,
  phaserMeterSurface,
  seasonMeterModel,
  type SeasonMeterStyle,
} from "../ui/SeasonMeter";
import {
  driveYearTurn,
  finishYearTurn,
  yearTurnTrigger,
  type YearTurnDrive,
  type YearTurnSceneData,
} from "./YearTurnScene";
import {
  createMovement,
  movementConfig,
  placeAt,
  queueInput,
  resolveInput,
  spriteWorldPosition,
  update as updateMovement,
  type Direction,
  type MovementConfig,
  type MovementState,
} from "../movement";

export const OVERWORLD_SCENE_KEY = "Overworld";

/**
 * Subsystem stream names. build-doc §8.1 declares the set in `balance.rng.subsystemTags`, and
 * {@link OverworldScene.streamFor} checks these two are in it at boot rather than trusting the
 * spelling — so a retune that renames a tag fails loudly here instead of silently handing the
 * overworld a fresh stream at draw zero.
 */
const ENCOUNTER_STREAM = "encounter";
const SIM_STREAM = "sim";

/* ────────────────────────────────────────────────────────────────────────────
 * Seams
 * ──────────────────────────────────────────────────────────────────────────── */

export interface OverworldHooks {
  /**
   * C3. A wild creature was met. The scene has already spent nothing and changed no population —
   * catching is the battle's outcome, and applying it to `save.nodeStates` is the caller's
   * (LANE-A-STATUS §6.1: `caughtIndividual` → `appendAction({t:"catch"})` → the count moves).
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

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private dirKeys: Array<{ dir: Direction; keys: Phaser.Input.Keyboard.Key[] }> = [];
  private overlayKey?: Phaser.Input.Keyboard.Key;
  private travelKeys: Phaser.Input.Keyboard.Key[] = [];

  /** Movement steps since the last foray tick was charged (build-doc §7.2 / DEVIATIONS D18). */
  private stepsSinceTick = 0;
  private encountersMet = 0;
  private lastEncounter: Encounter | null = null;
  private lastNote = "";
  private travelling = false;
  private hudDirty = true;

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

    this.overlay = this.add.graphics().setDepth(10).setVisible(false);

    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.mapView.worldWidth, this.mapView.worldHeight);
    camera.startFollow(this.player, true);

    // L8's season meter is HUD, not a menu: it is on screen while the overworld is. The widget is
    // game/ui/SeasonMeter.ts's — this scene used to print `year N · tick t/16 · season` as plain
    // text instead, which is a second readout of the same clock and left the 16-pip meter L8 names
    // mounted nowhere in the game.
    this.meterHud = new SeasonMeterHud(phaserMeterSurface(this, METER_STYLE), METER_STYLE);

    this.hud = this.add
      .text(HUD_PAD, METER_STYLE.y + METER_STYLE.cellH + METER_STYLE.cellGap + HUD_LINE_PX, "", HUD_STYLE)
      .setScrollFactor(0)
      .setDepth(100);
    this.banner = this.add
      .text(HUD_PAD, this.scale.height - HUD_PAD, "", BANNER_STYLE)
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(100);

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

  /** The live node: the shipped file with the save's populations, flora and recentDeaths on it. */
  liveNode(id: string = this.node.id): EcoNode {
    const file = this.nodeFile(id);
    const state = this.save.nodeStates[id];
    // No state means a save that predates this node; build-doc §7.2 — "sim initial state = the file
    // as shipped" — is the honest fallback, and `toEcoNode` deep-copies, so the shipped JSON is
    // never aliased by a running game.
    return state ? fromNodeState(file, state) : toEcoNode(file);
  }

  /**
   * Sample the mask (once) and build the map image. ONE mask serves all six years (Hard Req 5) — the
   * year only ever reaches `MapView`, never `loadCollision`.
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

    const spawn = firstWalkableTile(this.collision.grid, this.balance) ?? { col: 0, row: 0 };
    this.movement = this.movement
      ? placeAt(this.movement, spawn)
      : createMovement(spawn);
    this.stepsSinceTick = 0;
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

    this.travelKeys.forEach((key, i) => {
      if (Phaser.Input.Keyboard.JustDown(key)) {
        const target = this.node.adjacency[i];
        if (target) void this.travelTo(target);
      }
    });

    if (this.travelling) return;

    this.movement = queueInput(this.movement, resolveInput(this.pressedDirections(), this.movement.queued));
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
    const encounter = rollForayStep(this.forayContext(), this.streamFor(ENCOUNTER_STREAM));
    if (encounter) {
      this.encountersMet += 1;
      this.lastEncounter = encounter;
      this.hudDirty = true;
      this.flashBanner(
        `${encounter.lineId} ${encounter.age} L${encounter.level} — count ${this.countOf(encounter.lineId)}`,
      );
      if (this.hooks.onEncounter) this.hooks.onEncounter(encounter, this);
    }

    this.stepsSinceTick += 1;
    if (this.stepsSinceTick >= stepsPerForay(this.balance)) {
      this.stepsSinceTick = 0;
      this.spendTicks("foray", { t: "foray", nodeId: this.node.id });
    }
  }

  /** The question game/encounters.ts answers, built from live state only. */
  forayContext(nodeId: string = this.node.id): ForayContext {
    const ctx: ForayContext = {
      node: this.liveNode(nodeId),
      species: this.species,
      balance: this.balance,
      season: this.currentSeason(),
      year: this.save.year,
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

  /** Hard Req 2 — the real number, read straight off `save.nodeStates` (§8.3). */
  countOf(lineId: string, nodeId: string = this.node.id): number {
    return this.save.nodeStates[nodeId]?.populations[lineId]?.count ?? 0;
  }

  /* ── the clock ────────────────────────────────────────────────────────── */

  clock(): ClockState {
    return { year: this.save.year, tick: this.save.tick };
  }

  currentSeason(): Season {
    return seasonOf(this.clock(), this.balance);
  }

  /**
   * Spend one action's ticks (travel 1 / foray 1) through core/clock.ts, log the action, and deal
   * with whatever boundary it crossed.
   */
  private spendTicks(kind: "travel" | "foray", action: GameAction): void {
    if (this.yearTurnRunning) return;
    this.save = appendAction(this.save, action);
    // The tick the action STARTED on, kept because the year turn has to be handed a save that is
    // still standing in the year the clock is about to end (build-doc §7.5 runs on year N and
    // returns year N+1). Advancing first and reverting later would run the turn a year late.
    const tickBefore = this.save.tick;
    const advanced = advanceAction(this.clock(), kind, this.balance);
    this.save = { ...this.save, year: advanced.clock.year, tick: advanced.clock.tick };
    this.handleClockEvents(advanced.events, tickBefore);
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
     * build-doc §4 step 5 — "At gym victory or tick 16, the year turn runs". ONE trigger per action:
     * `yearTurnTrigger` collapses the clock's `yearEnd` events, so a shell watching for both of §4's
     * triggers cannot fire two turns for one action. The turn itself is core/lifecycle.ts's and its
     * UX is game/scenes/YearTurnScene.ts's; this scene only decides WHEN.
     */
    const trigger = yearTurnTrigger({ clock: this.clock(), events });
    if (trigger) this.beginYearTurn(trigger.endedYear, trigger.reason, tickBefore, trigger.carryTick);
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
    reason: string,
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
       * Until it exists, the heir stream is a CHILD of the sim stream through core/rng.ts's own
       * `deriveStream` — core's sanctioned way to split a stream, keyed so each year turn gets its
       * own and costing the parent exactly one draw. That keeps the heir rolls out of the ecology's
       * draw sequence (they would otherwise interleave with the region step's) and keeps every
       * random number in the repo inside core/rng.ts (G11).
       */
      const heirStream = deriveStream(this.streamFor(SIM_STREAM), `${SIM_STREAM}:heir:y${String(endedYear)}`);
      drive = driveYearTurn(atEndedYear, {
        content: this.content,
        simRng: this.streamFor(SIM_STREAM),
        lifecycleRng: () => heirStream.nextFloat(),
        endedYear,
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
      this.lastNote = `${this.mapView.status.note} · ${this.collision.note}`;
      this.hudDirty = true;
      this.refreshHud();
      this.hooks.onSaveChanged?.(this.save, this);
      this.flashBanner(`year ${endedYear} ended (${reason}) → Y${String(this.save.year)}`);
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
    const table = encounterTable(this.forayContext());
    const active = table.filter((e) => e.active && e.weight > 0);
    const lines: string[] = [
      `${this.node.name} (${this.node.id}) · ${this.node.biome}`,
      `foray ${this.stepsSinceTick}/${stepsPerForay(this.balance)} steps · encounters ${this.encountersMet}`,
      `tile ${this.movement.tile.col},${this.movement.tile.row} facing ${this.movement.facing}`,
      `weight ${totalActiveWeight(table).toFixed(1)} over ${active.length}/${table.length} lines`,
    ];
    for (const entry of table) {
      const count = this.countOf(entry.lineId);
      const why = entry.active ? "" : ` (${entry.dormantReason ?? "absent"})`;
      lines.push(`  ${entry.lineId}: ${count}${why}`);
    }
    if (this.lastEncounter) {
      lines.push(`last: ${this.lastEncounter.lineId} ${this.lastEncounter.age} L${this.lastEncounter.level}`);
    }
    // Hard Req 6 — the season reading is a runtime tint. `provisional` is on while its hues are a
    // placeholder rather than data (game/season-tint.ts), and it says so on screen for the same
    // reason the map placeholder does.
    const tint = this.mapView.tint;
    lines.push(`tint ${seasonTintLabel(tint)}${tint.provisional ? " · PROVISIONAL hues" : ""}`);
    lines.push(this.lastNote);
    this.node.adjacency.forEach((id, i) => lines.push(`[${i + 1}] travel → ${id}`));
    lines.push("[C] collision overlay");
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
