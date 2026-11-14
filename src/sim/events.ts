import type { Side } from './types.ts';

// What happened during a step, for sound, effects and messages. A fixed ring:
// the simulation allocates nothing while it runs. The app reads the queue after
// stepping and clears it.

export type EventKind = 'death' | 'meleeHit' | 'arrowShot' | 'arrowHit' | 'stoneFall' | 'charge' | 'rout' | 'rally' | 'shattered' | 'built' | 'destroyed' | 'recruited' | 'rearmed' | 'garrisoned' | 'wallBroken' | 'starving' | 'fed' | 'pointTaken' | 'keepRaised' | 'captainFell' | 'promoted' | 'reinforced' | 'unpaid' | 'paid' | 'gameOver';

export interface GameEvent {
  kind: EventKind;
  x: number;
  z: number;
  side: Side;
}

const CAPACITY = 256;

export class EventQueue {
  readonly items: GameEvent[] = [];
  count = 0;

  constructor() {
    for (let i = 0; i < CAPACITY; i++) this.items.push({ kind: 'death', x: 0, z: 0, side: 0 });
  }

  /** Events past the capacity are dropped: they only drive sound and effects. */
  push(kind: EventKind, x: number, z: number, side: Side): void {
    if (this.count >= CAPACITY) return;
    const e = this.items[this.count++] as GameEvent;
    e.kind = kind;
    e.x = x;
    e.z = z;
    e.side = side;
  }

  clear(): void {
    this.count = 0;
  }
}
