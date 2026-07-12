import type { Enemy, EnemyKind } from './enemy.ts';
import type { GridPos, LevelData } from './map.ts';
import { positionAlongPath, rasterizePath } from './map.ts';
import { towerCenter } from './tower.ts';
import type { Tower, TowerKind } from './tower.ts';
import type { Projectile } from './projectile.ts';
import { particleAlpha } from './effects.ts';
import type { GlitchParticle } from './effects.ts';

export const palette = {
  background: '#0a0e14',
  gridLine: 'rgba(255, 255, 255, 0.05)',
  traceInactive: '#22e1ff',
  spawn: '#39ff88',
  core: '#ff2fd1',
  tower: '#eaffff',
  projectile: '#ff2fd1',
  placeValid: 'rgba(57, 255, 136, 0.35)',
  placeInvalid: 'rgba(255, 47, 88, 0.35)',
} as const;

const ENEMY_VISUALS: Record<EnemyKind, { color: string; radiusScale: number }> = {
  worm: { color: '#ffcc00', radiusScale: 1 },
  trojan: { color: '#ff5f2e', radiusScale: 1.4 },
  packetSniffer: { color: '#fff9b0', radiusScale: 0.6 },
  ransomware: { color: '#ff4477', radiusScale: 1.1 },
  encryptor: { color: '#ff88aa', radiusScale: 0.7 },
  zeroDay: { color: '#f5f5ff', radiusScale: 2 },
};

const TOWER_VISUALS: Record<TowerKind, { color: string; sizeScale: number }> = {
  firewallNode: { color: '#eaffff', sizeScale: 1 },
  aesTurret: { color: '#ff3355', sizeScale: 1.25 },
  idsScanner: { color: '#7dffe8', sizeScale: 0.9 },
  honeypot: { color: '#ffe27d', sizeScale: 0.6 },
};

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
  for (const tower of towers) {
    const visual = TOWER_VISUALS[tower.kind];
    const size = tileSize * 0.7 * visual.sizeScale;
    const offset = (tileSize - size) / 2;

    ctx.globalAlpha = tower.overclock?.state === 'overheated' ? 0.4 : 1;
    ctx.fillStyle = visual.color;
    ctx.fillRect(tower.x * tileSize + offset, tower.y * tileSize + offset, size, size);
    ctx.globalAlpha = 1;

    if (tower.overclock?.state === 'boosted') {
      ctx.strokeStyle = '#fff9b0';
      ctx.lineWidth = 2;
      ctx.strokeRect(tower.x * tileSize + offset - 2, tower.y * tileSize + offset - 2, size + 4, size + 4);
      ctx.lineWidth = 1;
    }

    if (tower.slowMultiplier === undefined) continue;
    const center = towerCenter(tower);
    ctx.strokeStyle = visual.color;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(center.x * tileSize, center.y * tileSize, tower.range * tileSize, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export function drawPlacementPreview(
  ctx: CanvasRenderingContext2D,
  hover: GridPos,
  valid: boolean,
  range: number,
  tileSize: number,
  previewKind: TowerKind,
): void {
  const cx = hover.x * tileSize + tileSize / 2;
  const cy = hover.y * tileSize + tileSize / 2;

  ctx.fillStyle = valid ? palette.placeValid : palette.placeInvalid;
  ctx.fillRect(hover.x * tileSize, hover.y * tileSize, tileSize, tileSize);

  if (!valid) return;

  ctx.strokeStyle = TOWER_VISUALS[previewKind].color;
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

export function drawGlitchParticles(
  ctx: CanvasRenderingContext2D,
  particles: GlitchParticle[],
  tileSize: number,
): void {
  const size = tileSize * 0.15;

  for (const particle of particles) {
    ctx.globalAlpha = particleAlpha(particle);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x * tileSize - size / 2, particle.y * tileSize - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
}

export function drawHud(
  ctx: CanvasRenderingContext2D,
  level: LevelData,
  tileSize: number,
  coreHealth: number,
  maxCoreHealth: number,
  cycles: number,
  waveText: string,
  gameState: 'playing' | 'won' | 'lost',
): void {
  const width = level.cols * tileSize;
  const height = level.rows * tileSize;
  const fontSize = Math.max(12, tileSize * 0.5);

  ctx.fillStyle = '#e8f9ff';
  ctx.font = `${fontSize}px monospace`;
  ctx.textBaseline = 'top';
  ctx.fillText(`CORE ${coreHealth}/${maxCoreHealth}`, 8, 8);
  ctx.fillText(`CYCLES ${cycles}`, 8, 8 + fontSize * 1.2);
  ctx.fillText(waveText, 8, 8 + fontSize * 2.4);

  if (gameState === 'playing') return;

  const won = gameState === 'won';

  ctx.fillStyle = 'rgba(10, 14, 20, 0.75)';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = won ? palette.spawn : palette.core;
  ctx.font = `bold ${tileSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(won ? 'SYSTEM SECURED' : 'GAME OVER', width / 2, height / 2 - fontSize * 0.6);

  ctx.font = `${fontSize * 0.6}px monospace`;
  ctx.fillText('TAP TO RESTART', width / 2, height / 2 + fontSize * 0.8);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

export function drawEnemies(
  ctx: CanvasRenderingContext2D,
  enemies: Enemy[],
  waypoints: GridPos[],
  tileSize: number,
): void {
  for (const enemy of enemies) {
    const visual = ENEMY_VISUALS[enemy.kind];
    const pos = positionAlongPath(waypoints, enemy.distance);
    ctx.fillStyle = visual.color;
    ctx.beginPath();
    ctx.arc(
      pos.x * tileSize + tileSize / 2,
      pos.y * tileSize + tileSize / 2,
      tileSize * 0.3 * visual.radiusScale,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}
