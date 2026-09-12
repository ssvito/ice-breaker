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
 * player has is how many of them there are. Here the middle leg **runs backwards**, so
 * the band between it and the leg it came from is within reach of both lanes at once and
 * a single tower there covers the trace twice. The question stops being *how many* and
 * becomes *where*.
 *
 * Not a new idea so much as an old hint made the point. Level 1's legs already meet at
 * their turns, and `VETERAN_BUILDS` in `balance.ts` has quietly built on that since v1.3.
 * What is new is that here the two lanes run *parallel* for five columns rather than
 * touching at a corner, so a tower between them covers a stretch of each instead of a
 * sliver.
 *
 * **Corner to corner, and all nine rows.** Spawn is the top-left tile and the core the
 * bottom-right, and the legs sit on rows 0, 4 and 8 - which is the player's call and
 * turned out to be the thing that made the board work. Level 1 leaves four of its nine
 * rows completely empty; this one uses the whole grid. Same 16x9 as level 1, because the
 * shape carries the difference and the size does not, and a differently-*sized* board is
 * the one thing that would force `createViewport` to be rebuilt rather than re-fitted.
 *
 * **Why the corners are load-bearing and not decoration.** Reaching both edges forces the
 * three legs four rows apart instead of two, and that is the whole difficulty of the
 * board. A tower one row from a lane covers about 4.6 tiles of it; a tower two rows from
 * two lanes covers about 3 of each. So the fold still pays - it is still the best real
 * estate on the board - but it pays about 30% rather than about 100%. The first draft of
 * this board put the legs on rows 2, 4 and 6 and measured **1.15x to first blood against
 * level 1's 0.65x**: it cleared the curve untouched, which is the "one problem and a rest"
 * this milestone set out to avoid. Moved to the corners, with the fold pulled from five
 * columns to three, it reads **0.79x** and takes a leak at 1x like level 1 does.
 *
 * **And the trace is 29 either way**, which is the cleanest possible proof of the thing
 * this milestone spent a session establishing: length is not difficulty. The same 29 tiles
 * arranged two rows apart clear untouched and arranged four rows apart draw blood. What a
 * board costs the player is coverage, and trace nothing covers is enemies walking for
 * free. See the v1.8 notes in the Roadmap for the control that separated the two.
 */
export const level2: LevelData = {
  cols: 16,
  rows: 9,
  waypoints: [
    { x: 0, y: 0 },
    { x: 9, y: 0 },
    { x: 9, y: 4 },
    { x: 6, y: 4 },
    { x: 6, y: 8 },
    { x: 15, y: 8 },
  ],
};

/**
 * How far a tower reaches, for the one board property that is worth asserting: whether a
 * tile can cover two lanes at once. A Firewall Node opens at 2.5 grid units and this is
 * that number, named here because `map.ts` must not import the tower table - the tiles
 * are geometry and the tower is balance, and this is the one place the two touch.
 */
export const REACH = 2.5;

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
