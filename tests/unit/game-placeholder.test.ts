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

import { afterEach, describe, expect, it } from "vitest";

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
  queueRealAssets,
  realAssetIds,
  realAssetUrl,
  registerRealAsset,
  textureFor,
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

/** What one label block actually occupies, in texture pixels, as `drawPlaceholder` draws it. */
function labelBox(
  plan: PlaceholderPlan,
  label: PlaceholderLabel,
): { left: number; right: number; top: number; bottom: number } {
  const maxWidth = Math.max(1, plan.cellWidth - 4);
  const longest = Math.max(...label.lines.map((l) => l.length));
  // `fillText`'s maxWidth argument squeezes rather than clips, so the drawn width never exceeds it.
  const width = Math.min(longest * plan.fontPx * 0.6, maxWidth);
  const height = label.lines.length * plan.lineHeightPx;
  return {
    left: label.x - width / 2,
    right: label.x + width / 2,
    top: label.y - height / 2,
    bottom: label.y + height / 2,
  };
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
  it("the player sprite gets exactly one, carrying the id and the size", () => {
    const plan = placeholderPlan("player/walk", balance.map.playerSpriteW, balance.map.playerSpriteH);
    expect(plan.labels).toHaveLength(1);
    expect(plan.labels[0]?.lines).toContain("player/walk");
    expect(plan.labels[0]?.lines).toContain(
      `${balance.map.playerSpriteW}x${balance.map.playerSpriteH}`,
    );
    expect(plan.cornerMarkOnly).toBe(false);
  });

  it("a texture too small for any text still marks itself", () => {
    const plan = placeholderPlan("ui/pip", 8, 8);
    expect(plan.cornerMarkOnly).toBe(true);
    expect(plan.labels).toHaveLength(0);
  });

  it("the note rides on the middle block only, and the id on all of them", () => {
    const native = balance.map.mapNativePx;
    const plan = placeholderPlan("maps/x", native, native, { note: "a long note about the node" });
    const withNote = plan.labels.filter((l) => l.lines.includes("a long note about the node"));
    expect(withNote).toHaveLength(1);
    expect(plan.labels.every((l) => l.lines.includes("maps/x"))).toBe(true);
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
  fillStyle(): this {
    return this;
  }
  fillRect(): this {
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
    const missing = content.nodes[0]?.mapAsset ?? "assets/final/maps/unknown.png";
    expect(hasRealAsset(missing)).toBe(false);
    expect(realAssetUrl(missing)).toBeNull();
    queueRealAssets(scene as unknown as Parameters<typeof queueRealAssets>[0]);
    expect(loaded.map((l) => l.key)).not.toContain(assetId(missing));
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
