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
  tier: number; // 1..MAX_TIER
  invested: number; // total Cycles put into this tower; tracked, not recomputed, so rebalancing costs can't rewrite history
}

interface TowerTier {
  range: number; // grid units
  damage: number;
  fireIntervalMs: number;
  cost: number; // placement cost at tier 1, upgrade cost above it
  slowMultiplier?: number;
}

interface TowerStats extends TowerTier {
  name: string;
  placement: TowerPlacement;
}

export const MAX_TIER = 3;

/**
 * Per-kind tier ladder. Attack towers buy damage and fire rate (the stats a player
 * can see working), aura towers buy slow strength and radius - except Honeypot's
 * radius, which stays tight on purpose: a wide Honeypot is just an IDS Scanner.
 * Upgrade cost climbs faster than the effect so the last tier stays a real choice.
 */
const TOWER_DEFS: Record<TowerKind, { name: string; placement: TowerPlacement; tiers: TowerTier[] }> = {
  firewallNode: {
    name: 'FIREWALL NODE',
    placement: 'offPath',
    tiers: [
      { range: 2.5, damage: 1, fireIntervalMs: 600, cost: 20 },
      { range: 2.7, damage: 2, fireIntervalMs: 540, cost: 30 },
      { range: 3.0, damage: 3, fireIntervalMs: 480, cost: 50 },
    ],
  },
  aesTurret: {
    name: 'AES TURRET',
    placement: 'offPath',
    tiers: [
      { range: 2.0, damage: 4, fireIntervalMs: 1500, cost: 45 },
      { range: 2.2, damage: 7, fireIntervalMs: 1400, cost: 65 },
      { range: 2.4, damage: 11, fireIntervalMs: 1300, cost: 100 },
    ],
  },
  idsScanner: {
    name: 'IDS SCANNER',
    placement: 'offPath',
    tiers: [
      { range: 2.0, damage: 0, fireIntervalMs: 0, cost: 30, slowMultiplier: 0.5 },
      { range: 2.3, damage: 0, fireIntervalMs: 0, cost: 45, slowMultiplier: 0.4 },
      { range: 2.6, damage: 0, fireIntervalMs: 0, cost: 70, slowMultiplier: 0.3 },
    ],
  },
  honeypot: {
    name: 'HONEYPOT',
    placement: 'onPath',
    tiers: [
      { range: 0.6, damage: 0, fireIntervalMs: 0, cost: 25, slowMultiplier: 0.3 },
      { range: 0.7, damage: 0, fireIntervalMs: 0, cost: 35, slowMultiplier: 0.22 },
      { range: 0.8, damage: 0, fireIntervalMs: 0, cost: 55, slowMultiplier: 0.15 },
    ],
  },
};

// Flattened once at load so towerStats() allocates nothing per call - it runs
// several times a frame from the toolbar and the placement preview.
const TOWER_STATS = Object.fromEntries(
  (Object.keys(TOWER_DEFS) as TowerKind[]).map((kind) => {
    const def = TOWER_DEFS[kind];
    return [kind, def.tiers.map((tier) => ({ name: def.name, placement: def.placement, ...tier }))];
  }),
) as Record<TowerKind, TowerStats[]>;

export function towerStats(kind: TowerKind, tier = 1): TowerStats {
  return TOWER_STATS[kind][tier - 1];
}

export function createTower(kind: TowerKind, x: number, y: number): Tower {
  const stats = towerStats(kind);
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
    tier: 1,
    invested: stats.cost,
  };
}

export function canUpgrade(tower: Tower): boolean {
  return tower.tier < MAX_TIER;
}

/** Cost of the next tier, or null when the tower is maxed. */
export function upgradeCost(tower: Tower): number | null {
  return canUpgrade(tower) ? towerStats(tower.kind, tower.tier + 1).cost : null;
}

/** Applies the next tier's stats in place. Caller charges the Cycles. */
export function applyUpgrade(tower: Tower): void {
  const next = towerStats(tower.kind, tower.tier + 1);
  tower.tier += 1;
  tower.range = next.range;
  tower.damage = next.damage;
  tower.fireIntervalMs = next.fireIntervalMs;
  if (tower.slowMultiplier !== undefined) tower.slowMultiplier = next.slowMultiplier;
  tower.invested += next.cost;
}

/**
 * Partial on purpose: a full refund would make a bad placement free, and placement
 * cost is the decision the game is made of. Too small and selling becomes a trap.
 */
export const SELL_REFUND = 0.6;

export function sellValue(tower: Tower): number {
  return Math.floor(tower.invested * SELL_REFUND);
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
