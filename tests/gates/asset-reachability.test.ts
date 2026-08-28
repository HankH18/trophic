/**
 * tests/gates/asset-reachability.test.ts — EVERY AUTHORED ASSET REFERENCE MUST HAVE A PATH TO THE SCREEN.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS: `reachability.test.ts` CATCHES ENTRIES. IT DOES NOT CATCH FIELDS.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Its sibling `tests/gates/reachability.test.ts` was written after a fully green suite certified 39
 * dialogue entries the player could not reach, both epilogues among them. It enumerates
 * `DIALOGUE.entries` and asks, of each ENTRY, whether a selector can request it and whether its
 * preconditions have a writer outside the test.
 *
 * That model is blind to a FIELD. An entry can be perfectly reachable while a field on it names an
 * asset nothing will ever draw, and the same is true of the manifest one level up. Four instances
 * of exactly that were found by hand in a single day, none of them by the suite:
 *
 *   · `DialogueSpeaker.portrait` — `core/dialogue-schema.ts:102` documents it as the "Asset manifest
 *     row id (tools/comfy/manifest.json) that draws this speaker", it is REQUIRED, it is authored on
 *     all 63 speakers, and there is not one property read of it in `core/` or `game/`. The dialogue
 *     box resolves the speaker for the NAME PLATE and stops there.
 *   · `ui-frame` — 6 manifest rows, six PNGs now under `assets/final/ui-frame/`, and `DialogueScene`
 *     draws `this.add.rectangle(...)`. (SINCE CLOSED, five of six: the dialogue box, the menu plate,
 *     the combatant card, the dex card and the ecology ledger all draw the painted ring through
 *     `game/ui/FramePanel.ts`. `ui-sign-card-frame` is still drawn by nothing — see GATE 2c.)
 *   · `overworld-mini` — 24 rows and no reference to the class, its `finalDir`, or any of its ids.
 *   · `trainer-battle` — 8 rows whose only referent in the whole repo is that unread `portrait`.
 *
 * Earlier the same day, 35 `dex-painted` rows whose real-art branch had never once executed.
 *
 * So this file asks the two questions the entry-shaped gate structurally cannot, and it asks BOTH,
 * because either one alone leaves half the hole open:
 *
 *   GATE 2a  DECLARED → CONSUMED. Every class in `tools/comfy/manifest.json` must have a live
 *            consumer. A class with rows, a `finalDir` and no reader is images nobody will ever see,
 *            and generating them costs real money.
 *   GATE 2b  AUTHORED → CONSUMED. Every value in `data/` that names an asset must resolve to a key
 *            the game actually asks for. `DialogueSpeaker.portrait` is the motivating case; the
 *            scan finds the fields itself rather than taking a list.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * THE METHOD, AND WHAT IT CANNOT SEE — read this before trusting a green
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * A NAME-GREP INSTRUMENT HAS FAILED THIS PROJECT REPEATEDLY: a whole-file comma count, a hardcoded
 * walkable set that omitted `~`, a `load()` name-scan that missed a dynamically-built tile id, and
 * an `add.image` census that missed every `placeholderImage` call site and concluded that no sprite
 * is drawn anywhere. So the census below is not a grep for identifiers.
 *
 * {@link ASKED} — the set of texture keys the shipped game can request — is built by CALLING the
 * real exported key builders over the real shipped domains: `nodeArtKeys` over `data/nodes/` × every
 * year the clock reaches, `buildDexEntries` over `data/species.json` (the model `DexScene` renders,
 * not the helper behind it), `battleSpriteKey` over species × `AGE_CLASSES` × both sides,
 * `playerArtIds`, `interiorTextureKey` over `core/interiors.ts` `INTERIORS`. Nothing here is a
 * transcription of a key: if a builder's grammar moves, this census moves with it. That is the same
 * DERIVED/OBSERVED standard `reachability.test.ts` holds its flag census to.
 *
 * ⚠ WHAT IT CANNOT SEE, stated plainly rather than left to be discovered:
 *
 *   1. THE LAST HOP. These builders are pure, so the census proves the key is PRODUCED by the model
 *      a scene draws from — not that the scene passed it to `placeholderImage`. That final hop needs
 *      a mounted scene and is covered by `tests/unit/dialogue-scene.test.ts`,
 *      `tests/unit/battle-view.test.ts` and `tests/gates/dex-path-contract.test.ts`.
 *   2. A CONSUMER THIS FILE HAS NOT BEEN TOLD ABOUT. {@link KEY_BUILDERS} is hand-assembled — a
 *      consumer surface is a fact about code and there is no way around that. It fails CLOSED: a
 *      class whose consumer is missing from the table is reported UNCONSUMED, never quietly passed.
 *      A false red is a table that needs a row; a false green is impossible from this direction.
 *   3. §1c's file census is the WEAK half and is labelled as such where it stands.
 *
 * ⚠ AND IT MUST NOT PASS VACUOUSLY. Every scope below is enumerated from a source INDEPENDENT of
 * the thing being checked — the class list from `manifest.classes` (never from the builder table),
 * the authored scan from a `data/` walk cross-checked against `content.nodes` — so a renamed class,
 * a moved directory or a builder that silently returns nothing goes red instead of iterating zero
 * rows and reporting success. That is how the 39 unreachable entries survived.
 */

import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DIALOGUE } from "../../core/dialogue-schema";
import { INTERIORS } from "../../core/interiors";
import { validateContent } from "../../core/schemas";
import { AGE_CLASSES, SEASONS } from "../../core/types";
import type { AgeClass, NodeFile } from "../../core/types";
import { ancientAgeClass } from "../../game/finale";
import { assetId, realAssetIds, registerRealAsset } from "../../game/placeholder";
import {
  DIALOGUE_FRAME_ASSET_ID,
  portraitAssetId,
  speakerHasFace,
} from "../../game/scenes/DialogueScene";
import { buildDexEntries } from "../../game/survey-view";
import { battleSpriteKey, facingFor } from "../../game/ui/BattleHud";
import { UI_FRAME_ASSET_ID } from "../../game/ui/FramePanel";
import manifestJson from "../../tools/comfy/manifest.json";

// `game/mapview.ts` value-imports Phaser for one constant (`Phaser.Loader.Events.COMPLETE`), and
// `game/scenes/DexScene.ts` reaches it for one more — the base class `DexScene extends`. `import
// "phaser"` throws `window is not defined` under vitest's node environment. Same stub and same
// reason as tests/gates/dex-path-contract.test.ts: it carries those two and nothing else, and
// `Scene` is an EMPTY class, so it is deliberately too small to stand in for the engine. Only the
// pure string function `creatureArtId` is taken from that module.
vi.mock("phaser", () => ({ default: { Loader: { Events: { COMPLETE: "complete" } }, Scene: class {} } }));
/* eslint-disable import/first -- must follow the mock above. */
import { interiorAssetPath, interiorTextureKey, nodeArtKeys, playerArtIds } from "../../game/mapview";
import { creatureArtId } from "../../game/scenes/DexScene";
/* eslint-enable import/first */

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const content = validateContent();
const balance = content.balance;

/* ════════════════════════════════════════════════════════════════════════════
 * 0. The scope, enumerated from sources independent of what is being checked
 * ════════════════════════════════════════════════════════════════════════════ */

/** The four fields of a manifest row this file reads. `tests/unit/manifest.test.ts` owns the rest. */
interface ManifestRow {
  id: string;
  class: string;
  finalFile: string;
  status: string;
}

const ROWS = manifestJson.rows as unknown as readonly ManifestRow[];
/** `classes` is the RECIPE map — `finalDir`, target size, workflow. The rows live in `rows[]`. */
const CLASS_RECIPES = manifestJson.classes as unknown as Readonly<Record<string, { finalDir: string }>>;

/**
 * THE CLASS LIST COMES FROM `manifest.classes`, NEVER FROM {@link KEY_BUILDERS}.
 *
 * This is the whole non-vacuity story for GATE 2a. Enumerating the classes from the builder table
 * would make the gate a tautology — every class it knows about is by construction one it can build a
 * key for — which is the shape of the defect the sibling gate exists for. Enumerating them from the
 * manifest means a class ADDED to the pipeline with no consumer is red on the day it is added.
 */
const CLASS_NAMES: readonly string[] = Object.keys(CLASS_RECIPES).sort();

/** A row's texture key: `game/placeholder.ts` registers art under exactly this. */
const keyOf = (row: ManifestRow): string => assetId(row.finalFile);

const ROW_BY_ID = new Map<string, ManifestRow>(ROWS.map((r) => [r.id, r]));
const ROW_BY_KEY = new Map<string, ManifestRow>(ROWS.map((r) => [keyOf(r), r]));

function keysOfClass(className: string): Set<string> {
  return new Set(ROWS.filter((r) => r.class === className).map(keyOf));
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE QUESTION IS ABOUT THE CODE, NOT ABOUT WHICH PNGs HAPPEN TO BE ON DISK TODAY
 *
 * One shipped resolver — `game/scenes/DialogueScene.ts` `portraitAssetId` — turns an authored
 * manifest ROW ID into a texture KEY by looking it up in `realAssetIds()`, the build-time census of
 * what is actually under `assets/final/`, and returns the bare row id when the census does not know
 * it. That is a good design (the key cannot drift from the manifest that produced the file) and it
 * makes the answer to "which key does the game ask for" depend on what the ART LANE has shipped:
 * with `assets/final/npc-static/` on disk a portrait resolves to `npc-static/npc-bram`, and with
 * `assets/final/trainer-battle/` still empty the same code returns `trainer-maren`.
 *
 * This gate asks whether the CODE has a path from an authored asset reference to the screen. Judging
 * that against today's directory listing would make it answer a different question every time a lane
 * lands a file — a class would read "unconsumed" purely because its art is unbuilt, which is the one
 * thing this gate must never confuse with having no reader. So the pipeline's own output is
 * registered first, through `registerRealAsset` — the shipped registration verb, not a private list
 * — and every census below is taken in the world where the art lane has delivered.
 *
 * ⚠ WHAT THIS DELIBERATELY GIVES UP: it can no longer see the TRANSIENT state where a resolver
 * returns a bare row id because the file is not there yet. That is a property of the disk, it heals
 * itself the moment the PNG lands, and it belongs to the resolver's own unit test.
 * ──────────────────────────────────────────────────────────────────────────── */

const REGISTERED: readonly string[] = ROWS.map((row) => row.finalFile).filter((finalFile) =>
  registerRealAsset(finalFile, `gate://asset-reachability/${assetId(finalFile)}`),
);

/* ════════════════════════════════════════════════════════════════════════════
 * 1. The ASKED census — DRIVEN through the shipped key builders
 * ════════════════════════════════════════════════════════════════════════════ */

interface KeyBuilder {
  /** The shipped function and the domain it was called over, for the failure message. */
  where: string;
  keys: () => readonly string[];
}

/** Every year the shipped clock reaches under normal pacing, plus the year the sixth act lands in. */
const YEARS: readonly number[] = Array.from(
  { length: balance.clock.yearsTotal + 1 },
  (_, i) => balance.clock.startYear + i,
);

/**
 * THE PAINTED UI FRAMES — the ids CALL SITES PASS, discovered, never listed here.
 *
 * `game/ui/FramePanel.ts` is the one file that puts a frame on the screen (`scene.add.image` per
 * ring piece); the five screens that want a frame hand it an id and it draws whatever it is given.
 * So "which `ui-frame` row is consumed" is not a property of `FramePanel`, it is a property of what
 * its callers pass — and that is the question this builder asks.
 *
 * ⚠ IT MUST NOT BE `UI_FRAME_ASSET_IDS`. FramePanel exports the whole declared set of six, and
 * handing that to this table would report `ui-sign-card-frame` as asked for on the strength of the
 * frames around it — "the class exists, therefore the row is reachable", which is the exact
 * reasoning GATE 2c below was written to refuse. FramePanel's own header says so at the export.
 *
 * ⚠ AND IT MUST NOT BE A HAND-LIST EITHER. A row typed out here goes stale in the dangerous
 * direction: it keeps producing a key long after the screen stopped drawing it, which is precisely
 * how the `dexArtId` row above certified `dex-painted` while nothing drew a plate. So the DOMAIN is
 * scanned out of the shipped source (which property names appear as `UI_FRAME_ASSET_ID.x`) and the
 * KEY is read out of the shipped constant (`UI_FRAME_ASSET_ID[x]`). Neither the membership nor the
 * string is written in this file, and a screen that stops asking moves this census with it.
 *
 * The scan reads COMMENT- AND STRING-STRIPPED source through the same {@link stripped} lexer §1b
 * uses — `DialogueScene` discusses `UI_FRAME_ASSET_ID.dialogueBox` in prose while deliberately
 * passing its own `DIALOGUE_FRAME_ASSET_ID` constant, and a raw grep would count that paragraph as
 * a call site. It is a text scan and carries §1b's limits; what keeps it honest is that it can only
 * ever produce ids the shipped table defines (an unknown property name is reported, not dropped),
 * and that `§1 every key builder is real` fails it closed the moment it finds nothing.
 *
 * ⚠ THE HOLE IT STILL HAS, stated rather than left to be found: writing `UI_FRAME_ASSET_ID.signCard`
 * anywhere in `game/` outside a comment would put that id in this census WITHOUT drawing it, and
 * GATE 2c would go green on a row nothing draws. That takes a deliberate edit to shipping code, and
 * the wholesale version of it — handing the table the declared set — is caught by the strict
 * `wired < declared` assertion in §1. The last hop, id → pixels, is `tests/unit/ui-frame-panel.test.ts`
 * and the scene tests; no static census can close it.
 */
const FRAME_ID_REF = /\bUI_FRAME_ASSET_ID\s*\.\s*([A-Za-z_$][\w$]*)/g;

const WIRED_FRAMES: { names: string[]; ids: string[]; unknown: string[]; sites: string[] } = (() => {
  const table = UI_FRAME_ASSET_ID as Record<string, string | undefined>;
  const names = new Set<string>();
  const sites = new Set<string>();
  for (const abs of walkTs(join(ROOT, "game"))) {
    const code = stripped(readFileSync(abs, "utf8"));
    for (const m of code.matchAll(FRAME_ID_REF)) {
      names.add(m[1] as string);
      sites.add(abs.slice(ROOT.length + 1));
    }
  }
  const sorted = [...names].sort();
  return {
    names: sorted,
    ids: sorted.map((n) => table[n]).filter((id): id is string => id !== undefined),
    unknown: sorted.filter((n) => table[n] === undefined),
    sites: [...sites].sort(),
  };
})();

/**
 * The real key builders, called over the real shipped domains.
 *
 * ⚠ EACH ROW MUST NAME A FUNCTION THAT SHIPS, AND MUST CALL IT. A row that returns a typed-out key
 * would certify its own class and prove nothing — that is the "the test supplied the precondition"
 * failure `reachability.test.ts`'s header opens with, one level down. Where a screen has a MODEL
 * builder (`buildDexEntries` is what `DexScene` renders from), the model is called rather than the
 * id helper behind it, so a screen that quietly stops asking for an identity moves this census.
 */
const KEY_BUILDERS: readonly KeyBuilder[] = [
  {
    where: "game/mapview.ts nodeArtKeys() × data/nodes/ × every year the clock reaches",
    keys: () =>
      content.nodes.flatMap((node) =>
        YEARS.flatMap((year) => {
          const keys = nodeArtKeys(node, year, balance);
          return [keys.mapKey, keys.maskKey];
        }),
      ),
  },
  {
    /*
     * ⚠ THIS ROW USED TO CALL `dexArtId` — AND THAT IS EXACTLY THE WEAKNESS THIS FILE'S HEADER WARNS
     * ABOUT, ONE LEVEL DOWN. `KEY_BUILDERS` is hand-assembled, and a hand-written row naming a
     * function no screen calls certifies its class anyway: the dex, summary and retirement slots had
     * ALREADY been repointed at the creature sprites, and this table went on producing
     * `dex-painted/dex-<name>` keys, so GATE 2a reported `dex-painted` as CONSUMED while nothing
     * drew a single plate of it. A builder row is only evidence when it calls what the screen calls.
     *
     * So it calls the real one. `creatureArtId` (game/scenes/DexScene.ts) is the shipped resolver
     * for all three slots, and `buildDexEntries` is the model `DexScene` renders from — the model,
     * not the id helper behind it, so a screen that quietly stops asking for an identity moves this
     * census with it.
     *
     * The SUMMARY CARD and the RETIREMENT WELL are not restated as a row of their own: both draw an
     * OWNED individual through `creatureArtId`/`battleSpriteKey`, whose whole key space is already
     * spanned by the `battleSpriteKey` row below (species × the ages a line can be met at × both
     * sides). A second row over the same domain would add keys this census already carries and would
     * read as coverage it is not. `tests/gates/dex-path-contract.test.ts` binds those two slots by
     * name, and `tests/unit/art-slot-fit.test.ts` drives the scenes themselves.
     */
    where: "game/scenes/DexScene.ts creatureArtId() × buildDexEntries() — the model DexScene renders",
    keys: () =>
      SEASONS.flatMap((season) =>
        buildDexEntries(content.species, season, balance).map((e) =>
          creatureArtId(e.lineId, e.ageClass, e.ancient),
        ),
      ),
  },
  {
    /*
     * ⚠ THE AGE DOMAIN IS PER LINE, AND IT IS DERIVED. Walking every line × every `AGE_CLASSES`
     * member reported six keys — `battle-{vellsire,undermere,kilnback}-{j,a}-front` — as asked for
     * with no manifest row behind them, which is a defect of THIS FILE and not of the game: an
     * Ancient can never stand in the ring at any class but the terminal one, because
     * `core/lifecycle.ts` `newOwnedCreature` forces it there (G10, "Caught Ancients never age") and
     * `game/finale.ts` `ancientAgeClass()` is the shipped statement of which class that is. Calling
     * that function rather than writing "E" means the domain moves if `AGE_CLASSES` ever does.
     */
    where: "game/ui/BattleHud.ts battleSpriteKey()/facingFor() × data/species.json × the ages a line can be met at",
    keys: () =>
      content.species.flatMap((line) => {
        const ages: readonly AgeClass[] = line.ancient === true ? [ancientAgeClass()] : AGE_CLASSES;
        return ages.flatMap((age) =>
          (["player", "enemy"] as const).map((side) => battleSpriteKey(line.id, age, facingFor(side))),
        );
      }),
  },
  {
    where: "game/mapview.ts playerArtIds()",
    keys: () => playerArtIds(),
  },
  {
    where: "game/mapview.ts interiorTextureKey() × core/interiors.ts INTERIORS",
    keys: () => INTERIORS.map((blueprint) => interiorTextureKey(blueprint.id)),
  },
  {
    /*
     * The consumer `DialogueSpeaker.portrait` waited for. `speakerHasFace` is the shipped predicate
     * the scene gates the slot on — `narration`, whose name is one space and whose `portrait` names
     * no manifest row, is excluded by the same test the scene uses rather than by a name typed here.
     */
    where: "game/scenes/DialogueScene.ts portraitAssetId()/speakerHasFace() × data/dialogue.json speakers[]",
    keys: () => DIALOGUE.speakers.filter(speakerHasFace).map((s) => portraitAssetId(s.portrait)),
  },
  {
    /*
     * The painted dialogue frame. A CONSTANT rather than a function, which is the weakest tier this
     * table carries — it proves the key is spelled in shipping code, not that it is spelled by a
     * rule. `tests/unit/dialogue-scene.test.ts` binds the draw itself; what is bound here is that
     * the constant still resolves into the manifest's own key space.
     */
    where: "game/scenes/DialogueScene.ts DIALOGUE_FRAME_ASSET_ID (the painted nine-slice ring)",
    keys: () => [DIALOGUE_FRAME_ASSET_ID],
  },
  {
    /*
     * The other four painted frames, through the shared slicer. See {@link WIRED_FRAMES} above for
     * why this is neither `UI_FRAME_ASSET_IDS` nor a list typed here. The dialogue box is not
     * double-counted — its call site passes `DIALOGUE_FRAME_ASSET_ID`, so the scan never sees it,
     * and the row above is the one that carries it.
     */
    where: "game/ui/FramePanel.ts UI_FRAME_ASSET_ID × the ids game/ call sites pass to drawFrameRing",
    keys: () => WIRED_FRAMES.ids,
  },
];

/** key -> every builder that produced it. The census this whole file is judged against. */
const ASKED: ReadonlyMap<string, string[]> = (() => {
  const out = new Map<string, string[]>();
  for (const builder of KEY_BUILDERS) {
    for (const key of builder.keys()) {
      const seen = out.get(key);
      if (seen) {
        if (!seen.includes(builder.where)) seen.push(builder.where);
      } else out.set(key, [builder.where]);
    }
  }
  return out;
})();

describe("§1 the asked census is driven, and it is not empty", () => {
  /**
   * The registration above must have TAKEN, or every resolver that consults the real-art census
   * answers with bare row ids and half the classes below are reported unconsumed for a reason in
   * this file. `registerRealAsset` returns false for a declared stand-in, which is correct and is
   * why this is a floor rather than an equality.
   */
  it("the shipped registration verb accepted the pipeline's output", () => {
    expect(REGISTERED.length).toBeGreaterThan(ROWS.length / 2);
    const ids = new Set(realAssetIds());
    for (const rowId of ["npc-bram", "trainer-maren", "prop-antler-stone", "ui-dialogue-box"]) {
      const row = ROW_BY_ID.get(rowId);
      expect(row, `the manifest no longer carries "${rowId}"`).toBeDefined();
      expect(ids.has(keyOf(row as ManifestRow)), `"${rowId}" did not register`).toBe(true);
    }
    // …and the resolver really uses it: a portrait id is NOT its own texture key.
    expect(portraitAssetId("npc-bram")).toBe("npc-static/npc-bram");
    expect(portraitAssetId("npc-bram")).not.toBe("npc-bram");
  });

  it("the ui-frame domain is scanned from real call sites, and every name it finds is a real row", () => {
    // FAIL CLOSED, three ways. A scan that finds nothing, finds a name the shipped table cannot
    // resolve, or collapses to one file is a scan that has stopped describing the game — and the
    // `ui-frame` rows it carries would be reported unconsumed for a reason that is in this file.
    expect(
      WIRED_FRAMES.unknown,
      `game/ names UI_FRAME_ASSET_ID.${WIRED_FRAMES.unknown.join(", .")}, which game/ui/FramePanel.ts ` +
        "does not define — the scan is reading a renamed or destructured table and its ids are stale",
    ).toEqual([]);
    expect(WIRED_FRAMES.ids.length, "no call site passes a UI_FRAME_ASSET_ID at all").toBeGreaterThan(0);
    expect(
      WIRED_FRAMES.sites.length,
      `only ${String(WIRED_FRAMES.sites.length)} file passes a frame id (${WIRED_FRAMES.sites.join(", ")}) — ` +
        "the five wired screens each pass their own, so a collapse to one means the scan is missing them",
    ).toBeGreaterThan(2);
    // The ids are read out of the shipped constant, so every one must be a key the manifest produces.
    // (`keysOfClass` is defined below; this is the same containment GATE 2b checks from the other side.)
    for (const id of WIRED_FRAMES.ids) {
      expect(
        Object.values(UI_FRAME_ASSET_ID as Record<string, string>),
        `"${id}" is not one of the ids game/ui/FramePanel.ts declares`,
      ).toContain(id);
    }
    // …and the DECLARED set is strictly larger than the wired one. This is the assertion that would
    // have caught handing `UI_FRAME_ASSET_IDS` to the table: if the two ever become equal, either a
    // sixth screen was wired (delete this line on purpose) or the builder has been given the
    // declared set and GATE 2c has just gone green on rows nothing draws.
    expect(
      WIRED_FRAMES.ids.length,
      "the builder is producing every declared ui-frame id — a declared set is not a consumed set",
    ).toBeLessThan(Object.keys(UI_FRAME_ASSET_ID).length);
  });

  it("every key builder is real, is called, and produces something", () => {
    expect(KEY_BUILDERS.length).toBeGreaterThan(3);
    for (const builder of KEY_BUILDERS) {
      expect(
        builder.keys().length,
        `"${builder.where}" produced NO keys — its domain is empty or the function stopped ` +
          "building ids, and every class it carries is about to be reported unconsumed for a " +
          "reason that is in this file rather than in the game",
      ).toBeGreaterThan(0);
    }
  });

  it("the census is large, and every key it produced is well-formed", () => {
    // A floor, not a count: the exact number moves whenever content does. What must never happen is
    // a census of a handful of keys silently certifying twelve classes.
    expect(ASKED.size).toBeGreaterThan(100);
    for (const key of ASKED.keys()) {
      // `assetId` is idempotent on a well-formed key; a builder emitting a path or an extension
      // would produce a key the loader can never match, and the class would look consumed anyway.
      expect(assetId(key), `builder key "${key}" is not in the loader's own id grammar`).toBe(key);
    }
  });

  it("the manifest scope is real — twelve-odd classes, two hundred-odd rows, one key each", () => {
    expect(CLASS_NAMES.length).toBeGreaterThan(8);
    expect(ROWS.length).toBeGreaterThan(150);
    // Every row must belong to a declared class, or `finalDir` cannot be resolved for it.
    for (const row of ROWS) {
      expect(CLASS_NAMES, `row "${row.id}" has class "${row.class}", which manifest.classes lacks`).toContain(
        row.class,
      );
    }
    // Two rows landing on one key would make one of them invisible AND make its class look covered.
    expect(ROW_BY_KEY.size, "two manifest rows resolve to the same texture key").toBe(ROWS.length);
    // …and no class is empty, or GATE 2a below would pass over zero rows for it.
    for (const name of CLASS_NAMES) {
      expect(keysOfClass(name).size, `manifest class "${name}" has no rows`).toBeGreaterThan(0);
    }
  });

  /**
   * BINDS the census to the shipped grammar rather than to a number.
   *
   * Each of these is a key the manifest really carries, produced by a DIFFERENT builder, so if any
   * one builder is silently returning the wrong shape this fails on that builder alone. The expected
   * value is read off the manifest row, never typed twice — a hardcoded expectation on both sides is
   * the failure mode `tests/gates/dex-path-contract.test.ts` was written after.
   */
  it("BINDS — a real row of each consumed class is in the census, derived from the row itself", () => {
    for (const rowId of ["map-hearthollow", "battle-cindril-j-front", "player-front"]) {
      const row = ROW_BY_ID.get(rowId);
      expect(row, `the manifest no longer carries "${rowId}"`).toBeDefined();
      const key = keyOf(row as ManifestRow);
      expect(ASKED.has(key), `nothing in the census asks for "${key}" (manifest row "${rowId}")`).toBe(true);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 1b. The WEAK half — which files under game/ can put a picture on the screen
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ THIS IS A TEXT SCAN AND IT IS LABELLED AS ONE. It exists for exactly one job: to go red when a
 * NEW drawing surface appears in `game/`, so {@link KEY_BUILDERS} above is told about it instead of
 * quietly reporting the class it draws as unconsumed.
 *
 * WHAT IT CAN SEE: a call written as `textureFor(`, `placeholderImage(`, `.add.image(`,
 * `.load.image(`, `.load.atlas(`, `.load.spritesheet(` or `.setTexture(` in COMMENT-STRIPPED,
 * STRING-STRIPPED source. Stripping matters and is not decoration: `game/placeholder.ts` and
 * `game/scenes/OverworldScene.ts` both discuss `add.image` at length in prose, and a raw grep counts
 * those paragraphs as drawing surfaces.
 *
 * WHAT IT CANNOT SEE: a draw through an alias or a re-export, a draw dispatched off a variable, a
 * frame pulled out of an atlas, anything a future Phaser API adds. It is corroboration, never proof
 * — the driven census above is the proof — and it must never be read as "these are all the places
 * art reaches the screen".
 */
const DRAW_CALL = /(?:\btextureFor|\bplaceholderImage|\bplaceholderTexture|\.add\.image|\.load\.image|\.load\.atlas|\.load\.spritesheet|\.setTexture)\s*\(/;

/**
 * Comments and string/template bodies blanked; newlines preserved so nothing shifts.
 *
 * ⚠ IT DOES NOT UNDERSTAND REGEX LITERALS, unlike `tests/gates/reachability.test.ts`'s lexer, which
 * does and is ~100 lines for it. A regex containing an unpaired quote would start a bogus string
 * scan and blank real code after it — which can only ever DROP a file from the census, never add
 * one, so the failure direction is a file reported as no longer drawing (red) rather than a new
 * drawing surface slipping through (green). Lifting that lexer into `tests/support/` is the right
 * fix for both files and is reported rather than done.
 */
function stripped(src: string): string {
  let out = "";
  let i = 0;
  const blank = (text: string): void => {
    for (const ch of text) out += ch === "\n" ? "\n" : " ";
  };
  while (i < src.length) {
    const ch = src[i] as string;
    const next = src[i + 1];
    if (ch === "/" && next === "/") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      blank(src.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(src.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < src.length) {
        const c = src[j] as string;
        if (c === "\\") {
          j += 2;
          continue;
        }
        if (c === ch) break;
        if (ch !== "`" && c === "\n") break;
        j += 1;
      }
      const stop = src[j] === ch ? j + 1 : j;
      out += ch + ch;
      for (const c of src.slice(i, stop)) if (c === "\n") out += "\n";
      i = stop;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function walkTs(dir: string): string[] {
  const found: string[] = [];
  const rec = (d: string): void => {
    if (!existsSync(d)) return;
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        rec(full);
      } else if (entry.name.endsWith(".ts")) found.push(full);
    }
  };
  rec(dir);
  return found;
}

const rel = (abs: string): string => abs.slice(ROOT.length + 1);

function drawingFiles(): string[] {
  return walkTs(join(ROOT, "game"))
    .filter((abs) => DRAW_CALL.test(stripped(readFileSync(abs, "utf8"))))
    .map(rel)
    .sort();
}

/**
 * The files that can put a texture on the screen today, and which builder above covers each.
 *
 * A file appearing here that is not in this list means a NEW consumer surface exists; add its key
 * builder to {@link KEY_BUILDERS} and then add the file here. A file DISAPPEARING means a consumer
 * was deleted, and the class it carried is about to be reported unconsumed — which is the report.
 */
const DRAWING_FILES: readonly string[] = [
  // The helper itself: `textureFor`/`placeholderImage`/`placeholderTexture` are defined here.
  "game/placeholder.ts",
  // maps + masks (nodeArtKeys), interiors (interiorTextureKey), the player (playerArtId).
  "game/mapview.ts",
  // the interior painting, via `paintedInteriorKey` -> `this.add.image`.
  "game/scenes/OverworldScene.ts",
  // creature-battle, via `combatantCardModel().spriteKey` -> `placeholderImage`.
  "game/ui/BattleHud.ts",
  // creature-battle, via `creatureArtId` -> `drawArtSlot` -> `placeholderImage` (the dex plate, and
  // the summary card through `SummaryScene`'s import of the same two).
  "game/scenes/DexScene.ts",
  // creature-battle again, the retirement well, via `battleSpriteKey` directly.
  "game/scenes/RetirementScene.ts",
  // npc-static / trainer-battle / prop, via `speakers[].portrait` -> `portraitAssetId`; and the
  // `ui-frame` ring, via `DIALOGUE_FRAME_ASSET_ID`.
  "game/scenes/DialogueScene.ts",
  /*
   * `ui-frame`, for the OTHER four screens. This is the shared nine-slice slicer, and it is the only
   * file that draws one: `MenuScene`, `BattleHud`, `DexScene` and `SurveyScene` call
   * `drawFrameRingIn(scene, id, rect)` and this file turns it into eight `scene.add.image` calls, so
   * §1b's scan sees this file and not theirs. Its builder is the `WIRED_FRAMES` row above, whose
   * domain is the ids those four call sites pass — which is why adding this file did NOT certify the
   * two rows nothing draws.
   */
  "game/ui/FramePanel.ts",
  /*
   * ⚠ THE ONE DRAW WITH NO CLASS BEHIND IT, and it is deliberately NOT a key builder above.
   * `TitleScene` asks for `"ui/title-banner"`, a key NO manifest row and no class can ever produce:
   * there are zero title/banner/logo/splash rows, the authored `_ui` block declares six nine-slice
   * frames and nothing else, and no class writes into a `ui/` directory. It is a permanent stand-in
   * and the reason is already recorded on the call site and in `tests/gates/dex-path-contract.ts`'s
   * header; adding it to the census would put a key with no row into a census this file then checks
   * against the manifest, which is noise, not coverage.
   */
  "game/scenes/TitleScene.ts",
];

describe("§1b the weak corroboration — no new drawing surface has appeared unnoticed", () => {
  it("the scan sees the shipped draw calls and does NOT see prose about them", () => {
    // Non-vacuity in both directions on one synthetic file, so this cannot pass over an empty regex.
    expect(DRAW_CALL.test(stripped("/* the scene calls this.add.image(x) */\nconst a = 1;\n"))).toBe(false);
    expect(DRAW_CALL.test(stripped('const s = "call placeholderImage(here)";\n'))).toBe(false);
    expect(DRAW_CALL.test(stripped("this.add.image(0, 0, key);\n"))).toBe(true);
    expect(DRAW_CALL.test(stripped("const k = textureFor(scene, id, w, h);\n"))).toBe(true);
    // …and it really is looking at the shipped tree.
    expect(walkTs(join(ROOT, "game")).length).toBeGreaterThan(20);
  });

  it("the set of files that can draw a texture is the set this gate has a builder for", () => {
    const found = drawingFiles();
    const added = found.filter((f) => !DRAWING_FILES.includes(f));
    const gone = DRAWING_FILES.filter((f) => !found.includes(f));
    const message = [
      "The set of files under game/ that can put a texture on the screen has MOVED.",
      ...added.map(
        (f) =>
          `  + ${f} draws, and this gate has no key builder for it. Add one to KEY_BUILDERS, or the ` +
          "class it draws will be reported unconsumed by GATE 2a for a reason that is in this file.",
      ),
      ...gone.map((f) => `  - ${f} no longer draws anything — a consumer was deleted.`),
      "",
      "This scan is the WEAK half (see the block comment above DRAW_CALL): it reads comment- and",
      "string-stripped source for a fixed set of call spellings and cannot see an aliased or",
      "dynamically dispatched draw. The DRIVEN census in §1 is the proof; this only keeps the",
      "hand-assembled builder table honest when a new surface appears.",
    ].join("\n");
    expect(added.length === 0 && gone.length === 0 ? true : message).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2. GATE 2a — every manifest CLASS has a consumer
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * A class whose shipped DOMAIN is empty, so no key of it can be asked for however live its consumer.
 *
 * ⚠ THIS IS NOT AN ALLOWLIST AND IT MUST NEVER BECOME ONE. An entry is only admitted when BOTH
 * halves are machine-checked in the same run: `precondition` establishes that the emptiness is a
 * property of the authored DATA (so the day the data is authored the exemption stops applying), and
 * `prove` must DRIVE a shipped builder over a synthetic domain member and get a key of that class
 * back — so the consumer's existence is demonstrated, not asserted in prose. A class with no builder
 * at all cannot satisfy `prove` and therefore cannot be listed here.
 */
interface EmptyDomainClass {
  className: string;
  /** What is empty, and WHERE the decision to leave it empty is recorded. */
  why: string;
  /** Checked. While this is false the class is judged like any other. */
  precondition: () => boolean;
  /** Must return at least one key of the class, produced by a shipped builder. */
  prove: () => readonly string[];
}

const EMPTY_DOMAIN: readonly EmptyDomainClass[] = [
  {
    className: "map-variant",
    /*
     * THE 28 YEAR-VARIANT ROWS ARE UNASKED-FOR BECAUSE NO VARIANT IS AUTHORED, NOT BECAUSE NOTHING
     * READS THEM. `core/lifecycle.ts` `mapAssetForYear` walks `NodeFile.yearVariants` backwards from
     * the current year and falls through to `node.mapAsset`; `game/mapview.ts` `nodeArtKeys` is its
     * only caller and is already in KEY_BUILDERS above. Every shipped node ships `"yearVariants": {}`
     * — build-doc §9.5 / G4 gate an overlay-diff pass before a variant may be listed, the manifest's
     * own `_yearVariantPolicy` block states it, `game/mapview.ts:132-138` states it at the call site,
     * `docs/TICKETS.md` records the standing ruling not to delete the rows, and
     * `tests/unit/manifest.test.ts` asserts the field stays empty until then.
     *
     * So this is a DATA emptiness with a live consumer, and `prove` below demonstrates that by
     * handing the real `nodeArtKeys` a node with one variant listed and reading the variant key back
     * out. The moment a variant is authored, `precondition` goes false and the class is judged like
     * every other one — which is the point: this cannot hide a consumer that stops existing.
     */
    why:
      "no node authors a yearVariants entry (build-doc §9.5 / G4 overlay-diff gate; manifest " +
      "_yearVariantPolicy; game/mapview.ts nodeArtKeys; tests/unit/manifest.test.ts)",
    precondition: () => {
      const policy = (manifestJson as unknown as { _yearVariantPolicy?: unknown })._yearVariantPolicy;
      const recorded = typeof policy === "string" ? policy.length > 0 : policy !== undefined;
      return recorded && content.nodes.every((node) => Object.keys(node.yearVariants).length === 0);
    },
    prove: () => {
      const variant = ROWS.find((r) => r.class === "map-variant");
      if (variant === undefined) return [];
      // The node the variant belongs to, found from the row's own finalFile rather than by name.
      const node = content.nodes.find((n) => keyOf(variant).startsWith(`${assetId(n.mapAsset)}-y`));
      if (node === undefined) return [];
      const firstVariantYear = balance.clock.startYear + 1;
      const listed: NodeFile = { ...node, yearVariants: { 2: variant.finalFile } };
      return [nodeArtKeys(listed, firstVariantYear, balance).mapKey];
    },
  },
];

interface ClassCoverage {
  className: string;
  finalDir: string;
  rows: number;
  asked: number;
}

function classCoverage(): ClassCoverage[] {
  return CLASS_NAMES.map((className) => {
    const keys = keysOfClass(className);
    return {
      className,
      finalDir: CLASS_RECIPES[className]?.finalDir ?? "(no finalDir)",
      rows: keys.size,
      asked: [...keys].filter((k) => ASKED.has(k)).length,
    };
  });
}

function formatUnconsumed(unconsumed: readonly ClassCoverage[]): string {
  const rows = unconsumed.reduce((n, c) => n + c.rows, 0);
  return [
    `${String(unconsumed.length)} manifest class(es) — ${String(rows)} rows — are DECLARED and`,
    "CONSUMED BY NOTHING. Every key those rows can produce was checked against a census built by",
    "calling the shipped key builders over the shipped domains (see KEY_BUILDERS); not one of them",
    "is ever asked for, so the images are generated, committed, loaded by BootScene's",
    "`queueRealAssets`, and never drawn:",
    ...unconsumed.map((c) => `  • ${c.className} — ${String(c.rows)} rows under ${c.finalDir}/`),
    "",
    "Two ways this goes green, and only two. Either a consumer is written and its key builder is",
    "added to KEY_BUILDERS above, or — if a consumer already exists and this gate has not been told",
    "about it — the builder row is added and the class turns green on the spot. It must NOT be",
    "silenced: EMPTY_DOMAIN is not an allowlist, it admits only a class whose consumer can be DRIVEN",
    "and whose emptiness is a checked property of the authored data.",
  ].join("\n");
}

describe("GATE 2a — every manifest class has a consumer", () => {
  it("names every class the pipeline declares that nothing in game/ or core/ can draw", () => {
    const exempt = new Set(EMPTY_DOMAIN.filter((e) => e.precondition()).map((e) => e.className));
    const unconsumed = classCoverage().filter((c) => c.asked === 0 && !exempt.has(c.className));
    expect(unconsumed.length === 0 || formatUnconsumed(unconsumed)).toBe(true);
  });

  it("every empty-domain exemption proves its consumer by DRIVING it, and states its precondition", () => {
    // Non-vacuity for the exemption machinery itself: an entry that cannot prove a key of its own
    // class is not an exemption, it is a class with no consumer wearing one.
    for (const entry of EMPTY_DOMAIN) {
      expect(CLASS_NAMES, `EMPTY_DOMAIN names "${entry.className}", which is not a manifest class`).toContain(
        entry.className,
      );
      expect(entry.why.length, `${entry.className}: no recorded reason`).toBeGreaterThan(20);
      expect(
        entry.precondition(),
        `${entry.className} claims an empty domain, but the domain is no longer empty (or the ` +
          "recorded decision it points at is gone) — judge it like every other class",
      ).toBe(true);
      const proven = entry.prove();
      const ofClass = keysOfClass(entry.className);
      expect(
        proven.filter((k) => ofClass.has(k)),
        `${entry.className}: driving the shipped builder produced ${JSON.stringify(proven)}, none of ` +
          "which is a key of this class — there is no live consumer to exempt",
      ).not.toEqual([]);
      // …and the class really is unasked-for today, or the exemption is dead weight hiding nothing.
      expect([...ofClass].filter((k) => ASKED.has(k))).toEqual([]);
    }
  });

  it("BINDS — a class whose only consumer is removed from the census is reported", () => {
    /*
     * THE SABOTAGE, in-file and against a REAL class.
     *
     * ⚠ IT USED TO SABOTAGE `dex-painted`, AND IT CANNOT ANY MORE — that class is CUT (Hank:
     * "the dex uses the existing creature sprites", docs/STATUS.md), so it no longer has a
     * consumer, no longer has rows, and a sabotage that removes an already-empty key set from the
     * census proves nothing. Repointed at `creature-battle`, which is what the dex, the summary
     * card, the retirement well and the battle ring all draw from now — the largest genuinely
     * consumed class in the manifest. The check is UNCHANGED in shape and strength: cripple the
     * census for one real class and the formatter must name it.
     *
     * Both the class name and the row count are read off the manifest rather than typed, so this
     * cannot drift from the pipeline the way the `35` it used to carry did.
     */
    const SABOTAGED = "creature-battle";
    const keys = keysOfClass(SABOTAGED);
    expect(keys.size, `"${SABOTAGED}" has no rows — the sabotage would prove nothing`).toBeGreaterThan(0);
    const crippled = new Map(ASKED);
    for (const key of keys) crippled.delete(key);
    const stillAsked = [...keys].filter((k) => crippled.has(k));
    expect(stillAsked).toEqual([]);
    const finalDir = CLASS_RECIPES[SABOTAGED]?.finalDir ?? "(no finalDir)";
    expect(formatUnconsumed([{ className: SABOTAGED, finalDir, rows: keys.size, asked: 0 }])).toContain(SABOTAGED);
    // …and with the census intact it is NOT reported, so the red above is the sabotage and nothing else.
    expect(classCoverage().find((c) => c.className === SABOTAGED)?.asked).toBeGreaterThan(0);
  });

  it("BINDS — a class the pipeline adds with no consumer is reported on the day it is added", () => {
    // The forward-looking half: CLASS_NAMES comes from manifest.classes, so this is what happens to
    // a new class. Simulated over the same predicate the gate uses, not over a copy of it.
    const invented: ClassCoverage = {
      className: "gate-sabotage-class",
      finalDir: "assets/final/gate-sabotage",
      rows: 7,
      asked: 0,
    };
    const unconsumed = [...classCoverage().filter((c) => c.asked === 0), invented];
    expect(formatUnconsumed(unconsumed)).toContain("gate-sabotage-class");
    expect(formatUnconsumed(unconsumed)).toContain("assets/final/gate-sabotage/");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2c. GATE 2c — and every ROW of a consumed class is asked for
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * THE SHARPER HALF OF GATE 2a, AND THE ONE A CLASS-LEVEL CHECK WOULD HIDE.
 *
 * "The class has a consumer" is satisfied by ONE row of it reaching a screen. Six `ui-frame` images
 * were generated and committed; a check that goes green because the dialogue box draws one of them
 * has certified the other five as reachable on the strength of their neighbour — which is precisely
 * the reasoning `reachability.test.ts`'s header calls out ("the kind exists, therefore the copy is
 * reachable" is what let 35 entries sit dead behind a kind enum).
 *
 * Scope: classes that ARE consumed. A class with no consumer at all is GATE 2a's report and is left
 * out of this one so the same rows are not named twice; a class whose domain is empty is exempt for
 * the same machine-checked reason it is exempt there.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════
 * `ui-sign-card-frame` — WHY THIS ONE IS STILL RED, AND WHY THAT RED IS A DECISION, NOT A TODO
 * ═════════════════════════════════════════════════════════════════════════════════════════════════
 * Five of the six `ui-frame` rows now reach a screen. The sixth is NOT the next one to wire, and it
 * is deliberately NOT exempted here — an exemption reads as "handled", and this needs an owner to
 * decide whether the sign card is a screen at all. What is recorded is the investigation, so nobody
 * closes the red by inventing the content G2 forbids:
 *
 *   NOT CONSTRUCTIBLE UNDER G2. `tools/ui-frames/SPEC.md` §4.6 authors the frame's PIXELS and one
 *   text rule, and its nine-slice table explicitly declines a position — "wherever the prop is".
 *   Building the screen would mean inventing the world position, a depth (`OverworldScene` carries
 *   no prop depth at all), the trigger, the wrap width, AND THE TEXT ITSELF. The two candidate
 *   bodies disagree about what the card even says: the corpus's `prop.*-sign-*` entries are ~180
 *   characters of prose written for the 464×68 dialogue box, while the only authored render shows a
 *   three-line dex-entry summary that no runtime code produces for a prop.
 *
 *   TWO STRUCTURAL BLOCKERS BESIDES. Its 7px asymmetric bevel is not the 4px symmetric idiom
 *   {@link drawFrameRing} slices (`game/ui/FramePanel.ts` states this at the export, and
 *   `tests/unit/ui-frame-panel.test.ts` holds it out of the panel assertions for it) — and the sign
 *   ALREADY HAS a shipped world face baked into the map at roughly one cell, which a 240×160 card
 *   would cover at about 12× its size.
 *
 * So the report below is the truthful one: one row, generated and committed, that nothing asks for.
 * The three ways it goes green are a screen that asks for it, a manifest whose derivation no longer
 * produces the row, or an owner ruling. Not a fourth.
 */
function unaskedRowsOfConsumedClasses(): { className: string; rows: string[] }[] {
  const exempt = new Set(EMPTY_DOMAIN.filter((e) => e.precondition()).map((e) => e.className));
  const out: { className: string; rows: string[] }[] = [];
  for (const className of CLASS_NAMES) {
    if (exempt.has(className)) continue;
    const keys = [...keysOfClass(className)].sort();
    const asked = keys.filter((k) => ASKED.has(k));
    if (asked.length === 0) continue; // GATE 2a's report, not this one's
    const unasked = keys.filter((k) => !ASKED.has(k));
    if (unasked.length > 0) out.push({ className, rows: unasked });
  }
  return out;
}

describe("GATE 2c — a consumed class must be consumed all the way down", () => {
  it("names every row of a consumed class that nothing ever asks for", () => {
    const partial = unaskedRowsOfConsumedClasses();
    const total = partial.reduce((n, c) => n + c.rows.length, 0);
    const message = [
      `${String(total)} manifest row(s) belong to a class that IS drawn somewhere and are themselves`,
      "asked for by nothing. Their class passes GATE 2a on the strength of a sibling row, so this is",
      "the half that check cannot see — art that is generated, committed and never requested:",
      ...partial.map((c) => `  • ${c.className}\n      ${c.rows.join("\n      ")}`),
      "",
      "Either a screen asks for the row (add its key builder to KEY_BUILDERS once it does), or the",
      "row does not belong in tools/comfy/manifest.json — and rows[] is DERIVED, so removing one",
      "means removing what it is derived FROM. Do not silence it here.",
    ].join("\n");
    expect(total === 0 || message).toBe(true);
  });

  it("BINDS — a class drawn by exactly one of its rows does NOT pass this check", () => {
    // Non-vacuity, over the real predicate: `creature-battle` is fully consumed today, so pretending
    // only one of its keys is asked for must produce a report naming the rest.
    const keys = [...keysOfClass("creature-battle")].sort();
    expect(keys.length).toBeGreaterThan(1);
    const onlyFirst = new Set(keys.slice(0, 1));
    const unasked = keys.filter((k) => !onlyFirst.has(k));
    expect(unasked.length).toBe(keys.length - 1);
    // …and with the real census it really is fully consumed, so the line above is the sabotage.
    expect(keys.filter((k) => !ASKED.has(k))).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3. GATE 2b — every AUTHORED asset reference resolves to a key the game asks for
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * An asset reference found in authored data, with where it was written.
 *
 * ⚠ THE FIELDS ARE DISCOVERED, NOT LISTED. A table of field names here would be the same instrument
 * that has failed this project four times: it can only ever find the fields somebody remembered. So
 * every JSON file under `data/` is walked and every STRING VALUE is tested against two rules that
 * are properties of the shipped pipeline rather than of a name —
 *
 *   1. the value contains `assets/final/`, the one committed home for finished art
 *      (`game/placeholder.ts` `FINAL_DIR`, build-doc §5); or
 *   2. the value IS the `id` of a row in `tools/comfy/manifest.json`.
 *
 * — and resolved to a texture key the same way the loader resolves it. `DialogueSpeaker.portrait`
 * is found by rule 2 without this file ever naming the field, and so is any field a future schema
 * adds. What the rules cannot see is a reference that is neither a final path nor a row id: an id
 * some helper later decorates into a key (`SpeciesLine.dexIds` is the shipped example) is invisible
 * here and is covered instead by GATE 2a, which asks the same question from the manifest's side.
 */
interface AuthoredRef {
  /** Repo-relative JSON file. */
  file: string;
  /** Dotted path to the value, array indices collapsed to `[]`. */
  path: string;
  value: string;
  /** The texture key the value resolves to. */
  key: string;
}

function jsonFilesUnder(dir: string): string[] {
  const found: string[] = [];
  const rec = (d: string): void => {
    if (!existsSync(d)) return;
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) rec(full);
      else if (entry.name.endsWith(".json")) found.push(full);
    }
  };
  rec(dir);
  return found.sort();
}

const DATA_FILES = jsonFilesUnder(join(ROOT, "data")).map(rel);

/** The key a value names, or null when it names no asset at all. */
function keyForAuthoredValue(value: string): string | null {
  if (value.includes("assets/final/")) return assetId(value);
  const row = ROW_BY_ID.get(value);
  return row === undefined ? null : keyOf(row);
}

function refsIn(file: string, parsed: unknown): AuthoredRef[] {
  const out: AuthoredRef[] = [];
  const walk = (node: unknown, path: readonly string[]): void => {
    if (typeof node === "string") {
      const key = keyForAuthoredValue(node);
      if (key !== null) out.push({ file, path: path.join("."), value: node, key });
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, [...path.slice(0, -1), `${path[path.length - 1] ?? ""}[]`]);
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) walk(v, [...path, k]);
    }
  };
  walk(parsed, []);
  return out;
}

function authoredRefs(files: readonly string[] = DATA_FILES): AuthoredRef[] {
  return files.flatMap((f) => refsIn(f, JSON.parse(readFileSync(join(ROOT, f), "utf8")) as unknown));
}

const AUTHORED_REFS = authoredRefs();

function formatUnreachableRefs(refs: readonly AuthoredRef[]): string {
  const byKey = new Map<string, AuthoredRef[]>();
  for (const ref of refs) {
    const seen = byKey.get(ref.key);
    if (seen) seen.push(ref);
    else byKey.set(ref.key, [ref]);
  }
  const rows = [...byKey]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, list]) => {
      const wheres = [...new Set(list.map((r) => `${r.file}#${r.path}`))].sort();
      const row = ROW_BY_KEY.get(key);
      const cls = row === undefined ? "no manifest row" : `manifest class "${row.class}"`;
      return `  • ${key}  (${cls})\n      authored at: ${wheres.join(", ")}`;
    });
  return [
    `${String(byKey.size)} asset(s) are NAMED BY AUTHORED DATA and asked for by NOTHING.`,
    "Each of these is a field somebody filled in — a required field, in the shipped schemas — whose",
    "value resolves to a texture key that no shipped key builder ever produces, so the picture it",
    "names cannot reach the screen however good the art is:",
    ...rows,
    "",
    "This is the FIELD-shaped hole tests/gates/reachability.test.ts is structurally blind to: the",
    "entries carrying these fields are perfectly reachable, and the field on them is inert. Fixing it",
    "means READING the field somewhere that draws — not deleting the field, and not deleting this",
    "check.",
  ].join("\n");
}

describe("§3 the authored scan is real before it is trusted", () => {
  it("it walked the shipped data/ tree, not a subset of it", () => {
    // Enumerated from `content`, which is loaded by core/schemas.ts from the same tree — so a node
    // file that moved, or a walk that quietly stopped recursing, is red rather than silently absent.
    expect(DATA_FILES.length).toBeGreaterThan(12);
    expect(DATA_FILES).toContain("data/dialogue.json");
    for (const node of content.nodes) {
      expect(DATA_FILES, `data/nodes/${node.id}.json was not walked`).toContain(`data/nodes/${node.id}.json`);
    }
  });

  it("it finds references, from more than one file, of both shapes", () => {
    expect(AUTHORED_REFS.length).toBeGreaterThan(50);
    expect(new Set(AUTHORED_REFS.map((r) => r.file)).size).toBeGreaterThan(2);
    // Rule 1 — an `assets/final/` path. `mapAsset` is the shipped example and it IS consumed.
    const paths = AUTHORED_REFS.filter((r) => r.value.includes("assets/final/"));
    expect(paths.length).toBeGreaterThan(0);
    // Rule 2 — a bare manifest row id. `speakers[].portrait` is the shipped example.
    const ids = AUTHORED_REFS.filter((r) => !r.value.includes("assets/final/"));
    expect(ids.length).toBeGreaterThan(0);
  });

  it("BINDS — a NEW asset-naming field with no reader is discovered by the scan", () => {
    // THE SECOND SABOTAGE. A field this file has never heard of, added to a parsed copy of a real
    // authored file, must be found — and must be found as UNREACHABLE, because nothing draws it.
    const parsed = JSON.parse(readFileSync(join(ROOT, "data/nodes/r1.json"), "utf8")) as Record<string, unknown>;
    const invented = { ...parsed, gateSabotageBanner: "assets/final/ui-frame/gate-sabotage-banner.png" };
    const found = refsIn("data/nodes/r1.json", invented);
    const sabotaged = found.find((r) => r.path === "gateSabotageBanner");
    expect(sabotaged?.key, "the scan did not see a brand-new asset-naming field").toBe(
      "ui-frame/gate-sabotage-banner",
    );
    expect(ASKED.has(sabotaged?.key ?? "")).toBe(false);
    expect(formatUnreachableRefs([sabotaged as AuthoredRef])).toContain("gateSabotageBanner");
    // …and the same scan over the SHIPPED file does not invent it, so the line above is the sabotage.
    expect(refsIn("data/nodes/r1.json", parsed).some((r) => r.path === "gateSabotageBanner")).toBe(false);
  });

  it("BINDS — a bare manifest row id is discovered without this file naming the field", () => {
    // The rule-2 half, proven on a field name the scan has never been told about.
    const row = ROWS.find((r) => r.class === "npc-static");
    expect(row).toBeDefined();
    const found = refsIn("synthetic", { some: { nested: { neverHeardOfField: (row as ManifestRow).id } } });
    expect(found.map((r) => r.path)).toEqual(["some.nested.neverHeardOfField"]);
    expect(found[0]?.key).toBe(keyOf(row as ManifestRow));
  });
});

describe("GATE 2b — every authored asset reference has a path to the screen", () => {
  it("names every authored value whose asset nothing can draw", () => {
    const unreachable = AUTHORED_REFS.filter((ref) => !ASKED.has(ref.key));
    expect(unreachable.length === 0 || formatUnreachableRefs(unreachable)).toBe(true);
  });

  /**
   * The shipped positive control: `mapAsset` and `collisionMask` are the two authored fields that
   * ARE read, and they must stay green here, or the check above is red for a reason in this file.
   */
  it("BINDS — the two authored fields that ARE read stay reachable", () => {
    for (const node of content.nodes) {
      for (const [field, value] of [
        ["mapAsset", node.mapAsset],
        ["collisionMask", node.collisionMask],
      ] as const) {
        const key = keyForAuthoredValue(value);
        expect(key, `${node.id}.${field} ("${value}") no longer resolves to a texture key`).not.toBeNull();
        expect(
          ASKED.has(key as string),
          `nothing asks for ${node.id}.${field} — the map/mask consumer moved`,
        ).toBe(true);
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 4. The mirror — a key the game asks for that the pipeline cannot produce
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 the mirror — the game must not ask for a key nothing can produce", () => {
  /**
   * `tests/gates/dex-path-contract.test.ts` asserts SET IDENTITY for the two classes it binds, and
   * that direction — a screen inventing a key space the pipeline never had — is how `dex/<name>`
   * and `battle/<lineId>/<age>/<facing>` both shipped at intersection zero. This is the same
   * question asked over the WHOLE driven census rather than two classes, so a third instance is
   * found by the suite.
   *
   * `interiors/` is the one key space in the census with no manifest class at all, and deliberately
   * so: `game/mapview.ts` `interiorAssetPath` derives a room's picture from its id — "one room, one
   * id, one picture" — precisely so no field can drift from it, and no class emits into that
   * directory. It is excluded by DIRECTORY, a property of the shipped grammar, and the exclusion is
   * checked to be real so it cannot quietly grow to cover a class.
   *
   * `ui/title-banner` — the other classless key — does not appear here at all, because `TitleScene`
   * has no row in KEY_BUILDERS. That is deliberate and is recorded where the key is written and in
   * `tests/gates/dex-path-contract.test.ts`'s header: no manifest row, no `_ui` subject and no class
   * writes into `ui/`, so putting it in the census would add a permanent orphan rather than coverage.
   */
  const CLASSLESS_DIRS: readonly string[] = ["interiors"];

  it("the classless directories are real, and each really has no manifest class", () => {
    const classDirs = new Set(Object.values(CLASS_RECIPES).map((c) => assetId(`${c.finalDir}/x`).split("/")[0]));
    for (const dir of CLASSLESS_DIRS) {
      expect(classDirs.has(dir), `"${dir}" IS a manifest class directory — do not exclude it`).toBe(false);
    }
    // Non-vacuity: the map directory IS a class directory, so the check above is discriminating.
    expect(classDirs.has("maps")).toBe(true);
  });

  it("every asked key is a key the manifest can produce, a mask, or a recorded classless space", () => {
    const masks = new Set(content.nodes.map((n) => assetId(n.collisionMask)));
    const orphans = [...ASKED.keys()]
      .filter((key) => !ROW_BY_KEY.has(key))
      .filter((key) => !masks.has(key))
      .filter((key) => !CLASSLESS_DIRS.includes(key.split("/")[0] ?? ""))
      .sort();
    const message = [
      `${String(orphans.length)} texture key(s) the shipped game ASKS FOR have no manifest row.`,
      "`textureFor` never throws — it draws a labelled stand-in — so a key the pipeline can never",
      "produce is indistinguishable at runtime from art that has not been made yet. That is exactly",
      "how `dex/<name>` and `battle/<lineId>/<age>/<facing>` both shipped at intersection zero:",
      ...orphans.map((key) => `  • ${key}\n      asked by: ${(ASKED.get(key) ?? []).join("; ")}`),
    ].join("\n");
    expect(orphans.length === 0 || message).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 5. GATE 2d — every file under assets/final/ is CLAIMED by something
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * THE DIRECTION BOTH GATES ABOVE ARE STRUCTURALLY BLIND TO, AND IT WAS FOUND BY LANDING ART.
 *
 * GATE 2a walks manifest CLASSES. GATE 2c walks manifest ROWS. Neither can see a PNG that has no
 * manifest row at all — and four of them shipped while this file was being written: the interior
 * paintings under `assets/final/interiors/`. `game/mapview.ts` `interiorAssetPath` builds their path
 * from the room id (`assets/final/${INTERIOR_ART_DIR}/${interiorId}.png`) precisely so no field can
 * drift from it, so the pipeline emits no row and the two manifest-shaped directions saw nothing at
 * all. Four shipped files, invisible to a gate whose entire job is to notice unconsumed art.
 *
 * So the third question is asked from the FILESYSTEM: every file under `assets/final/` must be
 * CLAIMED. That ordering is the whole design — enumerating the CLAIMS and checking they resolve is
 * the vacuous direction, because a loop over claims never visits an unclaimed file. This walks the
 * shipping root and requires each file to be spoken for.
 *
 * A claim is one of three things, and nothing else:
 *
 *   MANIFEST      — the file is some row's `finalFile`. The pipeline owns it.
 *   HARDCODED     — a path spelled in shipped code, listed in {@link HARDCODED_CLAIMS} BY NAME. Each
 *                   entry must CALL the shipped function that builds the path rather than typing the
 *                   directory, so a claim cannot drift from the code it speaks for, and adding one
 *                   is a deliberate edit with a stated reason — the same shape as the closed
 *                   character set in the layout gate.
 *   NOT ART       — bookkeeping the engine reads as data rather than as a picture, matched by a
 *                   named rule in {@link NOT_ART}.
 *
 * ⚠ A CLAIM IS NOT REACHABILITY. It says something addresses the path, not that a screen draws it —
 * that is GATE 2a/2c's question, asked of the classes. What this catches is the case those cannot
 * see at all: bytes shipped into the repository that nothing in the project even names.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════
 * `assets/final/atlas/` — WHY BEING EXCLUDED FROM THE BUNDLE DID NOT MAKE THE SHEETS CLAIMED
 * ═════════════════════════════════════════════════════════════════════════════════════════════════
 * The eight files under `assets/final/atlas/` (four packed sheets, ~104KB, plus a descriptor each)
 * are this gate's standing red. `game/placeholder.ts` now SUBTRACTS the directory from its glob —
 * `["../assets/final/**\/*.png", "!../assets/final/atlas/**"]` — so the sheets no longer reach
 * `dist/` and `BootScene` no longer downloads them. That is a real fix for a real cost, and it does
 * NOT make them claimed. Three reasons, recorded because the opposite reading is the tempting one:
 *
 *   1. THE QUESTION IS ABOUT THE SHIPPING ROOT, NOT THE BUNDLE. `assets/final/` is the committed
 *      home for finished art (build-doc §5), and this gate walks the repository. If "absent from
 *      dist/" excused a file, the gate could be satisfied by DELETING A LOADER — which is the exact
 *      inversion of what it asks.
 *   2. A NEGATIVE PATTERN IS NOT A CLAIM. The exclusion names the directory in order to have
 *      nothing to do with it. A HARDCODED claim says "shipped code addresses this path"; the glob
 *      says "shipped code deliberately does not". Counting it would let the gate go green on the
 *      strength of a statement that the files are unused.
 *   3. THEY ARE FURTHER FROM CLAIMED THAN BEFORE, NOT NEARER. Before the subtraction the sheets at
 *      least became textures (drawn by nothing — no `textureFor` call names an `atlas/*` id, because
 *      the data references ids like `creature-battle/vellsire`). Now no path in `game/` or `core/`
 *      names one at all, there is no `load.atlas` anywhere, and the descriptors are not in Phaser's
 *      atlas format — their frame ids are not this project's key space, which is why wiring a loader
 *      would trade a silent cost for a silently WRONG texture cache.
 *
 * WHAT HAS CHANGED IS THE DIAGNOSIS, and the message below already carries the right resolution:
 * "it is dead weight and the fix is to delete it". `game/placeholder.ts` says the same thing in its
 * own words — "a sheet is a build artefact, not art" — and a build artefact does not belong in the
 * shipping root. Emitting them outside `assets/final/` (or deleting them until the packing lane
 * emits a Phaser-format descriptor whose frames are `assetId()` keys and loads it on purpose) makes
 * them genuinely UNSHIPPED, and this gate goes green because there is nothing there to claim.
 *
 * ⚠ WHAT WOULD BE WRONG IS A `NOT_ART` RULE. A packed sheet is not bookkeeping the engine reads as
 * data; it is 161 pictures in one file. That is the one resolution this gate refuses by name.
 */

const SHIPPING_ROOT = "assets/final";

function walkFiles(dir: string): string[] {
  const found: string[] = [];
  const rec = (d: string): void => {
    if (!existsSync(d)) return;
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) rec(full);
      else found.push(rel(full));
    }
  };
  rec(dir);
  return found.sort();
}

const SHIPPED_FILES = walkFiles(join(ROOT, SHIPPING_ROOT));

interface PathClaim {
  /** Where the path is spelled in shipped code, and why the pipeline emits no row for it. */
  where: string;
  /** Repo-relative paths, PRODUCED by calling that code — never typed here. */
  paths: () => readonly string[];
}

const HARDCODED_CLAIMS: readonly PathClaim[] = [
  {
    /*
     * The interior paintings. `game/mapview.ts:83-92` states the rule: a room's picture is DERIVED
     * FROM THE ROOM ID rather than carried on the blueprint, because "a `mapAsset` field on
     * `InteriorBlueprint` would be the same string written a second time in a place that can drift
     * from this one". That is a good decision and it is why there is no manifest class to check —
     * so the claim calls the same function the engine calls, over the same shipped blueprints.
     */
    where: "game/mapview.ts interiorAssetPath() × core/interiors.ts INTERIORS",
    paths: () => INTERIORS.map((blueprint) => interiorAssetPath(blueprint.id)),
  },
  {
    /*
     * The collision masks. ENGINE DATA at ink 0/255, not art: `game/mapview.ts` `maskTextureKey`
     * reads them and `readMaskPixels` decodes them, the pipeline emits no row for one, and
     * `tests/gates/stand-in-declaration.test.ts` excludes them from its art census for the same
     * reason. Claimed from the `collisionMask` FIELD in `data/nodes/*.json`, never from a `-mask`
     * suffix — a suffix rule stops excluding anything the day a mask is named differently.
     */
    where: "data/nodes/*.json collisionMask, read by game/mapview.ts maskTextureKey()",
    paths: () => content.nodes.map((node) => node.collisionMask.replace(/^\.?\/+/, "")),
  },
];

interface NotArtRule {
  why: string;
  match: (path: string) => boolean;
}

const NOT_ART: readonly NotArtRule[] = [
  {
    /*
     * `game/placeholder.ts` globs `../assets/final/**\/stand-ins.json` and refuses to register
     * anything they list as real art. The declaration is bookkeeping the loader reads, and its
     * CONTENTS are owned by `tests/gates/stand-in-declaration.test.ts`, which re-derives the true
     * set from the pixels. Matched on the exact basename the shipped glob matches.
     */
    why: "the stand-in declaration game/placeholder.ts globs beside a directory of placeholders",
    match: (p) => p.endsWith("/stand-ins.json"),
  },
  {
    why: "git bookkeeping — keeps the shipping root in the tree while it is empty",
    match: (p) => p.endsWith("/.gitkeep"),
  },
];

function unclaimedShippedFiles(): string[] {
  const manifestOwned = new Set(ROWS.map((row) => row.finalFile.replace(/^\.?\/+/, "")));
  const hardcoded = new Set(HARDCODED_CLAIMS.flatMap((c) => c.paths()));
  return SHIPPED_FILES.filter(
    (p) => !manifestOwned.has(p) && !hardcoded.has(p) && !NOT_ART.some((r) => r.match(p)),
  );
}

describe("GATE 2d — every file under assets/final/ is claimed by something", () => {
  it("the walk is real and reaches the art the manifest has already produced", () => {
    // NON-VACUITY FROM AN INDEPENDENT SOURCE. The floor alone would survive a walk that stopped
    // recursing after one directory; binding it to the manifest's own committed output means a walk
    // that misses a subtree is red rather than quietly clean.
    expect(SHIPPED_FILES.length).toBeGreaterThan(100);
    const onDisk = ROWS.map((r) => r.finalFile.replace(/^\.?\/+/, "")).filter((p) =>
      existsSync(join(ROOT, p)),
    );
    expect(onDisk.length, "no manifest row has produced a file yet — this walk proves nothing").toBeGreaterThan(50);
    for (const path of onDisk) {
      expect(SHIPPED_FILES, `the walk missed "${path}", which exists on disk`).toContain(path);
    }
    // …and it reaches more than one directory, since every claim below is per-directory in practice.
    expect(new Set(SHIPPED_FILES.map((p) => p.split("/").slice(0, 3).join("/"))).size).toBeGreaterThan(3);
  });

  it("every hardcoded claim is live — it names shipped code and speaks for files that exist", () => {
    // A stale claim is a hole with a comment on it: it would go on excusing a directory long after
    // the code that addressed it was deleted. So each one must still resolve to something shipped.
    for (const claim of HARDCODED_CLAIMS) {
      const paths = claim.paths();
      expect(paths.length, `${claim.where} claims nothing`).toBeGreaterThan(0);
      const present = paths.filter((p) => SHIPPED_FILES.includes(p));
      expect(
        present.length,
        `${claim.where} claims ${String(paths.length)} path(s), none of which is under ` +
          `${SHIPPING_ROOT}/ — the claim is stale, or the art it speaks for was deleted`,
      ).toBeGreaterThan(0);
    }
  });

  it("names every shipped file that nothing in the project claims", () => {
    const unclaimed = unclaimedShippedFiles();
    const byDir = new Map<string, string[]>();
    for (const path of unclaimed) {
      const dir = path.slice(0, path.lastIndexOf("/"));
      const seen = byDir.get(dir);
      if (seen) seen.push(path);
      else byDir.set(dir, [path]);
    }
    const message = [
      `${String(unclaimed.length)} file(s) under ${SHIPPING_ROOT}/ are CLAIMED BY NOTHING —`,
      "no manifest row's finalFile, no named hardcoded path in shipped code, and no not-art rule.",
      "They were generated (which cost real money), committed, and are addressed by no part of this",
      "project, so neither GATE 2a nor GATE 2c can even see them:",
      ...[...byDir]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([dir, files]) => `  • ${dir}/ — ${String(files.length)} file(s)\n      ${files.join("\n      ")}`),
      "",
      "Either the file belongs to a manifest row (add it to tools/comfy/manifest.json's derivation,",
      "which means adding what it derives FROM), or shipped code addresses it by a path — in which",
      "case add a HARDCODED_CLAIMS row that CALLS that code — or it is dead weight and the fix is to",
      "delete it. Do not add a rule to NOT_ART for a picture.",
    ].join("\n");
    expect(unclaimed.length === 0 || message).toBe(true);
  });

  it("BINDS — the four interior paintings are claimed by the code that builds their path", () => {
    // The case this whole section was added for, asserted from the shipped derivation rather than
    // from the directory listing: if `interiorAssetPath` ever stops agreeing with where the files
    // are, the claim stops matching and they are reported unclaimed.
    const claimed = INTERIORS.map((blueprint) => interiorAssetPath(blueprint.id));
    expect(claimed.length).toBeGreaterThan(0);
    for (const path of claimed) {
      expect(SHIPPED_FILES, `${path} is derived by game/mapview.ts but is not on disk`).toContain(path);
    }
    // …and they really have no manifest row, which is why the other two gates cannot see them.
    const manifestOwned = new Set(ROWS.map((r) => r.finalFile.replace(/^\.?\/+/, "")));
    for (const path of claimed) expect(manifestOwned.has(path)).toBe(false);
  });

  it("BINDS — an unclaimed file is reported, and a claimed one is not", () => {
    // Non-vacuity for the predicate itself, over a synthetic path that no claim can reach.
    const manifestOwned = new Set(ROWS.map((r) => r.finalFile.replace(/^\.?\/+/, "")));
    const hardcoded = new Set(HARDCODED_CLAIMS.flatMap((c) => c.paths()));
    const claims = (p: string): boolean =>
      manifestOwned.has(p) || hardcoded.has(p) || NOT_ART.some((r) => r.match(p));
    expect(claims(`${SHIPPING_ROOT}/gate-sabotage/nobody-owns-this.png`)).toBe(false);
    // A real row, a real hardcoded path and a real not-art file all ARE claimed.
    const row = ROWS.find((r) => existsSync(join(ROOT, r.finalFile)));
    expect(row).toBeDefined();
    expect(claims((row as ManifestRow).finalFile)).toBe(true);
    const interior = INTERIORS[0];
    expect(interior).toBeDefined();
    expect(claims(interiorAssetPath((interior as { id: string }).id))).toBe(true);
    expect(claims(`${SHIPPING_ROOT}/dex-painted/stand-ins.json`)).toBe(true);
  });
});
