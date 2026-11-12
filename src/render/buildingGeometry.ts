import type { BufferGeometry } from 'three/webgpu';
import type { BuildingKind } from '../sim/types.ts';
import { MeshBuilder, type Paint } from './meshBuilder.ts';
import { layerOf, type SurfaceId, type SurfaceLibrary } from './surfaces.ts';

// Buildings from code: each kind has its own silhouette and yard so it can be
// told apart from the strategy camera. Walls, roofs and yards are scanned
// surfaces (limewashed daub in a timber frame, thatch, clay tile, rubble and
// dressed stone), named here by colour constants; small props keep a plain
// colour. Sizes are true to scale: a storey is 3 m, a door 2.1 m (scale
// sheet). Level 2 adds a lean-to, level 3 a pennant in the owner's colour.

// sRGB base colours inside the PBR sheet's range for non-metals.
const PLASTER = 0xcbbfa6;
const TIMBER = 0x4a3b30;
const TIMBER_LIGHT = 0x7a6248;
const THATCH = 0x9a8650;
const TILE = 0x8a4b3a;
const STONE = 0x7a7672;
const STONE_DARK = 0x5d5a57;
const STONE_LIGHT = 0x979087;
const SOIL = 0x5a4a39;
const MUD = 0x3e3328;
const CROP = 0xb39a45;
const CROP_GREEN = 0x6f7f36;
const LOG = 0x6a5038;
const HIDE = 0xa98a62;
const PIG = 0xc79a8c;
const HORSE = 0x5b4030;
const IRON = 0x54565a;
const STRAW_TARGET = 0xc9b678;
const SOOT = 0x2e2d2c;
const MEAT = 0x8c4a40;
const ASHLAR = 0x8f8a80;

/** Which scanned surface each of the constants above is drawn with, and its tint (white = as scanned). */
const SURFACE_OF: readonly (readonly [hex: number, surface: SurfaceId, tintHex: number])[] = [
  [PLASTER, 'plaster', 0xffffff],
  [TIMBER, 'beam', 0xd8cfc6],
  [TIMBER_LIGHT, 'boards', 0xfff2e0],
  [THATCH, 'thatch', 0xffffff],
  [TILE, 'tiles', 0xffffff],
  [STONE, 'rubble', 0xffffff],
  [STONE_DARK, 'rubble', 0xb4b0aa],
  [STONE_LIGHT, 'ashlar', 0xf2efe8],
  [ASHLAR, 'ashlar', 0xdcd8d0],
  [SOIL, 'farm_soil', 0xffffff],
  [MUD, 'dirt', 0xa89a8c],
  [LOG, 'bark', 0xffffff],
  // Standing corn and sheaves in straw, green rows in leaf.
  [CROP, 'thatch', 0xffe9a0],
  [CROP_GREEN, 'leaves', 0xb8d880],
];

function paintsFor(lib: SurfaceLibrary): Map<number, Paint> {
  const paints = new Map<number, Paint>();
  for (const [hex, surface, tintHex] of SURFACE_OF) paints.set(hex, { layer: layerOf(surface), sizeM: lib.sizeM[surface], tintHex });
  return paints;
}

/** A timber-framed cottage on a rubble footing: limewashed panels between posts and rails, a door, a shuttered window, a gable roof. */
function cottage(b: MeshBuilder, cx: number, cz: number, sx: number, sz: number, wallH: number, roofHex: number, wallHex = PLASTER): void {
  const footing = 0.35;
  b.box(cx, 0, cz, sx + 0.24, footing, sz + 0.24, STONE);
  b.box(cx, footing, cz, sx, wallH - footing, sz, wallHex);
  // The frame stands a few centimetres proud of the panels.
  const post = 0.2;
  const proud = 0.05;
  const posts = Math.max(2, Math.round(sx / 1.7) + 1);
  for (const dz of [-1, 1]) {
    const z = cz + dz * (sz / 2 + proud);
    for (let i = 0; i < posts; i++) b.box(cx - sx / 2 + (i / (posts - 1)) * sx, footing, z, post, wallH - footing, post * 0.6, TIMBER);
    for (const y of [footing, footing + (wallH - footing) * 0.52, wallH - 0.2]) b.box(cx, y, z, sx + post, 0.2, post * 0.6, TIMBER);
  }
  const endPosts = Math.max(2, Math.round(sz / 1.7) + 1);
  for (const dx of [-1, 1]) {
    const x = cx + dx * (sx / 2 + proud);
    for (let i = 0; i < endPosts; i++) b.box(x, footing, cz - sz / 2 + (i / (endPosts - 1)) * sz, post * 0.6, wallH - footing, post, TIMBER);
    for (const y of [footing, footing + (wallH - footing) * 0.52, wallH - 0.2]) b.box(x, y, cz, post * 0.6, 0.2, sz + post, TIMBER);
    // A king post up the gable.
    b.box(x, wallH, cz, post * 0.6, sz * 0.4, post, TIMBER);
  }
  b.box(cx - sx * 0.2, footing, cz + sz / 2 + 0.09, 0.95, 2.0, 0.08, TIMBER_LIGHT);
  b.box(cx + sx * 0.25, 1.25, cz + sz / 2 + 0.09, 0.75, 0.75, 0.06, SOOT);
  b.box(cx + sx * 0.25 + 0.5, 1.2, cz + sz / 2 + 0.1, 0.36, 0.85, 0.05, TIMBER_LIGHT);
  b.gable(cx, wallH, cz, sx, sz, sz * 0.46, roofHex, wallHex, 0.5);
  // Ridge and barge boards.
  b.box(cx, wallH + sz * 0.46 - 0.04, cz, sx + 1.0, 0.14, 0.3, roofHex === THATCH ? THATCH : TIMBER);
}

function chimney(b: MeshBuilder, cx: number, cz: number, height: number, width = 0.8): void {
  b.box(cx, 0, cz, width, height, width, STONE);
  b.box(cx, height, cz, width + 0.2, 0.2, width + 0.2, STONE_DARK);
}

/** A run of fence between two points. */
function fence(b: MeshBuilder, x0: number, z0: number, x1: number, z1: number): void {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const posts = Math.max(2, Math.round(length / 1.6) + 1);
  for (let i = 0; i < posts; i++) {
    const t = i / (posts - 1);
    b.box(x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, 0.12, 1.1, 0.12, TIMBER);
  }
  const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  for (const y of [0.45, 0.9]) b.box((x0 + x1) / 2, y, (z0 + z1) / 2, along ? length : 0.07, 0.09, along ? 0.07 : length, TIMBER_LIGHT);
}

function pen(b: MeshBuilder, cx: number, cz: number, sx: number, sz: number, groundHex: number): void {
  b.box(cx, 0, cz, sx, 0.06, sz, groundHex);
  fence(b, cx - sx / 2, cz - sz / 2, cx + sx / 2, cz - sz / 2);
  fence(b, cx - sx / 2, cz + sz / 2, cx + sx / 2, cz + sz / 2);
  fence(b, cx - sx / 2, cz - sz / 2, cx - sx / 2, cz + sz / 2);
  fence(b, cx + sx / 2, cz - sz / 2, cx + sx / 2, cz + sz / 2);
}

function animal(b: MeshBuilder, cx: number, cz: number, length: number, height: number, hex: number): void {
  b.box(cx, height * 0.45, cz, length, height * 0.55, length * 0.42, hex);
  b.box(cx + length * 0.55, height * 0.6, cz, length * 0.3, height * 0.4, length * 0.32, hex);
  for (const dx of [-0.35, 0.35]) for (const dz of [-0.12, 0.12]) b.box(cx + dx * length, 0, cz + dz * length, length * 0.1, height * 0.45, length * 0.1, hex);
}

const BUILDERS: Record<BuildingKind, (b: MeshBuilder) => void> = {
  house: (b) => {
    cottage(b, 0, -0.5, 6.4, 4.8, 2.9, THATCH);
    chimney(b, 2.2, -1.2, 5.6, 0.7);
    // A kitchen garden.
    b.box(-0.5, 0, 3.4, 5, 0.08, 1.8, SOIL);
    for (let i = 0; i < 5; i++) b.box(-2.5 + i, 0.08, 3.4, 0.5, 0.25, 1.4, CROP_GREEN);
  },
  woodcutter: (b) => {
    cottage(b, -1.5, -1.5, 4.6, 3.8, 2.5, THATCH, TIMBER_LIGHT);
    // Stacked logs and a chopping block.
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) b.log(2.6, 0.3 + row * 0.52, 0.2 + (i + row * 0.5) * 0.6, 0.29, 3.4, 6, LOG);
    b.cylinder(-0.5, 0, 2.8, 0.45, 0.45, 0.6, 7, LOG);
    b.box(-0.5, 0.6, 2.8, 0.1, 0.5, 0.5, IRON);
  },
  quarry: (b) => {
    // A cut face of rock, dressed blocks, and a hoist.
    b.box(-1.5, 0, -2.2, 6, 2.6, 2.4, STONE_DARK);
    b.box(-2.6, 0, -0.6, 3.4, 1.5, 1.6, STONE);
    b.box(1.2, 0, -1.4, 2.2, 1.9, 1.2, STONE_LIGHT);
    for (let i = 0; i < 3; i++) b.box(-1 + i * 1.5, 0, 2.6, 1.2, 0.7, 0.8, STONE_LIGHT);
    b.box(0.5, 0.7, 2.6, 1.2, 0.7, 0.8, STONE);
    b.box(3.2, 0, 0.8, 0.25, 4.2, 0.25, TIMBER);
    b.box(2.3, 4.0, 0.8, 2.4, 0.2, 0.2, TIMBER);
    b.box(1.3, 2.4, 0.8, 0.06, 1.6, 0.06, SOOT);
    b.box(1.3, 1.9, 0.8, 0.7, 0.5, 0.7, STONE_LIGHT);
  },
  farm: (b) => {
    cottage(b, -2.6, -2.6, 4.2, 3.4, 2.4, THATCH);
    // Strips of ripening grain.
    b.box(0.6, 0, 1.2, 9.6, 0.07, 6.6, SOIL);
    for (let i = 0; i < 8; i++) b.box(-3.6 + i * 1.2, 0.07, 1.2, 0.8, 0.55, 6.2, i % 3 === 0 ? CROP_GREEN : CROP);
    // Sheaves.
    for (const [x, z] of [[2.6, -3.2], [3.6, -2.6]] as const) b.cylinder(x, 0, z, 0.45, 0.15, 1.1, 6, CROP);
  },
  bakery: (b) => {
    cottage(b, -0.6, -0.4, 6.2, 4.6, 2.8, TILE);
    // The oven: a stone dome with a tall flue.
    b.cylinder(3.3, 0, 1.2, 1.5, 1.2, 1.3, 8, STONE);
    b.cylinder(3.3, 1.3, 1.2, 1.2, 0.3, 0.8, 8, STONE_LIGHT);
    chimney(b, 3.3, -0.5, 6.2, 0.9);
    b.box(-1, 0, 3, 2.2, 0.9, 0.9, TIMBER_LIGHT);
    for (let i = 0; i < 3; i++) b.box(-1.6 + i * 0.6, 0.9, 3, 0.45, 0.22, 0.45, CROP);
  },
  pigFarm: (b) => {
    // A low sty and a muddy pen.
    b.box(-2.6, 0, -2.6, 4.4, 1.6, 3, TIMBER_LIGHT);
    b.gable(-2.6, 1.6, -2.6, 4.4, 3, 1.1, THATCH, TIMBER_LIGHT);
    pen(b, 1, 1.4, 8, 5.6, MUD);
    animal(b, -0.8, 0.6, 1.2, 0.8, PIG);
    animal(b, 1.8, 2.4, 1.3, 0.85, PIG);
    animal(b, 3.2, 0.2, 1.1, 0.75, PIG);
    b.box(-2, 0, 3.4, 1.8, 0.4, 0.6, TIMBER);
  },
  butcher: (b) => {
    cottage(b, -0.4, -1, 6, 4.4, 2.8, TILE);
    // A smoke rack hung with sausages and sides of meat, under an awning.
    b.box(-2.2, 0, 2.8, 0.14, 2.3, 0.14, TIMBER);
    b.box(2.2, 0, 2.8, 0.14, 2.3, 0.14, TIMBER);
    b.box(0, 2.25, 2.8, 4.6, 0.12, 0.12, TIMBER);
    for (let i = 0; i < 6; i++) b.box(-1.9 + i * 0.75, 1.3 + (i % 2) * 0.25, 2.8, 0.22, 0.95 - (i % 2) * 0.25, 0.22, MEAT);
    b.box(3.4, 0, 0.4, 1.2, 1.9, 1.2, STONE);
    b.cylinder(3.4, 1.9, 0.4, 0.5, 0.25, 1.4, 6, SOOT);
  },
  tannery: (b) => {
    // An open shed, drying frames with stretched hides, and tanning vats.
    for (const dx of [-2.2, 2.2]) for (const dz of [-3.4, -1.2]) b.box(dx, 0, dz, 0.22, 2.6, 0.22, TIMBER);
    b.gable(0, 2.6, -2.3, 4.8, 2.6, 1.2, THATCH, TIMBER_LIGHT);
    b.box(0, 0, -2.3, 3.6, 0.9, 1.2, TIMBER_LIGHT);
    for (let i = 0; i < 3; i++) {
      const x = -3 + i * 3;
      b.box(x - 1, 0, 2.6, 0.1, 2.2, 0.1, TIMBER);
      b.box(x + 1, 0, 2.6, 0.1, 2.2, 0.1, TIMBER);
      b.box(x, 2.1, 2.6, 2.1, 0.1, 0.1, TIMBER);
      b.box(x, 0.5, 2.6, 1.6, 1.5, 0.05, HIDE);
    }
    for (const [x, z] of [[-3, 0.4], [-1.2, 0.6], [0.6, 0.3]] as const) {
      b.cylinder(x, 0, z, 0.75, 0.75, 0.8, 8, LOG);
      b.cylinder(x, 0.72, z, 0.62, 0.62, 0.05, 8, MUD);
    }
  },
  ironMine: (b) => {
    // A spoil heap with a timbered adit, and an ore cart on rails.
    b.cylinder(-1, 0, -1.6, 4.6, 1.6, 3.6, 9, STONE_DARK);
    b.cylinder(1.6, 0, -2.6, 2.8, 0.8, 2.4, 7, STONE);
    b.box(-1, 0, 2.5, 2.2, 2.2, 0.5, SOOT);
    b.box(-2.1, 0, 2.7, 0.28, 2.5, 0.28, TIMBER);
    b.box(0.1, 0, 2.7, 0.28, 2.5, 0.28, TIMBER);
    b.box(-1, 2.4, 2.7, 2.8, 0.28, 0.28, TIMBER);
    b.box(-1, 0, 4.2, 0.1, 0.08, 3, IRON);
    b.box(-0.2, 0, 4.2, 0.1, 0.08, 3, IRON);
    b.box(-0.6, 0.25, 4.6, 1.1, 0.7, 1.4, TIMBER_LIGHT);
    b.box(-0.6, 0.95, 4.6, 0.9, 0.25, 1.2, 0x6a4a3a);
  },
  smithy: (b) => {
    cottage(b, -0.8, -1, 5.6, 4.6, 2.9, TILE, STONE_LIGHT);
    chimney(b, -2.6, -2.2, 7.2, 1.2);
    // The forge under a lean-to, an anvil and a quenching trough.
    for (const dx of [1.6, 4]) b.box(dx, 0, 2.6, 0.2, 2.3, 0.2, TIMBER);
    b.quad([1.4, 2.9, 0.6], [1.4, 2.3, 2.9], [4.2, 2.3, 2.9], [4.2, 2.9, 0.6], TILE);
    b.box(2.9, 0, 0.9, 1.6, 1, 1, STONE_DARK);
    b.box(2.9, 1, 0.9, 1.2, 0.12, 0.7, 0xb5502a);
    b.box(2.9, 0, 2.3, 0.35, 0.6, 0.35, LOG);
    b.box(2.9, 0.6, 2.3, 0.75, 0.24, 0.3, IRON);
    b.box(0.4, 0, 2.8, 1.4, 0.5, 0.6, TIMBER);
  },
  armourer: (b) => {
    b.box(-0.4, 0, -0.8, 6.4, 3.4, 4.8, STONE_LIGHT);
    b.gable(-0.4, 3.4, -0.8, 6.4, 4.8, 2, TILE, STONE_LIGHT);
    b.box(-1.6, 0, 1.63, 1, 2.1, 0.08, TIMBER);
    chimney(b, 2.2, -2.4, 7, 1);
    // Armour stands in the yard.
    for (let i = 0; i < 4; i++) {
      const x = -3 + i * 1.6;
      b.box(x, 0, 3.4, 0.1, 1.5, 0.1, TIMBER);
      b.box(x, 0.95, 3.4, 0.62, 0.7, 0.36, 0x8d9096);
      b.box(x, 1.65, 3.4, 0.3, 0.3, 0.3, 0x9a9da3);
    }
  },
  fletcher: (b) => {
    cottage(b, -1.2, -1.4, 5.2, 4, 2.6, THATCH, TIMBER_LIGHT);
    // Straw butts to shoot at, and a rack of bow staves.
    for (const x of [2.6, 4.2]) {
      b.box(x, 0, 3.2, 0.12, 1.2, 0.12, TIMBER);
      b.cylinder(x, 0.7, 3.2, 0.75, 0.75, 0.3, 10, STRAW_TARGET);
    }
    b.box(-2.6, 0, 2.8, 2.6, 1.9, 0.14, TIMBER);
    for (let i = 0; i < 6; i++) b.box(-3.6 + i * 0.42, 0.1, 3, 0.06, 1.85, 0.06, TIMBER_LIGHT);
    b.log(3.4, 0.25, -0.6, 0.24, 2.6, 6, LOG);
  },
  stable: (b) => {
    // A long low stable with stall doors, and a paddock.
    b.box(-0.2, 0, -2.6, 9.4, 2.6, 3.2, TIMBER_LIGHT);
    b.gable(-0.2, 2.6, -2.6, 9.4, 3.2, 1.5, THATCH, TIMBER_LIGHT);
    for (let i = 0; i < 4; i++) b.box(-3.6 + i * 2.3, 0, -0.97, 1.3, 2, 0.08, TIMBER);
    pen(b, 0, 2.4, 9, 4.6, 0x6b6038);
    animal(b, -1.6, 2.2, 2.1, 1.6, HORSE);
    animal(b, 2.2, 3, 2, 1.55, 0x8a6a4a);
    b.box(-3.6, 0, 0.8, 1.6, 0.45, 0.6, TIMBER);
  },
  barracks: (b) => {
    // A long hall inside a palisade, a drill yard with practice posts.
    b.box(0, 0, -2.6, 8.6, 3.2, 3.6, STONE_LIGHT);
    b.gable(0, 3.2, -2.6, 8.6, 3.6, 1.8, TILE, STONE_LIGHT);
    b.box(0, 0, -0.77, 1.3, 2.2, 0.08, TIMBER);
    const half = 5.2;
    for (let i = 0; i <= 13; i++) {
      const t = -half + (i / 13) * 2 * half;
      for (const [x, z] of [[t, half], [-half, t], [half, t]] as const) {
        // A gap in the front wall for the gate.
        if (z === half && Math.abs(x) < 1.3) continue;
        b.cylinder(x, 0, z, 0.2, 0.08, 2.4, 5, LOG);
      }
    }
    b.box(0, 0, 2.4, 6, 0.05, 3.6, SOIL);
    for (const x of [-2, 0, 2]) {
      b.box(x, 0, 2.6, 0.16, 1.7, 0.16, TIMBER);
      b.box(x, 1.25, 2.6, 0.9, 0.14, 0.14, TIMBER);
    }
  },
};

/** The lean-to that marks level 2. */
function annex(b: MeshBuilder): void {
  b.box(-4.1, 0, -3.6, 1.9, 2, 2.6, TIMBER_LIGHT);
  b.quad([-5.1, 2, -2.2], [-3.1, 2.7, -2.2], [-3.1, 2.7, -5], [-5.1, 2, -5], THATCH);
}

/** Level 3: a pennant in the owner's colour. */
function pennant(b: MeshBuilder, teamHex: number): void {
  b.box(4.4, 0, -4.2, 0.12, 7.5, 0.12, TIMBER);
  b.tri([4.46, 7.4, -4.2], [4.46, 6.4, -4.2], [6.2, 6.9, -4.2], teamHex);
  b.tri([4.46, 6.4, -4.2], [4.46, 7.4, -4.2], [6.2, 6.9, -4.2], teamHex);
}

export function buildingGeometry(kind: BuildingKind, level: number, teamHex: number, lib: SurfaceLibrary): BufferGeometry {
  const b = new MeshBuilder(0, paintsFor(lib));
  BUILDERS[kind](b);
  if (level >= 2) annex(b);
  if (level >= 3) pennant(b, teamHex);
  return b.build();
}

/** The keep: a square stone tower with battlements, corner turrets, a gate and the owner's banner. */
export function keepGeometry(teamHex: number, lib: SurfaceLibrary): BufferGeometry {
  const b = new MeshBuilder(0, paintsFor(lib));
  const half = 4.6;
  b.box(0, 0, 0, half * 2 + 1.2, 1.2, half * 2 + 1.2, STONE_DARK);
  b.box(0, 1.2, 0, half * 2, 10.8, half * 2, ASHLAR);
  // Battlements.
  b.box(0, 12, 0, half * 2 + 0.8, 0.5, half * 2 + 0.8, STONE_DARK);
  for (let i = 0; i < 6; i++) {
    const t = -half + 0.5 + i * ((half * 2 - 1) / 5);
    for (const [x, z] of [[t, half + 0.15], [t, -half - 0.15], [half + 0.15, t], [-half - 0.15, t]] as const) b.box(x, 12.5, z, 0.9, 0.9, 0.9, STONE_LIGHT);
  }
  // Corner turrets with pointed roofs.
  for (const dx of [-1, 1]) {
    for (const dz of [-1, 1]) {
      b.cylinder(dx * half, 0, dz * half, 1.7, 1.6, 14, 8, STONE_LIGHT);
      b.cylinder(dx * half, 14, dz * half, 2.1, 0, 3.4, 8, TILE);
    }
  }
  // Gate and arrow slits on every face.
  for (let face = 0; face < 4; face++) {
    b.at(0, 0, 0, (face * Math.PI) / 2);
    b.box(0, 1.2, half + 0.05, 2.4, 3.2, 0.2, TIMBER);
    b.box(0, 4.4, half + 0.05, 2.8, 0.3, 0.25, STONE_DARK);
    for (const x of [-2.4, 2.4]) for (const y of [6, 9]) b.box(x, y, half + 0.03, 0.25, 1.1, 0.1, SOOT);
  }
  b.at(0, 0, 0, 0);
  // The banner.
  b.box(0, 12.5, 0, 0.18, 7, 0.18, TIMBER);
  b.quad([0.09, 19.3, 0], [0.09, 17.2, 0], [3.4, 17.2, 0], [3.4, 19.3, 0], teamHex);
  b.quad([3.4, 19.3, 0], [3.4, 17.2, 0], [0.09, 17.2, 0], [0.09, 19.3, 0], teamHex);
  return b.build();
}
