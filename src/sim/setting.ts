// A setting from the page's address, or (outside a browser: tests, tools) from the environment. No imports, so
// config.ts may read it as well as the modules that config.ts feeds.
export function setting(param: string, env: string): string | null {
  const g = globalThis as { location?: { search?: string }; process?: { env?: Record<string, string | undefined> } };
  const fromPage = g.location?.search ? new URLSearchParams(g.location.search).get(param) : null;
  return fromPage ?? g.process?.env?.[env] ?? null;
}

/** True on the map of three towns ('triangle'): it is larger, and its size is fixed when the game loads. */
export const THREE_TOWNS = setting('map', 'MARCHLAND_MAP') === 'triangle';
