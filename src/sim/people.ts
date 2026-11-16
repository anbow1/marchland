import { PEOPLE, ROADS, TOWN, UNITS, WINE, WELL } from '../config.ts';
import { type Building, housingCapacity, isBuilt, type Town } from './economy.ts';
import { cancelErrand, stepCarrier } from './errands.ts';
import { findPath, speedFactorAt } from './nav.ts';
import { doorOfX, doorOfZ } from './placement.ts';
import { facingToEnemy, townX, townZ } from './terrain.ts';
import { stepBuilder, stepWorker } from './trades.ts';
import { KEEP, NOWHERE, type ResourceId, type Side, WORKLESS } from './types.ts';
import type { World } from './world.ts';
import { hypot2 } from '../core/hypot.ts';

// The townspeople. Each has one job at a time: a worker belongs to a building
// and makes it work by being there; a carrier takes goods where they are
// wanted; a builder raises what is being built; a recruit is on his way to the
// barracks to become a soldier. People live in a house (or the keep) and eat
// there. When an enemy regiment comes near they drop everything and run for
// the keep. Who does what is decided here, once a second; how each job is done
// is in errands.ts (carriers) and trades.ts (workers and builders).

export type Role = 'carrier' | 'worker' | 'builder' | 'recruit';
/** What a person is seen doing, for the view. */
export type Act = 'stand' | 'walk' | 'work' | 'build' | 'flee';
export type Errand = 'none' | 'site' | 'input' | 'food' | 'clear';

export { KEEP, NOWHERE };

export interface Person {
  side: Side;
  alive: boolean;
  x: number;
  z: number;
  headingRad: number;
  /** Distance walked, for the step animation, and speed now. */
  strideM: number;
  speedMs: number;
  role: Role;
  /** Where he lives (a house's plot, or KEEP) and works (a plot, or NOWHERE). */
  home: number;
  work: number;
  act: Act;
  /** Step of his current job, a clock for it, and (farmers) the strip he is on. */
  phase: number;
  timerS: number;
  strip: number;
  /** A carrier's errand: what, how many, from where to where, and whether the load is on his back yet. */
  errand: Errand;
  good: ResourceId;
  amount: number;
  src: number;
  dst: number;
  dstRef: Building | null;
  holding: boolean;
  /** The good he is seen carrying, if any. */
  load: ResourceId | null;
  fleeing: boolean;
  calmS: number;
  /** Clocks to his next look round for enemies and his next think about what to do. */
  lookS: number;
  thinkS: number;
  /** The way he is walking: way points as x, z pairs, how many, which is next, where it leads, and the map's version it was found on. */
  path: Float32Array;
  pathLen: number;
  pathAt: number;
  goalX: number;
  goalZ: number;
  navVersion: number;
}

/** Where people come and go: before the keep's gate (towards the enemy), or outside a building's door. A building that is gone sends them to the keep. */
export function doorX(town: Town, plot: number): number {
  const b = plot >= 0 ? town.plots[plot] : null;
  if (b) return doorOfX(b);
  return townX(town.side) + Math.sin(facingToEnemy(town.side)) * (TOWN.keepRadiusM + 2.5);
}

export function doorZ(town: Town, plot: number): number {
  const b = plot >= 0 ? town.plots[plot] : null;
  if (b) return doorOfZ(b);
  return townZ(town.side) + Math.cos(facingToEnemy(town.side)) * (TOWN.keepRadiusM + 2.5);
}

export function spawnPerson(world: World, side: Side, x: number, z: number, home: number): Person {
  const p: Person = {
    side,
    alive: true,
    x,
    z,
    headingRad: 0,
    strideM: world.rng.range(0, 2),
    speedMs: 0,
    role: 'carrier',
    home,
    work: NOWHERE,
    act: 'stand',
    phase: 0,
    timerS: 0,
    strip: 0,
    errand: 'none',
    good: 'wood',
    amount: 0,
    src: NOWHERE,
    dst: NOWHERE,
    dstRef: null,
    holding: false,
    load: null,
    fleeing: false,
    calmS: 0,
    lookS: world.rng.range(0, 0.5),
    thinkS: world.rng.range(0, 0.7),
    path: new Float32Array(ROADS.maxWaypoints * 2),
    pathLen: 0,
    pathAt: 0,
    goalX: x,
    goalZ: z,
    navVersion: -1,
  };
  world.people.push(p);
  return p;
}

/**
 * Walks a person towards a point along the quickest way (roads where there are any); true once he is
 * there. `pace` multiplies his walking speed (2 when running from danger).
 */
export function walkTo(world: World, p: Person, tx: number, tz: number, dtSeconds: number, pace = 1): boolean {
  if (hypot2(tx - p.x, tz - p.z) <= PEOPLE.arriveM) {
    p.speedMs = 0;
    p.pathLen = 0;
    return true;
  }
  const nav = world.nav;
  if (p.pathLen === 0 || Math.abs(p.goalX - tx) > 0.5 || Math.abs(p.goalZ - tz) > 0.5 || p.navVersion !== nav.version) {
    // Only so many cells are searched in a step: whoever comes after that stands a moment.
    if (nav.budget <= 0) return false;
    p.pathLen = findPath(nav, p.x, p.z, tx, tz, p.path);
    if (p.pathLen === 0) {
      // Walled in (a building went up round him): straight there rather than stuck for ever.
      p.path[0] = tx;
      p.path[1] = tz;
      p.pathLen = 1;
    }
    p.pathAt = 0;
    p.goalX = tx;
    p.goalZ = tz;
    p.navVersion = nav.version;
  }
  const speedMs = PEOPLE.walkSpeedMs * pace * speedFactorAt(nav, p.x, p.z);
  let left = speedMs * dtSeconds;
  while (left > 0 && p.pathAt < p.pathLen) {
    const wx = p.path[p.pathAt * 2] as number;
    const wz = p.path[p.pathAt * 2 + 1] as number;
    const dx = wx - p.x;
    const dz = wz - p.z;
    const d = hypot2(dx, dz);
    if (d <= left) {
      p.x = wx;
      p.z = wz;
      left -= d;
      p.pathAt += 1;
      continue;
    }
    p.x += (dx / d) * left;
    p.z += (dz / d) * left;
    p.headingRad = Math.atan2(dx, dz);
    left = 0;
  }
  p.strideM += speedMs * dtSeconds;
  p.speedMs = speedMs;
  return false;
}

/** 1 for a fed person, half that for one whose larder is empty. */
export function workRateOf(town: Town, p: Person): number {
  const hungry = p.home === KEEP ? town.starving : (town.plots[p.home]?.starving ?? false);
  return hungry ? 0.5 : 1;
}

/** Sends a worker or builder back to the pool of carriers. */
function release(p: Person): void {
  p.role = 'carrier';
  p.work = NOWHERE;
  p.phase = 0;
  p.load = null;
}

/** True for buildings that need someone working in them. */
function needsWorker(b: Building): boolean {
  return !WORKLESS.has(b.kind) && isBuilt(b) && !b.paused;
}

const staffed = new Uint8Array(TOWN.maxBuildings);

/** Once a second: every working building gets a worker, some of the rest build while anything is being built, the others carry. */
function assignRoles(world: World, town: Town): void {
  const side = town.side;
  staffed.fill(0);
  let free = 0;
  let builders = 0;
  for (const p of world.people) {
    if (!p.alive || p.side !== side) continue;
    if (p.role === 'worker') {
      const b = p.work >= 0 ? town.plots[p.work] : null;
      // His building is gone, switched off, or already has a man: back to the pool.
      if (!b || !needsWorker(b) || (staffed[p.work] as number) > 0) release(p);
      else staffed[p.work] = 1;
    }
    if (p.role === 'builder') builders++;
    if (p.role === 'carrier' || p.role === 'builder') free++;
  }
  let sites = 0;
  for (const b of town.plots) if (b && !isBuilt(b)) sites++;
  // The last carriers stay carriers (without them nothing reaches the workshops), and while anything is
  // being built one more stays free to build it: houses must go up, or the town never grows.
  const keepFree = PEOPLE.minCarriers + (sites > 0 ? 1 : 0);
  // Workers first, in the order the plots are numbered: the nearest free person takes the job.
  for (let plot = 0; plot < town.plots.length; plot++) {
    const b = town.plots[plot];
    if (!b || !needsWorker(b) || (staffed[plot] as number) > 0) continue;
    if (free <= keepFree) break;
    let best: Person | null = null;
    let bestD2 = Number.POSITIVE_INFINITY;
    for (const p of world.people) {
      if (!p.alive || p.side !== side || (p.role !== 'carrier' && p.role !== 'builder')) continue;
      // Someone with empty hands rather than a man in the middle of a delivery.
      const d2 = (p.x - b.x) ** 2 + (p.z - b.z) ** 2 + (p.holding ? 1e6 : 0);
      if (d2 < bestD2) {
        best = p;
        bestD2 = d2;
      }
    }
    if (!best) break;
    if (best.role === 'builder') builders--;
    cancelErrand(town, best);
    best.role = 'worker';
    best.work = plot;
    best.phase = 0;
    free--;
  }
  const spare = Math.max(0, free - PEOPLE.minCarriers);
  const wanted = sites === 0 ? 0 : Math.min(spare, sites * PEOPLE.maxBuildersPerSite, Math.max(1, Math.round(free * PEOPLE.builderShare)));
  for (const p of world.people) {
    if (builders === wanted) break;
    if (!p.alive || p.side !== side) continue;
    if (builders > wanted && p.role === 'builder') {
      release(p);
      builders--;
    } else if (builders < wanted && p.role === 'carrier' && p.errand === 'none') {
      p.role = 'builder';
      p.work = NOWHERE;
      builders++;
    }
  }
}

/** True when an enemy regiment in formation is within running distance of a point. */
function enemyNear(world: World, side: Side, x: number, z: number): boolean {
  for (const r of world.regiments) {
    if (r.side === side || r.aliveMen === 0 || r.state !== 'formed') continue;
    const reach = PEOPLE.fleeRadiusM + r.radiusM;
    if ((r.centreX - x) ** 2 + (r.centreZ - z) ** 2 < reach * reach) return true;
  }
  return false;
}

function stepRecruit(world: World, town: Town, p: Person, dtSeconds: number): void {
  const waiting = town.recruitQueue.find((o) => o.arrived < o.needPeople);
  // The nearest finished barracks (or foundry, for a gun's crew).
  const at = waiting && UNITS[waiting.kind].trainedAt === 'foundry' ? 'foundry' : 'barracks';
  let plot = NOWHERE;
  let bestD2 = Number.POSITIVE_INFINITY;
  for (let i = 0; i < town.plots.length; i++) {
    const b = town.plots[i];
    if (!b || b.kind !== at || (b.level === 1 && !isBuilt(b))) continue;
    const d2 = (p.x - b.x) ** 2 + (p.z - b.z) ** 2;
    if (d2 < bestD2) {
      plot = i;
      bestD2 = d2;
    }
  }
  // Militia is armed at the keep's gate when there is no barracks to go to.
  if (plot === NOWHERE && waiting && UNITS[waiting.kind].barracksLevel === 0) plot = KEEP;
  if (plot === NOWHERE || !waiting) {
    // The barracks fell, or the order is gone: he goes back to his work.
    release(p);
    return;
  }
  p.act = 'walk';
  if (!walkTo(world, p, doorX(town, plot), doorZ(town, plot), dtSeconds)) return;
  p.alive = false;
  town.underArms += 1;
  waiting.arrived += 1;
}

/** People of a side free to be called up: carriers and builders, not the workers. */
export function freePeople(world: World, side: Side): number {
  let n = 0;
  for (const p of world.people) if (p.alive && p.side === side && (p.role === 'carrier' || p.role === 'builder')) n++;
  return n;
}

/** Calls `count` free people to the barracks, the nearest to the keep first. */
export function callUp(world: World, side: Side, count: number): void {
  const town = world.towns[side];
  const kx = townX(side);
  const kz = townZ(side);
  for (let n = 0; n < count; n++) {
    let best: Person | null = null;
    let bestD2 = Number.POSITIVE_INFINITY;
    for (const p of world.people) {
      if (!p.alive || p.side !== side || (p.role !== 'carrier' && p.role !== 'builder')) continue;
      const d2 = (p.x - kx) ** 2 + (p.z - kz) ** 2;
      if (d2 < bestD2) {
        best = p;
        bestD2 = d2;
      }
    }
    if (!best) throw new Error(`side ${side} has no free people left to call up; ${count - n} of ${count} are missing`);
    cancelErrand(town, best);
    best.role = 'recruit';
    best.work = NOWHERE;
    best.load = null;
  }
}

/** Soldiers of a disbanded regiment go back to being townspeople. */
export function returnHome(world: World, side: Side, count: number, x: number, z: number): void {
  const town = world.towns[side];
  for (let i = 0; i < count; i++) spawnPerson(world, side, x + world.rng.range(-3, 3), z + world.rng.range(-3, 3), KEEP);
  town.underArms = Math.max(0, town.underArms - count);
}

/** Newcomers: a fed house (or the keep) with room takes one in every so often, while the town has room at all. */
function grow(world: World, town: Town, living: number, dtSeconds: number): void {
  // Men under arms live in camp, not in the houses: the town fills up again behind them.
  if (living >= housingCapacity(town)) return;
  const side = town.side;
  if (!town.starving && town.keepResidents < PEOPLE.keepResidents) {
    town.keepGrowS += dtSeconds;
    if (town.keepGrowS >= PEOPLE.growSeconds) {
      town.keepGrowS = 0;
      spawnPerson(world, side, doorX(town, KEEP), doorZ(town, KEEP), KEEP);
      return;
    }
  }
  for (let plot = 0; plot < town.plots.length; plot++) {
    const b = town.plots[plot];
    if (!b || b.kind !== 'house' || !isBuilt(b) || b.starving || b.residents >= (PEOPLE.houseResidents[b.level - 1] as number)) continue;
    b.growS += dtSeconds;
    const byWell = town.plots.some((w) => w !== null && w.kind === 'well' && w.constructionLeftS <= 0 && (w.x - b.x) ** 2 + (w.z - b.z) ** 2 <= WELL.reachM * WELL.reachM);
    if (b.growS < PEOPLE.growSeconds * (b.hasWine ? WINE.growFactor : 1) * (byWell ? WELL.growFactor : 1)) continue;
    b.growS = 0;
    spawnPerson(world, side, doorX(town, plot), doorZ(town, plot), plot);
    return;
  }
}

const livingScratch: [number, number] = [0, 0];

export function stepPeople(world: World, dtSeconds: number): void {
  world.nav.budget = ROADS.cellsPerStep;
  for (const town of world.towns) {
    for (const b of town.plots) {
      if (!b) continue;
      b.workRate = 0;
      b.buildersPresent = 0;
      b.residents = 0;
    }
    town.keepResidents = 0;
  }
  world.rolesS -= dtSeconds;
  if (world.rolesS <= 0) {
    world.rolesS = 1;
    for (const town of world.towns) assignRoles(world, town);
  }
  // Reused: a new pair every step was garbage.
  const living = livingScratch;
  living[0] = 0;
  living[1] = 0;
  for (const p of world.people) {
    if (!p.alive) continue;
    const town = world.towns[p.side];
    living[p.side] += 1;
    // A house that is gone: its people move into the keep.
    if (p.home !== KEEP && town.plots[p.home]?.kind !== 'house') p.home = KEEP;
    if (p.home === KEEP) town.keepResidents += 1;
    else (town.plots[p.home] as Building).residents += 1;

    p.lookS -= dtSeconds;
    if (p.lookS <= 0) {
      p.lookS = 0.5;
      if (enemyNear(world, p.side, p.x, p.z)) {
        p.fleeing = true;
        p.calmS = PEOPLE.calmSeconds;
      } else if (p.fleeing) {
        p.calmS -= 0.5;
        if (p.calmS <= 0) p.fleeing = false;
      }
    }
    p.speedMs = 0;
    if (p.fleeing) {
      p.act = 'flee';
      walkTo(world, p, doorX(town, KEEP), doorZ(town, KEEP), dtSeconds, 2);
      continue;
    }
    if (p.role === 'worker') stepWorker(world, town, p, dtSeconds);
    else if (p.role === 'builder') stepBuilder(world, town, p, dtSeconds);
    else if (p.role === 'recruit') stepRecruit(world, town, p, dtSeconds);
    else stepCarrier(world, town, p, dtSeconds);
  }
  for (const town of world.towns) grow(world, town, living[town.side], dtSeconds);
  // Drop those who left (recruits who reached the barracks): the last takes the empty place.
  for (let i = world.people.length - 1; i >= 0; i--) {
    if ((world.people[i] as Person).alive) continue;
    world.people[i] = world.people[world.people.length - 1] as Person;
    world.people.pop();
  }
}
