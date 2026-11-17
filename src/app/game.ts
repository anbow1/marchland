import { AI, type AiCharacter, CAMERA, DEFENCE, FIELDS, GATE, MAP, POINTS, ROADS, TOWN } from '../config.ts';
import { FixedLoop } from '../core/loop.ts';
import { cmdAttackBuilding, cmdBombard, cmdAttackRegiment, cmdBuild, cmdBuildGate, cmdBuildRoad, cmdBuildWall, cmdDemolish, cmdTrade, cmdTurnSite, cmdGarrison, cmdHalt, cmdMerge, cmdPace, cmdClearQueue, cmdMoveFormation, cmdMoveGroup, cmdQueue, captureFormation, type FormationPlace, formationSpots, groupLineSpots, cmdKindPriority, cmdOrder, cmdOrderRegiments, orderedGoodsFor, cmdPriority, cmdRearm, cmdRecruit, cmdReinforce, cmdTogglePaused, cmdUpgradeTransport, cmdFireAtWill, cmdFormation, cmdRanks, cmdStance, cmdUngarrison, cmdUpgrade, cmdUpgradeKeep, roadCost, wallCost } from '../sim/commands.ts';
import type { GameEvent } from '../sim/events.ts';
import { type Formation, frontageM, type Regiment, type Stance } from '../sim/regiment.ts';
import { cellX, cellZ, gateCells, roadCells, wallCellAt, wallCells } from '../sim/nav.ts';
import { checkSite, mayLayRoadAt, nearestOwnBuildingM, reachOf, yawToKeep } from '../sim/placement.ts';
import { cliffKind, DEPOSITS, forestCoverAt, heightAtM, isWater, rallyX, rallyZ, townX, townZ } from '../sim/terrain.ts';
import { type BuildingKind, type CommandResult, COMPUTER, type Difficulty, NOWHERE, PLAYER, RESOURCE_IDS, type ResourceId, type Side, type UnitKind } from '../sim/types.ts';
import { type CampaignSetup, type CampaignState, canPayTribute, payTribute } from '../sim/campaign.ts';
import { createWorld, findRegiment, type GameMode, stepWorld, type World } from '../sim/world.ts';
import { workState } from '../sim/economy.ts';
import { CpuTimer } from '../render/perf.ts';
import { Hud } from '../ui/hud.ts';
import type { Sound } from '../ui/sound.ts';
import { T } from '../ui/strings.ts';
import type { Action } from './bindings.ts';
import { Controls, type ControlTarget } from './controls.ts';
import { groundHit, type Ray } from './picking.ts';
import { RtsCamera } from './rtsCamera.ts';
import type { GroundTiles } from '../render/markers.ts';
import type { Ghost, WorldView } from './worldView.ts';

// One game from first step to the fall of a keep: owns the world, the camera,
// the selection and the loop; turns the player's gestures into the commands of
// sim/commands.ts and the world's events into sound and messages.

export interface GameOptions {
  seed: number;
  difficulty: Difficulty;
  /** The kind of game and (skirmish) the computer's character. */
  mode?: GameMode;
  character?: AiCharacter;
  /** The campaign's mission and what it starts from (mode 'campaign'). */
  campaign?: CampaignSetup;
  /** Lets the frame governor trade resolution for frame rate. Off for measurements. */
  governor: boolean;
  edgeScroll: boolean;
}

/** What the player is placing on the map: a building (turned by `turns` eighths of a circle from facing the keep), or a road from a point. */
type Tool = { kind: 'build'; building: BuildingKind; turns: number } | { kind: 'road' | 'wall'; fromX: number; fromZ: number; started: boolean } | { kind: 'gate' };

/** Least seconds between two "enemy at the town" warnings. */
const WARNING_GAP_S = 45;
/** An enemy regiment this close to one of the player's buildings is a raid; told at most this often. */
const RAID_RADIUS_M = 30;
const RAID_GAP_S = 40;
/** A workshop's yard full this long raises an alarm (and again after three times as long). */
const YARD_FULL_ALARM_S = 60;

export class Game implements ControlTarget {
  /** The game being played; replaced whole when a saved game is loaded. */
  world: World;
  readonly camera: RtsCamera;
  readonly loop: FixedLoop;
  readonly hud: Hud;
  private readonly controls: Controls;
  private readonly selected = new Set<number>();
  /** The selected building's plot, KEEP for the keep, NOWHERE for none. */
  private selectedPlot: number = NOWHERE;
  private tool: Tool | null = null;
  private readonly ghost: Ghost = { kind: 'house', x: 0, z: 0, yawRad: 0, allowed: false };
  /** A right-button drag laying out the selected regiments' line, in screen points; null when there is none. */
  private facingDrag: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private readonly spotScratch: number[] = [];
  /** Kept formations of several regiments, by group number (Ctrl and a digit keeps one). */
  private readonly formations = new Map<number, FormationPlace[]>();
  private readonly tiles: GroundTiles = { values: [], count: 0, allowed: true };
  private readonly cursor = { x: 0, y: 0 };
  private readonly roadScratch: number[] = [];
  private hint = '';
  private hoverAgeS = 0;
  private readonly ray: Ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: -1, dz: 0 };
  private readonly hit = { x: 0, z: 0 };
  private readonly screen = { x: 0, y: 0 };
  private readonly corners: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  private readonly timer = new CpuTimer();
  private lastWarningS = -WARNING_GAP_S;
  private fps = 60;
  private framesDrawn = 0;
  /** Called once when a keep falls. */
  onEnd: ((winner: Side) => void) | null = null;
  /** Called when the player asks for the menu (Esc with nothing selected, or the button). */
  onMenu: (() => void) | null = null;

  constructor(
    private readonly view: WorldView,
    hudRoot: HTMLElement,
    private readonly sound: Sound,
    options: GameOptions,
  ) {
    this.world = createWorld({ seed: options.seed, difficulty: options.difficulty, computerPlays: true, mode: options.mode ?? 'skirmish', character: options.character ?? 'balanced', campaign: options.campaign });
    if (this.world.mode === 'tutorial') {
      // Enough in the keep to follow every step without waiting on the economy.
      const stock = this.world.towns[PLAYER].stock;
      stock.gold += 800;
      stock.wood += 250;
      stock.stone += 150;
      stock.bread += 100;
    }
    // Start over the player's town, looking towards the enemy (north-east).
    this.camera = new RtsCamera(townX(PLAYER) + 18, townZ(PLAYER) - 18, Math.PI / 4);
    this.hud = new Hud(hudRoot, {
      pickBuilding: (kind) => this.pickTool({ kind: 'build', building: kind, turns: 0 }),
      pickRoad: () => this.pickTool({ kind: 'road', fromX: 0, fromZ: 0, started: false }),
      pickWall: () => this.pickTool({ kind: 'wall', fromX: 0, fromZ: 0, started: false }),
      pickGate: () => this.pickTool({ kind: 'gate' }),
      ungarrison: (plot) => this.report(cmdUngarrison(this.world, PLAYER, plot)),
      rotateCamera: (direction) => this.camera.rotate(direction * CAMERA.rotateStepRad),
      upgrade: (plot) => this.report(cmdUpgrade(this.world, PLAYER, plot)),
      turnSite: (plot) => this.report(cmdTurnSite(this.world, PLAYER, plot, this.gridOn ? 2 : 1)),
      upgradeKeep: () => this.report(cmdUpgradeKeep(this.world, PLAYER)),
      setFormation: (what, value) => {
        if (what === 'pace') {
          this.setPace(value === '1');
          return;
        }
        // Every selected regiment that can; a word only when none of them could.
        let any = false;
        let last: CommandResult = 'notThisUnit';
        for (const id of this.selected) {
          const result =
            what === 'ranks'
              ? cmdRanks(this.world, id, Number(value))
              : what === 'formation'
                ? cmdFormation(this.world, id, value as Formation)
                : what === 'stance'
                  ? cmdStance(this.world, id, value as Stance)
                  : cmdFireAtWill(this.world, id, value === '1');
          if (result === 'ok') any = true;
          else last = result;
        }
        if (any) this.sound.play('click');
        else this.report(last);
      },
      demolish: (plot) => this.report(cmdDemolish(this.world, PLAYER, plot)),
      trade: (good, buying) => this.report(cmdTrade(this.world, PLAYER, good, buying)),
      togglePaused: (plot) => this.report(cmdTogglePaused(this.world, PLAYER, plot)),
      recruit: (kind) => this.report(cmdRecruit(this.world, PLAYER, kind)),
      rearm: (id, kind) => this.report(cmdRearm(this.world, id, kind)),
      reinforce: (id) => this.report(cmdReinforce(this.world, id)),
      upgradeTransport: () => this.report(cmdUpgradeTransport(this.world, PLAYER)),
      setPriority: (good, priority) => this.report(cmdPriority(this.world, PLAYER, good, priority)),
      setKindPriority: (kind, priority) => this.report(cmdKindPriority(this.world, PLAYER, kind, priority)),
      setOrder: (good, amount) => this.report(cmdOrder(this.world, PLAYER, good, amount)),
      toggleGrid: () => this.toggleGrid(),
      togglePause: () => this.togglePause(),
      orderRegiments: (kind, count) => {
        const result = cmdOrderRegiments(this.world, PLAYER, kind, count);
        this.report(result);
        if (result !== 'ok') return;
        // What is now on order, so the player sees the order go in.
        const orders = this.world.towns[PLAYER].orders;
        const goods = orderedGoodsFor(kind);
        const list = RESOURCE_IDS.filter((id) => (goods[id] ?? 0) > 0)
          .map((id) => `${T.resources[id].toLowerCase()} ${orders[id] ?? 0}`)
          .join(', ');
        this.hud.toast(`${T.ordered}: ${list}`, 'good');
      },
      selectPlot: (plot) => {
        const b = this.world.towns[PLAYER].plots[plot];
        if (!b) return;
        this.selected.clear();
        this.selectedPlot = plot;
        this.camera.jumpTo(b.x, b.z);
        this.sound.play('click');
      },
      halt: () => this.haltSelected(),
      runMode: () => this.runMode,
      payTribute: () => {
        const c = this.world.campaign;
        if (c) this.report(payTribute(this.world, c));
      },
      merge: (kind) => this.mergeSelected(kind),
      selectAll: () => this.selectAll(),
      selectRegiment: (id, additive) => this.selectRegiment(id, additive),
      orderRegiment: (id) => this.attackRegiment(id),
      setSpeed: (speed) => {
        this.loop.speed = speed;
      },
      openMenu: () => this.onMenu?.(),
      jump: (x, z) => this.camera.jumpTo(x, z),
    });
    this.controls = new Controls(view.stage.canvas, this.camera, this);
    this.controls.edgeScroll = options.edgeScroll;
    try {
      // On unless the player switched it off.
      this.gridOn = localStorage.getItem('marchland.grid') !== '0';
    } catch {
      this.gridOn = true;
    }
    this.hud.gridOn = this.gridOn;
    this.loop = new FixedLoop({ step: (dt) => this.step(dt), render: (frameSeconds) => this.render(frameSeconds) });
    view.stage.governor.enabled = options.governor;
    window.addEventListener('resize', () => view.stage.resize());
  }

  get frames(): number {
    return this.framesDrawn;
  }

  /** Plays the interface sound for a command and tells the player why it was refused. */
  private report(result: CommandResult): void {
    if (result === 'ok') {
      this.sound.play('click');
      return;
    }
    this.sound.play('deny');
    this.hud.toast(T.results[result], 'bad');
  }

  private step(dtSeconds: number): void {
    this.timer.begin();
    stepWorld(this.world, dtSeconds);
    this.timer.lap('sim');
    const events = this.world.events;
    for (let i = 0; i < events.count; i++) this.onEvent(events.items[i] as GameEvent);
    events.clear();
    // Forget regiments that are gone.
    for (const id of this.selected) {
      const r = findRegiment(this.world, id);
      if (!r || r.aliveMen === 0) this.selected.delete(id);
    }
    this.warnOfAttack();
    this.watchTown();
    this.watchMode();
  }

  /**
   * The selected regiments of a kind become as few full ones as they can: the largest takes men from the
   * others in turn, up to its full strength; those that could not join stay as they are.
   */
  private mergeSelected(kind: UnitKind): void {
    const regs = this.world.regiments.filter((r) => this.selected.has(r.id) && r.kind === kind && r.side === PLAYER && r.aliveMen > 0).sort((a, b) => b.aliveMen - a.aliveMen);
    let any = false;
    let last: CommandResult = 'notThisUnit';
    for (let i = 0; i < regs.length; i++) {
      const into = regs[i] as Regiment;
      for (let j = i + 1; j < regs.length; j++) {
        const from = regs[j] as Regiment;
        if (from.aliveMen === 0 || into.aliveMen >= into.maxMen) continue;
        const result = cmdMerge(this.world, into.id, from.id);
        if (result === 'ok') any = true;
        else last = result;
      }
    }
    for (const r of regs) if (r.aliveMen === 0) this.selected.delete(r.id);
    if (any) {
      this.sound.play('click');
      this.hud.toast(T.merged, 'good');
    } else this.report(last);
  }

  private modeSecond = -1;
  private tutorialStep = 0;

  /** The tutorial's steps, each done when the town shows it; the defence's clock. Once a second. */
  private watchMode(): void {
    // Once a game second: the loop may take several steps in a frame, so not by the step count.
    const second = Math.floor(this.world.timeS);
    if (second === this.modeSecond) return;
    this.modeSecond = second;
    const world = this.world;
    if (world.mode === 'defence' && world.defence) {
      const left = Math.max(0, DEFENCE.lengthS - world.timeS);
      const next = Math.max(0, world.defence.nextS - world.timeS);
      this.hud.setBanner(`<b>${T.defenceLeft} ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}</b> · ${T.wave} ${world.defence.wave} · ${T.nextWave} ${Math.ceil(next)} s`);
      return;
    }
    if (world.campaign) {
      this.hud.setBanner(this.campaignBanner(world, world.campaign), true);
      return;
    }
    if (world.mode !== 'tutorial') return;
    const town = world.towns[PLAYER];
    const has = (kind: BuildingKind): boolean => town.plots.some((b) => b !== null && b.kind === kind);
    const mine = world.regiments.filter((r) => r.side === PLAYER && r.aliveMen > 0);
    const done = [
      () => has('woodcutter'),
      () => has('farm') && has('house'),
      () => has('windmill') && has('bakery'),
      () => has('quarry'),
      () => mine.length > 0 || town.recruitQueue.length > 0,
      () => mine.some((r) => r.order === 'move' || Math.hypot(r.centreX - rallyX(PLAYER), r.centreZ - rallyZ(PLAYER)) > 25),
      () => has('barracks'),
    ];
    while (this.tutorialStep < done.length && (done[this.tutorialStep] as () => boolean)()) {
      this.tutorialStep++;
      this.sound.play('build');
    }
    const steps = T.tutorialSteps;
    this.hud.setBanner(
      this.tutorialStep >= steps.length
        ? `<b>${T.tutorialTitle}</b> · ${T.tutorialDone}`
        : `<b>${T.tutorialTitle} ${this.tutorialStep + 1}/${steps.length}</b> · ${steps[this.tutorialStep]}`,
    );
  }

  /** The line at the top in a mission: what it asks and how long is left; the tribute's button. */
  private campaignBanner(world: World, c: CampaignState): string {
    const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const title = T.missions[c.mission - 1]?.title ?? '';
    if (c.mission === 1) {
      if (c.attacking) return `<b>${title}</b> · ${T.hostComing}`;
      const stock = world.towns[PLAYER].stock;
      const goods = Object.entries(c.tribute)
        .map(([id, n]) => {
          const have = Math.floor(stock[id as ResourceId]);
          return `<span class="${have >= (n ?? 0) ? 'ok' : 'short'}">${n} ${T.resources[id as ResourceId].toLowerCase()} (${Math.min(have, n ?? 0)})</span>`;
        })
        .join(' · ');
      const button = canPayTribute(world, c) ? ` <button data-act="tribute" title="${T.tributeTip}">${T.tributePay}</button>` : '';
      return `<b>${T.tributeTitle}</b> · ${goods} · ${T.tributeLeft} ${clock(Math.max(0, c.dueS - world.timeS))}${button}`;
    }
    const enemies = world.regiments.filter((r) => r.side === COMPUTER && r.aliveMen > 0).length;
    const foragers = c.foragerIds.length > 0 ? ` · ${T.foragersBack} ${clock(Math.max(0, c.foragersBackS))}` : '';
    return `<b>${title}</b> · ${T.campLeft}: ${enemies}${foragers}`;
  }

  private distanceFromCamera(x: number, z: number): number {
    const cam = this.view.stage.camera.position;
    return Math.hypot(cam.x - x, cam.y - heightAtM(x, z), cam.z - z);
  }

  private onEvent(e: GameEvent): void {
    const mine = e.side === PLAYER;
    const distanceM = this.distanceFromCamera(e.x, e.z);
    switch (e.kind) {
      case 'meleeHit':
        this.sound.play('clash', distanceM);
        break;
      case 'arrowShot':
        this.sound.play('arrow', distanceM);
        break;
      case 'gunShot':
        this.sound.play('cannon', distanceM);
        this.view.gunSmoke(e.x, e.z, false);
        break;
      case 'mortarShot':
        this.sound.play('mortar', distanceM);
        this.view.gunSmoke(e.x, e.z, true);
        break;
      case 'stoneFall':
      case 'arrowHit':
      case 'death':
        this.sound.play('thud', distanceM);
        break;
      case 'charge':
        this.sound.play('horn', distanceM);
        break;
      case 'rout':
        this.sound.play('hornLow', distanceM);
        this.hud.toast(mine ? T.routed : T.enemyRouted, mine ? 'bad' : 'good', mine ? [e.x, e.z] : null);
        break;
      case 'shattered':
        this.sound.play('hornLow', distanceM);
        this.hud.toast(mine ? T.shattered : T.enemyRouted, mine ? 'bad' : 'good', mine ? [e.x, e.z] : null);
        break;
      case 'rally':
        if (mine) this.hud.toast(T.rallied, 'good');
        break;
      case 'built':
        if (mine) {
          this.sound.play('build');
          this.hud.toast(T.built, 'good');
        }
        break;
      case 'garrisoned':
        if (mine) this.hud.toast(T.garrisoned, 'good');
        break;
      case 'wallBroken':
        this.sound.play('thud', distanceM);
        if (!mine) this.hud.toast(T.wallBroken, 'bad', [e.x, e.z]);
        break;
      case 'rearmed':
        if (mine) {
          this.sound.play('build');
          this.hud.toast(T.rearmed, 'good');
        }
        break;
      case 'reinforced':
        if (mine) {
          this.sound.play('build');
          this.hud.toast(T.reinforced, 'good', [e.x, e.z]);
        }
        break;
      case 'captainFell':
        if (mine) this.hud.toast(T.captainFell, 'bad', [e.x, e.z]);
        break;
      case 'promoted':
        if (mine) this.hud.toast(T.promoted, 'good', [e.x, e.z]);
        break;
      case 'unpaid':
        if (mine) this.hud.toast(T.unpaid, 'bad', [townX(PLAYER), townZ(PLAYER)]);
        break;
      case 'transportRaised':
        if (mine) {
          this.sound.play('build');
          this.hud.toast(T.transportRaised, 'good');
        }
        break;
      case 'paid':
        if (mine) this.hud.toast(T.paid, 'good');
        break;
      case 'recruited':
        if (mine) {
          this.sound.play('build');
          this.hud.toast(T.recruited, 'good');
        }
        break;
      case 'destroyed':
        this.sound.play('thud', distanceM);
        if (mine) this.hud.toast(T.lost, 'bad', [e.x, e.z]);
        break;
      case 'starving':
        if (mine) this.hud.toast(T.starving, 'bad', [townX(PLAYER), townZ(PLAYER)]);
        break;
      case 'fed':
        if (mine) this.hud.toast(T.fed, 'good');
        break;
      case 'keepRaised':
        if (mine) {
          this.sound.play('build');
          this.hud.toast(T.keepRaised, 'good', [e.x, e.z]);
        }
        break;
      case 'pointTaken': {
        const p = this.world.points.find((q) => Math.hypot(q.x - e.x, q.z - e.z) < 1);
        if (p) this.hud.toast(`${mine ? T.pointTaken : T.pointLost} ${T.points[p.kind]}`, mine ? 'good' : 'bad', [p.x, p.z]);
        break;
      }
      case 'gameOver':
        // The event's side is the winner.
        this.sound.play(mine ? 'fanfare' : 'hornLow');
        this.onEnd?.(e.side);
        break;
    }
  }

  private warnOfAttack(): void {
    if (this.world.timeS - this.lastWarningS < WARNING_GAP_S) return;
    for (const r of this.world.regiments) {
      if (r.side !== COMPUTER || r.aliveMen === 0) continue;
      if (Math.hypot(r.centreX - townX(PLAYER), r.centreZ - townZ(PLAYER)) > AI.defendRadiusM) continue;
      this.lastWarningS = this.world.timeS;
      this.sound.play('horn');
      this.hud.toast(T.attackWarning, 'bad', [r.centreX, r.centreZ]);
      return;
    }
  }

  /** Seconds each of the player's workshops has had a full yard, and when it last raised the alarm. */
  private readonly fullSince = new Map<number, number>();
  private readonly fullWarned = new Map<number, number>();
  private lastRaidS = -1e9;

  /**
   * Alarms the simulation has no event for, looked at once a second: an enemy regiment among the
   * player's buildings (not just near the keep), and a workshop whose yard has been full a minute.
   */
  private watchTown(): void {
    if (this.world.stepCount % 60 !== 0) return;
    const town = this.world.towns[PLAYER];
    const now = this.world.timeS;
    if (now - this.lastRaidS > RAID_GAP_S) {
      raid: for (const r of this.world.regiments) {
        if (r.side !== COMPUTER || r.aliveMen === 0) continue;
        for (const b of town.plots) {
          if (!b || Math.hypot(b.x - r.centreX, b.z - r.centreZ) > RAID_RADIUS_M) continue;
          this.lastRaidS = now;
          this.sound.play('horn');
          this.hud.toast(`${T.raid} ${T.buildings[b.kind].name}`, 'bad', [b.x, b.z]);
          break raid;
        }
      }
    }
    town.plots.forEach((b, plot) => {
      const state = b ? workState(b) : 'waiting';
      if (!b || (state !== 'yardFull' && state !== 'noTrees')) {
        this.fullSince.delete(plot);
        return;
      }
      const since = this.fullSince.get(plot) ?? now;
      this.fullSince.set(plot, since);
      if (now - since < YARD_FULL_ALARM_S || now - (this.fullWarned.get(plot) ?? -1e9) < YARD_FULL_ALARM_S * 3) return;
      this.fullWarned.set(plot, now);
      this.hud.toast(`${state === 'noTrees' ? T.noTreesAlarm : T.yardFullAlarm} ${T.buildings[b.kind].name}`, 'plain', [b.x, b.z]);
    });
  }

  private render(frameSeconds: number): void {
    if (frameSeconds > 0) this.fps += (1 / frameSeconds - this.fps) * 0.05;
    this.controls.update(frameSeconds);
    this.camera.update(frameSeconds);
    this.timer.begin();
    const placing = this.updateTool();
    this.view.render(this.world, this.camera, this.selected, this.selectedPlot, placing === 'ghost' ? this.ghost : null, placing === 'none' ? null : this.tiles, frameSeconds);
    this.timer.lap('draw');
    this.updateCorners();
    const tool = this.tool === null ? '' : this.tool.kind === 'build' ? this.tool.building : this.tool.kind;
    this.hud.update(this.world, { regiments: this.selected, plot: this.selectedPlot, tool }, (x, y, z, out) => this.view.project(x, y, z, out), heightAtM, this.corners, frameSeconds);
    this.updateHover(frameSeconds);
    this.timer.lap('hud');
    if (this.hud.debugVisible) this.hud.setDebugText(this.debugText());
    if (!this.loop.paused && this.world.winner === -1) this.view.stage.governor.update(frameSeconds);
    // The pause banner follows the loop (the menu pauses and resumes it too).
    this.hud.setPaused(this.loop.paused);
    this.framesDrawn++;
  }

  /** Ground points at the four screen corners, for the minimap; corners that see sky fall back to far points. */
  private updateCorners(): void {
    const w = this.view.stage.canvas.clientWidth;
    const h = this.view.stage.canvas.clientHeight;
    const xs = [0, w, w, 0];
    const ys = [0, 0, h, h];
    for (let i = 0; i < 4; i++) {
      if (this.ground(xs[i] as number, ys[i] as number, this.hit)) {
        this.corners[i * 2] = this.hit.x;
        this.corners[i * 2 + 1] = this.hit.z;
      } else {
        this.corners[i * 2] = this.ray.ox + this.ray.dx * 2000;
        this.corners[i * 2 + 1] = this.ray.oz + this.ray.dz * 2000;
      }
    }
  }

  private debugText(): string {
    const info = this.view.stage.renderer.info.render;
    const stage = this.view.stage;
    let men = 0;
    for (const r of this.world.regiments) men += r.aliveMen;
    return [
      `${this.fps.toFixed(0)} fps · ${stage.backendName} · ${stage.settings.quality} · scale ${stage.governorLabel}`,
      `draw calls ${info.drawCalls} · triangles ${(info.triangles / 1000).toFixed(0)} k`,
      `cpu ms: ${this.timer.summary()}`,
      stage.passTimer.summary(),
      `soldiers ${men} · regiments ${this.world.regiments.length} · computer: ${this.world.ai?.mode ?? '-'} wave ${this.world.ai?.wave ?? 0}`,
    ].join('\n');
  }

  /** Names what is under the cursor (ten times a second): a building, a regiment, an outcrop, the forest, a lake. */
  private updateHover(frameSeconds: number): void {
    this.hoverAgeS += frameSeconds;
    if (this.hoverAgeS < 0.1) return;
    this.hoverAgeS = 0;
    if (this.tool || !this.controls.cursor(this.cursor) || !this.ground(this.cursor.x, this.cursor.y, this.hit)) {
      this.hud.hover('', 0, 0);
      return;
    }
    this.hud.hover(this.describeGround(this.hit.x, this.hit.z), this.cursor.x, this.cursor.y);
  }

  private describeGround(x: number, z: number): string {
    for (const side of [PLAYER, COMPUTER] as const) {
      const whose = side === PLAYER ? T.hover.yours : T.hover.enemy;
      if (Math.hypot(x - townX(side), z - townZ(side)) < TOWN.keepRadiusM) return `${T.keep} (${whose})`;
      const plot = this.plotAt(x, z, side);
      const b = plot >= 0 ? this.world.towns[side].plots[plot] : null;
      if (b) return `${T.buildings[b.kind].name} · ${T.level} ${b.level} (${whose})`;
      const r = this.regimentAt(x, z, side);
      if (r) return `${T.units[r.kind].name} · ${r.aliveMen} ${T.men} (${whose})`;
    }
    for (const p of this.world.points) {
      if (Math.hypot(x - p.x, z - p.z) > POINTS.radiusM) continue;
      const holder = p.owner === -1 ? T.nobodys : p.owner === PLAYER ? T.hover.yours : T.hover.enemy;
      const taking = p.taker === -1 ? '' : ` · ${T.taking}: ${p.taker === PLAYER ? T.hover.yours : T.hover.enemy} ${Math.floor((p.progressS / POINTS.holdS) * 100)}%`;
      return `${T.points[p.kind]} (${holder})${taking} — ${T.pointAbout}`;
    }
    for (const d of DEPOSITS) if (Math.hypot(x - d.x, z - d.z) < TOWN.depositRadiusM) return d.kind === 'stone' ? T.hover.stone : T.hover.ore;
    if (isWater(x, z)) return T.hover.lake;
    const rock = cliffKind(x, z);
    if (rock) return T.hover[rock];
    if (forestCoverAt(x, z) > 0.5) return T.hover.forest;
    return '';
  }

  // ---- placing buildings and roads -----------------------------------------

  private setHint(text: string): void {
    if (text === this.hint) return;
    this.hint = text;
    this.hud.setHint(text);
  }

  private pickTool(tool: Tool): void {
    this.sound.unlock();
    this.sound.play('click');
    this.tool = tool;
    this.selected.clear();
    this.selectedPlot = NOWHERE;
  }

  /** Puts down the tool; a road in the middle of a stretch first lets go of its start. */
  private dropTool(): void {
    if (this.tool && (this.tool.kind === 'road' || this.tool.kind === 'wall') && this.tool.started) this.tool.started = false;
    else this.tool = null;
    if (!this.tool) this.setHint(T.hintIdle);
  }

  private yawOf(tool: Tool & { kind: 'build' }, x: number, z: number): number {
    // The door looks along one of the map's four axes, the one nearest the way to the keep: buildings stand
    // square to each other and to the roads, not turned round the keep like spokes. R turns by an eighth
    // (by a quarter on the grid).
    const quarter = Math.round(yawToKeep(PLAYER, x, z) / (Math.PI / 2));
    return quarter * (Math.PI / 2) + (this.gridOn ? Math.floor(tool.turns / 2) * (Math.PI / 2) : (tool.turns * Math.PI) / 4);
  }

  /** Buildings on the grid: TOWN.gridM squares, lined up with the road cells, one corner at the keep. */
  private gridOn = true;
  /** The player's orders go at the run (pace buttons, B). */
  private runMode = false;

  private snap(v: number, origin: number): number {
    return origin + Math.round((v - origin) / TOWN.gridM) * TOWN.gridM;
  }

  private placeX(x: number): number {
    return this.gridOn ? this.snap(x, Math.round(townX(PLAYER) / ROADS.cellM) * ROADS.cellM) : x;
  }

  private placeZ(z: number): number {
    return this.gridOn ? this.snap(z, Math.round(townZ(PLAYER) / ROADS.cellM) * ROADS.cellM) : z;
  }

  private toggleGrid(): void {
    this.gridOn = !this.gridOn;
    this.hud.gridOn = this.gridOn;
    try {
      localStorage.setItem('marchland.grid', this.gridOn ? '1' : '0');
    } catch {
      // No storage (private window): the switch lasts this game only.
    }
    this.sound.play('click');
  }

  /** A click with a tool in hand: places the building, or sets the next point of the road. */
  private useTool(x: number, z: number, keep: boolean): void {
    const tool = this.tool;
    if (!tool) return;
    if (tool.kind === 'build') {
      const bx = this.placeX(x);
      const bz = this.placeZ(z);
      const result = cmdBuild(this.world, PLAYER, tool.building, bx, bz, this.yawOf(tool, bx, bz));
      this.report(result);
      if (result === 'ok' && !keep) this.dropTool();
      return;
    }
    if (tool.kind === 'gate') {
      const result = cmdBuildGate(this.world, PLAYER, x, z);
      this.report(result);
      if (result === 'ok' && !keep) this.dropTool();
      return;
    }
    if (tool.started) {
      const result = tool.kind === 'wall' ? cmdBuildWall(this.world, PLAYER, tool.fromX, tool.fromZ, x, z) : cmdBuildRoad(this.world, PLAYER, tool.fromX, tool.fromZ, x, z);
      this.report(result);
      if (result !== 'ok') return;
    } else {
      this.sound.play('click');
    }
    // The next stretch starts where this one ended.
    tool.fromX = x;
    tool.fromZ = z;
    tool.started = true;
  }

  /** Once a frame: where the cursor would put the tool. Fills the ghost and the tiles; says which of them to draw. */
  private updateTool(): 'none' | 'ghost' | 'tiles' {
    const tool = this.tool;
    if (!tool) {
      this.tiles.count = 0;
      this.tiles.values.length = 0;
      return this.previewFacing() ? 'tiles' : 'none';
    }
    const pointing = this.controls.cursor(this.cursor) && this.ground(this.cursor.x, this.cursor.y, this.hit);
    this.tiles.count = 0;
    this.tiles.values.length = 0;
    if (tool.kind === 'build') {
      if (!pointing) {
        this.setHint(`${T.buildings[tool.building].name}: ${T.hintBuild}`);
        return 'none';
      }
      const gx = this.placeX(this.hit.x);
      const gz = this.placeZ(this.hit.z);
      const yaw = this.yawOf(tool, gx, gz);
      const check = checkSite(this.world, PLAYER, tool.building, gx, gz, yaw);
      this.ghost.kind = tool.building;
      this.ghost.x = gx;
      this.ghost.z = gz;
      this.ghost.yawRad = yaw;
      this.ghost.allowed = check.result === 'ok';
      // A farm shows the fields it would take.
      for (const strip of check.site.strips) this.tiles.values.push(strip.x, strip.z, FIELDS.stripLengthM, FIELDS.stripWidthM, yaw);
      this.tiles.count = check.site.strips.length;
      if (this.gridOn) {
        // The neighbouring grid cells, faintly: where the next buildings of the block would go.
        for (let i = -2; i <= 2; i++) {
          for (let k = -2; k <= 2; k++) {
            if (i === 0 && k === 0) continue;
            this.tiles.values.push(gx + i * TOWN.gridM, gz + k * TOWN.gridM, 1.2, 1.2, 0);
            this.tiles.count++;
          }
        }
      }
      this.tiles.allowed = this.ghost.allowed;
      let why: string = check.result === 'ok' ? T.hintBuild : T.results[check.result];
      if (check.result === 'tooFar') {
        // How far it is: from the keep against its reach, and from the nearest building against 70 m.
        const fromKeep = Math.round(Math.hypot(gx - townX(PLAYER), gz - townZ(PLAYER)));
        const fromBuilding = nearestOwnBuildingM(this.world, PLAYER, gx, gz);
        why += ` (${T.fromKeep} ${fromKeep} / ${Math.round(reachOf(tool.building, this.world.towns[PLAYER].keepLevel))} m${Number.isFinite(fromBuilding) ? ` · ${T.fromBuilding} ${Math.round(fromBuilding)} / ${TOWN.buildingReachM} m` : ''})`;
      }
      this.setHint(`${T.buildings[tool.building].name}: ${why}`);
      return 'ghost';
    }
    if (tool.kind === 'gate') {
      // The three cells of wall it would take, green where it may go.
      const cells = pointing ? gateCells(this.world.nav, this.hit.x, this.hit.z, PLAYER, GATE.cells, this.roadScratch) : 0;
      for (let i = 0; i < cells; i++) this.tiles.values.push(cellX(this.roadScratch[i] as number), cellZ(this.roadScratch[i] as number), ROADS.cellM, ROADS.cellM, 0);
      this.tiles.count = cells;
      const stock = this.world.towns[PLAYER].stock;
      this.tiles.allowed = cells === GATE.cells && stock.wood >= GATE.cost.wood && stock.stone >= GATE.cost.stone;
      this.setHint(pointing && cells > 0 && cells < GATE.cells ? `${T.gate}: ${T.results.needsWall}` : T.hintGate);
      return cells > 0 ? 'tiles' : 'none';
    }
    const wall = tool.kind === 'wall';
    if (!tool.started || !pointing) {
      this.setHint(wall ? (tool.started ? T.hintWallEnd : T.hintWallStart) : tool.started ? T.hintRoadEnd : T.hintRoadStart);
      return 'none';
    }
    const cells = wall ? wallCells(this.world.nav, tool.fromX, tool.fromZ, this.hit.x, this.hit.z, this.roadScratch) : roadCells(this.world.nav, tool.fromX, tool.fromZ, this.hit.x, this.hit.z, this.roadScratch);
    for (let i = 0; i < cells; i++) this.tiles.values.push(cellX(this.roadScratch[i] as number), cellZ(this.roadScratch[i] as number), ROADS.cellM, ROADS.cellM, 0);
    this.tiles.count = cells;
    const cost = wall ? wallCost(this.world, tool.fromX, tool.fromZ, this.hit.x, this.hit.z) : roadCost(this.world, tool.fromX, tool.fromZ, this.hit.x, this.hit.z);
    const inReach = mayLayRoadAt(PLAYER, this.hit.x, this.hit.z) && mayLayRoadAt(PLAYER, tool.fromX, tool.fromZ);
    this.tiles.allowed = inReach && this.world.towns[PLAYER].stock.stone >= cost;
    this.setHint(`${wall ? T.hintWallEnd : T.hintRoadEnd} ${cost} ${T.roadCost}${inReach ? '' : ` — ${T.results.tooFar}`}`);
    return 'tiles';
  }

  // ---- ControlTarget -------------------------------------------------------

  ground(screenX: number, screenY: number, out: { x: number; z: number }): boolean {
    this.view.screenRay(screenX, screenY, this.ray);
    return groundHit(this.ray, out);
  }

  /** The living regiment with a man nearest to a ground point, within reach of a click. */
  private regimentAt(x: number, z: number, side: Side): Regiment | null {
    // A wider catch from far away, where a man is a few pixels.
    const reachM = Math.max(1.8, this.camera.shown.distanceM * 0.022);
    let best: Regiment | null = null;
    let bestD2 = reachM * reachM;
    for (const r of this.world.regiments) {
      if (r.side !== side || r.aliveMen === 0) continue;
      if ((r.centreX - x) ** 2 + (r.centreZ - z) ** 2 > (r.radiusM + reachM) ** 2) continue;
      for (const s of r.soldiers) {
        if (!s.alive) continue;
        const d2 = (s.x - x) ** 2 + (s.z - z) ** 2;
        if (d2 < bestD2) {
          best = r;
          bestD2 = d2;
        }
      }
    }
    return best;
  }

  /** The plot of `side` at a ground point: its index, -1 for the keep, -2 for none. */
  private plotAt(x: number, z: number, side: Side): number {
    if (Math.hypot(x - townX(side), z - townZ(side)) < TOWN.keepRadiusM) return -1;
    const plots = this.world.towns[side].plots;
    for (let plot = 0; plot < plots.length; plot++) {
      const b = plots[plot];
      if (b && Math.hypot(x - b.x, z - b.z) < TOWN.buildingRadiusM) return plot;
    }
    return -2;
  }

  private selectRegiment(id: number, additive: boolean): void {
    if (!additive) this.selected.clear();
    else if (this.selected.has(id)) {
      this.selected.delete(id);
      return;
    }
    this.selected.add(id);
    this.selectedPlot = NOWHERE;
    this.setHint(T.hintArmy);
    this.sound.play('click');
  }

  select(screenX: number, screenY: number, additive: boolean): void {
    this.sound.unlock();
    if (!this.ground(screenX, screenY, this.hit)) return;
    if (this.tool) {
      this.useTool(this.hit.x, this.hit.z, additive);
      return;
    }
    const r = this.regimentAt(this.hit.x, this.hit.z, PLAYER);
    if (r) {
      const now = performance.now();
      const twice = this.lastPick.id === r.id && now - this.lastPick.atMs < 350;
      this.lastPick = { id: r.id, atMs: now };
      if (twice && !additive) this.selectKindOnScreen(r.kind);
      else this.selectRegiment(r.id, additive);
      return;
    }
    if (additive) return;
    this.selected.clear();
    const plot = this.plotAt(this.hit.x, this.hit.z, PLAYER);
    // A building, the keep (KEEP), or nothing (NOWHERE).
    this.selectedPlot = plot;
    if (plot !== NOWHERE) this.sound.play('click');
    this.setHint(T.hintIdle);
  }

  boxSelect(x0: number, y0: number, x1: number, y1: number, additive: boolean): void {
    if (!additive) this.selected.clear();
    const left = Math.min(x0, x1);
    const right = Math.max(x0, x1);
    const top = Math.min(y0, y1);
    const bottom = Math.max(y0, y1);
    for (const r of this.world.regiments) {
      if (r.side !== PLAYER || r.aliveMen === 0) continue;
      if (!this.view.project(r.centreX, heightAtM(r.centreX, r.centreZ) + 1, r.centreZ, this.screen)) continue;
      if (this.screen.x >= left && this.screen.x <= right && this.screen.y >= top && this.screen.y <= bottom) this.selected.add(r.id);
    }
    if (this.selected.size > 0) {
      this.selectedPlot = NOWHERE;
      this.setHint(T.hintArmy);
    }
  }

  showBox(x0: number, y0: number, x1: number, y1: number, visible: boolean): void {
    this.hud.selectionBox(x0, y0, x1, y1, visible);
  }

  /**
   * March or run: the selected regiments on the move change pace at once, and the player's next orders
   * go at that pace (two quick clicks always run). Engines keep marching.
   */
  private setPace(run: boolean): void {
    this.runMode = run;
    for (const id of this.selected) {
      const r = this.world.regiments.find((q) => q.id === id);
      if (r && r.order === 'move' && !(run && r.def.engine)) cmdPace(this.world, id, run);
    }
    this.sound.play('click');
    this.hud.toast(run ? T.paceRunNow : T.paceWalkNow);
  }

  order(screenX: number, screenY: number, run: boolean, faceToX: number | null, faceToZ: number | null, queued = false): void {
    run = run || this.runMode;
    // The right button puts down whatever is being placed.
    if (this.tool) {
      this.dropTool();
      return;
    }
    if (this.selected.size === 0 || !this.ground(screenX, screenY, this.hit)) return;
    let ids = [...this.selected];
    // An order without Shift replaces whatever was queued.
    this.queueing = queued;
    if (!queued) for (const id of ids) cmdClearQueue(this.world, id);
    const x = this.hit.x;
    const z = this.hit.z;
    const enemy = this.regimentAt(x, z, COMPUTER);
    if (enemy && faceToX === null) {
      this.attackRegiment(enemy.id);
      return;
    }
    // On one of our own watchtowers: the shooters among the chosen go up to man it.
    const ownPlot = this.plotAt(x, z, PLAYER);
    const ownTower = ownPlot >= 0 ? this.world.towns[PLAYER].plots[ownPlot] : null;
    if (ownTower && ownTower.kind === 'tower' && faceToX === null) {
      let result: CommandResult = 'cannotGarrison';
      for (const id of ids) {
        const r = cmdGarrison(this.world, id, ownPlot);
        if (r === 'ok' || result !== 'ok') result = r;
      }
      this.report(result);
      return;
    }
    // On an enemy wall: the shooters among the chosen batter it (guns and mortars break it); the others march up.
    const wall = faceToX === null ? wallCellAt(this.world.nav, x, z) : -1;
    if (wall >= 0 && this.world.nav.wallSide[wall] !== PLAYER) {
      const shooters = ids.filter((id) => (findRegiment(this.world, id)?.def.missileRangeM ?? 0) > 0);
      if (shooters.length > 0) {
        let result: CommandResult = 'ok';
        for (const id of shooters) result = cmdBombard(this.world, id, x, z);
        this.report(result);
        if (shooters.length === ids.length) return;
        ids = ids.filter((id) => !shooters.includes(id));
      }
    }
    const plot = this.plotAt(x, z, COMPUTER);
    if (plot >= -1 && faceToX === null) {
      let result: CommandResult = 'ok';
      for (const id of ids) result = queued ? cmdQueue(this.world, id, { kind: 'attackBuilding', side: COMPUTER, plot }) : cmdAttackBuilding(this.world, id, COMPUTER, plot);
      this.report(result);
      return;
    }
    // A march: face the way the player dragged, or the way the troops will travel.
    const kept = this.keptFormation(ids);
    let facing: number;
    const dragged = faceToX !== null && faceToZ !== null && Math.hypot(faceToX - x, faceToZ - z) > 1;
    if (dragged) {
      facing = this.dragFacing(x, z, faceToX as number, faceToZ as number);
    } else {
      let cx = 0;
      let cz = 0;
      let n = 0;
      for (const id of ids) {
        const r = findRegiment(this.world, id);
        if (!r) continue;
        cx += r.centreX;
        cz += r.centreZ;
        n++;
      }
      if (n === 0) return;
      facing = Math.atan2(x - cx / n, z - cz / n);
    }
    // Queued: every regiment gets the place it would take, at the end of its queue.
    if (queued) {
      const spots: number[] = [];
      let result: CommandResult = 'noSuchRegiment';
      if (kept) {
        formationSpots(kept, x, z, facing, spots);
        kept.forEach((p, i) => {
          result = cmdQueue(this.world, p.id, { kind: 'move', x: spots[i * 3] as number, z: spots[i * 3 + 1] as number, facingRad: spots[i * 3 + 2] as number, run });
        });
      } else if (groupLineSpots(this.world, ids, x, z, facing, spots) === 'ok') {
        for (let i = 0; i < spots.length; i += 4) result = cmdQueue(this.world, spots[i] as number, { kind: 'move', x: spots[i + 1] as number, z: spots[i + 2] as number, facingRad: facing, run });
      }
      this.report(result);
      return;
    }
    // A kept formation moves whole, its shape turned to the new facing; otherwise one line.
    if (kept) this.report(cmdMoveFormation(this.world, kept, x, z, facing, run));
    else this.report(cmdMoveGroup(this.world, ids, x, z, facing, run));
  }

  /** Set while an order is being given with Shift (it goes to the queues). */
  private queueing = false;

  /** Space: the battle stops while orders can still be given; again, it goes on. */
  togglePause(): void {
    this.loop.paused = !this.loop.paused;
    this.hud.setPaused(this.loop.paused);
    this.sound.play('click');
  }

  /**
   * The facing a right-button drag sets. Dragged sideways, the drag is the front itself (the line looks
   * square to it, away from where the troops stand); dragged straight away, it points the way to look.
   */
  private dragFacing(x: number, z: number, toX: number, toZ: number): number {
    const along = Math.atan2(toX - x, toZ - z);
    // The two facings square to the drag: the one looking away from the troops' middle.
    let cx = 0;
    let cz = 0;
    let n = 0;
    for (const id of this.selected) {
      const r = findRegiment(this.world, id);
      if (!r) continue;
      cx += r.centreX;
      cz += r.centreZ;
      n++;
    }
    if (n === 0) return along;
    const a = along - Math.PI / 2;
    const b = along + Math.PI / 2;
    const awayX = x - cx / n;
    const awayZ = z - cz / n;
    return Math.sin(a) * awayX + Math.cos(a) * awayZ >= Math.sin(b) * awayX + Math.cos(b) * awayZ ? a : b;
  }

  /** The kept formation whose living regiments are exactly the ones selected, if any. */
  private keptFormation(ids: readonly number[]): FormationPlace[] | null {
    for (const places of this.formations.values()) {
      const alive = places.filter((p) => (findRegiment(this.world, p.id)?.aliveMen ?? 0) > 0);
      if (alive.length < 2 || alive.length !== ids.length) continue;
      if (alive.every((p) => ids.includes(p.id))) return alive;
    }
    return null;
  }

  /** Small markers where the selected regiments' queued marches will take them, so the plan can be seen. */
  private showQueues(): boolean {
    for (const id of this.selected) {
      const r = findRegiment(this.world, id);
      if (!r) continue;
      for (const q of r.queue) {
        if (q.kind !== 'move') continue;
        this.tiles.values.push(q.x, q.z, 1.6, 1.6, q.facingRad);
        this.tiles.values.push(q.x + Math.sin(q.facingRad) * 1.8, q.z + Math.cos(q.facingRad) * 1.8, 0.6, 0.6, q.facingRad);
        this.tiles.count += 2;
      }
    }
    this.tiles.allowed = true;
    return this.tiles.count > 0;
  }

  hasSelection(): boolean {
    return this.selected.size > 0 && !this.tool;
  }

  showFacing(x0: number, y0: number, x1: number, y1: number, visible: boolean): void {
    this.facingDrag = visible ? { x0, y0, x1, y1 } : null;
  }

  /** While a right-button drag lays out a line: where each selected regiment would stand, and which way it would look. */
  private previewFacing(): boolean {
    const drag = this.facingDrag;
    if (!drag || this.selected.size === 0) return this.showQueues();
    const start = { x: 0, z: 0 };
    const end = { x: 0, z: 0 };
    if (!this.ground(drag.x0, drag.y0, start) || !this.ground(drag.x1, drag.y1, end) || Math.hypot(end.x - start.x, end.z - start.z) < 1) return false;
    const ids = [...this.selected];
    const facing = this.dragFacing(start.x, start.z, end.x, end.z);
    const kept = this.keptFormation(ids);
    const mark = (px: number, pz: number, frontage: number, look: number): void => {
      this.tiles.values.push(px, pz, Math.max(2, frontage), 1.4, look);
      // A small square ahead of the line: the way it will look.
      this.tiles.values.push(px + Math.sin(look) * 2.2, pz + Math.cos(look) * 2.2, 0.9, 0.9, look);
      this.tiles.count += 2;
    };
    if (kept) {
      formationSpots(kept, start.x, start.z, facing, this.spotScratch);
      kept.forEach((p, i) => {
        const r = findRegiment(this.world, p.id);
        mark(this.spotScratch[i * 3] as number, this.spotScratch[i * 3 + 1] as number, r ? frontageM(r) : 4, this.spotScratch[i * 3 + 2] as number);
      });
    } else if (groupLineSpots(this.world, ids, start.x, start.z, facing, this.spotScratch) === 'ok') {
      for (let i = 0; i < this.spotScratch.length; i += 4) mark(this.spotScratch[i + 1] as number, this.spotScratch[i + 2] as number, this.spotScratch[i + 3] as number, facing);
    }
    this.tiles.allowed = true;
    return this.tiles.count > 0;
  }

  tap(screenX: number, screenY: number, double: boolean): void {
    this.sound.unlock();
    if (!this.ground(screenX, screenY, this.hit)) return;
    if (this.tool) {
      this.useTool(this.hit.x, this.hit.z, false);
      return;
    }
    const own = this.regimentAt(this.hit.x, this.hit.z, PLAYER);
    const ownPlot = this.plotAt(this.hit.x, this.hit.z, PLAYER);
    // With troops selected, a tap anywhere but on one's own troops or town is an order.
    if (this.selected.size > 0 && !own && ownPlot === -2) this.order(screenX, screenY, double, null, null);
    else this.select(screenX, screenY, false);
  }

  /** Whether the map moves when the mouse touches the screen's edge (a setting). */
  setEdgeScroll(on: boolean): void {
    this.controls.edgeScroll = on;
  }

  /** Carries on a saved game: its world replaces this one; selections and tools are put down. */
  loadSaved(world: World): void {
    this.world = world;
    this.selected.clear();
    this.selectedPlot = NOWHERE;
    this.tool = null;
    this.groups.clear();
    this.camera.jumpTo(townX(PLAYER), townZ(PLAYER));
  }

  /** Regiments kept under keys 1–9, and camera views under F5–F8. */
  private readonly groups = new Map<number, number[]>();
  private readonly views = new Map<number, { targetX: number; targetZ: number; distanceM: number; yawRad: number; tiltRad: number }>();
  private lastGroupKey = { n: -1, atMs: 0 };

  /** Keys 1–9 and F5–F8: keep or call up a group of regiments, or a view. True when the action was one of them. */
  private groupKey(action: Action): boolean {
    const m = /^(setGroup|group|setView|view)(\d)$/.exec(action);
    if (!m) return false;
    const n = Number(m[2]);
    const kind = m[1];
    if (kind === 'setGroup') {
      this.groups.set(n, [...this.selected]);
      // Several regiments: their shape as they stand is kept with the group, and they march in it.
      const places: FormationPlace[] = [];
      captureFormation(this.world, [...this.selected], places);
      if (places.length >= 2) this.formations.set(n, places);
      else this.formations.delete(n);
      this.hud.toast(`${places.length >= 2 ? T.formationKept : T.groupKept} ${n}`, 'plain');
    } else if (kind === 'group') {
      const ids = (this.groups.get(n) ?? []).filter((id) => (findRegiment(this.world, id)?.aliveMen ?? 0) > 0);
      if (ids.length === 0) return true;
      const now = performance.now();
      const again = this.lastGroupKey.n === n && now - this.lastGroupKey.atMs < 400;
      this.lastGroupKey = { n, atMs: now };
      this.selected.clear();
      for (const id of ids) this.selected.add(id);
      this.selectedPlot = NOWHERE;
      this.setHint(T.hintArmy);
      if (again) {
        // Twice quickly: the camera goes to them.
        let x = 0;
        let z = 0;
        for (const id of ids) {
          const r = findRegiment(this.world, id);
          if (r) {
            x += r.centreX;
            z += r.centreZ;
          }
        }
        this.camera.jumpTo(x / ids.length, z / ids.length);
      }
    } else if (kind === 'setView') {
      this.views.set(n, { ...this.camera.goal });
      this.hud.toast(`${T.viewKept} F${n + 4}`, 'plain');
    } else {
      const v = this.views.get(n);
      if (v) Object.assign(this.camera.goal, v);
    }
    return true;
  }

  /** A double click on a regiment: every regiment of that kind now on the screen. */
  private selectKindOnScreen(kind: Regiment['kind']): void {
    const w = this.view.stage.canvas.clientWidth;
    const h = this.view.stage.canvas.clientHeight;
    const p = { x: 0, y: 0 };
    this.selected.clear();
    for (const r of this.world.regiments) {
      if (r.side !== PLAYER || r.aliveMen === 0 || r.kind !== kind) continue;
      const seen = this.view.project(r.centreX, heightAtM(r.centreX, r.centreZ), r.centreZ, p);
      if (seen && p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h) this.selected.add(r.id);
    }
    this.selectedPlot = NOWHERE;
    this.setHint(T.hintArmy);
  }

  private lastPick = { id: -1, atMs: 0 };

  press(action: Action): void {
    this.sound.unlock();
    if (this.groupKey(action)) return;
    if (action === 'halt') this.haltSelected();
    else if (action === 'pace') this.setPace(!this.runMode);
    else if (action === 'selectAll') this.selectAll();
    else if (action === 'debug') this.hud.debugVisible = !this.hud.debugVisible;
    else if (action === 'turnBuilding') {
      if (this.tool?.kind === 'build') this.tool.turns = (this.tool.turns + (this.gridOn ? 2 : 1)) % 8;
      // A building of the player's that is still going up turns where it stands.
      else if (this.tool === null && this.selectedPlot >= 0) this.report(cmdTurnSite(this.world, PLAYER, this.selectedPlot, this.gridOn ? 2 : 1));
    } else if (action === 'grid') this.toggleGrid();
    else if (action === 'pause') {
      if (this.world.winner === -1) this.togglePause();
    } else if (action === 'road') this.pickTool({ kind: 'road', fromX: 0, fromZ: 0, started: false });
    else if (action === 'cancel') {
      if (this.tool) this.dropTool();
      else if (this.selected.size > 0 || this.selectedPlot !== NOWHERE) {
        this.selected.clear();
        this.selectedPlot = NOWHERE;
        this.setHint(T.hintIdle);
      } else {
        this.onMenu?.();
      }
    }
    if (action === 'debug') this.hud.setDebugText('');
  }

  /** Sends the selected regiments against an enemy regiment. */
  private attackRegiment(targetId: number): void {
    const target = findRegiment(this.world, targetId);
    if (!target || target.side === PLAYER || this.selected.size === 0) return;
    let result: CommandResult = 'ok';
    for (const id of this.selected) result = this.queueing ? cmdQueue(this.world, id, { kind: 'attackRegiment', targetId }) : cmdAttackRegiment(this.world, id, targetId);
    this.queueing = false;
    this.report(result);
  }

  private haltSelected(): void {
    for (const id of this.selected) cmdHalt(this.world, id);
    if (this.selected.size > 0) this.sound.play('click');
  }

  private selectAll(): void {
    this.selected.clear();
    for (const r of this.world.regiments) if (r.side === PLAYER && r.aliveMen > 0 && r.state === 'formed') this.selected.add(r.id);
    if (this.selected.size > 0) {
      this.selectedPlot = NOWHERE;
      this.setHint(T.hintArmy);
    }
  }

  // ---- for the debug contract and the sandbox ------------------------------

  /** Puts the camera somewhere at once. */
  place(x: number, z: number, distanceM: number, yawRad: number): void {
    this.camera.goal.targetX = Math.min(MAP.halfM, Math.max(-MAP.halfM, x));
    this.camera.goal.targetZ = Math.min(MAP.halfM, Math.max(-MAP.halfM, z));
    this.camera.zoomAt(distanceM / this.camera.goal.distanceM, this.camera.goal.targetX, this.camera.goal.targetZ);
    this.camera.goal.yawRad = yawRad;
    this.camera.snap();
  }

  /** Named views for screenshots and benchmarks. */
  spot(name: string): void {
    switch (name) {
      case 'town':
        this.place(townX(PLAYER), townZ(PLAYER), 100, Math.PI / 4);
        break;
      case 'rally':
        this.place(rallyX(PLAYER), rallyZ(PLAYER), 45, Math.PI / 4);
        break;
      case 'field':
        this.place(0, 0, 70, Math.PI / 4);
        break;
      case 'close':
        this.place(0, 0, 28, Math.PI / 4);
        break;
      case 'enemy':
        this.place(townX(COMPUTER), townZ(COMPUTER), 100, Math.PI / 4);
        break;
      case 'overview':
        this.place(0, 0, CAMERA.maxDistanceM, Math.PI / 4);
        break;
      default:
        throw new Error(`unknown spot '${name}'; valid: town rally field close enemy overview`);
    }
  }
}
