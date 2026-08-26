# TROPHIC — Content Bible v0.1
*Ideation artifact for review. Not a build doc.*

Region: **Fallowmere**. **Six acts; the calendar runs independently.** Five gym towns + one boss site. All names are placeholders pending an IP sweep.

> **AMENDED 2026-08-25** (`docs/DEVIATIONS.md` D-Q3-1, authorised by Hank). This line used to read *"Six acts = six years"*, and the whole document inherited that equation — towns listed by year, leaders by year, map variants indexed 2–6. Years and acts were never two things; they were one axis wearing two names, and the "year 6 gate" nobody designed came out of it. They are now **two independent clocks**: the CALENDAR (ticks → seasons → years) never waits and never ends, and drives ageing, retirement, the ecosim and the aged art; ACTS are driven by badges and quest flags, and drive town/route unlocks, story beats, Cullbrand raids, the rival and the finale. **Six remains the EXPECTED year count under normal pacing — a correlation, not a rule.** Everywhere below that a table column reads "Yr", read **act**; where a town's *ageing arc* is described, that stays on the calendar.

---

## 1. Type System

Eight types. Multipliers: strong ×1.5, resisted ×0.67, neutral ×1.0. **Predation rule:** if the attacker's species eats the defender's species in the food web, +25% damage regardless of type — the web is a second, learnable type chart.

| Type | Strong vs | Weak vs (takes 1.5×) | Flavor |
|---|---|---|---|
| Beast | — (gets +10% base stats instead) | Poison, Dark | baseline beasts |
| Fire | Plant, Poison, Dark | Water, Earth | fire purges |
| Water | Fire, Earth | Plant, Wind | water erodes |
| Plant | Water, Earth | Fire, Poison | growth overtakes |
| Earth | Fire, Wind | Water, Plant | stone smothers |
| Wind | Water, Poison | Earth, Dark | wind harries |
| Poison | Plant, Beast | Fire, Wind | rot corrupts |
| Dark | Wind, Beast | Fire | dusk swallows |

Exact multipliers are tunable via the balance harness (§13.15); the chart shape is the content.

## 2. Stats & Application

Five stats: **HP, Attack, Defense, Speed** (turn order, flee), **Instinct** (crit chance, bait success, sign-reading quality).

- Species base stats: 30–100 per stat.
- Age multiplier: Juvenile ×0.75 · Adult ×1.0 · Elder ×1.15.
- Levels 1–40, standard XP from battles. Effective stat = Base × AgeMult × (1 + 0.02 × Level) + trait modifiers.
- Traits: flat ±10% modifiers with names ("Thick Pelt: +10% Defense"). 1 per wild creature, +1 slot via inheritance, Elders roll rare traits.
- Damage = (Attack × MovePower / Defense) × TypeMult × Predation × roll(0.9–1.1).
- Status conditions (4): Burn (Fire, chip damage), Toxin (Poison, ramping chip), Soak (Water, −Speed), Daze (Dark, 25% skip turn).

> **NOTE 2026-08-25 — trait DISPLAY names, not the trait rule (`docs/DEVIATIONS.md` D-Q4-2 / D-Q4-3, authorised by Hank).** "Thick Pelt" above is bible-verbatim and is unchanged. The other fourteen names in `data/balance.json` `.traits.pool` are coined (DEVIATIONS D16), and two of them — **Keen Eye** and **Strong Jaw** — were exact matches for real Pokémon **Abilities** (#51 and #173). They are now **Bright Eye** and **Broad Jaw**. The pool is a deliberate 5×3 lattice, so the replacements had to read as their column: *Bright Eye* is the positive of *Dulled Sense* and sits beside *Long Memory*; *Broad Jaw* is the positive of *Soft Bite* and sits beside *Ember-Heart*. **Only the display names moved.** The trait `id`s `keen-eye` and `strong-jaw` are untouched — they are opaque keys read by `core/` and the tests and are never rendered — and the ±10% magnitude, the slot counts and the Elder rare roll are all byte-identical. Screened against Pokémon species, moves, abilities, items and characters; both are clean of exact matches (near-misses recorded in `docs/IP-SWEEP.md`).

> **NOTE 2026-08-25 — the status names have now been screened, and one is a real Pokémon move (`docs/DEVIATIONS.md` D-Q4-8).** **Soak** is an exact match for the Generation V Pokémon move *Soak* (Water, status). Ours is a Water status that cuts Speed; theirs retypes the target, so the effect differs — but the name is identical and it is on screen in battle. **Hank screened it and ruled it KEPT.** Burn, Toxin and Daze are clean. Status names had never been screened at all before this pass — `docs/IP-SWEEP.md` did not mention them.

## 3. Move System

Each creature has exactly 4 move slots: **2 type moves + 1 role move + 1 utility**, unlocked at levels 1/5/10/15. Move pool is 28 total — small by design.

- **Type moves (16):** one light (~40 power, secondary effect) + one heavy (~70 power) per type. E.g. Fire: *Singe* (40, 20% Burn) / *Pyre* (70). Water: *Douse* (40, 20% Soak) / *Riptide* (70). Same pattern all eight types.

> **NOTE 2026-08-25 — the Water light move's spelling was corrected (`docs/DEVIATIONS.md` D-W4-1, authorised by Hank).** This bullet used to read ***Dous***. The shipped `data/moves.json` `name` is **`Douse`**, and has been since the Q2 IP pass; the bible was the last place the old spelling survived. **"Douse" alone matches no Pokémon species, move, ability, item or character** — the nearest thing is the **Douse Drive**, a real Pokémon *item* (Genesect's Water-type drive), which is a two-word item name and not this move. That is recorded rather than acted on, per the owner's stated bar for this sweep: only actual Pokémon *names* are in scope. **Only the display name is affected** — the move `id` is still `dous`, an opaque key that never renders, on the same reasoning as D-Q1-5 and D-Q4-5.

> **NOTE 2026-08-25 — one coined type-move name moved (`docs/DEVIATIONS.md` D-Q4-1, authorised by Hank).** This bullet names only the Fire and Water pairs, so the other twelve type-move names are coined (DEVIATIONS D6) and are not bible content. One of them, the **Plant heavy** move, was called **Overgrow** — an exact match for the real Pokémon **Ability** *Overgrow* (#65), the one every Grass starter line carries. TROPHIC has a Plant starter line, so the collision sat in the same slot of the same design. It is now **Thicket**: Bramble is one thorny stem, Thicket is the whole stand. Screened clean against Pokémon species, moves, abilities, items and characters (the only near neighbour is the Paldean location *Tagtree Thicket*). **Only the display name moved** — the move id is still `overgrow`, and the power (70), type, weight, `text` and empty effects list are byte-identical.
- **Role moves (5):** Producer — *Regrow* (self-heal 30%); Grazer — *Trample* (50 power, +25 vs Producer); Mesopredator — *Ambush* (60 power, always first on entry turn); Apex — *Terrify* (enemy −Attack 2 turns); Scavenger — *Scrounge* (40 power, heal for damage dealt).
- **Utility (7):** Bristle (+Defense), Quicken (+Speed), Shriek (−enemy Defense), Focus (+Instinct/crit), Daunt (−enemy Attack), Burrow (skip turn, +evasion), Lure (raise catch odds on this target this battle).

> **AMENDED 2026-08-25 — utility move names only (`docs/DEVIATIONS.md` D-Q1-1 … D-Q1-5, authorised by Hank: *"go ahead and rename the Pokemon move duplications"*).** This line used to read *"Harden (+Defense) … Screech (−enemy Defense) … Snarl (−enemy Attack), Burrow/Roost (skip turn, +evasion)"*. **Harden**, **Screech**, **Snarl** and **Roost** are all four real Pokémon moves — Harden and Screech share our name *and* our exact effect — so `docs/IP-SWEEP.md` rated them RED. **Harden → Bristle**, **Screech → Shriek**, **Snarl → Daunt**, and the alias "Roost" is deleted so the move is just **Burrow** (D8's one-move-two-names reading is retired; the pool is still 7 utility / 28 total). **Only the names moved.** Every effect in the parentheses is byte-identical to what it was, because effects are content and G2 protects them. **CORRECTION 2026-08-25 (`docs/DEVIATIONS.md` D-Q4-6):** this note used to claim that "the three replacements were screened against the Pokémon move *and* ability lists, Cassette Beasts, Temtem, Coromon, Monster Sanctuary and Digimon…". **That screen was run on the FIRST three replacements — Rootfast / Scoldcall / Baretooth — which Hank withdrew the same day** (commit `64b04b5`) because compounds fought this document's own register, which is single plain words. Bristle / Shriek / Daunt came from the earlier verified-clean shortlists but had **never been checked against the Pokémon ability list**, and that commit said so. They have now been screened against Pokémon species, moves, abilities, items and characters: **Bristle** and **Shriek** are clean of exact matches — but **`Daunt` is an exact match for a Pokémon Shuffle skill (ひるませる)**, which nobody knew when it was adopted. **That is recorded, not fixed:** G2 forbids an agent deciding it, and Hank has not ruled. See `docs/IP-SWEEP.md` and DEVIATIONS D-Q4-7. **Still unruled and unchanged:** *Focus* (a real Cassette Beasts move), and the coined type moves *Miasma* and *Shade* (both exact Digimon attack names). *Burrow* itself remains a Temtem / Coromon / Monster Sanctuary skill name — AMBER, Hank's call.

## 4. Species Roster (26)

All species have three age forms (J/A/E). Lifespan on catch: J = 3 years, A = 2, E = 1. **Hybrid evolution model:** most species keep one identity across all three age forms; five *metamorphic lines* change species identity as they age — evolution mapped onto the existing age system, so it costs zero extra mechanics and zero extra battle sprites.

**Metamorphic lines (5):**
- *Starters (full 3-stage, one name per age form):* Cindril → Vulkindle → Pyrevane · Puddlisk → Rillisk → Maelstrisk · Thornlet → Bramblore → Thornwald. Final form arrives in the elder year — your starter peaks right before the league, then retires.
- *Wild lines (2-stage, larval juvenile → evolved adult/elder):* **Bogling → Mirefin** (tadpole to lungfish; Grazer→Mesopredator, Water→Water/Poison — role and type shift at metamorphosis, so what it eats and what eats it changes mid-life) · **Gloomgrub → Gloomoth** (Poison/Plant grub → Dark/Wind moth). Wild adults of a line only appear in evolved form; the population sim tracks the line as one age-structured species.

Metamorphosis stat jump: ×1.15 on top of the normal age multiplier at the J→A transition for metamorphic lines. Role/type per age class is one extra column in the species JSON.

| # | Name | Type(s) | Role | Habitat | Concept |
|---|---|---|---|---|---|
| 1 | Cindril | Fire | Mesopredator | starter | fox kit, ember-tipped tail |
| 2 | Puddlisk | Water | Mesopredator | starter | glass-skinned newt |
| 3 | Thornlet | Plant | Mesopredator | starter | bramble hedgehog |
| 4 | Nibbin | Beast | Grazer | Meadow | plains vole |
| 5 | Pollywisp | Wind/Plant | Grazer | Meadow | seed-carrying wisp-moth |
| 6 | Bramblehog | Plant | Grazer | Meadow | thorn boar |
| 7 | Skir | Wind | Mesopredator | Meadow | meadow kestrel |
| 8 | Loamunder | Earth/Plant | Producer | Meadow | walking sod clump, seeds fields |
| 9 | Bogling | Water | Grazer | Marsh | mudball tadpole — juvenile form of the Mirefin line |
| 10 | Reedrick | Plant/Wind | Grazer | Marsh | stilt-legged reed wader |
| 11 | Mirefin | Water/Poison | Mesopredator | Marsh | stalking lungfish |
| 12 | Fenmaw | Water | Apex | Marsh | bulk gharial |
| 13 | Sporantle | Poison/Plant | Producer | Marsh/Forest | spore-antlered fungus beast (decomposer) |
| 14 | Mosslet | Plant | Grazer | Forest | moss-backed hare |
| 15 | Webvern | Poison | Mesopredator | Forest | canopy weaver spider-wyrm |
| 16 | Gloomoth | Dark/Wind | Grazer | Forest | dusk moth, migratory — juvenile form is Gloomgrub (Poison/Plant) |
| 17 | Duskstalk | Dark | Apex | Forest | long-limbed shadow cat |
| 18 | Barkhide | Plant/Earth | Grazer (large) | Forest | armored bark elk |
| 19 | Ashvole | Fire | Grazer | Steppe | cinder-burrowing vole |
| 20 | Pyrelisk | Fire/Earth | Mesopredator | Steppe | vent basilisk |
| 21 | Cragmar | Earth | Grazer | Steppe | boulder ram |
| 22 | Stonewing | Earth/Wind | Apex | Steppe | obsidian condor |
| 23 | Carricrow | Dark/Wind | Scavenger | roaming | carrion crow — spawn weight rises where webs crash |
| 24 | Umbrat | Dark | Grazer | Vale | shade rat |
| 25 | Wispurr | Dark/Beast | Mesopredator | Vale | will-o-wisp cat |
| 26 | Vellsire | Beast/Dark | Ancient Apex | Sanctum | vanished keystone stag — primary Ancient, story/finale |
| 27 | Kilnback | Fire/Earth | Ancient Apex | Steppe (hidden) | kiln-shelled tortoise dormant beneath the vents — minor legendary |
| 28 | Undermere | Water/Dark | Ancient Apex | Marsh (hidden) | eyeless serpent of the lake-beneath-the-lake — minor legendary |

**Ancient Apexes (3).** Returned legendaries: they **do not age and do not evolve** — permanently Elder stage, implied centuries-to-millennia old. One form each. Caught Ancients are exempt from year-turn aging: the single exception to the everything-ages rule, which is what makes them worth the hunt. Very hard catches, gated behind rare sign-card chains unlocked by side content (Kilnback via Cindershelf mine lore, Undermere via ferryman Sel's tales, Vellsire via the finale). Each exerts a presence effect on the sim: Vellsire buffs all breeding rates in adjacent nodes (keystone), Kilnback keeps the steppe vents warm (Fire spawns active), Undermere steadies the marsh water table (Water breeding). **Lore surfaces (required content):** NPC dialogue — Sel's serpent tales, Bram and the miners on "the warm shell below," Maren's keystone lectures, Duskhollow astronomers on the Vellsire's vanishing — plus environmental decorations: antler standing-stones on routes, shell-kiln shrines in the mine, sunken idols visible in the marsh shallows. These props double as the sign-chain trailheads.

Asset count: 27 lines (Bogling merges into the Mirefin line; Kilnback and Undermere are single-form) — 25 aging lines × 3 forms + 2 Ancients × 1 form = 77 forms × (front + back) = 154 battle sprites, + 35 named dex identities with painted illustrations, + overworld mini-sprites for encounterable species.

## 5. Food Web (rule-derived)

The web is derived from roles within a shared habitat, not enumerated per-pair:
- Apex eats Mesopredators and large Grazers in its habitat.
- Mesopredators eat Grazers in their habitat.
- Grazers eat Producers (creature Producers + each node's abstract flora stock).
- Scavengers eat nothing live; their spawn weight scales with recent deaths at the node.
- Exceptions table (small, for flavor): Fenmaw also eats Reedrick; Carricrow roams all habitats; Ancients eat nothing — each exerts a presence effect on breeding/spawns instead (see §4).

**Seasonal migrants (v1-lite, locked):** exactly four species carry seasonal spawn windows — one per season, so the system teaches itself: Pollywisp (spring bloom), Reedrick (summer waters), Gloomoth (autumn migration, region-wide — ties into the existing event), Wispurr (winter-active). All other species spawn year-round; full per-species seasonal tables stay a stretch goal. **Legibility requirement:** dex entries and sign cards flag migrants as "dormant" or "migrating" out of season, so seasonal absence is never confusable with a population crash.

Populations, breeding rates, and starting counts live in one JSON per node — this file is simultaneously the encounter table, the ecology sim's initial state, and the bait lookup. Single source of truth.

## 6. Region Map — Towns

| Act | Town | Biome | Unique feature | Aging arc |
|---|---|---|---|---|
| 1 | Hearthollow | Meadow | Warden Maren's field station: starter choice, bait-crafting intro, tutorial forage | fields flourish or wither with Route 1 health |
| 2 | Brackwater | Marsh | stilt town; ferry unlock; fishery economy visibly indexed to Fenmaw/Bogling populations | docks rot or get rebuilt |
| 3 | Bowerdeep | Forest canopy | night market (Dark spawns while shopping); silk economy off Webvern; Cullbrand logging subplot | canopy thins if Barkhide over-caught |
| 4 | Cindershelf | Volcanic steppe | relic forge (retirement relics crafted here); arrival mid-collapse — Route 4's web already crashed by Cullbrand strip-harvest | vents flare, mine expands or closes |
| 5 | Duskhollow | Dusk vale | observatory; star census (dex-completion rewards); Vellsire lore | dark encroaches as the Sanctum destabilizes |
| 6 | The Sanctum Fallow | Sealed caldera | league + finale; no shops, one long approach | revealed in the state your ecology earned |

> **The "Act" column was labelled "Yr" and is an ACT index (`docs/DEVIATIONS.md` D-Q3-1).** A town opens when the player reaches its act, whatever the calendar says — `balance.acts.gates` carries the row. The **Aging arc** column is the exception and stays on the CALENDAR: docks rot, canopy thins and vents flare with the world, not with the plot, so a player who rushes sees a younger town and that is correct.

Routes: one primary route per biome (R1 Meadow Reach, R2 Brackmarsh, R3 Bowerdeep Wilds, R4 Cinder Steppe, R5 Duskhollow Vale) + the Sanctum Approach. 12 walkable maps total (6 towns/sites + 6 routes), vertical-slice priority: Hearthollow, R1, Brackwater, R2 fully walkable first; later nodes fall back to vignette cards if the week compresses.

## 7. Gym Leaders (fixed rosters)

| Act | Leader | Type | Team (age class) | Signature |
|---|---|---|---|---|
| 1 | Maribel | Beast | ~~Nibbin (A),~~ Bramblehog (A), Skir (A) — **AMENDED, see below** | "Old Nib" — Nibbin (E), Thick Pelt |
| 2 | Odo | Water | Bogling (J), Reedrick (A), Mirefin (A) | Fenmaw (E) |
| 3 | Vesper | Poison | Gloomgrub (J), Sporantle (A), Mirefin (A), Webvern (A) | Webvern (E), rare trait |
| 4 | Sable | Fire | Ashvole (A), Cragmar (A), Ashvole (E), Stonewing (A), Pyrelisk (A) | Pyrelisk (E) |
| 5 | Noct | Dark | Gloomoth (A), Umbrat (A), Carricrow (A), Wispurr (A), Umbrat (E) | Duskstalk (E) |
| 6 | Magnate Greaves | mixed/industrial | Carricrow (A), Pyrelisk (A), Mirefin (A), Duskstalk (E), Fenmaw (E) | Stonewing (E) |

> **AMENDED 2026-08-25 — gym 1 only (`docs/DEVIATIONS.md` D-A5-G1, authorised by Hank).** Maribel fields **three**, not four: the duplicate Nibbin (A) is cut and she keeps Bramblehog (A), Skir (A) and the signature. The balance harness measured this fight at **26.0%** against build-doc §10.5's 80–95% target for gym 1 — the hardest fight in the game, against a year-6 finale at 36.2%. All three possible cuts were measured over 500 seeds and Nibbin (A) won on every axis; cutting it also removes the roster's only repeated line, and the Nibbin she keeps is the named signature. Her Beast identity therefore rides on "Old Nib" alone, which is the stated cost of the change. Her signature also drops its assigned +2 level premium (D-A5-G2). The rows for gyms 2–6 are untouched.
>
> **Roster sizes (signature included) are therefore 3 / 4 / 5 / 6 / 6 / 6**, not the 4 / 4 / 5 / 6 / 6 / 6 stated below.

> **The "Act" column was labelled "Yr" and is an ACT index (`docs/DEVIATIONS.md` D-Q3-1)**, shipped as `data/gyms.json` `act`. Odo is the act-2 leader whether the player reaches him in calendar year 2 or year 11. **Beating a leader no longer ends the year** (L8 as amended, D-Q2-1); it writes a badge flag, which is the act model's only numeric input.

Roster sizes (signature included): 4 / 4 / 5 / 6 / 6 / 6 *(gym 1 amended to 3 — see the note above)*. Elder count ramps with the acts — one Elder in early gyms, two-to-three by the endgame; Greaves fields harvested prime specimens, which is the point of him. Juvenile line-forms in gyms 2–3 (Bogling, Gloomgrub) quietly showcase the metamorphic lines before the player's own creatures reach them.

## 8. Story Spine

- **Mentor:** Warden Maren — regional ecologist, gives starter + snares + the survey notebook. Frames the premise: Fallowmere's keystone (Vellsire) vanished a generation ago; the webs have been fragile since.
- **Rival:** Wick — a Cullbrand Company apprentice your age. Battles you each act. His philosophy is harvest-first; the routes he's worked are visibly degraded when you reach them. His team always includes Carricrow — he profits from collapse.
- **Antagonist:** The Cullbrand Company — industrial creature-harvesters. Their operations are the scripted, large-scale version of the player's own over-catching. Act 4 opens on a route they've already crashed: the collapse mechanic taught at scale, no tutorial text needed.
- **Finale:** Greaves breaches the Sanctum to take the Vellsire. Beat him, then face the Vellsire yourself: **catch it or release it — locked: catchable, with honest costs.** Release = restoration ending; epilogue shows adjacent nodes re-blooming under the keystone buff. Catch = it's yours forever (Ancients don't age), and the epilogue survey shows the same nodes *without* the buff — measurably poorer, stated in numbers, never in judgment. The game does not moralize: it reports the counts and says nothing about them.

## 9. Side Quests (2/town)

| Town | Quest | Teaches / rewards |
|---|---|---|
| Hearthollow | *First Signs* — guided forage on R1 | sign-card system tutorial |
| Hearthollow | *The Fallow Field* — farmer begs you not to catch Loamunder | producers matter; refusing pays better long-term (R1 bloom) |
| Brackwater | *Restock the Shallows* — release captured Boglings | **release verb** intro; restoration raises fishery payouts |
| Brackwater | *Ferryman's Wager* — catch an Elder Mirefin before year's end | push-your-luck showcase; ferry discount |
| Bowerdeep | *Silk Shortage* — merchant wants 3 Webvern; gym leader objects | over-catch dilemma with visible consequence either way |
| Bowerdeep | *Lanternless Night* — escort through the Gloomoth migration | seasonal event mechanics |
| Cindershelf | *After the Crash* — survey of wrecked R4 | reading a collapsed web; unlocks scavenger lore |
| Cindershelf | *Forge a Legacy* — craft your first retirement relic | relic system tutorial |
| Duskhollow | *The Star Census* — dex milestones | painted dex art as collectible reward |
| Duskhollow | *Vellsire's Trail* — follow ancient sign-cards | finale setup, Instinct checks |

**Regional events:** Annual Festival (the year's closing celebration); Great Migration (Gloomoth flocks shift spawns region-wide); Cullbrand Harvest raids (scripted per act, populations visibly drop at a named node); Bloom Year (a route whose producers thrive — positive feedback made visible).

> **AMENDED 2026-08-25** (`docs/DEVIATIONS.md` D-Q2-1 / D-Q2-2, authorised by Hank).
>
> **The Annual Festival is no longer a "diegetic gym gate" and no longer "closes the year."** A gym victory does not end a year — only the full meter does (L8 as amended) — so the festival cannot gate on one and cannot close anything. It is the year's closing celebration: it spans the year's **final season** and ends when the meter fills.
>
> **All four events are SEASON-LONG WINDOWS**, on Hank's constraint: *"events like that last for a whole season and not just for one in-game day."* Each opens at a season boundary, stays open for `balance.clock.ticksPerSeason` ticks, and closes at the next — `core/regional-events.ts`. The Festival is the year's last season; the Migration is a migrant's own `seasonalWindow`; a **raid's** window is the season **its act was entered in**, not a year; a **Bloom Year** is a node whose flora clears `balance.regionalEvents.bloomFloraFraction` of the sim's ceiling at a season boundary.
>
> **Two halves of this sentence are deliberately NOT built, and are recorded rather than quietly dropped:** the Migration's "shift spawns region-wide" (the migrant window removes Gloomoth out of season; it does not raise them elsewhere in season) and the Bloom Year's "gets bonus spawns" (story-review decision D10, unruled — building an encounter-weight multiplier would be G3). The WINDOWS ship; those two effects do not.
>
> **Season note (unresolved, story-review D7):** §9 says the Migration is *spring*; §5 and every shipped row in `data/species.json` say **autumn**. The data wins in code; the discrepancy is Hank's to rule on.

## 10. NPCs

Named: Maren (mentor), Wick (rival), Greaves (boss), 5 gym leaders, forge-smith Bram (Cindershelf), ferryman Sel (Brackwater), + ~2 quest NPCs per town. Generic: innkeepers (rest = 2 ticks), market vendors, ~4–6 ambient townsfolk per town (static sprites, turn-to-face only).

> **NOTE 2026-08-25 — one quest-NPC given name moved, and five bible-canon names were screened and KEPT (`docs/DEVIATIONS.md` D-Q4-4 / D-Q4-8, authorised by Hank).** The "~2 quest NPCs per town" this line asks for were given coined names in `docs/DIALOGUE-NOTES.md` D-1 — Tolm, Halder, Pell, Gerta, Ives, Orrin and, in Brackwater, **Nessa**. **Nessa is the Galar Gym Leader of Hulbury** (Sword/Shield), a **Water-type** specialist whose father is canonically a fisher; ours was the angler of the marsh/fishery town running a shallows survey. Same name, same element, same role shape. She is now **Hetty** — one word, archaic English pastoral, unglamorous, sharing no first syllable with any bible-canon name, and clean of any in-universe Pokémon name. **Only the display name moved:** the speaker id `nessa` and every `nessa.*` dialogue entry id are untouched.
>
> **Screened and KEPT, on Hank's ruling — every one of these is an exact match for a real but minor Pokémon character, and every one stays:** **Maren** (boat owner, *Pokémon the Movie 2000*), **Maribel** (Club Look-See, *My Pokémon Ranch*), **Vesper** (Diamond Clan, *Legends: Arceus*), **Odo** (*Legends: Arceus*, Bogbound Camp), **Bram** (Battle Maison Trainer #108, XY/ORAS). All five are ordinary given names with independent provenance and none is a headline character. Evidence in `docs/IP-SWEEP.md`.

> **NOTE 2026-08-25 — "Generic" no longer means anonymous (`docs/DEVIATIONS.md` D-W4-3).** The
> sentence above still describes the *cast structure* correctly — the counts, the sprite rule and the
> inn's 2-tick rest are unchanged — but **"generic" is now a role tier, not a naming convention.**
> `docs/DIALOGUE-NOTES.md` D-2 originally gave background townsfolk **trade labels** in place of
> personal names ("Old Drover", "Net-Mender", "Shaft-Hand", "Fishery Buyer"), deliberately, to keep
> the coined-name surface small. That has been replaced: **41 background speakers — 10 generic
> (innkeepers, vendors) and 31 ambient — take real given names.**
>
> **The convention, which is what this section is now canonical for.** Register is set by the work,
> never by money, in four tiers:
> - **HANDS** — field, dock, shaft, road, crew, boat. One hard syllable, or two with a closed ending.
> - **SKILLED / SALARIED** — innkeepers, stallholders, winders, lampwrights, shepherds, elders. A
>   softer two syllables, often a real saint's or grandmother's name.
> - **INSTITUTIONAL** — anyone who speaks for a contract or a company is addressed by **surname
>   alone**, exactly the way Greaves is. Every Cullbrand employee in every town is surname-only, so
>   the player hears "company" before the character says a word.
> - **CHILDREN** — diminutives, and the only vowel-final or pet-form names in the cast.
>
> **The mechanical rules**, verified against `data/species.json`, `data/nodes/*.json`, `data/gyms.json`,
> `data/moves.json` and `data/balance.json`: no cast name exactly matches any species form, dex id,
> line id, node id, node display name, town, gym name, nickname, trait name, move name or item name;
> **no cast name shares its first three letters with any of those tokens**; and no two cast names —
> nor any cast name against the protected bible canon — share their first three letters. *(The one
> surviving head-collision, `Maren`/`Maribel`, is bible canon and out of scope.)* Every name was also
> screened against the Pokémon corpora, which produced 11 exact character hits: 5 renamed, 6 kept —
> see `docs/IP-SWEEP.md`, *"Ordinary English given names are a dense Pokémon-collision space"*.
>
> **The 41 names themselves are deliberately NOT transcribed here.** They live in one place — the
> cast table in **`docs/CAST-AND-VOICE.md`** §4 + Appendix E, which is now in this repository.
> **The durable source of truth for a shipped name is `data/dialogue.json`**; `CAST-AND-VOICE.md`
> is the roster and the reasoning behind it, and the two must be reconciled when the names land.
>
> None of them is
> in `data/dialogue.json` yet**; the prose lane is applying them. Verified: every affected speaker id
> still carries its trade label (`innkeeper-duskhollow` → `"Innkeeper"`, `duskhollow-elder` → `"Vale
> Elder"`). Copying a 41-row roster into the bible before it ships would create a second source of
> truth that drifts from the first. **This section owns the convention; the cast table owns the
> names.** When they land, `docs/DIALOGUE-NOTES.md` §2 D-2 is the row they supersede.

## 11. Items & Economy

- **Snares** ×3 tiers (base / weighted / master — catch multipliers).
- **Baits** — crafted from the food-web JSON: match bait to target's diet for a catch bonus; role-generic baits cheap, species-specific better.
- **Medicines** — salve (field heal), tonic (status cure), inn rest (full heal, 2 ticks).
- **Relics** — from retirement, craftable at the forge into held items (+trait-like effects).
- Currency from quests + trainer battles; sinks: snares, bait mats, inn, forge.

## 12. Systems Inventory (screens & plumbing)

Screens: title, overworld, battle, map + season meter, ecology survey (per-node populations + web view), dex (painted art), team/creature summary (shows projected retirement year), bag, forge, quest log, save. Plumbing: save slots (aging applies to boxed creatures too), settings, text-speed.

## 12a. Audio Spec (locked: free chiptune packs + procedural SFX)

**Sourcing rule:** all BGM from a single CC0 pack or a single composer's pack family — mixing packs causes the audio version of style drift (inconsistent instrumentation reads as amateur faster than any single weak track). License CC0 preferred; CC-BY acceptable with an attribution file. SFX generated procedurally (bfxr/jsfxr-style) for authentic GB texture.

**Track manifest** — curation happens against this, not by browsing vibes:

| Track | Context | Mood spec |
|---|---|---|
| Title | menu | wistful, pastoral, mid-tempo |
| Hearthollow | town y1 | warm, homely, major key |
| Brackwater | town y2 | damp, swaying, woodblock/marimba feel |
| Bowerdeep | town y3 | canopy-dappled, arpeggiated, slightly mysterious |
| Cindershelf | town y4 | industrial rhythm, low brass-ish square leads |
| Duskhollow | town y5 | slow, starlit, minor key, sparse |
| Sanctum Approach | site y6 | sacred, held tones, building dread |
| Route (meadow/marsh) | R1–R2 | bright walking tempo |
| Route (forest/steppe/vale) | R3–R5 | moodier walking tempo |
| Wild battle | encounters | driving, loopable under 45s |
| Trainer/gym battle | trainers | urgent, stronger percussion |
| Greaves / finale | boss | heavy, mechanical, relentless |
| Ancient encounter | Vellsire/Kilnback/Undermere | vast, slow, awe before threat |
| Retirement / legacy | year-turn retirement scene | tender, short, resolves upward — this cue carries the game's emotional beat; pick it first |
| Festival / year-turn | act transitions | celebratory jingle into a quiet outro |
| Ending / credits | epilogue | title theme reprise, thinned |

Jingles (short stingers): catch success, gym victory, level-up, item get, dex entry.

**Procedural treatments:** seasons apply DSP presets to whatever's playing (spring: neutral; summer: +brightness; autumn: lowpass + slight slow; winter: heavier lowpass, sparse EQ). Year aging progressively darkens town-theme EQ so Hearthollow year 5 sounds like a memory of year 1. One track, six readings — the bespoke feel without bespoke composition.

**SFX set:** menu move/confirm/cancel, battle hit, super-effective hit (brighter), status apply, snare throw / shake ×3 / catch success, flee, footsteps (grass, wood, stone), door, sign-card reveal, survey open.

## 13. Gaps I Flagged (things not in your list)

1. **Moves & learnsets** — the biggest missing axis; specced §3 as a deliberately tiny 28-move pool.
2. **Damage formula + status conditions** — §2.
3. **Evolution** — RESOLVED: hybrid. Age forms carry most species; 5 metamorphic lines (3 starters full-stage, 2 wild larval lines) ride the same age system. No sprite-count increase.
4. **Starter trio + mentor** — §4, §8.
5. **Rival, antagonist, story spine** — a Pokémon-like without a rival reads hollow; §8 ties them to the ecology mechanic instead of bolting on a villain.
6. **Release/restoration verb** — catching's inverse; makes the ecology two-directional and enables the ending choice. Cheap: same population math, sign flipped.
7. **Healing loop** — inn rest costs ticks so healing isn't free time-wise.
8. **Box/storage aging rule** — boxed creatures age at year turns (anti-hoarding).
9. **Population tables = encounter tables = bait lookup** — one JSON per node, single source of truth (§5).
10. **Aging-art pipeline constraint** — year-variant maps must be img2img at low denoise with layout frozen, so one collision mask per map survives all six years. This is load-bearing; if layout drifts, collision work ×6.
11. **Audio** — RESOLVED: single-source CC0 chiptune pack curated against the §12a track manifest, procedural SFX, DSP treatments for season/year. 
12. **Balance harness** — headless autobattler simulating gym fights + type-chart winrates; the thing that lets agents tune §1–§3 overnight.
13. **Dialogue budget** — ~10 lines per named NPC, ~3 per ambient = roughly **400–560** lines total. Draftable in bulk, but it's a real content item.

> **AMENDED 2026-08-25 — the total band was raised 400–500 → 400–560 (`docs/DEVIATIONS.md` D-BUDGET-1, authorised by Hank).** The **per-speaker** figures above are unchanged, and so are the per-speaker ceilings the test enforces — this moves the total only, so the budget still has a real upper bound rather than a nominal one. Two measured reasons, both recorded in the test's own comment at `tests/unit/dialogue.test.ts` (the `is "roughly 400–500 lines total"` case): wiring the previously unreachable entries added a finale loss branch, which pinned the corpus at exactly 500/500 with no headroom at all; and the amended prose standard favours plainer, baggier speech, which sometimes splits one cramped line into two. **The test title still quotes this document's original phrase**, which is deliberate — the title names the bible clause the case exists to enforce, and the assertion beneath it carries the amended number.
14. **KO semantics** — recommend faint-only (no battle death; lifespan is the mortality system). Nuzlocke-style permadeath as a post-week toggle.
15. **Tutorial beat + opening** — 3–4 painted stills + Maren dialogue; cheap, needed.
16. **IP sweep** — every coined name above needs a quick trademark/collision pass before anything ships publicly.

## 14. Open Decisions

None — content bible settled, pending your review pass.
