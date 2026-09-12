import { level1, level2 } from './map.ts';
import type { LevelData } from './map.ts';

/**
 * What the shell can start. Two entries, and the shape was the entire point before
 * either of them was worth choosing between: the shell reads a list, so v1.8's second
 * map landed here as a line of data rather than as a second path through the shell or
 * through `startRun()`.
 *
 * Its own module rather than a field on `LevelData`, because **a run is not a map**.
 * Endless is a second kind of run on the same map, and a difficulty is a knob set
 * before one; both are filed, both are blocked on there being a before, and both land
 * here beside the map when their milestone comes. A descriptor is the answer to "what
 * are we about to play", and the map is one of its fields.
 */
export interface RunDescriptor {
  /**
   * Stable key, never shown, and **half of what a record is filed under** - see
   * `recordKey` in `records.ts`.
   *
   * Records arrived in v1.7 filed under the curve's hash alone, which was enough while
   * this list had one entry and wrong the moment it had two: the wave table is global,
   * so both boards run the same fifteen waves and hash identically. A `FASTEST` shared
   * by two boards is not a best time, it is a reading of which board is shorter.
   *
   * Paid in the same step that added the second board, which is the step where the claim
   * "two boards, two sets" can actually be checked rather than assumed.
   */
  id: string;
  /** What the entry reads as. Printed by the shell now that there are two to read. */
  name: string;
  map: LevelData;
}

/**
 * Two entries, and the shell needs no notice of it: `createShell` already loops this
 * list and already prints names instead of `START` the moment there is more than one
 * name to print. That was the whole design of v1.7's picker and this is it being taken
 * up - a line of data rather than a second path through the shell or through
 * `startRun()`.
 *
 * Order is the reading order. MAINFRAME 01 is first because it is the board the curve
 * was tuned on and the one a first-time player should meet; RECURSION 02 is the fold,
 * and it asks a question that only makes sense once you have built on a board that does
 * not fold.
 */
export const RUNS: RunDescriptor[] = [
  { id: 'mainframe-01', name: 'MAINFRAME 01', map: level1 },
  { id: 'recursion-02', name: 'RECURSION 02', map: level2 },
];

/**
 * The board that existed alone while records were filed under the curve and nothing else.
 * `records.ts` reads the old un-scoped key as this board's, because there has only ever
 * been one board those records could have been set on - see `legacyKeyFor`.
 *
 * A constant rather than the string typed twice: this is the one id in the file that two
 * modules have to agree about, and the way that agreement breaks is a rename here that
 * silently orphans a player's set.
 */
export const LEGACY_RUN_ID = RUNS[0].id;
