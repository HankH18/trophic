/**
 * tools/comfy/output-check.ts — is the thing that came back an image at all?
 *
 * WHY THIS EXISTS. On 2026-08-26 Comfy Cloud began returning **pure black 1024² PNGs** while
 * reporting `execution_success` over the WebSocket, and billing for each one. Every layer of this
 * pipeline agreed it had worked: `client.ts` saw a clean `executed` message with an image in it,
 * `saveAll` wrote a valid 5.6 kB PNG, the sha256 hashed fine, and `record()` set `status: "raw"`
 * with a recorded seed, prompt hash and workflow hash. Ten images were paid for before a human
 * opened one. The manifest would have carried them as generated art indefinitely.
 *
 * The gap is that every check in the runner is about the TRANSPORT — did a file arrive, does it
 * hash, did the graph match. Nothing asked whether the file contains a picture. This does, and it
 * is deliberately the crudest possible question: a real asset of any class in this project — a
 * creature on white, a UI frame, a 1024² painted map — has variation in it. A single flat colour
 * has none.
 *
 * It is NOT an art-quality judgement and must not grow into one. Whether the picture is any good is
 * `tools/artverify`'s question and it is answered by a reviewer, not a threshold. This answers only
 * "did the generator produce pixels", which is the one thing a number can settle honestly.
 */
import sharp from 'sharp';

export interface OutputStats {
  /** Mean of the R, G and B channel means, 0–255. */
  mean: number;
  /** The LARGEST per-channel standard deviation. Zero on a single flat colour. */
  maxStdev: number;
}

/**
 * A flat image has no standard deviation. The bar is set at 1.0 rather than 0 so that PNG
 * quantisation noise or a one-pixel watermark cannot smuggle a blank frame past it.
 */
export const FLAT_STDEV = 1.0;

/**
 * The observed fault was mean 0.0 exactly. The bar is 2.0 so a near-black frame with a few stray
 * lit pixels is still caught — no class in this project ships an image that is almost entirely
 * black, including the Duskhollow and Sanctum night maps, which carry lamps, stone and turf.
 */
export const NEAR_BLACK_MEAN = 2.0;

export async function statsOf(png: Buffer | string): Promise<OutputStats> {
  const s = await sharp(png).stats();
  const rgb = s.channels.slice(0, 3);
  return {
    mean: rgb.reduce((a, c) => a + c.mean, 0) / rgb.length,
    maxStdev: Math.max(...rgb.map((c) => c.stdev)),
  };
}

/**
 * The reason this output is not a picture, or `null` if it is one.
 *
 * Returning the sentence rather than a boolean is the point: it lands verbatim in the row's
 * `reviewReason`, so whoever reads the manifest afterwards is told what was measured and what the
 * bar was, instead of finding a row marked `failed` with nothing to go on.
 */
export function degenerateReason(st: OutputStats): string | null {
  if (st.maxStdev < FLAT_STDEV) {
    return (
      `the generated image is a single flat colour (largest per-channel stdev ${st.maxStdev.toFixed(3)}, ` +
      `below ${FLAT_STDEV}; mean ${st.mean.toFixed(1)}). The job reported success and was billed, but ` +
      `no picture was produced — this is the Comfy Cloud black-output fault of 2026-08-26. Probe the ` +
      `service with \`npx tsx tools/comfy/health-probe.ts\` before re-running the batch.`
    );
  }
  if (st.mean < NEAR_BLACK_MEAN) {
    return (
      `the generated image is very nearly black (mean ${st.mean.toFixed(2)}, below ${NEAR_BLACK_MEAN}). ` +
      `The job reported success and was billed. No asset class in this project is an almost entirely ` +
      `black frame; probe with \`npx tsx tools/comfy/health-probe.ts\` before re-running.`
    );
  }
  return null;
}
