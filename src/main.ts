import './style.css';
import { GameLoop } from './game-loop.ts';
import { level1, pathLength } from './map.ts';
import { fitCanvasToViewport } from './canvas.ts';
import { drawBoard, drawEnemies, drawHud } from './render.ts';
import { createEnemy, stepEnemy } from './enemy.ts';

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
    drawEnemies(sized.ctx, enemies, level1.waypoints, sized.tileSize);
    drawHud(sized.ctx, level1, sized.tileSize, coreHealth, MAX_CORE_HEALTH, gameOver);
  },
);

loop.start();
