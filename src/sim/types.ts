// Shared vocabulary of the simulation. No three.js anywhere under src/sim.

/** 0 = the player, 1 = the computer. */
export type Side = 0 | 1;
export const PLAYER: Side = 0;
export const COMPUTER: Side = 1;

/**
 * "The keep" where a place in a town's list of buildings is expected, and "nowhere". Kept here, with
 * no imports, because people.ts, errands.ts and trades.ts import one another and each needs these
 * while it loads.
 */
export const KEEP = -1;
export const NOWHERE = -2;

export function enemyOf(side: Side): Side {
  return side === PLAYER ? COMPUTER : PLAYER;
}

export const RESOURCE_IDS = [
  'gold',
  'wood',
  'stone',
  'grain',
  'flour',
  'grapes',
  'wine',
  'bread',
  'fish',
  'meat',
  'sausage',
  'hide',
  'leatherArmor',
  'ironOre',
  'iron',
  'weapon',
  'mailArmor',
  'bow',
  'horse',
] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];
export type Stock = Record<ResourceId, number>;
export type Cost = Partial<Record<ResourceId, number>>;

export const BUILDING_KINDS = [
  'house',
  'woodcutter',
  'quarry',
  'farm',
  'fisher',
  'windmill',
  'bakery',
  'pigFarm',
  'butcher',
  'vineyard',
  'winery',
  'tannery',
  'ironMine',
  'smelter',
  'smithy',
  'armourer',
  'fletcher',
  'stable',
  'barracks',
] as const;
export type BuildingKind = (typeof BUILDING_KINDS)[number];

export const UNIT_KINDS = ['militia', 'pikemen', 'archers', 'swordsmen', 'halberdiers', 'crossbowmen', 'lightCavalry', 'heavyCavalry', 'ballista', 'trebuchet'] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];

/** Why a command was refused; 'ok' when it was carried out. The HUD turns these into messages. */
export type CommandResult =
  | 'ok'
  | 'cannotAfford'
  | 'tooFar'
  | 'blocked'
  | 'tooSteep'
  | 'needsForest'
  | 'needsWater'
  | 'needsStone'
  | 'needsOre'
  | 'needsLand'
  | 'townFull'
  | 'noPeople'
  | 'plotEmpty'
  | 'maxLevel'
  | 'underConstruction'
  | 'needsBarracks'
  | 'armyFull'
  | 'queueFull'
  | 'noSuchRegiment'
  | 'routing'
  | 'cannotRearm'
  | 'notAtBarracks'
  | 'inCombat'
  | 'rearming'
  | 'defenceOnly'
  | 'gameOver';

export type Difficulty = 'easy' | 'normal' | 'hard';

/** What a building needs from the land it is put on. */
export type SiteNeed = 'none' | 'forest' | 'water' | 'stone' | 'ore' | 'fields';

export const SITE_NEED: Record<BuildingKind, SiteNeed> = {
  house: 'none',
  woodcutter: 'forest',
  quarry: 'stone',
  farm: 'fields',
  fisher: 'water',
  windmill: 'none',
  bakery: 'none',
  pigFarm: 'none',
  butcher: 'none',
  vineyard: 'fields',
  winery: 'none',
  tannery: 'none',
  ironMine: 'ore',
  smelter: 'none',
  smithy: 'none',
  armourer: 'none',
  fletcher: 'none',
  stable: 'none',
  barracks: 'none',
};
