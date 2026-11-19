import { describe, expect, it } from 'vitest';
import { fillRegiment } from '../src/sim/campaign.ts';
import { cmdBuildGate, cmdBuildWall, cmdMove } from '../src/sim/commands.ts';
import { FORWARD_X, FORWARD_Z, HAS_RIVER, isWater, SIDE_X, SIDE_Z, townX, townZ } from '../src/sim/terrain.ts';
import { PLAYER, type UnitKind } from '../src/sim/types.ts';
import { createWorld, spawnRegiment, type World } from '../src/sim/world.ts';
import type { Regiment } from '../src/sim/regiment.ts';
import { run } from './helpers.ts';

// Regiments over a ford and through a gate: a column follows its head (no rank swings out into the river), and
// several regiments sent the same way take turns instead of jamming in the water or the gateway.
// The fords are on the river map: `npm test` runs this file a second time with MARCHLAND_MAP=river.

const quiet = (): World => createWorld({ seed: 1, difficulty: 'normal', computerPlays: false });
const at = (f: number, s: number): [number, number] => [f * FORWARD_X + s * SIDE_X, f * FORWARD_Z + s * SIDE_Z];

interface Crossing {
  arrived: number[];
  wet: number;
  /** Most regiments with men inside the crossing at one moment. */
  together: number;
}

function march(world: World, regiments: { r: Regiment; x: number; z: number }[], seconds: number, inside: (x: number, z: number) => boolean): Crossing {
  const arrived = regiments.map(() => -1);
  let wet = 0;
  let together = 0;
  for (let t = 0; t < seconds && arrived.some((a) => a < 0); t++) {
    run(world, 1);
    regiments.forEach(({ r, x, z }, i) => {
      if (arrived[i] === -1 && r.order === 'hold' && r.soldiers.every((s) => !s.alive || Math.hypot(s.x - x, s.z - z) < 15)) arrived[i] = t;
    });
    for (const { r } of regiments) for (const s of r.soldiers) if (s.alive && isWater(s.x, s.z)) wet++;
    together = Math.max(together, regiments.filter(({ r }) => r.soldiers.some((s) => s.alive && inside(s.x, s.z))).length);
  }
  return { arrived, wet, together };
}

describe.runIf(HAS_RIVER)('over a ford', () => {
  const into = (x: number, z: number): boolean => {
    const f = x * FORWARD_X + z * FORWARD_Z;
    const s = x * SIDE_X + z * SIDE_Z;
    return Math.abs(f) < 9 && Math.abs(s - 105) < 12;
  };

  for (const [kind, men] of [['swordsmen', 40], ['heavyCavalry', 12]] as const) {
    it(`a full regiment of ${kind} crosses on the slant without a man in deep water`, { timeout: 60_000 }, () => {
      const world = quiet();
      for (const endS of [105, 65, 35]) {
        const [x0, z0] = at(-45, 105);
        const [x1, z1] = at(45, endS);
        const r = spawnRegiment(world, PLAYER, kind, x0, z0, Math.atan2(FORWARD_X, FORWARD_Z));
        fillRegiment(r, men);
        expect(cmdMove(world, r.id, x1, z1, null, false)).toBe('ok');
        const got = march(world, [{ r, x: x1, z: z1 }], 200, into);
        expect(got.wet).toBe(0);
        expect(got.arrived[0]).toBeGreaterThanOrEqual(0);
        for (const s of r.soldiers) s.alive = false;
        r.aliveMen = 0;
      }
    });
  }

  it('four regiments sent over the same ford go one after another and all get across', { timeout: 60_000 }, () => {
    const world = quiet();
    const kinds: UnitKind[] = ['swordsmen', 'pikemen', 'heavyCavalry', 'crossbowmen'];
    const sent = kinds.map((kind, i) => {
      const [x0, z0] = at(-50 - (i % 2) * 22, 75 + i * 20);
      const [x, z] = at(55 + (i % 2) * 22, 70 + i * 22);
      const r = spawnRegiment(world, PLAYER, kind, x0, z0, Math.atan2(FORWARD_X, FORWARD_Z));
      fillRegiment(r, kind === 'heavyCavalry' ? 12 : 40);
      expect(cmdMove(world, r.id, x, z, null, false)).toBe('ok');
      return { r, x, z };
    });
    const got = march(world, sent, 400, into);
    console.log('four over a ford:', JSON.stringify(got));
    expect(got.arrived.every((a) => a >= 0)).toBe(true);
    expect(got.wet).toBe(0);
    expect(got.together).toBeLessThanOrEqual(2);
  });
});

describe.runIf(HAS_RIVER)('over the causeway from both banks', () => {
  it('regiments meeting at the causeway from either side all get across (no one waits for ever)', { timeout: 120_000 }, () => {
    const world = quiet();
    const kinds: UnitKind[] = ['swordsmen', 'pikemen', 'crossbowmen', 'heavyCavalry', 'halberdiers', 'archers'];
    const sent = kinds.map((kind, i) => {
      const from = i % 2 === 0 ? -1 : 1;
      const [x0, z0] = at(from * (40 + Math.floor(i / 2) * 18), (i - 2.5) * 12);
      const [x, z] = at(-from * (55 + Math.floor(i / 2) * 15), (i - 2.5) * 10);
      const r = spawnRegiment(world, PLAYER, kind, x0, z0, Math.atan2(-from * FORWARD_X, -from * FORWARD_Z));
      fillRegiment(r, kind === 'heavyCavalry' ? 12 : 20);
      expect(cmdMove(world, r.id, x, z, null, false)).toBe('ok');
      return { r, x, z };
    });
    const got = march(world, sent, 600, (px, pz) => Math.abs(px * FORWARD_X + pz * FORWARD_Z) < 9 && Math.abs(px * SIDE_X + pz * SIDE_Z) < 12);
    console.log('both ways over the causeway:', JSON.stringify(got));
    expect(got.arrived.every((a) => a >= 0)).toBe(true);
    expect(got.wet).toBe(0);
  });
});

describe('through a gate', () => {
  it('four regiments sent through the same gate go one after another and all get through', { timeout: 60_000 }, () => {
    const world = quiet();
    const stock = world.towns[PLAYER].stock;
    stock.stone = 99999;
    stock.wood = 99999;
    stock.gold = 99999;
    const x = townX(PLAYER) + 45;
    const gz = townZ(PLAYER) - 20;
    expect(cmdBuildWall(world, PLAYER, x, townZ(PLAYER) - 90, x, townZ(PLAYER) + 50)).toBe('ok');
    expect(cmdBuildGate(world, PLAYER, x, gz)).toBe('ok');
    const kinds: UnitKind[] = ['swordsmen', 'pikemen', 'heavyCavalry', 'halberdiers'];
    const sent = kinds.map((kind, i) => {
      const r = spawnRegiment(world, PLAYER, kind, x - 30 - (i % 2) * 20, gz - 30 + i * 20, Math.PI / 2);
      fillRegiment(r, kind === 'heavyCavalry' ? 12 : 40);
      const tx = x + 35 + (i % 2) * 20;
      const tz = gz - 30 + i * 20;
      expect(cmdMove(world, r.id, tx, tz, null, false)).toBe('ok');
      return { r, x: tx, z: tz };
    });
    const got = march(world, sent, 400, (px, pz) => Math.abs(px - x) < 4 && Math.abs(pz - gz) < 10);
    console.log('four through a gate:', JSON.stringify(got));
    expect(got.arrived.every((a) => a >= 0)).toBe(true);
    expect(got.together).toBeLessThanOrEqual(2);
  });
});
