import './style.css';
import { GameLoop } from './game-loop.ts';
import { level1, pathLength, buildableTileSet, positionAlongPath, rasterizePath } from './map.ts';
import type { GridPos } from './map.ts';
import { boardRect, createViewport, fitViewport, present, clientToGrid, clientToWorld } from './canvas.ts';
import {
  prerenderBoard,
  drawEnemies,
  drawGlitchParticles,
  drawHud,
  drawPlacementPreview,
  drawEnemySelection,
  drawProjectiles,
  drawTowers,
  drawTowerSelection,
  enemyHitRadius,
} from './render.ts';
import { bakeAtlas, spritePixels } from './sprites.ts';
import type { SpriteName } from './sprites.ts';
import { renderGallery } from './gallery.ts';
import { createGlitchBurst, stepParticle } from './effects.ts';
import type { GlitchParticle } from './effects.ts';
import { createEnemy, getSplitKinds, isImmuneTo, stepEnemy } from './enemy.ts';
import type { Enemy } from './enemy.ts';
import {
  applyUpgrade,
  canFire,
  createTower,
  effectiveFireIntervalMs,
  MUZZLE_FLASH_MS,
  sellValue,
  stepOverclock,
  upgradeCost,
  towerCenter,
  towerStats,
  triggerOverclock,
} from './tower.ts';
import type { Tower, TowerKind } from './tower.ts';
import { createProjectile, stepProjectile } from './projectile.ts';
import type { Projectile } from './projectile.ts';
import { createSpawner, stepSpawner, waveLabel } from './wave.ts';
import { createTowerPanel } from './panel.ts';
import type { PanelTarget } from './panel.ts';

const MAX_CORE_HEALTH = 5;
const STARTING_CYCLES = 100;

if (new URLSearchParams(location.search).has('gallery')) {
  renderGallery(document.querySelector<HTMLDivElement>('#app')!);
} else {
  startGame();
}

function startGame(): void {
  bakeAtlas();

  const canvas = document.createElement('canvas');
  document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas);

  const viewport = createViewport(canvas, level1.cols, level1.rows);
  const board = prerenderBoard(level1);

  window.addEventListener('resize', () => {
    fitViewport(viewport);
    placeToolbar();
  });

  const totalPathLength = pathLength(level1.waypoints);
  const enemies: Enemy[] = [];
  let spawner = createSpawner();
  let coreHealth = MAX_CORE_HEALTH;
  let cycles = STARTING_CYCLES;
  let gameState: 'playing' | 'won' | 'lost' = 'playing';

  // Pause and 2x scale the simulation, not the frame rate: the loop keeps drawing
  // at whatever the display gives it, and pausing stops the sim while the board,
  // the console and the selection stay on screen and readable. A paused game you
  // can't read is just a stopped one.
  //
  // Building, upgrading and selling all still work while paused, deliberately -
  // planning with the clock stopped is most of what a pause is for in this genre.
  const FAST_SPEED = 2;
  let paused = false;
  let speed = 1;

  function applyRunSpeed(): void {
    loop.setTimeScale(paused ? 0 : speed);
  }

  function togglePause(): void {
    paused = !paused;
    applyRunSpeed();
  }

  function toggleSpeed(): void {
    speed = speed === 1 ? FAST_SPEED : 1;
    applyRunSpeed();
  }

  /** Wave line plus whatever is making the run behave unusually, if anything. */
  function runLabel(): string {
    const base = waveLabel(spawner);
    if (paused) return `${base} - PAUSED`;
    return speed === 1 ? base : `${base} - ${speed}x`;
  }

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
  // One selection for the whole board: a tower or an enemy, never both.
  let selection: PanelTarget = null;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      // Space activates a focused button, so a press that just worked the console's
      // own controls is not also a shortcut firing behind them.
      if (event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      togglePause();
      return;
    }
    if (event.key === 'f' || event.key === 'F') {
      toggleSpeed();
      return;
    }

    const kind = TOWER_HOTKEYS[event.key];
    if (kind) {
      selectedTowerKind = kind;
      return;
    }
    // Same verb as tapping the selected thing again, so the keyboard out and the
    // touch out leave the console in the same state.
    if (event.key === 'Escape') select(null);
    // Kept as a desktop shortcut for the flow players already learned, but it now
    // acts on the selection instead of arming an invisible mode.
    if ((event.key === 'q' || event.key === 'Q') && selection?.kind === 'tower') {
      triggerOverclock(selection.tower);
    }
  });

  /** Breathing room between the build menu and the board's edge, CSS px. */
  const BOARD_GAP = 6;

  const TOWER_BUTTON_LABELS: Record<TowerKind, string> = {
    firewallNode: 'FW',
    aesTurret: 'AES',
    idsScanner: 'IDS',
    honeypot: 'TRAP',
  };

  // Build menu down the left edge, console along the bottom. They were one stacked
  // dock until playing it on a phone: stacked, the two of them ate the whole bottom
  // of the board, and the board's bottom band is where the trace runs into the core.
  // Split, each takes an edge the other isn't using, and neither grows into the
  // middle. They stay one control surface by sharing the console's visual language,
  // not by sharing a container.
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

  /**
   * Parks the build menu against the board's left edge instead of the window's.
   * The world is blitted letterboxed at an integer scale, so on most screens there
   * is a black band between the two - and a menu floating out in that band is
   * further from the thing it builds on than it needs to be.
   *
   * Only the candidate position is published; the floor stays in CSS, where the
   * safe-area inset lives, and CSS max() picks whichever sits further right. So the
   * menu tucks into the letterbox when the band is wide enough to hold it and
   * falls back to overlapping the board's edge when it isn't.
   */
  function placeToolbar(): void {
    const rect = boardRect(viewport);
    const outside = rect.left - toolbar.offsetWidth - BOARD_GAP;
    document.documentElement.style.setProperty('--toolbar-left', `${Math.round(outside)}px`);
  }
  placeToolbar();

  const panel = createTowerPanel(
    {
      onSell(tower) {
        const index = towers.indexOf(tower);
        if (index === -1) return;
        towers.splice(index, 1);
        occupied.delete(`${tower.x},${tower.y}`);
        cycles += sellValue(tower);
        selection = null;
      },
      onUpgrade(tower) {
        const cost = upgradeCost(tower);
        if (cost === null || cycles < cost) return;
        cycles -= cost;
        applyUpgrade(tower);
      },
      onOverclock(tower) {
        triggerOverclock(tower);
      },
      onTogglePause: togglePause,
      onToggleSpeed: toggleSpeed,
    },
    document.body,
  );

  /**
   * Every selection made by tapping the board. Tapping a thing opens the console on
   * it; tapping that same thing again dismisses the reading and folds the console to
   * its header. The console covers real board on a phone, and the readout you just
   * finished is exactly the one you want out of the way - so the tap that dismisses
   * it is the same tap that opened it, with no second control to find.
   *
   * A new selection always expands, because the console collapsed hides the stats
   * and the SELL/UP/OC row both: tapping a tower to act on it and getting a folded
   * header would be a dead end.
   */
  function select(target: PanelTarget): void {
    selection = target;
    panel.setCollapsed(target === null);
  }

  function updateToolbar(): void {
    for (const { kind, button } of towerButtons) {
      button.classList.toggle('selected', kind === selectedTowerKind);
      // Marked as unaffordable rather than disabled: a disabled button swallows its
      // click, and picking a kind you can't afford yet is how you read its stats in
      // the panel. Placement is blocked by isPlaceable regardless.
      button.classList.toggle('short', cycles < towerStats(kind).cost);
    }
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
    selection = null;
    // Speed is a preference and survives; pause is a state, and restarting into a
    // frozen board would read as the tap-to-restart having failed.
    paused = false;
    applyRunSpeed();
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

  /** Nearest enemy whose sprite covers this world point, or null. */
  function enemyAt(x: number, y: number): Enemy | null {
    let nearest: Enemy | null = null;
    let nearestDist = Infinity;

    for (const enemy of enemies) {
      const pos = positionAlongPath(level1.waypoints, enemy.distance);
      const dist = Math.hypot(pos.x - x, pos.y - y);
      if (dist <= enemyHitRadius(enemy) && dist < nearestDist) {
        nearest = enemy;
        nearestDist = dist;
      }
    }

    return nearest;
  }

  canvas.addEventListener('pointermove', (event) => {
    hoverTile = clientToGrid(viewport, event.clientX, event.clientY);
  });

  canvas.addEventListener('pointerleave', () => {
    hoverTile = null;
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (gameState !== 'playing') {
      resetGame();
      return;
    }
    const tile = clientToGrid(viewport, event.clientX, event.clientY);

    // Tap resolves in one order: select a tower, else build, else inspect an enemy,
    // else clear. Building outranks inspecting deliberately - the oversized Zero-Day
    // sprite overhangs the trace onto buildable tiles, and losing a placement to a
    // boss walking past would be maddening. Enemies stay tappable over the trace,
    // which is where they always are.
    const hitTower = towers.find((t) => t.x === tile.x && t.y === tile.y);
    if (hitTower) {
      const same = selection?.kind === 'tower' && selection.tower === hitTower;
      select(same ? null : { kind: 'tower', tower: hitTower });
      return;
    }

    if (isPlaceable(tile)) {
      towers.push(createTower(selectedTowerKind, tile.x, tile.y));
      occupied.add(`${tile.x},${tile.y}`);
      cycles -= towerStats(selectedTowerKind).cost;
      selection = null;
      return;
    }

    const world = clientToWorld(viewport, event.clientX, event.clientY);
    const hitEnemy = enemyAt(world.x, world.y);
    if (hitEnemy) {
      const same = selection?.kind === 'enemy' && selection.enemy === hitEnemy;
      select(same ? null : { kind: 'enemy', enemy: hitEnemy });
      return;
    }
    selection = null;
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
        if (tower.flashMs > 0) tower.flashMs = Math.max(0, tower.flashMs - dtMs);

        if (tower.slowMultiplier !== undefined || !canFire(tower)) continue;

        tower.cooldownMs -= dtMs;
        if (tower.cooldownMs > 0) continue;

        const target = findTarget(tower);
        if (!target) continue;

        projectiles.push(createProjectile(towerCenter(tower), target, tower.damage, tower.kind === 'aesTurret'));
        tower.cooldownMs = effectiveFireIntervalMs(tower);
        tower.flashMs = MUZZLE_FLASH_MS;
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
          particles.push(...createGlitchBurst(deathPos.x, deathPos.y, spritePixels(projectile.target.kind as SpriteName)));

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

      // A selected enemy can die or breach the core mid-tick; both paths set removed.
      if (selection?.kind === 'enemy' && selection.enemy.removed) selection = null;

      if (spawner.state === 'done' && enemies.length === 0) gameState = 'won';

      for (let i = particles.length - 1; i >= 0; i--) {
        if (!stepParticle(particles[i], dtMs)) particles.splice(i, 1);
      }
    },
    () => {
      const timeMs = performance.now();
      updateToolbar();
      if (gameState === 'playing') {
        panel.setRun(paused, speed);
        panel.update(selection, selectedTowerKind, cycles);
      } else panel.hide();

      const { worldCtx } = viewport;
      worldCtx.imageSmoothingEnabled = false;
      worldCtx.drawImage(board, 0, 0);
      drawTowers(worldCtx, towers, timeMs);
      if (selection?.kind === 'tower') drawTowerSelection(worldCtx, selection.tower);
      drawEnemies(worldCtx, enemies, level1.waypoints, timeMs);
      if (selection?.kind === 'enemy') drawEnemySelection(worldCtx, selection.enemy, level1.waypoints);
      drawProjectiles(worldCtx, projectiles);
      drawGlitchParticles(worldCtx, particles);
      if (hoverTile && gameState === 'playing') {
        drawPlacementPreview(
          worldCtx,
          hoverTile,
          isPlaceable(hoverTile),
          towerStats(selectedTowerKind).range,
          selectedTowerKind,
        );
      }

      present(viewport);
      drawHud(viewport.ctx, viewport, coreHealth, MAX_CORE_HEALTH, cycles, runLabel(), gameState);
    },
  );

  loop.start();
}
