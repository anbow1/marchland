import { cellX, cellZ, freeCellBeside, nearBuilt, wallCellAt, wallStops } from './nav.ts';
import { reachM } from './missiles.ts';
import { woodStands } from './trees.ts';
import { ARMY, COMBAT, FATIGUE, FORMATION, MAP, TOWN } from '../config.ts';
import { angleDelta, isArcher, isEngaged, type Regiment, slotX, slotZ, type Soldier, updateCentre } from './regiment.ts';
import { clampToMap, isForest, isWater, lakeRadiusAt, lakeX, lakeZ, offCliff, offRiver, townX, townZ } from './terrain.ts';
import type { Side } from './types.ts';
import { findRegiment, type World } from './world.ts';
import { hypot2 } from '../core/hypot.ts';

// Movement: the regiment's anchor walks to its goal and turns; each soldier
// steers to his place in the formation, or to the enemy he is fighting; bodies
// push apart so ranks stay ranks. A hand integrator on the plane instead of a
// physics library: 200 agents, no rigid bodies (BRIEF §11).

/** Uniform grid over the map for neighbour queries; rebuilt every step, no allocation. */
export class SpatialGrid {
  private readonly cellsPerAxis: number;
  private readonly head: Int32Array;
  private readonly next: Int32Array;
  readonly items: (Soldier | null)[] = [];
  count = 0;

  constructor(
    private readonly halfExtentM: number,
    private readonly cellM: number,
    capacity: number,
  ) {
    this.cellsPerAxis = Math.ceil((2 * halfExtentM) / cellM);
    this.head = new Int32Array(this.cellsPerAxis * this.cellsPerAxis);
    this.next = new Int32Array(capacity);
    for (let i = 0; i < capacity; i++) this.items.push(null);
  }

  clear(): void {
    this.head.fill(-1);
    this.count = 0;
  }

  private axisCell(v: number): number {
    const c = Math.floor((v + this.halfExtentM) / this.cellM);
    return c < 0 ? 0 : c >= this.cellsPerAxis ? this.cellsPerAxis - 1 : c;
  }

  insert(s: Soldier): void {
    if (this.count >= this.next.length) throw new Error(`spatial grid holds ${this.next.length} soldiers; a ${this.count + 1}th was added`);
    const cell = this.axisCell(s.z) * this.cellsPerAxis + this.axisCell(s.x);
    const i = this.count++;
    this.items[i] = s;
    this.next[i] = this.head[cell] as number;
    this.head[cell] = i;
  }

  /** Pushes apart every pair of bodies that overlap. */
  separate(): void {
    for (let i = 0; i < this.count; i++) {
      const a = this.items[i] as Soldier;
      const cx = this.axisCell(a.x);
      const cz = this.axisCell(a.z);
      for (let gz = Math.max(0, cz - 1); gz <= Math.min(this.cellsPerAxis - 1, cz + 1); gz++) {
        for (let gx = Math.max(0, cx - 1); gx <= Math.min(this.cellsPerAxis - 1, cx + 1); gx++) {
          for (let j = this.head[gz * this.cellsPerAxis + gx] as number; j >= 0; j = this.next[j] as number) {
            // Each pair once.
            if (j <= i) continue;
            const b = this.items[j] as Soldier;
            const minD = a.regiment.def.bodyRadiusM + b.regiment.def.bodyRadiusM;
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const d2 = dx * dx + dz * dz;
            if (d2 >= minD * minD) continue;
            if (d2 < 1e-6) {
              // Exactly on top of each other: part them along a fixed axis.
              a.x -= minD * 0.5;
              b.x += minD * 0.5;
              continue;
            }
            const d = Math.sqrt(d2);
            const push = ((minD - d) * 0.5) / d;
            a.x -= dx * push;
            a.z -= dz * push;
            b.x += dx * push;
            b.z += dz * push;
          }
        }
      }
    }
  }
}

function terrainSpeedFactor(world: World, r: Regiment, x: number, z: number): number {
  // The wood slows men only where it still stands: a felled stretch is open ground.
  if (!isForest(x, z) || !woodStands(world.stand, x, z)) return 1;
  return r.def.cavalry ? ARMY.forestHorseSpeedFactor : ARMY.forestFootSpeedFactor;
}

export function runSpeedMs(r: Regiment): number {
  return r.def.runSpeedMs * (1 - FATIGUE.runSpeedLoss * r.fatigue);
}

/** Stops the regiment where it stands. */
export function holdHere(r: Regiment): void {
  r.order = 'hold';
  r.destX = r.anchorX;
  r.destZ = r.anchorZ;
  r.destFacingRad = r.facingRad;
  r.targetRegimentId = -1;
  r.run = false;
}

/** Where a building of a side stands; plot -1 is the keep. A building that is gone answers with the keep. */
export function buildingX(world: World, side: Side, plot: number): number {
  return (plot >= 0 ? world.towns[side].plots[plot]?.x : undefined) ?? townX(side);
}

export function buildingZ(world: World, side: Side, plot: number): number {
  return (plot >= 0 ? world.towns[side].plots[plot]?.z : undefined) ?? townZ(side);
}

export function buildingRadiusM(plot: number): number {
  return plot < 0 ? TOWN.keepRadiusM : TOWN.buildingRadiusM;
}

/** True while the target of an attackBuilding order still stands. */
export function buildingStands(world: World, side: Side, plot: number): boolean {
  const town = world.towns[side];
  return plot < 0 ? town.keepHp > 0 : town.plots[plot] !== null && town.plots[plot] !== undefined;
}

function updateFatigue(r: Regiment, running: boolean, dtSeconds: number): void {
  if (isEngaged(r)) r.fatigue += dtSeconds / FATIGUE.meleeSecondsToExhaust;
  else if (running) r.fatigue += dtSeconds / (r.def.cavalry ? FATIGUE.horseRunSecondsToExhaust : FATIGUE.footRunSecondsToExhaust);
  else if (r.speedMs > 0.2) r.fatigue -= dtSeconds / FATIGUE.walkSecondsToRecover;
  else r.fatigue -= dtSeconds / FATIGUE.restSecondsToRecover;
  r.fatigue = Math.min(1, Math.max(0, r.fatigue));
}

function stepAnchor(world: World, r: Regiment, dtSeconds: number): void {
  let goalX = r.destX;
  let goalZ = r.destZ;
  let goalFacing = r.destFacingRad;
  let stopDistanceM = 0;
  let run = r.run;
  let faceGoal = false;

  if (r.order === 'attackRegiment') {
    const target = findRegiment(world, r.targetRegimentId);
    if (!target || target.aliveMen === 0) {
      holdHere(r);
      goalX = r.destX;
      goalZ = r.destZ;
      goalFacing = r.destFacingRad;
      run = false;
    } else {
      goalX = target.centreX;
      goalZ = target.centreZ;
      faceGoal = true;
      const distanceM = hypot2(goalX - r.anchorX, goalZ - r.anchorZ);
      // Archers stop inside range and shoot; everyone else presses into the enemy's ranks.
      // Shooters stop inside their range and shoot: they never close to fight hand to hand (they defend themselves when caught).
      stopDistanceM = isArcher(r) ? reachM(r, target.centreX, target.centreZ) * 0.85 : target.radiusM * 0.4 + 1;
      // Sent to attack, they go at the run (engines cannot); shooters run only to their range.
      run = !r.def.engine;
      void distanceM;
    }
  } else if (r.order === 'attackBuilding') {
    if (!buildingStands(world, r.targetSide, r.targetPlot)) {
      holdHere(r);
      goalX = r.destX;
      goalZ = r.destZ;
      goalFacing = r.destFacingRad;
    } else {
      goalX = buildingX(world, r.targetSide, r.targetPlot);
      goalZ = buildingZ(world, r.targetSide, r.targetPlot);
      faceGoal = true;
      stopDistanceM = isArcher(r) ? reachM(r, goalX, goalZ) * 0.8 : buildingRadiusM(r.targetPlot) + 1.5;
    }
  } else if (r.order === 'hold' && isEngaged(r)) {
    // Fighting without orders: turn to face whoever attacked first.
    const threat = findRegiment(world, r.threatRegimentId);
    if (threat && threat.aliveMen > 0) goalFacing = Math.atan2(threat.centreX - r.anchorX, threat.centreZ - r.anchorZ);
  }

  const dx = goalX - r.anchorX;
  const dz = goalZ - r.anchorZ;
  const distanceM = hypot2(dx, dz);
  let desiredFacing = goalFacing;
  let movedM = 0;
  const running = run && distanceM > stopDistanceM + 0.05;
  // A pike wall stands where it is: it only turns to face.
  if (r.stance === 'pikeWall') stopDistanceM = Math.max(stopDistanceM, distanceM + 1);
  if (distanceM > stopDistanceM + 0.05) {
    let speed = (run ? runSpeedMs(r) : r.def.walkSpeedMs) * terrainSpeedFactor(world, r, r.anchorX, r.anchorZ);
    // Behind a shield wall the ranks shuffle forward.
    if (r.stance === 'shields') speed *= FORMATION.shieldSpeedFactor;
    if (r.lagM > ARMY.cohesionLagM) speed *= ARMY.cohesionSlowFactor;
    // In a formation of several regiments: the pace of the slowest, so the formation keeps its shape.
    if (r.paceCapMs > 0) speed = Math.min(speed, r.paceCapMs * terrainSpeedFactor(world, r, r.anchorX, r.anchorZ));
    // In melee the formation only leans on the enemy; a move order pulls it out of the fight.
    if (isEngaged(r) && r.order !== 'move') speed = Math.min(speed, 0.5);
    movedM = Math.min(speed * dtSeconds, distanceM - stopDistanceM);
    r.anchorX = clampToMap(r.anchorX + (dx / distanceM) * movedM);
    r.anchorZ = clampToMap(r.anchorZ + (dz / distanceM) * movedM);
    // Face the way of travel until the last couple of metres, then the facing that was ordered.
    if (faceGoal || distanceM - stopDistanceM > 2) desiredFacing = Math.atan2(dx, dz);
  } else {
    if (faceGoal && distanceM > 0.01) desiredFacing = Math.atan2(dx, dz);
    if (r.order === 'move') {
      r.order = 'hold';
      r.run = false;
    }
  }
  r.speedMs = movedM / dtSeconds;
  r.sinceChargeSpeedS = r.speedMs >= COMBAT.chargeMinSpeedShare * runSpeedMs(r) ? 0 : r.sinceChargeSpeedS + dtSeconds;
  const turnRate = isEngaged(r) ? ARMY.engagedTurnRateRadS : r.def.turnRateRadS;
  const turn = angleDelta(desiredFacing, r.facingRad);
  const maxTurn = turnRate * dtSeconds;
  r.facingRad += Math.min(maxTurn, Math.max(-maxTurn, turn));
  updateFatigue(r, running, dtSeconds);
}

export function stepAnchors(world: World, dtSeconds: number): void {
  for (const r of world.regiments) {
    r.sinceShotS += dtSeconds;
    if (r.aliveMen === 0 || r.state !== 'formed') continue;
    stepAnchor(world, r, dtSeconds);
  }
}

/** Nearest living enemy within `radiusM` of the soldier and within the leash of his place; null if none. */
function findTarget(world: World, s: Soldier, radiusM: number, placeX: number, placeZ: number): Soldier | null {
  const own = s.regiment;
  // Keep the man he is already fighting while he stays close: no flickering between two enemies.
  const current = s.target;
  if (current && current.alive && (current.x - s.x) ** 2 + (current.z - s.z) ** 2 < (radiusM * 1.2) ** 2) return current;
  let best: Soldier | null = null;
  let bestD2 = radiusM * radiusM;
  for (const other of world.regiments) {
    if (other.side === own.side || other.aliveMen === 0) continue;
    const reach = other.radiusM + radiusM;
    if ((other.centreX - s.x) ** 2 + (other.centreZ - s.z) ** 2 > reach * reach) continue;
    for (const e of other.soldiers) {
      if (!e.alive) continue;
      const d2 = (e.x - s.x) ** 2 + (e.z - s.z) ** 2;
      if (d2 >= bestD2) continue;
      if ((e.x - placeX) ** 2 + (e.z - placeZ) ** 2 > ARMY.leashM * ARMY.leashM) continue;
      best = e;
      bestD2 = d2;
    }
  }
  return best;
}

const OFF_CLIFF = { x: 0, z: 0 };

/** Puts a soldier who has stepped into a lake back on its bank, and one who has climbed onto sheer rock back at its foot. */
function avoidWater(s: Soldier): void {
  if (offCliff(s.x, s.z, OFF_CLIFF) || offRiver(s.x, s.z, OFF_CLIFF)) {
    s.x = OFF_CLIFF.x;
    s.z = OFF_CLIFF.z;
  }
  if (!isWater(s.x, s.z)) return;
  for (const side of [0, 1] as const) {
    const dx = s.x - lakeX(side);
    const dz = s.z - lakeZ(side);
    const d = hypot2(dx, dz);
    const shore = lakeRadiusAt(side, s.x, s.z);
    if (d >= shore || d < 1e-6) continue;
    s.x = lakeX(side) + (dx / d) * shore * 0.94;
    s.z = lakeZ(side) + (dz / d) * shore * 0.94;
  }
}

const OUTLYING_PLOT_M = 160;

/** Keeps a soldier out of the keeps and buildings, sliding him round them. */
function avoidBuildings(world: World, s: Soldier, dtSeconds: number): void {
  // Out in the open (most of the time, and all of a battle in the field) there is nothing to do: the map
  // of built cells says so in nine reads, before any distances to the buildings of both towns.
  if (!nearBuilt(world.nav, s.x, s.z)) return;
  for (const town of world.towns) {
    const tx = townX(town.side);
    const tz = townZ(town.side);
    // The furthest plot (a forest edge) is within this of the keep.
    if ((s.x - tx) ** 2 + (s.z - tz) ** 2 > OUTLYING_PLOT_M ** 2) continue;
    for (let plot = -1; plot < town.plots.length; plot++) {
      if (plot >= 0 && !town.plots[plot]) continue;
      if (plot < 0 && town.keepHp <= 0) continue;
      const bx = buildingX(world, town.side, plot);
      const bz = buildingZ(world, town.side, plot);
      // Walls are a little inside the click radius, so attackers can stand against them.
      const radius = buildingRadiusM(plot) - 0.8;
      const dx = s.x - bx;
      const dz = s.z - bz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      s.x = bx + nx * radius;
      s.z = bz + nz * radius;
      // Slide along the wall the way he was going, so he walks round instead of pushing at it.
      const along = s.vx * -nz + s.vz * nx;
      const slide = (along >= 0 ? 1 : -1) * s.regiment.def.walkSpeedMs * dtSeconds;
      s.x += -nz * slide;
      s.z += nx * slide;
    }
  }
}

function stepSoldier(world: World, s: Soldier, dtSeconds: number): number {
  const r = s.regiment;
  const def = r.def;
  s.sinceAttackS += dtSeconds;
  s.attackCooldownS = Math.max(0, s.attackCooldownS - dtSeconds);
  let goalX: number;
  let goalZ: number;
  let stopM = 0;
  let maxSpeed: number;
  let lagM = 0;

  if (r.state === 'routing') {
    s.target = null;
    goalX = townX(r.side);
    goalZ = townZ(r.side);
    // Gather outside the walls rather than in the keep.
    stopM = TOWN.refugeRadiusM;
    maxSpeed = def.runSpeedMs * 1.1;
  } else {
    const placeX = slotX(r, s.slot);
    const placeZ = slotZ(r, s.slot);
    lagM = hypot2(placeX - s.x, placeZ - s.z);
    s.searchS -= dtSeconds;
    // An engine's crew serves the engine: it never goes looking for a fight.
    if (s.searchS <= 0 && !def.engine) {
      s.searchS = ARMY.targetSearchIntervalS;
      // Archers with something to shoot at only defend themselves at arm's length.
      const shooting = isArcher(r) && r.fireTargetId >= 0 && !isEngaged(r);
      // Men told to march somewhere fight only whoever is in their way.
      const selfDefence = shooting || r.order === 'move';
      const radius = selfDefence ? ARMY.selfDefenceRadiusM : r.order === 'attackRegiment' || isEngaged(r) ? ARMY.engageRadiusAttackingM : ARMY.engageRadiusM;
      s.target = findTarget(world, s, radius, placeX, placeZ);
    }
    if (s.target && !s.target.alive) s.target = null;
    const catchUp = Math.max(r.speedMs, def.walkSpeedMs) * ARMY.catchUpFactor;
    if (s.target) {
      goalX = s.target.x;
      goalZ = s.target.z;
      stopM = (def.reachM + s.target.regiment.def.bodyRadiusM) * 0.85;
      maxSpeed = Math.max(catchUp, def.runSpeedMs * 0.8);
    } else if (r.order === 'attackBuilding' && !isArcher(r) && buildingStands(world, r.targetSide, r.targetPlot) && r.speedMs < 0.1) {
      // The formation has arrived: every man closes on the wall.
      goalX = buildingX(world, r.targetSide, r.targetPlot);
      goalZ = buildingZ(world, r.targetSide, r.targetPlot);
      stopM = buildingRadiusM(r.targetPlot) + def.reachM * 0.5;
      maxSpeed = def.walkSpeedMs * 1.5;
    } else {
      goalX = placeX;
      goalZ = placeZ;
      maxSpeed = catchUp;
    }
  }

  const dx = goalX - s.x;
  const dz = goalZ - s.z;
  const d = hypot2(dx, dz);
  let wantVx = 0;
  let wantVz = 0;
  if (d > stopM + 0.03) {
    // Slow down over the last stretch so he settles on his place instead of circling it.
    const speed = Math.min(maxSpeed * terrainSpeedFactor(world, r, s.x, s.z), (d - stopM) * 5);
    wantVx = (dx / d) * speed;
    wantVz = (dz / d) * speed;
  }
  const accel = (def.cavalry ? ARMY.horseAccelMs2 : ARMY.footAccelMs2) * dtSeconds;
  const dvx = wantVx - s.vx;
  const dvz = wantVz - s.vz;
  const dv = hypot2(dvx, dvz);
  if (dv <= accel || dv < 1e-9) {
    s.vx = wantVx;
    s.vz = wantVz;
  } else {
    s.vx += (dvx / dv) * accel;
    s.vz += (dvz / dv) * accel;
  }
  s.x += s.vx * dtSeconds;
  s.z += s.vz * dtSeconds;
  // A wall stops him where he stands; an enemy's wall he batters (combat.ts).
  s.wallCell = -1;
  const wall = wallCellAt(world.nav, s.x, s.z);
  // His own side's gates let him through.
  if (wall >= 0 && wallStops(world.nav, wall, r.side)) {
    s.x -= s.vx * dtSeconds;
    s.z -= s.vz * dtSeconds;
    s.vx = 0;
    s.vz = 0;
    if (world.nav.wallSide[wall] !== r.side) s.wallCell = wall;
  }
  const speedNow = hypot2(s.vx, s.vz);
  s.strideM += speedNow * dtSeconds;

  let wantHeading = r.facingRad;
  if (s.target) wantHeading = Math.atan2(s.target.x - s.x, s.target.z - s.z);
  else if (speedNow > 0.4) wantHeading = Math.atan2(s.vx, s.vz);
  const turn = angleDelta(wantHeading, s.headingRad);
  const maxTurn = 6 * dtSeconds;
  s.headingRad += Math.min(maxTurn, Math.max(-maxTurn, turn));
  return lagM;
}

export function stepSoldiers(world: World, dtSeconds: number): void {
  const grid = world.grid;
  grid.clear();
  for (const r of world.regiments) {
    let lagSum = 0;
    for (const s of r.soldiers) {
      if (!s.alive) {
        s.deadS += dtSeconds;
        continue;
      }
      lagSum += stepSoldier(world, s, dtSeconds);
      grid.insert(s);
    }
    r.lagM = r.aliveMen > 0 ? lagSum / r.aliveMen : 0;
  }
  grid.separate();
  const limit = MAP.halfM - 1;
  for (const r of world.regiments) {
    if (r.aliveMen === 0) continue;
    for (const s of r.soldiers) {
      if (!s.alive) continue;
      avoidBuildings(world, s, dtSeconds);
      avoidWater(s);
      // Pushed into a wall by the press of his comrades: out to the nearest open cell.
      const wall = wallCellAt(world.nav, s.x, s.z);
      if (wall >= 0 && wallStops(world.nav, wall, r.side)) {
        const free = freeCellBeside(world.nav, wall, r.centreX, r.centreZ);
        if (free >= 0) {
          s.x = cellX(free);
          s.z = cellZ(free);
        }
      }
      s.x = Math.min(limit, Math.max(-limit, s.x));
      s.z = Math.min(limit, Math.max(-limit, s.z));
    }
    updateCentre(r);
  }
}
