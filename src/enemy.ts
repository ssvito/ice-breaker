export interface Enemy {
  distance: number; // grid units travelled along the path
  speed: number; // grid units per second
  hp: number;
  maxHp: number;
}

export function createEnemy(speed = 2, maxHp = 3): Enemy {
  return { distance: 0, speed, hp: maxHp, maxHp };
}

/** Advances the enemy; returns true if it reached the end of the path. */
export function stepEnemy(enemy: Enemy, dtMs: number, pathLength: number): boolean {
  enemy.distance += enemy.speed * (dtMs / 1000);
  return enemy.distance >= pathLength;
}

/** Sends the enemy back to spawn at full health. */
export function resetEnemy(enemy: Enemy): void {
  enemy.distance = 0;
  enemy.hp = enemy.maxHp;
}
