export const FIREWALL_NODE_RANGE = 2.5; // grid units

export interface Tower {
  x: number; // tile coord
  y: number; // tile coord
  range: number; // grid units
}

export function createFirewallNode(x: number, y: number): Tower {
  return { x, y, range: FIREWALL_NODE_RANGE };
}
