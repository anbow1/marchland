import { BUILDINGS, FOOD, PEOPLE, WINE } from '../config.ts';
import { type Building, isBuilt, outputFull, rationsIn, type Town } from './economy.ts';
import { doorX, doorZ, type Person, walkTo } from './people.ts';
import { KEEP, NOWHERE } from './types.ts';
import { type ResourceId, RESOURCE_IDS } from './types.ts';
import type { World } from './world.ts';

// What carriers do. A free carrier takes the most pressing errand near him:
// timber and stone to a building site, food to a house whose larder is low,
// inputs to a workshop, or goods piled in a yard back to the keep. The goods
// are taken off the source's books when the errand is given and put on the
// destination's when he arrives; in between they are on his back.

const FOODS: readonly ResourceId[] = ['bread', 'fish', 'sausage'];
const FOOD_RATIONS: Record<string, number> = { bread: FOOD.breadRations, fish: FOOD.fishRations, sausage: FOOD.sausageRations };

/** How pressing each kind of errand is; distance to the pick-up (in metres) is taken off. */
const URGENCY = { site: 4000, hungryHouse: 5000, food: 3000, wine: 2200, input: 2000, clear: 1000, clearScarce: 2600 } as const;
/** The keep is short of a good when it holds fewer than this: fetching it from the yards comes before feeding workshops. */
const SCARCE_BELOW = 12;

/** Gives a carrier's load back when his errand is called off: to the site's pile or the keep. */
export function cancelErrand(town: Town, p: Person): void {
  if (p.errand === 'none') return;
  const dst = p.dst >= 0 ? town.plots[p.dst] : null;
  const sameBuilding = dst !== null && dst === p.dstRef;
  if (p.errand === 'site' && sameBuilding && (p.good === 'wood' || p.good === 'stone')) dst.matWaiting[p.good] += p.amount;
  else town.stock[p.good] += p.amount;
  if ((p.errand === 'input' || p.errand === 'food') && sameBuilding) dst.incoming[p.good] -= p.amount;
  p.errand = 'none';
  p.holding = false;
  p.load = null;
}

/**
 * The place to fetch `good` from for a building at (toX, toZ): the yard or the keep that makes the
 * shortest walk for this carrier, there and on to the building. NOWHERE if nobody has any.
 */
function findSource(town: Town, p: Person, good: ResourceId, toX: number, toZ: number, notPlot: number): number {
  let best = NOWHERE;
  let bestM = Number.POSITIVE_INFINITY;
  if (town.stock[good] > 0) {
    const kx = doorX(town, KEEP);
    const kz = doorZ(town, KEEP);
    best = KEEP;
    bestM = Math.hypot(kx - p.x, kz - p.z) + Math.hypot(kx - toX, kz - toZ);
  }
  for (let plot = 0; plot < town.plots.length; plot++) {
    const b = town.plots[plot];
    if (!b || plot === notPlot || b.out[good] <= 0) continue;
    const m = Math.hypot(b.x - p.x, b.z - p.z) + Math.hypot(b.x - toX, b.z - toZ);
    if (m < bestM) {
      best = plot;
      bestM = m;
    }
  }
  return best;
}

interface Choice {
  score: number;
  errand: Person['errand'];
  good: ResourceId;
  amount: number;
  src: number;
  dst: number;
}

const choice: Choice = { score: 0, errand: 'none', good: 'wood', amount: 0, src: NOWHERE, dst: NOWHERE };

function offer(town: Town, p: Person, urgency: number, errand: Person['errand'], good: ResourceId, amount: number, src: number, dst: number): void {
  if (amount <= 0) return;
  const d = Math.hypot(doorX(town, src) - p.x, doorZ(town, src) - p.z);
  const score = urgency - d;
  if (score <= choice.score) return;
  choice.score = score;
  choice.errand = errand;
  choice.good = good;
  choice.amount = amount;
  choice.src = src;
  choice.dst = dst;
}

function available(town: Town, src: number, good: ResourceId): number {
  return src === KEEP ? town.stock[good] : (town.plots[src] as Building).out[good];
}

/** Looks for an errand; true (and the errand is his) when there is one. */
function findErrand(town: Town, p: Person): boolean {
  choice.score = Number.NEGATIVE_INFINITY;
  choice.errand = 'none';
  for (let plot = 0; plot < town.plots.length; plot++) {
    const b = town.plots[plot];
    if (!b) continue;
    if (!isBuilt(b)) {
      // Timber and stone for the builders: already paid for, waiting at the keep.
      for (const good of ['wood', 'stone'] as const) offer(town, p, URGENCY.site, 'site', good, Math.min(PEOPLE.carryCapacity, b.matWaiting[good]), KEEP, plot);
      continue;
    }
    if (b.kind === 'house') {
      // Wine, when there is any to spare: after bread, before workshops' inputs.
      const wineWanted = WINE.houseTarget - b.inp.wine - b.incoming.wine;
      if (wineWanted >= 1) {
        const src = findSource(town, p, 'wine', b.x, b.z, plot);
        if (src !== NOWHERE) offer(town, p, URGENCY.wine, 'food', 'wine', Math.min(PEOPLE.carryCapacity, wineWanted, available(town, src, 'wine')), src, plot);
      }
      let have = rationsIn(b.inp);
      for (const food of FOODS) have += b.incoming[food] * (FOOD_RATIONS[food] as number);
      if (have >= PEOPLE.houseFoodTarget) continue;
      for (const food of FOODS) {
        const src = findSource(town, p, food, b.x, b.z, plot);
        if (src === NOWHERE) continue;
        offer(town, p, have < 1 ? URGENCY.hungryHouse : URGENCY.food, 'food', food, Math.min(PEOPLE.carryCapacity, available(town, src, food)), src, plot);
        break;
      }
      continue;
    }
    const recipe = BUILDINGS[b.kind].recipe;
    // No more inputs for a workshop whose yard is full: it cannot use them.
    if (recipe && !b.paused && !outputFull(b)) {
      for (const good of RESOURCE_IDS) {
        if ((recipe.inputs[good] ?? 0) === 0) continue;
        const want = PEOPLE.inputTarget - b.inp[good] - b.incoming[good];
        if (want < 1) continue;
        const src = findSource(town, p, good, b.x, b.z, plot);
        if (src === NOWHERE) continue;
        // An empty input store is more pressing than a half-full one.
        offer(town, p, URGENCY.input + (b.inp[good] + b.incoming[good] === 0 ? 500 : 0), 'input', good, Math.min(PEOPLE.carryCapacity, want, available(town, src, good)), src, plot);
      }
    }
    // What has piled up in the yard goes to the keep.
    for (const good of RESOURCE_IDS) {
      if (b.out[good] < PEOPLE.clearOutputAt) continue;
      const urgency = town.stock[good] < SCARCE_BELOW ? URGENCY.clearScarce : URGENCY.clear;
      offer(town, p, urgency + b.out[good] * 20, 'clear', good, Math.min(PEOPLE.carryCapacity, b.out[good]), plot, KEEP);
    }
  }
  if (choice.errand === 'none') return false;
  // Off the source's books now, so two carriers do not go for the same sack.
  const dst = choice.dst >= 0 ? (town.plots[choice.dst] as Building) : null;
  if (choice.errand === 'site') (dst as Building).matWaiting[choice.good as 'wood' | 'stone'] -= choice.amount;
  else if (choice.src === KEEP) town.stock[choice.good] -= choice.amount;
  else (town.plots[choice.src] as Building).out[choice.good] -= choice.amount;
  if (choice.errand === 'input' || choice.errand === 'food') (dst as Building).incoming[choice.good] += choice.amount;
  p.errand = choice.errand;
  p.good = choice.good;
  p.amount = choice.amount;
  p.src = choice.src;
  p.dst = choice.dst;
  p.dstRef = dst;
  p.holding = false;
  p.phase = 0;
  p.timerS = PEOPLE.handlingSeconds;
  return true;
}

/** Sets the load down where it was going; if that building is gone meanwhile, the keep takes it. */
function deliver(town: Town, p: Person): void {
  const dst = p.dst >= 0 ? town.plots[p.dst] : null;
  if (p.dst === KEEP || !dst || dst !== p.dstRef) {
    town.stock[p.good] += p.amount;
  } else if (p.errand === 'site') {
    dst.matDelivered += p.amount;
  } else {
    dst.inp[p.good] += p.amount;
    dst.incoming[p.good] -= p.amount;
  }
  p.errand = 'none';
  p.holding = false;
  p.load = null;
}

export function stepCarrier(world: World, town: Town, p: Person, dtSeconds: number): void {
  if (p.errand === 'none') {
    p.thinkS -= dtSeconds;
    if (p.thinkS <= 0) {
      p.thinkS = 0.7;
      if (findErrand(town, p)) return;
    }
    // Nothing to carry: wait by the keep's gate.
    p.act = walkTo(world, p, doorX(town, KEEP), doorZ(town, KEEP), dtSeconds) ? 'stand' : 'walk';
    return;
  }
  const to = p.holding ? p.dst : p.src;
  if (!walkTo(world, p, doorX(town, to), doorZ(town, to), dtSeconds)) {
    p.act = 'walk';
    return;
  }
  // Picking the load up, or setting it down.
  p.act = 'stand';
  p.timerS -= dtSeconds;
  if (p.timerS > 0) return;
  p.timerS = PEOPLE.handlingSeconds;
  if (!p.holding) {
    p.holding = true;
    p.load = p.good;
  } else {
    deliver(town, p);
  }
}
