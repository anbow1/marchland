"""Adds a fall to the game's horse (public/soldiers/warhorse.json) from another take of a horse.

    bl/bin/python -I tools/blender/horsefall.py -- <warhorse source.gltf> <falling horse.gltf> <warhorse.json without a fall> <out.json> [last frame]

The fall of MAXDESIGN-3D's second "Horse" (its one take: frames 97 on, from standing at 96; the game uses up to
122, where it lies on its side) retargeted onto the game's horse. That file's bone matrices do not match what its
mesh does (a mirrored parent), so the turns are read from its joints instead: the hindquarters and the withers
from the hips or shoulders across and the spine along, each leg, neck and tail segment from its direction (head to
the next joint). Each bone of the game's horse takes its counterpart's turn since the standing frame, placed from
its parent down the game horse's own skeleton; the hips move as the other horse's do (scaled to the game horse's
hip height), and every frame is set back on the ground."""
import bpy, json, sys
import numpy as np
args = sys.argv[sys.argv.index('--') + 1:]
old_src, new_src, old_json, out = args[:4]
OLD_FRAME, NEW_REF, NEW_FIRST, NEW_LAST = 351, 96, 97, int(args[4]) if len(args) > 4 else 148
MAP = {
    'Hips_01': 'horse_031', 'Spine_02': 'horse_031', 'Spine1_03': 'horse_01', 'Spine3_05': 'horse_01',
    'Neck1_07': 'horse_02', 'Neck2_08': 'horse_03', 'Neck3_09': 'horse_03', 'Head_010': 'horse_04',
    'LeftScapula_023': 'horse_017', 'LeftShoulder_024': 'horse_017', 'LeftArm_025': 'horse_018', 'LeftForeArm_026': 'horse_019',
    'LeftHand_027': 'horse_020', 'LeftFingerBase_028': 'horse_021',
    'RightScapula_030': 'horse_022', 'RightArm_032': 'horse_023', 'RightForeArm_033': 'horse_024',
    'RightHand_034': 'horse_025', 'RightFingerBase_035': 'horse_026',
    'LeftUpLeg_037': 'horse_038', 'LeftLeg_038': 'horse_039', 'LeftFoot_039': 'horse_040', 'LeftToeBase_040': 'horse_041', 'LeftFootHoof_041': 'horse_042',
    'RightUpLeg_049': 'horse_033', 'RightLeg_050': 'horse_034', 'RightFoot_051': 'horse_035', 'RightToeBase_052': 'horse_036', 'RightFootHoof_053': 'horse_037',
    'Tail_043': 'horse_043', 'Tail1_044': 'horse_044', 'Tail2_045': 'horse_045', 'Tail3_046': 'horse_046', 'Tail4_047': 'horse_047',
}
data = json.load(open(old_json))
names = data['bones']
P = np.array([[-1, 0, 0], [0, 0, 1], [0, 1, 0]], float)  # Blender -> game (baked.py's P)

# The game's horse as baked: its kept bones at the reference frame, in game space (baked.py's T).
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=old_src)
sc = bpy.context.scene
sc.frame_set(OLD_FRAME)
dg = bpy.context.evaluated_depsgraph_get()
pts = []
for o in sc.objects:
    if o.type == 'MESH' and o.name != 'Icosphere':
        e = o.evaluated_get(dg); me = e.to_mesh(); pts += [tuple(e.matrix_world @ v.co) for v in me.vertices]; e.to_mesh_clear()
pts = np.array(pts)
floor, top = pts[:, 2].min(), pts[:, 2].max()
scale = 1.95 / (top - floor)
cx, cy = (pts[:, 0].min() + pts[:, 0].max()) / 2, (pts[:, 1].min() + pts[:, 1].max()) / 2
def to_game(v):
    return P @ ((np.array(v) - [cx, cy, floor]) * scale)
arm = [o for o in sc.objects if o.type == 'ARMATURE'][0]
W = arm.matrix_world.copy()
pb = {b.name: b for b in arm.pose.bones}
head = {n: to_game(W @ pb[n].head) for n in names}
parent = {}
for n in names:
    p = pb[n].parent
    while p is not None and p.name not in names:
        p = p.parent
    parent[n] = p.name if p is not None else None

# The other horse: world rotations of its bones (game axes) through the fall, and its hindquarters' path.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=new_src)
sc = bpy.context.scene
arm = [o for o in sc.objects if o.type == 'ARMATURE'][0]
pb = {b.name: b for b in arm.pose.bones}
# Its world: Z up, looking along +X, its left at +Y -> game: x = -y, y = z, z = -x.
C = np.array([[0, -1, 0], [0, 0, 1], [-1, 0, 0]], float)
def joints(f):
    sc.frame_set(f)
    W = arm.matrix_world
    return {n: C @ np.array(W @ b.head) for n, b in pb.items()}
def frame_of(side, fwd):
    x = side / np.linalg.norm(side)
    z = fwd - x * (fwd @ x); z /= np.linalg.norm(z)
    y = np.cross(z, x)
    return np.c_[x, y, z]
def turn(a, b):
    """The least rotation taking direction a onto b."""
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    v = np.cross(a, b); c = a @ b
    if np.linalg.norm(v) < 1e-9:
        return np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K / (1 + c)
# Each bone's turn from the joints: the trunk from its hips or shoulders across and its spine along; a limb or
# the tail from its segment's direction (head to its child's head), on top of the part it hangs from.
SEG = {'horse_017': 'horse_018', 'horse_018': 'horse_019', 'horse_019': 'horse_020', 'horse_020': 'horse_021',
       'horse_022': 'horse_023', 'horse_023': 'horse_024', 'horse_024': 'horse_025', 'horse_025': 'horse_026',
       'horse_038': 'horse_039', 'horse_039': 'horse_040', 'horse_040': 'horse_041', 'horse_041': 'horse_042',
       'horse_033': 'horse_034', 'horse_034': 'horse_035', 'horse_035': 'horse_036', 'horse_036': 'horse_037',
       'horse_043': 'horse_044', 'horse_044': 'horse_045', 'horse_045': 'horse_046', 'horse_046': 'horse_047', 'horse_047': 'horse_048',
       'horse_02': 'horse_03', 'horse_03': 'horse_04', 'horse_04': 'horse_07'}
def frames_at(f):
    j = joints(f)
    hind = frame_of(j['horse_038'] - j['horse_033'], j['horse_01'] - j['horse_032'])
    front = frame_of(j['horse_017'] - j['horse_022'], j['horse_02'] - j['horse_01'])
    seg = {n: j[c] - j[n] for n, c in SEG.items()}
    return hind, front, seg
def hips_at(f):
    sc.frame_set(f)
    return C @ np.array(arm.matrix_world @ pb['horse_031'].head)
sc.frame_set(NEW_REF)
lows = [(arm.matrix_world @ b.head).z for b in arm.pose.bones]
new_floor = min(lows)
new_scale = (head['Hips_01'][1]) / (hips_at(NEW_REF)[1] - new_floor)
REF = frames_at(NEW_REF)
TRUNK = {'horse_031': 0, 'horse_032': 0, 'horse_01': 1}
LIMB_ROOT = {'horse_017': 1, 'horse_018': 1, 'horse_019': 1, 'horse_020': 1, 'horse_021': 1,
             'horse_022': 1, 'horse_023': 1, 'horse_024': 1, 'horse_025': 1, 'horse_026': 1, 'horse_02': 1, 'horse_03': 1, 'horse_04': 1}
def deltas(f):
    hind, front, seg = frames_at(f)
    d = {'trunk0': hind @ REF[0].T, 'trunk1': front @ REF[1].T}
    out = {}
    for n in set(MAP.values()):
        if n in TRUNK:
            out[n] = d['trunk%d' % TRUNK[n]]
        elif n in SEG:
            out[n] = turn(REF[2][n], seg[n])
        else:  # a hoof tip, the last of the tail: as the segment above it
            above = next(k for k, c in SEG.items() if c == n)
            out[n] = turn(REF[2][above], seg[above])
    return out
hips_ref = hips_at(NEW_REF)
order = []
def visit(n):
    if n in order:
        return
    if parent[n]:
        visit(parent[n])
    order.append(n)
for n in names:
    visit(n)
pos = np.array(data['positions']).reshape(-1, 3)
skin = np.array(data['skin']).reshape(-1, 4); wts = np.array(data['weights']).reshape(-1, 4)
hom = np.c_[pos, np.ones(len(pos))]
out_frames = []
for f in range(NEW_FIRST, NEW_LAST):
    delta = deltas(f)
    move = (hips_at(f) - hips_ref) * new_scale
    posed_rot, posed_head, mats = {}, {}, {}
    for n in order:
        src = MAP.get(n)
        if src is None:  # eyes, ears, mouth: with the head
            src = MAP['Head_010'] if parent[n] else MAP['Hips_01']
        d = delta[src]
        if parent[n] is None:
            h = head[n] + move
        else:
            p = parent[n]
            h = posed_head[p] + posed_rot[p] @ (head[n] - head[p])
        posed_rot[n], posed_head[n] = d, h
        mats[n] = np.c_[d, h - d @ head[n]]
    M = np.array([mats[n] for n in names])
    skinned = sum(wts[:, i:i + 1] * np.einsum('vij,vj->vi', M[skin[:, i]], hom) for i in range(4))
    M[:, 1, 3] -= skinned[:, 1].min()  # on the ground
    if (f - NEW_FIRST) % 10 == 0:
        print('frame', f, 'y', round(skinned[:, 1].min(), 2), round(skinned[:, 1].max(), 2), 'hips up', (posed_rot['Hips_01'] @ [0, 1, 0]).round(2), 'front up', (posed_rot['Spine3_05'] @ [0, 1, 0]).round(2))
    out_frames += [round(float(x), 4) for x in M.ravel()]
nb = len(names)
start = len(data['frames']) // (12 * nb)
data['frames'] += out_frames
data['clips'] = [c for c in data['clips'] if c['name'] != 'fall'] + [{'name': 'fall', 'start': start, 'frames': NEW_LAST - NEW_FIRST, 'fps': float(sc.render.fps), 'travelM': 0.0}]
json.dump(data, open(out, 'w'), separators=(',', ':'))
print('scale new', round(new_scale, 5), 'clip', data['clips'][-1])
