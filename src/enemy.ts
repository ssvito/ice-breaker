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

/**
 * Everything a kind does beyond walking, dying and being worth Cycles. One optional
 * field per behavior, and a kind with no entry is the ordinary case: shoot it.
 *
 * One record rather than a table per behavior, which is what this was. Splitting and
 * immunity each had their own `Partial<Record<EnemyKind, ...>>`, their own accessor,
 * and their own branch in the console - three places to touch per behavior, times
 * however many behaviors get added. Adding one here is a field, a line in `TRAITS`,
 * and a line in the console's row table.
 */
export interface EnemyTraits {
  /** Takes no damage at all from this tower kind. */
  immuneTo?: TowerKind;
  /** Spawns these at the same path position when a tower kills it. */
  splitsInto?: EnemyKind[];
}

const TRAITS: Partial<Record<EnemyKind, EnemyTraits>> = {
  ransomware: { splitsInto: ['encryptor', 'encryptor'] },
  zeroDay: { immuneTo: 'aesTurret' },
};

/** Shared and never mutated, so the common case allocates nothing on a hot path. */
const NO_TRAITS: EnemyTraits = {};

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

/** What this kind does beyond the ordinary. Never null - a kind with no traits reads as empty. */
export function enemyTraits(kind: EnemyKind): EnemyTraits {
  return TRAITS[kind] ?? NO_TRAITS;
}

/**
 * Kept as its own predicate rather than read off the traits at the call site, because
 * the caller is the targeting loop: it asks this of every enemy for every tower on
 * every tick, and `isImmuneTo(enemy.kind, tower.kind)` says what that loop means.
 */
export function isImmuneTo(kind: EnemyKind, towerKind: TowerKind): boolean {
  return enemyTraits(kind).immuneTo === towerKind;
}
