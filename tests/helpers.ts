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

/** Lets the test runner breathe: vitest gives up on a worker silent for a minute (its RPC timeout). */
export const breathe = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** As runUntil, in stretches of `stretchS` game seconds with the runner given a breath between them. */
export async function runUntilAsync(world: World, maxSeconds: number, done: () => boolean, stretchS = 10): Promise<number> {
  let spent = 0;
  while (spent < maxSeconds) {
    const took = runUntil(world, Math.min(stretchS, maxSeconds - spent), done);
    spent += took;
    if (done()) return spent;
    await breathe();
  }
  return maxSeconds;
}
