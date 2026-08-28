# The three derived 32x48 player views are retired

`player-{front,back,side}-32x48.png` were deleted here, deliberately, by the art lane. The rest of
`_player-views/` — `README.md`, `_acceptance.json`, `_CONTACT-SHEET.png` — is kept: it records HOW the
views were made and what they were measured against, and that record outlives the pixels.

## Why, and there are three reasons, each sufficient on its own

1. **The owner ruled the player forward-facing only.** `game/mapview.ts` `PLAYER_VIEWS` is `["front"]`
   and `playerArtId` cannot spell a back or a side id. Nothing in the shipped game can ask for these.

2. **The geometry is undefined at the new height.** `deriveBack` and `deriveSide` place features by
   ABSOLUTE row index — cap band 12-15, hair 16-20, neck to 23, ears 16-17, belt 30-37, and on the side
   a head clear over rows 0-23 and a far-arm run at 29-38. Those are proportions of a 48-row figure
   written as literals. The owner then ruled the player ONE BLOCK TALL and `balance.map.playerSpriteH`
   went 48 -> 32, at which height the belt pass addresses rows 30-37 of a sprite that ends at 31.
   `setPx` bounds-checks, so it would not have crashed — it would have quietly emitted a sprite with
   the belt half gone and the neck taper landing in the torso. `player-views.ts` now REFUSES that
   height rather than producing it.

3. **The lineage is superseded, and this is the one that would have been missed.** These three descend
   from `assets/approved-trials/player-APPROVED.png`, the b0 artwork, downscaled. What SHIPS is a
   different drawing — the wave-11 sprite now at `assets/final/player/player-front.png`. So a
   `player-front-32x32.png` regenerated from this lineage would have been a file the gate asserts hard
   over and nothing draws: precisely the failure `tests/gates/player-art-contract.test.ts` exists to
   prevent, arriving from the other direction.

## What replaces the coverage

`player-art-contract.test.ts` §0-§4 move to `assets/final/player/player-front.png` — the file that
actually ships. Measured against the gate's own floors before the move: 704 opaque pixels against a
floor of 256, 9 distinct swatches against a floor of 8, zero off-palette, alpha exactly {0, 255}.
Coverage goes UP: the assertions now guard shipped bytes instead of a trial artifact.

The gate's own header authorised this — *"Retiring the derived PNGs themselves is the art lane's call,
made in the art lane — and when it is made, §0-§4 go with them and §6 stays."* §6, the seam between the
lanes, is untouched.

## Six files, not three

The three `x12/player-{front,back,side}-x12.png` previews went with them, in the same decision and for
the same reasons. They were x12 blowups of the three PNGs above: nothing referenced them, and they
depicted retired art at the most legible size in the directory.

That last part is why they could not stay. A reviewer opening `_player-views/` would have found large,
clear pictures of the superseded figure sitting next to a note saying the figure is gone — and the
pictures win that argument every time. A record that is contradicted by the artwork beside it is not a
record.
