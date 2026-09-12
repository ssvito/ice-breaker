import { buildableTileSet, pathLength, positionAlongPath, rasterizePath } from './map.ts';
import type { GridPos, LevelData } from './map.ts';
import { createEnemy, damageTaken, enemyTraits, isHidden, isImmuneTo, stepEnemy } from './enemy.ts';
import type { Enemy, EnemyKind, WaveScale } from './enemy.ts';
import {
  applyUpgrade,
  canFire,
  createTower,
  effectiveFireIntervalMs,
  MUZZLE_FLASH_MS,
  sellValue,
  stepOverclock,
  towerCenter,
  triggerOverclock,
  towerStats,
  upgradeCost,
} from './tower.ts';
import type { Tower, TowerKind } from './tower.ts';
import { createProjectile, stepProjectile } from './projectile.ts';
import type { Projectile } from './projectile.ts';
import { createSpawner, nextWavePreview, stepSpawner, waveScale } from './wave.ts';
import type { Spawner } from './wave.ts';
import { createGlitchBurst, stepParticle } from './effects.ts';
import type { GlitchParticle } from './effects.ts';
import type { SpritePixel } from './sprites.ts';
import type { LoggedAction, LoggedLeak } from './run-log.ts';

/**
 * The simulation, and nothing else: no canvas, no DOM, no input. It used to live in
 * a closure inside startGame() reading a dozen locals, which meant the only way to
 * run a wave was to open a browser and watch it. Everything here takes an explicit
 * state object instead, so the same run can be stepped from a script - which is what
 * the balance harness needs, and what tuning ten waves by hand does not survive
 * without.
 *
 * Deliberately still mutation-in-place rather than immutable state: this is a game
 * loop running sixty times a second on phones, and the entity arrays are the same
 * ones the renderer walks.
 */

/**
 * One simulation tick. Lives here rather than in `game-loop.ts` because it is a
 * property of the simulation, not of the browser loop that happens to drive it:
 * the harness steps the same size tick with no loop at all.
 */
export const TICK_MS = 1000 / 60;

export const MAX_CORE_HEALTH = 5;
export const STARTING_CYCLES = 100;

export type GameStatus = 'playing' | 'won' | 'lost';

export interface GameState {
  readonly level: LevelData;
  /** Total path length in grid units; enemies measure their progress against it. */
  readonly pathLength: number;
  /** Tiles a tower may occupy, by placement rule. Derived from the level, never mutated. */
  readonly buildable: ReadonlySet<string>;
  readonly pathTiles: ReadonlySet<string>;
  readonly spawnKey: string;
  readonly coreKey: string;

  enemies: Enemy[];
  towers: Tower[];
  projectiles: Projectile[];
  particles: GlitchParticle[];
  /** Tiles already holding a tower. Kept alongside `towers` so placement is a lookup, not a scan. */
  occupied: Set<string>;

  spawner: Spawner;
  /**
   * Ticks stepped so far, and **the only clock the game and the harness share**. The
   * loop drives this state on ragged frames and the harness drives it in a bare `for`,
   * and neither can tell the other how long a frame was - but both step `TICK_MS` and
   * both land here. Everything that has to be true across that seam is counted in
   * ticks: the fastest-clear record, the harness's durations, and every entry in `log`.
   *
   * Counted only while the run is playing, so it stops where the verdict does rather
   * than where the player stopped looking at it.
   */
  tick: number;
  /**
   * What the player did, in the order they did it - see `run-log.ts`.
   *
   * Written by the action functions in this module rather than by their callers,
   * because **only they know whether an action happened**. A tap that cannot be
   * afforded and a tap on an occupied tile both reach `placeTower` and neither is an
   * event in the run; logging from the caller would file the intent and replay would
   * then be reproducing a run nobody played. Every action below already returns whether
   * it took effect, so the record costs a line at the point of the fact.
   *
   * On the state and not beside it, which also means the determinism gate compares it:
   * two runs that agree on everything else and disagree here are not the same run.
   */
  actions: LoggedAction[];
  /**
   * What walked through, and **the other kind of thing entirely**: actions are the input
   * a replay feeds back, and this is one of the outputs it is checked against. A replay
   * that reaches the same core HP by leaking a different wave agrees with the verdict and
   * disagrees here, which is the failure worth catching.
   *
   * Enemies and not hit points. Every other leak count in the project is the core's lost
   * HP - the record, the harness's tables - and that definition stays; this is not the
   * same number, because a Zero-Day takes three of them by itself.
   */
  leaks: LoggedLeak[];
  coreHealth: number;
  cycles: number;
  status: GameStatus;
  /**
   * A run-wide multiplier over every wave's own `hpScale`. 1 in the game and never
   * touched there; the harness moves it to ask *how much harder* a curve would have to
   * be before a board breaks, which is the question "won or lost" cannot answer.
   *
   * It is state on the run rather than an argument to the spawner because there is no
   * curve to inject: `stepSpawner` and `waveScale` read the module-level `waves` and
   * always will, since the curve is the game's content and not a parameter of it. So the
   * scalar rides the one thing a caller does own - the state it created.
   */
  readonly hpScale: number;
}

/**
 * The one thing the simulation cannot compute for itself. The kill effect scatters
 * the dead enemy's actual sprite pixels, and those live in the baked atlas - a
 * canvas. Injecting the lookup keeps `sprites.ts` out of here entirely: with no
 * hook (a headless run) no particles are created, which also happens to remove the
 * only `Math.random()` the simulation can reach.
 */
export interface GameHooks {
  enemyPixels?(kind: EnemyKind): SpritePixel[];
}

function tileKey(tile: GridPos): string {
  return `${tile.x},${tile.y}`;
}

/**
 * `hpScale` is the run-wide toughness scalar, and the only reason `createGameState`
 * takes options at all. Defaulted so every caller in the game reads exactly as it did.
 */
export interface GameOptions {
  hpScale?: number;
}

export function createGameState(level: LevelData, options: GameOptions = {}): GameState {
  const waypoints = level.waypoints;
  return {
    level,
    pathLength: pathLength(waypoints),
    buildable: buildableTileSet(level),
    pathTiles: new Set(rasterizePath(waypoints).map(tileKey)),
    spawnKey: tileKey(waypoints[0]),
    coreKey: tileKey(waypoints[waypoints.length - 1]),

    enemies: [],
    towers: [],
    projectiles: [],
    particles: [],
    occupied: new Set(),

    spawner: createSpawner(),
    tick: 0,
    actions: [],
    leaks: [],
    coreHealth: MAX_CORE_HEALTH,
    cycles: STARTING_CYCLES,
    status: 'playing',
    hpScale: options.hpScale ?? 1,
  };
}

export function towerAt(state: GameState, tile: GridPos): Tower | null {
  return state.towers.find((tower) => tower.x === tile.x && tower.y === tile.y) ?? null;
}

/** Whether this kind can be built on this tile right now - tile rule and price both. */
export function isPlaceable(state: GameState, kind: TowerKind, tile: GridPos): boolean {
  const key = tileKey(tile);
  if (state.occupied.has(key)) return false;

  const stats = towerStats(kind);
  const validTile =
    stats.placement === 'onPath'
      ? state.pathTiles.has(key) && key !== state.spawnKey && key !== state.coreKey
      : state.buildable.has(key);

  return validTile && state.cycles >= stats.cost;
}

/** Builds and charges for a tower, or returns null if the tile or the balance refuses. */
export function placeTower(state: GameState, kind: TowerKind, tile: GridPos): Tower | null {
  if (!isPlaceable(state, kind, tile)) return null;

  const tower = createTower(kind, tile.x, tile.y);
  state.towers.push(tower);
  state.occupied.add(tileKey(tile));
  state.cycles -= towerStats(kind).cost;
  state.actions.push({ tick: state.tick, action: 'place', tower: kind, x: tile.x, y: tile.y });
  return tower;
}

/** Refunds and removes a tower, freeing its tile. False if it was already gone. */
export function sellTower(state: GameState, tower: Tower): boolean {
  const index = state.towers.indexOf(tower);
  if (index === -1) return false;

  state.towers.splice(index, 1);
  state.occupied.delete(tileKey(tower));
  state.cycles += sellValue(tower);
  state.actions.push({ tick: state.tick, action: 'sell', x: tower.x, y: tower.y });
  return true;
}

/** Buys the next tier, or returns false at max tier or short on Cycles. */
export function upgradeTower(state: GameState, tower: Tower): boolean {
  const cost = upgradeCost(tower);
  if (cost === null || state.cycles < cost) return false;

  state.cycles -= cost;
  applyUpgrade(tower);
  state.actions.push({ tick: state.tick, action: 'upgrade', x: tower.x, y: tower.y });
  return true;
}

/**
 * Starts the wave being counted down to, right now, and pays for the seconds
 * skipped. Returns the Cycles paid, or 0 when there is nothing to call - mid-wave,
 * or after the last one.
 *
 * The bonus turns the lull from dead time into the run's recurring bet: bank the
 * seconds and build, or take the money and meet the wave with what you have. It
 * lands after the preview on purpose, because paying a player for a decision whose
 * terms are hidden is a slot machine, not a decision.
 */
export function callWaveEarly(state: GameState): number {
  if (state.status !== 'playing') return 0;

  const preview = nextWavePreview(state.spawner);
  if (!preview) return 0;

  state.cycles += preview.earlyBonus;
  state.actions.push({ tick: state.tick, action: 'call' });
  // Zero rather than negative: the next tick takes it below zero and opens the
  // wave, through the same branch a countdown that ran out would have taken.
  state.spawner.waveTimerMs = 0;
  return preview.earlyBonus;
}

/**
 * Fires a tower's Overclock, and the only reason this wrapper exists is the log.
 *
 * `triggerOverclock` takes a tower and knows nothing about a run, which was right while
 * the only caller was `main.ts` reacting to a tap. But it is an action a player takes,
 * so it is an action a replay has to reproduce, and the log lives on the state - so the
 * one call that a run should remember comes through here. The refusals stay where they
 * were: no Overclock, or already boosted, and nothing is logged because nothing happened.
 *
 * It is also the seam the harness needs. Every margin table this project has printed
 * carries the caveat that no reading has ever used Overclock, and the reason is that the
 * ability had no state-aware entry point for `balance.ts` to call.
 */
export function overclockTower(state: GameState, tower: Tower): boolean {
  if (!triggerOverclock(tower)) return false;
  state.actions.push({ tick: state.tick, action: 'overclock', x: tower.x, y: tower.y });
  return true;
}

/** Nearest enemy in range that this tower is able to hurt, or null. */
export function findTarget(state: GameState, tower: Tower): Enemy | null {
  const center = towerCenter(tower);
  let nearest: Enemy | null = null;
  let nearestDist = Infinity;

  for (const enemy of state.enemies) {
    // Two ways a tower can be unable to hurt something in its radius, and they are not
    // the same shape: immunity is about this tower, and hiding is about every tower.
    if (isHidden(enemy)) continue;
    if (isImmuneTo(enemy.kind, tower.kind)) continue;
    const pos = positionAlongPath(state.level.waypoints, enemy.distance);
    const dist = Math.hypot(pos.x - center.x, pos.y - center.y);
    if (dist <= tower.range && dist < nearestDist) {
      nearest = enemy;
      nearestDist = dist;
    }
  }

  return nearest;
}

/**
 * The wave's own scaling, times whatever the run was created with. Returns the wave's
 * record untouched at the default of 1, so the game allocates nothing per spawn and the
 * scalar costs the simulation a comparison it was already making.
 */
function runScale(state: GameState): WaveScale {
  const scale = waveScale(state.spawner);
  if (state.hpScale === 1) return scale;
  return { hp: scale.hp * state.hpScale, speed: scale.speed };
}

/**
 * One fixed simulation tick. `dtMs` is always the loop's TICK_MS - speed changes the
 * number of ticks per frame, never the size of one, so a run produces the same
 * numbers whether it is watched at 1x, at 2x, or not watched at all.
 */
export function stepGame(state: GameState, dtMs: number, hooks: GameHooks = {}): void {
  if (state.status !== 'playing') return;

  state.tick++;

  const waypoints = state.level.waypoints;

  const spawnKinds = stepSpawner(state.spawner, dtMs);
  if (spawnKinds.length > 0) {
    // Read after stepping, never before: the tick a wave opens is a tick that both
    // advances the wave index and spawns, and the enemies belong to the new wave.
    const scale = runScale(state);
    for (const kind of spawnKinds) state.enemies.push(createEnemy(kind, scale));
  }

  // One pass for both aura effects, because they answer the same question - which
  // enemies is this tower covering - and asking it twice would be two traversals of the
  // same pairs. Reveal is cleared first and rebuilt from scratch rather than expiring,
  // because an aura is a place and not a status: step out of the radius and the next
  // tick has already forgotten you were in it.
  for (const enemy of state.enemies) enemy.revealed = false;

  const slowFactor = new Map<Enemy, number>();
  for (const tower of state.towers) {
    const reveals = towerStats(tower.kind).reveals === true;
    if (tower.slowMultiplier === undefined && !reveals) continue;
    const center = towerCenter(tower);
    for (const enemy of state.enemies) {
      const pos = positionAlongPath(waypoints, enemy.distance);
      const dist = Math.hypot(pos.x - center.x, pos.y - center.y);
      if (dist > tower.range) continue;
      if (tower.slowMultiplier !== undefined) {
        slowFactor.set(enemy, Math.min(slowFactor.get(enemy) ?? 1, tower.slowMultiplier));
      }
      if (reveals) enemy.revealed = true;
    }
  }

  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i];
    const reachedCore = stepEnemy(enemy, dtMs, state.pathLength, slowFactor.get(enemy) ?? 1);
    if (!reachedCore) continue;

    enemy.removed = true;
    state.enemies.splice(i, 1);
    state.coreHealth = Math.max(0, state.coreHealth - enemy.coreDamage);
    state.leaks.push({ tick: state.tick, kind: enemy.kind });
    if (state.coreHealth === 0) state.status = 'lost';
  }

  for (const tower of state.towers) {
    stepOverclock(tower, dtMs);
    if (tower.flashMs > 0) tower.flashMs = Math.max(0, tower.flashMs - dtMs);

    if (tower.slowMultiplier !== undefined || !canFire(tower)) continue;

    tower.cooldownMs -= dtMs;
    if (tower.cooldownMs > 0) continue;

    const target = findTarget(state, tower);
    if (!target) continue;

    state.projectiles.push(createProjectile(towerCenter(tower), target, tower.damage, tower.kind === 'aesTurret'));
    tower.cooldownMs = effectiveFireIntervalMs(tower);
    tower.flashMs = MUZZLE_FLASH_MS;
  }

  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const projectile = state.projectiles[i];
    if (projectile.target.removed) {
      state.projectiles.splice(i, 1);
      continue;
    }

    const targetPos = positionAlongPath(waypoints, projectile.target.distance);
    const hit = stepProjectile(projectile, dtMs, targetPos);
    if (!hit) continue;

    projectile.target.hp -= damageTaken(projectile.target.kind, projectile.damage);
    if (projectile.target.hp <= 0) {
      projectile.target.removed = true;
      state.cycles += projectile.target.reward;
      const idx = state.enemies.indexOf(projectile.target);
      if (idx !== -1) state.enemies.splice(idx, 1);

      const pixels = hooks.enemyPixels?.(projectile.target.kind);
      if (pixels) {
        const deathPos = positionAlongPath(waypoints, projectile.target.distance);
        state.particles.push(...createGlitchBurst(deathPos.x, deathPos.y, pixels));
      }

      const splitKinds = enemyTraits(projectile.target.kind).splitsInto;
      if (splitKinds) {
        splitKinds.forEach((kind, i) => {
          // Children inherit the wave their parent was born under, not whatever
          // wave is running when the parent finally dies.
          const child = createEnemy(kind, projectile.target.scale);
          child.distance = Math.max(0, projectile.target.distance - i * 0.4);
          state.enemies.push(child);
        });
      }
    }
    state.projectiles.splice(i, 1);
  }

  /**
   * The curve is out of waves and the board is clear, so the run is won - **unless it
   * was already lost**, and that guard is the whole of this line.
   *
   * Without it the two endings race on a single tick and the loss always loses. The last
   * enemy of the last wave reaches the core, takes the final HP and sets `lost` - and
   * then despawns, which empties `state.enemies` and satisfies this condition in the
   * same `stepGame` call. The run reports SYSTEM SECURED with the core on zero.
   *
   * Not cosmetic: `recordRun` files a result as a clear on `status === 'won'`, so that
   * run would take the fastest-clear and fewest-leaks records having been killed by the
   * last thing on the board. Found by the harness printing `won 0/5` while a second
   * board was being redrawn, which is the harness catching something the game has been
   * carrying since v1 - the ending only became reachable when a board got close enough
   * to the curve for the final enemy to be the one that kills you.
   */
  if (state.status === 'playing' && state.spawner.state === 'done' && state.enemies.length === 0) {
    state.status = 'won';
  }

  for (let i = state.particles.length - 1; i >= 0; i--) {
    if (!stepParticle(state.particles[i], dtMs)) state.particles.splice(i, 1);
  }
}
