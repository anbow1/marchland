import { attribute, float, mix, positionWorld, smoothstep, texture, vec2, vec3 } from 'three/tsl';
import { BufferAttribute, Color, DataTexture, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshStandardNodeMaterial, type Node, NoColorSpace, PlaneGeometry, RedFormat, RepeatWrapping, UnsignedByteType } from 'three/webgpu';
import { MAP, TOWN } from '../config.ts';
import { tileFbm } from '../core/noise.ts';
import { forestCoverAt, heightAtM, plotX, plotZ, townX, townZ } from '../sim/terrain.ts';
import type { Side } from '../sim/types.ts';

// The ground: one mesh from the simulation's height function, reaching well
// past the playable square so the horizon is land, not a void. Colour is
// blended per vertex from what the rules know (forest, town, road) and broken
// up in the shader by one tiling noise texture read at two scales, 3 m and
// 27 m, so no stretch of grass is one flat tone (GUIDE §2b).

/** The mesh reaches this far beyond the playable square on every side. */
export const TERRAIN_MARGIN_M = 320;
const CELL_M = 4;

/** Base colours, sRGB (PBR sheet: fresh grass, dry grass, dry soil, wet mud for the forest floor). */
const GRASS_FRESH = 0x4a6030;
const GRASS_DRY = 0x6d7343;
const SOIL = 0x6b5a47;
const FOREST_FLOOR = 0x3e3b28;

function distanceToSegmentM(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const abx = bx - ax;
  const abz = bz - az;
  const t = Math.min(1, Math.max(0, ((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(px - ax - abx * t, pz - az - abz * t);
}

/** 0…1: how much of the ground at a point is trodden earth (town yards, ring lanes, the road between the towns). */
function earthAt(x: number, z: number): number {
  let earth = 0;
  // The road from keep to keep.
  const road = distanceToSegmentM(x, z, townX(0), townZ(0), townX(1), townZ(1));
  earth = Math.max(earth, 1 - Math.min(1, Math.max(0, (road - 2.2) / 2.5)));
  for (const side of [0, 1] as const satisfies readonly Side[]) {
    const d = Math.hypot(x - townX(side), z - townZ(side));
    if (d > TOWN.outerRadiusM + 20) continue;
    // The yard round the keep and the two ring lanes the plots stand on.
    earth = Math.max(earth, 1 - Math.min(1, Math.max(0, (d - 13) / 4)));
    for (const ring of [TOWN.innerRadiusM, TOWN.outerRadiusM]) {
      earth = Math.max(earth, 0.8 * (1 - Math.min(1, Math.max(0, (Math.abs(d - ring) - 6.5) / 3))));
    }
    for (let plot = 0; plot < TOWN.plotCount; plot++) {
      const pd = Math.hypot(x - plotX(side, plot), z - plotZ(side, plot));
      earth = Math.max(earth, 1 - Math.min(1, Math.max(0, (pd - 6) / 3)));
    }
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

export function buildTerrain(): Mesh {
  const extentM = MAP.sizeM + 2 * TERRAIN_MARGIN_M;
  const cells = Math.round(extentM / CELL_M);
  const geometry = new PlaneGeometry(extentM, extentM, cells, cells).rotateX(-Math.PI / 2);
  const position = geometry.getAttribute('position') as BufferAttribute;
  const colours = new Float32Array(position.count * 3);
  const fresh = new Color(GRASS_FRESH);
  const dry = new Color(GRASS_DRY);
  const soil = new Color(SOIL);
  const floor = new Color(FOREST_FLOOR);
  const c = new Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const y = heightAtM(x, z);
    position.setY(i, y);
    // Hilltops dry out, hollows stay green.
    const dryness = Math.min(1, Math.max(0, 0.45 + y / (MAP.hillHeightM * 1.4)));
    c.copy(fresh).lerp(dry, dryness);
    c.lerp(floor, forestCoverAt(x, z) * 0.85);
    c.lerp(soil, earthAt(x, z));
    colours[i * 3] = c.r;
    colours[i * 3 + 1] = c.g;
    colours[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const noise = noiseTexture(256);
  const material = new MeshStandardNodeMaterial({ name: 'terrain', roughness: 0.92, metalness: 0 });
  const base = attribute('color', 'vec3') as Node<'vec3'>;
  const xz = vec2(positionWorld.x, positionWorld.z);
  const fine = texture(noise, xz.div(3.1)).r;
  const coarse = texture(noise, xz.div(27).add(vec2(0.37, 0.11))).r;
  const patch = texture(noise, xz.div(141).add(vec2(0.71, 0.53))).r;
  // Two scales of tone, and a slow drift of hue towards straw where the coarse noise is high.
  const tone = float(0.72).add(fine.mul(0.3)).add(coarse.mul(0.34)).add(patch.mul(0.2)).sub(0.17);
  const straw = vec3(0.26, 0.23, 0.1);
  const drift = smoothstep(0.55, 0.8, coarse.mul(0.6).add(patch.mul(0.4)));
  material.colorNode = mix(base, straw, drift.mul(0.35)).mul(tone);
  material.roughnessNode = float(0.86).add(fine.mul(0.12));
  const mesh = new Mesh(geometry, material);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  return mesh;
}
