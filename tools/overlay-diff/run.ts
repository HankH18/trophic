/**
 * tools/overlay-diff/run.ts — CLI for build-doc §8.2 (`npm run overlay-diff`).
 *
 *   npx tsx tools/overlay-diff/run.ts --base=<png> --candidate=<png> [--mask=<png>] [--json]
 *   npx tsx tools/overlay-diff/run.ts --node=<nodeId> --candidate=<png>
 *       Resolves the base map and the collision mask from data/nodes/<nodeId>.json, so the paths
 *       the gate reads are the same ones the game reads.
 *
 * Exit code 0 = ACCEPT, 1 = REJECT. That is the point: this is meant to sit in a loop that
 * regenerates at the next denoise on the ladder (§9.5) and gives up after
 * `balance.overlayDiff.maxRegenAttempts` rather than lowering the bar.
 *
 * G4: a REJECT is never overridden by hand. If a variant has to ship anyway, it needs a
 * DEVIATIONS entry, not a flag on this command — which is why there is no --force here.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRaster } from '../postprocess/raster.ts';
import { REPO_ROOT } from '../postprocess/palette.ts';
import { overlayDiff } from './diff.ts';
import { collisionGrid, denoiseLadder, overlayDiffConfig } from './config.ts';
import { validateContent } from '../../core/schemas.ts';

function isEntrypoint(): boolean {
  const argv1 = process.argv[1];
  return argv1 !== undefined && resolve(argv1) === resolve(fileURLToPath(import.meta.url));
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const opt = (k: string): string | undefined => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const flag = (k: string): boolean => argv.includes(`--${k}`);

  const candidate = opt('candidate');
  let base = opt('base');
  let mask = opt('mask');
  const nodeId = opt('node');
  const content = validateContent();

  if (nodeId) {
    const node = content.nodes.find((n) => n.id === nodeId);
    if (!node) {
      console.error(`no such node "${nodeId}" in data/nodes/`);
      return 2;
    }
    base ??= node.mapAsset;
    mask ??= node.collisionMask;
  }

  if (!base || !candidate) {
    console.error(
      'build-doc §8.2 map-variant layout freeze\n\n' +
        '  npx tsx tools/overlay-diff/run.ts --base=<png> --candidate=<png> [--mask=<png>] [--json]\n' +
        '  npx tsx tools/overlay-diff/run.ts --node=<nodeId> --candidate=<png>\n\n' +
        'exit 0 = ACCEPT, 1 = REJECT. There is no override flag: G4 says a failing variant is never\n' +
        'accepted by hand without a DEVIATIONS entry.',
    );
    return 2;
  }

  const abs = (p: string) => resolve(REPO_ROOT, p);
  for (const [label, p] of [
    ['base', base],
    ['candidate', candidate],
  ] as const) {
    if (!existsSync(abs(p))) {
      console.error(`${label} image not found: ${p}`);
      return 2;
    }
  }
  const haveMask = mask !== undefined && existsSync(abs(mask));
  if (mask !== undefined && !haveMask) {
    console.error(
      `collision mask not found: ${mask}\n` +
        'Refusing to fall back to "everything is walkable" silently — that would compare the whole\n' +
        'frame and fail every legitimate aged variant (docks rot, canopy thins: bible §6).',
    );
    return 2;
  }

  const result = overlayDiff({
    base: await readRaster(abs(base)),
    candidate: await readRaster(abs(candidate)),
    ...(haveMask ? { mask: await readRaster(abs(mask!)) } : {}),
    grid: collisionGrid(content.balance),
    config: overlayDiffConfig(content.balance),
  });

  if (flag('json')) {
    console.log(JSON.stringify({ base, candidate, mask: haveMask ? mask : null, ...result }, null, 2));
  } else {
    if (!haveMask) console.log('NOTE: no collision mask given — every pixel counted as walkable.');
    console.log(`base       ${base}`);
    console.log(`candidate  ${candidate}`);
    console.log(
      `edges      base ${result.baseEdges} · candidate ${result.candidateEdges} · ` +
        `∩ ${result.intersection} · ∪ ${result.union} · walkable px ${result.walkable}`,
    );
    console.log(
      `IoU        ${result.iou.toFixed(4)}  (threshold ${result.threshold})  ` +
        `[whole frame ${result.unrestrictedIou.toFixed(4)}]`,
    );
    const w = result.worstRegion;
    console.log(
      `drift      ${result.cellsDrifted}/${result.cellsCompared} walkable cells drifted · worst region ` +
        `${w?.cells ?? 0} cell(s), ${w?.judgedCells ?? 0} judged (limit ${result.driftLimit}) · ` +
        `${w?.lostEdges ?? 0} edge px LOST (limit ${result.lostEdgeLimit}), ${w?.gainedEdges ?? 0} gained`,
    );
    if (w) {
      // Where to LOOK. The verdict used to name a single cell and nothing else, and G4 forbids
      // overriding a REJECT by hand — so this line is the operator's only lead.
      console.log(
        `           at cells (${w.cellRect.cx0}, ${w.cellRect.cy0})–(${w.cellRect.cx1}, ${w.cellRect.cy1}) ` +
          `= px (${w.pixelRect.x0}, ${w.pixelRect.y0})–(${w.pixelRect.x1}, ${w.pixelRect.y1})`,
      );
    }
    console.log(result.reason);
    if (!result.accepted) {
      const ladder = denoiseLadder(content.balance);
      console.log(
        `next step  regenerate at a lower denoise — ladder starts ${ladder.denoiseStart}, ` +
          `steps −${ladder.denoiseStep}, floor ${ladder.denoiseFloor}, at most ` +
          `${ladder.maxRegenAttempts} attempts (§9.5). Then the year reuses the nearest passing variant.`,
      );
    }
  }
  return result.accepted ? 0 : 1;
}

if (isEntrypoint()) {
  process.exitCode = await main();
}
