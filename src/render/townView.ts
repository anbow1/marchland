import { type BufferGeometry, Mesh, type MeshStandardNodeMaterial, type Scene } from 'three/webgpu';
import { TOWN } from '../config.ts';
import type { Building } from '../sim/economy.ts';
import { heightAtM, plotX, plotZ, townX, townZ } from '../sim/terrain.ts';
import type { BuildingKind, Side } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { buildingGeometry, keepGeometry } from './buildingGeometry.ts';
import { TEAM_HEX } from './palette.ts';
import { surfaceMaterial, type SurfaceLibrary } from './surfaces.ts';

// The two towns: a mesh per plot and one per keep, all with one material. A
// plot's mesh takes the geometry of whatever stands on it; a building under
// construction rises out of the ground. Geometries are made once per kind,
// level and side and kept.

/** A building being built shows at least this share of its height. */
const MIN_BUILT_SHARE = 0.18;

export class TownView {
  private readonly material: MeshStandardNodeMaterial;
  private readonly cache = new Map<string, BufferGeometry>();
  private readonly plots: Mesh[][] = [[], []];
  private readonly shown: string[][] = [[], []];
  private readonly keeps: Mesh[] = [];

  constructor(
    scene: Scene,
    private readonly lib: SurfaceLibrary,
  ) {
    this.material = surfaceMaterial(lib, 'building');
    for (const side of [0, 1] as const satisfies readonly Side[]) {
      const tx = townX(side);
      const tz = townZ(side);
      const keep = new Mesh(keepGeometry(TEAM_HEX[side], lib), this.material);
      keep.name = `keep ${side}`;
      keep.position.set(tx, heightAtM(tx, tz), tz);
      // Banner and gate towards the enemy.
      keep.rotation.y = side === 0 ? Math.PI / 4 : -Math.PI * 0.75;
      keep.castShadow = true;
      keep.receiveShadow = true;
      scene.add(keep);
      this.keeps.push(keep);
      for (let plot = 0; plot < TOWN.plotCount; plot++) {
        const x = plotX(side, plot);
        const z = plotZ(side, plot);
        const mesh = new Mesh(this.geometry('house', 1, side), this.material);
        mesh.name = `plot ${side}/${plot}`;
        mesh.position.set(x, heightAtM(x, z), z);
        // Doors face the keep.
        mesh.rotation.y = Math.atan2(tx - x, tz - z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.visible = false;
        scene.add(mesh);
        (this.plots[side] as Mesh[]).push(mesh);
        (this.shown[side] as string[]).push('');
      }
    }
  }

  private geometry(kind: BuildingKind, level: number, side: Side): BufferGeometry {
    const key = `${kind}:${level}:${side}`;
    let g = this.cache.get(key);
    if (!g) {
      g = buildingGeometry(kind, level, TEAM_HEX[side], this.lib);
      this.cache.set(key, g);
    }
    return g;
  }

  update(world: World): void {
    for (const town of world.towns) {
      const side = town.side;
      const keep = this.keeps[side] as Mesh;
      // A fallen keep is a stump of its walls.
      keep.scale.y = town.keepHp > 0 ? 1 : 0.22;
      for (let plot = 0; plot < TOWN.plotCount; plot++) {
        const b: Building | null = town.plots[plot] ?? null;
        const mesh = (this.plots[side] as Mesh[])[plot] as Mesh;
        const shown = this.shown[side] as string[];
        const key = b ? `${b.kind}:${b.level}` : '';
        if (key !== shown[plot]) {
          shown[plot] = key;
          mesh.visible = b !== null;
          if (b) mesh.geometry = this.geometry(b.kind, b.level, side);
        }
        if (b) {
          const built = b.constructionTotalS > 0 ? 1 - b.constructionLeftS / b.constructionTotalS : 1;
          mesh.scale.y = MIN_BUILT_SHARE + (1 - MIN_BUILT_SHARE) * built;
        }
      }
    }
  }
}
