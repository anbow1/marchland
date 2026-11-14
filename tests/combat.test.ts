import { describe, expect, it } from 'vitest';
import { ELEVATION, MAP, MISSILE, POINTS, UNITS } from '../src/config.ts';
import { cmdAttackBuilding, cmdAttackRegiment, cmdBuild, cmdFireAtWill, cmdFormation, cmdMove, cmdMoveGroup, cmdRanks, cmdStance } from '../src/sim/commands.ts';
import { launchElevationRad, reachM } from '../src/sim/missiles.ts';
import { frontageM, type Regiment, slotX, slotZ } from '../src/sim/regiment.ts';
import { heightAtM, SIDE_X, SIDE_Z, townX, townZ } from '../src/sim/terrain.ts';
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
    const r = spawnRegiment(world, PLAYER, 'pikemen', 0, 0, 0);
    expect(cmdMove(world, r.id, 30, -25, Math.PI / 2, false)).toBe('ok');
    run(world, 60);
    expect(r.order).toBe('hold');
    expect(Math.hypot(r.anchorX - 30, r.anchorZ + 25)).toBeLessThan(0.2);
    expect(r.facingRad).toBeCloseTo(Math.PI / 2, 1);
    for (const s of r.soldiers) expect(Math.hypot(s.x - slotX(r, s.slot), s.z - slotZ(r, s.slot))).toBeLessThan(0.4);
  });

  it('marching speed is the walking pace, running is faster and tires the men', () => {
    const world = emptyWorld();
    const walker = spawnRegiment(world, PLAYER, 'pikemen', -30, 0, 0);
    const runner = spawnRegiment(world, PLAYER, 'pikemen', -10, 0, 0);
    cmdMove(world, walker.id, -30, 150, null, false);
    cmdMove(world, runner.id, -10, 150, null, true);
    run(world, 20);
    expect(walker.anchorZ).toBeGreaterThan(UNITS.pikemen.walkSpeedMs * 20 * 0.8);
    expect(walker.anchorZ).toBeLessThanOrEqual(UNITS.pikemen.walkSpeedMs * 20 + 0.01);
    expect(runner.anchorZ).toBeGreaterThan(walker.anchorZ * 1.5);
    expect(runner.fatigue).toBeGreaterThan(0.2);
    expect(walker.fatigue).toBe(0);
  });

  it('a group order forms a line with the archers behind', () => {
    const world = emptyWorld();
    const spears = spawnRegiment(world, PLAYER, 'pikemen', -10, 40, 0);
    const arms = spawnRegiment(world, PLAYER, 'swordsmen', 10, 40, 0);
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
    const r = spawnRegiment(world, PLAYER, 'militia', 0, 0, 0);
    r.state = 'routing';
    expect(cmdMove(world, r.id, 10, 10, null, false)).toBe('routing');
  });
});

describe('melee', () => {
  it('equal regiments fight a close battle', () => {
    const result = duel('pikemen', 'pikemen', bothAttack, 10);
    expect(Math.abs(result.a - result.b)).toBeLessThan(4);
  });

  it('men-at-arms beat the militia', () => {
    const result = duel('swordsmen', 'militia', bothAttack);
    expect(result.a).toBeGreaterThan(10);
    expect(result.b).toBe(0);
  });

  it('pikemen standing their ground beat charging light cavalry', () => {
    const result = duel('pikemen', 'lightCavalry', (world, _spears, cavalry) => {
      cmdAttackRegiment(world, cavalry.id, _spears.id);
    });
    expect(result.a).toBeGreaterThan(result.b + 3);
  });

  it('heavyCavalry ride down archers caught in the open', () => {
    const result = duel('heavyCavalry', 'archers', (world, heavyCavalry, archers) => {
      cmdAttackRegiment(world, heavyCavalry.id, archers.id);
      cmdAttackRegiment(world, archers.id, heavyCavalry.id);
    });
    expect(result.a).toBeGreaterThan(5);
    expect(result.b).toBeLessThan(1);
  });

  it('an attack from behind breaks a regiment sooner than a second frontal attack', () => {
    // Men-at-arms pinned by pikemen in front; a second regiment of pikemen joins from the front or from behind.
    const secondsToBreak = (fromBehind: boolean): number => {
      let total = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const world = emptyWorld(seed);
        const pinned = spawnRegiment(world, COMPUTER, 'swordsmen', 0, 0, 0);
        const front = spawnRegiment(world, PLAYER, 'pikemen', 0, 25, Math.PI);
        const second = spawnRegiment(world, PLAYER, 'pikemen', fromBehind ? 0 : 14, fromBehind ? -25 : 25, fromBehind ? 0 : Math.PI);
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
    const militia = spawnRegiment(world, PLAYER, 'militia', 0, 20, Math.PI);
    const heavyCavalry = spawnRegiment(world, COMPUTER, 'heavyCavalry', 0, -30, 0);
    cmdAttackRegiment(world, heavyCavalry.id, militia.id);
    const routedAfter = runUntil(world, 120, () => militia.state === 'routing' || militia.aliveMen === 0);
    expect(routedAfter).toBeLessThan(120);
    if (militia.aliveMen >= 4) {
      // Call the heavyCavalry off: left alone, the militia steadies.
      cmdMove(world, heavyCavalry.id, 150, -150, null, true);
      const startZ = militia.centreZ;
      run(world, 10);
      expect(militia.centreZ).toBeGreaterThan(startZ);
      runUntil(world, 120, () => militia.state === 'formed');
      expect(militia.state).toBe('formed');
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
    // Men left standing, on average over three seeds: one volley's luck is not the rule.
    const shootAt = (distanceM: number): number => {
      let alive = 0;
      for (const seed of [3, 4, 5]) {
        const world = emptyWorld(seed);
        spawnRegiment(world, PLAYER, 'archers', 0, 0, Math.PI);
        const target = spawnRegiment(world, COMPUTER, 'militia', 0, -distanceM, 0);
        run(world, 90);
        alive += target.aliveMen;
      }
      return alive / 3;
    };
    expect(shootAt(60)).toBeLessThan(8);
    expect(shootAt(UNITS.archers.missileRangeM + 25)).toBe(12);
  });

  it('shields and armour stop arrows that fell the militia', () => {
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
    expect(losses('swordsmen')).toBeLessThan(losses('militia') * 0.6);
  });

  it('a keep shoots at enemies under its walls', () => {
    const world = emptyWorld();
    // 42 m from the enemy keep, inside its archers' reach.
    const raiders = spawnRegiment(world, PLAYER, 'militia', townX(COMPUTER) - 30, townZ(COMPUTER) + 30, 0);
    run(world, 40);
    expect(raiders.aliveMen).toBeLessThan(12);
  });
});

describe('the wider roster', () => {
  it('halberdiers stop a charge of light cavalry that rides down swordsmen less easily than archers', () => {
    const result = duel('halberdiers', 'lightCavalry', (world, halberds, cavalry) => {
      cmdAttackRegiment(world, cavalry.id, halberds.id);
    });
    expect(result.a).toBeGreaterThan(result.b + 3);
  });

  it('a crossbow bolt goes through mail that turns arrows', () => {
    const losses = (shooters: UnitKind): number => {
      let lost = 0;
      for (let seed = 1; seed <= 4; seed++) {
        const world = emptyWorld(seed);
        spawnRegiment(world, PLAYER, shooters, 0, 0, Math.PI);
        const target = spawnRegiment(world, COMPUTER, 'swordsmen', 0, -55, 0);
        run(world, 120);
        lost += target.initialMen - target.aliveMen;
      }
      return lost;
    };
    expect(losses('crossbowmen')).toBeGreaterThan(losses('archers') + 4);
  }, 30_000);

  it('ballistae reach where archers cannot, and shoot nothing inside their minimum range', () => {
    const shootAt = (distanceM: number): number => {
      const world = emptyWorld();
      spawnRegiment(world, PLAYER, 'ballista', 0, 0, Math.PI);
      const target = spawnRegiment(world, COMPUTER, 'swordsmen', 0, -distanceM, 0);
      run(world, 120);
      return target.initialMen - target.aliveMen;
    };
    expect(UNITS.ballista.missileRangeM).toBeGreaterThan(UNITS.archers.missileRangeM);
    expect(shootAt(100)).toBeGreaterThan(2);
    expect(shootAt(UNITS.ballista.missileMinRangeM - 5)).toBe(0);
  });

  it('siege engines do not fight back and fall to horsemen', () => {
    const world = emptyWorld();
    const engines = spawnRegiment(world, PLAYER, 'ballista', 0, 30, Math.PI);
    const cavalry = spawnRegiment(world, COMPUTER, 'lightCavalry', 0, 18, 0);
    cmdAttackRegiment(world, cavalry.id, engines.id);
    runUntil(world, 120, () => engines.aliveMen === 0 || engines.state === 'routing');
    expect(engines.aliveMen === 0 || engines.state === 'routing').toBe(true);
    expect(cavalry.aliveMen).toBe(cavalry.initialMen);
  });

  it('a trebuchet lobs its stone high, scatters a formation and brings down a building', () => {
    const g = MISSILE.gravityMs2;
    const v = UNITS.trebuchet.missileSpeedMs;
    const steep = launchElevationRad(100, 0, v, g, true);
    const flat = launchElevationRad(100, 0, v, g, false);
    expect(steep).toBeGreaterThan(Math.PI / 4);
    // The two elevations that reach one range are complementary.
    expect(steep + flat).toBeCloseTo(Math.PI / 2, 6);

    const world = emptyWorld();
    spawnRegiment(world, PLAYER, 'trebuchet', 0, 0, Math.PI);
    const target = spawnRegiment(world, COMPUTER, 'militia', 0, -100, 0);
    run(world, 150);
    expect(target.aliveMen === 0 || target.state === 'routing' || target.initialMen - target.aliveMen >= 3).toBe(true);

    const siege = emptyWorld();
    const town = siege.towns[COMPUTER];
    town.stock.gold = 1000;
    town.stock.wood = 100;
    const hx = townX(COMPUTER) - 25;
    const hz = townZ(COMPUTER) + 25;
    expect(cmdBuild(siege, COMPUTER, 'house', hx, hz, 0)).toBe('ok');
    // 100 m short of the house, on the open field side.
    const engine = spawnRegiment(siege, PLAYER, 'trebuchet', hx - 70, hz + 70, 0);
    expect(cmdAttackBuilding(siege, engine.id, COMPUTER, 0)).toBe('ok');
    runUntil(siege, 400, () => town.plots[0] === null || engine.aliveMen === 0);
    expect(town.plots[0]).toBeNull();
  });
});

describe('places in the middle', () => {
  it('a regiment standing by a place for a while takes it; it brings goods; two sides there and nobody takes it', () => {
    const world = createWorld({ seed: 3, difficulty: 'normal', computerPlays: false });
    const mine = world.points.find((p) => p.kind === 'mine');
    if (!mine) throw new Error('no mine');
    const ours = spawnRegiment(world, PLAYER, 'pikemen', mine.x, mine.z, 0);
    run(world, POINTS.holdS - 5);
    expect(mine.owner).toBe(-1);
    run(world, 8);
    expect(mine.owner).toBe(PLAYER);
    const ore = world.towns[PLAYER].stock.ironOre;
    run(world, 60);
    expect(world.towns[PLAYER].stock.ironOre - ore).toBeGreaterThanOrEqual(POINTS.list[0].perMinute.ironOre - 1);
    // An enemy regiment near a place stops anyone taking it: ours by the quarry, theirs within reach.
    const quarry = world.points.find((p) => p.kind === 'quarry');
    if (!quarry) throw new Error('no quarry');
    spawnRegiment(world, PLAYER, 'archers', quarry.x, quarry.z, 0);
    spawnRegiment(world, COMPUTER, 'archers', quarry.x + POINTS.clearM * 0.6, quarry.z, Math.PI / 2);
    run(world, POINTS.holdS + 5);
    expect(quarry.owner).toBe(-1);
    void ours;
  }, 30_000);
});

describe('formations and stances', () => {
  /** Men an archer regiment brings down in `seconds` from 60 m, set up as `prepare` says, over six seeds. */
  const arrowLosses = (kind: UnitKind, prepare: (world: World, target: Regiment) => void, seconds = 90): number => {
    let lost = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const world = emptyWorld(seed);
      spawnRegiment(world, PLAYER, 'archers', 0, 0, Math.PI);
      const target = spawnRegiment(world, COMPUTER, kind, 0, -60, 0);
      prepare(world, target);
      run(world, seconds);
      lost += target.initialMen - target.aliveMen;
    }
    return lost;
  };

  it('ranks set the block: fewer ranks, a wider front', () => {
    const world = emptyWorld();
    const r = spawnRegiment(world, PLAYER, 'pikemen', 0, 0, 0);
    expect(cmdRanks(world, r.id, 2)).toBe('ok');
    const wide = frontageM(r);
    expect(cmdRanks(world, r.id, 6)).toBe('ok');
    expect(frontageM(r)).toBeLessThan(wide / 2);
    run(world, 20);
    for (const s of r.soldiers) expect(Math.hypot(s.x - slotX(r, s.slot), s.z - slotZ(r, s.slot))).toBeLessThan(0.5);
    // A wedge is for horse.
    expect(cmdFormation(world, r.id, 'wedge')).toBe('notThisUnit');
  });

  it('open order and a shield wall take fewer arrows', () => {
    const inLine = arrowLosses('militia', () => {});
    const open = arrowLosses('militia', (world, t) => cmdFormation(world, t.id, 'loose'));
    expect(open).toBeLessThan(inLine * 0.75);
    // The militia carry wooden shields: raised, they take fewer arrows.
    const shields = arrowLosses('militia', (world, t) => cmdStance(world, t.id, 'shields'));
    expect(shields).toBeLessThan(inLine * 0.75);
  }, 30_000);

  it('a wedge of horse charges harder than a line', () => {
    const charge = (formation: 'line' | 'wedge'): number => {
      let killed = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const world = emptyWorld(seed);
        const horse = spawnRegiment(world, PLAYER, 'heavyCavalry', 0, 40, Math.PI);
        const foot = spawnRegiment(world, COMPUTER, 'swordsmen', 0, -10, 0);
        cmdFormation(world, horse.id, formation);
        cmdAttackRegiment(world, horse.id, foot.id);
        run(world, 25);
        killed += foot.initialMen - foot.aliveMen + (foot.state === 'routing' ? 4 : 0);
      }
      return killed;
    };
    expect(charge('wedge')).toBeGreaterThan(charge('line'));
  });

  it('a pike wall stands against a charge of horse that a block of pikemen would feel', () => {
    const horseLost = (wall: boolean): number => {
      let lost = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const world = emptyWorld(seed);
        const pikes = spawnRegiment(world, PLAYER, 'pikemen', 0, 20, Math.PI);
        const horse = spawnRegiment(world, COMPUTER, 'lightCavalry', 0, -30, 0);
        if (wall) expect(cmdStance(world, pikes.id, 'pikeWall')).toBe('ok');
        cmdAttackRegiment(world, horse.id, pikes.id);
        run(world, 40);
        lost += horse.initialMen - horse.aliveMen;
        // The wall does not move.
        if (wall) expect(Math.hypot(pikes.anchorX, pikes.anchorZ - 20)).toBeLessThan(0.5);
      }
      return lost;
    };
    expect(horseLost(true)).toBeGreaterThan(horseLost(false));
  });

  it('shooters held to orders do not shoot at will; sent to attack, they stop in range and shoot', () => {
    const world = emptyWorld();
    const archers = spawnRegiment(world, PLAYER, 'archers', 0, 0, Math.PI);
    const target = spawnRegiment(world, COMPUTER, 'militia', 0, -60, 0);
    expect(cmdFireAtWill(world, archers.id, false)).toBe('ok');
    run(world, 30);
    expect(target.aliveMen).toBe(target.initialMen);
    // Sent against a regiment far off (a pike wall, which stands): to their range, no closer, and shooting.
    const field = emptyWorld();
    const shooters = spawnRegiment(field, PLAYER, 'archers', 0, 0, Math.PI);
    cmdFireAtWill(field, shooters.id, false);
    const wall = spawnRegiment(field, COMPUTER, 'pikemen', 0, -170, 0);
    cmdStance(field, wall.id, 'pikeWall');
    cmdAttackRegiment(field, shooters.id, wall.id);
    run(field, 100);
    expect(Math.hypot(shooters.anchorX - wall.centreX, shooters.anchorZ - wall.centreZ)).toBeGreaterThan(UNITS.archers.missileRangeM * 0.7);
    // Hit: a pikeman in leather takes several arrows to fall, so the wounds tell, not the dead.
    expect(wall.soldiers.reduce((sum, man) => sum + man.hp, 0)).toBeLessThan(UNITS.pikemen.hp * wall.initialMen);
  });
});

describe('high ground and the computer\'s formations', () => {
  it('shooters on a knoll reach further down onto the field', () => {
    const world = emptyWorld();
    const kx = SIDE_X * MAP.knollOffsetM;
    const kz = SIDE_Z * MAP.knollOffsetM;
    const up = spawnRegiment(world, PLAYER, 'archers', kx, kz, 0);
    const down = spawnRegiment(world, PLAYER, 'archers', 0, 0, 0);
    expect(heightAtM(kx, kz) - heightAtM(0, 0)).toBeGreaterThan(ELEVATION.fullRiseM);
    expect(reachM(up, 0, 0)).toBeCloseTo(UNITS.archers.missileRangeM * (1 + ELEVATION.rangeBonus), 5);
    expect(reachM(down, kx, kz)).toBe(UNITS.archers.missileRangeM);
  });

  it('the computer\'s pikes form a wall when horse come near, and its horse charge in a wedge', () => {
    const world = createWorld({ seed: 3, difficulty: 'normal', computerPlays: true });
    // Its own errands (the village in the middle) aside for this test.
    if (world.ai) world.ai.pointsS = 1e9;
    const pikes = spawnRegiment(world, COMPUTER, 'pikemen', 0, -20, 0);
    const horse = spawnRegiment(world, PLAYER, 'lightCavalry', 0, 60, Math.PI);
    const theirHorse = spawnRegiment(world, COMPUTER, 'heavyCavalry', 40, -20, 0);
    cmdAttackRegiment(world, theirHorse.id, horse.id);
    run(world, 2);
    expect(theirHorse.formation).toBe('wedge');
    expect(pikes.stance).toBe('normal');
    cmdMove(world, horse.id, 0, 20, null, false);
    run(world, 12);
    expect(pikes.stance).toBe('pikeWall');
  });
});
