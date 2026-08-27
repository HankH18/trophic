# The owner's eval standard — read this before judging any generated image

Every rejection below is Hank's, from a real review pass. They are quoted rather than paraphrased
because the paraphrase is where the standard leaks. **An image that clears every mechanical contract
and fails this file is a reject, not a revision.**

The reason this file exists: a full round of twelve maps passed every contract in `tools/artverify`
— edge exits, spawn centre, scale band, prop placement — and the owner's one-line response was
*"This looks like it was made in MS Paint."* Contracts measure whether the picture obeys the game.
This measures whether it is any good.

---

## 0. The rule that governs the rest

> **A metric that improves while the artefact gets worse is measuring the wrong thing.**

The answer is never to weaken the gate. It is to **look at the image before trusting the number**.
Three failures in one night came from the opposite habit:

- `flat%` was reported as rising 0.00% → 78% and called a win. It was measuring one enormous
  unbroken green field. Real Gold grass is dithered and would score *lower*.
- ControlNet strength 0.9 was chosen because it scored best on exits and scale. It also halved edge
  density, cut distinct colours 40%, and grew the biggest dead area 50%. The contract passed and the
  picture died.
- A palette "hole" was asserted from a crude hue-family bucketer. Two of the three claims were wrong.

**Open the image. Open `assets/reference/gen2/new-bark-town-gsc.png` beside it. Then judge.**

---

## 1. Craft — every one of these is a named rejection

> *"I just want to make sure that you were already aware that this type of thing is not acceptable."*

The image that prompted it contained, all at once: buildings that were **roofs on posts with no
walls**; a roof with **coloured discs punched into it**; a **floating black blob** with nothing under
it; **gibberish lettering** on a signpost; two **unexplained cable curves**; a **floating pink cube**;
and perspective that changed object to object.

So, per image, answered in words and not inferred from a histogram:

1. **Does every structure read as a building?** Enclosing walls, a visible door, a roof meeting those
   walls. A roof on posts, an open-sided shelter, or a shape with no interior fails — at any size.
2. **Is there any lettering anywhere?** — a **tool limitation, not a style law, and dated.**
   `z_image_turbo` cannot render legible text, so any lettering it generates is garbage and reads as
   broken instantly. Count it as a defect **for that reason only.**
   **Gold itself uses text freely** — verified on `assets/reference/gen2/violet-city-gs.png`, where
   "MART", "GYM" and "POKÉ" are legibly rendered on the buildings — and this project ships a
   `sign-card` prop kind. If the pipeline ever moves to a model that renders text, revisit this rule;
   do not delete it as a style constraint, because it never was one.
3. **Is anything in the frame unexplained?** Floating objects, unattached blobs, cables from nowhere,
   stray geometric solids.
4. **Is the projection and light consistent object to object?** One light direction. Mixed top-down
   and isometric inside one frame is a fail.
5. **Are there large dead zones?** A 240×160 play window that lands inside a flat single-colour field
   shows the player nothing. Measure the worst window, don't eyeball the whole map.
6. **Soft drop shadows are a fail — but a hard dark base edge is correct.** Verified against
   `assets/reference/gen2/violet-city-gs.png` and `new-bark-town-gsc.png` at native resolution:
   Gold buildings and trees sit on the ground with a **hard dark keyline at their base**, one to two
   pixels, no offset and no blur. What fails is the soft offset gradient shadow a modern renderer
   produces. Stating this as "Gold has no shadows" would reject the correct convention, so state it
   as the distinction it is.

## 2. Style — the target is near-exact Gen 2 Gold

> *"Just because I said don't copy the Pokemon examples doesn't mean that you can't have the
> similarity in design be near exact... somebody should be able to take one look and be like, 'Oh,
> that's Pokemon.' I just want it slightly different enough that this is its own game instead of
> being a one-to-one copy."*

**Do not hold visual distance from Gold. Hold content distance.** The originality lives in the
landscape, the building placement, the creatures — not in the rendering idiom.

The one question that decides it: **would someone glance at this and say "oh, that's Pokémon"?**
If the honest answer is no, nothing else in the report matters.

### The measured style facts

> **These figures are canonical in `docs/build-doc.md` §9 and are restated here only as a judging
> aid.** They constrain what ships, so build-doc owns them; this file owns the *procedure*. If the two
> ever disagree, **build-doc is right and this table is stale** — fix it here, do not edit build-doc
> from this lane. Two statements of one fact is the failure this project keeps paying for.

| | Pokémon Gold | measured on our output |
|---|---|---|
| distinct colours per map | **12–18, mean 16.0** | 31 of 32 |
| art pixel | 1 native px, tile 8×8 | 1 native px, tile 16 native px — **2× a GBC's density** |
| texture | dithered, tile-varied | smooth gradients, anti-aliased |
| keyline | hard, on every shape | intermittent, 0.87%–8% depending on clamp |

Reference set: `assets/reference/gen2/*.png` — Gold, **the style target**, fetched at true native
resolution. `assets/reference/gen3/*.png` — Ruby/Sapphire, **elevation reference only** (49 colours;
do not use it for style, it will split the house look).

**Too many colours is the failure mode, not too few.** A 48-swatch palette with ~16 used per map is
correct. 31 used is the bug.

### The right instrument for ground texture is COLOUR CONCENTRATION, not edge density

**Measure: in a 64×64 patch of open ground, what share do the top three colours cover — AND how many
distinct colours are in the patch?** Both halves, always. Concentration alone has a degenerate case:

> **A flat fill scores 100%.** A blank green rectangle is one colour at 100% concentration, which
> beats Gold's 78.9% on the share alone. **The discriminating shape is a small palette used densely
> with more than one member** — Gold's patch is **8 distinct at 78.9%**; a flat fill is **1 at 100%**;
> raw generation is **2,451 at 6.3%**. All three are different failures and only the pair separates them.

Quote both numbers or neither. A concentration figure with no distinct-count beside it is exactly the
kind of necessary-condition-reported-as-sufficient this file exists to stop.

**One more caveat, because a gate cannot do what a human does here.** The 78.9% figure comes from a
*hand-picked* patch of open ground. An automated rule cannot hand-pick, and a rule that samples the
*most concentrated* patch rewards precisely the flat regions we are trying to catch. Any gate reading
this must derive its own sampling rule, state that rule's weakness, and **re-derive its band from that
rule over the reference set** — not quote the hand-picked figure. A whole-image aggregate is a
different measurement wearing the same name.

    GOLD new-bark                     78.9%      8 distinct colours in the patch
    our postprocess dither            78.3%     12
    pixel-art LoRA output              6.3%   2451
    plain generation, no LoRA          4.9%   2385

**This is the only measurement that separated a look from a structure**, and three others failed at it:

- **A 3×3 Sobel is blind to a one-pixel dither** — it cancels on a period-2 pattern, reading 0.78% on
  both a flat and a dithered synthetic. Anything in this project that checks "texture" with a standard
  gradient operator cannot see the mechanism the art direction rests on.
- **Luminance edge-density with a threshold nearly missed it too.** Gold's own two grass greens differ
  by **28.2 luminance**, barely above a threshold of 25 — a dither slightly softer than Gold's vanishes
  entirely. The design is sound; 25 is too close to the edge to trust.
- **Exact-RGB edge density saturates on raw output.** With 355,101 distinct colours, almost no
  neighbouring pair is byte-identical, so it reads near 100% on everything pre-quantization and ranks
  nothing. It is only meaningful on an already-quantized image.

**And the eye failed too, in the direction that matters.** A pixel-art LoRA's ground *looked* stippled
and dithered; it is 2,451 near-identical colours differing by about one per channel. Rule zero says
look before trusting a number — it does not say the eye settles it. **When a claim is about
structure rather than appearance, measure the structure.**

### Dithered ground is the single largest visual gap — measured

Gold's whole-map edge density is **47.51%**. Nearly half its pixels sit on an edge. That is not
detail in its objects; **it is the ground.** A 32×32 tile of plain New Bark grass — seven colours,
no objects, not one keyline pixel — tiled to 1024² measures **43.59% edge density on its own.**

Our best output measures **8.83%**.

**Gold never uses a flat fill anywhere.** Its grass is a dense checkerboard between two greens; its
paths are a fine dot pattern; its tree masses are a repeating dark/light weave. Ours is a smooth
airbrushed field with objects scattered on it.

**Look at [`ground-comparison.png`](./ground-comparison.png)** — 96 native px of Gold ground beside 96
native px of ours, both at 6×. It is committed beside this file precisely so it can be pointed at. It
explains the owner's "MS Paint" reaction better than any measurement taken tonight, and it is the one
thing here a number cannot tell you.

So when judging: **look at a patch of empty ground and ask whether it is dithered or filled.** A map
whose objects are perfect and whose ground is a flat colour is still wrong, and it is wrong in the way
he noticed first. This is largely a *postprocess* lever — ordered dithering into a small palette
subset — not something to keep spending prompt words on.

**Measured recipe, and it works.** 4×4 Bayer ordered dither at amplitude ~45, quantized into the
**16 swatches that image actually wants** (chosen by pixel mass, not the whole palette), applied to
the best uncontrolled output: **44.74% edge density in 16 colours**, against Gold's 47.51% in 17.
Amplitude maps almost linearly — 0 → 12.88%, 24 → 24.09%, 40 → 40.02%, 56 → 63.77% — so tune it to
the target rather than guessing.

**These are TWO separate facts and they must not be collapsed into one sentence.** Someone reading a
combined claim will implement one lever, measure a real improvement, and stop:

> **Fact A — ordered dither buys EDGE DENSITY.** It is what turns flat ground into Gold's texture.
> It does nothing whatever to the colour count.
>
> **Fact B — a per-map subset buys COLOUR DISCIPLINE.** Choosing the ~16 swatches an image actually
> wants, rather than quantizing to the whole palette, is what takes 43 colours down to 16. It does
> nothing whatever to edge density.

**Neither alone reaches Gold.** Dither at amplitude 45 without the subset gave 40.02% edge density in
**43 colours**. The subset without dither gave 16 colours at **12.88%**. Both together: 44.74% in 16.

**And because amplitude is near-linear, edge density is trivially gameable** — any target figure can
be hit by turning one knob. That is why it is an advisory reading and not an assertion, and why the
masking rule below matters more than the number.

**But dither SELECTIVELY.** Applied globally it speckles roof and wall surfaces, which reads as noise
rather than texture — a thatched roof comes out looking dirty. Gold dithers **ground and large flat
areas** and keeps object surfaces comparatively clean. Mask the dither to ground, or fall off its
amplitude where local edge density is already high. A global dither that hits the target number while
making the buildings worse is rule zero all over again.

## 3. Composition — his critiques of the first drafts

> *"This game is nowhere near deep enough to need twenty homes in a town. A town should be a handful
> of buildings, and nearly all of the buildings should have an accessible interior."*

> *"Two of the three towns that were drafted look exceptionally similar to each other... and not have
> the towns based around some repeated circular grid system."*

7. **Four to seven buildings in a town**, each a distinct *place* with a visible door. No anonymous
   filler houses, and **no two buildings in one town copy-pasted** — a later round put four identical
   cottages in one frame, which is the same failure at a smaller scale.
8. **No repeated lattice.** What he objected to was a *system* — a town laid out on a repeating grid
   or ring — in the same sentence that complained the towns resembled each other. **A single
   crossroads is NOT a violation:** `assets/reference/gen2/violet-city-gs.png` has several path
   junctions, so a rule forbidding them would reject the style target itself. Judge whether the
   layout reads as *generated from a template*, not whether two paths cross.
   *(An earlier draft of this file said "a plus-shaped junction is a grid." That was inferred, not
   quoted, and it was wrong. If a tighter rule is wanted it is a question for Hank, not an inference.)*
9. **No two nodes may read as siblings.** Judge the class together, not one image at a time. This is
   the half of his critique that was explicit — *"two of the three towns that were drafted look
   exceptionally similar to each other"* — and it is the one that actually bites.
10. **Paths lead somewhere.** A path that dead-ends in a rounded cap mid-field is nonsense; Gold's
    paths connect places or leave the frame.

## 4. The mechanical contracts — necessary, never sufficient

Edge exits exactly matching the node's declared `adjacency` (bottom = back toward Hearthollow, top =
onward to the Sanctum) · native (512,512) open standable ground · every prop painted at its authored
(x,y) · buildings inside the measured scale band · full bleed, no void, no island, no cutaway.

**Prop clearance around the arrival tile — a composition rule with a mechanical cause.** The player
arrives at the walkable tile nearest native **(512,512)** on *every* entry to a node, and
`propInteractionRadiusDefault` is **96 native px**. A prop drawn inside that radius is a prop the
player is **standing on** when they arrive.

This is not hypothetical: `bowerdeep-sign-market` is authored at **(520,560)**, inside the radius, and
`interact()` gives a prop priority over the room — so `[E]` on arrival read a signpost in a town
shipping **22 talk entries**, including both quest chains, the innkeeper, the vendor and Maren's
keystone step. Halder's quest offer was reachable only from two tiles away and nothing said so. The
code lane has since made spawn selection prefer a tile no prop covers, so the interact key is no
longer eaten — **but the composition is still wrong**: the player materialises on top of a signboard.

**So: paint no prop within ~96 native px of the centre.** If a node's authored coordinate sits inside
that radius, `MAP-PROMPT-RULES.md` already licenses the fix — *"the prop's x/y is moved afterwards to
wherever the painting put it"* — so paint it clear of the arrival tile and move the coordinate to
match. Do not move the coordinate first and paint to it; the painting decides, then the data follows.

These are the floor. Passing all of them is not a result — the twelve rejected maps did.

---

## When the judge and the contract disagree

**The judge wins by default.** An image that clears every contract and fails this file is a reject.

**But a rule stated slightly too hard costs rounds silently, and nobody finds out why** — rule 8
above was exactly that until it was caught. So if you reject an image and believe the rule you
rejected it under is wrong, or the contract passes and the rejection feels unjustifiable, **do not
quietly split the difference**: reject, and put the disagreement to Hank as a question carrying both
readings and the image. A rule inferred rather than quoted is the likeliest culprit — every quoted
line in this file came from him; anything else in it is someone's reading.

## How to report

Give the contract numbers, then the craft answers **in words**, then the one question from §2. Rank
by whether it looks right, not by how many checks it cleared. **Say plainly what is still wrong** —
an oversold result costs more than a flawed one, because the owner then has to find the flaw himself,
and he has had to twice.
