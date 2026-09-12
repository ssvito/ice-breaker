export interface GridPos {
  x: number;
  y: number;
}

export interface LevelData {
  cols: number;
  rows: number;
  waypoints: GridPos[];
}

// v1 layout: 16x9 landscape grid, single serpentine trace, 4 turns.
export const level1: LevelData = {
  cols: 16,
  rows: 9,
  waypoints: [
    { x: 0, y: 2 },
    { x: 4, y: 2 },
    { x: 4, y: 4 },
    { x: 9, y: 4 },
    { x: 9, y: 6 },
    { x: 15, y: 6 },
  ],
};

/**
 * The second board, and it is a different *question* rather than a different squiggle.
 *
 * Level 1 always moves right: three legs, each one further along than the last, so a
 * tower covers the stretch of trace it happens to sit beside and the only lever the
 * player has is how many of them there are. Here the middle leg **runs backwards**, two
 * rows under the leg it came from, so the corridor between them is one tile from both
 * lanes at once and a single tower in it covers the trace twice. The question stops
 * being *how many* and becomes *where*.
 *
 * Not a new idea so much as an old hint made the point. Level 1's first two legs already
 * meet, at the single column x=4, and `VETERAN_BUILDS` in `balance.ts` has quietly built
 * on it since v1.3 - two Firewall Nodes on row 3. This board widens that from one column
 * to five: rows 3 and 5 each have five tiles with a lane above and a lane below.
 *
 * Same 16x9 grid on purpose. The shape carries the difference and the size does not, and
 * a differently-sized board is the one thing that would force `createViewport` to be
 * rebuilt rather than re-fitted.
 *
 * **What the fold costs, and what it turned out not to cost.** Spawn is on the left edge
 * and the core on the right, so the trace owes 15 columns of travel no matter what it
 * does; every column the middle leg walks back is paid for twice. Five columns of overlap
 * is therefore 29 tiles of trace against level 1's 19 - and there is no way around that,
 * because level 1's trace is already a minimal path and a fold of k columns costs 19+2k.
 *
 * The milestone predicted that this would be the board's problem: one global curve, so
 * more trace is more time under fire and the board would be easier for the length alone.
 * **That was measured and it is false.** Same 29-tile board, same Cycles, same build
 * order, one difference - the towers standing outside the corridor instead of in it - and
 * the run loses the core at 1x, first leaking at 0.65x, which is level 1's own number on
 * a trace ten tiles longer. Trace that nothing covers is not time under fire; it is
 * enemies walking for free. **Length is not difficulty here. Coverage is.**
 *
 * So the corridor is the whole of what makes this board a different board, and it is
 * worth an enormous amount: the same Cycles spent inside it clear the curve untouched.
 * This board is the more forgiving of the two *for a player who finds the fold*, and the
 * harsher of the two for one who does not. Shipped that way on the player's call, with
 * the narrower folds measured and turned down - see the v1.8 notes in the Roadmap.
 */
export const level2: LevelData = {
  cols: 16,
  rows: 9,
  waypoints: [
    { x: 0, y: 2 },
    { x: 10, y: 2 },
    { x: 10, y: 4 },
    { x: 5, y: 4 },
    { x: 5, y: 6 },
    { x: 15, y: 6 },
  ],
};

/**
 * Every board this project declares. The picker reads `RUNS`, not this - what this is
 * for is the gate in `tests/map.test.ts`, which has to be able to say "every map" rather
 * than "the maps someone remembered to list in the test". A board that breaks a rule
 * breaks it silently, so the list the rules run over is the list of boards itself.
 */
export const levels: LevelData[] = [level1, level2];

/** Expands waypoints into every grid tile the path passes through. */
export function rasterizePath(waypoints: GridPos[]): GridPos[] {
  const tiles: GridPos[] = [waypoints[0]];

  for (let i = 1; i < waypoints.length; i++) {
    const from = waypoints[i - 1];
    const to = waypoints[i];
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);

    let { x, y } = from;
    while (x !== to.x || y !== to.y) {
      x += dx;
      y += dy;
      tiles.push({ x, y });
    }
  }

  return tiles;
}

function distance(a: GridPos, b: GridPos): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pathLength(waypoints: GridPos[]): number {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    total += distance(waypoints[i - 1], waypoints[i]);
  }
  return total;
}

/** Tile-centered position (in grid units, matching towerCenter's convention) at a given distance travelled along the waypoint path. */
export function positionAlongPath(waypoints: GridPos[], distanceTravelled: number): GridPos {
  let remaining = distanceTravelled;

  for (let i = 1; i < waypoints.length; i++) {
    const from = waypoints[i - 1];
    const to = waypoints[i];
    const segmentLength = distance(from, to);

    if (remaining <= segmentLength) {
      const t = segmentLength === 0 ? 0 : remaining / segmentLength;
      return { x: from.x + (to.x - from.x) * t + 0.5, y: from.y + (to.y - from.y) * t + 0.5 };
    }
    remaining -= segmentLength;
  }

  const last = waypoints[waypoints.length - 1];
  return { x: last.x + 0.5, y: last.y + 0.5 };
}

/** Unit travel direction (one of the 4 axis-aligned steps) at a given distance along the path. */
export function directionAlongPath(waypoints: GridPos[], distanceTravelled: number): GridPos {
  let remaining = distanceTravelled;

  for (let i = 1; i < waypoints.length; i++) {
    const from = waypoints[i - 1];
    const to = waypoints[i];
    const segmentLength = distance(from, to);
    if (remaining <= segmentLength) {
      return { x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) };
    }
    remaining -= segmentLength;
  }

  const n = waypoints.length;
  const from = waypoints[n - 2];
  const to = waypoints[n - 1];
  return { x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) };
}

export function buildableTileSet(level: LevelData): Set<string> {
  const pathTiles = new Set(rasterizePath(level.waypoints).map((p) => `${p.x},${p.y}`));
  const buildable = new Set<string>();

  for (let y = 0; y < level.rows; y++) {
    for (let x = 0; x < level.cols; x++) {
      const key = `${x},${y}`;
      if (!pathTiles.has(key)) buildable.add(key);
    }
  }

  return buildable;
}
