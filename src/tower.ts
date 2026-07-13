export type TowerKind = 'firewallNode' | 'aesTurret' | 'idsScanner' | 'honeypot';
export type TowerPlacement = 'offPath' | 'onPath';
export type OverclockState = 'idle' | 'boosted' | 'overheated';

const OVERCLOCK_DURATION_MS = 4000;
const OVERHEAT_DURATION_MS = 3000;
const OVERCLOCK_FIRE_RATE_MULTIPLIER = 0.4; // fireIntervalMs is multiplied by this while boosted

export interface Tower {
  kind: TowerKind;
  x: number; // tile coord
  y: number; // tile coord
  range: number; // grid units
  damage: number; // 0 for aura towers, which never fire projectiles
  fireIntervalMs: number; // unused by aura towers
  cooldownMs: number; // unused by aura towers
  slowMultiplier?: number; // present only on aura towers; enemy speed is multiplied by this while in range
  overclock?: { state: OverclockState; timerMs: number }; // present only on attack towers (fire-rate towers)
  flashMs: number; // counts down after firing; drives the muzzle-flash sprite frame
}

interface TowerStats {
  name: string;
  range: number;
  damage: number;
  fireIntervalMs: number;
  cost: number;
  placement: TowerPlacement;
  slowMultiplier?: number;
}

const TOWER_STATS: Record<TowerKind, TowerStats> = {
  firewallNode: {
    name: 'FIREWALL NODE',
    range: 2.5,
    damage: 1,
    fireIntervalMs: 600,
    cost: 20,
    placement: 'offPath',
  },
  aesTurret: {
    name: 'AES TURRET',
    range: 2,
    damage: 4,
    fireIntervalMs: 1500,
    cost: 45,
    placement: 'offPath',
  },
  idsScanner: {
    name: 'IDS SCANNER',
    range: 2,
    damage: 0,
    fireIntervalMs: 0,
    cost: 30,
    placement: 'offPath',
    slowMultiplier: 0.5,
  },
  honeypot: {
    name: 'HONEYPOT',
    range: 0.6,
    damage: 0,
    fireIntervalMs: 0,
    cost: 25,
    placement: 'onPath',
    slowMultiplier: 0.3,
  },
};

export function towerStats(kind: TowerKind): TowerStats {
  return TOWER_STATS[kind];
}

export function createTower(kind: TowerKind, x: number, y: number): Tower {
  const stats = TOWER_STATS[kind];
  return {
    kind,
    x,
    y,
    range: stats.range,
    damage: stats.damage,
    fireIntervalMs: stats.fireIntervalMs,
    cooldownMs: 0,
    slowMultiplier: stats.slowMultiplier,
    overclock: stats.slowMultiplier === undefined ? { state: 'idle', timerMs: 0 } : undefined,
    flashMs: 0,
  };
}

export const MUZZLE_FLASH_MS = 90;

/** Tower's center position in continuous grid coords (tiles are stored top-left). */
export function towerCenter(tower: Tower): { x: number; y: number } {
  return { x: tower.x + 0.5, y: tower.y + 0.5 };
}

/** Starts the boost cycle; no-op if the tower has no Overclock or is already boosted/overheated. */
export function triggerOverclock(tower: Tower): boolean {
  if (!tower.overclock || tower.overclock.state !== 'idle') return false;
  tower.overclock.state = 'boosted';
  tower.overclock.timerMs = OVERCLOCK_DURATION_MS;
  return true;
}

export function stepOverclock(tower: Tower, dtMs: number): void {
  if (!tower.overclock || tower.overclock.state === 'idle') return;

  tower.overclock.timerMs -= dtMs;
  if (tower.overclock.timerMs > 0) return;

  if (tower.overclock.state === 'boosted') {
    tower.overclock.state = 'overheated';
    tower.overclock.timerMs = OVERHEAT_DURATION_MS;
  } else {
    tower.overclock.state = 'idle';
    tower.overclock.timerMs = 0;
  }
}

export function canFire(tower: Tower): boolean {
  return tower.overclock?.state !== 'overheated';
}

export function effectiveFireIntervalMs(tower: Tower): number {
  return tower.overclock?.state === 'boosted'
    ? tower.fireIntervalMs * OVERCLOCK_FIRE_RATE_MULTIPLIER
    : tower.fireIntervalMs;
}
