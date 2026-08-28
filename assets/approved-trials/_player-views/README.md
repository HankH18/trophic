# Player back + side views — DERIVED, not generated

> ⛔ **RETIRED. THE VIEWS THIS DIRECTORY IS ABOUT NO LONGER SHIP, AND NEITHER DOES THE FIGURE IN THEM.**
> Read [`derived/RETIRED.md`](./derived/RETIRED.md) BEFORE anything else here. Six PNGs were deleted:
> the three derived 32×48 views and their three ×12 previews. The owner ruled the player forward-facing
> only, then ruled it one block tall, and the shipped sprite is now a different drawing entirely —
> `assets/final/player/player-front.png`, from wave 11, not a derive of `player-APPROVED.png`.
> **Everything below describes the superseded lineage.** It is kept as method and measurement, not as
> a description of the game.

**Nothing here is approved.** `_player-views/` is an evidence directory in the same sense as
`_palette-freeze/`; it holds candidates and the measurements behind them. Only Hank promotes
anything into `assets/approved-trials/` proper.

**`_CONTACT-SHEET.png` is kept for its RIGHT-HAND HALF ONLY.** Its three left panels — SIDE (derived),
FRONT (approved), BACK (derived) — are large, legible pictures of a figure that no longer ships, and
they are the reason this banner exists: a reader who opens the sheet first will believe the picture
over the prose, every time. Its three right panels are the ones worth keeping — `back img2img 0.92`
and `side img2img 0.92` both *turned* and lost identity, `back img2img 0.80` held identity and never
turned. That is the evidence behind build-doc §9.5's spec limit, *"img2img on this model is for deltas
WITHIN a view and cannot turn one"*, which is still live and still binds. Deleting the sheet would have
taken a canonical doc's evidence with it; deleting the pointer that sent people to it first is enough.

## The short version

The back and side are **derived from `player-APPROVED.png` at sprite resolution (32×48, §7.6)**.
They are not model output. Every colour in them is a swatch lifted out of the approved front's own
quantized pixels, so the five defects in the rejected txt2img pass are structurally impossible here
rather than merely unlikely.

img2img was tried first and lost, on evidence. 14 generations across denoise
{0.30 0.40 0.50 0.65 0.80 0.86 0.92} × {back, side} found a hard cliff with no window in it:

| denoise | did the view turn? | did the identity hold? |
|---|---|---|
| 0.30 – 0.80 | **no** — output is the front, essentially unchanged | yes (trivially) |
| 0.86 | **no** — still front-facing | **already drifting** — the satchel became a flap-bag with a yellow clasp |
| 0.92 | yes | **no** — star on the back of the cap, a different face, a different bag |

Identity drift starts *before* view rotation does. Raw sweep images and run logs:
`assets/raw/player/img2img/`.

## What is transformation and what is authored

| View | Body | Head |
|---|---|---|
| **back** | horizontal mirror of the front — which is exactly what a back view is for everything that is not face-specific, and it puts the satchel strap and bag on the correct shoulder and hip for free. Every edit below **recolours** a pixel the mirror already placed, with two exceptions worth naming: the neck's width taper (which clears pixels) and four 1px ear marks. No new silhouette is drawn. | transformation: star removed, peak shaded away, cap band refilled over rows 12–15 (the mirror drags the front's temple hair and ear into it), face → nape band, neck narrowed, buckle removed, ears added |
| **side** | transformation: one global horizontal squeeze (21/32) so vertical features stay contiguous, far arm dropped, buckle moved to the leading edge | **authored** as a glyph map (`SIDE_HEAD` in `tools/comfy/player-views.ts`). A profile skull is geometry no transformation of a frontal face yields. Colours are still all front swatches. |

The side's head is the one place the word "derived" is doing work. It is called out here, in the
manifest row, so nobody later mistakes it for a transformation.

## Files

| Path | What |
|---|---|
| `_CONTACT-SHEET.png` | the review sheet — derived views beside the failed img2img ones |
| `derived/player-{front,back,side}-32x48.png` | the sprites, at the size they ship |
| `x12/player-{front,back,side}-x12.png` | the same, nearest-upscaled ×12 for eyeballing |
| `_acceptance.json` | every measurement below, machine-readable, for all 8 subjects |

Regenerate all of it: `npx tsx tools/comfy/player-views.ts derive`. No network, no credits,
byte-reproducible (`player-back-32x48.png` sha256 `7dd1181c352c794c…` across runs).

## The acceptance bar, measured

Pipeline for every number: trim → nearest downscale to 32×48 → quantize to the **frozen**
`data/palette.json` → background removal. Same chain, same order, for candidates and for rejects.

| | front (approved) | **back derived** | **side derived** | back-e rejected | side-b rejected |
|---|---|---|---|---|---|
| star pixels / rows | 16 @ rows 4–7 (cap front) | **0** | 4 @ rows 5–6 (leading edge) | 10 @ rows **9,10,11**, 34 | 13 @ rows 3–6, **17, 32, 33** |
| edge density | 0.866 (1.00×) | 0.863 (**1.00×**) | 0.673 (**0.78×**) | 0.890 (1.03×) | 0.847 (0.98×) |
| components | 221 (1.00×) | 206 (**0.93×**) | 139 (**0.63×**) | 222 (1.00×) | 183 (0.83×) |
| satchel centroid (0 = left of bbox) | 0.397 | **0.603** — the exact mirror | 0.385 | 0.705 | 0.202 |
| boot swatches | 5 | **the same 5** | **the same 5** | **10** ← the cuff | 6 |
| boot pixels | 111 | **111** | 110 | 111 | 114 |
| belt-row swatches | 12, incl. `#a4a3ad` buckle | **the front's 12 minus `#a4a3ad`; zero new swatches** | **the front's 12 minus `#eec092`; zero new swatches**, buckle kept at the leading edge | **adds `#765b4e`, `#fdfdfb`, `#f9db10`** | **adds `#765b4e`, `#f0c05f`, `#faec67`** |

**The whole-sprite swatch set, which is the strongest form of the guarantee.** Neither derived view
introduces a single colour the approved front does not already use:

| view | swatches present in the front but not here | swatches here but not in the front |
|---|---|---|
| back derived | `#f9db10` — the star, removed on purpose | **none** |
| side derived | `#765b4e`, `#eec092` | **none** |

Dominant frozen swatch per identity band, the measure `tools/palette/cross-view.mjs` uses:

| band | front | back derived | side derived | back-e | side-b |
|---|---|---|---|---|---|
| shirt/cap green | `#4bac53` | `#4bac53` ✅ | `#4bac53` ✅ | `#4bac53` | `#4bac53` |
| skin | `#ec9a70` | `#ec9a70` ✅ | `#ec9a70` ✅ | `#ec9a70` | `#ec9a70` |
| leather brown | `#53210c` | `#53210c` ✅ | `#53210c` ✅ | `#6e3620` ❌ | `#8f5230` ❌ |
| dark outline | `#53210c` | `#53210c` ✅ | `#53210c` ✅ | `#030202` ❌ | `#030202` ❌ |
| star yellow | `#f9db10` | absent (by design) | `#f9db10` ✅ | `#f9db10` | `#faec67` ❌ |

## Known imperfections — read these before reviewing

1. **The side is sparser than the front**, measurably: 0.78× edge density, 0.63× components. A
   profile has one eye instead of two, one arm instead of two, and no buckle face, so some of this
   is inherent — but it is a real difference and it is the opposite direction from the defect that
   got the last pass rejected.
2. **The side's head is authored geometry**, not a transformation (above).
3. **The star is not absent from the side** — 4 px of `#f9db10` sit at the leading edge of the crown,
   because the badge is on the cap front and from a profile you see it edge-on. If it should be
   absent from the side too, that is a one-line change (delete the star write in `deriveSide`).
4. **The aspect stretch is unfixed and applies to all three views equally.** `nearestResample` stretches the
   sprite ~16% horizontally at 32×48. The derived views inherit the front's stretch by construction,
   so switching the pipeline to `fitResample` later changes all three together — but these files
   would then be stale and must be rebuilt with `derive`.
5. **The back's nape is a flat band** of the front's own three hair swatches. It is the least
   information-rich region of the sprite. It cannot drift in colour, but it is plain.
6. **Small things on the side that will not survive a hard look:** the nose is a 1px bulge and
   barely reads; the mouth reads more as a jaw mark than a mouth; the near arm has a notch at the
   elbow where the squeeze dropped a column. All three are one-line changes in `SIDE_HEAD` /
   `deriveSide` if they bother you.
7. `assets/approved-trials/README.md` still names `b0-player-back-e` / `b0-player-side-b` as the
   selections. Those are the **rejected** ones. That file is outside this task's write scope and
   needs correcting by whoever owns it.
