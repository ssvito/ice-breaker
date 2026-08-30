import type { TowerKind } from './tower.ts';

export type EnemyKind =
  | 'worm'
  | 'trojan'
  | 'packetSniffer'
  | 'ransomware'
  | 'encryptor'
  | 'beacon'
  | 'packer'
  | 'rootkit'
  | 'zeroDay';

/**
 * What a wave makes of the things it spawns. One record rather than a parameter per
 * axis, and for the same reason `EnemyTraits` is one record rather than a table per
 * behavior: the second axis is the one that shows you the shape of the first. `hpScale`
 * alone was a number threaded through `waveHpScale`, `createEnemy`, a field on `Enemy`
 * and the split that inherits it - four places that would each have grown a twin.
 *
 * It lives here rather than in `wave.ts` because the consumer is `createEnemy`, and a
 * type-only import back from `enemy.ts` to `wave.ts` would close a cycle in the module
 * graph to say something `enemy.ts` already knows: a wave is where this comes from, and
 * birth is where it is spent.
 */
export interface WaveScale {
  /** Multiplies maxHp, floored at 1. */
  hp: number;
  /**
   * Multiplies `enemy.speed` **at birth**, which is what makes it an axis a BEACON
   * obeys. See `stepEnemy`: `enemy.speed` is what the enemy *is* and `speedMultiplier`
   * is what is being *done to it*, and `fixedMovement` only ever refuses the second.
   * A speed axis written as a per-tick multiplier would have handed the one kind
   * defined to ignore multipliers a quiet exemption from the difficulty curve.
   */
  speed: number;
}

/** The ordinary wave: no scaling at all. Shared and never mutated. */
export const BASE_SCALE: WaveScale = { hp: 1, speed: 1 };

export interface Enemy {
  kind: EnemyKind;
  distance: number; // grid units travelled along the path
  speed: number; // grid units per second
  hp: number;
  maxHp: number;
  reward: number; // Cycles earned on kill
  coreDamage: number; // core HP lost if it arrives
  scale: WaveScale; // the wave's scaling it was born under; split children inherit it
  /**
   * Whether a revealing aura is covering it *right now*. Recomputed from scratch every
   * tick rather than carried, because an aura is a place and not a status effect: walk
   * out of the radius and it is dark again on the next tick, with nothing to expire.
   * Meaningless on a kind without `stealth`, which is why `isHidden` is the thing to
   * ask rather than this field.
   */
  revealed: boolean;
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
 * Bounties are sized against the run, not against each other. They came down twice, both
 * times because the run got longer: once when the curve went from four waves to ten, and
 * again at fifteen, where the arithmetic left no choice at all. The ladder costs 570 to
 * top out and did not get longer when the run did, so the purse has to stay under it
 * whatever the curve's length - and five more waves at the ten-wave rates paid out 580
 * on their own, a third over the ceiling, with no shape of curve able to fix it. The
 * shape was tried first: even three extra waves overshot.
 *
 * So the table is derived rather than nudged. **A kind is worth its base HP**, with a
 * premium for the two that are worth more than their HP says: the ROOTKIT, which costs a
 * tower purchase before it can be shot at all, and nothing else. The old table was 1.25x
 * HP across the board with a 2x on both the Packet Sniffer and the ROOTKIT, and the
 * Sniffer's premium is the one that went: at 1 HP it is the cheapest kill in the game,
 * and paying double for it is what made the 53 sniffers in the curve a quarter of the
 * whole purse. Now the one body the curve uses to make a wave *crowded* is the one body
 * that barely pays, which is what lets act two crowd the board without inflating the
 * economy - counts are the bounty, and this is the kind whose count is free.
 *
 * `hpScale` and `speedScale` never touch any of this: a harder wave is not a richer one.
 */
const ENEMY_STATS: Record<EnemyKind, EnemyStats> = {
  worm: { name: 'WORM', speed: 2, maxHp: 3, reward: 3, coreDamage: 1 },
  trojan: { name: 'TROJAN', speed: 1, maxHp: 8, reward: 8, coreDamage: 1 },
  packetSniffer: { name: 'PACKET SNIFFER', speed: 4, maxHp: 1, reward: 1, coreDamage: 1 },
  ransomware: { name: 'RANSOMWARE', speed: 1.5, maxHp: 4, reward: 4, coreDamage: 1 },
  encryptor: { name: 'ENCRYPTOR', speed: 2, maxHp: 2, reward: 2, coreDamage: 1 },
  beacon: { name: 'BEACON', speed: 2.5, maxHp: 4, reward: 4, coreDamage: 1 },
  packer: { name: 'PACKER', speed: 1.5, maxHp: 6, reward: 6, coreDamage: 1 },
  rootkit: { name: 'ROOTKIT', speed: 2, maxHp: 3, reward: 5, coreDamage: 1 },
  zeroDay: { name: 'ZERO-DAY', speed: 0.8, maxHp: 40, reward: 40, coreDamage: 3 },
};

export function enemyStats(kind: EnemyKind): EnemyStats {
  return ENEMY_STATS[kind];
}

/** Every kind there is, in declaration order. The roster, for anything that has to walk it. */
export const ENEMY_KINDS = Object.keys(ENEMY_STATS) as EnemyKind[];

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
  /**
   * Moves at its own speed and nothing changes it - the slow auras included. Stated
   * as what it *is* rather than as a list of effects it resists, which is what lets
   * `stepEnemy` enforce it in one place. See `stepEnemy` for why that matters.
   */
  fixedMovement?: true;
  /**
   * Flat damage subtracted from every hit, floored at zero rather than at one. A floor
   * of one would keep every board working and make armor a tax; at zero a tier-1
   * Firewall Node is not slowed against this, it is useless, and that is a question
   * with two answers - upgrade, or bring a bigger gun. See `damageTaken`.
   */
  armor?: number;
  /**
   * Cannot be targeted at all unless a revealing tower is covering it. The one trait
   * whose answer is a specific tower, which is why the reveal is a tower ability rather
   * than something the enemy carries - the kind justifies the ability, and the ability
   * is what keeps the kind from being a wall.
   */
  stealth?: true;
}

const TRAITS: Partial<Record<EnemyKind, EnemyTraits>> = {
  ransomware: { splitsInto: ['encryptor', 'encryptor'] },
  beacon: { fixedMovement: true },
  packer: { armor: 1 },
  rootkit: { stealth: true },
  zeroDay: { immuneTo: 'aesTurret' },
};

/** Shared and never mutated, so the common case allocates nothing on a hot path. */
const NO_TRAITS: EnemyTraits = {};

/**
 * `scale` is what the wave makes of this one (see `wave.ts`). Both axes move what the
 * enemy *is* and neither moves the bounty, so a late wave is a harder wave and never a
 * richer one - the only way the curve can keep threatening a tier-3 board without
 * paying for the tier-4 that does not exist.
 *
 * The two axes ask different questions of the same board, which is the reason there are
 * two: HP asks whether the guns are big enough, and speed asks whether they cover enough
 * trace, because it buys the enemy less time inside every radius on the map. An upgraded
 * board answers the first by construction - damage per tier climbs faster than any
 * multiplier the curve dares - and has to answer the second with placement.
 */
export function createEnemy(kind: EnemyKind, scale: WaveScale = BASE_SCALE): Enemy {
  const stats = ENEMY_STATS[kind];
  const maxHp = Math.max(1, Math.round(stats.maxHp * scale.hp));
  return {
    kind,
    distance: 0,
    // No rounding, unlike HP: speed is already fractional (0.8 to 4), so there is no
    // step for a small multiplier to disappear into or to jump across.
    speed: stats.speed * scale.speed,
    hp: maxHp,
    maxHp,
    reward: stats.reward,
    coreDamage: stats.coreDamage,
    scale,
    revealed: false,
    removed: false,
  };
}

/**
 * Advances the enemy (speedMultiplier < 1 applies an aura slow for this tick); returns
 * true if it reached the end of the path.
 *
 * `fixedMovement` is enforced **here, where speed is consumed**, and not back where
 * each slow is produced. Slow is produced in `stepGame`, in a pass over every aura
 * tower and every enemy; immunity checked there would be a check inside a nested loop,
 * and worse, it would have to be repeated by hand in whatever produces the next speed
 * effect. Enforced at the point of consumption it is one line and it covers everything
 * ever done to an enemy's speed, including effects nobody has written yet.
 *
 * What this deliberately does not cover is `enemy.speed` itself. A wave that scales
 * speed sets what the enemy *is*, at birth in `createEnemy` alongside `hpScale`, while
 * `speedMultiplier` is what is being *done to it* while it walks. A BEACON therefore
 * ignores every aura and still obeys the curve, which is only true because the two
 * live on opposite sides of that line. See [Roster](../docs/Design/Roster.md).
 */
export function stepEnemy(enemy: Enemy, dtMs: number, pathLength: number, speedMultiplier = 1): boolean {
  const applied = enemyTraits(enemy.kind).fixedMovement ? 1 : speedMultiplier;
  enemy.distance += enemy.speed * applied * (dtMs / 1000);
  return enemy.distance >= pathLength;
}

/**
 * What a hit of `amount` actually takes off this kind, after armor.
 *
 * Same rule as `fixedMovement`: enforced where the damage is **consumed**, at the one
 * place a projectile lands, rather than at every place a number is handed out. Towers
 * keep declaring what they deal and stay ignorant of what survives it.
 *
 * The floor is zero. One point of armor against a tier-1 Firewall Node is not a
 * reduction, it is the whole shot, and that is the point: the answer is to upgrade it
 * or to buy the tower whose shots are big enough to notice, which prices the tier
 * ladder in the late run. See [Roster](../docs/Design/Roster.md).
 */
/**
 * Invisible to the towers right now. Not to the player, who sees it drawn ghosted and
 * can still tap it into the console - selection is the player's eye and has never been
 * the towers'. An enemy nobody can see is a surprise bill; one the player can see and
 * the guns cannot is a question about what they built.
 */
export function isHidden(enemy: Enemy): boolean {
  return enemyTraits(enemy.kind).stealth === true && !enemy.revealed;
}

export function damageTaken(kind: EnemyKind, amount: number): number {
  return Math.max(0, amount - (enemyTraits(kind).armor ?? 0));
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
