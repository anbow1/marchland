import { MAP, POINTS, TOWN } from '../config.ts';
import { fbm2 } from '../core/noise.ts';
import type { Side } from './types.ts';
import { hypot2 } from '../core/hypot.ts';
import { LAYOUT, PLAYER_SITE } from './layout.ts';

// The map as functions of (x, z): height, forest, water, and the outcrops of
// stone and ore. The renderer draws from the same functions, so what the
// player sees is what the rules use (rules §9).
// X runs east, Z runs south, Y is up; the origin is the middle of the map.
//
// Each keep stands on a level yard; round it the land rolls. Two knolls flank
// the open field between the towns (high ground worth holding), each side has
// a lake, a forest edge within reach, and stone and ore behind its town; a
// richer outcrop of each lies out on the flanks. The computer's side is the
// player's turned half a circle about the middle, so the land is fair.

/** Town centre of a side: the player in the south-west corner, the computer in the north-east. */
export function townX(side: Side): number {
  return side === 0 ? PLAYER_SITE[0] : -PLAYER_SITE[0];
}

export function townZ(side: Side): number {
  return side === 0 ? PLAYER_SITE[1] : -PLAYER_SITE[1];
}

/** +1 for the player, −1 for the computer: every offset of a side's layout is multiplied by it. */
export function turnOf(side: Side): number {
  return side === 0 ? 1 : -1;
}

// The player's axes: "forward" looks at the enemy (north-east), "side" is to the right of that (south-east).
const SITE_M = Math.hypot(PLAYER_SITE[0], PLAYER_SITE[1]);
export const FORWARD_X = -PLAYER_SITE[0] / SITE_M;
export const FORWARD_Z = -PLAYER_SITE[1] / SITE_M;
export const SIDE_X = -FORWARD_Z;
export const SIDE_Z = FORWARD_X;

function smoothstep(lo: number, hi: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

export function lakeX(side: Side): number {
  return townX(side) + turnOf(side) * (FORWARD_X * TOWN.lakeForwardM - SIDE_X * TOWN.lakeSideM);
}

export function lakeZ(side: Side): number {
  return townZ(side) + turnOf(side) * (FORWARD_Z * TOWN.lakeForwardM - SIDE_Z * TOWN.lakeSideM);
}

/**
 * The lake's radius in a direction from its middle: a few slow waves round the circle give it bays and
 * points, and a noise round the circle its coves. The computer's lake is the player's turned half a circle, so the two are the same shape.
 */
export function lakeRadiusAt(side: Side, x: number, z: number): number {
  const a = Math.atan2(z - lakeZ(side), x - lakeX(side)) + (side === 0 ? 0 : Math.PI);
  // Slow waves for the bays and points, then a noise walked round the circle (so it closes on itself) for
  // the coves and spits a real shore has: no two stretches alike.
  const c = Math.cos(a);
  const s = Math.sin(a);
  const coves = fbm2(c * 1.9 + 4.3, s * 1.9 - 2.6, 4, MAP.terrainSeed + 61);
  return TOWN.lakeRadiusM * (1 + 0.2 * Math.sin(2 * a + 0.7) + 0.13 * Math.sin(3 * a + 2.1) + 0.06 * Math.sin(5 * a + 4.0) + 0.24 * coves);
}

/** Distance from the nearer lake's middle, in that lake's radii in that direction (below 1 = inside the bowl). */
export function lakeShare(x: number, z: number): number {
  const s0 = hypot2(x - lakeX(0), z - lakeZ(0)) / lakeRadiusAt(0, x, z);
  const s1 = hypot2(x - lakeX(1), z - lakeZ(1)) / lakeRadiusAt(1, x, z);
  return Math.min(s0, s1);
}

// ---- the river (map layout 'river') -----------------------------------------

const RIVER = LAYOUT === 'river';

/** Where the river runs across the side axis: through the middle and through each knoll's line, bending between. */
function riverCentreF(s: number): number {
  return MAP.riverBendM * Math.sin((Math.PI * s) / MAP.knollOffsetM);
}

/** What lies at a point by the river: its distance from the stream's middle, and whether it is the causeway or a ford. */
function riverAt(x: number, z: number): { d: number; crossing: 'none' | 'causeway' | 'ford' } {
  const f = x * FORWARD_X + z * FORWARD_Z;
  const s = x * SIDE_X + z * SIDE_Z;
  const slope = ((MAP.riverBendM * Math.PI) / MAP.knollOffsetM) * Math.cos((Math.PI * s) / MAP.knollOffsetM);
  const d = Math.abs(f - riverCentreF(s)) / Math.sqrt(1 + slope * slope);
  const crossing = Math.abs(s) < MAP.crossingHalfM ? 'causeway' : Math.abs(Math.abs(s) - MAP.knollOffsetM) < MAP.crossingHalfM ? 'ford' : 'none';
  return { d, crossing };
}

/** The river's share of the ground's height (1 in its bed, falling to 0 across the banks), and the bed's height. */
function riverBed(x: number, z: number): { share: number; bedM: number } {
  if (!RIVER) return { share: 0, bedM: 0 };
  const { d, crossing } = riverAt(x, z);
  const share = 1 - smoothstep(MAP.riverHalfWidthM, MAP.riverHalfWidthM + MAP.riverBankM, d);
  if (share <= 0) return { share: 0, bedM: 0 };
  // A causeway stands a little above the water; a ford lies a hand's breadth under it.
  if (crossing === 'causeway') return { share, bedM: WATER_LEVEL_M + 0.35 };
  const inner = Math.max(0, 1 - (d / MAP.riverHalfWidthM) ** 2);
  const depth = crossing === 'ford' ? MAP.fordDepthM : MAP.riverDepthM * inner + 0.15;
  return { share, bedM: WATER_LEVEL_M - Math.max(0.15, depth) };
}

/** True in the river where it is too deep to wade: not at the causeway, not at the fords. */
export function isRiver(x: number, z: number): boolean {
  if (!RIVER) return false;
  const { d, crossing } = riverAt(x, z);
  return crossing === 'none' && d < MAP.riverHalfWidthM * 0.9;
}

/** Where to put someone who has stepped into the river: straight out to the nearer bank. False if he is not in it. */
export function offRiver(x: number, z: number, out: { x: number; z: number }): boolean {
  if (!isRiver(x, z)) return false;
  const f = x * FORWARD_X + z * FORWARD_Z;
  const s = x * SIDE_X + z * SIDE_Z;
  const centre = riverCentreF(s);
  const bank = centre + Math.sign(f - centre || 1) * MAP.riverHalfWidthM * 0.95;
  out.x = SIDE_X * s + FORWARD_X * bank;
  out.z = SIDE_Z * s + FORWARD_Z * bank;
  return true;
}

/** The river's middle line at a point along the side axis, as (x, z): for drawing its water. */
export function riverPoint(s: number, across: number): [number, number] {
  const f = riverCentreF(s) + across;
  return [SIDE_X * s + FORWARD_X * f, SIDE_Z * s + FORWARD_Z * f];
}

export const HAS_RIVER = RIVER;

/** The middles of the river's crossings (the causeway and the two fords), as x, z pairs; none without the river. */
export const RIVER_CROSSINGS: readonly (readonly [number, number])[] = RIVER ? [-MAP.knollOffsetM, 0, MAP.knollOffsetM].map((s) => riverPoint(s, 0)) : [];

/** True where the lake, or the river, is too deep to wade. */
export function isWater(x: number, z: number): boolean {
  return lakeShare(x, z) < 0.93 || isRiver(x, z);
}

// ---- mountains and crags ---------------------------------------------------

/** A massif or a crag: a heap of rock round (x, z); `turn` mirrors its shape for the computer's half of the map. */
interface Heap {
  x: number;
  z: number;
  radiusM: number;
  heightM: number;
  /** Inside this share of its radius the rock is sheer: no one walks, builds or lays a road. */
  blockShare: number;
  turn: number;
  /** Seed of its outline and ridges: the same for a heap and its half-turned twin, so both are one shape. */
  seed: number;
}

function layOutHeaps(): Heap[] {
  const out: Heap[] = [];
  const m = MAP.mountainOffsetM;
  // The massifs sit in the two corners the towns do not hold, (+,+) and (−,−): each is the other half-turned.
  for (const turn of [1, -1]) {
    out.push({ x: turn * m, z: turn * m, radiusM: MAP.mountainRadiusM, heightM: MAP.mountainHeightM, blockShare: MAP.mountainBlockShare, turn, seed: 71 });
  }
  MAP.crags.forEach(([f, sd], i) => {
    const x = FORWARD_X * f + SIDE_X * sd;
    const z = FORWARD_Z * f + SIDE_Z * sd;
    // The list pairs each crag with its twin across the middle: they share a seed and mirror their shape.
    const turn = f + sd * 0.001 >= 0 ? 1 : -1;
    out.push({ x, z, radiusM: MAP.cragRadiusM, heightM: MAP.cragHeightM, blockShare: MAP.cragBlockShare, turn, seed: 80 + (i >> 1) });
  });
  return out;
}

export const HEAPS: readonly Heap[] = layOutHeaps();

/** A heap's radius in the direction of (x, z): a noise round its outline gives it spurs and gullies. */
function heapRadiusAt(h: Heap, x: number, z: number): number {
  const a = Math.atan2((z - h.z) * h.turn, (x - h.x) * h.turn);
  const n = fbm2(Math.cos(a) * 1.7 + h.seed, Math.sin(a) * 1.7 - h.seed, 4, MAP.terrainSeed + h.seed);
  return h.radiusM * (1 + 0.3 * n);
}

/** Distance from the nearest heap's middle in that heap's radii (below 1 = on it), and which heap; -1 when none is near. */
function nearestHeap(x: number, z: number): { share: number; heap: number } {
  let share = Number.POSITIVE_INFINITY;
  let heap = -1;
  for (let i = 0; i < HEAPS.length; i++) {
    const h = HEAPS[i] as Heap;
    const d = hypot2(x - h.x, z - h.z);
    if (d > h.radiusM * 1.8) continue;
    const sh = d / heapRadiusAt(h, x, z);
    if (sh < share) {
      share = sh;
      heap = i;
    }
  }
  return { share, heap };
}

/** Height the heaps add: foothills rising to a crest, broken by ridges and gullies. */
function heapHeightM(x: number, z: number): number {
  let top = 0;
  for (const h of HEAPS) {
    const d = hypot2(x - h.x, z - h.z);
    if (d > h.radiusM * 1.8) continue;
    const sh = d / heapRadiusAt(h, x, z);
    if (sh >= 1.5) continue;
    const lx = (x - h.x) * h.turn;
    const lz = (z - h.z) * h.turn;
    const rise = 1 - smoothstep(0.1, 1.5, sh);
    // Ridged noise: sharp crests where the noise crosses zero.
    const ridges = 1 - Math.abs(fbm2(lx / (h.radiusM * 0.45) + h.seed, lz / (h.radiusM * 0.45), 4, MAP.terrainSeed + h.seed + 1));
    top = Math.max(top, h.heightM * Math.pow(rise, 1.7) * (0.5 + 0.5 * ridges * ridges));
  }
  return top;
}

/** 0 at a heap's middle, 1 at its foot and beyond: how far out on the nearest heap a point lies. */
export function heapShare(x: number, z: number): number {
  return Math.min(1.5, nearestHeap(x, z).share);
}

/** True on sheer rock: the cores of the massifs and the crags. */
export function isCliff(x: number, z: number): boolean {
  const { share, heap } = nearestHeap(x, z);
  return heap >= 0 && share < (HEAPS[heap] as Heap).blockShare;
}

/** What sheer rock a point is on: a massif's or a crag's; null off the rock. */
export function cliffKind(x: number, z: number): 'mountain' | 'crag' | null {
  const { share, heap } = nearestHeap(x, z);
  if (heap < 0) return null;
  const h = HEAPS[heap] as Heap;
  if (share >= h.blockShare) return null;
  return h.radiusM === MAP.mountainRadiusM ? 'mountain' : 'crag';
}

/** True where no one walks or builds: deep water or sheer rock. */
export function isImpassable(x: number, z: number): boolean {
  return isWater(x, z) || isCliff(x, z);
}

/**
 * Where to put someone who stood on sheer rock: straight out from the heap's middle to just past its
 * cliffs. Writes x, z into `out` and returns true, or false if (x, z) is not on rock.
 */
export function offCliff(x: number, z: number, out: { x: number; z: number }): boolean {
  const { share, heap } = nearestHeap(x, z);
  if (heap < 0) return false;
  const h = HEAPS[heap] as Heap;
  if (share >= h.blockShare) return false;
  const d = hypot2(x - h.x, z - h.z);
  const edge = heapRadiusAt(h, x, z) * h.blockShare * 1.03;
  const ux = d > 1e-6 ? (x - h.x) / d : 1;
  const uz = d > 1e-6 ? (z - h.z) / d : 0;
  out.x = h.x + ux * edge;
  out.z = h.z + uz * edge;
  return true;
}

/** Height of the lakes' water surface. */
export const WATER_LEVEL_M = -0.45;

function distanceToNearestTownM(x: number, z: number): number {
  const d0 = hypot2(x - townX(0), z - townZ(0));
  const d1 = hypot2(x - townX(1), z - townZ(1));
  return Math.min(d0, d1);
}

/** Distance from the straight line between the two towns: the open field where armies meet. */
function distanceToFieldAxisM(x: number, z: number): number {
  // The towns lie on a line through the middle, along FORWARD.
  return Math.abs(x * FORWARD_Z - z * FORWARD_X);
}

/** A rounded hill of the given height and radius centred on (cx, cz). */
function knoll(x: number, z: number, cx: number, cz: number): number {
  const d2 = ((x - cx) ** 2 + (z - cz) ** 2) / (MAP.knollRadiusM * MAP.knollRadiusM);
  return MAP.knollHeightM * Math.exp(-d2 * 1.6);
}

/** Ground height in metres. The keeps stand on level ground at height 0; the lakes are hollows. */
export function heightAtM(x: number, z: number): number {
  // Rolling hills, finer folds on top, gentler where the armies meet.
  const rolling = fbm2(x / 120, z / 120, 4, MAP.terrainSeed) * MAP.hillHeightM;
  const folds = fbm2(x / 34, z / 34, 3, MAP.terrainSeed + 3) * MAP.foldHeightM;
  const onField = 1 - (1 - MAP.fieldReliefFactor) * (1 - smoothstep(MAP.fieldHalfWidthM * 0.6, MAP.fieldHalfWidthM * 1.6, distanceToFieldAxisM(x, z)));
  // The two knolls: either side of the middle, across the field.
  const kx = SIDE_X * MAP.knollOffsetM;
  const kz = SIDE_Z * MAP.knollOffsetM;
  // On the crossing the river runs where the knolls would stand: they are fords instead.
  const knolls = RIVER ? 0 : knoll(x, z, kx, kz) + knoll(x, z, -kx, -kz);
  const town = smoothstep(MAP.townFlatRadiusM, MAP.townBlendRadiusM, distanceToNearestTownM(x, z));
  const share = lakeShare(x, z);
  const shore = smoothstep(1.0, 1.6, share);
  // A bowl: level with the land at the rim, deepest in the middle.
  const bowl = share < 1 ? -TOWN.lakeDepthM * (1 - share * share) : 0;
  const land = ((rolling + folds) * onField + knolls) * town * shore + bowl + heapHeightM(x, z);
  if (!RIVER) return land;
  const river = riverBed(x, z);
  return land * (1 - river.share) + river.bedM * river.share;
}

/** How much the ground rises across a circle of radius `r`: the difference between its highest and lowest of five points. */
export function riseAcrossM(x: number, z: number, r: number): number {
  let lo = heightAtM(x, z);
  let hi = lo;
  for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]] as const) {
    const h = heightAtM(x + dx, z + dz);
    if (h < lo) lo = h;
    if (h > hi) hi = h;
  }
  return hi - lo;
}

// ---- stone and ore ---------------------------------------------------------

export interface Deposit {
  kind: 'stone' | 'ore';
  x: number;
  z: number;
}

/** Stone and ore behind each town, and a second outcrop of each out on the flanks, nearer the middle. */
function layOutDeposits(): Deposit[] {
  const out: Deposit[] = [];
  for (const side of [0, 1] as const) {
    const t = turnOf(side);
    const at = (forwardM: number, sideM: number): [number, number] => [townX(side) + t * (FORWARD_X * forwardM + SIDE_X * sideM), townZ(side) + t * (FORWARD_Z * forwardM + SIDE_Z * sideM)];
    // Either side of the keep and a little ahead: behind it, in the corner, is the map's edge. Never closer
    // to the edge than their own size and a cart's turn.
    const inside = (v: number): number => Math.max(-MAP.halfM + TOWN.depositRadiusM + 10, Math.min(MAP.halfM - TOWN.depositRadiusM - 10, v));
    const [sx, sz] = at(30, -66);
    const [ox, oz] = at(30, 66);
    out.push({ kind: 'stone', x: inside(sx), z: inside(sz) }, { kind: 'ore', x: inside(ox), z: inside(oz) });
    // A second outcrop out on the flank, at the edge of the side's reach: ore on the player's, stone on the computer's.
    const [fx, fz] = at(118, 96);
    out.push({ kind: side === 0 ? 'ore' : 'stone', x: fx, z: fz });
  }
  return out;
}

export const DEPOSITS: readonly Deposit[] = layOutDeposits();

/** The nearest outcrop of a kind within `reachM` of a point, or null. */
export function depositNear(kind: Deposit['kind'], x: number, z: number, reachM: number): Deposit | null {
  let best: Deposit | null = null;
  let bestD = reachM + TOWN.depositRadiusM;
  for (const d of DEPOSITS) {
    if (d.kind !== kind) continue;
    const dist = hypot2(d.x - x, d.z - z);
    if (dist < bestD) {
      best = d;
      bestD = dist;
    }
  }
  return best;
}

function distanceToNearestDepositM(x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const d of DEPOSITS) best = Math.min(best, hypot2(d.x - x, d.z - z));
  return best;
}

/** True on bare rock. */
export function isRock(x: number, z: number): boolean {
  return distanceToNearestDepositM(x, z) < TOWN.depositRadiusM;
}

// ---- forest ----------------------------------------------------------------

/** Forest density 0…1 at a point; above 0.5 counts as woodland for the rules. */
export function forestCoverAt(x: number, z: number): number {
  const patches = fbm2(x / 70 + 31.7, z / 70 - 12.3, 3, MAP.terrainSeed + 11);
  // The road through the forest: woods almost everywhere, a clearing round each town and a narrow ride
  // between them; elsewhere, woods in patches off an open field.
  const forest = LAYOUT === 'forest';
  const clearM = forest ? MAP.forestLayoutClearingM : MAP.forestClearRadiusM;
  const nearTown = smoothstep(clearM, clearM + 25, distanceToNearestTownM(x, z));
  const offField = forest ? smoothstep(MAP.forestRideHalfWidthM, MAP.forestRideHalfWidthM + 8, distanceToFieldAxisM(x, z)) : smoothstep(MAP.fieldHalfWidthM, MAP.fieldHalfWidthM + 30, distanceToFieldAxisM(x, z));
  const offLake = smoothstep(1.35, 1.9, lakeShare(x, z));
  const offRock = smoothstep(TOWN.depositRadiusM + 4, TOWN.depositRadiusM + 14, distanceToNearestDepositM(x, z));
  // Trees climb the foothills but not the rock above them.
  const offHeap = smoothstep(0.85, 1.15, heapShare(x, z));
  // A glade round each place in the middle, where the regiment that takes it stands.
  let offPlace = 1;
  for (const p of POINTS.list) offPlace = Math.min(offPlace, smoothstep(POINTS.radiusM + 14, POINTS.radiusM + 34, hypot2(x - SIDE_X * p.sideM, z - SIDE_Z * p.sideM)));
  const woods = forest ? smoothstep(-0.5, -0.3, patches) : smoothstep(0.02, 0.22, patches);
  return woods * nearTown * offField * offLake * offRock * offHeap * offPlace;
}

export function isForest(x: number, z: number): boolean {
  return forestCoverAt(x, z) > 0.5;
}

export function clampToMap(v: number): number {
  const limit = MAP.halfM - 2;
  return Math.min(limit, Math.max(-limit, v));
}

/** Where a side's new regiments form up: in front of the town, towards the enemy. */
export function rallyX(side: Side): number {
  return townX(side) + turnOf(side) * TOWN.rallyDistanceM * FORWARD_X;
}

export function rallyZ(side: Side): number {
  return townZ(side) + turnOf(side) * TOWN.rallyDistanceM * FORWARD_Z;
}

/** Facing (radians; 0 looks along +Z, π/2 along +X) from a side's town towards the enemy's. */
export function facingToEnemy(side: Side): number {
  return Math.atan2(townX(side === 0 ? 1 : 0) - townX(side), townZ(side === 0 ? 1 : 0) - townZ(side));
}
