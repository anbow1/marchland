import type { CarriedRegiment } from '../sim/campaign.ts';

// The campaign's progress on this device: how far the player has come, the stars of each mission, and
// what each mission starts from (the army and gold carried out of the one before it). Kept apart from
// the saved game, so saving a skirmish never loses the campaign.

const KEY = 'marchland.campaign';

export interface CampaignProgress {
  /** The highest mission that may be played (1…5). */
  unlocked: number;
  /** Stars per mission (index 0 = mission 1), 0 while not won. */
  stars: number[];
  /** What mission n starts from, keyed by n: the regiments and gold carried out of mission n − 1. */
  carryInto: Record<number, { carried: CarriedRegiment[]; gold: number }>;
}

export function loadProgress(): CampaignProgress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<CampaignProgress>;
      return { unlocked: p.unlocked ?? 1, stars: p.stars ?? [0, 0, 0, 0, 0], carryInto: p.carryInto ?? {} };
    }
  } catch {
    // Private mode or blocked storage: start from the beginning.
  }
  return { unlocked: 1, stars: [0, 0, 0, 0, 0], carryInto: {} };
}

export function storeProgress(p: CampaignProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Nowhere to keep it: the next start begins again.
  }
}

/** A mission won: its stars, the next unlocked, and what the next starts from. */
export function missionWon(n: number, stars: number, carried: CarriedRegiment[], gold: number): CampaignProgress {
  const p = loadProgress();
  p.stars[n - 1] = Math.max(p.stars[n - 1] ?? 0, stars);
  p.unlocked = Math.max(p.unlocked, n + 1);
  p.carryInto[n + 1] = { carried, gold };
  storeProgress(p);
  return p;
}
