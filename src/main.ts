import './style.css';
import { GameLoop } from './game-loop.ts';
import { level1 } from './map.ts';
import { fitCanvasToViewport } from './canvas.ts';
import { drawBoard } from './render.ts';

const canvas = document.createElement('canvas');
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas);

let sized = fitCanvasToViewport(canvas, level1.cols, level1.rows);

window.addEventListener('resize', () => {
  sized = fitCanvasToViewport(canvas, level1.cols, level1.rows);
});

const loop = new GameLoop(
  () => {
    // fixed-timestep game state update goes here
  },
  () => {
    drawBoard(sized.ctx, level1, sized.tileSize);
  },
);

loop.start();
