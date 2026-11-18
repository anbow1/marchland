import { describe, expect, it } from 'vitest';
import { dragFacing } from '../src/sim/commands.ts';

const turn = (a: number, b: number): number => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

describe('a dragged facing', () => {
  it('turns smoothly with the drag all the way round: no jump anywhere in 360°', () => {
    let last = dragFacing(0, 0, 10, 0);
    let total = 0;
    for (let deg = 1; deg <= 360; deg++) {
      const a = (deg * Math.PI) / 180;
      const f = dragFacing(0, 0, Math.cos(a) * 10, Math.sin(a) * 10);
      const step = turn(f, last);
      // A degree of drag is a degree of facing, the same way round each time.
      expect(Math.abs(Math.abs(step) - Math.PI / 180)).toBeLessThan(1e-9);
      total += step;
      last = f;
    }
    expect(Math.abs(Math.abs(total) - Math.PI * 2)).toBeLessThan(1e-9);
  });

  it('looks square to the drag, to its left seen from above', () => {
    // Dragged along +X: the line looks along −Z (forward is (sin f, cos f)).
    const f = dragFacing(5, 5, 15, 5);
    expect(Math.sin(f)).toBeCloseTo(0, 9);
    expect(Math.cos(f)).toBeCloseTo(-1, 9);
    // The other way along the same front: the other way round.
    const back = dragFacing(15, 5, 5, 5);
    expect(Math.cos(back)).toBeCloseTo(1, 9);
  });
});
