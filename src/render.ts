import type { Enemy } from './enemy.ts';
import type { GridPos, LevelData } from './map.ts';
import { positionAlongPath, rasterizePath } from './map.ts';

export const palette = {
  background: '#0a0e14',
  gridLine: 'rgba(255, 255, 255, 0.05)',
  traceInactive: '#22e1ff',
  spawn: '#39ff88',
  core: '#ff2fd1',
  enemy: '#ffcc00',
} as const;

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  level: LevelData,
  tileSize: number,
): void {
  const width = level.cols * tileSize;
  const height = level.rows * tileSize;

  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = palette.gridLine;
  ctx.lineWidth = 1;
  for (let x = 0; x <= level.cols; x++) {
    ctx.beginPath();
    ctx.moveTo(x * tileSize, 0);
    ctx.lineTo(x * tileSize, height);
    ctx.stroke();
  }
  for (let y = 0; y <= level.rows; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * tileSize);
    ctx.lineTo(width, y * tileSize);
    ctx.stroke();
  }

  const pathTiles = rasterizePath(level.waypoints);
  ctx.fillStyle = palette.traceInactive;
  for (const tile of pathTiles) {
    ctx.fillRect(tile.x * tileSize, tile.y * tileSize, tileSize, tileSize);
  }

  const spawn = level.waypoints[0];
  const core = level.waypoints[level.waypoints.length - 1];
  ctx.fillStyle = palette.spawn;
  ctx.fillRect(spawn.x * tileSize, spawn.y * tileSize, tileSize, tileSize);
  ctx.fillStyle = palette.core;
  ctx.fillRect(core.x * tileSize, core.y * tileSize, tileSize, tileSize);
}

export function drawEnemies(
  ctx: CanvasRenderingContext2D,
  enemies: Enemy[],
  waypoints: GridPos[],
  tileSize: number,
): void {
  const radius = tileSize * 0.3;

  ctx.fillStyle = palette.enemy;
  for (const enemy of enemies) {
    const pos = positionAlongPath(waypoints, enemy.distance);
    ctx.beginPath();
    ctx.arc(
      pos.x * tileSize + tileSize / 2,
      pos.y * tileSize + tileSize / 2,
      radius,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}
