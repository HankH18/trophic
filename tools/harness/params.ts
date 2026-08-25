/**
 * tools/harness/params.ts — the harness's OWN parameters, and its CLI.
 *
 * build-doc §3 L13 / §10.5. Locked decision L11 is what makes this possible: `core/` is pure
 * TypeScript with zero engine imports, so the harness imports THE SAME MODULES THE GAME RUNS.
 *
 * WHAT IS AND IS NOT IN HERE (guardrail G11 / build-doc §6 INV-4).
 *   Not one gameplay constant lives in this file, or anywhere else under tools/harness/. Every
 *   number that decides what happens in the game — damage, catch odds, breed rates, gym targets,
 *   seed counts, the reference over-catching player — is read from `data/balance.json` through the
 *   validated `Balance` object, and the harness can be pointed at a DIFFERENT balance file with
 *   `--balance <path>` without a line of code changing (build-doc §6 INV-3, named test
 *   `ext_retune`).
 *
 *   What IS in here is the harness's own sampling budget: how many seeds a mode draws, how many
 *   candidate parties the player model drafts before fielding one, where the report is written.
 *   Those are measurement parameters — they change the precision of an answer, never the answer —
 *   and they deliberately do NOT live in balance.json, because `zBalance` (core/schemas.ts) parses
 *   with `z.object` and every leaf of balance.json is gated against surviving it
 *   (`balance_keys_survive_validation`): a key added to the file without a schema entry is a decoy.
 *   core/schemas.ts is another lane's file. So the harness's own knobs live here, with a CLI.
 *
 *   The one exception, and it is not an exception: `balance.harness` already exists in
 *   data/balance.json and carries the §10.5 CLAIMS (seed count, win-rate target bands, round-robin
 *   flag thresholds, the battle turn cap, the reference over-catching player). Those are read from
 *   balance, never from here.
 */

import { resolve } from "node:path";

/** The three §10.5 modes, plus "all". */
export const HARNESS_MODES = ["gym", "chart", "run", "all"] as const;
export type HarnessMode = (typeof HARNESS_MODES)[number];

export interface HarnessParams {
  /** Which of the §10.5 modes to run. */
  mode: HarnessMode;
  /**
   * Path to the balance file to run against, or null for the shipped `data/balance.json`.
   * build-doc §6 INV-3 — "the harness runs with an overridden file", with no code change.
   */
  balancePath: string | null;
  /** Where the markdown report is written. */
  reportPath: string;
  /** Print the report to stdout as well as writing it. */
  print: boolean;
  /** Seeds per gym in mode (a). Defaults to `balance.harness.seeds` when left null. */
  gymSeeds: number | null;
  /** Seeds per ORDERED species pair in mode (b). 27×26 pairs, so this is the cost driver. */
  chartSeeds: number;
  /** Seeds per six-year play profile in mode (c). */
  runSeeds: number;
  /** Seeds per node in the mode (c) over-catch sweep. */
  overcatchSeeds: number;
  /**
   * How many candidate parties the reasonable-player model drafts before fielding the one with the
   * best type coverage. 1 = a purely random draft; larger = a more deliberate player.
   */
  partyDrafts: number;
  /** Shrink every sampling budget — for the test suite and for a quick look. */
  quick: boolean;
}

/* The default sampling budget. Measurement precision, not game behaviour. */
const DEFAULTS = {
  chartSeeds: 64,
  runSeeds: 32,
  overcatchSeeds: 128,
  partyDrafts: 8,
  reportPath: "docs/BALANCE-REPORT.md",
} as const;

/** Every budget divided by this in `--quick`, to a floor of 1. */
const QUICK_DIVISOR = 8;

export function defaultParams(): HarnessParams {
  return {
    mode: "all",
    balancePath: null,
    reportPath: DEFAULTS.reportPath,
    print: true,
    gymSeeds: null,
    chartSeeds: DEFAULTS.chartSeeds,
    runSeeds: DEFAULTS.runSeeds,
    overcatchSeeds: DEFAULTS.overcatchSeeds,
    partyDrafts: DEFAULTS.partyDrafts,
    quick: false,
  };
}

function requireValue(argv: readonly string[], i: number, flag: string): string {
  const value = argv[i + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`tools/harness: ${flag} needs a value`);
  }
  return value;
}

function positiveInt(raw: string, flag: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    throw new Error(`tools/harness: ${flag} must be a positive integer, got "${raw}"`);
  }
  return n;
}

function isMode(value: string): value is HarnessMode {
  return (HARNESS_MODES as readonly string[]).includes(value);
}

export const USAGE = `
npm run harness -- [options]

  --mode <gym|chart|run|all>   which §10.5 mode to run (default: all)
  --balance <path>             run against an overridden balance file (build-doc §6 INV-3)
  --report <path>              where to write the markdown report (default: ${DEFAULTS.reportPath})
  --no-print                   write the report without echoing it
  --seeds <n>                  seeds per gym in mode (a) (default: balance.harness.seeds)
  --chart-seeds <n>            seeds per ordered species pair in mode (b) (default: ${DEFAULTS.chartSeeds})
  --run-seeds <n>              seeds per play profile in mode (c) (default: ${DEFAULTS.runSeeds})
  --overcatch-seeds <n>        seeds per node in the mode (c) over-catch sweep (default: ${DEFAULTS.overcatchSeeds})
  --party-drafts <n>           candidate parties the player model drafts (default: ${DEFAULTS.partyDrafts})
  --quick                      divide every sampling budget by ${QUICK_DIVISOR}
  --help                       this text
`.trim();

export function parseArgs(argv: readonly string[]): HarnessParams {
  const params = defaultParams();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    switch (arg) {
      case "--help":
      case "-h":
        console.log(USAGE);
        process.exit(0);
        break;
      case "--mode": {
        const value = requireValue(argv, i++, arg);
        if (!isMode(value)) throw new Error(`tools/harness: unknown mode "${value}" (${HARNESS_MODES.join("|")})`);
        params.mode = value;
        break;
      }
      case "--balance":
        params.balancePath = resolve(requireValue(argv, i++, arg));
        break;
      case "--report":
        params.reportPath = requireValue(argv, i++, arg);
        break;
      case "--no-print":
        params.print = false;
        break;
      case "--seeds":
        params.gymSeeds = positiveInt(requireValue(argv, i++, arg), arg);
        break;
      case "--chart-seeds":
        params.chartSeeds = positiveInt(requireValue(argv, i++, arg), arg);
        break;
      case "--run-seeds":
        params.runSeeds = positiveInt(requireValue(argv, i++, arg), arg);
        break;
      case "--overcatch-seeds":
        params.overcatchSeeds = positiveInt(requireValue(argv, i++, arg), arg);
        break;
      case "--party-drafts":
        params.partyDrafts = positiveInt(requireValue(argv, i++, arg), arg);
        break;
      case "--quick":
        params.quick = true;
        break;
      default:
        throw new Error(`tools/harness: unknown option "${arg}"\n\n${USAGE}`);
    }
  }
  if (params.quick) {
    const shrink = (n: number): number => Math.max(1, Math.floor(n / QUICK_DIVISOR));
    params.chartSeeds = shrink(params.chartSeeds);
    params.runSeeds = shrink(params.runSeeds);
    params.overcatchSeeds = shrink(params.overcatchSeeds);
    if (params.gymSeeds !== null) params.gymSeeds = shrink(params.gymSeeds);
  }
  return params;
}

/** `balance.harness.seeds` unless the CLI overrode it (`--seeds`, `--quick`). */
export function gymSeedsFor(params: HarnessParams, balanceSeeds: number): number {
  if (params.gymSeeds !== null) return params.gymSeeds;
  return params.quick ? Math.max(1, Math.floor(balanceSeeds / QUICK_DIVISOR)) : balanceSeeds;
}
