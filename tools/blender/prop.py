"""Turns a static model (a cart, a wagon, an animal standing still) into a small mesh for the game.

    bl/bin/python -I tools/blender/prop.py -- <model.gltf|glb> <out.json> [--length 2.2] [--height 1.0]
        [--turn 90] [--tris 1500] [--source "credit"]

The model is thinned to about --tris triangles, its colours taken from its textures into the vertices,
turned by --turn degrees about the vertical (so that its front looks along the game's -Z), scaled so its
longest horizontal side is --length metres (or its height --height metres) and set on the ground, centred.

Output (JSON), in the game's space (metres, Y up): positions, normals, colours (linear), triangles, and
the size it ended up (x, y, z)."""

import json
import math
import os
import sys

import bpy  # first: it puts bmesh and mathutils on the path
from mathutils import Matrix, Vector  # noqa: E402


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def base_colour_image(mat):
    if not mat or not mat.node_tree:
        return None
    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            links = n.inputs["Base Color"].links
            if links and links[0].from_node.type == "TEX_IMAGE":
                return links[0].from_node.image
    for n in mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image and ("base" in n.image.name.lower() or "diffuse" in n.image.name.lower()):
            return n.image
    return None


def base_colour_value(mat):
    if mat and mat.node_tree:
        for n in mat.node_tree.nodes:
            if n.type == "BSDF_PRINCIPLED":
                return tuple(n.inputs["Base Color"].default_value)[:3]
    return (0.4, 0.3, 0.2)


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1:]
    src, out = args[0], args[1]

    def option(name, default):
        return args[args.index(name) + 1] if name in args else default

    length = option("--length", None)
    height = option("--height", None)
    turn = math.radians(float(option("--turn", "0")))
    target = int(option("--tris", "1500"))
    source = option("--source", "")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if src.endswith(".blend"):
        bpy.ops.wm.open_mainfile(filepath=src, load_ui=False, use_scripts=False)
    else:
        bpy.ops.import_scene.gltf(filepath=src)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name != "Icosphere"]
    total = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    ratio = min(1.0, target / max(1, total))
    for o in meshes:
        d = o.modifiers.new("thin", "DECIMATE")
        d.ratio = ratio
        d.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    cache = {}

    def sample(img, u, v):
        if img.name not in cache:
            cache[img.name] = (img.size[0], img.size[1], list(img.pixels[:]))
        w, h, px = cache[img.name]
        if w == 0 or h == 0:
            return (0.5, 0.5, 0.5)
        x = min(w - 1, max(0, int((u % 1.0) * w)))
        y = min(h - 1, max(0, int((v % 1.0) * h)))
        o = (y * w + x) * 4
        return px[o], px[o + 1], px[o + 2]

    R = Matrix.Rotation(turn, 4, "Z")
    pos, nor, col, tris = [], [], [], []
    for o in meshes:
        me = o.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles()
        world = R @ o.matrix_world
        nworld = world.to_3x3().inverted().transposed()
        mats = list(me.materials)
        uv = me.uv_layers.active.data if me.uv_layers.active else None
        acc = {}
        for t in me.loop_triangles:
            mat = mats[t.material_index] if mats and t.material_index < len(mats) else None
            img = base_colour_image(mat)
            for li, vi in zip(t.loops, t.vertices):
                if img and uv:
                    u, v = uv[li].uv
                    c = sample(img, u, v)
                    flat = False
                else:
                    c = base_colour_value(mat)
                    flat = True
                a = acc.setdefault(vi, [0.0, 0.0, 0.0, 0, flat])
                a[0] += c[0]
                a[1] += c[1]
                a[2] += c[2]
                a[3] += 1
        base = len(pos)
        for v in me.vertices:
            pos.append(world @ v.co)
            nor.append((nworld @ v.normal).normalized())
            a = acc.get(v.index)
            if a and a[3]:
                mean = [a[i] / a[3] for i in range(3)]
                # Texture pixels are stored sRGB; a material's own colour is already linear.
                col.append(mean if a[4] else [srgb_to_linear(x) for x in mean])
            else:
                col.append([0.3, 0.22, 0.15])
        for t in me.loop_triangles:
            tris.append([base + i for i in t.vertices])
        o.evaluated_get(dg).to_mesh_clear()

    # Blender (Z up, looking along -Y) -> game (Y up, looking along -Z): x' = -x, y' = z, z' = y.
    game = [[-p.x, p.z, p.y] for p in pos]
    normals = [[-n.x, n.z, n.y] for n in nor]
    mn = [min(p[i] for p in game) for i in range(3)]
    mx = [max(p[i] for p in game) for i in range(3)]
    if height:
        scale = float(height) / (mx[1] - mn[1])
    else:
        scale = float(length or 1) / max(mx[0] - mn[0], mx[2] - mn[2])
    cx, cz = (mn[0] + mx[0]) / 2, (mn[2] + mx[2]) / 2
    game = [[(p[0] - cx) * scale, (p[1] - mn[1]) * scale, (p[2] - cz) * scale] for p in game]
    size = [round((mx[i] - mn[i]) * scale, 3) for i in range(3)]
    r4 = lambda v: [round(x, 4) for x in v]  # noqa: E731
    data = {
        "source": source,
        "size": size,
        "positions": [x for p in game for x in r4(p)],
        "normals": [x for n in normals for x in r4(n)],
        "colours": [x for c in col for x in r4(c)],
        "triangles": [i for t in tris for i in t],
    }
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"prop: {len(game)} vertices, {len(tris)} triangles, size {size}")


main()
