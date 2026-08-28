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
 * number props already fall back to (G11: no gameplay constant is written down here).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  A PERSON IS SOLID — AND THE MASK IS STILL NOT TOUCHED
 * ─────────────────────────────────────────────────────────────────────────────
 * The owner played the build and reported, verbatim: *"the NPCs have no collisions."* They did not.
 * This header used to end *"the player may walk over the cell, and the mask is untouched. That is
 * also what makes an NPC incapable of blocking anything"* — the second half of that sentence is what
 * was wrong, and only the second half. The interior plans have said the opposite about themselves
 * the whole time: *"the parser treats this cell as walkable floor; it is occupied IN FACT, and the
 * scene layer stands her on it."* Occupied in fact, and nothing enforced it.
 *
 * The mask is STILL untouched, and that is not a technicality:
 *
 *   • build-doc §7.6 makes collision a property of the painted geometry. A body standing on grass is
 *     not geometry, and baking one in would make the mask disagree with the picture it was sampled
 *     from — the same class of defect as a per-year mask (Hard Req 5 / G4).
 *   • It would also be circular. {@link scatterCandidates} reads the grid to decide where people may
 *     stand; a grid that already carried them would feed the placement pass its own output, and the
 *     cast would drift every time the scene rebuilt.
 *
 * So occupancy is an OVERLAY, {@link npcOccupiedTiles}, and `OverworldScene.canEnter` — the one
 * walkability question the whole scene asks — consults it beside the mask.
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
import {
  chooseSpawnTile,
  reachableTiles,
  tileGridSize,
  tileKey,
  tileWalkable,
  worldSizePx,
} from "./collision";
import { TALK_KINDS } from "./dialogue-runner";
import { createMovement, movementConfig, spriteWorldPosition } from "./movement";
import { placeholderImage } from "./placeholder";
import {
  distanceToProp,
  propInReach,
  propOccupiedTiles,
  type MapReachable,
  type WorldPoint,
} from "./props";
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
 * A map-native point as the movement tile that contains it.
 *
 * `OverworldScene.doorTileOf`'s arithmetic and `mouthTileOf`'s, in one place: `data/interiors/*.json`
 * `door.x/y`, `data/nodes/*.json` `edgeMouths[].x/y` and `props[].x/y` are all map-native pixels, and
 * both conversions read `balance.map` rather than assuming each other (G11).
 */
function nativeTile(at: { x: number; y: number }, balance: Balance): { col: number; row: number } {
  const scale = balance.map.mapRenderScale;
  const step = balance.map.tileStepPx;
  return { col: Math.floor((at.x * scale) / step), row: Math.floor((at.y * scale) / step) };
}

/**
 * Every tile of this node a person may be scattered onto, in row-major order.
 *
 * SIX EXCLUSIONS, and each one is a thing that currently works and must go on working:
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
 *   5. **NOT AN EDGE MOUTH.** This exclusion's slot used to hold the sentence *"there is nothing to
 *      exclude for travel: this project's node changes are keyed … so no tile is a way out of the
 *      map."* That stopped being true when the owner asked to *"go to the next region by walking up
 *      the path"*: `data/nodes/*.json` `edgeMouths[]` now names the cell each edge leads out of, and
 *      `OverworldScene.edgeExitAt` fires travel on a step that lands there. A person standing on one
 *      is exactly exclusion 3's defect at the scale of a region — the way out of the map with
 *      somebody in it.
 *   6. **REACHABLE FROM THE SPAWN TILE BY A WALK.** Standable is not reachable: a patch of open
 *      ground behind a wall satisfies `tileWalkable` and is somewhere the player can never be, and
 *      a person scattered onto one is a person with lines nobody can ever hear. It also matters for
 *      what {@link scatteredNpcPlacements} does next — the connectivity rule there is stated over
 *      the reachable component, and a candidate outside it would be measured against the wrong
 *      graph. (Measured on the twelve shipped masks at the time this was added: every walkable tile
 *      of every node was already reachable, so this excludes nothing today. It is here so that a
 *      repaint which strands a corner does not silently strand a person on it.)
 */
export function scatterCandidates(
  node: NodeFile,
  grid: CollisionGrid,
  balance: Balance,
): { col: number; row: number }[] {
  const tiles = tileGridSize(balance);
  const spawn = chooseSpawnTile(grid, balance, { props: node.props }).tile;
  const doors = interiorsOf(node.id).map((bp) => nativeTile(bp.door, balance));
  const mouths = (node.edgeMouths ?? []).map((m) => nativeTile(m, balance));
  // The props are SOLID (owner ruling; `game/props.ts` `propTile`), so the world a person is
  // scattered into is the world with the standing stones already in it. Asking reachability of the
  // bare mask would offer a cell the props have already cut off.
  const reachable = reachableTiles(grid, balance, spawn, propOccupiedTiles(node.props, balance));

  const out: { col: number; row: number }[] = [];
  for (let row = 0; row < tiles.rows; row += 1) {
    for (let col = 0; col < tiles.cols; col += 1) {
      if (!tileWalkable(grid, col, row, balance)) continue;
      if (col === spawn.col && row === spawn.row) continue;
      if (doors.some((d) => d.col === col && d.row === row)) continue;
      if (mouths.some((m) => m.col === col && m.row === row)) continue;
      const at = standingPoint({ col, row }, balance);
      if (node.props.some((p) => propInReach(p, at, balance))) continue;
      if (!reachable.has(tileKey({ col, row }))) continue;
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
 *   4. **A CELL IS ONLY TAKEN IF STANDING THERE SEALS NOTHING OFF.** See below — this is the clause
 *      that makes a solid person safe, and it is checked in the same forward walk step 3 uses.
 *   5. **The rule is total.** If a band is exhausted the hashed cell is taken anyway (crowding is
 *      cosmetic; an absent NPC is the bug being fixed). If `|C| < |P|` there are no bands at all and
 *      cells are handed out round-robin, `C[k % |C|]` — which can co-locate people on a
 *      pathologically small map and is still deterministic. **Step 4 does not apply on that branch**,
 *      and it is left that way rather than quietly half-applied: a map with fewer standing cells than
 *      it has residents is already degenerate, there may be no admissible cell at all, and dropping a
 *      person would hide the degeneracy instead of showing it. No shipped node is anywhere near it
 *      (the thinnest has 790 candidates for 7 people), and `tests/unit/npc-prop-collision.test.ts`
 *      §2 is stated over the OUTCOME, so it fails on that branch too if it ever seals something.
 *      If `|C|` is empty the node places nobody and returns empty rather than inventing ground.
 *
 * ══ THE MOVE RULE — WHY A PLACEMENT IS EVER MOVED, AND WHERE TO ══
 *
 * A person is now SOLID (see this file's header), and blocking fifty cells can strand the player or
 * seal something off. EXCLUSION IS NOT CONNECTIVITY: {@link scatterCandidates} already refuses the
 * spawn tile, every doorway, every edge mouth and every prop's reach, and none of that stops two
 * people standing either side of a one-cell gap and closing it between them. Neither of them is on
 * anything excluded; the gap is shut all the same, and nothing would say so until somebody walked
 * there.
 *
 * So the admissibility test is stated over the WHOLE reachable world rather than over the cell:
 *
 *   > Blocking this cell may remove THIS CELL from what a walk from the spawn tile can reach, and
 *   > nothing else.
 *
 * Measured as a count, which is what makes it cheap and total: flood from `chooseSpawnTile` over
 * `game/collision.ts` {@link reachableTiles} with the already-placed people (and the props, which
 * were solid before anyone stood up) blocked, and require that adding this cell costs exactly one
 * tile. Every door, every edge mouth, every prop's reach and every earlier person keeps whatever
 * access it had, because the rule does not enumerate them — it forbids losing ANY tile but the one
 * being occupied. A cut vertex therefore fails it and the search walks on to the next cell in the
 * band; a cell in open ground passes on the first try, which is what happens on all twelve shipped
 * maps today.
 *
 * WHERE IT MOVES TO: forward inside the SAME band, wrapping at the band's end — the identical scan
 * step 3 uses, so a moved placement is still in the horizontal strip the spread rule gave that
 * speaker and `tests/unit/npcs.test.ts`'s band assertion still holds. Two passes, because the two
 * requirements are not equal: the first demands the gap AND the connectivity, the second drops the
 * gap and keeps the connectivity. Crowding is cosmetic; a sealed door is not. If neither pass finds
 * a cell the hashed one is taken anyway and the world is left provably wrong rather than left with
 * a person deleted — `tests/unit/npc-prop-collision.test.ts` is what fails, loudly, in that case.
 *
 * ⚠ WHAT THIS DOES **NOT** DO, and must not: it never places a speaker outside `speakers[].home`,
 * never invents a speaker, and never touches a line. The node is the corpus's statement; only the
 * cell is derived (G2). It also never moves a prop or an authored interior `@` cell — those are
 * content, and a prop that sealed a corridor would be a finding to report, not a placement to
 * change.
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

  /*
   * THE WORLD AS IT STANDS, carried across the whole loop so the test is incremental.
   *
   * `occupied` starts at the props — solid before anybody stood up — and gains each person as they
   * are placed, so person k is measured against a map that already contains persons 0…k-1. That is
   * what catches the two-people-either-side-of-a-gap case: neither cell is a cut on its own, and the
   * pair is. `reach` is the size of the walk from the spawn tile through that occupancy, kept rather
   * than recomputed, so admitting a cell costs ONE flood and not two.
   */
  const spawn = chooseSpawnTile(grid, balance, { props: node.props }).tile;
  const occupied = propOccupiedTiles(node.props, balance);
  let reach = reachableTiles(grid, balance, spawn, occupied).size;

  /** Would standing here cost the walk anything but this one cell? See the move rule above. */
  const sealsNothing = (at: { col: number; row: number }): boolean => {
    const trial = new Set(occupied);
    trial.add(tileKey(at));
    return reachableTiles(grid, balance, spawn, trial).size === reach - 1;
  };

  people.forEach((speaker, k) => {
    let cell: { col: number; row: number };
    if (band < 1) {
      // Degenerate map: fewer standing cells than people. Round-robin, still deterministic.
      cell = candidates[k % candidates.length] as { col: number; row: number };
    } else {
      const start = k * band;
      const offset = hashSeed(SCATTER_SEED, speaker.id) % band;
      const inBand = (i: number): { col: number; row: number } =>
        candidates[start + ((offset + i) % band)] as { col: number; row: number };
      // The hashed cell is the answer unless something below finds a better one — and it stays the
      // answer when nothing does, which is what keeps the rule total (step 5).
      let chosen = inBand(0);
      let settled = false;
      // Pass 1: the gap AND the connectivity. Pass 2: connectivity alone — crowding is cosmetic,
      // a sealed door is not, so the requirement that gives way is the cosmetic one.
      for (const needGap of [true, false]) {
        for (let i = 0; i < band; i += 1) {
          const at = inBand(i);
          if (needGap && !taken.every((t) => tileGap(t, at) > MIN_TILE_GAP)) continue;
          if (!sealsNothing(at)) continue;
          chosen = at;
          settled = true;
          break;
        }
        if (settled) break;
      }
      cell = chosen;
    }
    taken.push(cell);
    occupied.add(tileKey(cell));
    reach = reachableTiles(grid, balance, spawn, occupied).size;
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

/**
 * The cells a person makes impassable in the geometry that is currently on screen.
 *
 * ══ THE ANSWER TO *"the NPCs have no collisions"* ══
 * `OverworldScene.canEnter` — the ONE walkability question the whole scene asks, outdoors and in —
 * consults this beside the mask. Nothing writes to the grid; see this file's header for why the
 * overlay is not a bake, and `game/props.ts` `propOccupiedTiles` for the standing stones, which are
 * solid on the same ruling and by the same mechanism.
 *
 * ⚠ INDOORS THIS BLOCKS THE PLAN'S OWN `@` CELL, and that is the plan's own statement being
 * enforced rather than a new rule: every one of the four rooms says in its `_legend` that *"the
 * collision parser treats this cell as walkable floor; it is occupied IN FACT, and the scene layer
 * stands her on it."* It costs no authored content. `interactIndoors` matches an anchor on the
 * player's EXACT tile, so the question is whether any dialogue was only reachable by standing ON a
 * person — and it was not: `interiorEntryId` resolves a speaker anchor THROUGH the service anchor
 * that faces it, so `@` and its `S` cell resolve to the same entry, and the `S` cell is untouched.
 * (In `brackwater-supply` the shop faces a trestle rather than Hild, so her `@` cell resolved to
 * `null` — "nothing to say" — before this change and after it.) `tests/unit/npc-prop-collision.test.ts`
 * §4 asserts that per room over the shipped blueprints rather than trusting this paragraph.
 */
export function npcOccupiedTiles(
  node: NodeFile,
  interior: InteriorBlueprint | null,
  grid: CollisionGrid,
  balance: Balance,
  file: DialogueFile = DIALOGUE,
): Set<string> {
  const out = new Set<string>();
  for (const placement of npcPlacementsFor(node, interior, grid, balance, file)) {
    out.add(tileKey(placement));
  }
  return out;
}

/**
 * Every cell of the geometry on screen that a BODY makes impassable — people and props together.
 *
 * The one overlay `OverworldScene.canEnter` reads, so a caller cannot consult half of it. Indoors
 * the town's props are deliberately absent for {@link npcPlacementsFor}'s reason: a room is drawn at
 * world origin, so a town coordinate compared against it is an answer from the wrong map — and a
 * standing stone out on the green would otherwise block a cell of an inn's floor.
 */
export function solidBodyTiles(
  node: NodeFile,
  interior: InteriorBlueprint | null,
  grid: CollisionGrid,
  balance: Balance,
  file: DialogueFile = DIALOGUE,
): Set<string> {
  const out = npcOccupiedTiles(node, interior, grid, balance, file);
  if (interior === null) for (const key of propOccupiedTiles(node.props, balance)) out.add(key);
  return out;
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
  /**
   * The GRID those sprites were placed against, by object identity.
   *
   * ⚠ THE VIEW KEY ALONE IS NOT ENOUGH, and the sharp case is `OverworldScene.recoverFromBlackout`:
   * it enters the wake node once with the art possibly unloaded — a SYNTHESISED open rectangle — and
   * again, on the same node, once `ensureNodeArt` has decoded the real mask. Two grids, one id. On
   * the placeholder the whole 64×64 lattice is standable, so the cast is scattered over cells the
   * real town does not offer; without this the sprites would stay on those cells for the rest of the
   * run while `OverworldScene.canEnter` blocks the recomputed ones — people drawn in walls, and
   * invisible walls where nobody is. The scene's own overlay is keyed the same way for the same
   * reason, so the drawing and the blocking can never disagree about which map they are on.
   */
  private placedAgainst: CollisionGrid | null = null;

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
    if (key !== this.viewKey || view.grid !== this.placedAgainst) {
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
    this.placedAgainst = view.grid;

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
    this.placedAgainst = null;
  }
}
