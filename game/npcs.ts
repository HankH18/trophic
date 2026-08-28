/**
 * game/npcs.ts — the people, actually standing in the world.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  WHAT WAS WRONG, IN ONE SENTENCE
 * ─────────────────────────────────────────────────────────────────────────────
 * Twelve finished `npc-static` sprites ship in `assets/final/`, fifty of the corpus's sixty-three
 * speakers point at one, and until this file existed the ONLY thing that ever drew one was the
 * dialogue box's 32×48 portrait slot. `game/scenes/OverworldScene.ts` had no NPC entity, no
 * placement and no sprite: `docs/STATUS.md` recorded it as the open gap, and the owner reported it
 * as *"No NPCs are showing up in the world."* They were not showing up because nobody was drawing
 * them. This module draws them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  WHERE A PERSON STANDS — WHAT IS AUTHORED, WHAT IS DERIVED, AND THE RULING
 * ─────────────────────────────────────────────────────────────────────────────
 * Two layers, and the difference matters because G2 forbids inventing content:
 *
 *   1. **THE NODE IS AUTHORED, FOR EVERY ONE OF THEM.** `core/dialogue-schema.ts`
 *      `DialogueSpeaker.home` is documented as *"Node this speaker stands in, when they stand in
 *      exactly one"*, it is schema-checked against `data/nodes/` (`core/dialogue-schema.ts`
 *      refuses a `home` that is not a node id), and every `npc-*` speaker carries one. Nobody is
 *      placed in a node the corpus did not put them in — including the six who live on ROUTES
 *      (`r1`–`r5`, `sanctum-approach`) rather than in towns.
 *
 *   2. **THE CELL IS AUTHORED FOR EXACTLY FOUR OF THEM**, as `@` speaker anchors in the interior
 *      plans (`core/interiors.ts` `InteriorSpeakerAnchor`, `PLAN_SPEAKER`): Aldis at
 *      hearthollow-inn (1,2), Kett at hearthollow-supply (5,1), Elsbet at brackwater-inn (10,3),
 *      Hild at brackwater-supply (4,2). Those four plans say in their own `_legend`: *"The collision
 *      parser treats this cell as walkable floor; it is occupied in fact, and the scene layer stands
 *      her on it."* {@link interiorNpcPlacements} is that scene layer. An authored cell always wins;
 *      nothing here derives a position for a speaker who has one.
 *
 * For everybody else the cell is DERIVED, under an owner ruling. Hank, verbatim: **"Scatter them
 * around."** So {@link scatteredNpcPlacements} spreads a node's remaining home speakers across that
 * node's own walkable ground. That is layout, not content — it does not invent a speaker, a line, or
 * a home — and it is written down here so the next reader knows these cells were scattered under a
 * ruling rather than authored, and can reproduce them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE SCATTER RULE, AND WHY IT CANNOT DRIFT (G11, L10)
 * ─────────────────────────────────────────────────────────────────────────────
 * NO `Math.random`, anywhere, ever — see {@link scatteredNpcPlacements} for the rule step by step.
 * Every input is shipped, immutable data: the node file, its collision mask, the dialogue corpus's
 * speaker order, and `core/rng.ts` `hashSeed` over the speaker id. There is no clock, no counter and
 * no save state in it, so the same node draws the same world on every run and on every replay of the
 * action tape (L10). A scatter that moved between runs would be a silent divergence the replay arm
 * could not rebuild, which is why the rule is a pure function of the id and not of the visit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  G3 — ONE PLACEMENT MECHANISM, NOT TWO
 * ─────────────────────────────────────────────────────────────────────────────
 * A person on the map is the same shape as a prop: a point in map-native pixels with a reach around
 * it that the interact key measures. So the reach arithmetic is `game/props.ts`'s — `propInReach` /
 * `distanceToProp` / `propWorldRadius`, widened there to the `MapReachable` shape for exactly this —
 * and NOT a second copy. `interactionRadius` is `balance.map.propInteractionRadiusDefault`, the
 * number props already fall back to (G11: no gameplay constant is written down here). Like a prop, an
 * NPC is **not baked into collision** (build-doc §7.6): the player may walk over the cell, and the
 * mask is untouched. That is also what makes an NPC incapable of blocking anything.
 *
 * ENGINE-FREE ABOVE {@link NpcLayer}. Everything that decides WHO stands WHERE is plain TypeScript
 * over shipped data, so a node test can ask it without a running scene; only the layer at the bottom
 * touches Phaser, and it touches it through `game/placeholder.ts`'s one art-slot helper.
 */

import { DIALOGUE, selectEntryWhere } from "@core/dialogue-schema";
import type {
  DialogueContext,
  DialogueEntry,
  DialogueFile,
  DialogueSpeaker,
} from "@core/dialogue-schema";
import { interiorsOf } from "@core/interiors";
import type { InteriorBlueprint } from "@core/interiors";
import { hashSeed } from "@core/rng";
import type { Balance, CollisionGrid, NodeFile } from "@core/types";
import type PhaserNS from "phaser";
import { chooseSpawnTile, tileGridSize, tileWalkable, worldSizePx } from "./collision";
import { TALK_KINDS } from "./dialogue-runner";
import { createMovement, movementConfig, spriteWorldPosition } from "./movement";
import { placeholderImage } from "./placeholder";
import { distanceToProp, propInReach, type MapReachable, type WorldPoint } from "./props";
import { portraitAssetId } from "./scenes/DialogueScene";

/* ────────────────────────────────────────────────────────────────────────────
 * What an NPC is, on screen
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Which `tools/comfy/manifest.json` class a speaker's `portrait` belongs to.
 *
 * Read as a PREFIX on the row id rather than as a list of ids, because the roster is the corpus's
 * (`data/dialogue.json` `speakers[].portrait`) and a list written here would be a second one to keep
 * in step (G2/G3). The other three portrait families the corpus uses — `trainer-*`, `prop-*` and
 * `narration` — are deliberately NOT drawn by this module: trainers are the battle lane's, props are
 * already placed by `data/nodes/*.json` `props[]`, and `narration` names no manifest row at all.
 */
const NPC_PORTRAIT_PREFIX = "npc-";

/** Where the scatter's hash is taken from. A tag hash, not a save seed — see the header on L10. */
const SCATTER_SEED = 0;

/**
 * How far apart two scattered people must stand, in TILES, measured Chebyshev.
 *
 * A LAYOUT RULE, NOT A GAMEPLAY CONSTANT, so it is not a `data/balance.json` key (G11 governs
 * numbers a retune has to be able to reach; nothing about the sim, the clock, the economy or a
 * battle can see this). 1 means "not the same cell and not one of the eight around it", which is the
 * smallest separation that stops two townsfolk reading as one two-headed sprite.
 */
const MIN_TILE_GAP = 1;

/**
 * One world pixel of bias, so a player standing ON an NPC's cell is drawn IN FRONT of them.
 *
 * The four interior speaker cells are walkable by their plans' own ruling, and `interactIndoors`
 * reads an anchor from the player's exact tile — so the player is EXPECTED to stand on Aldis. Depth
 * sorting on feet alone ties there, and a tie in Phaser falls to display-list order, which would put
 * the NPC (created later) over the player. Presentation only; see {@link NpcLayer.sync}.
 */
const DEPTH_TIE_BIAS_PX = 1;

/** How a placement was arrived at — the honest half of the header, carried on the value. */
export type NpcPlacementSource = "interior-anchor" | "scattered";

/**
 * One person, standing somewhere.
 *
 * Satisfies `game/props.ts` `MapReachable` structurally (`x`, `y`, `interactionRadius` in map-native
 * pixels), which is what lets the shared reach arithmetic answer "is the player at this person" with
 * the same code that answers it for a standing stone.
 */
export interface NpcPlacement extends MapReachable {
  /** `data/dialogue.json` speaker id — the join to everything this person says. */
  readonly speakerId: string;
  /** The name plate's name. Carried so a caller need not re-look-up the speaker. */
  readonly name: string;
  /** `tools/comfy/manifest.json` row id, e.g. `npc-innkeeper`. NOT a texture key. */
  readonly portrait: string;
  /** The authored `home` node this person stands in. */
  readonly nodeId: string;
  /** The room they stand in, or null when they stand outdoors in the node. */
  readonly interiorId: string | null;
  /** The tile they stand on, in the geometry that is on screen (town tiles or plan cells). */
  readonly col: number;
  readonly row: number;
  readonly source: NpcPlacementSource;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Geometry — one tile-to-world conversion, shared with the player
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The world point a character standing on this tile occupies, as `game/movement.ts` defines it.
 *
 * Asked THROUGH `spriteWorldPosition` rather than re-derived, because that function carries the
 * convention (centre x mid-tile, feet on the tile's bottom edge) and `OverworldScene.interact()`
 * measures the player's own reach from it. Two different answers to "where is a character standing"
 * is how a person becomes unreachable from the tile they are visibly on.
 */
function standingPoint(tile: { col: number; row: number }, balance: Balance): WorldPoint {
  return spriteWorldPosition(createMovement(tile), movementConfig(balance));
}

/**
 * The map-native anchor for a tile — the tile's CENTRE.
 *
 * `MapReachable` is in map-native pixels because that is the space props are authored in, so the
 * conversion is the inverse of `propWorldPosition`'s: divide the world point by `mapRenderScale`.
 * Both halves read `balance.map` and neither assumes the other (G11). The centre rather than the
 * standing point, so the reach around a person is symmetric about the cell they occupy.
 */
function nativeAnchorOf(tile: { col: number; row: number }, balance: Balance): { x: number; y: number } {
  const step = balance.map.tileStepPx;
  const scale = balance.map.mapRenderScale;
  return {
    x: (tile.col * step + step / 2) / scale,
    y: (tile.row * step + step / 2) / scale,
  };
}

/** Where this placement's sprite's FEET are, in world pixels. */
export function npcFootY(placement: NpcPlacement, balance: Balance): number {
  return placement.row * balance.map.tileStepPx + balance.map.tileStepPx;
}

/** Where this placement's sprite's centre x is, in world pixels. */
export function npcCentreX(placement: NpcPlacement, balance: Balance): number {
  return placement.col * balance.map.tileStepPx + balance.map.tileStepPx / 2;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Who lives where — read off the corpus, never listed here
 * ──────────────────────────────────────────────────────────────────────────── */

/** Every speaker the `npc-static` class draws, in corpus file order. */
export function npcSpeakers(file: DialogueFile = DIALOGUE): readonly DialogueSpeaker[] {
  return file.speakers.filter((s) => s.portrait.startsWith(NPC_PORTRAIT_PREFIX));
}

/** Every `npc-static` speaker whose authored `home` is this node, in corpus file order. */
export function npcSpeakersHomedAt(nodeId: string, file: DialogueFile = DIALOGUE): DialogueSpeaker[] {
  return npcSpeakers(file).filter((s) => s.home === nodeId);
}

/** The speaker ids this node's interiors already place on an authored cell. */
export function interiorPlacedSpeakerIds(nodeId: string): Set<string> {
  const out = new Set<string>();
  for (const bp of interiorsOf(nodeId)) {
    for (const anchor of bp.anchors) if (anchor.kind === "speaker") out.add(anchor.target);
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Layer 1 — the four authored cells
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The people a room's plan stands on a cell.
 *
 * NOTHING IS DERIVED HERE. `col`/`row` are the blueprint's, `target` is the blueprint's, and a
 * speaker anchor whose target is not in the corpus is dropped rather than drawn under a guessed name
 * — though `core/interiors.ts` refuses such a blueprint at import, so that branch is unreachable
 * through shipped data and exists so a hand-built blueprint cannot crash the scene.
 */
export function interiorNpcPlacements(
  bp: InteriorBlueprint,
  balance: Balance,
  file: DialogueFile = DIALOGUE,
): NpcPlacement[] {
  const out: NpcPlacement[] = [];
  for (const anchor of bp.anchors) {
    if (anchor.kind !== "speaker") continue;
    const speaker = file.speakers.find((s) => s.id === anchor.target);
    if (!speaker || !speaker.portrait.startsWith(NPC_PORTRAIT_PREFIX)) continue;
    const native = nativeAnchorOf(anchor, balance);
    out.push({
      speakerId: speaker.id,
      name: speaker.name,
      portrait: speaker.portrait,
      nodeId: bp.parentNode,
      interiorId: bp.id,
      col: anchor.col,
      row: anchor.row,
      source: "interior-anchor",
      x: native.x,
      y: native.y,
      interactionRadius: balance.map.propInteractionRadiusDefault,
    });
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Layer 2 — the scatter
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Every tile of this node a person may be scattered onto, in row-major order.
 *
 * FOUR EXCLUSIONS, and each one is a thing that currently works and must go on working:
 *
 *   1. **Not walkable.** Asked of the REAL grid through `tileWalkable`, the same query the player's
 *      own movement is answered by — never a guess about what the mask means. (The mask's polarity
 *      and its `~` shallow-water cells are `game/collision.ts`'s to interpret, and this asks it
 *      rather than restating it; a hardcoded walkable set is how `~` got dropped once already.)
 *   2. **Not the spawn tile.** `chooseSpawnTile` decides where a player with no position is put
 *      down; standing somebody on it would put the player inside a person on arrival.
 *   3. **Not a doorway.** A building is entered by WALKING ONTO its door tile
 *      (`OverworldScene.doorwayAt`), so a sprite there reads as a person blocking a door the player
 *      then walks through. Door coordinates are `data/interiors/*.json` `door.x/y` in map-native
 *      pixels, converted exactly as `OverworldScene.doorTileOf` converts them.
 *   4. **Not inside a legendary prop's reach.** `interact()` gives a prop absolute priority over a
 *      person, so an NPC inside a prop's radius is an NPC the interact key can never answer for —
 *      and the same overlap is already documented on `firstWalkableTile` as the reason the spawn
 *      avoids props. Measured through the shared `propInReach`, from the tile's own standing point.
 *
 * There is nothing to exclude for travel: this project's node changes are keyed (`1`–`6` over
 * `node.adjacency`), not walked over an exit tile, so no tile is a way out of the map.
 */
export function scatterCandidates(
  node: NodeFile,
  grid: CollisionGrid,
  balance: Balance,
): { col: number; row: number }[] {
  const tiles = tileGridSize(balance);
  const spawn = chooseSpawnTile(grid, balance, { props: node.props }).tile;
  const scale = balance.map.mapRenderScale;
  const step = balance.map.tileStepPx;
  const doors = interiorsOf(node.id).map((bp) => ({
    col: Math.floor((bp.door.x * scale) / step),
    row: Math.floor((bp.door.y * scale) / step),
  }));

  const out: { col: number; row: number }[] = [];
  for (let row = 0; row < tiles.rows; row += 1) {
    for (let col = 0; col < tiles.cols; col += 1) {
      if (!tileWalkable(grid, col, row, balance)) continue;
      if (col === spawn.col && row === spawn.row) continue;
      if (doors.some((d) => d.col === col && d.row === row)) continue;
      const at = standingPoint({ col, row }, balance);
      if (node.props.some((p) => propInReach(p, at, balance))) continue;
      out.push({ col, row });
    }
  }
  return out;
}

/** Chebyshev tile distance — "how many king moves apart", which is how crowding reads on screen. */
function tileGap(a: { col: number; row: number }, b: { col: number; row: number }): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

/**
 * The people who stand outdoors in this node, and the cells they stand on.
 *
 * ══ THE RULE, STEP BY STEP — WRITE IT DOWN, NOT JUST THE CODE ══
 *
 * The owner ruled *"Scatter them around."* This is that scatter, and it is a pure function of
 * shipped data. Given the node's candidate cells C (row-major, see {@link scatterCandidates}) and
 * the node's outdoor speakers P (corpus file order, minus anyone an interior plan already places):
 *
 *   1. **Each speaker gets its own BAND of C.** `band = floor(|C| / |P|)`, and speaker k owns
 *      `C[k*band … k*band+band)`. Because C is row-major, consecutive bands are consecutive
 *      horizontal strips of the map — so the bands themselves are what spreads the cast across the
 *      node top to bottom instead of clumping it in one square. This is the whole reason the list is
 *      banded rather than hashed globally: a global hash would scatter uniformly *at random* and put
 *      three people in one corner as readily as not.
 *   2. **Within its band, the cell is chosen by a HASH OF THE SPEAKER ID.**
 *      `hashSeed(0, speakerId) % band` — `core/rng.ts`'s own FNV-1a, the project's one hash, not a
 *      second implementation and not `Math.random` (G11). This is what stops every band's occupant
 *      sitting on its first cell in a visible diagonal, and it is keyed on the ID so a speaker keeps
 *      their spot across every run, every reload and every replay (L10).
 *   3. **Crowding is repaired by walking forward inside the band**, wrapping at its end, until a cell
 *      at least {@link MIN_TILE_GAP} from every already-placed person is found. Deterministic: the
 *      scan order is fixed and the set of already-placed people is fixed by step 1's ordering.
 *   4. **The rule is total.** If a band is exhausted the hashed cell is taken anyway (crowding is
 *      cosmetic; an absent NPC is the bug being fixed). If `|C| < |P|` there are no bands at all and
 *      cells are handed out round-robin, `C[k % |C|]` — which can co-locate people on a
 *      pathologically small map and is still deterministic. If `|C|` is empty the node places nobody
 *      and returns empty rather than inventing ground.
 *
 * ⚠ WHAT THIS DOES **NOT** DO, and must not: it never places a speaker outside `speakers[].home`,
 * never invents a speaker, and never touches a line. The node is the corpus's statement; only the
 * cell is derived (G2).
 */
export function scatteredNpcPlacements(
  node: NodeFile,
  grid: CollisionGrid,
  balance: Balance,
  file: DialogueFile = DIALOGUE,
): NpcPlacement[] {
  const alreadyIndoors = interiorPlacedSpeakerIds(node.id);
  const people = npcSpeakersHomedAt(node.id, file).filter((s) => !alreadyIndoors.has(s.id));
  if (people.length === 0) return [];

  const candidates = scatterCandidates(node, grid, balance);
  if (candidates.length === 0) return [];

  const band = Math.floor(candidates.length / people.length);
  const taken: { col: number; row: number }[] = [];
  const out: NpcPlacement[] = [];

  people.forEach((speaker, k) => {
    let cell: { col: number; row: number };
    if (band < 1) {
      // Degenerate map: fewer standing cells than people. Round-robin, still deterministic.
      cell = candidates[k % candidates.length] as { col: number; row: number };
    } else {
      const start = k * band;
      const offset = hashSeed(SCATTER_SEED, speaker.id) % band;
      let chosen = candidates[start + offset] as { col: number; row: number };
      for (let i = 0; i < band; i += 1) {
        const at = candidates[start + ((offset + i) % band)] as { col: number; row: number };
        if (taken.every((t) => tileGap(t, at) > MIN_TILE_GAP)) {
          chosen = at;
          break;
        }
      }
      cell = chosen;
    }
    taken.push(cell);
    const native = nativeAnchorOf(cell, balance);
    out.push({
      speakerId: speaker.id,
      name: speaker.name,
      portrait: speaker.portrait,
      nodeId: node.id,
      interiorId: null,
      col: cell.col,
      row: cell.row,
      source: "scattered",
      x: native.x,
      y: native.y,
      interactionRadius: balance.map.propInteractionRadiusDefault,
    });
  });

  return out;
}

/**
 * Everybody standing in the geometry that is currently on screen.
 *
 * Indoors that is the room's authored anchors and NOTHING ELSE — the town's outdoor cast is not in
 * the room, and `interactIndoors` already refuses the town's props from inside a building for the
 * same reason (a room is drawn at world origin, so a town coordinate compared against it is an
 * answer from the wrong map).
 */
export function npcPlacementsFor(
  node: NodeFile,
  interior: InteriorBlueprint | null,
  grid: CollisionGrid,
  balance: Balance,
  file: DialogueFile = DIALOGUE,
): NpcPlacement[] {
  return interior === null
    ? scatteredNpcPlacements(node, grid, balance, file)
    : interiorNpcPlacements(interior, balance, file);
}

/* ────────────────────────────────────────────────────────────────────────────
 * What a person says when you talk to THEM
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The next thing THIS speaker has to say at this node, or `undefined`.
 *
 * ⚠ THIS DOES NOT REPLACE `talkEntryFor`, AND MUST NOT. That function's header records a declared
 * deviation — with nobody placed, [E] outdoors "addresses the room" and returns the highest-priority
 * eligible line anyone in the node has. Now that people are placed, standing in front of one and
 * pressing [E] should get THEIR line; but a node's corpus is wider than its placed cast (gym
 * leaders, the rival, Maren and the narration all speak at nodes and are not `npc-static`), so the
 * room-wide answer stays as the fallback. `tests/gates/reachability.test.ts` is what that protects:
 * every authored line keeps its path to the screen.
 *
 * A THIN DELEGATION TO `selectEntryWhere`, exactly as `talkEntryFor` is — `core/dialogue-schema.ts`
 * is the single condition-resolution path and this adds a predicate to it, not a second selector.
 * `said` carries `talkEntryFor`'s own anti-starvation contract: exclude what has already been heard
 * this visit, and when everything eligible has been heard repeat the winner rather than falling
 * silent.
 */
export function npcTalkEntryFor(
  file: DialogueFile,
  speakerId: string,
  node: string,
  ctx: DialogueContext,
  said: ReadonlySet<string> = new Set<string>(),
): DialogueEntry | undefined {
  for (const kind of TALK_KINDS) {
    const fresh = selectEntryWhere(
      file,
      ctx,
      (e) => e.speaker === speakerId && e.node === node && e.kind === kind && !said.has(e.id),
    );
    if (fresh) return fresh;
  }
  for (const kind of TALK_KINDS) {
    const found = selectEntryWhere(
      file,
      ctx,
      (e) => e.speaker === speakerId && e.node === node && e.kind === kind,
    );
    if (found) return found;
  }
  return undefined;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The Phaser half — one image per person
 * ──────────────────────────────────────────────────────────────────────────── */

/** What the layer needs to know about the player. A SHAPE, so a test can hand it a plain object. */
export interface PlayerReadout {
  /** Centre y in world pixels. */
  readonly y: number;
  /** Drawn height, so feet can be compared rather than centres. */
  readonly displayHeight: number;
  /** The depth the player is drawn at — the band this layer sorts around. */
  readonly depth: number;
}

export interface NpcViewInput {
  readonly node: NodeFile;
  readonly interior: InteriorBlueprint | null;
  /** The grid that is on screen — `OverworldScene.activeGrid()`. */
  readonly grid: CollisionGrid;
  readonly player: PlayerReadout;
}

/**
 * The people on screen, as one image each.
 *
 * ══ SCALE ══
 * The box is `balance.map.playerSpriteW × playerSpriteH` — which is not a choice made here:
 * `tools/comfy/manifest.json`'s `npc-static` class carries
 * `"_targetSource": "balance.map.playerSpriteW × balance.map.playerSpriteH"`, so the sprite is
 * generated at the player's size by the pipeline's own statement. Drawn through
 * `game/placeholder.ts` `placeholderImage`, which FITS the art inside that box preserving aspect and
 * never enlarging it — so when the player box moves (it is moving to 32×32) a 32×48 sprite shrinks
 * proportionally instead of squashing, and the honest labelled stand-in appears for any row the art
 * lane has not shipped. NO SPRITE DIMENSION IS WRITTEN DOWN IN THIS FILE.
 *
 * ══ FACING ══
 * Forward, always, and there is no second view to choose from: the `npc-static` class ships exactly
 * one, `"views": { "front": … }`, which is the same ruling the player is drawn under (Hank:
 * *"always being facing forward"*). There is no facing table here to fall out of date, and no back
 * or side key any screen could ask for.
 *
 * ══ DEPTH ══
 * Sorted on FEET against the player, in a band around the player's own depth, so a person the player
 * walks below is drawn behind them and a person they walk above is drawn in front. Monotonic in foot
 * y, so people also sort correctly against each other. The span is the world's own height, which
 * bounds every possible difference — so the offset is always inside (-1, 1) and can never leap the
 * player past the collision overlay or the HUD. The player's depth is passed in rather than
 * duplicated here (`OverworldScene` owns that constant, and a copy of it here would be a second
 * answer to where the player sits in the display list).
 */
export class NpcLayer {
  private readonly scene: PhaserNS.Scene;
  private readonly balance: Balance;
  private readonly file: DialogueFile;
  private readonly sprites = new Map<string, PhaserNS.GameObjects.Image>();
  private placed: NpcPlacement[] = [];
  /** The geometry the current sprites were built for — a room id indoors, a node id outdoors. */
  private viewKey: string | null = null;

  constructor(scene: PhaserNS.Scene, balance: Balance, file: DialogueFile = DIALOGUE) {
    this.scene = scene;
    this.balance = balance;
    this.file = file;
  }

  /**
   * Bring the layer up to date. Cheap to call every frame: the cast is rebuilt only when the
   * geometry on screen changes, and the per-frame work is one depth assignment per person.
   */
  sync(view: NpcViewInput): void {
    const key = view.interior?.id ?? view.node.id;
    if (key !== this.viewKey) {
      this.rebuild(view, key);
    }

    const span = worldSizePx(this.balance).height;
    const playerFootY = view.player.y + view.player.displayHeight / 2;
    for (const placement of this.placed) {
      const sprite = this.sprites.get(placement.speakerId);
      if (!sprite) continue;
      const footY = npcFootY(placement, this.balance);
      // See DEPTH_TIE_BIAS_PX: equal feet must put the NPC BEHIND the player, not in front.
      sprite.setDepth(view.player.depth + (footY - playerFootY - DEPTH_TIE_BIAS_PX) / span);
    }
  }

  private rebuild(view: NpcViewInput, key: string): void {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    this.placed = npcPlacementsFor(view.node, view.interior, view.grid, this.balance, this.file);
    this.viewKey = key;

    /*
     * THE NPC BOX IS THE NPC'S OWN, NOT THE PLAYER'S — and this line was the last consumer still
     * reading the player's.
     *
     * It was `playerSpriteW/H`, which was harmless only while the two agreed. The owner ruled the
     * player one block tall (`playerSpriteH` 48 → 32) and they stopped agreeing, so a 32x48 portrait
     * was fitted into a 32x32 box: `placeholderImage` preserves aspect and never enlarges, so every
     * one of the fifty drew at 21x32 — two thirds the player's WIDTH at the same height. Thin people,
     * measured on the shipped build, not inferred.
     *
     * `npcSpriteW/H` is the size the twelve shipped `npc-static` files actually are, so the art lands
     * at scale 1.0 with no fit and no distortion. Read the key, never the figure (G11).
     *
     * ⚠ THIS COMMENT SAID 32x48 AND THAT THE REAL FIX WAS "a generation run and the owner's call".
     * Both were wrong, within the hour, and the correction is worth more than the line it replaces.
     * The twelve figures were near-square ALL ALONG — bounding-box aspect 0.84-1.03, because they
     * were cut from Gold's one-tile-SQUARE walking sprites — so the 48-tall FRAME was the error and
     * not the artwork. A bad ratio never says which of its two terms is wrong, and the recently
     * generated term got blamed because recent things feel provisional and constants feel settled.
     * The owner then ruled "Let's do NPCs that are squeezed", the class retargeted to 32x32, and a
     * LOCAL postprocess re-fit the cast at 81-100% of the box (mean 90%, against 66% drawn before).
     * No generation, no permission, no spend.
     */
    const boxW = this.balance.map.npcSpriteW;
    const boxH = this.balance.map.npcSpriteH;
    for (const placement of this.placed) {
      const sprite = placeholderImage(this.scene, 0, 0, portraitAssetId(placement.portrait), boxW, boxH, {
        note: "not post-processed into assets/final/",
      });
      /*
       * FEET ON THE TILE, not centre on the tile. `placeholderImage` may have shrunk the art to fit
       * the box (see the class header), so the half-height is read back off the OBJECT rather than
       * assumed from the box — otherwise a fitted sprite would float above its cell by the
       * difference, which is exactly the kind of half-pixel drift that reads as "the NPC is standing
       * on the roof".
       */
      sprite.setPosition(
        npcCentreX(placement, this.balance),
        npcFootY(placement, this.balance) - sprite.displayHeight / 2,
      );
      sprite.setFlipX(false);
      sprite.setVisible(true);
      this.sprites.set(placement.speakerId, sprite);
    }
  }

  /** Everybody currently drawn, in placement order. */
  onScreen(): readonly NpcPlacement[] {
    return this.placed;
  }

  /** The image drawn for a speaker, or undefined. The object-layer read a test asserts on. */
  spriteOf(speakerId: string): PhaserNS.GameObjects.Image | undefined {
    return this.sprites.get(speakerId);
  }

  /**
   * The person the player is standing at, or null — NEAREST first, on `propAt`'s terms and through
   * `propInReach`, so a person and a standing stone measure "close enough" identically.
   */
  npcAt(at: WorldPoint): NpcPlacement | null {
    return (
      this.placed
        .filter((p) => propInReach(p, at, this.balance))
        .sort((a, b) => distanceToProp(a, at, this.balance) - distanceToProp(b, at, this.balance))[0] ?? null
    );
  }

  destroy(): void {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    this.placed = [];
    this.viewKey = null;
  }
}
