import { Vector3 } from 'three/webgpu';
import { heightAtM } from '../sim/terrain.ts';
import type { World } from '../sim/world.ts';
import { ArmyView } from '../render/armyView.ts';
import { buildForest } from '../render/forestView.ts';
import { shareStaticInstanceShaders } from '../render/instancing.ts';
import { AFTERNOON, Lighting } from '../render/lighting.ts';
import { Markers } from '../render/markers.ts';
import { type Quality, Stage } from '../render/stage.ts';
import { buildTerrain } from '../render/terrainView.ts';
import { TownView } from '../render/townView.ts';
import { warmAllPipelines } from '../render/warmup.ts';
import { pitchForDistance, type RtsCamera } from './rtsCamera.ts';

// Everything drawn: builds the scene behind the loading screen, then each
// frame reads the world and the camera and renders. Game logic never sees
// three.js; this is the only place the two meet (rules §10).

/** Prints one stage of loading in the form the measuring scripts read. */
function logStage(name: string, startMs: number): number {
  const now = performance.now();
  console.log(`[load] ${name}: ${((now - startMs) / 1000).toFixed(2)} s`);
  return now;
}

export class WorldView {
  readonly stage: Stage;
  private lighting!: Lighting;
  private town!: TownView;
  private army!: ArmyView;
  private markers!: Markers;
  private readonly offset = { x: 0, y: 0, z: 0 };
  private readonly ndc = new Vector3();

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    // Phones render at 2× device pixels and let the governor lower the scale (rules §9).
    this.stage = new Stage(canvas, { quality, maxPixelRatio: 2 });
  }

  async load(onProgress: (share: number) => void): Promise<void> {
    const t0 = performance.now();
    let t = t0;
    await this.stage.init();
    t = logStage('renderer', t);
    onProgress(0.15);
    const scene = this.stage.scene;
    this.lighting = new Lighting(this.stage.renderer, scene, AFTERNOON, this.stage.settings.quality);
    scene.add(buildTerrain());
    t = logStage('terrain', t);
    onProgress(0.4);
    for (const mesh of buildForest(this.stage.settings.quality)) scene.add(mesh);
    t = logStage('forest', t);
    onProgress(0.55);
    this.town = new TownView(scene);
    this.army = new ArmyView(scene);
    this.markers = new Markers(scene);
    shareStaticInstanceShaders(this.stage.renderer, scene);
    t = logStage('towns and armies', t);
    onProgress(0.7);
    await this.lighting.bakeProbe(this.stage.camera);
    t = logStage('sky probe', t);
    onProgress(0.85);
    // Build every pipeline now by drawing one of everything, so nothing compiles in play.
    this.stage.camera.position.set(0, 120, 120);
    this.stage.camera.lookAt(0, 0, 0);
    this.lighting.update(this.stage.camera, 0, 0, 0, 150);
    warmAllPipelines(scene, () => this.stage.render());
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    logStage('warm-up', t);
    console.log(`[load] total: ${((performance.now() - t0) / 1000).toFixed(2)} s`);
    onProgress(1);
  }

  /** Draws a frame of the world as it is now. */
  render(world: World, camera: RtsCamera, selected: ReadonlySet<number>, selectedPlot: number): void {
    const pose = camera.shown;
    const targetY = heightAtM(pose.targetX, pose.targetZ);
    camera.offset(this.offset);
    const cam = this.stage.camera;
    cam.position.set(pose.targetX + this.offset.x, targetY + this.offset.y, pose.targetZ + this.offset.z);
    cam.lookAt(pose.targetX, targetY, pose.targetZ);
    cam.updateMatrixWorld();
    // The view reaches further along the ground the flatter the camera looks.
    const reachM = (pose.distanceM * 0.75) / Math.sin(pitchForDistance(pose.distanceM));
    this.lighting.update(cam, pose.targetX, targetY, pose.targetZ, reachM);
    this.town.update(world);
    this.army.update(world);
    this.markers.update(world, selected, selectedPlot, pose.yawRad);
    this.stage.render();
  }

  /** Screen position (CSS pixels) of a world point; false when it is behind the camera. */
  project(x: number, y: number, z: number, out: { x: number; y: number }): boolean {
    this.ndc.set(x, y, z).applyMatrix4(this.stage.camera.matrixWorldInverse);
    // Cull in view space, not by the projected depth (rules §7).
    if (this.ndc.z > -0.5) return false;
    this.ndc.applyMatrix4(this.stage.camera.projectionMatrix);
    out.x = (this.ndc.x * 0.5 + 0.5) * this.stage.canvas.clientWidth;
    out.y = (-this.ndc.y * 0.5 + 0.5) * this.stage.canvas.clientHeight;
    return true;
  }

  /** The ray through a screen point: origin and unit direction written into `out`. */
  screenRay(screenX: number, screenY: number, out: { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number }): void {
    const cam = this.stage.camera;
    this.ndc.set((screenX / this.stage.canvas.clientWidth) * 2 - 1, -(screenY / this.stage.canvas.clientHeight) * 2 + 1, 0.5).unproject(cam);
    this.ndc.sub(cam.position).normalize();
    out.ox = cam.position.x;
    out.oy = cam.position.y;
    out.oz = cam.position.z;
    out.dx = this.ndc.x;
    out.dy = this.ndc.y;
    out.dz = this.ndc.z;
  }
}
