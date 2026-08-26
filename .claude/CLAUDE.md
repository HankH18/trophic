# TROPHIC — project instructions

A 2D Pokémon-Gold-style monster-catching RPG where the region is a living ecosystem:
catching decrements real per-node populations, over-catching cascades through a derived
food web, and in-game years age every creature, map, and town.

## The six documents

`docs/` holds six files and nothing else. Read the first two before changing anything.

- `docs/build-doc.md` — canonical: locked decisions, schemas, formulas, pipeline, build
  order, and the G1–G15 guardrails (§16).
- `docs/content-bible.md` — canonical: species, types, moves, gyms, towns, quests, audio.
  Where the build doc inlines a formula or schema, **the build doc wins**.
- `docs/STATUS.md` — the living document: what is built, what is open, what is next, what
  is waiting on Hank. The only file that records current state.
- `docs/CAST-AND-VOICE.md` — the prose standard. Read before writing or editing any
  player-facing line.
- `docs/TICKETS.md` — the work queue, and the rulings behind it. Every ticket quotes a
  decision Hank has already made. **They are decided; never re-ask one.**
- `docs/README.md` — the index.

There is no archive. Everything removed from `docs/` is in git —
`git log -S "<the thing>" -- docs/`. Do not go looking for a deleted file, do not recreate
one, and do not add a new status, findings, notes, deviations or handoff file.

**A reason that must not be lost goes in a comment on the code it governs, not in a doc.**
A comment is read by whoever edits that line; a doc is read never. A change is still never
silent: if a canonical doc is now wrong, correct it; open questions and current state go in
`docs/STATUS.md`, and the work they imply goes in `docs/TICKETS.md`.

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

- **G2** Never invent species, moves, types, statuses, towns, or roster changes. Bible values
  verbatim. A discrepancy is recorded as open in `docs/STATUS.md`, never resolved by inventing
  a value.
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

## Authored content must be reachable

Build-doc §8.5, enforced by two permanent gates: `tests/gates/reachability.test.ts` — every
authored line has a path to the screen, every dialogue kind has a selector in `game/`, and no
entry may be gated on a flag nothing writes — and `tests/gates/quest-layer.test.ts`. They exist
because a fully green suite once certified 39 dialogue entries the player could not reach,
including both epilogues. **A precondition is only real if something outside the test produces it.**

## Conduct

- Run tests and typecheck before claiming anything works. Green tests prove only what they
  exercise — check what the green is evidence *of*.
- Parallel agents get **disjoint file scopes**. Declare yours; don't write outside it.
- Never weaken an assertion, loosen a tolerance, or delete a test to turn something green.
