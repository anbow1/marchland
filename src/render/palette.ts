import type { Side } from '../sim/types.ts';

/** The two sides' colours (sRGB hex): the player's blue, the computer's red. Invented liveries (rules §11). */
export const TEAM_HEX: Record<Side, number> = { 0: 0x2d5fb4, 1: 0xb23a2c };
export const TEAM_CSS: Record<Side, string> = { 0: '#3f76d0', 1: '#cf4a3a' };
