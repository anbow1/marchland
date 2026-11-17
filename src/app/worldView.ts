import { WorkersView } from '../render/workersView.ts';
import { AnimalsView } from '../render/animalsView.ts';
import { ShotSmokeView } from '../render/shotSmokeView.ts';
import { Vector3 } from 'three/webgpu';
import { heightAtM } from '../sim/terrain.ts';
import type { BuildingKind } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { ArmyView } from '../render/armyView.ts';
import { buildForest, type Forest } from '../render/forestView.ts';
import { PointsView } from '../render/pointsView.ts';
import { createPoints } from '../sim/points.ts';
import { addHorizon } from '../render/horizonView.ts';
import { shareStaticInstanceShaders } from '../render/instancing.ts';
import { AFTERNOON, Lighting } from '../render/lighting.ts';
import { Clearings } from '../render/clearings.ts';
import { GroundWorks } from '../render/groundWorks.ts';
import { buildLand } from '../render/landView.ts';
import { type GroundTiles, Markers } from '../render/markers.ts';
import { PeopleView } from '../render/peopleView.ts';
import { SmokeView } from '../render/smokeView.ts';
import { WallView } from '../render/wallView.ts';
import { VinesView } from '../render/vinesView.ts';
import { CropsView } from '../render/cropsView.ts';
import { type Quality, Stage } from '../render/stage.ts';
import { loadSurfaces, releaseCpuCopies } from '../render/surfaces.ts';
import { buildTerrain, type TerrainGrid } from '../render/terrainView.ts';
import { GrassView } from '../render/grassView.ts';
import { TownView } from '../render/townView.ts';
import { warmAllPipelines } from '../render/warmup.ts';
import type { RtsCamera } from './rtsCamera.ts';

// Everything drawn: builds the scene behind the loading screen, then each
// frame reads the world and the camera and renders. Game logic never sees
// three.js; this is the only place the two meet (rules §10).

/** The building the player is about to place. */
export interface Ghost {
  kind: BuildingKind;
  x: number;
  z: number;
  yawRad: number;
  allowed: boolean;
}

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
  private workers!: WorkersView;
  private animals!: AnimalsView;
  private shotSmoke!: ShotSmokeView;
  private markers!: Markers;
  private people!: PeopleView;
  private vines!: VinesView;
  private crops!: CropsView;
  private smoke!: SmokeView;
  private walls!: WallView;
  private forest!: Forest;
  private points!: PointsView;
  private readonly smokeSources = new Float32Array(220 * 3);
  private readonly works = new GroundWorks();
  private grass!: GrassView;
  private clockS = 0;
  private readonly clearings = new Clearings();
  private readonly offset = { x: 0, y: 0, z: 0 };
  private readonly ndc = new Vector3();

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    // Phones render at 2× device pixels and let the governor lower the scale (rules §9).
    // Low (tablets, phones): a pixel per CSS pixel, a quarter of a Retina screen's; the HUD stays sharp.
    this.stage = new Stage(canvas, { quality, maxPixelRatio: quality === 'low' ? 1 : 2 });
  }

  async load(onProgress: (share: number) => void): Promise<void> {
    const t0 = performance.now();
    let t = t0;
    await this.stage.init();
    t = logStage('renderer', t);
    onProgress(0.15);
    const scene = this.stage.scene;
    const quality = this.stage.settings.quality;
    this.lighting = new Lighting(this.stage.renderer, scene, AFTERNOON, quality);
    const surfaces = await loadSurfaces(quality, (share) => onProgress(0.15 + share * 0.25));
    t = logStage('textures', t);
    const terrain = buildTerrain(surfaces, this.works.texture);
    scene.add(terrain);
    this.grass = new GrassView(terrain.userData['grid'] as TerrainGrid, this.works.texture, quality);
    scene.add(this.grass.field.group);
    const land = buildLand(surfaces, (AFTERNOON.skyIlluminanceLux / Math.PI) * this.lighting.exposure);
    for (const part of land.parts) scene.add(part);
    addHorizon(scene);
    t = logStage('terrain', t);
    onProgress(0.45);
    this.forest = buildForest(quality, surfaces);
    for (const mesh of this.forest.meshes) scene.add(mesh);
    t = logStage('forest', t);
    onProgress(0.55);
    this.town = new TownView(scene, surfaces);
    const models = await this.town.loadModels(import.meta.env.BASE_URL);
    this.town.warm();
    this.people = new PeopleView(scene, surfaces);
    // The modelled townsfolk (about 1 500 triangles each, a few hundred people at most) on every preset:
    // the built figures read as blocks.
    await Promise.all([this.people.loadCarts(import.meta.env.BASE_URL), this.people.loadTownsfolk(import.meta.env.BASE_URL)]);
    // After the townsfolk: their loads are held in the hands, not on the shoulder.
    await this.people.loadGoods(import.meta.env.BASE_URL);
    this.vines = new VinesView(scene, surfaces);
    this.crops = new CropsView(scene);
    this.smoke = new SmokeView(scene);
    this.points = new PointsView(scene, surfaces, createPoints());
    await this.points.load(import.meta.env.BASE_URL);
    this.walls = new WallView(scene, surfaces);
    await this.walls.loadModel(import.meta.env.BASE_URL);
    this.workers = new WorkersView(scene);
    await this.workers.load(import.meta.env.BASE_URL);
    this.shotSmoke = new ShotSmokeView(scene);
    this.animals = new AnimalsView(scene);
    await this.animals.load(import.meta.env.BASE_URL);
    this.army = new ArmyView(scene);
    await this.army.loadBodies(import.meta.env.BASE_URL);
    this.markers = new Markers(scene);
    shareStaticInstanceShaders(this.stage.renderer, scene);
    for (const s of land.scattered) this.clearings.add(s.mesh, s.reachM);
    for (const mesh of this.forest.meshes) if (mesh.name !== 'stumps') this.clearings.add(mesh, 2.4);
    t = logStage(`towns and armies (${models} building models)`, t);
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
    // Everything has been drawn once, so the GPU holds every scan: the CPU copies can go.
    console.log(`[load] released ${(releaseCpuCopies(surfaces) / 1e6).toFixed(0)} MB of texture copies`);
    logStage('warm-up', t);
    console.log(`[load] total: ${((performance.now() - t0) / 1000).toFixed(2)} s`);
    onProgress(1);
  }

  /** Draws a frame of the world as it is now. `ghost` is the building being placed and `tiles` the road or fields being laid, if any. */
  render(world: World, camera: RtsCamera, selected: ReadonlySet<number>, selectedPlot: number, ghost: Ghost | null, tiles: GroundTiles | null, frameSeconds: number): void {
    const pose = camera.shown;
    const targetY = heightAtM(pose.targetX, pose.targetZ);
    camera.offset(this.offset);
    const cam = this.stage.camera;
    cam.position.set(pose.targetX + this.offset.x, targetY + this.offset.y, pose.targetZ + this.offset.z);
    cam.lookAt(pose.targetX, targetY, pose.targetZ);
    cam.updateMatrixWorld();
    // The view reaches further along the ground the flatter the camera looks.
    const reachM = (pose.distanceM * 0.75) / Math.sin(camera.pitch());
    this.lighting.update(cam, pose.targetX, targetY, pose.targetZ, reachM);
    this.works.update(world, frameSeconds);
    this.clockS += frameSeconds;
    this.grass.update(cam.position, targetY, this.clockS, frameSeconds, cam.fov, this.stage.renderer.domElement.height);
    this.clearings.update(world);
    this.town.update(world, frameSeconds);
    this.town.setGhost(ghost ? ghost.kind : null, ghost?.x ?? 0, ghost?.z ?? 0, ghost?.yawRad ?? 0, ghost?.allowed ?? false);
    this.people.update(world);
    this.vines.update(world);
    this.crops.update(world);
    this.walls.update(world, frameSeconds);
    this.forest.update(world.stand, world.timeS);
    this.points.update(world, world.timeS);
    this.smoke.update(this.smokeSources, this.town.smokeSources(world, this.smokeSources), frameSeconds);
    this.army.update(world);
    this.workers.update(world);
    this.animals.update(world, this.people.harnessed, this.people.harnessedCount);
    this.shotSmoke.update(frameSeconds);
    this.markers.update(world, selected, selectedPlot, pose.yawRad, tiles);
    this.markers.updateReach(world, ghost ? ghost.kind : null, pose.distanceM);
    this.stage.render();
  }

  /** A gun or a mortar fired from (x, z): its flash and smoke. */
  gunSmoke(x: number, z: number, mortar: boolean): void {
    this.shotSmoke.shot(x, z, mortar);
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
