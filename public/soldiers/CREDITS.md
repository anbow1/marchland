# Soldiers

- `knight.json` — the plate-armoured body of the swordsmen and halberdiers, made by
  `tools/blender/soldiers.py` from **"Rigged Knight in Armor"** by **Xali** (BlendSwap,
  https://blendswap.com/blend/28541), licensed **CC0**: thinned to about 3 200 triangles, the arms
  brought down from the rest pose, materials as plain colours. Weapons, shields and the surcoat in the
  side's colours are the game's own.
- `swordsman.json` — the swordsmen's skinned body, made by `tools/blender/rigged.py` from
  **"knight for game project (old)"** by **Thomas.Osterhammel**
  (https://sketchfab.com/3d-models/knight-for-game-project-old), licensed **CC BY 4.0**: thinned to about
  3 400 triangles, colours taken from its texture. Its sword and shield are the game's own simple shapes.
  The strike and the guard are motion from **Mixamo** (Adobe), retargeted and baked into bone matrices;
  the raw animation files are not part of this repository.
- `rider.json` — the same knight seated in the saddle (`soldiers.py --seated`), for the light and heavy
  cavalry.
- `horse.json` — the cavalry's horse, made by `tools/blender/horse.py` from **"Armored Horse"** by
  **naminoff** (https://sketchfab.com/3d-models/armored-horse-98c3f1c40a6b422dba76bf5403e0a3d8), licensed
  **CC BY 4.0**: thinned to about 3 600 triangles, colours taken from its textures, legs walking in
  diagonal pairs about the shoulder and the hip.
