import './style.css';
import { GameLoop } from './game-loop.ts';
import { level1, pathLength, buildableTileSet, positionAlongPath, rasterizePath } from './map.ts';
import type { GridPos } from './map.ts';
import { fitCanvasToViewport, clientToGrid } from './canvas.ts';
import {
  drawBoard,
  drawEnemies,
  drawGlitchParticles,
  drawHud,
  drawPlacementPreview,
  drawProjectiles,
  drawTowers,
} from './render.ts';
import { createGlitchBurst, stepParticle } from './effects.ts';
import type { GlitchParticle } from './effects.ts';
import { createEnemy, getSplitKinds, isImmuneTo, stepEnemy } from './enemy.ts';
import type { Enemy } from './enemy.ts';
import { canFire, createTower, effectiveFireIntervalMs, stepOverclock, towerCenter, towerStats, triggerOverclock } from './tower.ts';
import type { Tower, TowerKind } from './tower.ts';
import { createProjectile, stepProjectile } from './projectile.ts';
import type { Projectile } from './projectile.ts';
import { createSpawner, stepSpawner, waveLabel } from './wave.ts';

const MAX_CORE_HEALTH = 5;
const STARTING_CYCLES = 100;

const canvas = document.createElement('canvas');
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas);

let sized = fitCanvasToViewport(canvas, level1.cols, level1.rows);

window.addEventListener('resize', () => {
  sized = fitCanvasToViewport(canvas, level1.cols, level1.rows);
});

const totalPathLength = pathLength(level1.waypoints);
const enemies: Enemy[] = [];
let spawner = createSpawner();
let coreHealth = MAX_CORE_HEALTH;
let cycles = STARTING_CYCLES;
let gameState: 'playing' | 'won' | 'lost' = 'playing';

const buildable = buildableTileSet(level1);
const pathTiles = new Set(rasterizePath(level1.waypoints).map((p) => `${p.x},${p.y}`));
const spawnKey = `${level1.waypoints[0].x},${level1.waypoints[0].y}`;
const coreKey = `${level1.waypoints[level1.waypoints.length - 1].x},${level1.waypoints[level1.waypoints.length - 1].y}`;
const occupied = new Set<string>();
const towers: Tower[] = [];
const projectiles: Projectile[] = [];
const particles: GlitchParticle[] = [];
let hoverTile: GridPos | null = null;

const TOWER_HOTKEYS: Record<string, TowerKind> = {
  '1': 'firewallNode',
  '2': 'aesTurret',
  '3': 'idsScanner',
  '4': 'honeypot',
};
let selectedTowerKind: TowerKind = 'firewallNode';
let overclockArmed = false;

window.addEventListener('keydown', (event) => {
  const kind = TOWER_HOTKEYS[event.key];
  if (kind) {
    selectedTowerKind = kind;
    return;
  }
  if (event.key === 'q' || event.key === 'Q') overclockArmed = true;
});

const TOWER_BUTTON_LABELS: Record<TowerKind, string> = {
  firewallNode: 'FW',
  aesTurret: 'AES',
  idsScanner: 'IDS',
  honeypot: 'TRAP',
};

const toolbar = document.createElement('div');
toolbar.className = 'toolbar';
document.body.appendChild(toolbar);

const towerButtons = (Object.keys(TOWER_BUTTON_LABELS) as TowerKind[]).map((kind) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.innerHTML = `<span>${TOWER_BUTTON_LABELS[kind]}</span><span>${towerStats(kind).cost}</span>`;
  button.addEventListener('click', () => {
    selectedTowerKind = kind;
  });
  toolbar.appendChild(button);
  return { kind, button };
});

const overclockButton = document.createElement('button');
overclockButton.type = 'button';
overclockButton.innerHTML = '<span>OC</span><span>Q</span>';
overclockButton.addEventListener('click', () => {
  overclockArmed = true;
});
toolbar.appendChild(overclockButton);

function updateToolbar(): void {
  for (const { kind, button } of towerButtons) {
    button.classList.toggle('selected', kind === selectedTowerKind);
    button.disabled = cycles < towerStats(kind).cost;
  }
  overclockButton.classList.toggle('armed', overclockArmed);
}

function findTarget(tower: Tower): Enemy | null {
  const center = towerCenter(tower);
  let nearest: Enemy | null = null;
  let nearestDist = Infinity;

  for (const enemy of enemies) {
    if (isImmuneTo(enemy.kind, tower.kind)) continue;
    const pos = positionAlongPath(level1.waypoints, enemy.distance);
    const dist = Math.hypot(pos.x - center.x, pos.y - center.y);
    if (dist <= tower.range && dist < nearestDist) {
      nearest = enemy;
      nearestDist = dist;
    }
  }

  return nearest;
}

function resetGame(): void {
  enemies.length = 0;
  towers.length = 0;
  projectiles.length = 0;
  particles.length = 0;
  occupied.clear();
  spawner = createSpawner();
  coreHealth = MAX_CORE_HEALTH;
  cycles = STARTING_CYCLES;
  gameState = 'playing';
  overclockArmed = false;
}

function isPlaceable(tile: GridPos): boolean {
  const key = `${tile.x},${tile.y}`;
  if (occupied.has(key)) return false;

  const stats = towerStats(selectedTowerKind);
  const validTile =
    stats.placement === 'onPath'
      ? pathTiles.has(key) && key !== spawnKey && key !== coreKey
      : buildable.has(key);

  return validTile && cycles >= stats.cost;
}

canvas.addEventListener('pointermove', (event) => {
  hoverTile = clientToGrid(canvas, sized.tileSize, event.clientX, event.clientY);
});

canvas.addEventListener('pointerleave', () => {
  hoverTile = null;
});

canvas.addEventListener('pointerdown', (event) => {
  if (gameState !== 'playing') {
    resetGame();
    return;
  }
  const tile = clientToGrid(canvas, sized.tileSize, event.clientX, event.clientY);

  if (overclockArmed) {
    overclockArmed = false;
    const target = towers.find((t) => t.x === tile.x && t.y === tile.y);
    if (target) triggerOverclock(target);
    return;
  }

  if (!isPlaceable(tile)) return;

  towers.push(createTower(selectedTowerKind, tile.x, tile.y));
  occupied.add(`${tile.x},${tile.y}`);
  cycles -= towerStats(selectedTowerKind).cost;
});

const loop = new GameLoop(
  (dtMs) => {
    if (gameState !== 'playing') return;

    const spawnKind = stepSpawner(spawner, dtMs, enemies.length);
    if (spawnKind) enemies.push(createEnemy(spawnKind));

    const slowFactor = new Map<Enemy, number>();
    for (const tower of towers) {
      if (tower.slowMultiplier === undefined) continue;
      const center = towerCenter(tower);
      for (const enemy of enemies) {
        const pos = positionAlongPath(level1.waypoints, enemy.distance);
        const dist = Math.hypot(pos.x - center.x, pos.y - center.y);
        if (dist > tower.range) continue;
        slowFactor.set(enemy, Math.min(slowFactor.get(enemy) ?? 1, tower.slowMultiplier));
      }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      const reachedCore = stepEnemy(enemy, dtMs, totalPathLength, slowFactor.get(enemy) ?? 1);
      if (!reachedCore) continue;

      enemy.removed = true;
      enemies.splice(i, 1);
      coreHealth = Math.max(0, coreHealth - 1);
      if (coreHealth === 0) gameState = 'lost';
    }

    for (const tower of towers) {
      stepOverclock(tower, dtMs);

      if (tower.slowMultiplier !== undefined || !canFire(tower)) continue;

      tower.cooldownMs -= dtMs;
      if (tower.cooldownMs > 0) continue;

      const target = findTarget(tower);
      if (!target) continue;

      projectiles.push(createProjectile(towerCenter(tower), target, tower.damage));
      tower.cooldownMs = effectiveFireIntervalMs(tower);
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];
      if (projectile.target.removed) {
        projectiles.splice(i, 1);
        continue;
      }

      const targetPos = positionAlongPath(level1.waypoints, projectile.target.distance);
      const hit = stepProjectile(projectile, dtMs, targetPos);
      if (!hit) continue;

      projectile.target.hp -= projectile.damage;
      if (projectile.target.hp <= 0) {
        projectile.target.removed = true;
        cycles += projectile.target.reward;
        const idx = enemies.indexOf(projectile.target);
        if (idx !== -1) enemies.splice(idx, 1);

        const deathPos = positionAlongPath(level1.waypoints, projectile.target.distance);
        particles.push(...createGlitchBurst(deathPos.x, deathPos.y));

        const splitKinds = getSplitKinds(projectile.target.kind);
        if (splitKinds) {
          splitKinds.forEach((kind, i) => {
            const child = createEnemy(kind);
            child.distance = Math.max(0, projectile.target.distance - i * 0.4);
            enemies.push(child);
          });
        }
      }
      projectiles.splice(i, 1);
    }

    if (spawner.state === 'done' && enemies.length === 0) gameState = 'won';

    for (let i = particles.length - 1; i >= 0; i--) {
      if (!stepParticle(particles[i], dtMs)) particles.splice(i, 1);
    }
  },
  () => {
    updateToolbar();
    drawBoard(sized.ctx, level1, sized.tileSize);
    drawTowers(sized.ctx, towers, sized.tileSize);
    drawEnemies(sized.ctx, enemies, level1.waypoints, sized.tileSize);
    drawProjectiles(sized.ctx, projectiles, sized.tileSize);
    drawGlitchParticles(sized.ctx, particles, sized.tileSize);
    if (hoverTile && gameState === 'playing') {
      drawPlacementPreview(
        sized.ctx,
        hoverTile,
        isPlaceable(hoverTile),
        towerStats(selectedTowerKind).range,
        sized.tileSize,
        selectedTowerKind,
      );
    }
    drawHud(
      sized.ctx,
      level1,
      sized.tileSize,
      coreHealth,
      MAX_CORE_HEALTH,
      cycles,
      waveLabel(spawner),
      gameState,
    );
  },
);

loop.start();
