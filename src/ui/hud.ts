import { ARMY, BUILDINGS, FIELDS, FOOD, GATE, KEEP_LEVELS, KEEP_UPGRADE_SECONDS, MAX_LEVEL, PEOPLE, REARM, ROADS, TOWER, UNITS, WALLS } from '../config.ts';
import { resourceIcon } from './icons.ts';
import { canRearm, rearmCost } from '../sim/commands.ts';
import { barracksLevel, type Building, buildingCost, canAffordBuilding, canAffordUnit, flowRates, keepRules, lackingInput, peopleFor, rationsIn, type Town, workState } from '../sim/economy.ts';
import { freePeople } from '../sim/people.ts';
import { isEngaged, type Regiment } from '../sim/regiment.ts';
import { type BuildingKind, BUILDING_KINDS, KEEP, PLAYER, type ResourceId, RESOURCE_IDS, type UnitKind, UNIT_KINDS } from '../sim/types.ts';
import { menAlive, type World } from '../sim/world.ts';
import { TEAM_CSS } from '../render/palette.ts';
import { Minimap } from './minimap.ts';
import { T } from './strings.ts';

// The heads-up display, in DOM (rules §7): stock along the top, the panel for
// whatever is selected at the bottom, the minimap in the corner, a card over
// every regiment, and messages. Everything shown has a source in the world.

export interface HudActions {
  /** Takes up a building to place on the map, or the road tool. */
  pickBuilding(kind: BuildingKind): void;
  pickRoad(): void;
  pickWall(): void;
  pickGate(): void;
  /** Brings a tower's garrison out. */
  ungarrison(plot: number): void;
  /** Turns the map: −1 left, +1 right. */
  rotateCamera(direction: number): void;
  upgrade(plot: number): void;
  upgradeKeep(): void;
  demolish(plot: number): void;
  togglePaused(plot: number): void;
  recruit(kind: UnitKind): void;
  rearm(regimentId: number, kind: UnitKind): void;
  halt(): void;
  selectAll(): void;
  selectRegiment(id: number, additive: boolean): void;
  /** The order button pressed on a regiment's card: attack it, if it is an enemy. */
  orderRegiment(id: number): void;
  setSpeed(speed: number): void;
  openMenu(): void;
  jump(x: number, z: number): void;
}

export interface Selection {
  regiments: ReadonlySet<number>;
  /** The player's building shown in the panel (its place in the town's list); -1 for none. */
  plot: number;
  /** What the player is placing: a building kind, 'road', or '' for nothing. */
  tool: string;
}

/** Projects a world point to CSS pixels; false when it is off screen behind the camera. */
export type Project = (x: number, y: number, z: number, out: { x: number; y: number }) => boolean;

const RESOURCE_GROUPS: readonly (readonly ResourceId[])[] = [
  ['gold', 'wood', 'stone'],
  ['grain', 'flour', 'bread', 'fish', 'meat', 'sausage', 'grapes', 'wine'],
  ['hide', 'leatherArmor', 'ironOre', 'iron', 'weapon', 'mailArmor', 'bow', 'horse'],
];

const UNIT_GLYPH: Record<UnitKind, string> = { militia: '⛨', pikemen: '↟', archers: '➶', swordsmen: '⚔', halberdiers: '⚒', crossbowmen: '⌖', lightCavalry: '♞', heavyCavalry: '♛', ballista: '⇶', trebuchet: '☄' };

const MAX_CARDS = 48;
const PANEL_REFRESH_S = 0.25;
const TOAST_SECONDS = 5;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent?.appendChild(node);
  return node;
}

function costHtml(town: Town, kind: BuildingKind, level: number): string {
  let html = '';
  for (const id of RESOURCE_IDS) {
    const amount = buildingCost(kind, level, id);
    if (amount === 0) continue;
    const short = town.stock[id] < amount ? ' short' : '';
    html += `<span class="cost${short}"><i class="ico">${resourceIcon(id)}</i>${amount}</span>`;
  }
  return html;
}

function unitCostHtml(town: Town, kind: UnitKind): string {
  const def = UNITS[kind];
  let html = `<span class="cost${town.stock.gold < def.goldCost ? ' short' : ''}"><i class=\"ico\">${resourceIcon('gold')}</i>${def.goldCost}</span>`;
  for (const id of RESOURCE_IDS) {
    const amount = (def.equipment[id] ?? 0) * def.men;
    if (amount === 0) continue;
    html += `<span class="cost${town.stock[id] < amount ? ' short' : ''}"><i class="ico">${resourceIcon(id)}</i>${amount}</span>`;
  }
  return html;
}

function recipeText(kind: BuildingKind): string {
  const recipe = BUILDINGS[kind].recipe;
  if (!recipe) return '';
  const list = (cost: Partial<Record<ResourceId, number>>): string =>
    RESOURCE_IDS.filter((id) => (cost[id] ?? 0) > 0)
      .map((id) => `${cost[id]} ${T.resources[id].toLowerCase()}`)
      .join(' + ');
  const inputs = list(recipe.inputs);
  return inputs ? `${inputs} → ${list(recipe.outputs)}` : `→ ${list(recipe.outputs)}`;
}

export class Hud {
  private readonly chips = new Map<ResourceId, HTMLElement>();
  private readonly chipValues = new Map<ResourceId, number>();
  private readonly armyChip: HTMLElement;
  private readonly peopleChip: HTMLElement;
  private readonly foodChip: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly cards: HTMLElement[] = [];
  private readonly cardKeys: string[] = [];
  private readonly debug: HTMLElement;
  private readonly box: HTMLElement;
  private readonly hoverTip: HTMLElement;
  private hoverText = '';
  private readonly minimap: Minimap;
  private readonly screen = { x: 0, y: 0 };
  private panelHtml = '';
  private panelAge = PANEL_REFRESH_S;
  private mapAge = 1;
  debugVisible = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly actions: HudActions,
  ) {
    root.innerHTML = '';
    const top = el('div', 'topbar', root);
    for (const group of RESOURCE_GROUPS) {
      const box = el('div', 'chips', top);
      for (const id of group) {
        const chip = el('span', 'chip', box);
        chip.title = T.resources[id];
        chip.innerHTML = `<i class="ico">${resourceIcon(id)}</i><em>${T.resources[id]}</em><b>0</b>`;
        this.chips.set(id, chip.querySelector('b') as HTMLElement);
      }
    }
    const right = el('div', 'chips right', top);
    this.peopleChip = el('span', 'chip', right);
    this.foodChip = el('span', 'chip', right);
    this.armyChip = el('span', 'chip', right);
    this.clock = el('span', 'chip', right);
    for (const speed of [1, 2, 3]) {
      const b = el('button', 'speed', right);
      b.textContent = `${speed}×`;
      b.title = T.speed;
      b.dataset['speed'] = String(speed);
      b.addEventListener('click', () => {
        actions.setSpeed(speed);
        for (const other of right.querySelectorAll('button.speed')) other.classList.toggle('on', other === b);
      });
      if (speed === 1) b.classList.add('on');
    }
    for (const [direction, glyph, tip] of [[-1, '⟲', T.turnLeft], [1, '⟳', T.turnRight]] as const) {
      const b = el('button', 'speed turn', right);
      b.textContent = glyph;
      b.title = tip;
      b.addEventListener('click', () => actions.rotateCamera(direction));
    }
    const menu = el('button', 'menuButton', right);
    menu.textContent = T.menu;
    menu.addEventListener('click', () => actions.openMenu());

    this.toasts = el('div', 'toasts', root);
    const cardLayer = el('div', 'cards', root);
    for (let i = 0; i < MAX_CARDS; i++) {
      const card = el('div', 'card', cardLayer);
      card.style.display = 'none';
      this.cards.push(card);
      this.cardKeys.push('');
    }
    cardLayer.addEventListener('pointerdown', (e) => {
      const card = (e.target as HTMLElement).closest('.card') as HTMLElement | null;
      if (!card) return;
      e.stopPropagation();
      // The card sits over the map: it takes the same buttons the map does.
      if (e.button === 2) actions.orderRegiment(Number(card.dataset['id']));
      else if (card.dataset['own'] === '1') actions.selectRegiment(Number(card.dataset['id']), e.shiftKey);
    });
    root.addEventListener('contextmenu', (e) => e.preventDefault());

    const bottom = el('div', 'bottom', root);
    this.minimap = new Minimap((x, z) => actions.jump(x, z));
    bottom.appendChild(this.minimap.canvas);
    const panelBox = el('div', 'panelBox', bottom);
    this.panel = el('div', 'panel', panelBox);
    this.tip = el('div', 'tip', panelBox);
    this.tip.textContent = T.hintIdle;
    // Actions fire on press: the panel is redrawn several times a second, and a click needs the
    // same element under the pointer at press and release.
    this.panel.addEventListener('pointerdown', (e) => {
      const target = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!target) return;
      e.stopPropagation();
      this.act(target.dataset['act'] as string, target.dataset['arg'] ?? '');
    });
    this.panel.addEventListener('pointerover', (e) => {
      const target = (e.target as HTMLElement).closest('[data-tip]') as HTMLElement | null;
      if (target) this.tip.textContent = target.dataset['tip'] as string;
    });
    this.debug = el('pre', 'debug', root);
    this.debug.style.display = 'none';
    this.box = el('div', 'selectBox', root);
    this.box.style.display = 'none';
    this.hoverTip = el('div', 'hoverTip', root);
    this.hoverTip.style.display = 'none';
  }

  private plotInPanel = -1;
  private tab: 'build' | 'army' | 'prod' = 'build';

  private act(name: string, arg: string): void {
    switch (name) {
      case 'build':
        this.actions.pickBuilding(arg as BuildingKind);
        break;
      case 'road':
        this.actions.pickRoad();
        break;
      case 'wall':
        this.actions.pickWall();
        break;
      case 'gate':
        this.actions.pickGate();
        break;
      case 'ungarrison':
        this.actions.ungarrison(this.plotInPanel);
        break;
      case 'show': {
        const [x, z] = arg.split(',').map(Number);
        this.actions.jump(x as number, z as number);
        break;
      }
      case 'tab':
        this.tab = arg === 'army' ? 'army' : arg === 'prod' ? 'prod' : 'build';
        break;
      case 'upgrade':
        this.actions.upgrade(this.plotInPanel);
        break;
      case 'upgradeKeep':
        this.actions.upgradeKeep();
        break;
      case 'demolish':
        this.actions.demolish(this.plotInPanel);
        break;
      case 'pause':
        this.actions.togglePaused(this.plotInPanel);
        break;
      case 'recruit':
        this.actions.recruit(arg as UnitKind);
        break;
      case 'rearm': {
        const [id, kind] = arg.split(':');
        this.actions.rearm(Number(id), kind as UnitKind);
        break;
      }
      case 'halt':
        this.actions.halt();
        break;
      case 'all':
        this.actions.selectAll();
        break;
      case 'pick':
        this.actions.selectRegiment(Number(arg), false);
        break;
      default:
        throw new Error(`unknown HUD action '${name}'`);
    }
    // Show the result at once rather than at the next refresh.
    this.panelAge = PANEL_REFRESH_S;
  }

  /** A message for a few seconds; with a place, a "show" link that turns the camera there. */
  toast(text: string, tone: 'good' | 'bad' | 'plain' = 'plain', at: readonly [number, number] | null = null): void {
    const node = el('div', `toast ${tone}`, this.toasts);
    node.textContent = text;
    if (at) {
      const link = el('button', 'link', node);
      link.textContent = T.show;
      link.addEventListener('click', () => this.actions.jump(at[0], at[1]));
    }
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => node.remove(), TOAST_SECONDS * 1000);
  }

  /** Shows or hides the rubber band of a box selection (CSS pixels). */
  selectionBox(x0: number, y0: number, x1: number, y1: number, visible: boolean): void {
    this.box.style.display = visible ? 'block' : 'none';
    if (!visible) return;
    this.box.style.left = `${Math.min(x0, x1)}px`;
    this.box.style.top = `${Math.min(y0, y1)}px`;
    this.box.style.width = `${Math.abs(x1 - x0)}px`;
    this.box.style.height = `${Math.abs(y1 - y0)}px`;
  }

  setDebugText(text: string): void {
    this.debug.style.display = this.debugVisible ? 'block' : 'none';
    if (this.debugVisible) this.debug.textContent = text;
  }

  private recruitHtml(world: World, town: Town): string {
    // With no barracks the keep still arms militia.
    const level = barracksLevel(town);
    const men = menAlive(world, PLAYER);
    const free = freePeople(world, PLAYER);
    let html = `<div class="row wrap"><span class="label">${T.recruit}</span>`;
    for (const kind of UNIT_KINDS) {
      const def = UNITS[kind];
      const locked = def.barracksLevel > level;
      const full = men + def.men > ARMY.maxSoldiersPerSide;
      const hands = free >= peopleFor(kind) + PEOPLE.minFreeAfterCallUp;
      const off = locked || full || !hands || !canAffordUnit(town.stock, kind) ? ' off' : '';
      const need = locked ? ` (${T.needsBarracksLevel} ${def.barracksLevel})` : def.barracksLevel === 0 ? ` (${T.atKeep})` : '';
      html += `<button class="option${off}" data-act="recruit" data-arg="${kind}" data-tip="${T.units[kind].name}: ${T.units[kind].about}${need}"><span class="glyph">${UNIT_GLYPH[kind]}</span><span class="name">${T.units[kind].name}</span><span class="costs">${locked ? need : unitCostHtml(town, kind)}</span></button>`;
    }
    html += '</div>';
    if (town.recruitQueue.length > 0) {
      const first = town.recruitQueue[0];
      const names = town.recruitQueue.map((o) => T.units[o.kind].name).join(', ');
      const walking = first && first.arrived < first.needPeople ? ` — ${first.needPeople - first.arrived} ${T.recruits}` : first ? ` (${Math.ceil(first.leftS)} s)` : '';
      html += `<div class="status">${T.queue}: ${names}${walking}</div>`;
    }
    return html;
  }

  /** The list of buildings to place, and the road. */
  private buildHtml(town: Town, tool: string): string {
    let html = `<div class="row wrap"><span class="label">${T.build}</span>`;
    for (const kind of BUILDING_KINDS) {
      const off = canAffordBuilding(town.stock, kind, 1) ? '' : ' off';
      const on = tool === kind ? ' on' : '';
      const recipe = recipeText(kind);
      html += `<button class="option${off}${on}" data-act="build" data-arg="${kind}" data-tip="${T.buildings[kind].name}: ${T.buildings[kind].about}${recipe ? ` (${recipe})` : ''}"><span class="name">${T.buildings[kind].name}</span><span class="costs">${costHtml(town, kind, 1)}</span></button>`;
    }
    const perTen = (ROADS.stonePerCell * 10) / ROADS.cellM;
    html += `<button class="option${tool === 'road' ? ' on' : ''}" data-act="road" data-tip="${T.road}: ${T.roadAbout}"><span class="name">${T.road}</span><span class="costs"><span class="cost"><i class=\"ico\">${resourceIcon('stone')}</i>${perTen.toFixed(1)} / 10 m</span></span></button>`;
    const wallTen = (WALLS.stonePerCell * 10) / ROADS.cellM;
    html += `<button class="option${tool === 'wall' ? ' on' : ''}" data-act="wall" data-tip="${T.wall}: ${T.wallAbout}"><span class="name">${T.wall}</span><span class="costs"><span class="cost"><i class=\"ico\">${resourceIcon('stone')}</i>${wallTen.toFixed(0)} / 10 m</span></span></button>`;
    const gateOff = town.stock.wood >= GATE.cost.wood && town.stock.stone >= GATE.cost.stone ? '' : ' off';
    html += `<button class="option${gateOff}${tool === 'gate' ? ' on' : ''}" data-act="gate" data-tip="${T.gate}: ${T.gateAbout}"><span class="name">${T.gate}</span><span class="costs"><span class="cost"><i class=\"ico\">${resourceIcon('wood')}</i>${GATE.cost.wood}</span><span class="cost"><i class=\"ico\">${resourceIcon('stone')}</i>${GATE.cost.stone}</span></span></button>`;
    return `${html}</div>`;
  }

  private stockText(stock: Readonly<Record<ResourceId, number>>): string {
    const parts = RESOURCE_IDS.filter((id) => stock[id] > 0).map((id) => `${T.resources[id].toLowerCase()} ${stock[id]}`);
    return parts.length > 0 ? parts.join(', ') : '—';
  }

  /**
   * Each good: what lies in the keep, what is made a minute and how the store changes a minute (over the
   * last two minutes); then what holds the workshops up, each line pointing at the building.
   */
  private productionHtml(town: Town): string {
    const { made, net } = flowRates(town);
    const fmt = (v: number): string => (Math.abs(v) < 0.05 ? '·' : `${v > 0 ? '+' : '−'}${Math.abs(v) < 10 ? Math.abs(v).toFixed(1) : Math.round(Math.abs(v))}`);
    let rows = '';
    for (const id of RESOURCE_IDS) {
      if (town.stock[id] < 0.5 && Math.abs(made[id]) < 0.05 && Math.abs(net[id]) < 0.05) continue;
      const tone = net[id] < -0.05 ? ' short' : '';
      rows += `<div class="prodRow"><i class="ico">${resourceIcon(id)}</i><span class="name">${T.resources[id]}</span><b>${Math.floor(town.stock[id])}</b><span>${fmt(made[id])}</span><span class="net${tone}">${fmt(net[id])}</span></div>`;
    }
    const head = `<div class="prodRow head"><i></i><span class="name"></span><b>${T.prodStock}</b><span>${T.prodMade}</span><span>${T.prodNet}</span></div>`;
    // Hold-ups: workshops not working, gathered by kind and reason.
    const groups = new Map<string, { text: string; count: number; x: number; z: number }>();
    for (const b of town.plots) {
      if (!b || b.kind === 'house' || b.kind === 'barracks' || b.kind === 'tower') continue;
      const state = workState(b);
      if (state === 'working' || state === 'building' || state === 'waiting') continue;
      const lacks = state === 'noInput' ? lackingInput(b) : null;
      const key = `${b.kind}|${state}|${lacks ?? ''}`;
      const g = groups.get(key);
      if (g) g.count++;
      else groups.set(key, { text: `${T.buildings[b.kind].name}: ${T.work[state]}${lacks ? ` (${T.lacks}: ${T.resources[lacks].toLowerCase()})` : ''}`, count: 1, x: b.x, z: b.z });
    }
    let holdUps = '';
    for (const g of groups.values()) holdUps += `<div class="holdUp">${g.count > 1 ? `${g.count}× ` : ''}${g.text} <button class="link" data-act="show" data-arg="${g.x.toFixed(1)},${g.z.toFixed(1)}">${T.show}</button></div>`;
    return `<div class="prod"><div class="prodTable">${head}${rows}</div><div class="holdUps"><div class="label">${T.holdUps}</div>${holdUps || `<div class="holdUp ok">${T.allWorking}</div>`}</div></div>`;
  }

  /** The keep: its level, what the level gives, and the way to the next. */
  private keepHtml(town: Town): string {
    const rules = keepRules(town);
    let status = `${T.keepHp} ${Math.ceil(town.keepHp)}/${rules.hp} · ${T.keepReach} ${rules.territoryM} m · ${T.barracksUpTo} ${rules.barracks}`;
    if (town.keepUpgradeLeftS > 0) status += ` · ${T.keepRaising}: ${Math.round((1 - town.keepUpgradeLeftS / KEEP_UPGRADE_SECONDS) * 100)}%`;
    let html = `<div class="heading">${T.keep} · ${T.level} ${town.keepLevel}/${KEEP_LEVELS.length} <span class="status">${status}</span></div><div class="status">${T.keepAbout}</div>`;
    const next = KEEP_LEVELS[town.keepLevel];
    if (next && town.keepUpgradeLeftS === 0) {
      const cost = next.cost as Partial<Record<ResourceId, number>>;
      let costs = '';
      let short = false;
      for (const id of RESOURCE_IDS) {
        const amount = cost[id] ?? 0;
        if (amount === 0) continue;
        if (town.stock[id] < amount) short = true;
        costs += `<span class="cost${town.stock[id] < amount ? ' short' : ''}"><i class="ico">${resourceIcon(id)}</i>${amount}</span>`;
      }
      html += `<div class="row"><button class="option${short ? ' off' : ''}" data-act="upgradeKeep" data-tip="${T.keepUpgrade}: ${T.level} ${town.keepLevel + 1} · ${T.keepReach} ${next.territoryM} m · ${T.barracksUpTo} ${next.barracks}"><span class="name">${T.keepUpgrade}</span><span class="costs">${costs}</span></button></div>`;
    }
    return html;
  }

  private plotHtml(world: World, town: Town, plot: number): string {
    const b: Building | null = town.plots[plot] ?? null;
    if (!b) return this.idleHtml(world, town, '');
    const state = workState(b);
    let status: string = T.work[state];
    if (state === 'building') {
      const done = Math.round((1 - b.constructionLeftS / b.constructionTotalS) * 100);
      const carried = b.matTotal > 0 ? ` · ${T.resources.wood.toLowerCase()}/${T.resources.stone.toLowerCase()} ${b.matDelivered}/${b.matTotal}` : '';
      status = `${T.underConstruction}: ${done}%${carried}`;
    } else if (b.kind === 'barracks') status = `${T.trains} ${T.level} ${b.level}`;
    else if (b.kind === 'house') status = `${b.residents}/${PEOPLE.houseResidents[b.level - 1]} ${T.residents}${b.starving ? ` · ${T.starving}` : ''}`;
    let html = `<div class="heading">${T.buildings[b.kind].name} · ${T.level} ${b.level}/${MAX_LEVEL} <span class="status${state === 'noWorker' || state === 'yardFull' || b.starving ? ' alarm' : ''}">${status}</span></div>`;
    html += `<div class="status">${T.buildings[b.kind].about} ${recipeText(b.kind)}</div>`;
    if (b.kind === 'house') html += `<div class="status">${T.stores}: ${this.stockText(b.inp)}</div>`;
    else if (b.kind !== 'barracks') {
      const recipe = BUILDINGS[b.kind].recipe;
      const hasInputs = recipe !== null && RESOURCE_IDS.some((id) => (recipe.inputs[id] ?? 0) > 0);
      html += `<div class="status">${hasInputs ? `${T.stores}: ${this.stockText(b.inp)} · ` : ''}${T.yard}: ${this.stockText(b.out)}</div>`;
    }
    if (b.kind === 'tower') {
      const kind = b.garrisonKind ? ` (${T.units[b.garrisonKind].name})` : '';
      html += `<div class="status">${T.garrison}: ${b.garrison}/${TOWER.maxGarrison}${kind}</div>`;
      if (b.garrison > 0) html += `<div class="row"><button class="option" data-act="ungarrison" data-tip="${T.ungarrison}"><span class="name">${T.ungarrison}</span></button></div>`;
    }
    if (b.kind === 'farm') {
      const worked = Math.min(FIELDS.stripsPerLevel[b.level - 1] as number, b.strips.length);
      html += `<div class="status">${T.fields}: ${worked}/${b.strips.length}</div>`;
    }
    html += '<div class="row">';
    if (b.level < MAX_LEVEL) {
      const off = b.constructionLeftS > 0 || !canAffordBuilding(town.stock, b.kind, b.level + 1) ? ' off' : '';
      html += `<button class="option${off}" data-act="upgrade" data-tip="${T.upgrade}: ${T.level} ${b.level + 1}"><span class="name">${T.upgrade}</span><span class="costs">${costHtml(town, b.kind, b.level + 1)}</span></button>`;
    } else {
      html += `<span class="label">${T.maxLevel}</span>`;
    }
    if (b.kind !== 'house' && b.kind !== 'barracks' && b.kind !== 'tower') html += `<button class="option" data-act="pause" data-tip="${T.pause}"><span class="name">${b.paused ? T.unpause : T.pause}</span></button>`;
    html += `<button class="option" data-act="demolish" data-tip="${T.demolish}"><span class="name">${T.demolish}</span></button></div>`;
    if (b.kind === 'barracks') html += this.recruitHtml(world, town);
    return html;
  }

  private stateText(r: Regiment): string {
    if (r.state === 'routing') return T.state.routing;
    if (r.rearmTo !== null) return `${T.rearmingState} → ${T.units[r.rearmTo].name} (${Math.ceil(r.rearmLeftS)} s)`;
    if (isEngaged(r)) return T.state.fighting;
    if (r.order === 'move') return T.state.move;
    if (r.order === 'attackRegiment') return T.state.attack;
    if (r.order === 'attackBuilding') return T.state.siege;
    return T.state.hold;
  }

  /** Re-arm buttons for one selected regiment: what it may become, and what that costs. */
  private rearmHtml(world: World, r: Regiment): string {
    const targets = REARM.paths[r.kind];
    if (r.side !== PLAYER || targets.length === 0 || r.rearmTo !== null) return '';
    const town = world.towns[PLAYER];
    let html = `<div class="row wrap"><span class="label">${T.rearm}</span>`;
    for (const to of targets) {
      const able = canRearm(world, r.id, to);
      const cost = rearmCost(r, to);
      let costs = '';
      for (const id of RESOURCE_IDS) {
        const amount = cost[id] ?? 0;
        if (amount === 0) continue;
        costs += `<span class="cost${town.stock[id] < amount ? ' short' : ''}"><i class="ico">${resourceIcon(id)}</i>${amount}</span>`;
      }
      const why = able === 'ok' ? '' : ` — ${T.results[able]}`;
      html += `<button class="option${able === 'ok' ? '' : ' off'}" data-act="rearm" data-arg="${r.id}:${to}" data-tip="${T.rearm}: ${T.units[to].name}. ${T.units[to].about}${why}"><span class="glyph">${UNIT_GLYPH[to]}</span><span class="name">${T.units[to].name}</span><span class="costs">${costs || '—'}</span></button>`;
    }
    return `${html}</div>`;
  }

  private armyHtml(world: World, selected: ReadonlySet<number>): string {
    let html = `<div class="row"><button class="option" data-act="halt" data-tip="${T.halt}"><span class="name">${T.halt}</span></button><button class="option" data-act="all" data-tip="${T.selectAll}"><span class="name">${T.selectAll}</span></button></div><div class="row wrap">`;
    for (const r of world.regiments) {
      if (!selected.has(r.id) || r.aliveMen === 0) continue;
      const morale = Math.max(0, Math.round((r.morale / r.def.morale) * 100));
      html += `<div class="unit" data-act="pick" data-arg="${r.id}" data-tip="${T.units[r.kind].name}: ${T.units[r.kind].about}"><span class="glyph">${UNIT_GLYPH[r.kind]}</span><span class="name">${T.units[r.kind].name}</span><span class="small">${r.aliveMen}/${r.initialMen} ${T.men} · ${this.stateText(r)}</span><span class="bar"><i style="width:${morale}%" class="${morale > 55 ? 'ok' : morale > 25 ? 'warn' : 'bad'}"></i></span><span class="bar thin"><i style="width:${Math.round(r.fatigue * 100)}%" class="tired"></i></span></div>`;
    }
    html += '</div>';
    // One regiment chosen: what it may be re-armed as.
    if (selected.size === 1) {
      const only = world.regiments.find((r) => selected.has(r.id) && r.aliveMen > 0);
      if (only) html += this.rearmHtml(world, only);
    }
    return html;
  }

  /** Nothing selected: the building list, or (on its tab, once there is a barracks) the recruiting list. */
  private idleHtml(world: World, town: Town, tool: string): string {
    const tabs = `<div class="row tabs"><button class="tab${this.tab === 'build' ? ' on' : ''}" data-act="tab" data-arg="build">${T.build}</button><button class="tab${this.tab === 'army' ? ' on' : ''}" data-act="tab" data-arg="army">${T.recruit}</button><button class="tab${this.tab === 'prod' ? ' on' : ''}" data-act="tab" data-arg="prod">${T.production}</button></div>`;
    return tabs + (this.tab === 'build' ? this.buildHtml(town, tool) : this.tab === 'army' ? this.recruitHtml(world, town) : this.productionHtml(town));
  }

  private updateCards(world: World, selected: ReadonlySet<number>, project: Project, groundY: (x: number, z: number) => number): void {
    let used = 0;
    for (const r of world.regiments) {
      if (r.aliveMen === 0 || used >= MAX_CARDS) continue;
      const card = this.cards[used] as HTMLElement;
      // Above the banner (4.6 m pole).
      if (!project(r.centreX, groundY(r.centreX, r.centreZ) + 5.6, r.centreZ, this.screen)) continue;
      const strength = Math.round((r.aliveMen / r.initialMen) * 100);
      const morale = r.state === 'routing' ? 'flee' : r.morale > r.def.morale * 0.55 ? 'ok' : r.morale > r.def.morale * 0.25 ? 'warn' : 'bad';
      const key = `${r.id}|${r.kind}|${r.side}|${strength}|${morale}|${selected.has(r.id) ? 1 : 0}`;
      if (this.cardKeys[used] !== key) {
        this.cardKeys[used] = key;
        card.dataset['id'] = String(r.id);
        card.dataset['own'] = r.side === PLAYER ? '1' : '0';
        card.className = `card ${morale}${selected.has(r.id) ? ' selected' : ''}`;
        card.style.borderColor = TEAM_CSS[r.side];
        card.innerHTML = `<span class="glyph" style="background:${TEAM_CSS[r.side]}">${UNIT_GLYPH[r.kind]}</span><span class="bar"><i style="width:${strength}%"></i></span>`;
      }
      card.style.display = 'flex';
      card.style.transform = `translate(${Math.round(this.screen.x)}px, ${Math.round(this.screen.y)}px) translate(-50%, -100%)`;
      used++;
    }
    for (let i = used; i < MAX_CARDS; i++) {
      const card = this.cards[i] as HTMLElement;
      if (card.style.display !== 'none') card.style.display = 'none';
      this.cardKeys[i] = '';
    }
  }

  /** Once per rendered frame. `corners` is the camera's footprint for the minimap. */
  update(world: World, selection: Selection, project: Project, groundY: (x: number, z: number) => number, corners: readonly number[] | null, frameSeconds: number): void {
    const town = world.towns[PLAYER];
    for (const id of RESOURCE_IDS) {
      const value = town.stock[id];
      if (this.chipValues.get(id) === value) continue;
      this.chipValues.set(id, value);
      (this.chips.get(id) as HTMLElement).textContent = String(value);
    }
    this.updateCards(world, selection.regiments, project, groundY);
    this.panelAge += frameSeconds;
    if (this.panelAge >= PANEL_REFRESH_S) {
      this.panelAge = 0;
      const men = menAlive(world, PLAYER);
      let people = 0;
      for (const person of world.people) if (person.alive && person.side === PLAYER) people++;
      // Everything edible in the keep and the houses' larders, against what town and army eat.
      let rations = rationsIn(town.stock);
      for (const b of town.plots) if (b && b.kind === 'house') rations += rationsIn(b.inp);
      const perMinute = people * PEOPLE.rationsPerMinute + men * FOOD.soldierRationsPerMinute;
      this.foodChip.textContent = `${rations} / ${perMinute.toFixed(0)} ${T.rations}`;
      this.foodChip.classList.toggle('alarm', town.starving);
      this.peopleChip.textContent = `${T.people} ${people} (${T.free} ${freePeople(world, PLAYER)})`;
      this.armyChip.textContent = `${T.army} ${men}/${ARMY.maxSoldiersPerSide}`;
      const minutes = Math.floor(world.timeS / 60);
      this.clock.textContent = `${minutes}:${String(Math.floor(world.timeS % 60)).padStart(2, '0')}`;
      this.plotInPanel = selection.plot;
      let html: string;
      if (selection.regiments.size > 0) html = this.armyHtml(world, selection.regiments);
      else if (selection.plot >= 0) html = this.plotHtml(world, town, selection.plot);
      else if (selection.plot === KEEP) html = this.keepHtml(town);
      else html = this.idleHtml(world, town, selection.tool);
      if (html !== this.panelHtml) {
        this.panelHtml = html;
        this.panel.innerHTML = html;
      }
    }
    this.mapAge += frameSeconds;
    if (this.mapAge >= 0.1) {
      this.mapAge = 0;
      this.minimap.draw(world, selection.regiments, corners);
    }
  }

  /** The name of what is under the cursor, beside it; an empty text hides it. */
  hover(text: string, x: number, y: number): void {
    if (text !== this.hoverText) {
      this.hoverText = text;
      this.hoverTip.textContent = text;
      this.hoverTip.style.display = text ? 'block' : 'none';
    }
    if (text) this.hoverTip.style.transform = `translate(${Math.round(x + 16)}px, ${Math.round(y + 18)}px)`;
  }

  /** The hint line under the panel. */
  setHint(text: string): void {
    this.tip.textContent = text;
  }

  get element(): HTMLElement {
    return this.root;
  }
}
