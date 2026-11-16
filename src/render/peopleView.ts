import { BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, type MeshStandardNodeMaterial, Quaternion, type Scene, Vector3 } from 'three/webgpu';
import { PEOPLE } from '../config.ts';
import type { Person } from '../sim/people.ts';
import { heightAtM } from '../sim/terrain.ts';
import type { ResourceId, Side } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { MeshBuilder, type Paint } from './meshBuilder.ts';
import { TEAM_HEX } from './palette.ts';
import { surfaceMaterial, type SurfaceLibrary } from './surfaces.ts';

// The townspeople. Each is drawn in one of a handful of poses, picked by what
// he is doing and where he is in his stride, as the sprites of an old
// settlement game were: two frames of a walk, two of work, one standing. A
// pose is an instanced mesh per side; what a carrier has on his shoulder is one
// more, tinted by the good.

const SKIN = 0xc49a7a;
const TUNIC = 0x8a7558;
const HOSE = 0x4b4136;
const SHOE = 0x3a2e24;
const TOOL = 0x6a5038;

type Pose = 'stand' | 'walkA' | 'walkB' | 'workA' | 'workB';
const POSES: readonly Pose[] = ['stand', 'walkA', 'walkB', 'workA', 'workB'];
/** Metres walked per frame of the walk: one step. */
const STEP_M = 0.75;
/** Frames of work a second. */
const WORK_BEATS_PER_S = 1.6;

/** A limb from a joint: `swing` radians forward (+Z) from hanging straight down. */
function limb(b: MeshBuilder, x: number, y: number, length: number, thick: number, swing: number, hex: number, endHex: number): void {
  const ex = x;
  const ey = y - Math.cos(swing) * length;
  const ez = Math.sin(swing) * length;
  b.strut([x, y, 0], [ex, ey, ez], thick, thick, hex);
  // A hand or a shoe.
  b.box(ex, ey - thick * 0.3, ez + (endHex === SHOE ? 0.05 : 0), thick * 1.05, thick * 0.6, thick * (endHex === SHOE ? 1.9 : 1.05), endHex);
}

/** No scanned surfaces on a figure this small: plain colours (the empty map still gives the geometry its layer attribute). */
const PLAIN = new Map<number, Paint>();

function figure(pose: Pose, teamHex: number): MeshBuilder {
  const b = new MeshBuilder(0, PLAIN);
  // Swing of the left leg (the right mirrors it), of the arms, and how far the body leans.
  const leg = pose === 'walkA' ? 0.5 : pose === 'walkB' ? -0.5 : 0;
  const armL = pose === 'walkA' ? -0.45 : pose === 'walkB' ? 0.45 : pose === 'workA' ? 2.4 : pose === 'workB' ? 0.9 : 0.05;
  const armR = pose === 'workA' ? 2.4 : pose === 'workB' ? 0.9 : -armL;
  const hip = 0.86;
  const shoulder = 1.42;
  limb(b, -0.11, hip, 0.84, 0.15, leg, HOSE, SHOE);
  limb(b, 0.11, hip, 0.84, 0.15, -leg, HOSE, SHOE);
  // The tunic, belted, and a hood in the town's colour.
  b.box(0, hip - 0.12, 0, 0.42, 0.34, 0.26, TUNIC);
  b.box(0, hip + 0.2, 0, 0.4, 0.42, 0.24, TUNIC);
  b.box(0, hip + 0.16, 0, 0.43, 0.06, 0.27, SHOE);
  b.box(0, shoulder - 0.06, 0, 0.5, 0.16, 0.28, teamHex);
  limb(b, -0.27, shoulder, 0.62, 0.11, armL, TUNIC, SKIN);
  limb(b, 0.27, shoulder, 0.62, 0.11, armR, TUNIC, SKIN);
  b.box(0, shoulder + 0.08, 0.01, 0.2, 0.24, 0.21, SKIN);
  b.box(0, shoulder + 0.24, -0.02, 0.25, 0.12, 0.25, teamHex);
  if (pose === 'workA' || pose === 'workB') {
    // The tool in both hands: up, then down.
    const reach = pose === 'workA' ? 2.4 : 0.9;
    const hx = 0;
    const hy = shoulder - Math.cos(reach) * 0.62;
    const hz = Math.sin(reach) * 0.62;
    b.strut([hx, hy, hz], [hx, hy + Math.cos(reach - 1.3) * 0.9, hz + Math.sin(reach - 1.3) * 0.9 + 0.2], 0.05, 0.05, TOOL);
  }
  return b;
}

/** A sack on the shoulder (white: the instance colour says what is in it). */
function sack(): MeshBuilder {
  const b = new MeshBuilder(0, PLAIN);
  b.box(0.1, 1.5, -0.08, 0.36, 0.3, 0.5, 0xffffff);
  b.box(0.1, 1.78, -0.08, 0.26, 0.1, 0.38, 0xe8e8e8);
  return b;
}

const CART_WOOD = 0x7a5a3a;
const CART_DARK = 0x4a3826;
const HORSE_COAT = 0x6b4a34;

/** A handcart pushed ahead of the carrier (level 2), or a horse and wagon he walks beside (level 3). Door of the figure is +Z. */
function cart(wagon: boolean): MeshBuilder {
  const b = new MeshBuilder(0, PLAIN);
  if (!wagon) {
    // Tray on one axle, two handles back to his hands.
    b.box(0, 0.55, 1.15, 0.8, 0.12, 1.0, CART_WOOD);
    b.box(-0.38, 0.62, 1.15, 0.05, 0.22, 1.0, CART_DARK);
    b.box(0.38, 0.62, 1.15, 0.05, 0.22, 1.0, CART_DARK);
    b.log(0, 0.32, 1.35, 0.32, 0.95, 8, CART_DARK);
    b.strut([-0.28, 0.6, 0.65], [-0.3, 0.85, 0.25], 0.05, 0.05, CART_DARK);
    b.strut([0.28, 0.6, 0.65], [0.3, 0.85, 0.25], 0.05, 0.05, CART_DARK);
    return b;
  }
  // The wagon to his right, the horse ahead of it.
  const x = 1.0;
  b.box(x, 0.75, -0.1, 1.2, 0.14, 2.2, CART_WOOD);
  b.box(x - 0.58, 0.85, -0.1, 0.06, 0.4, 2.2, CART_DARK);
  b.box(x + 0.58, 0.85, -0.1, 0.06, 0.4, 2.2, CART_DARK);
  b.log(x, 0.42, -0.85, 0.42, 1.35, 10, CART_DARK);
  b.log(x, 0.42, 0.65, 0.42, 1.35, 10, CART_DARK);
  b.strut([x, 0.7, 1.0], [x, 0.95, 1.6], 0.07, 0.07, CART_DARK);
  // A plain horse: body, neck and head, four legs.
  const hz = 2.6;
  b.box(x, 0.9, hz, 0.5, 0.6, 1.6, HORSE_COAT);
  b.box(x, 1.35, hz + 0.85, 0.26, 0.65, 0.36, HORSE_COAT);
  b.box(x, 1.8, hz + 1.15, 0.22, 0.26, 0.55, HORSE_COAT);
  for (const dx of [-0.17, 0.17]) for (const dz of [-0.6, 0.6]) b.box(x + dx, 0, hz + dz, 0.13, 0.95, 0.15, HORSE_COAT);
  return b;
}

/** A modelled prop as tools/blender/prop.py writes it (game space, linear colours). */
interface PropModel {
  size: number[];
  positions: number[];
  normals: number[];
  colours: number[];
  triangles: number[];
}

/** Where the models sit about the carrier (who looks along +Z): the barrow ahead of his hands; the wagon
 * at his right, its shafts ahead, the horse between and beyond them. */
const BARROW_Z = 1.1;
const WAGON_X = 1.0;
const WAGON_Z = -0.3;
const WAGON_HORSE_Z = 1.15;

/** A prop moved by (dx, dz), unindexed, with the plain-colour layer the people's material expects, and
 * optionally a built shape alongside (the wagon's horse). */
function propGeometry(model: PropModel, dx: number, dz: number, extra: BufferGeometry | null): BufferGeometry {
  const n = model.triangles.length;
  const more = extra ? (extra.getAttribute('position').count as number) : 0;
  const pos = new Float32Array((n + more) * 3);
  const nor = new Float32Array((n + more) * 3);
  const col = new Float32Array((n + more) * 3);
  const layer = new Float32Array((n + more) * 2);
  for (let k = 0; k < n; k++) {
    const v = model.triangles[k] as number;
    pos[k * 3] = (model.positions[v * 3] as number) + dx;
    pos[k * 3 + 1] = model.positions[v * 3 + 1] as number;
    pos[k * 3 + 2] = (model.positions[v * 3 + 2] as number) + dz;
    for (let c = 0; c < 3; c++) {
      nor[k * 3 + c] = model.normals[v * 3 + c] as number;
      col[k * 3 + c] = model.colours[v * 3 + c] as number;
    }
    layer[k * 2] = -1;
    layer[k * 2 + 1] = 1;
  }
  if (extra) {
    pos.set(extra.getAttribute('position').array as Float32Array, n * 3);
    nor.set(extra.getAttribute('normal').array as Float32Array, n * 3);
    col.set(extra.getAttribute('color').array as Float32Array, n * 3);
    layer.set(extra.getAttribute('aLayer').array as Float32Array, n * 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('aLayer', new BufferAttribute(layer, 2));
  g.computeBoundingSphere();
  return g;
}

/** The plain horse of the wagon, standing between the shafts. */
function wagonHorse(): BufferGeometry {
  const b = new MeshBuilder(0, PLAIN);
  const x = WAGON_X;
  const hz = WAGON_HORSE_Z;
  b.box(x, 0.9, hz, 0.5, 0.6, 1.6, HORSE_COAT);
  b.box(x, 1.35, hz + 0.85, 0.26, 0.65, 0.36, HORSE_COAT);
  b.box(x, 1.8, hz + 1.15, 0.22, 0.26, 0.55, HORSE_COAT);
  for (const dx of [-0.17, 0.17]) for (const dz of [-0.6, 0.6]) b.box(x + dx, 0, hz + dz, 0.13, 0.95, 0.15, HORSE_COAT);
  return b.build();
}

/** Colours of the goods as they look in a sack or a bundle (sRGB). */
const GOOD_HEX: Record<ResourceId, number> = {
  gold: 0xd9b23c,
  wood: 0x7a5a36,
  stone: 0x9a9690,
  grain: 0xd0b050,
  flour: 0xe8e0cc,
  grapes: 0x5a2a4a,
  wine: 0x7a1e2a,
  bread: 0xc98f4e,
  fish: 0x8fa3b0,
  meat: 0xa5483c,
  sausage: 0x8c3d33,
  hide: 0xb08d62,
  leatherArmor: 0x7a5232,
  ironOre: 0x6a5a58,
  iron: 0x5a6068,
  weapon: 0xb8bcc2,
  mailArmor: 0x8f98a2,
  bow: 0x7d8a3c,
  horse: 0x6b4a34,
};

export class PeopleView {
  private readonly poses: Record<Pose, InstancedMesh>[] = [];
  private readonly loads: InstancedMesh;
  /** Handcarts and wagons, by transport level 2 and 3. */
  private readonly carts: InstancedMesh[] = [];
  private readonly counts: Record<Pose, number>[] = [];
  private readonly m = new Matrix4();
  private readonly p = new Vector3();
  private readonly q = new Quaternion();
  private readonly s = new Vector3(1, 1, 1);
  private readonly up = new Vector3(0, 1, 0);
  private readonly tint = new Color();
  private readonly goodColours = new Map<ResourceId, Color>();

  constructor(scene: Scene, lib: SurfaceLibrary) {
    const material: MeshStandardNodeMaterial = surfaceMaterial(lib, 'people');
    material.roughness = 0.85;
    const first = new Color(1, 1, 1);
    const prepare = (mesh: InstancedMesh): InstancedMesh => {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // A colour slot from the start, or the first tint would rebuild the shader.
      mesh.setColorAt(0, first);
      scene.add(mesh);
      return mesh;
    };
    for (const side of [0, 1] as const satisfies readonly Side[]) {
      const set = {} as Record<Pose, InstancedMesh>;
      for (const pose of POSES) {
        const mesh = new InstancedMesh(figure(pose, TEAM_HEX[side]).build(), material, PEOPLE.maxPerSide);
        mesh.name = `people ${side} ${pose}`;
        set[pose] = prepare(mesh);
      }
      this.poses.push(set);
      this.counts.push({ stand: 0, walkA: 0, walkB: 0, workA: 0, workB: 0 });
    }
    this.loads = prepare(new InstancedMesh(sack().build(), material, 2 * PEOPLE.maxPerSide));
    this.loads.name = 'loads';
    for (const wagon of [false, true]) {
      const mesh = prepare(new InstancedMesh(cart(wagon).build(), material, PEOPLE.maxPerSide));
      mesh.name = wagon ? 'wagons' : 'handcarts';
      this.carts.push(mesh);
    }
    for (const id of Object.keys(GOOD_HEX) as ResourceId[]) this.goodColours.set(id, new Color(GOOD_HEX[id]));
  }

  /** Whether the carts are the modelled ones (their loads sit a little differently). */
  private modelled = false;

  /** Swaps the built handcart and wagon for the modelled barrow and wagon, if their files load. */
  async loadCarts(base: string): Promise<void> {
    try {
      const get = async (name: string): Promise<PropModel> => (await (await fetch(`${base}props/${name}.json`)).json()) as PropModel;
      const [barrow, wagon] = await Promise.all([get('handcart'), get('wagon')]);
      const shapes = [propGeometry(barrow, 0, BARROW_Z, null), propGeometry(wagon, WAGON_X, WAGON_Z, wagonHorse())];
      this.carts.forEach((mesh, k) => {
        const old = mesh.geometry;
        mesh.geometry = shapes[k] as BufferGeometry;
        old.dispose();
      });
      this.modelled = true;
    } catch {
      // Keep the built carts.
    }
  }

  private poseOf(person: Person, timeS: number, index: number): Pose {
    if (person.act === 'work' || person.act === 'build') return Math.floor(timeS * WORK_BEATS_PER_S + index * 0.37) % 2 === 0 ? 'workA' : 'workB';
    if (person.speedMs > 0.05) return Math.floor(person.strideM / STEP_M) % 2 === 0 ? 'walkA' : 'walkB';
    return 'stand';
  }

  update(world: World): void {
    for (const counts of this.counts) for (const pose of POSES) counts[pose] = 0;
    let loads = 0;
    const carts = [0, 0];
    for (let i = 0; i < world.people.length; i++) {
      const person = world.people[i] as Person;
      if (!person.alive) continue;
      const pose = this.poseOf(person, world.timeS, i);
      const counts = this.counts[person.side] as Record<Pose, number>;
      const mesh = (this.poses[person.side] as Record<Pose, InstancedMesh>)[pose];
      const at = counts[pose];
      if (at >= PEOPLE.maxPerSide) continue;
      // A small bob on the passing step.
      const bob = pose === 'walkA' || pose === 'walkB' ? 0.03 : 0;
      this.p.set(person.x, heightAtM(person.x, person.z) + bob, person.z);
      this.q.setFromAxisAngle(this.up, person.headingRad);
      this.m.compose(this.p, this.q, this.s);
      mesh.setMatrixAt(at, this.m);
      // No two tunics quite the same brown.
      const shade = 0.82 + ((i * 37) % 11) * 0.03;
      mesh.setColorAt(at, this.tint.setRGB(shade, shade * (0.94 + ((i * 13) % 7) * 0.02), shade * 0.95));
      counts[pose] = at + 1;
      // A carrier on an errand takes the town's cart along; the load rides in it.
      const level = world.towns[person.side].transportLevel;
      const carted = person.role === 'carrier' && person.errand !== 'none' && level >= 2;
      if (carted) {
        const k = level >= 3 ? 1 : 0;
        const mesh = this.carts[k] as InstancedMesh;
        if ((carts[k] as number) < mesh.instanceMatrix.count) {
          mesh.setMatrixAt(carts[k] as number, this.m);
          mesh.setColorAt(carts[k] as number, this.tint.setRGB(1, 1, 1));
          carts[k] = (carts[k] as number) + 1;
        }
      }
      if (person.load && loads < this.loads.instanceMatrix.count) {
        if (carted) {
          // In the cart instead of on his shoulder.
          const dx = level >= 3 ? WAGON_X : 0;
          const dz = level >= 3 ? (this.modelled ? WAGON_Z : -0.1) : this.modelled ? BARROW_Z : 1.15;
          const dy = level >= 3 ? -0.55 : this.modelled ? -0.95 : -0.85;
          const c = Math.cos(person.headingRad);
          const sn = Math.sin(person.headingRad);
          this.p.set(person.x + c * dx + sn * dz - 0.1 * c, heightAtM(person.x, person.z) + dy, person.z - sn * dx + c * dz + 0.1 * sn);
          this.m.compose(this.p, this.q, this.s);
        }
        this.loads.setMatrixAt(loads, this.m);
        this.loads.setColorAt(loads, this.goodColours.get(person.load) as Color);
        loads++;
      }
    }
    for (const side of [0, 1] as const satisfies readonly Side[]) {
      for (const pose of POSES) {
        const mesh = (this.poses[side] as Record<Pose, InstancedMesh>)[pose];
        mesh.count = (this.counts[side] as Record<Pose, number>)[pose];
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
    this.carts.forEach((mesh, k) => {
      mesh.count = carts[k] as number;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    this.loads.count = loads;
    this.loads.instanceMatrix.needsUpdate = true;
    if (this.loads.instanceColor) this.loads.instanceColor.needsUpdate = true;
  }
}
