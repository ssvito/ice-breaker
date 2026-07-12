import type { EnemyKind } from './enemy.ts';

export interface SpawnGroup {
  enemyKind: EnemyKind;
  count: number;
  spawnIntervalMs: number;
}

export interface WaveDefinition {
  groups: SpawnGroup[];
}

export const waves: WaveDefinition[] = [
  { groups: [{ enemyKind: 'worm', count: 5, spawnIntervalMs: 1200 }] },
  {
    groups: [
      { enemyKind: 'worm', count: 5, spawnIntervalMs: 900 },
      { enemyKind: 'trojan', count: 3, spawnIntervalMs: 1500 },
      { enemyKind: 'ransomware', count: 2, spawnIntervalMs: 1500 },
    ],
  },
  {
    groups: [
      { enemyKind: 'packetSniffer', count: 10, spawnIntervalMs: 400 },
      { enemyKind: 'trojan', count: 4, spawnIntervalMs: 1400 },
    ],
  },
  { groups: [{ enemyKind: 'zeroDay', count: 1, spawnIntervalMs: 0 }] },
];

export const INITIAL_WAVE_DELAY_MS = 3000;
export const BETWEEN_WAVE_DELAY_MS = 4000;

export type SpawnState = 'countdown' | 'spawning' | 'waiting-clear' | 'done';

export interface Spawner {
  waveIndex: number; // -1 before the first wave starts
  groupIndex: number;
  state: SpawnState;
  waveTimerMs: number;
  spawnTimerMs: number;
  spawnedInGroup: number;
}

export function createSpawner(): Spawner {
  return {
    waveIndex: -1,
    groupIndex: 0,
    state: 'countdown',
    waveTimerMs: INITIAL_WAVE_DELAY_MS,
    spawnTimerMs: 0,
    spawnedInGroup: 0,
  };
}

/**
 * Advances the spawner and returns the enemy kind to spawn on the tick a
 * new enemy is due, or null otherwise. Caller creates the enemy and
 * reports the current live enemy count (so a wave can wait to clear).
 */
export function stepSpawner(spawner: Spawner, dtMs: number, liveEnemyCount: number): EnemyKind | null {
  if (spawner.state === 'countdown') {
    spawner.waveTimerMs -= dtMs;
    if (spawner.waveTimerMs > 0) return null;

    spawner.waveIndex++;
    if (spawner.waveIndex >= waves.length) {
      spawner.state = 'done';
      return null;
    }
    spawner.groupIndex = 0;
    spawner.spawnedInGroup = 0;
    spawner.spawnTimerMs = 0;
    spawner.state = 'spawning';
    return null;
  }

  if (spawner.state === 'spawning') {
    spawner.spawnTimerMs -= dtMs;
    if (spawner.spawnTimerMs > 0) return null;

    const wave = waves[spawner.waveIndex];
    const group = wave.groups[spawner.groupIndex];
    spawner.spawnedInGroup++;
    spawner.spawnTimerMs = group.spawnIntervalMs;

    if (spawner.spawnedInGroup >= group.count) {
      spawner.groupIndex++;
      spawner.spawnedInGroup = 0;
      if (spawner.groupIndex >= wave.groups.length) spawner.state = 'waiting-clear';
    }

    return group.enemyKind;
  }

  if (spawner.state === 'waiting-clear' && liveEnemyCount === 0) {
    spawner.state = 'countdown';
    spawner.waveTimerMs = BETWEEN_WAVE_DELAY_MS;
  }

  return null;
}

export function waveLabel(spawner: Spawner): string {
  if (spawner.state === 'done') return 'ALL WAVES CLEARED';
  const displayIndex = Math.max(0, spawner.waveIndex) + 1;
  return `WAVE ${displayIndex}/${waves.length}`;
}
