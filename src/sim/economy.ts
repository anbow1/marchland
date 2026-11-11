import { ARMY, BUILDINGS, DEMOLISH_REFUND, FOOD, LEVEL_COST, LEVEL_SPEED, MAX_LEVEL, TOWN, UNITS, UPGRADE_SECONDS } from '../config.ts';
import { type BuildingKind, type CommandResult, type Cost, RESOURCE_IDS, type ResourceId, type Side, type Stock, type UnitKind } from './types.ts';

// A town's economy: one shared stock, buildings on plots that turn inputs into
// outputs on a cycle, rations eaten by workers, townsfolk and soldiers, and a
// recruiting queue that spends gold and equipment. Pure data and functions.

export interface Building {
  kind: BuildingKind;
  level: number;
  hp: number;
  /** Above zero while being built or upgraded; nothing is produced meanwhile. */
  constructionLeftS: number;
  constructionTotalS: number;
  /** True once the inputs of the current cycle have been taken from the stock. */
  cycleStarted: boolean;
  cycleProgressS: number;
  /** Switched off by the player (to save grain for bread, say). */
  paused: boolean;
}

export interface RecruitOrder {
  kind: UnitKind;
  leftS: number;
}

export interface Town {
  side: Side;
  stock: Stock;
  plots: (Building | null)[];
  keepHp: number;
  /** Rations owed; one is eaten whenever this reaches 1. */
  rationDebt: number;
  starving: boolean;
  recruitQueue: RecruitOrder[];
  /** Regiments whose training finished this step; the world turns them into soldiers. */
  trained: UnitKind[];
  /** The computer's difficulty handicap; 1 for the player. */
  productionFactor: number;
  goldRemainder: number;
}

export function emptyStock(): Stock {
  const stock = {} as Stock;
  for (const id of RESOURCE_IDS) stock[id] = 0;
  return stock;
}

export function createTown(side: Side, productionFactor = 1): Town {
  const stock = emptyStock();
  for (const id of RESOURCE_IDS) stock[id] = TOWN.startingStock[id] ?? 0;
  const plots: (Building | null)[] = [];
  for (let i = 0; i < TOWN.plotCount; i++) plots.push(null);
  return { side, stock, plots, keepHp: TOWN.keepHp, rationDebt: 0, starving: false, recruitQueue: [], trained: [], productionFactor, goldRemainder: 0 };
}

/** Price of raising a building to `level` (1 = building it new). */
export function buildingCost(kind: BuildingKind, level: number, resource: ResourceId): number {
  const factor = LEVEL_COST[level - 1];
  if (factor === undefined) throw new Error(`building level '${level}' is not in 1…${MAX_LEVEL}`);
  return Math.round((BUILDINGS[kind].cost[resource] ?? 0) * factor);
}

export function buildingMaxHp(kind: BuildingKind, level: number): number {
  return BUILDINGS[kind].hp * level;
}

export function canAffordBuilding(stock: Stock, kind: BuildingKind, level: number): boolean {
  for (const id of RESOURCE_IDS) if (stock[id] < buildingCost(kind, level, id)) return false;
  return true;
}

function payBuilding(stock: Stock, kind: BuildingKind, level: number): void {
  for (const id of RESOURCE_IDS) stock[id] -= buildingCost(kind, level, id);
}

function plotIndexOk(town: Town, plot: number): void {
  if (!Number.isInteger(plot) || plot < 0 || plot >= town.plots.length) throw new Error(`plot '${plot}' is not in 0…${town.plots.length - 1}`);
}

export function startBuilding(town: Town, plot: number, kind: BuildingKind): CommandResult {
  plotIndexOk(town, plot);
  if (town.plots[plot] !== null) return 'plotTaken';
  if (!canAffordBuilding(town.stock, kind, 1)) return 'cannotAfford';
  payBuilding(town.stock, kind, 1);
  const seconds = BUILDINGS[kind].buildSeconds;
  town.plots[plot] = { kind, level: 1, hp: buildingMaxHp(kind, 1), constructionLeftS: seconds, constructionTotalS: seconds, cycleStarted: false, cycleProgressS: 0, paused: false };
  return 'ok';
}

export function startUpgrade(town: Town, plot: number): CommandResult {
  plotIndexOk(town, plot);
  const b = town.plots[plot];
  if (!b) return 'plotEmpty';
  if (b.constructionLeftS > 0) return 'underConstruction';
  if (b.level >= MAX_LEVEL) return 'maxLevel';
  if (!canAffordBuilding(town.stock, b.kind, b.level + 1)) return 'cannotAfford';
  payBuilding(town.stock, b.kind, b.level + 1);
  // The level counts from the moment the work is paid for; the building stands idle until it is done.
  b.level += 1;
  b.hp = buildingMaxHp(b.kind, b.level);
  b.constructionLeftS = UPGRADE_SECONDS;
  b.constructionTotalS = UPGRADE_SECONDS;
  return 'ok';
}

export function demolish(town: Town, plot: number): CommandResult {
  plotIndexOk(town, plot);
  const b = town.plots[plot];
  if (!b) return 'plotEmpty';
  for (const id of RESOURCE_IDS) town.stock[id] += Math.floor(buildingCost(b.kind, 1, id) * DEMOLISH_REFUND);
  town.plots[plot] = null;
  return 'ok';
}

export function togglePaused(town: Town, plot: number): CommandResult {
  plotIndexOk(town, plot);
  const b = town.plots[plot];
  if (!b) return 'plotEmpty';
  b.paused = !b.paused;
  return 'ok';
}

/** Highest level among finished barracks; 0 without one. */
export function barracksLevel(town: Town): number {
  let best = 0;
  for (const b of town.plots) {
    if (!b || b.kind !== 'barracks') continue;
    // A barracks being upgraded still trains at its old level; one being built trains nothing yet.
    const usable = b.constructionLeftS > 0 ? b.level - 1 : b.level;
    if (usable > best) best = usable;
  }
  return best;
}

export function canAffordUnit(stock: Stock, kind: UnitKind): boolean {
  const def = UNITS[kind];
  if (stock.gold < def.goldCost) return false;
  for (const id of RESOURCE_IDS) if (stock[id] < (def.equipment[id] ?? 0) * def.men) return false;
  return true;
}

/** Men waiting in the queue; they count against the army limit. */
export function queuedMen(town: Town): number {
  let men = 0;
  for (const order of town.recruitQueue) men += UNITS[order.kind].men;
  return men;
}

export function startRecruit(town: Town, kind: UnitKind, menUnderArms: number): CommandResult {
  const def = UNITS[kind];
  if (barracksLevel(town) < def.barracksLevel) return 'needsBarracks';
  if (town.recruitQueue.length >= ARMY.maxRecruitQueue) return 'queueFull';
  if (menUnderArms + queuedMen(town) + def.men > ARMY.maxSoldiersPerSide) return 'armyFull';
  if (!canAffordUnit(town.stock, kind)) return 'cannotAfford';
  town.stock.gold -= def.goldCost;
  for (const id of RESOURCE_IDS) town.stock[id] -= (def.equipment[id] ?? 0) * def.men;
  town.recruitQueue.push({ kind, leftS: def.recruitSeconds });
  return 'ok';
}

function hasInputs(stock: Stock, inputs: Cost): boolean {
  for (const id of RESOURCE_IDS) if (stock[id] < (inputs[id] ?? 0)) return false;
  return true;
}

/** Rations per second the town needs with `soldiers` men under arms. */
export function rationDemandPerSecond(town: Town, soldiers: number): number {
  let perMinute = soldiers * FOOD.soldierRationsPerMinute;
  for (const b of town.plots) {
    if (b && b.constructionLeftS <= 0) perMinute += BUILDINGS[b.kind].rationsPerMinute * b.level;
  }
  return perMinute / 60;
}

function eat(town: Town, dtSeconds: number, soldiers: number): void {
  town.rationDebt += rationDemandPerSecond(town, soldiers) * dtSeconds;
  while (town.rationDebt >= 1) {
    if (town.stock.bread > 0) {
      town.stock.bread -= 1;
      town.rationDebt -= FOOD.breadRations;
    } else if (town.stock.sausage > 0) {
      town.stock.sausage -= 1;
      town.rationDebt -= FOOD.sausageRations;
    } else {
      // Nothing to eat: hunger does not pile up as a debt to be repaid later.
      town.rationDebt = 1;
      town.starving = true;
      return;
    }
    town.starving = false;
  }
}

function addGold(town: Town, amount: number): void {
  town.goldRemainder += amount;
  const whole = Math.floor(town.goldRemainder);
  town.stock.gold += whole;
  town.goldRemainder -= whole;
}

function produce(town: Town, b: Building, dtSeconds: number): void {
  const recipe = BUILDINGS[b.kind].recipe;
  if (!recipe || b.paused) return;
  // Houses pay tax only when the town is fed.
  if (b.kind === 'house' && town.starving) return;
  if (!b.cycleStarted) {
    if (!hasInputs(town.stock, recipe.inputs)) return;
    for (const id of RESOURCE_IDS) town.stock[id] -= recipe.inputs[id] ?? 0;
    b.cycleStarted = true;
    b.cycleProgressS = 0;
  }
  const speed = (LEVEL_SPEED[b.level - 1] as number) * (town.starving ? FOOD.starvingSpeedFactor : 1) * town.productionFactor;
  b.cycleProgressS += dtSeconds * speed;
  if (b.cycleProgressS >= recipe.cycleSeconds) {
    for (const id of RESOURCE_IDS) town.stock[id] += recipe.outputs[id] ?? 0;
    b.cycleStarted = false;
    b.cycleProgressS = 0;
  }
}

/** One fixed step of a town. `soldiers` is the number of its men alive on the field. */
export function stepEconomy(town: Town, dtSeconds: number, soldiers: number): void {
  eat(town, dtSeconds, soldiers);
  addGold(town, TOWN.keepGoldPerSecond * dtSeconds);
  for (const b of town.plots) {
    if (!b) continue;
    if (b.constructionLeftS > 0) {
      b.constructionLeftS = Math.max(0, b.constructionLeftS - dtSeconds);
      continue;
    }
    produce(town, b, dtSeconds);
  }
  const first = town.recruitQueue[0];
  if (first && barracksLevel(town) > 0) {
    first.leftS -= dtSeconds;
    if (first.leftS <= 0) {
      town.recruitQueue.shift();
      town.trained.push(first.kind);
    }
  }
}

/** True while the building is taking part in production (for smoke and the HUD). */
export function isWorking(b: Building): boolean {
  return b.constructionLeftS <= 0 && !b.paused && b.cycleStarted;
}
