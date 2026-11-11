import { COMBAT, MISSILE, MORALE, TOWN } from '../config.ts';
import { damageBuilding, wound } from './combat.ts';
import { buildingStands, buildingX, buildingZ } from './movement.ts';
import { isArcher, isEngaged, type Regiment, type Soldier } from './regiment.ts';
import { heightAtM, isForest, townX, townZ } from './terrain.ts';
import { enemyOf, type Side } from './types.ts';
import { findRegiment, type World } from './world.ts';

// Arrows. Each one is launched at the elevation that carries it to its aim
// point under gravity (no drag: over 80 m an arrow loses little speed), flies
// for its time of flight, and hits whoever stands where it lands.

export interface Arrow {
  active: boolean;
  side: Side;
  x0: number;
  y0: number;
  z0: number;
  vx: number;
  vy: number;
  vz: number;
  ageS: number;
  flightS: number;
  damage: number;
  /** Aimed at a building: the side and plot (-1 = keep); plot -2 means "at soldiers". */
  buildingSide: Side;
  buildingPlot: number;
}

const AT_SOLDIERS = -2;

export function createArrowPool(): Arrow[] {
  const pool: Arrow[] = [];
  for (let i = 0; i < MISSILE.poolSize; i++) {
    pool.push({ active: false, side: 0, x0: 0, y0: 0, z0: 0, vx: 0, vy: 0, vz: 0, ageS: 0, flightS: 0, damage: 0, buildingSide: 0, buildingPlot: AT_SOLDIERS });
  }
  return pool;
}

/**
 * Elevation (radians) of the flatter of the two trajectories that reach a point `distanceM` away and
 * `riseM` higher at launch speed `speedMs`; NaN when it is out of reach.
 */
export function launchElevationRad(distanceM: number, riseM: number, speedMs: number, gravityMs2: number): number {
  if (distanceM <= 0) throw new Error(`launch distance '${distanceM}' must be positive`);
  const v2 = speedMs * speedMs;
  const discriminant = v2 * v2 - gravityMs2 * (gravityMs2 * distanceM * distanceM + 2 * riseM * v2);
  if (discriminant < 0) return Number.NaN;
  return Math.atan((v2 - Math.sqrt(discriminant)) / (gravityMs2 * distanceM));
}

/** Height of an arrow above its launch point's datum at its current age. */
export function arrowY(a: Arrow): number {
  return a.y0 + a.vy * a.ageS - 0.5 * MISSILE.gravityMs2 * a.ageS * a.ageS;
}

/** Launches an arrow from the pool; false when the target is out of reach or the pool is full. */
function launch(world: World, side: Side, x0: number, y0: number, z0: number, tx: number, ty: number, tz: number, damage: number, buildingSide: Side, buildingPlot: number): boolean {
  const dx = tx - x0;
  const dz = tz - z0;
  const distanceM = Math.hypot(dx, dz);
  if (distanceM < 0.5) return false;
  const elevation = launchElevationRad(distanceM, ty - y0, MISSILE.arrowSpeedMs, MISSILE.gravityMs2);
  if (Number.isNaN(elevation)) return false;
  for (const a of world.arrows) {
    if (a.active) continue;
    const horizontal = MISSILE.arrowSpeedMs * Math.cos(elevation);
    a.active = true;
    a.side = side;
    a.x0 = x0;
    a.y0 = y0;
    a.z0 = z0;
    a.vx = (dx / distanceM) * horizontal;
    a.vz = (dz / distanceM) * horizontal;
    a.vy = MISSILE.arrowSpeedMs * Math.sin(elevation);
    a.ageS = 0;
    a.flightS = distanceM / horizontal;
    a.damage = damage;
    a.buildingSide = buildingSide;
    a.buildingPlot = buildingPlot;
    world.events.push('arrowShot', x0, z0, side);
    return true;
  }
  return false;
}

function land(world: World, a: Arrow): void {
  if (a.buildingPlot !== AT_SOLDIERS) {
    if (buildingStands(world, a.buildingSide, a.buildingPlot)) damageBuilding(world, a.buildingSide, a.buildingPlot, COMBAT.arrowSiegeDamage);
    return;
  }
  const x = a.x0 + a.vx * a.flightS;
  const z = a.z0 + a.vz * a.flightS;
  let victim: Soldier | null = null;
  let bestD2 = MISSILE.hitRadiusM * MISSILE.hitRadiusM;
  for (const r of world.regiments) {
    if (r.side === a.side || r.aliveMen === 0) continue;
    const reach = r.radiusM + MISSILE.hitRadiusM;
    if ((r.centreX - x) ** 2 + (r.centreZ - z) ** 2 > reach * reach) continue;
    for (const s of r.soldiers) {
      if (!s.alive) continue;
      const d2 = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d2 < bestD2) {
        victim = s;
        bestD2 = d2;
      }
    }
  }
  if (!victim) return;
  const r = victim.regiment;
  const chance = MISSILE.hitChance * (isForest(x, z) ? MISSILE.forestHitFactor : 1) * (1 - r.def.missileBlock);
  if (world.rng.next() >= chance) return;
  r.morale -= MORALE.arrowHitShock;
  world.events.push('arrowHit', x, z, a.side);
  wound(world, victim, a.damage * (1 - r.def.armour), a.side, null);
}

/** Nearest enemy regiment whose centre is within range of this one; -1 if none. */
function nearestInRange(world: World, r: Regiment): number {
  let best = -1;
  let bestD2 = r.def.missileRangeM * r.def.missileRangeM;
  for (const other of world.regiments) {
    if (other.side === r.side || other.aliveMen === 0) continue;
    const d2 = (other.centreX - r.centreX) ** 2 + (other.centreZ - r.centreZ) ** 2;
    if (d2 < bestD2) {
      best = other.id;
      bestD2 = d2;
    }
  }
  return best;
}

function shootAtRegiment(world: World, r: Regiment, target: Regiment): void {
  for (const s of r.soldiers) {
    if (!s.alive || s.target || s.attackCooldownS > 0) continue;
    // A random living man of the target: a few tries, then wait for the next step.
    let victim: Soldier | null = null;
    for (let tries = 0; tries < 4 && !victim; tries++) {
      const candidate = target.soldiers[world.rng.int(0, target.soldiers.length - 1)] as Soldier;
      if (candidate.alive) victim = candidate;
    }
    if (!victim) continue;
    const distanceM = Math.hypot(victim.x - s.x, victim.z - s.z);
    if (distanceM > r.def.missileRangeM * 1.05) {
      s.attackCooldownS = 0.3;
      continue;
    }
    // Lead a moving man by the time of flight; the aim scatters more at long range.
    const flightS = distanceM / (MISSILE.arrowSpeedMs * 0.97);
    const spread = MISSILE.spreadAtRangeM * (1 / 3 + (2 / 3) * Math.min(1, distanceM / r.def.missileRangeM));
    const tx = victim.x + victim.vx * flightS + world.rng.gauss() * spread;
    const tz = victim.z + victim.vz * flightS + world.rng.gauss() * spread;
    const y0 = heightAtM(s.x, s.z) + MISSILE.chestHeightM;
    const ty = heightAtM(tx, tz) + MISSILE.chestHeightM;
    if (launch(world, r.side, s.x, y0, s.z, tx, ty, tz, r.def.missileDamage, r.side, AT_SOLDIERS)) {
      s.sinceAttackS = 0;
      s.headingRad = Math.atan2(tx - s.x, tz - s.z);
    }
    s.attackCooldownS = r.def.reloadS * world.rng.range(0.85, 1.15);
  }
}

function shootAtBuilding(world: World, r: Regiment): void {
  const bx = buildingX(r.targetSide, r.targetPlot);
  const bz = buildingZ(r.targetSide, r.targetPlot);
  for (const s of r.soldiers) {
    if (!s.alive || s.target || s.attackCooldownS > 0) continue;
    if (Math.hypot(bx - s.x, bz - s.z) > r.def.missileRangeM) continue;
    const y0 = heightAtM(s.x, s.z) + MISSILE.chestHeightM;
    if (launch(world, r.side, s.x, y0, s.z, bx + world.rng.gauss(), heightAtM(bx, bz) + 3, bz + world.rng.gauss(), 0, r.targetSide, r.targetPlot)) {
      s.sinceAttackS = 0;
      s.headingRad = Math.atan2(bx - s.x, bz - s.z);
    }
    s.attackCooldownS = r.def.reloadS * world.rng.range(0.85, 1.15);
  }
}

function stepArchers(world: World, r: Regiment, dtSeconds: number): void {
  r.fireSearchS -= dtSeconds;
  if (r.fireSearchS <= 0) {
    r.fireSearchS = 0.5;
    const ordered = r.order === 'attackRegiment' ? findRegiment(world, r.targetRegimentId) : null;
    r.fireTargetId = ordered && ordered.aliveMen > 0 ? ordered.id : r.order === 'attackBuilding' ? -1 : nearestInRange(world, r);
  }
  // Archers shoot standing, and not while someone is at their throats.
  if (isEngaged(r) || r.speedMs > 0.3) return;
  if (r.order === 'attackBuilding' && buildingStands(world, r.targetSide, r.targetPlot)) {
    shootAtBuilding(world, r);
    return;
  }
  const target = findRegiment(world, r.fireTargetId);
  if (target && target.aliveMen > 0) shootAtRegiment(world, r, target);
}

/** The keep's garrison shoots at the nearest enemy in range. */
function stepKeep(world: World, side: Side, dtSeconds: number): void {
  if (world.towns[side].keepHp <= 0) return;
  world.keepShotCooldownS[side] -= dtSeconds;
  if (world.keepShotCooldownS[side] > 0) return;
  const kx = townX(side);
  const kz = townZ(side);
  let victim: Soldier | null = null;
  let bestD2 = TOWN.keepRangeM * TOWN.keepRangeM;
  for (const r of world.regiments) {
    if (r.side !== enemyOf(side) || r.aliveMen === 0) continue;
    const reach = TOWN.keepRangeM + r.radiusM;
    if ((r.centreX - kx) ** 2 + (r.centreZ - kz) ** 2 > reach * reach) continue;
    for (const s of r.soldiers) {
      if (!s.alive) continue;
      const d2 = (s.x - kx) ** 2 + (s.z - kz) ** 2;
      if (d2 < bestD2) {
        victim = s;
        bestD2 = d2;
      }
    }
  }
  if (!victim) {
    // Look again soon, but not every step.
    world.keepShotCooldownS[side] = 0.25;
    return;
  }
  const flightS = Math.sqrt(bestD2) / MISSILE.arrowSpeedMs;
  const tx = victim.x + victim.vx * flightS + world.rng.gauss() * 0.8;
  const tz = victim.z + victim.vz * flightS + world.rng.gauss() * 0.8;
  launch(world, side, kx, TOWN.keepTopM, kz, tx, heightAtM(tx, tz) + MISSILE.chestHeightM, tz, TOWN.keepArrowDamage, side, AT_SOLDIERS);
  world.keepShotCooldownS[side] = TOWN.keepShotIntervalS;
}

export function stepMissiles(world: World, dtSeconds: number): void {
  for (const r of world.regiments) {
    if (r.aliveMen === 0 || r.state !== 'formed' || !isArcher(r)) continue;
    stepArchers(world, r, dtSeconds);
  }
  stepKeep(world, 0, dtSeconds);
  stepKeep(world, 1, dtSeconds);
  for (const a of world.arrows) {
    if (!a.active) continue;
    a.ageS += dtSeconds;
    if (a.ageS >= a.flightS) {
      a.active = false;
      land(world, a);
    }
  }
}
