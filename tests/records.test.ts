import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Records are the first thing this project stores that a player would be annoyed to
 * lose, and the failure modes are all quiet ones: a record that survives the retune it
 * was set against, a loss that quietly claims the fastest clear, a table that rewrites
 * itself on every run and wears out nothing but the truth.
 *
 * v1.8 added the quietest one yet, and the reason it needed gating in the same step that
 * caused it: two boards run the same global wave table, so they hash identically, and a
 * record filed under the curve alone would have had them sharing one set. That passes by
 * accident with one board - which is exactly why the claim "two boards, two sets" is
 * asserted here rather than eyeballed.
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

const { CURVE_ID, readLastRun, readRecords, recordRun } = await import('../src/records.ts');
const { LEGACY_RUN_ID, RUNS } = await import('../src/runs.ts');

/** The key v1.7 wrote, before a record was a claim about a board as well as a curve. */
const LEGACY_KEY = 'ice-breaker:records';
/** The board the rest of this file is about, when it is only about one of them. */
const RUN = LEGACY_RUN_ID;
const OTHER = RUNS[1].id;
const KEY = `${LEGACY_KEY}:${RUN}`;

function reset(): void {
  store.clear();
}

test('nothing stored reads as no records rather than as a zero', () => {
  reset();
  const records = readRecords(RUN);
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
  const records = readRecords(RUN);
  // The whole argument for deriving the identity from the wave table: this is what a
  // v1.6-style retune does to yesterday's table, without anyone remembering anything.
  assert.equal(records.furthestWave, 0);
  assert.equal(records.fastestClearMs, null);
});

test('the identity travels with the write, so a set just stored is a set read back', () => {
  reset();
  recordRun(RUN, { cleared: true, wave: 15, leaks: 2, durationMs: 200_000 });
  const raw = JSON.parse(store.get(KEY)!);
  assert.equal(raw.curve, CURVE_ID);
  assert.equal(readRecords(RUN).fastestClearMs, 200_000);
});

test('a loss can take the furthest wave and can never take a clear record', () => {
  reset();
  // Fast and clean because it ended early, which is the trap: a run that dies on wave 3
  // is quicker and has leaked less than any run that survived to the end.
  const { records, beaten } = recordRun(RUN, { cleared: false, wave: 3, leaks: 5, durationMs: 30_000 });
  assert.equal(records.furthestWave, 3);
  assert.equal(records.fastestClearMs, null);
  assert.equal(records.fewestLeaks, null);
  assert.deepEqual(beaten, ['furthest']);
});

test('a worse run beats nothing and writes nothing', () => {
  reset();
  recordRun(RUN, { cleared: true, wave: 15, leaks: 1, durationMs: 180_000 });
  const stored = store.get(KEY);

  const { records, beaten } = recordRun(RUN, { cleared: true, wave: 15, leaks: 4, durationMs: 240_000 });
  assert.deepEqual(beaten, []);
  assert.equal(records.fastestClearMs, 180_000);
  assert.equal(records.fewestLeaks, 1);
  // Byte for byte: a run that beat nothing has nothing to say to storage.
  assert.equal(store.get(KEY), stored);
});

test('the two clear records move independently', () => {
  reset();
  recordRun(RUN, { cleared: true, wave: 15, leaks: 0, durationMs: 240_000 });
  // Faster, and dirtier. One record moves and the other holds - they are two different
  // ways to be good at this game, which is the reason there are two of them.
  const { records, beaten } = recordRun(RUN, { cleared: true, wave: 15, leaks: 3, durationMs: 200_000 });
  assert.deepEqual(beaten, ['fastest']);
  assert.equal(records.fastestClearMs, 200_000);
  assert.equal(records.fewestLeaks, 0);
});

test('the furthest wave only ever goes forward', () => {
  reset();
  recordRun(RUN, { cleared: false, wave: 11, leaks: 5, durationMs: 120_000 });
  const { records, beaten } = recordRun(RUN, { cleared: false, wave: 4, leaks: 5, durationMs: 40_000 });
  assert.deepEqual(beaten, []);
  assert.equal(records.furthestWave, 11);
});

test('storage that cannot be parsed reads as no records rather than as a crash', () => {
  reset();
  store.set(KEY, '{not json');
  // The mute key's argument, one storey up: a game that will not boot because it could
  // not read a best time has its priorities backwards.
  assert.equal(readRecords(RUN).furthestWave, 0);
});

test('two boards keep two sets, and neither can see the other', () => {
  reset();
  recordRun(RUN, { cleared: true, wave: 15, leaks: 0, durationMs: 240_000 });

  // The failure this key shape exists to prevent, stated as an assertion: the wave table
  // is global, so both boards run the same fifteen waves and hashed to the same string.
  // Under the v1.7 key this read 240_000 and called it the other board's best time - and
  // what it would really have been measuring is which board is shorter.
  assert.equal(readRecords(OTHER).fastestClearMs, null);
  assert.equal(readRecords(OTHER).furthestWave, 0);

  // And a record on the second board is a record on the second board only.
  const { beaten } = recordRun(OTHER, { cleared: true, wave: 15, leaks: 4, durationMs: 400_000 });
  // Slower and dirtier than the first board's, and it still takes both: it is the first
  // clear this board has ever seen.
  assert.deepEqual(beaten, ['furthest', 'fastest', 'cleanest']);
  assert.equal(readRecords(RUN).fastestClearMs, 240_000);
  assert.equal(readRecords(OTHER).fastestClearMs, 400_000);
});

test('the set from before there was a second board is adopted, by the board that set it', () => {
  reset();
  // Exactly what v1.7 wrote: no board in the key, because there was only one board.
  store.set(
    LEGACY_KEY,
    JSON.stringify({ curve: CURVE_ID, furthestWave: 15, fastestClearMs: 210_000, fewestLeaks: 1 }),
  );

  // Adopted rather than dropped, and that is the opposite of what a curve change does.
  // A record whose curve cannot be established is worthless; this one's board can be -
  // there has only ever been one board it could have been set on.
  assert.equal(readRecords(RUN).fastestClearMs, 210_000);
  // And it is not a free record for the board that did not exist yet.
  assert.equal(readRecords(OTHER).fastestClearMs, null);
});

test('the adopted set moves to its own key the first time it is beaten', () => {
  reset();
  store.set(
    LEGACY_KEY,
    JSON.stringify({ curve: CURVE_ID, furthestWave: 15, fastestClearMs: 210_000, fewestLeaks: 1 }),
  );
  recordRun(RUN, { cleared: true, wave: 15, leaks: 1, durationMs: 190_000 });

  // The new key wins from here, and nothing reads the old one again.
  assert.equal(JSON.parse(store.get(KEY)!).fastestClearMs, 190_000);
  // The old key is left where it is rather than deleted: a service worker can serve
  // yesterday's bundle for one load after a deploy, and that is the load that would
  // otherwise find its record gone.
  assert.equal(JSON.parse(store.get(LEGACY_KEY)!).fastestClearMs, 210_000);
});

test('the board just played is remembered, whether or not anything was beaten', () => {
  reset();
  assert.equal(readLastRun(), null);

  recordRun(OTHER, { cleared: false, wave: 2, leaks: 5, durationMs: 20_000 });
  assert.equal(readLastRun(), OTHER);

  // Losing worse than before beats nothing and still writes nothing to the record set -
  // but having played a board is what makes its set the one worth printing, and playing
  // badly is still playing.
  const { beaten } = recordRun(RUN, { cleared: false, wave: 1, leaks: 5, durationMs: 10_000 });
  assert.deepEqual(beaten, ['furthest']);
  assert.equal(readLastRun(), RUN);
});
