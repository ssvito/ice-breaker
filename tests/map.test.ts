import test from 'node:test';
import assert from 'node:assert/strict';
import { buildableTileSet, levels, pathLength, rasterizePath } from '../src/map.ts';
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

test('level 2 folds back, and a tower in the corridor covers both lanes', () => {
  // The axis of the board, gated rather than trusted to the drawing. Two things have to
  // be true together: a leg that travels backwards, and a buildable tile with trace one
  // row above it *and* one row below. Either alone is a different board - a backwards leg
  // far from its outbound one is a longer level 1, and two lanes with no gap between them
  // are one thick lane nobody can build in.
  const level = levels[1];
  const backwards = level.waypoints.some((to, i) => i > 0 && to.x < level.waypoints[i - 1].x);
  assert.ok(backwards, 'level 2 has no leg that runs back');

  const trace = new Set(rasterizePath(level.waypoints).map((tile) => `${tile.x},${tile.y}`));
  const buildable = buildableTileSet(level);
  const straddling = [...buildable].filter((key) => {
    const [x, y] = key.split(',').map(Number);
    return trace.has(`${x},${y - 1}`) && trace.has(`${x},${y + 1}`);
  });
  // Five each on rows 3 and 5, which is what "widened from one column to five" means as
  // a number. Level 1's own overlap column is its connector tile, so it scores zero here
  // and the assertion is deliberately about level 2 alone.
  assert.equal(straddling.length, 10, `straddling tiles: ${straddling.join(' ')}`);

  // The cost, asserted so it cannot drift quietly: every column the fold walks back is
  // paid for twice, and trace length is difficulty under one global curve.
  assert.equal(pathLength(levels[0].waypoints), 19);
  assert.equal(pathLength(level.waypoints), 29);
});
