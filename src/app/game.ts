import { AI, type AiCharacter, CAMERA, DEFENCE, FIELDS, GATE, MAP, POINTS, ROADS, TOWN } from '../config.ts';
import { FixedLoop } from '../core/loop.ts';
import { cmdAttackBuilding, cmdAttackRegiment, cmdBuild, cmdBuildGate, cmdBuildRoad, cmdBuildWall, cmdDemolish, cmdGarrison, cmdHalt, cmdMoveGroup, cmdRearm, cmdRecruit, cmdTogglePaused, cmdUngarrison, cmdUpgrade, cmdUpgradeKeep, roadCost, wallCost } from '../sim/commands.ts';
import type { GameEvent } from '../sim/events.ts';
import type { Regiment } from '../sim/regiment.ts';
import { cellX, cellZ, gateCells, roadCells, wallCells } from '../sim/nav.ts';
import { checkSite, mayLayRoadAt, yawToKeep } from '../sim/placement.ts';
import { cliffKind, DEPOSITS, forestCoverAt, heightAtM, isWater, rallyX, rallyZ, townX, townZ } from '../sim/terrain.ts';
import { type BuildingKind, type CommandResult, COMPUTER, type Difficulty, NOWHERE, PLAYER, type Side } from '../sim/types.ts';
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
    this.world = createWorld({ seed: options.seed, difficulty: options.difficulty, computerPlays: true, mode: options.mode ?? 'skirmish', character: options.character ?? 'balanced' });
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
      upgradeKeep: () => this.report(cmdUpgradeKeep(this.world, PLAYER)),
      demolish: (plot) => this.report(cmdDemolish(this.world, PLAYER, plot)),
      togglePaused: (plot) => this.report(cmdTogglePaused(this.world, PLAYER, plot)),
      recruit: (kind) => this.report(cmdRecruit(this.world, PLAYER, kind)),
      rearm: (id, kind) => this.report(cmdRearm(this.world, id, kind)),
      halt: () => this.haltSelected(),
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

  private tutorialStep = 0;

  /** The tutorial's steps, each done when the town shows it; the defence's clock. Once a second. */
  private watchMode(): void {
    if (this.world.stepCount % 60 !== 0) return;
    const world = this.world;
    if (world.mode === 'defence' && world.defence) {
      const left = Math.max(0, DEFENCE.lengthS - world.timeS);
      const next = Math.max(0, world.defence.nextS - world.timeS);
      this.hud.setBanner(`<b>${T.defenceLeft} ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}</b> · ${T.wave} ${world.defence.wave} · ${T.nextWave} ${Math.ceil(next)} s`);
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
      if (!b || workState(b) !== 'yardFull') {
        this.fullSince.delete(plot);
        return;
      }
      const since = this.fullSince.get(plot) ?? now;
      this.fullSince.set(plot, since);
      if (now - since < YARD_FULL_ALARM_S || now - (this.fullWarned.get(plot) ?? -1e9) < YARD_FULL_ALARM_S * 3) return;
      this.fullWarned.set(plot, now);
      this.hud.toast(`${T.yardFullAlarm} ${T.buildings[b.kind].name}`, 'plain', [b.x, b.z]);
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
    return yawToKeep(PLAYER, x, z) + (tool.turns * Math.PI) / 4;
  }

  /** A click with a tool in hand: places the building, or sets the next point of the road. */
  private useTool(x: number, z: number, keep: boolean): void {
    const tool = this.tool;
    if (!tool) return;
    if (tool.kind === 'build') {
      const result = cmdBuild(this.world, PLAYER, tool.building, x, z, this.yawOf(tool, x, z));
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
    if (!tool) return 'none';
    const pointing = this.controls.cursor(this.cursor) && this.ground(this.cursor.x, this.cursor.y, this.hit);
    this.tiles.count = 0;
    this.tiles.values.length = 0;
    if (tool.kind === 'build') {
      if (!pointing) {
        this.setHint(`${T.buildings[tool.building].name}: ${T.hintBuild}`);
        return 'none';
      }
      const yaw = this.yawOf(tool, this.hit.x, this.hit.z);
      const check = checkSite(this.world, PLAYER, tool.building, this.hit.x, this.hit.z, yaw);
      this.ghost.kind = tool.building;
      this.ghost.x = this.hit.x;
      this.ghost.z = this.hit.z;
      this.ghost.yawRad = yaw;
      this.ghost.allowed = check.result === 'ok';
      // A farm shows the fields it would take.
      for (const strip of check.site.strips) this.tiles.values.push(strip.x, strip.z, FIELDS.stripLengthM, FIELDS.stripWidthM, yaw);
      this.tiles.count = check.site.strips.length;
      this.tiles.allowed = this.ghost.allowed;
      this.setHint(check.result === 'ok' ? `${T.buildings[tool.building].name}: ${T.hintBuild}` : `${T.buildings[tool.building].name}: ${T.results[check.result]}`);
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

  order(screenX: number, screenY: number, run: boolean, faceToX: number | null, faceToZ: number | null): void {
    // The right button puts down whatever is being placed.
    if (this.tool) {
      this.dropTool();
      return;
    }
    if (this.selected.size === 0 || !this.ground(screenX, screenY, this.hit)) return;
    const ids = [...this.selected];
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
    const plot = this.plotAt(x, z, COMPUTER);
    if (plot >= -1 && faceToX === null) {
      let result: CommandResult = 'ok';
      for (const id of ids) result = cmdAttackBuilding(this.world, id, COMPUTER, plot);
      this.report(result);
      return;
    }
    // A march: face the way the player dragged, or the way the troops will travel.
    let facing: number;
    if (faceToX !== null && faceToZ !== null && Math.hypot(faceToX - x, faceToZ - z) > 1) {
      facing = Math.atan2(faceToX - x, faceToZ - z);
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
    this.report(cmdMoveGroup(this.world, ids, x, z, facing, run));
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
      this.hud.toast(`${T.groupKept} ${n}`, 'plain');
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
    else if (action === 'selectAll') this.selectAll();
    else if (action === 'debug') this.hud.debugVisible = !this.hud.debugVisible;
    else if (action === 'turnBuilding') {
      if (this.tool?.kind === 'build') this.tool.turns = (this.tool.turns + 1) % 8;
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
    for (const id of this.selected) result = cmdAttackRegiment(this.world, id, targetId);
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
