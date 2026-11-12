import { BUILDINGS, FOOD, PEOPLE } from '../config.ts';
import { type Building, isBuilt, rationsIn, type Town } from './economy.ts';
import { doorX, doorZ, KEEP, NOWHERE, type Person, walkTo } from './people.ts';
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
const URGENCY = { site: 4000, hungryHouse: 5000, food: 3000, input: 2000, clear: 1000 } as const;

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

/** Nearest place that has `good` to spare, other than `notPlot`: a yard's output, else the keep; NOWHERE if none. */
function findSource(town: Town, good: ResourceId, nearX: number, nearZ: number, notPlot: number, side: Person['side']): number {
  let best = NOWHERE;
  let bestD2 = Number.POSITIVE_INFINITY;
  for (let plot = 0; plot < town.plots.length; plot++) {
    const b = town.plots[plot];
    if (!b || plot === notPlot || b.out[good] <= 0) continue;
    const d2 = (doorX(side, plot) - nearX) ** 2 + (doorZ(side, plot) - nearZ) ** 2;
    if (d2 < bestD2) {
      best = plot;
      bestD2 = d2;
    }
  }
  if (best === NOWHERE && town.stock[good] > 0) return KEEP;
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

function offer(p: Person, urgency: number, errand: Person['errand'], good: ResourceId, amount: number, src: number, dst: number): void {
  if (amount <= 0) return;
  const d = Math.hypot(doorX(p.side, src) - p.x, doorZ(p.side, src) - p.z);
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
  const side = p.side;
  choice.score = Number.NEGATIVE_INFINITY;
  choice.errand = 'none';
  for (let plot = 0; plot < town.plots.length; plot++) {
    const b = town.plots[plot];
    if (!b) continue;
    if (!isBuilt(b)) {
      // Timber and stone for the builders: already paid for, waiting at the keep.
      for (const good of ['wood', 'stone'] as const) offer(p, URGENCY.site, 'site', good, Math.min(PEOPLE.carryCapacity, b.matWaiting[good]), KEEP, plot);
      continue;
    }
    if (b.kind === 'house') {
      let have = rationsIn(b.inp);
      for (const food of FOODS) have += b.incoming[food] * (FOOD_RATIONS[food] as number);
      if (have >= PEOPLE.houseFoodTarget) continue;
      for (const food of FOODS) {
        const src = findSource(town, food, doorX(side, plot), doorZ(side, plot), plot, side);
        if (src === NOWHERE) continue;
        offer(p, have < 1 ? URGENCY.hungryHouse : URGENCY.food, 'food', food, Math.min(PEOPLE.carryCapacity, available(town, src, food)), src, plot);
        break;
      }
      continue;
    }
    const recipe = BUILDINGS[b.kind].recipe;
    if (recipe && !b.paused) {
      for (const good of RESOURCE_IDS) {
        if ((recipe.inputs[good] ?? 0) === 0) continue;
        const want = PEOPLE.inputTarget - b.inp[good] - b.incoming[good];
        if (want < 1) continue;
        const src = findSource(town, good, doorX(side, plot), doorZ(side, plot), plot, side);
        if (src === NOWHERE) continue;
        // An empty input store is more pressing than a half-full one.
        offer(p, URGENCY.input + (b.inp[good] + b.incoming[good] === 0 ? 500 : 0), 'input', good, Math.min(PEOPLE.carryCapacity, want, available(town, src, good)), src, plot);
      }
    }
    // What has piled up in the yard goes to the keep.
    for (const good of RESOURCE_IDS) {
      if (b.out[good] >= PEOPLE.clearOutputAt) offer(p, URGENCY.clear + b.out[good] * 20, 'clear', good, Math.min(PEOPLE.carryCapacity, b.out[good]), plot, KEEP);
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

export function stepCarrier(_world: World, town: Town, p: Person, dtSeconds: number): void {
  if (p.errand === 'none') {
    p.thinkS -= dtSeconds;
    if (p.thinkS <= 0) {
      p.thinkS = 0.7;
      if (findErrand(town, p)) return;
    }
    // Nothing to carry: wait by the keep's gate.
    p.act = walkTo(p, doorX(p.side, KEEP), doorZ(p.side, KEEP), dtSeconds) ? 'stand' : 'walk';
    return;
  }
  const to = p.holding ? p.dst : p.src;
  if (!walkTo(p, doorX(p.side, to), doorZ(p.side, to), dtSeconds)) {
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
