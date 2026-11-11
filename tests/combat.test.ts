import { describe, expect, it } from 'vitest';
import { MISSILE, UNITS } from '../src/config.ts';
import { cmdAttackRegiment, cmdMove, cmdMoveGroup } from '../src/sim/commands.ts';
import { launchElevationRad } from '../src/sim/missiles.ts';
import { type Regiment, slotX, slotZ } from '../src/sim/regiment.ts';
import { COMPUTER, PLAYER, type UnitKind } from '../src/sim/types.ts';
import { createWorld, spawnRegiment, type World } from '../src/sim/world.ts';
import { run, runUntil } from './helpers.ts';

// All fights happen on the level ground of the open field near the map's centre.

function emptyWorld(seed = 3): World {
  return createWorld({ seed, difficulty: 'normal', computerPlays: false });
}

/** Mean result of a duel over several seeds: men left on each side when one side has none standing or has run. */
function duel(a: UnitKind, b: UnitKind, setUp: (world: World, ra: Regiment, rb: Regiment) => void, seeds = 6): { a: number; b: number } {
  let sumA = 0;
  let sumB = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const world = emptyWorld(seed);
    const ra = spawnRegiment(world, PLAYER, a, 0, 20, Math.PI);
    const rb = spawnRegiment(world, COMPUTER, b, 0, -20, 0);
    setUp(world, ra, rb);
    runUntil(world, 240, () => ra.aliveMen === 0 || rb.aliveMen === 0 || ra.state === 'routing' || rb.state === 'routing');
    sumA += ra.state === 'routing' ? 0 : ra.aliveMen;
    sumB += rb.state === 'routing' ? 0 : rb.aliveMen;
  }
  return { a: sumA / seeds, b: sumB / seeds };
}

const bothAttack = (world: World, ra: Regiment, rb: Regiment): void => {
  cmdAttackRegiment(world, ra.id, rb.id);
  cmdAttackRegiment(world, rb.id, ra.id);
};

describe('formation and movement', () => {
  it('a regiment marches to its goal and stands there in formation', () => {
    const world = emptyWorld();
    const r = spawnRegiment(world, PLAYER, 'spearmen', 0, 0, 0);
    expect(cmdMove(world, r.id, 30, -25, Math.PI / 2, false)).toBe('ok');
    run(world, 60);
    expect(r.order).toBe('hold');
    expect(Math.hypot(r.anchorX - 30, r.anchorZ + 25)).toBeLessThan(0.2);
    expect(r.facingRad).toBeCloseTo(Math.PI / 2, 1);
    for (const s of r.soldiers) expect(Math.hypot(s.x - slotX(r, s.slot), s.z - slotZ(r, s.slot))).toBeLessThan(0.4);
  });

  it('marching speed is the walking pace, running is faster and tires the men', () => {
    const world = emptyWorld();
    const walker = spawnRegiment(world, PLAYER, 'spearmen', -30, 0, 0);
    const runner = spawnRegiment(world, PLAYER, 'spearmen', -10, 0, 0);
    cmdMove(world, walker.id, -30, 150, null, false);
    cmdMove(world, runner.id, -10, 150, null, true);
    run(world, 20);
    expect(walker.anchorZ).toBeGreaterThan(UNITS.spearmen.walkSpeedMs * 20 * 0.8);
    expect(walker.anchorZ).toBeLessThanOrEqual(UNITS.spearmen.walkSpeedMs * 20 + 0.01);
    expect(runner.anchorZ).toBeGreaterThan(walker.anchorZ * 1.5);
    expect(runner.fatigue).toBeGreaterThan(0.2);
    expect(walker.fatigue).toBe(0);
  });

  it('a group order forms a line with the archers behind', () => {
    const world = emptyWorld();
    const spears = spawnRegiment(world, PLAYER, 'spearmen', -10, 40, 0);
    const arms = spawnRegiment(world, PLAYER, 'menAtArms', 10, 40, 0);
    const bows = spawnRegiment(world, PLAYER, 'archers', 0, 50, 0);
    // Facing π looks along −Z (north).
    cmdMoveGroup(world, [spears.id, arms.id, bows.id], 0, 0, Math.PI, false);
    run(world, 90);
    expect(Math.abs(spears.anchorZ)).toBeLessThan(0.5);
    expect(Math.abs(arms.anchorZ)).toBeLessThan(0.5);
    expect(bows.anchorZ).toBeGreaterThan(5);
    expect(Math.abs(spears.anchorX - arms.anchorX)).toBeGreaterThan(8);
    expect(world.regiments.every((r) => r.order === 'hold')).toBe(true);
  });

  it('orders to a missing or routing regiment are refused', () => {
    const world = emptyWorld();
    expect(cmdMove(world, 999, 0, 0, null, false)).toBe('noSuchRegiment');
    const r = spawnRegiment(world, PLAYER, 'levy', 0, 0, 0);
    r.state = 'routing';
    expect(cmdMove(world, r.id, 10, 10, null, false)).toBe('routing');
  });
});

describe('melee', () => {
  it('equal regiments fight a close battle', () => {
    const result = duel('spearmen', 'spearmen', bothAttack, 10);
    expect(Math.abs(result.a - result.b)).toBeLessThan(4);
  });

  it('men-at-arms beat the levy', () => {
    const result = duel('menAtArms', 'levy', bothAttack);
    expect(result.a).toBeGreaterThan(10);
    expect(result.b).toBe(0);
  });

  it('spearmen standing their ground beat charging light cavalry', () => {
    const result = duel('spearmen', 'lightCavalry', (world, _spears, cavalry) => {
      cmdAttackRegiment(world, cavalry.id, _spears.id);
    });
    expect(result.a).toBeGreaterThan(result.b + 3);
  });

  it('knights ride down archers caught in the open', () => {
    const result = duel('knights', 'archers', (world, knights, archers) => {
      cmdAttackRegiment(world, knights.id, archers.id);
      cmdAttackRegiment(world, archers.id, knights.id);
    });
    expect(result.a).toBeGreaterThan(5);
    expect(result.b).toBeLessThan(1);
  });

  it('an attack from behind breaks a regiment sooner than a second frontal attack', () => {
    // Men-at-arms pinned by spearmen in front; a second regiment of spearmen joins from the front or from behind.
    const secondsToBreak = (fromBehind: boolean): number => {
      let total = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const world = emptyWorld(seed);
        const pinned = spawnRegiment(world, COMPUTER, 'menAtArms', 0, 0, 0);
        const front = spawnRegiment(world, PLAYER, 'spearmen', 0, 25, Math.PI);
        const second = spawnRegiment(world, PLAYER, 'spearmen', fromBehind ? 0 : 14, fromBehind ? -25 : 25, fromBehind ? 0 : Math.PI);
        cmdAttackRegiment(world, pinned.id, front.id);
        cmdAttackRegiment(world, front.id, pinned.id);
        cmdAttackRegiment(world, second.id, pinned.id);
        total += runUntil(world, 300, () => pinned.state === 'routing' || pinned.aliveMen === 0);
      }
      return total / 8;
    };
    expect(secondsToBreak(true)).toBeLessThan(secondsToBreak(false) * 0.8);
  });

  it('a regiment that loses heart runs for its keep and can rally', () => {
    const world = emptyWorld();
    const levy = spawnRegiment(world, PLAYER, 'levy', 0, 20, Math.PI);
    const knights = spawnRegiment(world, COMPUTER, 'knights', 0, -30, 0);
    cmdAttackRegiment(world, knights.id, levy.id);
    const routedAfter = runUntil(world, 120, () => levy.state === 'routing' || levy.aliveMen === 0);
    expect(routedAfter).toBeLessThan(120);
    if (levy.aliveMen >= 4) {
      // Call the knights off: left alone, the levy steadies.
      cmdMove(world, knights.id, 150, -150, null, true);
      const startZ = levy.centreZ;
      run(world, 10);
      expect(levy.centreZ).toBeGreaterThan(startZ);
      runUntil(world, 120, () => levy.state === 'formed');
      expect(levy.state).toBe('formed');
    }
  });
});

describe('archery', () => {
  it('launch elevation matches the range equation', () => {
    // Level ground: range = v² sin(2θ) / g. At 45 m/s the longest shot is v²/g = 206.4 m at 45°.
    const v = MISSILE.arrowSpeedMs;
    const g = MISSILE.gravityMs2;
    expect((v * v) / g).toBeCloseTo(206.42, 1);
    for (const range of [20, 80, 150, 200]) {
      const theta = launchElevationRad(range, 0, v, g);
      expect((v * v * Math.sin(2 * theta)) / g).toBeCloseTo(range, 6);
    }
    expect(launchElevationRad(206.4, 0, v, g)).toBeCloseTo(Math.PI / 4, 1);
    expect(Number.isNaN(launchElevationRad(210, 0, v, g))).toBe(true);
    // A target above needs a steeper shot than one below.
    expect(launchElevationRad(80, 10, v, g)).toBeGreaterThan(launchElevationRad(80, -10, v, g));
    expect(() => launchElevationRad(0, 0, v, g)).toThrow(/must be positive/);
  });

  it('archers wear down infantry that stands in range, and not beyond it', () => {
    const shootAt = (distanceM: number): number => {
      const world = emptyWorld();
      spawnRegiment(world, PLAYER, 'archers', 0, 0, Math.PI);
      const target = spawnRegiment(world, COMPUTER, 'levy', 0, -distanceM, 0);
      run(world, 90);
      return target.aliveMen;
    };
    expect(shootAt(60)).toBeLessThan(8);
    expect(shootAt(UNITS.archers.missileRangeM + 25)).toBe(12);
  });

  it('shields and armour stop arrows that fell the levy', () => {
    const losses = (kind: UnitKind): number => {
      let lost = 0;
      for (let seed = 1; seed <= 4; seed++) {
        const world = emptyWorld(seed);
        spawnRegiment(world, PLAYER, 'archers', 0, 0, Math.PI);
        const target = spawnRegiment(world, COMPUTER, kind, 0, -60, 0);
        run(world, 45);
        lost += target.initialMen - target.aliveMen;
      }
      return lost;
    };
    expect(losses('menAtArms')).toBeLessThan(losses('levy') * 0.6);
  });

  it('a keep shoots at enemies under its walls', () => {
    const world = emptyWorld();
    const raiders = spawnRegiment(world, PLAYER, 'levy', 95, -95, 0);
    run(world, 40);
    expect(raiders.aliveMen).toBeLessThan(12);
  });
});
