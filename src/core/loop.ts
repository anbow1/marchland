import { SIM } from '../config.ts';

// Fixed-step loop (rules §5): logic runs at exactly 60 Hz, rendering at the
// display rate. The view reads the latest state; at RTS distances a 16 ms-old
// position cannot be seen, so nothing is interpolated.

export interface LoopCallbacks {
  step: (dtSeconds: number) => void;
  render: (frameSeconds: number) => void;
}

export class FixedLoop {
  private accumulatorSeconds = 0;
  private lastMs = -1;
  private running = false;
  private rafId = 0;
  /** While true the simulation stands still; frames are still drawn. */
  paused = false;
  /** Game seconds per real second (1 normal; the HUD offers 2 and 3). */
  speed = 1;

  constructor(private readonly callbacks: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastMs = -1;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private readonly frame = (nowMs: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);
    // First frame: no elapsed time yet, so no step, but still render.
    const frameSeconds = this.lastMs < 0 ? 0 : Math.min((nowMs - this.lastMs) / 1000, 0.25);
    this.lastMs = nowMs;
    if (!this.paused) {
      this.accumulatorSeconds += frameSeconds * this.speed;
      const maxSteps = SIM.maxStepsPerFrame * this.speed;
      let steps = 0;
      while (this.accumulatorSeconds >= SIM.stepSeconds && steps < maxSteps) {
        this.callbacks.step(SIM.stepSeconds);
        this.accumulatorSeconds -= SIM.stepSeconds;
        steps++;
      }
      // Too slow to keep up: drop the backlog rather than spiral.
      if (steps === maxSteps) this.accumulatorSeconds = 0;
    }
    this.callbacks.render(frameSeconds);
  };
}
