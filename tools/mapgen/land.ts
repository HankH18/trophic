/**
 * tools/mapgen/land.ts — the committed step that puts a node's PAINTING and its COLLISION MASK into
 * `assets/final/maps/`, both derived from the one 64×64 text file the node's geometry is authored in.
 *
 *   npx tsx tools/mapgen/land.ts            # land all twelve
 *   npx tsx tools/mapgen/land.ts --node=r1  # land one
 *   npx tsx tools/mapgen/land.ts --check    # land NOTHING; report any shipped file that is stale
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS AT ALL
 * ═════════════════════════════════════════════════════════════════════════════
 * There was no committed step that landed a composed map into `assets/final/`. The composer
 * (`tools/mapgen/compose/compose.py`) wrote wherever its second argument pointed and a human moved
 * the file; `tools/mapgen/run.ts render` wrote masks to `assets/raw/_layouts/masks/`, which is
 * gitignored and which nothing in `data/`, `game/` or the served copy has ever read. So the two
 * artefacts the player actually plays on arrived by hand, and "is the shipped map the one this
 * layout draws?" had no answer a script could give. `--check` is that answer.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ONE SOURCE, TWO OUTPUTS — WHICH IS THE WHOLE POINT
 * ═════════════════════════════════════════════════════════════════════════════
 * The painting and the mask are stamped from the SAME `tools/mapgen/layouts/<id>.txt`, so they
 * cannot disagree about where a wall is. That correspondence is what makes a mask safe to ship:
 * a mask that is geometrically exact against the wrong picture blocks the painted road and opens
 * the painted house, which is worse than the all-open placeholder it replaces.
 *
 * Neither output is decided here:
 *   · the MASK goes through `render.ts::writeMask` → `game/collision.ts::maskRasterFrom`, the
 *     engine's own declared inverse of `sampleMask`. There is no second opinion about what a mask
 *     looks like anywhere in the repo, and this file does not add one.
 *   · the PAINTING goes through `compose/compose.py`, unchanged and unwrapped. It is invoked as a
 *     subprocess rather than reimplemented, because the autotiling, the keyline, the roof plan and
 *     the contrast rule are that file's and a second composer would be a second thing to keep true.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHERE THE OUTPUTS GO IS READ FROM `data/nodes/*.json`, NEVER TYPED HERE
 * ═════════════════════════════════════════════════════════════════════════════
 * `NodeFile.mapAsset` and `NodeFile.collisionMask` are the paths the game loads
 * (`game/mapview.ts::nodeArtKeys`), the paths `game/placeholder.ts`'s build-time glob registers, and
 * the paths `tests/gates/asset-palette-contract.test.ts` excludes masks by. A `-mask.png` suffix
 * written into this file would be a second statement of that convention and a second thing that can
 * drift, so this reads the fields. If the data renames a mask, this follows it.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * IDEMPOTENT, AND IT NEVER TOUCHES A LAYOUT
 * ═════════════════════════════════════════════════════════════════════════════
 * Both producers are deterministic — the composer hashes (col,row) with FNV-1a and has no clock and
 * no `random`; `maskRasterFrom` writes whole 16×16 cells of pure ink. Running twice therefore
 * produces the same bytes, and this file only replaces a destination whose bytes actually CHANGED,
 * so a no-op run leaves every mtime alone. The layouts are opened read-only. There is no seeding
 * path in this file and it must never grow one: `run.ts seed` is where writing a layout lives, with
 * the guard that refuses a hand-authored design, and a second writer would route around that guard.
 *
 * A node whose layout is OUT OF CONTRACT is refused rather than landed — `verifyLayout` is the same
 * check `run.ts verify` runs, so a design that would strand the spawn or sever a corridor cannot
 * reach `assets/final/` through here.
 *
 * (No gameplay constant is decided here. Every dimension comes from `data/balance.json` through
 * `layoutDims` / `maskRasterFrom`; G11's subject is the numbers the sim reads.)
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { validateContent } from '../../core/schemas.ts';
import type { Balance, Content, NodeFile } from '../../core/types.ts';
import { REPO_ROOT, layoutPath } from './paths.ts';
import { placements } from './nodes.ts';
import { loadLayout, problemsFor } from './run.ts';
import { maskRasterOf } from './render.ts';
import { writeRaster } from '../postprocess/raster.ts';

export class LandError extends Error {}

/** The interpreter the composer runs under. Overridable so a machine with a different name can land. */
const PYTHON = process.env.TROPHIC_PYTHON ?? 'python3';

/** `compose.py`'s path — the one composer, invoked, never reimplemented. */
const COMPOSER = resolve(REPO_ROOT, 'tools/mapgen/compose/compose.py');

/** What happened to one artefact. `landed`/`unchanged` are both successes; `stale` is `--check`'s. */
export type Outcome = 'landed' | 'unchanged' | 'stale' | 'missing';

export interface ArtefactResult {
  /** Repo-relative destination, straight out of the node JSON. */
  path: string;
  outcome: Outcome;
  bytes: number;
}

export interface NodeResult {
  nodeId: string;
  map: ArtefactResult;
  mask: ArtefactResult;
}

/** Run the composer into `out`. Rejects with the composer's own stderr, which names the layout. */
async function compose(layoutFile: string, out: string): Promise<void> {
  await new Promise<void>((ok, fail) => {
    const child = spawn(PYTHON, [COMPOSER, layoutFile, out], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d: Buffer) => {
      err += d.toString();
    });
    child.on('error', (e) =>
      fail(
        new LandError(
          `could not run "${PYTHON}" (${e.message}). The painting half of this step is ` +
            `tools/mapgen/compose/compose.py and needs Python with Pillow; set TROPHIC_PYTHON to ` +
            `the interpreter that has it.`,
        ),
      ),
    );
    child.on('exit', (code) =>
      code === 0 ? ok() : fail(new LandError(`compose.py exited ${String(code)} on ${layoutFile}\n${err}`)),
    );
  });
}

/**
 * Put `bytes` at `dest` only if they differ from what is there.
 *
 * The comparison is the point, not an optimisation: it is what makes a re-run a no-op rather than
 * twelve rewritten files with new mtimes, and it is what `--check` reads to answer "is the shipped
 * file the one this layout produces today".
 */
function settle(dest: string, fresh: Buffer, check: boolean): ArtefactResult {
  const shown = relative(REPO_ROOT, dest);
  const present = existsSync(dest);
  const same = present && Buffer.compare(readFileSync(dest), fresh) === 0;
  if (check) {
    return { path: shown, outcome: !present ? 'missing' : same ? 'unchanged' : 'stale', bytes: fresh.length };
  }
  if (same) return { path: shown, outcome: 'unchanged', bytes: fresh.length };
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, fresh);
  return { path: shown, outcome: 'landed', bytes: fresh.length };
}

/**
 * Land (or check) one node's painting and mask.
 *
 * `scratch` is where the composer is pointed: the destination is never written by the composer
 * directly, so a composer that fails halfway cannot leave a truncated PNG in `assets/final/`.
 */
export async function landNode(
  content: Content,
  node: NodeFile,
  scratch: string,
  check: boolean,
): Promise<NodeResult> {
  const balance: Balance = content.balance;
  const placement = placements(content).find((p) => p.node.id === node.id);
  if (!placement) throw new LandError(`"${node.id}" has no placement in the region chain`);

  const doc = loadLayout(node.id, balance);
  const problems = problemsFor(placement, doc, balance);
  if (problems.length > 0) {
    throw new LandError(
      `refusing to land "${node.id}" — its layout is out of contract:\n  · ${problems.join('\n  · ')}`,
    );
  }

  // ── the painting ─────────────────────────────────────────────────────────
  const staged = join(scratch, `${node.id}.png`);
  await compose(layoutPath(node.id), staged);
  const map = settle(resolve(REPO_ROOT, node.mapAsset), readFileSync(staged), check);

  // ── the mask, from the SAME doc ──────────────────────────────────────────
  const stagedMask = join(scratch, `${node.id}-mask.png`);
  await writeRaster(stagedMask, maskRasterOf(doc, balance));
  const mask = settle(resolve(REPO_ROOT, node.collisionMask), readFileSync(stagedMask), check);

  return { nodeId: node.id, map, mask };
}

export interface LandOptions {
  /** Only this node. Null ⇒ every node in `data/nodes/`. */
  only?: string | null;
  /** Report drift instead of repairing it. Nothing is written to `assets/final/`. */
  check?: boolean;
}

/** Land every selected node, in region-chain order so the log reads like the walk. */
export async function land(content: Content, opts: LandOptions = {}): Promise<NodeResult[]> {
  const only = opts.only ?? null;
  const check = opts.check ?? false;
  const chain = placements(content).map((p) => p.node);
  const selected = only === null ? chain : chain.filter((n) => n.id === only);
  if (selected.length === 0) throw new LandError(`--node=${String(only)} is not a node in data/nodes/`);

  const scratch = join(tmpdir(), `trophic-land-${String(process.pid)}`);
  mkdirSync(scratch, { recursive: true });
  try {
    const out: NodeResult[] = [];
    for (const node of selected) out.push(await landNode(content, node, scratch, check));
    return out;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Exit 3, the repo's shared "a guardrail refused" code — same as `run.ts` `REFUSED_EXIT_CODE`. */
const DRIFT_EXIT_CODE = 3;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const nodeArg = args.find((a) => a.startsWith('--node='));
  const only = nodeArg === undefined ? null : nodeArg.slice('--node='.length);

  const content = validateContent();
  const results = await land(content, { only, check });

  for (const r of results) {
    for (const a of [r.map, r.mask]) {
      console.log(`  ${a.outcome.padEnd(9)} ${a.path}  (${String(a.bytes)} bytes)`);
    }
  }
  const bad = results.flatMap((r) => [r.map, r.mask]).filter((a) => a.outcome === 'stale' || a.outcome === 'missing');
  if (bad.length > 0) {
    console.error(
      `\n${String(bad.length)} shipped artefact(s) do not match what the layouts produce today: ` +
        `${bad.map((a) => `${a.path} (${a.outcome})`).join(', ')}.\n` +
        `Re-run without --check to land them.`,
    );
    process.exitCode = DRIFT_EXIT_CODE;
  }
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === `file://${resolve(process.argv[1])}`;
if (invokedDirectly) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
