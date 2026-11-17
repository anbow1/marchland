import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../src/config.ts';
import { canPayTribute, carryOut, payTribute } from '../src/sim/campaign.ts';
import { cmdMerge, cmdReinforce, missingMen } from '../src/sim/commands.ts';
import { isBuilt } from '../src/sim/economy.ts';
import { facingToEnemy, rallyX, rallyZ, townX, townZ } from '../src/sim/terrain.ts';
import { COMPUTER, PLAYER, type UnitKind } from '../src/sim/types.ts';
import { createWorld, spawnRegiment, type World } from '../src/sim/world.ts';
import { campaignRegiment } from '../src/sim/campaign.ts';
import { doorX, doorZ, KEEP, spawnPerson } from '../src/sim/people.ts';
import { run, runUntil } from './helpers.ts';

function mission(n: number, seed = 1, carried: { kind: UnitKind; men: number; xp: number }[] = []): World {
  return createWorld({ seed, difficulty: 'normal', computerPlays: true, mode: 'campaign', campaign: { mission: n, carried, gold: 0 } });
}

const men = (world: World, side: 0 | 1): number => world.regiments.filter((r) => r.side === side).reduce((n, r) => n + r.aliveMen, 0);

describe('campaign', () => {
  it('mission 1: a working town, the invader camped in sight with two hundred men, a tribute that wins', () => {
    const world = mission(1);
    const c = world.campaign;
    expect(c).not.toBeNull();
    if (!c) return;
    const town = world.towns[PLAYER];
    expect(town.armyCap).toBe(CAMPAIGN.maxSoldiersPerSide);
    expect(town.plots.filter((b) => b !== null && isBuilt(b)).length).toBeGreaterThanOrEqual(12);
    expect(world.towns[COMPUTER].absent).toBe(true);
    expect(men(world, COMPUTER)).toBe(CAMPAIGN.invaders.length * CAMPAIGN.regimentMaxMen);
    // The camp lies across the river, between the keeps.
    const toCamp = Math.hypot(c.campX - townX(PLAYER), c.campZ - townZ(PLAYER));
    expect(toCamp).toBeGreaterThan(250);
    expect(toCamp).toBeLessThan(450);
    run(world, 30);
    expect(world.winner).toBe(-1);
    expect(canPayTribute(world, c)).toBe(false);
    expect(payTribute(world, c)).toBe('cannotAfford');
    town.stock.gold += 1000;
    town.stock.bread += 300;
    town.stock.weapon += 50;
    expect(payTribute(world, c)).toBe('ok');
    run(world, 2);
    expect(world.winner).toBe(PLAYER);
    expect(c.stars).toBeGreaterThanOrEqual(1);
  });

  it('mission 1: unpaid, the host marches on the town when the time is up', () => {
    const world = mission(1, 3);
    const c = world.campaign;
    if (!c) throw new Error('no campaign');
    world.timeS = c.dueS - 2;
    run(world, 60);
    expect(c.attacking).toBe(true);
    const ahead = world.regiments.filter((r) => r.side === COMPUTER && r.aliveMen > 0);
    const marching = ahead.filter((r) => r.order !== 'hold').length;
    expect(marching).toBeGreaterThan(ahead.length / 2);
  });

  // A strong defence against the host, one game per seed; at most one in ten may be won.
  const defence: { seed: number; won: boolean; left: number; theirs: number }[] = [];
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`mission 1: the host against a strong defence (seed ${seed})`, { timeout: 120_000 }, async () => {
      const world = mission(1, seed);
      const c = world.campaign;
      if (!c) throw new Error('no campaign');
      // What a player could raise in the fifteen minutes, and more: eight regiments.
      const kinds: UnitKind[] = ['pikemen', 'pikemen', 'swordsmen', 'swordsmen', 'archers', 'archers', 'crossbowmen', 'halberdiers'];
      kinds.forEach((kind, i) => {
        const r = spawnRegiment(world, PLAYER, kind, rallyX(PLAYER) + ((i % 4) - 1.5) * 16, rallyZ(PLAYER) + Math.floor(i / 4) * 14, facingToEnemy(PLAYER));
        campaignRegiment(r);
      });
      world.timeS = c.dueS - 1;
      // In stretches of five seconds, letting the test runner breathe between them.
      for (let t = 0; t < 900 && world.winner === -1; t += 5) {
        runUntil(world, 5, () => world.winner !== -1);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      defence.push({ seed, won: world.winner === PLAYER, left: men(world, PLAYER), theirs: men(world, COMPUTER) });
    });
  }
  it('mission 1: the host wins against that defence at least nine times in ten', () => {
    console.log('mission 1 defence:', JSON.stringify(defence));
    expect(defence.length).toBe(6);
    expect(defence.filter((d) => d.won).length / defence.length).toBeLessThanOrEqual(0.1);
  });

  it('mission 2: the camp and its foragers; won when no enemy is left, with the carried army', () => {
    const carried = [
      { kind: 'swordsmen' as UnitKind, men: 20, xp: 0.5 },
      { kind: 'pikemen' as UnitKind, men: 9, xp: 0 },
    ];
    const world = mission(2, 2, carried);
    const c = world.campaign;
    if (!c) throw new Error('no campaign');
    const mine = world.regiments.filter((r) => r.side === PLAYER);
    expect(mine.map((r) => r.aliveMen)).toEqual([20, 9]);
    expect((mine[0] as (typeof mine)[number]).xp).toBe(0.5);
    expect(c.foragerIds.length).toBe(CAMPAIGN.foragers.length);
    for (const r of world.regiments) if (r.side === COMPUTER) for (const s of r.soldiers) s.alive = false;
    for (const r of world.regiments) if (r.side === COMPUTER) r.aliveMen = 0;
    run(world, 2);
    expect(world.winner).toBe(PLAYER);
    const out = carryOut(world);
    expect(out.carried.length).toBeLessThanOrEqual(CAMPAIGN.carryRegiments);
    expect(out.carried[0]?.kind).toBe('swordsmen');
  });

  it('a regiment fills up to twenty at its barracks, and two of a kind merge', () => {
    const world = mission(2, 4);
    const town = world.towns[PLAYER];
    town.stock.gold += 2000;
    town.stock.weapon += 50;
    town.stock.leatherArmor += 50;
    const barracks = town.plots.find((b) => b !== null && b.kind === 'barracks');
    if (!barracks) throw new Error('no barracks');
    // Hands to call up: a crowd by the keep.
    for (let i = 0; i < 30; i++) spawnPerson(world, PLAYER, doorX(town, KEEP) + (i % 6), doorZ(town, KEEP) + Math.floor(i / 6), KEEP);
    const a = spawnRegiment(world, PLAYER, 'pikemen', barracks.x + 12, barracks.z + 12, 0);
    campaignRegiment(a);
    expect(missingMen(a)).toBe(CAMPAIGN.regimentMaxMen - 12);
    run(world, 6);
    expect(cmdReinforce(world, a.id)).toBe('ok');
    runUntil(world, 240, () => a.aliveMen >= CAMPAIGN.regimentMaxMen);
    expect(a.aliveMen).toBe(CAMPAIGN.regimentMaxMen);
    const b = spawnRegiment(world, PLAYER, 'swordsmen', a.centreX + 10, a.centreZ, 0);
    campaignRegiment(b);
    expect(cmdMerge(world, a.id, b.id)).toBe('notThisUnit');
    const c = spawnRegiment(world, PLAYER, 'pikemen', a.centreX + 10, a.centreZ, 0);
    campaignRegiment(c);
    a.soldiers.slice(1, 6).forEach((s) => {
      s.alive = false;
      a.aliveMen -= 1;
    });
    run(world, 6);
    expect(cmdMerge(world, a.id, c.id)).toBe('ok');
    expect(a.aliveMen).toBe(CAMPAIGN.regimentMaxMen);
    expect(c.aliveMen).toBe(12 - 5);
  });
});
