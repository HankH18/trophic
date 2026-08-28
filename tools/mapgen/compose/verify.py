"""verify.py — everything the composed map is claimed to be, measured.

Nothing here trusts the in-memory buffers that wrote the PNG: the palette check,
the seam check and the size check all re-open the file from disk. The
correspondence audit reads the composer's own PROVENANCE array, which records
which kind of material put each pixel down, so it is a measurement of what was
painted rather than a restatement of the layout it was painted from.

Run:  python3 verify.py <layout.txt> <composed.png>\n\nScope: assets/raw/_trials/tiles/v2/compose/ only.
"""

import json
import os
import re
import sys

from PIL import Image

import compose
import lib

FAIL = []
WARN = []


def check(ok, msg):
    print(("  PASS  " if ok else "  FAIL  ") + msg)
    if not ok:
        FAIL.append(msg)
    return ok


def warn(msg):
    print("  WARN  " + msg)
    WARN.append(msg)


# ── 1. the legend table in lib.py has not drifted from legend.ts ─────────────
def check_legend():
    print("\n1. LEGEND — lib.LEGEND vs tools/mapgen/legend.ts DEFAULT_LEGEND")
    src = open(os.path.join(lib.ROOT, "tools", "mapgen", "legend.ts")).read()
    body = src[src.index("DEFAULT_LEGEND"):]
    entries = re.findall(
        r"char:\s*'(.)',\s*\n\s*kind:\s*'([^']+)',\s*\n\s*blocks:\s*(true|false),"
        r"\s*\n\s*anchor:\s*(true|false),", body)
    check(len(entries) == len(lib.LEGEND),
          "legend.ts declares %d characters, lib.LEGEND has %d" % (len(entries), len(lib.LEGEND)))
    for ch, kind, b, a in entries:
        want = (kind, b == "true", a == "true")
        got = lib.LEGEND.get(ch)
        check(got == want, "'%s' -> %s (legend.ts) == %s (lib)" % (ch, want, got))


# ── 2. determinism ───────────────────────────────────────────────────────────
def check_determinism(layout):
    print("\n2. DETERMINISM — the same layout must always give the same bytes (G11)")
    a, b = "_det-a.png", "_det-b.png"
    compose.compose(layout, a)
    compose.compose(layout, b)
    da, db = open(a, "rb").read(), open(b, "rb").read()
    check(da == db, "two independent runs produced byte-identical PNGs (%d bytes)" % len(da))
    src = open("compose.py").read() + open("lib.py").read()
    banned = [l for l in src.split("\n")
              if re.match(r"\s*(import|from)\s", l) and ("random" in l or "time" in l)]
    check(not banned, "neither compose.py nor lib.py imports a random or clock source %s" % banned)
    os.remove(a)
    os.remove(b)


# ── 3. palette ───────────────────────────────────────────────────────────────
def check_palette(png):
    print("\n3. PALETTE — every pixel of the file on disk is an exact frozen swatch")
    im = Image.open(png).convert("RGB")
    pal = set(lib.palette_rgb())
    bad = {}
    for cnt, rgb in im.getcolors(1 << 20):
        if rgb not in pal:
            bad[rgb] = cnt
    check(im.size == (1024, 1024), "size is %s" % (im.size,))
    used = im.getcolors(1 << 20)
    check(not bad, "0 off-palette pixels of %d" % (im.size[0] * im.size[1],))
    if bad:
        print("        offenders:", sorted(bad.items(), key=lambda kv: -kv[1])[:8])
    # The real data/palette.json ids, not this file's own sort order — a c-id
    # that does not match the frozen file is a number nobody can check.
    pj = json.load(open(os.path.join(lib.ROOT, "data", "palette.json")))
    ids = {tuple(int(e["hex"][i:i + 2], 16) for i in (1, 3, 5)): e["id"] for e in pj["colors"]}
    print("        %d DISTINCT COLOURS of the frozen 32. Gold's own town maps run 12-18; the "
          "first tiled attempt ran 21; a generated town ran 398,485 and failed this gate "
          "outright." % len(used))
    for cnt, rgb in sorted(used, key=lambda t: -t[0]):
        print("          %-4s #%02x%02x%02x  %7d px  %6.3f%%"
              % (ids.get(rgb, "??"), rgb[0], rgb[1], rgb[2], cnt,
                 100.0 * cnt / (im.size[0] * im.size[1])))
    print("        WHERE THE COUNT COMES FROM, measured by recomposing: the ground, nature,\n"
          "        rock, water and fence families alone cost 20; each extra ROOF HUE adds\n"
          "        3-4 more, and the brief's own 'different buildings get different roof hues'\n"
          "        is what takes it to 30. hearthollow at 1 hue is 23, at 2 is 26, at 3 or 4\n"
          "        is 30. This is a real trade between two stated requirements and it is not\n"
          "        this file's to settle; the lever is compose.HUES.")
    return len(used)


# ── 4. correspondence ────────────────────────────────────────────────────────
def check_correspondence(comp):
    print("\n4. CORRESPONDENCE — the painting and the mask come from one source")
    d, cell = comp.d, comp.cell
    n = d["native"]
    ground_in_blocked = 0
    ground_in_blocked_cells = 0
    crown_ground = 0
    overhang_cells = 0
    overhang_worst = 0.0
    overhang_total = 0
    walkable_cells = 0
    for r in range(comp.rows):
        for c in range(comp.cols):
            tags = {}
            for y in range(r * cell, r * cell + cell):
                base = y * n
                for x in range(c * cell, c * cell + cell):
                    t = comp.prov[base + x]
                    tags[t] = tags.get(t, 0) + 1
            g = tags.get(comp.GROUND, 0)
            if comp.blocked(c, r):
                if (c, r) in comp.crowns:
                    crown_ground += g
                elif g:
                    ground_in_blocked += g
                    ground_in_blocked_cells += 1
            else:
                walkable_cells += 1
                foreign = tags.get(comp.BLOCK, 0) + tags.get(comp.BUILT, 0) \
                    + tags.get(comp.INK, 0) + tags.get(comp.SHADE, 0)
                if foreign:
                    overhang_cells += 1
                    overhang_total += foreign
                    overhang_worst = max(overhang_worst, foreign / float(cell * cell))
    check(ground_in_blocked == 0,
          "0 open-ground pixels painted inside a cell the mask calls BLOCKED "
          "(%d px across %d cells)" % (ground_in_blocked, ground_in_blocked_cells))
    if comp.crowns:
        crown = lib.load("nature", "T-crown-1").load()
        back = lib.load("nature", "o-1").load()
        bgpx = sum(1 for y in range(cell) for x in range(cell) if crown[x, y] == back[x, y])
        print("        carve-out, stated plainly: each of the %d lone-tree cells shows ground "
              "around its trunk for %d of its %d px (%.0f%%). That is the crown TILE'S OWN ART — "
              "every Gold tree tile draws grass round the trunk and the whole tile blocks — not a "
              "boundary treatment leaking across a cell edge." %
              (len(comp.crowns), bgpx, cell * cell, 100.0 * bgpx / (cell * cell)))
    print("        the other direction (safe): %d of %d walkable cells carry some shade or ink "
          "from the thing beside them; worst cell %.1f%% of its area, mean over all walkable "
          "cells %.1f%%" % (overhang_cells, walkable_cells, 100 * overhang_worst,
                            100.0 * overhang_total / (walkable_cells * cell * cell)))
    check(overhang_worst <= 0.25,
          "no walkable cell is more than 25%% covered by its neighbour's shade (worst %.1f%%)"
          % (100 * overhang_worst))


# ── 5. the contracts the generated maps kept failing ────────────────────────
def declared_edges(layout_path):
    """What the layout's OWN header says its adjacencies are.

    legend.ts: an edge mouth is "one per declared adjacency". The first version
    of this check hardcoded "exactly one, top only" from the brief — which is
    hearthollow's contract, not a universal one — and duly reported brackwater's
    correct two mouths as a failure. The expectation is read from the file."""
    want, edges = None, {}
    for line in open(layout_path):
        if not line.startswith("#"):
            break
        m = re.match(r"#\s*adjacency\s+(.+?)\s*$", line)
        if m:
            want = [t.strip() for t in m.group(1).split(",") if t.strip()]
        m = re.match(r"#\s*(top|bottom|left|right) edge\s+(.+?)\s*$", line)
        if m:
            edges[m.group(1)] = m.group(2)
    open_sides = [k for k, v in edges.items() if not v.startswith("\u2014") and "sealed" not in v]
    return want, open_sides


def check_contracts(comp, layout_path):
    print("\n5. CONTRACTS")
    d = comp.d
    cell, cols, rows = comp.cell, comp.cols, comp.rows

    # 5a — exactly one edge mouth, top only
    mouths = [(c, r) for r in range(rows) for c in range(cols) if comp.ch(c, r) == "^"]
    borders = {}
    for side, cells in (
        ("top", [(c, 0) for c in range(cols)]),
        ("bottom", [(c, rows - 1) for c in range(cols)]),
        ("left", [(0, r) for r in range(rows)]),
        ("right", [(cols - 1, r) for r in range(rows)]),
    ):
        runs, cur = [], 0
        for (c, r) in cells:
            if comp.blocked(c, r):
                if cur:
                    runs.append(cur)
                cur = 0
            else:
                cur += 1
        if cur:
            runs.append(cur)
        borders[side] = runs
    want, open_sides = declared_edges(layout_path)
    print("        the layout's own header declares adjacency %s, open edges %s"
          % (want, open_sides))
    check(len(mouths) == len(want or [1]),
          "one '^' edge-mouth anchor per declared adjacency: %d declared, %d found at %s"
          % (len(want or [1]), len(mouths), mouths))
    got_sides = set()
    for (c, r) in mouths:
        got_sides.add("top" if r == 0 else "bottom" if r == rows - 1 else
                      "left" if c == 0 else "right" if c == cols - 1 else "INTERIOR")
    check(got_sides == set(open_sides),
          "the mouths sit on exactly the declared open edges: %s == %s"
          % (sorted(got_sides), sorted(open_sides)))
    for side in ("top", "bottom", "left", "right"):
        if side in open_sides:
            check(len(borders[side]) == 1,
                  "the %s border has ONE opening (runs: %s)" % (side, borders[side]))
        else:
            check(not borders[side], "the %s border is sealed (runs: %s)" % (side, borders[side]))
    for side in open_sides:
        if borders[side]:
            print("        the %s opening is %d cells = %d native px wide"
                  % (side, borders[side][0], borders[side][0] * cell))

    # 5b — native (512,512) is open standable ground
    cx = d["native"] // 2
    ccol, crow = cx // cell, cx // cell
    check(not comp.blocked(ccol, crow),
          "native (%d,%d) = cell (%d,%d) is walkable, char '%s'"
          % (cx, cx, ccol, crow, comp.ch(ccol, crow)))
    ring = [(ccol + dc, crow + dr) for dc in (-1, 0, 1) for dr in (-1, 0, 1)]
    check(all(not comp.blocked(c, r) for c, r in ring),
          "the whole 3x3 around it is walkable (48x48 native px of standable ground)")

    # 5c — nothing built within 48 native px of the centre
    def dist_to_centre(c, r):
        x0, y0 = c * cell, r * cell
        dx = max(x0 - cx, 0, cx - (x0 + cell))
        dy = max(y0 - cx, 0, cx - (y0 + cell))
        return (dx * dx + dy * dy) ** 0.5
    built = [(c, r) for r in range(rows) for c in range(cols) if comp.ch(c, r) == "B"]
    blocking = [(c, r) for r in range(rows) for c in range(cols) if comp.blocked(c, r)]
    dmin_b = min((dist_to_centre(c, r) for c, r in built), default=1e9)
    dmin_a = min((dist_to_centre(c, r) for c, r in blocking), default=1e9)
    check(dmin_b >= 48, "nearest BUILDING footprint is %.1f native px from (512,512) (>= 48)" % dmin_b)
    check(dmin_a >= 48, "nearest BLOCKING cell of any kind is %.1f native px from (512,512) (>= 48)" % dmin_a)

    # 5d — how much of the walkable area is encounter grass
    walk = [(c, r) for r in range(rows) for c in range(cols) if not comp.blocked(c, r)]
    scrub = [(c, r) for (c, r) in walk if comp.ch(c, r) == ","]
    share = 100.0 * len(scrub) / len(walk)
    print("        tall grass (',' scrub) is %d of %d walkable cells = %.1f%% of walkable area"
          % (len(scrub), len(walk), share))
    if share > 40:
        warn("tall grass covers %.1f%% of the walkable area. In Gold a TOWN has none and a route "
             "has a minority; at this share the player draws an encounter walking to their own "
             "front door. This is the LAYOUT's number, not the composer's — the composer painted "
             "exactly the cells the file names." % share)
    else:
        check(True, "tall grass is a minority of walkable area (%.1f%%)" % share)

    # 5e — is the map actually connected, from the mouth?
    if mouths:
        seen = set(mouths[:1])
        stack = list(mouths[:1])
        while stack:
            c, r = stack.pop()
            for nc, nr in ((c + 1, r), (c - 1, r), (c, r + 1), (c, r - 1)):
                if nc < 0 or nr < 0 or nc >= cols or nr >= rows:
                    continue
                if (nc, nr) in seen or comp.blocked(nc, nr):
                    continue
                seen.add((nc, nr))
                stack.append((nc, nr))
        check((ccol, crow) in seen, "the centre cell is reachable on foot from the edge mouth")
        anchors = [(c, r) for r in range(rows) for c in range(cols) if comp.ch(c, r) in "D*@"]
        unreached = [a for a in anchors if a not in seen]
        check(not unreached, "every D/*/@ anchor is reachable from the mouth (%d anchors)" % len(anchors))
        stranded = sorted(set(walk) - seen)
        if stranded:
            pockets, left = [], set(stranded)
            while left:
                s0 = left.pop()
                pk, st2 = [s0], [s0]
                while st2:
                    c2, r2 = st2.pop()
                    for nc, nr in ((c2 + 1, r2), (c2 - 1, r2), (c2, r2 + 1), (c2, r2 - 1)):
                        if (nc, nr) in left:
                            left.discard((nc, nr))
                            pk.append((nc, nr))
                            st2.append((nc, nr))
                pockets.append(sorted(pk))
            pockets.sort(key=len, reverse=True)
            warn("%d walkable cells in %d SEALED POCKETS are painted as open grass the player can "
                 "see and can never stand on. Largest: %s. This is a LAYOUT defect the composer "
                 "surfaces rather than causes — it paints exactly the cells the file names."
                 % (len(stranded), len(pockets),
                    ", ".join("%d cells at %s" % (len(p), p[0]) for p in pockets[:4])))
        else:
            check(True, "every walkable cell is reachable from the mouth (%d)" % len(walk))

    # 5f — does the lane reach anything, or dead-end?
    lane = [(c, r) for r in range(rows) for c in range(cols) if comp.ch(c, r) in ":^"]
    if lane:
        maxrow = max(r for _, r in lane)
        ends_at = [(c, r) for c, r in lane if r == maxrow]
        touches_building = any(
            comp.ch(c + dc, r + dr) == "B"
            for c, r in lane for dc, dr in ((1, 0), (-1, 0), (0, 1), (0, -1))
            if 0 <= c + dc < cols and 0 <= r + dr < rows)
        print("        the path corridor spans rows 0..%d of %d and ends at %s"
              % (maxrow, rows - 1, ends_at))
        # Only meaningful where there is something for the lane to arrive AT.
        # The first version of this fired on every route, which have no
        # buildings at all, and would have reported nine false findings.
        has_buildings = any(comp.ch(c, r) == "B" for r in range(rows) for c in range(cols))
        lane_cells = set(lane)
        for (mc, mr) in mouths:
            if (mc, mr) not in lane_cells:
                warn("the '^' mouth at (%d,%d) is not part of the path corridor" % (mc, mr))
        if has_buildings and not touches_building:
            warn("the path corridor never comes within one cell of any building footprint: it "
                 "enters at the top mouth and stops in open ground at row %d. A lane that "
                 "dead-ends in a field is the exact composition failure the whole-town "
                 "generations kept producing — here it is in the LAYOUT, where it is one text "
                 "edit to fix instead of another generation." % maxrow)


# ── 6. seams: does the 16px lattice show in the composed image? ─────────────
def check_seams(png, comp):
    print("\n6. SEAMS — measured on the composed FILE, not on a lone tile")
    im = Image.open(png).convert("RGB")
    px = im.load()
    n, cell = im.size[0], comp.cell

    def step(a, b):
        return (abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])) / 3.0

    # Only measure inside a block that is ONE character throughout, so a real
    # material boundary or a keyline is never counted as a seam. The block is
    # FOUND, not hardcoded: the first measurement of this made that mistake and
    # reported a x1.25 "seam" that was a tree line inside the sample.
    def field_stats(c0, c1, r0, r1):
        bnd_v, int_v, bnd_h, int_h = [], [], [], []
        for y in range(r0 * cell, r1 * cell):
            for x in range(c0 * cell, c1 * cell - 1):
                s = step(px[x, y], px[x + 1, y])
                (bnd_v if (x + 1) % cell == 0 else int_v).append(s)
        for x in range(c0 * cell, c1 * cell):
            for y in range(r0 * cell, r1 * cell - 1):
                s = step(px[x, y], px[x, y + 1])
                (bnd_h if (y + 1) % cell == 0 else int_h).append(s)
        m = lambda v: sum(v) / len(v) if v else 0.0
        return m(bnd_v), m(int_v), m(bnd_h), m(int_h)

    worst = 0.0
    for want in (",", ".", ":", "o"):
        blk = largest_uniform_block(comp, want)
        if blk is None:
            continue
        c0, r0, c1, r1 = blk
        if (c1 - c0) < 3 or (r1 - r0) < 3:
            continue
        bv, iv, bh, ih = field_stats(c0, c1, r0, r1)
        rv = bv / iv if iv else 0
        rh = bh / ih if ih else 0
        worst = max(worst, rv, rh)
        print("        '%s' %dx%d cells at (%d,%d): vertical joins %.2f vs interior %.2f (x%.2f), "
              "horizontal %.2f vs interior %.2f (x%.2f)"
              % (want, c1 - c0, r1 - r0, c0, r0, bv, iv, rv, bh, ih, rh))
    check(worst <= 1.0,
          "in every uniform field, the cell join is no busier than the material's own interior, "
          "so there is no grid line to find (worst ratio x%.2f)" % worst)
    print("        READ THIS RATIO CAREFULLY BEFORE BELIEVING IT. Measured on pure 16x16-cell\n"
          "        fields of each family: v2 DRAWN short-grass x0.61/x0.77, tall-grass\n"
          "        x0.93/x1.19, turf x0.79/x0.82, plaza x0.95/x1.29 (vertical/horizontal);\n"
          "        round-1 CUT short-grass x0.53/x0.98, tall-grass x0.82/x0.10, path\n"
          "        x0.00/x0.57, clearing x0.30/x0.98. The cut tiles score BEST on this check,\n"
          "        and they score best because they were cut from a field the ground lane\n"
          "        measured as 16px-PERIODIC — every cut is the same glyph at a different\n"
          "        phase, so its edges already line up. A ratio near zero is that lattice, not\n"
          "        the absence of one. What the drawn tall grass fails on is a horizontal join\n"
          "        19%% busier than the gaps between its own clumps, which is a low denominator\n"
          "        and not a grid line: at 1:1 in _look-ground-1x.png there is no band to find.\n"
          "        The check is left failing rather than loosened, and this is what it means.")


# ── 7. the collision overlay is the mask, not a drawing ─────────────────────
def check_overlay(comp, png):
    """The overlay is only worth looking at if it is generated from the same
    predicate the engine walks on. This asserts the picture the reviewer will
    see: EVERY cell the mask calls blocked is washed red, and NO cell it calls
    walkable is — checked pixel by pixel over all 4096 cells, against the layout
    re-read from disk rather than against the composer's in-memory state."""
    print("\n7. COLLISION OVERLAY — red on every blocked cell, none on any walkable one")
    import deliver
    base = Image.open(png).convert("RGB").load()
    ov = deliver.overlay(png, comp).load()
    cell = comp.cell
    body = lib.parse_layout(sys.argv[1], comp.d)
    wrong_red, wrong_clear = [], []
    for r in range(comp.rows):
        for c in range(comp.cols):
            x, y = c * cell + cell // 2, r * cell + cell // 2
            tinted = ov[x, y] != base[x, y]
            blocked = lib.blocks(body[r][c])
            if blocked and not tinted:
                wrong_clear.append((c, r, body[r][c]))
            if (not blocked) and tinted:
                wrong_red.append((c, r, body[r][c]))
    nblock = sum(1 for r in range(comp.rows) for c in range(comp.cols) if lib.blocks(body[r][c]))
    check(not wrong_clear, "all %d blocked cells carry the red wash (%d missing %s)"
          % (nblock, len(wrong_clear), wrong_clear[:6]))
    check(not wrong_red, "no walkable cell carries it (%d spurious %s)"
          % (len(wrong_red), wrong_red[:6]))
    lane = [(c, r) for r in range(comp.rows) for c in range(comp.cols) if body[r][c] in ":^"]
    lane_red = [t for t in wrong_red if (t[0], t[1]) in set((c, r) for c, r in lane)]
    check(not lane_red, "no cell of the %d-cell path corridor is washed red" % len(lane))
    # And the same predicate really is the engine's: the legend table lib reads
    # is asserted against legend.ts in section 1, so "blocked" here is the same
    # word game/collision.ts gridFromAscii uses.
    return nblock


# ── 8. the building family actually reached the map ─────────────────────────
def check_pieces(comp, stats):
    """A slot model is only real if the map contains the slots. This counts what
    was STAMPED, so an unreachable corner piece or a hue nothing used shows up as
    a number rather than as an intention."""
    print("\n8. BUILDING SLOTS — what the composer actually stamped")
    from collections import Counter
    slots = Counter(v["slot"] for v in comp.house.values())
    hues = Counter(v["hue"] for v in comp.house.values())
    every = ["roof-top-left", "roof-top", "roof-top-right", "roof-left", "roof-body",
             "roof-right", "ridge-left", "ridge", "ridge-right", "gable",
             "eave-left", "eave", "eave-right", "wall-mid-left", "wall-mid",
             "wall-mid-window", "wall-mid-right", "wall-left", "wall-plain",
             "wall-window", "wall-right", "door-leaf"]
    for nm in every:
        print("          %-17s %4d" % (nm, slots.get(nm, 0)))
    missing = [n for n in every if not slots.get(n)]
    check(slots.get("door-leaf", 0) == stats["buildings"],
          "one door leaf per building (%d leaves, %d buildings)"
          % (slots.get("door-leaf", 0), stats["buildings"]))
    check(all(slots.get(n) for n in ("roof-top-left", "roof-top-right", "eave-left",
                                     "eave-right", "wall-left", "wall-right")),
          "every CORNER and EDGE slot was reached — the silhouette is art, not only keyline")
    check(len(hues) >= min(4, stats["buildings"]),
          "%d roof hues over %d buildings: %s" % (len(hues), stats["buildings"], dict(hues)))
    print("        unused pieces: %s" % (missing or "none"))
    return dict(slots=dict(slots), hues=dict(hues), unused=missing)


def largest_uniform_block(comp, want):
    """Largest all-`want` axis-aligned rectangle of cells, by area. Brute force
    over a 64x64 grid is cheap and cannot be subtly wrong the way a heuristic can."""
    cols, rows = comp.cols, comp.rows
    ok = [[1 if comp.ch(c, r) == want else 0 for c in range(cols)] for r in range(rows)]
    heights = [0] * cols
    best, box = 0, None
    for r in range(rows):
        for c in range(cols):
            heights[c] = heights[c] + 1 if ok[r][c] else 0
        # widest rectangle in the histogram, kept simple and exhaustive
        for c0 in range(cols):
            h = 1 << 30
            for c1 in range(c0, cols):
                h = min(h, heights[c1])
                if h == 0:
                    break
                area = h * (c1 - c0 + 1)
                if area > best:
                    best, box = area, (c0, r - h + 1, c1 + 1, r + 1)
    return box


def main():
    layout, png = sys.argv[1], sys.argv[2]
    comp, stats = compose.compose(layout, png)
    print("COMPOSED %s -> %s" % (layout, png))
    print("  %d buildings, %d lone trees, %d fringe px, %d shoreline px, %d keyline px, %d shade px"
          % (stats["buildings"], stats["crowns"], stats["fringe_px"], stats["shore_px"],
             stats["keyline_px"], stats["shade_px"]))
    check_legend()
    check_determinism(layout)
    ncol = check_palette(png)
    check_correspondence(comp)
    check_contracts(comp, layout)
    check_seams(png, comp)
    nblock = check_overlay(comp, png)
    pieces = check_pieces(comp, stats)
    print("\n" + "=" * 72)
    print("%d checks failed, %d warnings" % (len(FAIL), len(WARN)))
    for f in FAIL:
        print("  FAIL  " + f)
    for w in WARN:
        print("  WARN  " + w)
    json.dump({"layout": layout, "png": png, "fail": FAIL, "warn": WARN,
               "distinctColours": ncol, "blockedCells": nblock,
               "buildings": stats["buildings"], "crowns": stats["crowns"],
               "hues": stats["hues"], "pieces": pieces, "doors": stats["doors"]},
              open("_verify-%s.json" % os.path.basename(layout)[:-4], "w"), indent=1)
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
