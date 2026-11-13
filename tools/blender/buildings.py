"""Marchland's buildings, each assembled from parts.py. A builder takes the Kit and the level (1-3)
and returns a dict of moving parts {name: (Kit, (x, y, z) pivot)}; most have none."""

import math

from mathutils import Matrix

from parts import (ASHLAR, BARK, BEAM, BOARDS, BOARDS_DARK, BREAD, CHARCOAL, CLOTH, EMBER, IRON, LEATHER, ORE, OCHRE, PLASTER, RUBBLE, SACK, SHINGLES, SLAG,
                   SOOT, STEEL, STONE_DARK, TEAM, THATCH, TILES, anvil, at, barrel, block, chimney, chopping_block, crate, door, firewood, footing, gables,
                   lean_to, log, log_stack, roof, sack, sawhorse, stump, window)

ROCK = "rock"


def house(k, level):
    sx, sy = (7.0, 5.0) if level == 1 else (7.6, 5.4)
    plinth = 0.5
    top = plinth + (2.5 if level == 1 else 2.8)
    footing(k, sx, sy, plinth)
    block(k, sx, sy, plinth, top - plinth, PLASTER, True, front=[(-0.6, 0.6), (-2.6, -1.7), (1.7, 2.6)], back=[(-0.5, 0.5)], left=[(-0.45, 0.45)])
    door(k, 0, -sy / 2)
    for x in (-2.15, 2.15):
        window(k, x, -sy / 2, plinth + 0.85)
    window(k, 0, sy / 2, plinth + 0.85, face=1, shutters=False)
    m = k.mark()
    window(k, 0, 0, plinth + 0.85, w=0.6, h=0.7)
    k.move_since(m, at(-sx / 2, 0, 0, -math.pi / 2))
    eave = top
    if level == 3:
        # A jettied upper storey in ochre.
        k.box(0, 0, top, sx, sy + 0.5, 2.4, OCHRE)
        m = k.mark()
        block(k, sx, sy + 0.5, top, 2.4, OCHRE, True, front=[(-2.6, -1.8), (1.8, 2.6), (-0.4, 0.4)], back=[(-0.4, 0.4)])
        for x in (-2.2, 0, 2.2):
            window(k, x, -(sy + 0.5) / 2, top + 0.7, w=0.6, h=0.8)
        eave = top + 2.4
    ridge = roof(k, sx, sy + (0.5 if level == 3 else 0), eave, 52, 0.55, 0.4, 0.24, THATCH if level == 1 else SHINGLES, hip=1.0 if level == 1 else 0.0)
    if level > 1:
        gables(k, sx, sy + (0.5 if level == 3 else 0), eave, ridge, OCHRE if level == 3 else PLASTER)
    chimney(k, sx / 2 - 1.3, 0.7, plinth, ridge + 0.9)
    k.smoke.append((sx / 2 - 1.3, 0.7, ridge + 1.1))
    barrel(k, 1.15, -sy / 2 - 0.55)
    barrel(k, 1.75, -sy / 2 - 0.45, 0.85)
    k.box(-1.6, -sy / 2 - 0.55, 0, 1.4, 0.35, 0.45, BOARDS, bevel=0.02)
    firewood(k, sx / 2 + 0.35, 0.6, w=1.8, h=1.0)
    return {}


def woodcutter(k, level):
    # The lodge: a boarded hut under a hipped thatch, at the back left.
    m = k.mark()
    footing(k, 3.8, 3.2, 0.3)
    block(k, 3.8, 3.2, 0.3, 2.1, BOARDS_DARK, framed=False)
    door(k, 0.6, -1.6, z0=0.3, w=0.9, h=1.8, step=False)
    window(k, -0.9, -1.6, 1.1, w=0.5, h=0.5)
    roof(k, 3.8, 3.2, 2.4, 50, 0.5, 0.45, 0.32, THATCH, hip=0.9)
    chimney(k, -1.2, 0.6, 0.3, 4.6, w=0.6)
    k.smoke.append((-1.2, 0.6, 4.8))
    k.move_since(m, at(-2.3, 2.0))
    # The open log shed at the back right, stacked to the roof with seasoning timber.
    lean_to(k, 0.3, 4.6, 3.6, 0.9, 2.1, 2.9, SHINGLES)
    log_stack(k, 2.45, 2.25, 4.0, rows=4, radius=0.17)
    # The yard where he works: chopping block, split billets, a sawhorse with a log in the cut, stumps.
    chopping_block(k, -1.0, -1.8)
    firewood(k, -3.3, 0.15, w=1.3, h=1.2)
    sawhorse(k, 1.8, -1.6, 0.25)
    for x, y in ((3.9, -3.9), (-4.0, -3.6), (4.2, -1.0)):
        stump(k, x, y)
    # Fresh trunks waiting by the track, still in their bark.
    log_stack(k, 1.0, -3.9, 5.0, rows=2 if level == 1 else 3, radius=0.24, turn=0.08)
    if level >= 2:
        # A saw pit with its trestle.
        k.box(-2.2, -3.3, -0.4, 1.0, 3.0, 0.45, "farm_soil")
        for y in (-4.4, -2.2):
            k.box(-2.2, y, 0, 1.4, 0.25, 0.9, BEAM, bevel=0.02)
        log(k, -2.2, -3.3, 1.1, 3.4, 0.2, turn=math.pi / 2)
    if level >= 3:
        log_stack(k, -3.9, -1.3, 3.0, rows=3, radius=0.17, turn=math.pi / 2)
    return {}


def bakery(k, level):
    sx, sy = 6.0, 4.4
    plinth = 0.45
    footing(k, sx, sy, plinth)
    block(k, sx, sy, plinth, 2.6, PLASTER, True, front=[(-1.9, -0.9), (0.6, 1.5)], back=[(-0.5, 0.5)])
    door(k, -1.4, -sy / 2, plinth)
    window(k, 1.05, -sy / 2, plinth + 0.9, w=0.9, h=0.8)
    up = plinth + 2.6
    k.box(0, 0, up, sx, sy + 0.5, 2.2, OCHRE)
    block(k, sx, sy + 0.5, up, 2.2, OCHRE, True, front=[(-1.8, -1.1), (1.1, 1.8)], back=[])
    for x in (-1.45, 1.45):
        window(k, x, -(sy + 0.5) / 2, up + 0.7, w=0.6, h=0.75)
    eave = up + 2.2
    ridge = roof(k, sx, sy + 0.5, eave, 50, 0.5, 0.35, 0.2, TILES)
    gables(k, sx, sy + 0.5, eave, ridge, OCHRE)
    # The oven: a stone dome on a plinth on the +X end, under its own roof, with a tall flue.
    ox, oy = sx / 2 + 1.5, 0.2
    k.box(ox, oy, 0, 2.5, 2.8, 0.95, RUBBLE, bevel=0.04)
    k.cylinder(ox, oy, 0.95, 1.15, 1.0, 0.45, 12, RUBBLE)
    k.cylinder(ox, oy, 1.4, 1.0, 0.45, 0.75, 12, RUBBLE)
    k.cylinder(ox, oy, 2.15, 0.45, 0.15, 0.25, 12, RUBBLE)
    k.box(ox, oy - 1.15, 0.95, 0.6, 0.3, 0.5, SOOT)
    k.box(ox, oy - 1.05, 1.0, 0.45, 0.2, 0.3, EMBER)
    lean_to(k, ox - 1.4, ox + 1.5, oy + 1.6, oy - 1.7, 2.5, 3.1, TILES)
    chimney(k, ox + 0.5, oy + 1.0, 0.95, ridge + 0.6, w=0.7)
    k.smoke.append((ox + 0.5, oy + 1.0, ridge + 0.8))
    firewood(k, ox, oy + 2.0, w=2.2, h=1.0, d=0.6)
    # The sign: an iron bracket over the door with a gilded pretzel.
    k.box(-1.4, -sy / 2 - 0.45, up - 0.35, 0.05, 0.9, 0.05, IRON)
    for i in range(12):
        a = i / 12 * math.pi * 2
        k.box(-1.4 + math.cos(a) * 0.32, -sy / 2 - 0.85, up - 0.75 + math.sin(a) * 0.3, 0.12, 0.08, 0.12, BREAD, turn=0, tilt=(0, -a))
    k.beam((-1.62, -sy / 2 - 0.85, up - 0.95), (-1.18, -sy / 2 - 0.85, up - 0.55), 0.1, 0.08, BREAD)
    k.beam((-1.18, -sy / 2 - 0.85, up - 0.95), (-1.62, -sy / 2 - 0.85, up - 0.55), 0.1, 0.08, BREAD)
    # A trestle stall of loaves under an awning, and flour sacks by the door.
    def stall(x, y):
        k.box(x, y, 0, 1.9, 0.8, 0.85, BOARDS, bevel=0.02)
        for i in range(10):
            k.box(x - 0.75 + (i % 5) * 0.37, y - 0.18 + (i // 5) * 0.34, 0.85, 0.3, 0.2, 0.13, BREAD, bevel=0.05, turn=k.jitter(0.3))
        for dx in (-0.9, 0.9):
            k.box(x + dx, y - 0.45, 0, 0.08, 0.08, 2.0, BEAM)
        k.slab([(x - 1.1, y - 0.9, 1.9), (x + 1.1, y - 0.9, 1.9), (x + 1.1, y + 0.5, 2.2), (x - 1.1, y + 0.5, 2.2)], 0.04, CLOTH)
    stall(1.0, -sy / 2 - 1.1)
    if level >= 2:
        stall(-3.6 + 0.2, -sy / 2 - 1.3)
    for i in range(3 + level):
        sack(k, -2.9 - (i % 2) * 0.5, -sy / 2 - 0.4 - (i // 2) * 0.4)
    return {}


def windmill(k, level):
    # The trestle: four stone piers, crossed sole beams, quarter bars, and the great post.
    for sx in (-1, 1):
        for sy in (-1, 1):
            k.box(sx * 1.7, sy * 1.7, 0, 0.75, 0.75, 0.8, RUBBLE, bevel=0.04)
            k.beam((sx * 1.7, sy * 1.7, 0.95), (sx * 0.25, sy * 0.25, 3.6), 0.24, 0.24, BEAM, bevel=0.02)
    k.beam((-1.95, -1.95, 0.9), (1.95, 1.95, 0.9), 0.32, 0.32, BEAM, bevel=0.025)
    k.beam((-1.95, 1.95, 0.9), (1.95, -1.95, 0.9), 0.32, 0.32, BEAM, bevel=0.025)
    k.cylinder(0, 0, 0.8, 0.38, 0.32, 3.4, 10, BEAM)
    # The body (the buck): a boarded box on the post, its gable towards the sails.
    bz = 4.0
    m = k.mark()
    k.box(0, 0, bz, 3.4, 3.0, 3.8, BOARDS)
    for z in (bz, bz + 1.9, bz + 3.7):
        k.box(0, 0, z, 3.55, 3.15, 0.14, BEAM, bevel=0.015)
    for x in (-1.7, 1.7):
        for y in (-1.5, 1.5):
            k.box(x, y, bz, 0.16, 0.16, 3.8, BEAM, bevel=0.015)
    ridge = roof(k, 3.4, 3.0, bz + 3.8, 48, 0.25, 0.3, 0.16, SHINGLES)
    gables(k, 3.4, 3.0, bz + 3.8, ridge, BOARDS, framed=False)
    # Turn so the ridge runs front to back (the sails are on the -Y gable).
    k.move_since(m, Matrix.Rotation(math.pi / 2, 4, "Z"))
    window(k, 0.8, -1.7, bz + 1.0, w=0.5, h=0.5, shutters=False)
    # Steps and tail pole at the back, by which the miller turns the mill into the wind.
    for side in (-0.55, 0.55):
        k.beam((side, 1.7, bz), (side, 4.6, 0.0), 0.12, 0.2, BEAM, bevel=0.015)
    for i in range(9):
        t = (i + 0.5) / 9
        k.box(0, 1.7 + 2.9 * t, bz * (1 - t) - 0.05, 1.1, 0.25, 0.06, BOARDS)
    k.beam((0, 1.6, bz + 0.2), (0.4, 5.2, 0.5), 0.2, 0.2, BEAM, bevel=0.02)
    door(k, 0, 1.5, z0=bz, face=1, w=0.8, h=1.7, step=False)
    # The windshaft's hub on the front gable.
    hub = (0.0, -2.0, bz + 2.9)
    # The windshaft's stub through the gable.
    v = k.cylinder(0, 0, -0.35, 0.28, 0.28, 0.7, 10, BEAM)
    k.place(v, Matrix.Translation(hub) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    for i in range(3 + level):
        sack(k, 2.2 + (i % 2) * 0.55, -2.3 - (i // 2) * 0.45)
    # The sails: a separate part the game turns about the windshaft (local Y).
    s = k.split_off()
    length = 7.2
    for i in range(4):
        a = i * math.pi / 2 + 0.3
        m = s.mark()
        s.beam((0, 0, 0.3), (0, 0, length), 0.22, 0.18, BEAM, bevel=0.02)
        for rail in (0.35, 1.45):
            s.beam((rail, 0, 1.4), (rail, 0, length), 0.08, 0.08, BEAM)
        for j in range(12):
            z = 1.4 + (length - 1.4) * j / 11
            s.beam((-0.1, 0, z), (1.5, 0, z), 0.06, 0.06, BEAM)
        # Canvas spread on the lattice.
        s.slab([(0.1, 0.06, 1.5), (1.4, 0.06, 1.5), (1.4, 0.06, length - 0.1), (0.1, 0.06, length - 0.1)], 0.02, CLOTH)
        s.move_since(m, Matrix.Rotation(a, 4, "Y"))
    s.cylinder(0, 0, -0.45, 0.45, 0.45, 0.9, 10, BEAM)
    return {"sails": (s, hub)}


def smelter(k, level):
    # The furnace: a squat tapering stone stack with its mouth at the front, glowing.
    fx, fy = -1.3, 0.8
    k.cylinder(fx, fy, 0, 1.75, 1.05, 4.6, 12, RUBBLE, bevel=0.0)
    k.cylinder(fx, fy, 4.6, 1.15, 1.15, 0.25, 12, ASHLAR)
    k.cylinder(fx, fy, 4.85, 0.75, 0.75, 0.3, 10, SOOT)
    k.smoke.append((fx, fy, 5.3))
    k.box(fx, fy - 1.6, 0, 0.9, 0.5, 1.2, SOOT)
    k.box(fx, fy - 1.72, 0.1, 0.6, 0.3, 0.5, EMBER)
    for dx in (-0.6, 0.6):
        k.box(fx + dx, fy - 1.75, 0, 0.3, 0.4, 1.4, ASHLAR, bevel=0.03)
    k.box(fx, fy - 1.75, 1.4, 1.5, 0.45, 0.35, ASHLAR, bevel=0.03)
    # The bellows shed against the furnace: open-sided, two great leather bellows and their beam.
    lean_to(k, 0.4, 4.4, 2.9, -0.6, 2.2, 3.0, SHINGLES)
    for i, y in enumerate((0.6, 1.6)):
        k.box(1.5, y, 0.5, 1.8, 0.7, 0.12, BOARDS)
        k.box(1.5, y, 0.62, 1.7, 0.6, 0.35, LEATHER, bevel=0.06, tilt=(0, 0.15 * (1 if i else -1)))
        k.box(1.5, y, 0.97, 1.8, 0.7, 0.1, BOARDS, tilt=(0, 0.2 * (1 if i else -1)))
    k.box(1.2, 1.1, 0, 0.3, 0.3, 0.5, BOARDS)
    k.beam((0.3, 1.1, 1.6), (3.4, 1.1, 1.2), 0.16, 0.16, BEAM)
    k.beam((0.0, 1.1, 0.8), (fx + 1.0, fy, 0.9), 0.14, 0.14, IRON)
    # Black heaps: slag tipped beside the mouth, a charcoal clamp smoking, roasted ore ready to charge.
    for i in range(14):
        k.box(-3.0 + k.jitter(0.8), -2.3 + k.jitter(0.8), -0.1, 0.5 + k.jitter(0.2), 0.45, 0.35 + k.jitter(0.15), SLAG, turn=k.jitter(3), tilt=(k.jitter(0.4), k.jitter(0.4)), bevel=0.05)
    k.cylinder(2.6, -2.7, 0, 1.5, 0.35, 1.1, 12, CHARCOAL)
    k.smoke.append((2.6, -2.7, 1.2))
    for i in range(10):
        k.box(0.3 + k.jitter(0.6), -3.6 + k.jitter(0.4), -0.05, 0.35, 0.3, 0.25 + k.jitter(0.1), ORE, turn=k.jitter(3), bevel=0.04)
    log_stack(k, -3.6, 3.6, 2.6, rows=2, radius=0.15, turn=math.pi / 2)
    if level >= 2:
        k.cylinder(3.9, -0.4, 0, 0.9, 0.2, 0.7, 10, CHARCOAL)
    barrel(k, 0.0, -1.9, surface=BOARDS)
    return {}


def smithy(k, level):
    sx, sy = 6.4, 4.4
    # Stone back and sides, the front open on posts: the forge is seen from the street.
    k.box(0, sy / 2 - 0.25, 0, sx, 0.5, 2.6, RUBBLE, bevel=0.03)
    for x in (-sx / 2 + 0.25, sx / 2 - 0.25):
        k.box(x, 0, 0, 0.5, sy, 2.6, RUBBLE, bevel=0.03)
    for x in (-sx / 2 + 0.25, 0, sx / 2 - 0.25):
        k.box(x, -sy / 2 + 0.1, 0, 0.26, 0.26, 2.6, BEAM, bevel=0.02)
    k.box(0, -sy / 2 + 0.1, 2.4, sx, 0.28, 0.25, BEAM, bevel=0.02)
    k.box(0, 0, -0.05, sx, sy, 0.1, "dirt")
    ridge = roof(k, sx, sy, 2.65, 40, 0.5, 0.3, 0.2, SHINGLES)
    gables(k, sx, sy, 2.65, ridge, BOARDS, framed=False)
    # The hearth at the back left under a stone hood and a big chimney.
    hx, hy = -1.6, 1.2
    k.box(hx, hy, 0, 1.6, 1.3, 0.9, RUBBLE, bevel=0.04)
    k.box(hx, hy - 0.05, 0.9, 1.1, 0.8, 0.12, EMBER)
    k.cylinder(hx, hy + 0.1, 1.9, 1.0, 0.45, 1.0, 4, RUBBLE)
    chimney(k, hx, hy + 0.2, 2.9, ridge + 1.3, w=0.9)
    k.smoke.append((hx, hy + 0.2, ridge + 1.5))
    # Anvil at the front, a quench tub, a grindstone; horseshoes and tools on the back wall.
    anvil(k, 0.2, -0.7, 0.3)
    barrel(k, 1.3, 0.2, 0.8)
    # The grindstone, standing on edge in its frame.
    v = k.cylinder(0, 0, -0.08, 0.5, 0.5, 0.16, 12, STONE_DARK)
    k.place(v, Matrix.Translation((2.3, -3.0, 0.65)) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
    for dx in (-0.12, 0.12):
        k.box(2.3 + dx, -3.0, 0, 0.08, 0.6, 0.75, BOARDS)
    for i in range(6):
        k.box(-0.4 + i * 0.35, sy / 2 - 0.55, 1.2 + (i % 2) * 0.2, 0.06, 0.06, 0.6, STEEL if i % 2 else BOARDS)
    firewood(k, sx / 2 + 0.35, 0.8, w=2.0, h=1.0, d=0.55)
    crate(k, -sx / 2 - 0.5, -1.5, 0.6)
    return {}


def armourer(k, level):
    sx, sy = 6.6, 4.6
    plinth = 0.4
    footing(k, sx, sy, plinth, ASHLAR)
    k.box(0, 0, plinth, sx, sy, 2.7, RUBBLE)
    door(k, -1.5, -sy / 2, plinth, w=1.2)
    window(k, 1.2, -sy / 2, plinth + 0.9, w=1.0, h=0.8)
    up = plinth + 2.7
    k.box(0, 0, up, sx, sy + 0.5, 2.3, PLASTER)
    block(k, sx, sy + 0.5, up, 2.3, PLASTER, True, front=[(-2.3, -1.6), (-0.35, 0.35), (1.6, 2.3)], back=[])
    for x in (-1.95, 0, 1.95):
        window(k, x, -(sy + 0.5) / 2, up + 0.7, w=0.55, h=0.8)
    eave = up + 2.3
    ridge = roof(k, sx, sy + 0.5, eave, 52, 0.5, 0.35, 0.2, TILES)
    gables(k, sx, sy + 0.5, eave, ridge, PLASTER)
    chimney(k, sx / 2 - 1.0, 0.6, plinth, ridge + 1.0, w=0.9)
    k.smoke.append((sx / 2 - 1.0, 0.6, ridge + 1.2))
    # What sells it: armour stands with mail and helmets, a rack of polearms, shields in the town's colour.
    def stand(x, y):
        k.box(x, y, 0, 0.5, 0.5, 0.08, BOARDS)
        k.box(x, y, 0.08, 0.08, 0.08, 1.2, BEAM)
        k.box(x, y, 0.95, 0.55, 0.3, 0.65, STEEL, bevel=0.06)
        k.box(x, y, 0.75, 0.6, 0.34, 0.25, STEEL, bevel=0.04)
        k.cylinder(x, y, 1.62, 0.16, 0.15, 0.24, 8, STEEL)
        k.cylinder(x, y, 1.86, 0.15, 0.02, 0.1, 8, STEEL)
    stand(-3.1, -sy / 2 - 0.9)
    stand(-2.3, -sy / 2 - 1.3)
    k.box(0.6, -sy / 2 - 0.6, 0, 2.2, 0.12, 0.12, BEAM)
    k.box(0.6, -sy / 2 - 0.6, 1.3, 2.2, 0.12, 0.1, BEAM)
    for i in range(6):
        x = -0.3 + i * 0.36
        k.box(x, -sy / 2 - 0.6, 0, 0.05, 0.05, 2.5 + (i % 2) * 0.3, BOARDS)
        k.box(x, -sy / 2 - 0.6, 2.5 + (i % 2) * 0.3, 0.12 if i % 2 else 0.06, 0.03, 0.35, STEEL)
    for i in range(3):
        k.box(2.6 + i * 0.05, -sy / 2 - 0.25 - i * 0.18, 0, 0.62, 0.06, 0.8, TEAM, tilt=(-0.25, 0), bevel=0.02)
    anvil(k, 3.6, -1.2, 1.2)
    barrel(k, 3.8, 0.2, 0.8)
    if level >= 2:
        stand(-1.5, -sy / 2 - 1.0)
    return {}


def iron_mine(k, level):
    # A knoll of rock with the adit driven into its face; rails out to the ore heap.
    for i in range(16):
        x = k.jitter(3.6)
        y = 1.8 + k.jitter(1.6)
        h = 2.4 + k.jitter(1.2) - abs(x) * 0.25
        k.box(x, y, -0.4, 2.0 + k.jitter(0.6), 2.2 + k.jitter(0.6), max(1.2, h), ROCK, turn=k.jitter(1.0), tilt=(k.jitter(0.25), k.jitter(0.25)), bevel=0.15)
    # The portal: two posts and a lintel in the rock face, darkness behind.
    k.box(0, 0.0, 0, 1.6, 1.4, 2.0, SOOT)
    for x in (-0.95, 0.95):
        k.box(x, -0.55, 0, 0.3, 0.3, 2.3, BEAM, bevel=0.03)
    k.box(0, -0.55, 2.3, 2.6, 0.34, 0.32, BEAM, bevel=0.03)
    k.box(0, -0.2, 2.62, 2.8, 0.9, 0.12, BOARDS)
    # Rails and sleepers.
    for x in (-0.38, 0.38):
        k.box(x, -2.5, 0.12, 0.06, 4.0, 0.06, IRON)
    for i in range(7):
        k.box(0, -0.8 - i * 0.6, 0, 1.2, 0.18, 0.12, BOARDS)
    # A tub of ore on the rails.
    k.box(0, -2.9, 0.25, 0.95, 1.2, 0.6, BOARDS, bevel=0.03)
    for dx in (-0.48, 0.48):
        for dy in (-0.4, 0.4):
            v = k.cylinder(0, 0, 0, 0.15, 0.15, 0.06, 8, IRON)
            k.place(v, Matrix.Translation((dx, -2.9 + dy, 0.18)) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
    for i in range(6):
        k.box(k.jitter(0.3), -2.9 + k.jitter(0.4), 0.8, 0.28, 0.25, 0.2, ORE, turn=k.jitter(3), bevel=0.04)
    # The ore heap at the end of the line, the miners' hut, a lantern post.
    for i in range(18):
        k.box(2.6 + k.jitter(0.9), -3.2 + k.jitter(0.9), -0.1, 0.45, 0.4, 0.3 + k.jitter(0.2), ORE, turn=k.jitter(3), tilt=(k.jitter(0.3), k.jitter(0.3)), bevel=0.04)
    m = k.mark()
    block(k, 2.6, 2.2, 0, 2.0, BOARDS_DARK, framed=False)
    door(k, 0.5, -1.1, z0=0, w=0.8, h=1.8, step=False)
    roof(k, 2.6, 2.2, 2.0, 42, 0.35, 0.3, 0.14, SHINGLES)
    k.move_since(m, at(-3.0, -2.6, 0, 0.2))
    k.box(1.3, -0.9, 0, 0.14, 0.14, 2.4, BEAM)
    k.box(1.3, -1.05, 2.1, 0.3, 0.3, 0.35, IRON)
    if level >= 2:
        # A headframe and windlass over a shaft on top of the knoll.
        for dx, dy in ((-0.8, -0.6), (0.8, -0.6), (0, 0.8)):
            k.beam((1.2 + dx, 2.2 + dy, 2.4), (1.2, 2.2, 4.8), 0.16, 0.16, BEAM)
        v = k.cylinder(0, 0, 0, 0.25, 0.25, 1.2, 8, BEAM)
        k.place(v, Matrix.Translation((0.6, 2.2, 4.4)) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
    return {}


BUILDERS = {
    "house": house,
    "woodcutter": woodcutter,
    "bakery": bakery,
    "windmill": windmill,
    "smelter": smelter,
    "smithy": smithy,
    "armourer": armourer,
    "ironMine": iron_mine,
}


GRAPES = "grapes#4a2240"
WINE = "wine#5a1420"


def vineyard(k, level):
    # The vintner's press-house: a whitewashed stone cottage under red tiles, a pergola of vines at the
    # door, baskets of grapes, a hand press in the yard. The vines themselves grow on the strips behind
    # (drawn by the game, which knows how far each has grown).
    sx, sy = 5.0, 4.0
    footing(k, sx, sy, 0.35)
    k.box(0, 0, 0.35, sx, sy, 2.5, PLASTER)
    door(k, -0.8, -sy / 2, 0.35, w=1.0)
    window(k, 1.3, -sy / 2, 1.2, w=0.7, h=0.7)
    ridge = roof(k, sx, sy, 2.85, 34, 0.5, 0.3, 0.18, TILES)
    gables(k, sx, sy, 2.85, ridge, PLASTER, framed=False)
    # A pergola over the door with a vine climbing it.
    for x in (-2.2, 0.6):
        k.box(x, -sy / 2 - 2.2, 0, 0.14, 0.14, 2.4, BEAM)
    for i in range(6):
        k.box(-0.8, -sy / 2 - 0.1 - i * 0.42, 2.35, 3.2, 0.08, 0.08, BEAM)
    k.box(-0.8, -sy / 2 - 1.15, 2.45, 3.0, 2.2, 0.25, "leaves#9ab868", bevel=0.08)
    for i in range(6):
        k.box(-2.0 + i * 0.5 + k.jitter(0.1), -sy / 2 - 0.6 - k.jitter(0.8), 2.1, 0.16, 0.16, 0.3, GRAPES, bevel=0.05)
    # The press: a wooden tub under a great screw beam.
    px, py = 2.6, -3.4
    k.cylinder(px, py, 0, 0.75, 0.7, 0.7, 12, BOARDS)
    k.cylinder(px, py, 0.62, 0.62, 0.62, 0.05, 12, WINE)
    for dx in (-0.85, 0.85):
        k.box(px + dx, py, 0, 0.18, 0.18, 2.0, BEAM)
    k.box(px, py, 1.95, 2.0, 0.24, 0.24, BEAM, bevel=0.02)
    k.cylinder(px, py, 0.8, 0.09, 0.09, 1.15, 8, BEAM)
    # Baskets of grapes.
    for i in range(3 + level):
        bx, by = -3.0 + (i % 3) * 0.6, -3.4 - (i // 3) * 0.6
        k.cylinder(bx, by, 0, 0.26, 0.3, 0.35, 8, "straw#c9b678")
        k.cylinder(bx, by, 0.35, 0.27, 0.12, 0.12, 8, GRAPES)
    barrel(k, 2.9, 1.2, 0.9)
    return {}


def winery(k, level):
    # A stone cellar-house, half sunk in the ground, its barrel store open to the yard.
    sx, sy = 6.6, 4.8
    footing(k, sx, sy, 0.3, ASHLAR)
    k.box(0, 0, 0.3, sx, sy, 3.0, RUBBLE)
    door(k, -1.6, -sy / 2, 0.3, w=1.4, h=2.2)
    for x in (0.6, 2.2):
        window(k, x, -sy / 2, 1.3, w=0.5, h=0.6, shutters=False)
    ridge = roof(k, sx, sy, 3.3, 36, 0.5, 0.35, 0.2, TILES)
    gables(k, sx, sy, 3.3, ridge, RUBBLE, framed=False)
    chimney(k, -sx / 2 + 1.0, 0.8, 0.3, ridge + 0.6, w=0.7)
    # The barrel store: a lean-to on the +X end with great casks on their sides.
    lean_to(k, sx / 2, sx / 2 + 3.2, sy / 2, -sy / 2, 2.4, 3.0, TILES)
    for i in range(2 + (1 if level >= 2 else 0)):
        m = k.mark()
        k.cylinder(0, 0, -0.75, 0.62, 0.62, 1.5, 12, BOARDS, bevel=0.02)
        for z in (-0.6, 0.0, 0.6):
            k.cylinder(0, 0, z - 0.03, 0.645, 0.645, 0.06, 12, IRON)
        k.move_since(m, Matrix.Translation((sx / 2 + 1.6, -1.4 + i * 1.4, 0.65)) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
    # Casks and a cart of grapes by the door; a bush hung out: the old sign of a wine shop.
    for i in range(4):
        barrel(k, -3.0 + (i % 2) * 0.65, -sy / 2 - 0.5 - (i // 2) * 0.6, 0.9)
    k.box(0.2, -sy / 2 - 0.5, 2.6, 0.06, 1.0, 0.06, IRON)
    k.box(0.2, -sy / 2 - 1.0, 2.1, 0.5, 0.5, 0.5, "leaves#7a9a50", bevel=0.15)
    k.box(1.8, -sy / 2 - 1.6, 0.4, 1.4, 2.0, 0.5, BOARDS, bevel=0.03)
    k.box(1.8, -sy / 2 - 1.6, 0.9, 1.2, 1.8, 0.25, GRAPES, bevel=0.08)
    for dy in (-0.8, 0.8):
        v = k.cylinder(0, 0, -0.06, 0.4, 0.4, 0.12, 10, BOARDS)
        k.place(v, Matrix.Translation((1.8 + 0.75, -sy / 2 - 1.6 + dy, 0.4)) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
    return {}


BUILDERS["vineyard"] = vineyard
BUILDERS["winery"] = winery


from parts import HIDE, HORSE_BAY, HORSE_GREY, MEAT, WATER, cart, fence, haystack, horse, pig, target_butt, trough  # noqa: E402


def quarry(k, level):
    # A cut face of rock stepping down at the back, dressed blocks in rows, a jib crane, the masons' lodge.
    for i, (y, h, w) in enumerate(((3.3, 3.4, 8.2), (2.1, 2.2, 7.0), (1.2, 1.1, 5.2))):
        k.box(0.3 * (i - 1), y, -0.3, w, 1.4, h + 0.3, ROCK, bevel=0.12)
    for i in range(4 + level * 2):
        x = -3.2 + (i % 4) * 1.1
        y = -1.2 - (i // 4) * 0.9
        k.box(x, y, 0, 0.9, 0.6, 0.55, ASHLAR, bevel=0.03, turn=k.jitter(0.08))
        if i % 3 == 0:
            k.box(x, y, 0.55, 0.9, 0.6, 0.5, ASHLAR, bevel=0.03, turn=k.jitter(0.08))
    # The crane: a mast, a jib and a block hanging from it.
    k.box(2.8, 0.6, 0, 0.3, 0.3, 4.8, BEAM, bevel=0.02)
    k.beam((2.8, 0.6, 4.4), (0.4, 1.0, 5.0), 0.22, 0.22, BEAM, bevel=0.02)
    k.beam((2.8, 0.6, 2.4), (1.6, 0.8, 4.6), 0.15, 0.15, BEAM)
    for dx in (-0.7, 0.7):
        k.beam((2.8 + dx, 0.6 - 0.7, 0), (2.8, 0.6, 1.6), 0.16, 0.16, BEAM)
    k.box(0.5, 1.0, 2.2, 0.04, 0.04, 2.8, "straw#c9b678")
    k.box(0.5, 1.0, 1.6, 0.8, 0.6, 0.6, ASHLAR, bevel=0.03)
    # The lodge: an open-fronted shed with a banker (work bench) and tools.
    m = k.mark()
    lean_to(k, -1.6, 1.6, 1.2, -1.2, 2.0, 2.6, SHINGLES)
    k.box(0, 0.5, 0, 2.6, 0.6, 0.8, BOARDS, bevel=0.02)
    k.box(0, 0.5, 0.8, 0.6, 0.4, 0.35, ASHLAR, bevel=0.03)
    k.move_since(m, at(-2.6, -3.0, 0, 0.0))
    cart(k, 3.3, -2.8, 0.4, ASHLAR)
    for i in range(10):
        k.box(-4.0 + k.jitter(0.6), 1.0 + k.jitter(0.8), -0.1, 0.4, 0.35, 0.25, RUBBLE, turn=k.jitter(3), bevel=0.04)
    return {}


def farm(k, level):
    # The farmhouse under a deep thatch, a boarded barn with wide doors, a haystack, a cart and a well.
    m = k.mark()
    footing(k, 5.6, 4.0, 0.35)
    block(k, 5.6, 4.0, 0.35, 2.3, PLASTER, True, front=[(-0.5, 0.5), (1.3, 2.1)])
    door(k, 0, -2.0, 0.35)
    window(k, 1.7, -2.0, 1.2, w=0.6, h=0.6)
    roof(k, 5.6, 4.0, 2.65, 50, 0.6, 0.45, 0.35, THATCH, hip=1.0)
    chimney(k, 1.6, 0.6, 0.35, 5.6, w=0.6)
    k.smoke.append((1.6, 0.6, 5.8))
    k.move_since(m, at(-2.0, 1.4))
    m = k.mark()
    k.box(0, 0, 0, 3.4, 4.6, 3.0, BOARDS_DARK)
    for x in (-1.7, 1.7):
        for y in (-2.3, 2.3):
            k.box(x, y, 0, 0.2, 0.2, 3.0, BEAM)
    k.box(0, -2.33, 0, 2.0, 0.08, 2.4, BOARDS)
    k.box(0, -2.36, 1.2, 2.0, 0.06, 0.1, BEAM)
    ridge = roof(k, 4.6, 3.4, 3.0, 45, 0.4, 0.3, 0.3, THATCH, hip=0.6)
    k.move_since(m, at(2.6, 1.4, 0, 1.5708))
    haystack(k, 3.8, -2.6, 1.0)
    if level >= 2:
        haystack(k, 2.4, -3.4, 0.8)
    cart(k, -0.4, -3.2, 1.2, "straw#c9b678" if level >= 2 else None)
    # The well.
    k.cylinder(-3.6, -2.8, 0, 0.6, 0.6, 0.7, 10, RUBBLE)
    k.cylinder(-3.6, -2.8, 0.65, 0.45, 0.45, 0.06, 10, WATER)
    for dx in (-0.55, 0.55):
        k.box(-3.6 + dx, -2.8, 0.7, 0.1, 0.1, 1.2, BEAM)
    k.box(-3.6, -2.8, 1.85, 1.3, 0.12, 0.12, BEAM)
    fence(k, -4.4, -0.6, -4.4, -4.2)
    return {}


def fisher(k, level):
    m = k.mark()
    footing(k, 4.4, 3.6, 0.3)
    block(k, 4.4, 3.6, 0.3, 2.0, BOARDS_DARK, framed=False)
    door(k, 0.8, -1.8, 0.3, w=0.9, h=1.8)
    window(k, -1.0, -1.8, 1.0, w=0.5, h=0.5)
    roof(k, 4.4, 3.6, 2.3, 48, 0.5, 0.4, 0.3, THATCH, hip=0.8)
    k.move_since(m, at(-2.0, 2.0))
    # Drying racks hung with the catch.
    for rack in range(1 + level):
        y = -0.4 - rack * 1.4
        for x in (-3.6, -0.4):
            k.box(x, y, 0, 0.1, 0.1, 1.9, BEAM)
        k.box(-2.0, y, 1.85, 3.4, 0.08, 0.08, BEAM)
        for i in range(8):
            k.box(-3.3 + i * 0.42, y, 1.2, 0.12, 0.04, 0.55, "fish#8fa3b0")
    # A boat drawn up on the bank, upturned, and its oars; a net on stakes; baskets.
    m = k.mark()
    k.box(0, 0, 0, 1.4, 4.2, 0.45, BOARDS, bevel=0.06)
    k.slab([(-0.7, -2.1, 0.45), (0.7, -2.1, 0.45), (0.7, 2.1, 0.45), (-0.7, 2.1, 0.45)], 0.05, BOARDS_DARK)
    k.beam((0, -2.1, 0.2), (0, -2.7, 0.55), 0.18, 0.12, BOARDS)
    k.move_since(m, at(2.8, 0.2, 0, 0.15))
    for x in (1.4, 3.8):
        k.box(x, -3.4, 0, 0.1, 0.1, 1.5, BEAM)
    k.slab([(1.4, -3.4, 1.45), (3.8, -3.4, 1.45), (3.8, -3.4, 0.3), (1.4, -3.4, 0.3)], 0.02, "straw#c9b678")
    for i in range(2 + level):
        k.cylinder(-3.6 + i * 0.6, -3.6, 0, 0.25, 0.3, 0.4, 8, "straw#c9b678")
    return {}


def pig_farm(k, level):
    m = k.mark()
    block(k, 5.0, 3.0, 0, 1.7, BOARDS_DARK, framed=False)
    for x in (-1.6, 0, 1.6):
        k.box(x, -1.52, 0, 1.0, 0.06, 1.1, SOOT)
    roof(k, 5.0, 3.0, 1.7, 30, 0.5, 0.3, 0.3, THATCH, hip=0.5)
    k.move_since(m, at(-1.0, 2.8))
    # The pen: a fenced yard of mud, the pigs, a trough, a straw heap.
    k.box(0, -1.0, -0.05, 8.4, 5.2, 0.08, "mud")
    fence(k, -4.2, 1.6, -4.2, -3.6)
    fence(k, -4.2, -3.6, 4.2, -3.6)
    fence(k, 4.2, -3.6, 4.2, 1.6)
    for i in range(3 + level):
        pig(k, -3.0 + i * 1.3 + k.jitter(0.3), -1.0 + k.jitter(1.6), turn=k.jitter(3.1), scale=0.9 + k.jitter(0.15))
    trough(k, 2.8, -0.2, 1.8, turn=1.5708)
    haystack(k, 3.2, 3.0, 0.9)
    k.box(-3.4, 1.0, 0, 1.2, 0.9, 0.5, "straw#c9b678", bevel=0.15)
    return {}


def butcher(k, level):
    sx, sy = 5.6, 4.2
    footing(k, sx, sy, 0.4)
    block(k, sx, sy, 0.4, 2.6, PLASTER, True, front=[(-1.7, -0.7), (0.6, 1.6)])
    door(k, -1.2, -sy / 2, 0.4)
    window(k, 1.1, -sy / 2, 1.2, w=0.9, h=0.7, shutters=False)
    ridge = roof(k, sx, sy, 3.0, 50, 0.5, 0.35, 0.2, TILES)
    gables(k, sx, sy, 3.0, ridge, PLASTER)
    # The smokehouse: a squat stone hut with its own smoking chimney.
    k.box(sx / 2 + 1.3, 0.6, 0, 2.0, 2.2, 2.2, RUBBLE, bevel=0.03)
    k.slab([(sx / 2 + 0.2, -0.6, 2.2), (sx / 2 + 2.4, -0.6, 2.2), (sx / 2 + 2.4, 1.8, 2.7), (sx / 2 + 0.2, 1.8, 2.7)][::-1], 0.14, SHINGLES, BOARDS)
    chimney(k, sx / 2 + 1.3, 1.2, 2.2, 3.6, w=0.55)
    k.smoke.append((sx / 2 + 1.3, 1.2, 3.8))
    # A rack under the eaves hung with sides of meat and strings of sausages; a block and cleaver.
    for x in (-2.6, 0.2):
        k.box(x, -sy / 2 - 0.9, 0, 0.12, 0.12, 2.3, BEAM)
    k.box(-1.2, -sy / 2 - 0.9, 2.25, 3.0, 0.12, 0.12, BEAM)
    for i in range(5 + level):
        x = -2.3 + i * 0.45
        if i % 2:
            k.box(x, -sy / 2 - 0.9, 1.3, 0.3, 0.14, 0.9, MEAT, bevel=0.06)
        else:
            for j in range(4):
                k.box(x, -sy / 2 - 0.9, 2.0 - j * 0.2, 0.09, 0.09, 0.18, "meat#7a3a30", bevel=0.03)
    k.cylinder(1.6, -sy / 2 - 1.2, 0, 0.4, 0.42, 0.8, 9, BARK)
    k.box(1.6, -sy / 2 - 1.2, 0.8, 0.06, 0.3, 0.12, STEEL)
    barrel(k, 2.4, -sy / 2 - 0.5, 0.85)
    return {}


def tannery(k, level):
    sx, sy = 5.4, 4.0
    footing(k, sx, sy, 0.3)
    block(k, sx, sy, 0.3, 2.4, BOARDS_DARK, framed=False)
    door(k, -1.4, -sy / 2, 0.3)
    ridge = roof(k, sx, sy, 2.7, 45, 0.5, 0.35, 0.22, SHINGLES)
    gables(k, sx, sy, 2.7, ridge, BOARDS_DARK, framed=False)
    # The vats: sunk tubs of brown liquor in a row in the yard.
    for i in range(3 + (1 if level >= 2 else 0)):
        x = -3.0 + i * 1.5
        k.cylinder(x, -3.4, 0, 0.62, 0.62, 0.55, 12, BOARDS, bevel=0.02)
        k.cylinder(x, -3.4, 0.5, 0.55, 0.55, 0.03, 12, "liquor#5a3a1e")
    # Frames with hides stretched to dry: the sign of the trade from afar.
    for i, x in enumerate((1.4, 3.2)):
        m = k.mark()
        for dx in (-0.8, 0.8):
            k.box(dx, 0, 0, 0.1, 0.1, 2.0, BEAM)
        k.box(0, 0, 1.95, 1.8, 0.1, 0.1, BEAM)
        k.box(0, 0, 0.35, 1.8, 0.1, 0.1, BEAM)
        k.slab([(-0.7, 0.03, 1.85), (0.7, 0.03, 1.85), (0.75, 0.03, 0.45), (-0.65, 0.03, 0.5)], 0.02, HIDE)
        k.move_since(m, at(x, -1.6 - i * 0.2, 0, 0.3))
    # Oak bark for the tanning, stacked under a little roof.
    lean_to(k, sx / 2 + 0.1, sx / 2 + 1.8, 1.8, -1.0, 1.6, 2.0, SHINGLES)
    for i in range(6):
        k.box(sx / 2 + 0.9, -0.6 + i * 0.4, 0, 1.2, 0.35, 0.9 + k.jitter(0.2), BARK)
    return {}


def fletcher(k, level):
    sx, sy = 5.4, 4.0
    footing(k, sx, sy, 0.4)
    block(k, sx, sy, 0.4, 2.5, PLASTER, True, front=[(-1.9, -0.9), (0.4, 1.4)])
    door(k, -1.4, -sy / 2, 0.4)
    window(k, 0.9, -sy / 2, 1.2, w=0.8, h=0.7)
    ridge = roof(k, sx, sy, 2.9, 52, 0.5, 0.35, 0.3, THATCH, hip=0.9)
    # Under the front eaves: a rack of bows, sheaves of arrows in barrels, a stack of staves.
    k.box(1.6, -sy / 2 - 0.5, 0, 2.2, 0.1, 0.1, BEAM)
    k.box(1.6, -sy / 2 - 0.5, 1.7, 2.2, 0.1, 0.1, BEAM)
    for i in range(6):
        x = 0.7 + i * 0.36
        k.beam((x, -sy / 2 - 0.5, 0.05), (x + 0.1, -sy / 2 - 0.45, 1.75), 0.04, 0.06, "bow#7d6a3c")
    for i in range(2):
        barrel(k, 3.3 + i * 0.6, -sy / 2 - 0.6, 0.7)
        for j in range(6):
            k.box(3.3 + i * 0.6 + k.jitter(0.12), -sy / 2 - 0.6 + k.jitter(0.12), 0.6, 0.02, 0.02, 0.75, BEAM)
    for i in range(3 + level):
        log(k, -3.1, -2.8 - i * 0.18, 0.08 + (i % 2) * 0.1, 2.0, 0.05, turn=1.5708 + k.jitter(0.1))
    # The butt they try the bows at.
    target_butt(k, -2.4, -4.0, 0.2)
    return {}


def stable(k, level):
    # A long low stable with a door to every stall, a fenced paddock with horses, hay, a trough.
    m = k.mark()
    sx = 7.0
    block(k, sx, 3.2, 0, 2.4, BOARDS_DARK, framed=False)
    for i in range(4):
        x = -2.6 + i * 1.75
        k.box(x, -1.63, 0.05, 1.0, 0.08, 1.2, BOARDS)
        k.box(x, -1.63, 1.25, 1.0, 0.08, 0.95, SOOT)
    for x in (-sx / 2, sx / 2):
        k.box(x, -1.6, 0, 0.2, 0.2, 2.4, BEAM)
    ridge = roof(k, sx, 3.2, 2.4, 40, 0.6, 0.3, 0.25, SHINGLES)
    gables(k, sx, 3.2, 2.4, ridge, BOARDS_DARK, framed=False)
    k.move_since(m, at(0, 2.6))
    fence(k, -4.0, 0.6, -4.0, -4.0)
    fence(k, -4.0, -4.0, 4.0, -4.0)
    fence(k, 4.0, -4.0, 4.0, 0.6)
    horse(k, -2.0, -2.0, 0.6, HORSE_BAY, grazing=True)
    horse(k, 1.8, -2.4, -1.2, HORSE_GREY)
    if level >= 2:
        horse(k, 0.0, -1.0, 2.6, HORSE_BAY)
    trough(k, 3.0, -0.6, 1.6)
    haystack(k, -3.0, 0.2, 0.7)
    return {}


def barracks(k, level):
    sx, sy = 8.0, 5.0
    plinth = 0.4
    footing(k, sx, sy, plinth, ASHLAR)
    k.box(0, 0, plinth, sx, sy, 2.8, RUBBLE)
    door(k, 0, -sy / 2, plinth, w=1.6, h=2.3)
    for x in (-2.6, 2.6):
        window(k, x, -sy / 2, plinth + 1.0, w=0.4, h=0.8, shutters=False)
    up = plinth + 2.8
    k.box(0, 0, up, sx, sy + 0.4, 2.4, PLASTER)
    block(k, sx, sy + 0.4, up, 2.4, PLASTER, True, front=[(-3.0, -2.3), (-1.2, -0.5), (0.5, 1.2), (2.3, 3.0)])
    for x in (-2.65, -0.85, 0.85, 2.65):
        window(k, x, -(sy + 0.4) / 2, up + 0.8, w=0.5, h=0.7)
    eave = up + 2.4
    ridge = roof(k, sx, sy + 0.4, eave, 50, 0.5, 0.4, 0.22, TILES)
    gables(k, sx, sy + 0.4, eave, ridge, PLASTER)
    chimney(k, -sx / 2 + 1.2, 0.8, plinth, ridge + 0.8, w=0.8)
    k.smoke.append((-sx / 2 + 1.2, 0.8, ridge + 1.0))
    # The banner of the side over the door.
    k.box(0, -sy / 2 - 0.3, up + 0.4, 0.1, 0.1, 4.5, BEAM)
    k.slab([(0.05, -sy / 2 - 0.3, up + 4.7), (1.6, -sy / 2 - 0.3, up + 4.4), (1.6, -sy / 2 - 0.3, up + 3.3), (0.05, -sy / 2 - 0.3, up + 3.6)], 0.03, TEAM)
    # The drill yard: pells (posts to hack at), a rack of spears, a target.
    for i, x in enumerate((-3.2, -2.0)):
        k.box(x, -sy / 2 - 2.2, 0, 0.3, 0.3, 1.8, BARK)
        k.box(x, -sy / 2 - 2.2, 1.1, 0.7, 0.12, 0.12, BEAM)
    k.box(2.4, -sy / 2 - 1.0, 0, 2.4, 0.1, 0.1, BEAM)
    k.box(2.4, -sy / 2 - 1.0, 1.5, 2.4, 0.1, 0.1, BEAM)
    for i in range(7):
        x = 1.4 + i * 0.33
        k.box(x, -sy / 2 - 1.0, 0, 0.05, 0.05, 2.6, BOARDS)
        k.box(x, -sy / 2 - 1.0, 2.6, 0.08, 0.03, 0.3, STEEL)
    target_butt(k, 3.6, -sy / 2 - 3.2, -0.3)
    if level >= 2:
        k.box(-0.4, -sy / 2 - 3.0, 0, 1.6, 0.6, 0.9, BOARDS, bevel=0.02)
        for i in range(3):
            k.box(-0.9 + i * 0.5, -sy / 2 - 3.0, 0.9, 0.4, 0.06, 0.55, TEAM, tilt=(-0.2, 0), bevel=0.02)
    return {}


BUILDERS.update({
    "quarry": quarry,
    "farm": farm,
    "fisher": fisher,
    "pigFarm": pig_farm,
    "butcher": butcher,
    "tannery": tannery,
    "fletcher": fletcher,
    "stable": stable,
    "barracks": barracks,
})
