"""Building parts for Marchland's buildings, made in Blender from code.

Run with Blender's Python (bpy), for example:
    python -m venv bl && bl/bin/pip install bpy==5.3.0
    bl/bin/python tools/blender/build.py house 1 out/house_1.glb

The model gets no textures of its own: every face carries a material named after one of the game's
scanned surfaces (plaster, beam, boards, shingles, thatch, rubble, ashlar, ...), and the game lays its
own scans on them (docs/BLENDER.md, materials way 1). A name may end in '#rrggbb', a tint.
Units are metres; the front (the door) looks along -Y, as in Blender's Front view; the middle of the
footprint is at the origin and the ground at z = 0.
"""

import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector


class Kit:
    """Collects faces into one bmesh, each with the material named after its surface."""

    def __init__(self, seed: int) -> None:
        self.bm = bmesh.new()
        self.materials: list[str] = []
        self.rng = random.Random(seed)
        # Marks handed out so far (see mark()); 0 means "not yet stamped".
        self.counter = 1
        # Points the game puts smoke on (chimneys, furnaces, charcoal), in the model's own space.
        self.smoke: list[tuple[float, float, float]] = []

    def _mat(self, name: str) -> int:
        if name not in self.materials:
            self.materials.append(name)
        return self.materials.index(name)

    def jitter(self, amount: float) -> float:
        return self.rng.uniform(-amount, amount)

    # ---- primitives ---------------------------------------------------------

    def box(self, cx, cy, z0, sx, sy, sz, surface, turn=0.0, bevel=0.0, tilt=(0.0, 0.0)):
        """A box sx x sy x sz standing on z0 at (cx, cy), turned about Z, optionally tilted (about X, Y) and bevelled."""
        geom = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = geom["verts"]
        m = Matrix.Translation((cx, cy, z0 + sz / 2)) @ Matrix.Rotation(turn, 4, "Z") @ Matrix.Rotation(tilt[1], 4, "Y") @ Matrix.Rotation(tilt[0], 4, "X") @ Matrix.Diagonal((sx, sy, sz, 1))
        bmesh.ops.transform(self.bm, matrix=m, verts=verts)
        self._finish(verts, surface, bevel)
        return verts

    def beam(self, a, b, width, depth, surface, bevel=0.025):
        """A squared timber from point a to point b (a brace, a rafter, a post)."""
        a = Vector(a)
        b = Vector(b)
        axis = b - a
        length = axis.length
        geom = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = geom["verts"]
        # Cube's local Z becomes the timber's axis.
        z = axis.normalized()
        x = Vector((0, 0, 1)).cross(z)
        if x.length < 1e-4:
            x = Vector((1, 0, 0))
        x.normalize()
        y = z.cross(x)
        rot = Matrix((x, y, z)).transposed().to_4x4()
        m = Matrix.Translation((a + b) / 2) @ rot @ Matrix.Diagonal((width, depth, length, 1))
        bmesh.ops.transform(self.bm, matrix=m, verts=verts)
        self._finish(verts, surface, bevel)

    def cylinder(self, cx, cy, z0, r0, r1, height, sides, surface, bevel=0.0):
        geom = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=sides, radius1=r0, radius2=r1, depth=height)
        verts = geom["verts"]
        bmesh.ops.translate(self.bm, vec=(cx, cy, z0 + height / 2), verts=verts)
        self._finish(verts, surface, bevel)
        return verts if bevel == 0 else []

    def prism(self, points, depth, surface, axis="y"):
        """A flat polygon (x, z pairs in the wall's plane) given thickness `depth` along Y (a gable's infill)."""
        verts_front = [self.bm.verts.new((p[0], -depth / 2, p[1])) for p in points]
        verts_back = [self.bm.verts.new((p[0], depth / 2, p[1])) for p in points]
        faces = [self.bm.faces.new(verts_front[::-1]), self.bm.faces.new(verts_back)]
        n = len(points)
        for i in range(n):
            j = (i + 1) % n
            faces.append(self.bm.faces.new((verts_front[i], verts_front[j], verts_back[j], verts_back[i])))
        index = self._mat(surface)
        for f in faces:
            f.material_index = index
        return verts_front + verts_back

    def slab(self, corners, thick, surface, edge_surface=None):
        """A roof plane with thickness: four corners (counter-clockwise from outside), pushed out along its normal."""
        c = [Vector(p) for p in corners]
        normal = (c[1] - c[0]).cross(c[3] - c[0]).normalized()
        top = [self.bm.verts.new(p + normal * thick) for p in c]
        bottom = [self.bm.verts.new(p) for p in c]
        index = self._mat(surface)
        edge = self._mat(edge_surface or surface)
        f = self.bm.faces.new(top)
        f.material_index = index
        f = self.bm.faces.new(bottom[::-1])
        f.material_index = edge
        for i in range(4):
            j = (i + 1) % 4
            f = self.bm.faces.new((bottom[i], bottom[j], top[j], top[i]))
            f.material_index = edge

    def _finish(self, verts, surface, bevel):
        index = self._mat(surface)
        faces = {f for v in verts for f in v.link_faces}
        for f in faces:
            f.material_index = index
        if bevel > 0:
            edges = list({e for v in verts for e in v.link_edges})
            # The bevel's new faces take the material of the faces they were cut from.
            bmesh.ops.bevel(self.bm, geom=edges, offset=bevel, segments=1, affect="EDGES", profile=0.5, clamp_overlap=True)

    def mark(self) -> int:
        """Starts a group: build something, then move everything made since with move_since.

        Vertices are stamped with the mark that was current when they were made, not counted by index:
        a bevel deletes and re-creates vertices, which would shift any index. A vertex made after the
        latest mark has no stamp (0) until the next mark stamps it; marks may nest."""
        layer = self._serial()
        token = self.counter
        self.counter += 1
        for v in self.bm.verts:
            if v[layer] == 0:
                v[layer] = token
        return token

    def move_since(self, mark: int, m) -> None:
        layer = self._serial()
        verts = [v for v in self.bm.verts if v[layer] == 0 or v[layer] > mark]
        bmesh.ops.transform(self.bm, matrix=m, verts=verts)

    def _serial(self):
        return self.bm.verts.layers.int.get("serial") or self.bm.verts.layers.int.new("serial")

    def place(self, verts, m):
        bmesh.ops.transform(self.bm, matrix=m, verts=verts)

    # ---- output -------------------------------------------------------------

    def split_off(self) -> "Kit":
        """A fresh kit for a separate moving part (a mill's sails); shares the random numbers."""
        part = Kit(0)
        part.rng = self.rng
        return part

    def to_object(self, name: str):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(name)
        self.bm.to_mesh(mesh)
        for surface in self.materials:
            mat = bpy.data.materials.get(surface) or bpy.data.materials.new(surface)
            mesh.materials.append(mat)
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj

    def triangles(self) -> int:
        return sum(len(f.verts) - 2 for f in self.bm.faces)


def export_glb(path: str) -> None:
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True, export_materials="EXPORT", export_normals=True, export_texcoords=False, export_extras=False)
