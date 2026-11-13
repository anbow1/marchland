import type { BufferGeometry } from 'three/webgpu';
import type { BuildingKind } from '../sim/types.ts';
import * as P from './buildingParts.ts';
import { MeshBuilder } from './meshBuilder.ts';
import type { SurfaceLibrary } from './surfaces.ts';

// The fourteen buildings and the keep, each a house or shed from
// buildingParts.ts with the yard that tells its trade from the strategy
// camera: a pen, a field, a rack of hides, a spoil heap. Doors face +Z (the
// town view turns that towards the keep). A plot is about 11 m square. Level 2
// adds a lean-to and more stock in the yard; level 3 a pennant in the owner's
// colour; the house itself grows from a thatched cottage to a jettied town
// house. Everything here is geometry from code; modelled buildings may replace
// it later (BRIEF §9).

type Build = (b: MeshBuilder, level: number) => void;

const BUILDERS: Record<BuildingKind, Build> = {
  house: (b, level) => {
    if (level === 1) {
      // A cottage under a hipped thatch, with a kitchen garden.
      P.house(b, { cx: -0.5, cz: -1.6, sx: 6.6, sz: 4.6, wallH: 2.3, wall: P.PLASTER, roof: P.THATCH, hip: 1.0, pitch: 1.45, frame: true });
    } else if (level === 2) {
      P.house(b, { cx: -0.5, cz: -1.6, sx: 7.2, sz: 4.8, wallH: 2.8, wall: P.PLASTER, roof: P.SHINGLE, pitch: 1.5, frame: true });
      P.chimney(b, 2.2, -2.4, 7.4, 0.7);
    } else {
      // A town house: the upper floor jettied out over the street.
      P.house(b, { cx: -0.5, cz: -1.6, sx: 7.4, sz: 4.6, wallH: 2.9, upperH: 2.6, jetty: 0.4, wall: P.OCHRE, roof: P.SHINGLE, pitch: 1.5, frame: true });
      P.chimney(b, 2.4, -2.6, 10.6, 0.8);
    }
    P.yard(b, 0.4, 3.2, 9.4, 3.6, 0, true);
    P.beds(b, -1.8, 3.3, 3.6, 2.4, true);
    P.beds(b, 2.6, 3.3, 3.2, 2.4, false);
    // The privy.
    b.box(4.4, 0, -3.6, 1.1, 2.0, 1.1, P.BOARDS);
    b.roof(4.4, 2.0, -3.6, 1.1, 1.1, 0.5, 0, 0.15, 0.08, P.BOARDS_DARK, P.TIMBER);
    P.barrel(b, 3.4, -0.4);
  },
  woodcutter: (b, level) => {
    P.house(b, { cx: -2.0, cz: -2.2, sx: 5.0, sz: 4.0, wallH: 2.3, wall: P.BOARDS, roof: P.THATCH, hip: 0.9, pitch: 1.4 });
    P.logPile(b, 2.6, -1.4, 3.6, 4);
    if (level >= 2) P.logPile(b, 2.8, 2.6, 3.2, 3);
    // A chopping block with the axe left in it, split billets beside.
    b.cylinder(-1.4, 0, 2.2, 0.42, 0.42, 0.55, 8, P.LOG);
    b.strut([-1.4, 0.55, 2.2], [-1.0, 1.2, 2.3], 0.05, 0.05, P.BOARDS);
    b.box(-1.36, 0.55, 2.2, 0.08, 0.2, 0.3, P.IRON);
    for (let i = 0; i < 5; i++) b.box(-2.6 + (i % 3) * 0.4, 0.05 + Math.floor(i / 3) * 0.22, 3.4, 0.3, 0.2, 0.9, P.BOARDS);
    // A sawing trestle.
    for (const x of [0.2, 1.6]) {
      b.strut([x, 0, 3.0], [x, 1.0, 3.9], 0.1, 0.1, P.TIMBER);
      b.strut([x, 0, 3.9], [x, 1.0, 3.0], 0.1, 0.1, P.TIMBER);
    }
    b.log(0.9, 0.85, 3.45, 0.22, 2.6, 7, P.LOG);
  },
  quarry: (b, level) => {
    // A cut face of rock stepping down, dressed blocks, and a hoist.
    b.box(-1.5, 0, -3.2, 7.4, 3.0, 2.4, P.STONE_DARK);
    b.box(-2.8, 0, -1.4, 4.2, 1.7, 1.8, P.STONE);
    b.box(1.6, 0, -2.2, 2.4, 2.2, 1.4, P.STONE);
    for (let i = 0; i < 2 + level; i++) b.box(-2.4 + i * 1.5, 0, 2.8, 1.2, 0.7, 0.8, P.STONE_LIGHT);
    b.box(-0.9, 0.7, 2.8, 1.2, 0.7, 0.8, P.STONE_LIGHT);
    b.box(3.6, 0, 0.4, 0.26, 4.6, 0.26, P.TIMBER);
    b.strut([3.6, 4.4, 0.4], [0.9, 4.9, 0.4], 0.2, 0.2, P.TIMBER);
    b.strut([3.6, 2.6, 0.4], [2.2, 4.6, 0.4], 0.14, 0.14, P.TIMBER);
    b.box(1.1, 2.1, 0.4, 0.04, 2.7, 0.04, P.STRAW);
    b.box(1.1, 1.5, 0.4, 0.8, 0.6, 0.8, P.STONE_LIGHT);
    // The masons' lodge.
    P.house(b, { cx: 3.4, cz: 3.2, sx: 3.2, sz: 2.6, wallH: 2.0, wall: P.BOARDS_DARK, roof: P.SHINGLE, pitch: 1.2 });
    P.cart(b, -3.6, 1.2, 0.5, P.STONE);
  },
  farm: (b, level) => {
    P.house(b, { cx: -3.2, cz: -3.2, sx: 4.6, sz: 3.8, wallH: 2.2, wall: P.PLASTER, roof: P.THATCH, hip: 0.9, pitch: 1.45, frame: true });
    // Strips of ripening corn inside a rail fence.
    P.yard(b, 1.0, 1.6, 9.6, 7.0, P.SOIL, false, false);
    for (let i = 0; i < 7; i++) b.box(-2.9 + i * 1.3, 0.05, 1.6, 0.95, i % 3 === 0 ? 0.4 : 0.75, 6.2, i % 3 === 0 ? P.GREEN : P.CROP);
    P.haystack(b, 3.4, -3.6, 1.2);
    if (level >= 2) P.haystack(b, 0.9, -3.9, 1.0);
    P.cart(b, -0.6, -3.2, 1.2, level >= 2 ? P.CROP : 0);
  },
  fisher: (b, level) => {
    P.house(b, { cx: -2.2, cz: -2.4, sx: 4.8, sz: 3.8, wallH: 2.1, wall: P.BOARDS_DARK, roof: P.THATCH, hip: 0.8, pitch: 1.4 });
    // Drying racks hung with the catch.
    for (let rack = 0; rack < (level >= 2 ? 2 : 1); rack++) {
      const z = 1.6 + rack * 1.8;
      b.box(-3.4, 0, z, 0.12, 1.9, 0.12, P.TIMBER);
      b.box(0.2, 0, z, 0.12, 1.9, 0.12, P.TIMBER);
      b.box(-1.6, 1.85, z, 3.8, 0.1, 0.1, P.TIMBER);
      for (let i = 0; i < 7; i++) b.box(-3.1 + i * 0.5, 1.25, z, 0.14, 0.6, 0.06, P.STONE_LIGHT);
    }
    // A boat hauled out and turned over, its oars against it.
    b.box(3.0, 0, 0.6, 1.5, 0.5, 4.2, P.BOARDS);
    b.roof(3.0, 0.5, 0.6, 1.5, 4.2, 0.45, 0.6, 0, 0.06, P.BOARDS_DARK, P.TIMBER);
    b.strut([4.1, 0, -0.8], [3.5, 1.0, 1.6], 0.07, 0.07, P.BOARDS);
    // A net spread to dry on stakes.
    for (const x of [1.2, 3.6]) b.box(x, 0, 3.9, 0.1, 1.4, 0.1, P.TIMBER);
    b.quad([1.2, 1.35, 3.9], [1.2, 0.3, 3.9], [3.6, 0.3, 3.9], [3.6, 1.35, 3.9], P.STRAW);
    b.quad([3.6, 1.35, 3.9], [3.6, 0.3, 3.9], [1.2, 0.3, 3.9], [1.2, 1.35, 3.9], P.STRAW);
    P.barrel(b, 0.9, -0.6);
    P.barrel(b, 1.6, -1.3, 0.85);
    if (level >= 3) P.crate(b, 0.6, -2.4);
  },
  bakery: (b, level) => {
    P.house(b, { cx: -1.0, cz: -1.4, sx: 6.4, sz: 4.6, wallH: 2.8, wall: P.PLASTER, roof: P.TILE, pitch: 1.3, frame: true });
    // The oven: a stone dome with a tall flue.
    b.cylinder(3.6, 0, 0.6, 1.5, 1.25, 1.3, 9, P.STONE);
    b.cylinder(3.6, 1.3, 0.6, 1.25, 0.3, 0.9, 9, P.STONE_LIGHT);
    b.box(3.6, 0.3, 1.95, 0.7, 0.6, 0.2, P.SOOT);
    P.chimney(b, 3.6, -1.2, 7.4, 0.9);
    P.stall(b, -1.6, 3.4, P.CANVAS_RED, P.BREAD);
    if (level >= 2) P.stall(b, 1.6, 3.4, P.CANVAS_BLUE, P.BREAD);
    for (let i = 0; i < 3; i++) b.box(4.2, 0.05 + i * 0.3, 3.4, 0.9, 0.3, 0.5, P.CANVAS_PALE);
  },
  pigFarm: (b, level) => {
    // A low sty and a muddy pen.
    P.house(b, { cx: -2.8, cz: -3.0, sx: 4.6, sz: 3.2, wallH: 1.6, wall: P.BOARDS, roof: P.THATCH, hip: 1.0, pitch: 1.3 });
    P.yard(b, 1.0, 1.6, 9.0, 6.2, P.MUD, false, false);
    P.animal(b, -1.4, 0.4, 1.2, 0.8, P.PIG);
    P.animal(b, 1.8, 2.6, 1.3, 0.85, P.PIG);
    P.animal(b, 3.4, 0.2, 1.1, 0.75, P.PIG);
    if (level >= 2) P.animal(b, 0.2, 3.6, 1.2, 0.8, P.PIG);
    if (level >= 3) P.animal(b, -2.6, 2.8, 1.0, 0.7, P.PIG);
    P.trough(b, 2.6, -0.9);
    P.haystack(b, 2.8, -3.6, 0.9);
  },
  butcher: (b, level) => {
    P.house(b, { cx: -0.8, cz: -1.8, sx: 6.2, sz: 4.4, wallH: 2.8, wall: P.PLASTER, roof: P.SHINGLE, pitch: 1.45, frame: true });
    // A smoke rack hung with sausages and sides of meat.
    b.box(-2.4, 0, 2.8, 0.14, 2.3, 0.14, P.TIMBER);
    b.box(2.0, 0, 2.8, 0.14, 2.3, 0.14, P.TIMBER);
    b.box(-0.2, 2.25, 2.8, 4.8, 0.12, 0.12, P.TIMBER);
    for (let i = 0; i < 4 + level; i++) b.box(-2.1 + i * 0.6, 1.3 + (i % 2) * 0.25, 2.8, 0.2, 0.95 - (i % 2) * 0.25, 0.2, P.MEAT);
    // The smokehouse.
    b.box(3.8, 0, -0.4, 1.4, 2.2, 1.4, P.STONE);
    b.roof(3.8, 2.2, -0.4, 1.4, 1.4, 0.9, 0.5, 0.15, 0.1, P.SHINGLE, P.TIMBER);
    b.cylinder(-3.6, 0, 3.6, 0.45, 0.45, 0.8, 8, P.LOG);
    P.barrel(b, 3.6, 3.4);
  },
  tannery: (b, level) => {
    // An open shed on posts, drying frames with stretched hides, and tanning vats.
    for (const dx of [-2.4, 0, 2.4]) for (const dz of [-4.2, -1.8]) b.box(dx, 0, dz, 0.22, 2.5, 0.22, P.TIMBER);
    b.roof(0, 2.5, -3.0, 5.2, 2.6, 1.7, 1.0, 0.5, 0.4, P.THATCH, P.THATCH);
    b.box(0, 0, -3.0, 4.0, 0.9, 1.2, P.BOARDS);
    b.box(0.2, 0, 1.6, 10, 0.05, 6.8, P.MUD);
    for (let i = 0; i < 2 + level; i++) {
      const x = -3.6 + i * 2.3;
      b.box(x - 0.9, 0, 3.6, 0.1, 2.2, 0.1, P.TIMBER);
      b.box(x + 0.9, 0, 3.6, 0.1, 2.2, 0.1, P.TIMBER);
      b.box(x, 2.1, 3.6, 1.9, 0.1, 0.1, P.TIMBER);
      b.box(x, 0.5, 3.6, 1.45, 1.5, 0.05, P.HIDE);
    }
    for (const [x, z] of [[-3.2, 0.6], [-1.2, 0.9], [0.8, 0.5]] as const) {
      b.cylinder(x, 0, z, 0.8, 0.8, 0.75, 9, P.LOG);
      b.cylinder(x, 0.7, z, 0.66, 0.66, 0.04, 9, P.MUD);
    }
    P.barrel(b, 3.4, 0.6, 1.1);
  },
  ironMine: (b, level) => {
    // A spoil heap with a timbered adit, and an ore cart on rails.
    b.cylinder(-1.2, 0, -2.2, 4.8, 1.8, 3.8, 9, P.STONE_DARK);
    b.cylinder(1.8, 0, -3.2, 3.0, 0.9, 2.6, 7, P.STONE);
    b.box(-1.2, 0, 2.2, 2.2, 2.2, 0.5, P.SOOT);
    b.box(-2.3, 0, 2.4, 0.28, 2.5, 0.28, P.TIMBER);
    b.box(-0.1, 0, 2.4, 0.28, 2.5, 0.28, P.TIMBER);
    b.box(-1.2, 2.4, 2.4, 2.8, 0.28, 0.28, P.TIMBER);
    b.box(-1.6, 0, 4.0, 0.1, 0.08, 3.0, P.IRON);
    b.box(-0.8, 0, 4.0, 0.1, 0.08, 3.0, P.IRON);
    b.box(-1.2, 0.25, 4.4, 1.1, 0.7, 1.4, P.BOARDS);
    b.box(-1.2, 0.95, 4.4, 0.9, 0.25, 1.2, 0x6a4a3a);
    // The windlass shed.
    P.house(b, { cx: 3.0, cz: 2.8, sx: 3.0, sz: 2.6, wallH: 2.0, wall: P.BOARDS_DARK, roof: P.SHINGLE, pitch: 1.2 });
    if (level >= 2) for (let i = 0; i < 3; i++) b.cylinder(3.4 - i * 0.8, 0, 5.2, 0.5, 0.2, 0.5, 6, 0x6a4a3a);
  },
  smithy: (b, level) => {
    P.house(b, { cx: -1.0, cz: -1.8, sx: 6.0, sz: 4.6, wallH: 2.9, wall: P.STONE, roof: P.SHINGLE, pitch: 1.35 });
    P.chimney(b, -3.2, -3.0, 8.6, 1.2);
    // The forge under a lean-to: hearth, anvil on its block, quenching trough.
    for (const dx of [1.8, 4.4]) b.box(dx, 0, 2.6, 0.2, 2.3, 0.2, P.TIMBER);
    b.roof(3.1, 2.3, 1.4, 3.0, 2.6, 0.9, 0, 0.2, 0.12, P.SHINGLE, P.TIMBER);
    b.box(3.1, 0, 0.6, 1.6, 1.0, 1.0, P.STONE_DARK);
    b.box(3.1, 1.0, 0.6, 1.2, 0.12, 0.7, P.EMBER);
    b.cylinder(3.1, 0, 2.2, 0.3, 0.3, 0.6, 7, P.LOG);
    b.box(3.1, 0.6, 2.2, 0.75, 0.24, 0.3, P.IRON);
    P.trough(b, 0.2, 2.8);
    if (level >= 2) for (let i = 0; i < 4; i++) b.box(-3.4 + i * 0.3, 0.05, 3.6, 0.06, 1.3, 0.06, P.IRON);
  },
  armourer: (b, level) => {
    P.house(b, { cx: -0.6, cz: -1.6, sx: 6.6, sz: 4.8, wallH: 3.0, upperH: 2.4, jetty: 0.3, base: P.STONE, wall: P.PLASTER, roof: P.TILE, pitch: 1.3, frame: true });
    P.chimney(b, 2.4, -3.0, 10.4, 1.0);
    // Armour stands in the yard.
    for (let i = 0; i < 3 + level; i++) {
      const x = -3.4 + i * 1.4;
      b.box(x, 0, 3.6, 0.1, 1.5, 0.1, P.TIMBER);
      b.box(x, 0.95, 3.6, 0.62, 0.7, 0.36, 0x8d9096);
      b.cylinder(x, 1.65, 3.6, 0.17, 0.12, 0.3, 7, 0x9a9da3);
    }
  },
  fletcher: (b, level) => {
    P.house(b, { cx: -1.6, cz: -2.0, sx: 5.6, sz: 4.2, wallH: 2.5, wall: P.BOARDS, roof: P.THATCH, hip: 1.0, pitch: 1.4 });
    // Straw butts to shoot at, and a rack of bow staves.
    for (const x of [2.6, 4.2]) {
      b.box(x, 0, 3.6, 0.12, 1.3, 0.12, P.TIMBER);
      b.log(x, 0.85, 3.6, 0.75, 0.28, 10, P.STRAW);
    }
    b.box(-2.8, 0, 2.6, 2.8, 1.9, 0.14, P.TIMBER);
    for (let i = 0; i < 4 + level * 2; i++) b.box(-3.9 + i * 0.3, 0.1, 2.8, 0.06, 1.85, 0.06, P.BOARDS);
    b.log(3.4, 0.25, -0.2, 0.24, 2.6, 7, P.LOG);
  },
  stable: (b, level) => {
    // A long low stable under a hipped thatch, stall doors, and a paddock.
    P.house(b, { cx: -0.2, cz: -3.0, sx: 9.6, sz: 3.6, wallH: 2.4, wall: P.BOARDS, roof: P.THATCH, hip: 1.1, pitch: 1.35 });
    for (let i = 0; i < 4; i++) b.box(-3.4 + i * 2.2, 0.4, -1.12, 1.2, 1.9, 0.08, P.BOARDS_DARK);
    P.yard(b, 0, 2.4, 9.6, 5.0, 0);
    P.animal(b, -1.8, 2.0, 2.1, 1.6, P.HORSE);
    P.animal(b, 2.2, 3.2, 2.0, 1.55, P.HORSE_PALE);
    if (level >= 2) P.animal(b, 0.4, 0.8, 2.0, 1.55, 0x3d2f26);
    P.trough(b, -3.4, 0.8);
    P.haystack(b, 3.6, 0.6, 0.9);
  },
  barracks: (b, level) => {
    // A stone hall inside a palisade, a drill yard with practice posts.
    P.house(b, { cx: 0, cz: -2.8, sx: 8.8, sz: 4.0, wallH: 3.2, wall: P.STONE, roof: P.TILE, pitch: 1.25 });
    const half = 5.3;
    for (let i = 0; i <= 15; i++) {
      const t = -half + (i / 15) * 2 * half;
      for (const [x, z] of [[t, half], [-half, t], [half, t]] as const) {
        // A gap in the front wall for the gate.
        if (z === half && Math.abs(x) < 1.3) continue;
        b.cylinder(x, 0, z, 0.2, 0.06, 2.5 + ((i * 5) % 3) * 0.12, 5, P.LOG);
      }
    }
    for (const x of [-2.2, 0, 2.2]) {
      b.box(x, 0, 2.6, 0.16, 1.7, 0.16, P.TIMBER);
      b.box(x, 1.25, 2.6, 0.9, 0.14, 0.14, P.TIMBER);
    }
    // Racks of pole arms against the hall.
    for (let i = 0; i < 3 * level; i++) b.strut([-3.6 + i * 0.35, 0.05, -0.2], [-3.6 + i * 0.35, 2.3, -0.7], 0.05, 0.05, P.BOARDS);
  },
};

/** The lean-to that marks level 2. */
function annex(b: MeshBuilder): void {
  b.box(-4.6, 0, -3.8, 1.9, 2.0, 2.6, P.BOARDS);
  b.quad([-5.7, 2.0, -2.4], [-3.6, 2.9, -2.4], [-3.6, 2.9, -5.2], [-5.7, 2.0, -5.2], P.SHINGLE);
  b.quad([-3.6, 2.8, -2.4], [-5.7, 1.9, -2.4], [-5.7, 1.9, -5.2], [-3.6, 2.8, -5.2], P.TIMBER);
}

/** Level 3: a pennant in the owner's colour. */
function pennant(b: MeshBuilder, teamHex: number): void {
  b.box(4.9, 0, -4.9, 0.12, 8.5, 0.12, P.TIMBER);
  b.tri([4.96, 8.4, -4.9], [4.96, 7.4, -4.9], [6.7, 7.9, -4.9], teamHex);
  b.tri([4.96, 7.4, -4.9], [4.96, 8.4, -4.9], [6.7, 7.9, -4.9], teamHex);
}

/** `flat` draws it in the storybook palette with no scans, for the style comparison. */
export function buildingGeometry(kind: BuildingKind, level: number, teamHex: number, lib: SurfaceLibrary, flat = false): BufferGeometry {
  const b = new MeshBuilder(0, flat ? P.flatPaints() : P.paintsFor(lib));
  BUILDERS[kind](b, level);
  // The house grows by itself; the others gain a lean-to.
  if (level >= 2 && kind !== 'house') annex(b);
  if (level >= 3) pennant(b, teamHex);
  return b.build();
}

/** The keep: a square stone tower with battlements, corner turrets under shingled spires, a gate and the owner's banner. */
export function keepGeometry(teamHex: number, lib: SurfaceLibrary): BufferGeometry {
  const b = new MeshBuilder(0, P.paintsFor(lib));
  const half = 4.6;
  // A battered plinth.
  b.box(0, 0, 0, half * 2 + 1.4, 1.4, half * 2 + 1.4, P.STONE_DARK);
  b.box(0, 1.4, 0, half * 2, 10.6, half * 2, P.ASHLAR);
  // String courses, the wall-walk and its battlements.
  for (const y of [5.2, 8.6]) b.box(0, y, 0, half * 2 + 0.16, 0.2, half * 2 + 0.16, P.STONE_LIGHT);
  b.box(0, 12, 0, half * 2 + 0.9, 0.5, half * 2 + 0.9, P.STONE_DARK);
  for (let i = 0; i < 6; i++) {
    const t = -half + 0.5 + i * ((half * 2 - 1) / 5);
    for (const [x, z] of [[t, half + 0.2], [t, -half - 0.2], [half + 0.2, t], [-half - 0.2, t]] as const) b.box(x, 12.5, z, 0.9, 1.0, 0.9, P.STONE_LIGHT);
  }
  // A timber roof over the hall within the battlements.
  b.roof(0, 12.5, 0, half * 2 - 1.6, half * 2 - 1.6, 3.0, 2.2, 0.1, 0.14, P.SHINGLE, P.TIMBER);
  // Corner turrets with pointed roofs.
  for (const dx of [-1, 1]) {
    for (const dz of [-1, 1]) {
      b.cylinder(dx * half, 0, dz * half, 1.8, 1.65, 14.4, 10, P.STONE_LIGHT);
      b.cylinder(dx * half, 14.4, dz * half, 2.0, 2.0, 0.3, 10, P.STONE_DARK);
      b.cylinder(dx * half, 14.7, dz * half, 2.2, 0, 4.2, 10, P.SHINGLE);
    }
  }
  // A gate and arrow slits on every face.
  for (let face = 0; face < 4; face++) {
    b.at(0, 0, 0, (face * Math.PI) / 2);
    b.box(0, 1.4, half + 0.05, 2.4, 3.2, 0.2, P.BOARDS_DARK);
    b.box(0, 4.6, half + 0.05, 2.9, 0.34, 0.3, P.STONE_LIGHT);
    for (const x of [-2.4, 2.4]) for (const y of [6.2, 9.4]) b.box(x, y, half + 0.03, 0.22, 1.2, 0.1, P.SOOT);
  }
  b.at(0, 0, 0, 0);
  // The banner.
  b.box(0, 15.2, 0, 0.18, 6.4, 0.18, P.TIMBER);
  b.quad([0.09, 21.4, 0], [0.09, 19.2, 0], [3.6, 19.2, 0], [3.6, 21.4, 0], teamHex);
  b.quad([3.6, 21.4, 0], [3.6, 19.2, 0], [0.09, 19.2, 0], [0.09, 21.4, 0], teamHex);
  return b.build();
}
