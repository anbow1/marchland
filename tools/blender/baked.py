"""Bakes a rigged character with its own animation (any skeleton, no retargeting) for the game.

    bl/bin/python -I tools/blender/baked.py -- <model.glb> <out.json> [--height 1.75] [--fps 12]
        [--from 12] [--to 396] [--bones 40] [--name work] [--source "credit"]
        [--clips walk:74:107,gallop:0:16] [--saddle Spine2_04] [--centre]

The character is thinned to about 3 000 triangles, coloured from its textures, scaled to --height and set
with its feet on the ground at the origin. Its animation is sampled at --fps between frames --from and
--to and kept as it moves (root motion and all: a man who walks about his workshop walks about it in the
game too). Bones that carry little weight (fingers, toes, twist bones) fold into their nearest kept
ancestor, so at most --bones remain. Rigid parts with no weights (hair cards) ride on the head.

With --clips the take is cut into several clips instead (name:from:to, frames from up to but not including
`to`, so a loop's last frame is not its first again); the mesh is then taken at --from (default: the first
clip's start). With --centre the body is set centred over the origin (an animal: its middle where the unit
stands), not where the take had it. With --saddle the output also says where on that bone's back a rider sits: the top of the
body above the bone's head ({bone, x, y, z}, game space, reference pose). Each clip says how much ground one
loop of it covers (`travelM`): how fast the feet planted on the ground slide back, an animal galloping on the
spot.

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
    """The image behind a material's base colour, also through mix nodes (a texture times a vertex colour)."""
    if not mat or not mat.node_tree:
        return None

    def upstream(node, depth=0):
        if node.type == "TEX_IMAGE":
            return node.image
        if depth > 4:
            return None
        for i in node.inputs:
            for link in i.links:
                found = upstream(link.from_node, depth + 1)
                if found:
                    return found
        return None

    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            links = n.inputs["Base Color"].links
            if links:
                return upstream(links[0].from_node)
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
    cuts = [(c.split(":")[0], int(c.split(":")[1]), int(c.split(":")[2])) for c in option("--clips", "").split(",") if c]
    first = int(option("--from", str(cuts[0][1] if cuts else int(action.frame_range[0]))))
    last = int(option("--to", str(int(action.frame_range[1]))))
    if not cuts:
        cuts = [(clip_name, first, last + 1)]
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
        return px[o], px[o + 1], px[o + 2], px[o + 3]

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
                if c[3] < 0.5:
                    continue  # a see-through texel (between a hair card's strands): no colour of its own
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
    cx = (min(p.x for p in world_pos) + max(p.x for p in world_pos)) / 2 if "--centre" in args else 0.0
    cy = (min(p.y for p in world_pos) + max(p.y for p in world_pos)) / 2 if "--centre" in args else 0.0
    T = P @ Matrix.Scale(scale, 4) @ Matrix.Translation((-cx, -cy, -floor))
    Ti = T.inverted()
    pos = [list((T @ p.to_4d()).xyz) for p in world_pos]
    normals = [[-n.x, n.z, n.y] for n in nor]

    W = arm.matrix_world
    bpy.context.scene.frame_set(first)
    rest_inv = {n: (W @ arm.pose.bones[n].matrix).inverted() for n in order}
    flat = []
    step = scene_fps / fps
    frames = 0
    clips = []
    for name, start, end in cuts:
        clip_start = frames
        f = float(start)
        while f < end - 1e-6:
            bpy.context.scene.frame_set(int(f), subframe=f - int(f))
            for n in order:
                m = T @ (W @ arm.pose.bones[n].matrix) @ rest_inv[n] @ Ti
                flat += [round(m[r][c], 4) for r in range(3) for c in range(4)]
            frames += 1
            f += step
        clips.append({"name": name, "start": clip_start, "frames": frames - clip_start, "fps": fps})
    # Ground covered per loop: the median backward slide of vertices on the ground in two frames running.
    nb = len(order)
    low = [i for i, p in enumerate(pos) if p[1] < 0.06][::3]

    def at(i, fr):
        x, y, z = pos[i]
        out = [0.0, 0.0, 0.0]
        for b, w in zip(skin[i], wts[i]):
            if w == 0:
                continue
            m = flat[(fr * nb + b) * 12:(fr * nb + b) * 12 + 12]
            for r in range(3):
                out[r] += w * (m[r * 4] * x + m[r * 4 + 1] * y + m[r * 4 + 2] * z + m[r * 4 + 3])
        return out

    for c in clips:
        slides = []
        for fr in range(c["start"], c["start"] + c["frames"] - 1):
            for i in low:
                a, b = at(i, fr), at(i, fr + 1)
                if a[1] < 0.05 and b[1] < 0.05 and b[2] - a[2] > 0.005:
                    slides.append(b[2] - a[2])
        slides.sort()
        c["travelM"] = round(slides[len(slides) // 2] * c["frames"], 3) if len(slides) > c["frames"] else 0.0
    saddle = None
    if "--saddle" in args:
        bpy.context.scene.frame_set(first)
        bone = option("--saddle", "")
        head = list((T @ (W @ arm.pose.bones[bone].head).to_4d()).xyz)
        over = [p for p in pos if abs(p[0]) < 0.12 and abs(p[2] - head[2]) < 0.12]
        top = max(p[1] for p in over) if over else head[1]
        saddle = {"bone": order.index(keeper(bone)), "x": 0.0, "y": round(top, 4), "z": round(head[2], 4)}
    r4 = lambda v: [round(x, 4) for x in v]  # noqa: E731
    data = {
        "source": source,
        "bones": order,
        "clips": clips,
        "frames": flat,
        "positions": [x for p in pos for x in r4(p)],
        "normals": [x for n in normals for x in r4(n)],
        "colours": [x for c in col for x in r4(c)],
        "surface": [x for _ in pos for x in (0.0, 0.8, 0.0)],
        "skin": [i for s in skin for i in s],
        "weights": [x for w in wts for x in r4(w)],
        "triangles": [i for t in tris for i in t],
    }
    if saddle:
        data["saddle"] = saddle
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w") as fh:
        json.dump(data, fh, separators=(",", ":"))
    print(f"baked: {len(pos)} vertices, {len(tris)} triangles, {len(order)} bones, {frames} frames at {fps} fps; clips {[(c['name'], c['frames']) for c in clips]}; saddle {saddle}")


main()
