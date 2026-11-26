import { describe, expect, it } from 'vitest';
import { MAP, SIM } from '../src/config.ts';
import { createAiState, pickFoe } from '../src/sim/ai.ts';
import { SIDE_COUNT } from '../src/sim/layout.ts';
import { DEPOSITS, facingToEnemy, HEAPS, lakeX, lakeZ, pointX, pointZ, rallyX, rallyZ, townX, townZ } from '../src/sim/terrain.ts';
import { COMPUTER, PLAYER, type Side } from '../src/sim/types.ts';
import { createWorld, spawnRegiment, stepWorld } from '../src/sim/world.ts';

// The map of three towns ('triangle'): `npm test` runs this file with MARCHLAND_MAP=triangle.

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
const SIDES: readonly Side[] = [0, 1, 2];

describe.runIf(SIDE_COUNT === 3)('the map of three towns', () => {
  it('is larger, and every town, lake, outcrop and place is the player’s turned by a third of a circle', () => {
    expect(MAP.sizeM).toBeGreaterThan(680);
    const r = Math.hypot(townX(0), townZ(0));
    for (const s of SIDES) {
      // On one circle, a third apart, inside the map with room to build.
      expect(Math.hypot(townX(s), townZ(s))).toBeCloseTo(r, 6);
      expect(Math.max(Math.abs(townX(s)), Math.abs(townZ(s)))).toBeLessThan(MAP.halfM - 90);
      // The lake and the rally point stand the same way from each town.
      expect(Math.hypot(lakeX(s) - townX(s), lakeZ(s) - townZ(s))).toBeCloseTo(Math.hypot(lakeX(0) - townX(0), lakeZ(0) - townZ(0)), 6);
      expect(Math.hypot(rallyX(s) - townX(s), rallyZ(s) - townZ(s))).toBeCloseTo(Math.hypot(rallyX(0) - townX(0), rallyZ(0) - townZ(0)), 6);
      // Facing the middle.
      expect(near(facingToEnemy(s), Math.atan2(-townX(s), -townZ(s)))).toBe(true);
    }
    expect(Math.hypot(townX(1) - townX(2), townZ(1) - townZ(2))).toBeCloseTo(Math.hypot(townX(0) - townX(1), townZ(0) - townZ(1)), 6);
    // Each side has its stone and ore; three massifs on the rim.
    expect(DEPOSITS.length).toBe(9);
    expect(HEAPS.filter((h) => h.radiusM === MAP.mountainRadiusM).length).toBe(3);
    // Each place in the middle is as far from two towns, and further from the third.
    for (let i = 0; i < 3; i++) {
      const d = SIDES.map((s) => Math.hypot(pointX(i, 0) - townX(s), pointZ(i, 0) - townZ(s))).sort((a, b) => a - b);
      expect(d[0]).toBeCloseTo(d[1] as number, 6);
      expect(d[2]).toBeGreaterThan((d[1] as number) + 50);
    }
  });

  it('a computer marches on whoever threatens it, else the weaker, and two do not pile on one side', () => {
    const world = createWorld({ seed: 2, difficulty: 'normal', computerPlays: true });
    expect(world.towns.length).toBe(3);
    expect(world.ais.map((a) => a.side)).toEqual([1, 2]);
    // Raiders of side 2 by computer 1's keep: side 2 is its foe.
    spawnRegiment(world, 2, 'swordsmen', townX(1) + 40, townZ(1), 0);
    expect(pickFoe(world, COMPUTER)).toBe(2);
    world.regiments.length = 0;
    // Nothing near: the weaker of the two (the player has a regiment more than side 2).
    spawnRegiment(world, PLAYER, 'swordsmen', townX(0), townZ(0), 0);
    spawnRegiment(world, PLAYER, 'swordsmen', townX(0) + 10, townZ(0), 0);
    expect(pickFoe(world, COMPUTER)).toBe(2);
    // With computer 2's wave already out against the player, computer 1 does not join it when side 2 is
    // no stronger than the shared foe counts.
    const second = world.ais[1] as ReturnType<typeof createAiState>;
    second.foe = PLAYER;
    second.mode = 'assault';
    world.regiments.length = 0;
    expect(pickFoe(world, COMPUTER)).toBe(2);
  });

  it('a fallen computer town is out of the game; the last keep standing wins', () => {
    const world = createWorld({ seed: 3, difficulty: 'normal', computerPlays: true });
    spawnRegiment(world, 2, 'pikemen', townX(2) + 30, townZ(2), 0);
    world.towns[2].keepHp = 0;
    stepWorld(world, SIM.stepSeconds);
    expect(world.towns[2].absent).toBe(true);
    expect(world.regiments.some((r) => r.side === 2)).toBe(false);
    expect(world.people.some((p) => p.side === 2)).toBe(false);
    expect(world.ais.map((a) => a.side)).toEqual([1]);
    expect(world.winner).toBe(-1);
    world.towns[1].keepHp = 0;
    stepWorld(world, SIM.stepSeconds);
    expect(world.winner).toBe(PLAYER);
  });

  it('three computers build three towns alike and fight one another', { timeout: 600_000 }, () => {
    const world = createWorld({ seed: 1, difficulty: 'normal', computerPlays: true });
    world.ais.unshift(createAiState(PLAYER));
    const foes = new Set<string>();
    for (let s = 0; s < 40 * 60 && world.winner === -1; s++) {
      for (let k = 0; k < 1 / SIM.stepSeconds; k++) stepWorld(world, SIM.stepSeconds);
      for (const ai of world.ais) if (ai.mode !== 'gather' && ai.foe !== undefined) foes.add(`${ai.side}>${ai.foe}`);
    }
    const plots = world.towns.map((t) => t.plots.filter(Boolean).length);
    console.log('three towns after 40 min: buildings', plots, 'kills', world.kills, 'waves', [...foes]);
    for (const n of plots) expect(n).toBeGreaterThan(30);
    // The towns grow alike: none more than a third behind the best.
    expect(Math.min(...plots)).toBeGreaterThan(Math.max(...plots) * 0.66);
    // Computers march on each other too, not only on the player.
    expect([...foes].some((f) => f === '1>2' || f === '2>1')).toBe(true);
  });
});
