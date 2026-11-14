import { type BufferGeometry, Color, InstancedMesh, Matrix4, type MeshStandardNodeMaterial, Quaternion, Vector3 } from 'three/webgpu';
import { MAP } from '../config.ts';
import { Rng } from '../core/rng.ts';
import { forestCoverAt, heightAtM, isImpassable, townX, townZ } from '../sim/terrain.ts';
import { type CrownKind, crownGeometry, foliageMaterial } from './foliage.ts';
import { growthOf, type Stand, TREES } from '../sim/trees.ts';
import { LAYOUT } from '../sim/layout.ts';
import { CHUNK_M } from './chunks.ts';
import { markStaticInstances } from './instancing.ts';
import { MeshBuilder, type Paint } from './meshBuilder.ts';
import type { Quality } from './stage.ts';
import { layerOf, surfaceMaterial, type SurfaceLibrary } from './surfaces.ts';

// Trees, from the simulation's own list (sim/trees.ts), planted where its cover function says there is
// forest, so the woods the player sees are the woods that slow cavalry, stop arrows and are felled; a
// felled tree gives way to its stump and the sapling planted by it, which grows back.
// The rules know two species; the view draws three crowns (spruce on the higher ground, broad domes of
// oak and beech, slender birch and poplar) in leaf cards (foliage.ts), each tree its own green from a
// palette, a few already turning; and bushes along the forest edges and in its undergrowth, for the eye only.

const BARK = 0x4a3b30;

/** Trunks in scanned bark. */
function paintsFor(lib: SurfaceLibrary): Map<number, Paint> {
  return new Map<number, Paint>([[BARK, { layer: layerOf('bark'), sizeM: lib.sizeM.bark, tintHex: 0xffffff }]]);
}

const KINDS: readonly CrownKind[] = ['spruce', 'round', 'slender', 'bush'];

function trunkGeometry(kind: CrownKind, paints: Map<number, Paint>): MeshBuilder {
  const b = new MeshBuilder(0, paints);
  if (kind === 'spruce') b.cylinder(0, 0, 0, 0.28, 0.12, 9.5, 6, BARK);
  else if (kind === 'round') {
    b.cylinder(0, 0, 0, 0.38, 0.26, 4.6, 6, BARK);
    // Two limbs into the crown.
    b.strut([0, 3.6, 0], [1.2, 5.2, 0.4], 0.16, 0.16, BARK);
    b.strut([0, 3.9, 0], [-1.0, 5.4, -0.6], 0.15, 0.15, BARK);
  } else if (kind === 'slender') b.cylinder(0, 0, 0, 0.22, 0.12, 7.5, 6, BARK);
  return b;
}

/** Foliage colours by kind (sRGB): mostly summer greens, a few trees already turning. */
const PALETTE: Record<CrownKind, { greens: readonly number[]; turning: readonly number[]; turningShare: number }> = {
  spruce: { greens: [0x2c4426, 0x30492b, 0x283f27, 0x37512f, 0x3b5531], turning: [], turningShare: 0 },
  round: { greens: [0x48662a, 0x52722c, 0x5e7d31, 0x3f5c26, 0x6a8838, 0x577a33, 0x76923c, 0x44612e], turning: [0x8a6a30, 0x9c7c38, 0x7f4a2a, 0x96653a], turningShare: 0.05 },
  slender: { greens: [0x7a9a3c, 0x8aa946, 0x6f9236, 0x98b452], turning: [0xa8963e, 0x9c8a3a], turningShare: 0.08 },
  bush: { greens: [0x3e5a24, 0x48662a, 0x55722e, 0x5f7c34, 0x384f22], turning: [0x8a5a2a, 0x9a3e2a], turningShare: 0.06 },
};

/** A stable number in 0…1 from an index and a salt. */
function hash01(i: number, salt: number): number {
  let h = (i * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function foliageColour(kind: CrownKind, i: number, shade: number, out: Color): Color {
  const p = PALETTE[kind];
  const turning = p.turning.length > 0 && hash01(i, 11) < p.turningShare;
  const list = turning ? p.turning : p.greens;
  out.setHex(list[Math.floor(hash01(i, 5) * list.length)] as number);
  // The cards are painted light grey-green: lift the hue so the crown is not dull.
  return out.multiplyScalar(1.55 * shade);
}

/** The crown a tree of the rules is drawn with. */
function kindOf(i: number): CrownKind {
  if (TREES.species[i] === 0) return 'spruce';
  return hash01(i, 2) < 0.3 ? 'slender' : 'round';
}

/** The woods as drawn: one instanced mesh per crown kind, part (trunk or crown) and square of the map, the stumps and the bushes. */
export interface Forest {
  meshes: InstancedMesh[];
  /** Redraws the trees that are felled, planted or growing back; cheap when nothing has changed. */
  update(stand: Stand, nowS: number): void;
}

/** Most stumps shown at once (a woodcutter fells about two trees a minute). */
const MAX_STUMPS = 1500;
/** Bushes are tried on a grid this many metres apart. */
const BUSH_PITCH_M = 6;

export function buildForest(quality: Quality, lib: SurfaceLibrary): Forest {
  const barkMaterial = surfaceMaterial(lib, 'tree');
  const leaves = foliageMaterial(false);
  const needles = foliageMaterial(true);
  const paints = paintsFor(lib);
  const detail = quality === 'high' ? 1 : 0.6;
  // Low: every other tree outside the playable square, where nobody fights.
  // The road through the forest has three times the trees: half as many outside the square there.
  const decorKeep = (quality === 'high' ? 1 : 0.5) * (LAYOUT === 'forest' ? 0.5 : 1);
  const trunks = new Map<CrownKind, BufferGeometry>();
  const crowns = new Map<CrownKind, BufferGeometry>();
  KINDS.forEach((kind, k) => {
    if (kind !== 'bush') trunks.set(kind, trunkGeometry(kind, paints).build());
    crowns.set(kind, crownGeometry(kind, detail, 17 + k));
  });
  // Each tree's pair of meshes (by kind and square of the map) and its slot in them, so a felled one can be hidden.
  const meshOf = new Int32Array(TREES.count).fill(-1);
  const slotOf = new Int32Array(TREES.count);
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < TREES.count; i++) {
    if (!TREES.inside[i] && (TREES.decor[i] as number) >= decorKeep) continue;
    const key = `${kindOf(i)}:${Math.floor((TREES.x[i] as number) / CHUNK_M)}:${Math.floor((TREES.z[i] as number) / CHUNK_M)}`;
    const list = buckets.get(key) ?? [];
    list.push(i);
    buckets.set(key, list);
  }
  const meshes: InstancedMesh[] = [];
  const pairs: InstancedMesh[][] = [];
  const m = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const turn = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const colour = new Color();
  // Deep in the wood the crowns spread to close the canopy; at its edge and in the open they keep their size.
  const spread = new Float32Array(TREES.count);
  for (let i = 0; i < TREES.count; i++) {
    const cover = forestCoverAt(TREES.x[i] as number, TREES.z[i] as number);
    spread[i] = 1 + 0.4 * Math.min(1, Math.max(0, (cover - 0.5) / 0.35));
  }
  /** A tree's matrix; `crown` widens the crown (not the trunk) by its spread. */
  const place = (i: number, grown: number, crown = false): Matrix4 => {
    const size = (TREES.size[i] as number) * grown;
    const wide = crown ? (spread[i] as number) : 1;
    position.set(TREES.x[i] as number, TREES.y[i] as number, TREES.z[i] as number);
    scale.set(size * wide, size * (TREES.tall[i] as number), size * wide);
    turn.setFromAxisAngle(up, TREES.yaw[i] as number);
    return m.compose(position, turn, scale);
  };
  for (const [key, list] of buckets) {
    const kind = key.split(':')[0] as CrownKind;
    const trunk = new InstancedMesh(trunks.get(kind) as BufferGeometry, barkMaterial, list.length);
    const crown = new InstancedMesh(crowns.get(kind) as BufferGeometry, kind === 'spruce' ? needles : leaves, list.length);
    trunk.name = `trunks ${key}`;
    crown.name = `crowns ${key}`;
    list.forEach((i, slot) => {
      trunk.setMatrixAt(slot, place(i, 1));
      crown.setMatrixAt(slot, place(i, 1, true));
      trunk.setColorAt(slot, colour.setRGB(1, 1, 1));
      crown.setColorAt(slot, foliageColour(kind, i, TREES.r[i] as number, colour));
      meshOf[i] = pairs.length;
      slotOf[i] = slot;
    });
    for (const mesh of [trunk, crown]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      meshes.push(markStaticInstances(mesh));
    }
    pairs.push([trunk, crown]);
  }
  meshes.push(...buildBushes(quality, crowns.get('bush') as BufferGeometry, leaves));
  // Stumps: a short sawn trunk where a tree was felled, beside the sapling planted for it.
  const stumpBuilder = new MeshBuilder(0, paints);
  stumpBuilder.cylinder(0, 0, 0, 0.32, 0.28, 0.55, 7, BARK);
  const stumps = new InstancedMesh(stumpBuilder.build(), barkMaterial, MAX_STUMPS);
  stumps.name = 'stumps';
  stumps.count = 0;
  stumps.frustumCulled = false;
  stumps.castShadow = true;
  stumps.receiveShadow = true;
  stumps.setColorAt(0, colour.setRGB(1, 1, 1));
  meshes.push(stumps);

  let drawnVersion = -1;
  let drawnStand: Stand | null = null;
  let lastS = -1e9;
  /** Trees drawn other than whole last time: to be put back when they stand again. */
  const shown = new Set<number>();
  return {
    meshes,
    update(stand: Stand, nowS: number): void {
      // Saplings grow slowly: redrawing them twice a second is plenty.
      // A loaded game brings another stand: drawn afresh (trees it does not list as changed are put back whole below).
      if (stand !== drawnStand) {
        drawnStand = stand;
        drawnVersion = -1;
      }
      if (stand.version === drawnVersion && (stand.changed.size === 0 || nowS - lastS < 0.5)) return;
      drawnVersion = stand.version;
      lastS = nowS;
      const touched = new Set<number>();
      for (const i of shown) {
        if (stand.changed.has(i) || meshOf[i] < 0) continue;
        // Grown back: whole again.
        (pairs[meshOf[i] as number] as InstancedMesh[]).forEach((mesh, part) => mesh.setMatrixAt(slotOf[i] as number, place(i, 1, part === 1)));
        touched.add(meshOf[i] as number);
        shown.delete(i);
      }
      let n = 0;
      for (const i of stand.changed) {
        const grown = growthOf(stand, i, nowS);
        if (meshOf[i] >= 0) {
          (pairs[meshOf[i] as number] as InstancedMesh[]).forEach((mesh, part) => mesh.setMatrixAt(slotOf[i] as number, place(i, grown, part === 1)));
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
        for (const mesh of pairs[k] as InstancedMesh[]) {
          mesh.instanceMatrix.needsUpdate = true;
          mesh.computeBoundingSphere();
        }
      }
      stumps.count = n;
      stumps.instanceMatrix.needsUpdate = true;
    },
  };
}

/**
 * Bushes: thick along the forest's edges, a few in its undergrowth and a rare one out in the meadows; none
 * in water, on rock or by the keeps. Built on buildings and roads they are cleared like the trees (clearings.ts).
 */
function buildBushes(quality: Quality, geometry: BufferGeometry, material: MeshStandardNodeMaterial): InstancedMesh[] {
  const rng = new Rng(MAP.terrainSeed + 211);
  const half = MAP.halfM + 120;
  const keep = quality === 'high' ? 1 : 0.5;
  const byChunk = new Map<string, number[]>();
  let n = 0;
  for (let gz = -half; gz < half; gz += BUSH_PITCH_M) {
    for (let gx = -half; gx < half; gx += BUSH_PITCH_M) {
      const x = gx + rng.range(0, BUSH_PITCH_M);
      const z = gz + rng.range(0, BUSH_PITCH_M);
      const roll = rng.next();
      const size = rng.range(0.7, 1.3);
      const yaw = rng.range(0, Math.PI * 2);
      const shade = rng.range(0.85, 1.1);
      const cover = forestCoverAt(x, z);
      const chance = (cover > 0.12 && cover < 0.6 ? 0.55 : cover >= 0.6 ? 0.1 : 0.012) * keep;
      if (roll >= chance || isImpassable(x, z)) continue;
      if (Math.hypot(x - townX(0), z - townZ(0)) < 70 || Math.hypot(x - townX(1), z - townZ(1)) < 70) continue;
      const key = `${Math.floor(x / CHUNK_M)}:${Math.floor(z / CHUNK_M)}`;
      const list = byChunk.get(key) ?? [];
      list.push(x, z, size, yaw, shade, n++);
      byChunk.set(key, list);
    }
  }
  const out: InstancedMesh[] = [];
  const m = new Matrix4();
  const p = new Vector3();
  const s = new Vector3();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const colour = new Color();
  for (const [key, list] of byChunk) {
    const count = list.length / 6;
    const mesh = new InstancedMesh(geometry, material, count);
    mesh.name = `bushes ${key}`;
    for (let k = 0; k < count; k++) {
      const x = list[k * 6] as number;
      const z = list[k * 6 + 1] as number;
      const size = list[k * 6 + 2] as number;
      p.set(x, heightAtM(x, z) - 0.1, z);
      s.set(size * 1.1, size, size * 1.1);
      q.setFromAxisAngle(up, list[k * 6 + 3] as number);
      mesh.setMatrixAt(k, m.compose(p, q, s));
      mesh.setColorAt(k, foliageColour('bush', list[k * 6 + 5] as number, list[k * 6 + 4] as number, colour));
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    out.push(markStaticInstances(mesh));
  }
  return out;
}
