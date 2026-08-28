/**
 * tools/comfy/controlnet-graph.ts — attach a Z-Image Fun ControlNet to the locked base graph.
 *
 * ── THE WIRING, VERIFIED AGAINST THE LIVE SERVER ──────────────────────────────────────────────
 * `GET /api/object_info` on cloud.comfy.org (3698 node classes) says, verbatim:
 *
 *   ModelPatchLoader      required { name: <enum> }                       -> MODEL_PATCH
 *   ZImageFunControlnet   required { model: MODEL, model_patch: MODEL_PATCH, vae: VAE,
 *                                    strength: FLOAT default 1.0, min -10, max 10 }
 *                         optional { image: IMAGE, inpaint_image: IMAGE, mask: MASK }
 *                                                                          -> MODEL
 *
 * The input is `name`, NOT `model_patch_name` — an earlier session's note was carried in a head and
 * is written down here so nobody has to re-query for it. `image` is OPTIONAL in the schema, which
 * matters: a graph that forgets to wire it VALIDATES and RUNS, produces a perfectly good picture
 * with no conditioning at all, and bills in full. `withControlnet` therefore always wires an image
 * and throws rather than emitting a patch with a dangling hint.
 *
 * ── WHERE THE PATCH GOES ──────────────────────────────────────────────────────────────────────
 * BEFORE `ModelSamplingAuraFlow`. The chain this builds is
 *
 *   UNETLoader -> [LoraLoaderModelOnly] -> ZImageFunControlnet -> ModelSamplingAuraFlow -> KSampler
 *
 * so the shift-3 sampling patch is the last thing applied to the model, exactly as in the locked
 * base graph. Only `ModelSamplingAuraFlow`'s own `model` input is rewired — a blanket "rewire every
 * consumer" would also capture the ControlNet's own `model` input and build a self-loop.
 *
 * ── WHAT IS LOCKED AND NOT TOUCHED HERE ───────────────────────────────────────────────────────
 * KSampler cfg 1.0 / 8 steps / res_multistep / simple / 1024², ModelSamplingAuraFlow shift 3, the
 * UNET, the CLIP and the VAE are build-doc L4/§9.2 and this file changes none of them. It adds
 * three nodes to an in-memory COPY; `tools/comfy/pixel-txt2img-api.json` is never written, because
 * `tests/gates/workflow-lock.test.ts` hashes it and 288 recorded rows are reproducible only while
 * those bytes hold still.
 */
import type { Graph } from './client.ts';

export class ControlnetGraphError extends Error {}

/** The Union ControlNet built for this UNET at 8 steps. Confirmed present in ModelPatchLoader's enum. */
export const CONTROLNET_PATCH = 'Z-Image-Turbo-Fun-Controlnet-Union-2.1-lite-2601-8steps.safetensors';

export interface ControlnetOptions {
  /** Filename the Comfy server knows the hint image by — the return of `uploadInitImage`. */
  imageName: string;
  /** 0 disables the patch's contribution; 1.0 is the node default; 0.9 destroyed the art once. */
  strength: number;
  patchName?: string;
}

function findByClass(g: Graph, cls: string): [string, Graph[string]] {
  const hit = Object.entries(g).find(([, n]) => n.class_type === cls);
  if (!hit) throw new ControlnetGraphError(`base graph has no ${cls}`);
  return hit as [string, Graph[string]];
}

function nextId(g: Graph): number {
  return Math.max(...Object.keys(g).map(Number).filter(Number.isFinite)) + 1;
}

/**
 * Splice `ZImageFunControlnet` in ahead of `ModelSamplingAuraFlow`, fed by a fresh `LoadImage`.
 * Never mutates `base`.
 */
export function withControlnet(base: Graph, o: ControlnetOptions): Graph {
  if (!o.imageName) {
    throw new ControlnetGraphError(
      'withControlnet needs a hint image name. `image` is OPTIONAL on ZImageFunControlnet, so a ' +
        'graph missing it runs, bills, and returns an UNCONDITIONED picture that looks fine.',
    );
  }
  if (!Number.isFinite(o.strength)) throw new ControlnetGraphError(`strength ${o.strength} is not a number`);

  const g: Graph = JSON.parse(JSON.stringify(base)) as Graph;
  const [msId, ms] = findByClass(g, 'ModelSamplingAuraFlow');
  const [vaeId] = findByClass(g, 'VAELoader');

  const modelSource = ms.inputs.model;
  if (!Array.isArray(modelSource)) {
    throw new ControlnetGraphError(`${msId}.model is not a link — cannot splice a patch in front of it`);
  }

  const base0 = nextId(g);
  const loadId = String(base0);
  const patchId = String(base0 + 1);
  const cnId = String(base0 + 2);

  g[loadId] = { class_type: 'LoadImage', inputs: { image: o.imageName, upload: 'image' } };
  g[patchId] = { class_type: 'ModelPatchLoader', inputs: { name: o.patchName ?? CONTROLNET_PATCH } };
  g[cnId] = {
    class_type: 'ZImageFunControlnet',
    inputs: {
      model: modelSource,
      model_patch: [patchId, 0],
      vae: [vaeId, 0],
      strength: o.strength,
      image: [loadId, 0],
    },
  };
  ms.inputs.model = [cnId, 0];
  return g;
}
