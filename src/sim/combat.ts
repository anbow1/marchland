import { ARMY, COMBAT, FATIGUE, FOOD, MORALE, TOWN } from '../config.ts';
import { buildingRadiusM, buildingStands, buildingX, buildingZ } from './movement.ts';
import { assignSlots, facingToward, forwardX, forwardZ, isArcher, isEngaged, type Regiment, type Soldier } from './regiment.ts';
import { stampBuilding } from './nav.ts';
import { returnHome } from './people.ts';
import { townX, townZ } from './terrain.ts';
import { enemyOf, type Side } from './types.ts';
import type { World } from './world.ts';

// Melee, damage and morale. A blow lands by chance from attack against
// defence, helped by striking from the side or from behind, by a charge and by
// spears against horsemen; armour takes a share of what lands. Morale falls
// with losses and with blows from where the regiment is not looking; at zero
// the regiment runs for its keep.

/** Removes a soldier from the fight and makes his regiment feel it. */
export function kill(world: World, victim: Soldier, bySide: Side, by: Regiment | null): void {
  const r = victim.regiment;
  victim.alive = false;
  victim.deadS = 0;
  victim.target = null;
  r.aliveMen -= 1;
  r.sinceLastDeathS = 0;
  assignSlots(r);
  r.morale -= MORALE.casualtyShock * (12 / r.initialMen);
  world.towns[r.side].underArms = Math.max(0, world.towns[r.side].underArms - r.def.crew);
  world.towns[bySide].stock.gold += r.def.bounty;
  world.kills[bySide] += 1;
  if (by) by.morale = Math.min(by.def.morale, by.morale + MORALE.killBoost);
  world.events.push('death', victim.x, victim.z, r.side);
}

export function wound(world: World, victim: Soldier, damage: number, bySide: Side, by: Regiment | null): void {
  victim.hp -= damage;
  if (victim.hp <= 0) kill(world, victim, bySide, by);
}

/** Damages a building or a keep; clears the plot when it falls. */
export function damageBuilding(world: World, side: Side, plot: number, damage: number): void {
  const town = world.towns[side];
  if (plot < 0) {
    town.keepHp = Math.max(0, town.keepHp - damage);
    return;
  }
  const b = town.plots[plot];
  if (!b) return;
  b.hp -= damage;
  if (b.hp <= 0) {
    town.plots[plot] = null;
    stampBuilding(world.nav, b.x, b.z, TOWN.buildingRadiusM, false);
    world.events.push('destroyed', b.x, b.z, side);
  }
}

/** Spearmen standing still and facing the blow blunt a charge. */
function isBraced(target: Regiment, frontal: boolean): boolean {
  return frontal && target.def.bonusVsCavalry > 0 && target.state === 'formed' && target.speedMs < 0.5;
}

function strike(world: World, s: Soldier, t: Soldier): void {
  const a = s.regiment;
  const b = t.regiment;
  // Where the blow comes from, relative to the way the target's regiment faces.
  const dx = s.x - t.x;
  const dz = s.z - t.z;
  const d = Math.max(Math.hypot(dx, dz), 1e-6);
  const cos = (dx * forwardX(b.facingRad) + dz * forwardZ(b.facingRad)) / d;
  const frontal = cos >= COMBAT.frontCos;
  let directionBonus = 0;
  let directionShock = 0;
  if (b.state === 'routing') directionBonus = COMBAT.routingHitBonus;
  else if (cos < COMBAT.rearCos) {
    directionBonus = COMBAT.rearHitBonus;
    directionShock = MORALE.rearHitShock;
  } else if (!frontal) {
    directionBonus = COMBAT.flankHitBonus;
    directionShock = MORALE.flankHitShock;
  }

  // A regiment's first blow after coming in at speed is a charge. Judged on its own blows and its own
  // speed a moment ago, so two regiments that charge each other both get it.
  if (a.sinceStrikeS > 2 && a.def.chargeBonus > 0 && a.sinceChargeSpeedS < COMBAT.chargeMemoryS) {
    a.chargeLeftS = COMBAT.chargeSeconds;
    b.morale -= a.def.chargeShock * (isBraced(b, frontal) ? COMBAT.bracedChargeFactor : 1);
    world.events.push('charge', t.x, t.z, a.side);
  }
  a.sinceStrikeS = 0;
  a.sinceMeleeS = 0;
  b.sinceMeleeS = 0;
  if (b.threatRegimentId < 0) b.threatRegimentId = a.id;
  s.sinceAttackS = 0;
  s.attackCooldownS = a.def.attackIntervalS * world.rng.range(0.85, 1.15);

  let attack = a.def.attack - FATIGUE.skillPenalty * a.fatigue;
  if (b.def.cavalry) attack += a.def.bonusVsCavalry;
  let damageFactor = 1;
  if (a.chargeLeftS > 0) {
    const share = isBraced(b, frontal) ? COMBAT.bracedChargeFactor : 1;
    attack += a.def.chargeBonus * share;
    damageFactor += (COMBAT.chargeDamageFactor - 1) * share;
  }
  const defence = (b.def.defence - FATIGUE.skillPenalty * b.fatigue) * (b.state === 'routing' ? COMBAT.routingDefenceFactor : 1);
  const chance = Math.min(COMBAT.maxHitChance, Math.max(COMBAT.minHitChance, COMBAT.baseHitChance + COMBAT.hitChancePerPoint * (attack - defence) + directionBonus));
  if (world.rng.next() >= chance) return;
  b.morale -= directionShock;
  const damage = a.def.damage * damageFactor * (1 - b.def.armour) * world.rng.range(1 - COMBAT.damageSpread, 1 + COMBAT.damageSpread);
  world.events.push('meleeHit', t.x, t.z, a.side);
  wound(world, t, damage, a.side, a);
}

export function stepMelee(world: World): void {
  // Whoever is first in the list strikes first within a step; take turns so neither side always does.
  world.stepCount += 1;
  const n = world.regiments.length;
  for (let k = 0; k < n; k++) {
    const r = world.regiments[world.stepCount % 2 === 0 ? k : n - 1 - k] as Regiment;
    if (r.aliveMen === 0 || r.state !== 'formed' || r.def.engine) continue;
    const sieging = r.order === 'attackBuilding' && !isArcher(r) && buildingStands(world, r.targetSide, r.targetPlot);
    for (const s of r.soldiers) {
      if (!s.alive || s.attackCooldownS > 0) continue;
      const t = s.target;
      if (t && t.alive) {
        const reach = r.def.reachM + t.regiment.def.bodyRadiusM;
        if ((t.x - s.x) ** 2 + (t.z - s.z) ** 2 <= reach * reach) strike(world, s, t);
        continue;
      }
      if (!sieging) continue;
      const bx = buildingX(world, r.targetSide, r.targetPlot);
      const bz = buildingZ(world, r.targetSide, r.targetPlot);
      const reach = buildingRadiusM(r.targetPlot) + r.def.reachM;
      if ((bx - s.x) ** 2 + (bz - s.z) ** 2 > reach * reach) continue;
      s.sinceAttackS = 0;
      s.attackCooldownS = r.def.attackIntervalS * world.rng.range(0.85, 1.15);
      damageBuilding(world, r.targetSide, r.targetPlot, r.def.damage * COMBAT.siegeDamageFactor);
      world.events.push('meleeHit', s.x, s.z, r.side);
    }
  }
}

function enemyNear(world: World, r: Regiment, distanceM: number): boolean {
  for (const other of world.regiments) {
    if (other.side === r.side || other.aliveMen === 0 || other.state !== 'formed') continue;
    const reach = distanceM + other.radiusM;
    if ((other.centreX - r.centreX) ** 2 + (other.centreZ - r.centreZ) ** 2 < reach * reach) return true;
  }
  return false;
}

function rout(world: World, r: Regiment): void {
  r.state = 'routing';
  r.routCount += 1;
  r.shattered = r.aliveMen < r.initialMen * MORALE.shatteredShare || r.routCount >= 3;
  r.order = 'hold';
  r.targetRegimentId = -1;
  r.fireTargetId = -1;
  r.morale = 0;
  r.speedMs = 0;
  for (const s of r.soldiers) s.target = null;
  world.events.push(r.shattered ? 'shattered' : 'rout', r.centreX, r.centreZ, r.side);
  // Panic spreads, and the sight of it cheers the other side.
  for (const other of world.regiments) {
    if (other === r || other.aliveMen === 0 || other.state !== 'formed') continue;
    if ((other.centreX - r.centreX) ** 2 + (other.centreZ - r.centreZ) ** 2 > MORALE.contagionRadiusM ** 2) continue;
    if (other.side === r.side) other.morale -= MORALE.friendRoutShock;
    else other.morale = Math.min(other.def.morale, other.morale + MORALE.enemyRoutBoost);
  }
}

function rally(world: World, r: Regiment): void {
  r.state = 'formed';
  r.anchorX = r.centreX;
  r.anchorZ = r.centreZ;
  r.facingRad = facingToward(r.centreX, r.centreZ, townX(enemyOf(r.side)), townZ(enemyOf(r.side)));
  r.destX = r.anchorX;
  r.destZ = r.anchorZ;
  r.destFacingRad = r.facingRad;
  r.order = 'hold';
  assignSlots(r);
  world.events.push('rally', r.centreX, r.centreZ, r.side);
}

/** Sends the last men of a shattered regiment home for good: they are townspeople again. */
function disband(world: World, r: Regiment): void {
  returnHome(world, r.side, r.aliveMen * r.def.crew, r.centreX, r.centreZ);
  for (const s of r.soldiers) {
    if (!s.alive) continue;
    s.alive = false;
    // Already past the time bodies are shown: they simply leave the field.
    s.deadS = ARMY.bodySeconds;
  }
  r.aliveMen = 0;
  r.sinceLastDeathS = ARMY.bodySeconds;
}

export function stepMorale(world: World, dtSeconds: number): void {
  for (const r of world.regiments) {
    r.sinceLastDeathS += dtSeconds;
    if (r.aliveMen === 0) continue;
    r.sinceMeleeS += dtSeconds;
    r.sinceStrikeS += dtSeconds;
    r.chargeLeftS = Math.max(0, r.chargeLeftS - dtSeconds);
    if (!isEngaged(r)) r.threatRegimentId = -1;
    const town = world.towns[r.side];
    const topMorale = r.def.morale - (town.starving ? FOOD.starvingMoralePenalty : 0);
    if (r.state === 'formed') {
      if (!isEngaged(r)) r.morale += MORALE.recoverPerSecond * dtSeconds;
      r.morale = Math.min(r.morale, topMorale);
      if (r.morale <= 0) rout(world, r);
      continue;
    }
    const safe = !enemyNear(world, r, MORALE.safeFromEnemyM);
    if (safe) r.morale = Math.min(topMorale, r.morale + MORALE.routRecoverPerSecond * dtSeconds);
    if (r.shattered) {
      const homeM = Math.hypot(r.centreX - townX(r.side), r.centreZ - townZ(r.side));
      if (homeM < TOWN.refugeRadiusM + 25) disband(world, r);
    } else if (safe && r.morale >= MORALE.rallyAt) {
      rally(world, r);
    }
  }
  // Drop regiments whose last man fell long enough ago for the bodies to be gone.
  for (let i = world.regiments.length - 1; i >= 0; i--) {
    const r = world.regiments[i] as Regiment;
    if (r.aliveMen === 0 && r.sinceLastDeathS >= ARMY.bodySeconds) world.regiments.splice(i, 1);
  }
}
