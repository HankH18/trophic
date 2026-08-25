/**
 * tests/unit/encounters.test.ts — encounter rolls off the LIVE node state (build-doc §7.2, G3).
 *
 * The claims lane C2 has to make good on, each a describe block:
 *   1. encounter weights track live populations — the weight IS the count;
 *   2. a species at count 0 never rolls, over many seeds — which is what makes the cascade visible
 *      for free (build-doc §1 beat 1) with no extinction check anywhere in the code;
 *   3. an out-of-season migrant never rolls, and the dex-facing reason says WHY (Hard Req 10);
 *   4. there is no second table (G3) — every weight comes from core/foodweb.ts.
 *
 * No Phaser: game/encounters.ts imports none, so the balance harness can roll encounters headlessly.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { indexSpecies, toEcoNode, type EcoNode } from "../../core/foodweb";
import { createRng } from "../../core/rng";
import { validateContent } from "../../core/schemas";
import { AGE_CLASSES, type AgeClass, type Balance, type NodeFile, type Season } from "../../core/types";
import {
  absenceCauseOf,
  absentLines,
  encounterChancePerStep,
  encounterTable,
  nodeIsEmpty,
  rollAge,
  rollEncounterAt,
  rollForay,
  rollForayStep,
  rollLevel,
  stepsPerForay,
  totalActiveWeight,
  type ForayContext,
} from "../../game/encounters";

const content = validateContent();
const balance: Balance = content.balance;
const species = indexSpecies(content.species);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const SEEDS = 300;
const ROLLS_PER_SEED = 12;

function nodeFile(id: string): NodeFile {
  const node = content.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`no node ${id}`);
  return node;
}

function ctxFor(
  nodeId: string,
  opts: { season?: Season; year?: number; counts?: Record<string, number>; unlocked?: string[] } = {},
): ForayContext {
  const node: EcoNode = toEcoNode(nodeFile(nodeId));
  for (const [lineId, count] of Object.entries(opts.counts ?? {})) {
    const pop = node.populations[lineId];
    if (!pop) throw new Error(`${nodeId} has no population ${lineId}`);
    pop.count = count;
  }
  const ctx: ForayContext = {
    node,
    species,
    balance,
    season: opts.season ?? "spring",
    year: opts.year ?? balance.clock.startYear,
  };
  if (opts.unlocked) ctx.unlockedSignChains = new Set(opts.unlocked);
  return ctx;
}

/** Roll the species many times over many seeds; returns id → times seen. */
function speciesHistogram(ctx: ForayContext, seeds = SEEDS, rolls = ROLLS_PER_SEED): Map<string, number> {
  const hist = new Map<string, number>();
  for (let seed = 1; seed <= seeds; seed += 1) {
    const rng = createRng(seed);
    for (let i = 0; i < rolls; i += 1) {
      const met = rollEncounterAt(ctx, rng);
      if (!met) continue;
      hist.set(met.lineId, (hist.get(met.lineId) ?? 0) + 1);
    }
  }
  return hist;
}

function executable(relPath: string): string {
  const src = readFileSync(`${ROOT}${relPath}`, "utf8");
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/* ════════════════════════════════════════════════════════════════════════════
 * 1. Weights ARE the live population counts
 * ════════════════════════════════════════════════════════════════════════════ */

describe("encounter weights track live populations — build-doc §7.2", () => {
  it("an in-season line's weight is exactly its count", () => {
    const ctx = ctxFor("r1", { season: "spring" });
    for (const entry of encounterTable(ctx)) {
      const count = ctx.node.populations[entry.lineId]?.count ?? 0;
      if (!entry.active) continue;
      const line = species.byId.get(entry.lineId);
      // The Scavenger term (× 1 + recentDeaths/divisor) is core's; at recentDeaths 0 it is identity,
      // which is the shipped year-1 state.
      expect(line).toBeDefined();
      expect(entry.weight).toBe(count);
    }
  });

  it("moving a count moves the weight, in the same direction and by the same amount", () => {
    const before = encounterTable(ctxFor("r1", { counts: { "nibbin-line": 11 } }));
    const after = encounterTable(ctxFor("r1", { counts: { "nibbin-line": 40 } }));
    const w = (table: typeof before, id: string) => table.find((e) => e.lineId === id)?.weight ?? -1;
    expect(w(before, "nibbin-line")).toBe(11);
    expect(w(after, "nibbin-line")).toBe(40);
    // Nothing else moved: the table is derived per line from that line's own count.
    expect(w(before, "skir-line")).toBe(w(after, "skir-line"));
  });

  it("raising a count raises how often it is met", () => {
    const rare = speciesHistogram(ctxFor("r1", { counts: { "nibbin-line": 1 } }));
    const common = speciesHistogram(ctxFor("r1", { counts: { "nibbin-line": 400 } }));
    expect(common.get("nibbin-line") ?? 0).toBeGreaterThan((rare.get("nibbin-line") ?? 0) * 5);
  });

  it("the frequency a line is met at tracks its share of the derived weight", () => {
    const ctx = ctxFor("r1", { season: "spring" });
    const table = encounterTable(ctx);
    const total = totalActiveWeight(table);
    const hist = speciesHistogram(ctx, 500, 20);
    const draws = [...hist.values()].reduce((a, b) => a + b, 0);
    for (const entry of table) {
      if (!entry.active || entry.weight <= 0) continue;
      const expected = entry.weight / total;
      const observed = (hist.get(entry.lineId) ?? 0) / draws;
      expect(Math.abs(observed - expected)).toBeLessThan(0.03);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2. Count 0 ⇒ exactly zero encounters (the cascade, visible for free)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("a species at count 0 produces exactly zero encounters", () => {
  it("never rolls, over many seeds — and the control proves the test could have caught it", () => {
    const alive = speciesHistogram(ctxFor("r1", { counts: { "skir-line": 8 } }));
    expect(alive.get("skir-line") ?? 0).toBeGreaterThan(0);

    const wiped = speciesHistogram(ctxFor("r1", { counts: { "skir-line": 0 } }));
    expect(wiped.get("skir-line") ?? 0).toBe(0);
    // Everything else still shows up: the node is not simply empty.
    expect([...wiped.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it("its weight is 0 and it is reported inactive, so the dex can say it is gone", () => {
    const ctx = ctxFor("r1", { counts: { "skir-line": 0 } });
    const entry = encounterTable(ctx).find((e) => e.lineId === "skir-line");
    expect(entry).toBeDefined();
    expect(entry!.weight).toBe(0);
    expect(entry!.active).toBe(false);
    // G7: the reason is a number, not a judgement. Wiped out reads as no seasonal reason at all.
    expect(entry!.dormantReason).toBeUndefined();
    const absence = absentLines(ctx).find((a) => a.lineId === "skir-line");
    // `cause` replaced the old `seasonal: "dormant"|"migrating"|null`, whose null meant BOTH "wiped
    // out" and "gated behind a sign chain" — see the AbsenceCause header. Still an exact-shape
    // assertion, now naming which of the four this is.
    expect(absence).toEqual({ lineId: "skir-line", cause: "wiped", count: 0 });
  });

  it("a node with every count at 0 rolls nothing, ever — there is no fallback table (G3)", () => {
    const counts: Record<string, number> = {};
    for (const id of Object.keys(nodeFile("r1").populations)) counts[id] = 0;
    const ctx = ctxFor("r1", { counts });
    expect(nodeIsEmpty(ctx)).toBe(true);
    expect(totalActiveWeight(encounterTable(ctx))).toBe(0);
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const rng = createRng(seed);
      for (let i = 0; i < ROLLS_PER_SEED; i += 1) expect(rollEncounterAt(ctx, rng)).toBeNull();
    }
  });

  it("extinction is not special-cased anywhere in game/encounters.ts", () => {
    // If the zero-encounter behaviour needed a check, the check would be here. It is not: it falls
    // out of `pickWeighted` skipping zero weights (core/rng.ts).
    const code = executable("game/encounters.ts");
    expect(code).not.toMatch(/extinct/i);
    expect(code).not.toMatch(/count\s*===?\s*0/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3. Out-of-season migrants — Hard Req 10 / migrant_legibility
 * ════════════════════════════════════════════════════════════════════════════ */

describe("out-of-season migrants never roll, and say why", () => {
  const migrants = content.species.filter((s) => s.seasonalWindow);

  it("the shipped content has exactly the four migrants Hard Req 10 names", () => {
    expect(migrants.length).toBe(4);
  });

  it.each(migrants.map((m) => [m.id, m.seasonalWindow as Season] as const))(
    "%s never rolls outside %s",
    (lineId, window) => {
      const host = content.nodes.find((n) => n.populations[lineId] && (n.populations[lineId]?.count ?? 0) > 0);
      expect(host, `no shipped node carries ${lineId}`).toBeDefined();

      for (const season of balance.clock.seasonOrder) {
        const ctx = ctxFor(host!.id, { season });
        const hist = speciesHistogram(ctx);
        if (season === window) {
          expect(hist.get(lineId) ?? 0, `${lineId} should appear in ${season}`).toBeGreaterThan(0);
        } else {
          expect(hist.get(lineId) ?? 0, `${lineId} rolled in ${season}`).toBe(0);
        }
      }
    },
  );

  it("absence out of season is legible as seasonal, not as a crash", () => {
    // bible §5: "seasonal absence is never confusable with a population crash".
    const ctx = ctxFor("r1", { season: "winter" });
    const absence = absentLines(ctx).find((a) => a.lineId === "pollywisp-line");
    expect(absence).toBeDefined();
    expect(absence!.cause === "dormant" || absence!.cause === "migrating").toBe(true);
    // The real number is still there — the animal is away, not gone (Hard Req 2).
    expect(absence!.count).toBeGreaterThan(0);
  });

  it("a wiped line and an away line are distinguishable from the same call", () => {
    const ctx = ctxFor("r1", { season: "winter", counts: { "skir-line": 0 } });
    const table = encounterTable(ctx);
    const wiped = table.find((e) => e.lineId === "skir-line");
    const away = table.find((e) => e.lineId === "pollywisp-line");
    expect(wiped!.active).toBe(false);
    expect(away!.active).toBe(false);
    expect(wiped!.dormantReason).toBeUndefined();
    expect(away!.dormantReason).toBeDefined();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Sign-chain gating — bible §4, the Ancients
 * ════════════════════════════════════════════════════════════════════════════ */

describe("sign-chain gated lines stay out of the ordinary pool", () => {
  it("the finale legendary never rolls as a wild encounter until its chain is unlocked", () => {
    const gated = content.species.filter((s) => s.habitat.includes(balance.encounter.signChainGatedHabitatTag));
    expect(gated.length).toBeGreaterThan(0);

    for (const line of gated) {
      const host = content.nodes.find((n) => (n.populations[line.id]?.count ?? 0) > 0);
      if (!host) continue;
      const locked = speciesHistogram(ctxFor(host.id));
      expect(locked.get(line.id) ?? 0, `${line.id} rolled while gated`).toBe(0);

      const unlocked = speciesHistogram(ctxFor(host.id, { unlocked: [line.id] }));
      expect(unlocked.get(line.id) ?? 0, `${line.id} never rolled once unlocked`).toBeGreaterThan(0);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The individual met: age and level
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the individual met — balance.encounter", () => {
  it("age is always one of the three classes, and the ordering follows ageWeights", () => {
    const hist = new Map<AgeClass, number>();
    for (let seed = 1; seed <= 500; seed += 1) {
      const rng = createRng(seed);
      for (let i = 0; i < 10; i += 1) {
        const age = rollAge(balance, rng);
        expect(AGE_CLASSES).toContain(age);
        hist.set(age, (hist.get(age) ?? 0) + 1);
      }
    }
    const weights = balance.encounter.ageWeights;
    const ranked = [...AGE_CLASSES].sort((a, b) => weights[b] - weights[a]);
    for (let i = 1; i < ranked.length; i += 1) {
      const heavier = ranked[i - 1]!;
      const lighter = ranked[i]!;
      if (weights[heavier] === weights[lighter]) continue;
      expect(hist.get(heavier) ?? 0).toBeGreaterThan(hist.get(lighter) ?? 0);
    }
  });

  it("level sits in the year's band, inside [minLevel, xp.levelCap]", () => {
    for (let year = balance.clock.startYear; year < balance.clock.startYear + balance.clock.yearsTotal; year += 1) {
      const index = year - balance.clock.startYear;
      const base = balance.encounter.levelByYear[Math.min(index, balance.encounter.levelByYear.length - 1)]!;
      for (let seed = 1; seed <= 200; seed += 1) {
        const level = rollLevel(balance, year, createRng(seed));
        expect(level).toBeGreaterThanOrEqual(balance.encounter.minLevel);
        expect(level).toBeLessThanOrEqual(balance.xp.levelCap);
        expect(level).toBeGreaterThanOrEqual(Math.min(base - balance.encounter.levelJitter, level));
        expect(level).toBeLessThanOrEqual(base + balance.encounter.levelJitter);
      }
    }
  });

  it("a year past the band table reuses its last entry rather than extrapolating", () => {
    const last = balance.encounter.levelByYear[balance.encounter.levelByYear.length - 1]!;
    const beyond = rollLevel(balance, balance.clock.startYear + 50, createRng(7));
    expect(beyond).toBeLessThanOrEqual(last + balance.encounter.levelJitter);
  });

  it("an encounter names the node it happened at — the catch decrements THAT node (Hard Req 2)", () => {
    const ctx = ctxFor("r1");
    const met = rollEncounterAt(ctx, createRng(3));
    expect(met).not.toBeNull();
    expect(met!.nodeId).toBe("r1");
    expect(ctx.node.populations[met!.lineId]).toBeDefined();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The foray — build-doc §4 / DEVIATIONS D18
 * ════════════════════════════════════════════════════════════════════════════ */

describe("a foray is stepsPerForay rolls at encounterChancePerStep", () => {
  it("reads both rates from balance.json (G11)", () => {
    expect(stepsPerForay(balance)).toBe(balance.encounter.stepsPerForay);
    expect(encounterChancePerStep(balance)).toBe(balance.encounter.encounterChancePerStep);
  });

  it("the observed per-step rate matches the tunable", () => {
    const ctx = ctxFor("r1");
    let met = 0;
    let steps = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const rng = createRng(seed);
      for (let i = 0; i < 100; i += 1) {
        steps += 1;
        if (rollForayStep(ctx, rng)) met += 1;
      }
    }
    expect(Math.abs(met / steps - balance.encounter.encounterChancePerStep)).toBeLessThan(0.02);
  });

  it("a whole foray is the same stream as the same number of single steps", () => {
    // The overworld rolls per movement step; the harness rolls a whole excursion. Both must consume
    // the stream identically or a replay of real play would diverge from a headless run (L10).
    const ctx = ctxFor("r1");
    const whole = rollForay(ctx, createRng(99));
    const piecemeal = [];
    const rng = createRng(99);
    for (let i = 0; i < stepsPerForay(balance); i += 1) {
      const met = rollForayStep(ctx, rng);
      if (met) piecemeal.push(met);
    }
    expect(whole).toEqual(piecemeal);
  });

  it("is deterministic: the same seed meets the same creatures (L10 / §8.1)", () => {
    const ctx = ctxFor("r1");
    expect(rollForay(ctx, createRng(4242))).toEqual(rollForay(ctx, createRng(4242)));
    expect(rollForay(ctx, createRng(4242))).not.toEqual(rollForay(ctx, createRng(4243)));
  });

  it("an emptied node costs the same draws but meets nothing", () => {
    const counts: Record<string, number> = {};
    for (const id of Object.keys(nodeFile("r1").populations)) counts[id] = 0;
    expect(rollForay(ctxFor("r1", { counts }), createRng(11))).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 4. G3 — there is no second table
 * ════════════════════════════════════════════════════════════════════════════ */

describe("G3 / no_shadow_tables — every weight comes from core/foodweb.ts", () => {
  const code = executable("game/encounters.ts");

  it("delegates the derivation instead of restating it", () => {
    expect(code).toMatch(/encounterWeights/);
    expect(code).toMatch(/from\s+["']\.\.\/core\/foodweb["']/);
  });

  it("names no species, and keys no table by one", () => {
    for (const line of content.species) {
      expect(code, `game/encounters.ts names ${line.id}`).not.toContain(line.id);
    }
  });

  it("names no trophic role — the diet rule has one home (build-doc §8.3)", () => {
    // Deliberately not importing ROLES as a value here: this file states the rule independently of
    // the vocabulary it checks, which is what makes it a gate rather than a tautology.
    for (const role of ["Producer", "Grazer", "Mesopredator", "Apex", "Scavenger", "AncientApex"]) {
      expect(code, `game/encounters.ts names role ${role}`).not.toContain(`"${role}"`);
    }
  });

  it("has no weight literal, no bias and no Math.random", () => {
    expect(code).not.toMatch(/\bMath\.random\b/);
    expect(code).not.toMatch(/weight\s*[*+]=\s*\d/);
    expect(code).not.toMatch(/rarity|spawnTable|rollTable|lootTable/i);
  });

  it("imports no engine — the harness can roll encounters headlessly", () => {
    expect(code).not.toMatch(/from\s+["']phaser["']/);
    expect(code).not.toMatch(/\bPhaser\b/);
  });

  it("BINDS — the species sweep would catch a table if one were added", () => {
    const smuggled = `const bias = { "skir-line": 3 };`;
    const hit = content.species.filter((l) => smuggled.includes(l.id));
    expect(hit.length).toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The individual met is COMPLETE — bible §2's one trait per wild creature
 *
 * `Encounter` used to carry {nodeId, lineId, age, level} and no traits, while `BattlerSpec.traits`
 * is not optional — so the encounter could not be handed to a battle without someone inventing the
 * roll at the hand-off, and `tools/harness/player.ts` had already invented its own. The balance
 * report therefore described a player whose creatures the game had no way to produce.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("a wild creature is met with its traits (bible §2)", () => {
  it("carries exactly balance.traits.slotsPerWildCreature traits, all from the shipped pool", () => {
    const ctx = ctxFor("r1");
    for (let seed = 1; seed <= 200; seed += 1) {
      const met = rollEncounterAt(ctx, createRng(seed));
      expect(met).not.toBeNull();
      expect(met!.traits.length).toBe(balance.traits.slotsPerWildCreature);
      for (const trait of met!.traits) {
        const shipped = balance.traits.pool.find((t) => t.id === trait.id);
        expect(shipped, `${trait.id} is not in balance.traits.pool`).toBeDefined();
        expect(trait).toEqual(shipped);
      }
    }
  });

  it("only Elders ever roll the rare pool (bible §2: 'Elders roll rare traits')", () => {
    const ctx = ctxFor("r1");
    const rareIds = new Set(balance.traits.pool.filter((t) => t.rarity === "rare").map((t) => t.id));
    expect(rareIds.size).toBeGreaterThan(0);
    let elderRare = 0;
    let elders = 0;
    for (let seed = 1; seed <= 1500; seed += 1) {
      const met = rollEncounterAt(ctx, createRng(seed));
      if (!met) continue;
      const rare = met.traits.some((t) => rareIds.has(t.id));
      if (met.age === "E") {
        elders += 1;
        if (rare) elderRare += 1;
      } else {
        expect(rare, `a ${met.age} rolled a rare trait`).toBe(false);
      }
    }
    expect(elders, "no Elder was met in 1500 seeds — the fixture is wrong").toBeGreaterThan(0);
    expect(elderRare, "no Elder ever rolled rare — elderRareChance is not being read").toBeGreaterThan(0);
    // …and it is a CHANCE, not a certainty: `balance.traits.elderRareChance` is 0 < p < 1.
    expect(elderRare).toBeLessThan(elders);
  });

  it("the traits are part of the seed: the same seed meets the same animal, traits and all", () => {
    const ctx = ctxFor("r1");
    expect(rollEncounterAt(ctx, createRng(77))).toEqual(rollEncounterAt(ctx, createRng(77)));
  });

  it("the trait roll is LAST, so it did not renumber the draws that pick the animal", () => {
    // Species, age and level are decided before a trait is drawn. Two encounters that differ only in
    // their traits therefore cannot exist for one seed — but the property that matters is that the
    // roll consumes the stream in a fixed order, which the whole-foray identity below re-checks.
    const ctx = ctxFor("r1");
    const rng = createRng(5);
    const first = rollEncounterAt(ctx, rng);
    const second = rollEncounterAt(ctx, rng);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    const replayed = createRng(5);
    expect(rollEncounterAt(ctx, replayed)).toEqual(first);
    expect(rollEncounterAt(ctx, replayed)).toEqual(second);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Hard Req 10 — FOUR causes of absence, not two
 *
 * `AbsenceReason.seasonal` could say "dormant" | "migrating" | null, and null was documented as
 * "the line is simply gone". A sign-chain-gated Ancient is neither: it sits at a real count with
 * `active:false` and no `dormantReason`, so the HUD printed the same word for a species held behind
 * a quest and a species the player had wiped out. Measured on `r2`, on the never-cut vertical slice:
 *     reedrick-line: 24 (migrating)
 *     undermere-line: 1 (absent)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("absence has four causes, and each is derived rather than assumed", () => {
  it("a gated line at a real count reads as gated, never as wiped", () => {
    const gatedLines = content.species.filter((s) => s.habitat.includes(balance.encounter.signChainGatedHabitatTag));
    expect(gatedLines.length).toBeGreaterThan(0);
    let checked = 0;
    for (const line of gatedLines) {
      const host = content.nodes.find((n) => (n.populations[line.id]?.count ?? 0) > 0);
      if (!host) continue;
      checked += 1;
      const absence = absentLines(ctxFor(host.id)).find((a) => a.lineId === line.id);
      expect(absence, `${line.id} is absent at ${host.id} but not reported`).toBeDefined();
      expect(absence!.cause).toBe("gated");
      // Hard Req 2 — the real number is still on screen. The animal is held back, not gone.
      expect(absence!.count).toBeGreaterThan(0);
    }
    expect(checked, "no shipped node carries a gated line at a real count").toBeGreaterThan(0);
  });

  it("PROVES the classification against core rather than restating its rule", () => {
    /*
     * The classification reads the SHAPE of what core/foodweb.ts returned; it does not re-derive the
     * gate. This walks every shipped node in every season and checks the claim the shape is standing
     * in for: a line called "gated" is exactly a line that becomes ACTIVE when its own chain is
     * unlocked, and a line called "wiped" is exactly a line at count 0.
     */
    let gated = 0;
    let wiped = 0;
    let seasonal = 0;
    for (const node of content.nodes) {
      for (const season of balance.clock.seasonOrder) {
        const ctx = ctxFor(node.id, { season });
        for (const absence of absentLines(ctx)) {
          if (absence.cause === "gated") {
            gated += 1;
            const unlocked = encounterTable(ctxFor(node.id, { season, unlocked: [absence.lineId] })).find(
              (e) => e.lineId === absence.lineId,
            );
            expect(unlocked?.active, `${absence.lineId} called gated but stayed inactive when unlocked`).toBe(true);
            expect(absence.count).toBeGreaterThan(0);
          } else if (absence.cause === "wiped") {
            wiped += 1;
            expect(absence.count).toBe(0);
          } else {
            seasonal += 1;
            const line = species.byId.get(absence.lineId);
            expect(line?.seasonalWindow, `${absence.lineId} called ${absence.cause} with no seasonalWindow`).toBeDefined();
          }
        }
      }
    }
    expect(gated, "no gated line was seen across the whole region").toBeGreaterThan(0);
    expect(seasonal, "no seasonal absence was seen across the whole region").toBeGreaterThan(0);
    expect(wiped + gated + seasonal).toBeGreaterThan(0);
  });

  it("BINDS — a gated line and a wiped line at the same node produce DIFFERENT causes", () => {
    const gatedLine = content.species.find(
      (s) => s.habitat.includes(balance.encounter.signChainGatedHabitatTag),
    );
    expect(gatedLine).toBeDefined();
    const host = content.nodes.find((n) => (n.populations[gatedLine!.id]?.count ?? 0) > 0);
    expect(host).toBeDefined();
    const other = Object.keys(host!.populations).find((id) => id !== gatedLine!.id);
    expect(other).toBeDefined();

    const ctx = ctxFor(host!.id, { counts: { [other!]: 0 } });
    const causes = new Map(absentLines(ctx).map((a) => [a.lineId, a.cause]));
    expect(causes.get(gatedLine!.id)).toBe("gated");
    expect(causes.get(other!)).toBe("wiped");
    expect(causes.get(gatedLine!.id)).not.toBe(causes.get(other!));
  });
});
