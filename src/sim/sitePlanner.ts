import { TOWN } from '../config.ts';
import { checkSite, yawToKeep } from './placement.ts';
import { DEPOSITS, FORWARD_X, FORWARD_Z, forestCoverAt, lakeX, lakeZ, SIDE_X, SIDE_Z, townX, townZ, turnOf } from './terrain.ts';
import { type BuildingKind, type Side, SITE_NEED } from './types.ts';
import type { World } from './world.ts';

// Where the computer builds. A human picks ground with the cursor; the
// computer needs a rule: houses and crafts in rings round its keep, farms
// along a village street a short walk away with their fields running out
// behind them, the woodcutter at the nearest edge of the forest, the fisher on
// the lake, quarry and mine by their rock. Every candidate goes through the
// same check a player's click does (placement.ts), so the computer builds
// nowhere a player could not.

export interface Plan {
  x: number;
  z: number;
  yawRad: number;
}

const plan: Plan = { x: 0, z: 0, yawRad: 0 };

/** Tries one place; true (with `plan` filled) when a building of this kind may stand there, money aside. */
function tryAt(world: World, side: Side, kind: BuildingKind, x: number, z: number, yawRad: number): boolean {
  const result = checkSite(world, side, kind, x, z, yawRad).result;
  // Not being able to pay yet does not make the ground wrong.
  if (result !== 'ok' && result !== 'cannotAfford') return false;
  plan.x = x;
  plan.z = z;
  plan.yawRad = yawRad;
  return true;
}

/** Middle of the village street: towards the enemy and off to one side of the keep. */
const VILLAGE_FORWARD_M = 38;
const VILLAGE_SIDE_M = 52;
const VILLAGE_PITCH_M = 13.5;

function planVillage(world: World, side: Side, kind: BuildingKind): boolean {
  const t = turnOf(side);
  const vx = townX(side) + t * (FORWARD_X * VILLAGE_FORWARD_M + SIDE_X * VILLAGE_SIDE_M);
  const vz = townZ(side) + t * (FORWARD_Z * VILLAGE_FORWARD_M + SIDE_Z * VILLAGE_SIDE_M);
  // Farms on the far side of the street, doors to the street, fields running away behind them; pens and
  // stables on the near side, facing them.
  const far = kind === 'farm';
  const across = far ? 0 : -15;
  const yaw = Math.atan2(t * SIDE_X * (far ? -1 : 1), t * SIDE_Z * (far ? -1 : 1));
  for (let k = 0; k < 7; k++) {
    // From the middle of the street outwards.
    const along = (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * VILLAGE_PITCH_M;
    const x = vx + t * (FORWARD_X * along + SIDE_X * across);
    const z = vz + t * (FORWARD_Z * along + SIDE_Z * across);
    if (tryAt(world, side, kind, x, z, yaw)) return true;
  }
  return false;
}

function planTown(world: World, side: Side, kind: BuildingKind): boolean {
  const tx = townX(side);
  const tz = townZ(side);
  for (let radius = 22; radius <= 100; radius += 13) {
    const count = Math.max(6, Math.floor((2 * Math.PI * radius) / 14));
    for (let k = 0; k < count; k++) {
      const angle = ((k + (radius % 2 === 0 ? 0 : 0.5)) / count) * Math.PI * 2;
      const x = tx + Math.sin(angle) * radius;
      const z = tz + Math.cos(angle) * radius;
      if (tryAt(world, side, kind, x, z, yawToKeep(side, x, z))) return true;
    }
  }
  return false;
}

/** The nearest edges of the forest, found by walking outwards from the keep in every direction. */
function planForest(world: World, side: Side, kind: BuildingKind): boolean {
  const tx = townX(side);
  const tz = townZ(side);
  for (let d = 60; d <= TOWN.territoryRadiusM - 8; d += 4) {
    for (let degrees = 0; degrees < 360; degrees += 8) {
      const dx = Math.sin((degrees * Math.PI) / 180);
      const dz = Math.cos((degrees * Math.PI) / 180);
      const x = tx + dx * d;
      const z = tz + dz * d;
      // Open ground here and thick wood a short walk further out.
      if (forestCoverAt(x, z) > 0.2 || forestCoverAt(x + dx * 16, z + dz * 16) < 0.7) continue;
      if (tryAt(world, side, kind, x, z, yawToKeep(side, x, z))) return true;
    }
  }
  return false;
}

function planLake(world: World, side: Side, kind: BuildingKind): boolean {
  const lx = lakeX(side);
  const lz = lakeZ(side);
  const base = Math.atan2(townX(side) - lx, townZ(side) - lz);
  // Round the shore, starting from the side nearest the keep.
  for (let k = 0; k < 12; k++) {
    const angle = base + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 0.5;
    const r = TOWN.lakeRadiusM + 8;
    const x = lx + Math.sin(angle) * r;
    const z = lz + Math.cos(angle) * r;
    if (tryAt(world, side, kind, x, z, yawToKeep(side, x, z))) return true;
  }
  return false;
}

function planDeposit(world: World, side: Side, kind: BuildingKind, rock: 'stone' | 'ore'): boolean {
  const tx = townX(side);
  const tz = townZ(side);
  const nearestFirst = DEPOSITS.filter((d) => d.kind === rock).sort((a, b) => Math.hypot(a.x - tx, a.z - tz) - Math.hypot(b.x - tx, b.z - tz));
  for (const d of nearestFirst) {
    const base = Math.atan2(tx - d.x, tz - d.z);
    for (let k = 0; k < 9; k++) {
      const angle = base + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 0.6;
      const r = TOWN.depositRadiusM + TOWN.buildingRadiusM + 2;
      const x = d.x + Math.sin(angle) * r;
      const z = d.z + Math.cos(angle) * r;
      if (tryAt(world, side, kind, x, z, yawToKeep(side, x, z))) return true;
    }
  }
  return false;
}

/** A place for a building of this kind, or null when the side's land has none left. The result is reused: copy it to keep it. */
export function planSite(world: World, side: Side, kind: BuildingKind): Plan | null {
  const need = SITE_NEED[kind];
  let found: boolean;
  if (need === 'forest') found = planForest(world, side, kind);
  else if (need === 'water') found = planLake(world, side, kind);
  else if (need === 'stone' || need === 'ore') found = planDeposit(world, side, kind, need);
  else if (kind === 'farm' || kind === 'pigFarm' || kind === 'stable') found = planVillage(world, side, kind) || planTown(world, side, kind);
  else found = planTown(world, side, kind);
  return found ? plan : null;
}
