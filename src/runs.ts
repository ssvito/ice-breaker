import { level1 } from './map.ts';
import type { LevelData } from './map.ts';

/**
 * What the shell can start. One entry today, and the shape is the entire point: the
 * shell reads a list, so the second map in v1.8 is a line in this file rather than a
 * second path through the shell or through `startRun()`.
 *
 * Its own module rather than a field on `LevelData`, because **a run is not a map**.
 * Endless is a second kind of run on the same map, and a difficulty is a knob set
 * before one; both are filed, both are blocked on there being a before, and both land
 * here beside the map when their milestone comes. A descriptor is the answer to "what
 * are we about to play", and the map is one of its fields.
 */
export interface RunDescriptor {
  /**
   * Stable key, never shown, and **nothing reads it yet - which is a debt and not a
   * spare field.**
   *
   * Records exist as of v1.7 and are filed under the curve's hash alone. That is
   * enough while this list has one entry and wrong the moment it has two: the wave
   * table is global, so two maps run the same fifteen waves and hash identically, and
   * their records would land on the same line. A `FASTEST` shared by two boards is not
   * a best time, it is a reading of which board is shorter.
   *
   * So the second entry in this list has to bring this id into the record key with it -
   * see `CURVE_ID` in `records.ts`. It was left undone on purpose rather than done
   * blind: with one map both versions behave identically, so there is nothing to verify,
   * and changing the key shape today would discard the records already on the phone.
   */
  id: string;
  /** What the entry reads as, on the day there is more than one of them to read. */
  name: string;
  map: LevelData;
}

export const RUNS: RunDescriptor[] = [{ id: 'mainframe-01', name: 'MAINFRAME 01', map: level1 }];
