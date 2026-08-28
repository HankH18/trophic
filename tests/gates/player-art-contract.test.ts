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
 * ⚠ THAT DOES NOT RETIRE THE PIXELS, AND THIS FILE'S ASSERTIONS ABOUT THEM ALL STAND.
 * `assets/approved-trials/_player-views/derived/player-{back,side}-32x48.png` are COMMITTED FILES
 * that `tools/comfy/player-views.ts derive` still produces and that `tools/palette/cross-view.mjs`
 * still reads. Everything §0-§4 says about them — palette conformance, the star's absence from the
 * rear of the cap, adding no colour the front lacks, agreeing byte-for-byte with a fresh
 * derivation — is a property of bytes that are still in the repository, and the T-15 re-freeze is
 * the standing proof that those bytes rot silently when nothing decodes them. Dropping those
 * assertions because the GAME no longer draws them would delete real coverage of real files and
 * leave the next re-freeze to rot them again unobserved.
 *
 * Two lanes, one file: §0-§4 guard the raw lane's committed bytes; §6 guards the seam between the
 * lanes. Retiring the derived PNGs themselves is the art lane's call, made in the art lane — and
 * when it is made, §0-§4 go with them and §6 stays.
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
import {
  C,
  SWATCH_ID,
  VIEWS_DIR,
  deriveBack,
  deriveSide,
  isStarYellow,
  nativeDensity,
  swatchesFrom,
  toSprite,
  type Raster,
  type SwatchRole,
} from '../../tools/comfy/player-views.ts';
import balance from '../../data/balance.json';
// eslint-disable-next-line import/first -- must follow the phaser mock above.
import { PLAYER_VIEWS, playerArtId, playerArtIds } from '../../game/mapview.ts';

/** G11: the sprite size is `balance.map.playerSpriteW/H`, which is also what the file names encode. */
const W = balance.map.playerSpriteW;
const H = balance.map.playerSpriteH;

const APPROVED_FRONT = resolve(REPO_ROOT, 'assets/approved-trials/player-APPROVED.png');
const DERIVED_DIR = resolve(VIEWS_DIR, 'derived');
const fileFor = (view: string) => resolve(DERIVED_DIR, `player-${view}-${W}x${H}.png`);

const VIEWS = ['front', 'back', 'side'] as const;
type View = (typeof VIEWS)[number];

/**
 * Floors that separate "a sprite" from "a decode that happened to succeed". The shipped values are
 * far above them (opaque 1165 / 1145 / 750, distinct swatches 19 / 18 / 15) — these are the numbers
 * a BROKEN file cannot reach, not the numbers a good one should hit, so they do not need re-tuning
 * when the art moves.
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
      `player-art-contract: ${path} does not exist. This gate asserts over COMMITTED pixels; a ` +
        'missing file is a failure, never an empty pass. Rebuild with `npx tsx tools/comfy/player-views.ts derive`.',
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

const rasterToBytes = (r: Raster): Uint8ClampedArray => r.data;

let decoded: Record<View, Decoded>;

beforeAll(async () => {
  decoded = {
    front: await decode(fileFor('front')),
    back: await decode(fileFor('back')),
    side: await decode(fileFor('side')),
  };
});

describe('player art contract — the committed PNGs, decoded', () => {
  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * 0. Nothing here may pass vacuously.
   * ──────────────────────────────────────────────────────────────────────────────────────────── */

  it.each(VIEWS)('%s: decodes to a real sprite, not an empty or flat one', (view) => {
    const d = decoded[view];
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

  it('the approved source the front is derived FROM is itself not blank', async () => {
    expect(existsSync(APPROVED_FRONT), `${APPROVED_FRONT} is missing`).toBe(true);
    const n = await nativeDensity(APPROVED_FRONT);
    // `nativeDensity` returns null when it finds no subject at all — an all-white or empty image.
    expect(n, `${APPROVED_FRONT}: no subject found; the source is blank`).not.toBeNull();
    expect(n!.distinctRgb, `${APPROVED_FRONT}: only ${n?.distinctRgb} distinct RGB values`).toBeGreaterThan(256);
  });

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * 1. Every pixel is transparent or an EXACT frozen palette colour.
   * ──────────────────────────────────────────────────────────────────────────────────────────── */

  it.each(VIEWS)('%s: every opaque pixel is an exact data/palette.json colour', (view) => {
    const palette = loadPalette(); // read from disk at test time — never a list copied into here
    expect(palette.length, 'data/palette.json carries no colours').toBeGreaterThan(0);
    const legal = new Set(palette.map((c) => c.hex.toLowerCase()));

    const d = decoded[view];
    const offPalette = [...d.swatches.entries()].filter(([h]) => !legal.has(h.toLowerCase()));
    const offCount = offPalette.reduce((sum, [, n]) => sum + n, 0);
    expect(
      offCount,
      `${d.path} holds ${offCount} px in ${offPalette.length} colour(s) that data/palette.json does ` +
        `not contain: ${offPalette.map(([h, n]) => `${h}x${n}`).join(' ')}. ` +
        'Either the palette was re-frozen without rebuilding the sprites (`npx tsx ' +
        'tools/comfy/player-views.ts derive`), or something wrote a hex literal instead of a slot id.',
    ).toBe(0);
  });

  it('the palette this gate measured against is the FROZEN one', () => {
    expect(loadPaletteFile().frozen, 'data/palette.json is not frozen; these sprites are provisional').toBe(true);
  });

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * 2. The star badge is absent from the REAR view — by the filter's own measurement.
   * ──────────────────────────────────────────────────────────────────────────────────────────── */

  it('POSITIVE CONTROL: the star badge IS visible on the front, so "absent" can mean something', () => {
    const hits = starPixelsIn(decoded.front);
    expect(
      hits.length,
      'the front sprite shows no star-yellow pixel at all. Either the badge is gone from the ' +
        'approved art, or `isStarYellow` no longer matches anything — in which case every ' +
        '"the star is absent" assertion in this file is measuring nothing.',
    ).toBeGreaterThan(0);
    // The badge is on the cap; a star found in the boots is a different failure from a star found
    // nowhere, and saying so here keeps the control honest.
    expect(Math.min(...hits.map((h) => h.y)), 'front: star-yellow found below the cap').toBeLessThan(14);
  });

  it('the star badge is ABSENT from the rear of the cap', () => {
    const hits = starPixelsIn(decoded.back);
    expect(
      hits,
      'the back view still carries the cap badge — the first defect Hank named. `deriveBack` step 1 ' +
        'clears every `isStarYellow` pixel in rows 0-13; if these survived, the filter is keyed on ' +
        'colours the sprite does not hold.',
    ).toEqual([]);
  });

  it('the star badge is absent from the whole rear view, not merely from the cap rows', () => {
    // deriveBack's filter only sweeps rows 0-13. Asserting over the WHOLE sprite is a strictly
    // stronger claim, and it is the one a reviewer actually means by "the star is not on the back".
    expect(starPixelsIn(decoded.back).map((h) => `${h.hex}@(${h.x},${h.y})`)).toEqual([]);
  });

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * 3. The derivation's own guarantee: neither derived view adds a colour the front lacks.
   * ──────────────────────────────────────────────────────────────────────────────────────────── */

  it.each(['back', 'side'] as const)('%s: introduces ZERO swatches the approved front does not use', (view) => {
    const front = new Set(decoded.front.swatches.keys());
    expect(front.size, 'the front sprite decoded to no colours').toBeGreaterThan(0);
    const added = [...decoded[view].swatches.keys()].filter((h) => !front.has(h));
    expect(
      added,
      `${decoded[view].path} adds ${added.join(' ')}. The derived views are transformations of the ` +
        'front’s own quantized pixels; a new colour means something was written rather than copied.',
    ).toEqual([]);
  });

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

  it('the committed PNGs are what the CURRENT code and CURRENT palette produce', async () => {
    // The instrument that makes a re-freeze fail loudly instead of silently: rebuild the two derived
    // views in memory from the approved front and compare pixel-for-pixel with what is on disk.
    const front = await toSprite(APPROVED_FRONT);
    const rebuilt: Record<'front' | 'back' | 'side', Raster> = {
      front,
      back: deriveBack(front),
      side: deriveSide(front),
    };
    for (const view of VIEWS) {
      const want = rasterToBytes(rebuilt[view]);
      const got = decoded[view].data;
      expect(want.length, `${view}: rebuilt raster is empty`).toBe(W * H * 4);
      let firstDiff = -1;
      let diffs = 0;
      for (let i = 0; i < want.length; i += 4) {
        const opaqueWant = want[i + 3]! >= 128;
        const opaqueGot = got[i + 3]! >= 128;
        const same =
          opaqueWant === opaqueGot &&
          (!opaqueWant || (want[i] === got[i] && want[i + 1] === got[i + 1] && want[i + 2] === got[i + 2]));
        if (same) continue;
        diffs++;
        if (firstDiff < 0) firstDiff = i / 4;
      }
      expect(
        diffs,
        `${decoded[view].path} disagrees with a fresh derivation in ${diffs} px (first at ` +
          `(${firstDiff % W},${Math.floor(firstDiff / W)})). The committed sprite is stale — rerun ` +
          '`npx tsx tools/comfy/player-views.ts derive`.',
      ).toBe(0);
    }
  });

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * 6. The seam: these bytes exist, and the GAME cannot ask for two of them.
   * ──────────────────────────────────────────────────────────────────────────────────────────── */

  it('the game cannot spell a back or side player key at all — stronger than the files being absent', () => {
    /*
     * ⚠ WHY THIS IS NOT "assert the files are gone". The files are NOT gone — this whole gate
     * decodes them, three tests up. And absence would prove nothing even if they were: `assets/final/`
     * is empty today, so `game/placeholder.ts::textureFor` falls back to a labelled stand-in for
     * EVERY key, and a missing file and a mis-spelled key are indistinguishable at runtime. That
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

    // NON-VACUITY, and the load-bearing half: the derived PNGs this gate protects are named for the
    // views the game just lost, so if the two lanes ever agreed again this would be an empty claim.
    // They do not agree, deliberately — the raw lane still builds and commits back and side.
    expect(existsSync(fileFor('back')), 'the derived back PNG is gone; §0-§4 above now guard nothing').toBe(true);
    expect(existsSync(fileFor('side')), 'the derived side PNG is gone; §0-§4 above now guard nothing').toBe(true);
    expect(decoded.back.opaque, 'the back sprite this gate guards decoded empty').toBeGreaterThan(0);
    expect(decoded.side.opaque, 'the side sprite this gate guards decoded empty').toBeGreaterThan(0);
  });
});
