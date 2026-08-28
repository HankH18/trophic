/**
 * game/ui/SignChains.ts — which sign-chain-gated lines a save has unlocked.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE DEFECT THIS EXISTS TO CLOSE, AND IT WAS ON SCREEN
 * ─────────────────────────────────────────────────────────────────────────────
 * `DexSceneData.unlockedSignChains` is declared, `game/scenes/DexScene.ts` honours it,
 * `game/survey-view.ts` threads it into `core/foodweb.ts` — and `game/scenes/MenuScene.ts`, the
 * dex's ONLY supplier, did not fill it in. So the shipped dex printed "not in the wild encounter
 * pool" for all three Ancients on every save forever: for a player who had closed the sign chain,
 * and for a player standing on the animal. The chain work itself was live and correct the whole
 * time — `OverworldScene` derives the same set for the encounter roll, and a driven playthrough
 * closes the Kilnback chain at act 4 and the Undermere chain at act 3 and catches both. One field
 * on one hand-off was missing, and `tests/gates/dex-path-contract.test.ts` could not see it,
 * because that gate binds the KEY GRAMMAR and not the data a caller passes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  WHY IT LIVES HERE, AND WHERE IT SHOULD LIVE
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS NOW THE ONLY SPELLING. It was a second one: `game/scenes/OverworldScene.ts`'s private
 * `unlockedSignChains()` wrote the same flag→line join out again for the ENCOUNTER ROLL. That
 * method is now its finale clause plus a call to {@link unlockedSignChainLines} — the finale node
 * is gated on the finale as well as on the chain (`balance.encounter.finaleGatedNode`), which is a
 * question about a NODE, and a dex entry is not per-node, so that ONE clause stays in the scene and
 * must never arrive here.
 *
 * `game/quests.ts` is the home this file eventually wants — it already owns the chain flags'
 * lifecycle — and it was outside the file scope of the change that found the defect, so the rule
 * sits in `game/ui/`, this project's PHASER-FREE view-model half (`BattleLayout.ts`'s header states
 * the standard: "a layout nobody can test headlessly is a layout that is checked by looking at
 * it"). That is a real gain over parking it in a scene: a node test imports this with no `vi.mock`.
 *
 * ⚠ WHAT BINDS THE TWO IS `tests/unit/overworld-scene.test.ts` §22, NOT
 * `tests/unit/ui-frame-panel.test.ts` §7. §7's "BINDS" case calls `unlockedSignChainsOf` twice
 * under two names and never mounts the overworld, so it agrees with ITSELF and stayed green when
 * the scene's copy was deliberately drifted (`line.id === stem` in place of `startsWith`). §22
 * mounts the real scene and reads `forayContext()` — the set the running game actually rolls
 * against — so a third answer growing in the scene reddens there.
 *
 * ENGINE: no Phaser import of any kind, not even a type one.
 */

import type { Balance, Content, SaveFile, SpeciesLine } from "../../core/types";

/** `data/dialogue.json` writes `chain.<name>.complete` at the last step of each sign chain. */
const CHAIN_FLAG_PREFIX = "chain.";
const CHAIN_COMPLETE_SUFFIX = ".complete";

/**
 * The gated lines a set of quest flags unlocks (bible §4 gates the Ancients behind sign chains).
 *
 * DERIVED, never typed: no species id and no chain id appears here. Which lines are gated comes
 * from `balance.encounter.signChainGatedHabitatTag` against the shipped roster, and the join from a
 * completion flag to a line is the flag's own middle segment against the shipped species ids
 * (`chain.undermere.complete` → the gated line whose id starts `undermere`) — the same join the
 * overworld makes. So a renamed line follows the data (G2) and the species-name gate in
 * `tests/property/foodweb.test.ts` stays satisfiable.
 *
 * A flag that is present but not exactly `true`, and a step flag from the same chain, both unlock
 * nothing: `questFlags` carries booleans, numbers and strings, and `chain.x.step1` is not
 * `chain.x.complete`.
 */
export function unlockedSignChainLines(
  questFlags: Readonly<Record<string, boolean | number | string>>,
  species: readonly SpeciesLine[],
  balance: Balance,
): ReadonlySet<string> {
  const gatedTag = balance.encounter.signChainGatedHabitatTag;
  const gatedLines = species.filter((s) => s.habitat.includes(gatedTag));
  const out = new Set<string>();
  const completed = Object.entries(questFlags)
    .filter(([flag, value]) => value === true)
    .map(([flag]) => flag)
    .filter((flag) => flag.startsWith(CHAIN_FLAG_PREFIX) && flag.endsWith(CHAIN_COMPLETE_SUFFIX))
    .map((flag) => flag.slice(CHAIN_FLAG_PREFIX.length, flag.length - CHAIN_COMPLETE_SUFFIX.length))
    .filter((stem) => stem.length > 0);
  const matches = completed.flatMap((stem) => gatedLines.filter((line) => line.id.startsWith(stem)));
  matches.forEach((line) => out.add(line.id));
  return out;
}

/** {@link unlockedSignChainLines} for a whole save — the shape `MenuScene` has in hand. */
export function unlockedSignChainsOf(save: SaveFile, content: Content): ReadonlySet<string> {
  return unlockedSignChainLines(save.questFlags, content.species, content.balance);
}
