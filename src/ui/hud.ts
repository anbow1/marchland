import { ARMY, BUILDINGS, MAX_LEVEL, UNITS } from '../config.ts';
import { barracksLevel, type Building, buildingCost, canAffordBuilding, canAffordUnit, isWorking, rationDemandPerSecond, type Town } from '../sim/economy.ts';
import { isEngaged, type Regiment } from '../sim/regiment.ts';
import { BUILDING_KINDS, type BuildingKind, PLAYER, RESOURCE_IDS, type ResourceId, UNIT_KINDS, type UnitKind } from '../sim/types.ts';
import { menAlive, type World } from '../sim/world.ts';
import { TEAM_CSS } from '../render/palette.ts';
import { Minimap } from './minimap.ts';
import { T } from './strings.ts';

// The heads-up display, in DOM (rules §7): stock along the top, the panel for
// whatever is selected at the bottom, the minimap in the corner, a card over
// every regiment, and messages. Everything shown has a source in the world.

export interface HudActions {
  build(plot: number, kind: BuildingKind): void;
  upgrade(plot: number): void;
  demolish(plot: number): void;
  togglePaused(plot: number): void;
  recruit(kind: UnitKind): void;
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
  /** The player's plot shown in the panel; -1 for none. */
  plot: number;
}

/** Projects a world point to CSS pixels; false when it is off screen behind the camera. */
export type Project = (x: number, y: number, z: number, out: { x: number; y: number }) => boolean;

const RESOURCE_GROUPS: readonly (readonly ResourceId[])[] = [
  ['gold', 'wood', 'stone'],
  ['grain', 'bread', 'meat', 'sausage'],
  ['hide', 'leatherArmor', 'ironOre', 'weapon', 'mailArmor', 'bow', 'horse'],
];

/** A swatch per resource (sRGB), to tell the chips apart at a glance. */
const RESOURCE_CSS: Record<ResourceId, string> = {
  gold: '#e3b93c',
  wood: '#8a643c',
  stone: '#9a9690',
  grain: '#c9a94a',
  bread: '#d9a25e',
  meat: '#b0564a',
  sausage: '#8c3d33',
  hide: '#b08d62',
  leatherArmor: '#7a5232',
  ironOre: '#6f6a78',
  weapon: '#c3c7cc',
  mailArmor: '#9aa3ad',
  bow: '#7d8a3c',
  horse: '#6b4a34',
};

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
    html += `<span class="cost${short}"><i style="background:${RESOURCE_CSS[id]}"></i>${amount}</span>`;
  }
  return html;
}

function unitCostHtml(town: Town, kind: UnitKind): string {
  const def = UNITS[kind];
  let html = `<span class="cost${town.stock.gold < def.goldCost ? ' short' : ''}"><i style="background:${RESOURCE_CSS.gold}"></i>${def.goldCost}</span>`;
  for (const id of RESOURCE_IDS) {
    const amount = (def.equipment[id] ?? 0) * def.men;
    if (amount === 0) continue;
    html += `<span class="cost${town.stock[id] < amount ? ' short' : ''}"><i style="background:${RESOURCE_CSS[id]}"></i>${amount}</span>`;
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
  private readonly foodChip: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly cards: HTMLElement[] = [];
  private readonly cardKeys: string[] = [];
  private readonly debug: HTMLElement;
  private readonly box: HTMLElement;
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
        chip.innerHTML = `<i style="background:${RESOURCE_CSS[id]}"></i><em>${T.resources[id]}</em><b>0</b>`;
        this.chips.set(id, chip.querySelector('b') as HTMLElement);
      }
    }
    const right = el('div', 'chips right', top);
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
  }

  private plotInPanel = -1;

  private act(name: string, arg: string): void {
    switch (name) {
      case 'build':
        this.actions.build(this.plotInPanel, arg as BuildingKind);
        break;
      case 'upgrade':
        this.actions.upgrade(this.plotInPanel);
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

  toast(text: string, tone: 'good' | 'bad' | 'plain' = 'plain'): void {
    const node = el('div', `toast ${tone}`, this.toasts);
    node.textContent = text;
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
    const level = barracksLevel(town);
    if (level === 0) return '';
    const men = menAlive(world, PLAYER);
    let html = `<div class="row wrap"><span class="label">${T.recruit}</span>`;
    for (const kind of UNIT_KINDS) {
      const def = UNITS[kind];
      const locked = def.barracksLevel > level;
      const full = men + def.men > ARMY.maxSoldiersPerSide;
      const off = locked || full || !canAffordUnit(town.stock, kind) ? ' off' : '';
      const need = locked ? ` (${T.needsBarracksLevel} ${def.barracksLevel})` : '';
      html += `<button class="option${off}" data-act="recruit" data-arg="${kind}" data-tip="${T.units[kind].name}: ${T.units[kind].about}${need}"><span class="glyph">${UNIT_GLYPH[kind]}</span><span class="name">${T.units[kind].name}</span><span class="costs">${locked ? need : unitCostHtml(town, kind)}</span></button>`;
    }
    html += '</div>';
    if (town.recruitQueue.length > 0) {
      const first = town.recruitQueue[0];
      const names = town.recruitQueue.map((o) => T.units[o.kind].name).join(', ');
      html += `<div class="status">${T.queue}: ${names}${first ? ` (${Math.ceil(first.leftS)} s)` : ''}</div>`;
    }
    return html;
  }

  private plotHtml(world: World, town: Town, plot: number): string {
    const b: Building | null = town.plots[plot] ?? null;
    if (!b) {
      let html = `<div class="heading">${T.emptyPlot} — ${T.build}</div><div class="row wrap">`;
      for (const kind of BUILDING_KINDS) {
        const off = canAffordBuilding(town.stock, kind, 1) ? '' : ' off';
        const recipe = recipeText(kind);
        html += `<button class="option${off}" data-act="build" data-arg="${kind}" data-tip="${T.buildings[kind].name}: ${T.buildings[kind].about}${recipe ? ` (${recipe})` : ''}"><span class="name">${T.buildings[kind].name}</span><span class="costs">${costHtml(town, kind, 1)}</span></button>`;
      }
      return `${html}</div>`;
    }
    let status: string;
    if (b.constructionLeftS > 0) status = `${T.underConstruction}: ${Math.round((1 - b.constructionLeftS / b.constructionTotalS) * 100)}%`;
    else if (b.paused) status = T.pausedBuilding;
    else if (!BUILDINGS[b.kind].recipe) status = `${T.trains} ${T.level} ${b.level}`;
    else status = isWorking(b) ? T.working : T.waiting;
    let html = `<div class="heading">${T.buildings[b.kind].name} · ${T.level} ${b.level}/${MAX_LEVEL} <span class="status">${status}</span></div>`;
    html += `<div class="status">${T.buildings[b.kind].about} ${recipeText(b.kind)}</div><div class="row">`;
    if (b.level < MAX_LEVEL) {
      const off = b.constructionLeftS > 0 || !canAffordBuilding(town.stock, b.kind, b.level + 1) ? ' off' : '';
      html += `<button class="option${off}" data-act="upgrade" data-tip="${T.upgrade}: ${T.level} ${b.level + 1}"><span class="name">${T.upgrade}</span><span class="costs">${costHtml(town, b.kind, b.level + 1)}</span></button>`;
    } else {
      html += `<span class="label">${T.maxLevel}</span>`;
    }
    if (BUILDINGS[b.kind].recipe) html += `<button class="option" data-act="pause" data-tip="${T.pause}"><span class="name">${b.paused ? T.unpause : T.pause}</span></button>`;
    html += `<button class="option" data-act="demolish" data-tip="${T.demolish}"><span class="name">${T.demolish}</span></button></div>`;
    if (b.kind === 'barracks') html += this.recruitHtml(world, town);
    return html;
  }

  private stateText(r: Regiment): string {
    if (r.state === 'routing') return T.state.routing;
    if (isEngaged(r)) return T.state.fighting;
    if (r.order === 'move') return T.state.move;
    if (r.order === 'attackRegiment') return T.state.attack;
    if (r.order === 'attackBuilding') return T.state.siege;
    return T.state.hold;
  }

  private armyHtml(world: World, selected: ReadonlySet<number>): string {
    let html = `<div class="row"><button class="option" data-act="halt" data-tip="${T.halt}"><span class="name">${T.halt}</span></button><button class="option" data-act="all" data-tip="${T.selectAll}"><span class="name">${T.selectAll}</span></button></div><div class="row wrap">`;
    for (const r of world.regiments) {
      if (!selected.has(r.id) || r.aliveMen === 0) continue;
      const morale = Math.max(0, Math.round((r.morale / r.def.morale) * 100));
      html += `<div class="unit" data-act="pick" data-arg="${r.id}" data-tip="${T.units[r.kind].name}: ${T.units[r.kind].about}"><span class="glyph">${UNIT_GLYPH[r.kind]}</span><span class="name">${T.units[r.kind].name}</span><span class="small">${r.aliveMen}/${r.initialMen} ${T.men} · ${this.stateText(r)}</span><span class="bar"><i style="width:${morale}%" class="${morale > 55 ? 'ok' : morale > 25 ? 'warn' : 'bad'}"></i></span><span class="bar thin"><i style="width:${Math.round(r.fatigue * 100)}%" class="tired"></i></span></div>`;
    }
    return `${html}</div>`;
  }

  private idleHtml(world: World, town: Town): string {
    return this.recruitHtml(world, town);
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
      const rations = town.stock.bread + town.stock.sausage * 2;
      const perMinute = rationDemandPerSecond(town, men) * 60;
      this.foodChip.textContent = `${rations} / ${perMinute.toFixed(0)} ${T.rations}`;
      this.foodChip.classList.toggle('alarm', town.starving);
      this.armyChip.textContent = `${T.army} ${men}/${ARMY.maxSoldiersPerSide}`;
      const minutes = Math.floor(world.timeS / 60);
      this.clock.textContent = `${minutes}:${String(Math.floor(world.timeS % 60)).padStart(2, '0')}`;
      this.plotInPanel = selection.plot;
      let html: string;
      if (selection.regiments.size > 0) html = this.armyHtml(world, selection.regiments);
      else if (selection.plot >= 0) html = this.plotHtml(world, town, selection.plot);
      else html = this.idleHtml(world, town);
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

  /** The hint line under the panel. */
  setHint(text: string): void {
    this.tip.textContent = text;
  }

  get element(): HTMLElement {
    return this.root;
  }
}
