import { describe, expect, it } from 'vitest';
import { STREETS, TOWN } from '../src/config.ts';
import { isStreetLine, originX, originZ, streetBeside, streetYaw } from '../src/sim/streets.ts';
import { streetPlan } from '../src/sim/streetNet.ts';
import { cmdBuildStreet, streetCost } from '../src/sim/commands.ts';
import { cellX, cellZ, NAV_CELLS_PER_SIDE, ROAD_PAVED, ROAD_TRACK } from '../src/sim/nav.ts';
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

  it('lays a building’s street from crossing to crossing and on through the network to the keep', () => {
    const world = createWorld({ seed: 1, difficulty: 'normal', computerPlays: false });
    const ox = originX(PLAYER);
    const oz = originZ(PLAYER);
    const onLine = (v: number): boolean => isStreetLine(v) || Math.abs(v) < 1e-6;
    for (const [i, j] of [[3, 4], [-4, 2], [2, 5], [-1, 3], [5, 0]] as const) {
      const x = ox + i * G;
      const z = oz + j * G;
      const yaw = streetYaw(PLAYER, x, z, Math.atan2(ox - x, oz - z));
      const legs = streetPlan(world, PLAYER, x, z, yaw) ?? [];
      expect(legs.length).toBeGreaterThan(2);
      for (const [x0, z0, x1, z1] of legs) expect(Math.min(Math.abs(x1 - x0), Math.abs(z1 - z0))).toBeLessThan(1e-6);
      // Between the doorstep and the yard every leg is a whole stretch: it starts and ends on crossings.
      for (const [x0, z0, x1, z1] of legs.slice(1, -1)) {
        for (const [px, pz] of [[x0, z0], [x1, z1]] as const) {
          expect(isStreetLine((px - ox) / G) || isStreetLine((pz - oz) / G)).toBe(true);
          expect(onLine((px - ox) / G) && onLine((pz - oz) / G)).toBe(true);
        }
      }
      const last = legs[legs.length - 1] as readonly number[];
      expect(Math.hypot((last[2] as number) - ox, (last[3] as number) - oz)).toBeCloseTo(TOWN.keepRadiusM + 1, 6);
    }
  });

  it('runs a new street on from the ones laid: the next building of a block pays for its doorstep only', () => {
    const world = createWorld({ seed: 1, difficulty: 'normal', computerPlays: false });
    world.towns[PLAYER].stock.stone = 5000;
    const ox = originX(PLAYER);
    const oz = originZ(PLAYER);
    // Squares (2, 4) and (2, 5) share the street at x-offset 1.5 between the crossings at z-offsets 3.5 and 5.5.
    const first = streetPlan(world, PLAYER, ox + 2 * G, oz + 4 * G, -Math.PI / 2) ?? [];
    const firstCost = streetCost(world, first);
    expect(cmdBuildStreet(world, PLAYER, first)).toBe('ok');
    const next = streetPlan(world, PLAYER, ox + 2 * G, oz + 5 * G, -Math.PI / 2) ?? [];
    expect(streetCost(world, next)).toBeLessThanOrEqual(2);
    // A square across the town reuses the ring round the keep's block.
    const far = streetPlan(world, PLAYER, ox - 2 * G, oz + 2 * G, Math.PI / 2) ?? [];
    expect(streetCost(world, far)).toBeLessThan(firstCost);
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
    expect(world.nav.road.reduce((a, b) => a + (b === ROAD_PAVED ? 1 : 0), 0)).toBeGreaterThan(100);
  });

  it('the computer’s streets hang together: every road of its town reaches the keep, the farms by tracks', { timeout: 120_000 }, () => {
    const world = createWorld({ seed: 4, difficulty: 'normal', computerPlays: true });
    for (let t = 0; t < 30 * 60 / SIM.stepSeconds; t++) stepWorld(world, SIM.stepSeconds);
    const side = 1;
    const ox = originX(side);
    const oz = originZ(side);
    const road = world.nav.road;
    const N = NAV_CELLS_PER_SIDE;
    // Every road cell within the town's reach, and those of them joined to the keep's yard (8 neighbours).
    const near = (c: number): boolean => Math.hypot(cellX(c) - ox, cellZ(c) - oz) < 200;
    const seen = new Uint8Array(road.length);
    const stack: number[] = [];
    let total = 0;
    let tracks = 0;
    for (let c = 0; c < road.length; c++) {
      if (road[c] === 0 || !near(c)) continue;
      total++;
      if (road[c] === ROAD_TRACK) tracks++;
      if (Math.hypot(cellX(c) - ox, cellZ(c) - oz) < TOWN.keepRadiusM + 3) {
        seen[c] = 1;
        stack.push(c);
      }
    }
    let joined = 0;
    while (stack.length > 0) {
      const c = stack.pop() as number;
      joined++;
      const cx = c % N;
      const cz = (c / N) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const n = nz * N + nx;
        if (seen[n] || road[n] === 0 || !near(n)) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    expect(total).toBeGreaterThan(150);
    expect(tracks).toBeGreaterThan(5);
    expect(joined / total).toBeGreaterThan(0.95);
  });
});
