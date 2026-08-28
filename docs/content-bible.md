# TROPHIC — Content Bible

Canonical for **content**: types, stats, moves, species, the food web, towns, gyms, story, quests,
NPCs, items, screens, audio. **G2**: no agent invents or alters a value here.

- Where `docs/build-doc.md` also specifies something, **the build doc wins**.
- Where this file and `data/` disagree, **`data/` is what ships** — raise it in `docs/STATUS.md`, never
  reconcile silently.
- **IP renames moved display names only; every `id` is unchanged**: `overgrow` → Thicket · `harden` →
  Bristle · `screech` → Shriek · `snarl` → Daunt · `burrow-roost` → Burrow (alias "Roost" deleted) ·
  `dous` → Douse · `keen-eye` → Bright Eye · `strong-jaw` → Broad Jaw · speaker `nessa` → Hetty. A
  replacement is a single plain word, never a compound. Screened and ruled **kept unchanged**: the
  status `Soak`, the moves `Harry` and `Lure`, and the names Maren, Maribel, Vesper, Odo, Bram.
- **No name in this file is a placeholder.** Every coined name here is affirmed as shipped — the
  region, the towns and routes, the species and their age forms, the moves, the traits and the cast.
  The renames above are the whole of the list; nothing else is renamed, and a name already created is
  never re-opened (build-doc L1).

Region: **Fallowmere**. Seven acts — act 0 is the prologue, then one act per gym. Five gym towns + one boss site.

**Two clocks, independent.** The **calendar** (ticks → seasons → years) is unbounded and drives ageing,
retirement, the ecosim and the aged art; **acts** are driven by badges and quest flags and drive
unlocks, story beats, raids, the rival and the finale. Every column headed **Act** is an act index; a
town's **ageing arc** is the exception and stays on the calendar.

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

The chart **shape** is the content and is transcribed to `data/moves.json` `typeChart`; the multiplier
**values** are tunable and live in `data/balance.json` `types`.

## 2. Stats & Application

Five stats: **HP, Attack, Defense, Speed** (turn order, flee), **Instinct** (crit chance, bait success, sign-reading quality).

- Species base stats: 30–100 per stat.
- Age multiplier: Juvenile penalty · Adult neutral · Elder bonus. The **shape** is the content; the
  **values** are tunable and live in `data/balance.json` `age.multiplier` — shipped today
  J ×0.875 · A ×1.0 · E ×1.075, and expected to move again after playtesting. Build-doc L9 is the rule.
- Levels 1–40, standard XP from battles. Effective stat = Base × AgeMult × (1 + 0.02 × Level) + trait modifiers.
- Traits: flat ±10% modifiers with names ("Thick Pelt: +10% Defense"). 1 per wild creature, +1 slot via inheritance, Elders roll rare traits. Pool: `data/balance.json` `.traits.pool`.
- Status conditions (4): Burn (Fire, chip damage), Toxin (Poison, ramping chip), Soak (Water, −Speed), Daze (Dark, 25% skip turn).

The damage formula, the status magnitudes, the catch formula and the XP curve are **build-doc §7.4**.
**KO = faint only** — lifespan is the mortality system (build-doc Hard Req 8).

## 3. Move System

Each creature has exactly 4 move slots: **2 type moves + 1 role move + 1 utility**, unlocked at levels 1/5/10/15. Move pool is 28 total — small by design.

- **Type moves (16):** one light (~40 power, secondary effect) + one heavy (~70 power) per type. E.g. Fire: *Singe* (40, 20% Burn) / *Pyre* (70). Water: *Douse* (40, 20% Soak) / *Riptide* (70). Same pattern all eight types.
- **Role moves (5):** Producer — *Regrow* (self-heal 30%); Grazer — *Trample* (50 power, +25 vs Producer); Mesopredator — *Ambush* (60 power, always first on entry turn); Apex — *Terrify* (enemy −Attack 2 turns); Scavenger — *Scrounge* (40 power, heal for damage dealt).
- **Utility (7):** Bristle (+Defense), Quicken (+Speed), Shriek (−enemy Defense), Focus (+Instinct/crit), Daunt (−enemy Attack), Burrow (skip turn, +evasion), Lure (raise catch odds on this target this battle).

**Rules**

- **`Burrow` is ONE move.** Reading "Burrow/Roost" as two makes the pool 29 and breaks the stated 28.

## 4. Species Roster (27 lines · 35 dex identities)

All species have three age forms (J/A/E). Lifespan on catch: J = 3 years, A = 2, E = 1. **Hybrid evolution model:** most species keep one identity across all three age forms; five *metamorphic lines* change species identity as they age — evolution mapped onto the existing age system, so it costs zero extra mechanics and zero extra battle sprites.

**Metamorphic lines (5):**
- *Starters (full 3-stage, one name per age form):* Cindril → Vulkindle → Pyrevane · Puddlisk → Rillisk → Maelstrisk · Thornlet → Bramblore → Thornwald. Final form arrives in the **elder** year, which is the calendar's business; the league is on the act clock, and the two do not meet. So where a starter stands at the finale is not fixed and no lifespan table can fix it: a fast player fights it with an adult, a slower one with the elder form, a slower one still with the heir of a starter already retired. All three are correct, and the survey is where the difference is written.
- *Wild lines (2-stage, larval juvenile → evolved adult/elder):* **Bogling → Mirefin** (tadpole to lungfish; Grazer→Mesopredator, Water→Water/Poison — role and type shift at metamorphosis, so what it eats and what eats it changes mid-life) · **Gloomgrub → Gloomoth** (Poison/Plant grub → Dark/Wind moth). Wild adults of a line only appear in evolved form; the population sim tracks the line as one age-structured species.

Metamorphosis stat jump: ×1.15 on top of the normal age multiplier at the J→A transition for metamorphic lines. Role/type per age class is one extra column in the species JSON.

The 28 dex identities with authored concepts (the other seven are the metamorphic starters' adult and
elder forms and Gloomgrub — see Rules):

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
| 26 | Vellsire | Beast/Dark | Ancient Apex | Sanctum (hidden) | vanished keystone stag — primary Ancient, story/finale |
| 27 | Kilnback | Fire/Earth | Ancient Apex | Steppe (hidden) | kiln-shelled tortoise dormant beneath the vents — minor legendary |
| 28 | Undermere | Water/Dark | Ancient Apex | Marsh (hidden) | eyeless serpent of the lake-beneath-the-lake — minor legendary |

**Ancient Apexes (3).** Returned legendaries: they **do not age and do not evolve** — permanently Elder stage, implied centuries-to-millennia old. One form each. Caught Ancients are exempt from year-turn aging: the single exception to the everything-ages rule, which is what makes them worth the hunt. Very hard catches, gated behind rare sign-card chains unlocked by side content (Kilnback via Cindershelf mine lore, Undermere via ferryman Sel's tales, Vellsire via the finale). Each exerts a presence effect on the sim: Vellsire buffs all breeding rates in adjacent nodes (keystone), Kilnback keeps the steppe vents warm (Fire spawns active), Undermere steadies the marsh water table (Water breeding). **Lore surfaces (required content):** NPC dialogue — Sel's serpent tales, Bram and the miners on "the warm shell below," Maren's keystone lectures, Duskhollow astronomers on the Vellsire's vanishing — plus environmental decorations: antler standing-stones on routes, shell-kiln shrines in the mine, sunken idols visible in the marsh shallows. These props double as the sign-chain trailheads.

Asset count (derived in `tools/comfy/manifest.json`): 24 aging lines × 3 forms + 3 Ancients × 1 form =
**75 forms ⇒ 75 battle sprites**, + overworld mini-sprites for encounterable species.
⚠ **This line read *"75 forms × (front + back) = 150 battle sprites, + 35 painted dex identities"* and BOTH halves are now false — corrected in place, and build-doc §9.7 is canonical for the counts. Nothing else on this page moves; the line count here is held so that citations into this file do not drift.** The owner cut the creature backs (*"we're not going to have the backs of any of the creatures"*), so a form ships **ONE front sprite — 75, not 150**: `tools/comfy/manifest.json` carries 75 `creature-battle` rows and zero back rows, `game/ui/BattleHud.ts`'s `Facing` is a one-member union so a back key is a compile error, and the two tests build-doc cites bind 75 — `tests/unit/manifest.test.ts:526` is titled *"75 creature battle sprites — ONE front per form (not §9.7's 154, and no longer 150)"*. And the owner took cut line **C-4** (*"the dex uses the existing creature sprites"*), so the painted dex class, its 35 rows and its 35 plates are **deleted** (`ef9982f`) — the dex draws the creature's own battle sprite and adds no manifest rows of its own.

**Rules**

- **`starter`, `roaming` and `hidden` are habitat sentinels, not biomes.** The three Ancients carry
  `hidden`, which is what gates them behind their sign chains instead of encounter weight.
- **Presence effects ship as one key per Ancient** — `keystoneBreed`, `ventWarmth`, `waterTable`.
- **Barkhide's "Grazer (large)" ships as an explicit flag**; largeness is never inferred from stats.
- **A dex identity with no concept text here inherits its line's, plus its age stage** — by published
  rule, never by taste: `tools/comfy/manifest.json` `_derivedFormRule`.

## 5. Food Web (rule-derived)

The web is derived from roles within a shared habitat, not enumerated per-pair:
- Apex eats Mesopredators and large Grazers in its habitat.
- Mesopredators eat Grazers in their habitat.
- Grazers eat Producers (creature Producers + each node's abstract flora stock).
- Scavengers eat nothing live; their spawn weight scales with recent deaths at the node.
- Exceptions table (small, for flavor): Fenmaw also eats Reedrick; Carricrow roams all habitats; Ancients eat nothing — each exerts a presence effect on breeding/spawns instead (see §4).

**Seasonal migrants (v1-lite, locked):** exactly four species carry seasonal spawn windows — one per season, so the system teaches itself: Pollywisp (spring bloom), Reedrick (summer waters), Gloomoth (autumn migration, region-wide — ties into the existing event), Wispurr (winter-active). All other species spawn year-round; full per-species seasonal tables stay a stretch goal. **Legibility requirement:** dex entries and sign cards flag migrants as "dormant" or "migrating" out of season, so seasonal absence is never confusable with a population crash.

Populations, breeding rates, and starting counts live in one JSON per node — this file is simultaneously the encounter table, the ecology sim's initial state, and the bait lookup. Single source of truth.

**Rules**

- **Producers and Scavengers are exempt from the starvation step** — a literal "eats nothing" starves
  them out and takes Carricrow and the flora chain with it.
- **Steppe and Vale have no creature Producer**; their Grazers feed on `floraStock` alone.

## 6. Region Map — Towns

| Act | Town | Biome | Unique feature | Aging arc |
|---|---|---|---|---|
| 1 | Hearthollow | Meadow | Warden Maren's field station: starter choice, bait-crafting intro, tutorial forage | fields flourish or wither with Route 1 health |
| 2 | Brackwater | Marsh | stilt town; ferry unlock; fishery economy visibly indexed to Fenmaw/Bogling populations | docks rot or get rebuilt |
| 3 | Bowerdeep | Forest canopy | night market (Dark spawns while shopping); silk economy off Webvern; Cullbrand logging subplot | canopy thins if Barkhide over-caught |
| 4 | Cindershelf | Volcanic steppe | relic forge (retirement relics crafted here); arrival mid-collapse — Route 4's web already crashed by Cullbrand strip-harvest | vents flare, mine expands or closes |
| 5 | Duskhollow | Dusk vale | observatory; star census (dex-completion rewards); Vellsire lore | dark encroaches as the Sanctum destabilizes |
| 6 | The Sanctum Fallow | Sealed caldera | league + finale; no shops, one long approach | revealed in the state your ecology earned |

Routes: one primary route per biome (R1 Meadow Reach, R2 Brackmarsh, R3 Bowerdeep Wilds, R4 Cinder Steppe, R5 Duskhollow Vale) + the Sanctum Approach. 12 walkable maps total (6 towns/sites + 6 routes), vertical-slice priority: Hearthollow, R1, Brackwater, R2 fully walkable first; later nodes fall back to vignette cards.

**Rules**

- **A town opens when the player reaches its act**, whatever the calendar says (`balance.acts.gates`).
  The **Aging arc** column stays on the calendar: a player who rushes sees a younger town, correctly.
- **Routes have no aging arc here**; a route inherits the arc of the town sharing its biome
  (`tools/comfy/manifest.json` `_nodes`).
- **Cindershelf's "arrival mid-collapse" is produced, never baked.** `data/nodes/r4.json` ships the
  year-1 state; the act-4 raid fires on entry and the predator collapse must emerge (G6).
- **Route 4's Apex reaching zero is the intended reading of that arrival, not an imbalance.** The raid
  takes the two Steppe Grazer lines; the Mesopredator that eats them starves; the Apex above it has no
  second pool in this habitat, so it follows. What the harness measures is its `baseline` profile —
  no player in the region at all — and those lines still reach zero under it, because the raid fires
  with or without a player. The raid-suppressed control that would show the raid is the *whole* cause
  has not been run, and the harness has no mode for it; the raid is authored here either way
  (build-doc §10.5).

## 7. Gym Leaders (fixed rosters)

| Act | Leader | Type | Team (age class) | Signature |
|---|---|---|---|---|
| 1 | Maribel | Beast | Bramblehog (A), Skir (A) | "Old Nib" — Nibbin (E), Thick Pelt |
| 2 | Odo | Water | Bogling (J), Reedrick (A), Mirefin (A) | Fenmaw (E) |
| 3 | Vesper | Poison | Gloomgrub (J), Sporantle (A), Mirefin (A), Webvern (A) | Webvern (E), rare trait |
| 4 | Sable | Fire | Ashvole (A), Cragmar (A), Ashvole (E), Stonewing (A), Pyrelisk (A) | Pyrelisk (E) |
| 5 | Noct | Dark | Gloomoth (A), Umbrat (A), Carricrow (A), Wispurr (A), Umbrat (E) | Duskstalk (E) |
| 6 | Magnate Greaves | mixed/industrial | Carricrow (A), Pyrelisk (A), Mirefin (A), Duskstalk (E), Fenmaw (E) | Stonewing (E) |

Roster sizes (signature included): **3 / 4 / 5 / 6 / 6 / 6** (`core/schemas.ts` `GYM_ROSTER_SIZES`). Elder count ramps with the acts — one Elder in early gyms, two-to-three by the endgame; Greaves fields harvested prime specimens, which is the point of him. Juvenile line-forms in gyms 2–3 (Bogling, Gloomgrub) quietly showcase the metamorphic lines before the player's own creatures reach them.

**Rules**

- **This section gives no levels.** The ramp is assigned by published rule in `data/gyms.json` `_levels`;
  gym 1's signature is its one exception.
- **The Act column is an act index** (`data/gyms.json` `act`). **Beating a leader does not end the year**
  — it writes a badge flag, the act model's only input.
- **Juvenile line-forms are keyed by line id**: Bogling = `mirefin-line` J, Gloomgrub = `gloomoth-line` J.

## 8. Story Spine

- **Opening:** 3–4 painted stills + Maren dialogue.
- **Mentor:** Warden Maren — regional ecologist, gives starter + snares + the survey notebook. Frames the premise: Fallowmere's keystone (Vellsire) vanished a generation ago; the webs have been fragile since.
- **Rival:** Wick — a Cullbrand Company apprentice your age. Battles you each act. His philosophy is harvest-first; the routes he's worked are visibly degraded when you reach them. His team always includes Carricrow — he profits from collapse.
- **Antagonist:** The Cullbrand Company — industrial creature-harvesters. Their operations are the scripted, large-scale version of the player's own over-catching. Act 4 opens on a route they've already crashed: the collapse mechanic taught at scale, no tutorial text needed.
- **Finale:** Greaves breaches the Sanctum to take the Vellsire. Beat him, then face the Vellsire yourself: **catch it or release it — locked: catchable, with honest costs.** Release = restoration ending; epilogue shows adjacent nodes re-blooming under the keystone buff. Catch = it's yours forever (Ancients don't age), and the epilogue survey shows the same nodes *without* the buff — measurably poorer, stated in numbers, never in judgment. The game does not moralize: it reports the counts and says nothing about them.

**Rules**

- **Wick's six rosters are authored, not derived** (`rival[]` in `data/gyms.json`), under one
  machine-checkable rule: **every slot's line lives on a route he has already worked**, at the region's
  own wild level band for that act.
- **Every end of the Vellsire fight except a reported catch resolves as `released`** — a failed snare, a
  flee, a party wipe, a defeated stag (`game/finale.ts`). A failed snare is the *common* outcome.

## 9. Side Quests (2/town)

| Town | Quest | Teaches / rewards |
|---|---|---|
| Hearthollow | *First Signs* — guided forage on R1 | sign-card system tutorial |
| Hearthollow | *The Fallow Field* — farmer begs you not to catch Loamunder | producers matter; the turn-in branches on Hearthollow's live Loamunder count and pays accordingly |
| Brackwater | *Restock the Shallows* — release captured Boglings | **release verb** intro; restoration raises fishery payouts |
| Brackwater | *Ferryman's Wager* — catch an Elder Mirefin before year's end | push-your-luck showcase; ferry discount |
| Bowerdeep | *Silk Shortage* — merchant wants 3 Webvern; gym leader objects | over-catch dilemma with visible consequence either way |
| Bowerdeep | *Lanternless Night* — escort through the Gloomoth migration | seasonal event mechanics |
| Cindershelf | *After the Crash* — survey of wrecked R4 | reading a collapsed web; unlocks scavenger lore |
| Cindershelf | *Forge a Legacy* — craft your first retirement relic | relic system tutorial |
| Duskhollow | *The Star Census* — dex milestones | ⚠ painted dex art as collectible reward — **THE REWARD THIS NAMES NO LONGER EXISTS.** The owner took cut line C-4 and `ef9982f` deleted the painted dex class, its 35 rows and its 35 plates. The milestones are untouched; what the milestone *hands over* is unruled and is his — registered in `docs/STATUS.md` "Waiting on the owner". **Marked, not rewritten: no agent may substitute a reward (G2).** |
| Duskhollow | *Vellsire's Trail* — follow ancient sign-cards | finale setup, Instinct checks |

**Regional events:** Annual Festival (the year's closing celebration); Great Migration (Gloomoth flocks shift spawns region-wide); Cullbrand Harvest raids (scripted per act, populations visibly drop at a named node); Bloom Year (a node whose producers cross into thriving — a season-long window, and nothing else).

**Rules**

- **All four events are season-long windows** (`core/regional-events.ts`) — open on a season boundary,
  closed at the next. Never one in-game day.
- **The Annual Festival is the year's final season, every year.** It gates no gym and closes no year;
  only a full meter ends a year.
- **No regional event weights an encounter** — a second weight table is G3. The Migration's "shift spawns
  region-wide" ships as a window and nothing more.
- **The Bloom Year is a latch on the RISE, and in practice it opens once per node.** A node crossing
  `balance.regionalEvents.bloomFloraFraction` of the flora ceiling *upward* opens one season-long
  window; no second window opens until that node's producers have been pushed back under the
  threshold. Under the shipped sim they cannot be: `ecosim.floraRegenPerSeason` exceeds the most a
  node's grazers can consume in a season, so flora climbs to the ceiling and stays. Every location
  therefore blooms once, in year 1 or 2, and never again — that is what the rules produce and it is
  not treated as a defect.
- **The Bloom Year grants no bonus spawns**, and none is owed. Weighting encounters off an event is a
  second spawn table, which G3 forbids; `core/foodweb.ts` is the only thing that may compute a weight,
  and it computes it from live counts. The window is the whole of the event.
- **The Great Migration is autumn**, and as an event *kind* it is open in every season of every year —
  one migrant per season, so some line's window is always open, whatever `ticksPerSeason` is retuned
  to. Every published flag is therefore per line, and no copy may say "the Great Migration is on".
- **Raids fire on entry to their act, never on a year turn**, take a fraction of standing stock, and may
  decrement only the harvested prey — the collapse above them must emerge (G6).
- **The raid list is closed at one.** The act-4 R4 strip-harvest is the only raid, against seven acts,
  and that is a ruling rather than an unfinished list (build-doc §7.5): widening it at the same
  intensity was measured to exterminate lines at the two starter routes, and the shipped dialogue
  already treats the Cullbrand contract as finished. Do not author a second one.
- ***The Fallow Field* re-arms annually**, a year after it settles — both endings promise it
  (`ANNUAL_QUESTS`, `game/quests.ts`).

## 10. NPCs

Named: Maren (mentor), Wick (rival), Greaves (boss), 5 gym leaders, forge-smith Bram (Cindershelf), ferryman Sel (Brackwater), + ~2 quest NPCs per town. Generic: innkeepers (rest = 2 ticks), market vendors, ~4–6 ambient townsfolk per town (static sprites, turn-to-face only).

**"Generic" is a role tier, not a naming convention.** 41 background speakers — 10 generic (innkeepers,
vendors) and 31 ambient — take real given names, assigned by register tier.

**Rules**

- **This section owns the fact of the cast and never lists it.** The names have landed in
  `data/dialogue.json`, the durable source of truth for a shipped name; `docs/CAST-AND-VOICE.md` holds
  the roster, the four register tiers and the name-collision rule that governs adding one.
- **Dialogue budget:** ~10 lines per named NPC, ~3 per ambient, **400–560 total**
  (`data/dialogue.json` `_budget`); `tests/unit/dialogue.test.ts` enforces both.

## 11. Items & Economy

- **Snares** ×3 tiers (base / weighted / master — catch multipliers).
- **Baits** — crafted from the food-web JSON: match bait to target's diet for a catch bonus; role-generic baits cheap, species-specific better.
- **Medicines** — salve (field heal), tonic (status cure), inn rest (full heal, 2 ticks).
- **Relics** — from retirement, craftable at the forge into held items (+trait-like effects).
- Currency from quests + trainer battles; sinks: snares, bait mats, inn, forge.

Prices and medicine magnitudes are tunables in `data/balance.json` `economy` / `medicine` — this section
names the effects, not the numbers.

## 12. Systems Inventory (screens & plumbing)

Screens: title, overworld, battle, map + season meter, ecology survey (per-node populations + web view), dex (painted art), team/creature summary (shows projected retirement year), bag, forge, quest log, save. Plumbing: save slots (aging applies to boxed creatures too), settings, text-speed.

## 12a. Audio Spec (locked: free chiptune packs + procedural SFX)

**Sourcing rule:** all BGM from a single CC0 pack or a single composer's pack family — mixing packs causes the audio version of style drift (inconsistent instrumentation reads as amateur faster than any single weak track). License CC0 preferred; CC-BY acceptable with an attribution file. SFX generated procedurally (bfxr/jsfxr-style) for authentic GB texture.

**Track manifest — eleven tracks** — curation happens against this, not by browsing vibes:

| Track | Context | Mood spec |
|---|---|---|
| Title | title screen | wistful, pastoral, mid-tempo |
| Hearthollow | town, act 1 | warm, homely, major key |
| Brackwater | town, act 2 | damp, swaying, woodblock/marimba feel |
| Route (meadow/marsh) | R1–R2 | bright walking tempo |
| Wild battle | encounters | driving, loopable under 45s |
| Trainer/gym battle | trainers | urgent, stronger percussion |
| Greaves / finale | boss | heavy, mechanical, relentless |
| Ancient encounter | Vellsire/Kilnback/Undermere | vast, slow, awe before threat |
| Retirement / legacy | year-turn retirement scene | tender, short, resolves upward — this cue carries the game's emotional beat; pick it first |
| Festival / year-turn | the year's final season, into the turn | celebratory jingle into a quiet outro |
| Ending / credits | epilogue survey | title theme reprise, thinned |

Jingles (short stingers): catch success, gym victory, level-up, item get, dex entry.

**Procedural treatments:** seasons apply DSP presets to whatever's playing (spring: neutral; summer: +brightness; autumn: lowpass + slight slow; winter: heavier lowpass, sparse EQ). Year aging progressively darkens town-theme EQ so Hearthollow year 5 sounds like a memory of year 1. One track, six readings — the bespoke feel without bespoke composition.

**SFX set:** menu move/confirm/cancel, battle hit, super-effective hit (brighter), status apply, snare throw / shake ×3 / catch success, flee, footsteps (grass, wood, stone), door, sign-card reveal, survey open.

**Rules**

- **The Context column names an act where it names a story rung and the calendar where it names a
  season.** Town themes cue on **acts**; the **Festival cue is on the calendar** (the year's final
  season, every year), and the two can be arbitrarily far apart. The `y1…y6` labels this table used to
  carry were the six-acts-equal-six-years model, replaced everywhere else in the project.
- **Eleven rows, not sixteen.** The location themes for Bowerdeep, Cindershelf, Duskhollow, the Sanctum
  Approach and R3–R5 came off the list: those nodes ship as travel-only vignette cards rather than
  walkable maps, so a location theme for them has nowhere to play. The walkable slice carries three
  location themes — Hearthollow, Brackwater, and one route theme across R1–R2 — and the other eight
  cues are scene cues, not places. A twelfth row waits on a node becoming walkable, and G9's one-family
  rule binds whatever is curated.
- **"Year aging progressively darkens" is the calendar**, and the ramp **saturates** at
  `balance.clock.yearsTotal - 1` (`game/season-tint.ts` `yearDarkening`).
