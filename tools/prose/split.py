#!/usr/bin/env python3
"""Split data/dialogue.json into per-slice fragment files so parallel writers
get DISJOINT files. Each fragment holds the full entry objects for its slice."""
import json, os, sys, collections

SP = sys.argv[1]
d = json.load(open('data/dialogue.json'))
entries = d['entries']
speakers = {s['id']: s for s in d['speakers']}

SLICES = {
  'S1-maren':      lambda e: e['speaker'] == 'maren',
  'S2-wick-greaves': lambda e: e['speaker'] in ('wick', 'greaves'),
  'S3-gyms':       lambda e: e['speaker'] in ('maribel','odo','vesper','sable','noct'),
  'S4-brackwater': lambda e: e['speaker'] in ('sel','nessa'),
  'S5-cindershelf':lambda e: e['speaker'] in ('bram','gerta'),
  'S6-quest-npcs': lambda e: e['speaker'] in ('tolm','halder','pell','ives','orrin'),
  'S7-props':      lambda e: speakers.get(e['speaker'],{}).get('kind') == 'prop',
  'S8a-amb-hearthollow': lambda e: AMB(e) and HOME(e) in ('hearthollow','r1'),
  'S8b-amb-brackwater':  lambda e: AMB(e) and HOME(e) in ('brackwater','r2'),
  'S8c-amb-bowerdeep':   lambda e: AMB(e) and HOME(e) in ('bowerdeep','r3'),
  'S8d-amb-cindershelf': lambda e: AMB(e) and HOME(e) in ('cindershelf','r4'),
  'S8e-amb-duskhollow':  lambda e: AMB(e) and HOME(e) in ('duskhollow','r5','sanctum-approach','sanctum'),
  'S9-services':   lambda e: speakers.get(e['speaker'],{}).get('kind') == 'generic',
}

AMB  = lambda e: speakers.get(e['speaker'],{}).get('kind') == 'ambient'
HOME = lambda e: speakers.get(e['speaker'],{}).get('home', e.get('node',''))

assigned = {}
for name, pred in SLICES.items():
    for e in entries:
        if e['id'] in assigned:
            continue
        if pred(e):
            assigned[e['id']] = name

missing = [e['id'] for e in entries if e['id'] not in assigned]
if missing:
    print('UNASSIGNED:', missing, file=sys.stderr)
    sys.exit(1)

os.makedirs(f'{SP}/fragments', exist_ok=True)
counts = collections.Counter()
for name in SLICES:
    ids = [e for e in entries if assigned[e['id']] == name]
    counts[name] = (len(ids), sum(len(e['lines']) for e in ids))
    out = {
      '_slice': name,
      '_rules': ('Rewrite ONLY the human-readable text: every lines[].text and every choices[].text. '
                 'PRESERVE EXACTLY: entry id, speaker, node, kind, priority, the whole `when` object, '
                 'every line-level condition key other than `text`, and every choices[].goto. '
                 'You may ADD entries only if the repair plan tells you to, and then only with ids in '
                 'your own speaker namespace. Never delete an entry.'),
      'entries': ids,
    }
    json.dump(out, open(f'{SP}/fragments/{name}.json','w'), indent=1, ensure_ascii=False)

for name,(n,l) in counts.items():
    print(f'{name:18} {n:3} entries  {l:3} lines')
print(f'{"TOTAL":18} {sum(n for n,_ in counts.values()):3} entries  {sum(l for _,l in counts.values()):3} lines')
