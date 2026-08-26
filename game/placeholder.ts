/**
 * game/placeholder.ts — the ONE helper the whole game uses for art that does not exist yet.
 *
 * Build-doc §15 ships Lane C ("game shell") in parallel with Lane B ("asset factory"), so every
 * scene is drawing something before its art exists. Two failure modes are worth more than the code
 * it takes to avoid them:
 *
 *   1. Each scene rolls its own stand-in, so the same missing asset is a grey box here, a magenta
 *      square there, and a stretched trial PNG somewhere else. Nobody can tell at a glance which
 *      art is real.
 *   2. A stand-in that looks finished. Then "the art is done" is decided by whoever last looked at
 *      a screenshot, which is exactly the mistake the art guardrails exist to prevent.
 *
 * So: every placeholder is a flat colour + a hatch + a border + the asset id printed on it. It is
 * unmistakably unfinished, it names itself so a reviewer can say WHICH asset is missing, and the
 * colour is hashed from the id so one asset is always the same colour across scenes and runs.
 * "Names itself" is a claim about the PIXELS, not about the plan object: the id is wrapped to lines
 * that fit the cell at natural glyph width (see `wrapLabel`), because `fillText`'s maxWidth argument
 * squeezes rather than clips and a 2.4×-compressed id is an unreadable smear that still passes any
 * assertion made about `plan.labels[].lines`.
 * There is no randomness here at all — `Math.random` is banned repo-wide (G11) and would also make
 * the same asset change colour between frames.
 *
 * Real art wins whenever it exists: `hasRealAsset()` answers off the contents of `assets/final/`,
 * and `textureFor()` returns the real texture the moment the loader has it.
 *
 * NEVER fake art by stretching an unrelated image. `textureFor()` returns the real texture at its
 * natural size and only the PLACEHOLDER is drawn to a requested size.
 */

import type Phaser from "phaser";

import type { PaletteFile } from "@core/types";

// The virtual screen and the map render scale, for the label-tiling rule below. Read straight off
// balance.json for the same reason game/boot.ts does: a stand-in has to be drawable before content
// validation has run, and G11 still says the numbers come from data/, never from a literal here.
import balanceJson from "../data/balance.json";

import { registry } from "./registry";

/* ────────────────────────────────────────────────────────────────────────────
 * Asset ids
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * `assets/final/` is the canonical committed home for finished art (build-doc §5), and every
 * `mapAsset` / `collisionMask` in `data/nodes/*.json` is written as a path INTO it
 * (`assets/final/maps/r1.png`). The id a scene uses is that path with the directory prefix and the
 * extension removed — `maps/r1` — so a caller may pass either form and get the same answer.
 */
const FINAL_DIR = "assets/final/";
const ASSET_EXT = /\.(png|jpe?g|webp|gif|json|mp3|ogg|wav)$/i;

export function assetId(idOrPath: string): string {
  let s = idOrPath.trim().replace(/^\.?\/+/, "");
  const at = s.indexOf(FINAL_DIR);
  if (at >= 0) s = s.slice(at + FINAL_DIR.length);
  return s.replace(ASSET_EXT, "");
}

/* ────────────────────────────────────────────────────────────────────────────
 * Which assets are real (build-doc §5 assets/final/)
 * ──────────────────────────────────────────────────────────────────────────── */

declare global {
  // `import.meta.glob` is Vite's compile-time directory scan. Its types normally arrive with
  // `vite/client`, which tsconfig.json does not pull in (`"types": ["node"]`), so it is declared
  // here rather than by widening the project's ambient types from a game module.
  interface ImportMeta {
    glob(
      pattern: string,
      options?: { eager?: boolean; query?: string; import?: string },
    ): Record<string, unknown>;
  }
}

/**
 * The real-art census, taken at BUILD time rather than guessed at runtime.
 *
 * Today `assets/final/` holds nothing (Lane B has produced only the B0 player sweep and the five
 * style trials, neither of which is a shipped asset), so this is `{}` and every `hasRealAsset()`
 * answer is `false` — which is the honest answer. When Lane B lands an asset the glob picks it up
 * with no code change, which is the point: nothing here has to be kept in sync by hand.
 *
 * `query: "?url"` asks Vite for the emitted URL rather than the file contents, so the strings below
 * are correct in `vite dev` AND in a hashed production build.
 */
const GLOBBED_FINAL = import.meta.glob("../assets/final/**/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const realAssets = new Map<string, string>();

/**
 * Register an asset that exists but is not a PNG under `assets/final/` — an audio pack file, an
 * atlas produced at build time, anything a later lane loads by URL. Keeps one answer to "is this
 * real" instead of a second private list.
 */
export function registerRealAsset(idOrPath: string, url: string): void {
  realAssets.set(assetId(idOrPath), url);
}

for (const [path, url] of Object.entries(GLOBBED_FINAL)) registerRealAsset(path, url);

/** Does finished art exist for this asset id (or `assets/final/...` path)? */
export function hasRealAsset(idOrPath: string): boolean {
  return realAssets.has(assetId(idOrPath));
}

/** The URL to load the real asset from, or null when it is still unbuilt. */
export function realAssetUrl(idOrPath: string): string | null {
  return realAssets.get(assetId(idOrPath)) ?? null;
}

/** Every real asset id, sorted. Used by the boot loader and by the "what is missing" readouts. */
export function realAssetIds(): string[] {
  return [...realAssets.keys()].sort();
}

/**
 * Queue every real asset for loading under its own id, so `textureFor(scene, id, …)` finds it.
 * Loading is not fatal: a missing or broken file falls back to the labelled placeholder, because a
 * game that will not boot over one absent PNG is worse than one that says which PNG is absent.
 */
export function queueRealAssets(scene: Phaser.Scene): string[] {
  const queued: string[] = [];
  for (const id of realAssetIds()) {
    const url = realAssetUrl(id);
    if (url === null) continue;
    if (scene.textures.exists(id)) continue;
    scene.load.image(id, url);
    queued.push(id);
  }
  return queued;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Colour, hashed from the id
 * ──────────────────────────────────────────────────────────────────────────── */

/** FNV-1a, 32-bit. Deterministic and cheap; the point is stability, not distribution quality. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || m[1] === undefined) return null;
  const n = Number.parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function toHex({ r, g, b }: Rgb): string {
  const part = (v: number): string =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Perceived luminance, 0..1 — decides whether the label is drawn in ink or in paper. */
function luminance({ r, g, b }: Rgb): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * A mid-tone colour derived from the hash, used only when no palette is available (i.e. content
 * validation failed, so the failure screen still has to draw something).
 */
function hashedFallback(h: number): Rgb {
  return {
    r: 64 + ((h >>> 0) & 0x7f),
    g: 64 + ((h >>> 8) & 0x7f),
    b: 64 + ((h >>> 16) & 0x7f),
  };
}

function paletteOf(explicit?: PaletteFile | null): PaletteFile | null {
  if (explicit !== undefined) return explicit;
  return registry.contentOrNull()?.palette ?? null;
}

/**
 * The placeholder colour for an asset id: a swatch from `data/palette.json` chosen by hash.
 *
 * Using the project palette keeps the stand-ins inside the style lock's colour space (build-doc
 * §8.4) instead of introducing a second, unrelated set of colours that a reviewer then has to
 * mentally subtract from every screenshot. The palette ids `c00`–`c31` are the stable contract; the
 * hex VALUES are still placeholders themselves until gate B0 freezes them, and when they change
 * these stand-ins simply change with them.
 */
export function placeholderHex(id: string, palette?: PaletteFile | null): string {
  const file = paletteOf(palette);
  const colors = file?.colors ?? [];
  const h = hash32(id);
  if (colors.length > 0) {
    const swatch = colors[h % colors.length];
    if (swatch && parseHex(swatch.hex)) return swatch.hex;
  }
  return toHex(hashedFallback(h));
}

/* ────────────────────────────────────────────────────────────────────────────
 * The texture
 * ──────────────────────────────────────────────────────────────────────────── */

export interface PlaceholderOpts {
  /** Overrides the palette read from the registry (used before content is loaded). */
  palette?: PaletteFile | null;
  /** Extra line under the id — e.g. the lane that owes the asset. */
  note?: string;
}

/** Texture key for a placeholder. Size is part of the key so two sizes cannot collide. */
export function placeholderKey(idOrPath: string, width: number, height: number): string {
  return `placeholder:${assetId(idOrPath)}@${Math.round(width)}x${Math.round(height)}`;
}

const HATCH_SPACING_PX = 8;
const MIN_LABEL_HEIGHT_PX = 14;
/** Label blocks per screenful, per axis. 2 ⇒ a crop one screen wide always contains a whole one. */
const LABELS_PER_SCREEN = 2;
const MIN_LABEL_PITCH_PX = 24;
const MIN_FONT_PX = 6;
const MAX_FONT_PX = 16;
/** Monospace advance as a fraction of the em — good enough to decide whether a line fits. */
const MONO_ADVANCE = 0.6;
/** The word that has to survive any crop. */
const BANNER = "PLACEHOLDER";
/**
 * Margin the label keeps from the cell edge. It is the SAME number `drawPlaceholder` hands to
 * `fillText`'s maxWidth, and it has to stay that way: the plan promises a line fits, and the draw
 * enforces it — if the two disagreed, the plan's promise would be about a width nothing measures.
 */
const LABEL_INSET_PX = 4;
/** Characters that a wrapped line may end on, so a split id still reads as a path. */
const BREAK_AFTER = new Set(["/", "-", "_", " "]);

/**
 * How much of a texture one screenful can show, in TEXTURE pixels.
 *
 * Read from `data/balance.json` directly, exactly as `game/boot.ts` reads the viewport, because the
 * answer is needed before `validateContent()` has run and before the registry has content (G11: the
 * numbers still come from balance.json, never from a literal here). `mapRenderScale` is what makes
 * this smaller than the virtual screen: a 1024² painted map is displayed at 2048², so the camera's
 * 480×320 window covers only 240×160 of the texture — and a label outside that window is a label
 * nobody sees.
 *
 * Conservative on purpose: a texture drawn 1:1 gets MORE labels than it strictly needs, never fewer.
 */
function textureCrop(): { width: number; height: number } {
  const map = (
    balanceJson as {
      map?: { virtualWidth?: unknown; virtualHeight?: unknown; mapRenderScale?: unknown };
    }
  ).map;
  const w = typeof map?.virtualWidth === "number" && map.virtualWidth > 0 ? map.virtualWidth : 1;
  const h = typeof map?.virtualHeight === "number" && map.virtualHeight > 0 ? map.virtualHeight : 1;
  const s =
    typeof map?.mapRenderScale === "number" && map.mapRenderScale >= 1 ? map.mapRenderScale : 1;
  return { width: Math.max(1, Math.floor(w / s)), height: Math.max(1, Math.floor(h / s)) };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Fitting the label to the cell
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Break `text` into lines that each fit `maxChars`, preferring to break just after a path separator
 * or at a space so the pieces still read as the thing they came from.
 *
 * THE DEFECT THIS EXISTS TO PREVENT. `ctx.fillText(line, x, y, maxWidth)` SQUEEZES rather than
 * clips: a 14-character id at 8px (67px of glyphs) handed a 28px maxWidth renders at 2.4× horizontal
 * compression, which is an unreadable smear — measured live on the 32×48 overworld player, whose id
 * row was illegible while `plan.labels[0].lines` still contained the id in full. A stand-in that
 * cannot be read is a stand-in that does not name itself, which is the one property this whole file
 * exists to provide. So the plan never emits a line the draw would have to squeeze.
 *
 * Only whitespace is ever dropped, so `wrapLabel(t, n).join("")` is `t` with its break-point spaces
 * removed — which is what lets a test recover the id from the lines exactly.
 */
export function wrapLabel(text: string, maxChars: number): string[] {
  const limit = Math.max(1, Math.floor(maxChars));
  const out: string[] = [];
  let rest = text;

  while (rest.length > limit) {
    // The last break opportunity inside the window; a hard cut at the window edge if there is none.
    let cut = limit;
    for (let i = limit; i >= 1; i -= 1) {
      if (BREAK_AFTER.has(rest[i - 1] ?? "") || rest[i] === " ") {
        cut = i;
        break;
      }
    }
    const line = rest.slice(0, cut).replace(/\s+$/, "");
    if (line.length > 0) out.push(line);
    rest = rest.slice(cut).replace(/^\s+/, "");
  }
  if (rest.length > 0) out.push(rest);
  return out.length > 0 ? out : [text];
}

/** One font size's worth of label geometry, ranked against the others by {@link fitLabel}. */
interface LabelFit {
  fontPx: number;
  lineHeightPx: number;
  maxChars: number;
  idLines: string[];
  /** The lines every block carries: the banner (when it fits), the wrapped id, the size. */
  lines: string[];
}

function fitAt(id: string, size: string, cellWidth: number, cellHeight: number, fontPx: number): LabelFit | null {
  const maxChars = Math.floor((cellWidth - LABEL_INSET_PX) / (fontPx * MONO_ADVANCE));
  if (maxChars < 1) return null;
  const lineHeightPx = fontPx + 2;
  const idLines = wrapLabel(id, maxChars);
  // The id is the part a reviewer needs; a font at which it alone will not fit is no use.
  if (idLines.length * lineHeightPx > cellHeight) return null;

  const banner = BANNER.length <= maxChars ? [BANNER] : [];
  const tail = size.length <= maxChars ? [size] : [];
  let lines = [...banner, ...idLines, ...tail];
  // Shed the optional rows rather than overflow the cell: the size first, then the banner.
  if (lines.length * lineHeightPx > cellHeight) lines = [...banner, ...idLines];
  if (lines.length * lineHeightPx > cellHeight) lines = [...idLines];
  return { fontPx, lineHeightPx, maxChars, idLines, lines };
}

/**
 * The best label geometry for a cell: **fewest id lines first, then the largest font**.
 *
 * Fewest-lines-first is deliberate. A bigger font that chops `battle/nibbin-line/J/front` into five
 * fragments is harder to read than a slightly smaller one that splits it in two at its own
 * separators, and the fragment count is what decides whether the id is still recognisable.
 */
function fitLabel(id: string, size: string, cellWidth: number, cellHeight: number, maxFontPx: number): LabelFit | null {
  let best: LabelFit | null = null;
  for (let fontPx = Math.max(MIN_FONT_PX, Math.floor(maxFontPx)); fontPx >= MIN_FONT_PX; fontPx -= 1) {
    const fit = fitAt(id, size, cellWidth, cellHeight, fontPx);
    if (!fit) continue;
    if (!best || fit.idLines.length < best.idLines.length) best = fit;
  }
  return best;
}

/** One label block: where its centre sits in texture space, and what it says. */
export interface PlaceholderLabel {
  x: number;
  y: number;
  lines: string[];
}

/**
 * Everything drawing a stand-in needs, with no canvas involved — so the honesty property can be
 * asserted (tests/unit/game-placeholder.test.ts) instead of eyeballed in a screenshot.
 */
export interface PlaceholderPlan {
  id: string;
  width: number;
  height: number;
  fill: string;
  ink: string;
  hatchSpacingPx: number;
  fontPx: number;
  lineHeightPx: number;
  /** Label grid step in texture px, or null when a single centred block covers the whole texture. */
  cellWidth: number;
  cellHeight: number;
  labels: PlaceholderLabel[];
  /** True when the texture is too small for any text at all and only a corner mark is drawn. */
  cornerMarkOnly: boolean;
  /**
   * The asset id as it is actually drawn — wrapped onto as many lines as the cell can hold at
   * natural glyph width. `idLines.join("")` is the id, so a test can recover it exactly.
   */
  idLines: string[];
  /** Characters that fit one line at `fontPx`. Every line the plan emits is within it. */
  maxLabelChars: number;
}

/**
 * THE defect this function exists to prevent, in one sentence: a 1024² map placeholder with one
 * 10px label in its middle, displayed at 2048², is an unlabelled flat colour anywhere the camera is
 * not standing on the centre — which reads as finished ground art, the exact failure the shared
 * helper was built to stop. (Reproduced by the C1 audit: a crop at world origin showed colour and a
 * fine pinstripe and nothing else.)
 *
 * So the label is TILED at a pitch derived from what one screenful can show. Any window of a
 * screenful contains at least one whole label block, wherever the camera sits, at any texture size.
 * The hatch coarsens with the same pitch so it stays a stripe rather than becoming a texture.
 */
export function placeholderPlan(
  idOrPath: string,
  width: number,
  height: number,
  opts: PlaceholderOpts = {},
): PlaceholderPlan {
  const id = assetId(idOrPath);
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const fill = placeholderHex(id, opts.palette);
  const rgb = parseHex(fill) ?? hashedFallback(hash32(id));
  // The INK is deliberately not a palette swatch, unlike the fill. It is picked for maximum contrast
  // against whatever the fill turned out to be, and it has to work when there is NO palette at all
  // (the content-failure screen draws a stand-in before `validateContent()` has succeeded). A
  // swatch-constrained label would be the one part of a stand-in that could become unreadable.
  const ink = luminance(rgb) > 0.5 ? "#101010" : "#f0f0f0";

  const base: PlaceholderPlan = {
    id,
    width: w,
    height: h,
    fill,
    ink,
    hatchSpacingPx: HATCH_SPACING_PX,
    fontPx: MIN_FONT_PX,
    lineHeightPx: MIN_FONT_PX + 2,
    cellWidth: w,
    cellHeight: h,
    labels: [],
    cornerMarkOnly: false,
    idLines: [],
    maxLabelChars: 0,
  };

  if (h < MIN_LABEL_HEIGHT_PX || w < MIN_LABEL_HEIGHT_PX) {
    return { ...base, cornerMarkOnly: true };
  }

  const crop = textureCrop();
  const fits = w <= crop.width && h <= crop.height;

  const pitchX = Math.max(MIN_LABEL_PITCH_PX, Math.floor(crop.width / LABELS_PER_SCREEN));
  const pitchY = Math.max(MIN_LABEL_PITCH_PX, Math.floor(crop.height / LABELS_PER_SCREEN));
  const cols = fits ? 1 : Math.max(1, Math.ceil(w / pitchX));
  const rows = fits ? 1 : Math.max(1, Math.ceil(h / pitchY));
  const cellWidth = w / cols;
  const cellHeight = h / rows;

  // The largest font the cell's SHAPE allows; `fitLabel` searches downward from it for the size at
  // which the id wraps into the fewest pieces.
  const maxFontPx = fits
    ? Math.max(MIN_FONT_PX, Math.min(10, Math.floor(h / 6)))
    : Math.max(
        MIN_FONT_PX,
        Math.min(MAX_FONT_PX, Math.floor(Math.min(cellHeight / 6, cellWidth / 10))),
      );

  const size = `${w}x${h}`;
  const fit = fitLabel(id, size, cellWidth, cellHeight, maxFontPx);
  if (!fit) {
    // No font down to MIN_FONT_PX can hold even the id inside this cell. Squeezing it in anyway is
    // the smear this function exists to avoid, so the texture falls back to the corner mark — which
    // still says "stand-in" and does not pretend to name an asset it cannot legibly name.
    // Only reachable for a SINGLE-cell (sprite-sized) texture: a tiled map's cells are at least
    // MIN_LABEL_PITCH_PX and always take a fit.
    return { ...base, cornerMarkOnly: true };
  }
  const { fontPx, lineHeightPx } = fit;
  const noteLines = opts.note ? wrapLabel(opts.note, fit.maxChars) : [];
  const noteFits = (fit.lines.length + noteLines.length) * lineHeightPx <= cellHeight;

  const centreCol = Math.floor((cols - 1) / 2);
  const centreRow = Math.floor((rows - 1) / 2);
  const labels: PlaceholderLabel[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lines = [...fit.lines];
      // The note (which node, which year, which lane owes it) is long, so it rides on the middle
      // block only. The ID is on every block — that is the part a reviewer needs from any crop.
      if (noteFits && noteLines.length > 0 && r === centreRow && c === centreCol) lines.push(...noteLines);
      labels.push({ x: (c + 0.5) * cellWidth, y: (r + 0.5) * cellHeight, lines });
    }
  }

  return {
    ...base,
    fontPx,
    lineHeightPx,
    idLines: fit.idLines,
    maxLabelChars: fit.maxChars,
    hatchSpacingPx: fits
      ? HATCH_SPACING_PX
      : Math.max(HATCH_SPACING_PX, Math.round(Math.min(cellWidth, cellHeight) / 4)),
    cellWidth,
    cellHeight,
    labels,
    cornerMarkOnly: false,
  };
}

/**
 * The 2D-context calls a plan turns into. Exported so a recording stub can drive it in a node test —
 * there is no canvas in vitest, and "the label is drawn" is exactly the claim worth binding.
 */
export function drawPlaceholder(ctx: CanvasRenderingContext2D, plan: PlaceholderPlan): void {
  const { width, height, ink } = plan;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = plan.fill;
  ctx.fillRect(0, 0, width, height);

  // Diagonal hatch — the thing that makes a stand-in impossible to mistake for finished art in a
  // screenshot, at any zoom, in any colour. Its pitch scales with the label grid so that a map-sized
  // texture shown at render scale carries a bold stripe instead of a fine pinstripe.
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -height; x < width; x += plan.hatchSpacingPx) {
    ctx.moveTo(x, height);
    ctx.lineTo(x + height, 0);
  }
  ctx.stroke();
  ctx.restore();

  // Border, inset by half a pixel so it lands on the pixel grid rather than across it.
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, Math.max(1, width - 1), Math.max(1, height - 1));

  if (plan.cornerMarkOnly) {
    // Too small for text: a corner mark still says "this is a stand-in".
    ctx.fillStyle = ink;
    ctx.fillRect(1, 1, 2, 2);
    return;
  }

  // The label lattice. On a tiled plan the grid lines are half the signal: a regular lattice over
  // flat colour is not something a painted map ever looks like.
  if (plan.labels.length > 1) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = plan.cellWidth; x < width - 0.5; x += plan.cellWidth) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, height);
    }
    for (let y = plan.cellHeight; y < height - 0.5; y += plan.cellHeight) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(width, Math.round(y) + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${plan.fontPx}px monospace`;
  // The same inset the plan fitted to, so maxWidth is a belt-and-braces clamp and never a squeeze:
  // every line `placeholderPlan` emits is already within it at natural glyph width.
  const maxWidth = Math.max(1, plan.cellWidth - LABEL_INSET_PX);
  for (const label of plan.labels) {
    const top = label.y - ((label.lines.length - 1) * plan.lineHeightPx) / 2;
    label.lines.forEach((line, i) => {
      ctx.fillText(line, label.x, top + i * plan.lineHeightPx, maxWidth);
    });
  }
}

/**
 * Create (once) and return the texture key for a labelled stand-in of the given size.
 *
 * Idempotent: the second call with the same id and size returns the existing key without redrawing.
 */
export function placeholderTexture(
  scene: Phaser.Scene,
  idOrPath: string,
  width: number,
  height: number,
  opts: PlaceholderOpts = {},
): string {
  const id = assetId(idOrPath);
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const key = placeholderKey(id, w, h);
  if (scene.textures.exists(key)) return key;

  const plan = placeholderPlan(id, w, h, opts);
  const fill = plan.fill;
  const canvas = scene.textures.createCanvas(key, w, h);
  if (canvas) {
    const ctx = canvas.getContext();
    drawPlaceholder(ctx, plan);
    canvas.refresh();
    return key;
  }

  // No canvas texture available (headless / a texture manager that refused). `Graphics` cannot draw
  // text, so this branch cannot name the asset — which makes it the one place a stand-in could pass
  // for finished ground art. It therefore draws the label LATTICE instead: the same grid the plan
  // computed, plus a full diagonal cross. Nothing painted looks like that, at any size or zoom.
  const g = scene.add.graphics();
  const rgb = parseHex(fill) ?? hashedFallback(hash32(id));
  const inkHex = luminance(rgb) > 0.5 ? 0x101010 : 0xf0f0f0;
  g.fillStyle((rgb.r << 16) | (rgb.g << 8) | rgb.b, 1);
  g.fillRect(0, 0, w, h);
  // The lattice, drawn as thin filled rects rather than strokes so this branch uses only the four
  // Graphics calls it always used — every caller and every test double already supports them.
  g.fillStyle(inkHex, 0.4);
  for (let x = plan.cellWidth; x < w - 0.5; x += plan.cellWidth) g.fillRect(Math.round(x), 0, 1, h);
  for (let y = plan.cellHeight; y < h - 0.5; y += plan.cellHeight) g.fillRect(0, Math.round(y), w, 1);
  // …and a corner block in every cell, so even a crop between two lattice lines carries a mark.
  g.fillStyle(inkHex, 1);
  const mark = Math.max(2, Math.round(Math.min(plan.cellWidth, plan.cellHeight) / 8));
  for (let y = 0; y < h - 0.5; y += plan.cellHeight) {
    for (let x = 0; x < w - 0.5; x += plan.cellWidth) {
      g.fillRect(Math.round(x) + 1, Math.round(y) + 1, mark, mark);
    }
  }
  g.lineStyle(1, inkHex, 1);
  g.strokeRect(0, 0, w, h);
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}

/**
 * The texture a scene should actually draw for this asset: the real one if it has loaded, the
 * labelled stand-in otherwise.
 */
/* ────────────────────────────────────────────────────────────────────────────
 * The stand-in census — BF-7
 *
 * `textureFor` used to fall back to a labelled stand-in and say nothing, which made "this asset
 * has not been generated yet" and "this key is misspelled" indistinguishable at runtime. That is
 * the silence that let a 162-vs-150 key mismatch survive, and it is what makes BF-4's twelve
 * permanently-missing sprites invisible.
 *
 * The census RECORDS ALWAYS and WARNS ONLY ON REQUEST. Recording is silent, deduplicated by key,
 * and readable by a test — so the fallback becomes assertable without any test having to stub the
 * console. `game/boot.ts` turns warnings on for the running game;
 * `tests/unit/game-placeholder.test.ts:446` calls `textureFor` twice with a deliberately-absent key
 * and stays quiet, which is the caveat BF-7 names.
 * ──────────────────────────────────────────────────────────────────────────── */

const standInKeys = new Set<string>();
let warnOnStandIn = false;

/** Every asset key that has fallen back to a stand-in this session, in first-seen order. */
export function standInCensus(): readonly string[] {
  return [...standInKeys];
}

/** Clear the census. For tests, and for a scene restart that wants a fresh reading. */
export function resetStandInCensus(): void {
  standInKeys.clear();
}

/**
 * Turn the one-line-per-new-key warning on. `game/boot.ts` calls this; tests do not, which is why
 * the suite stays silent while still being able to read {@link standInCensus}.
 */
export function warnOnStandIns(on: boolean): void {
  warnOnStandIn = on;
}

export function textureFor(
  scene: Phaser.Scene,
  idOrPath: string,
  width: number,
  height: number,
  opts: PlaceholderOpts = {},
): string {
  const id = assetId(idOrPath);
  if (scene.textures.exists(id)) return id;
  if (!standInKeys.has(id)) {
    standInKeys.add(id);
    // Once per KEY, never once per call: a scene redrawing every frame must not flood the console.
    if (warnOnStandIn) console.warn(`[assets] no texture "${id}" — drawing a stand-in`);
  }
  return placeholderTexture(scene, id, width, height, opts);
}

/**
 * Add an image for an asset. Real art is drawn at its NATURAL size — never scaled to fit a slot,
 * because a stretched image is the one failure mode that reads as finished-but-wrong. Only the
 * placeholder is generated at the requested size.
 */
export function placeholderImage(
  scene: Phaser.Scene,
  x: number,
  y: number,
  idOrPath: string,
  width: number,
  height: number,
  opts: PlaceholderOpts = {},
): Phaser.GameObjects.Image {
  const key = textureFor(scene, idOrPath, width, height, opts);
  return scene.add.image(x, y, key);
}
