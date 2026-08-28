"""props.py — ONE prop pass for all seventeen props, all four families.

WHAT WAS BROKEN. tools/mapgen/compose/lib.py:87 maps '*' to ("prop-anchor", False,
True) and compose.Composer.resolve_char treats every anchor as a WALKABLE MARKER —
it paints the cell as whatever ground its neighbours are made of. That is right for
'@' (spawn) and 'D' (door, which the building plan draws separately) and WRONG for
'*', because '*' is the only anchor that stands for a THING. All seventeen props in
data/nodes/*.json therefore composed as bare terrain: the player walked to a patch
of ground and pressed interact.

WHAT THIS IS. One pass, `stamp`, run LAST — after paint_base, fringe_ground,
shoreline, keylines and south_shadow, over the finished image, before it is saved.
Running last is not convenience: build-doc §7.6 says props "overlay the painted
map", and a prop the keyline pass then boxes in ink, or the fringe pass then
autotiles against, is not an overlay.

FOUR FAMILIES, FOUR PLACEMENT RULES, ONE PASS. The rules are NOT unified, on
purpose — each is the rule its own lane drew its art against, and flattening four
rules into one would move art that was tuned at 1:1 against a specific cell:

  antler-stone (9)        FOOT-ANCHORED, 1 cell wide x 2 tall, body rising north
                          (the grammar a Gold tree uses). The sanctum ring is nine
                          footprints READ OUT OF sanctum.txt's own 'R' components,
                          never typed, and it never paints the centre cell.
  shell-kiln-shrine (2)   FOOT-ANCHORED, 3 wide x 2 tall, reaching up and sideways;
                          the sideways choice is CHECKED against the layout —
                          centred, then east, then west — because cindershelf's
                          shaft-head shrine would otherwise be printed on the shaft
                          timbering ('F' at col 22, row 30).
  sunken-idol (2)         SEATED ON WATER. The anchor is where the PLAYER stands
                          (brackwater's is the dock plank); the figure seats on the
                          first orthogonal water cell, and the water's DEPTH picks
                          the piece, which is what data/dialogue.json says separates
                          the region's two idols.
  sign-card (4)           BOTTOM-ALIGNED to the anchor cell, one cell wide x 20px,
                          so the base keyline lands on the anchor's bottom row and
                          the board rises 4px into the cell above. Variant by biome.

COLLISION IS UNTOUCHED AND CANNOT BE TOUCHED FROM HERE. Collision comes from the
layout through game/collision.ts gridFromAscii; this file writes pixels into a PNG.
Every anchor stays exactly as walkable as legend.ts says it is. That is a real
design tension for the eight standing stones and the two shrines — a granite block
you can walk through — and it is REPORTED (see run.py's walk-through table), not
resolved here by editing an approved layout.

PROVENANCE. compose.py records which kind of material wrote every pixel (GROUND,
BLOCK, BUILT, INK, SHADE, SHORE = 0..5) so verify.py's correspondence audit is a
measurement rather than a restatement of the layout. A prop is a SIXTH kind and
takes its own tag rather than borrowing BUILT. That is deliberate and it cuts both
ways, so it is stated plainly:
  · It keeps the shipped audit honest. `overhang_worst` asks how much of a WALKABLE
    cell is covered by its blocking neighbour's art leaking across the cell edge.
    A prop standing on its own anchor is not that, and tagging it BUILT would make
    every one of the seventeen read as a leak.
  · It also means the shipped audit says NOTHING about props — a pass that measures
    nothing is exactly the failure mode this project has been bitten by. run.py
    therefore adds the two measurements the shipped check cannot make: prop pixels
    per walkable cell (the "does it LOOK solid" number), and an assertion that every
    props[] entry in data/nodes/*.json actually put pixels somewhere.

DETERMINISM (G11). The only non-literal decisions are the sign's variant choice and
the contact shade's depth, both lib.pick / lib.jitter over the cell coordinate, the
same FNV-1a every ground and block tile already goes through. No Math.random, no
random module, no clock, no seed file. run.py composes every node twice and diffs
the bytes.

G2. Nothing here invents a prop. The seventeen ids, kinds and coordinates are read
from data/nodes/*.json at compose time — the same single source of truth the '*'
anchors came from, so there is no second table of prop positions (G3). A kind with
no piece is a loud failure, never a silent skip.

Scope: assets/raw/_trials/w10-props/compose/ only. The art is loaded from the four
drawing lanes' directories, unmodified.
"""

import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))

# props.py sits BESIDE lib.py in tools/mapgen/compose/, so `import lib` resolves with no
# sys.path insert and ROOT is lib's own. One definition of the repo root, not a second one
# computed by counting `..` — that count was correct only while this file lived five levels
# down under assets/raw/_trials/, and it is the kind of constant that goes wrong silently
# when a file moves.
#
# compose is NOT imported. compose.py is also a __main__ script (tools/mapgen/land.ts spawns
# it as one), so `import compose` from here would execute all of it a second time under a
# second module object. Everything this pass needs from the composer — the PROP provenance
# tag and the south-shade ink — is reached through the Composer INSTANCE it is handed:
# comp.PROP and comp.SHADOW_INK.
import lib          # noqa: E402

ROOT = lib.ROOT

# ── where each family's art lives ────────────────────────────────────────────
# LANDED. The four families now sit under tools/mapgen/compose/tiles/props/ beside the
# biome families, resolved through lib.family_dir exactly as they are. The trial lane's
# table pointed into assets/raw/_trials/w10-props/, which is gitignored (.gitignore:8)
# and therefore unreachable from a shipped tool — that path is why this table existed and
# why it is gone.
FAMILY_DIR = {
    "antler-stone":      lib.family_dir(os.path.join("props", "antler")),
    "shell-kiln-shrine": lib.family_dir(os.path.join("props", "shrine")),
    "sunken-idol":       lib.family_dir(os.path.join("props", "idol")),
    "sign-card":         lib.family_dir(os.path.join("props", "sign")),
}

# The sixth provenance kind lives on the Composer (compose.py) — comp.PROP — so there
# is ONE definition of it, not a copy here that can drift out of step with it.

FROZEN = set(lib.palette_rgb())


# ── the art ──────────────────────────────────────────────────────────────────
_CACHE = {}


def piece(kind, name):
    key = (kind, name)
    if key not in _CACHE:
        path = os.path.join(FAMILY_DIR[kind], name + ".png")
        if not os.path.exists(path):
            raise SystemExit("no such prop piece: %s/%s (%s)" % (kind, name, path))
        im = Image.open(path).convert("RGBA")
        # Every pixel an exact frozen-32 colour, checked here rather than trusted:
        # a piece is COPIED onto the map, never blended, so if it is on-palette at
        # load time the composed PNG cannot acquire a colour off the frozen 32.
        for y in range(im.height):
            for x in range(im.width):
                r, g, b, a = im.getpixel((x, y))
                if a not in (0, 255):
                    raise SystemExit("%s/%s has alpha %d at (%d,%d): a piece must be "
                                     "binary alpha or the paste is a blend" % (kind, name, a, x, y))
                if a and (r, g, b) not in FROZEN:
                    raise SystemExit("%s/%s writes %s at (%d,%d), not a frozen-32 colour"
                                     % (kind, name, (r, g, b), x, y))
        _CACHE[key] = im
    return _CACHE[key]


def props_of(node):
    with open(os.path.join(ROOT, "data", "nodes", node + ".json")) as fh:
        return json.load(fh).get("props") or []


def biome_of(node):
    with open(os.path.join(ROOT, "data", "nodes", node + ".json")) as fh:
        return json.load(fh)["biome"]


def cell_of(p, d):
    """MAP-NATIVE px -> cell, exactly as every layout header states it:
    col = floor(x / cellPx), row = floor(y / cellPx). Never retyped from a brief."""
    return int(p["x"]) // d["cell"], int(p["y"]) // d["cell"]


# ═════════════════════════════════════════════════════════════════════════════
# FAMILY 1 — antler-stone.  Lane: assets/raw/_trials/w10-props/antler/
# ═════════════════════════════════════════════════════════════════════════════
# prop id -> (piece, cells wide, cells tall, dx, dy), (dx,dy) the piece's top-left
# cell RELATIVE TO THE ANCHOR. Every route stone is (1,2,0,-1): the stone's foot
# sits on the authored coordinate and its body rises one cell north.
#
# Each of the eight is a DIFFERENT drawing, and each state is authored in
# tools/comfy/manifest.json _nodes.*.feature — nothing here invented a state (G2).
ANTLER_PLACEMENT = {
    "r1-antler-north":               ("antler-whole",      1, 2, 0, -1),
    "r1-antler-south":               ("antler-snapped",    1, 2, 0, -1),
    "r2-antler-causeway":            ("antler-leaning",    1, 2, 0, -1),
    "r3-antler-canopy":              ("antler-wedged",     1, 2, 0, -1),
    "r4-antler-vent":                ("antler-glazed",     1, 2, 0, -1),
    "r5-antler-vale":                ("antler-worn",       1, 2, 0, -1),
    "sanctum-approach-antler-gate":  ("antler-gate",       1, 2, 0, -1),
    "sanctum-approach-antler-inner": ("antler-unfinished", 1, 2, 0, -1),
    # sanctum-antler-ring is deliberately absent: it is NINE footprints, and they
    # are read out of sanctum.txt rather than typed from it. See ring_stones().
}
RING_PROP = "sanctum-antler-ring"


def ring_stones(body, d, anchor):
    """The nine rectangular 'R' components standing in the ring annulus.

    sanctum.txt's own header: "The one structure on the map is the ring of nine
    standing stones, drawn in 'R' at radius 8 from the middle with gaps between
    them." So the nine are FOUND by walking the layout's own 'R' components and
    keeping the rectangular ones whose centre is 5..11 cells from the arrival tile.
    Piece by shape and side: 3x2 north of centre is a stag facing in, 3x2 south is
    a back (the bible says every stone faces the centre, so the two south of it
    show their backs), 2x3 west and east are the side-on carvings.

    RAISES unless exactly nine are found. The bible says nine and the layout header
    says nine; a ring that quietly loses one is worse than a build that stops.
    """
    ac, ar = anchor
    seen, comps = set(), []
    for r in range(d["rows"]):
        for c in range(d["cols"]):
            if body[r][c] != "R" or (c, r) in seen:
                continue
            stack, cells = [(c, r)], []
            seen.add((c, r))
            while stack:
                x, y = stack.pop()
                cells.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    n = (x + dx, y + dy)
                    if n in seen or not (0 <= n[0] < d["cols"] and 0 <= n[1] < d["rows"]):
                        continue
                    if body[n[1]][n[0]] == "R":
                        seen.add(n)
                        stack.append(n)
            comps.append(cells)
    out = []
    for cells in comps:
        xs, ys = [x for x, _ in cells], [y for _, y in cells]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        w, h = x1 - x0 + 1, y1 - y0 + 1
        if len(cells) != w * h or (w, h) not in ((3, 2), (2, 3)):
            continue
        cx, cy = (x0 + x1) / 2.0 - ac, (y0 + y1) / 2.0 - ar
        if not (5.0 <= (cx * cx + cy * cy) ** 0.5 <= 11.0):
            continue
        if (w, h) == (3, 2):
            name = "ring-stag-3x2" if cy < 0 else "ring-back-3x2"
        else:
            name = "ring-stag-2x3-east" if cx < 0 else "ring-stag-2x3-west"
        out.append((name, x0, y0, w, h))
    if len(out) != 9:
        raise SystemExit("sanctum ring: found %d stones in the annulus, expected the "
                         "nine the bible and sanctum.txt's own header both name" % len(out))
    return sorted(out, key=lambda s: (s[2], s[1]))


def plan_antler(comp, node, p, col, row):
    if p["id"] == RING_PROP:
        return [(n, c0, r0, w, h, "ring (derived from sanctum.txt 'R' components)")
                for n, c0, r0, w, h in ring_stones(comp.body, comp.d, (col, row))]
    if p["id"] not in ANTLER_PLACEMENT:
        raise SystemExit("prop %s is an antler-stone with no piece; the family is "
                         "incomplete and a silent skip is not acceptable" % p["id"])
    name, w, h, dx, dy = ANTLER_PLACEMENT[p["id"]]
    return [(name, col + dx, row + dy, w, h, "foot-anchored, body rising north")]


# ═════════════════════════════════════════════════════════════════════════════
# FAMILY 2 — shell-kiln-shrine.  Lane: assets/raw/_trials/w10-props/shrine/
# ═════════════════════════════════════════════════════════════════════════════
# kind -> (interchangeable variants, cells wide, cells tall). Where one kind is two
# DIFFERENT authored objects the mapping is by id and is stated, not hashed:
#   dialogue 138 cindershelf-shrine-mine — "built of curved plates fitted without
#     mortar", "candles ... along the joins", "the hollows number nine ... and along
#     the far join four"                                        -> shrine-plates
#   dialogue 139 cindershelf-shrine-deep — "no joins anywhere: a single plate,
#     shoulder height, curving away on both sides"              -> shrine-single
# A hash could not have produced that mapping and must not be asked to.
SHRINE_PIECES = (["shrine-plates"], 3, 2)
SHRINE_BY_ID = {"cindershelf-shrine-deep": "shrine-single"}


def plan_shrine(comp, node, p, col, row):
    """Foot-anchored, reaching up and sideways — centred, then east, then west, and
    EVERY candidate cell is checked against the layout before it is used. A stamp
    that overpaints a wall is a wall with a shrine printed on it, and on cindershelf
    the centred candidate does exactly that: row 31 is "F#####F*", so the cell west
    of the shaft-head anchor is the shaft timbering and centred is refused."""
    names, w, h = SHRINE_PIECES
    name = SHRINE_BY_ID.get(p["id"]) or lib.pick(names, col, row, "prop:" + p["kind"])

    def clear(c0, r0):
        for dc in range(w):
            for dr in range(h):
                ch = comp.ch(c0 + dc, r0 + dr)
                if ch is None or lib.blocks(ch):
                    return False
        return True

    r0 = row - (h - 1)
    for c0, how in ((col - (w // 2), "centred"), (col, "east"), (col - (w - 1), "west")):
        if clear(c0, r0):
            return [(name, c0, r0, w, h, "foot-anchored, %s" % how)]
    raise SystemExit("shrine %s has no 3x2 footprint clear of blocking cells at "
                     "(%d,%d); refusing to paint over a wall" % (p["id"], col, row))


# ═════════════════════════════════════════════════════════════════════════════
# FAMILY 3 — sunken-idol.  Lane: assets/raw/_trials/w10-props/idol/
# ═════════════════════════════════════════════════════════════════════════════
# kind -> the character the figure is SEATED ON -> the piece. The piece is chosen by
# WATER DEPTH, and that is content rather than convenience: data/dialogue.json
# describes the region's two idols differently and the difference is how deep each
# stands. "Only the crown of the head is above water" / "Six feet out, no bottom"
# is the deep 'W'; "in shallower water than the one at the dock" is '~'. So the rule
# reproduces both authored descriptions from the layout with no table of node names,
# and a third idol placed later gets the right piece for where it is put.
IDOL_PIECES = {"W": "idol-crown", "~": "idol-standing"}
SEAT_ORDER = ((0, 1), (1, 0), (0, -1), (-1, 0))   # S, E, N, W — fixed, not searched


def plan_idol(comp, node, p, col, row):
    """The anchor is where the PLAYER stands, which is not always where the figure
    is. brackwater's anchor (24,45) resolves to the dock plank ':'; its south
    neighbour is the channel, which is where the authored line puts the figure —
    16px away against an interactionRadius of 48, so interaction is untouched.

    comp.resolve_char is used rather than the literal character, because the literal
    is '*' and tells you nothing about what the prop stands in. r2's anchor is '~'
    on all four sides and r2.txt's header says the idol "stands in the water, not on
    a bank"; a pass that reads '*' and gives up seats it a cell away for no reason.
    """
    here = comp.resolve_char(col, row)
    if here in IDOL_PIECES:
        sc, sr, name = col, row, IDOL_PIECES[here]
    else:
        for dc, dr in SEAT_ORDER:
            ch = comp.ch(col + dc, row + dr)
            if ch in IDOL_PIECES:
                sc, sr, name = col + dc, row + dr, IDOL_PIECES[ch]
                break
        else:
            raise SystemExit("prop %s is a sunken-idol at (%d,%d) with no water cell "
                             "it can stand in" % (p["id"], col, row))
    im = piece(p["kind"], name)
    h = (im.height + comp.cell - 1) // comp.cell          # 16px -> 1 cell, 24px -> 2
    # Bottom-aligned to the SEAT cell, so a 24-tall piece spills 8px into the cell
    # above — the reference set's own 16x32 convention, and what gives a prop
    # presence at 1:1. plan returns whole cells; stamp() bottom-aligns inside them.
    seat_ch = here if here in IDOL_PIECES else comp.ch(sc, sr)
    return [(name, sc, sr - (h - 1), 1, h,
             "seated on '%s' at (%d,%d), %dpx from the anchor (radius %d)"
             % (seat_ch, sc, sr, (abs(sc - col) + abs(sr - row)) * comp.cell,
                int(p.get("interactionRadius", 0))))]


# ═════════════════════════════════════════════════════════════════════════════
# FAMILY 4 — sign-card.  Lane: assets/raw/_trials/w10-props/sign/
# ═════════════════════════════════════════════════════════════════════════════
# biome (data/nodes/<id>.json `biome`) -> the variants that biome may use. This is
# the one family with a genuine per-biome cut, because a signboard is made of the
# same timber everywhere and only its WEATHERING and its contrast direction change:
# meadow and vale go bright against dark ground, forest goes DARK because
# bowerdeep's plank deck is already pale. Variant within a biome is lib.pick over
# the cell coordinate (G11).
SIGN_PIECES = {
    "Meadow": ["sign-meadow-1", "sign-meadow-2"],
    "Forest": ["sign-forest-1", "sign-forest-2"],
    "Vale":   ["sign-vale-1", "sign-vale-2"],
}


def plan_sign(comp, node, p, col, row):
    b = biome_of(node)
    if b not in SIGN_PIECES:
        raise SystemExit("node %s declares biome %r, which has no sign-card piece set"
                         % (node, b))
    name = lib.pick(SIGN_PIECES[b], col, row, "prop:" + p["kind"])
    im = piece(p["kind"], name)
    h = (im.height + comp.cell - 1) // comp.cell          # 20px -> 2 cells
    return [(name, col, row - (h - 1), 1, h, "bottom-aligned on the anchor cell (%s)" % b)]


PLANNERS = {
    "antler-stone":      plan_antler,
    "shell-kiln-shrine": plan_shrine,
    "sunken-idol":       plan_idol,
    "sign-card":         plan_sign,
}

# The families that lay their own contact shade on the ground at the prop's foot.
# It is drawn by the composer rather than baked into the piece because it is a
# BLEND WITH THE GROUND and only the composer knows the ground. Same rule and same
# mix as compose.Composer.south_shadow — 2 parts ground to 3 parts c30, snapped
# back through lib.snap, depth jittered 1..2 — because it is the same phenomenon
# and one map must not carry two different shadows.
# The idol and the sign do NOT take one: the idol stands in water and carries its
# own murk pool (authored: "The water directly under it is not [clear]"), and the
# sign lane drew its cast shadow into the piece and tuned the board against it.
SHADED = {"antler-stone", "shell-kiln-shrine"}


# ── the pass ─────────────────────────────────────────────────────────────────
def stamp(comp, node, report=None):
    """Composite every props[] entry of `node` onto an already-composed Composer.

    Returns one row per STAMP (the ring is nine stamps for one prop entry), and
    appends the same rows to `report` if given. Run LAST, over the finished image.
    """
    d = comp.d
    rows = []
    for p in props_of(node):
        kind = p.get("kind")
        if kind not in PLANNERS:
            raise SystemExit("%s: prop %s is kind %r, which no family draws. A prop "
                             "with no art is the defect this pass exists to fix; it "
                             "is not skipped silently." % (node, p.get("id"), kind))
        col, row = cell_of(p, d)
        if not (0 <= col < d["cols"] and 0 <= row < d["rows"]):
            raise SystemExit("%s: prop %s at cell (%d,%d) is off the map"
                             % (node, p["id"], col, row))
        for name, c0, r0, w, h, how in PLANNERS[kind](comp, node, p, col, row):
            im = piece(kind, name)
            if im.width != w * d["cell"] or im.height > h * d["cell"]:
                raise SystemExit("piece %s is %s but %s claims %dx%d cells"
                                 % (name, im.size, p["id"], w, h))
            ox = c0 * d["cell"]
            oy = (r0 + h) * d["cell"] - im.height          # bottom-aligned in its box
            written = 0
            for y in range(im.height):
                for x in range(im.width):
                    r, g, b, a = im.getpixel((x, y))
                    if not a:
                        continue
                    gx, gy = ox + x, oy + y
                    if not (0 <= gx < d["native"] and 0 <= gy < d["native"]):
                        raise SystemExit("piece %s for %s runs off the map at (%d,%d)"
                                         % (name, p["id"], gx, gy))
                    comp.put(gx, gy, (r, g, b), comp.PROP)
                    written += 1
            shade = _contact_shade(comp, im, ox, oy) if kind in SHADED else 0
            rows.append(dict(node=node, id=p["id"], kind=kind, piece=name,
                             anchor=(col, row), at=(c0, r0), cells=(w, h),
                             px=(im.width, im.height), origin=(ox, oy),
                             placement=how, drawn_px=written, shade_px=shade))
    if report is not None:
        report.extend(rows)
    return rows


def _contact_shade(comp, im, ox, oy):
    """The 2px of shade a standing thing lays on the ground at its foot."""
    n = 0
    for x in range(im.width):
        low = None
        for y in range(im.height - 1, -1, -1):
            if im.getpixel((x, y))[3]:
                low = y
                break
        if low is None or low >= im.height - 1:
            continue
        depth = lib.jitter(ox + x, oy + low, "prop-shade", 1, 2)
        for k in range(1, depth + 1):
            y = low + k
            if y >= im.height or im.getpixel((x, y))[3]:
                continue
            gx, gy = ox + x, oy + y
            if not (0 <= gx < comp.d["native"] and 0 <= gy < comp.d["native"]):
                continue
            cur = comp.px[gx, gy]
            mixed = tuple((cur[j] * 2 + comp.SHADOW_INK[j] * 3) // 5 for j in range(3))
            comp.put(gx, gy, lib.snap(mixed, comp.pal), comp.SHADE)
            n += 1
    return n
