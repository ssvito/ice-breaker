export type TowerKind = 'firewallNode' | 'aesTurret';

export interface Tower {
  kind: TowerKind;
  x: number; // tile coord
  y: number; // tile coord
  range: number; // grid units
  damage: number;
  fireIntervalMs: number;
  cooldownMs: number;
}

interface TowerStats {
  name: string;
  range: number;
  damage: number;
  fireIntervalMs: number;
  cost: number;
}

const TOWER_STATS: Record<TowerKind, TowerStats> = {
  firewallNode: { name: 'FIREWALL NODE', range: 2.5, damage: 1, fireIntervalMs: 600, cost: 20 },
  aesTurret: { name: 'AES TURRET', range: 2, damage: 4, fireIntervalMs: 1500, cost: 45 },
};

export function towerStats(kind: TowerKind): TowerStats {
  return TOWER_STATS[kind];
}

export function createTower(kind: TowerKind, x: number, y: number): Tower {
  const stats = TOWER_STATS[kind];
  return { kind, x, y, range: stats.range, damage: stats.damage, fireIntervalMs: stats.fireIntervalMs, cooldownMs: 0 };
}

/** Tower's center position in continuous grid coords (tiles are stored top-left). */
export function towerCenter(tower: Tower): { x: number; y: number } {
  return { x: tower.x + 0.5, y: tower.y + 0.5 };
}
