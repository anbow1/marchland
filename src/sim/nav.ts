import { MAP, ROADS } from '../config.ts';
import { isForest, isImpassable } from './terrain.ts';
import { hypot2 } from '../core/hypot.ts';

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

// The land itself never changes: forest, and water or sheer rock, per cell, worked out once.
const FOREST = new Uint8Array(CELLS);
const WATER = new Uint8Array(CELLS);
for (let cz = 0; cz < N; cz++) {
  for (let cx = 0; cx < N; cx++) {
    const x = (cx + 0.5) * ROADS.cellM - MAP.halfM;
    const z = (cz + 0.5) * ROADS.cellM - MAP.halfM;
    FOREST[cz * N + cx] = isForest(x, z) ? 1 : 0;
    WATER[cz * N + cx] = isImpassable(x, z) ? 1 : 0;
  }
}

/** How many cells to the nearest water or rock (capped at SHORE_CELLS + 1): a column keeps off the very edge of a ford. */
const SHORE_CELLS = 2;
const SHORE = new Uint8Array(CELLS).fill(SHORE_CELLS + 1);
for (let cz = 0; cz < N; cz++) {
  for (let cx = 0; cx < N; cx++) {
    if (WATER[cz * N + cx] !== 1) continue;
    for (let dz = -SHORE_CELLS; dz <= SHORE_CELLS; dz++) {
      for (let dx = -SHORE_CELLS; dx <= SHORE_CELLS; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || z < 0 || x >= N || z >= N) continue;
        const i = z * N + x;
        const d = Math.max(Math.abs(dx), Math.abs(dz));
        if (d < (SHORE[i] as number)) SHORE[i] = d;
      }
    }
  }
}

export interface Nav {
  /** 1 where a road has been laid. */
  road: Uint8Array;
  /** 1 where a building stands. */
  built: Uint8Array;
  /** Walls: blows left in each cell (0 = no wall), the side that built it, and its line (0 along X, 1 along Z, 2 and 3 the diagonals). */
  wallHp: Uint16Array;
  wallSide: Uint8Array;
  /** 1 where a stretch of wall was battered down and lies as rubble (passable; drawn as a heap of stones). */
  wallRubble: Uint8Array;
  wallDir: Uint8Array;
  /** 1 where the wall is a gate: open to its own side's people and soldiers. */
  wallGate: Uint8Array;
  /** Goes up whenever roads or buildings change: paths and the view's ground refresh on it. */
  version: number;
  /** Cells the path finder may still look at this step. */
  budget: number;
}

export function createNav(): Nav {
  return { road: new Uint8Array(CELLS), built: new Uint8Array(CELLS), wallHp: new Uint16Array(CELLS), wallSide: new Uint8Array(CELLS), wallRubble: new Uint8Array(CELLS), wallDir: new Uint8Array(CELLS), wallGate: new Uint8Array(CELLS), version: 0, budget: ROADS.cellsPerStep };
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
  if (Math.abs(x) >= MAP.halfM || Math.abs(z) >= MAP.halfM) return false;
  return nav.road[cellOf(z) * N + cellOf(x)] === 1;
}

/** True where a building or a keep stands. */
export function isBuiltOn(nav: Nav, x: number, z: number): boolean {
  if (Math.abs(x) >= MAP.halfM || Math.abs(z) >= MAP.halfM) return false;
  return nav.built[cellOf(z) * N + cellOf(x)] === 1;
}

/** True when the cell at a point or any of its eight neighbours is built on: a cheap test before any wall maths. */
export function nearBuilt(nav: Nav, x: number, z: number): boolean {
  if (Math.abs(x) >= MAP.halfM || Math.abs(z) >= MAP.halfM) return false;
  const cx = cellOf(x);
  const cz = cellOf(z);
  for (let dz = -1; dz <= 1; dz++) {
    const row = cz + dz;
    if (row < 0 || row >= N) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const col = cx + dx;
      if (col >= 0 && col < N && nav.built[row * N + col] === 1) return true;
    }
  }
  return false;
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
      if (hypot2(centreOf(cx) - x, centreOf(cz) - z) > radiusM) continue;
      nav.built[cz * N + cx] = built ? 1 : 0;
      if (built) nav.road[cz * N + cx] = 0;
    }
  }
  nav.version += 1;
}

/** Cells a straight road from one point to another would cover that are not road yet and can be: not water, not built on. */
export function roadCells(nav: Nav, x0: number, z0: number, x1: number, z1: number, out: number[]): number {
  out.length = 0;
  const steps = Math.max(1, Math.ceil(hypot2(x1 - x0, z1 - z0) / (ROADS.cellM * 0.5)));
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

/** The cell itself if it is open, else the nearest open cell within ROADS.goalSnapCells, else the cell itself. */
function nearestOpen(nav: Nav, cell: number): number {
  if (passable(nav, cell)) return cell;
  const cx = cell % N;
  const cz = (cell / N) | 0;
  for (let r = 1; r <= ROADS.goalSnapCells; r++) {
    let best = -1;
    let bestD = Number.POSITIVE_INFINITY;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const i = nz * N + nx;
        const d = dx * dx + dz * dz;
        if (d < bestD && passable(nav, i)) {
          best = i;
          bestD = d;
        }
      }
    }
    if (best >= 0) return best;
  }
  return cell;
}

/** Whose way is being found: -1 townspeople (any gate is theirs), else a regiment's side (only its own gates open). */
let passSide = -1;

function passable(nav: Nav, i: number): boolean {
  if (nav.built[i] !== 0 || WATER[i] !== 0) return false;
  if (passSide < 0) return nav.wallHp[i] === 0 || nav.wallGate[i] === 1;
  return !wallStops(nav, i, passSide);
}

/** True when a straight line between two points crosses water, sheer rock or a wall that stops soldiers of `side` (checked every metre). */
export function blockedBetween(nav: Nav, side: number, x0: number, z0: number, x1: number, z1: number): boolean {
  const steps = Math.ceil(hypot2(x1 - x0, z1 - z0));
  for (let k = 1; k < steps; k++) {
    const x = x0 + ((x1 - x0) * k) / steps;
    const z = z0 + ((z1 - z0) * k) / steps;
    if (Math.abs(x) >= MAP.halfM || Math.abs(z) >= MAP.halfM) continue;
    const i = cellOf(z) * N + cellOf(x);
    if (WATER[i] === 1 || (nav.wallHp[i] > 0 && wallStops(nav, i, side))) return true;
  }
  return false;
}

/**
 * A regiment's way round walls, water and rock: as findPath, but through its own side's gates only, and round buildings and
 * water. Returns the number of way points (0 when there is none within the search's reach).
 */
export function findRoute(nav: Nav, side: number, sx: number, sz: number, tx: number, tz: number, out: Float32Array): number {
  passSide = side;
  try {
    return findPath(nav, sx, sz, tx, tz, out);
  } finally {
    passSide = -1;
  }
}

/** True where a wall stops a soldier of `side`: any standing wall but his own side's gates. */
export function wallStops(nav: Nav, cell: number, side: number): boolean {
  return nav.wallHp[cell] > 0 && !(nav.wallGate[cell] === 1 && nav.wallSide[cell] === side);
}

/**
 * The cells a gate set into the wall at (x, z) would take: the wall cell there and its neighbours along
 * the wall's line, `count` in all. Writes them to `out`; returns how many (fewer than `count` if the wall
 * is not long enough, or not all one side's, or a gate already).
 */
export function gateCells(nav: Nav, x: number, z: number, side: number, count: number, out: number[]): number {
  out.length = 0;
  if (Math.abs(x) >= MAP.halfM || Math.abs(z) >= MAP.halfM) return 0;
  const cx = cellOf(x);
  const cz = cellOf(z);
  const centre = cz * N + cx;
  if (nav.wallHp[centre] === 0 || nav.wallSide[centre] !== side || nav.wallGate[centre] === 1) return 0;
  // Steps along the wall's line: 0 along X, 1 along Z, 2 the diagonal (+X, +Z), 3 the other.
  const dir = nav.wallDir[centre] as number;
  const [sx, sz] = dir === 0 ? [1, 0] : dir === 1 ? [0, 1] : dir === 2 ? [1, 1] : [-1, 1];
  const half = (count - 1) >> 1;
  for (let k = -half; k <= count - 1 - half; k++) {
    const ix = cx + k * sx;
    const iz = cz + k * sz;
    if (ix < 0 || iz < 0 || ix >= N || iz >= N) return out.length;
    const i = iz * N + ix;
    if (nav.wallHp[i] === 0 || nav.wallSide[i] !== side || nav.wallGate[i] === 1) return out.length;
    out.push(i);
  }
  return out.length;
}

/** Makes the cells a gate of their wall's side, with `hp` blows to break. */
export function layGate(nav: Nav, cells: readonly number[], hp: number): void {
  for (const i of cells) {
    nav.wallGate[i] = 1;
    nav.wallHp[i] = Math.max(nav.wallHp[i] as number, hp);
  }
  if (cells.length > 0) nav.version += 1;
}

/** The wall cell at a point, or -1 where there is no wall. */
export function wallCellAt(nav: Nav, x: number, z: number): number {
  if (Math.abs(x) >= MAP.halfM || Math.abs(z) >= MAP.halfM) return -1;
  const i = cellOf(z) * N + cellOf(x);
  return nav.wallHp[i] > 0 ? i : -1;
}

/** Cells a straight wall from one point to another would take: not water, not built on, not wall already. */
export function wallCells(nav: Nav, x0: number, z0: number, x1: number, z1: number, out: number[], throughBuilt: ((cell: number) => boolean) | null = null): number {
  out.length = 0;
  const steps = Math.max(1, Math.ceil(hypot2(x1 - x0, z1 - z0) / (ROADS.cellM * 0.5)));
  let last = -1;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const i = cellOf(z0 + (z1 - z0) * t) * N + cellOf(x0 + (x1 - x0) * t);
    if (i === last) continue;
    last = i;
    // Built-on ground stops a wall, but for what `throughBuilt` lets it into (a watchtower it joins).
    if (nav.wallHp[i] > 0 || (nav.built[i] === 1 && !throughBuilt?.(i)) || WATER[i] === 1 || out.includes(i)) continue;
    out.push(i);
  }
  return out.length;
}

/** Builds wall on the cells, for a side, along the line from (x0, z0) to (x1, z1); a road under it is gone. */
export function layWall(nav: Nav, cells: readonly number[], side: number, x0: number, z0: number, x1: number, z1: number, hp: number): void {
  const a = Math.atan2(z1 - z0, x1 - x0);
  const octant = ((Math.round(a / (Math.PI / 4)) % 4) + 4) % 4;
  // 0 along X, 1 the diagonal up, 2 along Z, 3 the other diagonal: stored as 0 X, 1 Z, 2 and 3 diagonals.
  const dir = octant === 0 ? 0 : octant === 2 ? 1 : octant === 1 ? 2 : 3;
  for (const i of cells) {
    nav.wallHp[i] = hp;
    nav.wallSide[i] = side;
    nav.wallDir[i] = dir;
    nav.wallGate[i] = 0;
    nav.road[i] = 0;
    nav.wallRubble[i] = 0;
  }
  if (cells.length > 0) nav.version += 1;
}

/** Takes `amount` off a wall cell; true when that brought it down. */
export function damageWall(nav: Nav, cell: number, amount: number): boolean {
  const hp = nav.wallHp[cell] as number;
  if (hp === 0) return false;
  const left = Math.max(0, hp - Math.max(1, Math.round(amount)));
  nav.wallHp[cell] = left;
  if (left > 0) return false;
  nav.wallRubble[cell] = 1;
  nav.version += 1;
  return true;
}

/** The nearest cell to a wall cell (of the eight round it) that is not wall, nearest the given point; -1 if none. */
export function freeCellBeside(nav: Nav, cell: number, nearX: number, nearZ: number): number {
  const cx = cell % N;
  const cz = (cell / N) | 0;
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  for (let k = 0; k < 8; k++) {
    const nx = cx + (DX[k] as number);
    const nz = cz + (DZ[k] as number);
    if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
    const i = nz * N + nx;
    if (nav.wallHp[i] > 0) continue;
    const d = (centreOf(nx) - nearX) ** 2 + (centreOf(nz) - nearZ) ** 2;
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

/** Extra cost of a cell beside water, rock or a wall that stops him (by how many cells off it is): a regiment's way runs through the middle of a ford or a gate. */
const EDGE_COST = [0, 4, 1.5];

function costOf(nav: Nav, i: number): number {
  const ground = nav.road[i] === 1 ? COST_ROAD : FOREST[i] === 1 ? COST_FOREST : COST_OPEN;
  if (passSide < 0) return ground;
  let near = SHORE[i] as number;
  if (near > SHORE_CELLS) near = SHORE_CELLS + 1;
  const cx = i % N;
  const cz = (i / N) | 0;
  for (let dz = -SHORE_CELLS; dz <= SHORE_CELLS && near > 1; dz++) {
    const z = cz + dz;
    if (z < 0 || z >= N) continue;
    for (let dx = -SHORE_CELLS; dx <= SHORE_CELLS; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= N) continue;
      const j = z * N + x;
      if (nav.wallHp[j] === 0 || !wallStops(nav, j, passSide)) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dz));
      if (d < near) near = d;
    }
  }
  return ground + (EDGE_COST[near] ?? 0);
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
  // A goal in the water or inside a building cannot be reached by any way: search for the nearest open
  // cell instead and walk the last stretch straight (a fisher's spot on the bank, a door in a wall).
  // Without this the search looked at the whole map, 8 ms, before giving up.
  const goal = nearestOpen(nav, cellOf(tz) * N + cellOf(tx));
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
  let looked = 0;
  while (heapSize > 0) {
    if (++looked > ROADS.maxCellsPerSearch) break;
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
    const hereCost = costOf(nav, cell);
    for (let k = 0; k < 8; k++) {
      const nx = cx + (DX[k] as number);
      const nz = cz + (DZ[k] as number);
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const next = nz * N + nx;
      if (closed[next] === generation) continue;
      if (next !== goal && !passable(nav, next)) continue;
      // No cutting a corner between two blocked cells.
      if (k >= 4 && (!passable(nav, cz * N + nx) || !passable(nav, nz * N + cx))) continue;
      const step = (k >= 4 ? Math.SQRT2 : 1) * 0.5 * (hereCost + costOf(nav, next));
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
  nav.budget -= looked;
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
