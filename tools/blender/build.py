"""Builds one Marchland building as .glb:  bl/bin/python tools/blender/build.py <kind> <level> <out.glb>"""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import Kit, export_glb  # noqa: E402

PLASTER = "plaster"
BEAM = "beam#d8cfc6"
BOARDS = "boards"
SHINGLES = "shingles"
RUBBLE = "rubble"
GLASS = "glass#20252a"
IRON = "iron#4a4c50"


def timber_wall(k: Kit, x0, x1, y, z0, z1, openings, face):
    """Posts, rails and braces on a wall running along X at y, proud of the plaster on side `face` (-1 front, +1 back)."""
    t = 0.2
    yy = y + face * 0.03
    span = x1 - x0
    n = max(2, round(span / 1.25))
    posts = [x0 + span * i / n for i in range(n + 1)]
    for x in posts:
        if any(o[0] - 0.15 < x < o[1] + 0.15 for o in openings):
            continue
        k.box(x, yy, z0, t, t, z1 - z0, BEAM, bevel=0.02, turn=k.jitter(0.01))
    k.box((x0 + x1) / 2, yy, z0, span + 0.25, t + 0.02, 0.24, BEAM, bevel=0.025)
    k.box((x0 + x1) / 2, yy, z1 - 0.22, span + 0.3, t + 0.02, 0.22, BEAM, bevel=0.025)
    # A mid rail between posts, broken by the openings.
    mid = z0 + (z1 - z0) * 0.45
    edges = [x0] + [v for o in openings for v in (o[0] - 0.1, o[1] + 0.1)] + [x1]
    for a, b in zip(edges[0::2], edges[1::2]):
        if b - a > 0.3:
            k.box((a + b) / 2, yy, mid, b - a, t * 0.8, 0.16, BEAM, bevel=0.02)
    # Braces from the corner posts.
    for corner, sign in ((x0, 1), (x1, -1)):
        k.beam((corner + sign * 0.1, yy, z0 + 0.22), (corner + sign * 1.05, yy, mid), 0.15, 0.15, BEAM, bevel=0.015)


def window(k: Kit, x, y, z, face, w=0.7, h=0.8, shutters=True):
    """A window on a wall at y (face -1 front): sill, frame, dark glass, glazing bars, open shutters."""
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


def door(k: Kit, x, y, face, w=1.0, h=2.0):
    out = face * 0.04
    k.box(x, y + out, 0.5, w, 0.08, h, BOARDS)
    for dz in (0.35, h - 0.35):
        k.box(x, y + out * 2, 0.5 + dz, w * 0.9, 0.03, 0.05, IRON)
    for dx in (-w / 2 - 0.08, w / 2 + 0.08):
        k.box(x + dx, y + out * 1.5, 0.5, 0.16, 0.16, h + 0.1, BEAM, bevel=0.015)
    k.box(x, y + out * 1.5, 0.5 + h, w + 0.5, 0.18, 0.18, BEAM, bevel=0.015)
    # A step of stones.
    k.box(x, y + face * 0.45, 0, w + 0.4, 0.6, 0.5, RUBBLE, bevel=0.04)


def roof(k: Kit, sx, sy, eave_z, pitch_deg, overhang, gable_overhang, thick, surface):
    """A gabled roof, ridge along X: two slabs, ridge cap, barge boards; returns the ridge height."""
    half = sy / 2 + overhang
    rise = (sy / 2) * math.tan(math.radians(pitch_deg))
    ridge_z = eave_z + rise
    drop = overhang * math.tan(math.radians(pitch_deg))
    x0 = -sx / 2 - gable_overhang
    x1 = sx / 2 + gable_overhang
    # A little sag in the middle of each slope: old roofs are never quite flat.
    for side in (-1, 1):
        y_e = side * half
        corners = [(x0, y_e, eave_z - drop), (x1, y_e, eave_z - drop), (x1, 0, ridge_z), (x0, 0, ridge_z)]
        if side > 0:
            corners = corners[::-1]
        k.slab(corners, thick, surface, BOARDS)
    k.beam((x0 - 0.1, 0, ridge_z + thick * 0.9), (x1 + 0.1, 0, ridge_z + thick * 0.9), 0.32, 0.22, BOARDS, bevel=0.03)
    for x in (x0 + 0.02, x1 - 0.02):
        for side in (-1, 1):
            k.beam((x, side * half, eave_z - drop - 0.05), (x, 0, ridge_z + 0.05), 0.08, 0.26, BOARDS, bevel=0.01)
    return ridge_z


def gable(k: Kit, x, sy, eave_z, ridge_z, face):
    """The triangle of wall under a gable at x (face -1 = the -X end), framed in timber."""
    verts = k.prism([(-sy / 2, eave_z), (sy / 2, eave_z), (0, ridge_z - 0.15)], 0.28, PLASTER)
    # The prism is made in the XZ plane facing Y; turn it to face X and move it to the end.
    from mathutils import Matrix

    k.place(verts, Matrix.Translation((x, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, "Z"))
    xx = x + face * 0.16
    k.beam((xx, 0, eave_z), (xx, 0, ridge_z - 0.1), 0.18, 0.18, BEAM, bevel=0.015)
    for side in (-1, 1):
        k.beam((xx, side * sy / 2, eave_z + 0.05), (xx, 0, ridge_z - 0.1), 0.18, 0.18, BEAM, bevel=0.015)
        k.beam((xx, side * sy * 0.25, eave_z + 0.05), (xx, side * sy * 0.1, eave_z + (ridge_z - eave_z) * 0.55), 0.14, 0.14, BEAM, bevel=0.012)


def end_wall_timbers(k: Kit, x, sy, z0, z1, face, openings):
    """Posts, rails and braces on an end wall (running along Y at x)."""
    t = 0.2
    xx = x + face * 0.03
    n = max(2, round(sy / 1.25))
    for i in range(n + 1):
        y = -sy / 2 + sy * i / n
        if any(o[0] - 0.15 < y < o[1] + 0.15 for o in openings):
            continue
        k.box(xx, y, z0, t, t, z1 - z0, BEAM, bevel=0.02)
    k.box(xx, 0, z0, t + 0.02, sy + 0.25, 0.24, BEAM, bevel=0.025)
    k.box(xx, 0, z1 - 0.22, t + 0.02, sy + 0.3, 0.22, BEAM, bevel=0.025)
    mid = z0 + (z1 - z0) * 0.45
    k.box(xx, 0, mid, t * 0.8, sy, 0.16, BEAM, bevel=0.02)


def barrel(k: Kit, x, y, scale=1.0):
    k.cylinder(x, y, 0, 0.3 * scale, 0.3 * scale, 0.9 * scale, 10, BOARDS, bevel=0.02)
    for z in (0.15, 0.75):
        k.cylinder(x, y, z * scale, 0.315 * scale, 0.315 * scale, 0.05 * scale, 10, IRON)


def woodpile(k: Kit, x, y, length):
    for row in range(3):
        for i in range(4 - row):
            # Made standing, then laid along Y.
            log = k.cylinder(0, 0, 0, 0.13, 0.13, length, 7, "bark")
            from mathutils import Matrix

            k.place(log, Matrix.Translation((x + (i - (3 - row) / 2) * 0.27, y, 0.13 + row * 0.23)) @ Matrix.Rotation(math.pi / 2, 4, "X") @ Matrix.Translation((0, 0, -length / 2)))


def house(k: Kit, level: int):
    sx, sy = (7.0, 5.0) if level == 1 else (7.6, 5.4)
    plinth = 0.5
    wall_top = plinth + (2.5 if level == 1 else 2.8)
    # Stone footing, sunk a little so it meets uneven ground.
    k.box(0, 0, -0.4, sx + 0.25, sy + 0.25, plinth + 0.4, RUBBLE, bevel=0.04)
    k.box(0, 0, plinth, sx, sy, wall_top - plinth, PLASTER)
    front_openings = [(-0.6, 0.6), (-2.6, -1.7), (1.7, 2.6)]
    timber_wall(k, -sx / 2, sx / 2, -sy / 2, plinth, wall_top, front_openings, -1)
    timber_wall(k, -sx / 2, sx / 2, sy / 2, plinth, wall_top, [(-0.5, 0.5)], 1)
    end_wall_timbers(k, -sx / 2, sy, plinth, wall_top, -1, [(-0.45, 0.45)])
    end_wall_timbers(k, sx / 2, sy, plinth, wall_top, 1, [])
    door(k, 0, -sy / 2, -1)
    for x in (-2.15, 2.15):
        window(k, x, -sy / 2, plinth + 0.85, -1)
    window(k, 0, sy / 2, plinth + 0.85, 1, shutters=False)
    # Side window on the -X end, made on a front wall and turned into place.
    k.bm.verts.ensure_lookup_table()
    before = len(k.bm.verts)
    window(k, 0, 0, plinth + 0.85, -1, w=0.6, h=0.7)
    from mathutils import Matrix

    k.bm.verts.ensure_lookup_table()
    k.place(k.bm.verts[before:], Matrix.Translation((-sx / 2, 0, 0)) @ Matrix.Rotation(-math.pi / 2, 4, "Z"))
    ridge = roof(k, sx, sy, wall_top, 52, 0.55, 0.4, 0.24, SHINGLES)
    gable(k, -sx / 2, sy, wall_top, ridge, -1)
    gable(k, sx / 2, sy, wall_top, ridge, 1)
    # Chimney through the back slope near one end.
    k.box(sx / 2 - 1.3, 0.7, plinth, 0.85, 0.85, ridge - plinth + 0.9, RUBBLE, bevel=0.03)
    k.box(sx / 2 - 1.3, 0.7, ridge + 0.9, 1.0, 1.0, 0.14, "ashlar", bevel=0.02)
    # Life at the walls.
    barrel(k, 1.15, -sy / 2 - 0.55)
    barrel(k, 1.75, -sy / 2 - 0.45, 0.85)
    k.box(-1.6, -sy / 2 - 0.55, 0, 1.4, 0.35, 0.45, BOARDS, bevel=0.02)
    woodpile(k, sx / 2 + 0.55, 0.3, 1.8)
    if level >= 2:
        # A lean-to store on the +X end.
        k.box(sx / 2 + 1.3, -0.6, 0, 2.2, 2.6, 2.1, BOARDS, bevel=0.02)
        k.slab([(sx / 2 + 0.1, -2.1, 2.7), (sx / 2 + 0.1, 0.9, 2.7), (sx / 2 + 2.7, 0.9, 1.9), (sx / 2 + 2.7, -2.1, 1.9)][::-1], 0.12, SHINGLES, BOARDS)


BUILDERS = {"house": house}


def main() -> None:
    kind, level, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    k = Kit(seed=hash((kind, level)) & 0xFFFF)
    BUILDERS[kind](k, level)
    tris = k.triangles()
    k.to_object(f"{kind}_{level}")
    export_glb(out)
    print(f"{kind} level {level}: {tris} triangles, materials {k.materials} -> {out}")


main()
