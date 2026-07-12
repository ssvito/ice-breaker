export type EnemyKind = 'worm' | 'trojan' | 'packetSniffer';

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
};

export function createEnemy(kind: EnemyKind): Enemy {
  const stats = ENEMY_STATS[kind];
  return { kind, distance: 0, speed: stats.speed, hp: stats.maxHp, maxHp: stats.maxHp, reward: stats.reward, removed: false };
}

/** Advances the enemy; returns true if it reached the end of the path. */
export function stepEnemy(enemy: Enemy, dtMs: number, pathLength: number): boolean {
  enemy.distance += enemy.speed * (dtMs / 1000);
  return enemy.distance >= pathLength;
}
