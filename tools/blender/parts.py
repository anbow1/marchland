"""Parts every building is assembled from: framed walls, roofs, gables, openings, and the things
that stand about a working yard. All measures in metres; a part is made at the origin facing -Y
and moved into place with Kit.mark() / Kit.move_since()."""

import math

from mathutils import Matrix, Vector

PLASTER = "plaster"
OCHRE = "plaster#ecc070"
BEAM = "beam#d8cfc6"
BOARDS = "boards"
BOARDS_DARK = "boards#b8a898"
SHINGLES = "shingles"
THATCH = "thatch#ffe9c4"
TILES = "tiles"
RUBBLE = "rubble"
STONE_DARK = "rubble#8a8580"
ASHLAR = "ashlar#dcd8d0"
BARK = "bark"
GLASS = "glass#20252a"
IRON = "iron#4a4c50"
STEEL = "steel#9aa0a6"
SOOT = "soot#262422"
EMBER = "ember#c8501e"
CLOTH = "cloth#d8cfb8"
LEATHER = "leather#6b4a2f"
BREAD = "bread#c08a4a"
SACK = "sack#c9b48a"
ORE = "ore#7a4a3a"
SLAG = "slag#3a3634"
CHARCOAL = "charcoal#1e1c1b"
TEAM = "team"
STRAW = "straw#c9b678"
GRAIN = "grain#d0b050"
SOIL = "farm_soil"


def at(x, y, z=0.0, turn=0.0):
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(turn, 4, "Z")


# ---- walls -----------------------------------------------------------------


def timbers_along_x(k, x0, x1, y, z0, z1, face, openings, braces=True):
    """Posts, sill, plate, mid rail and corner braces on a wall running along X at y; face -1 = front (-Y)."""
    t = 0.2
    yy = y + face * 0.03
    span = x1 - x0
    n = max(2, round(span / 1.25))
    for i in range(n + 1):
        x = x0 + span * i / n
        if any(o[0] - 0.15 < x < o[1] + 0.15 for o in openings):
            continue
        k.box(x, yy, z0, t, t, z1 - z0, BEAM, bevel=0.02, turn=k.jitter(0.01))
    k.box((x0 + x1) / 2, yy, z0, span + 0.25, t + 0.02, 0.22, BEAM, bevel=0.025)
    k.box((x0 + x1) / 2, yy, z1 - 0.2, span + 0.3, t + 0.02, 0.2, BEAM, bevel=0.025)
    mid = z0 + (z1 - z0) * 0.45
    edges = [x0] + [v for o in sorted(openings) for v in (o[0] - 0.1, o[1] + 0.1)] + [x1]
    for a, b in zip(edges[0::2], edges[1::2]):
        if b - a > 0.3:
            k.box((a + b) / 2, yy, mid, b - a, t * 0.8, 0.15, BEAM, bevel=0.02)
    if braces:
        for corner, sign in ((x0, 1), (x1, -1)):
            if any(o[0] - 0.2 < corner + sign * 0.6 < o[1] + 0.2 for o in openings):
                continue
            k.beam((corner + sign * 0.1, yy, z0 + 0.2), (corner + sign * 1.0, yy, mid), 0.15, 0.15, BEAM, bevel=0.015)


def block(k, sx, sy, z0, height, wall=PLASTER, framed=True, front=(), back=(), left=(), right=()):
    """A walled block sx (along X) by sy, from z0 up `height`; openings are (from, to) spans along each wall."""
    k.box(0, 0, z0, sx, sy, height, wall)
    if not framed:
        return
    timbers_along_x(k, -sx / 2, sx / 2, -sy / 2, z0, z0 + height, -1, list(front))
    timbers_along_x(k, -sx / 2, sx / 2, sy / 2, z0, z0 + height, 1, list(back))
    for side, spans in ((-1, left), (1, right)):
        m = k.mark()
        timbers_along_x(k, -sy / 2, sy / 2, -sx / 2, z0, z0 + height, -1, list(spans))
        k.move_since(m, Matrix.Rotation(-side * math.pi / 2, 4, "Z"))


def footing(k, sx, sy, height=0.5, surface=RUBBLE):
    """Stone footing, sunk into the ground so it meets a slope."""
    k.box(0, 0, -0.5, sx + 0.25, sy + 0.25, height + 0.5, surface, bevel=0.04)


# ---- openings --------------------------------------------------------------


def window(k, x, y, z, face=-1, w=0.7, h=0.8, shutters=True):
    out = face * 0.05
    k.box(x, y + out, z, w, 0.06, h, GLASS)
    for dx in (-w / 2, w / 2):
        k.box(x + dx, y + out * 1.6, z - 0.04, 0.1, 0.12, h + 0.08, BEAM, bevel=0.012)
    k.box(x, y + out * 1.6, z + h, w + 0.2, 0.12, 0.1, BEAM, bevel=0.012)
    k.box(x, y + out * 2.2, z - 0.1, w + 0.3, 0.2, 0.08, BEAM, bevel=0.012)
    k.box(x, y + out * 1.3, z + h / 2 - 0.02, w, 0.04, 0.04, BEAM)
    k.box(x, y + out * 1.3, z, 0.04, 0.04, h, BEAM)
    if shutters:
        for side in (-1, 1):
            k.box(x + side * (w / 2 + 0.24), y + out * 1.4, z, 0.36, 0.05, h, BOARDS, turn=side * 0.15)


def door(k, x, y, z0=0.5, face=-1, w=1.0, h=2.0, step=True, open_dark=False):
    out = face * 0.04
    k.box(x, y + out, z0, w, 0.08, h, SOOT if open_dark else BOARDS)
    if not open_dark:
        for dz in (0.35, h - 0.35):
            k.box(x, y + out * 2, z0 + dz, w * 0.9, 0.03, 0.05, IRON)
    for dx in (-w / 2 - 0.08, w / 2 + 0.08):
        k.box(x + dx, y + out * 1.5, z0, 0.16, 0.16, h + 0.1, BEAM, bevel=0.015)
    k.box(x, y + out * 1.5, z0 + h, w + 0.5, 0.18, 0.18, BEAM, bevel=0.015)
    if step and z0 > 0.1:
        k.box(x, y + face * 0.45, 0, w + 0.4, 0.6, z0, RUBBLE, bevel=0.04)


# ---- roofs -----------------------------------------------------------------


def roof(k, sx, sy, eave_z, pitch_deg=52, overhang=0.5, gable_overhang=0.4, thick=0.24, surface=SHINGLES, hip=0.0):
    """A roof with its ridge along X; `hip` cuts the ridge back at both ends (thatch). Returns the ridge height."""
    half = sy / 2 + overhang
    rise = (sy / 2) * math.tan(math.radians(pitch_deg))
    ridge_z = eave_z + rise
    drop = overhang * math.tan(math.radians(pitch_deg))
    x0 = -sx / 2 - gable_overhang
    x1 = sx / 2 + gable_overhang
    rx0 = x0 + hip
    rx1 = x1 - hip
    edge = BOARDS if surface != THATCH else THATCH
    for side in (-1, 1):
        y_e = side * half
        corners = [(x0, y_e, eave_z - drop), (x1, y_e, eave_z - drop), (rx1, 0, ridge_z), (rx0, 0, ridge_z)]
        if side > 0:
            corners = corners[::-1]
        k.slab(corners, thick, surface, edge)
    if hip > 0:
        for end, sign in ((x0, -1), (x1, 1)):
            r = rx0 if sign < 0 else rx1
            tri = [(end, -half, eave_z - drop), (end, half, eave_z - drop), (r, 0, ridge_z)]
            if sign > 0:
                tri = tri[::-1]
            # a hip end: a sloped triangle slab, made as a degenerate quad
            k.slab([tri[0], tri[1], tri[2], tri[2]], thick, surface, edge)
    if surface == THATCH:
        k.beam((rx0 - 0.1, 0, ridge_z + thick * 0.7), (rx1 + 0.1, 0, ridge_z + thick * 0.7), 0.5, 0.35, THATCH, bevel=0.08)
    else:
        k.beam((x0 - 0.1, 0, ridge_z + thick * 0.9), (x1 + 0.1, 0, ridge_z + thick * 0.9), 0.32, 0.22, BOARDS_DARK if surface == SHINGLES else surface, bevel=0.03)
        for x in (x0 + 0.02, x1 - 0.02):
            for side in (-1, 1):
                k.beam((x, side * half, eave_z - drop - 0.05), (x, 0, ridge_z + 0.05), 0.08, 0.26, BOARDS, bevel=0.01)
    return ridge_z


def gables(k, sx, sy, eave_z, ridge_z, wall=PLASTER, framed=True):
    """The triangles of wall under both gables."""
    for x, face in ((-sx / 2, -1), (sx / 2, 1)):
        verts = k.prism([(-sy / 2, eave_z), (sy / 2, eave_z), (0, ridge_z - 0.15)], 0.28, wall)
        k.place(verts, Matrix.Translation((x, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, "Z"))
        if not framed:
            continue
        xx = x + face * 0.16
        k.beam((xx, 0, eave_z), (xx, 0, ridge_z - 0.1), 0.18, 0.18, BEAM, bevel=0.015)
        for side in (-1, 1):
            k.beam((xx, side * sy / 2, eave_z + 0.05), (xx, 0, ridge_z - 0.1), 0.18, 0.18, BEAM, bevel=0.015)


def lean_to(k, x0, x1, y0, y1, low_z, high_z, surface=SHINGLES, posts=True):
    """A roof on posts sloping from high at y0 to low at y1: an open shed."""
    k.slab([(x0, y1, low_z), (x1, y1, low_z), (x1, y0, high_z), (x0, y0, high_z)] if y1 < y0 else [(x1, y1, low_z), (x0, y1, low_z), (x0, y0, high_z), (x1, y0, high_z)], 0.14, surface, BOARDS)
    if posts:
        for x in (x0 + 0.15, x1 - 0.15, (x0 + x1) / 2 if x1 - x0 > 4 else None):
            if x is None:
                continue
            k.box(x, y1 + (0.2 if y1 < y0 else -0.2), 0, 0.2, 0.2, low_z, BEAM, bevel=0.02)
            k.box(x, y0 - (0.2 if y1 < y0 else -0.2), 0, 0.2, 0.2, high_z, BEAM, bevel=0.02)


def chimney(k, x, y, z0, top, w=0.85, surface=RUBBLE):
    k.box(x, y, z0, w, w, top - z0, surface, bevel=0.03)
    k.box(x, y, top, w + 0.15, w + 0.15, 0.14, ASHLAR, bevel=0.02)


# ---- things in a yard ------------------------------------------------------


def barrel(k, x, y, scale=1.0, surface=BOARDS):
    k.cylinder(x, y, 0, 0.3 * scale, 0.3 * scale, 0.9 * scale, 10, surface, bevel=0.02)
    for z in (0.15, 0.75):
        k.cylinder(x, y, z * scale, 0.315 * scale, 0.315 * scale, 0.05 * scale, 10, IRON)


def log(k, x, y, z, length, radius, turn=0.0, tilt=0.0):
    """A log lying along X (turned about Z), its middle at (x, y, z)."""
    v = k.cylinder(0, 0, -length / 2, radius, radius * 0.92, length, 8, BARK)
    k.place(v, Matrix.Translation((x, y, z)) @ Matrix.Rotation(turn, 4, "Z") @ Matrix.Rotation(tilt, 4, "Y") @ Matrix.Rotation(math.pi / 2, 4, "Y"))


def log_stack(k, x, y, length, rows=3, radius=0.16, turn=0.0):
    """Logs stacked in a pyramid, lying across Y (along X after `turn`)."""
    m = k.mark()
    for row in range(rows):
        for i in range(rows + 1 - row):
            log(k, 0, (i - (rows - row) / 2) * radius * 2.05, radius + row * radius * 1.75, length + k.jitter(0.15), radius * (1 + k.jitter(0.12)))
    k.move_since(m, at(x, y, 0, turn))


def firewood(k, x, y, w=1.6, h=1.1, d=0.5):
    """A stack of split billets against a wall: a box of short logs seen end-on."""
    m = k.mark()
    k.box(0, 0, 0, w, d, h, BOARDS_DARK)
    for row in range(int(h / 0.16)):
        for i in range(int(w / 0.17)):
            v = k.cylinder(0, 0, 0, 0.075, 0.075, 0.04, 6, BARK)
            k.place(v, Matrix.Translation((-w / 2 + 0.09 + i * 0.17 + (row % 2) * 0.05, -d / 2 - 0.02, 0.09 + row * 0.16)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    k.move_since(m, at(x, y))


def chopping_block(k, x, y):
    k.cylinder(x, y, 0, 0.36, 0.38, 0.55, 9, BARK)
    k.beam((x, y, 0.55), (x + 0.35, y - 0.1, 1.15), 0.05, 0.05, BOARDS)
    k.box(x + 0.02, y, 0.53, 0.06, 0.22, 0.12, STEEL)
    for i in range(5):
        k.box(x - 0.6 + k.jitter(0.25), y - 0.5 + k.jitter(0.25), 0, 0.12, 0.1, 0.4, BOARDS, turn=k.jitter(1.5), tilt=(k.jitter(1.2), k.jitter(1.2)))


def sawhorse(k, x, y, turn=0.0, with_log=True):
    m = k.mark()
    for lx in (-0.6, 0.6):
        k.beam((lx, -0.45, 0), (lx, 0.45, 1.0), 0.09, 0.09, BOARDS)
        k.beam((lx, 0.45, 0), (lx, -0.45, 1.0), 0.09, 0.09, BOARDS)
    if with_log:
        log(k, 0, 0, 0.95, 2.6, 0.18)
        # The bow saw left in the cut.
        k.box(0.2, 0, 1.0, 0.04, 0.9, 0.04, BOARDS)
        k.box(0.2, 0, 1.0, 0.02, 0.85, 0.3, STEEL)
    k.move_since(m, at(x, y, 0, turn))


def sack(k, x, y, scale=1.0, surface=SACK):
    k.box(x, y, 0, 0.45 * scale, 0.32 * scale, 0.62 * scale, surface, bevel=0.08 * scale)
    k.box(x, y, 0.62 * scale, 0.22 * scale, 0.16 * scale, 0.12 * scale, surface, bevel=0.03)


def crate(k, x, y, size=0.7, turn=0.0, surface=BOARDS):
    k.box(x, y, 0, size, size, size * 0.85, surface, turn=turn, bevel=0.03)


def anvil(k, x, y, turn=0.0):
    m = k.mark()
    k.cylinder(0, 0, 0, 0.3, 0.32, 0.55, 8, BARK)
    k.box(0, 0, 0.55, 0.22, 0.5, 0.14, IRON, bevel=0.02)
    k.box(0, 0, 0.69, 0.3, 0.75, 0.1, STEEL, bevel=0.02)
    k.cylinder(0, 0.45, 0.7, 0.08, 0.0, 0.25, 6, STEEL)
    k.move_since(m, at(x, y, 0, turn))


def stump(k, x, y):
    k.cylinder(x, y, 0, 0.32 + k.jitter(0.08), 0.3, 0.3 + k.jitter(0.1), 8, BARK)


def smoke_marker(k, x, y, z):
    """An empty marker the game finds by name and puts smoke on (made as a tiny box named in the part list)."""
    k.smoke.append((x, y, z))


# ---- animals and work things -------------------------------------------------

PIG = "pig#c79a8c"
HORSE_BAY = "horse#5b3f2c"
HORSE_GREY = "horse#8b8780"
HIDE = "hide#a98a62"
MEAT = "meat#8c4a40"
HAY = "straw#c9b678"
WATER = "water#2a3a3a"


def pig(k, x, y, turn=0.0, scale=1.0):
    m = k.mark()
    s = scale
    k.box(0, 0, 0.25 * s, 0.45 * s, 1.0 * s, 0.45 * s, PIG, bevel=0.08 * s)
    k.box(0, -0.58 * s, 0.32 * s, 0.32 * s, 0.3 * s, 0.3 * s, PIG, bevel=0.05 * s)
    k.box(0, -0.75 * s, 0.34 * s, 0.16 * s, 0.08 * s, 0.12 * s, "pig#a87a6c")
    for dx in (-0.14, 0.14):
        for dy in (-0.32, 0.32):
            k.box(dx * s, dy * s, 0, 0.09 * s, 0.09 * s, 0.28 * s, PIG)
    k.move_since(m, at(x, y, 0, turn))


def horse(k, x, y, turn=0.0, coat=HORSE_BAY, grazing=False):
    m = k.mark()
    k.box(0, 0, 0.95, 0.5, 1.5, 0.6, coat, bevel=0.1)
    head_z = 0.75 if grazing else 1.55
    k.beam((0, -0.65, 1.35), (0, -1.05, head_z + 0.1), 0.26, 0.34, coat, bevel=0.04)
    k.box(0, -1.15, head_z - 0.15, 0.22, 0.5, 0.26, coat, bevel=0.04, tilt=(0.6 if grazing else -0.3, 0))
    k.box(0, -0.85, 1.55 if not grazing else 1.2, 0.08, 0.5, 0.25, "horse#2e2824")
    k.beam((0, 0.72, 1.4), (0, 0.95, 0.75), 0.1, 0.12, "horse#2e2824")
    for dx in (-0.16, 0.16):
        for dy in (-0.55, 0.55):
            k.box(dx, dy, 0, 0.12, 0.14, 0.95, coat)
    k.move_since(m, at(x, y, 0, turn))


def trough(k, x, y, length=1.6, turn=0.0):
    m = k.mark()
    k.box(0, 0, 0, length, 0.5, 0.45, BOARDS, bevel=0.02)
    k.box(0, 0, 0.4, length - 0.12, 0.38, 0.03, WATER)
    k.move_since(m, at(x, y, 0, turn))


def haystack(k, x, y, r=1.2):
    k.cylinder(x, y, 0, r, r * 0.9, r * 0.8, 10, HAY)
    k.cylinder(x, y, r * 0.8, r * 0.9, 0.1, r * 0.9, 10, HAY)


def fence(k, x0, y0, x1, y1, posts_every=1.6):
    import math as _m
    length = _m.hypot(x1 - x0, y1 - y0)
    n = max(1, round(length / posts_every))
    for i in range(n + 1):
        t = i / n
        k.box(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0, 0.12, 0.12, 1.1, BEAM)
    for z in (0.45, 0.9):
        k.beam((x0, y0, z), (x1, y1, z), 0.07, 0.1, BOARDS)


def cart(k, x, y, turn=0.0, load=None):
    m = k.mark()
    k.box(0, 0, 0.55, 1.3, 2.2, 0.12, BOARDS, bevel=0.02)
    for dx in (-0.62, 0.62):
        k.box(dx, 0, 0.67, 0.06, 2.2, 0.35, BOARDS)
    for dx in (-0.75, 0.75):
        v = k.cylinder(0, 0, -0.05, 0.5, 0.5, 0.1, 12, BOARDS)
        k.place(v, Matrix.Translation((dx, 0.2, 0.5)) @ Matrix.Rotation(1.5708, 4, "Y"))
    k.beam((-0.3, -1.1, 0.6), (-0.3, -2.4, 0.45), 0.08, 0.08, BEAM)
    k.beam((0.3, -1.1, 0.6), (0.3, -2.4, 0.45), 0.08, 0.08, BEAM)
    if load:
        k.box(0, 0, 0.67, 1.1, 2.0, 0.45, load, bevel=0.1)
    k.move_since(m, at(x, y, 0, turn))


def target_butt(k, x, y, turn=0.0):
    """An archery butt: a straw boss on a trestle, painted rings."""
    m = k.mark()
    k.beam((-0.5, 0.35, 0), (0, 0.1, 1.5), 0.08, 0.08, BEAM)
    k.beam((0.5, 0.35, 0), (0, 0.1, 1.5), 0.08, 0.08, BEAM)
    v = k.cylinder(0, 0, -0.15, 0.6, 0.6, 0.3, 14, HAY)
    k.place(v, Matrix.Translation((0, 0, 1.05)) @ Matrix.Rotation(1.5708, 4, "X"))
    for r, col in ((0.42, "paint#e8e0d0"), (0.28, "paint#a8302a"), (0.14, "paint#e8e0d0")):
        v = k.cylinder(0, 0, -0.01, r, r, 0.02, 14, col)
        k.place(v, Matrix.Translation((0, -0.16, 1.05)) @ Matrix.Rotation(1.5708, 4, "X"))
    k.move_since(m, at(x, y, 0, turn))
