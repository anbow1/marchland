// A whole game without a screen: both towns run by the computer's rules for
// `minutes`, printing each town's state once a minute. Balance work reads this.
//   npx vite-node tools/timeline.ts [minutes] [seed]
import { SIM } from '../src/config.ts';
import { createAiState } from '../src/sim/ai.ts';
import { RESOURCE_IDS } from '../src/sim/types.ts';
import { createWorld, menAlive, stepWorld } from '../src/sim/world.ts';

const minutes = Number(process.argv[2] ?? 30);
const seed = Number(process.argv[3] ?? 7);
const both = process.argv[4] === 'both';
const world = createWorld({ seed, difficulty: 'normal', computerPlays: true });
const second = both ? createAiState(0) : null;
const { stepAi } = await import('../src/sim/ai.ts');

for (let minute = 1; minute <= minutes && world.winner === -1; minute++) {
  for (let i = 0; i < Math.round(60 / SIM.stepSeconds); i++) {
    if (second) stepAi(world, second, SIM.stepSeconds);
    stepWorld(world, SIM.stepSeconds);
  }
  for (const side of both ? ([0, 1] as const) : ([1] as const)) {
    const town = world.towns[side];
    const people = world.people.filter((p) => p.side === side);
    const roles: Record<string, number> = {};
    for (const p of people) roles[p.role] = (roles[p.role] ?? 0) + 1;
    const kinds: Record<string, number> = {};
    let building = 0;
    for (const b of town.plots) {
      if (!b) continue;
      kinds[b.kind] = (kinds[b.kind] ?? 0) + 1;
      if (b.constructionLeftS > 0) building++;
    }
    const stock = RESOURCE_IDS.filter((r) => town.stock[r] >= 0.5).map((r) => `${r} ${town.stock[r].toFixed(0)}`).join(', ');
    console.log(
      `${String(minute).padStart(2)}' side ${side} | people ${people.length} ${JSON.stringify(roles)} | men ${menAlive(world, side)} arms ${town.underArms} | ${town.starving ? 'STARVING ' : ''}${stock}`,
    );
    console.log(`     buildings ${Object.entries(kinds).map(([k, n]) => `${k}×${n}`).join(' ')} (${building} unfinished) keep ${town.keepHp.toFixed(0)}`);
  }
}
console.log('winner', world.winner, 'time', (world.timeS / 60).toFixed(1));
