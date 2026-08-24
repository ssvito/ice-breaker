import type { TowerKind } from './tower.ts';

export type EnemyKind = 'worm' | 'trojan' | 'packetSniffer' | 'ransomware' | 'encryptor' | 'zeroDay';

export interface Enemy {
  kind: EnemyKind;
  distance: number; // grid units travelled along the path
  speed: number; // grid units per second
  hp: number;
  maxHp: number;
  reward: number; // Cycles earned on kill
  coreDamage: number; // core HP lost if it arrives
  hpScale: number; // the wave's HP multiplier it was born under; split children inherit it
  removed: boolean; // left play, either killed or reached the core
}

interface EnemyStats {
  name: string;
  speed: number;
  maxHp: number;
  reward: number;
  /**
   * Core HP a breach costs. One for everything that is not a boss - and five for
   * the Zero-Day, which is the whole core, so wave 10 is a wave you either stop or
   * lose to. Before this the boss walking into the core cost exactly what a Worm
   * costs and the run still ended in SYSTEM SECURED, which the balance harness
   * caught and no amount of playing had.
   */
  coreDamage: number;
}

/**
 * Bounties are sized against the run, not against each other: ten waves pay out
 * 409 Cycles on top of the 100 the run starts with, and topping out all four
 * towers costs 570. They came down when the curve went from four waves to
 * ten - at the old rates the same curve paid for the entire tier ladder and left
 * change, which is the one thing the ladder cannot survive.
 */
const ENEMY_STATS: Record<EnemyKind, EnemyStats> = {
  worm: { name: 'WORM', speed: 2, maxHp: 3, reward: 4, coreDamage: 1 },
  trojan: { name: 'TROJAN', speed: 1, maxHp: 8, reward: 10, coreDamage: 1 },
  packetSniffer: { name: 'PACKET SNIFFER', speed: 4, maxHp: 1, reward: 2, coreDamage: 1 },
  ransomware: { name: 'RANSOMWARE', speed: 1.5, maxHp: 4, reward: 5, coreDamage: 1 },
  encryptor: { name: 'ENCRYPTOR', speed: 2, maxHp: 2, reward: 2, coreDamage: 1 },
  zeroDay: { name: 'ZERO-DAY', speed: 0.8, maxHp: 40, reward: 50, coreDamage: 3 },
};

export function enemyStats(kind: EnemyKind): EnemyStats {
  return ENEMY_STATS[kind];
}

/** Enemy kinds that spawn replacements on death, and what they spawn. */
const SPLIT_ON_DEATH: Partial<Record<EnemyKind, EnemyKind[]>> = {
  ransomware: ['encryptor', 'encryptor'],
};

/** Enemy kinds that take no damage from a specific tower kind. */
const IMMUNE_TO: Partial<Record<EnemyKind, TowerKind>> = {
  zeroDay: 'aesTurret',
};

/**
 * `hpScale` is the wave's toughness multiplier (see `wave.ts`). It moves HP and
 * nothing else - not speed, not the bounty - so a late wave is a harder wave and
 * not a richer one, which is the only way the curve can keep threatening a
 * tier-3 board without paying for the tier-4 that does not exist.
 */
export function createEnemy(kind: EnemyKind, hpScale = 1): Enemy {
  const stats = ENEMY_STATS[kind];
  const maxHp = Math.max(1, Math.round(stats.maxHp * hpScale));
  return {
    kind,
    distance: 0,
    speed: stats.speed,
    hp: maxHp,
    maxHp,
    reward: stats.reward,
    coreDamage: stats.coreDamage,
    hpScale,
    removed: false,
  };
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

/** The tower kind this enemy shrugs off, or null. Same table isImmuneTo reads. */
export function immuneTowerKind(kind: EnemyKind): TowerKind | null {
  return IMMUNE_TO[kind] ?? null;
}
