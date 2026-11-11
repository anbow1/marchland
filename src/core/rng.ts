// Seeded RNG (mulberry32). Logic never calls Math.random, so a run replays
// the same way from the same seed (rules §10).

export class Rng {
  private state: number;

  constructor(seed: number) {
    if (!Number.isFinite(seed)) throw new Error(`rng seed '${seed}' must be a finite number`);
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  int(lo: number, hiInclusive: number): number {
    return lo + Math.floor(this.next() * (hiInclusive - lo + 1));
  }

  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }

  /** Approximately normal, mean 0, sd 1 (sum of uniforms, cheap and bounded). */
  gauss(): number {
    return (this.next() + this.next() + this.next() + this.next() - 2) * 1.7320508;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('rng.pick called with an empty list');
    return items[Math.floor(this.next() * items.length)] as T;
  }
}
