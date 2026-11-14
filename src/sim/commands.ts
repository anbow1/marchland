import { ARMY, GATE, PEOPLE, REARM, REINFORCE, ROADS, TOWER, TOWN, UNITS, WALLS } from '../config.ts';
import { barracksLevel, canRecruit, demolish, peopleFor, startBuilding, startKeepUpgrade, startRecruit, startUpgrade, togglePaused } from './economy.ts';
import { cellX, cellZ, gateCells, layGate, layRoad, layWall, roadCells, stampBuilding, wallCells } from './nav.ts';
import { checkSite, doorOfX, doorOfZ, mayLayRoadAt } from './placement.ts';
import { callUp, freePeople } from './people.ts';
import { buildingStands, holdHere } from './movement.ts';
import { type Formation, frontageM, isArcher, type Regiment, type Stance } from './regiment.ts';
import { clampToMap, townX, townZ } from './terrain.ts';
import { type BuildingKind, type CommandResult, type Cost, RESOURCE_IDS, type Side, type UnitKind } from './types.ts';
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
  return Math.max(0, r.initialMen - r.aliveMen - inTowers);
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
  if (menAlive(world, r.side) + queuedMenOf(world, r.side) + missing > ARMY.maxSoldiersPerSide) return 'armyFull';
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
      cmdMove(world, r.id, x + ax * mid - Math.sin(facingRad) * backM, z + az * mid - Math.cos(facingRad) * backM, facingRad, run);
    }
  };
  // With no melee troops the archers form the front line themselves.
  placeRow(front, 0);
  placeRow(rear, front.length > 0 ? SECOND_LINE_M : 0);
  return 'ok';
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
