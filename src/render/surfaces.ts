import { abs, attribute, float, int, mix, normalLocal, positionLocal, select, step, texture, transformNormalToView, vec2, vec3 } from 'three/tsl';
import { DataArrayTexture, LinearFilter, LinearMipmapLinearFilter, MeshStandardNodeMaterial, type Node, NoColorSpace, RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three/webgpu';
import type { Quality } from './stage.ts';

// The scanned surfaces (assets/photo/LICENSE.md): every ground, wall and roof
// in the game is one of these sixteen, kept as layers of three array textures
// so a shader samples three textures however many surfaces it shows
// (GUIDE §7: more than 16 textures in a shader does not compile on phones).

export const SURFACES = ['meadow', 'dry_grass', 'dirt', 'mud', 'forest_floor', 'farm_soil', 'plaster', 'beam', 'boards', 'thatch', 'shingles', 'tiles', 'rubble', 'ashlar', 'bark', 'leaves'] as const;
export type SurfaceId = (typeof SURFACES)[number];

export interface SurfaceLibrary {
  colour: DataArrayTexture;
  normal: DataArrayTexture;
  orm: DataArrayTexture;
  /** Metres one repeat of each surface covers, as scanned. */
  sizeM: Record<SurfaceId, number>;
  /** False on the Low preset: colour only, no normal or roughness maps. */
  detailed: boolean;
}

export function layerOf(id: SurfaceId): number {
  return SURFACES.indexOf(id);
}

// Vite copies each file into the build with a hashed name and gives back its URL.
const IMAGE_URLS = import.meta.glob<string>('../assets/photo/*/*.jpg', { eager: true, query: '?url', import: 'default' });
const META = import.meta.glob<{ size_m: number }>('../assets/photo/*/meta.json', { eager: true, import: 'default' });

function urlOf(id: SurfaceId, map: 'color' | 'normal' | 'orm'): string {
  const url = IMAGE_URLS[`../assets/photo/${id}/${map}.jpg`];
  if (!url) throw new Error(`surface '${id}' has no ${map}.jpg in src/assets/photo; run tools/fetch_textures.py`);
  return url;
}

/** Decodes an image to RGBA at `sizePx`, bottom row first (v = 0), into `target` at `offset`. */
async function decodeInto(url: string, sizePx: number, target: Uint8Array, offset: number): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`texture '${url}' failed to load: HTTP ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: 'flipY' });
  // A canvas read back once, never drawn to the screen.
  const canvas = new OffscreenCanvas(sizePx, sizePx);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas is not available for decoding textures');
  ctx.drawImage(bitmap, 0, 0, sizePx, sizePx);
  bitmap.close();
  target.set(ctx.getImageData(0, 0, sizePx, sizePx).data, offset);
}

function arrayTexture(data: Uint8Array, sizePx: number, srgb: boolean): DataArrayTexture {
  const t = new DataArrayTexture(data, sizePx, sizePx, SURFACES.length);
  t.format = RGBAFormat;
  t.type = UnsignedByteType;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Loads every surface. High keeps the scans at 1024 px; Low halves them and leaves out normal and ORM. */
export async function loadSurfaces(quality: Quality, onProgress: (share: number) => void): Promise<SurfaceLibrary> {
  const detailed = quality === 'high';
  const sizePx = detailed ? 1024 : 512;
  const layerBytes = sizePx * sizePx * 4;
  const colour = new Uint8Array(layerBytes * SURFACES.length);
  // Low still needs the textures to exist (one shader for both presets would not): a single grey texel each.
  const normal = detailed ? new Uint8Array(layerBytes * SURFACES.length) : null;
  const orm = detailed ? new Uint8Array(layerBytes * SURFACES.length) : null;
  let done = 0;
  const total = SURFACES.length * (detailed ? 3 : 1);
  const step = (): void => onProgress(++done / total);
  const jobs: Promise<void>[] = [];
  const sizeM = {} as Record<SurfaceId, number>;
  SURFACES.forEach((id, layer) => {
    const meta = META[`../assets/photo/${id}/meta.json`];
    if (!meta) throw new Error(`surface '${id}' has no meta.json in src/assets/photo`);
    sizeM[id] = meta.size_m;
    jobs.push(decodeInto(urlOf(id, 'color'), sizePx, colour, layer * layerBytes).then(step));
    if (normal) jobs.push(decodeInto(urlOf(id, 'normal'), sizePx, normal, layer * layerBytes).then(step));
    if (orm) jobs.push(decodeInto(urlOf(id, 'orm'), sizePx, orm, layer * layerBytes).then(step));
  });
  await Promise.all(jobs);
  return {
    colour: arrayTexture(colour, sizePx, true),
    normal: normal ? arrayTexture(normal, sizePx, false) : flatArray(128, 128, 255),
    orm: orm ? arrayTexture(orm, sizePx, false) : flatArray(255, 220, 0),
    sizeM,
    detailed,
  };
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
