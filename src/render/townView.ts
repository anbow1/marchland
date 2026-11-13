import { type BufferGeometry, Color, Mesh, MeshBasicNodeMaterial, type MeshStandardNodeMaterial, type Scene } from 'three/webgpu';
import { TOWN } from '../config.ts';
import type { Building } from '../sim/economy.ts';
import { heightAtM, townX, townZ } from '../sim/terrain.ts';
import { BUILDING_KINDS, type BuildingKind, type Side } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { buildingGeometry, keepGeometry } from './buildingGeometry.ts';
import { TEAM_HEX } from './palette.ts';
import { surfaceMaterial, type SurfaceLibrary } from './surfaces.ts';

// The two towns: a mesh for each place in a town's list of buildings and one
// per keep, all with one material. A mesh takes the geometry, the place and
// the facing of whatever stands in its slot; a building under construction
// rises out of the ground. Geometries are made once per kind, level and side
// and kept. The ghost is the building the player is about to place.

/** A building being built shows at least this share of its height. */
const MIN_BUILT_SHARE = 0.18;
const GHOST_OK = new Color(0x8fe07a);
const GHOST_BAD = new Color(0xe0604a);

export class TownView {
  private readonly material: MeshStandardNodeMaterial;
  private readonly cache = new Map<string, BufferGeometry>();
  private readonly slots: Mesh[][] = [[], []];
  private readonly shown: string[][] = [[], []];
  private readonly keeps: Mesh[] = [];
  private readonly ghost: Mesh;
  private readonly ghostMaterial: MeshBasicNodeMaterial;

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
      for (let slot = 0; slot < TOWN.maxBuildings; slot++) {
        const mesh = new Mesh(this.geometry('house', 1, side), this.material);
        mesh.name = `building ${side}/${slot}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.visible = false;
        scene.add(mesh);
        (this.slots[side] as Mesh[]).push(mesh);
        (this.shown[side] as string[]).push('');
      }
    }
    this.ghostMaterial = new MeshBasicNodeMaterial({ name: 'ghost', transparent: true, opacity: 0.55, depthWrite: false, fog: false });
    this.ghost = new Mesh(this.geometry('house', 1, 0), this.ghostMaterial);
    this.ghost.name = 'placement ghost';
    this.ghost.visible = false;
    this.ghost.renderOrder = 3;
    scene.add(this.ghost);
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

  /** Makes every geometry the player can call up, so the first click on a building does not hitch. */
  warm(): void {
    for (const side of [0, 1] as const satisfies readonly Side[]) {
      for (const kind of BUILDING_KINDS) {
        this.geometry(kind, 1, side);
      }
    }
  }

  /** Shows the building about to be placed (null hides it), green where it may stand and red where not. */
  setGhost(kind: BuildingKind | null, x: number, z: number, yawRad: number, allowed: boolean): void {
    this.ghost.visible = kind !== null;
    if (kind === null) return;
    this.ghost.geometry = this.geometry(kind, 1, 0);
    this.ghost.position.set(x, heightAtM(x, z) + 0.05, z);
    this.ghost.rotation.y = yawRad;
    this.ghostMaterial.color.copy(allowed ? GHOST_OK : GHOST_BAD);
  }

  update(world: World): void {
    for (const town of world.towns) {
      const side = town.side;
      const keep = this.keeps[side] as Mesh;
      // A fallen keep is a stump of its walls.
      keep.scale.y = town.keepHp > 0 ? 1 : 0.22;
      for (let slot = 0; slot < TOWN.maxBuildings; slot++) {
        const b: Building | null = town.plots[slot] ?? null;
        const mesh = (this.slots[side] as Mesh[])[slot] as Mesh;
        const shown = this.shown[side] as string[];
        const key = b ? `${b.kind}:${b.level}:${b.x.toFixed(1)}:${b.z.toFixed(1)}:${b.yawRad.toFixed(2)}` : '';
        if (key !== shown[slot]) {
          shown[slot] = key;
          mesh.visible = b !== null;
          if (b) {
            mesh.geometry = this.geometry(b.kind, b.level, side);
            mesh.position.set(b.x, heightAtM(b.x, b.z), b.z);
            mesh.rotation.y = b.yawRad;
          }
        }
        if (b) {
          const built = b.constructionTotalS > 0 ? 1 - b.constructionLeftS / b.constructionTotalS : 1;
          mesh.scale.y = MIN_BUILT_SHARE + (1 - MIN_BUILT_SHARE) * built;
        }
      }
    }
  }
}
