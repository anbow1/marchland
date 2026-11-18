import { Color, DynamicDrawUsage, InstancedMesh, Matrix4, Quaternion, type Scene, Vector3 } from 'three/webgpu';
import { FIELDS } from '../config.ts';
import type { Building } from '../sim/economy.ts';
import { heightAtM } from '../sim/terrain.ts';
import type { World } from '../sim/world.ts';
import { cardMaterial, cornPatchGeometry } from './foliage.ts';

// The corn on a farm's strips, standing: patches of stalks that come up green after sowing, grow to a
// man's waist and turn gold as they ripen, and are gone when the strip is reaped (the stubble and the
// ploughed earth are the ground's own colours, groundWorks.ts). Redrawn a little at a time as it grows,
// so the field is seen to rise.

/** Patches across and along a strip. */
const PATCH_M = 0.9;
const MAX_PATCHES = 14000;
/** Full height of ripe corn, in metres. */
const RIPE_M = 1.05;
const GREEN = new Color(0x5f8a2c);
const GOLD = new Color(0xd8b45a);

export class CropsView {
  private readonly corn: InstancedMesh;
  private readonly m = new Matrix4();
  private readonly p = new Vector3();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly tint = new Color();
  private signature = '';

  constructor(scene: Scene) {
    this.corn = new InstancedMesh(cornPatchGeometry(PATCH_M * 1.35), cardMaterial('corn'), MAX_PATCHES);
    this.corn.name = 'corn';
    this.corn.instanceMatrix.setUsage(DynamicDrawUsage);
    this.corn.count = 0;
    this.corn.frustumCulled = false;
    this.corn.castShadow = true;
    this.corn.receiveShadow = true;
    this.corn.setColorAt(0, new Color(1, 1, 1));
    scene.add(this.corn);
  }

  /** Redraws when a strip is sown or reaped, or its corn has grown a step (forty steps to ripe). */
  update(world: World): void {
    let signature = '';
    for (const town of world.towns) {
      for (const b of town.plots) {
        if (!b || b.kind !== 'farm' || b.constructionLeftS > 0) continue;
        signature += `|${b.x.toFixed(1)}${b.level}`;
        for (const strip of b.strips) signature += strip.state === 'growing' ? Math.floor(strip.growth * 40) : strip.state[0];
      }
    }
    if (signature === this.signature) return;
    this.signature = signature;
    let n = 0;
    for (const town of world.towns) {
      for (const b of town.plots) {
        if (!b || b.kind !== 'farm' || b.constructionLeftS > 0) continue;
        const worked = Math.min(FIELDS.stripsPerLevel[b.level - 1] as number, b.strips.length);
        for (let i = 0; i < worked; i++) n = this.sow(b, b.strips[i] as Building['strips'][number], n);
      }
    }
    this.corn.count = n;
    this.corn.instanceMatrix.needsUpdate = true;
    if (this.corn.instanceColor) this.corn.instanceColor.needsUpdate = true;
  }

  private sow(b: Building, strip: Building['strips'][number], n: number): number {
    if (strip.state !== 'growing' && strip.state !== 'ripe') return n;
    const growth = strip.state === 'ripe' ? 1 : strip.growth;
    // Shoots first (a hand high), then the stalks rise; the colour turns in the last third.
    const height = RIPE_M * (0.12 + 0.88 * Math.min(1, growth * 1.4));
    const gold = Math.min(1, Math.max(0, (growth - 0.6) / 0.4));
    const across = { x: Math.cos(b.yawRad), z: -Math.sin(b.yawRad) };
    const deep = { x: Math.sin(b.yawRad), z: Math.cos(b.yawRad) };
    const cols = Math.max(1, Math.floor(FIELDS.stripLengthM / PATCH_M));
    const rows = Math.max(1, Math.floor(FIELDS.stripWidthM / PATCH_M));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (n >= MAX_PATCHES) return n;
        const a = (c - (cols - 1) / 2) * PATCH_M;
        const d = (r - (rows - 1) / 2) * PATCH_M;
        // A stable jitter, so the patches do not stand in a visible grid.
        const j = Math.sin((strip.x + c * 12.9898 + r * 78.233) * 43758.5453);
        const x = strip.x + across.x * a + deep.x * d + j * 0.25;
        const z = strip.z + across.z * a + deep.z * d - j * 0.2;
        this.p.set(x, heightAtM(x, z) - 0.02, z);
        this.q.setFromAxisAngle(this.up, b.yawRad + j * 1.3);
        this.s.set(1, height * (0.9 + 0.12 * j), 1);
        this.corn.setMatrixAt(n, this.m.compose(this.p, this.q, this.s));
        this.corn.setColorAt(n, this.tint.copy(GREEN).lerp(GOLD, gold).multiplyScalar(1.35 + 0.1 * j));
        n++;
      }
    }
    return n;
  }
}
