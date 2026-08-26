/**
 * game/main.ts — the entry point index.html loads.
 *
 * Two jobs and no more: name the scenes, and start the game. The scene LIST lives here so that a
 * later Lane C step adding OverworldScene (C2), BattleScene (C3) or the survey (C4) touches this
 * file and nothing else — `game/boot.ts` deliberately imports no scene, so there is no cycle to
 * unpick and no registration order to get right.
 */

import Phaser from "phaser";

import { attachCanvasScale, createGameConfig, renderFatalError, viewport } from "./boot";
import { warnOnStandIns } from "./placeholder";
import { BattleScene } from "./scenes/BattleScene";
import { BootScene } from "./scenes/BootScene";
import { DexScene } from "./scenes/DexScene";
import { SurveyScene } from "./scenes/SurveyScene";
import { MenuScene } from "./scenes/MenuScene";
import { OverworldScene } from "./scenes/OverworldScene";
import { createRetirementScene } from "./scenes/RetirementScene";
import { SummaryScene } from "./scenes/SummaryScene";
import { TitleScene } from "./scenes/TitleScene";
import { createYearTurnScene } from "./scenes/YearTurnScene";

/**
 * Scene order matters only for the first entry: Phaser starts scene[0]. Everything after it is
 * registered and idle until something calls `scene.start`.
 *
 * ⚠ INTEGRATION SEAM. This list is what `sceneRegistered()` (game/scene-keys.ts) reads, and
 * `enterGameplay()` routes to the in-run menu — saying so on screen — for as long as
 * `SCENE_KEYS.overworld` is absent from it.
 *
 * REGISTERED IS NOT ROUTED, and the difference is stated here rather than implied:
 *   • Boot → Title → Menu → Overworld is routed here and in `game/boot.ts` (`enterGameplay`), which
 *     hands the overworld the LIVE session — its content, its save and its RNG streams. Started with
 *     no data, `OverworldScene.init` falls back to a brand-new save at the default seed, so a
 *     CONTINUE that routed without data would silently discard the slot it had just loaded.
 *   • `Survey`, `Dex` and `Summary` are routed from the in-run menu (game/scenes/MenuScene.ts), each
 *     handed the session's content and its live `nodeStates`.
 *   • `Battle` is DRIVEN BY THE OVERWORLD, not idle: `OverworldScene.beginWildBattle` launches it
 *     with the encounter's `BattleInput`/`BattleContext` (game/wild-battle.ts) and pauses itself;
 *     `finishWildBattle` stops it, resumes, and applies the catch to the survey. Verified live —
 *     r1 loamunder 32 → 31 with `{t:"catch"}` on the action log. Its party is still the PROVISIONAL
 *     starter (game/boot.ts `startingParty`) until build-doc §15 C7's opening beat hands one over.
 *   • `YearTurn` is launched by `OverworldScene.beginYearTurn` on the clock's `yearEnd`, and
 *     `Retirement` by `YearTurnScene` when the turn produces a prompt. Neither is started from here:
 *     a router that fabricated a creature to have something to fight would break G2, and one that
 *     faked a year turn would break G6.
 *
 * ⚠ AND A SCENE THAT IS NOT IN THIS LIST DOES NOT EXIST. `YearTurn` and `Retirement` were built,
 * tested and left unregistered — so build-doc §1's never-cut Legacy beat, and Hard Requirement 6's
 * season tint with it, were reachable from the test suite and from nowhere else. Registering them is
 * what makes every green test in that lane evidence about the running game rather than about pure
 * functions nobody calls. `Overworld` is here for the same reason: it is what STARTS the year turn,
 * and without it `enterGameplay()` routes the player to the in-run menu and the clock never runs.
 *
 * The two year-turn scenes are built by a FACTORY that takes the engine as an argument, because
 * their modules must stay importable from a node test (`import "phaser"` there throws
 * `window is not defined`). Registering them is the same one line either way.
 */
const SCENES: Phaser.Types.Scenes.SceneType[] = [
  BootScene,
  TitleScene,
  MenuScene,
  OverworldScene,
  BattleScene,
  SurveyScene,
  DexScene,
  SummaryScene,
  createYearTurnScene(Phaser),
  createRetirementScene(Phaser),
];

/**
 * Tell the pre-module watchdog in index.html that project code is running.
 *
 * THE FAILURE THIS CLOSES. `data/*.json` are STATIC imports (core/schemas.ts, game/boot.ts,
 * game/placeholder.ts), so a SYNTAX error in one of them breaks the module graph before a single
 * line below executes: the zod gate cannot fire, `renderFatalError` is unreachable, and the page is
 * silently, entirely black — reproduced on the real dev server, where Vite 8's own error overlay
 * also crashed (`…split is not a function`) and printed nothing either. A guard against that cannot
 * live in the module graph that failed to load, so it lives in `index.html` and this line is what
 * disarms it. It must stay at MODULE TOP LEVEL and above `start()`: it is a statement about the
 * graph having loaded, not about the game having started, and the two failures are reported
 * differently (this one has no console line of its own; a failure inside `start()` does).
 */
(globalThis as { __trophicBooted?: boolean }).__trophicBooted = true;

function start(): void {
  // BF-7: the running game says so when it draws a stand-in. Tests deliberately do NOT call this,
  // so the suite reads `standInCensus()` instead of stubbing the console.
  warnOnStandIns(true);
  const config = createGameConfig(Phaser, SCENES);
  // createGameConfig has already rendered the reason into the page.
  if (!config) return;

  try {
    const game = new Phaser.Game(config);
    const view = viewport();
    if (view) attachCanvasScale(game, view);
  } catch (err) {
    renderFatalError("the renderer could not start", [
      err instanceof Error ? err.message : String(err),
      "",
      "A WebGL or Canvas context is required.",
    ]);
  }
}

start();
