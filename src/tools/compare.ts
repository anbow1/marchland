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
import { createWorld, spawnRegiment } from '../sim/world.ts';

// A page for one decision, not part of the game: the same buildings in three
// makes — geometry from code, downloaded stylised models, downloaded realistic
// models — on the game's own ground, under its light, from its camera, with a
// regiment for scale. Models are read from /models/<folder>/ (not in the repo:
// they are other people's work under CC BY, kept out until one is chosen).
//
//   npx vite build --config vite.compare.config.ts
//   node ../tools/measure/serve.mjs dist-compare 4173     (with dist-compare/models linked to the downloads)

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
  styledSmithy: { url: 'medieval_times_-_blacksmiths_workshop/scene.gltf', x: -118, z: 108, fitM: 12, scale: 1, yawRad: 0 },
  realSmithy: { url: 'medieval_blacksmith/scene.gltf', x: -86, z: 108, fitM: 0, scale: 1, yawRad: 0 },
  realShop: { url: 'medieval_house_and_wine_shop/scene.gltf', x: -86, z: 140, fitM: 15, scale: 1, yawRad: 0 },
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
stage.scene.add(buildTerrain(surfaces));
addHorizon(stage.scene);
await lighting.bakeProbe(stage.camera);

// Buildings from code: the same geometry in the flat palette and with the scans the game uses today.
const codeMaterial = surfaceMaterial(surfaces, 'building');
for (const [kind, level, x, z, flat] of [['smithy', 1, -178, 108, true], ['house', 3, -178, 140, true], ['smithy', 1, -150, 108, false], ['house', 3, -150, 140, false]] as const) {
  const mesh = new Mesh(buildingGeometry(kind, level, TEAM_HEX[0], surfaces, flat), codeMaterial);
  mesh.position.set(x, heightAtM(x, z), z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  stage.scene.add(mesh);
}

const report: Record<string, { triangles: number; draws: number; sizeM: number[] }> = {};
const loader = new GLTFLoader();
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

// Men for scale: one regiment in front of each row.
const world = createWorld({ seed: 1, difficulty: 'normal', computerPlays: false });
for (const x of [-178, -150, -118, -86]) spawnRegiment(world, 0, 'swordsmen', x, 124, 0);
const army = new ArmyView(stage.scene);
army.update(world);

const camera = new RtsCamera(-125, 125, 0);
const offset = { x: 0, y: 0, z: 0 };
function place(x: number, z: number, distanceM: number, yawRad: number): void {
  camera.goal.targetX = x;
  camera.goal.targetZ = z;
  camera.goal.distanceM = distanceM;
  camera.goal.yawRad = yawRad;
  camera.snap();
}
place(-125, 124, 70, 0);
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
