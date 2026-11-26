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

/** Road cells' centres across a street of STREETS.widthCells cells on a centre line: the offsets to lay. */
export function laneOffsets(): number[] {
  const n = STREETS.widthCells;
  return Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * ROADS.cellM);
}

/** How far out (in squares from the keep) the planned streets are kept clear of buildings off the grid. */
const CLEAR_SQUARES = FIRST + 3 * STREETS.blockSquares;

/**
 * True when a circle of `radiusM` at (x, z) would stand on one of the planned streets of the side's town (its
 * inner blocks, CLEAR_SQUARES out): the computer puts nothing off the grid there, so its streets run through.
 */
export function onPlannedStreet(side: Side, x: number, z: number, radiusM: number): boolean {
  const u = (x - originX(side)) / G;
  const v = (z - originZ(side)) / G;
  if (Math.abs(u) > CLEAR_SQUARES + 1 || Math.abs(v) > CLEAR_SQUARES + 1) return false;
  const clear = radiusM + (STREETS.widthCells * ROADS.cellM) / 2 + 1;
  const near = (w: number, other: number): boolean => {
    if (Math.abs(other) > CLEAR_SQUARES + clear / G) return false;
    const a = Math.abs(w);
    // Nearest street line to w (|w| below FIRST: the ring's line itself).
    const n = Math.max(0, Math.round((a - FIRST) / STREETS.blockSquares));
    const line = Math.min(FIRST + n * STREETS.blockSquares, CLEAR_SQUARES);
    return Math.abs(a - line) * G < clear;
  };
  return near(u, v) || near(v, u);
}
