import { type BufferGeometry, Color, Mesh, MeshBasicNodeMaterial, type MeshStandardNodeMaterial, type Scene } from 'three/webgpu';
import { TOWN } from '../config.ts';
import type { Building } from '../sim/economy.ts';
import { heightAtM, townX, townZ } from '../sim/terrain.ts';
import { BUILDING_KINDS, type BuildingKind, type Side } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildingGeometry, keepGeometry } from './buildingGeometry.ts';
import { surfacePaint } from './buildingParts.ts';
import { MeshBuilder } from './meshBuilder.ts';
import { type SurfaceModel, surfaceModel } from './surfaceModel.ts';
import { TEAM_HEX } from './palette.ts';
import { freshUrl } from '../version.ts';
import { surfaceMaterial, type SurfaceLibrary } from './surfaces.ts';

// The two towns: a mesh for each place in a town's list of buildings and one
// per keep, all with one material. A kind with a model from Blender
// (public/buildings, made by tools/blender/build.py) is drawn with it, its
// moving part (a mill's sails) turning while it works; the others with the
// shapes from code in buildingGeometry.ts. A mesh takes the geometry, the place and
// the facing of whatever stands in its slot; a building under construction
// rises out of the ground. Geometries are made once per kind, level and side
// and kept. The ghost is the building the player is about to place.

/** A building being built shows at least this share of its height. */
const MIN_BUILT_SHARE = 0.18;
const GHOST_OK = new Color(0x8fe07a);
/** A post mill's sails at work: about one turn every seven seconds. */
const SAIL_TURN_RAD_S = 0.9;
const GHOST_BAD = new Color(0xe0604a);
/** The keep's size at levels 1…3: the same castle, its walls and towers taller and wider as it is raised. */
const KEEP_SCALE = [0.8, 0.9, 1];

export class TownView {
  private readonly material: MeshStandardNodeMaterial;
  private readonly cache = new Map<string, BufferGeometry>();
  private readonly slots: Mesh[][] = [[], []];
  private readonly shown: string[][] = [[], []];
  private readonly keeps: Mesh[] = [];
  private readonly ghost: Mesh;
  /** Models from Blender by kind, level and side; empty until loadModels() has run. */
  private readonly models = new Map<string, SurfaceModel>();
  /** The moving part of each slot's building, shown when its model has one. */
  private readonly movers: Mesh[][] = [[], []];
  /** A rubble-stone plinth under each building, filling the gap where the ground falls away on a slope. */
  private readonly plinths: Mesh[][] = [[], []];
  private plinthCache: BufferGeometry | null = null;

  /** A rubble-stone block, 8.6 m square and 1 m deep below its top (scaled down to the ground by each building). */
  private get plinthGeometry(): BufferGeometry {
    if (!this.plinthCache) {
      const stone = 0x8a8478;
      const b = new MeshBuilder(0, new Map([[stone, surfacePaint(this.lib, 'rubble')]]));
      b.box(0, -1, 0, 8.6, 1, 8.6, stone);
      this.plinthCache = b.build();
    }
    return this.plinthCache;
  }
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
        const mover = new Mesh(this.geometry('house', 1, side), this.material);
        mover.castShadow = true;
        mover.visible = false;
        mesh.add(mover);
        (this.movers[side] as Mesh[]).push(mover);
        const plinth = new Mesh(this.plinthGeometry, this.material);
        plinth.name = `plinth ${side}/${slot}`;
        plinth.castShadow = true;
        plinth.receiveShadow = true;
        plinth.visible = false;
        scene.add(plinth);
        (this.plinths[side] as Mesh[]).push(plinth);
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

  /**
   * Loads every model listed in `<base>buildings/index.json`. A model that fails to load leaves its
   * kind on the shapes from code, with a warning: the game is playable without them.
   */
  async loadModels(base: string): Promise<number> {
    const response = await fetch(freshUrl(base, 'buildings/index.json'));
    if (!response.ok) {
      console.warn(`[models] no index at ${base}buildings/index.json (${response.status}): buildings keep their shapes from code`);
      return 0;
    }
    const index = (await response.json()) as Record<string, { file: string }>;
    const loader = new GLTFLoader();
    const jobs = Object.entries(index).map(async ([key, entry]) => {
      const [kind, level] = key.split(':') as [BuildingKind, string];
      if ((kind as string) === 'keep') {
        // The keep from Buckstone Castle (tools/blender/keep.py): one model, both sides, each its own flag.
        try {
          const gltf = await loader.loadAsync(freshUrl(base, `buildings/${entry.file}`));
          for (const side of [0, 1] as const satisfies readonly Side[]) (this.keeps[side] as Mesh).geometry = surfaceModel(gltf.scene, this.lib, TEAM_HEX[side]).body;
        } catch (error) {
          console.warn(`[models] ${entry.file} did not load: ${String(error)}`);
        }
        return;
      }
      if (!(BUILDING_KINDS as readonly string[]).includes(kind)) return;
      try {
        const gltf = await loader.loadAsync(freshUrl(base, `buildings/${entry.file}`));
        for (const side of [0, 1] as const satisfies readonly Side[]) this.models.set(`${kind}:${level}:${side}`, surfaceModel(gltf.scene, this.lib, TEAM_HEX[side]));
      } catch (error) {
        console.warn(`[models] ${entry.file} did not load: ${String(error)}`);
      }
    });
    await Promise.all(jobs);
    // Shown buildings pick up their models at the next update.
    for (const shown of this.shown) shown.fill('');
    return this.models.size / 2;
  }

  private geometry(kind: BuildingKind, level: number, side: Side): BufferGeometry {
    const key = `${kind}:${level}:${side}`;
    const model = this.models.get(key);
    if (model) return model.body;
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
    this.ghost.position.set(x, groundUnder(x, z, yawRad)[1] + 0.05, z);
    this.ghost.rotation.y = yawRad;
    this.ghostMaterial.color.copy(allowed ? GHOST_OK : GHOST_BAD);
  }

  /**
   * Writes x, y, z of every point smoke rises from now into `out`; returns how many. A house smokes
   * while people live in it; a workshop while someone works there; the smelter's clamp always.
   */
  smokeSources(world: World, out: Float32Array): number {
    let n = 0;
    const capacity = out.length / 3;
    for (const town of world.towns) {
      for (const b of town.plots) {
        if (!b || b.constructionLeftS > 0) continue;
        const model = this.models.get(`${b.kind}:${b.level}:${town.side}`);
        if (!model || model.smoke.length === 0) continue;
        const busy = b.kind === 'house' ? b.residents > 0 : b.workRate > 0 || b.kind === 'smelter';
        if (!busy) continue;
        const y = groundUnder(b.x, b.z, b.yawRad)[1];
        const cos = Math.cos(b.yawRad);
        const sin = Math.sin(b.yawRad);
        for (const point of model.smoke) {
          if (n >= capacity) return n;
          out[n * 3] = b.x + point.x * cos + point.z * sin;
          out[n * 3 + 1] = y + point.y;
          out[n * 3 + 2] = b.z - point.x * sin + point.z * cos;
          n++;
        }
      }
    }
    return n;
  }

  update(world: World, frameSeconds = 0): void {
    for (const town of world.towns) {
      const side = town.side;
      const keep = this.keeps[side] as Mesh;
      // The keep grows with its level; a fallen one is a stump of its walls.
      const size = KEEP_SCALE[town.keepLevel - 1] ?? 1;
      keep.scale.set(size, town.keepHp > 0 ? size : 0.22, size);
      for (let slot = 0; slot < TOWN.maxBuildings; slot++) {
        const b: Building | null = town.plots[slot] ?? null;
        const mesh = (this.slots[side] as Mesh[])[slot] as Mesh;
        const shown = this.shown[side] as string[];
        const key = b ? `${b.kind}:${b.level}:${b.x.toFixed(1)}:${b.z.toFixed(1)}:${b.yawRad.toFixed(2)}` : '';
        if (key !== shown[slot]) {
          shown[slot] = key;
          mesh.visible = b !== null;
          if (!b) ((this.plinths[side] as Mesh[])[slot] as Mesh).visible = false;
          const mover = (this.movers[side] as Mesh[])[slot] as Mesh;
          mover.visible = false;
          if (b) {
            mesh.geometry = this.geometry(b.kind, b.level, side);
            // On a slope the building stands on the highest ground under it (no wall sinks into the hill);
            // a plinth of rubble stone fills in down to the lowest.
            const [low, high] = groundUnder(b.x, b.z, b.yawRad);
            mesh.position.set(b.x, high, b.z);
            mesh.rotation.y = b.yawRad;
            const plinth = (this.plinths[side] as Mesh[])[slot] as Mesh;
            plinth.visible = high - low > 0.4;
            plinth.position.set(b.x, high + 0.02, b.z);
            plinth.rotation.y = b.yawRad;
            // A watchtower stands on a narrower footing than a house.
            const wide = b.kind === 'tower' ? 0.62 : 1;
            plinth.scale.set(wide, high - low + 0.4, wide);
            const part = this.models.get(`${b.kind}:${b.level}:${side}`)?.parts[0];
            if (part) {
              mover.geometry = part.geometry;
              mover.position.copy(part.pivot);
              mover.visible = true;
            }
          }
        }
        if (b) {
          // Sails turn while the mill grinds.
          const mover = (this.movers[side] as Mesh[])[slot] as Mesh;
          if (mover.visible && b.cycleStarted && b.workRate > 0 && b.constructionLeftS <= 0) mover.rotation.z += frameSeconds * SAIL_TURN_RAD_S * b.workRate;
          const built = b.constructionTotalS > 0 ? 1 - b.constructionLeftS / b.constructionTotalS : 1;
          mesh.scale.y = MIN_BUILT_SHARE + (1 - MIN_BUILT_SHARE) * built;
        }
      }
    }
  }
}

/**
 * The lowest and highest ground under a building's footprint (a square about 8 m across, turned with it),
 * from nine points: its floor goes at the highest.
 */
export function groundUnder(x: number, z: number, yawRad: number): [number, number] {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  for (const a of [-3.8, 0, 3.8]) {
    for (const b of [-3.8, 0, 3.8]) {
      const h = heightAtM(x + a * c + b * s, z - a * s + b * c);
      low = Math.min(low, h);
      high = Math.max(high, h);
    }
  }
  return [low, high];
}
