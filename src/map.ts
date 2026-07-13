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
