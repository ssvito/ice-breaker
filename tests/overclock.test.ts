import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boards, runBalance } from '../src/balance.ts';
import { parseRunLog } from '../src/run-log.ts';
import { replayRun } from '../src/replay.ts';

/**
 * Overclock reaches the harness, which it never had before v1.9: `triggerOverclock` took
 * a tower and knew nothing about a run, so no reading this project ever took had used the
 * ability a player leans on exactly when a wave is going wrong. Every margin table since
 * v1.6 printed a caveat saying so.
 */

/**
 * The Overclock policy, gated as a mechanism and not as a reading.
 *
 * What is asserted here is that the harness can now fire the ability at all - which it
 * could not until v1.9, because `triggerOverclock` had no state-aware door and every
 * margin table since v1.6 carried a caveat saying so. What is *not* asserted is what it
 * is worth: that came back non-monotonic (it costs `veteran` most of its margin and
 * saves `rush` outright), and a reading that sharp is a thing to write down in the log
 * rather than freeze into a constant a retune would quietly falsify.
 */
test('the harness can fire Overclock, and the run says it did', () => {
  const board = boards.find((entry) => entry.id === 'recursion-02')!;
  const loadout = board.loadouts.find((entry) => entry.name === 'veteran')!;

  const plain = runBalance(loadout, { level: board.level });
  const boosted = runBalance(loadout, { level: board.level, overclock: true });

  assert.equal(plain.loadout, 'veteran');
  assert.equal(boosted.loadout, 'veteran+oc', 'an Overclocked row has to say so in the table');

  // The two are the same layout buying the same things: the ability is the only
  // difference, so anything else that moved moved because of it.
  assert.equal(boosted.totalSpent, plain.totalSpent);
  assert.notDeepEqual(
    [boosted.coreHealth, boosted.totalEarned, boosted.durationMs],
    [plain.coreHealth, plain.totalEarned, plain.durationMs],
    'firing Overclock every cooldown changed nothing at all, which cannot be right',
  );
});

/**
 * And the policy's presses are recorded like a player's, because a counterfactual is a
 * run in its own right: a log of one has to replay to the same place.
 */
test('the policy presses land in the run log', () => {
  const log = parseRunLog(
    readFileSync(new URL('./runs/recursion-02-flawless.run', import.meta.url), 'utf8'),
  );
  assert.ok(log);
  assert.equal(log.actions.filter((entry) => entry.action === 'overclock').length, 0, 'the player never used it');

  const counterfactual = replayRun(log, { overclock: true });
  assert.ok(counterfactual.replayed);
  const pressed = counterfactual.state.actions.filter((entry) => entry.action === 'overclock');
  assert.ok(pressed.length > 0, 'the policy never fired');
  // Every press is a difference from the recorded run, and that is the answer rather
  // than a failure - this run is what the player did plus an ability they did not use.
  assert.ok(counterfactual.differences.length >= pressed.length);
});
