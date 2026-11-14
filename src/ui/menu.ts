import { BUILD } from '../version.ts';
import type { Difficulty, Side } from '../sim/types.ts';
import { PLAYER } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import type { Quality } from '../render/stage.ts';
import { T } from './strings.ts';
import { MAP } from '../config.ts';
import { HEAPS } from '../sim/terrain.ts';
import { TEAM_CSS } from '../render/palette.ts';

// The screens over the game: start, loading, pause, and the end.

export interface StartChoice {
  difficulty: Difficulty;
  quality: Quality;
  /** Which of MAP.startSites the keeps stand on. */
  start: number;
}

/** A small map of where the keeps may stand: the three places, the chosen one and the enemy's across it, the mountains and crags. */
function siteMap(chosen: number): string {
  const px = (v: number): number => ((v + MAP.halfM) / MAP.sizeM) * 150;
  let svg = `<svg class="siteMap" viewBox="0 0 150 150" width="150" height="150"><rect width="150" height="150" rx="6" fill="#4d6a33"/>`;
  for (const h of HEAPS) svg += `<circle cx="${px(h.x)}" cy="${px(h.z)}" r="${(h.radiusM / MAP.sizeM) * 150}" fill="#9a9a96" stroke="#5f5f5b"/>`;
  MAP.startSites.forEach(([x, z], i) => {
    const on = i === chosen;
    if (on) svg += `<circle cx="${px(-x)}" cy="${px(-z)}" r="7" fill="${TEAM_CSS[1]}" stroke="#1a120c" stroke-width="1.5"/>`;
    svg += `<circle cx="${px(x)}" cy="${px(z)}" r="${on ? 8 : 6}" fill="${on ? TEAM_CSS[0] : '#d8d0b8'}" stroke="#1a120c" stroke-width="1.5"/><text x="${px(x)}" y="${px(z) + 3.5}" text-anchor="middle" font-size="9" font-weight="700" fill="${on ? '#fff' : '#1a120c'}">${i + 1}</text>`;
  });
  return `${svg}</svg>`;
}

function helpHtml(): string {
  return `<div class="help"><b>${T.helpTitle}</b>${T.help.map((line) => `<div>${line}</div>`).join('')}</div>`;
}

function choiceRow(label: string, name: string, options: readonly (readonly [string, string])[], chosen: string): string {
  const buttons = options.map(([value, text]) => `<button class="choice${value === chosen ? ' on' : ''}" data-name="${name}" data-value="${value}">${text}</button>`).join('');
  return `<div class="choiceRow"><span>${label}</span>${buttons}</div>`;
}

export class Menu {
  constructor(private readonly root: HTMLElement) {}

  hide(): void {
    this.root.innerHTML = '';
    this.root.style.display = 'none';
  }

  private show(html: string): HTMLElement {
    this.root.style.display = 'flex';
    this.root.innerHTML = `<div class="sheet">${html}</div>`;
    return this.root.firstElementChild as HTMLElement;
  }

  /** The title screen; resolves with the player's choices when they press Play. */
  start(defaults: StartChoice): Promise<StartChoice> {
    const choice = { ...defaults };
    const sheet = this.show(
      `<h1>${T.title}</h1><p class="sub">${T.subtitle}</p>` +
        choiceRow(T.difficultyLabel, 'difficulty', [['easy', T.difficulty.easy], ['normal', T.difficulty.normal], ['hard', T.difficulty.hard]], choice.difficulty) +
        choiceRow(T.quality, 'quality', [['high', T.qualityHigh], ['low', T.qualityLow]], choice.quality) +
        choiceRow(T.startLabel, 'start', T.startSites.map((name, i) => [String(i), `${i + 1}. ${name}`] as const), String(choice.start)) +
        `<div class="siteMapBox">${siteMap(choice.start)}</div>` +
        `<button class="primary" data-go="1">${T.play}</button>${helpHtml()}<p class="small">${T.version} ${BUILD}</p>`,
    );
    return new Promise((resolve) => {
      sheet.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const name = target.dataset['name'];
        if (name === 'difficulty') choice.difficulty = target.dataset['value'] as Difficulty;
        if (name === 'quality') choice.quality = target.dataset['value'] as Quality;
        if (name === 'start') {
          choice.start = Number(target.dataset['value']);
          (sheet.querySelector('.siteMapBox') as HTMLElement).innerHTML = siteMap(choice.start);
        }
        if (name) for (const other of sheet.querySelectorAll(`[data-name="${name}"]`)) other.classList.toggle('on', other === target);
        if (target.dataset['go']) resolve(choice);
      });
    });
  }

  loading(share: number): void {
    this.show(`<h1>${T.title}</h1><p class="sub">${T.loading}…</p><div class="progress"><i style="width:${Math.round(share * 100)}%"></i></div>`);
  }

  pause(loadedSeconds: number, onResume: () => void, onRestart: () => void): void {
    const sheet = this.show(`<h2>${T.paused}</h2><button class="primary" data-do="resume">${T.resume}</button><button data-do="restart">${T.restart}</button>${helpHtml()}<p class="small">${T.version} ${BUILD} · ${loadedSeconds.toFixed(1)} s</p>`);
    sheet.addEventListener('click', (e) => {
      const what = (e.target as HTMLElement).dataset['do'];
      if (what === 'resume') onResume();
      if (what === 'restart') onRestart();
    });
  }

  end(world: World, winner: Side, onRestart: () => void): void {
    const won = winner === PLAYER;
    const minutes = Math.floor(world.timeS / 60);
    const sheet = this.show(
      `<h1 class="${won ? 'won' : 'lost'}">${won ? T.victory : T.defeat}</h1><p class="sub">${won ? T.victoryText : T.defeatText}</p>` +
        `<table><tr><td>${T.time}</td><td>${minutes}:${String(Math.floor(world.timeS % 60)).padStart(2, '0')}</td></tr>` +
        `<tr><td>${T.kills}</td><td>${world.kills[0]}</td></tr><tr><td>${T.losses}</td><td>${world.kills[1]}</td></tr></table>` +
        `<button class="primary" data-do="restart">${T.restart}</button>`,
    );
    sheet.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).dataset['do'] === 'restart') onRestart();
    });
  }
}
