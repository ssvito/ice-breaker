import './style.css';
import { GameLoop } from './game-loop.ts';
import { level1, positionAlongPath } from './map.ts';
import type { GridPos } from './map.ts';
import { boardRect, clearDisplay, createViewport, fitViewport, present, clientToGrid, clientToWorld } from './canvas.ts';
import {
  prerenderBoard,
  drawEnemies,
  drawSpawnPort,
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
import { countdownSeconds, currentWaveReading, nextWavePreview, waveNumber } from './wave.ts';
import {
  callWaveEarly,
  createGameState,
  MAX_CORE_HEALTH,
  isPlaceable,
  placeTower,
  sellTower,
  stepGame,
  towerAt,
  upgradeTower,
} from './game.ts';
import type { GameHooks, GameState } from './game.ts';
import { createAudio } from './audio.ts';
import { createHud } from './hud.ts';
import { startMusic } from './music.ts';
import { createTopTools } from './top-tools.ts';
import { watchForUpdates } from './update.ts';
import { createTowerPanel } from './panel.ts';
import type { PanelTarget } from './panel.ts';
import { createShell } from './shell.ts';
import { readRecords, recordRun } from './records.ts';
import { RUNS } from './runs.ts';
import type { RunDescriptor } from './runs.ts';

const params = new URLSearchParams(location.search);

if (params.has('gallery')) {
  renderGallery(document.querySelector<HTMLDivElement>('#app')!);
} else {
  startGame();
}

function startGame(): void {
  bakeAtlas();

  const canvas = document.createElement('canvas');
  document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas);

  // Sized from the boot map. A second map with different dimensions is the one thing
  // in here that would need the viewport rebuilt rather than re-fitted, and that is
  // v1.8's problem on the day it has a second map to size for.
  const viewport = createViewport(canvas, level1.cols, level1.rows);

  /**
   * The map the current run is on, and the board baked from it. Both start as the boot
   * map so the first run opens with its board already prerendered, and both are
   * re-derived only when a run arrives on a different map - which is never today,
   * because `RUNS` has one entry. That "never" is the seam: it is a condition rather
   * than an assumption, so the second entry does not need this code to change.
   */
  let runMap = level1;
  let board = prerenderBoard(runMap);

  /**
   * How long the current run has lasted, in **simulated** milliseconds - the sum of the
   * ticks it has been stepped by, not the wall clock.
   *
   * That distinction is the whole of the fastest-clear record. Ticks are `TICK_MS`
   * whatever the speed button says, so 2x buys no record and the only way to finish
   * faster is to call waves early, which is the mechanic that exists for exactly that
   * trade. It also happens to be the same number `balance.ts` reports as a run's
   * duration, so a record and a harness reading are comparable rather than merely
   * similar.
   */
  let runMs = 0;

  window.addEventListener('resize', () => {
    fitViewport(viewport);
    applyLayout();
    placeHud();
    placePanel();
  });

  /**
   * The whole simulation - or `null`, which is the entire point of this step: until
   * now the game had no way to say *no run exists*. It booted into one, and the only
   * way out of a run was into another run.
   *
   * **The app's two states are this variable being null or not**, and there is
   * deliberately no `mode` flag beside it. A boolean that has to agree with a nullable
   * run is two sources of truth for one fact, and the way they drift is that one of
   * them gets set somewhere the other doesn't - which is the failure this project
   * already keeps notes about.
   *
   * Still reassigned wholesale rather than reset field by field. That was built for
   * tap-to-restart, and it is why "no run" costs a type and not a teardown.
   */
  let state: GameState | null = null;

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
  // Nullable: tapping the kind the console is already reading clears it, which is
  // the only way to put the console back on the wave without selecting something
  // else - and the only way to tap an empty tile without spending Cycles.
  let selectedTowerKind: TowerKind | null = 'firewallNode';
  // One selection for the whole board: a tower or an enemy, never both.
  let selection: PanelTarget = null;
  /**
   * Whether the spawn port is showing its chevrons, waiting for the tap that calls the
   * wave. UI state and not simulation state: the run is identical whether the player
   * armed the port and thought better of it or never touched it.
   *
   * A confirm, and it earns one - the port sits on the board where the finger is
   * already pointing, so without it a stray tap spends a decision that cannot be taken
   * back. v1.2 deleted an arm-then-act mode for being a keyboard idiom on a phone; that
   * one lived off-target, over the whole board, and this one lives on the control.
   */
  let spawnArmed = false;
  let spawnTile = runMap.waypoints[0];

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
    // Second tap on the kind already being read clears it, the same verb the board
    // uses: tapping the selected thing again dismisses its reading.
    if (buildFocus && selectedTowerKind === kind) {
      selectedTowerKind = null;
      buildFocus = false;
      return;
    }
    selectedTowerKind = kind;
    buildFocus = true;
    waveFocus = false;
  }

  window.addEventListener('keydown', (event) => {
    // Every shortcut below acts on a run, and in the shell there is none. Leaving them
    // live was harmless while nothing was drawn, but harmless is not the same as
    // decided: the one key with a job on this screen is whatever the focused button
    // already does with it, and swallowing Space would take that away.
    if (!state) return;
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
   * The build menu is one shape in both orientations - a column growing upward out
   * of a toggle in the bottom-left - and collapses in both. It lay down into a row
   * on a turned board for exactly one milestone, on the theory that a 3px side band
   * has no room for a column; true, but the column overlaps the board's edge either
   * way, and one shape that collapses beats two shapes that don't.
   *
   * Open by default, because building three towers should not cost three
   * reopenings, and because the game starts with 100 Cycles and nothing built.
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

  /**
   * Built before the layout pass rather than beside the rest of the chrome, because
   * `applyLayout()` decides what is on screen when there is no run and it is called
   * during setup - a shell created further down would be in its temporal dead zone.
   */
  const shell = createShell(document.body, RUNS, (run) => startRun(run));
  // Read once at boot. Nothing writes records except a run ending, so the shell can
  // hold them and be told when they move.
  shell.setRecords(readRecords(), []);

  function applyLayout(): void {
    // The only thing left that the two orientations disagree about: a turned board
    // leaves the console nearly window-wide, so there it steps right of the column.
    document.body.classList.toggle('turned', viewport.rotated);
    // The build menu is about the board, so it goes away with the board. The gear
    // column deliberately does not: it is about the session - sound, fullscreen, the
    // build under ABOUT - and all four of those are still true with no run on screen.
    dockToggle.hidden = state === null;
    toolbar.hidden = !menuOpen || state === null;
    // The two states are exclusive by construction: the shell is exactly the absence
    // of a run, so one expression decides both halves and they cannot disagree.
    shell.setVisible(state === null);
    // Same two glyphs the console's own collapse uses, so the two drawers in the
    // strip say "open me" and "close me" in one vocabulary.
    dockToggle.innerHTML = `<span>BLD</span><span>${menuOpen ? '[-]' : '[+]'}</span>`;
    placeToolbar();
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
  /**
   * The column's width, reserved even while the menu is shut. Shut it measures 0,
   * and a console that widened by 60px every time the menu closed would be the
   * readout reflowing to fill a gap the player only meant to look past.
   */
  let menuWidth = 0;

  function placeToolbar(): void {
    if (!toolbar.hidden && toolbar.offsetWidth > 0) menuWidth = toolbar.offsetWidth;
    const style = document.documentElement.style;
    const rect = boardRect(viewport);
    style.setProperty('--toolbar-left', `${Math.round(rect.left - menuWidth - BOARD_GAP)}px`);
    style.setProperty('--menu-w', `${Math.round(menuWidth)}px`);
  }
  // applyLayout() republishes the menu's measurements itself, so this is the only
  // call either of them needs at start-up.
  applyLayout();

  /**
   * Same parking trick as the build menu, on the other axis: the status bar tucks
   * into the letterbox above the board when the band is tall enough to hold it,
   * and sits on the board's top edge when it isn't.
   */
  const hud = createHud({ onWave: () => showWave() }, document.body);

  /**
   * The mixing desk, and the soundtrack plugged into it. Built this early on purpose:
   * the graph arms its gesture unlock the moment it exists, so the music is fetched on
   * the player's first tap rather than waiting for a tap that already happened.
   *
   * Nothing about the run is wired to either of them. The music is deliberately not on
   * the pause switch - pause here is for planning, and the brief's own bed layer is
   * defined as the thing that plays between waves.
   */
  const audio = createAudio();
  const music = audio ? startMusic(audio) : null;
  if (import.meta.env.DEV) Object.assign(window, { audio, music, startRun });

  // Right-anchored in the same band as the status glyphs. After the desk, because the
  // sound button reads it.
  let aboutOpen = false;

  function placeHud(): void {
    const rect = boardRect(viewport);
    document.documentElement.style.setProperty('--hud-top', `${Math.round(rect.top - HUD_HEIGHT - BOARD_GAP)}px`);
  }
  placeHud();

  const panel = createTowerPanel(
    {
      // The console is hidden while there is no run, so none of these can fire without
      // one. The guards are what the type system charges for being able to say that.
      onSell(tower) {
        if (state && sellTower(state, tower)) selection = null;
      },
      onUpgrade(tower) {
        if (state) upgradeTower(state, tower);
      },
      onOverclock(tower) {
        triggerOverclock(tower);
      },
      onTogglePause: togglePause,
      onToggleSpeed: toggleSpeed,
      onCallWave: () => {
        if (state) callWaveEarly(state);
      },
      onReload: () => updates.apply(),
    },
    document.body,
  );

  /**
   * Registration and the update check, and the console is where the answer surfaces.
   * `syncAbout` is called from three places - the toggle, the reload readiness callback,
   * and here to set the opening state - because the reading is a pair and either half
   * can move without the other.
   */
  const syncAbout = (): void => panel.setAbout(aboutOpen, updates.isReady());
  const updates = watchForUpdates(syncAbout);

  createTopTools(document.body, audio, (open) => {
    aboutOpen = open;
    syncAbout();
  });

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
    const style = document.documentElement.style;

    const height = panel.element.getBoundingClientRect().height;
    if (height > 0) style.setProperty('--panel-h', `${Math.round(height)}px`);

    style.setProperty('--panel-under-board', `${Math.round(rect.top + rect.height + BOARD_GAP)}px`);
  }

  // One hook for every way either box changes height: the console collapsing or
  // switching between its four modes, the drawer opening, closing or lying down.
  // Cheaper and more honest than calling placePanel() from each of the places that
  // might have done it.
  const dockObserver = new ResizeObserver(() => {
    placeToolbar();
    placePanel();
  });
  dockObserver.observe(panel.element);
  dockObserver.observe(toolbar);
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

  function updateToolbar(cycles: number): void {
    for (const { kind, button } of towerButtons) {
      button.classList.toggle('selected', kind === selectedTowerKind);
      // Marked as unaffordable rather than disabled: a disabled button swallows its
      // click, and picking a kind you can't afford yet is how you read its stats in
      // the panel. Placement is blocked by isPlaceable regardless.
      button.classList.toggle('short', cycles < towerStats(kind).cost);
    }
  }

  /**
   * The one door into a run, and the only place a `GameState` is ever built. It was
   * `resetGame()`, which is the same code under a name that assumed a run was always
   * running - the rename is the step.
   *
   * It takes the descriptor the shell was pointing at, which is what makes a second
   * entry in the list a line of data rather than a second path through this function.
   * Everything a run needs to be different from another run arrives through that
   * argument - today the map, later the kind of run and the difficulty.
   */
  function startRun(run: RunDescriptor): void {
    // The board is a bake of the map, so it is redone when, and only when, the map
    // under the run changes.
    if (run.map !== runMap) {
      runMap = run.map;
      board = prerenderBoard(runMap);
      spawnTile = runMap.waypoints[0];
    }
    state = createGameState(runMap);
    selection = null;
    buildFocus = false;
    waveFocus = false;
    previewedWave = 0;
    // Was missing from the reset this replaces, and writing down what a run owns is
    // what found it. Arm the port, lose before tapping it, tap to restart: the tap that
    // restarts returns before the line that disarms, so the fresh board opens with the
    // chevrons already lit. **And it is not only cosmetic** - the tick that disarms a
    // stale flag only fires when there is no wave to call, and a new run opens *in* a
    // countdown, so the flag survives it. The player's first tap on the port then calls
    // wave 1 early with no confirm, which is the one thing the port's two taps exist
    // to prevent.
    spawnArmed = false;
    runMs = 0;
    // Speed is a preference and survives; pause is a state, and starting into a frozen
    // board would read as the start having failed.
    paused = false;
    applyRunSpeed();
    // The dock's visibility is a function of there being a run, and this is the moment
    // that changes.
    applyLayout();
  }

  /**
   * File the run that just ended, and hand the shell whatever moved.
   *
   * Called on the tick the run ends rather than on the tap that leaves it. A player who
   * closes the tab on the verdict still set the record they set: it is a fact about the
   * run, not about whether they stayed to look at it.
   */
  function finishRun(run: GameState): void {
    const { records, beaten } = recordRun({
      cleared: run.status === 'won',
      wave: waveNumber(run.spawner),
      // The core's lost HP, which is what a leak has meant in this project since the
      // harness started counting them that way. Same definition or the record and the
      // balance table are two different claims wearing one word.
      leaks: MAX_CORE_HEALTH - run.coreHealth,
      durationMs: runMs,
    });
    shell.setRecords(records, beaten);
  }

  /**
   * The other side of `startRun()`: the run is over and the app goes back to the
   * before. Dropping the state is the whole of it - everything that describes a run is
   * re-established by `startRun()`, so there is nothing here to reset.
   *
   * Except the selection, which is not a reset but a release: it holds a tower or an
   * enemy from a run that no longer exists, and a dropped run that something still
   * points at is not dropped.
   *
   * The verdict is not carried out of here. It is on the board the player is still
   * looking at when they tap, and the shell has nothing to say about it yet - records
   * are the next step, and they are what the shell will read a finished run out of.
   */
  function endRun(): void {
    state = null;
    selection = null;
    applyLayout();
  }

  /** Nearest enemy whose sprite covers this world point, or null. */
  function enemyAt(run: GameState, x: number, y: number): Enemy | null {
    let nearest: Enemy | null = null;
    let nearestDist = Infinity;

    for (const enemy of run.enemies) {
      const pos = positionAlongPath(runMap.waypoints, enemy.distance);
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
    // No run, no board: in the shell the canvas is a backdrop, and step 2 puts the DOM
    // layer that *is* interactive on top of it.
    if (!state) return;
    // A finished run has one control left on the board, and it is the whole board:
    // the tap that used to restart now returns to the shell. It costs a tap to play
    // again, and that tap is this milestone's bet - the run ending somewhere is what
    // records and the update seam are waiting for.
    if (state.status !== 'playing') {
      endRun();
      return;
    }
    const tile = clientToGrid(viewport, event.clientX, event.clientY);

    // Tap resolves in one order: select a tower, else build, else inspect an enemy,
    // else clear. Building outranks inspecting deliberately - the oversized Zero-Day
    // sprite overhangs the trace onto buildable tiles, and losing a placement to a
    // boss walking past would be maddening. Enemies stay tappable over the trace,
    // which is where they always are.
    // The port is a control only while there is a wave to call. The rest of the time
    // the tap falls through to whatever happens to be standing on the tile, which is
    // what keeps a stray enemy from making the port unreachable and vice versa.
    const callable = nextWavePreview(state.spawner) !== null;
    if (callable && tile.x === spawnTile.x && tile.y === spawnTile.y) {
      if (spawnArmed) callWaveEarly(state);
      spawnArmed = !spawnArmed;
      return;
    }
    // Any other tap on the board disarms, the same way it clears a selection: an armed
    // port that survives the player looking at something else is a trap set for them.
    spawnArmed = false;

    const hitTower = towerAt(state, tile);
    if (hitTower) {
      const same = selection?.kind === 'tower' && selection.tower === hitTower;
      select(same ? null : { kind: 'tower', tower: hitTower });
      return;
    }

    // With no kind picked, an empty tile is just an empty tile - the tap falls
    // through to inspecting whatever is standing on it.
    if (selectedTowerKind && placeTower(state, selectedTowerKind, tile)) {
      selection = null;
      return;
    }

    const world = clientToWorld(viewport, event.clientX, event.clientY);
    const hitEnemy = enemyAt(state, world.x, world.y);
    if (hitEnemy) {
      const same = selection?.kind === 'enemy' && selection.enemy === hitEnemy;
      select(same ? null : { kind: 'enemy', enemy: hitEnemy });
      return;
    }
    selection = null;
  });

  const loop = new GameLoop(
    (dtMs) => {
      // The clock runs in the shell and nothing is stepped by it. Cheaper than stopping
      // and restarting the loop, and it leaves rAF available to whatever the shell
      // wants to animate - which is the step after this one.
      if (!state) return;
      const playing = state.status === 'playing';
      if (playing) runMs += dtMs;
      stepGame(state, dtMs, hooks);
      // The edge rather than the state: exactly one tick sees a run stop playing, so
      // exactly one files it, with no "already recorded" flag to keep in step.
      if (playing && state.status !== 'playing') finishRun(state);
      // A selected enemy can die or breach the core mid-tick; both paths set removed.
      if (selection?.kind === 'enemy' && selection.enemy.removed) selection = null;
      // The wave can arrive on its own while the port is armed; the chevrons go with it.
      if (spawnArmed && nextWavePreview(state.spawner) === null) spawnArmed = false;
    },
    () => {
      const timeMs = performance.now();
      // The shell frame: every readout in this game reports on a board, so with no board
      // there is nothing for any of them to say. The display is cleared rather than left
      // holding the last frame of a run that is over.
      if (!state) {
        hud.setVisible(false);
        panel.hide();
        clearDisplay(viewport);
        return;
      }
      updateToolbar(state.cycles);
      if (state.status === 'playing') {
        const incoming = nextWavePreview(state.spawner);
        // Each new countdown claims the console back from the build stats, once.
        if (incoming && incoming.number !== previewedWave) {
          previewedWave = incoming.number;
          buildFocus = false;
        }
        // Asked for explicitly; the tower being shopped for; the wave counting down;
        // and, with the build menu cleared, the wave on the board - because then
        // there is no tower for the console to read out instead.
        const reading = waveFocus
          ? currentWaveReading(state.spawner)
          : buildFocus && selectedTowerKind
            ? null
            : (incoming ?? (selectedTowerKind ? null : currentWaveReading(state.spawner)));

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
      const portCountdown = nextWavePreview(state.spawner);
      if (portCountdown) {
        drawSpawnPort(
          worldCtx,
          spawnTile,
          countdownSeconds(portCountdown.countdownMs),
          spawnArmed,
          timeMs,
          viewport.rotated,
        );
      }
      drawEnemies(worldCtx, state.enemies, runMap.waypoints, timeMs);
      if (selection?.kind === 'enemy') drawEnemySelection(worldCtx, selection.enemy, runMap.waypoints);
      drawProjectiles(worldCtx, state.projectiles);
      drawGlitchParticles(worldCtx, state.particles);
      if (hoverTile && selectedTowerKind && state.status === 'playing') {
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

  /**
   * Boot stops in the shell now: no run exists until the player starts one, which
   * retires the `?shell` scaffolding the previous step needed to look at a state
   * nothing could show yet.
   *
   * The loop starts either way. It steps nothing while there is no run, and rAF is
   * what the shell will animate on if it ever wants to.
   */
  loop.start();
}
