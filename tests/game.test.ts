import test from 'node:test';
import assert from 'node:assert/strict';
import {
  callWaveEarly,
  createGameState,
  findTarget,
  placeTower,
  stepGame,
  TICK_MS as SIM_TICK_MS,
} from '../src/game.ts';
import type { GameHooks } from '../src/game.ts';
import { earlyCallBonus, nextWavePreview } from '../src/wave.ts';
import { createEnemy, enemyStats } from '../src/enemy.ts';
import { revealingTowerKinds, towerStats } from '../src/tower.ts';
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

/**
 * Stealth, which is the one trait that needed a tower to change as well as an enemy.
 * The reveal is the IDS Scanner's ability restored, so what these gate is the pair:
 * without the Scanner the kind cannot be shot at all, and the reveal is a place rather
 * than a status that sticks.
 */

test('a hidden ROOTKIT cannot be targeted, and a revealed one can', () => {
  const state = createGameState(level1);
  const tower = placeTower(state, 'firewallNode', { x: 1, y: 3 });
  assert.ok(tower);

  const rootkit = createEnemy('rootkit');
  state.enemies.push(rootkit);
  assert.equal(findTarget(state, tower), null, 'a gun cannot shoot what it cannot see');

  rootkit.revealed = true;
  assert.equal(findTarget(state, tower), rootkit, 'and can the moment something is looking');
});

test('an IDS Scanner reveals, and the reveal is a place rather than a status', () => {
  const state = createGameState(level1);
  assert.ok(placeTower(state, 'idsScanner', { x: 1, y: 3 }));

  const rootkit = createEnemy('rootkit');
  state.enemies.push(rootkit);

  let sawRevealed = false;
  let wentDarkAgain = false;
  for (let i = 0; i < TICK_CAP && !rootkit.removed; i++) {
    stepGame(state, TICK_MS);
    if (rootkit.revealed) sawRevealed = true;
    else if (sawRevealed) wentDarkAgain = true;
  }

  assert.ok(sawRevealed, 'walking through a Scanner should light it up');
  assert.ok(wentDarkAgain, 'and walking out of one should put it back in the dark');
});

test('the Honeypot slows but does not reveal', () => {
  // Both are aura towers, and giving reveal to both would erase the only difference
  // between them. Detection is what the letters in IDS stand for.
  assert.deepEqual(revealingTowerKinds(), ['idsScanner']);
  assert.equal(towerStats('honeypot').reveals, undefined);
  assert.ok(towerStats('honeypot').slowMultiplier !== undefined, 'it is still an aura tower');
});

test('reveal is not sold by the tier', () => {
  // A capability the tower has or does not, so "did you buy a Scanner" cannot degrade
  // into "did you buy enough Scanner".
  for (let tier = 1; tier <= 3; tier++) assert.equal(towerStats('idsScanner', tier).reveals, true);
});

/**
 * The two endings raced on a single tick, and the loss always lost.
 *
 * `stepGame` sets `lost` the moment the core reaches zero, and further down it sets `won`
 * when the spawner is done and the board is clear. An enemy that reaches the core also
 * *despawns* there - so the last enemy of the last wave taking the final core HP satisfies
 * both conditions in the same call, and the unguarded win check overwrote the loss.
 *
 * It is not a cosmetic wrong word on an end screen. `recordRun` files a result as a clear
 * on `status === 'won'`, so this run would have taken the fastest-clear and fewest-leaks
 * records after being killed by the last thing on the board - the two records that exist
 * precisely to mean "you survived the whole curve".
 *
 * Carried since v1 and only reachable when a board is tuned close enough to the curve for
 * the final enemy to be the one that kills you. It surfaced as `won 0/5` in a balance
 * report while the second board was being redrawn, which is the harness catching something
 * no amount of playing had.
 */
test('the last enemy killing the core is a loss, not a win on zero', () => {
  const state = createGameState(level1);

  // The curve is spent and the board holds one enemy, one step from the core.
  state.spawner.state = 'done';
  state.spawner.waveIndex = 99;
  state.coreHealth = 1;
  const enemy = createEnemy('worm');
  enemy.distance = state.pathLength;
  state.enemies.push(enemy);

  stepGame(state, SIM_TICK_MS);

  assert.equal(state.coreHealth, 0, 'the enemy should have taken the last core HP');
  assert.equal(state.enemies.length, 0, 'and despawned, which is what makes the two endings collide');
  assert.equal(state.status, 'lost', 'a run that lost its core on the final enemy reported as a clear');
});

test('a board cleared with core to spare is still a win', () => {
  // The other side of the guard: it must not turn every finished run into a loss.
  const state = createGameState(level1);
  state.spawner.state = 'done';
  state.spawner.waveIndex = 99;

  stepGame(state, SIM_TICK_MS);

  assert.equal(state.status, 'won');
  assert.equal(state.coreHealth, 5);
});
