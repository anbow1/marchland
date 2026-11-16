"""Turns "Rigged Knight in Armor" (Xali, BlendSwap, CC0, see CREDITS.md) into the game's plate-armoured man.

    bl/bin/python -I tools/blender/soldiers.py <Rigged_Knight_in_Armor.blend> public/soldiers/knight.json

The knight is made of rigid plates, each hung on one bone, over a skinned mail suit: exactly what the
game's soldier shader moves (armyView.ts), which turns whole limbs about the hip and the shoulder. So
every vertex is given its limb by the bone it hangs on (or, in the mail, the bone that weighs most), the
arms are brought down from the rest pose's A to hang at the sides, the plates are thinned to a few
thousand triangles, and the figure is scaled to 1.8 m, feet at 0, facing -Z, with its materials as plain
colours, metalness and roughness. Weapons, shields and the side's colours are the game's (soldierGeometry.ts).

Output (JSON): positions, normals, colours (linear RGB), surface (metalness, roughness) per vertex, a
limb per vertex (0 body, 1 left leg, 2 right leg, 3 left arm, 4 right arm), triangles, and the pivots."""

import json
import math
import os
import sys

import bpy  # first: it puts bmesh and mathutils on the path
from mathutils import Vector  # noqa: E402

HEIGHT_M = 1.8
# Triangles the whole figure may keep: a man is a dozen pixels tall from the usual camera height.
TARGET_TRIS = 3200
# Sideways tilt of the hanging arms from straight down (radians): a little out from the body.
ARM_OUT_RAD = math.radians(9)

# Plates too small to matter from above: the finger plates and the second hand plates go.
SKIP = ("index", "middle", "ring", "pinky", "thumb", "hand2", "controller", "Longsword", "Plane")

# Material -> (sRGB colour, metalness, roughness). The plates are bare steel; the mail darker and duller.
MATERIALS = {
    "Stainless_steel": ((0.70, 0.71, 0.73), 1.0, 0.38),
    "Helmet_texture": ((0.70, 0.71, 0.73), 1.0, 0.38),
    "steel": ((0.78, 0.79, 0.80), 1.0, 0.3),
    "steel_2": ((0.6, 0.61, 0.62), 1.0, 0.4),
    "black_metal": ((0.25, 0.25, 0.26), 1.0, 0.45),
    "chainmail": ((0.48, 0.48, 0.49), 0.9, 0.62),
    "Leather": ((0.33, 0.21, 0.12), 0.0, 0.72),
    "leather": ((0.33, 0.21, 0.12), 0.0, 0.72),
    "Black_leather": ((0.14, 0.11, 0.09), 0.0, 0.75),
    "black_leather": ((0.14, 0.11, 0.09), 0.0, 0.75),
}
DEFAULT_MATERIAL = ((0.6, 0.6, 0.6), 0.8, 0.45)


def limb_of(bone: str) -> int:
    """0 body, 1 left leg, 2 right leg, 3 left arm, 4 right arm."""
    side = 1 if bone.startswith("L.") or bone.endswith(".L") else 2 if bone.startswith("R.") or bone.endswith(".R") else 0
    if side == 0:
        return 0
    name = bone.lower()
    if any(k in name for k in ("thigh", "shin", "foot", "toe", "heel", "knee")):
        return side
    if any(k in name for k in ("upperarm", "upper_arm", "lowerarm", "forearm", "hand", "elbow", "thumb", "index", "middle", "ring", "pinky")):
        return side + 2
    return 0


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def main() -> None:
    src, out = sys.argv[-2], sys.argv[-1]
    bpy.ops.wm.open_mainfile(filepath=src, load_ui=False, use_scripts=False)
    rig = bpy.data.objects["Knight_rig"]
    rig.data.pose_position = "REST"
    meshes = []
    for o in bpy.context.scene.objects:
        root = o
        while root.parent:
            root = root.parent
        if o.type != "MESH" or root != rig or any(k in o.name for k in SKIP):
            continue
        # The mail's hair (a particle system) is not geometry the game can use.
        for m in list(o.modifiers):
            if m.type == "PARTICLE_SYSTEM":
                o.modifiers.remove(m)
        meshes.append(o)
    total = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    ratio = min(1.0, TARGET_TRIS / max(1, total))
    for o in meshes:
        d = o.modifiers.new("thin", "DECIMATE")
        d.ratio = ratio
        d.use_collapse_triangulate = True
    depsgraph = bpy.context.evaluated_depsgraph_get()
    deform = {b.name for b in rig.data.bones}

    positions, normals, colours, surface, limbs, triangles = [], [], [], [], [], []
    for o in meshes:
        ev = o.evaluated_get(depsgraph)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        world = o.matrix_world
        normal_world = world.to_3x3().inverted().transposed()
        # The limb of each vertex: the bone the plate hangs on, else the heaviest bone in its weights.
        fixed = limb_of(o.parent_bone) if o.parent_type == "BONE" and o.parent_bone else None
        group_names = {g.index: g.name for g in o.vertex_groups}
        vertex_limb = []
        for v in me.vertices:
            if fixed is not None:
                vertex_limb.append(fixed)
                continue
            best, best_w = 0, 0.0
            for g in v.groups:
                name = group_names.get(g.group, "")
                if name in deform and g.weight > best_w:
                    best, best_w = limb_of(name), g.weight
            vertex_limb.append(best)
        base = len(positions)
        for v in me.vertices:
            positions.append(world @ v.co)
            normals.append((normal_world @ v.normal).normalized())
            limbs.append(vertex_limb[v.index])
        # A vertex's colour from the first face that uses it (plates are one material each, or nearly).
        colour_of = {}
        for tri in me.loop_triangles:
            mat = me.materials[tri.material_index] if tri.material_index < len(me.materials) else None
            spec = MATERIALS.get(mat.name if mat else "", DEFAULT_MATERIAL)
            for vi in tri.vertices:
                colour_of.setdefault(vi, spec)
            triangles.append([base + i for i in tri.vertices])
        for v in me.vertices:
            rgb, metal, rough = colour_of.get(v.index, DEFAULT_MATERIAL)
            colours.append(tuple(srgb_to_linear(c) for c in rgb))
            surface.append((metal, rough))
        ev.to_mesh_clear()

    # Blender: Z up, the knight looks along -Y, his left at +X. Game: Y up, looking along -Z, his left at -X.
    lo = Vector((min(p.x for p in positions), min(p.y for p in positions), min(p.z for p in positions)))
    hi = Vector((max(p.x for p in positions), max(p.y for p in positions), max(p.z for p in positions)))
    scale = HEIGHT_M / (hi.z - lo.z)
    cx = (lo.x + hi.x) / 2
    cy = (lo.y + hi.y) / 2

    def to_game(p: Vector) -> list[float]:
        return [-(p.x - cx) * scale, (p.z - lo.z) * scale, (p.y - cy) * scale]

    def dir_to_game(n: Vector) -> list[float]:
        return [-n.x, n.z, n.y]

    pos = [to_game(p) for p in positions]
    nor = [dir_to_game(n) for n in normals]
    bones = {b.name: b for b in rig.data.bones}
    joint = lambda name: to_game(rig.matrix_world @ bones[name].head_local)  # noqa: E731
    hip_l, hip_r = joint("L.thigh"), joint("R.thigh")
    sh_l, sh_r = joint("L.upperarm"), joint("R.upperarm")
    hand_l, hand_r = joint("L.hand"), joint("R.hand")
    # Bring each arm down: turn it about the front-back axis through the shoulder until the hand hangs
    # under it, a little out from the body.
    for limb, shoulder, hand, sign in ((3, sh_l, hand_l, -1), (4, sh_r, hand_r, 1)):
        ax, ay = hand[0] - shoulder[0], hand[1] - shoulder[1]
        now = math.atan2(ax, -ay)  # 0 when the hand hangs straight down
        turn = sign * ARM_OUT_RAD - now
        c, s = math.cos(turn), math.sin(turn)
        for i, l in enumerate(limbs):
            if l != limb:
                continue
            x, y = pos[i][0] - shoulder[0], pos[i][1] - shoulder[1]
            pos[i][0] = shoulder[0] + x * c - y * s
            pos[i][1] = shoulder[1] + x * s + y * c
            nx, ny = nor[i][0], nor[i][1]
            nor[i][0] = nx * c - ny * s
            nor[i][1] = nx * s + ny * c
    pivots = {
        "hipY": (hip_l[1] + hip_r[1]) / 2,
        "hipZ": (hip_l[2] + hip_r[2]) / 2,
        "shoulderY": (sh_l[1] + sh_r[1]) / 2,
        "shoulderZ": (sh_l[2] + sh_r[2]) / 2,
        "shoulderX": abs(sh_r[0] - sh_l[0]) / 2,
    }
    r3 = lambda v: [round(x, 4) for x in v]  # noqa: E731
    data = {
        "source": "Rigged Knight in Armor, Xali (BlendSwap), CC0",
        "pivots": {k: round(v, 4) for k, v in pivots.items()},
        "positions": [x for p in pos for x in r3(p)],
        "normals": [x for n in nor for x in r3(n)],
        "colours": [x for c in colours for x in r3(c)],
        "surface": [x for s_ in surface for x in r3(s_)],
        "limbs": limbs,
        "triangles": [i for t in triangles for i in t],
    }
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"knight: {len(pos)} vertices, {len(triangles)} triangles (thinned x{ratio:.3f}), pivots {data['pivots']}")


main()
