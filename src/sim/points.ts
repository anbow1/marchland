import { POINTS } from '../config.ts';
import { hypot2 } from '../core/hypot.ts';
import { SIDE_X, SIDE_Z } from './terrain.ts';
import { RESOURCE_IDS, type Side } from './types.ts';
import type { World } from './world.ts';

// The places in the middle (config POINTS): who holds each, who is taking it and how far along, and the
// goods each brings its holder. A regiment standing by a place, formed and with no enemy near, takes it
// in POINTS.holdS; two sides there at once and nobody gains ground. The holder keeps it until the other
// side takes it, whether or not anyone stays.

export type PointKind = (typeof POINTS.list)[number]['kind'];

export interface Point {
  kind: PointKind;
  x: number;
  z: number;
  /** Who holds it; -1 nobody. */
  owner: Side | -1;
  /** The side taking it now (-1 none) and its seconds of standing there so far. */
  taker: Side | -1;
  progressS: number;
  /** Goods owed to the holder, by good: paid in whole units. */
  owed: Record<string, number>;
}

export function createPoints(): Point[] {
  return POINTS.list.map((p) => ({ kind: p.kind, x: SIDE_X * p.sideM, z: SIDE_Z * p.sideM, owner: -1, taker: -1, progressS: 0, owed: {} }));
}

/** Which sides have a formed regiment by the point, and which have any regiment within reach of it. */
function presence(world: World, p: Point): { by: [boolean, boolean]; near: [boolean, boolean] } {
  const by: [boolean, boolean] = [false, false];
  const near: [boolean, boolean] = [false, false];
  for (const r of world.regiments) {
    if (r.aliveMen === 0) continue;
    const d = hypot2(r.centreX - p.x, r.centreZ - p.z);
    if (d < POINTS.clearM + r.radiusM) near[r.side] = true;
    if (d < POINTS.radiusM + r.radiusM * 0.5 && r.state === 'formed') by[r.side] = true;
  }
  return { by, near };
}

/** One step of the places: taking, and the goods they bring. Events 'pointTaken' for the view and messages. */
export function stepPoints(world: World, dtSeconds: number): void {
  for (const p of world.points) {
    const { by, near } = presence(world, p);
    // Exactly one side by it and no enemy near: that side gains ground; anything else stops the taking.
    const side: Side | -1 = by[0] && !near[1] ? 0 : by[1] && !near[0] ? 1 : -1;
    if (side === -1 || side === p.owner) {
      p.taker = -1;
      p.progressS = 0;
    } else {
      if (p.taker !== side) {
        p.taker = side;
        p.progressS = 0;
      }
      p.progressS += dtSeconds;
      if (p.progressS >= POINTS.holdS) {
        p.owner = side;
        p.taker = -1;
        p.progressS = 0;
        p.owed = {};
        world.events.push('pointTaken', p.x, p.z, side);
      }
    }
    if (p.owner === -1) continue;
    const def = POINTS.list.find((d) => d.kind === p.kind) as (typeof POINTS.list)[number];
    const stock = world.towns[p.owner].stock;
    for (const id of RESOURCE_IDS) {
      const perMinute = (def.perMinute as Partial<Record<string, number>>)[id] ?? 0;
      if (perMinute <= 0) continue;
      const owed = (p.owed[id] ?? 0) + (perMinute / 60) * dtSeconds;
      const whole = Math.floor(owed);
      stock[id] += whole;
      p.owed[id] = owed - whole;
    }
  }
}
