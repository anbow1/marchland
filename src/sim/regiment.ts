import { type UnitDef, UNITS } from '../config.ts';
import type { Side, UnitKind } from './types.ts';

// A regiment and its soldiers. Orders go to the regiment; every soldier is an
// agent with a place in the formation. Facing is an angle in radians where 0
// looks along +Z and π/2 along +X, so forward = (sin f, cos f).

export interface Soldier {
  regiment: Regiment;
  alive: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  headingRad: number;
  hp: number;
  /** Place in the formation, counted among the living. */
  slot: number;
  /** Seconds until the next blow or shot. */
  attackCooldownS: number;
  /** Seconds since the last blow was struck (drives the swing animation); large when idle. */
  sinceAttackS: number;
  /** Enemy he is fighting, if any. */
  target: Soldier | null;
  /** Counts down to his next look for an enemy. */
  searchS: number;
  /** Seconds since he fell; meaningful once `alive` is false. */
  deadS: number;
  /** Distance walked, for the step animation. */
  strideM: number;
}

export type OrderKind = 'hold' | 'move' | 'attackRegiment' | 'attackBuilding';
export type RegimentState = 'formed' | 'routing';

export interface Regiment {
  id: number;
  side: Side;
  kind: UnitKind;
  def: UnitDef;
  soldiers: Soldier[];
  initialMen: number;
  aliveMen: number;
  /** The formation's reference point (middle of the front rank) and facing. */
  anchorX: number;
  anchorZ: number;
  facingRad: number;
  /** Speed the anchor moved at during the last step. */
  speedMs: number;
  /** Mean position of the living and the radius that holds them all. */
  centreX: number;
  centreZ: number;
  radiusM: number;
  order: OrderKind;
  destX: number;
  destZ: number;
  destFacingRad: number;
  /** Target of an attackRegiment order. */
  targetRegimentId: number;
  /** Target of an attackBuilding order: the side, and the plot (-1 = the keep). */
  targetSide: Side;
  targetPlot: number;
  morale: number;
  state: RegimentState;
  /** A routing regiment that will never rally. */
  shattered: boolean;
  /** Seconds since any of its men gave or took a blow; small means "in melee". */
  sinceMeleeS: number;
  /** Seconds of charge bonus left. */
  chargeLeftS: number;
  /** Seconds since one of its own men last struck a blow, and since it last moved at charging speed. */
  sinceStrikeS: number;
  sinceChargeSpeedS: number;
  /** The enemy regiment it turns to face while fighting without an attack order; -1 none. */
  threatRegimentId: number;
  /** Enemy regiment its archers are shooting at; -1 none. */
  fireTargetId: number;
  fireSearchS: number;
  /** Seconds since the last man fell; the regiment is dropped a while after the last one. */
  sinceLastDeathS: number;
  /** A move order at the run instead of the march. */
  run: boolean;
  /** 0 fresh … 1 exhausted. */
  fatigue: number;
  /** Mean distance of the men from their places, from the last step. */
  lagM: number;
  /** Times it has broken and run. */
  routCount: number;
}

export function forwardX(facingRad: number): number {
  return Math.sin(facingRad);
}

export function forwardZ(facingRad: number): number {
  return Math.cos(facingRad);
}

/** The facing that looks from (x, z) towards (toX, toZ). */
export function facingToward(x: number, z: number, toX: number, toZ: number): number {
  return Math.atan2(toX - x, toZ - z);
}

/** Smallest signed difference a − b, in −π…π. */
export function angleDelta(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** World X of a formation slot. Rank 0 is the front; files are centred on the anchor. */
export function slotX(r: Regiment, slot: number): number {
  const files = Math.min(r.def.files, Math.max(1, r.aliveMen));
  const rank = Math.floor(slot / files);
  // The last, short rank is centred too.
  const inRank = Math.min(files, r.aliveMen - rank * files);
  const file = slot - rank * files - (inRank - 1) / 2;
  // right = (cos f, −sin f), back = −forward
  return r.anchorX + Math.cos(r.facingRad) * file * r.def.fileSpacingM - Math.sin(r.facingRad) * rank * r.def.rankSpacingM;
}

export function slotZ(r: Regiment, slot: number): number {
  const files = Math.min(r.def.files, Math.max(1, r.aliveMen));
  const rank = Math.floor(slot / files);
  const inRank = Math.min(files, r.aliveMen - rank * files);
  const file = slot - rank * files - (inRank - 1) / 2;
  return r.anchorZ - Math.sin(r.facingRad) * file * r.def.fileSpacingM - Math.cos(r.facingRad) * rank * r.def.rankSpacingM;
}

/** Width of the front rank in metres. */
export function frontageM(r: Regiment): number {
  return (Math.min(r.def.files, Math.max(1, r.aliveMen)) - 1) * r.def.fileSpacingM;
}

/** Gives the living their places again, front rank first, after a death or a rally. */
export function assignSlots(r: Regiment): void {
  let slot = 0;
  for (const s of r.soldiers) if (s.alive) s.slot = slot++;
}

export function createRegiment(id: number, side: Side, kind: UnitKind, x: number, z: number, facingRad: number): Regiment {
  const def = UNITS[kind];
  const r: Regiment = {
    id,
    side,
    kind,
    def,
    soldiers: [],
    initialMen: def.men,
    aliveMen: def.men,
    anchorX: x,
    anchorZ: z,
    facingRad,
    speedMs: 0,
    centreX: x,
    centreZ: z,
    radiusM: 1,
    order: 'hold',
    destX: x,
    destZ: z,
    destFacingRad: facingRad,
    targetRegimentId: -1,
    targetSide: side,
    targetPlot: -1,
    morale: def.morale,
    state: 'formed',
    shattered: false,
    sinceMeleeS: 999,
    chargeLeftS: 0,
    sinceStrikeS: 999,
    sinceChargeSpeedS: 999,
    threatRegimentId: -1,
    fireTargetId: -1,
    fireSearchS: 0,
    sinceLastDeathS: 0,
    run: false,
    fatigue: 0,
    lagM: 0,
    routCount: 0,
  };
  for (let i = 0; i < def.men; i++) {
    r.soldiers.push({
      regiment: r,
      alive: true,
      x: 0,
      z: 0,
      vx: 0,
      vz: 0,
      headingRad: facingRad,
      hp: def.hp,
      slot: i,
      attackCooldownS: (i % 7) * 0.2,
      sinceAttackS: 999,
      target: null,
      searchS: (i % 5) * 0.04,
      deadS: 0,
      strideM: i * 0.37,
    });
  }
  for (const s of r.soldiers) {
    s.x = slotX(r, s.slot);
    s.z = slotZ(r, s.slot);
  }
  updateCentre(r);
  return r;
}

/** Recomputes the centroid and bounding radius of the living. */
export function updateCentre(r: Regiment): void {
  if (r.aliveMen === 0) return;
  let sx = 0;
  let sz = 0;
  for (const s of r.soldiers) {
    if (!s.alive) continue;
    sx += s.x;
    sz += s.z;
  }
  r.centreX = sx / r.aliveMen;
  r.centreZ = sz / r.aliveMen;
  let far2 = 0;
  for (const s of r.soldiers) {
    if (!s.alive) continue;
    const d2 = (s.x - r.centreX) ** 2 + (s.z - r.centreZ) ** 2;
    if (d2 > far2) far2 = d2;
  }
  r.radiusM = Math.sqrt(far2) + r.def.bodyRadiusM;
}

/** In melee now or a moment ago. */
export function isEngaged(r: Regiment): boolean {
  return r.sinceMeleeS < 2;
}

export function isArcher(r: Regiment): boolean {
  return r.def.missileRangeM > 0;
}
