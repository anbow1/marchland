// The player's settings, kept in the browser between games: how loud the game is and whether the map
// moves when the mouse touches the screen's edge. Storage may be missing (private windows): the
// defaults stand then.

export interface Settings {
  volume: number;
  edgeScroll: boolean;
  /** The graphics preset last chosen in the menu on this device (null: none chosen yet). */
  quality: 'high' | 'low' | 'minimal' | null;
}

const KEY = 'marchland.settings';
const DEFAULTS: Settings = { volume: 0.6, edgeScroll: true, quality: null };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function storeSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Nowhere to keep them: they last this game.
  }
}

const SAVE_KEY = 'marchland.save';

/** The saved game's text, or null. */
export function readSave(): string | null {
  try {
    return localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

/** Keeps a saved game; false when the browser would not take it. */
export function writeSave(text: string): boolean {
  try {
    localStorage.setItem(SAVE_KEY, text);
    return true;
  } catch {
    return false;
  }
}
