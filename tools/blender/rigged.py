"""Bakes a Mixamo-rigged character and Mixamo animations into the game's skinned soldier.

    bl/bin/python -I tools/blender/rigged.py -- <character.gltf> <out.json> [--halberd] <clip.fbx>...

With --halberd the man carries a halberd in his sword hand instead of sword and shield (the clips' sword
joint holds it: a 2.4 m shaft, more of it ahead of the hand than behind, the axe and spike at its head).

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


def plain(name: str) -> str:
    """'mixamorig:LeftHandIndex1_07' -> 'LeftHandIndex1'."""
    name = name.split(":")[-1]
    return re.sub(r"_\d+$", "", name)


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


def load_character(path: str):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    rig = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"][0]
    # Turn the character to look along -Y like the clips (it looks along -X).
    G = Matrix.Rotation(math.radians(90), 4, "Z")
    rest = {}
    for b in rig.data.bones:
        n = plain(b.name)
        if n in KEEP or n in {v for v in KEEP.values()}:
            rest.setdefault(n, G @ rig.matrix_world @ b.matrix_local)
    return rig, G, rest


def bake_mesh(rig, G):
    """The character's meshes in the bind pose, thinned, with colours from the texture and the kept bones' weights."""
    rig.data.pose_position = "REST"
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name != "Icosphere" and len(o.vertex_groups) > 0]
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
        return px[o], px[o + 1], px[o + 2]

    pos, nor, col, surf, skin, wts, tris = [], [], [], [], [], [], []
    for o in meshes:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        world = G @ o.matrix_world
        nworld = world.to_3x3().inverted().transposed()
        mat = me.materials[0] if me.materials else None
        base_img = mr_img = None
        if mat and mat.node_tree:
            for n in mat.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image:
                    if "baseColor" in n.image.name and base_img is None:
                        base_img = n.image
                    if "metallicRoughness" in n.image.name and mr_img is None:
                        mr_img = n.image
        uv = me.uv_layers.active.data if me.uv_layers.active else None
        # Per vertex: the mean of its loops' texture colours.
        acc = {}
        for loop in me.loops:
            if uv is None or base_img is None:
                continue
            u, v = uv[loop.index].uv
            c = sample(base_img, u, v)
            m = sample(mr_img, u, v) if mr_img else (0, 0.6, 0.0)
            a = acc.setdefault(loop.vertex_index, [0, 0, 0, 0, 0, 0])
            a[0] += c[0]; a[1] += c[1]; a[2] += c[2]; a[3] += m[2]; a[4] += m[1]; a[5] += 1
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
                surf.append([a[3] / a[5], a[4] / a[5], 0.0])
            else:
                col.append([0.5, 0.5, 0.5])
                surf.append([0.8, 0.4, 0.0])
            folded = {}
            for g in v.groups:
                k = kept(names.get(g.group, "Hips"))
                folded[k] = folded.get(k, 0.0) + g.weight
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
        ("Shield_joint", (0.57, 0.11, 1.50), (0.44, 0.66, 0.04), (1, 1, 1), 0.0, 0.7, 1.0),  # face, in the side's colour
        ("Shield_joint", (0.57, 0.11, 1.475), (0.47, 0.69, 0.02), wood, 0.0, 0.8, 0.0),  # rim and back
    ]
    if polearm:
        parts = polearm
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
    a_rest_rot = {n: rest_world(n).to_3x3().normalized().to_quaternion() for n in list(KEEP) + list(WEAPONS)}
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
    return frames, fps, anim_rest_hand, a_rest_head["Hips"].z


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1:]
    char_path, out = args[0], args[1]
    halberd = "--halberd" in args
    clips = [a for a in args[2:] if not a.startswith("--")]
    rig, G, char_rest = load_character(char_path)
    pos, nor, col, surf, skin, wts, tris = bake_mesh(rig, G)
    hips_char = head_of(char_rest["Hips"]).z
    all_frames, clip_meta = [], []
    anim_hand = None
    for path in clips:
        name = os.path.splitext(os.path.basename(path))[0]
        # The first pass only measures the clips' hips height.
        frames, fps, hands, hips_anim = bake_frames(char_rest, path, 1.0)
        ratio = hips_char / hips_anim
        if abs(ratio - 1) > 1e-3:
            frames, fps, hands, hips_anim = bake_frames(char_rest, path, ratio)
        anim_hand = anim_hand or hands
        clip_meta.append({"name": name, "start": len(all_frames), "frames": len(frames), "fps": fps})
        all_frames += frames
    char_hand = {hand: head_of(char_rest[hand]) for hand in WEAPONS.values()}
    add_weapons(anim_hand, char_hand, pos, nor, col, surf, skin, wts, tris, HALBERD if halberd else None)
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
        "source": "knight for game project (old), Thomas.Osterhammel (Sketchfab), CC BY 4.0; clips from Mixamo",
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
