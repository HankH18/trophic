"""draw.py — the building tile family, drawn pixel by pixel. Zero generations.

WHY THIS IS A DRAWING JOB AND NOT A CUT
───────────────────────────────────────
The built family's own report says no roof in any of its generations ever met
grass with a dark outline, so there was nothing in the field to cut a silhouette
out of. The judge's verdict named that silhouette as ~85% of the "not Pokemon"
read. A silhouette cannot be recovered from a field that never had one; it has
to be authored. Every pixel below is placed by hand-written rule.

WHERE THE GRAMMAR CAME FROM
───────────────────────────
Measured, not remembered, off assets/reference/gen2/new-bark-town-gsc.png at 1:1
(320x288 native, so its 16px tiles land 1:1 on ours). The small house at cells
(2,10)-(6,11) and the big house at (4,0)-(9,3) were dumped pixel by pixel and the
rules read off them:

  roof top edge   1px of the darkest ink, spanning the whole roof width
  roof crest      the row directly under it is a full-width LIGHT row
  roof field      3px of field + 1px of rib, repeating on a 4px period, vertical
  roof foot       SHADE / INK / SHADE / INK — four rows, the double fascia, and
                  this is what makes the roof read as OVERHANGING the wall
  wall            near-white plaster, tan speckle on a 4-row cycle
  wall edge       2px tan corner post with a 1px dark line on its inside
  window          16px wide, 8px tall, dark frame, bright glass, cream mullions
  door            gold surround, dark reveal, glazed upper panel, timber leaf
  wall foot       5 rows: light / dark / dark / INK / light — and the very last
                  row is LIGHT, not ink: a Gold house has no bottom keyline, it
                  has a foundation lip that sits on the ground

Gold is the grammar. The colours, the roof shapes and the dormer are ours.

HARD RULES OBSERVED
───────────────────
· every pixel is an exact swatch from data/palette.json (asserted below, and by
  tests/gates/asset-palette-contract.test.ts on anything that ships)
· no text anywhere, on any tile, at any size
· no Math.random, no random module, no clock (G11): the only choice this file
  makes is which named piece to draw, and that is not a choice, it is a name

Scope: assets/raw/_trials/tiles/v2/handdrawn/ only.
"""

import json
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "..", "..", ".."))
N = 16


# ── the frozen palette ───────────────────────────────────────────────────────
def palette_hex():
    with open(os.path.join(ROOT, "data", "palette.json")) as fh:
        return [c["hex"].lower() for c in json.load(fh)["colors"]]


PAL_HEX = palette_hex()
PAL = {h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in PAL_HEX}


def c(hexs):
    """Look a colour up BY ITS HEX in the frozen palette. A hex that is not in
    the palette raises here, at authoring time, instead of shipping a stray
    pixel that the palette gate finds later."""
    h = hexs.lower()
    if h not in PAL:
        raise SystemExit("%s is not one of the 32 frozen swatches" % h)
    return PAL[h]


# ── ink and the shared house materials ───────────────────────────────────────
INK = c("#040308")          # c00 — the outline, and every dark line in the family

WALL = c("#faf7eb")         # c03 — plaster field, near-white as the reference is
SPECK = c("#ca9164")        # c10 — the speckle in the plaster; the reference
                            #       runs an 88-point value step here and a
                            #       gentler one vanished at 1:1
STUD = c("#8c5230")         # c07 — a timber stud, one per wall end
POST = c("#8c5230")         # c07 — corner post, shaded face
POST_HI = c("#ca9164")      # c10 — corner post, lit face
FOUND_HI = c("#f9dab4")     # c15 — the top course of the foundation
FOUND = c("#74564e")        # c06 — the foundation
STEP = c("#c8bca5")         # c12 — the lip the house stands on

WIN_BAR = c("#f8d80f")      # c16 — glass, lit
WIN_PANE = c("#d2e0e2")     # c02 — the mullions and the reflection; COOLER than
                            #       the plaster, so glass never reads as wall

DOOR_TRIM = c("#f8d80f")    # c16 — the gold surround. Pale gold on cream plaster
                            #       is two light warm colours; the reference uses its
                            #       brightest yellow here and that is why its doors
                            #       are findable from across the screen
DOOR_GLASS = c("#d2e0e2")   # c02 — the glazed upper panel
DOOR_LEAF = c("#8c5230")    # c07 — the timber leaf
DOOR_LINTEL = c("#f3a262")  # c11 — the lintel over the opening
DOOR_KICK = c("#aa7241")    # c09 — the kick panel
DOOR_KNOB = c("#f8d80f")    # c16 — the handle, one pixel wide

# ── the roof hues ────────────────────────────────────────────────────────────
# Four ramps, each hi > field > rib > shade in value, each drawn from the frozen
# 32. `rib` is deliberately a SMALL step off `field`: a big step is what turns a
# ribbed roof into corrugated sheeting, which is the read this family exists to
# kill. `shade` is a big step, and it is only ever used on the four eave rows,
# where a hard step is exactly what says "this edge is above the wall".
HUES = {
    "green": dict(hi="#d2e0e2", field="#68cb6c", rib="#49ae53", shade="#2d6f38"),
    "red":   dict(hi="#f7c398", field="#c72a1b", rib="#642c16", shade="#321410"),
    "blue":  dict(hi="#73e3e7", field="#3da2d7", rib="#2178bb", shade="#303271"),
    "ochre": dict(hi="#efc57a", field="#aa7241", rib="#8c5230", shade="#642c16"),
}


class Ramp:
    def __init__(self, spec):
        self.hi = c(spec["hi"])
        self.field = c(spec["field"])
        self.rib = c(spec["rib"])
        self.shade = c(spec["shade"])

    def tile(self, x):
        """The roof field: 3 of field, 1 of rib, on a 4px period. 16 is a whole
        number of periods, so the ribs run unbroken from cell to cell."""
        return self.rib if x % 4 == 3 else self.field


# ── a tiny 16x16 canvas ──────────────────────────────────────────────────────
class Cel:
    def __init__(self, fill=None):
        self.p = [[fill for _ in range(N)] for _ in range(N)]

    def px(self, x, y, col):
        if 0 <= x < N and 0 <= y < N:
            self.p[y][x] = col

    def row(self, y, col, x0=0, x1=N - 1):
        for x in range(x0, x1 + 1):
            self.px(x, y, col)

    def col(self, x, col, y0=0, y1=N - 1):
        for y in range(y0, y1 + 1):
            self.px(x, y, col)

    def box(self, x0, y0, x1, y1, col):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.px(x, y, col)

    def image(self):
        im = Image.new("RGB", (N, N))
        q = im.load()
        for y in range(N):
            for x in range(N):
                v = self.p[y][x]
                if v is None:
                    raise SystemExit("unpainted pixel at %d,%d" % (x, y))
                q[x, y] = v
        return im


# ── the plaster ──────────────────────────────────────────────────────────────
# Transcribed off the reference wall at native y=32..39: on a 4-row cycle the
# first row carries a fleck every 2px, the second and fourth carry one every
# 8px, the third is plain, and the 8px phase alternates every other cycle. The
# `wy` argument is the row's position in the WALL, not in the cell, so the
# texture runs continuously from the eave cell into the wall cell below it.
def plaster(cel, y, wy, x0=0, x1=N - 1):
    for x in range(x0, x1 + 1):
        v = WALL
        m4, m8 = wy % 4, wy % 8
        if m4 == 0:
            if x % 2 == 1:
                v = SPECK
        elif m4 in (1, 3):
            phase = 3 if m8 < 4 else 7
            if x % 8 == phase:
                v = SPECK
        cel.px(x, y, v)


def foundation(cel, x0=0, x1=N - 1):
    """The five rows every wall cell ends on. The LAST row is light, not ink —
    a Gold house has no bottom keyline; it has a lip standing on the ground."""
    cel.row(11, FOUND_HI, x0, x1)
    cel.row(12, FOUND, x0, x1)
    cel.row(13, FOUND, x0, x1)
    cel.row(14, INK, x0, x1)
    cel.row(15, STEP, x0, x1)


def wall_field(cel):
    """A whole wall cell of plaster, foundation included. Wall rows 8..18 —
    rows 0..7 of the wall live in the eave cell above."""
    for y in range(0, 11):
        plaster(cel, y, 8 + y)
    foundation(cel)


def left_post(cel, y0, y1):
    """1px ink, 2px post, 1px ink. Gold puts 2px of tan and one dark line on the
    inside; the outer ink line is ours, and it is the whole point of the job."""
    for y in range(y0, y1 + 1):
        cel.px(0, y, INK)
        cel.px(1, y, POST_HI)
        cel.px(2, y, POST)
        cel.px(3, y, INK)


def right_post(cel, y0, y1):
    for y in range(y0, y1 + 1):
        cel.px(12, y, INK)
        cel.px(13, y, POST_HI)
        cel.px(14, y, POST)
        cel.px(15, y, INK)


# ── the eave: four rows that make the roof overhang the wall ─────────────────
EAVE_TOP = 4          # ribs above this row
WALL_TOP_IN_EAVE = 8  # the wall becomes visible at this row of the eave cell


def eave_foot(cel, r, x0=0, x1=N - 1):
    cel.row(4, r.shade, x0, x1)
    cel.row(5, INK, x0, x1)
    cel.row(6, r.shade, x0, x1)
    cel.row(7, INK, x0, x1)


# ── the twelve pieces ────────────────────────────────────────────────────────
def roof_body(r):
    cel = Cel()
    for y in range(N):
        for x in range(N):
            cel.px(x, y, r.tile(x))
    return cel


def roof_top(r):
    cel = roof_body(r)
    cel.row(0, INK)
    cel.row(1, r.hi)
    return cel


def roof_left(r):
    cel = roof_body(r)
    cel.col(0, INK)
    cel.col(1, INK)
    cel.col(2, r.hi)
    return cel


def roof_right(r):
    cel = roof_body(r)
    cel.col(13, r.hi)
    cel.col(14, INK)
    cel.col(15, INK)
    return cel


def roof_top_left(r):
    cel = roof_left(r)
    cel.row(0, INK)
    cel.row(1, r.hi, 2, N - 1)
    cel.px(0, 1, INK)
    cel.px(1, 1, INK)
    return cel


def roof_top_right(r):
    cel = roof_right(r)
    cel.row(0, INK)
    cel.row(1, r.hi, 0, 13)
    cel.px(14, 1, INK)
    cel.px(15, 1, INK)
    return cel


def ridge(r):
    """A horizontal crest across an interior roof row. The real layouts carry
    footprints 6 and 7 cells tall, which is 4 rows of roof — 64px of one
    repeating rib is a wall of corduroy, and this is the row that breaks it."""
    cel = roof_body(r)
    cel.row(6, r.rib)
    cel.row(7, r.shade)
    cel.row(8, r.hi)
    cel.row(9, r.field)
    cel.row(10, r.field)
    return cel


def ridge_left(r):
    cel = ridge(r)
    cel.col(0, INK)
    cel.col(1, INK)
    cel.col(2, r.hi)
    return cel


def ridge_right(r):
    cel = ridge(r)
    cel.col(13, r.hi)
    cel.col(14, INK)
    cel.col(15, INK)
    return cel


def gable(r):
    """A CROSS GABLE: a wing of the same roof whose courses run east-west
    against the main pitch's north-south ribs, with its own lit ridge and an ink
    valley down each side where the two roofs meet.

    Two earlier drafts put a BOX on the roof — a dormer, then a raised block —
    and both read at 1:1 as a sticker rather than as architecture. A wing reads,
    because it is made of the same material and only the direction changes.
    This is the piece that keeps a 3-row roof from being 48px of corduroy."""
    cel = Cel()
    for y in range(N):
        for x in range(N):
            cel.px(x, y, r.rib if y % 4 == 3 else r.field)
    cel.row(7, r.hi)
    cel.row(8, r.rib)
    cel.col(0, INK)
    cel.col(15, INK)
    cel.px(0, 0, r.shade)
    cel.px(15, 0, r.shade)
    return cel


def eave(r):
    cel = roof_body(r)
    eave_foot(cel, r)
    for y in range(WALL_TOP_IN_EAVE, N):
        plaster(cel, y, y - WALL_TOP_IN_EAVE)
    return cel


def eave_left(r):
    cel = eave(r)
    cel.col(0, INK, 0, 7)
    cel.col(1, INK, 0, 7)
    for y in range(0, EAVE_TOP):
        cel.px(2, y, r.hi)
    left_post(cel, WALL_TOP_IN_EAVE, N - 1)
    return cel


def eave_right(r):
    cel = eave(r)
    cel.col(14, INK, 0, 7)
    cel.col(15, INK, 0, 7)
    for y in range(0, EAVE_TOP):
        cel.px(13, y, r.hi)
    right_post(cel, WALL_TOP_IN_EAVE, N - 1)
    return cel


def wall_plain():
    cel = Cel()
    wall_field(cel)
    return cel


def wall_left():
    cel = wall_plain()
    left_post(cel, 0, 13)
    cel.col(6, STUD, 0, 10)
    return cel


def wall_right():
    cel = wall_plain()
    right_post(cel, 0, 13)
    cel.col(9, STUD, 0, 10)
    return cel


def window_light(_y0):
    """One 16x8 window as a list of rows, straight off the reference: dark frame,
    a bar of glass along the head, then bar/pane/pane repeating, with a 2px dark
    mullion down the middle. Returned rather than stamped so the same drawing
    serves the lower course and the upper one."""
    rows = [[None] * N for _ in range(9)]
    rows[0] = [INK] * N
    for h in (0, 8):
        rows[1][h + 0] = INK
        for x in range(1, 7):
            rows[1][h + x] = WIN_BAR
        rows[1][h + 7] = INK
        for y in range(2, 7):
            rows[y][h + 0] = INK
            rows[y][h + 1] = WIN_BAR
            rows[y][h + 2] = WIN_PANE
            rows[y][h + 3] = WIN_PANE
            rows[y][h + 4] = WIN_BAR
            rows[y][h + 5] = WIN_PANE
            rows[y][h + 6] = WIN_PANE
            rows[y][h + 7] = INK
    rows[7] = [INK] * N
    rows[8] = [None] * N
    return rows


def wall_window():
    cel = wall_plain()
    win = window_light(1)
    for y in range(1, 9):
        for x in range(N):
            v = win[y - 1][x]
            if v is not None:
                cel.px(x, y, v)
    return cel


def door_leaf():
    """A DOOR IS A WHOLE CELL, the way the reference draws it: gold surround
    hard against the wall on both sides, an ink reveal, a glazed upper panel and
    a timber leaf standing on the step. Inset inside a panel of plaster it read
    as a smudge at 1:1, which is the only size that decides anything."""
    cel = wall_plain()
    cel.row(0, INK)
    for y in range(1, 14):
        cel.px(0, y, INK)
        cel.px(1, y, DOOR_TRIM)
        cel.px(2, y, INK)
        cel.px(13, y, INK)
        cel.px(14, y, DOOR_TRIM)
        cel.px(15, y, INK)
    cel.row(1, INK, 3, 12)
    cel.row(2, DOOR_LINTEL, 3, 12)
    cel.box(3, 3, 12, 4, DOOR_GLASS)
    cel.row(5, INK, 3, 12)
    cel.box(3, 6, 12, 11, DOOR_LEAF)
    cel.col(7, DOOR_KICK, 6, 11)
    cel.px(11, 9, DOOR_KNOB)
    cel.row(12, DOOR_KICK, 3, 12)
    cel.row(13, INK, 3, 12)
    cel.row(14, INK)
    cel.row(15, STEP)
    return cel


# ── the upper wall course ────────────────────────────────────────────────────
# A footprint 6 cells tall is what tools/mapgen/layouts/*.txt actually author.
# Spending four of those six rows on roof gives a barn, so a tall house gets a
# SECOND wall course, the way the reference's own big house does: windows on the
# upper course, the door on the lower. These carry no foundation — only the
# bottom course stands on the ground. The plaster cycle is 8 rows and a cell is
# 16, so one upper-course tile stacks at any depth without breaking the texture.
def wall_mid():
    cel = Cel()
    for y in range(N):
        plaster(cel, y, 8 + y)
    return cel


def wall_mid_window():
    cel = wall_mid()
    win = window_light(3)
    for y in range(3, 12):
        for x in range(N):
            v = win[y - 3][x]
            if v is not None:
                cel.px(x, y, v)
    return cel


def wall_mid_left():
    cel = wall_mid()
    left_post(cel, 0, N - 1)
    cel.col(6, STUD)
    return cel


def wall_mid_right():
    cel = wall_mid()
    right_post(cel, 0, N - 1)
    cel.col(9, STUD)
    return cel


# The twelve the job names, plus four edge pieces the twelve imply but do not
# name (a roof has a left and a right side below its top row, and so does a
# wall). They are additions, never substitutions.
NAMED = ["roof-top-left", "roof-top", "roof-top-right", "roof-body", "ridge", "gable",
         "eave-left", "eave", "eave-right", "wall-plain", "wall-window", "door-leaf"]
EXTRA = ["roof-left", "roof-right", "ridge-left", "ridge-right",
         "wall-left", "wall-right",
         "wall-mid", "wall-mid-window", "wall-mid-left", "wall-mid-right"]

ROOF_PIECES = {
    "roof-top-left": roof_top_left, "roof-top": roof_top, "roof-top-right": roof_top_right,
    "roof-body": roof_body, "roof-left": roof_left, "roof-right": roof_right,
    "ridge": ridge, "ridge-left": ridge_left, "ridge-right": ridge_right, "gable": gable,
    "eave-left": eave_left, "eave": eave, "eave-right": eave_right,
}
WALL_PIECES = {
    "wall-plain": wall_plain, "wall-window": wall_window, "door-leaf": door_leaf,
    "wall-left": wall_left, "wall-right": wall_right,
    "wall-mid": wall_mid, "wall-mid-window": wall_mid_window,
    "wall-mid-left": wall_mid_left, "wall-mid-right": wall_mid_right,
}


def piece(name, hue):
    if name in ROOF_PIECES:
        return ROOF_PIECES[name](Ramp(HUES[hue]))
    return WALL_PIECES[name]()


def all_names():
    return NAMED + EXTRA


# ── delivery ─────────────────────────────────────────────────────────────────
def verify(im, where):
    ok = set(PAL.values())
    for count, col in im.convert("RGB").getcolors(1 << 20):
        if col not in ok:
            raise SystemExit("%s: %d px of %s is off-palette" % (where, count, col))


def write_all():
    written = []
    for hue in HUES:
        d = os.path.join(HERE, hue)
        os.makedirs(d, exist_ok=True)
        for name in all_names():
            im = piece(name, hue).image()
            verify(im, "%s/%s" % (hue, name))
            p = os.path.join(d, name + ".png")
            im.save(p)
            written.append(p)
    return written


if __name__ == "__main__":
    files = write_all()
    print("wrote %d pieces (%d names x %d hues)" % (len(files), len(all_names()), len(HUES)))
    print("named:", " ".join(NAMED))
    print("extra:", " ".join(EXTRA))
    print("hues :", " ".join(sorted(HUES)))
