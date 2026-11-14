import { FIELDS, FORESTRY, GATHER, LEVEL_SPEED, PEOPLE, VINES } from '../config.ts';
import { type Building, isBuilt, noteMade, type Town } from './economy.ts';
import { doorX, doorZ, type Person, walkTo, workRateOf } from './people.ts';
import { NOWHERE } from './types.ts';
import type { World } from './world.ts';
import { hypot2 } from '../core/hypot.ts';
import { claimNearestTree, fellTree, plantTree, TREES } from './trees.ts';

// What workers and builders do. Most trades are worked at the bench: the
// worker stands in his building and the economy's clock runs while he is
// there. Three go out to the land: the farmer breaks, sows and reaps the
// strips behind his farm, so a farm takes up more ground as it grows; the
// woodcutter walks to the nearest grown tree, fells it, plants a sapling by its
// stump (one for every tree) and carries the wood home; the fisher walks to the
// water's edge. Each comes back with a load.

/** Job steps of the trades that walk out and back. */
const AT_HOME = 0;
const GOING_OUT = 1;
const WORKING = 2;
const COMING_BACK = 3;
/** The woodcutter, back with his load, splitting it at the block in his yard. */
const SPLITTING = 4;
/** The woodcutter setting a sapling by the stump of the tree he has just felled. */
const PLANTING = 5;

/** A point in a building's own space (door towards +Z) on the map. */
function yardX(b: Building, lx: number, lz: number): number {
  return b.x + lx * Math.cos(b.yawRad) + lz * Math.sin(b.yawRad);
}

function yardZ(b: Building, lx: number, lz: number): number {
  return b.z - lx * Math.sin(b.yawRad) + lz * Math.cos(b.yawRad);
}

function paceOf(town: Town, b: Building, p: Person): number {
  return (LEVEL_SPEED[b.level - 1] as number) * workRateOf(town, p) * town.productionFactor;
}

/**
 * The farmer and the vintner. A farm's strips go wild → bare → growing → ripe → bare: broken once, then
 * sown and reaped every season. A vineyard's go wild → growing → ripe → growing: planted once, then only
 * picked, the vines bearing again by themselves.
 */
function stepFarmer(world: World, town: Town, b: Building, p: Person, plot: number, dtSeconds: number): void {
  const vines = b.kind === 'vineyard';
  const crop = vines ? 'grapes' : 'grain';
  if (p.phase === AT_HOME) {
    // As many strips as its level works, and no more than the land behind it gave.
    const worked = Math.min(FIELDS.stripsPerLevel[b.level - 1] as number, b.strips.length);
    // Reap what is ripe, then sow bare land, then break new ground.
    let pick = -1;
    for (const want of ['ripe', 'bare', 'wild'] as const) {
      if (want === 'ripe' && b.out[crop] >= PEOPLE.outputCap) continue;
      for (let i = 0; i < worked && pick < 0; i++) if ((b.strips[i] as Building['strips'][number]).state === want) pick = i;
      if (pick >= 0) break;
    }
    if (pick < 0) {
      // Everything is sown and growing: wait at the farm.
      p.act = walkTo(world, p, doorX(town, plot), doorZ(town, plot), dtSeconds) ? 'stand' : 'walk';
      return;
    }
    p.strip = pick;
    p.phase = GOING_OUT;
  }
  const strip = b.strips[p.strip] as Building['strips'][number];
  if (p.phase === GOING_OUT) {
    p.act = 'walk';
    if (!walkTo(world, p, strip.x, strip.z, dtSeconds)) return;
    if (vines) p.timerS = strip.state === 'ripe' ? VINES.harvestSeconds : VINES.plantSeconds;
    else p.timerS = strip.state === 'ripe' ? FIELDS.harvestSeconds : strip.state === 'bare' ? FIELDS.sowSeconds : FIELDS.establishSeconds;
    p.phase = WORKING;
    return;
  }
  if (p.phase === WORKING) {
    p.act = 'work';
    p.timerS -= dtSeconds * paceOf(town, b, p);
    if (p.timerS > 0) return;
    if (strip.state === 'ripe') {
      // The vines stay and start on next year's grapes; a field lies bare until it is sown again.
      strip.state = vines ? 'growing' : 'bare';
      strip.growth = 0;
      p.load = crop;
      p.phase = COMING_BACK;
    } else if (vines) {
      strip.state = 'growing';
      strip.growth = 0;
      p.phase = AT_HOME;
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
  // Coming back with the sheaves (or the baskets of grapes).
  p.act = 'walk';
  if (!walkTo(world, p, doorX(town, plot), doorZ(town, plot), dtSeconds)) return;
  b.out[crop] += vines ? VINES.grapesPerHarvest : FIELDS.grainPerHarvest;
  noteMade(town, crop, vines ? VINES.grapesPerHarvest : FIELDS.grainPerHarvest);
  p.load = null;
  p.phase = AT_HOME;
}

function stepGatherer(world: World, town: Town, b: Building, p: Person, plot: number, dtSeconds: number): void {
  const trade = b.kind === 'woodcutter' ? GATHER.woodcutter : GATHER.fisher;
  const good = b.kind === 'woodcutter' ? 'wood' : 'fish';
  if (p.phase === AT_HOME) {
    if (!walkTo(world, p, doorX(town, plot), doorZ(town, plot), dtSeconds)) {
      p.act = 'walk';
      return;
    }
    p.act = 'stand';
    // The yard is full: no point fetching more. (A load that will not quite fit is still fetched: by the
    // time it is felled and split the carriers have usually taken the last one away.)
    if (b.out[good] >= PEOPLE.outputCap) return;
    if (b.kind === 'woodcutter') {
      // The nearest grown tree no one else is after; none left in reach, and he waits for the saplings.
      p.strip = claimNearestTree(world.stand, b.x, b.z, FORESTRY.reachM, world.timeS);
      if (p.strip < 0) return;
    }
    p.phase = GOING_OUT;
    return;
  }
  if (p.phase === GOING_OUT) {
    p.act = 'walk';
    if (b.kind === 'woodcutter' && p.strip >= 0) {
      // To the near side of his tree.
      const tx = TREES.x[p.strip] as number;
      const tz = TREES.z[p.strip] as number;
      const d = Math.max(0.01, hypot2(b.x - tx, b.z - tz));
      if (!walkTo(world, p, tx + ((b.x - tx) / d) * 1.3, tz + ((b.z - tz) / d) * 1.3, dtSeconds)) return;
      p.headingRad = Math.atan2(tx - p.x, tz - p.z);
      p.timerS = trade.seconds;
      p.phase = WORKING;
      return;
    }
    if (!walkTo(world, p, b.spotX, b.spotZ, dtSeconds)) return;
    p.timerS = trade.seconds;
    p.phase = WORKING;
    return;
  }
  if (p.phase === WORKING) {
    p.act = 'work';
    p.timerS -= dtSeconds * paceOf(town, b, p);
    if (p.timerS > 0) return;
    if (b.kind === 'woodcutter' && p.strip >= 0) {
      fellTree(world.stand, p.strip, world.timeS);
      p.timerS = FORESTRY.plantSeconds;
      p.phase = PLANTING;
      return;
    }
    p.load = good;
    p.phase = COMING_BACK;
    return;
  }
  if (p.phase === PLANTING) {
    // One sapling for every tree: set by the stump before the wood goes home.
    p.act = 'work';
    p.timerS -= dtSeconds * paceOf(town, b, p);
    if (p.timerS > 0) return;
    plantTree(world.stand, p.strip, world.timeS);
    p.strip = -1;
    p.load = good;
    p.phase = COMING_BACK;
    return;
  }
  if (p.phase === SPLITTING) {
    // Logs to billets at the chopping block: seen from the street, the axe going up and down.
    const block = GATHER.woodcutter;
    if (!walkTo(world, p, yardX(b, block.blockX, block.blockZ), yardZ(b, block.blockX, block.blockZ + 0.9), dtSeconds)) {
      p.act = 'walk';
      return;
    }
    p.act = 'work';
    p.headingRad = b.yawRad + Math.PI;
    p.timerS -= dtSeconds * paceOf(town, b, p);
    if (p.timerS > 0) return;
    b.out[good] += trade.amount;
    noteMade(town, good, trade.amount);
    p.load = null;
    p.phase = AT_HOME;
    return;
  }
  p.act = 'walk';
  if (b.kind === 'woodcutter') {
    // Back from the trees: the load goes to the block first.
    if (!walkTo(world, p, yardX(b, GATHER.woodcutter.blockX, GATHER.woodcutter.blockZ + 0.9), yardZ(b, GATHER.woodcutter.blockX, GATHER.woodcutter.blockZ + 0.9), dtSeconds)) return;
    p.timerS = GATHER.woodcutter.splitSeconds;
    p.phase = SPLITTING;
    return;
  }
  if (!walkTo(world, p, doorX(town, plot), doorZ(town, plot), dtSeconds)) return;
  b.out[good] += trade.amount;
  noteMade(town, good, trade.amount);
  p.load = null;
  p.phase = AT_HOME;
}

export function stepWorker(world: World, town: Town, p: Person, dtSeconds: number): void {
  const plot = p.work;
  const b = plot >= 0 ? town.plots[plot] : null;
  if (!b) return;
  if (!isBuilt(b)) {
    // His building is being upgraded: he waits outside.
    p.act = walkTo(world, p, doorX(town, plot), doorZ(town, plot), dtSeconds) ? 'stand' : 'walk';
    return;
  }
  if (b.kind === 'farm' || b.kind === 'vineyard') {
    b.workRate += workRateOf(town, p);
    stepFarmer(world, town, b, p, plot, dtSeconds);
    return;
  }
  if (b.kind === 'woodcutter' || b.kind === 'fisher') {
    b.workRate += workRateOf(town, p);
    stepGatherer(world, town, b, p, plot, dtSeconds);
    return;
  }
  if (!walkTo(world, p, doorX(town, plot), doorZ(town, plot), dtSeconds)) {
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
      const score = hypot2(site.x - p.x, site.z - p.z) + (canBuildNow(site) ? 0 : 500);
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
  if (!walkTo(world, p, doorX(town, p.work), doorZ(town, p.work), dtSeconds)) {
    p.act = 'walk';
    return;
  }
  b.buildersPresent += 1;
  p.act = canBuildNow(b) ? 'build' : 'stand';
}
