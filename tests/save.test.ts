import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The slot the interrupted run lives in.
 *
 * Nothing here is about whether a run comes back correctly - that is `replay.test.ts`,
 * where a real run is cut in half and played out to the same ending. This file is about
 * the three decisions `save.ts` makes on its own, each of which is a quiet failure rather
 * than a loud one: what is worth writing down, what is worth reading back, and what
 * happens when storage refuses.
 *
 * `localStorage` is a browser object and this runner is Node, so it is stubbed - the same
 * idiom `records.test.ts` uses, and for the same second reason: the stub is the only way
 * to get at what happens when the accessor itself throws, which is a real browser state
 * (a privacy mode, a quota) and not a hypothetical.
 */

const store = new Map<string, string>();
let throwing = false;

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => {
      if (throwing) throw new Error('storage is unavailable');
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (throwing) throw new Error('storage is unavailable');
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      if (throwing) throw new Error('storage is unavailable');
      store.delete(key);
    },
  },
});

const { clearSave, readSave, saveRun } = await import('../src/save.ts');
const { createGameState, placeTower, stepGame, TICK_MS } = await import('../src/game.ts');
const { formatRunLog, sealRunLog } = await import('../src/run-log.ts');
const { RUNS } = await import('../src/runs.ts');

const KEY = 'ice-breaker:run';
const RUN = RUNS[0].id;

function fresh(ticks: number) {
  const state = createGameState(RUNS[0].map);
  placeTower(state, 'firewallNode', { x: 1, y: 3 });
  for (let i = 0; i < ticks; i++) stepGame(state, TICK_MS);
  return state;
}

function reset(): void {
  store.clear();
  throwing = false;
}

test('a run in progress goes into the slot as its own text', () => {
  reset();
  const state = fresh(300);

  saveRun(RUN, state);
  // The log's own format and nothing wrapped around it, so a save pulled out of devtools
  // is a bug report from a phone that is still mid-run.
  assert.equal(store.get(KEY), formatRunLog(sealRunLog(RUN, state)));

  const read = readSave();
  assert.deepEqual(read, sealRunLog(RUN, state));
  assert.equal(read?.end.status, 'suspended');
});

/**
 * The two runs that are not worth writing down, and neither refusal is tidiness.
 *
 * A finished run has nowhere to be resumed to - what it leaves behind is the record and
 * the report - and a slot still holding one would offer the player a run that is over.
 *
 * A run that has not stepped is the start button with extra steps, and it is also the one
 * log a replay cannot get a state out of: the driver is handed the run on its first turn,
 * and a run of no ticks never gives it one.
 */
test('a run that is over, and a run that has not started, are not saved', () => {
  reset();
  const state = createGameState(RUNS[0].map);
  saveRun(RUN, state);
  assert.equal(store.has(KEY), false, 'a run on tick 0 is not an interrupted run');

  const played = fresh(300);
  played.status = 'won';
  saveRun(RUN, played);
  assert.equal(store.has(KEY), false, 'a finished run has nowhere to come back to');
});

/**
 * Half a save is a run nobody played, and it is what the failure actually looks like: a
 * write cut off by the tab dying mid-`setItem`, or a key somebody edited by hand. The
 * parser step 2 wrote is strict for exactly this, and reusing it here is most of why the
 * slot holds text rather than a shape of its own.
 */
test('a slot that cannot be read in full reads as nothing', () => {
  reset();
  saveRun(RUN, fresh(300));
  const whole = store.get(KEY)!;

  const lines = whole.split('\n');
  store.set(KEY, lines.slice(0, -1).join('\n'));
  assert.equal(readSave(), null, 'a save missing its last line is not a save');

  store.set(KEY, 'ice-breaker/3 recursion-02 deadbeef\n10 suspend 5 100 1');
  assert.ok(readSave(), 'another curve is the replay to refuse, not the parser');

  store.set(KEY, whole.replace(/ suspend .*/, ' end won 5 100 1'));
  assert.equal(readSave(), null, 'a finished run in the slot is not something to resume');

  store.set(KEY, '');
  assert.equal(readSave(), null);
});

test('the slot empties, and an empty slot offers nothing', () => {
  reset();
  saveRun(RUN, fresh(300));
  assert.ok(readSave());

  clearSave();
  assert.equal(store.has(KEY), false);
  assert.equal(readSave(), null);
});

/**
 * Storage that throws is a real browser and not a hypothetical - a privacy mode where the
 * accessor itself raises, a quota that is full. The rule is the one the records key and
 * the mute key already follow: **failing to remember is not a reason to fail.** A player
 * who cannot be offered a resume should still be offered the game.
 */
test('storage that refuses costs a resume and nothing else', () => {
  reset();
  throwing = true;

  assert.doesNotThrow(() => saveRun(RUN, fresh(300)));
  assert.doesNotThrow(() => clearSave());
  assert.equal(readSave(), null);
});
