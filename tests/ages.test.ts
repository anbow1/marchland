import { describe, expect, it } from 'vitest';
import { BUILDINGS, GREAT, KEEP_UPGRADE_SECONDS_BY_LEVEL, REARM, SIM, UNITS } from '../src/config.ts';
import { canRearm, cmdAttackRegiment, cmdBuild, cmdRearm, cmdUpgrade, cmdUpgradeKeep } from '../src/sim/commands.ts';
import { topMorale } from '../src/sim/combat.ts';
import { eraOf, greatFactor, startBuilding } from '../src/sim/economy.ts';
import { checkSite } from '../src/sim/placement.ts';
import { townX, townZ } from '../src/sim/terrain.ts';
import { COMPUTER, PLAYER, RESOURCE_IDS, type UnitKind } from '../src/sim/types.ts';
import { createWorld, spawnRegiment, stepWorld, type World } from '../src/sim/world.ts';
import { fillRegiment } from '../src/sim/campaign.ts';
import { run } from './helpers.ts';

// The later ages: keep levels 4 and 5, buildings at levels 4 and 5, the firearms and the great buildings.

function richWorld(): World {
  const world = createWorld({ seed: 1, difficulty: 'normal', computerPlays: false });
  for (const id of RESOURCE_IDS) world.towns[PLAYER].stock[id] = 20000;
  return world;
}

function raiseKeepTo(world: World, level: number): void {
  const town = world.towns[PLAYER];
  while (town.keepLevel < level) {
    expect(cmdUpgradeKeep(world, PLAYER)).toBe('ok');
    run(world, (KEEP_UPGRADE_SECONDS_BY_LEVEL[town.keepLevel] as number) + 1);
  }
}

/** A finished building of `kind` on open ground east of the keep (as if built), returning its plot. */
function standing(world: World, kind: keyof typeof BUILDINGS, dx: number, dz: number): number {
  const town = world.towns[PLAYER];
  const check = checkSite(world, PLAYER, kind, townX(PLAYER) + dx, townZ(PLAYER) + dz, 0);
  expect(check.result).toBe('ok');
  const plot = startBuilding(town, kind, check.site);
  const b = town.plots[plot];
  if (!b) throw new Error('not built');
  b.constructionLeftS = 0;
  b.matDelivered = b.matTotal;
  return plot;
}

describe('the later ages', () => {
  it('the keep enters the second and third age at levels 4 and 5, each a longer work', () => {
    const world = richWorld();
    const town = world.towns[PLAYER];
    expect(eraOf(town)).toBe(1);
    raiseKeepTo(world, 3);
    expect(eraOf(town)).toBe(1);
    expect(cmdUpgradeKeep(world, PLAYER)).toBe('ok');
    run(world, (KEEP_UPGRADE_SECONDS_BY_LEVEL[3] as number) - 5);
    expect(town.keepLevel).toBe(3);
    run(world, 6);
    expect(eraOf(town)).toBe(2);
    raiseKeepTo(world, 5);
    expect(eraOf(town)).toBe(3);
    expect(cmdUpgradeKeep(world, PLAYER)).toBe('maxLevel');
  });

  it('a building rises past level 3 only with its keep; the age\'s workshops and great buildings wait for theirs', () => {
    const world = richWorld();
    const town = world.towns[PLAYER];
    const plot = standing(world, 'house', 40, 0);
    const b = town.plots[plot];
    if (!b) throw new Error('no house');
    const upgraded = (): void => {
      expect(cmdUpgrade(world, PLAYER, plot)).toBe('ok');
      // Done when the builders have finished (the materials carried in first).
      for (let s = 0; s < 400 && b.constructionLeftS > 0; s++) run(world, 1);
      expect(b.constructionLeftS).toBe(0);
    };
    upgraded();
    upgraded();
    expect(b.level).toBe(3);
    expect(cmdUpgrade(world, PLAYER, plot)).toBe('needsKeep');
    expect(checkSite(world, PLAYER, 'gunsmith', townX(PLAYER) + 40, townZ(PLAYER) + 30, 0).result).toBe('needsKeep');
    expect(checkSite(world, PLAYER, 'cathedral', townX(PLAYER) + 40, townZ(PLAYER) + 30, 0).result).toBe('needsKeep');
    raiseKeepTo(world, 4);
    upgraded();
    expect(b.level).toBe(4);
    // Level 5 waits for keep 5.
    expect(cmdUpgrade(world, PLAYER, plot)).toBe('needsKeep');
    expect(checkSite(world, PLAYER, 'gunsmith', townX(PLAYER) + 40, townZ(PLAYER) + 30, 0).result).toBe('ok');
    // A great building, once to a town.
    standing(world, 'cathedral', -40, 30);
    expect(checkSite(world, PLAYER, 'cathedral', townX(PLAYER) + 40, townZ(PLAYER) - 40, 0).result).toBe('onlyOne');
    expect(cmdBuild(world, PLAYER, 'manufactory', townX(PLAYER) + 40, townZ(PLAYER) - 40, 0)).toBe('needsKeep');
  });

  it('the cathedral lifts every regiment\'s heart; the manufactory speeds the workshops', () => {
    const world = richWorld();
    const r = spawnRegiment(world, PLAYER, 'swordsmen', townX(PLAYER) + 30, townZ(PLAYER), 0);
    stepWorld(world, SIM.stepSeconds);
    const before = topMorale(world, r);
    raiseKeepTo(world, 3);
    standing(world, 'cathedral', -40, 30);
    stepWorld(world, SIM.stepSeconds);
    expect(topMorale(world, r)).toBe(before + GREAT.cathedralMorale);
    // The manufactory (once finished) speeds every workshop's cycle; the town hall the houses' tax.
    const town = world.towns[PLAYER];
    expect(greatFactor(town, 'smithy')).toBe(1);
    raiseKeepTo(world, 5);
    standing(world, 'manufactory', 40, -40);
    standing(world, 'townHall', -40, -40);
    stepWorld(world, SIM.stepSeconds);
    expect(greatFactor(town, 'smithy')).toBe(GREAT.manufactoryProductionFactor);
    expect(greatFactor(town, 'house')).toBe(GREAT.townHallGoldFactor);
  });

  it('a musket shoots a ball with a report and smoke, and goes through armour an arrow does not', () => {
    const world = createWorld({ seed: 3, difficulty: 'normal', computerPlays: false });
    const shooters = spawnRegiment(world, PLAYER, 'musketeers', 0, 0, Math.PI);
    fillRegiment(shooters, 12);
    const target = spawnRegiment(world, COMPUTER, 'swordsmen', 0, -55, 0);
    fillRegiment(target, 12);
    let shots = 0;
    for (let s = 0; s < 70 / SIM.stepSeconds; s++) {
      world.events.clear();
      stepWorld(world, SIM.stepSeconds);
      for (let i = 0; i < world.events.count; i++) if (world.events.items[i]?.kind === 'musketShot') shots++;
    }
    expect(shots).toBeGreaterThan(5);
    expect(target.aliveMen).toBeLessThan(12);
    expect(UNITS.musketeers.missilePierce).toBeGreaterThan(UNITS.crossbowmen.missilePierce);
  });

  it('a regiment is re-armed from age to age: the militia\'s levy to musketeers, then to the line', () => {
    const world = richWorld();
    const town = world.towns[PLAYER];
    const plot = standing(world, 'barracks', 40, 0);
    const barracks = town.plots[plot];
    if (!barracks) throw new Error('no barracks');
    const r = spawnRegiment(world, PLAYER, 'militia', barracks.x + Math.sin(barracks.yawRad) * 14, barracks.z + Math.cos(barracks.yawRad) * 14, 0);
    stepWorld(world, SIM.stepSeconds);
    // The musket waits for barracks of the second age.
    expect(canRearm(world, r.id, 'musketeers')).toBe('needsBarracks');
    raiseKeepTo(world, 5);
    barracks.level = 4;
    expect(cmdRearm(world, r.id, 'musketeers')).toBe('ok');
    run(world, REARM.seconds + 1);
    expect(r.kind).toBe('musketeers');
    expect(r.def.defenceOnly).toBeFalsy();
    expect(canRearm(world, r.id, 'lineInfantry')).toBe('needsBarracks');
    barracks.level = 5;
    expect(cmdRearm(world, r.id, 'lineInfantry')).toBe('ok');
    run(world, REARM.seconds + 1);
    expect(r.kind).toBe('lineInfantry');
    // Every medieval kind has a way into a later age, the foot to the musket and the horse to the new horse.
    for (const kind of ['pikemen', 'archers', 'swordsmen', 'halberdiers', 'crossbowmen', 'lightCavalry', 'heavyCavalry'] as const) {
      expect(REARM.paths[kind].some((to) => UNITS[to].barracksLevel >= 4)).toBe(true);
      for (const to of REARM.paths[kind]) expect(UNITS[to].cavalry).toBe(UNITS[kind].cavalry);
    }
  });

  it('the ages\' arms have their counters: no new kind beats every other', { timeout: 120_000 }, () => {
    /** Share of a's men standing when the fight ends, less b's (over three seeds, both attacking from 100 m). */
    const edge = (a: UnitKind, b: UnitKind): number => {
      let sum = 0;
      for (let seed = 1; seed <= 3; seed++) {
        const world = createWorld({ seed, difficulty: 'normal', computerPlays: false });
        const ra = spawnRegiment(world, PLAYER, a, 0, 50, Math.PI);
        const rb = spawnRegiment(world, COMPUTER, b, 0, -50, 0);
        cmdAttackRegiment(world, ra.id, rb.id);
        cmdAttackRegiment(world, rb.id, ra.id);
        for (let t = 0; t < 300 / SIM.stepSeconds; t++) {
          stepWorld(world, SIM.stepSeconds);
          if (ra.aliveMen === 0 || rb.aliveMen === 0 || ra.state === 'routing' || rb.state === 'routing') break;
        }
        const left = (r: typeof ra): number => (r.state === 'routing' ? 0 : r.aliveMen / r.initialMen);
        sum += left(ra) - left(rb);
      }
      return sum / 3;
    };
    // Muskets beat the pike and the bow; the line beats the musket; the rifle the line; the cuirassier the
    // musket and the halberd the cuirassier; the hussar rides down the archers.
    expect(edge('musketeers', 'pikemen')).toBeGreaterThan(0);
    expect(edge('musketeers', 'archers')).toBeGreaterThan(0);
    expect(edge('lineInfantry', 'musketeers')).toBeGreaterThan(0);
    expect(edge('riflemen', 'lineInfantry')).toBeGreaterThan(0);
    expect(edge('cuirassiers', 'musketeers')).toBeGreaterThan(0);
    expect(edge('halberdiers', 'cuirassiers')).toBeGreaterThan(0);
    expect(edge('hussars', 'archers')).toBeGreaterThan(0);
  });

  it('a skirmish begun in a later age: every keep at the age, barracks of the age standing, the age\'s arms in store', () => {
    const world = createWorld({ seed: 2, difficulty: 'normal', computerPlays: true, startAge: 2 });
    expect(world.startAge).toBe(2);
    for (const town of world.towns) {
      expect(town.keepLevel).toBe(4);
      expect(eraOf(town)).toBe(2);
      const barracks = town.plots.find((b) => b !== null && b.kind === 'barracks');
      expect(barracks?.level).toBe(4);
      expect(barracks?.constructionLeftS).toBe(0);
      expect(town.stock.musket).toBeGreaterThan(0);
    }
    // The middle ages start as ever.
    const plain = createWorld({ seed: 2, difficulty: 'normal', computerPlays: true });
    expect(plain.towns[PLAYER].keepLevel).toBe(1);
    expect(plain.towns[PLAYER].plots.some((b) => b !== null)).toBe(false);
  });

  it('every age has two guns: a light cheap one, and a dear one that reaches farther', () => {
    const pairs: [UnitKind, UnitKind, number][] = [['cannon', 'mortar', 1], ['falconets', 'culverins', 4], ['horseGuns', 'fieldGuns', 5]];
    for (const [light, heavy, foundry] of pairs) {
      expect(UNITS[light].engine && UNITS[heavy].engine).toBe(true);
      expect(UNITS[light].goldCost).toBeLessThan(UNITS[heavy].goldCost);
      expect(UNITS[light].missileRangeM).toBeLessThan(UNITS[heavy].missileRangeM);
      expect(UNITS[light].trainedAt).toBe('foundry');
      if (foundry > 1) expect(UNITS[light].barracksLevel).toBe(foundry);
    }
    // Each age reaches farther than the one before.
    expect(UNITS.culverins.missileRangeM).toBeGreaterThan(UNITS.mortar.missileRangeM);
    expect(UNITS.fieldGuns.missileRangeM).toBeGreaterThan(UNITS.culverins.missileRangeM);
    // A game begun in the second age has a foundry of that age standing: its guns can be cast at once.
    const world = createWorld({ seed: 2, difficulty: 'normal', computerPlays: false, startAge: 2 });
    expect(world.towns[PLAYER].plots.find((b) => b !== null && b.kind === 'foundry')?.level).toBe(4);
  });
});
