import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameState, stepGame, TICK_MS } from '../src/game.ts';
import { parseRunLog } from '../src/run-log.ts';
import { level1 } from '../src/map.ts';

// `shell.ts` reads the build stamp, which Vite replaces with a literal at compile time -
// so in a runner there is nothing to replace it. Declared before the import for the same
// reason `records.test.ts` stubs `localStorage` before its own: the module is imported
// for one pure function and should not need a bundler to be reachable.
Object.assign(globalThis, { __APP_VERSION__: 'test', __APP_BUILT__: '2026-09-12' });
const { groupLeaks } = await import('../src/shell.ts');

/**
 * Leak attribution, which is the half of the post-run report that is new rather than
 * moved: the harness has printed what a run cost wave by wave since v1.3, and no player
 * has ever seen any of it.
 *
 * Only the grouping is gated. The rest of that screen is text in a box, and this project
 * has verified text in a box on a phone since v1.2 rather than in a runner - but reading
 * five identical rows as "wave 10 let three worms through" is arithmetic, and arithmetic
 * that is quietly wrong looks exactly like arithmetic that is right.
 */

test('leaks read as what a wave let through, not as a list of arrivals', () => {
  const rows = groupLeaks([
    { tick: 900, kind: 'worm', wave: 10 },
    { tick: 930, kind: 'worm', wave: 10 },
    { tick: 980, kind: 'rootkit', wave: 10 },
    { tick: 1400, kind: 'zeroDay', wave: 14 },
  ]);

  assert.deepEqual(rows, [
    { wave: 10, text: 'WORM x2, ROOTKIT' },
    { wave: 14, text: 'ZERO-DAY' },
  ]);
});

/** Waves in wave order, whatever order the leaks arrive in - a report is read top down. */
test('the rows are in wave order', () => {
  const rows = groupLeaks([
    { tick: 1400, kind: 'worm', wave: 14 },
    { tick: 300, kind: 'worm', wave: 3 },
    { tick: 900, kind: 'worm', wave: 9 },
  ]);

  assert.deepEqual(rows.map((entry) => entry.wave), [3, 9, 14]);
});

test('a run that leaked nothing has nothing to report', () => {
  assert.deepEqual(groupLeaks([]), []);
});

/**
 * The report counts enemies and the record counts core HP, and **they are different
 * numbers on purpose** - a Zero-Day is one thing through the gate and three hit points
 * off the core. This is the one place both are on screen in the same session, so it is
 * the one place the difference could read as a contradiction.
 */
test('one arrival can cost more than one core HP', () => {
  const rows = groupLeaks([{ tick: 1400, kind: 'zeroDay', wave: 15 }]);
  assert.deepEqual(rows, [{ wave: 15, text: 'ZERO-DAY' }]);
});

/** And against a real run rather than a hand-built list: an undefended board, played out. */
test('a real run groups into rows a player could act on', () => {
  const state = createGameState(level1);
  while (state.status === 'playing' && state.tick < 60 * 60 * 5) stepGame(state, TICK_MS);

  const rows = groupLeaks(state.leaks);
  assert.ok(rows.length > 0, 'an undefended board has to have leaked');
  assert.ok(rows.length <= state.leaks.length, 'grouping should never produce more rows than leaks');
  for (const entry of rows) {
    assert.ok(entry.wave >= 1, `a leak attributed to wave ${entry.wave}`);
    assert.ok(entry.text.length > 0);
  }
});

/**
 * The recorded human run is the other end of it: a flawless clear has nothing to
 * attribute, and the report has to be able to say nothing rather than say zero.
 */
test('the flawless run reports no leaks at all', () => {
  const log = parseRunLog(
    readFileSync(new URL('./runs/recursion-02-flawless.run', import.meta.url), 'utf8'),
  );
  assert.ok(log);
  assert.deepEqual(groupLeaks(log.leaks), []);
});
