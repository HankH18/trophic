/**
 * tools/comfy/player-views.ts — back / side player statics from the APPROVED FRONT as init image.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 * The first pass at the back/side statics used txt2img (`b0-views.ts`, `b0-views2.ts`): ten
 * independent generations sharing only a prompt and seed 42. Hank rejected both selections and
 * named five distinct defects — the star badge appeared on the BACK of the cap, the render read as
 * roughly twice the front's pixel density, the satchel sat elsewhere, the belt loops changed
 * colour, the boots grew a cuff, and on the side view the face was a different face entirely.
 *
 * Four of the five reproduce as measurements (see `_acceptance.json`). The density one does NOT
 * reproduce as a global density: the apparent art-pixel pitch is 4px on both the front and
 * `back-e`, and the 32x48 component count is 194 vs 194. What actually differs is the FEATURE
 * INVENTORY — `back-e`'s boot rows carry 10 distinct swatches against the front's 4, which is the
 * cuff, and its belt rows pick up `c00`, `c06`, `c16` and `c03` the front does not have. That reads
 * as "denser" without being denser. Recorded rather than smoothed over.
 *
 * (Those counts are quoted as SLOT IDS and were re-measured after the T-15 palette re-freeze; the
 * numbers they replace were the B0 palette's. A hex quoted in a comment goes stale silently for the
 * same reason a hex in code does — see SWATCH_ID below for the defect that cost.)
 *
 * None of it is a prompt bug. txt2img re-invents the character inside the prompt's constraints on
 * every call; sub-feature placement and the feature inventory are free variables. So this file does
 * the only thing that can hold identity: it uses `assets/approved-trials/player-APPROVED.png`
 * itself as the init latent (img2img, build-doc §9.5/§9.6 method) and varies ONLY the view clause.
 *
 * The graph comes from `buildImg2ImgGraph` in `img2img.ts`, which grafts LoadImage -> VAEEncode onto
 * the VALIDATED txt2img graph so every other parameter is byte-identical to the trial that produced
 * the approved art. `img2img-graph.json` is that graph materialised for the record.
 *
 * Comfy Cloud has no `/api/history`. Outputs arrive ONLY over the WebSocket during execution.
 * `ComfyClient.run` opens the socket before submitting; this file never bypasses it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMMANDS
 * ─────────────────────────────────────────────────────────────────────────────
 *   npx tsx tools/comfy/player-views.ts emit-graph
 *       Materialise tools/comfy/img2img-graph.json from the validated base. No network, no credits.
 *
 *   npx tsx tools/comfy/player-views.ts sweep --views=back,side --denoise=0.3,0.4,0.5
 *       Upload the approved front once, then one generation per (view x denoise). Prints the
 *       generation count. G13: the whole B0-views task is capped at 20 generations; 14 were spent.
 *
 *   npx tsx tools/comfy/player-views.ts derive
 *       Build the SHIPPING back/side sprites and print the acceptance bar. No network, no credits,
 *       byte-reproducible. This is the path that won — see the DERIVATION block below for why.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ComfyClient, loadEnv, type Graph } from './client.ts';
import { buildImg2ImgGraph, uploadInitImage } from './img2img.ts';
import { loadPalette, type PaletteRgb } from '../postprocess/palette.ts';
import balanceJson from '../../data/balance.json' with { type: 'json' };
import { trimBackground, nearestResample, quantize, removeFlatBackground } from '../postprocess/steps.ts';
import { backgroundForClass } from '../postprocess/chain.ts';

export const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

const BASE_GRAPH = resolve(REPO_ROOT, 'tools/comfy/pixel-txt2img-api.json');
const INIT_IMAGE = resolve(REPO_ROOT, 'assets/approved-trials/player-APPROVED.png');
const OUT_DIR = resolve(REPO_ROOT, 'assets/raw/player/img2img');

/**
 * The locked player identity string (manifest-b0 row `player-front`, build-doc L6 + §8.4), split at
 * its view clause. Everything either side of the clause is verbatim — that is the whole point.
 */
export const PROMPT_HEAD =
  'pixel art overworld character sprite, retro 90s handheld RPG style, young field warden ' +
  'protagonist wearing a green shirt, brown shorts, a peaked green ranger cap with a small yellow ' +
  'star badge, a leather satchel on a shoulder strap, and brown walking boots, ';
export const PROMPT_TAIL =
  ', full body, compact youthful proportions, large head, short limbs, plain white background, ' +
  'crisp clean pixel edges, 2D game asset';
/** The approved front's own view clause — substituting this is the only permitted variation. */
export const FRONT_VIEW_CLAUSE = 'standing facing forward';

/** Player-class negative: cape/cloak/hood/mantle appended for this class only, because L6 forbids a
 *  cape and the style reference has one. Every other class uses the frozen negative unchanged. */
export const NEGATIVE =
  'low quality, bad anatomy, extra digits, missing digits, extra limbs, missing limbs, ' +
  'cape, cloak, hood, mantle';

export const SEED = 42; // G5: the validated trial seed. Never varies without versioning the manifest row.

export const VIEW_CLAUSES: Record<string, string> = {
  back: 'seen from directly behind, facing away from the viewer',
  side: 'side view, facing right, full side profile',
};

export function promptFor(view: string): string {
  const clause = view === 'front' ? FRONT_VIEW_CLAUSE : VIEW_CLAUSES[view];
  if (!clause) throw new Error(`no view clause for "${view}" (have: front, ${Object.keys(VIEW_CLAUSES).join(', ')})`);
  return PROMPT_HEAD + clause + PROMPT_TAIL;
}

/** Assert the front prompt this file reconstructs is still byte-identical to the manifest row. */
export async function assertPromptMatchesManifest(): Promise<void> {
  const manifest = JSON.parse(
    await readFile(resolve(REPO_ROOT, 'tools/comfy/manifest-b0.json'), 'utf8'),
  ) as { rows: Array<{ id: string; subject?: string; negative?: string }> };
  const front = manifest.rows.find((r) => r.id === 'player-front');
  if (!front) throw new Error('manifest-b0.json has no player-front row');
  if (front.subject !== promptFor('front')) {
    throw new Error(
      'PROMPT DRIFT: the reconstructed front prompt does not match manifest row player-front.\n' +
        `  manifest: ${front.subject}\n  here    : ${promptFor('front')}`,
    );
  }
  if (front.negative !== NEGATIVE) throw new Error('NEGATIVE DRIFT vs manifest row player-front');
}

export async function emitGraph(denoise = 0.4): Promise<string> {
  const base = JSON.parse(await readFile(BASE_GRAPH, 'utf8')) as Graph;
  const graph = buildImg2ImgGraph(base, {
    initImageName: 'PLACEHOLDER-uploaded-init.png',
    denoise,
    positive: promptFor('back'),
    negative: NEGATIVE,
    seed: SEED,
  });
  const dest = resolve(REPO_ROOT, 'tools/comfy/img2img-graph.json');
  await writeFile(dest, JSON.stringify(graph, null, 2) + '\n');
  return dest;
}

export interface SweepRow {
  id: string;
  view: string;
  denoise: number;
  seed: number;
  subject: string;
  negative: string;
  file: string;
  ms: number;
}

export async function sweep(views: string[], denoises: number[]): Promise<SweepRow[]> {
  await assertPromptMatchesManifest();
  const env = await loadEnv(resolve(REPO_ROOT, '.env'));
  const client = new ComfyClient(env);
  const base = JSON.parse(await readFile(BASE_GRAPH, 'utf8')) as Graph;

  // Upload once; every row references the same server-side init image.
  const initName = await uploadInitImage(env, INIT_IMAGE, 'player-APPROVED.png');
  console.log(`init image uploaded as ${initName}`);

  await mkdir(OUT_DIR, { recursive: true });
  const rows: SweepRow[] = [];
  for (const view of views) {
    for (const denoise of denoises) {
      const id = `pv-${view}-d${String(Math.round(denoise * 100)).padStart(2, '0')}`;
      const subject = promptFor(view);
      const graph = buildImg2ImgGraph(base, {
        initImageName: initName,
        denoise,
        positive: subject,
        negative: NEGATIVE,
        seed: SEED,
      });
      const t0 = Date.now();
      process.stdout.write(`  ${id} …`);
      const outputs = await client.run(graph);
      const file = resolve(OUT_DIR, `${id}.png`);
      const written = await client.saveAll(outputs, () => file);
      if (!written[0]) throw new Error(`${id} produced no image`);
      const ms = Date.now() - t0;
      console.log(` ${ms}ms -> ${file.replace(REPO_ROOT + '/', '')}`);
      rows.push({ id, view, denoise, seed: SEED, subject, negative: NEGATIVE, file: file.replace(REPO_ROOT + '/', ''), ms });
    }
  }
  return rows;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * DERIVATION — the fallback that WON, on evidence. See the sweep verdict below.
 *
 * The denoise sweep {0.30 0.40 0.50 0.65 0.80 0.86 0.92} x {back, side} measured a hard cliff:
 * every denoise up to 0.86 returned a FRONT-facing figure (the view never turned), and 0.92 —
 * the first value that turned it — had already destroyed the identity (star on the back of the
 * cap, a different face, a different satchel). Identity drift STARTS BEFORE view rotation does,
 * so there is no window where both hold. Evidence: `_acceptance.json`, `assets/raw/player/img2img/`.
 *
 * So the back and side are DERIVED from the approved front at sprite resolution (32x48, §7.6),
 * not generated. Every colour is a swatch lifted from the front's own quantized pixels, so the
 * five defects Hank named are structurally impossible rather than merely unlikely:
 *   - the belt/boot/satchel/shirt swatches CANNOT drift — they are copied, not re-rendered;
 *   - no NEW swatch can appear at all: measured on the SHIPPED PNGs, the back's whole-sprite swatch
 *     set is the front's 19 minus `c16` (the star) and nothing else; the side's is the front's minus
 *     `c25`, `c06`, `c12` and `c14`, all of which the front holds in 2-7 px. Both add ZERO. That is
 *     the whole guarantee, in one number, and `tests/gates/player-art-contract.test.ts` asserts it
 *     against the committed bytes so it stays a fact rather than a claim;
 *   - the star badge is removed from the back by an explicit swatch filter, not by a prompt.
 *
 * Honesty about what each one is:
 *   BACK  — a transformation of the front: horizontal mirror (which is exactly what a back view
 *           is for everything that is not face-specific, and it puts the satchel on the correct
 *           shoulder/hip automatically), then face->hair, star removed, brim shaded away, cap
 *           band refilled, buckle removed, neck narrowed. Every edit is a RECOLOUR of pixels the
 *           mirror already placed, EXCEPT two authored bits, named so they are not glossed over:
 *           the neck's width taper (14/13/12 px, which clears pixels) and four 1px ear marks.
 *           No new silhouette is drawn.
 *   SIDE  — the BODY is a transformation (a single global horizontal squeeze of the front, so
 *           vertical features stay contiguous); the HEAD is AUTHORED as a glyph map, because a
 *           profile skull is new geometry that no transformation of a frontal face produces.
 *           Its colours are still all front swatches. This is the one place where the word
 *           "derived" is doing some work, and it is called out in the manifest too.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The sprite raster, from `data/balance.json` — G11, and not a copy of it.
 *
 * These were `const W = 32; const H = 48;`, and the literal was the bug: the gate that validates this
 * file's output (`tests/gates/player-art-contract.test.ts`) reads `balance.map.playerSpriteW/H` and
 * names its expected files from them, while the tool producing those files did not. The moment the
 * owner ruled the player one block tall and `playerSpriteH` went 48 -> 32, the gate began asking for
 * `player-front-32x32.png` and this file could not emit one at any size. A validator and the thing it
 * validates must read the same source or the disagreement is invisible until the constant moves.
 */
const W = balanceJson.map.playerSpriteW;
const H = balanceJson.map.playerSpriteH;

/**
 * The height {@link deriveBack} and {@link deriveSide} were AUTHORED against, and the only height at
 * which their geometry means anything.
 *
 * ⛔ NOT A DEFAULT AND NOT A TARGET — a precondition. Both functions place features by explicit row
 * index: the cap band at rows 12-15, `HAIR_TOP = 16`, `HAIR_BOTTOM = 20`, `NECK_BOTTOM = 23`, the ears
 * at 16-17, the belt pass at `for (let y = 30; y <= 37; ...)`, and on the side the head clear at rows
 * 0-23 and the far-arm run at 29-38. Those are proportions of a 48-row figure written as absolutes.
 *
 * On a 32-row raster the belt pass addresses rows 30-37 of a sprite that ends at 31 — `setPx` bounds-
 * checks, so it would not crash; it would silently emit a sprite with the belt half missing and the
 * neck taper landing in the torso. THAT is why the guard below throws instead of clamping: a wrong
 * picture that renders is worse than a refusal, and this project has shipped enough of the former.
 *
 * Re-deriving at another height is not a rescale. It is re-authoring both view geometries by hand,
 * and whoever does it should change these constants deliberately rather than discover the need from a
 * mangled sprite.
 */
const DERIVED_VIEW_H = 48;

/** Refuse a raster the derived-view geometry was not authored for. Loud, and it names the fix. */
function assertDerivableHeight(fn: string, r: Raster): void {
  if (r.height === DERIVED_VIEW_H) return;
  throw new Error(
    `${fn}: authored for a ${String(DERIVED_VIEW_H)}-row sprite, got ${String(r.height)}. ` +
      `Its feature rows (cap 12-15, hair 16-20, neck to 23, belt 30-37) are absolute, not proportional, ` +
      `so at this height it would emit a mangled sprite rather than fail. ` +
      `balance.map.playerSpriteH is ${String(H)}. If the derived back/side views are wanted at that ` +
      `height, their geometry has to be re-authored — see DERIVED_VIEW_H.`,
  );
}
type Px = [number, number, number, number];
export interface Raster { width: number; height: number; data: Uint8ClampedArray }

/**
 * ROLE -> FROZEN PALETTE SLOT ID. Never a hex literal. `game/ui/Palette.ts` learned this first;
 * this is the same table shape and the same lesson, one lane over.
 *
 * WHAT WENT WRONG WHEN THIS WAS 21 HEX LITERALS
 * ─────────────────────────────────────────────
 * build-doc §8.4: `data/palette.json` carries 32 swatches `c00`–`c31`, and **the ids are the stable
 * contract** — a re-freeze is a VALUE SWAP in place, so a slot keeps its name and changes its
 * colour. This table used to hold the B0 hexes. T-15 re-froze the palette to the class-equal fit and
 * moved all 32 values; NOT ONE of the 21 literals still existed. Nothing failed. `derive` went on
 * writing them, so `player-back-32x48.png` shipped 8 off-palette pixels and `player-side-32x48.png`
 * 420, in 11 dead hexes — and the star-removal filter, which compared against the deleted `#f9db10`,
 * silently stopped firing and put the star badge back on the REAR of the cap. Ids fix all of that at
 * the root: a re-freeze now moves these colours with it, and cannot leave a dead one behind.
 *
 * HOW EACH ROLE WAS RE-POINTED — MEASURED, NOT GUESSED
 * ────────────────────────────────────────────────────
 * A dead hex is not self-describing, and "nearest new slot to the old hex" is the wrong question:
 * the old hex was itself the B0 palette's IMAGE of a source pixel. So the same §9.3 chain was run
 * over the SAME `player-APPROVED.png` under the B0 palette (`git show HEAD:data/palette.json` at
 * T-24) and under the shipped one, pairing every source pixel's old colour with its new colour.
 * The right-hand column is that histogram — measured pixels, not opinion.
 *
 *   role        B0 hex   was   now   evidence
 *   outline     #030202  c00 -> c00  32/32 px
 *   grey        #a4a3ad  c01 -> c01  11/17 px — the buckle metal and the cap stud
 *   greyHi      (none)          c02  5/17 px  — NEW ROLE, see THE GREY SPLIT below
 *   white       #fdfdfb  c02 -> c03  2/2 px
 *   hairDark    #2a1212  c03 -> c04  78/79 px
 *   hair        #53210c  c04 -> c05  84/117 px (33 to c04; c05 is also nearest in sRGB)
 *   hairHi      #6e3620  c05 -> c05  29/34 px — COLLIDES with `hair`, see THE BROWN RAMP below
 *   leather     #8f5230  c08 -> c07  101/101 px
 *   leatherHi   #b07037  c11 -> c09  9/9 px — the satchel body, rows 32-37
 *   tan         #ab8d62  c12 -> c10  NO EVIDENCE — nearest in sRGB; see THE THREE VESTIGIAL ROLES
 *   goldDim     #f0c05f  c15 -> c13  NO EVIDENCE — nearest in sRGB; ditto
 *   skinHi      #eec092  c16 -> c14  3/4 px
 *   skin        #f9daae  c17 -> c15  190/190 px
 *   cream       #f7ebd3  c18 -> c03  role + nearest; COLLAPSES onto `white`, see below
 *   star        #f9db10  c21 -> c16  16/16 px, rows 4-7 — the badge on the cap front
 *   starHi      #faec67  c22 -> c13  NO EVIDENCE — nearest in sRGB; see below
 *   capOutline  #033309  c23 -> c17  46/48 px — COLLIDES with `capRim`, see THE CAP GREENS
 *   capDark     #2a7a34  c24 -> c19  69/69 px
 *   capGreen    #4bac53  c26 -> c21  285/292 px
 *   capLight    #68c361  c27 -> c23  role + nearest; the one measured px is on the SHIRT, not the cap
 *   capRim      #083f22  c28 -> c17  71/71 px — COLLIDES with `capOutline`
 *
 * THE GREY SPLIT — the one place a role had to be ADDED. B0 held one metal grey (`#a4a3ad`); the
 * class-equal fit splits those same 17 source pixels across `c01` (11 px) and `c02` (5 px, the
 * highlight). The back view's buckle filter matched exactly one swatch, so under the new palette it
 * would have left the buckle's 5 highlight pixels sitting on the rear of the belt. `greyHi` is that
 * highlight, and {@link isMetal} is the set the filter now keys on. Measured: those 5 px are the
 * ONLY `c02` in rows 30-37, so the set cannot over-reach.
 *
 * THE BROWN RAMP LOST A LEVEL. B0 ran `#2a1212` / `#53210c` / `#6e3620` / `#8f5230`; the class-equal
 * fit has no swatch between `c05` and `c07`, so `hair` and `hairHi` both land on `c05` (nearest in
 * sRGB by 510 and 300 respectively; the next candidate, `c07`, is 4x further from `#6e3620`). That
 * is the palette's fact, not a choice here: the back's nape band is now two tones where it was
 * three, and the belt band it refills is the same `c05` the surrounding belt quantizes to. Pointing
 * `hairHi` anywhere else would invent a distinction the shipped palette does not contain and would
 * write a swatch the front sprite does not hold.
 *
 * THE CAP GREENS LOST ONE TOO. `capOutline` and `capRim` were two near-black greens; the fit has
 * exactly one (`c17`), and both are nearest to it. The nape band's edge no longer reads as an
 * outline against rows 13/15. Cosmetic, recorded rather than papered over.
 *
 * THE THREE VESTIGIAL ROLES. `tan`, `goldDim` and `starHi` appear in NO pixel of the quantized front
 * under either palette — they were already defensive unions when they were literals. They are
 * matched, never written, so they cannot recolour anything; they are pointed at the nearest slot in
 * sRGB and flagged here rather than deleted, because deleting a member of a defensive union is a
 * different decision from re-pointing one. `cream` and `capLight` are matched-only as well.
 *
 * WRITERS MUST EXIST IN THE FRONT. Every role this file ever WRITES resolves to a slot the approved
 * front's own quantized pixels already hold — that is the file's whole guarantee (§DERIVATION: "no
 * NEW swatch can appear at all"), and `tests/gates/player-art-contract.test.ts` decodes the shipped
 * PNGs and asserts it, so it is a fact about the committed bytes rather than about this comment.
 */
export const SWATCH_ID = {
  outline: 'c00', grey: 'c01', greyHi: 'c02', white: 'c03',
  hairDark: 'c04', hair: 'c05', hairHi: 'c05',
  leather: 'c07', skinShade: 'c11', leatherHi: 'c09', tan: 'c10',
  goldDim: 'c13', skinHi: 'c14', skin: 'c15', cream: 'c03',
  star: 'c16', starHi: 'c13',
  capOutline: 'c17', capDark: 'c19', capGreen: 'c21',
  capLight: 'c23', capRim: 'c17',
} as const;

export type SwatchRole = keyof typeof SWATCH_ID;

/**
 * Resolve every role against a palette. Throws on a slot id the palette does not carry — a silent
 * black here would be a lie about the art, exactly as it is in `game/ui/Palette.ts::swatchHex`.
 *
 * The palette is a parameter for the same reason {@link toSprite} takes one: a test must be able to
 * drive the derivation under a candidate palette without editing this file.
 */
export function swatchesFrom(palette: readonly PaletteRgb[]): Record<SwatchRole, Px> {
  const byId = new Map(palette.map((c) => [c.id, c]));
  const out = {} as Record<SwatchRole, Px>;
  for (const [role, id] of Object.entries(SWATCH_ID) as Array<[SwatchRole, string]>) {
    const sw = byId.get(id);
    if (!sw) {
      throw new Error(
        `tools/comfy/player-views.ts: role "${role}" names palette slot "${id}", which data/palette.json ` +
          `does not carry (ids are c00–c31 and are the stable contract across a re-freeze — build-doc §8.4).`,
      );
    }
    out[role] = [sw.r, sw.g, sw.b, 255];
  }
  return out;
}

/** The live read of `data/palette.json` — the same file `toSprite`'s quantize step snaps to. */
export const C: Record<SwatchRole, Px> = swatchesFrom(loadPalette());
const eq = (a: Px, b: Px) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

export function getPx(r: Raster, x: number, y: number): Px {
  if (x < 0 || y < 0 || x >= r.width || y >= r.height) return [0, 0, 0, 0];
  const i = (y * r.width + x) * 4;
  return [r.data[i]!, r.data[i + 1]!, r.data[i + 2]!, r.data[i + 3]!];
}
function setPx(r: Raster, x: number, y: number, p: Px): void {
  if (x < 0 || y < 0 || x >= r.width || y >= r.height) return;
  const i = (y * r.width + x) * 4;
  r.data[i] = p[0]; r.data[i + 1] = p[1]; r.data[i + 2] = p[2]; r.data[i + 3] = p[3];
}
const on = (r: Raster, x: number, y: number) => getPx(r, x, y)[3] >= 128;
const rowBounds = (r: Raster, y: number): readonly [number, number] => {
  let lo = -1, hi = -1;
  for (let x = 0; x < r.width; x++) if (on(r, x, y)) { if (lo < 0) lo = x; hi = x; }
  return [lo, hi] as const;
};

export function mirrorH(r: Raster): Raster {
  const o: Raster = { width: r.width, height: r.height, data: new Uint8ClampedArray(r.data) };
  for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) setPx(o, r.width - 1 - x, y, getPx(r, x, y));
  return o;
}

const SKINS = [C.skin, C.skinHi, C.skinShade, C.cream];
const isSkin = (p: Px) => SKINS.some((c) => eq(p, c));
const isHair = (p: Px) => eq(p, C.hair) || eq(p, C.hairDark) || eq(p, C.hairHi);
/**
 * The buckle and the cap stud. THREE swatches, not one: the class-equal fit split B0's single metal
 * grey into `c01` and its highlight `c02` (see SWATCH_ID). A filter that matched only the dominant
 * one would leave the buckle's highlight pixels on the rear of the belt.
 */
const METALS = [C.grey, C.greyHi, C.white];
export const isMetal = (p: Px) => METALS.some((c) => eq(p, c));
/**
 * The star badge's yellows. Exported because `tests/gates/player-art-contract.test.ts` asserts the
 * badge's absence from the rear view BY THIS SAME PREDICATE — a gate that measured the star its own
 * way could go green while the filter that removes it was looking at something else, which is the
 * exact failure T-24 is repairing.
 */
export const isStarYellow = (p: Px) => eq(p, C.star) || eq(p, C.starHi) || eq(p, C.goldDim);

/**
 * BACK = mirror(front) + explicit edits. Transformation, not generation: every edit recolours a
 * pixel the mirror already placed, with two named exceptions — the neck taper (which clears
 * pixels) and four 1px ear marks. Nothing here draws a new silhouette.
 */
export function deriveBack(front: Raster): Raster {
  assertDerivableHeight('deriveBack', front);
  const b = mirrorH(front);

  // 1. the star badge is on the cap FRONT — from behind it is not visible at all.
  for (let y = 0; y <= 13; y++) for (let x = 0; x < W; x++) {
    const p = getPx(b, x, y);
    if (isStarYellow(p)) setPx(b, x, y, C.capGreen);
  }
  // 2. the peak points away, so its lit top surface drops to the crown's own shadow green.
  for (let y = 9; y <= 13; y++) for (let x = 0; x < W; x++) {
    if (!on(b, x, y)) continue;
    const p = getPx(b, x, y);
    if (eq(p, C.capGreen)) setPx(b, x, y, C.capDark);
    else if (eq(p, C.capLight)) setPx(b, x, y, C.capGreen);
  }
  // 2b. from behind, a peaked cap sits LOWER on the skull than it appears from the front — it
  //     covers the occiput down past the ears. Two more rows of cap, so the nape is a band and
  //     not a slab. Cap swatches only; the head silhouette is untouched.
  //     Rows 12-13 matter as much as 14-15: the mirror carries the FRONT's temple hair, ear and
  //     eye-shadow into the cap band, where from behind there is nothing but cap. The grey cap
  //     stud (`grey`, slot c01) is deliberately NOT in the filter — it is a side-of-cap detail and
  //     survives.
  const CAP_ROW: Record<number, Px> = { 12: C.capDark, 13: C.capRim, 14: C.capDark, 15: C.capRim };
  for (let y = 12; y <= 15; y++) {
    const [lo, hi] = rowBounds(b, y);
    if (lo < 0) continue;
    for (let x = lo; x <= hi; x++) {
      if (!on(b, x, y)) continue;
      const p = getPx(b, x, y);
      if (!isSkin(p) && !isHair(p) && !eq(p, C.outline)) continue;
      setPx(b, x, y, x === lo || x === hi ? C.capOutline : CAP_ROW[y]!);
    }
  }

  // 3. face -> back of the head, banded with the front's OWN three hair swatches.
  const HAIR_TOP = 16, HAIR_BOTTOM = 20, NECK_BOTTOM = 23;
  for (let y = HAIR_TOP; y <= HAIR_BOTTOM; y++) {
    const [lo, hi] = rowBounds(b, y);
    if (lo < 0) continue;
    for (let x = lo; x <= hi; x++) {
      if (!on(b, x, y)) continue;
      const p = getPx(b, x, y);
      if (!isSkin(p) && !isHair(p) && !eq(p, C.outline)) continue;
      const edge = x === lo || x === hi;
      setPx(b, x, y, edge || y === HAIR_BOTTOM ? C.hairDark : y === HAIR_TOP ? C.hairHi : C.hair);
    }
  }
  // 4. from behind the neck is a narrow column, not the front view's jaw.
  const NECK_W = [14, 13, 12];
  for (let y = HAIR_BOTTOM + 1; y <= NECK_BOTTOM; y++) {
    const [lo, hi] = rowBounds(b, y);
    if (lo < 0) continue;
    const mid = (lo + hi) / 2, half = (NECK_W[y - HAIR_BOTTOM - 1] ?? 12) / 2;
    for (let x = lo; x <= hi; x++) {
      if (!on(b, x, y)) continue;
      const p = getPx(b, x, y);
      if (!isSkin(p) && !isHair(p) && !eq(p, C.outline)) continue;
      if (x < mid - half || x > mid + half) { setPx(b, x, y, [0, 0, 0, 0]); continue; }
      setPx(b, x, y, x < mid - half + 1 || x > mid + half - 1 ? C.hair : C.skinShade);
    }
  }
  // 5. ears — symmetric from behind, in the front's own shaded-skin swatch.
  for (const y of [16, 17]) {
    const [lo, hi] = rowBounds(b, y);
    if (lo < 0) continue;
    setPx(b, lo + 1, y, C.skinShade); setPx(b, lo + 2, y, C.skinHi);
    setPx(b, hi - 1, y, C.skinShade); setPx(b, hi - 2, y, C.skinHi);
  }
  // 6. the buckle is on the front of the belt; from behind the band runs unbroken.
  for (let y = 30; y <= 37; y++) for (let x = 0; x < W; x++) {
    if (!on(b, x, y)) continue;
    // `hairHi` is not a hair colour here — it is the slot the belt band's own pixels quantize to
    // (measured: c05 dominates rows 30-37 either side of the buckle), so the band closes seamlessly.
    if (isMetal(getPx(b, x, y))) setPx(b, x, y, C.hairHi);
  }
  return b;
}

/**
 * ONE column mapping for every row, so vertical features (collar, strap, belt loops, boot seams)
 * stay contiguous. A per-row squeeze shreds them — measured, then discarded.
 */
export function squeezeH(r: Raster, newW: number, off: number): Raster {
  const o: Raster = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
  for (let y = 0; y < H; y++) for (let x = 0; x < newW; x++) {
    setPx(o, x + off, y, getPx(r, Math.min(r.width - 1, Math.round((x * (r.width - 1)) / (newW - 1))), y));
  }
  return o;
}

/**
 * The profile head, AUTHORED as a glyph map — a profile skull is geometry no transformation of a
 * frontal face yields. Every letter resolves to a swatch the approved front already uses, so the
 * side view cannot introduce a colour the player does not have. Column 0 is x=4; rows are y=1..23.
 */
export const SIDE_HEAD = [
  /* 1*/ '......KKKKKKKKKKKK......',
  /* 2*/ '....KKGGGGGGGGGGGGKK....',
  /* 3*/ '...KGGGGGGGGGGGGGGGGK...',
  /* 4*/ '..KGGGGGGGGGGGGGGGGGGK..',
  /* 5*/ '..KGGGGGGGGGGGGGGGGYGK..',
  /* 6*/ '..KDGGGGGGGGGGGGGGGYGK..',
  /* 7*/ '..KDGGGGGGGGGGGGGGGGGK..',
  /* 8*/ '..KDAGGGGGGGGGGGGGGGGK..',
  /* 9*/ '..KDDDDDDDDDDDDDDDDDDDK.',
  /*10*/ '..KDDDDDDDDDDDDDDDDDDDDK',
  /*11*/ '...KRRRRRRRRRRRRRRRRRRRK',
  /*12*/ '...dHHHHHsSSSSSSSSSSK...',
  /*13*/ '..dHHHHHHSSSSSSSSSSSSK..',
  /*14*/ '..dHHHHHHSSSSSSSSSSSSK..',
  /*15*/ '..dHHHHHHSSSSSOSSSSSSK..',
  /*16*/ '..dHHHHHHSSSSSOSSSSSSSK.',
  /*17*/ '..dHHHHHHSsSSSSSSSSSSSK.',
  /*18*/ '...dHHHHHSsSSSSSSSSSSSK.',
  /*19*/ '...dHHHHHSSSSSSSSSSSSK..',
  /*20*/ '....dHHHSSSSSSSSSOOSK...',
  /*21*/ '.....dHHSSSSSSSSSSK.....',
  /*22*/ '......dSSSSSSSSSK.......',
  /*23*/ '........ssssssssK.......',
] as const;
const GLYPH: Record<string, Px | null> = {
  '.': null, K: C.capOutline, R: C.capRim, D: C.capDark, G: C.capGreen, Y: C.star, A: C.grey,
  H: C.hair, h: C.hairHi, d: C.hairDark, S: C.skin, s: C.skinShade, L: C.skinHi, O: C.outline,
};

/** SIDE = global squeeze of the front's body + the authored profile head + three profile edits. */
export function deriveSide(front: Raster): Raster {
  assertDerivableHeight('deriveSide', front);
  const s = squeezeH(front, 21, 6);

  for (let y = 0; y <= 23; y++) for (let x = 0; x < W; x++) setPx(s, x, y, [0, 0, 0, 0]);
  SIDE_HEAD.forEach((row, i) => {
    for (let k = 0; k < row.length; k++) {
      const g = GLYPH[row[k]!];
      if (g) setPx(s, 4 + k, i + 1, g);
    }
  });

  // The far arm is behind the torso in profile. Clear the WHOLE leading skin run, not a fixed
  // 3px: the front's arm is 6-8px wide and squeezes to 4-5, so a fixed budget leaves a pale
  // sliver beside the satchel that reads as a stray highlight.
  for (let y = 29; y <= 38; y++) {
    for (let k = 0; k < 8; k++) {
      const [lo] = rowBounds(s, y);
      if (lo < 0) break;
      const p = getPx(s, lo, y);
      if (isSkin(p) || eq(p, C.hair) || eq(p, C.hairDark)) setPx(s, lo, y, [0, 0, 0, 0]); else break;
    }
  }
  // the buckle is on the FRONT of the belt: edge-on from the side, so it moves to the leading edge.
  for (let y = 30; y <= 37; y++) for (let x = 0; x < W; x++) if (isMetal(getPx(s, x, y))) setPx(s, x, y, C.hairHi);
  let beltEnd = -1;
  for (let x = 0; x < W; x++) if (eq(getPx(s, x, 33), C.hairHi)) beltEnd = x;  // leading end of the belt band
  if (beltEnd > 1) for (const y of [33, 34]) { setPx(s, beltEnd, y, C.grey); setPx(s, beltEnd - 1, y, C.grey); }
  return s;
}

/* ═══════════════════ pipeline + the measured acceptance bar ═══════════════════ */

export const VIEWS_DIR = resolve(REPO_ROOT, 'assets/approved-trials/_player-views');

/**
 * §9.3 order: trim -> nearest downscale to 32x48 -> quantize -> background removal.
 *
 * THE BACKGROUND OPTIONS COME FROM THE MANIFEST, not from a literal here (G11). Step 3 runs
 * AFTER quantize, so its tolerance is a property of the palette rather than of this file: it has to
 * admit whatever the palette maps white to. This function used to carry `{ key: WHITE, tolerance:
 * 12 }`, which passed only because `data/palette.json` happens to put white at deviation 4; both
 * re-freeze candidates put it at 13 and 20, and at 12 removal then cleared ZERO pixels — the front
 * sprite, and therefore `deriveBack`/`deriveSide` which are computed from it, shipped as a solid
 * 32x48 off-white rectangle. `backgroundForClass` reads `classes.player.postprocess` from
 * `tools/comfy/manifest.json`, the same values `tools/postprocess/chain.ts` runs the batch on.
 *
 * The palette is a parameter so the invariant test can drive this exact function under every
 * palette on disk; it defaults to the live read of `data/palette.json`, which is what `derive` uses.
 */
export async function toSprite(path: string, palette: readonly PaletteRgb[] = loadPalette()): Promise<Raster> {
  const bg = await backgroundForClass('player');
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const src: Raster = { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
  return removeFlatBackground(quantize(nearestResample(trimBackground(src, bg), W, H), palette), bg);
}

/**
 * Decode an ALREADY-32x48 sprite exactly as it sits on disk, and assert that it is not empty.
 *
 * NOT `toSprite`. Running the §9.3 chain over a finished sprite is not a no-op: `trimBackground`
 * counts a fully transparent pixel as background (steps.ts `isBackgroundPixel`, alpha === 0), so it
 * crops the sprite's transparent margin away and `nearestResample` then STRETCHES the crop back to
 * 32x48. Measured on the shipped side view, that turns 750 opaque pixels into 1123 — so every
 * "derived" row in `_acceptance.json` used to describe a re-stretched copy rather than the bytes
 * that ship. The `derive` command's subject loop already carried an `isSprite` flag with both
 * branches calling `toSprite`; this is the branch it was reaching for.
 *
 * The emptiness check is not decoration: Comfy Cloud is known to return well-formed PNGs that are
 * entirely one flat colour, and a measurement over zero opaque pixels reports `0` / `[]` / `null`
 * for every identity detector — which reads exactly like "the star badge is absent".
 */
export async function readSprite(path: string): Promise<Raster> {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== W || info.height !== H) {
    throw new Error(`readSprite(${path}): expected ${W}x${H}, got ${info.width}x${info.height}`);
  }
  const r: Raster = { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
  let opaque = 0;
  for (let i = 3; i < r.data.length; i += 4) if (r.data[i]! >= 128) opaque++;
  if (opaque === 0) throw new Error(`readSprite(${path}): decoded ${W}x${H} but every pixel is transparent`);
  return r;
}

const writePng = (r: Raster, p: string) =>
  sharp(Buffer.from(r.data.buffer, r.data.byteOffset, r.data.length), { raw: { width: r.width, height: r.height, channels: 4 } })
    .png().toFile(p);

const hexOf = (p: Px) => '#' + p.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');

/** sRGB -> CIELAB, for the identity bands. Same band definitions as tools/palette/cross-view.mjs. */
function toLab(p: Px): { L: number; a: number; b: number } {
  const f = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, bl] = [f(p[0]!), f(p[1]!), f(p[2]!)];
  const x = (r * 0.4124 + g * 0.3576 + bl * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + bl * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + bl * 0.9505) / 1.08883;
  const k = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return { L: 116 * k(y) - 16, a: 500 * (k(x) - k(y)), b: 200 * (k(y) - k(z)) };
}
export const BANDS: Record<string, (c: { L: number; a: number; b: number }) => boolean> = {
  'star yellow': (c) => c.L >= 70 && c.L <= 96 && c.a >= -15 && c.a <= 28 && c.b > 55,
  'shirt/cap green': (c) => c.a < -18 && c.b > 8 && c.L >= 25 && c.L <= 75,
  skin: (c) => c.L >= 62 && c.L <= 92 && c.a >= 8 && c.a <= 30 && c.b >= 16 && c.b <= 48,
  'leather brown': (c) => c.L >= 18 && c.L <= 58 && c.a >= 5 && c.a <= 32 && c.b >= 12 && c.b <= 48,
  'dark outline': (c) => c.L < 22,
};

export interface Measurement {
  id: string; source: string; method: string;
  opaque: number; distinctSwatches: number; edgePairs: number; edgeDensity: number;
  components: number; tinyComponents: number;
  starPixels: number; starRows: number[];
  bbox: { x0: number; y0: number; x1: number; y1: number };
  satchelCentroidRel: number | null; strapSlope: number | null;
  beltSwatches: string[]; bootSwatches: string[]; bootOpaque: number;
  bands: Record<string, { total: number; dominant: string | null; swatches: Record<string, number> }>;
}

export function measure(id: string, source: string, method: string, r: Raster): Measurement {
  let opaque = 0, edgePairs = 0;
  const swatches = new Set<string>();
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  const bands: Measurement['bands'] = {};
  for (const n of Object.keys(BANDS)) bands[n] = { total: 0, dominant: null, swatches: {} };
  let starPixels = 0; const starRows = new Set<number>();
  let satX = 0, satN = 0;
  const strap: Array<[number, number]> = [];
  const belt = new Set<string>(), boot = new Set<string>();
  let bootOpaque = 0;

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!on(r, x, y)) continue;
    opaque++;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    const p = getPx(r, x, y), h = hexOf(p);
    swatches.add(h);
    if (on(r, x + 1, y) && !eq(p, getPx(r, x + 1, y))) edgePairs++;
    if (on(r, x, y + 1) && !eq(p, getPx(r, x, y + 1))) edgePairs++;
    if (!on(r, x + 1, y)) edgePairs++;
    if (!on(r, x, y + 1)) edgePairs++;
    const lab = toLab(p);
    for (const [n, t] of Object.entries(BANDS)) if (t(lab)) { bands[n]!.total++; bands[n]!.swatches[h] = (bands[n]!.swatches[h] ?? 0) + 1; }
    if (isStarYellow(p)) { starPixels++; starRows.add(y); }
    // the satchel body: leather swatches at hip height, below the belt band and outside the boots
    if (y >= 29 && y <= 40 && (eq(p, C.leatherHi) || eq(p, C.tan))) { satX += x; satN++; }
    if (y >= 24 && y <= 33 && (eq(p, C.leather) || eq(p, C.hairHi))) strap.push([x, y]);
    if (y >= 32 && y <= 35) belt.add(h);
    if (y >= 42) { boot.add(h); bootOpaque++; }
  }
  for (const n of Object.keys(bands)) {
    const e = Object.entries(bands[n]!.swatches).sort((a, b) => b[1] - a[1])[0];
    bands[n]!.dominant = e ? e[0] : null;
  }
  // strap direction: sign of the (x,y) covariance. positive = runs down-to-the-right.
  let strapSlope: number | null = null;
  if (strap.length >= 6) {
    const mx = strap.reduce((a, p) => a + p[0], 0) / strap.length;
    const my = strap.reduce((a, p) => a + p[1], 0) / strap.length;
    const cov = strap.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
    const vx = strap.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
    strapSlope = vx > 0 ? Number((cov / vx).toFixed(3)) : null;
  }
  const cc = components(r);
  return {
    id, source, method, opaque, distinctSwatches: swatches.size, edgePairs,
    components: cc.components, tinyComponents: cc.tiny,
    edgeDensity: Number((edgePairs / Math.max(1, opaque)).toFixed(4)),
    starPixels, starRows: [...starRows].sort((a, b) => a - b),
    bbox: { x0, y0, x1, y1 },
    satchelCentroidRel: satN ? Number(((satX / satN - x0) / Math.max(1, x1 - x0)).toFixed(3)) : null,
    strapSlope,
    beltSwatches: [...belt].sort(), bootSwatches: [...boot].sort(), bootOpaque,
    bands,
  };
}

/**
 * Detail density at the 1024² review scale, measured as the APPARENT ART-PIXEL PITCH: the median
 * length of a horizontal constant-colour run inside the figure's bbox (runs of 1px are anti-alias
 * jitter and are excluded). A render drawn on a finer implicit pixel grid has a shorter pitch and
 * therefore more art-pixels per figure height.
 *
 * This is the metric that tests Hank's "roughly twice the pixel density of the front sprite".
 * It does NOT reproduce a 2x — see the `_acceptance.json` note. Reported anyway, because the
 * honest answer to "is it twice as dense" is a number, not a shrug.
 */
export async function nativeDensity(path: string): Promise<{ bbox: string; medianRunPx: number; artPxPerHeight: number; distinctRgb: number } | null> {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const isBg = (i: number) => data[i]! > 243 && data[i + 1]! > 243 && data[i + 2]! > 243;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  const seen = new Set<number>();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (isBg(i)) continue;
    seen.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  const runs: number[] = [];
  for (let y = y0; y <= y1; y++) {
    let prev = -1, len = 0;
    for (let x = x0; x <= x1; x++) {
      const i = (y * w + x) * 4;
      const q = ((data[i]! >> 3) << 10) | ((data[i + 1]! >> 3) << 5) | (data[i + 2]! >> 3);
      if (q === prev) len++; else { if (len >= 2) runs.push(len); prev = q; len = 1; }
    }
    if (len >= 2) runs.push(len);
  }
  if (!runs.length) return null;
  runs.sort((a, b) => a - b);
  const med = runs[Math.floor(runs.length / 2)]!;
  return {
    bbox: `${x1 - x0 + 1}x${y1 - y0 + 1}`,
    medianRunPx: med,
    artPxPerHeight: Number(((y1 - y0 + 1) / med).toFixed(1)),
    distinctRgb: seen.size,
  };
}

/** Same-colour 4-connected components at 32x48 — "how many separate little details are there". */
export function components(r: Raster): { components: number; tiny: number } {
  const key = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return r.data[i + 3]! < 128 ? -1 : (r.data[i]! << 16) | (r.data[i + 1]! << 8) | r.data[i + 2]!;
  };
  const seen = new Uint8Array(W * H);
  let comps = 0, tiny = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (seen[y * W + x] || key(x, y) < 0) continue;
    const k = key(x, y);
    const st: Array<[number, number]> = [[x, y]];
    seen[y * W + x] = 1;
    let n = 0;
    while (st.length) {
      const [cx, cy] = st.pop()!;
      n++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || key(nx, ny) !== k) continue;
        seen[ny * W + nx] = 1; st.push([nx, ny]);
      }
    }
    comps++; if (n <= 2) tiny++;
  }
  return { components: comps, tiny };
}

async function upscale(src: string, dest: string, k = 12) {
  await sharp(src).resize(W * k, H * k, { kernel: 'nearest' }).png().toFile(dest);
}

/** A contact sheet Hank can open: the approved front, the two derived views, and what was rejected. */
async function contactSheet(cells: Array<{ file: string; label: string; note: string }>, dest: string) {
  const k = 8, cw = W * k + 16, ch = H * k + 46;
  const parts: Array<{ input: Buffer; left: number; top: number }> = [];
  for (const [i, c] of cells.entries()) {
    const left = 12 + i * cw, top = 34;
    parts.push({ input: await sharp(c.file).resize(W * k, H * k, { kernel: 'nearest' }).flatten({ background: '#f4f2ec' }).toBuffer(), left, top });
    parts.push({
      input: Buffer.from(
        `<svg width="${W * k}" height="40"><text x="0" y="14" font-family="monospace" font-size="13" fill="#e8e8e8">${c.label}</text>` +
        `<text x="0" y="30" font-family="monospace" font-size="11" fill="#9fb8a4">${c.note}</text></svg>`,
      ), left, top: top + H * k + 2,
    });
  }
  await sharp({ create: { width: 12 + cells.length * cw, height: ch + 30, channels: 3, background: '#161816' } })
    .composite(parts).png().toFile(dest);
}

/* ───────────────────────────── CLI ───────────────────────────── */

function isEntrypoint(): boolean {
  const argv1 = process.argv[1];
  return argv1 !== undefined && resolve(argv1) === resolve(fileURLToPath(import.meta.url));
}

if (isEntrypoint()) {
  const cmd = process.argv[2];
  const arg = (k: string): string | undefined =>
    process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);

  if (cmd === 'emit-graph') {
    const rawDenoise = arg('denoise');
    const denoise = rawDenoise === undefined ? 0.4 : Number(rawDenoise);
    if (!Number.isFinite(denoise)) {
      console.error(`--denoise=${rawDenoise} is not a number`);
      process.exit(2);
    }
    const dest = await emitGraph(denoise);
    console.log(`wrote ${dest}`);
  } else if (cmd === 'sweep') {
    const views = (arg('views') ?? 'back,side').split(',').filter(Boolean);
    const denoises = (arg('denoise') ?? '0.3,0.4,0.5').split(',').map(Number).filter((n) => n > 0 && n < 1);
    const label = arg('label') ?? 'r1';
    console.log(`img2img sweep — ${views.length} views x ${denoises.length} denoise = ${views.length * denoises.length} generations`);
    const t0 = Date.now();
    const rows = await sweep(views, denoises);
    const runPath = resolve(OUT_DIR, `_sweep-${label}.json`);
    await writeFile(
      runPath,
      JSON.stringify(
        {
          method: 'img2img',
          initImage: 'assets/approved-trials/player-APPROVED.png',
          workflowGraph: 'tools/comfy/img2img-graph.json',
          baseGraph: 'tools/comfy/pixel-txt2img-api.json',
          seed: SEED,
          generations: rows.length,
          totalMs: Date.now() - t0,
          rows,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`\n${rows.length} generations. run log -> ${runPath}`);
  } else if (cmd === 'derive' || cmd === 'measure') {
    await mkdir(`${VIEWS_DIR}/derived`, { recursive: true });
    await mkdir(`${VIEWS_DIR}/x12`, { recursive: true });

    const front = await toSprite(resolve(REPO_ROOT, 'assets/approved-trials/player-APPROVED.png'));
    const back = deriveBack(front);
    const side = deriveSide(front);
    for (const [n, r] of [['front', front], ['back', back], ['side', side]] as const) {
      // The size is READ, never spelled: `tests/gates/player-art-contract.test.ts` names the file it
      // expects as `player-<view>-${W}x${H}.png` from balance.map, and a literal here is how the tool
      // and its gate came to disagree about which file this command even produces.
      const derivedPath = `${VIEWS_DIR}/derived/player-${n}-${String(W)}x${String(H)}.png`;
      await writePng(r, derivedPath);
      await upscale(derivedPath, `${VIEWS_DIR}/x12/player-${n}-x12.png`);
    }

    // Everything measured on the same footing: derived, previously rejected, and the img2img sweep.
    const subjects: Array<{ id: string; file: string; method: string }> = [
      { id: 'front (APPROVED)', file: 'assets/approved-trials/player-APPROVED.png', method: 'txt2img, seed 42 — the reference' },
      { id: 'back  DERIVED', file: `${VIEWS_DIR}/derived/player-back-32x48.png`, method: 'derived: mirror + 6 edits' },
      { id: 'side  DERIVED', file: `${VIEWS_DIR}/derived/player-side-32x48.png`, method: 'derived: squeeze + authored head' },
      { id: 'back-e REJECTED', file: 'assets/raw/player/b0-player-back-e.png', method: 'txt2img — Hank rejected' },
      { id: 'side-b REJECTED', file: 'assets/raw/player/b0-player-side-b.png', method: 'txt2img — Hank rejected' },
      { id: 'back  img2img d92', file: 'assets/raw/player/img2img/pv-back-d92.png', method: 'img2img denoise 0.92' },
      { id: 'side  img2img d92', file: 'assets/raw/player/img2img/pv-side-d92.png', method: 'img2img denoise 0.92' },
      { id: 'back  img2img d80', file: 'assets/raw/player/img2img/pv-back-d80.png', method: 'img2img denoise 0.80' },
    ];
    const out: Measurement[] = [];
    for (const s of subjects) {
      const abs = s.file.startsWith('/') ? s.file : resolve(REPO_ROOT, s.file);
      const isSprite = abs.includes('/derived/');
      // A finished 32x48 sprite is READ, not re-chained — see `readSprite` for what re-chaining did.
      out.push(measure(s.id, s.file.replace(REPO_ROOT + '/', ''), s.method, isSprite ? await readSprite(abs) : await toSprite(abs)));
    }

    const ref = out[0]!;
    const line = (m: Measurement) =>
      `${m.id.padEnd(18)} opq ${String(m.opaque).padStart(4)}  swatches ${String(m.distinctSwatches).padStart(2)}` +
      `  edgeDens ${m.edgeDensity.toFixed(3)} (${(m.edgeDensity / ref.edgeDensity).toFixed(2)}x)` +
      `  comps ${String(m.components).padStart(3)} (${(m.components / ref.components).toFixed(2)}x)` +
      `  star ${String(m.starPixels).padStart(3)}px rows[${m.starRows.join(',')}]`;
    console.log('\nDETAIL DENSITY / STAR BADGE  (32x48, after the full §9.3 chain)');
    console.log('─'.repeat(118));
    for (const m of out) console.log(line(m));

    console.log('\nDETAIL DENSITY AT 1024² — the scale Hank reviewed at (32x48 cannot see this)');
    console.log('─'.repeat(118));
    const nativeRef = await nativeDensity(resolve(REPO_ROOT, 'assets/approved-trials/player-APPROVED.png'));
    const native: Record<string, unknown> = {};
    for (const s of subjects) {
      const abs = s.file.startsWith('/') ? s.file : resolve(REPO_ROOT, s.file);
      if (abs.includes('/derived/')) { console.log(`${s.id.padEnd(18)} n/a — this view exists only at 32x48 (that IS the deliverable)`); continue; }
      const n = await nativeDensity(abs);
      if (!n || !nativeRef) continue;
      const rel = n.artPxPerHeight / nativeRef.artPxPerHeight; // more art-pixels per height = denser
      native[s.id] = { ...n, relDensityVsFront: Number(rel.toFixed(2)) };
      console.log(`${s.id.padEnd(18)} bbox ${n.bbox.padStart(8)}  medianRun ${String(n.medianRunPx).padStart(2)}px  artPx/height ${String(n.artPxPerHeight).padStart(5)} (${rel.toFixed(2)}x front)  distinctRGB ${String(n.distinctRgb).padStart(6)}`);
    }

    console.log('\nSATCHEL / BELT / BOOTS');
    console.log('─'.repeat(118));
    for (const m of out) {
      console.log(
        `${m.id.padEnd(18)} satchel@${m.satchelCentroidRel === null ? ' none' : m.satchelCentroidRel.toFixed(2)}` +
        `  strapSlope ${m.strapSlope === null ? '  n/a' : m.strapSlope.toFixed(2).padStart(5)}` +
        `  belt[${m.beltSwatches.join(' ')}]`,
      );
      console.log(`${' '.repeat(18)} boots ${String(m.bootOpaque).padStart(3)}px [${m.bootSwatches.join(' ')}]`);
    }

    console.log('\nCROSS-VIEW BAND AGREEMENT vs the approved front (method of tools/palette/cross-view.mjs)');
    console.log('─'.repeat(118));
    for (const n of Object.keys(BANDS)) {
      const cells = out.map((m) => `${m.id.split(' ')[0]}=${m.bands[n]!.dominant ?? '—'}`);
      console.log(`${n.padEnd(17)} ${cells.join('  ')}`);
    }

    await contactSheet(
      [
        { file: `${VIEWS_DIR}/derived/player-side-32x48.png`, label: 'SIDE (derived)', note: 'squeeze + authored head' },
        { file: `${VIEWS_DIR}/derived/player-front-32x48.png`, label: 'FRONT (approved)', note: 'seed 42 — the reference' },
        { file: `${VIEWS_DIR}/derived/player-back-32x48.png`, label: 'BACK (derived)', note: 'mirror + 6 edits' },
        { file: resolve(REPO_ROOT, 'assets/raw/player/img2img/pv-back-d92.png'), label: 'back img2img 0.92', note: 'turned — identity lost' },
        { file: resolve(REPO_ROOT, 'assets/raw/player/img2img/pv-side-d92.png'), label: 'side img2img 0.92', note: 'turned — identity lost' },
        { file: resolve(REPO_ROOT, 'assets/raw/player/img2img/pv-back-d80.png'), label: 'back img2img 0.80', note: 'identity held — never turned' },
      ],
      `${VIEWS_DIR}/_CONTACT-SHEET.png`,
    );

    await writeFile(
      `${VIEWS_DIR}/_acceptance.json`,
      JSON.stringify(
        {
          question: 'do the back and side read as the SAME CHARACTER as assets/approved-trials/player-APPROVED.png?',
          pipeline: 'trim -> nearestResample 32x48 -> quantize(data/palette.json, FROZEN) -> removeFlatBackground',
          reference: 'front (APPROVED)',
          shipped: ['back  DERIVED', 'side  DERIVED'],
          derivedNotGenerated: true,
          nativeDensity1024: native,
          measurements: out,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`\nwrote ${VIEWS_DIR}/derived/, ${VIEWS_DIR}/x12/, _acceptance.json, _CONTACT-SHEET.png`);
  } else {
    console.error(
      'usage: player-views.ts <emit-graph|sweep|derive|measure>\n' +
        '  emit-graph                     materialise tools/comfy/img2img-graph.json (no network)\n' +
        '  sweep --views= --denoise=      img2img from the approved front (BILLS CREDITS)\n' +
        '  derive | measure               build the derived 32x48 views and measure the acceptance bar',
    );
    process.exit(2);
  }
}
