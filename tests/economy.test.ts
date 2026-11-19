import { describe, expect, it } from 'vitest';
import { ARMY, BUILDINGS, CHAPEL, LEVEL_COST, MARKET, FIELDS, FOOD, FORESTRY, GATE, GATHER, TRANSPORT, KEEP_LEVELS, KEEP_UPGRADE_SECONDS, PAY, PEOPLE, REARM, REINFORCE, ROADS, TOWER, TOWN, UNITS, VINES, WINE } from '../src/config.ts';
import { cmdAttackBuilding, cmdAttackRegiment, cmdBombard, cmdBuild, cmdTrade, cmdTurnSite, lotPrice, cmdBuildGate, cmdBuildRoad, cmdBuildWall, cmdGarrison, cmdMove, cmdMoveGroup, cmdOrder, cmdOrderRegiments, cmdRearm, cmdRecruit, cmdReinforce, cmdUngarrison, cmdUpgradeTransport, cmdUpgrade, cmdUpgradeKeep, rearmCost, roadCost, wallCost } from '../src/sim/commands.ts';
import { kill, topMorale } from '../src/sim/combat.ts';
import { hasCaptain } from '../src/sim/regiment.ts';
import { buildingCost, carryCapacity, ordersFilled, wantedForOrders, workState } from '../src/sim/economy.ts';
import { grownTreesNear } from '../src/sim/trees.ts';
import { barracksLevel, createTown, housingCapacity, isBuilt, keepRationDemandPerSecond, stepEconomy, type Town } from '../src/sim/economy.ts';
import { findPath, isRoad, wallCellAt } from '../src/sim/nav.ts';
import { freePeople } from '../src/sim/people.ts';
import { checkSite } from '../src/sim/placement.ts';
import { planSite } from '../src/sim/sitePlanner.ts';
import { DEPOSITS, forestCoverAt, isWater, lakeX, lakeZ, townX, townZ } from '../src/sim/terrain.ts';
import { claimNearestTree, createStand, fellTree, growthOf, plantTree, stepStand, TREES, woodStands } from '../src/sim/trees.ts';
import { type BuildingKind, COMPUTER, KEEP, PLAYER } from '../src/sim/types.ts';
import { createWorld, menAlive, spawnRegiment, type World } from '../src/sim/world.ts';
import { run, runUntil } from './helpers.ts';

function quietWorld(): World {
  return createWorld({ seed: 1, difficulty: 'normal', computerPlays: false });
}

function rich(world: World): World {
  const stock = world.towns[PLAYER].stock;
  stock.gold = 5000;
  stock.wood = 1000;
  stock.stone = 1000;
  stock.bread = 300;
  stock.planks = 500;
  return world;
}

/** Builds a building of `kind` where the computer's planner would, for the player; returns its place in the list. */
function build(world: World, kind: BuildingKind): number {
  const site = planSite(world, PLAYER, kind);
  if (!site) throw new Error(`no ground for a ${kind}`);
  const { x, z, yawRad } = site;
  expect(cmdBuild(world, PLAYER, kind, x, z, yawRad)).toBe('ok');
  return world.towns[PLAYER].plots.findIndex((b) => b !== null && b.x === x && b.z === z);
}

function finished(world: World, plot: number): boolean {
  const b = world.towns[PLAYER].plots[plot];
  return b !== null && b !== undefined && isBuilt(b);
}

describe('placement', () => {
  const world = quietWorld();
  rich(world);
  const tx = townX(PLAYER);
  const tz = townZ(PLAYER);

  it('a building goes on free, level, dry ground within reach of its keep', () => {
    expect(checkSite(world, PLAYER, 'house', tx + 20, tz - 20, 0).result).toBe('ok');
    expect(checkSite(world, PLAYER, 'house', tx, tz, 0).result).toBe('blocked');
    expect(checkSite(world, PLAYER, 'house', tx + TOWN.territoryRadiusM + 10, tz, 0).result).toBe('tooFar');
    expect(checkSite(world, PLAYER, 'house', townX(COMPUTER), townZ(COMPUTER) + 30, 0).result).toBe('tooFar');
    expect(isWater(lakeX(PLAYER), lakeZ(PLAYER))).toBe(true);
    expect(checkSite(world, PLAYER, 'house', lakeX(PLAYER), lakeZ(PLAYER), 0).result).toBe('blocked');
  });

  it('trades that live on the land must stand by it', () => {
    expect(checkSite(world, PLAYER, 'fisher', tx + 20, tz - 20, 0).result).toBe('needsWater');
    expect(checkSite(world, PLAYER, 'quarry', tx + 20, tz - 20, 0).result).toBe('needsStone');
    expect(checkSite(world, PLAYER, 'ironMine', tx + 20, tz - 20, 0).result).toBe('needsOre');
    expect(checkSite(world, PLAYER, 'woodcutter', tx + 20, tz - 20, 0).result).toBe('needsForest');
    for (const kind of ['fisher', 'quarry', 'ironMine', 'woodcutter', 'farm'] as const) {
      const site = planSite(world, PLAYER, kind);
      expect(site, kind).not.toBeNull();
    }
    const stone = DEPOSITS.find((d) => d.kind === 'stone' && Math.hypot(d.x - tx, d.z - tz) < 80);
    expect(stone).toBeDefined();
  });

  it("a farm's fields lie behind it and nothing may be built on them", () => {
    const w = rich(quietWorld());
    const plot = build(w, 'farm');
    const farm = w.towns[PLAYER].plots[plot];
    if (!farm) throw new Error('no farm');
    expect(farm.strips.length).toBeGreaterThanOrEqual(FIELDS.stripsPerLevel[0] as number);
    const strip = farm.strips[0];
    if (!strip) throw new Error('no strip');
    // Behind: on the far side from the door.
    const doorX = Math.sin(farm.yawRad);
    const doorZ = Math.cos(farm.yawRad);
    expect((strip.x - farm.x) * doorX + (strip.z - farm.z) * doorZ).toBeLessThan(0);
    expect(checkSite(w, PLAYER, 'house', strip.x, strip.z, 0).result).toBe('blocked');
  });
});

describe('a living town', () => {
  it('builders raise a house only once carriers have brought its timber from the keep', () => {
    const world = rich(quietWorld());
    const woodBefore = world.towns[PLAYER].stock.wood;
    const plot = build(world, 'house');
    const house = world.towns[PLAYER].plots[plot];
    if (!house) throw new Error('no house');
    // Paid at once, but the timber still lies at the keep, set aside for the site.
    expect(world.towns[PLAYER].stock.wood).toBe(woodBefore - 10);
    expect(house.matDelivered).toBe(0);
    const seconds = runUntil(world, 240, () => finished(world, plot));
    expect(finished(world, plot)).toBe(true);
    expect(house.matDelivered).toBe(house.matTotal);
    expect(seconds).toBeGreaterThan(5);
  });

  it('a farmer breaks, sows and reaps his strips, and the grain reaches the keep', () => {
    const world = rich(quietWorld());
    const plot = build(world, 'farm');
    runUntil(world, 600, () => world.towns[PLAYER].stock.grain > 0);
    const farm = world.towns[PLAYER].plots[plot];
    if (!farm) throw new Error('no farm');
    // A whole harvest: what reached the keep, what is still in the yard, and what is on carriers' backs.
    let carried = 0;
    for (const p of world.people) if (p.alive && p.side === PLAYER && p.errand !== 'none' && p.good === 'grain') carried += p.amount;
    expect(world.towns[PLAYER].stock.grain).toBeGreaterThan(0);
    expect(world.towns[PLAYER].stock.grain + farm.out.grain + carried).toBeGreaterThanOrEqual(FIELDS.grainPerHarvest);
    expect(farm.strips.some((s) => s.state !== 'wild')).toBe(true);
  });

  it('a storehouse is a second store: carriers take goods to whichever store is nearer, from one stock', () => {
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    // A farm and a storehouse next to it: the farm's grain goes to the storehouse, not the far keep.
    const farm = build(world, 'farm');
    const f = town.plots[farm];
    if (!f) throw new Error('no farm');
    const site = planSite(world, PLAYER, 'storehouse');
    if (!site) throw new Error('no ground for a storehouse');
    expect(cmdBuild(world, PLAYER, 'storehouse', site.x, site.z, site.yawRad)).toBe('ok');
    const store = town.plots.findIndex((b) => b !== null && b.kind === 'storehouse');
    runUntil(world, 900, () => finished(world, store) && finished(world, farm));
    const before = town.stock.grain;
    f.out.grain = 12;
    let carriedTo = -99;
    runUntil(world, 300, () => {
      for (const p of world.people) if (p.alive && p.side === PLAYER && p.errand === 'clear' && p.good === 'grain') carriedTo = p.dst;
      return town.stock.grain > before;
    });
    expect(town.stock.grain).toBeGreaterThan(before);
    const keepM = Math.hypot(townX(PLAYER) - f.x, townZ(PLAYER) - f.z);
    const s = town.plots[store];
    if (!s) throw new Error('no storehouse');
    const storeM = Math.hypot(s.x - f.x, s.z - f.z);
    // To the nearer of the two.
    expect(carriedTo).toBe(storeM < keepM ? store : KEEP);
    // A storehouse makes nothing and needs no worker.
    expect(workState(s)).toBe('working');
  });

  it('the town always keeps four carriers: workshops beyond its hands wait for a worker', () => {
    const world = rich(quietWorld());
    for (const kind of ['quarry', 'windmill', 'bakery', 'pigFarm', 'butcher', 'tannery', 'fletcher', 'smelter', 'smithy', 'farm', 'fisher', 'woodcutter'] as const) {
      const site = planSite(world, PLAYER, kind);
      if (site) cmdBuild(world, PLAYER, kind, site.x, site.z, site.yawRad);
    }
    let fewest = Number.POSITIVE_INFINITY;
    for (let s = 0; s < 600; s++) {
      run(world, 1);
      let carriers = 0;
      for (const p of world.people) if (p.alive && p.side === PLAYER && p.role === 'carrier') carriers++;
      fewest = Math.min(fewest, carriers);
    }
    expect(fewest).toBeGreaterThanOrEqual(PEOPLE.minCarriers);
  });

  it('a building may be turned while it goes up, its fields with it, and not once it stands', () => {
    const world = rich(quietWorld());
    const plot = build(world, 'farm');
    const farm = world.towns[PLAYER].plots[plot];
    if (!farm) throw new Error('no farm');
    const yaw = farm.yawRad;
    const strip = farm.strips[0] ? { x: farm.strips[0].x, z: farm.strips[0].z } : null;
    let result = cmdTurnSite(world, PLAYER, plot, 2);
    // Turned a quarter, or refused because the land that way is taken: either way the rule held.
    if (result === 'ok') {
      expect(farm.yawRad).toBeCloseTo(yaw + Math.PI / 2, 6);
      if (strip && farm.strips[0]) expect(Math.hypot(farm.strips[0].x - strip.x, farm.strips[0].z - strip.z)).toBeGreaterThan(1);
    } else expect(['blocked', 'needsLand', 'tooSteep', 'tooFar']).toContain(result);
    runUntil(world, 900, () => finished(world, plot));
    result = cmdTurnSite(world, PLAYER, plot, 1);
    expect(result).toBe('alreadyBuilt');
  });

  it('a forester and a hunter stand on open ground by the woods, where a woodcutter needs more trees', () => {
    const world = createWorld({ seed: 1, difficulty: 'normal', computerPlays: false });
    // Open meadow 30–38 m from the nearest woods, within the keep's reach.
    const woodsWithin = (x: number, z: number, m: number): boolean => {
      for (let a = 0; a < 24; a++) for (let d = 4; d <= m; d += 4) if (forestCoverAt(x + Math.cos((a * Math.PI) / 12) * d, z + Math.sin((a * Math.PI) / 12) * d) > 0.6) return true;
      return false;
    };
    let spot: [number, number] | null = null;
    for (let r = 40; r < 200 && !spot; r += 6) {
      for (let a = 0; a < 48 && !spot; a++) {
        const x = townX(PLAYER) + Math.cos((a * Math.PI) / 24) * r;
        const z = townZ(PLAYER) + Math.sin((a * Math.PI) / 24) * r;
        if (forestCoverAt(x, z) < 0.2 && !woodsWithin(x, z, 28) && woodsWithin(x, z, 38) && checkSite(world, PLAYER, 'house', x, z, 0).result === 'ok') spot = [x, z];
      }
    }
    expect(spot).not.toBeNull();
    if (!spot) return;
    expect(checkSite(world, PLAYER, 'forester', spot[0], spot[1], 0).result).toBe('ok');
    expect(checkSite(world, PLAYER, 'hunter', spot[0], spot[1], 0).result).toBe('ok');
    expect(checkSite(world, PLAYER, 'woodcutter', spot[0], spot[1], 0).result).toBe('needsForest');
  });

  it('a hunter brings meat and hides from the woods; a forester brings the saplings on sooner', () => {
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    const hunter = build(world, 'hunter');
    runUntil(world, 600, () => finished(world, hunter) && (town.plots[hunter]?.out.meat ?? 0) + town.stock.meat > 0);
    const h = town.plots[hunter];
    if (!h) throw new Error('no hunter');
    expect(h.out.meat + town.stock.meat).toBeGreaterThan(0);
    expect(h.out.hide + town.stock.hide).toBeGreaterThan(0);

    // A woodcutter fells and plants; with a forester beside him more wood grows back.
    const grownBy = (withForester: boolean): number => {
      const w = rich(quietWorld());
      const cutter = w.towns[PLAYER].plots[build(w, 'woodcutter')];
      if (!cutter) throw new Error('no woodcutter');
      if (withForester) {
        // Beside the woodcutter, on the side of his woods: the first free ground round his hut, nearest that way first.
        const toWoods = Math.atan2(cutter.spotX - cutter.x, cutter.spotZ - cutter.z);
        let placed = false;
        for (let r = 14; r <= 40 && !placed; r += 4) {
          for (let k = 0; k < 16 && !placed; k++) {
            const a = toWoods + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * ((Math.PI * 2) / 16);
            placed = cmdBuild(w, PLAYER, 'forester', cutter.x + Math.sin(a) * r, cutter.z + Math.cos(a) * r, 0) === 'ok';
          }
        }
        expect(placed).toBe(true);
      }
      run(w, 900);
      // How much of the felled wood has grown back: every tree felled (eight logs each) less what its
      // sapling still lacks. The forester plants by bare stumps and brings the saplings on.
      let wood = w.towns[PLAYER].made.wood / GATHER.woodcutter.amount;
      for (const i of w.stand.changed) wood -= 1 - growthOf(w.stand, i, w.timeS);
      return wood;
    };
    expect(grownBy(true)).toBeGreaterThan(grownBy(false));
  });

  it('a sawmill saws timber into planks, and a second level asks half its timber as planks', () => {
    expect(buildingCost('farm', 1, 'planks')).toBe(0);
    const timber2 = buildingCost('farm', 2, 'wood') + buildingCost('farm', 2, 'planks');
    expect(buildingCost('farm', 2, 'planks')).toBeGreaterThan(0);
    expect(Math.abs(buildingCost('farm', 2, 'planks') - buildingCost('farm', 2, 'wood'))).toBeLessThanOrEqual(1);
    expect(timber2).toBe(buildingCost('farm', 1, 'wood') * 0 + Math.round((BUILDINGS.farm.cost.wood ?? 0) * (LEVEL_COST[1] as number)));
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    town.stock.planks = 0;
    const saw = build(world, 'sawmill');
    runUntil(world, 900, () => finished(world, saw) && town.stock.planks + (town.plots[saw]?.out.planks ?? 0) >= 4);
    expect(town.stock.planks + (town.plots[saw]?.out.planks ?? 0)).toBeGreaterThanOrEqual(4);
  });

  it('a market sells ten of a good for little gold and buys ten for much more, and only once it stands', () => {
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    expect(cmdTrade(world, PLAYER, 'wood', false)).toBe('needsMarket');
    const market = build(world, 'market');
    runUntil(world, 900, () => finished(world, market));
    const gold = town.stock.gold;
    const wood = town.stock.wood;
    expect(cmdTrade(world, PLAYER, 'wood', false)).toBe('ok');
    expect(town.stock.wood).toBe(wood - MARKET.lot);
    expect(town.stock.gold).toBe(gold + lotPrice('wood', false));
    expect(cmdTrade(world, PLAYER, 'wood', true)).toBe('ok');
    expect(town.stock.wood).toBe(wood);
    // A round trip always loses gold.
    expect(town.stock.gold).toBeLessThan(gold);
    expect(cmdTrade(world, PLAYER, 'gold', true)).not.toBe('ok');
  });

  it('a chapel lifts every regiment\'s heart; a brewery and a tavern turn grain into gold', () => {
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    const r = spawnRegiment(world, PLAYER, 'pikemen', townX(PLAYER) + 30, townZ(PLAYER) - 30, 0);
    const before = topMorale(world, r);
    const chapel = build(world, 'chapel');
    runUntil(world, 900, () => finished(world, chapel));
    expect(topMorale(world, r)).toBe(before + CHAPEL.morale);

    town.stock.grain = 200;
    const gold0 = town.stock.gold;
    const brewery = build(world, 'brewery');
    const tavern = build(world, 'tavern');
    runUntil(world, 1200, () => finished(world, brewery) && finished(world, tavern) && (town.plots[tavern]?.out.gold ?? 0) + town.stock.gold > gold0 + 40);
    const made = town.made.ale ?? 0;
    expect(made).toBeGreaterThan(0);
  });

  it('houses by a well take in newcomers sooner', () => {
    const growAt = (withWell: boolean): number => {
      const world = rich(quietWorld());
      const house = build(world, 'house');
      const h = world.towns[PLAYER].plots[house];
      if (!h) throw new Error('no house');
      if (withWell) {
        let placed = false;
        for (let r = 12; r <= 30 && !placed; r += 3) for (let k = 0; k < 16 && !placed; k++) {
          const a = (k / 16) * Math.PI * 2;
          placed = cmdBuild(world, PLAYER, 'well', h.x + Math.sin(a) * r, h.z + Math.cos(a) * r, 0) === 'ok';
        }
        expect(placed).toBe(true);
      }
      runUntil(world, 900, () => finished(world, house));
      const t0 = world.timeS;
      runUntil(world, 900, () => (world.towns[PLAYER].plots[house]?.residents ?? 0) >= 2);
      return world.timeS - t0;
    };
    expect(growAt(true)).toBeLessThan(growAt(false));
  });

  it('a bakery bakes only the flour carriers bring it', () => {
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    town.stock.bread = 0;
    town.stock.flour = 0;
    const plot = build(world, 'bakery');
    runUntil(world, 240, () => finished(world, plot));
    run(world, 30);
    const bakery = town.plots[plot];
    if (!bakery) throw new Error('no bakery');
    expect(bakery.out.bread + town.stock.bread).toBe(0);
    town.stock.flour = 30;
    run(world, 120);
    expect(bakery.out.bread + town.stock.bread + bakery.inp.flour).toBeGreaterThan(5);
  });

  it('a mill grinds grain to flour, and a smelter makes iron from ore and timber', () => {
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    const mill = build(world, 'windmill');
    const smelter = build(world, 'smelter');
    runUntil(world, 300, () => finished(world, mill) && finished(world, smelter));
    town.stock.grain = 30;
    town.stock.ironOre = 30;
    run(world, 150);
    const flour = town.stock.flour + (town.plots[mill]?.out.flour ?? 0);
    const iron = town.stock.iron + (town.plots[smelter]?.out.iron ?? 0);
    expect(flour).toBeGreaterThan(4);
    expect(iron).toBeGreaterThan(4);
  });

  it('woodcutters and fishers go out to the land and come back with loads', () => {
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    town.stock.wood = 1000;
    const cutter = build(world, 'woodcutter');
    const fisher = build(world, 'fisher');
    town.stock.bread = 300;
    runUntil(world, 600, () => {
      const c = town.plots[cutter];
      const f = town.plots[fisher];
      return c !== null && c !== undefined && f !== null && f !== undefined && c.out.wood > 0 && f.out.fish + town.stock.fish > 0;
    });
    expect((town.plots[cutter]?.out.wood ?? 0) + 0).toBeGreaterThan(0);
    expect(town.stock.fish + (town.plots[fisher]?.out.fish ?? 0)).toBeGreaterThan(0);
  });

  it('felled wood is open ground until it grows back', () => {
    const stand = createStand();
    const i = TREES.inside.indexOf(1);
    const x = TREES.x[i] as number;
    const z = TREES.z[i] as number;
    expect(woodStands(stand, x, z)).toBe(true);
    // Fell every tree within a few metres: more than half the cell's wood.
    const felled: number[] = [];
    for (let k = 0; k < TREES.count; k++) {
      if (!TREES.inside[k] || Math.hypot((TREES.x[k] as number) - x, (TREES.z[k] as number) - z) > 20) continue;
      fellTree(stand, k, 0);
      plantTree(stand, k, 0);
      felled.push(k);
    }
    expect(woodStands(stand, x, z)).toBe(false);
    stepStand(stand, FORESTRY.growS + 1);
    expect(woodStands(stand, x, z)).toBe(true);
  });

  it('a sapling grows once into a tree, and only the grown tree may be felled', () => {
    const stand = createStand();
    const i = TREES.inside.indexOf(1);
    const x = TREES.x[i] as number;
    const z = TREES.z[i] as number;
    expect(claimNearestTree(stand, x, z, 0.5, 0)).toBe(i);
    fellTree(stand, i, 10);
    plantTree(stand, i, 14);
    // Growing: passed over, however near.
    expect(claimNearestTree(stand, x, z, 0.5, 14 + FORESTRY.growS / 2)).toBe(-1);
    expect(claimNearestTree(stand, x, z, 0.5, 14 + FORESTRY.growS - 1)).toBe(-1);
    // Grown: a tree like the others again.
    stepStand(stand, 14 + FORESTRY.growS);
    expect(growthOf(stand, i, 14 + FORESTRY.growS)).toBe(1);
    expect(stand.changed.has(i)).toBe(false);
    expect(claimNearestTree(stand, x, z, 0.5, 14 + FORESTRY.growS)).toBe(i);
  });

  it('a woodcutter fells the trees round his hut, plants one for every tree, and the saplings grow back', () => {
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    const cutter = build(world, 'woodcutter');
    const felledBy = (): number[] => [...world.stand.changed];
    runUntil(world, 900, () => felledBy().length >= 6);
    const felled = felledBy();
    expect(felled.length).toBeGreaterThanOrEqual(6);
    const b = town.plots[cutter];
    if (!b) throw new Error('no woodcutter');
    for (const i of felled) {
      // Only trees within his reach, and no tree twice while it grows back.
      expect(Math.hypot((TREES.x[i] as number) - b.x, (TREES.z[i] as number) - b.z)).toBeLessThanOrEqual(FORESTRY.reachM + 0.01);
    }
    // One sapling for every tree he has carried home: all but perhaps the one he is at now are planted.
    const planted = felled.filter((i) => (world.stand.plantedS[i] as number) >= (world.stand.felledS[i] as number));
    expect(planted.length).toBeGreaterThanOrEqual(felled.length - 1);
    expect(growthOf(world.stand, planted[0] as number, world.timeS)).toBeGreaterThan(0);
    // In time the first sapling is a tree again: standing, or felled anew once it had grown (it is the nearest).
    const first = planted[0] as number;
    const firstFelledS = world.stand.felledS[first] as number;
    run(world, FORESTRY.growS + 30);
    const standing = !world.stand.changed.has(first) && growthOf(world.stand, first, world.timeS) === 1;
    const felledAgain = (world.stand.felledS[first] as number) >= firstFelledS + FORESTRY.growS;
    expect(standing || felledAgain).toBe(true);
  }, 60_000);

  it('a fed house fills with people; an empty larder stops newcomers and tax', () => {
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    const plot = build(world, 'house');
    runUntil(world, 240, () => finished(world, plot));
    const living = (): number => world.people.filter((p) => p.alive && p.side === PLAYER).length;
    const before = living();
    run(world, PEOPLE.growSeconds * 4);
    expect(living()).toBeGreaterThan(before);
    expect(housingCapacity(town)).toBe(PEOPLE.keepResidents + (PEOPLE.houseResidents[0] as number));
    // No food anywhere: the larders run dry, the town starves and pays only the keep's income.
    town.stock.bread = 0;
    town.stock.fish = 0;
    town.stock.sausage = 0;
    for (const b of town.plots) if (b) b.inp.bread = 0;
    runUntil(world, 600, () => town.starving && town.plots[plot]?.starving === true);
    expect(town.starving).toBe(true);
    const gold = town.stock.gold;
    run(world, 60);
    expect(town.stock.gold - gold).toBeLessThanOrEqual(Math.ceil(TOWN.keepGoldPerSecond * 60) + 1);
  });

  it('a sausage feeds two where a loaf feeds one', () => {
    const runTown = (town: Town, seconds: number, soldiers: number): void => {
      for (let i = 0; i < seconds * 60; i++) stepEconomy(town, 1 / 60, soldiers);
    };
    const bread = createTown(PLAYER);
    const sausage = createTown(PLAYER);
    bread.stock.bread = 100;
    sausage.stock.bread = 0;
    sausage.stock.sausage = 100;
    expect(keepRationDemandPerSecond(bread, 40)).toBeCloseTo((40 * FOOD.soldierRationsPerMinute) / 60, 10);
    runTown(bread, 300, 40);
    runTown(sausage, 300, 40);
    const loavesEaten = 100 - bread.stock.bread;
    const sausagesEaten = 100 - sausage.stock.sausage;
    expect(loavesEaten).toBeGreaterThanOrEqual(sausagesEaten * 2 - 1);
    expect(loavesEaten).toBeLessThanOrEqual(sausagesEaten * 2 + 1);
  });
});

describe('roads', () => {
  it('a road costs stone, only inside the side\'s land, and is refused when the stone is short', () => {
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    const x0 = townX(PLAYER) + 15;
    const z0 = townZ(PLAYER) - 15;
    const cost = roadCost(world, x0, z0, x0 + 40, z0);
    expect(cost).toBe(Math.ceil(Math.round(40 / ROADS.cellM + 1) * ROADS.stonePerCell));
    town.stock.stone = cost - 1;
    expect(cmdBuildRoad(world, PLAYER, x0, z0, x0 + 40, z0)).toBe('cannotAfford');
    town.stock.stone = 100;
    expect(cmdBuildRoad(world, PLAYER, x0, z0, x0 + 40, z0)).toBe('ok');
    expect(town.stock.stone).toBe(100 - cost);
    expect(isRoad(world.nav, x0 + 20, z0)).toBe(true);
    // Laid again, it costs nothing: every cell is road already.
    expect(roadCost(world, x0, z0, x0 + 40, z0)).toBe(0);
    expect(cmdBuildRoad(world, PLAYER, townX(COMPUTER), townZ(COMPUTER), townX(COMPUTER) + 10, townZ(COMPUTER))).toBe('tooFar');
  });

  it('people take a road when it is quicker, and walk round buildings', () => {
    const world = rich(quietWorld());
    const x0 = townX(PLAYER) + 30;
    const z0 = townZ(PLAYER) - 40;
    const path = new Float32Array(ROADS.maxWaypoints * 2);
    // A road that bows away from the straight line: still worth it at 1.4× the pace.
    expect(cmdBuildRoad(world, PLAYER, x0, z0, x0 + 30, z0 - 12)).toBe('ok');
    expect(cmdBuildRoad(world, PLAYER, x0 + 30, z0 - 12, x0 + 60, z0)).toBe('ok');
    const points = findPath(world.nav, x0, z0, x0 + 60, z0, path);
    expect(points).toBeGreaterThan(1);
    let away = 0;
    for (let i = 0; i < points; i++) away = Math.max(away, z0 - (path[i * 2 + 1] as number));
    expect(away).toBeGreaterThan(6);
    // A building in the way: the path goes round it.
    const site = checkSite(world, PLAYER, 'house', x0 + 30, z0 + 40, 0);
    expect(site.result).toBe('ok');
    expect(cmdBuild(world, PLAYER, 'house', x0 + 30, z0 + 40, 0)).toBe('ok');
    const round = findPath(world.nav, x0 + 10, z0 + 40, x0 + 50, z0 + 40, path);
    for (let i = 0; i < round; i++) {
      expect(Math.hypot((path[i * 2] as number) - (x0 + 30), (path[i * 2 + 1] as number) - (z0 + 40))).toBeGreaterThan(TOWN.buildingRadiusM - 1.5);
    }
  });
});

describe('recruiting', () => {
  it('a regiment is made of townspeople who walk to the barracks', () => {
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    expect(cmdRecruit(world, PLAYER, 'pikemen')).toBe('needsBarracks');
    const plot = build(world, 'barracks');
    runUntil(world, 300, () => finished(world, plot));
    expect(barracksLevel(town)).toBe(1);
    expect(cmdRecruit(world, PLAYER, 'swordsmen')).toBe('needsBarracks');
    // The keep's household alone is too few to spare twelve.
    expect(freePeople(world, PLAYER)).toBeLessThan(UNITS.militia.men + PEOPLE.minFreeAfterCallUp);
    expect(cmdRecruit(world, PLAYER, 'militia')).toBe('noPeople');
    for (let i = 0; i < 3; i++) build(world, 'house');
    runUntil(world, 900, () => freePeople(world, PLAYER) >= UNITS.militia.men + PEOPLE.minFreeAfterCallUp);
    const living = world.people.filter((p) => p.alive && p.side === PLAYER).length;
    expect(cmdRecruit(world, PLAYER, 'militia')).toBe('ok');
    runUntil(world, 300, () => world.regiments.length > 0);
    expect(world.regiments[0]?.aliveMen).toBe(UNITS.militia.men);
    expect(town.underArms).toBe(UNITS.militia.men);
    // The twelve left the town (a few may have been born in the houses while they walked to the barracks).
    expect(world.people.filter((p) => p.alive && p.side === PLAYER).length).toBeLessThanOrEqual(living - UNITS.militia.men + 4);
  });

  it('raising the keep costs, takes a minute, and widens the town, hardens the keep and lets the barracks rise', () => {
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    const far = KEEP_LEVELS[0].territoryM + 15;
    expect(checkSite(world, PLAYER, 'house', townX(PLAYER) + far, townZ(PLAYER) - 20, 0).result).toBe('tooFar');
    const stone = town.stock.stone;
    expect(cmdUpgradeKeep(world, PLAYER)).toBe('ok');
    expect(town.stock.stone).toBe(stone - KEEP_LEVELS[1].cost.stone);
    expect(cmdUpgradeKeep(world, PLAYER)).toBe('underConstruction');
    run(world, KEEP_UPGRADE_SECONDS / 2);
    expect(town.keepLevel).toBe(1);
    run(world, KEEP_UPGRADE_SECONDS / 2 + 1);
    expect(town.keepLevel).toBe(2);
    expect(town.keepHp).toBe(KEEP_LEVELS[1].hp);
    expect(checkSite(world, PLAYER, 'house', townX(PLAYER) + far, townZ(PLAYER) - 20, 0).result).not.toBe('tooFar');
    expect(cmdUpgradeKeep(world, PLAYER)).toBe('ok');
    run(world, KEEP_UPGRADE_SECONDS + 1);
    expect(town.keepLevel).toBe(3);
    expect(cmdUpgradeKeep(world, PLAYER)).toBe('maxLevel');
  });

  it('upgrading costs more and makes a workshop work faster', () => {
    const world = rich(quietWorld());
    const plot = build(world, 'quarry');
    runUntil(world, 300, () => finished(world, plot));
    expect(cmdUpgrade(world, PLAYER, plot)).toBe('ok');
    expect(world.towns[PLAYER].plots[plot]?.level).toBe(2);
    expect(cmdUpgrade(world, PLAYER, plot)).toBe('underConstruction');
  });
});

describe('balance', () => {
  // With flour and iron as steps of their own, the first regiment takes the field at about 20 minutes.
  it('the computer\'s town grows, stays fed and fields an army inside 23 minutes', () => {
    const world = createWorld({ seed: 7, difficulty: 'normal', computerPlays: true });
    let firstArmyS = -1;
    runUntil(world, 23 * 60, () => {
      if (firstArmyS < 0 && menAlive(world, COMPUTER) > 0) firstArmyS = world.timeS;
      return false;
    });
    const town = world.towns[COMPUTER];
    expect(town.plots.filter((b) => b !== null).length).toBeGreaterThanOrEqual(12);
    expect(firstArmyS).toBeGreaterThan(0);
    expect(firstArmyS).toBeLessThan(23 * 60);
    expect(world.people.filter((p) => p.alive && p.side === COMPUTER).length).toBeGreaterThanOrEqual(12);
  }, 60_000);
});

describe('militia and re-arming', () => {
  it('militia is raised at the keep with spears and shields of timber, before there is a barracks', () => {
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    expect(UNITS.militia.barracksLevel).toBe(0);
    expect(UNITS.militia.equipment).toEqual({ wood: 1 });
    for (let i = 0; i < 3; i++) build(world, 'house');
    runUntil(world, 900, () => freePeople(world, PLAYER) >= UNITS.militia.men + PEOPLE.minFreeAfterCallUp);
    const wood = town.stock.wood;
    expect(cmdRecruit(world, PLAYER, 'militia')).toBe('ok');
    expect(town.stock.wood).toBe(wood - UNITS.militia.men);
    runUntil(world, 300, () => world.regiments.length > 0);
    expect(world.regiments[0]?.kind).toBe('militia');
  });

  it('a regiment by its barracks is re-armed: same men, paid only for what they lack', () => {
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    const plot = build(world, 'barracks');
    runUntil(world, 300, () => finished(world, plot));
    const barracks = town.plots[plot];
    if (!barracks) throw new Error('no barracks');
    const r = spawnRegiment(world, PLAYER, 'pikemen', barracks.x + 60, barracks.z, 0);
    r.soldiers.forEach((s, i) => {
      if (i < 3) s.hp = UNITS.pikemen.hp / 2;
    });
    town.stock.weapon = 0;
    town.stock.mailArmor = 20;
    // Swordsmen need a barracks of level 2; pikemen cannot become archers at all.
    expect(cmdRearm(world, r.id, 'swordsmen')).toBe('needsBarracks');
    expect(cmdRearm(world, r.id, 'archers')).toBe('cannotRearm');
    // The barracks rises no higher than the keep allows: the keep first.
    expect(cmdUpgrade(world, PLAYER, plot)).toBe('needsKeep');
    expect(cmdUpgradeKeep(world, PLAYER)).toBe('ok');
    run(world, KEEP_UPGRADE_SECONDS + 1);
    expect(cmdUpgrade(world, PLAYER, plot)).toBe('ok');
    runUntil(world, 300, () => finished(world, plot));
    // Too far from the barracks, then near enough.
    expect(cmdRearm(world, r.id, 'swordsmen')).toBe('notAtBarracks');
    expect(cmdMove(world, r.id, barracks.x + 15, barracks.z, 0, false)).toBe('ok');
    runUntil(world, 120, () => Math.hypot(r.centreX - barracks.x, r.centreZ - barracks.z) < REARM.radiusM - 5 && r.order === 'hold');
    // Pikemen keep their weapons: swordsmen need only mail (and the difference in gold).
    const cost = rearmCost(r, 'swordsmen');
    expect(cost.weapon).toBeUndefined();
    expect(cost.mailArmor).toBe(r.aliveMen);
    expect(cost.gold).toBe(UNITS.swordsmen.goldCost - UNITS.pikemen.goldCost);
    const men = r.aliveMen;
    expect(cmdRearm(world, r.id, 'swordsmen')).toBe('ok');
    expect(town.stock.mailArmor).toBe(20 - men);
    expect(cmdMove(world, r.id, 0, 0, 0, false)).toBe('rearming');
    run(world, REARM.seconds + 1);
    expect(r.kind).toBe('swordsmen');
    expect(r.aliveMen).toBe(men);
    const wounded = r.soldiers.filter((s) => s.alive && s.hp < UNITS.swordsmen.hp * 0.6).length;
    expect(wounded).toBe(3);
  });
});

describe('reinforcements and pay', () => {
  it('a thinned regiment by its barracks is filled: paid per man, men from the town, experience diluted, a new captain', () => {
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    const plot = build(world, 'barracks');
    runUntil(world, 300, () => finished(world, plot));
    const barracks = town.plots[plot];
    if (!barracks) throw new Error('no barracks');
    town.stock.weapon = 10;
    town.stock.leatherArmor = 10;
    const r = spawnRegiment(world, PLAYER, 'pikemen', barracks.x + 70, barracks.z, 0);
    // Spawned regiments did not come from the town: count them under arms as recruiting would.
    town.underArms += r.initialMen;
    expect(cmdReinforce(world, r.id)).toBe('fullStrength');
    for (const s of r.soldiers.slice(0, 4)) kill(world, s, COMPUTER, null);
    expect(hasCaptain(r)).toBe(false);
    r.xp = 1.2;
    expect(cmdReinforce(world, r.id)).toBe('notAtBarracks');
    expect(cmdMove(world, r.id, barracks.x + 15, barracks.z, 0, false)).toBe('ok');
    runUntil(world, 120, () => Math.hypot(r.centreX - barracks.x, r.centreZ - barracks.z) < REINFORCE.radiusM - 5 && r.order === 'hold');
    run(world, REINFORCE.quietS);
    const gold = town.stock.gold;
    const free = freePeople(world, PLAYER);
    expect(cmdReinforce(world, r.id)).toBe('ok');
    expect(cmdReinforce(world, r.id)).toBe('reinforcing');
    expect(gold - town.stock.gold).toBe(Math.round((UNITS.pikemen.goldCost * 4) / UNITS.pikemen.men));
    expect(town.stock.weapon).toBe(6);
    expect(town.stock.leatherArmor).toBe(6);
    expect(freePeople(world, PLAYER)).toBe(free - 4);
    runUntil(world, 240, () => r.aliveMen === r.initialMen);
    expect(r.aliveMen).toBe(r.initialMen);
    expect(hasCaptain(r)).toBe(true);
    expect(r.xp).toBeCloseTo((1.2 * 8) / 12, 6);
    expect(r.soldiers.filter((s) => s.alive).every((s) => s.hp === UNITS.pikemen.hp)).toBe(true);
  });

  it('soldiers are paid from the keep; an empty chest leaves them unpaid and downhearted', () => {
    const world = quietWorld();
    const twin = quietWorld();
    const town = world.towns[PLAYER];
    // By the keep, away from the places worth holding (a held village would bring in gold of its own).
    const x = townX(PLAYER);
    const z = townZ(PLAYER) + 40;
    const r = spawnRegiment(world, PLAYER, 'swordsmen', x, z, 0);
    spawnRegiment(world, PLAYER, 'swordsmen', x + 20, z, 0);
    run(world, 120.5);
    run(twin, 120.5);
    // 24 men for two minutes: the same town without them is that much richer.
    expect(twin.towns[PLAYER].stock.gold - town.stock.gold).toBe(Math.floor(24 * 2 * PAY.goldPerManPerMinute));
    expect(town.unpaid).toBe(false);
    // An empty chest and pay owing: arrears past a minute's pay leave the army unpaid…
    town.stock.gold = 0;
    town.payOwed = 30;
    run(world, 1);
    expect(town.unpaid).toBe(true);
    expect(topMorale(world, r)).toBe(UNITS.swordsmen.morale - PAY.unpaidMoralePenalty);
    // …until gold comes in and the arrears are paid off.
    town.stock.gold = 100;
    run(world, 1);
    expect(town.unpaid).toBe(false);
    expect(town.stock.gold).toBeLessThan(100 - 28);
  });
});

describe('orders, transport and reach', () => {
  it('a workshop makes what is ordered and stops; arms are ordered by the regiment', () => {
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    const plot = build(world, 'quarry');
    runUntil(world, 300, () => finished(world, plot));
    const quarry = town.plots[plot];
    if (!quarry) throw new Error('no quarry');
    expect(cmdOrder(world, PLAYER, 'stone', 3)).toBe('ok');
    const before = town.made.stone;
    runUntil(world, 300, () => workState(quarry) === 'orderDone');
    expect(workState(quarry)).toBe('orderDone');
    expect(town.orders.stone).toBe(0);
    run(world, 60);
    expect(quarry.out.stone + town.stock.stone).toBeGreaterThan(0);
    expect(town.made.stone - before).toBeLessThanOrEqual(4);
    // More ordered: it works again; the limit lifted: no stopping at all.
    cmdOrder(world, PLAYER, 'stone', null);
    run(world, 30);
    expect(workState(quarry)).not.toBe('orderDone');
    expect(cmdOrderRegiments(world, PLAYER, 'pikemen', 2)).toBe('ok');
    expect(town.orders.weapon).toBe(2 * UNITS.pikemen.men);
    expect(town.orders.leatherArmor).toBe(2 * UNITS.pikemen.men);
    expect(town.orders.wood).toBeUndefined();
    // A gun's iron stays unlimited: one gun ordered must not stop the smelter once its iron is made.
    expect(cmdOrderRegiments(world, PLAYER, 'cannon', 1)).toBe('ok');
    expect(town.orders.iron).toBeUndefined();
  });

  it('an order for mail keeps the smelter at work although iron itself is ordered to nought', () => {
    const town = quietWorld().towns[PLAYER];
    town.stock.iron = 0;
    town.stock.mailArmor = 0;
    town.orders.iron = 0;
    town.orders.mailArmor = 0;
    expect(ordersFilled(town, { iron: 2 })).toBe(true);
    town.orders.mailArmor = 36;
    expect(wantedForOrders(town, 'iron')).toBe(72);
    expect(ordersFilled(town, { iron: 2 })).toBe(false);
    // Iron enough in the keep for the mail still to make: the smelter may rest.
    town.stock.iron = 80;
    expect(ordersFilled(town, { iron: 2 })).toBe(true);
  });

  it('transport is raised a level at a time: handcarts, then wagons once the keep allows', () => {
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    town.stock.horse = 10;
    expect(carryCapacity(town)).toBe(PEOPLE.carryCapacity);
    expect(cmdUpgradeTransport(world, PLAYER)).toBe('ok');
    expect(cmdUpgradeTransport(world, PLAYER)).toBe('underConstruction');
    run(world, TRANSPORT[1].seconds + 1);
    expect(town.transportLevel).toBe(2);
    expect(carryCapacity(town)).toBe(TRANSPORT[1].capacity);
    expect(cmdUpgradeTransport(world, PLAYER)).toBe('needsKeep');
    expect(cmdUpgradeKeep(world, PLAYER)).toBe('ok');
    run(world, KEEP_UPGRADE_SECONDS + 1);
    expect(cmdUpgradeTransport(world, PLAYER)).toBe('ok');
    expect(town.stock.horse).toBe(10 - (TRANSPORT[2].cost.horse ?? 0));
  });

  it('a woodcutter goes only where enough grown trees stand; the town reaches out from its buildings', () => {
    const world = rich(quietWorld());
    let checked = 0;
    for (let x = -270; x <= 270 && checked < 40; x += 9) {
      for (let z = -270; z <= 270 && checked < 40; z += 9) {
        if (checkSite(world, PLAYER, 'woodcutter', x, z, 0).result !== 'ok') continue;
        checked++;
        expect(grownTreesNear(world.stand, x, z, FORESTRY.reachM, world.timeS)).toBeGreaterThanOrEqual(FORESTRY.minTrees);
      }
    }
    expect(checked).toBeGreaterThan(10);
    // Beyond the keep's circle: refused, until a building of ours stands near.
    const kx = townX(PLAYER);
    const kz = townZ(PLAYER);
    const reach = KEEP_LEVELS[0].territoryM;
    let probe: { x: number; z: number } | null = null;
    for (let a = 0; a < Math.PI * 2 && !probe; a += 0.05) {
      const x = kx + Math.sin(a) * (reach + 30);
      const z = kz + Math.cos(a) * (reach + 30);
      if (checkSite(world, PLAYER, 'house', x, z, 0).result !== 'tooFar') continue;
      const bx = kx + Math.sin(a) * (reach - 15);
      const bz = kz + Math.cos(a) * (reach - 15);
      if (checkSite(world, PLAYER, 'house', bx, bz, 0).result === 'ok') probe = { x, z };
      else continue;
      expect(cmdBuild(world, PLAYER, 'house', bx, bz, 0)).toBe('ok');
      const plot = world.towns[PLAYER].plots.findIndex((b) => b !== null && b.x === bx && b.z === bz);
      runUntil(world, 300, () => finished(world, plot));
    }
    if (!probe) throw new Error('no open ground at the edge of the keep\'s reach');
    expect(checkSite(world, PLAYER, 'house', probe.x, probe.z, 0).result).not.toBe('tooFar');
  });
});

describe('wine', () => {
  it('vines are planted once and bear grapes every season; the winery makes wine; a house with wine pays more', () => {
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    const plot = build(world, 'vineyard');
    const vineyard = town.plots[plot];
    if (!vineyard) throw new Error('no vineyard');
    expect(vineyard.strips.length).toBeGreaterThanOrEqual(FIELDS.stripsPerLevel[0] as number);
    runUntil(world, 900, () => (town.plots[plot]?.out.grapes ?? 0) + town.stock.grapes >= VINES.grapesPerHarvest * 2);
    expect(vineyard.out.grapes + town.stock.grapes).toBeGreaterThanOrEqual(VINES.grapesPerHarvest * 2);
    // Harvested vines go straight back to growing: never 'bare', never sown again.
    expect(vineyard.strips.every((s) => s.state !== 'bare')).toBe(true);

    const winery = build(world, 'winery');
    const house = build(world, 'house');
    runUntil(world, 300, () => finished(world, winery) && finished(world, house));
    town.stock.grapes += 30;
    runUntil(world, 600, () => (town.plots[house]?.inp.wine ?? 0) > 0);
    const h = town.plots[house];
    if (!h) throw new Error('no house');
    expect(h.inp.wine).toBeGreaterThan(0);
    run(world, 1);
    expect(h.hasWine).toBe(true);
    expect(WINE.taxFactor).toBeGreaterThan(1);
  });
});

describe('the home guard', () => {
  it('militia takes orders only near its own keep, never against buildings; re-armed it may march out', () => {
    const world = rich(quietWorld());
    const guard = spawnRegiment(world, PLAYER, 'militia', townX(PLAYER) + 20, townZ(PLAYER) - 20, 0);
    expect(cmdMove(world, guard.id, townX(PLAYER) + 40, townZ(PLAYER) - 40, null, false)).toBe('ok');
    expect(cmdMove(world, guard.id, 0, 0, null, false)).toBe('defenceOnly');
    expect(cmdAttackBuilding(world, guard.id, COMPUTER, -1)).toBe('defenceOnly');
    const enemyFar = spawnRegiment(world, COMPUTER, 'pikemen', 0, 0, 0);
    expect(cmdAttackRegiment(world, guard.id, enemyFar.id)).toBe('defenceOnly');
    // In a group order the guard stays behind and the rest march.
    const line = spawnRegiment(world, PLAYER, 'pikemen', townX(PLAYER) + 30, townZ(PLAYER) - 10, 0);
    expect(cmdMoveGroup(world, [guard.id, line.id], 0, 0, 0, false)).toBe('ok');
    expect(line.order).toBe('move');
    expect(guard.destX).not.toBeCloseTo(0, 0);
    // Re-armed as pikemen it is an army like any other.
    guard.kind = 'pikemen';
    guard.def = UNITS.pikemen;
    expect(cmdMove(world, guard.id, 0, 0, null, false)).toBe('ok');
  });

  it('the computer keeps its militia at home and does not send it with a wave', () => {
    const world = createWorld({ seed: 7, difficulty: 'normal', computerPlays: true });
    runUntil(world, 30 * 60, () => false);
    for (const r of world.regiments) {
      if (r.side !== COMPUTER || !r.def.defenceOnly || r.aliveMen === 0) continue;
      expect(Math.hypot(r.centreX - townX(COMPUTER), r.centreZ - townZ(COMPUTER))).toBeLessThanOrEqual(ARMY.homeGuardRadiusM + 5);
    }
  }, 60_000);
});

describe('walls and watchtowers', () => {
  it('a wall costs stone, stops people and soldiers, and the enemy batters it down', () => {
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    const x = townX(PLAYER) + 40;
    const z0 = townZ(PLAYER) - 50;
    const z1 = townZ(PLAYER) + 10;
    const stone = town.stock.stone;
    const cost = wallCost(world, x, z0, x, z1);
    expect(cost).toBeGreaterThan(0);
    expect(cmdBuildWall(world, PLAYER, x, z0, x, z1)).toBe('ok');
    expect(town.stock.stone).toBe(stone - cost);
    expect(wallCellAt(world.nav, x, townZ(PLAYER) - 20)).toBeGreaterThanOrEqual(0);
    // A way across goes round the end of the wall.
    const path = new Float32Array(ROADS.maxWaypoints * 2);
    const n = findPath(world.nav, x - 10, townZ(PLAYER) - 20, x + 10, townZ(PLAYER) - 20, path);
    let furthest = 0;
    for (let i = 0; i < n; i++) furthest = Math.max(furthest, Math.abs((path[i * 2 + 1] as number) - (townZ(PLAYER) - 20)));
    expect(furthest).toBeGreaterThan(25);
    // Enemy swordsmen marching through it are stopped, batter it, and break through.
    const enemy = spawnRegiment(world, COMPUTER, 'swordsmen', x + 15, townZ(PLAYER) - 20, -Math.PI / 2);
    expect(cmdMove(world, enemy.id, x - 25, townZ(PLAYER) - 20, null, false)).toBe('ok');
    run(world, 4);
    for (const s of enemy.soldiers) if (s.alive) expect(s.x).toBeGreaterThan(x - 1.5);
    const broke = runUntil(world, 240, () => enemy.centreX < x - 5);
    expect(broke).toBeLessThan(240);
  });

  it('a regiment marches round a wall and round a lake instead of sticking at them', () => {
    const world = rich(quietWorld());
    const x = townX(PLAYER) + 40;
    const z = townZ(PLAYER) - 20;
    expect(cmdBuildWall(world, PLAYER, x, z - 30, x, z + 30)).toBe('ok');
    const r = spawnRegiment(world, PLAYER, 'pikemen', x + 15, z, -Math.PI / 2);
    expect(cmdMove(world, r.id, x - 20, z, null, false)).toBe('ok');
    const t = runUntil(world, 150, () => r.order === 'hold' && Math.hypot(r.anchorX - (x - 20), r.anchorZ - z) < 3);
    expect(t).toBeLessThan(150);
    // Across the lake: round its shore.
    const lx = lakeX(PLAYER);
    const lz = lakeZ(PLAYER);
    const reach = TOWN.lakeRadiusM + 30;
    // From the side towards the keep to the far side, along the line across the map (both on the map).
    const d = Math.hypot(lx, lz) || 1;
    const ux = -lz / d;
    const uz = lx / d;
    const boat = spawnRegiment(world, PLAYER, 'swordsmen', lx + ux * reach, lz + uz * reach, 0);
    const gx = lx - ux * reach;
    const gz = lz - uz * reach;
    expect(cmdMove(world, boat.id, gx, gz, null, false)).toBe('ok');
    const t2 = runUntil(world, 200, () => boat.order === 'hold' && Math.hypot(boat.anchorX - gx, boat.anchorZ - gz) < 3);
    expect(t2).toBeLessThan(200);
    // Nobody stood in the water on the way.
    for (const s of boat.soldiers) if (s.alive) expect(isWater(s.x, s.z)).toBe(false);
  });

  it('a gate goes into its own wall: its side walks and marches through, the enemy is stopped', () => {
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    const x = townX(PLAYER) + 40;
    const gz = townZ(PLAYER) - 20;
    // Not on open ground, and not in the enemy's wall.
    expect(cmdBuildGate(world, PLAYER, x, gz)).toBe('needsWall');
    expect(cmdBuildWall(world, PLAYER, x, townZ(PLAYER) - 60, x, townZ(PLAYER) + 20)).toBe('ok');
    expect(cmdBuildGate(world, COMPUTER, x, gz)).toBe('needsWall');
    const wood = town.stock.wood;
    expect(cmdBuildGate(world, PLAYER, x, gz)).toBe('ok');
    expect(town.stock.wood).toBe(wood - GATE.cost.wood);
    expect(world.gates.length).toBe(1);
    // Townspeople's ways go through it, not round the end of the wall.
    const path = new Float32Array(ROADS.maxWaypoints * 2);
    const n = findPath(world.nav, x - 10, gz, x + 10, gz, path);
    let furthest = 0;
    for (let i = 0; i < n; i++) furthest = Math.max(furthest, Math.abs((path[i * 2 + 1] as number) - gz));
    expect(furthest).toBeLessThan(6);
    // The side's own men march through in file.
    const ours = spawnRegiment(world, PLAYER, 'pikemen', x + 12, gz, -Math.PI / 2);
    cmdMove(world, ours.id, x - 20, gz, null, false);
    runUntil(world, 120, () => ours.soldiers.filter((s) => s.alive && s.x < x - 2).length >= 6);
    expect(ours.soldiers.filter((s) => s.alive && s.x < x - 2).length).toBeGreaterThanOrEqual(6);
    // The enemy's are stopped at it.
    const theirs = spawnRegiment(world, COMPUTER, 'swordsmen', x - 15, gz + 30, Math.PI / 2);
    theirs.soldiers.forEach((s) => {
      s.z = gz + (s.z - theirs.centreZ) * 0.3;
      s.x = x + 12 + (s.x - theirs.centreX);
    });
    expect(cmdMove(world, theirs.id, x - 25, gz, null, false)).toBe('ok');
    run(world, 4);
    for (const s of theirs.soldiers) if (s.alive) expect(s.x).toBeGreaterThan(x - 1.5);
  });

  it('a wall between two watchtowers joins them tight: no regiment slips past a tower', () => {
    for (const [dx, dz] of [[0, 50], [36, 36]] as const) {
      const world = rich(quietWorld());
      world.towns[PLAYER].stock.stone = 5000;
      const ax = townX(PLAYER) + 50;
      const az = townZ(PLAYER) - 60;
      const bx = ax + dx;
      const bz = az + dz;
      expect(cmdBuild(world, PLAYER, 'tower', ax, az, 0)).toBe('ok');
      expect(cmdBuild(world, PLAYER, 'tower', bx, bz, 0)).toBe('ok');
      for (const b of world.towns[PLAYER].plots) if (b && b.kind === 'tower') b.constructionLeftS = 0;
      expect(cmdBuildWall(world, PLAYER, ax, az, bx, bz)).toBe('ok');
      // The wall runs into both towers (it used to stop at their built ground, a gap a metre or two wide).
      expect(wallCellAt(world.nav, ax, az)).toBeGreaterThanOrEqual(0);
      expect(wallCellAt(world.nav, bx, bz)).toBeGreaterThanOrEqual(0);
      // The line sealed beyond the towers too: the only way across would be between them.
      const len = Math.hypot(dx, dz);
      const ux = dx / len;
      const uz = dz / len;
      expect(cmdBuildWall(world, PLAYER, ax, az, ax - ux * 70, az - uz * 70)).toBe('ok');
      expect(cmdBuildWall(world, PLAYER, bx, bz, bx + ux * 70, bz + uz * 70)).toBe('ok');
      const nx = uz;
      const nz = -ux;
      for (const t of [0.08, 0.5]) {
        const px = ax + dx * t;
        const pz = az + dz * t;
        const r = spawnRegiment(world, COMPUTER, 'swordsmen', px + nx * 18, pz + nz * 18, 0);
        cmdMove(world, r.id, px - nx * 18, pz - nz * 18, null, false);
        run(world, 40);
        expect(r.soldiers.filter((q) => q.alive && (q.x - ax) * nx + (q.z - az) * nz < -2).length).toBe(0);
        for (const q of r.soldiers) q.alive = false;
        r.aliveMen = 0;
      }
    }
  });

  it('guns sent against a wall batter it down; a wall of their own side cannot be their mark', () => {
    const world = rich(quietWorld());
    const x = townX(PLAYER) + 40;
    expect(cmdBuildWall(world, PLAYER, x, townZ(PLAYER) - 40, x, townZ(PLAYER) + 10)).toBe('ok');
    const wz = townZ(PLAYER) - 15;
    expect(wallCellAt(world.nav, x, wz)).toBeGreaterThanOrEqual(0);
    const guns = spawnRegiment(world, COMPUTER, 'cannon', x + 140, wz, -Math.PI / 2);
    const foot = spawnRegiment(world, COMPUTER, 'swordsmen', x + 140, wz + 30, -Math.PI / 2);
    expect(cmdBombard(world, foot.id, x, wz)).toBe('notThisUnit');
    expect(cmdBombard(world, guns.id, x + 20, wz)).toBe('needsWall');
    const own = spawnRegiment(world, PLAYER, 'cannon', x - 100, wz, Math.PI / 2);
    expect(cmdBombard(world, own.id, x, wz)).toBe('needsWall');
    expect(cmdBombard(world, guns.id, x, wz)).toBe('ok');
    runUntil(world, 400, () => wallCellAt(world.nav, x, wz) < 0);
    expect(wallCellAt(world.nav, x, wz)).toBe(-1);
    // The breach made, they stand and wait for orders.
    run(world, 2);
    expect(guns.order).toBe('hold');
  });

  it('a watchtower takes up to four archers, shoots from its top, and lets them out again', () => {
    const world = rich(quietWorld());
    const town = world.towns[PLAYER];
    const tx = townX(PLAYER) + 60;
    const tz = townZ(PLAYER) - 60;
    expect(cmdBuild(world, PLAYER, 'tower', tx, tz, 0)).toBe('ok');
    const plot = town.plots.findIndex((b) => b !== null && b.kind === 'tower');
    runUntil(world, 300, () => finished(world, plot));
    const tower = town.plots[plot];
    if (!tower) throw new Error('no tower');
    const militia = spawnRegiment(world, PLAYER, 'militia', tx, tz + 20, 0);
    expect(cmdGarrison(world, militia.id, plot)).toBe('cannotGarrison');
    const archers = spawnRegiment(world, PLAYER, 'archers', tx, tz + 25, 0);
    expect(cmdGarrison(world, archers.id, plot)).toBe('ok');
    runUntil(world, 120, () => tower.garrison > 0);
    expect(tower.garrison).toBe(TOWER.maxGarrison);
    expect(archers.aliveMen).toBe(UNITS.archers.men - TOWER.maxGarrison);
    expect(menAlive(world, PLAYER)).toBe(UNITS.militia.men + UNITS.archers.men);
    // Raiders come within its reach and are shot down.
    // (Pikemen: militia this far from its own keep would turn home, being a home guard.)
    const raiders = spawnRegiment(world, COMPUTER, 'pikemen', tx, tz - UNITS.archers.missileRangeM - 5, 0);
    run(world, 60);
    expect(raiders.aliveMen).toBeLessThan(UNITS.pikemen.men);
    expect(cmdUngarrison(world, PLAYER, plot)).toBe('ok');
    expect(tower.garrison).toBe(0);
    const out = world.regiments[world.regiments.length - 1];
    expect(out?.kind).toBe('archers');
    expect(out?.aliveMen).toBe(TOWER.maxGarrison);
  });

  it('woodcutters, quarries, mines and towers may stand anywhere; farms further than the town', () => {
    const world = rich(quietWorld());
    // Far beyond the town's own land, but not by the enemy keep.
    // Past the town's reach, within the farmers'.
    const fx = townX(PLAYER) + TOWN.territoryRadiusM + 12;
    const fz = townZ(PLAYER) - 40;
    expect(checkSite(world, PLAYER, 'house', fx, fz, 0).result).toBe('tooFar');
    expect(checkSite(world, PLAYER, 'tower', fx, fz, 0).result).not.toBe('tooFar');
    expect(checkSite(world, PLAYER, 'woodcutter', fx, fz, 0).result).not.toBe('tooFar');
    expect(checkSite(world, PLAYER, 'farm', townX(PLAYER) + TOWN.territoryRadiusM + 12, townZ(PLAYER), Math.PI / 2).result).not.toBe('tooFar');
    expect(TOWN.fieldTerritoryRadiusM).toBeGreaterThan(TOWN.territoryRadiusM);
  });
});
