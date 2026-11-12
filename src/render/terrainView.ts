import { cameraPosition, float, int, mix, normalWorld, positionWorld, smoothstep, texture, transformNormalToView, vec2, vec3 } from 'three/tsl';
import { type BufferAttribute, ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshStandardNodeMaterial, type Node, NoColorSpace, PlaneGeometry, RedFormat, RepeatWrapping, RGBAFormat, UnsignedByteType } from 'three/webgpu';
import { MAP, TOWN } from '../config.ts';
import { tileFbm } from '../core/noise.ts';
import { forestCoverAt, heightAtM, plotX, plotZ, townX, townZ } from '../sim/terrain.ts';
import type { Side } from '../sim/types.ts';
import { layerOf, type SurfaceId, type SurfaceLibrary } from './surfaces.ts';

// The ground: one mesh from the simulation's height function, reaching well
// past the playable square so the horizon is land, not a void. Four scanned
// surfaces (meadow, dry grass, trodden earth, forest floor) are laid by a
// cover map drawn from what the rules know: where the forest is, where the
// towns and the road are, which ground is high and dry. Each is sampled at its
// real size up close and at a much larger one from afar, and toned by a slow
// noise, so a hundred repeats across the screen do not read as a grid
// (GUIDE §2b: flat ground, tiling).

/** The mesh reaches this far beyond the playable square on every side. */
export const TERRAIN_MARGIN_M = 320;
const CELL_M = 4;
/** Edge of the cover map in texels: about 1.35 m each over the whole mesh. */
const COVER_PX = 768;
/** Far from the camera each surface is drawn this many times larger, and takes over between these distances. */
const FAR_SCALE = 6.3;
const FAR_FROM_M = 70;
const FAR_FULL_M = 230;
/**
 * The scans were taken on worn, late-season ground; high summer grass is greener. A tint per surface
 * (linear RGB multipliers, tuned by eye against the scans' own green patches), kept apart from the scans.
 */
const SEASON_TINT: Partial<Record<SurfaceId, readonly [number, number, number]>> = {
  meadow: [0.72, 1.0, 0.62],
  dry_grass: [0.9, 1.0, 0.72],
};

function distanceToSegmentM(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const abx = bx - ax;
  const abz = bz - az;
  const t = Math.min(1, Math.max(0, ((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(px - ax - abx * t, pz - az - abz * t);
}

/** 1 inside `radiusM` of a point, falling to 0 over `fadeM` beyond it. */
function near(distanceM: number, radiusM: number, fadeM: number): number {
  return 1 - Math.min(1, Math.max(0, (distanceM - radiusM) / fadeM));
}

/** 0…1: how much of the ground at a point is trodden earth: the road between the towns, the yards, the lanes to the keep. */
function earthAt(x: number, z: number): number {
  let earth = near(distanceToSegmentM(x, z, townX(0), townZ(0), townX(1), townZ(1)), 1.8, 2.2);
  for (const side of [0, 1] as const satisfies readonly Side[]) {
    const tx = townX(side);
    const tz = townZ(side);
    const d = Math.hypot(x - tx, z - tz);
    if (d > TOWN.outerRadiusM + 20) continue;
    // The yard round the keep.
    earth = Math.max(earth, near(d, 12, 3));
    for (let plot = 0; plot < TOWN.plotCount; plot++) {
      const px = plotX(side, plot);
      const pz = plotZ(side, plot);
      // Each plot's own yard, and a lane from it towards the keep (outer plots reach the inner ring).
      earth = Math.max(earth, near(Math.hypot(x - px, z - pz), 5.5, 2.5));
      const reach = plot < TOWN.innerPlots ? 1 : 0.45;
      earth = Math.max(earth, 0.85 * near(distanceToSegmentM(x, z, px, pz, px + (tx - px) * reach, pz + (tz - pz) * reach), 0.9, 1.6));
    }
    // A lane round the inner ring ties the plots together.
    earth = Math.max(earth, 0.8 * near(Math.abs(d - TOWN.innerRadiusM - 7), 1.0, 1.6));
  }
  return earth;
}

/** A tiling greyscale noise texture, built once in memory. */
function noiseTexture(sizePx: number): DataTexture {
  const data = new Uint8Array(sizePx * sizePx);
  for (let y = 0; y < sizePx; y++) {
    for (let x = 0; x < sizePx; x++) {
      const n = tileFbm((x / sizePx) * 8, (y / sizePx) * 8, 8, 4, 3);
      data[y * sizePx + x] = Math.min(255, Math.max(0, Math.round((n * 0.5 + 0.5) * 255)));
    }
  }
  const tex = new DataTexture(data, sizePx, sizePx, RedFormat, UnsignedByteType);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = NoColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** What covers the ground, per texel: R = dryness, G = trodden earth, B = forest floor. */
function coverTexture(extentM: number): DataTexture {
  const data = new Uint8Array(COVER_PX * COVER_PX * 4);
  for (let py = 0; py < COVER_PX; py++) {
    for (let px = 0; px < COVER_PX; px++) {
      const x = ((px + 0.5) / COVER_PX - 0.5) * extentM;
      const z = ((py + 0.5) / COVER_PX - 0.5) * extentM;
      // Hilltops dry out, hollows stay green.
      const dryness = Math.min(1, Math.max(0, 0.42 + heightAtM(x, z) / (MAP.hillHeightM * 1.3)));
      const o = (py * COVER_PX + px) * 4;
      data[o] = Math.round(dryness * 255);
      data[o + 1] = Math.round(earthAt(x, z) * 255);
      data[o + 2] = Math.round(forestCoverAt(x, z) * 255);
      data[o + 3] = 255;
    }
  }
  const tex = new DataTexture(data, COVER_PX, COVER_PX, RGBAFormat, UnsignedByteType);
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.colorSpace = NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function buildTerrain(lib: SurfaceLibrary): Mesh {
  const extentM = MAP.sizeM + 2 * TERRAIN_MARGIN_M;
  const cells = Math.round(extentM / CELL_M);
  const geometry = new PlaneGeometry(extentM, extentM, cells, cells).rotateX(-Math.PI / 2);
  const position = geometry.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < position.count; i++) position.setY(i, heightAtM(position.getX(i), position.getZ(i)));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const noise = noiseTexture(256);
  const cover = coverTexture(extentM);
  const material = new MeshStandardNodeMaterial({ name: 'terrain', metalness: 0 });
  const xz = vec2(positionWorld.x, positionWorld.z);
  const fine = texture(noise, xz.div(3.1)).r;
  const coarse = texture(noise, xz.div(27).add(vec2(0.37, 0.11))).r;
  const patch = texture(noise, xz.div(141).add(vec2(0.71, 0.53))).r;
  const what = texture(cover, xz.div(extentM).add(0.5));
  // Ragged edges: the noise decides where exactly one surface gives way to the next.
  const ragged = fine.mul(0.6).add(coarse.mul(0.4)).sub(0.5);
  const dry = smoothstep(0.42, 0.7, what.r.add(patch.sub(0.5).mul(0.7)).add(ragged.mul(0.25)));
  const forest = smoothstep(0.3, 0.6, what.b.add(ragged.mul(0.45)));
  const earth = smoothstep(0.44, 0.56, what.g.add(ragged.mul(0.55)));
  // v runs against z so the scans' normals keep their handedness on the ground (tangent +X, bitangent −Z).
  const ground = vec2(positionWorld.x, positionWorld.z.negate());
  const far = smoothstep(FAR_FROM_M, FAR_FULL_M, positionWorld.sub(cameraPosition).length()).mul(0.8);
  const uvOf = (id: SurfaceId, scale: number): Node<'vec2'> => ground.div(lib.sizeM[id] * scale);
  /** One of the three maps of a surface, blended over the four ground surfaces. */
  const blend = (sample: (id: SurfaceId) => Node<'vec3'>): Node<'vec3'> => mix(mix(mix(sample('meadow'), sample('dry_grass'), dry), sample('forest_floor'), forest), sample('dirt'), earth);
  const colour = blend((id) => {
    const near = texture(lib.colour, uvOf(id, 1)).depth(int(layerOf(id))).rgb;
    const wide = texture(lib.colour, uvOf(id, FAR_SCALE).add(vec2(0.31, 0.67))).depth(int(layerOf(id))).rgb;
    const season = SEASON_TINT[id];
    return mix(near, wide, far).mul(season ? vec3(season[0], season[1], season[2]) : vec3(1));
  });
  // A slow drift of tone, so one meadow is not one green.
  const tone = float(0.8).add(coarse.mul(0.28)).add(patch.mul(0.22));
  material.colorNode = colour.mul(tone);
  if (lib.detailed) {
    const bump = blend((id) => texture(lib.normal, uvOf(id, 1)).depth(int(layerOf(id))).rgb).mul(2).sub(1);
    // Fade the bumps out with distance: far away they only shimmer.
    const lean = vec3(bump.x, 0, bump.y.negate()).mul(float(1).sub(far));
    material.normalNode = transformNormalToView(normalWorld.add(lean).normalize());
    const orm = blend((id) => texture(lib.orm, uvOf(id, 1)).depth(int(layerOf(id))).rgb);
    material.roughnessNode = orm.y;
    material.aoNode = mix(orm.x, float(1), far);
  } else {
    material.roughness = 0.9;
  }
  const mesh = new Mesh(geometry, material);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  return mesh;
}
