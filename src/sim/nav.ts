import { MAP, ROADS } from '../config.ts';
import { isForest, isWater } from './terrain.ts';

// Where people can walk and how fast. The map is a grid of two-metre cells;
// each is open ground, forest, road, or blocked (water, a building). People
// find their way with A* over it, so a road is used because it is quicker, and
// a town laid out without roads works, only slower. Soldiers do not use this:
// formations move as bodies and only keep out of buildings and water.

const N = Math.round(MAP.sizeM / ROADS.cellM);
const CELLS = N * N;

/** Cost of crossing one cell, in the time open ground takes: the inverse of the speed factors. */
const COST_ROAD = 1 / ROADS.roadSpeedFactor;
const COST_OPEN = 1 / ROADS.openSpeedFactor;
const COST_FOREST = 1 / ROADS.forestSpeedFactor;

// The land itself never changes: forest and water per cell, worked out once.
const FOREST = new Uint8Array(CELLS);
const WATER = new Uint8Array(CELLS);
for (let cz = 0; cz < N; cz++) {
  for (let cx = 0; cx < N; cx++) {
    const x = (cx + 0.5) * ROADS.cellM - MAP.halfM;
    const z = (cz + 0.5) * ROADS.cellM - MAP.halfM;
    FOREST[cz * N + cx] = isForest(x, z) ? 1 : 0;
    WATER[cz * N + cx] = isWater(x, z) ? 1 : 0;
  }
}

export interface Nav {
  /** 1 where a road has been laid. */
  road: Uint8Array;
  /** 1 where a building stands. */
  built: Uint8Array;
  /** Goes up whenever roads or buildings change: paths and the view's ground refresh on it. */
  version: number;
  /** Paths still allowed this step. */
  budget: number;
}

export function createNav(): Nav {
  return { road: new Uint8Array(CELLS), built: new Uint8Array(CELLS), version: 0, budget: ROADS.pathsPerStep };
}

export const NAV_CELLS_PER_SIDE = N;

function cellOf(v: number): number {
  const c = Math.floor((v + MAP.halfM) / ROADS.cellM);
  return c < 0 ? 0 : c >= N ? N - 1 : c;
}

function centreOf(c: number): number {
  return (c + 0.5) * ROADS.cellM - MAP.halfM;
}

export function isRoad(nav: Nav, x: number, z: number): boolean {
  return nav.road[cellOf(z) * N + cellOf(x)] === 1;
}

/** Walking speed at a point, as a share of the pace on open ground. */
export function speedFactorAt(nav: Nav, x: number, z: number): number {
  const i = cellOf(z) * N + cellOf(x);
  if (nav.road[i] === 1) return ROADS.roadSpeedFactor;
  return FOREST[i] === 1 ? ROADS.forestSpeedFactor : ROADS.openSpeedFactor;
}

/** Marks the cells under a round building as built on (or frees them). Roads under a building are lost. */
export function stampBuilding(nav: Nav, x: number, z: number, radiusM: number, built: boolean): void {
  const r = Math.ceil(radiusM / ROADS.cellM);
  const cx0 = cellOf(x);
  const cz0 = cellOf(z);
  for (let cz = Math.max(0, cz0 - r); cz <= Math.min(N - 1, cz0 + r); cz++) {
    for (let cx = Math.max(0, cx0 - r); cx <= Math.min(N - 1, cx0 + r); cx++) {
      if (Math.hypot(centreOf(cx) - x, centreOf(cz) - z) > radiusM) continue;
      nav.built[cz * N + cx] = built ? 1 : 0;
      if (built) nav.road[cz * N + cx] = 0;
    }
  }
  nav.version += 1;
}

/** Cells a straight road from one point to another would cover that are not road yet and can be: not water, not built on. */
export function roadCells(nav: Nav, x0: number, z0: number, x1: number, z1: number, out: number[]): number {
  out.length = 0;
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (ROADS.cellM * 0.5)));
  let last = -1;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const i = cellOf(z0 + (z1 - z0) * t) * N + cellOf(x0 + (x1 - x0) * t);
    if (i === last) continue;
    last = i;
    if (nav.road[i] === 1 || nav.built[i] === 1 || WATER[i] === 1 || out.includes(i)) continue;
    out.push(i);
  }
  return out.length;
}

export function layRoad(nav: Nav, cells: readonly number[]): void {
  for (const i of cells) nav.road[i] = 1;
  if (cells.length > 0) nav.version += 1;
}

// ---- A* --------------------------------------------------------------------
// One search at a time: its working arrays are shared and never reallocated.

const gScore = new Float32Array(CELLS);
const cameFrom = new Int32Array(CELLS);
const stamp = new Uint32Array(CELLS);
const closed = new Uint32Array(CELLS);
const heap = new Int32Array(CELLS);
const heapF = new Float32Array(CELLS);
let heapSize = 0;
let generation = 0;

function heapPush(cell: number, f: number): void {
  let i = heapSize++;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if ((heapF[parent] as number) <= f) break;
    heap[i] = heap[parent] as number;
    heapF[i] = heapF[parent] as number;
    i = parent;
  }
  heap[i] = cell;
  heapF[i] = f;
}

function heapPop(): number {
  const top = heap[0] as number;
  heapSize--;
  const cell = heap[heapSize] as number;
  const f = heapF[heapSize] as number;
  let i = 0;
  for (;;) {
    let child = 2 * i + 1;
    if (child >= heapSize) break;
    if (child + 1 < heapSize && (heapF[child + 1] as number) < (heapF[child] as number)) child++;
    if ((heapF[child] as number) >= f) break;
    heap[i] = heap[child] as number;
    heapF[i] = heapF[child] as number;
    i = child;
  }
  heap[i] = cell;
  heapF[i] = f;
  return top;
}

function passable(nav: Nav, i: number): boolean {
  return nav.built[i] === 0 && WATER[i] === 0;
}

function costOf(nav: Nav, i: number): number {
  if (nav.road[i] === 1) return COST_ROAD;
  return FOREST[i] === 1 ? COST_FOREST : COST_OPEN;
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];

/**
 * The quickest way from one point to another, written into `out` as x, z pairs ending with the
 * target itself; returns the number of way points (0 when there is no way). The start and the target
 * may themselves be inside a building (a man leaving a door, a door as a goal).
 */
export function findPath(nav: Nav, sx: number, sz: number, tx: number, tz: number, out: Float32Array): number {
  const start = cellOf(sz) * N + cellOf(sx);
  const goal = cellOf(tz) * N + cellOf(tx);
  const maxPoints = out.length / 2;
  if (start === goal) {
    out[0] = tx;
    out[1] = tz;
    return 1;
  }
  generation++;
  heapSize = 0;
  const goalX = goal % N;
  const goalZ = (goal / N) | 0;
  gScore[start] = 0;
  stamp[start] = generation;
  cameFrom[start] = -1;
  heapPush(start, 0);
  let found = false;
  while (heapSize > 0) {
    const cell = heapPop();
    if (cell === goal) {
      found = true;
      break;
    }
    if (closed[cell] === generation) continue;
    closed[cell] = generation;
    const cx = cell % N;
    const cz = (cell / N) | 0;
    const here = gScore[cell] as number;
    for (let k = 0; k < 8; k++) {
      const nx = cx + (DX[k] as number);
      const nz = cz + (DZ[k] as number);
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const next = nz * N + nx;
      if (closed[next] === generation) continue;
      if (next !== goal && !passable(nav, next)) continue;
      // No cutting a corner between two blocked cells.
      if (k >= 4 && (!passable(nav, cz * N + nx) || !passable(nav, nz * N + cx))) continue;
      const step = (k >= 4 ? Math.SQRT2 : 1) * 0.5 * (costOf(nav, cell) + costOf(nav, next));
      const g = here + step;
      if (stamp[next] === generation && g >= (gScore[next] as number)) continue;
      gScore[next] = g;
      stamp[next] = generation;
      cameFrom[next] = cell;
      // Octile distance at the price of the best ground there is: never more than the true cost.
      const ax = Math.abs(nx - goalX);
      const az = Math.abs(nz - goalZ);
      heapPush(next, g + (Math.max(ax, az) + (Math.SQRT2 - 1) * Math.min(ax, az)) * COST_ROAD);
    }
  }
  if (!found) return 0;
  // Walk back from the goal, keeping only the cells where the way turns.
  let count = 0;
  let cell = cameFrom[goal] as number;
  let lastDir = -9;
  let prev = goal;
  heapSize = 0;
  while (cell !== -1) {
    const dir = (prev % N) - (cell % N) + 3 * (((prev / N) | 0) - ((cell / N) | 0));
    // `prev` is where the way bends: the step into it and the step out of it differ.
    if (dir !== lastDir && prev !== goal) heap[heapSize++] = prev;
    lastDir = dir;
    prev = cell;
    cell = cameFrom[cell] as number;
  }
  // The turns were collected goal-first; if there are too many, the nearest to the start are dropped last.
  const turns = Math.min(heapSize, maxPoints - 1);
  for (let i = turns - 1; i >= 0; i--) {
    const c = heap[i] as number;
    out[count * 2] = centreOf(c % N);
    out[count * 2 + 1] = centreOf((c / N) | 0);
    count++;
  }
  out[count * 2] = tx;
  out[count * 2 + 1] = tz;
  return count + 1;
}

/** World X of the middle of a road cell, for the view. */
export function cellX(i: number): number {
  return centreOf(i % N);
}

export function cellZ(i: number): number {
  return centreOf((i / N) | 0);
}
