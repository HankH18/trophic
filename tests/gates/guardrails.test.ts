/**
 * tests/gates/guardrails.test.ts — the repo-wide invariant gates build-doc §10.3 names by name.
 *
 *   no_magic_numbers   §6 INV-4 / G11 — no gameplay constant is a literal in core/.
 *   no_math_random     §8.1 / G11     — zero Math.random in the repo.
 *   no_phaser_in_core  §3 L11         — zero Phaser anywhere under core/, transitively.
 *   no_shadow_tables   §8.3 / G3      — only core/foodweb.ts computes diet edges; no encounter
 *                                       weight is tabled anywhere.
 *   no_moralizing_copy §16 / G7       — no player-facing string moralises about catching: every
 *                                       string literal under game/ and core/, AND every
 *                                       player-facing string in data/ — which is where the copy
 *                                       actually lives. See the section's own header for how the
 *                                       JSON side decides what "player-facing" means.
 *
 * Plus one the integration merge made necessary:
 *
 *   balance_keys_survive_validation   §6 INV-3 — every leaf of data/balance.json survives `zBalance`.
 *                                     `zBalance` parses with z.object, which STRIPS keys it does not
 *                                     declare, so a tunable added to the file without a schema entry
 *                                     is a DECOY: retuning it looks applied and changes nothing.
 *
 * EVERY GATE PROVES ITSELF. A gate that cannot go red is decoration, so each check is written as a
 * pure function over source text and then run a second time against a deliberately corrupted copy
 * of that same text, asserting it reports the violation. Deleting a fix can therefore never leave a
 * green gate behind. (The one gate that cannot be self-proven this way — running the core suite
 * with no Phaser installed at all — is covered by the transitive import walk below and was also
 * verified physically at integration by removing node_modules/phaser and re-running the suite.)
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ROLES } from "../../core/types";
import type { Balance } from "../../core/types";
import { validateContent } from "../../core/schemas";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const content = validateContent();

/* ────────────────────────────────────────────────────────────────────────────
 * Shared source-reading helpers. Comments are stripped first (spec citations are
 * full of section numbers), and for most checks string literals are blanked too.
 * ──────────────────────────────────────────────────────────────────────────── */

function readSource(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf8");
}

interface Lexed {
  /** Source with comments, string/template bodies and regex literals blanked out. */
  code: string;
  /** Source with comments and regex literals blanked but string literals INTACT. */
  codeWithStrings: string;
  /** The contents of every string and template literal, in order. */
  strings: string[];
  /** Comment text, kept so a gate can look at prose separately if it wants to. */
  comments: string[];
}

/**
 * A single-pass lexer, deliberately NOT a pile of regexes.
 *
 * This started as `src.replace(/\/\/.*$/…)` followed by a string-blanking regex, and that version
 * had a real hole: a `//` INSIDE a string literal (`"// never do this"`) was treated as a comment,
 * which truncated the line mid-string, left an unbalanced quote, and desynchronised every string
 * boundary after it — so genuine code downstream was mistaken for string contents and vice versa.
 * These gates are the last line of defence for G11/G3/L11, so their lexer has to be right rather
 * than nearly right. It tracks: line comments, block comments, '…' "…" and `…` literals (with
 * escapes and `${}` interpolation), and regex literals (via the standard preceding-token
 * heuristic), and it blanks each while preserving newlines so line numbers still line up.
 */
const REGEX_PRECEDERS = "(,=:[!&|?{};+-*%~^<>";

function lex(src: string): Lexed {
  let code = "";
  let codeWithStrings = "";
  const strings: string[] = [];
  const comments: string[] = [];
  let i = 0;
  // The last significant character of emitted code, used to tell `/` (divide) from `/` (regex).
  let prev = "";

  /** Emit a span verbatim to both outputs. */
  const keep = (text: string) => {
    code += text;
    codeWithStrings += text;
    for (const ch of text) if (!/\s/.test(ch)) prev = ch;
  };
  /** Emit a span as whitespace to both outputs, preserving newlines so line numbers survive. */
  const blank = (text: string) => {
    let out = "";
    for (const ch of text) out += ch === "\n" ? "\n" : " ";
    code += out;
    codeWithStrings += out;
  };

  while (i < src.length) {
    const ch = src[i] as string;
    const next = src[i + 1];

    if (ch === "/" && next === "/") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      comments.push(src.slice(i + 2, stop));
      blank(src.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      comments.push(src.slice(i + 2, stop - 2));
      blank(src.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      let body = "";
      let depth = 0;
      while (j < src.length) {
        const c = src[j] as string;
        if (c === "\\") {
          body += src.slice(j, j + 2);
          j += 2;
          continue;
        }
        if (quote === "`" && c === "$" && src[j + 1] === "{") {
          depth += 1;
          body += "${";
          j += 2;
          continue;
        }
        if (quote === "`" && depth > 0 && c === "}") {
          depth -= 1;
          body += c;
          j += 1;
          continue;
        }
        if (c === quote && depth === 0) break;
        if (quote !== "`" && c === "\n") break; // unterminated single-line string: stop here
        body += c;
        j += 1;
      }
      const stop = src[j] === quote ? j + 1 : j;
      const span = src.slice(i, stop);
      strings.push(body);
      // `code` loses the body; `codeWithStrings` keeps the literal exactly as written.
      code += quote + quote;
      for (const c of span) if (c === "\n") code += "\n";
      codeWithStrings += span;
      prev = quote;
      i = stop;
      continue;
    }
    if (ch === "/" && (prev === "" || REGEX_PRECEDERS.includes(prev))) {
      // A regex literal. Its body is not executable source and must not be scanned for numbers,
      // species names or the banned ambient RNG; blank it the way a string is blanked.
      let j = i + 1;
      let inClass = false;
      let ok = false;
      while (j < src.length) {
        const c = src[j] as string;
        if (c === "\\") {
          j += 2;
          continue;
        }
        if (c === "[") inClass = true;
        else if (c === "]") inClass = false;
        else if (c === "/" && !inClass) {
          ok = true;
          break;
        } else if (c === "\n") break; // not a regex after all
        j += 1;
      }
      if (ok) {
        let stop = j + 1;
        while (stop < src.length && /[a-z]/.test(src[stop] as string)) stop += 1;
        blank(src.slice(i, stop));
        prev = "/";
        i = stop;
        continue;
      }
    }
    keep(ch);
    i += 1;
  }
  return { code, codeWithStrings, strings, comments };
}

/** Source with comments removed AND every string/template/regex literal blanked. */
function executable(src: string): string {
  return lex(src).code;
}

function stringLiterals(src: string): string[] {
  return lex(src).strings;
}

/** Source with comments removed but string literals left intact (import-specifier scanning). */
function withoutComments(src: string): string {
  return lex(src).codeWithStrings;
}

function walk(dir: string, exts: readonly string[]): string[] {
  const out: string[] = [];
  const rec = (d: string) => {
    if (!existsSync(d)) return;
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        rec(full);
      } else if (exts.some((e) => entry.name.endsWith(e))) {
        out.push(full);
      }
    }
  };
  rec(dir);
  return out;
}

const rel = (abs: string): string => abs.slice(ROOT.length + 1);

const CORE_FILES = walk(join(ROOT, "core"), [".ts"]).sort();

/* ════════════════════════════════════════════════════════════════════════════
 * The lexer every gate below depends on. If it is wrong, all four gates are
 * quietly wrong, so it is tested first and against the cases that broke the
 * regex version it replaced.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("gate lexer — the four gates are only as good as this", () => {
  it("does not treat a // inside a string literal as a comment", () => {
    // This exact case desynchronised the previous regex-based stripper: it truncated the line
    // mid-string, leaving an unbalanced quote that made real code downstream read as string body.
    const src = 'const a = "// not a comment";\nconst leak = 4242;\n';
    expect(executable(src)).not.toMatch(/not a comment/);
    expect(executable(src)).toMatch(/4242/); // the code AFTER it is still code
    expect(stringLiterals(src)).toEqual(["// not a comment"]);
  });

  it("does not treat a quote inside a comment as opening a string", () => {
    const src = '// it\'s fine\nconst leak = 4242;\n';
    expect(executable(src)).toMatch(/4242/);
    expect(stringLiterals(src)).toEqual([]);
  });

  it("blanks regex literals but not division", () => {
    expect(executable("const r = /4242/g;")).not.toMatch(/4242/);
    expect(executable("const q = total / 4242;")).toMatch(/4242/);
  });

  it("handles template literals with interpolation, and keeps line numbers", () => {
    const src = "const t = `a ${x + 1} b`;\nconst leak = 4242;\n";
    expect(executable(src)).toMatch(/4242/);
    expect(executable(src).split("\n")).toHaveLength(src.split("\n").length);
    const multi = "const t = `line1\nline2`;\nconst leak = 4242;\n";
    expect(executable(multi).split("\n")).toHaveLength(multi.split("\n").length);
  });

  it("keeps string literals intact in codeWithStrings, which import scanning needs", () => {
    const src = 'import x from "./y"; // a comment with "quotes"\n';
    expect(withoutComments(src)).toMatch(/"\.\/y"/);
    expect(withoutComments(src)).not.toMatch(/a comment/);
  });

  it("survives every real file in the repo without desynchronising", () => {
    // A desync shows up as a wildly different length or a lost newline count.
    for (const abs of CORE_FILES) {
      const src = readFileSync(abs, "utf8");
      const out = executable(src);
      expect(out.split("\n").length, `${rel(abs)}: lexer lost lines`).toBe(src.split("\n").length);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * no_magic_numbers — build-doc §6 INV-4 / guardrail G11
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The rule: after comments and strings are removed, every numeric literal in `core/` must be a
 * structural identity (0 or 1 — an empty guard, an index base, a `1 +` that the build-doc formula
 * itself writes, a probability floor) or appear in that file's declared allowance below.
 *
 * The allowances are deliberately tiny, exhaustive and each carries its reason. A number that is
 * NOT here and NOT ≤ 1 is a gameplay constant that belongs in data/balance.json — that is the whole
 * of INV-4. Adding to this list is a review decision, not a way past the gate.
 */
const MAGIC_NUMBER_ALLOWANCE: Record<string, { values: readonly number[]; why: string }> = {
  "core/rng.ts": {
    // Retuning balance.json must never change the PRNG. These are the algorithm.
    values: [0x9e3779b9, 0x811c9dc5, 0x01000193, 15, 7, 61, 14, 11, 19, 8],
    why: "xorshift128 shift amounts and FNV-1a mixing constants — the algorithm build-doc §8.1 names, not a tunable",
  },
  "core/schemas.ts": {
    values: [2, 3, 4, 5, 6, 28, 32],
    why:
      "zod SHAPE bounds and CONTENT CARDINALITIES, never read by a formula: at most 2 types per age " +
      "form, seasonOrder length 4, a 2-digit zero-padded palette swatch id, MOVE_POOL_SIZE 28 " +
      "(Hard Req 8), SEASONAL_MIGRANT_COUNT 4 (Hard Req 10), GYM_ROSTER_SIZES 3/4/5/6/6/6 (Hard Req 9 " +
      "as amended, signature included) and PALETTE_SWATCH_COUNT 32 " +
      "(build-doc §8.4) — these assert what the " +
      "CONTENT must contain, which is the opposite of hiding a tunable in code. Retuning balance.json " +
      "cannot change any of them, which is the INV-4 test: a gameplay constant is one a retune moves",
  },
  "core/types.ts": {
    values: [2, 3, 4, 5, 6],
    why: "the type-level year-variant key union `Record<2|3|4|5|6, string>`, verbatim from build-doc §7.2's inlined schema",
  },
  "core/dialogue-schema.ts": {
    values: [4, 8, 120, 400],
    why:
      "zod SHAPE bounds on the dialogue TEXT surface, never read by a formula: a line body is at " +
      "most 400 characters and a choice prompt 120 (both must fit the 480x320 dialogue box), an " +
      "entry is at most 8 lines and a choice list at most 4 options. Every value here that IS a " +
      "gameplay constant is read from data/balance.json instead: the flora ceiling from " +
      "ecosim.floraMax, the year FLOOR from clock.startYear (Q3 removed the ceiling — the calendar " +
      "is unbounded, and clock.yearsTotal survives only as NOMINAL_YEARS, a pacing readout that " +
      "bounds nothing), and the act range from acts.first/acts.last via core/acts.ts — NOT from the " +
      "gym count, which is six while the ladder is seven rows because act 0 is the prologue. " +
      "That distinction is the INV-4 test: a gameplay constant is one a retune moves",
  },
};

/** Returns one message per offending literal; empty means the file is clean. */
function magicNumberViolations(relPath: string, src: string): string[] {
  const allowed = new Set(MAGIC_NUMBER_ALLOWANCE[relPath]?.values ?? []);
  const code = executable(src);
  const found = [...code.matchAll(/(?<![\w.$])(0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/g)];
  const out: string[] = [];
  for (const m of found) {
    const value = Number(m[1]);
    if (Number.isNaN(value)) continue;
    if (value >= 0 && value <= 1) continue; // structural identity
    if (allowed.has(value)) continue;
    out.push(`${relPath}: literal ${m[1]} — gameplay constants live in data/balance.json (INV-4/G11)`);
  }
  return out;
}

describe("no_magic_numbers — build-doc §6 INV-4 / §10.3 / G11", () => {
  it("finds the source tree it is guarding", () => {
    expect(CORE_FILES.length).toBeGreaterThanOrEqual(8);
    for (const expected of ["battle.ts", "ecosim.ts", "lifecycle.ts", "save.ts", "clock.ts", "rng.ts"]) {
      expect(CORE_FILES.some((f) => f.endsWith(`core/${expected}`))).toBe(true);
    }
  });

  it.each(CORE_FILES.map((f) => [rel(f), f] as const))("%s carries no gameplay constant", (relPath, abs) => {
    const violations = magicNumberViolations(relPath, readFileSync(abs, "utf8"));
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("every allowance names a file that exists and values that are actually used", () => {
    // An allowance for a number that is no longer there is a hole waiting for the next literal.
    for (const [relPath, entry] of Object.entries(MAGIC_NUMBER_ALLOWANCE)) {
      expect(existsSync(join(ROOT, relPath)), `${relPath} is allowed but does not exist`).toBe(true);
      expect(entry.why.length, `${relPath}'s allowance has no reason`).toBeGreaterThan(20);
      const code = executable(readSource(relPath));
      const present = new Set(
        [...code.matchAll(/(?<![\w.$])(0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/g)].map((m) => Number(m[1])),
      );
      for (const v of entry.values) {
        expect(present.has(v), `${relPath} no longer uses the allowed literal ${v} — drop it from the allowance`).toBe(true);
      }
    }
  });

  it("BINDS — a gameplay constant smuggled into a copy of the source is caught", () => {
    for (const abs of CORE_FILES) {
      const relPath = rel(abs);
      const sabotaged = `${readFileSync(abs, "utf8")}\nconst starveThreshold = 0.42;\nconst breedCap = 37;\n`;
      const violations = magicNumberViolations(relPath, sabotaged);
      expect(violations.join(" "), `${relPath}: the gate did not catch a smuggled constant`).toMatch(/37/);
    }
    // …and a number inside a COMMENT or a spec citation is not a false positive.
    expect(magicNumberViolations("core/x.ts", "// build-doc §7.3 step 4, threshold 0.4\nconst a = 1;")).toEqual([]);
    expect(magicNumberViolations("core/x.ts", 'const msg = "expected 28 moves";')).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * no_math_random — build-doc §8.1 / guardrail G11
 * ════════════════════════════════════════════════════════════════════════════ */

const RANDOM_SCAN_DIRS = ["core", "game", "tools", "tests", "fixtures", "data"] as const;

/*
 * The pattern is ASSEMBLED FROM STRING FRAGMENTS on purpose. Written as a regex literal it would be
 * executable source, and this gate scans tests/ too — so the gate would flag itself, which is both
 * a false positive and (worse) the kind of thing that gets "fixed" by exempting this file, leaving
 * a real hole. Built from strings, the fragments are blanked by `executable()` like any other.
 */
const MATH_RANDOM = new RegExp(["Math", "\\s*\\.\\s*", "random"].join(""));

/** A real CALL, not a mention: comments and string literals are blanked first. */
function mathRandomViolations(relPath: string, src: string): string[] {
  return MATH_RANDOM.test(executable(src))
    ? [`${relPath}: the banned ambient RNG — the seeded stream in core/rng.ts is the only randomness (G11/§8.1)`]
    : [];
}

describe("no_math_random — build-doc §8.1 / §10.3 / G11", () => {
  const files = RANDOM_SCAN_DIRS.flatMap((d) => walk(join(ROOT, d), [".ts", ".mts", ".mjs", ".js", ".json"]));

  it("scans every shipping and test file, not just core/", () => {
    expect(files.length).toBeGreaterThan(25);
    expect(files.some((f) => f.endsWith("core/rng.ts"))).toBe(true);
    expect(files.some((f) => f.includes("/tests/"))).toBe(true);
    expect(files.some((f) => f.includes("/data/"))).toBe(true);
  });

  it("the repo contains zero Math.random", () => {
    const violations = files.flatMap((abs) => mathRandomViolations(rel(abs), readFileSync(abs, "utf8")));
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("BINDS — it catches a Math.random and ignores one that is only talked about", () => {
    expect(mathRandomViolations("core/x.ts", "const r = Math.random();")).toHaveLength(1);
    expect(mathRandomViolations("core/x.ts", "const r = Math . random ();")).toHaveLength(1);
    // A mention in prose or in a sabotage fixture string is not a call.
    expect(mathRandomViolations("core/x.ts", "// never use Math.random here")).toEqual([]);
    expect(mathRandomViolations("core/x.ts", 'const s = "Math.random()";')).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * no_phaser_in_core — locked decision L11
 * ════════════════════════════════════════════════════════════════════════════ */

/** Every module specifier this source imports or re-exports. */
function importSpecifiers(src: string): string[] {
  const code = withoutComments(src);
  const out: string[] = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?[^;'"]*?from\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?[^;'"]*?from\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) for (const m of code.matchAll(re)) if (m[1]) out.push(m[1]);
  return out;
}

/**
 * Resolve a relative specifier to a repo file. Only relative specifiers can pull core/ toward the
 * engine; a bare specifier is a package and is checked by name.
 */
function resolveRelative(fromAbs: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(fromAbs), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.json`, join(base, "index.ts")]) {
    if (existsSync(candidate) && !candidate.endsWith("/")) return candidate;
  }
  return null;
}

/** The transitive closure of what `entries` import, following relative specifiers only. */
function importClosure(entries: readonly string[]): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const abs = queue.pop() as string;
    if (files.has(abs)) continue;
    files.add(abs);
    if (!abs.endsWith(".ts")) continue;
    for (const spec of importSpecifiers(readFileSync(abs, "utf8"))) {
      const resolved = resolveRelative(abs, spec);
      if (resolved) queue.push(resolved);
      else if (!spec.startsWith(".")) packages.add(spec.split("/")[0] as string);
    }
  }
  return { files, packages };
}

describe("no_phaser_in_core — build-doc §3 L11 / §10 ('core suite must pass with no Phaser installed')", () => {
  it("no file under core/ mentions Phaser in executable code", () => {
    for (const abs of CORE_FILES) {
      const code = executable(readFileSync(abs, "utf8"));
      expect(/\bPhaser\b/.test(code), `${rel(abs)} references the Phaser global`).toBe(false);
      expect(
        importSpecifiers(readFileSync(abs, "utf8")).some((s) => s === "phaser" || s.startsWith("phaser/")),
        `${rel(abs)} imports phaser — L11 says core/ is engine-agnostic`,
      ).toBe(false);
    }
  });

  it("TRANSITIVELY: nothing core/ reaches, at any depth, is the engine or a game/ scene", () => {
    // The strong form. A direct-import grep passes even when core/x.ts imports core/y.ts which
    // imports a Phaser scene; this walks the whole graph and names every package core/ can reach.
    const { files, packages } = importClosure(CORE_FILES);
    expect(files.size).toBeGreaterThanOrEqual(CORE_FILES.length);
    expect([...packages].sort()).not.toContain("phaser");
    for (const f of files) {
      expect(rel(f).startsWith("game/"), `core/ transitively reaches ${rel(f)} — L11 forbids it`).toBe(false);
    }
    // Whatever core/ does reach outside itself must be data/ (content JSON) or a runtime package
    // that exists without a browser. Recorded here so a new dependency is a visible review event.
    const outside = [...files].map(rel).filter((f) => !f.startsWith("core/"));
    for (const f of outside) expect(f.startsWith("data/"), `core/ reaches ${f}`).toBe(true);
    expect([...packages].sort()).toEqual(["zod"]);
  });

  it("BINDS — it catches an engine import at depth, not just at the surface", () => {
    expect(importSpecifiers('import Phaser from "phaser";').includes("phaser")).toBe(true);
    expect(importSpecifiers('import { Scene } from "phaser/src/scene";')[0]).toBe("phaser/src/scene");
    expect(importSpecifiers('export * from "./battle";')).toContain("./battle");
    expect(/\bPhaser\b/.test(executable("const s = new Phaser.Scene();"))).toBe(true);
    // A Phaser mention in a comment is not an import — core/ is full of them.
    expect(/\bPhaser\b/.test(executable("// the Phaser scene replays events[]"))).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * no_shadow_tables — build-doc §8.3 / G3
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * "no file other than core/foodweb.ts may compute diet edges; no encounter-weight literal tables
 * anywhere" (§8.3). Three things a shadow table would have to do, each checked:
 *   1. name a species (its rows),
 *   2. restate the role → role diet (its rule),
 *   3. ship a per-species weight/spawn/bait table in data/ (its home).
 *
 * A fuller species-name/role sweep also lives in tests/property/foodweb.test.ts, written by the
 * lane that owns the derivation; this is the §10.3-named gate and adds the data-side half plus the
 * cross-lane check that core/battle.ts's predation really is a read of foodweb.ts's output.
 */
const ROLE_LITERAL_ALLOWED = ["core/foodweb.ts", "core/types.ts", "core/schemas.ts"];

function roleLiteralViolations(relPath: string, src: string): string[] {
  if (ROLE_LITERAL_ALLOWED.some((s) => relPath.endsWith(s))) return [];
  return stringLiterals(src)
    .filter((lit) => (ROLES as readonly string[]).includes(lit))
    .map((lit) => `${relPath}: role name "${lit}" as data — §8.3 gives the diet rule one home`);
}

const SECOND_TABLE_KEY = /spawn|encounter|bait|weight|loot|drop|roll/i;

describe("no_shadow_tables — build-doc §8.3 / §10.3 / G3", () => {
  const shipping = [...walk(join(ROOT, "core"), [".ts"]), ...walk(join(ROOT, "game"), [".ts"]), ...walk(join(ROOT, "tools"), [".ts"])];

  it("the role → role diet rule lives in core/foodweb.ts and nowhere else", () => {
    const violations = shipping.flatMap((abs) => roleLiteralViolations(rel(abs), readFileSync(abs, "utf8")));
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("no node JSON carries a second table, under any name", () => {
    // The schema's own raw-key sweep is the primary gate; this is the file-level restatement, so a
    // node file added outside core/schemas.ts's static import list still cannot smuggle one in.
    const nodeFiles = walk(join(ROOT, "data", "nodes"), [".json"]);
    expect(nodeFiles.length).toBe(12);
    const allowed = new Set([
      "id", "name", "biome", "adjacency", "walkable", "mapAsset", "yearVariants",
      "collisionMask", "floraStock", "populations", "props",
    ]);
    for (const abs of nodeFiles) {
      const raw = JSON.parse(readFileSync(abs, "utf8")) as Record<string, unknown>;
      for (const key of Object.keys(raw)) {
        if (key.startsWith("_")) continue;
        expect(SECOND_TABLE_KEY.test(key), `${rel(abs)}: key "${key}" is a second table by name (G3)`).toBe(false);
        expect(allowed.has(key), `${rel(abs)}: unknown key "${key}" — a node file is exactly the §7.2 schema`).toBe(true);
      }
    }
  });

  it("no content JSON outside data/nodes/ carries per-species encounter weights", () => {
    for (const abs of walk(join(ROOT, "data"), [".json"])) {
      if (rel(abs).startsWith("data/nodes/")) continue;
      const text = readFileSync(abs, "utf8");
      const parsed = JSON.parse(text) as unknown;
      const keys: string[] = [];
      const rec = (v: unknown) => {
        if (v === null || typeof v !== "object") return;
        if (Array.isArray(v)) return v.forEach(rec);
        for (const [k, inner] of Object.entries(v)) {
          if (!k.startsWith("_")) keys.push(k);
          rec(inner);
        }
      };
      rec(parsed);
      // `encounter` is balance.json's group of RATES (build-doc §7.2 derivations are tunable);
      // what G3 forbids is a per-species table, i.e. a species id used as a key next to a weight.
      const speciesIds = new Set(content.species.map((s) => s.id));
      const tabled = keys.filter((k) => speciesIds.has(k));
      expect(tabled, `${rel(abs)} keys a table by species id: ${tabled.join(", ")} (G3)`).toEqual([]);
    }
  });

  it("core/battle.ts's predation is a READ of core/foodweb.ts's derivation, not a table", () => {
    const src = readSource("core/battle.ts");
    // It must consume FoodWeb.edges and delegate the §7.2 bait rule; it must not restate either.
    expect(executable(src)).toMatch(/predationOracleFromWebs/);
    expect(importSpecifiers(src).some((s) => s.endsWith("/foodweb") || s === "./foodweb")).toBe(true);
    expect(executable(src)).toMatch(/baitMatchFor/);
    expect(roleLiteralViolations("core/battle.ts", src)).toEqual([]);
  });

  it("BINDS — a role table or a renamed spawn table in a copy is caught", () => {
    expect(roleLiteralViolations("core/somewhere.ts", 'const diet = { "Apex": ["Mesopredator"] };')).toHaveLength(2);
    expect(SECOND_TABLE_KEY.test("spawnTables")).toBe(true);
    expect(SECOND_TABLE_KEY.test("rollTable")).toBe(true);
    expect(SECOND_TABLE_KEY.test("lootTable")).toBe(true);
    expect(SECOND_TABLE_KEY.test("encounterWeights")).toBe(true);
    // …and the allowed home is genuinely exempt, or the gate would be unsatisfiable.
    expect(roleLiteralViolations("core/foodweb.ts", 'const r = "Apex";')).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * balance_keys_survive_validation — build-doc §6 INV-3
 * ════════════════════════════════════════════════════════════════════════════ */

describe("balance_keys_survive_validation — build-doc §6 INV-3", () => {
  const raw = JSON.parse(readFileSync(join(ROOT, "data", "balance.json"), "utf8")) as Record<string, unknown>;
  const validated = content.balance as unknown as Record<string, unknown>;

  function leafPaths(obj: Record<string, unknown>, prefix: string[] = []): string[][] {
    const out: string[][] = [];
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith("_")) continue; // documentation keys
      const path = [...prefix, key];
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        out.push(...leafPaths(value as Record<string, unknown>, path));
      } else {
        out.push(path);
      }
    }
    return out;
  }

  function at(obj: unknown, path: readonly string[]): unknown {
    let cur: unknown = obj;
    for (const key of path) {
      if (cur === null || typeof cur !== "object") return undefined;
      cur = (cur as Record<string, unknown>)[key];
    }
    return cur;
  }

  const paths = leafPaths(raw);

  it("finds a balance file with real content", () => {
    expect(paths.length).toBeGreaterThan(100);
  });

  it.each(paths.map((p) => [p.join("."), p] as const))(
    "%s survives zBalance — a stripped key is a decoy knob",
    (label, path) => {
      expect(
        at(validated, path),
        `data/balance.json carries ${label} but core/schemas.ts zBalance strips it (z.object drops ` +
          `undeclared keys), so no reader ever sees it and retuning it is a silent no-op. Declare it ` +
          `in BOTH core/types.ts \`Balance\` and core/schemas.ts \`zBalance\`.`,
      ).not.toBeUndefined();
    },
  );

  it("the three lanes' merged additions files are gone, not merely copied", () => {
    // Lanes A2/A3/A4 wrote tunables into data/balance.additions.*.json because balance.json belonged
    // to another lane. Leaving one behind after the merge gives every one of its keys two homes.
    for (const lane of ["A2", "A3", "A4"]) {
      expect(
        existsSync(join(ROOT, "data", `balance.additions.${lane}.json`)),
        `data/balance.additions.${lane}.json still exists — merged tunables must have ONE home`,
      ).toBe(false);
    }
    for (const abs of CORE_FILES) {
      expect(
        executable(readFileSync(abs, "utf8")),
        `${rel(abs)} still imports an additions file`,
      ).not.toMatch(/balance\.additions/);
    }
  });

  it("the merged groups are actually present and typed", () => {
    const b = content.balance as Balance;
    expect(b.battle.evadeTurns).toBeTypeOf("number");
    expect(b.battle.statusWearOffTurns).toBeTypeOf("number");
    expect(b.cascade.preyForcedFraction).toBeTypeOf("number");
    expect(b.ecosim.starveMinDeathsPerSeason).toBeTypeOf("number");
    expect(b.ecosim.starveSuppressesBirths).toBeTypeOf("boolean");
    expect(Object.keys(b.ecosim.presenceEffects)).toHaveLength(3);
    expect(b.retirement.heirLevelMin).toBeTypeOf("number");
    expect(b.retirement.boonMaxStacksPerStat).toBeTypeOf("number");
    expect(Array.isArray(b.yearEvents.raids)).toBe(true);
  });

  it("BINDS — a key the schema does not declare is reported, not passed over", () => {
    const withDecoy = { ...raw, ecosim: { ...(raw["ecosim"] as object), notInSchema: 7 } };
    const decoyPaths = leafPaths(withDecoy).filter((p) => p.at(-1) === "notInSchema");
    expect(decoyPaths).toHaveLength(1);
    expect(at(validated, decoyPaths[0] as string[])).toBeUndefined(); // …which is what the gate flags
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * no_moralizing_copy — build-doc §16 / guardrail G7
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ READ THE SCOPE BEFORE TRUSTING THIS GREEN.
 *
 * WHAT IT COVERS, in two lanes:
 *   1. `.ts` — every string and template literal in every file under `game/` and `core/`.
 *   2. `data/` — every PLAYER-FACING string in the shipped JSON. `data/dialogue.json` gets a full
 *      field-by-field classification derived from `core/dialogue-schema.ts`; every other data file
 *      gets a prose census that cannot be added to without classifying the new prose.
 *
 * WHAT IT DOES NOT COVER: tone. See the last paragraph — that limit is real and unfixable by a regex.
 *
 * HISTORY OF LANE 2, because the shape of the miss is the point. This gate originally scanned `.ts`
 * only, on the reasoning that the prose lane was mid-rewrite of `data/dialogue.json` and a gate over
 * a file being rewritten elsewhere goes red for reasons its owner cannot act on. The header carried
 * an instruction to "widen `COPY_SCAN_DIRS` to `data/` once that rewrite has landed". **Widening that
 * constant would have been a no-op**: the walk it feeds collects `.ts` files and `data/` contains
 * none, so the gate would have reported green over `data/` while reading nothing in it. The scan had
 * to learn to read JSON, which is lane 2. `COPY_SCAN_DIRS` is therefore still `game`/`core` on
 * purpose — it is the source-code lane's constant, not a scope switch.
 *
 * HOW LANE 2 DECIDES WHAT IS PLAYER-FACING, and why it is not a guess. Every string in the file is
 * reduced to a PATH SHAPE (`entries[].lines[].text`), and every shape must be declared in exactly one
 * of two lists below: the ones that reach the screen, and the ones that do not. A shape in neither is
 * a failure, not a pass — so a field added to the dialogue schema tomorrow cannot slip through
 * unscanned, which is the only property that keeps this gate honest as the corpus grows. The
 * player-facing list is short because the schema is: `DialogueSpeaker.name` is "the display name
 * shown in the name plate" (drawn at `game/scenes/DialogueScene.ts:401`), `DialogueLine.text` is the
 * line, `DialogueChoice.text` is the option (`game/dialogue-runner.ts:298`). Everything else in that
 * schema is an id, an enum, a flag key, a flag value, a number, or `speakers[].role`, which the
 * schema itself calls "flavour for tooling, not logic" and which nothing under `game/` reads.
 *
 * The `_`-prefixed keys are the repo-wide documentation convention (`core/dialogue-schema.ts` strips
 * them before parsing) and are provenance prose, not copy — scanning them would fire on the very
 * notes that explain the guardrail, which is the shape of a gate that gets exempted into uselessness.
 *
 * `tests/unit/dialogue.test.ts` §8 also scans the dialogue corpus, and is now the redundant copy
 * rather than the only one; it is left in place because it is that lane's own tripwire and because
 * this gate additionally carries the `sermon-register` row that its list does not.
 *
 * WHY THIS FILE. G7 is a fail-the-task guardrail whose whole value is that it holds for code nobody
 * has written yet, and until now `grep -rn "G7" tests/gates/` returned nothing. The only enforcement
 * anywhere was inside three lane-scoped unit tests (`battle-view`, `survey-view`, `year-turn-ux`),
 * two of which scan hand-written file lists. A guardrail enforced only inside the unit tests of the
 * lanes that happened to think about it is enforced for those lanes and for nobody else.
 *
 * WHY STRING LITERALS ONLY, NOT COMMENTS. The prose that reaches a player is a literal; the prose in
 * a comment is engineering notes, and those legitimately discuss guilt, blame and moralising —
 * `core/schemas.ts:753` says "smuggled in under an innocent name", and this very header uses half
 * the banned vocabulary. Scanning comments would make the gate unsatisfiable by honest means, which
 * is the shape of a gate that gets exempted into uselessness.
 *
 * WHY THE PATTERN LIST IS DUPLICATED. It is copied from `tests/unit/dialogue.test.ts` rather than
 * imported, because importing a test module executes its whole suite. The two lists can therefore
 * drift — this one is the superset (it carries `sermon-register`), and it is the one a gate run
 * enforces over the shipped corpus.
 *
 * WHAT THIS CANNOT DO — the caveat is inherited verbatim from the dialogue scan and matters just as
 * much here: a regex cannot detect tone. "I do not need the ledger to know which way you walked" is
 * a reprimand and trips nothing. Treat a green as "no banned vocabulary", NEVER as "G7 satisfied".
 */
/** Lane 1: the SOURCE-CODE dirs. `data/` is lane 2 and is not a directory walk — see the header. */
const COPY_SCAN_DIRS = ["game", "core"] as const;

const COPY_FILES = COPY_SCAN_DIRS.flatMap((d) => walk(join(ROOT, d), [".ts"])).sort();

/**
 * The vocabulary. Rows 1-40 are `tests/unit/dialogue.test.ts` §8's `MORALIZING_PATTERNS` verbatim.
 * The `sermon-register` row is the residue of the older, weaker inline list in
 * `tests/unit/battle-view.test.ts:1352` that the dialogue list does not carry, so consolidating here
 * loses nothing that list caught.
 *
 * Four of that older list's words are DELIBERATELY NOT ADOPTED — `sorry`, `innocent`, `suffer` and
 * a bare `too many` — because each has an ordinary non-moralising use in UI copy ("Sorry, that slot
 * could not be opened", "too many entries"). A gate that fires on honest copy gets exemptions bolted
 * to it, and an exemption list is how a scanner stops being a scanner. The accusatory forms of those
 * are covered by pattern rows that require the second person (`took-too-many`, `you-are-destroying`).
 * `tests/unit/battle-view.test.ts` still bans all four in its own corpus; nothing is weakened here.
 *
 * Words that only ever appear in a reprimand are banned outright even inside a negating sentence
 * ("that isn't cruelty") — a scanner with exemptions is not a scanner, so the copy is written around
 * them instead.
 */
const MORALIZING_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "fault", re: /\byour fault\b|\bat fault\b/i },
  { name: "blame", re: /\bblames?\b|\bblamed\b|\bblaming\b|\bto blame\b|\bhold \w+ against\b/i },
  { name: "guilt", re: /\bguilt\b|\bguilty\b/i },
  { name: "shame", re: /\bshame\b|\bshameful\b|\bashamed\b/i },
  { name: "you-did-this", re: /\byou (did|have done|'ve done) this\b/i },
  { name: "what-have-you-done", re: /\bwhat have you done\b/i },
  { name: "how-could-you", re: /\bhow could you\b/i },
  { name: "greed", re: /\bgreed\b|\bgreedy\b|\bselfish\b/i },
  { name: "cruelty", re: /\bcruel\b|\bcruelty\b|\bheartless\b|\bmerciless\b/i },
  { name: "shouldnt-have", re: /\bshould(n'?t| not) have (caught|taken|snared|hunted|killed|left)\b/i },
  { name: "could-have", re: /\bcould have (left|spared|stopped|walked away)\b/i },
  { name: "when-to-stop", re: /\bwhen to stop\b|\bknow when to\b/i },
  { name: "you-shouldnt", re: /\byou (should ?n'?t|should not|must ?n'?t|must not) (catch|take|snare|hunt|kill)\b/i },
  { name: "no-right", re: /\bno right to\b/i },
  { name: "lesson", re: /\blesson\b|\bteach you\b/i },
  { name: "moral", re: /\bmoral\b|\bmorally\b|\bimmoral\b/i },
  { name: "conscience", re: /\bconscience\b/i },
  { name: "sin", re: /\bsin\b|\bsinful\b|\bsins\b/i },
  { name: "evil", re: /\bevil\b|\bwicked\b|\bmonstrous\b/i },
  { name: "you-monster", re: /\byou monster\b/i },
  { name: "deserve", re: /\bdeserve[sd]?\b|\bdeserving\b/i },
  { name: "repent", re: /\brepent\b|\batone\b|\batonement\b|\bforgive (you|yourself)\b/i },
  { name: "karma", re: /\bkarma\b|\breckoning\b/i },
  { name: "poacher", re: /\bpoacher\b|\bpoachers\b|\bpoaching\b/i },
  { name: "slaughter", re: /\bslaughter\w*\b|\bmurder\w*\b|\bmassacre\w*\b|\bbutcher\w*\b/i },
  { name: "you-are-destroying", re: /\byou'?(re| are) (killing|ruining|destroying|wrecking|emptying)\b/i },
  { name: "you-destroyed", re: /\byou (ruined|destroyed|wrecked|emptied|killed) (it|this|them|us|everything|the)\b/i },
  { name: "hope-youre-happy", re: /\bhope you'?re (happy|proud|pleased)\b/i },
  { name: "be-proud", re: /\bwould be proud of you\b|\bproud of yourself\b/i },
  { name: "at-what-cost", re: /\bat what cost\b/i },
  { name: "worth-it", re: /\b(was|is) it worth it\b/i },
  { name: "think-about-what", re: /\bthink (about|of) what you\b/i },
  { name: "nature-sermon", re: /\bmother nature\b|\bbalance of nature\b|\bnature'?s (revenge|way)\b/i },
  { name: "land-will-judge", re: /\bthe \w+ will (remember|judge|never forgive)\b/i },
  { name: "youll-pay", re: /\byou'?(ll| will) (pay|answer) for\b/i },
  { name: "have-you-no", re: /\bhave you no\b/i },
  { name: "took-too-many", re: /\byou'?(ve| have)? ?(took|taken|caught|snared) too many\b/i },
  { name: "how-many-more", re: /\bleave them be\b|\bhow many more\b/i },
  { name: "not-an-accusation", re: /\bnot an accusation\b|\bnot accusing\b/i },
  { name: "sermon-register", re: /\bremorse\w*\b|\bsenseless\b|\bneedless\b|\bwanton\b|\bcallous\b|\bbarbaric\b/i },
];

/** The first pattern a piece of text trips, or undefined. */
const firstMoralizingHit = (text: string): string | undefined =>
  MORALIZING_PATTERNS.find((p) => p.re.test(text))?.name;

/** Returns one message per offending literal; empty means the file's copy is clean. */
function moralizingViolations(relPath: string, src: string): string[] {
  const out: string[] = [];
  for (const literal of stringLiterals(src)) {
    const hit = firstMoralizingHit(literal);
    if (hit === undefined) continue;
    out.push(
      `${relPath}: [${hit}] ${JSON.stringify(literal)} — G7: the counts are reported, never judged`,
    );
  }
  return out;
}

/**
 * Deliberately moralizing samples. Every one must be caught, or the scan is decorative.
 * The last five are the interesting ones: each is a reprimand with no obviously banned word in it.
 */
const KNOWN_BAD_COPY = [
  "You should be ashamed of what you took out of this marsh.",
  "That's your fault. The Fenmaw are gone because of you.",
  "Was it worth it? Look at the shallows now.",
  "Every creature you snare is a life you had no right to take.",
  "I hope you're proud of yourself, warden.",
  "The meadow will remember what you did here.",
  "Poachers like you are why the count is down.",
  "Think about what you're doing before you set that snare.",
  "You've taken too many. Some day you'll learn the lesson.",
  "It's cruel, what you people do out there.",
  "How could you? There were only three left.",
  "You're destroying this marsh one snare at a time.",
  "Have you no conscience at all?",
  "How many more will you take before you stop?",
  "Maren showed you how to count. Nobody showed you when to stop.",
  "You could have left one.",
  "Wick would be proud of you.",
  "Every count you touch goes down. That is not an accusation, it is arithmetic.",
  "Numbers are the numbers; I don't hold books against people.",
  "A needless waste of a good marsh.",
];

/**
 * Real copy of the kind these screens print. None may trip the scan, or the gate is over-broad and
 * the next honest line to be written gets rejected by it. The last four are verbatim literals from
 * `game/`, so this is a claim about the copy that actually ships, not about invented samples.
 */
const KNOWN_GOOD_COPY = [
  "The shallows used to take three nets. Now it's one.",
  "Haven't seen a Fenmaw this season.",
  "recent deaths 4",
  "weighted snare · 84% · 3 shakes",
  "Sorry, that slot could not be opened.",
  "Nibbin fainted",
  "Browser storage is unavailable, so this session cannot be saved. ",
  "Walk the trail in order and bring me what the stones say.",
  "One of yours has run out of years, then.",
  "Five counts on Cinder Steppe. Bring me all five and the flora reading with them.",
];

/** A literal with enough words in it to be prose rather than an identifier or a texture key. */
const looksLikeProse = (s: string): boolean =>
  s.trim().split(/\s+/).length >= 5 && /[a-z]{3}\s+[a-z]{3}/.test(s);

describe("no_moralizing_copy — build-doc §16 / G7 (game/ + core/ only — see header)", () => {
  it("finds a corpus of real copy, not an empty list", () => {
    // Without this the scan below passes by looking at nothing: a wrong path, a walk that stopped
    // at the first directory, or a lexer change that stopped emitting strings all read as green.
    expect(COPY_FILES.length, "the source walk is looking in the wrong place").toBeGreaterThan(40);
    for (const named of [
      "game/quests.ts",
      "game/props.ts",
      "game/battle-view.ts",
      "game/survey-view.ts",
      "game/scenes/OverworldScene.ts",
      "core/battle.ts",
    ]) {
      expect(COPY_FILES.map(rel), `${named} is not in the walk`).toContain(named);
    }
    const prose = COPY_FILES.flatMap((abs) => stringLiterals(readFileSync(abs, "utf8"))).filter(looksLikeProse);
    expect(prose.length, "the walk found files but almost no prose — the lexer is not emitting strings").toBeGreaterThan(100);
  });

  it("catches every known-bad sample (the scan is not decorative)", () => {
    expect(KNOWN_BAD_COPY.filter((s) => firstMoralizingHit(s) === undefined)).toEqual([]);
  });

  it("does not fire on plain observation or on ordinary UI copy (it is not over-broad)", () => {
    expect(
      KNOWN_GOOD_COPY.map((s) => [s, firstMoralizingHit(s)] as const).filter(([, hit]) => hit !== undefined),
    ).toEqual([]);
  });

  it("no string literal under game/ or core/ moralises about catching", () => {
    const violations = COPY_FILES.flatMap((abs) => moralizingViolations(rel(abs), readFileSync(abs, "utf8")));
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("BINDS — a moralizing line smuggled into a copy of EACH real source is caught", () => {
    // The positive control runs against every file the gate guards, not against a sample string, so
    // a file whose literals the lexer cannot see would fail here instead of passing silently above.
    for (const abs of COPY_FILES) {
      const relPath = rel(abs);
      const src = readFileSync(abs, "utf8");
      const sabotaged = `${src}\nconst caption = "You should be ashamed of what you took out of this marsh.";\n`;
      expect(
        moralizingViolations(relPath, sabotaged).join(" "),
        `${relPath}: the gate did not catch a smuggled moralizing line`,
      ).toMatch(/\[shame\]/);
    }
  });

  it("BINDS — it sees a template literal and a single-quoted string, not just double quotes", () => {
    // The likeliest home for a moralizing caption is an interpolated one.
    expect(moralizingViolations("game/x.ts", "const c = `${name} — you have no right to take it`;")).toHaveLength(1);
    expect(moralizingViolations("game/x.ts", "const c = 'poaching pays badly';")).toHaveLength(1);
  });

  it("BINDS — a comment discussing the guardrail is not a violation", () => {
    // The gate reads literals, never prose about the gate. This file, and core/schemas.ts:753, would
    // otherwise fail it — and the fix for that would be an exemption, which is how scanners die.
    expect(moralizingViolations("core/x.ts", "// the allow-list catches a table under an innocent name\n")).toEqual([]);
    expect(moralizingViolations("core/x.ts", "/* G7 forbids guilt, blame and shame in shipped copy. */\n")).toEqual([]);
    expect(moralizingViolations("core/x.ts", "const s = 1; // no lesson, no moralizing\n")).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * no_moralizing_copy, lane 2 — the same G7 matcher over data/, where the copy lives
 * ════════════════════════════════════════════════════════════════════════════ */

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

/**
 * One string found in a JSON tree.
 *
 * `path` is where it actually is (`entries[7].lines[2].text`) so a failure names the line to fix.
 * `shape` is that path with the indices removed (`entries[].lines[].text`) so the classification
 * below is per FIELD and not per occurrence — a corpus that grows by a hundred entries adds no
 * shapes, which is what lets this gate be strict about unknown ones.
 * `doc` marks anything under a `_`-prefixed key: the repo-wide documentation convention.
 */
interface JsonString {
  path: string;
  shape: string;
  text: string;
  doc: boolean;
}

/**
 * Free-key objects: maps whose KEYS are data (flag names), so their shapes collapse to `.*`.
 * Without this, every flag a writer invents would arrive as a brand-new unclassified shape and the
 * completeness check below would fire on ordinary authoring instead of on a schema change.
 */
const JSON_FREE_KEY_FIELDS = new Set(["setFlags"]);

/** Every string value in a JSON tree, in document order. */
function jsonStrings(root: JsonValue): JsonString[] {
  const out: JsonString[] = [];
  const rec = (v: JsonValue, path: string, shape: string, doc: boolean, collapsed: boolean): void => {
    if (typeof v === "string") {
      out.push({ path, shape, text: v, doc });
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((item, i) => rec(item as JsonValue, `${path}[${String(i)}]`, `${shape}[]`, doc, collapsed));
      return;
    }
    if (v === null || typeof v !== "object") return;
    for (const [k, child] of Object.entries(v)) {
      const nextDoc = doc || k.startsWith("_");
      const nextPath = path === "" ? k : `${path}.${k}`;
      if (collapsed) {
        rec(child as JsonValue, nextPath, shape, nextDoc, true);
      } else if (JSON_FREE_KEY_FIELDS.has(k)) {
        rec(child as JsonValue, nextPath, shape === "" ? `${k}.*` : `${shape}.${k}.*`, nextDoc, true);
      } else {
        rec(child as JsonValue, nextPath, shape === "" ? k : `${shape}.${k}`, nextDoc, false);
      }
    }
  };
  rec(root, "", "", false, false);
  return out;
}

/**
 * The shipped bytes, not the validated object.
 *
 * Deliberately `JSON.parse` of the file rather than `core/dialogue-schema.ts`'s parse, for the same
 * reason `balance_keys_survive_validation` exists a few hundred lines up: a zod parse can strip or
 * normalise, and a gate that reads the post-parse object cannot see a field the schema dropped. G7
 * is a claim about what ships in the file.
 */
function readJson(relPath: string): JsonValue {
  return JSON.parse(readFileSync(join(ROOT, relPath), "utf8")) as JsonValue;
}

const clone = (v: JsonValue): JsonValue => JSON.parse(JSON.stringify(v)) as JsonValue;

const DIALOGUE_FILE = "data/dialogue.json";
const DIALOGUE_RAW: JsonValue = readJson(DIALOGUE_FILE);

/**
 * THE THREE FIELDS THAT REACH THE SCREEN, read off `core/dialogue-schema.ts` and confirmed against
 * the code that draws them. This list is the whole scope of the dialogue scan, so it is short on
 * purpose and each row carries its renderer:
 *
 *   `speakers[].name`        DialogueSpeaker.name — "display name shown in the name plate";
 *                            `game/scenes/DialogueScene.ts:401` and `:497` print exactly this.
 *   `entries[].lines[].text` DialogueLine.text — the line itself.
 *   `entries[].choices[].text` DialogueChoice.text — `game/dialogue-runner.ts:298` returns these
 *                            as "the choices on screen".
 */
const DIALOGUE_PLAYER_FACING: readonly string[] = [
  "speakers[].name",
  "entries[].lines[].text",
  "entries[].choices[].text",
];

/**
 * EVERYTHING ELSE THE SCHEMA DECLARES, listed rather than defaulted.
 *
 * A default-to-ignore would let a new player-facing field be added and be silently unscanned, which
 * is the exact failure this lane was written to end — so the completeness check below treats a shape
 * in neither list as a violation. Every row here is an id, an enum, a flag key, a flag value, a
 * portrait handle, or a `goto` target. `speakers[].role` is the only judgement call and the schema
 * makes it: "free-text role tag — flavour for tooling, not logic"; nothing under `game/` reads it.
 * `entries[].lines[].speaker` is a speaker ID override for a multi-speaker scene — the NAME the
 * player sees for it is `speakers[].name`, which is scanned.
 */
const DIALOGUE_NOT_PLAYER_FACING: readonly string[] = [
  "speakers[].id",
  "speakers[].kind",
  "speakers[].role",
  "speakers[].home",
  "speakers[].portrait",
  "entries[].id",
  "entries[].speaker",
  "entries[].node",
  "entries[].kind",
  "entries[].quest",
  "entries[].signChain",
  "entries[].propId",
  "entries[].goto",
  "entries[].setFlags.*",
  "entries[].lines[].speaker",
  "entries[].choices[].goto",
  "entries[].choices[].setFlags.*",
  "entries[].when.flagsSet[]",
  "entries[].when.flagsUnset[]",
  "entries[].when.flagEquals[].key",
  "entries[].when.flagEquals[].value",
  "entries[].when.seasons[]",
  "entries[].when.population[].node",
  "entries[].when.population[].lineId",
  "entries[].when.population[].op",
  "entries[].when.floraStock[].node",
  "entries[].when.floraStock[].op",
];

/** Strings the player can read, out of any dialogue-shaped JSON (the real file or a sabotaged copy). */
const dialoguePlayerFacingStrings = (root: JsonValue): JsonString[] =>
  jsonStrings(root).filter((s) => !s.doc && DIALOGUE_PLAYER_FACING.includes(s.shape));

/** Shapes the two lists above do not account for. Non-empty means the gate is reading blind. */
const unclassifiedDialogueShapes = (root: JsonValue): string[] =>
  [
    ...new Set(
      jsonStrings(root)
        .filter(
          (s) =>
            !s.doc &&
            !DIALOGUE_PLAYER_FACING.includes(s.shape) &&
            !DIALOGUE_NOT_PLAYER_FACING.includes(s.shape),
        )
        .map((s) => s.shape),
    ),
  ].sort();

/** Each entry's lines, and those lines joined so a phrase straddling two of them is one sentence. */
function dialogueBodies(root: JsonValue): { id: string; lines: string[]; body: string }[] {
  const entries = (root as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return [];
  return entries.map((rawEntry, i) => {
    const entry = rawEntry as { id?: unknown; lines?: unknown };
    const id = typeof entry.id === "string" ? entry.id : `entries[${String(i)}]`;
    const lines = (Array.isArray(entry.lines) ? entry.lines : []).map((l) => {
      const text = (l as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    });
    return { id, lines, body: lines.join(" ") };
  });
}

/** One message per offending string; empty means the corpus's player-facing copy is clean. */
function dialogueCopyViolations(root: JsonValue): string[] {
  const out: string[] = [];
  for (const s of dialoguePlayerFacingStrings(root)) {
    const hit = firstMoralizingHit(s.text);
    if (hit === undefined) continue;
    out.push(
      `${DIALOGUE_FILE} ${s.path}: [${hit}] ${JSON.stringify(s.text)} — G7: the counts are reported, never judged`,
    );
  }
  for (const { id, lines, body } of dialogueBodies(root)) {
    // The join only adds what the per-line pass could not see. An entry that already reported a bad
    // line is skipped, so one bad line is one failure and not two.
    if (lines.some((t) => firstMoralizingHit(t) !== undefined)) continue;
    const hit = firstMoralizingHit(body);
    if (hit === undefined) continue;
    out.push(`${DIALOGUE_FILE} ${id}: [${hit}] across its lines — G7: the counts are reported, never judged`);
  }
  return out;
}

/* ── the rest of data/ ───────────────────────────────────────────────────────
 * dialogue.json is where the prose is, but "is" is a claim, and this gate exists because an
 * unchecked claim about where the copy lives is what left `data/` unscanned in the first place. So
 * every other shipped JSON is censused: any prose-shaped string outside a `_`-documentation key must
 * be a shape declared here, and the player-facing ones are scanned by the same matcher. A new
 * prose field anywhere under `data/` therefore fails this gate until someone classifies it.
 * ─────────────────────────────────────────────────────────────────────────── */

const OTHER_DATA_PROSE_SHAPES: Record<string, "player-facing" | "not-player-facing"> = {
  /** `data/nodes/*.json` — `game/props.ts:99` prints this on the HUD; its own comment cites G7. */
  "props[].label": "player-facing",
  /**
   * `data/moves.json` — `MoveDef.text`, "the bible's own parenthetical for this move, transcribed".
   * Nothing under `game/` prints it TODAY. Scanned anyway: it is authored English sitting one move-
   * info panel away from the screen, and "no screen reads it yet" is precisely the assumption that
   * left the dialogue corpus unscanned. Costing a few dozen regex tests, it stays in scope.
   */
  "moves[].text": "player-facing",
  /** `data/palette*.json` — the k-means run that produced the ramp. Provenance, never drawn. */
  source: "not-player-facing",
};

const OTHER_DATA_FILES = walk(join(ROOT, "data"), [".json"])
  .map(rel)
  .filter((f) => f !== DIALOGUE_FILE)
  .sort();

/** Player-facing strings in a non-dialogue data file — every length, not only prose-shaped ones. */
const otherDataPlayerFacing = (root: JsonValue): JsonString[] =>
  jsonStrings(root).filter((s) => !s.doc && OTHER_DATA_PROSE_SHAPES[s.shape] === "player-facing");

/** Prose in a non-dialogue data file that neither the docs convention nor the table above accounts for. */
const unclassifiedOtherDataProse = (root: JsonValue): string[] =>
  [
    ...new Set(
      jsonStrings(root)
        .filter((s) => !s.doc && looksLikeProse(s.text) && OTHER_DATA_PROSE_SHAPES[s.shape] === undefined)
        .map((s) => s.shape),
    ),
  ].sort();

/* ── the sabotage kit ────────────────────────────────────────────────────────
 * Every negative control below injects through `dialogueCopyViolations`, the same function the real
 * scan calls, so a control passing is evidence about the real scan and not about a parallel one.
 * ─────────────────────────────────────────────────────────────────────────── */

const BAD_LINE = "You should be ashamed of what you took out of this marsh.";

/** Copy of the corpus carrying exactly one entry, with `mutate` applied to it. */
function oneEntry(index: number, mutate: (entry: Record<string, JsonValue>) => void): JsonValue {
  const file = clone(DIALOGUE_RAW) as { speakers: JsonValue; entries: JsonValue[] };
  const entry = file.entries[index] as Record<string, JsonValue>;
  mutate(entry);
  return { speakers: file.speakers, entries: [entry] } as unknown as JsonValue;
}

const entryCount = ((DIALOGUE_RAW as { entries?: unknown }).entries as unknown[]).length;

describe("no_moralizing_copy — data/ (G7 over the copy itself, build-doc §16)", () => {
  it("finds the real corpus, not an empty list", () => {
    // The whole point of this lane. A scan that reads nothing reports green, and the previous
    // version of this gate would have reported green over `data/` while collecting zero files.
    const strings = dialoguePlayerFacingStrings(DIALOGUE_RAW);
    expect(entryCount, "data/dialogue.json has no entries — the read is wrong").toBeGreaterThan(50);
    expect(
      strings.length,
      "the dialogue scan is looking at nothing (wrong path, or a field was renamed)",
    ).toBeGreaterThan(entryCount);
    expect(
      strings.filter((s) => looksLikeProse(s.text)).length,
      "the scan found strings but almost no prose — it is reading ids, not copy",
    ).toBeGreaterThan(100);
    expect(OTHER_DATA_FILES.length, "the data/ walk found no other JSON").toBeGreaterThan(10);
    expect(OTHER_DATA_FILES).toContain("data/nodes/hearthollow.json");
  });

  it("every declared player-facing path really occurs — a typo'd path would scan nothing", () => {
    // Without this, renaming `text` to `body` in the schema turns the scan into a no-op that passes.
    const present = new Set(jsonStrings(DIALOGUE_RAW).map((s) => s.shape));
    for (const shape of DIALOGUE_PLAYER_FACING) {
      expect(present.has(shape), `${shape} is declared player-facing but occurs nowhere in the file`).toBe(true);
    }
    expect(DIALOGUE_PLAYER_FACING.filter((s) => DIALOGUE_NOT_PLAYER_FACING.includes(s))).toEqual([]);
  });

  it("every string field in data/dialogue.json is classified — nothing is read blind", () => {
    const unknown = unclassifiedDialogueShapes(DIALOGUE_RAW);
    expect(
      unknown,
      `unclassified dialogue fields — decide whether the player reads these and add each to ` +
        `DIALOGUE_PLAYER_FACING or DIALOGUE_NOT_PLAYER_FACING:\n  ${unknown.join("\n  ")}`,
    ).toEqual([]);
  });

  it("no player-facing string in data/dialogue.json moralises about catching", () => {
    const violations = dialogueCopyViolations(DIALOGUE_RAW);
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("every prose string in the rest of data/ is classified, and none of it moralises", () => {
    const unknown: string[] = [];
    const violations: string[] = [];
    for (const relPath of OTHER_DATA_FILES) {
      const root = readJson(relPath);
      unknown.push(...unclassifiedOtherDataProse(root).map((s) => `${relPath}: ${s}`));
      for (const s of otherDataPlayerFacing(root)) {
        const hit = firstMoralizingHit(s.text);
        if (hit !== undefined) violations.push(`${relPath} ${s.path}: [${hit}] ${JSON.stringify(s.text)}`);
      }
    }
    expect(
      unknown,
      `unclassified prose under data/ — add each shape to OTHER_DATA_PROSE_SHAPES:\n  ${unknown.join("\n  ")}`,
    ).toEqual([]);
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("BINDS — a moralizing line smuggled into EVERY entry of the real corpus is caught", () => {
    // Per-entry, not per-corpus: an entry the walker cannot reach would pass silently otherwise.
    for (let i = 0; i < entryCount; i += 1) {
      const sabotaged = oneEntry(i, (entry) => {
        (entry["lines"] as JsonValue[]).push({ text: BAD_LINE });
      });
      const found = dialogueCopyViolations(sabotaged);
      expect(found.join(" "), `entry ${String(i)}: the gate did not catch a smuggled moralizing line`).toMatch(
        /\[shame\]/,
      );
    }
  });

  it("BINDS — a moralizing choice label and a moralizing name plate are caught", () => {
    const withChoice = oneEntry(0, (entry) => {
      entry["choices"] = [{ text: "Tell him the poaching paid well." }];
    });
    expect(dialogueCopyViolations(withChoice).join(" ")).toMatch(/\[poacher\]/);

    const withName = clone(DIALOGUE_RAW) as { speakers: Record<string, JsonValue>[] };
    (withName.speakers[0] as Record<string, JsonValue>)["name"] = "Maren the Guilty";
    expect(dialogueCopyViolations(withName as unknown as JsonValue).join(" ")).toMatch(/\[guilt\]/);
  });

  it("BINDS — a moralizing phrase split across two lines of one entry is caught", () => {
    // The per-string scan cannot see this; the joined-body pass is why the check exists.
    const split = oneEntry(0, (entry) => {
      entry["lines"] = [{ text: "You have taken" }, { text: "too many out of the shallows." }];
    });
    const found = dialogueCopyViolations(split);
    expect(found.join(" "), "a phrase straddling two lines slipped through").toMatch(/\[took-too-many\]/);
  });

  it("BINDS — a plainly reported population count is NOT flagged (G7 permits the numbers)", () => {
    // The other half of the guardrail: reporting counts plainly is the required register, so a gate
    // that fires on it would push the copy away from G7 rather than toward it.
    const plain = [
      "Nine Fenmaw in the shallows this year. Last year the count was fourteen.",
      "Brackmarsh reads 3 Mirefin, 0 Elder. Breeding coefficient is under one.",
      "Two nets where it used to take three. Write down what you see.",
      "The Kilnback are gone off this node. Nothing eats them here now.",
      "recent deaths 4 · births 0 · net -4",
    ];
    for (const text of plain) {
      const probe = oneEntry(0, (entry) => {
        entry["lines"] = [{ text }];
        delete entry["choices"];
      });
      expect(dialogueCopyViolations(probe), `plain reporting was flagged: ${text}`).toEqual([]);
    }
  });

  it("BINDS — the scan reads copy, and not ids, flags, speaker roles or provenance prose", () => {
    // A scan of the whole file would "pass" this ticket while firing on the notes that explain the
    // guardrail. Precision is what makes the classification worth having, so it is asserted.
    const noisy = clone(DIALOGUE_RAW) as Record<string, JsonValue>;
    noisy["_source"] = `G7 forbids shame, guilt and blame; ${BAD_LINE}`;
    const speakers = noisy["speakers"] as Record<string, JsonValue>[];
    (speakers[0] as Record<string, JsonValue>)["role"] = "the guilty one";
    const entries = noisy["entries"] as Record<string, JsonValue>[];
    const first = entries[0] as Record<string, JsonValue>;
    first["setFlags"] = { "story.shame": "you should be ashamed" };
    first["when"] = { flagEquals: [{ key: "story.starter", value: "a cruel choice" }] };
    expect(dialogueCopyViolations(noisy as unknown as JsonValue)).toEqual([]);
    // …and none of that made a shape the classification does not already account for.
    expect(unclassifiedDialogueShapes(noisy as unknown as JsonValue)).toEqual([]);
  });

  it("BINDS — a field the classification does not know is reported, not passed over", () => {
    // The anti-drift property. A `subtitle` added to the schema tomorrow must fail loudly here
    // rather than be quietly excluded from the G7 scan, which is how `data/` got skipped before.
    const grown = clone(DIALOGUE_RAW) as { entries: Record<string, JsonValue>[] };
    (grown.entries[0] as Record<string, JsonValue>)["subtitle"] = BAD_LINE;
    expect(unclassifiedDialogueShapes(grown as unknown as JsonValue)).toEqual(["entries[].subtitle"]);
    // It is unclassified, so the copy scan does NOT silently cover it — which is why the check above
    // is a gate in its own right and not a nicety.
    expect(dialogueCopyViolations(grown as unknown as JsonValue)).toEqual([]);
  });

  it("BINDS — a moralizing prop label in a node file is caught", () => {
    const node = clone(readJson("data/nodes/hearthollow.json")) as { props: Record<string, JsonValue>[] };
    (node.props[0] as Record<string, JsonValue>)["label"] = "what the poachers left";
    const hits = otherDataPlayerFacing(node as unknown as JsonValue)
      .map((s) => firstMoralizingHit(s.text))
      .filter((h) => h !== undefined);
    expect(hits, "a moralizing prop label was not caught").toContain("poacher");
  });

  it("BINDS — an unclassified prose field elsewhere under data/ is reported", () => {
    const node = clone(readJson("data/nodes/hearthollow.json")) as Record<string, JsonValue>;
    node["blurb"] = "A quiet spring town at the head of the valley road.";
    expect(unclassifiedOtherDataProse(node as unknown as JsonValue)).toEqual(["blurb"]);
  });
});
