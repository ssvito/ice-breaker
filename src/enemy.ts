import type { TowerKind } from './tower.ts';

export type EnemyKind = 'worm' | 'trojan' | 'packetSniffer' | 'ransomware' | 'encryptor' | 'zeroDay';

export interface Enemy {
  kind: EnemyKind;
  distance: number; // grid units travelled along the path
  speed: number; // grid units per second
  hp: number;
  maxHp: number;
  reward: number; // Cycles earned on kill
  removed: boolean; // left play, either killed or reached the core
}

interface EnemyStats {
  speed: number;
  maxHp: number;
  reward: number;
}

const ENEMY_STATS: Record<EnemyKind, EnemyStats> = {
  worm: { speed: 2, maxHp: 3, reward: 5 },
  trojan: { speed: 1, maxHp: 8, reward: 12 },
  packetSniffer: { speed: 4, maxHp: 1, reward: 2 },
  ransomware: { speed: 1.5, maxHp: 4, reward: 6 },
  encryptor: { speed: 2, maxHp: 2, reward: 3 },
  zeroDay: { speed: 0.8, maxHp: 40, reward: 50 },
};

/** Enemy kinds that spawn replacements on death, and what they spawn. */
const SPLIT_ON_DEATH: Partial<Record<EnemyKind, EnemyKind[]>> = {
  ransomware: ['encryptor', 'encryptor'],
};

/** Enemy kinds that take no damage from a specific tower kind. */
const IMMUNE_TO: Partial<Record<EnemyKind, TowerKind>> = {
  zeroDay: 'aesTurret',
};

export function createEnemy(kind: EnemyKind): Enemy {
  const stats = ENEMY_STATS[kind];
  return { kind, distance: 0, speed: stats.speed, hp: stats.maxHp, maxHp: stats.maxHp, reward: stats.reward, removed: false };
}

/** Advances the enemy (speedMultiplier < 1 applies an aura slow for this tick); returns true if it reached the end of the path. */
export function stepEnemy(enemy: Enemy, dtMs: number, pathLength: number, speedMultiplier = 1): boolean {
  enemy.distance += enemy.speed * speedMultiplier * (dtMs / 1000);
  return enemy.distance >= pathLength;
}

/** Enemy kinds to spawn (at the same path position) when this kind is killed by a tower. */
export function getSplitKinds(kind: EnemyKind): EnemyKind[] | null {
  return SPLIT_ON_DEATH[kind] ?? null;
}

export function isImmuneTo(kind: EnemyKind, towerKind: TowerKind): boolean {
  return IMMUNE_TO[kind] === towerKind;
}
