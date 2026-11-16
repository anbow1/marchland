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
  sizeM: 560,
  halfM: 280,
  /** Town centres sit on the diagonal, this far from the origin on each axis (the first place a keep may stand). */
  townOffsetM: 232,
  /**
   * The places the player's keep may stand, (x, z), one picked before the game (src/sim/layout.ts): in
   * the south-west corner, up the west edge, along the south edge. The computer's is always the same
   * place turned half a circle about the middle.
   */
  startSites: [
    [-232, 232],
    [-236, 140],
    [-140, 236],
  ],
  /** Ground is level inside this radius of a keep, then blends into the hills. */
  townFlatRadiusM: 26,
  townBlendRadiusM: 85,
  /** Peak-to-mean height of the rolling hills, of the finer folds on them, and of the two knolls that flank the field. */
  hillHeightM: 13,
  foldHeightM: 2.2,
  knollHeightM: 15,
  knollRadiusM: 48,
  /** The knolls stand this far to either side of the map's middle. */
  knollOffsetM: 105,
  /** The hills are this much lower on the open field between the towns, where the lines meet. */
  fieldReliefFactor: 0.5,
  /** No trees inside this radius of a town, nor on the open field between the towns. */
  forestClearRadiusM: 66,
  /** The road through the forest (map layout 'forest'): the clearing round each town, and half the width of the ride between them. */
  forestLayoutClearingM: 105,
  /**
   * The crossing (map layout 'river'): a river across the middle, bending this far either side of the
   * line between the knolls, this wide and this deep, with banks this wide; a causeway in the middle and a
   * ford on each knoll's line, this wide along the river, the ford's water this shallow.
   */
  riverBendM: 22,
  riverHalfWidthM: 8,
  riverDepthM: 2.4,
  riverBankM: 22,
  crossingHalfM: 10,
  fordDepthM: 0.25,
  forestRideHalfWidthM: 12,
  fieldHalfWidthM: 46,
  terrainSeed: 7,
  /**
   * The two grey massifs on the flanks, in the corners the towns do not hold: centred this far out on
   * each axis, this wide and this high. Their foothills can be climbed; inside `blockShare` of their
   * radius the rock is sheer, and no one walks, builds or lays a road there.
   */
  mountainOffsetM: 215,
  mountainRadiusM: 92,
  mountainHeightM: 80,
  mountainBlockShare: 0.7,
  /** Rocky crags on the flanks of the field, natural obstacles an army must go round. */
  cragRadiusM: 17,
  cragHeightM: 16,
  cragBlockShare: 0.85,
  /** Where the crags stand, as (forward, side) from the map's middle in the player's axes; the list is its own half-turn. */
  crags: [
    [-70, 150],
    [70, -150],
    [-75, -155],
    [75, 155],
  ],
} as const;

export const TOWN = {
  /** Buildings a side may have at once. */
  maxBuildings: 64,
  /** A side builds within this distance of its own keep, and no nearer than this to the enemy's. */
  territoryRadiusM: 280,
  /** Besides the keep's circle, a side may build this near any of its own finished buildings: the town grows outward. */
  buildingReachM: 70,
  /** Farms and vineyards may go this far: the farmers walk further out to open land. Woodcutters, quarries and mines may go anywhere. */
  fieldTerritoryRadiusM: 340,
  enemyKeepClearM: 90,
  /** Free ground kept between two buildings' footprints. */
  buildingGapM: 1.5,
  /** The building grid's spacing (a multiple of the road cell): a building per cell leaves room for a street between rows. */
  gridM: 16,
  /** A building needs ground this level: the most its footprint may rise from its lowest to its highest point. */
  maxFootprintRiseM: 2.2,
  /** How near a woodcutter must be to trees, a fisher to water, a quarry or mine to its rock. */
  forestReachM: 26,
  waterReachM: 16,
  depositReachM: 15,
  /** The lakes: each side's lies this far from its keep (towards the enemy, and to one side), with this radius and depth. */
  lakeForwardM: 70,
  lakeSideM: 62,
  lakeRadiusM: 27,
  lakeDepthM: 2.4,
  /** Outcrops of building stone and of iron ore: radius of each. */
  depositRadiusM: 9,
  /** Footprint radius used for clicks, melee reach on buildings and keeping soldiers out. */
  buildingRadiusM: 5.5,
  keepRadiusM: 11,
  keepHp: 1800,
  /** The keep's garrison shoots at enemies this close, one arrow per interval. */
  keepRangeM: 55,
  keepShotIntervalS: 1,
  keepArrowDamage: 9,
  /** Height the keep's archers shoot from. */
  keepTopM: 13,
  /** Men who have run from a fight gather this far from their keep. */
  refugeRadiusM: 56,
  /** New regiments form up this far from the keep, towards the middle of the map. */
  rallyDistanceM: 66,
  keepGoldPerSecond: 0.4,
  startingStock: { gold: 340, wood: 90, stone: 40, bread: 40 } as Cost,
} as const;

export const PEOPLE = {
  /** The keep's own household: the people a game starts with, and who they are again after a disaster. */
  keepResidents: 8,
  /** People a house holds at levels 1…3. */
  houseResidents: [8, 12, 16] as readonly number[],
  /** A fed house with room takes in a newcomer this often. */
  growSeconds: 30,
  /** Rations one person eats a minute at home (tuned with the soldiers' 0.25: work makes hungrier). */
  rationsPerMinute: 0.3,
  /** Tax from each fed townsman. */
  taxGoldPerSecond: 0.02,
  /** A person walks briskly; under a load the same (a sack, not a millstone). Tuned: at 1.4 the farms' corn did not reach the bakery in time. */
  walkSpeedMs: 2.0,
  /** Units of one good a carrier takes at once on foot (TRANSPORT raises it). */
  carryCapacity: 8,
  /** Seconds to pick a load up or set it down. */
  handlingSeconds: 1,
  /** A building's stores: carriers fill inputs up to the target; work stops when an output reaches its cap. */
  inputTarget: 8,
  outputCap: 24,
  /** Outputs are carried to the keep once a full load lies in the yard; this few when the keep is short of the good or the yard nearly full. */
  clearOutputAt: 4,
  /** Rations a house likes to have in the larder. */
  houseFoodTarget: 5,
  /** Share of the people without a workplace who build while anything is being built; the rest carry. */
  builderShare: 0.3,
  maxBuildersPerSite: 3,
  /** A town keeps at least this many free hands when men are called up: someone has to carry the bread. */
  minFreeAfterCallUp: 4,
  /** Carriers the town always keeps: no worker or builder is taken from the last four, so goods keep moving. */
  minCarriers: 4,
  /** People run for the keep when an enemy regiment is this close, and come back this long after it has gone. */
  fleeRadiusM: 32,
  calmSeconds: 6,
  /** How close a person must be to a door or a spot to be "there". */
  arriveM: 1.2,
  /** Most people a side can have (pool size). */
  maxPerSide: 170,
} as const;

export const ROADS = {
  /** The grid roads and paths are laid on: one cell is this many metres square. */
  cellM: 2,
  /** A road costs this much stone for every cell it covers (rounded up over the whole stretch). */
  stonePerCell: 0.34,
  /** How fast people walk on a road, on open ground and among trees, as a share of their walking pace. */
  roadSpeedFactor: 1.4,
  openSpeedFactor: 1,
  forestSpeedFactor: 0.7,
  /**
   * Cells the path finder may look at in one step of the simulation, all searches together: people who
   * need a way after that wait a step (measured: a 160 m way looks at about 4 000 cells, 1.3 ms).
   */
  cellsPerStep: 8000,
  /** One search gives up after this many cells and the walker goes straight: no single search costs more than about 3 ms. */
  maxCellsPerSearch: 12000,
  /** A goal in water or inside a building is moved to the nearest open cell within this many cells. */
  goalSnapCells: 6,
  /** Way points a path may hold. */
  maxWaypoints: 96,
} as const;

/** Walls are drawn like roads, a cell at a time, and stop everyone; the enemy's men batter them down. */
export const WALLS = {
  /** Stone for each 2 m of wall. */
  stonePerCell: 3,
  /** Blows a cell takes before it falls. */
  hp: 260,
  /** Share of a soldier's blow (and of an engine's stone) that a wall takes. */
  meleeFactor: 0.6,
  /** A stone damages wall cells this far from where it lands, besides any it hits. */
  siegeRadiusM: 2.5,
} as const;

/**
 * A gate: set into the side's own wall over this many cells, at this price. The side's own people and
 * soldiers pass through it; to the enemy it is wall, and takes this many blows to break.
 */
export const GATE = {
  cells: 3,
  cost: { wood: 20, stone: 12 },
  hp: 400,
  /** The leaves swing open while one of the side's own men is this close. */
  openRadiusM: 12,
} as const;

/** A watchtower's garrison: archers or crossbowmen of one kind, shooting from the top. */
export const TOWER = {
  maxGarrison: 4,
  /** Height they shoot from, and the reach it adds. */
  topM: 9,
  rangeBonusM: 12,
  /** A regiment sent to the tower goes in once its middle is this close to the door. */
  enterRadiusM: 14,
} as const;

export const FIELDS = {
  /** Strips of land a farm works at levels 1…3: the farmland grows with the farm. */
  stripsPerLevel: [2, 4, 6] as readonly number[],
  maxStrips: 6,
  /** A strip: this long across the back of the farm, this wide; the first lies this far behind the farm. */
  stripLengthM: 12,
  stripWidthM: 6,
  firstStripM: 11,
  stripGapM: 0.6,
  /** Breaking new ground, sowing, the wait for the corn, and the harvest, in seconds at level 1. */
  establishSeconds: 14,
  sowSeconds: 9,
  growSeconds: 60,
  harvestSeconds: 11,
  grainPerHarvest: 10,
} as const;

/** Vines: planted once, then they bear every season with no new sowing; slower than corn. */
export const VINES = {
  /** Breaking the ground and planting the vines of one strip, at level 1. */
  plantSeconds: 30,
  /** From planting, or from the last vintage, to ripe grapes. */
  growSeconds: 110,
  harvestSeconds: 14,
  grapesPerHarvest: 6,
} as const;

/** Wine is a luxury: carried to the houses, drunk there, and a house with wine pays more and grows faster. */
export const WINE = {
  /** Wine one resident drinks a minute while the house has any. */
  perResidentPerMinute: 0.05,
  /** Wine a house likes to keep in its cellar. */
  houseTarget: 3,
  /** Tax multiplier, and the share of the usual time a newcomer takes, in a house with wine. */
  taxFactor: 1.8,
  growFactor: 0.6,
} as const;

/** Trades whose worker goes out to the land and comes back with a load: seconds on the spot and what a trip brings. */
export const GATHER = {
  /** The woodcutter also splits each load at the chopping block in his yard (`splitSeconds`, at `blockX/Z` in the lodge's own space, door towards +Z). */
  woodcutter: { seconds: 8, amount: 8, reachM: 16, splitSeconds: 6, blockX: -1.0, blockZ: 1.8 },
  fisher: { seconds: 10, amount: 3, reachM: 9 },
  /** The hunter stalks in the woods round the spot his lodge looks out on, and brings back a carcass: meat and a hide. */
  hunter: { seconds: 22, meat: 2, hide: 1, roamM: 14 },
} as const;

/**
 * The woods: a woodcutter fells the nearest grown tree within `reachM` of his hut, and plants a sapling by
 * its stump before carrying the wood home, one for every tree. The sapling (this share of a tree's size
 * when set) grows into a tree that can be felled again in `growS`.
 */
export const FORESTRY = {
  reachM: 55,
  /** A woodcutter's hut may stand only where at least this many grown trees are in his reach. */
  minTrees: 20,
  plantSeconds: 4,
  saplingShare: 0.15,
  growS: 600,
  /** A woodcutter's claim on a tree lapses after this (he was called away). */
  claimS: 120,
  /** The forester tends the young trees within this of his hut: he plants by a bare stump, or works round a
   * sapling so it grows `tendBoostS` sooner. */
  foresterReachM: 50,
  tendSeconds: 6,
  tendBoostS: 150,
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
  house: { cost: { gold: 40, wood: 10 }, buildSeconds: 10, hp: 250, recipe: { inputs: {}, outputs: { gold: 1 }, cycleSeconds: 2.5 } },
  // The woodcutter, the fisher and the farm have no cycle here: their workers go out to the land (GATHER, FIELDS).
  woodcutter: { cost: { gold: 30 }, buildSeconds: 8, hp: 250, recipe: null },
  // Logs to planks: higher levels of buildings take planks for half their timber (economy.buildingCost).
  sawmill: { cost: { gold: 60, wood: 30, stone: 10 }, buildSeconds: 12, hp: 300, recipe: { inputs: { wood: 2 }, outputs: { planks: 2 }, cycleSeconds: 6 } },
  // The forester and the hunter go out to the woods like the woodcutter (FORESTRY, GATHER).
  forester: { cost: { gold: 35, wood: 10 }, buildSeconds: 8, hp: 250, recipe: null },
  hunter: { cost: { gold: 40, wood: 10 }, buildSeconds: 8, hp: 250, recipe: null },
  fisher: { cost: { gold: 40, wood: 10 }, buildSeconds: 10, hp: 250, recipe: null },
  quarry: { cost: { gold: 40, wood: 10 }, buildSeconds: 10, hp: 300, recipe: { inputs: {}, outputs: { stone: 1 }, cycleSeconds: 6 } },
  farm: { cost: { gold: 40, wood: 10 }, buildSeconds: 10, hp: 250, recipe: null },
  // Grain is ground to flour at the mill before the baker can use it.
  windmill: { cost: { gold: 70, wood: 30 }, buildSeconds: 14, hp: 300, recipe: { inputs: { grain: 2 }, outputs: { flour: 2 }, cycleSeconds: 6 } },
  bakery: { cost: { gold: 50, wood: 15, stone: 5 }, buildSeconds: 12, hp: 300, recipe: { inputs: { flour: 1 }, outputs: { bread: 1 }, cycleSeconds: 5 } },
  pigFarm: { cost: { gold: 60, wood: 20 }, buildSeconds: 12, hp: 250, recipe: { inputs: { grain: 1 }, outputs: { meat: 2, hide: 1 }, cycleSeconds: 12 } },
  // Vines on strips behind the press-house, like a farm's fields: the vintner plants them once and then only picks.
  vineyard: { cost: { gold: 70, wood: 20 }, buildSeconds: 12, hp: 250, recipe: null },
  winery: { cost: { gold: 90, wood: 20, stone: 20 }, buildSeconds: 14, hp: 300, recipe: { inputs: { grapes: 3 }, outputs: { wine: 2 }, cycleSeconds: 12 } },
  butcher: { cost: { gold: 60, wood: 15, stone: 10 }, buildSeconds: 12, hp: 300, recipe: { inputs: { meat: 1 }, outputs: { sausage: 1 }, cycleSeconds: 5 } },
  tannery: { cost: { gold: 60, wood: 15, stone: 10 }, buildSeconds: 12, hp: 300, recipe: { inputs: { hide: 1 }, outputs: { leatherArmor: 1 }, cycleSeconds: 8 } },
  ironMine: { cost: { gold: 80, wood: 25 }, buildSeconds: 14, hp: 300, recipe: { inputs: {}, outputs: { ironOre: 1 }, cycleSeconds: 6 } },
  // Ore is smelted to iron in a bloomery, burning timber (as charcoal) to do it.
  smelter: { cost: { gold: 90, wood: 20, stone: 30 }, buildSeconds: 14, hp: 350, recipe: { inputs: { ironOre: 2, wood: 1 }, outputs: { iron: 2 }, cycleSeconds: 9 } },
  smithy: { cost: { gold: 80, wood: 20, stone: 20 }, buildSeconds: 14, hp: 350, recipe: { inputs: { iron: 1, wood: 1 }, outputs: { weapon: 1 }, cycleSeconds: 7 } },
  armourer: { cost: { gold: 120, wood: 20, stone: 40 }, buildSeconds: 16, hp: 350, recipe: { inputs: { iron: 2 }, outputs: { mailArmor: 1 }, cycleSeconds: 12 } },
  fletcher: { cost: { gold: 60, wood: 20 }, buildSeconds: 12, hp: 250, recipe: { inputs: { wood: 1 }, outputs: { bow: 1 }, cycleSeconds: 8 } },
  stable: { cost: { gold: 100, wood: 40, stone: 10 }, buildSeconds: 14, hp: 300, recipe: { inputs: { grain: 3 }, outputs: { horse: 1 }, cycleSeconds: 25 } },
  barracks: { cost: { gold: 100, wood: 30, stone: 30 }, buildSeconds: 16, hp: 450, recipe: null },
  // A stone tower for up to TOWER.maxGarrison archers or crossbowmen, who shoot further from its top.
  tower: { cost: { gold: 40, wood: 15, stone: 60 }, buildSeconds: 18, hp: 900, recipe: null },
  // Casts guns (level 1 cannon, level 2 mortar) from iron, timber and stone; nobody works here between orders.
  foundry: { cost: { gold: 150, wood: 40, stone: 60 }, buildSeconds: 20, hp: 500, recipe: null },
  // Grain to ale for the tavern.
  brewery: { cost: { gold: 60, wood: 25, stone: 10 }, buildSeconds: 12, hp: 300, recipe: { inputs: { grain: 2 }, outputs: { ale: 2 }, cycleSeconds: 8 } },
  // The innkeeper sells the ale: gold besides the tax.
  tavern: { cost: { gold: 80, wood: 30, stone: 10 }, buildSeconds: 12, hp: 300, recipe: { inputs: { ale: 1 }, outputs: { gold: 2 }, cycleSeconds: 5 } },
  // Raises the heart of every regiment of the side while one stands (CHAPEL).
  chapel: { cost: { gold: 120, wood: 20, stone: 50 }, buildSeconds: 18, hp: 450, recipe: null },
  // Houses round a well take in newcomers sooner (WELL); it will put out fires once buildings can burn.
  well: { cost: { gold: 25, stone: 15 }, buildSeconds: 6, hp: 200, recipe: null },
  // Sells what the town has too much of and buys what it lacks, at a poor rate (MARKET).
  market: { cost: { gold: 80, wood: 40, stone: 20 }, buildSeconds: 14, hp: 400, recipe: null },
  // A second store of the town's goods: carriers bring to and fetch from whichever store is nearest.
  storehouse: { cost: { gold: 60, wood: 40, stone: 10 }, buildSeconds: 14, hp: 400, recipe: null },
};

/** Experience: kills per man (of the regiment as raised) that make it seasoned, then veterans; what each rank gives. */
export const VETERANS = {
  ranksAt: [0.6, 1.5],
  attackPerRank: 1,
  defencePerRank: 1,
  moralePerRank: 8,
  /** Shooters of each rank hit this much more often. */
  missileHitPerRank: 0.12,
};

/** The captain: the last man of the formation. His fall shakes the regiment; without him it fights and steadies worse. */
export const CAPTAIN = {
  fallShock: 12,
  attackWithout: 1,
  moraleWithout: 10,
  recoverFactorWithout: 0.5,
};

/** Filling a thinned regiment by its barracks (militia by the keep): gold and arms for each new man, his walk and his training. */
export const REINFORCE = {
  radiusM: 40,
  /** The regiment must not have fought for this long. */
  quietS: 5,
  /** Training time for a whole regiment's worth; less for fewer. */
  minSeconds: 4,
};

/** Soldiers' pay, taken from the keep's gold once a second. Owed for longer than a minute (and at least minArrears), they lose heart. */
export const PAY = {
  goldPerManPerMinute: 0.2,
  minArrears: 3,
  unpaidMoralePenalty: 15,
};

/**
 * Re-arming a regiment that stands by its barracks (or, for what the keep can make, by the keep): it keeps
 * its men, their fatigue and their record, and is paid for only in what it lacks — the target's equipment
 * less what it already carries, for every man alive, and the difference in gold if the target costs more.
 */
export const REARM = {
  /** How near a finished barracks (or the keep) the regiment must stand. */
  radiusM: 40,
  seconds: 20,
  /** What each kind may become. Mounted stay mounted; engines are not re-armed. */
  paths: {
    militia: ['pikemen', 'archers', 'swordsmen', 'halberdiers', 'crossbowmen'],
    pikemen: ['halberdiers', 'swordsmen'],
    archers: ['crossbowmen'],
    swordsmen: ['halberdiers'],
    halberdiers: ['swordsmen'],
    crossbowmen: [],
    lightCavalry: ['heavyCavalry'],
    heavyCavalry: [],
    cannon: [],
    mortar: [],
  } as Record<UnitKind, readonly UnitKind[]>,
} as const;

export const FOOD = {
  /** One soldier eats this many rations a minute (tuned: 100 men need about two bakeries). */
  soldierRationsPerMinute: 0.25,
  breadRations: 1,
  fishRations: 1,
  /** Sausage feeds two: the reason to run pigs through the butcher. */
  sausageRations: 2,
  /** A starving town works at this speed, pays no tax and its soldiers lose this much top morale. */
  starvingSpeedFactor: 0.5,
  starvingMoralePenalty: 25,
} as const;

export interface UnitDef {
  /** Men in a regiment; for siege engines, the number of engines (each with its crew). */
  men: number;
  /** Townspeople each man (or engine) takes from the town: 1, or an engine's crew. */
  crew: number;
  /** Men abreast in the default formation. */
  files: number;
  fileSpacingM: number;
  rankSpacingM: number;
  cavalry: boolean;
  /** A siege engine: it shoots and can be wrecked, but its crew does not fight hand to hand. */
  engine: boolean;
  /** Barracks level that trains it. */
  barracksLevel: number;
  /** Where it is raised: the barracks, or the foundry (guns); `barracksLevel` is then the foundry's level. */
  trainedAt: 'barracks' | 'foundry';
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
  /** A home guard: takes orders only within ARMY.homeGuardRadiusM of its own keep; re-arm it to take it further. */
  defenceOnly: boolean;
}

// Speeds: a marching man 1.4 m/s, a running armed man about 3 m/s, a horse at
// the trot 3.5–4 and at the gallop 8–11 m/s (common gait figures); an engine
// is dragged at a crawl. Missile speeds: a war arrow 45–55 m/s, a crossbow
// bolt about 60, a torsion engine's bolt 70 (published reconstructions).
// Everything else in this table is game balance, tuned in tests/.
const NO_MISSILE = { missileRangeM: 0, missileMinRangeM: 0, missileDamage: 0, missilePierce: 0, missileSpeedMs: 0, missileHighArc: false, missileSplashM: 0, missileSiegeDamage: 0, reloadS: 0 };
const FOOT = { ...NO_MISSILE, trainedAt: 'barracks' as const, defenceOnly: false, crew: 1, men: 12, files: 6, fileSpacingM: 1.15, rankSpacingM: 1.4, cavalry: false, engine: false, walkSpeedMs: 1.4, turnRateRadS: 1.2, bodyRadiusM: 0.36, recruitSeconds: 10, reachM: 1.6, attackIntervalS: 1.5, bonusVsCavalry: 0, missileBlock: 0 };
const HORSE = { ...NO_MISSILE, trainedAt: 'barracks' as const, defenceOnly: false, crew: 1, men: 8, files: 4, fileSpacingM: 1.9, rankSpacingM: 3.2, cavalry: true, engine: false, walkSpeedMs: 3.6, turnRateRadS: 0.9, bodyRadiusM: 0.75, recruitSeconds: 14, attackIntervalS: 1.5, bonusVsCavalry: 0, missileBlock: 0 };
const ENGINE = { trainedAt: 'foundry' as const, defenceOnly: false, cavalry: false, engine: true, attack: 0, defence: 0, armour: 0, damage: 0, reachM: 0, attackIntervalS: 1, bonusVsCavalry: 0, chargeBonus: 0, chargeShock: 0, turnRateRadS: 0.5, recruitSeconds: 20 };

export const UNITS: Record<UnitKind, UnitDef> = {
  // Townsmen with a shield and a spear: cheap, steady enough behind the shield, quick to run.
  // A spear and a wooden shield made at the keep (one timber a man), no armour: raised before there is a barracks.
  militia: { ...FOOT, defenceOnly: true, barracksLevel: 0, goldCost: 30, equipment: { wood: 1 }, hp: 24, attack: 4, defence: 5, armour: 0, damage: 4, chargeBonus: 1, chargeShock: 1, missileBlock: 0.25, morale: 45, runSpeedMs: 3.1, bounty: 1 },
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
  // Two field guns cast at the foundry: a ball on a flat line to 120 m that goes through any armour and
  // knocks holes in walls; helpless once reached.
  cannon: { ...ENGINE, crew: 3, men: 2, files: 2, fileSpacingM: 5, rankSpacingM: 5, barracksLevel: 1, goldCost: 140, equipment: { iron: 6, wood: 6 }, hp: 80, missileBlock: 0.7, missileRangeM: 120, missileMinRangeM: 10, missileDamage: 55, missilePierce: 0.9, missileSpeedMs: 110, missileHighArc: false, missileSplashM: 0, missileSiegeDamage: 30, reloadS: 10, morale: 55, walkSpeedMs: 0.9, runSpeedMs: 0.9, bodyRadiusM: 1.4, bounty: 8 },
  // One mortar (the foundry's second level): it lobs a heavy ball high over walls; it scatters a formation
  // and brings down walls, towers and the keep. Cannot shoot closer than 40 m.
  mortar: { ...ENGINE, crew: 5, men: 1, files: 1, fileSpacingM: 8, rankSpacingM: 8, barracksLevel: 2, goldCost: 200, equipment: { iron: 10, stone: 8 }, hp: 120, missileBlock: 0.8, missileRangeM: 150, missileMinRangeM: 40, missileDamage: 30, missilePierce: 0.5, missileSpeedMs: 50, missileHighArc: true, missileSplashM: 4.5, missileSiegeDamage: 110, reloadS: 15, morale: 60, walkSpeedMs: 0.6, runSpeedMs: 0.6, bodyRadiusM: 2.0, bounty: 15 },
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
  /** Round walls: files while marching in column, how near a way point counts as reached, how far the goal may move before the way is found again, and how often it is looked at (on failure, retried after `routeRetryS`). */
  columnFiles: 3,
  /** Orders a regiment may have waiting (Shift). */
  maxQueuedOrders: 12,
  routeReachM: 3,
  routeGoalSlackM: 6,
  routeCheckS: 1,
  routeRetryS: 6,
  /** Regiments run for the last stretch of an attack. */
  runWithinM: 55,
  /** A regiment in melee turns towards its enemy this slowly: a second attacker keeps a flank for a while. */
  engagedTurnRateRadS: 0.35,
  forestFootSpeedFactor: 0.85,
  forestHorseSpeedFactor: 0.6,
  /** A home guard (militia) goes no further than this from its own keep: the town, its fields and villages. */
  homeGuardRadiusM: 115,
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
  /** To every regiment a mortar's ball lands among. */
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

/**
 * Formations and stances (regiment.ts). Open order stands the men `looseSpacingFactor` apart: arrows hit
 * `looseHitFactor` as often, but in melee its men defend `looseDefence` points worse. A wedge of horse
 * charges with `wedgeCharge` times the bonus and shock, and defends `wedgeDefence` points worse. A
 * shield wall turns `shieldBlockFactor` times the arrows (to at most `shieldBlockMax`), marches at
 * `shieldSpeedFactor` and strikes `shieldAttack` points worse. A pike wall stands: a charge into its front
 * gets nothing, the horse that charge it are struck `pikeWallVsHorse` times as hard, and it defends
 * `pikeWallDefence` points better.
 */
export const FORMATION = {
  looseSpacingFactor: 1.9,
  looseHitFactor: 0.5,
  looseDefence: 2,
  wedgeCharge: 1.6,
  wedgeDefence: 1.5,
  shieldBlockFactor: 2,
  shieldBlockMax: 0.85,
  shieldSpeedFactor: 0.55,
  shieldAttack: 3,
  pikeWallVsHorse: 2,
  pikeWallDefence: 3,
  /** Ranks a player may set a foot regiment to. */
  rankChoices: [2, 3, 4, 6],
} as const;

/**
 * High ground: shooters reach up to `rangeBonus` further over ground this much lower (in full at
 * `fullRiseM`); a charge down a slope of more than `slopeM` strikes `downhillCharge` times as hard; a
 * man striking up such a slope does it `uphillAttack` points worse.
 */
export const ELEVATION = {
  rangeBonus: 0.15,
  fullRiseM: 8,
  slopeM: 1.5,
  downhillCharge: 1.25,
  uphillAttack: 1,
} as const;

/**
 * The computer's character, on top of its difficulty. `waveMen` and `waveWait` scale the size of its
 * attack waves and how long it waits for them; a raider also sends a regiment every `raidEveryS` to burn
 * buildings out beyond the enemy's town.
 */
export const AI_CHARACTERS = {
  balanced: { waveMen: 1, waveWait: 1, raidEveryS: 0 },
  builder: { waveMen: 1.5, waveWait: 1.35, raidEveryS: 0 },
  raider: { waveMen: 0.75, waveWait: 0.85, raidEveryS: 150 },
} as const;
export type AiCharacter = keyof typeof AI_CHARACTERS;

/**
 * The defence: the player's town alone, waves marching from the enemy's keep every `waveEveryS` from
 * `firstWaveS`, each bigger than the last; standing at `lengthS` wins.
 */
export const DEFENCE = {
  firstWaveS: 420,
  waveEveryS: 240,
  lengthS: 1800,
  /** The regiments of each wave in turn, cycling, and how many the first wave has (one more every second wave). */
  rota: ['pikemen', 'archers', 'swordsmen', 'lightCavalry', 'crossbowmen', 'halberdiers', 'heavyCavalry'],
  firstWaveRegiments: 1,
} as const;

export const AI_TUNING: Record<Difficulty, AiTuning> = {
  easy: { productionFactor: 0.7, firstWaveMen: 36, waveGrowthMen: 8, waveTimeoutS: 420 },
  normal: { productionFactor: 1, firstWaveMen: 24, waveGrowthMen: 12, waveTimeoutS: 330 },
  hard: { productionFactor: 1.35, firstWaveMen: 48, waveGrowthMen: 16, waveTimeoutS: 260 },
};

/**
 * The keep's three levels. Each lets the barracks rise as far as `barracks`, lets the town build as far as
 * `territoryM` (farms and vineyards `fieldsM`), takes `hp` blows and shoots every `shotIntervalS`; `cost`
 * is the price of rising to it, the work taking KEEP_UPGRADE_SECONDS. A game starts at the first.
 */
export const KEEP_LEVELS = [
  { hp: TOWN.keepHp, territoryM: TOWN.territoryRadiusM, fieldsM: TOWN.fieldTerritoryRadiusM, barracks: 1, shotIntervalS: TOWN.keepShotIntervalS, cost: {} },
  { hp: 2600, territoryM: 330, fieldsM: 390, barracks: 2, shotIntervalS: 0.75, cost: { gold: 250, wood: 60, stone: 120 } },
  { hp: 3600, territoryM: 380, fieldsM: 440, barracks: 3, shotIntervalS: 0.5, cost: { gold: 500, wood: 100, stone: 240 } },
] as const;
export const KEEP_UPGRADE_SECONDS = 60;

/**
 * Transport, by level: what a carrier takes in one trip and how much faster he goes. Level 2 gives every
 * carrier a handcart, level 3 a horse and wagon (it needs the keep at `keepLevel`). Raised at the keep, in
 * `seconds`, for `cost`.
 */
export const TRANSPORT = [
  { capacity: PEOPLE.carryCapacity, pace: 1, keepLevel: 1, seconds: 0, cost: {} },
  { capacity: 14, pace: 1, keepLevel: 1, seconds: 45, cost: { gold: 120, wood: 60 } },
  { capacity: 20, pace: 1.35, keepLevel: 2, seconds: 60, cost: { gold: 260, wood: 100, horse: 6 } },
] as const;

/** The player's arms workshops start with nothing ordered: they make arms only when arms are ordered (the computer works unlimited). */
/**
 * The market: what each good is worth in gold. It is sold for `sellShare` of that and bought for `buyShare`,
 * `lot` at a time — a way out of a stalled chain, never a way to get rich.
 */
export const MARKET = {
  lot: 10,
  sellShare: 0.6,
  buyShare: 1.6,
  value: { gold: 1, wood: 1, planks: 2, stone: 1.5, grain: 1, flour: 1.5, grapes: 1, wine: 4, ale: 2.5, bread: 2, fish: 2, meat: 2, sausage: 3, hide: 2, leatherArmor: 6, ironOre: 2, iron: 5, weapon: 8, mailArmor: 12, bow: 5, horse: 15 },
} as const;

/** A chapel: every regiment of the side, at home or away, fights with this much more heart while one stands. */
export const CHAPEL = { morale: 6 } as const;

/** A well: houses within `reachM` of one take in newcomers this much sooner (their wait times `growFactor`). */
export const WELL = { reachM: 40, growFactor: 0.75 } as const;

export const ARMS_GOODS = ['weapon', 'bow', 'leatherArmor', 'mailArmor', 'horse'] as const;

/** How much a carrier's choice of errand leans towards (or away from) a good the player marked high (or low). */
export const PRIORITY = { high: 1500, low: -900 } as const;

/**
 * Places in the middle worth holding: a rich mine and a quarry on the two knolls, a village in the middle
 * of the field. All lie on the line halfway between the keeps, as far from one as from the other. A side
 * takes one by standing a regiment by it for `holdS` with no enemy within `clearM`; while it holds it, the
 * goods come to its keep (a minute's worth below).
 */
export const POINTS = {
  holdS: 20,
  radiusM: 16,
  clearM: 30,
  list: [
    { kind: 'mine', sideM: 105, perMinute: { ironOre: 8 } },
    { kind: 'quarry', sideM: -105, perMinute: { stone: 10 } },
    { kind: 'village', sideM: 0, perMinute: { gold: 15, grain: 6 } },
  ],
} as const;

export const AI = {
  /** The market: below this much gold the computer sells a lot of a good it has at least `marketSurplus` of. */
  marketSellBelowGold: 120,
  marketSurplus: 120,
  marketSells: ['grain', 'flour', 'grapes', 'wine', 'ale', 'hide', 'ironOre', 'sausage'] as const,
  thinkIntervalS: 1,
  /** The computer forms a pike wall when enemy horse come this near, and raises shields for this long after an arrow strikes. */
  pikeWallAtM: 55,
  /** The wall across the approach: stone in hand before it is begun, how far out from the keep, half its length. */
  wallStone: 260,
  /** While saving for the keep's second level, the computer recruits only with this much gold over its price. */
  keepSavingMarginGold: 60,
  /** …and only once it has this many regiments in the field: the first waves are not held back. */
  keepSavingAfterRegiments: 3,
  wallForwardM: 104,
  wallHalfM: 34,
  shieldsUnderFireS: 4,
  /** How often the computer looks for a place in the middle to take. */
  pointsLookS: 20,
  /** The computer turns its whole army on anything that comes this close to its keep. */
  defendRadiusM: 95,
  /** A wave that has lost this share of its men goes home. */
  retreatLossShare: 0.7,
  /** Gold kept back before spending on upgrades. */
  upgradeReserveGold: 220,
  /** Stone the computer keeps for buildings: roads are laid only with what is left over. */
  roadStoneReserve: 30,
  /** Regiments of militia the computer keeps as a home guard at most. */
  maxGuardRegiments: 2,
  /** Free hands the computer keeps at home for every building it has, on top of the town's minimum. */
  freeHandsPerBuilding: 0.15,
} as const;

export const CAMERA = {
  minDistanceM: 25,
  /** Far enough to see the whole 560 m map at once on a wide screen. */
  maxDistanceM: 1180,
  startDistanceM: 110,
  /** Pitch below the horizon: flatter up close to see the ranks, nearly straight down from afar to read the map. */
  pitchNearRad: 0.68,
  pitchFarRad: 1.36,
  fovDeg: 40,
  /** Pan speed as a share of the camera distance per second. */
  panSpeedPerDistance: 0.9,
  rotateSpeedRadS: 1.4,
  /** Turn for each pixel the mouse is dragged with the middle button held. */
  rotateDragRadPerPx: 0.006,
  /** Tilt for each pixel the mouse is dragged forward or back with the right button held, and the bounds of the tilt the player may add to the pitch the zoom gives. */
  tiltDragRadPerPx: 0.004,
  minTiltRad: -0.55,
  maxTiltRad: 0.5,
  /** The pitch never goes flatter or steeper than these, however zoom and tilt add up. */
  minPitchRad: 0.3,
  maxPitchRad: 1.5,
  /** Turn of one press of the on-screen rotate buttons. */
  rotateStepRad: Math.PI / 4,
  zoomStepFactor: 1.18,
  /** Time constant of the smoothing (s): tuned by hand, feels right at 60 fps. */
  smoothingS: 0.12,
  edgeScrollPx: 14,
} as const;
