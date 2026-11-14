import { doorOfX, doorOfZ } from './placement.ts';
import { type AiCharacter, AI_TUNING, ARMY, MAP, PEOPLE, TOWER, TOWN, UNITS } from '../config.ts';
import { Rng } from '../core/rng.ts';
import { type AiState, createAiState, createDefence, type DefenceState, stepAi, stepDefence } from './ai.ts';
import { stepMelee, stepMorale } from './combat.ts';
import { createTown, stepEconomy, type Town } from './economy.ts';
import { EventQueue } from './events.ts';
import { type Arrow, createArrowPool, stepMissiles } from './missiles.ts';
import { SpatialGrid, stepAnchors, stepSoldiers } from './movement.ts';
import { doorX, doorZ, KEEP, type Person, spawnPerson, stepPeople } from './people.ts';
import { createRegiment, type Regiment } from './regiment.ts';
import { cmdMove, inHomeLand } from './commands.ts';
import { createNav, type Nav, stampBuilding } from './nav.ts';
import { createStand, type Stand, stepStand } from './trees.ts';
import { createPoints, type Point, stepPoints } from './points.ts';
import { facingToEnemy, rallyX, rallyZ, townX, townZ } from './terrain.ts';
import { COMPUTER, type Difficulty, PLAYER, type Side, type UnitKind } from './types.ts';
import { hypot2 } from '../core/hypot.ts';

// The whole game state and its one fixed update order (rules §10):
//
//   1. computer player thinks (issues the same commands the player does)
//   2. townspeople carry, work and build; then the economy's stores and clocks; trained regiments take the field
//   3. regiments move their formations (anchors, facing, fatigue)
//   4. soldiers look for enemies, steer to their places or their enemy, push apart
//   5. melee blows, blows on buildings
//   6. archers and the keeps shoot; arrows fly and land
//   7. morale, rout and rally; the fallen and the destroyed are cleared
//   8. victory check

export interface World {
  timeS: number;
  rng: Rng;
  towns: [Town, Town];
  regiments: Regiment[];
  /** The townspeople of both sides. */
  people: Person[];
  /** Clock to the next handing-out of jobs. */
  rolesS: number;
  /** Roads and where buildings stand, for finding ways. */
  nav: Nav;
  arrows: Arrow[];
  events: EventQueue;
  /** -1 while the game is being played. */
  winner: Side | -1;
  nextRegimentId: number;
  /** Null switches the computer player off (tests, sandbox). */
  ai: AiState | null;
  grid: SpatialGrid;
  keepShotCooldownS: [number, number];
  difficulty: Difficulty;
  /** Men each side has brought down, for the end screen. */
  kills: [number, number];
  stepCount: number;
  /** Which trees are felled, planted or growing back (trees.ts). */
  stand: Stand;
  /** Gates set into walls, for the view (the rules read nav.wallGate). */
  gates: Gate[];
  /** The places in the middle worth holding (points.ts). */
  points: Point[];
  mode: GameMode;
  /** The defence's waves; null in other games. */
  defence: DefenceState | null;
}

/** A gate: its side, its wall cells, where its middle is and its line (as nav.wallDir). */
export interface Gate {
  side: Side;
  cells: number[];
  x: number;
  z: number;
  dir: number;
}

export interface WorldOptions {
  seed: number;
  difficulty: Difficulty;
  /** False leaves the computer's town idle. */
  computerPlays: boolean;
  /** The computer's character (skirmish), and the kind of game: a skirmish, the defence (waves), or the tutorial (alone). */
  character?: AiCharacter;
  mode?: GameMode;
}

export type GameMode = 'skirmish' | 'defence' | 'tutorial';

export function createWorld(options: WorldOptions): World {
  const tuning = AI_TUNING[options.difficulty];
  const world: World = {
    timeS: 0,
    rng: new Rng(options.seed),
    towns: [createTown(PLAYER), createTown(COMPUTER, tuning.productionFactor)],
    regiments: [],
    people: [],
    rolesS: 0,
    nav: createNav(),
    stand: createStand(),
    gates: [],
    points: createPoints(),
    arrows: createArrowPool(),
    events: new EventQueue(),
    winner: -1,
    nextRegimentId: 1,
    mode: options.mode ?? 'skirmish',
    ai: options.computerPlays && (options.mode ?? 'skirmish') === 'skirmish' ? createAiState(COMPUTER, options.character ?? 'balanced') : null,
    defence: options.mode === 'defence' ? createDefence() : null,
    grid: new SpatialGrid(MAP.halfM + 40, 2, 2 * ARMY.maxSoldiersPerSide + 64),
    keepShotCooldownS: [0, 0],
    difficulty: options.difficulty,
    kills: [0, 0],
    stepCount: 0,
  };
  for (const side of [PLAYER, COMPUTER] as const) stampBuilding(world.nav, townX(side), townZ(side), TOWN.keepRadiusM, true);
  // Each keep starts with its household: the first carriers and builders.
  for (const side of [PLAYER, COMPUTER] as const) {
    const town = world.towns[side];
    for (let i = 0; i < PEOPLE.keepResidents; i++) spawnPerson(world, side, doorX(town, KEEP) + (i % 4) - 1.5, doorZ(town, KEEP) + Math.floor(i / 4) - 0.5, KEEP);
  }
  return world;
}

export function findRegiment(world: World, id: number): Regiment | null {
  if (id < 0) return null;
  for (const r of world.regiments) if (r.id === id) return r;
  return null;
}

/** Living men of a side on the field. */
export function menAlive(world: World, side: Side): number {
  let men = 0;
  for (const r of world.regiments) if (r.side === side) men += r.aliveMen;
  // Men in the towers are soldiers too: they eat and count against the army's limit.
  for (const b of world.towns[side].plots) if (b) men += b.garrison;
  return men;
}

/** Regiments marching to man a tower go in when they reach its door: up to its free places, the rest stay out. */
function stepGarrisoning(world: World): void {
  for (const r of world.regiments) {
    if (r.garrisonPlot < 0 || r.aliveMen === 0) continue;
    const b = world.towns[r.side].plots[r.garrisonPlot];
    if (!b || b.kind !== 'tower' || (b.garrisonKind !== null && b.garrisonKind !== r.kind) || b.garrison >= TOWER.maxGarrison) {
      r.garrisonPlot = -1;
      continue;
    }
    if (hypot2(r.centreX - doorOfX(b), r.centreZ - doorOfZ(b)) > TOWER.enterRadiusM) continue;
    let places = TOWER.maxGarrison - b.garrison;
    for (const s of r.soldiers) {
      if (places === 0) break;
      if (!s.alive) continue;
      s.alive = false;
      s.deadS = 999;
      r.aliveMen -= 1;
      b.garrison += 1;
      places -= 1;
    }
    b.garrisonKind = r.kind;
    r.garrisonPlot = -1;
    world.events.push('garrisoned', b.x, b.z, r.side);
  }
}

/** Puts a new regiment on the field. Tests and the sandbox call this directly; the game goes through recruiting. */
export function spawnRegiment(world: World, side: Side, kind: UnitKind, x: number, z: number, facingRad: number): Regiment {
  const r = createRegiment(world.nextRegimentId++, side, kind, x, z, facingRad);
  world.regiments.push(r);
  return r;
}

/** Regiments being re-armed: when the time is up they become the new kind, wounds and morale kept as shares. */
function stepRearming(world: World, dtSeconds: number): void {
  for (const r of world.regiments) {
    if (r.rearmTo === null || r.aliveMen === 0) continue;
    r.rearmLeftS -= dtSeconds;
    if (r.rearmLeftS > 0) continue;
    const from = r.def;
    const to = UNITS[r.rearmTo];
    for (const s of r.soldiers) if (s.alive) s.hp = (s.hp / from.hp) * to.hp;
    r.morale = (r.morale / from.morale) * to.morale;
    r.kind = r.rearmTo;
    r.def = to;
    r.rearmTo = null;
    world.events.push('rearmed', r.centreX, r.centreZ, r.side);
  }
}

/** A home guard that has chased an enemy out of the town's land stops there and comes back. */
function leashHomeGuards(world: World): void {
  for (const r of world.regiments) {
    // Only one that is on the move (a chase, a march): a guard standing where it was put stays there.
    if (!r.def.defenceOnly || r.aliveMen === 0 || r.state !== 'formed' || r.order === 'hold') continue;
    if (inHomeLand(r.side, r.centreX, r.centreZ)) continue;
    const back = ARMY.homeGuardRadiusM - 10;
    const dx = r.centreX - townX(r.side);
    const dz = r.centreZ - townZ(r.side);
    const d = hypot2(dx, dz) || 1;
    cmdMove(world, r.id, townX(r.side) + (dx / d) * back, townZ(r.side) + (dz / d) * back, null, false);
  }
}

function fieldTrained(world: World, town: Town): void {
  while (town.trained.length > 0) {
    const kind = town.trained.shift() as UnitKind;
    // Each new regiment forms up a little to the side of the last, so they do not stack.
    let sameSide = 0;
    for (const r of world.regiments) if (r.side === town.side) sameSide++;
    const facing = facingToEnemy(town.side);
    const offsetM = ((sameSide % 5) - 2) * 11;
    const x = rallyX(town.side) + Math.cos(facing) * offsetM - Math.sin(facing) * Math.floor(sameSide / 5) * 9;
    const z = rallyZ(town.side) - Math.sin(facing) * offsetM - Math.cos(facing) * Math.floor(sameSide / 5) * 9;
    const r = spawnRegiment(world, town.side, kind, x, z, facing);
    world.events.push('recruited', r.centreX, r.centreZ, town.side);
  }
}

export function stepWorld(world: World, dtSeconds: number): void {
  if (world.winner !== -1) return;
  world.timeS += dtSeconds;
  if (world.ai) stepAi(world, world.ai, dtSeconds);
  if (world.defence) stepDefence(world, world.defence, dtSeconds);
  stepPeople(world, dtSeconds);
  for (const town of world.towns) {
    const wasStarving = town.starving;
    stepEconomy(town, dtSeconds, menAlive(world, town.side));
    if (town.starving !== wasStarving) world.events.push(town.starving ? 'starving' : 'fed', 0, 0, town.side);
    fieldTrained(world, town);
    while (town.finishedPlots.length > 0) {
      const plot = town.finishedPlots.pop() as number;
      const b = plot >= 0 ? town.plots[plot] : null;
      if (b) world.events.push('built', b.x, b.z, town.side);
      // The keep raised a level.
      else if (plot === -1) world.events.push('keepRaised', townX(town.side), townZ(town.side), town.side);
    }
  }
  stepRearming(world, dtSeconds);
  stepGarrisoning(world);
  // Once a second is enough to turn back a guard that has run too far.
  if (world.stepCount % 60 === 0) {
    leashHomeGuards(world);
    stepStand(world.stand, world.timeS);
    stepPoints(world, 1);
  }
  stepAnchors(world, dtSeconds);
  stepSoldiers(world, dtSeconds);
  stepMelee(world);
  stepMissiles(world, dtSeconds);
  stepMorale(world, dtSeconds);
  for (const town of world.towns) {
    if (town.keepHp <= 0 && world.winner === -1) {
      world.winner = town.side === PLAYER ? COMPUTER : PLAYER;
      world.events.push('gameOver', 0, 0, world.winner);
    }
  }
}
