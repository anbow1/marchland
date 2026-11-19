import { CAMPAIGN, GATE, REINFORCE, TOWN, WALLS } from '../config.ts';
import { hypot2 } from '../core/hypot.ts';
import { adjustStances, fight } from './ai.ts';
import { cmdAttackRegiment, cmdBuild, cmdBuildRoad, cmdMove, wallCellsFor } from './commands.ts';
import { isBuilt, startBuilding } from './economy.ts';
import { cellX, cellZ, gateCells, layGate, layWall, stampBuilding } from './nav.ts';
import { fortressFrame, fortressPoint, INNER, insideRing, OUTER, ringCorners } from './fortress.ts';
import type { Point } from './points.ts';
import { doorX, doorZ, KEEP } from './people.ts';
import { assignSlots, newSoldier, type Regiment } from './regiment.ts';
import { planSite } from './sitePlanner.ts';
import { facingToEnemy, isImpassable, isWater, rallyX, rallyZ, townX, townZ } from './terrain.ts';
import { type BuildingKind, COMPUTER, type CommandResult, PLAYER, RESOURCE_IDS, type ResourceId, type Side, type UnitKind } from './types.ts';
import { findRegiment, spawnRegiment, type World } from './world.ts';

// The campaign (docs/CAMPAIGN.md): five missions of one war, each a scenario laid over the ordinary game —
// where the keeps stand and on which map (set by the page's address, like any game), what stands and who
// marches at the start, what wins and what loses. In the campaign a side fields up to
// CAMPAIGN.maxSoldiersPerSide men and a regiment grows to CAMPAIGN.regimentMaxMen at its barracks; regiments
// of a kind may merge. Up to CAMPAIGN.carryRegiments regiments and some gold go on from one mission to the next.

export interface MissionDef {
  /** 1…5. */
  n: number;
  /** The map and the place of the keeps (sim/layout.ts), set in the page's address. */
  layout: 'field' | 'river' | 'forest' | 'valley' | 'fortress';
  start: number;
  /** Ready to play (the later missions come in later stages). */
  ready: boolean;
}

export const MISSIONS: readonly MissionDef[] = [
  { n: 1, layout: 'river', start: 0, ready: true },
  { n: 2, layout: 'river', start: 0, ready: true },
  { n: 3, layout: 'valley', start: 1, ready: true },
  { n: 4, layout: 'valley', start: 1, ready: true },
  { n: 5, layout: 'fortress', start: 0, ready: true },
];

/** A regiment carried from one mission to the next. */
export interface CarriedRegiment {
  kind: UnitKind;
  men: number;
  /** Experience (kills per man), as Regiment.xp. */
  xp: number;
}

/** What a mission starts from: its number, the army and gold carried from the last. */
export interface CampaignSetup {
  mission: number;
  carried: readonly CarriedRegiment[];
  gold: number;
}

export interface CampaignState {
  mission: number;
  /** Mission 1: what is owed, when it is due, and whether it is paid. */
  tribute: Partial<Record<ResourceId, number>>;
  dueS: number;
  paid: boolean;
  /** Regiments the player had when the tribute was paid (the second star wants four). */
  regimentsAtPayment: number;
  /** The invader's camp and its regiments; whether they have marched on the town. */
  campX: number;
  campZ: number;
  campIds: number[];
  attacking: boolean;
  /** Mission 2: the regiments out plundering, and when the next of them comes back to the camp. */
  foragerIds: number[];
  foragersBackS: number;
  thinkS: number;
  /** Men the player had at the start (the second star of mission 2 wants losses under 30 %). */
  startMen: number;
  /** Seconds every enemy regiment has been fleeing without a break (mission 1: three minutes of it wins). Absent in old saves. */
  routS?: number;
  /** Missions 3–4: the settlement's garrison and their posts (x, z by regiment, in the order of `campIds`). Absent in old saves. */
  posts?: number[];
  /** Mission 3: the relief's regiments once it has come, and when it reached a settlement still his (-1 not yet). */
  reliefIds?: number[];
  reliefAtSettlementS?: number;
  /** Mission 4: the raids sent so far and their regiments. */
  raidsSent?: number;
  raidIds?: number[];
  /** The player's buildings destroyed by the enemy during the mission (mission 4's second star wants none). */
  buildingsLost?: number;
  /** Mission 5: when his barracks next send out a regiment, and how many they have. Absent in old saves. */
  recruitNextS?: number;
  recruited?: number;
  /** Mission 5: the lord's guard in the inner yard, the sally and when it went out (-1 in) or may next, the fortress's wall cells at the start and when the first fell (-1 not yet), the player's engines at the start, and how long he has had no army. */
  guardIds?: number[];
  guardPosts?: number[];
  sallyIds?: number[];
  sallyPosts?: number[];
  sallyOutS?: number;
  sallyNextS?: number;
  fortWallCells?: number;
  breachS?: number;
  enginesAtStart?: number;
  noArmyS?: number;
  /** Stars earned when the mission ends: 1 for winning, 2 with its extra goal. */
  stars: number;
}

/** Fills a regiment to `men` (its formation's places grow as needed): the campaign's full regiments. */
export function fillRegiment(r: Regiment, men: number): void {
  r.maxMen = Math.max(r.maxMen, men);
  while (r.soldiers.length < men) r.soldiers.push(newSoldier(r, r.soldiers.length));
  for (const s of r.soldiers) {
    if (r.aliveMen >= men) break;
    if (s.alive) continue;
    s.alive = true;
    s.hp = r.def.hp;
    s.deadS = 0;
    r.aliveMen += 1;
  }
  r.aliveMen = r.soldiers.filter((s) => s.alive).length;
  r.initialMen = Math.max(r.initialMen, r.soldiers.length);
  assignSlots(r);
}

/** Every regiment a side raises in the campaign may grow to CAMPAIGN.regimentMaxMen (engines keep their crews). */
export function campaignRegiment(r: Regiment): void {
  if (!r.def.engine) r.maxMen = CAMPAIGN.regimentMaxMen;
}

/** A building put up at once where the town's planner would put it, with a road to the keep, at no cost. */
function buildNow(world: World, kind: BuildingKind): void {
  const town = world.towns[PLAYER];
  const kept = { ...town.stock };
  for (const id of RESOURCE_IDS) town.stock[id] += 10000;
  const site = planSite(world, PLAYER, kind);
  if (site && cmdBuild(world, PLAYER, kind, site.x, site.z, site.yawRad) === 'ok') {
    const plot = town.plots.findIndex((b) => b !== null && b.x === site.x && b.z === site.z);
    const b = town.plots[plot];
    if (b) {
      b.constructionLeftS = 0;
      b.matDelivered = b.matTotal;
      b.matWaiting.wood = b.matWaiting.stone = b.matWaiting.planks = 0;
      cmdBuildRoad(world, PLAYER, doorX(town, plot), doorZ(town, plot), doorX(town, KEEP), doorZ(town, KEEP));
    }
  }
  Object.assign(town.stock, kept);
}

/** A point on the line from the player's keep to the far one, this share of the way (moved off water). */
function along(share: number, sideM = 0): [number, number] {
  const px = townX(PLAYER);
  const pz = townZ(PLAYER);
  const fx = townX(COMPUTER) - px;
  const fz = townZ(COMPUTER) - pz;
  const len = Math.hypot(fx, fz);
  let x = px + fx * share - (fz / len) * sideM;
  let z = pz + fz * share + (fx / len) * sideM;
  for (let i = 0; i < 20 && isWater(x, z); i++) {
    x += (fx / len) * 6;
    z += (fz / len) * 6;
  }
  return [x, z];
}

/** Regiments of `kinds` drawn up round (x, z) facing the player's town, each full at CAMPAIGN.regimentMaxMen. */
function host(world: World, kinds: readonly UnitKind[], x: number, z: number, perRow = 5): number[] {
  const facing = facingToEnemy(COMPUTER);
  const ids: number[] = [];
  kinds.forEach((kind, i) => {
    const across = ((i % perRow) - (Math.min(perRow, kinds.length) - 1) / 2) * 22;
    const back = Math.floor(i / perRow) * 24;
    const rx = x + Math.cos(facing) * across - Math.sin(facing) * back;
    const rz = z - Math.sin(facing) * across - Math.cos(facing) * back;
    const r = spawnRegiment(world, COMPUTER, kind, rx, rz, facing);
    campaignRegiment(r);
    fillRegiment(r, r.def.engine ? r.def.men : CAMPAIGN.regimentMaxMen);
    ids.push(r.id);
  });
  return ids;
}

/** The player's carried regiments (or a default army) by the rally point. */
function bringArmy(world: World, carried: readonly CarriedRegiment[], fallback: readonly UnitKind[]): void {
  const list: CarriedRegiment[] = carried.length > 0 ? [...carried] : fallback.map((kind) => ({ kind, men: 12, xp: 0 }));
  const facing = facingToEnemy(PLAYER);
  list.slice(0, CAMPAIGN.carryRegiments).forEach((c, i) => {
    const across = ((i % 4) - 1.5) * 16;
    const back = Math.floor(i / 4) * 16;
    const x = rallyX(PLAYER) + Math.cos(facing) * across - Math.sin(facing) * back;
    const z = rallyZ(PLAYER) - Math.sin(facing) * across - Math.cos(facing) * back;
    const r = spawnRegiment(world, PLAYER, c.kind, x, z, facing);
    campaignRegiment(r);
    if (c.men > r.aliveMen) fillRegiment(r, Math.min(c.men, r.maxMen));
    else if (c.men < r.aliveMen) {
      // Fewer than a fresh regiment: only those men; the barracks can fill it again.
      r.soldiers.splice(Math.max(1, c.men));
      r.aliveMen = r.soldiers.length;
      assignSlots(r);
    }
    r.xp = c.xp;
  });
}

/** The settlement of missions 3–4: the village in the middle of the map. */
export function settlement(world: World): Point {
  const village = world.points.find((p) => p.kind === 'village');
  if (!village) throw new Error('the map has no village for the settlement');
  return village;
}

/** A watchtower of `side` put up by the scenario at (x, z) (or the nearest open ground), built and manned by crossbowmen. */
function scenarioTower(world: World, side: Side, x: number, z: number, crossbowmen: number, exact = false): void {
  let px = x;
  let pz = z;
  for (let k = 0; k < 24 && !exact && isImpassable(px, pz); k++) {
    px = x + Math.sin(k) * (4 + k);
    pz = z + Math.cos(k) * (4 + k);
  }
  const town = world.towns[side];
  const kept = { ...town.stock };
  for (const id of RESOURCE_IDS) town.stock[id] += 10000;
  const plot = startBuilding(town, 'tower', { x: px, z: pz, yawRad: facingToEnemy(side), spotX: px, spotZ: pz, strips: [] });
  Object.assign(town.stock, kept);
  stampBuilding(world.nav, px, pz, TOWN.buildingRadiusM, true);
  const b = town.plots[plot];
  if (!b) return;
  b.constructionLeftS = 0;
  b.matDelivered = b.matTotal;
  b.matWaiting.wood = b.matWaiting.stone = b.matWaiting.planks = 0;
  b.garrison = crossbowmen;
  b.garrisonKind = 'crossbowmen';
}

const fortCells: number[] = [];

/** A wall of the fortress from one point to another, `factor` times as hard to break as the player's. */
function fortressWall(world: World, from: [number, number], to: [number, number]): void {
  wallCellsFor(world, COMPUTER, from[0], from[1], to[0], to[1], fortCells);
  layWall(world.nav, fortCells, COMPUTER, from[0], from[1], to[0], to[1], WALLS.hp * CAMPAIGN.fortress.wallHpFactor);
}

/** A gate into the fortress's wall at a point (its stretch must be straight there). */
function fortressGate(world: World, at: [number, number]): void {
  if (gateCells(world.nav, at[0], at[1], COMPUTER, GATE.cells, fortCells) < GATE.cells) throw new Error(`no straight wall for the fortress's gate at ${at[0].toFixed(0)}, ${at[1].toFixed(0)}`);
  const middle = fortCells[(GATE.cells - 1) >> 1] as number;
  world.gates.push({ side: COMPUTER, cells: [...fortCells], x: cellX(middle), z: cellZ(middle), dir: world.nav.wallDir[middle] as number });
  layGate(world.nav, fortCells, GATE.hp * CAMPAIGN.fortress.wallHpFactor);
}

/** Regiments of `kinds` at the given points of the fortress (across, along), facing the player's camp, full. */
function posted(world: World, kinds: readonly UnitKind[], at: readonly [number, number][]): { ids: number[]; posts: number[] } {
  const facing = fortressFrame().yawRad;
  const ids: number[] = [];
  const posts: number[] = [];
  kinds.forEach((kind, i) => {
    const [a, b] = at[i % at.length] as [number, number];
    const [x, z] = fortressPoint(a, b);
    const r = spawnRegiment(world, COMPUTER, kind, x, z, facing);
    campaignRegiment(r);
    fillRegiment(r, r.def.engine ? r.def.men : CAMPAIGN.regimentMaxMen);
    ids.push(r.id);
    posts.push(x, z);
  });
  return { ids, posts };
}

/** Mission 5: the fortress — two rings of walls with their towers and gates, the donjon's ground, and its men. */
function layFortress(world: World, c: CampaignState): void {
  const F = CAMPAIGN.fortress;
  const o = F.outer;
  const n = F.inner;
  // Towers first: the walls run into them. The outer ring's corners, the middles of its sides, either side of its gate.
  const outerTowers: [number, number][] = [
    [-o.halfWidthM, -o.backM], [o.halfWidthM, -o.backM], [o.halfWidthM, o.frontM], [-o.halfWidthM, o.frontM],
    [-o.halfWidthM, (o.frontM - o.backM) / 2], [o.halfWidthM, (o.frontM - o.backM) / 2], [-15, o.frontM], [15, o.frontM],
  ];
  const innerTowers: [number, number][] = [[-n.halfWidthM, -n.backM], [n.halfWidthM, -n.backM], [n.halfWidthM, n.frontM], [-n.halfWidthM, n.frontM]];
  for (const [a, b] of [...outerTowers, ...innerTowers]) {
    const [x, z] = fortressPoint(a, b);
    scenarioTower(world, COMPUTER, x, z, F.towerCrossbowmen, true);
  }
  for (const ring of [OUTER, INNER]) {
    const corners = ringCorners(ring);
    corners.forEach((p, i) => fortressWall(world, p, corners[(i + 1) % 4] as [number, number]));
  }
  // The outer gate in the middle of the front wall, the inner in the middle of its left wall: no straight way through.
  fortressGate(world, fortressPoint(0, o.frontM));
  fortressGate(world, fortressPoint(-n.halfWidthM, (n.frontM - n.backM) / 2));
  // The donjon's ground: built over, so nobody walks through it.
  const h = F.donjonHalfM;
  for (let a = -h + 3; a <= h - 3; a += 5) for (let b = -h + 3; b <= h - 3; b += 5) {
    const [x, z] = fortressPoint(a, F.donjonAtM + b);
    stampBuilding(world.nav, x, z, 4.5, true);
  }
  // His town between the rings: houses, a bakery and a smithy in the side yards, the barracks and the chapel
  // either side of the gate yard. Built and stocked; its people work in it.
  const side = (o.halfWidthM + n.halfWidthM) / 2;
  const front = (o.frontM + n.frontM) / 2;
  const town = world.towns[COMPUTER];
  CAMPAIGN.fortressTown.forEach(([kind, a, b]) => {
    const [x, z] = fortressPoint(a * side, b);
    const kept = { ...town.stock };
    for (const id of RESOURCE_IDS) town.stock[id] += 10000;
    const yaw = Math.atan2(fortressFrame().x - x, fortressFrame().z - z);
    const plot = startBuilding(town, kind as BuildingKind, { x, z, yawRad: yaw, spotX: x + Math.sin(yaw) * 8, spotZ: z + Math.cos(yaw) * 8, strips: [] });
    Object.assign(town.stock, kept);
    stampBuilding(world.nav, x, z, TOWN.buildingRadiusM, true);
    const built = town.plots[plot];
    if (!built) return;
    built.constructionLeftS = 0;
    built.matDelivered = built.matTotal;
    built.matWaiting.wood = built.matWaiting.stone = built.matWaiting.planks = 0;
  });
  for (const [id, n] of Object.entries(CAMPAIGN.fortressStock)) town.stock[id as ResourceId] += n;
  c.recruitNextS = CAMPAIGN.fortressRecruitEveryS;
  c.recruited = 0;
  // Between the rings: crossbowmen and swordsmen in the gate yard, pikes and halberds in the side yards; the sally by the gate.
  const garrison = posted(world, CAMPAIGN.fortressGarrison, [[-30, front], [30, front], [-side, 0], [side, 0]]);
  c.campIds = garrison.ids;
  c.posts = garrison.posts;
  const sally = posted(world, CAMPAIGN.sally, [[-9, o.frontM - 10], [9, o.frontM - 10]]);
  c.sallyIds = sally.ids;
  c.sallyPosts = sally.posts;
  c.sallyOutS = -1;
  c.sallyNextS = 0;
  // The lord's guard in the inner yard, before the donjon.
  const yard = (F.donjonAtM + F.donjonHalfM + n.frontM) / 2;
  const guard = posted(world, CAMPAIGN.guard, [[-16, yard], [16, yard], [0, yard]]);
  c.guardIds = guard.ids;
  c.guardPosts = guard.posts;
  c.fortWallCells = fortressWallCells(world);
  c.breachS = -1;
  c.noArmyS = 0;
}

/** Standing wall cells of the fortress (the computer's). */
function fortressWallCells(world: World): number {
  let n = 0;
  const nav = world.nav;
  for (let i = 0; i < nav.wallHp.length; i++) if (nav.wallHp[i] !== 0 && nav.wallSide[i] === COMPUTER) n++;
  return n;
}

/** Mission 4: the settlement's burnt buildings round its market, the player's, to rebuild for half their price. */
function layRuins(world: World): void {
  const village = settlement(world);
  const town = world.towns[PLAYER];
  let placed = 0;
  for (let k = 0; k < 24 && placed < CAMPAIGN.ruins.length; k++) {
    const a = (k / 24) * Math.PI * 2 + 0.3;
    const radius = 46 + (k % 2) * 12;
    const x = village.x + Math.sin(a) * radius;
    const z = village.z + Math.cos(a) * radius;
    const r = TOWN.buildingRadiusM;
    if ([[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].some(([dx, dz]) => isImpassable(x + (dx as number), z + (dz as number)))) continue;
    if (town.plots.some((b) => b !== null && hypot2(b.x - x, b.z - z) < r * 2 + TOWN.buildingGapM + 2)) continue;
    const kind = CAMPAIGN.ruins[placed] as BuildingKind;
    const kept = { ...town.stock };
    for (const id of RESOURCE_IDS) town.stock[id] += 10000;
    // Doors towards the market.
    const yaw = Math.atan2(village.x - x, village.z - z);
    const plot = startBuilding(town, kind, { x, z, yawRad: yaw, spotX: x + Math.sin(yaw) * 9, spotZ: z + Math.cos(yaw) * 9, strips: [] });
    Object.assign(town.stock, kept);
    stampBuilding(world.nav, x, z, r, true);
    const b = town.plots[plot];
    if (!b) continue;
    b.constructionLeftS = 0;
    b.constructionTotalS = 0;
    b.matDelivered = b.matTotal = 0;
    b.matWaiting.wood = b.matWaiting.stone = b.matWaiting.planks = 0;
    b.ruin = true;
    placed++;
  }
}

/** Lays the mission out over a new world (the map and keeps are the address's) and returns its state. */
export function setupCampaign(world: World, setup: CampaignSetup): CampaignState {
  const player = world.towns[PLAYER];
  const enemy = world.towns[COMPUTER];
  player.armyCap = CAMPAIGN.maxSoldiersPerSide;
  enemy.armyCap = CAMPAIGN.maxSoldiersPerSide;
  const [campX, campZ] = along(CAMPAIGN.campAlong);
  const c: CampaignState = {
    mission: setup.mission,
    tribute: {},
    dueS: 0,
    paid: false,
    regimentsAtPayment: 0,
    campX,
    campZ,
    campIds: [],
    attacking: false,
    foragerIds: [],
    foragersBackS: 0,
    thinkS: 0,
    startMen: 0,
    stars: 0,
  };
  // The invader has no town of his own in the campaign: his camp, the settlement he holds, his raids. In the
  // last mission his town works behind the fortress's walls (laid by the scenario, no computer player): its
  // keep is the donjon, drawn from the castle model, too strong to be worth battering; the war is won in its yard.
  enemy.absent = true;
  if (setup.mission === 5) enemy.keepHp = CAMPAIGN.fortressKeepHp;
  else {
    enemy.keepHp = 0;
    world.people = world.people.filter((p) => p.side !== COMPUTER);
  }
  player.stock.gold += setup.gold;
  // A town already at work: food, timber, stone and the iron that becomes weapons.
  const town: BuildingKind[] = ['house', 'house', 'house', 'house', 'farm', 'farm', 'windmill', 'bakery', 'woodcutter', 'quarry', 'ironMine', 'smelter', 'smithy'];
  if (setup.mission >= 2) town.push('house', 'house', 'barracks', 'pigFarm', 'tannery', 'armourer');
  if (setup.mission >= 4) town.push('house', 'house', 'farm', 'windmill', 'bakery', 'stable', 'fletcher', 'market');
  if (setup.mission >= 5) town.push('foundry');
  for (const kind of town) buildNow(world, kind);
  if (setup.mission === 1) {
    player.stock.gold += 300;
    player.stock.wood += 120;
    player.stock.stone += 80;
    player.stock.bread += 60;
    c.tribute = { ...CAMPAIGN.tribute };
    c.dueS = CAMPAIGN.tributeSeconds;
    c.campIds = host(world, CAMPAIGN.invaders, campX, campZ);
    bringArmy(world, setup.carried, ['militia', 'militia']);
  } else if (setup.mission === 2) {
    player.stock.gold += 600;
    player.stock.wood += 150;
    player.stock.stone += 100;
    player.stock.bread += 120;
    c.campIds = host(world, CAMPAIGN.campGarrison, campX, campZ, 3);
    // The foragers in the villages on either flank of the camp.
    for (const [i, kind] of CAMPAIGN.foragers.entries()) {
      const [fx, fz] = along(CAMPAIGN.campAlong - 0.04, (i === 0 ? -1 : 1) * 150);
      c.foragerIds.push(...host(world, [kind], fx, fz));
    }
    c.foragersBackS = CAMPAIGN.foragersBackEveryS;
    bringArmy(world, setup.carried, ['pikemen', 'swordsmen', 'archers', 'crossbowmen']);
  } else if (setup.mission === 3) {
    player.stock.gold += 600;
    player.stock.wood += 150;
    player.stock.stone += 120;
    player.stock.bread += 150;
    const village = settlement(world);
    village.owner = COMPUTER;
    c.campX = village.x;
    c.campZ = village.z;
    // The garrison round the village's market, and the watchtower before it on the side of the player's town.
    c.campIds = host(world, CAMPAIGN.settlementGarrison, village.x, village.z, 2);
    c.posts = c.campIds.flatMap((id) => {
      const r = findRegiment(world, id) as Regiment;
      return [r.anchorX, r.anchorZ];
    });
    const len = Math.hypot(townX(COMPUTER) - townX(PLAYER), townZ(COMPUTER) - townZ(PLAYER));
    const [tx, tz] = along(0.5 - 42 / len, 14);
    scenarioTower(world, COMPUTER, tx, tz, CAMPAIGN.towerCrossbowmen);
    c.reliefIds = [];
    c.reliefAtSettlementS = -1;
    bringArmy(world, setup.carried, ['swordsmen', 'pikemen', 'crossbowmen', 'crossbowmen', 'heavyCavalry']);
  } else if (setup.mission === 4) {
    player.stock.gold += 800;
    player.stock.wood += 250;
    player.stock.stone += 250;
    player.stock.bread += 200;
    // The settlement taken back in mission 3 is the player's: its market pays; what burnt in the fighting stands in ruins.
    settlement(world).owner = PLAYER;
    layRuins(world);
    c.raidsSent = 0;
    c.raidIds = [];
    bringArmy(world, setup.carried, ['swordsmen', 'pikemen', 'crossbowmen', 'heavyCavalry']);
  } else if (setup.mission === 5) {
    player.stock.gold += 1500;
    player.stock.wood += 300;
    player.stock.stone += 200;
    player.stock.iron += 40;
    player.stock.bread += 250;
    layFortress(world, c);
    bringArmy(world, setup.carried, ['swordsmen', 'swordsmen', 'pikemen', 'halberdiers', 'crossbowmen', 'crossbowmen', 'heavyCavalry', 'heavyCavalry']);
    // The siege train: guns for the gates, mortars for the walls.
    const facing = facingToEnemy(PLAYER);
    CAMPAIGN.siegeTrain.forEach((kind, i) => {
      const x = rallyX(PLAYER) + Math.cos(facing) * (i - 1.5) * 14 + Math.sin(facing) * 24;
      const z = rallyZ(PLAYER) - Math.sin(facing) * (i - 1.5) * 14 + Math.cos(facing) * 24;
      campaignRegiment(spawnRegiment(world, PLAYER, kind, x, z, facing));
    });
    c.enginesAtStart = CAMPAIGN.siegeTrain.length;
    c.reliefIds = [];
  }
  c.buildingsLost = 0;
  c.startMen = world.regiments.filter((r) => r.side === PLAYER).reduce((n, r) => n + r.aliveMen, 0);
  return c;
}

/** Whether every good the tribute asks for lies in the keep. */
export function canPayTribute(world: World, c: CampaignState): boolean {
  const stock = world.towns[PLAYER].stock;
  return !c.paid && !c.attacking && Object.entries(c.tribute).every(([id, n]) => stock[id as ResourceId] >= (n ?? 0));
}

/** Mission 1: pays the tribute from the keep; the invader takes it and the mission is won. */
export function payTribute(world: World, c: CampaignState): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  if (!canPayTribute(world, c)) return 'cannotAfford';
  const stock = world.towns[PLAYER].stock;
  for (const [id, n] of Object.entries(c.tribute)) stock[id as ResourceId] -= n ?? 0;
  c.paid = true;
  c.regimentsAtPayment = world.regiments.filter((r) => r.side === PLAYER && r.aliveMen > 0 && !r.def.engine).length;
  return 'ok';
}

function living(world: World, ids: readonly number[]): Regiment[] {
  const out: Regiment[] = [];
  for (const id of ids) {
    const r = findRegiment(world, id);
    if (r && r.aliveMen > 0) out.push(r);
  }
  return out;
}

function win(world: World, c: CampaignState, stars: number): void {
  if (world.winner !== -1) return;
  c.stars = stars;
  world.winner = PLAYER;
  world.events.push('gameOver', 0, 0, PLAYER);
}

/** The mission's clock and its enemy: what he does, and whether it is won. Every step. */
export function stepCampaign(world: World, c: CampaignState, dtSeconds: number): void {
  if (world.winner !== -1) return;
  c.thinkS -= dtSeconds;
  if (c.thinkS > 0) return;
  c.thinkS = 1;
  const enemies = world.regiments.filter((r) => r.side === COMPUTER && r.aliveMen > 0);
  if (c.mission === 1) {
    if (c.paid) {
      win(world, c, c.regimentsAtPayment >= 4 ? 2 : 1);
      return;
    }
    // Beaten in the field: the host gone, or every one of its regiments fleeing for CAMPAIGN.routWinS
    // without a break (however many men it still has). Stars by what the defence cost.
    const allFleeing = c.attacking && enemies.length > 0 && enemies.every((r) => r.state === 'routing');
    c.routS = allFleeing ? (c.routS ?? 0) + 1 : 0;
    if (enemies.length === 0 || c.routS >= CAMPAIGN.routWinS) {
      const left = world.regiments.filter((r) => r.side === PLAYER).reduce((n, r) => n + r.aliveMen, 0);
      win(world, c, left >= 100 ? 3 : left >= 50 ? 2 : 1);
      return;
    }
    if (!c.attacking && world.timeS >= c.dueS) c.attacking = true;
    const camp = living(world, c.campIds);
    adjustStances(world, COMPUTER);
    // Before the day: they keep to the camp and see off anyone who comes near it.
    if (camp.length > 0) fight(world, camp, c.attacking ? 600 : 90, c.attacking);
    return;
  }
  if (c.mission === 2) {
    if (enemies.length === 0) {
      const men = world.regiments.filter((r) => r.side === PLAYER).reduce((n, r) => n + r.aliveMen, 0);
      win(world, c, men >= c.startMen * 0.7 ? 2 : 1);
      return;
    }
    // Every few minutes one band of foragers comes back to the camp: the longer the player waits, the stronger it is.
    c.foragersBackS -= 1;
    const out = living(world, c.foragerIds);
    if (c.foragersBackS <= 0 && out.length > 0) {
      c.foragersBackS = CAMPAIGN.foragersBackEveryS;
      const back = out[0] as Regiment;
      cmdMove(world, back.id, c.campX, c.campZ - 20, facingToEnemy(COMPUTER), false);
      c.foragerIds = c.foragerIds.filter((id) => id !== back.id);
      c.campIds.push(back.id);
    }
    adjustStances(world, COMPUTER);
    const camp = living(world, c.campIds).filter((r) => r.order !== 'move');
    if (camp.length > 0) fight(world, camp, 140, false);
    for (const r of living(world, c.foragerIds)) if (hypot2(r.centreX - c.campX, r.centreZ - c.campZ) > 40) fight(world, [r], 80, false);
    return;
  }
  if (c.mission === 3) stepSettlement(world, c);
  else if (c.mission === 4) stepRebuilding(world, c);
  else if (c.mission === 5) stepFortress(world, c);
}

/** Mission 3: the garrison holds the settlement, the relief comes; won once the settlement is the player's. */
function stepSettlement(world: World, c: CampaignState): void {
  const village = settlement(world);
  if (village.owner === PLAYER) {
    // Taken before the relief came: the second star.
    win(world, c, world.timeS < CAMPAIGN.reliefAtS ? 2 : 1);
    return;
  }
  adjustStances(world, COMPUTER);
  // The relief from the far edge of the map, to the settlement.
  const relief = c.reliefIds ?? [];
  if (relief.length === 0 && world.timeS >= CAMPAIGN.reliefAtS) {
    const [rx, rz] = along(0.97);
    c.reliefIds = host(world, CAMPAIGN.relief, rx, rz, 3);
    for (const id of c.reliefIds) cmdMove(world, id, village.x + (world.rng.next() - 0.5) * 30, village.z + 25, facingToEnemy(COMPUTER), false);
    world.events.push('reliefCame', rx, rz, COMPUTER);
  }
  const coming = living(world, c.reliefIds ?? []);
  if (coming.length > 0 && (c.reliefAtSettlementS ?? -1) < 0 && coming.some((r) => hypot2(r.centreX - village.x, r.centreZ - village.z) < 60)) c.reliefAtSettlementS = world.timeS;
  const striking = (c.reliefAtSettlementS ?? -1) >= 0 && world.timeS - (c.reliefAtSettlementS as number) >= CAMPAIGN.reliefStrikesAfterS;
  const garrison = living(world, c.campIds);
  if (striking) {
    // The settlement held and the relief in: his whole force marches on the town.
    const all = [...garrison, ...coming];
    if (all.length > 0) fight(world, all, 600, true);
    return;
  }
  // The garrison fights whoever comes near, and goes back to its post when nobody does.
  const posts = c.posts ?? [];
  c.campIds.forEach((id, i) => {
    const r = garrison.find((g) => g.id === id);
    if (!r) return;
    const px = posts[i * 2] ?? village.x;
    const pz = posts[i * 2 + 1] ?? village.z;
    fight(world, [r], CAMPAIGN.garrisonReachM, false);
    if (r.order === 'attackRegiment' && hypot2(r.centreX - px, r.centreZ - pz) > CAMPAIGN.garrisonReachM * 1.4) cmdMove(world, r.id, px, pz, facingToEnemy(COMPUTER), false);
    else if (r.order === 'hold' && hypot2(r.anchorX - px, r.anchorZ - pz) > 12) cmdMove(world, r.id, px, pz, facingToEnemy(COMPUTER), false);
  });
  // The relief, once at the settlement, stands with the garrison and fights there.
  const arrived = coming.filter((r) => r.order !== 'move');
  if (arrived.length > 0) fight(world, arrived, CAMPAIGN.garrisonReachM, false);
}

/** Sends each of `army` at the nearest of the player's regiments that `inside` holds for; back to its post when there is none. */
function holdGround(world: World, army: readonly Regiment[], ids: readonly number[], posts: readonly number[], inside: (r: Regiment) => boolean): void {
  const foes = world.regiments.filter((r) => r.side === PLAYER && r.aliveMen > 0 && inside(r));
  for (const r of army) {
    const i = ids.indexOf(r.id);
    const px = posts[i * 2] ?? r.anchorX;
    const pz = posts[i * 2 + 1] ?? r.anchorZ;
    let best: Regiment | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const f of foes) {
      const d = hypot2(f.centreX - r.centreX, f.centreZ - r.centreZ);
      if (d < bestD) {
        best = f;
        bestD = d;
      }
    }
    if (best) {
      // Shooters shoot from where they stand.
      if (r.def.missileRangeM > 0) continue;
      if (r.order !== 'attackRegiment' || r.targetRegimentId !== best.id) cmdAttackRegiment(world, r.id, best.id);
    } else if (r.order !== 'move' && hypot2(r.anchorX - px, r.anchorZ - pz) > 8) cmdMove(world, r.id, px, pz, fortressFrame().yawRad, false);
  }
}

/** Mission 5: the fortress holds; the sally strikes at the guns; the relief comes from behind; won when the guard is broken. */
function stepFortress(world: World, c: CampaignState): void {
  const guard = living(world, c.guardIds ?? []);
  const army = playerArmy(world);
  // The player's walls are down when the fortress has lost its first stretch.
  if ((c.breachS ?? -1) < 0 && fortressWallCells(world) < (c.fortWallCells ?? 0)) {
    c.breachS = world.timeS;
    world.events.push('breach', fortressFrame().x, fortressFrame().z, PLAYER);
  }
  if (guard.every((r) => r.state === 'routing')) {
    const engines = world.regiments.filter((r) => r.side === PLAYER && r.aliveMen > 0 && r.def.engine).length;
    win(world, c, (c.breachS ?? -1) >= 0 && (c.breachS as number) <= CAMPAIGN.breachStarS && engines >= (c.enginesAtStart ?? 0) ? 2 : 1);
    return;
  }
  // No army left at all (and none raised) for a minute: the war is lost.
  c.noArmyS = army.regiments === 0 ? (c.noArmyS ?? 0) + 1 : 0;
  if ((c.noArmyS ?? 0) >= CAMPAIGN.noArmyLostS) {
    world.winner = COMPUTER;
    world.events.push('gameOver', 0, 0, COMPUTER);
    return;
  }
  adjustStances(world, COMPUTER);
  // Between the rings: whoever has come over the outer wall. In the inner yard: whoever has come over the inner.
  holdGround(world, living(world, c.campIds), c.campIds, c.posts ?? [], (r) => insideRing(OUTER, r.centreX, r.centreZ));
  holdGround(world, guard, c.guardIds ?? [], c.guardPosts ?? [], (r) => insideRing(INNER, r.centreX, r.centreZ));
  // The sally: out of the gate at the nearest gun when one comes near, back in after a while.
  const sally = living(world, c.sallyIds ?? []);
  const [gx, gz] = fortressPoint(0, OUTER.frontM);
  const guns = world.regiments.filter((r) => r.side === PLAYER && r.aliveMen > 0 && r.def.engine && hypot2(r.centreX - gx, r.centreZ - gz) < CAMPAIGN.sallyWithinM);
  const out = (c.sallyOutS ?? -1) >= 0;
  if (!out && sally.length > 0 && guns.length > 0 && world.timeS >= (c.sallyNextS ?? 0)) {
    c.sallyOutS = world.timeS;
    world.events.push('sally', gx, gz, COMPUTER);
  }
  if ((c.sallyOutS ?? -1) >= 0) {
    const over = world.timeS - (c.sallyOutS as number) > CAMPAIGN.sallyForS || guns.length === 0;
    for (const r of sally) {
      const i = (c.sallyIds ?? []).indexOf(r.id);
      if (over) {
        cmdMove(world, r.id, c.sallyPosts?.[i * 2] ?? gx, c.sallyPosts?.[i * 2 + 1] ?? gz, fortressFrame().yawRad, false);
        continue;
      }
      const target = r.order === 'attackRegiment' ? findRegiment(world, r.targetRegimentId) : null;
      if (target && target.aliveMen > 0 && target.def.engine) continue;
      let best: Regiment | null = null;
      for (const g of guns) if (!best || hypot2(g.centreX - r.centreX, g.centreZ - r.centreZ) < hypot2(best.centreX - r.centreX, best.centreZ - r.centreZ)) best = g;
      if (best) cmdAttackRegiment(world, r.id, best.id);
    }
    if (over) {
      c.sallyOutS = -1;
      c.sallyNextS = world.timeS + CAMPAIGN.sallyEveryS;
    }
  } else holdGround(world, sally, c.sallyIds ?? [], c.sallyPosts ?? [], (r) => insideRing(OUTER, r.centreX, r.centreZ));
  // His barracks send out a regiment every few minutes while they stand: it joins the garrison between the rings.
  if (world.timeS >= (c.recruitNextS ?? Number.POSITIVE_INFINITY)) {
    c.recruitNextS = world.timeS + CAMPAIGN.fortressRecruitEveryS;
    const town = world.towns[COMPUTER];
    const plot = town.plots.findIndex((b) => b !== null && b.kind === 'barracks' && isBuilt(b));
    if (plot >= 0) {
      const kind = CAMPAIGN.fortressRecruits[(c.recruited ?? 0) % CAMPAIGN.fortressRecruits.length] as UnitKind;
      c.recruited = (c.recruited ?? 0) + 1;
      const r = spawnRegiment(world, COMPUTER, kind, doorX(town, plot), doorZ(town, plot), fortressFrame().yawRad);
      campaignRegiment(r);
      fillRegiment(r, CAMPAIGN.regimentMaxMen);
      c.campIds.push(r.id);
      (c.posts ??= []).push(r.anchorX, r.anchorZ);
      world.events.push('recruited', r.anchorX, r.anchorZ, COMPUTER);
    }
  }
  // The relief, from behind the player's camp.
  if ((c.reliefIds ?? []).length === 0 && world.timeS >= CAMPAIGN.fortressReliefAtS) {
    const [rx, rz] = behindCamp();
    c.reliefIds = host(world, CAMPAIGN.fortressRelief, rx, rz, 4);
    world.events.push('reliefCame', rx, rz, COMPUTER);
  }
  const relief = living(world, c.reliefIds ?? []);
  if (relief.length > 0) fight(world, relief, 600, true);
}

/** A point behind the player's camp, on the map, where his relief comes from. */
function behindCamp(): [number, number] {
  const f = fortressFrame();
  const limit = 330;
  return [Math.max(-limit, Math.min(limit, townX(PLAYER) + f.fx * 70)), Math.max(-limit, Math.min(limit, townZ(PLAYER) + f.fz * 70))];
}

/** Men and regiments the player fields (engines count as regiments, their crews as men). */
export function playerArmy(world: World): { men: number; regiments: number } {
  let men = 0;
  let regiments = 0;
  for (const r of world.regiments) {
    if (r.side !== PLAYER || r.aliveMen === 0) continue;
    men += r.aliveMen;
    regiments++;
  }
  return { men, regiments };
}

/** Mission 4: raids come one after another; won with the army and the keep raised. */
function stepRebuilding(world: World, c: CampaignState): void {
  const army = playerArmy(world);
  if (army.men >= CAMPAIGN.armyGoalMen && army.regiments >= CAMPAIGN.armyGoalRegiments && world.towns[PLAYER].keepLevel >= CAMPAIGN.keepGoalLevel) {
    win(world, c, (c.buildingsLost ?? 0) === 0 ? 2 : 1);
    return;
  }
  const sent = c.raidsSent ?? 0;
  const next = CAMPAIGN.raids[sent];
  if (next && world.timeS >= next.atS) {
    const [rx, rz] = along(0.97, (sent % 2 === 0 ? 1 : -1) * 60);
    c.raidIds = [...(c.raidIds ?? []), ...host(world, next.kinds, rx, rz, 4)];
    c.raidsSent = sent + 1;
    world.events.push('raidCame', rx, rz, COMPUTER);
  }
  adjustStances(world, COMPUTER);
  const raiders = living(world, c.raidIds ?? []);
  // A raid goes for the town: whoever stands in its way, then the keep.
  if (raiders.length > 0) fight(world, raiders, 600, true);
}

/** The army that goes on to the next mission: the strongest regiments (not engines), and some of the gold. */
export function carryOut(world: World): { carried: CarriedRegiment[]; gold: number } {
  const regiments = world.regiments
    .filter((r) => r.side === PLAYER && r.aliveMen > 0 && !r.def.engine)
    .sort((a, b) => b.aliveMen * (1 + b.xp) - a.aliveMen * (1 + a.xp))
    .slice(0, CAMPAIGN.carryRegiments)
    .map((r) => ({ kind: r.kind, men: r.aliveMen, xp: r.xp }));
  const gold = Math.min(CAMPAIGN.carryGoldMax, Math.floor(world.towns[PLAYER].stock.gold * CAMPAIGN.carryGoldShare));
  return { carried: regiments, gold };
}

/** Seconds a regiment must have been out of the fight before it can merge (as for filling it). */
export const MERGE_QUIET_S = REINFORCE.quietS;
