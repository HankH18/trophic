/**
 * tests/gates/reachability.test.ts — EVERY AUTHORED LINE MUST HAVE A PATH TO THE SCREEN.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS: A TEST THAT CONSTRUCTS THE STATE IT ASSERTS ON PROVES NOTHING
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * This repo has now been burned twice by a green suite certifying content the player cannot reach.
 *
 *   1. `OverworldScene.winGym` — the only thing that writes a badge flag — had no caller anywhere.
 *      Every act above the prologue was unreachable and the suite was green, because the tests
 *      called `awardBadge` themselves.
 *   2. `story.vellsire.resolved` — the flag both epilogues gate on — is mentioned in exactly three
 *      files, and all three are TESTS. They set it by hand and then assert the epilogue fires. It
 *      does fire. Nothing in the game ever sets it. 2095 green tests certified a dead finale.
 *
 * Both defects share one shape: **the test supplied the precondition the game never supplies.**
 * So the rule this file enforces is that a precondition is only real if something OUTSIDE the test
 * produces it — the corpus itself, or shipped code under `core/` `game/` `tools/`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * HOW A "WRITER" IS ESTABLISHED, AND WHY IT IS NOT A GREP
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * A naive `grep "quest.first-signs.turnin" game/` finds nothing and would report the flag dead —
 * a FALSE POSITIVE — because `game/quests.ts` never types that string. It builds flag keys out of
 * constants (`` `quest.${questId}${ACCEPTED_AT_SUFFIX}` ``, `` `${LIFECYCLE_NAMESPACE}first-retirement` ``)
 * and derives others from the corpus itself. Grepping the other way — accepting any file that
 * MENTIONS the key — is worse: every one of these keys is discussed at length in comments, so a
 * mention-based census would certify `story.vellsire.resolved` as written by three shipping modules
 * that only talk about it. That is the permissive direction, and it makes the gate worthless.
 *
 * The census below therefore has four sources, three of them strong:
 *
 *   CORPUS   — `flagsWritten(DIALOGUE)`. The real function the game uses. 86 keys.
 *   DERIVED  — an explicit table of expanders that CALL the real exported constructors over the
 *              real shipped domains (`badgeFlagFor` × `data/gyms.json`, `windowFlagFor` × the
 *              shipped window ids, `linesMetFlag` × `data/nodes/`, `RETIREMENT_MILESTONE_FLAG`,
 *              and `syncQuestFlags`'s `due[def.owedFlag]` × `questDefinitions(DIALOGUE)`).
 *              Nothing here is a transcription: if the constant moves, the expansion moves.
 *   OBSERVED — flags that appear on a save after DRIVING the real writers (`syncEventFlags` over
 *              two years of ticks, `syncQuestFlags` on a fresh save and on one that has retired).
 *              This is the anti-stub-blindness half: not "a writer exists", but "the flag appeared".
 *   LITERAL  — flag-shaped string literals in COMMENT-STRIPPED shipping source. Weak, and treated
 *              as such: a flag whose only writer is a literal must be named in
 *              {@link LITERAL_ONLY_WRITERS} so a reviewer sees it. That list is empty today.
 *
 * ⚠ THE LEXER IS DUPLICATED FROM `tests/gates/guardrails.test.ts` ON PURPOSE. That file is a test
 * module — importing it would re-run its whole suite here. The right fix is to lift the lexer into
 * a shared `tests/support/` module; that touches an existing file, which this task's scope forbids.
 * Reported rather than done.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { badgeFlagFor } from "../../core/acts";
import { createClock, seasonOf, type ClockState } from "../../core/clock";
import {
  DIALOGUE,
  DIALOGUE_KINDS,
  FIRST_ACT,
  FIRST_YEAR,
  LAST_ACT,
  conditionHolds,
  flagsWritten,
  selectPropEntry,
  type DialogueCondition,
  type DialogueContext,
  type DialogueEntry,
  type DialogueFile,
  type DialogueKind,
  type FlagValue,
} from "../../core/dialogue-schema";
import { questDefinitions } from "../../core/quests";
import {
  FESTIVAL_WINDOW_ID,
  bloomWindowId,
  syncEventFlags,
  windowFlagFor,
  windowOpenedAtFlag,
} from "../../core/regional-events";
import { validateContent } from "../../core/schemas";
import { appendAction, newSave, type SaveEnvelope } from "../../core/save";
import { applyCatch, fromNodeState, stepRegionStates, toNodeState } from "../../core/ecosim";
import { toEcoNode } from "../../core/foodweb";
import { formNameOf } from "../../core/lifecycle";
import { createRng } from "../../core/rng";
import { SEASONS } from "../../core/types";
import type { NodeState } from "../../core/types";
import type { CaughtIndividual } from "../../core/battle";
import { AUTOPLAY_KINDS, BATTLE_KINDS, TALK_KINDS, dialogueContext } from "../../game/dialogue-runner";
import {
  ancientAgeClass,
  buildVellsireBattle,
  finaleAncientLine,
  finaleNodeId,
  resolveVellsireCatch,
} from "../../game/finale";
import {
  QUEST_OBJECTIVES,
  RETIREMENT_MILESTONE_FLAG,
  linesMetFlag,
  syncQuestFlags,
} from "../../game/quests";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const content = validateContent();
const balance = content.balance;

/* ════════════════════════════════════════════════════════════════════════════
 * 0. The lexer. Every source-text claim below is only as good as this.
 * ════════════════════════════════════════════════════════════════════════════ */

interface Lexed {
  /** Comments, string bodies and regex literals blanked; newlines preserved. */
  code: string;
  /** Every string/template literal BODY, in order. Template bodies keep their `${…}` markers. */
  strings: string[];
  /** Comment text, so a check can look at prose separately — or refuse to. */
  comments: string[];
}

const REGEX_PRECEDERS = "(,=:[!&|?{};+-*%~^<>";

function lex(src: string): Lexed {
  let code = "";
  const strings: string[] = [];
  const comments: string[] = [];
  let i = 0;
  let prev = "";

  const keep = (text: string): void => {
    code += text;
    for (const ch of text) if (!/\s/.test(ch)) prev = ch;
  };
  const blank = (text: string): void => {
    for (const ch of text) code += ch === "\n" ? "\n" : " ";
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
        if (quote !== "`" && c === "\n") break;
        body += c;
        j += 1;
      }
      const stop = src[j] === quote ? j + 1 : j;
      strings.push(body);
      code += quote + quote;
      for (const c of src.slice(i, stop)) if (c === "\n") code += "\n";
      prev = quote;
      i = stop;
      continue;
    }
    if (ch === "/" && (prev === "" || REGEX_PRECEDERS.includes(prev))) {
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
        } else if (c === "\n") break;
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
  return { code, strings, comments };
}

function walkTs(dir: string): string[] {
  const out: string[] = [];
  const rec = (d: string): void => {
    if (!existsSync(d)) return;
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        rec(full);
      } else if (entry.name.endsWith(".ts")) {
        out.push(full);
      }
    }
  };
  rec(dir);
  return out;
}

const SHIPPING_DIRS = ["core", "game", "tools"] as const;
const SHIPPING_FILES = SHIPPING_DIRS.flatMap((d) => walkTs(join(ROOT, d))).sort();
const GAME_FILES = walkTs(join(ROOT, "game")).sort();
const rel = (abs: string): string => abs.slice(ROOT.length + 1);

/** The shape `core/dialogue-schema.ts` `zFlagKey` accepts. */
const FLAG_SHAPE = /^[a-z0-9][a-zA-Z0-9._-]*$/;
const flagShaped = (s: string): boolean => FLAG_SHAPE.test(s) && s.includes(".");

/* ════════════════════════════════════════════════════════════════════════════
 * 1. The writer census
 * ════════════════════════════════════════════════════════════════════════════ */

/** Every flag key an entry REQUIRES — `when.flagsSet` and `when.flagEquals[].key`. */
function requiredFlags(file: DialogueFile): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const note = (key: string, id: string): void => {
    const list = out.get(key);
    if (list) list.push(id);
    else out.set(key, [id]);
  };
  for (const e of file.entries) {
    for (const k of e.when?.flagsSet ?? []) note(k, e.id);
    for (const fe of e.when?.flagEquals ?? []) note(fe.key, e.id);
  }
  return out;
}

/* ── CORPUS ──────────────────────────────────────────────────────────────── */

const CORPUS_WRITERS: ReadonlySet<string> = flagsWritten(DIALOGUE);

/* ── DERIVED: real constructors, called over the real shipped domains ─────── */

interface Expander {
  /** Where the writer lives, for the failure message. */
  where: string;
  flags: () => string[];
}

/**
 * ⚠ THE ONE EXPANDER WITH A CONDITION, AND THE CONDITION IS LOAD-BEARING.
 *
 * `syncQuestFlags` writes `due[def.owedFlag] = true` — but only after
 * `if (QUEST_OBJECTIVES[def.id] === undefined) continue`. So a quest with no row in the objective
 * table has NO writer for its turn-in flag, and its whole `.done` branch is dead copy. Expanding
 * over `questDefinitions()` unconditionally would hide exactly that, which is the permissive
 * direction this file exists to refuse. `tests/gates/quest-layer.test.ts` asserts the rows exist;
 * this only counts the ones that do.
 */
function questOwedFlagWriters(): string[] {
  const out: string[] = [];
  for (const def of questDefinitions(DIALOGUE)) {
    if (def.owedFlag === null) continue;
    if (QUEST_OBJECTIVES[def.id] === undefined) continue;
    out.push(def.owedFlag);
  }
  return out;
}

const EXPANDERS: readonly Expander[] = [
  {
    where: "core/acts.ts badgeFlagFor() × data/gyms.json (written by awardBadge)",
    flags: () => content.gyms.map((g) => badgeFlagFor(g.id, balance)),
  },
  {
    where: "core/regional-events.ts windowFlagFor()/windowOpenedAtFlag() × the shipped window ids",
    flags: () => {
      const ids = [
        FESTIVAL_WINDOW_ID,
        ...content.nodes.map((n) => bloomWindowId(n.id)),
        ...content.species.filter((s) => s.seasonalWindow !== undefined).map((s) => `migration.${s.id}`),
      ];
      return ids.flatMap((id) => [windowFlagFor(id, balance), windowOpenedAtFlag(id, balance)]);
    },
  },
  {
    where: "game/quests.ts RETIREMENT_MILESTONE_FLAG (resolved from the corpus, written by syncQuestFlags)",
    flags: () => [RETIREMENT_MILESTONE_FLAG],
  },
  {
    where: "game/quests.ts linesMetFlag() × data/nodes/",
    flags: () => content.nodes.map((n) => linesMetFlag(n.id)),
  },
  {
    where: "game/quests.ts syncQuestFlags due[def.owedFlag] × questDefinitions() WITH an objective row",
    flags: questOwedFlagWriters,
  },
];

function derivedWriters(): Map<string, string> {
  const out = new Map<string, string>();
  for (const ex of EXPANDERS) for (const f of ex.flags()) if (!out.has(f)) out.set(f, ex.where);
  return out;
}

const DERIVED_WRITERS = derivedWriters();

/* ── OBSERVED: drive the real writers and watch flags appear ─────────────── */

const freshSave = (): SaveEnvelope =>
  newSave({ seed: balance.rng.defaultSeed, currentNode: "hearthollow", nodes: content.nodes }, balance);

/**
 * Flags that ACTUALLY landed on a save after running the shipped writers.
 *
 * Not "a writer exists" — "the key appeared". This is the half of the census that a stub cannot
 * satisfy: `syncEventFlags` is stepped over two whole years of ticks (the festival window is one
 * season long and the clock emits no season boundary on the year-filling tick, so a single sample
 * misses it), and `syncQuestFlags` is run on a fresh save and again on one whose tape carries a
 * retirement.
 */
const OBSERVED_VALUES = new Map<string, Set<string>>();

function observedWriters(): Map<string, string> {
  const out = new Map<string, string>();
  const note = (before: SaveEnvelope, after: SaveEnvelope, where: string): void => {
    for (const [key, value] of Object.entries(after.questFlags)) {
      if (before.questFlags[key] !== undefined) continue;
      if (!out.has(key)) out.set(key, where);
      /*
       * THE VALUE IS RECORDED, NOT JUST THE KEY — this is what makes the fixpoint's `flagEquals`
       * arm real. A census that only says "something writes this key" cannot tell
       * `story.vellsire.outcome === "caught"` from `=== "cauhgt"`, and the corpus's ONLY two
       * `flagEquals` clauses are the two Vellsire epilogues. Measured: with the key-only census a
       * one-character typo in either value moved this gate's output by zero entries.
       */
      const seen = OBSERVED_VALUES.get(key);
      if (seen) seen.add(String(value));
      else OBSERVED_VALUES.set(key, new Set([String(value)]));
    }
  };

  // 1. Every tick of two calendar years through the real regional-event writer.
  let save = freshSave();
  const deps = { species: content.species, nodeStates: save.nodeStates };
  const start = createClock(balance);
  for (let t = 0; t < balance.clock.ticksPerYear * 2; t += 1) {
    const clock: ClockState = {
      year: start.year + Math.floor(t / balance.clock.ticksPerYear),
      tick: t % balance.clock.ticksPerYear,
    };
    const stamped: SaveEnvelope = { ...save, year: clock.year, tick: clock.tick };
    const after = syncEventFlags(stamped, clock, deps, balance);
    note(stamped, after, "core/regional-events.ts syncEventFlags (driven over two years of ticks)");
    save = after;
  }

  // 2. The quest tracker on a fresh save…
  const fresh = freshSave();
  note(fresh, syncQuestFlags(fresh, content), "game/quests.ts syncQuestFlags (fresh save)");

  // 3. …and on one whose tape carries a retirement, which is what publishes the lifecycle milestone.
  const retired = appendAction(freshSave(), {
    t: "retirement",
    choice: { kind: "boon", parentUid: "gate-parent", targetUid: "gate-target", stat: "atk" },
  });
  note(retired, syncQuestFlags(retired, content), "game/quests.ts syncQuestFlags (after a retirement)");

  /*
   * 4. THE FINALE — BOTH BRANCHES, DRIVEN, because a literal is not a write.
   *
   * `story.vellsire.resolved` and `story.vellsire.outcome` are the two keys this whole gate was
   * built after: they were mentioned in exactly three files and all three were tests. They are now
   * written by `game/finale.ts`, but the ONLY thing the census could see was
   * `export const VELLSIRE_OUTCOME_FLAG = "story.vellsire.outcome"` — a bare literal, and the same
   * file's `VELLSIRE_ATTEMPT_FLAG` sits two lines above it under a comment saying it is "read here,
   * never written here". A literal census cannot tell those two apart, so its green on the outcome
   * key was coincidence.
   *
   * So both terminal states are RUN. `caught` is produced by handing `resolveVellsireCatch` the
   * individual the real `buildVellsireBattle` puts in the ring; `released` by handing it the null
   * the reducer reports for every other end of that fight. The two values the epilogues
   * discriminate on are whatever those calls actually put on the save.
   */
  const ringNode = finaleNodeId(balance);
  const ringLine = finaleAncientLine(content, ringNode);
  if (ringLine === null) throw new Error(`no ancient line at "${ringNode}" — the ring is empty`);
  const built = buildVellsireBattle({
    content,
    save: freshSave(),
    act: LAST_ACT,
    rng: createRng(balance.rng.defaultSeed),
  });
  const stag: CaughtIndividual = {
    uid: built.enemy.uid,
    lineId: built.enemy.lineId,
    formName: formNameOf(ringLine, built.enemy.age),
    age: ancientAgeClass(),
    level: built.enemy.level,
    traits: built.enemy.traits,
    nodeId: built.nodeId,
    ancient: true,
    metamorphosed: false,
  };
  for (const [caught, label] of [
    [stag, "snare held"],
    [null, "snare missed"],
  ] as const) {
    const before = freshSave();
    const resolved = resolveVellsireCatch({ save: before, content, state: { outcome: null }, caught });
    note(before, resolved.save, `game/finale.ts resolveVellsireCatch (${label})`);
  }

  return out;
}

const OBSERVED_WRITERS = observedWriters();

/* ── LITERAL: the weak source, kept visible ──────────────────────────────── */

function literalWriters(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const abs of SHIPPING_FILES) {
    for (const body of lex(readFileSync(abs, "utf8")).strings) {
      if (body.includes("${")) continue; // a template, not a resolved key — DERIVED's job
      if (!flagShaped(body)) continue;
      const list = out.get(body);
      if (list) {
        if (!list.includes(rel(abs))) list.push(rel(abs));
      } else out.set(body, [rel(abs)]);
    }
  }
  return out;
}

const LITERAL_WRITERS = literalWriters();

/**
 * Required flags whose ONLY writer is a bare string literal in shipping code.
 *
 * A literal mention is not proof of a write — it could be a read. Any flag that lands here must be
 * listed, with the file and the reason, so the weak edge of the census is reviewed rather than
 * assumed. Empty today: every required flag is written by the corpus, by a DERIVED constructor, or
 * was OBSERVED landing on a save.
 */
const LITERAL_ONLY_WRITERS: readonly string[] = [];

/**
 * Required `flag=value` pairs whose only backing is a bare string literal.
 *
 * The sibling of {@link LITERAL_ONLY_WRITERS}, and the one that was actually non-empty: the key
 * guard exempts any corpus-written flag, and `story.vellsire.outcome` is corpus-written on ONE of
 * its two values, so `story.vellsire.outcome=caught` — the never-cut caught epilogue — passed
 * review on the strength of `export const VELLSIRE_OUTCOME_FLAG = "story.vellsire.outcome"`.
 * Empty today because `game/finale.ts` is now DRIVEN down both branches and both values were seen
 * landing on a save.
 */
const LITERAL_ONLY_VALUES: readonly string[] = [];

/**
 * Provenance for a flag written by something OUTSIDE the corpus — the game, in other words.
 *
 * ⚠ THIS IS THE SEED OF THE REACHABILITY FIXPOINT AND IT DELIBERATELY EXCLUDES THE CORPUS. A flag
 * an entry writes is not free: the player has to reach that entry first, which is the whole point.
 * Seeding corpus writes was this gate's own first bug — it made `story.greaves.beaten` look
 * available because a `battle-win` entry writes it, and hid the two cutscenes standing behind that
 * dead entry.
 */
function codeWriterOf(flag: string): string | null {
  const derived = DERIVED_WRITERS.get(flag);
  if (derived !== undefined) return derived;
  const observed = OBSERVED_WRITERS.get(flag);
  if (observed !== undefined) return observed;
  const literal = LITERAL_WRITERS.get(flag);
  if (literal !== undefined) return `string literal in ${literal.join(", ")}`;
  return null;
}

/**
 * What a code writer proves about a flag's VALUE — and why the literal tier proves nothing.
 *
 * ⚠ THE SEED USED TO GRANT `flag=*`, A WILDCARD THAT SATISFIES EVERY `flagEquals`, TO ANY FLAG WITH
 * ANY PROVENANCE — INCLUDING A BARE STRING LITERAL. Measured on the shipped tree: the only two
 * `flagEquals` clauses in the whole corpus are the two Vellsire epilogues discriminating on
 * `story.vellsire.outcome`, whose sole provenance was the literal
 * `export const VELLSIRE_OUTCOME_FLAG = "story.vellsire.outcome"` in `game/finale.ts`. Under the
 * wildcard, `flagEquals: [{key: "story.vellsire.outcome", value: "eaten"}]` — a value nothing in
 * `core/`, `game/`, `tools/` or the corpus ever writes — was certified REACHABLE, and a
 * one-character typo in either shipped epilogue moved this gate's report by zero entries. The
 * file's own header calls that failure mode out by name: accepting a file that MENTIONS a key "is
 * the permissive direction, and it makes the gate worthless."
 *
 * So the three tiers now say different things:
 *
 *   DERIVED  — `"any"`. A constructor proves the key EXISTS and is called over a real domain, but
 *              the expander does not run the write, so no value is claimed.
 *   OBSERVED — the exact set of values that LANDED on a save when the real writer was driven.
 *              This is the only tier that can satisfy a `flagEquals`, and it is earned.
 *   LITERAL  — the empty set: existence, and not one value. A mention is not a write, and a
 *              literal cannot tell a read (`VELLSIRE_ATTEMPT_FLAG`, documented "read here, never
 *              written here") from a write two lines below it.
 */
function codeValuesOf(flag: string): "any" | ReadonlySet<string> | null {
  if (DERIVED_WRITERS.has(flag)) return "any";
  const observed = OBSERVED_VALUES.get(flag);
  if (observed !== undefined) return observed;
  if (OBSERVED_WRITERS.has(flag)) return new Set<string>();
  if (LITERAL_WRITERS.has(flag)) return new Set<string>();
  return null;
}

/** True when SOMETHING writes the flag — another entry of `file`, or shipped code. Gate 1a's question. */
function hasWriterIn(file: DialogueFile): (flag: string) => boolean {
  const corpus = flagsWritten(file);
  return (flag) => corpus.has(flag) || codeWriterOf(flag) !== null;
}

/** What a seed answers: the values something outside the corpus can put on a flag, or null. */
type Seed = (flag: string) => "any" | ReadonlySet<string> | null;

/** The seed the fixpoint starts from: code writers only. Gate 1c's question. */
const codeSeed: Seed = (flag) => codeValuesOf(flag);

/* ════════════════════════════════════════════════════════════════════════════
 * 2. The census proves itself before it is trusted
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the writer census is not a grep", () => {
  it("finds the shipping source it is guarding", () => {
    expect(SHIPPING_FILES.length).toBeGreaterThan(20);
    expect(SHIPPING_FILES.some((f) => rel(f) === "game/quests.ts")).toBe(true);
    expect(SHIPPING_FILES.some((f) => rel(f) === "core/regional-events.ts")).toBe(true);
  });

  it("the lexer keeps a flag key that is only TALKED ABOUT out of the literal census", () => {
    const src = [
      "/* the corpus reads story.vellsire.resolved and nothing writes it */",
      'const real = "story.opening.done";',
      "// story.vellsire.outcome is discussed here too",
    ].join("\n");
    const { strings, comments } = lex(src);
    expect(strings).toEqual(["story.opening.done"]);
    expect(comments.join(" ")).toContain("story.vellsire.resolved");
  });

  /**
   * THE PROOF THE EXPANSION IS REAL WORK. `lifecycle.first-retirement` is never typed anywhere in
   * shipping code: `game/quests.ts` builds it as `` `${LIFECYCLE_NAMESPACE}first-retirement` ``. A
   * literal census cannot see it; the DERIVED expander resolves the constant and does. If this ever
   * fails in the direction "it IS a literal", the expander stopped being load-bearing and the gate
   * has quietly become a grep.
   */
  it("BINDS — a template-built flag resolves through DERIVED and is invisible to the literal scan", () => {
    expect(RETIREMENT_MILESTONE_FLAG).toBe("lifecycle.first-retirement");
    expect(LITERAL_WRITERS.has(RETIREMENT_MILESTONE_FLAG)).toBe(false);
    expect(DERIVED_WRITERS.get(RETIREMENT_MILESTONE_FLAG)).toContain("game/quests.ts");
  });

  it("BINDS — the festival flag is assembled from balance.json and is invisible to the literal scan", () => {
    const festival = windowFlagFor(FESTIVAL_WINDOW_ID, balance);
    expect(festival).toBe("event.festival.open");
    expect(LITERAL_WRITERS.has(festival)).toBe(false);
    expect(DERIVED_WRITERS.has(festival)).toBe(true);
    // …and it was seen landing on a real save, not merely constructed.
    expect(OBSERVED_WRITERS.has(festival)).toBe(true);
  });

  /**
   * The quest turn-in flags are the other family a grep cannot see: `syncQuestFlags` writes
   * `due[def.owedFlag]`, and `owedFlag` is derived from the corpus. Proven by RUNNING it: a save
   * that has met three lines on Meadow Reach and taken *First Signs* comes back carrying the
   * turn-in flag. If this breaks, the ten `.done` branches are dead and the census must say so.
   */
  it("BINDS — a quest turn-in flag is observed landing on a save from the real tracker", () => {
    const def = questDefinitions(DIALOGUE).find((d) => d.id === "first-signs");
    expect(def?.owedFlag).toBe("quest.first-signs.turnin");
    const objective = QUEST_OBJECTIVES["first-signs"];
    expect(objective).toEqual({ kind: "distinctLinesMetAt", node: "r1", count: 3 });

    const r1 = content.nodes.find((n) => n.id === "r1");
    const met = Object.keys(r1?.populations ?? {}).slice(0, 3);
    expect(met).toHaveLength(3);

    let save = freshSave();
    save = {
      ...save,
      questFlags: {
        ...save.questFlags,
        [linesMetFlag("r1")]: met.join(" "),
        // the acceptance the corpus writes for this quest
        "quest.first-signs.offered": true,
      },
    };
    const after = syncQuestFlags(save, content);
    expect(after.questFlags["quest.first-signs.turnin"]).toBe(true);
  });

  it("every literal-only writer is named in the reviewed list", () => {
    const required = [...requiredFlags(DIALOGUE).keys()];
    const literalOnly = required.filter(
      (f) =>
        !CORPUS_WRITERS.has(f) &&
        !DERIVED_WRITERS.has(f) &&
        !OBSERVED_WRITERS.has(f) &&
        LITERAL_WRITERS.has(f),
    );
    expect(literalOnly.sort()).toEqual([...LITERAL_ONLY_WRITERS].sort());
  });

  /**
   * The same review, PER VALUE — because the guard above cannot see the case that matters.
   *
   * It exempts anything in `CORPUS_WRITERS`, and `story.vellsire.outcome` IS corpus-written:
   * `sanctum.vellsire.approach`'s stand-aside choice writes `"released"`. So the flag never landed
   * in the reviewed list however weak its code provenance was — while `"caught"`, the value the
   * OTHER epilogue discriminates on, is produced by `game/finale.ts` alone and was backed by
   * nothing but a string literal. Exempting per KEY hid a hole that only exists per VALUE.
   */
  it("every literal-only VALUE is named in the reviewed list", () => {
    const corpusValues = new Map<string, Set<string>>();
    for (const e of DIALOGUE.entries) {
      const bags = [e.setFlags ?? {}, ...(e.choices ?? []).map((c) => c.setFlags ?? {})];
      for (const bag of bags) {
        for (const [k, v] of Object.entries(bag)) {
          const seen = corpusValues.get(k);
          if (seen) seen.add(String(v));
          else corpusValues.set(k, new Set([String(v)]));
        }
      }
    }
    const unproven: string[] = [];
    for (const e of DIALOGUE.entries) {
      for (const fe of e.when?.flagEquals ?? []) {
        const value = String(fe.value);
        if (corpusValues.get(fe.key)?.has(value) === true) continue;
        if (DERIVED_WRITERS.has(fe.key)) continue; // a constructor claims no value; "any" is honest
        if (OBSERVED_VALUES.get(fe.key)?.has(value) === true) continue;
        unproven.push(`${fe.key}=${value}`);
      }
    }
    expect([...new Set(unproven)].sort()).toEqual([...LITERAL_ONLY_VALUES].sort());
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3. GATE 1a — every flag an entry requires has a writer
 * ════════════════════════════════════════════════════════════════════════════ */

interface OrphanFlag {
  flag: string;
  requiredBy: string[];
}

function orphanFlags(file: DialogueFile, hasWriter: (flag: string) => boolean): OrphanFlag[] {
  const out: OrphanFlag[] = [];
  for (const [flag, requiredBy] of [...requiredFlags(file)].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (hasWriter(flag)) continue;
    out.push({ flag, requiredBy: [...requiredBy].sort() });
  }
  return out;
}

function formatOrphans(orphans: readonly OrphanFlag[]): string {
  return [
    `${String(orphans.length)} flag(s) are REQUIRED by the corpus and WRITTEN BY NOTHING —`,
    "not by another entry's setFlags, not by a choice's setFlags, and not by any writer in",
    "core/ game/ tools/ (constructors expanded, comments excluded). Every entry listed under one",
    "of these can never fire in the shipped build:",
    ...orphans.map((o) => `  • ${o.flag}\n      required by: ${o.requiredBy.join(", ")}`),
  ].join("\n");
}

describe("GATE 1a — every flag the corpus requires has a writer", () => {
  it("names every orphan flag and the entries it strands", () => {
    const orphans = orphanFlags(DIALOGUE, hasWriterIn(DIALOGUE));
    expect(orphans.length === 0 || formatOrphans(orphans)).toBe(true);
  });

  it("BINDS — a requirement on a flag nothing writes is caught", () => {
    const sabotaged = withEntries(DIALOGUE, [
      bogusEntry({ id: "gate.sabotage.orphan", when: { flagsSet: ["gate.sabotage.nobody-writes-this"] } }),
    ]);
    const orphans = orphanFlags(sabotaged, hasWriterIn(sabotaged));
    expect(orphans.map((o) => o.flag)).toContain("gate.sabotage.nobody-writes-this");
    expect(formatOrphans(orphans)).toContain("gate.sabotage.orphan");
  });

  it("BINDS — and it does NOT fire for a flag another entry writes", () => {
    const sabotaged = withEntries(DIALOGUE, [
      bogusEntry({ id: "gate.sabotage.writer", setFlags: { "gate.sabotage.written": true } }),
      bogusEntry({ id: "gate.sabotage.reader", when: { flagsSet: ["gate.sabotage.written"] } }),
    ]);
    const orphans = orphanFlags(sabotaged, hasWriterIn(sabotaged));
    expect(orphans.map((o) => o.flag)).not.toContain("gate.sabotage.written");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 4. GATE 1b — every dialogue KIND has a selector that can request it
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The kinds `game/` can actually ask the corpus for, established from the shipped selectors
 * themselves rather than from a list typed here.
 *
 *   • `AUTOPLAY_KINDS` and `TALK_KINDS` are the exported kind lists `autoplayEntryFor` and
 *     `talkEntryFor` walk.
 *   • `prop` is not selected BY KIND at all — `propDialogueFor` discriminates on `propId` — so it
 *     is established by CALLING the real selector against the real prop placements and collecting
 *     the kinds that actually come back.
 */
function kindsProvenByPropSelector(): Set<DialogueKind> {
  const out = new Set<DialogueKind>();
  const ctx = (act: number): DialogueContext => ({
    act,
    year: FIRST_YEAR,
    season: seasonOf({ year: FIRST_YEAR, tick: balance.clock.startTick }, balance),
    flags: {},
    populations: {},
    floraStock: {},
  });
  for (const node of content.nodes) {
    for (const prop of node.props) {
      for (let act = FIRST_ACT; act <= LAST_ACT; act += 1) {
        const found = selectPropEntry(DIALOGUE, prop.id, node.id, ctx(act));
        if (found) out.add(found.kind);
      }
    }
  }
  return out;
}

function selectableKinds(): Set<DialogueKind> {
  return new Set<DialogueKind>([
    ...AUTOPLAY_KINDS,
    ...BATTLE_KINDS,
    ...TALK_KINDS,
    ...kindsProvenByPropSelector(),
  ]);
}


/** Every DialogueKind named as a live string literal anywhere under `game/`. */
function kindsNamedInGame(): Set<string> {
  const out = new Set<string>();
  const kinds = new Set<string>(DIALOGUE_KINDS);
  for (const abs of GAME_FILES) {
    for (const body of lex(readFileSync(abs, "utf8")).strings) {
      if (kinds.has(body)) out.add(body);
    }
  }
  return out;
}

const SELECTABLE_KINDS = selectableKinds();

/**
 * Every `(speaker, node)` pair a battle selector can EVER be called with, read off `content`.
 *
 * `battleEntryFor` is not a broadcast: it is a strict `(speaker, node, kind)` match with no
 * fallback, and its three call sites — `playBattlePre` and `playBattleOutcome` in
 * `game/scenes/OverworldScene.ts`, and `rivalEncounterStanding` in `game/rival.ts` — pass
 * `gym.id`/`gym.town` or `rival.id`/`rival.node` and nothing else. So the argument domain is
 * exactly `data/gyms.json`'s `gyms[]` ∪ `rival[]`: twelve pairs, derived here rather than typed,
 * so a seventh gym or a seventh rival act moves this set on its own.
 */
const BATTLE_PAIRS: ReadonlySet<string> = new Set([
  ...content.gyms.map((g) => `${g.id}|${g.town}`),
  ...content.rival.map((r) => `${r.id}|${r.node}`),
]);

/**
 * Whether any shipped selector can ask the corpus for THIS ENTRY — not merely for its kind.
 *
 * ⚠ THE MODEL USED TO BE A SET OF KINDS, AND THAT IS THE SAME REASONING THAT PRODUCED THE DEFECT
 * THIS FILE EXISTS TO CATCH. "The kind exists, therefore the copy is reachable" is what let 35
 * `battle-*` entries sit dead behind a kind enum. Restoring `BATTLE_KINDS` to the union above
 * closes the count but re-opens the reasoning one level down: a `battle-pre` on
 * `(maren, hearthollow)` — a speaker and a node that are both real, and a pair no code path ever
 * passes — was certified reachable by the kind-only model. Measured: it was.
 *
 * So a battle entry is selectable only when its OWN pair is one a selector can issue. Everything
 * else stays kind-addressed, because that is genuinely how those selectors work:
 * `autoplayEntryFor`/`talkEntryFor` walk a node the player is standing in, and `propDialogueFor`
 * discriminates on `propId`, which `validateDialogueFile` already pins to the entry's own node.
 */
type Selectable = (entry: DialogueEntry) => boolean;

const SELECTABLE: Selectable = (e) =>
  BATTLE_KINDS.includes(e.kind)
    ? BATTLE_PAIRS.has(`${e.speaker}|${e.node}`)
    : SELECTABLE_KINDS.has(e.kind);

/** A battle beat a selector CAN ask for. The mirror of {@link SELECTABLE}: calls, not entries. */
interface BattleBeat {
  speaker: string;
  node: string;
  kind: DialogueKind;
}

/**
 * Every battle beat the game can request that the corpus has no entry for.
 *
 * Both other gates enumerate `DIALOGUE.entries` and report entries with no selector. NOTHING
 * enumerated the other direction — a SELECTOR CALL WITH NO ENTRY — and that direction is where the
 * finale broke: `playBattleOutcome` on a lost fight at the Sanctum resolves to `undefined` and the
 * player gets `flashBanner("greaves — no battle-loss at sanctum")`, the same channel as
 * "dialogue refused: …", at the most-watched moment of the demo.
 */
function unansweredBattleBeats(file: DialogueFile): BattleBeat[] {
  const out: BattleBeat[] = [];
  for (const pair of [...BATTLE_PAIRS].sort()) {
    const [speaker = "", node = ""] = pair.split("|");
    for (const kind of BATTLE_KINDS) {
      const found = file.entries.some((e) => e.kind === kind && e.speaker === speaker && e.node === node);
      if (!found) out.push({ speaker, node, kind });
    }
  }
  return out;
}

function deadKinds(selectable: ReadonlySet<string>): { kind: DialogueKind; entries: number; lines: number }[] {
  const out: { kind: DialogueKind; entries: number; lines: number }[] = [];
  for (const kind of DIALOGUE_KINDS) {
    if (selectable.has(kind)) continue;
    const entries = DIALOGUE.entries.filter((e) => e.kind === kind);
    out.push({ kind, entries: entries.length, lines: entries.reduce((n, e) => n + e.lines.length, 0) });
  }
  return out;
}

describe("GATE 1b — every dialogue kind has a selector in game/", () => {
  it("the prop selector is proven by a real call, not asserted", () => {
    expect(kindsProvenByPropSelector().size).toBeGreaterThan(0);
    expect(kindsProvenByPropSelector().has("prop")).toBe(true);
  });

  it("no kind in DIALOGUE_KINDS is unselectable", () => {
    const dead = deadKinds(SELECTABLE_KINDS);
    const message = [
      `${String(dead.length)} dialogue kind(s) in core/dialogue-schema.ts DIALOGUE_KINDS have NO`,
      "selector in game/ — nothing can ever ask the corpus for one, so every entry of that kind is",
      "authored copy the player cannot reach:",
      ...dead.map((d) => `  • ${d.kind} — ${String(d.entries)} entries, ${String(d.lines)} lines`),
      "",
      "AUTOPLAY_KINDS, BATTLE_KINDS and TALK_KINDS (game/dialogue-runner.ts) are the kind lists the",
      "selectors walk; propDialogueFor covers `prop` by propId. A kind in none of them is dead by",
      "construction. NOTE this is the WEAK half: a kind being selectable does not make an entry of",
      "that kind selectable — see SELECTABLE and GATE 1e.",
    ].join("\n");
    expect(dead.length === 0 || message).toBe(true);
  });

  /**
   * The textual half, and why `prop` is not required to appear.
   *
   * A selector has to name the kind it wants SOMEWHERE in live code — except `prop`, which
   * `propDialogueFor` reaches structurally through `propId` and never by kind. So a kind counts as
   * selectable here if it is named in live `game/` source OR the real prop selector was seen
   * returning it above. Anything in neither is a kind no code path can request.
   */
  it("corroborated textually — every kind is named in live code under game/, or reached by propId", () => {
    const reachable = new Set<string>([...kindsNamedInGame(), ...kindsProvenByPropSelector()]);
    const missing = DIALOGUE_KINDS.filter((k) => !reachable.has(k));
    expect(missing.length === 0 || `kinds never named in live game/ source: ${missing.join(", ")}`).toBe(true);
  });

  it("BINDS — removing a kind from the selector set is reported with its entry and line count", () => {
    const crippled = new Set([...SELECTABLE_KINDS].filter((k) => k !== "greeting"));
    const dead = deadKinds(crippled);
    expect(dead.map((d) => d.kind)).toContain("greeting");
    expect(dead.find((d) => d.kind === "greeting")?.entries).toBeGreaterThan(0);
  });

  /**
   * BINDS the union to the shipped selector lists rather than to a count.
   *
   * `BATTLE_KINDS` was added to `game/dialogue-runner.ts` and this census was not told, which is how
   * the gate spent a whole wave reporting the finale's own two cutscenes as dead. The union is
   * hand-assembled — there is no way around that, a selector surface is a fact about code — so what
   * is bound here is that every list feeding it is non-empty and that DIALOGUE_KINDS has no member
   * outside their union. A fourth selector surface added without touching this line still fails
   * "no kind in DIALOGUE_KINDS is unselectable" above; this one catches the reverse mistake of a
   * list being emptied.
   */
  it("BINDS — every exported selector kind list is real and non-empty", () => {
    for (const [name, list] of [
      ["AUTOPLAY_KINDS", AUTOPLAY_KINDS],
      ["BATTLE_KINDS", BATTLE_KINDS],
      ["TALK_KINDS", TALK_KINDS],
    ] as const) {
      expect(list.length, `${name} is empty`).toBeGreaterThan(0);
      for (const k of list) expect(DIALOGUE_KINDS, `${name} names a non-kind`).toContain(k);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 4b. GATE 1e — every SELECTOR CALL the game can make has an entry to answer it
 * ════════════════════════════════════════════════════════════════════════════ */

describe("GATE 1e — a selector call with no entry is a hole too", () => {
  /**
   * THE MIRROR OF EVERY OTHER GATE IN THIS FILE, and the direction none of them looked.
   *
   * 1a/1b/1c all start from `DIALOGUE.entries` and ask "can this be reached". That can only ever
   * find authored copy with no caller. It is structurally incapable of finding the opposite — a
   * CALLER WITH NO COPY — and that is what shipped: `battleEntryFor("greaves", "sanctum",
   * "battle-loss", …)` returns `undefined`, so losing the run's final fight answers the player with
   * `flashBanner("greaves — no battle-loss at sanctum")` on the never-cut finale beat. Eleven of
   * the twelve fighters have all three kinds; nothing noticed the twelfth.
   *
   * `tests/unit/battle-dialogue.test.ts` asserts the same coverage from the corpus side. Both are
   * kept: that one is the content lane's, this one is the selector-domain proof.
   */
  it("every (fighter, node) a battle selector can be called with answers all three battle kinds", () => {
    const missing = unansweredBattleBeats(DIALOGUE);
    const message = [
      `${String(missing.length)} battle beat(s) the game can ASK FOR have no entry in the corpus.`,
      "battleEntryFor is a strict (speaker, node, kind) match with no fallback, so each of these",
      "resolves to undefined and the player is answered with OverworldScene's diagnostic banner",
      '`<speaker> — no <kind> at <node>` — the same channel as "dialogue refused: …":',
      ...missing.map((m) => `  • ${m.speaker} at ${m.node} — no ${m.kind}`),
    ].join("\n");
    expect(missing.length === 0 || message).toBe(true);
  });

  it("the pair set is derived from content and covers every gym and every rival act", () => {
    expect(BATTLE_PAIRS.size).toBe(content.gyms.length + content.rival.length);
    for (const g of content.gyms) expect(BATTLE_PAIRS.has(`${g.id}|${g.town}`)).toBe(true);
    for (const r of content.rival) expect(BATTLE_PAIRS.has(`${r.id}|${r.node}`)).toBe(true);
  });

  it("BINDS — deleting a shipped battle entry is reported as an unanswered beat", () => {
    const victim = DIALOGUE.entries.find((e) => e.kind === "battle-pre");
    expect(victim).toBeDefined();
    const without: DialogueFile = {
      speakers: DIALOGUE.speakers,
      entries: DIALOGUE.entries.filter((e) => e.id !== victim!.id),
    };
    const missing = unansweredBattleBeats(without);
    expect(missing.some((m) => m.speaker === victim!.speaker && m.node === victim!.node)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 5. GATE 1c — every entry is reachable
 * ════════════════════════════════════════════════════════════════════════════ */

const truthy = (v: FlagValue): boolean => v !== false;
const lineCount = (entries: readonly DialogueEntry[]): number =>
  entries.reduce((n, e) => n + e.lines.length, 0);

/**
 * A VALUE-AWARE fixpoint over what a player can actually hold, seeded ONLY with what something
 * outside the corpus writes.
 *
 * The difference from `tests/unit/dialogue.test.ts`'s fixpoint is the seed. That one grants a
 * hand-maintained `EXTERNAL_FLAGS` list for free, which is precisely the assumption that let
 * `story.vellsire.resolved` be treated as somebody else's problem for the whole project. Here the
 * seed is the measured census, and a flag written only by an UNREACHABLE entry never enters the
 * closure — so a beat behind a dead battle line is reported dead too, which is how the Vellsire
 * approach cutscene and Maren's finale are actually reached (or not).
 */
function reachableEntries(
  file: DialogueFile,
  selectable: Selectable,
  seed: Seed,
): Set<string> {
  const acquired = new Set<string>();
  for (const [flag] of requiredFlags(file)) {
    const values = seed(flag);
    if (values === null) continue;
    acquired.add(flag);
    // `=*` is granted ONLY where the seed proved the key exists without proving a value; where the
    // writer was DRIVEN, the exact values it produced are seeded and nothing else is admitted.
    if (values === "any") acquired.add(`${flag}=*`);
    else for (const v of values) acquired.add(`${flag}=${v}`);
  }
  const satisfies = (key: string, value: FlagValue): boolean =>
    acquired.has(`${key}=${String(value)}`) || acquired.has(`${key}=*`);

  const alive = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of file.entries) {
      if (alive.has(e.id)) continue;
      if (!selectable(e)) continue;
      if (!(e.when?.flagsSet ?? []).every((k) => acquired.has(k))) continue;
      if (!(e.when?.flagEquals ?? []).every((fe) => satisfies(fe.key, fe.value))) continue;
      alive.add(e.id);
      changed = true;
      const bags = [e.setFlags ?? {}, ...(e.choices ?? []).map((c) => c.setFlags ?? {})];
      for (const bag of bags) {
        for (const [k, v] of Object.entries(bag)) {
          if (!truthy(v)) continue;
          if (!acquired.has(k)) {
            acquired.add(k);
            changed = true;
          }
          const token = `${k}=${String(v)}`;
          if (!acquired.has(token)) {
            acquired.add(token);
            changed = true;
          }
        }
      }
    }
  }
  return alive;
}

/** A `when` that can never hold, whatever the player does. */
function contradictionIn(e: DialogueEntry): string | null {
  const w = e.when;
  if (w === undefined) return null;
  const set = new Set(w.flagsSet ?? []);
  const unset = new Set(w.flagsUnset ?? []);
  for (const k of set) if (unset.has(k)) return `requires and forbids the same flag "${k}"`;
  const equals = new Map<string, FlagValue>();
  for (const fe of w.flagEquals ?? []) {
    if (unset.has(fe.key)) return `forbids "${fe.key}" while requiring it to equal ${String(fe.value)}`;
    const seen = equals.get(fe.key);
    if (seen !== undefined && seen !== fe.value) {
      return `requires "${fe.key}" to equal both ${String(seen)} and ${String(fe.value)}`;
    }
    equals.set(fe.key, fe.value);
  }
  const acts = w.act;
  if (acts !== undefined && !acts.some((a) => a >= FIRST_ACT && a <= LAST_ACT)) {
    return `act list ${JSON.stringify(acts)} is entirely outside the ladder ${String(FIRST_ACT)}..${String(LAST_ACT)}`;
  }
  if (w.actMin !== undefined && w.actMin > LAST_ACT) {
    return `actMin ${String(w.actMin)} is above the last act ${String(LAST_ACT)}`;
  }
  if (w.actMax !== undefined && w.actMax < FIRST_ACT) {
    return `actMax ${String(w.actMax)} is below the first act ${String(FIRST_ACT)}`;
  }
  const ceiling = w.actMax ?? (acts !== undefined ? Math.max(...acts) : undefined);
  if (ceiling !== undefined) {
    for (const k of [...set, ...equals.keys()]) {
      const floor = ACT_FLOOR.get(k);
      if (floor !== undefined && floor > ceiling) {
        return `requires "${k}", which cannot be written before act ${String(floor)}, but closes at act ${String(ceiling)}`;
      }
    }
  }
  return null;
}

/**
 * The earliest act each corpus-written flag can be written in.
 *
 * A monotone fixpoint: a flag's floor is the cheapest of its writers, and a writer costs the higher
 * of its own act floor and the floors of everything it requires. Code-written flags carry no act
 * cost and are absent from the map. Used only to catch an entry that closes (an `actMax` / exact
 * `act`) before a flag it requires can exist.
 */
const ACT_FLOOR: ReadonlyMap<string, number> = (() => {
  const entryFloor = (e: DialogueEntry): number =>
    e.when?.act !== undefined ? Math.min(...e.when.act) : (e.when?.actMin ?? FIRST_ACT);
  const writers = new Map<string, DialogueEntry[]>();
  for (const e of DIALOGUE.entries) {
    const bags = [e.setFlags ?? {}, ...(e.choices ?? []).map((c) => c.setFlags ?? {})];
    for (const bag of bags) {
      for (const [k, v] of Object.entries(bag)) {
        if (!truthy(v)) continue;
        const list = writers.get(k);
        if (list) list.push(e);
        else writers.set(k, [e]);
      }
    }
  }
  const floor = new Map<string, number>();
  for (const k of writers.keys()) floor.set(k, FIRST_ACT);
  for (let pass = 0; pass < DIALOGUE.entries.length + 2; pass += 1) {
    let changed = false;
    for (const [k, ws] of writers) {
      let best = Number.POSITIVE_INFINITY;
      for (const e of ws) {
        let cost = entryFloor(e);
        for (const r of e.when?.flagsSet ?? []) cost = Math.max(cost, floor.get(r) ?? FIRST_ACT);
        for (const fe of e.when?.flagEquals ?? []) cost = Math.max(cost, floor.get(fe.key) ?? FIRST_ACT);
        best = Math.min(best, cost);
      }
      if (best !== floor.get(k)) {
        floor.set(k, best);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return floor;
})();

interface DeadEntry {
  entry: DialogueEntry;
  why: string;
}

function deadEntries(
  file: DialogueFile,
  selectable: Selectable,
  seed: Seed,
): DeadEntry[] {
  const alive = reachableEntries(file, selectable, seed);
  const out: DeadEntry[] = [];
  for (const e of file.entries) {
    const contradiction = contradictionIn(e);
    if (contradiction !== null) {
      out.push({ entry: e, why: `contradiction — ${contradiction}` });
      continue;
    }
    if (alive.has(e.id)) continue;
    if (!selectable(e)) {
      out.push({
        entry: e,
        why: BATTLE_KINDS.includes(e.kind)
          ? `no selector in game/ ever asks "${e.speaker}" for a "${e.kind}" at node "${e.node}" — ` +
            "battleEntryFor is only ever called with a gyms[]/rival[] (id, node) pair"
          : `no selector in game/ ever asks for kind "${e.kind}"`,
      });
      continue;
    }
    const blocking = [
      ...(e.when?.flagsSet ?? []),
      ...(e.when?.flagEquals ?? []).map((fe) => fe.key),
    ].filter((k) => seed(k) === null && !reachableWrites(file, selectable, seed).has(k));
    out.push({
      entry: e,
      why:
        blocking.length > 0
          ? `gated on flag(s) no reachable writer produces: ${[...new Set(blocking)].sort().join(", ")}`
          : "gated on a value no reachable writer produces",
    });
  }
  return out;
}

/** Every flag a REACHABLE entry writes — the closure's own output, for the failure message. */
function reachableWrites(
  file: DialogueFile,
  selectable: Selectable,
  seed: Seed,
): Set<string> {
  const alive = reachableEntries(file, selectable, seed);
  const out = new Set<string>();
  for (const e of file.entries) {
    if (!alive.has(e.id)) continue;
    const bags = [e.setFlags ?? {}, ...(e.choices ?? []).map((c) => c.setFlags ?? {})];
    for (const bag of bags) for (const [k, v] of Object.entries(bag)) if (truthy(v)) out.add(k);
  }
  return out;
}

/** GATE 1d — the failure NAMES the dead entries. A count is not a bug report. */
function formatDead(dead: readonly DeadEntry[], total: readonly DialogueEntry[]): string {
  const byReason = new Map<string, DeadEntry[]>();
  for (const d of dead) {
    const list = byReason.get(d.why);
    if (list) list.push(d);
    else byReason.set(d.why, [d]);
  }
  const head =
    `${String(dead.length)} of ${String(total.length)} entries and ` +
    `${String(lineCount(dead.map((d) => d.entry)))} of ${String(lineCount(total))} lines are ` +
    "UNREACHABLE in the shipped build.";
  const body = [...byReason]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([why, list]) => {
      const rows = [...list]
        .sort((a, b) => a.entry.id.localeCompare(b.entry.id))
        .map((d) => `      ${d.entry.id}  (${d.entry.kind}, ${String(d.entry.lines.length)} lines)`);
      return `  ${why}\n    ${String(list.length)} entries, ${String(lineCount(list.map((d) => d.entry)))} lines:\n${rows.join("\n")}`;
    })
    .join("\n\n");
  return `${head}\n\n${body}`;
}

describe("GATE 1c/1d — every authored entry has a path to the screen", () => {
  it("names every unreachable entry, its kind, its line count and why", () => {
    const dead = deadEntries(DIALOGUE, SELECTABLE, codeSeed);
    expect(dead.length === 0 || formatDead(dead, DIALOGUE.entries)).toBe(true);
  });

  it("BINDS — an entry gated on a flag nothing writes is named in the failure message", () => {
    const sabotaged = withEntries(DIALOGUE, [
      bogusEntry({ id: "gate.sabotage.dead", when: { flagsSet: ["gate.sabotage.nobody-writes-this"] } }),
    ]);
    const dead = deadEntries(sabotaged, SELECTABLE, codeSeed);
    expect(dead.map((d) => d.entry.id)).toContain("gate.sabotage.dead");
    expect(formatDead(dead, sabotaged.entries)).toContain("gate.sabotage.dead");
  });

  it("BINDS — a self-blocking condition is caught even though its flag has a writer", () => {
    const sabotaged = withEntries(DIALOGUE, [
      bogusEntry({
        id: "gate.sabotage.contradiction",
        when: { flagsSet: ["story.opening.done"], flagsUnset: ["story.opening.done"] },
      }),
    ]);
    const dead = deadEntries(sabotaged, SELECTABLE, codeSeed);
    const found = dead.find((d) => d.entry.id === "gate.sabotage.contradiction");
    expect(found?.why).toContain("requires and forbids");
  });

  it("BINDS — an entry that closes before its own prerequisite can exist is caught", () => {
    // `story.greaves.entered` cannot be written in the prologue; an entry that closes at act 0
    // while requiring it can never hold.
    const sabotaged = withEntries(DIALOGUE, [
      bogusEntry({
        id: "gate.sabotage.tooearly",
        when: { flagsSet: ["chain.vellsire.step7"], actMax: FIRST_ACT },
      }),
    ]);
    const dead = deadEntries(sabotaged, SELECTABLE, codeSeed);
    const found = dead.find((d) => d.entry.id === "gate.sabotage.tooearly");
    expect(found?.why).toContain("cannot be written before act");
  });

  it("BINDS — a live entry is NOT reported dead", () => {
    const dead = deadEntries(DIALOGUE, SELECTABLE, codeSeed);
    // The opening chain is the one thing every save reaches from a standing start.
    expect(dead.map((d) => d.entry.id)).not.toContain("maren.opening");
  });

  /**
   * BINDS the (speaker, node, kind) model — the defect a bare `...BATTLE_KINDS` would have left.
   *
   * `maren` is a real speaker and `hearthollow` a real node, so a `battle-pre` on that pair is a
   * legal entry that validates. Nothing in `game/` ever calls
   * `battleEntryFor(DIALOGUE, "maren", "hearthollow", …)`, because the only arguments those three
   * call sites pass are gyms[]/rival[] rows. Under the kind-only model this entry was certified
   * REACHABLE — measured, not supposed.
   */
  it("BINDS — a battle entry on a pair no selector ever passes is reported dead", () => {
    const sabotaged = withEntries(DIALOGUE, [
      bogusEntry({
        id: "gate.sabotage.battle-orphan",
        kind: "battle-pre",
        speaker: "maren",
        node: "hearthollow",
      }),
    ]);
    expect(BATTLE_PAIRS.has("maren|hearthollow")).toBe(false);
    const dead = deadEntries(sabotaged, SELECTABLE, codeSeed);
    const found = dead.find((d) => d.entry.id === "gate.sabotage.battle-orphan");
    expect(found?.why).toContain("battleEntryFor is only ever called with");
  });

  it("BINDS — and a battle entry on a REAL fighter pair is not", () => {
    const gym = content.gyms[0];
    expect(gym).toBeDefined();
    const sabotaged = withEntries(DIALOGUE, [
      bogusEntry({
        id: "gate.sabotage.battle-real",
        kind: "battle-pre",
        speaker: gym!.id,
        node: gym!.town,
      }),
    ]);
    const dead = deadEntries(sabotaged, SELECTABLE, codeSeed);
    expect(dead.map((d) => d.entry.id)).not.toContain("gate.sabotage.battle-real");
  });

  /**
   * BINDS the value arm of the seed — the `flag=*` wildcard that made `flagEquals` decorative.
   *
   * `"eaten"` is written by nothing in `core/`, `game/`, `tools/` or the corpus. Under the wildcard
   * seed this entry was reported REACHABLE, which means the two shipped `flagEquals` clauses — the
   * ONLY two in the corpus, and both on the never-cut Vellsire epilogue — were unguarded: a
   * one-character typo in either value moved this gate's output by zero entries.
   */
  it("BINDS — an entry gated on a VALUE nothing produces is reported dead", () => {
    const sabotaged = withEntries(DIALOGUE, [
      bogusEntry({
        id: "gate.sabotage.badvalue",
        when: { flagEquals: [{ key: "story.vellsire.outcome", value: "eaten" }] },
      }),
    ]);
    const dead = deadEntries(sabotaged, SELECTABLE, codeSeed);
    expect(dead.map((d) => d.entry.id)).toContain("gate.sabotage.badvalue");
  });

  /**
   * …and the same check on the REAL entry, because a bogus one only proves the machinery runs.
   * This is the shipped epilogue with one character changed in the value it discriminates on.
   */
  it("BINDS — a typo in a shipped epilogue's flagEquals value kills it, and the gate says so", () => {
    const victim = DIALOGUE.entries.find((e) => (e.when?.flagEquals ?? []).length > 0);
    expect(victim, "the corpus has no flagEquals clause to bind").toBeDefined();
    const typoed: DialogueFile = {
      speakers: DIALOGUE.speakers,
      entries: DIALOGUE.entries.map((e) =>
        e.id !== victim!.id
          ? e
          : {
              ...e,
              when: {
                ...e.when,
                flagEquals: (e.when?.flagEquals ?? []).map((fe, i) =>
                  i === 0 ? { ...fe, value: `${String(fe.value)}-typo` } : fe,
                ),
              },
            },
      ),
    };
    const dead = deadEntries(typoed, SELECTABLE, codeSeed);
    expect(dead.map((d) => d.entry.id)).toContain(victim!.id);
    // …and it is NOT dead in the shipped corpus, so the red above is the typo and nothing else.
    expect(deadEntries(DIALOGUE, SELECTABLE, codeSeed).map((d) => d.entry.id)).not.toContain(victim!.id);
  });

  /**
   * BINDS the finale's two values to a DRIVEN writer, not to a literal.
   *
   * If `game/finale.ts` stops writing either terminal state, the OBSERVED expander stops seeing it
   * and the matching epilogue goes dead in the report above. Without this the literal tier would
   * quietly cover for it again.
   */
  it("BINDS — both Vellsire outcomes were OBSERVED landing on a save, not merely mentioned", () => {
    const seen = OBSERVED_VALUES.get("story.vellsire.outcome");
    expect([...(seen ?? [])].sort()).toEqual(["caught", "released"]);
    expect(OBSERVED_WRITERS.get("story.vellsire.resolved")).toContain("game/finale.ts");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Sabotage scaffolding — a corpus copy the analysis functions accept
 * ════════════════════════════════════════════════════════════════════════════ */

function bogusEntry(over: Partial<DialogueEntry> & { id: string }): DialogueEntry {
  const first = DIALOGUE.entries[0];
  if (!first) throw new Error("the shipped corpus is empty");
  return {
    speaker: first.speaker,
    node: first.node,
    kind: "greeting",
    lines: [{ text: "sabotage" }],
    ...over,
  };
}

function withEntries(file: DialogueFile, extra: readonly DialogueEntry[]): DialogueFile {
  return { speakers: file.speakers, entries: [...file.entries, ...extra] };
}

/* ════════════════════════════════════════════════════════════════════════════
 * 7. GATE 1f — a NON-FLAG clause must hold in some world the sim can produce
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ EVERY GATE ABOVE THIS ONE READS ONLY THE FLAG ARMS OF A `when`.
 *
 * `reachableEntries` tests `selectable`, `flagsSet` and `flagEquals`; `contradictionIn` adds flag
 * self-contradiction and the act ladder. `population`, `floraStock`, `seasons`, `years`, `yearMin`
 * and `yearMax` are not looked at ANYWHERE — so a clause that is false in every world state the
 * ecosystem can reach was certified reachable, and `validateDialogueFile` did not object either
 * because it only checked the ids. Measured on the shipped tree: `{node: "hearthollow", lineId:
 * "vellsire-line"}` (a node that has never carried that line), `population gte 999` against a
 * `carryCap` of 1, `yearMin: 9999` and `floraStock gte 100000` were ALL reported reachable.
 *
 * The id-and-bounds half of that is now refused by `validateDialogueFile` (`core/dialogue-schema
 * .ts`), which is where it belongs — a permanently-false clause should not be legal corpus. This
 * gate closes the half a validator cannot see: whether the SIM actually visits a state the clause
 * admits. It answers by running `core/ecosim.ts` `stepRegionStates` over the shipped region and
 * evaluating each clause with the REAL `conditionHolds`, never a re-implementation of `compare`.
 *
 * Two sample sets, because two different things are being asked:
 *
 *   AMBIENT  — the region left alone. Answers "does this fire on its own".
 *   PRESSURE — the region with the player hammering the clause's own lever every season, which is
 *              the CASCADE (build-doc §16 G6, never-cut beat 1). A crash line is SUPPOSED to be
 *              false until the player makes it true, so demanding ambient truth would report every
 *              cascade line dead. The pressure is applied through `core/ecosim.ts` `applyCatch` —
 *              the same function a real catch goes through — never by writing a count.
 */
const SAMPLE_YEARS = balance.clock.yearsTotal * 2;

interface WorldSample {
  year: number;
  season: (typeof SEASONS)[number];
  populations: Record<string, Record<string, number>>;
  floraStock: Record<string, number>;
}

/** `node|line` keys to hammer with a catch every season, or `[]` for the region left alone. */
function sampleRegion(targets: readonly string[]): WorldSample[] {
  const rng = createRng(balance.rng.defaultSeed);
  let nodes = content.nodes.map((f) => toEcoNode(f));
  const out: WorldSample[] = [];
  const snapshot = (year: number, season: (typeof SEASONS)[number]): void => {
    const populations: Record<string, Record<string, number>> = {};
    const floraStock: Record<string, number> = {};
    for (const n of nodes) {
      const counts: Record<string, number> = {};
      for (const [lineId, p] of Object.entries(n.populations)) counts[lineId] = p.count;
      populations[n.id] = counts;
      floraStock[n.id] = n.floraStock;
    }
    out.push({ year, season, populations, floraStock });
  };
  snapshot(FIRST_YEAR, SEASONS[0]);
  for (let y = 0; y < SAMPLE_YEARS; y += 1) {
    for (const season of SEASONS) {
      for (const target of targets) {
        const [nodeId = "", lineId = ""] = target.split("|");
        nodes = nodes.map((n) => {
          if (n.id !== nodeId || n.populations[lineId] === undefined) return n;
          // A season's worth of forays on one line, through the real catch path.
          let hammered = n;
          for (let i = 0; i < 20; i += 1) hammered = applyCatch(hammered, lineId, balance);
          return hammered;
        });
      }
      const states: Record<string, NodeState> = {};
      for (const n of nodes) states[n.id] = toNodeState(n);
      const stepped = stepRegionStates(content.nodes, states, season, rng).states;
      nodes = content.nodes.map((f) => fromNodeState(f, stepped[f.id] as NodeState));
      snapshot(FIRST_YEAR + y, season);
    }
  }
  return out;
}

const AMBIENT_SAMPLES = sampleRegion([]);

/** The non-flag half of a `when`, or null when there is none. */
function worldClauseOf(e: DialogueEntry): DialogueCondition | null {
  const w = e.when;
  if (w === undefined) return null;
  const only = {
    ...(w.population !== undefined ? { population: w.population } : {}),
    ...(w.floraStock !== undefined ? { floraStock: w.floraStock } : {}),
    ...(w.seasons !== undefined ? { seasons: w.seasons } : {}),
    ...(w.years !== undefined ? { years: w.years } : {}),
    ...(w.yearMin !== undefined ? { yearMin: w.yearMin } : {}),
    ...(w.yearMax !== undefined ? { yearMax: w.yearMax } : {}),
  };
  return Object.keys(only).length === 0 ? null : only;
}

/** The levers a clause is about — what a player would hammer to make it true. */
function leversFor(when: DialogueCondition): string[] {
  const out = new Set<string>();
  for (const p of when.population ?? []) {
    if (p.op === "lt" || p.op === "lte") out.add(`${p.node}|${p.lineId}`);
  }
  for (const f of when.floraStock ?? []) {
    if (f.op !== "lt" && f.op !== "lte") continue;
    // Flora falls when GRAZING rises, and grazing rises when what eats the grazers is removed.
    const node = content.nodes.find((n) => n.id === f.node);
    for (const lineId of Object.keys(node?.populations ?? {})) {
      const role = content.species.find((s) => s.id === lineId)?.role;
      const adult = role?.A;
      if (adult === "Mesopredator" || adult === "Apex") out.add(`${f.node}|${lineId}`);
    }
  }
  return [...out].sort();
}

/** True when the clause holds in at least one of `samples`, judged by the REAL evaluator. */
function holdsSomewhere(when: DialogueCondition, samples: readonly WorldSample[]): boolean {
  return samples.some((s) =>
    conditionHolds(when, {
      act: LAST_ACT,
      year: s.year,
      season: s.season,
      flags: {},
      populations: s.populations,
      floraStock: s.floraStock,
    }),
  );
}

/**
 * Clauses no sampled world satisfies — ambient OR under pressure — each with what was MEASURED.
 *
 * A name here is a decision, not a shrug: the clause is dead corpus under the shipped balance and
 * the row says why. Logged in `docs/DEVIATIONS.md`.
 */
const UNPROVEN_WORLD_CLAUSES: readonly string[] = [
  // r1's flora is monotonically non-decreasing under the shipped numbers, so no "thin" reading of
  // Meadow Reach can ever be true. Grazing draw is `predationDraw (0.1) × grazers / 2.0` flora
  // points per season against `floraRegenPerSeason: 8`; r1's grazer carryCaps total 72, so the
  // maximum possible draw is 3.6 against a regen of 8. Measured with every grazer pinned at
  // carryCap, every predator removed and the producer zeroed, over 20 in-game years: flora never
  // left [78, 100]. Fixing it is a balance change (`floraRegenPerSeason` or r1's grazer caps),
  // which is a difficulty change and needs `npm run harness` — not a corpus edit. DEVIATIONS D-W3-1.
  "amb.hearthollow-elder.thin",
];

describe("GATE 1f — a population / flora / season / year clause must be satisfiable", () => {
  it("the sampler moves the real region rather than asserting over a frozen one", () => {
    expect(AMBIENT_SAMPLES.length).toBeGreaterThan(SAMPLE_YEARS);
    const first = AMBIENT_SAMPLES[0];
    const last = AMBIENT_SAMPLES[AMBIENT_SAMPLES.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    expect(JSON.stringify(last?.populations)).not.toEqual(JSON.stringify(first?.populations));
  });

  it("pressure through the real applyCatch can empty a line the ambient region keeps full", () => {
    // The cascade's own lever, proven to work before any clause is judged against it.
    const [node, line] = ["r4", "stonewing-line"];
    const ambientMin = Math.min(...AMBIENT_SAMPLES.map((s) => s.populations[node]?.[line] ?? 0));
    const pressed = sampleRegion([`${node}|${line}`]);
    const pressedMin = Math.min(...pressed.map((s) => s.populations[node]?.[line] ?? 0));
    expect(ambientMin).toBeGreaterThan(0);
    expect(pressedMin).toBe(0);
  });

  it("every shipped non-flag clause holds in some world the sim can produce", () => {
    const unproven: string[] = [];
    for (const e of DIALOGUE.entries) {
      const when = worldClauseOf(e);
      if (when === null) continue;
      if (holdsSomewhere(when, AMBIENT_SAMPLES)) continue;
      const levers = leversFor(when);
      if (levers.length > 0 && holdsSomewhere(when, sampleRegion(levers))) continue;
      unproven.push(e.id);
    }
    expect(unproven.sort()).toEqual([...UNPROVEN_WORLD_CLAUSES].sort());
  });

  it("BINDS — a clause the region can never satisfy is reported", () => {
    // A count above every carryCap in the region. `validateDialogueFile` refuses this shape now;
    // this proves the SAMPLER would catch it even if a future content set made it legal.
    const impossible = { population: [{ node: "r1", lineId: "nibbin-line", op: "gte" as const, value: 9999 }] };
    expect(holdsSomewhere(impossible, AMBIENT_SAMPLES)).toBe(false);
    expect(holdsSomewhere(impossible, sampleRegion(leversFor(impossible)))).toBe(false);
  });

  it("BINDS — and a clause the shipped region DOES satisfy is not reported", () => {
    const live = DIALOGUE.entries.find((e) => e.id === "sanctum.vellsire.approach");
    expect(live, "the finale's approach cutscene is missing").toBeDefined();
    const when = worldClauseOf(live!);
    expect(when).not.toBeNull();
    expect(holdsSomewhere(when!, AMBIENT_SAMPLES)).toBe(true);
  });
});
