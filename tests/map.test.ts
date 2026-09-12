import test from 'node:test';
import assert from 'node:assert/strict';
import { buildableTileSet, levels, pathLength, rasterizePath, REACH } from '../src/map.ts';
import type { LevelData } from '../src/map.ts';
import { RUNS } from '../src/runs.ts';

/**
 * What makes a board a board, gated over **every declared map** rather than over the one
 * that was just added. A map is plain data with no constructor to validate it, so the way
 * a broken one arrives is silently: the trace still draws, the enemies still walk, and
 * what is wrong is a tile that is stepped on twice or a core that is not where the run
 * ends. Same argument as v1.6's sprite and roster gates - the thing that breaks a map is
 * silence, not an exception.
 *
 * The list comes from `map.ts` itself, not from a list retyped here, so a third board is
 * gated by existing rather than by somebody remembering this file.
 */

function name(level: LevelData, index: number): string {
  return `level ${index + 1} (${level.cols}x${level.rows})`;
}

test('every declared map is on the grid it declares', () => {
  levels.forEach((level, index) => {
    for (const tile of rasterizePath(level.waypoints)) {
      assert.ok(
        tile.x >= 0 && tile.x < level.cols && tile.y >= 0 && tile.y < level.rows,
        `${name(level, index)}: trace leaves the grid at ${tile.x},${tile.y}`,
      );
    }
  });
});

test('every segment is axis-aligned', () => {
  // `rasterizePath` walks dx and dy together, so a diagonal waypoint pair does not draw
  // a diagonal - it draws a staircase and then keeps stepping past the target until the
  // loop happens to land on it, or forever. The renderer would show a trace that looks
  // deliberate, which is the worst version of this bug.
  levels.forEach((level, index) => {
    for (let i = 1; i < level.waypoints.length; i++) {
      const from = level.waypoints[i - 1];
      const to = level.waypoints[i];
      assert.ok(
        (from.x === to.x) !== (from.y === to.y),
        `${name(level, index)}: segment ${i} is diagonal or zero-length`,
      );
    }
  });
});

test('no map steps on the same tile twice', () => {
  // The rule the fold in level 2 exists to bend without breaking: the trace may run back
  // alongside itself, but it may never run back *over* itself. A revisited tile is two
  // lanes of enemies drawn on one tile, a buildable set with a hole in it, and a distance
  // along the path that no longer maps to one place on the board.
  levels.forEach((level, index) => {
    const tiles = rasterizePath(level.waypoints);
    const unique = new Set(tiles.map((tile) => `${tile.x},${tile.y}`));
    assert.equal(unique.size, tiles.length, `${name(level, index)}: the trace crosses itself`);
  });
});

test('every map spawns on the left edge and ends on the right', () => {
  levels.forEach((level, index) => {
    const first = level.waypoints[0];
    const last = level.waypoints[level.waypoints.length - 1];
    assert.equal(first.x, 0, `${name(level, index)}: spawn is not on the left edge`);
    assert.equal(last.x, level.cols - 1, `${name(level, index)}: the core is not on the right edge`);
  });
});

test('every map leaves enough board to build on', () => {
  // Not a style rule. The economy is tuned against a board where the opening buy has
  // somewhere to go, and a trace that ate the grid would report as a curve that got hard.
  levels.forEach((level, index) => {
    const buildable = buildableTileSet(level);
    assert.ok(
      buildable.size >= level.cols * level.rows * 0.5,
      `${name(level, index)}: only ${buildable.size} buildable tiles`,
    );
  });
});

test('every run points at a declared map, under its own id', () => {
  // Two halves of the same claim. A run whose map is not in `levels` is a board nothing
  // gates; two runs sharing an id are two boards sharing a record, which is the exact
  // failure `recordKey` was widened to prevent.
  const ids = new Set<string>();
  for (const run of RUNS) {
    assert.ok(levels.includes(run.map), `run ${run.id} is on a map no gate runs over`);
    assert.ok(!ids.has(run.id), `run id ${run.id} is used twice`);
    ids.add(run.id);
  }
});

/** How much trace a tower standing on this tile would cover, at opening range. */
function coverage(level: LevelData, x: number, y: number): number {
  return rasterizePath(level.waypoints).filter((tile) => Math.hypot(tile.x - x, tile.y - y) <= REACH).length;
}

/** The best tile a board offers, in trace tiles covered. The board's ceiling, as a number. */
function bestTile(level: LevelData): number {
  return Math.max(...[...buildableTileSet(level)].map((key) => {
    const [x, y] = key.split(',').map(Number);
    return coverage(level, x, y);
  }));
}

test('level 2 folds back, and a tower between the lanes covers both', () => {
  // The axis of the board, gated rather than trusted to the drawing. Two things have to
  // be true together: a leg that travels backwards, and tiles that reach trace on both
  // sides of themselves. Either alone is a different board - a backwards leg far from its
  // outbound one is a longer level 1, and two lanes with no gap are one thick lane nobody
  // can build in.
  //
  // Reach, not adjacency. The first draft of this board put its legs two rows apart, where
  // "covers both" meant "one row above and one row below" and could be gated by counting
  // neighbours. The corners moved them four rows apart, which is the whole reason the
  // board works - so what has to be asserted is what a *tower* can see, which is the thing
  // that was really being measured all along.
  const level = levels[1];
  const backwards = level.waypoints.some((to, i) => i > 0 && to.x < level.waypoints[i - 1].x);
  assert.ok(backwards, 'level 2 has no leg that runs back');

  const trace = rasterizePath(level.waypoints);
  const straddling = [...buildableTileSet(level)].filter((key) => {
    const [x, y] = key.split(',').map(Number);
    const sees = (dir: number) =>
      trace.some((tile) => Math.sign(tile.y - y) === dir && Math.hypot(tile.x - x, tile.y - y) <= REACH);
    return sees(-1) && sees(1);
  });
  assert.ok(straddling.length >= 20, `only ${straddling.length} tiles see trace on both sides`);

  // And the fold has to actually pay, which is the claim a count cannot make on its own:
  // level 1's legs meet at their turns too, but a tower there catches a sliver of each.
  assert.ok(
    bestTile(level) > bestTile(levels[0]),
    `the fold buys nothing: best tile covers ${bestTile(level)} against level 1's ${bestTile(levels[0])}`,
  );
});

test('level 2 runs corner to corner and uses every row', () => {
  // The player's constraint, and it turned out to be the load-bearing one. Reaching both
  // corners forces the three legs four rows apart instead of two, and that is what took
  // the board from clearing the curve untouched to taking a leak at 1x like level 1 does.
  // Gated so it cannot drift back: a later edit that pulls the legs inward would quietly
  // hand the fold its old strength back, and nothing else here would notice.
  const level = levels[1];
  const trace = rasterizePath(level.waypoints);
  const first = trace[0];
  const last = trace[trace.length - 1];

  assert.deepEqual({ x: first.x, y: first.y }, { x: 0, y: 0 }, 'spawn is not the top-left corner');
  assert.deepEqual({ x: last.x, y: last.y }, { x: 15, y: 8 }, 'the core is not the bottom-right corner');

  const rows = new Set(trace.map((tile) => tile.y));
  assert.equal(rows.size, level.rows, `the trace uses ${rows.size} of ${level.rows} rows`);
});

test('the fold costs trace, and the trace is not what costs the player', () => {
  // Both halves of this milestone's central finding, as numbers that cannot drift.
  //
  // The cost: spawn and core are on opposite edges, so the trace owes 15 columns whatever
  // it does, and every column the middle leg walks back is paid for twice. There is no
  // fold at level 1's length.
  assert.equal(pathLength(levels[0].waypoints), 19);
  assert.equal(pathLength(levels[1].waypoints), 29);

  // And what it does not cost: this board was 29 tiles in its first draft too, with the
  // legs two rows apart, and it cleared the curve without taking a scratch. Same length,
  // same curve, different difficulty - so the ten extra tiles are not what a player pays.
  // Coverage is. The control that established it lives in `balance.test.ts`.
  assert.equal(levels[1].waypoints[2].y - levels[1].waypoints[0].y, 4, 'the legs are no longer four rows apart');
});
