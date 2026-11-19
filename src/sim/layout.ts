import { MAP } from '../config.ts';

// Which of the prepared places the keeps stand on (MAP.startSites): the player picks one of three before
// the game; the computer's keep is always the player's turned half a circle about the middle, so the
// land stays fair. The whole map (the flat ground round the keeps, the lakes and outcrops laid out from
// them, the forest's clearings, the field between them) is worked out from it once, when the game loads,
// so a new choice reloads the page with `?start=` set. Outside a browser (tests, tools) it is read from
// MARCHLAND_START, and defaults to the first.

/** A setting from the page's address, or (outside a browser) from the environment. */
function setting(param: string, env: string): string | null {
  const g = globalThis as { location?: { search?: string }; process?: { env?: Record<string, string | undefined> } };
  const fromPage = g.location?.search ? new URLSearchParams(g.location.search).get(param) : null;
  return fromPage ?? g.process?.env?.[env] ?? null;
}

function asked(): number {
  const n = Number(setting('start', 'MARCHLAND_START') ?? '0');
  return Number.isInteger(n) && n >= 0 && n < MAP.startSites.length ? n : 0;
}

/** Index into MAP.startSites of this game's keeps. */
export const START = asked();

/**
 * The lie of the land between the keeps: the open field (the first), a crossing (a river through the
 * middle, a causeway and two fords), or a road through the forest (two clearings and a ride between them).
 */
export const LAYOUTS = ['field', 'river', 'forest', 'valley', 'fortress'] as const;
/** The layouts a skirmish may be played on (the fortress is the campaign's last mission's; the valley serves both). */
export const SKIRMISH_LAYOUTS = ['field', 'river', 'forest', 'valley'] as const;
export type Layout = (typeof LAYOUTS)[number];
export const LAYOUT: Layout = ((): Layout => {
  const asked = setting('map', 'MARCHLAND_MAP');
  return (LAYOUTS as readonly string[]).includes(asked ?? '') ? (asked as Layout) : 'field';
})();

/** The player's keep (x, z); the computer's is (−x, −z). */
export const PLAYER_SITE: readonly [number, number] = MAP.startSites[START] as readonly [number, number];
