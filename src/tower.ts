export type TowerKind = 'firewallNode' | 'aesTurret' | 'idsScanner' | 'honeypot';
export type TowerPlacement = 'offPath' | 'onPath';

export interface Tower {
  kind: TowerKind;
  x: number; // tile coord
  y: number; // tile coord
  range: number; // grid units
  damage: number; // 0 for aura towers, which never fire projectiles
  fireIntervalMs: number; // unused by aura towers
  cooldownMs: number; // unused by aura towers
  slowMultiplier?: number; // present only on aura towers; enemy speed is multiplied by this while in range
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
  };
}

/** Tower's center position in continuous grid coords (tiles are stored top-left). */
export function towerCenter(tower: Tower): { x: number; y: number } {
  return { x: tower.x + 0.5, y: tower.y + 0.5 };
}
