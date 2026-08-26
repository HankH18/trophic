#!/usr/bin/env python3
"""prose-lint — a FLOOR, not a gate. Flags the structural tics that made TROPHIC's
corpus read as machine-written. It cannot detect sense; an independent read-aloud
pass does that.  usage: prose-lint.py [fragment.json | data/dialogue.json] ..."""
import json, re, sys, collections, glob

def sentences(t):
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+', t.strip()) if s.strip()]

CHECKS = []
def check(code, desc):
    def d(fn):
        CHECKS.append((code, desc, fn)); return fn
    return d

@check('F3-EPIGRAM', 'the LAST sentence of a beat is a short structural closer')
def _(entry, lines):
    """F3: no structural cleverness in the final sentence of a beat. Fires only on the
    TERMINAL sentence — a short sentence mid-beat that is then explained is ordinary
    speech ("I'm out in a boat. From a boat you only see...") and must not be flagged."""
    if not lines: return []
    ss = sentences(lines[-1])
    if not ss: return []
    s = ss[-1]
    if s.endswith('?') or re.match(r"^(Go|Come|Take|Ask|Bring|Mind|Stay|Sit|Don't|Do not|Look|Wait|Try|Keep|Get|Put|Read|Walk|Tell)\b", s):
        return []                                   # a request or an instruction is not a punchline
    verdict = bool(re.match(r"^(That|It|This|Those|These|Both|Neither|Same|Not|Nobody|Everyone)\b", s)) \
              or bool(re.search(r"\b(is|are|was|were)\s+(the|what|all|not)\b", s))
    prev = ss[-2] if len(ss) > 1 else (sentences(lines[-2])[-1] if len(lines) > 1 and sentences(lines[-2]) else '')
    punch = len(s) <= 45 and len(prev) >= 70        # long set-up, short landing
    if (len(s) <= 58 and verdict) or punch:
        return [(len(lines) - 1, s)]
    return []

@check('F2-CATEGORY', 'a property of the RECORD predicated of the THING')
def _(entry, lines):
    """The "Brackmarsh is three weeks old" class: a place or an animal given a property
    that belongs to the record of it. Narrow on purpose — sense is the read-aloud pass's
    job — but this exact error recurred twice, so it is worth catching for free."""
    out = []
    pat = re.compile(r"\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:is|are|was|were)\s+"
                     r"(?:\w+\s+){0,2}(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+"
                     r"(?:days?|weeks?|months?|seasons?|years?)\s+(?:old|behind|out of date|stale)")
    for i, t in enumerate(lines):
        for m in pat.finditer(t):
            out.append((i, m.group(0)))
    return out

@check('B1-ANTITHESIS', 'X-not-Y negation-correction construction')
def _(entry, lines):
    out = []
    for i, t in enumerate(lines):
        if re.search(r"\b(?:that|it|this)(?:'s| is| was)\s+not\b[^.?!]{0,60}[.,;—]\s*(?:that|it|this)(?:'s| is| was)\b", t, re.I) \
           or re.search(r"\bnot\s+a\s+\w+[.,;]\s*(?:it|that|this)(?:'s| is)\b", t, re.I) \
           or re.search(r"\bI(?:'ve| have) not got\b[^.?!]*\.\s*I(?:'ve| have) got\b", t, re.I):
            out.append((i, t))
    return out

@check('F1-DANGLING', 'beat opens on a pronoun with no referent yet')
def _(entry, lines):
    if not lines: return []
    first = sentences(lines[0])
    if first and re.match(r"^(It|That|They|Those|Them|These|Both|Hers|His|Theirs)\b", first[0]):
        return [(0, first[0])]
    return []

@check('F2-EQUATION', 'metaphor compressed into a false equation')
def _(entry, lines):
    out = []
    pat = re.compile(r"\b(?:a|the)\s+\w+\s+(?:is|are)\s+(?:a|the)\s+\w+(?:\s+\w+){0,3}\b", re.I)
    LITERAL = re.compile(r"\b(is|are)\s+(a|the)\s+(same|one|kind|sort|part|piece|bit|lot|matter|question)\b", re.I)
    for i, t in enumerate(lines):
        for m in pat.finditer(t):
            if not LITERAL.search(m.group(0)):
                out.append((i, m.group(0)))
    return out

@check('TOOLTIP', 'game-system vocabulary spoken aloud by a character')
def _(entry, lines):
    BAD = (r"\bflora stock\b|\bthe count\b|\bcounts?\b(?!ing)|\bnode\b|\bmesopredator\b|\brole bait\b|"
           r"\bspecies bait\b|\btwo ticks\b|\bseason meter\b|\bcoefficient\b|\bbase rate\b|"
           r"\bsign reversed\b|\bopposite sign\b|\bledger\b|\bage class\b|\bstat\b|\bbreeding\b")
    out = []
    for i, t in enumerate(lines):
        for m in re.finditer(BAD, t, re.I):
            out.append((i, m.group(0)))
    return out

@check('G1-NO-SHORT', 'a speaker with no short beats at all')
def _(entry, lines):
    """Corpus-level defect caught per entry: every line in this beat is long. Real
    speech alternates. A beat where nothing is under ~90 characters has no emphasis,
    because emphasis is contrast."""
    if len(lines) < 2: return []
    if min(len(t) for t in lines) >= 150:
        return [(0, f'all {len(lines)} lines >= 150 chars (shortest {min(len(t) for t in lines)})')]
    return []

@check('G2-TENURE', 'beat opens on a tenure credential')
def _(entry, lines):
    """B4, and it came back. "Thirty-one years down the third shaft" as an opener is a
    credential, and when 11+ speakers do it the region has one biography."""
    if not lines: return []
    first = sentences(lines[0])[:1]
    for s in first:
        if re.search(r'^\W*(?:I(?:\'ve| have)?\s+\w*\s*)?(?:\w+[- ])?(?:thirty|forty|fifty|sixty|seventy|twenty|eleven|twelve|thirteen|fourteen|fifteen|\d+)[- ]?'
                     r'(?:one|two|three|four|five|six|seven|eight|nine)?\s*(?:years?|seasons?|winters?|summers?)\b', s, re.I):
            return [(0, s[:90])]
    return []

@check('G3-VINDICATION', 'the "I said it and nobody listened" stance')
def _(entry, lines):
    out = []
    pat = (r'\b(?:twice|both times|never once|nothing came of it|nobody listened|no one listened|'
           r'said so at the time|told them|and nothing happened|still waiting)\b')
    for i, t in enumerate(lines):
        for m in re.finditer(pat, t, re.I):
            out.append((i, m.group(0)))
    return out


# ═════════════════════════════════════════════════════════════════════════════
#  READABILITY — CAST-AND-VOICE Appendix I. Hank, in two rulings:
#
#    "The dialogue is still barely readable. Make them sound human, simple
#     linear sentences."
#    "I'M OK WITH LONG SENTENCES IF THEY ARE UNDERSTANDABLE."
#
#  THE SECOND RULING IS THE ONE THAT SHAPES THIS FILE, so read it before you
#  touch a threshold. The first draft of this block counted WORDS: a sentence of
#  24 or more was a defect and the corpus had a ceiling on its share of them.
#  That was wrong, and it was wrong in the exact way the three previous prose
#  standards were wrong — it took the visible correlate of the defect for the
#  defect. Long sentences are not the disease. Length is not measured here at
#  all, in either direction, except by one floor whose only job is to stop this
#  pass from chopping the corpus into telegrams.
#
#  WHAT IS ACTUALLY MEASURED: whether a sentence runs in a straight line.
#  A reader loses a sentence when it makes them hold something unresolved —
#  a subject whose verb has not arrived, a subordinate clause before the thing
#  it modifies, a third subject before the first two are finished with. All
#  three are independent of length. "The levy comes off the buyer's price and
#  pays for the pilings and the harbour wall" is twenty words, one subject, and
#  perfectly clear. "Where the nearer trunk has gone flat against the granite,
#  the bark is dead" is fifteen words and makes you wait nine of them.
#
#  THE APPROXIMATION, STATED PLAINLY. Nothing here parses. "Subject of a clause"
#  is approximated as "the first pronoun, or determiner-plus-noun, after a clause
#  boundary", and clause boundaries are themselves approximated. It over-counts
#  an appositive and under-counts a bare-noun subject. It is a floor. A sentence
#  can pass every check below and still be impossible, which is why Appendix I
#  Part Two is a reader rig and not a regex — NO CHECK IN THIS FILE READS FOR
#  COMPREHENSION, and a green run here is not evidence that an instruction
#  landed.
#
#  THE KNOWN BLIND SPOT, with its evidence, because a floor that hides its misses
#  is worse than no floor. R1 counts SUBJECTS. It therefore does not catch a
#  sentence made hard by piling up appositives and relative clauses that never
#  introduce a new subject. Both of these are in the shipped corpus, both are
#  plainly hard to read, and both pass R1 clean:
#
#    "That was the lampkeeper's family who sent it up, his father before him and
#     his father's brother as well, and I came up to the walk myself the year they
#     re-cut the lower stair, which was the year after my father died."
#
#    "Gloomgrub are the little ones and they turn into the big ones out of the
#     high lines, only they don't, they're a different thing altogether, and the
#     silk comes off the wings when they come through and the lamps go out, whoomf."
#
#  Attempts to catch these by counting commas or clause boundaries fire on plain
#  lists ("Meadow Reach, then Brackmarsh, then the Wilds, then the steppe"), which
#  are easy to read. No cheap rule separates the two, so the miss is accepted and
#  written down instead of being papered over with a noisier check. THE FLAG COUNT
#  IS A LOWER BOUND ON THE WORK. A pass that repairs exactly the flagged sentences
#  and stops has not done the job.
# ═════════════════════════════════════════════════════════════════════════════

SUBJECT_SWITCH = 3      # distinct clause subjects inside ONE sentence
SUBORD_MIN     = 6      # a subordinate clause shorter than this is not a burden
FRONTLOAD_MIN  = 6      # words of subordinate opener before the main clause arrives
INTERRUPT_MIN  = 6      # words of parenthetical wedged between subject and verb

_FINITE = (r"(?:is|are|was|were|has|have|had|does|do|did|will|would|can|could|should|"
           r"must|goes|comes|gets|takes|makes|made|said|says|went|came|puts|keeps|holds|"
           r"reads|pays|costs|sits|stands|runs|walks|sends|brings|wants|needs|knows|"
           r"thinks|looks|leaves|left|found|feels|seems|means|"
           r"isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|doesn't|don't|didn't|"
           r"won't|can't|couldn't|shouldn't|mustn't|'s|'re|'ve|'ll|'d|'m)")

_SUBORD = (r"(?:where|when|while|because|since|although|though|if|after|before|once|"
           r"given|until|whenever|wherever|having|seeing|whereas|unless|which|who|whom|whose)")

_PRONOUN_SUBJ = r"(?:I|you|he|she|it|they|we|there|that|this|those|these|nothing|nobody|" \
                r"everyone|everything|someone|somebody|one)"
_DET = r"(?:the|a|an|my|your|his|her|its|our|their|every|each|no|some|any|most|both)"


def _clause_joins(s):
    """Coordinators in `s` that look like they join clauses rather than list items:
    preceded by a comma, or followed within four words by a finite verb. Over-counts
    a comma-separated list, under-counts a clause whose verb is off the list."""
    out = []
    for m in re.finditer(r"(,\s*|\s+)\b(and|but|so|or|yet)\b\s+", s, re.I):
        if ',' in m.group(1) or re.match(r"(?:\S+\s+){0,3}" + _FINITE + r"\b", s[m.end():], re.I):
            out.append(m)
    return out


_PREP_OR_CONJ = {'and','but','so','or','yet','of','in','on','at','to','for','with','from',
                 'by','off','out','up','down','over','under','than','then','as','not','no'}


def _clause_seg(s, i):
    """The clause beginning at offset i: cut at the next comma or clause coordinator,
    so a subject search cannot run past its own clause into the next one."""
    seg = s[i:]
    cut = len(seg)
    m = re.search(r",", seg)
    if m: cut = min(cut, m.start())
    m = re.search(r"\s+\b(?:and|but|so|or|yet)\b\s+", seg)
    if m: cut = min(cut, m.start())
    return seg[:cut]


def _subject_of(seg):
    """The subject of one clause, or None when the clause has none of its own (a
    compound predicate sharing the previous subject). Approximate — see the block
    above. Returned only as an identity for counting DISTINCT subjects, so a head
    noun and a modifier are equally good as long as the choice is consistent."""
    toks = [t.strip("’'\".;:!?()") for t in seg.split()]
    toks = [t for t in toks if t]
    if not toks:
        return None
    if re.fullmatch(_PRONOUN_SUBJ, toks[0], re.I):
        return toks[0].lower()
    vi = None
    for j, t in enumerate(toks[:6]):
        if re.fullmatch(_FINITE, t, re.I):
            vi = j; break
    if vi == 0:
        return None                       # "and pays for the pilings" — no new subject
    if vi is not None:
        return toks[vi - 1].lower().rstrip("'s")
    j = 0
    if re.fullmatch(_DET, toks[0], re.I):
        j = 1
        while j < len(toks) - 1 and j < 3 and toks[j].lower() in _PREP_OR_CONJ:
            j += 1
    if j >= len(toks):
        return None
    w = toks[j].lower().rstrip("'s")
    return None if w in _PREP_OR_CONJ else w


def _clause_subjects(s):
    """Distinct subjects, one per clause boundary, in order of appearance."""
    starts = [0] + [m.end() for m in _clause_joins(s)]
    for m in re.finditer(r"\b" + _SUBORD + r"\b\s+", s, re.I):
        # A subordinator only opens a clause if a finite verb follows inside it;
        # "since six o'clock this morning" is a prepositional phrase, not a clause.
        # And a SHORT trailing subordinate clause is not a burden on the reader —
        # "...the one post since they made it" costs nothing, so it does not count
        # as a switch. Without this floor the check fires on ordinary speech.
        seg = _clause_seg(s, m.end())
        if len(seg.split()) >= SUBORD_MIN and any(
                re.fullmatch(_FINITE, t, re.I) for t in seg.split()[:6]):
            starts.append(m.end())
    seen, order = set(), []
    for i in sorted(set(starts)):
        w = _subject_of(_clause_seg(s, i))
        if w and w not in seen:
            seen.add(w); order.append(w)
    return order


@check('R1-SUBJECT-SWITCH', f'{SUBJECT_SWITCH}+ different clause subjects inside one sentence')
def _(entry, lines):
    """The signature defect of the fifth pass, and it has nothing to do with length.
    "Fenmaw take Mirefin, and Mirefin is the animal the contract is written on, so the
    marsh figures go in the file and I price off the channel" asks the reader to hold
    four subjects. A long sentence that stays on ONE subject does not fire, however long."""
    out = []
    for i, t in enumerate(lines):
        for s in sentences(t):
            subs = _clause_subjects(s)
            if len(subs) >= SUBJECT_SWITCH:
                out.append((i, f'[{len(subs)}: {", ".join(subs)}] {s}'))
    return out


@check('R2-FRONTLOAD', 'the main clause arrives after a long subordinate opener')
def _(entry, lines):
    """Order, not length. A listener given nine words of condition has nothing to
    attach them to until the main clause lands. A SHORT fronted clause is ordinary
    speech ("When it rains, we stop.") and does not fire."""
    out = []
    for i, t in enumerate(lines):
        for s in sentences(t):
            if not re.match(r"^\W*" + _SUBORD + r"\b", s, re.I):
                continue
            head, _, rest = s.partition(',')
            if rest and len(head.split()) >= FRONTLOAD_MIN:
                out.append((i, f'[{len(head.split())}w opener] {s}'))
    return out


@check('R3-INTERRUPT', 'a parenthetical wedged in before the main clause finishes')
def _(entry, lines):
    """The other way a sentence stops being linear: the subject arrives, then a clause
    of its own turns up before the verb does. Length-neutral — a twenty-word sentence
    that never interrupts itself is clear, and a twelve-word one that does is not."""
    out = []
    for i, t in enumerate(lines):
        for s in sentences(t):
            for m in re.finditer(r",\s*(?:and\s+)?" + _SUBORD + r"\b([^,]*),", s, re.I):
                if len(m.group(0).split()) >= INTERRUPT_MIN:
                    out.append((i, f'[interrupt] {s}'))
                    break
    return out


CORPUS_CHECKS = []
def corpus(code, desc):
    def d(fn):
        CORPUS_CHECKS.append((code, desc, fn)); return fn
    return d

CAP = 2          # CAST-AND-VOICE §2: no construction may be shared by more than TWO
                 # speakers in the whole game. The number is 2 because the corpus was
                 # measured at 24 of 62 speakers reaching for the same "Nobody…/Everyone…"
                 # opener — one voice wearing 62 names. Raising it re-permits that.

NOUN_EVERY_LINE = 0.90   # G13's only actionable reading (CAST-AND-VOICE Appendix H): a speaker
                         # at or above this leans on a proper noun or a trade term in effectively
                         # every line, i.e. has props rather than a voice. It marks rows for a
                         # human look; it fails nothing, and the corpus-wide share is not a target.

# ── closed word lists: the whole of this tool's "grammar" ────────────────────
NEG   = {"not", "no", "never", "none", "nothing", "nobody", "neither", "nor", "cannot",
         "nowhere", "hardly", "barely", "n't", "isn't", "wasn't", "aren't", "weren't",
         "don't", "doesn't", "didn't", "won't", "can't", "couldn't", "wouldn't",
         "shouldn't", "haven't", "hasn't", "hadn't", "ain't"}
SUB   = {"so", "because", "but", "and", "or", "though", "although", "while", "since",
         "if", "then", "unless", "until", "whereas", "as", "nor", "yet", "for"}
WH    = {"who", "whom", "whose", "what", "where", "when", "why", "how", "which"}
AUX   = {"is", "are", "was", "were", "be", "been", "being", "am", "do", "does", "did",
         "have", "has", "had", "will", "would", "can", "could", "shall", "should",
         "may", "might", "must", "let"}
DEM   = {"this", "that", "these", "those", "there", "here"}
PRON  = {"i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
         "my", "your", "his", "its", "our", "their", "mine", "yours", "hers", "ours",
         "theirs", "myself", "yourself", "himself", "herself", "itself", "themselves",
         "one", "someone", "anyone", "everyone", "something", "anything", "everything"}
DET   = {"a", "an", "the", "some", "any", "every", "each", "another", "other", "both",
         "either", "all", "most", "much", "many", "few", "several", "such", "half"}
PREP  = {"in", "on", "at", "by", "for", "with", "from", "to", "of", "over", "under",
         "up", "down", "out", "off", "into", "onto", "about", "after", "before",
         "past", "through", "round", "across", "against", "between", "beyond",
         "without", "within", "along", "behind", "beneath", "near", "upon"}
NUMW  = {"one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
         "eleven", "twelve", "twenty", "thirty", "forty", "fifty", "sixty", "hundred"}
# Imperative openers actually used in this corpus's register. Hand-written, and it is
# the ONLY way a verb-initial sentence gets recognised as verb-initial.
IMPER = {"go", "come", "take", "ask", "bring", "mind", "stay", "sit", "look", "wait",
         "try", "keep", "get", "put", "read", "walk", "tell", "give", "leave", "stand",
         "watch", "hold", "listen", "count", "write", "open", "close", "call", "send",
         "say", "see", "check", "carry", "start", "stop", "pay", "buy", "sell", "let",
         "mind", "follow", "step", "turn", "run", "find", "make", "do", "don't"}
VERBW = {"go", "goes", "went", "gone", "come", "comes", "came", "know", "knows", "knew",
         "say", "says", "said", "take", "takes", "took", "walk", "walks", "walked",
         "count", "counts", "move", "moves", "moved", "run", "runs", "ran", "see",
         "sees", "saw", "get", "gets", "got", "give", "gives", "gave", "do", "does",
         "did", "make", "makes", "made", "think", "thinks", "thought", "want", "wants",
         "tell", "tells", "told", "ask", "asks", "asked", "help", "helps", "helped",
         "stop", "stops", "stopped", "stay", "stays", "stayed", "keep", "keeps", "kept"}
FUNC  = PRON | DET | PREP | AUX | SUB | DEM | WH

STOPWORDS = FUNC | NEG | NUMW | {"just", "still", "only", "again", "very", "more",
    "less", "well", "now", "back", "like", "than", "too", "even", "ever", "own",
    "same", "other", "next", "last", "first", "good", "long", "year", "years", "day",
    "days", "time", "times", "thing", "things", "people", "man", "woman", "went",
    # not trade objects: adverbs and evaluatives that survive the "only this speaker
    # uses it" filter by accident and would otherwise be reported as someone's prop.
    "maybe", "perhaps", "kind", "sort", "rather", "quite", "almost", "nearly",
    "mostly", "often", "sometimes", "enough", "else", "anyway", "right", "wrong",
    "better", "worse", "best", "worst", "hard", "easy", "soon", "late", "early",
    "much", "sure", "true", "real", "plain", "proper", "whole", "half", "every"}

def _words(s):
    return re.findall(r"[A-Za-z][A-Za-z'’-]*", s)

def _norm(w):
    return w.lower().replace("’", "'")

def _units(text):
    """Sentence splitter for the structural layer ONLY — the per-beat checks above keep
    the plain sentences() so their measured zeros stay comparable across passes.
    Splits on .!? AND on a spaced em-dash followed by a capital, because in this corpus
    ' — Hetty has the shallows figure' is doing a full stop's job and the chop hides
    behind it. Misses: comma splices, abbreviations, and an em-dash chop that opens
    lowercase."""
    parts = re.split(r'(?<=[.!?])\s+|\s+—\s+(?=[A-Z])', text.strip())
    return [p.strip() for p in parts if p.strip()]

def _bucket(n):
    return 'XS' if n <= 3 else 'S' if n <= 7 else 'M' if n <= 14 else 'L' if n <= 25 else 'XL'

def _open_class(s):
    """Precedence order is arbitrary where a word belongs to two lists (see the
    approximation note): NEG beats everything, SUB beats AUX, DEM beats PRON."""
    w = _words(s)
    if not w: return 'NONE'
    h, raw = _norm(w[0]), w[0]
    if h in NEG:  return 'OPEN.NEG'
    if h in WH:   return 'OPEN.WH'
    if h in SUB:  return 'OPEN.SUB'
    if h in AUX:  return 'OPEN.AUX'
    if h in DEM:  return 'OPEN.DEM'
    if h in PRON: return 'OPEN.PRON'
    if h in DET:  return 'OPEN.DET'
    if h in PREP: return 'OPEN.PREP'
    if h in IMPER and len(w) <= 12: return 'OPEN.VERB'
    if h in NUMW or raw[0].isdigit(): return 'OPEN.NUM'
    if raw[0].isupper() and len(raw) > 2: return 'OPEN.NAME'
    return 'OPEN.OTHER'

def _end_class(s):
    """ends-on-noun-vs-verb, guessed. -ed/-ing/-en suffix or a small verb list means
    verb; a closed-class word means function word; everything else is called nounish.
    'the shed' therefore reads VERB and 'he ran' reads NOUN."""
    w = _words(s)
    if not w: return 'END.NONE'
    t = _norm(w[-1])
    if t in NUMW or w[-1][:1].isdigit(): return 'END.NUM'
    if t in NEG:  return 'END.NEG'
    if t in VERBW: return 'END.VERB'
    if t in FUNC: return 'END.FUNC'
    if len(t) >= 5 and t.endswith(('ing', 'ed', 'en')): return 'END.VERB'
    return 'END.NOUN'

def _polarity(s):
    return 'NEG' if any(_norm(w) in NEG for w in _words(s)) or "n't" in s.lower() else 'POS'

def _sig(s):
    return f'{_bucket(len(_words(s)))}/{_open_class(s)}/{_end_class(s)}/{_polarity(s)}'

def _beats(entries):
    """(entry, [line texts]). choices[] are the PLAYER's utterances, not the speaker's,
    so the corpus layer excludes them; attributing a choice to the NPC would poison
    every per-speaker number in here."""
    for e in entries:
        yield e, [l['text'] for l in e.get('lines', [])]

def _over_cap(who, label, examples, extra=''):
    """Shared reporting shape: fail when a construction is carried by > CAP speakers."""
    if len(who) <= CAP: return []
    top = ', '.join(f'{k}({v})' for k, v in who.most_common(10))
    return [(f'{label}: {len(who)} speakers, {sum(who.values())} uses (cap {CAP}){extra}',
             top, examples[:6])]


@corpus('G8-ASSERT-CHOP', 'assert, then chop: a full sentence then a short unsubordinated fragment')
def _(entries):
    """THE FOURTH COSTUME, and the one every word-matching check was blind to.

    A sentence of >= 8 words immediately followed by a sentence of <= 5 words that is
    not introduced by a subordinator and is not a question. Excluded openers:
    so/because/but/and/or/though/although/while/since/if/then/unless/until/as/yet/for
    — a clause hung off the previous one is ordinary speech, not a landing.

    Reported per DISTINCT SPEAKER, because one speaker doing this six times is a tic
    and thirty-six speakers doing it once each is a house style. Cap 2.

    MISSES ON PURPOSE: a chop that lands in the NEXT line rather than the same line
    (a new line is a new advance-press, and the reader gets a pause). MISSES BY
    ACCIDENT: a six-word chop, and a chop whose fragment happens to open on 'as'."""
    who, ex = collections.Counter(), []
    for e, lines in _beats(entries):
        for t in lines:
            ss = _units(t)
            for a, b in zip(ss, ss[1:]):
                if len(_words(a)) < 8 or not (1 <= len(_words(b)) <= 5):
                    continue
                if b.endswith('?') or _norm(_words(b)[0]) in SUB:
                    continue
                who[e['speaker']] += 1
                if len(ex) < 40:
                    ex.append(f'{e["id"]}  …{" ".join(a.split()[-5:])} | {b}')
    return _over_cap(who, 'assert-then-chop', ex)


@corpus('G9-SHAPE-SIG', 'the last two sentences of a beat share an abstract shape signature')
def _(entries):
    """THE GENERALISATION, because the next costume will not be assert-then-chop.

    Abstracts a beat's final two sentences to (length bucket, opening word class,
    ending word class, polarity) each — no content words survive the abstraction —
    buckets the corpus by the resulting signature, and fails any signature carried by
    more than CAP speakers. A writer can defeat G8 by making the chop six words long.
    They cannot defeat this by changing vocabulary, because vocabulary is discarded
    before the comparison.

    MEASURED AT THREE RESOLUTIONS, AND THAT IS THE WHOLE POINT. The first version of
    this check ran only the eight-dimension FULL signature and reported 202 distinct
    signatures over 212 beats — nearly one per beat. A resolution that fine cannot
    detect a shared construction: it was clean for the same reason the lexical chorus
    list was clean, one level up the ladder. Reading a single resolution is how an
    instrument goes blind, so all three are reported with their distinct-signature
    counts attached, and any resolution whose signatures are nearly unique per beat
    is labelled DEGENERATE — a clean result there is not evidence of variety.

      FULL     both sentences, all four dimensions each. Sensitive, sparse.
      CLOSE    the final sentence only. The closing move, whatever its set-up.
      CADENCE  length bucket transition + how the last sentence opens + whether the
               polarity flips. This is the axis assert-then-chop lives on, so it is
               the resolution that generalises G8 rather than restating it.

    READ THE OUTPUT AS A RANKING, NOT A VERDICT. The buckets are approximations (see
    the head of this section), so some collisions are two people happening to end on a
    short negative sentence rather than two people reaching for one construction. The
    number to act on is CONCENTRATION per resolution: what share of beats sit inside a
    shape more than CAP speakers share."""
    RES = [
        ('FULL', lambda p, l: f'{_sig(p) if p else "-"}  >>  {_sig(l)}'),
        ('CLOSE', lambda p, l: _sig(l)),
        ('CADENCE', lambda p, l: f'{_bucket(len(_words(p))) if p else "-"}->'
                                f'{_bucket(len(_words(l)))} / {_open_class(l)} / '
                                f'{(_polarity(p) if p else "-")}->{_polarity(l)}'),
    ]
    out, n_rows = [], 0
    for name, keyfn in RES:
        who = collections.defaultdict(collections.Counter)
        where = collections.defaultdict(list)
        total = 0
        for e, lines in _beats(entries):
            ss = [u for t in lines for u in _units(t)]
            if not ss: continue
            total += 1
            sig = keyfn(ss[-2] if len(ss) > 1 else '', ss[-1])
            who[sig][e['speaker']] += 1
            where[sig].append(f'{e["id"]}  …{ss[-1][:60]}')
        if not total: continue
        rows, over_beats = [], 0
        for sig, c in sorted(who.items(), key=lambda kv: (-len(kv[1]), -sum(kv[1].values()))):
            if len(c) > CAP:
                over_beats += sum(c.values())
                rows.append((f'  [{name}] shape {sig}: {len(c)} speakers, {sum(c.values())} beats (cap {CAP})',
                             ', '.join(f'{k}({v})' for k, v in c.most_common(8)),
                             where[sig][:3]))
        degen = ' DEGENERATE — signatures are near-unique per beat, so this resolution ' \
                'cannot see a shared shape and its silence means nothing' \
                if len(who) > 0.75 * total else ''
        head = (f'[{name}] {over_beats}/{total} beats ({100.0*over_beats/total:.0f}%) end in a shape '
                f'more than {CAP} speakers share · {len(rows)} over-cap signatures · '
                f'{len(who)} distinct signatures over {total} beats.{degen}')
        out.append((head, '', []))
        out += rows[:12]
        n_rows += len(rows)
    return out if n_rows else []


@corpus('B1-DISTRIBUTED', 'the negation-correction epigram, split across a full stop or a comma')
def _(entries):
    """B1 survives the copular regex above by moving the negation off the copula.
    Two forms, both shape not vocabulary:
      (a) an assertion followed by a sentence that OPENS on Not/No/None/Never/Nothing
          and is short enough to be a correction of it rather than a statement;
      (b) the appositive '<clause>, not <clause>' inside one sentence.
    Cap 2 speakers, not zero — the move is fine for one or two people and lethal at 22.
    MISSES: a correction that opens on a content word ('A foot, two at the outside')."""
    who, ex = collections.Counter(), []
    for e, lines in _beats(entries):
        for t in lines:
            ss = _units(t)
            for a, b in zip(ss, ss[1:]):
                w = _words(b)
                if w and _norm(w[0]) in {'not', 'no', 'none', 'never', 'nothing'} \
                   and len(w) <= 8 and len(_words(a)) >= 5 and not b.endswith('?'):
                    who[e['speaker']] += 1
                    if len(ex) < 40: ex.append(f'{e["id"]}  …{" ".join(a.split()[-4:])} | {b}')
            for s in ss:
                m = re.search(r'[^,;]{8,},\s+not\s+(?:the|a|an|my|his|her|their|out|in|at|on|from|to)\b[^.?!]{2,}', s)
                if m:
                    who[e['speaker']] += 1
                    if len(ex) < 40: ex.append(f'{e["id"]}  {m.group(0)[:70]}')
    return _over_cap(who, 'distributed X-not-Y', ex)


@corpus('G11-CLOSER-SHAPE', 'beats close on the same move: an imperative, or an absolute stance')
def _(entries):
    """Two closing postures the audits found surviving with fresh words each pass.
    IMPERATIVE-CLOSE: the beat's final sentence opens on a bare imperative — usually
    an invitation to come back, which belongs to the quest-givers who genuinely gate
    on a return trip and to nobody else.
    ABSOLUTE-STANCE: the final sentence sets an absent generic collective right
    ('people', 'they', 'the market', 'you'll say', 'nobody'), ANYWHERE in it and not
    merely sentence-initially, which is what the old check could see.
    Each capped at 2 speakers, reported separately.

    THE LICENCE IS NOT A SILENCER. CAST-AND-VOICE §2 B7 permits second-person
    instruction from exactly four speakers, so their imperatives are counted, printed,
    and then subtracted before the cap is applied. Both numbers are shown, because a
    licence that removes speakers from the output is how a check stops being readable.
    Nobody may be added to this set to make a run green — it is a bible list."""
    LICENSED = {'maren', 'gerta', 'bram', 'orrin'}      # CAST-AND-VOICE §2, B7
    imp, abso, ex_i, ex_a = collections.Counter(), collections.Counter(), [], []
    ABS = re.compile(r"\b(?:people|they|nobody|no one|everyone|everybody|the market|the town|"
                     r"the trade|the buyers|folk)\b[^.?!]{0,40}\b(?:say|says|said|tell|tells|told|"
                     r"think|thinks|call|calls|reckon|reckons|want|wants|ask|asks|asked|will|"
                     r"won't|don't|doesn't|never|always)\b|\byou'll\s+say\b|\bwhatever\s+\w+\s+tells\b", re.I)
    for e, lines in _beats(entries):
        ss = [u for t in lines for u in _units(t)]
        if not ss: continue
        s = ss[-1]
        w = _words(s)
        if w and _norm(w[0]) in IMPER and not s.endswith('?'):
            imp[e['speaker']] += 1
            # examples are collected for UNLICENSED speakers only: a report whose
            # examples are all licensed lines reads as if the licence did nothing.
            if e['speaker'] not in LICENSED and len(ex_i) < 30:
                ex_i.append(f'{e["id"]}  {s[:70]}')
        if ABS.search(s):
            abso[e['speaker']] += 1
            if len(ex_a) < 30: ex_a.append(f'{e["id"]}  {s[:70]}')
    unl = collections.Counter({k: v for k, v in imp.items() if k not in LICENSED})
    lic = ', '.join(f'{k}({v})' for k, v in imp.most_common() if k in LICENSED) or 'none'
    return (_over_cap(unl, 'imperative close', [x for x in ex_i], f'  [B7-licensed and excluded: {lic}]')
            + _over_cap(abso, 'absolute-stance close', ex_a))


@corpus('G12-SILHOUETTE', 'the two-line beat has one fixed silhouette')
def _(entries):
    """A two-line beat has exactly two possible silhouettes — short first or long
    first — so uniformity here is measurable with no linguistics at all. 62 of 87 ran
    short-setup → long-payoff at the last audit. Fails when either ordering exceeds
    60% of two-line beats, so the fix cannot re-converge on the inverse."""
    a = b = 0
    for e, lines in _beats(entries):
        if len(lines) != 2: continue
        if len(lines[0]) < len(lines[1]): a += 1
        elif len(lines[0]) > len(lines[1]): b += 1
    n = a + b
    if n < 8: return []
    lo, hi = min(a, b), max(a, b)
    share = 100.0 * hi / n
    if share > 60.0:
        which = 'short→long' if b < a else 'long→short'
        return [(f'{hi}/{n} two-line beats ({share:.0f}%) run {which} — cap 60%',
                 f'short→long {a}, long→short {b}', [])]
    return []


@corpus('G13-NOUN-CARRIED', 'DIAGNOSTIC ONLY — the PER-SPEAKER share of lines leaning on a noun')
def _(entries):
    """NOT PASS/FAIL, and the CORPUS-WIDE percentage is NOT A TARGET. Read
    CAST-AND-VOICE.md Appendix H before acting on anything this prints.

    Appendix H governs this check: a line that any of five people could have said is
    fine when what it is doing is any-of-five-people work — a greeting, a price, a
    direction. Ordinary speech names ordinary things, so a corpus-wide figure around
    half is EXPECTED AND UNREMARKABLE. It is not a gap and nobody is to rewrite a line
    to move it. A lower number is not a better corpus: driving it down means making
    every line distinctive, which is how you get sixty-two aphorists — the exact
    disease five rewrite passes were fighting.

    THE READING THAT MATTERS IS PER SPEAKER, and it is the TOP of the printed list.
    A speaker whose EVERY line leans on a proper noun or a trade term has props rather
    than a voice, and is worth a look; `duskhollow-shepherd` at 3/3 is that reading.
    The corpus share is printed as context for that column and for nothing else.
    Rows are ordered most-noun-leaning first, so the head of the list is the thing to
    look at — the tail is not a leaderboard and low is not a virtue.

    A line counts as noun-carried if it contains either
      (a) an in-world PROPER NOUN — a capitalised token appearing mid-sentence
          somewhere in the corpus (so 'Chalk,' opening a sentence does not qualify,
          but 'Auntie Hetty' does), or
      (b) a SPEAKER-UNIQUE TRADE TERM — a content word of >= 4 letters used at least
          twice, all of whose corpus occurrences belong to this one speaker.
    MISSES: a proper noun that only ever appears at the start of a sentence; a trade
    object named with a common word two speakers happen to share ('board', 'post');
    a unique term used exactly once. Every per-speaker ratio is therefore a floor on
    that speaker's real figure, not an exact reading — which matters only for the
    speakers near the top, since that is the only end anyone acts on.

    Two false-positive classes the first live run turned up and this version excludes:
    proper nouns were matched case-insensitively, so 'Old Nib' put every lowercase
    'old' in the corpus into the proper-noun set — matching is now case-SENSITIVE; and
    contractions ("I've", "I'll") were being counted as speaker-unique trade terms, so
    the clitic is now stripped and the stem tested against the function-word lists."""
    mid_caps, word_owner, word_ct = set(), {}, collections.Counter()
    for e, lines in _beats(entries):
        for t in lines:
            for s in _units(t):
                for w in _words(s)[1:]:
                    stem = _norm(w).split("'")[0]
                    if w[0].isupper() and len(stem) > 2 and stem not in FUNC and stem not in NEG:
                        mid_caps.add(w)                 # case-SENSITIVE on purpose
            for w in _words(t):
                if w[0].isupper(): continue
                stem = _norm(w).split("'")[0]
                if len(stem) < 4 or stem in STOPWORDS or stem in FUNC or stem in NEG:
                    continue
                word_ct[stem] += 1
                if stem not in word_owner: word_owner[stem] = e['speaker']
                elif word_owner[stem] != e['speaker']: word_owner[stem] = None
    unique = {w for w, o in word_owner.items() if o and word_ct[w] >= 2}
    tot, hit = collections.Counter(), collections.Counter()
    owners = collections.defaultdict(set)
    for e, lines in _beats(entries):
        sp = e['speaker']
        for t in lines:
            tot[sp] += 1
            ws = _words(t)
            props = [w for w in ws if w in mid_caps]
            uniqs = [w for w in ws if not w[0].isupper()
                     and _norm(w).split("'")[0] in unique
                     and word_owner[_norm(w).split("'")[0]] == sp]
            if props or uniqs:
                hit[sp] += 1
                owners[sp] |= {_norm(w).split("'")[0] for w in (props + uniqs)}
    lines_all = sum(tot.values())
    lines_hit = sum(hit.values())
    rows = sorted(((hit[s] / tot[s], hit[s], tot[s], s) for s in tot), reverse=True)
    flagged = [s for r, _, _, s in rows if r >= NOUN_EVERY_LINE]
    body = [f'{s:34} {h}/{n}  {r:.2f}   {", ".join(sorted(owners[s])[:6])}'
            + ('   <-- every line leans on a noun' if r >= NOUN_EVERY_LINE else '')
            for r, h, n, s in rows]
    return [(f'corpus-wide: {lines_hit}/{lines_all} lines ({100.0*lines_hit/max(lines_all,1):.0f}%) '
             f'name a proper noun or a speaker-unique term — CONTEXT, NOT A TARGET '
             f'(ordinary speech names ordinary things; CAST-AND-VOICE Appendix H)',
             f'the reading is the PER-SPEAKER column below, most-noun-leaning first: '
             + (f'{len(flagged)} speaker(s) at >={NOUN_EVERY_LINE:.2f} — {", ".join(flagged)}'
                if flagged else f'no speaker at >={NOUN_EVERY_LINE:.2f}')
             + '. A speaker whose every line leans on a noun has props, not a voice; '
               'a low ratio is not a score and is nobody\'s to chase', body)]



# ── R4: the anti-telegram floor. A FLOOR ONLY. There is no ceiling. ──────────
#  Hank: "I'M OK WITH LONG SENTENCES IF THEY ARE UNDERSTANDABLE." So this check
#  has no upper bound and never will. Its entire job is to catch the one failure
#  mode this pass is most likely to produce: reading "simple linear sentences" as
#  a quota and chopping five hundred lines into uniform fragments. A person who
#  only ever speaks in seven-word declaratives is not a person.
R_MEDIAN_MIN  = 7      # below this the corpus has been chopped
R_SHORT_SHARE = 0.60   # share of sentences of 6 words or fewer
R_VARIETY_MIN = 0.12   # share of sentences of 20 words or more — a corpus with none
                       # has been flattened, which is its own kind of unreadable


@corpus('R4-NOT-TELEGRAMS', 'the corpus has not been chopped into uniform fragments')
def _(entries):
    lens = [len(s.split()) for e in entries for l in e['lines'] for s in sentences(l['text'])]
    if not lens:
        return []
    med = sorted(lens)[len(lens) // 2]
    short = sum(1 for n in lens if n <= 6) / len(lens)
    longs = sum(1 for n in lens if n >= 20) / len(lens)
    body = (f'median {med}w (floor {R_MEDIAN_MIN}, NO ceiling) · 6w- {short:.1%} '
            f'(max {R_SHORT_SHARE:.0%}) · 20w+ {longs:.1%} (min {R_VARIETY_MIN:.0%}) · '
            f'{len(lens)} sentences')
    bad = []
    if med < R_MEDIAN_MIN:
        bad.append(f'median sentence is {med} words — the corpus has been chopped')
    if short > R_SHORT_SHARE:
        bad.append(f'{short:.1%} of sentences are 6 words or fewer — nobody speaks only in fragments')
    if longs < R_VARIETY_MIN:
        bad.append(f'only {longs:.1%} of sentences reach 20 words — a long sentence is not a '
                   f'defect and a corpus with none of them has been flattened')
    return [('cadence below the floor', body, bad)] if bad else []


# ═════════════════════════════════════════════════════════════════════════════
#  CONTROLS — every structural check has a positive and a negative control, and
#  they run on EVERY invocation before any corpus is read. A check that cannot
#  fail on its own known-bad sample is not a check; a check that fires on plain
#  speech is a check nobody will keep. If you are here because a control is red,
#  the fix is the check, not the control. Deleting or weakening a control to get
#  a green run is the exact move this block exists to make visible.
# ═════════════════════════════════════════════════════════════════════════════

def _mk(*beats):
    """beats: (speaker, [line, ...]) -> entry dicts."""
    return [{'id': f'ctl.{i}.{sp}', 'speaker': sp, 'lines': [{'text': t} for t in ls]}
            for i, (sp, ls) in enumerate(beats)]

# ── G8 ──────────────────────────────────────────────────────────────────────
# POSITIVE: three speakers, three different vocabularies, one shape. No two of these
# share a content word, which is precisely why every lexical check reads them clean.
G8_POS = _mk(
    ('a', ["The water comes up to that mark and it does not go over. Same mark."]),
    ('b', ["I've had the north stretch on my sheet every week from the thaw onward. Every week."]),
    ('c', ["Every one of those overalls came out of the company store. Company issue."]),
    # (d) hides the chop behind a spaced em-dash instead of a full stop. It exists so
    # that removing the em-dash clause from _units() turns a control red instead of
    # silently halving what this check can see.
    ('d', ["She had the whole of the eastern stair to herself for years — Forty of them."]),
)
# NEGATIVE: ordinary speech that a blunt version of this check would wrongly flag —
# a short clause hung off the previous one with a subordinator, a short question, a
# short sentence that comes FIRST and is then explained, and a short sentence after a
# short sentence. All four are the shapes real people use.
G8_NEG = _mk(
    # Three speakers per exclusion, deliberately: with only one, deleting an exclusion
    # would leave the count under the cap and the control would stay green while the
    # check had been broadened into uselessness.
    # (a-c) a short clause hung off the previous sentence by a subordinator.
    ('a', ["I've been down at the barge since first light and the tide is not helping me at all. So I'm behind."]),
    ('b', ["The winch has been sticking on the down-run for a fortnight now. Because nobody greased it."]),
    ('c', ["I put three bolts of it on the counter for the morning barge. And two came back."]),
    # (d-f) a short question after a full sentence — the commonest shape in real speech.
    ('d', ["You want the third shaft and not the second one, and the third has the winch on it. Which way now?"]),
    ('e', ["I have not seen him up this end of the road since the flood year. Have you?"]),
    ('f', ["There is a card on the string with all the old depths written on it. Can you read it?"]),
    # (g-h) short FIRST and then explained — Appendix F's own model register.
    ('g', ["I'm out in a boat.", "From a boat you only ever see the ones that come up close enough to be seen."]),
    ('h', ["Sit down. I'll get you something to eat before you go anywhere near that road."]),
)

# ── G9 ──────────────────────────────────────────────────────────────────────
# POSITIVE: three speakers whose beats close on one abstract shape — a medium
# pronoun-opening sentence, then a short demonstrative-opening negative that ends on a
# noun. Different words every time; identical signature.
G9_POS = _mk(
    ('a', ["I walked the rise myself at dawn and made the tally.", "That is not the posted figure."]),
    ('b', ["He brought the barge in on the ebb with a full deck.", "This was not the agreed hour."]),
    ('c', ["She left two hanks of silk out on the counter.", "That is not the usual weight."]),
)
# NEGATIVE: four speakers ending four genuinely different ways — a question, an
# imperative, a long declarative ending on a verb, a short number. Nothing here should
# collide above the cap.
G9_NEG = _mk(
    ('a', ["The post is down again by the lower gate.", "Are you walking that way this afternoon?"]),
    ('b', ["Rain got into the flour and the whole sack has to go.", "Bring the barrow round the back when you can."]),
    ('c', ["My boy has been up since four and he has not stopped talking since he got up."]),
    ('d', ["I asked her how many she had counted on the west side.", "Nine."]),
)

# ── B1-DISTRIBUTED ──────────────────────────────────────────────────────────
B1D_POS = _mk(
    ('a', ["The plates have the colour of fired clay all the way through. Not clay."]),
    ('b', ["They put the lamps out coming through the second bend. Not on purpose."]),
    ('c', ["The share comes off the crop, not out of my own pocket."]),
)
# NEGATIVE: negation used the way people use it — inside the sentence, as the point of
# the sentence, without a corrected noun waiting on the other side of a full stop.
B1D_NEG = _mk(
    ('a', ["Warden keeps asking me how many come through here. I don't know how many."]),
    ('b', ["No one has driven a new piling since my mother was working this crossing."]),
    ('c', ["I never got round to it and now the season is over and it will keep till spring."]),
)

# ── G11 ─────────────────────────────────────────────────────────────────────
G11_POS = _mk(
    ('a', ["I'll have the second reading written up by the turn. Come back when you've walked it."]),
    ('b', ["The mesh wants re-cutting before the summer run. Bring it down to me here."]),
    ('c', ["There's a card on the string with the depths on it. Take a look at it yourself."]),
)
G11_NEG = _mk(
    ('a', ["The kettle's been on since six and nobody has drunk any of it."]),
    ('b', ["I've three bolts promised out on the morning barge and two of them are not finished."]),
    ('c', ["My back's been bad since the flood year and it has not improved with the damp."]),
)

# ── G12 ─────────────────────────────────────────────────────────────────────
# The positive control sits at 70% — above the 60% cap but well below 100% — so that
# raising the cap to hide a real corpus turns it red. The negative sits at 50%, so
# lowering the cap to make everything fail turns THAT red. The cap is bracketed.
_LONG = 'A very much longer line that carries the whole of the payload for this beat.'
G12_POS = _mk(*[(f's{i}', ['Short one.', _LONG] if i < 7 else [_LONG, 'Short one.'])
                for i in range(10)])
G12_NEG = _mk(*[(f's{i}', ['Short one.', _LONG] if i < 5 else [_LONG, 'Short one.'])
                for i in range(10)])

# ── G13 (diagnostic: controls assert the RATIO, since it never fails) ───────
G13_POS = _mk(
    ('a', ["Warden Maren walked the Reach herself.", "Corbett has the contract for Brackmarsh."]),
    ('b', ["I make it eleven in the high lines and Vesper has the same.", "Three out on the morning barge for Halder."]),
)
G13_NEG = _mk(
    ('a', ["The post is down again and I am the one putting it back up."]),
    ('b', ["I have not been well since the winter and it has not got better."]),
)

def _fired_raw(code, entries):
    for c, _d, fn in CORPUS_CHECKS:
        if c == code: return fn(entries)
    raise AssertionError(f'control names a check that does not exist: {code}')

def _speakers_in(res):
    m = re.search(r'(\d+) speakers', res[0][0]) if res else None
    return int(m.group(1)) if m else 0

CONTROL_RUNS = [0]

def run_controls():
    """Returns a list of failure strings. Empty list means every check both bites on
    its known-bad sample and holds its fire on ordinary speech. CONTROL_RUNS[0] holds
    how many assertions actually ran, so the banner cannot claim coverage that was
    quietly deleted."""
    f = []
    CONTROL_RUNS[0] = 0
    def want(cond, msg):
        CONTROL_RUNS[0] += 1
        if not cond: f.append(msg)

    def _fired(code, entries):          # shadows the module-level helper so that a
        try:                            # deleted check reports as a control failure
            return _fired_raw(code, entries)   # instead of a traceback
        except AssertionError as ex:
            f.append(str(ex)); return []

    r = _fired('G8-ASSERT-CHOP', G8_POS)
    want(r and _speakers_in(r) == 4, 'G8 positive control did NOT fire on 4 speakers of assert-then-chop '
         '(speaker d hides its chop behind an em-dash — check _units())')
    r = _fired('G8-ASSERT-CHOP', G8_NEG)
    want(not r, f'G8 negative control fired on ordinary speech: {r[:1]}')

    r = _fired('G9-SHAPE-SIG', G9_POS)
    want(any('[FULL] shape' in h and '3 speakers' in h for h, _, _ in r),
         'G9 positive control did NOT flag one shape across 3 speakers at FULL resolution')
    want(any('[CLOSE] shape' in h and '3 speakers' in h for h, _, _ in r),
         'G9 positive control did NOT flag one shape across 3 speakers at CLOSE resolution')
    want(any('[CADENCE] shape' in h and '3 speakers' in h for h, _, _ in r),
         'G9 positive control did NOT flag one shape across 3 speakers at CADENCE resolution')
    r = _fired('G9-SHAPE-SIG', G9_NEG)
    want(not r, f'G9 negative control fired on four differently-shaped beats: {r[:1]}')

    r = _fired('B1-DISTRIBUTED', B1D_POS)
    want(r and _speakers_in(r) == 3, 'B1-DISTRIBUTED positive control did NOT fire on 3 speakers')
    r = _fired('B1-DISTRIBUTED', B1D_NEG)
    want(not r, f'B1-DISTRIBUTED negative control fired on plain negation: {r[:1]}')

    r = _fired('G11-CLOSER-SHAPE', G11_POS)
    want(r and _speakers_in(r) == 3, 'G11 positive control did NOT fire on 3 imperative closes')
    r = _fired('G11-CLOSER-SHAPE', G11_NEG)
    want(not r, f'G11 negative control fired on non-imperative closes: {r[:1]}')

    r = _fired('G12-SILHOUETTE', G12_POS)
    want(r, 'G12 positive control did NOT fire on a 70/30 short→long split (cap is 60%)')
    r = _fired('G12-SILHOUETTE', G12_NEG)
    want(not r, f'G12 negative control fired on a 50/50 split: {r[:1]}')

    r = _fired('G13-NOUN-CARRIED', G13_POS)
    want('4/4 lines (100%)' in r[0][0], f'G13 positive control did not read 100%: {r[0][0]}')
    r = _fired('G13-NOUN-CARRIED', G13_NEG)
    want('0/2 lines (0%)' in r[0][0], f'G13 negative control did not read 0%: {r[0][0]}')

    # ── Appendix I readability layer. Every check gets both signs, and the
    #    negative controls are all LONG, because length is not the defect. ─────
    def _beat(code, *ls):
        for c, _d, fn in CHECKS:
            if c == code:
                return fn({}, list(ls))
        f.append(f'control names a per-beat check that does not exist: {code}')
        return []

    # R1: four subjects fires. A 20-word ONE-subject sentence must NOT fire, and a
    # 26-word two-subject sentence must NOT fire — that is the whole ruling.
    want(bool(_beat('R1-SUBJECT-SWITCH',
        "Fenmaw take Mirefin, and Mirefin is the animal the contract is written on, so the "
        "marsh figures go in the file and I price off the channel.")),
        'R1 positive control did NOT fire on a sentence carrying four subjects')
    want(not _beat('R1-SUBJECT-SWITCH',
        "The levy comes off the buyer's price and pays for the pilings and the harbour wall."),
        'R1 negative control fired on a twenty-word sentence with ONE subject — length is not '
        'the defect and this check must never become a length check')
    want(not _beat('R1-SUBJECT-SWITCH',
        "The kettle has been on since six o'clock this morning and nobody in this whole "
        "building has drunk so much as a cup of it."),
        'R1 negative control fired on a 26-word TWO-subject sentence — long and linear is fine')

    # R2: a nine-word fronted clause fires; a short one does not; and the SAME
    # content in main-clause-first order must not fire at any length.
    want(bool(_beat('R2-FRONTLOAD',
        "Where the nearer trunk has gone flat against the granite, the bark is dead.")),
        'R2 positive control did NOT fire on a nine-word subordinate opener')
    want(not _beat('R2-FRONTLOAD', "When it rains, we stop."),
        'R2 negative control fired on a short fronted clause')
    want(not _beat('R2-FRONTLOAD',
        "The bark is dead a hand either side of the place where the nearer trunk has gone "
        "flat against the granite and taken the moss off with it."),
        'R2 negative control fired on a 27-word sentence already in main-clause-first order')

    # R3: an interruption fires; a plain list of commas does not.
    want(bool(_beat('R3-INTERRUPT',
        "The tide table, which they issue to everyone at intake, has the slack twenty "
        "minutes late.")),
        'R3 positive control did NOT fire on a parenthetical wedged before the verb')
    want(not _beat('R3-INTERRUPT',
        "Meadow Reach, then Brackmarsh, then the Wilds, then the steppe, then the vale."),
        'R3 negative control fired on a plain comma-separated list')

    # R4 is a FLOOR. It must fail on telegrams and on a flattened corpus, and it must
    # NOT fail on a corpus of long sentences — there is no ceiling and never will be.
    _short = _mk(('a', ['Four in.', 'Up by four.', 'Right.', 'That is it.', 'No.', 'Two.'] * 4))
    r = _fired('R4-NOT-TELEGRAMS', _short)
    want(r and any('chopped' in x for x in r[0][2]),
         'R4 did NOT fail a corpus of fragments — the floor is gone, and this pass can now be '
         'passed by chopping every line up, which is the overcorrection Appendix I predicts')
    _flat = _mk(('a', ['The lambs are carrying weight this year at last.',
                       'I have the north stretch on my sheet every week.',
                       'Two coppers for the mesh and it is out the back.',
                       'Bed is a copper and breakfast is not included.'] * 4))
    r = _fired('R4-NOT-TELEGRAMS', _flat)
    want(r and any('flattened' in x for x in r[0][2]),
         'R4 did NOT fail a corpus with no long sentences at all')
    _long = _mk(('a', ['The levy comes off the buyer price and pays for the pilings and the '
                       'harbour wall and the second landing besides, which is why a thin year '
                       'in the channel is felt on the dock before it is felt anywhere else.',
                       'Short one.', 'Two coppers.',
                       'I have had the north stretch on my sheet every single week from the '
                       'thaw onward and I have never once missed a reading on it.']))
    want(not _fired('R4-NOT-TELEGRAMS', _long),
         'R4 fired on a corpus of LONG sentences — it has grown a ceiling, and Hank ruled '
         'explicitly that long sentences are fine when they are understandable')

    # The per-beat layer must also still bite. One known-bad sample for the two checks
    # whose zeros the rewrite is asserted to hold.
    want(bool(CHECKS[0][2]({}, ["A long enough set-up sentence to be a proper set-up here.", "That is the whole of it."])),
         'F3-EPIGRAM no longer fires on a structural closer')
    want(not CHECKS[0][2]({}, ["The post is down again by the lower gate and I have to go and see to it."]),
         'F3-EPIGRAM fires on an ordinary single-sentence beat')
    return f


def load(paths):
    entries, speakers = [], {}
    for p in paths:
        d = json.load(open(p))
        entries += d.get('entries', [])
        for s in d.get('speakers', []): speakers[s['id']] = s['name']
    return entries, speakers

def main(paths):
    bad = run_controls()
    if bad:
        print('CONTROL FAILURE — refusing to lint. The instrument is not trustworthy:')
        for b in bad: print(f'  ✗ {b}')
        return None                      # distinct from "the corpus is dirty"
    print(f'controls: {CONTROL_RUNS[0]} assertions green over {len(CORPUS_CHECKS)} '
          f'structural checks (each has a positive and a negative control)\n')

    entries, speakers = load(paths)
    counts = collections.Counter()
    shared = collections.defaultdict(set)
    print(f'{len(entries)} entries, {len({e["speaker"] for e in entries})} speakers\n')
    for e in entries:
        lines = [l['text'] for l in e['lines']] + [c['text'] for c in e.get('choices', [])]
        for code, desc, fn in CHECKS:
            for idx, frag in fn(e, lines):
                counts[code] += 1
                shared[code].add(e['speaker'])
                print(f'  {code:14} {e["id"]:38} L{idx}  {frag[:78]}')
    print('\n── per-beat summary (word-level; these are the checks that go blind) ──')
    for code, desc, _ in CHECKS:
        n, sp = counts[code], len(shared[code])
        flag = '   <-- shared by >2 speakers' if sp > CAP else ''
        print(f'{code:14} {n:4} hits across {sp:3} speakers   {desc}{flag}')
    beat_total = sum(counts.values())

    print('\n\n══ corpus structural layer (shape-level) ══')
    fails = 0
    for code, desc, fn in CORPUS_CHECKS:
        res = fn(entries)
        diagnostic = code == 'G13-NOUN-CARRIED'
        if not res:
            print(f'\n{code}  CLEAN   {desc}')
            continue
        print(f'\n{code}  {"REPORT" if diagnostic else "FAIL"}   {desc}')
        if not diagnostic: fails += 1
        for head, detail, ex in res:
            print(f'   {head}')
            if detail: print(f'     {detail}')
            for x in ex: print(f'       · {x}')
    print(f'\n\nTOTAL {beat_total} per-beat flags · {fails} corpus structural failures')
    return beat_total + fails

if __name__ == '__main__':
    if '--selftest' in sys.argv:
        bad = run_controls()
        print('\n'.join(f'✗ {b}' for b in bad) or 'all controls green')
        sys.exit(1 if bad else 0)
    n = main([a for a in sys.argv[1:] if not a.startswith('-')] or ['data/dialogue.json'])
    sys.exit(2 if n is None else (0 if n == 0 else 1))   # 2 = the linter itself is broken
