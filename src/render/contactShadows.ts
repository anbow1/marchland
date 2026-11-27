import { DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicNodeMaterial, PlaneGeometry, Quaternion, type Scene, Vector3 } from 'three/webgpu';
import { abs, float, length, max, smoothstep, uv, vec2, vec3 } from 'three/tsl';
import { TOWN } from '../config.ts';
import { heightAtM, townX, townZ } from '../sim/terrain.ts';
import type { World } from '../sim/world.ts';

// Soft contact shadows on the ground round every building and keep (after anbow1/mediveal-village's): the
// earth darkens where a wall meets it, so a house sits in the ground instead of floating on it, in the sun
// and in its own shadow alike. One instanced quad a building, a rounded square fading from the footprint
// outwards; rebuilt only when the buildings change.

const MAX_SHADOWS = 256;
/** How dark the ground is right under the wall, and how far past the footprint the shade fades out (m). */
const STRENGTH = 0.38;
const FEATHER_M = 2.4;

export class ContactShadows {
  private readonly mesh: InstancedMesh;
  private signature = '';
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);

  constructor(scene: Scene) {
    // A rounded square: dark inside the footprint (the inner 60% of the quad), fading to nothing at its edge.
    const material = new MeshBasicNodeMaterial({ name: 'contact shadow', transparent: true, depthWrite: false, fog: false });
    const p = abs(uv().mul(2).sub(1));
    const d = length(max(p.sub(vec2(0.6, 0.6)), vec2(0, 0))).div(0.4);
    material.colorNode = vec3(0, 0, 0);
    material.opacityNode = float(STRENGTH).mul(float(1).sub(smoothstep(0, 1, d)));
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -2;
    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material, MAX_SHADOWS);
    this.mesh.name = 'contact shadows';
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  /** Call once a frame; places the shadows again only when a building is added, finished, raised or lost. */
  update(world: World): void {
    let signature = '';
    for (const town of world.towns) {
      signature += `|${town.keepHp > 0 ? 1 : 0}`;
      for (const b of town.plots) if (b) signature += `${b.x | 0},${b.z | 0},${b.level},${b.constructionLeftS > 0 ? 0 : 1};`;
    }
    if (signature === this.signature) return;
    this.signature = signature;
    let n = 0;
    const place = (x: number, z: number, yawRad: number, footprintM: number): void => {
      if (n >= MAX_SHADOWS) return;
      // The footprint fills the inner 60% of the quad; the rest (at least FEATHER_M a side) is the fade.
      const size = Math.max(footprintM / 0.6, footprintM + 2 * FEATHER_M);
      this.p.set(x, heightAtM(x, z) + 0.04, z);
      this.q.setFromAxisAngle(this.up, yawRad);
      this.s.set(size, 1, size);
      this.mesh.setMatrixAt(n++, this.m.compose(this.p, this.q, this.s));
    };
    for (const town of world.towns) {
      if (town.keepHp > 0) place(townX(town.side), townZ(town.side), 0, TOWN.keepRadiusM * 2);
      for (const b of town.plots) {
        if (!b || (b.constructionLeftS > 0 && b.level === 1)) continue;
        place(b.x, b.z, b.yawRad, TOWN.buildingRadiusM * 1.6);
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
