import { BufferAttribute, BufferGeometry, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardNodeMaterial, Quaternion, type Scene, Vector3 } from 'three/webgpu';
import { PEOPLE } from '../config.ts';
import type { BuildingKind } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { boneTexture, interleave, type RiggedModel, skinnedMaterial } from './armyView.ts';

type Clip = RiggedModel['clips'][number];
import type { Harnessed } from './peopleView.ts';
import { groundUnder } from './townView.ts';

/**
 * The stock in the yards: pigs in the sty's pen (the pig model, public/props/pig.json) and horses in the
 * stable's paddock (the cavalry's horse, soldiers/warhorse.json, on its own bones, no rider or cloth). Each
 * animal wanders its pen on its own clock: it walks to a spot, stands a while (a horse grazes or idles),
 * then moves on, keeping clear of the trough and the hay. The buildings' models carry no animals of their own.
 * The same horse draws the wagons (transport level 3), stepping with its carrier.
 */

/** A pen in the building's own space (door towards +Z): its bounds, what to keep clear of, and how many animals by level. */
interface Pen {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Circles (x, z, radius) an animal does not stop in. */
  clear: readonly (readonly [number, number, number])[];
  count: (level: number) => number;
}

/** From the models (tools/blender/buildings.py, Blender's (x, y) is the game's (x, −z)). */
const PENS: Partial<Record<BuildingKind, Pen>> = {
  pigFarm: { x0: -3.8, x1: 3.8, z0: -1.2, z1: 3.2, clear: [[2.8, 0.2, 1.1], [-3.4, -1.0, 0.9]], count: (level) => 3 + level },
  stable: { x0: -2.8, x1: 2.8, z0: 0.8, z1: 2.9, clear: [[3.0, 0.6, 1.4], [-3.0, -0.2, 1.2]], count: (level) => (level >= 2 ? 3 : 2) },
};

const PIG_CAPACITY = 160;
/** The paddocks' horses and the wagons' (a town's carriers each with a wagon at most). */
const HORSE_CAPACITY = 64 + 2 * PEOPLE.maxPerSide;
/** Walking pace (m/s) and how long one leg of an animal's day lasts (s). */
const PIG = { speedMs: 0.45, legS: 11 };
const HORSE = { speedMs: 0.85, legS: 18 };

/** A number in [0, 1) from integers: the same animal and leg always pick the same spot. */
function hash(a: number, b: number, c: number): number {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Where animal `id` stands at the end of leg `leg`: a spot in the pen, clear of the trough and the hay. */
function spot(pen: Pen, id: number, leg: number): [number, number] {
  for (let tryN = 0; tryN < 6; tryN++) {
    const x = pen.x0 + (pen.x1 - pen.x0) * hash(id, leg, tryN * 2);
    const z = pen.z0 + (pen.z1 - pen.z0) * hash(id, leg, tryN * 2 + 1);
    if (pen.clear.every(([cx, cz, r]) => Math.hypot(x - cx, z - cz) > r)) return [x, z];
  }
  return [(pen.x0 + pen.x1) / 2, (pen.z0 + pen.z1) / 2];
}

/** One animal now: where (pen space), facing (heading, towards (sin, cos)), whether walking, metres walked this leg, and the leg. */
function animalAt(pen: Pen, id: number, timeS: number, pace: { speedMs: number; legS: number }): { x: number; z: number; heading: number; walking: boolean; walkedM: number; leg: number; restS: number } {
  const t = timeS + hash(id, 7, 7) * pace.legS;
  const leg = Math.floor(t / pace.legS);
  const into = t - leg * pace.legS;
  const [ax, az] = spot(pen, id, leg - 1);
  const [bx, bz] = spot(pen, id, leg);
  const dist = Math.hypot(bx - ax, bz - az);
  const walkS = dist / pace.speedMs;
  const share = walkS > 0 ? Math.min(1, into / walkS) : 1;
  // Facing the way it goes; standing, as it last came.
  const heading = dist > 0.01 ? Math.atan2(bx - ax, bz - az) : hash(id, leg, 9) * Math.PI * 2;
  return { x: ax + (bx - ax) * share, z: az + (bz - az) * share, heading, walking: share < 1, walkedM: dist * share, leg, restS: Math.max(0, into - walkS) };
}

interface PropModel {
  positions: number[];
  normals: number[];
  colours: number[];
  triangles: number[];
}

export class AnimalsView {
  private pigs: InstancedMesh | null = null;
  private horses: InstancedMesh | null = null;
  private horsePlace: InstancedBufferAttribute | null = null;
  private horseFrame: InstancedBufferAttribute | null = null;
  private horseClips: { idle: Clip; walk: Clip; graze: Clip | null } | null = null;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);
  private readonly p = new Vector3();
  private readonly s = new Vector3(1, 1, 1);

  constructor(private readonly scene: Scene) {}

  /** Loads the pig and the horse; without a file that animal is simply not drawn. */
  async load(base: string): Promise<void> {
    try {
      const pig = (await (await fetch(`${base}props/pig.json`)).json()) as PropModel;
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(pig.positions), 3));
      g.setAttribute('normal', new BufferAttribute(new Float32Array(pig.normals), 3));
      g.setAttribute('color', new BufferAttribute(new Float32Array(pig.colours), 3));
      g.setIndex(pig.triangles);
      const mesh = new InstancedMesh(g, new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85 }), PIG_CAPACITY);
      mesh.name = 'pigs';
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      this.scene.add(mesh);
      this.pigs = mesh;
    } catch {
      this.pigs = null;
    }
    try {
      const model = (await (await fetch(`${base}soldiers/warhorse.json`)).json()) as RiggedModel;
      const named = (name: string): Clip | null => model.clips.find((c) => c.name === name) ?? null;
      const idle = named('idle');
      const walk = named('walk');
      if (!idle || !walk) return;
      this.horseClips = { idle, walk, graze: named('graze') };
      const n = model.positions.length / 3;
      const g = new BufferGeometry();
      interleave(g, [
        ['position', 3, model.positions],
        ['normal', 3, model.normals],
        ['color', 3, model.colours],
        ['aSurface', 3, model.surface],
      ]);
      // The clips move the horse: no swing from code, no fall.
      interleave(g, [
        ['aSkin', 4, model.skin],
        ['aWeight', 4, model.weights],
        ['aPart', 4, new Float32Array(n * 4)],
      ]);
      g.setIndex(model.triangles);
      g.computeBoundingSphere();
      const instanced = (size: number): InstancedBufferAttribute => {
        const a = new InstancedBufferAttribute(new Float32Array(HORSE_CAPACITY * size), size);
        a.setUsage(DynamicDrawUsage);
        return a;
      };
      this.horsePlace = instanced(4);
      this.horseFrame = instanced(1);
      g.setAttribute('aPlace', this.horsePlace);
      g.setAttribute('aAnim', instanced(4));
      g.setAttribute('aSide', instanced(1));
      g.setAttribute('aFrame', this.horseFrame);
      const mesh = new InstancedMesh(g, skinnedMaterial(boneTexture(model)), HORSE_CAPACITY);
      mesh.name = 'paddock horses';
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.horses = mesh;
    } catch {
      this.horses = null;
    }
  }

  /** Draws the stock of every pen, and a walking horse before each wagon (`harnessed`, from PeopleView). */
  update(world: World, harnessed: readonly Harnessed[] = [], harnessedCount = 0): void {
    let pigs = 0;
    let horses = 0;
    const place = this.horsePlace?.array as Float32Array | undefined;
    const frame = this.horseFrame?.array as Float32Array | undefined;
    const clips = this.horseClips;
    for (const town of world.towns) {
      for (let slot = 0; slot < town.plots.length; slot++) {
        const b = town.plots[slot];
        if (!b || b.constructionLeftS > 0) continue;
        const pen = PENS[b.kind];
        if (!pen) continue;
        const c = Math.cos(b.yawRad);
        const s = Math.sin(b.yawRad);
        const y = groundUnder(b.x, b.z, b.yawRad)[1];
        for (let i = 0; i < pen.count(b.level); i++) {
          const id = town.side * 100000 + slot * 16 + i;
          const horse = b.kind === 'stable';
          const a = animalAt(pen, id, world.timeS, horse ? HORSE : PIG);
          const x = b.x + a.x * c + a.z * s;
          const z = b.z - a.x * s + a.z * c;
          // The plot turns the pen: the heading turns with it.
          const heading = a.heading + b.yawRad;
          if (!horse && this.pigs && pigs < PIG_CAPACITY) {
            // A little bob in its trot.
            const bob = a.walking ? Math.abs(Math.sin(a.walkedM * 7)) * 0.03 : 0;
            this.q.setFromAxisAngle(this.up, heading + Math.PI);
            this.p.set(x, y + bob, z);
            this.m.compose(this.p, this.q, this.s);
            this.pigs.setMatrixAt(pigs++, this.m);
          } else if (horse && place && frame && clips && horses < HORSE_CAPACITY) {
            place[horses * 4] = x;
            place[horses * 4 + 1] = y;
            place[horses * 4 + 2] = z;
            // The model faces −Z; a heading h looks along (sin h, cos h): turned by h + π, as the soldiers.
            place[horses * 4 + 3] = heading + Math.PI;
            let f: number;
            if (a.walking) {
              const cycleM = Math.max(0.6, clips.walk.travelM ?? 1);
              f = clips.walk.start + (Math.floor((a.walkedM / cycleM) * clips.walk.frames) % clips.walk.frames);
            } else {
              // Standing: every other stop it grazes, else it idles; each on its own time in the loop.
              const loop = clips.graze && hash(id, a.leg, 3) < 0.5 ? clips.graze : clips.idle;
              f = loop.start + (Math.floor((a.restS + hash(id, 5, 5) * 10) * loop.fps) % loop.frames);
            }
            frame[horses] = f;
            horses++;
          }
        }
      }
    }
    // The wagons' horses: stepping in time with the carrier's stride, standing (idle) while he waits.
    if (place && frame && clips) {
      const cycleM = Math.max(0.6, clips.walk.travelM ?? 1);
      for (let i = 0; i < harnessedCount && horses < HORSE_CAPACITY; i++) {
        const h = harnessed[i] as Harnessed;
        place[horses * 4] = h.x;
        place[horses * 4 + 1] = h.y;
        place[horses * 4 + 2] = h.z;
        place[horses * 4 + 3] = h.headingRad + Math.PI;
        frame[horses] = h.moving
          ? clips.walk.start + (Math.floor((h.strideM / cycleM) * clips.walk.frames) % clips.walk.frames)
          : clips.idle.start + (Math.floor((world.timeS + i * 1.7) * clips.idle.fps) % clips.idle.frames);
        horses++;
      }
    }
    if (this.pigs) {
      this.pigs.count = pigs;
      this.pigs.instanceMatrix.needsUpdate = true;
    }
    if (this.horses) {
      this.horses.count = horses;
      if (this.horsePlace) this.horsePlace.needsUpdate = true;
      if (this.horseFrame) this.horseFrame.needsUpdate = true;
    }
  }
}
