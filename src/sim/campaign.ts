import { CAMPAIGN, REINFORCE } from '../config.ts';
import { hypot2 } from '../core/hypot.ts';
import { adjustStances, fight } from './ai.ts';
import { cmdBuild, cmdBuildRoad, cmdMove } from './commands.ts';
import { doorX, doorZ, KEEP } from './people.ts';
import { assignSlots, newSoldier, type Regiment } from './regiment.ts';
import { planSite } from './sitePlanner.ts';
import { facingToEnemy, isWater, rallyX, rallyZ, townX, townZ } from './terrain.ts';
import { type BuildingKind, COMPUTER, type CommandResult, PLAYER, RESOURCE_IDS, type ResourceId, type UnitKind } from './types.ts';
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
  layout: 'field' | 'river' | 'forest';
  start: number;
  /** Ready to play (the later missions come in later stages). */
  ready: boolean;
}

export const MISSIONS: readonly MissionDef[] = [
  { n: 1, layout: 'river', start: 0, ready: true },
  { n: 2, layout: 'river', start: 0, ready: true },
  { n: 3, layout: 'field', start: 1, ready: false },
  { n: 4, layout: 'field', start: 1, ready: false },
  { n: 5, layout: 'forest', start: 2, ready: false },
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
  // The invader has no town in the first missions: only his camp.
  if (setup.mission <= 2) {
    enemy.absent = true;
    enemy.keepHp = 0;
    world.people = world.people.filter((p) => p.side !== COMPUTER);
  }
  player.stock.gold += setup.gold;
  // A town already at work: food, timber, stone and the iron that becomes weapons.
  const town: BuildingKind[] = ['house', 'house', 'house', 'house', 'farm', 'farm', 'windmill', 'bakery', 'woodcutter', 'quarry', 'ironMine', 'smelter', 'smithy'];
  if (setup.mission === 2) town.push('house', 'house', 'barracks', 'pigFarm', 'tannery', 'armourer');
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
  }
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
    // Beaten in the field (rarely: the host is made to win nine times in ten).
    if (enemies.length === 0) {
      win(world, c, 1);
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
  }
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
