import { callWaveEarly, overclockTower, placeTower, sellTower, towerAt, upgradeTower } from './game.ts';
import type { GameState } from './game.ts';
import { runSimulation } from './balance.ts';
import type { RunDriver, RunReport } from './balance.ts';
import { CURVE_ID } from './records.ts';
import { RUNS } from './runs.ts';
import type { LoggedAction, LoggedLeak, RunLog } from './run-log.ts';
import { towerStats } from './tower.ts';

/**
 * A recorded run, played again.
 *
 * This is the step the first two were for. A replay that does not reproduce is a
 * determinism bug **with a reproduction attached**, which is the most useful failure this
 * project could have - and a replay that does reproduce turns "the game and the harness
 * are one simulation" from a claim about two code paths into a claim about a run somebody
 * actually played.
 *
 * It goes through `runSimulation` rather than a loop of its own, so a replayed run and a
 * declared layout are measured by the same instrument and their reports can be read side
 * by side. The only thing that differs is who is pressing the buttons.
 */

/**
 * Reading the envelope, which the parser deliberately does not do: "not a log" and "a log
 * of another game" are different answers, and only the second one needs a board and a
 * curve to compare against.
 */
function refusal(log: RunLog): string | null {
  if (log.curve !== CURVE_ID) {
    return `another curve: the log is ${log.curve} and this game is ${CURVE_ID}`;
  }
  if (!RUNS.some((run) => run.id === log.run)) {
    return `no such board: ${log.run}`;
  }
  return null;
}

/**
 * Applies what the player did, at the tick they did it.
 *
 * Actions are addressed by tile rather than by tower, because a log is text and a tower
 * is an object - the tile is the only name for a tower that survives being written down.
 * Strictly in recorded order, including within one tick: a call that paid for the
 * placement after it is a different run from the same two the other way round.
 */
function replayDriver(log: RunLog, name: string) {
  let next = 0;
  /**
   * The run being driven. `runSimulation` returns a report and not a state, and the
   * comparison needs the state - the actions the replay managed to take, the enemies
   * that walked through. Held from here because the driver is handed it every tick and
   * the simulation mutates one object in place, so the reference seen on the first tick
   * is the finished run once the loop is over.
   */
  let driven: GameState | null = null;

  const driver: RunDriver = {
    name,
    note: `replay of ${log.actions.length} actions over ${log.end.tick} ticks`,
    act(state) {
      driven = state;
      let calledEarly = 0;
      const bought: string[] = [];

      while (next < log.actions.length && log.actions[next].tick === state.tick) {
        const action = log.actions[next++];
        if (action.action === 'call') {
          calledEarly += callWaveEarly(state);
          continue;
        }
        if (action.action === 'place') {
          const tower = placeTower(state, action.tower, action);
          if (tower) bought.push(`${towerStats(tower.kind).name} T1`);
          continue;
        }
        // The three that act on something already standing. A missing tower is not
        // handled here and deliberately so: the replay records what it managed to do,
        // and the comparison is what says the two runs differ.
        const tower = towerAt(state, action);
        if (!tower) continue;
        if (action.action === 'upgrade') {
          if (upgradeTower(state, tower)) bought.push(`${towerStats(tower.kind).name} T${tower.tier}`);
        } else if (action.action === 'sell') {
          sellTower(state, tower);
        } else {
          overclockTower(state, tower);
        }
      }

      return { bought, calledEarly };
    },
  };

  return { driver, driven: () => driven };
}

export interface Replay {
  report: RunReport;
  state: GameState;
  /**
   * What the replay and the log disagree about, and **empty is the whole point**. A
   * replay is only evidence if it could have failed, so this compares more than the
   * verdict: the actions the replay managed to take, the enemies that walked through,
   * and how it ended.
   */
  differences: string[];
}

export type ReplayOutcome = { replayed: false; refused: string } | ({ replayed: true } & Replay);

export function replayRun(log: RunLog): ReplayOutcome {
  const refused = refusal(log);
  if (refused) return { replayed: false, refused };

  const board = RUNS.find((run) => run.id === log.run)!;
  const { driver, driven } = replayDriver(log, `replay ${board.id}`);
  const report = runSimulation(driver, { level: board.map });
  const state = driven()!;

  return { replayed: true, report, state, differences: compare(log, state) };
}

function describeAction(entry: LoggedAction): string {
  if (entry.action === 'call') return `${entry.tick} call`;
  if (entry.action === 'place') return `${entry.tick} place ${entry.tower} ${entry.x} ${entry.y}`;
  return `${entry.tick} ${entry.action} ${entry.x} ${entry.y}`;
}

function describeLeak(leak: LoggedLeak): string {
  return `${leak.tick} ${leak.kind}`;
}

/**
 * Line by line rather than a single "these runs differ", because the useful part of a
 * failed replay is *where* the two stopped agreeing. The first differing action is
 * usually the bug and everything after it is the wake.
 */
function compareSeries<T>(what: string, recorded: T[], replayed: T[], describe: (item: T) => string): string[] {
  const differences: string[] = [];
  for (let i = 0; i < Math.max(recorded.length, replayed.length); i++) {
    const before = recorded[i];
    const after = replayed[i];
    if (before !== undefined && after !== undefined && describe(before) === describe(after)) continue;
    differences.push(
      `${what} ${i}: recorded ${before === undefined ? 'nothing' : describe(before)}, replayed ${
        after === undefined ? 'nothing' : describe(after)
      }`,
    );
  }
  return differences;
}

function compare(log: RunLog, state: GameState): string[] {
  const differences = [
    // The input half. The replay records its own actions as it takes them, through the
    // same lines in `game.ts` that recorded the original - so an action the replay could
    // not afford, or one that landed on a tile the original left empty, is missing here
    // rather than merely ineffective. This is the log's recording machinery gating its
    // own playback, and it costs nothing.
    ...compareSeries('action', log.actions, state.actions, describeAction),
    // The output half, which is what the log grew in order to make this comparison
    // possible at all.
    ...compareSeries('leak', log.leaks, state.leaks, describeLeak),
  ];

  const end = log.end;
  if (state.status !== end.status) differences.push(`status: recorded ${end.status}, replayed ${state.status}`);
  if (state.coreHealth !== end.coreHealth) {
    differences.push(`core HP: recorded ${end.coreHealth}, replayed ${state.coreHealth}`);
  }
  if (state.cycles !== end.cycles) differences.push(`Cycles: recorded ${end.cycles}, replayed ${state.cycles}`);
  if (state.tick !== end.tick) differences.push(`length: recorded ${end.tick} ticks, replayed ${state.tick}`);

  return differences;
}
