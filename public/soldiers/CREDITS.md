# Soldiers

- `knight.json` — the plate-armoured body (now only where a skinned body is missing), made by
  `tools/blender/soldiers.py` from **"Rigged Knight in Armor"** by **Xali** (BlendSwap,
  https://blendswap.com/blend/28541), licensed **CC0**: thinned to about 3 200 triangles, the arms
  brought down from the rest pose, materials as plain colours. Weapons, shields and the surcoat in the
  side's colours are the game's own.
- `swordsman.json` — the swordsmen's skinned body, made by `tools/blender/rigged.py` from
  **"knight for game project (old)"** by **Thomas.Osterhammel**
  (https://sketchfab.com/3d-models/knight-for-game-project-old), licensed **CC BY 4.0**: thinned to about
  3 400 triangles, colours taken from its texture. Its sword and shield are the game's own simple shapes.
  The strike, guard, idle, walk, run, flinch and two deaths are motion from **Mixamo** (Adobe),
  retargeted and baked into bone matrices; the raw animation files are not part of this repository.
- `halberdier.json` — the same knight with the game's own halberd (`rigged.py --arms halberd`), striking
  with Mixamo's "Upward Thrust", "Great Sword Attack" and "Great Sword Slash" by turns.
- `pikeman.json` — the pikemen, made by `rigged.py --arms pike` from **".Fuse Warrior"** by **Leonardo
  Carvalho** (Sketchfab), licensed **CC BY 4.0**: its sword and shield left out, the helmet kept, the
  upper armour dyed in the side's colour; the pike is the game's own. Motion from Mixamo ("Stabbing",
  "Rifle Walk" and the sword-and-shield set).
- `archer.json` — the archers, made by `rigged.py --arms bow` from **".Fuse Civilian 2"** by **Leonardo
  Carvalho** (Sketchfab), licensed **CC BY 4.0**: the tunic dyed in the side's colour; the bow is the
  game's own. Motion from Mixamo (the Longbow Aiming Pack and the sword-and-shield set).
- `rider.json` — the same knight seated in the saddle (`soldiers.py --seated`), for the light and heavy
  cavalry.
- `horse.json` — the cavalry's horse, made by `tools/blender/horse.py` from **"Armored Horse"** by
  **naminoff** (https://sketchfab.com/3d-models/armored-horse-98c3f1c40a6b422dba76bf5403e0a3d8), licensed
  **CC BY 4.0**: thinned to about 3 600 triangles, colours taken from its textures, legs walking in
  diagonal pairs about the shoulder and the hip.
