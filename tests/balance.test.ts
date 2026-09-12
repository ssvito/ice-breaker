import test from 'node:test';
import assert from 'node:assert/strict';
import { boards, findLoadout, MARGIN_MAX, MARGIN_MIN, runBalance, runMargin } from '../src/balance.ts';
import type { Board, Loadout } from '../src/balance.ts';
import { buildableTileSet, levels, rasterizePath, REACH } from '../src/map.ts';
import { RUNS } from '../src/runs.ts';
import { MAX_CORE_HEALTH, STARTING_CYCLES } from '../src/game.ts';
import { towerStats } from '../src/tower.ts';

/**
 * The harness is a measuring instrument, so what these gate is not whether a
 * loadout wins - that is the reading, and it is meant to change every time the
 * curve is tuned - but whether the instrument is telling the truth. A report whose
 * economy does not add up would send the wave curve off in the wrong direction and
 * look authoritative doing it.
 *
 * Everything here runs over **every declared board**, because v1.8 made a report a claim
 * about a board as well as about a curve, and an instrument that is honest on one map and
 * not the other is worse than no instrument.
 */

/** Every board's every layout, as the pairs a reading is actually made of. */
const all: { board: Board; loadout: Loadout }[] = boards.flatMap((board) =>
  board.loadouts.map((loadout) => ({ board, loadout })),
);

/** The board the curve is tuned against, and the yardstick every margin is read from. */
const MAINFRAME = boards[0];

test('every loadout report balances its own books', () => {
  for (const { board, loadout } of all) {
    const report = runBalance(loadout, { level: board.level });
    const where = `${board.id} / "${loadout.name}"`;

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

test('an undefended board loses, on every board - a curve nobody has to answer is not a curve', () => {
  for (const board of boards) {
    const bare = findLoadout(board, 'bare');
    assert.ok(bare, `${board.id} should declare the bare baseline`);

    const report = runBalance(bare, { level: board.level });
    assert.equal(report.status, 'lost', `${board.id}: an empty board survived the curve`);
    assert.equal(report.coreHealth, 0);
    assert.equal(report.totalSpent, 0);
  }
});

test('every board declares the same layout names, so a pair is a controlled comparison', () => {
  // `veteran` against `veteran` is only a statement about the two boards if everything
  // else is held still. A name declared on one board and missing on the other would make
  // half the table a comparison and the other half a gap nobody notices.
  const names = MAINFRAME.loadouts.map((loadout) => loadout.name);
  for (const board of boards) {
    assert.deepEqual(board.loadouts.map((loadout) => loadout.name), names, `${board.id} declares different layouts`);
  }
});

test('the harness and the game agree on what a board is', () => {
  // Two lists in two files: `boards` here, `RUNS` in the shell's own module. They are
  // kept apart on purpose - the harness has no business importing the picker - and the
  // cost of that is this gate. An id that drifts silently files a report under a board
  // whose records live somewhere else.
  assert.deepEqual(
    boards.map((board) => board.id),
    RUNS.map((run) => run.id),
    'the harness measures a different set of boards than the shell can start',
  );
  for (const board of boards) {
    assert.ok(levels.includes(board.level), `${board.id} measures a map that no map gate runs over`);
  }
});

test('every layout is legal on the board it is declared for', () => {
  // A build the rules refuse is not a failed run, it is a **blocked build order** - the
  // entry sits there forever and every entry behind it waits with it, so the report reads
  // as a layout that could not afford itself. That is the quietest way to mis-tune a
  // curve, and it is exactly what a tile copied from the other board looks like.
  for (const { board, loadout } of all) {
    const report = runBalance(loadout, { level: board.level, hpScale: 0.25 });
    assert.deepEqual(
      report.unbought,
      [],
      `${board.id} / "${loadout.name}": entries never bought even against the weakest curve - an illegal tile blocks the order`,
    );
  }
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
  for (const { board, loadout } of all) {
    assert.deepEqual(
      runBalance(loadout, { level: board.level }),
      runBalance(loadout, { level: board.level }),
      `${board.id} / "${loadout.name}" is not reproducible`,
    );
  }
});

test('the run-wide scalar is off by default, and off means identical', () => {
  // The scalar is a field on `GameState` that the game never sets, so the whole game is
  // riding the default. If 1x ever stopped meaning "the shipped curve" the harness would
  // be measuring something nobody plays, and every margin below would be a margin from
  // the wrong place.
  for (const { board, loadout } of all) {
    assert.deepEqual(
      runBalance(loadout, { level: board.level, hpScale: 1 }),
      runBalance(loadout, { level: board.level }),
      `${board.id} / "${loadout.name}" reads differently at an explicit 1x`,
    );
  }
});

test('the margin bisect brackets the threshold it reports', () => {
  // The one thing a bisect can get wrong that still looks like an answer: returning a
  // number nothing actually happens at. So the reported threshold is checked from both
  // sides - the run breaks at it, and does not break a few percent under it. That also
  // catches the monotonicity assumption failing badly enough to matter, which is the
  // caveat written on `bisect` and the reason it is worth checking rather than trusting.
  const veteran = findLoadout(MAINFRAME, 'veteran');
  assert.ok(veteran, 'the veteran line should exist - it is the yardstick');

  const margin = runMargin(veteran, { level: MAINFRAME.level });
  assert.ok(margin.firstLeak !== null, 'a curve nothing can be made to leak against is not a curve');
  assert.ok(margin.loss !== null, `the curve should be able to kill the best board inside ${MARGIN_MAX}x`);
  assert.ok(margin.loss >= margin.firstLeak, 'losing the core is five leaks, so it cannot come first');

  const at = (hpScale: number) => runBalance(veteran, { level: MAINFRAME.level, hpScale });
  assert.ok(at(margin.firstLeak).totalLeaks > 0, 'no leak at the reported leak threshold');
  assert.ok(at(margin.loss).status === 'lost', 'no loss at the reported loss threshold');

  // Under the threshold, nothing yet - the check that the number is a threshold rather
  // than just some multiplier where the thing is true.
  if (margin.firstLeak > MARGIN_MIN) {
    assert.equal(at(margin.firstLeak * 0.97).totalLeaks, 0, 'it leaked below its leak threshold');
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
  const veteran = findLoadout(MAINFRAME, 'veteran')!;
  const margin = runMargin(veteran, { level: MAINFRAME.level });

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

/**
 * **The band above is scoped to MAINFRAME 01 on purpose, and this is the reason.**
 *
 * That gate says the shipped curve must draw blood from the best declared board and must
 * not kill it. It is a statement about the *curve*, and the curve is tuned against the
 * board it was written for. RECURSION 02 runs the same curve on a different shape, and
 * while it does now bleed under 1x, holding a second board to the first board's exact
 * band would only ever be satisfied by flattening the second into the first.
 *
 * What is gated here instead is the thing that is actually true of the S, and it is a
 * stronger claim than any margin: **the bends are the board.** Same trace, same Cycles,
 * same order, every gun moved at most two tiles to the dullest tile near it - and the run
 * loses the core, first leaking at roughly level 1's own number on a trace eight tiles
 * longer. That is the measurement that overturned this milestone's premise, and it
 * survived the board being redrawn twice, so it is the one worth keeping under a test.
 */
test('on the S, the bends are worth the run - and off them the board is no easier than level 1', () => {
  const fold = boards[1];
  const inside = findLoadout(fold, 'veteran')!;

  /** How much trace a tower here would cover, at opening range. */
  const coverage = (x: number, y: number) =>
    rasterizePath(fold.level.waypoints).filter((t) => Math.hypot(t.x - x, t.y - y) <= REACH).length;

  /**
   * The same neighbourhood, the wrong tile: the least useful buildable tile within two of
   * where the veteran line put this gun, never reusing one. A rule rather than a hand-
   * picked list, so the control cannot be accused of being drawn to lose - and a short
   * leash, so it is still a line a player could plausibly build rather than a line that
   * abandoned the trace.
   */
  const taken = new Set<string>();
  const moved = new Map<string, { x: number; y: number }>();
  function dullestNear(x: number, y: number): { x: number; y: number } {
    const key = `${x},${y}`;
    const already = moved.get(key);
    if (already) return already;

    let best = { x, y };
    let bestCover = Infinity;
    for (const tile of buildableTileSet(fold.level)) {
      if (taken.has(tile)) continue;
      const [tx, ty] = tile.split(',').map(Number);
      if (Math.hypot(tx - x, ty - y) > 2) continue;
      const cover = coverage(tx, ty);
      if (cover > 0 && cover < bestCover) {
        bestCover = cover;
        best = { x: tx, y: ty };
      }
    }
    taken.add(`${best.x},${best.y}`);
    moved.set(key, best);
    return best;
  }

  const outside: Loadout = {
    name: 'outside',
    note: 'the veteran line with every gun nudged off the bends',
    // Only the guns move. The Honeypot is an `onPath` tower, so sending it off the trace
    // would put it on a tile the rules refuse - and a refused build does not make a weaker
    // run, it **blocks the order behind it**, so the run would lose with 40 Cycles spent
    // and the test would be reading a jam as a reading. Leaving it put also tightens the
    // control: the slow is identical on both sides and the only variable left is where the
    // things that shoot are standing.
    builds: inside.builds.map((build) =>
      towerStats(build.kind).placement === 'onPath' ? build : { ...build, ...dullestNear(build.x, build.y) },
    ),
  };

  const withBends = runMargin(inside, { level: fold.level });
  const without = runMargin(outside, { level: fold.level });
  const outsideRun = runBalance(outside, { level: fold.level });

  assert.equal(runBalance(inside, { level: fold.level }).status, 'won', 'the elbow line should clear the curve');
  assert.equal(outsideRun.status, 'lost', 'the same Cycles two tiles away should lose');
  assert.ok(
    without.firstLeak! < withBends.firstLeak!,
    `the bends bought nothing: ${without.firstLeak}x off them against ${withBends.firstLeak}x on them`,
  );

  // It lost for being weak, not for jamming on a tile the rules refuse - without this the
  // assertion above passes for the wrong reason. Checked against a curve it can beat
  // comfortably, because that separates the two: an unaffordable build is a run that did
  // not earn enough, an illegal one is unbought at any wealth.
  assert.deepEqual(
    runBalance(outside, { level: fold.level, hpScale: 0.25 }).unbought,
    [],
    'the off-bend line stands on a tile the rules refuse, so it proves nothing',
  );

  // And the half of it that is about the trace rather than the bends: eight more tiles of
  // path, on their own, are worth nothing. Trace that no tower covers is not time under
  // fire, it is enemies walking for free - which is why this board's length was allowed to
  // grow at all.
  const mainframe = runMargin(findLoadout(MAINFRAME, 'veteran')!, { level: MAINFRAME.level });
  assert.ok(
    without.firstLeak! <= mainframe.firstLeak! * 1.15,
    `the extra trace made the board easier by itself: ${without.firstLeak}x against level 1's ${mainframe.firstLeak}x`,
  );
});
