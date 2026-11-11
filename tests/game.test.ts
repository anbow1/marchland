import { describe, expect, it } from 'vitest';
import { ARMY, SIM } from '../src/config.ts';
import { createAiState, stepAi } from '../src/sim/ai.ts';
import { cmdAttackBuilding, cmdAttackRegiment } from '../src/sim/commands.ts';
import { COMPUTER, PLAYER, UNIT_KINDS } from '../src/sim/types.ts';
import { createWorld, menAlive, spawnRegiment, stepWorld, type World } from '../src/sim/world.ts';
import { run, runUntil } from './helpers.ts';

function fingerprint(world: World): string {
  const towns = world.towns.map((t) => `${t.keepHp.toFixed(3)}:${t.stock.gold}:${t.plots.filter((b) => b).length}`);
  const regiments = world.regiments.map((r) => `${r.id}:${r.aliveMen}:${r.centreX.toFixed(4)}:${r.centreZ.toFixed(4)}`);
  return `${towns.join('|')}#${regiments.join('|')}`;
}

describe('a whole game', () => {
  it('the computer builds a town, raises an army and razes an idle player within 30 minutes', () => {
    const world = createWorld({ seed: 5, difficulty: 'normal', computerPlays: true });
    let firstRegimentS = -1;
    let peakMen = 0;
    const seconds = runUntil(world, 30 * 60, () => {
      const men = menAlive(world, COMPUTER);
      if (men > 0 && firstRegimentS < 0) firstRegimentS = world.timeS;
      if (men > peakMen) peakMen = men;
      return world.winner !== -1;
    });
    expect(world.winner).toBe(COMPUTER);
    expect(seconds).toBeLessThan(30 * 60);
    // Not a rush either: the player gets time to build.
    expect(seconds).toBeGreaterThan(8 * 60);
    expect(firstRegimentS).toBeGreaterThan(120);
    expect(peakMen).toBeLessThanOrEqual(ARMY.maxSoldiersPerSide);
    expect(world.towns[COMPUTER].plots.filter((b) => b !== null).length).toBeGreaterThanOrEqual(12);
  });

  it('two computer players fight each other, and the same seed replays the same game', () => {
    const play = (seed: number): World => {
      const world = createWorld({ seed, difficulty: 'normal', computerPlays: true });
      const second = createAiState(PLAYER);
      for (let step = 0; step < 20 * 60 * 60 && world.winner === -1; step++) {
        stepAi(world, second, SIM.stepSeconds);
        stepWorld(world, SIM.stepSeconds);
      }
      return world;
    };
    const first = play(11);
    const again = play(11);
    expect(first.kills[0] + first.kills[1]).toBeGreaterThan(40);
    expect(fingerprint(again)).toBe(fingerprint(first));
    expect(again.timeS).toBe(first.timeS);
  }, 60_000);

  it('a keep falls to an army that is left to batter it', () => {
    const world = createWorld({ seed: 2, difficulty: 'normal', computerPlays: false });
    for (let i = 0; i < 6; i++) {
      const r = spawnRegiment(world, PLAYER, 'menAtArms', 40 + i * 10, -40, 0);
      expect(cmdAttackBuilding(world, r.id, COMPUTER, -1)).toBe('ok');
    }
    runUntil(world, 600, () => world.winner !== -1);
    expect(world.winner).toBe(PLAYER);
  });

  it('nothing moves once the game is won', () => {
    const world = createWorld({ seed: 2, difficulty: 'normal', computerPlays: false });
    world.towns[COMPUTER].keepHp = 0;
    run(world, 1);
    expect(world.winner).toBe(PLAYER);
    const time = world.timeS;
    run(world, 5);
    expect(world.timeS).toBe(time);
  });
});

describe('budget', () => {
  it('a step with 200 soldiers in one melee stays inside the 2 ms budget', () => {
    const world = createWorld({ seed: 9, difficulty: 'normal', computerPlays: false });
    // 100 men a side of every kind, in two lines 40 m apart, all ordered to attack.
    const kinds = [...UNIT_KINDS, 'spearmen', 'menAtArms', 'archers'] as const;
    let x = -50;
    const mine: number[] = [];
    const theirs: number[] = [];
    for (const kind of kinds) {
      mine.push(spawnRegiment(world, PLAYER, kind, x, 20, Math.PI).id);
      theirs.push(spawnRegiment(world, COMPUTER, kind, x, -20, 0).id);
      x += 12;
    }
    expect(menAlive(world, PLAYER)).toBe(100);
    expect(menAlive(world, COMPUTER)).toBe(100);
    for (let i = 0; i < mine.length; i++) {
      cmdAttackRegiment(world, mine[i] as number, theirs[i] as number);
      cmdAttackRegiment(world, theirs[i] as number, mine[i] as number);
    }
    run(world, 5);
    const steps = 600;
    const t0 = performance.now();
    for (let i = 0; i < steps; i++) stepWorld(world, SIM.stepSeconds);
    const msPerStep = (performance.now() - t0) / steps;
    console.log(`[budget] sim step with 200 soldiers: ${msPerStep.toFixed(3)} ms`);
    // The budget is 2 ms on the target machine; a shared CI runner gets a wide margin.
    expect(msPerStep).toBeLessThan(2 * 2.5);
  });
});
