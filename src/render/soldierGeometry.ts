import { BufferAttribute, BufferGeometry } from 'three/webgpu';
import type { UnitKind } from '../sim/types.ts';
import { MeshBuilder, type Vec3 } from './meshBuilder.ts';

// Soldiers and horses from boxes, true to scale (a man 1.8 m, a horse 1.6 m at
// the withers), facing −Z. Limbs carry a pivot and swing factors per vertex so
// the vertex shader can walk them and strike with them (armyView.ts): one draw
// call per kind of unit, however many men. From 40–260 m a figure is a dozen
// pixels tall; modelled, mocapped bodies replace these in stage 5.
//
// Per vertex: `aPart` = (pivot height, pivot depth, walk swing, attack swing),
// `aSurface` = (metalness, roughness, share of the team colour).

const SKIN = 0xc49a7a;
const TUNIC_BROWN = 0x6e5a41;
const TUNIC_GREEN = 0x4f5a39;
const LEATHER = 0x6b4a2f;
const HOSE = 0x4b4136;
const WOOD = 0x6a5038;
const WOOD_DARK = 0x4a3b30;
/** Bare steel: metals are bright (PBR sheet, iron F0). */
const STEEL = 0xc4c5c8;
const STRAW = 0xb9a25a;
const HORSE_BAY = 0x5b3f2c;
const HORSE_GREY = 0x8b8780;
const MANE = 0x2e2824;
const WHITE = 0xffffff;

type Part = readonly [pivotY: number, pivotZ: number, walk: number, attack: number];
const BODY: Part = [0, 0, 0, 0];

class Figure {
  readonly b = new MeshBuilder(7);

  private set(part: Part, metal: number, rough: number, team: number): void {
    this.b.extra = [part[0], part[1], part[2], part[3], metal, rough, team];
  }

  cloth(part: Part = BODY): this {
    this.set(part, 0, 0.9, 0);
    return this;
  }

  steel(part: Part = BODY): this {
    this.set(part, 1, 0.42, 0);
    return this;
  }

  /** Painted in the owner's colour: give the vertices white and the shader tints them. */
  team(part: Part = BODY): this {
    this.set(part, 0, 0.7, 1);
    return this;
  }
}

interface Kit {
  tunic: number;
  head: 'none' | 'hat' | 'helmet' | 'hood';
  mail: boolean;
  weapon: 'spear' | 'pike' | 'halberd' | 'sword' | 'bow' | 'crossbow' | 'lance' | 'none';
  shield: boolean;
}

/** Length of each pole weapon in metres. */
const POLE_M = { spear: 2.2, pike: 4.6, halberd: 2.4, lance: 3.4 } as const;

/**
 * A man standing with his feet at `y0`; `mounted` spreads the legs round a horse. With `rigged` false
 * (an engine's crew, drawn away from the model's middle) his limbs carry no pivots and stay still.
 */
function man(f: Figure, kit: Kit, y0: number, mounted: boolean, rigged = true, body = true, coat = true): void {
  const b = f.b;
  const hip = y0 + 0.86;
  const shoulder = y0 + 1.44;
  const limb = (part: Part): Part => (rigged ? part : BODY);
  if (!body) {
    // The body is a modelled one (a knight in plate): only the surcoat in the side's colours, front and
    // back, over the breastplate, and the weapon and shield below.
    if (coat) {
      f.team();
      b.box(0, hip - 0.02, -0.19, 0.38, 0.56, 0.025, WHITE);
      b.box(0, hip - 0.02, 0.16, 0.38, 0.56, 0.025, WHITE);
    }
    arms(f, kit, y0, limb);
    return;
  }
  // Legs: opposite phases.
  const legX = mounted ? 0.36 : 0.11;
  for (const side of [-1, 1]) {
    f.cloth(mounted ? BODY : limb([hip, 0, side, 0]));
    if (mounted) b.box(side * legX, y0 + 0.25, -0.05, 0.17, 0.7, 0.24, kit.mail ? STEEL : HOSE);
    else b.box(side * legX, y0, 0, 0.17, 0.86, 0.2, HOSE);
  }
  // Torso, with the owner's colour across the shoulders so the side reads from above.
  if (kit.mail) f.steel();
  else f.cloth();
  b.box(0, hip, 0, 0.44, 0.42, 0.27, kit.mail ? STEEL : kit.tunic);
  f.team();
  b.box(0, hip + 0.42, 0, 0.47, 0.2, 0.29, WHITE);
  // Head.
  f.cloth();
  b.box(0, shoulder + 0.06, 0, 0.21, 0.24, 0.22, SKIN);
  if (kit.head === 'helmet') {
    f.steel();
    b.box(0, shoulder + 0.22, 0, 0.26, 0.14, 0.27, STEEL);
    b.box(0, shoulder + 0.2, 0, 0.36, 0.04, 0.37, STEEL);
  } else if (kit.head === 'hat') {
    b.box(0, shoulder + 0.28, 0, 0.42, 0.05, 0.42, STRAW);
    b.box(0, shoulder + 0.33, 0, 0.2, 0.08, 0.2, STRAW);
  } else if (kit.head === 'hood') {
    b.box(0, shoulder + 0.2, 0.02, 0.27, 0.16, 0.28, kit.tunic);
  }
  // Left arm.
  const leftArm: Part = limb([shoulder, 0, -0.5, 0]);
  f.cloth(leftArm);
  b.box(-0.3, shoulder - 0.58, 0, 0.13, 0.58, 0.14, kit.mail ? STEEL : kit.tunic);
  // Right arm.
  f.cloth(limb([shoulder, 0, 0.5, -0.45]));
  b.box(0.3, shoulder - 0.58, 0, 0.13, 0.58, 0.14, kit.mail ? STEEL : kit.tunic);
  arms(f, kit, y0, limb);
}

/**
 * A heater shield: flat along the top, its sides running down into a point, bowed forward, with a rim in
 * `rimHex`. Faces the man's front (−Z); `cx`, `y0`, `cz`: the middle of its bottom point.
 */
function heater(f: Figure, cx: number, y0: number, cz: number, width: number, height: number, faceHex: number, rimHex: number, face: () => void, rim: () => void): void {
  const b = f.b;
  const half = width / 2;
  const shoulderV = height * 0.45;
  const bow = width * 0.12;
  const thick = 0.025;
  // The outline, from the top left round by the right and the point back to the top left.
  const outline: [number, number][] = [[-half, height], [half, height]];
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    outline.push([half * Math.cos(a), shoulderV * (1 - Math.sin(a))]);
  }
  for (let i = 5; i >= 0; i--) {
    const a = (i / 6) * (Math.PI / 2);
    outline.push([-half * Math.cos(a), shoulderV * (1 - Math.sin(a))]);
  }
  const at = (u: number, v: number, side: number): Vec3 => [cx + u, y0 + v, cz + side * (thick / 2) - bow * (1 - (u / half) ** 2)];
  // A triangle turned to face `towards` (−1: forward, +1: back).
  const facing = (a: Vec3, c: Vec3, d: Vec3, towards: number, hex: number): void => {
    const nz = (c[0] - a[0]) * (d[1] - a[1]) - (c[1] - a[1]) * (d[0] - a[0]);
    if (nz * towards > 0) b.tri(a, c, d, hex);
    else b.tri(a, d, c, hex);
  };
  const centre: [number, number] = [0, height * 0.6];
  face();
  for (const side of [-1, 1]) {
    for (let i = 0; i < outline.length; i++) {
      const p = outline[i] as [number, number];
      const q = outline[(i + 1) % outline.length] as [number, number];
      facing(at(centre[0], centre[1], side), at(p[0], p[1], side), at(q[0], q[1], side), side, faceHex);
    }
  }
  rim();
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i] as [number, number];
    const q = outline[(i + 1) % outline.length] as [number, number];
    b.quad(at(p[0], p[1], -1), at(q[0], q[1], -1), at(q[0], q[1], 1), at(p[0], p[1], 1), rimHex);
  }
}

/** What a man carries: his shield on the left arm and his weapon in the right hand (they swing with the arms). */
function arms(f: Figure, kit: Kit, y0: number, limb: (part: Part) => Part): void {
  const b = f.b;
  const hip = y0 + 0.86;
  const shoulder = y0 + 1.44;
  if (kit.shield) {
    const part = limb([shoulder, 0, -0.15, 0]);
    heater(f, -0.36, y0 + 0.74, -0.17, 0.5, 0.74, WHITE, STEEL, () => f.team(part), () => f.steel(part));
  }
  // The weapon swings down with the right arm.
  const weapon: Part = limb([shoulder - 0.5, -0.1, 0.12, 1]);
  if (kit.weapon === 'spear' || kit.weapon === 'pike' || kit.weapon === 'halberd' || kit.weapon === 'lance') {
    const length = POLE_M[kit.weapon];
    const base = shoulder - 0.5 - length * 0.3;
    f.cloth(weapon);
    b.box(0.33, base, -0.12, 0.05, length, 0.05, WOOD);
    f.steel(weapon);
    if (kit.weapon === 'halberd') {
      // An axe blade, a back spike and a top spike.
      b.box(0.33, base + length - 0.45, -0.25, 0.03, 0.34, 0.24, STEEL);
      b.box(0.33, base + length - 0.33, 0.0, 0.03, 0.08, 0.16, STEEL);
      b.box(0.33, base + length, -0.12, 0.04, 0.34, 0.03, STEEL);
    } else {
      b.box(0.33, base + length, -0.12, 0.08, 0.32, 0.03, STEEL);
    }
    if (kit.weapon === 'lance') {
      f.team(weapon);
      b.box(0.33, base + length - 0.5, -0.02, 0.02, 0.26, 0.42, WHITE);
    }
  } else if (kit.weapon === 'sword') {
    f.steel(weapon);
    b.box(0.33, shoulder - 0.52, -0.12, 0.05, 0.95, 0.02, STEEL);
    b.box(0.33, shoulder - 0.54, -0.12, 0.2, 0.04, 0.05, STEEL);
  } else if (kit.weapon === 'bow') {
    // A bow in the left hand, a quiver on the back; the right arm draws.
    f.cloth(limb([shoulder, 0, -0.15, 0]));
    b.box(-0.33, y0 + 0.62, -0.26, 0.04, 1.5, 0.05, WOOD);
    b.box(-0.33, y0 + 0.62, -0.2, 0.012, 1.5, 0.012, STRAW);
    f.cloth();
    b.box(0.1, hip + 0.1, 0.19, 0.14, 0.6, 0.12, LEATHER);
  } else if (kit.weapon === 'crossbow') {
    // Held level at the chest: the stock points forward, the bow lies across it.
    f.cloth();
    b.box(0.0, shoulder - 0.28, -0.42, 0.07, 0.07, 0.8, WOOD);
    f.steel();
    b.box(0.0, shoulder - 0.27, -0.74, 0.78, 0.04, 0.05, STEEL);
    f.cloth();
    b.box(0.12, hip + 0.05, 0.19, 0.16, 0.34, 0.12, LEATHER);
  }
}

/** Squared timber between two points in the model's YZ plane at a given X (an engine's frame). */
function beam(f: Figure, x: number, y0: number, z0: number, y1: number, z1: number, thick: number, hex: number): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(y1 - y0, z1 - z0) / 0.45));
  // A slanted beam as a run of short blocks: the builder only makes upright boxes.
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    f.b.box(x, y0 + (y1 - y0) * t - thick / 2, z0 + (z1 - z0) * t, thick, thick + Math.abs(y1 - y0) / steps, thick + Math.abs(z1 - z0) / steps, hex);
  }
}

const CREW: Kit = { tunic: TUNIC_BROWN, head: 'hood', mail: false, weapon: 'none', shield: false };

/** A field gun on its carriage, built (the modelled one replaces it once loaded), with its crew of two. Shoots towards −Z. */
function cannon(f: Figure): void {
  const b = f.b;
  f.cloth();
  // Trail and cheeks, two wheels, the barrel on top.
  b.box(0, 0.35, 0.5, 0.7, 0.3, 2.0, WOOD);
  for (const dx of [-0.6, 0.6]) b.log(dx, 0.55, -0.2, 0.55, 0.12, 12, WOOD_DARK);
  f.steel();
  b.at(0, 0.95, -0.5, Math.PI / 2);
  b.log(0, 0, 0, 0.17, 2.0, 10, STEEL);
  b.at(0, 0, 0, 0);
  f.team();
  b.box(0, 0.55, 1.45, 0.6, 0.4, 0.06, WHITE);
  gunCrew(f, [[1.15, 0.9, 0.3], [-1.15, 0.5, -0.3]]);
}

/** A mortar on its bed, built (the modelled one replaces it once loaded), with its crew of three. */
function mortar(f: Figure): void {
  const b = f.b;
  f.cloth();
  b.box(0, 0, 0.1, 1.3, 0.6, 1.6, WOOD_DARK);
  f.steel();
  // The squat barrel, raised steeply towards −Z.
  beam(f, 0, 0.6, 0.3, 1.5, -0.5, 0.6, STEEL);
  f.team();
  b.box(0, 0.25, 0.92, 1.0, 0.3, 0.05, WHITE);
  gunCrew(f, [[1.3, 1.2, 0.4], [-1.3, 0.9, -0.5], [1.1, -0.9, 0.2]]);
}

/** The men who serve a gun, standing about it (x, z, turn). */
function gunCrew(f: Figure, spots: readonly (readonly [number, number, number])[]): void {
  for (const [x, z, turn] of spots) {
    f.b.at(x, 0, z, turn);
    man(f, CREW, 0, false, false);
  }
  f.b.at(0, 0, 0, 0);
}

/** A modelled prop (tools/blender/prop.py) as the game's guns use it. */
export interface GunModel {
  size: number[];
  positions: number[];
  normals: number[];
  colours: number[];
  triangles: number[];
}

/** Where a gun's crew stand about it, in the gun's own space (x, z, turn): beside the carriage and behind. */
export function gunCrewSpots(kind: 'cannon' | 'mortar', size: readonly number[]): [number, number, number][] {
  const back = (size[2] as number) / 2 + 0.2;
  const side = (size[0] as number) / 2 + 0.6;
  return kind === 'cannon' ? [[side, 0.6, 0.3], [-side, 0.2, -0.3]] : [[side, 0.9, 0.4], [-side, 0.6, -0.5], [0.4, back + 0.9, 0.2]];
}

/** A gun from its model (barrel along −Z, on the ground) with a small flag in the side's colour, and its crew
 * built in unless they are drawn as modelled men of their own (`crew` false). */
export function engineGeometryOnModel(kind: 'cannon' | 'mortar', model: GunModel, crew = true): BufferGeometry {
  const f = new Figure();
  f.cloth();
  f.b.model(model, 0, 0, 0, 0, 1);
  f.team();
  const back = (model.size[2] as number) / 2 + 0.2;
  f.b.box(0, 0, back, 0.05, 1.6, 0.05, WOOD_DARK);
  f.b.box(0.25, 1.15, back, 0.5, 0.35, 0.03, WHITE);
  if (crew) gunCrew(f, gunCrewSpots(kind, model.size));
  return finish(f.b.build('extra'));
}

function horse(f: Figure, coat: number, caparison: boolean): void {
  const b = f.b;
  const belly = 0.88;
  f.cloth();
  b.box(0, belly, 0, 0.58, 0.66, 2.0, coat);
  // Neck and head, forward (−Z) and up.
  b.box(0, belly + 0.5, -1.0, 0.3, 0.75, 0.42, coat);
  b.box(0, belly + 1.0, -1.38, 0.24, 0.3, 0.62, coat);
  b.box(0, belly + 0.58, -0.84, 0.08, 0.7, 0.12, MANE);
  b.box(0, belly - 0.2, 1.02, 0.1, 0.7, 0.1, MANE);
  if (caparison) {
    f.team();
    b.box(0, belly - 0.12, 0.05, 0.64, 0.84, 1.7, WHITE);
  }
  // Legs trot in diagonal pairs.
  for (const dx of [-1, 1]) {
    for (const dz of [-1, 1]) {
      const z = dz * 0.78;
      f.cloth([belly + 0.05, z, dx * dz, 0]);
      b.box(dx * 0.2, 0, z, 0.15, belly + 0.05, 0.17, coat);
    }
  }
}

const KITS: Record<Exclude<UnitKind, 'cannon' | 'mortar'>, Kit> = {
  militia: { tunic: TUNIC_BROWN, head: 'hood', mail: false, weapon: 'spear', shield: true },
  pikemen: { tunic: LEATHER, head: 'helmet', mail: false, weapon: 'pike', shield: false },
  archers: { tunic: TUNIC_GREEN, head: 'hood', mail: false, weapon: 'bow', shield: false },
  swordsmen: { tunic: LEATHER, head: 'helmet', mail: true, weapon: 'sword', shield: true },
  halberdiers: { tunic: LEATHER, head: 'helmet', mail: true, weapon: 'halberd', shield: false },
  crossbowmen: { tunic: TUNIC_GREEN, head: 'helmet', mail: false, weapon: 'crossbow', shield: false },
  lightCavalry: { tunic: LEATHER, head: 'helmet', mail: false, weapon: 'spear', shield: true },
  heavyCavalry: { tunic: LEATHER, head: 'helmet', mail: true, weapon: 'lance', shield: true },
};

export function soldierGeometry(kind: UnitKind): BufferGeometry {
  const f = new Figure();
  if (kind === 'cannon') cannon(f);
  else if (kind === 'mortar') mortar(f);
  else if (kind === 'lightCavalry' || kind === 'heavyCavalry') {
    horse(f, kind === 'heavyCavalry' ? HORSE_GREY : HORSE_BAY, kind === 'heavyCavalry');
    man(f, KITS[kind], 0.72, true);
  } else {
    man(f, KITS[kind], 0, false);
  }
  return finish(f.b.build('extra'));
}

/** Splits the builder's seven extra values into the two attributes the shader reads. */
function finish(g: BufferGeometry): BufferGeometry {
  const extra = g.getAttribute('extra') as BufferAttribute;
  const part = new Float32Array(extra.count * 4);
  const surface = new Float32Array(extra.count * 3);
  for (let i = 0; i < extra.count; i++) {
    for (let k = 0; k < 4; k++) part[i * 4 + k] = extra.array[i * 7 + k] as number;
    for (let k = 0; k < 3; k++) surface[i * 3 + k] = extra.array[i * 7 + 4 + k] as number;
  }
  g.deleteAttribute('extra');
  g.setAttribute('aPart', new BufferAttribute(part, 4));
  g.setAttribute('aSurface', new BufferAttribute(surface, 3));
  return g;
}

/** A modelled body (tools/blender/soldiers.py): limbs per vertex and the joints they turn about. */
export interface BodyModel {
  pivots: { hipY: number; hipZ: number; shoulderY: number; shoulderZ: number };
  positions: number[];
  normals: number[];
  colours: number[];
  surface: number[];
  limbs: number[];
  triangles: number[];
}

/**
 * A soldier on a modelled body: the body's triangles with each limb set to swing about its joint as the
 * boxes' did (legs in opposite phases, the right arm striking), and the kind's weapon, shield and surcoat
 * from the code. Foot soldiers only: a rider sits.
 */
export function soldierGeometryOnBody(kind: UnitKind, body: BodyModel): BufferGeometry {
  const f = new Figure();
  man(f, KITS[kind as keyof typeof KITS], 0, false, true, false);
  const extras = finish(f.b.build('extra'));
  const { hipY, hipZ, shoulderY, shoulderZ } = body.pivots;
  // Per limb: (pivot height, pivot depth, walk swing, strike swing), as man() gives the boxes.
  const PARTS: readonly (readonly [number, number, number, number])[] = [
    [0, 0, 0, 0],
    [hipY, hipZ, -1, 0],
    [hipY, hipZ, 1, 0],
    [shoulderY, shoulderZ, -0.5, 0],
    [shoulderY, shoulderZ, 0.5, -0.45],
  ];
  const n = body.triangles.length;
  const m = extras.getAttribute('position').count;
  const position = new Float32Array((n + m) * 3);
  const normal = new Float32Array((n + m) * 3);
  const color = new Float32Array((n + m) * 3);
  const part = new Float32Array((n + m) * 4);
  const surface = new Float32Array((n + m) * 3);
  for (let k = 0; k < n; k++) {
    const v = body.triangles[k] as number;
    for (let a = 0; a < 3; a++) {
      position[k * 3 + a] = body.positions[v * 3 + a] as number;
      normal[k * 3 + a] = body.normals[v * 3 + a] as number;
      color[k * 3 + a] = body.colours[v * 3 + a] as number;
    }
    const p = PARTS[body.limbs[v] as number] ?? (PARTS[0] as readonly [number, number, number, number]);
    for (let a = 0; a < 4; a++) part[k * 4 + a] = p[a] as number;
    surface[k * 3] = body.surface[v * 2] as number;
    surface[k * 3 + 1] = body.surface[v * 2 + 1] as number;
    surface[k * 3 + 2] = 0;
  }
  const copy = (name: string, out: Float32Array, size: number): void => {
    const src = extras.getAttribute(name).array as Float32Array;
    out.set(src.subarray(0, m * size), n * size);
  };
  copy('position', position, 3);
  copy('normal', normal, 3);
  copy('color', color, 3);
  copy('aPart', part, 4);
  copy('aSurface', surface, 3);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(position, 3));
  g.setAttribute('normal', new BufferAttribute(normal, 3));
  g.setAttribute('color', new BufferAttribute(color, 3));
  g.setAttribute('aPart', new BufferAttribute(part, 4));
  g.setAttribute('aSurface', new BufferAttribute(surface, 3));
  g.computeBoundingSphere();
  return g;
}

/** A modelled horse (tools/blender/horse.py): legs per vertex as (pivot height, pivot depth, walk swing), and the saddle. */
export interface HorseModel {
  saddle: { y: number; z: number };
  positions: number[];
  normals: number[];
  colours: number[];
  surface: number[];
  parts: number[];
  triangles: number[];
}

/** Where a rider sits on a horse (the top of its back) and, for a saddle cloth, how wide the horse is there. */
export interface Saddle {
  y: number;
  z: number;
  halfWidth?: number;
  /** The horse's cloth is cut from its own skin elsewhere; the rider's surcoat is cut here from his body
   * (both lie on the body they cover, not as boxes). */
  fitted?: boolean;
}

/** A surcoat fitted to a modelled rider: his torso and thighs, a little out from the plate. */
const SURCOAT_OUT_M = 0.022;

/**
 * A horseman on modelled bodies: the horse with its legs walking in diagonal pairs, the knight seated in
 * the saddle (his arms swing and strike as a foot soldier's), and the kind's lance or spear, shield and
 * surcoat from the code. With no horse (`null`, the horse drawn skinned on its own bones) only the rider
 * and his kit, set in `saddle`, with a saddle cloth in the side's colours over the horse's flanks.
 */
export function cavalryGeometryOnModels(kind: UnitKind, rider: BodyModel, horse: HorseModel | null, saddle: Saddle = (horse as HorseModel).saddle): BufferGeometry {
  const f = new Figure();
  const dy = saddle.y - rider.pivots.hipY;
  const dz = saddle.z - rider.pivots.hipZ;
  // The code's figure measures from the feet: its hips (0.86 up) in the saddle.
  man(f, KITS[kind as keyof typeof KITS], saddle.y - 0.86, true, true, false, !saddle.fitted);
  if (saddle.halfWidth !== undefined && !saddle.fitted) {
    // The cloth: over the back under the saddle and down both flanks; a heavy horseman's longer and deeper.
    const heavy = kind === 'heavyCavalry';
    const [length, drop] = heavy ? [1.1, 0.62] : [0.7, 0.4];
    const x = saddle.halfWidth + 0.02;
    f.team();
    f.b.box(0, saddle.y - 0.02, saddle.z, x * 2, 0.04, length, WHITE);
    for (const side of [-1, 1]) f.b.box(side * x, saddle.y - drop, saddle.z, 0.03, drop, length, WHITE);
    f.cloth();
    f.b.box(0, saddle.y, saddle.z + 0.05, 0.42, 0.1, 0.55, WOOD_DARK);
  }
  const extras = finish(f.b.build('extra'));
  const { shoulderY, shoulderZ } = rider.pivots;
  const ARM: readonly (readonly [number, number, number, number])[] = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [shoulderY + dy, shoulderZ + dz, -0.5, 0],
    [shoulderY + dy, shoulderZ + dz, 0.5, -0.45],
  ];
  const nh = horse ? horse.triangles.length : 0;
  const nr = rider.triangles.length;
  const m = extras.getAttribute('position').count;
  // The surcoat: whole triangles of his body (not the arms) between mid-thigh and the collar.
  const coat: number[] = [];
  if (saddle.fitted) {
    const { hipY, shoulderY } = rider.pivots;
    for (let k = 0; k + 2 < nr; k += 3) {
      const corners = [rider.triangles[k], rider.triangles[k + 1], rider.triangles[k + 2]] as number[];
      if (corners.every((v) => rider.limbs[v] === 0 && (rider.positions[v * 3 + 1] as number) > hipY - 0.22 && (rider.positions[v * 3 + 1] as number) < shoulderY - 0.03)) coat.push(...corners);
    }
  }
  const total = nh + nr + m + coat.length;
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);
  const part = new Float32Array(total * 4);
  const surface = new Float32Array(total * 3);
  for (let k = 0; horse && k < nh; k++) {
    const v = horse.triangles[k] as number;
    for (let a = 0; a < 3; a++) {
      position[k * 3 + a] = horse.positions[v * 3 + a] as number;
      normal[k * 3 + a] = horse.normals[v * 3 + a] as number;
      color[k * 3 + a] = horse.colours[v * 3 + a] as number;
      surface[k * 3 + a] = horse.surface[v * 3 + a] as number;
    }
    part[k * 4] = horse.parts[v * 3] as number;
    part[k * 4 + 1] = horse.parts[v * 3 + 1] as number;
    part[k * 4 + 2] = horse.parts[v * 3 + 2] as number;
  }
  for (let k = 0; k < nr; k++) {
    const v = rider.triangles[k] as number;
    const o = nh + k;
    position[o * 3] = rider.positions[v * 3] as number;
    position[o * 3 + 1] = (rider.positions[v * 3 + 1] as number) + dy;
    position[o * 3 + 2] = (rider.positions[v * 3 + 2] as number) + dz;
    for (let a = 0; a < 3; a++) {
      normal[o * 3 + a] = rider.normals[v * 3 + a] as number;
      color[o * 3 + a] = rider.colours[v * 3 + a] as number;
    }
    const p = ARM[rider.limbs[v] as number] ?? (ARM[0] as readonly [number, number, number, number]);
    for (let a = 0; a < 4; a++) part[o * 4 + a] = p[a] as number;
    surface[o * 3] = rider.surface[v * 2] as number;
    surface[o * 3 + 1] = rider.surface[v * 2 + 1] as number;
  }
  const copy = (name: string, out: Float32Array, size: number): void => {
    out.set((extras.getAttribute(name).array as Float32Array).subarray(0, m * size), (nh + nr) * size);
  };
  copy('position', position, 3);
  copy('normal', normal, 3);
  copy('color', color, 3);
  copy('aPart', part, 4);
  copy('aSurface', surface, 3);
  for (let k = 0; k < coat.length; k++) {
    const v = coat[k] as number;
    const o = nh + nr + m + k;
    const [px, py, pz] = [rider.positions[v * 3] as number, rider.positions[v * 3 + 1] as number, rider.positions[v * 3 + 2] as number];
    const [qx, qy, qz] = [rider.normals[v * 3] as number, rider.normals[v * 3 + 1] as number, rider.normals[v * 3 + 2] as number];
    position.set([px + qx * SURCOAT_OUT_M, py + qy * SURCOAT_OUT_M + dy, pz + qz * SURCOAT_OUT_M + dz], o * 3);
    normal.set([qx, qy, qz], o * 3);
    color.set([0.85, 0.84, 0.8], o * 3);
    surface.set([0, 0.92, 0.88], o * 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(position, 3));
  g.setAttribute('normal', new BufferAttribute(normal, 3));
  g.setAttribute('color', new BufferAttribute(color, 3));
  g.setAttribute('aPart', new BufferAttribute(part, 4));
  g.setAttribute('aSurface', new BufferAttribute(surface, 3));
  g.computeBoundingSphere();
  return g;
}
