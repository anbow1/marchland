// Which build this is: the commit and its date, stamped by vite.config.ts. Shown in the menus so a
// player can tell an old build (or a browser's cached copy) from the current one, and added to the
// models' URLs so a new build never draws last week's models from the browser's cache.

declare const __BUILD__: string;

export const BUILD: string = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';

/** URL of a file under public/, fresh for each build. */
export function freshUrl(base: string, path: string): string {
  return `${base}${path}?v=${encodeURIComponent(BUILD)}`;
}
