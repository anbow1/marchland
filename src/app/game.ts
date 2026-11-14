import { AI, CAMERA, FIELDS, MAP, ROADS, TOWN } from '../config.ts';
import { FixedLoop } from '../core/loop.ts';
import { cmdAttackBuilding, cmdAttackRegiment, cmdBuild, cmdBuildRoad, cmdBuildWall, cmdDemolish, cmdGarrison, cmdHalt, cmdMoveGroup, cmdRearm, cmdRecruit, cmdTogglePaused, cmdUngarrison, cmdUpgrade, roadCost, wallCost } from '../sim/commands.ts';
import type { GameEvent } from '../sim/events.ts';
import type { Regiment } from '../sim/regiment.ts';
import { cellX, cellZ, roadCells, wallCells } from '../sim/nav.ts';
import { checkSite, mayLayRoadAt, yawToKeep } from '../sim/placement.ts';
import { DEPOSITS, forestCoverAt, heightAtM, isWater, rallyX, rallyZ, townX, townZ } from '../sim/terrain.ts';
import { type BuildingKind, type CommandResult, COMPUTER, type Difficulty, PLAYER, type Side } from '../sim/types.ts';
import { createWorld, findRegiment, stepWorld, type World } from '../sim/world.ts';
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
  /** Lets the frame governor trade resolution for frame rate. Off for measurements. */
  governor: boolean;
  edgeScroll: boolean;
}

/** What the player is placing on the map: a building (turned by `turns` eighths of a circle from facing the keep), or a road from a point. */
type Tool = { kind: 'build'; building: BuildingKind; turns: number } | { kind: 'road' | 'wall'; fromX: number; fromZ: number; started: boolean };

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
    this.world = createWorld({ seed: options.seed, difficulty: options.difficulty, computerPlays: true });
    // Start over the player's town, looking towards the enemy (north-east).
    this.camera = new RtsCamera(townX(PLAYER) + 18, townZ(PLAYER) - 18, Math.PI / 4);
    this.hud = new Hud(hudRoot, {
      pickBuilding: (kind) => this.pickTool({ kind: 'build', building: kind, turns: 0 }),
      pickRoad: () => this.pickTool({ kind: 'road', fromX: 0, fromZ: 0, started: false }),
      pickWall: () => this.pickTool({ kind: 'wall', fromX: 0, fromZ: 0, started: false }),
      ungarrison: (plot) => this.report(cmdUngarrison(this.world, PLAYER, plot)),
      rotateCamera: (direction) => this.camera.rotate(direction * CAMERA.rotateStepRad),
      upgrade: (plot) => this.report(cmdUpgrade(this.world, PLAYER, plot)),
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
      case 'garrisoned':
        if (mine) this.hud.toast(T.garrisoned, 'good');
        break;
      case 'wallBroken':
        this.sound.play('thud', distanceM);
        if (!mine) this.hud.toast(T.wallBroken, 'bad');
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
    const placing = this.updateTool();
    this.view.render(this.world, this.camera, this.selected, this.selectedPlot >= 0 ? this.selectedPlot : -2, placing === 'ghost' ? this.ghost : null, placing === 'none' ? null : this.tiles, frameSeconds);
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
    for (const d of DEPOSITS) if (Math.hypot(x - d.x, z - d.z) < TOWN.depositRadiusM) return d.kind === 'stone' ? T.hover.stone : T.hover.ore;
    if (isWater(x, z)) return T.hover.lake;
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
    this.selectedPlot = -1;
  }

  /** Puts down the tool; a road in the middle of a stretch first lets go of its start. */
  private dropTool(): void {
    if (this.tool && this.tool.kind !== 'build' && this.tool.started) this.tool.started = false;
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
    this.selectedPlot = -1;
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
      this.selectRegiment(r.id, additive);
      return;
    }
    if (additive) return;
    this.selected.clear();
    const plot = this.plotAt(this.hit.x, this.hit.z, PLAYER);
    this.selectedPlot = plot >= 0 ? plot : -1;
    if (plot >= 0) this.sound.play('click');
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
      this.selectedPlot = -1;
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

  press(action: Action): void {
    this.sound.unlock();
    if (action === 'halt') this.haltSelected();
    else if (action === 'selectAll') this.selectAll();
    else if (action === 'debug') this.hud.debugVisible = !this.hud.debugVisible;
    else if (action === 'turnBuilding') {
      if (this.tool?.kind === 'build') this.tool.turns = (this.tool.turns + 1) % 8;
    } else if (action === 'road') this.pickTool({ kind: 'road', fromX: 0, fromZ: 0, started: false });
    else if (action === 'cancel') {
      if (this.tool) this.dropTool();
      else if (this.selected.size > 0 || this.selectedPlot >= 0) {
        this.selected.clear();
        this.selectedPlot = -1;
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
      this.selectedPlot = -1;
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
