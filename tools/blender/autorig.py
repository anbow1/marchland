"""Puts a still character (a statue-like model standing in a T or an A pose, no skeleton) on a Mixamo-named
skeleton, so that rigged.py can move it with the Mixamo clips.

    bl/bin/python -I tools/blender/autorig.py -- <character.gltf|glb> <out.glb> [--drop word,word] [--preview out.png]

The model must stand upright (Z up), facing -Y (as Sketchfab's glTF files come into Blender), arms out to the
sides or hanging a little away from the body. The skeleton is found from the model's own proportions:

- the legs from slices of the mesh below the hips, each side's median (a scabbard or a musket's butt hanging
  among the legs does not pull it): hip, knee, ankle, the toe's tip at the front of the shoe;
- the spine on the body's middle line at the usual shares of the height (hips 0.52, chest 0.72, neck 0.84);
- each arm from its shoulder joint to the farthest point of that hand (the fingertips), elbow and wrist at the
  usual shares of that line, each moved to the middle of the sleeve around it.

Weights: every vertex goes to its two nearest bones, by the distance to each bone's segment (the inverse fourth
power, so the nearer bone takes most), never to a limb of the other side, the legs only below the hips and the
arms only beyond the shoulder line. That is what a strategy camera needs; a close-up would want painted weights.
--drop: meshes whose material's name holds one of these words are left out (a gun held at rest)."""

import math
import statistics
import sys

import bpy
from mathutils import Vector


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1:]
    src, out = args[0], args[1]

    def option(name, default):
        return args[args.index(name) + 1] if name in args else default

    drop = [w for w in option("--drop", "").lower().split(",") if w]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if src.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=src)
    else:
        bpy.ops.import_scene.gltf(filepath=src)
    meshes = []
    for o in list(bpy.context.scene.objects):
        if o.type != "MESH":
            continue
        if drop and any(m and any(d in m.name.lower() for d in drop) for m in o.data.materials):
            bpy.data.objects.remove(o)
            continue
        meshes.append(o)
    # Bake every transform into the vertices, and free the meshes of their parents (Sketchfab's nodes).
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.data.transform(mw)
        o.matrix_world.identity()
    for o in list(bpy.context.scene.objects):
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    pts = [v.co.copy() for o in meshes for v in o.data.vertices]
    zmin = min(p.z for p in pts)
    zmax = max(p.z for p in pts)
    H = zmax - zmin
    # The body's middle line: the chest's median across, near the middle of the box (a gun or a bag hanging at one
    # side, or arms held out unevenly, do not pull it).
    box_x = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    chest = [p.x for p in pts if zmin + 0.6 * H < p.z < zmin + 0.78 * H and abs(p.x - box_x) < 0.12 * H]
    xc = statistics.median(chest) if chest else box_x

    def at(share):
        return zmin + share * H

    def slab(lo, hi, side=0, near_x=None):
        """Points with z in [lo, hi] (shares of the height), on one side of the middle (+1 left, -1 right)."""
        out = []
        for p in pts:
            if not (at(lo) <= p.z <= at(hi)):
                continue
            if side and (p.x - xc) * side <= 0.01 * H:
                continue
            if near_x is not None and abs(p.x - near_x) > 0.09 * H:
                continue
            out.append(p)
        return out

    def median_point(ps, z):
        return Vector((statistics.median(p.x for p in ps), statistics.median(p.y for p in ps), z))

    joints = {}
    for side, name in ((1, "Left"), (-1, "Right")):
        knee = median_point(slab(0.25, 0.30, side), at(0.275))
        ankle = median_point(slab(0.045, 0.085, side, knee.x), at(0.065))
        shoe = slab(0.0, 0.04, side, ankle.x)
        toe = min(shoe, key=lambda p: p.y) if shoe else ankle + Vector((0, -0.08 * H, 0))
        hip = Vector((xc + side * max(0.045 * H, abs(knee.x - xc) * 0.85), knee.y, at(0.5)))
        joints[name + "UpLeg"] = hip
        joints[name + "Leg"] = knee
        joints[name + "Foot"] = ankle
        joints[name + "ToeBase"] = Vector((ankle.x * 0.5 + toe.x * 0.5, ankle.y * 0.4 + toe.y * 0.6, at(0.02)))
        joints[name + "Toe_End"] = Vector((toe.x, toe.y, at(0.02)))
    body_y = statistics.median(p.y for p in slab(0.6, 0.75) if abs(p.x - xc) < 0.08 * H)
    for name, share in (("Hips", 0.52), ("Spine", 0.58), ("Spine1", 0.65), ("Spine2", 0.72), ("Neck", 0.835), ("Head", 0.875)):
        joints[name] = Vector((xc, body_y, at(share)))
    joints["HeadTop_End"] = Vector((xc, body_y, zmax))
    for side, name in ((1, "Left"), (-1, "Right")):
        shoulder = Vector((xc + side * 0.1 * H, body_y, at(0.81)))
        # The hand: the farthest point of this side between the hips and the head (the fingertips).
        reach = [p for p in pts if at(0.4) < p.z < at(0.9) and (p.x - xc) * side > 0.12 * H]
        tip = max(reach, key=lambda p: (p.x - xc) * side) if reach else shoulder + Vector((side * 0.4 * H, 0, -0.1 * H))
        line = tip - shoulder

        def on_arm(share, radius=0.05):
            c = shoulder + line * share
            near = [p for p in pts if (p - c).length < radius * H]
            return sum(near, Vector()) / len(near) if near else c

        joints[name + "Shoulder"] = Vector((xc + side * 0.02 * H, body_y, at(0.8)))
        joints[name + "Arm"] = shoulder
        joints[name + "ForeArm"] = on_arm(0.45)
        joints[name + "Hand"] = on_arm(0.8, 0.035)
        joints[name + "HandMiddle1"] = shoulder + line * 0.9

    # The skeleton: (bone, head joint, tail joint, parent).
    chain = [
        ("Hips", "Hips", "Spine", None), ("Spine", "Spine", "Spine1", "Hips"), ("Spine1", "Spine1", "Spine2", "Spine"),
        ("Spine2", "Spine2", "Neck", "Spine1"), ("Neck", "Neck", "Head", "Spine2"), ("Head", "Head", "HeadTop_End", "Neck"),
    ]
    for s in ("Left", "Right"):
        chain += [
            (s + "Shoulder", s + "Shoulder", s + "Arm", "Spine2"), (s + "Arm", s + "Arm", s + "ForeArm", s + "Shoulder"),
            (s + "ForeArm", s + "ForeArm", s + "Hand", s + "Arm"), (s + "Hand", s + "Hand", s + "HandMiddle1", s + "ForeArm"),
            (s + "UpLeg", s + "UpLeg", s + "Leg", "Hips"), (s + "Leg", s + "Leg", s + "Foot", s + "UpLeg"),
            (s + "Foot", s + "Foot", s + "ToeBase", s + "Leg"), (s + "ToeBase", s + "ToeBase", s + "Toe_End", s + "Foot"),
        ]
    arm_data = bpy.data.armatures.new("Armature")
    rig = bpy.data.objects.new("Armature", arm_data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for bone, head, tail, parent in chain:
        b = arm_data.edit_bones.new(bone)
        b.head = joints[head]
        b.tail = joints[tail]
        if parent:
            b.parent = arm_data.edit_bones[parent]
    # The end bones the baker reads (fingertip, head top, toe tip), each a short bone on from its parent.
    for end, parent in (("HeadTop_End", "Head"), ("LeftHandMiddle1", "LeftHand"), ("RightHandMiddle1", "RightHand"),
                        ("LeftToe_End", "LeftToeBase"), ("RightToe_End", "RightToeBase")):
        p = arm_data.edit_bones[parent]
        b = arm_data.edit_bones.new(end)
        b.head = joints[end]
        b.tail = joints[end] + (p.tail - p.head).normalized() * 0.03 * H
        b.parent = p
    bpy.ops.object.mode_set(mode="OBJECT")
    segs = [(bone, joints[head], joints[tail]) for bone, head, tail, _ in chain]

    def allowed(bone, p):
        side = (p.x - xc) / H
        if bone.startswith("Left") and side < -0.02:
            return False
        if bone.startswith("Right") and side > 0.02:
            return False
        legs = "UpLeg" in bone or bone.endswith("Leg") or "Foot" in bone or "Toe" in bone
        if legs and p.z > at(0.53):
            return False
        arms = "Arm" in bone or "Hand" in bone
        if arms and abs(p.x - xc) < 0.085 * H and p.z > at(0.45):
            return False
        return True

    def dist(p, a, b):
        ab = b - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
        return (p - (a + ab * t)).length

    for o in meshes:
        for bone, _, _, _ in chain:
            o.vertex_groups.new(name=bone)
        groups = {g.name: g for g in o.vertex_groups}
        for v in o.data.vertices:
            p = v.co
            ranked = sorted(((dist(p, a, b), bone) for bone, a, b in segs if allowed(bone, p)))[:2]
            if not ranked:
                ranked = [(0.0, "Hips")]
            ws = [1.0 / (max(d, 0.004 * H) ** 4) for d, _ in ranked]
            total = sum(ws)
            for (d, bone), w in zip(ranked, ws):
                groups[bone].add([v.index], w / total, "REPLACE")
        o.parent = rig
        mod = o.modifiers.new("Armature", "ARMATURE")
        mod.object = rig
    print("autorig:", {k: [round(x, 3) for x in v] for k, v in joints.items() if k in ("Hips", "LeftArm", "LeftHand", "LeftLeg", "LeftFoot", "HeadTop_End")}, "height", round(H, 3))
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_skins=True, export_animations=False)
    preview = option("--preview", None)
    if preview:
        # A look at the bones over the model: the armature's joints as small spheres.
        glow = bpy.data.materials.new("joint")
        glow.use_nodes = True
        emit = glow.node_tree.nodes.new("ShaderNodeEmission")
        emit.inputs[0].default_value = (1.0, 0.85, 0.1, 1.0)
        emit.inputs[1].default_value = 6.0
        glow.node_tree.links.new(emit.outputs[0], glow.node_tree.nodes["Material Output"].inputs[0])
        for name, j in joints.items():
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.016 * H, location=j + Vector((0, -0.3 * H, 0)))
            bpy.context.object.name = "joint_" + name
            bpy.context.object.data.materials.append(glow)
        lo = Vector((xc - 0.6 * H, body_y, zmin))
        scene = bpy.context.scene
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 8
        scene.render.resolution_x = 400
        scene.render.resolution_y = 400
        world = bpy.data.worlds.new("w")
        scene.world = world
        world.use_nodes = True
        world.node_tree.nodes["Background"].inputs[1].default_value = 3.0
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
        scene.collection.objects.link(cam)
        scene.camera = cam
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = 1.3 * H
        cam.location = Vector((xc, body_y - 3 * H, zmin + 0.5 * H))
        cam.rotation_euler = (math.pi / 2, 0, 0)
        scene.render.filepath = preview
        bpy.ops.render.render(write_still=True)
        del lo


if __name__ == "__main__":
    main()
