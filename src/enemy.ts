export interface Enemy {
  distance: number; // grid units travelled along the path
  speed: number; // grid units per second
}

export function createEnemy(speed = 2): Enemy {
  return { distance: 0, speed };
}

/** Advances the enemy; returns true if it reached the end of the path. */
export function stepEnemy(enemy: Enemy, dtMs: number, pathLength: number): boolean {
  enemy.distance += enemy.speed * (dtMs / 1000);
  return enemy.distance >= pathLength;
}
