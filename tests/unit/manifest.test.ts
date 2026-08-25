/**
 * tests/unit/manifest.test.ts — build-doc §10.4's "manifest seed-reuse enforcement", plus the
 * anti-drift gate that makes the §9.7 manifest a derivation of data/ rather than a parallel copy.
 *
 * THE NAMED TEST is the seed one, and it is written to prove a REFUSAL, not a preference: G5 and
 * §8.4 say "any asset regenerated must reuse its manifest seed unless the manifest entry is
 * versioned", so the tests below submit a different seed and require an exception. A gate that only
 * logs a warning is decoration.
 *
 * THE OTHER HALF is G2. `rows[]` is derived from data/species.json, data/gyms.json,
 * data/nodes/*.json and core/types.ts's PROP_KINDS; the committed manifest must equal a fresh
 * derivation, and the comparison is shown to be SENSITIVE (a nudged input changes the derivation)
 * so "they match" is evidence and not a tautology. That is what stops a creature, a gym leader or a
 * node from existing in the art pipeline without existing in the content data — and what makes the
 * reverse true too.
 *
 * One thing this file deliberately does NOT do: touch the network. Every assertion is against local
 * data. Comfy Cloud bills for failed jobs (DEVIATIONS-lane-b B-D8), and a test suite that can spend
 * credits will eventually spend them in CI.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import {
  BASE_GRAPH_PATH,
  CREDIT_GATE_ROWS,
  CreditGateError,
  MANIFEST_PATH,
  REPO_ROOT,
  SeedReuseError,
  artFormsOf,
  assertBatchApproved,
  assertSeedReuse,
  deriveRows,
  deriveSeed,
  encounterableLines,
  graphForRow,
  planBatch,
  rebuildRows,
  runBatch,
  seedForSubmit,
  selectRows,
  specOf,
  workflowHash,
  type ManifestFile,
  type ManifestRow,
} from '../../tools/comfy/comfy-batch.ts';
import { buildImg2ImgGraph, Img2ImgError, SupervisedGateError, runSmoke } from '../../tools/comfy/img2img.ts';
import type { Graph } from '../../tools/comfy/client.ts';
import { validateContent } from '../../core/schemas';
import { PROP_KINDS } from '../../core/types';
import { hashSeed } from '../../core/rng';

const content = validateContent();
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as ManifestFile;
const baseGraph = JSON.parse(readFileSync(BASE_GRAPH_PATH, 'utf8')) as Graph;
const rows = manifest.rows;
const byId = new Map(rows.map((r) => [r.id, r]));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const rowsOfClass = (c: string) => rows.filter((r) => r.class === c);

/* ════════════════════════════════════════════════════════════════════════════
 * manifest seed reuse — the named test (§10.4, G5, §8.4)
 * ════════════════════════════════════════════════════════════════════════════ */

describe('manifest seed-reuse enforcement (G5 / build-doc §8.4)', () => {
  it('a seed is a pure function of (id, version) — re-deriving cannot move it', () => {
    expect(deriveSeed('battle-fenmaw-e-front', 1)).toBe(deriveSeed('battle-fenmaw-e-front', 1));
    expect(deriveSeed('battle-fenmaw-e-front', 1)).toBe(hashSeed(1, 'battle-fenmaw-e-front'));
    expect(deriveSeed('battle-fenmaw-e-front', 1)).not.toBe(deriveSeed('battle-fenmaw-e-back', 1));
  });

  it('BLOCKS a reseed of an asset that has already been generated', () => {
    const row: ManifestRow = { ...byId.get('battle-fenmaw-e-front')!, status: 'raw', recordedSeed: 4069427169 };
    expect(() => assertSeedReuse(row, 999)).toThrow(SeedReuseError);
    expect(() => assertSeedReuse(row, 999)).toThrow(/reuse its manifest seed/);
    // …and permits the seed it was actually generated with.
    expect(() => assertSeedReuse(row, 4069427169)).not.toThrow();
  });

  it('the submit path uses the RECORDED seed, not whatever the row now derives', () => {
    const row: ManifestRow = { ...byId.get('battle-fenmaw-e-front')!, status: 'raw', recordedSeed: 12345, seed: 999 };
    expect(seedForSubmit(row)).toBe(12345);
  });

  it('a pending row has nothing to reuse yet, so its derived seed is used', () => {
    const row = byId.get('battle-fenmaw-e-front')!;
    expect(row.recordedSeed).toBeUndefined();
    expect(seedForSubmit(row)).toBe(row.seed);
  });

  it('a REBUILD that would move a recorded seed throws instead of writing it', () => {
    const m = clone(manifest);
    const target = m.rows.find((r) => r.id === 'battle-fenmaw-e-front')!;
    target.status = 'approved';
    target.recordedSeed = target.seed;
    // The usual culprit: something upstream changes the derivation for this row.
    m._concepts['Fenmaw'] = { text: 'a different animal entirely', source: 'sabotage' };
    // (the concept does not feed the seed, so force the collision the way a rename would)
    target.recordedSeed = target.seed + 1;
    expect(() => rebuildRows(m, content)).toThrow(SeedReuseError);
    expect(() => rebuildRows(m, content)).toThrow(/still at version 1/);
  });

  it('BLOCKS the quiet version too — a renamed row would drop a recorded seed on the floor', () => {
    const m = clone(manifest);
    const target = m.rows.find((r) => r.id === 'battle-fenmaw-e-front')!;
    target.status = 'approved';
    target.recordedSeed = target.seed;
    target.id = 'battle-fenmaw-elder-front'; // the rename a tidy-up would make
    expect(() => rebuildRows(m, content)).toThrow(SeedReuseError);
    expect(() => rebuildRows(m, content)).toThrow(/unreproducible/);
  });

  it('…and a renamed row that has generated NOTHING is free to be renamed', () => {
    const m = clone(manifest);
    m.rows.find((r) => r.id === 'battle-fenmaw-e-front')!.id = 'battle-fenmaw-elder-front';
    expect(() => rebuildRows(m, content)).not.toThrow();
  });

  it('bumping the row version IS the licensed escape, and it produces a different seed', () => {
    const m = clone(manifest);
    const target = m.rows.find((r) => r.id === 'battle-fenmaw-e-front')!;
    target.status = 'approved';
    target.recordedSeed = target.seed + 1;
    target.version = 2;
    const rebuilt = rebuildRows(m, content);
    const after = rebuilt.find((r) => r.id === 'battle-fenmaw-e-front')!;
    expect(after.seed).toBe(deriveSeed('battle-fenmaw-e-front', 1));
    expect(after.seed).not.toBe(deriveSeed('battle-fenmaw-e-front', 2));
    expect(after.recordedSeed).toBe(target.recordedSeed);
  });

  it('a rebuild preserves everything a run recorded', () => {
    const m = clone(manifest);
    const target = m.rows.find((r) => r.id === 'trainer-odo')!;
    Object.assign(target, {
      status: 'approved',
      recordedSeed: target.seed,
      workflowHash: 'deadbeefdeadbeef',
      timestamp: '2026-08-25T00:00:00.000Z',
      file: 'assets/raw/trainer-battle/trainer-odo.png',
      attempts: 2,
    });
    const after = rebuildRows(m, content).find((r) => r.id === 'trainer-odo')!;
    expect(after).toMatchObject({
      status: 'approved',
      workflowHash: 'deadbeefdeadbeef',
      timestamp: '2026-08-25T00:00:00.000Z',
      attempts: 2,
    });
  });

  it('the player rows pin the validated trial seed 42 (DEVIATIONS-lane-b B-D1)', () => {
    for (const r of rowsOfClass('player')) expect(r.seed).toBe(42);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * G13 — the credit gate refuses, it does not warn
 * ════════════════════════════════════════════════════════════════════════════ */

describe('credit gate (G13 / build-doc §9.1)', () => {
  it(`refuses a batch of ${CREDIT_GATE_ROWS}+ rows without --confirm`, () => {
    const plan = planBatch(rows.slice(0, CREDIT_GATE_ROWS), manifest);
    expect(plan.requiresConfirm).toBe(true);
    expect(() => assertBatchApproved(plan, false)).toThrow(CreditGateError);
    expect(() => assertBatchApproved(plan, true)).not.toThrow();
  });

  it('lets a smaller batch through — the gate is on scale, not on generation', () => {
    const plan = planBatch(rows.slice(0, CREDIT_GATE_ROWS - 1), manifest);
    expect(plan.requiresConfirm).toBe(false);
    expect(() => assertBatchApproved(plan, false)).not.toThrow();
  });

  it('says UNKNOWN rather than inventing a number while the per-image cost is unmeasured', () => {
    expect(manifest._credits.perImageCredits).toBeNull();
    const plan = planBatch(rows.slice(0, 30), manifest);
    expect(plan.projectedCredits).toBeNull();
    expect(plan.lines.join('\n')).toMatch(/UNKNOWN/);
    expect(plan.lines.join('\n')).toMatch(/never been measured/);
  });

  it('projects a real figure once someone measures one', () => {
    const m = clone(manifest);
    m._credits.perImageCredits = 1.5;
    m._credits.measuredFrom = 'dashboard 4197 -> 4183 over 9 images';
    const plan = planBatch(rows.slice(0, 30), m);
    expect(plan.projectedCredits).toBe(45);
    expect(plan.lines.join('\n')).toMatch(/~45/);
  });

  it('the whole manifest is far over the gate — nobody runs it by accident', () => {
    expect(planBatch(rows, manifest).requiresConfirm).toBe(true);
    expect(rows.length).toBeGreaterThan(CREDIT_GATE_ROWS);
  });

  it('selectRows skips finished work unless --force, so a resume is not a re-bill', () => {
    const m = clone(manifest);
    m.rows[0]!.status = 'approved';
    expect(selectRows(m, { force: false }).some((r) => r.id === m.rows[0]!.id)).toBe(false);
    expect(selectRows(m, { force: true }).some((r) => r.id === m.rows[0]!.id)).toBe(true);
    expect(selectRows(m, { force: false }).some((r) => r.status === 'failed' || r.status === 'pending')).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * G2 — rows[] is DERIVED from data/, and the check is sensitive
 * ════════════════════════════════════════════════════════════════════════════ */

describe('the manifest cannot drift from data/ (G2)', () => {
  it('the committed rows equal a fresh derivation', () => {
    const derived = deriveRows(manifest, content);
    expect(rows.map(specOf)).toEqual(derived);
  });

  it('BINDS — the comparison notices when the derivation inputs move', () => {
    const m = clone(manifest);
    m._concepts['Fenmaw'] = { text: 'a completely different animal', source: 'sabotage' };
    const derived = deriveRows(m, content);
    expect(rows.map(specOf)).not.toEqual(derived);
  });

  it('BINDS — a species removed from data/ removes its rows', () => {
    const trimmed = { ...content, species: content.species.filter((s) => s.id !== 'fenmaw-line') };
    const derived = deriveRows(manifest, trimmed);
    expect(derived.some((r) => r.origin.includes('fenmaw-line'))).toBe(false);
    expect(derived.length).toBeLessThan(rows.length);
  });

  it('a dex identity with no concept entry is a loud failure, not a blank prompt', () => {
    const m = clone(manifest);
    delete m._concepts['Fenmaw'];
    expect(() => deriveRows(m, content)).toThrow(/no concept for dex identity "Fenmaw"/);
  });

  it('a node with no _nodes entry is a loud failure', () => {
    const m = clone(manifest);
    delete m._nodes['r4'];
    expect(() => deriveRows(m, content)).toThrow(/manifest\._nodes has no entry for node "r4"/);
  });

  it('a gym leader with no _trainers entry is a loud failure', () => {
    const m = clone(manifest);
    delete m._trainers['sable'];
    expect(() => deriveRows(m, content)).toThrow(/no entry for gym leader "sable"/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §9.7 counts and shape
 * ════════════════════════════════════════════════════════════════════════════ */

describe('build-doc §9.7 asset counts', () => {
  it('150 creature battle sprites — 75 forms × front/back (DEVIATIONS D2, not §9.7\'s 154)', () => {
    const forms = content.species.reduce((n, s) => n + artFormsOf(s).length, 0);
    expect(forms).toBe(75);
    expect(rowsOfClass('creature-battle')).toHaveLength(150);
  });

  it('every aging line has 3 forms and every Ancient exactly 1 (bible §4)', () => {
    for (const line of content.species) {
      expect(artFormsOf(line).length, line.id).toBe(line.ancient ? 1 : 3);
    }
    expect(content.species.filter((s) => s.ancient)).toHaveLength(3);
  });

  it('every creature form has a front AND a back sprite, and nothing else does', () => {
    for (const line of content.species) {
      for (const stage of artFormsOf(line)) {
        const stem = `battle-${line.id.replace(/-line$/, '')}-${stage.toLowerCase()}`;
        expect(byId.has(`${stem}-front`), stem).toBe(true);
        expect(byId.has(`${stem}-back`), stem).toBe(true);
      }
    }
    expect(new Set(rowsOfClass('creature-battle').map((r) => r.view))).toEqual(new Set(['front', 'back']));
  });

  it('35 painted dex identities, one per named identity in species.json', () => {
    const dexIds = new Set(content.species.flatMap((s) => s.dexIds));
    expect(dexIds.size).toBe(35);
    expect(rowsOfClass('dex-painted')).toHaveLength(35);
    for (const id of dexIds) expect(byId.has(`dex-${id.toLowerCase()}`), id).toBe(true);
  });

  it('12 base maps, one per node file', () => {
    expect(rowsOfClass('map-town').length + rowsOfClass('map-route').length).toBe(content.nodes.length);
    expect(content.nodes.length).toBe(12);
  });

  it('28 year variants: slice nodes 2–6, everything else year 2 (§9.7 cap 30, cut line C-2)', () => {
    const variants = rowsOfClass('map-variant');
    expect(variants).toHaveLength(28);
    expect(variants.length).toBeLessThanOrEqual(30);
    for (const slice of ['hearthollow', 'r1', 'brackwater', 'r2']) {
      for (const year of [2, 3, 4, 5, 6]) expect(byId.has(`map-${slice}-y${year}`), `${slice}-y${year}`).toBe(true);
    }
    expect(byId.has('map-sanctum-y2')).toBe(true);
    expect(byId.has('map-sanctum-y3')).toBe(false);
  });

  it('one overworld mini per encounterable line — derived from node populations, not a list', () => {
    const lines = encounterableLines(content);
    expect(lines.length).toBe(24);
    expect(rowsOfClass('overworld-mini')).toHaveLength(lines.length);
    for (const l of lines) expect(byId.has(`mini-${l.id.replace(/-line$/, '')}`), l.id).toBe(true);
    // A line that appears in no node's populations gets no mini (the starters come from Maren, D3).
    expect(byId.has('mini-cindril')).toBe(false);
  });

  it('8 trainers: the 6 leaders from data/gyms.json plus Wick and Maren (bible §8)', () => {
    expect(rowsOfClass('trainer-battle')).toHaveLength(8);
    for (const g of content.gyms) expect(byId.has(`trainer-${g.id}`), g.id).toBe(true);
    expect(byId.has('trainer-wick')).toBe(true);
    expect(byId.has('trainer-maren')).toBe(true);
  });

  it('props are derived from core/types.ts PROP_KINDS, so they match the node schema', () => {
    expect(rowsOfClass('prop')).toHaveLength(PROP_KINDS.length);
    for (const kind of PROP_KINDS) expect(byId.has(`prop-${kind}`), kind).toBe(true);
  });

  it('the player ships 3 statics and the §9.6 walk frames', () => {
    expect(rowsOfClass('player')).toHaveLength(9);
    for (const v of ['front', 'back', 'side']) expect(byId.get(`player-${v}`)!.mode).toBe('txt2img');
    for (const v of ['front-step-left', 'side-step-right']) expect(byId.get(`player-${v}`)!.mode).toBe('img2img');
  });

  it('every row carries the §9.7 fields, and every id is unique', () => {
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) {
      expect(r.id, JSON.stringify(r)).toBeTruthy();
      expect(manifest.classes[r.class], r.id).toBeTruthy();
      expect(r.subject.length, r.id).toBeGreaterThan(4);
      expect(r.view, r.id).toBeTruthy();
      expect(Number.isInteger(r.seed), r.id).toBe(true);
      expect(r.targetSize, r.id).toMatch(/^\d+x\d+$/);
      expect(['pending', 'raw', 'final', 'approved', 'failed']).toContain(r.status);
      expect(r.origin.length, r.id).toBeGreaterThan(4);
    }
  });

  it('nothing claims to be generated that is not — and the one that does has a file on disk', () => {
    const done = rows.filter((r) => r.status !== 'pending');
    // Gate B0 passed, so exactly one row is real: the approved player front static.
    expect(done.map((r) => r.id)).toEqual(['player-front']);
    for (const r of done) {
      expect(r.recordedSeed, r.id).toBeDefined();
      expect(r.file, r.id).toBeTruthy();
      expect(existsSync(resolve(REPO_ROOT, r.file!)), r.file).toBe(true);
      expect(createHash('sha256').update(readFileSync(resolve(REPO_ROOT, r.file!))).digest('hex')).toBe(r.sha256);
    }
    for (const r of rows) {
      if (r.status === 'pending') expect(r.recordedSeed === undefined && r.file === undefined, r.id).toBe(true);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The seams that bind the manifest to the rest of the repo
 * ════════════════════════════════════════════════════════════════════════════ */

describe('manifest ↔ data/ seams', () => {
  it("a map row's destination IS the node file's own mapAsset — closing the typo hole", () => {
    // LANE-A-STATUS §4: "a typo in a mapAsset path will not be caught by any Lane A test."
    for (const node of content.nodes) {
      expect(byId.get(`map-${node.id}`)!.finalFile, node.id).toBe(node.mapAsset);
    }
  });

  it('a year variant is img2img off the node\'s own base map, at the balance denoise', () => {
    for (const r of rowsOfClass('map-variant')) {
      const node = content.nodes.find((n) => r.id.startsWith(`map-${n.id}-y`));
      expect(node, r.id).toBeTruthy();
      expect(r.mode).toBe('img2img');
      expect(r.initImage).toBe(node!.mapAsset);
      expect(r.denoise).toBe(content.balance.overlayDiff.denoiseStart);
      expect(r.gate, r.id).toMatch(/overlay-diff/);
    }
  });

  it('yearVariants in data/nodes/*.json is still empty — G4 says nothing enters it unmeasured', () => {
    for (const node of content.nodes) expect(Object.keys(node.yearVariants), node.id).toHaveLength(0);
  });

  it('class target sizes that have a balance source match it (deviation LB-M4)', () => {
    const map = content.balance.map;
    for (const cls of ['player', 'npc-static']) {
      expect(manifest.classes[cls]!.targetW, cls).toBe(map.playerSpriteW);
      expect(manifest.classes[cls]!.targetH, cls).toBe(map.playerSpriteH);
    }
    for (const cls of ['map-town', 'map-route', 'map-variant']) {
      expect(manifest.classes[cls]!.targetW, cls).toBe(map.mapNativePx);
      expect(manifest.classes[cls]!.targetH, cls).toBe(map.mapNativePx);
    }
    expect(manifest.classes['prop']!.targetW).toBe(map.propInteractionRadiusDefault);
    // The two §9.3 art-only sizes have no balance home; they are pinned here so a drift is visible.
    expect(manifest.classes['creature-battle']!.targetW).toBe(96);
    expect(manifest.classes['overworld-mini']!.targetW).toBe(32);
  });

  it('the ui frames fit inside the virtual screen (balance.map 480×320)', () => {
    for (const r of rowsOfClass('ui-frame')) {
      const [w, h] = r.targetSize.split('x').map(Number) as [number, number];
      expect(w, r.id).toBeLessThanOrEqual(content.balance.map.virtualWidth);
      expect(h, r.id).toBeLessThanOrEqual(content.balance.map.virtualHeight);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §8.4 style lock — the prompt strings themselves
 * ════════════════════════════════════════════════════════════════════════════ */

describe('style lock (build-doc §8.4 / §9.2 / L6)', () => {
  const FROZEN_NEGATIVE = 'low quality, bad anatomy, extra digits, missing digits, extra limbs, missing limbs';

  it('every row carries the frozen negative prompt verbatim', () => {
    for (const r of rows) expect(r.negative.startsWith(FROZEN_NEGATIVE), r.id).toBe(true);
  });

  it('only the player class extends it, and only with the cape ban (B-D7)', () => {
    for (const r of rows) {
      if (r.class === 'player') expect(r.negative).toBe(`${FROZEN_NEGATIVE}, cape, cloak, hood, mantle`);
      else expect(r.negative, r.id).toBe(FROZEN_NEGATIVE);
    }
  });

  it("player-front's prompt is byte-identical to the gate-B0 approved row (G5 / §8.4)", () => {
    // The protagonist's identity is a prompt + a seed. If this drifts, "regenerating the player"
    // silently produces a different character — which is the exact failure G5 names.
    const b0 = JSON.parse(readFileSync(resolve(REPO_ROOT, 'tools/comfy/manifest-b0.json'), 'utf8')) as {
      rows: Array<{ id: string; subject: string; seed: number; sha256?: string; status: string }>;
    };
    const approved = b0.rows.find((r) => r.id === 'player-front')!;
    expect(approved.status).toBe('approved');
    const mine = byId.get('player-front')!;
    expect(mine.prompt).toBe(approved.subject);
    expect(mine.seed).toBe(approved.seed);
    expect(mine.sha256).toBe(approved.sha256);
  });

  it('every player prompt carries the L6 ELEMENTS and never the words L6 forbids (LB-M8)', () => {
    // L6 asks for its string verbatim; the approved prompt elaborates it (deviation LB-M8), so the
    // binding check is on the elements, plus the byte-equality test above.
    expect(manifest._player.l6Verbatim).toBe('green shirt, ranger cap with star badge, leather satchel, walking boots');
    for (const r of rowsOfClass('player')) {
      for (const element of ['green shirt', 'ranger cap', 'star badge', 'leather satchel', 'walking boots']) {
        expect(r.prompt.includes(element), `${r.id} is missing "${element}"`).toBe(true);
      }
      expect(/\bcape\b|\bcloak\b/i.test(r.prompt), r.id).toBe(false);
    }
  });

  it('every pixel class uses the validated trial skeleton, not §9.2\'s documented one (B-D9)', () => {
    for (const r of rows) {
      if (r.class === 'dex-painted' || r.class === 'map-variant') continue;
      expect(r.prompt.includes('retro 90s handheld RPG style'), r.id).toBe(true);
      expect(r.prompt.includes('monster-taming'), r.id).toBe(false);
    }
  });

  it('every sprite prompt asks for the flat background the post-process assumes', () => {
    for (const r of rows) {
      if (!manifest.classes[r.class]!.postprocess.removeBackground) continue;
      expect(r.prompt.includes('plain white background'), r.id).toBe(true);
    }
  });

  it('the painted dex class uses §9.4\'s prompt direction verbatim', () => {
    for (const r of rowsOfClass('dex-painted')) {
      expect(r.prompt.startsWith('painted storybook illustration, natural-history field-guide style, ')).toBe(true);
      expect(r.prompt.endsWith(', soft watercolor texture, muted palette')).toBe(true);
    }
  });

  it("Fenmaw's prompts repeat the gharial snout — §9.2's named fidelity failure", () => {
    for (const r of rows.filter((x) => x.id.includes('fenmaw'))) {
      expect((r.prompt.match(/gharial/g) ?? []).length, r.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('no prompt mentions the class reference image that regressed that anatomy (B-D6)', () => {
    for (const r of rows) expect(r.initImage ?? '').not.toMatch(/creature-croc/);
  });

  it('every untrialed class is flagged as such so nobody scales it up blind', () => {
    const untrialled = Object.entries(manifest.classes).filter(([, c]) => !c.trialled).map(([n]) => n);
    expect(untrialled.sort()).toEqual(['dex-painted', 'map-route', 'map-variant', 'prop', 'ui-frame']);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Graph injection — what actually gets submitted
 * ════════════════════════════════════════════════════════════════════════════ */

describe('graph injection', () => {
  it('a txt2img row injects prompt, negative and seed and nothing else', () => {
    const row = byId.get('battle-cindril-j-front')!;
    const { graph, seed } = graphForRow(row, baseGraph);
    expect(seed).toBe(row.seed);
    const ks = Object.values(graph).find((n) => n!.class_type === 'KSampler')!;
    expect(ks.inputs.seed).toBe(row.seed);
    expect(ks.inputs.steps).toBe(8);
    expect(ks.inputs.cfg).toBe(1);
    expect(ks.inputs.sampler_name).toBe('res_multistep');
    expect(ks.inputs.scheduler).toBe('simple');
    expect(ks.inputs.denoise).toBe(1);
    const texts = Object.values(graph)
      .filter((n) => n!.class_type === 'CLIPTextEncode')
      .map((n) => n!.inputs.text);
    expect(texts).toContain(row.prompt);
    expect(texts).toContain(row.negative);
    // the base graph on disk is untouched
    expect(Object.values(baseGraph).find((n) => n!.class_type === 'KSampler')!.inputs.seed).toBe(42);
  });

  it('the workflow hash is stable and sensitive — it is what §9.1 records per row', () => {
    const row = byId.get('battle-cindril-j-front')!;
    const a = graphForRow(row, baseGraph);
    const b = graphForRow(row, baseGraph);
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toHaveLength(16);
    const other = graphForRow(byId.get('battle-cindril-j-back')!, baseGraph);
    expect(other.hash).not.toBe(a.hash);
    expect(workflowHash(a.graph)).toBe(a.hash);
  });

  it('an img2img row refuses to build without an uploaded init image', () => {
    expect(() => graphForRow(byId.get('map-r1-y2')!, baseGraph)).toThrow(/needs an uploaded init image/);
  });

  it('the img2img graph keeps the validated model chain and only swaps the latent source', () => {
    const row = byId.get('map-r1-y2')!;
    const { graph } = graphForRow(row, baseGraph, 'r1.png');
    const classes = Object.values(graph).map((n) => n!.class_type);
    expect(classes).toContain('LoadImage');
    expect(classes).toContain('VAEEncode');
    expect(classes).not.toContain('EmptySD3LatentImage');
    // Everything §9.2 locks is byte-identical to the trial graph.
    for (const cls of ['UNETLoader', 'CLIPLoader', 'VAELoader', 'ModelSamplingAuraFlow']) {
      const before = Object.values(baseGraph).find((n) => n!.class_type === cls)!;
      const after = Object.values(graph).find((n) => n!.class_type === cls)!;
      expect(after.inputs, cls).toEqual(before.inputs);
    }
    const ks = Object.values(graph).find((n) => n!.class_type === 'KSampler')!;
    expect(ks.inputs.denoise).toBe(row.denoise);
    expect(ks.inputs.steps).toBe(8);
    const encode = Object.entries(graph).find(([, n]) => n!.class_type === 'VAEEncode')!;
    expect(ks.inputs.latent_image).toEqual([encode[0], 0]);
    const load = Object.entries(graph).find(([, n]) => n!.class_type === 'LoadImage')!;
    expect(load[1]!.inputs.image).toBe('r1.png');
  });

  it('img2img refuses denoise 1.0 — that is txt2img wearing a costume', () => {
    expect(() => buildImg2ImgGraph(baseGraph, { initImageName: 'x.png', denoise: 1 })).toThrow(Img2ImgError);
    expect(() => buildImg2ImgGraph(baseGraph, { initImageName: 'x.png', denoise: 0 })).toThrow(Img2ImgError);
    expect(() => buildImg2ImgGraph(baseGraph, { initImageName: '', denoise: 0.35 })).toThrow(/init image/);
  });

  it('the untrialed img2img path refuses to be pointed at a batch (SUPERVISED gate)', async () => {
    await expect(
      runSmoke({ initImagePath: 'x.png', outPath: 'y.png', positive: '', negative: '', seed: 1, denoise: 0.35, images: 28 }),
    ).rejects.toThrow(SupervisedGateError);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The runner — §9.1's retry/flag/record loop, against a stub client.
 *
 * No network, ever: Comfy Cloud bills for failed jobs (B-D8), so a suite that can reach the API
 * will eventually spend credits in CI. The stub is the whole point — the behaviour under test is
 * the runner's, not the cloud's.
 * ════════════════════════════════════════════════════════════════════════════ */

type StubBehaviour = (id: string, call: number) => 'ok' | Error;

function stubClient(behaviour: StubBehaviour) {
  const calls: string[] = [];
  const perRow = new Map<string, number>();
  return {
    calls,
    client: {
      async run(graph: Graph) {
        // Key on the full positive prompt: front/back rows of the same creature agree for the
        // first couple of hundred characters, so a truncated key silently merges them.
        const id = String(
          Object.values(graph).find((n) => n!.class_type === 'CLIPTextEncode')!.inputs.text ?? '',
        );
        calls.push(id);
        const n = (perRow.get(id) ?? 0) + 1;
        perRow.set(id, n);
        const verdict = behaviour(id, n);
        if (verdict !== 'ok') throw verdict;
        return { '9': { images: [{ filename: 'out.png' }] } };
      },
      async saveAll(_outputs: unknown, destFor: (img: { filename: string }, i: number) => string) {
        // Write a real file: the runner hashes what it saved, and a stub that only returns a path
        // would let a broken download look like a success.
        const dest = destFor({ filename: 'out.png' }, 0);
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        return [dest];
      },
    },
  };
}

const ENV = { host: 'https://example.invalid', key: 'test', maxConcurrency: 2 };

describe('the runner (build-doc §9.1)', () => {
  const pick = (n: number): ManifestRow[] => clone(rowsOfClass('creature-battle').slice(0, n));
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'trophic-runner-'));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('records {file, seed, workflowHash, timestamp} back onto the row on success', async () => {
    const { client } = stubClient(() => 'ok');
    const batch = pick(3);
    const report = await runBatch(manifest, batch, client as never, baseGraph, ENV, {
      confirmed: false,
      root,
      log: () => {},
      now: () => '2026-08-25T12:00:00.000Z',
    });
    expect(report).toMatchObject({ attempted: 3, succeeded: 3 });
    for (const row of batch) {
      expect(row.status).toBe('raw');
      expect(row.recordedSeed).toBe(row.seed);
      expect(row.workflowHash).toHaveLength(16);
      expect(row.timestamp).toBe('2026-08-25T12:00:00.000Z');
      expect(row.file).toBe(`assets/raw/creature-battle/${row.id}.png`);
      expect(row.flaggedForReview).toBe(false);
    }
  });

  it('retries twice and then flags for supervised review — it does not retry forever', async () => {
    const { client, calls } = stubClient(() => new Error('cloud said no'));
    const batch = pick(1);
    const report = await runBatch(manifest, batch, client as never, baseGraph, ENV, {
      confirmed: false,
      root,
      concurrency: 1,
      log: () => {},
    });
    expect(calls).toHaveLength(3); // 1 try + 2 retries
    expect(batch[0]!.attempts).toBe(3);
    expect(batch[0]!.status).toBe('failed');
    expect(batch[0]!.flaggedForReview).toBe(true);
    expect(batch[0]!.reviewReason).toMatch(/cloud said no/);
    expect(report.flagged).toHaveLength(1);
  });

  it('a row that fails once and then works is recorded clean, with no lingering flag', async () => {
    const { client } = stubClient((_id, call) => (call === 1 ? new Error('transient') : 'ok'));
    const batch = pick(1);
    await runBatch(manifest, batch, client as never, baseGraph, ENV, { confirmed: false, root, concurrency: 1, log: () => {} });
    expect(batch[0]!.status).toBe('raw');
    expect(batch[0]!.attempts).toBe(2);
    expect(batch[0]!.flaggedForReview).toBe(false);
    expect(batch[0]!.reviewReason).toBeUndefined();
  });

  it('a REGENERATION submits the recorded seed, not the derived one — G5 on the live path', async () => {
    const { client } = stubClient(() => 'ok');
    const batch = pick(1);
    const frozen = batch[0]!.seed + 7; // as if this asset had been generated before the row moved
    batch[0]!.status = 'approved';
    batch[0]!.recordedSeed = frozen;
    await runBatch(manifest, batch, client as never, baseGraph, ENV, { confirmed: false, root, concurrency: 1, log: () => {} });
    expect(batch[0]!.recordedSeed).toBe(frozen);
    const submitted = graphForRow(batch[0]!, baseGraph);
    expect(submitted.seed).toBe(frozen);
    expect(submitted.seed).not.toBe(deriveSeed(batch[0]!.id, batch[0]!.version));
  });

  it('G13 refuses BEFORE anything is submitted', async () => {
    const { client, calls } = stubClient(() => 'ok');
    await expect(
      runBatch(manifest, pick(CREDIT_GATE_ROWS), client as never, baseGraph, ENV, { confirmed: false, root, log: () => {} }),
    ).rejects.toThrow(CreditGateError);
    expect(calls).toHaveLength(0);
  });

  it('--dry-run prints the plan and submits nothing', async () => {
    const { client, calls } = stubClient(() => 'ok');
    const lines: string[] = [];
    const batch = pick(4);
    const report = await runBatch(manifest, batch, client as never, baseGraph, ENV, {
      confirmed: true,
      root,
      dryRun: true,
      log: (l) => lines.push(l),
    });
    expect(calls).toHaveLength(0);
    expect(report.attempted).toBe(0);
    expect(batch.every((r) => r.status === 'pending')).toBe(true);
    expect(lines.filter((l) => l.includes('[dry]'))).toHaveLength(4);
  });

  it('runs the whole selection under the configured concurrency', async () => {
    const { client, calls } = stubClient(() => 'ok');
    const batch = pick(7);
    const report = await runBatch(manifest, batch, client as never, baseGraph, ENV, {
      confirmed: false,
      root,
      concurrency: 3,
      log: () => {},
    });
    expect(report.succeeded).toBe(7);
    expect(calls).toHaveLength(7);
    expect(new Set(calls).size).toBe(7);
  });
});
