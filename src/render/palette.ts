import type { Side } from '../sim/types.ts';

/** The sides' colours (sRGB hex): the player's blue, the computer's red, the second computer's ochre gold. Invented liveries (rules §11). */
export const TEAM_HEX: Record<Side, number> = { 0: 0x2d5fb4, 1: 0xb23a2c, 2: 0xc8971e };
export const TEAM_CSS: Record<Side, string> = { 0: '#3f76d0', 1: '#cf4a3a', 2: '#d9a52a' };
