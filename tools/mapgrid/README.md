# mapgrid — read a coordinate off a painted map by eye

A painted 1024² map has to yield exact map-native coordinates for three separate consumers:

- **door positions** for `data/interiors/*.json` (`door.x/y`, map-native px). The blueprint
  coordinates are PROVISIONAL — placed by inference before any map was painted — and the code
  lane re-pins each one to the door actually painted. The painting is the source of truth, so
  somebody has to read the number off it.
- **prop positions** for `data/nodes/*.json`. Props have no sprite (build-doc §7.6): they are
  invisible interaction hotspots over the painting, so the sign-card / antler stone / shell-kiln
  shrine has to BE in the painting at the authored (x,y), or the prop moves to wherever the
  painting put it.
- **the spawn check.** Native (512,512) must be open standable ground — the player spawns at the
  walkable tile nearest centre on *every* arrival (`chooseSpawnTile` → `firstWalkableTile`).

This overlays a labelled grid so the number can be read directly instead of estimated. It draws
the collision grid the engine actually samples on, not a decorative one, so a door that lands
ambiguously between two cells is visible as ambiguity rather than rounded away silently.

Every dimension comes from `data/balance.json` `map` (G11: no gameplay constant as a literal).

    npx tsx tools/mapgrid/run.ts <image.png> [--out out.png] [--mark 296,392] [--zoom 2]

`--mark` drops a crosshair at a map-native coordinate, to check a coordinate you already have
against the picture — which is how a provisional door position gets confirmed or corrected.

## The door manifest — and the one field that is NOT a paste

When Hank declares the map set, the art lane hands the code lane a door manifest read off the
approved painting. Format, one row per building blueprint in `data/interiors/`:

    <blueprintId>  x,y  wall=<south|north|east|west>  [MOVED-WALL]

`x`/`y` are a paste: the code lane re-pins `door.x` / `door.y` directly.

**`wall` is not.** All four blueprints today cut their `D` into the SOUTH wall, so a non-south
door is a case that has never existed in this project. If the painting puts a door on a north,
east or west wall, three things move together and only one is a coordinate:

- the `D` character is re-cut into that wall of the ASCII plan,
- `arrival` moves to the floor cell one step inside the new doorway,
- the `_room` sentence is rewritten — it names the wall in words, and a `_room` that has drifted
  from its drawing is refused.

That is a blueprint edit, not a paste. **So the manifest flags any building whose painted door is
not on the south wall**, and that flag is worth more than the coordinate: missed, it silently
produces a room the player enters through a wall. A door that moved along the *same* wall needs
x/y alone.

Note on where the check bites: the facing↔wall agreement is asserted in
`tests/unit/interiors.test.ts`, not in `blueprintProblems`, so a disagreeing blueprint fails CI
rather than refusing to load. The stronger runtime guarantee is separate — `blueprintProblems`
refuses any blueprint whose `arrival` is not exactly one orthogonal step from `D`, and
`enterInterior` derives the walk-in direction from that step rather than from `door.facing`.
