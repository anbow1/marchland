import { type BufferGeometry, Color, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { growthOf, type Stand, TREES } from '../sim/trees.ts';
import { CHUNK_M } from './chunks.ts';
import { markStaticInstances } from './instancing.ts';
import { MeshBuilder, type Paint } from './meshBuilder.ts';
import type { Quality } from './stage.ts';
import { layerOf, surfaceMaterial, type SurfaceLibrary } from './surfaces.ts';

// Trees, from the simulation's own list (sim/trees.ts), planted where its cover function says there is
// forest, so the woods the player sees are the woods that slow cavalry, stop arrows and are felled; a
// felled tree gives way to its stump and the sapling planted by it, which grows back.
// Two species from code, one instanced mesh each; a few are scattered in the
// open as lone trees. Scanned or modelled trees replace these in stage 5.

const BARK = 0x4a3b30;
const PINE = 0x33422a;
const PINE_LIGHT = 0x3f5030;
const LEAF = 0x47602c;
const LEAF_LIGHT = 0x5a7434;

/** Trunks in scanned bark; crowns in a mottled green scan, tinted per species. */
function paintsFor(lib: SurfaceLibrary): Map<number, Paint> {
  const bark = { layer: layerOf('bark'), sizeM: lib.sizeM.bark, tintHex: 0xffffff };
  // The scan is of mossy ground from the air; at a few metres a repeat it reads as clumps of leaves.
  const crown = (tintHex: number): Paint => ({ layer: layerOf('leaves'), sizeM: 5, tintHex });
  return new Map<number, Paint>([
    [BARK, bark],
    [PINE, crown(0x6f8f5a)],
    [PINE_LIGHT, crown(0x86a868)],
    [LEAF, crown(0xb0cf78)],
    [LEAF_LIGHT, crown(0xcfe88c)],
  ]);
}

function pineGeometry(paints: Map<number, Paint>): MeshBuilder {
  const b = new MeshBuilder(0, paints);
  b.cylinder(0, 0, 0, 0.28, 0.16, 4.5, 6, BARK);
  b.cylinder(0, 2.6, 0, 2.5, 0, 4.2, 7, PINE);
  b.cylinder(0, 5.0, 0, 1.9, 0, 3.6, 7, PINE_LIGHT);
  b.cylinder(0, 7.2, 0, 1.2, 0, 3.2, 7, PINE);
  return b;
}

function broadleafGeometry(paints: Map<number, Paint>): MeshBuilder {
  const b = new MeshBuilder(0, paints);
  b.cylinder(0, 0, 0, 0.36, 0.22, 4.2, 6, BARK);
  // A crown of stacked, tapering drums reads as a round canopy from above.
  b.cylinder(0, 3.4, 0, 2.2, 3.3, 1.6, 8, LEAF);
  b.cylinder(0, 5.0, 0, 3.3, 2.7, 1.8, 8, LEAF_LIGHT);
  b.cylinder(0, 6.8, 0, 2.7, 1.1, 1.6, 8, LEAF);
  b.cylinder(0.9, 4.6, 0.7, 1.4, 0.6, 1.7, 6, LEAF_LIGHT);
  return b;
}

/** The woods as drawn: one instanced mesh per species and square of the map, and the stumps. */
export interface Forest {
  meshes: InstancedMesh[];
  /** Redraws the trees that are felled, planted or growing back; cheap when nothing has changed. */
  update(stand: Stand, nowS: number): void;
}

/** Most stumps shown at once (a woodcutter fells about two trees a minute). */
const MAX_STUMPS = 1500;

export function buildForest(quality: Quality, lib: SurfaceLibrary): Forest {
  // Scanned bark and leaves, times a tint per tree (the instance colour).
  const material = surfaceMaterial(lib, 'tree');
  const paints = paintsFor(lib);
  // Low: every other tree outside the playable square, where nobody fights.
  const decorKeep = quality === 'high' ? 1 : 0.5;
  const builders = [pineGeometry(paints), broadleafGeometry(paints)];
  const geometries = builders.map((b) => b.build());
  // Each tree's mesh (by species and square of the map) and its slot in it, so a felled one can be hidden.
  const meshOf = new Int32Array(TREES.count).fill(-1);
  const slotOf = new Int32Array(TREES.count);
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < TREES.count; i++) {
    if (!TREES.inside[i] && (TREES.decor[i] as number) >= decorKeep) continue;
    const key = `${TREES.species[i]}:${Math.floor((TREES.x[i] as number) / CHUNK_M)}:${Math.floor((TREES.z[i] as number) / CHUNK_M)}`;
    const list = buckets.get(key) ?? [];
    list.push(i);
    buckets.set(key, list);
  }
  const meshes: InstancedMesh[] = [];
  const m = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const turn = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const colour = new Color();
  const place = (i: number, grown: number): Matrix4 => {
    const size = (TREES.size[i] as number) * grown;
    position.set(TREES.x[i] as number, TREES.y[i] as number, TREES.z[i] as number);
    scale.set(size, size * (TREES.tall[i] as number), size);
    turn.setFromAxisAngle(up, TREES.yaw[i] as number);
    return m.compose(position, turn, scale);
  };
  for (const [key, list] of buckets) {
    const species = Number(key.split(':')[0]);
    const mesh = new InstancedMesh(geometries[species] as BufferGeometry, material, list.length);
    mesh.name = `${species === 0 ? 'pines' : 'broadleaves'} ${key}`;
    list.forEach((i, slot) => {
      mesh.setMatrixAt(slot, place(i, 1));
      mesh.setColorAt(slot, colour.setRGB(TREES.r[i] as number, TREES.g[i] as number, TREES.b[i] as number));
      meshOf[i] = meshes.length;
      slotOf[i] = slot;
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    meshes.push(markStaticInstances(mesh));
  }
  // Stumps: a short sawn trunk where a tree was felled, beside the sapling planted for it.
  const stumpBuilder = new MeshBuilder(0, paints);
  stumpBuilder.cylinder(0, 0, 0, 0.32, 0.28, 0.55, 7, BARK);
  const stumps = new InstancedMesh(stumpBuilder.build(), material, MAX_STUMPS);
  stumps.name = 'stumps';
  stumps.count = 0;
  stumps.frustumCulled = false;
  stumps.castShadow = true;
  stumps.receiveShadow = true;
  stumps.setColorAt(0, colour.setRGB(1, 1, 1));
  meshes.push(stumps);

  let drawnVersion = -1;
  let lastS = -1e9;
  /** Trees drawn other than whole last time: to be put back when they stand again. */
  const shown = new Set<number>();
  return {
    meshes,
    update(stand: Stand, nowS: number): void {
      // Saplings grow slowly: redrawing them twice a second is plenty.
      if (stand.version === drawnVersion && (stand.changed.size === 0 || nowS - lastS < 0.5)) return;
      drawnVersion = stand.version;
      lastS = nowS;
      const touched = new Set<number>();
      for (const i of shown) {
        if (stand.changed.has(i) || meshOf[i] < 0) continue;
        // Grown back: whole again.
        const mesh = meshes[meshOf[i] as number] as InstancedMesh;
        mesh.setMatrixAt(slotOf[i] as number, place(i, 1));
        touched.add(meshOf[i] as number);
        shown.delete(i);
      }
      let n = 0;
      for (const i of stand.changed) {
        const grown = growthOf(stand, i, nowS);
        if (meshOf[i] >= 0) {
          const mesh = meshes[meshOf[i] as number] as InstancedMesh;
          mesh.setMatrixAt(slotOf[i] as number, place(i, grown));
          touched.add(meshOf[i] as number);
          shown.add(i);
        }
        if (n < MAX_STUMPS) {
          // The stump stands a little off the sapling, on the side the tree fell from.
          position.set((TREES.x[i] as number) + 0.7, (TREES.y[i] as number) + 0.1, (TREES.z[i] as number) + 0.4);
          scale.set(TREES.size[i] as number, 1, TREES.size[i] as number);
          turn.setFromAxisAngle(up, TREES.yaw[i] as number);
          stumps.setMatrixAt(n++, m.compose(position, turn, scale));
        }
      }
      for (const k of touched) {
        const mesh = meshes[k] as InstancedMesh;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
      stumps.count = n;
      stumps.instanceMatrix.needsUpdate = true;
    },
  };
}
