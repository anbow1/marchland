import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BufferAttribute, type BufferGeometry, Color, type Material, type Mesh, type Object3D } from 'three/webgpu';
import { surfacePaint } from './buildingParts.ts';
import { SURFACES, type SurfaceId, type SurfaceLibrary } from './surfaces.ts';

// Models made in Blender for the game's own scans (tools/blender/, docs/BLENDER.md, materials way 1):
// they carry no textures, only materials named after the game's surfaces ('plaster', 'beam#d8cfc6'
// for a tinted one). Each face is given the layer and scale of its surface and its tint, the same
// per-vertex data MeshBuilder writes, so one material (surfaces.ts) draws them with everything else.
// A name that is not a surface is a plain colour: 'glass#20252a'.

const PLAIN_DEFAULT = 0x808080;

function paintOf(material: Material, lib: SurfaceLibrary): { layer: number; repeatsPerM: number; tint: Color } {
  const [name = '', hex] = material.name.split('#');
  const tintHex = hex ? Number.parseInt(hex, 16) : undefined;
  if ((SURFACES as readonly string[]).includes(name)) {
    const paint = surfacePaint(lib, name as SurfaceId, tintHex ?? 0xffffff);
    return { layer: paint.layer, repeatsPerM: 1 / paint.sizeM, tint: new Color(paint.tintHex) };
  }
  return { layer: -1, repeatsPerM: 1, tint: new Color(tintHex ?? PLAIN_DEFAULT) };
}

/** One geometry for the whole model, in its own space (metres, door towards +Z), ready for surfaceMaterial. */
export function surfaceGeometry(root: Object3D, lib: SurfaceLibrary): BufferGeometry {
  root.updateMatrixWorld(true);
  const parts: BufferGeometry[] = [];
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    let g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const count = g.getAttribute('position').count;
    const colour = new Float32Array(count * 3);
    const layer = new Float32Array(count * 2);
    // Each primitive of a glTF mesh is its own Mesh with one material; groups only if a loader merged them.
    const groups = g.groups.length > 0 ? g.groups : [{ start: 0, count, materialIndex: 0 }];
    for (const group of groups) {
      const material = materials[group.materialIndex ?? 0] ?? materials[0];
      if (!material) throw new Error(`mesh '${mesh.name}' has no material for its faces`);
      const paint = paintOf(material, lib);
      for (let i = group.start; i < group.start + group.count; i++) {
        colour[i * 3] = paint.tint.r;
        colour[i * 3 + 1] = paint.tint.g;
        colour[i * 3 + 2] = paint.tint.b;
        layer[i * 2] = paint.layer;
        layer[i * 2 + 1] = paint.repeatsPerM;
      }
    }
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.setAttribute('color', new BufferAttribute(colour, 3));
    g.setAttribute('aLayer', new BufferAttribute(layer, 2));
    g.clearGroups();
    parts.push(g);
  });
  if (parts.length === 0) throw new Error('the model has no meshes');
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('the model\'s meshes could not be merged (their attributes differ)');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
