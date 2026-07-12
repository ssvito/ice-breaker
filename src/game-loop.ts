const TICK_MS = 1000 / 60;

export class GameLoop {
  private accumulator = 0;
  private lastTime = 0;
  private running = false;
  private rafHandle = 0;

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

  private tick = (now: number): void => {
    if (!this.running) return;

    const frameTime = Math.min(now - this.lastTime, 250);
    this.lastTime = now;
    this.accumulator += frameTime;

    while (this.accumulator >= TICK_MS) {
      this.update(TICK_MS);
      this.accumulator -= TICK_MS;
    }

    this.render(this.accumulator / TICK_MS);
    this.rafHandle = requestAnimationFrame(this.tick);
  };
}
