import { MAP } from '../config.ts';

// Which of the prepared places the keeps stand on (MAP.startSites): the player picks one of three before
// the game; the computer's keep is always the player's turned half a circle about the middle, so the
// land stays fair. The whole map (the flat ground round the keeps, the lakes and outcrops laid out from
// them, the forest's clearings, the field between them) is worked out from it once, when the game loads,
// so a new choice reloads the page with `?start=` set. Outside a browser (tests, tools) it is read from
// MARCHLAND_START, and defaults to the first.

function asked(): number {
  const g = globalThis as { location?: { search?: string }; process?: { env?: Record<string, string | undefined> } };
  const fromPage = g.location?.search ? new URLSearchParams(g.location.search).get('start') : null;
  const raw = fromPage ?? g.process?.env?.['MARCHLAND_START'] ?? '0';
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n < MAP.startSites.length ? n : 0;
}

/** Index into MAP.startSites of this game's keeps. */
export const START = asked();

/** The player's keep (x, z); the computer's is (−x, −z). */
export const PLAYER_SITE: readonly [number, number] = MAP.startSites[START] as readonly [number, number];
