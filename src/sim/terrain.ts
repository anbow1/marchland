import { FIELDS, GATHER, MAP, TOWN } from '../config.ts';
import { fbm2 } from '../core/noise.ts';
import type { PlotKind, Side } from './types.ts';

// The map as functions of (x, z): height, forest cover, water, and where the
// two towns and their plots stand. The renderer draws from the same functions,
// so what the player sees is what the rules use (rules §9).
// X runs east, Z runs south, Y is up; the origin is the middle of the map.
//
// Each side has a town round its keep (houses, crafts, barracks), a farming
// village a short walk away with strips of field behind every farm, a lake
// with fishing plots, plots at the nearest edge of the forest, and rock for a
// quarry and a mine behind the town. The computer's side is the player's
// turned half a circle about the middle of the map, so the layout is fair.

/** Town centre of a side: the player in the south-west corner, the computer in the north-east. */
export function townX(side: Side): number {
  return side === 0 ? -MAP.townOffsetM : MAP.townOffsetM;
}

export function townZ(side: Side): number {
  return side === 0 ? MAP.townOffsetM : -MAP.townOffsetM;
}

/** +1 for the player, −1 for the computer: every offset of a side's layout is multiplied by it. */
function turn(side: Side): number {
  return side === 0 ? 1 : -1;
}

// The player's axes: "forward" looks at the enemy (north-east), "side" is to the right of that (south-east).
const FORWARD_X = Math.SQRT1_2;
const FORWARD_Z = -Math.SQRT1_2;
const SIDE_X = Math.SQRT1_2;
const SIDE_Z = Math.SQRT1_2;

function smoothstep(lo: number, hi: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

/** Middle of a side's village street. */
export function villageX(side: Side): number {
  return townX(side) + turn(side) * (FORWARD_X * TOWN.villageForwardM + SIDE_X * TOWN.villageSideM);
}

export function villageZ(side: Side): number {
  return townZ(side) + turn(side) * (FORWARD_Z * TOWN.villageForwardM + SIDE_Z * TOWN.villageSideM);
}

export function lakeX(side: Side): number {
  return townX(side) + turn(side) * (FORWARD_X * TOWN.lakeForwardM - SIDE_X * TOWN.lakeSideM);
}

export function lakeZ(side: Side): number {
  return townZ(side) + turn(side) * (FORWARD_Z * TOWN.lakeForwardM - SIDE_Z * TOWN.lakeSideM);
}

/** Distance from the nearer lake's middle, in lake radii (below 1 = in the water). */
function lakeShare(x: number, z: number): number {
  const d0 = Math.hypot(x - lakeX(0), z - lakeZ(0));
  const d1 = Math.hypot(x - lakeX(1), z - lakeZ(1));
  return Math.min(d0, d1) / TOWN.lakeRadiusM;
}

/** True where the lake is too deep to wade. */
export function isWater(x: number, z: number): boolean {
  return lakeShare(x, z) < 0.93;
}

function distanceToNearestTownM(x: number, z: number): number {
  const d0 = Math.hypot(x - townX(0), z - townZ(0));
  const d1 = Math.hypot(x - townX(1), z - townZ(1));
  return Math.min(d0, d1);
}

/** Distance to the nearer village's farmland (its street and the fields behind it), roughly. */
function distanceToNearestFarmlandM(x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const side of [0, 1] as const) {
    // The farmland's middle lies behind the street, away from the main road.
    const cx = villageX(side) + turn(side) * SIDE_X * 24;
    const cz = villageZ(side) + turn(side) * SIDE_Z * 24;
    best = Math.min(best, Math.hypot(x - cx, z - cz));
  }
  return best;
}

/** Ground height in metres. Towns and villages stand on level ground at height 0; the lakes are hollows. */
export function heightAtM(x: number, z: number): number {
  const hills = fbm2(x / 110, z / 110, 4, MAP.terrainSeed) * MAP.hillHeightM;
  const town = smoothstep(MAP.townFlatRadiusM, MAP.townBlendRadiusM, distanceToNearestTownM(x, z));
  const farmland = smoothstep(62, 95, distanceToNearestFarmlandM(x, z));
  const share = lakeShare(x, z);
  const shore = smoothstep(1.0, 1.5, share);
  // A bowl: level with the land at the rim, deepest in the middle.
  const bowl = share < 1 ? -TOWN.lakeDepthM * (1 - share * share) : 0;
  return hills * town * farmland * shore + bowl;
}

/** Height of the lakes' water surface. */
export const WATER_LEVEL_M = -0.45;

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
  const offFarmland = smoothstep(68, 88, distanceToNearestFarmlandM(x, z));
  const offLake = smoothstep(1.35, 1.9, lakeShare(x, z));
  return smoothstep(0.02, 0.22, patches) * nearTown * offField * offFarmland * offLake;
}

export function isForest(x: number, z: number): boolean {
  return forestCoverAt(x, z) > 0.5;
}

export function clampToMap(v: number): number {
  const limit = MAP.halfM - 2;
  return Math.min(limit, Math.max(-limit, v));
}

// ---- plots ---------------------------------------------------------------
// Order: town inner ring, town outer ring, village, forest, lake, rock.

const FIRST_VILLAGE = TOWN.innerPlots + TOWN.outerPlots;
const FIRST_FOREST = FIRST_VILLAGE + TOWN.villagePlots;
const FIRST_LAKE = FIRST_FOREST + TOWN.forestPlots;
const FIRST_ROCK = FIRST_LAKE + TOWN.lakePlots;

export function plotKind(plot: number): PlotKind {
  checkPlot(plot);
  if (plot < FIRST_VILLAGE) return 'town';
  if (plot < FIRST_FOREST) return 'village';
  if (plot < FIRST_LAKE) return 'forest';
  if (plot < FIRST_ROCK) return 'lake';
  return 'rock';
}

const PLOT_X = new Float64Array(2 * TOWN.plotCount);
const PLOT_Z = new Float64Array(2 * TOWN.plotCount);
/** For forest and lake plots: the spot the worker goes out to (in the trees, on the shore). */
const SPOT_X = new Float64Array(2 * TOWN.plotCount);
const SPOT_Z = new Float64Array(2 * TOWN.plotCount);

/** A woodcutter's plot is never further than this from the keep: timber has to be carried home. */
const FOREST_SEARCH_M = 140;

/** The two forest plots of the player: at the edge of the nearest woods, found by walking outwards from the town. */
function findForestEdges(): { x: number; z: number; dx: number; dz: number }[] {
  const found: { x: number; z: number; dx: number; dz: number; d: number }[] = [];
  const tx = townX(0);
  const tz = townZ(0);
  for (let degrees = 0; degrees < 360; degrees += 6) {
    const dx = Math.sin((degrees * Math.PI) / 180);
    const dz = Math.cos((degrees * Math.PI) / 180);
    for (let d = MAP.forestClearRadiusM - 6; d < FOREST_SEARCH_M; d += 3) {
      const x = tx + dx * d;
      const z = tz + dz * d;
      if (Math.abs(x) > MAP.halfM - 30 || Math.abs(z) > MAP.halfM - 30) break;
      // Open ground here, thick wood a short walk further out: the edge of a forest.
      if (forestCoverAt(x, z) < 0.15 && forestCoverAt(x + dx * 16, z + dz * 16) > 0.7 && forestCoverAt(x + dx * 24, z + dz * 24) > 0.7 && lakeShare(x, z) > 1.5) {
        found.push({ x, z, dx, dz, d });
        break;
      }
    }
  }
  found.sort((a, b) => a.d - b.d);
  const picked: { x: number; z: number; dx: number; dz: number }[] = [];
  for (const f of found) {
    if (picked.every((p) => Math.hypot(p.x - f.x, p.z - f.z) > 2 * TOWN.buildingRadiusM + 9)) picked.push(f);
    if (picked.length === TOWN.forestPlots) break;
  }
  if (picked.length < TOWN.forestPlots) throw new Error(`terrain seed ${MAP.terrainSeed} leaves ${picked.length} forest edges near the town; ${TOWN.forestPlots} are needed`);
  return picked;
}

function layOutPlots(): void {
  const edges = findForestEdges();
  for (const side of [0, 1] as const) {
    const t = turn(side);
    const set = (plot: number, x: number, z: number, spotX = x, spotZ = z): void => {
      PLOT_X[side * TOWN.plotCount + plot] = x;
      PLOT_Z[side * TOWN.plotCount + plot] = z;
      SPOT_X[side * TOWN.plotCount + plot] = spotX;
      SPOT_Z[side * TOWN.plotCount + plot] = spotZ;
    };
    for (let i = 0; i < FIRST_VILLAGE; i++) {
      const inner = i < TOWN.innerPlots;
      const count = inner ? TOWN.innerPlots : TOWN.outerPlots;
      const k = inner ? i : i - TOWN.innerPlots;
      const radius = inner ? TOWN.innerRadiusM : TOWN.outerRadiusM;
      // Half a step of offset on the outer ring so its plots sit between the inner ones.
      const angle = ((k + (inner ? 0 : 0.5)) / count) * Math.PI * 2;
      set(i, townX(side) + Math.sin(angle) * radius, townZ(side) + Math.cos(angle) * radius);
    }
    // The village: plots in a row along the street, which runs parallel to the road between the towns.
    for (let k = 0; k < TOWN.villagePlots; k++) {
      const along = (k - (TOWN.villagePlots - 1) / 2) * TOWN.villagePitchM;
      set(FIRST_VILLAGE + k, villageX(side) + t * FORWARD_X * along, villageZ(side) + t * FORWARD_Z * along);
    }
    edges.forEach((e, k) => {
      // The player's forest edges, mirrored for the computer; the spot to fell at is inside the trees.
      const reach = GATHER.woodcutter.reachM;
      set(FIRST_FOREST + k, t * e.x, t * e.z, t * (e.x + e.dx * reach), t * (e.z + e.dz * reach));
    });
    // Fishing plots on the shore nearest the town, a little apart; the spot is at the water's edge.
    const toTownX = townX(side) - lakeX(side);
    const toTownZ = townZ(side) - lakeZ(side);
    const base = Math.atan2(toTownX, toTownZ);
    for (let k = 0; k < TOWN.lakePlots; k++) {
      const angle = base + (k - (TOWN.lakePlots - 1) / 2) * 0.75;
      const r = TOWN.lakeRadiusM + 8;
      const spot = TOWN.lakeRadiusM + 8 - GATHER.fisher.reachM;
      set(FIRST_LAKE + k, lakeX(side) + Math.sin(angle) * r, lakeZ(side) + Math.cos(angle) * r, lakeX(side) + Math.sin(angle) * spot, lakeZ(side) + Math.cos(angle) * spot);
    }
    for (let k = 0; k < TOWN.rockPlots; k++) {
      const across = (k - (TOWN.rockPlots - 1) / 2) * 2 * TOWN.rockSideM;
      set(FIRST_ROCK + k, townX(side) + t * (-FORWARD_X * TOWN.rockBackM + SIDE_X * across), townZ(side) + t * (-FORWARD_Z * TOWN.rockBackM + SIDE_Z * across));
    }
  }
}
layOutPlots();

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

/** Where a forest or lake plot's worker goes to work; for other plots, the plot itself. */
export function spotX(side: Side, plot: number): number {
  checkPlot(plot);
  return SPOT_X[side * TOWN.plotCount + plot] as number;
}

export function spotZ(side: Side, plot: number): number {
  checkPlot(plot);
  return SPOT_Z[side * TOWN.plotCount + plot] as number;
}

/** Middle of strip `k` (0 = nearest) of the farmland behind a village plot. Strips lie along the street. */
export function stripX(side: Side, plot: number, k: number): number {
  if (plotKind(plot) !== 'village') throw new Error(`plot '${plot}' is not a village plot and has no fields`);
  return plotX(side, plot) + turn(side) * SIDE_X * (FIELDS.firstStripM + k * (FIELDS.stripWidthM + 0.6));
}

export function stripZ(side: Side, plot: number, k: number): number {
  if (plotKind(plot) !== 'village') throw new Error(`plot '${plot}' is not a village plot and has no fields`);
  return plotZ(side, plot) + turn(side) * SIDE_Z * (FIELDS.firstStripM + k * (FIELDS.stripWidthM + 0.6));
}

/** Angle (about Y) of the village street, for laying strips and houses along it. */
export function streetAngleRad(side: Side): number {
  return Math.atan2(turn(side) * FORWARD_X, turn(side) * FORWARD_Z);
}

/** Where a side's new regiments form up: in front of the town, towards the enemy. */
export function rallyX(side: Side): number {
  return townX(side) + turn(side) * TOWN.rallyDistanceM * FORWARD_X;
}

export function rallyZ(side: Side): number {
  return townZ(side) + turn(side) * TOWN.rallyDistanceM * FORWARD_Z;
}

/** Facing (radians; 0 looks along +Z, π/2 along +X) from a side's town towards the enemy's. */
export function facingToEnemy(side: Side): number {
  return Math.atan2(townX(side === 0 ? 1 : 0) - townX(side), townZ(side === 0 ? 1 : 0) - townZ(side));
}
