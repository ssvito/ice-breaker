export interface Enemy {
  distance: number; // grid units travelled along the path
  speed: number; // grid units per second
  hp: number;
  maxHp: number;
  reward: number; // Cycles earned on kill
  removed: boolean; // left play, either killed or reached the core
}

export function createEnemy(speed = 2, maxHp = 3, reward = 5): Enemy {
  return { distance: 0, speed, hp: maxHp, maxHp, reward, removed: false };
}

/** Advances the enemy; returns true if it reached the end of the path. */
export function stepEnemy(enemy: Enemy, dtMs: number, pathLength: number): boolean {
  enemy.distance += enemy.speed * (dtMs / 1000);
  return enemy.distance >= pathLength;
}
