# TROPHIC UI frames — what the code lane builds

This lane produced **art and a layout**, not code. Nothing under `game/`, `core/`, `data/`, `tests/`
or `tools/comfy/manifest.json` was touched. Everything below is what another session implements
against.

**Regenerate:**

```
npx tsx tools/ui-frames/render.ts          # the PNGs + the contrast reading
npx tsx tools/ui-frames/contact-sheet.ts   # the sheets with real text in them
```

**Output:** `assets/raw/_ui-frames/` — candidates, not approved. The manifest's `finalDir` for class
`ui-frame` is `assets/final/ui-frame`; promoting anything there is Hank's call.

**Note that `.gitignore:8` excludes `assets/raw/**`**, so none of the PNGs are committed and a fresh
clone will not have them. That is correct rather than a problem — the generator is committed and is
deterministic (no RNG anywhere; `raster.ts` uses an ordered dither, so there is no seed to lose), and
one command reproduces every byte. If the candidates should be tracked instead,
`assets/approved-trials/_ui-frames/` is the tracked home the `_player-views` convention already
establishes.

**Judge on:** `assets/raw/_ui-frames/_CONTACT-SHEET-light.png` and `-light-x3.png`. Every string on
them came out of `data/` — the dialogue line from `data/dialogue.json`, the ledger rows from
`game/survey-view.ts` run against a real `newSave`, the dex entry from `buildDexEntry`, the battle
card from `data/gyms.json`. Nothing is lorem, so a column that overflows there overflows in the game.

---

## 0. Three things in the commissioning brief were wrong

Stated first, because two of them change what gets built.

1. **There is no `ui-title-banner` row in `tools/comfy/manifest.json`.** The six `ui-frame` rows are
   `ui-dialogue-box` 480×96, `ui-menu-panel` 160×320, `ui-battle-hud-frame` 240×64,
   `ui-ledger-panel` 480×320, `ui-dex-card-frame` 320×320 and **`ui-sign-card-frame` 240×160**. The
   banner is real but it is pinned in *code*, not in the manifest: `game/scenes/TitleScene.ts`
   already draws `placeholderImage(…, "ui/title-banner", BANNER_W = 208, BANNER_H = 48, { note:
   "unbuilt — no manifest row exists (see comment)" })`. Seven frames are therefore generated: the
   manifest's six, plus the banner at the size the running game already reserves. **Shipping the
   banner needs a manifest row Hank has to authorise.**

2. **`game/ui/ListMenu.ts` does not exist.** `ListMenu` is declared inside
   `game/scenes/MenuScene.ts` (its own header says why: "Lane C1's file scope is boot/menus and a
   shared UI module is not yet earned"). `TitleScene` imports it from there. Any instruction to
   "look at `game/ui/ListMenu.ts`" has no target.

3. **`DialogueScene` reads `balance.map.virtualWidth/Height` for its geometry — but its COLOURS are
   four raw hex literals**, none of them one of the 32 frozen swatches:
   `game/scenes/DialogueScene.ts:95–98` — `boxColor: 0x101317`, `borderColor: 0xe8e4c9`,
   `textColor: "#e8e4c9"`, `dimColor: "#7d8478"`. `#e8e4c9`, `#7d8478` and `0x101317` are the exact
   hexes `game/scenes/RetirementScene.ts:911–912` and `game/ui/SeasonMeter.ts:327–328` record *as the
   defect they replaced*. They are live in two other scenes.
   The suite is green on this because `tests/unit/survey-view.test.ts:2555–2563` holds a per-file
   **ceiling** and `DialogueScene.ts` is listed at exactly `4/4`. Landing this spec replaces all four
   with roles, so **lower that ceiling to 0 in the same change** or the ban stops binding the file.

**Confirmed correct:** the pinned sizes are in *virtual* pixels and are already at presentation scale.
`game/boot.ts` `canvasZoom` floors the window fit to an **integer** and `createGameConfig` sets
`pixelArt: true` / `antialias: false` / `roundPixels: true`, so one design pixel is one virtual pixel
and a 1080p window draws every frame at exactly 3× nearest-neighbour.

---

## 1. The decision: the plates are LIGHT

Both polarities were generated and put in front of real text. `assets/raw/_ui-frames/` holds both;
`--theme=dark` and `--theme=light` regenerate either.

**Light wins, and the argument is a measurement rather than a taste.**

Gold's box is a **dark keyline around a light field**. The field behind every panel in this build is
`void` (c00). So under the dark polarity a `void` outer keyline measures **1.00 : 1** against the
screen it is drawn on — a black line on a black screen is not an edge — and the box has to invert:
a light rim outside, a dark line inside. That is a raised bevel, and a bevel is not a Gold box. Under
the light polarity nothing has to invert: the keyline stays `void`, it merges into the dark field
exactly the way Gold's does over a dark scene, and the near-white plate carries the whole edge at
**19.15 : 1**.

The second argument is on the contact sheet and cannot be argued from a table. Over
`assets/final/maps/hearthollow.png` — orange-brown ground, mid-green canopy — the dark plate
(`panel` c06, a warm taupe) sits at almost the same value as the dirt path and the dialogue box has
to be looked for. The cream plate is found instantly.

### What light costs

`UI_SWATCH` in `game/ui/Palette.ts` is currently a **dark-plate / light-ink** table, and its header
records that as a deliberate un-inversion. Moving the plate to `cursor` (c03) means:

| role | today | on a light plate | measured on c03 |
|---|---|---|---|
| `panel` (the plate) | `c06` | `c03` | 19.15 : 1 on the void |
| `text` | `c03` | `c04` (today's `cursorInk`) | 15.74 : 1 |
| `textMuted` | `c15` | `c07` (today's `cursorInkMuted`) | 5.82 : 1 |
| `textDisabled` | `c12` | `c19` today / **`c09` recommended** | 5.68 / **3.77** — see §7 |
| `border` (the keyline) | `c12` | `c00` | 19.15 : 1 |
| `accent` **on a plate** | `c16` | `c04` | see §7 |

**No new swatch is needed.** `cursorInk`/`cursorInkMuted`/`cursorInkDim` are *already* the ink ladder
measured against a `cursor` surface — the light-plate ladder exists, it is just currently used for a
one-row selection bar. Two consequences follow and both are Gold-correct:

- **The menu's selection bar goes away.** A light bar on a light plate is nothing. The cursor becomes
  the **▶ glyph**, which is what Gold uses and what `MenuScene.ListMenu` already draws
  (`row.setText(\`${selected ? "▶ " : "  "}${item.label}\`)`). `BattleMenuPanel`'s `cursor` rectangle
  is the one widget that has to change.
- **The gold accent does not survive.** `accent` (c16 #f8d80f) reads **1.32 : 1** on c03, and no other
  saturated swatch clears 4.5 : 1 there. Gold does not need one — its box cursor is a black ▶ and its
  advance mark a black ▼. The gold stays where it already earns its 14.51 : 1: over the dark field
  (the crit flash, the catch burst, the title wordmark).

**Screens with no plate keep the ladder they have.** `game/menu-model.ts` `UI_SWATCH_ID` is tuned
against `void` and says in its own comment that the cursor-ink roles read 1.2 / 3.3 / 3.4 : 1 there.
The title byline, any warning note, and anything else drawn straight on the field stays on
`UI_SWATCH_ID`. A screen may hold both ladders as long as **every line knows which surface it is on** —
that is precisely what the shipped defect in `Palette.ts`'s header was.

**If Hank prefers dark**, everything below still applies except the role column; `--theme=dark` PNGs
are already written and every pairing clears its floor. It just does not read as Gold.

---

## 2. The border idiom — one box, seven frames

Reading outward from the middle: a **flat fill**, a **2px inner ring**, a **2px outer ring**, square
corners, no anti-aliasing, no gradient, no soft shadow. Three colours. That is the whole of it, and
it is what `assets/reference/gen2/violet-city-gs.png` does on every building at native resolution —
a hard dark keyline, a pale line inside it, then a flat field.

| element | role (light) | role (dark) | measured |
|---|---|---|---|
| outer ring (against the field) | `void` | `border` | 19.15 / 10.95 |
| inner ring (against the fill) | `panel` | `void` | 6.15 / 3.12 |
| fill | `cursor` | `panel` | 19.15 / 3.12 on the void |
| horizontal rule | `panel` | `border` | 6.15 / 3.52 |
| recess keyline | `void` | `void` | — |
| recess fill | `border` | `void` | 1.75 / 3.12 |
| recess dither (lit pixel) | `panel` | `border` | 3.52 / 10.95 |

**Ring thickness is 2px, not 1.** Gold carries a 1px border on a 160×144 screen; build-doc §9 records
this project's art pixel as "1 native px, tile 16 native px — **2× a GBC's density**" on a 480×320
virtual screen. A 1px keyline here is proportionally between a half and a third of Gold's, and the
first cut showed it: at 1× the box read as a hairline CSS div. Chrome is therefore **4px** all round.

**Corners are square.** The first cut chamfered them on the assumption that Gold's boxes are
pixel-rounded. They are not — the reference shows every building's keyline turning a hard square
corner — and at 1× the missing pixel read as damage rather than rounding. A chamfer is a Gen 3 habit.

**The one mark that is ours** is a **corner bracket**: the outer ring's colour laid over the inner
ring for **8px along each axis** from each corner, so the corner thickens to the full 4px for a short
run and reads as a reinforced tab, the way a field register's corners are. Hold content distance, not
visual distance — the idiom stays Gold's; the corner is where this game signs it.

> ⚠ **6 AND 8 ARE THE SAME MARK FROM TWO ORIGINS, and this note had the colours backwards.** Read off
> `assets/final/ui-frame/ui-dialogue-box.png` at y = 2 (a bracket row): `#040308` — the OUTER ring's
> colour — runs x = 0…7, and the inner ring's `#74564e` RESUMES at x = 8. So it is not `#74564e` that
> "runs to 8"; `#74564e` is what the bracket is painted over. `frames.ts` `BRACKET_LEN = 6` measures
> the run from the inner ring's corner (x = `RING_PX` = 2), which lands at 8 from the edge. Both
> numbers are right about different things; **8 from the edge is the one a sweep starting at the edge
> has to clear**, and it is what `INVARIANT_MARGIN_PX` is sized against. All three nine-sliced frames
> agree on 8; the sign card is a different idiom (§4.6) and does not carry a bracket at all.

**Colour counts, measured** (`render.ts` prints them): 3 for the five plain frames, 4 for the ledger
and the dex card (they add the recess fill), 5 for the sign card, 3 for the banner. The brief's budget
was "if it needs eight, it is wrong."

---

## 3. Nine-slice

**Only three frames stretch.** The other four are drawn at exactly their own size and therefore may
carry interior structure — a recess, a rule, a wordmark — that a stretching middle band would tear.

| frame | file | mode | slice boundaries | drawn at |
|---|---|---|---|---|
| `ui-dialogue-box` | 480×96 | **nine-slice** | x **4** / **476**, y **4** / **92** | 464×68 at (8, 244) |
| `ui-menu-panel` | 160×320 | **nine-slice** | x **4** / **156**, y **4** / **316** | caller's size |
| `ui-battle-hud-frame` | 240×64 | **nine-slice** | x **4** / **236**, y **4** / **60** | 150×46 |
| `ui-ledger-panel` | 480×320 | fixed 1:1 | — | 480×320 at (0, 0) |
| `ui-dex-card-frame` | 320×320 | fixed 1:1 | — | 320×320 at (0, 0) |
| `ui-sign-card-frame` | 240×160 | fixed 1:1 | — | wherever the prop is |
| `ui-title-banner` | 208×48 | fixed 1:1 | — | 208×48, centred at (240, 46) |

✅ **LANDED. `SLICE_PX` IS GONE; IT WAS TWO NUMBERS AND IT IS NOW TWO CONSTANTS.** `frames.ts` exports
`FRAME_CHROME_PX = 4` (the slicer's boundary — where chrome ends) and `INVARIANT_MARGIN_PX = 10` (the
verifier's sweep — outside the corner mark). `render.ts` prints the first and sweeps with the second;
`contact-sheet.ts` slices with the first. Each constant carries its own reason, what it is NOT, and
what breaks if they are unified again, and `tests/unit/ui-frames-slice-constants.test.ts` requires
each one to FAIL at the other's job so the merge cannot come back green. The rest of this section is
the argument that produced the split, kept because it is the measurement.

⛔ **THE ORIGINAL REASONING WAS WRONG TWICE OVER** — "it has to cover the 4px of chrome plus the 6px
corner bracket" — and the second error is the damaging one.

**THE SLICE IS THE CHROME, AND THE CHROME IS 4.** Measured on `assets/final/ui-frame/ui-dialogue-box.png`
at y = 8, scanning in from the left edge: `#040308` at x = 0–1, `#74564e` at x = 2–3, and plate
`#faf7eb` from x = 4. So the boundary between chrome and plate is at **4**.

**A corner piece cut at any slice wider than the chrome contains PLATE**, and a nine-slice draws its
corners at natural size into the corners of whatever it is stretched to. At a 10px slice each of the
four corners therefore carries a **6×6 block of `#faf7eb`** — the plate colour, which is also the
invisible-text colour — painted into the panel's corners. At 8 it is a 4×4 block. Only at 4 is the
corner chrome and nothing else. Counted rather than quoted: `nineSlice`-ing `ui-dialogue-box` down to
its drawn 464×68 at 10 leaves exactly **36** plate pixels in the top-left corner piece, and **0** at
`FRAME_CHROME_PX`. `game/ui/FramePanel.ts` slices at 4 and is bound by a pixel sweep over all six PNGs.

**The table above now prints the real boundaries** — x 4 / width−4, y 4 / height−4 — and so does
`render.ts`'s `slice` column, which used to print 10 while the shipped drawer cut at 4.

⚠ **AND THE TRADE THIS BUYS, recorded rather than glossed:** the bracket runs to 8, so with a 4px slice
its outer 4px (x = 4…8) falls inside the **stretched edge strip**, not the fixed corner. A stretched
edge resamples those 4px by the panel's scale factor, so the corner tab does not hold its natural size
the way the chrome does. That is a real cost of slicing at the chrome width; it is accepted because the
alternative is a block of invisible-text-coloured plate in every corner, which is worse. Both halves of
that trade are in the comment on `FRAME_CHROME_PX`, so nobody widens the slice back to make the tab
crisp on the strength of half of it.

⚠ **AND WHY THE VERIFIER KEEPS 10.** `render.ts`'s translation-invariance check inspects the strip
*outside* the corner marks, and at 4 it sweeps x = 4…width−4, which includes the bracket — a corner
mark, deliberately **not** translation-invariant. Driven at `FRAME_CHROME_PX` it reports
`top edge is not translation-invariant at x=8` on all three sliced frames, and note *which* column
that is: the sweep anchors on x = 4, inside the bracket, so the first column that disagrees with the
anchor is the first **correct** one. A verifier run at the slicer's number does not merely go red — it
names the sound part of the frame as the defect and the mark as the norm, and anyone fixing the art to
satisfy it would file the bracket off. That inversion is asserted, not described.

**Tile or stretch — it does not matter, and that is checked, not asserted.** Every edge strip of every
nine-sliced frame is *translation-invariant*: `render.ts` verifies that every column of the top and
bottom strips is identical to every other, and likewise every row of the left and right. So the two
modes emit the same pixels and an implementer cannot get a different frame by picking the other one.
`tools/ui-frames/raster.ts` `nineSlice()` is the reference implementation — the contact sheet renders
every stretchy frame through it, so the sheet shows the frame at the size the *widget* will draw it,
not at the size the PNG happens to be.

**Never resample.** `pixelArt: true` means the only legal transform is integer nearest-neighbour.
Phaser's `NineSlice` game object with `leftWidth/rightWidth/topHeight/bottomHeight` all
`FRAME_CHROME_PX` (**4**, never the verifier's 10) does the right thing; a plain `Image` with
`setDisplaySize` does not and will smear the keyline.

---

## 4. Per-frame layout

Coordinates are **local to the frame** unless stated. Every text origin is a Phaser `add.text` y —
the **top of the box**, not the baseline.

### 4.1 `ui-dialogue-box` — 480×96, nine-sliced to 464×68 at (8, 244)

Geometry is `DialogueScene`'s own and does not change: `margin 8`, `pad 8`, `lineHeight 13`,
`charWidth 6`, `bodyLines 3`, `fontSize "10px"`. Chrome is 4px, so `pad 8` leaves 4px of clear plate
before the first glyph — the border never touches the type.

| element | position | role | size |
|---|---|---|---|
| speaker name plate | (16, 252) screen | `textMuted` | 10px |
| body rows ×3 | (16, 265 / 278 / 291) | `text` | 10px |
| advance marker ▼ | right-aligned at x 458, y 291 | `accent` | 10px |

74 columns at a 6px advance. The sample line — `maren.tutorial.survey`, 146 characters — wraps to
exactly three rows and fills the box without touching the marker.

**Choice panel:** `DialogueScene.drawChoices` draws a second box above at the same width, height
`pad*2 + lineHeight*rows`. Same texture, same slice. Cursor `▶` in `accent`, unselected rows in
`textMuted`.

### 4.2 `ui-menu-panel` — 160×320, nine-sliced

Used at four sizes. See §6 for what goes in it.

### 4.3 `ui-battle-hud-frame` — 240×64, nine-sliced to 150×46

`BattleHud` `CARD_GEOMETRY`: `cardW 150`, `cardH 46`, `hpBarW 92`, `hpBarH 5`, `CARD_PADDING 4`.
The frame supplies the plate only.

**The HP well is the widget's, not the texture's.** A recess whose width follows `hpBarW` cannot live
in a nine-slice's stretchy middle. `BattleHud` already draws the track and the bar as rectangles; add
a **1px `void` stroke** around the track and it is a sunken well. One line, and it keeps the texture
sliceable.

### 4.4 `ui-ledger-panel` — 480×320, fixed, the survey screen

`tools/ui-frames/frames.ts` `LEDGER` is the authority; these are the numbers.

| band | y | contents |
|---|---|---|
| heading | 6 | `<node> — year <y> · <season>` — `text` 10px |
| totals | 18 | `flora X/Y · recent deaths Z · lines N · individuals T · at 0: A` — `text` |
| presence | 30 | `presence: <names>` — `textMuted` |
| rule | 45 | `rule` |
| column header | 49 | `line          count  cap  breed  seasons` — `textMuted` |
| **register** | 62, height 228 | recess band, `recessFill`, closed top and bottom by `recessLine` |
| rows | 66 + 14·i, **i = 0…14** | `text` 10px, one `rule` hairline at +13 in each row's pitch |
| rule | 292 | `rule` |
| footer | 296 | `n/N  ←/→ node  TAB web  ESC` — `textMuted` |

Text left edge stays **8** (`survey-view.ts` `SCREEN_TEXT.padPx`).

**Two changes to `game/survey-view.ts` / `game/scenes/SurveyScene.ts` are required, and both are
repairs.**

- **The line origins move.** `SurveyScene` draws every line at `y = 8 + 12·i` with a 10px font — a
  12px pitch under a ~12px glyph box, so consecutive lines touch and **there is no gap anywhere on
  the screen for a rule to sit in**. Measured on the shipped layout: heading 8, totals 20, presence
  32, column header 44, first row 56; a rule at any of 19, 31, 43 or 55 lands inside a descender. The
  band table above gives the layout the rhythm it does not have.
- **`SCREEN_TEXT.lineHeight` goes 12 → 14 *for the register only*.** Those two pixels are what let the
  rows be ruled. Capacity drops from 20 rows to 15; the largest shipped node carries **seven**
  populations (`data/nodes/bowerdeep.json`, `r3.json`), so that is eight rows of headroom.

Why rule it at all: unruled, a 228px register holding six live rows is ~170px of flat colour — the
large dead zone EVAL-STANDARD §1.5 names, and exactly what the first cut produced. Ruled, the empty
part of the screen becomes the thing the screen is *about*: a field register with lines left to fill
in.

**Also fix while you are here:** `SurveyScene` has no clamp. A node with more rows than fit draws over
the footer and off-canvas. `rows.slice(0, LEDGER.rows)` plus a `▼` when there are more.

### 4.5 `ui-dex-card-frame` — 320×320, fixed. **The dex is two panes.**

`ui-dex-card-frame` is 320 wide, `ui-menu-panel` is 160, both are the full 320 tall, and
**320 + 160 = 480 = `balance.map.virtualWidth`**. That is the manifest telling you what the screen is:
the species card on the left, a scrolling list of lines on the right. It is also the only reading
under which a 320×320 card has anywhere to live on a 480×320 display — drawn centred it leaves 80px
of dead field down each side, which is what the first cut looked like.

It fixes what `DexScene` is *missing* rather than what it draws wrongly: today the dex is `←/→`
through 27 lines with no list, so a player hunting a particular line pages for it blind.
`DexScene.step()` already wraps modulo `entries.length`; the list is a view of the same cursor.

**Card, at (0, 0):**

| element | position | role |
|---|---|---|
| identity line (`entry.dexId`) | (16, 14) 10px | `text` |
| rule | y 32 | `rule` |
| **portrait well** | (16, 40) **128×128** | `recessLine` keyline *outside* the box, ordered dither inside |
| lines 1–2 beside it | (156, 46) and (156, 60) 10px | `text` |
| rule | y 176 | `rule` |
| body lines ×7 | (16, 184 + 14·i) 10px, hairline `rule` at +13 | `text`; a flag row takes `accent` |
| rule | y 284 | `rule` |
| footer | (16, 290) 10px | `textMuted` |

The well is **128×128 because that is `survey-view.ts` `DEX_ART_BOX.width/height` exactly** — the size
the dex already asks `placeholderImage` for. Only its origin moves: `DEX_ART_BOX` becomes
`{ x: 16, y: 40, width: 128, height: 128 }`. The well is dithered (one pixel in four, `recessDither`
on `recessFill`) so an empty slot reads as *empty* rather than as a colour swatch.

Only **two** lines go beside the portrait. `renderDexEntry`'s third line is
`individuals in region N · all forms` — 36 characters, where the column beside a 128px portrait on a
320px card is 24. The first cut let four run there and that line drew off the card's right edge onto
the field.

**List pane, `ui-menu-panel` nine-sliced to 160×320 at (320, 0):** rows at (340, 12 + 14·i), 10px,
20 visible, cursor `▶` in the gutter at x 328, `n/N ▼` at the foot in `textMuted`. Scrolls to keep
the cursor inside the window — `BattleMenuPanel.menuPanelModel` already implements exactly that
windowing and is a pure function; reuse it rather than writing a second one.

### 4.6 `ui-sign-card-frame` — 240×160, fixed. **A world prop, not a panel.**

`core/types.ts` `PROP_KINDS[sign-card]` puts this in the world — bible §5's legibility requirement,
the card that flags a migrant dormant or migrating. It is painted from the palette's **wood band**,
not from the UI plate roles, because a sign that used `UI_SWATCH.panel` would be a menu lying in a
field.

`tools/ui-frames/theme.ts` `SIGN_SWATCH_ID` — **proposed roles, not in any shipped table:**

```
keyline   c00   the hard outline; the same swatch UI_SWATCH.void names
woodDark  c05   the shadowed side of the carve — bottom and right
wood      c09   the plank body
woodLight c10   the lit side — top and left
face      c15   the recessed face the words are cut into
```

7px bevel, 3px lit along the top and left, 3px shadowed along the bottom and right, hard, no
interpolation. The exterior is **transparent** and the plank sits on a **2px `keyline` base edge** —
EVAL-STANDARD §1.6 draws the line exactly here: a soft offset gradient is a fail, a hard dark base
edge is the correct Gold convention and is what every Gold building and tree sits on.

Four **2×2 `keyline` peg heads** at the corners of the bevel, and nothing else. The first cut ran
single dark pixels on a 6px column pitch through the top and bottom bevel as plank grain; at 3× it
read as a ruler scale, which is the sort of unexplained mark EVAL-STANDARD §1.3 counts as a defect.
A sign is nailed up; four pegs say so in eight pixels.

Sign text goes on the face at (16, 18 + 14·i), 10px, in `keyline`.

### 4.7 `ui-title-banner` — 208×48, fixed, **transparent, no plate**

TROPHIC as seven hand-set 8×11 glyphs at 2× (16×22 each, 2px apart, 136px wide, centred). Gold fill
(`accent` c16 — 14.51 : 1 over the void), a **2px hard `void` outline**, a 2px hard `void` drop at
(+4, +4), and a 2px `border` rim outside all of it so the word holds its shape over a painted
background as well as a dark one. No box: Gold's title logo sits on the art, and the first cut's dark
plate fought the cream menu plate below it.

Lettering is legitimate here and the reason is EVAL-STANDARD §1.2's own: the rule against lettering is
a **tool** limitation — `z_image_turbo` cannot render legible text, "not a style law" — and Gold
renders "MART", "GYM" and "POKÉ" legibly on its buildings. Nothing diffuses these; they are set pixel
by pixel and are legible by construction.

`TitleScene` draws it at `placeholderImage(this, width/2, 46, "ui/title-banner", 208, 48)` today —
swap the placeholder for the texture and the call site is unchanged.

---

## 5. What the widget owns, and what the texture owns

**The texture owns:** the plate, both rings, the corner brackets, every horizontal rule, the recess
bands and the portrait well (including its dither).

**The widget owns:**

- **All text.** No string is baked into any PNG except the title wordmark.
- **The cursor.** A `▶` glyph in `accent`, drawn in a 14px gutter. Not a bar — see §1.
- **The HP track and bar**, plus the 1px `void` stroke that makes the track a well (§4.3).
- **Clamping.** The frames declare a row capacity (`LEDGER.rows = 15`, `DEX_CARD.bodyLines = 7`,
  20 for the dex list). Nothing in `game/` clamps today.
- **Scroll indication.** A `▼` / `▲` in `textMuted` at the foot of a list that has more.
- **Season tint.** If `game/season-tint.ts` tints the scene, panels must be **excluded** — a tinted UI
  plate is a different colour from the one the contrast gate measured.

**Load one texture for the three stretchy frames.** They are byte-identical apart from size, and that
is the design: a dialogue box, a menu panel and a combatant card that used three different borders
would read as three games. Gold uses one box everywhere. Three files exist because the manifest
enumerates three rows; the widget needs `ui-dialogue-box` and can nine-slice it to all three.

---

## 6. The menus themselves

### 6.1 The session menu should be a right-hand panel

Today `MenuScene.#buildSession` draws a full-width list at `x = 12, width = 456`, with each row's
`detail` on a second, indented, dimmer line beneath it. Two problems, both visible on the contact
sheet:

- **The details dominate.** Seven rows each carrying a wrapped sentence is a wall of small grey text
  where the player wanted a list of seven words. Gold's start menu is a column of nouns.
- **It is a full screen for a seven-item list.** The overworld is hidden behind it for no reason.

`ui-menu-panel` at 160×320 is the answer, and is presumably why the row is in the manifest.

```
panel   140 × (pad 8 ×2 + 16 × rows)   at (480 − 140 − 6, 6)
rows    10px, pitch 16, cursor gutter 14px, labels start at panel-local x 22
detail  the FOCUSED row's detail only, in a one-line strip at the foot of the screen —
        ui-dialogue-box nine-sliced to 464 × (8×2 + 13) at (8, 291), textMuted 10px
```

Eight rows → 144 tall. `BACK TO TITLE` is 13 characters — 78px at a 6px advance, plus a 14px gutter
and 2×8 padding, so 132 is not enough and **140 is**.

**Row text goes 8px → 10px.** The menus and the title are the only 8px screens in the build
(`MenuScene.uiText` defaults to 8); every other screen draws at `SCREEN_TEXT.fontPx = 10`. On the
sheet the difference reads as two different games sharing a cartridge, and 10px is also closer to
Gold, whose menu text is proportionally larger than either.

### 6.2 BAG, when it exists

`unbuilt("BAG", "build-doc §15 C4")` today. It should be **the two-pane shape the dex uses**, because
it is the same problem — a list of things with a description of the selected one:

```
left    ui-menu-panel  160×320 at (0,0)   the item list
        rows 10px, pitch 16, 18 visible, cursor ▶ in the gutter
        label left, COUNT right-aligned at panel-local x = 160 − 8 − 4, in textMuted
        (BattleMenuPanel already renders a label/detail pair exactly like this — reuse
         menuPanelModel for the windowing and the 2×2 role table.)
right   ui-dex-card-frame  320×320 at (160,0)
        identity line   the item name              (16, 14)  text
        rule            y 32
        portrait well   64×64 at (16, 40)          the item icon, dithered when unbuilt
        beside it       "N held"                   (92, 46)  text
                        "snare · bait · medicine"  (92, 60)  textMuted
        rule            y 176
        body            the item's own description, ruled, 7 lines from y 184
        footer          "ENTER use   ESC back"     (16, 290) textMuted
```

**A row is greyed by the model, never by the widget** — `BattleMenuPanel`'s header is explicit that a
widget which greys on its own reasoning is a second rulebook (INV-3). "Cannot be used here" must come
from wherever the bag's rules live, the way `MenuEntry.disabled` comes from `illegalActionReason`.

**G7 applies to every item description.** Counts and effects, no opinion about catching. A bait item
says what it multiplies; it does not say what the player is doing to the region.

### 6.3 QUESTS, when it exists

`unbuilt("QUESTS", "build-doc §15 C7")`. Not the same shape — a quest has **state** and a **place**,
and both belong on the row rather than behind a selection. Full-width, on `ui-ledger-panel`, because
it is a register:

```
heading   6     "QUESTS — year <y> · <season>"                 text
totals    18    "open N · done M"                              text
rule      45
columns   49    "quest                    where       state"   textMuted
register  62, height 228 — rows at 66 + 14·i, 15 of them, each ruled
          quest name   padEnd 24
          where        padEnd 12   the node's own name
          state        open | done | <what is still needed>
rule      292
footer    296   "↑↓ quest   ESC back"                          textMuted
```

**Ink by state, and this is the whole design:** an open quest in `text`, a done one in `textDisabled`,
and the *blocked* half of a chain in `accent` — the row that tells the player where to go next is the
one row on the screen with a colour.

**It must not be gated on a flag nothing writes.** `tests/gates/reachability.test.ts` exists because a
green suite once certified 39 unreachable dialogue entries; a quest row whose `state` reads a flag no
code sets is the same defect with a different surface. Every state string a row can show needs a
producer outside the test.

### 6.4 Other things in the current menus worth changing

Findings, not opinions — each one was looked at.

- **Three parallel palette tables, no owner.** `UI_SWATCH` (`game/ui/Palette.ts`, battle),
  `UI_SWATCH_ID` (`game/menu-model.ts`, menus/title) and `SCREEN_SWATCH_ID`
  (`game/survey-view.ts`, survey/dex/summary). Five of six shared roles agree; the live divergence is
  `inkFlag` c13 versus house `accent` c16, already flagged in-file as an open role question. Adding
  plates does not need a fourth table — it needs `UI_SWATCH` to grow *surface* entries (§7).
- **Two font scales.** 8px for menus/title, 10px for everything else. §6.1 unifies on 10.
- **No screen scrolls.** Survey pages by node, dex by entry, summary by creature — all wrap-around
  modulo with an `n/total` counter. That is fine for 12 nodes and 6 party members; it is not fine for
  27 dex lines, which is why §4.5 adds the list.
- **`ListMenu` has no viewport.** It draws every row unconditionally, with no clipping and no scroll
  indicator (`MenuScene.ts:142–176`). Overflow is prevented upstream by capping the title's warning
  block at four lines. A bag or a quest log will exceed it. Give it the window `menuPanelModel`
  already computes.
- **The battle message box is 46px tall for one 8px line** (`BattleLayout` `MESSAGE_H = 46`,
  `MESSAGE_FONT = "8px"`). On the sheet it is a mostly-empty box. Either two 10px lines at a 13px
  pitch — which matches the dialogue box and gives long captions room — or a shorter box.
- **The battle message box is full-bleed** (`{ x: 0, y: height − 46, w: width }`) while every other
  panel is inset 4. Gold's is full-bleed too, so this is a choice rather than a bug — but decide it
  rather than inheriting it, because the frame's bottom keyline currently lands on the screen edge.
- **The title screen has nothing on it.** Banner placeholder, three bare rows, a byline. §4.7 gives it
  a wordmark and §6.1's panel gives the rows a plate; the sheet shows both.
- **`game/placeholder.ts:452` and `:644` paint `#101010`/`#f0f0f0`** — the only off-palette hex the
  dex, summary and title actually reach, through the art-slot border. The file argues its ink is
  deliberately palette-free (it must work when there is no palette). Reasonable; worth a second look
  now that every art slot sits inside a frame that *does* have one.

---

## 7. The contrast gate — the hole this lands in

`tests/gates/ui-contrast-contract.test.ts` derives **roles** from the live tables and **hexes** from
`data/palette.json`, so a brand-new role added to an existing table is covered automatically (it falls
to `spec.fallback` at the strictest `text` tier, and line 480–494 asserts that property against a
synthetic role).

**It does not derive which SURFACE a role is drawn on.** `SPECS.surfaces` is a hand-written list, and
`UI_SWATCH_ID` — the menu table — declares **no overrides at all**, i.e. every menu role is assumed to
be on the void. **Putting a plate behind the menus is exactly the case the gate does not cover.** It
will stay green over pairings nothing measured.

So: **add a `Surface` entry for every row below when the frames land.** `render.ts` prints this table
with live numbers, and it is the hand-off.

| what | fg | bg | tier | measured (light) |
|---|---|---|---|---|
| plate on the field | `cursor` c03 | `void` c00 | mark (3) | 19.15 |
| outer line on the plate | `void` c00 | `cursor` c03 | mark | 19.15 |
| primary ink on the plate | `cursorInk` c04 | `cursor` c03 | text (4.5) | 15.74 |
| muted ink on the plate | `cursorInkMuted` c07 | `cursor` c03 | text | 5.82 |
| refused ink on the plate | `cursorInkDim` c19 | `cursor` c03 | inactive (3) | 5.68 |
| rule on the plate | `panel` c06 | `cursor` c03 | mark | 6.15 |
| recess fill in the plate | `border` c12 | `cursor` c03 | plate (1.1) | 1.75 |
| recess dither on the recess | `panel` c06 | `border` c12 | mark | 3.52 |
| inner line on the plate | `panel` c06 | `cursor` c03 | mark | 6.15 |
| inner line on the outer line | `panel` c06 | `void` c00 | mark | 3.12 |

One row is deliberately **not** a failure: `outer line on the field` is `void` on `void`, 1.00 : 1, and
it is correct — Gold's black keyline over a dark scene merges into it and the plate carries the edge.
`render.ts` scores it in an `edge` tier that floors at 1.0 and reports the number. Scoring it as a
failure would be a metric getting worse while the picture got better.

Also carry over the invariants that live in `tests/unit/battle-view.test.ts` and are stricter than the
gate: `text > textMuted > textDisabled` on the plate, primary/muted separation `> 1.2`, and
`plate on void ≥ 2`. All three hold under the light polarity by wide margins.

### The one thing this lane could not decide

**`textDisabled` on a light plate.** `cursorInkDim` (c19 #2d6f38) measures 5.68 : 1 and is perfectly
legible — and it is a **green**, so on a cream plate a refused row reads as *marked*, not as *shut*.
On the contact sheet, BAG and QUESTS are the two most eye-catching rows in the session menu. That is
the inversion `Palette.ts`'s header was written about, one hue later.

Every swatch in the band a dim role must occupy on a c03 plate — at or above the `inactive` floor of
3 : 1, below `cursorInkMuted`'s 5.82 so the ladder does not invert:

```
c20 #6a9827  3.19  green      c25 #399985  3.22  teal
c09 #aa7241  3.77  WARM MID   c28 #2178bb  4.38  blue
c08 #c72a1b  5.18  red        c19 #2d6f38  5.68  green (current)
```

**One of the seven is not a hue.** `c09` is the only neutral, and a greyed row wants to be a neutral —
that is what "greyed" means. `_CONTACT-SHEET-light.png`'s session menu paints **BAG with c19 and
QUESTS with c09** so the difference is in the picture rather than in the table.

The cost, stated: **c09 is already `danger` in `menu-model.ts` and `inkCollapsed` in
`survey-view.ts`.** One swatch would carry "this failed", "this line collapsed" and "this row is
shut". Those are three sentences, and `Palette.ts` is explicit that one role must not do two jobs. So
this is a **question for Hank**, not a change this lane may make — the alternative being that the
class-equal fit has no second neutral in that band and the palette would need one.

---

## 8. Still wrong, or still open

Said plainly, because an oversold result costs more than a flawed one.

1. **The body text is anti-aliased browser monospace, and at 3× it is the least pixel-art thing on
   the screen.** `MenuScene.uiText` and every `SCREEN_TEXT` draw calls Phaser's `add.text` with
   `fontFamily: "monospace"`; `pixelArt: true` then upscales the anti-aliased glyphs nearest, so the
   grey fringes become 3×3 grey blocks. The contact sheet renders text the same way *on purpose* —
   setting it in a crisp hand-made face would have hidden this. **A bitmap font is the single biggest
   remaining upgrade to how this game looks**, and it is a code-lane job, not a frame job. It is also
   the last thing standing between these screens and a straight-faced comparison with
   `violet-city-gs.png`.
2. **The reference set contains no UI at all.** `assets/reference/gen2/*.png` are eight overworld
   maps. The idiom above is derived from what those maps *do* — hard keyline, pale inner line, flat
   fill, square corners, dither — plus Gen 2 convention. If Hank wants the frames checked against a
   real Gold text box, a screenshot of one needs to go in that folder.
3. **The dex card still has ~60px of quiet plate below the last body line** on a four-line entry.
   Ruling it turned a dead zone into a field record, which is the best available answer at a pinned
   320×320, but it is not *full*. A six-line entry (regional count + two flags) fills it.
4. **The battle field is empty on the sheet.** The frames are drawn over flat `void` with no
   combatant sprites, because sprites are lane B's. Judge the cards, not the screen.
5. **Nothing here is tested.** G14 says nothing is done before its named tests exist and pass — and
   these are PNGs and a spec, not behaviour. The tests this implies belong to the code lane: the
   `Surface` entries in §7, a slice-boundary assertion, and a check that the frame textures load. The
   generator's own mechanical checks (colour count, edge translation-invariance, pairing floors) run
   in `render.ts` and print, they do not gate.
6. **`assets/raw/_ui-frames/` holds 33 files** — seven frames × two polarities × (1× and 3×) = 28,
   plus two contact sheets per polarity and a README. Once a polarity is chosen, run
   `render.ts --theme=<the winner>` into a clean directory and the other 14 stop existing.
7. **This lane wrote nothing into `docs/`.** `docs/STATUS.md` and `docs/TICKETS.md` are the homes for
   the open question in §7 and the work in §4–§6, and both files are being edited by a concurrent
   lane right now (`git status` shows them dirty). Two sessions appending to one file is the hazard
   parallel work is supposed to avoid, so the entries are stated here and left for whoever owns those
   files to fold in.
