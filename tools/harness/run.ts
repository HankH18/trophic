/**
 * tools/harness/run.ts — `npm run harness`. build-doc §3 L13 / §10.5.
 *
 *   npm run harness                                   every mode, shipped balance
 *   npm run harness -- --mode gym --seeds 100         one mode, fewer seeds
 *   npm run harness -- --balance /tmp/tuned.json      build-doc §6 INV-3 (`ext_retune`)
 *   npm run harness -- --help
 *
 * Writes the markdown report to `build/BALANCE-REPORT.md` and prints it. The report is generated
 * output, not a document: it is written outside `docs/` and is git-ignored.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadContent } from "./content";
import { measure } from "./measure";
import { parseArgs } from "./params";
import { renderReport } from "./report";

function main(argv: readonly string[]): void {
  const params = parseArgs(argv);
  const loaded = loadContent(params.balancePath);
  const measurements = measure(loaded, params);
  const markdown = renderReport(loaded, measurements);

  const out = resolve(params.reportPath);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, markdown, "utf8");

  if (params.print) process.stdout.write(`${markdown}\n`);
  process.stdout.write(`\n[harness] report written to ${out}\n`);
}

main(process.argv.slice(2));
