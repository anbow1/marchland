"""Bakes a Mixamo-rigged character and Mixamo animations into the game's skinned soldier.

    bl/bin/python -I tools/blender/rigged.py -- <character.gltf> <out.json> [--arms sword|halberd|pike|bow]
        [--height 1.8] [--source "credit"] [--team <image name part>] [--team-share 0.6] [--tris 3400] [--step 1]
        [--tool-clips name,name] [--tool2-clips name,name] [--team-below 0.12]
        <clip.fbx>...
    bl/bin/python -I tools/blender/rigged.py -- <character.fbx> <rider.json> --seated --arms none [--height 1.8] [--tris 3200]
        [--gain 2.5]

--seated: no clips, one pose: the character in the saddle (thighs forward and apart, shins down, the arms down
to the lance and the reins), written as the game's rider body (limbs and pivots, soldierGeometry.ts BodyModel). --gain: its colours brightened
(a blackened plate that would read as a silhouette from the camera).

--arms: what the man carries (the game's own simple shapes; "none" for nothing): sword and shield (the default), a halberd or
a pike in the sword hand (a shaft along the sword's line, more of it ahead of the hand than behind), or a
longbow upright in the left fist. --height: the character is scaled to stand this tall (metres), whatever
units it came in. --tool-clips: the weapon (a tool: --arms axe) shows only in these clips; in the others its
joint is collapsed to nothing, so a townsman carries his axe only while he chops. --arms tools: the axe
(first joint, --tool-clips) and a mallet (second joint, held in the same hand, --tool2-clips). --source: the credit
written into the file. --team: the garment (by its texture's name)
dyed in the side's colour, over its own shading; with --team-below only its texels darker than that (linear
luminance), so dark clothes take the colour and the skin on the same texture keeps its own.

Any Mixamo-rigged character will do (glTF, or an FBX from Mixamo with its skin), or one on Unreal's skeleton
(pelvis, spine_01, clavicle_l, thigh_l...: read as the same bones in Mixamo's names): it is turned to look the clips' way from where its hips put its
left, and its end bones (HeadTop_End, Toe_End) may be missing or lie at the origin. Rigid parts with no
weights (a helmet, a hat, hair) ride on the head; other unweighted parts (its own sword, shield) are left
out, and so are meshes bound only to weapon joints (a Mixamo character's own sword and shield, whatever their
mesh is called). With no metal map, a specular map (a Mixamo character's) is read as how much metal shows.

The character ("knight for game project (old)", Thomas.Osterhammel, Sketchfab, CC BY 4.0, see
CREDITS.md) stands in an A pose and looks along -X; the clips (Mixamo, without skin) were made on a
T-posed man looking along -Y. Each clip is moved onto the character bone by bone: a bone takes the
clip's turn of the same bone since its rest, after its own rest direction has been turned onto the
clip's (so the A pose does not carry over into the swing), and sits where its parent's posed frame puts
it; only the hips move by themselves, scaled to the character's height and kept on the spot. The sword and
the shield are the game's own simple shapes, hung on the clips' weapon joints as the clips' paladin held
them (measured, not copied).

Output (JSON), all in the game's space (metres, Y up, the man looking along -Z, his left at -X):
  bones: names; clips: name, first frame, frames, fps; frames: per frame per bone a 3x4 skinning matrix
  (rows), from the bind pose to the pose; and the mesh: positions, normals, colours (linear, from the
  texture), surface (metalness, roughness, team share), four bones and weights per vertex, triangles."""

import json
import math
import os
import re
import sys

import bpy  # first: it puts bmesh and mathutils on the path
from mathutils import Matrix, Quaternion, Vector  # noqa: E402

TARGET_TRIS = 3400
# The bones the game keeps (fingers fold into the hand, ends into their bone), with the child that gives each its direction.
KEEP = {
    "Hips": "Spine", "Spine": "Spine1", "Spine1": "Spine2", "Spine2": "Neck", "Neck": "Head", "Head": "HeadTop_End",
    "LeftShoulder": "LeftArm", "LeftArm": "LeftForeArm", "LeftForeArm": "LeftHand", "LeftHand": "LeftHandMiddle1",
    "RightShoulder": "RightArm", "RightArm": "RightForeArm", "RightForeArm": "RightHand", "RightHand": "RightHandMiddle1",
    "LeftUpLeg": "LeftLeg", "LeftLeg": "LeftFoot", "LeftFoot": "LeftToeBase", "LeftToeBase": "LeftToe_End",
    "RightUpLeg": "RightLeg", "RightLeg": "RightFoot", "RightFoot": "RightToeBase", "RightToeBase": "RightToe_End",
}
ORDER = list(KEEP)
# The weapons: the clip's joint, and the character's bone they are carried from.
WEAPONS = {"Sword_joint": "RightHand", "Shield_joint": "LeftForeArm"}
BONES = ORDER + list(WEAPONS)


# Unreal's skeleton (as Unreal-ready characters come) in Mixamo's names: the same bones, other words.
UNREAL = {
    "pelvis": "Hips", "spine_01": "Spine", "spine_02": "Spine1", "spine_03": "Spine2", "neck_01": "Neck", "head": "Head",
    "clavicle_l": "LeftShoulder", "upperarm_l": "LeftArm", "lowerarm_l": "LeftForeArm", "hand_l": "LeftHand",
    "clavicle_r": "RightShoulder", "upperarm_r": "RightArm", "lowerarm_r": "RightForeArm", "hand_r": "RightHand",
    "thigh_l": "LeftUpLeg", "calf_l": "LeftLeg", "foot_l": "LeftFoot", "ball_l": "LeftToeBase",
    "thigh_r": "RightUpLeg", "calf_r": "RightLeg", "foot_r": "RightFoot", "ball_r": "RightToeBase",
}
FINGERS = {"index": "Index", "middle": "Middle", "pinky": "Pinky", "ring": "Ring", "thumb": "Thumb"}


def plain(name: str) -> str:
    """'mixamorig:LeftHandIndex1_07' -> 'LeftHandIndex1'; Unreal's 'thigh_l_045' -> 'LeftUpLeg'."""
    name = name.split(":")[-1]
    name = re.sub(r"_\d+$", "", name)
    if name in UNREAL:
        return UNREAL[name]
    m = re.fullmatch(r"(index|middle|pinky|ring|thumb)_0(\d)_([lr])", name)
    if m:
        return ("Left" if m.group(3) == "l" else "Right") + "Hand" + FINGERS[m.group(1)] + m.group(2)
    return name


def kept(name: str) -> str:
    """The kept bone a vertex group of this name folds into."""
    n = plain(name)
    if n in KEEP:
        return n
    for side in ("Left", "Right"):
        if n.startswith(side + "Hand"):
            return side + "Hand"
        if n.startswith(side + "Toe"):
            return side + "ToeBase"
    if n.startswith("HeadTop") or "Eye" in n:
        return "Head"
    return "Hips"


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


# Blender (Z up, looking along -Y) -> game (Y up, looking along -Z, left at -X): x' = -x, y' = z, z' = y.
P = Matrix(((-1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def to_game_point(v: Vector) -> list[float]:
    return [-v.x, v.z, v.y]


ON_HEAD = ("helmet", "hat", "hood", "hair", "cap")


# Meshes left out: bound so that at rest they lie far outside the skeleton (a beard exported with a bind of
# its own), by name; set by load_character.
STRAY = set()


def body_meshes():
    """The character's own meshes: the weighted ones, and rigid ones worn on the head."""
    out = []
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or o.name == "Icosphere" or o.name in STRAY:
            continue
        groups = [plain(g.name) for g in o.vertex_groups]
        if groups and all(g.endswith("_joint") for g in groups):
            continue  # its own weapon or shield, bound to a weapon joint (a Mixamo character's, whatever the mesh is called)
        if groups or any(k in o.name.lower() for k in ON_HEAD):
            out.append(o)
    return out


def load_character(path: str, height_m: float):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if path.lower().endswith(".fbx"):
        # A character from Mixamo itself (skinned, downloaded with a clip): its bind pose is its rest.
        bpy.ops.import_scene.fbx(filepath=path)
    else:
        bpy.ops.import_scene.gltf(filepath=path)
    rig = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"][0]
    # Stand him up: some exports lie the whole rig down (Unreal's Y up under a parent); his hips-to-head line
    # goes up, along +Z.
    heads = {}
    for b in rig.data.bones:
        heads.setdefault(plain(b.name), rig.matrix_world @ b.head_local)
    up = (heads["Head"] - heads["Hips"]).normalized()
    R = up.rotation_difference(Vector((0, 0, 1))).to_matrix().to_4x4()
    bones = {}
    for b in rig.data.bones:
        bones.setdefault(plain(b.name), R @ rig.matrix_world @ b.matrix_local)
    # Leave out a mesh that at rest lies far outside the skeleton's reach.
    pts = [R @ h for h in heads.values()]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    reach = max(hi - lo)
    STRAY.clear()
    for o in body_meshes():
        ws = [R @ o.matrix_world @ v.co for v in o.data.vertices]
        if any(min(w[i] for w in ws) < lo[i] - 0.5 * reach or max(w[i] for w in ws) > hi[i] + 0.5 * reach for i in range(3)):
            STRAY.add(o.name)
    if STRAY:
        print(f"character: left out {sorted(STRAY)} (bound far outside the skeleton)")
    # Turn the character to look along -Y like the clips: his left (from the right hip to the left) to +X.
    left = head_of(bones["LeftUpLeg"]) - head_of(bones["RightUpLeg"])
    turn = Matrix.Rotation(-math.atan2(left.y, left.x), 4, "Z")
    # And scale him to stand height_m tall (his meshes' height in the bind pose, whatever the units).
    rig.data.pose_position = "REST"
    bpy.context.view_layer.update()
    zs = [(R @ o.matrix_world @ v.co).z for o in body_meshes() for v in o.data.vertices]
    scale = height_m / (max(zs) - min(zs))
    G = Matrix.Scale(scale, 4) @ turn @ R
    # (the bones are already stood up)
    rest = {n: Matrix.Scale(scale, 4) @ turn @ m for n, m in bones.items() if n in KEEP or n in KEEP.values()}
    # End bones missing or at the origin: one bone-length on along the parent's line.
    for n, child in KEEP.items():
        if child in KEEP:
            continue
        if child not in rest or head_of(rest[child]).length < 1e-3 * scale:
            parent = next(p for p, c in KEEP.items() if c == n)
            step = head_of(rest[n]) - head_of(rest[parent])
            rest[child] = Matrix.Translation(head_of(rest[n]) + step * 0.6)
    print(f"character: scale {scale:.4f}, turned {math.degrees(-math.atan2(left.y, left.x)):.0f} deg")
    return rig, G, rest


TEAM_SHARE = 0.6


TEAM_BELOW = None


def bake_mesh(rig, G, team_garment=None):
    """The character's meshes in the bind pose, thinned, with colours from the texture and the kept bones' weights."""
    rig.data.pose_position = "REST"
    meshes = body_meshes()
    total = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    ratio = min(1.0, TARGET_TRIS / max(1, total))
    for o in meshes:
        d = o.modifiers.new("thin", "DECIMATE")
        d.ratio = ratio
        d.use_collapse_triangulate = True
        # Thin before the armature binds it.
        o.modifiers.move(o.modifiers.find(d.name), 0)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    images = {}

    def pixels(img):
        if img.name not in images:
            images[img.name] = (img.size[0], img.size[1], list(img.pixels[:]))
        return images[img.name]

    def sample(img, u, v):
        w, h, px = pixels(img)
        x = min(w - 1, max(0, int((u % 1.0) * w)))
        y = min(h - 1, max(0, int((v % 1.0) * h)))
        o = (y * w + x) * 4
        return px[o], px[o + 1], px[o + 2], px[o + 3]

    strands = {}

    def strand_colour(img):
        """The mean of an image's opaque texels: a hair card's strands, without the empty space between."""
        if img.name not in strands:
            _, _, px = pixels(img)
            n = len(px) // 4
            opaque = [i for i in range(0, n, 17) if px[i * 4 + 3] >= 0.5] or list(range(0, n, 17))
            strands[img.name] = [sum(px[i * 4 + k] for i in opaque) / len(opaque) for k in range(3)]
        return strands[img.name]

    pos, nor, col, surf, skin, wts, tris = [], [], [], [], [], [], []
    for o in meshes:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        world = G @ o.matrix_world
        nworld = world.to_3x3().inverted().transposed()
        mat = me.materials[0] if me.materials else None
        base_img = mr_img = spec_img = None
        if mat and mat.node_tree:
            for n in mat.node_tree.nodes:
                # The image wired into the shader's base colour (an FBX's images have no telling names).
                if n.type == "TEX_IMAGE" and n.image and any(l.to_socket.name == "Base Color" for l in n.outputs[0].links):
                    base_img = n.image
            for n in mat.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image:
                    if ("baseColor" in n.image.name or "diffuse" in n.image.name.lower()) and base_img is None:
                        base_img = n.image
                    if "metallicRoughness" in n.image.name and mr_img is None:
                        mr_img = n.image
            for n in mat.node_tree.nodes:
                # No metal map, a specular one (a Mixamo character's): read as how much metal shows there.
                if n.type == "TEX_IMAGE" and n.image and mr_img is None and spec_img is None and any(l.to_socket.name.startswith("Specular") for l in n.outputs[0].links):
                    spec_img = n.image
        uv = me.uv_layers.active.data if me.uv_layers.active else None
        # Without a texture (a beard, a bun of hair): the material's own colour, matt.
        plain_colour = [0.5, 0.5, 0.5]
        if mat and mat.node_tree:
            for n in mat.node_tree.nodes:
                if n.type == "BSDF_PRINCIPLED" and not n.inputs["Base Color"].links:
                    plain_colour = list(n.inputs["Base Color"].default_value)[:3]
        team = TEAM_SHARE if team_garment and base_img and team_garment in base_img.name else 0.0
        # Per vertex: the mean of its loops' texture colours.
        acc = {}
        for loop in me.loops:
            if uv is None or base_img is None:
                continue
            u, v = uv[loop.index].uv
            c = sample(base_img, u, v)
            if c[3] < 0.5:
                continue  # a see-through texel between a hair card's strands: its colour is meaningless
            if mr_img:
                m = sample(mr_img, u, v)
            elif spec_img:
                metal = min(1.0, 3.0 * sample(spec_img, u, v)[0])
                m = (0, 0.7 - 0.35 * metal, metal)
            else:
                m = (0, 0.6, 0.0)
            a = acc.setdefault(loop.vertex_index, [0, 0, 0, 0, 0, 0, 0])
            a[0] += c[0]; a[1] += c[1]; a[2] += c[2]; a[3] += m[2]; a[4] += m[1]; a[5] += 1
            if TEAM_BELOW is not None and 0.2126 * srgb_to_linear(c[0]) + 0.7152 * srgb_to_linear(c[1]) + 0.0722 * srgb_to_linear(c[2]) < TEAM_BELOW:
                a[6] += 1
        # A vertex of a hair card that met no strand: the strands' mean colour, matt.
        if uv is not None and base_img is not None:
            hair = strand_colour(base_img)
            for v in me.vertices:
                if v.index not in acc:
                    acc[v.index] = [hair[0], hair[1], hair[2], 0.0, 0.85, 1, 0]
        names = {g.index: g.name for g in o.vertex_groups}
        base = len(pos)
        for v in me.vertices:
            p = world @ v.co
            pos.append(to_game_point(p))
            n = (nworld @ v.normal).normalized()
            nor.append([-n.x, n.z, n.y])
            a = acc.get(v.index)
            if a and a[5] > 0:
                # Image.pixels gives a PNG's stored (sRGB) values: to linear for the shader.
                col.append([srgb_to_linear(a[0] / a[5]), srgb_to_linear(a[1] / a[5]), srgb_to_linear(a[2] / a[5])])
                surf.append([a[3] / a[5], a[4] / a[5], team * (a[6] / a[5] if TEAM_BELOW is not None else 1.0)])
            elif base_img is None:
                col.append(plain_colour)
                surf.append([0.0, 0.8, 0.0])
            else:
                col.append([0.5, 0.5, 0.5])
                surf.append([0.8, 0.4, 0.0])
            folded = {}
            for g in v.groups:
                k = kept(names.get(g.group, "Hips"))
                folded[k] = folded.get(k, 0.0) + g.weight
            if not folded:
                folded = {"Head": 1.0}  # a rigid part worn on the head
            top = sorted(folded.items(), key=lambda kv: -kv[1])[:4]
            s = sum(w for _, w in top) or 1.0
            idx = [BONES.index(k) for k, _ in top] + [0] * (4 - len(top))
            w4 = [w / s for _, w in top] + [0.0] * (4 - len(top))
            skin.append(idx)
            wts.append(w4)
        for t in me.loop_triangles:
            tris.append([base + i for i in t.vertices])
        ev.to_mesh_clear()
    return pos, nor, col, surf, skin, wts, tris


def box(cx, cy, cz, sx, sy, sz):
    """Eight corners and twelve triangles of an axis box (Blender space), outward."""
    corners = [Vector((cx + dx * sx / 2, cy + dy * sy / 2, cz + dz * sz / 2)) for dx in (-1, 1) for dy in (-1, 1) for dz in (-1, 1)]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return corners, faces


HALBERD = [
    # Along the sword's line (-Y ahead of the grip at y 0.16): the shaft from 0.9 m behind to 1.5 m ahead.
    ("Sword_joint", (-0.79, -0.44, 1.41), (0.035, 2.4, 0.035), (0.20, 0.13, 0.07), 0.0, 0.8, 0.0),  # shaft
    ("Sword_joint", (-0.79, -1.75, 1.41), (0.025, 0.34, 0.012), (0.55, 0.56, 0.58), 1.0, 0.3, 0.0),  # spike
    ("Sword_joint", (-0.79, -1.42, 1.50), (0.012, 0.26, 0.2), (0.55, 0.56, 0.58), 1.0, 0.3, 0.0),  # axe blade
    ("Sword_joint", (-0.79, -1.45, 1.33), (0.012, 0.07, 0.12), (0.55, 0.56, 0.58), 1.0, 0.3, 0.0),  # back hook
    ("Sword_joint", (-0.79, -1.2, 1.41), (0.05, 0.1, 0.05), (1, 1, 1), 0.0, 0.7, 1.0),  # tassel in the side's colour
]
AXE = [
    # A felling axe held two-handed: a 0.9 m haft along the sword's line, the head at its end.
    ("Sword_joint", (-0.79, -0.22, 1.41), (0.035, 0.9, 0.035), (0.42, 0.30, 0.16), 0.0, 0.8, 0.0),  # haft
    ("Sword_joint", (-0.79, -0.62, 1.50), (0.02, 0.12, 0.2), (0.55, 0.56, 0.58), 1.0, 0.35, 0.0),  # blade
]
# A builder's mallet on the second weapon joint, which for --arms tools rides in the right hand too.
MALLET = [
    ("Shield_joint", (-0.79, -0.12, 1.41), (0.035, 0.62, 0.035), (0.42, 0.30, 0.16), 0.0, 0.8, 0.0),  # handle
    ("Shield_joint", (-0.79, -0.44, 1.41), (0.13, 0.14, 0.26), (0.36, 0.25, 0.14), 0.0, 0.75, 0.0),  # head
]
CROSSBOW = [
    # A crossbow held like a gun: the stock forward from the grip along the sword's line, the steel bow
    # across its front end, the string drawn back to the nut.
    ("Sword_joint", (-0.79, -0.22, 1.41), (0.06, 0.78, 0.08), (0.36, 0.24, 0.12), 0.0, 0.8, 0.0),  # stock
    ("Sword_joint", (-0.79, -0.58, 1.43), (0.74, 0.05, 0.05), (0.55, 0.56, 0.58), 1.0, 0.35, 0.0),  # bow
    ("Sword_joint", (-0.79, -0.4, 1.45), (0.62, 0.01, 0.01), (0.85, 0.82, 0.72), 0.0, 0.9, 0.0),  # string
    ("Sword_joint", (-0.79, 0.12, 1.41), (0.07, 0.12, 0.1), (1, 1, 1), 0.0, 0.7, 1.0),  # butt wrap in the side's colour
]
PIKE = [
    # A 4 m ash shaft, 1 m of it behind the hand, and a narrow steel head.
    ("Sword_joint", (-0.79, -0.84, 1.41), (0.032, 4.0, 0.032), (0.24, 0.16, 0.09), 0.0, 0.8, 0.0),  # shaft
    ("Sword_joint", (-0.79, -2.98, 1.41), (0.03, 0.28, 0.018), (0.55, 0.56, 0.58), 1.0, 0.3, 0.0),  # head
    ("Sword_joint", (-0.79, -2.7, 1.41), (0.05, 0.08, 0.05), (1, 1, 1), 0.0, 0.7, 1.0),  # pennon in the side's colour
]


def add_box(centre, size, colour, metal, rough, team, bone, pos, nor, col, surf, skin, wts, tris):
    """One box in the character's rest space (Blender, looking along -Y), riding on one bone."""
    corners, faces = box(*centre, *size)
    base = len(pos)
    for p in corners:
        pos.append(to_game_point(p))
        d = (p - Vector(centre)).normalized()
        nor.append([-d.x, d.z, d.y])
        col.append([srgb_to_linear(x) for x in colour])
        surf.append([metal, rough, team])
        skin.append([BONES.index(bone), 0, 0, 0])
        wts.append([1.0, 0.0, 0.0, 0.0])
    for a, b, cc, d in faces:
        tris.append([base + a, base + b, base + cc])
        tris.append([base + a, base + cc, base + d])


def add_oriented_box(centre, axes, size, colour, metal, rough, team, bone, pos, nor, col, surf, skin, wts, tris):
    """A box along three axes (unit vectors, character rest space) about its centre, riding on one bone."""
    u, v, w = axes
    base = len(pos)
    for du in (-1, 1):
        for dv in (-1, 1):
            for dw in (-1, 1):
                p = centre + u * (du * size[0] / 2) + v * (dv * size[1] / 2) + w * (dw * size[2] / 2)
                pos.append(to_game_point(p))
                d = (u * du + v * dv + w * dw).normalized()
                nor.append([-d.x, d.z, d.y])
                col.append([srgb_to_linear(x) for x in colour])
                surf.append([metal, rough, team])
                skin.append([BONES.index(bone), 0, 0, 0])
                wts.append([1.0, 0.0, 0.0, 0.0])
    # Corner k = du*4 + dv*2 + dw over (-1, 1): the same faces as box().
    for a, b, cc, d in [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]:
        tris.append([base + a, base + b, base + cc])
        tris.append([base + a, base + cc, base + d])


def add_crossbow(char_rest, aim_mats, *mesh):
    """The crossbow held as the aiming clip holds a gun: the stock from the right fist towards the left hand
    as they stand at the end of the raise, taken back into the right hand's rest frame so it rides with it;
    the steel bow across the stock's front, level."""
    r_rest = head_of(char_rest["RightHand"])
    l_rest = head_of(char_rest["LeftHand"])
    m_r = aim_mats[ORDER.index("RightHand")]
    m_l = aim_mats[ORDER.index("LeftHand")]
    rot = m_r.to_3x3()
    inv = rot.inverted()
    along = (inv @ ((m_l @ l_rest.to_4d()).xyz - (m_r @ r_rest.to_4d()).xyz)).normalized()
    up = (inv @ Vector((0, 0, 1))).normalized()
    side = along.cross(up).normalized()
    up = side.cross(along).normalized()
    fist = r_rest + (head_of(char_rest["RightHandMiddle1"]) - r_rest) * 0.8
    axes = (along, side, up)
    add_oriented_box(fist + along * 0.2, axes, (0.8, 0.06, 0.08), (0.36, 0.24, 0.12), 0.0, 0.8, 0.0, "RightHand", *mesh)  # stock
    add_oriented_box(fist + along * 0.58 + up * 0.03, axes, (0.05, 0.74, 0.05), (0.55, 0.56, 0.58), 1.0, 0.35, 0.0, "RightHand", *mesh)  # bow
    add_oriented_box(fist + along * 0.42 + up * 0.05, axes, (0.01, 0.62, 0.01), (0.85, 0.82, 0.72), 0.0, 0.9, 0.0, "RightHand", *mesh)  # string
    add_oriented_box(fist - along * 0.16, axes, (0.12, 0.08, 0.1), (1, 1, 1), 0.0, 0.7, 1.0, "RightHand", *mesh)  # butt wrap


def add_bow(hand, *mesh):
    """A longbow upright in the left fist as the T pose holds it (the arm out along +X): the stave through
    the fist, its limbs bending a little towards the man, the string on his side of it."""
    wood = (0.55, 0.38, 0.2)
    fist = hand + Vector((0.08, 0.0, 0.0))
    # Twice a real stave's thickness, so it reads from a strategy camera.
    add_box(fist, (0.07, 0.07, 0.22), (0.16, 0.10, 0.05), 0.0, 0.8, 0.0, "LeftHand", *mesh)  # leather grip
    for up in (1, -1):
        add_box(fist + Vector((-0.03, 0.0, up * 0.42)), (0.055, 0.06, 0.64), wood, 0.0, 0.7, 0.0, "LeftHand", *mesh)  # inner limb
        add_box(fist + Vector((-0.08, 0.0, up * 0.8)), (0.045, 0.05, 0.18), wood, 0.0, 0.7, 0.0, "LeftHand", *mesh)  # tip
    add_box(fist + Vector((-0.14, 0.0, 0.0)), (0.012, 0.012, 1.68), (0.85, 0.82, 0.72), 0.0, 0.9, 0.0, "LeftHand", *mesh)  # string
    add_box(fist + Vector((0.0, 0.0, 0.0)), (0.07, 0.07, 0.05), (1, 1, 1), 0.0, 0.7, 1.0, "LeftHand", *mesh)  # wrap in the side's colour


def add_weapons(anim_rest, char_hand_rest, pos, nor, col, surf, skin, wts, tris, polearm=None):
    """The sword in the right hand and the shield on the left forearm, where the clips' paladin held them in
    their T pose (sword along -Y, the shield flat along the forearm), moved to the character's hand."""
    steel = (0.55, 0.56, 0.58)
    wood = (0.18, 0.11, 0.06)
    parts = [
        # (weapon joint, centre, size, colour, metal, rough, team) in the clips' rest space (metres).
        ("Sword_joint", (-0.79, -0.33, 1.41), (0.045, 0.82, 0.012), steel, 1.0, 0.3, 0.0),  # blade
        ("Sword_joint", (-0.79, 0.07, 1.41), (0.03, 0.03, 0.22), steel, 1.0, 0.4, 0.0),  # cross-guard
        ("Sword_joint", (-0.79, 0.16, 1.41), (0.03, 0.17, 0.03), wood, 0.0, 0.8, 0.0),  # grip
    ]
    if polearm:
        parts = polearm
    else:
        # The shield: a heater (flat top, sides running into a point), its face in the side's colour over a
        # wooden back a little larger, lying along the forearm as the clips' paladin held his.
        add_heater("Shield_joint", (0.57, 0.11, 1.50), 0.44, 0.66, 0.04, (1, 1, 1), 0.0, 0.7, 1.0, anim_rest, char_hand_rest, pos, nor, col, surf, skin, wts, tris)
        add_heater("Shield_joint", (0.57, 0.11, 1.475), 0.48, 0.70, 0.02, wood, 0.0, 0.8, 0.0, anim_rest, char_hand_rest, pos, nor, col, surf, skin, wts, tris)
    for joint, c, s, colour, metal, rough, team in parts:
        hand = WEAPONS[joint]
        corners, faces = box(*c, *s)
        base = len(pos)
        # From the clips' hand to the character's: the same offset from the hand, no turn (see bake_frames).
        shift = char_hand_rest[hand] - anim_rest[hand]
        for p in corners:
            q = p + shift
            pos.append(to_game_point(q))
            d = (p - Vector(c)).normalized()
            nor.append([-d.x, d.z, d.y])
            col.append([srgb_to_linear(x) for x in colour])
            surf.append([metal, rough, team])
            skin.append([BONES.index(joint), 0, 0, 0])
            wts.append([1.0, 0.0, 0.0, 0.0])
        for a, b, cc, d in faces:
            tris.append([base + a, base + b, base + cc])
            tris.append([base + a, base + cc, base + d])


# Which way along its length (the clips' Y) a shield's point lies.
HEATER_POINT = 1


def add_heater(joint, c, width, length, thick, colour, metal, rough, team, anim_rest, char_hand_rest, pos, nor, col, surf, skin, wts, tris):
    """A heater shield as a slab: its outline in the clips' X (across) and Y (along, the point at HEATER_POINT),
    `thick` deep along Z; flat faces, so every face has its own corners."""
    half = width / 2
    top = -HEATER_POINT * length / 2  # the flat edge
    shoulder = top + HEATER_POINT * length * 0.5  # where the sides start to curve in
    outline = [(-half, top), (half, top)]
    for i in range(7):
        a = i / 6 * math.pi / 2
        outline.append((half * math.cos(a), shoulder + HEATER_POINT * (length * 0.5) * math.sin(a)))
    for i in range(5, -1, -1):
        a = i / 6 * math.pi / 2
        outline.append((-half * math.cos(a), shoulder + HEATER_POINT * (length * 0.5) * math.sin(a)))
    shift = char_hand_rest[WEAPONS[joint]] - anim_rest[WEAPONS[joint]]
    cx, cy, cz = c

    def corner(u, v, side):
        return Vector((cx + u, cy + v, cz + side * thick / 2)) + shift

    def wound(points, base, i, j, k, normal):
        """A triangle wound to face along `normal` (the game's culling keeps counter-clockwise fronts)."""
        a, b, cc = points[i], points[j], points[k]
        if (b - a).cross(cc - a).dot(Vector(normal)) < 0:
            j, k = k, j
        tris.append([base + i, base + j, base + k])

    def face(points, normal):
        base = len(pos)
        for p in points:
            pos.append(to_game_point(p))
            nor.append([-normal[0], normal[2], normal[1]])
            col.append([srgb_to_linear(x) for x in colour])
            surf.append([metal, rough, team])
            skin.append([BONES.index(joint), 0, 0, 0])
            wts.append([1.0, 0.0, 0.0, 0.0])
        return base

    middle = (0.0, (top + shoulder) / 2)
    n = len(outline)
    for side in (-1, 1):
        points = [corner(*middle, side)] + [corner(u, v, side) for u, v in outline]
        base = face(points, (0, 0, side))
        for i in range(n):
            wound(points, base, 0, 1 + i, 1 + (i + 1) % n, (0, 0, side))
    for i in range(n):
        (u0, v0), (u1, v1) = outline[i], outline[(i + 1) % n]
        out = Vector((v1 - v0, -(u1 - u0), 0)).normalized()
        if out.dot(Vector((u0 + u1, v0 + v1 - 2 * middle[1], 0))) < 0:
            out = -out
        points = [corner(u0, v0, -1), corner(u1, v1, -1), corner(u1, v1, 1), corner(u0, v0, 1)]
        base = face(points, tuple(out))
        wound(points, base, 0, 1, 2, tuple(out))
        wound(points, base, 0, 2, 3, tuple(out))


def head_of(m: Matrix) -> Vector:
    return m.to_translation()


def bake_frames(char_rest, clip_path, hips_ratio):
    """Per frame per bone, the skinning matrix (Blender space, character facing -Y) for one clip."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=clip_path)
    anim = [o for o in bpy.data.objects if o not in before and o.type == "ARMATURE"][0]
    action = anim.animation_data.action
    first, last = int(action.frame_range[0]), int(action.frame_range[1])
    bones = {plain(b.name): b for b in anim.data.bones}
    aw = anim.matrix_world
    def rest_world(n):
        return aw @ bones[n].matrix_local
    # Clips made without a weapon have no weapon joints: those then follow the hand that would hold them.
    a_rest_rot = {n: rest_world(n).to_3x3().normalized().to_quaternion() for n in list(KEEP) + [j for j in WEAPONS if j in bones]}
    a_rest_head = {n: aw @ bones[n].head_local for n in bones}
    # The character's rest turned onto the clip's rest, bone by bone (directions from head to the child's head).
    align = {}
    for n, child in KEEP.items():
        dc = head_of(char_rest[child]) - head_of(char_rest[n])
        if head_of(char_rest[child]).length < 1e-3:
            # The knight's end bones (HeadTop_End, Toe_End) sit at the origin: the bone goes on the way
            # its parent points (the head along the neck, the toes along the foot).
            parent = next(p for p, c in KEEP.items() if c == n)
            dc = head_of(char_rest[n]) - head_of(char_rest[parent])
        dc = dc.normalized()
        da = (a_rest_head[child] - a_rest_head[n]).normalized()
        align[n] = dc.rotation_difference(da)
    # How far the clip walks the hips over the ground (a clip not made "in place"), before it is kept on the spot.
    hips_bone = anim.pose.bones[bones["Hips"].name]
    bpy.context.scene.frame_set(first)
    start = (aw @ hips_bone.head).copy()
    bpy.context.scene.frame_set(last)
    end = aw @ hips_bone.head
    travel = math.hypot(end.x - start.x, end.y - start.y) * hips_ratio
    frames = []
    for f in range(first, last + 1):
        bpy.context.scene.frame_set(f)
        pose = anim.pose.bones
        posed_rot = {}
        posed_head = {}
        mats = []
        for n in ORDER:
            pb = pose[bones[n].name]
            world = aw @ pb.matrix
            delta = world.to_3x3().normalized().to_quaternion() @ a_rest_rot[n].inverted()
            r = delta @ align[n]
            posed_rot[n] = r
            h_rest = head_of(char_rest[n])
            if n == "Hips":
                move = (aw @ pb.head) - a_rest_head[n]
                # On the spot: only up and down.
                h = h_rest + Vector((0, 0, move.z * hips_ratio))
            else:
                parent = plain(bones[n].parent.name)
                while parent not in KEEP:
                    parent = plain(bones[parent].parent.name)
                hp_rest = head_of(char_rest[parent])
                h = posed_head[parent] + posed_rot[parent] @ (h_rest - hp_rest)
            posed_head[n] = h
            m = r.to_matrix().to_4x4()
            m.translation = h - r @ h_rest
            mats.append(m)
        for joint, hand in WEAPONS.items():
            if joint not in bones:
                mats.append(mats[ORDER.index(hand)].copy())
                continue
            pb = pose[bones[joint].name]
            world = aw @ pb.matrix
            delta = world.to_3x3().normalized().to_quaternion() @ a_rest_rot[joint].inverted()
            h_rest = head_of(char_rest[hand])
            m = delta.to_matrix().to_4x4()
            m.translation = posed_head[hand] - delta @ h_rest
            mats.append(m)
        frames.append(mats)
    fps = bpy.context.scene.render.fps
    anim_rest_hand = {hand: a_rest_head[hand] for hand in WEAPONS.values()}
    return frames, fps, anim_rest_hand, a_rest_head["Hips"].z, travel


# In the saddle (--seated): the thighs come forward about the hip and part round the horse's barrel, the shins
# hang nearly straight in long stirrups; the arms come down from the T, the right forearm forward to the lance,
# the left to the reins under the shield. Directions in the game's space (Y up, forward -Z, his left -X).
SEAT_LIFT_RAD = math.radians(45)
SEAT_SPREAD_RAD = math.radians(20)
SEAT_ARMS = {
    # side: (upper arm, forearm), unnormalised directions with x for his right (+X); the left side mirrors x.
    "Right": ((0.24, -1.0, -0.22), (0.12, -0.6, -1.0)),
    "Left": ((0.2, -1.0, -0.18), (0.25, -0.5, -1.0)),
}


def seated(char_rest, pos, nor, skin, wts):
    """Poses the bind-pose mesh (game space) in the saddle; returns the limb per vertex and the pivots."""
    head = {n: Vector(to_game_point(head_of(m))) for n, m in char_rest.items()}
    mats = {n: Matrix.Identity(4) for n in BONES}

    def about(point, rot):
        return Matrix.Translation(point) @ rot.to_4x4() @ Matrix.Translation(-point)

    for side, sign in (("Left", -1), ("Right", 1)):
        hip, knee, foot = head[side + "UpLeg"], head[side + "Leg"], head[side + "Foot"]
        thigh = Matrix.Rotation(sign * SEAT_SPREAD_RAD, 3, "Z") @ Matrix.Rotation(SEAT_LIFT_RAD, 3, "X")
        m_thigh = about(hip, thigh)
        knee_now = m_thigh @ knee
        shin_now = (m_thigh.to_3x3() @ (foot - knee)).normalized()
        shin_to = Vector((sign * math.sin(SEAT_SPREAD_RAD * 0.6), -1.0, 0.05)).normalized()
        m_shin = about(knee_now, shin_now.rotation_difference(shin_to).to_matrix()) @ m_thigh
        mats[side + "UpLeg"] = m_thigh
        for n in (side + "Leg", side + "Foot", side + "ToeBase"):
            mats[n] = m_shin
        upper, fore = SEAT_ARMS[side]
        upper = Vector((sign * upper[0], upper[1], upper[2])).normalized()
        fore = Vector((sign * fore[0], fore[1], fore[2])).normalized()
        sh, el, hand = head[side + "Arm"], head[side + "ForeArm"], head[side + "Hand"]
        m_arm = about(sh, (el - sh).normalized().rotation_difference(upper).to_matrix())
        el_now = m_arm @ el
        fore_now = (m_arm.to_3x3() @ (hand - el)).normalized()
        m_fore = about(el_now, fore_now.rotation_difference(fore).to_matrix()) @ m_arm
        mats[side + "Arm"] = m_arm
        mats[side + "ForeArm"] = m_fore
        mats[side + "Hand"] = m_fore
    limbs = []
    arm_bones = {3: {"LeftArm", "LeftForeArm", "LeftHand"}, 4: {"RightArm", "RightForeArm", "RightHand"}}
    for i in range(len(pos)):
        p, n = Vector(pos[i]), Vector(nor[i])
        q, r = Vector(), Vector()
        share = {3: 0.0, 4: 0.0}
        for b, w in zip(skin[i], wts[i]):
            if w <= 0:
                continue
            m = mats[BONES[b]]
            q += w * (m @ p)
            r += w * (m.to_3x3() @ n)
            for limb, names in arm_bones.items():
                if BONES[b] in names:
                    share[limb] += w
        pos[i] = list(q)
        nor[i] = list(r.normalized()) if r.length > 0 else list(n)
        limbs.append(3 if share[3] > 0.5 else 4 if share[4] > 0.5 else 0)
    hips = (head["LeftUpLeg"] + head["RightUpLeg"]) / 2
    shoulders = (head["LeftArm"] + head["RightArm"]) / 2
    pivots = {"hipY": hips.y, "hipZ": hips.z, "shoulderY": shoulders.y, "shoulderZ": shoulders.z,
              "shoulderX": abs(head["RightArm"].x - head["LeftArm"].x) / 2}
    return limbs, pivots


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1:]
    char_path, out = args[0], args[1]
    def option(name, default):
        return args[args.index(name) + 1] if name in args else default

    arms = option("--arms", "sword")
    height_m = float(option("--height", "1.99"))
    source = option("--source", "knight for game project (old), Thomas.Osterhammel (Sketchfab), CC BY 4.0")
    team_garment = option("--team", None)
    global TEAM_SHARE, TARGET_TRIS
    TEAM_SHARE = float(option("--team-share", str(TEAM_SHARE)))
    global TEAM_BELOW
    TEAM_BELOW = float(option("--team-below", "0")) or None
    TARGET_TRIS = int(option("--tris", str(TARGET_TRIS)))
    step = int(option("--step", "1"))  # every step-th frame (a clip's fps divided by it)
    tool_clips = set(filter(None, option("--tool-clips", "").split(",")))
    tool2_clips = set(filter(None, option("--tool2-clips", "").split(",")))
    if arms == "tools":
        WEAPONS["Shield_joint"] = "RightHand"
    valued = {args.index(n) + 1 for n in ("--arms", "--height", "--source", "--team", "--team-share", "--tris", "--step", "--tool-clips", "--tool2-clips", "--team-below", "--gain") if n in args}
    clips = [a for i, a in enumerate(args) if i >= 2 and not a.startswith("--") and i not in valued]
    rig, G, char_rest = load_character(char_path, height_m)
    pos, nor, col, surf, skin, wts, tris = bake_mesh(rig, G, team_garment)
    if "--seated" in args:
        # A rider (the game's body format, soldierGeometry.ts BodyModel): one pose, limbs instead of bones.
        floor = min(p[1] for p in pos)
        for p in pos:
            p[1] -= floor
        gain = float(option("--gain", "1"))
        for c in col:
            c[:] = [min(1.0, x * gain) for x in c]
        for n in char_rest:
            char_rest[n] = Matrix.Translation((0, 0, -floor)) @ char_rest[n]
        limbs, pivots = seated(char_rest, pos, nor, skin, wts)
        r4 = lambda v: [round(x, 4) for x in v]  # noqa: E731
        data = {
            "source": source + "; seated by rigged.py --seated",
            "pivots": {k: round(v, 4) for k, v in pivots.items()},
            "positions": [x for p in pos for x in r4(p)],
            "normals": [x for n in nor for x in r4(n)],
            "colours": [x for c in col for x in r4(c)],
            "surface": [x for s in surf for x in r4(s[:2])],
            "limbs": limbs,
            "triangles": [i for t in tris for i in t],
        }
        with open(out, "w") as f:
            json.dump(data, f, separators=(",", ":"))
        print(f"seated: {len(pos)} vertices, {len(tris)} triangles, pivots {data['pivots']}")
        return
    hips_char = head_of(char_rest["Hips"]).z
    all_frames, clip_meta = [], []
    anim_hand = None
    for path in clips:
        name = os.path.splitext(os.path.basename(path))[0]
        # The first pass only measures the clips' hips height.
        frames, fps, hands, hips_anim, travel = bake_frames(char_rest, path, 1.0)
        ratio = hips_char / hips_anim
        if abs(ratio - 1) > 1e-3:
            frames, fps, hands, hips_anim, travel = bake_frames(char_rest, path, ratio)
        anim_hand = anim_hand or hands
        frames = frames[::step]
        # A tool put away: its joint's matrices with no extent (its triangles have no area).
        hidden = []
        if tool_clips and name not in tool_clips:
            hidden.append(len(ORDER))
        if (tool_clips or tool2_clips) and name not in tool2_clips:
            hidden.append(len(ORDER) + 1)
        for mats in frames:
            for k in hidden:
                m = mats[k].copy()
                for r in range(3):
                    for c in range(3):
                        m[r][c] = 0.0
                mats[k] = m
        fps = fps / step
        clip_meta.append({"name": name, "start": len(all_frames), "frames": len(frames), "fps": fps, "travelM": round(travel, 3)})
        all_frames += frames
    char_hand = {hand: head_of(char_rest[hand]) for hand in WEAPONS.values()}
    mesh = (pos, nor, col, surf, skin, wts, tris)
    if arms == "none":
        pass
    elif arms == "bow":
        add_bow(head_of(char_rest["LeftHand"]), *mesh)
    elif arms == "crossbow":
        # Aimed as at the end of the raise (the clip named 'draw'), the last frame.
        draw = next(c for c in clip_meta if c["name"] == "draw")
        add_crossbow(char_rest, all_frames[draw["start"] + draw["frames"] - 1], *mesh)
    else:
        add_weapons(anim_hand, char_hand, *mesh, {"sword": None, "halberd": HALBERD, "pike": PIKE, "axe": AXE, "tools": AXE + MALLET, "crossbow": CROSSBOW}[arms])
    # Feet on the ground.
    floor = min(p[1] for p in pos)
    for p in pos:
        p[1] -= floor
    lift = Matrix.Translation((0, floor, 0))
    flat = []
    for mats in all_frames:
        for m in mats:
            g = lift.inverted() @ P @ m @ P.inverted() @ lift
            flat += [round(g[r][c], 4) for r in range(3) for c in range(4)]
    r4 = lambda v: [round(x, 4) for x in v]  # noqa: E731
    data = {
        "source": source + "; clips from Mixamo",
        "bones": BONES,
        "clips": clip_meta,
        "frames": flat,
        "positions": [x for p in pos for x in r4(p)],
        "normals": [x for n in nor for x in r4(n)],
        "colours": [x for c in col for x in r4(c)],
        "surface": [x for s in surf for x in r4(s)],
        "skin": [i for s in skin for i in s],
        "weights": [x for w in wts for x in r4(w)],
        "triangles": [i for t in tris for i in t],
    }
    with open(out, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"rigged: {len(pos)} vertices, {len(tris)} triangles, {len(BONES)} bones, clips {[(c['name'], c['frames']) for c in clip_meta]}")


main()
