import test from 'node:test';
import assert from 'node:assert/strict';
import { findLoadout, loadouts, runBalance } from '../src/balance.ts';
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
