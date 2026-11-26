import { AI, AI_CHARACTERS, BUILDINGS, MARKET, type AiCharacter, AI_TUNING, DEFENCE, GATE, KEEP_LEVELS, POINTS, REARM, ROADS, TOWER, UNITS } from '../config.ts';
import { squareAt } from './streets.ts';
import { layTrack, pruneTracks, streetLaid, streetPlan, trackCells, trackFor } from './streetNet.ts';
import { cmdAttackBuilding, cmdAttackRegiment, cmdBuild, cmdBuildStreet, streetCost, cmdTrade, cmdBuildGate, cmdBuildWall, cmdGarrison, cmdMove, cmdMoveGroup, cmdRearm, cmdRecruit, cmdReinforce, cmdStance, cmdUpgrade, cmdUpgradeKeep, cmdUpgradeTransport, lotPrice, missingMen, rearmCost, reinforceCost } from './commands.ts';
import { barracksLevel, canAffordBuilding, eraOf, peopleFor, type Town } from './economy.ts';
import { freePeople } from './people.ts';
import { planSite } from './sitePlanner.ts';
import { isArcher, isEngaged, type Regiment } from './regiment.ts';
import { facingToEnemy, frameX, frameZ, rallyX, rallyZ, SIDE_X, SIDE_Z, nearestFoeKeep, townX, townZ } from './terrain.ts';
import { SIDE_COUNT } from './layout.ts';
import { wallCells } from './nav.ts';
import { type BuildingKind, COMPUTER, PLAYER, RESOURCE_IDS, type Side, type UnitKind, type ResourceId } from './types.ts';
import { findRegiment, spawnRegiment, type World } from './world.ts';
import { hypot2 } from '../core/hypot.ts';

// The computer player. It runs a town on the same economy and gives the same
// commands as the human: a build order, a recruiting rota, and an army that
// gathers at home, marches out in waves, forms up before the assault and falls
// back when it has lost too many. No knowledge the player lacks, no free units.

type Mode = 'gather' | 'stage' | 'assault';

export interface AiState {
  side: Side;
  character: AiCharacter;
  /** Clock to the raider's next raid. */
  raidS: number;
  thinkS: number;
  /** Clock to the next look at the places in the middle. */
  pointsS: number;
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
  /** The wall across the enemy's approach has been tried (built, or no ground for it). */
  walled: boolean;
  /** The side its waves march on: chosen as a wave sets out (map of three towns). Absent in old saves. */
  foe?: Side;
}

export function createAiState(side: Side, character: AiCharacter = 'balanced'): AiState {
  return { side, character, raidS: AI_CHARACTERS[character].raidEveryS, thinkS: 0, pointsS: 0, mode: 'gather', wave: 0, sinceWaveS: 0, waveIds: [], waveStartMen: 0, stageS: 0, homeDefending: false, buildIndex: 0, recruitIndex: 0, sinceRecruitS: 0, walled: false };
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
  // Grain piles up behind one mill and one oven while the town goes hungry: a second pair early.
  'windmill',
  'bakery',
  'house',
  'woodcutter',
  // Leather and bows before iron: archers and pikemen both wear leather, and a bow is only timber.
  'barracks',
  'pigFarm',
  'tannery',
  // The pig farm stops when its meat piles up; the butcher turns it into sausage, which feeds the town.
  'butcher',
  'fletcher',
  // A watchtower out in front, manned by archers who stay home: a raid meets arrows before the keep.
  'tower',
  // Stone for the keep's second level, towers and walls: one quarry was never enough.
  'quarry',
  // Timber runs short by the middle of the game (buildings, upgrades, bows, the smithy): a fourth woodcutter.
  'woodcutter',
  'farm',
  'house',
  'ironMine',
  'smelter',
  'smithy',
  'quarry',
  'woodcutter',
  'house',
  'farm',
  'house',
  'farm',
  'house',
  'stable',
  'tower',
  'armourer',
  // Guns for the siege: the foundry casts cannon, and mortars once it is raised a level.
  'foundry',
  'vineyard',
  'winery',
  // A second store once the town has spread: carriers stop walking every sack to the keep.
  'storehouse',
  // Planks for the upgrades that come after the build order (a sawmill earlier only eats scarce timber).
  'sawmill',
  'house',
  'fisher',
  'farm',
  'house',
  'house',
  // A grown town's comforts, last: they cost the early army nothing.
  'chapel',
  'well',
  'market',
  'brewery',
  'tavern',
  'hunter',
  'forester',
];

// The later ages' kinds wait at the end: until the barracks stands at 4 or 5 they are skipped, so the medieval
// rota runs as it always did.
const RECRUIT_ROTA: readonly UnitKind[] = ['pikemen', 'archers', 'pikemen', 'lightCavalry', 'swordsmen', 'crossbowmen', 'halberdiers', 'cannon', 'heavyCavalry', 'archers', 'mortar', 'swordsmen', 'musketeers', 'cuirassiers', 'musketeers', 'dragoons', 'lineInfantry', 'riflemen', 'lineInfantry', 'hussars'];

/**
 * What the computer raises in a later age, first: the age's own arms, the musket (or rifle) and the new horse,
 * with pikes and guns beside them. When none of these can be raised (no muskets yet), the whole rota above.
 */
const AGE_ROTA: readonly (readonly UnitKind[])[] = [
  [],
  ['musketeers', 'pikemen', 'cuirassiers', 'musketeers', 'dragoons', 'halberdiers', 'cannon'],
  ['lineInfantry', 'riflemen', 'lineInfantry', 'hussars', 'cuirassiers', 'cannon'],
];

/** What the computer builds as it enters the later ages (each when its keep allows): the firearms' workshops and the great buildings. */
const AGES_ORDER: readonly BuildingKind[] = ['cathedral', 'gunsmith', 'powderMill', 'townHall', 'manufactory'];

/** Upgrades in the order they pay back for an army. */
const UPGRADE_ORDER: readonly BuildingKind[] = ['barracks', 'house', 'farm', 'windmill', 'bakery', 'smelter', 'pigFarm', 'tannery', 'ironMine', 'smithy', 'armourer', 'foundry', 'stable', 'fletcher', 'butcher', 'woodcutter', 'fisher', 'quarry'];

/** Staging point: this far short of the enemy keep, on the line from home. */
const STAGE_DISTANCE_M = 115;

/** Index in BUILD_ORDER after which the barracks is worth its second level (the weapon chain stands). */
const BARRACKS_UPGRADE_AFTER = BUILD_ORDER.indexOf('smithy') + 1;

/** Builds on the ground the planner picks (its street follows: extendStreets); true when it was built. */
function buildPlanned(world: World, ai: AiState, kind: BuildingKind): 'built' | 'noGround' | 'notYet' {
  const site = planSite(world, ai.side, kind);
  if (!site) return 'noGround';
  if (cmdBuild(world, ai.side, kind, site.x, site.z, site.yawRad) !== 'ok') return 'notYet';
  return 'built';
}

/**
 * The town's streets, a stretch at a time with the stone to spare (AI.roadStoneReserve kept for buildings):
 * the first building on the grid whose street is not laid gets it, from crossing to crossing and joined to the
 * keep through the network (streetNet.ts); the buildings off the grid get a track of trodden earth to the
 * nearest road. Called every think: it waits for nothing and holds nothing up.
 */
/** Seconds between two looks for tracks to tread (on the game clock, so a loaded game does the same). */
const TRACK_EVERY_S = 20;

function extendStreets(world: World, ai: AiState): void {
  const town = world.towns[ai.side];
  const spare = town.stock.stone - AI.roadStoneReserve;
  for (const b of town.plots) {
    if (!b || spare <= 0) break;
    if (streetLaid(world, ai.side, b.x, b.z, b.yawRad)) continue;
    // The nearest street first, even if it waits for stone: the network grows outwards without gaps. (While it
    // waits, the plan comes from streetPlan's memo until the roads or buildings change.)
    const legs = streetPlan(world, ai.side, b.x, b.z, b.yawRad);
    if (!legs) continue;
    const cost = streetCost(world, legs);
    if (cost === 0) continue;
    if (cost <= spare) cmdBuildStreet(world, ai.side, legs);
    break;
  }
  // Every TRACK_EVERY_S of the game: the tracks a building was put across are taken up, and every building off
  // the grid without one gets a track (free: trodden earth) to the nearest street.
  if (Math.floor(world.timeS / TRACK_EVERY_S) === Math.floor((world.timeS - AI.thinkIntervalS) / TRACK_EVERY_S)) return;
  pruneTracks(world);
  for (const b of town.plots) {
    if (!b || squareAt(ai.side, b.x, b.z)) continue;
    const track = trackFor(world, b);
    if (track && trackCells(world, track) > 0) layTrack(world, ai.side, track);
  }
}

/**
 * At the market, when gold runs short: a lot of whatever the town has far too much of (never timber, stone,
 * planks, food or arms it may need) goes for gold, one lot a call.
 */
function sellSurplus(world: World, ai: AiState): boolean {
  const town = world.towns[ai.side];
  if (town.stock.gold >= AI.marketSellBelowGold) return false;
  let best: ResourceId | null = null;
  for (const good of AI.marketSells) if (town.stock[good] >= AI.marketSurplus && (best === null || town.stock[good] > town.stock[best])) best = good;
  return best !== null && cmdTrade(world, ai.side, best, false) === 'ok';
}

/** The later ages are open to the computer: a long game (AI.agesAfterS), or one begun in a later age. */
function agesOpen(world: World): boolean {
  return world.timeS >= AI.agesAfterS || (world.startAge ?? 1) > 1;
}

/**
 * A long game, the chest full: what the keep's next level needs and the workshops never leave in store
 * (planks, iron, timber eaten as fast as they come) is bought at the market, a lot a think.
 */
function buyForKeep(world: World, ai: AiState): boolean {
  const town = world.towns[ai.side];
  const next = KEEP_LEVELS[town.keepLevel];
  if (!next || !agesOpen(world) || town.keepUpgradeLeftS > 0) return false;
  const cost = next.cost as Partial<Record<ResourceId, number>>;
  for (const good of RESOURCE_IDS) {
    if (good === 'gold' || town.stock[good] >= (cost[good] ?? 0)) continue;
    // Never into the gold the keep itself needs.
    if (town.stock.gold - lotPrice(good, true) < (cost.gold ?? 0)) return false;
    return cmdTrade(world, ai.side, good, true) === 'ok';
  }
  return false;
}

/** What the keep's next level costs in gold all told: its own gold and the market price of whatever else is short. */
function keepPriceInGold(town: Town): number {
  const next = KEEP_LEVELS[town.keepLevel];
  if (!next) return 0;
  const cost = next.cost as Partial<Record<ResourceId, number>>;
  let gold = cost.gold ?? 0;
  for (const good of RESOURCE_IDS) {
    if (good === 'gold') continue;
    const short = (cost[good] ?? 0) - town.stock[good];
    if (short > 0) gold += Math.ceil(short / MARKET.lot) * lotPrice(good, true);
  }
  return gold;
}

function runTown(world: World, ai: AiState): void {
  const town = world.towns[ai.side];
  if (sellSurplus(world, ai)) return;
  if (buyForKeep(world, ai)) return;
  extendStreets(world, ai);
  // The wall across the approach, once the keep stands at its second level and the stone is in: it costs no
  // gold and waits for nothing else.
  if (!ai.walled && town.keepLevel >= 2 && town.stock.stone >= AI.wallStone) {
    buildFrontWall(world, ai);
    return;
  }
  // The gate goes in once there is timber for it (the wall alone does not shut the town: it can be walked round).
  if (ai.walled && !world.gates.some((g) => g.side === ai.side) && town.stock.wood >= GATE.cost.wood) {
    const [cx, cz] = frontWallMiddle(ai.side);
    if (cmdBuildGate(world, ai.side, cx, cz) === 'ok') return;
  }
  if (ai.buildIndex >= BARRACKS_UPGRADE_AFTER) {
    // The barracks rises no higher than the keep: the keep first.
    if (town.keepLevel < 2 && town.keepUpgradeLeftS === 0 && cmdUpgradeKeep(world, ai.side) === 'ok') return;
    const plot = town.plots.findIndex((b) => b !== null && b.kind === 'barracks' && b.level === 1 && b.constructionLeftS <= 0);
    if (plot >= 0 && cmdUpgrade(world, ai.side, plot) === 'ok') return;
  }
  // In a later age, once the barracks stands: the musket's workshops, and the barracks up to the keep's level, before
  // the rest of the town (a game begun in a later age is fought with the age's arms).
  if (eraOf(town) >= 2 && town.plots.some((b) => b !== null && b.kind === 'barracks' && b.constructionLeftS <= 0)) {
    for (const kind of ['gunsmith', 'powderMill'] as const) {
      if (!town.plots.some((b) => b !== null && b.kind === kind) && buildPlanned(world, ai, kind) === 'built') return;
    }
    const barracks = town.plots.findIndex((b) => b !== null && b.kind === 'barracks' && b.level < town.keepLevel && b.constructionLeftS <= 0);
    if (barracks >= 0 && cmdUpgrade(world, ai.side, barracks) === 'ok') return;
  }
  const next = BUILD_ORDER[ai.buildIndex];
  if (next !== undefined) {
    // Already standing (a game begun in a later age starts with its barracks): on to the next.
    let wanted = 0;
    for (let k = 0; k <= ai.buildIndex; k++) if (BUILD_ORDER[k] === next) wanted++;
    if (town.plots.filter((b) => b !== null && b.kind === next).length >= wanted) {
      ai.buildIndex += 1;
      return;
    }
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
  if (town.keepLevel < 3 && town.keepUpgradeLeftS === 0 && cmdUpgradeKeep(world, ai.side) === 'ok') return;
  // A long game: into the next ages, their workshops and great buildings, the barracks as high as the keep.
  if (agesOpen(world)) {
    if (town.keepLevel >= 3 && town.keepUpgradeLeftS === 0 && cmdUpgradeKeep(world, ai.side) === 'ok') return;
    for (const kind of AGES_ORDER) {
      const needs = BUILDINGS[kind].keepLevel ?? 1;
      if (town.keepLevel < needs || town.plots.some((b) => b !== null && b.kind === kind)) continue;
      if (buildPlanned(world, ai, kind) === 'built') return;
    }
    const barracks = town.plots.findIndex((b) => b !== null && b.kind === 'barracks' && b.level < town.keepLevel && b.constructionLeftS <= 0);
    if (barracks >= 0 && cmdUpgrade(world, ai.side, barracks) === 'ok') return;
  }
  if (cmdUpgradeTransport(world, ai.side) === 'ok') return;
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

/**
 * One stretch of wall with a gate in its middle across the way the enemy comes, out beyond the town: it
 * does not close the town, but an attack must go round it or break it, and the defenders' archers and
 * towers have the time. The computer's own regiments go out through the gate.
 */
function buildFrontWall(world: World, ai: AiState): void {
  ai.walled = true;
  const [cx, cz] = frontWallMiddle(ai.side);
  const half = AI.wallHalfM;
  // Across the approach: along the side's own cross axis (with two towns the map's, as it always was).
  const ax = SIDE_COUNT === 3 ? frameX(ai.side, 0, 1) : SIDE_X;
  const az = SIDE_COUNT === 3 ? frameZ(ai.side, 0, 1) : SIDE_Z;
  const x0 = cx - ax * half;
  const z0 = cz - az * half;
  const x1 = cx + ax * half;
  const z1 = cz + az * half;
  // Only across open ground: where buildings or water break the line, the stretch is not worth its stone.
  const scratch: number[] = [];
  if (wallCells(world.nav, x0, z0, x1, z1, scratch) < ((half * 2) / ROADS.cellM) * 0.6) return;
  if (cmdBuildWall(world, ai.side, x0, z0, x1, z1) !== 'ok') return;
  cmdBuildGate(world, ai.side, cx, cz);
}

/** The middle of the wall across the approach: out from the keep towards the enemy. */
function frontWallMiddle(side: Side): [number, number] {
  return [townX(side) + frameX(side, AI.wallForwardM, 0), townZ(side) + frameZ(side, AI.wallForwardM, 0)];
}

function recruit(world: World, ai: AiState): void {
  const town = world.towns[ai.side];
  // Saving for the keep's second level (it opens the better barracks): no new regiments while the gold for
  // it is short, unless the town is under attack.
  const next = KEEP_LEVELS[town.keepLevel];
  let regiments = 0;
  for (const r of world.regiments) if (r.side === ai.side && r.aliveMen > 0 && !r.def.defenceOnly) regiments++;
  // The same before a new age (keep 4 and 5): no new regiments while its price is not in the chest.
  const forAge = agesOpen(world) && town.keepLevel >= 3;
  if ((ai.buildIndex >= BARRACKS_UPGRADE_AFTER && town.keepLevel < 2) || forAge) {
    if (next && town.keepUpgradeLeftS === 0 && !ai.homeDefending && regiments >= AI.keepSavingAfterRegiments) {
      // Before a new age, the whole price: what is short of planks, iron and stone is bought with gold.
      const gold = forAge ? keepPriceInGold(town) : ((next.cost as { gold?: number }).gold ?? 0);
      if (town.stock.gold < gold + AI.keepSavingMarginGold) return;
    }
  }
  // Men are not called up while the town would be left without hands to carry for its workshops.
  let buildings = 0;
  for (const b of world.towns[ai.side].plots) if (b) buildings++;
  const handsToKeep = buildings * AI.freeHandsPerBuilding;
  // In a later age, its own arms first (where the barracks and the stores allow).
  const ageRota = AGE_ROTA[eraOf(world.towns[ai.side]) - 1] ?? [];
  for (let k = 0; k < ageRota.length; k++) {
    const kind = ageRota[(ai.recruitIndex + k) % ageRota.length] as UnitKind;
    if (freePeople(world, ai.side) - peopleFor(kind) < handsToKeep) continue;
    if (cmdRecruit(world, ai.side, kind) === 'ok') {
      ai.recruitIndex = (ai.recruitIndex + k + 1) % RECRUIT_ROTA.length;
      ai.sinceRecruitS = 0;
      return;
    }
  }
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
  let score = hypot2(enemy.centreX - r.centreX, enemy.centreZ - r.centreZ);
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
    if (hypot2(enemy.centreX - r.centreX, enemy.centreZ - r.centreZ) > withinM) continue;
    const score = targetScore(r, enemy);
    if (score < bestScore) {
      best = enemy;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Each regiment of `army` attacks the best enemy regiment within `withinM`; with none, and `razeKeep`, it
 * storms the keep of `foe` (by default the enemy keep nearest the army).
 */
export function fight(world: World, army: readonly Regiment[], withinM: number, razeKeep: boolean, foe: Side = nearestFoeKeep((army[0] as Regiment).side, (army[0] as Regiment).centreX, (army[0] as Regiment).centreZ)): void {
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
    if (hypot2(r.centreX - x, r.centreZ - z) < radiusM) return true;
  }
  return false;
}

/** What the computer re-arms its militia as, best first: whichever it has the barracks and the arms for. */
const REARM_PREFERENCE: readonly UnitKind[] = ['lineInfantry', 'musketeers', 'swordsmen', 'pikemen', 'halberdiers', 'crossbowmen', 'archers'];

/**
 * In a later age, what the computer re-arms an older regiment as, best first (only kinds of a later age than its
 * own, and only those REARM.paths allows): the foot take up muskets, the shooters rifles, the horse the new horse.
 */
const MODERNISE: Partial<Record<UnitKind, readonly UnitKind[]>> = {
  pikemen: ['lineInfantry', 'musketeers'],
  swordsmen: ['lineInfantry', 'musketeers'],
  halberdiers: ['lineInfantry', 'musketeers'],
  archers: ['riflemen', 'musketeers'],
  crossbowmen: ['riflemen', 'musketeers'],
  musketeers: ['lineInfantry'],
  lightCavalry: ['hussars', 'dragoons'],
  heavyCavalry: ['cuirassiers', 'hussars'],
  cuirassiers: ['hussars'],
  dragoons: ['hussars'],
};

/** The age a kind belongs to: 1 the middle ages, 2 and 3 the later ones (by the barracks it needs). */
function ageOfKind(kind: UnitKind): number {
  const level = UNITS[kind].barracksLevel;
  return level >= 5 ? 3 : level >= 4 ? 2 : 1;
}

/** Sends a regiment to its barracks to be re-armed as `to`, or re-arms it there; true when it did either. */
function rearmAtBarracks(world: World, town: Town, r: Regiment, to: UnitKind): boolean {
  if (cmdRearm(world, r.id, to) === 'ok') return true;
  const barracks = town.plots.find((b) => b !== null && b.kind === 'barracks' && b.constructionLeftS <= 0);
  if (!barracks) return false;
  return cmdMove(world, r.id, barracks.x + Math.sin(barracks.yawRad) * 16, barracks.z + Math.cos(barracks.yawRad) * 16, null, false) === 'ok';
}

/**
 * In a later age, in quiet times, an older regiment at home (not the militia, rearmGuards has those) takes up the
 * arms of the age when the town has them: one regiment a think, so the army changes over without standing idle.
 */
function modernise(world: World, ai: AiState, home: readonly Regiment[]): void {
  const town = world.towns[ai.side];
  const age = eraOf(town);
  if (age < 2) return;
  for (const r of home) {
    if (r.def.defenceOnly || r.def.engine || r.rearmTo !== null || r.order === 'move' || r.garrisonPlot >= 0) continue;
    if (ageOfKind(r.kind) >= age) continue;
    for (const to of MODERNISE[r.kind] ?? []) {
      if (!REARM.paths[r.kind].includes(to) || ageOfKind(to) <= ageOfKind(r.kind) || barracksLevel(town) < UNITS[to].barracksLevel) continue;
      const cost = rearmCost(r, to);
      if (RESOURCE_IDS.some((id) => town.stock[id] < (cost[id] ?? 0))) continue;
      if (rearmAtBarracks(world, town, r, to)) return;
    }
  }
}

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
      // Re-armed there, or (affordable but not at the barracks) marching there first.
      rearmAtBarracks(world, town, r, to);
      return;
    }
  }
}

/**
 * In quiet times a regiment that has lost a quarter of its men or more (or its captain) is filled up: by
 * the barracks if it stands there, otherwise it marches there first when the town can pay for it.
 */
function reinforceHome(world: World, ai: AiState, home: readonly Regiment[]): void {
  const town = world.towns[ai.side];
  for (const r of home) {
    if (r.def.engine || r.rearmTo !== null || r.order === 'move' || r.garrisonPlot >= 0) continue;
    const missing = missingMen(r);
    if (missing === 0 || (missing < r.initialMen * 0.25 && r.soldiers[0]?.alive)) continue;
    const cost = reinforceCost(r);
    if (RESOURCE_IDS.some((id) => town.stock[id] < (cost[id] ?? 0))) continue;
    const result = cmdReinforce(world, r.id);
    if (result === 'ok') return;
    if (result !== 'notAtBarracks') continue;
    // Militia is filled by the keep: halfway out to the rally point is near enough.
    if (r.def.barracksLevel === 0) cmdMove(world, r.id, (townX(ai.side) + rallyX(ai.side)) / 2, (townZ(ai.side) + rallyZ(ai.side)) / 2, null, false);
    else {
      const barracks = town.plots.find((b) => b !== null && b.kind === 'barracks' && b.constructionLeftS <= 0);
      if (barracks) cmdMove(world, r.id, barracks.x + Math.sin(barracks.yawRad) * 16, barracks.z + Math.cos(barracks.yawRad) * 16, null, false);
    }
    return;
  }
}

/**
 * Sends a regiment to take a place in the middle the side does not hold and no enemy stands by, the
 * nearest of those at home that may march; one at least stays home. It counts as home: the next wave
 * takes it along, and the place stays the side's until the enemy takes it back.
 */
function seizePoints(world: World, ai: AiState, home: readonly Regiment[]): void {
  ai.pointsS -= AI.thinkIntervalS;
  if (ai.pointsS > 0) return;
  ai.pointsS = AI.pointsLookS;
  const free = home.filter((r) => !r.def.defenceOnly && !r.def.engine && r.garrisonPlot < 0);
  if (free.length < 2) return;
  for (const p of world.points) {
    if (p.owner === ai.side) continue;
    // Someone already on the way, or there.
    if (free.some((r) => hypot2(r.destX - p.x, r.destZ - p.z) < POINTS.radiusM * 2)) continue;
    if (enemyWithin(world, ai.side, p.x, p.z, POINTS.clearM * 2)) continue;
    let best: Regiment | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const r of free) {
      const d = hypot2(r.centreX - p.x, r.centreZ - p.z);
      if (d < bestD) {
        best = r;
        bestD = d;
      }
    }
    if (best && cmdMove(world, best.id, p.x, p.z, null, false) === 'ok') return;
  }
}

/**
 * The raider's habit: now and then one regiment (the fastest at home) rides out to burn a building of the
 * enemy's that stands out beyond its town, a farm or a woodcutter's hut, and comes back with the next wave.
 */
function raid(world: World, ai: AiState, home: readonly Regiment[]): void {
  const every = AI_CHARACTERS[ai.character].raidEveryS;
  if (every <= 0) return;
  ai.raidS -= AI.thinkIntervalS;
  if (ai.raidS > 0) return;
  ai.raidS = every;
  const free = home.filter((r) => !r.def.defenceOnly && !r.def.engine && r.garrisonPlot < 0 && r.order !== 'attackBuilding');
  if (free.length < 2) return;
  const raider = free.reduce((a, b) => (b.def.runSpeedMs > a.def.runSpeedMs ? b : a));
  const foe = ai.foe ?? pickFoe(world, ai.side);
  if (foe === null) return;
  const town = world.towns[foe];
  let target = -1;
  let best = Number.POSITIVE_INFINITY;
  town.plots.forEach((b, plot) => {
    if (!b) return;
    const fromKeep = hypot2(b.x - townX(foe), b.z - townZ(foe));
    // Out beyond the town, where help is slow to come.
    if (fromKeep < 60) return;
    const d = hypot2(b.x - raider.centreX, b.z - raider.centreZ);
    if (d < best) {
      best = d;
      target = plot;
    }
  });
  if (target >= 0) cmdAttackBuilding(world, raider.id, foe, target);
}

/** Archers or crossbowmen at home man the side's watchtowers with free places, one regiment a think. */
function manTowers(world: World, ai: AiState, home: readonly Regiment[]): void {
  const town = world.towns[ai.side];
  for (let plot = 0; plot < town.plots.length; plot++) {
    const b = town.plots[plot];
    if (!b || b.kind !== 'tower' || b.constructionLeftS > 0 || b.garrison >= TOWER.maxGarrison) continue;
    for (const r of home) {
      if (r.def.missileRangeM <= 0 || r.def.engine || r.garrisonPlot >= 0) continue;
      if (b.garrisonKind !== null && b.garrisonKind !== r.kind) continue;
      if (cmdGarrison(world, r.id, plot) === 'ok') return;
    }
  }
}

/** True when an enemy regiment of horse is within `radiusM` of a point. */
function horseWithin(world: World, side: Side, x: number, z: number, radiusM: number): boolean {
  for (const r of world.regiments) {
    if (r.side === side || r.aliveMen === 0 || !r.def.cavalry) continue;
    if (hypot2(r.centreX - x, r.centreZ - z) < radiusM) return true;
  }
  return false;
}

/**
 * The computer's use of formations, every think: horse charge in a wedge and stand in a block; pikes form
 * a wall when enemy horse come near, and break it when they are gone; men with shields raise them while
 * arrows fall on them and nobody is at them hand to hand.
 */
export function adjustStances(world: World, side: Side): void {
  for (const r of world.regiments) {
    if (r.side !== side || r.aliveMen === 0 || r.state !== 'formed' || r.def.engine || r.rearmTo !== null) continue;
    if (r.def.cavalry) {
      r.formation = r.order === 'attackRegiment' ? 'wedge' : 'line';
      continue;
    }
    if (r.def.bonusVsCavalry > 0) {
      if (r.stance !== 'pikeWall' && r.order !== 'move' && horseWithin(world, side, r.centreX, r.centreZ, AI.pikeWallAtM)) cmdStance(world, r.id, 'pikeWall');
      else if (r.stance === 'pikeWall' && !horseWithin(world, side, r.centreX, r.centreZ, AI.pikeWallAtM * 1.6)) r.stance = 'normal';
      continue;
    }
    if (r.def.missileBlock > 0) {
      const underFire = r.sinceShotS < AI.shieldsUnderFireS && !isEngaged(r);
      if (underFire && r.stance !== 'shields') cmdStance(world, r.id, 'shields');
      else if (!underFire && r.stance === 'shields') r.stance = 'normal';
    }
  }
}

/** A side still in the game: its town stands. */
function standing(world: World, side: Side): boolean {
  const town = world.towns[side];
  return town !== undefined && !town.absent && town.keepHp > 0;
}

/**
 * Whom a computer's waves march on. With two towns, the other. With three (each against the others): whoever
 * has the most men near its town; else the weaker of the two, by men under arms and a little by distance.
 */
export function pickFoe(world: World, side: Side): Side | null {
  const others = world.towns.map((t) => t.side).filter((s) => s !== side && standing(world, s));
  if (others.length <= 1) return others[0] ?? null;
  const near = new Map<Side, number>();
  const men = new Map<Side, number>();
  for (const r of world.regiments) {
    if (r.side === side || r.aliveMen === 0) continue;
    men.set(r.side, (men.get(r.side) ?? 0) + r.aliveMen);
    if (hypot2(r.centreX - townX(side), r.centreZ - townZ(side)) < AI.defendRadiusM * 2) near.set(r.side, (near.get(r.side) ?? 0) + r.aliveMen);
  }
  let best = others[0] as Side;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const s of others) {
    const threat = near.get(s) ?? 0;
    // Not both on the same one: a side another computer is already marching on counts as that much stronger.
    const taken = world.ais.some((other) => other.side !== side && other.foe === s && other.mode !== 'gather') ? AI.sharedFoeMen : 0;
    const score = threat > 0 ? -threat : (men.get(s) ?? 0) + taken + hypot2(townX(s) - townX(side), townZ(s) - townZ(side)) / 8;
    if (score < bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

function command(world: World, ai: AiState): void {
  adjustStances(world, ai.side);
  const side = ai.side;
  // The foe of the wave out, or (between waves, or once it has fallen) the one it would march on now.
  if (ai.foe === undefined || ai.mode === 'gather' || !standing(world, ai.foe)) {
    const chosen = pickFoe(world, side);
    if (chosen === null) return;
    ai.foe = chosen;
  }
  const foe = ai.foe;
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
    modernise(world, ai, home);
    reinforceHome(world, ai, home);
    manTowers(world, ai, home);
    seizePoints(world, ai, home);
    raid(world, ai, home);
  }

  if (ai.mode === 'gather') {
    const character = AI_CHARACTERS[ai.character];
    const needMen = Math.min(Math.round((tuning.firstWaveMen + ai.wave * tuning.waveGrowthMen) * character.waveMen), 96);
    // Home guards stay behind, so only regiments that may march count towards a wave.
    const marching = home.filter((r) => !r.def.defenceOnly).length;
    if (threatened || marching === 0 || (homeMen < needMen && !(ai.sinceWaveS >= tuning.waveTimeoutS * character.waveWait && marching >= 2))) return;
    ai.mode = 'stage';
    ai.stageS = 0;
    ai.waveIds = home.filter((r) => !r.def.defenceOnly).map((r) => r.id);
    ai.waveStartMen = homeMen;
    const dx = townX(side) - townX(foe);
    const dz = townZ(side) - townZ(foe);
    const d = hypot2(dx, dz);
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
  fight(world, wave, 110, true, foe);
}

/** The defence's clock: when the next wave sets out, how many have, and the regiments now marching. */
export interface DefenceState {
  nextS: number;
  wave: number;
  ids: number[];
  thinkS: number;
}

export function createDefence(): DefenceState {
  return { nextS: DEFENCE.firstWaveS, wave: 0, ids: [], thinkS: 0 };
}

/**
 * The defence: no town builds on the enemy's side; waves form by its keep, each a regiment more every
 * second wave, and march on the player's keep, fighting whatever stands in the way. The player wins by
 * standing until DEFENCE.lengthS.
 */
export function stepDefence(world: World, d: DefenceState, dtSeconds: number): void {
  if (world.winner !== -1) return;
  if (world.timeS >= DEFENCE.lengthS) {
    world.winner = PLAYER;
    world.events.push('gameOver', 0, 0, PLAYER);
    return;
  }
  if (world.timeS >= d.nextS) {
    d.nextS += DEFENCE.waveEveryS;
    const count = DEFENCE.firstWaveRegiments + Math.floor(d.wave / 2);
    for (let i = 0; i < count; i++) {
      const kind = DEFENCE.rota[(d.wave + i) % DEFENCE.rota.length] as UnitKind;
      const across = (i - (count - 1) / 2) * 18;
      const facing = facingToEnemy(COMPUTER);
      const x = rallyX(COMPUTER) + Math.cos(facing) * across;
      const z = rallyZ(COMPUTER) - Math.sin(facing) * across;
      d.ids.push(spawnRegiment(world, COMPUTER, kind, x, z, facing).id);
    }
    d.wave += 1;
    world.events.push('recruited', rallyX(COMPUTER), rallyZ(COMPUTER), COMPUTER);
  }
  d.thinkS -= dtSeconds;
  if (d.thinkS > 0) return;
  d.thinkS = AI.thinkIntervalS;
  const army: Regiment[] = [];
  for (const id of d.ids) {
    const r = findRegiment(world, id);
    if (r && r.aliveMen > 0 && r.state === 'formed') army.push(r);
  }
  d.ids = d.ids.filter((id) => (findRegiment(world, id)?.aliveMen ?? 0) > 0);
  adjustStances(world, COMPUTER);
  if (army.length > 0) fight(world, army, 110, true);
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
