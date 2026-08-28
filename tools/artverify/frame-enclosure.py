"""
FRAME ENCLOSURE — the instrument `void_pct` is not, and the reason it had to be written.

WHY
───
`regen-v3/_measure.py::void_pct` counts pixels that are NEAR-WHITE (all channels > 238) or
NEAR-BLACK (all channels < 14) and connected to the frame border. That definition cannot see a
GREY matte. On `regen-v4/lora-shipm/brackwater-s7.png` — a town floating inside a rounded-rectangle
grey panel, which is the framed-island failure in its purest form — `void_pct` returns **0.00**.
On `brackwater-s42`, a boardwalk island in a flat dark-grey field inside a light-grey border, it
returns **0.04**. Both were confirmed by eye before this file was written.

EVAL-STANDARD §0: "retire an instrument that produced a wrong answer; do not merely correct the
answer." `void_pct` is not wrong about white and black. It is being READ as "is this map
full-bleed", and for that question it is blind in the one colour the failure actually uses.

§0 also retired an ad-hoc bottom-band detector which "was measuring the bottom strip's dominant
colour differs from the middle — which is true of a grey frame around the whole image, a different
and worse defect. It found something real and named it wrong." **That statistic was not wrong; its
NAME was.** This file is that statistic under the name it should have had, generalised from one
strip to the whole perimeter — and, per §0, revalidated against synthetics with known answers
before any number it produced was believed.

WHAT IS MEASURED — two numbers, and they catch different failures
─────────────────────────────────────────────────────────────────
  matte    Border-connected pixels within L-inf 12 of the OUTER RING'S MODAL COLOUR, as a % of
           frame. This is `void_pct`'s flood fill with "white or black" replaced by "whatever
           colour the border actually is". It catches a flat matte of ANY colour. It does NOT
           catch a frame drawn as textured material (a stone wall, a hedge, a ring of trees),
           because such a frame is not one colour — `enclosure` is what catches those.

  enclosure  share of the outer 48-px ANNULUS held by its single modal colour, divided by that
           same colour's share of the central half of the frame by area. A map whose ground runs off all four sides
           has the same material at the border and in the middle, so the ratio sits near 1. A map
           inside a frame has a border material that is rare or absent in the middle, so the ratio
           climbs without bound. Reported capped at 999.

  Both are whole-frame readings and neither is a ground-texture measurement. Do not quote either
  beside a `p2`/`conc`/`alt` figure without saying so — EVAL-STANDARD §2's rule that a whole-map
  and a ground-patch number may never share a name applies to these too.

WHAT THIS INSTRUMENT CANNOT DO — stated, not left to be found
────────────────────────────────────────────────────────────
 1. `enclosure` cannot tell a FRAME from a legitimate composition whose border material is simply
    not present in the centre — a map that is forest all round a central clearing scores high and
    may be perfectly good art. It flags "the edge is made of something the middle is not". A human
    decides whether that is a frame or a glade. It is a POINTER AT AN IMAGE, never a verdict.
 2. `matte` is a single-colour test. A frame drawn in two greys defeats it; the dither in this
    pipeline makes near-flat regions two-toned, which is why the tolerance is 12 rather than 0
    and why `enclosure` is quoted beside it rather than instead of it.
 3. Neither sees a frame that occupies less than a pixel of the outermost ring — a matte inset
    from the true edge is invisible to `matte` (its flood never starts) and only partly visible to
    `enclosure`. No such case has been observed; it is a hole, not a caveat.
 4. Gold's own maps are captured to the tile grid, so their border row IS the ground. That is what
    makes them a usable control, and it also means this instrument has never been checked against
    a legitimately-framed reference, because there is not one.

MEASURED HIT RATE — 4 of 7, and the three it misses are named
────────────────────────────────────────────────────────────
Against a by-eye pass over all 24 cells of `regen-v4/lora-shipm`, seven were judged framed. Flagging
on `border_modal >= 50% and border_modal > 2 x core_modal`:

    CAUGHT   brackwater-s7 (70.0/11.2) · brackwater-s42 (75.1/7.3) · sanctum-s42 (62.7/5.7)
             · bowerdeep-s7 (53.7/12.6)
    MISSED   bowerdeep-s42   — hedge ring, textured, no single colour holds the border (33.1/2.1);
                                its `enclosure` is 15.7x, the highest in the round, so the RATIO
                                sees it and the threshold does not
             sanctum-s1234   — plinth, border grey but only 36.5% of the annulus
             hearthollow-s7  — a drawn stone WALL on all four sides; border_modal 13.2%. Invisible
                                to both numbers, exactly as caveat 2 predicts.

**So this is a pointer, not a gate, and it under-reports.** A frame drawn as material defeats it
completely. It exists because `void_pct` caught ONE of the seven and read 0.00-0.04% on the three
worst; it is better than that and it is not enough. The by-eye pass is still the measurement.

Reference control, same rule: all eight Gen-2 captures read border_modal 17.1-40.0, core 3.3-21.3,
enclosure 0.8-7.5, and none is flagged. Note `enclosure` alone does NOT separate — new-bark reads
7.5x, above four of our framed cells — which is why the pair is quoted and the threshold is on
`border_modal` with the ratio as a second condition.
"""
import sys, os, json
import numpy as np
from collections import deque

ROOT = '/Users/hankholcomb/Documents/code_parent_folders/gauntlet_repos/trophic'
sys.path.insert(0, f'{ROOT}/assets/raw/_trials/regen-v3')
from _post import load_rgb                                    # noqa: E402
from _measure import void_pct                                 # noqa: E402  — quoted for contrast

ANNULUS = 48
TOL = 12


def _key(img):
    return (img[:, :, 0].astype(np.int64) << 16) | (img[:, :, 1].astype(np.int64) << 8) | img[:, :, 2].astype(np.int64)


def _modal(k):
    c, n = np.unique(k, return_counts=True)
    return int(c[int(np.argmax(n))])


def matte_pct(img):
    """void_pct's flood fill, with white|black replaced by the border's own modal colour."""
    k = _key(img)
    h, w = k.shape
    ring = np.concatenate([k[0], k[-1], k[:, 0], k[:, -1]])
    m = _modal(ring)
    target = np.array([(m >> 16) & 255, (m >> 8) & 255, m & 255], dtype=np.int16)
    cand = (np.abs(img.astype(np.int16) - target).max(2) <= TOL)
    if not cand.any():
        return 0.0
    seen = np.zeros_like(cand)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if cand[y, x] and not seen[y, x]:
                seen[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if cand[y, x] and not seen[y, x]:
                seen[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and cand[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True; q.append((ny, nx))
    return 100.0 * float(seen.mean())


def enclosure(img, a=ANNULUS):
    k = _key(img)
    h, w = k.shape
    inner = np.zeros((h, w), bool); inner[a:h - a, a:w - a] = True
    ann = k[~inner]
    m = _modal(ann)
    # central HALF by fraction, never a fixed pixel count: a fixed 512 window is the whole frame
    # on a 512-px synthetic, which is the bug the selftest caught before any number was believed.
    core = k[h // 4:h - h // 4, w // 4:w - w // 4]
    bs = float((ann == m).mean())
    cs = float((core == m).mean())
    return round(bs * 100, 2), round(cs * 100, 2), round(min(bs / max(cs, 1e-6), 999.0), 1)


def selftest():
    """Three synthetics whose answers are known in advance, per EVAL-STANDARD §0."""
    rng = np.random.default_rng(0)
    N = 512
    ok = True

    def chk(label, got, lo, hi):
        nonlocal ok
        good = lo <= got <= hi
        ok &= good
        print(f"  {'PASS' if good else 'FAIL'}  {label:44s} {got:8.2f}   expected {lo}..{hi}")

    # S1 full bleed: two-tone dithered ground everywhere
    g = np.zeros((N, N, 3), np.uint8)
    chk3 = (np.indices((N, N)).sum(0) % 2).astype(bool)
    g[chk3] = (60, 140, 60); g[~chk3] = (90, 175, 90)
    bs, cs, e = enclosure(g)
    chk('S1 full-bleed dithered ground  matte', matte_pct(g), 0, 60)   # a checker IS 50% one colour
    chk('S1 full-bleed dithered ground  enclosure', e, 0.8, 1.25)

    # S2 flat grey border 64px around the same ground
    b = g.copy(); b[:64] = b[-64:] = b[:, :64] = b[:, -64:] = (128, 128, 128)
    bs, cs, e = enclosure(b)
    chk('S2 64px flat grey border       matte', matte_pct(b), 40, 48)  # true area 43.75%
    chk('S2 64px flat grey border       enclosure', e, 100, 999)

    # S3 island: content only in the central 60%, grey elsewhere
    i = np.full((N, N, 3), 128, np.uint8)
    lo, hi = int(N * .2), int(N * .8)
    i[lo:hi, lo:hi] = g[lo:hi, lo:hi]
    bs, cs, e = enclosure(i)
    chk('S3 island in grey field        matte', matte_pct(i), 60, 68)  # true area 64%
    chk('S3 island in grey field        enclosure', e, 100, 999)

    # S4 a legitimately dark ground that void_pct WOULD flag, to show the two differ
    d = np.zeros((N, N, 3), np.uint8)
    d[chk3] = (4, 4, 6); d[~chk3] = (10, 12, 10)
    print(f"  note  near-black full-bleed ground: void_pct {void_pct(d):.2f}  matte {matte_pct(d):.2f}  "
          f"enclosure {enclosure(d)[2]}")
    return 0 if ok else 1


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if '--selftest' in sys.argv:
        print('SELFTEST — synthetics with known answers')
        sys.exit(selftest())
    print(f"{'name':30s} {'void%':>7s} {'matte%':>7s} {'bord%':>7s} {'core%':>7s} {'encl':>7s}")
    out = []
    for p in args:
        img = load_rgb(p)
        bs, cs, e = enclosure(img)
        r = dict(name=os.path.basename(p)[:-4], void=round(void_pct(img), 2),
                 matte=round(matte_pct(img), 2), border_modal=bs, core_modal=cs, enclosure=e)
        out.append(r)
        print(f"{r['name']:30s} {r['void']:7.2f} {r['matte']:7.2f} {bs:7.2f} {cs:7.2f} {e:7.1f}", flush=True)
    if '--json' in sys.argv:
        json.dump(out, open('/tmp/frame-enclosure.json', 'w'), indent=1)
