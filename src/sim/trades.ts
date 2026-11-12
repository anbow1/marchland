import { FIELDS, GATHER, LEVEL_SPEED, PEOPLE } from '../config.ts';
import { type Building, isBuilt, type Town } from './economy.ts';
import { doorX, doorZ, NOWHERE, type Person, walkTo, workRateOf } from './people.ts';
import { spotX, spotZ, stripX, stripZ } from './terrain.ts';
import type { World } from './world.ts';

// What workers and builders do. Most trades are worked at the bench: the
// worker stands in his building and the economy's clock runs while he is
// there. Three go out to the land: the farmer breaks, sows and reaps the
// strips behind his farm, so a farm takes up more ground as it grows; the
// woodcutter walks into the trees and the fisher to the water's edge, and each
// comes back with a load.

/** Job steps of the trades that walk out and back. */
const AT_HOME = 0;
const GOING_OUT = 1;
const WORKING = 2;
const COMING_BACK = 3;

function paceOf(town: Town, b: Building, p: Person): number {
  return (LEVEL_SPEED[b.level - 1] as number) * workRateOf(town, p) * town.productionFactor;
}

function stepFarmer(town: Town, b: Building, p: Person, plot: number, dtSeconds: number): void {
  const side = p.side;
  if (p.phase === AT_HOME) {
    const worked = FIELDS.stripsPerLevel[b.level - 1] as number;
    // Reap what is ripe, then sow bare land, then break new ground.
    let pick = -1;
    for (const want of ['ripe', 'bare', 'wild'] as const) {
      if (want === 'ripe' && b.out.grain >= PEOPLE.outputCap) continue;
      for (let i = 0; i < worked && pick < 0; i++) if ((b.strips[i] as Building['strips'][number]).state === want) pick = i;
      if (pick >= 0) break;
    }
    if (pick < 0) {
      // Everything is sown and growing: wait at the farm.
      p.act = walkTo(p, doorX(side, plot), doorZ(side, plot), dtSeconds) ? 'stand' : 'walk';
      return;
    }
    p.strip = pick;
    p.phase = GOING_OUT;
  }
  const strip = b.strips[p.strip] as Building['strips'][number];
  if (p.phase === GOING_OUT) {
    p.act = 'walk';
    if (!walkTo(p, stripX(side, plot, p.strip), stripZ(side, plot, p.strip), dtSeconds)) return;
    p.timerS = strip.state === 'ripe' ? FIELDS.harvestSeconds : strip.state === 'bare' ? FIELDS.sowSeconds : FIELDS.establishSeconds;
    p.phase = WORKING;
    return;
  }
  if (p.phase === WORKING) {
    p.act = 'work';
    p.timerS -= dtSeconds * paceOf(town, b, p);
    if (p.timerS > 0) return;
    if (strip.state === 'ripe') {
      strip.state = 'bare';
      strip.growth = 0;
      p.load = 'grain';
      p.phase = COMING_BACK;
    } else {
      if (strip.state === 'bare') {
        strip.state = 'growing';
        strip.growth = 0;
      } else if (strip.state === 'wild') {
        strip.state = 'bare';
      }
      p.phase = AT_HOME;
    }
    return;
  }
  // Coming back with the sheaves.
  p.act = 'walk';
  if (!walkTo(p, doorX(side, plot), doorZ(side, plot), dtSeconds)) return;
  b.out.grain += FIELDS.grainPerHarvest;
  p.load = null;
  p.phase = AT_HOME;
}

function stepGatherer(town: Town, b: Building, p: Person, plot: number, dtSeconds: number): void {
  const side = p.side;
  const trade = b.kind === 'woodcutter' ? GATHER.woodcutter : GATHER.fisher;
  const good = b.kind === 'woodcutter' ? 'wood' : 'fish';
  if (p.phase === AT_HOME) {
    if (!walkTo(p, doorX(side, plot), doorZ(side, plot), dtSeconds)) {
      p.act = 'walk';
      return;
    }
    p.act = 'stand';
    // The yard is full: no point fetching more.
    if (b.out[good] + trade.amount > PEOPLE.outputCap) return;
    p.phase = GOING_OUT;
    return;
  }
  if (p.phase === GOING_OUT) {
    p.act = 'walk';
    if (!walkTo(p, spotX(side, plot), spotZ(side, plot), dtSeconds)) return;
    p.timerS = trade.seconds;
    p.phase = WORKING;
    return;
  }
  if (p.phase === WORKING) {
    p.act = 'work';
    p.timerS -= dtSeconds * paceOf(town, b, p);
    if (p.timerS > 0) return;
    p.load = good;
    p.phase = COMING_BACK;
    return;
  }
  p.act = 'walk';
  if (!walkTo(p, doorX(side, plot), doorZ(side, plot), dtSeconds)) return;
  b.out[good] += trade.amount;
  p.load = null;
  p.phase = AT_HOME;
}

export function stepWorker(_world: World, town: Town, p: Person, dtSeconds: number): void {
  const plot = p.work;
  const b = plot >= 0 ? town.plots[plot] : null;
  if (!b) return;
  if (!isBuilt(b)) {
    // His building is being upgraded: he waits outside.
    p.act = walkTo(p, doorX(p.side, plot), doorZ(p.side, plot), dtSeconds) ? 'stand' : 'walk';
    return;
  }
  if (b.kind === 'farm') {
    b.workRate += workRateOf(town, p);
    stepFarmer(town, b, p, plot, dtSeconds);
    return;
  }
  if (b.kind === 'woodcutter' || b.kind === 'fisher') {
    b.workRate += workRateOf(town, p);
    stepGatherer(town, b, p, plot, dtSeconds);
    return;
  }
  if (!walkTo(p, doorX(p.side, plot), doorZ(p.side, plot), dtSeconds)) {
    p.act = 'walk';
    return;
  }
  b.workRate += workRateOf(town, p);
  p.act = b.cycleStarted ? 'work' : 'stand';
}

/** True when builders can make progress on a site now: there is work left that the materials on site allow. */
function canBuildNow(b: Building): boolean {
  const allowed = b.matTotal === 0 ? 1 : b.matDelivered / b.matTotal;
  return b.constructionLeftS > b.constructionTotalS * (1 - allowed) + 1e-6;
}

export function stepBuilder(world: World, town: Town, p: Person, dtSeconds: number): void {
  let b = p.work >= 0 ? town.plots[p.work] : null;
  if (!b || isBuilt(b)) {
    p.work = NOWHERE;
    p.thinkS -= dtSeconds;
    if (p.thinkS > 0) {
      p.act = 'stand';
      return;
    }
    p.thinkS = 0.7;
    // The nearest site that is short of hands; one with its materials on site before one still waiting for them.
    let bestScore = Number.POSITIVE_INFINITY;
    for (let plot = 0; plot < town.plots.length; plot++) {
      const site = town.plots[plot];
      if (!site || isBuilt(site)) continue;
      let hands = 0;
      for (const other of world.people) if (other.alive && other.side === p.side && other.role === 'builder' && other.work === plot) hands++;
      if (hands >= PEOPLE.maxBuildersPerSite) continue;
      const score = Math.hypot(doorX(p.side, plot) - p.x, doorZ(p.side, plot) - p.z) + (canBuildNow(site) ? 0 : 500);
      if (score < bestScore) {
        bestScore = score;
        p.work = plot;
      }
    }
    b = p.work >= 0 ? town.plots[p.work] : null;
    if (!b) {
      p.act = 'stand';
      return;
    }
  }
  if (!walkTo(p, doorX(p.side, p.work), doorZ(p.side, p.work), dtSeconds)) {
    p.act = 'walk';
    return;
  }
  b.buildersPresent += 1;
  p.act = canBuildNow(b) ? 'build' : 'stand';
}
