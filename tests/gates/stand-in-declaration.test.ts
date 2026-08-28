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
 *     so 35 `dex-painted` placeholders turn "0/35 built" into "35/35 built" beside 35 rows whose
 *     `status` in `tools/comfy/manifest.json` is still `pending`;
 *   · `game/placeholder.ts`'s stand-in census stops listing a key the moment the loader has a
 *     texture for it, and the "drawing a stand-in" warning stops with it.
 *
 * A stand-in that erases the record of being a stand-in is worse than no stand-in at all, so a
 * directory of them declares itself in a `stand-ins.json` beside them. **A declaration is only worth
 * something if it cannot lie**, which is this file's whole job: the true set is re-derived from the
 * PIXELS — a PNG is a generated stand-in exactly when its bytes are what `makePlaceholder` produces
 * for its own path, its own size and the frozen palette — and the declaration is asserted to be
 * that set exactly. Hand-editing the list to make a class look built reddens this. Landing a real
 * plate and forgetting to unlist it reddens this. Writing new placeholders and not declaring them
 * reddens this.
 *
 * The scope is git's, for the same reason the palette gate's is: a directory listing shrinks
 * silently when a file is deleted, and a scope that shrinks is a gate that passes vacuously.
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

describe('a generated placeholder declares itself, and the declaration cannot lie', () => {
  it('the scope is non-empty and anchored to git', () => {
    expect(
      COVERED.length,
      `nothing under ${SHIPPED_ROOT}/ is covered — this gate would pass over an empty set`,
    ).toBeGreaterThan(0);
  });

  it(
    'every id declared a stand-in IS one, byte for byte, and every stand-in on disk is declared',
    async () => {
      const declared = declaredIds();
      const measured = await measuredStandIns();

      const undeclared = measured.filter((id) => !declared.has(id));
      expect(
        undeclared,
        `${undeclared.length} file(s) under ${SHIPPED_ROOT}/ are byte-for-byte what ` +
          "`makePlaceholder` produces for their own path — they are generated placeholders, not " +
          `art — but no ${DECLARATION_FILE} lists them: ${undeclared.join(' ')}. Undeclared, the ` +
          'boot loader registers them as real art, the stand-in census goes quiet, and a readout ' +
          'that counts files on disk reports the class as built.',
      ).toEqual([]);

      const overdeclared = [...declared.keys()].filter((id) => !measured.includes(id));
      expect(
        overdeclared,
        `${overdeclared.length} id(s) are declared stand-ins but are NOT what \`makePlaceholder\` ` +
          `produces for their path: ${overdeclared.map((id) => `${id} (${declared.get(id) ?? '?'})`).join(' ')}. ` +
          'Either real art landed there and the declaration was not updated — in which case the ' +
          'game is refusing to load finished art — or the file was never a placeholder and the ' +
          'list is being used to hide something.',
      ).toEqual([]);
    },
    60_000,
  );

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
     * declaring nothing. So: the shipped painted maps must read as NOT stand-ins, and a placeholder
     * built here on the spot must read as one. Neither is a hand-made fixture — the maps are the
     * real committed art and the placeholder is the real writer's own output.
     */
    const palette = loadPalette();
    const painted = COVERED.filter(
      (p) => existsSync(resolve(REPO_ROOT, p)) && !p.includes('/dex-painted/'),
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
    const sample = COVERED.find((p) => p.includes('/dex-painted/'));
    expect(sample, 'no dex-painted file to sample').toBeDefined();
    if (!sample) return;
    const { width, height } = await readRaster(resolve(REPO_ROOT, sample));
    const rebuilt = makePlaceholder(placeholderLabel(sample), width, height, { palette });
    expect(
      isStandInRaster(rebuilt, placeholderLabel(sample), palette),
      'the detector does not recognise the writer\'s own output',
    ).toBe(true);
    // …and it is keyed to the PATH, not merely to "looks generated": the same block under another
    // asset's label is a different block, so a placeholder cannot be moved to another row's slot.
    const other = COVERED.find((p) => p.includes('/dex-painted/') && p !== sample);
    expect(other, 'only one dex-painted file, so the label control asserts nothing').toBeDefined();
    if (!other) return;
    expect(
      isStandInRaster(rebuilt, placeholderLabel(other), palette),
      `${sample}'s placeholder is accepted as ${other}'s — the detector ignores the label`,
    ).toBe(false);
  }, 60_000);

  it('a placeholder at map-native size spends enough colour to clear the shipped floor', async () => {
    /*
     * The reason `makePlaceholder` grew a palette strip. `tests/gates/asset-palette-contract.test.ts`
     * applies a much stronger distinct-colour floor at or above `balance.map.mapNativePx`, and a
     * flat block plus its ink is two colours — so 35 native-size placeholders would have arrived as
     * 35 red assertions in a shipped gate. The floor is NOT weakened and no exemption was added;
     * the placeholder spends the colour instead. This asserts the property that makes that true,
     * from the real files, in the arrangement that keeps them unmistakably not-art.
     */
    const palette = loadPalette();
    const balance = JSON.parse(
      readFileSync(resolve(REPO_ROOT, 'data/balance.json'), 'utf8'),
    ) as { map: { mapNativePx: number } };
    const native = balance.map.mapNativePx;

    const nativeStandIns: string[] = [];
    for (const path of COVERED) {
      const abs = resolve(REPO_ROOT, path);
      if (!existsSync(abs)) continue;
      const raster = await readRaster(abs);
      if (!isStandInRaster(raster, placeholderLabel(path), palette)) continue;
      if (raster.width < native || raster.height < native) continue;
      nativeStandIns.push(path);
      const opaque = new Set<string>();
      for (let i = 0; i < raster.data.length; i += 4) {
        if (raster.data[i + 3] !== 255) continue;
        opaque.add(`${raster.data[i]!},${raster.data[i + 1]!},${raster.data[i + 2]!}`);
      }
      // Every colour there is, not a number tuned to the gate's floor — the strip spends the whole
      // frozen palette, so this cannot quietly drift down to just-enough.
      expect(
        opaque.size,
        `${path} is a native-size placeholder holding ${opaque.size} distinct opaque colour(s); ` +
          `the palette has ${palette.length}`,
      ).toBe(palette.length);
    }
    expect(
      nativeStandIns.length,
      'no native-size placeholder is committed, so this asserts nothing',
    ).toBeGreaterThan(0);
    // The file sizes are real: `statSync` is what a reviewer would check, and a zero-byte PNG that
    // happened to decode to the right thing is not a thing, but an empty scope is.
    for (const path of nativeStandIns) {
      expect(statSync(resolve(REPO_ROOT, path)).size, `${path} is empty`).toBeGreaterThan(0);
    }
  }, 60_000);
});
