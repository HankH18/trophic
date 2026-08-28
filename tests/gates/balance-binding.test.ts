/**
 * tests/gates/balance-binding.test.ts — the tunables the build doc STATES, held to what it states.
 *
 * Why this file exists, precisely. Every other test in the repo reads its numbers back out of
 * `balance.json` — which is correct INV-3 hygiene and is the reason a retune touches one file. But
 * it means those tests assert "the code uses the configured value" and NOTHING about whether the
 * configured value is the one the build doc transcribed. Those are two different claims and both
 * are needed: an adversarial sweep changed `stats.boonModPct` 0.1 → anything, `party.saveSlots`
 * 3 → anything, `retirement.heirInheritedTraitsMin/Max`, `ecosim.keystoneBreedMult`, the whole
 * `overlayDiff` denoise ladder and all eleven `balance.map` keys, and the suite stayed green.
 *
 * So: a transcribed spec value is pinned here as a LITERAL, deliberately. G11 forbids a gameplay
 * constant as a literal in CODE — `core/` — because a second home makes a retune a no-op. A test
 * that exists to catch drift from the document is the one place the literal belongs, and the
 * guardrail's own `no_magic_numbers` gate scans `core/` only, for exactly that reason.
 *
 * Every pin carries the doc sentence it came from, verbatim. Where the doc does NOT state a number
 * that is said so in the citation rather than papered over — a pin against no source is still worth
 * having (it catches silent drift) but it must not pretend to authority it has not got.
 *
 * The pins prove themselves: `BINDS` below mutates a copy of `balance.json` one pin at a time and
 * asserts the checker reports that exact path. A pin nobody watched fail is not a pin.
 *
 * The same reasoning reaches ACROSS files. `tools/comfy/manifest.json` holds a pixel size for every
 * asset class, and four of them agreed with balance.json by coincidence — no comparison existed.
 * Three were another key's number wearing a second face and are cross-pinned below (proven by
 * mutating BOTH sides). The fourth was `dex-painted`, whose 1024² was NOT a balance number: it was
 * the generator's own canvas, cross-checked against the §9.2 graph's empty-latent node instead. That
 * class is CUT (cut line C-4), and its describe now holds the four MAP classes that ship at the same
 * size for the same reason — with the difference that theirs IS a balance number, so the graph, the
 * manifest and `balance.map.mapNativePx` are all asserted to be one value there.
 *
 * The last two describes are the other half of finding: a budget with no measurement is decoration.
 * `perf.battleActionBudgetMs` and `perf.bootBudgetMs` were numbers with no consumer anywhere in the
 * repo (their sibling `perf.ecosimStepBudgetMs` has had one in tests/property/ecosim.test.ts all
 * along), so both are measured here as well as pinned.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateContent } from "../../core/schemas";
import { createRng } from "../../core/rng";
import { deriveFoodWeb, indexSpecies, toEcoNode } from "../../core/foodweb";
import { makeBattleContext, predationOracleFromWebs, startBattle, step } from "../../core/battle";
import type { Balance, BattleAction, BattleState, Content, FoodWeb } from "../../core/types";

const content: Content = validateContent();
const balance: Balance = content.balance;

/* ════════════════════════════════════════════════════════════════════════════
 * The pin table.
 * ════════════════════════════════════════════════════════════════════════════ */

interface Pin {
  /** Dotted path into `balance.json`. */
  path: string;
  /** The value the citation states. */
  expected: number;
  /** The document sentence it is transcribed from — verbatim, or an explicit "not stated". */
  cite: string;
}

const SPEC_PINS: readonly Pin[] = [
  /* ── build-doc §7.6, verbatim ────────────────────────────────────────────
   * "Virtual resolution 480×320, integer-scaled. Painted maps 1024×1024 native rendered 2× (2048²
   *  world). Collision mask: 1-bit PNG at map native res, sampled on a 16px grid (64×64 cells) into
   *  a packed bitfield at build time. Player logical sprite 32×48, tile step 32px, grid movement
   *  Gold-style. Props are entries in `props[]` with interaction radius, not baked into collision."
   *
   * All eleven keys of `balance.map` are here. It was the one group in the file with no readers and
   * no tests: every key survived arbitrary mutation, and Lane C builds game/collision.ts against it.
   */
  { path: "map.virtualWidth", expected: 480, cite: "§7.6 'Virtual resolution 480×320, integer-scaled.'" },
  { path: "map.virtualHeight", expected: 320, cite: "§7.6 'Virtual resolution 480×320, integer-scaled.'" },
  { path: "map.mapNativePx", expected: 1024, cite: "§7.6 'Painted maps 1024×1024 native rendered 2× (2048² world).'" },
  { path: "map.mapRenderScale", expected: 2, cite: "§7.6 'Painted maps 1024×1024 native rendered 2× (2048² world).'" },
  { path: "map.collisionCellPx", expected: 16, cite: "§7.6 'sampled on a 16px grid (64×64 cells)'" },
  { path: "map.collisionCols", expected: 64, cite: "§7.6 'sampled on a 16px grid (64×64 cells)'" },
  { path: "map.collisionRows", expected: 64, cite: "§7.6 'sampled on a 16px grid (64×64 cells)'" },
  { path: "map.playerSpriteW", expected: 32, cite: "§7.6 'Player logical sprite 32×32'" },
  /*
   * 48 -> 32 UNDER THE OWNER'S RULING, and build-doc §7.6 moved with it in the same commit.
   *
   * REVERT CHECK: this would still be wrong with every code change reverted — the pinned figure
   * disagrees with a decision the owner made, not with anything a lane did. That is what makes it a
   * legitimate edit rather than a test bent to fit new behaviour.
   *
   * ORIGIN: §7.6 "Player logical sprite 32×48", which this row exists to hold `data/balance.json` to.
   * The contract is unchanged and is still the point of the row: the doc and the data must agree.
   * What moved is the figure BOTH now state, because he asked for a one-block-tall character and one
   * block is `tileStepPx` = 32. The art lane cut the sprite; this is the constant catching up.
   *
   * NOT WEAKENED: still an exact `toBe` against a cited sentence. A range here would have made the
   * next drift invisible, which is the failure this whole table exists to prevent.
   */
  { path: "map.playerSpriteH", expected: 32, cite: "§7.6 'Player logical sprite 32×32'" },
  { path: "map.tileStepPx", expected: 32, cite: "§7.6 'tile step 32px, grid movement Gold-style.'" },
  {
    path: "map.propInteractionRadiusDefault",
    expected: 48,
    cite:
      "§7.6 states only 'Props are entries in props[] with interaction radius' — NO number. 48 is the " +
      "shipped default; the cross-check below is what actually binds it (every shipped prop uses it)",
  },

  /* ── build-doc §7.5, verbatim ────────────────────────────────────────────
   * "(3) any creature at 0 → retirement flow: player chooses HEIR (new J of same line, level =
   *  floor(parent×0.5), inherits 1–2 randomly chosen parent traits + parent's relic slot unlocked)
   *  or BOON (chosen teammate gains permanent +10% to one stat, named after the retiree)"
   */
  { path: "retirement.heirInheritedTraitsMin", expected: 1, cite: "§7.5 'inherits 1–2 randomly chosen parent traits'" },
  { path: "retirement.heirInheritedTraitsMax", expected: 2, cite: "§7.5 'inherits 1–2 randomly chosen parent traits'" },
  { path: "retirement.heirLevelFactor", expected: 0.5, cite: "§7.5 'level = floor(parent×0.5)'" },
  {
    path: "stats.boonModPct",
    expected: 0.1,
    cite:
      "§7.5 'BOON (chosen teammate gains permanent +10% to one stat…)'. Every other test reads this " +
      "back out of balance (correct INV-3 hygiene), which left the TRANSCRIBED +10% pinned nowhere",
  },
  { path: "stats.traitModPct", expected: 0.1, cite: "bible §2 'Traits: flat ±10% modifiers'" },

  /* ── build-doc §7.8 / L12, verbatim ──────────────────────────────────────
   * §7.8: "— localStorage, 3 slots."   L12: "| L12 | Save | Versioned JSON in localStorage, 3 slots |"
   */
  { path: "party.saveSlots", expected: 3, cite: "§7.8 '— localStorage, 3 slots.' / L12 'Versioned JSON in localStorage, 3 slots'" },
  {
    path: "party.maxPartySize",
    expected: 6,
    cite:
      "NOT STATED — neither build-doc.md nor content-bible.md gives a party cap (§7.8's save shape " +
      "declares `party[]` with no bound). 6 is the shipped value; pinned so it cannot drift silently, " +
      "and it is the bound core/schemas.ts zSaveFile now enforces on a loaded save",
  },

  /* ── build-doc §7.3, verbatim ────────────────────────────────────────────
   * "presenceMult per Ancient effects (Vellsire adjacent-node breeding ×1.5 while free; Kilnback:
   *  Fire spawns active; Undermere: Water breedRate floor)."
   * Plus the two §7.3 constants the doc names with their defaults.
   */
  { path: "ecosim.keystoneBreedMult", expected: 1.5, cite: "§7.3 'Vellsire adjacent-node breeding ×1.5 while free'" },
  { path: "ecosim.starveThreshold", expected: 0.4, cite: "§7.3 step 2 'if availablePrey/demand < balance.starveThreshold (default 0.4)'" },
  { path: "ecosim.starveRate", expected: 0.3, cite: "§7.3 step 2 'deaths = count × starveRate (default 0.3)'" },
  { path: "ecosim.foodFactorClampMin", expected: 0.25, cite: "§7.3 step 1 'foodFactor = clamp(availablePrey / demand, 0.25, 1.25)'" },
  { path: "ecosim.foodFactorClampMax", expected: 1.25, cite: "§7.3 step 1 'foodFactor = clamp(availablePrey / demand, 0.25, 1.25)'" },
  { path: "ecosim.predationDraw", expected: 0.1, cite: "§7.3 step 3 'each predator consumes predationDraw (default 0.1 × predatorCount)'" },

  /* ── build-doc §8.2, verbatim ────────────────────────────────────────────
   * "dilate 2px, compute IoU of edge maps restricted to the walkable cells of the collision mask.
   *  Accept iff IoU ≥ 0.85 (tunable). A failing variant is regenerated at lower denoise (start 0.35,
   *  step −0.05, floor 0.2)". §9.5: "Budget: ≤ 3 regen attempts per variant".
   */
  { path: "overlayDiff.iouThreshold", expected: 0.85, cite: "§8.2 'Accept iff IoU ≥ 0.85 (tunable).'" },
  { path: "overlayDiff.denoiseStart", expected: 0.35, cite: "§8.2 'regenerated at lower denoise (start 0.35, step −0.05, floor 0.2)'" },
  {
    path: "overlayDiff.denoiseStep",
    expected: 0.05,
    cite: "§8.2 'step −0.05' — the doc writes the DECREMENT; the tunable is its magnitude, applied downward",
  },
  { path: "overlayDiff.denoiseFloor", expected: 0.2, cite: "§8.2 'regenerated at lower denoise (start 0.35, step −0.05, floor 0.2)'" },
  { path: "overlayDiff.dilatePx", expected: 2, cite: "§8.2 'threshold both … to walkability-relevant edges (Sobel on luminance), dilate 2px'" },
  { path: "overlayDiff.maxRegenAttempts", expected: 3, cite: "§9.5 'Budget: ≤ 3 regen attempts per variant'" },

  /* ── build-doc §12, verbatim ─────────────────────────────────────────────
   * "`ecosim.step` all 12 nodes < 5ms (benchmark test `perf_sim` with margin ×4 on mega-node);
   *  battle reducer < 1ms/action; boot < 3s on broadband (…). Save serialize < 50ms."
   */
  { path: "perf.ecosimStepBudgetMs", expected: 5, cite: "§12 '`ecosim.step` all 12 nodes < 5ms'" },
  { path: "perf.megaNodeMarginMultiplier", expected: 4, cite: "§12 'with margin ×4 on mega-node'" },
  { path: "perf.battleActionBudgetMs", expected: 1, cite: "§12 'battle reducer < 1ms/action'" },
  { path: "perf.saveSerializeBudgetMs", expected: 50, cite: "§12 'Save serialize < 50ms.'" },
  { path: "perf.bootBudgetMs", expected: 3000, cite: "§12 'boot < 3s on broadband'" },

  /* ── build-doc §7.4 / §7.1, verbatim ─────────────────────────────────────
   * "Effective stat = base × ageMult × (1 + 0.02 × level) + traitMods"; "Cap level 40";
   * "baseStats: {…}; // 30–100".
   */
  { path: "stats.levelCoefficient", expected: 0.02, cite: "§7.4 'base × ageMult × (1 + 0.02 × level) + traitMods'" },
  { path: "stats.baseStatMin", expected: 30, cite: "§7.1 'baseStats: {hp,atk,def,spd,ins}; // 30–100'" },
  { path: "stats.baseStatMax", expected: 100, cite: "§7.1 'baseStats: {hp,atk,def,spd,ins}; // 30–100'" },
  { path: "xp.levelCap", expected: 40, cite: "§7.4 'Cap level 40.' / HR8 'levels 1–40'" },
  // §1's "six in-game years" is the EXPECTED count under normal pacing, not a cap: the
  // calendar is unbounded, and this number is quoted by the HUD and driven by the harness. HR5's
  // "one collision mask survives all six years" is unaffected — the mask is per node, for every year.
  { path: "clock.yearsTotal", expected: 6, cite: "§1 'six in-game years' (expected pacing) / HR5 'survives all six years'" },

  /* ── §3 L8 as amended + the act model ──────────────────────────────────── */
  { path: "acts.first", expected: 0, cite: "D-Q3-1 acts 0–6; act 0 is the prologue" },
  { path: "acts.last", expected: 6, cite: "bible §6 'Six acts' / §7 six leaders" },
  // The flag NAMES that bind the act model to data/dialogue.json are strings and this table pins
  // numbers, so they are pinned in tests/unit/acts.test.ts instead ("the badge flag is the one
  // data/dialogue.json already reads") rather than left unpinned.
];

function at(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function withOverride(base: Balance, path: string, value: number): Balance {
  const copy = structuredClone(base) as unknown as Record<string, unknown>;
  const keys = path.split(".");
  const last = keys.pop() as string;
  let cur: Record<string, unknown> = copy;
  for (const key of keys) cur = cur[key] as Record<string, unknown>;
  cur[last] = value;
  return copy as unknown as Balance;
}

/** One message per pin that does not hold. Empty means the file agrees with the document. */
function pinViolations(b: Balance, pins: readonly Pin[]): string[] {
  const out: string[] = [];
  for (const pin of pins) {
    const found = at(b, pin.path);
    if (found !== pin.expected) {
      out.push(`balance.${pin.path} = ${JSON.stringify(found)}, but ${pin.cite} says ${pin.expected}`);
    }
  }
  return out;
}

describe("transcribed tunables agree with the document that states them", () => {
  it("pins something real: every path in the table exists in balance.json", () => {
    for (const pin of SPEC_PINS) {
      expect(at(balance, pin.path), `balance.${pin.path} is missing — a pin against nothing is not a pin`).toBeTypeOf(
        "number",
      );
      expect(pin.cite.length, `balance.${pin.path} has no citation`).toBeGreaterThan(20);
    }
    expect(new Set(SPEC_PINS.map((p) => p.path)).size, "duplicate pin path").toBe(SPEC_PINS.length);
  });

  it.each(SPEC_PINS.map((p) => [p.path, p] as const))("balance.%s", (_path, pin) => {
    expect(pinViolations(balance, [pin]), pin.cite).toEqual([]);
  });

  it("BINDS — every pin catches a drift in a copy of the file", () => {
    // The honest form of the proof: mutate the thing, watch it go red, one pin at a time. Without
    // this, a pin whose path was mistyped would sit green forever against `undefined !== undefined`.
    for (const pin of SPEC_PINS) {
      const drifted = withOverride(balance, pin.path, pin.expected + 1);
      const violations = pinViolations(drifted, SPEC_PINS);
      expect(violations.join("\n"), `balance.${pin.path} drifted and the pin did not notice`).toMatch(
        new RegExp(`balance\\.${pin.path.replace(/\./g, "\\.")} = `),
      );
      // …and reverting leaves the file clean, so the checker is not simply always red.
      expect(pinViolations(balance, SPEC_PINS)).toEqual([]);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * build-doc §7.6's derived identities — the reason `balance.map` was dangerous.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("build-doc §7.6 map identities hold in the shipped file", () => {
  it("the collision grid covers exactly the painting it is sampled from", () => {
    const m = balance.map;
    expect(m.collisionCols * m.collisionCellPx).toBe(m.mapNativePx);
    expect(m.collisionRows * m.collisionCellPx).toBe(m.mapNativePx);
  });

  it("one collision cell at render scale is exactly one tile step", () => {
    const m = balance.map;
    expect(m.collisionCellPx * m.mapRenderScale).toBe(m.tileStepPx);
  });

  it("the world the doc calls 2048² is what the two keys multiply to", () => {
    // §7.6 verbatim: "Painted maps 1024×1024 native rendered 2× (2048² world)."
    expect(balance.map.mapNativePx * balance.map.mapRenderScale).toBe(2048);
  });

  it("the virtual viewport is a whole number of tiles", () => {
    // §7.6 "integer-scaled" + "grid movement Gold-style": a viewport that ends mid-tile has no
    // Gold-style camera. 480/32 = 15, 320/32 = 10.
    expect(balance.map.virtualWidth % balance.map.tileStepPx).toBe(0);
    expect(balance.map.virtualHeight % balance.map.tileStepPx).toBe(0);
  });

  it("propInteractionRadiusDefault is the radius the props actually use", () => {
    // The doc gives no number, so the binding has to be a cross-check rather than a transcription:
    // a "default" that no prop uses is not a default, and `48 → 4` used to survive everything.
    // If a lane ever needs a non-default radius on a prop, THIS is the review event for it.
    const radii = new Set(content.nodes.flatMap((n) => n.props.map((p) => p.interactionRadius)));
    expect(radii.size, "props carry more than one radius").toBe(1);
    expect([...radii]).toEqual([balance.map.propInteractionRadiusDefault]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The art manifest's target sizes, held to the ONE place each number lives.
 *
 * `tools/comfy/manifest.json` carries a pixel size for every asset class and every row, and four of
 * those classes agreed with data/balance.json by COINCIDENCE rather than by constraint — nothing
 * anywhere compared them. Three of the four turned out to be another key's number wearing a second
 * face, so the repair is a comparison, not a new tunable:
 *
 *   · `trainer-battle` 96×96 IS a battle sprite. Its `_targetSource` still reads "art-lane
 *     constant, see deviation LB-M4" — true until `balance.map.battleSpritePx` existed to close
 *     LB-M4, and a second declaration of one fact now that it does.
 *   · `prop` 48×48 already names `balance.map.propInteractionRadiusDefault` as its source, but
 *     tests/unit/manifest.test.ts compares `targetW` alone, so the HEIGHT could drift by itself.
 *   · three `ui-frame` rows state a balance derivation in their own header block: `manifest._ui`
 *     sizes the dialogue box "against balance.map.virtualWidth 480" and the menu panel "against
 *     balance.map.virtualHeight 320", and the ledger panel's subject line says "full-screen" —
 *     which is `virtualWidth × virtualHeight` or it is not full-screen. The other three ui frames
 *     (battle-hud 240×64, dex-card 320×320, sign-card 240×160) are authored art sizes that claim no
 *     balance source, and are deliberately NOT pinned: a fraction that happens to divide 480 is
 *     numerology, and a pin invented for it would assert a constraint nobody chose.
 *
 * The fourth, `dex-painted` 1024², is not a balance number at all — see the workflow test below.
 *
 * `creature-battle` and `overworld-mini` are bound to `battleSpritePx`/`miniSpritePx` in
 * tests/unit/balance-inv3.test.ts and are not repeated here.
 * ════════════════════════════════════════════════════════════════════════════ */

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

interface ArtClassSpec {
  targetW: number;
  targetH: number;
  /** The manifest's own statement of where its target size comes from. Read, not restated. */
  _targetSource?: string;
}
interface ArtRow {
  id: string;
  class: string;
  targetSize: string;
}
interface ArtManifest {
  classes: Record<string, ArtClassSpec | undefined>;
  rows: ArtRow[];
}

function readArtManifest(): ArtManifest {
  return JSON.parse(readFileSync(join(ROOT, "tools", "comfy", "manifest.json"), "utf8")) as ArtManifest;
}

const ART: ArtManifest = readArtManifest();

/** A row's `targetSize`, which the manifest ships as the string "WxH". */
function rowSize(m: ArtManifest, id: string): readonly [number, number] | undefined {
  const row = m.rows.find((r) => r.id === id);
  if (row === undefined) return undefined;
  const parts = row.targetSize.split("x").map(Number);
  const w = parts[0];
  const h = parts[1];
  if (w === undefined || h === undefined || !Number.isFinite(w) || !Number.isFinite(h)) return undefined;
  return [w, h];
}

interface SizePin {
  /** Where the number sits in tools/comfy/manifest.json. */
  where: string;
  /** The balance key that is its single home. */
  balancePath: string;
  /** Read the manifest's copy of it. */
  read: (m: ArtManifest) => number | undefined;
  /** Move the manifest's copy of it, for the BINDS proof. */
  drift: (m: ArtManifest) => void;
  /** Why these are ONE fact and not two numbers that happen to agree today. */
  cite: string;
}

const MANIFEST_SIZE_PINS: readonly SizePin[] = [
  {
    where: "classes['trainer-battle'].targetW",
    balancePath: "map.battleSpritePx",
    read: (m) => m.classes["trainer-battle"]?.targetW,
    drift: (m) => {
      const c = m.classes["trainer-battle"];
      if (c) c.targetW += 8;
    },
    cite:
      "build-doc §9.3 'nearest-neighbor downscale to target (battle 96²…)'. A gym leader's battle " +
      "portrait is drawn on the same screen at the same scale as the creature facing it, so there is " +
      "one battle-sprite target and `trainer-battle` must read it rather than restate 96",
  },
  {
    where: "classes['trainer-battle'].targetH",
    balancePath: "map.battleSpritePx",
    read: (m) => m.classes["trainer-battle"]?.targetH,
    drift: (m) => {
      const c = m.classes["trainer-battle"];
      if (c) c.targetH += 8;
    },
    cite: "build-doc §9.3 'battle 96²' — square, so the same one number on both axes",
  },
  {
    where: "classes['prop'].targetW",
    balancePath: "map.propInteractionRadiusDefault",
    read: (m) => m.classes["prop"]?.targetW,
    drift: (m) => {
      const c = m.classes["prop"];
      if (c) c.targetW += 8;
    },
    cite:
      "the manifest's own `_targetSource`: 'balance.map.propInteractionRadiusDefault — a prop reads " +
      "at roughly the scale of its own interaction radius'. tests/unit/manifest.test.ts asserts this " +
      "half already; it is here so the pair is proven together and by a gate that is not red",
  },
  {
    where: "classes['prop'].targetH",
    balancePath: "map.propInteractionRadiusDefault",
    read: (m) => m.classes["prop"]?.targetH,
    drift: (m) => {
      const c = m.classes["prop"];
      if (c) c.targetH += 8;
    },
    cite:
      "the same `_targetSource`, on the axis nothing checked: the prop class is square and only its " +
      "WIDTH was compared, so 48×64 would have shipped green",
  },
  {
    where: "rows['ui-dialogue-box'].targetSize width",
    balancePath: "map.virtualWidth",
    read: (m) => rowSize(m, "ui-dialogue-box")?.[0],
    drift: (m) => {
      const row = m.rows.find((r) => r.id === "ui-dialogue-box");
      if (row) row.targetSize = "512x96";
    },
    cite:
      "manifest._ui['dialogue-box'].source: 'bible §12 screens; sized against balance.map.virtualWidth " +
      "480'. The manifest states the derivation; nothing enforced it. Its HEIGHT (96) claims no source " +
      "and is not pinned",
  },
  {
    where: "rows['ui-menu-panel'].targetSize height",
    balancePath: "map.virtualHeight",
    read: (m) => rowSize(m, "ui-menu-panel")?.[1],
    drift: (m) => {
      const row = m.rows.find((r) => r.id === "ui-menu-panel");
      if (row) row.targetSize = "160x288";
    },
    cite:
      "manifest._ui['menu-panel'].source: 'bible §12 screens; sized against balance.map.virtualHeight " +
      "320'. Its WIDTH (160) claims no source and is not pinned",
  },
  {
    where: "rows['ui-ledger-panel'].targetSize width",
    balancePath: "map.virtualWidth",
    read: (m) => rowSize(m, "ui-ledger-panel")?.[0],
    drift: (m) => {
      const row = m.rows.find((r) => r.id === "ui-ledger-panel");
      if (row) row.targetSize = "512x320";
    },
    cite:
      "its subject is 'a full-screen ledger panel frame with a ruled table recess' — a full-screen " +
      "panel that is not the size of the screen is not full-screen. 480 appearing twice in two files " +
      "is the same defect one level down from the class targets",
  },
  {
    where: "rows['ui-ledger-panel'].targetSize height",
    balancePath: "map.virtualHeight",
    read: (m) => rowSize(m, "ui-ledger-panel")?.[1],
    drift: (m) => {
      const row = m.rows.find((r) => r.id === "ui-ledger-panel");
      if (row) row.targetSize = "480x288";
    },
    cite: "the other axis of the same 'full-screen' claim — build-doc §7.6's 480×320 virtual screen",
  },
];

/** One message per size that no longer agrees with the balance key it is a copy of. */
function manifestSizeViolations(b: Balance, m: ArtManifest, pins: readonly SizePin[]): string[] {
  const out: string[] = [];
  for (const pin of pins) {
    const found = pin.read(m);
    const expected = at(b, pin.balancePath);
    if (found !== expected) {
      out.push(
        `tools/comfy/manifest.json ${pin.where} = ${JSON.stringify(found)}, but balance.${pin.balancePath} ` +
          `= ${JSON.stringify(expected)} — ${pin.cite}`,
      );
    }
  }
  return out;
}

describe("art manifest sizes are the balance keys they are copies of, not numbers of their own", () => {
  it("pins something real: every location exists on both sides", () => {
    for (const pin of MANIFEST_SIZE_PINS) {
      expect(pin.read(ART), `tools/comfy/manifest.json ${pin.where} is missing — a pin against nothing`).toBeTypeOf(
        "number",
      );
      expect(at(balance, pin.balancePath), `balance.${pin.balancePath} is missing`).toBeTypeOf("number");
      expect(pin.cite.length, `${pin.where} has no citation`).toBeGreaterThan(20);
    }
    expect(new Set(MANIFEST_SIZE_PINS.map((p) => p.where)).size, "duplicate pin").toBe(MANIFEST_SIZE_PINS.length);
  });

  it.each(MANIFEST_SIZE_PINS.map((p) => [p.where, p] as const))("manifest %s", (_where, pin) => {
    expect(manifestSizeViolations(balance, ART, [pin]), pin.cite).toEqual([]);
  });

  it("BINDS — each pin catches a drift on the MANIFEST side", () => {
    for (const pin of MANIFEST_SIZE_PINS) {
      const drifted = structuredClone(ART);
      pin.drift(drifted);
      expect(pin.read(drifted), `${pin.where}: drift() did not move the number it claims to move`).not.toBe(
        pin.read(ART),
      );
      expect(
        manifestSizeViolations(balance, drifted, MANIFEST_SIZE_PINS).join("\n"),
        `${pin.where} drifted and the pin did not notice`,
      ).toContain(pin.where);
      // …and the shipped pair is clean, so the checker is not simply always red.
      expect(manifestSizeViolations(balance, ART, MANIFEST_SIZE_PINS)).toEqual([]);
    }
  });

  it("BINDS — each pin catches a retune on the BALANCE side", () => {
    // The direction that matters for INV-3: a retune of balance.json must not leave the art lane
    // generating the old size in silence.
    for (const pin of MANIFEST_SIZE_PINS) {
      const retuned = withOverride(balance, pin.balancePath, (at(balance, pin.balancePath) as number) + 8);
      expect(
        manifestSizeViolations(retuned, ART, MANIFEST_SIZE_PINS).join("\n"),
        `balance.${pin.balancePath} was retuned and ${pin.where} did not notice`,
      ).toContain(pin.where);
      expect(manifestSizeViolations(balance, ART, MANIFEST_SIZE_PINS)).toEqual([]);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The generator's native canvas — the size a class is RETAINED at, not a tunable.
 * ════════════════════════════════════════════════════════════════════════════ */

interface ComfyNode {
  class_type?: string;
  inputs?: Record<string, unknown>;
}

const TXT2IMG_GRAPH = join(ROOT, "tools", "comfy", "pixel-txt2img-api.json");

function readGraph(): Record<string, ComfyNode> {
  return JSON.parse(readFileSync(TXT2IMG_GRAPH, "utf8")) as Record<string, ComfyNode>;
}

/** The size the §9.2 locked graph actually generates at — its empty-latent node. */
function latentSize(graph: Record<string, ComfyNode>): readonly [number, number] | undefined {
  for (const node of Object.values(graph)) {
    if (node.class_type === undefined || !node.class_type.includes("LatentImage")) continue;
    const w = node.inputs?.["width"];
    const h = node.inputs?.["height"];
    if (typeof w === "number" && typeof h === "number") return [w, h];
  }
  return undefined;
}

/**
 * The balance key a class names when it is NOT downscaled. Read off the manifest, never typed.
 *
 * ⚠ THIS SECTION USED TO BE ABOUT `dex-painted`, AND THAT CLASS IS CUT. The property it held was
 * real and is not dex-specific: a class the §9.3 chain does not resize ships at whatever the §9.2
 * locked graph generates, so its declared target must equal the graph's empty-latent node or the
 * manifest is stating a size the pipeline cannot produce. `dex-painted` was one of five classes with
 * that property; cut line C-4 removed it, and the four map classes — which are the ones that
 * actually SHIP at native size, with `fit: false` — are the four that remain.
 *
 * What changed with the subject is that the number now has a balance home and did not before. The
 * old comment here recorded why the painted plate was deliberately NOT pinned to
 * `balance.map.mapNativePx`: that key is pinned by core/schemas.ts to the collision identity
 * (`collisionCols × collisionCellPx`), so a retune of the map GRID would have dragged a watercolour
 * with it for no reason — two facts that happened to share a value. For a MAP that reasoning
 * inverts: the map native size and the collision identity are one fact, and the map classes say so
 * themselves in `_targetSource`. So all three numbers are asserted equal here, and the day they part
 * is the day the generator emits one size while the data claims another and nothing resizes it.
 */
const NATIVE_SOURCE = "balance.map.mapNativePx";
/** The same string as a path into data/balance.json — derived from it, so the two cannot part. */
const NATIVE_BALANCE_PATH = NATIVE_SOURCE.replace(/^balance\./, "");

function nativeClasses(m: ArtManifest): Array<[string, ArtClassSpec]> {
  return Object.entries(m.classes).flatMap(([name, spec]) =>
    spec !== undefined && spec._targetSource === NATIVE_SOURCE ? [[name, spec] as [string, ArtClassSpec]] : [],
  );
}

describe("a class that is not downscaled is generated at the graph's native size", () => {
  it("the painted dex class is CUT — the ruling is in the manifest, not just in the screens", () => {
    // The structural half of cut line C-4, asserted where the class's size used to be asserted. If a
    // rebuild ever puts the class back, the section that reads its `_targetSource` starts reading a
    // number nothing verified, so this is the assertion that has to be here rather than a comment.
    expect(ART.classes["dex-painted"], "dex-painted is back in tools/comfy/manifest.json").toBeUndefined();
    expect(ART.rows.filter((r) => r.class === "dex-painted")).toEqual([]);
  });

  it("every class that claims the map native size IS the graph's latent, and the balance key", () => {
    const latent = latentSize(readGraph());
    expect(latent, `${TXT2IMG_GRAPH} has no latent-image node — this cross-check is aimed at nothing`).toBeDefined();
    const native = nativeClasses(ART);
    expect(
      native.map(([n]) => n).sort(),
      "no class declares the map native size — this check is aimed at nothing",
    ).toEqual(["map-route", "map-site", "map-town", "map-variant"]);
    for (const [name, spec] of native) {
      expect([spec.targetW, spec.targetH], `${name} is downscaled after all, or the graph moved`).toEqual([
        latent?.[0],
        latent?.[1],
      ]);
      expect([spec.targetW, spec.targetH], `${name} disagrees with ${NATIVE_SOURCE}`).toEqual([
        at(balance, NATIVE_BALANCE_PATH),
        at(balance, NATIVE_BALANCE_PATH),
      ]);
    }
    // …and the reverse containment, so a NEW class generated at the latent cannot appear unchecked:
    // anything at that size must say where the size comes from.
    const unsourced = Object.entries(ART.classes).filter(
      ([, spec]) => spec !== undefined && spec.targetW === latent?.[0] && spec._targetSource !== NATIVE_SOURCE,
    );
    expect(unsourced.map(([n]) => n), "a class ships at the generator's native size and cites no source").toEqual([]);
  });

  it("BINDS — a moved latent is a moved map, and the check says so", () => {
    const drifted = structuredClone(readGraph());
    let moved = false;
    for (const node of Object.values(drifted)) {
      const w = node.inputs?.["width"];
      if (node.class_type?.includes("LatentImage") === true && typeof w === "number" && node.inputs) {
        node.inputs["width"] = w + 128;
        moved = true;
      }
    }
    expect(moved, "nothing was mutated — the sabotage is aimed at nothing").toBe(true);
    const native = nativeClasses(ART);
    expect(native.length).toBeGreaterThan(0);
    for (const [, spec] of native) expect(latentSize(drifted)?.[0]).not.toBe(spec.targetW);
  });

  it("BINDS — a moved class target is caught too", () => {
    const drifted = structuredClone(ART);
    const native = nativeClasses(drifted);
    expect(native.length).toBeGreaterThan(0);
    for (const [, spec] of native) spec.targetW += 128;
    for (const [, spec] of nativeClasses(drifted)) {
      expect(spec.targetW).not.toBe(latentSize(readGraph())?.[0]);
      expect(spec.targetW).not.toBe(at(balance, NATIVE_BALANCE_PATH));
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * build-doc §12 — the two budgets that had no consumer.
 * ════════════════════════════════════════════════════════════════════════════ */

const NODE = content.nodes.find((n) => n.id === "r2") ?? content.nodes[0]!;
const WEB: FoodWeb = deriveFoodWeb(toEcoNode(NODE), indexSpecies(content.species), balance);
const CTX = makeBattleContext(content, predationOracleFromWebs([WEB]));

/** A real fight on real content, driven by the reducer the same way the game drives it. */
function runBattle(seed: number, maxActions: number): { actions: number; ms: number } {
  const started = startBattle(
    {
      seed,
      kind: "wild",
      nodeId: NODE.id,
      playerParty: [
        { uid: "p1", lineId: "mirefin-line", age: "A", level: 20, traits: [] },
        { uid: "p2", lineId: "fenmaw-line", age: "E", level: 24, traits: [] },
      ],
      enemyParty: [{ uid: "e1", lineId: "reedrick-line", age: "A", level: 22, traits: [] }],
      bag: { base: 4, salve: 2, tonic: 2 },
    },
    CTX,
  );
  let state: BattleState = started.state;
  let actions = 0;
  const t0 = performance.now();
  for (let i = 0; i < maxActions; i += 1) {
    if (state.outcome !== null) break;
    const active = state.battlers[state.activePlayerUid];
    if (!active) break;
    const moveId = active.moves[i % active.moves.length];
    const action: BattleAction = moveId === undefined ? { kind: "flee" } : { kind: "move", moveId };
    state = step(state, action, createRng(seed + i), CTX).state;
    actions += 1;
  }
  return { actions, ms: performance.now() - t0 };
}

describe("perf_battle — build-doc §12 'battle reducer < 1ms/action'", () => {
  it("the budget has a real measurement behind it, not just a number in a file", () => {
    // Warm the JIT on a throwaway fight, then measure. Fights end, so several are chained to get a
    // meaningful action count; the budget is per ACTION, so the divisor is actions actually taken.
    runBattle(balance.rng.defaultSeed, 40);

    let actions = 0;
    let ms = 0;
    for (let seed = 0; seed < 40; seed += 1) {
      const run = runBattle(balance.rng.defaultSeed + seed, 40);
      actions += run.actions;
      ms += run.ms;
    }
    expect(actions, "the benchmark did not actually step the reducer").toBeGreaterThan(100);
    const perAction = ms / actions;
    expect(perAction, `battle reducer took ${perAction.toFixed(4)}ms/action over ${actions} actions`).toBeLessThan(
      balance.perf.battleActionBudgetMs,
    );
  });

  it("the reducer really is what is being timed (the fight reaches an outcome)", () => {
    // Guard against the benchmark going vacuous: if startBattle returned an already-finished state
    // the loop would take zero actions and pass on an empty measurement.
    const run = runBattle(balance.rng.defaultSeed, 40);
    expect(run.actions).toBeGreaterThan(0);
  });
});

describe("perf_boot — build-doc §12 'boot < 3s on broadband'", () => {
  it("content validation — the part of boot core/ owns — fits inside the boot budget", () => {
    /*
     * Honest scope: `bootBudgetMs` covers the whole shell (atlas packing + lazy-loaded painted dex
     * art), and none of that is reachable from a headless core test — see build-doc §12's own
     * parenthetical. What IS reachable is the piece boot cannot start without: parsing and
     * cross-validating every data/*.json. Measuring it against the same budget is a real
     * consumer for the number, and it is labelled as the core half rather than sold as the whole.
     */
    validateContent(); // warm the module-level JSON imports
    const t0 = performance.now();
    for (let i = 0; i < 5; i += 1) validateContent();
    const ms = (performance.now() - t0) / 5;
    expect(ms, `validateContent() took ${ms.toFixed(2)}ms`).toBeLessThan(balance.perf.bootBudgetMs);
  });
});
