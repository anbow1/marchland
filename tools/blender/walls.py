"""Marchland's wall and watchtower from Tower and Castle Walls (LucasPresoto, CC BY 4.0, see
public/buildings/CREDITS.md).

    bl/bin/python -I tools/blender/walls.py <tower_and_castle_walls/scene.glb> public/buildings

Writes wall.glb, one stretch of wall for a 2 m cell of the nav grid (wallView.ts lays one per cell,
turned along the line it was drawn on), and tower_1..3.glb, the watchtower by level. As in keep.py,
the source keeps its shapes and loses its textures: its stone becomes the game's ashlar, so walls and
towers weather and tint like the rest of the town. The wall stretch is one merlon's period of the
source's plain wall, cut out and closed at both ends, stretched to the cell and sunk 2 m into the
ground so it meets the slope; gate.glb, the source's gate narrowed to three cells, its leaves apart
so they can swing. The tower is the source's, scaled so its fighting floor stands where
the archers stand (TOWER.topM in config.ts), with a door, the side's flag and, by level, a timber
hoarding and a light roof over the top."""

import json
import math
import os
import sys

import bpy  # first: it puts bmesh and mathutils on the path
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import Kit, export_glb  # noqa: E402
from parts import ASHLAR, BEAM, BOARDS, IRON, SHINGLES, TEAM, door, roof  # noqa: E402

# The scans are warm (rubble averages 138, 126, 102; ashlar 119, 102, 76): these tints cancel the red so
# the stone reads grey, as walls of grey stone should.
STONE = "ashlar#bccae6"
BODY = "rubble#bccfff"
# How much taller the wall's merlons are made than the source's.
MERLON_RAISE = 0.8
DOOR = "boards#8a7360"
# The nav grid's cell, and how far a stretch overlaps its neighbour so no seam shows.
CELL_M = 2.0
OVERLAP_M = 0.08
# Cells a gate spans (GATE.cells in config.ts).
GATE_CELLS = 3
# Height of a tower's fighting floor (TOWER.topM is where the archers' feet are).
FLOOR_M = 8.6


def load(source: str) -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source)
    found = {}
    for o in list(bpy.context.scene.objects):
        if o.type == "MESH":
            found[o.material_slots[0].material.name] = o
    return found


def baked(o) -> bmesh.types.BMesh:
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.transform(o.matrix_world)
    return bm


def object_from(bm, name: str, surface: str):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    mesh.materials.append(bpy.data.materials.get(surface) or bpy.data.materials.new(surface))
    for p in mesh.polygons:
        p.material_index = 0
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def clear_scene_except(keep_names=()):
    for o in list(bpy.context.scene.objects):
        if o.name not in keep_names:
            bpy.data.objects.remove(o)


def wall(source: str, out: str) -> int:
    found = load(source)
    bm = baked(found["Wall"])
    ground = min(v.co.z for v in bm.verts)
    top = max(v.co.z for v in bm.verts)
    # The merlons: the highest vertices, in clusters along X.
    xs = sorted(v.co.x for v in bm.verts if v.co.z > top - 0.02)
    centres, run = [], [xs[0]]
    for x in xs[1:]:
        if x - run[-1] > 0.2:
            centres.append(sum(run) / len(run))
            run = []
        run.append(x)
    centres.append(sum(run) / len(run))
    # Each merlon's top shows as two clusters, its left and right edges.
    centres = [(a + b) / 2 for a, b in zip(centres[0::2], centres[1::2])]
    period = sorted(b - a for a, b in zip(centres, centres[1:]))[(len(centres) - 1) // 2]
    mid = centres[len(centres) // 2]
    x0, x1 = mid - period / 2, mid + period / 2
    for x, keep_side in ((x0, "outer"), (x1, "inner")):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(x, 0, 0), plane_no=(1, 0, 0), clear_inner=(keep_side == "outer"), clear_outer=(keep_side == "inner"))
    # Close the cut ends: a stretch at the end of a wall shows them.
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    stretch = (CELL_M + OVERLAP_M) / period
    centre_y = (min(v.co.y for v in bm.verts) + max(v.co.y for v in bm.verts)) / 2
    # The wall-walk: the next height down from the merlons' tops. The merlons are raised by most of
    # their height again, so they read from a strategy camera's height.
    walk = max(v.co.z for v in bm.verts if v.co.z < top - 0.05)
    raise_m = (top - walk) * MERLON_RAISE
    for v in bm.verts:
        z = v.co.z - ground + (raise_m if v.co.z > walk + 0.02 else 0)
        v.co = Vector(((v.co.x - mid) * stretch, v.co.y - centre_y, z if z > 0.01 else -2.0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    clear_scene_except()
    obj = object_from(bm, "wall", BODY)
    # The coping and the merlons in dressed stone, the body in rubble, as in the source.
    obj.data.materials.append(bpy.data.materials.get(STONE) or bpy.data.materials.new(STONE))
    cap_from = walk - ground - 0.15
    for p in obj.data.polygons:
        p.material_index = 1 if p.center.z > cap_from else 0
    tris = len(obj.data.polygons)
    export_glb(os.path.join(out, "wall.glb"))
    height = round(top - ground, 2)
    print(f"wall: {tris} triangles, merlon period {period:.2f} m stretched to {CELL_M + OVERLAP_M} m, {height} m high, merlons raised {raise_m:.2f} m")
    return tris


def gate(source: str, out: str) -> int:
    """The gate: the source's wall with its arch and its two leaves, narrowed to GATE.cells of the nav grid.
    The leaves are meshes of their own, 'leaf_l' and 'leaf_r', their origins on their hinges, so the game
    swings them open."""
    found = load(source)
    bm = baked(found["Wall01"])
    ground = min(v.co.z for v in bm.verts)
    top = max(v.co.z for v in bm.verts)
    lo_x = min(v.co.x for v in bm.verts)
    hi_x = max(v.co.x for v in bm.verts)
    mid_x = (lo_x + hi_x) / 2
    centre_y = (min(v.co.y for v in bm.verts) + max(v.co.y for v in bm.verts)) / 2
    length = GATE_CELLS * CELL_M + OVERLAP_M
    stretch = length / (hi_x - lo_x)
    walk = max(v.co.z for v in bm.verts if v.co.z < top - 0.05)
    raise_m = (top - walk) * MERLON_RAISE

    def place(co):
        z = co.z - ground + (raise_m if co.z > walk + 0.02 else 0)
        return Vector(((co.x - mid_x) * stretch, co.y - centre_y, z if z > 0.01 else -2.0))

    for v in bm.verts:
        v.co = place(v.co)
    leaves = {}
    for side, key in (("leaf_l", "Door_L"), ("leaf_r", "Door_R")):
        obj = next(o for o in bpy.context.scene.objects if o.type == "MESH" and o.name.startswith(key))
        lb = baked(obj)
        xs = [v.co.x for v in lb.verts]
        # The hinge is the leaf's outer edge: the side away from the middle of the arch.
        hinge_x = max(xs) if (sum(xs) / len(xs)) > mid_x else min(xs)
        hinge = place(Vector((hinge_x, centre_y, ground + 0.02)))
        hinge.y = sum(v.co.y for v in lb.verts) / len(lb.verts) - centre_y
        for v in lb.verts:
            v.co = place(v.co) - hinge
        leaves[side] = (lb, hinge)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    clear_scene_except()
    body = object_from(bm, "gate", BODY)
    body.data.materials.append(bpy.data.materials.get(STONE) or bpy.data.materials.new(STONE))
    cap_from = walk - ground - 0.15
    for p in body.data.polygons:
        p.material_index = 1 if p.center.z > cap_from else 0
    tris = len(body.data.polygons)
    for side, (lb, hinge) in leaves.items():
        leaf = object_from(lb, side, DOOR)
        leaf.location = hinge
        tris += len(leaf.data.polygons)
    export_glb(os.path.join(out, "gate.glb"))
    print(f"gate: {tris} triangles, {length:.2f} m long (stretch {stretch:.2f}), merlons raised {raise_m:.2f} m")
    return tris


def tower(source: str, out: str, level: int) -> int:
    found = load(source)
    bm = baked(found["Tower"])
    ground = min(v.co.z for v in bm.verts)
    lo = Vector((min(v.co.x for v in bm.verts), min(v.co.y for v in bm.verts)))
    hi = Vector((max(v.co.x for v in bm.verts), max(v.co.y for v in bm.verts)))
    centre = (lo + hi) / 2
    # The fighting floor: of the level faces in the upper half, the height with the most area.
    top = max(v.co.z for v in bm.verts)
    areas = {}
    for f in bm.faces:
        c = f.calc_center_median()
        if f.normal.z > 0.9 and c.z > ground + (top - ground) * 0.5:
            areas[round(c.z, 1)] = areas.get(round(c.z, 1), 0) + f.calc_area()
    floor = max(areas, key=areas.get)
    s = FLOOR_M / (floor - ground)
    for v in bm.verts:
        z = (v.co.z - ground) * s
        v.co = Vector(((v.co.x - centre.x) * s, (v.co.y - centre.y) * s, z if z > 0.01 else -1.0))
    half = (hi.x - lo.x) * s / 2
    peak = (top - ground) * s
    clear_scene_except()
    object_from(bm, f"tower_{level}", STONE)

    k = Kit(seed=7100 + level)
    door(k, 0, -half, 0.0, w=1.1, h=2.1)
    if level >= 2:
        # Hoardings: a timber gallery hung on the front below the battlements.
        k.box(0, -half - 0.45, FLOOR_M - 1.3, 2 * half - 0.4, 0.9, 0.9, BOARDS, bevel=0.02)
        for x in (-half + 0.5, 0, half - 0.5):
            k.box(x, -half - 0.45, FLOOR_M - 2.0, 0.16, 0.9, 0.7, BEAM)
    pole_x, pole_y = half - 0.45, half - 0.45
    if level >= 3:
        # A light roof on four posts over the fighting top; the flag rises from its peak.
        edge = half - 0.25
        for dx in (-1, 1):
            for dy in (-1, 1):
                k.box(dx * (edge - 0.2), dy * (edge - 0.2), FLOOR_M, 0.18, 0.18, 2.4, BEAM)
        ridge = roof(k, 2 * edge, 2 * edge, FLOOR_M + 2.4, 40, 0.3, 0.3, 0.16, SHINGLES, hip=edge - 0.2)
        pole_x, pole_y, base = 0.0, 0.0, ridge
    else:
        base = peak
    k.box(pole_x, pole_y, base, 0.09, 0.09, 2.6, IRON)
    flag_top = base + 2.5
    k.slab([(pole_x + 0.05, pole_y, flag_top), (pole_x + 1.7, pole_y, flag_top - 0.15), (pole_x + 1.7, pole_y, flag_top - 1.05), (pole_x + 0.05, pole_y, flag_top - 0.9)], 0.03, TEAM)
    tris = sum(len(p.vertices) - 2 for p in bpy.data.objects[f"tower_{level}"].data.polygons) + k.triangles()
    k.to_object(f"tower_{level}_parts")
    export_glb(os.path.join(out, f"tower_{level}.glb"))
    print(f"tower {level}: {tris} triangles, {2 * half:.1f} m square, floor {FLOOR_M} m, scale {s:.2f}")
    return tris


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:3]
    source, out = args[0], args[1]
    os.makedirs(out, exist_ok=True)
    wall(source, out)
    gate(source, out)
    index_path = os.path.join(out, "index.json")
    index = json.load(open(index_path)) if os.path.exists(index_path) else {}
    for level in (1, 2, 3):
        index[f"tower:{level}"] = {"file": f"tower_{level}.glb", "triangles": tower(source, out, level)}
    with open(index_path, "w") as f:
        json.dump(dict(sorted(index.items())), f, indent=1)


main()
