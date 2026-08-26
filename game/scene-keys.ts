/**
 * game/scene-keys.ts — the ONE registry of scene keys, and the one question about them.
 *
 * This used to live inside `game/boot.ts`, which states the rule the file exists for: "Every scene
 * key in one place … so that (a) nobody invents a second spelling, and (b) the menus can ASK whether
 * a scene has been registered yet and behave honestly when it has not."
 *
 * WHY IT MOVED. `game/boot.ts` imports Phaser at module scope, and Phaser cannot be imported under
 * vitest's node environment (`ReferenceError: window is not defined` from phaser/src/device/OS.js).
 * Every engine-free scene module — the year-turn and retirement scenes are built by a factory that
 * takes the engine as an argument, precisely so their logic stays reachable from a node test — was
 * therefore unable to read the registry, and each one declared a private key instead. Two spellings
 * of one name is the exact failure the registry was written to prevent, so the registry moved to a
 * module that has no engine in it (`import type` only) and `game/boot.ts` re-exports it unchanged.
 *
 * The convention is PascalCase, one entry per scene, and a key is declared here BEFORE its scene
 * exists so the menus can route around an unbuilt lane instead of calling `scene.start` on a key
 * Phaser answers with a silent no-op.
 */

import type PhaserNS from "phaser";

export const SCENE_KEYS = {
  boot: "Boot",
  title: "Title",
  menu: "Menu",
  overworld: "Overworld",
  battle: "Battle",
  survey: "Survey",
  /** bible §12's dex, with the migrant flags Hard Req 10 needs (game/scenes/DexScene.ts). */
  dex: "Dex",
  /** The team/creature card, which is where the projected retirement year is read
   * (game/scenes/SummaryScene.ts). */
  summary: "Summary",
  /**
   * build-doc §15 C7 — the Gold text box that plays `data/dialogue.json`
   * (game/scenes/DialogueScene.ts). Declared here BEFORE anything routes to it, which is the point
   * of this registry: `sceneRegistered(scene, SCENE_KEYS.dialogue)` is how the overworld asks
   * whether the box exists before handing it a beat.
   */
  dialogue: "Dialogue",
  /** build-doc §15 C6 — the year turn as a played sequence (game/scenes/YearTurnScene.ts). */
  yearTurn: "YearTurn",
  /** build-doc §1's never-cut Legacy beat (game/scenes/RetirementScene.ts). */
  retirement: "Retirement",
} as const;

export type SceneKey = (typeof SCENE_KEYS)[keyof typeof SCENE_KEYS];

/**
 * The slice of a scene this question needs. Structural so the check is reachable from a scene built
 * by a factory (and from a test driving one with a stub engine) rather than only from a class that
 * extends the real `Phaser.Scene`.
 */
export interface SceneRegistryHost {
  scene: { manager: { keys: Record<string, unknown> } };
}

/**
 * Is a scene registered with this game?
 *
 * ASK THIS BEFORE `scene.start` / `scene.launch`. Phaser answers an unknown key with
 * `console.warn('Scene key not found: ' + key)` and does nothing — which, mid-hand-off, strands the
 * player on whatever was last drawn with the state already moved on.
 */
export function sceneRegistered(scene: PhaserNS.Scene | SceneRegistryHost, key: string): boolean {
  const keys = (scene as SceneRegistryHost).scene.manager.keys as Record<string, unknown>;
  return Object.prototype.hasOwnProperty.call(keys, key);
}
