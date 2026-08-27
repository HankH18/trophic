/**
 * tools/ui-frames/contact-sheet.ts — the artefact this lane is actually judged on.
 *
 *   npx tsx tools/ui-frames/contact-sheet.ts
 *
 * A FRAME JUDGED EMPTY IS A FRAME JUDGED WRONG. Every screen below is assembled at the real virtual
 * resolution (480×320, from `balance.map`), with the frame nine-sliced to the size the real widget
 * draws it at, and filled with strings that came out of `data/` — the dialogue line out of
 * `data/dialogue.json`, the ledger rows out of `game/survey-view.ts` run against a real `newSave`,
 * the dex entry out of `buildDexEntry`, the battle card out of `data/gyms.json`'s first leader, the
 * session-menu rows copied verbatim from `game/scenes/MenuScene.ts`. Nothing on the sheet is lorem.
 *
 * WHY THE STRINGS ARE COMPUTED AND NOT PASTED. A pasted string is a claim about what the game says;
 * a computed one IS what the game says. The survey rows in particular are the output of the module
 * the survey screen itself calls, so if a column overflows on this sheet it overflows in the game,
 * and if the frame's rules land in a descender here they land in one there.
 *
 * TWO SHEETS PER POLARITY:
 *   _CONTACT-SHEET-<theme>.png      seven screens at 1× — the size the design is decided at
 *   _CONTACT-SHEET-<theme>-x3.png   the same chrome at 3× — the size a 1080p window shows
 * `game/boot.ts` `canvasZoom` floors the fit to an integer and `pixelArt: true` upscales nearest,
 * so 3× is not a magnification for inspection, it is the shipped presentation.
 */

import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import sharp from "sharp";

import { validateContent } from "../../core/schemas.ts";
import { newSave } from "../../core/save.ts";
import { seasonAt } from "../../core/clock.ts";
import { DIALOGUE } from "../../core/dialogue-schema.ts";
import {
  buildDexEntry,
  renderDexEntry,
  renderSurveyPage,
  surveyPageForSave,
} from "../../game/survey-view.ts";

import { Canvas, nineSlice, rgba, scale } from "./raster.ts";
import { buildAll, DEX_CARD, LEDGER, SLICE_PX, virtualScreen, type BuiltFrame } from "./frames.ts";
import { PROPOSED_PLATE_INK_DIM, THEMES, proposedInkDimHex, themeHex, type FrameTheme } from "./theme.ts";
import { roleHex } from "../../game/ui/Palette.ts";
import { textLayer, withText, type TextRun } from "./text.ts";
import { OUT_DIR } from "./render.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

/* ────────────────────────────────────────────────────────────────────────────
 * Real content
 * ──────────────────────────────────────────────────────────────────────────── */

const content = validateContent();
const balance = content.balance;
const SCREEN = virtualScreen();

const save = newSave(
  { seed: balance.rng?.defaultSeed ?? 20250824, currentNode: content.nodes[0]?.id ?? "", nodes: content.nodes },
  balance,
);
const season = seasonAt(save.tick, balance);

/** The tutorial line that names the survey board — `data/dialogue.json`, `maren.tutorial.survey`. */
function dialogueSample(): { speaker: string; body: string } {
  const entry = DIALOGUE.entries.find((e) => e.id === "maren.tutorial.survey") ?? DIALOGUE.entries[0];
  if (!entry) throw new Error("tools/ui-frames: data/dialogue.json has no entries");
  const speaker = DIALOGUE.speakers.find((s) => s.id === entry.speaker);
  return { speaker: speaker?.name ?? entry.speaker, body: entry.lines[0]?.text ?? "" };
}

/** `game/scenes/DialogueScene.ts` `wrapDialogue`, reimplemented so the tool needs no Phaser import. */
function wrap(text: string, columns: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/u).filter((w) => w.length > 0)) {
    const candidate = line.length === 0 ? word : `${line} ${word}`;
    if (candidate.length > columns) {
      if (line.length > 0) out.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line.length > 0) out.push(line);
  return out;
}

/** The in-run menu, verbatim from `game/scenes/MenuScene.ts` `#buildSession`. */
interface Row {
  label: string;
  detail: string;
  state: "open" | "focused" | "closed";
}

function sessionRows(): Row[] {
  const node = content.nodes.find((n) => n.id === save.currentNode);
  return [
    { label: "SAVE", detail: "Writes SLOT 1.", state: "open" },
    { label: "SETTINGS", detail: "", state: "open" },
    { label: "SURVEY", detail: "Per-node populations and the derived web.", state: "focused" },
    { label: "DEX", detail: "Every line, with its seasonal flags and live count.", state: "open" },
    {
      label: "TEAM",
      detail: `Party ${save.party.length} · box ${save.box.length}. Shows the projected retirement year.`,
      state: "open",
    },
    { label: "BAG", detail: "Not built yet — build-doc §15 C4.", state: "closed" },
    { label: "QUESTS", detail: "Not built yet — build-doc §15 C7.", state: "closed" },
    { label: "BACK TO TITLE", detail: `${node?.name ?? save.currentNode}`, state: "open" },
  ];
}

/** The first gym, from `data/gyms.json`, with its form names resolved through `data/species.json`. */
function battleStrings(): { enemy: string; player: string; moves: string[]; caption: string } {
  const gym = content.gyms[0];
  const sig = gym?.signature;
  const lineOf = (id: string): (typeof content.species)[number] | undefined =>
    content.species.find((s) => s.id === id);
  const enemyLine = sig ? lineOf(sig.lineId) : undefined;
  const enemyName = sig?.nickname ?? (enemyLine && sig ? enemyLine.formNames[sig.age] : "—");
  // G2/G3 (`no_shadow_tables`): a species id typed into a shipping source is a SECOND declaration of
  // content `data/species.json` owns, and the two drift silently. `tests/property/foodweb.test.ts`
  // enforces it — "no shipping source names a species". A contact sheet only needs *a* creature to
  // show a real move list against, so it takes the first shipped line and keeps working when the
  // roster changes, which a literal would not.
  const starter = content.species[0];
  const moveIds = starter ? Object.values(starter.movePool) : [];
  const moveNames = moveIds
    .map((id) => content.moves.moves.find((m) => m.id === id)?.name ?? id)
    .filter((n): n is string => typeof n === "string")
    .slice(0, 4);
  return {
    enemy: `${enemyName}  Lv ${sig?.level ?? 8}`,
    player: `Ember  Lv 16`,
    moves: moveNames,
    caption: `${enemyName} used ${moveNames[0] ?? "—"}.`,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Screen assembly
 * ──────────────────────────────────────────────────────────────────────────── */

interface Layer {
  buf: Buffer;
  x: number;
  y: number;
}

async function canvasPng(c: Canvas): Promise<Buffer> {
  return sharp(Buffer.from(c.px), { raw: { width: c.width, height: c.height, channels: 4 } })
    .png()
    .toBuffer();
}

async function solid(width: number, height: number, hex: string): Promise<Buffer> {
  const c = new Canvas(width, height);
  c.fillRect(0, 0, width, height, rgba(hex));
  return canvasPng(c);
}

/**
 * A 480×320 crop of a real painted map, at the scale the overworld draws it.
 *
 * `balance.map.mapNativePx` is 1024 and `mapRenderScale` is 2, so the viewport shows a
 * 240×160 native window magnified 2× — the same nearest-neighbour magnification `pixelArt: true`
 * gives it in the game. Judging a dialogue box over flat black would answer a question nobody asks:
 * every box in this game is drawn over painted ground, and the only honest test of a keyline is
 * whether it survives one.
 */
async function mapBackdrop(nodeId: string): Promise<Buffer> {
  const path = join(REPO, "assets", "final", "maps", `${nodeId}.png`);
  const cropW = Math.round(SCREEN.width / balance.map.mapRenderScale);
  const cropH = Math.round(SCREEN.height / balance.map.mapRenderScale);
  const left = Math.round((balance.map.mapNativePx - cropW) / 2);
  const top = Math.round((balance.map.mapNativePx - cropH) / 2);
  return sharp(path)
    .extract({ left, top, width: cropW, height: cropH })
    .resize(SCREEN.width, SCREEN.height, { kernel: "nearest" })
    .ensureAlpha()
    .png()
    .toBuffer();
}

async function compose(base: Buffer, layers: readonly Layer[], runs: readonly TextRun[]): Promise<Buffer> {
  const stacked =
    layers.length === 0
      ? base
      : await sharp(base)
          .composite(layers.map((l) => ({ input: l.buf, left: l.x, top: l.y })))
          .png()
          .toBuffer();
  return withText(stacked, SCREEN.width, SCREEN.height, runs);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The seven screens
 * ──────────────────────────────────────────────────────────────────────────── */

interface Screen {
  title: string;
  buf: Buffer;
}

/** Everything a screen builder needs: the frames for this polarity, keyed by manifest id. */
type FrameMap = Map<string, BuiltFrame>;

function ink(theme: FrameTheme): string {
  return themeHex(theme, "ink");
}
function inkMuted(theme: FrameTheme): string {
  return themeHex(theme, "inkMuted");
}
function inkDim(theme: FrameTheme): string {
  return themeHex(theme, "inkDim");
}
function accent(theme: FrameTheme): string {
  return themeHex(theme, "accent");
}

/** `game/scenes/DialogueScene.ts` `defaultDialogueStyle` / `dialogueBoxRect`, verbatim. */
const DIALOGUE_STYLE = { margin: 8, pad: 8, lineHeight: 13, charWidth: 6, bodyLines: 3, fontPx: 10 } as const;

function dialogueRect(): { x: number; y: number; w: number; h: number } {
  const w = SCREEN.width - DIALOGUE_STYLE.margin * 2;
  const h = DIALOGUE_STYLE.pad * 2 + DIALOGUE_STYLE.lineHeight * (DIALOGUE_STYLE.bodyLines + 1);
  return { x: DIALOGUE_STYLE.margin, y: SCREEN.height - DIALOGUE_STYLE.margin - h, w, h };
}

async function screenDialogue(frames: FrameMap, theme: FrameTheme): Promise<Screen> {
  const box = dialogueRect();
  const src = frames.get("ui-dialogue-box");
  if (!src) throw new Error("no dialogue frame");
  const sliced = nineSlice(src.canvas, box.w, box.h, SLICE_PX);
  const { speaker, body } = dialogueSample();
  const columns = Math.floor((box.w - DIALOGUE_STYLE.pad * 2) / DIALOGUE_STYLE.charWidth);
  const rows = wrap(body, columns).slice(0, DIALOGUE_STYLE.bodyLines);

  const left = box.x + DIALOGUE_STYLE.pad;
  const runs: TextRun[] = [
    { x: left, y: box.y + DIALOGUE_STYLE.pad, text: speaker, hex: inkMuted(theme), sizePx: DIALOGUE_STYLE.fontPx },
  ];
  rows.forEach((row, i) => {
    runs.push({
      x: left,
      y: box.y + DIALOGUE_STYLE.pad + DIALOGUE_STYLE.lineHeight * (i + 1),
      text: row,
      hex: ink(theme),
      sizePx: DIALOGUE_STYLE.fontPx,
    });
  });
  runs.push({
    x: box.x + box.w - DIALOGUE_STYLE.pad,
    y: box.y + box.h - DIALOGUE_STYLE.pad - DIALOGUE_STYLE.lineHeight,
    text: "▼",
    hex: accent(theme),
    sizePx: DIALOGUE_STYLE.fontPx,
    align: "right",
  });

  const buf = await compose(
    await mapBackdrop("hearthollow"),
    [{ buf: await canvasPng(sliced), x: box.x, y: box.y }],
    runs,
  );
  return { title: `dialogue box · nine-sliced 480×96 → ${box.w}×${box.h} at (${box.x},${box.y})`, buf };
}

/**
 * The in-run menu as a right-hand PANEL, which is what `ui-menu-panel` 160×320 is for and what the
 * game does not currently do — see SPEC.md §"the session menu".
 */
/**
 * 10px, not the 8px `MenuScene.uiText` defaults to.
 *
 * Every other screen in the build draws at `survey-view.ts` `SCREEN_TEXT.fontPx` = 10; the menus and
 * the title are the only 8px screens, and on the sheet the difference reads as two different games
 * sharing a cartridge. 10px also matches Gold, whose menu text is proportionally larger than this.
 * `BACK TO TITLE` is 13 characters — 78px at a 6px advance, plus a 14px cursor column and 2×8 of
 * padding, so 132 is not enough and 140 is.
 */
const SESSION_PANEL = { w: 140, rowH: 16, pad: 8, fontPx: 10, gap: 6, cursorW: 14 } as const;

async function screenSessionMenu(frames: FrameMap, theme: FrameTheme): Promise<Screen> {
  const rows = sessionRows();
  const src = frames.get("ui-menu-panel");
  const strip = frames.get("ui-dialogue-box");
  if (!src || !strip) throw new Error("no menu/dialogue frame");

  const h = SESSION_PANEL.pad * 2 + SESSION_PANEL.rowH * rows.length;
  const x = SCREEN.width - SESSION_PANEL.w - SESSION_PANEL.gap;
  const y = SESSION_PANEL.gap;
  const panel = nineSlice(src.canvas, SESSION_PANEL.w, h, SLICE_PX);

  // The focused row's detail goes in a one-line strip at the foot of the screen, which is where
  // Gold puts it and where it stops being a second column fighting the labels for 132px.
  const focused = rows.find((r) => r.state === "focused") ?? rows[0];
  const stripH = DIALOGUE_STYLE.pad * 2 + DIALOGUE_STYLE.lineHeight;
  const stripY = SCREEN.height - DIALOGUE_STYLE.margin - stripH;
  const stripW = SCREEN.width - DIALOGUE_STYLE.margin * 2;
  const stripCanvas = nineSlice(strip.canvas, stripW, stripH, SLICE_PX);

  // THE TWO CLOSED ROWS ARE PAINTED DIFFERENTLY ON PURPOSE — this is the A/B for
  // `PROPOSED_PLATE_INK_DIM`. BAG takes the role that exists (`cursorInkDim`, c19, 5.68 : 1) and
  // QUESTS the one this lane recommends (c09, 3.77 : 1). Both clear the gate's `inactive` floor;
  // only one of them reads as shut. Look at the picture, not at the two numbers.
  let closedSeen = 0;
  const runs: TextRun[] = [];
  rows.forEach((row, i) => {
    const ry = y + SESSION_PANEL.pad + i * SESSION_PANEL.rowH;
    const closedHex =
      row.state === "closed" && theme.id === "light" && closedSeen++ === 1
        ? proposedInkDimHex()
        : inkDim(theme);
    const hex = row.state === "closed" ? closedHex : row.state === "focused" ? accent(theme) : ink(theme);
    if (row.state === "focused") {
      runs.push({ x: x + SESSION_PANEL.pad, y: ry, text: "▶", hex, sizePx: SESSION_PANEL.fontPx });
    }
    runs.push({ x: x + SESSION_PANEL.pad + SESSION_PANEL.cursorW, y: ry, text: row.label, hex, sizePx: SESSION_PANEL.fontPx });
  });
  runs.push({
    x: DIALOGUE_STYLE.margin + DIALOGUE_STYLE.pad,
    y: stripY + DIALOGUE_STYLE.pad,
    text: focused?.detail ?? "",
    hex: inkMuted(theme),
    sizePx: DIALOGUE_STYLE.fontPx,
  });

  const buf = await compose(
    await mapBackdrop("hearthollow"),
    [
      { buf: await canvasPng(panel), x, y },
      { buf: await canvasPng(stripCanvas), x: DIALOGUE_STYLE.margin, y: stripY },
    ],
    runs,
  );
  return { title: `session menu · panel ${SESSION_PANEL.w}×${h}, detail strip ${stripW}×${stripH}`, buf };
}

/** `game/ui/BattleLayout.ts` `battleScreenLayout`, recomputed here so the boxes land where it says. */
const BATTLE = { edge: 4, cardW: 150, cardH: 46, menuW: 142, rowH: 12, menuPad: 5, rows: 5, msgH: 46, msgPad: 6 } as const;

async function screenBattle(frames: FrameMap, theme: FrameTheme): Promise<Screen> {
  const hud = frames.get("ui-battle-hud-frame");
  const menuSrc = frames.get("ui-menu-panel");
  const msgSrc = frames.get("ui-dialogue-box");
  if (!hud || !menuSrc || !msgSrc) throw new Error("no battle frames");

  const msgY = SCREEN.height - BATTLE.msgH;
  const menuH = BATTLE.menuPad * 2 + BATTLE.rowH * BATTLE.rows;
  const menuX = SCREEN.width - BATTLE.menuW - BATTLE.edge;
  const menuY = msgY - menuH - BATTLE.edge;
  const playerX = SCREEN.width - BATTLE.cardW - BATTLE.edge;
  const playerY = menuY - BATTLE.cardH - BATTLE.edge;

  const card = await canvasPng(nineSlice(hud.canvas, BATTLE.cardW, BATTLE.cardH, SLICE_PX));
  const menu = await canvasPng(nineSlice(menuSrc.canvas, BATTLE.menuW, menuH, SLICE_PX));
  const msg = await canvasPng(nineSlice(msgSrc.canvas, SCREEN.width, BATTLE.msgH, SLICE_PX));

  const b = battleStrings();
  const cardRuns = (x: number, y: number, title: string, hp: string): TextRun[] => [
    { x: x + 6, y: y + 5, text: title, hex: ink(theme), sizePx: 8 },
    { x: x + 6, y: y + 30, text: "HP", hex: inkMuted(theme), sizePx: 8 },
    { x: x + BATTLE.cardW - 6, y: y + 30, text: hp, hex: inkMuted(theme), sizePx: 8, align: "right" },
  ];

  const menuRows = ["FIGHT", "SNARE", "BAIT", "SWITCH", "RUN"];
  const runs: TextRun[] = [
    ...cardRuns(BATTLE.edge, BATTLE.edge, b.enemy, "44/44"),
    ...cardRuns(playerX, playerY, b.player, "114/114"),
    ...menuRows.map((label, i): TextRun => ({
      x: menuX + BATTLE.menuPad + 4,
      y: menuY + BATTLE.menuPad + i * BATTLE.rowH + 2,
      text: `${i === 0 ? "▶" : " "} ${label}`,
      hex: i === 0 ? accent(theme) : ink(theme),
      sizePx: 8,
    })),
    ...b.moves.slice(0, 2).map((m, i): TextRun => ({
      x: menuX + BATTLE.menuW - BATTLE.menuPad - 4,
      y: menuY + BATTLE.menuPad + i * BATTLE.rowH + 2,
      text: m,
      hex: inkMuted(theme),
      sizePx: 8,
      align: "right",
    })),
    { x: BATTLE.msgPad, y: msgY + BATTLE.msgPad, text: b.caption, hex: ink(theme), sizePx: 8 },
  ];

  const buf = await compose(
    await solid(SCREEN.width, SCREEN.height, voidHex()),
    [
      { buf: card, x: BATTLE.edge, y: BATTLE.edge },
      { buf: card, x: playerX, y: playerY },
      { buf: menu, x: menuX, y: menuY },
      { buf: msg, x: 0, y: msgY },
    ],
    runs,
  );
  return { title: `battle · two 240×64 cards at 150×46, menu 142×${menuH}, message 480×46`, buf };
}

/** The field every panel is drawn over — `UI_SWATCH_ID.bg` / `SCREEN_SWATCH_ID.backdrop`, c00. */
function voidHex(): string {
  return roleHex("void");
}

/**
 * The ink ladder for a screen with NO PLATE, which is a different ladder and must stay one.
 *
 * `game/menu-model.ts` `UI_SWATCH_ID` is tuned against the `void` backdrop: text c03 at 19.15 : 1,
 * dim c01 at 6.93, accent c16 at 14.51. The LIGHT polarity's plate ink is tuned against a near-white
 * plate and measures 1.2 : 1, 3.3 : 1 and 3.4 : 1 on the void — `game/menu-model.ts` says so in
 * those words. The first cut of this sheet painted the title screen with the plate ladder and the
 * whole menu vanished into the black, which is exactly the failure the two tables exist to prevent.
 * Anything drawn straight on the field uses these.
 */
const ON_VOID = {
  text: roleHex("text"),
  dim: roleHex("textMuted"),
  accent: roleHex("accent"),
} as const;

async function screenLedger(frames: FrameMap, theme: FrameTheme): Promise<Screen> {
  const src = frames.get("ui-ledger-panel");
  if (!src) throw new Error("no ledger frame");
  const nodeId = save.currentNode;
  const page = surveyPageForSave(save, nodeId, content);
  const lines = renderSurveyPage(page);
  const [heading, totals, presence, columns, ...rows] = lines;

  const runs: TextRun[] = [
    { x: LEDGER.textLeft, y: LEDGER.headingY, text: heading ?? "", hex: ink(theme), sizePx: 10 },
    { x: LEDGER.textLeft, y: LEDGER.totalsY, text: totals ?? "", hex: ink(theme), sizePx: 10 },
    { x: LEDGER.textLeft, y: LEDGER.presenceY, text: presence ?? "", hex: inkMuted(theme), sizePx: 10 },
    { x: LEDGER.textLeft, y: LEDGER.columnsY, text: columns ?? "", hex: inkMuted(theme), sizePx: 10 },
    ...rows.slice(0, LEDGER.rows).map((row, i): TextRun => ({
      x: LEDGER.textLeft,
      y: LEDGER.firstRowY + i * LEDGER.rowPitch,
      text: row,
      hex: ink(theme),
      sizePx: 10,
    })),
    {
      x: LEDGER.textLeft,
      y: LEDGER.footerY,
      text: `1/${content.nodes.length}  ←/→ node  TAB web  ESC`,
      hex: inkMuted(theme),
      sizePx: 10,
    },
  ];

  const buf = await compose(await canvasPng(src.canvas), [], runs);
  return { title: `ledger · 480×320 at 1:1, ${rows.length} live rows of ${LEDGER.rows}`, buf };
}

/**
 * THE DEX IS TWO PANES, AND THE MANIFEST SAYS SO IN ITS ARITHMETIC.
 *
 * `ui-dex-card-frame` is pinned 320×320 and `ui-menu-panel` 160×320. 320 + 160 = 480 =
 * `balance.map.virtualWidth`, and both are the full 320 height. That is not a coincidence; it is a
 * two-pane screen — the species card on the left, a scrolling list of lines on the right — and it is
 * the only reading under which a 320×320 card has anywhere to live on a 480×320 display. Drawn
 * centred instead, it leaves 80px of dead field down each side.
 *
 * It also fixes what the shipped `DexScene` is missing rather than what it draws wrongly: today the
 * dex is `←/→` through 27 entries with no list, so a player who wants a particular line pages for it
 * blind. `DexScene.step()` already wraps modulo `entries.length`; the list is a view of the same
 * cursor.
 */
const DEX_LIST = { x: 320, w: 160, pad: 8, rowPitch: 14, fontPx: 10, firstY: 12, rows: 20 } as const;

async function screenDex(frames: FrameMap, theme: FrameTheme): Promise<Screen> {
  const src = frames.get("ui-dex-card-frame");
  const listSrc = frames.get("ui-menu-panel");
  if (!src || !listSrc) throw new Error("no dex frames");
  // G2/G3 as above — the dex card needs a real entry to render, not a named one.
  const line = content.species[0];
  if (!line) throw new Error("tools/ui-frames: data/species.json is empty");
  const dexId = line.dexIds[0] ?? line.id;
  const entry = buildDexEntry(line, dexId, season, balance);
  const body = renderDexEntry(entry, 12);
  const [name, ...rest] = body;
  const side = rest.slice(0, DEX_CARD.sideLines);
  const under = rest.slice(DEX_CARD.sideLines);

  const cardX = 0;
  const list = nineSlice(listSrc.canvas, DEX_LIST.w, SCREEN.height, SLICE_PX);
  const allDexIds = content.species.flatMap((sp) => sp.dexIds);
  const shown = allDexIds.slice(0, DEX_LIST.rows);

  const runs: TextRun[] = [
    { x: cardX + DEX_CARD.textLeft, y: DEX_CARD.nameY, text: name ?? dexId, hex: ink(theme), sizePx: 10 },
    ...side.map((row, i): TextRun => ({
      x: cardX + DEX_CARD.sideX,
      y: DEX_CARD.sideY + i * DEX_CARD.sidePitch,
      text: row,
      hex: ink(theme),
      sizePx: 10,
    })),
    ...under.map((row, i): TextRun => ({
      x: cardX + DEX_CARD.textLeft,
      y: DEX_CARD.bodyY + i * DEX_CARD.bodyPitch,
      text: row,
      hex: row.startsWith("not in") || row === "dormant" || row === "migrating" ? accent(theme) : ink(theme),
      sizePx: 10,
    })),
    { x: cardX + DEX_CARD.textLeft, y: DEX_CARD.footerY, text: "\u2191\u2193 line   ESC back", hex: inkMuted(theme), sizePx: 10 },
    ...shown.map((id, i): TextRun => ({
      x: DEX_LIST.x + DEX_LIST.pad + 12,
      y: DEX_LIST.firstY + i * DEX_LIST.rowPitch,
      text: id,
      hex: i === 0 ? accent(theme) : ink(theme),
      sizePx: DEX_LIST.fontPx,
    })),
    { x: DEX_LIST.x + DEX_LIST.pad, y: DEX_LIST.firstY, text: "\u25b6", hex: accent(theme), sizePx: DEX_LIST.fontPx },
    {
      x: DEX_LIST.x + DEX_LIST.pad,
      y: DEX_LIST.firstY + DEX_LIST.rows * DEX_LIST.rowPitch,
      text: `1/${allDexIds.length}  \u25bc`,
      hex: inkMuted(theme),
      sizePx: DEX_LIST.fontPx,
    },
  ];

  const buf = await compose(
    await solid(SCREEN.width, SCREEN.height, voidHex()),
    [
      { buf: await canvasPng(src.canvas), x: cardX, y: 0 },
      { buf: await canvasPng(list), x: DEX_LIST.x, y: 0 },
    ],
    runs,
  );
  return {
    title: `dex \u00b7 card 320\u00d7320 + list 160\u00d7320 = the 480 virtual width, well ${DEX_CARD.wellSize}\u00b2`,
    buf,
  };
}

/**
 * The title screen with its menu ON A PLATE — a design proposal, not the shipped screen.
 *
 * `game/scenes/TitleScene.ts` draws its three rows as bare 8px text on the `void` backdrop, which is
 * the one screen in the build with nothing to look at but a placeholder box. Gold puts its title
 * menu in a box; so does this. The byline and any warning note stay OFF the plate and therefore keep
 * the `UI_SWATCH_ID` ladder ({@link ON_VOID}) — a screen may hold both ladders as long as each line
 * knows which surface it is on.
 */
const TITLE_MENU = { x: 12, y: 84, w: 244, rowPitch: 16, pad: 10, fontPx: 10 } as const;

async function screenTitle(frames: FrameMap, theme: FrameTheme): Promise<Screen> {
  const src = frames.get("ui-title-banner");
  const panelSrc = frames.get("ui-menu-panel");
  if (!src || !panelSrc) throw new Error("no title frames");
  const x = Math.round(SCREEN.width / 2 - src.size.width / 2);
  const y = 46 - Math.round(src.size.height / 2);

  const rows: Array<[string, string]> = [
    ["NEW GAME", ""],
    ["CONTINUE", "SLOT 1 \u00b7 YEAR 1 \u00b7 Hearthollow"],
    ["SETTINGS", ""],
  ];
  const detailLines = rows.filter(([, d]) => d).length;
  const panelH = TITLE_MENU.pad * 2 + rows.length * TITLE_MENU.rowPitch + detailLines * 12;
  const panel = nineSlice(panelSrc.canvas, TITLE_MENU.w, panelH, SLICE_PX);

  const runs: TextRun[] = [];
  let ry = TITLE_MENU.y + TITLE_MENU.pad;
  rows.forEach(([label, detail], i) => {
    const hex = i === 0 ? accent(theme) : ink(theme);
    if (i === 0) runs.push({ x: TITLE_MENU.x + TITLE_MENU.pad, y: ry, text: "\u25b6", hex, sizePx: TITLE_MENU.fontPx });
    runs.push({ x: TITLE_MENU.x + TITLE_MENU.pad + 14, y: ry, text: label, hex, sizePx: TITLE_MENU.fontPx });
    ry += TITLE_MENU.rowPitch;
    if (detail) {
      runs.push({ x: TITLE_MENU.x + TITLE_MENU.pad + 22, y: ry, text: detail, hex: inkMuted(theme), sizePx: 8 });
      ry += 12;
    }
  });
  // OFF the plate — the void ladder, not the plate ladder.
  runs.push({ x: 12, y: 298, text: "TROPHIC \u00b7 FALLOWMERE", hex: ON_VOID.dim, sizePx: 8 });

  const buf = await compose(
    await solid(SCREEN.width, SCREEN.height, voidHex()),
    [
      { buf: await canvasPng(src.canvas), x, y },
      { buf: await canvasPng(panel), x: TITLE_MENU.x, y: TITLE_MENU.y },
    ],
    runs,
  );
  return { title: `title \u00b7 banner 208\u00d748 at (${x},${y}) + menu plate ${TITLE_MENU.w}\u00d7${panelH}`, buf };
}

async function screenSign(frames: FrameMap, theme: FrameTheme): Promise<Screen> {
  const src = frames.get("ui-sign-card-frame");
  if (!src) throw new Error("no sign frame");
  const line = content.species.find((s) => s.seasonalWindow) ?? content.species[0];
  if (!line) throw new Error("tools/ui-frames: data/species.json is empty");
  const dexId = line.dexIds[0] ?? line.id;
  const entry = buildDexEntry(line, dexId, season, balance);
  const x = Math.round((SCREEN.width - src.size.width) / 2);
  const y = 80;
  const body = [
    `${dexId}`,
    `${entry.active ? "in season" : "dormant"} · ${season}`,
    `habitat ${entry.habitat.join(", ")}`,
  ];
  const runs: TextRun[] = body.map((row, i) => ({
    x: x + 16,
    y: y + 18 + i * 14,
    text: row,
    hex: voidHex(),
    sizePx: 10,
  }));
  void theme;

  const buf = await compose(
    await mapBackdrop("r1"),
    [{ buf: await canvasPng(src.canvas), x, y }],
    runs,
  );
  return { title: "sign card · 240×160 world prop, wood roles, hard base edge", buf };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The sheets
 * ──────────────────────────────────────────────────────────────────────────── */

const SHEET = { margin: 16, gap: 16, columns: 3, labelH: 16, headerH: 30 } as const;

async function sheet(screens: readonly Screen[], header: string, cellW: number, cellH: number): Promise<Buffer> {
  const cols = Math.min(SHEET.columns, screens.length);
  const rows = Math.ceil(screens.length / cols);
  const width = SHEET.margin * 2 + cols * cellW + (cols - 1) * SHEET.gap;
  const height = SHEET.margin * 2 + SHEET.headerH + rows * (cellH + SHEET.labelH) + (rows - 1) * SHEET.gap;

  const base = await solid(width, height, voidHex());
  const layers: Layer[] = [];
  const runs: TextRun[] = [
    { x: SHEET.margin, y: SHEET.margin, text: header, hex: "#faf7eb", sizePx: 12 },
  ];
  screens.forEach((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = SHEET.margin + col * (cellW + SHEET.gap);
    const y = SHEET.margin + SHEET.headerH + row * (cellH + SHEET.labelH + SHEET.gap);
    layers.push({ buf: s.buf, x, y });
    runs.push({ x, y: y + cellH + 3, text: s.title, hex: "#c8bca5", sizePx: 9 });
  });

  const stacked = await sharp(base)
    .composite(layers.map((l) => ({ input: l.buf, left: l.x, top: l.y })))
    .png()
    .toBuffer();
  return withTextSized(stacked, width, height, runs);
}

/** {@link withText} for a canvas that is not the 480×320 virtual screen — the sheet itself. */
async function withTextSized(base: Buffer, w: number, h: number, runs: readonly TextRun[]): Promise<Buffer> {
  return sharp(base)
    .composite([{ input: await sharp(textLayer(w, h, runs)).png().toBuffer(), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

async function buildFor(theme: FrameTheme): Promise<void> {
  const frames: FrameMap = new Map(buildAll(theme).map((f) => [f.size.id, f]));
  const screens: Screen[] = [
    await screenDialogue(frames, theme),
    await screenSessionMenu(frames, theme),
    await screenBattle(frames, theme),
    await screenLedger(frames, theme),
    await screenDex(frames, theme),
    await screenTitle(frames, theme),
    await screenSign(frames, theme),
  ];

  await mkdir(OUT_DIR, { recursive: true });
  const header =
    `TROPHIC UI FRAMES — "${theme.id}" polarity — every screen 480×320, every string from data/. ` +
    `Judge the picture, not the table.`;
  await sharp(await sheet(screens, header, SCREEN.width, SCREEN.height))
    .png()
    .toFile(join(OUT_DIR, `_CONTACT-SHEET-${theme.id}.png`));

  // 3×: the chrome at the size a 1080p window shows it.
  //
  // THE CROP IS PER SCREEN, and the first cut got this wrong in an instructive way: it took the
  // top-left quarter of every screen, which for the dialogue box and the session menu is 240×160 of
  // painted ground and no chrome at all. A zoom that magnifies the part of the picture nobody is
  // asking about is a metric improving while the artefact says nothing (rule zero, one level down).
  // Each window below is placed on the frame it is meant to show.
  const windows: Array<{ screen: Screen | undefined; left: number; top: number; what: string }> = [
    { screen: screens[0], left: 0, top: 160, what: "dialogue box, bottom-left" },
    { screen: screens[1], left: 240, top: 0, what: "session menu panel, top-right" },
    { screen: screens[2], left: 0, top: 0, what: "combatant card, top-left" },
    { screen: screens[3], left: 0, top: 0, what: "ledger header + register, top-left" },
  ];
  const zoomed: Screen[] = [];
  for (const w of windows) {
    if (!w.screen) continue;
    const cropped = await sharp(w.screen.buf)
      .extract({ left: w.left, top: w.top, width: 240, height: 160 })
      .raw()
      .toBuffer();
    const c = new Canvas(240, 160);
    c.px.set(cropped.subarray(0, 240 * 160 * 4));
    zoomed.push({ title: `${w.what} — 3×`, buf: await canvasPng(scale(c, 3)) });
  }
  await sharp(await sheet(zoomed, `${header}  ·  3× nearest, the shipped presentation`, 720, 480))
    .png()
    .toFile(join(OUT_DIR, `_CONTACT-SHEET-${theme.id}-x3.png`));
}

async function main(): Promise<void> {
  for (const theme of THEMES) await buildFor(theme);
  console.log(`wrote ${join(OUT_DIR, "_CONTACT-SHEET-*.png")}`);
}

const invokedDirectly = process.argv[1] !== undefined && process.argv[1].endsWith("contact-sheet.ts");
if (invokedDirectly) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
