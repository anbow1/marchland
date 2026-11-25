import { abs, attribute, float, int, mix, normalLocal, positionLocal, select, step, texture, transformNormalToView, vec2, vec3 } from 'three/tsl';
import { CompressedArrayTexture, type CompressedTexture, DataArrayTexture, LinearFilter, LinearMipmapLinearFilter, MeshStandardNodeMaterial, type Node, NoColorSpace, RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType, type WebGPURenderer } from 'three/webgpu';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import type { Quality } from './stage.ts';

// The scanned surfaces (src/assets/photo/LICENSE.md, compressed to public/surfaces): every ground, wall and roof
// in the game is one of these sixteen, kept as layers of three array textures
// so a shader samples three textures however many surfaces it shows
// (GUIDE §7: more than 16 textures in a shader does not compile on phones).

export const SURFACES = ['meadow', 'dry_grass', 'dirt', 'mud', 'forest_floor', 'farm_soil', 'plaster', 'beam', 'boards', 'thatch', 'shingles', 'tiles', 'rubble', 'ashlar', 'bark', 'leaves', 'rock', 'pasture'] as const;
export type SurfaceId = (typeof SURFACES)[number];

export interface SurfaceLibrary {
  colour: CompressedArrayTexture | DataArrayTexture;
  normal: CompressedArrayTexture | DataArrayTexture;
  orm: CompressedArrayTexture | DataArrayTexture;
  /** Metres one repeat of each surface covers, as scanned. */
  sizeM: Record<SurfaceId, number>;
  /** False on the Low preset: colour only, no normal or roughness maps. */
  detailed: boolean;
}

export function layerOf(id: SurfaceId): number {
  return SURFACES.indexOf(id);
}

const META = import.meta.glob<{ size_m: number }>('../assets/photo/*/meta.json', { eager: true, import: 'default' });

// The scans as the GPU keeps them: KTX2 (Basis Universal) in public/surfaces, made from src/assets/photo by
// tools/encode_surfaces.mjs — colour and ORM in ETC1S, normals in UASTC, every mip level included. The
// transcoder turns each into what the device's GPU reads (BC7 or BC1 on a desktop, ASTC or ETC2 on a phone or
// tablet), about a quarter of the memory of the RGBA arrays decoded from JPG before; a GPU with no block
// format at all gets RGBA, as before.
const KTX2_URL = (id: SurfaceId, map: 'color' | 'normal' | 'orm'): string => `${import.meta.env.BASE_URL}surfaces/${id}_${map}.ktx2`;

let ktx2Loader: KTX2Loader | null = null;

function loaderFor(renderer: WebGPURenderer): KTX2Loader {
  if (ktx2Loader) return ktx2Loader;
  const loader = new KTX2Loader();
  loader.detectSupport(renderer);
  // Older Android WebGL2 drivers (Mali-T760: the Galaxy Tab S2) turn Basis→ASTC blocks into magenta; ETC2 is
  // part of every WebGL2 and safe there (as mediveal-village found). WebGPU picks its own formats.
  const webgpu = 'isWebGPUBackend' in (renderer.backend as object);
  const config = (loader as unknown as { workerConfig?: { astcSupported?: boolean } }).workerConfig;
  if (!webgpu && config?.astcSupported && /Android/i.test(navigator.userAgent)) config.astcSupported = false;
  ktx2Loader = loader;
  return loader;
}

/** One scan as the device's GPU format, with all its mip levels. */
async function loadLayer(loader: KTX2Loader, url: string): Promise<CompressedTexture> {
  return (await loader.loadAsync(url)) as CompressedTexture;
}

/**
 * The layers of one map as an array texture. `skipMips` leaves out the largest levels (Low: 512 px from the
 * 1024 px scans). A GPU without block compression gets RGBA layers (the transcoder's fallback), mipmapped here.
 */
function arrayOf(layers: CompressedTexture[], srgb: boolean, skipMips: number): CompressedArrayTexture | DataArrayTexture {
  const first = layers[0];
  if (!first) throw new Error('no surface layers to put in an array');
  const levels = first.mipmaps.slice(skipMips);
  const top = levels[0];
  if (!top) throw new Error('a surface scan has no mip levels');
  if ((first.format as number) === (RGBAFormat as number)) {
    const bytes = top.width * top.height * 4;
    const data = new Uint8Array(bytes * layers.length);
    layers.forEach((layer, z) => {
      const mip = layer.mipmaps[skipMips];
      if (!mip) throw new Error(`surface layer ${z} has no mip ${skipMips}`);
      data.set(new Uint8Array(mip.data.buffer, mip.data.byteOffset, bytes), z * bytes);
    });
    const t = new DataArrayTexture(data, top.width, top.height, layers.length);
    t.format = RGBAFormat;
    t.type = UnsignedByteType;
    t.generateMipmaps = true;
    return finish(t, srgb);
  }
  const mipmaps = levels.map((level, m) => {
    const size = level.data.byteLength;
    const data = new Uint8Array(size * layers.length);
    layers.forEach((layer, z) => {
      const mip = layer.mipmaps[skipMips + m];
      if (!mip || mip.data.byteLength !== size) throw new Error(`surface layer ${z} differs from layer 0 at mip ${skipMips + m}: re-encode with tools/encode_surfaces.mjs`);
      data.set(new Uint8Array(mip.data.buffer, mip.data.byteOffset, size), z * size);
    });
    return { data, width: level.width, height: level.height };
  });
  const t = new CompressedArrayTexture(mipmaps as unknown as CompressedTexture['mipmaps'], top.width, top.height, layers.length, first.format, first.type);
  t.generateMipmaps = false;
  return finish(t, srgb);
}

function finish<T extends CompressedArrayTexture | DataArrayTexture>(t: T, srgb: boolean): T {
  t.wrapS = t.wrapT = RepeatWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.anisotropy = 8;
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Loads every surface. High keeps the scans at 1024 px; Low takes them from 512 px and leaves out normal and ORM. */
export async function loadSurfaces(renderer: WebGPURenderer, quality: Quality, onProgress: (share: number) => void): Promise<SurfaceLibrary> {
  const detailed = quality === 'high';
  const loader = loaderFor(renderer);
  const maps = detailed ? (['color', 'normal', 'orm'] as const) : (['color'] as const);
  let done = 0;
  const total = SURFACES.length * maps.length;
  const sizeM = {} as Record<SurfaceId, number>;
  for (const id of SURFACES) {
    const meta = META[`../assets/photo/${id}/meta.json`];
    if (!meta) throw new Error(`surface '${id}' has no meta.json in src/assets/photo`);
    sizeM[id] = meta.size_m;
  }
  const loaded = await Promise.all(
    maps.map((map) =>
      Promise.all(
        SURFACES.map(async (id) => {
          const layer = await loadLayer(loader, KTX2_URL(id, map));
          onProgress(++done / total);
          return layer;
        }),
      ),
    ),
  );
  const skip = detailed ? 0 : 1;
  const [colour, normal, orm] = loaded.map((layers, k) => {
    const array = arrayOf(layers, k === 0, skip);
    for (const layer of layers) layer.dispose();
    return array;
  });
  if (!colour) throw new Error('no colour scans loaded');
  return {
    colour,
    normal: normal ?? flatArray(128, 128, 255),
    orm: orm ?? flatArray(255, 220, 0),
    sizeM,
    detailed,
  };
}

/**
 * Lets go of the CPU copies of the scans once the GPU has them: three keeps a texture's pixels in
 * `image.data` for as long as the texture lives, which for the three arrays on High is about 226 MB of
 * JavaScript heap doing nothing. Call after every surface has been drawn once (the warm-up frame). The
 * arrays are never updated again; a lost GPU context would need a reload of the page.
 */
export function releaseCpuCopies(lib: SurfaceLibrary): number {
  let freed = 0;
  for (const texture of [lib.colour, lib.normal, lib.orm]) {
    if ('isCompressedArrayTexture' in texture) {
      // A compressed array keeps its levels in `mipmaps`.
      for (const level of texture.mipmaps as unknown as { data: Uint8Array | null }[]) {
        if (!level.data) continue;
        freed += level.data.byteLength;
        level.data = null;
      }
      continue;
    }
    const image = texture.image as { data: Uint8Array | null };
    if (!image.data) continue;
    freed += image.data.byteLength;
    image.data = null;
  }
  return freed;
}

/** A one-texel array texture of a single value per layer. */
function flatArray(r: number, g: number, b: number): DataArrayTexture {
  const data = new Uint8Array(4 * SURFACES.length);
  for (let i = 0; i < SURFACES.length; i++) data.set([r, g, b, 255], i * 4);
  const t = new DataArrayTexture(data, 1, 1, SURFACES.length);
  t.format = RGBAFormat;
  t.type = UnsignedByteType;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Share of a scan's baked occlusion applied to sky light. */
const AO_STRENGTH = 0.5;
/** How strongly a normal map bends the surface normal (1 = as scanned). */
const NORMAL_STRENGTH = 1.1;

/**
 * The material of everything built with MeshBuilder's surfaces: buildings, trees, engines. Each
 * vertex names its surface (`aLayer` = layer, repeats per metre) and a tint; the texture is laid on by
 * box projection in the model's own space, along whichever axis the face looks down most, so nothing
 * needs UVs and a wall's boards stay level however the building is turned. Layer −1 is a plain colour.
 */
export function surfaceMaterial(lib: SurfaceLibrary, name: string): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ name, metalness: 0 });
  const where = attribute('aLayer', 'vec2') as Node<'vec2'>;
  const tint = attribute('color', 'vec3') as Node<'vec3'>;
  // 1 where the vertex names a scanned surface, 0 where it is a plain colour (layer −1).
  const scanned = step(-0.5, where.x);
  const layer = int(where.x.max(0).add(0.5));
  const facing = abs(normalLocal);
  const alongX = facing.x.greaterThanEqual(facing.y).and(facing.x.greaterThanEqual(facing.z));
  const alongY = facing.y.greaterThanEqual(facing.z);
  const p = positionLocal;
  const uv = select(alongX, vec2(p.z, p.y), select(alongY, vec2(p.x, p.z), vec2(p.x, p.y))).mul(where.y);
  const colour = texture(lib.colour, uv).depth(layer).rgb;
  m.colorNode = mix(vec3(1), colour, scanned).mul(tint);
  if (lib.detailed) {
    const t = texture(lib.normal, uv).depth(layer).rgb.mul(2).sub(1).mul(NORMAL_STRENGTH);
    // Add the map's sideways lean to the face's own normal, in the plane the texture lies in.
    const lean = select(alongX, vec3(0, t.y, t.x), select(alongY, vec3(t.x, 0, t.y), vec3(t.x, t.y, 0)));
    m.normalNode = transformNormalToView(normalLocal.add(lean.mul(scanned)).normalize());
    const orm = texture(lib.orm, uv).depth(layer).rgb;
    m.roughnessNode = mix(float(0.85), orm.y, scanned);
    // Half the scan's occlusion: at full strength every shaded wall went black.
    m.aoNode = mix(float(1), orm.x, scanned.mul(AO_STRENGTH));
  } else {
    m.roughness = 0.85;
  }
  return m;
}
