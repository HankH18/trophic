/**
 * tests/unit/mapgen-seed-guard.test.ts — the seeder cannot overwrite a hand-authored layout.
 *
 * WHAT THE GREEN IS EVIDENCE OF, stated up front so nobody has to infer it:
 *
 *   · The function under test is the REAL `doSeed` exported from `tools/mapgen/run.ts` — the same
 *     one `main()` calls for `seed` and for `all`. Nothing here reimplements the comparison, so a
 *     guard weakened in run.ts turns this red rather than leaving a green copy of the old rule.
 *   · Every case runs against a SCRATCH DIRECTORY under the OS temp dir, through
 *     `SeedOptions.layoutDir`. This suite never reads and never writes `tools/mapgen/layouts/` —
 *     the twelve authored designs are the thing the guard exists to protect, not an experiment to
 *     run it against, so the fixtures below are built from strings and from the seeder's own output.
 *   · The refusal is proved by the BYTES ON DISK being unchanged, not only by the report. A guard
 *     that reported a refusal and wrote the file anyway would still fail here.
 *   · The non-zero exit is proved through `reportRefusals`, which is what `main()` calls — so the
 *     exit code a CI step reads is the one asserted.
 *
 * The seeder is deterministic (rng seeded from `MAPGEN.seedBase` and the node id), which is the
 * property the whole guard rests on: "differs from a fresh serialise" only means "somebody changed
 * it" if a fresh serialise is stable. The `--force` rewrite case exercises that directly — it seeds
 * the same node twice in one process and requires the second run's bytes to equal the first's.
 *
 * SABOTAGE CONTROL, done by hand and recorded here for the next person: turn the refusal branch in
 * `doSeed` into a warning that falls through to the write, and these reddens —
 * "refuses a hand-authored layout even under --force", "…with no flags", "…when only the hatch is
 * passed", "…one legal cell", and "a refusal makes the process exit non-zero". Restoring the
 * refusal returns them to green. A guard nobody has seen fail is decoration.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { validateContent } from '../../core/schemas.ts';
import type { Content } from '../../core/types.ts';
import { BODY_SEPARATOR, serialiseLayout } from '../../tools/mapgen/layout.ts';
import { placements, type NodePlacement } from '../../tools/mapgen/nodes.ts';
import { LAYOUT_DIR, layoutPath } from '../../tools/mapgen/paths.ts';
import { seedLayout } from '../../tools/mapgen/seed.ts';
import { REFUSED_EXIT_CODE, doSeed, reportRefusals, type SeedReport } from '../../tools/mapgen/run.ts';

/* ────────────────────────────────────────────────────────────────────────────
 * Fixtures. One real node, because the guard is per-file and twelve of the same
 * decision proves nothing the first one did not.
 * ──────────────────────────────────────────────────────────────────────────── */

let content: Content;
let placement: NodePlacement;
let nodeId: string;
/** Exactly the bytes the seeder writes for that node — the thing "hand-edited" is defined against. */
let fresh: string;
/** The scratch directory for the case currently running. Never `LAYOUT_DIR`. */
let dir: string;

/**
 * A layout somebody wrote by hand. Built from a string on purpose: it is not copied from
 * `tools/mapgen/layouts/`, so this suite can neither be affected by the authored designs nor affect
 * them. It is not a valid 64×64 layout either, and does not need to be — the guard compares bytes
 * and never parses. The "one legal cell" case below covers the other end of that range.
 */
const AUTHORED = [
  '# authored by hand, not by the seeder',
  '# the mill sits on the ford and the lane leaves by the north mouth',
  BODY_SEPARATOR,
  '....##....',
  '..#....#..',
  '',
].join('\n');

/**
 * The seeder's own output with ONE cell changed, open ground (`.`) to scrub (`,`) or the reverse —
 * whichever of the two that node's biome laid down. Both are walkable, neither is an anchor, and
 * both are in `DEFAULT_LEGEND`, so the file is still a layout in contract: the point is that the
 * guard fires on a DIFFERENCE, not on a file being broken, oddly shaped or obviously human.
 */
const GROUND_SWAP: ReadonlyArray<readonly [string, string]> = [
  ['.', ','],
  [',', '.'],
];

function oneCellEdited(seedOutput: string): string {
  const cut = seedOutput.indexOf(`\n${BODY_SEPARATOR}\n`);
  expect(cut).toBeGreaterThan(0);
  const body = seedOutput.slice(cut);
  for (const [from, to] of GROUND_SWAP) {
    const at = body.indexOf(from);
    if (at < 0) continue;
    return seedOutput.slice(0, cut) + body.slice(0, at) + to + body.slice(at + 1);
  }
  throw new Error('the seeded body has neither open ground nor scrub in it — pick another cell to edit');
}

/** The scratch file this run writes to — same name the real tool uses, different directory. */
function scratchFile(): string {
  return join(dir, `${nodeId}.txt`);
}

function seed(opts: { force?: boolean; discardAuthored?: boolean } = {}): SeedReport {
  return doSeed(content, nodeId, {
    force: opts.force ?? false,
    discardAuthored: opts.discardAuthored ?? false,
    layoutDir: dir,
  });
}

/** Everything `doSeed` printed for this case, joined — the operator-facing half of a refusal. */
function printed(): string {
  return (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls
    .map((c) => c.map((a) => String(a)).join(' '))
    .join('\n');
}

let exitCodeBefore: typeof process.exitCode;

beforeAll(() => {
  content = validateContent();
  const first = placements(content)[0];
  if (!first) throw new Error('data/nodes/ yielded no placements — the fixture is gone, not the guard');
  placement = first;
  nodeId = placement.node.id;
  fresh = serialiseLayout(seedLayout(placement, content.balance).doc);
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'trophic-mapgen-seed-guard-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // `reportRefusals` sets process.exitCode for real. Left set, it would fail the whole vitest run
  // no matter how green the suite is, so every case restores what it found.
  exitCodeBefore = process.exitCode;
});

afterEach(() => {
  process.exitCode = exitCodeBefore;
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The three outcomes.
 * ──────────────────────────────────────────────────────────────────────────── */

describe('doSeed — a layout the seeder wrote', () => {
  it('writes one that is not there yet', () => {
    expect(existsSync(scratchFile())).toBe(false);

    const report = seed();

    expect(report).toEqual({ written: [nodeId], skipped: [], refused: [] });
    expect(readFileSync(scratchFile(), 'utf8')).toBe(fresh);
  });

  it('skips one that still matches the seeder, when no flag is given', () => {
    writeFileSync(scratchFile(), fresh, 'utf8');

    const report = seed();

    expect(report).toEqual({ written: [], skipped: [nodeId], refused: [] });
    expect(readFileSync(scratchFile(), 'utf8')).toBe(fresh);
  });

  it('rewrites one that still matches the seeder, under --force', () => {
    seed();
    expect(readFileSync(scratchFile(), 'utf8')).toBe(fresh);

    const report = seed({ force: true });

    // Written, not refused: --force is allowed to overwrite the seeder's own output. That the bytes
    // are identical afterwards is also the determinism the whole derivation depends on — two seeds
    // of the same node in one process produced the same file.
    expect(report).toEqual({ written: [nodeId], skipped: [], refused: [] });
    expect(readFileSync(scratchFile(), 'utf8')).toBe(fresh);
  });
});

describe('doSeed — a layout a human changed', () => {
  it('refuses it even under --force, and leaves every byte alone', () => {
    writeFileSync(scratchFile(), AUTHORED, 'utf8');

    const report = seed({ force: true });

    expect(report).toEqual({ written: [], skipped: [], refused: [nodeId] });
    expect(readFileSync(scratchFile(), 'utf8')).toBe(AUTHORED);
    // The refusal has to be readable as a refusal, and has to name the way out — an operator who
    // cannot find the hatch reaches for `rm` instead.
    expect(printed()).toContain('REFUSE');
    expect(printed()).toContain(nodeId);
    expect(printed()).toContain('--force --discard-authored-layouts');
  });

  it('refuses it with no flags at all', () => {
    writeFileSync(scratchFile(), AUTHORED, 'utf8');

    const report = seed();

    // Refused, NOT skipped: the file existing and the file being authored are different answers,
    // and the second one is the one that has to reach the exit code.
    expect(report).toEqual({ written: [], skipped: [], refused: [nodeId] });
    expect(readFileSync(scratchFile(), 'utf8')).toBe(AUTHORED);
  });

  it('refuses it when only --discard-authored-layouts is passed — the hatch does not imply --force', () => {
    writeFileSync(scratchFile(), AUTHORED, 'utf8');

    const report = seed({ discardAuthored: true });

    expect(report).toEqual({ written: [], skipped: [], refused: [nodeId] });
    expect(readFileSync(scratchFile(), 'utf8')).toBe(AUTHORED);
  });

  it('refuses one whose only difference is a single legal cell', () => {
    const edited = oneCellEdited(fresh);
    expect(edited).not.toBe(fresh);
    expect(edited.length).toBe(fresh.length);
    writeFileSync(scratchFile(), edited, 'utf8');

    const report = seed({ force: true });

    expect(report).toEqual({ written: [], skipped: [], refused: [nodeId] });
    expect(readFileSync(scratchFile(), 'utf8')).toBe(edited);
  });

  it('discards it only when both flags are passed together', () => {
    writeFileSync(scratchFile(), AUTHORED, 'utf8');

    const report = seed({ force: true, discardAuthored: true });

    expect(report).toEqual({ written: [nodeId], skipped: [], refused: [] });
    expect(readFileSync(scratchFile(), 'utf8')).toBe(fresh);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The exit code. A refusal that scrolled off the screen still has to stop a script.
 * ──────────────────────────────────────────────────────────────────────────── */

describe('reportRefusals', () => {
  it('makes the process exit non-zero when anything was refused', () => {
    writeFileSync(scratchFile(), AUTHORED, 'utf8');
    process.exitCode = 0;

    const report = seed({ force: true });
    expect(report.refused).toEqual([nodeId]);
    reportRefusals(report);

    expect(process.exitCode).not.toBe(0);
    expect(process.exitCode).toBe(REFUSED_EXIT_CODE);
  });

  it('leaves the exit code alone when nothing was refused', () => {
    process.exitCode = 0;

    reportRefusals(seed());

    expect(process.exitCode).toBe(0);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Why importing the CLI in a test is safe, asserted rather than assumed.
 * ──────────────────────────────────────────────────────────────────────────── */

describe('the CLI module', () => {
  it('does not run itself when imported — its entry-point guard is false here', () => {
    const cli = resolve(fileURLToPath(new URL('../../tools/mapgen/run.ts', import.meta.url)));
    const argv1 = process.argv[1];
    // `invokedDirectly` in run.ts is exactly this comparison. If it ever became true under vitest,
    // importing this suite would run `main()` against the real layouts — so it is checked, not hoped.
    expect(argv1 === undefined ? null : resolve(argv1)).not.toBe(cli);
  });

  it('never points a case at the real layouts directory', () => {
    expect(resolve(dir)).not.toBe(resolve(LAYOUT_DIR));
    expect(resolve(scratchFile())).not.toBe(resolve(layoutPath(nodeId)));
  });
});
