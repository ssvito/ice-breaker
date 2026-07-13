import type { Enemy } from './enemy.ts';
import type { GridPos } from './map.ts';

const HIT_RADIUS = 0.25; // grid units
const PROJECTILE_SPEED = 8; // grid units per second

export interface Projectile {
  x: number;
  y: number;
  target: Enemy;
  damage: number;
  speed: number;
  heavy: boolean; // AES bolt - drawn with the larger projectile sprite
}

export function createProjectile(origin: GridPos, target: Enemy, damage: number, heavy = false): Projectile {
  return { x: origin.x, y: origin.y, target, damage, speed: PROJECTILE_SPEED, heavy };
}

/** Moves the projectile toward its target's current position; returns true on impact. */
export function stepProjectile(projectile: Projectile, dtMs: number, targetPos: GridPos): boolean {
  const dx = targetPos.x - projectile.x;
  const dy = targetPos.y - projectile.y;
  const distance = Math.hypot(dx, dy);

  if (distance <= HIT_RADIUS) return true;

  const travel = Math.min(distance, projectile.speed * (dtMs / 1000));
  projectile.x += (dx / distance) * travel;
  projectile.y += (dy / distance) * travel;
  return false;
}
