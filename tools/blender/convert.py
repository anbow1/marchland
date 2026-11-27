"""Turns a downloaded building (CC BY 4.0, see public/buildings/CREDITS.md) into one of Marchland's.

    bl/bin/python -I tools/blender/convert.py <name> <source scene.gltf> public/buildings

`<name>` is an entry of MODELS below: which kind and levels it becomes, its size, its turn, what is
dropped. As in keep.py, the shapes stay and the textures go: each material is given one of the game's
scanned surfaces (or a plain colour) by the words in its name, so the building is lit, weathered and
tinted like every other. Foliage cards, which need alpha, are dropped; the meshes are thinned to the
budget of a building (BLENDER.md: 12 000 triangles); the model is centred on its footprint, its ground
put at 0, its door turned towards -Y (the game's +Z) and scaled to the size of the kind's plot."""

import json
import math
import os
import re
import sys

import bpy  # first: it puts bmesh and mathutils on the path
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import export_glb  # noqa: E402

BUDGET = 12000

# Words in a source material's name, in order, and what the faces become. First match wins.
RULES = [
    (r"ivy|leaf|leaves|listva|fruit|grass|flower|firefl|ground|terrain|water|smoke|fire\b|particle", None),
    (r"glass|window|bootle|bottle", "glass#1e2328"),
    (r"hot.?iron|ember|lava", "ember#ff7a2a"),
    (r"iron|metal|steel|nail|anvil|ring|sword|tool|chain", "iron#4a4c50"),
    (r"coal|charcoal|soot", "soot#1c1a18"),
    (r"leather|cloth|sack|fabric|banner", "cloth#8c6e4e"),
    (r"thatch|straw|hay", "thatch"),
    (r"roof.?tile|tile|krysha|roof_1|roof_3", "tiles#c26a4a"),
    (r"roof|shingle", "shingles"),
    (r"plaster|house_wall|daub|wall_plaster", "plaster#ece4d6"),
    (r"chimney|brick", "rubble#b8a89a"),
    (r"cobble|stone|kamen|rock|sandstone|wall", "rubble"),
    (r"bark|log|trunk|stvol", "bark"),
    (r"door|plank|board|shop", "boards"),
    (r"wood|derevo|timber|beam|chopped", "beam#d8cfc6"),
]
DEFAULT = "plaster#d8cfc0"

# What each download becomes. `fit_m`: the longer side of the footprint; `turn_deg`: about the vertical
# so the door faces -Y; `drop`: a regex over mesh (object) names to leave out; `surfaces`: rules
# (regex, surface or None) tried before RULES; `min_part_m`: meshes smaller than this across (in the
# game's metres) are left out, the bottles and pebbles a strategy camera never sees and that no
# thinning can remove; `plate_m`: faces lying wholly this low are the source's ground plate, removed;
# `smoke_from`: surfaces whose highest point smokes (a chimney's brick, a hearth's embers); `around`: an
# object-name regex, and only meshes whose middle lies within `around_k` of that object's width from its
# middle are kept (one building out of a scene); `stretch_z`: heights times this (a building far longer than a
# plot, fitted to it, would stand lower than the houses round it).
# Tried and left out: Medieval house and wine shop (Don_Dzen): 670 000 triangles in 9 457 pieces, its
# walls under a material named only 'material'; no thinning keeps it whole within a building's budget.
# Medieval Farm Village (Etherlyte): its cottage, cut out with `around` (anchor r"^Roof_Thatched", k 0.6,
# dropping the scattered bricks), is a plain box under its thatch once its painted door, windows and
# timbers are gone with the textures; the town's own houses say more.
# Gothic cathedral (Gnemegorl): 530 000 triangles brought to 42 000 with cull_hidden, protect_m2 and flat (the
# keys stay for the next large model), but its thinned walls broke into shells of one stone colour that did not
# sit with the town; the cathedral is built from the kit instead (buildings.py).
MODELS = {
    "blacksmith": {"kind": "smithy", "levels": [2, 3], "fit_m": 10.5, "turn_deg": 0, "min_part_m": 0.12, "smoke_from": ["rubble#b8a89a", "ember#ff7a2a"]},
    # The enemy's fortress for the campaign's last mission (Medieval Castle, Uğur Yakışık): curtain walls with corner
    # towers, a gatehouse and barbican over a moat, a keep in a large courtyard. Not a building of the town
    # lists (kind 'fortress'): the mission places it. Its piles of cannon balls go; the stone is dressed ashlar.
    "castle": {
        "kind": "fortress",
        "levels": [1],
        "fit_m": 130,
        "turn_deg": 0,
        "budget": 30000,
        "min_part_m": 0.2,
        "drop": r"CannonBall",
        "surfaces": [
            (r"bastion|rampart|basecastle|castleup", "ashlar#bccae6"),
            (r"stairs", "rubble#bdb6aa"),
            (r"rope", "beam#b09a78"),
            (r"bridgecontrol", "beam#8a7258"),
            (r"wooddoor", "boards"),
            (r"metaldoor", "iron#4a4c50"),
            (r"castleground", None),
            (r"envoi|envori", "dirt"),
        ],
    },
}


def surface_of(material_name: str, extra=()) -> str | None:
    low = material_name.lower()
    for pattern, surface in list(extra) + RULES:
        if re.search(pattern, low):
            return surface
    return DEFAULT


def material(name: str):
    return bpy.data.materials.get(name) or bpy.data.materials.new(name)


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:4]
    name, source, out = args
    spec = MODELS[name]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source)
    drop_obj = re.compile(spec["drop"], re.I) if spec.get("drop") else None
    extra = [(re.compile(p, re.I).pattern, surf) for p, surf in spec.get("surfaces", [])]
    # The source's size, to judge which parts are too small to keep.
    lo_all = [math.inf] * 3
    hi_all = [-math.inf] * 3
    for o in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            for i in range(3):
                lo_all[i] = min(lo_all[i], w[i])
                hi_all[i] = max(hi_all[i], w[i])
    anchor = None
    if spec.get("around"):
        pattern = re.compile(spec["around"])
        found = [o for o in bpy.context.scene.objects if o.type == "MESH" and pattern.search(o.name)]
        w = [o.matrix_world @ Vector(c) for o in found for c in o.bound_box]
        a_lo = Vector((min(p.x for p in w), min(p.y for p in w)))
        a_hi = Vector((max(p.x for p in w), max(p.y for p in w)))
        anchor = ((a_lo + a_hi) / 2, max(a_hi.x - a_lo.x, a_hi.y - a_lo.y) * spec.get("around_k", 0.75))
        for o in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
            mid = sum((o.matrix_world @ Vector(c) for c in o.bound_box), Vector()) / 8
            if (mid.xy - anchor[0]).length > anchor[1]:
                bpy.data.objects.remove(o)
        lo_all, hi_all = list(a_lo) + [0], list(a_hi) + [0]
    rough_scale = spec["fit_m"] / max(hi_all[0] - lo_all[0], hi_all[1] - lo_all[1])
    min_part = spec.get("min_part_m", 0.0) / rough_scale
    small = 0

    # Bake every mesh into world space and give its faces their surfaces.
    report = {}
    for o in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
        if drop_obj and drop_obj.search(o.name):
            bpy.data.objects.remove(o)
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.transform(o.matrix_world)
        if min_part > 0:
            xs = [v.co for v in bm.verts]
            span = Vector((max(v.x for v in xs) - min(v.x for v in xs), max(v.y for v in xs) - min(v.y for v in xs), max(v.z for v in xs) - min(v.z for v in xs)))
            if span.length < min_part:
                bm.free()
                bpy.data.objects.remove(o)
                small += 1
                continue
        slots = [s.material.name if s.material else "" for s in o.material_slots] or [""]
        surfaces = [surface_of(n, extra) for n in slots]
        doomed = [f for f in bm.faces if surfaces[min(f.material_index, len(surfaces) - 1)] is None]
        bmesh.ops.delete(bm, geom=doomed, context="FACES")
        if not bm.faces:
            bm.free()
            bpy.data.objects.remove(o)
            continue
        used = sorted({surfaces[min(f.material_index, len(surfaces) - 1)] for f in bm.faces})
        for f in bm.faces:
            f.material_index = used.index(surfaces[min(f.material_index, len(surfaces) - 1)])
        for n, s in zip(slots, surfaces):
            report[n] = s
        mesh = bpy.data.meshes.new(o.name)
        bm.to_mesh(mesh)
        bm.free()
        for s in used:
            mesh.materials.append(material(s))
        clean = bpy.data.objects.new(o.name, mesh)
        bpy.context.scene.collection.objects.link(clean)
        bpy.data.objects.remove(o)
    for o in [o for o in bpy.context.scene.objects if o.type != "MESH"]:
        bpy.data.objects.remove(o)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]

    # Join, merge the source's split vertices, then thin to the budget.
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    if spec.get("plate_m"):
        floor = min(v.co.z for v in bm.verts)
        plate = floor + spec["plate_m"] / rough_scale
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if max(v.co.z for v in f.verts) < plate], context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    # Flat walls and roofs made of many faces become one face each: free triangles, no change to the look.
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1.5), use_dissolve_boundaries=False, verts=bm.verts, edges=bm.edges, delimit={"MATERIAL"})
    bm.to_mesh(body.data)
    bm.free()
    tris_in = sum(len(p.vertices) - 2 for p in body.data.polygons)
    budget = spec.get("budget", BUDGET)
    # `cull_hidden`: faces no ray from outside reaches (a church's piers, vaults and the inner faces of its
    # walls), looked for along 25 directions over each face's either side, go: the strategy camera never sees in.
    if spec.get("cull_hidden") and tris_in > budget:
        hb = bmesh.new()
        hb.from_mesh(body.data)
        bmesh.ops.triangulate(hb, faces=hb.faces)
        tree = BVHTree.FromBMesh(hb)
        reach = (Vector(hi_all) - Vector(lo_all)).length * 2
        rays = [Vector((0, 0, 1))]
        for el in (0.15, 0.6, 1.2):
            for k in range(8):
                a = k * math.pi / 4
                rays.append(Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el))))
        hidden = []
        flipped = 0
        eps = reach * 1e-4
        for f in hb.faces:
            c, n = f.calc_center_median(), f.normal
            seen = [any(tree.ray_cast(c + n * side * eps, d, reach)[0] is None for d in rays if d.dot(n * side) > 0.05) for side in (1, -1)]
            if not any(seen):
                hidden.append(f)
            elif not seen[0]:
                # Seen only from behind: its winding is inside out (the source drew both sides), so the game's
                # one-sided material would light it from within. Turned to face where it is seen from.
                f.normal_flip()
                flipped += 1
        bmesh.ops.delete(hb, geom=hidden, context="FACES")
        hb.to_mesh(body.data)
        hb.free()
        print(f"   {len(hidden)} faces no one sees from outside left out, {flipped} turned outwards")
    # `protect_m2`: vertices of faces larger than this (game square metres) are held by the collapse, which
    # otherwise takes a plain wall of two triangles before the thousand of a finial.
    if spec.get("protect_m2"):
        limit = spec["protect_m2"] / (rough_scale * rough_scale)
        held = set()
        for p in body.data.polygons:
            if p.area > limit:
                held.update(p.vertices)
        free = body.vertex_groups.new(name="free")
        free.add([v.index for v in body.data.vertices if v.index not in held], 1.0, "REPLACE")
    # Thinned again while it is still over (a collapse stops short on the large many-sided faces the dissolve
    # leaves, so those are cut into triangles first once it does).
    for attempt in range(8):
        if attempt >= 1:
            tb = bmesh.new()
            tb.from_mesh(body.data)
            bmesh.ops.triangulate(tb, faces=tb.faces)
            # Edges shared by more than two faces (where merged pieces meet) the collapse will not touch: cut.
            crowded = [e for e in tb.edges if len(e.link_faces) > 2]
            bmesh.ops.split_edges(tb, edges=crowded)
            print(f"   {len(crowded)} edges of three faces or more cut")
            tb.to_mesh(body.data)
            tb.free()
            # The source's texture coordinates and split normals pin the collapse at every seam; the game
            # uses neither (its surfaces are mapped by world position).
            while body.data.uv_layers:
                body.data.uv_layers.remove(body.data.uv_layers[0])
            if body.data.has_custom_normals:
                bpy.context.view_layer.objects.active = body
                bpy.ops.mesh.customdata_custom_splitnormals_clear()
        now = sum(len(p.vertices) - 2 for p in body.data.polygons)
        print(f"   thinning pass {attempt}: {now} triangles")
        if now <= budget * 1.05:
            break
        mod = body.modifiers.new("thin", "DECIMATE")
        mod.ratio = budget / now
        mod.use_collapse_triangulate = True
        if spec.get("protect_m2"):
            mod.vertex_group = "free"
            mod.vertex_group_factor = 10.0
        # The thinned mesh as evaluated, taken over directly (modifier_apply, after the first pass, left
        # the mesh as it was).
        evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
        thinned = bpy.data.meshes.new_from_object(evaluated)
        body.modifiers.remove(mod)
        old_mesh = body.data
        body.data = thinned
        bpy.data.meshes.remove(old_mesh)

    # `flat`: every face shaded flat. Smoothed normals across a heavily thinned mesh's slivers darken and streak
    # it (the surfaces are mapped along the normal), where flat faces read as cut stone.
    if spec.get("flat"):
        for p in body.data.polygons:
            p.use_smooth = False

    # Footprint, ground, turn and size.
    vs = [v.co for v in body.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    scale = spec["fit_m"] / max(hi.x - lo.x, hi.y - lo.y)
    stretch = spec.get("stretch_z", 1.0)
    centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    turn = math.radians(spec.get("turn_deg", 0))
    c, s = math.cos(turn), math.sin(turn)
    for v in body.data.vertices:
        p = (v.co - centre) * scale
        v.co = Vector((p.x * c - p.y * s, p.x * s + p.y * c, p.z * stretch))
    height = (hi.z - lo.z) * scale * stretch
    tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    # Smoke rises from the top of each named surface: the chimney's crown, the hearth's coals.
    smoke = []
    names = [m.name for m in body.data.materials]
    for surface in spec.get("smoke_from", []):
        if surface not in names:
            continue
        slot = names.index(surface)
        pts = [body.data.vertices[i].co for p in body.data.polygons if p.material_index == slot for i in p.vertices]
        top = max(pts, key=lambda v: v.z)
        near = [v for v in pts if v.z > top.z - 0.3 and (v.xy - top.xy).length < 1.5]
        cx = sum(v.x for v in near) / len(near)
        cy = sum(v.y for v in near) / len(near)
        smoke.append((cx, cy, top.z + 0.2))
    index_path = os.path.join(out, "index.json")
    index = json.load(open(index_path)) if os.path.exists(index_path) else {}
    for level in spec["levels"]:
        body.name = f"{spec['kind']}_{level}"
        for o in [o for o in bpy.context.scene.objects if o.type == "EMPTY"]:
            bpy.data.objects.remove(o)
        for i, (x, y, z) in enumerate(smoke):
            empty = bpy.data.objects.new(f"smoke_{i}", None)
            empty.location = (x, y, z)
            bpy.context.scene.collection.objects.link(empty)
        # `one_file`: every level is this same model, so one file serves them all (a large model, downloaded once).
        first = spec["levels"][0]
        file = f"{spec['kind']}_{first if spec.get('one_file') else level}.glb"
        if not spec.get("one_file") or level == first:
            export_glb(os.path.join(out, file))
        index[f"{spec['kind']}:{level}"] = {"file": file, "triangles": tris}
    with open(index_path, "w") as f:
        json.dump(dict(sorted(index.items())), f, indent=1)
    size = [round((hi.x - lo.x) * scale, 1), round((hi.y - lo.y) * scale, 1), round(height, 1)]
    print(f"{name}: {tris_in} -> {tris} triangles, {size} m, levels {spec['levels']} of {spec['kind']}, {small} small parts left out, smoke at {[tuple(round(c, 1) for c in p) for p in smoke]}")
    for n, s in sorted(report.items()):
        print(f"   {n:28s} -> {s}")


main()
