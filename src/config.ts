import type { BuildingKind, Cost, Difficulty, UnitKind } from './sim/types.ts';

// Every tunable of the game in one place, with units (rules §10). Values marked
// "tuned" were set by playing the headless balance tests in tests/; the rest
// name their source.

export const SIM = {
  /** Fixed logic step (rules §5). */
  stepSeconds: 1 / 60,
  /** More than this per rendered frame and the game slows down instead of spiralling. */
  maxStepsPerFrame: 5,
} as const;

export const MAP = {
  /** Playable square, centred on the origin. */
  sizeM: 400,
  halfM: 200,
  /** Town centres sit on the diagonal, this far from the origin on each axis. */
  townOffsetM: 125,
  /** Ground is level inside this radius of a town centre, then blends into the hills. */
  townFlatRadiusM: 58,
  townBlendRadiusM: 95,
  /** Peak-to-mean height of the hills. Gentle: formations must stay readable. */
  hillHeightM: 6,
  /** No trees inside this radius of a town, nor on the open field between the towns. */
  forestClearRadiusM: 82,
  fieldHalfWidthM: 46,
  terrainSeed: 7,
} as const;

export const TOWN = {
  /** Building plots: an inner ring and an outer ring around the keep. */
  innerPlots: 6,
  innerRadiusM: 24,
  outerPlots: 12,
  outerRadiusM: 44,
  plotCount: 18,
  /** Footprint radius used for clicks, melee reach on buildings and keeping soldiers out. */
  buildingRadiusM: 5.5,
  keepRadiusM: 8,
  keepHp: 1800,
  /** The keep's garrison shoots at enemies this close, one arrow per interval. */
  keepRangeM: 55,
  keepShotIntervalS: 1,
  keepArrowDamage: 9,
  /** Height the keep's archers shoot from. */
  keepTopM: 13,
  /** New regiments form up this far from the keep, towards the middle of the map. */
  rallyDistanceM: 66,
  keepGoldPerSecond: 0.5,
  startingStock: { gold: 320, wood: 80, stone: 30, bread: 30 } as Cost,
} as const;

export interface Recipe {
  inputs: Cost;
  outputs: Cost;
  /** Seconds per cycle at level 1, fed. */
  cycleSeconds: number;
}

export interface BuildingDef {
  cost: Cost;
  buildSeconds: number;
  hp: number;
  /** Rations its workers eat per minute, per level. */
  rationsPerMinute: number;
  recipe: Recipe | null;
}

/** Cycle speed and price by level 1…3 (tuned: level 3 pays back in about four minutes). */
export const LEVEL_SPEED: readonly number[] = [1, 1.6, 2.3];
export const LEVEL_COST: readonly number[] = [1, 1.5, 2.5];
export const MAX_LEVEL = 3;
export const UPGRADE_SECONDS = 15;
/** Share of the price returned when a building is pulled down. */
export const DEMOLISH_REFUND = 0.5;

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  house: { cost: { gold: 40, wood: 10 }, buildSeconds: 10, hp: 250, rationsPerMinute: 2, recipe: { inputs: {}, outputs: { gold: 1 }, cycleSeconds: 2.5 } },
  woodcutter: { cost: { gold: 30 }, buildSeconds: 8, hp: 250, rationsPerMinute: 1, recipe: { inputs: {}, outputs: { wood: 1 }, cycleSeconds: 3 } },
  quarry: { cost: { gold: 40, wood: 10 }, buildSeconds: 10, hp: 300, rationsPerMinute: 1, recipe: { inputs: {}, outputs: { stone: 1 }, cycleSeconds: 6 } },
  farm: { cost: { gold: 40, wood: 10 }, buildSeconds: 10, hp: 250, rationsPerMinute: 1, recipe: { inputs: {}, outputs: { grain: 1 }, cycleSeconds: 5 } },
  bakery: { cost: { gold: 50, wood: 15, stone: 5 }, buildSeconds: 12, hp: 300, rationsPerMinute: 1, recipe: { inputs: { grain: 1 }, outputs: { bread: 1 }, cycleSeconds: 5 } },
  pigFarm: { cost: { gold: 60, wood: 20 }, buildSeconds: 12, hp: 250, rationsPerMinute: 1, recipe: { inputs: { grain: 1 }, outputs: { meat: 2, hide: 1 }, cycleSeconds: 12 } },
  butcher: { cost: { gold: 60, wood: 15, stone: 10 }, buildSeconds: 12, hp: 300, rationsPerMinute: 1, recipe: { inputs: { meat: 1 }, outputs: { sausage: 1 }, cycleSeconds: 5 } },
  tannery: { cost: { gold: 60, wood: 15, stone: 10 }, buildSeconds: 12, hp: 300, rationsPerMinute: 1, recipe: { inputs: { hide: 1 }, outputs: { leatherArmor: 1 }, cycleSeconds: 8 } },
  ironMine: { cost: { gold: 80, wood: 25 }, buildSeconds: 14, hp: 300, rationsPerMinute: 1, recipe: { inputs: {}, outputs: { ironOre: 1 }, cycleSeconds: 6 } },
  smithy: { cost: { gold: 80, wood: 20, stone: 20 }, buildSeconds: 14, hp: 350, rationsPerMinute: 1, recipe: { inputs: { ironOre: 1, wood: 1 }, outputs: { weapon: 1 }, cycleSeconds: 7 } },
  armourer: { cost: { gold: 120, wood: 20, stone: 40 }, buildSeconds: 16, hp: 350, rationsPerMinute: 1, recipe: { inputs: { ironOre: 2 }, outputs: { mailArmor: 1 }, cycleSeconds: 12 } },
  fletcher: { cost: { gold: 60, wood: 20 }, buildSeconds: 12, hp: 250, rationsPerMinute: 1, recipe: { inputs: { wood: 1 }, outputs: { bow: 1 }, cycleSeconds: 8 } },
  stable: { cost: { gold: 100, wood: 40, stone: 10 }, buildSeconds: 14, hp: 300, rationsPerMinute: 1, recipe: { inputs: { grain: 3 }, outputs: { horse: 1 }, cycleSeconds: 25 } },
  barracks: { cost: { gold: 100, wood: 30, stone: 30 }, buildSeconds: 16, hp: 450, rationsPerMinute: 1, recipe: null },
};

export const FOOD = {
  /** One soldier eats this many rations a minute (tuned: 100 men need about two bakeries). */
  soldierRationsPerMinute: 0.25,
  breadRations: 1,
  /** Sausage feeds two: the reason to run pigs through the butcher. */
  sausageRations: 2,
  /** A starving town works at this speed, pays no tax and its soldiers lose this much top morale. */
  starvingSpeedFactor: 0.5,
  starvingMoralePenalty: 25,
} as const;

export interface UnitDef {
  /** Men in a regiment; for siege engines, the number of engines (each with its crew). */
  men: number;
  /** Men abreast in the default formation. */
  files: number;
  fileSpacingM: number;
  rankSpacingM: number;
  cavalry: boolean;
  /** A siege engine: it shoots and can be wrecked, but its crew does not fight hand to hand. */
  engine: boolean;
  /** Barracks level that trains it. */
  barracksLevel: number;
  goldCost: number;
  /** Equipment taken from the stock, per man (per engine). */
  equipment: Cost;
  recruitSeconds: number;
  hp: number;
  attack: number;
  defence: number;
  /** Share of a blow the armour takes, 0…1. */
  armour: number;
  damage: number;
  reachM: number;
  attackIntervalS: number;
  /** Added to attack against mounted men (pikes, halberds). */
  bonusVsCavalry: number;
  /** Added to attack for the first seconds of a charge, and the morale shock to whoever receives it. */
  chargeBonus: number;
  chargeShock: number;
  /** Chance that a shield (or an engine's timbers) stops a missile that would otherwise hit. */
  missileBlock: number;
  /** 0 for melee units. */
  missileRangeM: number;
  /** Nothing closer than this can be shot at (engines cannot depress that far). */
  missileMinRangeM: number;
  missileDamage: number;
  /** Share of the target's armour the missile ignores. */
  missilePierce: number;
  missileSpeedMs: number;
  /** Lobbed on the steep trajectory instead of the flat one. */
  missileHighArc: boolean;
  /** Everyone within this distance of where it lands is hurt; 0 = one man at most. */
  missileSplashM: number;
  /** Damage one missile does to a building. */
  missileSiegeDamage: number;
  reloadS: number;
  morale: number;
  walkSpeedMs: number;
  runSpeedMs: number;
  turnRateRadS: number;
  bodyRadiusM: number;
  /** Gold paid to the enemy for each man of this unit they bring down. */
  bounty: number;
}

// Speeds: a marching man 1.4 m/s, a running armed man about 3 m/s, a horse at
// the trot 3.5–4 and at the gallop 8–11 m/s (common gait figures); an engine
// is dragged at a crawl. Missile speeds: a war arrow 45–55 m/s, a crossbow
// bolt about 60, a torsion engine's bolt 70 (published reconstructions).
// Everything else in this table is game balance, tuned in tests/.
const NO_MISSILE = { missileRangeM: 0, missileMinRangeM: 0, missileDamage: 0, missilePierce: 0, missileSpeedMs: 0, missileHighArc: false, missileSplashM: 0, missileSiegeDamage: 0, reloadS: 0 };
const FOOT = { ...NO_MISSILE, men: 12, files: 6, fileSpacingM: 1.15, rankSpacingM: 1.4, cavalry: false, engine: false, walkSpeedMs: 1.4, turnRateRadS: 1.2, bodyRadiusM: 0.36, recruitSeconds: 10, reachM: 1.6, attackIntervalS: 1.5, bonusVsCavalry: 0, missileBlock: 0 };
const HORSE = { ...NO_MISSILE, men: 8, files: 4, fileSpacingM: 1.9, rankSpacingM: 3.2, cavalry: true, engine: false, walkSpeedMs: 3.6, turnRateRadS: 0.9, bodyRadiusM: 0.75, recruitSeconds: 14, attackIntervalS: 1.5, bonusVsCavalry: 0, missileBlock: 0 };
const ENGINE = { cavalry: false, engine: true, attack: 0, defence: 0, armour: 0, damage: 0, reachM: 0, attackIntervalS: 1, bonusVsCavalry: 0, chargeBonus: 0, chargeShock: 0, turnRateRadS: 0.5, recruitSeconds: 20 };

export const UNITS: Record<UnitKind, UnitDef> = {
  // Townsmen with a shield and a spear: cheap, steady enough behind the shield, quick to run.
  militia: { ...FOOT, barracksLevel: 1, goldCost: 30, equipment: { wood: 1 }, hp: 24, attack: 4, defence: 5, armour: 0, damage: 4, chargeBonus: 1, chargeShock: 1, missileBlock: 0.25, morale: 45, runSpeedMs: 3.1, bounty: 1 },
  // A hedge of pikes: the answer to horsemen, open to arrows.
  pikemen: { ...FOOT, barracksLevel: 1, goldCost: 50, equipment: { weapon: 1, leatherArmor: 1 }, hp: 30, attack: 6, defence: 7, armour: 0.2, damage: 5, reachM: 3.0, bonusVsCavalry: 8, chargeBonus: 1, chargeShock: 2, morale: 60, runSpeedMs: 2.9, bounty: 2 },
  archers: { ...FOOT, barracksLevel: 1, goldCost: 50, equipment: { bow: 1, leatherArmor: 1 }, hp: 24, attack: 3, defence: 3, armour: 0.2, damage: 3, reachM: 1.4, attackIntervalS: 1.6, chargeBonus: 0, chargeShock: 0, missileRangeM: 80, missileDamage: 9, missileSpeedMs: 45, missileSiegeDamage: 1.5, reloadS: 6, morale: 50, runSpeedMs: 3.1, bounty: 2 },
  // Sword, shield and mail: the line that wins a straight fight on foot.
  swordsmen: { ...FOOT, barracksLevel: 2, goldCost: 90, equipment: { weapon: 1, mailArmor: 1 }, hp: 36, attack: 9, defence: 9, armour: 0.4, damage: 7, attackIntervalS: 1.4, chargeBonus: 2, chargeShock: 3, missileBlock: 0.35, morale: 75, runSpeedMs: 2.7, bounty: 3 },
  // Two-handed polearms: hit harder than swords and stop horses, but carry no shield.
  halberdiers: { ...FOOT, barracksLevel: 2, goldCost: 100, equipment: { weapon: 1, mailArmor: 1 }, hp: 34, attack: 10, defence: 6, armour: 0.35, damage: 10, reachM: 2.3, bonusVsCavalry: 5, chargeBonus: 2, chargeShock: 3, morale: 70, runSpeedMs: 2.7, bounty: 3 },
  // Slow to span, flat-shooting, and a bolt goes through mail.
  crossbowmen: { ...FOOT, barracksLevel: 2, goldCost: 80, equipment: { bow: 1, leatherArmor: 1, wood: 1 }, hp: 26, attack: 4, defence: 5, armour: 0.2, damage: 4, reachM: 1.4, chargeBonus: 0, chargeShock: 0, missileBlock: 0.3, missileRangeM: 70, missileDamage: 16, missilePierce: 0.6, missileSpeedMs: 60, missileSiegeDamage: 2, reloadS: 10, morale: 55, runSpeedMs: 2.9, bounty: 3 },
  lightCavalry: { ...HORSE, barracksLevel: 2, goldCost: 100, equipment: { horse: 1, weapon: 1, leatherArmor: 1 }, hp: 40, attack: 7, defence: 5, armour: 0.2, damage: 6, reachM: 1.9, chargeBonus: 8, chargeShock: 9, morale: 65, runSpeedMs: 8.5, bounty: 4 },
  // Knights: the charge that breaks a line.
  heavyCavalry: { ...HORSE, barracksLevel: 3, goldCost: 160, equipment: { horse: 1, weapon: 1, mailArmor: 1 }, hp: 52, attack: 10, defence: 9, armour: 0.45, damage: 8, reachM: 2.1, chargeBonus: 12, chargeShock: 15, morale: 85, runSpeedMs: 7.5, missileBlock: 0.3, bounty: 6 },
  // Two bolt-throwers: long reach, a bolt that ignores armour, helpless once reached.
  ballista: { ...ENGINE, men: 2, files: 2, fileSpacingM: 5, rankSpacingM: 5, barracksLevel: 2, goldCost: 120, equipment: { wood: 12, weapon: 2 }, hp: 70, missileBlock: 0.7, missileRangeM: 110, missileMinRangeM: 12, missileDamage: 45, missilePierce: 0.8, missileSpeedMs: 70, missileHighArc: false, missileSplashM: 0, missileSiegeDamage: 14, reloadS: 9, morale: 55, walkSpeedMs: 0.9, runSpeedMs: 0.9, bodyRadiusM: 1.4, bounty: 8 },
  // One counterweight engine: it lobs stones that scatter a formation and bring down walls.
  trebuchet: { ...ENGINE, men: 1, files: 1, fileSpacingM: 8, rankSpacingM: 8, barracksLevel: 3, goldCost: 200, equipment: { wood: 40, stone: 10 }, hp: 140, missileBlock: 0.8, missileRangeM: 135, missileMinRangeM: 35, missileDamage: 26, missilePierce: 0.5, missileSpeedMs: 45, missileHighArc: true, missileSplashM: 3.5, missileSiegeDamage: 90, reloadS: 14, morale: 60, walkSpeedMs: 0.6, runSpeedMs: 0.6, bodyRadiusM: 2.4, bounty: 15 },
};

export const ARMY = {
  /** 100 a side: 200 soldiers on the field at most (the brief's ceiling). */
  maxSoldiersPerSide: 100,
  maxRecruitQueue: 3,
  /** Soldiers may move this much faster than their regiment to regain their place. */
  catchUpFactor: 1.3,
  footAccelMs2: 6,
  horseAccelMs2: 5,
  /** The regiment waits (at this share of its speed) when its men lag this far behind their places on average. */
  cohesionLagM: 2.5,
  cohesionSlowFactor: 0.35,
  /** A soldier takes on an enemy this close; with an attack order, a little further. */
  engageRadiusM: 5,
  engageRadiusAttackingM: 7,
  /** Shooting archers and men on a move order only fight whoever is this close. */
  selfDefenceRadiusM: 2.5,
  /** …but never strays further than this from his place in the formation. */
  leashM: 8,
  targetSearchIntervalS: 0.2,
  /** Regiments run for the last stretch of an attack. */
  runWithinM: 55,
  /** A regiment in melee turns towards its enemy this slowly: a second attacker keeps a flank for a while. */
  engagedTurnRateRadS: 0.35,
  forestFootSpeedFactor: 0.85,
  forestHorseSpeedFactor: 0.6,
  /** Fallen soldiers sink into the ground and are removed after this long. */
  bodySeconds: 6,
} as const;

export const COMBAT = {
  baseHitChance: 0.22,
  hitChancePerPoint: 0.025,
  minHitChance: 0.1,
  maxHitChance: 0.9,
  /** Added to the chance to hit a man from the side / from behind / while he runs away. */
  flankHitBonus: 0.15,
  rearHitBonus: 0.3,
  routingHitBonus: 0.2,
  /** A man running away defends himself this poorly. */
  routingDefenceFactor: 0.5,
  /** cos of the angle from the target's facing: above = front, below rear = rear, between = flank. */
  frontCos: 0.3,
  rearCos: -0.5,
  chargeSeconds: 4,
  /** A regiment that was at charging speed this recently still charges when its first blow lands. */
  chargeMemoryS: 1.5,
  chargeDamageFactor: 1.5,
  /** A regiment must be moving at this share of its run speed for contact to count as a charge. */
  chargeMinSpeedShare: 0.7,
  /** Spears set against a frontal charge take this share of its bonus and shock. */
  bracedChargeFactor: 0.25,
  damageSpread: 0.2,
  /** Damage to walls per blow, as a share of the unit's damage. */
  siegeDamageFactor: 0.5,
} as const;

export const FATIGUE = {
  /** Seconds of running, or of fighting, that take a fresh regiment to exhaustion (tuned). */
  footRunSecondsToExhaust: 70,
  horseRunSecondsToExhaust: 110,
  meleeSecondsToExhaust: 150,
  /** Seconds to recover fully while marching / while standing. */
  walkSecondsToRecover: 180,
  restSecondsToRecover: 50,
  /** An exhausted regiment loses this much attack and defence, and this share of its run speed. */
  skillPenalty: 3,
  runSpeedLoss: 0.3,
} as const;

export const MORALE = {
  /** Lost per man killed, for a regiment of 12 (scaled for other sizes). */
  casualtyShock: 8.5,
  flankHitShock: 0.5,
  rearHitShock: 1,
  arrowHitShock: 0.6,
  /** To every regiment a trebuchet's stone lands among. */
  stoneShock: 6,
  killBoost: 0.5,
  recoverPerSecond: 1.5,
  /** While running away with no enemy near. */
  routRecoverPerSecond: 4,
  rallyAt: 30,
  /** A friendly regiment breaking within this distance costs morale; an enemy one lifts it. */
  contagionRadiusM: 35,
  friendRoutShock: 6,
  enemyRoutBoost: 5,
  /** Below this share of its first strength a routing regiment never rallies. */
  shatteredShare: 0.25,
  safeFromEnemyM: 22,
} as const;

export const MISSILE = {
  /** The keep's garrison shoots war arrows: about 45–55 m/s off the bow (published longbow tests). */
  arrowSpeedMs: 45,
  gravityMs2: 9.81,
  /** Aim error (standard deviation) at full range, shrinking linearly to a third up close. */
  spreadAtRangeM: 2.2,
  /** An arrow hits a man standing within this distance of where it lands. */
  hitRadiusM: 0.9,
  hitChance: 0.4,
  forestHitFactor: 0.5,
  /** Height the arrow leaves from and arrives at (a man's chest). */
  chestHeightM: 1.3,
  poolSize: 256,
} as const;

export interface AiTuning {
  /** Multiplies the computer's production speed. */
  productionFactor: number;
  /** Men the first attack wave needs, and how many more each later wave asks for. */
  firstWaveMen: number;
  waveGrowthMen: number;
  /** A wave leaves this long after the previous one even if it is below strength (if it has two regiments). */
  waveTimeoutS: number;
}

export const AI_TUNING: Record<Difficulty, AiTuning> = {
  easy: { productionFactor: 0.7, firstWaveMen: 36, waveGrowthMen: 8, waveTimeoutS: 420 },
  normal: { productionFactor: 1, firstWaveMen: 36, waveGrowthMen: 12, waveTimeoutS: 330 },
  hard: { productionFactor: 1.35, firstWaveMen: 48, waveGrowthMen: 16, waveTimeoutS: 260 },
};

export const AI = {
  thinkIntervalS: 1,
  /** The computer turns its whole army on anything that comes this close to its keep. */
  defendRadiusM: 95,
  /** A wave that has lost this share of its men goes home. */
  retreatLossShare: 0.7,
  /** Gold kept back before spending on upgrades. */
  upgradeReserveGold: 220,
} as const;

export const CAMERA = {
  minDistanceM: 25,
  maxDistanceM: 260,
  startDistanceM: 110,
  /** Pitch below the horizon: flatter up close to see the ranks, steeper from afar to read the map. */
  pitchNearRad: 0.68,
  pitchFarRad: 1.08,
  fovDeg: 40,
  /** Pan speed as a share of the camera distance per second. */
  panSpeedPerDistance: 0.9,
  rotateSpeedRadS: 1.4,
  zoomStepFactor: 1.18,
  /** Time constant of the smoothing (s): tuned by hand, feels right at 60 fps. */
  smoothingS: 0.12,
  edgeScrollPx: 14,
} as const;
