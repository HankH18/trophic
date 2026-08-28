"""street.py — stand the hand-drawn pieces up as houses on real grass.

A tile family cannot be judged as tiles. It is judged as a house, at 1:1, on the
ground it will actually stand on, inside the window the player actually sees:
240x160 native = 15 x 10 cells. A 5-cell house is a third of that width.

The grass under it is the existing family, unmodified, from
assets/raw/_trials/tiles/grass/ — nothing here retouches another arm's pixels.

The slot model matches assets/raw/_trials/tiles/compose/compose.py: for a
footprint h cells tall, the BOTTOM row is wall, the row above it is eave, and
everything above that is roof. This file adds the two things that file's role
model cannot yet express — which COLUMN a cell is in (so corners get corner
pieces) and a per-footprint roof hue — because those are the two things the
silhouette verdict actually turned on.

Determinism (G11): every per-building choice — hue, door column, window columns,
where the dormer stands — is FNV-1a over the footprint's own anchor coordinate.
No Math.random, no random module, no clock. Composing twice gives identical
bytes, and that is asserted at the bottom of this file.

Scope: assets/raw/_trials/tiles/v2/handdrawn/ only.
"""

import os

from PIL import Image

import draw

HERE = draw.HERE
ROOT = draw.ROOT
N = draw.N
GRASS_DIR = os.path.join(ROOT, "assets", "raw", "_trials", "tiles", "grass")
SHORT_GRASS = ["short-grass-1", "short-grass-2", "short-grass-3"]

VIEW_COLS, VIEW_ROWS = 15, 10          # 240x160 native, the real camera window
HUE_ORDER = ["green", "red", "blue", "ochre"]


def fnv(key):
    h = 0x811C9DC5
    for ch in key:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


_cache = {}


def tile(family, name, hue=None):
    key = (family, name, hue)
    if key not in _cache:
        if family == "grass":
            im = Image.open(os.path.join(GRASS_DIR, name + ".png")).convert("RGB")
        else:
            im = draw.piece(name, hue).image()
        if im.size != (N, N):
            raise SystemExit("%s/%s is %s" % (family, name, im.size))
        _cache[key] = im
    return _cache[key]


def snap(rgb):
    best, bd = None, 1 << 30
    for p in draw.PAL.values():
        d = sum((a - b) ** 2 for a, b in zip(rgb, p))
        if d < bd:
            bd, best = d, p
    return best


_shade_map = {}


def shaded(rgb, k):
    """The 2px band of darkened ground on a building's south face — the same
    thing compose.py already paints under every blocking cell. Darkened, then
    snapped back onto the frozen 32, so the shadow cannot introduce a colour."""
    key = (rgb, k)
    if key not in _shade_map:
        _shade_map[key] = snap(tuple(int(v * k) for v in rgb))
    return _shade_map[key]


class Scene:
    def __init__(self, cols, rows):
        self.cols, self.rows = cols, rows
        self.im = Image.new("RGB", (cols * N, rows * N))
        self.px = self.im.load()
        self.blocked = set()

    def stamp(self, c, r, src):
        if not (0 <= c < self.cols and 0 <= r < self.rows):
            raise SystemExit("cell %d,%d is outside the scene" % (c, r))
        s = src.load()
        for y in range(N):
            for x in range(N):
                self.px[c * N + x, r * N + y] = s[x, y]

    def grass(self):
        for r in range(self.rows):
            for c in range(self.cols):
                self.stamp(c, r, tile("grass", draw_pick(SHORT_GRASS, c, r, "grass")))

    # ── one house ───────────────────────────────────────────────────────────
    def house(self, c0, r0, w, h, hue=None):
        """Slots for one footprint. Same shape as compose.py's role model —
        bottom row wall, the row above it eave, the rest roof — with two things
        that file cannot yet say: which COLUMN a cell is in, so a corner gets a
        corner piece, and how many wall COURSES a tall house gets.

        The courses matter more than they sound. compose.py spends every row
        above the eave on roof, so the 8x6 footprint hearthollow.txt actually
        authors comes out as 64px of unbroken rib — a barn, not a house. The
        reference's own big house is half roof and half wall, so anything 5 or
        more cells tall gets a second wall course here."""
        if w < 3 or h < 3:
            raise SystemExit("a house needs at least 3x3 cells to hold roof/eave/wall")
        anchor = "%d|%d" % (c0, r0)
        if hue is None:
            hue = HUE_ORDER[fnv("roofhue|" + anchor) % len(HUE_ORDER)]

        courses = 2 if h >= 5 else 1
        r_wall = r0 + h - 1
        rows_mid = list(range(r_wall - courses + 1, r_wall))
        r_eave = r_wall - courses
        rows_roof = list(range(r0, r_eave))
        interior = rows_roof[1:]

        # A crest line across a roof only three rows deep reads as an
        # unexplained shelf — the A/B is unambiguous at 1:1. It earns its place
        # from FOUR rows up, which is what a 7-cell footprint produces.
        r_ridge = interior[len(interior) // 2] if len(interior) >= 3 else None
        r_gable = interior[0] if interior and r_ridge != interior[0] else None
        c_gable = c0 + 1 + fnv("dormer|" + anchor) % max(1, w - 2) if r_gable else None

        # The door goes on the SOUTH face, in the bottom course, never on a
        # corner. Windows go on the upper course where there is one, so the
        # reference's arrangement holds: windows above, door at ground level.
        c_door = c0 + 1 + fnv("door|" + anchor) % max(1, w - 2)
        inner = [x for x in range(c0 + 1, c0 + w - 1) if x != c_door]
        far = [x for x in inner if abs(x - c_door) >= 2]
        pool = far or inner
        windows = pool[::2][:3]
        win_row = rows_mid[0] if rows_mid else r_wall

        for r in rows_roof:
            for cc in range(c0, c0 + w):
                edge = "left" if cc == c0 else ("right" if cc == c0 + w - 1 else "")
                if r == r0:
                    name = "roof-top" + ("-" + edge if edge else "")
                elif r == r_ridge:
                    name = "ridge" + ("-" + edge if edge else "")
                elif r == r_gable and cc == c_gable:
                    name = "gable"
                else:
                    name = "roof-body" if not edge else "roof-" + edge
                self.stamp(cc, r, tile("built", name, hue))
        for cc in range(c0, c0 + w):
            edge = "left" if cc == c0 else ("right" if cc == c0 + w - 1 else "")
            self.stamp(cc, r_eave, tile("built", "eave" + ("-" + edge if edge else ""), hue))
        for r in rows_mid:
            for cc in range(c0, c0 + w):
                if cc == c0:
                    name = "wall-mid-left"
                elif cc == c0 + w - 1:
                    name = "wall-mid-right"
                elif r == win_row and cc in windows:
                    name = "wall-mid-window"
                else:
                    name = "wall-mid"
                self.stamp(cc, r, tile("built", name, hue))
        for cc in range(c0, c0 + w):
            if cc == c0:
                name = "wall-left"
            elif cc == c0 + w - 1:
                name = "wall-right"
            elif cc == c_door:
                name = "door-leaf"
            elif not rows_mid and cc in windows:
                name = "wall-window"
            else:
                name = "wall-plain"
            self.stamp(cc, r_wall, tile("built", name, hue))

        for r in range(r0, r0 + h):
            for cc in range(c0, c0 + w):
                self.blocked.add((cc, r))
        return dict(hue=hue, at=(c0, r0), size=(w, h), courses=courses, door=c_door,
                    windows=windows, ridge=r_ridge, gable=(c_gable, r_gable))

    def south_shadow(self, depth=2, k=0.62):
        """Two rows of darkened ground on every south face. Applied last, so it
        never lands on a building — only on the ground a building stands over."""
        for (c, r) in sorted(self.blocked):
            if (c, r + 1) in self.blocked or r + 1 >= self.rows:
                continue
            for y in range(depth):
                yy = (r + 1) * N + y
                for x in range(N):
                    xx = c * N + x
                    self.px[xx, yy] = shaded(self.px[xx, yy], k)


def draw_pick(names, c, r, salt):
    return names[fnv("%s|%d|%d" % (salt, c, r)) % len(names)]


# ── the mock street ──────────────────────────────────────────────────────────
# Four footprints, four sizes, four hues. The 8x6 is not invented for the
# picture: it is the size tools/mapgen/layouts/hearthollow.txt actually authors
# (rows 44-51, cols 35-42), so the tall-roof case is the real case, not a
# flattering one.
PLAN = [
    dict(c0=0,  r0=0, w=8, h=6, hue="green"),
    dict(c0=10, r0=0, w=5, h=4, hue="ochre"),
    dict(c0=0,  r0=7, w=6, h=3, hue="red"),
    dict(c0=9,  r0=7, w=4, h=3, hue="blue"),
]

# The second window is not a nicer picture, it is the HARD case: both footprints
# are the sizes tools/mapgen/layouts/hearthollow.txt actually authors (8x6 at
# rows 44-51 cols 35-42, 6x7 at rows 37-43 cols 46-51). Four rows of roof is
# where a tile family either holds together or turns into a barn, so it gets its
# own 240x160 rather than being left to the reader's imagination.
PLAN_TALL = [
    dict(c0=0, r0=0, w=8, h=7, hue="red"),
    dict(c0=9, r0=0, w=6, h=7, hue="blue"),
]


def scene_of(plan):
    sc = Scene(VIEW_COLS, VIEW_ROWS)
    sc.grass()
    facts = [sc.house(**p) for p in plan]
    sc.south_shadow()
    return sc, facts


def street():
    return scene_of(PLAN)


def tall_street():
    return scene_of(PLAN_TALL)


def scale(im, k):
    return im.resize((im.width * k, im.height * k), Image.NEAREST)


def stack(images, gap=8, bg=(4, 3, 8)):
    w = max(i.width for i in images)
    hgt = sum(i.height for i in images) + gap * (len(images) - 1)
    out = Image.new("RGB", (w, hgt), bg)
    y = 0
    for i in images:
        out.paste(i, (0, y))
        y += i.height + gap
    return out


def contact_sheet():
    """Every piece, every hue, at 4x, with a 1:1 strip underneath so nobody
    judges a 16px tile at 64px. A review artefact, not a tile: the labels live
    here and never on the art."""
    from PIL import ImageDraw
    names = draw.all_names()
    # A dark gutter between tiles hides the very thing being reviewed: a piece
    # whose edge IS ink looks identical to one with no edge at all. The gutter
    # is mid-grey for that reason.
    k, pad, lab, head = 4, 6, 92, 46
    cw, chh = N * k + pad, N * k + pad
    W = lab + cw * len(names)
    H = head + chh * len(HUE_ORDER) + 34
    out = Image.new("RGB", (W, H), (136, 152, 165))
    d = ImageDraw.Draw(out)
    for j, name in enumerate(names):
        d.text((lab + j * cw + 2, 4), name.replace("-", "\n"), fill=(16, 18, 28))
    for i, hue in enumerate(HUE_ORDER):
        y = head + i * chh
        d.text((4, y + N * k // 2), hue, fill=(16, 18, 28))
        for j, name in enumerate(names):
            out.paste(scale(draw.piece(name, hue).image(), k), (lab + j * cw, y))
    y = head + chh * len(HUE_ORDER) + 12
    d.text((4, y + 2), "1:1", fill=(16, 18, 28))
    for j, name in enumerate(names):
        out.paste(draw.piece(name, "green").image(), (lab + j * cw, y))
    return out


def verify_scene(im, where):
    ok = set(draw.PAL.values())
    bad = [(n, col) for n, col in im.getcolors(1 << 20) if col not in ok]
    if bad:
        raise SystemExit("%s: off-palette %r" % (where, bad[:5]))
    return len(im.getcolors(1 << 20))


if __name__ == "__main__":
    sc, facts = street()
    uniq = verify_scene(sc.im, "mock street")

    # determinism: build it again from scratch and demand identical bytes
    again, _ = street()
    if sc.im.tobytes() != again.im.tobytes():
        raise SystemExit("the composer is not deterministic")

    sc.im.save(os.path.join(HERE, "_street-1x.png"))
    scale(sc.im, 3).save(os.path.join(HERE, "_street-3x.png"))
    stack([sc.im, scale(sc.im, 3)]).save(os.path.join(HERE, "_street.png"))
    contact_sheet().save(os.path.join(HERE, "_pieces-4x.png"))

    print("mock street 240x160, %d unique colours, all on the frozen 32" % uniq)
    for f in facts:
        print("  %-5s %dx%d at %-8s %d wall course(s)  door col %d  windows %s  "
              "ridge row %s  gable %s"
              % (f["hue"], f["size"][0], f["size"][1], f["at"], f["courses"], f["door"],
                 f["windows"], f["ridge"], f["gable"]))
