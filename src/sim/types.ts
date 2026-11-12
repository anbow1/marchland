// Shared vocabulary of the simulation. No three.js anywhere under src/sim.

/** 0 = the player, 1 = the computer. */
export type Side = 0 | 1;
export const PLAYER: Side = 0;
export const COMPUTER: Side = 1;

export function enemyOf(side: Side): Side {
  return side === PLAYER ? COMPUTER : PLAYER;
}

export const RESOURCE_IDS = [
  'gold',
  'wood',
  'stone',
  'grain',
  'bread',
  'meat',
  'sausage',
  'hide',
  'leatherArmor',
  'ironOre',
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
  'bakery',
  'pigFarm',
  'butcher',
  'tannery',
  'ironMine',
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
  | 'plotTaken'
  | 'plotEmpty'
  | 'maxLevel'
  | 'underConstruction'
  | 'needsBarracks'
  | 'armyFull'
  | 'queueFull'
  | 'noSuchRegiment'
  | 'routing'
  | 'gameOver';

export type Difficulty = 'easy' | 'normal' | 'hard';
