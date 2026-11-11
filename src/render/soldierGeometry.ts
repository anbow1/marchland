import { BufferAttribute, type BufferGeometry } from 'three/webgpu';
import type { UnitKind } from '../sim/types.ts';
import { MeshBuilder } from './meshBuilder.ts';

// Soldiers and horses from boxes, true to scale (a man 1.8 m, a horse 1.6 m at
// the withers), facing −Z. Limbs carry a pivot and swing factors per vertex so
// the vertex shader can walk them and strike with them (armyView.ts): one draw
// call per kind of unit, however many men. From 40–260 m a figure is a dozen
// pixels tall; modelled, mocapped bodies replace these in stage 5.
//
// Per vertex: `aPart` = (pivot height, pivot depth, walk swing, attack swing),
// `aSurface` = (metalness, roughness, share of the team colour).

const SKIN = 0xc49a7a;
const TUNIC_BROWN = 0x6e5a41;
const TUNIC_GREEN = 0x4f5a39;
const LEATHER = 0x6b4a2f;
const HOSE = 0x4b4136;
const WOOD = 0x6a5038;
/** Bare steel: metals are bright (PBR sheet, iron F0). */
const STEEL = 0xc4c5c8;
const STRAW = 0xb9a25a;
const HORSE_BAY = 0x5b3f2c;
const HORSE_GREY = 0x8b8780;
const MANE = 0x2e2824;
const WHITE = 0xffffff;

type Part = readonly [pivotY: number, pivotZ: number, walk: number, attack: number];
const BODY: Part = [0, 0, 0, 0];

class Figure {
  readonly b = new MeshBuilder(7);

  private set(part: Part, metal: number, rough: number, team: number): void {
    this.b.extra = [part[0], part[1], part[2], part[3], metal, rough, team];
  }

  cloth(part: Part = BODY): this {
    this.set(part, 0, 0.9, 0);
    return this;
  }

  steel(part: Part = BODY): this {
    this.set(part, 1, 0.42, 0);
    return this;
  }

  /** Painted in the owner's colour: give the vertices white and the shader tints them. */
  team(part: Part = BODY): this {
    this.set(part, 0, 0.7, 1);
    return this;
  }
}

interface Kit {
  tunic: number;
  head: 'none' | 'hat' | 'helmet' | 'hood';
  mail: boolean;
  weapon: 'fork' | 'spear' | 'sword' | 'bow' | 'lance';
  shield: boolean;
}

/** A man standing with his feet at `y0`; `mounted` spreads the legs round a horse. */
function man(f: Figure, kit: Kit, y0: number, mounted: boolean): void {
  const b = f.b;
  const hip = y0 + 0.86;
  const shoulder = y0 + 1.44;
  // Legs: opposite phases.
  const legX = mounted ? 0.36 : 0.11;
  for (const side of [-1, 1]) {
    f.cloth(mounted ? BODY : [hip, 0, side, 0]);
    if (mounted) b.box(side * legX, y0 + 0.25, -0.05, 0.17, 0.7, 0.24, kit.mail ? STEEL : HOSE);
    else b.box(side * legX, y0, 0, 0.17, 0.86, 0.2, HOSE);
  }
  // Torso, with the owner's colour across the shoulders so the side reads from above.
  if (kit.mail) f.steel();
  else f.cloth();
  b.box(0, hip, 0, 0.44, 0.42, 0.27, kit.mail ? STEEL : kit.tunic);
  f.team();
  b.box(0, hip + 0.42, 0, 0.47, 0.2, 0.29, WHITE);
  // Head.
  f.cloth();
  b.box(0, shoulder + 0.06, 0, 0.21, 0.24, 0.22, SKIN);
  if (kit.head === 'helmet') {
    f.steel();
    b.box(0, shoulder + 0.22, 0, 0.26, 0.14, 0.27, STEEL);
    b.box(0, shoulder + 0.2, 0, 0.36, 0.04, 0.37, STEEL);
  } else if (kit.head === 'hat') {
    b.box(0, shoulder + 0.28, 0, 0.42, 0.05, 0.42, STRAW);
    b.box(0, shoulder + 0.33, 0, 0.2, 0.08, 0.2, STRAW);
  } else if (kit.head === 'hood') {
    b.box(0, shoulder + 0.2, 0.02, 0.27, 0.16, 0.28, kit.tunic);
  }
  // Left arm and shield.
  const leftArm: Part = [shoulder, 0, -0.5, 0];
  f.cloth(leftArm);
  b.box(-0.3, shoulder - 0.58, 0, 0.13, 0.58, 0.14, kit.mail ? STEEL : kit.tunic);
  if (kit.shield) {
    f.team([shoulder, 0, -0.15, 0]);
    b.box(-0.36, y0 + 0.78, -0.17, 0.5, 0.72, 0.06, WHITE);
    f.steel([shoulder, 0, -0.15, 0]);
    b.box(-0.36, y0 + 1.07, -0.21, 0.14, 0.14, 0.04, STEEL);
  }
  // Right arm swings forward to strike; the weapon swings down with it.
  f.cloth([shoulder, 0, 0.5, -0.45]);
  b.box(0.3, shoulder - 0.58, 0, 0.13, 0.58, 0.14, kit.mail ? STEEL : kit.tunic);
  const weapon: Part = [shoulder - 0.5, -0.1, 0.12, 1];
  if (kit.weapon === 'spear' || kit.weapon === 'fork' || kit.weapon === 'lance') {
    const length = kit.weapon === 'lance' ? 3.4 : kit.weapon === 'spear' ? 2.6 : 1.9;
    const base = shoulder - 0.5 - length * 0.3;
    f.cloth(weapon);
    b.box(0.33, base, -0.12, 0.05, length, 0.05, WOOD);
    f.steel(weapon);
    if (kit.weapon === 'fork') {
      b.box(0.33, base + length, -0.12, 0.3, 0.04, 0.04, STEEL);
      for (const dx of [-0.13, 0.13]) b.box(0.33 + dx, base + length, -0.12, 0.035, 0.3, 0.035, STEEL);
    } else {
      b.box(0.33, base + length, -0.12, 0.08, 0.32, 0.03, STEEL);
    }
    if (kit.weapon === 'lance') {
      f.team(weapon);
      b.box(0.33, base + length - 0.5, -0.02, 0.02, 0.26, 0.42, WHITE);
    }
  } else if (kit.weapon === 'sword') {
    f.steel(weapon);
    b.box(0.33, shoulder - 0.52, -0.12, 0.05, 0.95, 0.02, STEEL);
    b.box(0.33, shoulder - 0.54, -0.12, 0.2, 0.04, 0.05, STEEL);
  } else {
    // A bow in the left hand, a quiver on the back; the right arm draws.
    f.cloth([shoulder, 0, -0.15, 0]);
    b.box(-0.33, y0 + 0.62, -0.26, 0.04, 1.5, 0.05, WOOD);
    b.box(-0.33, y0 + 0.62, -0.2, 0.012, 1.5, 0.012, STRAW);
    f.cloth();
    b.box(0.1, hip + 0.1, 0.19, 0.14, 0.6, 0.12, LEATHER);
  }
}

function horse(f: Figure, coat: number, caparison: boolean): void {
  const b = f.b;
  const belly = 0.88;
  f.cloth();
  b.box(0, belly, 0, 0.58, 0.66, 2.0, coat);
  // Neck and head, forward (−Z) and up.
  b.box(0, belly + 0.5, -1.0, 0.3, 0.75, 0.42, coat);
  b.box(0, belly + 1.0, -1.38, 0.24, 0.3, 0.62, coat);
  b.box(0, belly + 0.58, -0.84, 0.08, 0.7, 0.12, MANE);
  b.box(0, belly - 0.2, 1.02, 0.1, 0.7, 0.1, MANE);
  if (caparison) {
    f.team();
    b.box(0, belly - 0.12, 0.05, 0.64, 0.84, 1.7, WHITE);
  }
  // Legs trot in diagonal pairs.
  for (const dx of [-1, 1]) {
    for (const dz of [-1, 1]) {
      const z = dz * 0.78;
      f.cloth([belly + 0.05, z, dx * dz, 0]);
      b.box(dx * 0.2, 0, z, 0.15, belly + 0.05, 0.17, coat);
    }
  }
}

const KITS: Record<UnitKind, Kit> = {
  levy: { tunic: TUNIC_BROWN, head: 'hat', mail: false, weapon: 'fork', shield: false },
  spearmen: { tunic: LEATHER, head: 'helmet', mail: false, weapon: 'spear', shield: true },
  archers: { tunic: TUNIC_GREEN, head: 'hood', mail: false, weapon: 'bow', shield: false },
  menAtArms: { tunic: LEATHER, head: 'helmet', mail: true, weapon: 'sword', shield: true },
  lightCavalry: { tunic: LEATHER, head: 'helmet', mail: false, weapon: 'spear', shield: true },
  knights: { tunic: LEATHER, head: 'helmet', mail: true, weapon: 'lance', shield: true },
};

export function soldierGeometry(kind: UnitKind): BufferGeometry {
  const f = new Figure();
  if (kind === 'lightCavalry' || kind === 'knights') {
    horse(f, kind === 'knights' ? HORSE_GREY : HORSE_BAY, kind === 'knights');
    man(f, KITS[kind], 0.72, true);
  } else {
    man(f, KITS[kind], 0, false);
  }
  const g = f.b.build('extra');
  // Split the builder's seven extra values into the two attributes the shader reads.
  const extra = g.getAttribute('extra') as BufferAttribute;
  const part = new Float32Array(extra.count * 4);
  const surface = new Float32Array(extra.count * 3);
  for (let i = 0; i < extra.count; i++) {
    for (let k = 0; k < 4; k++) part[i * 4 + k] = extra.array[i * 7 + k] as number;
    for (let k = 0; k < 3; k++) surface[i * 3 + k] = extra.array[i * 7 + 4 + k] as number;
  }
  g.deleteAttribute('extra');
  g.setAttribute('aPart', new BufferAttribute(part, 4));
  g.setAttribute('aSurface', new BufferAttribute(surface, 3));
  return g;
}
