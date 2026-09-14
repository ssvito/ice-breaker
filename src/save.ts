import { formatRunLog, parseRunLog, sealRunLog } from './run-log.ts';
import type { RunLog } from './run-log.ts';
import type { GameState } from './game.ts';

/**
 * The run in progress, written down.
 *
 * A run is six to eight minutes on a device that can take a phone call, and until now an
 * interruption cost the whole thing. This is the comfort half of v1.9 and it was marked
 * as the cuttable tail from the day the milestone was planned - which is also the reason
 * it survived to be built. **It falls out of the log.** The three steps before it turned
 * a run into a few dozen lines of text and then proved those lines replay to the same
 * run; a save slot is that artifact with a place to live and a reader that stops early.
 *
 * So there is no serialiser here, and that is the whole design. Writing `GameState` out
 * field by field would be a second account of the run - enemies mid-path, projectiles
 * holding references to the enemies they are chasing, a spawner mid-countdown - and a
 * second account is a second thing that can be wrong, in exactly the way v1.8 deleted its
 * last-run key for and step 2 refused to reconstruct a log for. It would also rot
 * silently: every field added to the simulation afterwards is a field this forgets.
 *
 * What is stored is what the player did. What comes back is the simulation doing it
 * again.
 */

/**
 * One slot, because there is one run in progress. The app cannot hold two - `state` in
 * `main.ts` is a single nullable run and that is the app's whole state machine - so a
 * key per board would be a place for a second one to hide.
 *
 * No curve in the key and no board either, unlike `records.ts`, and for the opposite
 * reason: a record is filed *under* its board and curve so the right set is found, while
 * a save carries both **inside** it, in the log's own header. So a retune or a board that
 * no longer exists is refused by the replay's own envelope check rather than by a key
 * that quietly misses.
 */
const KEY = 'ice-breaker:run';

/**
 * Write the run down, or don't - and this function decides which, so no caller has to.
 *
 * **A run that is over is not saved**, because it has nowhere to be resumed to; the
 * record and the report are what a finished run leaves behind. **A run that has not
 * stepped is not saved either**: a resume of tick 0 is the start button with extra steps,
 * and it is the one log a replay cannot get a state out of, since the driver is only
 * handed one on a turn that never came.
 *
 * Stored as the log's own text rather than as JSON around it. It is the format the whole
 * artifact exists in, the parser that reads it back is the strict one step 2 wrote, and a
 * save lifted out of devtools is a bug report from a phone that is mid-run - which is a
 * better report than one from a run that already ended.
 */
export function saveRun(runId: string, state: GameState): void {
  if (state.status !== 'playing' || state.tick === 0) return;
  try {
    localStorage.setItem(KEY, formatRunLog(sealRunLog(runId, state)));
  } catch {
    // Same argument as the records key and the mute key: failing to remember is not a
    // reason to fail. A quota error or a privacy mode where the accessor itself throws
    // costs the player a resume, and costs the run nothing.
  }
}

/**
 * What is in the slot, as a log, or nothing.
 *
 * A log that will not parse is nothing, which is the parser's strictness being the right
 * strictness for this too: half a save is a run nobody played, and the way storage
 * actually breaks - a write cut off by the tab dying mid-`setItem`, a key edited by hand
 * - produces exactly that. A finished log in here is also nothing, because the slot is
 * for runs to come back to.
 */
export function readSave(): RunLog | null {
  try {
    const text = localStorage.getItem(KEY);
    const log = text ? parseRunLog(text) : null;
    return log?.end.status === 'suspended' ? log : null;
  } catch {
    return null;
  }
}

/** The slot emptied: the run it held is over, or has been replaced by another one. */
export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // As above.
  }
}
