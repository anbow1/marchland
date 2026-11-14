import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Box3, Group, Mesh, type Object3D, Vector3 } from 'three/webgpu';
import { RtsCamera } from '../app/rtsCamera.ts';
import { ArmyView } from '../render/armyView.ts';
import { keepGeometry } from '../render/buildingGeometry.ts';
import { GroundWorks } from '../render/groundWorks.ts';
import { addHorizon } from '../render/horizonView.ts';
import { AFTERNOON, Lighting } from '../render/lighting.ts';
import { TEAM_HEX } from '../render/palette.ts';
import { Stage } from '../render/stage.ts';
import { loadSurfaces, surfaceMaterial } from '../render/surfaces.ts';
import { buildTerrain } from '../render/terrainView.ts';
import { heightAtM } from '../sim/terrain.ts';
import { createWorld, spawnRegiment } from '../sim/world.ts';

// A page for one decision, not part of the game: candidate models for the main castle (downloads the
// player sent, CC BY 4.0, kept out of the repository) beside today's keep from code, each fitted to the
// same footprint on the game's own ground and light, with a regiment for scale; and the downloaded
// characters at a man's height. `window.__place(x, z, distance, yaw)` and `window.__spots` are for the
// screenshot script.
//
//   npx vite build --config vite.compare.config.ts   (dist-compare/models linked to the downloads)

interface Candidate {
  name: string;
  url: string;
  /** Longest side of the footprint it is fitted to, metres; 0 keeps the file's size times `scale`. */
  fitM: number;
  scale: number;
}

const CASTLES: Candidate[] = [
  { name: 'buckstone', url: 'buckstone_castle/scene.gltf', fitM: 30, scale: 1 },
  { name: 'environment', url: 'enviromental_modeling_castle/scene.gltf', fitM: 30, scale: 1 },
  { name: 'towerWalls', url: 'tower_and_castle_walls/scene.glb', fitM: 30, scale: 1 },
  { name: 'castleGlb', url: 'castle_glb/scene.glb', fitM: 30, scale: 1 },
  { name: 'castle', url: 'castle/scene.gltf', fitM: 30, scale: 1 },
  { name: 'uv', url: 'uv_castle/scene.gltf', fitM: 30, scale: 1 },
  { name: 'medieval', url: 'medieval_castle/scene.gltf', fitM: 30, scale: 1 },
  { name: 'fougeres', url: 'fougeres_castle/scene.gltf', fitM: 18, scale: 1 },
];
const CHARACTERS: Candidate[] = [
  { name: 'lowpoly', url: 'lowpoly_medieval_characters/scene.gltf', fitM: 0, scale: 1 },
  { name: 'mannik', url: 'mannik/scene.gltf', fitM: 0, scale: 1 },
];

const COLUMNS = 3;
const PITCH_M = 48;
const ORIGIN_X = -60;
const ORIGIN_Z = -40;
const spots: Record<string, { x: number; z: number }> = {};
[{ name: 'codeKeep' }, ...CASTLES].forEach((c, i) => {
  spots[c.name] = { x: ORIGIN_X + (i % COLUMNS) * PITCH_M, z: ORIGIN_Z + Math.floor(i / COLUMNS) * PITCH_M };
});
spots['characters'] = { x: ORIGIN_X + PITCH_M, z: ORIGIN_Z + 3 * PITCH_M - 14 };

const canvas = document.getElementById('view') as HTMLCanvasElement;
const stage = new Stage(canvas, { quality: 'high', maxPixelRatio: 1 });
await stage.init();
const lighting = new Lighting(stage.renderer, stage.scene, AFTERNOON, 'high');
const surfaces = await loadSurfaces('high', () => {});
const world = createWorld({ seed: 1, difficulty: 'normal', computerPlays: false });
stage.scene.add(buildTerrain(surfaces, new GroundWorks().texture));
addHorizon(stage.scene);
await lighting.bakeProbe(stage.camera);

const size = new Vector3();
const report: Record<string, { triangles: number; sizeM: number[] }> = {};

/** Stands a model on the ground at (x, z), fitted to `fitM` (or scaled), centred; returns its size. */
function place(root: Object3D, x: number, z: number, fitM: number, scale: number): number[] {
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root);
  box.getSize(size);
  const k = fitM > 0 ? fitM / Math.max(size.x, size.z) : scale;
  const group = new Group();
  root.position.set(-((box.min.x + box.max.x) / 2), -box.min.y, -((box.min.z + box.max.z) / 2));
  group.add(root);
  group.scale.setScalar(k);
  group.position.set(x, heightAtM(x, z), z);
  stage.scene.add(group);
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return [size.x * k, size.y * k, size.z * k].map((v) => Math.round(v * 10) / 10);
}

function triangles(root: Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    n += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  });
  return n;
}

// Today's keep, from code.
{
  const spot = spots['codeKeep'] as { x: number; z: number };
  const keep = new Mesh(keepGeometry(TEAM_HEX[0], surfaces), surfaceMaterial(surfaces, 'keep'));
  keep.castShadow = true;
  keep.receiveShadow = true;
  const g = keep.geometry;
  report['codeKeep'] = { triangles: (g.index ? g.index.count : g.getAttribute('position').count) / 3, sizeM: place(keep, spot.x, spot.z, 0, 1) };
}
const loader = new GLTFLoader();
for (const c of CASTLES) {
  const spot = spots[c.name] as { x: number; z: number };
  try {
    const gltf = await loader.loadAsync(`./models/${c.url}`);
    report[c.name] = { triangles: triangles(gltf.scene), sizeM: place(gltf.scene, spot.x, spot.z, c.fitM, c.scale) };
  } catch (error) {
    console.error(`${c.name}: ${String(error)}`);
  }
}
// The characters: each figure stood at 1.8 m, in a row, before a regiment of the game's own men.
{
  const spot = spots['characters'] as { x: number; z: number };
  let x = spot.x - 6;
  for (const c of CHARACTERS) {
    const gltf = await loader.loadAsync(`./models/${c.url}`);
    gltf.scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(gltf.scene);
    box.getSize(size);
    const k = 1.8 / size.y;
    report[c.name] = { triangles: triangles(gltf.scene), sizeM: place(gltf.scene, x, spot.z, 0, k) };
    x += 5;
  }
  spawnRegiment(world, 0, 'swordsmen', spot.x + 6, spot.z + 2, 0);
}
for (const [name, s] of Object.entries(spots)) if (name !== 'characters') spawnRegiment(world, 0, 'pikemen', s.x, s.z + 20, 0);
const army = new ArmyView(stage.scene);
army.update(world);

const camera = new RtsCamera(ORIGIN_X + PITCH_M, ORIGIN_Z + PITCH_M, 0);
const offset = { x: 0, y: 0, z: 0 };
function setView(x: number, z: number, distanceM: number, yawRad: number): void {
  camera.goal.targetX = x;
  camera.goal.targetZ = z;
  camera.goal.distanceM = distanceM;
  camera.goal.yawRad = yawRad;
  camera.snap();
}
setView(ORIGIN_X + PITCH_M, ORIGIN_Z + PITCH_M, 160, 0);
let frames = 0;
function frame(): void {
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
Object.assign(window, { __place: setView, __report: report, __spots: spots });
