import { Box3, BufferAttribute, BufferGeometry, Color, Mesh, Vector3, MeshBasicNodeMaterial, type MeshStandardNodeMaterial, type Node, type Scene } from 'three/webgpu';
import { CAMPAIGN, TOWN } from '../config.ts';
import { fortressFrame, fortressPoint } from '../sim/fortress.ts';
import type { Building } from '../sim/economy.ts';
import { HAS_FORTRESS, heightAtM, townX, townZ } from '../sim/terrain.ts';
import { BUILDING_KINDS, type BuildingKind, type Side } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { dot, mix, positionWorld, uniform, vec3 } from 'three/tsl';
import { buildingGeometry, keepGeometry } from './buildingGeometry.ts';
import { type PropModel, setCannonModel, setPigModel, surfacePaint } from './buildingParts.ts';
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
// the facing of whatever stands in its slot. A building under construction is
// built up: first its footings, then its walls rise course by course inside a
// scaffold, the roof last (the same model cut off at the height reached, by one
// material that discards what is above each site's own cut). Geometries are made once per kind, level and side
// and kept. The ghost is the building the player is about to place.

/** The first share of a building's work lays its footings, this high; after that the walls rise to the roof. */
const FOOTING_SHARE = 0.12;
const FOOTING_M = 0.35;
/** The scaffold stands this far out from the walls and reaches this far above the courses laid. */
const SCAFFOLD_OUT_M = 0.55;
const SCAFFOLD_AHEAD_M = 1.4;
const SCAFFOLD_POLE = 0x7a5e44;
const SCAFFOLD_PLANK = 0x9a7a56;
/** No cut: a site's object without one is drawn whole. */
const UNCUT = 1e6;
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
  /** Building sites: the buildings' own material, cut off above each site's height reached (`userData.cutY`). */
  private readonly siteMaterial: MeshStandardNodeMaterial;
  /** Each slot's scaffold, shown while its building goes up; geometries by the building's size. */
  private readonly scaffolds: Mesh[][] = [[], []];
  private readonly scaffoldCache = new Map<string, BufferGeometry>();

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
    private readonly scene: Scene,
    private readonly lib: SurfaceLibrary,
  ) {
    this.material = surfaceMaterial(lib, 'building');
    this.siteMaterial = surfaceMaterial(lib, 'building site');
    const cut = uniform(UNCUT).onObjectUpdate((frame) => (frame.object?.userData['cutY'] as number | undefined) ?? UNCUT);
    this.siteMaterial.maskNode = positionWorld.y.lessThan(cut);
    // A site not yet finished is drawn grey (its own colours washed out), so it reads as unbuilt at a glance;
    // it takes its colours when the last course is laid.
    const own = this.siteMaterial.colorNode as Node<'vec3'>;
    const grey = dot(own, vec3(0.299, 0.587, 0.114)).mul(1.1);
    this.siteMaterial.colorNode = mix(own, vec3(grey), 0.85);
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
        const scaffold = new Mesh(this.geometry('house', 1, side), this.siteMaterial);
        scaffold.castShadow = true;
        scaffold.visible = false;
        mesh.add(scaffold);
        (this.scaffolds[side] as Mesh[]).push(scaffold);
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
   * A scaffold about a building of this size: poles a little out from its walls, a plank walk with a rail
   * along every side at each storey's height, up to the eaves.
   */
  private scaffoldGeometry(box: Box3 | null): BufferGeometry {
    const [x0, x1, z0, z1, top] = box
      ? [box.min.x - SCAFFOLD_OUT_M, box.max.x + SCAFFOLD_OUT_M, box.min.z - SCAFFOLD_OUT_M, box.max.z + SCAFFOLD_OUT_M, Math.max(2.4, box.max.y * 0.8)]
      : [-4, 4, -4, 4, 4];
    const key = [x0, x1, z0, z1, top].map((v) => v.toFixed(1)).join(':');
    const cached = this.scaffoldCache.get(key);
    if (cached) return cached;
    const b = new MeshBuilder(0, new Map([[SCAFFOLD_PLANK, surfacePaint(this.lib, 'boards')], [SCAFFOLD_POLE, surfacePaint(this.lib, 'bark')]]));
    const along = (from: number, to: number): number[] => {
      const n = Math.max(1, Math.round((to - from) / 2.4));
      return Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);
    };
    for (const x of along(x0, x1)) for (const z of [z0, z1]) b.box(x, 0, z, 0.12, top, 0.12, SCAFFOLD_POLE);
    for (const z of along(z0, z1).slice(1, -1)) for (const x of [x0, x1]) b.box(x, 0, z, 0.12, top, 0.12, SCAFFOLD_POLE);
    const [cx, cz, wx, wz] = [(x0 + x1) / 2, (z0 + z1) / 2, x1 - x0 + 0.5, z1 - z0 + 0.5];
    for (let y = 1.5; y < top - 0.3; y += 1.6) {
      for (const z of [z0, z1]) {
        b.box(cx, y, z, wx, 0.06, 0.55, SCAFFOLD_PLANK);
        b.box(cx, y + 0.95, z + (z === z0 ? -0.22 : 0.22), wx, 0.07, 0.07, SCAFFOLD_POLE);
      }
      for (const x of [x0, x1]) {
        b.box(x, y, cz, 0.55, 0.06, wz, SCAFFOLD_PLANK);
        b.box(x + (x === x0 ? -0.22 : 0.22), y + 0.95, cz, 0.07, 0.07, wz, SCAFFOLD_POLE);
      }
    }
    // A ladder up the front.
    for (const dx of [-0.25, 0.25]) b.box(cx + 1.2 + dx, 0, z1 + 0.35, 0.07, top, 0.07, SCAFFOLD_POLE);
    for (let y = 0.3; y < top; y += 0.35) b.box(cx + 1.2, y, z1 + 0.35, 0.5, 0.04, 0.05, SCAFFOLD_PLANK);
    const geometry = b.build();
    this.scaffoldCache.set(key, geometry);
    return geometry;
  }

  /**
   * Loads every model listed in `<base>buildings/index.json`. A model that fails to load leaves its
   * kind on the shapes from code, with a warning: the game is playable without them.
   */
  async loadModels(base: string): Promise<number> {
    // The sty's pigs (a plain mesh; buildings built from code use it once it is here).
    try {
      const pig = await fetch(`${base}props/pig.json`);
      if (pig.ok) setPigModel((await pig.json()) as PropModel);
      const cannon = await fetch(`${base}props/cannon.json`);
      if (cannon.ok) setCannonModel((await cannon.json()) as PropModel);
    } catch {
      // Built pigs then.
    }
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
    if (HAS_FORTRESS) await this.loadDonjon(base, loader);
    // Shown buildings pick up their models at the next update.
    for (const shown of this.shown) shown.fill('');
    return this.models.size / 2;
  }

  /**
   * The fortress's donjon (map layout 'fortress'): cut out of the Medieval Castle model (its walls and towers are
   * the game's own, laid by the scenario, so they can be breached), stood in the inner yard facing the player.
   */
  private async loadDonjon(base: string, loader: GLTFLoader): Promise<void> {
    try {
      const gltf = await loader.loadAsync(freshUrl(base, 'buildings/fortress_1.glb'));
      const body = surfaceModel(gltf.scene, this.lib, TEAM_HEX[1]).body;
      const g = cutOut(body, DONJON_IN_MODEL);
      g.translate(-(DONJON_IN_MODEL.minX + DONJON_IN_MODEL.maxX) / 2, 0, -(DONJON_IN_MODEL.minZ + DONJON_IN_MODEL.maxZ) / 2);
      const mesh = new Mesh(g, this.material);
      mesh.name = 'donjon';
      const [x, z] = fortressPoint(0, CAMPAIGN.fortress.donjonAtM);
      mesh.position.set(x, heightAtM(x, z), z);
      mesh.rotation.y = fortressFrame().yawRad;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    } catch (error) {
      console.warn(`[models] fortress_1.glb did not load: ${String(error)}`);
    }
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
      // No town at all on this side (the invader's camp in the campaign).
      keep.visible = !town.absent;
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
          mover.userData['part'] = false;
          if (b) {
            mesh.geometry = this.geometry(b.kind, b.level, side);
            const box = mesh.geometry.boundingBox ?? (mesh.geometry.computeBoundingBox(), mesh.geometry.boundingBox);
            mesh.userData['height'] = box ? box.max.y : 4;
            ((this.scaffolds[side] as Mesh[])[slot] as Mesh).geometry = this.scaffoldGeometry(body(mesh.geometry));
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
              mover.userData['part'] = true;
            }
          }
        }
        if (b) {
          // Sails turn while the mill grinds.
          const mover = (this.movers[side] as Mesh[])[slot] as Mesh;
          if (mover.visible && b.cycleStarted && b.workRate > 0 && b.constructionLeftS <= 0) mover.rotation.z += frameSeconds * SAIL_TURN_RAD_S * b.workRate;
          const built = b.constructionLeftS > 0 && b.constructionTotalS > 0 ? 1 - b.constructionLeftS / b.constructionTotalS : 1;
          const site = built < 1;
          const scaffold = (this.scaffolds[side] as Mesh[])[slot] as Mesh;
          mesh.material = site ? this.siteMaterial : this.material;
          mover.visible = mover.userData['part'] === true && !site;
          scaffold.visible = site && built >= FOOTING_SHARE;
          if (site) {
            // Footings first, then the walls course by course; the scaffold keeps a little ahead of them.
            const height = mesh.userData['height'] as number;
            const rise = built < FOOTING_SHARE ? 0 : (built - FOOTING_SHARE) / (1 - FOOTING_SHARE);
            const cutY = mesh.position.y + FOOTING_M + Math.max(0, height - FOOTING_M) * rise;
            mesh.userData['cutY'] = cutY;
            scaffold.userData['cutY'] = cutY + SCAFFOLD_AHEAD_M;
          } else mesh.userData['cutY'] = UNCUT;
        }
      }
    }
  }
}

/**
 * The building's body without its yard: the box about whatever stands above 45% of its height (walls
 * and roof; not the piles, fences and stalls about it), down to the ground.
 */
function body(geometry: BufferGeometry): Box3 | null {
  const cached = bodies.get(geometry);
  if (cached !== undefined) return cached;
  const position = geometry.getAttribute('position');
  let top = 0;
  for (let i = 0; i < position.count; i++) top = Math.max(top, position.getY(i));
  const box = new Box3();
  const point = new Vector3();
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) < top * 0.45) continue;
    box.expandByPoint(point.fromBufferAttribute(position, i));
  }
  const found = box.isEmpty() ? null : box;
  if (found) found.min.y = 0;
  bodies.set(geometry, found);
  return found;
}
const bodies = new WeakMap<BufferGeometry, Box3 | null>();

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

/** The donjon's footprint in the Medieval Castle model (metres, its gate towards +Z): the keep in the middle of its yard. */
const DONJON_IN_MODEL = { minX: -19, maxX: 18, minZ: -46, maxZ: -8 };

/** The triangles of a geometry whose middles lie over a box (x, z), as a geometry of their own. */
function cutOut(source: BufferGeometry, box: { minX: number; maxX: number; minZ: number; maxZ: number }): BufferGeometry {
  const g = source.index ? source.toNonIndexed() : source;
  const pos = g.getAttribute('position');
  const keep: number[] = [];
  for (let t = 0; t < pos.count; t += 3) {
    const x = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
    const z = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
    if (x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ) keep.push(t);
  }
  const out = new BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) {
    const size = attr.itemSize;
    const src = attr.array as Float32Array;
    const dst = new (src.constructor as Float32ArrayConstructor)(keep.length * 3 * size);
    keep.forEach((t, k) => dst.set(src.subarray(t * size, (t + 3) * size), k * 3 * size));
    out.setAttribute(name, new BufferAttribute(dst, size, attr.normalized));
  }
  out.computeBoundingSphere();
  return out;
}
