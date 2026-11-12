import { describe, expect, it } from 'vitest';
import { BUILDINGS, FOOD, UNITS } from '../src/config.ts';
import { cmdBuild, cmdRecruit } from '../src/sim/commands.ts';
import { barracksLevel, buildingCost, createTown, rationDemandPerSecond, startBuilding, startRecruit, startUpgrade, stepEconomy, type Town } from '../src/sim/economy.ts';
import { PLAYER } from '../src/sim/types.ts';
import { createWorld } from '../src/sim/world.ts';
import { run, runUntil } from './helpers.ts';

function richTown(): Town {
  const town = createTown(PLAYER);
  town.stock.gold = 5000;
  town.stock.wood = 1000;
  town.stock.stone = 1000;
  town.stock.bread = 1000;
  return town;
}

function runTown(town: Town, seconds: number, soldiers = 0): void {
  for (let i = 0; i < seconds * 60; i++) stepEconomy(town, 1 / 60, soldiers);
}

describe('economy', () => {
  it('a farm yields one grain per cycle once it is built', () => {
    const town = richTown();
    expect(startBuilding(town, 0, 'farm')).toBe('ok');
    runTown(town, BUILDINGS.farm.buildSeconds - 0.5);
    expect(town.stock.grain).toBe(0);
    runTown(town, 0.5 + 5 * 10 + 1);
    expect(town.stock.grain).toBe(10);
  });

  it('hides become leather armour only through a tannery', () => {
    const town = richTown();
    town.stock.grain = 100;
    startBuilding(town, 0, 'pigFarm');
    runTown(town, 120);
    expect(town.stock.hide).toBeGreaterThan(0);
    expect(town.stock.meat).toBe(town.stock.hide * 2);
    expect(town.stock.leatherArmor).toBe(0);
    expect(town.stock.sausage).toBe(0);
    startBuilding(town, 1, 'tannery');
    startBuilding(town, 2, 'butcher');
    runTown(town, 120);
    expect(town.stock.leatherArmor).toBeGreaterThan(0);
    expect(town.stock.sausage).toBeGreaterThan(0);
  });

  it('a building without its input stands idle and takes nothing', () => {
    const town = richTown();
    startBuilding(town, 0, 'bakery');
    const breadBefore = town.stock.bread;
    runTown(town, 60);
    // Only eaten, never baked: there is no grain.
    expect(town.stock.bread).toBeLessThanOrEqual(breadBefore);
    expect(town.stock.grain).toBe(0);
  });

  it('level 2 costs more and works faster', () => {
    const slow = richTown();
    const fast = richTown();
    startBuilding(slow, 0, 'woodcutter');
    startBuilding(fast, 0, 'woodcutter');
    runTown(slow, 10);
    runTown(fast, 10);
    expect(buildingCost('woodcutter', 2, 'gold')).toBeGreaterThan(buildingCost('woodcutter', 1, 'gold'));
    expect(startUpgrade(fast, 0)).toBe('ok');
    runTown(fast, 20);
    const slowWood = slow.stock.wood;
    const fastWood = fast.stock.wood;
    runTown(slow, 120);
    runTown(fast, 120);
    expect(fast.stock.wood - fastWood).toBeGreaterThan((slow.stock.wood - slowWood) * 1.4);
  });

  it('refuses what cannot be paid for, and a taken plot', () => {
    const town = createTown(PLAYER);
    town.stock.gold = 10;
    expect(startBuilding(town, 0, 'barracks')).toBe('cannotAfford');
    town.stock.gold = 500;
    expect(startBuilding(town, 0, 'woodcutter')).toBe('ok');
    expect(startBuilding(town, 0, 'woodcutter')).toBe('plotTaken');
    expect(() => startBuilding(town, 99, 'woodcutter')).toThrow(/plot '99'/);
  });

  it('a town with nothing to eat starves, pays no tax, and recovers when fed', () => {
    const town = createTown(PLAYER);
    town.stock.gold = 1000;
    town.stock.wood = 100;
    town.stock.bread = 0;
    startBuilding(town, 0, 'house');
    runTown(town, 60);
    expect(town.starving).toBe(true);
    const goldStarving = town.stock.gold;
    runTown(town, 60);
    // Only the keep's own income: 0.5 gold a second.
    expect(town.stock.gold - goldStarving).toBeLessThanOrEqual(31);
    town.stock.bread = 50;
    runTown(town, 40);
    expect(town.starving).toBe(false);
    const goldFed = town.stock.gold;
    runTown(town, 60);
    expect(town.stock.gold - goldFed).toBeGreaterThan(50);
  });

  it('a sausage feeds two where a loaf feeds one', () => {
    const demand = (town: Town): number => rationDemandPerSecond(town, 40);
    const bread = createTown(PLAYER);
    const sausage = createTown(PLAYER);
    bread.stock.bread = 100;
    sausage.stock.bread = 0;
    sausage.stock.sausage = 100;
    expect(demand(bread)).toBeCloseTo((40 * FOOD.soldierRationsPerMinute) / 60, 10);
    runTown(bread, 300, 40);
    runTown(sausage, 300, 40);
    const loavesEaten = 100 - bread.stock.bread;
    const sausagesEaten = 100 - sausage.stock.sausage;
    expect(loavesEaten).toBeGreaterThanOrEqual(sausagesEaten * 2 - 1);
    expect(loavesEaten).toBeLessThanOrEqual(sausagesEaten * 2 + 1);
  });

  it('recruiting needs a barracks of the right level, gold and equipment per man', () => {
    const town = richTown();
    expect(startRecruit(town, 'militia', 0)).toBe('needsBarracks');
    startBuilding(town, 0, 'barracks');
    runTown(town, BUILDINGS.barracks.buildSeconds + 1);
    expect(barracksLevel(town)).toBe(1);
    expect(startRecruit(town, 'swordsmen', 0)).toBe('needsBarracks');
    expect(startRecruit(town, 'pikemen', 0)).toBe('cannotAfford');
    town.stock.weapon = 12;
    town.stock.leatherArmor = 12;
    expect(startRecruit(town, 'pikemen', 0)).toBe('ok');
    expect(town.stock.weapon).toBe(0);
    expect(town.stock.leatherArmor).toBe(0);
    expect(startRecruit(town, 'militia', 100 - UNITS.pikemen.men - UNITS.militia.men + 1)).toBe('armyFull');
    runTown(town, UNITS.pikemen.recruitSeconds + 0.1);
    expect(town.trained).toEqual(['pikemen']);
  });

  it('a trained regiment takes the field with all its men', () => {
    const world = createWorld({ seed: 1, difficulty: 'normal', computerPlays: false });
    world.towns[PLAYER].stock.gold = 1000;
    world.towns[PLAYER].stock.wood = 100;
    world.towns[PLAYER].stock.stone = 100;
    expect(cmdBuild(world, PLAYER, 0, 'barracks')).toBe('ok');
    run(world, BUILDINGS.barracks.buildSeconds + 0.5);
    expect(cmdRecruit(world, PLAYER, 'militia')).toBe('ok');
    run(world, UNITS.militia.recruitSeconds + 0.5);
    expect(world.regiments).toHaveLength(1);
    expect(world.regiments[0]?.aliveMen).toBe(UNITS.militia.men);
  });

  it('balance: a plain opening fields pikemen within seven minutes', () => {
    const world = createWorld({ seed: 1, difficulty: 'normal', computerPlays: false });
    const town = world.towns[PLAYER];
    const opening = ['woodcutter', 'farm', 'house', 'house', 'quarry', 'pigFarm', 'bakery', 'tannery', 'ironMine', 'barracks', 'smithy'] as const;
    let next = 0;
    let recruited = false;
    const seconds = runUntil(world, 600, () => {
      const kind = opening[next];
      if (kind !== undefined && cmdBuild(world, PLAYER, next, kind) === 'ok') next++;
      if (!recruited && next === opening.length && cmdRecruit(world, PLAYER, 'pikemen') === 'ok') recruited = true;
      return world.regiments.length > 0;
    });
    expect(town.starving).toBe(false);
    expect(seconds).toBeLessThan(420);
  });
});
