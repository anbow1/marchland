import { describe, expect, it } from 'vitest';
import { SIM } from '../src/config.ts';
import { createAiState, stepAi } from '../src/sim/ai.ts';
import { loadWorld, saveHeader, saveWorld } from '../src/sim/save.ts';
import { PLAYER } from '../src/sim/types.ts';
import { createWorld, stepWorld, type World } from '../src/sim/world.ts';

/** What two games must agree on to be the same game. */
function fingerprint(world: World): string {
  const towns = world.towns.map((t) => [t.keepHp, t.keepLevel, Math.round(t.stock.gold), t.stock.wood, t.stock.stone, t.plots.filter((b) => b !== null).length].join(','));
  const men = world.regiments.map((r) => `${r.id}:${r.aliveMen}:${r.centreX.toFixed(3)}:${r.centreZ.toFixed(3)}`).join(' ');
  const people = world.people.filter((p) => p.alive).map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`).join(' ');
  return `${world.timeS.toFixed(3)} | ${towns.join(' | ')} | ${men} | ${people} | ${world.stand.changed.size} | ${world.points.map((p) => p.owner).join(',')}`;
}

describe('saving a game', () => {
  it('a saved and loaded game goes on exactly as the one it was saved from', () => {
    const world = createWorld({ seed: 11, difficulty: 'normal', computerPlays: true });
    const second = createAiState(PLAYER);
    const play = (w: World, ai: typeof second, seconds: number): void => {
      for (let i = 0; i < Math.round(seconds / SIM.stepSeconds); i++) {
        stepAi(w, ai, SIM.stepSeconds);
        stepWorld(w, SIM.stepSeconds);
      }
    };
    play(world, second, 8 * 60);
    const text = saveWorld(world);
    expect(saveHeader(text)?.timeS).toBeCloseTo(world.timeS);
    const copy = loadWorld(text);
    const copyAi = JSON.parse(JSON.stringify(second)) as typeof second;
    expect(fingerprint(copy)).toBe(fingerprint(world));
    play(world, second, 4 * 60);
    play(copy, copyAi, 4 * 60);
    expect(fingerprint(copy)).toBe(fingerprint(world));
    // A save of a whole town and two armies stays small enough for the browser's storage.
    expect(text.length).toBeLessThan(4_000_000);
  }, 120_000);
});
