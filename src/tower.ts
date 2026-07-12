export const FIREWALL_NODE_RANGE = 2.5; // grid units
export const FIREWALL_NODE_DAMAGE = 1;
export const FIREWALL_NODE_FIRE_INTERVAL_MS = 600;
export const FIREWALL_NODE_COST = 20; // Cycles

export interface Tower {
  x: number; // tile coord
  y: number; // tile coord
  range: number; // grid units
  damage: number;
  fireIntervalMs: number;
  cooldownMs: number;
}

export function createFirewallNode(x: number, y: number): Tower {
  return {
    x,
    y,
    range: FIREWALL_NODE_RANGE,
    damage: FIREWALL_NODE_DAMAGE,
    fireIntervalMs: FIREWALL_NODE_FIRE_INTERVAL_MS,
    cooldownMs: 0,
  };
}

/** Tower's center position in continuous grid coords (tiles are stored top-left). */
export function towerCenter(tower: Tower): { x: number; y: number } {
  return { x: tower.x + 0.5, y: tower.y + 0.5 };
}
