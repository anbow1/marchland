import { ARMY, CAMPAIGN, GATE, PEOPLE, REARM, REINFORCE, ROADS, TOWER, TOWN, UNITS, WALLS, MARKET } from '../config.ts';
import { barracksLevel, canRecruit, demolish, isBuilt, peopleFor, startBuilding, startKeepUpgrade, startRecruit, startTransportUpgrade, startUpgrade, togglePaused } from './economy.ts';
import { cellX, cellZ, gateCells, layGate, layRoad, layWall, roadCells, stampBuilding, wallCells } from './nav.ts';
import { checkSite, doorOfX, doorOfZ, mayLayRoadAt } from './placement.ts';
import { callUp, freePeople } from './people.ts';
import { buildingStands, holdHere } from './movement.ts';
import { assignSlots, type Formation, frontageM, isArcher, type QueuedOrder, type Regiment, type Stance } from './regiment.ts';
import { clampToMap, townX, townZ } from './terrain.ts';
import { type BuildingKind, type CommandResult, type Cost, type ResourceId, RESOURCE_IDS, type Side, type UnitKind } from './types.ts';
import { findRegiment, menAlive, spawnRegiment, type World } from './world.ts';
import { hypot2 } from '../core/hypot.ts';

// Everything a player can do, human or computer. The HUD and the computer
// player both call these and nothing else, so the two play by the same rules.

/** Builds on free ground: `yawRad` is the way the door looks. Returns why not, or 'ok'. */
export function cmdBuild(world: World, side: Side, kind: BuildingKind, x: number, z: number, yawRad: number): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  const check = checkSite(world, side, kind, x, z, yawRad);
  if (check.result !== 'ok') return check.result;
  startBuilding(world.towns[side], kind, check.site);
  stampBuilding(world.nav, x, z, TOWN.buildingRadiusM, true);
  return 'ok';
}

/**
 * Turns a building that is still going up by `turns` eighths of a circle (its door, its work spot and, for a
 * farm or vineyard, the strips behind it turn with it). Only while it is first being built, and only if it
 * would be allowed to stand that way: the same checks as placing it.
 */
export function cmdTurnSite(world: World, side: Side, plot: number, turns: number): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  const town = world.towns[side];
  const b = town.plots[plot];
  if (!b) return 'plotEmpty';
  if (b.level !== 1 || isBuilt(b)) return 'alreadyBuilt';
  const yawRad = b.yawRad + (turns * Math.PI) / 4;
  // Checked as if it were not there yet.
  town.plots[plot] = null;
  stampBuilding(world.nav, b.x, b.z, TOWN.buildingRadiusM, false);
  const check = checkSite(world, side, b.kind, b.x, b.z, yawRad);
  town.plots[plot] = b;
  stampBuilding(world.nav, b.x, b.z, TOWN.buildingRadiusM, true);
  if (check.result !== 'ok') return check.result;
  b.yawRad = check.site.yawRad;
  b.spotX = check.site.spotX;
  b.spotZ = check.site.spotZ;
  b.strips = check.site.strips.map((s) => ({ state: 'wild', growth: 0, x: s.x, z: s.z }));
  return 'ok';
}

const roadScratch: number[] = [];

/** Stone a road from one point to another would cost now (cells that are already road cost nothing). */
export function roadCost(world: World, x0: number, z0: number, x1: number, z1: number): number {
  return Math.ceil(roadCells(world.nav, x0, z0, x1, z1, roadScratch) * ROADS.stonePerCell);
}

/** Lays a straight road between two points inside a side's reach, paid for in stone. */
export function cmdBuildRoad(world: World, side: Side, x0: number, z0: number, x1: number, z1: number): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  const town = world.towns[side];
  for (const [x, z] of [[x0, z0], [x1, z1]] as const) if (!mayLayRoadAt(side, x, z)) return 'tooFar';
  const cells = roadCells(world.nav, x0, z0, x1, z1, roadScratch);
  const cost = Math.ceil(cells * ROADS.stonePerCell);
  if (town.stock.stone < cost) return 'cannotAfford';
  town.stock.stone -= cost;
  layRoad(world.nav, roadScratch);
  return 'ok';
}

export function cmdUpgrade(world: World, side: Side, plot: number): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  return startUpgrade(world.towns[side], plot);
}

/** Sets how many men a regiment of foot puts in its front rank, from the number of ranks wanted; the block keeps to it as men fall. */
export function cmdRanks(world: World, regimentId: number, ranks: number): CommandResult {
  const r = commandable(world, regimentId);
  if (typeof r === 'string') return r;
  if (r.def.engine || ranks < 1) return 'notThisUnit';
  r.files = Math.max(1, Math.ceil(r.initialMen / ranks));
  if (r.formation === 'wedge') r.formation = 'line';
  return 'ok';
}

/** A block of ranks; a wedge (horse only) for the charge; open order (foot) against arrows. */
export function cmdFormation(world: World, regimentId: number, formation: Formation): CommandResult {
  const r = commandable(world, regimentId);
  if (typeof r === 'string') return r;
  if (r.def.engine) return 'notThisUnit';
  if (formation === 'wedge' && !r.def.cavalry) return 'notThisUnit';
  if (formation === 'loose' && r.def.cavalry) return 'notThisUnit';
  r.formation = formation;
  return 'ok';
}

/** A shield wall (only men who carry shields), a pike wall (only pikemen and halberdiers), or neither. */
export function cmdStance(world: World, regimentId: number, stance: Stance): CommandResult {
  const r = commandable(world, regimentId);
  if (typeof r === 'string') return r;
  if (stance === 'shields' && (r.def.missileBlock <= 0 || r.def.cavalry || r.def.engine)) return 'notThisUnit';
  if (stance === 'pikeWall' && (r.def.bonusVsCavalry <= 0 || r.def.cavalry)) return 'notThisUnit';
  r.stance = stance;
  // A pike wall stands: whatever it was marching to, it stops here.
  if (stance === 'pikeWall') holdHere(r);
  return 'ok';
}

/** Shooters choose their own targets, or shoot only at what they are sent against. */
export function cmdFireAtWill(world: World, regimentId: number, on: boolean): CommandResult {
  const r = commandable(world, regimentId);
  if (typeof r === 'string') return r;
  if (r.def.missileRangeM <= 0) return 'notThisUnit';
  r.fireAtWill = on;
  return 'ok';
}

/** Starts raising the side's keep a level (KEEP_LEVELS). */
export function cmdUpgradeKeep(world: World, side: Side): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  return startKeepUpgrade(world.towns[side]);
}

/** Raises the town's transport a level: handcarts, then horse and wagon. */
export function cmdUpgradeTransport(world: World, side: Side): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  return startTransportUpgrade(world.towns[side]);
}

/** Sets the carriers' priority for a good: 1 high, 0 normal, −1 low. */
export function cmdPriority(world: World, side: Side, good: ResourceId, priority: number): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  const p = Math.max(-1, Math.min(1, Math.round(priority)));
  if (p === 0) delete world.towns[side].priority[good];
  else world.towns[side].priority[good] = p;
  return 'ok';
}

/** Sets which workshops are served first with inputs: 1 high, 0 normal, −1 low. */
export function cmdKindPriority(world: World, side: Side, kind: BuildingKind, priority: number): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  const p = Math.max(-1, Math.min(1, Math.round(priority)));
  if (p === 0) delete world.towns[side].kindPriority[kind];
  else world.towns[side].kindPriority[kind] = p;
  return 'ok';
}

/** Sets how much more of a good to make: null lifts the limit, 0 stops it. */
export function cmdOrder(world: World, side: Side, good: ResourceId, amount: number | null): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  const orders = world.towns[side].orders;
  if (amount === null) delete orders[good];
  else orders[good] = Math.max(0, Math.round(amount));
  return 'ok';
}

/** The goods a regiment's equipment is made of in workshops (timber is felled, not made to order). */
export function orderedGoodsFor(kind: UnitKind): Cost {
  const out: Cost = {};
  const def = UNITS[kind];
  for (const id of RESOURCE_IDS) {
    if (id === 'wood' || id === 'gold') continue;
    const n = (def.equipment[id] ?? 0) * def.men;
    if (n > 0) out[id] = n;
  }
  return out;
}

/** Orders the arms for `count` regiments of a kind: added to what is already ordered (an unlimited good becomes limited). */
export function cmdOrderRegiments(world: World, side: Side, kind: UnitKind, count: number): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  const orders = world.towns[side].orders;
  const goods = orderedGoodsFor(kind);
  for (const id of RESOURCE_IDS) {
    const n = goods[id] ?? 0;
    if (n > 0) orders[id] = (orders[id] ?? 0) + n * count;
  }
  return 'ok';
}

/** True when the side has a finished market. */
export function hasMarket(world: World, side: Side): boolean {
  return world.towns[side].plots.some((b) => b !== null && b.kind === 'market' && isBuilt(b));
}

/** Gold a market lot of `good` fetches when sold, or costs when bought. */
export function lotPrice(good: ResourceId, buying: boolean): number {
  const value = MARKET.value[good] * MARKET.lot;
  return buying ? Math.ceil(value * MARKET.buyShare) : Math.floor(value * MARKET.sellShare);
}

/** Sells (or buys, `buying`) one lot of a good at the market. */
export function cmdTrade(world: World, side: Side, good: ResourceId, buying: boolean): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  if (good === 'gold') return 'notThisUnit';
  if (!hasMarket(world, side)) return 'needsMarket';
  const stock = world.towns[side].stock;
  const price = lotPrice(good, buying);
  if (buying) {
    if (stock.gold < price) return 'cannotAfford';
    stock.gold -= price;
    stock[good] += MARKET.lot;
  } else {
    if (stock[good] < MARKET.lot) return 'cannotAfford';
    stock[good] -= MARKET.lot;
    stock.gold += price;
  }
  return 'ok';
}

export function cmdDemolish(world: World, side: Side, plot: number): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  const b = world.towns[side].plots[plot];
  const result = demolish(world.towns[side], plot);
  if (result === 'ok' && b) stampBuilding(world.nav, b.x, b.z, TOWN.buildingRadiusM, false);
  return result;
}

export function cmdTogglePaused(world: World, side: Side, plot: number): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  return togglePaused(world.towns[side], plot);
}

/** Orders a regiment: it is paid for now, and its people leave their work and walk to the barracks. */
export function cmdRecruit(world: World, side: Side, kind: UnitKind): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  const town = world.towns[side];
  const able = canRecruit(town, kind, menAlive(world, side));
  if (able !== 'ok') return able;
  if (freePeople(world, side) < peopleFor(kind) + PEOPLE.minFreeAfterCallUp) return 'noPeople';
  const result = startRecruit(town, kind, menAlive(world, side));
  if (result === 'ok') callUp(world, side, peopleFor(kind));
  return result;
}

function commandable(world: World, regimentId: number): Regiment | CommandResult {
  if (world.winner !== -1) return 'gameOver';
  const r = findRegiment(world, regimentId);
  if (!r || r.aliveMen === 0) return 'noSuchRegiment';
  if (r.state === 'routing') return 'routing';
  if (r.rearmTo !== null) return 'rearming';
  return r;
}

/** True where a home guard may go: within ARMY.homeGuardRadiusM of its side's keep. */
export function inHomeLand(side: Side, x: number, z: number): boolean {
  return hypot2(x - townX(side), z - townZ(side)) <= ARMY.homeGuardRadiusM;
}

/** What re-arming a regiment as `to` costs now: gold, and the equipment its living men do not already carry. */
export function rearmCost(r: Regiment, to: UnitKind): Cost {
  const from = r.def;
  const target = UNITS[to];
  const cost: Cost = {};
  const gold = Math.max(0, Math.round(((target.goldCost - from.goldCost) * r.aliveMen) / target.men));
  if (gold > 0) cost.gold = gold;
  for (const id of RESOURCE_IDS) {
    const need = Math.max(0, (target.equipment[id] ?? 0) - (from.equipment[id] ?? 0)) * r.aliveMen;
    if (need > 0) cost[id] = need;
  }
  return cost;
}

/** True when the regiment stands within reach of one of its side's barracks. */
function atBarracks(world: World, r: Regiment): boolean {
  for (const b of world.towns[r.side].plots) {
    if (!b || b.kind !== 'barracks' || (b.level === 1 && b.constructionLeftS > 0)) continue;
    if (hypot2(r.centreX - b.x, r.centreZ - b.z) <= REARM.radiusM) return true;
  }
  return false;
}

/** Men a regiment lacks of its full strength (men gone into a tower count as present). */
export function missingMen(r: Regiment): number {
  let inTowers = 0;
  for (const s of r.soldiers) if (!s.alive && s.deadS === 999) inTowers++;
  return Math.max(0, Math.max(r.initialMen, r.maxMen) - r.aliveMen - inTowers);
}

/** What filling a regiment costs: its kind's gold and arms for every new man. */
export function reinforceCost(r: Regiment): Cost {
  const missing = missingMen(r);
  const cost: Cost = {};
  const gold = Math.round((r.def.goldCost * missing) / r.def.men);
  if (gold > 0) cost.gold = gold;
  for (const id of RESOURCE_IDS) {
    const need = (r.def.equipment[id] ?? 0) * missing;
    if (need > 0) cost[id] = need;
  }
  return cost;
}

/** True when the regiment stands where it can take new men: by a barracks, or militia by its keep. */
function atDepot(world: World, r: Regiment): boolean {
  if (r.def.barracksLevel === 0 && hypot2(r.centreX - townX(r.side), r.centreZ - townZ(r.side)) <= REINFORCE.radiusM + TOWN.keepRadiusM) return true;
  for (const b of world.towns[r.side].plots) {
    if (!b || b.kind !== 'barracks' || (b.level === 1 && b.constructionLeftS > 0)) continue;
    if (hypot2(r.centreX - b.x, r.centreZ - b.z) <= REINFORCE.radiusM) return true;
  }
  return false;
}

/** Why a regiment cannot be filled now; 'ok' if it can. */
export function canReinforce(world: World, regimentId: number): CommandResult {
  const r = commandable(world, regimentId);
  if (typeof r === 'string') return r;
  if (r.def.engine) return 'notThisUnit';
  const missing = missingMen(r);
  if (missing === 0) return 'fullStrength';
  const town = world.towns[r.side];
  if (town.recruitQueue.some((o) => o.reinforceId === r.id)) return 'reinforcing';
  if (r.sinceMeleeS < REINFORCE.quietS) return 'inCombat';
  if (barracksLevel(town) < r.def.barracksLevel) return 'needsBarracks';
  if (!atDepot(world, r)) return 'notAtBarracks';
  if (town.recruitQueue.length >= ARMY.maxRecruitQueue) return 'queueFull';
  if (menAlive(world, r.side) + queuedMenOf(world, r.side) + missing > town.armyCap) return 'armyFull';
  const cost = reinforceCost(r);
  for (const id of RESOURCE_IDS) if (town.stock[id] < (cost[id] ?? 0)) return 'cannotAfford';
  if (freePeople(world, r.side) < missing * r.def.crew + PEOPLE.minFreeAfterCallUp) return 'noPeople';
  return 'ok';
}

function queuedMenOf(world: World, side: Side): number {
  let men = 0;
  for (const order of world.towns[side].recruitQueue) men += order.men ?? UNITS[order.kind].men;
  return men;
}

/**
 * Fills a thinned regiment standing by its barracks: the new men are paid for now, leave their work and
 * walk to the barracks, and join after a short training. They dilute the regiment's experience; a fallen
 * captain is replaced by one of them.
 */
export function cmdReinforce(world: World, regimentId: number): CommandResult {
  const able = canReinforce(world, regimentId);
  if (able !== 'ok') return able;
  const r = findRegiment(world, regimentId) as Regiment;
  const town = world.towns[r.side];
  const missing = missingMen(r);
  const cost = reinforceCost(r);
  for (const id of RESOURCE_IDS) town.stock[id] -= cost[id] ?? 0;
  const people = missing * r.def.crew;
  town.recruitQueue.push({ kind: r.kind, leftS: Math.max(REINFORCE.minSeconds, (r.def.recruitSeconds * missing) / r.def.men), needPeople: people, arrived: 0, reinforceId: r.id, men: missing });
  callUp(world, r.side, people);
  return 'ok';
}

/** Why a regiment cannot be re-armed as `to` now; 'ok' if it can. */
export function canRearm(world: World, regimentId: number, to: UnitKind): CommandResult {
  const r = commandable(world, regimentId);
  if (typeof r === 'string') return r;
  if (!REARM.paths[r.kind].includes(to)) return 'cannotRearm';
  if (r.sinceMeleeS < 5) return 'inCombat';
  const town = world.towns[r.side];
  if (barracksLevel(town) < UNITS[to].barracksLevel) return 'needsBarracks';
  if (!atBarracks(world, r)) return 'notAtBarracks';
  const cost = rearmCost(r, to);
  for (const id of RESOURCE_IDS) if (town.stock[id] < (cost[id] ?? 0)) return 'cannotAfford';
  return 'ok';
}

/**
 * Re-arms a regiment standing by its barracks: it keeps its men, their wounds (as a share), fatigue and
 * record, and stands for REARM.seconds while new arms are handed out.
 */
export function cmdRearm(world: World, regimentId: number, to: UnitKind): CommandResult {
  const able = canRearm(world, regimentId, to);
  if (able !== 'ok') return able;
  const r = findRegiment(world, regimentId) as Regiment;
  const town = world.towns[r.side];
  const cost = rearmCost(r, to);
  for (const id of RESOURCE_IDS) town.stock[id] -= cost[id] ?? 0;
  holdHere(r);
  r.rearmTo = to;
  r.rearmLeftS = REARM.seconds;
  return 'ok';
}

/** March (or run) to a point. `facingRad` null keeps the direction of travel as the final facing. */
export function cmdMove(world: World, regimentId: number, x: number, z: number, facingRad: number | null, run: boolean): CommandResult {
  const r = commandable(world, regimentId);
  if (typeof r === 'string') return r;
  // A single order: its own pace again (cmdMoveFormation sets the shared one after).
  r.paceCapMs = 0;
  // Marching off or charging breaks a pike wall.
  if (r.stance === 'pikeWall') r.stance = 'normal';
  if (r.def.defenceOnly && !inHomeLand(r.side, x, z)) return 'defenceOnly';
  r.order = 'move';
  r.destX = clampToMap(x);
  r.destZ = clampToMap(z);
  const travelFacing = Math.atan2(r.destX - r.anchorX, r.destZ - r.anchorZ);
  r.destFacingRad = facingRad ?? travelFacing;
  r.targetRegimentId = -1;
  r.run = run;
  return 'ok';
}

/**
 * March or run: at once for a regiment on the move, and for the order it is on. Engines only march.
 * (An attack still closes at the run whatever the pace; see movement.ts.)
 */
export function cmdPace(world: World, regimentId: number, run: boolean): CommandResult {
  const r = commandable(world, regimentId);
  if (typeof r === 'string') return r;
  if (run && r.def.engine) return 'notThisUnit';
  r.run = run;
  return 'ok';
}

/** Why `fromId` cannot join `intoId` now; 'ok' if it can. */
export function canMerge(world: World, intoId: number, fromId: number): CommandResult {
  const into = commandable(world, intoId);
  if (typeof into === 'string') return into;
  const from = commandable(world, fromId);
  if (typeof from === 'string') return from;
  if (into.id === from.id || into.side !== from.side || into.kind !== from.kind || into.def.engine) return 'notThisUnit';
  if (into.rearmTo !== null || from.rearmTo !== null) return 'notThisUnit';
  if (into.sinceMeleeS < REINFORCE.quietS || from.sinceMeleeS < REINFORCE.quietS) return 'inCombat';
  if (into.aliveMen >= into.maxMen) return 'fullStrength';
  if (hypot2(into.centreX - from.centreX, into.centreZ - from.centreZ) > CAMPAIGN.mergeRadiusM) return 'tooFar';
  return 'ok';
}

/**
 * Two regiments of a kind become one: men of `fromId` join `intoId` up to its full strength (its places
 * grown as needed); any left over stay in `fromId`. Experience, morale and weariness are shared by the men.
 */
export function cmdMerge(world: World, intoId: number, fromId: number): CommandResult {
  const able = canMerge(world, intoId, fromId);
  if (able !== 'ok') return able;
  const into = findRegiment(world, intoId) as Regiment;
  const from = findRegiment(world, fromId) as Regiment;
  const before = into.aliveMen;
  let moved = 0;
  // The captain of the regiment that gives men goes last: he stays with what is left of it.
  const giving = from.soldiers.filter((s) => s.alive).sort((a, b) => Number(a === from.soldiers[0]) - Number(b === from.soldiers[0]));
  for (const s of giving) {
    if (into.aliveMen >= into.maxMen) break;
    const place = into.soldiers.findIndex((t) => !t.alive && t.deadS !== 999);
    s.regiment = into;
    if (place >= 0) into.soldiers[place] = s;
    else into.soldiers.push(s);
    from.soldiers.splice(from.soldiers.indexOf(s), 1);
    from.aliveMen -= 1;
    into.aliveMen += 1;
    moved += 1;
  }
  into.initialMen = Math.max(into.initialMen, into.soldiers.length);
  const total = before + moved;
  into.xp = (into.xp * before + from.xp * moved) / total;
  into.morale = (into.morale * before + from.morale * moved) / total;
  into.fatigue = Math.max(into.fatigue, from.fatigue);
  assignSlots(into);
  if (from.aliveMen > 0) assignSlots(from);
  else from.order = 'hold';
  world.events.push('reinforced', into.centreX, into.centreZ, into.side);
  return 'ok';
}

export function cmdAttackRegiment(world: World, regimentId: number, targetId: number): CommandResult {
  const r = commandable(world, regimentId);
  if (typeof r === 'string') return r;
  // Marching off or charging breaks a pike wall.
  if (r.stance === 'pikeWall') r.stance = 'normal';
  const target = findRegiment(world, targetId);
  if (!target || target.aliveMen === 0 || target.side === r.side) return 'noSuchRegiment';
  if (r.def.defenceOnly && !inHomeLand(r.side, target.centreX, target.centreZ)) return 'defenceOnly';
  r.order = 'attackRegiment';
  r.targetRegimentId = targetId;
  r.run = false;
  return 'ok';
}

/** Attack a building of `targetSide`; plot -1 is the keep. */
export function cmdAttackBuilding(world: World, regimentId: number, targetSide: Side, plot: number): CommandResult {
  const r = commandable(world, regimentId);
  if (typeof r === 'string') return r;
  // Marching off or charging breaks a pike wall.
  if (r.stance === 'pikeWall') r.stance = 'normal';
  if (targetSide === r.side || !buildingStands(world, targetSide, plot)) return 'plotEmpty';
  // A home guard does not go raiding.
  if (r.def.defenceOnly) return 'defenceOnly';
  r.order = 'attackBuilding';
  r.targetSide = targetSide;
  r.targetPlot = plot;
  r.targetRegimentId = -1;
  r.run = false;
  return 'ok';
}

export function cmdHalt(world: World, regimentId: number): CommandResult {
  const r = commandable(world, regimentId);
  if (typeof r === 'string') return r;
  holdHere(r);
  // Halt means halt: whatever was queued is forgotten too.
  r.queue.length = 0;
  return 'ok';
}

/** Gap between neighbouring regiments in a battle line, and how far back the archers stand. */
const LINE_GAP_M = 3.5;
const SECOND_LINE_M = 9;

/**
 * Sends several regiments to one place as a battle line facing `facingRad`: melee troops abreast in
 * front, archers abreast behind them. Left-to-right order follows where they stand now, so they do
 * not cross on the way.
 */
export function cmdMoveGroup(world: World, regimentIds: readonly number[], x: number, z: number, facingRad: number, run: boolean): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  const result = groupLineSpots(world, regimentIds, x, z, facingRad, lineScratch);
  if (result !== 'ok') return result;
  for (let i = 0; i < lineScratch.length; i += 4) cmdMove(world, lineScratch[i] as number, lineScratch[i + 1] as number, lineScratch[i + 2] as number, facingRad, run);
  return 'ok';
}

const lineScratch: number[] = [];

/**
 * Where a group order puts each regiment: one line, the shooters in a second line behind (or in front when
 * there is no one else), each row ordered as the regiments stand now. Writes id, x, z, frontage per regiment.
 */
export function groupLineSpots(world: World, regimentIds: readonly number[], x: number, z: number, facingRad: number, out: number[]): CommandResult {
  out.length = 0;
  const front: Regiment[] = [];
  const rear: Regiment[] = [];
  let guardsLeft = 0;
  for (const id of regimentIds) {
    const r = findRegiment(world, id);
    if (!r || r.aliveMen === 0 || r.state === 'routing') continue;
    // Home guards stay behind when the line goes beyond the town's land; the rest march.
    if (r.def.defenceOnly && !inHomeLand(r.side, x, z)) {
      guardsLeft++;
      continue;
    }
    (isArcher(r) ? rear : front).push(r);
  }
  if (front.length + rear.length === 0) return guardsLeft > 0 ? 'defenceOnly' : 'noSuchRegiment';
  // File axis of the new line: (cos f, −sin f).
  const ax = Math.cos(facingRad);
  const az = -Math.sin(facingRad);
  const lateral = (r: Regiment): number => r.centreX * ax + r.centreZ * az;
  const placeRow = (row: Regiment[], backM: number): void => {
    row.sort((a, b) => lateral(a) - lateral(b));
    let total = -LINE_GAP_M;
    for (const r of row) total += frontageM(r) + LINE_GAP_M;
    let cursor = -total / 2;
    for (const r of row) {
      const mid = cursor + frontageM(r) / 2;
      cursor += frontageM(r) + LINE_GAP_M;
      out.push(r.id, x + ax * mid - Math.sin(facingRad) * backM, z + az * mid - Math.cos(facingRad) * backM, frontageM(r));
    }
  };
  // With no melee troops the archers form the front line themselves.
  placeRow(front, 0);
  placeRow(rear, front.length > 0 ? SECOND_LINE_M : 0);
  return 'ok';
}

/** A regiment's place in a kept formation: metres to the right of and behind its reference point, and its turn from the formation's facing. */
export interface FormationPlace {
  id: number;
  right: number;
  back: number;
  turnRad: number;
}

/**
 * Where each regiment of a kept formation stands when its reference point is at (x, z) facing `facingRad`:
 * the same shape, turned. Writes x, z, facing per place into `out`.
 */
export function formationSpots(places: readonly FormationPlace[], x: number, z: number, facingRad: number, out: number[]): void {
  out.length = 0;
  const rx = Math.cos(facingRad);
  const rz = -Math.sin(facingRad);
  const fx = Math.sin(facingRad);
  const fz = Math.cos(facingRad);
  for (const p of places) out.push(x + rx * p.right - fx * p.back, z + rz * p.right - fz * p.back, facingRad + p.turnRad);
}

/** The shape several regiments stand in now, as places about their middle and their mean facing (the facing is returned). */
export function captureFormation(world: World, regimentIds: readonly number[], out: FormationPlace[]): number {
  out.length = 0;
  const regs = regimentIds.map((id) => findRegiment(world, id)).filter((r): r is Regiment => r !== null && r.aliveMen > 0);
  if (regs.length === 0) return 0;
  let cx = 0;
  let cz = 0;
  let sx = 0;
  let sz = 0;
  for (const r of regs) {
    cx += r.anchorX;
    cz += r.anchorZ;
    sx += Math.sin(r.facingRad);
    sz += Math.cos(r.facingRad);
  }
  cx /= regs.length;
  cz /= regs.length;
  const facing = Math.atan2(sx, sz);
  const rx = Math.cos(facing);
  const rz = -Math.sin(facing);
  const fx = Math.sin(facing);
  const fz = Math.cos(facing);
  for (const r of regs) {
    const dx = r.anchorX - cx;
    const dz = r.anchorZ - cz;
    let turn = r.facingRad - facing;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    out.push({ id: r.id, right: dx * rx + dz * rz, back: -(dx * fx + dz * fz), turnRad: turn });
  }
  return facing;
}

/** Moves a kept formation: every regiment to its place in the same shape, all at the pace of the slowest. */
export function cmdMoveFormation(world: World, places: readonly FormationPlace[], x: number, z: number, facingRad: number, run: boolean): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  const spots: number[] = [];
  formationSpots(places, x, z, facingRad, spots);
  const moved: Regiment[] = [];
  let last: CommandResult = 'noSuchRegiment';
  places.forEach((p, i) => {
    const result = cmdMove(world, p.id, spots[i * 3] as number, spots[i * 3 + 1] as number, spots[i * 3 + 2] as number, run);
    if (result === 'ok') moved.push(findRegiment(world, p.id) as Regiment);
    else last = result;
  });
  if (moved.length === 0) return last;
  let pace = Number.POSITIVE_INFINITY;
  for (const r of moved) pace = Math.min(pace, run ? r.def.runSpeedMs : r.def.walkSpeedMs);
  if (moved.length > 1) for (const r of moved) r.paceCapMs = pace;
  return 'ok';
}

/** Carries out a queued order now, through the same commands as one given at once. */
export function runQueued(world: World, regimentId: number, q: QueuedOrder): CommandResult {
  if (q.kind === 'move') return cmdMove(world, regimentId, q.x, q.z, q.facingRad, q.run);
  if (q.kind === 'attackRegiment') return cmdAttackRegiment(world, regimentId, q.targetId);
  return cmdAttackBuilding(world, regimentId, q.side, q.plot);
}

/** True while a regiment has nothing in hand: standing, not fighting, nothing being re-armed. */
function idle(r: Regiment): boolean {
  return r.order === 'hold' && r.state === 'formed' && r.rearmTo === null;
}

/** Adds an order to the end of a regiment's queue (Shift); a regiment with nothing to do starts on it at once. */
export function cmdQueue(world: World, regimentId: number, q: QueuedOrder): CommandResult {
  const r = commandable(world, regimentId);
  if (typeof r === 'string') return r;
  if (r.queue.length >= ARMY.maxQueuedOrders) return 'queueFull';
  if (idle(r) && r.queue.length === 0) return runQueued(world, regimentId, q);
  r.queue.push(q);
  return 'ok';
}

/** Forgets a regiment's queued orders (an order given without Shift replaces them). */
export function cmdClearQueue(world: World, regimentId: number): void {
  const r = findRegiment(world, regimentId);
  if (r) r.queue.length = 0;
}

/** Once a step: a regiment that has finished its order takes the next from its queue (one it can no longer carry out is dropped). */
export function stepQueues(world: World): void {
  for (const r of world.regiments) {
    if (r.queue.length === 0 || r.aliveMen === 0) continue;
    if (r.state !== 'formed') {
      // A rout ends every plan.
      r.queue.length = 0;
      continue;
    }
    // An attack in a plan is done when its target breaks and runs: on to the next order, no chase.
    const chasing = r.order === 'attackRegiment' && (findRegiment(world, r.targetRegimentId)?.state ?? 'routing') === 'routing';
    if (!idle(r) && !chasing) continue;
    while (r.queue.length > 0) {
      const next = r.queue.shift() as QueuedOrder;
      if (runQueued(world, r.id, next) === 'ok') break;
    }
  }
}

const wallScratch: number[] = [];

/** Stone a wall from one point to another would cost now. */
export function wallCost(world: World, x0: number, z0: number, x1: number, z1: number): number {
  return wallCells(world.nav, x0, z0, x1, z1, wallScratch) * WALLS.stonePerCell;
}

/** Builds a straight wall between two points, paid for in stone. Leave a gap for a gate. */
export function cmdBuildWall(world: World, side: Side, x0: number, z0: number, x1: number, z1: number): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  for (const [x, z] of [[x0, z0], [x1, z1]] as const) if (!mayLayRoadAt(side, x, z)) return 'tooFar';
  const cells = wallCells(world.nav, x0, z0, x1, z1, wallScratch);
  const town = world.towns[side];
  if (town.stock.stone < cells * WALLS.stonePerCell) return 'cannotAfford';
  town.stock.stone -= cells * WALLS.stonePerCell;
  layWall(world.nav, wallScratch, side, x0, z0, x1, z1, WALLS.hp);
  return 'ok';
}

const gateScratch: number[] = [];

/**
 * Sets a gate into the side's own wall at (x, z): GATE.cells of a straight stretch become a gate their
 * side's people and soldiers pass through, and the enemy must break.
 */
export function cmdBuildGate(world: World, side: Side, x: number, z: number): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  if (gateCells(world.nav, x, z, side, GATE.cells, gateScratch) < GATE.cells) return 'needsWall';
  const town = world.towns[side];
  if (town.stock.wood < GATE.cost.wood || town.stock.stone < GATE.cost.stone) return 'cannotAfford';
  town.stock.wood -= GATE.cost.wood;
  town.stock.stone -= GATE.cost.stone;
  const middle = gateScratch[(GATE.cells - 1) >> 1] as number;
  world.gates.push({ side, cells: [...gateScratch], x: cellX(middle), z: cellZ(middle), dir: world.nav.wallDir[middle] as number });
  layGate(world.nav, gateScratch, GATE.hp);
  return 'ok';
}

/** Sends archers or crossbowmen to man one of their side's watchtowers; up to its free places go in. */
export function cmdGarrison(world: World, regimentId: number, plot: number): CommandResult {
  const r = commandable(world, regimentId);
  if (typeof r === 'string') return r;
  const b = plot >= 0 ? world.towns[r.side].plots[plot] : null;
  if (!b || b.kind !== 'tower' || b.constructionLeftS > 0) return 'cannotGarrison';
  if (r.def.missileRangeM <= 0 || r.def.engine || (b.garrisonKind !== null && b.garrisonKind !== r.kind)) return 'cannotGarrison';
  if (b.garrison >= TOWER.maxGarrison) return 'towerFull';
  const result = cmdMove(world, r.id, doorOfX(b), doorOfZ(b), null, false);
  if (result !== 'ok') return result;
  r.garrisonPlot = plot;
  return 'ok';
}

/** Brings a tower's garrison out as a small regiment before its door. */
export function cmdUngarrison(world: World, side: Side, plot: number): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  const b = plot >= 0 ? world.towns[side].plots[plot] : null;
  if (!b || b.kind !== 'tower' || b.garrison === 0 || b.garrisonKind === null) return 'plotEmpty';
  const r = spawnRegiment(world, side, b.garrisonKind, doorOfX(b), doorOfZ(b), b.yawRad);
  r.soldiers.forEach((s, i) => {
    if (i < b.garrison) return;
    s.alive = false;
    s.deadS = 999;
  });
  r.aliveMen = b.garrison;
  r.initialMen = b.garrison;
  b.garrison = 0;
  b.garrisonKind = null;
  return 'ok';
}
