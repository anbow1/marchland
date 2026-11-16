"""Bakes a rigged character with its own animation (any skeleton, no retargeting) for the game.

    bl/bin/python -I tools/blender/baked.py -- <model.glb> <out.json> [--height 1.75] [--fps 12]
        [--from 12] [--to 396] [--bones 40] [--name work] [--source "credit"]

The character is thinned to about 3 000 triangles, coloured from its textures, scaled to --height and set
with its feet on the ground at the origin. Its animation is sampled at --fps between frames --from and
--to and kept as it moves (root motion and all: a man who walks about his workshop walks about it in the
game too). Bones that carry little weight (fingers, toes, twist bones) fold into their nearest kept
ancestor, so at most --bones remain. Rigid parts with no weights (hair cards) ride on the head.

The mesh is taken as Blender deforms it at the first sampled frame, and every frame's matrices carry the
bones from there (not from the bind pose: some exports scale the bind pose apart from the skeleton). The
first frame should be close to the rest pose, so that blended vertices follow their bones faithfully.

Output (JSON) as tools/blender/rigged.py writes it: bones, clips (one), frames (per frame per bone a 3x4
skinning matrix, rows), positions, normals, colours (linear), surface, skin, weights, triangles."""

import json
import os
import sys

import bpy  # first: it puts bmesh and mathutils on the path
from mathutils import Matrix  # noqa: E402

TARGET_TRIS = 3000
# Blender (Z up, looking along -Y) -> game (Y up, looking along -Z): x' = -x, y' = z, z' = y.
P = Matrix(((-1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def colour_image(mat):
    if not mat or not mat.node_tree:
        return None
    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            links = n.inputs["Base Color"].links
            if links and links[0].from_node.type == "TEX_IMAGE":
                return links[0].from_node.image
    return None


def colour_value(mat):
    """A material's own base colour (linear), for parts with no texture (hair, eyes)."""
    if mat and mat.node_tree:
        for n in mat.node_tree.nodes:
            if n.type == "BSDF_PRINCIPLED":
                return list(n.inputs["Base Color"].default_value)[:3]
    return [0.35, 0.28, 0.22]


# Parts thinned less than the rest: the skin (the face is on it) and the eyes.
SPARE = ("body", "skin", "head", "face", "eye")


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1:]
    src, out = args[0], args[1]

    def option(name, default):
        return args[args.index(name) + 1] if name in args else default

    height = float(option("--height", "1.75"))
    fps = float(option("--fps", "12"))
    max_bones = int(option("--bones", "40"))
    clip_name = option("--name", "work")
    source = option("--source", "")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    arm = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"][0]
    action = arm.animation_data.action
    first = int(option("--from", str(int(action.frame_range[0]))))
    last = int(option("--to", str(int(action.frame_range[1]))))
    scene_fps = bpy.context.scene.render.fps / bpy.context.scene.render.fps_base
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name != "Icosphere"]
    total = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    def spared(o):
        return any(k in (m.name.lower() if m else "") for m in o.data.materials for k in SPARE)

    spare_tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes if spared(o))
    # The skin and eyes keep up to half their triangles; the rest share what is left of the budget.
    spare_ratio = min(1.0, 0.5, TARGET_TRIS * 0.4 / max(1, spare_tris))
    ratio = min(1.0, (TARGET_TRIS - spare_tris * spare_ratio) / max(1, total - spare_tris))
    for o in meshes:
        d = o.modifiers.new("thin", "DECIMATE")
        d.ratio = spare_ratio if spared(o) else ratio
        d.use_collapse_triangulate = True
        o.modifiers.move(o.modifiers.find(d.name), 0)

    # The bones: total weight each carries; the light ones fold into their nearest kept ancestor.
    bones = arm.data.bones
    weight = {b.name: 0.0 for b in bones}
    for o in meshes:
        names = {g.index: g.name for g in o.vertex_groups}
        for v in o.data.vertices:
            for g in v.groups:
                n = names.get(g.group)
                if n in weight:
                    weight[n] += g.weight
    head = next(b.name for b in bones if "head" in b.name.lower() and weight[b.name] > 0)
    ranked = sorted((n for n in weight if weight[n] > 0), key=lambda n: -weight[n])
    kept = set(ranked[:max_bones]) | {head}

    def keeper(name):
        b = bones.get(name)
        while b is not None and b.name not in kept:
            b = b.parent
        return b.name if b is not None else ranked[0]

    order = [b.name for b in bones if b.name in kept]

    # The reference pose (the first sampled frame): positions, normals, colours and folded weights.
    bpy.context.scene.frame_set(first)
    bpy.context.view_layer.update()
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

    world_pos, nor, col, skin, wts, tris = [], [], [], [], [], []
    for o in meshes:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        img = colour_image(me.materials[0] if me.materials else None)
        plain = colour_value(me.materials[0] if me.materials else None)
        uv = me.uv_layers.active.data if me.uv_layers.active else None
        acc = {}
        if img and uv:
            for loop in me.loops:
                c = sample(img, *uv[loop.index].uv)
                a = acc.setdefault(loop.vertex_index, [0.0, 0.0, 0.0, 0])
                a[0] += c[0]
                a[1] += c[1]
                a[2] += c[2]
                a[3] += 1
        names = {g.index: g.name for g in o.vertex_groups}
        nworld = o.matrix_world.to_3x3().inverted().transposed()
        base = len(world_pos)
        for v in me.vertices:
            world_pos.append(o.matrix_world @ v.co)
            nor.append((nworld @ v.normal).normalized())
            a = acc.get(v.index)
            col.append([srgb_to_linear(a[i] / a[3]) for i in range(3)] if a else plain)
            folded = {}
            for g in v.groups:
                n = names.get(g.group)
                if n in weight and g.weight > 0:
                    k = keeper(n)
                    folded[k] = folded.get(k, 0.0) + g.weight
            if not folded:
                folded = {head: 1.0}
            top = sorted(folded.items(), key=lambda kv: -kv[1])[:4]
            s = sum(w for _, w in top) or 1.0
            skin.append([order.index(k) for k, _ in top] + [0] * (4 - len(top)))
            wts.append([w / s for _, w in top] + [0.0] * (4 - len(top)))
        for t in me.loop_triangles:
            tris.append([base + i for i in t.vertices])
        ev.to_mesh_clear()

    # Scale to height, feet on the ground; the frames carry the same transform (T) on both sides.
    floor = min(p.z for p in world_pos)
    top = max(p.z for p in world_pos)
    scale = height / (top - floor)
    T = P @ Matrix.Scale(scale, 4) @ Matrix.Translation((0, 0, -floor))
    Ti = T.inverted()
    pos = [list((T @ p.to_4d()).xyz) for p in world_pos]
    normals = [[-n.x, n.z, n.y] for n in nor]

    W = arm.matrix_world
    bpy.context.scene.frame_set(first)
    rest_inv = {n: (W @ arm.pose.bones[n].matrix).inverted() for n in order}
    flat = []
    step = scene_fps / fps
    frames = 0
    f = float(first)
    while f <= last + 1e-6:
        bpy.context.scene.frame_set(int(f), subframe=f - int(f))
        for n in order:
            m = T @ (W @ arm.pose.bones[n].matrix) @ rest_inv[n] @ Ti
            flat += [round(m[r][c], 4) for r in range(3) for c in range(4)]
        frames += 1
        f += step
    r4 = lambda v: [round(x, 4) for x in v]  # noqa: E731
    data = {
        "source": source,
        "bones": order,
        "clips": [{"name": clip_name, "start": 0, "frames": frames, "fps": fps}],
        "frames": flat,
        "positions": [x for p in pos for x in r4(p)],
        "normals": [x for n in normals for x in r4(n)],
        "colours": [x for c in col for x in r4(c)],
        "surface": [x for _ in pos for x in (0.0, 0.8, 0.0)],
        "skin": [i for s in skin for i in s],
        "weights": [x for w in wts for x in r4(w)],
        "triangles": [i for t in tris for i in t],
    }
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w") as fh:
        json.dump(data, fh, separators=(",", ":"))
    print(f"baked: {len(pos)} vertices, {len(tris)} triangles, {len(order)} bones, {frames} frames at {fps} fps")


main()
