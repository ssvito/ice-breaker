import type { Enemy } from './enemy.ts';
import type { GridPos, LevelData } from './map.ts';
import { positionAlongPath, directionAlongPath, rasterizePath } from './map.ts';
import type { Tower, TowerKind } from './tower.ts';
import type { Projectile } from './projectile.ts';
import { particleAlpha } from './effects.ts';
import type { GlitchParticle } from './effects.ts';
import { VIRTUAL_TILE, displayedSize } from './canvas.ts';
import type { Viewport } from './canvas.ts';
import { drawSprite, spriteSize } from './sprites.ts';
import type { SpriteName } from './sprites.ts';

export const palette = {
  background: '#0a0e14',
  gridLine: 'rgba(255, 255, 255, 0.05)',
  traceInactive: '#22e1ff',
  traceFill: '#0f3a44', // dim channel behind entities so bright sprites still read
  placeValid: 'rgba(57, 255, 136, 0.35)',
  placeInvalid: 'rgba(255, 47, 88, 0.35)',
  selection: '#e8f9ff',
} as const;

const TOWER_RING: Record<TowerKind, string> = {
  firewallNode: '#eaffff',
  aesTurret: '#ff90a8',
  idsScanner: '#7dffe8',
  honeypot: '#ffe27d',
};

const ANIM_FRAME_MS = 220;

/** Grid cell -> center point in virtual pixels. */
function tileCenter(gx: number, gy: number): { x: number; y: number } {
  return { x: (gx + 0.5) * VIRTUAL_TILE, y: (gy + 0.5) * VIRTUAL_TILE };
}

/**
 * Renders the static board (background, grid, trace, spawn port, core) into an
 * offscreen canvas once. Blit it each frame instead of redrawing. Requires the
 * sprite atlas to be baked first (spawn/core are sprites).
 */
export function prerenderBoard(level: LevelData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = level.cols * VIRTUAL_TILE;
  canvas.height = level.rows * VIRTUAL_TILE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for board');
  ctx.imageSmoothingEnabled = false;

  const width = canvas.width;
  const height = canvas.height;

  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = palette.gridLine;
  for (let x = 0; x <= level.cols; x++) ctx.fillRect(x * VIRTUAL_TILE, 0, 1, height);
  for (let y = 0; y <= level.rows; y++) ctx.fillRect(0, y * VIRTUAL_TILE, width, 1);

  const pathTiles = rasterizePath(level.waypoints);
  const pathSet = new Set(pathTiles.map((t) => `${t.x},${t.y}`));

  ctx.fillStyle = palette.traceFill;
  for (const tile of pathTiles) {
    ctx.fillRect(tile.x * VIRTUAL_TILE, tile.y * VIRTUAL_TILE, VIRTUAL_TILE, VIRTUAL_TILE);
  }

  // Rail only the edges a tile doesn't share with another path tile, so the
  // bright trace border follows the path (and turns corners) instead of banding
  // every tile top-and-bottom.
  ctx.fillStyle = palette.traceInactive;
  for (const tile of pathTiles) {
    const px = tile.x * VIRTUAL_TILE;
    const py = tile.y * VIRTUAL_TILE;
    if (!pathSet.has(`${tile.x},${tile.y - 1}`)) ctx.fillRect(px, py, VIRTUAL_TILE, 1);
    if (!pathSet.has(`${tile.x},${tile.y + 1}`)) ctx.fillRect(px, py + VIRTUAL_TILE - 1, VIRTUAL_TILE, 1);
    if (!pathSet.has(`${tile.x - 1},${tile.y}`)) ctx.fillRect(px, py, 1, VIRTUAL_TILE);
    if (!pathSet.has(`${tile.x + 1},${tile.y}`)) ctx.fillRect(px + VIRTUAL_TILE - 1, py, 1, VIRTUAL_TILE);
  }

  const spawn = level.waypoints[0];
  const core = level.waypoints[level.waypoints.length - 1];
  const spawnC = tileCenter(spawn.x, spawn.y);
  const coreC = tileCenter(core.x, core.y);
  drawSprite(ctx, 'spawnPort', 0, spawnC.x, spawnC.y);
  // Keep the oversized core sprite from clipping off the right board edge.
  drawSprite(ctx, 'core', 0, Math.min(coreC.x, width - spriteSize('core').w / 2), coreC.y);

  return canvas;
}

export function drawTowers(ctx: CanvasRenderingContext2D, towers: Tower[], timeMs: number): void {
  for (const tower of towers) {
    const { x: cx, y: cy } = tileCenter(tower.x, tower.y);
    const name = tower.kind as SpriteName;

    ctx.globalAlpha = tower.overclock?.state === 'overheated' ? 0.4 : 1;
    drawSprite(ctx, name, tower.flashMs > 0 ? 1 : 0, cx, cy);
    ctx.globalAlpha = 1;

    if (tower.kind === 'idsScanner') {
      const radius = spriteSize(name).w / 2 - 2;
      const angle = (timeMs / 1000) * 2.2;
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#7dffe8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (tower.overclock?.state === 'boosted') {
      const { w, h } = spriteSize(name);
      ctx.strokeStyle = '#fff9b0';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(cx - w / 2) - 1, Math.round(cy - h / 2) - 1, w + 2, h + 2);
    }

    // Tier tell is procedural for now: pips along the tile's bottom edge. Tier
    // sprites would mean three variants per tower, which is its own milestone.
    if (tower.tier > 1) {
      const pips = tower.tier - 1;
      const width = pips * 3 - 1;
      const py = tower.y * VIRTUAL_TILE + VIRTUAL_TILE - 3;
      const px = Math.round(cx - width / 2);
      // Dark backing so the pips read over the sprite they sit on - the AES
      // Turret is 30px in a 32px tile and leaves them nowhere clear to land.
      ctx.fillStyle = palette.background;
      ctx.fillRect(px - 1, py - 1, width + 2, 4);
      ctx.fillStyle = TOWER_RING[tower.kind];
      for (let i = 0; i < pips; i++) {
        ctx.fillRect(px + i * 3, py, 2, 2);
      }
    }

    if (tower.slowMultiplier !== undefined) {
      ctx.strokeStyle = TOWER_RING[tower.kind];
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(cx, cy, tower.range * VIRTUAL_TILE, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

/**
 * Corner brackets around a box. Brackets rather than a full outline so the thing
 * being marked keeps its own silhouette instead of being boxed in by a border one
 * pixel off it.
 */
function drawBrackets(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  right: number,
  bottom: number,
): void {
  const arm = Math.max(3, Math.min(6, Math.round((right - left) / 4)));

  ctx.fillStyle = palette.selection;
  for (const [px, py, dx, dy] of [
    [left, top, 1, 1],
    [right, top, -1, 1],
    [left, bottom, 1, -1],
    [right, bottom, -1, -1],
  ] as const) {
    ctx.fillRect(dx > 0 ? px : px - arm + 1, py, arm, 1);
    ctx.fillRect(px, dy > 0 ? py : py - arm + 1, 1, arm);
  }
}

/** Marks the selected tower: brackets on its tile plus its range circle. */
export function drawTowerSelection(ctx: CanvasRenderingContext2D, tower: Tower): void {
  const { x: cx, y: cy } = tileCenter(tower.x, tower.y);

  ctx.strokeStyle = TOWER_RING[tower.kind];
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, tower.range * VIRTUAL_TILE, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const left = tower.x * VIRTUAL_TILE;
  const top = tower.y * VIRTUAL_TILE;
  drawBrackets(ctx, left, top, left + VIRTUAL_TILE - 1, top + VIRTUAL_TILE - 1);
}

/**
 * Marks the selected enemy. The box is square at the sprite's larger side: enemies
 * rotate in 90-degree steps, so a 16x8 Worm is 8x16 going up, and a square box is
 * the one that fits either way without recomputing per frame.
 */
export function drawEnemySelection(
  ctx: CanvasRenderingContext2D,
  enemy: Enemy,
  waypoints: GridPos[],
): void {
  const pos = positionAlongPath(waypoints, enemy.distance);
  const { w, h } = spriteSize(enemy.kind as SpriteName);
  const half = Math.max(w, h) / 2 + 2;
  const cx = Math.round(pos.x * VIRTUAL_TILE);
  const cy = Math.round(pos.y * VIRTUAL_TILE);
  drawBrackets(ctx, cx - half, cy - half, cx + half, cy + half);
}

/**
 * Half-extent of an enemy's sprite in grid units, for hit-testing a tap. Floored at
 * a third of a tile: a Packet Sniffer is 10x6 virtual pixels and would otherwise be
 * a target no thumb can hit.
 */
export function enemyHitRadius(enemy: Enemy): number {
  const { w, h } = spriteSize(enemy.kind as SpriteName);
  return Math.max(Math.max(w, h) / 2 / VIRTUAL_TILE, 0.34);
}

export function drawEnemies(
  ctx: CanvasRenderingContext2D,
  enemies: Enemy[],
  waypoints: GridPos[],
  timeMs: number,
): void {
  const frame = Math.floor(timeMs / ANIM_FRAME_MS) % 2;
  for (const enemy of enemies) {
    const pos = positionAlongPath(waypoints, enemy.distance);
    const dir = directionAlongPath(waypoints, enemy.distance);
    const orientation = Math.atan2(dir.y, dir.x);
    drawSprite(ctx, enemy.kind as SpriteName, frame, pos.x * VIRTUAL_TILE, pos.y * VIRTUAL_TILE, orientation);
  }
}

export function drawProjectiles(ctx: CanvasRenderingContext2D, projectiles: Projectile[]): void {
  for (const projectile of projectiles) {
    const name: SpriteName = projectile.heavy ? 'projectileAes' : 'projectile';
    drawSprite(ctx, name, 0, projectile.x * VIRTUAL_TILE, projectile.y * VIRTUAL_TILE);
  }
}

export function drawGlitchParticles(ctx: CanvasRenderingContext2D, particles: GlitchParticle[]): void {
  for (const particle of particles) {
    ctx.globalAlpha = particleAlpha(particle);
    ctx.fillStyle = particle.color;
    ctx.fillRect(Math.round(particle.x * VIRTUAL_TILE), Math.round(particle.y * VIRTUAL_TILE), 2, 2);
  }
  ctx.globalAlpha = 1;
}

export function drawPlacementPreview(
  ctx: CanvasRenderingContext2D,
  hover: GridPos,
  valid: boolean,
  range: number,
  previewKind: TowerKind,
): void {
  ctx.fillStyle = valid ? palette.placeValid : palette.placeInvalid;
  ctx.fillRect(hover.x * VIRTUAL_TILE, hover.y * VIRTUAL_TILE, VIRTUAL_TILE, VIRTUAL_TILE);

  if (!valid) return;

  const { x: cx, y: cy } = tileCenter(hover.x, hover.y);
  ctx.strokeStyle = TOWER_RING[previewKind];
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.arc(cx, cy, range * VIRTUAL_TILE, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.5;
  drawSprite(ctx, previewKind as SpriteName, 0, cx, cy);
  ctx.globalAlpha = 1;
}

/**
 * The end screen, and only that. The run's numbers used to be painted here too -
 * three labelled lines in the top-left corner - and they are a DOM status bar now
 * (`hud.ts`), which is what let the wave indicator become something you can tap.
 * What is left is the one thing that genuinely belongs on the board: the overlay
 * that covers it when the run is over.
 */
export function drawEndScreen(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  gameState: 'playing' | 'won' | 'lost',
): void {
  if (gameState === 'playing') return;

  const ox = vp.offsetX;
  const oy = vp.offsetY;
  // The blit's on-screen footprint, which is the virtual size with the axes swapped
  // when the board is turned. The overlay covers the board; the text stays upright.
  const { width: worldW, height: worldH } = displayedSize(vp);
  const unit = vp.scale * VIRTUAL_TILE; // device px per tile
  const fontSize = Math.max(12 * vp.dpr, unit * 0.42);

  const won = gameState === 'won';
  ctx.fillStyle = 'rgba(10, 14, 20, 0.78)';
  ctx.fillRect(ox, oy, worldW, worldH);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = won ? '#39ff88' : '#ff2fd1';
  ctx.font = `bold ${unit}px monospace`;
  ctx.fillText(won ? 'SYSTEM SECURED' : 'GAME OVER', ox + worldW / 2, oy + worldH / 2 - fontSize * 0.6);

  ctx.font = `${fontSize * 0.6}px monospace`;
  ctx.fillStyle = '#e8f9ff';
  ctx.fillText('TAP TO RESTART', ox + worldW / 2, oy + worldH / 2 + fontSize * 0.8);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}
