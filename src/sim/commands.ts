import { ARMY, PEOPLE, REARM, ROADS, TOWN, UNITS } from '../config.ts';
import { barracksLevel, canRecruit, demolish, peopleFor, startBuilding, startRecruit, startUpgrade, togglePaused } from './economy.ts';
import { layRoad, roadCells, stampBuilding } from './nav.ts';
import { checkSite } from './placement.ts';
import { callUp, freePeople } from './people.ts';
import { buildingStands, holdHere } from './movement.ts';
import { frontageM, isArcher, type Regiment } from './regiment.ts';
import { clampToMap, townX, townZ } from './terrain.ts';
import { type BuildingKind, type CommandResult, type Cost, RESOURCE_IDS, type Side, type UnitKind } from './types.ts';
import { findRegiment, menAlive, type World } from './world.ts';
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
  for (const [x, z] of [[x0, z0], [x1, z1]] as const) if (hypot2(x - townX(side), z - townZ(side)) > TOWN.territoryRadiusM) return 'tooFar';
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
