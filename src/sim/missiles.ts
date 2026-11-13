import { MISSILE, MORALE, TOWN } from '../config.ts';
import { damageBuilding, wound } from './combat.ts';
import { buildingStands, buildingX, buildingZ } from './movement.ts';
import { isArcher, isEngaged, type Regiment, type Soldier } from './regiment.ts';
import { heightAtM, isForest, townX, townZ } from './terrain.ts';
import { enemyOf, type Side } from './types.ts';
import { findRegiment, type World } from './world.ts';
import { hypot2 } from '../core/hypot.ts';

// Missiles: arrows, crossbow bolts, ballista bolts and trebuchet stones. Each
// is launched at the elevation that carries it to its aim point under gravity
// (no drag: over a hundred metres these lose little speed), flies for its time
// of flight, and hits whoever stands where it lands. A stone is lobbed on the
// steep trajectory and hurts everyone near its fall.

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
  /** Share of the target's armour ignored, and the radius of the fall that hurts (0 = one man). */
  pierce: number;
  splashM: number;
  siegeDamage: number;
  /** For the view: 0 arrow, 1 crossbow bolt, 2 ballista bolt, 3 stone. */
  look: number;
  /** Aimed at a building: the side and plot (-1 = keep); plot -2 means "at soldiers". */
  buildingSide: Side;
  buildingPlot: number;
}

/** What a shot carries, from the unit (or the keep) that looses it. */
interface Shot {
  speedMs: number;
  highArc: boolean;
  damage: number;
  pierce: number;
  splashM: number;
  siegeDamage: number;
  look: number;
}

function shotOf(r: Regiment): Shot {
  const d = r.def;
  const look = d.missileSplashM > 0 ? 3 : d.engine ? 2 : d.missilePierce > 0 ? 1 : 0;
  return { speedMs: d.missileSpeedMs, highArc: d.missileHighArc, damage: d.missileDamage, pierce: d.missilePierce, splashM: d.missileSplashM, siegeDamage: d.missileSiegeDamage, look };
}

const KEEP_SHOT: Shot = { speedMs: MISSILE.arrowSpeedMs, highArc: false, damage: TOWN.keepArrowDamage, pierce: 0, splashM: 0, siegeDamage: 0, look: 0 };

const AT_SOLDIERS = -2;

export function createArrowPool(): Arrow[] {
  const pool: Arrow[] = [];
  for (let i = 0; i < MISSILE.poolSize; i++) {
    pool.push({ active: false, side: 0, x0: 0, y0: 0, z0: 0, vx: 0, vy: 0, vz: 0, ageS: 0, flightS: 0, damage: 0, pierce: 0, splashM: 0, siegeDamage: 0, look: 0, buildingSide: 0, buildingPlot: AT_SOLDIERS });
  }
  return pool;
}

/**
 * Elevation (radians) of a trajectory that reaches a point `distanceM` away and `riseM` higher at
 * launch speed `speedMs`: the flatter of the two, or the steeper when `highArc`; NaN when out of reach.
 */
export function launchElevationRad(distanceM: number, riseM: number, speedMs: number, gravityMs2: number, highArc = false): number {
  if (distanceM <= 0) throw new Error(`launch distance '${distanceM}' must be positive`);
  const v2 = speedMs * speedMs;
  const discriminant = v2 * v2 - gravityMs2 * (gravityMs2 * distanceM * distanceM + 2 * riseM * v2);
  if (discriminant < 0) return Number.NaN;
  const root = Math.sqrt(discriminant);
  return Math.atan((highArc ? v2 + root : v2 - root) / (gravityMs2 * distanceM));
}

/** Height of an arrow above its launch point's datum at its current age. */
export function arrowY(a: Arrow): number {
  return a.y0 + a.vy * a.ageS - 0.5 * MISSILE.gravityMs2 * a.ageS * a.ageS;
}

/** Launches an arrow from the pool; false when the target is out of reach or the pool is full. */
function launch(world: World, side: Side, shot: Shot, x0: number, y0: number, z0: number, tx: number, ty: number, tz: number, buildingSide: Side, buildingPlot: number): boolean {
  const dx = tx - x0;
  const dz = tz - z0;
  const distanceM = hypot2(dx, dz);
  if (distanceM < 0.5) return false;
  const elevation = launchElevationRad(distanceM, ty - y0, shot.speedMs, MISSILE.gravityMs2, shot.highArc);
  if (Number.isNaN(elevation)) return false;
  for (const a of world.arrows) {
    if (a.active) continue;
    const horizontal = shot.speedMs * Math.cos(elevation);
    a.active = true;
    a.side = side;
    a.x0 = x0;
    a.y0 = y0;
    a.z0 = z0;
    a.vx = (dx / distanceM) * horizontal;
    a.vz = (dz / distanceM) * horizontal;
    a.vy = shot.speedMs * Math.sin(elevation);
    a.ageS = 0;
    a.flightS = distanceM / horizontal;
    a.damage = shot.damage;
    a.pierce = shot.pierce;
    a.splashM = shot.splashM;
    a.siegeDamage = shot.siegeDamage;
    a.look = shot.look;
    a.buildingSide = buildingSide;
    a.buildingPlot = buildingPlot;
    world.events.push('arrowShot', x0, z0, side);
    return true;
  }
  return false;
}

/** A stone's fall: everyone of the other side within its radius is hurt, more the nearer the middle. */
function splash(world: World, a: Arrow, x: number, z: number): void {
  for (const r of world.regiments) {
    if (r.side === a.side || r.aliveMen === 0) continue;
    const reach = r.radiusM + a.splashM;
    if ((r.centreX - x) ** 2 + (r.centreZ - z) ** 2 > reach * reach) continue;
    let hurt = false;
    for (const s of r.soldiers) {
      if (!s.alive) continue;
      const d = hypot2(s.x - x, s.z - z);
      if (d > a.splashM) continue;
      hurt = true;
      wound(world, s, a.damage * (1 - d / (a.splashM * 2)) * (1 - r.def.armour * (1 - a.pierce)), a.side, null);
    }
    if (hurt) r.morale -= MORALE.stoneShock;
  }
  world.events.push('stoneFall', x, z, a.side);
}

function land(world: World, a: Arrow): void {
  if (a.buildingPlot !== AT_SOLDIERS) {
    if (buildingStands(world, a.buildingSide, a.buildingPlot)) damageBuilding(world, a.buildingSide, a.buildingPlot, a.siegeDamage);
    if (a.splashM > 0) world.events.push('stoneFall', a.x0 + a.vx * a.flightS, a.z0 + a.vz * a.flightS, a.side);
    return;
  }
  const x = a.x0 + a.vx * a.flightS;
  const z = a.z0 + a.vz * a.flightS;
  if (a.splashM > 0) {
    splash(world, a, x, z);
    return;
  }
  let victim: Soldier | null = null;
  let bestD2 = MISSILE.hitRadiusM * MISSILE.hitRadiusM;
  for (const r of world.regiments) {
    if (r.side === a.side || r.aliveMen === 0) continue;
    const reach = r.radiusM + MISSILE.hitRadiusM + r.def.bodyRadiusM;
    if ((r.centreX - x) ** 2 + (r.centreZ - z) ** 2 > reach * reach) continue;
    for (const s of r.soldiers) {
      if (!s.alive) continue;
      // A bigger body (a horse, an engine) is a bigger target.
      const d2 = Math.max(0, hypot2(s.x - x, s.z - z) - r.def.bodyRadiusM + 0.36) ** 2;
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
  wound(world, victim, a.damage * (1 - r.def.armour * (1 - a.pierce)), a.side, null);
}

/** Nearest enemy regiment whose centre is within range of this one; -1 if none. */
function nearestInRange(world: World, r: Regiment): number {
  let best = -1;
  let bestD2 = r.def.missileRangeM * r.def.missileRangeM;
  for (const other of world.regiments) {
    if (other.side === r.side || other.aliveMen === 0) continue;
    const d2 = (other.centreX - r.centreX) ** 2 + (other.centreZ - r.centreZ) ** 2;
    if (d2 < bestD2 && d2 >= r.def.missileMinRangeM ** 2) {
      best = other.id;
      bestD2 = d2;
    }
  }
  return best;
}

function shootAtRegiment(world: World, r: Regiment, target: Regiment): void {
  const shot = shotOf(r);
  for (const s of r.soldiers) {
    if (!s.alive || s.target || s.attackCooldownS > 0) continue;
    // A random living man of the target: a few tries, then wait for the next step.
    let victim: Soldier | null = null;
    for (let tries = 0; tries < 4 && !victim; tries++) {
      const candidate = target.soldiers[world.rng.int(0, target.soldiers.length - 1)] as Soldier;
      if (candidate.alive) victim = candidate;
    }
    if (!victim) continue;
    const distanceM = hypot2(victim.x - s.x, victim.z - s.z);
    if (distanceM > r.def.missileRangeM * 1.05 || distanceM < r.def.missileMinRangeM) {
      s.attackCooldownS = 0.3;
      continue;
    }
    // Lead a moving man by the time of flight; the aim scatters more at long range. A lobbed stone
    // is in the air far longer than its speed over the ground suggests.
    const elevation = launchElevationRad(distanceM, 0, shot.speedMs, MISSILE.gravityMs2, shot.highArc);
    const flightS = Number.isNaN(elevation) ? 0 : distanceM / (shot.speedMs * Math.cos(elevation));
    const spread = MISSILE.spreadAtRangeM * (1 / 3 + (2 / 3) * Math.min(1, distanceM / r.def.missileRangeM));
    const tx = victim.x + victim.vx * flightS + world.rng.gauss() * spread;
    const tz = victim.z + victim.vz * flightS + world.rng.gauss() * spread;
    const y0 = heightAtM(s.x, s.z) + MISSILE.chestHeightM;
    const ty = heightAtM(tx, tz) + MISSILE.chestHeightM;
    if (launch(world, r.side, shot, s.x, y0, s.z, tx, ty, tz, r.side, AT_SOLDIERS)) {
      s.sinceAttackS = 0;
      s.headingRad = Math.atan2(tx - s.x, tz - s.z);
    }
    s.attackCooldownS = r.def.reloadS * world.rng.range(0.85, 1.15);
  }
}

function shootAtBuilding(world: World, r: Regiment): void {
  const bx = buildingX(world, r.targetSide, r.targetPlot);
  const bz = buildingZ(world, r.targetSide, r.targetPlot);
  const shot = shotOf(r);
  for (const s of r.soldiers) {
    if (!s.alive || s.target || s.attackCooldownS > 0) continue;
    const distanceM = hypot2(bx - s.x, bz - s.z);
    if (distanceM > r.def.missileRangeM || distanceM < r.def.missileMinRangeM) continue;
    const y0 = heightAtM(s.x, s.z) + MISSILE.chestHeightM;
    if (launch(world, r.side, shot, s.x, y0, s.z, bx + world.rng.gauss(), heightAtM(bx, bz) + 3, bz + world.rng.gauss(), r.targetSide, r.targetPlot)) {
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
  launch(world, side, KEEP_SHOT, kx, TOWN.keepTopM, kz, tx, heightAtM(tx, tz) + MISSILE.chestHeightM, tz, side, AT_SOLDIERS);
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
