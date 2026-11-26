import { ROADS, STREETS, TOWN } from '../config.ts';
import { cmdBuildStreet, streetCells, streetCost } from './commands.ts';
import { cellX, cellZ, isBuiltOn, isRoad, layRoad, NAV_CELLS_PER_SIDE, ROAD_NONE, ROAD_PAVED, ROAD_TRACK, roadCells } from './nav.ts';
import { doorOfX, doorOfZ, mayLayRoadAt } from './placement.ts';
import { type Leg, originX, originZ, squareAt, streetBeside } from './streets.ts';
import { isImpassable } from './terrain.ts';
import type { Side } from './types.ts';
import type { World } from './world.ts';
import type { Building } from './economy.ts';
import { hypot2 } from '../core/hypot.ts';

// The town's streets as a network: crossings where two street lines of the chessboard meet (streets.ts), and
// the stretches between neighbouring crossings, a whole block's side each. A building's street is the
// stretch its door looks onto, laid from crossing to crossing, and joined to the keep along the cheapest
// way through the network: stretches already laid cost next to nothing, so a new street runs on from the
// old ones and the town's streets grow as long straight lines meeting at crossings, never as stubs that
// stop in the middle of a block. Round the keep's block the ring street has a crossing in the middle of
// each side, from which a short street crosses the yard to the keep.
//
// A building off the grid (a farm out in its fields) gets a straight track from its door to the nearest
// road, when there is one near enough; never a long road across the fields of its own.

const G = TOWN.gridM;
const F = STREETS.keepBlockHalf + 0.5;
/** Street lines as far out as any town reaches (in squares from the keep). */
const BLOCKS_OUT = 8;
const LINES: number[] = [];
for (let n = BLOCKS_OUT; n >= 0; n--) LINES.push(-(F + n * STREETS.blockSquares));
for (let n = 0; n <= BLOCKS_OUT; n++) LINES.push(F + n * STREETS.blockSquares);
/** Along a line of the keep's ring, its middle is a crossing as well (the way into the yard). */
const RING_LINES = [...LINES.slice(0, BLOCKS_OUT + 1), 0, ...LINES.slice(BLOCKS_OUT + 1)];

const isLine = (v: number): boolean => LINES.includes(v);
/** The stops along street line `fixed` (a, b offsets in squares): the crossings with every other line. */
const stopsAlong = (fixed: number): number[] => (Math.abs(fixed) === F ? RING_LINES : LINES);

/** How far through the town a street costs per road cell still to lay, against one already laid. */
const LAID_WEIGHT = 0.08;

type Node = readonly [number, number];
const KEEP_KEY = 'keep';
const keyOf = (a: number, b: number): string => `${a},${b}`;

/** The stretch between two neighbouring crossings, in metres, as a leg. */
function legOf(side: Side, a0: number, b0: number, a1: number, b1: number): Leg {
  const ox = originX(side);
  const oz = originZ(side);
  return [ox + a0 * G, oz + b0 * G, ox + a1 * G, oz + b1 * G];
}

/** The short street from the middle of the ring's side across the yard to the keep's wall. */
function yardLeg(side: Side, a: number, b: number): Leg {
  const ox = originX(side);
  const oz = originZ(side);
  const wall = TOWN.keepRadiusM + 1;
  const x0 = ox + a * G;
  const z0 = oz + b * G;
  return [x0, z0, a !== 0 ? ox + Math.sign(a) * wall : x0, b !== 0 ? oz + Math.sign(b) * wall : z0];
}

const one: Leg[] = [];
const cellScratch: number[] = [];

/** What a leg costs to walk the plan over: Infinity where it cannot be laid (a building, water, rock, the enemy). */
function legWeight(world: World, side: Side, leg: Leg, endSlackM = 0): number {
  const [x0, z0, x1, z1] = leg;
  if (!mayLayRoadAt(side, x0, z0) || !mayLayRoadAt(side, x1, z1)) return Number.POSITIVE_INFINITY;
  const len = hypot2(x1 - x0, z1 - z0);
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const half = (STREETS.widthCells * ROADS.cellM) / 2 - 0.5;
  // A yard street stops at the keep's wall: its last metres are not looked at (the keep's own cells).
  for (let s = 0; s <= len - endSlackM; s += 1) {
    const t = len > 0 ? s / len : 0;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    for (const o of [-half, half]) {
      const px = alongX ? x : x + o;
      const pz = alongX ? z + o : z;
      if (isImpassable(px, pz) || isBuiltOn(world.nav, px, pz)) return Number.POSITIVE_INFINITY;
    }
  }
  one[0] = leg;
  const todo = streetCells(world, one, cellScratch);
  return todo + (len / ROADS.cellM) * LAID_WEIGHT;
}

/** The crossings next to (a, b) along the street lines through it, and the keep from a ring's middle. */
function neighbours(a: number, b: number): Node[] {
  const out: Node[] = [];
  if (isLine(b)) {
    const stops = stopsAlong(b);
    const k = stops.indexOf(a);
    if (k > 0) out.push([stops[k - 1] as number, b]);
    if (k >= 0 && k < stops.length - 1) out.push([stops[k + 1] as number, b]);
  }
  if (isLine(a)) {
    const stops = stopsAlong(a);
    const k = stops.indexOf(b);
    if (k > 0) out.push([a, stops[k - 1] as number]);
    if (k >= 0 && k < stops.length - 1) out.push([a, stops[k + 1] as number]);
  }
  return out;
}

const isRingMiddle = (a: number, b: number): boolean => (a === 0 && Math.abs(b) === F) || (b === 0 && Math.abs(a) === F);

/**
 * The cheapest way through the network from the given crossings to the keep, as legs; null where none can be laid.
 * Dijkstra over a few hundred crossings: cheap enough to run when a building is placed, or on the cursor.
 */
function wayToKeep(world: World, side: Side, starts: readonly Node[]): Leg[] | null {
  const dist = new Map<string, number>();
  const from = new Map<string, { prev: string; leg: Leg }>();
  const open: { key: string; node: Node | null; d: number }[] = [];
  for (const s of starts) {
    const key = keyOf(s[0], s[1]);
    dist.set(key, 0);
    open.push({ key, node: s, d: 0 });
  }
  const done = new Set<string>();
  while (open.length > 0) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if ((open[i] as (typeof open)[number]).d < (open[best] as (typeof open)[number]).d) best = i;
    const cur = open.splice(best, 1)[0] as (typeof open)[number];
    if (done.has(cur.key)) continue;
    done.add(cur.key);
    if (cur.key === KEEP_KEY) break;
    const [a, b] = cur.node as Node;
    const relax = (key: string, node: Node | null, leg: Leg, slackM = 0): void => {
      if (done.has(key)) return;
      const w = legWeight(world, side, leg, slackM);
      if (!Number.isFinite(w)) return;
      const d = cur.d + w;
      if (d >= (dist.get(key) ?? Number.POSITIVE_INFINITY)) return;
      dist.set(key, d);
      from.set(key, { prev: cur.key, leg });
      open.push({ key, node, d });
    };
    for (const [na, nb] of neighbours(a, b)) relax(keyOf(na, nb), [na, nb], legOf(side, a, b, na, nb));
    if (isRingMiddle(a, b)) relax(KEEP_KEY, null, yardLeg(side, a, b), 2);
  }
  if (!done.has(KEEP_KEY)) return null;
  const legs: Leg[] = [];
  for (let key = KEEP_KEY; from.has(key); ) {
    const step = from.get(key) as { prev: string; leg: Leg };
    legs.push(step.leg);
    key = step.prev;
  }
  return legs.reverse();
}

/** The two crossings either side of `v` along a line's stops (both `v` when it is a crossing itself). */
function bracket(stops: readonly number[], v: number): [number, number] | null {
  if (stops.includes(v)) return [v, v];
  for (let k = 0; k + 1 < stops.length; k++) if ((stops[k] as number) < v && v < (stops[k + 1] as number)) return [stops[k] as number, stops[k + 1] as number];
  return null;
}

/**
 * True when the street in front of a building on the grid is laid: its doorstep and the stretch it looks onto
 * (laid with its way to the keep, so the rest is there as well). A cheap test before planning anything.
 */
export function streetLaid(world: World, side: Side, x: number, z: number, yawRad: number): boolean {
  const front = frontOf(side, x, z, yawRad);
  if (!front) return true;
  return streetCells(world, front, cellScratch) === 0;
}

/** The doorstep leg and the stretch of street a grid building looks onto; null off the grid. */
function frontOf(side: Side, x: number, z: number, yawRad: number): Leg[] | null {
  const sq = squareAt(side, x, z);
  if (!sq) return null;
  const [i, j] = sq;
  const alongX = Math.abs(Math.sin(yawRad)) > 0.5;
  const line = alongX ? streetBeside(i) : streetBeside(j);
  if (line === null) return null;
  const span = bracket(stopsAlong(line), alongX ? j : i);
  if (!span) return null;
  const ox = originX(side);
  const oz = originZ(side);
  const stepX = x + Math.sin(yawRad) * (TOWN.buildingRadiusM + 0.5);
  const stepZ = z + Math.cos(yawRad) * (TOWN.buildingRadiusM + 0.5);
  const legs: Leg[] = [[stepX, stepZ, alongX ? ox + line * G : stepX, alongX ? stepZ : oz + line * G]];
  const [lo, hi] = span;
  if (lo !== hi) legs.push(alongX ? legOf(side, line, lo, line, hi) : legOf(side, lo, line, hi, line));
  return legs;
}

let memoWorld: World | null = null;
let memoKey = '';
let memoPlan: Leg[] | null = null;

/**
 * The street a building on the grid square at (x, z), door looking along `yawRad`, needs: from its doorstep onto
 * its street, the whole stretch of that street between the crossings either side, and on through the network to
 * the keep. Null off the grid, or where no street can reach the keep. Legs already laid cost nothing to lay again.
 */
export function streetPlan(world: World, side: Side, x: number, z: number, yawRad: number): Leg[] | null {
  const key = `${world.nav.version}|${side}|${x}|${z}|${yawRad}`;
  if (key === memoKey && world === memoWorld) return memoPlan;
  memoWorld = world;
  memoKey = key;
  memoPlan = plan(world, side, x, z, yawRad);
  return memoPlan;
}

function plan(world: World, side: Side, x: number, z: number, yawRad: number): Leg[] | null {
  const sq = squareAt(side, x, z);
  if (!sq) return null;
  const [i, j] = sq;
  const alongX = Math.abs(Math.sin(yawRad)) > 0.5;
  const line = alongX ? streetBeside(i) : streetBeside(j);
  if (line === null) return null;
  const across = alongX ? j : i;
  const span = bracket(stopsAlong(line), across);
  if (!span) return null;
  const ox = originX(side);
  const oz = originZ(side);
  // The doorstep, just outside the footprint, to the street in front of it.
  const stepX = x + Math.sin(yawRad) * (TOWN.buildingRadiusM + 0.5);
  const stepZ = z + Math.cos(yawRad) * (TOWN.buildingRadiusM + 0.5);
  const legs: Leg[] = [[stepX, stepZ, alongX ? ox + line * G : stepX, alongX ? stepZ : oz + line * G]];
  const node = (v: number): Node => (alongX ? [line, v] : [v, line]);
  const [lo, hi] = span;
  if (lo !== hi) {
    const front = legOf(side, ...node(lo), ...node(hi));
    if (!Number.isFinite(legWeight(world, side, front))) return null;
    legs.push(front);
  }
  const way = wayToKeep(world, side, lo === hi ? [node(lo)] : [node(lo), node(hi)]);
  if (!way) return null;
  legs.push(...way);
  return legs;
}

/** True when a straight track from (x0, z0) to (x1, z1) would cross a building, water or rock. */
function trackBlocked(world: World, x0: number, z0: number, x1: number, z1: number): boolean {
  const len = hypot2(x1 - x0, z1 - z0);
  // From a step past the doorstep (the door's own cell may be the building's).
  for (let s = 1.5; s <= len; s += 1) {
    const t = len > 0 ? s / len : 0;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    if (isImpassable(x, z) || isBuiltOn(world.nav, x, z)) return true;
  }
  return false;
}

const candidates: number[] = [];

/**
 * The nearest cell of a paved road or street within `reachM` of (x, z) that a straight track can reach without
 * crossing a building, water or rock; -1 when there is none. Tracks join the paved roads, never each other, so
 * they do not wander off in chains.
 */
function nearestPaved(world: World, x: number, z: number, reachM: number): number {
  const road = world.nav.road;
  const r = Math.ceil(reachM / ROADS.cellM);
  const cx = Math.floor((x + (NAV_CELLS_PER_SIDE * ROADS.cellM) / 2) / ROADS.cellM);
  const cz = Math.floor((z + (NAV_CELLS_PER_SIDE * ROADS.cellM) / 2) / ROADS.cellM);
  candidates.length = 0;
  for (let dz = -r; dz <= r; dz++) {
    const row = cz + dz;
    if (row < 0 || row >= NAV_CELLS_PER_SIDE) continue;
    for (let dx = -r; dx <= r; dx++) {
      const col = cx + dx;
      if (col < 0 || col >= NAV_CELLS_PER_SIDE) continue;
      const c = row * NAV_CELLS_PER_SIDE + col;
      if (road[c] === ROAD_PAVED && hypot2(cellX(c) - x, cellZ(c) - z) <= reachM) candidates.push(c);
    }
  }
  candidates.sort((a, b) => hypot2(cellX(a) - x, cellZ(a) - z) - hypot2(cellX(b) - x, cellZ(b) - z));
  // The first few nearest only: a track that has to go round is no track.
  for (let k = 0; k < Math.min(candidates.length, 24); k++) {
    const c = candidates[k] as number;
    if (!trackBlocked(world, x, z, cellX(c), cellZ(c))) return c;
  }
  return -1;
}

/** How far a building off the grid looks for a road to join with its track. */
export const TRACK_REACH_M = 60;

/**
 * The track from an off-grid building's door to the nearest paved road, as [x0, z0, x1, z1]; null when none is
 * near, or when its door is on a road already (one track to a building, laid once).
 */
export function trackFor(world: World, b: Building): Leg | null {
  const x = doorOfX(b);
  const z = doorOfZ(b);
  if (isRoad(world.nav, x, z)) return null;
  const c = nearestPaved(world, x, z, TRACK_REACH_M);
  if (c < 0) return null;
  return [x, z, cellX(c), cellZ(c)];
}

const trackScratch: number[] = [];

/** Cells of a track still to tread (0 once it is there). A track is free: trodden, not paved. */
export function trackCells(world: World, track: Leg): number {
  return roadCells(world.nav, track[0], track[1], track[2], track[3], trackScratch, ROAD_TRACK);
}

/** Treads a track (it costs nothing); false where an end lies too near an enemy's keep. */
export function layTrack(world: World, side: Side, track: Leg): boolean {
  if (!mayLayRoadAt(side, track[0], track[1]) || !mayLayRoadAt(side, track[2], track[3])) return false;
  trackCells(world, track);
  layRoad(world.nav, trackScratch, ROAD_TRACK);
  return true;
}

const flood: number[] = [];

/**
 * Takes up the tracks a building has since been put across: every track cell no longer joined (through roads)
 * to a paved one goes back to grass, so its farm gets a new track rather than keeping a stub that leads nowhere.
 * The same roads give the same result, whenever it runs.
 */
export function pruneTracks(world: World): void {
  const nav = world.nav;
  const road = nav.road;
  const N = NAV_CELLS_PER_SIDE;
  const seen = new Uint8Array(road.length);
  flood.length = 0;
  let tracks = 0;
  for (let c = 0; c < road.length; c++) {
    if (road[c] === ROAD_PAVED) {
      seen[c] = 1;
      flood.push(c);
    } else if (road[c] === ROAD_TRACK) tracks++;
  }
  if (tracks > 0) {
    while (flood.length > 0) {
      const c = flood.pop() as number;
      const cx = c % N;
      const cz = (c / N) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
          const n = nz * N + nx;
          if (seen[n] === 1 || road[n] !== ROAD_TRACK) continue;
          seen[n] = 1;
          flood.push(n);
        }
      }
    }
    let cut = 0;
    for (let c = 0; c < road.length; c++) {
      if (road[c] === ROAD_TRACK && seen[c] === 0) {
        road[c] = ROAD_NONE;
        cut++;
      }
    }
    if (cut > 0) nav.version += 1;
  }
}

/** Seconds between two looks at the player's streets that wait for stone. */
export const WANTED_EVERY_S = 5;

/**
 * The streets the player's buildings on the grid wait for (placed without the stone for them): the first whose
 * street is not laid gets it once the town has its stone and `reserveStone` over. One a call; a building whose
 * street is in (or cannot be laid at all) waits no more.
 */
export function layWantedStreets(world: World, side: Side, reserveStone: number): void {
  const town = world.towns[side];
  for (const b of town.plots) {
    if (!b || !b.streetWanted) continue;
    if (streetLaid(world, side, b.x, b.z, b.yawRad)) {
      b.streetWanted = false;
      continue;
    }
    const legs = streetPlan(world, side, b.x, b.z, b.yawRad);
    if (!legs) {
      b.streetWanted = false;
      continue;
    }
    if (streetCost(world, legs) + reserveStone <= town.stock.stone) cmdBuildStreet(world, side, legs);
    return;
  }
}
