import { BUILDINGS, FIELDS, FOOD, FORMATION, GATE, KEEP_LEVELS, KEEP_UPGRADE_SECONDS, LEVEL_SPEED, MAX_LEVEL, PAY, PEOPLE, REARM, ROADS, TOWER, TRANSPORT, UNITS, WALLS, MARKET } from '../config.ts';
import { resourceIcon } from './icons.ts';
import { canRearm, canReinforce, missingMen, orderedGoodsFor, rearmCost, reinforceCost, lotPrice } from '../sim/commands.ts';
import { trainingLevel, type Building, buildingCost, canAffordBuilding, rebuildCost, canAffordUnit, emptyStock, flowRates, keepRules, lackingInput, peopleFor, rationsIn, type Town, workState } from '../sim/economy.ts';
import { freePeople } from '../sim/people.ts';
import { hasCaptain, isEngaged, type Regiment, veteranRank } from '../sim/regiment.ts';
import { type BuildingKind, BUILDING_KINDS, KEEP, PLAYER, type ResourceId, RESOURCE_IDS, type UnitKind, UNIT_KINDS, WORKLESS } from '../sim/types.ts';
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
  /** Ranks, formation, stance or shooting for the selected regiments. */
  setFormation(what: 'ranks' | 'formation' | 'stance' | 'fire' | 'pace', value: string): void;
  /** Turns the map: −1 left, +1 right. */
  rotateCamera(direction: number): void;
  upgrade(plot: number): void;
  turnSite(plot: number): void;
  upgradeKeep(): void;
  demolish(plot: number): void;
  /** Rebuilds a ruin for half its price. */
  rebuild(plot: number): void;
  trade(good: ResourceId, buying: boolean): void;
  togglePaused(plot: number): void;
  recruit(kind: UnitKind): void;
  rearm(regimentId: number, kind: UnitKind): void;
  reinforce(regimentId: number): void;
  upgradeTransport(): void;
  /** Carriers' priority for a good: 1 high, 0 normal, −1 low. */
  setPriority(good: ResourceId, priority: number): void;
  /** Which workshops are served first: 1 high, 0 normal, −1 low. */
  setKindPriority(kind: BuildingKind, priority: number): void;
  /** How much more of a good to make; null lifts the limit. */
  setOrder(good: ResourceId, amount: number | null): void;
  orderRegiments(kind: UnitKind, count: number): void;
  toggleGrid(): void;
  /** Space or the ⏸ button: the battle stops, orders can still be given. */
  togglePause(): void;
  selectPlot(plot: number): void;
  halt(): void;
  /** Stops one regiment where it stands (the stop button under its card). */
  haltRegiment(id: number): void;
  /** Whether the player's orders go at the run (the pace buttons and B). */
  runMode(): boolean;
  /** The campaign: pay the tribute (mission 1); merge the selected regiments of a kind. */
  payTribute(): void;
  merge(kind: UnitKind): void;
  selectAll(): void;
  selectRegiment(id: number, additive: boolean): void;
  /** Out of the selection: one regiment, or all of them. */
  unselectRegiment(id: number): void;
  unselectAll(): void;
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
  ['gold', 'wood', 'planks', 'stone'],
  ['grain', 'flour', 'bread', 'fish', 'meat', 'sausage', 'grapes', 'wine', 'ale'],
  ['hide', 'leatherArmor', 'ironOre', 'iron', 'weapon', 'mailArmor', 'bow', 'horse'],
];

/** The build tab's groups: a short row at a time, so the panel leaves the map in view. */
type BuildGroup = 'town' | 'food' | 'goods' | 'arms' | 'defence';
const BUILD_GROUPS: Record<BuildGroup, readonly BuildingKind[]> = {
  town: ['house', 'storehouse', 'market', 'tavern', 'chapel', 'well'],
  food: ['farm', 'fisher', 'windmill', 'bakery', 'hunter', 'pigFarm', 'butcher', 'vineyard', 'winery', 'brewery'],
  goods: ['woodcutter', 'sawmill', 'forester', 'quarry', 'ironMine', 'smelter', 'tannery'],
  arms: ['smithy', 'armourer', 'fletcher', 'stable', 'barracks', 'foundry'],
  defence: ['tower'],
};
const GROUP_OF = new Map<BuildingKind, BuildGroup>(Object.entries(BUILD_GROUPS).flatMap(([g, kinds]) => kinds.map((k) => [k, g as BuildGroup] as const)));
const COMPACT_KEY = 'marchland.compactBar';

const UNIT_GLYPH: Record<UnitKind, string> = { militia: '⛨', pikemen: '↟', archers: '➶', swordsmen: '⚔', halberdiers: '⚒', crossbowmen: '⌖', lightCavalry: '♞', heavyCavalry: '♛', cannon: '⇶', mortar: '☄' };

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
  private readonly pauseButton: HTMLButtonElement;
  private readonly pausedBanner: HTMLElement;
  private pausedShown = false;
  private readonly panel: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly toasts: HTMLElement;
  /** A standing line at the top: the tutorial's step, or the defence's clock. */
  private readonly banner: HTMLElement;
  private bannerHtml = '';
  /** The banner the player closed: not shown again until it changes. */
  private bannerClosed = '';
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
  /** Shows the active pause: the banner and the button lit. */
  setPaused(paused: boolean): void {
    if (this.pausedShown === paused) return;
    this.pausedShown = paused;
    this.pausedBanner.style.display = paused ? 'block' : 'none';
    this.pauseButton.classList.toggle('on', paused);
  }

  debugVisible = false;
  /** Buildings snap to the grid (the game sets it; the build tab shows the switch). */
  gridOn = false;

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
    // Icons only, or icons with their names (touch screens start with icons only: more map in view).
    let compact = matchMedia('(pointer: coarse)').matches;
    try {
      const kept = localStorage.getItem(COMPACT_KEY);
      if (kept !== null) compact = kept === '1';
    } catch {
      // No storage: the default.
    }
    root.classList.toggle('compact', compact);
    const right = el('div', 'chips right', top);
    const names = el('button', 'speed', right) as HTMLButtonElement;
    names.textContent = 'Aa';
    names.title = T.compactBar;
    names.addEventListener('click', () => {
      const now = !root.classList.contains('compact');
      root.classList.toggle('compact', now);
      try {
        localStorage.setItem(COMPACT_KEY, now ? '1' : '0');
      } catch {
        // Not kept: this game only.
      }
    });
    this.peopleChip = el('span', 'chip', right);
    this.foodChip = el('span', 'chip', right);
    this.armyChip = el('span', 'chip', right);
    this.clock = el('span', 'chip', right);
    this.pauseButton = el('button', 'speed', right) as HTMLButtonElement;
    this.pauseButton.textContent = '⏸';
    this.pauseButton.title = T.pauseTip;
    this.pauseButton.addEventListener('click', () => actions.togglePause());
    this.pausedBanner = el('div', 'banner paused', root);
    this.pausedBanner.innerHTML = T.pausedBanner;
    this.pausedBanner.style.display = 'none';
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
    this.banner = el('div', 'banner', root);
    this.banner.style.display = 'none';
    // A banner with a button (the campaign's tribute) takes clicks.
    this.banner.addEventListener('pointerdown', (e) => {
      const act = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (act?.dataset['act'] === 'tribute') {
        e.stopPropagation();
        this.actions.payTribute();
      } else if (act?.dataset['act'] === 'closeBanner') {
        // Closed until it says something else.
        e.stopPropagation();
        this.bannerClosed = this.bannerHtml;
        this.banner.style.display = 'none';
      }
    });
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
      if ((e.target as HTMLElement).closest('.stop')) {
        actions.haltRegiment(Number(card.dataset['id']));
        return;
      }
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
  private tab: 'build' | 'army' | 'prod' | 'list' = 'build';
  /** For the list of buildings: which of each kind the camera went to last. */
  private readonly listCursor = new Map<BuildingKind, number>();

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
      case 'ranks':
      case 'formation':
      case 'stance':
      case 'fire':
      case 'pace':
        this.actions.setFormation(name, arg);
        break;
      case 'show': {
        const [x, z] = arg.split(',').map(Number);
        this.actions.jump(x as number, z as number);
        break;
      }
      case 'group':
        if (arg in BUILD_GROUPS) this.buildGroup = arg as BuildGroup;
        break;
      case 'tab':
        this.tab = arg === 'army' ? 'army' : arg === 'prod' ? 'prod' : arg === 'list' ? 'list' : 'build';
        break;
      case 'upgrade':
        this.actions.upgrade(this.plotInPanel);
        break;
      case 'turnSite':
        this.actions.turnSite(this.plotInPanel);
        break;
      case 'upgradeKeep':
        this.actions.upgradeKeep();
        break;
      case 'demolish':
        this.actions.demolish(this.plotInPanel);
        break;
      case 'rebuild':
        this.actions.rebuild(this.plotInPanel);
        break;
      case 'trade': {
        const [good, way] = arg.split(':');
        this.actions.trade(good as ResourceId, way === 'buy');
        break;
      }
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
      case 'reinforce':
        this.actions.reinforce(Number(arg));
        break;
      case 'grid':
        this.actions.toggleGrid();
        break;
      case 'transport':
        this.actions.upgradeTransport();
        break;
      case 'priority': {
        const [good, p] = arg.split(':');
        this.actions.setPriority(good as ResourceId, Number(p));
        break;
      }
      case 'kindPrio': {
        const [kind, p] = arg.split(':');
        this.actions.setKindPriority(kind as BuildingKind, Number(p));
        break;
      }
      case 'order': {
        const [good, amount] = arg.split(':');
        this.actions.setOrder(good as ResourceId, amount === 'inf' ? null : Number(amount));
        break;
      }
      case 'orderUnit': {
        const [kind, count] = arg.split(':');
        this.actions.orderRegiments(kind as UnitKind, Number(count));
        break;
      }
      case 'listGo': {
        // The next building of that kind: the camera goes there and its panel opens.
        const [kind, plot] = arg.split(':');
        this.listCursor.set(kind as BuildingKind, Number(plot));
        this.actions.selectPlot(Number(plot));
        break;
      }
      case 'halt':
        this.actions.halt();
        break;
      case 'merge':
        this.actions.merge(arg as UnitKind);
        break;
      case 'all':
        this.actions.selectAll();
        break;
      case 'pick':
        this.actions.selectRegiment(Number(arg), false);
        break;
      case 'unpick':
        this.actions.unselectRegiment(Number(arg));
        break;
      case 'none':
        this.actions.unselectAll();
        break;
      default:
        throw new Error(`unknown HUD action '${name}'`);
    }
    // Show the result at once rather than at the next refresh.
    this.panelAge = PANEL_REFRESH_S;
  }

  /** Shows a standing line at the top (null hides it); `interactive` when it carries a button. */
  setBanner(html: string | null, interactive = false): void {
    this.banner.classList.toggle('act', interactive);
    if ((html ?? '') === this.bannerHtml) return;
    this.bannerHtml = html ?? '';
    this.banner.style.display = html && html !== this.bannerClosed ? 'block' : 'none';
    this.banner.innerHTML = html ? `<button class="x" data-act="closeBanner" title="${T.closeNote}">×</button>${html}` : '';
  }

  /** A message for a few seconds; with a place, a "show" link that turns the camera there. */
  toast(text: string, tone: 'good' | 'bad' | 'plain' = 'plain', at: readonly [number, number] | null = null): void {
    const node = el('div', `toast ${tone}`, this.toasts);
    node.textContent = text;
    node.title = T.closeNote;
    // A touch on the note puts it away (its "show" link still jumps there).
    node.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.stopPropagation();
      node.remove();
    });
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

  /** The market's lots: every good with what selling ten fetches and what buying ten costs. */
  private marketHtml(town: Town): string {
    let html = `<div class="status">${T.marketNote}</div><div class="row wrap">`;
    for (const id of RESOURCE_IDS) {
      if (id === 'gold') continue;
      const sell = lotPrice(id, false);
      const buy = lotPrice(id, true);
      const canSell = town.stock[id] >= MARKET.lot;
      const canBuy = town.stock.gold >= buy;
      html += `<span class="orderUnit" title="${T.resources[id]}"><span class="cost"><i class="ico">${resourceIcon(id)}</i>${town.stock[id]}</span>`;
      html += `<button class="choice${canSell ? '' : ' off'}" data-act="trade" data-arg="${id}:sell" data-tip="${T.sell} ${MARKET.lot} ${T.resources[id].toLowerCase()}: +${sell} ${T.resources.gold.toLowerCase()}">−${MARKET.lot} +${sell}</button>`;
      html += `<button class="choice${canBuy ? '' : ' off'}" data-act="trade" data-arg="${id}:buy" data-tip="${T.buy} ${MARKET.lot} ${T.resources[id].toLowerCase()}: −${buy} ${T.resources.gold.toLowerCase()}">+${MARKET.lot} −${buy}</button></span>`;
    }
    return `${html}</div>`;
  }

  /** `at`: only what this building raises (a barracks' or a foundry's panel); everything on the army tab. */
  private recruitHtml(world: World, town: Town, at: 'barracks' | 'foundry' | null = null): string {
    // With no barracks the keep still arms militia.
    const men = menAlive(world, PLAYER);
    const free = freePeople(world, PLAYER);
    let html = `<div class="row wrap"><span class="label">${T.recruit}</span>`;
    for (const kind of UNIT_KINDS) {
      const def = UNITS[kind];
      if (at !== null && def.trainedAt !== at) continue;
      const level = trainingLevel(town, kind);
      const locked = def.barracksLevel > level;
      const full = men + def.men > town.armyCap;
      const hands = free >= peopleFor(kind) + PEOPLE.minFreeAfterCallUp;
      const off = locked || full || !hands || !canAffordUnit(town.stock, kind) ? ' off' : '';
      const need = locked ? ` (${def.trainedAt === 'foundry' ? T.needsFoundryLevel : T.needsBarracksLevel} ${def.barracksLevel})` : def.barracksLevel === 0 ? ` (${T.atKeep})` : '';
      html += `<button class="option${off}" data-act="recruit" data-arg="${kind}" data-tip="${T.units[kind].name}: ${T.units[kind].about} ${T.counters[kind]}${need}"><span class="glyph">${UNIT_GLYPH[kind]}</span><span class="name">${T.units[kind].name}</span><span class="costs">${locked ? need : unitCostHtml(town, kind)}</span></button>`;
    }
    html += '</div>';
    // Ordering arms: the workshops make what so many regiments need and then stop.
    html += `<div class="row wrap"><span class="label" data-tip="${T.orderTip}">${T.orderArms}</span>`;
    for (const kind of UNIT_KINDS) {
      const goods = orderedGoodsFor(kind);
      if (!RESOURCE_IDS.some((id) => (goods[id] ?? 0) > 0) || UNITS[kind].engine) continue;
      const list = RESOURCE_IDS.filter((id) => (goods[id] ?? 0) > 0)
        .map((id) => `${T.resources[id].toLowerCase()} ${goods[id]}`)
        .join(', ');
      html += `<span class="orderUnit"><span class="glyph">${UNIT_GLYPH[kind]}</span>${[1, 2, 5].map((n) => `<button class="choice" data-act="orderUnit" data-arg="${kind}:${n}" data-tip="${T.orderTip} ${T.units[kind].name} ×${n}: ${list}${n > 1 ? ` (×${n})` : ''}">×${n}</button>`).join('')}</span>`;
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
  private buildGroup: BuildGroup = 'town';
  /** The tool the group was last opened for. */
  private groupTool = '';

  private buildHtml(town: Town, tool: string): string {
    // A building picked (by a hot key, say, from another group) opens its group, once: after that the
    // player may look through the other groups with it still in hand. (Doing this on every redraw held
    // the panel on that group, and the group buttons did nothing.)
    if (tool !== this.groupTool) {
      this.groupTool = tool;
      const inHand = GROUP_OF.get(tool as BuildingKind);
      if (inHand) this.buildGroup = inHand;
      else if (tool === 'road' || tool === 'wall' || tool === 'gate') this.buildGroup = 'defence';
    }
    const group = this.buildGroup;
    let html = '<div class="row groups">';
    for (const g of Object.keys(BUILD_GROUPS) as BuildGroup[]) html += `<button class="group${g === group ? ' on' : ''}" data-act="group" data-arg="${g}">${T.buildGroups[g]}</button>`;
    html += '</div><div class="row wrap">';
    for (const kind of BUILD_GROUPS[group]) {
      const off = canAffordBuilding(town.stock, kind, 1) ? '' : ' off';
      const on = tool === kind ? ' on' : '';
      const recipe = recipeText(kind);
      html += `<button class="option${off}${on}" data-act="build" data-arg="${kind}" data-tip="${T.buildings[kind].name}: ${T.buildings[kind].about}${recipe ? ` (${recipe})` : ''}"><span class="name">${T.buildings[kind].name}</span><span class="costs">${costHtml(town, kind, 1)}</span></button>`;
    }
    if (group !== 'defence') {
      html += `<button class="option${this.gridOn ? ' on' : ''}" data-act="grid" data-tip="${T.gridTip}"><span class="name">${T.grid} (T)</span><span class="costs"><span class="small">${this.gridOn ? T.gridOn : T.gridOff}</span></span></button>`;
      return `${html}</div>`;
    }
    const perTen = (ROADS.stonePerCell * 10) / ROADS.cellM;
    html += `<button class="option${tool === 'road' ? ' on' : ''}" data-act="road" data-tip="${T.road}: ${T.roadAbout}"><span class="name">${T.road}</span><span class="costs"><span class="cost"><i class=\"ico\">${resourceIcon('stone')}</i>${perTen.toFixed(1)} / 10 m</span></span></button>`;
    const wallTen = (WALLS.stonePerCell * 10) / ROADS.cellM;
    html += `<button class="option${tool === 'wall' ? ' on' : ''}" data-act="wall" data-tip="${T.wall}: ${T.wallAbout}"><span class="name">${T.wall}</span><span class="costs"><span class="cost"><i class=\"ico\">${resourceIcon('stone')}</i>${wallTen.toFixed(0)} / 10 m</span></span></button>`;
    const gateOff = town.stock.wood >= GATE.cost.wood && town.stock.stone >= GATE.cost.stone ? '' : ' off';
    html += `<button class="option${gateOff}${tool === 'gate' ? ' on' : ''}" data-act="gate" data-tip="${T.gate}: ${T.gateAbout}"><span class="name">${T.gate}</span><span class="costs"><span class="cost"><i class=\"ico\">${resourceIcon('wood')}</i>${GATE.cost.wood}</span><span class="cost"><i class=\"ico\">${resourceIcon('stone')}</i>${GATE.cost.stone}</span></span></button>`;
    html += `<button class="option${this.gridOn ? ' on' : ''}" data-act="grid" data-tip="${T.gridTip}"><span class="name">${T.grid} (T)</span><span class="costs"><span class="small">${this.gridOn ? T.gridOn : T.gridOff}</span></span></button>`;
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
    const yards = emptyStock();
    for (const b of town.plots) if (b) for (const id of RESOURCE_IDS) yards[id] += b.out[id];
    let rows = '';
    for (const id of RESOURCE_IDS) {
      const order = town.orders[id];
      if (town.stock[id] < 0.5 && yards[id] < 0.5 && Math.abs(made[id]) < 0.05 && Math.abs(net[id]) < 0.05 && order === undefined) continue;
      const tone = net[id] < -0.05 ? ' short' : '';
      const p = town.priority[id] ?? 0;
      const nextP = p === 0 ? 1 : p === 1 ? -1 : 0;
      const prio = id === 'gold' ? '<span></span>' : `<button class="choice prio${p > 0 ? ' on' : p < 0 ? ' low' : ''}" data-act="priority" data-arg="${id}:${nextP}" data-tip="${T.priorityTip}">${p > 0 ? '▲' : p < 0 ? '▼' : '·'}</button>`;
      const step = id === 'horse' ? 4 : 12;
      const orderCell =
        id === 'gold'
          ? '<span></span>'
          : `<span class="order"><button class="choice" data-act="order" data-arg="${id}:${order === undefined ? 0 : Math.max(0, order - step)}" data-tip="${T.orderLess}">−</button><button class="choice${order === undefined ? '' : ' on'}" data-act="order" data-arg="${id}:inf" data-tip="${T.orderInf}">${order === undefined ? '∞' : order}</button><button class="choice" data-act="order" data-arg="${id}:${(order ?? 0) + step}" data-tip="${T.orderMore}">+</button></span>`;
      rows += `<div class="prodRow"><i class="ico">${resourceIcon(id)}</i><span class="name">${T.resources[id]}</span><b>${Math.floor(town.stock[id])}</b><span>${yards[id] > 0 ? Math.floor(yards[id]) : '·'}</span><span>${fmt(made[id])}</span><span class="net${tone}">${fmt(net[id])}</span>${prio}${orderCell}</div>`;
    }
    const head = `<div class="prodRow head"><i></i><span class="name"></span><b>${T.prodStock}</b><span>${T.prodYards}</span><span>${T.prodMade}</span><span>${T.prodNet}</span><span>${T.priority}</span><span>${T.orderHead}</span></div>`;
    // Hold-ups: workshops not working, gathered by kind and reason.
    const groups = new Map<string, { text: string; count: number; x: number; z: number }>();
    for (const b of town.plots) {
      if (!b || WORKLESS.has(b.kind)) continue;
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
    return `${this.transportHtml(town)}<div class="prod"><div class="prodTable">${head}${rows}</div><div class="holdUps"><div class="label">${T.holdUps}</div>${holdUps || `<div class="holdUp ok">${T.allWorking}</div>`}</div></div>`;
  }

  /** Transport: its level, what a carrier takes, and the way to the next level. */
  private transportHtml(town: Town): string {
    const now = TRANSPORT[town.transportLevel - 1] ?? TRANSPORT[0];
    let html = `<div class="row"><span class="label" data-tip="${T.transportTip}">${T.transport}</span><span class="status">${T.transportLevels[town.transportLevel - 1]} · ${T.carries} ${now.capacity}${now.pace > 1 ? ` · ×${now.pace} ${T.faster}` : ''}</span>`;
    const next = TRANSPORT[town.transportLevel];
    if (town.transportUpgradeLeftS > 0 && next) {
      html += `<span class="status">${T.transportRaising}: ${Math.round((1 - town.transportUpgradeLeftS / next.seconds) * 100)}%</span>`;
    } else if (next) {
      const cost = next.cost as Partial<Record<ResourceId, number>>;
      let costs = '';
      let short = town.keepLevel < next.keepLevel;
      for (const id of RESOURCE_IDS) {
        const amount = cost[id] ?? 0;
        if (amount === 0) continue;
        if (town.stock[id] < amount) short = true;
        costs += `<span class="cost${town.stock[id] < amount ? ' short' : ''}"><i class="ico">${resourceIcon(id)}</i>${amount}</span>`;
      }
      const needKeep = town.keepLevel < next.keepLevel ? ` — ${T.needsKeepLevel} ${next.keepLevel}` : '';
      html += `<button class="option${short ? ' off' : ''}" data-act="transport" data-tip="${T.transportLevels[town.transportLevel]}: ${T.carries} ${next.capacity}${next.pace > 1 ? `, ×${next.pace} ${T.faster}` : ''}${needKeep}"><span class="name">${T.transportLevels[town.transportLevel]}</span><span class="costs">${costs}</span></button>`;
    }
    return `${html}</div>`;
  }

  /** The ▲ · ▼ switch for which workshops are served first; an empty cell for those that take no inputs. */
  private kindPrioHtml(town: Town, kind: BuildingKind, takesInputs: boolean): string {
    if (!takesInputs) return '<span></span>';
    const p = town.kindPriority[kind] ?? 0;
    const next = p === 0 ? 1 : p === 1 ? -1 : 0;
    return `<span><button class="choice prio${p > 0 ? ' on' : p < 0 ? ' low' : ''}" data-act="kindPrio" data-arg="${kind}:${next}" data-tip="${T.kindPriorityTip}">${p > 0 ? '▲' : p < 0 ? '▼' : '·'}</button></span>`;
  }

  /** Every building the town has, by kind: how many, of which levels, how many stand idle, and what lies in their yards. */
  private listHtml(town: Town): string {
    let rows = '';
    for (const kind of BUILDING_KINDS) {
      const plots: number[] = [];
      town.plots.forEach((b, plot) => {
        if (b && b.kind === kind) plots.push(plot);
      });
      if (plots.length === 0) continue;
      const levels = [0, 0, 0];
      const yard = emptyStock();
      // What its workshops eat a minute at full work, at their levels.
      const uses = emptyStock();
      const recipe = BUILDINGS[kind].recipe;
      let idle = 0;
      let building = 0;
      for (const plot of plots) {
        const b = town.plots[plot] as Building;
        levels[b.level - 1] = (levels[b.level - 1] as number) + 1;
        for (const id of RESOURCE_IDS) yard[id] += b.out[id];
        if (recipe && b.constructionLeftS <= 0) for (const id of RESOURCE_IDS) uses[id] += ((recipe.inputs[id] ?? 0) * 60 * (LEVEL_SPEED[b.level - 1] as number)) / recipe.cycleSeconds;
        const state = workState(b);
        if (state === 'building') building++;
        else if (state !== 'working' && state !== 'waiting') idle++;
      }
      const lv = levels.map((n, i) => (n > 0 ? `${n}×${i + 1}` : '')).filter(Boolean).join(' ');
      const goods = RESOURCE_IDS.filter((id) => yard[id] >= 1)
        .map((id) => `<span class="cost"><i class="ico">${resourceIcon(id)}</i>${Math.floor(yard[id])}</span>`)
        .join('');
      const eats = RESOURCE_IDS.filter((id) => uses[id] > 0)
        .map((id) => `<span class="cost"><i class="ico">${resourceIcon(id)}</i>${uses[id] < 10 ? uses[id].toFixed(1) : Math.round(uses[id])}</span>`)
        .join('');
      const last = this.listCursor.get(kind) ?? -1;
      const next = plots.find((p) => p > last) ?? (plots[0] as number);
      const notes = `<span>${building > 0 ? `<span class="small">${building} ${T.underConstructionShort} </span>` : ''}${idle > 0 ? `<span class="small alarm">${idle} ${T.idleShort}</span>` : ''}</span>`;
      rows += `<div class="listRow" data-act="listGo" data-arg="${kind}:${next}" data-tip="${T.listTip}"><span class="name">${T.buildings[kind].name}</span><b>${plots.length}</b><span class="small">${T.level} ${lv}</span><span class="costs">${goods || '<span class="small">—</span>'}</span><span class="costs">${eats || '<span class="small">—</span>'}</span>${this.kindPrioHtml(town, kind, recipe !== null && RESOURCE_IDS.some((id) => (recipe.inputs[id] ?? 0) > 0))}${notes}</div>`;
    }
    return `<div class="listTable"><div class="listRow head"><span class="name"></span><b>${T.count}</b><span class="small">${T.levels}</span><span class="small">${T.inYards}</span><span class="small">${T.usesPerMin}</span><span class="small">${T.priority}</span><span></span></div>${rows || `<div class="status">${T.noBuildings}</div>`}</div>`;
  }

  /** The keep: its level, what the level gives, and the way to the next. */
  private keepHtml(world: World, town: Town): string {
    const rules = keepRules(town);
    const pay = Math.round(menAlive(world, town.side) * PAY.goldPerManPerMinute);
    let status = `${T.keepHp} ${Math.ceil(town.keepHp)}/${rules.hp} · ${T.keepReach} ${rules.territoryM} m · ${T.barracksUpTo} ${rules.barracks} · ${T.payTip} ${pay}/min${town.unpaid ? ` (${Math.ceil(town.payOwed)})` : ''}`;
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
    if (b.ruin) {
      // Burnt out: what it was, and the rebuilding at half its price.
      let cost = '';
      let short = false;
      for (const id of RESOURCE_IDS) {
        const amount = rebuildCost(b.kind, id);
        if (amount === 0) continue;
        if (town.stock[id] < amount) short = true;
        cost += `<span class="cost${town.stock[id] < amount ? ' short' : ''}"><i class="ico">${resourceIcon(id)}</i>${amount}</span>`;
      }
      return `<div class="heading">${T.buildings[b.kind].name} · <span class="status alarm">${T.ruin}</span></div><div class="status">${T.ruinAbout}</div><div class="row"><button class="option${short ? ' off' : ''}" data-act="rebuild" data-tip="${T.rebuildTip}"><span class="name">${T.rebuild}</span><span class="costs">${cost}</span></button><button class="option" data-act="demolish" data-tip="${T.demolish}"><span class="name">${T.demolish}</span></button></div>`;
    }
    const state = workState(b);
    let status: string = T.work[state];
    if (state === 'building') {
      const done = Math.round((1 - b.constructionLeftS / b.constructionTotalS) * 100);
      const carried = b.matTotal > 0 ? ` · ${T.resources.wood.toLowerCase()}/${T.resources.stone.toLowerCase()} ${b.matDelivered}/${b.matTotal}` : '';
      status = `${T.underConstruction}: ${done}%${carried}`;
    } else if (b.kind === 'barracks') status = `${T.trains} ${T.level} ${b.level}`;
    else if (b.kind === 'house') status = `${b.residents}/${PEOPLE.houseResidents[b.level - 1]} ${T.residents}${b.starving ? ` · ${T.starving}` : ''}`;
    let html = `<div class="heading">${T.buildings[b.kind].name} · ${T.level} ${b.level}/${MAX_LEVEL} <span class="status${state === 'noWorker' || state === 'yardFull' || state === 'noTrees' || b.starving ? ' alarm' : ''}">${status}</span></div>`;
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
    // Still going up: it may yet be turned.
    if (state === 'building' && b.level === 1) html += `<button class="option" data-act="turnSite" data-tip="${T.turnSite}"><span class="name">${T.turnSite}</span></button>`;
    if (!WORKLESS.has(b.kind)) html += `<button class="option" data-act="pause" data-tip="${T.pause}"><span class="name">${b.paused ? T.unpause : T.pause}</span></button>`;
    html += `<button class="option" data-act="demolish" data-tip="${T.demolish}"><span class="name">${T.demolish}</span></button></div>`;
    if (b.kind === 'barracks') html += this.recruitHtml(world, town, 'barracks');
    if (b.kind === 'foundry') html += this.recruitHtml(world, town, 'foundry');
    if (b.kind === 'market' && state !== 'building') html += this.marketHtml(town);
    return html;
  }

  private stateText(world: World, r: Regiment): string {
    if (r.state === 'routing') return T.state.routing;
    if (world.towns[r.side].recruitQueue.some((o) => o.reinforceId === r.id)) return T.reinforcingState;
    if (r.rearmTo !== null) return `${T.rearmingState} → ${T.units[r.rearmTo].name} (${Math.ceil(r.rearmLeftS)} s)`;
    if (isEngaged(r)) return T.state.fighting;
    if (r.order === 'move') return r.run ? T.runningState : T.state.move;
    if (r.order === 'attackRegiment') return T.state.attack;
    if (r.order === 'attackBuilding' || r.order === 'bombard') return T.state.siege;
    return T.state.hold;
  }

  /** The reinforce button for one selected regiment that has lost men: what filling it costs. */
  private reinforceHtml(world: World, r: Regiment): string {
    if (r.side !== PLAYER || r.def.engine || missingMen(r) === 0 || r.rearmTo !== null) return '';
    const town = world.towns[PLAYER];
    const able = canReinforce(world, r.id);
    if (able === 'reinforcing') return '';
    const cost = reinforceCost(r);
    let costs = '';
    for (const id of RESOURCE_IDS) {
      const amount = cost[id] ?? 0;
      if (amount === 0) continue;
      costs += `<span class="cost${town.stock[id] < amount ? ' short' : ''}"><i class="ico">${resourceIcon(id)}</i>${amount}</span>`;
    }
    const why = able === 'ok' ? '' : ` — ${T.results[able]}`;
    return `<div class="row"><button class="option${able === 'ok' ? '' : ' off'}" data-act="reinforce" data-arg="${r.id}" data-tip="${T.reinforceTip}${why}"><span class="name">${T.reinforce} +${missingMen(r)}</span><span class="costs">${costs || '—'}</span></button></div>`;
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
    let html = `<div class="row"><button class="option" data-act="halt" data-tip="${T.halt}"><span class="name">${T.halt}</span></button><button class="option" data-act="all" data-tip="${T.selectAll}"><span class="name">${T.selectAll}</span></button><button class="option" data-act="none" data-tip="${T.unselectAllTip}"><span class="name">${T.unselectAll}</span></button></div><div class="row wrap">`;
    for (const r of world.regiments) {
      if (!selected.has(r.id) || r.aliveMen === 0) continue;
      const morale = Math.min(100, Math.max(0, Math.round((r.morale / r.def.morale) * 100)));
      const rank = veteranRank(r);
      const record = `${rank > 0 ? ` · ${T.ranks3[rank]}` : ''}${hasCaptain(r) ? '' : ` · ${T.noCaptain}`}`;
      html += `<div class="unit" data-act="pick" data-arg="${r.id}" data-tip="${T.units[r.kind].name}: ${T.units[r.kind].about} ${T.ranks3[rank]}: ${T.rankTip}"><button class="x" data-act="unpick" data-arg="${r.id}" data-tip="${T.unselectOne}">×</button><span class="glyph">${UNIT_GLYPH[r.kind]}${'★'.repeat(rank)}</span><span class="name">${T.units[r.kind].name}</span><span class="small">${r.aliveMen}/${Math.max(r.initialMen, r.maxMen)} ${T.men} · ${this.stateText(world, r)}${record}</span><span class="bar"><i style="width:${morale}%" class="${morale > 55 ? 'ok' : morale > 25 ? 'warn' : 'bad'}"></i></span><span class="bar thin"><i style="width:${Math.round(r.fatigue * 100)}%" class="tired"></i></span></div>`;
    }
    html += '</div>';
    // Two or more of a kind chosen (the campaign's regiments grow to twenty): merge them.
    const kinds = new Map<UnitKind, number>();
    for (const r of world.regiments) if (selected.has(r.id) && r.side === PLAYER && r.aliveMen > 0 && !r.def.engine && r.maxMen > r.def.men) kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
    const pairs = [...kinds].filter(([, n]) => n > 1);
    if (pairs.length > 0) html += `<div class="row wrap"><span class="label">${T.mergeLabel}</span>${pairs.map(([kind]) => `<button class="option" data-act="merge" data-arg="${kind}" data-tip="${T.mergeTip}"><span class="glyph">${UNIT_GLYPH[kind]}</span><span class="name">${T.units[kind].name}</span></button>`).join('')}</div>`;
    html += this.formationHtml(world, selected);
    // One regiment chosen: what it may be re-armed as.
    if (selected.size === 1) {
      const only = world.regiments.find((r) => selected.has(r.id) && r.aliveMen > 0);
      if (only) html += this.reinforceHtml(world, only) + this.rearmHtml(world, only);
    }
    return html;
  }

  /** The selected regiments' ranks, formation, stance and shooting: each row only if one of them can. */
  private formationHtml(world: World, selected: ReadonlySet<number>): string {
    const button = (act: string, value: string, label: string, on: boolean, tip: string): string =>
      `<button class="choice${on ? ' on' : ''}" data-act="${act}" data-arg="${value}" data-tip="${tip}">${label}</button>`;
    // Guns and mortars: when to fire, and how to send them (no ranks or stances for a gun crew).
    const engines = world.regiments.filter((r) => selected.has(r.id) && r.aliveMen > 0 && r.def.engine);
    let gunsHtml = '';
    if (engines.length > 0) {
      const gun = engines[0] as (typeof engines)[number];
      gunsHtml = `<div class="row"><span class="label">${T.fireLabel}</span>${button('fire', '1', T.fireAtWill, gun.fireAtWill, T.formationTips.fire)}${button('fire', '0', T.fireOnOrder, !gun.fireAtWill, T.formationTips.fire)}</div><div class="row"><span class="small">${T.gunOrders}</span></div>`;
    }
    const regs = world.regiments.filter((r) => selected.has(r.id) && r.aliveMen > 0 && !r.def.engine);
    if (regs.length === 0) return gunsHtml ? `<div class="formations">${gunsHtml}</div>` : '';
    const first = regs[0] as (typeof regs)[number];
    let html = '<div class="formations">';
    const run = this.actions.runMode();
    html += `<div class="row"><span class="label">${T.paceLabel}</span>${button('pace', '0', T.paceWalk, !run, T.paceTip)}${button('pace', '1', T.paceRun, run, T.paceTip)}</div>`;
    const foot = regs.filter((r) => !r.def.cavalry);
    if (foot.length > 0) {
      const ranks = Math.ceil((foot[0] as (typeof foot)[number]).initialMen / (foot[0] as (typeof foot)[number]).files);
      html += `<div class="row"><span class="label">${T.ranksLabel}</span>${FORMATION.rankChoices.map((n) => button('ranks', String(n), String(n), first.formation !== 'wedge' && ranks === n, `${T.ranksLabel}: ${n}`)).join('')}</div>`;
    }
    const shapes: string[] = [button('formation', 'line', T.formations.line, first.formation === 'line', T.formations.line)];
    if (regs.some((r) => r.def.cavalry)) shapes.push(button('formation', 'wedge', T.formations.wedge, first.formation === 'wedge', T.formationTips.wedge));
    if (foot.length > 0) shapes.push(button('formation', 'loose', T.formations.loose, first.formation === 'loose', T.formationTips.loose));
    html += `<div class="row"><span class="label">${T.formationLabel}</span>${shapes.join('')}</div>`;
    const stances: string[] = [];
    if (regs.some((r) => r.def.missileBlock > 0 && !r.def.cavalry)) stances.push(button('stance', 'shields', T.stances.shields, first.stance === 'shields', T.formationTips.shields));
    if (regs.some((r) => r.def.bonusVsCavalry > 0 && !r.def.cavalry)) stances.push(button('stance', 'pikeWall', T.stances.pikeWall, first.stance === 'pikeWall', T.formationTips.pikeWall));
    if (stances.length > 0) html += `<div class="row"><span class="label">${T.stanceLabel}</span>${button('stance', 'normal', T.stances.normal, first.stance === 'normal', T.stances.normal)}${stances.join('')}</div>`;
    if (regs.some((r) => r.def.missileRangeM > 0)) {
      const shooter = regs.find((r) => r.def.missileRangeM > 0) as (typeof regs)[number];
      html += `<div class="row"><span class="label">${T.fireLabel}</span>${button('fire', '1', T.fireAtWill, shooter.fireAtWill, T.formationTips.fire)}${button('fire', '0', T.fireOnOrder, !shooter.fireAtWill, T.formationTips.fire)}</div>`;
    } else if (engines.length > 0) html += gunsHtml;
    return `${html}</div>`;
  }

  /** Nothing selected: the building list, or (on its tab, once there is a barracks) the recruiting list. */
  private idleHtml(world: World, town: Town, tool: string): string {
    const tabs = `<div class="row tabs"><button class="tab${this.tab === 'build' ? ' on' : ''}" data-act="tab" data-arg="build">${T.build}</button><button class="tab${this.tab === 'army' ? ' on' : ''}" data-act="tab" data-arg="army">${T.recruit}</button><button class="tab${this.tab === 'prod' ? ' on' : ''}" data-act="tab" data-arg="prod">${T.production}</button><button class="tab${this.tab === 'list' ? ' on' : ''}" data-act="tab" data-arg="list">${T.buildingsTab}</button></div>`;
    return tabs + (this.tab === 'build' ? this.buildHtml(town, tool) : this.tab === 'army' ? this.recruitHtml(world, town) : this.tab === 'prod' ? this.productionHtml(town) : this.listHtml(town));
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
      const rank = veteranRank(r);
      // A chosen regiment of the player's on the move (or at an enemy) carries a stop button under its card.
      const stoppable = r.side === PLAYER && selected.has(r.id) && r.order !== 'hold';
      const key = `${r.id}|${r.kind}|${r.side}|${strength}|${morale}|${rank}|${selected.has(r.id) ? 1 : 0}|${stoppable ? 1 : 0}`;
      if (this.cardKeys[used] !== key) {
        this.cardKeys[used] = key;
        card.dataset['id'] = String(r.id);
        card.dataset['own'] = r.side === PLAYER ? '1' : '0';
        card.className = `card ${morale}${selected.has(r.id) ? ' selected' : ''}`;
        card.style.borderColor = TEAM_CSS[r.side];
        card.innerHTML = `<span class="glyph" style="background:${TEAM_CSS[r.side]}">${UNIT_GLYPH[r.kind]}</span>${rank > 0 ? `<span class="stars">${'★'.repeat(rank)}</span>` : ''}<span class="bar"><i style="width:${strength}%"></i></span>${stoppable ? `<button class="stop" title="${T.halt}">■</button>` : ''}`;
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
      // A good not on the bar (none should be: RESOURCE_GROUPS lists them all) is skipped, not fatal.
      const chip = this.chips.get(id);
      if (chip) chip.textContent = String(value);
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
      this.armyChip.textContent = `${T.army} ${men}/${town.armyCap}`;
      const minutes = Math.floor(world.timeS / 60);
      this.clock.textContent = `${minutes}:${String(Math.floor(world.timeS % 60)).padStart(2, '0')}`;
      this.plotInPanel = selection.plot;
      let html: string;
      if (selection.regiments.size > 0) html = this.armyHtml(world, selection.regiments);
      else if (selection.plot >= 0) html = this.plotHtml(world, town, selection.plot);
      else if (selection.plot === KEEP) html = this.keepHtml(world, town);
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
