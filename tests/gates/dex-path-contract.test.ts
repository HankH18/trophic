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
 *      asset are indistinguishable at runtime, and `assets/final/` is empty today, so EVERY key
 *      falls back and the wrong one hides in the crowd.
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
 * This is the SECOND instance of this bug — `game/ui/BattleHud.ts` invented
 * `battle/<lineId>/<age>/<facing>` against a manifest already committed to
 * `creature-battle/battle-<stem>-<age>-<facing>`, also at intersection zero. That one is bound by
 * `tests/unit/battle-view.test.ts`; this file is the same shape for the dex class, and `SCREENS`
 * below is a table so the remaining unbound classes can be added as they are fixed.
 *
 * `game/mapview.ts`'s `"sprites/player"` WAS the second open instance named here and is now FIXED
 * and bound: the manifest has 9 rows under `player/` and no `sprites/` directory in any class, so
 * the intersection was zero. `playerArtId` replaces the literal and the `player` row below holds it
 * to the same set identity as the dex plates.
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
 * The reason is recorded in a comment on the call site itself; add the row here the moment a
 * manifest row exists.
 */
import { describe, expect, it, vi } from "vitest";
import { validateContent } from "../../core/schemas";
import { assetId, placeholderKey } from "../../game/placeholder";
import { buildDexEntries, dexArtId } from "../../game/survey-view";
import manifest from "../../tools/comfy/manifest.json";

// `game/mapview.ts` is the only module below that reaches the engine, and it does so for exactly one
// value — `Phaser.Loader.Events.COMPLETE` in `ensureNodeArt`. `import "phaser"` throws
// `window is not defined` under vitest's node environment, so the key grammar this gate binds would
// otherwise be unreachable from a test. The stub carries that one constant and nothing else: it is
// deliberately too small to stand in for the engine, so nothing here can accidentally test Phaser.
vi.mock("phaser", () => ({ default: { Loader: { Events: { COMPLETE: "complete" } } } }));
// eslint-disable-next-line import/first -- must follow the mock above.
import { playerArtIds } from "../../game/mapview";

/** The three fields of a manifest row this file reads. `tests/unit/manifest.test.ts` owns the rest. */
interface ManifestRow {
  id: string;
  class: string;
  finalFile: string;
}

const content = validateContent();
const balance = content.balance;

/** Every texture key the manifest can produce for a class, derived — never typed out here. */
function manifestKeys(className: string): Set<string> {
  return new Set(
    (manifest.rows as ManifestRow[])
      .filter((row) => row.class === className)
      .map((row) => assetId(row.finalFile)),
  );
}

/**
 * The classes whose screen-side key producer is bound to the manifest. One row per asset class; the
 * `asked` thunk must return every key the game can ever request for that class.
 */
const SCREENS = [
  {
    name: "painted dex plates",
    manifestClass: "dex-painted",
    expectedCount: 35, // bible §4 / build-doc §9.4 — 35 named dex identities.
    asked: (): Set<string> =>
      new Set(content.species.flatMap((line) => line.dexIds.map((dexId) => dexArtId(dexId)))),
  },
  {
    name: "player overworld sprites",
    manifestClass: "player",
    // build-doc §9.6 / manifest `_player`: three views (front, back, side) x three step phases
    // (standing, step-left, step-right). `game/scenes/OverworldScene.ts` requests only the standing
    // front today — the other eight are reachable through `playerPlaceholderKey`'s view/step
    // arguments, and set identity is what stops the grammar and the manifest drifting apart before
    // the walk cycle lands.
    expectedCount: 9,
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

  it("BINDS — the check refuses the shape this screen used to invent, and accepts the shipped one", () => {
    // Non-vacuity. If `produced` were empty or the comparison were loose, the set identity above
    // would pass while proving nothing; these two assertions make that impossible.
    const produced = manifestKeys("dex-painted");
    expect(produced.has("dex/cindril"), "the pre-T-19 shape must NOT be a manifest key").toBe(false);
    expect(produced.has(dexArtId("Cindril")), "the shipped shape MUST be a manifest key").toBe(true);
    // …and the two really are different strings, so the line above is not comparing a value to itself.
    expect(dexArtId("Cindril")).not.toBe("dex/cindril");
  });

  it("BINDS — the same check refuses the shape mapview used to invent for the player", () => {
    // Non-vacuity for the `player` row, in the same shape as the dex one above. The literal this
    // replaces was `"sprites/player"`; `assetId` leaves it untouched, so it would have been asked
    // for verbatim and matched nothing.
    const produced = manifestKeys("player");
    expect(produced.size, "the manifest must carry the player rows").toBe(9);
    expect(assetId("sprites/player"), "assetId does not rescue the old literal").toBe("sprites/player");
    expect(produced.has("sprites/player"), "the pre-fix shape must NOT be a manifest key").toBe(false);
    // No manifest row of ANY class lives under `sprites/`, which is why the old key could never
    // resolve — asserted rather than asserted-about-one-class.
    const everyKey = new Set((manifest.rows as ManifestRow[]).map((row) => assetId(row.finalFile)));
    expect([...everyKey].some((key) => key.startsWith("sprites/"))).toBe(false);
    // The shipped shape MUST be a manifest key, and it is a different string from the old one.
    expect(produced.has("player/player-front")).toBe(true);
    expect(playerArtIds()).toContain("player/player-front");
    expect(playerArtIds()).not.toContain("sprites/player");
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
    expect(seen.size).toBe(35 + 9);
  });

  it("the key the screen asks for IS the texture key the loader registers", () => {
    // `game/placeholder.ts` registers art by `assetId(<path under assets/final/>)`, so the key must
    // survive that transform unchanged or the plate still cannot be found.
    const row = (manifest.rows as ManifestRow[]).find((r) => r.id === "dex-cindril" || r.finalFile.endsWith("/dex-cindril.png"));
    expect(row, "the manifest must still carry a dex-cindril row").toBeDefined();
    const key = dexArtId("Cindril");
    // Derived from the manifest row, NOT typed twice — a hardcoded expectation on both sides is the
    // failure mode this whole file exists to prevent.
    expect(key).toBe(assetId((row as ManifestRow).finalFile));
    expect(assetId(key), "assetId is idempotent on a well-formed key").toBe(key);
  });

  it("the REAL dex screen — not just the helper — asks only for keys the manifest can produce", () => {
    // `buildDexEntries` is what `DexScene` renders from. Binding the helper alone would leave the
    // path from entry to screen unbound, which is how the original test managed to be green.
    const produced = manifestKeys("dex-painted");
    const entries = buildDexEntries(content.species, "spring", balance);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(produced.has(entry.artId), `DexEntry "${entry.dexId}" asks for "${entry.artId}"`).toBe(true);
    }
    // Every committed plate is reachable from the screen — no orphan rows.
    expect(new Set(entries.map((e) => e.artId)).size).toBe(produced.size);
  });

  it("the summary card and the retirement portrait resolve into the same key space", () => {
    // Both call `dexArtId(line.formNames[age])` (`game/survey-view.ts` SummaryCard,
    // `game/scenes/RetirementScene.ts`). They were broken by the same literal and are fixed by the
    // same change, so they are held to the same contract rather than assumed to follow.
    const produced = manifestKeys("dex-painted");
    for (const line of content.species) {
      for (const [age, formName] of Object.entries(line.formNames)) {
        const key = dexArtId(formName);
        expect(produced.has(key), `${line.id} form ${age} ("${formName}") asks for "${key}"`).toBe(true);
      }
    }
  });

  it("a missing plate still draws a labelled stand-in carrying the key", () => {
    // The placeholder contract (build-doc §9 / G-placeholder): art does not exist yet, so every one
    // of these keys falls back today. The stand-in must NAME the asset it is standing in for, or a
    // reviewer cannot tell an unbuilt plate from a mis-keyed one — the exact confusion above.
    const key = dexArtId("Cindril");
    const standIn = placeholderKey(key, 128, 128);
    expect(standIn).toContain(key);
    expect(standIn, "stable for the same key and box").toBe(placeholderKey(key, 128, 128));
    // Two identities must never collapse onto one stand-in, or two plates render the same picture.
    expect(placeholderKey(dexArtId("Vulkindle"), 128, 128)).not.toBe(standIn);
  });
});
