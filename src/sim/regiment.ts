import { FORMATION, type UnitDef, UNITS, VETERANS } from '../config.ts';
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
  /** When he was last hurt (world time; for the view's flinch). */
  hurtAtS?: number;
  /** Enemy he is fighting, if any. */
  target: Soldier | null;
  /** Counts down to his next look for an enemy. */
  searchS: number;
  /** Seconds since he fell; meaningful once `alive` is false. */
  deadS: number;
  /** Distance walked, for the step animation. */
  strideM: number;
  /** An enemy wall cell he has walked into this step and will batter; -1 none. */
  wallCell: number;
}

export type OrderKind = 'hold' | 'move' | 'attackRegiment' | 'attackBuilding';
export type RegimentState = 'formed' | 'routing';

/** How a regiment stands: a block of ranks, a wedge for a charge (horse), or open order against arrows. */
export type Formation = 'line' | 'wedge' | 'loose';
/** What it does in its formation: nothing special, a shield wall (those with shields), or a pike wall (pikemen). */
export type Stance = 'normal' | 'shields' | 'pikeWall';

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
  /** The kind it is being re-armed as, and the seconds left; null when it is not. */
  rearmTo: UnitKind | null;
  rearmLeftS: number;
  /** The tower (its place in the town's list) it is marching to man; -1 none. */
  garrisonPlot: number;
  /** Men in its front rank as ordered (the ranks follow from the men left); the formation and the stance. */
  files: number;
  formation: Formation;
  stance: Stance;
  /** Shooters pick their own targets (true) or shoot only at what they are ordered to. */
  fireAtWill: boolean;
  /** Seconds since an arrow or bolt last struck one of its men. */
  sinceShotS: number;
  /** Experience: enemies brought down, per man of the regiment as raised (new men dilute it). */
  xp: number;
  /** Marching in a formation of several regiments: no faster than this, so they keep together (0 = own pace). */
  paceCapMs: number;
  /** A way round walls to its goal: way points (x, z pairs), the next one, the goal it leads to, the map's version it was found on, and the clock to the next look. */
  route: number[];
  routeAt: number;
  routeGoalX: number;
  routeGoalZ: number;
  routeVersion: number;
  routeCheckS: number;
  /** Files while it marches in column round walls and through gates (0 = as ordered). */
  marchFiles: number;
  /** Orders given with Shift, carried out one after another once the one in hand is done. */
  queue: QueuedOrder[];
}

/** An order waiting its turn: a march to a point, an attack on a regiment, or on a building (plot -1 = the keep). */
export type QueuedOrder =
  | { kind: 'move'; x: number; z: number; facingRad: number; run: boolean }
  | { kind: 'attackRegiment'; targetId: number }
  | { kind: 'attackBuilding'; side: Side; plot: number };

/** Men in the front rank now: as ordered, or fewer while it marches in column. */
export function filesOf(r: Regiment): number {
  const files = r.marchFiles > 0 ? Math.min(r.files, r.marchFiles) : r.files;
  return Math.min(files, Math.max(1, r.aliveMen));
}

/** 0 green, 1 seasoned, 2 veterans. */
export function veteranRank(r: Regiment): number {
  let rank = 0;
  for (const at of VETERANS.ranksAt) if (r.xp >= at) rank++;
  return rank;
}

/** The captain is the regiment's first man; engines have none to lose. */
export function captainOf(r: Regiment): Soldier | null {
  return r.def.engine ? null : (r.soldiers[0] ?? null);
}

/** True when the regiment still has its captain (always, for an engine). */
export function hasCaptain(r: Regiment): boolean {
  return r.def.engine || (r.soldiers[0]?.alive ?? false);
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

/** A wedge: the point a single rider, each rank behind two wider. Rank of a slot, and its place across. */
function wedgeRank(slot: number): number {
  return Math.floor(Math.sqrt(slot));
}

/** Sideways (in files) and backwards (in ranks) position of a slot. The last, short rank is centred too. */
function slotFile(r: Regiment, slot: number): number {
  if (r.formation === 'wedge') {
    const rank = wedgeRank(slot);
    const first = rank * rank;
    const inRank = Math.min(2 * rank + 1, r.aliveMen - first);
    return slot - first - (inRank - 1) / 2;
  }
  const files = filesOf(r);
  const rank = Math.floor(slot / files);
  const inRank = Math.min(files, r.aliveMen - rank * files);
  return slot - rank * files - (inRank - 1) / 2;
}

function slotRank(r: Regiment, slot: number): number {
  if (r.formation === 'wedge') return wedgeRank(slot);
  return Math.floor(slot / filesOf(r));
}

/** Open order stands the men further apart. */
function spread(r: Regiment): number {
  return r.formation === 'loose' ? FORMATION.looseSpacingFactor : 1;
}

/**
 * World X of a slot for a formation anchored at `anchorX` and facing `facingRad`. Rank 0 is the
 * front; files are centred on the anchor. File axis = (cos f, −sin f), back = −forward.
 */
export function placeX(r: Regiment, slot: number, anchorX: number, facingRad: number): number {
  return anchorX + Math.cos(facingRad) * slotFile(r, slot) * r.def.fileSpacingM * spread(r) - Math.sin(facingRad) * slotRank(r, slot) * r.def.rankSpacingM * spread(r);
}

export function placeZ(r: Regiment, slot: number, anchorZ: number, facingRad: number): number {
  return anchorZ - Math.sin(facingRad) * slotFile(r, slot) * r.def.fileSpacingM * spread(r) - Math.cos(facingRad) * slotRank(r, slot) * r.def.rankSpacingM * spread(r);
}

/** Where a slot is now. */
export function slotX(r: Regiment, slot: number): number {
  return placeX(r, slot, r.anchorX, r.facingRad);
}

export function slotZ(r: Regiment, slot: number): number {
  return placeZ(r, slot, r.anchorZ, r.facingRad);
}

/** Width of the front rank in metres. */
export function frontageM(r: Regiment): number {
  if (r.formation === 'wedge') return 2 * Math.floor(Math.sqrt(Math.max(0, r.aliveMen - 1))) * r.def.fileSpacingM;
  return (filesOf(r) - 1) * r.def.fileSpacingM * spread(r);
}

/** Gives the living their places again, front rank first, after a death or a rally. The captain takes the last place: behind his men. */
export function assignSlots(r: Regiment): void {
  let slot = 0;
  for (let i = 1; i < r.soldiers.length; i++) {
    const s = r.soldiers[i] as Soldier;
    if (s.alive) s.slot = slot++;
  }
  const first = r.soldiers[0];
  if (first?.alive) first.slot = slot;
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
    rearmTo: null,
    rearmLeftS: 0,
    garrisonPlot: -1,
    files: def.files,
    formation: 'line',
    stance: 'normal',
    fireAtWill: true,
    sinceShotS: 999,
    xp: 0,
    paceCapMs: 0,
    route: [],
    routeAt: 0,
    routeGoalX: x,
    routeGoalZ: z,
    routeVersion: -1,
    routeCheckS: 0,
    marchFiles: 0,
    queue: [],
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
      wallCell: -1,
    });
  }
  assignSlots(r);
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
