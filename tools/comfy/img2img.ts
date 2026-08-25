/**
 * tools/comfy/img2img.ts — the img2img graph (build-doc §9.5 map year variants, §9.6 walk cycle).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  THIS GRAPH HAS NEVER BEEN RUN. Its first real execution is a SUPERVISED GATE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * tools/comfy/README.md is explicit: the img2img workflow "does not exist and cannot be retrieved;
 * it was never trialled". So this file is not a port of something known-good — it is the stock
 * Comfy Cloud img2img shape (`LoadImage` → `VAEEncode` → KSampler.latent_image, denoise < 1)
 * grafted onto the VALIDATED txt2img graph so that every other parameter — the z_image_turbo UNET,
 * the qwen_3_4b lumina2 CLIP, the `ae` VAE, `ModelSamplingAuraFlow` shift 3, 8 steps, cfg 1.0,
 * res_multistep, simple — is byte-identical to the trial that produced the approved art (§9.2 +
 * DEVIATIONS-lane-b B-D2). The graph is BUILT from the trial rather than authored beside it, so the
 * two cannot drift.
 *
 * What is unverified, and must be checked by a human on the first run:
 *   1. `POST /api/upload/image` — local ComfyUI's upload endpoint. Comfy Cloud's `/api/history`
 *      turned out not to exist (B-D8), so no cloud endpoint is assumed to work until it has.
 *      `uploadInitImage` reports the raw status text on failure instead of retrying, because a
 *      retry against a wrong endpoint just bills twice.
 *   2. Whether `VAEEncode` accepts this VAE at 1024² without a resize node in between.
 *   3. Whether the denoise ladder (§8.2: start 0.35, step −0.05, floor 0.2) actually holds map
 *      layout — that is what tools/overlay-diff measures, and it is the whole point of §9.5.
 *
 * `runSmoke()` is therefore ONE image. It refuses to run a batch (`SupervisedGateError`), so the
 * untrialed path cannot be pointed at 28 map variants by an agent in a hurry.
 */
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ComfyClient, ComfyError, loadEnv, type ComfyEnv, type Graph } from './client.ts';

export class SupervisedGateError extends Error {}
export class Img2ImgError extends Error {}

export interface Img2ImgOptions {
  /** The filename the Comfy server knows the init image by — the result of `uploadInitImage`. */
  initImageName: string;
  /** §8.2 denoise ladder: start 0.35, step −0.05, floor 0.2. Must be < 1 or this is txt2img. */
  denoise: number;
  positive?: string;
  negative?: string;
  seed?: number;
}

/** Every node id in the base graph is a numeric string; the next free one is max + 1. */
function nextNodeIds(g: Graph, count: number): string[] {
  let max = 0;
  for (const id of Object.keys(g)) {
    const n = Number(id);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return Array.from({ length: count }, (_, i) => String(max + 1 + i));
}

function findByClass(g: Graph, classType: string): Array<[string, Graph[string]]> {
  return Object.entries(g).filter(([, n]) => n.class_type === classType) as Array<[string, Graph[string]]>;
}

function only(g: Graph, classType: string): [string, NonNullable<Graph[string]>] {
  const hits = findByClass(g, classType);
  if (hits.length !== 1) {
    throw new Img2ImgError(`base graph has ${hits.length} ${classType} nodes, expected exactly 1`);
  }
  const [id, node] = hits[0]!;
  return [id, node!];
}

/**
 * Build the img2img graph from the validated txt2img graph.
 *
 * The edit is deliberately minimal and structural: `EmptySD3LatentImage` is REPLACED (not left
 * dangling) by `LoadImage` → `VAEEncode`, the VAEEncode borrows the graph's existing `VAELoader`
 * rather than adding a second loader, and `denoise` moves off 1.0. Nothing else is touched — the
 * sampler, the model chain and both text encoders keep whatever the trial set.
 */
export function buildImg2ImgGraph(base: Graph, o: Img2ImgOptions): Graph {
  if (!(o.denoise > 0 && o.denoise < 1)) {
    throw new Img2ImgError(`denoise ${o.denoise} is not in (0, 1) — at 1.0 this is txt2img, not img2img`);
  }
  if (!o.initImageName) throw new Img2ImgError('img2img needs an init image name');

  const g: Graph = JSON.parse(JSON.stringify(base)) as Graph;
  const [ksId, ks] = only(g, 'KSampler');
  const [vaeLoaderId] = only(g, 'VAELoader');
  const [latentId] = only(g, 'EmptySD3LatentImage');
  const [loadId, encodeId] = nextNodeIds(g, 2) as [string, string];

  g[loadId] = { class_type: 'LoadImage', inputs: { image: o.initImageName, upload: 'image' } };
  g[encodeId] = { class_type: 'VAEEncode', inputs: { pixels: [loadId, 0], vae: [vaeLoaderId, 0] } };

  ks.inputs.latent_image = [encodeId, 0];
  ks.inputs.denoise = o.denoise;
  if (o.seed !== undefined) ks.inputs.seed = o.seed;

  // Drop the now-unreferenced latent source so the submitted graph has no dead node.
  delete g[latentId];

  const negRef = (ks.inputs as { negative?: [string, number] }).negative?.[0];
  const posRef = (ks.inputs as { positive?: [string, number] }).positive?.[0];
  for (const [id, node] of findByClass(g, 'CLIPTextEncode')) {
    if (o.positive !== undefined && id === posRef) node!.inputs.text = o.positive;
    if (o.negative !== undefined && id === negRef) node!.inputs.text = o.negative;
  }
  if (!g[ksId]) throw new Img2ImgError('KSampler vanished while rewiring — this is a bug');
  return g;
}

/**
 * Upload an init image so `LoadImage` can find it. UNVERIFIED against Comfy Cloud — see the header.
 * Returns the name the graph should reference (subfolder-qualified when the server says so).
 */
export async function uploadInitImage(env: ComfyEnv, filePath: string, name?: string): Promise<string> {
  const bytes = await readFile(filePath);
  const filename = name ?? basename(filePath);
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), filename);
  form.append('overwrite', 'true');
  const r = await fetch(`${env.host}/api/upload/image`, {
    method: 'POST',
    headers: { 'X-API-Key': env.key },
    body: form,
  });
  const text = await r.text();
  if (!r.ok) {
    throw new ComfyError(
      `POST /api/upload/image -> ${r.status}: ${text.slice(0, 500)}\n` +
        'This endpoint is UNVERIFIED on Comfy Cloud (B-D8 showed /api/history is absent there). ' +
        'Do not add a retry loop around it — confirm the endpoint first.',
    );
  }
  const body = JSON.parse(text) as { name?: string; subfolder?: string };
  if (!body.name) throw new ComfyError(`POST /api/upload/image returned no name: ${text.slice(0, 300)}`);
  return body.subfolder ? `${body.subfolder}/${body.name}` : body.name;
}

export interface SmokeOptions {
  initImagePath: string;
  positive: string;
  negative: string;
  seed: number;
  denoise: number;
  outPath: string;
  /** Guard: this path is a SUPERVISED gate and generates exactly one image. */
  images?: number;
}

/**
 * The supervised smoke path: upload one init image, run one generation, save one file.
 * Refuses anything larger — the batch runner has no img2img fast path for exactly this reason.
 */
export async function runSmoke(opts: SmokeOptions, env?: ComfyEnv, basePath?: string): Promise<string> {
  if (opts.images !== undefined && opts.images !== 1) {
    throw new SupervisedGateError(
      `img2img is an untrialed class (§9.5/§9.6): its first run is a SUPERVISED gate of ONE image, ` +
        `not ${opts.images}. Run the smoke, have it reviewed, then log the result in DEVIATIONS-lane-b.md.`,
    );
  }
  const e = env ?? (await loadEnv());
  const client = new ComfyClient(e);
  const base = JSON.parse(
    await readFile(basePath ?? resolve(REPO_ROOT, 'tools/comfy/pixel-txt2img-api.json'), 'utf8'),
  ) as Graph;
  const initName = await uploadInitImage(e, opts.initImagePath);
  const graph = buildImg2ImgGraph(base, {
    initImageName: initName,
    denoise: opts.denoise,
    positive: opts.positive,
    negative: opts.negative,
    seed: opts.seed,
  });
  const outputs = await client.run(graph, {
    onProgress: (v, m) => process.stdout.write(`\r  img2img smoke  step ${v}/${m}   `),
  });
  const written = await client.saveAll(outputs, () => opts.outPath);
  const first = written[0];
  if (!first) throw new ComfyError('img2img smoke produced no image');
  return first;
}

export const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

/* ────────────────────────────────────────────────────────────────────────────
 * CLI — guarded so importing this module (tests, comfy-batch) runs nothing.
 * ──────────────────────────────────────────────────────────────────────────── */

function isEntrypoint(): boolean {
  const argv1 = process.argv[1];
  return argv1 !== undefined && resolve(argv1) === resolve(fileURLToPath(import.meta.url));
}

if (isEntrypoint()) {
  const arg = (k: string): string | undefined => {
    const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
    return hit?.slice(k.length + 3);
  };
  const init = arg('init');
  const out = arg('out');
  if (!init || !out) {
    console.error(
      'img2img SUPERVISED smoke — one image, never a batch.\n\n' +
        '  npx tsx tools/comfy/img2img.ts --init=<png> --out=<png> \\\n' +
        '      [--prompt="…"] [--negative="…"] [--seed=42] [--denoise=0.35]\n\n' +
        'The graph has never been executed. Review the output before anything else uses this path\n' +
        '(build-doc §9.5 map variants / §9.6 walk cycle), and log what you learn in\n' +
        'docs/DEVIATIONS-lane-b.md.',
    );
    process.exit(2);
  }
  // A malformed --seed or --denoise must refuse, not become NaN: `buildImg2ImgGraph` would reject
  // NaN denoise with a confusing message, and a NaN seed would be submitted and billed.
  const numArg = (k: string, fallback: number): number => {
    const raw = arg(k);
    if (raw === undefined) return fallback;
    const v = Number(raw);
    if (!Number.isFinite(v)) {
      console.error(`--${k}=${raw} is not a number`);
      process.exit(2);
    }
    return v;
  };
  const path = await runSmoke({
    initImagePath: init,
    outPath: out,
    positive: arg('prompt') ?? '',
    negative: arg('negative') ?? '',
    seed: numArg('seed', 42),
    denoise: numArg('denoise', 0.35),
    images: 1,
  });
  console.log(`\nimg2img smoke -> ${path}`);
}
