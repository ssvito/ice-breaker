import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  callWaveEarly,
  createGameState,
  overclockTower,
  placeTower,
  sellTower,
  stepGame,
  TICK_MS,
  towerAt,
  upgradeTower,
} from '../src/game.ts';
import type { GameState } from '../src/game.ts';
import { formatRunLog, parseRunLog, sealRunLog } from '../src/run-log.ts';
import type { RunLog } from '../src/run-log.ts';
import { replayRun } from '../src/replay.ts';
import { RUNS } from '../src/runs.ts';
import { level1 } from '../src/map.ts';

/**
 * The step the first two were for.
 *
 * A replay that does not reproduce is a determinism bug with a reproduction attached,
 * and a replay that does reproduce is what turns "the game and the harness are one
 * simulation" from a claim about two code paths - which is all `game-loop.test.ts` could
 * assert - into a claim about a run a person actually played.
 *
 * So the centrepiece here is not synthetic. `tests/runs/recursion-02-flawless.run` is a
 * real run: RECURSION 02 cleared in 2:08 with the core untouched, eight towers, seven
 * upgrades, fourteen early calls. It cannot be regenerated, which is exactly why it is
 * checked in.
 */

const HUMAN_RUN = parseRunLog(
  readFileSync(new URL('./runs/recursion-02-flawless.run', import.meta.url), 'utf8'),
);

/**
 * A scripted run to cover what the human one never did. Two runs in, no player has sold
 * a tower or fired an Overclock, so the fixture cannot gate either path - and a replay
 * that silently skipped both would still reproduce that log perfectly.
 */
function scriptedRun(): RunLog {
  const state = createGameState(level1);
  const step = (ticks: number) => {
    for (let i = 0; i < ticks; i++) stepGame(state, TICK_MS);
  };

  const first = placeTower(state, 'firewallNode', { x: 1, y: 3 });
  assert.ok(first);
  callWaveEarly(state);
  step(120);
  assert.ok(overclockTower(state, first));
  step(200);
  const second = placeTower(state, 'firewallNode', { x: 2, y: 3 });
  assert.ok(second);
  step(400);
  assert.ok(upgradeTower(state, first));
  step(300);
  // Sold while the run is still going, so everything after it is played on the board the
  // sale left behind rather than on the one that was built.
  assert.ok(sellTower(state, second));
  step(60);
  callWaveEarly(state);

  while (state.status === 'playing' && state.tick < 60 * 60 * 5) stepGame(state, TICK_MS);
  assert.notEqual(state.status, 'playing', 'the scripted run has to reach an ending');
  return sealRunLog(RUNS[0].id, state);
}

/**
 * The player's turn, taken by hand.
 *
 * Deliberately not `replayDriver` - this file's job is to disagree with the replay if the
 * replay is wrong, and a test that drives a run through the same code it is testing can
 * only ever agree with it. It is the same handful of lines `scriptedRun` above is built
 * out of, which is what a player's turn actually is.
 */
function apply(state: GameState, log: RunLog, cursor: number): number {
  while (cursor < log.actions.length && log.actions[cursor].tick === state.tick) {
    const action = log.actions[cursor++];
    if (action.action === 'call') {
      callWaveEarly(state);
      continue;
    }
    if (action.action === 'place') {
      placeTower(state, action.tower, action);
      continue;
    }
    const tower = towerAt(state, action);
    if (!tower) continue;
    if (action.action === 'upgrade') upgradeTower(state, tower);
    else if (action.action === 'sell') sellTower(state, tower);
    else overclockTower(state, tower);
  }
  return cursor;
}

/**
 * Play a log into a state up to a tick, and return where in the log that left off.
 *
 * The trailing `apply` is the taps that landed on the final tick with no tick behind them
 * yet, which is what a run put down mid-wave has: the player taps, and then the phone
 * rings before the next frame.
 */
function drive(state: GameState, log: RunLog, cursor: number, untilTick: number): number {
  while (state.status === 'playing' && state.tick < untilTick) {
    cursor = apply(state, log, cursor);
    stepGame(state, TICK_MS);
  }
  return apply(state, log, cursor);
}

/**
 * The gate this step exists for: a run somebody played, played again, landing on the same
 * everything. "The same everything" is deliberately more than the verdict - the actions
 * the replay managed to take and the enemies that walked through are compared too, so a
 * replay cannot pass by arriving at the right core HP down a different road.
 */
test('the run a person played replays to the same run', () => {
  assert.ok(HUMAN_RUN, 'the recorded run should still parse');
  const outcome = replayRun(HUMAN_RUN);
  assert.ok(outcome.replayed, 'the recorded run should be replayable on this build');

  assert.deepEqual(outcome.differences, [], 'the replay diverged from the run that was played');

  // And the report the harness prints for it says the same thing the log says, which is
  // what makes a replayed run and a declared layout comparable at all.
  assert.equal(outcome.report.status, HUMAN_RUN.end.status);
  assert.equal(outcome.report.coreHealth, HUMAN_RUN.end.coreHealth);
  assert.equal(outcome.report.cyclesEnd, HUMAN_RUN.end.cycles);
  assert.equal(outcome.report.durationMs, HUMAN_RUN.end.tick * TICK_MS);
  assert.equal(outcome.report.totalLeaks, 0, 'the flawless run took no core damage');
});

test('a scripted run covering sell and Overclock replays too', () => {
  const log = scriptedRun();
  assert.ok(
    log.actions.some((entry) => entry.action === 'sell') &&
      log.actions.some((entry) => entry.action === 'overclock'),
    'the scripted run should exercise both paths the human run never touched',
  );

  const outcome = replayRun(log);
  assert.ok(outcome.replayed);
  assert.deepEqual(outcome.differences, []);
});

/**
 * v1.9 step 7, and the claim it is allowed to make: **an interruption changes nothing.**
 *
 * The flawless run is cut at tick 3993 - `upgrade 4 6`, a little past the midpoint, with
 * the board busy. Two things about that tick are chosen rather than convenient. It is
 * mid-wave, so the state being restored is not a lull with nothing on it but towers. And
 * it falls exactly on a tap, which is the case the save had to be built for: the action
 * and the interruption land between the same two frames, so the log carries an action on
 * the tick it ends. A resume that stopped one turn early would drop it, the upgrade would
 * be missing from a board the player watched it land on, and the difference would show up
 * here as an action recorded and not replayed.
 *
 * Then it is played out and compared against the whole log rather than against a verdict:
 * every action, every enemy through the gate, the clock, the money and the ending. The
 * run that was interrupted is the run that was played, line for line.
 */
test('a run put down mid-wave comes back as the same run', () => {
  assert.ok(HUMAN_RUN);
  const board = RUNS[1];
  const CUT = 3993;

  const interrupted = createGameState(board.map);
  const cursor = drive(interrupted, HUMAN_RUN, 0, CUT);
  assert.equal(interrupted.tick, CUT);
  assert.ok(interrupted.enemies.length > 0, 'the cut should land mid-wave, with the board busy');
  assert.equal(
    interrupted.actions[interrupted.actions.length - 1].tick,
    CUT,
    'the cut should land on the tick of a tap, which is the case the drain exists for',
  );

  // Through text, because text is what the slot holds - and a save that survives being
  // formatted and read back is a save that survives being pasted into a bug report.
  const saved = sealRunLog(board.id, interrupted);
  assert.equal(saved.end.status, 'suspended');
  const reread = parseRunLog(formatRunLog(saved));
  assert.deepEqual(reread, saved, 'a suspended log should survive the round trip through text');

  const outcome = replayRun(reread!);
  assert.ok(outcome.replayed, 'a suspended log of this game should replay');
  assert.deepEqual(outcome.differences, [], 'the run did not come back where it was put down');
  assert.equal(outcome.state.tick, CUT, 'a resume lands on the tick it was suspended at');

  // And played on from there, it is the run that was played.
  drive(outcome.state, HUMAN_RUN, cursor, Infinity);
  assert.deepEqual(sealRunLog(board.id, outcome.state), HUMAN_RUN);
});

/**
 * A gate nothing can fail is not a gate, so two tampers that have to be caught - and they
 * are caught in different places, which is the argument for comparing more than a verdict.
 *
 * The first moves one tower one tile. That is the board's own thesis as a test: the same
 * ladder two tiles off these tiles loses the core, and here it costs enough early damage
 * that a later purchase can no longer be afforded - so the run stops matching at the
 * action the recorded player took and this one could not.
 */
test('the same run one tile over is a different run', () => {
  assert.ok(HUMAN_RUN);
  const shifted: RunLog = {
    ...HUMAN_RUN,
    actions: HUMAN_RUN.actions.map((entry, index) =>
      index === 0 && entry.action === 'place' ? { ...entry, x: entry.x - 1 } : entry,
    ),
  };

  const outcome = replayRun(shifted);
  assert.ok(outcome.replayed);
  assert.ok(outcome.differences.length > 0, 'moving the opening tower one tile changed nothing');
});

/**
 * The second is the one that argues for the whole design. Drop the last upgrade of a
 * flawless run and **the verdict does not move** - it is still a clear with the core
 * untouched - but the money and the clock do. A gate that compared the ending alone would
 * call this the same run.
 */
test('dropping the last upgrade keeps the verdict and moves the ledger', () => {
  assert.ok(HUMAN_RUN);
  const without: RunLog = { ...HUMAN_RUN, actions: HUMAN_RUN.actions.slice(0, -1) };

  const outcome = replayRun(without);
  assert.ok(outcome.replayed);
  assert.equal(outcome.report.status, 'won', 'the run should still clear without its last upgrade');
  assert.equal(outcome.report.coreHealth, HUMAN_RUN.end.coreHealth);

  assert.deepEqual(
    outcome.differences.map((line) => line.split(':')[0]),
    ['Cycles', 'length'],
    'an unspent upgrade should show up as Cycles left over and a run that ran longer',
  );
});

/**
 * The envelope's two refusals, which are the parser's job to carry and not to judge: a
 * log it cannot read is `null`, and a log of another game reads fine and is refused here.
 */
test('a log of another game is refused rather than replayed', () => {
  assert.ok(HUMAN_RUN);

  const otherCurve = replayRun({ ...HUMAN_RUN, curve: 'deadbeef' });
  assert.equal(otherCurve.replayed, false);
  assert.match(otherCurve.replayed === false ? otherCurve.refused : '', /another curve/);

  const otherBoard = replayRun({ ...HUMAN_RUN, run: 'mainframe-99' });
  assert.equal(otherBoard.replayed, false);
  assert.match(otherBoard.replayed === false ? otherBoard.refused : '', /no such board/);
});
