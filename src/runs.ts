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
   * Stable key, never shown. It is what a record will be filed under once records
   * exist - a record is a claim about a run, so it has to name which one.
   */
  id: string;
  /** What the entry reads as, on the day there is more than one of them to read. */
  name: string;
  map: LevelData;
}

export const RUNS: RunDescriptor[] = [{ id: 'mainframe-01', name: 'MAINFRAME 01', map: level1 }];
