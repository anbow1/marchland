import { cameraPosition, float, int, max, mix, normalWorld, positionWorld, smoothstep, texture, transformNormalToView, vec2, vec3 } from 'three/tsl';
import { type BufferAttribute, ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshStandardNodeMaterial, type Node, NoColorSpace, PlaneGeometry, RedFormat, RepeatWrapping, RGBAFormat, type Texture, UnsignedByteType } from 'three/webgpu';
import { MAP, TOWN } from '../config.ts';
import { fbm2, tileFbm } from '../core/noise.ts';
import { DEPOSITS, forestCoverAt, heightAtM, lakeShare } from '../sim/terrain.ts';
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
/** The fine scans fade from full strength to a fifth between these distances. */
const DETAIL_NEAR_M = 45;
const DETAIL_FAR_M = 260;
/** Grass dried out on high ground, as a multiplier of the green. */
const DRY_TINT = [1.16, 1.05, 0.7] as const;
/** The odd angle (about 37°) the second reading of every texture is turned by. */
const TURN_SIN = Math.sin(0.65);
const TURN_COS = Math.cos(0.65);
/** Turf gives way to rock between these slopes (rise over run). */
const STEEP_FROM = 0.3;
const STEEP_FULL = 0.48;
/**
 * The scans were taken on worn, late-season ground; high summer grass is greener. A tint per surface
 * (linear RGB multipliers, tuned by eye against the scans' own green patches), kept apart from the scans.
 */
const SEASON_TINT: Partial<Record<SurfaceId, readonly [number, number, number]>> = {
  // The drone photograph is of lush grass under a grey sky; a touch warmer for an afternoon sun.
  pasture: [0.9, 1.04, 0.86],
  // The litter scan is near black under a strategy camera's exposure.
  forest_floor: [0.92, 0.9, 0.76],
  // Grey rock reads as snow from above unless it is darkened and greened by lichen.
  rock: [0.62, 0.64, 0.56],
  // Trodden earth in a wet country is grey-brown, not the scan's ochre.
  dirt: [0.72, 0.7, 0.68],
};

/** 1 inside `radiusM` of a point, falling to 0 over `fadeM` beyond it. */
function near(distanceM: number, radiusM: number, fadeM: number): number {
  return 1 - Math.min(1, Math.max(0, (distanceM - radiusM) / fadeM));
}

/** 0…1: ground that was trodden before anyone built: the lakes' muddy banks. Roads are the players' own. */
function earthAt(x: number, z: number): number {
  let earth = 0;
  // The bank and the bed of the lake, following its bays.
  earth = Math.max(earth, near(lakeShare(x, z) * TOWN.lakeRadiusM, TOWN.lakeRadiusM * 0.95, 3));
  return earth;
}

/** 0…1: bare rock: the outcrops of stone and ore, and slopes too steep to hold turf. */
function rockAt(x: number, z: number): number {
  let rock = 0;
  for (const d of DEPOSITS) {
    // A ragged edge: the rock breaks through the turf in tongues and islands, not as a painted disc.
    const ragged = 0.55 + 0.6 * (fbm2(x / 6 + d.x, z / 6 - d.z, 3, MAP.terrainSeed + 41) * 0.5 + 0.5);
    rock = Math.max(rock, near(Math.hypot(x - d.x, z - d.z) / ragged, TOWN.depositRadiusM * 0.7, 3));
  }
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
  // The noise texture repeats; one read of it would lay a grid over the land at its period. Each use
  // reads it twice, the second time turned by an odd angle and scaled by the golden ratio, so the two
  // repeats never line up and the sum has no period a player can see.
  const turned = vec2(xz.x.mul(TURN_COS).sub(xz.y.mul(TURN_SIN)), xz.x.mul(TURN_SIN).add(xz.y.mul(TURN_COS)));
  const noiseAt = (sizeM: number, ox: number, oy: number): Node<'float'> => {
    const a = texture(noise, xz.div(sizeM).add(vec2(ox, oy))).r;
    const b = texture(noise, turned.div(sizeM * 1.618).add(vec2(oy, ox))).r;
    // The mean of two keeps the middle but loses contrast: stretch it back.
    return a.add(b).sub(1).mul(1.35).add(0.5).clamp(0, 1);
  };
  // Features of about 2.5 m (tufts and worn patches) and 9 m (drifts of colour across a meadow).
  const fine = noiseAt(19, 0, 0);
  const coarse = noiseAt(71, 0.37, 0.11);
  const patch = noiseAt(233, 0.71, 0.53);
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
  const groundTurned = vec2(turned.x, turned.y.negate());
  /** Where each of a scan's two readings shows: soft patches a few metres across, never a straight seam. */
  const which = smoothstep(0.3, 0.7, noiseAt(7.3, 0.19, 0.83));
  /**
   * A scan's colour without its repeat: read twice (as laid, and turned, scaled and shifted), the two
   * mixed by `which`, and the mix pushed back out from the scan's average so the blend does not wash the
   * detail flat where the two meet (a cheap form of histogram-preserving blending).
   */
  const untiled = (id: SurfaceId, scale: number, shift: number): Node<'vec3'> => {
    const layer = int(layerOf(id));
    const a = texture(lib.colour, uvOf(id, scale).add(vec2(shift, shift * 0.6))).depth(layer).rgb;
    const b = texture(lib.colour, groundTurned.div(lib.sizeM[id] * scale * 1.27).add(vec2(0.43 + shift, 0.29))).depth(layer).rgb;
    const mean = texture(lib.colour, uvOf(id, scale)).depth(layer).level(float(FLAT_MIP)).rgb;
    const w = which;
    const spread = w.mul(w).add(float(1).sub(w).mul(float(1).sub(w))).sqrt();
    return mix(a, b, w).sub(mean).div(spread).add(mean);
  };
  /** One of the three maps of a surface, blended over the ground surfaces: nature first, then what people made of it. */
  const blend = (sample: (id: SurfaceId) => Node<'vec3'>, wildTint: Node<'vec3'> | null = null): Node<'vec3'> => {
    const grass = mix(sample('meadow'), sample('dry_grass'), dry);
    const turf = wildTint ? grass.mul(wildTint) : grass;
    const wild = mix(mix(turf, sample('forest_floor'), forest), sample('rock'), rock);
    return mix(mix(wild, sample('dirt'), earth), sample('farm_soil'), soil);
  };
  // No meadow is one green: lush dark patches in the hollows of the noise, sere yellow ones on its crests,
  // and a scatter of flowering weeds a few metres across.
  const lush = smoothstep(0.42, 0.66, noiseAt(57, 0.13, 0.81));
  const sere = smoothstep(0.52, 0.76, noiseAt(33, 0.63, 0.27));
  const weeds = smoothstep(0.66, 0.78, noiseAt(6.5, 0.41, 0.07)).mul(smoothstep(0.45, 0.6, coarse));
  const grassTint = mix(mix(vec3(1), vec3(0.72, 0.9, 0.62), lush.mul(0.6)), vec3(1.22, 1.12, 0.7), sere.mul(float(1).sub(lush)).mul(0.45)).mul(mix(vec3(1), vec3(1.2, 1.16, 0.82), weeds.mul(0.4)));
  const distanceM = positionWorld.sub(cameraPosition).length();
  /** How much the fine scans still add on top of the aerial photograph: all of it near, a little far away. */
  const detailShare = float(1).sub(smoothstep(DETAIL_NEAR_M, DETAIL_FAR_M, distanceM)).mul(0.7).add(0.2);
  const luminance = vec3(0.2126, 0.7152, 0.0722);
  /** A fine scan as a ratio round 1 (the scan over its own average): blades and clumps, not a colour of its own. */
  const detailOf = (id: SurfaceId): Node<'vec3'> => {
    const near = untiled(id, 1, 0);
    const mean = texture(lib.colour, uvOf(id, 1)).depth(int(layerOf(id))).level(float(FLAT_MIP)).rgb;
    const bright = near.dot(luminance).div(max(mean.dot(luminance), float(0.02)));
    const tinted = near.div(max(mean, vec3(0.02)));
    return mix(vec3(bright), tinted, 0.25).clamp(0.35, 1.9);
  };
  // The grassland's colour comes from a photograph taken from a drone, 90 m across and read twice like
  // every scan: its own clumps, worn patches and greens. The ground scans only add the fine grain.
  const pastureTint = SEASON_TINT.pasture ?? [1, 1, 1];
  const pastureRaw = untiled('pasture', 1, 0.17);
  // A little of the photograph's contrast taken back: its bare spots are glaring under a strong sun.
  const pastureMean = texture(lib.colour, uvOf('pasture', 1)).depth(int(layerOf('pasture'))).level(float(FLAT_MIP)).rgb;
  const pasture = mix(pastureMean, pastureRaw, 0.78).mul(vec3(pastureTint[0], pastureTint[1], pastureTint[2]));
  const scanned = blend((id) => {
    if (id === 'meadow') return pasture.mul(mix(vec3(1), detailOf('meadow'), detailShare));
    // Dry grass on the crests: the same land gone straw-coloured, with the dry scan's grain.
    if (id === 'dry_grass') return pasture.mul(vec3(DRY_TINT[0], DRY_TINT[1], DRY_TINT[2])).mul(mix(vec3(1), detailOf('dry_grass'), detailShare));
    const near = untiled(id, 1, 0);
    const wide = untiled(id, FAR_SCALE, 0.31);
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
  const tone = float(0.8).add(smoothstep(0.3, 0.7, fine).mul(0.2)).add(coarse.mul(0.12)).add(patch.mul(0.1));
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
