import { cellX, cellZ, findRoute, NAV_CELLS_PER_SIDE, freeCellBeside, nearBuilt, blockedBetween, wallCellAt, wallStops } from './nav.ts';
import { reachM } from './missiles.ts';
import { woodStands } from './trees.ts';
import { ARMY, COMBAT, FATIGUE, FORMATION, MAP, TOWN } from '../config.ts';
import { angleDelta, filesOf, frontageM, isArcher, isEngaged, type Regiment, slotX, slotZ, type Soldier, updateCentre } from './regiment.ts';
import { clampToMap, isForest, isWater, lakeRadiusAt, lakeX, lakeZ, offCliff, offRiver, RIVER_CROSSINGS, townX, townZ } from './terrain.ts';
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

/** True while the enemy wall a bombard order is aimed at still stands. */
export function wallStandsAt(world: World, r: Regiment): boolean {
  const cell = wallCellAt(world.nav, r.bombardX, r.bombardZ);
  return cell >= 0 && world.nav.wallSide[cell] !== r.side;
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
  } else if (r.order === 'bombard') {
    if (!wallStandsAt(world, r)) {
      holdHere(r);
      goalX = r.destX;
      goalZ = r.destZ;
      goalFacing = r.destFacingRad;
    } else {
      goalX = r.bombardX;
      goalZ = r.bombardZ;
      faceGoal = true;
      stopDistanceM = reachM(r, goalX, goalZ) * 0.8;
    }
  } else if (r.order === 'hold' && isEngaged(r)) {
    // Fighting without orders: turn to face whoever attacked first.
    const threat = findRegiment(world, r.threatRegimentId);
    if (threat && threat.aliveMen > 0) goalFacing = Math.atan2(threat.centreX - r.anchorX, threat.centreZ - r.anchorZ);
  }

  // Water, rock or a wall in the way: the way round it (a ford, a gap, one of its own gates), one leg at a time, in column.
  const leg = r.order === 'hold' ? null : followRoute(world, r, goalX, goalZ, dtSeconds);
  // The column holds until its tail is through too, then deploys; a fight or a halt deploys it at once.
  if (leg) r.columnLeftM = columnLengthM(r) + 4;
  if (r.order === 'hold' || isEngaged(r)) r.columnLeftM = 0;
  const inColumn = leg !== null || (r.columnLeftM ?? 0) > 0;
  // The way it has come, a point every 2 m (the last 80 m): the column's ranks stand on it, and men behind follow it round water.
  const trail = (r.trail ??= []);
  if (inColumn && r.marchFiles === 0) {
    // Falling into column: it forms up straight behind the head, away from where it is going.
    const toX = (leg ? leg.x : goalX) - r.anchorX;
    const toZ = (leg ? leg.z : goalZ) - r.anchorZ;
    const to = hypot2(toX, toZ) || 1;
    const back = columnLengthM(r) + 6;
    trail.length = 0;
    trail.push(r.anchorX - (toX / to) * back, r.anchorZ - (toZ / to) * back, r.anchorX, r.anchorZ);
  }
  r.marchFiles = inColumn ? ARMY.columnFiles : 0;
  const lastX = trail[trail.length - 2];
  const lastZ = trail[trail.length - 1];
  if (lastX === undefined || lastZ === undefined || hypot2(r.anchorX - lastX, r.anchorZ - lastZ) > 2) {
    trail.push(r.anchorX, r.anchorZ);
    if (trail.length > 80) trail.splice(0, 2);
  }
  // At a ford or a gate another regiment of its side is going through: it waits its turn.
  const waiting = leg !== null && !isEngaged(r) && mustWait(world, r, leg.x, leg.z);
  r.waiting = waiting;
  if (leg) {
    goalX = leg.x;
    goalZ = leg.z;
    stopDistanceM = 0;
    faceGoal = false;
    // Waiting: it stands, facing the crossing.
    if (waiting) {
      faceGoal = true;
      stopDistanceM = hypot2(goalX - r.anchorX, goalZ - r.anchorZ);
    }
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
    if (r.order === 'move' && !leg) {
      r.order = 'hold';
      r.run = false;
    }
  }
  if (!leg && (r.columnLeftM ?? 0) > 0) r.columnLeftM = Math.max(0, (r.columnLeftM ?? 0) - movedM);
  r.speedMs = movedM / dtSeconds;
  r.sinceChargeSpeedS = r.speedMs >= COMBAT.chargeMinSpeedShare * runSpeedMs(r) ? 0 : r.sinceChargeSpeedS + dtSeconds;
  const turnRate = isEngaged(r) ? ARMY.engagedTurnRateRadS : r.def.turnRateRadS;
  const turn = angleDelta(desiredFacing, r.facingRad);
  const maxTurn = turnRate * dtSeconds;
  r.facingRad += Math.min(maxTurn, Math.max(-maxTurn, turn));
  updateFatigue(r, running, dtSeconds);
}

const routeScratch = new Float32Array(2 * 64);

/** Half the width of the regiment's front: in column (three abreast), or as it stands deployed. */
function marchHalfWidthM(r: Regiment, column: boolean): number {
  const files = column ? Math.min(ARMY.columnFiles, Math.max(1, r.aliveMen)) : filesOf(r);
  const across = r.formation === 'wedge' && !column ? frontageM(r) : (files - 1) * r.def.fileSpacingM;
  // A cell and a bit to spare: the water test is on two-metre cells, and men lag a little off their places.
  return across / 2 + r.def.bodyRadiusM + 1.6;
}

/** Length of the regiment in column, front rank to last. */
function columnLengthM(r: Regiment): number {
  const ranks = Math.ceil(Math.max(1, r.aliveMen) / Math.min(ARMY.columnFiles, Math.max(1, r.aliveMen)));
  return (ranks - 1) * r.def.rankSpacingM;
}

/** True when a band `halfW` either side of the straight way crosses water, rock or a wall that stops the side. */
function wideBlocked(nav: World['nav'], side: number, x0: number, z0: number, x1: number, z1: number, halfW: number): boolean {
  if (blockedBetween(nav, side, x0, z0, x1, z1)) return true;
  const d = hypot2(x1 - x0, z1 - z0);
  if (halfW < 0.5 || d < 1e-6) return false;
  const px = -(z1 - z0) / d;
  const pz = (x1 - x0) / d;
  for (const k of halfW > 4 ? [1, -1, 0.5, -0.5] : [1, -1]) {
    const ox = px * halfW * k;
    const oz = pz * halfW * k;
    if (blockedBetween(nav, side, x0 + ox, z0 + oz, x1 + ox, z1 + oz)) return true;
  }
  return false;
}

// ---- taking turns at a crossing ----------------------------------------------
// A ford, the causeway, a gate: one regiment of a side at a time. The others stand back and wait, the nearest
// going next, so columns do not meet in the water or jam in the gateway.

interface Passage {
  x: number;
  z: number;
  radiusM: number;
}

const QUEUE_APPROACH_M = 12;
let passageVersion = -1;
let passageNav: World['nav'] | null = null;
const passageList: Passage[] = [];

function passages(world: World): readonly Passage[] {
  const nav = world.nav;
  if (passageNav === nav && passageVersion === nav.version) return passageList;
  passageNav = nav;
  passageVersion = nav.version;
  passageList.length = 0;
  const crossingR = Math.hypot(MAP.crossingHalfM, MAP.riverHalfWidthM) + 3;
  for (const [x, z] of RIVER_CROSSINGS) passageList.push({ x, z, radiusM: crossingR });
  // Gates: their cells gathered into gateways, each with its middle and reach.
  const seen = new Set<number>();
  const n = NAV_CELLS_PER_SIDE;
  for (let i = 0; i < nav.wallGate.length; i++) {
    if (nav.wallGate[i] !== 1 || seen.has(i)) continue;
    const cells = [i];
    seen.add(i);
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k] as number;
      const cx = c % n;
      const cz = (c / n) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || z < 0 || x >= n || z >= n) continue;
          const j = z * n + x;
          if (nav.wallGate[j] === 1 && !seen.has(j)) {
            seen.add(j);
            cells.push(j);
          }
        }
      }
    }
    let sx = 0;
    let sz = 0;
    for (const c of cells) {
      sx += cellX(c);
      sz += cellZ(c);
    }
    const mx = sx / cells.length;
    const mz = sz / cells.length;
    let far = 0;
    for (const c of cells) far = Math.max(far, hypot2(cellX(c) - mx, cellZ(c) - mz));
    passageList.push({ x: mx, z: mz, radiusM: far + 6 });
  }
  return passageList;
}

/** The point the regiment's way is heading for now, or null when it is not following a way round. */
function legOf(r: Regiment): { x: number; z: number } | null {
  if (r.order === 'hold' || r.routeAt * 2 >= r.route.length) return null;
  return { x: r.route[r.routeAt * 2] as number, z: r.route[r.routeAt * 2 + 1] as number };
}

/** True when the straight way from (x0, z0) to (x1, z1) comes within `radius` of (cx, cz). */
function passesNear(x0: number, z0: number, x1: number, z1: number, cx: number, cz: number, radius: number): boolean {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  const t = len2 < 1e-9 ? 0 : Math.min(1, Math.max(0, ((cx - x0) * dx + (cz - z0) * dz) / len2));
  return hypot2(x0 + dx * t - cx, z0 + dz * t - cz) < radius;
}

/** About to go through a passage: close to it, outside it, and its way leads in. */
function approaching(r: Regiment, p: Passage, legX: number, legZ: number): number {
  const d = hypot2(r.anchorX - p.x, r.anchorZ - p.z);
  if (d < p.radiusM || d > p.radiusM + QUEUE_APPROACH_M) return -1;
  return passesNear(r.anchorX, r.anchorZ, legX, legZ, p.x, p.z, p.radiusM) ? d : -1;
}

/** Going through a passage now: on the move, with men in it. */
function inPassage(r: Regiment, p: Passage): boolean {
  if (r.order === 'hold' || r.waiting || (r.speedMs < 0.05 && r.lagM < 1)) return false;
  if (hypot2(r.centreX - p.x, r.centreZ - p.z) > p.radiusM + r.radiusM) return false;
  for (const s of r.soldiers) if (s.alive && hypot2(s.x - p.x, s.z - p.z) < p.radiusM) return true;
  return false;
}

/** True when the regiment must stand back from a crossing it is about to take: another of its side is going through, or is nearer the front of the queue. */
function mustWait(world: World, r: Regiment, legX: number, legZ: number): boolean {
  for (const p of passages(world)) {
    const mine = approaching(r, p, legX, legZ);
    if (mine < 0) continue;
    for (const o of world.regiments) {
      if (o === r || o.side !== r.side || o.aliveMen === 0 || o.state !== 'formed') continue;
      if (inPassage(o, p)) return true;
      const leg = legOf(o);
      if (!leg) continue;
      const theirs = approaching(o, p, leg.x, leg.z);
      if (theirs >= 0 && (theirs < mine || (theirs === mine && o.id < r.id))) return true;
    }
  }
  return false;
}
const LEG = { x: 0, z: 0 };

/**
 * The next point on a regiment's way to (goalX, goalZ) when water, rock or a wall that stops it lies across
 * the straight line; null when the way is straight (or no way round was found: then it goes straight and batters the
 * wall). Looked at again once a second, at once when the goal moves or the walls change.
 */
function followRoute(world: World, r: Regiment, goalX: number, goalZ: number, dtSeconds: number): { x: number; z: number } | null {
  const nav = world.nav;
  r.routeCheckS -= dtSeconds;
  const moved = hypot2(goalX - r.routeGoalX, goalZ - r.routeGoalZ) > ARMY.routeGoalSlackM;
  const changed = r.routeVersion !== nav.version;
  // How wide a way it needs: a column's, or while it is deployed its whole front (a line does not fit through a gate).
  const halfW = isEngaged(r) ? 0 : marchHalfWidthM(r, r.marchFiles > 0);
  if (r.routeCheckS <= 0 || moved || changed) {
    if (!wideBlocked(nav, r.side, r.anchorX, r.anchorZ, goalX, goalZ, halfW)) {
      r.route.length = 0;
      r.routeCheckS = ARMY.routeCheckS;
      r.routeGoalX = goalX;
      r.routeGoalZ = goalZ;
      r.routeVersion = nav.version;
    } else if (r.route.length === 0 || moved || changed) {
      // The search shares the step's budget with the townspeople: without any left, try again next step.
      if (nav.budget <= 0) return null;
      const n = findRoute(nav, r.side, r.anchorX, r.anchorZ, goalX, goalZ, routeScratch);
      r.route.length = 0;
      // Every way point but the last (the goal itself, reached by the ordinary approach).
      for (let k = 0; k < n - 1; k++) r.route.push(routeScratch[k * 2] as number, routeScratch[k * 2 + 1] as number);
      // Straight on, but too narrow for its front (a gate dead ahead): in column to the goal itself.
      if (n > 0 && r.route.length === 0) r.route.push(goalX, goalZ);
      r.routeAt = 0;
      r.routeGoalX = goalX;
      r.routeGoalZ = goalZ;
      r.routeVersion = nav.version;
      // No way round (walled in, or too far to search): straight at it, and do not search again for a while.
      r.routeCheckS = n === 0 ? ARMY.routeRetryS : ARMY.routeCheckS;
    } else {
      r.routeCheckS = ARMY.routeCheckS;
    }
  }
  const points = r.route.length / 2;
  // Past the way points it has reached, and those it can already see past.
  while (r.routeAt < points) {
    const x = r.route[r.routeAt * 2] as number;
    const z = r.route[r.routeAt * 2 + 1] as number;
    if (hypot2(x - r.anchorX, z - r.anchorZ) < ARMY.routeReachM) {
      r.routeAt++;
      continue;
    }
    const nx = r.routeAt + 1 < points ? (r.route[(r.routeAt + 1) * 2] as number) : goalX;
    const nz = r.routeAt + 1 < points ? (r.route[(r.routeAt + 1) * 2 + 1] as number) : goalZ;
    const colW = marchHalfWidthM(r, true);
    if (!wideBlocked(nav, r.side, r.anchorX, r.anchorZ, nx, nz, colW) && !wideBlocked(nav, r.side, x, z, nx, nz, colW) && hypot2(x - r.anchorX, z - r.anchorZ) < 6) {
      r.routeAt++;
      continue;
    }
    break;
  }
  if (r.routeAt >= points) {
    if (points > 0) r.route.length = 0;
    return null;
  }
  LEG.x = r.route[r.routeAt * 2] as number;
  LEG.z = r.route[r.routeAt * 2 + 1] as number;
  return LEG;
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

/** True when deep water (a lake, the river away from its crossings) lies on the straight way between two points. */
function waterBetween(x0: number, z0: number, x1: number, z1: number): boolean {
  for (const t of [0.2, 0.4, 0.6, 0.8]) if (isWater(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return true;
  return false;
}

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
      // Water between him and his place (the line has turned on the far bank while he is still behind):
      // along the way the regiment came, to the newest point of it he can reach dry, not into the river.
      if (lagM > 3 && r.trail && r.trail.length > 0 && waterBetween(s.x, s.z, placeX, placeZ)) {
        for (let k = r.trail.length - 2; k >= 0; k -= 2) {
          const tx = r.trail[k] as number;
          const tz = r.trail[k + 1] as number;
          if (waterBetween(s.x, s.z, tx, tz)) continue;
          goalX = tx;
          goalZ = tz;
          break;
        }
      }
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
