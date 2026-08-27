/**
 * tools/comfy/health-probe.ts — is Comfy Cloud actually producing images right now?
 *
 * This exists because of a failure mode that costs money silently. On 2026-08-26 the cloud began
 * returning **pure black 1024² images** while reporting `execution_success` over the WebSocket and
 * billing for every one. Nothing in the pipeline noticed: `client.ts` saw a clean `executed`
 * message, `comfy-batch.ts` wrote `status: "raw"` and a sha256, and ten images were paid for before
 * a human looked at one. The tell was mean RGB 0/0/0 and a 5.6 kB PNG.
 *
 * Two properties matter and both were measured on that fault:
 *  - A prompt+seed pair that has run BEFORE still comes back correct and byte-identical, so probing
 *    with a fixed prompt would have reported healthy throughout. The probe therefore varies the seed
 *    every attempt: it must be NEW work or it proves nothing.
 *  - The latent is 256² rather than the pipeline's 1024², because a health check should be the
 *    cheapest generation that can still go black, not a full-size one.
 *
 * Exit 0 = a non-black image came back. Exit 1 = still black / still failing when the deadline hit.
 */
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { ComfyClient, injectGraph, loadEnv, type Graph } from './client.ts';

/** Below this mean channel value across the whole image, the generation is the black-output fault. */
const BLACK_MEAN = 1.0;

export async function probeOnce(seed: number): Promise<{ ok: boolean; mean: number; bytes: number }> {
  const env = await loadEnv();
  const client = new ComfyClient(env);
  const base = JSON.parse(await readFile('tools/comfy/pixel-txt2img-api.json', 'utf8')) as Graph;

  // Shrink the latent. The fault is in generation, not in resolution, so a 256² probe reproduces it
  // at a fraction of the cost of a 1024² one.
  const g = injectGraph(base, { positive: `pixel art green leaf on a white background, test ${seed}`, seed });
  for (const node of Object.values(g)) {
    if (node.class_type === 'EmptySD3LatentImage') { node.inputs.width = 256; node.inputs.height = 256; }
  }

  const outputs = await client.run(g, { timeoutMs: 180_000 });
  const img = Object.values(outputs).flatMap((o) => o.images ?? [])[0];
  if (!img) return { ok: false, mean: -1, bytes: 0 };
  const buf = await client.download(img);
  const stats = await sharp(buf).stats();
  const mean = stats.channels.slice(0, 3).reduce((a, c) => a + c.mean, 0) / 3;
  return { ok: mean > BLACK_MEAN, mean, bytes: buf.length };
}

const invokedDirectly = process.argv[1]?.endsWith('health-probe.ts');
if (invokedDirectly) {
  const opt = (k: string, d: number) => Number(process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d);
  const everySec = opt('every', 300);
  const maxMin = opt('max-minutes', 120);
  const deadline = Date.now() + maxMin * 60_000;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;
    // A fresh seed every attempt — see the header. A repeat proves nothing.
    const seed = 900_000 + attempt * 7919 + (Date.now() % 1000);
    const stamp = new Date().toISOString().slice(11, 19);
    try {
      const r = await probeOnce(seed);
      console.log(`${stamp}  probe ${attempt}  seed=${seed}  mean=${r.mean.toFixed(2)}  bytes=${r.bytes}  ${r.ok ? 'OK — cloud is producing images again' : 'BLACK'}`);
      if (r.ok) process.exit(0);
    } catch (e) {
      console.log(`${stamp}  probe ${attempt}  seed=${seed}  ERROR: ${e}`);
    }
    await new Promise((res) => setTimeout(res, everySec * 1000));
  }
  console.log(`gave up after ${maxMin} minutes — cloud still returning black`);
  process.exit(1);
}
