/**
 * tests/unit/dialogue-scene.test.ts — THE BOX, RUN.
 *
 * The claim this file binds is the one the whole C7 layer is about and the one no existing test
 * could make: **a line from `data/dialogue.json` is on the screen**. So the REAL scene class is
 * built (`createDialogueScene`, the same factory `game/main.ts` would register), driven through a
 * recorded interaction — keypress by keypress, frame by frame — and the assertions are on the text
 * that was actually drawn, not on the model behind it.
 *
 * The stub is a RECORDER, not a renderer: display objects remember what was written to them, there
 * is no wall clock, and there is no `Math.random` (G11). It models the two pieces of Phaser
 * behaviour the scene depends on — that `addKey` suppresses OS auto-repeat for a registered key,
 * and that `destroy()` removes an object from the display list — because both are load-bearing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  WHAT THE STUB MUST NOT DO, AND ONCE DID
 * ─────────────────────────────────────────────────────────────────────────────
 * Every display object here used to be a `Proxy` that answered an unknown method with a chainable
 * no-op. That shape RECORDS NOTHING, and an assertion about a call it swallows is not a weak test —
 * it is a test that cannot fail. `tests/unit/art-slot-fit.test.ts` exists because the suite's image
 * stubs were exactly that shape and could not answer "how big was the art drawn?", which let a
 * 1024² plate ship green into a 128² slot.
 *
 * So {@link StubImage} is a CLASS, not a proxy: `setDisplaySize` really sets a scale, `width`/
 * `height` really report the texture's natural size, and any method the scene calls that this class
 * does not define is a `TypeError` rather than a silent success. The portrait's drawn size is
 * asserted off those recorded numbers and off nothing else.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  DIALOGUE,
  type DialogueEntry,
  type DialogueFile,
  type DialogueSpeaker,
} from "@core/dialogue-schema";
import { validateContent } from "@core/schemas";
import type { Balance, Content } from "@core/types";
import type { DialogueRunState } from "@game/dialogue-runner";
import { assetId, hasRealAsset, realAssetIds } from "@game/placeholder";
import {
  DIALOGUE_FRAME_ASSET_ID,
  DIALOGUE_SCENE_KEY,
  createDialogueScene,
  crawl,
  crawlLength,
  defaultDialogueStyle,
  dialogueBoxRect,
  dialogueChoiceColumns,
  dialogueColumns,
  dialoguePortraitRect,
  dialogueTextLeft,
  pageCount,
  pageOf,
  portraitAssetId,
  speakerHasFace,
  wrapDialogue,
  type DialogueSceneData,
  type DialogueStyle,
} from "@game/scenes/DialogueScene";
import { SCENE_KEYS } from "@game/scene-keys";
import { TEXT_SPEED_CPS } from "@game/registry";

const content: Content = validateContent();
const balance: Balance = content.balance;
const STYLE: DialogueStyle = defaultDialogueStyle(balance);

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

/* ════════════════════════════════════════════════════════════════════════════
 * The art the box actually draws, read from the files and the manifest that make it
 * ════════════════════════════════════════════════════════════════════════════ */

interface ManifestRow {
  id: string;
  class: string;
  finalFile: string;
}

interface ManifestClass {
  targetW: number;
  targetH: number;
  finalDir: string;
}

const MANIFEST = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "tools/comfy/manifest.json"), "utf8"),
) as { rows: ManifestRow[]; classes: Record<string, ManifestClass> };

const ROW_BY_ID = new Map(MANIFEST.rows.map((row) => [row.id, row]));

/**
 * The size the pipeline generates a manifest row at — read from the manifest that generates it,
 * never written down here. This is what makes the fit assertion non-vacuous: `npc-static` targets
 * 32×48 and lands in a 32×48 slot at scale 1, where a missing fit is invisible, while
 * `trainer-battle` targets 96×96 and is the case that reddens.
 */
function generatedSize(rowId: string): { width: number; height: number } {
  const row = ROW_BY_ID.get(rowId);
  if (!row) throw new Error(`tools/comfy/manifest.json has no row "${rowId}"`);
  const spec = MANIFEST.classes[row.class];
  if (!spec) throw new Error(`tools/comfy/manifest.json has no class "${row.class}"`);
  return { width: spec.targetW, height: spec.targetH };
}

/** The texture key the game loads a manifest row under: its `finalFile`, minus `assets/final/`. */
function keyOf(rowId: string): string {
  const row = ROW_BY_ID.get(rowId);
  if (!row) throw new Error(`tools/comfy/manifest.json has no row "${rowId}"`);
  return assetId(row.finalFile);
}

/** A PNG's real dimensions, straight out of its IHDR — the pixels, not a number about them. */
function pngSize(relPath: string): { width: number; height: number } {
  const bytes = readFileSync(resolve(REPO_ROOT, relPath));
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * Read a PNG's actual pixels.
 *
 * Here because the frame's border width and its interior colour are properties of the ART, and a
 * test that took either from a constant beside the one in the code would be checking that a number
 * equals itself. 8-bit RGB/RGBA only, non-interlaced — what the pipeline writes — and it throws
 * loudly on anything else rather than returning a colour it guessed.
 */
interface PngPixels {
  width: number;
  height: number;
  /** `#rrggbb` at (x, y). */
  at: (x: number, y: number) => string;
}

function readPng(relPath: string): PngPixels {
  const bytes = readFileSync(resolve(REPO_ROOT, relPath));
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const depth = bytes[24];
  const colorType = bytes[25];
  const interlace = bytes[28];
  if (depth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new Error(`${relPath}: expected a non-interlaced 8-bit RGB/RGBA PNG, got depth ${String(depth)} type ${String(colorType)}`);
  }
  const channels = colorType === 6 ? 4 : 3;

  const parts: Buffer[] = [];
  let at = 8;
  while (at < bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString("ascii", at + 4, at + 8);
    if (type === "IDAT") parts.push(bytes.subarray(at + 8, at + 8 + length));
    if (type === "IEND") break;
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(parts));

  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos];
    pos += 1;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? (out[y * stride + i - channels] as number) : 0;
      const up = y > 0 ? (out[(y - 1) * stride + i] as number) : 0;
      const upLeft = y > 0 && i >= channels ? (out[(y - 1) * stride + i - channels] as number) : 0;
      let value = raw[pos + i] as number;
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const dl = Math.abs(p - left);
        const du = Math.abs(p - up);
        const dul = Math.abs(p - upLeft);
        value += dl <= du && dl <= dul ? left : du <= dul ? up : upLeft;
      }
      out[y * stride + i] = value & 0xff;
    }
    pos += stride;
  }

  return {
    width,
    height,
    at: (x, y) => {
      const o = y * stride + x * channels;
      const hex = (v: number): string => v.toString(16).padStart(2, "0");
      return `#${hex(out[o] as number)}${hex(out[o + 1] as number)}${hex(out[o + 2] as number)}`;
    },
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 * The stub engine
 * ════════════════════════════════════════════════════════════════════════════ */

interface StubText {
  kind: "text" | "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
  fill: number;
  destroyed: boolean;
}

/** A texture the loader is pretending to have brought in, plus any frames sliced out of it. */
interface StubTexture {
  width: number;
  height: number;
  frames: Map<string, { x: number; y: number; width: number; height: number }>;
}

/**
 * An `Image`, modelled the way Phaser's really behaves and NOT as a chainable proxy.
 *
 * `width`/`height` are the natural size of the texture (or of the frame, when one is named), and
 * `displayWidth`/`displayHeight` are what `setDisplaySize` left behind. Those four numbers are the
 * entire evidence for "the portrait fits its slot" and "the frame's corners did not stretch", so
 * they are stored rather than swallowed. A method the scene calls that is not defined here throws.
 */
class StubImage {
  readonly kind = "image" as const;
  destroyed = false;
  originX = 0.5;
  originY = 0.5;
  scaleX = 1;
  scaleY = 1;
  constructor(
    readonly x: number,
    readonly y: number,
    readonly key: string,
    readonly frame: string | undefined,
    readonly width: number,
    readonly height: number,
    private readonly owner: StubState,
  ) {}
  get displayWidth(): number {
    return this.width * this.scaleX;
  }
  get displayHeight(): number {
    return this.height * this.scaleY;
  }
  setDisplaySize(width: number, height: number): this {
    this.scaleX = this.width === 0 ? 1 : width / this.width;
    this.scaleY = this.height === 0 ? 1 : height / this.height;
    return this;
  }
  setOrigin(x = 0.5, y?: number): this {
    this.originX = x;
    this.originY = y ?? x;
    return this;
  }
  destroy(): void {
    this.destroyed = true;
    const at = this.owner.objects.indexOf(this);
    if (at >= 0) this.owner.objects.splice(at, 1);
  }
}

type StubObject = StubText | StubImage;

interface StubState {
  key: string;
  objects: StubObject[];
  handlers: Map<string, Array<(e?: { repeat?: boolean }) => void>>;
  addedKeys: Set<string>;
  heldKeys: Set<string>;
  stopped: number;
  /** Texture key → what the loader has. Seeded by {@link seedTexture} before `create()`. */
  textures: Map<string, StubTexture>;
}

/** The 2D context `drawPlaceholder` paints a stand-in through. Records nothing; nothing asserts it. */
function stubContext(): unknown {
  return new Proxy(
    {},
    {
      get: () => (): void => undefined,
      set: () => true,
    },
  );
}

function stubEngine(): { P: unknown; scenes: StubState[] } {
  const scenes: StubState[] = [];

  class StubBase {
    readonly stub: StubState;
    add: {
      rectangle: (x: number, y: number, w: number, h: number, fill: number) => StubText;
      text: (x: number, y: number, value: string, style?: { color?: string }) => StubText;
      image: (x: number, y: number, key: string, frame?: string) => StubImage;
    };
    textures: {
      exists: (key: string) => boolean;
      get: (key: string) => unknown;
      createCanvas: (key: string, w: number, h: number) => unknown;
    };
    input: { keyboard: { on: (e: string, fn: (e?: { repeat?: boolean }) => void) => void; addKey: (k: string) => unknown } };
    scene: { manager: { keys: Record<string, unknown> }; stop: () => void; launch: () => void };

    constructor(config: { key: string }) {
      const state: StubState = {
        key: config.key,
        objects: [],
        handlers: new Map(),
        addedKeys: new Set<string>(),
        heldKeys: new Set<string>(),
        stopped: 0,
        textures: new Map<string, StubTexture>(),
      };
      this.stub = state;
      scenes.push(state);

      const make = (kind: "text" | "rect", x: number, y: number, w: number, h: number, text: string, color: string, fill: number): StubText => {
        const obj: StubText = { kind, x, y, w, h, text, color, fill, destroyed: false };
        const proxy = new Proxy(obj, {
          get(target, prop, receiver): unknown {
            if (prop === "setOrigin") return (): unknown => proxy;
            if (prop === "destroy") {
              return (): void => {
                target.destroyed = true;
                const at = state.objects.indexOf(proxy as unknown as StubText);
                if (at >= 0) state.objects.splice(at, 1);
              };
            }
            if (prop in target) return Reflect.get(target, prop, receiver);
            if (typeof prop === "symbol") return undefined;
            return (): unknown => proxy;
          },
        }) as unknown as StubText;
        state.objects.push(proxy);
        return proxy;
      };

      this.add = {
        rectangle: (x, y, w, h, fill) => make("rect", x, y, w, h, "", "", fill),
        text: (x, y, value, style) => make("text", x, y, 0, 0, value, style?.color ?? "", 0),
        image: (x, y, key, frame) => {
          const texture = state.textures.get(key);
          // Phaser reports the FRAME's cut size when one is named, and the source size otherwise.
          const cut = frame === undefined ? undefined : texture?.frames.get(frame);
          const image = new StubImage(
            x,
            y,
            key,
            frame,
            cut?.width ?? texture?.width ?? 0,
            cut?.height ?? texture?.height ?? 0,
            state,
          );
          state.objects.push(image);
          return image;
        },
      };
      this.textures = {
        exists: (key) => state.textures.has(key),
        get: (key) => {
          const texture = state.textures.get(key);
          if (!texture) return undefined;
          return {
            has: (frame: string): boolean => texture.frames.has(frame),
            add: (frame: string, _source: number, x: number, y: number, w: number, h: number): unknown => {
              texture.frames.set(frame, { x, y, width: w, height: h });
              return {};
            },
            get: (frame?: string): unknown =>
              frame === undefined ? { width: texture.width, height: texture.height } : texture.frames.get(frame),
          };
        },
        // `placeholderTexture` builds a stand-in at exactly the size asked for; recording it here is
        // what lets the stand-in path be measured on the same footing as the real-art path.
        createCanvas: (key, w, h) => {
          state.textures.set(key, { width: w, height: h, frames: new Map() });
          return { getContext: (): unknown => stubContext(), refresh: (): void => undefined };
        },
      };
      this.input = {
        keyboard: {
          on: (event, fn) => {
            const list = state.handlers.get(event) ?? [];
            list.push(fn);
            state.handlers.set(event, list);
          },
          addKey: (key: string) => {
            state.addedKeys.add(key);
            return { isDown: false };
          },
        },
      };
      this.scene = {
        manager: { keys: { [SCENE_KEYS.dialogue]: {} } },
        stop: () => {
          state.stopped += 1;
        },
        launch: () => undefined,
      };
    }
  }

  return { P: { Scene: StubBase }, scenes };
}

/* ── typed views over the recorder ──────────────────────────────────────────── */

const textsOf = (stub: StubState): StubText[] =>
  stub.objects.filter((o): o is StubText => o.kind === "text");
const rectsOf = (stub: StubState): StubText[] =>
  stub.objects.filter((o): o is StubText => o.kind === "rect");
const imagesOf = (stub: StubState): StubImage[] =>
  stub.objects.filter((o): o is StubImage => o.kind === "image");

interface SceneLike {
  init(data: DialogueSceneData): void;
  create(): void;
  update(time: number, delta: number): void;
  runState(): DialogueRunState;
  renderedLines(): string[];
  entryOnScreen(): string;
  cursor(): number;
  portraitOnScreen(): string | null;
}

interface Rig {
  scene: SceneLike;
  stub: StubState;
  done: DialogueRunState[];
  /** One frame at `ms`. The scene arms its advance on frames, and crawls on delta. */
  frame(ms?: number): void;
  /** A keydown. `held` models an OS auto-repeat of a key that is still down. */
  press(key: string, held?: boolean): void;
  /** Every text object currently on the display list, in draw order. */
  drawn(): string[];
  /** Every image currently on the display list, in draw order. */
  images(): StubImage[];
}

const ARM = STYLE.advanceArmFrames;

interface MountOptions {
  /**
   * Texture keys the loader has, and the natural size of each.
   *
   * Defaults to the shipped frame alone, because that is what the RUNNING GAME has: `BootScene`
   * queues every real asset under `assets/final/` and the frame is one of them. A rig that left it
   * out would exercise the fallback the game never takes, which is the "green is evidence of what?"
   * failure this suite has been bitten by before.
   */
  loaded?: Array<{ key: string; width: number; height: number }>;
}

const FRAME_PNG = pngSize(`assets/final/${DIALOGUE_FRAME_ASSET_ID}.png`);

function mount(over: Partial<DialogueSceneData> & { entryId: string }, opts: MountOptions = {}): Rig {
  const { P, scenes } = stubEngine();
  const Scene = createDialogueScene(P as never) as unknown as new () => SceneLike;
  const done: DialogueRunState[] = [];
  const scene = new Scene();
  const data: DialogueSceneData = {
    file: DIALOGUE,
    textSpeed: "instant",
    style: STYLE,
    onDone: (state) => done.push(state),
    ...over,
  };
  scene.init(data);
  const stub = scenes[scenes.length - 1] as StubState;
  const loaded = opts.loaded ?? [
    { key: DIALOGUE_FRAME_ASSET_ID, width: FRAME_PNG.width, height: FRAME_PNG.height },
  ];
  for (const texture of loaded) {
    stub.textures.set(texture.key, { width: texture.width, height: texture.height, frames: new Map() });
  }
  scene.create();
  const rig: Rig = {
    scene,
    stub,
    done,
    frame(ms = 16) {
      scene.update(0, ms);
    },
    press(key, held = false) {
      const code = key.replace(/^keydown-/u, "");
      const wasDown = stub.heldKeys.has(code);
      stub.heldKeys.add(code);
      // Phaser drops an auto-repeat for a key the scene registered with `addKey`.
      if (wasDown && held && stub.addedKeys.has(code)) return;
      for (const fn of stub.handlers.get(key) ?? []) fn(held ? { repeat: true } : {});
    },
    drawn() {
      return textsOf(stub).map((o) => o.text);
    },
    images() {
      return imagesOf(stub);
    },
  };
  return rig;
}

/** Press the advance key once, having waited long enough for the beat to be armed. */
function advance(rig: Rig): void {
  for (let i = 0; i < ARM; i += 1) rig.frame();
  rig.press("keydown-SPACE");
}

/**
 * Press until the run leaves the line it is on — however many pages that line takes.
 *
 * ⚠ ONE PRESS IS NOT ONE LINE, AND NEVER RELIABLY WAS. `wrapDialogue` fills `bodyLines` rows and
 * `onConfirm` turns the page before it advances, so a line long enough to wrap past three rows costs
 * two presses. This helper replaces a loop that pressed exactly once per line — an assumption that
 * held only because no line of `maren.opening` happened to wrap that far at the box's old width.
 * Reserving the portrait slot narrowed the body column from 74 characters to 68 and 43 of the
 * corpus's 512 authored lines now take one more page (559 page-turns to read it all, was 559 − 43);
 * the assumption broke, the assertions it fed did not change, and this is what carries them now.
 * `pageCount` is the same function the scene pages by, so the two cannot disagree.
 */
function advanceLine(rig: Rig): void {
  const from = rig.scene.runState().lineIndex;
  const entry = rig.scene.entryOnScreen();
  for (let guard = 0; guard < 20; guard += 1) {
    advance(rig);
    const state = rig.scene.runState();
    if (state.lineIndex !== from || state.finished || rig.scene.entryOnScreen() !== entry) return;
  }
  throw new Error(`the box would not leave line ${String(from)} of "${entry}"`);
}

const OPENING = DIALOGUE.entries.find((e) => e.id === "maren.opening") as DialogueEntry;

/* ════════════════════════════════════════════════════════════════════════════
 * §1 Layout at build-doc §7.6's 480×320
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 the box fits the virtual screen", () => {
  it("takes its size from balance.map, never from a literal", () => {
    expect(STYLE.width).toBe(balance.map.virtualWidth);
    expect(STYLE.height).toBe(balance.map.virtualHeight);
  });

  it("sits inside the screen with room for a name plate and its body lines", () => {
    const rect = dialogueBoxRect(STYLE);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(STYLE.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(STYLE.height);
    expect(dialogueColumns(STYLE)).toBeGreaterThan(20);
  });

  it("wraps at the column budget and never runs off the right edge", () => {
    const columns = dialogueColumns(STYLE);
    for (const entry of DIALOGUE.entries) {
      for (const line of entry.lines) {
        for (const row of wrapDialogue(line.text, columns)) {
          expect(row.length, `${entry.id}: "${row}"`).toBeLessThanOrEqual(columns);
        }
      }
    }
  });

  it("wrapping loses no word, and a word longer than the line is broken rather than dropped", () => {
    const rows = wrapDialogue("alpha beta gamma delta", 11);
    expect(rows.join(" ").split(/\s+/u)).toEqual(["alpha", "beta", "gamma", "delta"]);
    expect(wrapDialogue("abcdefghijkl", 5)).toEqual(["abcde", "fghij", "kl"]);
  });

  it("a long body PAGES rather than overflowing the box", () => {
    const columns = dialogueColumns(STYLE);
    // The corpus caps a body at 400 characters on the stated grounds that it must fit this box.
    const longest = DIALOGUE.entries.flatMap((e) => e.lines).reduce((a, b) => (a.text.length >= b.text.length ? a : b));
    const rows = wrapDialogue(longest.text, columns);
    const pages = pageCount(rows, STYLE.bodyLines);
    expect(pages).toBeGreaterThanOrEqual(1);
    // Every page holds at most `bodyLines` rows, and the pages cover the whole line.
    const rebuilt: string[] = [];
    for (let p = 0; p < pages; p += 1) {
      const page = pageOf(rows, p, STYLE.bodyLines);
      expect(page.length).toBeLessThanOrEqual(STYLE.bodyLines);
      rebuilt.push(...page);
    }
    expect(rebuilt).toEqual(rows);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 The line reaches the screen
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 rendered text", () => {
  it("draws the FIRST authored line of the entry, verbatim, on create", () => {
    const rig = mount({ entryId: OPENING.id });
    const drawn = rig.drawn().join(" ");
    const first = OPENING.lines[0]!.text;
    // Wrapped for the box, so the rows are compared after re-joining them.
    for (const word of first.split(/\s+/u).slice(0, 8)) expect(drawn).toContain(word);
    expect(rig.drawn().join(" ").replace(/\s+/gu, " ")).toContain(
      wrapDialogue(first, dialogueColumns(STYLE)).join(" "),
    );
  });

  it("puts the SPEAKER's own name on the plate — not the id, not an invention", () => {
    const rig = mount({ entryId: OPENING.id });
    const speaker = DIALOGUE.speakers.find((s) => s.id === OPENING.speaker);
    expect(speaker).toBeDefined();
    expect(rig.drawn()[0]).toBe(speaker!.name);
  });

  it("draws the box behind the words — a painted frame and a field", () => {
    /*
     * JUSTIFIED EDIT. This used to read `rects[0].x === rect.x && rects[0].w === rect.width` — the
     * BORDER rectangle, which is no longer what the box's edge is made of. The frame is now the
     * shipped `ui-frame` asset, sliced (see §7), and the first rectangle is the dark field inside
     * it. The claim the assertion existed to make — "there is an edge at the box's bounds and a
     * field behind the words" — is asserted here in full and more precisely: the ring is checked
     * corner by corner in §7, and the field is checked to be the box's own swatch, which the old
     * assertion never looked at. Nothing was loosened; `rects[0].w` is now smaller because the
     * field sits INSIDE the frame, which is the point.
     */
    const rig = mount({ entryId: OPENING.id });
    const rect = dialogueBoxRect(STYLE);
    const ring = rig.images().filter((i) => i.key === DIALOGUE_FRAME_ASSET_ID);
    expect(ring.length, "the box drew no painted frame").toBe(8);
    const field = rectsOf(rig.stub);
    expect(field.length).toBeGreaterThanOrEqual(1);
    expect(field[0]?.fill).toBe(STYLE.boxColor);
    expect(field[0]?.x).toBe(rect.x + STYLE.frameSlice);
    expect(field[0]?.w).toBe(rect.width - STYLE.frameSlice * 2);
  });

  it("advances through every authored line, in order, and every line is seen", () => {
    // Renamed from "advances one authored line per press": a press turns a PAGE when the line has
    // one, and 43 of the corpus's lines do at the box's portrait-width column. The assertion below
    // is unchanged — `advanceLine` is what makes it true of the product rather than of one entry.
    const rig = mount({ entryId: OPENING.id });
    const seen: string[] = [];
    for (let i = 0; i < OPENING.lines.length; i += 1) {
      seen.push(rig.scene.renderedLines().slice(1).join(" "));
      if (i < OPENING.lines.length - 1) advanceLine(rig);
    }
    for (const [i, line] of OPENING.lines.entries()) {
      const wrapped = wrapDialogue(line.text, dialogueColumns(STYLE)).join(" ");
      expect(seen[i], `line ${String(i)}`).toContain(wrapped.slice(0, 40));
    }
  });

  it("a line with a second page hands over its whole body, page by page", () => {
    // The other half of the rename above, asserted rather than assumed: paging is not a detail of
    // the rig, it is the mechanism that keeps a long line readable in a box the portrait narrowed.
    const columns = dialogueColumns(STYLE);
    const index = OPENING.lines.findIndex(
      (l) => pageCount(wrapDialogue(l.text, columns), STYLE.bodyLines) > 1,
    );
    expect(index, "no line of the opening pages — this test is exercising nothing").toBeGreaterThanOrEqual(0);
    const rig = mount({ entryId: OPENING.id });
    for (let i = 0; i < index; i += 1) advanceLine(rig);
    const rows = wrapDialogue(OPENING.lines[index]!.text, columns);
    const pages = pageCount(rows, STYLE.bodyLines);
    const gathered: string[] = [];
    for (let p = 0; p < pages; p += 1) {
      gathered.push(...rig.scene.renderedLines().slice(1));
      if (p < pages - 1) {
        advance(rig);
        expect(rig.scene.runState().lineIndex, "the press advanced the line instead of the page").toBe(index);
      }
    }
    expect(gathered.filter((r) => r.length > 0)).toEqual(rows);
  });

  it("redraws: the previous line's objects are destroyed, not stacked", () => {
    const rig = mount({ entryId: OPENING.id });
    const before = rig.drawn().join("\n");
    advanceLine(rig);
    const after = rig.drawn().join("\n");
    expect(after).not.toBe(before);
    expect(rig.stub.objects.every((o) => !o.destroyed)).toBe(true);
    expect(rectsOf(rig.stub).length).toBeLessThanOrEqual(4);
    // The frame and the portrait are redrawn too, never accumulated: eight ring pieces and at most
    // one face, however many lines have gone by.
    expect(rig.images().filter((i) => i.key === DIALOGUE_FRAME_ASSET_ID)).toHaveLength(8);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 The text-speed setting (bible §12 "Plumbing: … text-speed")
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 the crawl honours the setting", () => {
  it("instant prints the whole line with no frames elapsed", () => {
    const rig = mount({ entryId: OPENING.id, textSpeed: "instant" });
    expect(TEXT_SPEED_CPS.instant).toBe(0);
    const rows = wrapDialogue(OPENING.lines[0]!.text, dialogueColumns(STYLE));
    expect(rig.scene.renderedLines().slice(1).join("")).toBe(rows.join(""));
  });

  it("slow shows only part of the line at first, and fills in as frames pass", () => {
    const rig = mount({ entryId: OPENING.id, textSpeed: "slow" });
    const rows = wrapDialogue(OPENING.lines[0]!.text, dialogueColumns(STYLE));
    const full = crawlLength(pageOf(rows, 0, STYLE.bodyLines));
    expect(rig.scene.renderedLines().slice(1).join("").length).toBe(0);

    // One second at the slow rate arrives at exactly that many characters.
    rig.frame(1000);
    const after = rig.scene.renderedLines().slice(1).join("").length;
    expect(after).toBe(Math.min(full, TEXT_SPEED_CPS.slow));
    expect(after).toBeLessThan(full);

    // …and enough seconds finish it.
    for (let i = 0; i < 40; i += 1) rig.frame(1000);
    expect(rig.scene.renderedLines().slice(1).join("")).toBe(pageOf(rows, 0, STYLE.bodyLines).join(""));
  });

  it("fast is faster than slow, measured on the same line and the same elapsed time", () => {
    const shown = (speed: "slow" | "fast"): number => {
      const rig = mount({ entryId: OPENING.id, textSpeed: speed });
      rig.frame(500);
      return rig.scene.renderedLines().slice(1).join("").length;
    };
    expect(TEXT_SPEED_CPS.fast).toBeGreaterThan(TEXT_SPEED_CPS.slow);
    expect(shown("fast")).toBeGreaterThan(shown("slow"));
  });

  it("the first press COMPLETES the crawl and the second advances — Gold's rule", () => {
    const rig = mount({ entryId: OPENING.id, textSpeed: "slow" });
    const rows = wrapDialogue(OPENING.lines[0]!.text, dialogueColumns(STYLE));
    rig.frame(100);
    expect(rig.scene.renderedLines().slice(1).join("")).not.toBe(rows.join(""));

    advance(rig);
    expect(rig.scene.renderedLines().slice(1).join("")).toBe(pageOf(rows, 0, STYLE.bodyLines).join(""));
    expect(rig.scene.runState().lineIndex).toBe(0);

    advance(rig);
    expect(rig.scene.runState().lineIndex).toBe(1);
  });

  it("crawl() is a pure function of the rows and the characters shown", () => {
    expect(crawl(["abc", "de"], 0)).toEqual(["", ""]);
    expect(crawl(["abc", "de"], 2)).toEqual(["ab", ""]);
    expect(crawl(["abc", "de"], 4)).toEqual(["abc", "d"]);
    expect(crawl(["abc", "de"], 99)).toEqual(["abc", "de"]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4 Choices
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 the choice list", () => {
  /**
   * Drive the box to the point where the choice list is up.
   *
   * Was `for (i < lines.length - 1) advance(rig)` — one press per line, which stopped landing on the
   * choices the moment a line of the opening needed two pages. Driven by what is ON SCREEN instead
   * of by a press count, so it cannot quietly stop short again; every assertion below is unchanged.
   */
  function toChoices(): Rig {
    const rig = mount({ entryId: OPENING.id });
    for (let i = 0; i < OPENING.lines.length - 1; i += 1) advanceLine(rig);
    expect(
      rig.drawn().some((row) => row.startsWith(STYLE.choiceCursor)),
      "the box never reached the choice list",
    ).toBe(true);
    return rig;
  }

  it("draws every authored option, verbatim, with a cursor on one of them", () => {
    const rig = toChoices();
    const drawn = rig.drawn();
    for (const choice of OPENING.choices ?? []) {
      expect(drawn.some((row) => row.includes(choice.text)), choice.text).toBe(true);
    }
    expect(drawn.filter((row) => row.startsWith(STYLE.choiceCursor))).toHaveLength(1);
  });

  it("the cursor moves with UP/DOWN and wraps", () => {
    const rig = toChoices();
    const n = (OPENING.choices ?? []).length;
    expect(n).toBe(3);
    expect(rig.scene.cursor()).toBe(0);
    rig.press("keydown-DOWN");
    expect(rig.scene.cursor()).toBe(1);
    rig.press("keydown-UP");
    rig.press("keydown-UP");
    expect(rig.scene.cursor()).toBe(n - 1);
  });

  it("the advance key will not step past a choice — it takes it", () => {
    const rig = toChoices();
    const at = rig.scene.entryOnScreen();
    expect(at).toBe(OPENING.id);
    rig.press("keydown-DOWN");
    advance(rig);
    // The branch the cursor was on is the one that played.
    const chosen = (OPENING.choices ?? [])[1];
    expect(chosen?.goto).toBeDefined();
    expect(rig.scene.runState().visited).toContain(chosen!.goto);
  });

  it("THE OPENING BEAT, PLAYED: pressing through it writes story.opening.done", () => {
    /*
     * The flag that had no writer in `game/` at all — `balance.acts.gates` opens act 1 on it and
     * `OverworldScene` stood in for it. Here it is written by a player pressing keys at a box.
     */
    const rig = mount({ entryId: OPENING.id });
    for (let guard = 0; guard < 200 && rig.done.length === 0; guard += 1) advance(rig);
    expect(rig.done, "the run never finished").toHaveLength(1);
    const state = rig.done[0]!;
    expect(state.problem).toBeNull();
    expect(state.flags["story.opening.done"]).toBe(true);
    expect(typeof state.flags["story.starter"]).toBe("string");
    expect(state.flags["quest.first-signs.offered"]).toBe(true);
    // The scene takes itself off the screen exactly once.
    expect(rig.stub.stopped).toBe(1);
  });

  it("every choice branch is reachable from the box, not just the first", () => {
    for (const [index, choice] of (OPENING.choices ?? []).entries()) {
      const rig = mount({ entryId: OPENING.id });
      for (let i = 0; i < OPENING.lines.length - 1; i += 1) advanceLine(rig);
      for (let i = 0; i < index; i += 1) rig.press("keydown-DOWN");
      for (let guard = 0; guard < 200 && rig.done.length === 0; guard += 1) advance(rig);
      expect(rig.done[0]?.visited, choice.text).toContain(choice.goto);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4b A LINE THAT BOTH PAGES AND OFFERS CHOICES
 *
 * §2's paging test and §4's choice tests each hold on their own and BOTH passed while the box was
 * broken, because each drove a line the other condition did not apply to: the paging test drives a
 * long line of the opening, which carries no choices, and the choice tests drive a last line short
 * enough to fit one page. `onConfirm` tested for a pending choice BEFORE it tested for another
 * page and returned, so where the two conditions MEET the confirm key took an option instead of
 * turning the page and the tail of the line was never drawn.
 *
 * The two are not independent in the corpus. The choice panel comes up on an entry's LAST line,
 * which is the line most likely to be long, so "wraps past `bodyLines`" and "offers choices"
 * coincide by construction. These tests bind the order: PAGE FIRST, THEN CHOOSE.
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * `renderedLines()` gives `[plate, ...body, ...options]`; this splits it back apart.
 *
 * By counting from the END, off the entry's own option count — the body is what varies (a last page
 * holds fewer rows than `bodyLines`), the option list does not. Slicing from the front by
 * `bodyLines` would silently mis-split exactly the page this section is about.
 */
function screenOf(rig: Rig, optionCount: number): { body: string[]; options: string[] } {
  const lines = rig.scene.renderedLines();
  const cut = lines.length - optionCount;
  return { body: lines.slice(1, cut), options: lines.slice(cut) };
}

/** How much of an authored option survives the choice panel's truncation, at this style's width. */
function optionPrefix(text: string): string {
  // `- 2` is the cursor glyph and the space after it, which the panel prepends to every row.
  return text.slice(0, dialogueChoiceColumns(STYLE) - 2);
}

/**
 * Assert the choice panel is intact on the page currently drawn: every authored option present, in
 * order, with the cursor on exactly one of them. The panel is not suspended while a line pages —
 * a player reading page two is still looking at what they are choosing between.
 */
function expectPanelIntact(rig: Rig, options: readonly { text: string }[], where: string): void {
  const shown = screenOf(rig, options.length).options;
  expect(shown, `${where}: the choice panel lost rows`).toHaveLength(options.length);
  for (const [i, choice] of options.entries()) {
    expect(shown[i], `${where}: option "${choice.text}"`).toContain(optionPrefix(choice.text));
  }
  expect(
    shown.filter((row) => row.startsWith(STYLE.choiceCursor)),
    `${where}: exactly one option carries the cursor`,
  ).toHaveLength(1);
}

/** The wager, from the shipped corpus — the one entry in it where the two conditions meet today. */
const WAGER = DIALOGUE.entries.find((e) => e.id === "sel.quest.wager.offer") as DialogueEntry;

describe("§4b paging and choices on the same line", () => {
  it("THE SHIPPED ENTRY: the wager's last line is read to its end before an option can be taken", () => {
    /*
     * Driven off `data/dialogue.json` itself, not a fixture, because the thing that shipped broken
     * was this entry: `sel.quest.wager.offer` wraps its last line past `bodyLines` at the box's
     * column budget, and the row the player could not reach is the one naming what the ferryhand
     * is staking. A fixture would prove the control flow; only the corpus proves the beat.
     */
    const columns = dialogueColumns(STYLE);
    const options = WAGER.choices ?? [];
    const last = WAGER.lines[WAGER.lines.length - 1];
    expect(last, "sel.quest.wager.offer has no lines").toBeDefined();
    const rows = wrapDialogue(last!.text, columns);
    const pages = pageCount(rows, STYLE.bodyLines);

    // Non-vacuity, both halves of it. If the corpus is later reworded so this entry's last line
    // fits one page, or so it stops offering choices, this test stops exercising the defect — and
    // it must say so out loud rather than keep passing.
    expect(
      options.length,
      "sel.quest.wager.offer no longer offers choices — this test no longer exercises the page/choice collision",
    ).toBeGreaterThan(0);
    expect(
      pages,
      "sel.quest.wager.offer's last line no longer wraps past bodyLines — this test no longer exercises paging",
    ).toBeGreaterThan(1);

    const rig = mount({ entryId: WAGER.id });
    for (let i = 0; i < WAGER.lines.length - 1; i += 1) advanceLine(rig);
    expect(rig.scene.runState().lineIndex, "the box never reached the wager's last line").toBe(
      WAGER.lines.length - 1,
    );

    const seen: string[] = [];
    for (let p = 0; p < pages; p += 1) {
      seen.push(...screenOf(rig, options.length).body);
      expectPanelIntact(rig, options, `page ${String(p + 1)} of the wager`);
      if (p < pages - 1) {
        const hidden = rows.filter((row) => !seen.includes(row));
        advance(rig);
        expect(
          rig.scene.entryOnScreen(),
          `the confirm key took an option instead of turning the page, so the player never reads: ${hidden
            .map((row) => `"${row}"`)
            .join(" / ")}`,
        ).toBe(WAGER.id);
        expect(rig.scene.runState().choicesTaken, "a choice was taken mid-line").toHaveLength(0);
      }
    }

    const missed = rows.filter((row) => !seen.includes(row));
    expect(
      missed,
      `wrapped rows of the wager that never reached the screen: ${missed.map((row) => `"${row}"`).join(" / ")}`,
    ).toEqual([]);
    expect(seen.filter((row) => row.length > 0)).toEqual(rows);

    // And on the LAST page the key does what it always did: it takes the option under the cursor.
    advance(rig);
    expect(rig.scene.runState().choicesTaken.map((c) => c.index)).toEqual([0]);
  });

  it("THE GENERAL RULE: any entry that wraps past bodyLines and offers choices pages first", () => {
    /*
     * The control for the test above, so this section outlives the wording of one corpus entry.
     * The line is BUILT from the box's own column budget and `bodyLines` (G11 — nothing here is a
     * literal), so it wraps past one page at whatever width the box has, and it is filler tokens
     * rather than prose because no authored line belongs anywhere but `data/dialogue.json` (G2).
     */
    const columns = dialogueColumns(STYLE);
    const tokens: string[] = [];
    let text = "";
    while (wrapDialogue(text, columns).length <= STYLE.bodyLines) {
      tokens.push(`row${String(tokens.length).padStart(2, "0")}`);
      text = tokens.join(" ");
    }

    const choices = [{ text: "the first option" }, { text: "the second option" }];
    const entry: DialogueEntry = {
      id: "control.pages-and-chooses",
      speaker: "control",
      node: "control",
      kind: "ambient",
      lines: [{ text }],
      choices,
    };
    const file: DialogueFile = { speakers: [], entries: [entry] };

    const rows = wrapDialogue(text, columns);
    const pages = pageCount(rows, STYLE.bodyLines);
    expect(pages, "the constructed line does not page — this test exercises nothing").toBeGreaterThan(1);

    const rig = mount({ entryId: entry.id, file });

    // (a) every wrapped row is displayed, and (c) the panel is intact on every page.
    const seen: string[] = [];
    for (let p = 0; p < pages; p += 1) {
      seen.push(...screenOf(rig, choices.length).body);
      expectPanelIntact(rig, choices, `page ${String(p + 1)} of the control entry`);
      if (p < pages - 1) {
        const hidden = rows.filter((row) => !seen.includes(row));
        advance(rig);
        // (b) the choice is NOT taken while rows are still unread.
        expect(
          rig.scene.runState().choicesTaken,
          `an option was taken on page ${String(p + 1)} of ${String(pages)}, leaving unread: ${hidden.join(" / ")}`,
        ).toHaveLength(0);
        expect(rig.done, "the box closed before the line had been read out").toHaveLength(0);
      }
    }
    expect(seen.filter((row) => row.length > 0)).toEqual(rows);

    // (b), the other half: on the last page the option under the cursor IS taken.
    rig.press("keydown-DOWN");
    expect(rig.scene.cursor()).toBe(1);
    advance(rig);
    expect(rig.done, "the option on the last page was not taken").toHaveLength(1);
    expect(rig.done[0]!.choicesTaken.map((c) => c.index)).toEqual([1]);
    expect(rig.done[0]!.choicesTaken[0]!.text).toBe(choices[1]!.text);
  });

  it("no entry in the corpus can hide a row: every choice entry's last line is fully readable", () => {
    /*
     * The blast radius of the same control flow, swept over the whole corpus rather than the one
     * entry that hits it today. Every entry that offers choices is driven at its last line and the
     * rows it renders are compared against the rows it wraps to.
     */
    const columns = dialogueColumns(STYLE);
    const withChoices = DIALOGUE.entries.filter((e) => (e.choices ?? []).length > 0);
    expect(withChoices.length, "the corpus has no entries with choices").toBeGreaterThan(0);

    let paging = 0;
    for (const entry of withChoices) {
      const options = entry.choices ?? [];
      const last = entry.lines[entry.lines.length - 1]!;
      const rows = wrapDialogue(last.text, columns);
      const pages = pageCount(rows, STYLE.bodyLines);
      if (pages > 1) paging += 1;

      const rig = mount({ entryId: entry.id });
      for (let i = 0; i < entry.lines.length - 1; i += 1) advanceLine(rig);
      const seen: string[] = [];
      for (let p = 0; p < pages; p += 1) {
        seen.push(...screenOf(rig, options.length).body);
        if (p < pages - 1) advance(rig);
      }
      const missed = rows.filter((row) => !seen.includes(row));
      expect(missed, `"${entry.id}" hides: ${missed.map((row) => `"${row}"`).join(" / ")}`).toEqual([]);
    }

    // Non-vacuity: at least one of them actually pages, or the sweep above proved nothing.
    expect(paging, "no entry with choices wraps past bodyLines — the sweep exercises no paging").toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §5 Input hygiene — a held key must not walk the whole chain
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§5 input", () => {
  it("registers its keys, so Phaser suppresses OS auto-repeat for them", () => {
    const rig = mount({ entryId: OPENING.id });
    for (const key of ["SPACE", "ENTER", "UP", "DOWN"]) expect(rig.stub.addedKeys.has(key)).toBe(true);
  });

  it("a press before the beat is armed advances nothing", () => {
    const rig = mount({ entryId: OPENING.id });
    rig.press("keydown-SPACE");
    expect(rig.scene.runState().lineIndex).toBe(0);
    for (let i = 0; i < ARM; i += 1) rig.frame();
    rig.press("keydown-SPACE");
    expect(rig.scene.runState().lineIndex).toBe(1);
  });

  it("an auto-repeat of a held key advances nothing", () => {
    const rig = mount({ entryId: OPENING.id });
    for (let i = 0; i < ARM; i += 1) rig.frame();
    rig.press("keydown-SPACE");
    expect(rig.scene.runState().lineIndex).toBe(1);
    for (let i = 0; i < ARM * 4; i += 1) {
      rig.frame();
      rig.press("keydown-SPACE", true);
    }
    expect(rig.scene.runState().lineIndex).toBe(1);
  });

  it("ENTER does what SPACE does", () => {
    const rig = mount({ entryId: OPENING.id });
    for (let i = 0; i < ARM; i += 1) rig.frame();
    rig.press("keydown-ENTER");
    expect(rig.scene.runState().lineIndex).toBe(1);
  });

  it("answers to the registry's key, not a private spelling", () => {
    expect(DIALOGUE_SCENE_KEY).toBe(SCENE_KEYS.dialogue);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §7 The speaker's face
 *
 * `DialogueSpeaker.portrait` was authored on all 63 speakers and read by nothing until the box
 * reserved a slot for it. Everything below drives the REAL scene and asserts on what `add.image`
 * actually received — never on the scene's own account of what it meant to draw.
 * ════════════════════════════════════════════════════════════════════════════ */

const SLOT = dialoguePortraitRect(STYLE);

function speakerOf(entry: DialogueEntry): DialogueSpeaker {
  const line = entry.lines[0];
  const id = line?.speaker ?? entry.speaker;
  const speaker = DIALOGUE.speakers.find((s) => s.id === id);
  if (!speaker) throw new Error(`data/dialogue.json has no speaker "${id}"`);
  return speaker;
}

/** The first entry whose opening line is spoken by a speaker matching `want`. */
function entryVoicedBy(want: (s: DialogueSpeaker) => boolean, why: string): DialogueEntry {
  const entry = DIALOGUE.entries.find((e) => {
    try {
      return want(speakerOf(e));
    } catch {
      return false;
    }
  });
  if (!entry) throw new Error(`no entry in data/dialogue.json is ${why}`);
  return entry;
}

/** The bounds an image actually covers, from its recorded position, origin and display size. */
function boundsOf(image: StubImage): { left: number; top: number; right: number; bottom: number } {
  return {
    left: image.x - image.displayWidth * image.originX,
    top: image.y - image.displayHeight * image.originY,
    right: image.x + image.displayWidth * (1 - image.originX),
    bottom: image.y + image.displayHeight * (1 - image.originY),
  };
}

describe("§7 the portrait slot", () => {
  it("every speaker in the corpus carries a portrait, and every portrait but one names a manifest row", () => {
    expect(DIALOGUE.speakers.length).toBe(63);
    for (const speaker of DIALOGUE.speakers) {
      expect(typeof speaker.portrait, speaker.id).toBe("string");
      expect(speaker.portrait.trim().length, speaker.id).toBeGreaterThan(0);
    }
    // G2: the box may not name art the manifest does not carry. The ONE exception is the corpus's
    // faceless voice — see the `speakerHasFace` block in the scene — and it is named here so a
    // SECOND unbacked portrait cannot appear without this reddening.
    const unbacked = [...new Set(DIALOGUE.speakers.map((s) => s.portrait))].filter(
      (portrait) => !ROW_BY_ID.has(portrait),
    );
    expect(unbacked).toEqual(["narration"]);
    for (const speaker of DIALOGUE.speakers) {
      if (ROW_BY_ID.has(speaker.portrait)) continue;
      expect(speakerHasFace(speaker), `${speaker.id} asks for art no manifest row can produce`).toBe(false);
    }
  });

  it("resolves a portrait id to the texture key the pipeline writes, and to itself when unbuilt", () => {
    /*
     * The BattleHud defect, in the one place it had not been checked: a portrait id is a manifest
     * ROW id (`npc-bram`) and the key the loader registers is the row's `finalFile` minus
     * `assets/final/` (`npc-static/npc-bram`). Spelling one and loading the other is how 162 invented
     * keys once met 150 manifest ids with an intersection of zero.
     */
    let built = 0;
    for (const speaker of DIALOGUE.speakers) {
      const row = ROW_BY_ID.get(speaker.portrait);
      const resolved = portraitAssetId(speaker.portrait);
      if (row && hasRealAsset(keyOf(speaker.portrait))) {
        built += 1;
        expect(resolved, speaker.id).toBe(keyOf(speaker.portrait));
      } else {
        // Unbuilt: the stand-in is named for the row the art lane still owes, not for a guess.
        expect(resolved, speaker.id).toBe(speaker.portrait);
      }
    }
    expect(built, "no portrait in the corpus resolved to shipped art — the rig proves nothing").toBeGreaterThan(0);
  });

  it("no two real assets share a file name, so the census lookup is unambiguous", () => {
    // `portraitAssetId` matches on the last path segment. That is only sound while file names are
    // unique across `assets/final/`; if they ever are not, this says so instead of the box quietly
    // drawing the wrong face.
    const seen = new Map<string, string>();
    for (const id of realAssetIds()) {
      const at = id.lastIndexOf("/");
      const name = at >= 0 ? id.slice(at + 1) : id;
      const first = seen.get(name);
      expect(first, `"${name}" is both ${String(first)} and ${id}`).toBeUndefined();
      seen.set(name, id);
    }
  });

  it("THE PORTRAIT REACHES A DRAW CALL: shipped npc art is drawn in the slot", () => {
    const entry = entryVoicedBy(
      (s) => ROW_BY_ID.get(s.portrait)?.class === "npc-static" && hasRealAsset(keyOf(s.portrait)),
      "voiced by a speaker whose npc-static portrait has shipped",
    );
    const speaker = speakerOf(entry);
    const key = portraitAssetId(speaker.portrait);
    const png = pngSize(`assets/final/${key}.png`);

    const rig = mount(
      { entryId: entry.id },
      {
        loaded: [
          { key: DIALOGUE_FRAME_ASSET_ID, width: FRAME_PNG.width, height: FRAME_PNG.height },
          { key, width: png.width, height: png.height },
        ],
      },
    );

    expect(rig.scene.portraitOnScreen()).toBe(key);
    const drawn = rig.images().find((i) => i.key === key);
    expect(
      drawn,
      `the box drew ${rig.images().map((i) => i.key).join(", ") || "no image"} — not the ` +
        `portrait "${key}", so nothing here is exercising the real-art path`,
    ).toBeDefined();
    if (!drawn) return;
    const bounds = boundsOf(drawn);
    expect(bounds.left).toBeGreaterThanOrEqual(SLOT.x);
    expect(bounds.top).toBeGreaterThanOrEqual(SLOT.y);
    expect(bounds.right).toBeLessThanOrEqual(SLOT.x + SLOT.width);
    expect(bounds.bottom).toBeLessThanOrEqual(SLOT.y + SLOT.height);
  });

  it("THE DRAWN SIZE FITS THE SLOT — including the 96² trainer plate that has not landed yet", () => {
    /*
     * The assertion that is vacuous if it is made on the wrong row. `npc-static` generates at 32×48,
     * which is exactly this slot, so it is drawn at scale 1 whether or not anything fits it —
     * green with the fit and green without. `trainer-battle` generates at 96×96 (read from
     * `tools/comfy/manifest.json`, never written here), and the eight gym leaders speak through this
     * box: the day that class runs, a portrait three canvas widths wide covers the words unless
     * `placeholderImage` fits it. That is the `dex-painted` defect, in the widget the game spends
     * most of its time in, and this is the test that reddens when the fit is removed.
     */
    const entry = entryVoicedBy(
      (s) => ROW_BY_ID.get(s.portrait)?.class === "trainer-battle",
      "voiced by a gym-leader-class speaker",
    );
    const speaker = speakerOf(entry);
    const key = portraitAssetId(speaker.portrait);
    const plate = generatedSize(speaker.portrait);
    expect(plate.width, "the trainer class no longer generates oversize — pick another row").toBeGreaterThan(SLOT.width);

    const rig = mount(
      { entryId: entry.id },
      {
        loaded: [
          { key: DIALOGUE_FRAME_ASSET_ID, width: FRAME_PNG.width, height: FRAME_PNG.height },
          { key, width: plate.width, height: plate.height },
        ],
      },
    );

    const drawn = rig.images().find((i) => i.key === key);
    expect(drawn, `the box did not draw "${key}" at all`).toBeDefined();
    if (!drawn) return;
    expect([drawn.width, drawn.height], "the rig did not hand the box the oversize plate").toEqual([
      plate.width,
      plate.height,
    ]);
    expect(
      drawn.displayWidth,
      `the portrait is drawn ${String(drawn.displayWidth)}px wide in a ${String(SLOT.width)}px slot`,
    ).toBeLessThanOrEqual(SLOT.width);
    expect(
      drawn.displayHeight,
      `the portrait is drawn ${String(drawn.displayHeight)}px tall in a ${String(SLOT.height)}px slot`,
    ).toBeLessThanOrEqual(SLOT.height);
    expect(drawn.displayWidth, "the portrait is scaled away to nothing").toBeGreaterThan(0);
    // Aspect preserved — "fits" is also satisfied by squashing, which is the stretch the helper forbids.
    expect(Math.abs(drawn.displayWidth / drawn.displayHeight - plate.width / plate.height)).toBeLessThan(0.001);
  });

  it("a portrait with no texture draws the labelled stand-in, and never blanks the box", () => {
    // Nothing seeded but the frame: every portrait in the corpus is unbuilt as far as this rig is
    // concerned, which is the state most of them are actually in on disk.
    const entry = entryVoicedBy((s) => speakerHasFace(s), "voiced by a speaker with a face");
    const speaker = speakerOf(entry);
    const key = portraitAssetId(speaker.portrait);

    const rig = mount({ entryId: entry.id });
    const drawn = rig.images().find((i) => i.key !== DIALOGUE_FRAME_ASSET_ID);
    expect(drawn, "no stand-in was drawn for an unbuilt portrait").toBeDefined();
    if (!drawn) return;
    // `placeholderKey` names the asset it stands in for, so a reviewer can say WHICH is missing.
    expect(drawn.key).toContain(key);
    // Generated at the slot size, so it fills it exactly and the fit is a no-op.
    expect([drawn.displayWidth, drawn.displayHeight]).toEqual([SLOT.width, SLOT.height]);
    // …and the words are still on the screen, which is the half a crash would take with it.
    expect(rig.drawn().join(" ")).toContain(
      wrapDialogue(entry.lines[0]!.text, dialogueColumns(STYLE))[0]!,
    );
  });

  it("the words never run under the face — the body starts clear of the slot", () => {
    const entry = entryVoicedBy((s) => speakerHasFace(s), "voiced by a speaker with a face");
    const rig = mount({ entryId: entry.id });
    const rect = dialogueBoxRect(STYLE);

    expect(dialogueTextLeft(STYLE)).toBeGreaterThanOrEqual(SLOT.x + SLOT.width);
    expect(SLOT.x).toBeGreaterThanOrEqual(rect.x);
    expect(SLOT.y + SLOT.height).toBeLessThanOrEqual(rect.y + rect.height);

    const inBox = textsOf(rig.stub).filter((t) => t.y >= rect.y && t.y <= rect.y + rect.height);
    expect(inBox.length, "no text was drawn inside the box").toBeGreaterThan(0);
    for (const row of inBox) {
      expect(row.x, `"${row.text}" starts at ${String(row.x)}, inside the portrait slot`).toBeGreaterThanOrEqual(
        SLOT.x + SLOT.width,
      );
    }
    // And the widest row the corpus can produce still ends inside the box.
    const columns = dialogueColumns(STYLE);
    expect(dialogueTextLeft(STYLE) + columns * STYLE.charWidth).toBeLessThanOrEqual(
      rect.x + rect.width - STYLE.pad,
    );
    for (const e of DIALOGUE.entries) {
      for (const line of e.lines) {
        for (const wrapped of wrapDialogue(line.text, columns)) {
          expect(wrapped.length, `${e.id}: "${wrapped}"`).toBeLessThanOrEqual(columns);
        }
      }
    }
  });

  it("the corpus's faceless voice draws no face, and the slot stays reserved anyway", () => {
    // `: boolean` on purpose — `speakerHasFace` is a type guard, so an unannotated `!` predicate
    // picks `filter`'s narrowing overload and hands back `never[]`, which types clean and asserts
    // nothing about the ids it was supposed to be checking.
    const faceless = DIALOGUE.speakers.filter((s): boolean => !speakerHasFace(s));
    expect(faceless.map((s) => s.id)).toEqual(["narration"]);

    const entry = entryVoicedBy((s) => !speakerHasFace(s), "voiced by the faceless narration voice");
    const rig = mount({ entryId: entry.id });
    expect(rig.scene.portraitOnScreen()).toBeNull();
    expect(
      rig.images().filter((i) => i.key !== DIALOGUE_FRAME_ASSET_ID),
      "a hatched stand-in was drawn for a voice no manifest row backs",
    ).toHaveLength(0);

    // The geometry does not move between a line spoken by a person and one spoken by nobody: the
    // body column must not reflow mid-chain. Compared against a FACED speaker's box rather than
    // against `dialogueTextLeft` alone, because the claim is that the two boxes agree — which is
    // what a reader would notice if it stopped being true.
    const faced = mount({ entryId: entryVoicedBy((s) => speakerHasFace(s), "voiced by a speaker with a face").id });
    const rect = dialogueBoxRect(STYLE);
    const columnOf = (r: Rig): number[] =>
      textsOf(r.stub)
        .filter((t) => t.y >= rect.y && t.y <= rect.y + rect.height)
        .map((t) => t.x)
        .sort((a, b) => a - b);
    const facelessColumn = columnOf(rig);
    expect(facelessColumn.length, "no text was drawn inside the box").toBeGreaterThan(0);
    expect(facelessColumn[0]).toBe(dialogueTextLeft(STYLE));
    for (const x of facelessColumn) expect(x).toBeGreaterThanOrEqual(dialogueTextLeft(STYLE));
    expect(new Set(facelessColumn)).toEqual(new Set(columnOf(faced)));
  });

  it("the slot takes its size from balance.map, never from a literal (G11)", () => {
    /*
     * REPOINTED from `playerSpriteW/H` to `npcSpriteW/H`, and the second assertion below is why.
     *
     * REVERT CHECK — would the old rows still be wrong with every code change reverted? YES. This
     * slot draws npc-static art and has never drawn the player; the two keys were equal by
     * coincidence. The owner then ruled the player one block tall (`playerSpriteH` 48 → 32) while
     * the twelve shipped npc-static PNGs were still 32×48, and `expect(STYLE.portraitH).toBe(
     * playerSpriteH)` and the manifest row below could no longer both hold — not because a lane
     * broke something, but because one key was standing for two different sizes. The test was
     * asserting a coincidence as a contract.
     *
     * ⚠ THE CAST HAS SINCE BEEN RE-FITTED TO 32×32 ("let's do NPCs that are squeezed"), SO THE TWO
     * KEYS ARE NUMERICALLY EQUAL AGAIN — AND THIS ROW MUST STILL NAME `npcSprite*`. A row reading
     * `playerSpriteH` would pass today and go on passing right up to the next ruling on either
     * sprite, which is precisely how the first fault reached the screen. The equality is the
     * hazard; naming the right owner is the fix.
     *
     * NOT WEAKENED: still two exact `toBe`s and an exact `toEqual`, and the cross-lane claim is
     * genuinely two-sided — `tools/comfy/manifest.json`'s `npc-static._targetSource` names this
     * balance key and says "MUST EQUAL". This row is what makes that true: a re-cut on either side
     * alone reds here rather than shipping art that does not fit its slot.
     */
    expect(STYLE.portraitW).toBe(balance.map.npcSpriteW);
    expect(STYLE.portraitH).toBe(balance.map.npcSpriteH);
    // …which is the size the npc-static class is generated at, so shipped art lands at scale 1.
    const npc = MANIFEST.classes["npc-static"];
    expect([npc?.targetW, npc?.targetH]).toEqual([STYLE.portraitW, STYLE.portraitH]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §8 The painted frame
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§8 the box's edge is the shipped ui-frame asset", () => {
  it("names an asset that is really in the tree, at the id the pipeline writes it to", () => {
    expect(DIALOGUE_FRAME_ASSET_ID).toBe(keyOf("ui-dialogue-box"));
    expect(hasRealAsset(DIALOGUE_FRAME_ASSET_ID), `${DIALOGUE_FRAME_ASSET_ID} is not shipped art`).toBe(true);
  });

  it("frameSlice IS the border the art actually has, re-derived from the PNG's pixels", () => {
    /*
     * Not a number chosen to look right. A slice wider than the border drags interior into the
     * corners; a slice narrower leaves a seam of interior along every edge. The border is measured
     * by walking in from the middle of the top edge until the colour stops changing — so the day the
     * art lane regenerates the frame with a different edge, this reddens instead of the box quietly
     * drawing a smeared corner.
     */
    const px = readPng(`assets/final/${DIALOGUE_FRAME_ASSET_ID}.png`);
    const mid = Math.floor(px.width / 2);
    const interior = px.at(mid, Math.floor(px.height / 2));
    let border = 0;
    while (border < px.height && px.at(mid, border) !== interior) border += 1;
    expect(border, "the frame has no border at all").toBeGreaterThan(0);
    expect(STYLE.frameSlice).toBe(border);
    // The same border on the left edge — a frame with different weights per side is not sliceable.
    let side = 0;
    const vmid = Math.floor(px.height / 2);
    while (side < px.width && px.at(side, vmid) !== interior) side += 1;
    expect(side).toBe(border);
  });

  it("draws EIGHT pieces of the real texture — corners unstretched, edges on one axis only", () => {
    const rig = mount({ entryId: OPENING.id });
    const rect = dialogueBoxRect(STYLE);
    const s = STYLE.frameSlice;
    const ring = rig.images().filter((i) => i.key === DIALOGUE_FRAME_ASSET_ID);
    expect(ring, "the box did not draw the shipped frame — it fell back to rectangles").toHaveLength(8);
    for (const piece of ring) expect(piece.originX, "a frame piece is centred, not corner-anchored").toBe(0);

    const at = (name: string): StubImage => {
      const piece = ring.find((i) => i.frame === name);
      expect(piece, `the frame has no "${name}" piece`).toBeDefined();
      return piece as StubImage;
    };

    // Corners: natural size, never scaled — the whole reason this is eight images and not one.
    for (const name of ["slice-tl", "slice-tr", "slice-bl", "slice-br"]) {
      const corner = at(name);
      expect([corner.displayWidth, corner.displayHeight], name).toEqual([s, s]);
      expect([corner.width, corner.height], `${name} was cut at the wrong size`).toEqual([s, s]);
    }
    // Edges stretch along their own axis and keep their thickness on the other.
    //
    // `toBeCloseTo`, chosen when this was written rather than widened later: a display size is
    // `naturalSize * (requested / naturalSize)` in Phaser as well as in the stub, so a stretched edge
    // comes back off a float round-trip (60 arrives as 59.99999999999999). Nine decimal places is
    // far tighter than one virtual pixel, so a real off-by-anything still reddens.
    for (const name of ["slice-t", "slice-b"]) {
      expect(at(name).displayWidth, name).toBeCloseTo(rect.width - s * 2, 9);
      expect(at(name).displayHeight, name).toBeCloseTo(s, 9);
    }
    for (const name of ["slice-l", "slice-r"]) {
      expect(at(name).displayWidth, name).toBeCloseTo(s, 9);
      expect(at(name).displayHeight, name).toBeCloseTo(rect.height - s * 2, 9);
    }
    // The ring bounds the box exactly, with no gap and no overhang.
    const bounds = ring.map(boundsOf);
    expect(Math.min(...bounds.map((b) => b.left))).toBe(rect.x);
    expect(Math.min(...bounds.map((b) => b.top))).toBe(rect.y);
    expect(Math.max(...bounds.map((b) => b.right))).toBe(rect.x + rect.width);
    expect(Math.max(...bounds.map((b) => b.bottom))).toBe(rect.y + rect.height);
  });

  it("the frame's cream interior is NEVER painted — the field stays the box swatch", () => {
    /*
     * MEASURED: the shipped frame's interior is #faf7eb, which is `swatchHex(DIALOGUE_SWATCH_ID.text)`
     * — the body copy's own colour. Adopt it as the panel body and every authored line in the game is
     * drawn at 1 : 1 contrast against its own background, while tests/gates/ui-contrast-contract.test.ts
     * stays green because it measures `text` on the box SWATCH and cannot see a PNG painted there.
     * So: the ring is art, the field is `boxColor`, and the ring's centre is never drawn.
     */
    const px = readPng(`assets/final/${DIALOGUE_FRAME_ASSET_ID}.png`);
    const interior = px.at(Math.floor(px.width / 2), Math.floor(px.height / 2));
    expect(interior.toLowerCase(), "the frame's interior is no longer the body-text colour").toBe(
      STYLE.textColor.toLowerCase(),
    );

    const rig = mount({ entryId: OPENING.id });
    const ring = rig.images().filter((i) => i.key === DIALOGUE_FRAME_ASSET_ID);
    // No centre piece: nothing draws the interior region of the source texture.
    const s = STYLE.frameSlice;
    for (const piece of ring) {
      const coversInterior = piece.width > s && piece.height > s;
      expect(coversInterior, `frame piece "${String(piece.frame)}" paints the cream interior`).toBe(false);
    }
    const rect = dialogueBoxRect(STYLE);
    const field = rectsOf(rig.stub)[0];
    expect(field?.fill, "the field is not the box swatch").toBe(STYLE.boxColor);
    expect([field?.x, field?.y, field?.w, field?.h]).toEqual([
      rect.x + s,
      rect.y + s,
      rect.width - s * 2,
      rect.height - s * 2,
    ]);
  });

  it("the choice panel wears the same frame, and pays no portrait tax on its width", () => {
    const rig = mount({ entryId: OPENING.id });
    for (let i = 0; i < OPENING.lines.length - 1; i += 1) advanceLine(rig);
    // Two panels on screen ⇒ two rings.
    expect(rig.images().filter((i) => i.key === DIALOGUE_FRAME_ASSET_ID)).toHaveLength(16);
    // The choice panel has no face in it, so it keeps the full-width budget the box had before the
    // portrait — otherwise the slot would cut six characters off every authored prompt to pay for a
    // face that is not there.
    expect(dialogueChoiceColumns(STYLE)).toBeGreaterThan(dialogueColumns(STYLE));
    const widest = Math.max(
      ...DIALOGUE.entries.flatMap((e) => (e.choices ?? []).map((c) => c.text.length + 2)),
    );
    expect(widest, "an authored choice would be truncated by the panel").toBeLessThanOrEqual(
      dialogueChoiceColumns(STYLE),
    );
  });

  it("with no frame texture the box still draws — a hairline and a field, and no throw", () => {
    /*
     * The path a broken or absent download leaves behind. It draws the Gold box this file has always
     * drawn rather than a labelled stand-in, deliberately: a hatched PLACEHOLDER stretched across the
     * box would sit under every authored line in the game, which costs more than the missing frame.
     */
    const rig = mount({ entryId: OPENING.id }, { loaded: [] });
    expect(rig.images().filter((i) => i.key === DIALOGUE_FRAME_ASSET_ID)).toHaveLength(0);
    const rect = dialogueBoxRect(STYLE);
    const rects = rectsOf(rig.stub);
    expect(rects.length).toBeGreaterThanOrEqual(2);
    expect(rects[0]?.fill).toBe(STYLE.borderColor);
    expect(rects[0]?.x).toBe(rect.x);
    expect(rects[0]?.w).toBe(rect.width);
    expect(rects[1]?.fill).toBe(STYLE.boxColor);
    // The words arrive either way.
    expect(rig.drawn().join(" ")).toContain(
      wrapDialogue(OPENING.lines[0]!.text, dialogueColumns(STYLE))[0]!,
    );
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §6 G7 — nothing on this screen is written by this code
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§6 every word drawn came out of data/dialogue.json", () => {
  it("a played chain draws only authored text, speaker names and the three chrome glyphs", () => {
    const authored = new Set<string>();
    for (const entry of DIALOGUE.entries) {
      for (const line of entry.lines) for (const row of wrapDialogue(line.text, dialogueColumns(STYLE))) authored.add(row);
      for (const choice of entry.choices ?? []) authored.add(choice.text);
    }
    const names = new Set(DIALOGUE.speakers.map((s) => s.name));

    const rig = mount({ entryId: OPENING.id });
    const rows: string[] = [];
    for (let guard = 0; guard < 200 && rig.done.length === 0; guard += 1) {
      rows.push(...rig.drawn());
      advance(rig);
    }
    expect(rows.length).toBeGreaterThan(5);
    for (const row of rows) {
      if (row === STYLE.advanceMarker) continue;
      // A choice row is the cursor glyph, a space, and the authored prompt.
      const stripped = row.startsWith(STYLE.choiceCursor) || row.startsWith(STYLE.choiceBlank)
        ? row.slice(2)
        : row;
      if (names.has(row) || authored.has(row) || authored.has(stripped)) continue;
      // A crawl in progress is a PREFIX of an authored row; nothing else may be.
      const isPrefix = [...authored].some((full) => full.startsWith(row) || full.startsWith(stripped));
      expect(isPrefix, `the box drew a string no one authored: "${row}"`).toBe(true);
    }
  });
});
