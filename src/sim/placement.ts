import { FIELDS, GATHER, MAP, TOWN } from '../config.ts';
import { type Building, canAffordBuilding, freePlot, type Site } from './economy.ts';
import { depositNear, DEPOSITS, forestCoverAt, isImpassable, isWater, riseAcrossM, townX, townZ } from './terrain.ts';
import { type BuildingKind, type CommandResult, enemyOf, type Side, SITE_NEED } from './types.ts';
import type { World } from './world.ts';
import { hypot2 } from '../core/hypot.ts';

// Where a building may stand. Anywhere inside a side's reach, on ground that
// is level enough, dry and free — and near what its trade lives on: trees for
// the woodcutter, water for the fisher, rock for quarry and mine, open land
// behind it for a farm's fields.

/** The answer to "may this stand here?": 'ok' with the site filled in, or why not. */
export interface SiteCheck {
  result: CommandResult;
  site: Site;
}

/**
 * How far from its keep a building of this kind may stand. The trades that go where the land is (wood,
 * stone, ore) may go anywhere; farms and vineyards further than the town's own buildings.
 */
export function reachOf(kind: BuildingKind): number {
  const need = SITE_NEED[kind];
  // A watchtower guards whatever needs guarding: an outlying mine as well as the town.
  if (need === 'forest' || need === 'stone' || need === 'ore' || kind === 'tower') return Number.POSITIVE_INFINITY;
  if (need === 'fields') return TOWN.fieldTerritoryRadiusM;
  return TOWN.territoryRadiusM;
}

/** True where a side may lay a road: anywhere on the map but close to the enemy's keep. */
export function mayLayRoadAt(side: Side, x: number, z: number): boolean {
  return hypot2(x - townX(enemyOf(side)), z - townZ(enemyOf(side))) >= TOWN.enemyKeepClearM && Math.abs(x) < MAP.halfM && Math.abs(z) < MAP.halfM;
}

/** Looks outward from a point for the nearest place where `test` holds, within `reachM`; writes it to `out`. */
function findNearby(x: number, z: number, reachM: number, test: (px: number, pz: number) => boolean, out: { x: number; z: number }): boolean {
  for (let r = TOWN.buildingRadiusM; r <= reachM; r += 2) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const px = x + Math.sin(a) * r;
      const pz = z + Math.cos(a) * r;
      if (!test(px, pz)) continue;
      out.x = px;
      out.z = pz;
      return true;
    }
  }
  return false;
}

/** True when a circle of radius `r` at (x, z) would touch a building or a keep of either side, or a farm's land. */
function touchesAnything(world: World, x: number, z: number, r: number): boolean {
  for (const town of world.towns) {
    if (hypot2(x - townX(town.side), z - townZ(town.side)) < TOWN.keepRadiusM + r + TOWN.buildingGapM + 2) return true;
    for (const b of town.plots) {
      if (!b) continue;
      if (hypot2(x - b.x, z - b.z) < TOWN.buildingRadiusM + r + TOWN.buildingGapM) return true;
      for (const strip of b.strips) if (hypot2(x - strip.x, z - strip.z) < FIELDS.stripWidthM / 2 + r) return true;
    }
  }
  return false;
}

const found = { x: 0, z: 0 };

/**
 * Checks a place for a building of `kind` whose door looks along `yawRad`. On 'ok' the returned
 * site holds everything the building needs to know about its ground.
 */
export function checkSite(world: World, side: Side, kind: BuildingKind, x: number, z: number, yawRad: number): SiteCheck {
  const site: Site = { x, z, yawRad, spotX: x, spotZ: z, strips: [] };
  const fail = (result: CommandResult): SiteCheck => ({ result, site });
  const r = TOWN.buildingRadiusM;
  if (hypot2(x - townX(side), z - townZ(side)) > reachOf(kind)) return fail('tooFar');
  if (Math.abs(x) > MAP.halfM - r - 2 || Math.abs(z) > MAP.halfM - r - 2) return fail('tooFar');
  if (hypot2(x - townX(enemyOf(side)), z - townZ(enemyOf(side))) < TOWN.enemyKeepClearM) return fail('tooFar');
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]] as const) if (isImpassable(x + dx, z + dz)) return fail('blocked');
  if (touchesAnything(world, x, z, r)) return fail('blocked');
  // Not on the crag itself: beside it.
  for (const d of DEPOSITS) if (hypot2(x - d.x, z - d.z) < TOWN.depositRadiusM + 3) return fail('blocked');
  if (riseAcrossM(x, z, r) > TOWN.maxFootprintRiseM) return fail('tooSteep');
  const need = SITE_NEED[kind];
  // A woodcutter's hut stands at the edge of the wood, the others in the open.
  if (need !== 'forest' && forestCoverAt(x, z) > 0.5) return fail('blocked');
  if (need === 'forest') {
    if (!findNearby(x, z, TOWN.forestReachM, (px, pz) => forestCoverAt(px, pz) > 0.6, found)) return fail('needsForest');
    // A few steps into the trees from where they begin.
    const d = hypot2(found.x - x, found.z - z) || 1;
    site.spotX = found.x + ((found.x - x) / d) * (GATHER.woodcutter.reachM * 0.4);
    site.spotZ = found.z + ((found.z - z) / d) * (GATHER.woodcutter.reachM * 0.4);
  } else if (need === 'water') {
    if (!findNearby(x, z, TOWN.waterReachM, isWater, found)) return fail('needsWater');
    // He fishes from the bank: a step back from the first water found.
    const d = hypot2(found.x - x, found.z - z) || 1;
    site.spotX = found.x - ((found.x - x) / d) * 1.5;
    site.spotZ = found.z - ((found.z - z) / d) * 1.5;
  } else if (need === 'stone' || need === 'ore') {
    if (!depositNear(need, x, z, TOWN.depositReachM)) return fail(need === 'stone' ? 'needsStone' : 'needsOre');
  } else if (need === 'fields') {
    // The fields run out behind the farm, away from its door.
    for (let k = 0; k < FIELDS.maxStrips; k++) {
      const back = FIELDS.firstStripM + k * (FIELDS.stripWidthM + FIELDS.stripGapM);
      const sx = x - Math.sin(yawRad) * back;
      const sz = z - Math.cos(yawRad) * back;
      // Land that is wet, wooded or taken ends the farm's fields there.
      if (isImpassable(sx, sz) || forestCoverAt(sx, sz) > 0.5 || touchesAnything(world, sx, sz, FIELDS.stripWidthM / 2)) break;
      site.strips.push({ x: sx, z: sz });
    }
    if (site.strips.length < (FIELDS.stripsPerLevel[0] as number)) return fail('needsLand');
  }
  const town = world.towns[side];
  if (freePlot(town) < 0) return fail('townFull');
  if (!canAffordBuilding(town.stock, kind, 1)) return fail('cannotAfford');
  return { result: 'ok', site };
}

/** Where people come and go at a building: just outside its door. */
export function doorOfX(b: Building): number {
  return b.x + Math.sin(b.yawRad) * (TOWN.buildingRadiusM + 0.9);
}

export function doorOfZ(b: Building): number {
  return b.z + Math.cos(b.yawRad) * (TOWN.buildingRadiusM + 0.9);
}

/** The facing that turns a building's door towards its side's keep: the default when a player does not turn it. */
export function yawToKeep(side: Side, x: number, z: number): number {
  return Math.atan2(townX(side) - x, townZ(side) - z);
}
