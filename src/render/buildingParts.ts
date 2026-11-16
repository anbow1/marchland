import { MeshBuilder, type Paint } from './meshBuilder.ts';
import { layerOf, type SurfaceId, type SurfaceLibrary } from './surfaces.ts';

// The parts every building is put together from: a timber-framed house with a
// steep, thick roof, fences, garden beds, yards and the clutter of a working
// village. Walls, roofs and ground are scanned surfaces, named here by colour
// constants (the builder turns a registered colour into its surface); small
// props keep a plain colour. True to scale: a storey 2.6–3 m, a door 2 m, a
// roof pitched at 50–58° as thatch and shingles need.

export const PLASTER = 0xcbbfa6;
export const OCHRE = 0xc9a45a;
export const TIMBER = 0x4a3b30;
export const BOARDS = 0x7a6248;
export const BOARDS_DARK = 0x5c4a3a;
export const THATCH = 0x9a8650;
export const THATCH_PALE = 0xb9a25a;
export const SHINGLE = 0x6f6a60;
export const TILE = 0x8a4b3a;
export const STONE = 0x7a7672;
export const STONE_DARK = 0x5d5a57;
export const STONE_LIGHT = 0x979087;
export const ASHLAR = 0x8f8a80;
export const SOIL = 0x5a4a39;
export const MUD = 0x3e3328;
export const YARD = 0x6b5d4b;
export const LOG = 0x6a5038;
export const CROP = 0xb39a45;
export const GREEN = 0x6f7f36;
// Plain colours.
export const PIG = 0xc79a8c;
export const HORSE = 0x5b4030;
export const HORSE_PALE = 0x8a6a4a;
export const IRON = 0x54565a;
export const SOOT = 0x2e2d2c;
export const MEAT = 0x8c4a40;
export const HIDE = 0xa98a62;
export const STRAW = 0xc9b678;
export const CANVAS_RED = 0xa8463a;
export const CANVAS_PALE = 0xd8cfb8;
export const CANVAS_BLUE = 0x44607a;
export const BREAD = 0xc08a4a;
export const EMBER = 0xb5502a;
export const CABBAGE = 0x8fb05a;

/** Which scanned surface each colour constant is drawn with, and its tint (white = as scanned). */
const SURFACE_OF: readonly (readonly [hex: number, surface: SurfaceId, tintHex: number])[] = [
  [PLASTER, 'plaster', 0xffffff],
  [OCHRE, 'plaster', 0xecc070],
  [TIMBER, 'beam', 0xd8cfc6],
  [BOARDS, 'boards', 0xfff2e0],
  [BOARDS_DARK, 'boards', 0xb8a898],
  // The scan is of old grey thatch; a warm tint brings back straw that has weathered a few years.
  [THATCH, 'thatch', 0xffe9c4],
  [THATCH_PALE, 'thatch', 0xfff0b0],
  [SHINGLE, 'shingles', 0xffffff],
  [TILE, 'tiles', 0xffffff],
  [STONE, 'rubble', 0xffffff],
  [STONE_DARK, 'rubble', 0xb4b0aa],
  [STONE_LIGHT, 'ashlar', 0xf2efe8],
  [ASHLAR, 'ashlar', 0xdcd8d0],
  [SOIL, 'farm_soil', 0xffffff],
  [MUD, 'mud', 0xc8c0b8],
  [YARD, 'mud', 0xffffff],
  [LOG, 'bark', 0xffffff],
  // Standing corn in dry grass turned gold, green rows in leaf.
  [CROP, 'dry_grass', 0xffe07a],
  [GREEN, 'leaves', 0xb8d880],
];

/**
 * Metres per repeat where the scan's own size would not read from the strategy camera: the thatch
 * scan covers half a metre, which from 40 m is a flat grey; drawn over 2.4 m its bundles show.
 */
const SIZE_OVERRIDE_M: Partial<Record<SurfaceId, number>> = { thatch: 2.4, shingles: 5 };

/** How a scanned surface is laid on a building: its layer and metres per repeat, untinted. */
export function surfacePaint(lib: SurfaceLibrary, surface: SurfaceId, tintHex = 0xffffff): Paint {
  return { layer: layerOf(surface), sizeM: SIZE_OVERRIDE_M[surface] ?? lib.sizeM[surface], tintHex };
}

export function paintsFor(lib: SurfaceLibrary): Map<number, Paint> {
  const paints = new Map<number, Paint>();
  for (const [hex, surface, tintHex] of SURFACE_OF) paints.set(hex, { layer: layerOf(surface), sizeM: SIZE_OVERRIDE_M[surface] ?? lib.sizeM[surface], tintHex });
  return paints;
}

/**
 * The same constants as flat colours of a storybook palette, with no scans (layer −1): warm plaster,
 * straw-yellow thatch, red tile, blue-grey shingle and stone. For the style comparison (tools/compare.ts).
 */
const FLAT_COLOUR: readonly (readonly [hex: number, flatHex: number])[] = [
  // Kept in the middle of the range: under the game's sun a pale flat colour burns out to white.
  [PLASTER, 0xd6c49a],
  [OCHRE, 0xd09a44],
  [TIMBER, 0x4e3222],
  [BOARDS, 0x86603c],
  [BOARDS_DARK, 0x5c3e2a],
  [THATCH, 0xb8963e],
  [THATCH_PALE, 0xc8a84a],
  [SHINGLE, 0x4e5868],
  [TILE, 0xb04a30],
  [STONE, 0x7e7e8a],
  [STONE_DARK, 0x5e5e68],
  [STONE_LIGHT, 0x96949c],
  [ASHLAR, 0x8a8890],
  [SOIL, 0x6a4c32],
  [MUD, 0x5a402c],
  [YARD, 0x76583c],
  [LOG, 0x6e4a30],
  [CROP, 0xd0b03a],
  [GREEN, 0x5c9432],
];

export function flatPaints(): Map<number, Paint> {
  const paints = new Map<number, Paint>();
  for (const [hex, flatHex] of FLAT_COLOUR) paints.set(hex, { layer: -1, sizeM: 1, tintHex: flatHex });
  return paints;
}

export interface HouseSpec {
  cx: number;
  cz: number;
  /** Length along the ridge, and depth; the door is in the +Z wall. */
  sx: number;
  sz: number;
  /** Height of the ground storey's walls above the ground. */
  wallH: number;
  /** Height of an upper storey (0 = none), and how far it juts out over the front and back. */
  upperH?: number;
  jetty?: number;
  wall: number;
  roof: number;
  /** Rise of the roof as a share of half its span: 1.2 is about 50°, 1.5 about 56°. */
  pitch?: number;
  /** How far the ridge is cut back at each end (0 = gables). */
  hip?: number;
  /** A timber frame showing on the walls. */
  frame?: boolean;
  /** Ground storey in this surface instead of `wall` (a stone ground floor under a framed upper one). */
  base?: number;
}

const POST = 0.2;
const PROUD = 0.05;

/** The frame on one long wall: posts, rails and a brace at each end. `z` is the wall's outer face, `out` ±1 its outward side. */
function frameLong(b: MeshBuilder, cx: number, z: number, out: number, sx: number, y0: number, y1: number): void {
  const face = z + out * PROUD;
  const posts = Math.max(2, Math.round(sx / 1.6) + 1);
  for (let i = 0; i < posts; i++) b.box(cx - sx / 2 + (i / (posts - 1)) * sx, y0, face, POST, y1 - y0, POST * 0.6, TIMBER);
  for (const y of [y0, (y0 + y1) / 2 - 0.1, y1 - 0.2]) b.box(cx, y, face, sx + POST, 0.2, POST * 0.6, TIMBER);
  const bay = sx / (posts - 1);
  for (const end of [-1, 1]) {
    const foot = cx + end * (sx / 2 - bay);
    b.strut([foot, y0 + 0.2, face], [cx + end * sx / 2, y1 - 0.2, face], 0.16, POST * 0.6, TIMBER);
  }
}

/** The frame on one end wall, with the gable above it when the roof is not hipped. */
function frameEnd(b: MeshBuilder, x: number, out: number, cz: number, sz: number, y0: number, y1: number, gableRise: number): void {
  const face = x + out * PROUD;
  const posts = Math.max(2, Math.round(sz / 1.6) + 1);
  for (let i = 0; i < posts; i++) b.box(face, y0, cz - sz / 2 + (i / (posts - 1)) * sz, POST * 0.6, y1 - y0, POST, TIMBER);
  for (const y of [y0, (y0 + y1) / 2 - 0.1, y1 - 0.2]) b.box(face, y, cz, POST * 0.6, 0.2, sz + POST, TIMBER);
  if (gableRise <= 0) return;
  // A king post, a collar and the two rafters along the verge.
  b.box(face, y1, cz, POST * 0.6, gableRise - 0.1, POST, TIMBER);
  const collarY = y1 + gableRise * 0.45;
  b.box(face, collarY, cz, POST * 0.6, 0.16, sz * 0.55, TIMBER);
  for (const side of [-1, 1]) b.strut([face, y1, cz + side * sz / 2], [face, y1 + gableRise - 0.05, cz], POST * 0.6, 0.18, TIMBER);
}

/** A house: rubble footing, one or two storeys, door and shuttered windows, a steep roof with thickness. Returns the ridge height. */
export function house(b: MeshBuilder, spec: HouseSpec): number {
  const { cx, cz, sx, sz, wallH, wall, roof } = spec;
  const upperH = spec.upperH ?? 0;
  const jetty = spec.jetty ?? 0;
  const pitch = spec.pitch ?? 1.35;
  const hip = spec.hip ?? 0;
  const footing = 0.4;
  const base = spec.base ?? wall;
  b.box(cx, 0, cz, sx + 0.3, footing, sz + 0.3, STONE);
  b.box(cx, footing, cz, sx, wallH - footing, sz, base);
  const framedBase = spec.frame === true && spec.base === undefined;
  if (framedBase) {
    frameLong(b, cx, cz + sz / 2, 1, sx, footing, wallH);
    frameLong(b, cx, cz - sz / 2, -1, sx, footing, wallH);
  }
  // The upper storey juts out on its joists.
  const szTop = sz + 2 * jetty;
  let top = wallH;
  if (upperH > 0) {
    b.box(cx, wallH, cz, sx, upperH, szTop, wall);
    const joists = Math.max(3, Math.round(sx / 0.9));
    for (let i = 0; i < joists; i++) b.box(cx - sx / 2 + ((i + 0.5) / joists) * sx, wallH - 0.2, cz, 0.16, 0.2, szTop + 0.16, TIMBER);
    if (spec.frame) {
      frameLong(b, cx, cz + szTop / 2, 1, sx, wallH, wallH + upperH);
      frameLong(b, cx, cz - szTop / 2, -1, sx, wallH, wallH + upperH);
    }
    top = wallH + upperH;
  }
  const rise = (szTop / 2) * pitch;
  for (const end of [-1, 1]) {
    const x = cx + (end * sx) / 2;
    if (framedBase) frameEnd(b, x, end, cz, sz, footing, wallH, upperH > 0 || hip > 0 ? 0 : rise);
    if (upperH > 0 && spec.frame) frameEnd(b, x, end, cz, szTop, wallH, top, hip > 0 ? 0 : rise);
    if (hip === 0) {
      // The gable wall under the roof.
      const z0 = cz - szTop / 2;
      const z1 = cz + szTop / 2;
      if (end > 0) b.tri([x, top, z1], [x, top, z0], [x, top + rise, cz], wall);
      else b.tri([x, top, z0], [x, top, z1], [x, top + rise, cz], wall);
    }
  }
  // Door with a lintel, and windows: a dark opening with one shutter folded back.
  const front = cz + sz / 2 + 0.1;
  b.box(cx - sx * 0.22, footing - 0.1, front, 1.0, 2.0, 0.1, BOARDS_DARK);
  b.box(cx - sx * 0.22, footing + 1.9, front, 1.3, 0.16, 0.14, TIMBER);
  const windows = Math.max(1, Math.round(sx / 3.2));
  for (let i = 0; i < windows; i++) {
    const x = cx + sx * 0.12 + i * 1.9;
    if (x > cx + sx / 2 - 0.7) break;
    b.box(x, footing + 1.0, front - 0.02, 0.7, 0.8, 0.08, SOOT);
    b.box(x + 0.55, footing + 0.95, front, 0.34, 0.9, 0.06, BOARDS);
  }
  if (upperH > 0) {
    const upperFront = cz + szTop / 2 + 0.1;
    for (let i = 0; i < Math.max(2, Math.round(sx / 2.4)); i++) {
      const x = cx - sx / 2 + 1.0 + i * 2.2;
      if (x > cx + sx / 2 - 0.7) break;
      b.box(x, wallH + upperH * 0.38, upperFront - 0.02, 0.7, 0.8, 0.08, SOOT);
      b.box(x - 0.55, wallH + upperH * 0.36, upperFront, 0.34, 0.9, 0.06, BOARDS);
    }
  }
  const thatched = roof === THATCH || roof === THATCH_PALE;
  b.roof(cx, top, cz, sx, szTop, rise, hip, thatched ? 0.6 : 0.45, thatched ? 0.42 : 0.14, roof, thatched ? roof : TIMBER);
  // Thatch is bound over the ridge in a thick roll; shingles and tiles get a ridge board.
  const ridgeLen = sx - 2 * hip + (hip > 0 ? 0 : 2 * (thatched ? 0.6 : 0.45));
  if (thatched) b.log(cx, top + rise + 0.32, cz, 0.3, Math.max(0.6, ridgeLen), 7, roof);
  else b.box(cx, top + rise + 0.1, cz, Math.max(0.6, ridgeLen), 0.14, 0.3, TIMBER);
  return top + rise;
}

export function chimney(b: MeshBuilder, cx: number, cz: number, height: number, width = 0.8): void {
  b.box(cx, 0, cz, width, height, width, STONE);
  b.box(cx, height, cz, width + 0.2, 0.2, width + 0.2, STONE_DARK);
  b.box(cx, height + 0.2, cz, width * 0.5, 0.05, width * 0.5, SOOT);
}

/** A fence between two points: posts and two rails, with pales when `pales` is set (a garden fence). */
export function fence(b: MeshBuilder, x0: number, z0: number, x1: number, z1: number, pales = false): void {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const posts = Math.max(2, Math.round(length / 1.7) + 1);
  for (let i = 0; i < posts; i++) {
    const t = i / (posts - 1);
    b.box(x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, 0.12, 1.15, 0.12, TIMBER);
  }
  for (const y of [0.45, 0.9]) b.strut([x0, y, z0], [x1, y, z1], 0.07, 0.09, BOARDS);
  if (!pales) return;
  const count = Math.round(length / 0.3);
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    // Uneven tops: split pales are never one length.
    b.box(x0 + (x1 - x0) * t, 0.08, z0 + (z1 - z0) * t, 0.1, 0.92 + ((i * 7) % 5) * 0.04, 0.04, BOARDS);
  }
}

/** A fenced yard; `groundHex` gives it its own ground (0 leaves the terrain showing); `gate` leaves a gap in the +Z side. */
export function yard(b: MeshBuilder, cx: number, cz: number, sx: number, sz: number, groundHex: number, pales = false, gate = true): void {
  if (groundHex !== 0) b.box(cx, 0, cz, sx, 0.05, sz, groundHex);
  const x0 = cx - sx / 2;
  const x1 = cx + sx / 2;
  const z0 = cz - sz / 2;
  const z1 = cz + sz / 2;
  fence(b, x0, z0, x1, z0, pales);
  fence(b, x0, z0, x0, z1, pales);
  fence(b, x1, z0, x1, z1, pales);
  if (gate) {
    fence(b, x0, z1, cx - 0.8, z1, pales);
    fence(b, cx + 0.8, z1, x1, z1, pales);
  } else {
    fence(b, x0, z1, x1, z1, pales);
  }
}

/** Garden beds: dug soil with rows of plants; cabbages when `heads` is set, leafy rows otherwise. */
export function beds(b: MeshBuilder, cx: number, cz: number, sx: number, sz: number, heads: boolean): void {
  b.box(cx, 0, cz, sx, 0.09, sz, SOIL);
  const rows = Math.max(1, Math.round(sz / 0.8));
  for (let r = 0; r < rows; r++) {
    const z = cz - sz / 2 + ((r + 0.5) / rows) * sz;
    if (heads) {
      const count = Math.round(sx / 0.6);
      for (let i = 0; i < count; i++) b.cylinder(cx - sx / 2 + ((i + 0.5) / count) * sx, 0.09, z, 0.17, 0.1, 0.16, 6, CABBAGE);
    } else {
      b.box(cx, 0.09, z, sx - 0.3, 0.3, 0.22, GREEN);
    }
  }
}

export function barrel(b: MeshBuilder, cx: number, cz: number, scale = 1): void {
  b.cylinder(cx, 0, cz, 0.3 * scale, 0.36 * scale, 0.45 * scale, 8, LOG);
  b.cylinder(cx, 0.45 * scale, cz, 0.36 * scale, 0.3 * scale, 0.45 * scale, 8, LOG);
}

export function crate(b: MeshBuilder, cx: number, cz: number, size = 0.7): void {
  b.box(cx, 0, cz, size, size * 0.8, size, BOARDS);
}

/** A two-wheeled cart with shafts, turned by `turnRad`; `load` is a colour for what lies in it (0 = empty). */
export function cart(b: MeshBuilder, cx: number, cz: number, turnRad: number, load = 0): void {
  b.at(cx, 0, cz, turnRad);
  b.box(0, 0.6, 0, 1.4, 0.12, 2.0, BOARDS);
  for (const side of [-1, 1]) {
    b.log(side * 0.82, 0.55, 0, 0.55, 0.1, 10, BOARDS_DARK);
    b.box(side * 0.68, 0.72, 0, 0.07, 0.42, 2.0, BOARDS);
    b.strut([side * 0.55, 0.66, 1.0], [side * 0.45, 0.4, 2.7], 0.08, 0.08, BOARDS);
  }
  if (load !== 0) b.box(0, 0.72, 0, 1.2, 0.36, 1.8, load);
  b.at(0, 0, 0, 0);
}

export function haystack(b: MeshBuilder, cx: number, cz: number, radius = 1.3): void {
  b.cylinder(cx, 0, cz, radius, radius * 0.9, radius * 0.7, 9, THATCH_PALE);
  b.cylinder(cx, radius * 0.7, cz, radius * 0.9, 0.15, radius * 1.1, 9, THATCH_PALE);
}

/** A well: a stone ring, and a sweep (a long pole on a forked post) to draw with. */
export function well(b: MeshBuilder, cx: number, cz: number): void {
  b.cylinder(cx, 0, cz, 0.95, 0.9, 0.8, 10, STONE);
  b.cylinder(cx, 0.78, cz, 0.7, 0.7, 0.04, 10, SOOT);
  b.box(cx + 2.2, 0, cz, 0.2, 3.4, 0.2, TIMBER);
  b.strut([cx + 3.6, 2.2, cz], [cx - 0.2, 4.4, cz], 0.12, 0.12, TIMBER);
  b.box(cx - 0.2, 1.2, cz, 0.03, 3.2, 0.03, STRAW);
  b.cylinder(cx - 0.2, 0.95, cz, 0.16, 0.2, 0.3, 7, BOARDS);
}

/** A market stall: four poles, a striped awning, a table with goods of colour `goods`. */
export function stall(b: MeshBuilder, cx: number, cz: number, stripe: number, goods: number): void {
  for (const dx of [-1.1, 1.1]) {
    b.box(cx + dx, 0, cz - 0.8, 0.09, 2.0, 0.09, TIMBER);
    b.box(cx + dx, 0, cz + 0.8, 0.09, 2.5, 0.09, TIMBER);
  }
  // The awning in alternating strips, sloping to the back.
  const strips = 6;
  for (let i = 0; i < strips; i++) {
    const x0 = cx - 1.3 + (i / strips) * 2.6;
    const x1 = cx - 1.3 + ((i + 1) / strips) * 2.6;
    const hex = i % 2 === 0 ? stripe : CANVAS_PALE;
    b.quad([x0, 2.55, cz + 1.0], [x1, 2.55, cz + 1.0], [x1, 2.0, cz - 1.0], [x0, 2.0, cz - 1.0], hex);
    b.quad([x1, 2.52, cz + 1.0], [x0, 2.52, cz + 1.0], [x0, 1.97, cz - 1.0], [x1, 1.97, cz - 1.0], hex);
  }
  b.box(cx, 0, cz + 0.2, 2.0, 0.85, 0.8, BOARDS);
  for (let i = 0; i < 4; i++) b.box(cx - 0.75 + i * 0.5, 0.85, cz + 0.2, 0.36, 0.2, 0.5, goods);
}

/** A stack of logs lying along X. */
export function logPile(b: MeshBuilder, cx: number, cz: number, length: number, base = 4): void {
  for (let row = 0; row < base - 1; row++) {
    for (let i = 0; i < base - row; i++) b.log(cx, 0.3 + row * 0.5, cz + (i + row * 0.5 - (base - 1) / 2) * 0.6, 0.29, length, 7, LOG);
  }
}

/** A four-legged animal of body length `length` and shoulder height `height`, facing +X. */
/** A modelled prop as tools/blender/prop.py writes it. */
export interface PropModel {
  size: number[];
  positions: number[];
  normals: number[];
  colours: number[];
  triangles: number[];
}

/** The pig model (public/props/pig.json, head along -Z), once loaded: the sty's pigs are drawn with it. */
let pigModel: PropModel | null = null;
export function setPigModel(model: PropModel): void {
  pigModel = model;
}

export function animal(b: MeshBuilder, cx: number, cz: number, length: number, height: number, hex: number): void {
  if (hex === PIG && pigModel) {
    // Head to +X like the built animals; each pig a little turned, by where it stands.
    const lean = Math.sin(cx * 3.1 + cz * 1.7) * 0.6;
    b.model(pigModel, cx, 0, cz, -Math.PI / 2 + lean, length / (pigModel.size[2] as number));
    return;
  }
  b.log(cx, height * 0.72, cz, height * 0.3, length, 7, hex);
  b.box(cx + length * 0.6, height * 0.68, cz, length * 0.3, height * 0.36, length * 0.26, hex);
  for (const dx of [-0.36, 0.36]) for (const dz of [-0.11, 0.11]) b.box(cx + dx * length, 0, cz + dz * length, length * 0.09, height * 0.5, length * 0.09, hex);
}

export function trough(b: MeshBuilder, cx: number, cz: number): void {
  b.box(cx, 0, cz, 1.8, 0.4, 0.55, BOARDS_DARK);
  b.box(cx, 0.4, cz, 1.6, 0.03, 0.4, SOOT);
}
