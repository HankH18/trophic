#!/usr/bin/env python3
"""Merge rewritten fragments back into data/dialogue.json, reporting every
structural change so nothing moves silently. Usage: merge.py <SP> [--write]"""
import json, sys, glob, os

SP = sys.argv[1]
WRITE = '--write' in sys.argv
orig = json.load(open('data/dialogue.json'))
by_id = {e['id']: e for e in orig['entries']}
order = [e['id'] for e in orig['entries']]

frags = sorted(glob.glob(f'{SP}/fragments/*.json'))
seen, new_entries, problems, structural = {}, [], [], []

for f in frags:
    name = os.path.basename(f)[:-5]
    try:
        data = json.load(open(f))
    except Exception as ex:
        problems.append(f'{name}: UNPARSEABLE — {ex}')
        continue
    for e in data.get('entries', []):
        eid = e.get('id')
        if not eid:
            problems.append(f'{name}: entry with no id'); continue
        if eid in seen:
            problems.append(f'{eid}: appears in both {seen[eid]} and {name}'); continue
        seen[eid] = name
        if eid not in by_id:
            new_entries.append((name, e)); continue
        o = by_id[eid]
        for k in ('speaker','node','kind','priority'):
            if o.get(k) != e.get(k):
                structural.append(f'{eid}: {k}  {o.get(k)!r} -> {e.get(k)!r}')
        if json.dumps(o.get('when',{}),sort_keys=True) != json.dumps(e.get('when',{}),sort_keys=True):
            structural.append(f'{eid}: when  {json.dumps(o.get("when",{}),sort_keys=True)} -> {json.dumps(e.get("when",{}),sort_keys=True)}')
        og = [c.get('goto') for c in o.get('choices',[])]
        ng = [c.get('goto') for c in e.get('choices',[])]
        if og != ng:
            structural.append(f'{eid}: choices.goto  {og} -> {ng}')
        ol = [sorted(k for k in l if k!='text') for l in o['lines']]
        nl = [sorted(k for k in l if k!='text') for l in e['lines']]
        if len(ol) != len(nl):
            structural.append(f'{eid}: line count {len(ol)} -> {len(nl)}')
        elif ol != nl:
            structural.append(f'{eid}: line condition keys {ol} -> {nl}')

missing = [i for i in order if i not in seen]
if missing: problems.append(f'MISSING {len(missing)} original entries: {missing[:12]}')

print(f'fragments: {len(frags)}   entries in: {len(seen)}   original: {len(order)}   new: {len(new_entries)}')
if new_entries:
    print('\n--- NEW ENTRIES ---')
    for n,e in new_entries: print(f'  + {e["id"]:44} ({n}) speaker={e.get("speaker")} kind={e.get("kind")}')
if structural:
    print(f'\n--- STRUCTURAL CHANGES ({len(structural)}) — each must be justified by the repair plan ---')
    for s in structural: print('  ~', s)
if problems:
    print(f'\n--- PROBLEMS ({len(problems)}) ---')
    for p in problems: print('  !', p)
    if not WRITE: print('\nnot writing.')

if WRITE and not problems:
    out = dict(orig)
    merged = [ (json.load(open(f'{SP}/fragments/{seen[i]}.json'))) for i in [] ]  # noqa
    cache = {os.path.basename(f)[:-5]: json.load(open(f)) for f in frags}
    idx = {e['id']: e for n,d in cache.items() for e in d.get('entries',[])}
    entries = [idx[i] for i in order if i in idx]
    tail = [e for n,e in new_entries]
    entries += tail
    out['entries'] = entries
    out['_counts'] = {'speakers': len(out['speakers']), 'entries': len(entries),
                      'lines': sum(len(e['lines']) for e in entries)}
    json.dump(out, open('data/dialogue.json','w'), indent=2, ensure_ascii=False)
    open('data/dialogue.json','a').write('\n')
    print(f"\nWROTE data/dialogue.json — {out['_counts']}")
elif WRITE:
    print('\nrefusing to write while problems exist.')
