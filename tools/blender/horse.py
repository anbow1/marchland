"""Turns "Armored Horse" (naminoff, Sketchfab, CC BY 4.0, see CREDITS.md) into the game's horse.

    bl/bin/python -I tools/blender/horse.py <armored_horse.glb> public/soldiers/horse.json

The horse has no rig. Like the horses made from boxes (soldierGeometry.ts) its legs turn as wholes about
the shoulder and the hip, in diagonal pairs: each vertex below the belly goes to the leg of its quarter
(left or right, fore or hind), and gets that leg's joint as its pivot and the pair's sign as its swing.
Thinned to a few thousand triangles, colours from its textures, 1.6 m at the withers, feet at 0, looking
along -Z. The saddle's height and place are written out for the rider.

Output (JSON): positions, normals, colours (linear), surface (metalness, roughness, team share), parts
(pivot height, pivot depth, walk swing) per vertex, triangles, and the saddle."""

import json
import os
import sys

import bpy  # first: it puts bmesh and mathutils on the path
from mathutils import Vector  # noqa: E402

WITHERS_M = 1.6
TARGET_TRIS = 3600


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def base_colour_image(mat):
    """The image wired into the material's base colour, if any."""
    if not mat or not mat.node_tree:
        return None
    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            links = n.inputs["Base Color"].links
            if links and links[0].from_node.type == "TEX_IMAGE":
                return links[0].from_node.image
    return None


def main() -> None:
    src, out = sys.argv[-2], sys.argv[-1]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    total = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    ratio = min(1.0, TARGET_TRIS / max(1, total))
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
        x = min(w - 1, max(0, int((u % 1.0) * w)))
        y = min(h - 1, max(0, int((v % 1.0) * h)))
        o = (y * w + x) * 4
        return px[o], px[o + 1], px[o + 2]

    pos, nor, col, tris = [], [], [], []
    for o in meshes:
        me = o.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles()
        world = o.matrix_world
        nworld = world.to_3x3().inverted().transposed()
        img = base_colour_image(me.materials[0] if me.materials else None)
        uv = me.uv_layers.active.data if me.uv_layers.active else None
        acc = {}
        if img and uv:
            for loop in me.loops:
                u, v = uv[loop.index].uv
                c = sample(img, u, v)
                a = acc.setdefault(loop.vertex_index, [0.0, 0.0, 0.0, 0])
                a[0] += c[0]
                a[1] += c[1]
                a[2] += c[2]
                a[3] += 1
        base = len(pos)
        for v in me.vertices:
            pos.append(world @ v.co)
            nor.append((nworld @ v.normal).normalized())
            a = acc.get(v.index)
            col.append([srgb_to_linear(a[i] / a[3]) for i in range(3)] if a else [0.3, 0.2, 0.15])
        for t in me.loop_triangles:
            tris.append([base + i for i in t.vertices])

    # Feet at 0, withers (the back over the middle) at WITHERS_M; the head is at -Y, which becomes -Z.
    floor = min(p.z for p in pos)
    mid = [p for p in pos if abs(p.y) < 0.15]
    scale = WITHERS_M / (max(p.z for p in mid) - floor)
    game = [[-p.x * scale, (p.z - floor) * scale, p.y * scale] for p in pos]
    normals = [[-n.x, n.z, n.y] for n in nor]
    # The legs: below the belly, by quarter. The belly is where the body's underside is over the middle.
    belly = WITHERS_M * 0.52
    # Legs stand off the middle line; the tail hangs on it.
    leg = lambda p: p[1] < belly and abs(p[0]) > 0.07  # noqa: E731
    front_z = [p[2] for p in game if leg(p) and p[1] < belly * 0.6 and p[2] < 0]
    back_z = [p[2] for p in game if leg(p) and p[1] < belly * 0.6 and p[2] > 0]
    fz = sum(front_z) / max(1, len(front_z))
    bz = sum(back_z) / max(1, len(back_z))
    parts = []
    surface = []
    for p in game:
        if leg(p):
            dx = -1 if p[0] < 0 else 1
            fore = p[2] < (fz + bz) / 2
            dz = -1 if fore else 1
            parts.append([round(belly + 0.08, 4), round(fz if fore else bz, 4), dx * dz])
        else:
            parts.append([0, 0, 0])
        surface.append([0.0, 0.75, 0.0])
    # The saddle: the top of the back a little behind the withers.
    seat = [p for p in game if abs(p[0]) < 0.12 and -0.05 < p[2] < 0.35]
    saddle_y = max(p[1] for p in seat) if seat else WITHERS_M
    top = sorted(seat, key=lambda p: -p[1])[: max(1, len(seat) // 20)]
    seat_z = sum(p[2] for p in top) / len(top)
    r4 = lambda v: [round(x, 4) for x in v]  # noqa: E731
    data = {
        "source": "Armored Horse, naminoff (Sketchfab), CC BY 4.0",
        "saddle": {"y": round(saddle_y - 0.1, 4), "z": round(seat_z, 4)},
        "positions": [x for p in game for x in r4(p)],
        "normals": [x for n in normals for x in r4(n)],
        "colours": [x for c in col for x in r4(c)],
        "surface": [x for s in surface for x in s],
        "parts": [x for p in parts for x in p],
        "triangles": [i for t in tris for i in t],
    }
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"horse: {len(game)} vertices, {len(tris)} triangles, saddle at {saddle_y:.2f} m, legs fore {fz:.2f} hind {bz:.2f}")


main()
