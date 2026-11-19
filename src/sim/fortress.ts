import { CAMPAIGN } from '../config.ts';
import { townX, townZ } from './terrain.ts';

// The fortress of the campaign's last mission (map layout 'fortress'), about the computer's keep: a frame
// whose forward axis looks to the player's camp, and the rings of its walls in that frame. The scenario
// (campaign.ts) lays its walls, gates and towers from it, the view (townView.ts) its donjon, the rules
// (who is inside) both.

/** The fortress's frame: its middle, the way to the player's camp (forward) and across it (right), unit vectors. */
export function fortressFrame(): { x: number; z: number; fx: number; fz: number; rx: number; rz: number; yawRad: number } {
  const x = townX(1);
  const z = townZ(1);
  const dx = townX(0) - x;
  const dz = townZ(0) - z;
  const len = Math.hypot(dx, dz) || 1;
  const fx = dx / len;
  const fz = dz / len;
  // Right of the forward way seen from above (x east, z south): forward turned a quarter.
  return { x, z, fx, fz, rx: -fz, rz: fx, yawRad: Math.atan2(fx, fz) };
}

/** A point of the fortress: `acrossM` to the right, `alongM` towards the player's camp. */
export function fortressPoint(acrossM: number, alongM: number): [number, number] {
  const f = fortressFrame();
  return [f.x + f.rx * acrossM + f.fx * alongM, f.z + f.rz * acrossM + f.fz * alongM];
}

export type Ring = { halfWidthM: number; backM: number; frontM: number };

/** True when (x, z) lies inside a ring of the fortress's walls. */
export function insideRing(ring: Ring, x: number, z: number): boolean {
  const f = fortressFrame();
  const dx = x - f.x;
  const dz = z - f.z;
  const across = dx * f.rx + dz * f.rz;
  const along = dx * f.fx + dz * f.fz;
  return Math.abs(across) <= ring.halfWidthM && along >= -ring.backM && along <= ring.frontM;
}

/** The corners of a ring, going round: back left, back right, front right, front left. */
export function ringCorners(ring: Ring): [number, number][] {
  return [
    fortressPoint(-ring.halfWidthM, -ring.backM),
    fortressPoint(ring.halfWidthM, -ring.backM),
    fortressPoint(ring.halfWidthM, ring.frontM),
    fortressPoint(-ring.halfWidthM, ring.frontM),
  ];
}

export const OUTER: Ring = CAMPAIGN.fortress.outer;
export const INNER: Ring = CAMPAIGN.fortress.inner;
