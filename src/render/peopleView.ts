import { Color, DynamicDrawUsage, InstancedMesh, Matrix4, type MeshStandardNodeMaterial, Quaternion, type Scene, Vector3 } from 'three/webgpu';
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

/** Colours of the goods as they look in a sack or a bundle (sRGB). */
const GOOD_HEX: Record<ResourceId, number> = {
  gold: 0xd9b23c,
  wood: 0x7a5a36,
  stone: 0x9a9690,
  grain: 0xd0b050,
  flour: 0xe8e0cc,
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
    for (const id of Object.keys(GOOD_HEX) as ResourceId[]) this.goodColours.set(id, new Color(GOOD_HEX[id]));
  }

  private poseOf(person: Person, timeS: number, index: number): Pose {
    if (person.act === 'work' || person.act === 'build') return Math.floor(timeS * WORK_BEATS_PER_S + index * 0.37) % 2 === 0 ? 'workA' : 'workB';
    if (person.speedMs > 0.05) return Math.floor(person.strideM / STEP_M) % 2 === 0 ? 'walkA' : 'walkB';
    return 'stand';
  }

  update(world: World): void {
    for (const counts of this.counts) for (const pose of POSES) counts[pose] = 0;
    let loads = 0;
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
      if (person.load && loads < this.loads.instanceMatrix.count) {
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
    this.loads.count = loads;
    this.loads.instanceMatrix.needsUpdate = true;
    if (this.loads.instanceColor) this.loads.instanceColor.needsUpdate = true;
  }
}
