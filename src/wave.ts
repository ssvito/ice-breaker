import type { EnemyKind } from './enemy.ts';

/**
 * A group is one kind arriving on its own little timeline inside the wave:
 * `count` of them, `spawnIntervalMs` apart, starting `startMs` after the wave
 * opens. Groups run *concurrently*, which is the whole point - a wave is a shape
 * over time, not a queue. Trojans escorted by Packet Sniffers is a different
 * problem from Trojans and then Packet Sniffers, and only the first one is a mix.
 */
export interface SpawnGroup {
  enemyKind: EnemyKind;
  count: number;
  spawnIntervalMs: number;
  /** Offset from the start of the wave. Defaults to 0 - the group opens the wave. */
  startMs?: number;
}

export interface WaveDefinition {
  groups: SpawnGroup[];
  /**
   * Multiplies the HP of everything the wave spawns, the boss included. Defaults
   * to 1. Added mid-step, and not in the original plan: the harness showed two
   * upgraded Firewall Nodes at the entrance erasing the whole curve, peaks of two
   * enemies from wave 4 on, because the total HP a late wave carries was less than
   * a tier-3 board deals while it walks. Counts could not fix that - three times
   * the enemies is three times the bounty, and the economy is the other thing this
   * step is sizing. HP is the one lever that makes a wave harder without making it
   * richer.
   */
  hpScale?: number;
}

/**
 * The curve. Ten waves with a shape rather than a slope: pressure, a breath at 6,
 * a crunch at 9, the boss at 10.
 *
 * The rule the order obeys is that **every kind gets a wave to itself before it
 * shows up in a mix** - the wave that introduces a kind is the game teaching a
 * rule, and teaching it under load teaches nothing. Worms open, Trojans land alone
 * at 3, Packet Sniffers alone at 5, Ransomware alone at 7. The Encryptor is the
 * exception that proves it: it has no group of its own anywhere, because it is
 * only ever born from a Ransomware splitting, and wave 7 is where the player meets
 * that with nothing else on the board. `tests/wave.test.ts` gates the rule.
 *
 * Payout is sized against the tier ladder: a flawless run collects 409 Cycles on
 * top of the 100 it starts with, and topping out all four towers costs 570. Some
 * of the ladder is reachable, all of it is not, which is the decision the ladder
 * exists to pose - `tests/wave.test.ts` computes both numbers and gates the gap.
 *
 * Difficulty past wave 6 is carried by `hpScale` rather than by counts, because
 * counts are also the economy. The ramp starts late on purpose: rounding makes a
 * small multiplier a big jump on a three-HP Worm, and an early one turned wave 4
 * into a wall for any board still on tier 1.
 */
export const waves: WaveDefinition[] = [
  // 1 - first contact. One kind, slow enough to watch a single tower work.
  { groups: [{ enemyKind: 'worm', count: 5, spawnIntervalMs: 1000 }] },

  // 2 - the same thing, denser. The first wave that punishes owning one tower.
  { groups: [{ enemyKind: 'worm', count: 9, spawnIntervalMs: 700 }] },

  // 3 - TROJAN, alone: slow and eight HP, so chip damage stops being enough.
  { groups: [{ enemyKind: 'trojan', count: 3, spawnIntervalMs: 2000 }] },

  // 4 - first real mix. Worms stream past while two Trojans walk through them.
  {
    groups: [
      { enemyKind: 'worm', count: 8, spawnIntervalMs: 700 },
      { enemyKind: 'trojan', count: 2, spawnIntervalMs: 2500, startMs: 1500 },
    ],
  },

  // 5 - PACKET SNIFFER, alone: one HP each at speed 4, a test of coverage and
  // fire rate rather than damage. Twelve of them, and nothing else to watch.
  { groups: [{ enemyKind: 'packetSniffer', count: 14, spawnIntervalMs: 300 }] },

  // 6 - the breath. Deliberately under-strength: the wave you bank, upgrade
  // through, or call early once the run learns to.
  {
    groups: [
      { enemyKind: 'worm', count: 4, spawnIntervalMs: 1200 },
      { enemyKind: 'packetSniffer', count: 5, spawnIntervalMs: 400, startMs: 3000 },
    ],
  },

  // 7 - RANSOMWARE, alone, which is also where the Encryptor is introduced: kill
  // one and two more come out of it. Four is enough to teach that killing early
  // is what stops the split arriving at the core.
  { hpScale: 1.5, groups: [{ enemyKind: 'ransomware', count: 4, spawnIntervalMs: 2000 }] },

  // 8 - sniffer flood with two Trojans inside it. The Trojans are the threat and
  // the sniffers are what stops the towers from being pointed at them.
  {
    hpScale: 2,
    groups: [
      { enemyKind: 'packetSniffer', count: 12, spawnIntervalMs: 300 },
      { enemyKind: 'trojan', count: 2, spawnIntervalMs: 2000, startMs: 1000 },
    ],
  },

  // 9 - the crunch. Everything the run has taught, overlapping on purpose.
  {
    hpScale: 2.75,
    groups: [
      { enemyKind: 'ransomware', count: 3, spawnIntervalMs: 2200 },
      { enemyKind: 'worm', count: 6, spawnIntervalMs: 700, startMs: 1000 },
      { enemyKind: 'trojan', count: 2, spawnIntervalMs: 2500, startMs: 3000 },
    ],
  },

  // 10 - ZERO-DAY. Immune to AES Turrets, so a run that answered everything with
  // one weapon meets the wave that ignores it, with an escort to keep the rest of
  // the board busy. The scale is what makes the boss an 100 HP boss.
  {
    hpScale: 2.5,
    groups: [
      { enemyKind: 'zeroDay', count: 1, spawnIntervalMs: 0 },
      { enemyKind: 'packetSniffer', count: 8, spawnIntervalMs: 500, startMs: 2000 },
    ],
  },
];

/**
 * The lull. Both went up when the preview landed: four seconds is not long enough
 * to read what is coming and act on it, so a preview inside it would have been a
 * thing that flashes past rather than a thing you use. It is also the countdown the
 * early-call bonus is about to buy back, and a bonus for skipping four seconds is
 * not a decision worth posing.
 */
export const INITIAL_WAVE_DELAY_MS = 5000;
export const BETWEEN_WAVE_DELAY_MS = 8000;

export type SpawnState = 'countdown' | 'spawning' | 'waiting-clear' | 'done';

export interface Spawner {
  waveIndex: number; // -1 before the first wave starts
  state: SpawnState;
  waveTimerMs: number; // counts down to the next wave, while in 'countdown'
  elapsedMs: number; // time since the current wave opened; the clock every group reads
  spawnedInGroup: number[]; // one counter per group of the current wave
}

export function createSpawner(): Spawner {
  return {
    waveIndex: -1,
    state: 'countdown',
    waveTimerMs: INITIAL_WAVE_DELAY_MS,
    elapsedMs: 0,
    spawnedInGroup: [],
  };
}

/** Shared empty result for the overwhelming majority of ticks, which spawn nothing. Never mutated. */
const NO_SPAWNS: readonly EnemyKind[] = [];

/**
 * Advances the spawner and returns the kinds due to spawn this tick - usually
 * none, sometimes several, since concurrent groups can come due together. The
 * caller creates the enemies and reports the live count, so a wave can wait to
 * clear before the next countdown starts.
 */
export function stepSpawner(spawner: Spawner, dtMs: number, liveEnemyCount: number): readonly EnemyKind[] {
  if (spawner.state === 'countdown') {
    spawner.waveTimerMs -= dtMs;
    if (spawner.waveTimerMs > 0) return NO_SPAWNS;

    spawner.waveIndex++;
    if (spawner.waveIndex >= waves.length) {
      spawner.state = 'done';
      return NO_SPAWNS;
    }
    spawner.elapsedMs = 0;
    spawner.spawnedInGroup = waves[spawner.waveIndex].groups.map(() => 0);
    spawner.state = 'spawning';
    // Falls through: the wave opens on this tick, so a group at startMs 0 spawns now.
  }

  if (spawner.state === 'spawning') {
    spawner.elapsedMs += dtMs;

    const groups = waves[spawner.waveIndex].groups;
    let spawns: EnemyKind[] | null = null;
    let pending = false;

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const startMs = group.startMs ?? 0;
      // Due time is computed from the group's own start, not accumulated per spawn,
      // so a slow frame that skips a due moment catches up instead of drifting.
      while (
        spawner.spawnedInGroup[i] < group.count &&
        spawner.elapsedMs >= startMs + spawner.spawnedInGroup[i] * group.spawnIntervalMs
      ) {
        (spawns ??= []).push(group.enemyKind);
        spawner.spawnedInGroup[i]++;
      }
      if (spawner.spawnedInGroup[i] < group.count) pending = true;
    }

    if (!pending) spawner.state = 'waiting-clear';
    return spawns ?? NO_SPAWNS;
  }

  if (spawner.state === 'waiting-clear' && liveEnemyCount === 0) {
    spawner.state = 'countdown';
    spawner.waveTimerMs = BETWEEN_WAVE_DELAY_MS;
  }

  return NO_SPAWNS;
}

/**
 * What the console reads out during a countdown. Composition is merged by kind
 * rather than by group, because two groups of Worms at different offsets are a
 * shape the wave has, not a thing the player needs counted twice.
 */
export interface WavePreview {
  number: number; // 1-based, as the HUD says it
  total: number;
  hpScale: number;
  composition: { kind: EnemyKind; count: number }[];
  countdownMs: number;
  /** Cycles the player is paid for calling this wave now, at this instant of the countdown. */
  earlyBonus: number;
  /**
   * Whether this wave can still be brought forward. False for the wave already on
   * the board, which the player can open from the HUD to re-read what they are in
   * the middle of - a reading, with nothing to decide.
   */
  callable: boolean;
}

/**
 * One Cycle per whole second of countdown skipped. Deliberately modest: over the
 * ten waves it is worth about 80 Cycles against a curve that pays 409, so calling
 * everything early is a Firewall Node's ladder and a bit - real money, and nowhere
 * near a way around the economy. Rounded up rather than down so the button's `+8`
 * and the meta's `IN 8s` are always the same number; two readings of one countdown
 * disagreeing by one is the kind of small lie that costs trust in all of it.
 */
export const EARLY_CALL_RATE = 1;

export function earlyCallBonus(countdownMs: number): number {
  return Math.ceil(Math.max(0, countdownMs) / 1000) * EARLY_CALL_RATE;
}

function readWave(index: number, countdownMs: number, callable: boolean): WavePreview {
  const wave = waves[index];
  const composition: { kind: EnemyKind; count: number }[] = [];
  for (const group of wave.groups) {
    const merged = composition.find((entry) => entry.kind === group.enemyKind);
    if (merged) merged.count += group.count;
    else composition.push({ kind: group.enemyKind, count: group.count });
  }

  return {
    number: index + 1,
    total: waves.length,
    hpScale: wave.hpScale ?? 1,
    composition,
    countdownMs,
    earlyBonus: callable ? earlyCallBonus(countdownMs) : 0,
    callable,
  };
}

/**
 * The wave being counted down to, or null whenever there isn't one - mid-wave,
 * waiting for the board to clear, or after the last wave. Null is the signal that
 * there is nothing to preview, so the caller can fall back rather than test the
 * spawner's state itself.
 */
export function nextWavePreview(spawner: Spawner): WavePreview | null {
  if (spawner.state !== 'countdown') return null;

  const index = spawner.waveIndex + 1;
  if (index >= waves.length) return null;

  return readWave(index, Math.max(0, spawner.waveTimerMs), true);
}

/**
 * What the wave indicator opens: the wave being counted down to if there is one,
 * otherwise the wave currently on the board. Asking "what is this?" of a wave in
 * progress is the same question as asking it of one that has not landed, and the
 * console had no way to answer it once the countdown was over.
 */
export function currentWaveReading(spawner: Spawner): WavePreview | null {
  const incoming = nextWavePreview(spawner);
  if (incoming) return incoming;
  if (spawner.waveIndex < 0 || spawner.waveIndex >= waves.length) return null;
  return readWave(spawner.waveIndex, 0, false);
}

/** HP multiplier of the wave currently running - what `createEnemy` is handed. */
export function waveHpScale(spawner: Spawner): number {
  const wave = waves[spawner.waveIndex];
  return wave?.hpScale ?? 1;
}

/** The wave the run is on, 1-based, counting the opening countdown as wave 1. */
export function waveNumber(spawner: Spawner): number {
  return Math.min(waves.length, Math.max(0, spawner.waveIndex) + 1);
}
