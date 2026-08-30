import test from 'node:test';
import assert from 'node:assert/strict';
import { findLoadout, loadouts, MARGIN_MAX, MARGIN_MIN, runBalance, runMargin } from '../src/balance.ts';
import type { Loadout } from '../src/balance.ts';
import { MAX_CORE_HEALTH, STARTING_CYCLES } from '../src/game.ts';
import { towerStats } from '../src/tower.ts';

/**
 * The harness is a measuring instrument, so what these gate is not whether a
 * loadout wins - that is the reading, and it is meant to change every time the
 * curve is tuned - but whether the instrument is telling the truth. A report whose
 * economy does not add up would send the wave curve off in the wrong direction and
 * look authoritative doing it.
 */

test('every loadout report balances its own books', () => {
  for (const loadout of loadouts) {
    const report = runBalance(loadout);
    const where = `loadout "${loadout.name}"`;

    assert.equal(
      report.cyclesEnd,
      STARTING_CYCLES + report.totalEarned - report.totalSpent,
      `${where}: banked Cycles should be what was started with, plus kills, minus purchases`,
    );
    assert.equal(
      report.totalEarned,
      report.waves.reduce((total, wave) => total + wave.earned, 0),
      `${where}: the wave rows should account for every Cycle earned`,
    );
    assert.equal(
      report.totalSpent,
      report.waves.reduce((total, wave) => total + wave.spent, 0),
      `${where}: the wave rows should account for every Cycle spent`,
    );

    assert.equal(
      report.totalLeaks,
      report.waves.reduce((total, wave) => total + wave.leaks, 0),
      `${where}: the wave rows should account for every leak`,
    );
    assert.equal(report.coreHealth, MAX_CORE_HEALTH - report.totalLeaks, `${where}: core HP is leaks subtracted`);
    assert.notEqual(report.status, 'timeout', `${where}: the run should reach an ending, not the tick cap`);
    assert.equal(report.waves[0].wave, 1, `${where}: reports start at wave 1`);
  }
});

test('an undefended board loses - a curve nobody has to answer is not a curve', () => {
  const bare = findLoadout('bare');
  assert.ok(bare, 'the bare baseline loadout should exist');

  const report = runBalance(bare);
  assert.equal(report.status, 'lost');
  assert.equal(report.coreHealth, 0);
  assert.equal(report.totalSpent, 0);
});

test('the build order is an order: an entry it cannot afford blocks the ones behind it', () => {
  // The AES ladder costs 210 against 100 starting Cycles, so the Firewall behind it
  // is affordable from the first tick and must still wait its turn.
  const queued: Loadout = {
    name: 'queued',
    note: 'test fixture',
    builds: [
      { kind: 'aesTurret', x: 5, y: 3, tier: 3 },
      { kind: 'firewallNode', x: 2, y: 3 },
    ],
  };

  const report = runBalance(queued);
  const bought = report.waves.flatMap((wave) => wave.bought);
  const firewallCost = towerStats('firewallNode').cost;

  assert.ok(bought.includes(`${towerStats('aesTurret').name} T1`), 'the AES Turret at the head of the order should go up');
  assert.ok(
    !bought.some((entry) => entry.startsWith(towerStats('firewallNode').name)),
    'the Firewall Node jumped the queue past an AES Turret that never finished its ladder',
  );
  // Not a vacuous pass: the run ends holding more than the Firewall costs, so it was
  // affordable for waves and correctly refused anyway.
  assert.ok(report.cyclesEnd >= firewallCost, 'the run should end holding more than the blocked Firewall costs');
  assert.equal(report.unbought.length, 2, 'both the unfinished ladder and the entry behind it stay unbought');
});

test('the same loadout reports the same run twice', () => {
  for (const loadout of loadouts) {
    assert.deepEqual(runBalance(loadout), runBalance(loadout), `loadout "${loadout.name}" is not reproducible`);
  }
});

test('the run-wide scalar is off by default, and off means identical', () => {
  // The scalar is a field on `GameState` that the game never sets, so the whole game is
  // riding the default. If 1x ever stopped meaning "the shipped curve" the harness would
  // be measuring something nobody plays, and every margin below would be a margin from
  // the wrong place.
  for (const loadout of loadouts) {
    assert.deepEqual(
      runBalance(loadout, { hpScale: 1 }),
      runBalance(loadout),
      `loadout "${loadout.name}" reads differently at an explicit 1x`,
    );
  }
});

test('the margin bisect brackets the threshold it reports', () => {
  // The one thing a bisect can get wrong that still looks like an answer: returning a
  // number nothing actually happens at. So the reported threshold is checked from both
  // sides - the run breaks at it, and does not break a few percent under it. That also
  // catches the monotonicity assumption failing badly enough to matter, which is the
  // caveat written on `bisect` and the reason it is worth checking rather than trusting.
  const veteran = findLoadout('veteran');
  assert.ok(veteran, 'the veteran line should exist - it is the yardstick');

  const margin = runMargin(veteran);
  assert.ok(margin.firstLeak !== null, 'a curve nothing can be made to leak against is not a curve');
  assert.ok(margin.loss !== null, `the curve should be able to kill the best board inside ${MARGIN_MAX}x`);
  assert.ok(margin.loss >= margin.firstLeak, 'losing the core is five leaks, so it cannot come first');

  assert.ok(runBalance(veteran, { hpScale: margin.firstLeak }).totalLeaks > 0, 'no leak at the reported leak threshold');
  assert.ok(runBalance(veteran, { hpScale: margin.loss }).status === 'lost', 'no loss at the reported loss threshold');

  // Under the threshold, nothing yet - the check that the number is a threshold rather
  // than just some multiplier where the thing is true.
  if (margin.firstLeak > MARGIN_MIN) {
    assert.equal(runBalance(veteran, { hpScale: margin.firstLeak * 0.97 }).totalLeaks, 0, 'it leaked below its leak threshold');
  }
});

test('the curve draws blood from the best declared board, and does not kill it', () => {
  // The margin *band*, which is the design rule the retune aimed at and the one thing
  // here that is about the curve rather than about the instrument. It is a band and not
  // a number on purpose: the exact margins are a reading and are meant to move, but a
  // curve the best board clears untouched is the "too easy" this milestone exists to
  // answer, and a curve that kills it outright has no room left for a player who is
  // worse than a script in some ways and much better in others - the harness never
  // changes its mind and never fires Overclock.
  const veteran = findLoadout('veteran')!;
  const margin = runMargin(veteran);

  assert.ok(margin.firstLeak! < 1, `the shipped curve never makes the best board bleed - it leaks only at ${margin.firstLeak}x`);
  assert.ok(margin.loss! > 1, `the shipped curve kills the best board outright, at ${margin.loss}x`);

  // And where it breaks matters as much as when. A run whose weakest link is the opening
  // is decided before the player has made a decision, which is what the first reading off
  // this instrument found: the best board died at wave 2, on the rounding cliff where a
  // 3 HP Worm becomes a 4 HP Worm, and no amount of tuning act two could show up in the
  // number until act two could break it first.
  assert.ok(
    margin.lossWave! > waveCountOfActOne,
    `the run is decided at wave ${margin.lossWave}, before act two - the difficulty is in the wrong half`,
  );
});

/** Act one is the vocabulary, 1-8; act two is where the run should be decided. See `wave.ts`. */
const waveCountOfActOne = 8;
