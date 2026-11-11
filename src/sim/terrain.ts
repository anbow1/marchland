import { MAP, TOWN } from '../config.ts';
import { fbm2 } from '../core/noise.ts';
import type { Side } from './types.ts';

// The map as functions of (x, z): height, forest cover, and where the two
// towns and their building plots stand. The renderer draws from the same
// functions, so what the player sees is what the rules use (rules §9).
// X runs east, Z runs south, Y is up; the origin is the middle of the map.

/** Town centre of a side: the player in the south-west corner, the computer in the north-east. */
export function townX(side: Side): number {
  return side === 0 ? -MAP.townOffsetM : MAP.townOffsetM;
}

export function townZ(side: Side): number {
  return side === 0 ? MAP.townOffsetM : -MAP.townOffsetM;
}

function smoothstep(lo: number, hi: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

function distanceToNearestTownM(x: number, z: number): number {
  const d0 = Math.hypot(x - townX(0), z - townZ(0));
  const d1 = Math.hypot(x - townX(1), z - townZ(1));
  return Math.min(d0, d1);
}

/** Ground height in metres. Towns stand on level ground at height 0. */
export function heightAtM(x: number, z: number): number {
  const hills = fbm2(x / 110, z / 110, 4, MAP.terrainSeed) * MAP.hillHeightM;
  const blend = smoothstep(MAP.townFlatRadiusM, MAP.townBlendRadiusM, distanceToNearestTownM(x, z));
  return hills * blend;
}

/** Distance from the straight line between the two towns: the open field where armies meet. */
function distanceToFieldAxisM(x: number, z: number): number {
  // The towns lie on the line x = -z, so the distance to it is |x + z| / sqrt(2).
  return Math.abs(x + z) * Math.SQRT1_2;
}

/** Forest density 0…1 at a point; above 0.5 counts as woodland for the rules. */
export function forestCoverAt(x: number, z: number): number {
  const patches = fbm2(x / 70 + 31.7, z / 70 - 12.3, 3, MAP.terrainSeed + 11);
  const nearTown = smoothstep(MAP.forestClearRadiusM, MAP.forestClearRadiusM + 25, distanceToNearestTownM(x, z));
  const offField = smoothstep(MAP.fieldHalfWidthM, MAP.fieldHalfWidthM + 30, distanceToFieldAxisM(x, z));
  return smoothstep(0.02, 0.22, patches) * nearTown * offField;
}

export function isForest(x: number, z: number): boolean {
  return forestCoverAt(x, z) > 0.5;
}

export function clampToMap(v: number): number {
  const limit = MAP.halfM - 2;
  return Math.min(limit, Math.max(-limit, v));
}

// Plot positions, computed once: the inner ring, then the outer ring.
const PLOT_X = new Float64Array(2 * TOWN.plotCount);
const PLOT_Z = new Float64Array(2 * TOWN.plotCount);
for (const side of [0, 1] as const) {
  for (let i = 0; i < TOWN.plotCount; i++) {
    const inner = i < TOWN.innerPlots;
    const count = inner ? TOWN.innerPlots : TOWN.outerPlots;
    const k = inner ? i : i - TOWN.innerPlots;
    const radius = inner ? TOWN.innerRadiusM : TOWN.outerRadiusM;
    // Half a step of offset on the outer ring so its plots sit between the inner ones.
    const angle = ((k + (inner ? 0 : 0.5)) / count) * Math.PI * 2;
    PLOT_X[side * TOWN.plotCount + i] = townX(side) + Math.sin(angle) * radius;
    PLOT_Z[side * TOWN.plotCount + i] = townZ(side) + Math.cos(angle) * radius;
  }
}

function checkPlot(plot: number): void {
  if (!Number.isInteger(plot) || plot < 0 || plot >= TOWN.plotCount) throw new Error(`plot '${plot}' is not in 0…${TOWN.plotCount - 1}`);
}

export function plotX(side: Side, plot: number): number {
  checkPlot(plot);
  return PLOT_X[side * TOWN.plotCount + plot] as number;
}

export function plotZ(side: Side, plot: number): number {
  checkPlot(plot);
  return PLOT_Z[side * TOWN.plotCount + plot] as number;
}

/** Where a side's new regiments form up: in front of the town, towards the enemy. */
export function rallyX(side: Side): number {
  return townX(side) + (side === 0 ? 1 : -1) * TOWN.rallyDistanceM * Math.SQRT1_2;
}

export function rallyZ(side: Side): number {
  return townZ(side) + (side === 0 ? -1 : 1) * TOWN.rallyDistanceM * Math.SQRT1_2;
}

/** Facing (radians; 0 looks along +Z, π/2 along +X) from a side's town towards the enemy's. */
export function facingToEnemy(side: Side): number {
  return Math.atan2(townX(side === 0 ? 1 : 0) - townX(side), townZ(side === 0 ? 1 : 0) - townZ(side));
}
