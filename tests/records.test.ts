import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Records are the first thing this project stores that a player would be annoyed to
 * lose, and the failure modes are all quiet ones: a record that survives the retune it
 * was set against, a loss that quietly claims the fastest clear, a table that rewrites
 * itself on every run and wears out nothing but the truth.
 *
 * None of that throws. So this file gates the rules rather than the arithmetic, the way
 * `balance.test.ts` gates the instrument rather than the reading.
 *
 * `localStorage` is a browser object and this runner is Node, so it is stubbed - which
 * is also the only way to get at the drift guard from a test, since the guard is
 * exactly "what happens when what is in storage came from another curve".
 */

const store = new Map<string, string>();

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  },
});

const { CURVE_ID, readRecords, recordRun } = await import('../src/records.ts');

const KEY = 'ice-breaker:records';

function reset(): void {
  store.clear();
}

test('nothing stored reads as no records rather than as a zero', () => {
  reset();
  const records = readRecords();
  assert.equal(records.furthestWave, 0);
  // Null and not 0: "never cleared" and "cleared in no time" are different claims, and
  // only one of them can be beaten by a real run.
  assert.equal(records.fastestClearMs, null);
  assert.equal(records.fewestLeaks, null);
});

test('a record set on another curve is dropped, not shown', () => {
  reset();
  store.set(
    KEY,
    JSON.stringify({ curve: 'deadbeef', furthestWave: 15, fastestClearMs: 1000, fewestLeaks: 0 }),
  );
  const records = readRecords();
  // The whole argument for deriving the identity from the wave table: this is what a
  // v1.6-style retune does to yesterday's table, without anyone remembering anything.
  assert.equal(records.furthestWave, 0);
  assert.equal(records.fastestClearMs, null);
});

test('the identity travels with the write, so a set just stored is a set read back', () => {
  reset();
  recordRun({ cleared: true, wave: 15, leaks: 2, durationMs: 200_000 });
  const raw = JSON.parse(store.get(KEY)!);
  assert.equal(raw.curve, CURVE_ID);
  assert.equal(readRecords().fastestClearMs, 200_000);
});

test('a loss can take the furthest wave and can never take a clear record', () => {
  reset();
  // Fast and clean because it ended early, which is the trap: a run that dies on wave 3
  // is quicker and has leaked less than any run that survived to the end.
  const { records, beaten } = recordRun({ cleared: false, wave: 3, leaks: 5, durationMs: 30_000 });
  assert.equal(records.furthestWave, 3);
  assert.equal(records.fastestClearMs, null);
  assert.equal(records.fewestLeaks, null);
  assert.deepEqual(beaten, ['furthest']);
});

test('a worse run beats nothing and writes nothing', () => {
  reset();
  recordRun({ cleared: true, wave: 15, leaks: 1, durationMs: 180_000 });
  const stored = store.get(KEY);

  const { records, beaten } = recordRun({ cleared: true, wave: 15, leaks: 4, durationMs: 240_000 });
  assert.deepEqual(beaten, []);
  assert.equal(records.fastestClearMs, 180_000);
  assert.equal(records.fewestLeaks, 1);
  // Byte for byte: a run that beat nothing has nothing to say to storage.
  assert.equal(store.get(KEY), stored);
});

test('the two clear records move independently', () => {
  reset();
  recordRun({ cleared: true, wave: 15, leaks: 0, durationMs: 240_000 });
  // Faster, and dirtier. One record moves and the other holds - they are two different
  // ways to be good at this game, which is the reason there are two of them.
  const { records, beaten } = recordRun({ cleared: true, wave: 15, leaks: 3, durationMs: 200_000 });
  assert.deepEqual(beaten, ['fastest']);
  assert.equal(records.fastestClearMs, 200_000);
  assert.equal(records.fewestLeaks, 0);
});

test('the furthest wave only ever goes forward', () => {
  reset();
  recordRun({ cleared: false, wave: 11, leaks: 5, durationMs: 120_000 });
  const { records, beaten } = recordRun({ cleared: false, wave: 4, leaks: 5, durationMs: 40_000 });
  assert.deepEqual(beaten, []);
  assert.equal(records.furthestWave, 11);
});

test('storage that cannot be parsed reads as no records rather than as a crash', () => {
  reset();
  store.set(KEY, '{not json');
  // The mute key's argument, one storey up: a game that will not boot because it could
  // not read a best time has its priorities backwards.
  assert.equal(readRecords().furthestWave, 0);
});
