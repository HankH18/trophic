# Pokémon-only name screen — the 41 cast names + Hetty

*Screened 2026-08-25. Bar set by Hank, verbatim: **"The pokemon IP check should be very light,
and I'm really only concerned about using actual pokemon names."** Nothing else was screened —
no trademarks, no storefronts, no other monster-collector games, no real people.*

**Result: 11 of 42 are hits. 31 are clear.** Hetty is confirmed clean. Enid is confirmed a hit.

---

## Method, and why the negatives are worth something

| Source | Query | Covers |
|---|---|---|
| **PokeAPI** full lists, matched locally, exact + case-insensitive | 1,025 species · 937 moves · 373 abilities · 2,223 items · 1,351 forms | species / move / ability / item |
| **Bulbapedia MediaWiki API** (`/w/api.php`) — exact page-title existence for all 42, then full-text `list=search` on `"<name>"` | live | **named characters, including Trainer-class NPCs** |

**Zero of the 42 names matched any Pokémon species, move, ability, item or form.** Every hit
below is a *character*.

The character negatives are meaningful rather than merely empty, because the method has a
built-in positive control: Bulbapedia's full-text search **does** index the per-route and
per-facility Trainer tables. It is what surfaced `School Kid Jem`, `Cooltrainer Rask`,
`Beauty Fay` and `Roller Boy Dorn` — none of which have pages of their own. So a `totalhits: 0`
for a name like `Zeb` or `Kett` is evidence, not silence.

**Serebii was not separately queried.** Bulbapedia's full-text index is the broader of the two
for character and Trainer names and it was used exhaustively; the brief allowed either. Stated
here rather than implied.

---

## 1. CONFIRMED HITS (11)

Replacement candidates are screened against **everything**: PokeAPI's five corpora, Bulbapedia,
`data/species.json` (ids, dexIds, formNames), `data/nodes/*.json`, `data/gyms.json`,
`data/moves.json`, `balance.json .traits.pool`, the three-letter-prefix rule against the retained
cast + the protected canon (Maren, Wick, Greaves, Maribel, Odo, Vesper, Sable, Noct, Bram, Sel,
Tolm, Halder, Pell, Gerta, Ives, Orrin, Hetty) + `Cullbrand`, the lowercase-word check against
`data/dialogue.json`, and each other. **All 33 pass with zero failures.** ★ = recommended.

| Name | Cast slot | The Pokémon thing | Category | Source | Replacements (★ = pick) |
|---|---|---|---|---|---|
| **Enid** | #49 `duskhollow-elder` · skilled | **Nursery Aide Enid**, a named Trainer on the Driftveil, Mix and Rental Tournament rosters of the **Pokémon World Tournament (B2W2)** | in-game named Trainer | [Driftveil Tournament](https://bulbapedia.bulbagarden.net/wiki/Driftveil_Tournament) | ★ **Idony** · Godith · Quenild |
| **Meg** | #22 `innkeeper-duskhollow` · skilled | Three separate ones: **Teammates Anna & Meg** (Hoenn Route 117 in-game Trainer pair); **Meg**, Flannery's Slugma in the anime; **Meg**, main character of the POKÉTOON short *The Chansey Chase* | Trainer + named Pokémon + character | [Meg](https://bulbapedia.bulbagarden.net/wiki/Meg) · [Teammates](https://bulbapedia.bulbagarden.net/wiki/Teammates_(Trainer_class)) | ★ **Effie** · Osyth · Emmot |
| **Ada** | #26 `vendor-cindershelf` · skilled | **Ada (AG184)** — character of the day in *Strategy Tomorrow – Comedy Tonight!*, a travelling comedian with a Chatot. Bulbapedia has a disambiguation page plus a second **Ada (Learning League)** | anime character | [Ada (AG184)](https://bulbapedia.bulbagarden.net/wiki/Ada_(AG184)) | ★ **Annis** · Avice · Ismay |
| **Rhoda** | #34 `brackwater-netmender` · skilled | **Rhoda** — character of the day in *Hail to the Chef!* (AG141), a restaurant manager near Saffron City, twin sister of Rhonda | anime character (own page) | [Rhoda](https://bulbapedia.bulbagarden.net/wiki/Rhoda) | ★ **Parnel** · Sibilla · Denyse |
| **Arley** | #52 `duskhollow-shepherd` · skilled | **Arley** — a member of the Societea in *Pokémon Ranger: Guardian Signs*; battles you with a Regigigas in the Sky Fortress. Formerly the wrestler "Arley the Destroyer" | major named game character (own page) | [Arley](https://bulbapedia.bulbagarden.net/wiki/Arley) | ★ **Alwin** · Jocelin · Sewell |
| **Jem** | #35 `brackwater-child` · child | **School Kid Jem** (Japanese ジェム *Jem*), a named in-game Trainer on **Unova Route 12** | in-game named Trainer | [School Kid](https://bulbapedia.bulbagarden.net/wiki/School_Kid_(Trainer_class)) | ★ **Sukey** · Lolly · Nubb |
| **Rask** | #30 `hearthollow-farmhand` · hands | **Cooltrainer Rask**, a named Trainer in the **Tower Colosseum** (*Pokémon Colosseum*); leads with Alakazam and Slaking | in-game named Trainer | [Tower Colosseum/Battle Mode Double](https://bulbapedia.bulbagarden.net/wiki/Tower_Colosseum/Battle_Mode_Double) | ★ **Gorst** · Kirn · Hodd |
| **Fay** | #50 `duskhollow-child` · child | **Beauty Fay**, a named Trainer at Mossdeep City — *Pokémon Battle e: Series 1*, card 08-A008 | in-game named Trainer | [Pokémon Battle e: Series 1](https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Battle_e:_Series_1) | ★ **Bibby** · Tuppy · Dinny |
| **Dorn** | #58 `sanctum-approach-scout` · institutional | **Roller Boy Dorn** (Japanese ノモン *Nomon*), a named Trainer at **Mt. Battle Area 9** (*Pokémon Colosseum*) | in-game named Trainer | [Roller Boy](https://bulbapedia.bulbagarden.net/wiki/Roller_Boy_(Trainer_class)) | ★ **Kinnear** · Vardon · Mowbray |
| **Dunstan** ⚠️ *surname-only* | #41 `bowerdeep-elder` · skilled | **Dee Dunstan**, a reporter for the North Petalburg News — an animated-series character in North Petalburg, Hoenn (*A Double Dilemma*). **Surname-only match on a character with a full name**, flagged per the brief. *(Darren Dunstan, the 4Kids voice director, is a real person and was not counted.)* | anime character surname | [North Petalburg](https://bulbapedia.bulbagarden.net/wiki/North_Petalburg) | ★ **Thurstan** · Osbert · Everard |
| **Cass** ⚠️ *localization-only — weakest hit, your call* | #39 `bowerdeep-silkwinder` · skilled | **No English-language usage found.** But: **Cass** is the **European Spanish name of Kieran**, the major rival of the Scarlet/Violet *Teal Mask* DLC (from *cassis*, blackcurrant); and キャス *Cass* is the Japanese name of **Bodybuilder Koren** at Mt. Battle Area 9. Exact matches to named characters, in other languages only | localized character name | [Kieran](https://bulbapedia.bulbagarden.net/wiki/Kieran) | ★ **Cicely** · Sybil · Ursel |

**On Cass:** it is the one hit an English-speaking player will not recognise. If your bar is
"a player might notice", Cass survives. If your bar is the literal rule — an exact,
case-insensitive match to a named character — it is a hit. Flagged rather than decided.

**Recommendation register check.** Skilled/salaried picks are the softer two-syllable
saint's-and-grandmother names the tier asks for (Effie, Annis, Parnel, Cicely, Idony, Alwin,
Thurstan — Thurstan deliberately keeps Dunstan's `-stan` cadence so Bowerdeep's elder rivalry
with Whit still scans). The hands pick (Gorst) is one hard closed syllable. The child picks
(Sukey, Bibby) are pet-forms. The institutional pick (Kinnear) is a bare surname, and avoids
Corbett's `-ett` ending so the two Cullbrand voices stay distinguishable.

---

## 2. CLEAR — no Pokémon hit (31)

**Aldis · Elsbet · Yule · Berit · Kett · Hild · Zeb · Hesk · Judd · Tibb · Tamsin · Mott · Gunn ·
Ulla · Corbett · Garrow · Fitch · Whit · Snell · Nunn · Ebba · Cob · Rowe · Bly · Ingram · Isbel ·
Vann · Hurst · Slade · Pinder · Hetty** — no exact match to any Pokémon species, move, ability,
item, or named character.

**Hetty is confirmed clean**, independently of the earlier pass. Its only Bulbapedia hits are
**Hetty Heyting**, a real-world Dutch voice actress (Cassidy, Zoey, Dexter) — a real person, and
real people are outside the bar. The shipped `Nessa → Hetty` rename stands.

Thirteen of the 31 returned **`totalhits: 0`** against Bulbapedia's entire full-text index —
Aldis, Elsbet, Berit, Kett, Zeb, Hesk, Tibb, Tamsin, Garrow, Snell, Nunn, Isbel, Pinder. The
rest matched only the noise catalogued below.

---

## 3. NEAR-MISSES — reported, not hits

- **Whit** → **Whitney**, the Goldenrod Gym Leader. Not exact; the only literal hit was the phrase "one whit" in Professor Laventon's quotes.
- **Hild** → **Hilda** / **Hilbert**, the B/W player characters — Bulbapedia names *hild* (battle) as the Germanic root of both. Etymology note, not a name in use.
- **Cob** → **Cobalion**. Shares three letters; the only literal hit was "corn on the cob" in a Trainer Race quiz.
- **Hurst** → **Wedgehurst**, the Galar town — Bulbapedia glosses *hurst* as its "wooded hill" element. Substring of a place, not a name.
- **Vann** → **Vann** is the **Norwegian localized name of the Water type** (and of Mystic Water). A dictionary word in a localization, not a character or English franchise name.
- **Bly** → the Korean name of the **Bluk Berry** transliterates 블리 *Bly*. Transliteration artifact of "Bluk".
- **Yule** → appears only as an etymology note on **Skiddo/Gogoat** (the northern-European yule goat).
- **Mott**, **Rowe**, **Slade**, **Gunn**, **Corbett**, **Ulla**, **Fitch**, **Ingram** → all matched **real people only** — competitors, voice actors, TCG illustrators, studio staff, a distributor — or their non-Pokémon roles. Real people are outside the bar, so none were counted.
- **Judd**, **Ebba** → matched only an Arabic theme-song lyric and a hex codepoint (`U+EBBA`) respectively. Pure noise.
- *(Rejected during replacement screening, recorded because the same names will keep suggesting themselves: **Nellie**, **Ethel**, **Dilly**, **Pippa**, **Agnes**, **Winnie**, **Tansy**, **Gilly**, **Osanna** are all real named Trainers; **Tilly** is Brock's sibling; **Cissy** is the Mikan Gym Leader; **Poppy** is a Paldea Elite Four member; **Jinny** is an anime character.)*

---

## 4. Stated plainly as unverified — NOT clear

1. **Cass is unresolved by design, not by failure.** English-language franchise usage: none
   found. Non-English: two exact character-name matches. It is in the hits table with a
   qualifier because the decision is yours, not because the evidence is thin.
2. **Serebii was not queried.** Bulbapedia's full-text index was used instead and used
   exhaustively. Overlap is high but not total.
3. **Coverage this method under-counts.** Bulbapedia's search indexes article text, so anything
   thinly documented there is under-represented: *Pokémon Adventures* and other manga character
   names; TCG flavour text and illustrator credits; unnamed-in-English mobile/spinoff event
   NPCs (Masters EX, Café ReMix, UNITE); and non-English localizations generally — the Cass
   finding is a reminder that the localization layer is real and this pass only sampled it.
4. **Trainer-class NPCs are denser than they look.** Screening 54 replacement candidates turned
   up **15 further exact Trainer/character hits** — a ~28% strike rate on ordinary short English
   given names. Any name added to this cast later should be run through the same two corpora
   before it ships; do not assume a plain human name is safe.
5. **A clean result here is not a trademark clearance** and says nothing about the non-Pokémon
   collisions already catalogued in `docs/IP-SWEEP.md` (the title, `Fallowmere`, `Duskhollow`,
   and the five RED creature names all remain open there).
