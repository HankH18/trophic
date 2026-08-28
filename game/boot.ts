/**
 * game/boot.ts — everything the game does before a scene has anything to draw.
 *
 * build-doc §4, runtime narrative step 1: "Boot loads balance.json, all content JSON, and the save
 * (or seeds a new one: RNG seed + copies of every node JSON as live sim state)."
 *
 * Split of responsibilities, deliberately:
 *   • This module owns the LOGIC — validate content, build the Phaser config from `balance.map`,
 *     seed a new save, resume a slot, persist the run, route into gameplay. None of it needs a
 *     scene, so all of it can be exercised without one.
 *   • `game/scenes/BootScene.ts` owns the PRESENTATION of that logic's failures.
 *   • `game/main.ts` owns the scene list — the only file that names a scene CLASS.
 *
 * PHASER IS A PARAMETER HERE, NOT AN IMPORT. `import "phaser"` throws `window is not defined` under
 * vitest's node environment, so a value import in this file would put every function below out of
 * reach of every test in the repo — which is how `startNodeId`, `requestedSeed`, `canvasZoom` and
 * `contentIssues` came to ship with no assertion on them at all (G14). The three engine VALUES this
 * module needs (`AUTO`, `Scale.NONE`, `Scale.NO_CENTER`) arrive through `createGameConfig`'s first
 * argument; everything else Phaser gives us here is a type, and types are erased. It is the same
 * discipline L11 imposes on `core/`, one level up, and for the same payoff.
 */

import type PhaserNS from "phaser";

import {
  ContentValidationError,
  validateContent,
} from "@core/schemas";
import { newSave, openStreams, type RngStreams, type SaveEnvelope } from "@core/save";
import type { Balance, Content, OwnedCreature, Season } from "@core/types";

// The canvas has to be sized before content validation can be REPORTED, because reporting it is
// itself something drawn on that canvas. So the two viewport numbers are read straight off
// balance.json — the same file `validateContent()` will check a moment later, and still the one
// home for them (G11: build-doc §7.6's 480×320 is `map.virtualWidth`/`map.virtualHeight`, never a
// literal here). If this file is so broken that these are missing, `createGameConfig` says so in
// the DOM instead of booting into a blank canvas.
import balanceJson from "../data/balance.json";

import { registry, type Settings } from "./registry";
// TYPE ONLY, and it has to stay that way: a value import of a scene from this module would put
// Phaser back in boot.ts's module graph (see the header) and make an import cycle out of the one
// direction that is currently acyclic — scenes import boot, boot imports no scene.
import type { OverworldScene, OverworldSceneData } from "./scenes/OverworldScene";
// TYPE ONLY, for the same reason as the line above.
import type { SurveySceneData } from "./scenes/SurveyScene";
import {
  SaveStorage,
  loadSettings,
  openBrowserStorage,
  saveSettings,
  type WriteResult,
} from "./storage";
// Engine-free (game/wild-battle.ts imports no Phaser), so importing it here keeps this module
// testable under vitest's node environment exactly as the header requires.
import { provisionalStarter } from "./wild-battle";
// Engine-free too (no Phaser import), so the epilogue's projection is reachable from a node test.
// `epilogueSeasons` is imported beside it because the ending's SEASON is a fact about the horizon
// that function publishes and about nothing else — see {@link epilogueSeason}.
import { epilogueSeasons, projectEpilogueRegion } from "./finale";
import { subsystemRng } from "@core/rng";

/* ────────────────────────────────────────────────────────────────────────────
 * Scene keys
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Every scene key in one place, and the "is it registered yet?" question, both re-exported from
 * `game/scene-keys.ts`.
 *
 * They live there rather than here because the engine-free scene modules (the year-turn and
 * retirement scenes, built by a factory that takes the engine as an argument so their logic stays
 * reachable from a node test) could not import a key from a file that pulls Phaser in — so each one
 * declared a private key instead, which is the second spelling the registry exists to prevent. This
 * module no longer imports Phaser as a value either (see the header), but the registry stays where
 * it is: one home, reachable from everywhere. Every existing importer of
 * `SCENE_KEYS`/`sceneRegistered` from `game/boot.ts` keeps working unchanged.
 */
export { SCENE_KEYS, sceneRegistered, type SceneKey } from "./scene-keys";

import { SCENE_KEYS, sceneRegistered } from "./scene-keys";

/** The `<div id="game">` in index.html. */
export const GAME_PARENT_ID = "game";

/* ────────────────────────────────────────────────────────────────────────────
 * Content validation (the zod gate — build-doc §7, "fail loud on drift")
 * ──────────────────────────────────────────────────────────────────────────── */

export type ContentLoad =
  | { ok: true; content: Content }
  | { ok: false; error: ContentValidationError | Error };

let cachedLoad: ContentLoad | null = null;

/**
 * Run `core/schemas.ts` `validateContent()` once and remember the answer.
 *
 * Memoised because validation is the boot cost (build-doc §12 budgets boot at < 3s) and because a
 * second call that somehow disagreed with the first would be far worse than a slow one.
 */
export function loadContent(): ContentLoad {
  if (cachedLoad) return cachedLoad;
  try {
    cachedLoad = { ok: true, content: validateContent() };
  } catch (err) {
    cachedLoad = { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
  return cachedLoad;
}

/** Test/tooling affordance — drop the memo so a fresh validation runs. */
export function resetContentCache(): void {
  cachedLoad = null;
}

/** The issue list behind a failed load, exactly as `core/schemas.ts` collected it — one per FILE. */
export function contentIssues(error: Error): string[] {
  if (error instanceof ContentValidationError) return error.issues;
  return [error.message];
}

/**
 * zod's prettifier marks each individual problem with this. `core/schemas.ts` `parseOrCollect`
 * pushes ONE string per file containing all of them, so it is the only thing that separates
 * "species.json failed" from "species.json failed in five places".
 */
const PROBLEM_MARK = "✖";

/**
 * One entry per PROBLEM, not per file — what a reader counts when they look at the screen.
 *
 * WHY THIS EXISTS. `core/schemas.ts` collects issues per file: five bad `metamorphic` values in
 * `species.json` are one entry, so the boot screen printed "1 issue" above a list of five ✖ lines.
 * On the one screen whose entire job is to be readable, the headline number disagreed with what was
 * under it, and a reviewer reads that number first. `core/` is not this lane's to change and the
 * per-file grouping is right for a thrown Error's message, so the SPLIT lives here, at the boundary
 * between the collector and the thing that displays it.
 *
 * Each problem keeps its file label ("species.json: ✖ …") so an entry still says where it came
 * from, and its `→ at <path>` continuation is folded onto the same line so one entry is one line.
 * Anything with no ✖ in it — a plain `Error`, a cross-file invariant message written by
 * `core/schemas.ts` itself — passes through untouched.
 */
export function contentProblems(error: Error): string[] {
  const out: string[] = [];
  for (const issue of contentIssues(error)) {
    const at = issue.indexOf(PROBLEM_MARK);
    if (at < 0) {
      out.push(issue);
      continue;
    }
    const label = issue.slice(0, at);
    const parts = issue
      .slice(at)
      .split(PROBLEM_MARK)
      .map((part) => part.replace(/\s*\n\s*/g, " ").trim())
      .filter((part) => part.length > 0);
    if (parts.length === 0) out.push(issue);
    else for (const part of parts) out.push(`${label}${PROBLEM_MARK} ${part}`);
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Phaser config (build-doc §7.6)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface Viewport {
  width: number;
  height: number;
}

function rawViewport(): Viewport | null {
  const map = (balanceJson as { map?: { virtualWidth?: unknown; virtualHeight?: unknown } }).map;
  const width = map?.virtualWidth;
  const height = map?.virtualHeight;
  if (typeof width !== "number" || typeof height !== "number") return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  return { width, height };
}

/** Floor below which a zoom is not a zoom — guards a degenerate window from producing 0. */
const MIN_ZOOM = 0.001;

/**
 * build-doc §7.6 — "Virtual resolution 480×320, integer-scaled."
 *
 * INTEGER scaled, not fitted: Phaser's `Scale.FIT` produces a fractional zoom, which on a pixel-art
 * game turns a 1px border into a 1.37px border and makes every second row of pixels a different
 * height. So the scale mode is NONE and the zoom is a whole number chosen to fit the window —
 * **wherever a whole number that fits exists.**
 *
 * BELOW THE VIRTUAL RESOLUTION IT DOES NOT. The smallest integer is 1, and a zoom of 1 in a window
 * narrower than 480 draws a canvas wider than the window; `index.html` sets `overflow:hidden` on
 * html/body, so the excess is not scrolled to, it is CUT OFF — on a 375px phone viewport the right
 * 105px of every screen, including whatever the layout put there, is unreachable. The old
 * `Math.max(1, …)` clamp made that the guaranteed behaviour for every window under 480×320.
 *
 * So: an integer at or above 1, and below that the largest scale that FITS. A softly downscaled UI
 * is still a UI; a clipped one is not there at all. The fraction is floored to 1/1000 so rounding
 * can never push the canvas back over the window edge it was computed to stay inside.
 */
export function canvasZoom(viewport: Viewport): number {
  const g = globalThis as { innerWidth?: number; innerHeight?: number };
  const w = typeof g.innerWidth === "number" && g.innerWidth > 0 ? g.innerWidth : viewport.width;
  const h = typeof g.innerHeight === "number" && g.innerHeight > 0 ? g.innerHeight : viewport.height;
  const fit = Math.min(w / viewport.width, h / viewport.height);
  if (!Number.isFinite(fit) || fit <= 0) return 1;
  if (fit >= 1) return Math.floor(fit);
  return Math.max(MIN_ZOOM, Math.floor(fit * 1000) / 1000);
}

/**
 * Build the game config, or render a fatal error into the page and return null.
 *
 * Returning null rather than throwing keeps `main.ts` a straight line and guarantees that the ONE
 * thing a player sees when boot fails is a readable message, never an empty black rectangle.
 */
export function createGameConfig(
  P: typeof PhaserNS,
  scenes: readonly PhaserNS.Types.Scenes.SceneType[],
): PhaserNS.Types.Core.GameConfig | null {
  const viewport = rawViewport();
  if (!viewport) {
    renderFatalError(
      "data/balance.json is missing map.virtualWidth / map.virtualHeight",
      ["The canvas size is read from balance.json (build-doc §7.6); without it there is nothing to size the game to."],
    );
    return null;
  }

  return {
    type: P.AUTO,
    parent: GAME_PARENT_ID,
    width: viewport.width,
    height: viewport.height,
    // §7.6 — pixel art, no antialiasing. `pixelArt: true` sets nearest-neighbour filtering; the
    // other two are stated explicitly so a future config edit cannot quietly turn them off.
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    disableContextMenu: true,
    scale: {
      mode: P.Scale.NONE,
      width: viewport.width,
      height: viewport.height,
      zoom: canvasZoom(viewport),
      // NO_CENTER, deliberately: index.html centres `#game` with `place-items:center`, and Phaser's
      // own centring works by setting margins on the canvas — the two compose into an offset canvas
      // sitting off to one side, which is exactly what CENTER_BOTH looked like here.
      autoCenter: P.Scale.NO_CENTER,
    },
    scene: [...scenes],
  };
}

/** Keep the zoom correct as the window changes size — including when it shrinks below 480×320. */
export function attachCanvasScale(game: PhaserNS.Game, viewport: Viewport): void {
  const g = globalThis as { addEventListener?: (t: string, fn: () => void) => void };
  g.addEventListener?.("resize", () => {
    game.scale.setZoom(canvasZoom(viewport));
  });
}

/** The virtual resolution the game runs at, or null if balance.json cannot supply it. */
export function viewport(): Viewport | null {
  return rawViewport();
}

/* ────────────────────────────────────────────────────────────────────────────
 * The fatal-error page (used only when there is no canvas to draw on)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Fail loud in the DOM. Reached only when the game could not be constructed at all; every failure
 * after that point is drawn in-canvas by BootScene, which is nicer to look at and easier to read at
 * the virtual resolution.
 */
export function renderFatalError(headline: string, lines: readonly string[]): void {
  const doc = (globalThis as { document?: Document }).document;
  // The console is the loud half (it survives a page with no DOM at all); the panel below is the
  // readable half.
  console.error(`[trophic] ${headline}\n${lines.join("\n")}`);
  if (!doc) return;
  const host = doc.getElementById(GAME_PARENT_ID) ?? doc.body;
  if (!host) return;
  host.textContent = "";

  const wrap = doc.createElement("div");
  wrap.setAttribute(
    "style",
    "font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#f4e9e9;" +
      "background:#2a1414;border:2px solid #e05a4a;padding:16px;max-width:900px;" +
      "max-height:80vh;overflow:auto;text-align:left;white-space:pre-wrap;",
  );
  const h = doc.createElement("strong");
  h.setAttribute("style", "display:block;color:#ff8b7a;margin-bottom:8px;");
  h.textContent = `TROPHIC failed to start — ${headline}`;
  wrap.appendChild(h);
  wrap.appendChild(doc.createTextNode(lines.join("\n")));
  host.appendChild(wrap);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Starting and resuming a run
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Where a new game begins.
 *
 * DERIVED, not typed in: the first gym's town is the first town (build-doc §15 / bible §6 put the
 * vertical slice at Hearthollow → R1 → Brackwater, and `gyms.json`'s first entry is that town's
 * leader). Reading it from content keeps INV-2 true — moving the start of the game is a data edit —
 * and keeps a town name out of code, which G2 cares about. The fallback is the first node, so a
 * content set with no gyms still boots.
 */
export function startNodeId(content: Content): string {
  const firstGym = content.gyms[0];
  if (firstGym && content.nodes.some((n) => n.id === firstGym.town)) return firstGym.town;
  const firstNode = content.nodes[0];
  if (firstNode) return firstNode.id;
  throw new Error("content has no nodes — there is nowhere to start");
}

/**
 * The seed a new game runs on.
 *
 * `balance.rng.defaultSeed` by default, so a new game is REPRODUCIBLE: the cascade demo
 * (build-doc §1 beat 1, §15 I2) and any bug report are worth much more when the same actions
 * produce the same run. `?seed=N` overrides it for the harness, for demo takes, and for anyone who
 * wants a different region.
 */
export function requestedSeed(balance: Balance): number {
  const loc = (globalThis as { location?: { search?: string } }).location;
  const search = loc?.search;
  if (typeof search === "string" && search.length > 1) {
    const raw = new URLSearchParams(search).get("seed");
    if (raw !== null) {
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n) && Number.isSafeInteger(n)) return n;
    }
  }
  return balance.rng.defaultSeed;
}

/**
 * Whether this run was asked for the DIAGNOSTIC readout — `?debug=1`.
 *
 * ⚠ DEFAULT OFF, AND THAT IS THE WHOLE POINT. The overworld's text HUD had grown into a ~25-line
 * readout — tile coordinates, the per-line population table, asset paths, blocked-cell counts, tick
 * prices — painted unconditionally at depth 100 over a 480×320 screen, i.e. over the game. On the
 * deployed build it covered most of the play area. The readout is worth keeping and it is restored
 * IN FULL by this flag; what it may not do is stand between a player and the map by default.
 *
 * Same mechanism and same shape as {@link requestedSeed} — one `URLSearchParams` read of
 * `location.search`, guarded so a headless run (no `location`) is simply "not asked for". Anything
 * but `0`/`false` counts as asked, so `?debug`, `?debug=1` and `?debug=true` all work; the
 * documented form is `?debug=1`.
 */
export function diagnosticsRequested(): boolean {
  const loc = (globalThis as { location?: { search?: string } }).location;
  const search = loc?.search;
  if (typeof search !== "string" || search.length <= 1) return false;
  const raw = new URLSearchParams(search).get("debug");
  return raw !== null && raw !== "0" && raw !== "false";
}

/** The slot API bound to the live storage + balance. */
export function saveStorage(): SaveStorage {
  return new SaveStorage(registry.storage(), registry.balance());
}

export interface StartResult {
  ok: boolean;
  /** Non-null when the run started but could not be persisted (quota, private browsing…). */
  warning: string | null;
  /** Non-null when the run did not start at all. */
  error: string | null;
}

export interface NewGameOpts {
  slot: number;
  seed?: number;
  /**
   * The opening beat (Lane C7) hands the starter in here. When it is absent, {@link startNewGame}
   * seeds `provisionalStarter` (game/wild-battle.ts) instead of leaving the party EMPTY — see
   * {@link startingParty}.
   */
  party?: OwnedCreature[];
}

/**
 * The party a new run begins with.
 *
 * WHY THIS IS NOT JUST `opts.party ?? []`. An empty party is not a neutral starting state: a wild
 * encounter cannot become a battle without a creature to send out, so `[]` made build-doc §1's first
 * never-cut beat — over-catch a prey line in year 1, open year 2 with its predator gone —
 * unreachable by playing the game at all. Nothing in the shipped flow ever passed a party:
 * `MenuScene` calls `startNewGame({ slot })`.
 *
 * So a run with no supplied party gets the STAND-IN starter, which is derived from
 * `data/species.json`'s `"starter"` habitat sentinel and named nowhere in code (G2). It is a
 * placeholder in the same sense the flat coloured rectangles are, and lane C7's opening beat
 * replaces it by passing `opts.party` — at which point this branch is simply not taken.
 */
export function startingParty(content: Content, supplied?: OwnedCreature[]): OwnedCreature[] {
  if (supplied && supplied.length > 0) return supplied;
  const standIn = provisionalStarter(content);
  if (!standIn) return supplied ?? [];
  console.info(
    `[trophic] no opening beat yet — seeding the PROVISIONAL starter ${standIn.lineId} ` +
      `(uid "${standIn.uid}", L${String(standIn.level)}). Lane C7's opening beat replaces this by ` +
      `passing startNewGame({ party }).`,
  );
  return [standIn];
}

/**
 * build-doc §4 step 1 — seed a new game: an RNG seed plus a live copy of every node JSON.
 *
 * The node-state copy is `core/save.ts` `newSave`'s job and is NOT restated here; a second
 * implementation of "node file → live sim state" is exactly the class of duplication that makes the
 * live path and the replay path disagree about a count.
 */
export function startNewGame(opts: NewGameOpts): StartResult {
  const content = registry.content();
  const balance = content.balance;
  const seed = opts.seed ?? requestedSeed(balance);

  let save: SaveEnvelope;
  try {
    const party = startingParty(content, opts.party);
    save = newSave(
      {
        seed,
        currentNode: startNodeId(content),
        nodes: content.nodes,
        ...(party.length > 0 ? { party } : {}),
      },
      balance,
    );
  } catch (err) {
    return { ok: false, warning: null, error: `Could not start a new game: ${describeError(err)}` };
  }

  const streams: RngStreams = openStreams(save, balance);
  const written = saveStorage().write(opts.slot, save, streams);
  registry.startSession({ slot: opts.slot, save, streams });
  return { ok: true, warning: written.ok ? null : written.message, error: null };
}

/** Resume a slot: read it, reopen its RNG streams where it left them (build-doc §8.1). */
export function continueGame(slot: number): StartResult {
  const balance = registry.balance();
  const status = saveStorage().read(slot);
  if (status.state !== "ok" || !status.save) {
    return { ok: false, warning: null, error: status.message };
  }
  const streams = openStreams(status.save, balance);
  registry.startSession({ slot, save: status.save, streams });
  return { ok: true, warning: null, error: null };
}

/** Persist the run in progress, streams and all. Never throws. */
export function saveSession(): WriteResult {
  const session = registry.session();
  return saveStorage().write(session.slot, session.save, session.streams);
}

/** Install storage + settings into the registry. Returns the storage warning, if any. */
export function installStorage(): string | null {
  const opened = openBrowserStorage();
  registry.setStorage(opened.storage);
  registry.setSettings(loadSettings(opened.storage));
  return opened.message;
}

/** Change the settings and persist them. */
export function applySettings(next: Settings): WriteResult {
  registry.setSettings(next);
  return saveSettings(registry.storage(), registry.settings());
}

/* ────────────────────────────────────────────────────────────────────────────
 * Routing
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The data the overworld needs to run THIS session rather than a fresh one.
 *
 * `OverworldScene.init` treats every field as optional and falls back to `validateContent()` plus a
 * brand-new `newSave` at `balance.rng.defaultSeed` when they are absent. That fallback is right for
 * the scene (it can be driven standalone) and catastrophic for the router: starting it with no data
 * after CONTINUE would drop the player into a year-1 region wearing the slot number of the save they
 * asked for. Everything below is therefore explicit.
 *
 * `streams` is the SAME object the session holds, not a copy, so `saveSession()` captures the RNG
 * positions the overworld has actually drawn to (build-doc §8.1).
 */
function overworldData(): OverworldSceneData {
  const session = registry.session();
  return {
    content: registry.content(),
    save: session.save,
    streams: session.streams,
    startNode: session.save.currentNode,
    hooks: {
      // The scene hands back a NEW save on every change (core/ is pure). Adopting it here is what
      // keeps the in-run menu's SAVE row, the survey and the epilogue reading the same numbers the
      // player is walking around in. It deliberately does NOT write to storage on every tick —
      // saving is a thing the player asks for, and a silent autosave would make the SAVE row a lie.
      onSaveChanged: (save: SaveEnvelope) => registry.setSave(save),
      /*
       * NO `onEncounter` HERE, and that is now the correct state rather than the defect it was.
       * `OverworldHooks.onEncounter` used to be the only route from a wild encounter to a battle,
       * and nothing supplied it — so in the routed game an encounter flashed a banner and ended,
       * `save.nodeStates` never moved from play, and build-doc §1's first never-cut beat could not
       * be produced by playing. `OverworldScene.beginWildBattle` is that route now (through
       * `game/wild-battle.ts`, which is where the catch reaches the survey), and the hook is an
       * override for a lane that wants to take the hand-off over. Supplying one HERE would switch
       * the real wiring off, which is exactly backwards.
       */

      /*
       * ⚠ C7'S EPILOGUE SURVEY. THIS HOOK HAD NO SUPPLIER ANYWHERE IN `game/`.
       *
       * `OverworldScene` declares `onRunComplete`, fires it in exactly one place, and every
       * supplier in the repo was a TEST — so reaching the Sanctum and beating Greaves produced
       * `flashBanner("run complete · …")` and nothing else. `core/ecosim.ts` `projectRegion`, whose
       * own header names it as "Hard Req 7 — the epilogue survey shows the numbers", had zero
       * callers outside a property test, and `game/scenes/SurveyScene.ts`'s header says "the
       * epilogue launches THIS scene with `projectRegion`'s output" while the only launcher in the
       * repo was the in-run menu, handing it LIVE state. The never-cut item is "the Vellsire choice
       * + epilogue survey": the choice shipped, the survey was a hook with test-only consumers.
       *
       * The projection is `game/finale.ts`'s — pure, injected RNG, no `Math.random` (G11); this is
       * only the wiring. `states` is a plain record rather than a function ON PURPOSE: it is a
       * SNAPSHOT of a projected future, not the live sim, so it must not be re-read.
       */
      onRunComplete: (save: SaveEnvelope, overworld: OverworldScene) => {
        registry.setSave(save);
        const content = registry.content();
        /*
         * ASK BEFORE LAUNCHING — and this guard is not boilerplate, it is what stops the repair
         * below from being worse than the defect. `ScenePlugin.launch` on an unregistered key is a
         * `console.warn` and a silent no-op; the `pause()` two lines further down is not. Together
         * they would freeze the player in an overworld with NOTHING drawn over it and no key that
         * does anything, which is a hard lock rather than a dead ESC. The ending is reported missing
         * instead. (`game/scenes/OverworldScene.ts` `beginYearTurn` and
         * `game/scenes/YearTurnScene.ts`'s retirement hand-off ask the same question first.)
         */
        if (!sceneRegistered(overworld, SCENE_KEYS.survey)) {
          console.warn(
            `[boot] the run finished and "${SCENE_KEYS.survey}" is not registered in game/main.ts — ` +
              "there is no epilogue survey to show",
          );
          return;
        }
        const states = projectEpilogueRegion({
          content,
          save,
          // A named subsystem stream off the save's own seed: the ending replays identically (L10).
          rng: subsystemRng(save.seed, EPILOGUE_STREAM),
        });
        const data: SurveySceneData = {
          content,
          states,
          /*
           * ⚠ THE SAVE'S YEAR, ON PURPOSE, AND IT REACHES NOTHING THE PLAYER READS. `page.year` is
           * printed by `game/survey-view.ts` `renderSurveyHeader` — which `renderSurveyHeading`
           * does NOT call for a titled page, and the epilogue is the only titled caller — and by
           * `game/web-view.ts` `renderWebPage`, which no scene calls (`SurveyScene.drawWeb` draws
           * `renderWebTotals`, and that line carries no calendar). It is otherwise only matched
           * against a season history, and the ending passes none. So the ending prints no year at
           * all, and the field is left saying where the RUN ended rather than being quietly moved
           * to a year nothing has decided how to report — commit 9454725 took the heading's year
           * off the screen for that reason and left the question open. The season below is the half
           * that DOES reach the player, and it is not left open; {@link epilogueSeason} says why.
           */
          year: save.year,
          /*
           * ⚠ THE PROJECTION'S SEASON, NOT THE SAVE'S — AND THE SAVE'S WAS A LIVE FALSEHOOD.
           *
           * This read `seasonOf({ year: save.year, tick: save.tick, … })`: the season the player
           * happened to finish in, stamped over numbers `projectEpilogueRegion` had already carried
           * `balance.clock.yearsTotal` years past it. Measured on the shipped balance, four saves
           * differing ONLY in `tick`: one projection, byte-identical to the sha (`e92439aeee1d`,
           * 1217 individuals across the twelve nodes) — and four different labels, spring through
           * winter.
           *
           * It is not a cosmetic label. `SurveySceneData.season` is what `buildSurveyPage` builds
           * the page FROM: `effectiveRates` runs `core/ecosim.ts` `step` in that season for the
           * `breed` column, and `migrantStatus` decides from it which lines read `dormant` /
           * `migrating` / `window <season>`. The same four saves rendered four DIFFERENT twelve-node
           * pages over the one set of counts — a player finishing in spring read `Reedrick …
           * migrating` where a player finishing in winter read `Reedrick … dormant`, off the same
           * number. Hard Req 10's whole point is that those words are a calendar fact.
           *
           * Commit 9454725 met the same problem on the heading and dropped the year rather than
           * stamp `save.year` over year-12 numbers; it left the season stamped. This is that ruling
           * carried through to the half that actually reaches the player.
           */
          season: epilogueSeason(content.balance),
          startNodeId: save.currentNode,
          title: EPILOGUE_SURVEY_TITLE,
          /*
           * ⚠ THIS WAS ABSENT, AND ITS ABSENCE WAS THE END OF THE RUN.
           *
           * `SurveySceneData.onClose` used to be optional and this object did not carry one, so
           * `SurveyScene.close()` — the whole of which is the closer — did nothing. The player
           * reached the ending, got a full-screen survey whose own footer advertises ESC, and could
           * not leave it. Build-doc §16 lists "Vellsire choice + epilogue survey" as never-cut.
           *
           * WHERE "CLOSED" GOES, AND WHY IT IS THE OVERWORLD RATHER THAN THE TITLE. The run being
           * complete does not end the world: `maybeCompleteRun` is latched in the SAVE, the clock
           * keeps running, and the region is still there to walk, catch in and survey. Routing to
           * the title would mean `returnToTitle` → `registry.endSession()`, i.e. reading the ending
           * would silently discard a run the player had not saved — an ending that deletes your game
           * is a worse failure than one you cannot dismiss. Back to the region cannot strand anyone:
           * ESC there opens the in-run menu, which is where SAVE and BACK TO TITLE live, so the
           * player chooses when the run is over. If a credits screen is ever built (bible §12 lists
           * "Ending / credits" as one row), THIS is the line it replaces.
           */
          onClose: () => {
            overworld.scene.stop(SCENE_KEYS.survey);
            overworld.scene.resume();
          },
        };
        /*
         * `launch` then `pause` — the ONE hand-off protocol this codebase has, and the epilogue was
         * the only full-screen hand-off that did not follow it (`handOffToBattle`, `playEntry` and
         * `beginYearTurn` in `game/scenes/OverworldScene.ts` are the other three; each is
         * `launch(key, data)` → `pause()`, and each comes back `stop(key)` → `resume()`).
         *
         * THE PAUSE IS NOT COSMETIC. `Phaser.Input.Keyboard.KeyboardPlugin.isActive()` is
         * `enabled && scene.sys.canInput()`, and a paused scene answers `canInput()` false — so
         * without it the overworld keeps its own keys while the survey is up, and the two that
         * collide are the two that matter: the arrows walk the player around underneath the ending,
         * and ESC reaches `bindSessionMenuKey`'s handler, which calls `scene.start(Menu)` and
         * SHUTS THE OVERWORLD DOWN out from under the survey that was trying to close onto it.
         *
         * There is no latch on the overworld to match `battleRunning`/`yearTurnRunning`/
         * `dialogueRunning`, and none is needed HERE: the two callers of `maybeCompleteRun` both
         * reach it with the screen already back in the overworld's hands (`finishDialogue` after
         * `scene.stop(Dialogue)` and `dialogueRunning = false`; the year turn's `finish` after its
         * `onDone` resumed), and at `sanctum` no autoplay cutscene survives `story.epilogue.shown`,
         * so nothing stacks a box on top of this. A latch would have to live in `OverworldScene`,
         * which is not this module's file to write.
         */
        overworld.scene.launch(SCENE_KEYS.survey, data);
        overworld.scene.pause();
      },
    },
  };
}

/**
 * The RNG stream the epilogue's projection is drawn from.
 *
 * A named subsystem stream, so the ending is reproducible from the save's seed alone and does not
 * consume draws the overworld's own streams are positioned on (build-doc §8.1 / L10).
 */
const EPILOGUE_STREAM = "epilogue";

/**
 * What the epilogue survey calls ITSELF — `SurveySceneData.title` (Hard Req 7).
 *
 * ⚠ IT IS A PREFIX, NOT THE HEADING, and it used to be the heading. `SurveyScene.redraw` drew
 * `this.args.title ?? renderSurveyHeader(page)`, so passing this string REPLACED the one line on the
 * screen that prints a node's name: every one of the ending's twelve pages read `EPILOGUE SURVEY`
 * and nothing else, the Sanctum among them. `game/survey-view.ts` `renderSurveyHeading` composes the
 * two now, so a title cannot take a node's name off the screen from here.
 */
const EPILOGUE_SURVEY_TITLE = "EPILOGUE SURVEY";

/**
 * The season the epilogue's numbers stand in — read off the projection, never off the save.
 *
 * **The rule the whole survey is built on: the season on a page is the one the sim has NOT yet
 * stepped.** `game/scenes/OverworldScene.ts` `handleClockEvents` steps `event.seasonEnded` and the
 * clock then reads the season that has begun, so an in-run survey shows the counts as they stand at
 * the START of the season it names, and `buildSurveyPage` previews that season's breed rates and
 * flags who is out of window for it. Both halves of the page mean "now", not "just gone".
 *
 * So: `game/finale.ts` `epilogueSeasons` publishes the seasons the projection steps —
 * `balance.clock.yearsTotal` × `balance.clock.seasonOrder`, spring through winter, six times over on
 * the shipped balance — and the state that comes back has had the last of them applied. The season
 * it stands in is therefore the NEXT one in the order, which is what the modulo returns. Nothing is
 * spelled out here: change `yearsTotal`, `seasonOrder` or the horizon itself and this follows (G11).
 *
 * **It cannot come off the save, and that is the point rather than a simplification.** The
 * projection's own calendar begins at `seasonOrder[0]` no matter where the player stopped — which is
 * why four saves differing only in `tick` produce ONE set of counts — so the save's season is not a
 * fact about these numbers at all. It was being printed as one; see `onRunComplete`.
 *
 * OPEN, AND NOT DECIDED HERE: whether `epilogueSeasons` should begin at the player's own season
 * instead of always at `seasonOrder[0]`, and whether an ending should print a calendar at all. Both
 * belong to whoever owns that horizon — this function reports where the projection lands, it does
 * not choose where it should start, and neither question can make what it returns untrue.
 */
export function epilogueSeason(balance: Balance): Season {
  const order = balance.clock.seasonOrder;
  const stepped = epilogueSeasons(balance).length;
  // seasonOrder is schema-guaranteed non-empty; this keeps noUncheckedIndexedAccess honest, the same
  // way `core/clock.ts` `seasonAt` does.
  return order[stepped % order.length] ?? (order[0] as Season);
}

/** Scenes are started with `unknown` data; this is the shape the menu keys off. */
const SESSION_MENU_REQUEST = { mode: "session" } as const;

/**
 * Hand control to gameplay.
 *
 * Falls back to the in-run menu — which says plainly that the overworld is not registered — rather
 * than calling `scene.start` on a key Phaser answers with a `console.warn` and a silent no-op.
 */
export function enterGameplay(scene: PhaserNS.Scene): void {
  if (!sceneRegistered(scene, SCENE_KEYS.overworld) || !registry.hasSession()) {
    scene.scene.start(SCENE_KEYS.menu, SESSION_MENU_REQUEST);
    return;
  }
  bindSessionMenuKey(scene.scene.get(SCENE_KEYS.overworld));
  scene.scene.start(SCENE_KEYS.overworld, overworldData());
}

/**
 * ESC in the overworld opens the in-run menu.
 *
 * It is bound from here rather than in the scene because the menu is C1's screen and the overworld
 * is C2's: without it the app is a one-way street — the player reaches the region and can never save,
 * read the survey or leave. `OverworldScene` binds W/A/S/D, the arrows, C and 1–6, so ESC is free.
 *
 * Bound on the scene's own `create` (Phaser tears the keyboard's listeners down on shutdown and
 * re-runs `create` on the next start, so a one-shot binding survives exactly one visit) and guarded
 * by a WeakSet so repeated routing cannot stack handlers.
 */
const menuKeyBound = new WeakSet<object>();

/**
 * The overworld as this module needs it: a scene, which may also be able to say whether it has
 * handed the screen over.
 *
 * OPTIONAL BECAUSE `ScenePlugin.get` ANSWERS WITH A BARE `Scene`, not because the answer is
 * optional in the real game — `game/main.ts` registers `OverworldScene` under that key and nothing
 * else can be there. Absence therefore means "not the overworld", and the handler below treats it
 * as "not handed over" rather than refusing: see the ⚠ on the guard for which way this fails.
 */
type HandOffAwareScene = PhaserNS.Scene & Partial<Pick<OverworldScene, "isHandedOver">>;

function bindSessionMenuKey(overworld: HandOffAwareScene | undefined): void {
  if (!overworld || menuKeyBound.has(overworld)) return;
  menuKeyBound.add(overworld);
  overworld.events.on("create", () => {
    overworld.input.keyboard?.on("keydown-ESC", () => {
      /*
       * ⚠ THE ONE FRAME THIS KEY IS LIVE AND MUST NOT ACT. Every other overworld key is polled in
       * `OverworldScene.update`, which spends the whole of that frame draining a queued beat and
       * `return`s before reading any of them (see `pendingEntry`). ESC is not polled — it is an
       * InputPlugin listener, so it bypasses that early return entirely and is the only key that
       * can reach the scene during the drain frame.
       *
       * It was safe until the party-wipe softlock was fixed (`9e3e4e7`). `DialogueScene.finish()`
       * is `onDone(state)` then `scene.stop()`, and `ScenePlugin` calls are applied as a FIFO
       * queue, so a beat chained from inside `onDone` was queued AHEAD of the closing box's own
       * teardown and shut down the frame it opened. The fix holds a latch across `onDone` and
       * queues the next beat for the following frame — which buys exactly one frame in which the
       * overworld is RESUMED with a beat not yet on screen. A paused scene answers
       * `KeyboardPlugin.isActive()` false and that is what used to disarm this handler; for that
       * one frame nothing does. ESC there would `scene.start(Menu)` the overworld out from under
       * a beat that has been asked for and never opened — and on the blackout path that beat is
       * the wake at the inn, so the player would be charged the recovery and never receive it.
       *
       * IGNORED, NOT DEFERRED. Deferring would need a second queue beside `pendingEntry`, and two
       * authorities on what happens next is the shape of the defect this is guarding: one frame of
       * disagreement between them is what the softlock was. The cost of ignoring is one keypress
       * inside a window no player can aim at, after which ESC works normally.
       *
       * `isHandedOver()` IS THE SHIPPED PREDICATE and it already covers this window: `playEntry`
       * sets `dialogueRunning` true BEFORE it decides to queue, and nothing lowers it until the
       * box opens, so a queued beat always reads as handed over. Asking the scene the question it
       * already answers for [R], [C], [E], [G] and 1–6 is the point — a second spelling here would
       * be a second thing to keep in step.
       */
      if (overworld.isHandedOver?.()) return;
      overworld.scene.start(SCENE_KEYS.menu, SESSION_MENU_REQUEST);
    });
  });
}

/** Leave the run and go back to the title. */
export function returnToTitle(scene: PhaserNS.Scene): void {
  registry.endSession();
  scene.scene.start(SCENE_KEYS.title);
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
