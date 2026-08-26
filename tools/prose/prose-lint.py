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

def load(paths):
    entries, speakers = [], {}
    for p in paths:
        d = json.load(open(p))
        entries += d.get('entries', [])
        for s in d.get('speakers', []): speakers[s['id']] = s['name']
    return entries, speakers

def main(paths):
    entries, speakers = load(paths)
    counts = collections.Counter()
    shared = collections.defaultdict(set)
    print(f'{len(entries)} entries\n')
    for e in entries:
        lines = [l['text'] for l in e['lines']] + [c['text'] for c in e.get('choices', [])]
        for code, desc, fn in CHECKS:
            for idx, frag in fn(e, lines):
                counts[code] += 1
                shared[code].add(e['speaker'])
                print(f'  {code:14} {e["id"]:38} L{idx}  {frag[:78]}')
    print('\n── summary ──')
    for code, desc, _ in CHECKS:
        n, sp = counts[code], len(shared[code])
        flag = '   <-- shared by >2 speakers' if sp > 2 else ''
        print(f'{code:14} {n:4} hits across {sp:3} speakers   {desc}{flag}')
    print(f'\nTOTAL {sum(counts.values())} structural flags')
    return sum(counts.values())

if __name__ == '__main__':
    sys.exit(0 if main(sys.argv[1:] or ['data/dialogue.json']) == 0 else 1)
