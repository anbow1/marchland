import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BufferAttribute, type BufferGeometry, Color, type Material, type Mesh, type Object3D, Vector3 } from 'three/webgpu';
import { surfacePaint } from './buildingParts.ts';
import { SURFACES, type SurfaceId, type SurfaceLibrary } from './surfaces.ts';

// Models made in Blender for the game's own scans (tools/blender/, docs/BLENDER.md, materials way 1):
// they carry no textures, only materials named after the game's surfaces ('plaster', 'beam#d8cfc6'
// for a tinted one). Each face is given the layer and scale of its surface and its tint, the same
// per-vertex data MeshBuilder writes, so one material (surfaces.ts) draws them with everything else.
// A name that is not a surface is a plain colour: 'glass#20252a'; 'team' takes the owner's colour.
// Moving parts are meshes with their own names (a mill's 'sails'), turned about their own origin;
// empties named 'smoke_…' mark where smoke rises.

/** Names of the parts that move; anything else in a model is the building itself. */
export const MOVING_PARTS = ['sails'] as const;
export type MovingPart = (typeof MOVING_PARTS)[number];

const PLAIN_DEFAULT = 0x808080;

function paintOf(material: Material, lib: SurfaceLibrary, teamHex: number): { layer: number; repeatsPerM: number; tint: Color } {
  const [name = '', hex] = material.name.split('#');
  if (name === 'team') return { layer: -1, repeatsPerM: 1, tint: new Color(teamHex) };
  const tintHex = hex ? Number.parseInt(hex, 16) : undefined;
  if ((SURFACES as readonly string[]).includes(name)) {
    const paint = surfacePaint(lib, name as SurfaceId, tintHex ?? 0xffffff);
    return { layer: paint.layer, repeatsPerM: 1 / paint.sizeM, tint: new Color(paint.tintHex) };
  }
  return { layer: -1, repeatsPerM: 1, tint: new Color(tintHex ?? PLAIN_DEFAULT) };
}

function partOf(o: Object3D): MovingPart | null {
  for (let at: Object3D | null = o; at; at = at.parent) if ((MOVING_PARTS as readonly string[]).includes(at.name)) return at.name as MovingPart;
  return null;
}

/** A model ready to draw: the building, its moving parts (geometry about the pivot, and where the pivot is), and its smoke. */
export interface SurfaceModel {
  body: BufferGeometry;
  parts: { name: MovingPart; geometry: BufferGeometry; pivot: Vector3 }[];
  smoke: Vector3[];
}

export function surfaceModel(root: Object3D, lib: SurfaceLibrary, teamHex: number): SurfaceModel {
  root.updateMatrixWorld(true);
  const body = surfaceGeometry(root, lib, teamHex, null);
  const parts: SurfaceModel['parts'] = [];
  const smoke: Vector3[] = [];
  root.traverse((o) => {
    if (o.name.startsWith('smoke')) smoke.push(o.getWorldPosition(new Vector3()));
    if ((MOVING_PARTS as readonly string[]).includes(o.name)) {
      const name = o.name as MovingPart;
      const pivot = o.getWorldPosition(new Vector3());
      const geometry = surfaceGeometry(root, lib, teamHex, name);
      geometry.translate(-pivot.x, -pivot.y, -pivot.z);
      parts.push({ name, geometry, pivot });
    }
  });
  return { body, parts, smoke };
}

/**
 * One geometry for the model, in its own space (metres, door towards +Z), ready for surfaceMaterial:
 * the building itself (`part` null) or one of its moving parts.
 */
export function surfaceGeometry(root: Object3D, lib: SurfaceLibrary, teamHex = 0xffffff, part: MovingPart | null = null): BufferGeometry {
  root.updateMatrixWorld(true);
  const parts: BufferGeometry[] = [];
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || partOf(mesh) !== part) return;
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
      const paint = paintOf(material, lib, teamHex);
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
