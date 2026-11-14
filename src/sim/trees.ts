import { FORESTRY, MAP } from '../config.ts';
import { Rng } from '../core/rng.ts';
import { hypot2 } from '../core/hypot.ts';
import { forestCoverAt, heightAtM } from './terrain.ts';

// Every tree on the map, as the rules know them: planted once from the map's seed where the cover
// function says there is forest, so the woods the player sees (forestView.ts draws this same list) are
// the woods a woodcutter fells. Which trees are down, and since when, is part of the world (stands);
// where they grow never changes. A felled tree leaves a stump; the woodcutter plants a sapling by it
// before he carries the wood home, one for every tree he takes, and it grows back into a tree that may
// be felled again.

/** Trees are planted on a jittered grid of this pitch, out to this far beyond the playable square. */
const PITCH_M = 6.5;
export const DECOR_MARGIN_M = 170;

export interface TreeList {
  count: number;
  x: Float32Array;
  z: Float32Array;
  y: Float32Array;
  size: Float32Array;
  /** Height over width, per tree. */
  tall: Float32Array;
  yaw: Float32Array;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  /** 0 pine, 1 broadleaf. */
  species: Uint8Array;
  /** 1 inside the playable square: only these can be felled. */
  inside: Uint8Array;
  /** A roll in [0, 1) for trees outside the square: the Low preset keeps those below 0.5. */
  decor: Float32Array;
}

function plant(): TreeList {
  const rng = new Rng(MAP.terrainSeed + 101);
  const half = MAP.halfM + DECOR_MARGIN_M;
  const out: number[][] = [];
  // The order of the draws is the order forestView.ts always had: the same seed, the same wood.
  for (let gz = -half; gz < half; gz += PITCH_M) {
    for (let gx = -half; gx < half; gx += PITCH_M) {
      const x = gx + rng.range(0.1, 0.9) * PITCH_M;
      const z = gz + rng.range(0.1, 0.9) * PITCH_M;
      const roll = rng.next();
      const pick = rng.next();
      const size = rng.range(0.8, 1.35);
      const yaw = rng.range(0, Math.PI * 2);
      const shade = rng.range(0.82, 1.12);
      const cover = forestCoverAt(x, z);
      const inside = Math.abs(x) < MAP.halfM && Math.abs(z) < MAP.halfM;
      // Dense where the rules say forest; a rare lone tree elsewhere away from the towns.
      const chance = cover > 0.5 ? 0.9 : cover > 0.05 ? cover * 0.5 : 0;
      if (roll >= chance) continue;
      const decor = inside ? 0 : rng.next();
      // Pines gather on the higher ground.
      const species = pick < 0.35 + heightAtM(x, z) * 0.06 ? 0 : 1;
      const tall = rng.range(0.9, 1.2);
      const g = shade * rng.range(0.94, 1.06);
      out.push([x, z, heightAtM(x, z) - 0.15, size, tall, yaw, shade, g, shade * 0.95, species, inside ? 1 : 0, decor]);
    }
  }
  const n = out.length;
  const list: TreeList = {
    count: n,
    x: new Float32Array(n),
    z: new Float32Array(n),
    y: new Float32Array(n),
    size: new Float32Array(n),
    tall: new Float32Array(n),
    yaw: new Float32Array(n),
    r: new Float32Array(n),
    g: new Float32Array(n),
    b: new Float32Array(n),
    species: new Uint8Array(n),
    inside: new Uint8Array(n),
    decor: new Float32Array(n),
  };
  out.forEach((t, i) => {
    [list.x[i], list.z[i], list.y[i], list.size[i], list.tall[i], list.yaw[i], list.r[i], list.g[i], list.b[i]] = t as [number, number, number, number, number, number, number, number, number];
    list.species[i] = t[9] as number;
    list.inside[i] = t[10] as number;
    list.decor[i] = t[11] as number;
  });
  return list;
}

export const TREES: TreeList = plant();

// A grid over the playable square listing the fellable trees in each cell, for "the nearest tree".
const CELL_M = 12;
const CELLS = Math.ceil(MAP.sizeM / CELL_M);
const cellStart = new Int32Array(CELLS * CELLS + 1);
const cellTrees = new Int32Array(TREES.count);
{
  const cellOf = (i: number): number => {
    const cx = Math.min(CELLS - 1, Math.max(0, Math.floor((TREES.x[i] as number) / CELL_M + CELLS / 2)));
    const cz = Math.min(CELLS - 1, Math.max(0, Math.floor((TREES.z[i] as number) / CELL_M + CELLS / 2)));
    return cz * CELLS + cx;
  };
  // A counting sort: how many in each cell, where each cell's run starts, then the runs filled.
  const counts = new Int32Array(CELLS * CELLS);
  for (let i = 0; i < TREES.count; i++) if (TREES.inside[i]) counts[cellOf(i)] = (counts[cellOf(i)] as number) + 1;
  for (let c = 0; c < CELLS * CELLS; c++) cellStart[c + 1] = (cellStart[c] as number) + (counts[c] as number);
  const fill = cellStart.slice(0, CELLS * CELLS);
  for (let i = 0; i < TREES.count; i++) {
    if (!TREES.inside[i]) continue;
    const c = cellOf(i);
    cellTrees[fill[c] as number] = i;
    fill[c] = (fill[c] as number) + 1;
  }
}

/** What has happened to the trees in one game. */
export interface Stand {
  /** When each tree was felled (world seconds); negative while it stands. */
  felledS: Float32Array;
  /** When the sapling by its stump was planted; before `felledS` while only the stump is there. */
  plantedS: Float32Array;
  /** When a woodcutter set out for it; a claim older than FORESTRY.claimS has lapsed. */
  claimedS: Float32Array;
  /** Trees not simply standing (stumps and saplings), for the view to redraw; and a count of changes. */
  changed: Set<number>;
  version: number;
}

export function createStand(): Stand {
  return {
    felledS: new Float32Array(TREES.count).fill(-1),
    plantedS: new Float32Array(TREES.count).fill(-1),
    claimedS: new Float32Array(TREES.count).fill(-1e9),
    changed: new Set(),
    version: 0,
  };
}

/** 0 a bare stump, above 0 a sapling growing, 1 a grown tree. */
export function growthOf(stand: Stand, i: number, nowS: number): number {
  const felled = stand.felledS[i] as number;
  if (felled < 0) return 1;
  const planted = stand.plantedS[i] as number;
  if (planted < felled) return 0;
  return Math.min(1, FORESTRY.saplingShare + (1 - FORESTRY.saplingShare) * ((nowS - planted) / FORESTRY.growS));
}

/**
 * The nearest grown tree no one else is after, within `reachM` of (x, z); -1 if none. Claims it for
 * the woodcutter who asked.
 */
export function claimNearestTree(stand: Stand, x: number, z: number, reachM: number, nowS: number): number {
  let best = -1;
  let bestD = reachM;
  const c0x = Math.max(0, Math.floor((x - reachM) / CELL_M + CELLS / 2));
  const c1x = Math.min(CELLS - 1, Math.floor((x + reachM) / CELL_M + CELLS / 2));
  const c0z = Math.max(0, Math.floor((z - reachM) / CELL_M + CELLS / 2));
  const c1z = Math.min(CELLS - 1, Math.floor((z + reachM) / CELL_M + CELLS / 2));
  for (let cz = c0z; cz <= c1z; cz++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      const c = cz * CELLS + cx;
      for (let k = cellStart[c] as number; k < (cellStart[c + 1] as number); k++) {
        const i = cellTrees[k] as number;
        if (growthOf(stand, i, nowS) < 1) continue;
        if (nowS - (stand.claimedS[i] as number) < FORESTRY.claimS) continue;
        const d = hypot2((TREES.x[i] as number) - x, (TREES.z[i] as number) - z);
        if (d < bestD) {
          best = i;
          bestD = d;
        }
      }
    }
  }
  if (best >= 0) stand.claimedS[best] = nowS;
  return best;
}

/** Brings a tree down: a stump until the woodcutter plants by it. */
export function fellTree(stand: Stand, i: number, nowS: number): void {
  stand.felledS[i] = nowS;
  stand.claimedS[i] = -1e9;
  stand.changed.add(i);
  stand.version += 1;
}

/** A sapling set by the stump of a felled tree. */
export function plantTree(stand: Stand, i: number, nowS: number): void {
  stand.plantedS[i] = nowS;
  stand.version += 1;
}

/** Saplings grown into trees are standing again: off the list of changes. */
export function stepStand(stand: Stand, nowS: number): void {
  for (const i of stand.changed) {
    if (growthOf(stand, i, nowS) >= 1) {
      stand.felledS[i] = -1;
      stand.changed.delete(i);
      stand.version += 1;
    }
  }
}
