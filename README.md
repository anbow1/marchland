# Marchland

A medieval real-time strategy game in TypeScript and three.js
(`WebGPURenderer`, WebGL2 fallback), built to [`BRIEF.md`](BRIEF.md) (the plan,
in Polish). You run a town against the computer: buildings on plots turn grain
into bread, pigs into sausages and hides, hides into armour, ore into weapons;
regiments of up to a hundred men a side fight in formation, with morale,
flanks, charges, archers, crossbows, ballistae and a trebuchet. Every name,
banner and faction is invented.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # economy, combat, archery, camera, whole games played headless
npm run build
```

Status: playable from the first building to the fall of a keep. The ground,
walls and roofs are scanned CC0 surfaces; soldiers, horses, engines, buildings
and trees are still geometry made in code. What comes next:
[`docs/GAMEPLAY.md`](docs/GAMEPLAY.md) (the gameplay plan and milestones),
[`docs/BLENDER.md`](docs/BLENDER.md) (models and animations to make in Blender,
with the file contract) and [`docs/ROUTINE.md`](docs/ROUTINE.md) (routine tasks
written out for a weaker model); what was measured is in [`RESULTS.md`](RESULTS.md).
All three documents are in Polish.

## Controls

| | Mouse and keyboard | Touch |
|---|---|---|
| Move the map | W A S D, arrows, the screen's edge, drag with the middle button | drag with one finger |
| Zoom | wheel (towards the cursor), + / − | pinch |
| Turn the camera | Q / E | — |
| Select | left click on a soldier or his card; drag a box; Shift adds; Ctrl+A the whole army | tap |
| Order a march | right click; twice for a run; drag to set the front | tap the ground; twice for a run |
| Order an attack | right click an enemy regiment, its card, a building or the keep | tap it |
| Halt | H | the Halt button |
| Build, upgrade, recruit | click a plot or a building in your town, then the panel | the same |
| Deselect / pause | Esc | Menu |
| Measurements | F3 | — |

## The town

One stock for the whole town. A building works when its inputs are in stock;
levels 2 and 3 work faster. Workers, townsfolk and soldiers eat rations (a loaf
is one, a sausage two); a starving town works at half speed, pays no tax and
its soldiers lose heart.

```
woodcutter ─ wood ─┬─ building, shields, engines
quarry ─ stone ────┘
field ─ grain ─┬─ bakery ─ bread
               ├─ pig farm ─┬─ meat ─ butcher ─ sausages
               │            └─ hides ─ tannery ─ leather armour
               └─ stable ─ horses
iron mine ─ ore ─┬─ smithy (+ wood) ─ weapons
                 └─ armourer ─ mail
wood ─ fletcher ─ bows and crossbows
house ─ tax in gold        keep ─ a small income
```

## The army

| Unit | Barracks | Needs, per man | For |
|---|---|---|---|
| Militia | 1 | wood (a shield) | cheap line, quick to run |
| Pikemen | 1 | weapon, leather | stopping cavalry |
| Archers | 1 | bow, leather | shooting to 80 m |
| Swordsmen | 2 | weapon, mail | winning the infantry fight |
| Halberdiers | 2 | weapon, mail | hitting hard, stopping horses |
| Crossbowmen | 2 | bow, leather, wood | bolts through mail, to 70 m |
| Light cavalry | 2 | horse, weapon, leather | archers, engines, pursuit |
| Heavy cavalry | 3 | horse, weapon, mail | the breaking charge |
| Ballistae (2) | 2 | wood 12, weapons 2 each | armour-piercing bolts to 110 m |
| Trebuchet (1) | 3 | wood 40, stone 10 | stones to 135 m, walls |

## Layout

- `src/sim/` — the game's rules, no three.js, fixed 60 Hz step, seeded: tested in Node.
- `src/render/` — scene, light, terrain, towns, armies; `src/app/` — camera, controls, the game loop; `src/ui/` — HUD, menus, sound, strings (Polish and English: `?lang=en`).
- `src/config.ts` — every tunable, with units.
- `src/assets/photo/` — the scanned surfaces and their licence; `tools/fetch_textures.py` downloads them again.

## Measuring

`?autostart` skips the menu, `&q=high|low` picks the preset, `&debug` exposes
`window.__debug.place({x, z, distance, yaw})` and `.spot('town' | 'rally' |
'field' | 'close' | 'enemy' | 'overview')`, `&scene=battle|town` starts in a
prepared situation, `&seed=` fixes the random numbers. The scripts in
`../tools/measure` run it as `--game generic`.
