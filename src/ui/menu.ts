import { BUILD } from '../version.ts';
import type { Difficulty, Side } from '../sim/types.ts';
import { PLAYER } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import type { Quality } from '../render/stage.ts';
import { T } from './strings.ts';

// The screens over the game: start, loading, pause, and the end.

export interface StartChoice {
  difficulty: Difficulty;
  quality: Quality;
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
        `<button class="primary" data-go="1">${T.play}</button>${helpHtml()}<p class="small">${T.version} ${BUILD}</p>`,
    );
    return new Promise((resolve) => {
      sheet.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const name = target.dataset['name'];
        if (name === 'difficulty') choice.difficulty = target.dataset['value'] as Difficulty;
        if (name === 'quality') choice.quality = target.dataset['value'] as Quality;
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
