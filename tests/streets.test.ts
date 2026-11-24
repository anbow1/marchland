import { describe, expect, it } from 'vitest';
import { STREETS, TOWN } from '../src/config.ts';
import { isStreetLine, originX, originZ, streetBeside, streetWay, streetYaw } from '../src/sim/streets.ts';
import { PLAYER } from '../src/sim/types.ts';
import { createWorld, stepWorld } from '../src/sim/world.ts';
import { SIM } from '../src/config.ts';

const G = TOWN.gridM;

describe('the chessboard street plan', () => {
  it('puts a street line on one side of every square but the keep’s, half-way between squares', () => {
    expect(streetBeside(0)).toBeNull();
    for (let i = -9; i <= 9; i++) {
      if (i === 0) continue;
      const line = streetBeside(i) as number;
      expect(Math.abs(line - i)).toBeCloseTo(0.5, 9);
      expect(isStreetLine(line)).toBe(true);
    }
    // Blocks of two: squares 2 and 3 share a block, each on its own street.
    expect(streetBeside(2)).toBe(1.5);
    expect(streetBeside(3)).toBe(1.5 + STREETS.blockSquares);
    expect(isStreetLine(2.5)).toBe(false);
  });

  it('turns a door onto one of its two streets, the one nearer the wished facing', () => {
    const ox = originX(PLAYER);
    const oz = originZ(PLAYER);
    // Square (2, 3): streets at x-offset 1.5 (towards −X) and z-offset 3.5 (towards +Z).
    expect(streetYaw(PLAYER, ox + 2 * G, oz + 3 * G, -Math.PI / 2 + 0.2)).toBeCloseTo(-Math.PI / 2, 9);
    expect(streetYaw(PLAYER, ox + 2 * G, oz + 3 * G, 0.1)).toBeCloseTo(0, 9);
  });

  it('leads from a door to the keep along street lines and then straight across the yard', () => {
    const ox = originX(PLAYER);
    const oz = originZ(PLAYER);
    for (const [i, j] of [[3, 4], [-4, 2], [2, -5], [-1, 3], [5, 0]] as const) {
      const x = ox + i * G;
      const z = oz + j * G;
      const yaw = streetYaw(PLAYER, x, z, Math.atan2(ox - x, oz - z));
      const way = streetWay(PLAYER, x, z, yaw);
      expect(way).not.toBeNull();
      const legs = way ?? [];
      for (const [x0, z0, x1, z1] of legs) {
        // Every leg runs along one axis.
        expect(Math.min(Math.abs(x1 - x0), Math.abs(z1 - z0))).toBeLessThan(1e-6);
      }
      // Between the doorstep and the yard, every leg lies on a street line (never through a block).
      for (const [x0, z0, x1, z1] of legs.slice(1, -1)) {
        const onX = Math.abs(x1 - x0) < 1e-6 && isStreetLine((x0 - ox) / G);
        const onZ = Math.abs(z1 - z0) < 1e-6 && isStreetLine((z0 - oz) / G);
        expect(onX || onZ).toBe(true);
      }
      const last = legs[legs.length - 1] as readonly number[];
      expect(Math.hypot((last[2] as number) - ox, (last[3] as number) - oz)).toBeCloseTo(TOWN.keepRadiusM + 1, 6);
    }
  });

  it('the computer builds its town on the plan: its grid buildings look onto streets, laid as roads', { timeout: 120_000 }, () => {
    const world = createWorld({ seed: 4, difficulty: 'normal', computerPlays: true });
    for (let t = 0; t < 8 * 60 / SIM.stepSeconds; t++) stepWorld(world, SIM.stepSeconds);
    const side = 1;
    const ox = originX(side);
    const oz = originZ(side);
    let onGrid = 0;
    for (const b of world.towns[side].plots) {
      if (!b) continue;
      const i = Math.round((b.x - ox) / G);
      const j = Math.round((b.z - oz) / G);
      if (Math.abs(ox + i * G - b.x) > 0.01 || Math.abs(oz + j * G - b.z) > 0.01) continue;
      onGrid++;
      // The door looks at the street beside its square.
      const fx = Math.round(Math.sin(b.yawRad));
      const fz = Math.round(Math.cos(b.yawRad));
      const line = fx !== 0 ? streetBeside(i) : streetBeside(j);
      expect(line).not.toBeNull();
      expect(Math.sign((line as number) - (fx !== 0 ? i : j))).toBe(fx !== 0 ? fx : fz);
    }
    expect(onGrid).toBeGreaterThan(4);
    expect(world.nav.road.reduce((a, b) => a + b, 0)).toBeGreaterThan(100);
  });
});
