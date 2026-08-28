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

## 0.4 THE REFERENCE IMAGES GO INTO THE PIPELINE. An inference cost this project three days.

**`assets/reference/gen2/*.png` may be used as generation input — img2img base, ControlNet hint, style
reference.** The owner's rule is *"inspiration only, don't copy"*, and what it forbids is **shipping a
traced Gold map**: the town has to be ours, our buildings, our layout, our content. It has never
forbidden the model from *seeing* Gold.

**What went wrong, because it is the most expensive mistake in this file.** An agent wrote the rule
down as *"inspiration only, never shipped, never quantized into `assets/final/`, never a palette
source, **never fed to the pipeline**"*. Only the first three clauses are his. The fourth was
inferred, hardened into a constraint nobody re-examined, and meant that for this project's entire
life **the generator never saw a single Pokémon screenshot** — it started from
`EmptySD3LatentImage`, pure noise, with a text prompt and a hand-drawn white line drawing, and was
asked to invent Gold's rendering idiom from first principles.

It could not, and everything downstream followed from that: ground whose 529 colours project onto
**one** palette swatch, four rounds of postprocess trying to recover contrast the generator was never
given a way to produce, and a closed-lanes table that had correctly ruled out every lever *except the
one that was never on the table*. The owner's words when he found it: *"If we don't feed to the
pipeline, then how are we using it for inspiration?"*

**The general rule, and §0 already said it in a different register:** a constraint that no one can
quote is a constraint someone inferred. This file's own §3.8 records the same failure at smaller
scale — *"an earlier draft said 'a plus-shaped junction is a grid'. That was inferred, not quoted, and
it was wrong."* When a rule is blocking a whole lane, **go and find the sentence it came from.** If
there isn't one, it is a hypothesis wearing a rule's clothes.

## 0.5 The closed lanes — check a proposal against this BEFORE running it

**Why this section exists.** The owner's words: *"It seems like you're just going and throwing shit
against a wall over and over again, without getting much closer."* He was right, and the mechanism was
specific: refutations were being read as verdicts and then forgotten, so each round invented a fresh
idea instead of drawing one from what the last round ruled out. Four rounds produced measurements and
retirements; the last one produced **zero images**. A round that changes no pixel is a research round,
and this lane has now had four in a row.

**The distinction that was being missed, and it is the whole point of this section:**

> **A refuted MEASUREMENT and a refuted IDEA are opposite results.**
> Measurement refuted → the idea is **untested**. Fix the instrument and *run it again*.
> Artefact refuted → the idea is **dead**. Record it here.
> Three of four lanes in `regen-v9` were refuted on corpus/operator grounds — i.e. *untested* — and
> all three were written off as dead. That is how a lane runs out of ideas while its list of open
> ones is still long.

**So every entry below carries three columns, and the third is the one that stops the flailing.**

| lane | what closed it | what it FORBIDS | what it does NOT forbid — still open |
|---|---|---|---|
| **ControlNet strength sweep** (0.5 / 0.7 / 0.9 × LoRA), `regen-v7` | Four arms, all refuted. Strength and LoRA texture are **one dial**: at 0.9–0.7 the patch dominates and the LoRA never reaches the surface; at 0.5 texture appears and composition collapses. | Sweeping CN strength to buy texture. Do not run it again. | **CN 0.9 for COMPOSITION**, which is proven and is what should ship. The dial is bad for texture, not for layout. |
| **Two-pass img2img denoise sweep** 0.3→0.7, `regen-v8`, ~30 generations | There is **no climb at all** — ground amplitude is flat at 2.0–4.4 across the whole range while composition drift is monotone. Every rung spends composition and buys nothing. | A wider denoise range, more steps, "more runway". There is none. | A **different substrate** — another LoRA, another base model. Never tested. The failure is this substrate's contrast, not the two-pass structure. |
| **Dither family sweep** — Bayer 2/4/8, blue noise, Floyd–Steinberg, Yliluoma, forced recruitment, `regen-v9`, 0 generations | Best family moves ground amplitude **7.75 → 9.37** against a target of 34.9. The only one that breaks the 2-colour ceiling does it by making 95–100% of neighbours differ — static. | Any further postprocess-only attempt to reach Gold's amplitude *from this source*. | **k chosen by dithered mass** (3 colours, alternation 70.7%) — the round's one real gain, cheap, and worth taking. **Per-8×8-block material assignment** — named by the lane that found the tile structure and never tested. **Chroma-aware dither** — the current Bayer adds one scalar to r, g and b alike, so it slides along the grey diagonal only; never tested. |
| **Palette-side fixes for ground** | Quantizing with **all 48 swatches and no selection at all** changes nothing: 1 colour on hearthollow, 2 on r1. The ground's whole colour ball (radius 7.5–13.5 sRGB) fits inside one Voronoi cell (gap 31.8). | Expanding or re-fitting the palette to fix ground. The palette reproduces Gold ground losslessly. | The selection lane for a **2 → 3** colour gain, which is small but real and free. |
| **The `negative` prompt field**, all classes | `cfg 1.0` disables classifier-free guidance; two cells with wildly different negatives differ by **0 bytes**. Raising cfg was tried and **rejected by the owner** — fixed no defect class, lost the projection, degraded palette fit 4.185 → 5.402. | Adding any term to `negative`. Proposing a cfg change. | **Negated phrases inside the POSITIVE prompt**, which demonstrably work — the full-bleed clause is the one measured win. |

**And the lane that was never closed, only overlooked.** The composition defects are **in the control
drawings, not in the model**: hearthollow's dead-end lane arms are drawn into
`assets/raw/_trials/topdown-examples/control-hearthollow.png` and the model reproduced them faithfully
on both seeds; the same hint draws seven identical rectangles, which is why four named places arrive
as four identical cottages. **This is free to fix and it surfaced as a footnote inside a refuted
lane.** When a refutation contains an actionable art finding, that finding is the result — not the
verdict attached to it.

**Three standing rules that follow.**

1. **A round must change a pixel.** At most one research round per problem; this lane has spent four.
2. **A verifier owes a next step, not just a kill.** A verdict of "refuted" with no statement of what
   would make it work, or what it rules out, hands the next round nothing and it will invent something
   from scratch. Ask for `whatThisRulesOut` alongside `refuted`.
3. **Name the corpus and the operator in the same breath as the number.** A figure that travels without
   the thing that produced it is not a weaker figure — it is a different figure, and this project has
   now been wrong five times in exactly that way. Below is the list, because the pattern is only
   visible as a list.
4. **When the corpus cannot be shipped, publish the measurements — and then prove the absence.** Two
   corpora here are deliberately outside the repository: `assets/reference/**`, which is third-party
   pipeline input, and `assets/raw/**`, which is generator output. Their figures live in
   `tools/artverify/published-measurements.json` with the operator and the corpus named beside them,
   which is rule 3 applied to a corpus nobody else has. Three things then have to hold, and each is
   here because its absence was measured as a silent pass:
   - **The absence must be TOTAL.** A corpus is wholly present or wholly absent. A partial one
     re-measures some rows and takes the rest on trust, which is mixed evidence — and it also shrinks
     a sweep without saying so: deleting one of the five overlay maps once took that file from 73
     passed to 68 passed with nothing red, where the code it replaced went red.
   - **The absence must be EVIDENCED, and a `.gitignore` match is not evidence.** Both rules are
     directory globs, so they match an invented filename exactly as well as a true one — rewriting
     every path in the record to a name that never existed left both gates green. What does count:
     the rule git actually reports for the path (`git check-ignore -v`, not a bare "some rule
     matched"); the directory being gone too, because a file missing from a directory that IS on the
     disk is a stale path rather than a deliberate absence; and, where the files were once committed,
     the blob read back out of history and hashed against the published sha256. Where none of that is
     available — the four generator maps have no history at all — the record says so in as many words
     instead of implying more.
   - **Every published field must be checkable.** A number in an evidence record that nothing asserts
     is decoration that reads as evidence. Five fields were mutated in one sweep — a byte count, an
     aggregate, a coordinate pair, an ignore rule and an operator's implementation path — and not one
     of them reddened anything; the coordinate pair had been transposed since it was written. Bind it
     or remove it.

### The five wrong instruments — the same failure five times

Every one of these produced a *confident* answer. None was a close call, none was noticed by the agent
that made it, and four of the five were acted on before anyone caught them.

| # | the number | the operator that produced it | why it was the wrong instrument |
|---|---|---|---|
| 1 | cindershelf's grass-cell count | counted `,` over the **whole layout file** | the file's own legend block contains `,`. The corpus was the file; the claim was about the map body. It would have reported grass on a map whose authored subject says *"no grass anywhere over the whole picture."* |
| 2 | per-node encounter share | a **hardcoded** walkable set | it omitted `~` shallow water, which is walkable. Inflated shares by up to **9 points**. The set was typed from memory instead of derived from the same table the composer uses. |
| 3 | "which tiles does the engine load" | scanned `load()` calls for **literal names** | tile names are built at runtime (`T-crown-1`). A name-scan cannot see a name that does not exist as text. |
| 4 | "is the player drawn" | counted `add.image` **call sites** | battle creatures and dex plates draw through `placeholderImage`, which renders real art whenever it exists. The count was of one draw path in a file with two. |
| 5 | creature front/back row split | matched the **substring** `"back"` on the row id | `battle-kilnback-*-front` is a FRONT row for a creature named kilnback. Reported a 74/76 asymmetry and two orphan rows in a set that is exactly 75/75 with no orphans. |

**#5 is the only one caught before it did damage, and it was caught by luck** — the count happened to
get re-run a different way for an unrelated reason. That is not a habit and it will not repeat. The
habit is the rule: **match on the field, not on a substring; derive the set, do not type it; follow the
call path, do not scan for names.** State the operator and the corpus wherever the number appears, and
a reader can see the mismatch without re-deriving anything.

This is the same idea as the withdrawal banner at the top of this file, pointed at a different target.
The banner withdraws every figure produced by one unpublished operator — a rule about *readings*. This
is the rule about *selections*: what did you run it over, and is that the thing the claim is about?

### Three more, and they are a different species — the instrument agreed with itself

The five above are all *wrong corpus*. These three are worse, because in each one the rule from the
first five had **already been applied** and the answer was still wrong.

| # | the claim | what made it look right | what was actually true |
|---|---|---|---|
| 6 | the four season tints, measured as `out = src × tint/255` off `data/balance.json` | the operator WAS named, and it was a real operator | it was the **last step of a three-step chain**. `hueOf` normalises each preset to peak 255, then `seasonBrightness` scales it, then `yearDarkening` scales it again. The raw preset never reaches `setTint`. Three conclusions inverted: summer is the darker of the spring/summer pair, not the lighter; winter is the darkest season, not autumn; and the pair sits ~3.4 apart at year 1 rather than 5.1, **degrading to ~2.1 by year 6**. |
| 7 | `fitWithin` preserves aspect ratio — asserted by `art-slot-fit.test.ts`, green | a real test, asserting the real property, on real fixtures | **every fixture was a square texture in a square slot**, where the correct expression and a plain `setDisplaySize` stretch give identical output. The test could not fail. The implementation had been changed to stretch, contradicting its own doc comment, and the suite stayed green. |
| 8 | the player's `setFlipX` is called on alternate hops | an assertion naming the exact method | the scene stub's `Proxy` turns any unknown method into a **chainable no-op that records nothing**, so the assertion was vacuous. Proven by removing the recorder and watching the sabotage stay green. |

**The sharpened rule, which is what #6 buys and the reason it is the most useful of the eight:**

> **Name the whole PIPELINE, not just the final transform** — and where a pipeline exists in code,
> **call the shipped function; never reimplement it from a description.** A description of a transform
> is a summary, and a summary of a three-step chain that mentions one step is not wrong in a way that
> announces itself. #6 happened *after* "name the operator and the corpus" was already in force, to two
> people who were both applying it.

**And the rule #7 and #8 buy, which is about tests rather than measurements:**

> **Ask what would have to break for this to go red, and then break it.** A fixture chosen so that the
> right and the wrong answers coincide, and a stub that swallows the call being asserted, are both
> tests that cannot fail. Neither is detectable by reading the assertion — only by sabotage. If a test
> guards something that matters, delete the behaviour and watch it red before believing it.

### The shape that appeared three times in one night — THE INPUT MUST BE ABLE TO TELL THE ANSWERS APART

| # | the check | subject | instrument | why it could not fail |
|---|---|---|---|---|
| 7 | `art-slot-fit.test.ts` — does `fitWithin` preserve aspect? | real | real | **every fixture was a square texture in a square slot.** On a square, preserving the aspect and plainly stretching produce identical output. The implementation had been changed to stretch and the suite stayed green. |
| 9 | every human review of the 75 creature sprites | real | the eye | **they were looked at on WHITE.** The defect was a pale cast-shadow puddle that quantizes to `c02 #d2e0e2`. On white it is invisible; on mid-grey it is obvious. ~5,092 stray opaque pixels shipped, worst sprite 554. |
| 10 | `season-tint-onscreen.test.ts` — does the tint reach the screen? | real | real | **it measures SEPARATION, not PROVENANCE.** Pointed back at the wrong source, the four seasons still separated, so the wrong input produced a right-looking answer and the test stayed green. |

**None of these is a bad test, a bad instrument, or a careless look.** In all three the subject was real
and the method was sound. What failed was the *case they ran on*: a square, a white ground, a metric
blind to where its input came from. So:

> **THE INPUT MUST BE ABLE TO TELL THE ANSWERS APART.** Before trusting a check, ask what its case
> would look like if the thing were broken — and if that is the same picture, the case is the bug, not
> the code. Judge sprites on mid-grey, never on the ground they were generated against. Fixture a
> transform with a case where the wrong transform gives a *different* answer. And a metric that reads
> the output cannot tell you anything about the input that produced it.

This is the eye's version of the corpus rule. "Name the corpus" asks *what did you run it over*; this
one asks *could that corpus have shown you the failure*.

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
> dither read **44.74% [WITHDRAWN] whole-map** and **6.89% [WITHDRAWN] ground** — a six-fold gap, entirely supplied by
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

> ⚠ **This table and the replacement-reference table below give different Gold ground figures — 8
> distinct at 48.7% alternation here, 3–4 distinct at 56.5–78.2% there. Do not average them and do not
> quietly prefer one.** The difference is the patch, and only one of the two publishes its coordinate.
> This row is described as a *hand-picked patch of open ground* on `new-bark`, but **the coordinate was
> never written down**, so it cannot be re-measured, re-checked for objects, or confirmed to be ground
> at all — and the five inherited coordinates that *were* written down turned out to be four-fifths
> objects. A figure whose patch cannot be located is in the same position as a figure whose operator
> was not published: **treat it as unverified pending republication with its coordinate attached.**
> The concentration and alternation columns are sound *operators*; it is the region that is missing.

                                   concentration   distinct   ALTERNATION
    GOLD new-bark                          78.9%          8       48.7%
    our postprocess dither, on a
      source that took it                  78.3%         12       53.2%
    pixel-art LoRA output, RAW              6.3%       2451       89.0%
    plain generation, no LoRA               4.9%       2385          —

**Read the LoRA row carefully — it is raw output, and comparing it to Gold answers the wrong
question.** What decides adoption is the LoRA *plus* postprocess, which was not measured when this
table was written. It is: the same dither reaches **54.84% [WITHDRAWN]** ground texture on a LoRA cell and
**6.89% [WITHDRAWN]** on a plain one, against Gold's 60.10% [WITHDRAWN]. **They are multiplicative, not alternatives** — the
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

> ### ⚠ WITHDRAWN FIGURES — the withdrawal is on the OPERATOR, not on a list of numbers
>
> **Read this scope rule before deciding whether any particular figure is in or out.** An earlier
> version of this banner enumerated four numbers and "the amplitude ladder", and a second lane then
> had to ask, correctly, whether `6.89`, `12.88` and `40.02` were inside it or outside it — because
> a bare list invites exactly that question and cannot answer it. It is not a list. **Every figure
> produced by the unpublished operator is withdrawn**, whichever section it appears in and whether or
> not it is marked inline:
>
> `47.51` · `43.59` · `8.83` · `44.74` · the amplitude ladder (`12.88` · `24.09` · `40.02` · `63.77`)
> · `6.89` · `54.84` · `60.10`
>
> All of them were taken with a **luminance neighbour-difference operator at threshold 25**, and that
> operator was never published beside them. A second lane could not reproduce 47.51 at any threshold:
> at 1:1 native the eight Gold references read **50.4–78.8%**, density-matched at 2× they read
> **30.3–51.5%**.
>
> Two consequences of the scope rule that are easy to miss, so they are stated rather than left to be
> re-derived:
>
> - **`6.89` is not a survivor of the 44.74 correction, it is the same operator's ground reading.**
>   The paragraph below invokes it to convict 44.74 of being a whole-map aggregate. That argument is
>   still sound — a whole-map figure cannot stand in for a ground figure — but it is made with a
>   withdrawn number and cannot be quoted as a measurement.
> - **`54.84` / `6.89` / `60.10` are the LoRA-adoption argument.** Withdrawing them withdraws the
>   *numbers*, not the direction: a substrate-versus-postprocess comparison on a published operator
>   (see the reference block below) points the same way. But anything downstream that reads "baseline
>   6.89%, c64-LoRA 54.84%, Gold 60.10%" as measured evidence is resting on a withdrawn operator and
>   must be re-derived before it decides anything.
>
> `28.2` at "Gold's own two grass greens differ by 28.2 luminance" is NOT withdrawn — it is a colour
> difference computed from the reference pixels, not an edge-density percentage, and it reproduces.

### The replacement reference — Gold's ground, with the operator attached and the patches looked at

Withdrawing a number without replacing it leaves the next lane to re-derive one badly, so this is the
reference to judge ground against until something better is published **with its operator**.

**Four operators, stated so they can be re-run.** On an RGB patch, exact-match on bytes:
`distinct` = unique colours · `concentration` = share held by the top three · `minority density` =
share held by the *second* most common · `alternation` = share of horizontally adjacent pairs that
differ · `amplitude` = mean over pixels and channels of |px − mean of its 4×4 neighbourhood|.
`→ palette` = distinct swatches remaining after nearest-RGB projection onto the 32 in
`data/palette.json`, counting only swatches covering ≥1% of the patch.

**How the patches were chosen, because that is the part that has gone wrong three times.** By hand,
cropped to 6×, and *looked at* — one at a time. Two automatic selectors were built and both were
retired rather than tuned: the first inherited five coordinates in which **four of five patches
contained trees, ledges, dirt or fences**, and the second ("a patch with no near-black pixel contains
no object") returned **MART storefronts and brick walls**, because Gold keylines objects in dark
*brown* as well as near-black. Any figure in this project derived from those five coordinates —
including a "Gold ground is 6–9 colours" claim and a Gold phase-structure band of 3.3–67.3 — is
**object-contaminated and withdrawn**.

| 64px patch of open ground | distinct | conc. | minority density | alternation | amplitude | → palette |
|---|---|---|---|---|---|---|
| **GOLD** tall grass, `johto-route-29-gsc.png` (704,192) | **3** | 100.0% | 0.312 | 56.5% | **40.94** | 3, lossless |
| **GOLD** short grass, same file (448,104), 32px | **4** | 96.6% | 0.359 | 78.2% | **34.90** | 4, lossless |
| ours, `regen-v8/d07/pass2-r1-s1234.png` (560,600) raw | 529 | 3.9% | 0.013 | 96.5% | **2.30** | **1** |
| ours, `regen-v8/d07/k16/pass2-r1-s1234.png` shipped | 2 | 100.0% | 0.193 | 38.5% | **7.66** | 2 |

**Gold's open ground is 3–4 colours, not 6–9, and our 32-swatch palette reproduces it with no loss.
The palette has never been the constraint.** The gap is contrast and density: Gold carries ~35–41
amplitude at ~31–36% minority density, ours 7.66 at 19.3%.

**The sharpest single number here is the `→ palette` column.** Our *raw* ground is 529 colours that
project onto **one** swatch — they differ by about a channel each, so nothing in that patch is far
enough from anything else to reach a second swatch. Gold's three project onto three. So the dither is
not under-amplifying variation that exists; it is starting from something the palette sees as one flat
colour, which is why every structure in the shipped ground is manufactured by the dither matrix rather
than found in the picture. **Fix the substrate or the postprocess cannot help**, and that conclusion
now rests on a published operator instead of a withdrawn one.

**Stated weakness of this reference.** Two patches from one Gold route is a thin base — it is two
ground *materials* (tall grass, short grass), not a survey, and a town floor or a cave will differ.
Route 29 has no clean 64px short-grass square at all, which is why that row is 32px and why its
alternation is not strictly comparable with the 64px rows. Widen it before treating the band as tight,
and hand-check every patch added.
>
> **They are withdrawn pending republication with the operator attached, not deleted** — one may come
> back sound, and the register keeps withdrawn claims so nobody re-derives them from scratch.
> **Do not quote them. Do not act on them.** The colour figures (12–18 per map, mean 16.0) reproduce
> exactly and are NOT withdrawn.
>
> The 44.74 figure carries a second fault worth naming: it is a **whole-map** number that objects
> supply. On the *ground* — which this section says is the whole problem — the same dither reached
> only **6.89% [WITHDRAWN]** on a plain generation. A whole-map aggregate cannot stand in for a ground measurement.

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
Amplitude maps almost linearly — 0 → 12.88%, 24 → 24.09%, 40 → 40.02%, 56 → 63.77% [ALL WITHDRAWN — this
is "the amplitude ladder" the banner names] — so tune it to
the target rather than guessing.

**These are TWO separate facts and they must not be collapsed into one sentence.** Someone reading a
combined claim will implement one lever, measure a real improvement, and stop:

> **Fact A — ordered dither buys EDGE DENSITY.** It is what turns flat ground into Gold's texture.
> It does nothing whatever to the colour count.
>
> **Fact B — a per-map subset buys COLOUR DISCIPLINE.** Choosing the ~16 swatches an image actually
> wants, rather than quantizing to the whole palette, is what takes 43 colours down to 16. It does
> nothing whatever to edge density.

**Neither alone reaches Gold.** Dither at amplitude 45 without the subset gave 40.02% [WITHDRAWN] edge density in
**43 colours**. The subset without dither gave 16 colours at **12.88% [WITHDRAWN]**. Both together: 44.74% [WITHDRAWN] in 16.

**And because amplitude is near-linear, edge density is trivially gameable** — any target figure can
be hit by turning one knob. That is why it is an advisory reading and not an assertion, and why the
masking rule below matters more than the number.

**And dither cannot invent ground content — it can only amplify content that is there.**

> ### ⛔ STRICT PERIOD-2 IS A RETIRED INSTRUMENT — the readings below are kept only as a record
>
> **Do not judge anything with it, and do not quote these three numbers.** It was retired because it
> cannot discriminate: on a later run **Gold scored 32.5 and a transparency checkerboard scored 32.4**.
> An instrument that gives drawn grass and a null pattern the same answer is measuring neither.
>
> This matters more than a normal withdrawal, because until now **this file went on instructing the
> next lane to use it** — the sentence "judge strict period-2 against Gold's 28.9%" sat below as live
> guidance. Retirement was recorded in a session handoff and never reached the standard, which is the
> failure this file names in §0 and then committed against itself.
>
> The **conclusion** the section draws does not depend on it and is independently re-established under
> "The reason is structural" below.

Measured on a dark-ground node, sampling *strict period-2* (pixel differs from `x+1` and equals `x+2`
— the signature of a rigid checkerboard rather than a dither):

    r4 raw, before postprocess        6.7%  [RETIRED INSTRUMENT]   387 colours in patch
    r4 shipped, after our dither     61.4%  [RETIRED INSTRUMENT]     7
    GOLD ground                      28.9%  [RETIRED INSTRUMENT]     8

~~**Gold is roughly half as regular as ours.**~~ **Withdrawn with the instrument.** A parameter sweep
did not close the gap it reported — 4×4 and 8×8 Bayer at amplitudes 45 / 30 / 20 / 12 all landed
76–90%, and *lowering* amplitude made it worse — so **matrix size and amplitude are not the lever**.
That negative result is worth keeping as a direction not to re-walk, but it is a retired instrument's
reading and no figure in it is quotable.

**The reason is structural.** Gold's ground is genuinely varied tile content that is *also* dithered.
Ours is one flat colour with a threshold pattern laid over it — so it resolves to a perfect
alternating checker, which on dark ground reads as a missing-texture transparency grid rather than
terrain. Five of twelve maps in one round shipped looking like that.

**So the substrate matters more than the postprocess.** This is the same conclusion the LoRA
investigation reached from the other side: the same dither reached **54.84% [WITHDRAWN]** ground texture on a
LoRA cell and **6.89% [WITHDRAWN]** on a plain one. Dither amplifies variation that exists; where none exists it
manufactures a pattern. ~~**Judge strict period-2 against Gold's 28.9%, not just texture against its
60%**~~ — **both halves of that instruction are dead**: strict period-2 is retired (see the box above),
and `60%` is a rounding of the withdrawn `60.10`. *A withdrawal by enumeration survives as a rounding,*
which is exactly how this one lasted — it is the reason the banner is now scoped to the operator.

**What replaces it, and it reaches the same conclusion from a published operator.** Our raw ground
projects onto the frozen 32-swatch palette as **one colour**, where Gold's projects as three or four
losslessly (the reference table under the withdrawal banner). So there is nothing in the source for a
dither to amplify, and every structure in the shipped ground is manufactured by the matrix. **The
substrate conclusion stands; it simply no longer rests on a retired checkerboard test.** The live
question is contrast — Gold carries 34.9–40.9 amplitude on open ground against our 7.66 shipped and
2.30 raw.

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
`propInteractionRadiusDefault` is **48 map-native px**, which `propWorldRadius` (`game/props.ts:59`)
multiplies by `mapRenderScale` 2 to give **96 WORLD px**. A prop drawn inside that radius is a prop
the player is **standing on** when they arrive.

> ⚠ **This file said "96 native px" until it was checked against `data/balance.json:508`, and the
> error changed a verdict.** 48 and 96 are the same reach in two different spaces, so the figure looks
> right from either side and the units are the whole content. Painting distances are in NATIVE px, so
> **48 is the number to paint against.** Under the wrong figure both of the known violations were
> rejected; under the right one only one of them is: `r1`'s signboard at **45 native px** is inside
> the radius and IS a violation, while `bowerdeep`'s at **58 native px** is outside it and is **not**.
> A round that "fixed" bowerdeep was fixing something that was never broken.

This is not hypothetical: `bowerdeep-sign-market` is authored at **(520,560)**, inside the radius, and
`interact()` gives a prop priority over the room — so `[E]` on arrival read a signpost in a town
shipping **22 talk entries**, including both quest chains, the innkeeper, the vendor and Maren's
keystone step. Halder's quest offer was reachable only from two tiles away and nothing said so. The
code lane has since made spawn selection prefer a tile no prop covers, so the interact key is no
longer eaten — **but the composition is still wrong**: the player materialises on top of a signboard.

**So: paint no prop within ~48 native px of the centre** (= 96 world px; see the units warning
above). If a node's authored coordinate sits inside
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
