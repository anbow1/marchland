import { cameraPosition, float, fog, max, mix, normalize, positionWorld, pow, uniform } from 'three/tsl';
import { BackSide, CircleGeometry, Color, DirectionalLight, Mesh, MeshBasicNodeMaterial, type Node, type PerspectiveCamera, PMREMGenerator, Scene, SphereGeometry, Vector3, type WebGPURenderer } from 'three/webgpu';
import type { Quality } from './stage.ts';

// Sun, sky, haze and the environment probe in physical units (rules §2.2–2.3,
// NUMBERS.md "Light"). Everything is multiplied by the pre-exposure before it
// is rendered, so half-float targets never overflow.
//
// Exposure is fixed per preset, not metered: the camera always looks down at
// sunlit ground and there are no interiors (BRIEF §11).

export interface LightPreset {
  /** Sun direction: azimuth clockwise from north (−Z), elevation above the horizon. */
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  /** Illuminance of the sun on a surface facing it, and of the sky on level ground. */
  sunIlluminanceLux: number;
  skyIlluminanceLux: number;
  /** Linear-sRGB tints of the sun's light, the zenith and the horizon. */
  sunTint: readonly [number, number, number];
  zenithTint: readonly [number, number, number];
  horizonTint: readonly [number, number, number];
  ev100: number;
  /** Haze: share of light scattered in per metre of air (a clear day sees 15–20 km: about 0.0002). */
  hazePerM: number;
}

// A clear late afternoon in early autumn: the sun 30° up and warm, long shadows that model every
// roof and rank. Lighting sheet: clear noon 100 000 lx, golden hour 12 000 lx; at 30° the direct beam
// is about two thirds of noon. A bright hazy sky with broken cloud adds nearly half of that on level
// ground, which is what keeps the shaded side of a house readable. Sun about
// 4500 K, zenith 10 000 K. EV100 half a stop under the sunny-16 value (15): scanned grass and thatch
// sit in the middle of the tone curve. The haze is a light autumn one (visibility about 8 km).
export const AFTERNOON: LightPreset = {
  sunAzimuthDeg: 236,
  sunElevationDeg: 30,
  sunIlluminanceLux: 68_000,
  skyIlluminanceLux: 30_000,
  sunTint: [1, 0.9, 0.74],
  zenithTint: [0.3, 0.48, 1],
  horizonTint: [0.74, 0.84, 1],
  ev100: 14.3,
  hazePerM: 0.00042,
};

/** Pre-exposure for an EV100 (Lagarde & de Rousiers 2014). */
export function exposureFor(ev100: number): number {
  return 1 / (1.2 * 2 ** ev100);
}

/** Mean reflectance of grassland for the ground half of the probe. */
const GROUND_ALBEDO: readonly [number, number, number] = [0.16, 0.18, 0.09];
const SUN_DISTANCE_M = 400;

export class Lighting {
  readonly sun = new DirectionalLight(0xffffff, 1);
  readonly sunDir = new Vector3();
  readonly exposure: number;
  // Sky radiances as plain vectors (linear RGB, pre-exposed).
  private readonly zenith = uniform(new Vector3());
  private readonly horizon = uniform(new Vector3());
  private readonly sunDirU = uniform(new Vector3());
  private readonly sunGlow = uniform(new Vector3());
  private readonly dome: Mesh;
  private readonly probeScene = new Scene();
  private readonly pmrem: PMREMGenerator;
  private readonly centre = new Vector3();
  private shadowRadiusM = 0;

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly scene: Scene,
    readonly preset: LightPreset,
    quality: Quality,
  ) {
    this.exposure = exposureFor(preset.ev100);
    const az = (preset.sunAzimuthDeg * Math.PI) / 180;
    const el = (preset.sunElevationDeg * Math.PI) / 180;
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    this.sunDirU.value.copy(this.sunDir);

    // A sky of uniform luminance L lights level ground with πL, so L = E/π at the mean; the zenith is
    // darker and the horizon brighter than that mean (clear-sky distribution, roughly 1 : 3).
    const meanLuminance = (preset.skyIlluminanceLux / Math.PI) * this.exposure;
    this.zenith.value.set(preset.zenithTint[0] * meanLuminance * 0.75, preset.zenithTint[1] * meanLuminance * 0.75, preset.zenithTint[2] * meanLuminance * 0.75);
    this.horizon.value.set(preset.horizonTint[0] * meanLuminance * 1.9, preset.horizonTint[1] * meanLuminance * 1.9, preset.horizonTint[2] * meanLuminance * 1.9);
    this.sunGlow.value.set(preset.sunTint[0] * meanLuminance * 5, preset.sunTint[1] * meanLuminance * 5, preset.sunTint[2] * meanLuminance * 5);

    this.sun.color.setRGB(preset.sunTint[0], preset.sunTint[1], preset.sunTint[2]);
    this.sun.intensity = preset.sunIlluminanceLux * this.exposure;
    this.sun.castShadow = true;
    const px = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(px, px);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = SUN_DISTANCE_M * 2;
    scene.add(this.sun, this.sun.target);

    this.dome = this.buildDome(5000);
    scene.add(this.dome);
    // Haze takes distant ground towards the horizon's colour: the same sky function, so they meet.
    const distanceM = positionWorld.sub(cameraPosition).length();
    const hazed = float(1).sub(distanceM.mul(-preset.hazePerM).exp());
    scene.fogNode = fog(this.horizon, hazed);

    // The probe: the same sky, and a ground disc lit by sun and sky (bounce light from below).
    this.pmrem = new PMREMGenerator(renderer);
    const probeDome = this.buildDome(50);
    this.probeScene.add(probeDome);
    const groundLux = preset.sunIlluminanceLux * Math.sin(el) + preset.skyIlluminanceLux;
    const k = (groundLux / Math.PI) * this.exposure;
    const groundMat = new MeshBasicNodeMaterial({ name: 'probe ground', color: new Color().setRGB(GROUND_ALBEDO[0] * k, GROUND_ALBEDO[1] * k, GROUND_ALBEDO[2] * k) });
    const ground = new Mesh(new CircleGeometry(48, 24).rotateX(-Math.PI / 2), groundMat);
    ground.position.y = -1.5;
    this.probeScene.add(ground);
  }

  /** Radiance of the sky in a direction: zenith to horizon, with the sun's glow round the sun. */
  private skyColour(direction: Node<'vec3'>): Node<'vec3'> {
    const up = max(direction.y, 0);
    const toHorizon = pow(float(1).sub(up), 3);
    const base = mix(this.zenith, this.horizon, toHorizon);
    const nearSun = max(direction.dot(this.sunDirU), 0);
    return base.add(this.sunGlow.mul(pow(nearSun, 24).mul(0.25).add(pow(nearSun, 900).mul(40))));
  }

  private buildDome(radiusM: number): Mesh {
    const mat = new MeshBasicNodeMaterial({ name: 'sky', side: BackSide, depthWrite: false, fog: false });
    mat.colorNode = this.skyColour(normalize(positionWorld.sub(cameraPosition)));
    const dome = new Mesh(new SphereGeometry(radiusM, 32, 16), mat);
    dome.frustumCulled = false;
    dome.renderOrder = -1;
    return dome;
  }

  /** Bakes the environment probe. Call once behind the loading screen. */
  async bakeProbe(camera: PerspectiveCamera): Promise<void> {
    // The probe's materials must be compiled before the synchronous bake, or it draws nothing.
    await this.renderer.compileAsync(this.probeScene, camera);
    await this.pmrem.compileCubemapShader();
    const target = this.pmrem.fromScene(this.probeScene, 0, 0.1, 100, { size: 128 });
    this.scene.environment = target.texture;
  }

  /**
   * Per frame: keeps the dome on the camera and fits the one shadow map to the ground the camera
   * sees. `focus` is the point on the ground the camera looks at, `viewRadiusM` how far the view
   * reaches from it. The radius moves in steps and the centre snaps to texels, so shadow edges do
   * not crawl while panning.
   */
  update(camera: PerspectiveCamera, focusX: number, focusY: number, focusZ: number, viewRadiusM: number): void {
    this.dome.position.copy(camera.position);
    // Half-octave steps between 30 m and 260 m.
    const radius = 2 ** (Math.ceil(Math.log2(Math.min(260, Math.max(30, viewRadiusM))) * 2) / 2);
    const cam = this.sun.shadow.camera;
    if (radius !== this.shadowRadiusM) {
      this.shadowRadiusM = radius;
      cam.left = -radius;
      cam.right = radius;
      cam.top = radius;
      cam.bottom = -radius;
      cam.updateProjectionMatrix();
    }
    const texelM = (2 * radius) / this.sun.shadow.mapSize.x;
    this.centre.set(Math.round(focusX / texelM) * texelM, focusY, Math.round(focusZ / texelM) * texelM);
    this.sun.target.position.copy(this.centre);
    this.sun.position.copy(this.centre).addScaledVector(this.sunDir, SUN_DISTANCE_M);
  }
}
