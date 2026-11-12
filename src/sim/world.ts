import { AI_TUNING, ARMY, MAP, PEOPLE } from '../config.ts';
import { Rng } from '../core/rng.ts';
import { type AiState, createAiState, stepAi } from './ai.ts';
import { stepMelee, stepMorale } from './combat.ts';
import { createTown, stepEconomy, type Town } from './economy.ts';
import { EventQueue } from './events.ts';
import { type Arrow, createArrowPool, stepMissiles } from './missiles.ts';
import { SpatialGrid, stepAnchors, stepSoldiers } from './movement.ts';
import { doorX, doorZ, KEEP, type Person, spawnPerson, stepPeople } from './people.ts';
import { createRegiment, type Regiment } from './regiment.ts';
import { facingToEnemy, plotX, plotZ, rallyX, rallyZ } from './terrain.ts';
import { COMPUTER, type Difficulty, PLAYER, type Side, type UnitKind } from './types.ts';

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
}

export interface WorldOptions {
  seed: number;
  difficulty: Difficulty;
  /** False leaves the computer's town idle. */
  computerPlays: boolean;
}

export function createWorld(options: WorldOptions): World {
  const tuning = AI_TUNING[options.difficulty];
  const world: World = {
    timeS: 0,
    rng: new Rng(options.seed),
    towns: [createTown(PLAYER), createTown(COMPUTER, tuning.productionFactor)],
    regiments: [],
    people: [],
    rolesS: 0,
    arrows: createArrowPool(),
    events: new EventQueue(),
    winner: -1,
    nextRegimentId: 1,
    ai: options.computerPlays ? createAiState(COMPUTER) : null,
    grid: new SpatialGrid(MAP.halfM + 40, 2, 2 * ARMY.maxSoldiersPerSide + 64),
    keepShotCooldownS: [0, 0],
    difficulty: options.difficulty,
    kills: [0, 0],
    stepCount: 0,
  };
  // Each keep starts with its household: the first carriers and builders.
  for (const side of [PLAYER, COMPUTER] as const) {
    for (let i = 0; i < PEOPLE.keepResidents; i++) spawnPerson(world, side, doorX(side, KEEP) + (i % 4) - 1.5, doorZ(side, KEEP) + Math.floor(i / 4) - 0.5, KEEP);
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
  return men;
}

/** Puts a new regiment on the field. Tests and the sandbox call this directly; the game goes through recruiting. */
export function spawnRegiment(world: World, side: Side, kind: UnitKind, x: number, z: number, facingRad: number): Regiment {
  const r = createRegiment(world.nextRegimentId++, side, kind, x, z, facingRad);
  world.regiments.push(r);
  return r;
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
  stepPeople(world, dtSeconds);
  for (const town of world.towns) {
    const wasStarving = town.starving;
    stepEconomy(town, dtSeconds, menAlive(world, town.side));
    if (town.starving !== wasStarving) world.events.push(town.starving ? 'starving' : 'fed', 0, 0, town.side);
    fieldTrained(world, town);
    while (town.finishedPlots.length > 0) {
      const plot = town.finishedPlots.pop() as number;
      world.events.push('built', plotX(town.side, plot), plotZ(town.side, plot), town.side);
    }
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
