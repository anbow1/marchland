import { AI, AI_TUNING, REARM, TOWN, UNITS } from '../config.ts';
import { cmdAttackBuilding, cmdAttackRegiment, cmdBuild, cmdBuildRoad, cmdMove, cmdMoveGroup, cmdRearm, cmdRecruit, cmdUpgrade, rearmCost, roadCost } from './commands.ts';
import { barracksLevel, canAffordBuilding, peopleFor } from './economy.ts';
import { doorX, doorZ, freePeople, KEEP } from './people.ts';
import { planSite } from './sitePlanner.ts';
import { isArcher, type Regiment } from './regiment.ts';
import { facingToEnemy, rallyX, rallyZ, townX, townZ } from './terrain.ts';
import { type BuildingKind, enemyOf, RESOURCE_IDS, type Side, type UnitKind } from './types.ts';
import { findRegiment, type World } from './world.ts';

// The computer player. It runs a town on the same economy and gives the same
// commands as the human: a build order, a recruiting rota, and an army that
// gathers at home, marches out in waves, forms up before the assault and falls
// back when it has lost too many. No knowledge the player lacks, no free units.

type Mode = 'gather' | 'stage' | 'assault';

export interface AiState {
  side: Side;
  thinkS: number;
  mode: Mode;
  wave: number;
  sinceWaveS: number;
  /** Regiments that marched out with the current wave, and the men they set out with. */
  waveIds: number[];
  waveStartMen: number;
  stageS: number;
  /** True while the regiments at home are fighting off an attack on the town. */
  homeDefending: boolean;
  buildIndex: number;
  recruitIndex: number;
  sinceRecruitS: number;
}

export function createAiState(side: Side): AiState {
  return { side, thinkS: 0, mode: 'gather', wave: 0, sinceWaveS: 0, waveIds: [], waveStartMen: 0, stageS: 0, homeDefending: false, buildIndex: 0, recruitIndex: 0, sinceRecruitS: 0 };
}

/**
 * Timber, food and houses first (people are what everything else needs), then the armour and weapon
 * chains, then the luxuries. Each goes where the site planner finds ground for it.
 */
const BUILD_ORDER: readonly BuildingKind[] = [
  'woodcutter',
  'farm',
  'house',
  'quarry',
  'windmill',
  'bakery',
  'woodcutter',
  'house',
  'fisher',
  'farm',
  'house',
  'ironMine',
  'woodcutter',
  'barracks',
  'smelter',
  'smithy',
  'pigFarm',
  'tannery',
  'house',
  'woodcutter',
  'house',
  'farm',
  'windmill',
  'bakery',
  'butcher',
  'fletcher',
  'woodcutter',
  'house',
  'farm',
  'house',
  'stable',
  'armourer',
  'vineyard',
  'winery',
  'house',
  'fisher',
  'farm',
  'house',
  'house',
];

const RECRUIT_ROTA: readonly UnitKind[] = ['pikemen', 'archers', 'pikemen', 'lightCavalry', 'swordsmen', 'crossbowmen', 'halberdiers', 'ballista', 'heavyCavalry', 'archers', 'trebuchet', 'swordsmen'];

/** Upgrades in the order they pay back for an army. */
const UPGRADE_ORDER: readonly BuildingKind[] = ['barracks', 'house', 'farm', 'windmill', 'bakery', 'smelter', 'pigFarm', 'tannery', 'ironMine', 'smithy', 'armourer', 'stable', 'fletcher', 'butcher', 'woodcutter', 'fisher', 'quarry'];

/** Staging point: this far short of the enemy keep, on the line from home. */
const STAGE_DISTANCE_M = 115;

/** Index in BUILD_ORDER after which the barracks is worth its second level (the weapon chain stands). */
const BARRACKS_UPGRADE_AFTER = 18;

/** Builds on the ground the planner picks and lays a road from its door to the keep; true when it was built. */
function buildPlanned(world: World, ai: AiState, kind: BuildingKind): 'built' | 'noGround' | 'notYet' {
  const site = planSite(world, ai.side, kind);
  if (!site) return 'noGround';
  if (cmdBuild(world, ai.side, kind, site.x, site.z, site.yawRad) !== 'ok') return 'notYet';
  const town = world.towns[ai.side];
  // The road is a convenience: it is laid only with stone to spare, or the next building would wait for it.
  const fromX = site.x + Math.sin(site.yawRad) * (TOWN.buildingRadiusM + 1);
  const fromZ = site.z + Math.cos(site.yawRad) * (TOWN.buildingRadiusM + 1);
  if (town.stock.stone - roadCost(world, fromX, fromZ, doorX(town, KEEP), doorZ(town, KEEP)) < AI.roadStoneReserve) return 'built';
  cmdBuildRoad(world, ai.side, site.x + Math.sin(site.yawRad) * (TOWN.buildingRadiusM + 1), site.z + Math.cos(site.yawRad) * (TOWN.buildingRadiusM + 1), doorX(town, KEEP), doorZ(town, KEEP));
  return 'built';
}

function runTown(world: World, ai: AiState): void {
  const town = world.towns[ai.side];
  if (ai.buildIndex >= BARRACKS_UPGRADE_AFTER) {
    const plot = town.plots.findIndex((b) => b !== null && b.kind === 'barracks' && b.level === 1 && b.constructionLeftS <= 0);
    if (plot >= 0 && cmdUpgrade(world, ai.side, plot) === 'ok') return;
  }
  const next = BUILD_ORDER[ai.buildIndex];
  if (next !== undefined) {
    // Built, or no ground left for it: on to the next. Not affordable yet: wait.
    if (buildPlanned(world, ai, next) !== 'notYet') ai.buildIndex += 1;
    return;
  }
  // The order is built (or was, before a raid): rebuild what was razed, then improve.
  for (const kind of BUILD_ORDER) {
    let have = 0;
    let want = 0;
    for (const b of town.plots) if (b && b.kind === kind) have++;
    for (const k of BUILD_ORDER) if (k === kind) want++;
    if (have < want && buildPlanned(world, ai, kind) !== 'noGround') return;
  }
  if (town.stock.gold < AI.upgradeReserveGold) return;
  for (const kind of UPGRADE_ORDER) {
    for (let plot = 0; plot < town.plots.length; plot++) {
      const b = town.plots[plot];
      if (!b || b.kind !== kind || b.level >= 2 + (ai.wave >= 2 ? 1 : 0) || b.constructionLeftS > 0) continue;
      if (!canAffordBuilding(town.stock, kind, b.level + 1)) continue;
      cmdUpgrade(world, ai.side, plot);
      return;
    }
  }
}

function recruit(world: World, ai: AiState): void {
  // Men are not called up while the town would be left without hands to carry for its workshops.
  let buildings = 0;
  for (const b of world.towns[ai.side].plots) if (b) buildings++;
  const handsToKeep = buildings * AI.freeHandsPerBuilding;
  for (let k = 0; k < RECRUIT_ROTA.length; k++) {
    const kind = RECRUIT_ROTA[(ai.recruitIndex + k) % RECRUIT_ROTA.length] as UnitKind;
    if (freePeople(world, ai.side) - peopleFor(kind) < handsToKeep) continue;
    if (cmdRecruit(world, ai.side, kind) === 'ok') {
      ai.recruitIndex = (ai.recruitIndex + k + 1) % RECRUIT_ROTA.length;
      ai.sinceRecruitS = 0;
      return;
    }
  }
  // Nothing better for a long time and gold to spare: call up the militia, as a home guard of a regiment or two.
  let guards = 0;
  for (const r of world.regiments) if (r.side === ai.side && r.aliveMen > 0 && r.def.defenceOnly) guards++;
  for (const order of world.towns[ai.side].recruitQueue) if (UNITS[order.kind].defenceOnly) guards++;
  if (guards >= AI.maxGuardRegiments) return;
  if (ai.sinceRecruitS > 120 && world.towns[ai.side].stock.gold > 180 && cmdRecruit(world, ai.side, 'militia') === 'ok') ai.sinceRecruitS = 0;
}

/** Lower is a better target for `r`. */
function targetScore(r: Regiment, enemy: Regiment): number {
  let score = Math.hypot(enemy.centreX - r.centreX, enemy.centreZ - r.centreZ);
  if (r.def.cavalry) {
    if (isArcher(enemy)) score -= 40;
    if (enemy.def.bonusVsCavalry > 0) score += 35;
    if (enemy.state === 'routing') score -= 15;
  } else {
    if (r.def.bonusVsCavalry > 0 && enemy.def.cavalry) score -= 25;
    // Foot does not chase men who are running away while others still stand.
    if (enemy.state === 'routing') score += 50;
  }
  return score;
}

function bestTarget(world: World, r: Regiment, withinM: number): Regiment | null {
  let best: Regiment | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const enemy of world.regiments) {
    if (enemy.side === r.side || enemy.aliveMen === 0) continue;
    if (Math.hypot(enemy.centreX - r.centreX, enemy.centreZ - r.centreZ) > withinM) continue;
    const score = targetScore(r, enemy);
    if (score < bestScore) {
      best = enemy;
      bestScore = score;
    }
  }
  return best;
}

function fight(world: World, army: readonly Regiment[], withinM: number, razeKeep: boolean): void {
  const foe = enemyOf((army[0] as Regiment).side);
  for (const r of army) {
    const current = r.order === 'attackRegiment' ? findRegiment(world, r.targetRegimentId) : null;
    // Stay on a target that still stands and fights.
    if (current && current.aliveMen > 0 && current.state === 'formed') continue;
    const target = bestTarget(world, r, withinM);
    if (target) cmdAttackRegiment(world, r.id, target.id);
    else if (razeKeep && r.order !== 'attackBuilding') cmdAttackBuilding(world, r.id, foe, -1);
  }
}

function enemyWithin(world: World, side: Side, x: number, z: number, radiusM: number): boolean {
  for (const r of world.regiments) {
    if (r.side === side || r.aliveMen === 0) continue;
    if (Math.hypot(r.centreX - x, r.centreZ - z) < radiusM) return true;
  }
  return false;
}

/** What the computer re-arms its militia as, best first: whichever it has the barracks and the arms for. */
const REARM_PREFERENCE: readonly UnitKind[] = ['swordsmen', 'pikemen', 'halberdiers', 'crossbowmen', 'archers'];

/**
 * In quiet times the militia walks to the barracks and is re-armed there as soon as the town has the
 * arms for it: the computer's levy becomes its army, as the player's can.
 */
function rearmGuards(world: World, ai: AiState, home: readonly Regiment[]): void {
  const town = world.towns[ai.side];
  for (const r of home) {
    if (!r.def.defenceOnly || r.rearmTo !== null || r.order === 'move') continue;
    for (const to of REARM_PREFERENCE) {
      if (!REARM.paths[r.kind].includes(to) || barracksLevel(town) < UNITS[to].barracksLevel) continue;
      const cost = rearmCost(r, to);
      if (RESOURCE_IDS.some((id) => town.stock[id] < (cost[id] ?? 0))) continue;
      if (cmdRearm(world, r.id, to) === 'ok') return;
      // Affordable but not at the barracks: march there first.
      const barracks = town.plots.find((b) => b !== null && b.kind === 'barracks' && b.constructionLeftS <= 0);
      if (barracks) cmdMove(world, r.id, barracks.x + Math.sin(barracks.yawRad) * 16, barracks.z + Math.cos(barracks.yawRad) * 16, null, false);
      return;
    }
  }
}

function command(world: World, ai: AiState): void {
  const side = ai.side;
  const foe = enemyOf(side);
  const tuning = AI_TUNING[world.difficulty];
  // The wave: those of its regiments that still stand in formation. The rest of the army stays home.
  const wave: Regiment[] = [];
  const home: Regiment[] = [];
  let waveMen = 0;
  let homeMen = 0;
  for (const r of world.regiments) {
    if (r.side !== side || r.aliveMen === 0 || r.state !== 'formed') continue;
    if (ai.waveIds.includes(r.id)) {
      wave.push(r);
      waveMen += r.aliveMen;
    } else {
      home.push(r);
      // Home guards defend but never march out with a wave.
      if (!r.def.defenceOnly) homeMen += r.aliveMen;
    }
  }

  // At home: defend the town, otherwise wait in line at the rally point.
  const threatened = enemyWithin(world, side, townX(side), townZ(side), AI.defendRadiusM);
  if (threatened && home.length > 0) {
    ai.homeDefending = true;
    fight(world, home, AI.defendRadiusM + 60, false);
  } else if (ai.homeDefending) {
    ai.homeDefending = false;
    if (home.length > 0) cmdMoveGroup(world, home.map((r) => r.id), rallyX(side), rallyZ(side), facingToEnemy(side), false);
  } else {
    rearmGuards(world, ai, home);
  }

  if (ai.mode === 'gather') {
    const needMen = Math.min(tuning.firstWaveMen + ai.wave * tuning.waveGrowthMen, 96);
    // Home guards stay behind, so only regiments that may march count towards a wave.
    const marching = home.filter((r) => !r.def.defenceOnly).length;
    if (threatened || marching === 0 || (homeMen < needMen && !(ai.sinceWaveS >= tuning.waveTimeoutS && marching >= 2))) return;
    ai.mode = 'stage';
    ai.stageS = 0;
    ai.waveIds = home.filter((r) => !r.def.defenceOnly).map((r) => r.id);
    ai.waveStartMen = homeMen;
    const dx = townX(side) - townX(foe);
    const dz = townZ(side) - townZ(foe);
    const d = Math.hypot(dx, dz);
    cmdMoveGroup(world, ai.waveIds, townX(foe) + (dx / d) * STAGE_DISTANCE_M, townZ(foe) + (dz / d) * STAGE_DISTANCE_M, facingToEnemy(side), false);
    return;
  }

  // Out on campaign: come home when too few are left.
  if (wave.length === 0 || waveMen < ai.waveStartMen * (1 - AI.retreatLossShare)) {
    if (wave.length > 0) cmdMoveGroup(world, wave.map((r) => r.id), rallyX(side), rallyZ(side), facingToEnemy(side), true);
    ai.mode = 'gather';
    ai.wave += 1;
    ai.sinceWaveS = 0;
    ai.waveIds = [];
    return;
  }
  if (ai.mode === 'stage') {
    ai.stageS += AI.thinkIntervalS;
    let arrived = 0;
    let contact = false;
    for (const r of wave) {
      if (r.order === 'hold') arrived++;
      if (enemyWithin(world, side, r.centreX, r.centreZ, 60)) contact = true;
    }
    // Wait for the slow ones, but not for ever, and not once the enemy is upon us.
    if (contact || arrived >= wave.length * 0.8 || ai.stageS > 240) ai.mode = 'assault';
    return;
  }
  fight(world, wave, 110, true);
}

export function stepAi(world: World, ai: AiState, dtSeconds: number): void {
  ai.sinceWaveS += dtSeconds;
  ai.sinceRecruitS += dtSeconds;
  ai.thinkS -= dtSeconds;
  if (ai.thinkS > 0) return;
  ai.thinkS = AI.thinkIntervalS;
  // Soldiers before buildings once there is a barracks: a town with no army loses.
  recruit(world, ai);
  runTown(world, ai);
  command(world, ai);
}
