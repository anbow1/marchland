import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Group, Mesh } from 'three/webgpu';
import { RtsCamera } from '../app/rtsCamera.ts';
import { ArmyView } from '../render/armyView.ts';
import { Clearings } from '../render/clearings.ts';
import { buildForest } from '../render/forestView.ts';
import { GroundWorks } from '../render/groundWorks.ts';
import { addHorizon } from '../render/horizonView.ts';
import { buildLand } from '../render/landView.ts';
import { AFTERNOON, Lighting } from '../render/lighting.ts';
import { TEAM_HEX } from '../render/palette.ts';
import { Stage } from '../render/stage.ts';
import { surfaceModel } from '../render/surfaceModel.ts';
import { loadSurfaces, surfaceMaterial } from '../render/surfaces.ts';
import { buildTerrain } from '../render/terrainView.ts';
import { cmdBuildRoad } from '../sim/commands.ts';
import { stampBuilding } from '../sim/nav.ts';
import { heightAtM } from '../sim/terrain.ts';
import { createWorld, spawnRegiment } from '../sim/world.ts';

// A page for looking at the buildings made in Blender (tools/blender/), not part of the game: every
// kind of public/buildings/index.json at one level (?level=1|2|3), in a grid on the game's ground,
// under its light, with a road and men for scale. `window.__place(x, z, distance, yaw)` and
// `window.__spots` (where each building stands) are for the screenshot script.

interface Entry {
  file: string;
  triangles: number;
}

const params = new URLSearchParams(location.search);
const level = Number(params.get('level') ?? 1);
const index = (await (await fetch('./buildings/index.json')).json()) as Record<string, Entry>;
const kinds = [...new Set(Object.keys(index).map((key) => key.split(':')[0] as string))];

const COLUMNS = 4;
const PITCH_X = 16;
const PITCH_Z = 20;
const ORIGIN_X = -149;
const ORIGIN_Z = 104;
const spots: Record<string, { x: number; z: number }> = {};
kinds.forEach((kind, i) => {
  spots[kind] = { x: ORIGIN_X + (i % COLUMNS) * PITCH_X, z: ORIGIN_Z + Math.floor(i / COLUMNS) * PITCH_Z };
});

const canvas = document.getElementById('view') as HTMLCanvasElement;
const stage = new Stage(canvas, { quality: 'high', maxPixelRatio: 1 });
await stage.init();
const lighting = new Lighting(stage.renderer, stage.scene, AFTERNOON, 'high');
const surfaces = await loadSurfaces('high', () => {});

const world = createWorld({ seed: 1, difficulty: 'normal', computerPlays: false });
world.towns[0].stock.stone = 1000;
const rows = Math.ceil(kinds.length / COLUMNS);
for (let r = 0; r < rows; r++) {
  const z = ORIGIN_Z + r * PITCH_Z - PITCH_Z / 2 + 1;
  cmdBuildRoad(world, 0, ORIGIN_X - 12, z, ORIGIN_X + (COLUMNS - 1) * PITCH_X + 12, z);
}
for (const spot of Object.values(spots)) stampBuilding(world.nav, spot.x, spot.z, 7.5, true);
const works = new GroundWorks();
works.update(world, 1);
stage.scene.add(buildTerrain(surfaces, works.texture));
addHorizon(stage.scene);
const land = buildLand(surfaces, (AFTERNOON.skyIlluminanceLux / Math.PI) * lighting.exposure);
for (const part of land.parts) stage.scene.add(part);
const trees = buildForest('high', surfaces);
for (const mesh of trees) stage.scene.add(mesh);
const clearings = new Clearings();
for (const s of land.scattered) clearings.add(s.mesh, s.reachM);
for (const mesh of trees) clearings.add(mesh, 2.4);
clearings.update(world);
await lighting.bakeProbe(stage.camera);

const material = surfaceMaterial(surfaces, 'building');
const loader = new GLTFLoader();
const spinning: Mesh[] = [];
const report: Record<string, { triangles: number; smoke: number; parts: string[] }> = {};
for (const kind of kinds) {
  const entry = index[`${kind}:${level}`];
  if (!entry) continue;
  const gltf = await loader.loadAsync(`./buildings/${entry.file}`);
  const model = surfaceModel(gltf.scene, surfaces, TEAM_HEX[0]);
  const spot = spots[kind] as { x: number; z: number };
  const group = new Group();
  group.position.set(spot.x, heightAtM(spot.x, spot.z), spot.z);
  const body = new Mesh(model.body, material);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  for (const part of model.parts) {
    const mesh = new Mesh(part.geometry, material);
    mesh.position.copy(part.pivot);
    mesh.castShadow = true;
    group.add(mesh);
    spinning.push(mesh);
  }
  stage.scene.add(group);
  report[kind] = { triangles: entry.triangles, smoke: model.smoke.length, parts: model.parts.map((p) => p.name) };
}

// Men for scale on the road before each row.
for (let r = 0; r < rows; r++) spawnRegiment(world, 0, 'swordsmen', ORIGIN_X - 8, ORIGIN_Z + r * PITCH_Z - PITCH_Z / 2 + 1, 0);
const army = new ArmyView(stage.scene);
army.update(world);

const camera = new RtsCamera(ORIGIN_X + PITCH_X * 1.5, ORIGIN_Z + PITCH_Z / 2, 0);
const offset = { x: 0, y: 0, z: 0 };
function place(x: number, z: number, distanceM: number, yawRad: number): void {
  camera.goal.targetX = x;
  camera.goal.targetZ = z;
  camera.goal.distanceM = distanceM;
  camera.goal.yawRad = yawRad;
  camera.snap();
}
place(ORIGIN_X + PITCH_X * 1.5, ORIGIN_Z + PITCH_Z / 2, 90, 0);
let frames = 0;
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  // The sails turn about the windshaft (the part's own Z, towards the front).
  for (const mesh of spinning) mesh.rotation.z += dt * 0.9;
  const pose = camera.shown;
  const y = heightAtM(pose.targetX, pose.targetZ);
  camera.offset(offset);
  stage.camera.position.set(pose.targetX + offset.x, y + offset.y, pose.targetZ + offset.z);
  stage.camera.lookAt(pose.targetX, y, pose.targetZ);
  stage.camera.updateMatrixWorld();
  lighting.update(stage.camera, pose.targetX, y, pose.targetZ, pose.distanceM * 1.3);
  stage.render();
  frames++;
  if (frames > 3) (window as unknown as { __ready: boolean }).__ready = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
Object.assign(window, { __place: place, __report: report, __spots: spots });
