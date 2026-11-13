import { type BufferGeometry, Color, InstancedMesh, type Material, Matrix4 } from 'three/webgpu';
import { markStaticInstances } from './instancing.ts';

// Things scattered over the whole land (trees, rocks, bushes) as one instanced mesh per square of the
// map instead of one for everything. A single mesh has a bounding sphere the size of the map and is
// drawn whole every frame, in the main pass and again in the shadow pass, wherever the camera looks;
// in squares the renderer skips those the view (or the sun's shadow box) does not reach. Measured on
// the town view: 2 650 trees, 226 k triangles drawn twice a frame, all of them off screen but a few.

/** Edge of one square in metres: small enough to cull up close, big enough that the whole map from above is a few dozen draws (at 90 m it was 663). */
export const CHUNK_M = 150;

export interface Scatter {
  matrices: Matrix4[];
  colours: Color[];
}

/** Sorts placed instances into squares and makes one static instanced mesh for each square that has any. */
export function chunkedInstances(geometry: BufferGeometry, material: Material, scatter: Scatter, name: string, shadows = true): InstancedMesh[] {
  const buckets = new Map<string, number[]>();
  scatter.matrices.forEach((m, i) => {
    const key = `${Math.floor(m.elements[12] / CHUNK_M)}:${Math.floor(m.elements[14] / CHUNK_M)}`;
    const list = buckets.get(key) ?? [];
    list.push(i);
    buckets.set(key, list);
  });
  const meshes: InstancedMesh[] = [];
  for (const [key, list] of buckets) {
    const mesh = new InstancedMesh(geometry, material, list.length);
    mesh.name = `${name} ${key}`;
    list.forEach((index, i) => {
      mesh.setMatrixAt(i, scatter.matrices[index] as Matrix4);
      mesh.setColorAt(i, scatter.colours[index] as Color);
    });
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    meshes.push(markStaticInstances(mesh));
  }
  return meshes;
}
