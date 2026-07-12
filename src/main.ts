import './style.css';
import { GameLoop } from './game-loop.ts';
import { level1, pathLength } from './map.ts';
import { fitCanvasToViewport } from './canvas.ts';
import { drawBoard, drawEnemies } from './render.ts';
import { createEnemy, stepEnemy } from './enemy.ts';

const canvas = document.createElement('canvas');
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas);

let sized = fitCanvasToViewport(canvas, level1.cols, level1.rows);

window.addEventListener('resize', () => {
  sized = fitCanvasToViewport(canvas, level1.cols, level1.rows);
});

const totalPathLength = pathLength(level1.waypoints);
const enemies = [createEnemy()];

const loop = new GameLoop(
  (dtMs) => {
    for (const enemy of enemies) {
      const reachedCore = stepEnemy(enemy, dtMs, totalPathLength);
      if (reachedCore) enemy.distance = 0;
    }
  },
  () => {
    drawBoard(sized.ctx, level1, sized.tileSize);
    drawEnemies(sized.ctx, enemies, level1.waypoints, sized.tileSize);
  },
);

loop.start();
