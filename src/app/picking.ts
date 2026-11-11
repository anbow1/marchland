import { MAP } from '../config.ts';
import { heightAtM } from '../sim/terrain.ts';

// Where a ray from the camera meets the ground. Plain numbers, so it is tested
// without a renderer: march along the ray until it is under the terrain, then
// close in by bisection.

export interface Ray {
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
}

const STEP_M = 4;
const MAX_M = 2500;
/** Hits beyond this distance from the map's middle are off the world. */
const LIMIT_M = MAP.halfM + 400;

/** Writes the hit point into `out` and returns true; false when the ray misses the ground. */
export function groundHit(ray: Ray, out: { x: number; z: number }): boolean {
  if (ray.dy >= -1e-4 && ray.oy > heightAtM(ray.ox, ray.oz)) return false;
  let before = 0;
  for (let t = STEP_M; t <= MAX_M; t += STEP_M) {
    const x = ray.ox + ray.dx * t;
    const z = ray.oz + ray.dz * t;
    if (Math.abs(x) > LIMIT_M || Math.abs(z) > LIMIT_M) return false;
    if (ray.oy + ray.dy * t > heightAtM(x, z)) {
      before = t;
      continue;
    }
    let lo = before;
    let hi = t;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (ray.oy + ray.dy * mid > heightAtM(ray.ox + ray.dx * mid, ray.oz + ray.dz * mid)) lo = mid;
      else hi = mid;
    }
    out.x = ray.ox + ray.dx * hi;
    out.z = ray.oz + ray.dz * hi;
    return true;
  }
  return false;
}
