import { townX, townZ } from './sim/terrain.ts';
import { LAYOUT, START } from './sim/layout.ts';
import type { GameMode } from './sim/world.ts';
import type { AiCharacter } from './config.ts';
import { loadWorld, saveHeader, saveWorld } from './sim/save.ts';
import { loadSettings, readSave, storeSettings, writeSave } from './ui/settings.ts';
import { T } from './ui/strings.ts';
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
import { startOffline } from './ui/offline.ts';
import { reportGraphics, watchGraphics } from './ui/gfxReport.ts';
import { loadProgress, missionWon } from './ui/campaignStore.ts';
import { carryOut, MISSIONS } from './sim/campaign.ts';

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
startOffline();
watchGraphics();

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
        b.matWaiting.planks = 0;
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
  const askedDifficulty = params.get('d');
  let difficulty: Difficulty = askedDifficulty === 'easy' || askedDifficulty === 'hard' ? askedDifficulty : 'normal';
  let quality = askedQuality() ?? defaultQuality();
  // Back from choosing another place for the keeps (below): straight into the game, and the next reload
  // shows the menu again, on the place chosen.
  const chosenAlready = params.has('go');
  // Back from loading a game saved on another map: load it once the map is laid out.
  let loadSave = params.has('load');
  if (chosenAlready || loadSave) {
    params.delete('go');
    params.delete('load');
    history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
  }
  // The kind of game and the computer's character: from the menu, or kept in the address across a reload.
  const askedMode = params.get('mode');
  let mode: GameMode = askedMode === 'defence' || askedMode === 'tutorial' || askedMode === 'campaign' ? askedMode : 'skirmish';
  // The campaign's mission (its map and keeps come in the address with it).
  let mission = Math.min(MISSIONS.length, Math.max(1, Number(params.get('mission') ?? 1) || 1));
  const askedCharacter = params.get('ai');
  let character: AiCharacter = askedCharacter === 'builder' || askedCharacter === 'raider' ? askedCharacter : 'balanced';
  const settings = loadSettings();
  sound.setVolume(settings.volume);
  const savedText = readSave();
  const saved = savedText ? saveHeader(savedText) : null;
  if (!autostart && !chosenAlready && !loadSave) {
    const choice = await menu.start({ difficulty, quality, start: START, map: LAYOUT, mode, character, mission }, saved, loadProgress());
    difficulty = choice.difficulty;
    quality = askedQuality() ?? choice.quality;
    mode = choice.mode;
    character = choice.character;
    sound.unlock();
    if (choice.mode === 'campaign' && !choice.load) {
      // A mission: its own map and keeps, laid out on a reload.
      mission = choice.mission ?? 1;
      const def = MISSIONS[mission - 1] ?? MISSIONS[0];
      params.set('start', String(def?.start ?? 0));
      params.set('map', def?.layout ?? 'field');
      params.set('mode', 'campaign');
      params.set('mission', String(mission));
      params.set('d', difficulty);
      params.set('q', quality);
      params.set('go', '1');
      location.search = params.toString();
      return;
    }
    if (choice.load && saved) {
      loadSave = true;
      // A game saved on another map loads after the page is laid out for that map.
      if (saved.start !== START || saved.layout !== LAYOUT) {
        params.set('start', String(saved.start));
        params.set('map', saved.layout);
        params.set('q', quality);
        params.set('load', '1');
        location.search = params.toString();
        return;
      }
    } else if (choice.start !== START || choice.map !== LAYOUT) {
      // The map is laid out from the keeps and the layout when the game loads: load it again with the new choice.
      params.set('start', String(choice.start));
      params.set('map', choice.map);
      params.set('mode', mode);
      params.set('ai', character);
      params.set('d', difficulty);
      params.set('q', quality);
      params.set('go', '1');
      location.search = params.toString();
      return;
    }
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
    mode,
    character,
    // A mission starts from what the one before it carried out (none when it is played anew from the list).
    campaign: mode === 'campaign' ? { mission, carried: loadProgress().carryInto[mission]?.carried ?? [], gold: loadProgress().carryInto[mission]?.gold ?? 0 } : undefined,
    // Measurements want the full picture at a fixed scale, and no map sliding under a parked cursor.
    governor: !autostart,
    edgeScroll: !autostart,
  });
  const scene = params.get('scene');
  if (scene) prepareScene(game, scene);
  if (loadSave && savedText) game.loadSaved(loadWorld(savedText));
  game.setEdgeScroll(settings.edgeScroll && !autostart);
  menu.hide();
  // Graphics errors in the first seconds (shaders refused, a lost context): a report to photograph.
  // `?gfxreport` shows it regardless, to see what a device reports.
  window.setTimeout(() => reportGraphics(document.body, view.stage.backendName, params.has('gfxreport')), 6000);

  const openMenu = (): void => {
    if (game.world.winner !== -1) return;
    game.loop.paused = true;
    menu.pause(loadedSeconds, {
      resume: () => {
        game.loop.paused = false;
        menu.hide();
      },
      restart: () => location.reload(),
      save: () => (writeSave(saveWorld(game.world)) ? T.saved : T.saveFailed),
      settings,
      changed: (next) => {
        Object.assign(settings, next);
        storeSettings(settings);
        sound.setVolume(settings.volume);
        game.setEdgeScroll(settings.edgeScroll);
      },
    });
  };
  game.onMenu = openMenu;
  game.onEnd = (winner) => {
    const c = game.world.campaign;
    if (!c) {
      menu.end(game.world, winner, () => location.reload());
      return;
    }
    const won = winner === PLAYER;
    if (won) {
      const out = carryOut(game.world);
      missionWon(c.mission, c.stars, out.carried, out.gold);
    }
    const nextDef = MISSIONS[c.mission];
    const go = (n: number): void => {
      const def = MISSIONS[n - 1] ?? MISSIONS[0];
      params.set('start', String(def?.start ?? 0));
      params.set('map', def?.layout ?? 'field');
      params.set('mode', 'campaign');
      params.set('mission', String(n));
      params.set('go', '1');
      location.search = params.toString();
    };
    menu.campaignEnd(game.world, c.mission, won, c.stars, {
      next: won && nextDef?.ready ? () => go(nextDef.n) : null,
      retry: () => go(c.mission),
      list: () => {
        params.delete('go');
        params.set('mode', 'campaign');
        location.search = params.toString();
      },
    });
  };
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
