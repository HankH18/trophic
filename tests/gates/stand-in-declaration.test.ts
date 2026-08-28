/**
 * tests/gates/stand-in-declaration.test.ts — A FILE EXISTING IS NOT A FILE BEING ART.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE CONTRADICTION THIS GATE EXISTS TO KEEP OUT
 * ─────────────────────────────────────────────────────────────────────────────
 * `tools/postprocess/run.ts placeholders` writes a generated block — flat colour, a border, the
 * asset id in a 3×5 bitmap font, and at map-native size a strip of the whole frozen palette — to
 * every manifest row's `finalFile` that has no raw art yet. That is deliberate and useful: Lane C
 * needs a file at every path the data references, and `tests/gates/asset-palette-contract.test.ts`
 * then decodes it like anything else the repo ships.
 *
 * What it also does is make the file EXIST, and existence is what several readouts count:
 *
 *   · the palette gate's coverage advisory prints `<class>  N/M built` off `existsSync(finalFile)`,
 *     so a class's worth of placeholders turns "0/N built" into "N/N built" beside N rows whose
 *     `status` in `tools/comfy/manifest.json` is still `pending` — measured on the 35 `dex-painted`
 *     plates, before build-doc §15's cut line C-4 removed that class;
 *   · `game/placeholder.ts`'s stand-in census stops listing a key the moment the loader has a
 *     texture for it, and the "drawing a stand-in" warning stops with it.
 *
 * A stand-in that erases the record of being a stand-in is worse than no stand-in at all, so they
 * declare themselves in a `stand-ins.json`. **A declaration is only worth something if it cannot
 * lie**, which is this file's whole job: the true set is re-derived from the PIXELS — a PNG is a
 * generated stand-in exactly when its bytes are what `makePlaceholder` produces for its own path,
 * its own size and the frozen palette — and the declaration is asserted to be that set exactly.
 * Hand-editing the list to make a class look built reddens this. Landing a real plate and forgetting
 * to unlist it reddens this. Writing new placeholders and not declaring them reddens this.
 *
 * The scope is git's, for the same reason the palette gate's is: a directory listing shrinks
 * silently when a file is deleted, and a scope that shrinks is a gate that passes vacuously.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  ⚠ THE DECLARATION IS NO LONGER "BESIDE THEM", AND THE CORPUS IS EMPTY TODAY
 * ─────────────────────────────────────────────────────────────────────────────
 * It used to live at `assets/final/dex-painted/stand-ins.json`, beside the 35 plates it listed, and
 * that was the ONLY one in the repository. Cut line C-4 deleted that class — so an unrelated ruling
 * was able to delete the whole placeholder register, this file's positive control, and the
 * non-vacuity instrument behind `tests/gates/dex-path-contract.test.ts`. The register is
 * repository-scoped and now lives at `assets/final/stand-ins.json`, where no single class can take
 * it; `tools/postprocess/run.ts` writes it in the same act that writes the PNGs, instead of it being
 * hand-maintained. A per-directory declaration still works — the glob and the walk both find one.
 *
 * With those 35 gone, NOTHING under `assets/final/` is a generated placeholder: 149 files, all
 * painted. That is a true statement and not a gap to be papered over, but it makes every assertion
 * about a committed placeholder VACUOUS. So the two controls below no longer borrow one from disk;
 * they build one through the real writer, for a real shipped path, and compare it against the real
 * painted file at that same path — same label, same size, so the detector's only input is the
 * PIXELS. That is a stronger control than the one it replaces, and it cannot go quiet again.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadPalette, REPO_ROOT } from '../../tools/postprocess/palette.ts';
import { readRaster } from '../../tools/postprocess/raster.ts';
import { isStandInRaster, placeholderLabel } from '../../tools/postprocess/placeholder.ts';

const SHIPPED_ROOT = 'assets/final';
/** The declaration a directory of generated placeholders carries. Named once. */
const DECLARATION_FILE = 'stand-ins.json';

const isPng = (p: string): boolean => p.toLowerCase().endsWith('.png');
const rel = (abs: string): string => relative(REPO_ROOT, abs).split('\\').join('/');

/** Every PNG git has committed under the shipping root — the half of the scope a delete cannot shrink. */
function committedShippedPngs(): string[] {
  let out: string;
  try {
    out = execFileSync('git', ['ls-files', '-z', '--', SHIPPED_ROOT], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    throw new Error(
      `stand-in-declaration: \`git ls-files -- ${SHIPPED_ROOT}\` failed (${String(e)}). This gate ` +
        'asks git what the repo ships so a DELETED asset still fails; it will not fall back to a ' +
        'directory listing, because that is the vacuous pass it exists to prevent.',
    );
  }
  return out.split('\0').filter((p) => p.length > 0 && isPng(p));
}

function walk(dir: string, keep: (name: string) => boolean): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(abs, keep));
    else if (entry.isFile() && keep(entry.name)) found.push(rel(abs));
  }
  return found;
}

/**
 * Collision masks are engine data at ink 0/255, not art and not placeholders, and they are excluded
 * the way `tests/gates/asset-palette-contract.test.ts` excludes them: from the `collisionMask` FIELD
 * in `data/nodes/*.json`, never from a `-mask` suffix. A suffix rule would quietly stop excluding
 * anything the day a mask is named differently, and the advisory below would then report engine data
 * in its "painted" column.
 */
function declaredMasks(): Set<string> {
  const dir = resolve(REPO_ROOT, 'data/nodes');
  const masks = new Set<string>();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const node = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { collisionMask?: string };
    if (typeof node.collisionMask === 'string') masks.add(node.collisionMask.replace(/^\.?\/+/, ''));
  }
  return masks;
}

const MASKS = declaredMasks();
const SHIPPED_ABS = resolve(REPO_ROOT, SHIPPED_ROOT);
const PRESENT_PNGS = existsSync(SHIPPED_ABS) ? walk(SHIPPED_ABS, isPng) : [];
const COVERED = [...new Set([...committedShippedPngs(), ...PRESENT_PNGS])]
  .filter((p) => !MASKS.has(p))
  .sort();
const DECLARATIONS = existsSync(SHIPPED_ABS)
  ? walk(SHIPPED_ABS, (name) => name === DECLARATION_FILE).sort()
  : [];

interface Declaration {
  standIns: string[];
}

/** Every id declared a stand-in, across every declaration file, with the file it came from. */
function declaredIds(): Map<string, string> {
  const out = new Map<string, string>();
  for (const path of DECLARATIONS) {
    const parsed = JSON.parse(readFileSync(resolve(REPO_ROOT, path), 'utf8')) as Declaration;
    expect(Array.isArray(parsed.standIns), `${path}: no standIns[] array`).toBe(true);
    for (const id of parsed.standIns) {
      expect(typeof id, `${path}: a standIns entry is not a string`).toBe('string');
      out.set(id, path);
    }
  }
  return out;
}

/** The truth, taken from the bytes: every covered PNG that IS a generated placeholder. */
async function measuredStandIns(): Promise<string[]> {
  const palette = loadPalette();
  const found: string[] = [];
  for (const path of COVERED) {
    const abs = resolve(REPO_ROOT, path);
    // A committed-but-absent file is the palette gate's red to raise, not this one's; skipping it
    // here would be a vacuous pass, so it is recorded as UNMEASURABLE and asserted below instead.
    if (!existsSync(abs)) continue;
    const raster = await readRaster(abs);
    if (isStandInRaster(raster, placeholderLabel(path), palette)) found.push(placeholderLabel(path));
  }
  return found.sort();
}

/**
 * The comparison this gate is. Pulled out of the test so it can be DRIVEN over synthetic sets —
 * with the real corpus empty, the shipped call below reconciles [] against [] and would pass while
 * proving nothing about the comparison itself.
 */
function reconcile(
  declared: ReadonlyMap<string, string>,
  measured: readonly string[],
): { undeclared: string[]; overdeclared: string[] } {
  return {
    undeclared: measured.filter((id) => !declared.has(id)),
    overdeclared: [...declared.keys()].filter((id) => !measured.includes(id)),
  };
}

const UNDECLARED_MESSAGE = (ids: readonly string[]): string =>
  `${ids.length} file(s) under ${SHIPPED_ROOT}/ are byte-for-byte what \`makePlaceholder\` ` +
  'produces for their own path — they are generated placeholders, not art — but no ' +
  `${DECLARATION_FILE} lists them: ${ids.join(' ')}. Undeclared, the boot loader registers them ` +
  'as real art, the stand-in census goes quiet, and a readout that counts files on disk reports ' +
  'the class as built.';

const OVERDECLARED_MESSAGE = (ids: readonly string[], from: ReadonlyMap<string, string>): string =>
  `${ids.length} id(s) are declared stand-ins but are NOT what \`makePlaceholder\` produces for ` +
  `their path: ${ids.map((id) => `${id} (${from.get(id) ?? '?'})`).join(' ')}. Either real art ` +
  'landed there and the declaration was not updated — in which case the game is refusing to load ' +
  'finished art — or the file was never a placeholder and the list is being used to hide something.';

describe('a generated placeholder declares itself, and the declaration cannot lie', () => {
  it('the scope is non-empty and anchored to git', () => {
    expect(
      COVERED.length,
      `nothing under ${SHIPPED_ROOT}/ is covered — this gate would pass over an empty set`,
    ).toBeGreaterThan(0);
    /*
     * …AND THE DECLARATION FILE ITSELF IS PRESENT. This is not decoration: the whole corpus is
     * empty today, so every reconciliation below compares [] with [], and a MISSING declaration
     * produces exactly the same [] as an empty one. Without this line, deleting
     * `assets/final/stand-ins.json` would be silently green — which is the failure that put the
     * register at the shipping root in the first place. `game/placeholder.ts` globs the same
     * basename, so a file the walk cannot see is a file the game cannot see.
     */
    expect(
      DECLARATIONS,
      `no ${DECLARATION_FILE} anywhere under ${SHIPPED_ROOT}/ — the register the game reads at ` +
        'build time is gone, and an absent declaration is indistinguishable from an empty one',
    ).not.toEqual([]);
  });

  it(
    'every id declared a stand-in IS one, byte for byte, and every stand-in on disk is declared',
    async () => {
      const declared = declaredIds();
      const measured = await measuredStandIns();
      const { undeclared, overdeclared } = reconcile(declared, measured);
      expect(undeclared, UNDECLARED_MESSAGE(undeclared)).toEqual([]);
      expect(overdeclared, OVERDECLARED_MESSAGE(overdeclared, declared)).toEqual([]);
    },
    60_000,
  );

  it('BINDS — the reconciliation reports both lies, over sets it is handed', () => {
    /*
     * NON-VACUITY FOR THE ASSERTION ABOVE, and it is required rather than nice: with no placeholder
     * committed anywhere, that test reconciles an empty declaration against an empty measurement.
     * Both directions are driven here through the SAME function, so a comparison that stopped
     * comparing could not hide behind an empty corpus.
     */
    const painted = 'creature-battle/battle-cindril-j-front';
    const placeholder = 'creature-battle/battle-cindril-a-front';

    // A placeholder on disk that no declaration lists.
    const a = reconcile(new Map(), [placeholder]);
    expect(a.undeclared).toEqual([placeholder]);
    expect(a.overdeclared).toEqual([]);
    expect(UNDECLARED_MESSAGE(a.undeclared)).toContain(placeholder);

    // A declaration naming a file the pixels say is art.
    const b = reconcile(new Map([[painted, 'assets/final/stand-ins.json']]), []);
    expect(b.overdeclared).toEqual([painted]);
    expect(b.undeclared).toEqual([]);
    expect(OVERDECLARED_MESSAGE(b.overdeclared, new Map([[painted, 'x']]))).toContain(painted);

    // …and agreement is silent, so the two above are the disagreement and not a checker that is
    // simply always red.
    expect(reconcile(new Map([[placeholder, 'x']]), [placeholder])).toEqual({
      undeclared: [],
      overdeclared: [],
    });
  });

  it('a declared stand-in is not registered as real art by the game', async () => {
    // The runtime half of the same statement, read off `game/placeholder.ts` itself rather than
    // asserted about it: the module globs the declarations at build time and refuses them.
    const { declaredStandInIds, hasRealAsset, isDeclaredStandIn, realAssetIds } = await import(
      '../../game/placeholder.ts'
    );
    const declared = declaredStandInIds();
    expect(
      declared.sort(),
      'game/placeholder.ts does not see the same declarations this gate reads off disk',
    ).toEqual([...declaredIds().keys()].sort());

    for (const id of declared) {
      expect(isDeclaredStandIn(id), `${id} is declared but the module says otherwise`).toBe(true);
      expect(
        hasRealAsset(id),
        `${id} is a generated placeholder, but hasRealAsset() calls it finished art — the boot ` +
          'loader would queue it and the game would draw a 1024² block squeezed into a 128² slot ' +
          'instead of its own legible stand-in',
      ).toBe(false);
      expect(realAssetIds(), `${id} is in the real-art census`).not.toContain(id);
    }
  });

  it('ADVISORY: what is actually painted, per shipping directory', async () => {
    const measured = new Set(await measuredStandIns());
    const byDir = new Map<string, { files: number; standIns: number }>();
    for (const path of COVERED) {
      const dir = path.slice(0, path.lastIndexOf('/'));
      const slot = byDir.get(dir) ?? { files: 0, standIns: 0 };
      slot.files += 1;
      if (measured.has(placeholderLabel(path))) slot.standIns += 1;
      byDir.set(dir, slot);
    }
    const lines = [...byDir.entries()]
      .sort()
      .map(
        ([dir, s]) =>
          `  ${dir.padEnd(30)} ${String(s.files).padStart(3)} file(s)   ` +
          `${String(s.files - s.standIns).padStart(3)} painted   ` +
          `${String(s.standIns).padStart(3)} generated stand-in(s)`,
      );
    console.log(
      `\nstand-in-declaration — what is under ${SHIPPED_ROOT}/, split by what it IS\n${lines.join('\n')}\n` +
        "  The palette gate's coverage advisory counts FILES and therefore says \"built\" for every\n" +
        '  row above whose count lands in the right-hand column. This is the same set, told apart.\n',
    );
    expect(byDir.size, `nothing under ${SHIPPED_ROOT}/ to report on`).toBeGreaterThan(0);
  });

  it('the measurement can tell the two apart — it is not answering yes to everything', async () => {
    /*
     * The control. A detector that said "stand-in" for every PNG would satisfy both halves above by
     * declaring everything, and a detector that said "no" to everything would satisfy them by
     * declaring nothing. So: the shipped painted art must read as NOT a stand-in, and a placeholder
     * must read as one.
     *
     * ⚠ THE POSITIVE HALF USED TO BORROW A COMMITTED `dex-painted` FILE, AND THERE IS NO LONGER ONE
     * TO BORROW — cut line C-4 deleted the only directory of placeholders in the repository. It is
     * built through the real writer instead, FOR A REAL SHIPPED PATH AT THAT PATH'S OWN SIZE, and
     * compared against the painted file that actually sits there. Same label, same dimensions, so
     * the only thing separating the two verdicts is the PIXELS — which is a sharper control than
     * the old one, where the yes-sample and the no-sample were different files.
     */
    const palette = loadPalette();
    const declared = declaredIds();
    // Derived from the declaration, not from a directory name: a rule keyed to `/dex-painted/`
    // stopped excluding anything the day that class was cut, and would have gone on looking correct.
    const painted = COVERED.filter(
      (p) => existsSync(resolve(REPO_ROOT, p)) && !declared.has(placeholderLabel(p)),
    );
    expect(
      painted.length,
      'no painted asset is committed, so this control asserts nothing at all',
    ).toBeGreaterThan(0);
    for (const path of painted) {
      const raster = await readRaster(resolve(REPO_ROOT, path));
      expect(
        isStandInRaster(raster, placeholderLabel(path), palette),
        `${path} is committed painted art, but the detector calls it a generated placeholder`,
      ).toBe(false);
    }

    const { makePlaceholder } = await import('../../tools/postprocess/placeholder.ts');
    const sample = painted[0];
    const other = painted[1];
    expect(sample, 'no shipped file to build a control placeholder for').toBeDefined();
    expect(other, 'only one shipped file, so the label control asserts nothing').toBeDefined();
    if (!sample || !other) return;

    const art = await readRaster(resolve(REPO_ROOT, sample));
    const rebuilt = makePlaceholder(placeholderLabel(sample), art.width, art.height, { palette });
    expect([rebuilt.width, rebuilt.height], 'the control is not the same size as the real file').toEqual([
      art.width,
      art.height,
    ]);
    expect(
      isStandInRaster(rebuilt, placeholderLabel(sample), palette),
      "the detector does not recognise the writer's own output",
    ).toBe(true);
    // The two verdicts differ on ONE input. The line above and the loop above ran the same label at
    // the same size over different bytes, so the detector is reading pixels and nothing else.
    expect(
      isStandInRaster(art, placeholderLabel(sample), palette),
      `${sample} is painted art at the same size and label, and the detector calls it generated`,
    ).toBe(false);
    // …and it is keyed to the PATH, not merely to "looks generated": the same block under another
    // asset's label is a different block, so a placeholder cannot be moved to another row's slot.
    expect(
      isStandInRaster(rebuilt, placeholderLabel(other), palette),
      `${sample}'s placeholder is accepted as ${other}'s — the detector ignores the label`,
    ).toBe(false);
  }, 60_000);

  it('a placeholder at map-native size spends enough colour to clear the shipped floor', async () => {
    /*
     * The reason `makePlaceholder` grew a palette strip. `tests/gates/asset-palette-contract.test.ts`
     * applies a much stronger distinct-colour floor at or above `balance.map.mapNativePx`, and a
     * flat block plus its ink is two colours — so a class's worth of native-size placeholders would
     * arrive as that many red assertions in a shipped gate. The floor is NOT weakened and no
     * exemption was added; the placeholder spends the colour instead.
     *
     * ⚠ WHAT MOVED, AND WHY IT IS NOT A WEAKENING. This used to require at least one committed
     * native-size placeholder and measure it. The 35 `dex-painted` plates were the only ones, and
     * cut line C-4 deleted them — so that floor is now unsatisfiable and, worse, the loop it guarded
     * would run zero times and pass. The property was never a property of those files: it is a
     * property of `makePlaceholder`, which is where it is now asserted, at exactly the size the
     * palette gate's stronger floor begins. The on-disk loop is KEPT and unweakened, so the day a
     * native-size placeholder is committed it is measured too — it simply no longer carries the
     * non-vacuity, because a committed file cannot.
     *
     * The map classes (`map-town`, `map-route`, `map-site`, `map-variant`) are all still generated
     * at this size with `fit: false`, so this is a live path and not a historical one.
     */
    const palette = loadPalette();
    const balance = JSON.parse(
      readFileSync(resolve(REPO_ROOT, 'data/balance.json'), 'utf8'),
    ) as { map: { mapNativePx: number } };
    const native = balance.map.mapNativePx;

    const distinctOpaque = (r: { data: Uint8Array | Uint8ClampedArray | number[] }): Set<string> => {
      const opaque = new Set<string>();
      for (let i = 0; i < r.data.length; i += 4) {
        if (r.data[i + 3] !== 255) continue;
        opaque.add(`${r.data[i]!},${r.data[i + 1]!},${r.data[i + 2]!}`);
      }
      return opaque;
    };

    // THE NON-VACUITY, from the writer rather than from the tree. A real shipped path's label, at
    // exactly the size the stronger floor starts at.
    const { makePlaceholder } = await import('../../tools/postprocess/placeholder.ts');
    const label = placeholderLabel(COVERED[0] ?? 'assets/final/maps/hearthollow.png');
    const built = makePlaceholder(label, native, native, { palette });
    expect([built.width, built.height], 'the control is not at the native size').toEqual([native, native]);
    expect(
      isStandInRaster(built, label, palette),
      'the writer\'s own native-size output is not recognised as a placeholder',
    ).toBe(true);
    expect(
      distinctOpaque(built).size,
      `a native-size placeholder holds ${distinctOpaque(built).size} distinct opaque colour(s); ` +
        `the palette has ${palette.length}`,
    ).toBe(palette.length);
    // …and the strip is what does it: the same block BELOW the native floor spends far less, so the
    // assertion above is about `swatchBandHeight` firing and not about placeholders in general.
    const small = makePlaceholder(label, native / 8, native / 8, { palette });
    expect(distinctOpaque(small).size).toBeLessThan(palette.length);

    // The committed half, unchanged in strength and empty today.
    const nativeStandIns: string[] = [];
    for (const path of COVERED) {
      const abs = resolve(REPO_ROOT, path);
      if (!existsSync(abs)) continue;
      const raster = await readRaster(abs);
      if (!isStandInRaster(raster, placeholderLabel(path), palette)) continue;
      if (raster.width < native || raster.height < native) continue;
      nativeStandIns.push(path);
      // Every colour there is, not a number tuned to the gate's floor — the strip spends the whole
      // frozen palette, so this cannot quietly drift down to just-enough.
      expect(
        distinctOpaque(raster).size,
        `${path} is a native-size placeholder holding ${distinctOpaque(raster).size} distinct ` +
          `opaque colour(s); the palette has ${palette.length}`,
      ).toBe(palette.length);
      // The file size is real: `statSync` is what a reviewer would check, and a zero-byte PNG that
      // happened to decode to the right thing is not a thing.
      expect(statSync(abs).size, `${path} is empty`).toBeGreaterThan(0);
    }
    console.log(
      `stand-in-declaration — ${nativeStandIns.length} committed native-size placeholder(s) measured` +
        `${nativeStandIns.length === 0 ? ' (none shipped; the writer is measured directly above)' : ''}`,
    );
  }, 60_000);
});
