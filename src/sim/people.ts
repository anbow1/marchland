import { PEOPLE, TOWN } from '../config.ts';
import { type Building, housingCapacity, isBuilt, type Town } from './economy.ts';
import { cancelErrand, stepCarrier } from './errands.ts';
import { facingToEnemy, isWater, lakeX, lakeZ, plotX, plotZ, townX, townZ } from './terrain.ts';
import { stepBuilder, stepWorker } from './trades.ts';
import { type ResourceId, type Side } from './types.ts';
import type { World } from './world.ts';

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

/** "The keep" where a plot index is expected, and "nowhere". */
export const KEEP = -1;
export const NOWHERE = -2;

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
}

/** Where people come and go at the keep: before its gate, towards the enemy. */
export function doorX(side: Side, plot: number): number {
  if (plot === KEEP) return townX(side) + Math.sin(facingToEnemy(side)) * (TOWN.keepRadiusM + 2.5);
  const px = plotX(side, plot);
  const d = Math.hypot(townX(side) - px, townZ(side) - plotZ(side, plot));
  return px + ((townX(side) - px) / d) * (TOWN.buildingRadiusM + 0.8);
}

export function doorZ(side: Side, plot: number): number {
  if (plot === KEEP) return townZ(side) + Math.cos(facingToEnemy(side)) * (TOWN.keepRadiusM + 2.5);
  const pz = plotZ(side, plot);
  const d = Math.hypot(townX(side) - plotX(side, plot), townZ(side) - pz);
  return pz + ((townZ(side) - pz) / d) * (TOWN.buildingRadiusM + 0.8);
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
  };
  world.people.push(p);
  return p;
}

/** Walks a person towards a point; true once he is there. Lakes are walked round. */
export function walkTo(p: Person, tx: number, tz: number, dtSeconds: number, speedMs: number = PEOPLE.walkSpeedMs): boolean {
  const dx = tx - p.x;
  const dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  if (d <= PEOPLE.arriveM) {
    p.speedMs = 0;
    return true;
  }
  const step = Math.min(d, speedMs * dtSeconds);
  p.x += (dx / d) * step;
  p.z += (dz / d) * step;
  p.headingRad = Math.atan2(dx, dz);
  p.strideM += step;
  p.speedMs = speedMs;
  if (isWater(p.x, p.z)) {
    // Back to the bank: the step's inward part is lost, the rest carries him along the shore.
    const lx = lakeX(p.side);
    const lz = lakeZ(p.side);
    const r = Math.hypot(p.x - lx, p.z - lz) || 1;
    p.x = lx + ((p.x - lx) / r) * TOWN.lakeRadiusM * 0.94;
    p.z = lz + ((p.z - lz) / r) * TOWN.lakeRadiusM * 0.94;
  }
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
  return b.kind !== 'house' && b.kind !== 'barracks' && isBuilt(b) && !b.paused;
}

const staffed = new Uint8Array(TOWN.plotCount);

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
  // Workers first, in the order the plots are numbered: the nearest free person takes the job.
  for (let plot = 0; plot < town.plots.length; plot++) {
    const b = town.plots[plot];
    if (!b || !needsWorker(b) || (staffed[plot] as number) > 0) continue;
    let best: Person | null = null;
    let bestD2 = Number.POSITIVE_INFINITY;
    for (const p of world.people) {
      if (!p.alive || p.side !== side || (p.role !== 'carrier' && p.role !== 'builder')) continue;
      // Someone with empty hands rather than a man in the middle of a delivery.
      const d2 = (p.x - plotX(side, plot)) ** 2 + (p.z - plotZ(side, plot)) ** 2 + (p.holding ? 1e6 : 0);
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
  let sites = 0;
  for (const b of town.plots) if (b && !isBuilt(b)) sites++;
  const wanted = sites === 0 ? 0 : Math.min(free, sites * PEOPLE.maxBuildersPerSite, Math.max(1, Math.round(free * PEOPLE.builderShare)));
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

function stepRecruit(town: Town, p: Person, dtSeconds: number): void {
  // The nearest finished barracks.
  let plot = NOWHERE;
  let bestD2 = Number.POSITIVE_INFINITY;
  for (let i = 0; i < town.plots.length; i++) {
    const b = town.plots[i];
    if (!b || b.kind !== 'barracks' || (b.level === 1 && !isBuilt(b))) continue;
    const d2 = (p.x - plotX(p.side, i)) ** 2 + (p.z - plotZ(p.side, i)) ** 2;
    if (d2 < bestD2) {
      plot = i;
      bestD2 = d2;
    }
  }
  const waiting = town.recruitQueue.find((o) => o.arrived < o.needPeople);
  if (plot === NOWHERE || !waiting) {
    // The barracks fell, or the order is gone: he goes back to his work.
    release(p);
    return;
  }
  p.act = 'walk';
  if (!walkTo(p, doorX(p.side, plot), doorZ(p.side, plot), dtSeconds)) return;
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
  if (living + town.underArms >= housingCapacity(town)) return;
  const side = town.side;
  if (!town.starving && town.keepResidents < PEOPLE.keepResidents) {
    town.keepGrowS += dtSeconds;
    if (town.keepGrowS >= PEOPLE.growSeconds) {
      town.keepGrowS = 0;
      spawnPerson(world, side, doorX(side, KEEP), doorZ(side, KEEP), KEEP);
      return;
    }
  }
  for (let plot = 0; plot < town.plots.length; plot++) {
    const b = town.plots[plot];
    if (!b || b.kind !== 'house' || !isBuilt(b) || b.starving || b.residents >= (PEOPLE.houseResidents[b.level - 1] as number)) continue;
    b.growS += dtSeconds;
    if (b.growS < PEOPLE.growSeconds) continue;
    b.growS = 0;
    spawnPerson(world, side, doorX(side, plot), doorZ(side, plot), plot);
    return;
  }
}

export function stepPeople(world: World, dtSeconds: number): void {
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
  const living: [number, number] = [0, 0];
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
      walkTo(p, townX(p.side), townZ(p.side), dtSeconds, PEOPLE.walkSpeedMs * 2);
      continue;
    }
    if (p.role === 'worker') stepWorker(world, town, p, dtSeconds);
    else if (p.role === 'builder') stepBuilder(world, town, p, dtSeconds);
    else if (p.role === 'recruit') stepRecruit(town, p, dtSeconds);
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
