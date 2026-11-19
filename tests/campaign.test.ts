import { describe, expect, it } from 'vitest';
import { CAMPAIGN, TOWN } from '../src/config.ts';
import { canPayTribute, carryOut, fillRegiment, payTribute, settlement } from '../src/sim/campaign.ts';
import { cmdBuild, cmdBuildWall, cmdMerge, cmdMove, cmdReinforce, missingMen } from '../src/sim/commands.ts';
import { fight } from '../src/sim/ai.ts';
import { fortressPoint, INNER, insideRing, OUTER } from '../src/sim/fortress.ts';
import { blockedBetween, damageWall, findRoute, wallCellAt } from '../src/sim/nav.ts';
import { isBuilt } from '../src/sim/economy.ts';
import { DEPOSITS, facingToEnemy, rallyX, rallyZ, townX, townZ } from '../src/sim/terrain.ts';
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

  it('mission 1: the ready town stands in quarters on the grid, and no field lies on an outcrop', () => {
    const world = mission(1);
    const town = world.towns[PLAYER];
    const built = town.plots.filter((b): b is NonNullable<typeof b> => b !== null);
    // Homes, crafts and food trades on the 16 m grid squared to the keep.
    for (const b of built.filter((q) => q.kind === 'house' || q.kind === 'smithy' || q.kind === 'smelter' || q.kind === 'bakery' || q.kind === 'windmill')) {
      expect(Math.abs(Math.sin(b.yawRad * 2))).toBeLessThan(1e-6);
    }
    // The houses together: each within two squares of another.
    const houses = built.filter((b) => b.kind === 'house');
    for (const h of houses) expect(Math.min(...houses.filter((o) => o !== h).map((o) => Math.hypot(o.x - h.x, o.z - h.z)))).toBeLessThanOrEqual(2 * 16 + 0.5);
    for (const b of built) for (const strip of b.strips) for (const d of DEPOSITS) expect(Math.hypot(strip.x - d.x, strip.z - d.z)).toBeGreaterThan(TOWN.depositRadiusM);
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

  // The host of two hundred against the player's smaller army (one horse, three foot, three crossbows, two
  // mortars, a gun): behind a wall with three watchtowers manned by crossbowmen it holds, at a heavy price;
  // in the open it mostly falls. The defenders stand and shoot; the host is beaten when it all flees.
  const walled: { won: boolean; left: number; start: number }[] = [];
  const open: { won: boolean; left: number; start: number }[] = [];
  for (const [label, list, wall] of [['walls', walled, true], ['open', open, false]] as const) {
    for (const seed of [1, 2, 3, 4]) {
      it(`mission 1: a smaller army against the host, ${label} (seed ${seed})`, { timeout: 120_000 }, async () => {
        const world = mission(1, seed);
        const c = world.campaign;
        if (!c) throw new Error('no campaign');
        const kx = townX(PLAYER);
        const kz = townZ(PLAYER);
        if (wall) {
          const stock = world.towns[PLAYER].stock;
          stock.stone = 99999;
          stock.gold = 99999;
          stock.wood = 99999;
          // 65 m out: clear of the river's ford (a wall cannot stand in water).
          const d = 65;
          for (const [x, z] of [[kx + d, kz - d / 3], [kx + d, kz - d], [kx + d / 3, kz - d]] as const) expect(cmdBuild(world, PLAYER, 'tower', x, z, 0)).toBe('ok');
          for (const b of world.towns[PLAYER].plots) {
            if (!b || b.kind !== 'tower') continue;
            b.constructionLeftS = 0;
            b.garrison = 4;
            b.garrisonKind = 'crossbowmen';
          }
          expect(cmdBuildWall(world, PLAYER, kx + d, 339, kx + d, kz - d)).toBe('ok');
          expect(cmdBuildWall(world, PLAYER, kx + d, kz - d, -339, kz - d)).toBe('ok');
        }
        const kinds: UnitKind[] = ['heavyCavalry', 'swordsmen', 'halberdiers', 'pikemen', 'crossbowmen', 'crossbowmen', 'crossbowmen', 'mortar', 'mortar', 'cannon'];
        kinds.forEach((kind, i) => {
          const r = spawnRegiment(world, PLAYER, kind, rallyX(PLAYER) + ((i % 4) - 1.5) * 16 - 20, rallyZ(PLAYER) + Math.floor(i / 4) * 14 + 20, facingToEnemy(PLAYER));
          campaignRegiment(r);
          if (!r.def.engine) fillRegiment(r, r.def.cavalry ? 12 : CAMPAIGN.regimentMaxMen);
        });
        const start = men(world, PLAYER);
        world.timeS = c.dueS - 1;
        for (let t = 0; t < 1200 && world.winner === -1; t += 5) {
          runUntil(world, 5, () => world.winner !== -1);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        list.push({ won: world.winner === PLAYER, left: men(world, PLAYER), start });
      });
    }
  }
  it('mission 1: behind walls and towers the smaller army holds, at a price; in the open it mostly falls', () => {
    console.log('mission 1 walled:', JSON.stringify(walled), 'open:', JSON.stringify(open));
    expect(walled.filter((d) => d.won).length).toBeGreaterThanOrEqual(3);
    for (const d of walled.filter((q) => q.won)) expect(d.left).toBeLessThanOrEqual(d.start * 0.8);
    expect(open.filter((d) => d.won).length).toBeLessThanOrEqual(2);
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

describe('campaign, missions 3 and 4', () => {
  it('mission 3: the settlement held by four regiments and a manned watchtower; the relief comes at its hour', () => {
    const world = mission(3);
    const c = world.campaign;
    if (!c) throw new Error('no campaign');
    expect(world.towns[COMPUTER].absent).toBe(true);
    const village = settlement(world);
    expect(village.owner).toBe(COMPUTER);
    expect(men(world, COMPUTER)).toBe(CAMPAIGN.settlementGarrison.length * CAMPAIGN.regimentMaxMen);
    const tower = world.towns[COMPUTER].plots.find((b) => b !== null && b.kind === 'tower');
    expect(tower?.garrison).toBe(CAMPAIGN.towerCrossbowmen);
    expect(Math.hypot((tower?.x ?? 0) - village.x, (tower?.z ?? 0) - village.z)).toBeLessThan(60);
    // The settlement is some 270 m from the player's keep.
    expect(Math.hypot(village.x - townX(PLAYER), village.z - townZ(PLAYER))).toBeGreaterThan(200);
    world.timeS = CAMPAIGN.reliefAtS - 1;
    run(world, 3);
    expect(c.reliefIds?.length).toBe(CAMPAIGN.relief.length);
    expect(world.winner).toBe(-1);
  });

  it('mission 3: taken back (a regiment on the market, no enemy near) the mission is won, with two stars before the relief', () => {
    const world = mission(3, 2);
    const c = world.campaign;
    if (!c) throw new Error('no campaign');
    for (const r of world.regiments) if (r.side === COMPUTER) for (const s of r.soldiers) s.alive = false;
    for (const r of world.regiments) if (r.side === COMPUTER) r.aliveMen = 0;
    const village = settlement(world);
    const mine = world.regiments.find((r) => r.side === PLAYER && !r.def.engine);
    if (!mine) throw new Error('no army');
    cmdMove(world, mine.id, village.x, village.z, null, true);
    runUntil(world, 600, () => world.winner !== -1);
    expect(world.winner).toBe(PLAYER);
    expect(c.stars).toBe(2);
  });

  // A seasoned army out of mission 2 (six full regiments) sent at the settlement as the computer would send it.
  const tries: { won: boolean; atS: number; left: number }[] = [];
  for (const seed of [1, 2, 3]) {
    it(`mission 3: a seasoned army takes the settlement back (seed ${seed})`, { timeout: 120_000 }, async () => {
      const carried = (['swordsmen', 'pikemen', 'halberdiers', 'crossbowmen', 'crossbowmen', 'heavyCavalry'] as UnitKind[]).map((kind) => ({ kind, men: kind === 'heavyCavalry' ? 12 : 20, xp: 0.3 }));
      const world = mission(3, seed, carried);
      const village = settlement(world);
      for (let t = 0; t < 1500 && world.winner === -1; t += 5) {
        const mine = world.regiments.filter((r) => r.side === PLAYER && r.aliveMen > 0 && r.state === 'formed');
        const near = world.regiments.some((r) => r.side === COMPUTER && r.aliveMen > 0 && Math.hypot(r.centreX - village.x, r.centreZ - village.z) < 200);
        if (near && mine.length > 0) fight(world, mine, 400, false);
        else for (const r of mine) if (r.order !== 'move' && Math.hypot(r.centreX - village.x, r.centreZ - village.z) > 15) cmdMove(world, r.id, village.x, village.z, null, false);
        runUntil(world, 5, () => world.winner !== -1);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      tries.push({ won: world.winner === PLAYER, atS: Math.round(world.timeS), left: men(world, PLAYER) });
    });
  }
  it('mission 3: the seasoned army wins, mostly before the relief', () => {
    console.log('mission 3:', JSON.stringify(tries));
    expect(tries.filter((d) => d.won).length).toBeGreaterThanOrEqual(2);
  });

  it('mission 4: the settlement is the player\'s; raids come; won with the army and the keep, the second star if nothing was razed', () => {
    const world = mission(4, 5);
    const c = world.campaign;
    if (!c) throw new Error('no campaign');
    expect(settlement(world).owner).toBe(PLAYER);
    expect(men(world, COMPUTER)).toBe(0);
    world.timeS = (CAMPAIGN.raids[0]?.atS ?? 0) - 1;
    run(world, 3);
    expect(c.raidsSent).toBe(1);
    expect(men(world, COMPUTER)).toBeGreaterThan(0);
    expect(world.winner).toBe(-1);
    // The army and the keep raised: won.
    for (const r of world.regiments) if (r.side === COMPUTER) for (const s of r.soldiers) s.alive = false;
    for (const r of world.regiments) if (r.side === COMPUTER) r.aliveMen = 0;
    const kinds: UnitKind[] = ['swordsmen', 'pikemen', 'halberdiers', 'crossbowmen', 'swordsmen', 'pikemen', 'halberdiers', 'crossbowmen', 'archers', 'heavyCavalry'];
    for (const kind of kinds) {
      const r = spawnRegiment(world, PLAYER, kind, rallyX(PLAYER), rallyZ(PLAYER) + 30, facingToEnemy(PLAYER));
      campaignRegiment(r);
      fillRegiment(r, r.def.cavalry ? 12 : 20);
    }
    run(world, 2);
    expect(world.winner).toBe(-1);
    world.towns[PLAYER].keepLevel = CAMPAIGN.keepGoalLevel;
    run(world, 2);
    expect(world.winner).toBe(PLAYER);
    expect(c.stars).toBe(2);
  });
});

describe('campaign, mission 5', () => {
  it('the fortress: two closed rings of walls with their towers and gates, the garrison, the sally and the guard inside', () => {
    const world = mission(5);
    const c = world.campaign;
    if (!c) throw new Error('no campaign');
    const towers = world.towns[COMPUTER].plots.filter((b) => b !== null && b.kind === 'tower');
    expect(towers.length).toBe(12);
    for (const t of towers) expect(t?.garrison).toBe(CAMPAIGN.fortress.towerCrossbowmen);
    expect(world.gates.filter((g) => g.side === COMPUTER).length).toBe(2);
    expect(c.guardIds?.length).toBe(CAMPAIGN.guard.length);
    for (const id of c.guardIds ?? []) {
      const r = world.regiments.find((q) => q.id === id) as (typeof world.regiments)[number];
      expect(insideRing(INNER, r.centreX, r.centreZ)).toBe(true);
    }
    for (const id of c.campIds) {
      const r = world.regiments.find((q) => q.id === id) as (typeof world.regiments)[number];
      expect(insideRing(OUTER, r.centreX, r.centreZ) && !insideRing(INNER, r.centreX, r.centreZ)).toBe(true);
    }
    // Closed: from the field there is no way in for the player's men but through a breach.
    const out = new Float32Array(2 * 64);
    const [fx, fz] = fortressPoint(0, OUTER.frontM + 40);
    const [ix, iz] = fortressPoint(0, CAMPAIGN.fortress.inner.frontM - 6);
    world.nav.budget = 1e9;
    const n = findRoute(world.nav, PLAYER, fx, fz, ix, iz, out);
    let reached = false;
    if (n > 0) reached = Math.hypot((out[(n - 1) * 2] as number) - ix, (out[(n - 1) * 2 + 1] as number) - iz) < 4 && !blockedThrough(world, out, n, fx, fz);
    expect(reached).toBe(false);
    // The siege train came along.
    expect(world.regiments.filter((r) => r.side === PLAYER && r.def.engine).length).toBe(CAMPAIGN.siegeTrain.length);
  });

  it('the guard broken: won; a breach in time and no gun lost, two stars', () => {
    const world = mission(5, 2);
    const c = world.campaign;
    if (!c) throw new Error('no campaign');
    // A breach: a stretch of the outer wall knocked down.
    const [wx, wz] = fortressPoint(30, OUTER.frontM);
    const cell = wallCellAt(world.nav, wx, wz);
    expect(cell).toBeGreaterThanOrEqual(0);
    damageWall(world.nav, cell, 1e6);
    run(world, 2);
    expect(c.breachS).toBeGreaterThanOrEqual(0);
    for (const id of c.guardIds ?? []) {
      const r = world.regiments.find((q) => q.id === id);
      if (!r) continue;
      for (const s of r.soldiers) s.alive = false;
      r.aliveMen = 0;
    }
    run(world, 2);
    expect(world.winner).toBe(PLAYER);
    expect(c.stars).toBe(2);
  });

  it('the sally goes out at guns that come near the gate', () => {
    const world = mission(5, 3);
    const c = world.campaign;
    if (!c) throw new Error('no campaign');
    const gun = world.regiments.find((r) => r.side === PLAYER && r.def.engine);
    if (!gun) throw new Error('no guns');
    const [x, z] = fortressPoint(0, OUTER.frontM + 120);
    gun.anchorX = x;
    gun.anchorZ = z;
    for (const s of gun.soldiers) {
      s.x = x;
      s.z = z;
    }
    run(world, 3);
    expect(c.sallyOutS).toBeGreaterThanOrEqual(0);
    const sally = world.regiments.filter((r) => (c.sallyIds ?? []).includes(r.id));
    expect(sally.some((r) => r.order === 'attackRegiment')).toBe(true);
  });
});

/** True when the way found crosses a wall that stops the player (the search's last leg is straight at the goal). */
function blockedThrough(world: World, out: Float32Array, n: number, fx: number, fz: number): boolean {
  let px = fx;
  let pz = fz;
  for (let k = 0; k < n; k++) {
    const x = out[k * 2] as number;
    const z = out[k * 2 + 1] as number;
    if (blockedBetween(world.nav, PLAYER, px, pz, x, z)) return true;
    px = x;
    pz = z;
  }
  return false;
}
