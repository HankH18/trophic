# TROPHIC — status

A 2D monster-catching RPG whose region is a living ecosystem: every catch decrements a real per-node
population, the food web is derived from those numbers rather than authored beside them, and the
calendar ages every creature and map underneath the story. **A run is playable end to end today** —
Hearthollow → R1 → Brackwater → R2 on foot, catching off the node's real counts, quests, gyms and
badges, a year turn that ages the party and the box, a retirement that puts an heir in the party,
and the Sanctum with the Vellsire choice and the epilogue survey. Everything on screen is a labelled
placeholder; no generated art and no audio exist yet.

## Verified state

Measured 2026-08-26 against the working tree at `5900b45`, which carries uncommitted work across
`core/`, `game/`, `tools/`, `tests/`, `data/`, `fixtures/` and `docs/`.

- `npx tsc --noEmit` (15:09) — silent. Clean.
- `npm run test` (15:10) — **50 files, 2341 tests, all pass.**
- `npm run build` (15:12) — 158 modules; `dist/assets/index-*.js` 1,728.79 kB (478.64 kB gzipped).
- `python3 tools/prose/prose-lint.py data/dialogue.json` (15:11) — 212 entries, 63 speakers;
  27 control assertions green over 7 structural checks; 3 per-beat advisory flags; **2 corpus
  structural failures** — `G8-ASSERT-CHOP` (9 assert-then-chop uses across 5 speakers against a cap
  of 2) and `G9-SHAPE-SIG` (12 over-cap closing shapes at the CLOSE resolution). Exit 1.
  **Those two figures are moving:** the corpus is under repair for exactly this. Re-run before
  quoting them.

## What is built

| Subsystem | State | Where it lives |
|---|---|---|
| Battle engine | Pure reducer `(state, action, rng) → {state, events[]}`; no Phaser | `core/battle.ts` |
| Ecosystem sim | Per-node integer populations, one clamp, one write path | `core/ecosim.ts` |
| Food web | Diet edges derived from node data; nothing else may compute them | `core/foodweb.ts` |
| Calendar clock | Ticks → seasons → years, unbounded, no cap and no fail state | `core/clock.ts` |
| Act model | Badges + quest flags gate towns, routes, raids, rival, finale | `core/acts.ts` |
| Lifecycle | Aging, retirement, heirs, boxed aging, Cullbrand raids on act entry | `core/lifecycle.ts` |
| Save + replay | Action log replays byte-identically | `core/save.ts`, `tests/property/determinism.test.ts` |
| Content + schemas | 27 species lines (3 Ancients), 28 moves, 6 gyms, 12 nodes; zod-validated at boot | `data/`, `core/schemas.ts` |
| Dialogue corpus | 212 entries, 63 speakers; every entry has a path to the screen | `data/dialogue.json`, `game/dialogue-runner.ts` |
| Quests | Objectives, flag writers, sign chains | `core/quests.ts`, `game/quests.ts` |
| Overworld | Walk, collision, travel, encounters, inn, gym challenge, talk, release | `game/scenes/OverworldScene.ts` |
| Walkable slice | `hearthollow`, `r1`, `brackwater`, `r2`; the other 8 nodes are travel-only | `data/nodes/*.json` `walkable` |
| Battle scene | A replayer over `BattleEvent[]` — it holds no rules | `game/scenes/BattleScene.ts`, `game/ui/` |
| Year turn + retirement | Meter fills → year turn → prompt → heir in the party | `game/scenes/YearTurnScene.ts`, `RetirementScene.ts` |
| Finale | Vellsire choice, both outcomes written and flagged, epilogue survey | `game/finale.ts` |
| Rival | One encounter per act, each with pre/win/loss copy (18 entries + a greeting) | `game/rival.ts`, `data/dialogue.json` |
| Survey | Real per-node counts plus run history | `game/survey-view.ts`, `game/survey-history.ts` |
| Balance harness | Gym sim, type round-robin, full-run cascade, `balance.json` deltas | `tools/harness/` |
| Art pipeline | Comfy Cloud client, batch runner, postprocess, overlay diff; B0 gate passed | `tools/comfy/`, `tools/postprocess/` |
| Palette | 32 positional swatches, frozen 2026-08-25 | `data/palette.json` |
| Placeholders | Every missing asset draws as a labelled, unmistakably unfinished stand-in | `game/placeholder.ts`, `tools/postprocess/placeholder.ts` |
| Prose lint | Structural corpus checks with positive and negative controls | `tools/prose/prose-lint.py` |

## What is open

1. **No art exists.** 288 manifest rows, 0 files on disk; `assets/final/` holds a `.gitkeep`. The B1
   reproduction gate has never been run. — `tools/comfy/manifest.json`, `assets/final/`
2. **No audio exists.** No files, no loader, no `this.sound` call anywhere in `game/`. — `assets/audio/`
3. **The cascade beat is not on the walkable slice.** `fixtures/overcatch-script.json` pins `r4`
   because that is the one shipped node where the apex's sole prey pool is its mesopredator, and
   `r4` is `walkable: false`. At Brackwater/Route 2 the same protocol produces a two-tier collapse
   instead. — `data/nodes/r4.json`, `fixtures/overcatch-script.json`
4. **The Legacy beat is untested against balance.** `retirement.heirLevelFactor` = 0.5 produces a
   measured ~2.1× power drop in the same year as a level-26-plus gym, and the harness has no
   lifecycle, so nothing measures it. A gym run seeded with a post-retirement party is the mode to
   add. — `tools/harness/gym-sim.ts`
5. **`DialogueScene` is not registered in `main.ts`.** `OverworldScene.ensureDialogueScene`
   registers it at runtime as a declared stand-in. — `game/main.ts`
6. **Two wild-trait rollers live outside `core/`.** `game/wild-battle.ts` `rollWildTraits` (read by
   `game/encounters.ts` and `game/finale.ts`) and `tools/harness/player.ts` are draw-for-draw
   identical; `core/` has none. Collapsing them is a delete, not a re-derivation.
7. **`QUEST_OBJECTIVES` is in the wrong file.** Moving it out of `game/quests.ts` needs
   `balance.json` + `Balance` + `zBalance` changed together.
8. **Sign-chain gating derives the line id from the chain id.** `PropPlacement` already carries a
   `signChain` field; the explicit form puts one on `SpeciesLine` too. —
   `game/scenes/OverworldScene.ts`, `core/types.ts`
9. **`balance.encounter.levelByYear` keeps a year name that both readers index by act.** Renaming
   touches `data/balance.json`, `core/types.ts`, `core/schemas.ts` and `tools/harness/`.
10. **Gaps in the battle event union.** `BattleInput`/`battleStart` carry no trainer identity, so a
    gym fight cannot be announced by the leader's name — that sits on a never-cut beat.
    `BattleEvent.damage` carries no attacker (the view infers it), `levelUp` carries no
    maxHp/curHp, and no player-facing refusal copy is authored. — `core/types.ts`
11. **`tools/comfy/manifest.json` carries 9 `_deviations[]` rows whose `mergedAs` ids (`B-D54`…
    `B-D62`) index a ledger this repo no longer keeps.** Each row's own `finding` and `action` text
    is self-contained, so the field is dead provenance: keep it or strip it.

## What is next

Ordered by what the two never-cut demo beats need first:

1. **Run the B1 reproduction gate** (build-doc §15, Lane B) — one asset per pixel class reproduced
   from `manifest.json` byte-identically. Nothing multi-version starts before it passes, and every
   frame of the demo video is a placeholder until it does.
2. **Get `r4` ruled, then put the cascade beat on the walkable slice.** It is a content question and
   only Hank may answer it (G2); `fixtures/overcatch-script.json` and
   `tests/integration/demo-beats.test.ts` follow the answer.
3. **Give the harness a lifecycle mode** so the Legacy beat is measured rather than asserted — a gym
   run seeded with a post-retirement party. — `tools/harness/gym-sim.ts`
4. **Batch the vertical-slice art** (B3/B4): the 150 battle sprites in review chunks, then the four
   slice maps and their collision masks, then year-2 variants through overlay-diff.
5. **Audio** (C8): retirement cue first, then the pack, then the DSP season presets.
6. The structural cleanups in open items 5–11. Each is a delete, a rename or a registration; none
   blocks a beat.

## Waiting on the owner

- The move display name **Daunt** (id `snarl`) is an exact Pokémon Shuffle skill name, found after
  it was adopted. Recorded, unchanged.
- Unruled IP near-matches: **Focus** (Cassette Beasts move), **Miasma** and **Shade** (Digimon
  attacks), **Burrow** (Temtem / Coromon / Monster Sanctuary). *Soak* and *Douse* are ruled kept.
- Seven dialogue lines state a six-year run length against an unbounded calendar — six say "six
  years", plus `wick.act3.win`'s "three years running". Pinned by `tests/unit/dialogue.test.ts` so
  a seventh cannot appear unnoticed; the wording is the owner's call.
- Whether `r4` gets a content edit (breed rate or larger shipped counts) to put the cascade beat on
  the walkable slice. Under G2 an agent may not decide it.
