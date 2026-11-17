# People

- `smith.json` — the smith at the smelter, smithy and armourer, made by `tools/blender/baked.py` from
  **"BlackSmith"** by **celestin.bitternose** (https://sketchfab.com/3d-models/blacksmith-d5b3e805c6344a2eb97cbde5afa6c47c),
  licensed **CC BY 4.0**: thinned to about 3 000 triangles, colours from its textures, its own animation
  (a round of the workshop) sampled at 12 frames a second, 40 bones.
- `townsman.json` — the carriers, workers and builders, made by `tools/blender/rigged.py --arms none
  --tris 1200 --step 2` from **".Fuse Civilian 2"** by **Leonardo Carvalho** (Sketchfab), licensed
  **CC BY 4.0**, the tunic partly in the side's colour. Motion from **Mixamo** (Box Walk, Box Idle,
  Picking Up, Putting Down, Digging, Fishing Cast, Walking, Great Sword Attack as the axe's chop, Heavy Weapon Swing as the mallet's, Harvesting, a standing idle); the axe and mallet are the game's own,
  retargeted and baked; the raw animation files are not part of this repository.
- `townswoman.json` — every third person in the towns, made by `tools/blender/rigged.py --arms tools --tris 1600
  --step 2 --team Image_3 --team-share 0.15` from **"Virtual model wool tunic & twintail & slim Revna"** by
  **ChamberSu1996** (Sketchfab), licensed **CC BY 4.0**: on Unreal's skeleton, read as Mixamo's; the same Mixamo
  motion as the townsman; her wool tunic takes a little of the side's colour.
- `townsman-beard.json` — from **".Fuse Civilian 1"** by **Leonardo Carvalho** (Sketchfab), **CC BY 4.0**, the
  top a little in the side's colour; `townsman-wool.json` and `townsman-linen.json` — from **"Virtual model wool
  tunic Svend"** and **"Virtual model linen tunic Svend"** by **ChamberSu1996** (Sketchfab), **CC BY 4.0** (a mesh
  exported with a bind far from the body, his hair or a beard, is left out). All baked as the townsman, same
  clips; the men take turns among the four bodies.
