import { BASE_SCALE } from './enemy.ts';
import type { EnemyKind, WaveScale } from './enemy.ts';

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
  /**
   * Multiplies the speed of everything the wave spawns. Defaults to 1, and it is the
   * second axis the curve got when ten waves of `hpScale` turned out to be one question
   * asked louder. HP is the axis an upgraded board beats by construction, because damage
   * per tier climbs faster than any multiplier the curve dares; speed attacks the other
   * half of a defense, since it shortens time-in-range and so prices coverage and
   * placement rather than DPS. It is also the axis that finally makes the two slow auras
   * matter more the deeper the run goes, instead of less.
   *
   * Applied at birth in `createEnemy`, never as a per-tick multiplier - see `WaveScale`
   * for the kind that would otherwise have walked out of the curve unnoticed.
   */
  speedScale?: number;
}

/**
 * The curve. Fifteen waves in two acts, each with a shape rather than a slope.
 *
 * **Act one, 1-8: the vocabulary.** Worms, Trojans, Packet Sniffers, Ransomware -
 * pressure, a breath at 6, and a crunch at 8. It is the ten-wave curve minus its last
 * two waves, kept as it stood because it is the half of the run the player already
 * reported as fine.
 *
 * **Act two, 9-15: the questions.** The three kinds v1.6 added arrive one per odd wave,
 * each alone and unscaled, and the even wave after each one puts it back on the board
 * under load. That alternation is what a second act is for here: the first half of the
 * run teaches a vocabulary and the second half asks whether the board you built out of
 * it answers a question it was not built for.
 *
 * The rule the order obeys is that **every kind gets a wave to itself before it
 * shows up in a mix** - the wave that introduces a kind is the game teaching a
 * rule, and teaching it under load teaches nothing. Worms open, Trojans land alone
 * at 3, Packet Sniffers alone at 5, Ransomware alone at 7, then BEACON at 9, PACKER at
 * 11 and ROOTKIT at 13. The Encryptor is the exception that proves it: it has no group
 * of its own anywhere, because it is only ever born from a Ransomware splitting, and
 * wave 7 is where the player meets that with nothing else on the board.
 * `tests/wave.test.ts` gates the rule, and gates that no kind is left out of the curve.
 *
 * **The two acts scale on different axes**, which is the point of there being two axes.
 * Act one ramps `hpScale` and nothing else, so it asks whether the guns are big enough.
 * Act two ramps `speedScale` on top, so it asks whether they cover enough trace - and the
 * answer to that one is placement rather than another upgrade. Act two's three
 * introductions are unscaled on both axes, because the wave that teaches a rule should
 * teach the rule and not the curve. Act one's are not, and the two that scale say why
 * where they stand.
 *
 * **Act two is small and hard rather than big and hard, and the economy is why.** Payout
 * is sized against the tier ladder - topping out some towers is reachable, topping out
 * all four is not - and the ladder did not get longer when the run did. Counts are also
 * the bounty, so five more waves of bodies at ten-wave rates would have paid for the
 * whole ladder and ended the only decision the ladder exists to pose. So act two carries
 * its difficulty in the two scale axes and in overlap, on about as many bodies per wave
 * as act one's breath. `tests/wave.test.ts` computes the purse and the ladder and gates
 * the gap.
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
  // fire rate rather than damage. Fourteen of them, and nothing else to watch.
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

  // 8 - act one's crunch: a sniffer flood with two Trojans inside it. The Trojans are
  // the threat and the sniffers are what stops the towers from being pointed at them.
  {
    hpScale: 2,
    groups: [
      { enemyKind: 'packetSniffer', count: 12, spawnIntervalMs: 300 },
      { enemyKind: 'trojan', count: 2, spawnIntervalMs: 2000, startMs: 1000 },
    ],
  },

  // 9 - BEACON, alone and unscaled: act two opens by taking away a rule act one spent
  // eight waves teaching. Everything the player bought to buy time does nothing here.
  { groups: [{ enemyKind: 'beacon', count: 5, spawnIntervalMs: 900 }] },

  // 10 - and the same question with the board busy. The sniffers are what the slows are
  // for; the Beacons walk through them at a speed no aura on the map can touch.
  {
    hpScale: 2,
    speedScale: 1.1,
    groups: [
      { enemyKind: 'beacon', count: 4, spawnIntervalMs: 1000 },
      { enemyKind: 'packetSniffer', count: 8, spawnIntervalMs: 300, startMs: 800 },
    ],
  },

  // 11 - PACKER, alone and unscaled. Armor 1, so a tier-1 Firewall Node is not slow
  // against this wave, it is useless - and the answer is a tier or a bigger gun.
  { groups: [{ enemyKind: 'packer', count: 4, spawnIntervalMs: 1300 }] },

  // 12 - armor with a stream around it. Worms are cheap to kill and expensive to
  // ignore, which is what stops the whole board being pointed at the Packers.
  {
    hpScale: 1.5,
    speedScale: 1.2,
    groups: [
      { enemyKind: 'packer', count: 3, spawnIntervalMs: 1400 },
      { enemyKind: 'worm', count: 6, spawnIntervalMs: 550, startMs: 800 },
    ],
  },

  // 13 - ROOTKIT, alone and unscaled: the wave that asks whether an IDS Scanner was
  // bought and, more to the point, whether it was put where the guns are.
  { groups: [{ enemyKind: 'rootkit', count: 5, spawnIntervalMs: 900 }] },

  // 14 - act two's crunch, and the wave that takes over from the old wave 9: three
  // questions at once, at the fastest the curve ever runs. Rootkits need the Scanner,
  // Beacons ignore it, and the sniffers arrive while both are still walking.
  {
    hpScale: 2,
    speedScale: 1.3,
    groups: [
      { enemyKind: 'rootkit', count: 4, spawnIntervalMs: 1000 },
      { enemyKind: 'beacon', count: 3, spawnIntervalMs: 1200, startMs: 800 },
      { enemyKind: 'packetSniffer', count: 8, spawnIntervalMs: 300, startMs: 1800 },
    ],
  },

  // 15 - ZERO-DAY. Immune to AES Turrets, so a run that answered everything with
  // one weapon meets the wave that ignores it, escorted by the two kinds that punish
  // the other two answers. The scale is what makes the boss a 100 HP boss.
  {
    hpScale: 2.5,
    speedScale: 1.15,
    groups: [
      { enemyKind: 'zeroDay', count: 1, spawnIntervalMs: 0 },
      { enemyKind: 'packer', count: 2, spawnIntervalMs: 2000, startMs: 1500 },
      { enemyKind: 'packetSniffer', count: 8, spawnIntervalMs: 400, startMs: 2500 },
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

/**
 * There is no state for "waiting for the board to clear" any more. There was, and
 * removing it is the whole of the overlapping-waves change: the countdown used to
 * start when the last enemy of a wave left play, so every wave opened on a clean board
 * with nothing owed, and there was no such thing as falling behind - only losing.
 */
export type SpawnState = 'countdown' | 'spawning' | 'done';

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
 * Advances the spawner and returns the kinds due to spawn this tick - usually none,
 * sometimes several, since concurrent groups can come due together.
 *
 * **The countdown starts when a wave finishes spawning, not when the board clears.**
 * What that buys is the thing the curve did not have: pressure that accumulates. The
 * enemies you failed to kill are still walking when the next wave opens, so a bad wave
 * costs core HP *and* leaves you a wave behind, and calling early finally costs
 * something a scripted player cannot shrug off - it stacks a wave onto one already in
 * front of you rather than buying out an empty lull.
 *
 * It also takes an argument away. The spawner used to need the live enemy count to know
 * when the board was clear; it no longer asks the caller anything about the world.
 */
export function stepSpawner(spawner: Spawner, dtMs: number): readonly EnemyKind[] {
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

    // The tick that spawns the last enemy of a wave is the tick the next lull starts.
    if (!pending) {
      spawner.state = 'countdown';
      spawner.waveTimerMs = BETWEEN_WAVE_DELAY_MS;
    }
    return spawns ?? NO_SPAWNS;
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
  scale: WaveScale;
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
 * One Cycle per whole second of countdown skipped. It was sized as deliberately modest
 * against a ten-wave curve - about 80 Cycles on a curve paying 409 - and the fifteen-wave
 * curve moved it without the rate changing: fifteen lulls at a poorer payout make it
 * about 117 against 426, which is a quarter of the purse rather than a fifth. It is no
 * longer obviously modest, and the reason it stays at 1 here is that the harness says
 * the run that takes all of it now loses - `rush` breaches the core with every one of
 * those Cycles in hand. A bonus that buys a board you do not live to use is priced by
 * the curve, not by the rate. Rounded up rather than down so the button's `+8` and the
 * meta's `IN 8s` are always the same number; two readings of one countdown disagreeing
 * by one is the kind of small lie that costs trust in all of it.
 */
export const EARLY_CALL_RATE = 1;

/**
 * Whole seconds left, as everything that shows a countdown must read it. Shared rather
 * than repeated: the console prints `IN 8s`, the port lights eight pips, and the call
 * pays eight, and two readings of one countdown disagreeing by one is the kind of small
 * lie that costs trust in all of them.
 */
export function countdownSeconds(ms: number): number {
  return Math.ceil(Math.max(0, ms) / 1000);
}

export function earlyCallBonus(countdownMs: number): number {
  return countdownSeconds(countdownMs) * EARLY_CALL_RATE;
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
    scale: waveScaleOf(index),
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

/**
 * What the wave at this index makes of what it spawns. `BASE_SCALE` rather than a fresh
 * object for the ordinary wave, so the common case allocates nothing and every unscaled
 * enemy in the run shares one record.
 */
function waveScaleOf(index: number): WaveScale {
  const wave = waves[index];
  if (!wave || (wave.hpScale === undefined && wave.speedScale === undefined)) return BASE_SCALE;
  return { hp: wave.hpScale ?? 1, speed: wave.speedScale ?? 1 };
}

/**
 * The scaling of the wave currently running - what `createEnemy` is handed. One accessor
 * for both axes rather than one per axis: they are read at the same instant, by the same
 * caller, for the same enemy, and a second accessor is the shape v1.6's first step spent
 * a whole refactor removing from the traits.
 */
export function waveScale(spawner: Spawner): WaveScale {
  return waveScaleOf(spawner.waveIndex);
}

/** The wave the run is on, 1-based, counting the opening countdown as wave 1. */
export function waveNumber(spawner: Spawner): number {
  return Math.min(waves.length, Math.max(0, spawner.waveIndex) + 1);
}
