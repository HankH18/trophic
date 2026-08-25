# Approved trials — the art-lane style lock

Source: the validated Comfy trials from the ideation session. These five images are the style
reference for every generated asset and the k-means input for `data/palette.json`.

| File | Class | Status |
|---|---|---|
| `player-overworld.png` | overworld character | **L6-locked approved player sprite.** Green shirt, ranger cap with yellow star badge, leather satchel, boots, no cape. The B0 iteration baseline. |
| `trainer-battle.png` | trainer battle sprite | class reference (farmer, straw hat, apron) |
| `town-map.png` | top-down town map | class reference — see the isometric open decision in `docs/DEVIATIONS-lane-b.md` |
| `creature-croc.png` | creature battle sprite | **style reference ONLY.** Generic croc anatomy; it is *not* Fenmaw's canon gharial snout (bible §4). Never seed Fenmaw from this. |
| `creature-fox.png` | creature battle sprite | class reference — reads as Cindril (fox kit, ember tail) |

## Rules

- `palette.json` is **NOT frozen yet.** The freeze happens at gate B0, after Hank's player-sprite
  iteration session (build-doc §15 B0). Until then the shipped palette is a marked placeholder.
- The rejected caped iteration was **intentionally dropped** and is not in the repo (see
  `DEVIATIONS-lane-b.md` B-D3). It has no role in the build. L6's "no cape" is enforced by the
  prompt string, not by a reference image.
- `_downscale-check/` holds §9.3 post-process previews (nearest-neighbour to the real target
  sizes, plus 8× nearest upscales so they can be inspected by eye). Regenerate with
  `node tools/postprocess/downscale-check.mjs`. These are evidence for the B0 gate, not shipping assets.
