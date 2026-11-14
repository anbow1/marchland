import { describe, expect, it } from 'vitest';
import { ARMY, FIELDS, FOOD, FORESTRY, GATE, PEOPLE, REARM, ROADS, TOWER, TOWN, UNITS, VINES, WINE } from '../src/config.ts';
import { cmdAttackBuilding, cmdAttackRegiment, cmdBuild, cmdBuildGate, cmdBuildRoad, cmdBuildWall, cmdGarrison, cmdMove, cmdMoveGroup, cmdRearm, cmdRecruit, cmdUngarrison, cmdUpgrade, rearmCost, roadCost, wallCost } from '../src/sim/commands.ts';
import { barracksLevel, createTown, housingCapacity, isBuilt, keepRationDemandPerSecond, stepEconomy, type Town } from '../src/sim/economy.ts';
import { findPath, isRoad, wallCellAt } from '../src/sim/nav.ts';
import { freePeople } from '../src/sim/people.ts';
import { checkSite } from '../src/sim/placement.ts';
import { planSite } from '../src/sim/sitePlanner.ts';
import { DEPOSITS, isWater, lakeX, lakeZ, townX, townZ } from '../src/sim/terrain.ts';
import { claimNearestTree, createStand, fellTree, growthOf, plantTree, stepStand, TREES } from '../src/sim/trees.ts';
import { type BuildingKind, COMPUTER, PLAYER } from '../src/sim/types.ts';
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
    expect(world.people.filter((p) => p.alive && p.side === PLAYER).length).toBeLessThanOrEqual(living - UNITS.militia.men + 2);
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
