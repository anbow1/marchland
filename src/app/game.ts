import { AI, MAP, TOWN } from '../config.ts';
import { FixedLoop } from '../core/loop.ts';
import { cmdAttackBuilding, cmdAttackRegiment, cmdBuild, cmdDemolish, cmdHalt, cmdMoveGroup, cmdRecruit, cmdTogglePaused, cmdUpgrade } from '../sim/commands.ts';
import type { GameEvent } from '../sim/events.ts';
import type { Regiment } from '../sim/regiment.ts';
import { heightAtM, plotX, plotZ, rallyX, rallyZ, townX, townZ } from '../sim/terrain.ts';
import { type CommandResult, COMPUTER, type Difficulty, PLAYER, type Side } from '../sim/types.ts';
import { createWorld, findRegiment, stepWorld, type World } from '../sim/world.ts';
import { CpuTimer } from '../render/perf.ts';
import { Hud } from '../ui/hud.ts';
import type { Sound } from '../ui/sound.ts';
import { T } from '../ui/strings.ts';
import type { Action } from './bindings.ts';
import { Controls, type ControlTarget } from './controls.ts';
import { groundHit, type Ray } from './picking.ts';
import { RtsCamera } from './rtsCamera.ts';
import type { WorldView } from './worldView.ts';

// One game from first step to the fall of a keep: owns the world, the camera,
// the selection and the loop; turns the player's gestures into the commands of
// sim/commands.ts and the world's events into sound and messages.

export interface GameOptions {
  seed: number;
  difficulty: Difficulty;
  /** Lets the frame governor trade resolution for frame rate. Off for measurements. */
  governor: boolean;
  edgeScroll: boolean;
}

/** Least seconds between two "enemy at the town" warnings. */
const WARNING_GAP_S = 45;

export class Game implements ControlTarget {
  readonly world: World;
  readonly camera: RtsCamera;
  readonly loop: FixedLoop;
  readonly hud: Hud;
  private readonly controls: Controls;
  private readonly selected = new Set<number>();
  private selectedPlot = -1;
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
    this.world = createWorld({ seed: options.seed, difficulty: options.difficulty, computerPlays: true });
    // Start over the player's town, looking towards the enemy (north-east).
    this.camera = new RtsCamera(townX(PLAYER) + 18, townZ(PLAYER) - 18, Math.PI / 4);
    this.hud = new Hud(hudRoot, {
      build: (plot, kind) => this.report(cmdBuild(this.world, PLAYER, plot, kind)),
      upgrade: (plot) => this.report(cmdUpgrade(this.world, PLAYER, plot)),
      demolish: (plot) => this.report(cmdDemolish(this.world, PLAYER, plot)),
      togglePaused: (plot) => this.report(cmdTogglePaused(this.world, PLAYER, plot)),
      recruit: (kind) => this.report(cmdRecruit(this.world, PLAYER, kind)),
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
      case 'arrowHit':
      case 'death':
        this.sound.play('thud', distanceM);
        break;
      case 'charge':
        this.sound.play('horn', distanceM);
        break;
      case 'rout':
        this.sound.play('hornLow', distanceM);
        this.hud.toast(mine ? T.routed : T.enemyRouted, mine ? 'bad' : 'good');
        break;
      case 'shattered':
        this.sound.play('hornLow', distanceM);
        this.hud.toast(mine ? T.shattered : T.enemyRouted, mine ? 'bad' : 'good');
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
      case 'recruited':
        if (mine) {
          this.sound.play('build');
          this.hud.toast(T.recruited, 'good');
        }
        break;
      case 'destroyed':
        this.sound.play('thud', distanceM);
        if (mine) this.hud.toast(T.lost, 'bad');
        break;
      case 'starving':
        if (mine) this.hud.toast(T.starving, 'bad');
        break;
      case 'fed':
        if (mine) this.hud.toast(T.fed, 'good');
        break;
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
      this.hud.toast(T.attackWarning, 'bad');
      return;
    }
  }

  private render(frameSeconds: number): void {
    if (frameSeconds > 0) this.fps += (1 / frameSeconds - this.fps) * 0.05;
    this.controls.update(frameSeconds);
    this.camera.update(frameSeconds);
    this.timer.begin();
    this.view.render(this.world, this.camera, this.selected, this.selectedPlot);
    this.timer.lap('draw');
    this.updateCorners();
    this.hud.update(this.world, { regiments: this.selected, plot: this.selectedPlot }, (x, y, z, out) => this.view.project(x, y, z, out), heightAtM, this.corners, frameSeconds);
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
    for (let plot = 0; plot < TOWN.plotCount; plot++) {
      if (Math.hypot(x - plotX(side, plot), z - plotZ(side, plot)) < TOWN.buildingRadiusM) return plot;
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
    this.selectedPlot = -1;
    this.hud.setHint(T.hintArmy);
    this.sound.play('click');
  }

  select(screenX: number, screenY: number, additive: boolean): void {
    this.sound.unlock();
    if (!this.ground(screenX, screenY, this.hit)) return;
    const r = this.regimentAt(this.hit.x, this.hit.z, PLAYER);
    if (r) {
      this.selectRegiment(r.id, additive);
      return;
    }
    if (additive) return;
    this.selected.clear();
    const plot = this.plotAt(this.hit.x, this.hit.z, PLAYER);
    this.selectedPlot = plot >= 0 ? plot : -1;
    if (plot >= 0) this.sound.play('click');
    this.hud.setHint(T.hintIdle);
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
      this.selectedPlot = -1;
      this.hud.setHint(T.hintArmy);
    }
  }

  showBox(x0: number, y0: number, x1: number, y1: number, visible: boolean): void {
    this.hud.selectionBox(x0, y0, x1, y1, visible);
  }

  order(screenX: number, screenY: number, run: boolean, faceToX: number | null, faceToZ: number | null): void {
    if (this.selected.size === 0 || !this.ground(screenX, screenY, this.hit)) return;
    const ids = [...this.selected];
    const x = this.hit.x;
    const z = this.hit.z;
    const enemy = this.regimentAt(x, z, COMPUTER);
    if (enemy && faceToX === null) {
      this.attackRegiment(enemy.id);
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
    const own = this.regimentAt(this.hit.x, this.hit.z, PLAYER);
    const ownPlot = this.plotAt(this.hit.x, this.hit.z, PLAYER);
    // With troops selected, a tap anywhere but on one's own troops or town is an order.
    if (this.selected.size > 0 && !own && ownPlot === -2) this.order(screenX, screenY, double, null, null);
    else this.select(screenX, screenY, false);
  }

  press(action: Action): void {
    this.sound.unlock();
    if (action === 'halt') this.haltSelected();
    else if (action === 'selectAll') this.selectAll();
    else if (action === 'debug') this.hud.debugVisible = !this.hud.debugVisible;
    else if (action === 'cancel') {
      if (this.selected.size > 0 || this.selectedPlot >= 0) {
        this.selected.clear();
        this.selectedPlot = -1;
        this.hud.setHint(T.hintIdle);
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
      this.selectedPlot = -1;
      this.hud.setHint(T.hintArmy);
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
        this.place(0, 0, 260, Math.PI / 4);
        break;
      default:
        throw new Error(`unknown spot '${name}'; valid: town rally field close enemy overview`);
    }
  }
}
