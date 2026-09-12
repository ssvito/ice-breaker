import { CURVE_ID } from './records.ts';
import { TOWER_KINDS } from './tower.ts';
import type { TowerKind } from './tower.ts';

/**
 * What the player did, as ticks and actions.
 *
 * The tick and not the wall clock, and not the frame: a frame is a property of the
 * machine that drew it, and wall time is a property of the machine that ran it. The
 * tick is the one clock the game and the harness share - `game-loop.ts` only ever steps
 * `TICK_MS` and `balance.ts` steps nothing else - so a log measured in ticks means the
 * same thing on both sides of the seam this milestone exists to close.
 *
 * **Written continuously, sealed at the end.** The alternative was to reconstruct the
 * log from the finished state, and that was refused for the reason v1.8 deleted its
 * last-run key: a second account of what happened is a second thing that can be wrong
 * about it. Every action is already a function in `game.ts` that returns whether it
 * took effect, so recording is one line at the point of the fact. What is assembled at
 * the end is only the envelope - the board, the curve and the length - because those
 * are facts about the run rather than events in it.
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
 * A run in a few bytes: the envelope plus what was done inside it.
 *
 * `run` and `curve` are the same pair a record is filed under, and for the same reason
 * spelled out in `records.ts` - a log is a claim about a board *and* a curve. Retune
 * `waves` and every stored log is about another game; play the same actions on another
 * board and they land on other tiles. Carrying both is what lets a replay refuse with
 * "not a replay of this game" instead of quietly reproducing something else.
 *
 * `ticks` is the run's length, and it is here because the actions cannot imply it. A run
 * ends long after its last action - the final wave is walked and killed with nothing
 * left to press - so a replay that stopped at the last logged tick would stop before the
 * verdict it exists to reproduce.
 */
export interface RunLog {
  /** Board, from `RunDescriptor.id`. */
  run: string;
  /** Curve, from `CURVE_ID`. */
  curve: string;
  /** How many ticks the run lasted. */
  ticks: number;
  actions: LoggedAction[];
}

/**
 * Everything the log needs from a run, and nothing else. Spelled structurally rather
 * than as `GameState` so this module stays off the simulation's import graph: `game.ts`
 * takes `LoggedAction` as a type and nothing at runtime, and the dependency does not
 * come back the other way.
 */
export interface LoggedRun {
  tick: number;
  log: LoggedAction[];
}

/** The envelope, closed around the run that just ended. */
export function sealRunLog(runId: string, run: LoggedRun): RunLog {
  return { run: runId, curve: CURVE_ID, ticks: run.tick, actions: [...run.log] };
}

const HEADER = 'ice-breaker/1';

/**
 * The log as text, because text is what fits in a bug report typed on a phone.
 *
 * A line per action, verb first, so the shape of a run is legible without a tool: three
 * places in the first second and nothing until wave four reads as exactly that. Not
 * JSON, which would spend most of its bytes restating the same five keys - and this is
 * the one artifact in the project whose whole value is being small enough to paste.
 */
export function formatRunLog(log: RunLog): string {
  const lines = [`${HEADER} ${log.run} ${log.curve} ${log.ticks}`];
  for (const entry of log.actions) {
    if (entry.action === 'call') lines.push(`${entry.tick} call`);
    else if (entry.action === 'place') lines.push(`${entry.tick} place ${entry.tower} ${entry.x} ${entry.y}`);
    else lines.push(`${entry.tick} ${entry.action} ${entry.x} ${entry.y}`);
  }
  return lines.join('\n');
}

function parseTile(fields: string[]): { x: number; y: number } | null {
  const x = Number(fields[0]);
  const y = Number(fields[1]);
  if (fields.length !== 2 || !Number.isInteger(x) || !Number.isInteger(y)) return null;
  return { x, y };
}

/**
 * Text back into a log, or `null` - never a partial one.
 *
 * Strict on purpose, and the strictness is the point rather than defensiveness: a log
 * that parses with one line dropped replays into a different run and reports the
 * difference as a determinism bug. A log this function cannot read in full is not a log.
 * What it does *not* judge is whether the run and the curve are this game's - that is a
 * reading of the envelope, and it belongs to whoever is about to replay it.
 */
export function parseRunLog(text: string): RunLog | null {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return null;

  const header = lines[0].split(/\s+/);
  const ticks = Number(header[3]);
  if (header.length !== 4 || header[0] !== HEADER || !Number.isInteger(ticks) || ticks < 0) return null;

  const actions: LoggedAction[] = [];
  let previousTick = 0;
  for (const line of lines.slice(1)) {
    const [rawTick, verb, ...rest] = line.split(/\s+/);
    const tick = Number(rawTick);
    // Order is part of the log rather than a convenience of how it was written: a sell
    // before the place it undoes replays into a different run, and replay walks the list
    // forwards. A log that is out of order is one this function cannot read.
    if (!Number.isInteger(tick) || tick < previousTick || tick > ticks) return null;
    previousTick = tick;

    if (verb === 'call') {
      if (rest.length !== 0) return null;
      actions.push({ tick, action: 'call' });
      continue;
    }
    if (verb === 'place') {
      const tile = parseTile(rest.slice(1));
      const tower = TOWER_KINDS.find((kind) => kind === rest[0]);
      if (rest.length !== 3 || !tile || !tower) return null;
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

  return { run: header[1], curve: header[2], ticks, actions };
}
