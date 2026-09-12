import { CURVE_ID } from './records.ts';
import { TOWER_KINDS } from './tower.ts';
import type { TowerKind } from './tower.ts';
import { ENEMY_KINDS } from './enemy.ts';
import type { EnemyKind } from './enemy.ts';
import { waveNumber } from './wave.ts';
import type { GameState, GameStatus } from './game.ts';

/**
 * A run as data: what the player did, what walked through, and how it ended.
 *
 * Measured in ticks, and not in wall time or frames. A frame is a property of the
 * machine that drew it and wall time of the machine that ran it; the tick is the one
 * clock the game and the harness share - `game-loop.ts` only ever steps `TICK_MS` and
 * `balance.ts` steps nothing else - so a log in ticks means the same thing on both sides
 * of the seam this milestone exists to close.
 *
 * **Written continuously, sealed at the end.** Reconstructing the log from the finished
 * state was refused for the reason v1.8 deleted its last-run key: a second account of
 * what happened is a second thing that can be wrong about it. Every action is already a
 * function in `game.ts` that returns whether it took effect, so recording is one line at
 * the point of the fact.
 *
 * **Two halves, and they are not the same kind of thing.** Actions are input - they are
 * what a replay *does*. Leaks and the ending are output - they are what a replay is
 * *checked against*. Keeping them apart is what makes the check mean something: a replay
 * that lands on the same core HP by leaking a different wave passes a verdict and fails
 * this.
 */
export interface LoggedPlace {
  tick: number;
  action: 'place';
  tower: TowerKind;
  x: number;
  y: number;
}

export interface LoggedTileAction {
  tick: number;
  action: 'upgrade' | 'sell' | 'overclock';
  x: number;
  y: number;
}

export interface LoggedCall {
  tick: number;
  action: 'call';
}

export type LoggedAction = LoggedPlace | LoggedTileAction | LoggedCall;

/**
 * One enemy through the gate, and **an enemy rather than a hit point**. Every other
 * count of leaks in this project - the record, the harness's tables - is the core's lost
 * HP, and that definition is deliberate and stays. It is also not the same number: a
 * Zero-Day takes three, so "five leaks" can be five worms or two things and a boss. The
 * log is the one place that can tell them apart, because it is the only one that sees
 * the enemy rather than the arithmetic.
 */
export interface LoggedLeak {
  tick: number;
  kind: EnemyKind;
  /**
   * The wave that was running when it arrived, and not the wave that spawned it - waves
   * overlap, so those are different claims. This is the one the harness has counted since
   * v1.3 (`WaveReport.leaks` is charged to the wave on the clock), and a leak attributed
   * one way in the report and the other way in the table would be two facts wearing one
   * word.
   *
   * Stored rather than derived, because the only moment it can be known without replaying
   * the whole run is the moment it happens.
   */
  wave: number;
}

/**
 * How the run ended, and the reason a pasted log is worth anything.
 *
 * Replaying a log recorded in this session can be checked against the state still in
 * memory. The case the milestone actually named cannot: a log typed into a bug report
 * from a phone that is not here has nothing to disagree with unless the log says how it
 * came out. A replay nothing can falsify is not a gate.
 *
 * `tick` is also the run's length, which the actions cannot imply - a real run ended
 * fifteen seconds after its last tap, with the final wave walked and killed and nothing
 * left to press.
 */
export interface RunEnd {
  tick: number;
  status: GameStatus;
  coreHealth: number;
  cycles: number;
  wave: number;
}

/**
 * `run` and `curve` are the pair a record is filed under, and for the reason spelled out
 * in `records.ts`: a log is a claim about a board *and* a curve. Retune `waves` and every
 * stored log is about another game; play the same actions on another board and they land
 * on other tiles. Carrying both lets a replay refuse with "not a replay of this game"
 * rather than quietly reproducing something else.
 */
export interface RunLog {
  /** Board, from `RunDescriptor.id`. */
  run: string;
  /** Curve, from `CURVE_ID`. */
  curve: string;
  actions: LoggedAction[];
  leaks: LoggedLeak[];
  end: RunEnd;
}

/** The envelope, closed around the run that just ended. */
export function sealRunLog(runId: string, state: GameState): RunLog {
  return {
    run: runId,
    curve: CURVE_ID,
    actions: [...state.actions],
    leaks: [...state.leaks],
    end: {
      tick: state.tick,
      status: state.status,
      coreHealth: state.coreHealth,
      cycles: state.cycles,
      wave: waveNumber(state.spawner),
    },
  };
}

const HEADER = 'ice-breaker/3';

/**
 * The log as text, because text is what fits in a bug report typed on a phone.
 *
 * Every line is `<tick> <verb> ...`, so the shape of a run is legible without a tool:
 * three placements in the first ten seconds, then nothing until wave four, reads as
 * exactly that. Not JSON, which would spend most of its bytes restating the same five
 * keys - and this is the one artifact in the project whose whole value is being small
 * enough to paste.
 *
 * The two halves are merged back into one timeline rather than printed as sections,
 * because the run happened in one order and a leak between two placements is the most
 * interesting thing a log can say. Leaks sort ahead of actions on a shared tick, which
 * is not a tie-break but the truth: a leak happens *during* the tick it is stamped with
 * and an action happens after it, since nothing can be tapped mid-step.
 */
export function formatRunLog(log: RunLog): string {
  const body = [
    ...log.leaks.map((leak) => ({ tick: leak.tick, text: `${leak.tick} leak ${leak.kind} ${leak.wave}` })),
    ...log.actions.map((entry) => ({ tick: entry.tick, text: `${entry.tick} ${actionText(entry)}` })),
  ].sort((a, b) => a.tick - b.tick);

  const { tick, status, coreHealth, cycles, wave } = log.end;
  return [
    `${HEADER} ${log.run} ${log.curve}`,
    ...body.map((line) => line.text),
    `${tick} end ${status} ${coreHealth} ${cycles} ${wave}`,
  ].join('\n');
}

function actionText(entry: LoggedAction): string {
  if (entry.action === 'call') return 'call';
  if (entry.action === 'place') return `place ${entry.tower} ${entry.x} ${entry.y}`;
  return `${entry.action} ${entry.x} ${entry.y}`;
}

function wholeNumber(field: string | undefined): number | null {
  const value = Number(field);
  return field !== undefined && field !== '' && Number.isInteger(value) && value >= 0 ? value : null;
}

function parseTile(fields: string[]): { x: number; y: number } | null {
  if (fields.length !== 2) return null;
  const x = wholeNumber(fields[0]);
  const y = wholeNumber(fields[1]);
  return x === null || y === null ? null : { x, y };
}

const STATUSES: GameStatus[] = ['playing', 'won', 'lost'];

/**
 * Text back into a log, or `null` - never a partial one.
 *
 * Strict on purpose, and the strictness is the point rather than defensiveness: a log
 * that parses with one line dropped replays into a different run and reports the
 * difference as a determinism bug, which is the most expensive way this project could
 * waste a day. A log this function cannot read in full is not a log.
 *
 * What it does *not* judge is whether the board and the curve are this game's. That is a
 * reading of the envelope and it belongs to whoever is about to replay it - "a log of
 * another game" and "not a log" are different answers.
 */
export function parseRunLog(text: string): RunLog | null {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return null;

  const header = lines[0].split(/\s+/);
  if (header.length !== 3 || header[0] !== HEADER) return null;

  const actions: LoggedAction[] = [];
  const leaks: LoggedLeak[] = [];
  let end: RunEnd | null = null;
  let previousTick = 0;

  for (const line of lines.slice(1)) {
    // The ending is the last line and nothing follows it, so a log cannot claim to have
    // finished twice or to have kept playing afterwards.
    if (end) return null;

    const [rawTick, verb, ...rest] = line.split(/\s+/);
    const tick = wholeNumber(rawTick);
    // Order is part of the log rather than a convenience of how it was written: a sell
    // before the place it undoes replays into a different run, and replay walks forwards.
    if (tick === null || tick < previousTick) return null;
    previousTick = tick;

    if (verb === 'end') {
      const status = STATUSES.find((known) => known === rest[0]);
      const coreHealth = wholeNumber(rest[1]);
      const cycles = wholeNumber(rest[2]);
      const wave = wholeNumber(rest[3]);
      if (rest.length !== 4 || !status || coreHealth === null || cycles === null || wave === null) return null;
      end = { tick, status, coreHealth, cycles, wave };
      continue;
    }
    if (verb === 'leak') {
      const kind = ENEMY_KINDS.find((known) => known === rest[0]);
      const wave = wholeNumber(rest[1]);
      if (rest.length !== 2 || !kind || wave === null) return null;
      leaks.push({ tick, kind, wave });
      continue;
    }
    if (verb === 'call') {
      if (rest.length !== 0) return null;
      actions.push({ tick, action: 'call' });
      continue;
    }
    if (verb === 'place') {
      const tower = TOWER_KINDS.find((known) => known === rest[0]);
      const tile = parseTile(rest.slice(1));
      if (rest.length !== 3 || !tower || !tile) return null;
      actions.push({ tick, action: 'place', tower, ...tile });
      continue;
    }
    if (verb === 'upgrade' || verb === 'sell' || verb === 'overclock') {
      const tile = parseTile(rest);
      if (!tile) return null;
      actions.push({ tick, action: verb, ...tile });
      continue;
    }
    return null;
  }

  // A run with no ending is not a finished run, and this format only describes finished
  // ones. The day a run can be suspended and resumed, that is a different last line.
  if (!end) return null;
  return { run: header[1], curve: header[2], actions, leaks, end };
}
