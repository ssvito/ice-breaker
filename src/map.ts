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
