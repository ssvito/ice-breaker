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
 * Level 1 always moves right and always turns the same way: three legs, each further
 * along than the last, so a tower covers the stretch of trace it happens to sit beside
 * and the only lever the player has is how many of them there are. This one is an **S**.
 * Spawn and core sit opposite each other in the middle of the left and right edges, and
 * between x=3 and x=12 the trace doubles back on itself vertically - down, then all the
 * way up, then down again. What that builds is **two elbows**, and the inside of an elbow
 * is a tile that covers two stretches of trace running at right angles to each other. The
 * question stops being *how many* and becomes *where*.
 *
 * Same 16x9 as level 1, because the shape carries the difference and the size does not,
 * and a differently-*sized* board is the one thing that would force `createViewport` to
 * be rebuilt rather than re-fitted.
 *
 * **Note what it does not do: it never goes backwards.** Every horizontal leg runs left
 * to right, and x never decreases. The doubling-back is entirely on the other axis, which
 * is why the long spine at x=7 climbs six rows in one segment. That makes the S cheaper
 * than a horizontal fold - 27 tiles of trace against the 29 a five-column fold costs -
 * and it is still the most expensive thing on the board, since level 1 needs only 19.
 *
 * **What it cost to get here, because the board was drawn three times.** The first draft
 * was a horizontal fold with the legs two rows apart, and it cleared the whole curve
 * without taking a scratch: **1.15x to first blood against level 1's 0.65x**. The second
 * ran corner to corner, which forced the legs four rows apart and read **0.79x**. This
 * one, the player's, reads **0.96x to first blood and 1.17x to the loss** against level
 * 1's 0.65x and 1.14x - it bleeds before the shipped curve does, which is the gate this
 * project holds a board to, and it dies at almost exactly the same place level 1 does.
 * It is the more forgiving of the two boards up to that point, and that is a trade taken
 * with the numbers on the table.
 *
 * **The through-line across all three drawings: length is not difficulty.** Draft one and
 * draft two were both 29 tiles and differed by 0.36x; this one is *shorter* than both and
 * lands between them. What a board costs the player is coverage - how much of the trace a
 * tower budget can be made to reach at once - and trace that nothing covers is enemies
 * walking for free. The control that established it is in `balance.test.ts`; the v1.8
 * notes in the Roadmap carry the rest.
 */
export const level2: LevelData = {
  cols: 16,
  rows: 9,
  waypoints: [
    { x: 0, y: 4 },
    { x: 3, y: 4 },
    { x: 3, y: 7 },
    { x: 7, y: 7 },
    { x: 7, y: 1 },
    { x: 12, y: 1 },
    { x: 12, y: 4 },
    { x: 15, y: 4 },
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
