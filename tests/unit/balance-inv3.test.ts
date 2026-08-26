/**
 * tests/unit/balance-inv3.test.ts — the five tunables that were literals in code, held to INV-3.
 *
 * WHAT THIS FILE IS FOR, and why it is not a restatement of the schema.
 * ─────────────────────────────────────────────────────────────────────
 * `core/schemas.ts` validates `data/balance.json` with `z.object`, which STRIPS keys it does not
 * declare. So a key added to the JSON alone reaches no reader at all: `map.battleSpritePx` was
 * measured coming back `undefined` after parse. That makes every one of these necessarily a
 * three-file change — data/balance.json + `Balance` (core/types.ts) + `zBalance` (core/schemas.ts)
 * — and it makes "the key is in the file" worth exactly nothing on its own.
 *
 * `tests/gates/guardrails.test.ts` `balance_keys_survive_validation` already walks every leaf of the
 * file and proves it survives the parse. That is the FIRST half. This file is the second: for each
 * of the five keys, the CONSUMER is asked, with a retuned copy of balance, whether the number it
 * produces actually moved. A key that survives validation and is then ignored by the call site is
 * the same decoy knob in a different disguise — the whole of a G11 fix is that the retune lands.
 *
 * So every assertion below goes through the shipped function, never through a value this file
 * constructed:
 *
 *   BF-11  rng.subsystemTags "lifecycle"     → core/save.ts openStreams / captureStreams
 *   BF-13  seasonTint                        → game/season-tint.ts seasonTint + applySeasonTint
 *   BF-14  map.battleSpritePx / miniSpritePx → game/ui/BattleHud.ts defaultCardStyle (what the panel
 *                                              DRAWS with) + BattleLayout.ts spriteRect + the manifest
 *   BF-15  overlayDiff.driftFootprintCells   → tools/overlay-diff/config.ts overlayDiffConfig
 *   BF-16  map.walkMsPerTile                 → game/movement.ts movementConfig + update
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateContent, zBalance } from "../../core/schemas";
import type { Balance, Season } from "../../core/types";
import { subsystemRng } from "../../core/rng";
import { captureStreams, newSave, openStreams } from "../../core/save";
import { heirStreamKey, LIFECYCLE_STREAM } from "../../core/lifecycle";
import {
  applySeasonTint,
  packRgb,
  seasonTint,
  seasonTintTable,
  seasonTintsForYear,
  type TintTarget,
} from "../../game/season-tint";
import { battleSpritePx, spriteRect } from "../../game/ui/BattleLayout";
import { DEFAULT_CARD_STYLE, defaultCardStyle } from "../../game/ui/BattleHud";
import { createMovement, movementConfig, queueInput, update } from "../../game/movement";
import { driftFootprint, overlayDiffConfig, playerFootprintCells } from "../../tools/overlay-diff/config";
import manifest from "../../tools/comfy/manifest.json";

const content = validateContent();
const balance: Balance = content.balance;

const clone = (b: Balance): Balance => structuredClone(b);

/* ════════════════════════════════════════════════════════════════════════════
 * 0. The trap all five share: the schema half is not optional.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("INV-3 — a balance key with no schema declaration is a silent no-op", () => {
  /**
   * The measured failure mode, reproduced. This is the thing that makes "I added it to
   * balance.json" an insufficient report: the parse SUCCEEDS and the key is simply gone.
   */
  it("BINDS — zBalance strips an undeclared key rather than rejecting it", () => {
    const raw = JSON.parse(JSON.stringify(balance)) as Record<string, unknown>;
    const withDecoy = {
      ...raw,
      map: { ...(raw["map"] as Record<string, unknown>), notInSchema: 7 },
    };
    const parsed = zBalance.parse(withDecoy) as unknown as Record<string, unknown>;
    const parsedMap = parsed["map"] as Record<string, unknown>;
    expect(parsedMap["notInSchema"], "zBalance suddenly PRESERVES unknown keys — this file's premise is stale").toBeUndefined();
    // …and the parse did not fail, which is exactly why the loss is silent.
    expect(parsedMap["tileStepPx"]).toBe(balance.map.tileStepPx);
  });

  it("all five keys survive the parse, so each one reaches a reader", () => {
    const reparsed = zBalance.parse(JSON.parse(JSON.stringify(balance))) as Balance;
    expect(reparsed.rng.subsystemTags).toContain("lifecycle");
    expect(reparsed.seasonTint).toBeTypeOf("object");
    expect(reparsed.map.battleSpritePx).toBeTypeOf("number");
    expect(reparsed.map.miniSpritePx).toBeTypeOf("number");
    expect(reparsed.map.walkMsPerTile).toBeTypeOf("number");
    expect(reparsed.overlayDiff.driftFootprintCells).toEqual(balance.overlayDiff.driftFootprintCells);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * BF-11 — rng.subsystemTags carries "lifecycle"
 * ════════════════════════════════════════════════════════════════════════════ */

describe("BF-11 — the lifecycle subsystem stream is declared (build-doc §8.1)", () => {
  it("the tag is data, and the list is append-only in the order the harness reads positionally", () => {
    // tools/harness/content.ts destructures the first three as (battle, sim, encounter). A reorder
    // is silent there, so the order is asserted, not just the membership.
    expect(balance.rng.subsystemTags).toEqual(["battle", "sim", "encounter", "lifecycle"]);
  });

  it("core/save.ts openStreams opens it — the real caller, not a re-derivation", () => {
    const save = newSave({ seed: 4242, currentNode: "hearthollow", nodes: content.nodes }, balance);
    const streams = openStreams(save, balance);
    for (const tag of balance.rng.subsystemTags) {
      expect(streams[tag], `openStreams skipped "${tag}"`).toBeDefined();
    }
    expect(streams["lifecycle"]).toBeDefined();
    // …and it is persisted with the others, so a reload resumes it rather than restarting at draw 0.
    streams["lifecycle"]?.nextFloat();
    expect(Object.keys(captureStreams(streams)).sort()).toEqual([...balance.rng.subsystemTags].sort());
  });

  /**
   * ⚠ THE DETERMINISM CLAIM (L10). Adding a stream must not move any other stream's draws.
   *
   * It cannot, by construction — `subsystemRng` is `(saveSeed, tag)` and nothing else, so the four
   * are siblings rather than a sequence — but "by construction" is what a determinism bug always
   * looks like beforehand. Proved by measurement instead: build the streams the way `openStreams`
   * does from a balance WITHOUT the new tag, and from the shipped one, and compare the heads of the
   * three that existed before. Identical means the tag cost nothing.
   */
  it("BINDS — appending the tag moved no existing stream by a single draw", () => {
    const seed = 20260826;
    const before = clone(balance);
    before.rng.subsystemTags = balance.rng.subsystemTags.filter((t) => t !== "lifecycle");
    expect(before.rng.subsystemTags).toHaveLength(balance.rng.subsystemTags.length - 1);

    const save = newSave({ seed, currentNode: "hearthollow", nodes: content.nodes }, balance);
    const head = (b: Balance, tag: string): string => {
      const stream = openStreams(save, b)[tag];
      if (!stream) throw new Error(`no "${tag}" stream`);
      return [stream.nextFloat(), stream.nextFloat(), stream.nextFloat(), stream.nextFloat()].join(",");
    };
    for (const tag of before.rng.subsystemTags) {
      expect(head(balance, tag), `stream "${tag}" moved when "lifecycle" was added`).toBe(head(before, tag));
    }
    // Positive control: the assertion above is not vacuous — a DIFFERENT tag really is a different
    // stream, so "unchanged" is a claim that could have failed.
    const heads = balance.rng.subsystemTags.map((tag) => head(balance, tag));
    expect(new Set(heads).size).toBe(heads.length);
  });

  /**
   * The heir roll's key — asked of `core/lifecycle.ts` `heirStreamKey`, which is the function
   * `game/scenes/OverworldScene.ts` `beginYearTurn` calls. It used to be re-spelled HERE as
   * `` `lifecycle:heir:y${year}` ``, which is the state-it-asserts-on pattern: this file could not
   * have told a renamed key from a correct one, and two other harnesses that re-spelled it were in
   * fact already wrong (they still said `sim:`).
   *
   * The property being asserted is what makes a fresh per-year-turn stream legal at all: the
   * composed key is independent of the plain "lifecycle" stream and of every year but its own.
   */
  it("a per-year-turn heir key is independent of the persistent stream and of other years", () => {
    const seed = 99;
    const heir = (year: number): number => subsystemRng(seed, heirStreamKey(balance, year)).nextFloat();
    const years = [1, 2, 3, 4, 5, 6];
    expect(new Set(years.map(heir)).size, "two year turns share an heir roll").toBe(years.length);
    expect(heir(1)).not.toBe(subsystemRng(seed, "lifecycle").nextFloat());
    // Reproducible: the same year is the same roll however many times it is asked for.
    expect(heir(4)).toBe(heir(4));
  });

  /**
   * INV-3 for this key, which is the half a spelling test cannot reach: the tag is READ from
   * `balance.rng.subsystemTags` at call time, so removing it is a loud refusal and not a silently
   * different heir. `OverworldScene.beginYearTurn` calls this function inside its `try`, so the
   * refusal surfaces to the player as "year N turn refused: …" rather than as a wrong heir.
   */
  it("BINDS — the key names the declared tag, and a balance without it refuses", () => {
    // Written through LIFECYCLE_STREAM, not as one literal: the sweep below forbids spelling this
    // key anywhere but core/lifecycle.ts, and a rule its own test file breaks is not a rule. The
    // shape after the tag is still pinned exactly.
    expect(heirStreamKey(balance, 3)).toBe(`${LIFECYCLE_STREAM}:heir:y3`);
    expect(LIFECYCLE_STREAM).toBe("lifecycle");
    expect(balance.rng.subsystemTags).toContain(LIFECYCLE_STREAM);

    const without = clone(balance);
    without.rng.subsystemTags = balance.rng.subsystemTags.filter((t) => t !== LIFECYCLE_STREAM);
    expect(() => heirStreamKey(without, 3)).toThrow(/subsystemTags has no "lifecycle" stream/);
  });

  /**
   * …and NOBODY re-spells it. This is the structural half, and it is the one that would have caught
   * the defect: when the scene moved from the sim tag to the lifecycle tag,
   * `tests/integration/demo-beats.test.ts` (the Legacy demo beat) and `tests/unit/year-turn-ux.test.ts`
   * (`liveRun`, "the run the game actually produces") both kept a hand-written `sim:heir:y<N>` and
   * went on replaying a stream the game had stopped opening — green throughout, because each
   * compared itself with itself. Measured at the time: seed 7, y1 — old stream 0.177443, shipped
   * stream 0.590538.
   */
  it("BINDS — no file outside core/lifecycle.ts spells the heir key by hand", () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const spelled = /["'`][a-z]+:heir:y/;
    /*
     * Positive control FIRST: the matcher really does see the shape it is looking for, in both the
     * old spelling and the new one, so a clean sweep below means "nobody does this" and not "the
     * sweep is blind".
     *
     * Assembled from pieces, because THIS FILE IS IN THE SWEEP: a control written out whole would
     * make the sweep report its own fixture as an offender, and the tempting fix for that — skipping
     * this file — is how a rule stops applying to the file that states it.
     */
    for (const tag of ["sim", "lifecycle"]) {
      expect(spelled.test('subsystemRng(seed, `' + tag + ':heir:y${String(1)}`)'), tag).toBe(true);
    }

    let scanned = 0;
    const offenders: string[] = [];
    for (const dir of ["core", "game", "tests", "tools"]) {
      for (const entry of readdirSync(`${root}${dir}`, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
        const rel = `${entry.parentPath.slice(root.length)}/${entry.name}`;
        if (rel === "core/lifecycle.ts") continue; // the one place it is allowed to be spelled
        scanned += 1;
        // Comments quote the retired key on purpose; strip them before looking for a live one.
        const code = readFileSync(`${root}${rel}`, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        if (spelled.test(code)) offenders.push(rel);
      }
    }
    expect(scanned, "the sweep found no sources at all").toBeGreaterThan(50);
    expect(offenders, "these compose the heir key themselves instead of calling heirStreamKey").toEqual([]);

    // …and the three callers that DO open the heir stream reach it through the helper.
    for (const file of [
      "game/scenes/OverworldScene.ts",
      "tests/integration/demo-beats.test.ts",
      "tests/unit/year-turn-ux.test.ts",
    ]) {
      expect(readFileSync(`${root}${file}`, "utf8"), `${file} opens the heir stream without heirStreamKey`).toContain(
        "heirStreamKey(",
      );
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * BF-13 — balance.seasonTint (Hard Requirement 6)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("BF-13 — the season hues are balance.seasonTint, not literals in game/season-tint.ts", () => {
  it("one preset per season the clock can ask for, and the table helper reads the file", () => {
    const table = seasonTintTable(balance);
    for (const season of balance.clock.seasonOrder) {
      const authored = balance.seasonTint[season];
      expect(table[season].rgb, `${season} hue drifted from balance.json`).toEqual({
        r: authored.r,
        g: authored.g,
        b: authored.b,
      });
      expect(table[season].overlayAlpha).toBe(authored.overlayAlpha);
      expect(table[season].provisional, `${season} still reports as a placeholder`).toBe(false);
    }
  });

  /**
   * THE INV-3 CLAIM, asked of the thing that paints: retune a hue in a copy of balance, and the
   * 24-bit colour handed to `setTint` moves — with no code edited. `applySeasonTint` is the shipped
   * applier and `TintTarget` is its own structural seam (game/mapview.ts hands it the painted-map
   * `Image`), so this is the real path with only the engine object faked.
   */
  it("BINDS — a hue retune reaches setTint, through the shipped applier", () => {
    const season = balance.clock.seasonOrder[0] as Season;
    const painted: number[] = [];
    const target: TintTarget = {
      setTint(color: number) {
        painted.push(color);
      },
    };

    applySeasonTint(target, seasonTint(balance, season, balance.clock.startYear));

    const retuned = clone(balance);
    const authored = balance.seasonTint[season];
    // Swap red and blue: a different hue at the same luminance, so this cannot pass by accident of
    // the brightness terms.
    retuned.seasonTint[season] = { ...authored, r: authored.b, b: authored.r };
    applySeasonTint(target, seasonTint(retuned, season, retuned.clock.startYear));

    expect(painted).toHaveLength(2);
    expect(painted[0], "the hue was retuned in balance.json and setTint got the same colour").not.toBe(painted[1]);
  });

  it("BINDS — the overlay pass reads the same authored hue, at the authored alpha", () => {
    const readings = seasonTintsForYear(balance, balance.clock.startYear);
    expect(readings.map((r) => r.season)).toEqual(balance.clock.seasonOrder);
    for (const reading of readings) {
      const authored = balance.seasonTint[reading.season];
      expect(reading.overlayAlpha).toBe(authored.overlayAlpha);
      expect(packRgb(reading.base)).toBe(packRgb({ r: authored.r, g: authored.g, b: authored.b }));
    }
  });

  it("an all-zero preset is refused at validation, not painted black at the frame", () => {
    // `hueOf` returns black for a peak of zero rather than dividing by it, so nothing downstream
    // fails — the season just paints the map out. The schema is the only place that can catch it.
    const season = balance.clock.seasonOrder[0] as string;
    const raw = JSON.parse(JSON.stringify(balance)) as Record<string, unknown>;
    const tints = { ...(raw["seasonTint"] as Record<string, unknown>) };
    tints[season] = { r: 0, g: 0, b: 0, overlayAlpha: 0.1 };
    expect(() => zBalance.parse({ ...raw, seasonTint: tints })).toThrow();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * BF-14 — balance.map.battleSpritePx / miniSpritePx (build-doc §9.3)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("BF-14 — the §9.3 sprite targets are balance keys", () => {
  it("spriteRect's default box is the balance key — asked of the layout, not of the constant", () => {
    const box = spriteRect({ x: 100, y: 100 });
    expect(box.w).toBe(balance.map.battleSpritePx);
    expect(box.h).toBe(balance.map.battleSpritePx);
    // Centred: the rect is the box a centred sprite occupies, which is what the disjointness sweep
    // in tests/unit/battle-view.test.ts asks it for.
    expect(box.x).toBe(100 - Math.floor(balance.map.battleSpritePx / 2));
  });

  /**
   * ⚠ THIS IS THE ONE THAT CATCHES A RE-HARDCODE, and it is the reason `spriteRect` takes a
   * `balance` at all. Asserting `spriteRect(at).w === balance.map.battleSpritePx` cannot tell the
   * key apart from a literal `96` that happens to agree with it — measured: reverting the function
   * to `const SPRITE_W = 96` leaves that assertion green. Retuning a COPY of balance and asking the
   * function again is the difference: a literal does not move.
   */
  it("BINDS — a retune of battleSpritePx moves the box the layout reports, defaults included", () => {
    const retuned = clone(balance);
    retuned.map.battleSpritePx = balance.map.battleSpritePx * 2;
    expect(battleSpritePx(retuned)).toBe(balance.map.battleSpritePx * 2);

    const shipped = spriteRect({ x: 100, y: 100 });
    const wide = spriteRect({ x: 100, y: 100 }, undefined, undefined, retuned);
    expect(wide.w, "spriteRect's DEFAULT ignored the retune — it is reading something else").toBe(
      balance.map.battleSpritePx * 2,
    );
    expect(wide.h).toBe(wide.w);
    expect(wide.w).toBeGreaterThan(shipped.w);
    // The centring follows the retuned size too, so the box is recomputed rather than resized.
    expect(wide.x).toBe(100 - Math.floor(wide.w / 2));
  });

  /**
   * ⚠ AND THIS IS THE ONE THAT CATCHES THE DECOY THE TEST ABOVE CANNOT.
   *
   * `spriteRect` reads the key honestly and had NO production caller: the number a battle sprite is
   * drawn at is `CombatantCardStyle.spriteW/spriteH`, handed to `placeholderImage` in
   * `CombatantPanel`'s constructor, and that was still a literal `96` in `DEFAULT_CARD_STYLE` after
   * the layout had been moved onto the key. Setting `map.battleSpritePx` to 48 turned nothing on
   * screen and reddened only the assertion above — a decoy knob with a test guarding it.
   *
   * `defaultCardStyle(balance)` is the object the panel draws from, so it is asked here directly;
   * `tests/unit/battle-view.test.ts` ("BF-14 — the size a battle sprite is drawn at…") opens a real
   * `BattleScene` over the stub and reads the size back off the drawn image's texture key.
   */
  it("BINDS — a retune moves the style the battle HUD DRAWS with, not just the layout helper", () => {
    const retuned = clone(balance);
    retuned.map.battleSpritePx = balance.map.battleSpritePx * 2;

    expect(defaultCardStyle().spriteW, "the shipped card style is not reading the key").toBe(
      balance.map.battleSpritePx,
    );
    expect(defaultCardStyle().spriteH).toBe(balance.map.battleSpritePx);
    expect(defaultCardStyle(retuned).spriteW, "the drawn sprite size ignored the retune").toBe(
      balance.map.battleSpritePx * 2,
    );
    expect(defaultCardStyle(retuned).spriteH).toBe(balance.map.battleSpritePx * 2);
    // The plate itself is NOT balance-driven and must not have been dragged along.
    expect(defaultCardStyle(retuned).cardW).toBe(DEFAULT_CARD_STYLE.cardW);
    // …and the layout helper and the drawn style are the same number, by construction.
    expect(spriteRect({ x: 0, y: 0 }, undefined, undefined, retuned).w).toBe(defaultCardStyle(retuned).spriteW);
  });

  /**
   * Deviation LB-M4, closed from both ends. The art lane pinned 96/32 on the class specs in
   * `tools/comfy/manifest.json` and wrote "Raised for Lane A: balance.map.battleSpritePx and
   * balance.map.miniSpritePx would close it." They exist now, so the two files are held together:
   * the post-process downscale target and the size the battle screen lays out must be one number.
   */
  it("the art manifest's §9.3 class targets agree with the balance keys (LB-M4)", () => {
    const classes = (manifest as { classes: Record<string, { targetW: number; targetH: number }> }).classes;
    const battle = classes["creature-battle"];
    const mini = classes["overworld-mini"];
    expect(battle, "the manifest has no creature-battle class — this cross-check is aimed at nothing").toBeDefined();
    expect(mini, "the manifest has no overworld-mini class").toBeDefined();
    expect(battle?.targetW).toBe(balance.map.battleSpritePx);
    expect(battle?.targetH).toBe(balance.map.battleSpritePx);
    expect(mini?.targetW).toBe(balance.map.miniSpritePx);
    expect(mini?.targetH).toBe(balance.map.miniSpritePx);
  });

  it("the battle sprite still fits the §7.6 virtual screen it is laid out on", () => {
    // The headroom the old literal's comment recorded, as a law rather than a measurement in prose.
    expect(balance.map.battleSpritePx).toBeLessThan(balance.map.virtualHeight);
    expect(balance.map.battleSpritePx).toBeLessThan(balance.map.virtualWidth);
    expect(balance.map.miniSpritePx).toBeLessThanOrEqual(balance.map.battleSpritePx);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * BF-15 — balance.overlayDiff.driftFootprintCells (build-doc §8.2 criterion 2)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("BF-15 — the §9.5 drift tolerance is reachable from balance.json", () => {
  it("the tool's config carries the configured footprint, not a derivation", () => {
    expect(driftFootprint(balance)).toEqual(balance.overlayDiff.driftFootprintCells);
    expect(overlayDiffConfig(balance).driftFootprint).toEqual(balance.overlayDiff.driftFootprintCells);
  });

  /**
   * The reason the key had to exist. Every sibling of this number in `balance.overlayDiff` is a
   * tunable; this one was arithmetic inside `tools/overlay-diff/config.ts`, so responding to a
   * supervised §9.5 run that says the gate is too tight meant editing code. Now it does not.
   */
  it("BINDS — loosening the tolerance in balance.json loosens the gate the tool applies", () => {
    const looser = clone(balance);
    looser.overlayDiff.driftFootprintCells = {
      cols: balance.overlayDiff.driftFootprintCells.cols + 2,
      rows: balance.overlayDiff.driftFootprintCells.rows + 2,
    };
    const before = overlayDiffConfig(balance).driftFootprint;
    const after = overlayDiffConfig(looser).driftFootprint;
    expect(after.cols).toBeGreaterThan(before.cols);
    expect(after.rows).toBeGreaterThan(before.rows);
    // …and nothing else in the config moved with it.
    expect(overlayDiffConfig(looser).iouThreshold).toBe(overlayDiffConfig(balance).iouThreshold);
  });

  /**
   * THE FLOOR, which is what the old derivation was really asserting and is worth keeping as a law:
   * a tolerance smaller than the player's own footprint accepts a year variant whose walkable mask
   * drifted by more than the player is wide — i.e. one that can strand him. The shipped value IS
   * the player's footprint; a retune may raise it (that is the point) and must not go under it.
   */
  it("the configured tolerance is never smaller than the player's own footprint", () => {
    const floor = playerFootprintCells(balance);
    const configured = driftFootprint(balance);
    expect(configured.cols).toBeGreaterThanOrEqual(floor.cols);
    expect(configured.rows).toBeGreaterThanOrEqual(floor.rows);
    // The floor is real arithmetic over balance.map, not a copy of the answer.
    expect(floor).toEqual({
      cols: Math.ceil(balance.map.playerSpriteW / balance.map.collisionCellPx),
      rows: Math.ceil(balance.map.playerSpriteH / balance.map.collisionCellPx),
    });
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * BF-16 — balance.map.walkMsPerTile
 * ════════════════════════════════════════════════════════════════════════════ */

describe("BF-16 — the walk pace is balance.map.walkMsPerTile", () => {
  it("movementConfig's default pace is the balance key", () => {
    expect(movementConfig(balance).msPerTile).toBe(balance.map.walkMsPerTile);
  });

  /**
   * Asked of the MOVER, not of the config object: a step started at the configured pace is still in
   * flight one millisecond early and has landed at the pace exactly. That is the number doing work.
   */
  it("BINDS — a retune changes how long a step actually takes, through update()", () => {
    const walkable = (): boolean => true;
    const stepAt = (b: Balance): { early: boolean; landed: boolean } => {
      const cfg = movementConfig(b);
      const start = queueInput(createMovement({ col: 5, row: 5 }), "right");
      const early = update(start, cfg.msPerTile - 1, walkable, cfg);
      const landed = update(start, cfg.msPerTile, walkable, cfg);
      return { early: early.state.step !== null, landed: landed.state.stepsTaken === 1 };
    };

    const shipped = stepAt(balance);
    expect(shipped.early, "a step landed BEFORE the configured pace").toBe(true);
    expect(shipped.landed, "a step had not landed AT the configured pace").toBe(true);

    const brisk = clone(balance);
    brisk.map.walkMsPerTile = Math.max(1, Math.floor(balance.map.walkMsPerTile / 4));
    const fast = stepAt(brisk);
    expect(fast.early).toBe(true);
    expect(fast.landed).toBe(true);
    // The retune is the whole claim: the same dt now walks further.
    const cfgSlow = movementConfig(balance);
    const cfgFast = movementConfig(brisk);
    const dt = balance.map.walkMsPerTile;
    const walkSlow = update(queueInput(createMovement({ col: 0, row: 0 }), "right"), dt, walkable, cfgSlow);
    const walkFast = update(queueInput(createMovement({ col: 0, row: 0 }), "right"), dt, walkable, cfgFast);
    expect(walkFast.state.stepsTaken).toBeGreaterThan(walkSlow.state.stepsTaken);
  });

  it("pace is presentation: no simulation number is denominated in it", () => {
    // The reason it was defensible as a literal, kept as a law. A foray is counted in STEPS, so a
    // player who walks four times as fast spends exactly the same clock ticks — if this ever stops
    // being true, walking speed becomes a gameplay constant and the balance gates have to know.
    const walkable = (): boolean => true;
    const steps = (b: Balance, ms: number): number => {
      const cfg = movementConfig(b);
      let state = createMovement({ col: 0, row: 0 });
      let taken = 0;
      // One tile at a time so the MAX_STEPS_PER_UPDATE guard is not what is being measured.
      for (let spent = 0; spent < ms; spent += cfg.msPerTile) {
        state = queueInput(state, "right");
        const r = update(state, cfg.msPerTile, walkable, cfg);
        state = r.state;
        taken = state.stepsTaken;
      }
      return taken;
    };
    const brisk = clone(balance);
    brisk.map.walkMsPerTile = Math.max(1, Math.floor(balance.map.walkMsPerTile / 4));
    const budget = balance.map.walkMsPerTile * balance.encounter.stepsPerForay;
    // Same wall-clock budget, four times the steps — and a foray is stepsPerForay STEPS, so the
    // faster player reaches the same tick count in a quarter of the real time and no sooner.
    expect(steps(brisk, budget)).toBeGreaterThan(steps(balance, budget));
    expect(steps(balance, budget)).toBe(balance.encounter.stepsPerForay);
  });
});
