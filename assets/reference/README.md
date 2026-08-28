# The reference set — what is here, where it came from, and which lane each part serves

**These go INTO the pipeline.** They are img2img init images, ControlNet hints, and things to measure
against. That is what they are for.

For most of this project's life the generator started from `EmptySD3LatentImage` — pure noise — and was
asked to invent Gen-2's rendering idiom from first principles. It could not, and four rounds of
postprocess went into recovering contrast the generator was never given a way to produce. The cause was
an inferred rule: the owner said *"inspiration only, don't copy"*, an agent wrote that down as
*"…never fed to the pipeline"*, and only the first clause was his. His correction, verbatim:

> "I said inspiration only. Don't copy. I never said never feed to the pipeline. If we don't feed to
> the pipeline, then how are we using it for inspiration?"

**"Don't copy" binds on the OUTPUT.** The shipped asset must be ours — our creatures, our towns, our
content. A recoloured New Bark is a fail. The reference supplies the *rendering idiom*; the layout, the
prompt and the authored content supply *what the thing is*.

---

## What is here

| directory | count | native size | what it is | which lane it serves |
|---|---|---|---|---|
| `gen2/` | 8 | varies | GSC location captures — towns and routes | map tiles, biome families |
| `gen2/tileset-*.png` | 5 | 128×96 | GSC exterior tilesets: johto_modern, kanto, park, forest, cave | biome tile families |
| `gen2-interiors/` | 8 | 128×96 | GSC **interior** tilesets: house, players_house, pokecenter, mart, lab, gate, game_corner, traditional_house | the four interior rooms |
| `gen2-sprites/` | 132 | 40/48/56 | GSC **battle sprites**, crystal + gold, front and back | creature battle art |
| `gen2-overworld/` | 18 | 16×96 | GSC **walking sprites** — six 16×16 frames stacked | player and NPC overworld sprites |
| `gen2-trainers/` | 15 | 56×56 | GSC **trainer portraits** | NPC and gym-leader art |
| `gen2-ui/` | 12 | varies | 8 textbox frames (24×16), the font (128×64), HP/EXP bars, balls, pokegear | dialogue frame, menus, HUD |
| `gen3/` | 2 | varies | RSE: `fortree-city` and `lavaridge-town` | **elevation and biome analogues only** |

## Provenance

`gen2/*.png` (the eight location captures) and `gen3/` predate this file; they were fetched at the
owner's direction at true native resolution. Everything else was fetched from two public mirrors:

- **`gen2-sprites/`** — `PokeAPI/sprites`, `sprites/pokemon/versions/generation-ii/{crystal,gold}/`
  and its `back/` subdirectories.
- **`gen2-overworld/`, `gen2-trainers/`, `gen2-interiors/`, `gen2-ui/`, `gen2/tileset-*`** —
  `pret/pokecrystal`, the game's own disassembly: `gfx/sprites/`, `gfx/trainers/`, `gfx/tilesets/`,
  `gfx/frames/`, `gfx/battle/`, `gfx/font/`.

The disassembly matters: those are the **actual tile and sprite bitmaps**, not screenshots of them, so
they carry no scaling, no compression and no capture artefacts.

## The rules that make a reference useful rather than decorative

**Match the KIND.** A town map is a poor init image for a 96×96 creature. Before this set existed, the
sprite lanes had only location captures to work from, which satisfies the letter of "use a reference"
and gives the model the wrong thing to imitate. Battle sprite → `gen2-sprites/`. Interior room →
`gen2-interiors/`. Dialogue frame → `gen2-ui/`. Walking sprite → `gen2-overworld/`.

**Upscale NEAREST-NEIGHBOUR, always.** These are small — a GSC battle sprite is 48×48, a textbox frame
is 24×16. A smooth resample destroys the hard pixel edges that are the entire reason for borrowing
them. Prefer an integer factor; a non-integer scale softens the pixel grid even with nearest.

**`gen3/` is for elevation and biome analogue only, never for style.** `fortree-city` is the Bowerdeep
analogue and `lavaridge-town` the Cindershelf one — that is why those two were fetched. Its 49-colour
palette will split the house look if used as a style source.

**Measure, do not remember.** Values taken off these captures have settled real arguments — Gold's
luminance ladder is plain ground **183.76** → tall grass **157.00** → tree mass **115.72**, i.e.
walkable bright, encounter-walkable darker, blocking darkest. A composed map that inverts that sign is
teaching the player the opposite rule. See `tools/artverify/EVAL-STANDARD.md` for the operators, and
note that a figure without its corpus attached has been wrong here more often than it has been right.

## What is still missing

No battle **backgrounds**, no Pokédex screen, no world map. Add them the same way if a lane needs them,
and record the source here rather than leaving the next reader to guess.
