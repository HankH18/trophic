# RESUME HERE — Trophic story/dialogue overhaul, paused 2026-08-25

Paused at the owner's request to free session budget for another project. **Nothing is broken.**
The repo is green and the in-flight prose work is preserved in the tree.

## State of the tree

    npx tsc --noEmit   clean
    npm run test       48 files / 2254 tests passing
    npm run build      clean
    working tree       uncommitted, ~91 changed/new files. NOT committed — see "First thing".

`data/dialogue.json` still holds the **original** prose. The rewrite lives beside it, unmerged, in
`docs/wip-prose/fragments/` — so the game is playable and green at every moment of this pause.

## First thing on resume

Commit. Ninety-one files of verified work are uncommitted. Commit selectively — `git add -A` will
sweep workflow artifacts. The suite is green now, so the commit is safe now.

## What is DONE and verified

- **ledger → survey**, repo-wide: identifiers, filenames, scene keys, tests, docs, player-facing
  strings, and the last holdout (`tutorial.ledger.done` → `tutorial.survey.done`). Sabotage-checked.
- **17% of the dialogue was unreachable and now is not.** 39 of 211 entries / 83 of 499 lines.
  Nothing in `game/` selected a `battle-*` entry, so every gym leader's pre/post-battle speech and
  all 18 rival encounters were dead; `story.vellsire.resolved` / `.outcome` had no writer, so both
  epilogues were dead — their only three mentions in the repo were tests that set the flag
  themselves. `game/rival.ts` and `game/finale.ts` are new. Quest turn-in works (`owedFlag` is
  derived at load in `game/quests.ts`, which is why grepping `.turnin` finds nothing).
- **Two permanent gates**: `tests/gates/reachability.test.ts` (every authored line has a path to
  the screen; every dialogue kind has a selector; no entry gated on a flag with no writer) and
  `tests/gates/quest-layer.test.ts` (the quest layer previously had zero tests). Both failed with
  13 assertions before the wiring, naming every dead entry — they bite.
- **Names.** 41 background NPCs have real given names (Net-Mender → Parnel, Shaft-Hand → Nunn,
  Old Drover → Judd…), applied to `data/dialogue.json` `speakers[]`. Pokémon-only IP renames:
  `Overgrow → Thicket`, `Keen Eye → Bright Eye`, `Strong Jaw → Broad Jaw`, `Nessa → Hetty`,
  `Dous → Douse`. Ids never moved.
- **Prop labels**: all 17 distinct (nine previously shared `antler standing-stone`).
- **Docs synced**, and `docs/DEVIATIONS.md` integrity repaired — duplicate `D-Q2-*` ids renumbered
  to `D-Q4-*` across 56 references; 126 rows, 126 unique ids. Rulings at `D-INT-5/6/7`.

## What is IN FLIGHT — the prose rewrite

Every line of the corpus has been rewritten and read three times (one writer, two independent
readers per slice), then audited by six adversarial agents reading the whole corpus at once.

**Where it stands, measured:**

| | shipped | after rewrite | after the length pass |
|---|---:|---:|---:|
| lint flags | 149 | 119 | **6** |
| median line length | 98 | 245 | **161** |
| lines under 90 chars | ~200 | 0 | **68** |
| lines over the 400 schema cap | 0 | 3 | **0** |
| blind speaker attribution | — | 93% | not re-measured |

The six original defect checks are all at **zero** (epigram, category error, antithesis, dangling
pronoun, false equation, system vocabulary). Structural drift vs the shipped file is exactly the two
intended new Wick entries.

## Next steps, in order

The repair workflow was stopped after phase 1 of 5. Its script is reusable:

    Workflow({scriptPath: ".claude/.../workflows/scripts/trophic-prose-repair-wf_42b27b64-628.js",
              resumeFromRunId: "wf_42b27b64-628"})

Phase 1 (Length) is cached and will replay instantly. Remaining:

1. **De-chorus** — the biggest outstanding defect. The corpus has one temperament across 62
   speakers: thwarted testimony, a person who was right, said so, and was ignored. At least 35
   entries end on it. The five town children are one child written five times. Cap is two speakers
   per shared shape. Someone in this region should be happy.
2. **Truth + gates** — `tests/unit/dialogue.test.ts` reds in five assertions: G2 rule A on ~13
   capitalised tokens (five are new cast names spoken aloud, and the allow-lists are capped and
   asserted), the starter age-form binding, both epilogues' numeric cost statement, a player CHOICE
   string tripping the G7 moralizing tripwire, and six hand-maintained review registers.
   Plus content-truth regressions listed in `docs/AUDIT-FINDINGS.md`.
3. **Two G7 structural breaches** — no regex can see either, and they are the highest-priority
   items: `tolm.quest.fallow.done.short` fires an I-told-you-so at an outcome the player may not
   have caused; and the two epilogues are baselined against different comparators at different
   temperatures, so catching reads as the lesser ending.
4. **Re-audit**, then merge: `python3 tools/prose/merge.py <scratchpad> --write`, or point
   `merge.py` at `docs/wip-prose/fragments/`. Then update the test allow-lists and run everything.
5. **Verify a line actually renders on screen** — `npm run dev` and drive it. Never closed.

## Reference

- `docs/CAST-AND-VOICE.md` — the cast and voice bible. **Appendix G governs, overriding Appendix F,
  which overrides §1 and §2.** F exists because the owner rejected §3's model lines as nonsensical
  (the defect was compression, not vocabulary). G exists because F overcorrected into uniform
  245-character paragraphs — length is a distribution, not a target.
- `docs/AUDIT-FINDINGS.md` — 105 findings, 22 blockers, blockers first.
- `docs/STORY-REPAIRS.md` — the repair plan the wiring lanes executed.
- `docs/PROSE-DIAGNOSIS.md` — what was wrong with the original corpus, measured.
- `tools/prose/prose-lint.py` — nine structural checks, calibrated so it catches every line the
  owner rejected and passes every rewrite. A floor, never a gate: it cannot detect sense.

## Standing directives from this session

- **Do not frame work around the demo video.** Build the game; the video comes after.
- **The survey is a tool, not a sacrament.** Field biologists are behind on data entry, argue about
  method, and never say the counting matters. G7's rule stands; its old slogan is gone.
- **IP screening is Pokémon-only and light** — actual Pokémon names, nothing else. Note the standing
  hazard: ordinary short English given names hit Pokémon Trainer names at roughly 28%.
