import { cameraPosition, float, int, max, mix, normalWorld, positionWorld, smoothstep, texture, transformNormalToView, vec2, vec3 } from 'three/tsl';
import { type BufferAttribute, ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshStandardNodeMaterial, type Node, NoColorSpace, PlaneGeometry, RedFormat, RepeatWrapping, RGBAFormat, type Texture, UnsignedByteType } from 'three/webgpu';
import { MAP, TOWN } from '../config.ts';
import { tileFbm } from '../core/noise.ts';
import { DEPOSITS, forestCoverAt, heightAtM, lakeX, lakeZ, townX, townZ } from '../sim/terrain.ts';
import type { Side } from '../sim/types.ts';
import { layerOf, type SurfaceId, type SurfaceLibrary } from './surfaces.ts';

// The ground: one mesh from the simulation's height function, reaching well
// past the playable square so the horizon is land, not a void. Six scanned
// surfaces (meadow, dry grass, forest floor, bare rock, trodden earth,
// ploughed soil) are laid by two maps. The cover map is drawn once from what
// the rules know: where the forest is, which ground is high and dry, where
// rock breaks through and where the lakes' banks are. The works map
// (groundWorks.ts) changes as people build: roads, yards, fields and the corn. Each is sampled at its
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
/** Beyond these distances the scans give way to their average colour (a small mip level). */
const VERY_FAR_FROM_M = 300;
const VERY_FAR_FULL_M = 560;
const FLAT_MIP = 7;
/** Turf gives way to rock between these slopes (rise over run). */
const STEEP_FROM = 0.2;
const STEEP_FULL = 0.34;
/**
 * The scans were taken on worn, late-season ground; high summer grass is greener. A tint per surface
 * (linear RGB multipliers, tuned by eye against the scans' own green patches), kept apart from the scans.
 */
const SEASON_TINT: Partial<Record<SurfaceId, readonly [number, number, number]>> = {
  meadow: [0.5, 0.86, 0.4],
  dry_grass: [1.0, 1.02, 0.58],
  // The litter scan is near black under a strategy camera's exposure.
  forest_floor: [1.5, 1.45, 1.2],
  // Trodden earth in a wet country is grey-brown, not the scan's ochre.
  dirt: [0.72, 0.7, 0.68],
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

/** 0…1: ground that was trodden before anyone built: the old road between the two keeps and the lakes' muddy banks. */
function earthAt(x: number, z: number): number {
  let earth = near(distanceToSegmentM(x, z, townX(0), townZ(0), townX(1), townZ(1)), 1.6, 2.2);
  for (const side of [0, 1] as const satisfies readonly Side[]) {
    // The bank and the bed of the lake.
    earth = Math.max(earth, near(Math.hypot(x - lakeX(side), z - lakeZ(side)), TOWN.lakeRadiusM * 0.95, 3));
  }
  return earth;
}

/** 0…1: bare rock: the outcrops of stone and ore, and slopes too steep to hold turf. */
function rockAt(x: number, z: number): number {
  let rock = 0;
  for (const d of DEPOSITS) rock = Math.max(rock, near(Math.hypot(x - d.x, z - d.z), TOWN.depositRadiusM * 0.9, 5));
  const slope = Math.hypot(heightAtM(x + 2, z) - heightAtM(x - 2, z), heightAtM(x, z + 2) - heightAtM(x, z - 2)) / 4;
  return Math.max(rock, Math.min(1, Math.max(0, (slope - STEEP_FROM) / (STEEP_FULL - STEEP_FROM))));
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

/** What covers the ground, per texel: R = dryness, G = trodden earth, B = forest floor, A = bare rock. */
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
      data[o + 3] = Math.round(rockAt(x, z) * 255);
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

/** `works` is the map of roads, yards and fields (groundWorks.ts): it covers the playable square. */
export function buildTerrain(lib: SurfaceLibrary, works: Texture): Mesh {
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
  // Features of about 2.5 m (tufts and worn patches) and 9 m (drifts of colour across a meadow).
  const fine = texture(noise, xz.div(19)).r;
  const coarse = texture(noise, xz.div(71).add(vec2(0.37, 0.11))).r;
  const patch = texture(noise, xz.div(233).add(vec2(0.71, 0.53))).r;
  const what = texture(cover, xz.div(extentM).add(0.5));
  // Ragged edges: the noise decides where exactly one surface gives way to the next.
  const ragged = fine.mul(0.6).add(coarse.mul(0.4)).sub(0.5);
  const dry = smoothstep(0.5, 0.74, what.r.add(patch.sub(0.5).mul(0.7)).add(ragged.mul(0.6)));
  // Leaf litter only where the trees stand thick: thin woodland keeps its grass.
  const forest = smoothstep(0.4, 0.7, what.b.add(ragged.mul(0.6)));
  const made = texture(works, xz.div(MAP.sizeM).add(0.5));
  const earth = smoothstep(0.44, 0.56, max(what.g, made.r).add(ragged.mul(0.55)));
  const rock = smoothstep(0.38, 0.62, what.a.add(ragged.mul(0.7)));
  const soil = smoothstep(0.4, 0.6, made.g.add(ragged.mul(0.2)));
  // v runs against z so the scans' normals keep their handedness on the ground (tangent +X, bitangent −Z).
  const ground = vec2(positionWorld.x, positionWorld.z.negate());
  const far = smoothstep(FAR_FROM_M, FAR_FULL_M, positionWorld.sub(cameraPosition).length()).mul(0.8);
  const veryFar = smoothstep(VERY_FAR_FROM_M, VERY_FAR_FULL_M, positionWorld.sub(cameraPosition).length());
  const uvOf = (id: SurfaceId, scale: number): Node<'vec2'> => ground.div(lib.sizeM[id] * scale);
  /** One of the three maps of a surface, blended over the ground surfaces: nature first, then what people made of it. */
  const blend = (sample: (id: SurfaceId) => Node<'vec3'>, wildTint: Node<'vec3'> | null = null): Node<'vec3'> => {
    const grass = mix(sample('meadow'), sample('dry_grass'), dry);
    const turf = wildTint ? grass.mul(wildTint) : grass;
    const wild = mix(mix(turf, sample('forest_floor'), forest), sample('rock'), rock);
    return mix(mix(wild, sample('dirt'), earth), sample('farm_soil'), soil);
  };
  // No meadow is one green: lush dark patches in the hollows of the noise, sere yellow ones on its crests,
  // and a scatter of flowering weeds a few metres across.
  const lush = smoothstep(0.42, 0.66, texture(noise, xz.div(57).add(vec2(0.13, 0.81))).r);
  const sere = smoothstep(0.52, 0.76, texture(noise, xz.div(33).add(vec2(0.63, 0.27))).r);
  const weeds = smoothstep(0.66, 0.78, texture(noise, xz.div(6.5).add(vec2(0.41, 0.07))).r).mul(smoothstep(0.45, 0.6, coarse));
  const grassTint = mix(mix(vec3(1), vec3(0.6, 0.86, 0.5), lush.mul(0.85)), vec3(1.3, 1.16, 0.66), sere.mul(float(1).sub(lush)).mul(0.6)).mul(mix(vec3(1), vec3(1.25, 1.2, 0.8), weeds.mul(0.5)));
  const scanned = blend((id) => {
    const near = texture(lib.colour, uvOf(id, 1)).depth(int(layerOf(id))).rgb;
    const wide = texture(lib.colour, uvOf(id, FAR_SCALE).add(vec2(0.31, 0.67))).depth(int(layerOf(id))).rgb;
    const season = SEASON_TINT[id];
    // From very far a repeat is a few pixels and reads as a grid of dots: there, the scan's average colour.
    const flat = texture(lib.colour, uvOf(id, FAR_SCALE)).depth(int(layerOf(id))).level(float(FLAT_MIP)).rgb;
    return mix(mix(near, wide, far), flat, veryFar).mul(season ? vec3(season[0], season[1], season[2]) : vec3(1));
  }, grassTint);
  // Corn on the ploughed strips: green shoots that thicken and turn gold as they ripen.
  const corn = made.b;
  const cornColour = mix(vec3(0.1, 0.2, 0.035), vec3(0.5, 0.36, 0.09), smoothstep(0.62, 0.95, corn)).mul(float(0.7).add(fine.mul(0.6)));
  const colour = mix(scanned, cornColour, smoothstep(0.1, 0.45, corn.add(ragged.mul(0.25))).mul(soil));
  // A slow drift of tone, so one meadow is not one green.
  const tone = float(0.62).add(smoothstep(0.3, 0.7, fine).mul(0.42)).add(coarse.mul(0.26)).add(patch.mul(0.2));
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
