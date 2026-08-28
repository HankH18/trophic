/**
 * tests/gates/player-art-contract.test.ts — THE FIRST TEST IN THIS REPO THAT OPENS AN IMAGE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Nothing in `tests/` decoded a PNG. Every art-lane assertion was about JSON, code, or a raster the
 * test itself had just built in memory — which is a test of the builder, not of the artwork. So when
 * the T-15 re-freeze swapped all 32 palette values and `tools/comfy/player-views.ts` went on writing
 * the 21 B0 hex literals it had frozen into its own source, the suite stayed fully green while:
 *
 *   • `player-side-32x48.png` shipped **420 opaque pixels in 11 colours the palette no longer
 *     contains**, and `player-back-32x48.png` shipped 8 more;
 *   • the star-removal filter — which compared against the deleted `#f9db10` — stopped matching
 *     anything, so **the star badge came back on the REAR of the cap**, the first defect Hank named;
 *   • `_acceptance.json`'s identity detectors, keyed on the same dead hexes, reported `0` / `[]` /
 *     `null` and read exactly like a clean bill of health.
 *
 * Green over the code is not green over the bytes. This file therefore DECODES THE COMMITTED PNGs
 * and asserts against their actual pixels.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * THE DISCIPLINE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 1. **The palette is read from `data/palette.json` at test time**, through the same `loadPalette()`
 *    the quantize step uses. A copied hex list here would rot on the next re-freeze exactly the way
 *    the 21 literals did, and this gate would then certify the rot.
 *
 * 2. **The star is measured by the derivation's OWN predicate** (`isStarYellow`), not by a second
 *    definition of "yellow". A gate that measures the star its own way can go green while the filter
 *    that removes it is looking at something else — which is precisely how this defect hid.
 *
 * 3. **Nothing may pass vacuously.** A missing file, an empty file, an all-transparent file, or a
 *    file that decoded to a single flat colour fails LOUDLY rather than sailing through a `for` loop
 *    over zero pixels. That is not hypothetical: the art session has separately measured Comfy Cloud
 *    returning valid, well-formed 1024² PNGs that are entirely black, and "0 star pixels" is the
 *    reading such a file gives. Every absence assertion below is paired with a POSITIVE CONTROL —
 *    the star must be *present* in the front before its absence from the back means anything.
 *
 * 4. **The committed bytes must equal what the current code + the current palette produce.** This is
 *    the loud failure the ticket asks for: a future re-freeze moves the derived colours automatically
 *    (the roles are slot ids now), and if the PNGs are not rebuilt afterwards, this gate goes red
 *    instead of the sprites silently disagreeing with every asset around them.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS GATE COVERS AFTER THE 9-TO-1 COLLAPSE — read before deleting half of it
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Hank's ruling — *"we're switching to the player character always being facing forward and doing
 * the skipping movement as it moves around"* — retired the `back` and `side` VIEWS and the six §9.6
 * walk frames from the game and from `tools/comfy/manifest.json`. `game/mapview.ts` `playerArtIds()`
 * is one key, and §6 below asserts that nothing in the game can spell the other two.
 *
 * ⚠ THE SUBJECT OF §0-§4 MOVED, AND THIS IS THE RECORD OF WHY. It used to be the three committed
 * `assets/approved-trials/_player-views/derived/player-{front,back,side}-32x48.png`. Those files are
 * gone — retired by the art lane, in the art lane, exactly as the previous version of this header
 * reserved to it (*"when it is made, §0-§4 go with them and §6 stays"*). Their own note at
 * `_player-views/derived/RETIRED.md` gives three reasons, each sufficient: nothing in the game can
 * ask for a back or a side; `deriveBack`/`deriveSide` place features by ABSOLUTE row index on a
 * 48-row figure (cap 12-15, hair 16-20, neck to 23, belt 30-37) so re-deriving at the owner's new
 * 32-row height is re-authoring rather than downscaling, and `tools/comfy/player-views.ts` now
 * refuses that height instead of silently emitting a sprite with half a belt; and the lineage is
 * SUPERSEDED — all three descended from `player-APPROVED.png`, the b0 artwork, while what ships is
 * a different drawing.
 *
 * So §0-§4 now decode `assets/final/player/player-front.png` — the file the game actually loads.
 * That is where the coverage belongs and it is strictly more coverage than before: the T-15 rot
 * these assertions exist to catch (a palette re-freeze that moves the hexes and leaves the sprites
 * behind) is a thing that can happen to SHIPPED bytes, and it was previously being watched for on a
 * trial artifact instead. §1's palette conformance is the instrument that catches it now, and it
 * catches it on the pixels a player sees.
 *
 * Two lanes, one file: §0-§4 guard the shipped sprite's bytes; §6 guards the seam between the
 * lanes — and §6's non-vacuity clause is now that the one art id the game can spell resolves to the
 * very path §0-§4 decoded, so neither half can go quiet without the other noticing.
 */

import { describe, expect, it, beforeAll, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

// `game/mapview.ts` value-imports Phaser for one constant (`Phaser.Loader.Events.COMPLETE`), and
// `import "phaser"` throws `window is not defined` under vitest's node environment. Same stub and
// same reason as tests/gates/dex-path-contract.test.ts: it carries that one constant and nothing
// else, so nothing here can accidentally test Phaser.
vi.mock('phaser', () => ({ default: { Loader: { Events: { COMPLETE: 'complete' } } } }));

import { loadPalette, loadPaletteFile, REPO_ROOT } from '../../tools/postprocess/palette.ts';
import { C, SWATCH_ID, isStarYellow, swatchesFrom, type SwatchRole } from '../../tools/comfy/player-views.ts';
import balance from '../../data/balance.json';
// eslint-disable-next-line import/first -- must follow the phaser mock above.
import { PLAYER_VIEWS, playerArtId, playerArtIds } from '../../game/mapview.ts';

/** G11: the sprite size is `balance.map.playerSpriteW/H` — 32×32 since the one-block-tall ruling. */
const W = balance.map.playerSpriteW;
const H = balance.map.playerSpriteH;

/**
 * The file the game loads. Derived from the art id rather than typed, so §6's seam claim and §0-§4's
 * subject cannot drift apart: `playerArtId()` is `player/player-front` and the pipeline writes each
 * class under `assets/final/`.
 */
const SHIPPED_FRONT = resolve(REPO_ROOT, `assets/final/${playerArtId()}.png`);

/**
 * Floors that separate "a sprite" from "a decode that happened to succeed". The shipped sprite is
 * far above them (704 opaque px, 9 distinct swatches) — these are the numbers a BROKEN file cannot
 * reach, not the numbers a good one should hit, so they do not need re-tuning when the art moves.
 */
const MIN_OPAQUE = Math.floor((W * H) / 4);
const MIN_DISTINCT_SWATCHES = 8;

interface Decoded {
  path: string;
  width: number;
  height: number;
  data: Uint8ClampedArray;
  opaque: number;
  /** `#rrggbb` -> count, over OPAQUE pixels only. */
  swatches: Map<string, number>;
  alphaValues: Set<number>;
}

const hexAt = (d: Uint8ClampedArray, i: number): string =>
  '#' + [d[i]!, d[i + 1]!, d[i + 2]!].map((v) => v.toString(16).padStart(2, '0')).join('');

/**
 * Decode a committed PNG off disk. Throws — not returns empty — when the file is missing, so a
 * renamed or deleted sprite cannot turn this gate into a loop over nothing.
 */
async function decode(path: string): Promise<Decoded> {
  if (!existsSync(path)) {
    throw new Error(
      `player-art-contract: ${path} does not exist. This gate asserts over the pixels the game ` +
        'LOADS; a missing file is a failure, never an empty pass. `assets/final/player/` is the ' +
        'art lane’s output directory (tools/comfy/manifest.json classes.player.finalDir).',
    );
  }
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out: Decoded = {
    path,
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(data),
    opaque: 0,
    swatches: new Map(),
    alphaValues: new Set(),
  };
  for (let i = 0; i < out.data.length; i += 4) {
    out.alphaValues.add(out.data[i + 3]!);
    if (out.data[i + 3]! < 128) continue;
    out.opaque++;
    const h = hexAt(out.data, i);
    out.swatches.set(h, (out.swatches.get(h) ?? 0) + 1);
  }
  return out;
}

const starPixelsIn = (d: Decoded): Array<{ x: number; y: number; hex: string }> => {
  const hits: Array<{ x: number; y: number; hex: string }> = [];
  for (let i = 0; i < d.data.length; i += 4) {
    if (d.data[i + 3]! < 128) continue;
    const p: [number, number, number, number] = [d.data[i]!, d.data[i + 1]!, d.data[i + 2]!, d.data[i + 3]!];
    if (!isStarYellow(p)) continue;
    const cell = i / 4;
    hits.push({ x: cell % d.width, y: Math.floor(cell / d.width), hex: hexAt(d.data, i) });
  }
  return hits;
};

let front: Decoded;

beforeAll(async () => {
  front = await decode(SHIPPED_FRONT);
});

describe('player art contract — the shipped PNG, decoded', () => {
  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * 0. Nothing here may pass vacuously.
   * ──────────────────────────────────────────────────────────────────────────────────────────── */

  it('decodes to a real sprite, not an empty or flat one', () => {
    const d = front;
    expect(d.width, `${d.path}: width`).toBe(W);
    expect(d.height, `${d.path}: height`).toBe(H);
    expect(d.data.length, `${d.path}: RGBA byte count`).toBe(W * H * 4);

    // An all-transparent decode reports 0 opaque pixels — and every "absent" assertion below would
    // then pass over nothing at all.
    expect(
      d.opaque,
      `${d.path} carries ${d.opaque} opaque px; a sprite must clear ${MIN_OPAQUE}. A file that ` +
        'decodes is not a file that is right.',
    ).toBeGreaterThanOrEqual(MIN_OPAQUE);

    // The all-black-1024² failure mode, at sprite scale: a well-formed PNG of exactly one colour.
    expect(
      d.swatches.size,
      `${d.path} holds ${d.swatches.size} distinct colours: ${[...d.swatches.keys()].join(' ')}`,
    ).toBeGreaterThanOrEqual(MIN_DISTINCT_SWATCHES);

    // Pixel art has a binary mask. A partial alpha is an interpolating resize that got in, and it
    // also means "is this pixel on" stops being a decidable question for every check below.
    expect([...d.alphaValues].sort((a, b) => a - b), `${d.path}: alpha values present`).toEqual(
      d.alphaValues.has(0) ? [0, 255] : [255],
    );
  });

  /*
   * ⛔ REMOVED: "the approved source the front is derived FROM is itself not blank", which ran
   * `nativeDensity` over `assets/approved-trials/player-APPROVED.png`.
   *
   * REVERT CHECK — would it still be wrong with every change of mine reverted? YES. Its subject was
   * never this file's subject: `player-APPROVED.png` is the b0 artwork the RETIRED derived views
   * descended from, and the sprite that ships is a different drawing (`_player-views/derived/
   * RETIRED.md`, reason 3). The test's name asserted a lineage — "the source the front is derived
   * from" — that had already stopped being true of the front the game loads.
   *
   * NOT WEAKENED: what it was really buying was non-vacuity, and non-vacuity is asserted directly
   * and more strictly on the shipped bytes one test up (≥256 opaque px, ≥8 distinct swatches,
   * binary alpha). A blankness check on an upstream file the gate no longer measures is coverage of
   * nothing; a blankness check on the file it does measure is the real thing.
   */

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * 1. Every pixel is transparent or an EXACT frozen palette colour.
   * ──────────────────────────────────────────────────────────────────────────────────────────── */

  it('every opaque pixel is an exact data/palette.json colour', () => {
    const palette = loadPalette(); // read from disk at test time — never a list copied into here
    expect(palette.length, 'data/palette.json carries no colours').toBeGreaterThan(0);
    const legal = new Set(palette.map((c) => c.hex.toLowerCase()));

    const d = front;
    const offPalette = [...d.swatches.entries()].filter(([h]) => !legal.has(h.toLowerCase()));
    const offCount = offPalette.reduce((sum, [, n]) => sum + n, 0);
    expect(
      offCount,
      `${d.path} holds ${offCount} px in ${offPalette.length} colour(s) that data/palette.json does ` +
        `not contain: ${offPalette.map(([h, n]) => `${h}x${n}`).join(' ')}. ` +
        'Either the palette was re-frozen without re-quantizing the shipped sprite, or something ' +
        'wrote a hex literal instead of a slot id. This is the T-15 rot, on the pixels a player sees.',
    ).toBe(0);
  });

  it('the palette this gate measured against is the FROZEN one', () => {
    expect(loadPaletteFile().frozen, 'data/palette.json is not frozen; these sprites are provisional').toBe(true);
  });

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * 2. The cap badge — the one star assertion that still has a subject.
   *
   * ⛔ REMOVED: "the star badge is ABSENT from the rear of the cap" and "…from the whole rear view".
   *
   * REVERT CHECK — would they still be wrong with every change of mine reverted? YES. Both read
   * `decoded.back`, and there is no back: `assets/approved-trials/_player-views/derived/
   * player-back-32x48.png` was deleted by the art lane, whose call that was, and the game cannot
   * spell a `back` key (§6). A test whose subject does not exist is not a strict test, it is an
   * error at `beforeAll`. This is a contract change made by another lane and recorded here, not an
   * assertion bent to go green.
   *
   * NOT WEAKENED, and this is the part worth reading: the pair below is what those two were FOR.
   * The T-15 defect was `isStarYellow` silently matching nothing after the palette moved under it,
   * which made "0 star pixels on the back" read as a clean bill of health. That failure mode is
   * caught by the control — the predicate must still find the badge on the sprite that ships — and
   * the control now runs against shipped bytes instead of a trial artifact.
   * ──────────────────────────────────────────────────────────────────────────────────────────── */

  it('the star badge IS on the shipped sprite, by the filter’s own predicate', () => {
    const hits = starPixelsIn(front);
    expect(
      hits.length,
      'the shipped sprite shows no star-yellow pixel at all. Either the badge is gone from the art, ' +
        'or `isStarYellow` no longer matches anything after a palette move — the T-15 failure, in ' +
        'which every star measurement in this repo reads zero and looks like good news.',
    ).toBeGreaterThan(0);
    // The badge is on the cap; a star found in the boots is a different failure from a star found
    // nowhere, and saying so here keeps the control honest. The bound USED to be the literal 14 —
    // `deriveBack`'s own cap-row sweep (rows 0-13) on a 48-row figure. `deriveBack` is retired and
    // the figure is `H` rows now, so the bound comes from the sprite: the cap is in its top half,
    // the feet are in the bottom, and that is the distinction the assertion is drawing. On the
    // shipped art the badge sits at rows 6-7.
    expect(Math.min(...hits.map((h) => h.y)), 'star-yellow found in the bottom half of the sprite').toBeLessThan(H / 2);
  });

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * 3. ⛔ REMOVED: "back/side introduce ZERO swatches the approved front does not use".
   *
   * REVERT CHECK: YES, wrong independently of anything I did. It was a guarantee about the
   * DERIVATION — that `deriveBack`/`deriveSide` only ever copy the front's quantized pixels — and
   * both the derived files and the views they depict are retired. §1 makes the stronger claim over
   * the shipped sprite anyway: not merely "adds no colour the front had", but "holds no colour
   * `data/palette.json` does not".
   * ──────────────────────────────────────────────────────────────────────────────────────────── */

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * 4. The role table, and the loud failure on the next re-freeze.
   * ──────────────────────────────────────────────────────────────────────────────────────────── */

  it('every role in SWATCH_ID names a slot data/palette.json actually carries', () => {
    const ids = new Set(loadPalette().map((c) => c.id));
    const dangling = Object.entries(SWATCH_ID).filter(([, id]) => !ids.has(id));
    expect(dangling, `roles pointing at slots the palette does not have: ${JSON.stringify(dangling)}`).toEqual([]);
    expect(() => swatchesFrom(loadPalette())).not.toThrow();
  });

  it('every role resolves to the CURRENT palette, never to a remembered hex', () => {
    const byId = new Map(loadPalette().map((c) => [c.id, c.hex.toLowerCase()]));
    for (const [role, id] of Object.entries(SWATCH_ID) as Array<[SwatchRole, string]>) {
      const px = C[role];
      const asHex = '#' + px.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
      expect(asHex, `role "${role}" resolved to ${asHex}, but slot ${id} is ${byId.get(id)}`).toBe(byId.get(id));
    }
  });

  /*
   * ⛔ REMOVED: "the committed PNGs are what the CURRENT code and CURRENT palette produce", which
   * rebuilt all three views in memory via `toSprite(player-APPROVED.png)` + `deriveBack`/
   * `deriveSide` and compared pixel-for-pixel with the committed files.
   *
   * REVERT CHECK — would it still be wrong with every change of mine reverted? YES, twice over. Two
   * of its three subjects no longer exist, and the third never had the provenance the test asserted:
   * the shipped `player-front.png` is an authored drawing, not `player-APPROVED.png` run through
   * this module, so "a fresh derivation" would have compared the wrong lineage's bytes. Recomputing
   * it at 32 rows is not even available — `deriveBack`/`deriveSide` place features by absolute row
   * index on a 48-row figure and `tools/comfy/player-views.ts` now refuses the shorter height.
   *
   * NOT WEAKENED — the guarantee this test was named for SURVIVES, in §1. What it existed to catch
   * is "a future re-freeze moves the derived colours automatically, and if the PNGs are not rebuilt
   * afterwards this gate goes red instead of the sprites silently disagreeing with every asset
   * around them" (this file's own header, discipline 4). §1 reads `data/palette.json` at test time
   * and fails on any pixel outside it, which reds on exactly that re-freeze — and does it over the
   * shipped sprite rather than over a trial artifact nothing draws. What is genuinely gone is the
   * check that the DERIVATION is reproducible, and that is gone because the derivation is.
   */

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * 6. The seam: these bytes exist, and the GAME cannot ask for two of them.
   * ──────────────────────────────────────────────────────────────────────────────────────────── */

  it('the game cannot spell a back or side player key at all — stronger than the files being absent', () => {
    /*
     * ⚠ WHY THIS IS NOT "assert the files are gone". Absence proves nothing:
     * `game/placeholder.ts::textureFor` falls back to a labelled stand-in for EVERY key it cannot
     * load, so a missing file and a mis-spelled key are indistinguishable at runtime. That
     * indistinguishability is the T-19 defect this repo has now shipped three instances of.
     *
     * So the claim is about the GRAMMAR, not the filesystem: after the ruling there is one view and
     * one art id, and `back`/`side` cannot be named by any caller. A directional swap reinstated in
     * `OverworldScene.syncPlayerSprite` is a compile error (`PlayerView` is `"front"`), and this is
     * the runtime half that survives a cast.
     */
    expect(PLAYER_VIEWS, 'the player has more than one view again').toEqual(['front']);
    expect(playerArtIds(), 'the player has more than one art id again').toEqual(['player/player-front']);
    expect(playerArtId(), 'the default view is not the one the pipeline ships').toBe('player/player-front');

    for (const retired of ['back', 'side', 'step-left', 'step-right']) {
      expect(
        (PLAYER_VIEWS as readonly string[]).includes(retired),
        `"${retired}" is a player view again — the sprite turns, and this gate's derived PNGs are back in play`,
      ).toBe(false);
      expect(
        playerArtIds().filter((id) => id.includes(retired)),
        `the game can ask for a "${retired}" player key again`,
      ).toEqual([]);
    }

    /*
     * NON-VACUITY, and the load-bearing half. It USED to be `existsSync(fileFor('back'))` and
     * `…('side')` — "the derived PNGs this gate protects are named for the views the game just
     * lost, so if the two lanes ever agreed again this would be an empty claim."
     *
     * REVERT CHECK — would those two still be wrong with every change of mine reverted? YES. They
     * required two files the art lane has retired (`_player-views/derived/RETIRED.md`), so they
     * assert a lane's state that a lane has legitimately changed. Their own failure message says
     * what they were protecting — "§0-§4 above now guard nothing" — and §0-§4 now guard the shipped
     * sprite, which is a subject that cannot disappear without the game losing its player.
     *
     * NOT WEAKENED: the replacement is the same claim aimed at something real, and it is stronger.
     * The old pair said "the bytes this gate measures still exist". These three say the bytes this
     * gate measures are the bytes the game ASKS FOR — the id spelled by `playerArtId()` resolves to
     * the path §0-§4 decoded, that path is on disk, and it decoded to a non-empty sprite. If the
     * seam and the pixel assertions ever came apart, this reds; the old pair could not have seen it.
     */
    expect(resolve(REPO_ROOT, `assets/final/${playerArtId()}.png`), 'the seam and §0-§4 measure different files').toBe(
      front.path,
    );
    expect(existsSync(front.path), `${front.path} is gone; §0-§4 above now guard nothing`).toBe(true);
    expect(front.opaque, 'the shipped sprite this gate guards decoded empty').toBeGreaterThan(0);
  });
});
