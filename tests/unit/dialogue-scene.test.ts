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
 */

import { describe, expect, it } from "vitest";

import { DIALOGUE, type DialogueEntry } from "@core/dialogue-schema";
import { validateContent } from "@core/schemas";
import type { Balance, Content } from "@core/types";
import type { DialogueRunState } from "@game/dialogue-runner";
import {
  DIALOGUE_SCENE_KEY,
  createDialogueScene,
  crawl,
  crawlLength,
  defaultDialogueStyle,
  dialogueBoxRect,
  dialogueColumns,
  pageCount,
  pageOf,
  wrapDialogue,
  type DialogueSceneData,
  type DialogueStyle,
} from "@game/scenes/DialogueScene";
import { SCENE_KEYS } from "@game/scene-keys";
import { TEXT_SPEED_CPS } from "@game/registry";

const content: Content = validateContent();
const balance: Balance = content.balance;
const STYLE: DialogueStyle = defaultDialogueStyle(balance);

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

interface StubState {
  key: string;
  objects: StubText[];
  handlers: Map<string, Array<(e?: { repeat?: boolean }) => void>>;
  addedKeys: Set<string>;
  heldKeys: Set<string>;
  stopped: number;
}

function stubEngine(): { P: unknown; scenes: StubState[] } {
  const scenes: StubState[] = [];

  class StubBase {
    readonly stub: StubState;
    add: {
      rectangle: (x: number, y: number, w: number, h: number, fill: number) => StubText;
      text: (x: number, y: number, value: string, style?: { color?: string }) => StubText;
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

interface SceneLike {
  init(data: DialogueSceneData): void;
  create(): void;
  update(time: number, delta: number): void;
  runState(): DialogueRunState;
  renderedLines(): string[];
  entryOnScreen(): string;
  cursor(): number;
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
}

const ARM = STYLE.advanceArmFrames;

function mount(over: Partial<DialogueSceneData> & { entryId: string }): Rig {
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
  scene.create();
  const stub = scenes[scenes.length - 1] as StubState;
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
      return stub.objects.filter((o) => o.kind === "text").map((o) => o.text);
    },
  };
  return rig;
}

/** Press the advance key once, having waited long enough for the beat to be armed. */
function advance(rig: Rig): void {
  for (let i = 0; i < ARM; i += 1) rig.frame();
  rig.press("keydown-SPACE");
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

  it("draws the box behind the words — a frame and a field", () => {
    const rig = mount({ entryId: OPENING.id });
    const rects = rig.stub.objects.filter((o) => o.kind === "rect");
    expect(rects.length).toBeGreaterThanOrEqual(2);
    const rect = dialogueBoxRect(STYLE);
    expect(rects[0]?.x).toBe(rect.x);
    expect(rects[0]?.w).toBe(rect.width);
  });

  it("advances one authored line per press, in order, and every line is seen", () => {
    const rig = mount({ entryId: OPENING.id });
    const seen: string[] = [];
    for (let i = 0; i < OPENING.lines.length; i += 1) {
      seen.push(rig.scene.renderedLines().slice(1).join(" "));
      if (i < OPENING.lines.length - 1) advance(rig);
    }
    for (const [i, line] of OPENING.lines.entries()) {
      const wrapped = wrapDialogue(line.text, dialogueColumns(STYLE)).join(" ");
      expect(seen[i], `line ${String(i)}`).toContain(wrapped.slice(0, 40));
    }
  });

  it("redraws: the previous line's objects are destroyed, not stacked", () => {
    const rig = mount({ entryId: OPENING.id });
    const before = rig.drawn().join("\n");
    advance(rig);
    const after = rig.drawn().join("\n");
    expect(after).not.toBe(before);
    expect(rig.stub.objects.every((o) => !o.destroyed)).toBe(true);
    expect(rig.stub.objects.filter((o) => o.kind === "rect").length).toBeLessThanOrEqual(4);
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
  function toChoices(): Rig {
    const rig = mount({ entryId: OPENING.id });
    for (let i = 0; i < OPENING.lines.length - 1; i += 1) advance(rig);
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
      for (let i = 0; i < OPENING.lines.length - 1; i += 1) advance(rig);
      for (let i = 0; i < index; i += 1) rig.press("keydown-DOWN");
      for (let guard = 0; guard < 200 && rig.done.length === 0; guard += 1) advance(rig);
      expect(rig.done[0]?.visited, choice.text).toContain(choice.goto);
    }
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
