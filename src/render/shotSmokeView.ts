import { DynamicDrawUsage, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicNodeMaterial, MeshStandardNodeMaterial, Quaternion, type Scene, Vector3 } from 'three/webgpu';
import { abs, attribute, dot, float, normalView, pow, vec3 } from 'three/tsl';
import { heightAtM } from '../sim/terrain.ts';

/**
 * A gun's shot seen: a flash at the muzzle for a blink, then a bank of white powder smoke that swells,
 * rises and thins over a few seconds (a mortar's is smaller and goes up). Puffs come from a fixed pool;
 * the oldest is taken when it runs out.
 */

const PUFFS = 96;
const FLASHES = 16;
const PUFF_S = 4.5;
const FLASH_S = 0.12;

interface Puff {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  ageS: number;
}

export class ShotSmokeView {
  private readonly puffs: Puff[] = [];
  private readonly flashes: Puff[] = [];
  private readonly smoke: InstancedMesh;
  private readonly flash: InstancedMesh;
  private readonly fade: InstancedBufferAttribute;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private next = 0;

  constructor(scene: Scene) {
    const ball = new IcosahedronGeometry(1, 1);
    this.fade = new InstancedBufferAttribute(new Float32Array(PUFFS), 1);
    this.fade.setUsage(DynamicDrawUsage);
    ball.setAttribute('aFade', this.fade);
    const material = new MeshStandardNodeMaterial({ color: 0xd2cdc3, roughness: 1, transparent: true, depthWrite: false });
    // Thin at the rim, thicker where the eye looks through the middle: a soft ball, not a solid one.
    const facing = pow(abs(dot(normalView, vec3(0, 0, 1))), float(1.6));
    material.opacityNode = attribute('aFade', 'float').mul(facing).mul(float(0.5));
    this.smoke = new InstancedMesh(ball, material, PUFFS);
    this.smoke.name = 'gun smoke';
    this.smoke.count = 0;
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 2;
    this.smoke.instanceMatrix.setUsage(DynamicDrawUsage);
    scene.add(this.smoke);
    this.flash = new InstancedMesh(new IcosahedronGeometry(1, 0), new MeshBasicNodeMaterial({ color: 0xffd27a }), FLASHES);
    this.flash.name = 'muzzle flash';
    this.flash.count = 0;
    this.flash.frustumCulled = false;
    this.flash.instanceMatrix.setUsage(DynamicDrawUsage);
    scene.add(this.flash);
  }

  /** A shot from (x, z): a gun's flat bank of smoke, or a mortar's upward plume. */
  shot(x: number, z: number, mortar: boolean): void {
    const y = heightAtM(x, z) + (mortar ? 1.4 : 1.0);
    this.flashes.push({ x, y, z, vx: 0, vy: 0, vz: 0, size: mortar ? 0.9 : 1.2, ageS: 0 });
    if (this.flashes.length > FLASHES) this.flashes.shift();
    const n = mortar ? 6 : 9;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const spread = mortar ? 0.4 : 1.1;
      const puff: Puff = {
        x: x + Math.cos(a) * spread * Math.random(),
        y: y + Math.random() * 0.4,
        z: z + Math.sin(a) * spread * Math.random(),
        vx: Math.cos(a) * (mortar ? 0.2 : 0.7),
        vy: mortar ? 1.4 + Math.random() * 0.6 : 0.35 + Math.random() * 0.3,
        vz: Math.sin(a) * (mortar ? 0.2 : 0.7),
        size: (mortar ? 0.45 : 0.55) + Math.random() * 0.35,
        ageS: 0,
      };
      if (this.puffs.length < PUFFS) this.puffs.push(puff);
      else {
        this.puffs[this.next] = puff;
        this.next = (this.next + 1) % PUFFS;
      }
    }
  }

  update(frameSeconds: number): void {
    let n = 0;
    const fade = this.fade.array as Float32Array;
    for (const puff of this.puffs) {
      puff.ageS += frameSeconds;
      if (puff.ageS >= PUFF_S) continue;
      const t = puff.ageS / PUFF_S;
      // Slowing as it spreads; swelling to three times its size.
      const drag = Math.exp(-puff.ageS * 0.8);
      puff.x += puff.vx * drag * frameSeconds;
      puff.y += puff.vy * frameSeconds;
      puff.z += puff.vz * drag * frameSeconds;
      const size = puff.size * (1 + 2.2 * Math.sqrt(t));
      this.p.set(puff.x, puff.y, puff.z);
      this.s.set(size, size * 0.85, size);
      this.m.compose(this.p, this.q, this.s);
      this.smoke.setMatrixAt(n, this.m);
      fade[n] = (1 - t) ** 1.5;
      n++;
    }
    this.smoke.count = n;
    this.smoke.instanceMatrix.needsUpdate = true;
    this.fade.needsUpdate = true;
    let f = 0;
    for (const flash of this.flashes) {
      flash.ageS += frameSeconds;
      if (flash.ageS >= FLASH_S) continue;
      const size = flash.size * (1 - flash.ageS / FLASH_S);
      this.p.set(flash.x, flash.y, flash.z);
      this.s.set(size, size, size);
      this.m.compose(this.p, this.q, this.s);
      this.flash.setMatrixAt(f++, this.m);
    }
    this.flash.count = f;
    this.flash.instanceMatrix.needsUpdate = true;
  }
}
