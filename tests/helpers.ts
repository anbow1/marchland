import { SIM } from '../src/config.ts';
import { stepWorld, type World } from '../src/sim/world.ts';

/** Runs the world for a span of game time at the fixed step. */
export function run(world: World, seconds: number): void {
  const steps = Math.round(seconds / SIM.stepSeconds);
  for (let i = 0; i < steps; i++) stepWorld(world, SIM.stepSeconds);
}

/** Runs until `done` is true or `maxSeconds` pass; returns the game seconds it took. */
export function runUntil(world: World, maxSeconds: number, done: () => boolean): number {
  const steps = Math.round(maxSeconds / SIM.stepSeconds);
  for (let i = 0; i < steps; i++) {
    if (done()) return i * SIM.stepSeconds;
    stepWorld(world, SIM.stepSeconds);
  }
  return maxSeconds;
}
