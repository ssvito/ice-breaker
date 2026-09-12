import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * **The claim this whole milestone rests on: the thing the player plays and the thing the
 * harness measures are the same simulation.**
 *
 * Every number v1.3, v1.6 and v1.8 printed was taken by `balance.ts` stepping `stepGame`
 * directly in a `for` loop. Nobody plays that. The game reaches `stepGame` through
 * `GameLoop`, which accumulates real frame time, and through a `hooks` object the harness
 * never passes. If those two paths have drifted, every reading this project has ever taken
 * is about a game nobody is playing - and the drift would be silent, because both halves
 * would keep producing plausible numbers.
 *
 * `tests/game.test.ts` has gated the *simulation* since v1.3: same input, same output, no
 * `Math.random()` in the step. What has never been gated is the two ways in. This file is
 * that, and it is deliberately the first step of v1.9 rather than a later one - the rest of
 * the milestone assumes the answer.
 *
 * `GameLoop` drives itself with `requestAnimationFrame` and `performance.now()`, neither of
 * which exists in Node, so both are stubbed and the clock is driven by hand. Same idiom as
 * the `localStorage` stub in `records.test.ts`, and it buys more than portability: a hand
 * driven clock can serve frame times no real machine would, which is exactly where a fixed
 * timestep either holds or does not.
 */

let now = 0;
let pending: ((time: number) => void) | null = null;

Object.defineProperty(globalThis, 'performance', {
  configurable: true,
  value: { now: () => now },
});

Object.defineProperty(globalThis, 'requestAnimationFrame', {
  configurable: true,
  value: (callback: (time: number) => void) => {
    pending = callback;
    return 1;
  },
});

Object.defineProperty(globalThis, 'cancelAnimationFrame', {
  configurable: true,
  value: () => {
    pending = null;
  },
});

const { GameLoop } = await import('../src/game-loop.ts');
const { createGameState, placeTower, stepGame, TICK_MS } = await import('../src/game.ts');
const { level1 } = await import('../src/map.ts');
import type { GameHooks, GameState } from '../src/game.ts';

/** Two pixels standing in for a sprite, so the burst has something to scatter. */
const FAKE_PIXELS = [
  { dx: 0, dy: 0, color: '#39ff88' },
  { dx: 2, dy: -1, color: '#00e5ff' },
];

/**
 * Frame times no browser would produce on purpose, and every one of them a browser can
 * produce by accident: a 3ms frame, a 92ms stall, a run of short ones. A fixed timestep is
 * only worth the name if none of these reach the simulation.
 */
const RAGGED = [7, 23, 41, 3, 16, 92, 11, 5, 34, 18];

function reset(): void {
  now = 0;
  pending = null;
}

/** Advance the clock by `ms` and run the one frame that is waiting for it. */
function frame(ms: number): void {
  now += ms;
  const callback = pending;
  pending = null;
  callback?.(now);
}

test('every tick is TICK_MS, whatever the frames were', () => {
  reset();
  const sizes: number[] = [];
  const loop = new GameLoop((dtMs) => sizes.push(dtMs), () => {});
  loop.start();

  for (const ms of RAGGED) frame(ms);
  loop.stop();

  assert.ok(sizes.length > 0, 'the ragged frames should have produced ticks at all');
  // Not "close to" and not "averages out". The balance harness steps by exactly this
  // number, so anything else here is the two simulations being different simulations.
  assert.deepEqual(new Set(sizes), new Set([TICK_MS]), `a tick was not TICK_MS: ${[...new Set(sizes)].join(', ')}`);
});

test('ticks follow the time that passed, not the number of frames', () => {
  // The remainder is carried rather than dropped, which is what makes a 7ms frame and a
  // 41ms frame add up to the same simulation as one 48ms frame. Without it a phone
  // dropping frames would quietly run a shorter game than a desktop holding 60fps.
  function ticksOver(frames: number[]): number {
    reset();
    let count = 0;
    const loop = new GameLoop(() => count++, () => {});
    loop.start();
    for (const ms of frames) frame(ms);
    loop.stop();
    return count;
  }

  const total = RAGGED.reduce((sum, ms) => sum + ms, 0);
  const even = Array.from({ length: total / 10 }, () => 10);

  assert.equal(ticksOver(RAGGED), ticksOver(even), 'the same elapsed time ran a different number of ticks');
});

test('a long stall is clamped rather than caught up on', () => {
  // A deliberate divergence between the wall clock and simulated time, and the one place
  // the loop refuses to be faithful: a tab that was backgrounded for a minute must not
  // return and run a minute of game in one frame. Worth a gate because it is the only
  // thing in here that *drops* simulated time, so it is the one a future refactor would
  // most plausibly "fix" into a spiral of death.
  reset();
  let count = 0;
  const loop = new GameLoop(() => count++, () => {});
  loop.start();
  frame(60_000);
  loop.stop();

  // 250ms is exactly fifteen ticks of 1000/60. Rounded rather than floored because the
  // division is not exact in binary - 250/TICK_MS lands at 14.999999999999998, and a floor
  // there would be asserting a float artifact instead of the clamp.
  assert.equal(count, Math.round(250 / TICK_MS), 'a one-minute stall ran more than the 250ms clamp allows');
});

test('speed scales how many ticks run, never how big one is', () => {
  // The whole of the fastest-clear record rests on this. If 2x made the tick bigger, the
  // same run would produce different numbers at different speeds, the speed button would
  // buy records, and a harness reading would stop being comparable to a played one.
  function run(scale: number): number[] {
    reset();
    const sizes: number[] = [];
    const loop = new GameLoop((dtMs) => sizes.push(dtMs), () => {});
    loop.start();
    loop.setTimeScale(scale);
    for (const ms of RAGGED) frame(ms);
    loop.stop();
    return sizes;
  }

  const single = run(1);
  const double = run(2);

  // The load-bearing half: the tick is the same size at either speed.
  assert.deepEqual(new Set(double), new Set([TICK_MS]), '2x changed the size of a tick');
  // And the count doubles, to within the one tick the carried remainder can land either
  // side of. Asserting exact doubling would be asserting where the leftover fell, which is
  // a property of these particular frame times rather than of the loop.
  assert.ok(
    Math.abs(double.length - single.length * 2) <= 1,
    `2x ran ${double.length} ticks against ${single.length} at 1x`,
  );
});

test('paused runs no ticks, and does not bank the time to spend later', () => {
  reset();
  let count = 0;
  const loop = new GameLoop(() => count++, () => {});
  loop.start();
  loop.setTimeScale(0);
  for (const ms of RAGGED) frame(ms);
  assert.equal(count, 0, 'a paused loop stepped the simulation');

  // The point of advancing `lastTime` through a pause: coming back must not spend the
  // pause catching up. A player who stopped to think would otherwise return to a board
  // that had already been played for them.
  loop.setTimeScale(1);
  frame(16);
  loop.stop();
  assert.ok(count <= 1, `resuming spent the pause: ${count} ticks from one 16ms frame`);
});

/**
 * The gate itself, and the reason the other tests in this file exist to support it.
 *
 * One `GameState` is driven the way a player drives it - through `GameLoop`, on ragged
 * frames, with the hooks `main.ts` passes. The other is driven the way `balance.ts` drives
 * it - a plain loop of `stepGame(state, TICK_MS)` with no hooks at all. After the same
 * number of ticks the two must be the same game.
 *
 * Everything is compared except `particles`, which is the hooks' entire output and the only
 * part of the state allowed to differ. That exception is checked rather than assumed: the
 * played run must have produced particles, or the comparison would be passing because
 * nothing happened.
 */
test('the played run and the measured run are the same simulation', () => {
  function build(): GameState {
    const state = createGameState(level1);
    placeTower(state, 'firewallNode', { x: 2, y: 3 });
    placeTower(state, 'firewallNode', { x: 5, y: 3 });
    placeTower(state, 'honeypot', { x: 6, y: 4 });
    return state;
  }

  // Counted rather than inspected afterwards: particles expire, so a run long enough to be
  // worth measuring is a run that may hold none at the moment it ends. What has to be true
  // is that the seam was crossed, not that the last crossing is still on screen.
  let bursts = 0;
  const hooks: GameHooks = {
    enemyPixels: () => {
      bursts++;
      return FAKE_PIXELS;
    },
  };

  // The player's path.
  reset();
  const played = build();
  let ticks = 0;
  const loop = new GameLoop(
    (dtMs) => {
      ticks++;
      stepGame(played, dtMs, hooks);
    },
    () => {},
  );
  loop.start();
  // Long enough to spawn, kill, leak and bank several waves over - the ragged frames
  // average 25ms, so two thousand of them is the better part of a simulated minute.
  for (let i = 0; i < 2000; i++) frame(RAGGED[i % RAGGED.length]);
  loop.stop();

  // The harness's path, for exactly as many ticks as the loop actually ran.
  const measured = build();
  for (let i = 0; i < ticks; i++) stepGame(measured, TICK_MS);

  assert.ok(ticks > 2000, `the run was too short to prove anything: ${ticks} ticks`);
  assert.ok(bursts > 0, 'no burst was ever drawn, so the hook seam was never exercised');

  const { particles: _played, ...playedRest } = played;
  const { particles: _measured, ...measuredRest } = measured;
  assert.deepEqual(
    playedRest,
    measuredRest,
    'the game and the harness diverged - every balance reading this project has taken is about a different game',
  );
});
