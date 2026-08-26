# The cascade's release clause — why it is structural, and what would move it

**Status: investigated, nothing changed.** No code, content or test was touched to produce this
document. It exists because `docs/BALANCE-REPORT.md` §4.3 and `docs/LANE-A-STATUS.md` §6.2 both
record *that* the release clause fails and neither records *why*, and the why is what decides
whether it is fixable at all. The decision at the end is content, which G2 puts with the owner.

Every number below is sourced to a file, a section, or the command that reproduces it. Where the
investigating note that started this was wrong, §9 says so rather than smoothing it.

---

## 1. What §10.2 asks, and which half of it holds

build-doc §10.2 (`docs/build-doc.md:310`) states `cascade_emerges` as one property with two clauses:

> for any node with an Apex, forcing its primary prey to <10% for 2 consecutive seasons yields
> **apex count →0** and **mesopredator count strictly rising within 4 seasons**

The thresholds are data, not literals: `balance.cascade` carries `preyForcedFraction` 0.1,
`forcingSeasons` 2, `apexCollapseSeasons` 4, `mesoReleaseSeasons` 4 (`data/balance.json`,
group `cascade`).

**The first clause holds.** `docs/BALANCE-REPORT.md` §4.3 measures apex → 0 at 100% of 128 seeds at
all six apex sites under the `limiting` reading, and
`tests/integration/demo-beats.test.ts:214` asserts it as a law over 24 seeds on the game path
("the apex reaches 0 at EVERY seed").

**The second clause does not.** `tests/integration/demo-beats.test.ts:241` is titled
"HONEST GAP — the RELEASE half is not a law; it is a minority of seeds" and deliberately asserts the
*shape* of the answer — `0 < released < SEEDS` — with a comment saying it "is not a licence to ship
the beat as is". `docs/LANE-A-STATUS.md` §6.2 records the same thing.

**That handling is correct and this document does not propose changing it.**

---

## 2. The mechanism: starving the apex and releasing the mesopredator are the same action

### 2.1 Every apex in the game has its own mesopredator on its menu

bible §5 (`docs/content-bible.md:104`) states the rule as: *"Apex eats Mesopredators and large
Grazers in its habitat."* `core/foodweb.ts:197` encodes exactly that as `ROLE_DIET`
(`Apex: ["Mesopredator", "Grazer"]`) with `LARGE_GRAZER_ONLY` at `core/foodweb.ts:207` gating the
Grazer half on `sizeClass === "large"` (`core/foodweb.ts:184`).

`data/species.json` carries three Apex-role lines — `fenmaw-line`, `duskstalk-line`,
`stonewing-line` — placed at six sites, which
`tests/unit/transcription.test.ts:1239` publishes as an exact list: `bowerdeep/duskstalk-line`,
`brackwater/fenmaw-line`, `cindershelf/stonewing-line`, `r2/fenmaw-line`, `r3/duskstalk-line`,
`r4/stonewing-line`. The other four "top of web" rows in §4.3 (`hearthollow`, `r1`, `duskhollow`,
`r5`) have **no Apex at all** — Skir and Wispurr are Mesopredators, which
`tests/unit/transcription.test.ts:1115` records as `NO_APEX` (D12: Meadow and Vale have no Apex).
§10.2's clause is undefined at those four rows: there is no tier between the top of the web and the
Grazers.

Derived from the shipped content with `deriveFoodWeb` (`core/foodweb.ts:244`), the three apex diets
are:

| node(s) | apex | apex eats | mesopredator | meso eats | second apex food? |
|---|---|---|---|---|---|
| `brackwater` / `r2` | Fenmaw | Mirefin, **Reedrick** | Mirefin | Reedrick | yes — Reedrick, and only via bible §5's exceptions table (`dietExceptions: ["reedrick-line"]`, the sole such entry in `data/species.json`) |
| `bowerdeep` / `r3` | Duskstalk | Webvern, **Barkhide** | Webvern | Mosslet, Gloomoth, Barkhide | yes — Barkhide, the game's only `sizeClass: "large"` line |
| `cindershelf` / `r4` | Stonewing | **Pyrelisk only** | Pyrelisk | Ashvole, Cragmar | **no** |

Two of the three apexes have a second food source, and both of those second sources arrive by
exception rather than by the general rule: one authored diet exception, one `sizeClass` tag. The
third has nothing but its mesopredator.

### 2.2 A predator substitutes across pools; it does not have preferences

`core/ecosim.ts` §7.3 step 3 (`core/ecosim.ts:577`) draws predation **proportionally** across the
predator's pools:

```
const draw  = Math.min(cfg.predationDraw * pop.count, poolTotal);
const share = draw * (pool.units / poolTotal);          // core/ecosim.ts:595
```

and starvation (§7.3 step 2) is decided on the *sum*: `availablePrey` (`core/foodweb.ts:330`) totals
every pool, and `foodRatio = availablePrey / demand` is compared against
`balance.ecosim.starveThreshold` (0.4). So thinning one pool does two things at once — it raises the
other pool's share of the same draw, and it leaves the predator unstarved as long as the remainder
covers 40% of demand.

That is the whole finding, stated as a mechanism:

> **An apex with the mesopredator on its menu cannot be starved without depleting the mesopredator,
> and cannot be starved by anything else while the mesopredator is intact.** The action that removes
> the predator and the action that releases the tier below it are the same action pointed in
> opposite directions.

At `cindershelf`/`r4` the two are literally identical: Stonewing's only pool *is* Pyrelisk, so
"force the apex's prey to 10%" and "cut the mesopredator to a tenth" are one instruction. Everywhere
else the apex has an alternative, and it eats the mesopredator instead as that alternative thins.

### 2.3 The Cullbrand raid at r4 is a bottom-up collapse, not a release

`data/balance.json` `yearEvents.raids[0]` is `cullbrand-strip-harvest-r4` (act 4, node `r4`), and its
targets are `ashvole-line` remove 11 and `cragmar-line` remove 8, scaled by
`harvestFractionOfStanding` 0.8 (`data/balance.json:250`, D-Q6-1). Both targets are Grazers — the
**mesopredator's** food, not the apex's. Stonewing does not appear in the script at all, which is
G6 working exactly as `yearEvents._source` describes: the raid decrements what it harvests and the
§7.3 rules do the rest. `docs/BALANCE-REPORT.md` §4.1 measures the consequence with no player in the
region at all: `r4`/Cragmar and `r4`/Ashvole reach zero as raid targets, and `r4`/Stonewing (15/32
seeds) and `r4`/Pyrelisk (5/32) reach zero **emergently**, above them.

So the one scripted collapse in the game is a two-tier starvation propagating upward. It is the
correct fiction for Cindershelf's "arrival mid-collapse" (bible §6) and it is the opposite shape
from the release the beat asks for.

---

## 3. The `and rising` column is not measuring the mesopredator

This is the largest correction in this document, and it changes what §4.3's best row means.

`docs/BALANCE-REPORT.md` §4.3's **and rising** column comes from `OvercatchRun.fullBeat`
(`tools/harness/full-run.ts`), whose `released` flag is defined — in its own comment — as an
existential over **everything the dead predator used to eat**:

> did ANYTHING the dead predator used to eat end the release window alive and above where it stood
> when the predator hit zero?

build-doc §10.2 says "**mesopredator** count strictly rising". Those are not the same predicate at
any node where the apex also eats a Grazer, which is four of the six apex sites (§2.1).

Re-measuring §4.3's protocol with the release test restricted to Mesopredator-role prey — same
seeds, same window arithmetic, 128 seeds per row:

| reading × shape | node | over-caught | apex → 0 | rising (any prey) | **rising (mesopredator)** | targets co-extinct |
|---|---|---|---|---|---|---|
| `primary` × `hold` | `brackwater` | Reedrick | 100% | 2% | **2%** | 87% |
| `primary` × `hold` | `r2` | Reedrick | 92% | 9% | **8%** | 67% |
| `primary` × `hold` | `bowerdeep` | Barkhide | 0% | 0% | **0%** | 100% |
| `primary` × `hold` | `r3` | Barkhide | 0% | 0% | **0%** | 7% |
| `primary` × `hold` | `cindershelf` | Pyrelisk | 100% | 0% | **0%** | 100% |
| `primary` × `hold` | `r4` | Pyrelisk | 100% | 13% | **13%** | 39% |
| `limiting` × `hold` | `brackwater` | Reedrick + Mirefin | 100% | 15% | **0%** | 15% |
| `limiting` × `hold` | `r2` | Reedrick + Mirefin | 100% | **43%** | **0%** | 2% |
| `limiting` × `hold` | `bowerdeep` | Barkhide + Webvern | 100% | 0% | **0%** | 100% |
| `limiting` × `hold` | `r3` | Barkhide + Webvern | 100% | 14% | **0%** | 42% |
| `limiting` × `hold` | `cindershelf` | Pyrelisk | 100% | 0% | **0%** | 100% |
| `limiting` × `hold` | `r4` | Pyrelisk | 100% | 13% | **13%** | 39% |

(The `effort` shapes are ≤ 2% on the mesopredator reading at every row; §10 gives the method for the
full grid.)
The `apex → 0`, `rising (any)` and `co-extinct` columns reproduce `docs/BALANCE-REPORT.md` §4.3
byte-identically — §10 gives the command.

**The 43% at `r2` is a Grazer.** `limiting` × `hold` at `r2` over-catches Reedrick *and* Mirefin; what
rises afterwards is Reedrick, one of the over-caught targets, rebounding once nothing hunts it.
Mirefin — the mesopredator — rises in **0 of 128 seeds**. The same at `r3`: the 14% is Barkhide.
Traces from the first releasing seed at each node, in the shape §4.2 uses:

```
r2  limiting/hold  seed 1340   apex reaches 0 at season 3
  fenmaw-line    2 · 1 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0
  mirefin-line   0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0   [Mesopredator]
  reedrick-line  2 · 2 · 2 · 2 · 3 · 3 · 4 · 4 · 4 · 4   [Grazer]     ← credited with the release

r3  limiting/hold  seed 1357   apex reaches 0 at season 3
  duskstalk-line 2 · 1 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0
  webvern-line   0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0   [Mesopredator]
  barkhide-line  1 · 1 · 1 · 1 · 2 · 3 · 3 · 3 · 3 · 4   [Grazer]     ← credited with the release

r4  limiting/hold  seed 1349   apex reaches 0 at season 3
  stonewing-line 2 · 1 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0
  pyrelisk-line  1 · 1 · 1 · 2 · 2 · 3 · 3 · 3 · 3 · 3   [Mesopredator] ← the real thing
```

`r4` is the only node whose release is the animal §10.2 names, and that is the structural reason:
it is the only node where the apex's sole pool is the mesopredator, so the forcing that starves the
apex is applied *to the mesopredator* and it is still standing at the end of it.

**Consequence for a finding already in the repo.** `docs/BALANCE-REPORT.md:480` concludes:

> **A vertical-slice node is the better demo stage.** `r2` … produces the complete beat in 43% of
> seeds … This closes the open risk in `docs/LANE-A-STATUS.md` §6.2.

On §10.2's own clause it does not close it. `r2`'s best mesopredator-release rate is 8%
(`primary` × `hold`), against `r4`'s 13%. The 43% row is a two-tier collapse with a Grazer
rebounding into the empty throne — which is precisely the failure mode §4.3's own prose warns about
(§4 below), applied to the row the report then nominates. `docs/LANE-A-STATUS.md` §6.2's older
statement that the complete beat "occurs at exactly one shipped node, `r4`" survives this
measurement better than the report's newer one, though it is also an overstatement: `r2` reaches 8%
and `brackwater` 2%.

---

## 4. "Throne refilled" is not the beat, and it is the column a skim lands on

`docs/BALANCE-REPORT.md:388` already says this in its own prose, and it is worth repeating where
people will hit it:

> It asks only that *something* sits at the top of the node's *live* web afterwards, and a Grazer
> inherits the throne by default once every predator above it is gone. A row with a refilled throne
> AND a high co-extinction rate is a two-tier collapse that left the herbivores in charge, not a
> mesopredator release.

`bowerdeep` and `r3` under `limiting` × `hold` read **throne refilled 100%** with **co-extinct 100%
and 42%** respectively. That row says: everything with a predator's role at the node is dead and the
moss-eaters are on top. Read left to right, "apex → 0 100% / throne refilled 100%" looks like the
beat. It is the inverse of it. The column that means the beat is **and rising** — and, per §3, even
that column needs the released line checked against its role before it means the beat.

---

## 5. The data is faithful — there is no transcription gap here

Worth stating plainly, because it locates the tension in content design rather than in a bug:

- bible §4 (`docs/content-bible.md:85`) marks exactly one line "Grazer (large)": row 18, Barkhide.
  It is the only occurrence of that string in the bible.
- `data/species.json` carries `sizeClass` on exactly one line — `barkhide-line: "large"` — and
  `core/schemas.ts:134` types the field as `z.literal("large").optional()`.
- `tests/unit/transcription.test.ts:487` asserts `line("barkhide-line").sizeClass === "large"` and
  `:488` asserts `species.filter(s => s.sizeClass).map(s => s.id)` equals exactly
  `["barkhide-line"]` — the census, not just the spot check.
- `dietExceptions` likewise carries exactly one entry across the whole roster,
  `fenmaw-line → reedrick-line`, matching bible §5's exceptions table verbatim.

Nothing is mis-transcribed. The bible gives the region one large Grazer and one diet exception, and
the web that falls out of those is the web the sim runs.

---

## 6. A refuted hypothesis, kept because the refutation is the useful part

The investigation's working hypothesis was that `bowerdeep`/`r3` was the fix: it is the only node
with a large Grazer, so Duskstalk has a food source that is not its mesopredator, so over-catching
Barkhide alone ought to starve the apex while leaving Webvern untouched and free to rise.

**The harness had already refuted it before the hypothesis was formed.**
`docs/BALANCE-REPORT.md` §4.3, reading `primary` × shape `hold` — the row that over-catches Barkhide
alone:

| node | top of web | over-caught | apex → 0 | throne refilled | and rising | tier co-extinct |
|---|---|---|---|---|---|---|
| `bowerdeep` | Duskstalk | Barkhide | **0%** | 0% | **0%** | 100% |
| `r3` | Duskstalk | Barkhide | **0%** | 0% | **0%** | 7% |

Zero of 128 seeds, at both forest nodes, in both shapes. The arithmetic is §2.2: at `r3`, Duskstalk's
demand is `3 × 6 = 18` prey units and its pools are Barkhide 10 + Webvern 8 = 18. Force Barkhide to
10% and 9 units remain, `9/18 = 0.5`, comfortably above `starveThreshold` 0.4 — Duskstalk simply
takes the whole draw out of Webvern instead. `docs/DEVIATIONS-lane-a2.md` A2-D10 recorded the same
outcome at 25 seeds ("duskstalk simply substitutes webvern for barkhide"), and `limitingPrey`
(`core/foodweb.ts:404`) exists precisely to name the set — Barkhide **+ Webvern** — that actually
starves it. Which puts the mesopredator back on the over-catch list, which is where the hypothesis
dies.

A second large Grazer at a node does not buy a release. It buys a *second thing to over-catch before
the mesopredator becomes necessary*.

---

## 7. The options

Presented as options with their measured consequences. None is recommended: G2 puts species, roster
and content rulings with the owner, and options 1 and 3 are content edits by definition.

Each was measured by re-running §4.3's protocol against a patched copy of the content, 128 seeds per
row, gates re-checked (§10 gives the method). "meso release" below is the mesopredator-restricted
column from §3, at the node named.

### Option 1 — mark Cragmar `sizeClass: "large"`, giving Stonewing a second food source at r4

Changes bible §4 row 21 and `data/species.json`. Also changes what Sable's gym (bible §7,
`docs/content-bible.md:136` — Cragmar (A) is on her roster) and the r4 encounter table mean, since
Cragmar's trophic position moves.

Measured:

| row | shipped | with Cragmar large |
|---|---|---|
| `r4` `primary` × `hold` — apex → 0 | **100%** | **0%** |
| `cindershelf` `primary` × `hold` — apex → 0 | **100%** | **0%** |
| `r4` `limiting` × `hold` — targets | Pyrelisk | Pyrelisk **+ Cragmar** |
| `r4` `limiting` × `hold` — meso release | 13% | **18%** |
| `r4` `limiting` × `hold` — rising (any prey) | 13% | 30% (credited to Cragmar) |
| `r4` `limiting` × `hold` — co-extinct | 39% | 5% |

It buys +5 pp of genuine mesopredator release at `r4`, and it costs the literal §10.2 reading at the
one node where that reading and the release currently coincide: with a second pool, over-catching
Pyrelisk alone no longer starves Stonewing, so apex → 0 goes 100% → 0% at both Steppe nodes.
`fixtures/overcatch-script.json` records the beat at `r4` by over-catching Pyrelisk alone from 14 to
1 — 7%, inside §10.2's 10% — and its `_why` states that node choice and the reason for it. So this
option retires that fixture's trace, and should be expected to turn
`tests/integration/demo-beats.test.ts:214` ("the apex reaches 0 at EVERY seed") red; the 100% → 0%
above is measured on the sim path, and that test drives the game path, so confirm rather than assume
it. Note also that the release the option does buy is credited to Cragmar in most seeds — the same
Grazer-rebound shape as `r2` (§3).

### Option 2 — raise apex demand so a mesopredator population alone cannot sustain an apex

`balance.ecosim.demandPerIndividual.Apex` is 6 (`data/balance.json:148`); the role vector is
`{Producer 0, Grazer 3, Mesopredator 2, Apex 6, Scavenger 0, AncientApex 0}`. This is the only one of
the three options that is a balance-file retune (build-doc §6 INV-3), so it needs no code change to
try: `npm run harness -- --balance <path>`.

Two shipped gates in `tests/unit/transcription.test.ts` bracket the value from both sides —
"feeds every population at the shipped state — nothing starves at t=0" (`:1215`) and
"makes apex starvation REACHABLE at every node with an Apex" (`:1228`). Recomputing both across the
integers: **only 4 ≤ Apex ≤ 10 satisfies them.** At 3, `brackwater`/Fenmaw is no longer starvable at
10% (ratio 0.400, needs < 0.400); at 11, `cindershelf`/Stonewing starves at the shipped state
(ratio 0.364). Shipped 6 sits mid-window.

Measured at both ends of the legal window:

| row | Apex 6 (shipped) | Apex 8 | Apex 10 |
|---|---|---|---|
| `r4` `primary` × `hold` — meso release | 13% | 13% | 13% |
| `r2` `primary` × `hold` — meso release | 8% | 10% | 9% |
| `brackwater` `primary` × `hold` — meso release | 2% | 3% | 2% |
| `r3` `limiting` × `hold` — apex → 0 | **100%** | **0%** | **0%** |
| `bowerdeep` `limiting` × `hold` — apex → 0 | **100%** | 100% | **0%** |
| `r2` `limiting` × `hold` — apex → 0 | 100% | 100% | **91%** |

The release does not move — ±2 pp everywhere, inside seed noise at 128 seeds — and the collapse
clause degrades. The mechanism is a second-order effect worth knowing about before anyone reaches
for this lever. `demandOf` is `count × demandPerIndividual[role]` (`core/foodweb.ts:340`), so an
apex's demand falls with its own losses. Raising the per-individual figure narrows what
`limitingPrey` returns — at Apex 8, `r3`'s limiting set shrinks from `[Barkhide, Webvern]` to
`[Barkhide]` — so the protocol forces *fewer* targets, and the shrinking apex is covered by what is
left. Measured at `r3`, Apex 8, `limiting` × `hold`: Duskstalk drops 3 → 2 in the first season and
then holds, ending at 2 in 109 of 128 seeds (3 in 18, 4 in 1) and reaching 0 in none — against
0 in 128 of 128 at the shipped value. Raising an apex's appetite does not make it easier to kill;
past a point it makes the collapse self-limiting.

### Option 3 — amend §10.2 to ask for what the web can produce

Ask for: the apex falls, the throne refills, and the tier the apex ate is released from predation —
whether or not its count rises inside the window. This is already what
`docs/LANE-A-STATUS.md` §6.2 lists as the per-run laws that *are* asserted, including "*nothing at the
node preys on the mesopredator any more*", asserted whether or not the mesopredator survived. It
changes no content and no balance value; it changes a sentence in the build doc, which the project's
own convention (`docs/DEVIATIONS.md`) requires be logged rather than silently edited.

A narrower variant of the same idea already sits in the balance report as a proposed delta:
`docs/BALANCE-REPORT.md` §6 delta 5, `cascade.mesoReleaseSeasons` 4 → 6, with the report's own
warning attached — "**This is a claim-widening delta, and it must not be applied to make a red
measurement green**". Measured:

| row | window 4 (shipped) | window 6 |
|---|---|---|
| `r4` `primary`/`limiting` × `hold` — meso release | 13% | **16%** |
| `r2` `limiting` × `hold` — rising (any prey) | 43% | 58% |
| `r2` `limiting` × `hold` — meso release | 0% | **0%** |

The wider window buys 3 pp at `r4` and nothing at `r2`, because at `r2` the mesopredator is not slow
to recover — it is dead.

### The option this document did not measure

`docs/BALANCE-REPORT.md` §6 delta 6 names a fourth: a `breedRate` lift on the mesopredator line at
the demo node. Per-line breed rates live in `data/nodes/*.json` (build-doc §7.2 — the node file is
the single source of truth), so it is a content edit, and the node files carry an authored
`_breedRule` deriving every rate from the line's adult role. It is the one lever that acts directly
on the quantity the clause measures rather than on who eats whom, and it was left unmeasured here
because changing a rate the `_breedRule` derives is a decision about that rule, not a probe.

---

## 8. What this does not change

- No test was weakened, and none should be to accommodate any of the above.
  `tests/integration/demo-beats.test.ts:241` asserts the shape of the release deliberately and says
  so; it goes red — correctly — the day a retune makes the release a law, and gets rewritten *then*.
- `fixtures/overcatch-script.json` is a recording and still reproduces its trace exactly
  (`docs/BALANCE-REPORT.md` §4.2). What §3 disputes is not the recording, it is any claim that the
  beat is robust at a node other than `r4`.
- G6 is untouched throughout. Every number here comes from `applyCatch` + `core/ecosim.ts` deciding
  its own arithmetic; nothing in this document proposes scripting a cascade.

---

## 9. Ledger — the investigating note, claim by claim

| claim | verdict |
|---|---|
| §10.2 asks for apex → 0 **and** meso strictly rising within 4 seasons | **verified** — `docs/build-doc.md:310` |
| The apex clause holds | **verified** — §4.3 `limiting` reading, and `demo-beats.test.ts:214` as a law |
| `docs/LANE-A-STATUS.md` §6.2 records the gap honestly | **verified** |
| `tests/integration/demo-beats.test.ts:241` asserts the shape, not the law | **verified** — exact line, and its comment says "not a licence to ship the beat as is" |
| "The rise is measured at **0–14% of seeds at every node**" | **wrong as stated.** The "and rising" column reaches **43%** (`r2`, `limiting` × `hold`) and 15% (`brackwater`). The 0–14% range is only true of the two `primary` readings. The *conclusion* survives, and by a stronger route: on §10.2's own clause — the **mesopredator** rising — the range is **0–13%**, because the high rows credit a Grazer (§3) |
| r4: Stonewing eats Pyrelisk only; Pyrelisk eats Ashvole + Cragmar | **verified** by `deriveFoodWeb` on the shipped content |
| The r4 raid `cullbrand-strip-harvest-r4` removes Ashvole 11 / Cragmar 8 — the meso's food, a bottom-up collapse | **verified** — `data/balance.json` `yearEvents.raids[0]`, and §4.1's baseline shows Stonewing and Pyrelisk dying emergently above it |
| r2/brackwater: Fenmaw eats Reedrick + Mirefin; Mirefin eats Reedrick | **verified.** Refinement: Fenmaw's access to Reedrick is bible §5's authored diet exception, not the large-Grazer rule |
| r2 measured at apex → 0 92%, co-extinct 67%, rising 9% | **verified**, and it is specifically the `primary` × `hold` row. Under `limiting` × `hold` the same node reads 100% / 2% / 43% |
| r3/bowerdeep: Duskstalk eats Webvern + Barkhide; Webvern eats Mosslet, Gloomoth, Barkhide | **verified** |
| Over-catching Barkhide alone collapses the apex **0%** of the time | **verified** at both forest nodes, both shapes — §6 |
| "Every apex in the game has its own mesopredator in its diet" | **verified** for all three apex lines. Refinement: only Stonewing has *nothing else*; the other two have a second pool, each arriving by an exception rather than by the §5 rule |
| Only `barkhide-line` carries `sizeClass: "large"`, and bible §4 line 85 marks only Barkhide "Grazer (large)" — the data is faithful | **verified**, and it is gated: `tests/unit/transcription.test.ts:487`–`:488` |
| "What the existing docs do not say is WHY" | **partly wrong.** `docs/DEVIATIONS-lane-a2.md` A2-D10 already states the per-node mechanism ("at brackwater and r2 the mesopredator's ONLY food is the same grazer that limits the apex"; "duskstalk simply substitutes webvern for barkhide"), and `fixtures/overcatch-script.json`'s `_why` states the node-choice rule. What was missing is the generalisation across all three apexes, the reason it is structural rather than per-node, and §3 |
| Option 2 is "the cheapest" | **true of the edit, not of the effect.** It is the only balance-file lever of the three, but measured across its whole legal window it moves the release by ≤ 2 pp and costs the collapse clause at `r3`/`bowerdeep` |
| Option 2 could lower "apex carryCaps" | **wrong location.** `carryCap` is per-line, per-node data in `data/nodes/*.json`, not in `balance.json`; `docs/BALANCE-REPORT.md` §6.1 lists it explicitly under "what CANNOT be fixed inside `balance.json`". Lowering it is a content edit, not a retune |

Two things found along the way that the note did not claim, recorded here so they are not lost:

1. **`docs/BALANCE-REPORT.md:480`'s conclusion that `r2` is the better stage does not hold on §10.2's
   clause** — §3. That is a finding about the report, not about the sim.
2. **Four of §4.3's ten rows have no Apex** (`hearthollow`, `r1`, `duskhollow`, `r5`;
   `tests/unit/transcription.test.ts:1115`), so §10.2's two-tier clause is undefined there and their
   0% entries are not evidence about the cascade either way.

---

## 10. Reproducing every number here

**§4.3's table, and the `apex → 0` / `rising (any)` / `co-extinct` columns of §3** — from the repo
root, writing somewhere other than the committed report:

```
npx tsx tools/harness/run.ts --mode run --run-seeds 32 --overcatch-seeds 128 \
  --no-print --report /tmp/balance-check.md
```

Verified while writing this: §4.3 of the output is **byte-identical** to §4.3 of the committed
`docs/BALANCE-REPORT.md`.

**The food webs of §2.1** — `deriveFoodWeb(toEcoNode(file), indexSpecies(species), balance)` from
`core/foodweb.ts:244` over `loadContent()` (`tools/harness/content.ts`), reading `preyOf` /
`predatorsOf` / `webRole` per line. No node file needs patching; the webs are derived, never stored.

**The mesopredator-restricted column of §3, and the option tables of §7** — the harness does not
publish this column. It is `runOvercatch` (`tools/harness/full-run.ts:560`) called per seed with
`seedFor(balance, i)` for `i` in `0..127`, with `released` recomputed over Mesopredator-role prey
only, using the harness's own window arithmetic:

```ts
if (run.collapsed && run.topZeroSeason !== null) {
  const windowEnd = Math.min(run.topTrace.length, run.topZeroSeason + cascade.mesoReleaseSeasons);
  for (const [id, trace] of Object.entries(run.preyTraces)) {
    if (webRole(species.byId.get(id)!, balance) !== "Mesopredator") continue;
    const atCollapse = trace[run.topZeroSeason - 1] ?? 0;
    for (let s = run.topZeroSeason; s < windowEnd; s++) {
      const v = trace[s] ?? 0;
      if (v > atCollapse && v > 0) { mesoReleased += 1; break; }
    }
  }
}
```

Each apex site has exactly one Mesopredator-role prey line, so no seed can be counted twice. If this
column is wanted permanently, `OvercatchNodeSummary` is where it belongs — that is a `tools/harness/`
change and this document deliberately made none.

**Option 1's content patch** cannot be applied through `--balance`, which only swaps the balance
member of the bundle. It was measured by deep-copying `shippedBundle()` (`core/schemas.ts:1215`),
setting `sizeClass: "large"` on the `cragmar-line` entry, re-running `validateBundle`, and rebuilding
the `LoadedContent` the same way `loadContentFromRaw` does. `data/species.json` was not touched.

**Option 2's gate window** — recompute, per node and line, `availablePrey/demand` against
`balance.ecosim.starveThreshold` at the shipped state, and `0.1 × availablePrey / demand` for
Apex-role lines. These are the two assertions at `tests/unit/transcription.test.ts:1215` and `:1228`.

Verified clean after writing this file, with only this file added: `npx tsc --noEmit` silent,
`npm run build` succeeds (one pre-existing chunk-size advisory from Vite).
