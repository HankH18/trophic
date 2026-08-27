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

### Retire an instrument that produced a wrong answer. Do not merely correct the answer.

**A corrected conclusion leaves the tool that produced it running.** That is how one bad instrument
produces two wrong answers, and it did:

A crude hue-family bucketer produced a false palette claim ("no swatch between `c05` and `c07`" —
disproved, `c06` sits between them). The claim was corrected on the spot and the bucketer stayed in
service. Hours later the same tool produced *"only `c09` is a neutral in the band"* — also false;
`c09` is C\* 39.6 and a neutral is C\*≲10. **Both corrections were sound. Neither retired the tool.**

Also retired under this rule: an ad-hoc "bottom band" detector, built in one command, which reported
6 of 27 cells banded. It was measuring *"the bottom strip's dominant colour differs from the middle"* —
which is true of a **grey frame around the whole image**, a different and worse defect. It found
something real and named it wrong, which is the most expensive kind of nearly-right.

**So: when a measurement turns out wrong, fix the conclusion AND withdraw the instrument.** If it is
worth keeping, it is worth re-validating against a synthetic first (see §2's discrimination case).
An instrument with one wrong answer behind it and no revalidation is a loaded gun in the drawer.

### But looking is a CHECK, not the answer — the eye failed here too

A pixel-art LoRA's ground *looked* stippled and dithered, and was reported as "texture plainly
present". It was **2,451 near-identical colours differing by about one per channel** — continuous
noise, not a dither. Gold's equivalent patch is **8 colours**.

**When the claim is about structure rather than appearance, the eye is exactly as unreliable as a bad
operator**, because a structure and a convincing imitation of one look identical at a glance. Rule
zero says look before trusting a number. It does not say the eye settles it. **Measure the structure.**

And a second failure in the other direction, from the same investigation: *raw* LoRA output was
compared against Gold, found wanting, and written up as settling adoption. It answered the wrong
question — the LoRA is **multiplicative with the postprocess**, not an alternative to it. Check what
question a comparison actually answers before drawing a conclusion the size of a decision.

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

### Ground texture takes THREE numbers, and every attempt at fewer has failed

> **State the REGION beside every number, the way you state the operator.** A whole-map figure and a
> ground-patch figure are different measurements and must never share a name. On one image the same
> dither read **44.74% whole-map** and **6.89% ground** — a six-fold gap, entirely supplied by
> buildings and trees. A map can raise its whole-map texture score by adding objects while its ground
> stays flat, which is the failure this section exists to catch.
>
> The discrimination case for any gate reading this: **a synthetic with flat ground and dense objects
> must read HIGH whole-image and LOW ground-patch.** Measured on exactly that synthetic — flat ground,
> seven of sixteen cells filled with dense keyline object — **whole-image 44.34%, ground alternation
> 0.00%.** The two agree to under a point on a *uniform* image and diverge **44×** the moment objects
> exist. Assert the uniform control too, or the case reads as two operators disagreeing rather than
> two regions, which is the whole finding.
>
> **The worked example, from our own art: `r1` posted the best whole-image figure of the ten — 44.1%,
> near Gold's floor — while its ground read 28.1% alternation.** By the whole-image number it looked
> like the closest thing we had. It was not; the number was buildings and trees. **Do not use `r1` as
> the reference for what "nearly there" looks like** — that is precisely what its old figure invited.
>
> Keep the whole-image reading anyway, under its own name: it is the **only** one here that sees
> composition at all. The ground reading takes a median specifically to ignore objects, so a map that
> lost every building would score identically on concentration and alternation and drop sharply on
> whole-image. That is worth knowing. It is just not a ground measurement.

**Measure, in a 64×64 patch of open ground, all three of:**

1. **Concentration** — what share the top three colours cover.
2. **Distinct count** — how many colours are in the patch.
3. **Neighbour alternation** — what share of horizontally adjacent pixel pairs differ.

> **An earlier version of this file called concentration "the right instrument". That was wrong, and
> it was wrong in the same way as the three instruments it was written to replace.** A ground of three
> colours in *large flat patches* scores identically to three colours *interleaved per pixel*, because
> a histogram cannot see arrangement. **Alternation is the axis that separates them. Gold sits at 48.7%.**
> Four incomplete instruments now, not three — see the list below, which this one belongs on.

Concentration alone also has a degenerate case:

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

                                   concentration   distinct   ALTERNATION
    GOLD new-bark                          78.9%          8       48.7%
    our postprocess dither, on a
      source that took it                  78.3%         12       53.2%
    pixel-art LoRA output, RAW              6.3%       2451       89.0%
    plain generation, no LoRA               4.9%       2385          —

**Read the LoRA row carefully — it is raw output, and comparing it to Gold answers the wrong
question.** What decides adoption is the LoRA *plus* postprocess, which was not measured when this
table was written. It is: the same dither reaches **54.84%** ground texture on a LoRA cell and
**6.89%** on a plain one, against Gold's 60.10%. **They are multiplicative, not alternatives** — the
LoRA supplies the substrate the dither bites on. **LoRA adoption is OPEN, not settled**, and it turns
on `docs/build-doc.md:390`'s "zero LoRAs" claim, which is the owner's call.

**No single number here separates a look from a structure.** Four instruments have now failed at it,
each reporting confidently on a property it could not resolve:

- **A 3×3 Sobel is blind to a one-pixel dither** — it cancels on a period-2 pattern, reading 0.78% on
  both a flat and a dithered synthetic. Anything in this project that checks "texture" with a standard
  gradient operator cannot see the mechanism the art direction rests on.
- **Colour concentration alone is blind to arrangement** — three colours in flat patches and three
  colours interleaved per pixel give the same histogram. This is the instrument this section
  originally proposed as the answer; it is the fourth on this list, not the escape from it.
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

> ### ⚠ WITHDRAWN FIGURES — every edge-density number below marked [WITHDRAWN]
>
> The edge-density figures in this section (47.51 · 43.59 · 8.83 · 44.74 and the amplitude ladder)
> were taken with a **luminance neighbour-difference operator at threshold 25**, and that operator was
> never published beside them. A second lane could not reproduce 47.51 at any threshold: at 1:1 native
> the eight Gold references read **50.4–78.8%**, density-matched at 2× they read **30.3–51.5%**.
>
> **They are withdrawn pending republication with the operator attached, not deleted** — one may come
> back sound, and the register keeps withdrawn claims so nobody re-derives them from scratch.
> **Do not quote them. Do not act on them.** The colour figures (12–18 per map, mean 16.0) reproduce
> exactly and are NOT withdrawn.
>
> The 44.74 figure carries a second fault worth naming: it is a **whole-map** number that objects
> supply. On the *ground* — which this section says is the whole problem — the same dither reached
> only **6.89%** on a plain generation. A whole-map aggregate cannot stand in for a ground measurement.

### Dithered ground is the single largest visual gap — measured

Gold's whole-map edge density is **47.51% [WITHDRAWN]**. Nearly half its pixels sit on an edge. That is not
detail in its objects; **it is the ground.** A 32×32 tile of plain New Bark grass — seven colours,
no objects, not one keyline pixel — tiled to 1024² measures **43.59% [WITHDRAWN] edge density on its own.**

Our best output measures **8.83% [WITHDRAWN]**.

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
the best uncontrolled output: **44.74% [WITHDRAWN] edge density in 16 colours**, against Gold's 47.51% [WITHDRAWN] in 17.
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
**43 colours**. The subset without dither gave 16 colours at **12.88%**. Both together: 44.74% [WITHDRAWN] in 16.

**And because amplitude is near-linear, edge density is trivially gameable** — any target figure can
be hit by turning one knob. That is why it is an advisory reading and not an assertion, and why the
masking rule below matters more than the number.

**And dither cannot invent ground content — it can only amplify content that is there.**

Measured on a dark-ground node, sampling *strict period-2* (pixel differs from `x+1` and equals `x+2`
— the signature of a rigid checkerboard rather than a dither):

    r4 raw, before postprocess        6.7%   387 colours in patch
    r4 shipped, after our dither     61.4%     7
    GOLD ground                      28.9%     8

**Gold is roughly half as regular as ours.** A parameter sweep does not close it: 4×4 and 8×8 Bayer at
amplitudes 45 / 30 / 20 / 12 all land **76–90%**, and *lowering* amplitude makes it worse. Matrix size
and amplitude are not the lever.

**The reason is structural.** Gold's ground is genuinely varied tile content that is *also* dithered.
Ours is one flat colour with a threshold pattern laid over it — so it resolves to a perfect
alternating checker, which on dark ground reads as a missing-texture transparency grid rather than
terrain. Five of twelve maps in one round shipped looking like that.

**So the substrate matters more than the postprocess.** This is the same conclusion the LoRA
investigation reached from the other side: the same dither reached **54.84%** ground texture on a
LoRA cell and **6.89%** on a plain one. Dither amplifies variation that exists; where none exists it
manufactures a pattern. **Judge strict period-2 against Gold's 28.9%, not just texture against its
60%** — a map can hit the texture target while looking like a checkerboard.

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

## 3b. Not every map is looked at equally — two are seen far more than the rest

Party-wipe recovery carries the player to **the nearest node with an inn**, and on the walkable slice
that is **Hearthollow and Brackwater**. Measured over 24 encounters at Hearthollow: **four wipes, four
returns.** Add the arrivals from ordinary travel and the inn rest, and those two towns and their
approaches are the **highest-traffic art in the game** — a player sees them repeatedly in a single
run, where a route is crossed and left.

**So judge those two harder.** A defect that survives one glance because the player is passing through
is a defect they will study on the fourth wipe. Anything shipped for Hearthollow or Brackwater has to
hold up to being looked at many times, not once. Nothing in the contracts makes this visible, which is
why it is written here.

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
