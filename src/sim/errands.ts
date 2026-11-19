import { BUILDINGS, FOOD, KEEP_BAYS, PEOPLE, PRIORITY, TOWN, WINE } from '../config.ts';
import { townX, townZ } from './terrain.ts';
import { type Building, carryCapacity, carryPace, isBuilt, outputFull, rationsIn, type Town } from './economy.ts';
import { doorX, doorZ, type Person, walkTo } from './people.ts';
import { KEEP, NOWHERE } from './types.ts';
import { type ResourceId, RESOURCE_IDS } from './types.ts';
import type { World } from './world.ts';
import { hypot2 } from '../core/hypot.ts';

// What carriers do. A free carrier takes the most pressing errand near him:
// timber and stone to a building site, food to a house whose larder is low,
// inputs to a workshop, or goods piled in a yard back to the keep. The goods
// are taken off the source's books when the errand is given and put on the
// destination's when he arrives; in between they are on his back.

const FOODS: readonly ResourceId[] = ['bread', 'fish', 'sausage'];
const FOOD_RATIONS: Record<string, number> = { bread: FOOD.breadRations, fish: FOOD.fishRations, sausage: FOOD.sausageRations };

/** How pressing each kind of errand is; distance to the pick-up (in metres) is taken off. */
const URGENCY = { site: 4000, hungryHouse: 5000, food: 3000, wine: 2200, input: 2000, clear: 1000, clearLow: 1700, clearScarce: 2600 } as const;
/** The keep is short of a good when it holds fewer than this: fetching it from the yards comes before feeding workshops. */
const SCARCE_BELOW = 12;
/** Timber and stone go into every building, the keep and the walls: the keep wants a store of them, not a handful. */
const MATERIAL_SCARCE_BELOW = 80;

function scarceBelow(good: ResourceId): number {
  return good === 'wood' || good === 'stone' ? MATERIAL_SCARCE_BELOW : SCARCE_BELOW;
}

/**
 * The town's stores: the keep, and every finished storehouse. The goods in them are one stock (the town's);
 * a store is only where carriers set goods down and pick them up, and each takes the one nearest his way.
 */
export function isStore(town: Town, plot: number): boolean {
  if (plot === KEEP) return true;
  const b = plot >= 0 ? town.plots[plot] : null;
  return !!b && b.kind === 'storehouse' && b.constructionLeftS <= 0;
}

/** The store whose door is nearest (x, z): the keep, or a finished storehouse. */
export function nearestStore(town: Town, x: number, z: number): number {
  let best = KEEP;
  let bestM = hypot2(doorX(town, KEEP) - x, doorZ(town, KEEP) - z);
  for (let plot = 0; plot < town.plots.length; plot++) {
    const b = town.plots[plot];
    if (!b || b.kind !== 'storehouse' || b.constructionLeftS > 0) continue;
    const m = hypot2(doorX(town, plot) - x, doorZ(town, plot) - z);
    if (m < bestM) {
      best = plot;
      bestM = m;
    }
  }
  return best;
}

/** Gives a carrier's load back when his errand is called off: to the site's pile or the keep. */
export function cancelErrand(town: Town, p: Person): void {
  if (p.errand === 'none') return;
  const dst = p.dst >= 0 ? town.plots[p.dst] : null;
  const sameBuilding = dst !== null && dst === p.dstRef;
  if (p.errand === 'site' && sameBuilding && (p.good === 'wood' || p.good === 'stone' || p.good === 'planks')) dst.matWaiting[p.good] += p.amount;
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
    // From the town's stock: through whichever store makes the shortest walk.
    const stores = [KEEP];
    for (let plot = 0; plot < town.plots.length; plot++) if (plot !== notPlot && isStore(town, plot)) stores.push(plot);
    for (const store of stores) {
      const sx = doorX(town, store);
      const sz = doorZ(town, store);
      const m = hypot2(sx - p.x, sz - p.z) + hypot2(sx - toX, sz - toZ);
      if (m < bestM) {
        best = store;
        bestM = m;
      }
    }
  }
  for (let plot = 0; plot < town.plots.length; plot++) {
    const b = town.plots[plot];
    if (!b || plot === notPlot || isStore(town, plot) || b.out[good] <= 0) continue;
    const m = hypot2(b.x - p.x, b.z - p.z) + hypot2(b.x - toX, b.z - toZ);
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
  const d = hypot2(doorX(town, src) - p.x, doorZ(town, src) - p.z);
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
  return isStore(town, src) ? town.stock[good] : (town.plots[src] as Building).out[good];
}

/** The player's lean towards a good, as urgency. */
function priorityOf(town: Town, good: ResourceId): number {
  return leanOf(town.priority[good]);
}

function leanOf(p: number | undefined): number {
  return (p ?? 0) > 0 ? PRIORITY.high : (p ?? 0) < 0 ? PRIORITY.low : 0;
}

/** Looks for an errand; true (and the errand is his) when there is one. */
function findErrand(town: Town, p: Person): boolean {
  const cap = carryCapacity(town);
  choice.score = Number.NEGATIVE_INFINITY;
  choice.errand = 'none';
  for (let plot = 0; plot < town.plots.length; plot++) {
    const b = town.plots[plot];
    if (!b) continue;
    if (!isBuilt(b)) {
      // Timber and stone for the builders: already paid for, waiting at the keep.
      for (const good of ['wood', 'stone', 'planks'] as const) offer(town, p, URGENCY.site, 'site', good, Math.min(cap, b.matWaiting[good]), nearestStore(town, b.x, b.z), plot);
      continue;
    }
    if (b.kind === 'house') {
      // Wine, when there is any to spare: after bread, before workshops' inputs.
      const wineWanted = WINE.houseTarget - b.inp.wine - b.incoming.wine;
      if (wineWanted >= 1) {
        const src = findSource(town, p, 'wine', b.x, b.z, plot);
        if (src !== NOWHERE) offer(town, p, URGENCY.wine, 'food', 'wine', Math.min(cap, wineWanted, available(town, src, 'wine')), src, plot);
      }
      let have = rationsIn(b.inp);
      for (const food of FOODS) have += b.incoming[food] * (FOOD_RATIONS[food] as number);
      if (have >= PEOPLE.houseFoodTarget) continue;
      for (const food of FOODS) {
        const src = findSource(town, p, food, b.x, b.z, plot);
        if (src === NOWHERE) continue;
        offer(town, p, have < 1 ? URGENCY.hungryHouse : URGENCY.food, 'food', food, Math.min(cap, available(town, src, food)), src, plot);
        break;
      }
      continue;
    }
    const recipe = BUILDINGS[b.kind].recipe;
    // No more inputs for a workshop whose yard is full: it cannot use them.
    if (recipe && !b.paused && !b.held && !outputFull(b)) {
      for (const good of RESOURCE_IDS) {
        if ((recipe.inputs[good] ?? 0) === 0) continue;
        const want = PEOPLE.inputTarget - b.inp[good] - b.incoming[good];
        if (want < 1) continue;
        const src = findSource(town, p, good, b.x, b.z, plot);
        if (src === NOWHERE) continue;
        // An empty input store is more pressing than a half-full one.
        offer(town, p, URGENCY.input + (b.inp[good] + b.incoming[good] === 0 ? 500 : 0) + priorityOf(town, good) + leanOf(town.kindPriority[b.kind]), 'input', good, Math.min(cap, want, available(town, src, good)), src, plot);
      }
    }
    // What has piled up in the yard goes to the keep: a full load, unless the keep is short of it or the yard
    // is nearly full (a long walk for half a load wastes the carrier).
    for (const good of RESOURCE_IDS) {
      const scarce = town.stock[good] < SCARCE_BELOW;
      // Timber and stone run low in the keep: fetched before other yards are cleared, after workshops are fed.
      const low = !scarce && town.stock[good] < scarceBelow(good);
      if (b.out[good] < (scarce || b.out[good] >= PEOPLE.outputCap - 4 ? PEOPLE.clearOutputAt : Math.min(cap, PEOPLE.outputCap - 4))) continue;
      const urgency = (scarce ? URGENCY.clearScarce : low ? URGENCY.clearLow : URGENCY.clear) + priorityOf(town, good);
      offer(town, p, urgency + b.out[good] * 20, 'clear', good, Math.min(cap, b.out[good]), plot, nearestStore(town, b.x, b.z));
    }
  }
  if (choice.errand === 'none') return false;
  // Off the source's books now, so two carriers do not go for the same sack.
  const dst = choice.dst >= 0 ? (town.plots[choice.dst] as Building) : null;
  if (choice.errand === 'site') (dst as Building).matWaiting[choice.good as 'wood' | 'stone' | 'planks'] -= choice.amount;
  else if (isStore(town, choice.src)) town.stock[choice.good] -= choice.amount;
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
  if (isStore(town, p.dst) || !dst || dst !== p.dstRef) {
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

const BAY = { x: 0, z: 0 };

/**
 * Where a carrier hands goods over at the keep: one of KEEP_BAYS.count bays round its walls, the one facing the
 * other end of his errand (so he does not walk round it), his neighbours in the town's order on the bays either
 * side. One door for everyone made a queue of barrows there.
 */
function keepBay(town: Town, p: Person, other: number): void {
  const kx = townX(town.side);
  const kz = townZ(town.side);
  const ox = other === KEEP || other === NOWHERE ? kx + 1 : doorX(town, other);
  const oz = other === KEEP || other === NOWHERE ? kz : doorZ(town, other);
  const step = (Math.PI * 2) / KEEP_BAYS.count;
  const bay = Math.round(Math.atan2(ox - kx, oz - kz) / step) + (((p.n ?? 0) % 3) - 1);
  const a = bay * step;
  BAY.x = kx + Math.sin(a) * (TOWN.keepRadiusM + KEEP_BAYS.outM);
  BAY.z = kz + Math.cos(a) * (TOWN.keepRadiusM + KEEP_BAYS.outM);
}

/** Where an idle carrier waits: about the keep's yard, each on his own spot, out of the way of the bays. */
function idleSpot(town: Town, p: Person): void {
  const n = p.n ?? 0;
  // The golden angle round, a little further out every few: an even scatter.
  const a = n * 2.399963 + town.side;
  const r = TOWN.keepRadiusM + KEEP_BAYS.idleFromM + (n % 4) * 2.2;
  BAY.x = townX(town.side) + Math.sin(a) * r;
  BAY.z = townZ(town.side) + Math.cos(a) * r;
}

export function stepCarrier(world: World, town: Town, p: Person, dtSeconds: number): void {
  if (p.errand === 'none') {
    p.thinkS -= dtSeconds;
    if (p.thinkS <= 0) {
      p.thinkS = 0.7;
      if (findErrand(town, p)) return;
    }
    // Nothing to carry: wait about the keep's yard.
    idleSpot(town, p);
    p.act = walkTo(world, p, BAY.x, BAY.z, dtSeconds) ? 'stand' : 'walk';
    return;
  }
  const to = p.holding ? p.dst : p.src;
  let tx = doorX(town, to);
  let tz = doorZ(town, to);
  if (to === KEEP) {
    keepBay(town, p, p.holding ? p.src : p.dst);
    tx = BAY.x;
    tz = BAY.z;
  }
  if (!walkTo(world, p, tx, tz, dtSeconds, carryPace(town))) {
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
