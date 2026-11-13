import { type InstancedMesh, Matrix4 } from 'three/webgpu';
import { FIELDS } from '../config.ts';
import { isBuiltOn, isRoad } from '../sim/nav.ts';
import type { World } from '../sim/world.ts';

// Trees, bushes and loose rocks are scattered before anyone builds. When a
// building goes up, a road is laid or a field is broken, whatever grew there is
// cleared: its instance is shrunk to nothing (and comes back if the building
// is pulled down). Checked only when the map of what is built changes.

interface Scatter {
  mesh: InstancedMesh;
  /** How far the thing reaches from its foot: a tree's crown, a bush. */
  reachM: number;
  /** The matrices as they were scattered. */
  original: Float32Array;
  hidden: Uint8Array;
}

const NOTHING = new Matrix4().makeScale(0, 0, 0);
const AROUND: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];

export class Clearings {
  private readonly scatters: Scatter[] = [];
  private signature = '';

  /** Call after the meshes have their final instance buffers (after shareStaticInstanceShaders). */
  add(mesh: InstancedMesh, reachM: number): void {
    const original = (mesh.instanceMatrix.array as Float32Array).slice(0, mesh.count * 16);
    this.scatters.push({ mesh, reachM, original, hidden: new Uint8Array(mesh.count) });
  }

  update(world: World): void {
    let fields = 0;
    for (const town of world.towns) for (const b of town.plots) if (b) for (const s of b.strips) if (s.state !== 'wild') fields++;
    const signature = `${world.nav.version}|${fields}`;
    if (signature === this.signature) return;
    this.signature = signature;
    const nav = world.nav;
    const fieldReach = Math.hypot(FIELDS.stripLengthM, FIELDS.stripWidthM) / 2;
    for (const scatter of this.scatters) {
      let changed = false;
      for (let i = 0; i < scatter.hidden.length; i++) {
        const x = scatter.original[i * 16 + 12] as number;
        const z = scatter.original[i * 16 + 14] as number;
        let clear = false;
        for (const [dx, dz] of AROUND) {
          const px = x + dx * scatter.reachM;
          const pz = z + dz * scatter.reachM;
          if (isBuiltOn(nav, px, pz) || isRoad(nav, px, pz)) {
            clear = true;
            break;
          }
        }
        if (!clear) {
          // Inside a field that has been broken: the strip's rectangle, turned with its farm.
          for (const town of world.towns) {
            for (const b of town.plots) {
              if (!b || b.strips.length === 0 || Math.hypot(x - b.x, z - b.z) > 70) continue;
              const sin = Math.sin(b.yawRad);
              const cos = Math.cos(b.yawRad);
              for (const s of b.strips) {
                if (s.state === 'wild' || Math.abs(x - s.x) > fieldReach || Math.abs(z - s.z) > fieldReach) continue;
                const deep = Math.abs((x - s.x) * sin + (z - s.z) * cos);
                const across = Math.abs((x - s.x) * cos - (z - s.z) * sin);
                if (deep < FIELDS.stripWidthM / 2 + scatter.reachM * 0.5 && across < FIELDS.stripLengthM / 2 + scatter.reachM * 0.5) clear = true;
              }
            }
          }
        }
        if ((scatter.hidden[i] === 1) === clear) continue;
        scatter.hidden[i] = clear ? 1 : 0;
        const array = scatter.mesh.instanceMatrix.array as Float32Array;
        if (clear) array.set(NOTHING.elements, i * 16);
        else array.set(scatter.original.subarray(i * 16, i * 16 + 16), i * 16);
        changed = true;
      }
      if (changed) scatter.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
