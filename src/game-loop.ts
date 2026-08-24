import { TICK_MS } from './game.ts';

export class GameLoop {
  private accumulator = 0;
  private lastTime = 0;
  private running = false;
  private rafHandle = 0;
  private timeScale = 1;

  private readonly update: (dtMs: number) => void;
  private readonly render: (alpha: number) => void;

  constructor(update: (dtMs: number) => void, render: (alpha: number) => void) {
    this.update = update;
    this.render = render;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafHandle);
  }

  /**
   * How much simulated time a second of real time buys. Scales the accumulator,
   * not the tick, so the fixed timestep survives - every tick is still TICK_MS
   * and 2x simply runs twice as many of them per frame. That matters beyond
   * feel: a variable tick would make the same run produce different numbers at
   * different speeds, and the balance harness this milestone is heading towards
   * needs the sim to be reproducible.
   *
   * 0 pauses: no time accumulates, so no ticks run, while rendering carries on.
   */
  setTimeScale(scale: number): void {
    this.timeScale = scale;
  }

  private tick = (now: number): void => {
    if (!this.running) return;

    const frameTime = Math.min(now - this.lastTime, 250);
    this.lastTime = now;
    // lastTime advances even while paused, so resuming doesn't spend the pause
    // catching up on time the player spent thinking.
    this.accumulator += frameTime * this.timeScale;

    while (this.accumulator >= TICK_MS) {
      this.update(TICK_MS);
      this.accumulator -= TICK_MS;
    }

    this.render(this.accumulator / TICK_MS);
    this.rafHandle = requestAnimationFrame(this.tick);
  };
}
