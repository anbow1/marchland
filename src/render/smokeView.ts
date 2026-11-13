import { Color, DynamicDrawUsage, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardNodeMaterial, Quaternion, type Scene, Vector3 } from 'three/webgpu';

// Smoke from the chimneys of houses with people in them and of workshops at work, from the smelter's
// furnace and its charcoal clamp: the quickest way to see from afar which buildings are busy. Each
// source sends up a column of puffs that rise, drift with the wind, swell and thin away; a puff is a
// low ball, so it reads the same from every side of the camera.

const PUFFS_PER_SOURCE = 7;
const MAX_SOURCES = 220;
/** Seconds a puff takes to rise and vanish, how high it gets, and how far the wind takes it. */
const LIFE_S = 6;
const RISE_M = 7;
const DRIFT_M = 3.2;
/** The wind's direction (unit, on the ground). */
const WIND_X = 0.8;
const WIND_Z = -0.6;

export class SmokeView {
  private readonly mesh: InstancedMesh;
  private readonly m = new Matrix4();
  private readonly p = new Vector3();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly c = new Color();
  private timeS = 0;

  constructor(scene: Scene) {
    const material = new MeshStandardNodeMaterial({ name: 'smoke', color: 0xd8d4cc, roughness: 1, metalness: 0, transparent: true, opacity: 0.42, depthWrite: false });
    this.mesh = new InstancedMesh(new IcosahedronGeometry(1, 1), material, MAX_SOURCES * PUFFS_PER_SOURCE);
    this.mesh.name = 'smoke';
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.renderOrder = 4;
    this.mesh.setColorAt(0, new Color(1, 1, 1));
    scene.add(this.mesh);
  }

  /** `sources` holds x, y, z for each smoking point, `count` of them. */
  update(sources: Float32Array, count: number, frameSeconds: number): void {
    this.timeS += frameSeconds;
    let n = 0;
    const sourcesShown = Math.min(count, MAX_SOURCES);
    for (let i = 0; i < sourcesShown; i++) {
      const sx = sources[i * 3] as number;
      const sy = sources[i * 3 + 1] as number;
      const sz = sources[i * 3 + 2] as number;
      // Each source on its own beat, so neighbouring chimneys do not puff in step.
      const offset = ((i * 0.618) % 1) * LIFE_S;
      for (let k = 0; k < PUFFS_PER_SOURCE; k++) {
        const t = (((this.timeS + offset) / LIFE_S + k / PUFFS_PER_SOURCE) % 1 + 1) % 1;
        const drift = DRIFT_M * t * t;
        this.p.set(sx + WIND_X * drift, sy + RISE_M * t, sz + WIND_Z * drift);
        // Swells as it rises, then shrinks away at the top in place of fading.
        const size = (0.35 + 1.5 * t) * (t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1);
        this.s.set(size, size * 0.8, size);
        this.mesh.setMatrixAt(n, this.m.compose(this.p, this.q, this.s));
        // Darker and denser at the chimney, paler as it thins.
        const tone = 0.55 + 0.45 * t;
        this.mesh.setColorAt(n, this.c.setRGB(tone, tone, tone * 0.97));
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
