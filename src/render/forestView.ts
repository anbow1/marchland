import { Color, InstancedMesh, Matrix4, MeshStandardNodeMaterial, Quaternion, Vector3 } from 'three/webgpu';
import { MAP } from '../config.ts';
import { Rng } from '../core/rng.ts';
import { forestCoverAt, heightAtM } from '../sim/terrain.ts';
import { markStaticInstances } from './instancing.ts';
import { MeshBuilder } from './meshBuilder.ts';
import type { Quality } from './stage.ts';

// Trees, placed where the simulation's cover function says there is forest, so
// the woods the player sees are the woods that slow cavalry and stop arrows.
// Two species from code, one instanced mesh each; a few are scattered in the
// open as lone trees. Scanned or modelled trees replace these in stage 5.

/** Trees are planted on a jittered grid of this pitch, out to this far beyond the playable square. */
const PITCH_M = 6.5;
const DECOR_MARGIN_M = 170;

const BARK = 0x4a3b30;
const PINE = 0x33422a;
const PINE_LIGHT = 0x3f5030;
const LEAF = 0x47602c;
const LEAF_LIGHT = 0x5a7434;

function pineGeometry(): MeshBuilder {
  const b = new MeshBuilder();
  b.cylinder(0, 0, 0, 0.28, 0.16, 4.5, 6, BARK);
  b.cylinder(0, 2.6, 0, 2.5, 0, 4.2, 7, PINE);
  b.cylinder(0, 5.0, 0, 1.9, 0, 3.6, 7, PINE_LIGHT);
  b.cylinder(0, 7.2, 0, 1.2, 0, 3.2, 7, PINE);
  return b;
}

function broadleafGeometry(): MeshBuilder {
  const b = new MeshBuilder();
  b.cylinder(0, 0, 0, 0.36, 0.22, 4.2, 6, BARK);
  // A crown of stacked, tapering drums reads as a round canopy from above.
  b.cylinder(0, 3.4, 0, 2.2, 3.3, 1.6, 8, LEAF);
  b.cylinder(0, 5.0, 0, 3.3, 2.7, 1.8, 8, LEAF_LIGHT);
  b.cylinder(0, 6.8, 0, 2.7, 1.1, 1.6, 8, LEAF);
  b.cylinder(0.9, 4.6, 0.7, 1.4, 0.6, 1.7, 6, LEAF_LIGHT);
  return b;
}

export function buildForest(quality: Quality): InstancedMesh[] {
  // Vertex colours for bark and leaves, times a tint per tree (the instance colour).
  const material = new MeshStandardNodeMaterial({ name: 'tree', roughness: 0.88, metalness: 0, vertexColors: true });
  const rng = new Rng(MAP.terrainSeed + 101);
  const matrices: Matrix4[][] = [[], []];
  const tints: Color[][] = [[], []];
  const half = MAP.halfM + DECOR_MARGIN_M;
  const position = new Vector3();
  const scale = new Vector3();
  const turn = new Quaternion();
  const up = new Vector3(0, 1, 0);
  // Low: every other tree outside the playable square, where nobody fights.
  const decorKeep = quality === 'high' ? 1 : 0.5;
  for (let gz = -half; gz < half; gz += PITCH_M) {
    for (let gx = -half; gx < half; gx += PITCH_M) {
      const x = gx + rng.range(0.1, 0.9) * PITCH_M;
      const z = gz + rng.range(0.1, 0.9) * PITCH_M;
      const roll = rng.next();
      const pick = rng.next();
      const size = rng.range(0.8, 1.35);
      const yaw = rng.range(0, Math.PI * 2);
      const shade = rng.range(0.82, 1.12);
      const cover = forestCoverAt(x, z);
      const inside = Math.abs(x) < MAP.halfM && Math.abs(z) < MAP.halfM;
      // Dense where the rules say forest; a rare lone tree elsewhere away from the towns.
      const chance = cover > 0.5 ? 0.9 : cover > 0.05 ? cover * 0.5 : 0;
      if (roll >= chance) continue;
      if (!inside && rng.next() >= decorKeep) continue;
      // Pines gather on the higher ground.
      const species = pick < 0.35 + heightAtM(x, z) * 0.06 ? 0 : 1;
      position.set(x, heightAtM(x, z) - 0.15, z);
      scale.set(size, size * rng.range(0.9, 1.2), size);
      turn.setFromAxisAngle(up, yaw);
      (matrices[species] as Matrix4[]).push(new Matrix4().compose(position, turn, scale));
      (tints[species] as Color[]).push(new Color(shade, shade * rng.range(0.94, 1.06), shade * 0.95));
    }
  }
  const meshes: InstancedMesh[] = [];
  const builders = [pineGeometry(), broadleafGeometry()];
  for (let species = 0; species < 2; species++) {
    const list = matrices[species] as Matrix4[];
    const mesh = new InstancedMesh((builders[species] as MeshBuilder).build(), material, Math.max(1, list.length));
    mesh.name = species === 0 ? 'pines' : 'broadleaves';
    mesh.count = list.length;
    for (let i = 0; i < list.length; i++) {
      mesh.setMatrixAt(i, list[i] as Matrix4);
      mesh.setColorAt(i, (tints[species] as Color[])[i] as Color);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    meshes.push(markStaticInstances(mesh));
  }
  return meshes;
}
