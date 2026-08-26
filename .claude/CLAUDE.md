# TROPHIC — project instructions

A 2D Pokémon-Gold-style monster-catching RPG where the region is a living ecosystem:
catching decrements real per-node populations, over-catching cascades through a derived
food web, and six in-game years age every creature, map, and town.

## Read these before doing anything

- `docs/build-doc.md` — canonical for **decisions, schemas, pipeline, build order**.
- `docs/content-bible.md` — canonical for **content** (species, types, moves, gyms, towns, quests, audio).
- Where the build doc inlines a formula or schema, **the build doc wins**.
- `docs/DEVIATIONS.md` — every departure from either doc is logged here. Never a silent change.
- `docs/LANE-A-STATUS.md` — current state of the core engine (written by the Lane A integrator).

## Stack

Phaser 3 (pinned `^3.90` — **npm resolves bare `phaser` to 4.x, which violates locked decision L2**),
TypeScript 7 (native compiler: **no `baseUrl`**, `paths` must be `"./..."`-relative), Vite, vitest,
zod 4, fast-check. Aliases: `@core/* @game/* @data/* @tools/*`.
`strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` — use `import type`.

Verify: `npx tsc --noEmit` (silence = clean) · `npm run test` · `npm run build`

## The two never-cut demo beats

The judged output is a demo video + an AI interview. Everything serves these:
1. **Cascade** — hammer a prey species in year 1; open year 2 with its predator gone,
   a new apex risen, and the aged map.
2. **Legacy** — the starter retires before the league; its heir fights the finale.

Also never cut: vertical-slice walkability (Hearthollow → R1 → Brackwater → R2), the
real-number survey, the retirement flow, the Vellsire choice + epilogue survey, determinism tests.

## Guardrails (build-doc §16) — violating one fails the task

- **G2** Never invent species, moves, types, statuses, towns, or roster changes. Bible values verbatim.
  Discrepancies go to `DEVIATIONS.md`, not into a fix.
- **G3** No second encounter/spawn/bait table. One JSON per node is the single source of truth;
  encounter weights are **derived**. Only `core/foodweb.ts` may compute diet edges.
- **G6** Never script the demo cascade into the sim — it must emerge from the §7.3 rules.
- **G7** No moralizing copy about catching. No line may tell the player they did wrong, imply guilt,
  or deliver a lesson. Populations are reported the way a working field biologist reports them —
  plainly, as counts, with no reverence for the notebook they are written in.
- **G10** Boxed creatures age at year turns. Caught Ancients never age.
- **G11** No gameplay constant as a literal in code — all from `data/balance.json`. No `Math.random`.
- **G12** Never express effort in human engineering-hours (docs, comments, commits).
- **G14** Nothing is "done" before its named tests exist and pass.

Full list, including the art-lane guardrails (G1, G4, G5, G8, G9, G13, G15), is in build-doc §16.

## Architecture rule that carries the most weight

`core/` is **pure TypeScript with zero Phaser imports** (L11). The balance harness, the tests,
and the game all import the same modules. The battle engine is a pure reducer
`(state, action, rng) => {state, events[]}`; the Phaser scene is only a replayer of `events[]`.

## The other rule that now has teeth

**Authored content must be reachable** (build-doc §8.5). Two permanent gates enforce it:
`tests/gates/reachability.test.ts` — every authored line has a path to the screen, every dialogue
kind has a selector in `game/`, and no entry may be gated on a flag nothing writes — and
`tests/gates/quest-layer.test.ts`. Both exist because a fully green suite once certified 39 of 211
dialogue entries the player could not reach, including both epilogues. **A precondition is only real
if something outside the test produces it.**

## Conduct

- Run tests and typecheck before claiming anything works. Green tests prove only what they
  exercise — check what the green is evidence *of*.
- Parallel agents get **disjoint file scopes**. Declare yours; don't write outside it.
- Never weaken an assertion, loosen a tolerance, or delete a test to turn something green.
