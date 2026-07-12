import './style.css';
import { GameLoop } from './game-loop.ts';
import { level1, pathLength, buildableTileSet, positionAlongPath } from './map.ts';
import type { GridPos } from './map.ts';
import { fitCanvasToViewport, clientToGrid } from './canvas.ts';
import {
  drawBoard,
  drawEnemies,
  drawHud,
  drawPlacementPreview,
  drawProjectiles,
  drawTowers,
} from './render.ts';
import { createEnemy, resetEnemy, stepEnemy } from './enemy.ts';
import type { Enemy } from './enemy.ts';
import { createFirewallNode, FIREWALL_NODE_COST, FIREWALL_NODE_RANGE, towerCenter } from './tower.ts';
import type { Tower } from './tower.ts';
import { createProjectile, stepProjectile } from './projectile.ts';
import type { Projectile } from './projectile.ts';

const MAX_CORE_HEALTH = 5;
const STARTING_CYCLES = 100;

const canvas = document.createElement('canvas');
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas);

let sized = fitCanvasToViewport(canvas, level1.cols, level1.rows);

window.addEventListener('resize', () => {
  sized = fitCanvasToViewport(canvas, level1.cols, level1.rows);
});

const totalPathLength = pathLength(level1.waypoints);
const enemies = [createEnemy()];
let coreHealth = MAX_CORE_HEALTH;
let cycles = STARTING_CYCLES;
let gameOver = false;

const buildable = buildableTileSet(level1);
const occupied = new Set<string>();
const towers: Tower[] = [];
const projectiles: Projectile[] = [];
let hoverTile: GridPos | null = null;

function findTarget(tower: Tower): Enemy | null {
  const center = towerCenter(tower);
  let nearest: Enemy | null = null;
  let nearestDist = Infinity;

  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const pos = positionAlongPath(level1.waypoints, enemy.distance);
    const dist = Math.hypot(pos.x - center.x, pos.y - center.y);
    if (dist <= tower.range && dist < nearestDist) {
      nearest = enemy;
      nearestDist = dist;
    }
  }

  return nearest;
}

function isPlaceable(tile: GridPos): boolean {
  const key = `${tile.x},${tile.y}`;
  return buildable.has(key) && !occupied.has(key) && cycles >= FIREWALL_NODE_COST;
}

canvas.addEventListener('pointermove', (event) => {
  hoverTile = clientToGrid(canvas, sized.tileSize, event.clientX, event.clientY);
});

canvas.addEventListener('pointerleave', () => {
  hoverTile = null;
});

canvas.addEventListener('pointerdown', (event) => {
  if (gameOver) return;
  const tile = clientToGrid(canvas, sized.tileSize, event.clientX, event.clientY);
  if (!isPlaceable(tile)) return;

  towers.push(createFirewallNode(tile.x, tile.y));
  occupied.add(`${tile.x},${tile.y}`);
  cycles -= FIREWALL_NODE_COST;
});

const loop = new GameLoop(
  (dtMs) => {
    if (gameOver) return;

    for (const enemy of enemies) {
      const reachedCore = stepEnemy(enemy, dtMs, totalPathLength);
      if (!reachedCore) continue;

      coreHealth = Math.max(0, coreHealth - 1);
      if (coreHealth === 0) {
        gameOver = true;
      } else {
        resetEnemy(enemy);
      }
    }

    for (const tower of towers) {
      tower.cooldownMs -= dtMs;
      if (tower.cooldownMs > 0) continue;

      const target = findTarget(tower);
      if (!target) continue;

      projectiles.push(createProjectile(towerCenter(tower), target, tower.damage));
      tower.cooldownMs = tower.fireIntervalMs;
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];
      if (projectile.target.hp <= 0) {
        projectiles.splice(i, 1);
        continue;
      }

      const targetPos = positionAlongPath(level1.waypoints, projectile.target.distance);
      const hit = stepProjectile(projectile, dtMs, targetPos);
      if (!hit) continue;

      projectile.target.hp -= projectile.damage;
      if (projectile.target.hp <= 0) {
        cycles += projectile.target.reward;
        resetEnemy(projectile.target);
      }
      projectiles.splice(i, 1);
    }
  },
  () => {
    drawBoard(sized.ctx, level1, sized.tileSize);
    drawTowers(sized.ctx, towers, sized.tileSize);
    drawEnemies(sized.ctx, enemies, level1.waypoints, sized.tileSize);
    drawProjectiles(sized.ctx, projectiles, sized.tileSize);
    if (hoverTile && !gameOver) {
      drawPlacementPreview(sized.ctx, hoverTile, isPlaceable(hoverTile), FIREWALL_NODE_RANGE, sized.tileSize);
    }
    drawHud(sized.ctx, level1, sized.tileSize, coreHealth, MAX_CORE_HEALTH, cycles, gameOver);
  },
);

loop.start();
