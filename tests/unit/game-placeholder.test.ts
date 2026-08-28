/**
 * tests/unit/game-placeholder.test.ts — the ONE shared stand-in helper (build-doc §15 C1, §16 art
 * guardrails).
 *
 * The property this file exists to bind, in one sentence: **a placeholder must carry its asset id
 * where the player can actually see it.** That is the whole reason `game/placeholder.ts` exists —
 * "never let a placeholder silently look like a finished asset" — and it was previously asserted
 * nowhere. The C1 audit found the failure it predicts: a 1024² map stand-in drew ONE ~10px label in
 * its centre, was displayed at 2048², and therefore rendered as unlabelled flat colour with a fine
 * pinstripe anywhere the camera was not standing on the middle of the map. Honesty depended on where
 * the player happened to be.
 *
 * So the central test below is not "a label exists" but "every screenful contains a whole label,
 * wherever the camera sits" — checked by sliding the real viewport (`balance.map.virtualWidth` ÷
 * `mapRenderScale`) across the real map size (`balance.map.mapNativePx`) and demanding a complete,
 * id-carrying block inside every window. Reverting to a single centred label turns it red.
 *
 * Everything is measured against the SHIPPED balance.json: no viewport, render scale or map size is
 * restated here.
 */

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { validateContent } from "../../core/schemas";
import type { Balance, Content, PaletteFile } from "../../core/types";
import {
  assetId,
  drawPlaceholder,
  hasRealAsset,
  placeholderHex,
  placeholderKey,
  placeholderPlan,
  placeholderTexture,
  resetStandInCensus,
  standInCensus,
  queueRealAssets,
  realAssetIds,
  realAssetUrl,
  warnOnStandIns,
  registerRealAsset,
  textureFor,
  wrapLabel,
  type PlaceholderLabel,
  type PlaceholderPlan,
} from "../../game/placeholder";
import { registry } from "../../game/registry";

const content: Content = validateContent();
const balance: Balance = content.balance;
const palette: PaletteFile = content.palette;

afterEach(() => {
  registry.reset();
});

/* ────────────────────────────────────────────────────────────────────────────
 * Ids and keys
 * ──────────────────────────────────────────────────────────────────────────── */

describe("assetId — one id per asset, whichever form the caller has", () => {
  it("strips the assets/final prefix and the extension", () => {
    expect(assetId("assets/final/maps/r1.png")).toBe("maps/r1");
    expect(assetId("./assets/final/maps/r1.png")).toBe("maps/r1");
    expect(assetId("../assets/final/maps/r1.png")).toBe("maps/r1");
    expect(assetId("maps/r1")).toBe("maps/r1");
    expect(assetId("  maps/r1.PNG ")).toBe("maps/r1");
  });

  it("is idempotent, so a path and its own id agree", () => {
    for (const node of content.nodes) {
      const id = assetId(node.mapAsset);
      expect(assetId(id)).toBe(id);
      expect(assetId(node.collisionMask)).toBe(assetId(assetId(node.collisionMask)));
      expect(id).not.toBe(assetId(node.collisionMask));
    }
  });

  it("keys carry the size, so two sizes of one asset cannot collide", () => {
    expect(placeholderKey("assets/final/maps/r1.png", 32, 48)).toBe("placeholder:maps/r1@32x48");
    expect(placeholderKey("maps/r1", 64, 48)).not.toBe(placeholderKey("maps/r1", 32, 48));
  });
});

describe("placeholderHex — stable, and inside the project palette", () => {
  it("returns a palette swatch and the same one every time", () => {
    const first = placeholderHex("maps/r1", palette);
    expect(first).toBe(placeholderHex("maps/r1", palette));
    expect(palette.colors.map((c) => c.hex)).toContain(first);
  });

  it("reads the palette off the registry when the caller does not pass one", () => {
    registry.setContent(content);
    expect(placeholderHex("maps/r1")).toBe(placeholderHex("maps/r1", palette));
  });

  it("still answers with no palette at all — the failure screen has to draw something", () => {
    expect(placeholderHex("maps/r1", null)).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The honesty property
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The monospace advance and the label inset `game/placeholder.ts` fits to, restated here ON PURPOSE:
 * these tests measure the DRAWN width against the same numbers the draw uses, so a plan that emits a
 * line the draw would have to squeeze fails here rather than shipping as a smear.
 */
const MONO_ADVANCE = 0.6;
const LABEL_INSET_PX = 4;

/** The width `drawPlaceholder` clamps a line to (`fillText(line, x, y, maxWidth)`). */
function drawMaxWidth(plan: PlaceholderPlan): number {
  return Math.max(1, plan.cellWidth - LABEL_INSET_PX);
}

/** What a line of text is naturally, before `fillText`'s maxWidth squeezes it. */
function naturalWidth(line: string, plan: PlaceholderPlan): number {
  return line.length * plan.fontPx * MONO_ADVANCE;
}

/** What one label block actually occupies, in texture pixels, as `drawPlaceholder` draws it. */
function labelBox(
  plan: PlaceholderPlan,
  label: PlaceholderLabel,
): { left: number; right: number; top: number; bottom: number } {
  const maxWidth = drawMaxWidth(plan);
  const longest = Math.max(...label.lines.map((l) => l.length));
  // `fillText`'s maxWidth argument squeezes rather than clips, so the drawn width never exceeds it.
  const width = Math.min(longest * plan.fontPx * MONO_ADVANCE, maxWidth);
  const height = label.lines.length * plan.lineHeightPx;
  return {
    left: label.x - width / 2,
    right: label.x + width / 2,
    top: label.y - height / 2,
    bottom: label.y + height / 2,
  };
}

/** Whitespace-free form — `wrapLabel` only ever drops whitespace at a break point. */
function squash(s: string): string {
  return s.replace(/\s+/g, "");
}

/** The texture region one screenful shows, from balance.json — never restated as a literal here. */
const crop = {
  width: Math.floor(balance.map.virtualWidth / balance.map.mapRenderScale),
  height: Math.floor(balance.map.virtualHeight / balance.map.mapRenderScale),
};

describe("a map-sized stand-in is labelled everywhere the camera can look", () => {
  const native = balance.map.mapNativePx;
  const nodeMap = content.nodes[0]?.mapAsset ?? "assets/final/maps/unknown.png";
  const id = assetId(nodeMap);
  const plan = placeholderPlan(nodeMap, native, native, { note: "year 1" });

  it("tiles its label rather than centring one", () => {
    expect(plan.labels.length).toBeGreaterThan(1);
    expect(plan.cellWidth).toBeLessThanOrEqual(crop.width);
    expect(plan.cellHeight).toBeLessThanOrEqual(crop.height);
  });

  it("every label names the asset and says it is a placeholder", () => {
    for (const label of plan.labels) {
      expect(label.lines).toContain(id);
      expect(label.lines).toContain(`${native}x${native}`);
      expect(label.lines.some((l) => l.includes("PLACEHOLDER"))).toBe(true);
    }
  });

  it("EVERY viewport-sized crop contains a whole label — this is the defect the audit found", () => {
    const step = 16;
    let worst: string | null = null;
    let checked = 0;
    for (let y = 0; y + crop.height <= native && !worst; y += step) {
      for (let x = 0; x + crop.width <= native; x += step) {
        checked += 1;
        const inside = plan.labels.some((label) => {
          const box = labelBox(plan, label);
          return (
            box.left >= x &&
            box.right <= x + crop.width &&
            box.top >= y &&
            box.bottom <= y + crop.height
          );
        });
        if (!inside) {
          worst = `no whole label inside the ${crop.width}x${crop.height} crop at (${x}, ${y})`;
          break;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(worst).toBeNull();
  });

  it("the hatch coarsens with the texture, so a scaled-up map is striped and not textured", () => {
    const sprite = placeholderPlan("creature/x", balance.map.playerSpriteW, balance.map.playerSpriteH);
    expect(plan.hatchSpacingPx).toBeGreaterThan(sprite.hatchSpacingPx);
  });
});

describe("sprite-sized stand-ins keep their single centred label", () => {
  // WAS: `expect(plan.labels[0]?.lines).toContain("player/walk")`. That assertion is about the PLAN
  // OBJECT and says nothing about the pixels, which is how the 32×48 overworld player shipped with
  // an id row 2.4× horizontally compressed — 67.2px of glyphs handed a 28px maxWidth, which
  // `fillText` squeezes rather than clips (measured live at /?dev, and again by the C1 verifier).
  // The helper's whole claim is "it names itself so a reviewer can say WHICH asset is missing", so
  // the assertion now binds the DRAWN form: the id is recoverable from the lines exactly, and every
  // line fits the width the draw clamps to at natural glyph width.
  it("the player sprite carries its id in a form the draw does not have to squeeze", () => {
    const plan = placeholderPlan("player/walk", balance.map.playerSpriteW, balance.map.playerSpriteH);
    expect(plan.labels).toHaveLength(1);
    expect(plan.cornerMarkOnly).toBe(false);
    expect(plan.idLines.join("")).toBe("player/walk");
    // Every id line is on the block, in order, and nothing was invented or dropped.
    const lines = plan.labels[0]?.lines ?? [];
    for (const idLine of plan.idLines) expect(lines).toContain(idLine);
    for (const line of lines) {
      expect(naturalWidth(line, plan), `"${line}" is squeezed`).toBeLessThanOrEqual(drawMaxWidth(plan));
    }
    // The size still rides along at the shipped sprite size; it is dropped only when the id needs
    // the room, which at 32×48 it does not.
    expect(lines).toContain(`${balance.map.playerSpriteW}x${balance.map.playerSpriteH}`);
  });

  it("a texture too small for any text still marks itself", () => {
    const plan = placeholderPlan("ui/pip", 8, 8);
    expect(plan.cornerMarkOnly).toBe(true);
    expect(plan.labels).toHaveLength(0);
  });

  it("a cell that cannot hold a legible id draws the corner mark instead of a smear", () => {
    // 14×14 clears the corner-mark threshold on size alone, but "ui/pip" cannot be wrapped into it
    // at the smallest font. Squeezing it in is the failure mode; saying "stand-in" without naming
    // the asset is honest, and is what happens now.
    const plan = placeholderPlan("ui/pip", 14, 14);
    expect(plan.cornerMarkOnly).toBe(true);
    expect(plan.labels).toHaveLength(0);
  });

  it("the note rides on the middle block only, and the id on all of them", () => {
    const native = balance.map.mapNativePx;
    const note = "a long note about the node";
    const plan = placeholderPlan("maps/x", native, native, { note });
    // The note wraps like everything else, so it is recovered from the lines it occupies rather
    // than expected as one string — a note wider than the cell used to be squeezed too.
    const noteBlocks = plan.labels.filter((l) => squash(l.lines.join("")).includes(squash(note)));
    expect(noteBlocks).toHaveLength(1);
    expect(plan.labels.every((l) => l.lines.includes("maps/x"))).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * No line is ever squeezed — the property the C1 verifier found false
 * ──────────────────────────────────────────────────────────────────────────── */

describe("every label line fits the width the draw clamps it to", () => {
  /**
   * The real call-site sizes, from the shipped balance and the real callers. `battle/…` is the
   * longest id in the game (`game/ui/BattleHud.ts` `battleSpriteKey`) and was the worst offender:
   * 156px of glyphs into a 68px slot, 2.3× compression.
   */
  const CASES: ReadonlyArray<readonly [string, number, number]> = [
    ["sprites/player", balance.map.playerSpriteW, balance.map.playerSpriteH],
    ["battle/nibbin-line/J/front", 72, 72],
    ["battle/nibbin-line/J/front", 96, 96],
    ["ui/title-banner", 208, 48],
    ["dex/pyrevane", 48, 48],
    ["maps/bowerdeep", balance.map.mapNativePx, balance.map.mapNativePx],
  ];

  it.each(CASES)("%s at %ix%i", (id, w, h) => {
    const plan = placeholderPlan(id, w, h, { note: "unbuilt" });
    expect(plan.cornerMarkOnly).toBe(false);
    expect(plan.idLines.join("")).toBe(id);
    const max = drawMaxWidth(plan);
    for (const label of plan.labels) {
      for (const line of label.lines) {
        expect(naturalWidth(line, plan), `"${line}" @${id} ${w}x${h}`).toBeLessThanOrEqual(max);
      }
      // The block also has to fit the cell vertically, or the wrap has just moved the problem.
      expect(label.lines.length * plan.lineHeightPx).toBeLessThanOrEqual(plan.cellHeight);
    }
  });

  it("BINDS — the width law catches the id it used to let through", () => {
    // The shipped behaviour before the fix, reconstructed: one unwrapped line at the size-derived
    // font. It violates the law, which is what makes the law worth having.
    const plan = placeholderPlan("sprites/player", balance.map.playerSpriteW, balance.map.playerSpriteH);
    expect(naturalWidth("sprites/player", { ...plan, fontPx: 8 })).toBeGreaterThan(drawMaxWidth(plan));
  });
});

describe("wrapLabel", () => {
  it("only ever drops whitespace, so the text is recoverable", () => {
    for (const text of ["battle/nibbin-line/J/front", "sprites/player", "a long note about the node", "x"]) {
      for (const n of [1, 2, 3, 5, 7, 11, 16, 40]) {
        const lines = wrapLabel(text, n);
        expect(squash(lines.join("")), `"${text}" @${n}`).toBe(squash(text));
        for (const line of lines) expect(line.length, `"${line}" @${n}`).toBeLessThanOrEqual(Math.max(1, n));
      }
    }
  });

  it("breaks after a path separator when it can, so the pieces still read as a path", () => {
    expect(wrapLabel("battle/nibbin-line/J/front", 14)).toEqual(["battle/nibbin-", "line/J/front"]);
    expect(wrapLabel("sprites/player", 7)).toEqual(["sprites", "/player"]);
  });

  it("hard-splits a token with no break point rather than overflowing", () => {
    expect(wrapLabel("abcdefgh", 3)).toEqual(["abc", "def", "gh"]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The draw itself
 * ──────────────────────────────────────────────────────────────────────────── */

interface DrawnText {
  text: string;
  x: number;
  y: number;
}

class RecordingContext {
  fillStyle = "";
  strokeStyle = "";
  lineWidth = 0;
  globalAlpha = 1;
  font = "";
  textAlign = "";
  textBaseline = "";
  readonly texts: DrawnText[] = [];
  readonly fills: Array<[number, number, number, number]> = [];
  strokes = 0;

  clearRect(): void {}
  fillRect(x: number, y: number, w: number, h: number): void {
    this.fills.push([x, y, w, h]);
  }
  strokeRect(): void {}
  save(): void {}
  restore(): void {}
  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  stroke(): void {
    this.strokes += 1;
  }
  fillText(text: string, x: number, y: number): void {
    this.texts.push({ text, x, y });
  }
}

function record(plan: PlaceholderPlan): RecordingContext {
  const ctx = new RecordingContext();
  drawPlaceholder(ctx as unknown as CanvasRenderingContext2D, plan);
  return ctx;
}

describe("drawPlaceholder draws what the plan says", () => {
  it("writes every label line the plan carries, at the plan's coordinates", () => {
    const native = balance.map.mapNativePx;
    const plan = placeholderPlan("maps/x", native, native);
    const ctx = record(plan);
    const expected = plan.labels.reduce((n, l) => n + l.lines.length, 0);
    expect(ctx.texts).toHaveLength(expected);
    expect(ctx.texts.filter((t) => t.text === "maps/x")).toHaveLength(plan.labels.length);
    for (const label of plan.labels) {
      expect(ctx.texts.some((t) => t.text === "maps/x" && Math.abs(t.x - label.x) < 1e-6)).toBe(true);
    }
    // fill + hatch + lattice: a flat rectangle would stroke once.
    expect(ctx.strokes).toBeGreaterThan(1);
  });

  it("a texture too small for text still gets its corner mark and no text", () => {
    const ctx = record(placeholderPlan("ui/pip", 8, 8));
    expect(ctx.texts).toHaveLength(0);
    // The background fill plus the 2x2 corner mark.
    expect(ctx.fills).toHaveLength(2);
    expect(ctx.fills[1]).toEqual([1, 1, 2, 2]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Real art wins whenever it exists
 * ──────────────────────────────────────────────────────────────────────────── */

class FakeTextureManager {
  readonly created: string[] = [];
  readonly present = new Set<string>();
  exists(key: string): boolean {
    return this.present.has(key);
  }
  createCanvas(key: string): null {
    this.created.push(key);
    return null; // forces the graphics fallback, which is the branch a headless run takes
  }
}

class FakeGraphics {
  static readonly generated: string[] = [];
  static rects = 0;
  fillStyle(): this {
    return this;
  }
  fillRect(): this {
    FakeGraphics.rects += 1;
    return this;
  }
  lineStyle(): this {
    return this;
  }
  strokeRect(): this {
    return this;
  }
  generateTexture(key: string): this {
    FakeGraphics.generated.push(key);
    return this;
  }
  destroy(): void {}
}

function fakeScene(): {
  scene: unknown;
  textures: FakeTextureManager;
  loaded: Array<{ key: string; url: string }>;
} {
  const textures = new FakeTextureManager();
  const loaded: Array<{ key: string; url: string }> = [];
  const scene = {
    textures,
    load: {
      image(key: string, url: string): void {
        loaded.push({ key, url });
      },
    },
    add: {
      graphics(): FakeGraphics {
        return new FakeGraphics();
      },
    },
  };
  return { scene, textures, loaded };
}

describe("textureFor / the real-art census", () => {
  it("returns the real texture the moment the loader has it, and the stand-in until then", () => {
    const { scene, textures } = fakeScene();
    const s = scene as unknown as Parameters<typeof textureFor>[0];
    expect(textureFor(s, "assets/final/maps/r1.png", 64, 64)).toBe(placeholderKey("maps/r1", 64, 64));

    textures.present.add("maps/r1");
    expect(textureFor(s, "assets/final/maps/r1.png", 64, 64)).toBe("maps/r1");
  });

  it("the no-canvas fallback still cannot pass for finished art", () => {
    // `Graphics` cannot draw text, so this branch cannot name the asset. It draws the label lattice
    // and a mark in every cell instead — a map-sized stand-in gets one per label cell, which is what
    // keeps it unmistakable when the id cannot be written on it.
    const { scene } = fakeScene();
    const s = scene as unknown as Parameters<typeof placeholderTexture>[0];
    const native = balance.map.mapNativePx;
    const plan = placeholderPlan("maps/x", native, native);
    const cols = Math.ceil(native / plan.cellWidth);
    const rows = Math.ceil(native / plan.cellHeight);

    FakeGraphics.rects = 0;
    placeholderTexture(s, "maps/x", native, native);
    expect(FakeGraphics.generated).toContain(placeholderKey("maps/x", native, native));
    // The background, the lattice (cols-1 verticals + rows-1 horizontals), and one mark per cell.
    expect(FakeGraphics.rects).toBe(1 + (cols - 1) + (rows - 1) + cols * rows);
    expect(cols * rows).toBe(plan.labels.length);
  });

  it("placeholderTexture is idempotent — the second call does not redraw", () => {
    const { scene, textures } = fakeScene();
    const s = scene as unknown as Parameters<typeof placeholderTexture>[0];
    const key = placeholderTexture(s, "ui/frame", 64, 64);
    textures.present.add(key);
    expect(placeholderTexture(s, "ui/frame", 64, 64)).toBe(key);
    expect(textures.created).toHaveLength(1);
  });

  it("an unbuilt asset is never queued, so the console is not filled with 404s", () => {
    const { scene, loaded } = fakeScene();
    // SYNTHETIC ON PURPOSE — do NOT point this back at real content. Every `mapAsset` and
    // `collisionMask` in data/nodes/*.json names a file the art lane is going to produce, so each of
    // them is "unbuilt" only until the day it is built. This anchored on `content.nodes[0].mapAsset`
    // and went red the night `assets/final/maps/hearthollow.png` landed — correctly, because by then
    // it had long since stopped testing its own title and was asserting "hearthollow art has not
    // shipped yet", which is a fact about the calendar and not a contract. A name no manifest row and
    // no pipeline can emit is unbuilt by construction, and stays that way.
    const missing = "assets/final/maps/__unbuilt-probe__.png";
    // The premise, asserted rather than assumed: if this path ever becomes real, THIS line fails and
    // names the reason, instead of the behaviour assertions below going red and implicating the code.
    expect(realAssetIds()).not.toContain(assetId(missing));

    expect(hasRealAsset(missing)).toBe(false);
    expect(realAssetUrl(missing)).toBeNull();
    queueRealAssets(scene as unknown as Parameters<typeof queueRealAssets>[0]);
    expect(loaded.map((l) => l.key)).not.toContain(assetId(missing));
    // Stronger than the line above and derived rather than written down: what the loader was handed
    // is EXACTLY the census, so no path outside it can be requested by any route through this module.
    expect(loaded.map((l) => l.key).sort()).toEqual(realAssetIds());
  });

  it("a registered asset is queued under its id, once", () => {
    registerRealAsset("assets/final/ui/probe-c1.png", "/probe-c1.png");
    expect(hasRealAsset("ui/probe-c1")).toBe(true);
    expect(realAssetUrl("assets/final/ui/probe-c1.png")).toBe("/probe-c1.png");
    expect(realAssetIds()).toContain("ui/probe-c1");

    const { scene, textures, loaded } = fakeScene();
    const s = scene as unknown as Parameters<typeof queueRealAssets>[0];
    expect(queueRealAssets(s)).toContain("ui/probe-c1");
    expect(loaded).toContainEqual({ key: "ui/probe-c1", url: "/probe-c1.png" });

    textures.present.add("ui/probe-c1");
    expect(queueRealAssets(s)).not.toContain("ui/probe-c1");
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The packed sheets are NOT art
 *
 * THE DEFECT THIS BINDS, and it was live on every boot: `assets/final/atlas/` holds four packed
 * sheets, and a packed sheet is a PNG under `assets/final/`. The census glob had no exclusion for
 * that directory, so all four registered as ordinary art, `queueRealAssets` handed them to
 * `scene.load.image`, and `BootScene.preload` downloaded and GPU-uploaded ~104KB of sheet on every
 * boot — ON TOP OF the individual PNGs they were packed to replace, and drawn by nothing, because
 * no `textureFor` call in `game/` names an `atlas/*` id.
 *
 * These assert the exclusion from the FILES ON DISK rather than from a written-down list, so a
 * fifth sheet is covered the day it is packed, and the premise is asserted rather than assumed: if
 * `assets/final/atlas/` ever holds no PNG at all, the first expectation reddens and says so instead
 * of the rest passing for free.
 * ──────────────────────────────────────────────────────────────────────────── */

const ATLAS_DIR = resolve(fileURLToPath(new URL("../../", import.meta.url)), "assets/final/atlas");

/** The `assetId()` of every packed sheet actually sitting in `assets/final/atlas/`. */
function packedSheetIds(): string[] {
  let names: string[];
  try {
    names = readdirSync(ATLAS_DIR);
  } catch {
    names = [];
  }
  return names.filter((n) => n.endsWith(".png")).map((n) => assetId(`assets/final/atlas/${n}`)).sort();
}

describe("assets/final/atlas/ — packed sheets are build artefacts, never registered art", () => {
  it("the sheets are really there, so the assertions below are about something", () => {
    // The premise. A packed sheet is what the exclusion is FOR; with none on disk the rest of this
    // block would pass by absence, which is the shape of green this project refuses.
    expect(packedSheetIds().length, `no packed sheet under ${ATLAS_DIR} — this block is vacuous`)
      .toBeGreaterThan(0);
  });

  it("not one of them is in the real-art census", () => {
    const registered = new Set(realAssetIds());
    for (const id of packedSheetIds()) {
      expect(registered.has(id), `${id} is registered as art — the atlas/ exclusion is gone`).toBe(false);
      expect(hasRealAsset(`assets/final/${id}.png`)).toBe(false);
      expect(realAssetUrl(id)).toBeNull();
    }
    // Stronger, and derived: NO census id lives under the atlas directory, whatever it is called.
    expect(realAssetIds().filter((id) => id.startsWith("atlas/"))).toEqual([]);
  });

  it("and the boot loader is therefore never handed one", () => {
    // The cost the exclusion exists to remove, measured where it was actually paid: `queueRealAssets`
    // is what `BootScene.preload` calls, and what it queues is what the browser downloads.
    const { scene, loaded } = fakeScene();
    queueRealAssets(scene as unknown as Parameters<typeof queueRealAssets>[0]);
    const queued = loaded.map((l) => l.key);
    for (const id of packedSheetIds()) {
      expect(queued, `boot queued the packed sheet ${id}`).not.toContain(id);
    }
    expect(queued.filter((k) => k.startsWith("atlas/"))).toEqual([]);
  });

  it("the individual art the sheets pack is still registered — the exclusion is a directory, not a class", () => {
    // The counter-check that makes the three above mean something: subtracting `atlas/` must not
    // have taken the creature, npc, player or ui-frame plates with it.
    const ids = realAssetIds();
    for (const dir of ["creature-battle", "npc-static", "ui-frame"]) {
      expect(
        ids.filter((id) => id.startsWith(`${dir}/`)).length,
        `${dir}/ lost its art when atlas/ was subtracted`,
      ).toBeGreaterThan(0);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * BF-7 — the stand-in census
 *
 * The defect was silence: `textureFor` fell back to a labelled stand-in and reported nothing, so
 * "not generated yet" and "misspelled key" were indistinguishable at runtime. These bind the
 * census that replaces the silence. They also pin the property that makes it usable — recording is
 * silent, so a test never has to stub the console to stay quiet.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("BF-7 — textureFor records every stand-in it draws", () => {
  it("records a missing key, deduplicates it, and stays silent while doing so", () => {
    resetStandInCensus();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { scene, textures } = fakeScene();
      const s = scene as unknown as Parameters<typeof textureFor>[0];

      textureFor(s, "assets/final/maps/r1.png", 64, 64);
      textureFor(s, "assets/final/maps/r1.png", 64, 64); // same key twice — one census row
      textureFor(s, "assets/final/maps/r2.png", 64, 64);
      expect(standInCensus()).toEqual(["maps/r1", "maps/r2"]);

      // Silent by default: this is the BF-7 caveat, and it is why no test stubs the console.
      expect(warn).not.toHaveBeenCalled();

      // A key the loader HAS is real art and never reaches the census.
      textures.present.add("maps/r3");
      expect(textureFor(s, "assets/final/maps/r3.png", 64, 64)).toBe("maps/r3");
      expect(standInCensus()).toEqual(["maps/r1", "maps/r2"]);
    } finally {
      warn.mockRestore();
      resetStandInCensus();
    }
  });

  it("warns once per key, and only when the running game has asked it to", () => {
    resetStandInCensus();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { scene } = fakeScene();
      const s = scene as unknown as Parameters<typeof textureFor>[0];

      warnOnStandIns(true);
      textureFor(s, "assets/final/maps/r9.png", 64, 64);
      textureFor(s, "assets/final/maps/r9.png", 64, 64);
      expect(warn).toHaveBeenCalledTimes(1); // once per KEY, not once per call
      expect(String(warn.mock.calls[0]?.[0])).toContain("maps/r9");
    } finally {
      warnOnStandIns(false);
      warn.mockRestore();
      resetStandInCensus();
    }
  });
});
