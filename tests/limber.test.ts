import { describe, expect, it } from 'vitest';
import { GUNS, SIM, UNITS } from '../src/config.ts';
import { cmdMove } from '../src/sim/commands.ts';
import { fillRegiment } from '../src/sim/campaign.ts';
import { COMPUTER, PLAYER } from '../src/sim/types.ts';
import { createWorld, spawnRegiment, stepWorld, type World } from '../src/sim/world.ts';

// Guns limber up to move and unlimber to fire, and fire only within their arc.

function shotsIn(world: World, seconds: number): number {
  let shots = 0;
  for (let s = 0; s < seconds / SIM.stepSeconds; s++) {
    world.events.clear();
    stepWorld(world, SIM.stepSeconds);
    for (let i = 0; i < world.events.count; i++) {
      const e = world.events.items[i];
      if (e && e.kind.endsWith('Shot')) shots++;
    }
  }
  return shots;
}

describe('limbering', () => {
  it('every gun has a limber time, the light ones quicker than the heavy', () => {
    expect(UNITS.horseGuns.limberS).toBe(5);
    expect(UNITS.falconets.limberS).toBe(6);
    expect(UNITS.fieldGuns.limberS).toBe(10);
    expect(UNITS.cannon.limberS).toBe(12);
    expect(UNITS.culverins.limberS).toBe(15);
    expect(UNITS.mortar.limberS).toBe(20);
    expect(UNITS.swordsmen.limberS).toBeUndefined();
    expect(UNITS.culverins.aimTurnRadS ?? 1).toBeLessThan(UNITS.falconets.aimTurnRadS ?? 0);
  });

  it('a gun stands while it is limbered up, then moves; at the halt it unlimbers before it fires', () => {
    const world = createWorld({ seed: 2, difficulty: 'normal', computerPlays: false });
    const gun = spawnRegiment(world, PLAYER, 'fieldGuns', 0, 0, Math.PI);
    fillRegiment(gun, UNITS.fieldGuns.men);
    expect(cmdMove(world, gun.id, 0, -40, Math.PI, false)).toBe('ok');
    const limberS = UNITS.fieldGuns.limberS as number;
    for (let s = 0; s < (limberS - 1) / SIM.stepSeconds; s++) stepWorld(world, SIM.stepSeconds);
    expect(Math.abs(gun.anchorZ)).toBeLessThan(0.01);
    expect(gun.limbered ?? false).toBe(false);
    for (let s = 0; s < 2 / SIM.stepSeconds; s++) stepWorld(world, SIM.stepSeconds);
    expect(gun.limbered).toBe(true);
    // Marched there (40 m at 1.4 m/s), then unlimbering.
    for (let s = 0; s < 40 / SIM.stepSeconds && gun.anchorZ > -39.9; s++) stepWorld(world, SIM.stepSeconds);
    expect(gun.anchorZ).toBeLessThan(-39.5);
    expect(gun.limbered).toBe(true);
    // An enemy in reach ahead: no shot while the team is taken off, then it fires.
    const target = spawnRegiment(world, COMPUTER, 'swordsmen', 0, -160, 0);
    fillRegiment(target, 12);
    target.order = 'hold';
    expect(shotsIn(world, limberS - 1)).toBe(0);
    expect(shotsIn(world, 12)).toBeGreaterThan(0);
    expect(gun.limbered).toBe(false);
  });

  it('an unlimbered gun facing away swings round slowly before it fires', () => {
    const world = createWorld({ seed: 4, difficulty: 'normal', computerPlays: false });
    // Facing +Z; the enemy lies behind it, at −Z.
    const gun = spawnRegiment(world, PLAYER, 'culverins', 0, 0, 0);
    fillRegiment(gun, UNITS.culverins.men);
    const target = spawnRegiment(world, COMPUTER, 'swordsmen', 0, -120, 0);
    fillRegiment(target, 12);
    target.order = 'hold';
    // π − 15° to turn at aimTurnRadS: no shot before then.
    const turnS = (Math.PI - GUNS.arcRad) / (UNITS.culverins.aimTurnRadS as number);
    expect(shotsIn(world, turnS - 2)).toBe(0);
    expect(shotsIn(world, 15)).toBeGreaterThan(0);
  });
});
