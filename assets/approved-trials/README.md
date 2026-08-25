# Approved trials — the art-lane style lock

**Gate B0 (build-doc §15) is PASSED.** Hank approved the player sprite; `data/palette.json` is
frozen. Multi-version player work (§15's "nothing multi-version starts before B0") is unblocked —
except the walk cycle, which is its own supervised gate (B5, §9.6).

## The canonical player

`player-APPROVED.png` **is the player identity.** sha256 `ba2df07114ffa6d2…`; it is byte-identical
to `assets/raw/b0/b0-player-peaked-compact.png`, row `b0-player-peaked-compact` of the B0 sweep.
Full provenance — prompt verbatim, negative, seed 42, workflow graph + its hash, generation
parameters — is the `player-front` row in `tools/comfy/manifest-b0.json`. That row is what enforces
G5: any future regeneration reuses seed 42 and that prompt string, or the row gets versioned.

`player-style-reference.png` is **a style reference only, and is superseded as the identity.** It
carries a cape, which L6 forbids; it informed the B0 sweep's look and has no further role. Never
seed the player from it, and never treat its colours as canon — it was excluded from the palette
k-means for exactly that reason.

| File | Class | Status |
|---|---|---|
| `player-APPROVED.png` | overworld character | **CANONICAL player identity (L6 + gate B0).** Green shirt, peaked green ranger cap with a yellow star badge, leather satchel, brown boots, no cape. |
| `player-style-reference.png` | overworld character | style reference only — **superseded as the identity**, has a cape (L6 forbids). Not a palette source, not an img2img seed. |
| `trainer-battle.png` | trainer battle sprite | class reference (farmer, straw hat, apron) |
| `town-map.png` | top-down town map | class reference — see the isometric open decision in `docs/DEVIATIONS-lane-b.md` |
| `creature-croc.png` | creature battle sprite | **style reference ONLY.** Generic croc anatomy; it is *not* Fenmaw's canon gharial snout (bible §4). Never seed Fenmaw from this. |
| `creature-fox.png` | creature battle sprite | class reference — reads as Cindril (fox kit, ember tail) |

## The palette freeze

`data/palette.json` is **frozen** (`frozen: true`, `frozenAt` stamped). 32 colours, weighted
k-means in sRGB with equal per-image weighting, k-means++ seeded at 42. Ids c00–c31 are positional
and stable — the freeze was a value swap, not a schema change.

Reproduce or re-derive it with `npx tsx tools/palette/fit.mjs` (deterministic; re-running yields a
byte-identical `colors[]`, sha256 `7da17990aaa32166…`). `_method` and `_validation` inside
`data/palette.json` carry the choices and the measured error; the full bake-off across six
candidate palettes is `_palette-freeze/_fit-report.json`.

Sources: the five class references above **minus** `player-style-reference.png`.
`superseded/` is excluded entirely. The plain white backdrop is flood-filled out before clustering —
it is not a content colour.

## Evidence for the gate — `_palette-freeze/`

Regenerate all of it with the three tools named below; none of it is a shipping asset.

| Path | What it shows | Tool |
|---|---|---|
| `_palette-swatches.png` | the frozen 32, as swatches | `tools/palette/fit.mjs` |
| `_fit-report.json` | all six candidate palettes + per-image error, so the choice is auditable | `tools/palette/fit.mjs` |
| `_validation.json` | per-band error, hue coverage vs the source set's own hue distribution | `tools/palette/validate.mjs` |
| `quantized/*-BEFORE-AFTER.png` | each source beside its quantized self | `tools/palette/validate.mjs` |
| `quantized/*-deltaE-heatmap.png` | where the error actually lands (black 0 → white 15+) | `tools/palette/validate.mjs` |
| `at-game-size/_COMPARE.png` | the player at 1024², 32×48 pre-quantize, 32×48 quantized, and 64×96 | `tools/palette/at-game-size.mjs` |
| `cross-view/_three-statics-32x48.png` | front / back / side at the size they ship | `tools/palette/cross-view.mjs` |
| `cross-view/_cross-view.json` | which frozen swatch each identity band lands on, per view | `tools/palette/cross-view.mjs` |

## Player statics — front approved, back/side awaiting review

Front is approved. The back and side statics were generated after B0 lifted the block; **they are
candidates, not approved**, and they live in `assets/raw/player/` rather than here. The selections
are `b0-player-back-e` and `b0-player-side-b`, recorded in `tools/comfy/manifest-b0.json` with the
reason each rival was rejected. Review sheet: `assets/raw/player/_views-contact-sheet.png`.

Both were generated with the approved prompt **verbatim**, seed 42, only the view/pose clause
substituted. Two open defects are logged in `docs/DEVIATIONS-lane-b.md` (B-D14).

## Rules

- The rejected caped iteration was **intentionally dropped** and is not in the repo (see
  `DEVIATIONS-lane-b.md` B-D3). L6's "no cape" is enforced by the prompt string and by the
  player-class negative (B-D7), not by a reference image.
- `_downscale-check/` holds the pre-freeze §9.3 previews. They were quantize-free and predate the
  palette; `_palette-freeze/at-game-size/` supersedes them for anything about colour. Regenerate
  with `node tools/postprocess/downscale-check.mjs`.
