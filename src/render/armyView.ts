import { abs, attribute, cos, Fn, int, ivec2, mix, normalLocal, sin, textureLoad, vec3, vec4 } from 'three/tsl';
import { BufferAttribute, BufferGeometry, Color, DataTexture, InterleavedBuffer, InterleavedBufferAttribute, DynamicDrawUsage, FloatType, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardNodeMaterial, NearestFilter, type Node, RGBAFormat, type Scene } from 'three/webgpu';
import { ARMY, MISSILE, TOWER, UNITS } from '../config.ts';
import { arrowY } from '../sim/missiles.ts';
import type { Soldier } from '../sim/regiment.ts';
import { heightAtM, townX, townZ } from '../sim/terrain.ts';
import { enemyOf } from '../sim/types.ts';
import { groundUnder } from './townView.ts';
import { UNIT_KINDS, type UnitKind } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { MeshBuilder } from './meshBuilder.ts';
import { TEAM_HEX } from './palette.ts';
import { type BodyModel, cavalryGeometryOnModels, type Saddle, engineGeometryOnModel, type GunModel, gunCrewSpots, type HorseModel, soldierGeometry, soldierGeometryOnBody } from './soldierGeometry.ts';
import { freshUrl } from '../version.ts';

// Every soldier on the field, one instanced mesh per kind of unit. The CPU
// writes nine numbers per man (place, heading, stride, strike, fall, side);
// the vertex shader swings legs, arms and weapons about the pivots stored in
// the geometry and puts the man where he stands. Arrows are a seventh
// instanced mesh.

/** The kinds that fight in plate, on the modelled knight's body. */
const PLATE_KINDS: readonly UnitKind[] = ['swordsmen', 'halberdiers'];

/** Men of one kind on the field at once: both sides at the limit, plus the fallen still shown. */
const CAPACITY = 2 * ARMY.maxSoldiersPerSide + 40;
/** Leg swing at a full stride, and metres of ground one stride cycle covers (foot / horse). */
const WALK_SWING_RAD = 0.62;
const FOOT_STRIDE_M = 1.5;
const HORSE_STRIDE_M = 3.2;
/** A blow is a swing of this many radians that takes this long. */
const STRIKE_RAD = 1.35;
const STRIKE_S = 0.45;
/** A fallen man goes down in this time, then sinks out of sight over the last seconds he is shown. */
const FALL_S = 0.5;
const SINK_S = 2;
/** Size of the arrow model for each missile look: arrow, crossbow bolt (looks 2 and 3 are balls). */
const BOLT_SCALE: readonly number[] = [1, 0.7];
/** A ball's size by look: a cannonball, a mortar's heavy ball. */
const BALL_SCALE: readonly number[] = [0, 0, 0.55, 1];

interface KindMesh {
  mesh: InstancedMesh;
  /** Per man: x, y, z and yaw. */
  place: InstancedBufferAttribute;
  /** Per man: stride phase, stride strength, strike angle, fall angle. */
  anim: InstancedBufferAttribute;
  /** A modelled, skinned kind: each man's frame in its clips, and where the clips lie. */
  skinned?: SkinnedKind;
  /** Per man: 0 or 1, which side he fights for. */
  side: InstancedBufferAttribute;
}

/**
 * The soldiers' material. three r186 applies an instance's matrix before `positionNode` runs, so a
 * limb could not be turned about its pivot in the model's own space; the meshes therefore keep
 * identity instance matrices and the shader does the whole placement itself: limb swing, the fall
 * of the dead, the turn to the heading, the move to the man's place.
 */
function soldierMaterial(mounted: boolean): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ name: mounted ? 'horseman' : 'footman' });
  const part = attribute('aPart', 'vec4') as Node<'vec4'>;
  const surface = attribute('aSurface', 'vec3') as Node<'vec3'>;
  const place = attribute('aPlace', 'vec4') as Node<'vec4'>;
  const anim = attribute('aAnim', 'vec4') as Node<'vec4'>;
  const side = attribute('aSide', 'float') as Node<'float'>;
  const teams = [new Color(TEAM_HEX[0]), new Color(TEAM_HEX[1])] as const;

  /** A point or a normal taken through the fall and the yaw. */
  const pose = (v: Node<'vec3'>): Node<'vec3'> => {
    const cf = cos(anim.w);
    const sf = sin(anim.w);
    // A man falls on his back (about his shoulders' axis), a horse on its side (about its length).
    const fallen = mounted ? vec3(v.x.mul(cf).sub(v.y.mul(sf)), v.x.mul(sf).add(v.y.mul(cf)), v.z) : vec3(v.x, v.y.mul(cf).sub(v.z.mul(sf)), v.y.mul(sf).add(v.z.mul(cf)));
    const cy = cos(place.w);
    const sy = sin(place.w);
    return vec3(fallen.x.mul(cy).add(fallen.z.mul(sy)), fallen.y, fallen.z.mul(cy).sub(fallen.x.mul(sy)));
  };

  m.positionNode = Fn(() => {
    const p = attribute('position', 'vec3') as Node<'vec3'>;
    // Each limb turns about its pivot: a line along X at height part.x and depth part.y.
    const angle = part.z.mul(sin(anim.x)).mul(anim.y).mul(WALK_SWING_RAD).add(part.w.mul(anim.z));
    const c = cos(angle);
    const s = sin(angle);
    const ry = p.y.sub(part.x);
    const rz = p.z.sub(part.y);
    const bob = abs(sin(anim.x)).mul(anim.y).mul(0.05);
    const swung = vec3(p.x, part.x.add(ry.mul(c)).add(rz.mul(s)).add(bob), part.y.sub(ry.mul(s)).add(rz.mul(c)));
    normalLocal.assign(pose(attribute('normal', 'vec3') as Node<'vec3'>));
    return pose(swung).add(place.xyz);
  })();
  m.colorNode = mix(attribute('color', 'vec3') as Node<'vec3'>, mix(vec3(teams[0].r, teams[0].g, teams[0].b), vec3(teams[1].r, teams[1].g, teams[1].b), side), surface.z);
  m.metalnessNode = surface.x;
  m.roughnessNode = surface.y;
  return m;
}

/** A skinned body and its clips as tools/blender/rigged.py (or baked.py) writes them. */
export interface RiggedModel {
  bones: string[];
  /** travelM: ground a clip walks over (one not made "in place"), 0 when it stays on the spot. */
  clips: { name: string; start: number; frames: number; fps: number; travelM?: number }[];
  frames: number[];
  positions: number[];
  normals: number[];
  colours: number[];
  surface: number[];
  skin: number[];
  weights: number[];
  triangles: number[];
}

/** `lower`: a raise-to-aim clip played backwards after the shot (held at aim a moment, then lowered). */
type Clip = { start: number; frames: number; travelM?: number; lower?: boolean };
/** Share of a lowering blow spent still at aim, the bolt just loosed. */
const HOLD_AFTER_SHOT = 0.3;

interface SkinnedKind {
  frame: InstancedBufferAttribute;
  fps: number;
  /** The strike: first frame and length (the first of `strikes`, which the men take by turns); the guard
   * (the first frame of the block); the block held up. */
  strikeStart: number;
  strikeFrames: number;
  strikes: Clip[];
  guard: number;
  blockHeld: number;
  /** The clips the file may also carry: standing at ease, walking, running, flinching, falling dead (one or more). */
  idle: Clip | null;
  walk: Clip | null;
  run: Clip | null;
  impact: Clip | null;
  deaths: Clip[];
  /** A bowman's draw before a shot (his strike is the loose and the bow's recoil). */
  draw: Clip | null;
  /** Whether he carries a shield; and the frame of his blow with the weapon furthest forward (a pike
   * levelled, a sword out), held by men without a shield on guard and by a pike wall. */
  shield: boolean;
  reach: number;
  /** A horse's clips (a mounted kind): standing, walking, galloping, grazing at ease. */
  horse?: { idle: Clip; walk: Clip; gallop: Clip; graze: Clip | null };
}

/**
 * A horse's cloth in the side's colours, cut from its own skin: every triangle of its body within the cloth's
 * reach, a little out along the normals and on the same bones, so it lies on the horse and moves with it. A
 * light horseman's is a saddle blanket; a heavy one's a caparison from chest to croup, with a gilt hem.
 */
function caparison(horse: RiggedModel & { saddle: { y: number; z: number } }, heavy: boolean): { positions: number[]; normals: number[]; colours: number[]; surface: number[]; skin: number[]; weights: number[]; triangles: number[] } {
  const { y: sy, z: sz } = horse.saddle;
  const [front, back, drop, out] = heavy ? [0.85, 0.75, 0.62, 0.035] : [0.36, 0.34, 0.4, 0.025];
  const hemY = sy - drop + 0.07;
  const n = horse.positions.length / 3;
  const inside = (i: number): boolean => {
    const y = horse.positions[i * 3 + 1] as number;
    const dz = (horse.positions[i * 3 + 2] as number) - sz;
    return dz > -front && dz < back && y > sy - drop && y < sy + 0.06;
  };
  const map = new Int32Array(n).fill(-1);
  const c = { positions: [] as number[], normals: [] as number[], colours: [] as number[], surface: [] as number[], skin: [] as number[], weights: [] as number[], triangles: [] as number[] };
  for (let t = 0; t + 2 < horse.triangles.length; t += 3) {
    const tri = [horse.triangles[t], horse.triangles[t + 1], horse.triangles[t + 2]] as number[];
    if (!tri.every(inside)) continue;
    for (const v of tri) {
      if (map[v] === -1) {
        map[v] = c.skin.length / 4;
        const [nx, ny, nz] = [horse.normals[v * 3] as number, horse.normals[v * 3 + 1] as number, horse.normals[v * 3 + 2] as number];
        const y = horse.positions[v * 3 + 1] as number;
        c.positions.push((horse.positions[v * 3] as number) + nx * out, y + ny * out, (horse.positions[v * 3 + 2] as number) + nz * out);
        c.normals.push(nx, ny, nz);
        const hem = heavy && y < hemY;
        c.colours.push(...(hem ? [0.62, 0.46, 0.14] : [0.85, 0.84, 0.8]));
        c.surface.push(hem ? 0.5 : 0, hem ? 0.45 : 0.92, hem ? 0 : 0.88);
        for (let k = 0; k < 4; k++) {
          c.skin.push(horse.skin[v * 4 + k] as number);
          c.weights.push(horse.weights[v * 4 + k] as number);
        }
      }
      c.triangles.push(map[v] as number);
    }
  }
  return c;
}

/** A horse gallops above this speed (m/s), walks below it; a gallop cycle as played covers this much ground
 * (the take's 3.6 m would show a charge at a march's speed in slow motion). */
const GALLOP_FROM_MS = 1.8;
const GALLOP_CYCLE_M = 3;

/** The frame of a clip in which a weapon's tip (a vertex on its joint, the furthest forward at rest)
 * reaches furthest forward (−Z) while staying about chest high. */
function reachFrame(model: RiggedModel, clip: Clip): number {
  const joint = model.bones.indexOf('Sword_joint');
  if (joint < 0) return clip.start;
  const n = model.positions.length / 3;
  let tip = -1;
  for (let i = 0; i < n; i++) {
    if (model.skin[i * 4] !== joint) continue;
    if (tip < 0 || (model.positions[i * 3 + 2] as number) < (model.positions[tip * 3 + 2] as number)) tip = i;
  }
  if (tip < 0) return clip.start;
  const [x, y, z] = [model.positions[tip * 3] as number, model.positions[tip * 3 + 1] as number, model.positions[tip * 3 + 2] as number];
  const nb = model.bones.length;
  let best = clip.start;
  let bestZ = Number.POSITIVE_INFINITY;
  for (let f = clip.start; f < clip.start + clip.frames; f++) {
    const o = (f * nb + joint) * 12 + 8;
    const tz = (model.frames[o] as number) * x + (model.frames[o + 1] as number) * y + (model.frames[o + 2] as number) * z + (model.frames[o + 3] as number);
    const ty = (model.frames[o - 4] as number) * x + (model.frames[o - 3] as number) * y + (model.frames[o - 2] as number) * z + (model.frames[o - 1] as number);
    // Levelled, not raised: a tip above chest height counts against the frame.
    const score = tz + Math.max(0, ty - 1.6) * 1.5;
    if (score < bestZ) {
      bestZ = score;
      best = f;
    }
  }
  return best;
}

/** Ground covered by one cycle (two steps) of the walk and of the run as the game plays them. The walk
 * as baked covers 1.6 m; the run 3.4 m at a sprint, played shorter so that men at a charge's 2.7 m/s step
 * briskly rather than in slow motion. */
const WALK_CYCLE_M = 1.6;
const RUN_CYCLE_M = 2.5;
/** Men are at ease out of a fight this long after their last blow or wound. */
const AT_EASE_AFTER_S = 5;

/**
 * The skinned soldiers' material: each vertex is moved by up to four bones whose matrices for the man's
 * frame are read from a texture (three texels a bone, a row a frame), so every man of the kind is still
 * one draw. While no walk is baked, the legs swing about the hips as the boxes' did; then the man is
 * turned, felled and placed as the others are.
 */
/**
 * Sets several per-vertex attributes from one interleaved buffer. WebGPU allows only eight vertex
 * buffers a pipeline; a skinned man has seven per-vertex attributes and four per-instance ones, so
 * they go into two interleaved buffers (what he looks like; how his bones move him).
 */
export function interleave(g: BufferGeometry, parts: readonly [name: string, size: number, data: ArrayLike<number>][]): void {
  const stride = parts.reduce((sum, [, size]) => sum + size, 0);
  const n = (parts[0] as [string, number, ArrayLike<number>])[2].length / (parts[0] as [string, number, ArrayLike<number>])[1];
  const array = new Float32Array(n * stride);
  let offset = 0;
  for (const [, size, data] of parts) {
    for (let i = 0; i < n; i++) for (let c = 0; c < size; c++) array[i * stride + offset + c] = data[i * size + c] as number;
    offset += size;
  }
  const buffer = new InterleavedBuffer(array, stride);
  offset = 0;
  for (const [name, size] of parts) {
    g.setAttribute(name, new InterleavedBufferAttribute(buffer, size, offset));
    offset += size;
  }
}

/** The bone texture of a skinned model: three texels (the matrix's rows) a bone, a row a frame. */
export function boneTexture(model: RiggedModel): DataTexture {
  const nb = model.bones.length;
  const frames = model.frames.length / (nb * 12);
  const data = new Float32Array(nb * 3 * frames * 4);
  for (let f = 0; f < frames; f++) {
    for (let b = 0; b < nb; b++) {
      for (let r = 0; r < 3; r++) {
        const src = (f * nb + b) * 12 + r * 4;
        const dst = (f * nb * 3 + b * 3 + r) * 4;
        for (let c = 0; c < 4; c++) data[dst + c] = model.frames[src + c] as number;
      }
    }
  }
  const bones = new DataTexture(data, nb * 3, frames, RGBAFormat, FloatType);
  bones.magFilter = bones.minFilter = NearestFilter;
  bones.needsUpdate = true;
  return bones;
}

export function skinnedMaterial(bones: DataTexture, mounted = false): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ name: mounted ? 'skinned horseman' : 'skinned footman' });
  const skin = attribute('aSkin', 'vec4') as Node<'vec4'>;
  const weight = attribute('aWeight', 'vec4') as Node<'vec4'>;
  const part = attribute('aPart', 'vec4') as Node<'vec4'>;
  const surface = attribute('aSurface', 'vec3') as Node<'vec3'>;
  const place = attribute('aPlace', 'vec4') as Node<'vec4'>;
  const anim = attribute('aAnim', 'vec4') as Node<'vec4'>;
  const side = attribute('aSide', 'float') as Node<'float'>;
  const frame = attribute('aFrame', 'float') as Node<'float'>;
  const teams = [new Color(TEAM_HEX[0]), new Color(TEAM_HEX[1])] as const;
  const row = (bone: Node<'float'>, r: number): Node<'vec4'> => textureLoad(bones, ivec2(int(bone).mul(3).add(r), int(frame))) as Node<'vec4'>;
  /** A point (w 1) or a direction (w 0) through the four bones. */
  const skinned = (v: Node<'vec3'>, w: number): Node<'vec3'> => {
    const v4 = vec4(v, w);
    const one = (bone: Node<'float'>, k: Node<'float'>): Node<'vec3'> => vec3(row(bone, 0).dot(v4), row(bone, 1).dot(v4), row(bone, 2).dot(v4)).mul(k);
    return one(skin.x, weight.x).add(one(skin.y, weight.y)).add(one(skin.z, weight.z)).add(one(skin.w, weight.w));
  };
  const pose = (v: Node<'vec3'>): Node<'vec3'> => {
    const cf = cos(anim.w);
    const sf = sin(anim.w);
    // A man falls on his back (about his shoulders' axis), a horse on its side (about its length).
    const fallen = mounted ? vec3(v.x.mul(cf).sub(v.y.mul(sf)), v.x.mul(sf).add(v.y.mul(cf)), v.z) : vec3(v.x, v.y.mul(cf).sub(v.z.mul(sf)), v.y.mul(sf).add(v.z.mul(cf)));
    const cy = cos(place.w);
    const sy = sin(place.w);
    return vec3(fallen.x.mul(cy).add(fallen.z.mul(sy)), fallen.y, fallen.z.mul(cy).sub(fallen.x.mul(sy)));
  };
  m.positionNode = Fn(() => {
    const p = skinned(attribute('position', 'vec3') as Node<'vec3'>, 1);
    // The legs walk about the hips (part: pivot height, pivot depth, swing); a clip with a walk will take over.
    // A rider's arm and weapon strike about his shoulder (part.w: its share of the blow).
    const angle = part.z.mul(sin(anim.x)).mul(anim.y).mul(WALK_SWING_RAD).add(part.w.mul(anim.z));
    const c = cos(angle);
    const s = sin(angle);
    const ry = p.y.sub(part.x);
    const rz = p.z.sub(part.y);
    const bob = abs(sin(anim.x)).mul(anim.y).mul(0.05);
    const swung = vec3(p.x, part.x.add(ry.mul(c)).add(rz.mul(s)).add(bob), part.y.sub(ry.mul(s)).add(rz.mul(c)));
    normalLocal.assign(pose(skinned(attribute('normal', 'vec3') as Node<'vec3'>, 0).normalize()));
    return pose(swung).add(place.xyz);
  })();
  m.colorNode = mix(attribute('color', 'vec3') as Node<'vec3'>, mix(vec3(teams[0].r, teams[0].g, teams[0].b), vec3(teams[1].r, teams[1].g, teams[1].b), side), surface.z);
  m.metalnessNode = surface.x;
  m.roughnessNode = surface.y;
  return m;
}

/** The kinds on a skinned body, and the file each one's body comes from. */
const SKINNED_KINDS: readonly [UnitKind, string][] = [
  ['swordsmen', 'soldiers/swordsman.json'],
  ['halberdiers', 'soldiers/halberdier.json'],
  ['pikemen', 'soldiers/pikeman.json'],
  ['archers', 'soldiers/archer.json'],
  ['crossbowmen', 'soldiers/crossbowman.json'],
];

export class ArmyView {
  private readonly kinds = new Map<UnitKind, KindMesh>();
  private readonly scene: Scene;
  /** The guns' crews as modelled townsmen (people/townsman.json), once loaded; the size of each gun's model. */
  private crew: { mesh: InstancedMesh; place: InstancedBufferAttribute; frame: InstancedBufferAttribute; side: InstancedBufferAttribute; clips: Record<'idle' | 'walk' | 'pickup' | 'putdown', Clip & { fps: number }> } | null = null;
  private readonly gunSizes = new Map<'cannon' | 'mortar', number[]>();
  private readonly arrows: InstancedMesh;
  private readonly stones: InstancedMesh;

  constructor(scene: Scene) {
    this.scene = scene;
    const footman = soldierMaterial(false);
    const horseman = soldierMaterial(true);
    const identity = new Matrix4();
    for (const kind of UNIT_KINDS) {
      const geometry = soldierGeometry(kind);
      const place = new InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4);
      const anim = new InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4);
      const side = new InstancedBufferAttribute(new Float32Array(CAPACITY), 1);
      for (const attr of [place, anim, side]) attr.setUsage(DynamicDrawUsage);
      geometry.setAttribute('aPlace', place);
      geometry.setAttribute('aAnim', anim);
      geometry.setAttribute('aSide', side);
      const mesh = new InstancedMesh(geometry, UNITS[kind].cavalry ? horseman : footman, CAPACITY);
      mesh.name = `soldiers ${kind}`;
      for (let i = 0; i < CAPACITY; i++) mesh.setMatrixAt(i, identity);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // The shader places the men: the mesh's own bounds mean nothing.
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.kinds.set(kind, { mesh, place, anim, side });
    }
    // An arrow: a 75 cm shaft along −Z with fletching.
    const b = new MeshBuilder();
    b.box(0, -0.012, 0, 0.024, 0.024, 0.75, 0x8a7a5a);
    b.box(0, -0.04, 0.33, 0.08, 0.08, 0.1, 0xd8d2c0);
    const arrowMaterial = new MeshStandardNodeMaterial({ name: 'arrow', vertexColors: true, roughness: 0.8 });
    this.arrows = new InstancedMesh(b.build(), arrowMaterial, MISSILE.poolSize);
    this.arrows.name = 'arrows';
    this.arrows.instanceMatrix.setUsage(DynamicDrawUsage);
    this.arrows.count = 0;
    this.arrows.frustumCulled = false;
    scene.add(this.arrows);
    // A cast-iron ball: about 45 cm across for the mortar, smaller for the cannon (scaled per shot).
    const stone = new MeshBuilder();
    stone.cylinder(0, -0.2, 0, 0.16, 0.23, 0.2, 8, 0x2c2c2e);
    stone.cylinder(0, 0, 0, 0.23, 0.12, 0.2, 8, 0x353538);
    this.stones = new InstancedMesh(stone.build(), arrowMaterial, 32);
    this.stones.name = 'stones';
    this.stones.instanceMatrix.setUsage(DynamicDrawUsage);
    this.stones.count = 0;
    this.stones.frustumCulled = false;
    this.stones.castShadow = true;
    scene.add(this.stones);
  }

  /**
   * Puts the kinds that wear plate on the modelled knight (public/soldiers/knight.json, from
   * tools/blender/soldiers.py). Without the file they keep their figures from code, with a warning.
   */
  async loadBodies(base: string): Promise<number> {
    let body: BodyModel;
    try {
      const response = await fetch(freshUrl(base, 'soldiers/knight.json'));
      if (!response.ok) throw new Error(String(response.status));
      body = (await response.json()) as BodyModel;
    } catch (error) {
      console.warn(`[soldiers] no knight model (${String(error)}): soldiers keep their figures from code`);
      return 0;
    }
    let changed = 0;
    for (const [kind, file] of SKINNED_KINDS) {
      try {
        const response = await fetch(freshUrl(base, file));
        if (!response.ok) throw new Error(String(response.status));
        if (this.useRigged(kind, (await response.json()) as RiggedModel)) changed++;
      } catch (error) {
        console.warn(`[soldiers] no skinned ${kind} (${String(error)}): it keeps its figure`);
      }
    }
    // Horsemen: the seated knight on a horse that walks and gallops on its own bones; without that file, on
    // the armoured horse whose legs swing in code.
    try {
      const [rider, horse] = await Promise.all(['soldiers/rider.json', 'soldiers/warhorse.json'].map(async (file) => {
        const response = await fetch(freshUrl(base, file));
        if (!response.ok) throw new Error(`${file} ${response.status}`);
        return response.json();
      }));
      for (const kind of ['lightCavalry', 'heavyCavalry'] as const) if (this.useMounted(kind, horse as RiggedModel & { saddle: { bone: number; y: number; z: number } }, rider as BodyModel)) changed++;
    } catch (error) {
      console.warn(`[soldiers] no skinned horse (${String(error)}): horsemen ride the armoured horse`);
    }
    if (!this.kinds.get('lightCavalry')?.skinned) try {
      const [rider, horse] = await Promise.all(['soldiers/rider.json', 'soldiers/horse.json'].map(async (file) => {
        const response = await fetch(freshUrl(base, file));
        if (!response.ok) throw new Error(`${file} ${response.status}`);
        return response.json();
      }));
      for (const kind of ['lightCavalry', 'heavyCavalry'] as const) {
        const k = this.kinds.get(kind);
        if (!k) continue;
        const geometry = cavalryGeometryOnModels(kind, rider as BodyModel, horse as HorseModel);
        geometry.setAttribute('aPlace', k.place);
        geometry.setAttribute('aAnim', k.anim);
        geometry.setAttribute('aSide', k.side);
        const old = k.mesh.geometry;
        k.mesh.geometry = geometry;
        old.dispose();
        changed++;
      }
    } catch (error) {
      console.warn(`[soldiers] no modelled horsemen (${String(error)}): they keep their figures`);
    }
    // The guns' crews: modelled townsmen drawn on their own, or (without the file) men built into each gun.
    await this.loadCrew(base);
    // The guns from their models (public/props), each with its crew.
    for (const kind of ['cannon', 'mortar'] as const) {
      const k = this.kinds.get(kind);
      if (!k) continue;
      try {
        const response = await fetch(freshUrl(base, `props/${kind}.json`));
        if (!response.ok) throw new Error(`${kind} ${response.status}`);
        const model = (await response.json()) as GunModel;
        this.gunSizes.set(kind, model.size);
        const geometry = engineGeometryOnModel(kind, model, this.crew === null);
        geometry.setAttribute('aPlace', k.place);
        geometry.setAttribute('aAnim', k.anim);
        geometry.setAttribute('aSide', k.side);
        const old = k.mesh.geometry;
        k.mesh.geometry = geometry;
        old.dispose();
        changed++;
      } catch (error) {
        console.warn(`[soldiers] no modelled ${kind} (${String(error)}): it keeps its built shape`);
      }
    }
    for (const kind of PLATE_KINDS) {
      if (this.kinds.get(kind)?.skinned) continue;
      const k = this.kinds.get(kind);
      if (!k) continue;
      const geometry = soldierGeometryOnBody(kind, body);
      // The per-man attributes move over to the new body: the shader reads them from the geometry.
      geometry.setAttribute('aPlace', k.place);
      geometry.setAttribute('aAnim', k.anim);
      geometry.setAttribute('aSide', k.side);
      const old = k.mesh.geometry;
      k.mesh.geometry = geometry;
      old.dispose();
      changed++;
    }
    return changed;
  }

  /** The crew model: the townsman with his clips, one instanced skinned mesh for every gun's men. */
  private async loadCrew(base: string): Promise<void> {
    try {
      const response = await fetch(freshUrl(base, 'people/townsman.json'));
      if (!response.ok) throw new Error(`townsman ${response.status}`);
      const model = (await response.json()) as RiggedModel;
      const named = (name: string) => model.clips.find((c) => c.name === name);
      const [idle, walk, pickup, putdown] = [named('idle'), named('walk'), named('pickup'), named('putdown')];
      if (!idle || !walk || !pickup || !putdown) throw new Error('townsman lacks a clip');
      const n = model.positions.length / 3;
      const g = new BufferGeometry();
      interleave(g, [
        ['position', 3, model.positions],
        ['normal', 3, model.normals],
        ['color', 3, model.colours],
        ['aSurface', 3, model.surface],
      ]);
      interleave(g, [
        ['aSkin', 4, model.skin],
        ['aWeight', 4, model.weights],
        ['aPart', 4, new Float32Array(n * 4)],
      ]);
      g.setIndex(model.triangles);
      g.computeBoundingSphere();
      const capacity = 120;
      const instanced = (size: number): InstancedBufferAttribute => {
        const a = new InstancedBufferAttribute(new Float32Array(capacity * size), size);
        a.setUsage(DynamicDrawUsage);
        return a;
      };
      const place = instanced(4);
      const frame = instanced(1);
      const side = instanced(1);
      g.setAttribute('aPlace', place);
      g.setAttribute('aAnim', instanced(4));
      g.setAttribute('aSide', side);
      g.setAttribute('aFrame', frame);
      const mesh = new InstancedMesh(g, skinnedMaterial(boneTexture(model)), capacity);
      mesh.name = 'gun crews';
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.crew = { mesh, place, frame, side, clips: { idle, walk, pickup, putdown } };
    } catch (error) {
      console.warn(`[soldiers] no modelled gun crews (${String(error)}): they stay built into the guns`);
      this.crew = null;
    }
  }

  /** Each living gun's crew about it: walking beside it on the march, loading after a shot, else at ease. */
  private writeCrews(world: World): void {
    const crew = this.crew;
    if (!crew) return;
    const p = crew.place.array as Float32Array;
    const f = crew.frame.array as Float32Array;
    const sides = crew.side.array as Float32Array;
    const { idle, walk, pickup, putdown } = crew.clips;
    const cycle = (c: Clip & { fps: number }, phase: number): number => c.start + (Math.floor((((phase % 1) + 1) % 1) * c.frames) % c.frames);
    let n = 0;
    for (const r of world.regiments) {
      if (!r.def.engine) continue;
      const kind = r.kind as 'cannon' | 'mortar';
      const size = this.gunSizes.get(kind);
      if (!size) continue;
      const spots = gunCrewSpots(kind, size);
      for (const s of r.soldiers) {
        if (!s.alive) continue;
        const w = s.headingRad + Math.PI;
        const c = Math.cos(w);
        const sn = Math.sin(w);
        const speed = Math.hypot(s.vx, s.vz);
        for (let k = 0; k < spots.length && n < crew.mesh.instanceMatrix.count; k++) {
          const [x, z, turn] = spots[k] as [number, number, number];
          const wx = s.x + x * c + z * sn;
          const wz = s.z + z * c - x * sn;
          p[n * 4] = wx;
          p[n * 4 + 1] = heightAtM(wx, wz);
          p[n * 4 + 2] = wz;
          p[n * 4 + 3] = w + turn;
          sides[n] = r.side;
          const offset = s.slot * 1.9 + k * 0.7;
          let frame: number;
          if (speed > 0.25) frame = cycle(walk, s.strideM / Math.max(0.5, walk.travelM ?? 1.6));
          else if (s.sinceAttackS < r.def.reloadS * 0.8) {
            // Loading: the ball lifted from the pile, then set in.
            const pickS = pickup.frames / pickup.fps;
            const t = (s.sinceAttackS + offset) % (pickS + putdown.frames / putdown.fps);
            frame = t < pickS ? pickup.start + Math.floor(t * pickup.fps) : putdown.start + Math.min(putdown.frames - 1, Math.floor((t - pickS) * putdown.fps));
          } else frame = cycle(idle, (world.timeS + offset) / (idle.frames / idle.fps));
          f[n] = frame;
          n++;
        }
      }
    }
    crew.mesh.count = n;
    crew.place.needsUpdate = true;
    crew.frame.needsUpdate = true;
    crew.side.needsUpdate = true;
  }

  /** A mounted kind on the skinned horse: the horse on its own bones, the rider with his kit and the saddle
   * cloth riding its back (bound to the saddle's bone), his arm striking about his shoulder as before. */
  private useMounted(kind: UnitKind, horse: RiggedModel & { saddle: { bone: number; y: number; z: number } }, rider: BodyModel): boolean {
    const k = this.kinds.get(kind);
    const named = (name: string): (Clip & { fps: number }) | null => horse.clips.find((c) => c.name === name) ?? null;
    const [idle, walk, gallop] = [named('idle'), named('walk'), named('gallop')];
    if (!k || !idle || !walk || !gallop) return false;
    const nh = horse.positions.length / 3;
    // How wide the horse is under the saddle, for the cloth.
    let halfWidth = 0.2;
    for (let i = 0; i < nh; i++) {
      const y = horse.positions[i * 3 + 1] as number;
      if (Math.abs((horse.positions[i * 3 + 2] as number) - horse.saddle.z) < 0.35 && y > horse.saddle.y - 0.6) halfWidth = Math.max(halfWidth, Math.abs(horse.positions[i * 3] as number));
    }
    const saddle: Saddle = { y: horse.saddle.y, z: horse.saddle.z, halfWidth, fitted: true };
    const man = cavalryGeometryOnModels(kind, rider, null, saddle);
    const nr = man.getAttribute('position').count;
    const cloth = caparison(horse, kind === 'heavyCavalry');
    const nc = cloth.skin.length / 4;
    const total = nh + nc + nr;
    // The horse, its cloth (on the horse's bones), then the rider and his kit (on the saddle's bone).
    const join = (size: number, a: ArrayLike<number>, c: ArrayLike<number>, b: ArrayLike<number>): Float32Array => {
      const out = new Float32Array(total * size);
      out.set(Array.from(a).slice(0, nh * size));
      out.set(Array.from(c).slice(0, nc * size), nh * size);
      out.set(Array.from(b).slice(0, nr * size), (nh + nc) * size);
      return out;
    };
    const skin = new Float32Array(total * 4);
    const weights = new Float32Array(total * 4);
    skin.set(horse.skin);
    weights.set(horse.weights);
    skin.set(cloth.skin, nh * 4);
    weights.set(cloth.weights, nh * 4);
    for (let i = nh + nc; i < total; i++) {
      skin[i * 4] = horse.saddle.bone;
      weights[i * 4] = 1;
    }
    const g = new BufferGeometry();
    interleave(g, [
      ['position', 3, join(3, horse.positions, cloth.positions, man.getAttribute('position').array)],
      ['normal', 3, join(3, horse.normals, cloth.normals, man.getAttribute('normal').array)],
      ['color', 3, join(3, horse.colours, cloth.colours, man.getAttribute('color').array)],
      ['aSurface', 3, join(3, horse.surface, cloth.surface, man.getAttribute('aSurface').array)],
    ]);
    interleave(g, [
      ['aSkin', 4, skin],
      ['aWeight', 4, weights],
      ['aPart', 4, join(4, new Float32Array(nh * 4), new Float32Array(nc * 4), man.getAttribute('aPart').array)],
    ]);
    const index = new Uint32Array(horse.triangles.length + cloth.triangles.length + nr);
    index.set(horse.triangles);
    index.set(cloth.triangles.map((v) => v + nh), horse.triangles.length);
    for (let i = 0; i < nr; i++) index[horse.triangles.length + cloth.triangles.length + i] = nh + nc + i;
    g.setIndex(new BufferAttribute(index, 1));
    g.computeBoundingSphere();
    man.dispose();
    const frame = new InstancedBufferAttribute(new Float32Array(CAPACITY), 1);
    frame.setUsage(DynamicDrawUsage);
    g.setAttribute('aPlace', k.place);
    g.setAttribute('aAnim', k.anim);
    g.setAttribute('aSide', k.side);
    g.setAttribute('aFrame', frame);
    const old = k.mesh.geometry;
    k.mesh.geometry = g;
    k.mesh.material = skinnedMaterial(boneTexture(horse), true);
    old.dispose();
    k.skinned = {
      frame,
      fps: idle.fps,
      strikeStart: idle.start,
      strikeFrames: 1,
      strikes: [],
      guard: idle.start,
      blockHeld: idle.start,
      idle,
      walk,
      run: gallop,
      impact: null,
      deaths: [],
      draw: null,
      shield: false,
      reach: idle.start,
      horse: { idle, walk, gallop, graze: named('graze') },
    };
    return true;
  }

  /** Puts a kind on a skinned body with its clips; false if the file lacks what the game needs. */
  private useRigged(kind: UnitKind, model: RiggedModel): boolean {
    const k = this.kinds.get(kind);
    // The blow: a sword's slash or a polearm's thrust.
    // The blows: a sword's slash, a polearm's thrust or chop, a bow's loose. With several, the men take turns.
    const strikes: Clip[] = model.clips
      .filter((c) => /slash|thrust|stab|recoil|chop|lower/.test(c.name.toLowerCase()))
      .map((c) => ({ start: c.start, frames: c.frames, lower: c.name.toLowerCase() === 'lower' }));
    const strike = model.clips.find((c) => /slash|thrust|stab|recoil|chop|lower/.test(c.name.toLowerCase()));
    const block = model.clips.find((c) => c.name.toLowerCase().includes('block'));
    if (!k || !strike || !block) return false;
    const named = (name: string): Clip | null => model.clips.find((c) => c.name.toLowerCase() === name) ?? null;
    const deaths = model.clips.filter((c) => c.name.toLowerCase().startsWith('death'));
    const bones = boneTexture(model);
    // The legs' limb per vertex (by its heaviest bone), swinging about the hips while there is no walk clip.
    const legSide = model.bones.map((b) => (/^Left(UpLeg|Leg|Foot|ToeBase)$/.test(b) ? -1 : /^Right(UpLeg|Leg|Foot|ToeBase)$/.test(b) ? 1 : 0));
    const n = model.positions.length / 3;
    const upLeg = model.bones.indexOf('LeftUpLeg');
    let hipY = 0;
    let hipZ = 0;
    let hips = 0;
    for (let i = 0; i < n; i++) {
      if (model.skin[i * 4] !== upLeg) continue;
      hipY = Math.max(hipY, model.positions[i * 3 + 1] as number);
      hipZ += model.positions[i * 3 + 2] as number;
      hips++;
    }
    hipZ = hips > 0 ? hipZ / hips : 0;
    const part = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const s = legSide[model.skin[i * 4] as number] ?? 0;
      if (s === 0) continue;
      part[i * 4] = hipY;
      part[i * 4 + 1] = hipZ;
      part[i * 4 + 2] = s;
    }
    const g = new BufferGeometry();
    interleave(g, [
      ['position', 3, model.positions],
      ['normal', 3, model.normals],
      ['color', 3, model.colours],
      ['aSurface', 3, model.surface],
    ]);
    interleave(g, [
      ['aSkin', 4, model.skin],
      ['aWeight', 4, model.weights],
      ['aPart', 4, part],
    ]);
    g.setIndex(model.triangles);
    g.computeBoundingSphere();
    const frame = new InstancedBufferAttribute(new Float32Array(CAPACITY), 1);
    frame.setUsage(DynamicDrawUsage);
    g.setAttribute('aPlace', k.place);
    g.setAttribute('aAnim', k.anim);
    g.setAttribute('aSide', k.side);
    g.setAttribute('aFrame', frame);
    const old = k.mesh.geometry;
    k.mesh.geometry = g;
    k.mesh.material = skinnedMaterial(bones);
    old.dispose();
    k.skinned = {
      frame,
      fps: strike.fps,
      strikeStart: strike.start,
      strikeFrames: strike.frames,
      strikes,
      guard: block.start,
      blockHeld: block.start + Math.floor(block.frames * 0.5),
      idle: named('idle'),
      walk: named('walk'),
      run: named('run'),
      impact: named('impact'),
      deaths,
      draw: named('draw'),
      shield: model.skin.some((b, i) => i % 4 === 0 && b === model.bones.indexOf('Shield_joint')),
      reach: reachFrame(model, strike),
    };
    return true;
  }

  /** Writes one man into slot `i` of his kind's mesh. */
  private write(k: KindMesh, i: number, s: Soldier, timeS: number): void {
    const r = s.regiment;
    let fall = 0;
    let y = heightAtM(s.x, s.z);
    const sk = k.skinned;
    if (!s.alive) {
      // A body with a death clip falls as the clip falls; others topple over whole.
      if (!sk || sk.deaths.length === 0) fall = Math.min(1, s.deadS / FALL_S) * (Math.PI / 2);
      y -= Math.max(0, s.deadS - (ARMY.bodySeconds - SINK_S)) * 0.45;
    }
    const p = k.place.array as Float32Array;
    p[i * 4] = s.x;
    p[i * 4 + 1] = y;
    p[i * 4 + 2] = s.z;
    // The models face −Z; a heading h looks along (sin h, cos h): turn by h + π.
    p[i * 4 + 3] = s.headingRad + Math.PI;
    const a = k.anim.array as Float32Array;
    const speed = s.alive ? Math.hypot(s.vx, s.vz) : 0;
    const stride = r.def.cavalry ? HORSE_STRIDE_M : FOOT_STRIDE_M;
    // Wrapped to one turn: a large angle loses precision in a 32-bit sine.
    a[i * 4] = ((s.strideM / stride) % 1) * Math.PI * 2;
    // Legs swing fully from a brisk walk up; a shuffle into place barely moves them.
    a[i * 4 + 1] = Math.min(1, speed / (r.def.walkSpeedMs * 0.9));
    const strike = s.alive && s.sinceAttackS < STRIKE_S ? Math.sin((s.sinceAttackS / STRIKE_S) * Math.PI) : 0;
    a[i * 4 + 2] = strike * STRIKE_RAD;
    a[i * 4 + 3] = fall;
    (k.side.array as Float32Array)[i] = r.side;
    if (sk) {
      if (sk.walk) a[i * 4 + 1] = 0; // the clip walks; no swing of the legs on top
      (sk.frame.array as Float32Array)[i] = this.skinnedFrame(sk, s, speed, timeS);
    }
  }

  /** The clip frame a man of a skinned kind shows. In order: falling dead, the blow while it lasts, a
   * flinch when hurt, the walk or the run when on the move (in step with the ground he covers), the shield
   * up behind a shield wall, on guard near a fight, else at ease. */
  private skinnedFrame(sk: SkinnedKind, s: Soldier, speed: number, timeS: number): number {
    const at = (c: Clip, t: number): number => c.start + Math.min(c.frames - 1, Math.floor(t * sk.fps));
    const cycle = (c: Clip, phase: number): number => c.start + Math.floor((((phase % 1) + 1) % 1) * c.frames) % c.frames;
    const horse = sk.horse;
    if (horse) {
      // A horse: gallop or walk in step with the ground it covers; standing, or grazing at ease. A dead one
      // lies as it stood (the whole falls on its side).
      const loop = (c: Clip): number => cycle(c, timeS / (c.frames / sk.fps) + s.slot * 0.37);
      if (!s.alive) return horse.idle.start;
      if (speed > GALLOP_FROM_MS) return cycle(horse.gallop, s.strideM / GALLOP_CYCLE_M);
      if (speed > 0.25) return cycle(horse.walk, s.strideM / Math.max(0.5, horse.walk.travelM ?? 1));
      const hurtS = timeS - (s.hurtAtS ?? -1e9);
      const atEase = s.target === null && s.sinceAttackS > AT_EASE_AFTER_S && hurtS > AT_EASE_AFTER_S;
      return atEase && horse.graze && s.slot % 3 === 0 ? loop(horse.graze) : loop(horse.idle);
    }
    if (!s.alive) {
      const death = sk.deaths[s.slot % Math.max(1, sk.deaths.length)];
      return death ? at(death, s.deadS) : sk.guard;
    }
    // Each man his own blow, by his place in the ranks; the whole blow fits between two blows (a long one,
    // the halberd's thrust, is played faster).
    const blow = sk.strikes[s.slot % sk.strikes.length] as Clip;
    const strikeS = Math.min(blow.frames / sk.fps, s.regiment.def.attackIntervalS * 0.9);
    if (s.sinceAttackS < strikeS) {
      const t = s.sinceAttackS / strikeS;
      if (blow.lower) {
        // The bolt is loosed at the top of the raise: held at aim a moment, then the raise run backwards.
        if (t < HOLD_AFTER_SHOT) return blow.start + blow.frames - 1;
        return blow.start + Math.max(0, blow.frames - 1 - Math.floor(((t - HOLD_AFTER_SHOT) / (1 - HOLD_AFTER_SHOT)) * blow.frames));
      }
      return blow.start + Math.min(blow.frames - 1, Math.floor(t * blow.frames));
    }
    const hurtS = timeS - (s.hurtAtS ?? -1e9);
    if (sk.impact && hurtS >= 0 && hurtS < sk.impact.frames / sk.fps) return at(sk.impact, hurtS);
    const r = s.regiment;
    if (speed > 0.25) {
      if (sk.run && speed > (r.def.walkSpeedMs + r.def.runSpeedMs) / 2) return cycle(sk.run, s.strideM / RUN_CYCLE_M);
      // A walk that moved as it was recorded says how far one cycle goes; an in-place one keeps the measured 1.6 m.
      if (sk.walk) return cycle(sk.walk, s.strideM / ((sk.walk.travelM ?? 0) > 0.5 ? (sk.walk.travelM as number) : WALK_CYCLE_M));
    }
    if (sk.draw) {
      // A bowman shooting: the draw in the last moments before his next shot, the bow at rest between.
      const drawS = sk.draw.frames / sk.fps;
      const shooting = s.sinceAttackS < r.def.reloadS * 1.6;
      if (shooting && s.attackCooldownS < drawS) return at(sk.draw, drawS - s.attackCooldownS);
      return sk.idle ? cycle(sk.idle, timeS / (sk.idle.frames / sk.fps) + s.slot * 0.37) : sk.guard;
    }
    if (r.stance === 'shields') return sk.blockHeld;
    if (r.stance === 'pikeWall') return sk.reach;
    const fighting = s.target !== null || s.sinceAttackS < AT_EASE_AFTER_S || hurtS < AT_EASE_AFTER_S;
    // At ease each man is somewhere else in the idle, so a rank does not breathe as one.
    if (!fighting && sk.idle) return cycle(sk.idle, timeS / (sk.idle.frames / sk.fps) + s.slot * 0.37);
    // On guard: behind the shield if he has one, else with his weapon levelled at the enemy.
    return sk.shield ? sk.guard : sk.reach;
  }

  update(world: World): void {
    for (const k of this.kinds.values()) k.mesh.count = 0;
    for (const r of world.regiments) {
      const k = this.kinds.get(r.kind) as KindMesh;
      for (const s of r.soldiers) {
        if (!s.alive && s.deadS >= ARMY.bodySeconds) continue;
        if (k.mesh.count >= CAPACITY) break;
        this.write(k, k.mesh.count++, s, world.timeS);
      }
    }
    this.writeGarrisons(world);
    this.writeCrews(world);
    for (const k of this.kinds.values()) {
      if (k.skinned) k.skinned.frame.needsUpdate = true;
      k.place.needsUpdate = true;
      k.anim.needsUpdate = true;
      k.side.needsUpdate = true;
    }
    this.updateArrows(world);
  }

  /** The men manning each watchtower, on its top: one at each corner, looking out towards the enemy's keep. */
  private writeGarrisons(world: World): void {
    for (const town of world.towns) {
      const foe = enemyOf(town.side);
      for (const b of town.plots) {
        if (!b || b.kind !== 'tower' || b.garrison <= 0 || b.garrisonKind === null || b.constructionLeftS > 0) continue;
        const k = this.kinds.get(b.garrisonKind) as KindMesh;
        const top = groundUnder(b.x, b.z, b.yawRad)[1] + TOWER.topM;
        const look = Math.atan2(townX(foe) - b.x, townZ(foe) - b.z);
        // Drawing and loosing while the tower shoots: a man's arms come up for the first part of each reload.
        const reload = UNITS[b.garrisonKind].reloadS / Math.max(1, b.garrison);
        const strike = b.shotS > reload * 0.6 ? Math.sin(((reload - b.shotS) / (reload * 0.4)) * Math.PI) : 0;
        const c = Math.cos(b.yawRad);
        const sn = Math.sin(b.yawRad);
        for (let m = 0; m < Math.min(b.garrison, TOWER.maxGarrison); m++) {
          if (k.mesh.count >= CAPACITY) break;
          const i = k.mesh.count++;
          // The corners of the platform, turned with the tower.
          const ax = (m % 2 === 0 ? -1 : 1) * 1.3;
          const az = (m < 2 ? -1 : 1) * 1.3;
          const p = k.place.array as Float32Array;
          p[i * 4] = b.x + ax * c + az * sn;
          p[i * 4 + 1] = top;
          p[i * 4 + 2] = b.z - ax * sn + az * c;
          p[i * 4 + 3] = look + Math.PI;
          const a = k.anim.array as Float32Array;
          a[i * 4] = 0;
          a[i * 4 + 1] = 0;
          a[i * 4 + 2] = m === 0 ? strike * STRIKE_RAD : 0;
          a[i * 4 + 3] = 0;
          (k.side.array as Float32Array)[i] = town.side;
        }
      }
    }
  }

  private updateArrows(world: World): void {
    const e = this.arrows.instanceMatrix.array as Float32Array;
    const st = this.stones.instanceMatrix.array as Float32Array;
    let n = 0;
    let stones = 0;
    for (const a of world.arrows) {
      if (!a.active) continue;
      const x = a.x0 + a.vx * a.ageS;
      const y = arrowY(a);
      const z = a.z0 + a.vz * a.ageS;
      if (a.look >= 2) {
        if (stones >= 32) continue;
        // A ball: no heading, just a place and its size.
        const o = stones * 16;
        const ball = BALL_SCALE[a.look] ?? 1;
        st.fill(0, o, o + 16);
        st[o] = st[o + 5] = st[o + 10] = ball;
        st[o + 15] = 1;
        st[o + 12] = x;
        st[o + 13] = y;
        st[o + 14] = z;
        stones++;
        continue;
      }
      // Forward (−Z of the model) along the velocity: build the basis from it.
      const vy = a.vy - MISSILE.gravityMs2 * a.ageS;
      const len = Math.hypot(a.vx, vy, a.vz) || 1;
      const fx = a.vx / len;
      const fy = vy / len;
      const fz = a.vz / len;
      // right = forward × up, normalised; up' = right × forward.
      const flat = Math.hypot(fx, fz) || 1;
      const rx = -fz / flat;
      const rz = fx / flat;
      const ux = -rz * fy;
      const uy = rz * fx - rx * fz;
      const uz = rx * fy;
      // A crossbow bolt is short and stout.
      const size = BOLT_SCALE[a.look] ?? 1;
      const o = n * 16;
      e[o] = rx * size;
      e[o + 1] = 0;
      e[o + 2] = rz * size;
      e[o + 3] = 0;
      e[o + 4] = ux * size;
      e[o + 5] = uy * size;
      e[o + 6] = uz * size;
      e[o + 7] = 0;
      e[o + 8] = -fx * size;
      e[o + 9] = -fy * size;
      e[o + 10] = -fz * size;
      e[o + 11] = 0;
      e[o + 12] = x;
      e[o + 13] = y;
      e[o + 14] = z;
      e[o + 15] = 1;
      n++;
    }
    this.arrows.count = n;
    this.arrows.instanceMatrix.needsUpdate = true;
    this.stones.count = stones;
    this.stones.instanceMatrix.needsUpdate = true;
  }
}
