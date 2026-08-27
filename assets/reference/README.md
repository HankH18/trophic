# Reference images — inspiration only, never shipped

Captured as screenshots for **composition study**, at the owner's direction:
*"I'm not telling you to copy them. I'm telling you to use them as inputs with a low
consistency weighting set."*

**Nothing in this directory is a game asset and nothing here is ever quantized, post-processed,
or written into `assets/final/`.** These are used two ways:

1. **Measured** — building-to-frame ratios, path widths, open-ground fraction, object counts.
   Numbers extracted from these become constraints in `tools/mapgen`. This is the durable use:
   it makes the composition grammar ours rather than borrowed at generation time.
2. **Low-weight conditioning** — as a ControlNet input at strength ~0.2-0.35, which contributes
   topology (where mass sits, how much frame is empty) and not content.

## gen2/ — Pokémon Gold (Gold/Silver shared tilemaps, `_GSC`/`_GS` on Bulbapedia)

The owner's chosen style target. Flat top-down. Crystal-only maps (`_C`) are deliberately excluded.

| file | why it is here |
|---|---|
| `new-bark-town.png` | small farming hamlet, 4 buildings, ~35% open ground — the Hearthollow analogue |
| `cherrygrove-city.png` | small coastal town, water boundary |
| `azalea-town.png` | forest town, dense tree mass |
| `violet-city-partial.png` | larger town; **capture is the top portion only** (source is 640x576) |
| `route-29.png` | route grammar: one path, no buildings, ledges, tree borders |

## gen3/ — Pokémon Ruby/Sapphire (`_RS`)

Referenced for **elevation only**, at the owner's direction, because Gen 3 shows how a top-down
map expresses multiple levels — cliff bands, ledges, stairs and ladders — without the side-on
cutaway that made the isometric attempts fail.

| file | why it is here |
|---|---|
| `fortree-city.png` | treetop houses on stilts joined by plank bridges, ladders to the floor below — the Bowerdeep structure |
| `lavaridge-town.png` | buildings on volcanic terraces, brown cliff bands stepping between levels — the Cindershelf structure |

**Style note:** Gen 3 is a different, softer, higher-colour idiom than Gen 2 Gold. Use Gen 3 for
*how elevation is drawn* and Gen 2 Gold for *how it looks*. Mixing both as style references would
reproduce the cross-class style drift the cohesion reviewer already measured once.
