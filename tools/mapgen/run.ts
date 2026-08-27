/**
 * tools/mapgen/run.ts — the CLI.
 *
 *   npx tsx tools/mapgen/run.ts seed [--force] [--node=<id>]
 *       Write a STARTING layout per node from tools/mapgen/seed.ts. Refuses to overwrite an
 *       existing file unless --force, because these are meant to be hand-edited and the seeder
 *       has no idea what a human put there.
 *
 *   npx tsx tools/mapgen/run.ts verify [--node=<id>]
 *       Read the layouts on disk and print every way they are out of contract. Exit 1 if any is.
 *
 *   npx tsx tools/mapgen/run.ts render [--node=<id>]
 *       Verify, then write assets/raw/_layouts/control-<id>.png, .../masks/mask-<id>.png and the
 *       contact sheet. Renders from the .txt on disk, never from the seeder — so a hand edit is
 *       what reaches the images.
 *
 *   npx tsx tools/mapgen/run.ts all [--force]
 *       seed --force, then render.
 *
 * Generates no Comfy images and spends nothing: every pixel here is drawn locally by sharp.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
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

function doSeed(content: Content, only: string | null, force: boolean): void {
  mkdirSync(LAYOUT_DIR, { recursive: true });
  for (const placement of selected(content, only)) {
    const path = layoutPath(placement.node.id);
    if (existsSync(path) && !force) {
      console.log(`  skip   ${relative(REPO_ROOT, path)} (exists; --force to overwrite hand edits)`);
      continue;
    }
    const { doc, notes } = seedLayout(placement, content.balance);
    writeFileSync(path, serialiseLayout(doc), 'utf8');
    console.log(`  seed   ${relative(REPO_ROOT, path)}${notes.length > 0 ? `  · ${notes.length} note(s)` : ''}`);
  }
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
  const nodeArg = args.find((a) => a.startsWith('--node='));
  const only = nodeArg === undefined ? null : nodeArg.slice('--node='.length);

  const content = validateContent();

  if (command === 'seed') {
    doSeed(content, only, force);
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
    doSeed(content, only, force);
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
