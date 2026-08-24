import test from 'node:test';
import assert from 'node:assert/strict';
import { callWaveEarly, createGameState, placeTower, stepGame, TICK_MS as SIM_TICK_MS } from '../src/game.ts';
import type { GameHooks } from '../src/game.ts';
import { earlyCallBonus, nextWavePreview } from '../src/wave.ts';
import { createEnemy, enemyStats } from '../src/enemy.ts';
import { level1 } from '../src/map.ts';

/**
 * The simulation is only worth extracting if it can be run without a browser, so
 * these are the first tests the project has: they open no canvas and draw nothing.
 *
 * They exist because the kill burst is the one place the sim reaches outside itself
 * - it scatters the dead enemy's actual sprite pixels, which live in a baked atlas -
 * and a cosmetic effect that a screenshot has to catch inside a 380ms window is not
 * something to verify by squinting at the right frame.
 */

const TICK_MS = 1000 / 60;
const TICK_CAP = 60 * 60; // one simulated minute; a worm dies or leaks long before

/** Two pixels standing in for a sprite - the sim never inspects them, it only relays them. */
const FAKE_PIXELS = [
  { dx: 0, dy: 0, color: '#39ff88' },
  { dx: 2, dy: -1, color: '#00e5ff' },
];

/** One worm against one Firewall Node covering the start of the path. */
function runSingleKill(hooks?: GameHooks) {
  const state = createGameState(level1);
  const tower = placeTower(state, 'firewallNode', { x: 1, y: 3 });
  assert.ok(tower, 'the tile beside the spawn should be buildable');

  state.enemies.push(createEnemy('worm'));
  const cyclesBefore = state.cycles;

  let ticks = 0;
  while (state.enemies.length > 0 && ticks < TICK_CAP) {
    stepGame(state, TICK_MS, hooks);
    ticks++;
  }

  return { state, ticks, cyclesBefore };
}

test('a kill scatters the dead enemy pixels the hook hands over', () => {
  const { state, cyclesBefore } = runSingleKill({ enemyPixels: () => FAKE_PIXELS });

  assert.equal(state.coreHealth, 5, 'the worm should have died, not reached the core');
  assert.equal(state.cycles, cyclesBefore + enemyStats('worm').reward, 'a kill pays its bounty');

  assert.ok(state.particles.length > 0, 'the kill should have produced a glitch burst');
  const colors = new Set(state.particles.map((p) => p.color));
  for (const color of colors) {
    assert.ok(
      FAKE_PIXELS.some((pixel) => pixel.color === color),
      `particle colour ${color} did not come from the pixels the hook returned`,
    );
  }
});

test('with no hook there is no burst, and the run is otherwise identical', () => {
  const withHook = runSingleKill({ enemyPixels: () => FAKE_PIXELS });
  const headless = runSingleKill();

  assert.equal(headless.state.particles.length, 0, 'no hook means no particles to draw');

  // The burst is the only part of a kill that can differ, and it must not be able to
  // change anything the balance harness reads. Same tick count, same everything.
  assert.equal(headless.ticks, withHook.ticks);
  assert.equal(headless.state.cycles, withHook.state.cycles);
  assert.equal(headless.state.coreHealth, withHook.state.coreHealth);
  assert.equal(headless.state.status, withHook.state.status);
});

test('the same run twice produces the same numbers', () => {
  function fullRun() {
    const state = createGameState(level1);
    placeTower(state, 'firewallNode', { x: 5, y: 3 });
    placeTower(state, 'firewallNode', { x: 8, y: 5 });

    let ticks = 0;
    while (state.status === 'playing' && ticks < 60 * 60 * 10) {
      stepGame(state, TICK_MS);
      ticks++;
    }
    return { ticks, status: state.status, coreHealth: state.coreHealth, cycles: state.cycles };
  }

  const first = fullRun();
  const second = fullRun();

  // The property the balance harness stands on: no seeded RNG needed, because the
  // simulation reaches no randomness at all once the cosmetic hook is left out.
  assert.deepEqual(second, first);
  assert.notEqual(first.status, 'playing', 'the run should actually finish inside the cap');
});

test('calling a wave early pays exactly what the console offered, and starts it', () => {
  const state = createGameState(level1);

  const preview = nextWavePreview(state.spawner);
  assert.ok(preview, 'the run opens on a countdown');
  assert.ok(preview.earlyBonus > 0, 'a full countdown is worth something to skip');

  const before = state.cycles;
  const paid = callWaveEarly(state);

  // The button reads its price off the same preview the player is looking at, so
  // a mismatch here is the game charging one number and paying another.
  assert.equal(paid, preview.earlyBonus);
  assert.equal(state.cycles, before + paid);
  assert.equal(state.spawner.waveIndex, -1, 'the wave has not opened yet, only the countdown ended');

  stepGame(state, SIM_TICK_MS);
  assert.equal(state.spawner.waveIndex, 0, 'the next tick opens the wave that was called');
  assert.equal(state.enemies.length, 1, 'and its first group, which starts at 0ms, spawns with it');
});

test('there is nothing to call while a wave is running', () => {
  const state = createGameState(level1);
  callWaveEarly(state);

  // Into the wave proper, past the countdown that could have been bought out.
  while (state.spawner.state === 'countdown') stepGame(state, SIM_TICK_MS);

  const before = state.cycles;
  assert.equal(callWaveEarly(state), 0, 'a wave already on the board is not for sale');
  assert.equal(state.cycles, before);
});

test('the bonus is the countdown the console prints, rounded the same way', () => {
  // `IN 8s` and `+8` come from one number read twice; ceil on both sides is what
  // keeps them from ever disagreeing by one.
  assert.equal(earlyCallBonus(8000), 8);
  assert.equal(earlyCallBonus(7001), 8);
  assert.equal(earlyCallBonus(1), 1);
  assert.equal(earlyCallBonus(0), 0);
  assert.equal(earlyCallBonus(-500), 0, 'an overshot countdown is worth nothing, not a refund');
});
