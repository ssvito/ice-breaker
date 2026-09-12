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

/** How many times the trace reverses its vertical direction. Level 1 never does. */
function verticalReversals(level: LevelData): number {
  const steps = level.waypoints
    .slice(1)
    .map((to, i) => Math.sign(to.y - level.waypoints[i].y))
    .filter((step) => step !== 0);
  return steps.slice(1).filter((step, i) => step !== steps[i]).length;
}

test('level 2 doubles back, and it does it on the vertical axis', () => {
  // The axis of the board, gated rather than trusted to the drawing. What makes an S an S
  // is that it reverses: down, up, down. Level 1's turns all go the same way, so it scores
  // zero here and could not pass this by accident.
  //
  // **And the trace never goes backwards in x**, which is worth asserting rather than just
  // noting: it is what makes the S cheaper than a horizontal fold (27 tiles against 29 for
  // a five-column one), because a column walked back is paid for twice and a row is not.
  const level = levels[1];
  assert.ok(verticalReversals(level) >= 2, `level 2 reverses vertically ${verticalReversals(level)} times`);
  assert.equal(verticalReversals(levels[0]), 0, 'level 1 was supposed to be the board that never doubles back');

  for (let i = 1; i < level.waypoints.length; i++) {
    assert.ok(
      level.waypoints[i].x >= level.waypoints[i - 1].x,
      `segment ${i} runs backwards - the S is meant to cost rows, not columns`,
    );
  }
});

test('the inside of a bend is worth more than anywhere on level 1', () => {
  // The board's whole thesis as a number. An elbow tile sees trace running two ways at
  // once - the leg coming in and the leg going out - so it covers two stretches where a
  // tile beside a straight leg covers one.
  //
  // Asserted as a comparison rather than as a constant, because the constant is a reading
  // and readings are meant to move. What must not move is the direction: a level 2 whose
  // best tile is no better than level 1's is a longer level 1, and the milestone would
  // have shipped a drawing instead of a board.
  const elbows = [...buildableTileSet(levels[1])].filter((key) => {
    const [x, y] = key.split(',').map(Number);
    const near = rasterizePath(levels[1].waypoints).filter((t) => Math.hypot(t.x - x, t.y - y) <= REACH);
    return (
      near.some((t) => t.x < x) && near.some((t) => t.x > x) && near.some((t) => t.y < y) && near.some((t) => t.y > y)
    );
  });
  assert.ok(elbows.length >= 16, `only ${elbows.length} tiles see the trace on all four sides`);
  assert.ok(
    bestTile(levels[1]) > bestTile(levels[0]),
    `the bends buy nothing: best tile covers ${bestTile(levels[1])} against level 1's ${bestTile(levels[0])}`,
  );
});

test('level 2 enters and leaves level with itself', () => {
  // The player's constraint, and the shape reads as an S because of it: in and out at the
  // same height on opposite edges, so everything between them is the detour. Gated so a
  // later edit cannot quietly turn it back into a diagonal sweep, which is a different
  // board wearing the same waypoints.
  const trace = rasterizePath(levels[1].waypoints);
  const first = trace[0];
  const last = trace[trace.length - 1];

  assert.equal(first.x, 0, 'spawn is not on the left edge');
  assert.equal(last.x, levels[1].cols - 1, 'the core is not on the right edge');
  assert.equal(first.y, last.y, 'spawn and core are not at the same height');
});

test('the detour costs trace, and the trace is not what costs the player', () => {
  // Both halves of this milestone's central finding, as numbers that cannot drift.
  //
  // The cost: level 1's trace is a minimal path from edge to edge, so every row the S
  // spends going somewhere it has already been is paid for twice. There is no second
  // board at level 1's length.
  assert.equal(pathLength(levels[0].waypoints), 19);
  assert.equal(pathLength(levels[1].waypoints), 27);

  // And what it does not cost: this board was drawn three times over the milestone - a
  // 29-tile horizontal fold that cleared the curve untouched, a 29-tile corner sweep that
  // bled at 0.79x, and this 27-tile S at 0.96x. Two of them were the same length and the
  // furthest apart in difficulty, and the shortest is not the easiest. Length is not the
  // dial. The control that says what is lives in `balance.test.ts`.
  assert.ok(
    pathLength(levels[1].waypoints) > pathLength(levels[0].waypoints),
    'level 2 is meant to be the longer trace - if it is not, the finding above needs re-reading',
  );
});
