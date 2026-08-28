/**
 * tools/mapgen/run.ts — the CLI.
 *
 *   npx tsx tools/mapgen/run.ts seed [--force] [--discard-authored-layouts] [--node=<id>]
 *       Write a STARTING layout per node from tools/mapgen/seed.ts. Three outcomes per node, and
 *       the guard on `doSeed` below is where they are decided: a missing file is written; a file
 *       that still matches the seeder byte for byte is skipped, or rewritten under --force; a file
 *       that DIFFERS from the seeder carries hand edits and is refused — --force does not reach it,
 *       only --force --discard-authored-layouts does. Any refusal exits non-zero.
 *
 *   npx tsx tools/mapgen/run.ts verify [--node=<id>]
 *       Read the layouts on disk and print every way they are out of contract. Exit 1 if any is.
 *
 *   npx tsx tools/mapgen/run.ts render [--node=<id>]
 *       Verify, then write assets/raw/_layouts/control-<id>.png, .../masks/mask-<id>.png and the
 *       contact sheet. Renders from the .txt on disk, never from the seeder — so a hand edit is
 *       what reaches the images.
 *
 *   npx tsx tools/mapgen/run.ts all [--force] [--discard-authored-layouts] [--node=<id>]
 *       seed with EXACTLY the flags you passed, then render. `all` does NOT imply --force — this
 *       line used to say "seed --force, then render", which is not what the code below has ever
 *       done, and a header telling a reader that forcing is the normal mode of operation is how a
 *       directory of authored designs gets overwritten by someone who believed the header. Bare
 *       `all` skips every existing layout and renders what is already on disk.
 *
 * Generates no Comfy images and spends nothing: every pixel here is drawn locally by sharp.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { validateContent } from '../../core/schemas.ts';
import type { Balance, Content } from '../../core/types.ts';
import { parseLayout, serialiseLayout, type LayoutDoc } from './layout.ts';
import { placements, type NodePlacement } from './nodes.ts';
import {
  CONTACT_SHEET,
  LAYOUT_DIR,
  MASK_DIR,
  OUTPUT_DIR,
  REPO_ROOT,
  controlPath,
  layoutPath,
  maskPath,
} from './paths.ts';
import { writeControl, writeMask } from './render.ts';
import { seedLayout } from './seed.ts';
import { verifyLayout } from './verify.ts';

/** Read one layout from disk, parsed. Throws if the file is missing — with the command to make it. */
export function loadLayout(nodeId: string, balance: Balance): LayoutDoc {
  const path = layoutPath(nodeId);
  if (!existsSync(path)) {
    throw new Error(
      `no layout at ${relative(REPO_ROOT, path)} — run \`npx tsx tools/mapgen/run.ts seed\` to write a ` +
        `starting one, then edit it`,
    );
  }
  return parseLayout(nodeId, readFileSync(path, 'utf8'), balance);
}

/** Every layout on disk, in chain order, with the placement each was judged against. */
export function loadAllLayouts(content: Content): Array<{ placement: NodePlacement; doc: LayoutDoc }> {
  return placements(content).map((placement) => ({ placement, doc: loadLayout(placement.node.id, content.balance) }));
}

export function problemsFor(placement: NodePlacement, doc: LayoutDoc, balance: Balance): string[] {
  return verifyLayout({
    doc,
    node: placement.node,
    balance,
    back: placement.back,
    onward: placement.onward,
    settlement: placement.settlement,
  });
}

function selected(content: Content, only: string | null): NodePlacement[] {
  const all = placements(content);
  if (only === null) return all;
  const one = all.find((p) => p.node.id === only);
  if (!one) throw new Error(`--node=${only} is not a node in data/nodes/`);
  return [one];
}

/** What one seed run did, by node id. Enough for main() to set an exit code and for a test to bind. */
export interface SeedReport {
  written: string[];
  skipped: string[];
  refused: string[];
}

export interface SeedOptions {
  /** Overwrite a layout the SEEDER wrote. Never reaches one a human changed — see below. */
  force: boolean;
  /** The escape hatch. Only meaningful together with `force`, deliberately; see below. */
  discardAuthored: boolean;
  /**
   * Where the `.txt` layouts live. Defaults to the real LAYOUT_DIR. A test points this at a scratch
   * directory so the guard can be driven for real without the repo's own authored layouts being the
   * subject of the experiment. Only the DIRECTORY is redirected — the file's NAME stays paths.ts's
   * business, so there is no second copy of the "<nodeId>.txt" rule that could disagree with the
   * first. (Same shape as `writePlaceholders(..., { root })` in tools/postprocess/run.ts.)
   */
  layoutDir?: string;
}

/**
 * THE GUARD: --force may overwrite what the SEEDER wrote. Nothing overwrites what a HUMAN wrote.
 *
 * The `.txt` layouts are the single source that both the painted control image and the collision
 * mask derive from — `doRender` below builds both from the file on disk — so one lost layout is a
 * lost map AND a lost mask, and the seeder cannot put a hand-authored 64×64 design back. It has no
 * idea where the buildings went. Before this guard, `seed --force` and `all --force` were one
 * keystroke from erasing every authored design in the directory, silently, and exiting 0.
 *
 * WHY THE HAND-EDIT TEST IS DERIVED, NOT RECORDED. The two obvious implementations are a marker in
 * the header ("# hand-edited, do not seed") and a manifest of hashes beside the files. Both are
 * bookkeeping, and bookkeeping drifts. The marker is forgotten by the human editing the file — and
 * worse, the seeder WRITES the header itself, so the seeder could stamp, keep or clear a marker of
 * its own accord and be believed. A manifest goes stale the moment a layout is edited without
 * running the tool that maintains it, and a stale manifest here reads as "no hand edits, go ahead".
 * So the question is answered from the artefacts themselves: `serialiseLayout(seedLayout(...))` is
 * EXACTLY the bytes this command is about to write, and the seeder is deterministic (its rng is
 * seeded from `MAPGEN.seedBase` and the node id), so a file differing from those bytes by one
 * character is a file somebody changed. Nothing to maintain, nothing for the seeder to forge, and
 * it cannot go stale — it is recomputed on every run.
 *
 * ANY difference counts: a moved wall, a re-wrapped header comment, a trailing space. The tool
 * cannot tell a meaningful edit from a trivial one, and the two mistakes are not the same size — a
 * false "hand-edited" costs an operator one more flag, a false "the seeder wrote this" costs a
 * design pass.
 *
 * IT FALSE-POSITIVES ON PURPOSE, AND THAT IS NOT A BUG TO FIX. The seeder's output is a function of
 * `data/nodes/*.json` (adjacency, props, biome), of `tools/mapgen/seed.ts`, and of the serialiser.
 * Change any of those and a PRISTINE, seeder-written layout stops matching a fresh serialise and is
 * classified as hand-authored from then on. It will refuse instead of overwriting. That is the
 * correct answer: after such a change the tool genuinely cannot tell whether the file on disk is
 * old seeder output or somebody's work, and refusing is the only outcome that is safe when it
 * guesses wrong. If you have hit an unexpected refusal, that is what happened; the fix is to pass
 * the hatch for the files you have actually looked at, NOT to loosen the comparison — a comparison
 * relaxed to stop crying wolf is a comparison that stops noticing the wolf.
 *
 * WHY A REFUSAL AND NOT A WARNING. A warning that proceeds is destruction with a receipt: by the
 * time it is read the file is gone, and one warning inside a twelve-node run scrolls off the
 * screen. That is also why this returns a report and `main` exits non-zero on it — a script or a CI
 * step that ran `all --force` must not read success from a run that declined part of what it was
 * asked to do.
 *
 * THE ESCAPE HATCH IS BOTH FLAGS: `--force --discard-authored-layouts`. Neither implies the other,
 * on purpose. --force keeps its existing narrow meaning ("overwrite files that already exist"), so
 * a reader of any seed command line can still answer "can this overwrite anything at all?" by
 * looking for --force alone; and the hatch has to be spelled out in full, which is not somewhere a
 * typo, a shell-history recall or a habit lands you. --discard-authored-layouts on its own is not
 * shorthand for "force harder" — it refuses exactly as bare `seed` does, and says so.
 *
 * (Neither flag name nor the `.txt` file format is a gameplay constant, so G11 does not reach them:
 * the numbers G11 governs are the ones the sim reads, and they live in data/balance.json. Every
 * dimension this file's layouts have still comes from there, through `layoutDims`.)
 */
export function doSeed(content: Content, only: string | null, opts: SeedOptions): SeedReport {
  const dir = opts.layoutDir ?? LAYOUT_DIR;
  mkdirSync(dir, { recursive: true });
  const report: SeedReport = { written: [], skipped: [], refused: [] };
  for (const placement of selected(content, only)) {
    const path = resolve(dir, basename(layoutPath(placement.node.id)));
    const shown = relative(REPO_ROOT, path);
    const { doc, notes } = seedLayout(placement, content.balance);
    const fresh = serialiseLayout(doc);
    const onDisk = existsSync(path) ? readFileSync(path, 'utf8') : null;

    if (onDisk !== null && onDisk !== fresh && !(opts.force && opts.discardAuthored)) {
      report.refused.push(placement.node.id);
      console.log(
        `  REFUSE ${shown} — differs from what the seeder writes, so it carries hand edits; not ` +
          `overwritten${opts.force ? ' (--force does not reach a hand-authored layout)' : ''}. To ` +
          `throw the authored design away anyway: --force --discard-authored-layouts`,
      );
      continue;
    }
    if (onDisk !== null && !opts.force) {
      report.skipped.push(placement.node.id);
      console.log(`  skip   ${shown} (exists, and still matches the seeder; --force to rewrite it)`);
      continue;
    }
    writeFileSync(path, fresh, 'utf8');
    report.written.push(placement.node.id);
    console.log(`  seed   ${shown}${notes.length > 0 ? `  · ${notes.length} note(s)` : ''}`);
  }
  return report;
}

/**
 * Exit 3 is the repo's shared "a guardrail refused" code — tools/postprocess/run.ts and
 * tools/comfy/comfy-batch.ts already answer with it — so one wrapper script reads one code for one
 * class of answer. A process-exit convention, not a gameplay constant.
 */
export const REFUSED_EXIT_CODE = 3;

/** Say what was refused, and make the process say it too. A partial run is not a successful run. */
export function reportRefusals(report: SeedReport): void {
  if (report.refused.length === 0) return;
  console.error(
    `\n${report.refused.length} hand-authored layout(s) left untouched: ${report.refused.join(', ')}.\n` +
      `Nothing was overwritten. Pass --force --discard-authored-layouts only if you mean to lose them.`,
  );
  process.exitCode = REFUSED_EXIT_CODE;
}

function doVerify(content: Content, only: string | null): number {
  let bad = 0;
  for (const placement of selected(content, only)) {
    const doc = loadLayout(placement.node.id, content.balance);
    const problems = problemsFor(placement, doc, content.balance);
    if (problems.length === 0) {
      console.log(`  ok     ${placement.node.id}`);
    } else {
      bad += 1;
      console.log(`  FAIL   ${placement.node.id}`);
      for (const p of problems) console.log(`           · ${p}`);
    }
  }
  return bad;
}

async function doRender(content: Content, only: string | null): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(MASK_DIR, { recursive: true });
  for (const placement of selected(content, only)) {
    const id = placement.node.id;
    const doc = loadLayout(id, content.balance);
    const problems = problemsFor(placement, doc, content.balance);
    if (problems.length > 0) {
      throw new Error(`refusing to render "${id}" — it is out of contract:\n  · ${problems.join('\n  · ')}`);
    }
    await writeControl(controlPath(id), doc, content.balance);
    await writeMask(maskPath(id), doc, content.balance);
    console.log(`  render ${relative(REPO_ROOT, controlPath(id))}  +  ${relative(REPO_ROOT, maskPath(id))}`);
  }
  await contactSheet();
}

/**
 * The contact sheet, through `tools/postprocess/contact-sheet.mjs` rather than a second one written
 * here. It globs `*.png` that do not begin with `_` in one directory, which is exactly why the masks
 * live in a subdirectory: the sheet a human reviews should be the twelve control images, not
 * twenty-four cells of alternating art and black-and-white.
 */
async function contactSheet(): Promise<void> {
  const script = resolve(REPO_ROOT, 'tools/postprocess/contact-sheet.mjs');
  await new Promise<void>((ok, fail) => {
    const child = spawn(process.execPath, [script, OUTPUT_DIR, CONTACT_SHEET, '4'], { stdio: 'inherit' });
    child.on('error', fail);
    child.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`contact-sheet.mjs exited ${String(code)}`))));
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args.find((a) => !a.startsWith('--')) ?? 'render';
  const force = args.includes('--force');
  // Read separately and combined nowhere but in `doSeed`: --force must not imply the hatch, and the
  // hatch must not imply --force. The guard on `doSeed` says why.
  const discardAuthored = args.includes('--discard-authored-layouts');
  const nodeArg = args.find((a) => a.startsWith('--node='));
  const only = nodeArg === undefined ? null : nodeArg.slice('--node='.length);

  const content = validateContent();

  if (command === 'seed') {
    reportRefusals(doSeed(content, only, { force, discardAuthored }));
    return;
  }
  if (command === 'verify') {
    const bad = doVerify(content, only);
    if (bad > 0) {
      console.error(`\n${bad} layout(s) out of contract.`);
      process.exitCode = 1;
    }
    return;
  }
  if (command === 'render') {
    await doRender(content, only);
    return;
  }
  if (command === 'all') {
    reportRefusals(doSeed(content, only, { force, discardAuthored }));
    /* Rendering PROCEEDS after a refusal, deliberately. `doRender` reads the `.txt` on disk and
     * never the seeder, so for a refused node it draws the AUTHORED layout — which is the correct
     * output and the one a human wants to look at. Stopping here would leave the images stale
     * against the very files the guard just protected. What must not happen is the run reporting
     * success, and `reportRefusals` has already set the exit code above; `doRender` can only raise
     * it further, by throwing when a layout is out of contract. */
    await doRender(content, only);
    return;
  }
  console.error(`unknown command "${command}" — expected seed | verify | render | all`);
  process.exitCode = 2;
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === `file://${resolve(process.argv[1])}`;
if (invokedDirectly) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
