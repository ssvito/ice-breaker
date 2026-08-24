import { createGameState, MAX_CORE_HEALTH, placeTower, stepGame, TICK_MS, upgradeTower } from './game.ts';
import type { GameState, GameStatus } from './game.ts';
import { level1 } from './map.ts';
import type { LevelData } from './map.ts';
import { waves } from './wave.ts';
import { MAX_TIER, towerStats } from './tower.ts';
import type { Tower, TowerKind } from './tower.ts';

/**
 * The balance harness: run the whole wave curve headless against a declared tower
 * layout and report what it cost the player, wave by wave.
 *
 * Ten waves cannot be tuned by playing them. The loop "rebuild, sit through eight
 * waves on a phone, change one number" is how a curve ends up shipped on vibes,
 * so the curve gets a measuring instrument before it gets numbers.
 *
 * It is cheap because the simulation is already deterministic: `stepGame` with no
 * hooks reaches no `Math.random()` at all (`tests/game.test.ts` gates that), so a
 * fixed timestep in means the same report out, every time, with no seeded RNG.
 *
 * This module deliberately prints nothing and reads no argv - it lives in `src/`
 * so `tsc` type-checks it along with the simulation it measures, and `lib` here is
 * DOM, not Node. The CLI shell in `scripts/balance.ts` does the talking.
 */

/**
 * One tower in a build order: put a `kind` on this tile and take it to `tier`,
 * buying each step as soon as the Cycles are there, from `fromWave` onwards.
 */
export interface Build {
  kind: TowerKind;
  x: number;
  y: number;
  /** Target tier, 1..MAX_TIER. Defaults to 1 (place it and leave it). */
  tier?: number;
  /** Wave number (1-based) this build becomes eligible. Defaults to 1, i.e. opening buy. */
  fromWave?: number;
}

export interface Loadout {
  name: string;
  /** What this layout is meant to prove. Printed with the report. */
  note: string;
  /**
   * A build *order*, not a set: entries are bought strictly in sequence, and an
   * eligible entry the player cannot afford blocks the ones behind it until the
   * kills pay for it. That is what declaring a priority means, and it is what
   * makes "is tier 3 reachable by wave 8" a question the harness can answer.
   */
  builds: Build[];
}

export interface WaveReport {
  wave: number;
  /** Enemies the wave definition spawns. Split children are not counted; they show up in `peakEnemies`. */
  spawned: number;
  peakEnemies: number;
  leaks: number;
  coreHealth: number;
  earned: number;
  spent: number;
  cyclesEnd: number;
  durationMs: number;
  /** Purchases that landed during this wave, as `KIND T2` labels. */
  bought: string[];
}

export interface RunReport {
  loadout: string;
  note: string;
  status: GameStatus | 'timeout';
  coreHealth: number;
  totalLeaks: number;
  cyclesEnd: number;
  totalEarned: number;
  totalSpent: number;
  durationMs: number;
  waves: WaveReport[];
  /** Builds the run never afforded, in the order they were still waiting in. */
  unbought: Build[];
}

export interface BalanceOptions {
  level?: LevelData;
  /** Safety net for a layout that can neither clear a wave nor lose - default 20 simulated minutes. */
  maxTicks?: number;
}

/** A build plus the tower it became, once it exists. */
interface PendingBuild {
  build: Build;
  targetTier: number;
  tower: Tower | null;
}

function label(kind: TowerKind, tier: number): string {
  return `${towerStats(kind).name} T${tier}`;
}

function waveSize(waveIndex: number): number {
  return waves[waveIndex].groups.reduce((total, group) => total + group.count, 0);
}

/**
 * Spends down the build order for as far as the balance reaches this tick.
 * Returns the labels of what was bought, so the wave that paid for a tower is the
 * wave it shows up under.
 */
function advanceBuildOrder(state: GameState, pending: PendingBuild[], waveNumber: number): string[] {
  const bought: string[] = [];

  for (const entry of pending) {
    if (entry.tower !== null && entry.tower.tier >= entry.targetTier) continue;
    if ((entry.build.fromWave ?? 1) > waveNumber) continue;

    let tower = entry.tower;
    if (tower === null) {
      tower = placeTower(state, entry.build.kind, { x: entry.build.x, y: entry.build.y });
      // Short on Cycles, or an illegal tile. Either way this entry blocks the ones
      // behind it: a build order is an order.
      if (tower === null) break;
      entry.tower = tower;
      bought.push(label(tower.kind, 1));
    }

    while (tower.tier < entry.targetTier && upgradeTower(state, tower)) {
      bought.push(label(tower.kind, tower.tier));
    }

    if (tower.tier < entry.targetTier) break;
  }

  return bought;
}

/** Cost of taking a build from nothing to its target tier, ignoring whether it is affordable. */
export function buildCost(build: Build): number {
  let total = towerStats(build.kind).cost;
  for (let tier = 2; tier <= (build.tier ?? 1); tier++) total += towerStats(build.kind, tier).cost;
  return total;
}

export function runBalance(loadout: Loadout, options: BalanceOptions = {}): RunReport {
  const { level = level1, maxTicks = 60 * 60 * 20 } = options;

  const state = createGameState(level);
  const pending: PendingBuild[] = loadout.builds.map((build) => ({
    build,
    targetTier: Math.min(build.tier ?? 1, MAX_TIER),
    tower: null,
  }));

  const reports: WaveReport[] = [];
  let wave = openWave(1);
  let ticks = 0;

  function openWave(number: number): WaveReport {
    return {
      wave: number,
      spawned: number <= waves.length ? waveSize(number - 1) : 0,
      peakEnemies: 0,
      leaks: 0,
      coreHealth: state.coreHealth,
      earned: 0,
      spent: 0,
      cyclesEnd: state.cycles,
      durationMs: 0,
      bought: [],
    };
  }

  while (state.status === 'playing' && ticks < maxTicks) {
    const cyclesBeforeBuying = state.cycles;
    wave.bought.push(...advanceBuildOrder(state, pending, wave.wave));
    wave.spent += cyclesBeforeBuying - state.cycles;

    const cyclesBeforeTick = state.cycles;
    const healthBeforeTick = state.coreHealth;
    stepGame(state, TICK_MS);
    ticks++;

    // stepGame only ever adds Cycles (kill bounties), and only ever removes core
    // health (leaks), so both deltas are unambiguous without the sim reporting.
    wave.earned += state.cycles - cyclesBeforeTick;
    wave.leaks += healthBeforeTick - state.coreHealth;
    wave.peakEnemies = Math.max(wave.peakEnemies, state.enemies.length);
    wave.durationMs += TICK_MS;

    // The spawner is the clock: the wave index moving on is the wave ending. The
    // between-wave countdown is charged to the wave that just finished, which is
    // where the player actually spends it.
    const nextWave = state.spawner.waveIndex + 1;
    if (nextWave > wave.wave && nextWave <= waves.length) {
      wave.coreHealth = state.coreHealth;
      wave.cyclesEnd = state.cycles;
      reports.push(wave);
      wave = openWave(nextWave);
    }
  }

  wave.coreHealth = state.coreHealth;
  wave.cyclesEnd = state.cycles;
  reports.push(wave);

  return {
    loadout: loadout.name,
    note: loadout.note,
    status: ticks >= maxTicks ? 'timeout' : state.status,
    coreHealth: state.coreHealth,
    totalLeaks: MAX_CORE_HEALTH - state.coreHealth,
    cyclesEnd: state.cycles,
    totalEarned: reports.reduce((total, report) => total + report.earned, 0),
    totalSpent: reports.reduce((total, report) => total + report.spent, 0),
    durationMs: ticks * TICK_MS,
    waves: reports,
    unbought: pending
      .filter((entry) => entry.tower === null || entry.tower.tier < entry.targetTier)
      .map((entry) => entry.build),
  };
}

/**
 * The layouts the curve is tuned against. Not a test suite with pass/fail - the
 * point is the spread between them. `bare` says what the waves do to an empty
 * board, `starter` what the opening 100 Cycles survives, `spread` whether four
 * cheap towers beat two good ones, and `focused` whether the tier ladder v1.2
 * built is reachable inside a run at all.
 *
 * Tiles are on level 1's serpentine: the trace runs y=2 (x 0-4), down x=4, y=4
 * (x 4-9), down x=9, then y=6 (x 9-15).
 */
export const loadouts: Loadout[] = [
  {
    name: 'bare',
    note: 'nothing built - what the curve does to an empty board',
    builds: [],
  },
  {
    name: 'starter',
    note: 'what the opening 100 Cycles buys, and nothing after it',
    builds: [
      { kind: 'firewallNode', x: 2, y: 3 },
      { kind: 'firewallNode', x: 5, y: 3 },
      { kind: 'honeypot', x: 6, y: 4 },
    ],
  },
  {
    name: 'spread',
    note: 'one of every kind at tier 1 - breadth over depth',
    builds: [
      { kind: 'firewallNode', x: 2, y: 3 },
      { kind: 'honeypot', x: 6, y: 4 },
      { kind: 'idsScanner', x: 8, y: 5 },
      { kind: 'aesTurret', x: 12, y: 5 },
    ],
  },
  {
    name: 'focused',
    note: 'one Firewall to open, then everything into a tier-3 AES Turret',
    builds: [
      { kind: 'firewallNode', x: 2, y: 3 },
      { kind: 'aesTurret', x: 5, y: 3, tier: 3 },
      { kind: 'firewallNode', x: 12, y: 5, tier: 2, fromWave: 3 },
    ],
  },
];

export function findLoadout(name: string): Loadout | null {
  return loadouts.find((loadout) => loadout.name === name) ?? null;
}

/** Cheapest thing the harness can be asked: does the declared order ever fit? */
export function loadoutCost(loadout: Loadout): number {
  return loadout.builds.reduce((total, build) => total + buildCost(build), 0);
}
