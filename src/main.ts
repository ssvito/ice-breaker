import './style.css';
import { GameLoop } from './game-loop.ts';
import { level1, pathLength, buildableTileSet } from './map.ts';
import type { GridPos } from './map.ts';
import { fitCanvasToViewport, clientToGrid } from './canvas.ts';
import { drawBoard, drawEnemies, drawHud, drawPlacementPreview, drawTowers } from './render.ts';
import { createEnemy, stepEnemy } from './enemy.ts';
import { createFirewallNode, FIREWALL_NODE_RANGE } from './tower.ts';
import type { Tower } from './tower.ts';

const MAX_CORE_HEALTH = 5;

const canvas = document.createElement('canvas');
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas);

let sized = fitCanvasToViewport(canvas, level1.cols, level1.rows);

window.addEventListener('resize', () => {
  sized = fitCanvasToViewport(canvas, level1.cols, level1.rows);
});

const totalPathLength = pathLength(level1.waypoints);
const enemies = [createEnemy()];
let coreHealth = MAX_CORE_HEALTH;
let gameOver = false;

const buildable = buildableTileSet(level1);
const occupied = new Set<string>();
const towers: Tower[] = [];
let hoverTile: GridPos | null = null;

function isPlaceable(tile: GridPos): boolean {
  const key = `${tile.x},${tile.y}`;
  return buildable.has(key) && !occupied.has(key);
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
        enemy.distance = 0;
      }
    }
  },
  () => {
    drawBoard(sized.ctx, level1, sized.tileSize);
    drawTowers(sized.ctx, towers, sized.tileSize);
    drawEnemies(sized.ctx, enemies, level1.waypoints, sized.tileSize);
    if (hoverTile && !gameOver) {
      drawPlacementPreview(sized.ctx, hoverTile, isPlaceable(hoverTile), FIREWALL_NODE_RANGE, sized.tileSize);
    }
    drawHud(sized.ctx, level1, sized.tileSize, coreHealth, MAX_CORE_HEALTH, gameOver);
  },
);

loop.start();
