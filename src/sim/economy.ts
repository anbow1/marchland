import { ARMY, BUILDINGS, DEMOLISH_REFUND, FIELDS, FOOD, KEEP_LEVELS, KEEP_UPGRADE_SECONDS, LEVEL_COST, LEVEL_SPEED, MAX_LEVEL, PEOPLE, TOWN, TRANSPORT, UNITS, UPGRADE_SECONDS, VINES, WINE } from '../config.ts';
import { type BuildingKind, type CommandResult, type Cost, RESOURCE_IDS, type ResourceId, type Side, type Stock, type UnitKind, WORKLESS } from './types.ts';

// A town's economy. The keep is the storehouse (`stock`); every building has
// its own small stores: inputs that carriers fill, outputs that pile up in its
// yard until someone carries them off. A building works only while its worker
// is there, and is built only while builders are there and the timber and
// stone have been carried to the site. People themselves (who carries what,
// who works where) are in people.ts; this file is the stores and the clocks.

/** A strip of a farm's land: not yet broken, bare, sown and growing, or ripe. */
export type StripState = 'wild' | 'bare' | 'growing' | 'ripe';

export interface FieldStrip {
  state: StripState;
  /** 0…1 while growing. */
  growth: number;
  /** Middle of the strip. */
  x: number;
  z: number;
}

/** Where a building stands and what it reaches: worked out when the ground is chosen (placement.ts). */
export interface Site {
  x: number;
  z: number;
  /** The way its door looks: 0 along +Z, π/2 along +X. */
  yawRad: number;
  /** Where its worker goes out to: the trees, the water's edge; the building itself for the rest. */
  spotX: number;
  spotZ: number;
  /** Middles of the strips of land behind a farm, nearest first; empty for other buildings. */
  strips: { x: number; z: number }[];
}

export interface Building {
  kind: BuildingKind;
  level: number;
  hp: number;
  x: number;
  z: number;
  yawRad: number;
  spotX: number;
  spotZ: number;
  /** Builder-seconds of work left; above zero while being built or upgraded. */
  constructionLeftS: number;
  constructionTotalS: number;
  /** Timber and stone for the work in hand: still at the keep, and how much of the total has reached the site. */
  matWaiting: { wood: number; stone: number };
  matDelivered: number;
  matTotal: number;
  /** Goods waiting to be used, goods made and not yet carried off, and goods a carrier is bringing. */
  inp: Stock;
  out: Stock;
  incoming: Stock;
  /** True once the inputs of the current cycle have been taken from the input store. */
  cycleStarted: boolean;
  cycleProgressS: number;
  /** Switched off by the player (to save grain for bread, say). */
  paused: boolean;
  /** Set by the people's step every tick: work being done here now (1 per fed worker, 0.5 per hungry one), builders on site, people living here. */
  workRate: number;
  buildersPresent: number;
  residents: number;
  /** Houses: rations owed, whether the larder is empty, and the clock to the next newcomer. */
  rationDebt: number;
  starving: boolean;
  growS: number;
  /** Farms and vineyards: the land behind the building, nearest strip first. */
  strips: FieldStrip[];
  /** Houses: wine owed, and whether there is wine in the house now. */
  wineDebt: number;
  hasWine: boolean;
  /** Towers: archers or crossbowmen inside, their kind, and the seconds to the next shot. */
  garrison: number;
  garrisonKind: UnitKind | null;
  shotS: number;
  /** A woodcutter that found no grown tree in reach the last time he looked. */
  noTrees: boolean;
  /** Every good it makes has an order and every order is filled: it stands idle until more is ordered. */
  held: boolean;
}

export interface RecruitOrder {
  kind: UnitKind;
  leftS: number;
  /** Townspeople who must reach the barracks, and how many have. */
  needPeople: number;
  arrived: number;
  /** Set when the order fills a regiment already in the field: its id and the men it takes. */
  reinforceId?: number;
  men?: number;
}

export interface Town {
  side: Side;
  /** What lies in the keep. */
  stock: Stock;
  /** The town's buildings; a building keeps its place in the list for as long as it stands (null = free). */
  plots: (Building | null)[];
  keepHp: number;
  /** The keep's level (1…3) and the seconds left on raising it to the next (0 when no work is under way). */
  keepLevel: number;
  keepUpgradeLeftS: number;
  /** Transport level (1…3: by hand, handcarts, wagons) and the seconds left on raising it (0 when no work is under way). */
  transportLevel: number;
  transportUpgradeLeftS: number;
  /** Carriers' priority for each good: 1 high, 0 normal, −1 low. */
  priority: Partial<Record<ResourceId, number>>;
  /** Which workshops are served first when several want the same input: 1 high, 0 normal, −1 low. */
  kindPriority: Partial<Record<BuildingKind, number>>;
  /** Production orders: how much more of a good to make (absent = no limit, make as long as there is room). */
  orders: Partial<Record<ResourceId, number>>;
  /** Rations owed by the keep's household and the army; one is eaten whenever this reaches 1. */
  rationDebt: number;
  starving: boolean;
  recruitQueue: RecruitOrder[];
  /** Regiments whose training finished this step; the world turns them into soldiers. */
  trained: UnitKind[];
  /** New men for regiments in the field whose training finished this step: the regiment and how many. */
  reinforced: { id: number; men: number; people: number }[];
  /** Soldiers' pay owed and not yet paid (arrears when the chest ran dry), and whether they count as unpaid. */
  payOwed: number;
  unpaid: boolean;
  /** Plots whose building or upgrade was finished this step; the world announces them. */
  finishedPlots: number[];
  /** The computer's difficulty handicap; 1 for the player. */
  productionFactor: number;
  goldRemainder: number;
  /** Townspeople now serving as soldiers: they still count against the houses' room. */
  underArms: number;
  /** The keep's own household: people living there now (set by the people's step) and the clock to the next newcomer. */
  keepResidents: number;
  keepGrowS: number;
  /** Everything the town has made since the start, by good (the production screen's rates come from it). */
  made: Stock;
  /** What was made and what lay in the keep, sampled every FLOW_SAMPLE_S, newest last (at most FLOW_SAMPLES). */
  flow: { made: Stock; stock: Stock }[];
  flowS: number;
}

/** Seconds between samples of what a town makes, and how many are kept: rates are over the last two minutes. */
export const FLOW_SAMPLE_S = 15;
export const FLOW_SAMPLES = 9;

/** Counts goods made (into a yard, or gold as tax) for the production screen. */
export function noteMade(town: Town, id: ResourceId, amount: number): void {
  town.made[id] += amount;
}

/**
 * Per good, a minute's making and a minute's change in the keep's store, over the samples kept (two
 * minutes once the game is that old); zeros before the second sample.
 */
export function flowRates(town: Town): { made: Stock; net: Stock } {
  const made = emptyStock();
  const net = emptyStock();
  const first = town.flow[0];
  const last = town.flow[town.flow.length - 1];
  if (!first || !last || first === last) return { made, net };
  const minutes = ((town.flow.length - 1) * FLOW_SAMPLE_S) / 60;
  for (const id of RESOURCE_IDS) {
    made[id] = (last.made[id] - first.made[id]) / minutes;
    net[id] = (last.stock[id] - first.stock[id]) / minutes;
  }
  return { made, net };
}

/** The first input a workshop waits for (it has less than a cycle takes), or null. */
export function lackingInput(b: Building): ResourceId | null {
  const recipe = BUILDINGS[b.kind].recipe;
  if (!recipe) return null;
  for (const id of RESOURCE_IDS) if ((recipe.inputs[id] ?? 0) > b.inp[id]) return id;
  return null;
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
  for (let i = 0; i < TOWN.maxBuildings; i++) plots.push(null);
  return { side, stock, plots, keepHp: TOWN.keepHp, keepLevel: 1, keepUpgradeLeftS: 0, transportLevel: 1, transportUpgradeLeftS: 0, priority: {}, kindPriority: {}, orders: {}, rationDebt: 0, starving: false, recruitQueue: [], trained: [], reinforced: [], payOwed: 0, unpaid: false, finishedPlots: [], productionFactor, goldRemainder: 0, underArms: 0, keepResidents: 0, keepGrowS: 0, made: emptyStock(), flow: [], flowS: 0 };
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

/** Takes the price from the keep: gold is spent, timber and stone are set aside for carriers to bring to the site. */
function orderWork(town: Town, b: Building, level: number, seconds: number): void {
  for (const id of RESOURCE_IDS) town.stock[id] -= buildingCost(b.kind, level, id);
  b.matWaiting.wood = buildingCost(b.kind, level, 'wood');
  b.matWaiting.stone = buildingCost(b.kind, level, 'stone');
  b.matTotal = b.matWaiting.wood + b.matWaiting.stone;
  b.matDelivered = 0;
  b.constructionLeftS = seconds;
  b.constructionTotalS = seconds;
}

function plotIndexOk(town: Town, plot: number): void {
  if (!Number.isInteger(plot) || plot < 0 || plot >= town.plots.length) throw new Error(`plot '${plot}' is not in 0…${town.plots.length - 1}`);
}

/** First free place in the town's list of buildings; -1 when the town has all it may. */
export function freePlot(town: Town): number {
  return town.plots.indexOf(null);
}

/** Starts a building on ground already checked (placement.ts); returns its place in the town's list. */
export function startBuilding(town: Town, kind: BuildingKind, site: Site): number {
  const plot = freePlot(town);
  if (plot < 0) throw new Error(`side ${town.side} already has ${town.plots.length} buildings; check freePlot() before building`);
  if (!canAffordBuilding(town.stock, kind, 1)) throw new Error(`side ${town.side} cannot afford a ${kind}; check canAffordBuilding() before building`);
  const strips: FieldStrip[] = site.strips.map((s) => ({ state: 'wild', growth: 0, x: s.x, z: s.z }));
  const b: Building = {
    kind,
    level: 1,
    hp: buildingMaxHp(kind, 1),
    x: site.x,
    z: site.z,
    yawRad: site.yawRad,
    spotX: site.spotX,
    spotZ: site.spotZ,
    constructionLeftS: 0,
    constructionTotalS: 0,
    matWaiting: { wood: 0, stone: 0 },
    matDelivered: 0,
    matTotal: 0,
    inp: emptyStock(),
    out: emptyStock(),
    incoming: emptyStock(),
    cycleStarted: false,
    cycleProgressS: 0,
    paused: false,
    workRate: 0,
    buildersPresent: 0,
    residents: 0,
    rationDebt: 0,
    starving: false,
    growS: 0,
    strips,
    wineDebt: 0,
    hasWine: false,
    garrison: 0,
    garrisonKind: null,
    shotS: 0,
    noTrees: false,
    held: false,
  };
  orderWork(town, b, 1, BUILDINGS[kind].buildSeconds);
  town.plots[plot] = b;
  return plot;
}

export function startUpgrade(town: Town, plot: number): CommandResult {
  plotIndexOk(town, plot);
  const b = town.plots[plot];
  if (!b) return 'plotEmpty';
  if (b.constructionLeftS > 0) return 'underConstruction';
  if (b.level >= MAX_LEVEL) return 'maxLevel';
  // The barracks rises no higher than the keep allows.
  if (b.kind === 'barracks' && b.level + 1 > keepRules(town).barracks) return 'needsKeep';
  if (!canAffordBuilding(town.stock, b.kind, b.level + 1)) return 'cannotAfford';
  // The level counts from the moment the work is paid for; the building stands idle until it is done.
  orderWork(town, b, b.level + 1, UPGRADE_SECONDS);
  b.level += 1;
  b.hp = buildingMaxHp(b.kind, b.level);
  return 'ok';
}

export function demolish(town: Town, plot: number): CommandResult {
  plotIndexOk(town, plot);
  const b = town.plots[plot];
  if (!b) return 'plotEmpty';
  for (const id of RESOURCE_IDS) town.stock[id] += Math.floor(buildingCost(b.kind, 1, id) * DEMOLISH_REFUND);
  // What lay in its yard goes back to the keep with the salvage.
  for (const id of RESOURCE_IDS) town.stock[id] += b.out[id] + b.inp[id];
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

/** True for a building that is finished and not being upgraded. */
export function isBuilt(b: Building): boolean {
  return b.constructionLeftS <= 0;
}

/** What the keep's present level allows (KEEP_LEVELS). */
export function keepRules(town: Town): (typeof KEEP_LEVELS)[number] {
  return KEEP_LEVELS[town.keepLevel - 1] as (typeof KEEP_LEVELS)[number];
}

/** Starts raising the keep a level: paid now, done in KEEP_UPGRADE_SECONDS. */
export function startKeepUpgrade(town: Town): CommandResult {
  if (town.keepHp <= 0) return 'plotEmpty';
  if (town.keepUpgradeLeftS > 0) return 'underConstruction';
  if (town.keepLevel >= KEEP_LEVELS.length) return 'maxLevel';
  const cost = (KEEP_LEVELS[town.keepLevel] as (typeof KEEP_LEVELS)[number]).cost as Partial<Record<ResourceId, number>>;
  for (const id of RESOURCE_IDS) if (town.stock[id] < (cost[id] ?? 0)) return 'cannotAfford';
  for (const id of RESOURCE_IDS) town.stock[id] -= cost[id] ?? 0;
  town.keepUpgradeLeftS = KEEP_UPGRADE_SECONDS;
  return 'ok';
}

/** Starts raising the town's transport a level: paid now, done in that level's seconds. */
export function startTransportUpgrade(town: Town): CommandResult {
  if (town.transportUpgradeLeftS > 0) return 'underConstruction';
  const next = TRANSPORT[town.transportLevel];
  if (!next) return 'maxLevel';
  if (town.keepLevel < next.keepLevel) return 'needsKeep';
  const cost = next.cost as Partial<Record<ResourceId, number>>;
  for (const id of RESOURCE_IDS) if (town.stock[id] < (cost[id] ?? 0)) return 'cannotAfford';
  for (const id of RESOURCE_IDS) town.stock[id] -= cost[id] ?? 0;
  town.transportUpgradeLeftS = next.seconds;
  return 'ok';
}

/** What a carrier of this town takes in one trip, and how much faster than on foot he goes. */
export function carryCapacity(town: Town): number {
  return (TRANSPORT[town.transportLevel - 1] ?? TRANSPORT[0]).capacity;
}

export function carryPace(town: Town): number {
  return (TRANSPORT[town.transportLevel - 1] ?? TRANSPORT[0]).pace;
}

/** True when every good in `outputs` has an order and none is left to make. */
export function ordersFilled(town: Town, outputs: Cost): boolean {
  let any = false;
  for (const id of RESOURCE_IDS) {
    if ((outputs[id] ?? 0) === 0) continue;
    const left = town.orders[id];
    if (left === undefined || left > 0) return false;
    any = true;
  }
  return any;
}

/** Counts goods made against their order, if there is one. */
export function fillOrder(town: Town, good: ResourceId, amount: number): void {
  const left = town.orders[good];
  if (left !== undefined && amount > 0) town.orders[good] = Math.max(0, left - amount);
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

/** The best working foundry's level (guns are cast there); 0 with none. */
export function foundryLevel(town: Town): number {
  let best = 0;
  for (const b of town.plots) {
    if (!b || b.kind !== 'foundry') continue;
    const usable = b.constructionLeftS > 0 ? b.level - 1 : b.level;
    if (usable > best) best = usable;
  }
  return best;
}

/** The level of the building that raises this kind (barracks, or foundry for guns) the town has now. */
export function trainingLevel(town: Town, kind: UnitKind): number {
  return UNITS[kind].trainedAt === 'foundry' ? foundryLevel(town) : barracksLevel(town);
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
  for (const order of town.recruitQueue) men += order.men ?? UNITS[order.kind].men;
  return men;
}

/** Townspeople a regiment of this kind takes from the town. */
export function peopleFor(kind: UnitKind): number {
  return UNITS[kind].men * UNITS[kind].crew;
}

/** Why a regiment cannot be ordered now, apart from the people it needs; 'ok' if it can. */
export function canRecruit(town: Town, kind: UnitKind, menUnderArms: number): CommandResult {
  const def = UNITS[kind];
  if (trainingLevel(town, kind) < def.barracksLevel) return def.trainedAt === 'foundry' ? 'needsFoundry' : 'needsBarracks';
  if (town.recruitQueue.length >= ARMY.maxRecruitQueue) return 'queueFull';
  if (menUnderArms + queuedMen(town) + def.men > ARMY.maxSoldiersPerSide) return 'armyFull';
  if (!canAffordUnit(town.stock, kind)) return 'cannotAfford';
  return 'ok';
}

/** Pays for a regiment and queues it; its people still have to walk to the barracks (people.ts). */
export function startRecruit(town: Town, kind: UnitKind, menUnderArms: number): CommandResult {
  const able = canRecruit(town, kind, menUnderArms);
  if (able !== 'ok') return able;
  const def = UNITS[kind];
  town.stock.gold -= def.goldCost;
  for (const id of RESOURCE_IDS) town.stock[id] -= (def.equipment[id] ?? 0) * def.men;
  town.recruitQueue.push({ kind, leftS: def.recruitSeconds, needPeople: peopleFor(kind), arrived: 0 });
  return 'ok';
}

function hasInputs(stock: Stock, inputs: Cost): boolean {
  for (const id of RESOURCE_IDS) if (stock[id] < (inputs[id] ?? 0)) return false;
  return true;
}

/** Rations in a store, counted as meals. */
export function rationsIn(stock: Stock): number {
  return stock.bread * FOOD.breadRations + stock.fish * FOOD.fishRations + stock.sausage * FOOD.sausageRations;
}

/** Eats one meal from a store; false when there is nothing. Bread first: it is the cheapest. */
function eatOne(stock: Stock): number {
  if (stock.bread > 0) {
    stock.bread -= 1;
    return FOOD.breadRations;
  }
  if (stock.fish > 0) {
    stock.fish -= 1;
    return FOOD.fishRations;
  }
  if (stock.sausage > 0) {
    stock.sausage -= 1;
    return FOOD.sausageRations;
  }
  return 0;
}

/** Anything that eats from a store: a house, or the keep's household and the army. */
interface Eater {
  rationDebt: number;
  starving: boolean;
}

/**
 * Runs down an eater's ration debt against a store; hunger does not pile up as a debt to repay. Works
 * on the eater in place: it runs for every house every step, and a returned pair was garbage each time.
 */
function eat(stock: Stock, eater: Eater): void {
  while (eater.rationDebt >= 1) {
    const meal = eatOne(stock);
    if (meal === 0) {
      eater.rationDebt = 1;
      eater.starving = true;
      return;
    }
    eater.rationDebt -= meal;
    eater.starving = false;
  }
}

/** Rations per second the keep must find: its own household and the army. */
export function keepRationDemandPerSecond(town: Town, soldiers: number): number {
  return (soldiers * FOOD.soldierRationsPerMinute + town.keepResidents * PEOPLE.rationsPerMinute) / 60;
}

function addGold(town: Town, amount: number): void {
  town.made.gold += amount;
  town.goldRemainder += amount;
  const whole = Math.floor(town.goldRemainder);
  town.stock.gold += whole;
  town.goldRemainder -= whole;
}

/** True when an output has piled up to the cap: the yard is full and work stops. */
export function outputFull(b: Building): boolean {
  const recipe = BUILDINGS[b.kind].recipe;
  if (!recipe) return false;
  for (const id of RESOURCE_IDS) if ((recipe.outputs[id] ?? 0) > 0 && b.out[id] + (recipe.outputs[id] ?? 0) > PEOPLE.outputCap) return true;
  return false;
}

function produce(town: Town, b: Building, dtSeconds: number): void {
  const recipe = BUILDINGS[b.kind].recipe;
  if (!recipe || b.paused || b.workRate <= 0) return;
  if (!b.cycleStarted) {
    b.held = ordersFilled(town, recipe.outputs);
    if (b.held || outputFull(b) || !hasInputs(b.inp, recipe.inputs)) return;
    for (const id of RESOURCE_IDS) b.inp[id] -= recipe.inputs[id] ?? 0;
    b.cycleStarted = true;
    b.cycleProgressS = 0;
  }
  b.cycleProgressS += dtSeconds * (LEVEL_SPEED[b.level - 1] as number) * b.workRate * town.productionFactor;
  if (b.cycleProgressS >= recipe.cycleSeconds) {
    for (const id of RESOURCE_IDS) {
      b.out[id] += recipe.outputs[id] ?? 0;
      town.made[id] += recipe.outputs[id] ?? 0;
      fillOrder(town, id, recipe.outputs[id] ?? 0);
    }
    b.cycleStarted = false;
    b.cycleProgressS = 0;
  }
}

/** A house: its people eat from its larder and, fed, pay tax. */
function keepHouse(town: Town, b: Building, dtSeconds: number): void {
  b.rationDebt += ((b.residents * PEOPLE.rationsPerMinute) / 60) * dtSeconds;
  eat(b.inp, b);
  // Wine, while the house has any: drunk slowly, and the household pays more.
  b.hasWine = b.inp.wine > 0;
  if (b.hasWine) {
    b.wineDebt += ((b.residents * WINE.perResidentPerMinute) / 60) * dtSeconds;
    while (b.wineDebt >= 1 && b.inp.wine > 0) {
      b.inp.wine -= 1;
      b.wineDebt -= 1;
    }
  }
  if (!b.starving) addGold(town, b.residents * PEOPLE.taxGoldPerSecond * (b.hasWine ? WINE.taxFactor : 1) * dtSeconds);
}

/** Builders raise a building only as far as the timber and stone on site allow. */
function construct(town: Town, b: Building, plot: number, dtSeconds: number): void {
  if (b.buildersPresent <= 0) return;
  const allowed = b.matTotal === 0 ? 1 : b.matDelivered / b.matTotal;
  const floorS = b.constructionTotalS * (1 - allowed);
  if (b.constructionLeftS <= floorS) return;
  const hands = Math.min(b.buildersPresent, PEOPLE.maxBuildersPerSite);
  b.constructionLeftS = Math.max(floorS, b.constructionLeftS - dtSeconds * hands * town.productionFactor);
  if (b.constructionLeftS <= 0) {
    b.constructionLeftS = 0;
    town.finishedPlots.push(plot);
  }
}

/** One fixed step of a town. `soldiers` is the number of its men alive on the field. */
export function stepEconomy(town: Town, dtSeconds: number, soldiers: number): void {
  if (town.transportUpgradeLeftS > 0) {
    town.transportUpgradeLeftS = Math.max(0, town.transportUpgradeLeftS - dtSeconds * town.productionFactor);
    if (town.transportUpgradeLeftS === 0) {
      town.transportLevel += 1;
      town.finishedPlots.push(-2);
    }
  }
  if (town.keepUpgradeLeftS > 0) {
    town.keepUpgradeLeftS = Math.max(0, town.keepUpgradeLeftS - dtSeconds * town.productionFactor);
    if (town.keepUpgradeLeftS === 0) {
      // The new walls stand: the keep takes more, and what it had taken stays taken.
      const before = keepRules(town).hp;
      town.keepLevel += 1;
      if (town.keepHp > 0) town.keepHp += keepRules(town).hp - before;
      town.finishedPlots.push(-1);
    }
  }
  town.flowS -= dtSeconds;
  if (town.flowS <= 0) {
    town.flowS += FLOW_SAMPLE_S;
    town.flow.push({ made: { ...town.made }, stock: { ...town.stock } });
    if (town.flow.length > FLOW_SAMPLES) town.flow.shift();
  }
  town.rationDebt += keepRationDemandPerSecond(town, soldiers) * dtSeconds;
  eat(town.stock, town);
  addGold(town, TOWN.keepGoldPerSecond * dtSeconds);
  if (!town.starving) addGold(town, town.keepResidents * PEOPLE.taxGoldPerSecond * dtSeconds);
  for (let plot = 0; plot < town.plots.length; plot++) {
    const b = town.plots[plot];
    if (!b) continue;
    if (b.constructionLeftS > 0) {
      construct(town, b, plot, dtSeconds);
      continue;
    }
    if (b.kind === 'house') keepHouse(town, b, dtSeconds);
    else produce(town, b, dtSeconds);
    // Corn grows whether or not anyone is watching.
    for (const strip of b.strips) {
      if (strip.state !== 'growing') continue;
      strip.growth += (dtSeconds / (b.kind === 'vineyard' ? VINES.growSeconds : FIELDS.growSeconds)) * town.productionFactor;
      if (strip.growth >= 1) strip.state = 'ripe';
    }
  }
  const first = town.recruitQueue[0];
  // Militia is armed at the keep; everything else needs a barracks standing.
  if (first && first.arrived >= first.needPeople && (barracksLevel(town) > 0 || UNITS[first.kind].barracksLevel === 0)) {
    first.leftS -= dtSeconds;
    if (first.leftS <= 0) {
      town.recruitQueue.shift();
      if (first.reinforceId !== undefined) town.reinforced.push({ id: first.reinforceId, men: first.men ?? 0, people: first.needPeople });
      else town.trained.push(first.kind);
    }
  }
}

/** Room for people in the town: the keep's household and every finished house. */
export function housingCapacity(town: Town): number {
  let room: number = PEOPLE.keepResidents;
  for (const b of town.plots) if (b && b.kind === 'house' && isBuilt(b)) room += PEOPLE.houseResidents[b.level - 1] as number;
  return room;
}

/** Why a finished building is not working, for the HUD; 'working' if it is. */
export type WorkState = 'working' | 'building' | 'paused' | 'noWorker' | 'noInput' | 'yardFull' | 'noTrees' | 'orderDone' | 'waiting';

export function workState(b: Building): WorkState {
  if (b.constructionLeftS > 0) return 'building';
  if (b.paused) return 'paused';
  if (WORKLESS.has(b.kind)) return 'working';
  if (b.workRate <= 0) return 'noWorker';
  const recipe = BUILDINGS[b.kind].recipe;
  if (!recipe) {
    if (b.kind === 'woodcutter' || b.kind === 'fisher') {
      const good = b.kind === 'woodcutter' ? 'wood' : 'fish';
      if (b.out[good] >= PEOPLE.outputCap) return 'yardFull';
      if (b.held) return 'orderDone';
      if (b.noTrees) return 'noTrees';
    }
    return 'working';
  }
  if (b.cycleStarted) return 'working';
  if (b.held) return 'orderDone';
  if (outputFull(b)) return 'yardFull';
  if (!hasInputs(b.inp, recipe.inputs)) return 'noInput';
  return 'waiting';
}
