import { float, mix, normalWorld, positionWorld, texture, time, transformNormalToView, vec2, vec3 } from 'three/tsl';
import { CircleGeometry, Color, DataTexture, InstancedMesh, LinearFilter, LinearMipmapLinearFilter, Matrix4, Mesh, MeshStandardNodeMaterial, NoColorSpace, type Object3D, Quaternion, RedFormat, RepeatWrapping, UnsignedByteType, Vector3 } from 'three/webgpu';
import { MAP, TOWN } from '../config.ts';
import { fbm2, tileFbm } from '../core/noise.ts';
import { Rng } from '../core/rng.ts';
import { DEPOSITS, forestCoverAt, heightAtM, isWater, lakeX, lakeZ, WATER_LEVEL_M } from '../sim/terrain.ts';
import type { Side } from '../sim/types.ts';
import { markStaticInstances } from './instancing.ts';
import { MeshBuilder, type Paint, type Vec3 } from './meshBuilder.ts';
import { layerOf, surfaceMaterial, type SurfaceLibrary } from './surfaces.ts';

// The parts of the land that are not the ground itself: the water of the two
// lakes, the boulders of the stone and ore outcrops, and loose rocks scattered
// over the hills so an open slope is not a bare sheet.

const ROCK = 0x8a8680;
/** Ore-bearing rock: rust in the grey. */
const ORE_TINT = new Color(1.0, 0.72, 0.55);
const STONE_TINT = new Color(1, 1, 1);

/** A boulder: an eight-sided lump, flattened underneath, each corner pulled about by `rng`. */
function boulder(b: MeshBuilder, rng: Rng, cx: number, cz: number, rx: number, ry: number, rz: number): void {
  const ring: Vec3[] = [];
  const upper: Vec3[] = [];
  const sides = 7;
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const wide = rng.range(0.8, 1.15);
    ring.push([cx + Math.sin(a) * rx * wide, -0.3, cz + Math.cos(a) * rz * wide]);
    const narrow = rng.range(0.45, 0.75);
    upper.push([cx + Math.sin(a + 0.3) * rx * narrow, ry * rng.range(0.6, 0.85), cz + Math.cos(a + 0.3) * rz * narrow]);
  }
  const top: Vec3 = [cx + rng.range(-0.2, 0.2) * rx, ry, cz + rng.range(-0.2, 0.2) * rz];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    b.quad(ring[i] as Vec3, ring[j] as Vec3, upper[j] as Vec3, upper[i] as Vec3, ROCK);
    b.tri(upper[i] as Vec3, upper[j] as Vec3, top, ROCK);
  }
}

function rockPaints(lib: SurfaceLibrary): Map<number, Paint> {
  // Drawn larger than scanned: a boulder is one piece of rock, not a wall of pebbles.
  return new Map<number, Paint>([[ROCK, { layer: layerOf('rock'), sizeM: lib.sizeM.rock * 2.2, tintHex: 0xffffff }]]);
}

/** A tiling noise for the water's ripples. */
function rippleTexture(): DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) data[y * size + x] = Math.round((tileFbm((x / size) * 6, (y / size) * 6, 6, 3, 9) * 0.5 + 0.5) * 255);
  const tex = new DataTexture(data, size, size, RedFormat, UnsignedByteType);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildWater(): Mesh[] {
  const ripples = rippleTexture();
  const material = new MeshStandardNodeMaterial({ name: 'water', metalness: 0, roughness: 0.12 });
  const xz = vec2(positionWorld.x, positionWorld.z);
  // Two layers of ripples drifting across each other.
  const a = texture(ripples, xz.div(9).add(vec2(time.mul(0.012), time.mul(0.007)))).r;
  const b = texture(ripples, xz.div(5.3).add(vec2(time.mul(-0.009), time.mul(0.011)))).r;
  const c = texture(ripples, xz.div(9).add(vec2(0.37, 0.19)).add(vec2(time.mul(0.012), time.mul(0.007)))).r;
  const lean = vec3(a.sub(b), 0, c.sub(b)).mul(0.22);
  material.normalNode = transformNormalToView(normalWorld.add(lean).normalize());
  // Dark peat water, a little lighter where the ripples catch.
  material.colorNode = mix(vec3(0.018, 0.04, 0.042), vec3(0.04, 0.075, 0.07), a.mul(b).mul(2));
  material.roughnessNode = float(0.08).add(a.mul(0.1));
  const meshes: Mesh[] = [];
  for (const side of [0, 1] as const satisfies readonly Side[]) {
    const mesh = new Mesh(new CircleGeometry(TOWN.lakeRadiusM, 48).rotateX(-Math.PI / 2), material);
    mesh.name = `lake ${side}`;
    mesh.position.set(lakeX(side), WATER_LEVEL_M, lakeZ(side));
    mesh.receiveShadow = true;
    meshes.push(mesh);
  }
  return meshes;
}

function buildRocks(lib: SurfaceLibrary): InstancedMesh {
  const rng = new Rng(MAP.terrainSeed + 303);
  // A few shapes, turned and scaled per instance.
  const builder = new MeshBuilder(0, rockPaints(lib));
  boulder(builder, rng, 0, 0, 1.1, 1.0, 0.9);
  boulder(builder, rng, 1.0, 0.5, 0.6, 0.5, 0.7);
  boulder(builder, rng, -0.7, -0.8, 0.5, 0.35, 0.45);
  const matrices: Matrix4[] = [];
  const tints: Color[] = [];
  const position = new Vector3();
  const scale = new Vector3();
  const turn = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const add = (x: number, z: number, size: number, tint: Color): void => {
    position.set(x, heightAtM(x, z), z);
    scale.set(size * rng.range(0.8, 1.25), size * rng.range(0.7, 1.3), size * rng.range(0.8, 1.25));
    turn.setFromAxisAngle(up, rng.range(0, Math.PI * 2));
    matrices.push(new Matrix4().compose(position, turn, scale));
    const shade = rng.range(0.8, 1.05);
    tints.push(tint.clone().multiplyScalar(shade));
  };
  // The outcrops: a crag of big stones with rubble round it.
  for (const d of DEPOSITS) {
    const tint = d.kind === 'ore' ? ORE_TINT : STONE_TINT;
    for (let i = 0; i < 22; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * TOWN.depositRadiusM;
      add(d.x + Math.sin(a) * r, d.z + Math.cos(a) * r, 2.6 - (r / TOWN.depositRadiusM) * 1.7, tint);
    }
  }
  // Loose rocks: more on high and steep ground, none in the woods, the water or the towns' own yards.
  const half = MAP.halfM + 120;
  for (let gz = -half; gz < half; gz += 14) {
    for (let gx = -half; gx < half; gx += 14) {
      const x = gx + rng.range(0, 14);
      const z = gz + rng.range(0, 14);
      const roll = rng.next();
      const size = rng.range(0.35, 1.3);
      const h = heightAtM(x, z);
      const slope = Math.hypot(heightAtM(x + 2, z) - heightAtM(x - 2, z), heightAtM(x, z + 2) - heightAtM(x, z - 2)) / 4;
      const chance = 0.1 + Math.max(0, h) * 0.035 + slope * 2.2;
      if (roll > chance || forestCoverAt(x, z) > 0.4 || isWater(x, z)) continue;
      add(x, z, size, STONE_TINT);
    }
  }
  const mesh = new InstancedMesh(builder.build(), surfaceMaterial(lib, 'rocks'), matrices.length);
  mesh.name = 'rocks';
  for (let i = 0; i < matrices.length; i++) {
    mesh.setMatrixAt(i, matrices[i] as Matrix4);
    mesh.setColorAt(i, tints[i] as Color);
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return markStaticInstances(mesh);
}

/** A lump of leaves: the same shape as a boulder, taller and softer. */
function buildBushes(lib: SurfaceLibrary): InstancedMesh {
  const rng = new Rng(MAP.terrainSeed + 404);
  const paints = new Map<number, Paint>([
    [ROCK, { layer: layerOf('leaves'), sizeM: lib.sizeM.leaves, tintHex: 0xb8d880 }],
  ]);
  const builder = new MeshBuilder(0, paints);
  boulder(builder, rng, 0, 0, 1.0, 1.5, 0.9);
  boulder(builder, rng, 0.9, 0.4, 0.7, 1.0, 0.7);
  boulder(builder, rng, -0.6, -0.7, 0.6, 0.8, 0.6);
  const matrices: Matrix4[] = [];
  const tints: Color[] = [];
  const position = new Vector3();
  const scale = new Vector3();
  const turn = new Quaternion();
  const up = new Vector3(0, 1, 0);
  // Thickets: bushes gather where a slow noise is high, and thin out to nothing between.
  const half = MAP.halfM + 100;
  for (let gz = -half; gz < half; gz += 5) {
    for (let gx = -half; gx < half; gx += 5) {
      const x = gx + rng.range(0, 5);
      const z = gz + rng.range(0, 5);
      const roll = rng.next();
      const size = rng.range(0.5, 1.25);
      const yaw = rng.range(0, Math.PI * 2);
      const shade = rng.next();
      const thicket = fbm2(x / 40 + 3.1, z / 40 + 7.7, 3, MAP.terrainSeed + 21) * 0.5 + 0.5;
      const cover = forestCoverAt(x, z);
      // In the open: only in thickets. At the forest's edge: a fringe of undergrowth.
      const chance = cover > 0.6 ? 0 : Math.max(0, (thicket - 0.56) * 2.2) + (cover > 0.12 ? 0.22 : 0);
      if (roll > chance || isWater(x, z) || heightAtM(x, z) < WATER_LEVEL_M + 0.3) continue;
      position.set(x, heightAtM(x, z), z);
      scale.set(size, size * rng.range(0.7, 1.2), size);
      turn.setFromAxisAngle(up, yaw);
      matrices.push(new Matrix4().compose(position, turn, scale));
      // Near white: the leaf scan and its tint give the green; this only varies it from bush to bush.
      const tone = 0.8 + shade * 0.35;
      tints.push(new Color(tone, tone * 1.04, tone * 0.92));
    }
  }
  const mesh = new InstancedMesh(builder.build(), surfaceMaterial(lib, 'bushes'), Math.max(1, matrices.length));
  mesh.name = 'bushes';
  mesh.count = matrices.length;
  for (let i = 0; i < matrices.length; i++) {
    mesh.setMatrixAt(i, matrices[i] as Matrix4);
    mesh.setColorAt(i, tints[i] as Color);
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return markStaticInstances(mesh);
}

export interface Land {
  /** Everything to add to the scene. */
  parts: Object3D[];
  /** The scattered things a building site clears, with how far each reaches from its foot. */
  scattered: { mesh: InstancedMesh; reachM: number }[];
}

/** Lakes, rocks and bushes. */
export function buildLand(lib: SurfaceLibrary): Land {
  const rocks = buildRocks(lib);
  const bushes = buildBushes(lib);
  return { parts: [...buildWater(), rocks, bushes], scattered: [{ mesh: rocks, reachM: 0.8 }, { mesh: bushes, reachM: 1.0 }] };
}
