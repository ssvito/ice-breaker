import type { Enemy } from './enemy.ts';
import type { GridPos, LevelData } from './map.ts';
import { positionAlongPath, rasterizePath } from './map.ts';
import type { Tower } from './tower.ts';
import type { Projectile } from './projectile.ts';

export const palette = {
  background: '#0a0e14',
  gridLine: 'rgba(255, 255, 255, 0.05)',
  traceInactive: '#22e1ff',
  spawn: '#39ff88',
  core: '#ff2fd1',
  enemy: '#ffcc00',
  tower: '#eaffff',
  projectile: '#ff2fd1',
  placeValid: 'rgba(57, 255, 136, 0.35)',
  placeInvalid: 'rgba(255, 47, 88, 0.35)',
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

export function drawTowers(ctx: CanvasRenderingContext2D, towers: Tower[], tileSize: number): void {
  const size = tileSize * 0.7;
  const offset = (tileSize - size) / 2;

  ctx.fillStyle = palette.tower;
  for (const tower of towers) {
    ctx.fillRect(tower.x * tileSize + offset, tower.y * tileSize + offset, size, size);
  }
}

export function drawPlacementPreview(
  ctx: CanvasRenderingContext2D,
  hover: GridPos,
  valid: boolean,
  range: number,
  tileSize: number,
): void {
  const cx = hover.x * tileSize + tileSize / 2;
  const cy = hover.y * tileSize + tileSize / 2;

  ctx.fillStyle = valid ? palette.placeValid : palette.placeInvalid;
  ctx.fillRect(hover.x * tileSize, hover.y * tileSize, tileSize, tileSize);

  if (!valid) return;

  ctx.strokeStyle = palette.tower;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.arc(cx, cy, range * tileSize, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawProjectiles(
  ctx: CanvasRenderingContext2D,
  projectiles: Projectile[],
  tileSize: number,
): void {
  const radius = tileSize * 0.1;

  ctx.fillStyle = palette.projectile;
  for (const projectile of projectiles) {
    ctx.beginPath();
    ctx.arc(projectile.x * tileSize, projectile.y * tileSize, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawHud(
  ctx: CanvasRenderingContext2D,
  level: LevelData,
  tileSize: number,
  coreHealth: number,
  maxCoreHealth: number,
  gameOver: boolean,
): void {
  const width = level.cols * tileSize;
  const height = level.rows * tileSize;

  ctx.fillStyle = '#e8f9ff';
  ctx.font = `${Math.max(12, tileSize * 0.5)}px monospace`;
  ctx.textBaseline = 'top';
  ctx.fillText(`CORE ${coreHealth}/${maxCoreHealth}`, 8, 8);

  if (!gameOver) return;

  ctx.fillStyle = 'rgba(10, 14, 20, 0.75)';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = palette.core;
  ctx.font = `bold ${tileSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GAME OVER', width / 2, height / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
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
