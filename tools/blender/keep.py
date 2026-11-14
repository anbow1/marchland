"""Turns Buckstone Castle (Peter Leban, CC BY 4.0, see CREDITS.md) into Marchland's keep.

    bl/bin/python -I tools/blender/keep.py <buckstone_castle/scene.gltf> public/buildings

The source keeps its shapes; its textures go. Every face is given one of the game's scanned surfaces
instead, like the buildings made in build.py, so the keep is lit, weathered and tinted like the rest of
the town: plastered walls, ashlar quoins, red tiled and grey slate roofs, and the wood, thatch and
cobbles of the house atlas, sorted by where on that atlas each face took its colour. The ground plate
and the ivy cards (which need alpha) are dropped, the densest meshes thinned, and a flag in the team's
colour raised on the highest spire. Gate towards +Z in the game, as for every building; ground at 0."""

import json
import math
import os
import sys

import bpy  # first: it puts bmesh and mathutils on the path
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import export_glb  # noqa: E402

# Longest side of the walls' footprint in the game, metres.
FOOTPRINT_M = 24.0
# The source's materials, and what each becomes: a surface, optionally tinted ('#rrggbb').
SURFACE_OF = {
    "WallCorner": "ashlar#d6d0c4",
    "CornerStoneShit": "ashlar#e2dccf",
    "M_Wall_Plastered": "plaster#efe9de",
    "BigShingleRoof": "tiles#c86a48",
    "M_Roof": "shingles#8a8f94",
    "Strelovod2": "iron#3b3936",
    "M_CastleFloorDirt": "dirt",
}
DROP = {"material"}  # the ivy: leaf cards that only work with an alpha cut-out
# Fraction of triangles kept by meshes too dense for a strategy camera.
THIN = {"CornerStoneShit": 0.22, "Strelovod2": 0.3, "M_House": 0.55}


def atlas_surface(u: float, v: float) -> str:
    """The house atlas is a 3×3 grid of materials; (u, v) as Blender has them (v up)."""
    fx = u % 1.0
    fy = 1.0 - (v % 1.0)  # rows counted from the image's top
    col = min(2, int(fx * 3))
    row = min(2, int(fy * 3))
    return {
        (0, 0): "beam#b8aa98",
        (0, 1): "shingles#7d8085",
        (0, 2): "boards#a89580",
        (1, 1): "thatch",
        (1, 2): "rubble",
        (2, 2): "boards#6e5a48",  # doors and shutters
    }.get((col, row), "plaster#d8cfc0")  # the plain grey-brown fill


def material(name: str) -> bpy.types.Material:
    return bpy.data.materials.get(name) or bpy.data.materials.new(name)


def main() -> None:
    source, out = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:3]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in meshes:
        src = o.material_slots[0].material.name if o.material_slots and o.material_slots[0].material else ""
        if src in DROP:
            bpy.data.objects.remove(o)
            continue
        o["src"] = src
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]

    # Ground level: the lowest point of the plastered walls' outside faces.
    walls = [o for o in meshes if o["src"] in ("M_Wall_Plastered", "WallCorner")]
    wall_pts = [o.matrix_world @ v.co for o in walls for v in o.data.vertices]
    ground = min(p.z for p in wall_pts)
    lo = Vector((min(p.x for p in wall_pts), min(p.y for p in wall_pts)))
    hi = Vector((max(p.x for p in wall_pts), max(p.y for p in wall_pts)))

    for o in meshes:
        src = o["src"]
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.transform(o.matrix_world)
        uv = bm.loops.layers.uv.active
        # The ground plate: level faces at the foot of the walls, or anything far outside them.
        doomed = []
        for f in bm.faces:
            c = f.calc_center_median()
            # Any corner outside: the plate is two big triangles whose middles lie within the walls.
            outside = any(v.co.x < lo.x - 2 or v.co.x > hi.x + 2 or v.co.y < lo.y - 2 or v.co.y > hi.y + 2 for v in f.verts)
            plate = f.normal.z > 0.95 and c.z < ground + 1.2
            if outside or (src == "M_House" and plate):
                doomed.append(f)
        bmesh.ops.delete(bm, geom=doomed, context="FACES")
        names = []
        if src == "M_House":
            for f in bm.faces:
                if uv is None:
                    names.append("plaster")
                    continue
                u = sum(l[uv].uv.x for l in f.loops) / len(f.loops)
                v = sum(l[uv].uv.y for l in f.loops) / len(f.loops)
                names.append(atlas_surface(u, v))
        else:
            names = [SURFACE_OF.get(src, "plaster")] * len(bm.faces)
        slots = sorted(set(names))
        for f, n in zip(bm.faces, names):
            f.material_index = slots.index(n)
        o.data.materials.clear()
        for n in slots:
            o.data.materials.append(material(n))
        o.matrix_world.identity()
        bm.to_mesh(o.data)
        bm.free()
        ratio = THIN.get(src)
        if ratio:
            mod = o.modifiers.new("thin", "DECIMATE")
            mod.ratio = ratio
            mod.use_collapse_triangulate = True
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier="thin")

    # Join, centre on the walls' footprint, put the ground at 0 and scale to size.
    bpy.ops.object.select_all(action="DESELECT")
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    keep = bpy.context.view_layer.objects.active
    keep.name = "keep_1"
    scale = FOOTPRINT_M / max(hi.x - lo.x, hi.y - lo.y)
    centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, ground))
    for v in keep.data.vertices:
        v.co = (v.co - centre) * scale
    # The highest point (the main spire's finial) carries the flag.
    top = max(keep.data.vertices, key=lambda v: v.co.z).co.copy()
    bm = bmesh.new()
    pole_h, flag_w, flag_h = 3.2, 2.6, 1.6
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.06, radius2=0.05, depth=pole_h, matrix=Matrix.Translation(top + Vector((0, 0, pole_h / 2))))
    pole_faces = len(bm.faces)
    # A flag of a few strips, in a slight wave.
    strips = 5
    for side in (0, 1):  # each face of the cloth its own vertices, so both can be seen
        verts = []
        for i in range(strips + 1):
            x = flag_w * i / strips
            y = 0.18 * math.sin(i * 1.3) + (0.01 if side else 0)
            verts.append((bm.verts.new(top + Vector((x, y, pole_h - 0.05))), bm.verts.new(top + Vector((x, y, pole_h - 0.05 - flag_h)))))
        for i in range(strips):
            a, b = verts[i]
            c, d = verts[i + 1]
            bm.faces.new((a, b, d, c) if side == 0 else (c, d, b, a))
    flag = bpy.data.meshes.new("flag")
    bm.to_mesh(flag)
    bm.free()
    flag.materials.append(material("iron#3b3936"))
    flag.materials.append(material("team"))
    for i, f in enumerate(flag.polygons):
        f.material_index = 0 if i < pole_faces else 1
    flag_obj = bpy.data.objects.new("flag", flag)
    bpy.context.scene.collection.objects.link(flag_obj)

    # Gate towards the game's +Z (Blender -Y): turned by eye from the source, whose gate faces +X.
    for o in (keep, flag_obj):
        o.rotation_euler = (0, 0, -math.pi / 2)
    tris = sum(len(p.vertices) - 2 for o in (keep, flag_obj) for p in o.data.polygons)
    os.makedirs(out, exist_ok=True)
    export_glb(os.path.join(out, "keep_1.glb"))
    index_path = os.path.join(out, "index.json")
    index = json.load(open(index_path)) if os.path.exists(index_path) else {}
    index["keep:1"] = {"file": "keep_1.glb", "triangles": tris}
    with open(index_path, "w") as f:
        json.dump(dict(sorted(index.items())), f, indent=1)
    size = [round(c * scale, 1) for c in (hi.x - lo.x, hi.y - lo.y)]
    height = round(max(v.co.z for v in keep.data.vertices), 1)
    print(f"keep: {tris} triangles, footprint {size} m, {height} m to the finial")


main()
