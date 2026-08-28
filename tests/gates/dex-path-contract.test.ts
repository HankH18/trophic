/**
 * tests/gates/dex-path-contract.test.ts — T-19.
 *
 * THE DEFECT THIS GATE EXISTS FOR. `game/survey-view.ts::dexArtId` returned `dex/<name>`. The image
 * pipeline can only ever produce `assets/final/dex-painted/dex-<name>.png`, which
 * `game/placeholder.ts::assetId` reduces to `dex-painted/dex-<name>`. Measured intersection of the
 * keys the screen asked for with the 35 committed `dex-painted` manifest rows: ZERO. Not one plate
 * could reach the screen.
 *
 * WHY NOTHING CAUGHT IT. Three separate silences lined up:
 *   1. `textureFor` falls back to a labelled stand-in and never throws — a wrong key and an unbuilt
 *      asset are indistinguishable at runtime, so EVERY key fell back and the wrong one hid in the
 *      crowd.
 *   2. `assetId` is a pure string strip with no validation. `assetId("dex/cindril")` returns
 *      `"dex/cindril"`. Any test that round-trips a key through it stays green under this bug —
 *      which is precisely what `tests/unit/year-turn-ux.test.ts` does.
 *   3. The one dex test that existed, `tests/unit/survey-view.test.ts`'s "asks for an asset id per
 *      identity", asserted `entry.artId === dexArtId(entry.dexId)` — it RESTATED the function, so it
 *      could never fail on a manifest disagreement.
 *
 * So the gate below never compares the screen to itself. It derives the expected key set from the
 * COMMITTED MANIFEST ROWS and asserts set identity against what the screen actually asks for. Either
 * side moving turns it red.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ THE DEX CLASS THIS FILE WAS NAMED AFTER IS CUT, AND THE ROW MOVED WITH IT (NOT THE CHECK)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * build-doc §9.4 wrote the fallback in advance — *"If it can't reach approval in one supervised
 * loop, cut line C4 applies (dex falls back to upscaled pixel sprites…)"* — and §15's cut list
 * carries it as **C-4 painted dex class**. The owner took it, relayed from the art-lane session and
 * recorded in `docs/STATUS.md` under "Owner rulings received but NOT yet implemented":
 *
 *     "**The dex uses the existing creature sprites**, so the 35 `dex-painted` manifest rows are
 *      dead and `assets/final/dex-painted/` should be removed rather than kept."
 *
 * The ruling had reached the art lane and NOT the code: all three slots — the 128² dex plate, the
 * 96² team card and the 48² Legacy portrait well — still asked for `dex-painted/dex-<name>`, and
 * every one of those 35 PNGs is a DECLARED STAND-IN (`assets/final/dex-painted/stand-ins.json`), so
 * not one of the three had real art for any line. Cindril included, on the never-cut Legacy beat.
 *
 * ⚠ THE CHECK ITSELF IS UNTOUCHED — the same rule the `player` row's 9→1 collapse was held to.
 * Still an exact set comparison in BOTH directions, still non-vacuous, still 1-to-1, still derived
 * from the committed rows on one side and driven through shipping code on the other. What moved is
 * the class the row names, and it had to: a set-identity gate whose two sides are ruled apart is a
 * gate that reports a decision as a defect.
 *
 * AND THE ROW GOT STRONGER, not weaker. It now also asserts what the old one could not: that every
 * key the three slots ask for names a file that EXISTS and is NOT a declared stand-in. Under the old
 * key that assertion would have failed 35 times out of 35, which is the whole finding.
 *
 * ⚠ THE `player` EXPECTATION MOVED FROM 9 TO 1, AND BOTH SIDES MOVED TOGETHER. Hank's ruling —
 * *"we're switching to the player character always being facing forward and doing the skipping
 * movement as it moves around"* — retires the `back` and `side` views (the screen can never ask for
 * a view the player never turns to) and the six §9.6 walk frames (the cycle landed as the procedural
 * bob, L5's committed fallback, whose third term is a horizontal flip rather than a frame). So
 * `game/mapview.ts` `playerArtIds()` returns one key and `tools/comfy/manifest.json` carries one
 * `player` row.
 *
 * STILL NOT COVERED, and deliberately named rather than silently omitted: `game/scenes/TitleScene.ts`'s
 * `"ui/title-banner"`. It is the same defect class but it is NOT the same fix, and it is the one
 * screen this table cannot bind — because there is nothing to bind it TO. `tools/comfy/manifest.json`
 * carries zero rows matching title / banner / logo / splash; its authored `_ui` block declares six
 * nine-slice FRAMES and nothing else; and there is no `ui/` directory in the manifest at all (the
 * ui-frame class writes into `assets/final/ui-frame/`). Emitting a row would mean authoring a new
 * `_ui` subject string with no bible line to cite, which is the G2 violation, and a wordmark is not
 * a nine-slice frame so it would need a new CLASS as well. A `SCREENS` row here would assert set
 * identity against the empty set and pass vacuously, which is worse than the gap it papers over.
 *
 * WHAT THIS FILE DOES NOT DO, so a green here is not read as more than it is: it binds the KEY
 * SPACE. That a mounted scene really passes the key to `placeholderImage`, and at what size it lands
 * on screen, is `tests/unit/art-slot-fit.test.ts`, which drives the three real scenes.
 */
import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { newOwnedCreature } from "../../core/lifecycle";
import { validateContent } from "../../core/schemas";
import { AGE_CLASSES, SEASONS } from "../../core/types";
import type { AgeClass, SpeciesLine } from "../../core/types";
import { assetId, placeholderKey } from "../../game/placeholder";
import { buildDexEntries, buildSummaryCard } from "../../game/survey-view";
import { battleSpriteKey } from "../../game/ui/BattleHud";
import manifest from "../../tools/comfy/manifest.json";

/*
 * `game/mapview.ts` reaches the engine for exactly one value (`Phaser.Loader.Events.COMPLETE` in
 * `ensureNodeArt`) and `game/scenes/DexScene.ts` reaches it for one more — the base class it
 * extends. `import "phaser"` throws `window is not defined` under vitest's node environment, so the
 * key grammar this gate binds would otherwise be unreachable from a test.
 *
 * The stub carries those two and nothing else: `Scene` is an EMPTY class, so it is deliberately too
 * small to stand in for the engine and nothing here can accidentally test Phaser. Only
 * `creatureArtId` — a pure string function — is imported from that module; the scene's own drawing
 * is driven, with a recording stub, by `tests/unit/art-slot-fit.test.ts`.
 */
vi.mock("phaser", () => ({
  default: { Loader: { Events: { COMPLETE: "complete" } }, Scene: class {} },
}));
/* eslint-disable import/first -- must follow the mock above. */
import { playerArtIds } from "../../game/mapview";
import { creatureArtId } from "../../game/scenes/DexScene";
/* eslint-enable import/first */

/** The three fields of a manifest row this file reads. `tests/unit/manifest.test.ts` owns the rest. */
interface ManifestRow {
  id: string;
  class: string;
  finalFile: string;
}

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const content = validateContent();
const balance = content.balance;
const ROWS = manifest.rows as unknown as readonly ManifestRow[];

/** Every texture key the manifest can produce for a class, derived — never typed out here. */
function manifestKeys(className: string): Set<string> {
  return new Set(ROWS.filter((row) => row.class === className).map((row) => assetId(row.finalFile)));
}

/**
 * Every asset id the pipeline has declared a STAND-IN rather than art.
 *
 * Read from the same `stand-ins.json` files `game/placeholder.ts` globs, so this is the pipeline's
 * own statement and not a second opinion. It is what makes the "the slots now have real art"
 * assertion mean something: under the cut `dex-painted` key every one of the 35 plates is in here.
 */
function declaredStandIns(): Set<string> {
  const out = new Set<string>();
  for (const dir of new Set(ROWS.map((row) => row.finalFile.replace(/\/[^/]+$/, "")))) {
    const file = resolve(ROOT, dir, "stand-ins.json");
    if (!existsSync(file)) continue;
    const listed = (JSON.parse(readFileSync(file, "utf8")) as { standIns?: unknown }).standIns;
    if (Array.isArray(listed)) for (const id of listed) out.add(String(id));
  }
  return out;
}

const STAND_INS = declaredStandIns();

/** The file a texture key resolves to under `assets/final/`, using the class's own `finalDir`. */
function fileForKey(key: string): string {
  return resolve(ROOT, "assets/final", `${key}.png`);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The three creature slots, DRIVEN — no age domain is written down here
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * One owned individual of `line` at `age`, built by core.
 *
 * ⚠ THE AGE DOMAIN IS NOT RESTATED, IT IS DRIVEN. Every line is asked for all three
 * `AGE_CLASSES` and `core/lifecycle.ts` `newOwnedCreature` answers with the class the creature
 * ACTUALLY has — it pins an Ancient to the terminal one (G10, "Caught Ancients never age"). So the
 * 27 lines × 3 classes collapse to exactly the forms the game can own, without this file knowing
 * the rule. Writing `line.ancient ? ["E"] : AGE_CLASSES` here would be the restatement
 * `tests/unit/battle-view.test.ts` flags as its own blind spot.
 */
function owned(line: SpeciesLine, age: AgeClass) {
  return newOwnedCreature(
    { uid: `probe-${line.id}-${age}`, lineId: line.id, age, level: 5, caughtYear: balance.clock.startYear },
    line,
    balance,
  );
}

/** Every key the DEX slot can ask for — driven through the model `DexScene` renders. */
function dexSlotKeys(): string[] {
  return SEASONS.flatMap((season) =>
    buildDexEntries(content.species, season, balance).map((entry) =>
      creatureArtId(entry.lineId, entry.ageClass, entry.ancient),
    ),
  );
}

/** Every key the TEAM CARD slot can ask for — driven through `buildSummaryCard` and core's aging. */
function summarySlotKeys(): string[] {
  return content.species.flatMap((line) =>
    AGE_CLASSES.map((age) => {
      const card = buildSummaryCard({
        creature: owned(line, age),
        species: content.species,
        moves: content.moves.moves,
        balance,
        currentYear: balance.clock.startYear,
      });
      return creatureArtId(card.lineId, card.age, card.ancient);
    }),
  );
}

/**
 * Every key the RETIREMENT PORTRAIT WELL can ask for.
 *
 * `game/scenes/RetirementScene.ts` draws `battleSpriteKey(offer.parent.lineId, offer.parent.age,
 * "front")` off a `ParentCard`, which is built from the retired `OwnedCreature` — so the same
 * `newOwnedCreature` domain, through the same expression the scene uses. The DRIVEN version, off a
 * real year turn and a mounted scene, is `tests/unit/art-slot-fit.test.ts`; this is the key space.
 */
function retirementSlotKeys(): string[] {
  return content.species.flatMap((line) =>
    AGE_CLASSES.map((age) => {
      const creature = owned(line, age);
      return battleSpriteKey(creature.lineId, creature.age, "front");
    }),
  );
}

function creatureSlotKeys(): Set<string> {
  return new Set([...dexSlotKeys(), ...summarySlotKeys(), ...retirementSlotKeys()]);
}

/**
 * The classes whose screen-side key producer is bound to the manifest. One row per asset class; the
 * `asked` thunk must return every key the game can ever request for that class.
 */
const SCREENS = [
  {
    name: "creature sprites — the dex plate, the team portrait and the Legacy portrait well",
    manifestClass: "creature-battle",
    // 24 aging lines × 3 forms + 3 Ancients × 1 = 75 forms, ONE view each (the back view is cut).
    // build-doc §9.7's 154 predates the third Ancient and the back cut; the derivation wins.
    expectedCount: 75,
    asked: creatureSlotKeys,
  },
  {
    name: "player overworld sprites",
    manifestClass: "player",
    // ONE. The player always faces forward (so there is no `back` or `side` to ask for) and the
    // §9.6 cycle is the procedural bob (so there is no step frame to ask for) — see this file's
    // header. `manifest._player.statics` is `["front"]` and `walkFrames` is empty, which is the
    // same decision written on the pipeline's side of the seam.
    expectedCount: 1,
    asked: (): Set<string> => new Set(playerArtIds()),
  },
] as const;

describe("T-19 — every asset key a screen asks for is a key the pipeline can produce", () => {
  for (const screen of SCREENS) {
    it(`${screen.name}: SET IDENTITY between the screen's keys and the committed manifest rows`, () => {
      const produced = manifestKeys(screen.manifestClass);
      expect(produced.size, `${screen.manifestClass} rows in the manifest`).toBe(screen.expectedCount);

      // The assertion. Not "every asked key exists" and not "every row is asked for" — BOTH, so a
      // screen that quietly drops an identity is as red as one that invents a key.
      expect([...screen.asked()].sort()).toEqual([...produced].sort());
    });
  }

  it("BINDS — the check refuses BOTH shapes the dex has invented, and accepts the shipped one", () => {
    // Non-vacuity. If `produced` were empty or the comparison were loose, the set identity above
    // would pass while proving nothing; these assertions make that impossible.
    const produced = manifestKeys("creature-battle");
    const shipped = creatureArtId("cindril-line", "J", false);
    expect(produced.has(shipped), "the shipped shape MUST be a manifest key").toBe(true);
    // The pre-T-19 literal, and the CUT painted-plate key that replaced it. Neither is a
    // creature-battle row, and the shipped key is a different string from both — so the line above
    // is not comparing a value to itself.
    for (const retired of ["dex/cindril", "dex-painted/dex-cindril"]) {
      expect(produced.has(retired), `"${retired}" must NOT be a creature-battle key`).toBe(false);
      expect(shipped).not.toBe(retired);
      // …and `assetId` does not rescue either of them, which is why the fallback was silent.
      expect(assetId(retired)).toBe(retired);
    }
    // The cut class's key space is real and is disjoint from what the screens now ask for — so this
    // test cannot pass merely because the manifest lost its dex rows.
    const cutClass = manifestKeys("dex-painted");
    expect(cutClass.size, "the dex-painted rows are still in the manifest — see this file's header").toBe(35);
    expect([...cutClass].filter((key) => produced.has(key))).toEqual([]);
  });

  it("THE RULING BOUGHT REAL ART — no creature slot resolves to a declared stand-in", () => {
    /*
     * THE MEASUREMENT THAT IS THE WHOLE FINDING. `assets/final/dex-painted/stand-ins.json` declares
     * all 35 painted plates to be generated black plates with a label, and `game/placeholder.ts`
     * refuses to register a declared stand-in as real art — so under the old key EVERY one of the
     * three slots drew a labelled box for EVERY line. This asserts the other side of the ruling:
     * the keys the slots ask for now name files that exist and that nothing has declared a stand-in.
     */
    expect(STAND_INS.size, "no stand-in declaration was read at all — this check would be vacuous")
      .toBeGreaterThan(0);
    // Non-vacuity in the other direction: the instrument really does see the cut class as stand-ins.
    expect(STAND_INS.has("dex-painted/dex-cindril")).toBe(true);

    const asked = [...creatureSlotKeys()].sort();
    expect(asked.length).toBe(75);
    for (const key of asked) {
      expect(STAND_INS.has(key), `"${key}" is a DECLARED STAND-IN, not art`).toBe(false);
      expect(existsSync(fileForKey(key)), `"${key}" names no file under assets/final/`).toBe(true);
    }
  });

  it("NO BACK KEY CAN BE SPELLED, on either side of the seam", () => {
    /*
     * Hank's ruling — "we're not going to have the backs of any of the creatures. Both creatures are
     * going to be facing forward in battle" — is enforced in the type system (`Facing` is the
     * one-member union `"front"`, so `battleSpriteKey(..., "back")` does not compile) and in the
     * generator (`classes["creature-battle"].views` holds only `front`). This is the runtime half.
     *
     * ⚠ THE OBVIOUS CHECK IS WRONG AND WOULD BE RED FOREVER: a species line is called
     * `kilnback-line`, so `key.includes("back")` matches `creature-battle/battle-kilnback-e-front`,
     * which is a shipped FRONT sprite. The facing is the last dash-segment; that is what is tested.
     */
    const produced = manifestKeys("creature-battle");
    const asked = creatureSlotKeys();
    const facingOf = (key: string): string => key.slice(key.lastIndexOf("-") + 1);
    for (const key of [...produced, ...asked]) {
      expect(facingOf(key), `"${key}" is not a front key`).toBe("front");
    }
    // The trap itself, asserted so the loop above cannot be "fixed" back into a substring match.
    expect("creature-battle/battle-kilnback-e-front".includes("back")).toBe(true);
    expect(facingOf("creature-battle/battle-kilnback-e-front")).toBe("front");
    expect(produced.has("creature-battle/battle-kilnback-e-front")).toBe(true);
    // And no row of ANY class anywhere spells a back facing.
    expect([...new Set(ROWS.map((r) => assetId(r.finalFile)))].filter((k) => facingOf(k) === "back")).toEqual([]);
  });

  it("BINDS — the same check refuses the shape mapview used to invent for the player", () => {
    // Non-vacuity for the `player` row, in the same shape as the creature one above. The literal this
    // replaces was `"sprites/player"`; `assetId` leaves it untouched, so it would have been asked
    // for verbatim and matched nothing.
    const produced = manifestKeys("player");
    expect(produced.size, "the manifest must carry the player row").toBe(1);
    expect(assetId("sprites/player"), "assetId does not rescue the old literal").toBe("sprites/player");
    expect(produced.has("sprites/player"), "the pre-fix shape must NOT be a manifest key").toBe(false);
    // No manifest row of ANY class lives under `sprites/`, which is why the old key could never
    // resolve — asserted rather than asserted-about-one-class.
    const everyKey = new Set(ROWS.map((row) => assetId(row.finalFile)));
    expect([...everyKey].some((key) => key.startsWith("sprites/"))).toBe(false);
    // The shipped shape MUST be a manifest key, and it is a different string from the old one.
    expect(produced.has("player/player-front")).toBe(true);
    expect(playerArtIds()).toContain("player/player-front");
    expect(playerArtIds()).not.toContain("sprites/player");
  });

  it("NO RETIRED PLAYER VIEW OR STEP FRAME CAN BE SPELLED, on either side of the seam", () => {
    /*
     * The other half of the 9-to-1 collapse, and the half a count alone does not make. `expectedCount:
     * 1` above would also be satisfied by a manifest that kept ONE of the retired rows and dropped
     * `front`, or by a screen that asked for `player/player-side` and a manifest that answered it.
     * This says which one survived, by name, on both sides.
     *
     * It is also STRICTLY STRONGER than checking that the files are absent: a missing file proves
     * nothing at all, because every key falls back to a stand-in. What is asserted here is that the
     * key cannot be NAMED — not that its art has not been made yet.
     */
    const produced = manifestKeys("player");
    const asked = new Set(playerArtIds());
    for (const retired of ["back", "side", "step-left", "step-right", "stand"]) {
      expect(
        [...produced].filter((key) => key.includes(retired)),
        `the manifest still carries a "${retired}" player row — the ruling moved only one side of the seam`,
      ).toEqual([]);
      expect(
        [...asked].filter((key) => key.includes(retired)),
        `game/mapview.ts can still spell a "${retired}" player key`,
      ).toEqual([]);
    }
    // Non-vacuity: the survivor is named, so this cannot pass over two empty sets.
    expect([...asked]).toEqual(["player/player-front"]);
    expect([...produced]).toEqual(["player/player-front"]);
  });

  it("no screen key in the SCREENS table collides with another class's key space", () => {
    // Two producers landing on one key would make both set-identity checks pass while the game drew
    // the wrong picture. Asserted across the table rather than per row.
    const seen = new Map<string, string>();
    for (const screen of SCREENS) {
      for (const key of screen.asked()) {
        const owner = seen.get(key);
        expect(owner, `"${key}" is asked for by both ${String(owner)} and ${screen.name}`).toBeUndefined();
        seen.set(key, screen.name);
      }
    }
    expect(seen.size).toBe(75 + 1);
  });

  it("the key the screen asks for IS the texture key the loader registers", () => {
    // `game/placeholder.ts` registers art by `assetId(<path under assets/final/>)`, so the key must
    // survive that transform unchanged or the sprite still cannot be found.
    const row = ROWS.find((r) => r.id === "battle-cindril-j-front");
    expect(row, "the manifest must still carry a battle-cindril-j-front row").toBeDefined();
    const key = creatureArtId("cindril-line", "J", false);
    // Derived from the manifest row, NOT typed twice — a hardcoded expectation on both sides is the
    // failure mode this whole file exists to prevent.
    expect(key).toBe(assetId((row as ManifestRow).finalFile));
    expect(assetId(key), "assetId is idempotent on a well-formed key").toBe(key);
  });

  it("the REAL dex screen — not just the helper — asks only for keys the manifest can produce", () => {
    // `buildDexEntries` is what `DexScene` renders from. Binding the helper alone would leave the
    // path from entry to screen unbound, which is how the original test managed to be green.
    const produced = manifestKeys("creature-battle");
    const entries = buildDexEntries(content.species, "spring", balance);
    expect(entries.length).toBe(35);
    const keys = entries.map((entry) => creatureArtId(entry.lineId, entry.ageClass, entry.ancient));
    for (const [i, key] of keys.entries()) {
      expect(produced.has(key), `DexEntry "${entries[i]?.dexId}" asks for "${key}"`).toBe(true);
    }
    /*
     * INJECTIVE — two named identities must never land on one picture.
     *
     * Held here because it moved: `tests/unit/survey-view.test.ts` asserted it as
     * `entries.filter(e => e.artId === entry.artId).length === …`, which it could only do while the
     * model carried an art id, and that whole assertion RESTATED `dexArtId` (this file's header
     * names it as one of the three silences that let T-19 ship). Asserted against the real key
     * builder instead, so it is a property of what the screen asks for.
     */
    expect(new Set(keys).size, "two dex identities resolve to the same sprite").toBe(entries.length);
  });

  it("THE ANCIENTS — the dex asks for the one form their line actually ships", () => {
    /*
     * THE DEFECT THIS CLOSES, and it is only reachable because the slots moved to the sprite class.
     * `game/survey-view.ts` `ageClassOfDexId` resolves a dex identity to the FIRST age class whose
     * form name matches, and an Ancient's three form names are IDENTICAL — so its entry reports the
     * juvenile class. `tools/comfy/comfy-batch.ts::artFormsOf` ships an Ancient exactly ONE form,
     * and `core/lifecycle.ts` `newOwnedCreature` pins an owned one to the terminal class (G10).
     * Without the clamp in `creatureArtId` the three Ancients would ask for six keys that no
     * manifest row and no file can answer, and would draw a stand-in for a creature whose sprite is
     * on disk. Named by DERIVATION (`line.ancient`), never by species id — G2.
     */
    const ancients = content.species.filter((line) => line.ancient);
    expect(ancients.length, "no Ancient in the shipped roster — this check would be vacuous").toBe(3);
    const produced = manifestKeys("creature-battle");
    const entries = buildDexEntries(content.species, "spring", balance);

    for (const line of ancients) {
      const rows = [...produced].filter((key) => key.startsWith(`creature-battle/battle-${line.id.replace(/-line$/, "")}-`));
      expect(rows.length, `${line.id} is shipped at more than one form`).toBe(1);
      const mine = entries.filter((entry) => entry.lineId === line.id);
      expect(mine.length, `${line.id} has more than one dex identity`).toBe(1);
      // The entry still REPORTS the juvenile class — that is the model's own answer and is not
      // changed here. What is asserted is that the ART slot does not follow it off a cliff.
      const entry = mine[0];
      expect(entry).toBeDefined();
      if (!entry) return;
      expect(creatureArtId(entry.lineId, entry.ageClass, entry.ancient)).toBe(rows[0]);
      // …and the unclamped key really is the broken one, so the clamp is doing work.
      const unclamped = battleSpriteKey(entry.lineId, entry.ageClass, "front");
      expect(unclamped).not.toBe(rows[0]);
      expect(produced.has(unclamped), `"${unclamped}" would have no manifest row`).toBe(false);
      expect(existsSync(fileForKey(unclamped)), `"${unclamped}" would name no file`).toBe(false);
    }
  });

  it("the summary card and the retirement portrait resolve into the same key space", () => {
    // Both slots draw an OWNED individual, so their domain is whatever `newOwnedCreature` can
    // produce — driven above rather than restated. They were broken by the same key and are fixed by
    // the same ruling, so they are held to the same contract rather than assumed to follow.
    const produced = manifestKeys("creature-battle");
    for (const key of [...summarySlotKeys(), ...retirementSlotKeys()]) {
      expect(produced.has(key), `an owned individual asks for "${key}"`).toBe(true);
    }
    // Non-vacuity: both slots really do span the whole shipped roster.
    expect(new Set(summarySlotKeys()).size).toBe(75);
    expect(new Set(retirementSlotKeys()).size).toBe(75);
  });

  it("a missing sprite still draws a labelled stand-in carrying the key", () => {
    // The placeholder contract (build-doc §9 / G-placeholder): the stand-in must NAME the asset it
    // is standing in for, or a reviewer cannot tell an unbuilt sprite from a mis-keyed one — the
    // exact confusion this file opens with.
    const key = creatureArtId("cindril-line", "J", false);
    const standIn = placeholderKey(key, 128, 128);
    expect(standIn).toContain(key);
    expect(standIn, "stable for the same key and box").toBe(placeholderKey(key, 128, 128));
    // Two identities must never collapse onto one stand-in, or two cards render the same picture.
    expect(placeholderKey(creatureArtId("cindril-line", "A", false), 128, 128)).not.toBe(standIn);
    // Size is part of the key, so the same creature in three different slots gets three stand-ins.
    expect(placeholderKey(key, 96, 96)).not.toBe(standIn);
    expect(placeholderKey(key, 48, 48)).not.toBe(standIn);
  });
});
