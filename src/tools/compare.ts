import { GroundWorks } from '../render/groundWorks.ts';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Box3, type BufferGeometry, Color, Group, type Material, Mesh, type MeshStandardMaterial, type Object3D, Vector3 } from 'three/webgpu';
import { RtsCamera } from '../app/rtsCamera.ts';
import { ArmyView } from '../render/armyView.ts';
import { buildingGeometry } from '../render/buildingGeometry.ts';
import { addHorizon } from '../render/horizonView.ts';
import { AFTERNOON, Lighting } from '../render/lighting.ts';
import { TEAM_HEX } from '../render/palette.ts';
import { Stage } from '../render/stage.ts';
import { loadSurfaces, surfaceMaterial } from '../render/surfaces.ts';
import { buildTerrain } from '../render/terrainView.ts';
import { heightAtM } from '../sim/terrain.ts';
import { cmdBuildRoad } from '../sim/commands.ts';
import { stampBuilding } from '../sim/nav.ts';
import { createWorld, spawnRegiment } from '../sim/world.ts';
import { Clearings } from '../render/clearings.ts';
import { buildForest } from '../render/forestView.ts';
import { buildLand } from '../render/landView.ts';
import { surfaceGeometry } from '../render/surfaceModel.ts';

// A page for one decision, not part of the game: the same buildings in three
// makes — geometry from code, downloaded stylised models, downloaded realistic
// models — on the game's own ground, under its light, from its camera, with a
// regiment for scale. Models are read from /models/<folder>/ (not in the repo:
// they are other people's work under CC BY, kept out until one is chosen).
//
//   npx vite build --config vite.compare.config.ts
//   node ../tools/measure/serve.mjs dist-compare 4173     (with dist-compare/models linked to the downloads)

// Where the exhibits stand: two rows on the level ground round the player's keep, clear of the stone
// outcrop behind it, with a road between the rows.
const COLUMNS = [-162, -134, -104, -72] as const;
const ROW_SMITHY = 100;
const ROW_HOUSE = 132;
const ROAD_Z = 116;

interface Exhibit {
  /** Folder under /models and the glTF file in it; empty for a building from code. */
  url: string;
  x: number;
  z: number;
  /** Longest side of its footprint in metres, or 0 to keep the file's own size times `scale`. */
  fitM: number;
  scale: number;
  yawRad: number;
}

// Two rows: smithies (z = 108) and houses (z = 140). Four columns: from code in the flat palette,
// from code with scans, a downloaded stylised model, downloaded realistic models. Two more downloads
// (a tavern and a forge) are left out: their colours are stored in the retired specular-glossiness
// extension in a form the loader shows wrongly (green and near-black).
const EXHIBITS: Record<string, Exhibit> = {
  styledSmithy: { url: 'medieval_times_-_blacksmiths_workshop/scene.gltf', x: COLUMNS[2], z: ROW_SMITHY, fitM: 12, scale: 1, yawRad: 0 },
  realSmithy: { url: 'medieval_blacksmith/scene.gltf', x: COLUMNS[3], z: ROW_SMITHY, fitM: 0, scale: 1, yawRad: 0 },
  realShop: { url: 'medieval_house_and_wine_shop/scene.gltf', x: COLUMNS[3], z: ROW_HOUSE, fitM: 15, scale: 1, yawRad: 0 },
};

/** Models written for the retired specular-glossiness extension carry their colour there: move it to where the loader looks. */
function adoptSpecularGlossiness(material: Material): void {
  const std = material as MeshStandardMaterial;
  const ext = (material.userData['gltfExtensions'] as Record<string, { diffuseFactor?: number[]; glossinessFactor?: number }> | undefined)?.['KHR_materials_pbrSpecularGlossiness'];
  if (!ext) return;
  if (ext.diffuseFactor) std.color = new Color().setRGB(ext.diffuseFactor[0] ?? 1, ext.diffuseFactor[1] ?? 1, ext.diffuseFactor[2] ?? 1);
  std.roughness = 1 - (ext.glossinessFactor ?? 0.2);
  std.metalness = 0;
}

/** One mesh per material, in world space: a model of nine thousand parts becomes a few dozen draw calls. */
function mergeByMaterial(root: Object3D): { group: Group; triangles: number; draws: number } {
  root.updateMatrixWorld(true);
  const byMaterial = new Map<Material, BufferGeometry[]>();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const material = Array.isArray(mesh.material) ? (mesh.material[0] as Material) : mesh.material;
    let g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.getAttribute('uv')) return;
    const list = byMaterial.get(material) ?? [];
    list.push(g);
    byMaterial.set(material, list);
  });
  const group = new Group();
  let triangles = 0;
  for (const [material, list] of byMaterial) {
    adoptSpecularGlossiness(material);
    const merged = mergeGeometries(list);
    triangles += merged.getAttribute('position').count / 3;
    const mesh = new Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { group, triangles, draws: byMaterial.size };
}

const canvas = document.getElementById('view') as HTMLCanvasElement;
const stage = new Stage(canvas, { quality: 'high', maxPixelRatio: 1 });
await stage.init();
const lighting = new Lighting(stage.renderer, stage.scene, AFTERNOON, 'high');
const surfaces = await loadSurfaces('high', () => {});
// The game's own ground as it looks once people have built: a road between the rows, worn yards under the
// buildings, and the land's rocks, bushes and trees, cleared where a building stands.
const world = createWorld({ seed: 1, difficulty: 'normal', computerPlays: false });
world.towns[0].stock.stone = 1000;
cmdBuildRoad(world, 0, COLUMNS[0] - 20, ROAD_Z, COLUMNS[3] + 20, ROAD_Z);
for (const x of COLUMNS) for (const z of [ROW_SMITHY, ROW_HOUSE]) stampBuilding(world.nav, x, z, 9, true);
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

// Buildings from code: the same geometry in the flat palette and with the scans the game uses today.
const codeMaterial = surfaceMaterial(surfaces, 'building');
for (const [kind, level, x, z, flat] of [['smithy', 1, COLUMNS[0], ROW_SMITHY, true], ['house', 3, COLUMNS[0], ROW_HOUSE, true], ['smithy', 1, COLUMNS[1], ROW_SMITHY, false], ['house', 3, COLUMNS[1], ROW_HOUSE, false]] as const) {
  const mesh = new Mesh(buildingGeometry(kind, level, TEAM_HEX[0], surfaces, flat), codeMaterial);
  mesh.position.set(x, heightAtM(x, z), z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  stage.scene.add(mesh);
}

const report: Record<string, { triangles: number; draws: number; sizeM: number[] }> = {};
const loader = new GLTFLoader();
// E: our own building, made in Blender from code (tools/blender/build.py) and drawn with the game's scans.
{
  const gltf = await loader.loadAsync('./buildings/house_1.glb');
  const geometry = surfaceGeometry(gltf.scene, surfaces);
  const mesh = new Mesh(geometry, codeMaterial);
  mesh.position.set(COLUMNS[2], heightAtM(COLUMNS[2], ROW_HOUSE), ROW_HOUSE);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  stage.scene.add(mesh);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  report['ownHouse'] = { triangles: geometry.getAttribute('position').count / 3, draws: 1, sizeM: box ? [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z].map((v) => Math.round(v * 10) / 10) : [] };
}
const size = new Vector3();
for (const [name, e] of Object.entries(EXHIBITS)) {
  const gltf = await loader.loadAsync(`./models/${e.url}`);
  const { group, triangles, draws } = mergeByMaterial(gltf.scene);
  const box = new Box3().setFromObject(group);
  box.getSize(size);
  const scale = e.fitM > 0 ? e.fitM / Math.max(size.x, size.z) : e.scale;
  group.scale.setScalar(scale);
  // Stand it on the ground at its place, centred.
  group.position.set(e.x - ((box.min.x + box.max.x) / 2) * scale, heightAtM(e.x, e.z) - box.min.y * scale, e.z - ((box.min.z + box.max.z) / 2) * scale);
  group.rotation.y = e.yawRad;
  stage.scene.add(group);
  report[name] = { triangles, draws, sizeM: [size.x * scale, size.y * scale, size.z * scale].map((v) => Math.round(v * 10) / 10) };
}

// Men for scale: a regiment on the road before each column.
for (const x of COLUMNS) spawnRegiment(world, 0, 'swordsmen', x, ROAD_Z, 0);
const army = new ArmyView(stage.scene);
army.update(world);

const camera = new RtsCamera(-117, ROAD_Z, 0);
const offset = { x: 0, y: 0, z: 0 };
function place(x: number, z: number, distanceM: number, yawRad: number): void {
  camera.goal.targetX = x;
  camera.goal.targetZ = z;
  camera.goal.distanceM = distanceM;
  camera.goal.yawRad = yawRad;
  camera.snap();
}
place(-117, ROAD_Z, 70, 0);
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
Object.assign(window, { __place: place, __report: report });
