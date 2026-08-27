/**
 * tools/comfy/output-check.ts — the guard that says "this is not a picture".
 *
 * It exists because of a real, billed failure: on 2026-08-26 Comfy Cloud returned pure black 1024²
 * PNGs while reporting `execution_success`, and every existing check passed them. So the cases
 * below are not hypotheticals — the first one is the exact shape of what came back, and the last
 * two are the assets that must NOT be caught, because a guard that rejects a real sprite is worse
 * than the fault it replaces.
 *
 * §9.1: no pipeline test touches the network. Every fixture here is built in memory.
 */
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { degenerateReason, statsOf, FLAT_STDEV, NEAR_BLACK_MEAN } from '../../tools/comfy/output-check.ts';

const flat = (r: number, g: number, b: number, size = 128): Promise<Buffer> =>
  sharp({ create: { width: size, height: size, channels: 3, background: { r, g, b } } }).png().toBuffer();

/** A crude stand-in for a real asset: a coloured field with a darker shape on it. */
async function shapeOnGround(bg: { r: number; g: number; b: number }, fg: { r: number; g: number; b: number }): Promise<Buffer> {
  const size = 128;
  const patch = await sharp({ create: { width: 40, height: 40, channels: 3, background: fg } }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background: bg } })
    .composite([{ input: patch, left: 44, top: 44 }])
    .png()
    .toBuffer();
}

describe('the black-output guard', () => {
  it('CATCHES the exact fault it was written for — a pure black frame', async () => {
    const reason = degenerateReason(await statsOf(await flat(0, 0, 0)));
    expect(reason).not.toBeNull();
    // The sentence is the whole product: it lands verbatim in the row's reviewReason.
    expect(reason).toContain('single flat colour');
    expect(reason).toContain('health-probe');
  });

  it('catches a flat frame of ANY colour, not only black', async () => {
    // The fault presented as black, but a flat white or flat magenta frame is equally not a picture,
    // and a guard keyed only on darkness would miss a VAE that fails the other way.
    for (const c of [[255, 255, 255], [255, 0, 255], [128, 128, 128]] as const) {
      expect(degenerateReason(await statsOf(await flat(c[0], c[1], c[2])))).toContain('single flat colour');
    }
  });

  it('catches a near-black frame that has a few lit pixels', async () => {
    // Variance alone would let this through: a handful of bright pixels lifts the stdev over
    // FLAT_STDEV while the frame is still not an asset. NEAR_BLACK_MEAN is the second clause.
    // 8x8 white on 512x512: enough lit pixels to lift the stdev clear of FLAT_STDEV (a 2x2 speck
    // measures 0.996 and does not), while the mean stays at 0.06 — far under NEAR_BLACK_MEAN.
    const speck = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
    const png = await sharp({ create: { width: 512, height: 512, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .composite([{ input: speck, left: 10, top: 10 }])
      .png()
      .toBuffer();
    const st = await statsOf(png);
    expect(st.maxStdev).toBeGreaterThan(FLAT_STDEV);   // the first clause does NOT catch it
    expect(st.mean).toBeLessThan(NEAR_BLACK_MEAN);
    expect(degenerateReason(st)).toContain('nearly black');
  });

  it('PASSES a sprite on a plain white background — the commonest real asset shape', async () => {
    // build-doc §9.2: every pixel class but the maps generates on "plain white background", so most
    // of a real creature/trainer/NPC frame IS one flat colour. If the guard failed this it would
    // reject 200 of the 288 manifest rows.
    expect(degenerateReason(await statsOf(await shapeOnGround({ r: 255, g: 255, b: 255 }, { r: 40, g: 90, b: 40 })))).toBeNull();
  });

  it('PASSES a dark night map — the asset closest to the fault', async () => {
    // Duskhollow and the Sanctum are painted in cold blue half-light, which is the legitimate asset
    // that sits nearest a black frame. It must survive: lamps, stone and turf on a dark ground.
    expect(degenerateReason(await statsOf(await shapeOnGround({ r: 14, g: 18, b: 34 }, { r: 220, g: 190, b: 120 })))).toBeNull();
  });
});
