# TROPHIC — IP Collision Sweep

*Research artifact for Hank's decision. Satisfies the research half of guardrail **G15**
("do not ship coined names publicly without the IP-sweep checklist item being checked by Hank")
and build-doc §18's human pre-submission checklist item. Bible §13.16 asked for
"a quick trademark/collision pass before anything ships publicly" — this is it.*

**This is not legal advice and not a trademark clearance.** I am not a lawyer. Everything
below is web and database research: storefront searches, game-wiki existence checks, and
trademark-registry queries. It can prove that a collision *exists*. It cannot prove that one
*doesn't* — an unregistered common-law mark, a game that never got indexed, or a name in a
language I didn't search will not appear here. **Hank makes every call. Nothing below is a
decision.**

---

## Read this first

Eighteen names are RED and thirty-seven are AMBER, out of ~100 coined names checked.

**The single most urgent item is the game title.** There is already a game called exactly
**Trophic** on itch.io — the same storefront TROPHIC is shipping to — and it is an
*ecosystem/food-web simulation* where you balance populations to prevent extinction. Same
word, same platform, same subject matter. The good news, and it is genuinely good: a
worldwide trademark search across ~75 offices found **zero** marks named TROPHIC in any
video-game class (9, 28, or 41), and the old US mark that did exist is dead. So the title is
trademark-clear and the risk is practical, not legal — discoverability and "someone got here
first" — which is exactly the kind of risk Hank may reasonably choose to accept.

**Two place names are worse than the title and were not obvious.** **Duskhollow** is being
actively marketed right now by someone else: Archon Studio has a live Gamefound campaign for
*Dungeons & Lasers VIII: **Duskhollow***, a gothic terrain and miniatures line that also
establishes Duskhollow as a named setting in their world — tabletop, but the same fantasy-games
audience and the same search results. And **Fallowmere**, our top-level region name, sits one
letter from **TALLOWMERE**, a *live registered class-9 (game software) trademark* owned by the
indie developer of the *Tallowmere* roguelikes, which sell on Steam and itch.io — the exact two
storefronts we target. Fallowmere is also a commercial tabletop terrain range sold by Warbases
in the UK. Those two are the names I would move first after the title decision.

**Four of the eighteen REDs are now closed.** On 2026-08-25 Hank authorised the move renames and they shipped: **Harden → Rootfast**, **Screech → Scoldcall**, **Snarl → Baretooth**, and the `Roost` alias deleted outright. Evidence, corpora and caveats are in **"The Q1 move renames"** below; the changes are logged as `docs/DEVIATIONS.md` D-Q1-1 … D-Q1-6 and amended into `docs/content-bible.md` §3. Nothing else in this document has been acted on.

After that, the concentrated damage is in two places. **Five of the 28 move names and two
of the 15 trait names are literally Pokémon content** — `Harden`, `Screech`, `Snarl` and
`Roost` are real Pokémon moves (Harden and Screech are the same name *and the same effect* as
ours), `Overgrow` is the signature Ability of Pokémon's Grass starter line, and `Keen Eye` and
`Strong Jaw` are real Pokémon Abilities. In a Pokémon-adjacent game that is the most visible
possible lift, and it is also the **cheapest** category to fix — renaming a move touches four
files and no art. **Five creature names collide with shipping commercial games**: `Umbrat` and
`Wispurr` are creatures in other monster-taming games *right now*, `Mirefin` is a Blizzard
murloc tribe, `Gloomoth` is a Square Enix Mana-series monster, and `Undermere` is the town the
*Strange Horticulture* franchise is set in. A sixth, `Bramblore`, is RED for a different
reason: it is not commercial anywhere, but **two unconnected hobby projects independently coined
the identical word for the identical Grass-starter slot**, which is evidence it is the obvious
coinage rather than a distinctive one.

Nothing in the roster is an actual Pokémon species name — all 35 checked and all clear. The
Ancient **Kilnback**, the **Cullbrand Company**, and the towns **Bowerdeep** and
**Cindershelf** came back spotless on every source. **Vellsire** is AMBER on style alone —
no collision was found anywhere; "-sire" is simply a live Pokémon morpheme (Quagsire, Clodsire).

**Timing matters more than any single rename, and the window is closing while you read this.**
When this sweep started, `data/dialogue.json` did not exist and no per-species art existed. By
the time it finished, `data/dialogue.json` was ~150 KB and carried every name (Mirefin ×20,
Bogling ×16, Cullbrand ×11 …), and `assets/` had grown from 72 to 116 files including named
palette trials for `mirefin`, `bogling`, `gloomoth`, `wispurr`, `undermere` and
`map-duskhollow` — **four of those six are RED names.** Renaming today is still a data edit
plus a manifest rebuild. After the B3 art batch it is a different and much larger job. The
cheapest RED to fix is the region: **`Fallowmere` appears in only five files.**

---

## Risk bands

| Band | Definition | What it means for Hank |
|---|---|---|
| 🔴 **RED** | A real collision in the same or adjacent space: an actual Pokémon move/ability/species name, a creature or location in a shipping commercial game, an exact title on a storefront we ship to, or a live trademark in a games/software/entertainment class. | **Recommend renaming.** |
| 🟡 **AMBER** | A collision exists but is distant, dormant, in an unrelated class, homebrew/fan-made only, or is a common word that merely coincides with something famous. | **Hank decides.** |
| 🟢 **GREEN** | No meaningful collision found after genuine searching against the sources listed in Method. | No action. |
| ⚪ **INSUFFICIENT EVIDENCE** | Searched, but could not establish the answer either way. | Not a GREEN. Treat as open. |

A note on how I used the bands: I did **not** inflate a rating just because a famous thing
shares a word. An ordinary English word used as a functional label (`Bait`, `Snare`, `Focus`)
is weakly protectable and widely reused, and I say so rather than dressing it up as a hazard.
Conversely I did not soften a rating because a collision was "only" an indie game — a shipping
creature-collector with the same creature name is the most relevant collision there is.

---

## Method — what was actually checked

Every conclusion below rests on a source I queried in this session, not on recall. My own
knowledge of small indie games and trademark registers is stale and was treated as unusable.

| Source | How | Validated? |
|---|---|---|
| **Pokémon species / moves / abilities** | URL-existence probe against `pokemondb.net/{pokedex,move,ability}/<name>`; 200 = exists, 404 = does not. Also PokeAPI's full 1,025-species list. | Yes — controls `bite`, `dig`, `growth` (moves), `torrent`, `blaze`, `thick-fat` (abilities), `gloom`, `umbreon`, `poliwag`, `bulbasaur` (species) all returned 200. |
| **Trademarks worldwide** | TMview JSON API (`tmdn.org/tmview/api/search/results`), the EUIPO aggregator covering the USPTO plus ~75 national offices. | Yes — control `pokemon` returned 1,489 marks incl. Nintendo's registrations. |
| **Steam** | Live store search per name; "0 results match your search" is a definitive negative. | Yes — behaved correctly on known titles. |
| **itch.io** | Live search scrape per name, exact-title matching. | Yes — and see the caveat below. |
| **Other creature-collectors** | MediaWiki per-title existence queries against Cassette Beasts (`wiki.cassettebeasts.com`), Temtem, Coromon, Monster Sanctuary, Loomian Legacy, Kādomon, Nexomon, Palworld, Digimon, Yo-kai Watch. | Yes — controls `Undertow`, `Scorch` (CB), `Stampede`, `Brace`, `Rend` (Temtem/Coromon), `Sprawl`, `Kindle` (MS) all hit; nonsense strings all missed. |
| **Magic: The Gathering** | Scryfall full-name API per name. | Yes. |
| **Digimon** | MediaWiki raw-revision fetch, reading attack lists in page source rather than trusting search snippets. | Yes — both hits (Miasma, Shade) re-read from source. |
| **Fantasy/fiction wikis** | MediaWiki search across Wikipedia, Wikidata, Forgotten Realms, Elder Scrolls, WoW, Critical Role, D&D 4e/5e, Greyhawk, Witcher, Final Fantasy, Mana, Warriors, Wookieepedia and others. | Yes. |
| **Books, music, real places** | OpenLibrary, MusicBrainz, OpenStreetMap/Nominatim — used mainly on the place names. | Yes. |
| **General web** | Google-backed search until the session's 200-call budget ran out, then Bing and Startpage scrapes. | Partly — Bing silently returns dictionary noise for rare strings, so its negatives were never treated as evidence. |

### Two method failures worth recording, because they nearly produced false GREENs

1. **A `WebFetch` of `itch.io/search?q=trophic` returned itch's homepage, not search results** —
   a silent false negative that would have reported the title as clean. Scraping the same URL
   with `curl` returned the real result set including the exact-title match. **Any future sweep
   must positive-control its itch.io queries.**
2. **My first Cassette Beasts screen used `cassettebeasts.fandom.com` and found nothing** — but
   the positive controls `Undertow` and `Scorch` (both known CB moves) also found nothing,
   proving the method was broken, not the names clean. The working host is
   **`wiki.cassettebeasts.com`**. A third-party stream separately found that
   `coromon.wiki.gg`'s `Category:Skills` lists only 79 of 258 skills — screening off that
   category yields badly wrong negatives.

   Related, from the same failure class: MediaWiki returns `invalid` (not `missing`) for a
   malformed title, and a naive "not missing = exists" check counts that as a hit. I hit this
   bug and fixed it; it produced a false *positive*, which is the friendlier direction, but the
   same carelessness in the other direction is what produces a bogus clean bill of health.

### What could NOT be established

- **Direct USPTO TESS/tmsearch access.** `tmsearch.uspto.gov` is a JavaScript app behind an AWS
  WAF challenge; its API paths returned `NoSuchKey`/`MethodNotAllowed`. Justia, Trademarkia,
  uspto.report and TrademarkElite all returned HTTP 403/404 to automated access. **TMview is
  the substitute and it is a good one** (it aggregates the USPTO), but it is an aggregator with
  its own indexing lag, and it is not a clearance search.
- **Fan-forum fakemon coverage.** r/fakemon, PokeCommunity, DeviantArt and Relic Castle all
  blocked automated fetch, and the session's web-search budget (200 calls) was exhausted
  partway through. Fakemon findings rest on the Fakemon/Fanon wikis, GitHub code search and
  general web search. **Assume fakemon exposure is under-counted, not clean.**
- **Common-law (unregistered) trademark rights** anywhere. Not searchable by these means.
- **Non-English-language collisions**, beyond what TMview's multi-office coverage surfaced.

---

## 🔴 RED — recommend renaming (18 — **4 of them resolved 2026-08-25**)

> **Status update.** The four RED *move* collisions — `Harden`, `Screech`, `Snarl`, `Roost` — were renamed on 2026-08-25 on Hank's authorisation and are struck through below. **The other fourteen REDs are untouched and still open**, including the title, `Fallowmere`, `Duskhollow`, the five RED creatures, `Overgrow`, and the two RED traits. The replacement screening is recorded in "The Q1 move renames" below.

| Name | Category | What was found | Sources |
|---|---|---|---|
| **Duskhollow** | Town (Yr 5) | The most-occupied name in the project, and the occupation is happening **now**. **Archon Studio has a live Gamefound campaign for "Dungeons & Lasers VIII: Duskhollow"** — a gothic modular terrain and miniatures line that also establishes Duskhollow as a named setting in their Deuslair world (page title verified; the name appears ~60 times on it). Separately, **"Duskhollow PD" is a three-part *Magnus Archives* special** (Rusty Quill) — a large, engaged audience attached to the exact name. Plus **"Dusk Hollow"**, a free 2022 game on Steam, **"Welcome to Dusk Hollow"** on itch.io, and WoW's **Baron Duskhollow**. TMview shows no registered mark, so this is crowding and discoverability rather than a legal problem — but it is severe, and it is the one name where a competitor is spending marketing money on it this year. | [D&L VIII: Duskhollow — Gamefound](https://gamefound.com/en/projects/archon-studio/duskhollow) · [Archon Studio announcement](https://archon-studio.com/blog/news-1/announcing-dungeons-and-lasers-duskhollow) · [MAG Duskhollow PD](https://shows.acast.com/themagnusarchives/episodes/magduskhollowpd-part2) · [Dusk Hollow — Steam](https://store.steampowered.com/app/2151310/Dusk_Hollow/) · [Baron Duskhollow](https://warcraft.wiki.gg/wiki/Baron_Duskhollow) |
| **Duskhollow Vale** | Route (R5) | The full phrase is unused everywhere — TMview 0, Steam 0, itch.io no exact match. But it carries the entire Duskhollow collision with it. **Inherited RED: there is no version of keeping this route name that survives renaming the town, and no reason to keep it if the town changes.** | as Duskhollow above |
| **Fallowmere** | **Region** (top-level) | Three exact-name uses in adjacent spaces plus a one-letter-off live game trademark. (1) **Warbases (UK) sells a commercial tabletop terrain range branded *Fallowmere*** — 16+ SKUs including "Fallowmere Jail"; verified live on their store. (2) **Fallowmere is a named principality in Janny Wurts' published *Wars of Light and Shadow* novels.** (3) WoW's Fallowmere Inn / Lord Fallowmere / Alithia Fallowmere. No registered "Fallowmere" mark exists anywhere (TMview 0) — **but TALLOWMERE is a live registered word mark in Nice class 9 (game software)**, owned by Christopher James McFarland, the indie developer of the *Tallowmere* roguelikes that sell on Steam and itch.io. I verified two live class-9 registrations: **NZ (filed 2017-11-09, Registered)** and **WIPO/Madrid (filed 2018-09-11, Registered)**. One letter, identical goods class, identical sales channel. *(Caveat: I confirmed NZ and the WIPO international registration; I did not confirm which territories that Madrid filing designates, so I cannot say it is enforceable in the US.)* This is our **top-level region name** and it appears throughout marketing copy. | [Warbases: Fallowmere range](https://warbases.co.uk/?s=Fallowmere) · [Paravia Wiki: Fallowmere](https://wiki.paravia.com/wiki/Fallowmere) · [Lord Fallowmere — Wowhead](https://www.wowhead.com/npc=40896/lord-fallowmere) · [TALLOWMERE, WIPO 1427902, cl.9](https://www.tmdn.org/tmdsview-cdc/trademark/data/WO500000001427902) · [Tallowmere on itch.io](https://itch.io/search?q=Tallowmere) |
| **TROPHIC** | Game title | A game titled **exactly "Trophic"** by Quadratic Games is live on itch.io — an HTML5 **ecosystem/food-web simulation** where you balance Giant Kelp / Sea Urchin / Sea Otter populations to prevent extinction; tags *ecosystem, life simulation, nature*. Same word, same storefront, same subject. Also on itch: *Trophic Level* (survival horror), *Trophic Cascade* (2022 jam game), *Trophic adventure* (food-chain educational game). **Mitigating and important:** Steam search returns **0 results**; TMview finds **13 TROPHIC marks worldwide and none in class 9, 28 or 41** — they are class 1 (agrochemicals, Apical Crop Science, live), class 5 (nutrition — Prodiet, live in BR/AR/PY), class 25 and 30 (dead). The 1974 US mark by Metatrophic Formulas is **Ended**. So there is no trademark obstacle in the game classes; the problem is that "trophic" is a *descriptive* scientific term for food webs, which makes it weak to own and easy for others to use — as the itch game demonstrates. | [Trophic — Quadratic Games (itch.io)](https://quadraticgames.itch.io/trophic) · [Trophic Level](https://aaaa-batteries.itch.io/trophic-level) · [Trophic Cascade](https://sirtartarus.itch.io/trophic-cascade) · [Trophic adventure](https://jesgar.itch.io/trophic-adventure) · [Steam search: 0 results](https://store.steampowered.com/search/?term=trophic) · [TMview](https://www.tmdn.org/tmview/) |
| **Undermere** | Ancient (Water/Dark) | **Undermere is the town the *Strange Horticulture* franchise is set in** — Bad Viking / Iceberg Interactive. Store copy: *"Welcome to Undermere, a quaint town surrounded by hag-infested forests and rugged mountains."* The successor *Strange Antiquities* (2025) is also set there: *"Explore the quaint and gloomy town of Undermere."* Four Steam listings plus an "Undermere Collection" bundle. This is the same medium, a commercially published series, and the **same cozy rural-naturalist aesthetic TROPHIC occupies**. No trademark exists (TMview: 0), so the exposure is brand confusion and search-term capture, not a registered mark. | [Strange Horticulture](https://store.steampowered.com/app/1574580/Strange_Horticulture/) · [Strange Antiquities](https://store.steampowered.com/app/2885870/Strange_Antiquities/) |
| **Mirefin** | Creature (Water/Poison) | **Blizzard's Mirefin tribe of murlocs** in Dustwallow Marsh, World of Warcraft — Mirefin Murloc, Warrior, Muckdweller, Coastrunner, Oracle, Ambusher, Puddlejumper, plus a "Mirefin Fungus" spell and "Mirefin Head" quest item. Not a coincidental word overlap: the *same coined word for the same idea* — a swamp-dwelling aquatic fish-creature. | [Mirefin tribe — Warcraft Wiki](https://warcraft.wiki.gg/wiki/Mirefin_tribe) · [Wowhead NPC 4359](https://www.wowhead.com/classic/npc=4359/mirefin-murloc) |
| **Gloomoth** | Creature (Dark/Wind) | Three separate collisions. (1) **A shipping enemy and tameable pet in Square Enix's Mana series** — *Legend of Mana*, *Sword of Mana*, *Children of Mana* (confirmed by direct wiki query). (2) The canonical fusion name of Gloom (#44) + Venomoth (#49) in *Pokémon Infinite Fusion*, with a published dex entry. (3) A mob in the Alex's Caves Minecraft mod. Also reads as a mashup of two real Pokémon. | [Gloomoth (Legend of Mana)](https://mana.fandom.com/wiki/Gloomoth_(Legend_of_Mana)) · [Gloomoth (Sword of Mana)](https://mana.fandom.com/wiki/Gloomoth_(Sword_of_Mana)) · [FusionDex 44.49](https://www.fusiondex.org/44.49/) |
| **Umbrat** | Creature (Dark) | **Loomian Legacy — one of the largest monster-taming games by player count — has a Loomian named Umbrat.** Dark-type quadruped rodent; the wiki's own etymology is *"umbra, the Latin word for shadow, and rat."* That is our name character-for-character, our etymology, our typing and our species, in a shipping creature-collector. Page existence confirmed by direct MediaWiki query with controls. A separate Umbrat fakemon exists in *Pokémon Pisces*. Not a strong Umbreon homophone — the Loomian hit alone is the problem. | [Umbrat — Loomian Legacy Wiki](https://loomian-legacy.fandom.com/wiki/Umbrat) |
| **Wispurr** | Creature (Dark/Beast) | Four collisions. (1) **Kādomon: Hyper Auto Battlers** (Steam app 2125540, Dino Rocket, 2025 — "Collect and battle over 200 unique creatures") has a creature named **Wispurr**, with a live Steam Community Market listing under that exact name — verified HTTP 200, page title "Wispurr - Steam Community Market". (2) Loomian Legacy has **Wispur**. (3) Monstronauts has a Wispurr. (4) Near-homophone of **Espurr**, a real Gen-6 cat Pokémon — same name space *and* same species. Trademarks: two US marks literally named WISPURR exist but **both are Ended**, in classes 10 and 5/42/44 — dead and unrelated, so trademarks are not the driver here. | [Steam Market: Wispurr](https://steamcommunity.com/market/listings/753/2125540-Wispurr) · [Kādomon on Steam](https://store.steampowered.com/app/2125540/) · [Wispur — Loomian Legacy](https://loomian-legacy.fandom.com/wiki/Wispur) |
| **Bramblore** | Starter, Plant adult | Two compounding problems. Bramblin (#946) and Brambleghast (#947) are real Gen IX **Grass** Pokémon and the only species sharing a 5-character prefix. More tellingly, **two unconnected hobby monster-collector projects already use "Bramblore" for exactly this slot** — source confirmed as `{ id: 2, key: 'bramblore', name: 'Bramblore', types: ['Grass'] }`, the level-15 evolution of a Grass starter. Neither is commercial so neither blocks us legally, but two strangers independently landing on this word for this creature in this slot proves it is the *obvious* coinage, not a distinctive one. | [Brambleghast — Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Brambleghast_(Pok%C3%A9mon)) · [PocketMockster](https://github.com/KeigoShimadaCC/PocketMockster) |
| ~~**Harden**~~ → **Rootfast** ✅ | Move (utility) | **RESOLVED 2026-08-25 — renamed (DEVIATIONS D-Q1-1); see "The Q1 move renames" below.** **A real Pokémon move.** Normal / Status / *"Raises the user's Defense by one stage."* Ours: `"+Defense"`. **Same name and same effect.** The worst single case in the move set. | [Harden — Pokémon DB](https://pokemondb.net/move/harden) |
| ~~**Screech**~~ → **Scoldcall** ✅ | Move (utility) | **RESOLVED 2026-08-25 — renamed (DEVIATIONS D-Q1-2).** **A real Pokémon move.** Normal / Status / *"Lowers the target's Defense by two stages."* Ours: `"−enemy Defense"`. **Same name and same effect.** | [Screech — Pokémon DB](https://pokemondb.net/move/screech) |
| ~~**Snarl**~~ → **Baretooth** ✅ | Move (utility) | **RESOLVED 2026-08-25 — renamed (DEVIATIONS D-Q1-3).** **A real Pokémon move.** Dark / Special / 55 power / lowers the target's Sp. Atk. Ours: `"−enemy Attack"` — same name, closely analogous effect. | [Snarl — Pokémon DB](https://pokemondb.net/move/snarl) |
| ~~**Roost**~~ → *deleted* ✅ | Move (`burrow-roost` altName) | **RESOLVED 2026-08-25 — the `altName` field is gone; the move is "Burrow" alone (DEVIATIONS D-Q1-4).** **A real Pokémon move.** Flying / Status / recovers half max HP. Ours is the alternate display name on Burrow (*"skip turn, +evasion"*) — same name, different effect. **Cheapest fix in the entire sweep: delete the `altName` field and keep "Burrow".** | [Roost — Pokémon DB](https://pokemondb.net/move/roost) |
| **Overgrow** | Move (Plant, heavy) — `coined: true` | **A real Pokémon *Ability*** — the signature Ability of the **Grass starter line** (Bulbasaur and successors), *"Powers up Grass-type moves in a pinch."* Aggravating factor: TROPHIC also has a Plant starter line, so the collision lands in the same slot in the design. | [Overgrow — Pokémon DB](https://pokemondb.net/ability/overgrow) |
| **Keen Eye** | Trait (`data/balance.json`) | **A real Pokémon Ability** (#51), *"Prevents other Pokémon from lowering accuracy."* Ours is a stat trait. Coined in DEVIATIONS D16 and explicitly flagged for this sweep. | [Keen Eye — Pokémon DB](https://pokemondb.net/ability/keen-eye) |
| **Strong Jaw** | Trait (`data/balance.json`) | **A real Pokémon Ability** (#173), *"Boosts the power of biting moves."* Coined in DEVIATIONS D16. | [Strong Jaw — Pokémon DB](https://pokemondb.net/ability/strong-jaw) |
| **Cragmar** | Creature (Earth) | Two components, and Hank should weigh them separately. (1) **Near-homophone of Magmar**, a Gen-1 Pokémon — a perfect rhyme sharing the six-letter run "agmar". This is a judgement call, not a literal collision: `cragmar` returns 404 on the Pokédex, `magmar` returns 200. (2) A real prior creature use: **"Cragmar, Man of Stone"**, issue #16 of the 1993 UK partwork *The Ancestral Trail* — an existing stone creature by that exact name — plus an EverQuest NPC and an AdventureQuest boss. Rated RED on the combination; on the Pokémon axis alone it would be AMBER. | [The Ancestral Trail — Wikipedia](https://en.wikipedia.org/wiki/The_Ancestral_Trail) · [EverQuest bestiary](https://everquest.allakhazam.com/db/npc.html?id=21335) |

---

## 🟡 AMBER — Hank decides (37)

### Region, towns and routes

| Name | Finding | Sources |
|---|---|---|
| **Hearthollow** | Clean in games and trademarks — zero on Steam, zero on itch.io, zero on TMview, and no hit in the WoW, Forgotten Realms, Critical Role, Elder Scrolls or D&D 4e wikis, Wikipedia, Wikidata or OpenLibrary. The one real collision is in fiction: **Hearthollow is the setting village of *The Cloaked Savior* by Guus Kooij**, a forthcoming adult-fantasy novel from Continuing Press that is actively marketing on the name ("Take the Hearthollow quiz") — but it is listed as "In editing" and unreleased, from a very small press. `hearthollow.com` is taken by an unrelated homestead business, so **the domain is gone**. Checked specifically for a Blizzard pattern of opposing "Hearth"-prefixed marks: **no evidence of any such pattern was found.** Worth a decision, not an emergency. | [The Cloaked Savior — Continuing Press](https://continuingpress.com/cloaked-savior) · [hearthollow.com](https://www.hearthollow.com/) |
| **The Sanctum Fallow** | I checked the **phrase**, as asked, and the phrase is completely clear: zero on TMview, Steam, itch.io, Wikidata and OpenLibrary. The caveat is the head word. **SANCTUM is heavily encumbered in Nice class 9 (game software)** — TMview returns 49 exact SANCTUM marks worldwide including live class-9 registrations, and Coffee Stain Studios holds SANCTUM in class 9 in the US, EU and UK for the *Sanctum* games. Steam and itch.io are both crowded with Sanctum titles. **Buried as an in-world location the risk is low; the moment it becomes a store-page headline, subtitle or DLC name it stops being low.** Separately, the inverted-adjective construction is the one name that doesn't match the compound-noun register of the rest of the set. | [SANCTUM cl.9 — TMview](https://www.tmdn.org/tmview/) · [Steam "Sanctum" titles](https://store.steampowered.com/search/?term=Sanctum) |
| **Brackwater** | Checked hard. No trademark anywhere (TMview 0), no Steam title, no itch.io title, no book, no band, no real-world place. One genuine hit: **Brackwater is an in-game area in *Cursemark*** (Steam app 3219180, a fantasy action roguelite) — found only via its own patch notes. Minor noise: a WoW armour set, a German geological formation, and `brackwater.com` sitting as a "Launching Soon" placeholder. **On the Blackwater question — no, it is not a real reputational problem.** The PMC has not carried that name since 2009 (Blackwater → Xe → Academi → Constellis), so there is no live brand to confuse; "brack-" is a live English morpheme (*brackish*) that genuinely fits a swamp town; br/bl is distinct in print. The realistic downside is milder and purely about discoverability: readers pattern-match to **Blackwater in Red Dead Redemption** — which is exactly what itch.io's own search does, returning Blackwater and Backwater titles and nothing for Brackwater. | [Cursemark patch notes naming Brackwater](https://store.steampowered.com/news/app/3219180/view/684130580330188368) · [Blackwater company name history](https://en.wikipedia.org/wiki/Blackwater_(company)) |
| **Brackmarsh** (R2) | No trademark (TMview 0), no Steam or itch.io title (itch returns only *Blackmarsh*, the OSR setting), nothing in Wikipedia, Wikidata or OpenLibrary. But the exact name **is a Wizards of the Coast proper noun**: the **Brackmarsh** are a lizardfolk tribe of the Witchlight Fens in D&D 4e's *Monster Vault: Threats to the Nentir Vale* (2011). A tribe rather than a place, and 4e is long dormant — but published WotC material, not homebrew. | [Threats to the Nentir Vale — Witchlight Lizardfolk](https://bira.github.io/octopus-carnival/2023/04/12/witchlight-lizardfolk.html) |
| **Meadow Reach** (R1) | No IP problem at all — no trademark, no game of that title on Steam or itch.io, nothing in any wiki or OpenLibrary. The issue is **distinctiveness, not collision**: it is a real-world street name in at least three places (Lee County NC; Duffield and Barlow, Derbyshire), because "[Nature] Reach" is a standard British housing-estate naming pattern. **It reads as an address rather than a route.** | [OSM/Nominatim: Meadow Reach](https://nominatim.openstreetmap.org/search?format=json&q=Meadow%20Reach) |
| **Sanctum Approach** | No game or entertainment collision whatsoever — no Steam title, no itch.io title; its web footprint is entirely wellness and psychology businesses. Inherits only the class-9 SANCTUM caveat above, and should be renamed alongside the site rather than on its own account. | [SANCTUM cl.9 — TMview](https://www.tmdn.org/tmview/) |

**🟢 GREEN in this category:** **Bowerdeep** — the cleanest name in the whole project: zero
results for the exact string on Google-backed search, zero on TMview, "0 results match your
search" on Steam, nothing on itch.io, and no hit in the WoW, Forgotten Realms, Critical Role,
Elder Scrolls, D&D 4e or Greyhawk wikis, Wikipedia, Wikidata, OpenLibrary, MusicBrainz or
OpenStreetMap. (It rhymes with WotC's Waterdeep, which holds class-28 marks — different word,
not confusable.) **Cindershelf** — nothing anywhere; the only exact-string web hits are a paint
catalogue using "cinder shelf" as a common noun for a fireplace part. Steam is thick with
*Cinder* titles but none is Cindershelf and none is in the monster-taming space.
**Bowerdeep Wilds** (R3) and **Cinder Steppe** (R4) — both clear as exact phrases; Cinder
Steppe's only web use anywhere is a region inside a Minecraft modpack, a hobbyist use with no
title claim.

### Starters and Ancients

| Name | Finding | Sources |
|---|---|---|
| **Cindril** | **"Weavenest Cindril" is a location in Hollow Knight: Silksong** (Team Cherry, 2025) — one of the largest indie releases in years, with walkthrough coverage across Fextralife, IntoIndieGames and YouTube. Independently confirmed. Different entity type (their location vs our creature) and no trademark, but Silksong now owns the search term "Cindril". | [Weavenest Cindril — Fextralife](https://hollowknightsilksong.wiki.fextralife.com/Weavenest+Cindril) |
| **Rillisk** | Two claims, only one of which I could verify. **Verified:** `Frillish` is a real Water-type Pokémon (PokeAPI 200), making Rillisk a plausible near-homophone. **Not verified:** one research stream reported Rillisk as a town in Brigid Kemmerer's *Cursebreaker* series and rated it RED on that basis; the Cursebreaker wiki was unreachable and a direct search returned nothing usable, so **I could not confirm it and have not adopted that rating**. TMview: zero (the only hits are "Brilliskin", a substring, in classes 3 and 9). Steam and itch.io: zero. Treat the book claim as ⚪ INSUFFICIENT EVIDENCE and worth one manual check. | [Frillish — PokeAPI](https://pokeapi.co/api/v2/pokemon-species/frillish) |
| **Thornlet** | **A recurring Final Fantasy equipment item** (いばらのかんむり, "Crown of Thorns") — a high-Defense helmet that drains HP, in FFV, FFVI, Dissidia, Record Keeper, Brave Exvius and War of the Visions, all still commercially sold. No trademark, no Pokémon collision — but organic search for "Thornlet" is essentially all Final Fantasy, and RPG players will read it as an FF reference. | [Thornlet — Final Fantasy Wiki](https://finalfantasy.fandom.com/wiki/Thornlet) |
| **Thornwald** | **A named witcher of the School of the Wolf** in *The Hexer* (2002 Polish Witcher TV series). Also the Carlisle PA estate cluster (Thornwald Mansion, Thornwald Park), the *Tornwaldt cyst* alternate spelling, and MTG's **Thornweald Archer** (one letter off, reprinted through Foundations 2024). No trademark, no Steam/itch title, no Pokémon. | [Thornwald — Witcher Wiki](https://witcher.fandom.com/wiki/Thornwald) · [Thornweald Archer — Scryfall](https://scryfall.com/card/fdn/559/thornweald-archer) |
| **Vellsire** | No collision found anywhere — zero on TMview, Steam, itch.io, Scryfall, the Pokédex, and every creature-collector and fantasy wiki swept. Flagged AMBER for one structural reason only: **"-sire" is a live Pokémon morpheme** (Quagsire, Clodsire). That is a style observation, not a collision. This is the closest thing to a GREEN in the AMBER column. | [TMview](https://www.tmdn.org/tmview/) |

**🟢 GREEN starters/Ancients:** Vulkindle, Pyrevane, Puddlisk, Maelstrisk, **Kilnback** (the
cleanest of the twelve — zero on every source checked, trademarks included).

### Remaining creatures

| Name | Finding | Sources |
|---|---|---|
| **Pollywisp** | No actual collision anywhere. The issue is constructional and real: **Poliwag is a Gen-1 Pokémon whose name is literally "pollywog + wag"**, and Pollywisp is the identical morphological joke on the identical root with the same stress pattern. A Pokémon-literate player will hear Poliwag. Worse, the concept doesn't pay for it — Pollywisp is a **moth**, not a tadpole, and TROPHIC's actual tadpole is Bogling, so the root is actively misleading. **Renaming improves the roster regardless of IP.** | [Poliwag — Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Poliwag_(Pok%C3%A9mon)) |
| **Bogling** | The most-used name in the roster, and genuinely generic — which cuts both ways. Prior uses: **WoW** (Bogling NPC + "Bogling Root"), **RIFT** (a Bogling race; "Bogling Wastrel" pet sold in a Steam Collector's Pack — I confirmed *Bogling Wastrel*, *Bogling Stump*, *Bogling Souprise* by direct wiki query), **Ultima Online/ModernUO**, **For The King 2**, **Wayward**, **Star Wars Jedi: Fallen Order** (Boglings on Bogano — Lucasfilm/Disney), and an itch.io game titled **"Bogling Wars"**. The live flag for merch: **Boglins**, the Mattel puppet-monster toy line, still owned and relicensed. In our favour: it derives from the folkloric Scots/Northumbrian **"bogle"**, attested since the early 1500s, so nobody can claim it. The risk is distinctiveness, not litigation. | [Bogling — Wowpedia](https://wowpedia.fandom.com/wiki/Bogling) · [Bogling — Wookieepedia](https://starwars.fandom.com/wiki/Bogling) · [Bogling Wars — itch.io](https://razatlam.itch.io/boglingwars) · [Boglins — Wikipedia](https://en.wikipedia.org/wiki/Boglins) |
| **Mosslet** | **MOSSLET is a live, actively developed commercial software product** — a zero-knowledge encrypted social network at mosslet.com by "Moss Piglet", with recent commits. Different product class and unlikely to confuse anyone, but it is a live software brand using our exact word. Also a user-submitted D&D 5e homebrew creature (no legal weight). No Pokémon, no creature-collector use. | [mosslet.com](https://mosslet.com/) · [moss-piglet/MOSSLET](https://github.com/moss-piglet/MOSSLET) |
| **Skir** | Four letters is hard to own. **D&D/Forgotten Realms has "Skirr", a large flying predator** — one letter off and *also a flier*, which is exactly Skir's role. Also Pathfinder's "Skiurid", Genshin Impact's character **Skirk**, Old Norse *skír* ("bright, clear"), and **skyr**, a heavily marketed dairy category. Cleared on the specific checks requested: no MTG card named Skir, no SKIR stock ticker, and skir.studio is an expired domain for sale, not a company. | [Skirr — Forgotten Realms](https://forgottenrealms.fandom.com/wiki/Skirr) · [Skirk — Genshin Wiki](https://genshin-impact.fandom.com/wiki/Skirk) |
| **Nibbin** | Not a Pokémon and not in any creature-collector roster. One real prior use: **"Little Nibbin"** (Nathan Cole, 2021, plus a 2023 Spanish edition), a children's picture book whose title character is "an unlikely creature in search of his purpose" — same word, same cute-creature register, adjacent audience. Coromon's **Nibblegar** shares the "nibble" root but is not a homophone. | [Little Nibbin — Barnes & Noble](https://www.barnesandnoble.com/w/the-little-nibbin-n-l-cole/1143781955) · [Nibblegar — Coromon Wiki](https://coromon.wiki.gg/wiki/Nibblegar) |
| **Bramblehog** | No legal collision — zero on Bulbapedia, all fakemon wikis, every creature-collector roster, Scryfall, Steam and itch.io; the Sonic wiki was checked for hedgehog properties and is clear. The flag is genre adjacency: **Pokémon already owns a "Bramble-" line in this exact genre** (Bramblin → Brambleghast, Scarlet/Violet), so a third Bramble- creature in a competing monster-taming game reads as derivative. Note this compounds with the Bramblore RED — **the whole "Bramble-" family should move together or not at all.** | [Brambleghast — Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Brambleghast_(Pok%C3%A9mon)) |
| **Gloomgrub** | No exact hit anywhere. Constructional: **"Gloom" is a real Gen-1 Pokémon (#44) and it is Grass/Poison**, while Gloomgrub is Poison/Plant — same typing, closely related plant-toxin concept, with an entire Pokémon species name as the first morpheme. Its line partner **Gloomoth is a genuine RED**, so the whole "Gloom-" family should move together. | [Gloom — Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Gloom_(Pokémon)) |
| **Pyrelisk** | No direct hit anywhere. **"Pyrolisk" is one vowel away and effectively identical spoken** — a long-established fire-basilisk in the **5e SRD as open content**, in NetHack, and in Final Fantasy. The SRD version being open-licensed means the *concept* is free, but a one-vowel variant of an established monster name reads as a typo of it. | [Pyrolisk — 5e SRD](https://www.5esrd.com/database/creature/pyrolisk/) · [Pyrolisk — NetHack Wiki](https://nethackwiki.com/wiki/Pyrolisk) |
| **Barkhide** | Not a Pokémon and no creature-collector use. **Two MTG cards use it as a name component — Barkhide Troll (Core Set 2020) and Barkhide Mauler (Onslaught)** — plus a Neverwinter armor set and a LOTR: Return to Moria buff. The bare one-word name is unclaimed; the word is well-trodden fantasy vocabulary. | [Barkhide Troll — Scryfall](https://scryfall.com/card/m20/165/barkhide-troll) |
| **Stonewing** | Not a Pokémon collision and no creature-collector hit, but the word is claimed in several places: **a named ShadowClan cat in Erin Hunter's *Warriors* novels** (HarperCollins), **"Stonewing Antagonizer"** as the transform face of MTG's Thraben Gargoyle, a romance novel *Stonewing Guardian*, and two active US businesses. Distant individually; collectively it is not distinctive. | [Stonewing — Warriors Wiki](https://warriors.fandom.com/wiki/Stonewing) · [Thraben Gargoyle // Stonewing Antagonizer](https://gatherer.wizards.com/SOI/en-us/266/stonewing-antagonizer) |
| **Duskstalk** | No exact hit on Steam, itch.io, Wikipedia, Scryfall or ~30 wikis. Not a Pokémon near-homophone (Duskull/Dusclops/Dusknoir are the real "Dusk" line and none is close). One real hit: **"Duskstalker", a named tameable beast NPC in WoW Classic** (NPC 14430), plus recurrence as stock output from fantasy name generators — which signals the compound is generic rather than distinctive. | [Duskstalker — Wowhead Classic](https://www.wowhead.com/classic/npc=14430/duskstalker) |
| **Carricrow** | The mildest in the roster — effectively no footprint on any source. **Explicitly cleared on the Murkrow question:** it is *not* a near-homophone of Murkrow, Honchkrow, Corvisquire or Corviknight; the only shared element is the generic "-crow". Derives from "carrion crow", a real and unprotectable bird name. AMBER solely because one homebrew use exists (a Carricrow enemy on a fan game-ideas wiki). | [Carrion crow — Wikipedia](https://en.wikipedia.org/wiki/Carrion_crow) |

**🟢 GREEN creatures:** Loamunder, Reedrick, Fenmaw, Sporantle, Webvern, Ashvole. All returned
zero across the Pokédex, TMview, Steam, itch.io, Scryfall, every creature-collector wiki
swept, and the D&D/Pathfinder/Elder Scrolls/Warhammer/RuneScape/Elden Ring sweeps.
**Sporantle** and **Ashvole** were the cleanest names in the entire roster.

### Characters

| Name | Finding |
|---|---|
| **Sable** | The strongest character hit. ***Sable*** **(2021, Shedworks / Raw Fury) is a well-known indie game whose title *and* protagonist are both "Sable"** — same medium, same storefronts, same audience, ~3,900 Steam reviews at 86%, with a film/TV option deal. Also *Sable's Grimoire*, Marvel's Silver Sable, and the WWE performer. Against that, "sable" is a dictionary word (the animal; heraldic black), heavily diluted. A distinctiveness problem, not a legal one — but reviewers will think of *Sable*. [Steam](https://store.steampowered.com/app/757310/Sable/) |
| **Noct** | The in-game and fandom nickname for **Noctis Lucis Caelum, protagonist of Final Fantasy XV** — Square Enix, JRPG, the nearest genre. Unlike our other NPCs, **"Noct" is not a real given name** — it is a clipped coinage, so the "it's just a common name" defence does not apply. Mitigating: "noct-" is a standard Latin night prefix, and an unrelated indie game titled *Noct* exists. [Wikipedia](https://en.wikipedia.org/wiki/Noctis_Lucis_Caelum) |
| **Maribel** | **Maribel Mayde is a main party member in *Dragon Quest VII*** — Square Enix, the closest genre neighbour, and currently high-salience with *DQ VII Reimagined*. Offsetting: Maribel is a common Spanish given name (María Isabel) and the roles differ entirely. A "JRPG players will notice" problem, not a legal one. [Dragon Quest Wiki](https://dragonquest.fandom.com/wiki/Maribel) |
| **Wick** | **Considered view: keep it.** Lionsgate's registrations are for the two-word mark **JOHN WICK**; no registration for "WICK" alone was found in entertainment. "Wick" is an ordinary noun, a real surname, a Scottish town, and there are already unrelated games titled *Wick*. But the franchise is expanding into our space — a AAA *John Wick* game was announced Feb 2026 — so the name is culturally loud. A teenage apprentice rival will not be confused with a hitman; the risk is tonal (players will make the joke), not legal. [JOHN WICK TM — Justia](https://trademarks.justia.com/906/88/john-90688332.html) |
| **Odo** | Unambiguously identified with **Star Trek: DS9's changeling security chief** for anyone over ~30. But Odo has strong independent provenance as a medieval name — **Odo of Bayeux** (d. 1097) and **Odo of France** (c. 857–898) — which is exactly our archaic English pastoral register, so it reads as period-authentic rather than as a lift. No Paramount/CBS trademark found. [Wikipedia](https://en.wikipedia.org/wiki/Odo_(Star_Trek)) |
| **Maren** | A genuine Scandinavian/German given name, not protectable as such. Two bearers: Maren Yearly of *Bones & All*, and — more relevant — **Maren is an actual minor Pokémon character**, a boat owner in *Pokémon the Movie 2000*. A throwaway anime-movie NPC, but it is inside the exact franchise we are adjacent to. |

**🟢 GREEN characters:** **Magnate Greaves** (a real English surname and a dictionary word for
shin armour — both unownable; no fictional villain of that name found), **Vesper** (a Latin/
English dictionary word in an extremely crowded field, which is protective — but **never use
"Vesper" as a game, DLC or store-page title**, that space is congested), **Bram** (Bram
Stoker's actual first name; the textbook unprotectable personal name), **Sel** (no notable
fictional bearer in any medium; the string is dominated by unrelated acronyms).

**🟢 GREEN — The Cullbrand Company.** Checked hardest of the character batch and it is clean.
"Cullbrand" is a real but very rare **Swedish surname**; beyond a handful of living
individuals there is nothing — no company, no LLC, **zero trademarks worldwide on TMview**, no
fiction, zero on Steam, zero on itch.io. Exactly what you want from a coined antagonist name.
Two small notes: don't give the fictional CEO a first name matching a real Cullbrand, and keep
the org's visual branding away from Swedish coding.

### Moves and item vocabulary

Beyond the five RED moves, eight more are AMBER (verified by per-title existence query with
passing controls, and for the Digimon entries by reading the raw wiki source directly):

| Name | Finding |
|---|---|
| **Burrow** *(still open after Q1 — deleting the Roost alias did not touch it)* | Exists as a skill/technique in **Temtem, Coromon and Monster Sanctuary** — a triple hit, the most-used of our move names. **Re-confirmed 2026-08-25** by exact title match against Temtem's 343-technique category, Monster Sanctuary's `Burrow (Active)` skill page, and Coromon's `Burrow` page. |
| **Trample** | A **Temtem** technique — and specifically the **signature technique of Magmut**, not a generic filler entry. (Also a core MTG keyword, though that is generic combat vocabulary.) |
| **Focus** *(re-verified 2026-08-25, unchanged — D-Q1-6)* | A **Cassette Beasts** move — re-read from the wiki's raw page source this pass: *"Raises the user's accuracy by 2 stages via Accuracy Up"*. Ours raises Instinct/crit — the same concept as Pokémon's *Focus Energy*, and *Focus Blast* / *Focus Punch* also exist, so the whole "Focus" space is Pokémon-adjacent even though "Focus" alone is not a Pokémon move. |
| **Quicken** | A **Monster Sanctuary** entry. |
| **Lure** | A **Temtem** *gear item*, not a technique (see below). |
| **Miasma** *(re-verified 2026-08-25, unchanged — D-Q1-6)* | `coined: true`. Not a Pokémon move or ability — but **Ordinemon's attack in *Digimon Masters Online* is named exactly "Miasma"**. Confirmed in the raw wiki source: `*'''Miasma''': Spreads miasma from its wings, eventually ending all life in the World.` An exact bare-name match in a same-genre creature-collector. Trademarks: one exact US word mark ever, IC 028, abandoned 2016. |
| **Shade** *(re-verified 2026-08-25, unchanged — D-Q1-6; the exact line was re-found on the page `Miyuki (Kenzoku)`)* | `coined: true`. Not a Pokémon move (though *Night Shade* is). **Digimon Survive has an attack named exactly "Shade"** (人影 *Hitokage*, "Shadow Figure") — verified in source: `*{{nihongo|'''Shade'''|人影|Hitokage}}: Fires dark fog at the enemy.` **Same name and the same dark-fog function as our Dark move.** |
| **Pyre** | Bible-verbatim (not coined), and clean as a move name in every game checked — but **Supergiant Games holds live registered trademarks in Nice class 9 ("video game software") and class 41**, verified in the US (Registered), the UK (two registrations) and WIPO (two registrations), for their game *Pyre*. A move named Pyre inside a battle UI is very unlikely to infringe — trademarks attach to source identifiers, and this use is descriptive of a fire effect — but **keep "Pyre" away from anything title-adjacent: the game title, a subtitle, the logo, or a Steam/itch listing headline.** |

**Item vocabulary — AMBER (low), and I want to be careful not to oversell this.** Temtem has
gear items named **Bait**, **Snare** and **Lure**, and a medicine item named **Tonic**;
Monster Sanctuary has **Relic**; Temtem has **Medicine**, **Trait** and **Scavenger**. These
are TROPHIC's own item and system names from bible §11 — the snare is our catch verb and is on
screen in every catch, in the bag UI and in the tutorial, so the overlap is worth knowing.
But every one of these is an **ordinary English word used as a functional descriptor**.
Nobody owns "Bait" for a bait item or "Snare" for a snare. There is no legal exposure here and
essentially no confusion risk; the only real question is whether TROPHIC's item vocabulary
reads as generic. **My honest rating is low-AMBER bordering GREEN, and I would not spend a
rename on these before spending it on the RED list.** Recorded because it was asked for, rated
on the evidence.

**🟢 GREEN moves (16 of 28):** Gnaw, Maul, Singe, Dous, Riptide, Bramble, Sunder, Upheave,
Harry, Squall, Blight, Eclipse, Regrow, Ambush, Terrify, Scrounge — all 404 on both the
Pokémon move list *and* the Pokémon ability list, and no exact page on Cassette Beasts,
Temtem, Coromon or Monster Sanctuary. **This clears 9 of the 12 names flagged `"coined": true`
in `data/moves.json`** (D6 in DEVIATIONS): `Overgrow` is RED, `Miasma` and `Shade` are AMBER on
Digimon hits. `Eclipse` has a heavy Digimon *near*-field (Eclipse Finger, Eclipse Impact,
Eclipse Eraser, Necro Eclipse) but never appears bare, and Monster Sanctuary's "Eclipse Sword"
is a different name. Two footnotes on the GREEN list: **Riptide** is fine as a move but
should not become the *game's* title (Vector Unit holds a live RIPTIDE GP mark), and **Gnaw**'s
only Palworld hit is a bounty NPC, not a skill.

**🟢 GREEN traits (13 of 15):** Thick Pelt (bible-verbatim; the nearest real Abilities are
*Thick Fat* and *Grass Pelt*, neither of which is ours), Fleet Step, Deep Lungs, Brittle Hide,
Dulled Sense, Heavy-Footed, Soft Bite, Frail Frame, Stoneblood, Ember-Heart, Long Memory,
Old Growth, Silk-Spun. All 404 on both the Pokémon move and ability lists.

---

## Replacement names

All creature and place suggestions below were screened against the **full Pokédex**, **Steam**,
**itch.io**, **Scryfall**, and **Cassette Beasts / Temtem / Coromon / Monster Sanctuary** by
per-title existence query with passing positive and negative controls. **None is a Pokémon and
none has an exact page in any of the four creature-collectors.** They are strong candidates,
**not cleared names** — see "How to finish this".

### Region, towns and routes

Renaming a town means renaming its route; they are listed together so the pair moves as one.

| Rename | Concept to preserve | Candidates |
|---|---|---|
| **Fallowmere** (region) | Fallow land + a mere; the whole game's name for its world | **Thistlemere**, **Bramblemere**, **Fallowdene** — *all three keep "fallow"/"mere" sense while clearing the Tallowmere class-9 mark and the Warbases range* |
| **Duskhollow** (town Yr 5) + **Duskhollow Vale** (R5) | Dusk vale, observatory, encroaching dark | **Gloamhollow** / **Gloamhollow Vale**, **Duskfell** / **Duskfell Vale**, **Umberhollow** / **Umberhollow Vale** |
| **Hearthollow** (town Yr 1) *(only if Hank wants it moved)* | Warm, homely, the starting field station | **Hearthfell**, **Kindlehollow**, **Cotterhollow** |
| **The Sanctum Fallow** (site Yr 6) + **Sanctum Approach** | Sealed caldera, league + finale, sacred | **The Fallow Reliquary** / **Barrow Approach**, **The Fallow Barrow**, **Hallowfallow** — *any of these also fixes the inverted-adjective construction that breaks the set's register* |
| **Brackmarsh** (R2) *(optional)* | Marsh route out of Brackwater | **Brackfen**, **Sedgemarsh**, **Mirewick** |
| **Meadow Reach** (R1) *(optional — distinctiveness only)* | Bright meadow walking route | **Meadowreach** (one word — more distinctive at zero cost), **Larkmeadow**, **Cowslip Reach** |
| **Brackwater** (town Yr 2) *(optional)* | Stilt town, ferry, fishery | **Sedgewater**, **Mirewick**, **Brackfen** |

### Creatures and Ancients

| Rename | Concept to preserve | Candidates |
|---|---|---|
| **Undermere** | Ancient Apex, Water/Dark, eyeless serpent of the lake-beneath-the-lake | **Drownmere**, **Blindmere**, **Sunkenmere** |
| **Mirefin** | Water/Poison stalking lungfish | **Sloughfin** (*slough* = both a swamp and skin-shedding — ideal for a lungfish), **Marlfin**, **Fenlung** |
| **Bogling** (juvenile of that line) | Water grazer, mudball tadpole | **Puddlet**, **Marlkin** (pairs with Marlfin), **Gleyling** (*gley* = real soil-science term for waterlogged ground) |
| **Gloomoth** | Dark/Wind migratory dusk moth | **Sallowmoth**, **Vespermoth**, **Fennmoth** |
| **Gloomgrub** (juvenile of that line) | Poison/Plant grub | **Sallowgrub**, **Cankergrub**, **Murkgrub** — *Sallowgrub → Sallowmoth keeps the line legible and both halves are clean* |
| **Umbrat** | Dark shade rat | **Sootwhisker**, **Shadewhisker**, **Nightratton** (*ratton* = archaic English for rat) |
| **Wispurr** | Dark/Beast will-o-wisp cat | **Fenlantern**, **Marshgrimalkin** (*grimalkin* = archaic for an old cat), **Lanternmouser** |
| **Cragmar** | Earth boulder ram | **Scarhorn** (*scar* = rocky cliff, N. English), **Fellram** (*fell* = upland moor), **Cragtup** (*tup* = dialect for ram) |
| **Bramblore** | Plant starter, adult stage | **Briarknot**, **Nettleknot**, **Thicketlore** — *drop the "Bramble-" prefix entirely.* Avoid "Snarlvine" (too close to Servine) and "Bramblewick" (a shipping Steam game) |
| **Thornlet** | Plant starter, juvenile | **Thistlepip**, **Nettlekin**, **Briarlet** |
| **Thornwald** | Plant starter, elder | **Elderwold**, **Thornbarrow**, **Wildergrove** |
| **Pollywisp** | Wind/Plant seed-carrying wisp-moth | **Thistlewisp**, **Downwisp**, **Hushwisp** — any of these fixes the misleading "pollywog" root too |
| **Bramblehog** | Plant thorn boar | **Gorsehog**, **Thornsow**, **Briarback** |
| **Skir** | Wind meadow kestrel | **Skirl** (a real archaic Scots word for a shrill cry — perfect for a kestrel, and the extra letter puts distance from Skirr/Skyr/Skirk), **Hoverkite**, **Meadowhover** |
| **Nibbin** | Beast plains vole | **Chaffkin**, **Grazzel**, **Stubblenip** |
| **Mosslet** | Plant moss-backed hare | **Mosswick**, **Turfhare**, **Fellkin** |
| **Cindril** | Fire starter, juvenile fox kit | **Emberkit**, **Cinderkit**, **Ashkit** — *or accept it; the Silksong hit is a location, not a creature* |

### Moves and traits

These are the cheapest renames in the project and the easiest to get right, because the
register is short, plain, slightly archaic naturalist English.

| Rename | Ours does | Candidates |
|---|---|---|
| ~~**Harden**~~ ✅ **ADOPTED: Rootfast** | +Defense | Was: Stiffen, Callus, Hunker — all three are single common words, which is the failure mode this sweep documents. **`Rootfast` was adopted instead** (compound; attested English dialect for *rooted immovably*; `harden` is the Producer role's utility). |
| ~~**Screech**~~ ✅ **ADOPTED: Scoldcall** | −enemy Defense | Was: Shriek, Caterwaul, Gnash. **Caterwaul is now disqualified** — it is an AD&D2e *Fiend Folio* monster, a NetHack monster, and TMview shows live **CATERWAUL marks in US class 41 (entertainment)**. **`Scoldcall` was adopted** (a *scold call* is the real ornithological term for a mobbing alarm cry; `screech` is the Scavenger role's utility and Carricrow is the only Scavenger). |
| ~~**Snarl**~~ ✅ **ADOPTED: Baretooth** | −enemy Attack | Was: Cow, Daunt, Menace — three single common words. **`Baretooth` was adopted** (the threat display a snarl is; `snarl` is the Apex role's utility). Caveat recorded in D-Q1-3: one vowel from the band/mountains *Beartooth*. |
| ~~**Roost**~~ ✅ **ADOPTED: deleted** | skip turn, +evasion | **Done — the field is gone and `tests/unit/transcription.test.ts` asserts its absence.** The original recommendation stands as written: **Delete the `altName` outright** — "Burrow" alone already carries it. If a flier variant is wanted: **Hunker** or **Bristle**. (Note "Burrow" itself is AMBER — a Temtem/Coromon/Monster Sanctuary skill — so **Warren** or **Thicket** would clear both at once.) |
| **Overgrow** (Plant, heavy, 70) | 70 power Plant | **Verdure**, **Wither**, **Thicket** |
| **Trample** (Grazer role, 50) | 50 power, +25 vs Producer | **Overrun**, **Tread**, **Bluster** |
| **Focus** (utility, +Instinct/crit) | +Instinct/crit | **Keen**, **Mark**, **Steady** |
| **Quicken** (utility, +Speed) | +Speed | **Hasten**, **Fleet**, **Spur** |
| **Lure** (utility, raise catch odds) | catch-odds buff | **Beckon**, **Entice**, **Glean** |
| **Miasma** (Poison, heavy, 70) | 70 power Poison | **Fester**, **Canker**, **Taint** |
| **Shade** (Dark, light, 40) | 40, 20% Daze | **Umbra**, **Dusk**, **Gloam** — *note Umbra is Temtem's shiny-tier rarity term, so Dusk or Gloam are the safer two* |
| **Pyre** (Fire, heavy, 70) | 70 power Fire | **Swelter**, **Roil** (and if the pair moves together, Singe → **Sear** or **Blanch**) — *only needed if "Pyre" ever migrates toward the title; it is fine as a move* |
| **Keen Eye** (trait) | +Instinct | **Sharp Sight**, **Far Sight**, **Long Sight** |
| **Strong Jaw** (trait) | +Attack | **Hard Bite**, **Iron Bite**, **Set Jaw** |

**Screening status of the move candidates.** A separate screen ran 62 candidate words against
Cassette Beasts (moves.json @1.8.0, 290 moves), Monster Sanctuary, Temtem (316 techniques) and
Coromon (258 skills), positive-controlled. From that screen, **do not use**: `Undertow` and
`Scorch` (Cassette Beasts moves), `Sprawl`, `Stampede` and `Kindle` (Monster Sanctuary
passives; Stampede is *also* a Temtem technique and a Coromon skill — a triple hit), `Rend`
(Temtem technique), and `Brace` (Temtem technique, and it leads Cassette Beasts' "Brace for
Impact"). Also flagged: `Umbra` is Temtem's shiny-tier rarity term and more visible in-game
than it looks; `Bait`, `Snare` and `Steady` are Temtem/Coromon **items and traits** rather than
moves. Every candidate I have recommended above survived that screen — with the exception of
**Steady**, which I have kept for Focus because a Coromon *trait* collision is a materially
weaker hit than a move collision, and Hank should know that is a judgement call rather than a
clean pass.

**Four caveats on that screen that must not be laundered away.**

1. **Digimon was not in the screen, and Digimon is where the late hits came from.** Adding it
   produced two exact bare-name matches (Miasma, Shade) out of a ~1,149-skill corpus. **Re-screen
   every final pick against Digimon specifically before committing to it** — that is the single
   highest-yield remaining check on the replacement list.
2. **Coromon negatives are not certifiable.** Its public wiki lists only ~78 of roughly 180
   in-game skills. The Coromon *positive* (Burrow) stands; every "clean in Coromon" claim —
   including for the candidates above — is unverified. If Coromon matters, check the game files.
3. **The screen covered move and skill names only** — not monster, item, equipment or
   status-effect names. `Umbra`, `Warren`, `Thicket`, `Cow` and `Verdure` could each land in one
   of those namespaces instead. `Umbra` already has a known one: it is Temtem's shiny-tier
   rarity term, and more visible in-game than it looks.
4. **The Monster Sanctuary data dumps date to 2022/2023** and the source repo is archived; MS's
   last content patch predates them so coverage is probably complete, but this was **not**
   confirmed against a 2026-current source. Cassette Beasts has no such gap.

**The 52 "clean" candidates are clean *as move names in four games*, not cleared outright.**

### The Q1 move renames — what was actually screened, 2026-08-25

*This is the evidence half of `docs/DEVIATIONS.md` D-Q1-1 … D-Q1-6. It supersedes the "Screening
status of the move candidates" note above **for these three names only** — every other candidate in
this document still carries that note's four caveats.*

**The three adopted names: `Rootfast` (was Harden) · `Scoldcall` (was Screech) · `Baretooth` (was
Snarl).** The `Roost` alias was deleted rather than replaced, so it needed no screen.

**Corpora queried, each with a live positive control that fired in this session.** Every negative
below is a negative from a source that had just proved it can produce a positive.

| Source | Method | Size | Control that fired |
|---|---|---|---|
| Pokémon moves | PokeAPI full list, exact match | **937** | `harden`, `screech`, `snarl`, `roost`, `bite`, `growth` all present |
| Pokémon abilities | PokeAPI full list, exact match | **373** | `overgrow`, `keen-eye`, `strong-jaw`, `thick-fat` all present |
| Cassette Beasts | `wiki.cassettebeasts.com` `Category:Moves` + `Exclusive Moves` + `Archangel moves`, and every main-namespace page (1,067) | **362 moves** | `Undertow`, `Scorch`, `Focus`, `Bite` |
| Temtem | `temtem.wiki.gg` `Category:Techniques` + every main-namespace page (5,030) | **343 techniques** | `Stampede`, `Brace`, `Rend`, `Burrow` |
| Coromon | **every main-namespace page (1,082)**, not `Category:Skills` | 1,082 pages | `Stampede`, `Burrow`, `Toughen Up`, `Chomp` — **none of which is in `Category:Skills`**, which confirms this document's earlier warning that the category is badly incomplete |
| Monster Sanctuary | `monster-sanctuary.fandom.com` `Category:Skill` + every main-namespace page (2,480) | **660 skills** | `Sprawl`, `Kindle`, `Stampede`, `Quicken`, `Burrow` |
| Digimon | Wikimon **and** Digimon Fandom: page-title probe + full-text search, hits read from raw wikitext | 2 wikis | `Miasma` (Wikimon page + Ordinemon's DMO attack line) and `Shade` (the *Survive* attack line, re-found in source) |
| Loomian Legacy · Nexomon · Palworld · Yo-kai Watch | per-title MediaWiki probe | 4 wikis | `Stampede` exists on Loomian Legacy |
| 12 major game/fantasy wikis | per-title probe: WoW, Dota 2, Elder Scrolls, Forgotten Realms, RuneScape, Terraria, Monster Hunter, Elden Ring, D&D 5e, Final Fantasy, Warriors, Pokémon Fandom | 12 wikis | `Stampede` exists on WoW, Dota 2, Elder Scrolls and Final Fantasy |
| MTG | Scryfall exact + name search | full corpus | validated on known cards |
| Steam · itch.io | live store search, scraped | — | `Undertow` and `Stampede` both return real result sets |
| TMview (≈75 offices incl. USPTO) | JSON API | — | `Stampede` 943 marks, `Undertow` 52 marks |
| Wikipedia · Wikidata · OpenLibrary | search APIs | — | all three return results for `Stampede` and `Undertow` |
| Fandom **cross-wiki** index | `services.fandom.com/unified-search` | ~all Fandom wikis | `Bristleback` returns Dota 2, Anthem, Horizon, Artifact |
| GitHub code search | REST code search | all public code | **`Bramblore` reproduces this document's own PocketMockster finding** |

**Result, per name.**

| Name | Everything above | The only things found anywhere |
|---|---|---|
| **Rootfast** | zero exact hits | **TMview: exactly one record worldwide — `ROOTFAST`, GB, class 6, EXPIRED.** Live non-game use: *ATA Rootfast*, a hydroponics root stimulant (no mark on TMview), and a native-plants herbarium site. Steam 0, itch.io 0, Wikipedia 0, Wikidata 0, OpenLibrary 0, GitHub 0. |
| **Scoldcall** | zero exact hits | **Nothing. Anywhere.** TMview 0 marks, Steam 0, itch.io 0, Scryfall 0, GitHub 0, Wikipedia 0, Wikidata 0, OpenLibrary 0, and the Fandom cross-wiki index returns an **empty result set** — the cleanest screen run in this document. |
| **Baretooth** | zero exact hits | TMview 0 marks, Steam 0, itch.io 0, GitHub 0, Wikipedia 0, Wikidata 0, OpenLibrary 0. **Recorded honestly: it is one vowel from *Beartooth*** (a signed metalcore band; a Montana range/highway). Every "hit" the Fandom cross-wiki index returned was *Beartooth*, not *Baretooth* — a stem match, not a collision. |

**Candidates that were screened and REJECTED — recorded so nobody re-suggests them.** All of these
were on the shortlist and were dropped on evidence found in this pass:

- **Caterwaul** — AD&D2e *Fiend Folio* monster, NetHack monster, and **live TMview marks in US class 41**.
- **Carapace** — an exact Monster Sanctuary passive (`Carapace (Passive)`).
- **Lipcurl** — **`LIPCURL`, US class 28 (games and playthings), REGISTERED.** The worst find of the batch.
- **Gapejaw** — **Gapejaw Bog is a location in *Pokémon Legends: Arceus***.
- **Overawe** — a WoW ability, plus a family of EverQuest 2 items.
- **Gapemaw** — *Rahema Gapemaw* is a named hero/boss in **Titan Quest**.
- **Coldstare** — *Cold Stare* is an ability in **Final Fantasy XI**.
- **Setfast** — **`SETFAST` registered in US, India and Canada** (class 2), 14 marks on TMview.
- **Hackles** — an itch.io game of that exact title.
- **Bristleback** — a **Dota 2** hero (and in Anthem, Horizon and Artifact).
- **Carrioncall** — **"Carrion Call" is a game on itch.io**, the storefront TROPHIC ships to.
- **Toughen** — Coromon has the skill `Toughen Up`.
- **Fangbare** — clean, but it is literally German for *"catchable"*, which is an unfortunate accident in a catching game.
- **Rookcall / Crowcall** — clean in every corpus (TMview 0, Steam 0, itch.io 0) and usable as fallbacks, but both are established **Warriors** fan-wiki cat names, and "Rookcall" is also a chess app. `Scoldcall` beat them on cleanliness.

**What this screen could NOT establish — do not read the table above as a clearance.**

1. **General web search was unavailable.** The session's 200-call search budget was exhausted (the
   same wall this document's original sweep hit), DuckDuckGo served a CAPTCHA, Mojeek returned 403
   and every public SearXNG instance rate-limited. **Two of the three names got one working
   DuckDuckGo pass before the block** (which is where *ATA Rootfast* and the Warriors cat names came
   from); `Baretooth` and `Scoldcall` got none. The Fandom cross-wiki index and GitHub code search
   are good substitutes for the *games* half of that gap; they are not substitutes for the open web.
2. **In-game location and item names inside shipping titles** remain the systematic blind spot this
   document already names. `Gapejaw Bog` was caught only because a wiki indexes it.
3. **Common-law rights and non-English collisions**, as before.
4. **Coromon** is materially better covered than in the original sweep — 1,082 pages instead of a
   79-member category — but the wiki is still not the game files.
5. **Fandom's own search is fuzzy in both directions.** It returned eight results for the nonsense
   control string `Qzzxvwmtplop` and zero for the real term `Hitokage`. Every Fandom hit above was
   opened and read; no Fandom *negative* was treated as proof on its own.

### If the title changes

I am not recommending a title change — that is squarely Hank's call, and the trademark position
is clear. But if he wants options, the register that works is the same one the bible uses for
places: a real ecological term that is *not* the textbook one, or a compound.
Candidates worth screening (**none has been screened yet**): **Fallowmere** as the title
itself, **Keystone**, **The Fallow Year**, **Trophic Fallow**, **Six Fallow Years**.
Note the broader pattern the move screens exposed: **single common English words are
high-collision by nature — nearly every hit in every screen landed on one. Compounds are
structurally much safer.** The bible's own coinages (Fenmaw, Duskstalk, Loamunder, Sporantle)
are the safest names in the project precisely because they are compounds.

---

## Blast radius of a rename

Measured by `grep -rl` across the repo, excluding `node_modules/` and `.git/`.

**A creature rename is the expensive one.** Renaming `Mirefin` touches: `core/foodweb.ts`,
`core/lifecycle.ts`, `core/types.ts`, `data/species.json`, `data/gyms.json`,
`data/nodes/brackwater.json`, `data/nodes/r2.json`, `fixtures/battle-scripts/flee-r2-fenmaw.json`,
`fixtures/mega-node.json`, `tests/gates/schemas.test.ts`, `tests/property/battle.test.ts`,
`tests/unit/{battle,catch,lifecycle,transcription}.test.ts`, `tools/comfy/manifest.json`,
`docs/{content-bible,build-doc,DEVIATIONS*}.md`, and now **`data/dialogue.json` (20
occurrences) plus `tests/unit/dialogue.test.ts`**, which binds "Mirefin" in specific lines.
A starter (`Cindril`) additionally hits
`fixtures/battle-scripts/{gym-01-maribel,wild-catch-r1-nibbin}.json`,
`tests/integration/seams.test.ts`, `tests/property/lifecycle.test.ts`, `tests/unit/save.test.ts`
and `assets/approved-trials/README.md`.

**A town rename is comparable.** `Hearthollow` reaches `core/{ecosim,rng,schemas}.ts`,
`game/boot.ts`, `game/season-tint.ts`, `data/nodes/{hearthollow,r1}.json`, `data/gyms.json`,
seven test files across `tests/{gates,integration,property,unit}/`, `tools/comfy/manifest.json`
and **`.claude/CLAUDE.md`** (the vertical-slice never-cut list names it).

**`Vellsire` and `Cullbrand` are load-bearing in code**, not just content: `core/ecosim.ts` and
`core/types.ts` for Vellsire's keystone presence effect, and `core/lifecycle.ts`,
`data/balance.json`, `game/scenes/YearTurnScene.ts`, `game/year-events.ts` and
`tools/harness/full-run.ts` for the Cullbrand harvest raids.

**A move rename is by far the cheapest — four files, and Q1 measured it at three.** The
`Harden`/`Screech`/`Snarl`/`Roost` rename on 2026-08-25 touched **`data/moves.json`,
`tests/unit/transcription.test.ts` and `docs/content-bible.md` §3** — and nothing else. It did NOT
touch `data/species.json` (its `movePool` references are `id`s, and the ids did not move),
`data/gyms.json` (which carries no move slots at all) or `data/dialogue.json` (which mentions no move
by name — the only near-hits are the ordinary words "kiln-hardened" and "burrow"). The estimate below
was made when a rename was assumed to move the `id` too; **renaming the display name alone is
cheaper still**, and that is what shipped (D-Q1-5). `overgrow` appears only in
`data/moves.json`, `data/species.json`, `fixtures/battle-scripts/gym-01-maribel.json` and
`tests/unit/{battle,transcription}.test.ts`. A **trait** rename is cheaper still:
`data/balance.json` plus `data/gyms.json` for the two traits attached to signatures.
**This is why the move and trait REDs should be fixed first — they are the highest-severity
collisions and the lowest-cost fixes in the sweep.**

### The region and the Yr-5 town

**`Fallowmere` is the cheapest RED rename in the project** — it appears in only five files:
`data/dialogue.json` (7 occurrences), `docs/content-bible.md`, `docs/build-doc.md`,
`docs/DIALOGUE-NOTES.md` and `tests/unit/dialogue.test.ts` (where it is asserted at line 306 as
"bible §0 — the region"). It is a top-level *name*, not a key: no node id, no schema, no code
path. For the highest-severity place collision in the sweep, that is a very small edit.

**`Duskhollow` is a mid-cost rename** — `data/nodes/{duskhollow,r4,r5}.json`, `data/gyms.json`,
`core/schemas.ts`, `core/dialogue-schema.ts`, `data/dialogue.json` (9 occurrences),
`tests/gates/extensibility.test.ts`, `tests/unit/{dialogue,transcription}.test.ts`,
`tools/comfy/manifest.json`, `tools/palette/{candidate-sources.json,gen-cool-trials.ts}`, and
`docs/BALANCE-REPORT.md`. It also has generated art (`assets/raw/palette-trials/pt-map-duskhollow.png`).

### Four mechanical facts that change the cost

> **These two were re-measured at the end of the sweep and had changed during it.** Other lanes
> are actively writing the repo; treat the file counts here as a snapshot, not a constant.

1. **`data/dialogue.json` now EXISTS** — it was created while this sweep was running and is
   ~150 KB. It carries every name: Mirefin ×20, Bogling ×16, Cullbrand ×11, Duskhollow ×9,
   Hearthollow ×9, Wispurr ×9, Brackwater ×8, Fallowmere ×7, Cragmar ×6, Umbrat ×5,
   Vellsire ×5, Gloomoth ×3, Cindril ×3, Undermere ×2, Bramblore ×1. **Dialogue rename cost is
   no longer zero**, and `tests/unit/dialogue.test.ts` asserts specific names in specific lines
   (e.g. line 410 binds Fenmaw, Bogling, Mirefin, Vellsire, Kilnback, Undermere, Brackmarsh and
   Maren). **This cost only grows from here — it is an argument for deciding sooner.**
2. **Per-species art has started appearing.** `assets/` has grown from 72 to 116 files during
   this sweep, and now includes named palette trials —
   `pt-mirefin.png`, `pt-bogling.png`, `pt-gloomoth.png`, `pt-wispurr.png`, `pt-undermere.png`,
   `pt-map-duskhollow.png` among them. **Four of those six are RED names.** These are still
   trials rather than final B3 output, so the cost is a rename of trial files, not regeneration
   — but the window in which art is free to rename is closing.
3. **`tools/comfy/manifest.json` rows are derived, not hand-edited.** The file's own header
   documents `npx tsx tools/comfy/comfy-batch.ts rebuild` as regenerating every row from
   `data/`. So a rename is a data edit plus a rebuild, not a manual manifest edit. *(One
   correction: that header also cites `tests/unit/manifest.test.ts` as the gate, but no such
   file exists in `tests/unit/` as of this sweep — the rebuild is not currently test-enforced.)*
4. **`tests/unit/transcription.test.ts` hardcodes every `dexId` and `formName`** as the expected
   transcription of the bible. Any rename requires editing that test — which is legitimate
   **only** because `docs/content-bible.md` changes in the same commit. Under **G2** ("never
   invent species... bible values verbatim") the correct order is: **edit the bible first, log
   the rename in `DEVIATIONS.md`, then propagate to `data/`, then update the transcription
   test to match the new bible.** Renaming in `data/` alone would be a silent divergence and a
   G2 violation.

---

## How to finish this — what a web search cannot settle

These are for Hank or a lawyer. None of them is something more searching would resolve.

1. **Decide on the title.** This is the one decision that is expensive to reverse — it is the
   repo name, the demo video, and any storefront listing. The facts are settled: trademark-clear
   in all game classes worldwide, but an exact-title ecology game already exists on itch.io.
   Everything after this is smaller.
2. **Decide on Duskhollow and Fallowmere, and do it before the art batch.** These two are the
   only names where somebody else is actively spending money on the name *right now* (Archon
   Studio's campaign) or holds a live game-software mark one letter away (Tallowmere). They are
   also both cheap to change today and expensive after B3 and C7 — see Blast Radius.
3. **Get a real trademark clearance search on the names that survive**, if the game will ever be
   sold rather than posted free. TMview is an aggregator, not a clearance search: it will not
   surface unregistered common-law rights, pending intent-to-use applications not yet published,
   or a likelihood-of-confusion analysis against *similar* marks — which is the analysis that
   actually decides these questions. This matters much more for Steam than for itch.io.
4. **Run the fan-forum fakemon check by hand.** r/fakemon, PokeCommunity, DeviantArt and Relic
   Castle all block automated access, and that is precisely where fakemon are posted. Manual
   searches for the surviving creature names would close the biggest remaining gap.
5. **Screen the replacement names before adopting them — against Digimon above all.**
   *(Done for the three Q1 move names — see "The Q1 move renames". Still owed for every creature and
   place candidate.)* They
   passed the Pokédex, Steam, itch.io, Scryfall and four creature-collector wikis. They have
   **not** been through TMview, the fantasy-wiki sweep, the fan forums, or Digimon — and Digimon
   was the source of the two latest exact hits in this sweep (Miasma, Shade), so it is the
   highest-yield gap. The move candidates were also screened against move namespaces only, not
   item/monster/status names.
6. **Verify the one unresolved factual claim:** whether "Rillisk" is a town in Brigid Kemmerer's
   *Cursebreaker* series. One research stream reported it and rated Rillisk RED on that basis;
   I could not confirm it and did not adopt the rating.
7. **Make the judgement calls that are aesthetic, not legal.** Whether a gym leader named Sable
   is worth the *Sable* comparison, whether a rival named Wick is worth the joke, whether
   Pollywisp reading as Poliwag is charming or derivative — no database answers these.
8. **Then tick build-doc §18.** The checklist item is *"IP sweep: game name TROPHIC + all coined
   names quick trademark/steam/itch collision pass (G15)"*. The research is done; the check is
   Hank's to make.

---

## Coverage — what got a thorough check and what did not

**Thorough** — multiple independent sources, positive-controlled:

- **The title TROPHIC.** Steam, itch.io (twice, after the first method failed), TMview
  worldwide, two search engines, and the two itch.io neighbour games read directly.
- **All 35 creature form names.** Checked against the full Pokédex by URL probe with controls,
  plus Steam, itch.io, Scryfall, TMview (priority names), and MediaWiki existence queries across
  Loomian Legacy, Kādomon, Cassette Beasts, Temtem, Coromon, Monster Sanctuary, Nexomon,
  Palworld, Digimon, Yo-kai Watch, plus Forgotten Realms, Elder Scrolls, WoW, D&D 5e, Witcher,
  Final Fantasy, Mana, Warhammer, RuneScape, Elden Ring and others.
- **All 28 move names and all 15 trait names.** Checked against the complete Pokémon move list
  **and** the complete Pokémon ability list by URL probe with controls, then against Cassette
  Beasts, Temtem, Coromon, Monster Sanctuary and Digimon, plus live USPTO/TMview records for the
  ten distinctive names. This is the most conclusive section of the sweep — the collisions found
  are literal, not inferred; the two Digimon hits were confirmed by reading the raw wiki source
  rather than trusting a search summary. **Coromon is the weak spot even here** (its public wiki
  exposes only ~78 of ~180 skills), so Coromon negatives are not certifiable.
- **All 11 character names and the Cullbrand Company.** Cullbrand got the deepest single check
  in the character batch.
- **The region, all six towns/sites, and all six routes — every one, exact-string.** Nothing in
  this category got a shallow pass. Each was run against TMview (validated against `Pokemon`,
  `Hearthstone` and `Tallowmere` before being trusted), Steam, itch.io, six fantasy wikis
  (WoW, Forgotten Realms, Critical Role, Elder Scrolls, D&D 4e, Greyhawk), Wikipedia, Wikidata,
  OpenLibrary, MusicBrainz, OpenStreetMap/Nominatim, and Google-backed general web. The four
  special checks were each pursued to a specific answer rather than a general sweep:
  Brackwater/Blackwater (traced the PMC's actual name history to establish the brand is
  retired, then checked the two live "Blackwater" game properties); Bowerdeep / Duskhollow /
  Hearthollow against each fantasy wiki individually; "The Sanctum Fallow" as a phrase *and*
  separately establishing what "Sanctum" alone is encumbered by; and Cinder-titled games
  enumerated from Steam directly.

**Shallow** — real checks, but fewer sources or resting mainly on negative evidence:

- **`Sel` and `Greaves`.** Ordinary words/surnames where absence of a hit is decent evidence,
  but neither got the depth Cullbrand or Sable did.
- **The item and system vocabulary** (`Snare`, `Bait`, `Lure`, `Tonic`, `Relics`, `Medicines`,
  the snare tiers base/weighted/master). Checked against four creature-collectors only — no
  trademark or storefront pass. Given that these are unprotectable functional descriptors,
  I judged deeper checking to be low value; Hank can overrule that judgement.

**Not reached:**

- **Google Books was rate-limited (HTTP 429) for the entire session.** Book coverage rests on
  OpenLibrary plus general web. **This is the weakest link in the place-name findings in
  particular** — the Hearthollow collision *is* a novel, and it surfaced only via general web,
  so an obscure self-published book using one of these names could have been missed.
- **In-game location names inside shipping titles.** Steam and itch.io searches match *titles*,
  not the names of places inside games. *Cursemark*'s "Brackwater" only surfaced because a
  patch-notes page happened to be indexed, and *Strange Horticulture*'s "Undermere" only
  because it is in the store description. **The same class of collision could exist unfound for
  any name here, and it is a systematic blind spot for exactly the kind of name TROPHIC uses.**
- **Fan-forum fakemon coverage** for every name (blocked + search budget exhausted).
- **Direct USPTO TESS/tmsearch** (blocked; TMview substituted).
- **Common-law and non-English collisions** beyond TMview's office coverage.
- **Siralim, Disc Creatures and NetHack** as systematic wiki sweeps — covered only by general
  web search.
- **TMview for every name.** Run on the title, the region, all six towns, all six routes, the
  twelve starter/Ancient names, Cullbrand, and the RED creatures. The AMBER and GREEN creatures
  in the general roster and all move/trait names were **not** trademark-searched — for mechanic
  names that is a reasonable omission, for creature names it is a genuine gap.
- **US enforceability of the TALLOWMERE mark.** I confirmed live class-9 registrations in New
  Zealand and via WIPO/Madrid, but not which territories the Madrid filing designates. That
  determines whether it is enforceable in the US and is a one-query question for a lawyer.

**One correction recorded for the record:** an early search summary in one research stream
claimed "Cindril" was a fakemon on the Dragonfire wiki replaced by "Cindervore". Direct API
query showed Cindervore exists there and Cindril does not appear anywhere on that wiki. That
was a summarizer hallucination and has been disregarded. The verified Cindril finding is the
Hollow Knight: Silksong location, which is a different and real thing.

---

*Sweep run 2026-08-25. Sources are linked inline; every rating traces to a query run in this
session, not to recall. Where a claim could not be verified it is marked as such rather than
rounded to GREEN.*
