import { MAP, TOWN } from '../config.ts';
import { fbm2 } from '../core/noise.ts';
import type { Side } from './types.ts';

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
  return side === 0 ? -MAP.townOffsetM : MAP.townOffsetM;
}

export function townZ(side: Side): number {
  return side === 0 ? MAP.townOffsetM : -MAP.townOffsetM;
}

/** +1 for the player, −1 for the computer: every offset of a side's layout is multiplied by it. */
export function turnOf(side: Side): number {
  return side === 0 ? 1 : -1;
}

// The player's axes: "forward" looks at the enemy (north-east), "side" is to the right of that (south-east).
export const FORWARD_X = Math.SQRT1_2;
export const FORWARD_Z = -Math.SQRT1_2;
export const SIDE_X = Math.SQRT1_2;
export const SIDE_Z = Math.SQRT1_2;

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

/** Distance from the nearer lake's middle, in lake radii (below 1 = inside the bowl). */
function lakeShare(x: number, z: number): number {
  const d0 = Math.hypot(x - lakeX(0), z - lakeZ(0));
  const d1 = Math.hypot(x - lakeX(1), z - lakeZ(1));
  return Math.min(d0, d1) / TOWN.lakeRadiusM;
}

/** True where the lake is too deep to wade. */
export function isWater(x: number, z: number): boolean {
  return lakeShare(x, z) < 0.93;
}

/** Height of the lakes' water surface. */
export const WATER_LEVEL_M = -0.45;

function distanceToNearestTownM(x: number, z: number): number {
  const d0 = Math.hypot(x - townX(0), z - townZ(0));
  const d1 = Math.hypot(x - townX(1), z - townZ(1));
  return Math.min(d0, d1);
}

/** Distance from the straight line between the two towns: the open field where armies meet. */
function distanceToFieldAxisM(x: number, z: number): number {
  // The towns lie on the line x = -z, so the distance to it is |x + z| / sqrt(2).
  return Math.abs(x + z) * Math.SQRT1_2;
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
  // The two knolls: either side of the middle, across the road.
  const k = MAP.knollOffsetM * Math.SQRT1_2;
  const knolls = knoll(x, z, k, k) + knoll(x, z, -k, -k);
  const town = smoothstep(MAP.townFlatRadiusM, MAP.townBlendRadiusM, distanceToNearestTownM(x, z));
  const share = lakeShare(x, z);
  const shore = smoothstep(1.0, 1.6, share);
  // A bowl: level with the land at the rim, deepest in the middle.
  const bowl = share < 1 ? -TOWN.lakeDepthM * (1 - share * share) : 0;
  return ((rolling + folds) * onField + knolls) * town * shore + bowl;
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
    const [sx, sz] = at(-52, -26);
    const [ox, oz] = at(-52, 26);
    out.push({ kind: 'stone', x: sx, z: sz }, { kind: 'ore', x: ox, z: oz });
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
    const dist = Math.hypot(d.x - x, d.z - z);
    if (dist < bestD) {
      best = d;
      bestD = dist;
    }
  }
  return best;
}

function distanceToNearestDepositM(x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const d of DEPOSITS) best = Math.min(best, Math.hypot(d.x - x, d.z - z));
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
  const nearTown = smoothstep(MAP.forestClearRadiusM, MAP.forestClearRadiusM + 25, distanceToNearestTownM(x, z));
  const offField = smoothstep(MAP.fieldHalfWidthM, MAP.fieldHalfWidthM + 30, distanceToFieldAxisM(x, z));
  const offLake = smoothstep(1.35, 1.9, lakeShare(x, z));
  const offRock = smoothstep(TOWN.depositRadiusM + 4, TOWN.depositRadiusM + 14, distanceToNearestDepositM(x, z));
  return smoothstep(0.02, 0.22, patches) * nearTown * offField * offLake * offRock;
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
