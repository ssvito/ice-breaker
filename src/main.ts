import './style.css';
import { GameLoop } from './game-loop.ts';
import { level1, positionAlongPath } from './map.ts';
import type { GridPos } from './map.ts';
import { boardRect, createViewport, fitViewport, present, clientToGrid, clientToWorld } from './canvas.ts';
import {
  prerenderBoard,
  drawEnemies,
  drawGlitchParticles,
  drawEndScreen,
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
import type { Enemy } from './enemy.ts';
import { towerStats, triggerOverclock } from './tower.ts';
import type { TowerKind } from './tower.ts';
import { currentWaveReading, nextWavePreview, waveNumber } from './wave.ts';
import {
  callWaveEarly,
  createGameState,
  isPlaceable,
  placeTower,
  sellTower,
  stepGame,
  towerAt,
  upgradeTower,
} from './game.ts';
import type { GameHooks } from './game.ts';
import { createHud } from './hud.ts';
import { createTowerPanel } from './panel.ts';
import type { PanelTarget } from './panel.ts';

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
    applyLayout();
    placeToolbar();
    placeHud();
    placePanel();
  });

  // The whole simulation, reassigned wholesale on restart rather than reset field by
  // field. Everything below reads it at call time, so nothing holds a stale run.
  let state = createGameState(level1);

  // The only thing the sim can't work out alone: the kill burst scatters the dead
  // enemy's own sprite pixels, and those live in the baked atlas.
  const hooks: GameHooks = {
    enemyPixels: (kind) => spritePixels(kind as SpriteName),
  };

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

  /**
   * Which of the two unselected readings the console shows: the wave being counted
   * down to, or the tower about to be built. Picking a kind is the player saying
   * they are shopping, so it hands the console back to the build stats; a new
   * countdown takes it back, because "what is coming" is the question that lull
   * exists to ask. Without this the preview would eat the build panel during the
   * exact seconds it is used.
   */
  let buildFocus = false;
  let previewedWave = 0;

  /**
   * Set by tapping the wave indicator in the HUD, which is the only way to read a
   * wave that is already on the board - the automatic preview only ever appears
   * during a countdown, and "what am I fighting" is a question that outlives it.
   */
  let waveFocus = false;

  function pickTowerKind(kind: TowerKind): void {
    selectedTowerKind = kind;
    buildFocus = true;
    waveFocus = false;
  }

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
      pickTowerKind(kind);
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
  // Measured once rather than read back per resize: the bar's contents are three
  // fixed-height rows of text and its height never changes with the numbers in it.
  const HUD_HEIGHT = 30;

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
    button.addEventListener('click', () => pickTowerKind(kind));
    toolbar.appendChild(button);
    return { kind, button };
  });

  /**
   * The build menu is a column on the board's left edge in landscape and a
   * horizontal drawer in the bottom strip when the board is turned - two layouts,
   * one class, and CSS holds both. The predicate is the renderer's own: a turned
   * board leaves a 3px side band, and no column stands in 3px.
   *
   * Open by default, because building three towers should not cost three
   * reopenings, and because the game starts with 100 Cycles and nothing built.
   * Landscape never hides it - there the toggle does not exist.
   */
  let menuOpen = true;

  const dockToggle = document.createElement('button');
  dockToggle.type = 'button';
  dockToggle.className = 'dock-toggle';
  dockToggle.addEventListener('click', () => {
    menuOpen = !menuOpen;
    applyLayout();
  });
  document.body.appendChild(dockToggle);

  function applyLayout(): void {
    document.body.classList.toggle('turned', viewport.rotated);
    dockToggle.hidden = !viewport.rotated;
    toolbar.hidden = viewport.rotated && !menuOpen;
    // Same two glyphs the console's own collapse uses, so the two drawers in the
    // strip say "open me" and "close me" in one vocabulary.
    dockToggle.innerHTML = `<span>BLD</span><span>${menuOpen ? '[-]' : '[+]'}</span>`;
    dockToggle.setAttribute('aria-expanded', String(menuOpen));
  }

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
  applyLayout();
  placeToolbar();

  /**
   * Same parking trick as the build menu, on the other axis: the status bar tucks
   * into the letterbox above the board when the band is tall enough to hold it,
   * and sits on the board's top edge when it isn't.
   */
  const hud = createHud({ onWave: () => showWave() }, document.body);

  function placeHud(): void {
    const rect = boardRect(viewport);
    document.documentElement.style.setProperty('--hud-top', `${Math.round(rect.top - HUD_HEIGHT - BOARD_GAP)}px`);
  }
  placeHud();

  const panel = createTowerPanel(
    {
      onSell(tower) {
        if (sellTower(state, tower)) selection = null;
      },
      onUpgrade(tower) {
        upgradeTower(state, tower);
      },
      onOverclock(tower) {
        triggerOverclock(tower);
      },
      onTogglePause: togglePause,
      onToggleSpeed: toggleSpeed,
      onCallWave: () => {
        callWaveEarly(state);
      },
    },
    document.body,
  );

  /**
   * The console's turn at parking against the board instead of the window, and the
   * one box that needs a measurement to do it: the status bar and the build menu
   * hug the edge they are anchored by, while the console is anchored by its bottom
   * and grows upward, so its top depends on how tall it currently is.
   *
   * So JS publishes both halves and CSS takes the min() (see .panel). A height of 0
   * means hidden, and publishing that would park the console at the window's floor
   * for the frame after it comes back.
   */
  function placePanel(): void {
    const rect = boardRect(viewport);
    const height = panel.element.getBoundingClientRect().height;
    if (height > 0) {
      document.documentElement.style.setProperty('--panel-h', `${Math.round(height)}px`);
    }
    document.documentElement.style.setProperty(
      '--panel-under-board',
      `${Math.round(rect.top + rect.height + BOARD_GAP)}px`,
    );
  }

  // One hook for every way the console changes height: collapsing, switching between
  // its four modes, a stats grid reflowing. Cheaper and more honest than calling
  // placePanel() from each of the places that might have done it.
  new ResizeObserver(placePanel).observe(panel.element);
  placePanel();

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
    // Dismissing a reading during a lull should land on the wave, not back on the
    // build stats the player already walked away from.
    if (target === null) buildFocus = false;
    waveFocus = false;
  }

  /**
   * The wave indicator's job: put the wave in the console. It drops any board
   * selection first, because the console shows one thing at a time and the thing
   * just asked for is the wave.
   */
  function showWave(): void {
    selection = null;
    buildFocus = false;
    waveFocus = true;
    panel.setCollapsed(false);
  }

  function updateToolbar(): void {
    for (const { kind, button } of towerButtons) {
      button.classList.toggle('selected', kind === selectedTowerKind);
      // Marked as unaffordable rather than disabled: a disabled button swallows its
      // click, and picking a kind you can't afford yet is how you read its stats in
      // the panel. Placement is blocked by isPlaceable regardless.
      button.classList.toggle('short', state.cycles < towerStats(kind).cost);
    }
  }

  function resetGame(): void {
    state = createGameState(level1);
    selection = null;
    buildFocus = false;
    waveFocus = false;
    previewedWave = 0;
    // Speed is a preference and survives; pause is a state, and restarting into a
    // frozen board would read as the tap-to-restart having failed.
    paused = false;
    applyRunSpeed();
  }

  /** Nearest enemy whose sprite covers this world point, or null. */
  function enemyAt(x: number, y: number): Enemy | null {
    let nearest: Enemy | null = null;
    let nearestDist = Infinity;

    for (const enemy of state.enemies) {
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
    if (state.status !== 'playing') {
      resetGame();
      return;
    }
    const tile = clientToGrid(viewport, event.clientX, event.clientY);

    // Tap resolves in one order: select a tower, else build, else inspect an enemy,
    // else clear. Building outranks inspecting deliberately - the oversized Zero-Day
    // sprite overhangs the trace onto buildable tiles, and losing a placement to a
    // boss walking past would be maddening. Enemies stay tappable over the trace,
    // which is where they always are.
    const hitTower = towerAt(state, tile);
    if (hitTower) {
      const same = selection?.kind === 'tower' && selection.tower === hitTower;
      select(same ? null : { kind: 'tower', tower: hitTower });
      return;
    }

    if (placeTower(state, selectedTowerKind, tile)) {
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
      stepGame(state, dtMs, hooks);
      // A selected enemy can die or breach the core mid-tick; both paths set removed.
      if (selection?.kind === 'enemy' && selection.enemy.removed) selection = null;
    },
    () => {
      const timeMs = performance.now();
      updateToolbar();
      if (state.status === 'playing') {
        const incoming = nextWavePreview(state.spawner);
        // Each new countdown claims the console back from the build stats, once.
        if (incoming && incoming.number !== previewedWave) {
          previewedWave = incoming.number;
          buildFocus = false;
        }
        // Asked for explicitly, counting down on its own, or neither.
        const reading = waveFocus ? currentWaveReading(state.spawner) : buildFocus ? null : incoming;

        hud.setVisible(true);
        hud.update(state.coreHealth, state.cycles, waveNumber(state.spawner));
        panel.setRun(paused, speed);
        panel.update(selection, selectedTowerKind, state.cycles, reading);
      } else {
        // The end screen covers the board; a status bar floating over it would be
        // the one piece of chrome arguing with it.
        hud.setVisible(false);
        panel.hide();
      }

      const { worldCtx } = viewport;
      worldCtx.imageSmoothingEnabled = false;
      worldCtx.drawImage(board, 0, 0);
      drawTowers(worldCtx, state.towers, timeMs);
      if (selection?.kind === 'tower') drawTowerSelection(worldCtx, selection.tower);
      drawEnemies(worldCtx, state.enemies, level1.waypoints, timeMs);
      if (selection?.kind === 'enemy') drawEnemySelection(worldCtx, selection.enemy, level1.waypoints);
      drawProjectiles(worldCtx, state.projectiles);
      drawGlitchParticles(worldCtx, state.particles);
      if (hoverTile && state.status === 'playing') {
        drawPlacementPreview(
          worldCtx,
          hoverTile,
          isPlaceable(state, selectedTowerKind, hoverTile),
          towerStats(selectedTowerKind).range,
          selectedTowerKind,
        );
      }

      present(viewport);
      drawEndScreen(viewport.ctx, viewport, state.status);
    },
  );

  loop.start();
}
