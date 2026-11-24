import { ROADS, STREETS, TOWN } from '../config.ts';
import { townX, townZ } from './terrain.ts';
import type { Side } from './types.ts';

// The town plan on a chessboard (after anbow1/mediveal-village's grid-planned towns): building squares
// TOWN.gridM apart, lined up with the keep, gathered into blocks of STREETS.blockSquares × blockSquares,
// with a street STREETS.widthCells road cells wide on every line between two blocks. The keep's own block
// (its square and the ring next to it, which its walls and yard fill) is bounded by the first lines, so every
// other square stands at a corner of its block with a street on two sides: its door looks onto one of them.
//
// Square offsets are counted in squares from the keep's square; street lines lie half-way between two squares
// (offsets ±1.5, ±3.5, … for blocks of 2 round a keep block of 3).

const G = TOWN.gridM;
const FIRST = STREETS.keepBlockHalf + 0.5;

/** The grid's origin for a side: the keep's square, on the road cells (the player's grid and the planner's). */
export function originX(side: Side): number {
  return Math.round(townX(side) / ROADS.cellM) * ROADS.cellM;
}

export function originZ(side: Side): number {
  return Math.round(townZ(side) / ROADS.cellM) * ROADS.cellM;
}

/** True when `offset` (in squares from the keep) is a street line. */
export function isStreetLine(offset: number): boolean {
  const a = Math.abs(offset);
  if (a < FIRST - 1e-6) return false;
  const n = (a - FIRST) / STREETS.blockSquares;
  return Math.abs(n - Math.round(n)) < 1e-6;
}

/** The street line beside square `i` (an offset in squares), or null for the keep's own square. */
export function streetBeside(i: number): number | null {
  if (i === 0) return null;
  const a = Math.abs(i);
  const s = Math.sign(i);
  if (a <= STREETS.keepBlockHalf) return s * FIRST;
  const lo = FIRST + Math.floor((a - FIRST) / STREETS.blockSquares) * STREETS.blockSquares;
  const hi = lo + STREETS.blockSquares;
  return s * (a - lo < hi - a ? lo : hi);
}

/** The square a point is on, when it is on one (within a centimetre); else null. */
export function squareAt(side: Side, x: number, z: number): [number, number] | null {
  const i = Math.round((x - originX(side)) / G);
  const j = Math.round((z - originZ(side)) / G);
  if (Math.abs(originX(side) + i * G - x) > 0.01 || Math.abs(originZ(side) + j * G - z) > 0.01) return null;
  return [i, j];
}

const turn = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/**
 * The door facing of a building on a grid square: onto one of the two streets at its block's corner, the one
 * nearer `preferYaw` (towards the keep, or as the player turned it). Off the grid, `preferYaw` squared.
 */
export function streetYaw(side: Side, x: number, z: number, preferYaw: number): number {
  const sq = squareAt(side, x, z);
  const squared = Math.round(preferYaw / (Math.PI / 2)) * (Math.PI / 2);
  if (!sq) return squared;
  const [i, j] = sq;
  const options: number[] = [];
  const sx = streetBeside(i);
  const sz = streetBeside(j);
  // Yaw 0 looks along +Z, π/2 along +X.
  if (sx !== null) options.push(sx > i ? Math.PI / 2 : -Math.PI / 2);
  if (sz !== null) options.push(sz > j ? 0 : Math.PI);
  if (options.length === 0) return squared;
  return options.reduce((best, y) => (turn(y, preferYaw) < turn(best, preferYaw) ? y : best));
}

/** A straight leg of a street, centre line from (x0, z0) to (x1, z1): along one axis only. */
export type Leg = readonly [number, number, number, number];

/**
 * The way from a building's door to the keep along the streets: out of the door onto its street, along it to
 * the keep block's edge, along that edge to the middle of the keep's side, then straight in across the yard.
 * Null off the grid (the caller lays its straight road as before).
 */
export function streetWay(side: Side, x: number, z: number, yawRad: number): Leg[] | null {
  const sq = squareAt(side, x, z);
  if (!sq) return null;
  const ox = originX(side);
  const oz = originZ(side);
  const [i, j] = sq;
  const alongX = Math.abs(Math.sin(yawRad)) > 0.5;
  const legs: Leg[] = [];
  // The door's street line, in metres, and the point of it in front of the door.
  const line = alongX ? streetBeside(i) : streetBeside(j);
  if (line === null) return null;
  const doorX = alongX ? ox + line * G : x;
  const doorZ = alongX ? z : oz + line * G;
  const edge = FIRST * G;
  // From the door to the line round the keep block, along the door's street: the cross street nearest the keep.
  let px = doorX;
  let pz = doorZ;
  const push = (nx: number, nz: number): void => {
    if (Math.abs(nx - px) > 0.01 || Math.abs(nz - pz) > 0.01) legs.push([px, pz, nx, nz]);
    px = nx;
    pz = nz;
  };
  // The doorstep, just outside the footprint.
  px = x + Math.sin(yawRad) * (TOWN.buildingRadiusM + 0.5);
  pz = z + Math.cos(yawRad) * (TOWN.buildingRadiusM + 0.5);
  push(doorX, doorZ);
  // Along the door's street to the street round the keep block (the nearer side of it, even for a square in
  // the keep's own row, whose middle is building ground); along that to the middle of the keep's side.
  const side1 = (d: number): number => (Math.abs(d) > 0.01 ? Math.sign(d) : 1);
  if (alongX) {
    if (Math.abs(px - ox) > edge + 0.01) {
      const ringZ = oz + side1(pz - oz) * edge;
      push(px, ringZ);
      push(ox + Math.sign(px - ox) * edge, ringZ);
    }
    push(px, oz);
  } else {
    if (Math.abs(pz - oz) > edge + 0.01) {
      const ringX = ox + side1(px - ox) * edge;
      push(ringX, pz);
      push(ringX, oz + Math.sign(pz - oz) * edge);
    }
    push(ox, pz);
  }
  // Across the yard to the keep's wall.
  const inX = Math.abs(px - ox) > Math.abs(pz - oz);
  const wall = TOWN.keepRadiusM + 1;
  push(inX ? ox + Math.sign(px - ox) * wall : px, inX ? pz : oz + Math.sign(pz - oz) * wall);
  return legs;
}

/** Road cells' centres across a street of STREETS.widthCells cells on a centre line: the offsets to lay. */
export function laneOffsets(): number[] {
  const n = STREETS.widthCells;
  return Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * ROADS.cellM);
}
