import { waves } from './wave.ts';
import { LEGACY_RUN_ID } from './runs.ts';

/**
 * What a finished run is worth remembering for, and where that is kept.
 *
 * **A fixed curve gives a verdict, not a score.** There is one way to win and the same
 * fifteen waves every time, so "high score" has nothing to count. What is honestly
 * recordable is how far you got before you were beaten, how fast you finished, and how
 * little the core lost on the way - three claims a run can make that another run can
 * beat.
 *
 * Every one of those is **a claim about a curve**, and this project's curve moved twice
 * in a single day during v1.6. A record from before that retune is not a record any
 * more; it is a statement about a game that no longer exists. So the stored set carries
 * the identity of the curve it was set on, and a set that does not match today's curve
 * is dropped rather than shown - which is also why the identity is *derived* from the
 * wave table instead of being a version somebody has to remember to bump. A constant
 * that has to be moved by hand is exactly the kind of thing this project already has a
 * note about losing track of.
 */
export interface Records {
  /** Highest wave reached, over every run. 0 before the first one. */
  furthestWave: number;
  /** Fastest clear, in simulated milliseconds, or null if the curve has never fallen. */
  fastestClearMs: number | null;
  /** Fewest leaks on a clear, or null. */
  fewestLeaks: number | null;
}

/** What one finished run has to say for itself. */
export interface RunResult {
  cleared: boolean;
  /** The wave the run was on when it ended, 1-based. */
  wave: number;
  /**
   * Core HP lost over the whole run. The harness has counted leaks as the drop in core
   * health since v1.3 rather than as bodies past the gate, and there is no reason for
   * the game to count them differently from the instrument that tunes it.
   */
  leaks: number;
  /** How long the run lasted in simulated time - `tick * TICK_MS`. See `GameState.tick` for why. */
  durationMs: number;
}

/** Which records a run has just taken, for the shell to mark. */
export type RecordKey = 'furthest' | 'fastest' | 'cleanest';

const KEY = 'ice-breaker:records';

/**
 * Where one board's set lives. **The board is in the key and not in the value**, so the
 * two sets are two documents: a write for one board cannot touch the other's, and a set
 * that cannot be parsed costs the board it belongs to and no more.
 */
function keyFor(runId: string): string {
  return `${KEY}:${runId}`;
}

/**
 * Where the set from before there was a second board lives. v1.7 filed records under the
 * curve alone, because with one board in the list the board added nothing to the key.
 *
 * That set is **adopted rather than dropped**, which is the opposite of what a curve
 * change does to a record, and for a reason rather than out of kindness: a record whose
 * curve cannot be established is worthless, but this one's board can be established -
 * there has only ever been one board to set it on. So the legacy key reads as
 * MAINFRAME 01's, and the first record written there moves the set to its own key and
 * stops consulting this one.
 *
 * The old key is left where it is rather than deleted. Nothing reads it once the new one
 * exists, it costs a few dozen bytes, and a service worker can serve yesterday's bundle
 * for one load after a deploy - which is exactly the load that would find its record
 * gone.
 */
function legacyKeyFor(runId: string): string | null {
  return runId === LEGACY_RUN_ID ? KEY : null;
}

const EMPTY: Records = { furthestWave: 0, fastestClearMs: null, fewestLeaks: null };

/**
 * FNV-1a, 32 bits, hex. No cryptographic claim is being made and none is needed: this
 * has one job, which is to be a different string when the wave table is a different
 * wave table.
 */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * The curve's identity, derived from the curve. Counts, kinds, intervals and both
 * scale axes all live in `waves`, so any retune that would change what a record means
 * changes this string with it - and a retune that changes nothing a player could feel,
 * like a reordered comment, does not touch it at all.
 *
 * **What it does not cover is the board**, and it never did. The wave table is global and
 * the map is not, so both boards run this same curve and hash to this same string - which
 * would quietly turn "fastest clear" into "whichever board is shorter". A record is a
 * claim about a curve *and* a board; this is the curve half, and `RunDescriptor.id` is
 * the board half. They meet in `keyFor`, one in the key and one in the value, which is
 * the difference that matters: a curve that moves drops both boards' sets, and a board
 * that is added takes nothing from the other.
 */
export const CURVE_ID = hash(JSON.stringify(waves));

/** How long the curve is - the denominator a "furthest" only means anything against. */
export const CURVE_LENGTH = waves.length;

/** Everything in storage for one board, or nothing, and never an exception. */
function read(runId: string): Records {
  try {
    const legacy = legacyKeyFor(runId);
    const raw = localStorage.getItem(keyFor(runId)) ?? (legacy && localStorage.getItem(legacy));
    if (!raw) return EMPTY;
    const stored = JSON.parse(raw) as Partial<Records> & { curve?: string };
    // A record set from another curve is not out of date, it is about another game.
    if (stored.curve !== CURVE_ID) return EMPTY;
    return {
      furthestWave: stored.furthestWave ?? 0,
      fastestClearMs: stored.fastestClearMs ?? null,
      fewestLeaks: stored.fewestLeaks ?? null,
    };
  } catch {
    // Unreadable, unparseable, or a privacy mode where the accessor itself throws.
    // A game that will not start because it could not read a best time is a worse
    // outcome than a game with no best time.
    return EMPTY;
  }
}

function write(runId: string, records: Records): void {
  try {
    localStorage.setItem(keyFor(runId), JSON.stringify({ curve: CURVE_ID, ...records }));
  } catch {
    // Same argument as the mute key: failing to remember is not a reason to fail.
  }
}

export function readRecords(runId: string): Records {
  return read(runId);
}

/**
 * Fold a finished run into the stored set, and report what it took.
 *
 * The two clear records are only open to runs that cleared: a fast loss is fast
 * because it ended, and a run that leaks once and dies has fewer leaks than one that
 * survived five. Guarding them on `cleared` is the whole reason a leak count is worth
 * storing at all.
 *
 * `runId` is which board it happened on, and it is the argument rather than a default
 * because there is no board a result could sensibly belong to by default.
 */
export function recordRun(runId: string, result: RunResult): { records: Records; beaten: RecordKey[] } {
  const current = read(runId);
  const records: Records = { ...current };
  const beaten: RecordKey[] = [];

  if (result.wave > records.furthestWave) {
    records.furthestWave = result.wave;
    beaten.push('furthest');
  }

  if (result.cleared) {
    if (records.fastestClearMs === null || result.durationMs < records.fastestClearMs) {
      records.fastestClearMs = result.durationMs;
      beaten.push('fastest');
    }
    if (records.fewestLeaks === null || result.leaks < records.fewestLeaks) {
      records.fewestLeaks = result.leaks;
      beaten.push('cleanest');
    }
  }

  if (beaten.length > 0) write(runId, records);
  return { records, beaten };
}
