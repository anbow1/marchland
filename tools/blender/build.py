"""Builds Marchland's buildings as .glb files and an index of them.

    bl/bin/python tools/blender/build.py public/buildings              # every kind, levels 1-3
    bl/bin/python tools/blender/build.py public/buildings woodcutter   # one kind

Each file holds the building (one mesh, materials named after the game's surfaces), its moving parts
as further meshes named after the part (origin at the pivot), and empties named 'smoke' where smoke
rises. index.json lists the files with their triangle counts."""

import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from buildings import BUILDERS  # noqa: E402
from kit import Kit, export_glb  # noqa: E402

BUDGET = 12000


def build(kind: str, level: int, path: str) -> int:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    k = Kit(seed=sum(map(ord, kind)) * 7 + level)
    moving = BUILDERS[kind](k, level)
    tris = k.triangles()
    k.to_object(f"{kind}_{level}")
    for name, (part, pivot) in moving.items():
        tris += part.triangles()
        obj = part.to_object(name)
        obj.location = pivot
    for i, (x, y, z) in enumerate(k.smoke):
        empty = bpy.data.objects.new(f"smoke_{i}", None)
        empty.location = (x, y, z)
        bpy.context.scene.collection.objects.link(empty)
    export_glb(path)
    return tris


def main() -> None:
    out = sys.argv[1]
    kinds = sys.argv[2:] or list(BUILDERS)
    os.makedirs(out, exist_ok=True)
    index_path = os.path.join(out, "index.json")
    index = json.load(open(index_path)) if os.path.exists(index_path) else {}
    for kind in kinds:
        for level in (1, 2, 3):
            name = f"{kind}_{level}.glb"
            tris = build(kind, level, os.path.join(out, name))
            index[f"{kind}:{level}"] = {"file": name, "triangles": tris}
            flag = "" if tris <= BUDGET else f"  OVER BUDGET ({BUDGET})"
            print(f"{kind} {level}: {tris} triangles{flag}")
    with open(index_path, "w") as f:
        json.dump(dict(sorted(index.items())), f, indent=1)


main()
