import { canRecruit, demolish, peopleFor, startBuilding, startRecruit, startUpgrade, togglePaused } from './economy.ts';
import { callUp, freePeople } from './people.ts';
import { buildingStands, holdHere } from './movement.ts';
import { frontageM, isArcher, type Regiment } from './regiment.ts';
import { clampToMap } from './terrain.ts';
import type { BuildingKind, CommandResult, Side, UnitKind } from './types.ts';
import { findRegiment, menAlive, type World } from './world.ts';

// Everything a player can do, human or computer. The HUD and the computer
// player both call these and nothing else, so the two play by the same rules.

export function cmdBuild(world: World, side: Side, plot: number, kind: BuildingKind): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  return startBuilding(world.towns[side], plot, kind);
}

export function cmdUpgrade(world: World, side: Side, plot: number): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  return startUpgrade(world.towns[side], plot);
}

export function cmdDemolish(world: World, side: Side, plot: number): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  return demolish(world.towns[side], plot);
}

export function cmdTogglePaused(world: World, side: Side, plot: number): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  return togglePaused(world.towns[side], plot);
}

/** Orders a regiment: it is paid for now, and its people leave their work and walk to the barracks. */
export function cmdRecruit(world: World, side: Side, kind: UnitKind): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  const town = world.towns[side];
  const able = canRecruit(town, kind, menAlive(world, side));
  if (able !== 'ok') return able;
  if (freePeople(world, side) < peopleFor(kind)) return 'noPeople';
  const result = startRecruit(town, kind, menAlive(world, side));
  if (result === 'ok') callUp(world, side, peopleFor(kind));
  return result;
}

function commandable(world: World, regimentId: number): Regiment | CommandResult {
  if (world.winner !== -1) return 'gameOver';
  const r = findRegiment(world, regimentId);
  if (!r || r.aliveMen === 0) return 'noSuchRegiment';
  if (r.state === 'routing') return 'routing';
  return r;
}

/** March (or run) to a point. `facingRad` null keeps the direction of travel as the final facing. */
export function cmdMove(world: World, regimentId: number, x: number, z: number, facingRad: number | null, run: boolean): CommandResult {
  const r = commandable(world, regimentId);
  if (typeof r === 'string') return r;
  r.order = 'move';
  r.destX = clampToMap(x);
  r.destZ = clampToMap(z);
  const travelFacing = Math.atan2(r.destX - r.anchorX, r.destZ - r.anchorZ);
  r.destFacingRad = facingRad ?? travelFacing;
  r.targetRegimentId = -1;
  r.run = run;
  return 'ok';
}

export function cmdAttackRegiment(world: World, regimentId: number, targetId: number): CommandResult {
  const r = commandable(world, regimentId);
  if (typeof r === 'string') return r;
  const target = findRegiment(world, targetId);
  if (!target || target.aliveMen === 0 || target.side === r.side) return 'noSuchRegiment';
  r.order = 'attackRegiment';
  r.targetRegimentId = targetId;
  r.run = false;
  return 'ok';
}

/** Attack a building of `targetSide`; plot -1 is the keep. */
export function cmdAttackBuilding(world: World, regimentId: number, targetSide: Side, plot: number): CommandResult {
  const r = commandable(world, regimentId);
  if (typeof r === 'string') return r;
  if (targetSide === r.side || !buildingStands(world, targetSide, plot)) return 'plotEmpty';
  r.order = 'attackBuilding';
  r.targetSide = targetSide;
  r.targetPlot = plot;
  r.targetRegimentId = -1;
  r.run = false;
  return 'ok';
}

export function cmdHalt(world: World, regimentId: number): CommandResult {
  const r = commandable(world, regimentId);
  if (typeof r === 'string') return r;
  holdHere(r);
  return 'ok';
}

/** Gap between neighbouring regiments in a battle line, and how far back the archers stand. */
const LINE_GAP_M = 3.5;
const SECOND_LINE_M = 9;

/**
 * Sends several regiments to one place as a battle line facing `facingRad`: melee troops abreast in
 * front, archers abreast behind them. Left-to-right order follows where they stand now, so they do
 * not cross on the way.
 */
export function cmdMoveGroup(world: World, regimentIds: readonly number[], x: number, z: number, facingRad: number, run: boolean): CommandResult {
  if (world.winner !== -1) return 'gameOver';
  const front: Regiment[] = [];
  const rear: Regiment[] = [];
  for (const id of regimentIds) {
    const r = findRegiment(world, id);
    if (!r || r.aliveMen === 0 || r.state === 'routing') continue;
    (isArcher(r) ? rear : front).push(r);
  }
  if (front.length + rear.length === 0) return 'noSuchRegiment';
  // File axis of the new line: (cos f, −sin f).
  const ax = Math.cos(facingRad);
  const az = -Math.sin(facingRad);
  const lateral = (r: Regiment): number => r.centreX * ax + r.centreZ * az;
  const placeRow = (row: Regiment[], backM: number): void => {
    row.sort((a, b) => lateral(a) - lateral(b));
    let total = -LINE_GAP_M;
    for (const r of row) total += frontageM(r) + LINE_GAP_M;
    let cursor = -total / 2;
    for (const r of row) {
      const mid = cursor + frontageM(r) / 2;
      cursor += frontageM(r) + LINE_GAP_M;
      cmdMove(world, r.id, x + ax * mid - Math.sin(facingRad) * backM, z + az * mid - Math.cos(facingRad) * backM, facingRad, run);
    }
  };
  // With no melee troops the archers form the front line themselves.
  placeRow(front, 0);
  placeRow(rear, front.length > 0 ? SECOND_LINE_M : 0);
  return 'ok';
}
