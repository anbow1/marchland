import { describe, expect, it } from 'vitest';
import { ARMY, SIM, UNITS } from '../src/config.ts';
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
  // A session is 25–35 minutes (docs/GAMEPLAY.md §1). The computer's militia stays home as a guard, so the
  // first attack waits for regular troops, and the keeps stand 600 m apart near the corners: it razes a
  // town that does nothing at 33–35 minutes (seeds 5 and 6), at the end of the plan.
  it('the computer builds a town, raises an army and razes an idle player within 38 minutes', () => {
    const world = createWorld({ seed: 5, difficulty: 'normal', computerPlays: true });
    let firstRegimentS = -1;
    let peakMen = 0;
    const seconds = runUntil(world, 38 * 60, () => {
      const men = menAlive(world, COMPUTER);
      if (men > 0 && firstRegimentS < 0) firstRegimentS = world.timeS;
      if (men > peakMen) peakMen = men;
      return world.winner !== -1;
    });
    expect(world.winner).toBe(COMPUTER);
    expect(seconds).toBeLessThan(38 * 60);
    // Not a rush either: the player gets time to build.
    expect(seconds).toBeGreaterThan(20 * 60);
    expect(firstRegimentS).toBeGreaterThan(120);
    expect(peakMen).toBeLessThanOrEqual(ARMY.maxSoldiersPerSide);
    expect(world.towns[COMPUTER].plots.filter((b) => b !== null).length).toBeGreaterThanOrEqual(12);
  }, 60_000);

  it('two computer players fight each other, and the same seed replays the same game', () => {
    const play = (seed: number): World => {
      const world = createWorld({ seed, difficulty: 'normal', computerPlays: true });
      const second = createAiState(PLAYER);
      // Armies are raised from the towns' people, the militia stays home, and each computer waits for a
      // first wave of regular troops: the first blows fall at about 28 minutes (to be brought forward).
      for (let step = 0; step < 40 * 60 * 60 && world.winner === -1; step++) {
        stepAi(world, second, SIM.stepSeconds);
        stepWorld(world, SIM.stepSeconds);
      }
      return world;
    };
    const first = play(11);
    const again = play(11);
    // Regular troops only (the militia guards each town): fighting starts late. The number of dead by
    // minute 40 swings widely with small changes to the rules; this checks they fight.
    expect(first.kills[0] + first.kills[1]).toBeGreaterThan(10);
    expect(fingerprint(again)).toBe(fingerprint(first));
    expect(again.timeS).toBe(first.timeS);
  }, 120_000);

  it('a keep falls to an army that is left to batter it', () => {
    const world = createWorld({ seed: 2, difficulty: 'normal', computerPlays: false });
    for (let i = 0; i < 6; i++) {
      const r = spawnRegiment(world, PLAYER, 'swordsmen', 40 + i * 10, -40, 0);
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
  it('a step with every kind of unit on both sides in one melee stays inside the 2 ms budget', () => {
    const world = createWorld({ seed: 9, difficulty: 'normal', computerPlays: false });
    // One regiment of each kind a side, in two lines 40 m apart, all ordered to attack.
    let x = -60;
    let men = 0;
    const mine: number[] = [];
    const theirs: number[] = [];
    for (const kind of UNIT_KINDS) {
      mine.push(spawnRegiment(world, PLAYER, kind, x, 20, Math.PI).id);
      theirs.push(spawnRegiment(world, COMPUTER, kind, x, -20, 0).id);
      men += UNITS[kind].men;
      x += 13;
    }
    expect(menAlive(world, PLAYER)).toBe(men);
    expect(men).toBeGreaterThan(85);
    expect(men).toBeLessThanOrEqual(ARMY.maxSoldiersPerSide);
    for (let i = 0; i < mine.length; i++) {
      cmdAttackRegiment(world, mine[i] as number, theirs[i] as number);
      cmdAttackRegiment(world, theirs[i] as number, mine[i] as number);
    }
    run(world, 5);
    const steps = 600;
    const t0 = performance.now();
    for (let i = 0; i < steps; i++) stepWorld(world, SIM.stepSeconds);
    const msPerStep = (performance.now() - t0) / steps;
    console.log(`[budget] sim step with ${2 * men} soldiers: ${msPerStep.toFixed(3)} ms`);
    // The budget is 2 ms on the target machine; a shared CI runner gets a wide margin.
    expect(msPerStep).toBeLessThan(2 * 2.5);
  });
});
