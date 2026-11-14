import { townX, townZ } from './sim/terrain.ts';
import { Game } from './app/game.ts';
import { WorldView } from './app/worldView.ts';
import { SIM } from './config.ts';
import { cmdAttackRegiment, cmdBuild, cmdBuildGate, cmdBuildRoad, cmdBuildWall } from './sim/commands.ts';
import { doorX, doorZ, KEEP } from './sim/people.ts';
import { planSite } from './sim/sitePlanner.ts';
import { BUILDING_KINDS, COMPUTER, type Difficulty, PLAYER, UNIT_KINDS } from './sim/types.ts';
import { spawnRegiment, stepWorld } from './sim/world.ts';
import type { Quality } from './render/stage.ts';
import { Menu } from './ui/menu.ts';
import { Sound } from './ui/sound.ts';

// Entry point: menu, loading, game, end screen. URL switches for measuring
// (tools/measure/README.md): `?autostart` skips the menu, `&q=high|low` picks
// the preset, `&debug` exposes `window.__debug`, `&scene=battle|town` starts in
// a prepared situation, `&seed=` fixes the game's random numbers.

interface DebugApi {
  place(view: { x?: number; z?: number; distance?: number; y?: number; yaw?: number }): void;
  spot(name: string): void;
  /** Runs the simulation ahead this many seconds at once (screenshots of a town at work). */
  step(seconds: number): void;
  game: Game;
}

declare global {
  interface Window {
    __ready?: boolean;
    __debug?: DebugApi;
  }
}

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('view') as HTMLCanvasElement;
const hudRoot = document.getElementById('hud') as HTMLElement;
const menu = new Menu(document.getElementById('ui') as HTMLElement);
const sound = new Sound();
const autostart = params.has('autostart');

function askedQuality(): Quality | null {
  const q = params.get('q');
  return q === 'high' || q === 'low' ? q : null;
}

/** Phones and tablets start on Low; a desktop on High. */
function defaultQuality(): Quality {
  return matchMedia('(pointer: coarse)').matches ? 'low' : 'high';
}

/** Prepared situations for screenshots and benchmarks. */
function prepareScene(game: Game, scene: string): void {
  const world = game.world;
  if (scene === 'town' || scene === 'battle') {
    for (const side of [PLAYER, COMPUTER] as const) {
      const town = world.towns[side];
      town.stock.gold = 20000;
      town.stock.wood = 5000;
      town.stock.stone = 5000;
      town.stock.bread = 5000;
      // One of everything (two farms and three houses), where the computer's planner would put it, with roads to the keep.
      for (const kind of [...BUILDING_KINDS, 'farm', 'house', 'house', 'tower'] as const) {
        const site = planSite(world, side, kind);
        if (!site) continue;
        const x = site.x;
        const z = site.z;
        if (cmdBuild(world, side, kind, x, z, site.yawRad) !== 'ok') continue;
        const b = town.plots.find((other) => other !== null && other.x === x && other.z === z);
        if (b) cmdBuildRoad(world, side, doorX(town, town.plots.indexOf(b)), doorZ(town, town.plots.indexOf(b)), doorX(town, KEEP), doorZ(town, KEEP));
      }
      // A stretch of wall across the approach from the enemy, with a gate in the middle.
      const t = side === PLAYER ? 1 : -1;
      const wx = townX(side) + t * 62;
      const wz = townZ(side) - t * 62;
      cmdBuildWall(world, side, wx - 30 * t, wz - 30 * t, wx + 30 * t, wz + 30 * t);
      cmdBuildGate(world, side, wx, wz);
      // Built at once: the scene is for looking at, not for waiting.
      for (const b of town.plots) {
        if (!b) continue;
        b.constructionLeftS = 0;
        b.matWaiting.wood = 0;
        b.matWaiting.stone = 0;
        b.matDelivered = b.matTotal;
      }
    }
    world.ai = null;
    // Four minutes of town life: people move in, the fields are broken and sown.
    for (let i = 0; i < 240 * 60; i++) stepWorld(world, SIM.stepSeconds);
  }
  if (scene === 'battle') {
    // A regiment of every kind a side (91 men each) meets in the middle of the field.
    const kinds = UNIT_KINDS;
    const mine: number[] = [];
    const theirs: number[] = [];
    kinds.forEach((kind, i) => {
      const along = (i - (kinds.length - 1) / 2) * 11;
      // The battle line lies across the road between the towns (which runs along x = −z).
      const lx = along * Math.SQRT1_2;
      const lz = along * Math.SQRT1_2;
      mine.push(spawnRegiment(world, PLAYER, kind, lx - 16, lz + 16, Math.PI * 0.75).id);
      theirs.push(spawnRegiment(world, COMPUTER, kind, lx + 16, lz - 16, -Math.PI * 0.25).id);
    });
    mine.forEach((id, i) => {
      cmdAttackRegiment(world, id, theirs[i] as number);
      cmdAttackRegiment(world, theirs[i] as number, id);
    });
    const seconds = Number(params.get('t') ?? 8);
    for (let i = 0; i < seconds * 60; i++) stepWorld(world, SIM.stepSeconds);
    world.events.clear();
    game.spot('field');
  }
}

async function run(): Promise<void> {
  let difficulty: Difficulty = 'normal';
  let quality = askedQuality() ?? defaultQuality();
  if (!autostart) {
    const choice = await menu.start({ difficulty, quality });
    difficulty = choice.difficulty;
    quality = askedQuality() ?? choice.quality;
    sound.unlock();
  }
  menu.loading(0);
  const loadStart = performance.now();
  const view = new WorldView(canvas, quality);
  await view.load((share) => menu.loading(share));
  const loadedSeconds = (performance.now() - loadStart) / 1000;
  const seedParam = Number(params.get('seed'));
  const game = new Game(view, hudRoot, sound, {
    seed: params.has('seed') && Number.isFinite(seedParam) ? seedParam : Math.floor(performance.now() * 1000) % 2147483647,
    difficulty,
    // Measurements want the full picture at a fixed scale, and no map sliding under a parked cursor.
    governor: !autostart,
    edgeScroll: !autostart,
  });
  const scene = params.get('scene');
  if (scene) prepareScene(game, scene);
  menu.hide();

  const openMenu = (): void => {
    if (game.world.winner !== -1) return;
    game.loop.paused = true;
    menu.pause(
      loadedSeconds,
      () => {
        game.loop.paused = false;
        menu.hide();
      },
      () => location.reload(),
    );
  };
  game.onMenu = openMenu;
  game.onEnd = (winner) => menu.end(game.world, winner, () => location.reload());
  // The Android back button and a hidden tab pause the game.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !autostart) openMenu();
  });

  if (params.has('debug')) {
    window.__debug = {
      place: (v) => game.place(v.x ?? game.camera.goal.targetX, v.z ?? game.camera.goal.targetZ, v.distance ?? v.y ?? game.camera.goal.distanceM, v.yaw ?? game.camera.goal.yawRad),
      spot: (name) => game.spot(name),
      step: (seconds) => {
        for (let i = 0; i < Math.round(seconds / SIM.stepSeconds); i++) stepWorld(game.world, SIM.stepSeconds);
      },
      game,
    };
  }
  game.loop.start();
  // Ready once the first frames have really been drawn.
  const waitForFrames = (): void => {
    if (game.frames >= 3) window.__ready = true;
    else requestAnimationFrame(waitForFrames);
  };
  requestAnimationFrame(waitForFrames);
}

run().catch((err: unknown) => {
  console.error('the game failed to start:', err);
  const ui = document.getElementById('ui') as HTMLElement;
  ui.style.display = 'flex';
  ui.textContent = `The game failed to start: ${err instanceof Error ? err.message : String(err)}`;
});
