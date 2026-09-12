import test from 'node:test';
import assert from 'node:assert/strict';
import {
  callWaveEarly,
  createGameState,
  overclockTower,
  placeTower,
  sellTower,
  stepGame,
  TICK_MS,
  upgradeTower,
} from '../src/game.ts';
import { formatRunLog, parseRunLog, sealRunLog } from '../src/run-log.ts';
import { CURVE_ID } from '../src/records.ts';
import { RUNS } from '../src/runs.ts';
import { level1 } from '../src/map.ts';

/**
 * The run as data, and what these gates are actually protecting is the step after this
 * one: a replay is only worth running if the log it replays is a faithful account of the
 * run. Two ways it could quietly not be, and both are covered here.
 *
 * **An action that did not happen.** Every one of them is a tap that can be refused - the
 * tile is taken, the Cycles are short, the wave is already running, the tower is already
 * overheated - and a log that files the tap instead of the effect replays into a run
 * nobody played.
 *
 * **A tick that is not the tick.** The log's clock is the simulation's own counter rather
 * than anything the caller keeps, which is the whole reason it means the same thing to the
 * game and to the harness. If it drifted, every entry would point at the wrong moment and
 * the failure would look like a determinism bug rather than like a bookkeeping one.
 */

const RUN = RUNS[0].id;

/** An empty board with the money to do anything, so a refusal in a test is the one under test. */
function fresh() {
  const state = createGameState(level1);
  state.cycles = 1000;
  return state;
}

function step(state: ReturnType<typeof fresh>, ticks: number): void {
  for (let i = 0; i < ticks; i++) stepGame(state, TICK_MS);
}

test('an action is logged at the tick it happened on', () => {
  const state = fresh();

  placeTower(state, 'firewallNode', { x: 1, y: 3 });
  step(state, 10);
  placeTower(state, 'aesTurret', { x: 2, y: 3 });
  step(state, 5);
  const tower = placeTower(state, 'firewallNode', { x: 5, y: 3 });
  assert.ok(tower, 'the tile should be buildable');
  upgradeTower(state, tower);
  overclockTower(state, tower);
  step(state, 1);
  sellTower(state, tower);

  assert.equal(state.tick, 16);
  assert.deepEqual(state.log, [
    { tick: 0, action: 'place', tower: 'firewallNode', x: 1, y: 3 },
    { tick: 10, action: 'place', tower: 'aesTurret', x: 2, y: 3 },
    { tick: 15, action: 'place', tower: 'firewallNode', x: 5, y: 3 },
    { tick: 15, action: 'upgrade', x: 5, y: 3 },
    { tick: 15, action: 'overclock', x: 5, y: 3 },
    { tick: 16, action: 'sell', x: 5, y: 3 },
  ]);
});

test('calling a wave early is logged, and calling into a running one is not', () => {
  const state = fresh();

  assert.ok(callWaveEarly(state) > 0, 'the run opens in a countdown, so there is a wave to call');
  // The call zeroes the timer and the next tick opens the wave; from inside one there is
  // nothing to call, and the refusal has to leave the log alone.
  step(state, 1);
  assert.equal(callWaveEarly(state), 0);

  assert.deepEqual(state.log, [{ tick: 0, action: 'call' }]);
});

test('a refused action is not an event in the run', () => {
  const state = fresh();
  const tower = placeTower(state, 'firewallNode', { x: 1, y: 3 });
  assert.ok(tower);
  const logged = state.log.length;

  // The tile is taken.
  assert.equal(placeTower(state, 'aesTurret', { x: 1, y: 3 }), null);
  // The trace is not a tile an off-path tower can stand on.
  assert.equal(placeTower(state, 'firewallNode', level1.waypoints[0]), null);
  // Already boosted: the second tap on Overclock does nothing but look like one.
  assert.ok(overclockTower(state, tower));
  assert.equal(overclockTower(state, tower), false);
  // A tower with no Overclock at all.
  const trap = placeTower(state, 'honeypot', { x: 6, y: 4 });
  assert.ok(trap);
  assert.equal(overclockTower(state, trap), false);

  state.cycles = 0;
  assert.equal(placeTower(state, 'aesTurret', { x: 2, y: 3 }), null);
  assert.equal(upgradeTower(state, tower), false);

  // Sold once, and the second sale is of a tower that is no longer on the board.
  assert.ok(sellTower(state, tower));
  assert.equal(sellTower(state, tower), false);

  assert.deepEqual(
    state.log.map((entry) => entry.action),
    ['place', 'overclock', 'place', 'sell'],
    'something that did not happen was written down as if it had',
  );
  assert.equal(state.log.length, logged + 3);
});

/**
 * The counter stops where the verdict does. `main.ts` files the fastest-clear record as
 * `tick * TICK_MS`, so a tick that kept counting after the run ended would be a record
 * that gets slower the longer the player sits on the result screen.
 */
test('the tick counts only while the run is playing', () => {
  const state = fresh();
  step(state, 3);
  state.status = 'lost';
  step(state, 100);
  assert.equal(state.tick, 3);
});

test('the envelope names the board, the curve and the length', () => {
  const state = fresh();
  step(state, 42);
  placeTower(state, 'firewallNode', { x: 1, y: 3 });

  const log = sealRunLog(RUNS[1].id, state);
  assert.equal(log.run, RUNS[1].id);
  assert.equal(log.curve, CURVE_ID);
  assert.equal(log.ticks, 42);
  assert.deepEqual(log.actions, state.log);

  // A copy: the run is over, and a sealed log that keeps pointing at the live array is
  // not a record of it.
  state.log.push({ tick: 42, action: 'call' });
  assert.equal(log.actions.length, 1);
});

test('a log survives the round trip through text', () => {
  const state = fresh();
  placeTower(state, 'firewallNode', { x: 1, y: 3 });
  callWaveEarly(state);
  step(state, 20);
  const tower = placeTower(state, 'aesTurret', { x: 2, y: 3 });
  assert.ok(tower);
  upgradeTower(state, tower);
  overclockTower(state, tower);
  step(state, 5);
  sellTower(state, tower);

  const log = sealRunLog(RUN, state);
  const text = formatRunLog(log);
  assert.deepEqual(parseRunLog(text), log);
  assert.equal(text.split('\n').length, log.actions.length + 1);
});

test('an unreadable log is null rather than a partial one', () => {
  const state = fresh();
  placeTower(state, 'firewallNode', { x: 1, y: 3 });
  step(state, 10);
  const text = formatRunLog(sealRunLog(RUN, state));

  const refused: Record<string, string> = {
    'nothing at all': '',
    'no header': '0 place firewallNode 1 3',
    'another format entirely': text.replace('ice-breaker/1', 'ice-breaker/2'),
    'a length that is not a number': text.replace(' 10', ' soon'),
    'a verb nobody writes': `${text}\n10 rebuild 1 3`,
    'a tower that does not exist': `${text}\n10 place rootkitNode 1 3`,
    'half a tile': `${text}\n10 upgrade 1`,
    'a tile between tiles': `${text}\n10 upgrade 1.5 3`,
    'an action after the run ended': `${text}\n11 sell 1 3`,
    'an action before the one above it': `${text}\n9 sell 1 3\n2 sell 1 3`,
  };

  for (const [why, broken] of Object.entries(refused)) {
    assert.equal(parseRunLog(broken), null, `read a log with ${why}`);
  }

  // And the one that is not the parser's call to refuse: another board's log reads fine,
  // because "not a replay of this game" is a reading of the envelope rather than a
  // failure to read it.
  const other = parseRunLog(text.replace(RUN, RUNS[1].id));
  assert.equal(other?.run, RUNS[1].id);
});
