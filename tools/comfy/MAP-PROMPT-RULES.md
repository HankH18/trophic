# Map prompt rules — measured, not guessed

Every rule below was established by a controlled cell in `assets/raw/_trials/`: one axis moved,
seed held at 42, same graph. Cell ids are the filenames under those trial directories.

## R1 — The SUBJECT enumeration is the whole lever
Holding the skeleton and the seed still and swapping the shipped one-line subject
("Hearthollow, Warden Maren's field station at the heart of the meadow, Meadow biome") for an
enumerated one that names five buildings by material, roof and function turned a ~50-house street
grid into a five-building hamlet with a fallow field.
`map-town-style/t1-control` vs `t2-subject-only`.

## R2 — The negative prompt is INERT. Nothing can be fixed by adding a term to it.
`t3-skelA-frozneg` and `t4-skelA-mapneg` carry the same positive and seed and wildly different
negatives — one of them naming `grid layout, city blocks, rows of identical houses, suburb,
roundabout, symmetrical layout, isometric`. The two files differ by **0 bytes out of 3,145,728**
(`node tools/artverify/imgdiff.mjs`).

The cause is in the graph: `pixel-txt2img-api.json` node 70 is `cfg: 1.0`, which disables
classifier-free guidance, so the negative conditioning is never evaluated. This is a locked §9.2
parameter, so the negative is inert for every class, not only maps — including the `player`
negative that L6's cape ban is written against. The cape is excluded by the positive prompt.

**Consequence: a defect is fixed in the POSITIVE prompt or it is not fixed.**

### R2 is about the NEGATIVE PROMPT FIELD ONLY — negated phrases in the positive prompt work

This has already been misread once, at cost. R2 says the `negative` string is never evaluated because
cfg 1.0 disables classifier-free guidance. **It says nothing about the word "no" appearing inside the
positive prompt.** Those are ordinary tokens and they demonstrably do work.

The proof is R5's own survivor: **the full-bleed clause is phrased entirely as negations** — *"no
island, no plinth, no cutaway earth wall, no border and no blank background anywhere"* — and it is
the one clause in this file measured as a clear win, 0.06% void against 13.6–31.1% without it.

**A round was run on the misreading.** An instruction to "delete every negation" removed the
full-bleed clause along with the rest, and the framed-island failure returned immediately: **6 of 27
cells rendered as a map floating on a grey matte frame, against 3 of 37 before.** The deletion was
the cause; the clause was doing the work.

So:

- **A term in the `negative` field — inert. Ignore it entirely.**
- **A negated phrase in the positive prompt — judge it on evidence, per clause.** Some work
  (full-bleed). Some do not (*"none lined up in a regular grid or in repeated rows"*, which never
  stopped a grid appearing and is fairly deleted on that evidence, not on its grammar).

Never delete a positive-prompt clause because of its form. Delete it because it was measured inert.

## R3 — Never describe what the OTHER edges of the picture are
"…the ONLY road leaving the picture, running off the top edge; every other edge of the picture is
unbroken hedgerow" produced a rectangular hedge boundary around the whole town and a grid of paths
inside it — worse than the cell it was trying to improve. `map-style-round2/u1-town-single-exit`.
Say where the path GOES. Say nothing about the frame.

## R4 — Never use the word "road"
It pulls modern asphalt. "a switchback ash road climbs through the settlement" gave Cindershelf a
grey ring road with dashed white lane markings (`round3/v2-cindershelf`); "runs off the top edge
into open country" gave Hearthollow a grey highway across the top (`round2/u2-town-big`).
Use: dirt lane · worn track · plank boardwalk · ash path · stone stair · packed-earth track.

## R5 — Never ask for the whole thing to fit in frame
"seen from very high above so the whole marsh fits in the frame at once" produced a rectangular
grid of causeways dividing the marsh into four quadrants. `round3/v6-r2-winding-far`.
The shipped skeleton's "entire town visible / spacious layout" is the same failure and is why the
first drafts filled the frame with houses; both clauses are removed from the class skeletons.

## R6 — Name the ground material or you get a lawn
The shipped Cindershelf draft put two volcanoes on bright green grass. Naming "black volcanic ash
and cracked basalt terraces with no grass anywhere" produced black basalt, ash, steam vents and
glowing orange fissures. `round3/v2-cindershelf` vs `palette-trials/pt-map-cindershelf`.

## R7 — Concrete non-building structures land reliably
Fenced specimen yard, drying racks, ore carts and rails, a moored flat-bottomed ferry, fish crates,
lantern-strung stalls, a leaning jetty, rotting mooring posts — all appeared as described. These
are what make one town not look like another, so every node names several.

## R8 — Routes need the path's SHAPE named, not its endpoints
"enters at the bottom edge and leaves at the top edge" alone gives either a dead-straight line
(`round2/u4`, `u6`) or a field grid (`round3/v4-r1`, `v5-r2-winding`). See `map-route-shape` for
what replaced it.

---

# R9 — `denoise` is QUANTISED, and above a threshold img2img is silently txt2img

ComfyUI computes `total_steps = int(steps / denoise)` and runs the last `steps` sigmas of that
schedule. Two consequences, both measured on this graph at 8 steps, each against a pure txt2img
control on an identical seed and prompt:

**Neighbouring denoise values are frequently the same cell.** 0.85, 0.86 and 0.88 all resolve to
`int(8/d) = 9` and returned **byte-identical images** — 99.2015% differing from the control, mean
delta 46.021, three times over. Asking for three decimals bought three identical pictures at three
times the price.

**At or above `denoise = steps/(steps+1)` there is NO init contribution at all.** 0.90 and 0.92 both
resolve to `int(8/d) = 8`, which equals the step count, so the full schedule runs and the source image
is discarded. Measured: **0.0000% of 3,145,728 bytes differ from txt2img.** At 8 steps the threshold
is **8/9 ≈ 0.8889**.

**This fails green.** The job succeeds, the image is fine, the label says img2img, it bills the same,
and any conclusion drawn from it is about a mechanism that never ran. It already cost one: the
14-generation player-view sweep in `assets/approved-trials/_player-views/README.md` records a 0.92 row
whose identity "failed" as *"a different face, a different bag"* — which is not identity drift, it is a
different character, because that cell was a fresh generation. Six of its seven cells were valid and
distinct; only the top rung needs withdrawing.

**So: step a denoise sweep in schedule counts, not decimals.** The usable settings at 8 steps are
`int(8/d)` for d below 0.889 — roughly 10, 12, 16, 20, 26 as d falls — and there are only about eight
distinct values in the whole 0–1 range.

# Art contracts the CODE imposes (not style — these have mechanical consequences)

- **Native 1024², rendered 2× to a 2048² world.** `balance.map.mapNativePx / mapRenderScale`.
- **The player sees 240 × 160 NATIVE px at a time** (480×320 virtual viewport at render scale 2,
  camera zoom 1). A full map is 4.3 screens wide by 6.4 tall. A building at ~150 native px is
  about two-thirds of a screen — correct. **Anything under ~16 native px is half a tile on screen.**
- **Native (512,512) — the exact centre of the map — must be open standable ground.** The player
  spawns at the walkable tile nearest the centre on *every* arrival at a node
  (`chooseSpawnTile` → `firstWalkableTile`, game/collision.ts). Painting a building, a lake or a
  cliff dead-centre is the one composition mistake with a direct mechanical consequence today.
- **Props have no sprite.** Nothing draws `props[]`; they are invisible interaction hotspots over
  the painted map (game/props.ts, build-doc §7.6). The sign-card / antler stone / shell-kiln shrine
  / sunken idol has to BE in the painting, at the authored (x,y) in map-native pixels — or the
  prop's x/y is moved afterwards to wherever the painting put it.
- **Region chain and edge exits.** `adjacency` in data/nodes/*.json is a straight line:
  `hearthollow → r1 → brackwater → r2 → bowerdeep → r3 → cindershelf → r4 → duskhollow → r5 →
  sanctum-approach → sanctum`. Convention adopted for the art: **bottom edge = back toward
  Hearthollow, top edge = on toward the Sanctum.** Hearthollow paints one exit (top); Sanctum
  paints one (bottom); the other ten paint two. The Sanctum sits at the top because bible §6 calls
  its approach "one long approach" to a sealed caldera — you climb to it.
  **NOTE:** the game cannot yet WALK through an edge — travel is a number-key menu keyed on
  `adjacency` (game/scenes/OverworldScene.ts `travelTo`), and `NodeFile` carries no exit
  descriptor. The art is painted so the exits are unambiguous when that lands; the code work is a
  ticket, not part of this pass.
