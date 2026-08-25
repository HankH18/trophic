/**
 * tools/comfy/comfy-batch.ts — the §9.1 manifest runner, and the manifest's own derivation.
 *
 * §9.1: "`comfy-batch.ts` loads `manifest.json`, injects `{prompt, seed, denoise, init_image}` per
 * row, submits, polls/WebSockets, downloads to `assets/raw/<class>/<assetId>.png`, and records
 * `{assetId, seed, workflowHash, timestamp}` back into the manifest. Concurrency: respect tier
 * limit; retry ×2 on failure then flag for supervised review. Credits are shared with the UI pool —
 * the runner prints a projected-credit estimate before any batch ≥ 20 items and requires
 * `--confirm` (SUPERVISED)."
 *
 * Three things here are load-bearing beyond "it submits jobs":
 *
 * G5 (seed reuse) IS ENFORCED IN CODE, NOT BY CONVENTION. A row's seed is a pure function of its
 * `id` and its `version` — `hashSeed(version, id)` using core/rng.ts's own FNV-1a, so there is no
 * second generator in the repo (G11). The first successful generation freezes `recordedSeed`
 * TOGETHER WITH the version it was recorded at (`recordedVersion`), and that pairing is what makes
 * both halves of §8.4 work:
 *
 *   · at the SAME version, a row whose derivation has moved away from its recorded seed is refused
 *     on the submit path (`seedForSubmit` → `SeedReuseError`) and on rebuild. The refusal is live:
 *     `seedForSubmit` hands `assertSeedReuse` the freshly DERIVED seed, so the two can disagree.
 *     An earlier version passed it the recorded seed it had just chosen, which made the guard
 *     structurally incapable of throwing — a check that could only ever compare a value to itself.
 *   · bumping the row's `version` IS the "unless the manifest entry is versioned" escape §8.4
 *     licenses, and it now actually reseeds. Versions live in `manifest._versions` so they survive
 *     `rebuild` (an earlier version hard-coded `version = 1` in the derivation, so an operator's
 *     bump was silently reverted and the old seed came back while they believed they had reseeded).
 *     A bump supersedes the art the old seed produced, so rebuild resets that row to `pending`
 *     rather than leaving a record pointing at a file the row no longer asks for.
 *
 * G13 (credit gate) IS A REFUSAL, NOT A WARNING. `assertBatchApproved` throws for any batch of 20 or
 * more rows without `--confirm`. It prints what it can honestly project: DEVIATIONS-lane-b B-D10
 * found NO credit-balance endpoint on Comfy Cloud, so when nobody has measured the per-image cost
 * the estimator says so in as many words rather than inventing a plausible number.
 *
 * THE SUPERVISED GATES ARE REFUSALS TOO (`assertSupervised`). `row.gate` and a class's
 * `trialled: false` used to be strings nothing read: `run --class=map-variant --confirm` planned 28
 * rows through an img2img graph that has never been executed, and `run --class=player` submitted six
 * img2img walk frames with no `--confirm` at all because eight rows sit under the credit gate. Now a
 * gated row needs `--confirm`, an untrialed class needs `--confirm`, and while the img2img graph is
 * untrialed (`manifest._img2img.trialled`) at most ONE img2img row may be planned per invocation —
 * which is the same promise `img2img.ts`'s `runSmoke` makes, finally made on the batch path too.
 *
 * G4 IS ENFORCED HERE, NOT DOCUMENTED HERE. Every `map-variant` row is run through
 * `tools/overlay-diff` against its node's own base map and collision mask before its status can
 * become anything but `failed`; a rejected candidate walks the §9.5 denoise ladder
 * (`nextDenoise`, capped by `balance.overlayDiff.maxRegenAttempts`) and, when the ladder is spent,
 * the row is flagged for supervised review. Before this, `overlayDiff()` had no caller anywhere in
 * the pipeline and a year variant could be produced and marked complete without the gate ever
 * running.
 *
 * G2 (no invented content) IS STRUCTURAL. `rows[]` is derived — from data/species.json,
 * data/gyms.json, data/nodes/*.json and core/types.ts's PROP_KINDS — and tests/unit/manifest.test.ts
 * fails if the committed rows differ from a fresh derivation. A creature cannot get a sprite without
 * being in species.json, and a node's `mapAsset` path is copied from the node file rather than
 * rebuilt from a naming convention, which closes the hole LANE-A-STATUS §4 flags ("a typo in a
 * mapAsset path will not be caught by any Lane A test").
 *
 * Importing this module runs nothing; the CLI is behind an entrypoint guard at the bottom.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ComfyClient,
  ComfyError,
  injectGraph,
  loadEnv,
  type ComfyEnv,
  type Graph,
  type NodeOutputs,
} from './client.ts';
import { buildImg2ImgGraph, uploadInitImage } from './img2img.ts';
import { nextDenoise, overlayDiff } from '../overlay-diff/diff.ts';
import { collisionGrid, denoiseLadder, overlayDiffConfig } from '../overlay-diff/config.ts';
import { readRaster } from '../postprocess/raster.ts';
import { hashSeed } from '../../core/rng.ts';
import { validateContent } from '../../core/schemas.ts';
import { AGE_CLASSES, PROP_KINDS } from '../../core/types.ts';
import type { AgeClass, Content, NodeFile, SpeciesLine } from '../../core/types.ts';

export const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
export const MANIFEST_PATH = resolve(REPO_ROOT, 'tools/comfy/manifest.json');
export const BASE_GRAPH_PATH = resolve(REPO_ROOT, 'tools/comfy/pixel-txt2img-api.json');

/* ════════════════════════════════════════════════════════════════════════════
 * Manifest shape (build-doc §9.7)
 * ════════════════════════════════════════════════════════════════════════════ */

export type RowStatus = 'pending' | 'raw' | 'final' | 'approved' | 'failed';

/** The half of a row that is DERIVED. Regenerating the manifest must reproduce this exactly. */
export interface RowSpec {
  id: string;
  class: string;
  subject: string;
  view: string;
  prompt: string;
  negative: string;
  targetSize: string;
  version: number;
  seed: number;
  mode: 'txt2img' | 'img2img';
  /** Where this row came from in data/ or in the manifest's authored blocks — G2 traceability. */
  origin: string;
  /** Post-processed destination. For maps this is copied from the node file's own `mapAsset`. */
  finalFile: string;
  initImage?: string;
  denoise?: number;
  /** Set when a row may not be published without passing another gate first. */
  gate?: string;
}

/** The half of a row the runner WRITES BACK. Preserved across a manifest rebuild. */
export interface RowRecord {
  status: RowStatus;
  /** Frozen on first success. G5: a regeneration must reuse it. */
  recordedSeed?: number;
  /**
   * The `version` `recordedSeed` was frozen at. Without it "reuse the manifest seed" and "unless the
   * entry is versioned" (§8.4) cannot both be honoured: the guard could not tell a drifted
   * derivation (refuse) from a deliberate reseed (allow).
   */
  recordedVersion?: number;
  /**
   * `promptIdentity(row)` at the moment the art was generated. §8.4 makes an approved asset's
   * identity **prompt + seed**, and seeds are `hashSeed(version, id)` — a pure function of the id,
   * blind to the prompt. Without this, rewriting a `subject` in the manifest header changed what
   * every affected row would generate while its record still claimed the old file: verified by
   * rewriting `_player.subject` to a different character and running `rebuild`, which accepted it
   * silently and left player-front `approved` with the sha256 of art the OLD prompt produced.
   */
  recordedPromptHash?: string;
  workflowHash?: string;
  timestamp?: string;
  file?: string;
  /** sha256 of the file on disk — the evidence the B1 gate needs for "reproduced byte-identically". */
  sha256?: string;
  attempts?: number;
  flaggedForReview?: boolean;
  reviewReason?: string;
  /**
   * The record a human sign-off left, kept when a regeneration supersedes it.
   *
   * `player-front` is the only approved row in the manifest and build-doc §15 makes it the style
   * lock for the whole pipeline, yet `run --force --id=player-front` needed no `--confirm`, set
   * `status: 'raw'`, repointed `file` away from assets/approved-trials/player-APPROVED.png and
   * overwrote the approved sha256 — erasing the only machine-readable record of what was signed off
   * at gate B0. The regeneration now needs `--confirm`, and what it replaces is kept here rather
   * than deleted: the PNG on disk was never the thing at risk, the record was.
   */
  supersededApproval?: {
    status: RowStatus;
    file?: string;
    sha256?: string;
    recordedSeed?: number;
    recordedPromptHash?: string;
    timestamp?: string;
    supersededAt: string;
  };
  /** For §8.2-gated rows: the IoU the accepted candidate scored, and the denoise it was made at. */
  layoutGate?: { iou: number; threshold: number; denoise: number; largestDrift: number };
}

export type ManifestRow = RowSpec & RowRecord;

export interface ClassSpec {
  trialled: boolean;
  mode: 'txt2img' | 'img2img';
  skeleton: string;
  negative: string;
  targetW: number;
  targetH: number;
  rawDir: string;
  finalDir: string;
  views: Record<string, string>;
  postprocess: {
    trim: boolean;
    fit: boolean;
    quantize: boolean;
    removeBackground: boolean;
    atlas: string | null;
    backgroundTolerance: number;
    /** The DECLARED flat background colour — `plain white background` from the §9.2 skeleton. */
    backgroundKey: string;
  };
}

export interface ManifestFile {
  schemaVersion: number;
  workflowGraph: string;
  negatives: Record<string, string>;
  classes: Record<string, ClassSpec>;
  rows: ManifestRow[];
  /**
   * §8.4's versioned escape, persisted. `deriveRows` reads a row's version from here, so bumping it
   * survives `rebuild` and actually moves the seed. Absent id ⇒ version 1.
   */
  _versions?: Record<string, number>;
  /**
   * Whether the img2img graph has ever been executed and reviewed. While false, `assertSupervised`
   * allows at most ONE img2img row per invocation — §9.5/§9.6 call the first run a SUPERVISED gate,
   * and tools/comfy/README.md records that the graph "was never trialled".
   */
  _img2img?: { trialled: boolean; [k: string]: unknown };
  _credits: { perImageCredits: number | null; measuredFrom: string | null; [k: string]: unknown };
  _concepts: Record<string, { text?: string; derivedFrom?: string; source: string }>;
  _nodes: Record<string, { kind: string; feature: string; agingArc: string; slice: boolean; [k: string]: unknown }>;
  _trainers: Record<string, { subject: string; source: string }>;
  _npcs: Record<string, { subject: string; source: string }>;
  _props: Record<string, { subject: string; source: string }>;
  _ui: Record<string, { subject: string; w: number; h: number; source: string }>;
  _ageWords: Record<string, string>;
  _player: {
    l6Verbatim: string;
    subject: string;
    seedPin: number;
    statics: string[];
    walkFrames: string[];
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export class ManifestError extends Error {}
export class SeedReuseError extends Error {}
/** §8.4's other half: an approved asset's identity is prompt + seed, and the prompt moved. */
export class StyleLockError extends Error {}
export class CreditGateError extends Error {}
export class SupervisedGateError extends Error {}
export class LayoutGateError extends Error {}

/**
 * The refusals that are DECISIONS, not faults. Retrying one re-submits the same refusal, and
 * recording one as a failure corrupts the record it was defending.
 */
export function isGuardrail(e: unknown): boolean {
  return (
    e instanceof SeedReuseError ||
    e instanceof StyleLockError ||
    e instanceof SupervisedGateError ||
    e instanceof LayoutGateError ||
    e instanceof CreditGateError ||
    e instanceof ManifestError
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Seeds — G5 / §8.4
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * A row's seed. Pure in (id, version): re-deriving a manifest cannot move a seed, and bumping
 * `version` is the ONLY thing that can. `hashSeed` is core/rng.ts's FNV-1a — the repo's one hash,
 * reused rather than restated (G11 forbids a second generator, and a copy would be exactly that).
 */
export function deriveSeed(id: string, version: number): number {
  return hashSeed(version, id);
}

/**
 * G5, in code. Called on the submit path for every row that has already produced a file.
 *
 * The failure this prevents is quiet and expensive: an agent regenerates a batch, the seeds shift
 * because someone renamed a row or "improved" the derivation, and the approved art silently becomes
 * unreproducible — the style lock (§8.4) is gone and nobody finds out until a reviewer notices the
 * sprites changed.
 */
export function assertSeedReuse(row: ManifestRow, incomingSeed: number): void {
  if (row.recordedSeed === undefined) return;
  if (reseeded(row)) return; // §8.4's licensed escape — the row was deliberately versioned
  if (row.recordedSeed === incomingSeed) return;
  throw new SeedReuseError(
    `${row.id}: seed ${incomingSeed} but this asset was generated with ${row.recordedSeed}. ` +
      `G5 / build-doc §8.4: "any asset regenerated must reuse its manifest seed unless the manifest ` +
      `entry is versioned". Bump the row's \`version\` (currently ${row.version}) to reseed it ` +
      `deliberately — that is the versioned escape, and it leaves a record.`,
  );
}

/** True when the row has been moved to a new version since its seed was recorded. */
export function reseeded(row: ManifestRow): boolean {
  return row.recordedSeed !== undefined && row.recordedVersion !== undefined && row.recordedVersion !== row.version;
}

/**
 * The seed that will actually be submitted for a row.
 *
 * The order matters and is the whole point. `assertSeedReuse` is handed `row.seed` — the seed the
 * DERIVATION produced — not the recorded one, so the two can genuinely disagree and the refusal can
 * fire. (Passing it the recorded seed — the value the function had already chosen — made it a
 * comparison of a value with itself: it could not throw on the live path no matter what the row
 * said.) `row.seed` is only trustworthy because `runBatch` re-derives the whole selection and
 * refuses a row whose derived half has drifted (`assertRowsDerived`); the check below is the local
 * backstop for the one drift that a hand edit produces most easily.
 *
 *   · derivation still agrees with the record → reuse the recorded seed (G5).
 *   · derivation has MOVED under a frozen seed → SeedReuseError. Something renamed the row or
 *     changed the derivation, and the approved art is about to become unreproducible.
 *   · the row has been versioned since → use `row.seed`, which `rebuild` has re-derived at the new
 *     version. That is §8.4's escape, and it is the only way a recorded row's seed may change.
 *   · the row has been versioned and `row.seed` HAS NOT MOVED → SeedReuseError, because the bump
 *     never reached the seed. `row.seed` is written by the derivation, not recomputed here, so a
 *     hand-edited `version` with no `rebuild` behind it carries the old seed and nothing else.
 */
export function seedForSubmit(row: ManifestRow): number {
  if (row.recordedSeed === undefined) return row.seed;
  if (reseeded(row)) {
    // A version bump that has not reached the seed is a WEDGE, not an escape. `row.seed` is written
    // by the derivation and only `rebuild` recomputes it, so an operator who does exactly what
    // `SeedReuseError` tells them to — "bump the row's version" — and then runs `run --force` used
    // to submit the OLD seed, pay for it, record it as if it were a reseed, and leave the manifest
    // in a state `rebuild` refuses to touch. Reproduced end to end on battle-fenmaw-e-front:
    // submitted 4013440965 at version 2, where version 2's seed is 135730188.
    if (row.seed === row.recordedSeed) {
      throw new SeedReuseError(
        `${row.id}: version says ${row.version} but the row still carries the seed recorded at ` +
          `version ${row.recordedVersion} (${row.recordedSeed}). Bumping \`version\` by hand does not ` +
          're-derive the seed — `npx tsx tools/comfy/comfy-batch.ts rebuild` does, and it is what ' +
          'makes §8.4\'s versioned escape real. Submitting now would bill for the seed you are trying ' +
          'to move away from and wedge the manifest against every future rebuild (G5).',
      );
    }
    return row.seed;
  }
  assertSeedReuse(row, row.seed);
  return row.recordedSeed;
}

/**
 * The other half of §8.4's identity, hashed so a manifest diff shows it moved.
 *
 * Prompt AND negative: the frozen negative is part of the style lock (§9.2), and B-D7's cape ban is
 * carried only there. 16 hex chars, matching `workflowHash`, because this is a change detector and
 * not a security boundary.
 */
export function promptIdentity(row: Pick<ManifestRow, 'prompt' | 'negative'>): string {
  return createHash('sha256').update(JSON.stringify([row.prompt, row.negative])).digest('hex').slice(0, 16);
}

/**
 * G5's sibling, and the hole B-D45 closes: `workflowHash` was WRITTEN on every successful row and
 * never read by anything, in `tools/` or in `tests/`. Every guard compared seeds, and a seed is
 * `hashSeed(version, id)` — it cannot see a prompt. So a rewritten `subject` in a manifest header
 * block silently changed what an already-generated row would produce next, while its record went on
 * claiming the file the old prompt made.
 *
 * The escape is the same one §8.4 licenses for seeds: version the row. A bump supersedes the old
 * art, and `rebuildRows` clears the record, so there is nothing left to disagree with.
 */
export function assertStyleLock(row: ManifestRow): void {
  if (row.recordedSeed === undefined) return; // nothing generated yet — nothing to protect
  if (reseeded(row)) return; // §8.4's licensed escape: the old art is superseded
  const now = promptIdentity(row);
  if (row.recordedPromptHash === undefined) {
    throw new StyleLockError(
      `${row.id} has a recorded generation (seed ${row.recordedSeed}) but no recordedPromptHash, so ` +
        'there is no way to tell whether its prompt has moved since. §8.4 makes an approved asset ' +
        "prompt + seed; half of that identity is missing. Record the prompt this row's file was " +
        'generated with (recordedPromptHash) from whatever evidence exists, or bump the row version ' +
        'to supersede the file deliberately.',
    );
  }
  if (row.recordedPromptHash === now) return;
  throw new StyleLockError(
    `${row.id}: the prompt has changed since this asset was generated ` +
      `(recorded ${row.recordedPromptHash}, now ${now}), and the row is still at version ${row.version}. ` +
      'build-doc §8.4 locks an asset to its prompt AND its seed; reusing the seed under a different ' +
      'prompt reproduces nothing. Bump the row\'s `version` to reseed and regenerate deliberately, or ' +
      'restore the prompt (a rewritten subject/concept in a manifest header block is the usual cause).',
  );
}

/**
 * And `workflowHash` itself, finally COMPARED rather than merely recorded.
 *
 * `promptIdentity` covers the two strings §8.4 names. This covers everything else the submitted
 * graph carries — §9.2's locked model chain, 8 steps, cfg 1.0, `res_multistep`, `simple`, 1024², and
 * B-D2's undocumented `ModelSamplingAuraFlow shift: 3` — because `workflowHash` is a hash of the
 * whole injected graph. Editing `pixel-txt2img-api.json` moves it, and that is a style-lock break
 * that no seed and no prompt can see.
 *
 * txt2img ONLY, deliberately: an img2img row's graph carries the §9.5 denoise, which the ladder is
 * SUPPOSED to move down on a rejection, so a hash comparison there would refuse the mechanism §9.5
 * asks for. Those rows are covered by the prompt + seed halves above.
 */
export function assertWorkflowLock(row: ManifestRow, incomingHash: string): void {
  if (row.recordedSeed === undefined || row.workflowHash === undefined) return;
  if (reseeded(row)) return;
  if (row.mode !== 'txt2img') return;
  if (row.workflowHash === incomingHash) return;
  throw new StyleLockError(
    `${row.id}: the submitted graph no longer hashes to the one this asset was generated with ` +
      `(recorded ${row.workflowHash}, now ${incomingHash}), and the prompt, negative and seed all ` +
      'still match — so what moved is the WORKFLOW itself (tools/comfy/pixel-txt2img-api.json, or the ' +
      'injection). §9.2 locks the model, steps, cfg, sampler, scheduler and resolution; §8.4 locks the ' +
      'asset to them. Restore the graph, or bump the row\'s `version` to regenerate under the new one ' +
      'deliberately.',
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * G13 — the credit gate
 * ════════════════════════════════════════════════════════════════════════════ */

export const CREDIT_GATE_ROWS = 20;

/**
 * §9.1's "retry ×2 on failure": 1 try + 2 retries = 3 BILLED generations per regeneration attempt.
 * A pipeline constant, not a gameplay one — G11 governs data/balance.json's tunables, and this is
 * the same family as `edges.ts`'s estimator constants. It lives here so `planBatch` and `runBatch`
 * cannot disagree about the number the human is asked to approve.
 */
export const TRANSPORT_ATTEMPTS = 3;

export interface BatchPlan {
  count: number;
  requiresConfirm: boolean;
  perImageCredits: number | null;
  /** One image per row — the floor, and what the estimate used to report as if it were the answer. */
  projectedCredits: number | null;
  /** Every billed generation the two nested budgets permit. This is the number that can arrive. */
  worstCaseImages: number;
  worstCaseCredits: number | null;
  lines: string[];
}

/**
 * G13's estimate. It reports BOTH the floor and the ceiling, because they differ by up to 9×.
 *
 * The old figure was `perImage × rows.length` — one image per row — while `runRow` nests two budgets
 * that both bill: the §9.1 transport retry (3 generations) inside the §9.5 regen ladder (up to
 * `balance.overlayDiff.maxRegenAttempts` = 3) for layout-gated rows. Reproduced against a stub with
 * a rejecting gate and an intermittent transport: SIX billed generations for ONE map-variant row,
 * worst case nine. Across the 28 map-variant rows that is up to 252 billed generations behind an
 * estimate that printed 28, and client.ts's own header says a retried job "may have run and billed
 * with its output unrecoverable". A human confirming a number they were never shown is not the
 * supervision G13 asks for.
 */
export function planBatch(
  rows: readonly ManifestRow[],
  manifest: ManifestFile,
  budgets?: { transportAttempts?: number; maxRegenAttempts?: number },
): BatchPlan {
  const per = manifest._credits.perImageCredits;
  const attempts = budgets?.transportAttempts ?? TRANSPORT_ATTEMPTS;
  const gatedRows = rows.filter((r) => r.class === LAYOUT_GATED_CLASS).length;
  // Read balance only when the batch actually contains gated rows: a 150-row sprite batch has no
  // business validating all of data/ just to print an estimate.
  const maxRegen =
    gatedRows === 0 ? 1 : Math.max(1, budgets?.maxRegenAttempts ?? denoiseLadder().maxRegenAttempts);
  const worstCaseImages = rows.reduce(
    (n, r) => n + attempts * (r.class === LAYOUT_GATED_CLASS ? maxRegen : 1),
    0,
  );
  const projected = per === null ? null : Number((per * rows.length).toFixed(4));
  const worstCaseCredits = per === null ? null : Number((per * worstCaseImages).toFixed(4));
  const byClass = new Map<string, number>();
  for (const r of rows) byClass.set(r.class, (byClass.get(r.class) ?? 0) + 1);
  const lines = [
    `batch: ${rows.length} row${rows.length === 1 ? '' : 's'}`,
    ...[...byClass.entries()].sort().map(([c, n]) => `  ${c.padEnd(18)} ${n}`),
    `billed generations: ${rows.length} if nothing retries, up to ${worstCaseImages} worst case ` +
      `(§9.1 retries ×${attempts - 1} = ${attempts} per attempt` +
      (gatedRows > 0 ? `; §9.5 reladders a rejected map-variant up to ×${maxRegen}, on ${gatedRows} row(s)` : '') +
      '). A retried job may already have billed.',
    projected === null
      ? 'projected credits: UNKNOWN — per-image cost has never been measured. Comfy Cloud exposes no ' +
        'credit endpoint (DEVIATIONS-lane-b B-D10); read the dashboard before and after a known batch ' +
        'and pass --credits-per-image=N to record it.'
      : `projected credits: ~${projected} best case, up to ~${worstCaseCredits} worst case ` +
        `(${per} per image, measured from ${manifest._credits.measuredFrom ?? 'an unrecorded batch'})`,
  ];
  return {
    count: rows.length,
    requiresConfirm: rows.length >= CREDIT_GATE_ROWS,
    perImageCredits: per,
    projectedCredits: projected,
    worstCaseImages,
    worstCaseCredits,
    lines,
  };
}

/** G13: refuse, do not warn. */
export function assertBatchApproved(plan: BatchPlan, confirmed: boolean): void {
  if (!plan.requiresConfirm || confirmed) return;
  throw new CreditGateError(
    `${plan.count} rows is at or over the ${CREDIT_GATE_ROWS}-row supervised threshold (G13 / §9.1).\n` +
      `${plan.lines.join('\n')}\n` +
      'Re-run with --confirm once a human has seen that estimate. Credits are shared with the UI pool, ' +
      'and a failed job still bills.',
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * The SUPERVISED gates — §9.4 / §9.5 / §9.6, and the fields that used to be advisory
 * ════════════════════════════════════════════════════════════════════════════ */

/** True while the img2img graph has never been executed and reviewed. Defaults to untrialed. */
export function img2imgUntrialled(m: ManifestFile): boolean {
  return m._img2img?.trialled !== true;
}

/**
 * Refuse, rather than print a NOTE, when a batch reaches for a path a human is supposed to watch.
 *
 * Three rules, each one a spec line that previously had no enforcement anywhere:
 *   1. a row carrying a `gate` string needs `--confirm`. The field is set on exactly the three
 *      supervised paths — §9.4's painted dex, §9.5's map variants, §9.6's walk frames.
 *   2. a row whose class is `trialled: false` needs `--confirm`. "Review before scaling up" was a
 *      console.log; scaling up is what an unattended agent does by default.
 *   3. while `_img2img.trialled` is false, AT MOST ONE img2img row may be planned per invocation.
 *      img2img.ts's `runSmoke` already refuses a batch, but `runBatch` never called it — it built
 *      img2img graphs directly, so `run --class=map-variant --confirm` planned 28 of them.
 *   4. a row a human has APPROVED (or marked final) needs `--confirm` to be regenerated. `--force
 *      --id=player-front` needed none: it exits 0 today, and it rewrites the status, the file path
 *      and the sha256 of the one asset build-doc §15 calls the style lock for the whole pipeline.
 *      Rule 1 does not cover it — player-front carries no `gate` — and rule 2 does not either,
 *      because class `player` is `trialled: true`.
 */
export function assertSupervised(
  rows: readonly ManifestRow[],
  m: ManifestFile,
  confirmed: boolean,
): void {
  const gated = rows.filter((r) => r.gate !== undefined);
  const untrialled = rows.filter((r) => !classOf(m, r.class).trialled);
  const img2img = rows.filter((r) => r.mode === 'img2img');
  const signedOff = rows.filter((r) => r.status === 'approved' || r.status === 'final');

  if (img2imgUntrialled(m) && img2img.length > 1) {
    throw new SupervisedGateError(
      `${img2img.length} img2img rows in this batch, and the img2img graph has never been executed ` +
        `(manifest._img2img.trialled is false; tools/comfy/README.md: "does not exist and cannot be ` +
        `retrieved; it was never trialled"). §9.5 and §9.6 both call its first run a SUPERVISED gate ` +
        `of ONE image.\n  ${img2img.slice(0, 6).map((r) => r.id).join(', ')}${img2img.length > 6 ? ', …' : ''}\n` +
        'Run one row (--id=<row>), have the result reviewed, log it in docs/DEVIATIONS-lane-b.md, ' +
        'then set manifest._img2img.trialled = true. There is no flag that skips this.',
    );
  }
  if (confirmed) return;
  if (signedOff.length > 0) {
    throw new SupervisedGateError(
      `${signedOff.length} row(s) in this batch have already been signed off by a human and would be ` +
        `REGENERATED, replacing the record of what was approved:\n` +
        signedOff
          .slice(0, 4)
          .map((r) => `  ${r.id} — status ${r.status}, file ${r.file ?? '(none)'}, sha256 ${r.sha256?.slice(0, 12) ?? '(none)'}`)
          .join('\n') +
        (signedOff.length > 4 ? `\n  …and ${signedOff.length - 4} more` : '') +
        '\nbuild-doc §15 makes the approved player sprite the style lock for the whole pipeline. ' +
        'Re-run with --confirm if that is genuinely what you mean; the previous record is kept on the ' +
        'row as `supersededApproval` either way.',
    );
  }
  if (gated.length > 0) {
    throw new SupervisedGateError(
      `${gated.length} row(s) in this batch carry a supervised gate and --confirm was not given:\n` +
        gated
          .slice(0, 4)
          .map((r) => `  ${r.id} — ${r.gate}`)
          .join('\n') +
        (gated.length > 4 ? `\n  …and ${gated.length - 4} more` : '') +
        '\nRe-run with --confirm once a human is actually watching.',
    );
  }
  if (untrialled.length > 0) {
    const classes = [...new Set(untrialled.map((r) => r.class))].sort();
    throw new SupervisedGateError(
      `untrialed class(es) in this batch — ${classes.join(', ')} — and --confirm was not given. ` +
        'These classes have never produced an approved asset, so the style lock (§8.4) is unproven ' +
        'for them. Re-run with --confirm, review the first results, then set `trialled: true` on the ' +
        'class in tools/comfy/manifest.json.',
    );
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 * Derivation — rows[] from data/ (G2)
 * ════════════════════════════════════════════════════════════════════════════ */

function conceptText(m: ManifestFile, name: string): string {
  const entry = m._concepts[name];
  if (!entry) {
    throw new ManifestError(
      `no concept for dex identity "${name}". Every identity in data/species.json needs an entry in ` +
        `manifest._concepts, sourced from bible §4 (or marked derivedFrom per deviation LB-M5).`,
    );
  }
  if (entry.text) return entry.text;
  if (!entry.derivedFrom) throw new ManifestError(`concept "${name}" has neither text nor derivedFrom`);
  const base = m._concepts[entry.derivedFrom];
  if (!base?.text) throw new ManifestError(`concept "${name}" derives from "${entry.derivedFrom}", which has no text`);
  return base.text;
}

function ageWord(m: ManifestFile, stage: AgeClass, ancient: boolean): string {
  const key = ancient ? 'ancientE' : stage;
  const w = m._ageWords[key];
  if (!w) throw new ManifestError(`manifest._ageWords has no entry for "${key}"`);
  return w;
}

/** "fox kit with an ember-tipped tail" or "…, grown to its adult form" for a derived identity. */
function formConcept(m: ManifestFile, name: string, stage: AgeClass, ancient: boolean): string {
  const entry = m._concepts[name]!;
  const text = conceptText(m, name);
  if (entry.text) return text;
  return `${text}, grown to its ${ageWord(m, stage, ancient)} form`;
}

function typeWords(line: SpeciesLine, stage: AgeClass): string {
  return line.types[stage].join(' and ');
}

/** The forms that actually need art: Ancients are permanently Elder (bible §4), everything else J/A/E. */
export function artFormsOf(line: SpeciesLine): AgeClass[] {
  return line.ancient ? ['E'] : [...AGE_CLASSES];
}

function classOf(m: ManifestFile, name: string): ClassSpec {
  const c = m.classes[name];
  if (!c) throw new ManifestError(`manifest.classes has no "${name}"`);
  return c;
}

function viewPhrase(spec: ClassSpec, className: string, view: string): string {
  const v = spec.views[view];
  if (!v) throw new ManifestError(`class "${className}" has no view "${view}"`);
  return v;
}

function assemblePrompt(spec: ClassSpec, subject: string, viewText: string): string {
  return spec.skeleton.replace('{subject}', subject).replace('{view}', viewText);
}

interface SpecDraft {
  id: string;
  class: string;
  subject: string;
  view: string;
  origin: string;
  finalFile: string;
  version?: number;
  seedPin?: number;
  initImage?: string;
  denoise?: number;
  gate?: string;
  targetW?: number;
  targetH?: number;
  /** For img2img rows whose prompt is the whole subject, skeleton substitution is a no-op. */
  promptOverride?: string;
}

/**
 * A row's version — §8.4's "unless the manifest entry is versioned", read from where it can survive
 * a rebuild. `deriveRows` used to hard-code 1, which made the licensed escape inoperative: an
 * operator bumped `rows[i].version`, ran `rebuild`, and got version 1 and the original seed back.
 */
export function versionOf(m: ManifestFile, id: string, fallback?: number): number {
  const v = m._versions?.[id];
  if (v === undefined) return fallback ?? 1;
  if (!Number.isInteger(v) || v < 1) {
    throw new ManifestError(`manifest._versions["${id}"] is ${JSON.stringify(v)}; a version is an integer ≥ 1`);
  }
  return v;
}

function finish(m: ManifestFile, d: SpecDraft): RowSpec {
  const spec = classOf(m, d.class);
  const version = versionOf(m, d.id, d.version);
  if (d.seedPin !== undefined && version !== 1) {
    // A pinned seed IS the operator's statement of the seed (the player rows pin the validated
    // trial seed 42, DEVIATIONS-lane-b B-D1). Versioning cannot move it, so refusing is the only
    // honest answer: silently returning the pinned seed under a bumped version is precisely the
    // failure this whole mechanism exists to prevent — an operator believing they reseeded when the
    // old seed came back.
    throw new ManifestError(
      `${d.id} has a PINNED seed (${d.seedPin}), so bumping its version to ${version} cannot reseed it — ` +
        'versioning only moves a DERIVED seed. Change the pin itself (manifest._player.seedPin) and ' +
        'record why in docs/DEVIATIONS-lane-b.md; that is the deliberate act §8.4 is asking for.',
    );
  }
  const w = d.targetW ?? spec.targetW;
  const h = d.targetH ?? spec.targetH;
  const negative = m.negatives[spec.negative];
  if (!negative) throw new ManifestError(`class "${d.class}" names negative "${spec.negative}", which is not in manifest.negatives`);
  const row: RowSpec = {
    id: d.id,
    class: d.class,
    subject: d.subject,
    view: d.view,
    prompt: d.promptOverride ?? assemblePrompt(spec, d.subject, viewPhrase(spec, d.class, d.view)),
    negative,
    targetSize: `${w}x${h}`,
    version,
    seed: d.seedPin ?? deriveSeed(d.id, version),
    mode: spec.mode,
    origin: d.origin,
    finalFile: d.finalFile,
  };
  if (d.initImage !== undefined) row.initImage = d.initImage;
  if (d.denoise !== undefined) row.denoise = d.denoise;
  if (d.gate !== undefined) row.gate = d.gate;
  return row;
}

function nodeMeta(m: ManifestFile, nodeId: string) {
  const meta = m._nodes[nodeId];
  if (!meta) throw new ManifestError(`manifest._nodes has no entry for node "${nodeId}" (data/nodes/${nodeId}.json exists)`);
  return meta;
}

/** Every line that appears in at least one node's populations — §9.7's "~25" overworld minis. */
export function encounterableLines(content: Content): SpeciesLine[] {
  const present = new Set<string>();
  for (const node of content.nodes) for (const lineId of Object.keys(node.populations)) present.add(lineId);
  return content.species.filter((s) => present.has(s.id));
}

/** dexId -> the (line, stage) that names it, first match in file order. */
function dexIdentities(content: Content): Array<{ dexId: string; line: SpeciesLine; stage: AgeClass }> {
  const out: Array<{ dexId: string; line: SpeciesLine; stage: AgeClass }> = [];
  const seen = new Set<string>();
  for (const line of content.species) {
    for (const stage of artFormsOf(line)) {
      const name = line.formNames[stage];
      if (seen.has(name)) continue;
      seen.add(name);
      out.push({ dexId: name, line, stage });
    }
  }
  return out;
}

const shortId = (lineId: string): string => lineId.replace(/-line$/, '');
const mapAssetFor = (node: NodeFile): string => node.mapAsset;

/**
 * THE derivation. Pure in (manifest header, validated content) — no clock, no filesystem, no rng.
 * Row order is fixed by class order and then by data-file order, so the committed manifest has a
 * stable diff and the equality test in tests/unit/manifest.test.ts is meaningful.
 */
export function deriveRows(m: ManifestFile, content: Content): RowSpec[] {
  const rows: RowSpec[] = [];

  // ── creature battle sprites: 24 aging lines × 3 forms + 3 Ancients × 1 = 75 forms × front/back.
  for (const line of content.species) {
    for (const stage of artFormsOf(line)) {
      const name = line.formNames[stage];
      const concept = formConcept(m, name, stage, line.ancient);
      const subject = `${name}, ${concept}, ${ageWord(m, stage, line.ancient)} ${typeWords(line, stage)} creature, ${concept}`;
      for (const view of ['front', 'back']) {
        const id = `battle-${shortId(line.id)}-${stage.toLowerCase()}-${view}`;
        rows.push(
          finish(m, {
            id,
            class: 'creature-battle',
            subject,
            view,
            origin: `data/species.json#${line.id}[${stage}]`,
            finalFile: `${classOf(m, 'creature-battle').finalDir}/${id}.png`,
          }),
        );
      }
    }
  }

  // ── overworld minis: one per line that appears in any node's populations.
  for (const line of encounterableLines(content)) {
    const stage: AgeClass = line.ancient ? 'E' : 'A';
    const name = line.formNames[stage];
    const concept = formConcept(m, name, stage, line.ancient);
    const id = `mini-${shortId(line.id)}`;
    rows.push(
      finish(m, {
        id,
        class: 'overworld-mini',
        subject: `${name}, ${concept}, small ${typeWords(line, stage)} creature seen from above and in front, ${concept}`,
        view: 'front',
        origin: `data/species.json#${line.id}[${stage}] (encounterable: appears in data/nodes/*.json populations)`,
        finalFile: `${classOf(m, 'overworld-mini').finalDir}/${id}.png`,
      }),
    );
  }

  // ── painted dex plates: one per named dex identity (35).
  for (const { dexId, line, stage } of dexIdentities(content)) {
    const id = `dex-${dexId.toLowerCase()}`;
    rows.push(
      finish(m, {
        id,
        class: 'dex-painted',
        subject: `${dexId}, ${formConcept(m, dexId, stage, line.ancient)}, ${typeWords(line, stage)} creature`,
        view: 'plate',
        origin: `data/species.json#${line.id}.dexIds`,
        finalFile: `${classOf(m, 'dex-painted').finalDir}/${id}.png`,
        gate: 'build-doc §9.4 SUPERVISED painted-class trial; cut line C-4 if it cannot be approved',
      }),
    );
  }

  // ── base maps: 12, one per node file. finalFile is COPIED from the node's own mapAsset.
  for (const node of content.nodes) {
    const meta = nodeMeta(m, node.id);
    rows.push(
      finish(m, {
        id: `map-${node.id}`,
        class: meta.kind === 'town' ? 'map-town' : 'map-route',
        subject: `${node.name}, ${meta.feature}, ${node.biome} biome`,
        view: 'overhead',
        origin: `data/nodes/${node.id}.json#mapAsset`,
        finalFile: mapAssetFor(node),
      }),
    );
  }

  // ── year variants (§9.5, img2img): slice nodes years 2–6, everything else year 2 only.
  for (const node of content.nodes) {
    const meta = nodeMeta(m, node.id);
    const base = rows.find((r) => r.id === `map-${node.id}`);
    if (!base) throw new ManifestError(`year variants for ${node.id} derived before its base map row`);
    const years = meta.slice ? [2, 3, 4, 5, 6] : [2];
    for (const year of years) {
      const id = `map-${node.id}-y${year}`;
      const subject = `${base.prompt}, ${meta.agingArc}, year ${year} of six`;
      rows.push(
        finish(m, {
          id,
          class: 'map-variant',
          subject,
          view: 'overhead',
          promptOverride: subject,
          origin: `data/nodes/${node.id}.json#yearVariants[${year}] (empty until overlay-diff passes)`,
          finalFile: `${classOf(m, 'map-variant').finalDir}/${node.id}-y${year}.png`,
          initImage: mapAssetFor(node),
          denoise: content.balance.overlayDiff.denoiseStart,
          gate:
            'build-doc §8.2 / G4 — must pass tools/overlay-diff (IoU over walkable cells) before it may ' +
            'enter the node JSON. The img2img graph itself is untrialed: first run is SUPERVISED.',
        }),
      );
    }
  }

  // ── trainers: the 6 gym leaders come from data/gyms.json; Wick and Maren from bible §8.
  const gymIds = new Set(content.gyms.map((g) => g.id));
  for (const gym of content.gyms) {
    const t = m._trainers[gym.id];
    if (!t) throw new ManifestError(`manifest._trainers has no entry for gym leader "${gym.id}" (data/gyms.json)`);
    const id = `trainer-${gym.id}`;
    rows.push(
      finish(m, {
        id,
        class: 'trainer-battle',
        subject: t.subject,
        view: 'front',
        origin: `data/gyms.json#${gym.id}`,
        finalFile: `${classOf(m, 'trainer-battle').finalDir}/${id}.png`,
      }),
    );
  }
  for (const [key, t] of Object.entries(m._trainers)) {
    if (gymIds.has(key)) continue;
    const id = `trainer-${key}`;
    rows.push(
      finish(m, {
        id,
        class: 'trainer-battle',
        subject: t.subject,
        view: 'front',
        origin: `manifest._trainers#${key} — ${t.source}`,
        finalFile: `${classOf(m, 'trainer-battle').finalDir}/${id}.png`,
      }),
    );
  }

  // ── ambient NPC statics.
  for (const [key, npc] of Object.entries(m._npcs)) {
    const id = `npc-${key}`;
    rows.push(
      finish(m, {
        id,
        class: 'npc-static',
        subject: npc.subject,
        view: 'front',
        origin: `manifest._npcs#${key} — ${npc.source}`,
        finalFile: `${classOf(m, 'npc-static').finalDir}/${id}.png`,
      }),
    );
  }

  // ── props: kinds come from core/types.ts PROP_KINDS, so they cannot drift from the node schema.
  for (const kind of PROP_KINDS) {
    const p = m._props[kind];
    if (!p) throw new ManifestError(`manifest._props has no entry for PROP_KINDS member "${kind}"`);
    const id = `prop-${kind}`;
    rows.push(
      finish(m, {
        id,
        class: 'prop',
        subject: p.subject,
        view: 'front',
        origin: `core/types.ts#PROP_KINDS[${kind}] — ${p.source}`,
        finalFile: `${classOf(m, 'prop').finalDir}/${id}.png`,
      }),
    );
  }

  // ── UI frames.
  for (const [key, ui] of Object.entries(m._ui)) {
    const id = `ui-${key}`;
    rows.push(
      finish(m, {
        id,
        class: 'ui-frame',
        subject: ui.subject,
        view: 'flat',
        origin: `manifest._ui#${key} — ${ui.source}`,
        finalFile: `${classOf(m, 'ui-frame').finalDir}/${id}.png`,
        targetW: ui.w,
        targetH: ui.h,
      }),
    );
  }

  // ── player: statics (txt2img) then the §9.6 walk frames (img2img off the matching static).
  const player = m._player;
  const playerClass = classOf(m, 'player');
  for (const view of player.statics) {
    const id = `player-${view}`;
    rows.push(
      finish(m, {
        id,
        class: 'player',
        subject: player.subject,
        view,
        seedPin: player.seedPin,
        origin: `manifest._player — L6 verbatim, gate B0`,
        finalFile: `${playerClass.finalDir}/${id}.png`,
      }),
    );
  }
  for (const view of player.walkFrames) {
    const id = `player-${view}`;
    const staticView = view.split('-')[0]!;
    const spec = finish(m, {
      id,
      class: 'player',
      subject: player.subject,
      view,
      seedPin: player.seedPin,
      origin: `manifest._player.walkFrames — build-doc §9.6, img2img off player-${staticView}`,
      finalFile: `${playerClass.finalDir}/${id}.png`,
      initImage: `${playerClass.finalDir}/player-${staticView}.png`,
      denoise: content.balance.overlayDiff.denoiseStart,
      gate:
        'build-doc §9.6 SUPERVISED walk trial, denoise sweep {0.3, 0.4, 0.5} via --denoise. ' +
        'Fail ⇒ fall to bob without discussion; the statics ship either way.',
    });
    rows.push({ ...spec, mode: 'img2img' });
  }

  return rows;
}

/* ════════════════════════════════════════════════════════════════════════════
 * Manifest IO + rebuild
 * ════════════════════════════════════════════════════════════════════════════ */

export async function loadManifest(path: string = MANIFEST_PATH): Promise<ManifestFile> {
  const m = JSON.parse(await readFile(path, 'utf8')) as ManifestFile;
  if (!Array.isArray(m.rows)) throw new ManifestError(`${path}: no rows[]`);
  return m;
}

export async function saveManifest(m: ManifestFile, path: string = MANIFEST_PATH): Promise<void> {
  await writeFile(path, `${JSON.stringify(m, null, 2)}\n`, 'utf8');
}

const RECORD_KEYS = [
  'status',
  'recordedSeed',
  'recordedVersion',
  'recordedPromptHash',
  'supersededApproval',
  'workflowHash',
  'timestamp',
  'file',
  'sha256',
  'attempts',
  'flaggedForReview',
  'reviewReason',
  'layoutGate',
] as const;

/** Strip a row down to the derived half, for comparison against a fresh derivation. */
export function specOf(row: ManifestRow): RowSpec {
  const out = { ...row } as Record<string, unknown>;
  for (const k of RECORD_KEYS) delete out[k];
  return out as unknown as RowSpec;
}

/**
 * Re-derive rows[] and merge the recorded half back on.
 *
 * A rebuild must never lose what a run recorded, and it must never silently reseed a row that has
 * already produced art: if the derived seed no longer matches `recordedSeed`, that is a G5 event
 * and it throws here rather than being written to disk and discovered later.
 */
export function rebuildRows(m: ManifestFile, content: Content, notes: string[] = []): ManifestRow[] {
  const previous = new Map(m.rows.map((r) => [r.id, r]));

  // An operator reseeds by bumping `version` on the row (that is what §8.4 describes and what the
  // error messages tell them to do). Promote that edit into `_versions` BEFORE deriving, so the
  // bump reaches the seed instead of being silently reverted to 1 by the derivation.
  const versions: Record<string, number> = { ...(m._versions ?? {}) };
  for (const old of m.rows) {
    const declared = old.version;
    if (declared === undefined) continue;
    if (!Number.isInteger(declared) || declared < 1) {
      throw new ManifestError(`${old.id}: version ${JSON.stringify(declared)} is not an integer ≥ 1`);
    }
    if (declared === 1) continue;
    if (versions[old.id] !== declared) {
      versions[old.id] = declared;
      notes.push(`${old.id}: version pinned at ${declared} in manifest._versions (§8.4 versioned reseed)`);
    }
  }
  if (Object.keys(versions).length > 0) m._versions = versions;

  const derived = deriveRows(m, content);
  const derivedIds = new Set(derived.map((r) => r.id));

  // The quiet version of the same G5 failure: an id changes, so the recorded row is not "reseeded"
  // — it simply stops existing, its recorded seed goes with it, and the replacement row generates
  // fresh art under a new seed with nothing left to compare against. Caught by id, not by seed,
  // because after a rename there is no row left to check the seed on.
  const orphaned = m.rows.filter((r) => r.recordedSeed !== undefined && !derivedIds.has(r.id));
  if (orphaned.length > 0) {
    throw new SeedReuseError(
      `rebuilding would drop ${orphaned.length} row(s) that have already generated art, taking their ` +
        `recorded seeds with them: ${orphaned.map((r) => `${r.id} (seed ${r.recordedSeed})`).join(', ')}. ` +
        'That is G5 by another route — the asset becomes unreproducible. Restore the id, or delete the ' +
        'raw file and the recorded fields deliberately.',
    );
  }

  return derived.map((spec) => {
    const old = previous.get(spec.id);
    if (!old) return { ...spec, status: 'pending' as RowStatus };
    const merged: ManifestRow = { ...spec, status: old.status };
    const sink = merged as unknown as Record<string, unknown>;
    for (const k of RECORD_KEYS) {
      const v = old[k];
      if (v !== undefined) sink[k] = v;
    }
    if (merged.recordedSeed === undefined) return merged;

    // Where the seed was recorded. A row recorded before `recordedVersion` existed was necessarily
    // recorded at version 1 — assuming otherwise would let an old row skip the check.
    const recordedAt = merged.recordedVersion ?? 1;

    if (recordedAt === spec.version) {
      // Same version, moved seed: G5. The old condition compared `old.version === spec.version`,
      // which meant any row stored at a version other than 1 skipped the check entirely — and since
      // the derivation then reset the version to 1, a bumped row was written to disk with a
      // recordedSeed that no longer matched its own derived seed, and only the NEXT rebuild noticed.
      if (merged.recordedSeed !== spec.seed) {
        throw new SeedReuseError(
          `${spec.id}: rebuilding the manifest would change the seed from ${merged.recordedSeed} to ` +
            `${spec.seed} while the row is still at version ${spec.version}. That is G5. Either restore ` +
            `whatever changed the derivation (an id rename is the usual culprit), or bump the row's version.`,
        );
      }
      merged.recordedVersion = recordedAt;
      // The same event on the OTHER half of §8.4's identity. A seed is `hashSeed(version, id)` and
      // cannot see a prompt, so rewriting a `subject` in a manifest header block used to pass every
      // guard here in silence: verified by rewriting `_player.subject` to a different character and
      // rebuilding — accepted, no note, player-front still `approved` with the old file's sha256.
      assertStyleLock(merged);
      return merged;
    }

    // Different version: §8.4's licensed reseed. The recorded art was made by the OLD seed, so the
    // record no longer describes what this row asks for. Reset it rather than persisting a row whose
    // recordedSeed disagrees with its own derived seed — that state is what made the escape corrupt
    // the manifest instead of operating it. The raw file stays on disk; the manifest stops claiming it.
    notes.push(
      `${spec.id}: version ${recordedAt} -> ${spec.version}, seed ${merged.recordedSeed} -> ${spec.seed}. ` +
        'Record cleared (status pending); the previous file is superseded, not deleted.',
    );
    for (const k of RECORD_KEYS) delete sink[k];
    merged.status = 'pending';
    return merged;
  });
}

/* ════════════════════════════════════════════════════════════════════════════
 * The runner
 * ════════════════════════════════════════════════════════════════════════════ */

/** Stable hash of the exact graph submitted — §9.1's `workflowHash`, recorded per row. */
export function workflowHash(graph: Graph): string {
  return createHash('sha256').update(canonical(graph)).digest('hex').slice(0, 16);
}

function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const entries = Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, val]) => `${JSON.stringify(k)}:${canonical(val)}`).join(',')}}`;
}

export interface GraphForRow {
  graph: Graph;
  hash: string;
  seed: number;
}

/**
 * Build the graph for one row. Separated from submission so a `--dry-run` can print exactly what
 * would be sent, and so the tests can assert the injection without touching the network.
 */
export function graphForRow(
  row: ManifestRow,
  base: Graph,
  uploadedInitName?: string,
  /**
   * The §9.5 ladder's current rung. Passed in rather than written onto `row.denoise`, because
   * `denoise` is part of the row's DERIVED half: mutating it made a laddered row differ from its own
   * derivation, which `assertRowsDerived` would then read as a hand edit.
   */
  denoiseOverride?: number,
): GraphForRow {
  const seed = seedForSubmit(row);
  assertStyleLock(row);
  if (row.mode === 'img2img') {
    if (!uploadedInitName) {
      throw new ComfyError(`${row.id} is img2img and needs an uploaded init image (row.initImage = ${row.initImage})`);
    }
    const denoise = denoiseOverride ?? row.denoise;
    if (denoise === undefined) {
      // Never guess. §9.5's ladder starts at balance.overlayDiff.denoiseStart and the derivation
      // puts it on the row; a hard-coded fallback here would be a gameplay constant in code (G11)
      // and would silently un-ladder a regeneration.
      throw new ComfyError(`${row.id} is img2img but carries no denoise (§9.5 ladder value)`);
    }
    const graph = buildImg2ImgGraph(base, {
      initImageName: uploadedInitName,
      denoise,
      positive: row.prompt,
      negative: row.negative,
      seed,
    });
    return { graph, hash: workflowHash(graph), seed };
  }
  const graph = injectGraph(base, { positive: row.prompt, negative: row.negative, seed });
  const hash = workflowHash(graph);
  assertWorkflowLock(row, hash);
  return { graph, hash, seed };
}

/* ════════════════════════════════════════════════════════════════════════════
 * G4 — the §8.2 layout gate, on the live path
 * ════════════════════════════════════════════════════════════════════════════ */

export interface LayoutVerdict {
  accepted: boolean;
  iou: number;
  threshold: number;
  largestDrift: number;
  reason: string;
}

/**
 * Runs after a candidate lands on disk. Returns null for rows §8.2 does not gate.
 *
 * `precheck` is everything the gate can refuse on BEFORE a generation is billed — the node exists,
 * its base map and its collision mask are on disk. Without it, a map-variant row against a node with
 * no mask (which is every node today) paid for an image and then discovered it could not be judged.
 */
export type LayoutGate = ((
  row: ManifestRow,
  savedPath: string,
  root: string,
  /**
   * The §9.5 rung this candidate was generated at. Passed rather than read off `row.denoise`,
   * because `denoise` belongs to the row's DERIVED half: the ladder used to write its working value
   * onto the row, which left a laddered row permanently disagreeing with its own derivation.
   */
  denoise?: number,
) => Promise<LayoutVerdict | null>) & {
  precheck?: (row: ManifestRow, root: string) => void;
};

/** The class whose candidates may not enter a node JSON without passing §8.2 (G4). */
export const LAYOUT_GATED_CLASS = 'map-variant';

/**
 * The real gate: `tools/overlay-diff` against the node's own base map and collision mask.
 *
 * It REFUSES rather than passes when the mask is missing. "One collision mask survives all six
 * years" (Hard Req 5) is unverifiable without a mask, and falling back to "every pixel is walkable"
 * would silently compare the whole frame — which is how a gate becomes decoration.
 */
export function overlayDiffGate(content: Content): LayoutGate {
  const config = overlayDiffConfig(content.balance);
  const grid = collisionGrid(content.balance);
  const nodeFor = (row: ManifestRow, root: string): NodeFile => {
    const node = content.nodes.find((n) => n.mapAsset === row.initImage);
    if (!node) {
      throw new LayoutGateError(
        `${row.id} is a ${LAYOUT_GATED_CLASS} whose initImage (${row.initImage}) is not any node's ` +
          'mapAsset, so there is no collision mask to check it against. G4 says a variant that has ' +
          'not passed overlay-diff is never accepted.',
      );
    }
    for (const [label, p] of [
      ['base map', node.mapAsset],
      ['collision mask', node.collisionMask],
    ] as const) {
      if (!existsSync(resolve(root, p))) {
        throw new LayoutGateError(
          `${row.id}: ${label} ${p} does not exist, so §8.2's layout freeze cannot be measured. ` +
            'Refusing to record this candidate — G4 forbids accepting a variant that has not passed ' +
            'overlay-diff, and "no mask authored yet" is not a pass. Nothing was submitted, so ' +
            'nothing was billed: author the mask (the encoding is declared in tools/overlay-diff/mask.ts) ' +
            'and run again.',
        );
      }
    }
    return node;
  };
  const gate: LayoutGate = async (row, savedPath, root, _denoise) => {
    if (row.class !== LAYOUT_GATED_CLASS) return null;
    const node = nodeFor(row, root);
    const result = overlayDiff({
      base: await readRaster(resolve(root, node.mapAsset)),
      candidate: await readRaster(savedPath),
      mask: await readRaster(resolve(root, node.collisionMask)),
      grid,
      config,
    });
    return {
      accepted: result.accepted,
      iou: result.iou,
      threshold: result.threshold,
      largestDrift: result.largestDrift,
      reason: result.reason,
    };
  };
  gate.precheck = (row, root) => {
    if (row.class !== LAYOUT_GATED_CLASS) return;
    nodeFor(row, root);
  };
  return gate;
}

export interface RunOptions {
  confirmed: boolean;
  /** Repo-root override, so tests can run the whole loop without writing into assets/. */
  root?: string;
  /** §9.1 "retry ×2 on failure then flag for supervised review". */
  maxAttempts?: number;
  dryRun?: boolean;
  concurrency?: number;
  now?: () => string;
  log?: (line: string) => void;
  /**
   * §8.2 / G4. Defaults to `overlayDiffGate(validateContent())`; pass one explicitly in tests.
   * Passing `null` disables it, which no production path does — the CLI never passes it.
   */
  layoutGate?: LayoutGate | null;
  /** §9.5's ladder. Defaults to `balance.overlayDiff`. */
  ladder?: { denoiseStep: number; denoiseFloor: number; maxRegenAttempts: number };
  /**
   * How an img2img row's init image reaches the server. Defaults to `uploadInitImage`. Injectable so
   * the img2img path can be exercised without the network — a test suite that can reach Comfy Cloud
   * will eventually bill it (B-D8).
   */
  uploadInit?: (env: ComfyEnv, absPath: string) => Promise<string>;
}

export interface RunReport {
  attempted: number;
  succeeded: number;
  flagged: ManifestRow[];
}

function rawPathFor(m: ManifestFile, row: ManifestRow, root = REPO_ROOT): string {
  return resolve(root, `${classOf(m, row.class).rawDir}/${row.id}.png`);
}

/**
 * The check the run path never had: are the rows about to be SUBMITTED still what data/ derives?
 *
 * `rebuild` re-derives and guards; `run` did neither — main() goes loadManifest → selectRows →
 * runBatch and never calls `rebuildRows`. So every hand edit to manifest.json reached the cloud
 * unexamined, and the one an operator is most likely to make is the one the `SeedReuseError` message
 * TELLS them to make: bump `version`. Bumping it by hand leaves `seed` at the old value, and the
 * batch then paid for the seed it was trying to move away from.
 *
 * Compared against `specOf`, so recorded fields are ignored and only the derived half must match.
 * A drifted row is REFUSED, not repaired here: repairing it silently would be a second derivation
 * path, and `rebuild` is the one that exists and is tested.
 */
export function assertRowsDerived(m: ManifestFile, rows: readonly ManifestRow[], content: Content): void {
  if (rows.length === 0) return;
  const derived = new Map(deriveRows(m, content).map((r) => [r.id, r]));
  const drifted: string[] = [];
  for (const row of rows) {
    const spec = derived.get(row.id);
    if (!spec) {
      drifted.push(`${row.id}: not produced by the derivation at all (renamed, or removed from data/)`);
      continue;
    }
    const mine = specOf(row) as unknown as Record<string, unknown>;
    const theirs = spec as unknown as Record<string, unknown>;
    const fields = [...new Set([...Object.keys(mine), ...Object.keys(theirs)])]
      .filter((k) => JSON.stringify(mine[k]) !== JSON.stringify(theirs[k]))
      .sort();
    if (fields.length > 0) {
      drifted.push(
        `${row.id}: ${fields.map((k) => `${k} ${JSON.stringify(mine[k])} != ${JSON.stringify(theirs[k])}`).join(', ')}`,
      );
    }
  }
  if (drifted.length === 0) return;
  throw new ManifestError(
    `${drifted.length} row(s) in this batch no longer match what data/ derives, so the manifest has ` +
      `been hand-edited since its last rebuild:\n  ${drifted.slice(0, 6).join('\n  ')}` +
      (drifted.length > 6 ? `\n  …and ${drifted.length - 6} more` : '') +
      '\nRun `npx tsx tools/comfy/comfy-batch.ts rebuild` — that is the only derivation, and it is ' +
      'what enforces G5 on the way through. Submitting a hand-edited row bills for whatever the edit ' +
      'happens to say.',
  );
}

/**
 * Run a set of rows. Mutates the rows in place (they are the manifest's own objects) so the caller
 * saves one manifest at the end and a crash mid-batch still leaves every completed row recorded.
 */
export async function runBatch(
  m: ManifestFile,
  rows: ManifestRow[],
  client: ComfyClient,
  base: Graph,
  env: ComfyEnv,
  opts: RunOptions,
): Promise<RunReport> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const now = opts.now ?? (() => new Date().toISOString());
  const maxAttempts = opts.maxAttempts ?? TRANSPORT_ATTEMPTS; // 1 try + 2 retries (§9.1)
  const root = opts.root ?? REPO_ROOT;
  const needsGate = rows.some((r) => r.class === LAYOUT_GATED_CLASS);
  const ladderCfg = opts.ladder ?? (needsGate ? denoiseLadder() : null);
  const plan = planBatch(rows, m, {
    transportAttempts: maxAttempts,
    ...(ladderCfg ? { maxRegenAttempts: ladderCfg.maxRegenAttempts } : {}),
  });
  for (const line of plan.lines) log(line);
  assertBatchApproved(plan, opts.confirmed);
  assertSupervised(rows, m, opts.confirmed);

  const report: RunReport = { attempted: 0, succeeded: 0, flagged: [] };

  // Built only when the batch actually contains gated rows: `overlayDiffGate` validates all of
  // data/ and the ladder reads balance.json, and a 150-row sprite batch has no business paying for
  // either. `layoutGate: null` is a TEST-ONLY escape; the CLI never passes it.
  const upload = opts.uploadInit ?? uploadInitImage;
  const gate: LayoutGate | null =
    opts.layoutGate !== undefined ? opts.layoutGate : needsGate ? overlayDiffGate(validateContent()) : null;
  const ladder = ladderCfg;

  if (opts.dryRun) {
    for (const row of rows) {
      const { hash, seed } = graphForRow(row, base, row.mode === 'img2img' ? 'DRY-RUN-INIT.png' : undefined);
      log(`  [dry] ${row.id.padEnd(34)} seed ${seed}  graph ${hash}  ${row.targetSize}  ${row.mode}`);
    }
    return report;
  }

  const queue = [...rows];
  // A malformed --concurrency used to reach `Math.max(1, NaN)` = NaN, and `Array.from({length: NaN})`
  // is empty: the whole batch became a silent no-op that reported success and exited 0.
  const requested = opts.concurrency ?? env.maxConcurrency;
  const concurrency = Number.isFinite(requested) ? Math.max(1, Math.floor(requested)) : 1;

  const worker = async (): Promise<void> => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      report.attempted++;
      await runRow(row);
    }
  };

  /**
   * One row, two nested budgets that are NOT the same budget:
   *
   *   · the §9.1 transport budget (`maxAttempts`) covers a submission that failed. It wraps
   *     `client.run` ONLY. Downloading, hashing and gating are retried separately, because a failed
   *     download re-submitted the prompt and re-billed the image — measured at 3 billed generations
   *     for one image when `/api/view` 404s.
   *   · the §9.5 regeneration ladder (`maxRegenAttempts`, `nextDenoise`) covers a candidate that
   *     generated fine but FAILED THE LAYOUT GATE. That is not an error to retry identically; §9.5
   *     says regenerate at a lower denoise, and stop.
   */
  async function runRow(row: ManifestRow): Promise<void> {
    const gated = gate !== null && row.class === LAYOUT_GATED_CLASS;
    const rungs = ladder ?? denoiseLadder();
    const maxRegen = gated ? Math.max(1, rungs.maxRegenAttempts) : 1;
    let denoise = row.denoise;
    let generations = 0;

    // ── every guardrail this row can be refused on, BEFORE anything is billed and before anything
    // on the row is touched. A refusal must leave the record it defends exactly as it found it.
    try {
      seedForSubmit(row); // G5 / §8.4
      assertStyleLock(row); // §8.4's prompt half (graphForRow adds the workflow half)
      gate?.precheck?.(row, root); // G4: no mask on disk ⇒ nothing to gate against
    } catch (e) {
      refuse(row, e instanceof Error ? e.message : String(e));
      return;
    }

    for (let regen = 1; regen <= maxRegen; regen++) {
      // ── generate (the only billed step)
      let outputs: NodeOutputs | undefined;
      let seed = 0;
      let hash = '';
      let lastError = '';
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        generations++;
        row.attempts = generations;
        try {
          let initName: string | undefined;
          if (row.mode === 'img2img') {
            if (!row.initImage) throw new ComfyError(`${row.id}: img2img row has no initImage`);
            initName = await upload(env, resolve(root, row.initImage));
          }
          const built = graphForRow(row, base, initName, denoise);
          seed = built.seed;
          hash = built.hash;
          outputs = await client.run(built.graph);
          break;
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
          // A guardrail refusal is not a transient fault: retrying re-submits the same refusal, and
          // marking the row `failed` would corrupt the very record the guardrail exists to protect.
          if (isGuardrail(e)) {
            generations--;
            row.attempts = generations > 0 ? generations : undefined;
            refuse(row, lastError);
            return;
          }
          if (attempt >= maxAttempts) {
            fail(row, `${generations} generation attempt(s) failed: ${lastError}`);
            return;
          }
          log(`  retry ${row.id} (${attempt}/${maxAttempts - 1}) — ${lastError}`);
        }
      }
      if (!outputs) return; // fail() or refuse() already ran

      // ── download + hash. Retried on its own budget; NEVER re-submits the prompt.
      const dest = rawPathFor(m, row, root);
      let written: string | undefined;
      let sha = '';
      let downloadError = '';
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const [first] = await client.saveAll(outputs, () => dest);
          if (!first) throw new ComfyError('job returned no image');
          written = first;
          sha = createHash('sha256').update(await readFile(first)).digest('hex');
          break;
        } catch (e) {
          downloadError = e instanceof Error ? e.message : String(e);
          if (attempt >= maxAttempts) {
            fail(
              row,
              `image generated (and billed) but could not be saved after ${maxAttempts} attempt(s): ` +
                `${downloadError}. The prompt was NOT re-submitted.`,
            );
            return;
          }
          log(`  re-download ${row.id} (${attempt}/${maxAttempts - 1}) — ${downloadError}`);
        }
      }
      if (!written) return;

      // ── §8.2 / G4: the layout gate. A candidate that fails it is NOT a completed row.
      let verdict: LayoutVerdict | null = null;
      if (gated && gate) {
        try {
          verdict = await gate(row, written, root, denoise);
        } catch (e) {
          // A gate that cannot RUN is a guardrail refusal, not a failed generation: G4's whole point
          // is that "unmeasurable" is not "acceptable", and downgrading the row would be the runner
          // punishing a row for the mask nobody has authored yet.
          refuse(row, `layout gate refused to run: ${e instanceof Error ? e.message : String(e)}`);
          return;
        }
      }
      if (verdict && !verdict.accepted) {
        const next = denoise === undefined ? null : nextDenoise(denoise, rungs);
        log(`  gate ${row.id.padEnd(33)} ${verdict.reason}`);
        if (regen >= maxRegen || next === null) {
          fail(
            row,
            `failed tools/overlay-diff after ${regen} attempt(s) down to denoise ${denoise}: ` +
              `${verdict.reason} G4: it is never accepted by hand. §9.5: this year reuses the nearest ` +
              'passing variant.',
          );
          return;
        }
        denoise = next;
        log(`  ladder ${row.id.padEnd(31)} regenerating at denoise ${next} (§9.5)`);
        continue;
      }

      record(row, { written, sha, seed, hash, verdict, denoise });
      report.succeeded++;
      log(`  ok   ${row.id.padEnd(34)} seed ${seed}  -> ${row.file}`);
      return;
    }
  }

  function record(
    row: ManifestRow,
    o: { written: string; sha: string; seed: number; hash: string; verdict: LayoutVerdict | null; denoise?: number },
  ): void {
    // A human sign-off is not overwritten silently. `--force --id=player-front` used to move status
    // approved -> raw, repoint `file` from assets/approved-trials/player-APPROVED.png to the raw
    // path, and replace the approved sha256 — deleting the only machine-readable record of gate B0.
    // `assertSupervised` now demands --confirm for this; what it replaces is kept, not deleted.
    if (row.status === 'approved' || row.status === 'final') {
      row.supersededApproval = {
        status: row.status,
        ...(row.file === undefined ? {} : { file: row.file }),
        ...(row.sha256 === undefined ? {} : { sha256: row.sha256 }),
        ...(row.recordedSeed === undefined ? {} : { recordedSeed: row.recordedSeed }),
        ...(row.recordedPromptHash === undefined ? {} : { recordedPromptHash: row.recordedPromptHash }),
        ...(row.timestamp === undefined ? {} : { timestamp: row.timestamp }),
        supersededAt: now(),
      };
    }
    row.status = 'raw';
    row.file = o.written.startsWith(root) ? o.written.slice(root.length + 1) : o.written;
    row.sha256 = o.sha;
    row.recordedSeed = o.seed;
    row.recordedVersion = row.version;
    row.recordedPromptHash = promptIdentity(row);
    row.workflowHash = o.hash;
    row.timestamp = now();
    row.flaggedForReview = false;
    delete row.reviewReason;
    if (o.verdict) {
      row.layoutGate = {
        iou: o.verdict.iou,
        threshold: o.verdict.threshold,
        largestDrift: o.verdict.largestDrift,
        denoise: o.denoise ?? 0,
      };
    }
  }

  /** A generation that was attempted and did not produce a usable asset. The row IS worse off. */
  function fail(row: ManifestRow, reason: string): void {
    row.status = 'failed';
    row.flaggedForReview = true;
    row.reviewReason = reason;
    report.flagged.push(row);
    log(`  FAIL ${row.id.padEnd(34)} flagged for supervised review — ${reason}`);
  }

  /**
   * A GUARDRAIL said no. Nothing was submitted, so nothing about the row's record may change.
   *
   * `fail()` was used for this, and it set `status = 'failed'` — so a G5 refusal DOWNGRADED the
   * approved row it was protecting, main()'s `finally` persisted that to manifest.json, and
   * `selectRows` (which picks `pending` and `failed`) then re-attempted the same row on the next
   * bare `run`. Reproduced: an approved creature-battle row with a drifted derived seed came back
   * from a refusal as `status: failed`, with zero submissions. A guardrail refusal must leave the
   * record it defends exactly as it found it — the flag and the reason are the whole output.
   */
  function refuse(row: ManifestRow, reason: string): void {
    row.flaggedForReview = true;
    row.reviewReason = `REFUSED (nothing submitted, nothing billed, status left at "${row.status}"): ${reason}`;
    report.flagged.push(row);
    log(`  REFUSED ${row.id.padEnd(31)} ${reason}`);
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return report;
}

/* ════════════════════════════════════════════════════════════════════════════
 * CLI
 * ════════════════════════════════════════════════════════════════════════════ */

export function selectRows(m: ManifestFile, filters: { class?: string; id?: string; limit?: number; force: boolean }): ManifestRow[] {
  let rows = m.rows;
  if (filters.class) rows = rows.filter((r) => r.class === filters.class);
  if (filters.id) rows = rows.filter((r) => r.id === filters.id);
  if (!filters.force) rows = rows.filter((r) => r.status === 'pending' || r.status === 'failed');
  if (filters.limit !== undefined) rows = rows.slice(0, filters.limit);
  return rows;
}

/**
 * A filter that matches NOTHING is a typo, not a finished batch.
 *
 * `run --class=creature-batle` and `run --id=nonexistent-row` both printed "nothing to do (every
 * selected row is already generated; --force to regenerate)" and exited 0 — a claim that was false
 * as well as unhelpful, and one an unattended overnight batch reports as success while producing
 * nothing at all. Neither value was ever checked against `manifest.classes` or the row ids.
 */
export function assertFiltersMatch(m: ManifestFile, filters: { class?: string; id?: string }): void {
  if (filters.class !== undefined && m.classes[filters.class] === undefined) {
    throw new ManifestError(
      `--class=${filters.class} is not a class in tools/comfy/manifest.json.` +
        `${nearest(filters.class, Object.keys(m.classes))}\n` +
        `  known classes: ${Object.keys(m.classes).sort().join(', ')}`,
    );
  }
  if (filters.id !== undefined && !m.rows.some((r) => r.id === filters.id)) {
    throw new ManifestError(
      `--id=${filters.id} is not a row in tools/comfy/manifest.json.` +
        `${nearest(filters.id, m.rows.map((r) => r.id))}\n` +
        '  `status` lists what exists by class.',
    );
  }
}

/** "did you mean" without a dependency: shared-prefix length, longest first, at most three. */
function nearest(given: string, known: readonly string[]): string {
  const score = (k: string): number => {
    let n = 0;
    while (n < k.length && n < given.length && k[n] === given[n]) n++;
    return n;
  };
  const close = known
    .map((k) => ({ k, n: score(k) }))
    .filter((c) => c.n >= 3)
    .sort((a, b) => b.n - a.n || (a.k < b.k ? -1 : 1))
    .slice(0, 3)
    .map((c) => c.k);
  return close.length > 0 ? ` Did you mean ${close.join(', ')}?` : '';
}

const USAGE = `tools/comfy/comfy-batch.ts — build-doc §9.1 manifest runner

  npx tsx tools/comfy/comfy-batch.ts rebuild
      Re-derive rows[] from data/ and write manifest.json. Recorded seeds/status are preserved;
      a derivation that would move a recorded seed at the SAME version throws (G5). Bumping a row's
      \`version\` (or manifest._versions) is §8.4's licensed reseed: the bump is persisted, the seed
      moves, and that row's record is cleared back to pending because the old art is superseded.

  npx tsx tools/comfy/comfy-batch.ts run [--class=C] [--id=I] [--limit=N] [--force] [--dry-run]
                                         [--confirm] [--credits-per-image=N] [--concurrency=N]
      Generate. Batches of ${CREDIT_GATE_ROWS}+ rows refuse to start without --confirm (G13).
      Rows carrying a supervised \`gate\`, and rows of an untrialed class, also refuse without
      --confirm; while manifest._img2img.trialled is false at most ONE img2img row may be planned,
      with or without --confirm (§9.5 / §9.6). Every map-variant candidate is run through
      tools/overlay-diff before it can be recorded, and a rejected one walks the §9.5 denoise
      ladder (G4). Without --force, only rows with status pending/failed are attempted.

  npx tsx tools/comfy/comfy-batch.ts status
      Row counts by class and status.
`;

function isEntrypoint(): boolean {
  const argv1 = process.argv[1];
  return argv1 !== undefined && resolve(argv1) === resolve(fileURLToPath(import.meta.url));
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const flag = (k: string): boolean => argv.includes(`--${k}`);
  const opt = (k: string): string | undefined => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  /**
   * A malformed number is a REFUSAL, not a NaN. `--concurrency=abc` used to produce
   * `Array.from({length: NaN})` — an empty worker pool — so the batch submitted nothing, reported
   * "0/0 ok" and exited 0 while every row stayed pending.
   */
  const num = (k: string, opts: { min?: number; integer?: boolean } = {}): number | undefined => {
    const raw = opt(k);
    if (raw === undefined) return undefined;
    const v = Number(raw);
    if (!Number.isFinite(v)) throw new ManifestError(`--${k}=${raw} is not a number`);
    if (opts.integer && !Number.isInteger(v)) throw new ManifestError(`--${k}=${raw} must be a whole number`);
    if (opts.min !== undefined && v < opts.min) throw new ManifestError(`--${k}=${raw} must be at least ${opts.min}`);
    return v;
  };

  if (!cmd || flag('help')) {
    console.log(USAGE);
    return cmd ? 0 : 2;
  }

  const manifest = await loadManifest();

  if (cmd === 'rebuild') {
    const content = validateContent();
    const notes: string[] = [];
    manifest.rows = rebuildRows(manifest, content, notes);
    await saveManifest(manifest);
    for (const n of notes) console.log(`  ${n}`);
    const byClass = new Map<string, number>();
    for (const r of manifest.rows) byClass.set(r.class, (byClass.get(r.class) ?? 0) + 1);
    console.log(`rebuilt ${manifest.rows.length} rows`);
    for (const [c, n] of [...byClass.entries()].sort()) console.log(`  ${c.padEnd(18)} ${n}`);
    return 0;
  }

  if (cmd === 'status') {
    const byStatus = new Map<string, number>();
    for (const r of manifest.rows) byStatus.set(`${r.class} / ${r.status}`, (byStatus.get(`${r.class} / ${r.status}`) ?? 0) + 1);
    for (const [k, n] of [...byStatus.entries()].sort()) console.log(`${k.padEnd(32)} ${n}`);
    console.log(`\ntotal ${manifest.rows.length}`);
    return 0;
  }

  if (cmd !== 'run') {
    console.error(`unknown command "${cmd}"\n\n${USAGE}`);
    return 2;
  }

  const perImage = num('credits-per-image', { min: 0 });
  if (perImage !== undefined) {
    manifest._credits.perImageCredits = perImage;
    manifest._credits.measuredFrom = `--credits-per-image at ${new Date().toISOString()}`;
  }

  const limit = num('limit', { min: 1, integer: true });
  const concurrency = num('concurrency', { min: 1, integer: true });

  const wantClass = opt('class');
  const wantId = opt('id');
  assertFiltersMatch(manifest, { ...(wantClass === undefined ? {} : { class: wantClass }), ...(wantId === undefined ? {} : { id: wantId }) });

  const matched = selectRows(manifest, {
    ...(wantClass === undefined ? {} : { class: wantClass }),
    ...(wantId === undefined ? {} : { id: wantId }),
    force: true,
  });
  const rows = selectRows(manifest, {
    ...(wantClass === undefined ? {} : { class: wantClass }),
    ...(wantId === undefined ? {} : { id: wantId }),
    ...(limit === undefined ? {} : { limit }),
    force: flag('force'),
  });
  if (rows.length === 0) {
    console.log(
      `nothing to do: ${matched.length} row(s) match those filters and all of them are already ` +
        'generated (status is neither pending nor failed). --force to regenerate them.',
    );
    return 0;
  }

  // The run path re-derives before it submits. `rebuild` is the only derivation and the only place
  // G5 is enforced on the way through; without this, every hand edit to manifest.json reached the
  // cloud unexamined — including the `version` bump the SeedReuseError message asks for, which
  // leaves `seed` at its old value until a rebuild moves it.
  assertRowsDerived(manifest, rows, validateContent());

  const untrialled = [...new Set(rows.map((r) => r.class))].filter((c) => !classOf(manifest, c).trialled);
  if (untrialled.length > 0) {
    console.log(`untrialed class(es) in this batch — ${untrialled.join(', ')} (see assertSupervised).`);
  }

  const env = await loadEnv(resolve(REPO_ROOT, '.env'));
  const client = new ComfyClient(env);
  const base = JSON.parse(await readFile(BASE_GRAPH_PATH, 'utf8')) as Graph;

  try {
    const report = await runBatch(manifest, rows, client, base, env, {
      confirmed: flag('confirm'),
      dryRun: flag('dry-run'),
      ...(concurrency === undefined ? {} : { concurrency }),
    });
    console.log(`\n${report.succeeded}/${report.attempted} ok · ${report.flagged.length} flagged for supervised review`);
    return report.flagged.length > 0 ? 1 : 0;
  } finally {
    if (!flag('dry-run')) await saveManifest(manifest);
  }
}

if (isEntrypoint()) {
  try {
    process.exitCode = await main();
  } catch (e) {
    // A guardrail refusal is an expected outcome, not a crash: print what the operator needs to
    // decide and stop. A stack trace here reads as a bug in the tool and invites someone to
    // "fix" the gate.
    if (e instanceof Error && isGuardrail(e)) {
      console.error(`\n${e.message}\n`);
      process.exitCode = 3;
    } else {
      throw e;
    }
  }
}
