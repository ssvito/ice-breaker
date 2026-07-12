export interface WaveDefinition {
  count: number;
  spawnIntervalMs: number;
}

export const waves: WaveDefinition[] = [
  { count: 5, spawnIntervalMs: 1200 },
  { count: 8, spawnIntervalMs: 900 },
  { count: 12, spawnIntervalMs: 700 },
];

export const INITIAL_WAVE_DELAY_MS = 3000;
export const BETWEEN_WAVE_DELAY_MS = 4000;

export type SpawnState = 'countdown' | 'spawning' | 'waiting-clear' | 'done';

export interface Spawner {
  waveIndex: number; // -1 before the first wave starts
  state: SpawnState;
  waveTimerMs: number;
  spawnTimerMs: number;
  spawnedInWave: number;
}

export function createSpawner(): Spawner {
  return {
    waveIndex: -1,
    state: 'countdown',
    waveTimerMs: INITIAL_WAVE_DELAY_MS,
    spawnTimerMs: 0,
    spawnedInWave: 0,
  };
}

/**
 * Advances the spawner and returns true exactly on the tick a new enemy
 * should be spawned. Caller is responsible for creating the enemy and
 * reporting the current live enemy count (so a wave can wait to clear).
 */
export function stepSpawner(spawner: Spawner, dtMs: number, liveEnemyCount: number): boolean {
  if (spawner.state === 'countdown') {
    spawner.waveTimerMs -= dtMs;
    if (spawner.waveTimerMs > 0) return false;

    spawner.waveIndex++;
    if (spawner.waveIndex >= waves.length) {
      spawner.state = 'done';
      return false;
    }
    spawner.spawnedInWave = 0;
    spawner.spawnTimerMs = 0;
    spawner.state = 'spawning';
    return false;
  }

  if (spawner.state === 'spawning') {
    spawner.spawnTimerMs -= dtMs;
    if (spawner.spawnTimerMs > 0) return false;

    const wave = waves[spawner.waveIndex];
    spawner.spawnedInWave++;
    spawner.spawnTimerMs = wave.spawnIntervalMs;
    if (spawner.spawnedInWave >= wave.count) spawner.state = 'waiting-clear';
    return true;
  }

  if (spawner.state === 'waiting-clear' && liveEnemyCount === 0) {
    spawner.state = 'countdown';
    spawner.waveTimerMs = BETWEEN_WAVE_DELAY_MS;
  }

  return false;
}

export function waveLabel(spawner: Spawner): string {
  if (spawner.state === 'done') return 'ALL WAVES CLEARED';
  const displayIndex = Math.max(0, spawner.waveIndex) + 1;
  return `WAVE ${displayIndex}/${waves.length}`;
}
