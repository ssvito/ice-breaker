import test from 'node:test';
import assert from 'node:assert/strict';
import {
  callWaveEarly,
  createGameState,
  MAX_CORE_HEALTH,
  overclockTower,
  placeTower,
  sellTower,
  stepGame,
  TICK_MS,
  upgradeTower,
} from '../src/game.ts';
import { formatRunLog, parseRunLog, sealRunLog } from '../src/run-log.ts';
import type { RunLog } from '../src/run-log.ts';
import { CURVE_ID } from '../src/records.ts';
import { RUNS } from '../src/runs.ts';
import { level1 } from '../src/map.ts';

/**
 * The run as data, and what these gates protect is the step after this one: a replay is
 * only worth running if the log it replays is a faithful account of the run. The two
 * halves fail in different ways, so they are covered separately.
 *
 * **The input half - an action that did not happen.** Every action is a tap that can be
 * refused: the tile is taken, the Cycles are short, the wave is already running, the
 * tower is already overheated. A log that files the tap instead of the effect replays
 * into a run nobody played.
 *
 * **The output half - an ending nothing can disagree with.** Leaks and the verdict are
 * not instructions to a replay, they are the assertion it is checked against, and a log
 * that carries neither is a log no replay can fail.
 *
 * **And the clock under both.** The log's tick is the simulation's own counter rather
 * than anything a caller keeps, which is the whole reason it means the same thing to the
 * game and to the harness. If it drifted, every entry would point at the wrong moment and
 * the failure would look like a determinism bug rather than a bookkeeping one.
 */

const RUN = RUNS[0].id;
/** Five simulated minutes: every run in this file ends long before it. */
const TICK_CAP = 60 * 60 * 5;

/** An empty board with the money to do anything, so a refusal in a test is the one under test. */
function fresh() {
  const state = createGameState(level1);
  state.cycles = 1000;
  return state;
}

function step(state: ReturnType<typeof fresh>, ticks: number): void {
  for (let i = 0; i < ticks; i++) stepGame(state, TICK_MS);
}

/** A board with nothing on it: the curve walks in and the core is gone in a couple of waves. */
function playToTheEnd() {
  const state = createGameState(level1);
  while (state.status === 'playing' && state.tick < TICK_CAP) stepGame(state, TICK_MS);
  assert.equal(state.status, 'lost', 'an undefended board should lose inside the cap');
  return state;
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
  assert.deepEqual(state.actions, [
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

  assert.deepEqual(state.actions, [{ tick: 0, action: 'call' }]);
});

test('a refused action is not an event in the run', () => {
  const state = fresh();
  const tower = placeTower(state, 'firewallNode', { x: 1, y: 3 });
  assert.ok(tower);

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
    state.actions.map((entry) => entry.action),
    ['place', 'overclock', 'place', 'sell'],
    'something that did not happen was written down as if it had',
  );
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

/**
 * The leak is written where it happens, which is the one place that still knows *what*
 * arrived. One tick later there is nothing left but the arithmetic - and the arithmetic
 * is not the same fact: a Zero-Day takes three core HP by itself.
 */
test('what walked through is recorded as an enemy, not as a number', () => {
  const state = playToTheEnd();

  assert.ok(state.leaks.length > 0, 'a board with no towers has to have leaked');
  const damage = MAX_CORE_HEALTH - state.coreHealth;
  assert.ok(
    state.leaks.length <= damage,
    `${state.leaks.length} enemies cannot have cost only ${damage} core HP`,
  );
  for (const leak of state.leaks) {
    assert.ok(leak.tick > 0 && leak.tick <= state.tick, `a leak outside the run: tick ${leak.tick}`);
  }
  // The curve opens on worms, so the first thing through the gate is one.
  assert.equal(state.leaks[0].kind, 'worm');
});

test('the envelope carries the board, the curve and how it came out', () => {
  const state = playToTheEnd();
  const log = sealRunLog(RUNS[1].id, state);

  assert.equal(log.run, RUNS[1].id);
  assert.equal(log.curve, CURVE_ID);
  assert.deepEqual(log.end, {
    tick: state.tick,
    status: 'lost',
    coreHealth: 0,
    cycles: state.cycles,
    // The curve gets a wave and a half in before an undefended core is gone.
    wave: 2,
  });
  assert.deepEqual(log.leaks, state.leaks);

  // A copy: the run is over, and a sealed log that keeps pointing at the live arrays is
  // not a record of it.
  state.actions.push({ tick: state.tick, action: 'call' });
  state.leaks.push({ tick: state.tick, kind: 'worm' });
  assert.equal(log.actions.length, 0);
  assert.equal(log.leaks.length, state.leaks.length - 1);
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
  while (state.status === 'playing' && state.tick < TICK_CAP) stepGame(state, TICK_MS);

  const log = sealRunLog(RUN, state);
  assert.ok(log.leaks.length > 0, 'the run should have leaked something worth round-tripping');
  const text = formatRunLog(log);
  assert.deepEqual(parseRunLog(text), log);
  // Every line accounted for: the header, the two halves merged, and the ending.
  assert.equal(text.split('\n').length, log.actions.length + log.leaks.length + 2);
});

/**
 * One timeline and not two sections, and the order is a claim rather than a tie-break: a
 * leak happens *during* the tick it is stamped with, and an action happens after it,
 * because nothing can be tapped mid-step.
 */
test('a leak and an action on the same tick print in the order they happened', () => {
  const log: RunLog = {
    run: RUN,
    curve: CURVE_ID,
    actions: [
      { tick: 100, action: 'call' },
      { tick: 400, action: 'sell', x: 1, y: 3 },
    ],
    leaks: [
      { tick: 100, kind: 'worm' },
      { tick: 300, kind: 'zeroDay' },
    ],
    end: { tick: 500, status: 'won', coreHealth: 2, cycles: 54, wave: 15 },
  };

  assert.deepEqual(formatRunLog(log).split('\n'), [
    `ice-breaker/2 ${RUN} ${CURVE_ID}`,
    '100 leak worm',
    '100 call',
    '300 leak zeroDay',
    '400 sell 1 3',
    '500 end won 2 54 15',
  ]);
  assert.deepEqual(parseRunLog(formatRunLog(log)), log);
});

test('an unreadable log is null rather than a partial one', () => {
  const state = fresh();
  placeTower(state, 'firewallNode', { x: 1, y: 3 });
  step(state, 10);
  const text = formatRunLog(sealRunLog(RUN, state));
  const [header, ...body] = text.split('\n');

  const refused: Record<string, string> = {
    'nothing at all': '',
    'a header and nothing else': header,
    'no header': body.join('\n'),
    'another format entirely': text.replace('ice-breaker/2', 'ice-breaker/3'),
    'a fourth thing in the header': `${header} 10\n${body.join('\n')}`,
    'no ending': [header, ...body.slice(0, -1)].join('\n'),
    'two endings': `${text}\n10 end lost 0 0 1`,
    'a line after the ending': `${text}\n10 call`,
    'a verdict nobody reaches': text.replace(' end playing', ' end elsewhere'),
    'half an ending': text.replace(/ end \w+ \d+ \d+ \d+/, ' end won 2 54'),
    'a verb nobody writes': [header, '10 rebuild 1 3', ...body].join('\n'),
    'a tower that does not exist': [header, '10 place rootkitNode 1 3', ...body].join('\n'),
    'an enemy that does not exist': [header, '10 leak grayware', ...body].join('\n'),
    'half a tile': [header, '10 upgrade 1', ...body].join('\n'),
    'a tile between tiles': [header, '10 upgrade 1.5 3', ...body].join('\n'),
    'an action later than the ending': [header, '11 call', ...body].join('\n'),
    'an action before the one above it': [header, '5 call', '2 call', ...body].join('\n'),
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
