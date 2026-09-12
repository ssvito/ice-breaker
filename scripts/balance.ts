import { boards, findBoard, loadoutCost, loadoutNames, MARGIN_MAX, MARGIN_MIN, runBalance, runMargin } from '../src/balance.ts';
import type { Board, Loadout, MarginReport, RunReport } from '../src/balance.ts';
import { MAX_CORE_HEALTH, STARTING_CYCLES } from '../src/game.ts';
import { waves } from '../src/wave.ts';
import { parseRunLog } from '../src/run-log.ts';
import { replayRun } from '../src/replay.ts';
import { readFileSync } from 'node:fs';

/**
 * CLI shell for the balance harness. All it does is read argv and print - the run
 * itself lives in `src/balance.ts`, where `tsc` type-checks it. Node strips the
 * types here at load; nothing compiles this file, which is why it is kept to
 * formatting with no numbers of its own.
 *
 *   npm run balance                          # every declared loadout, on every board
 *   npm run balance -- focused               # one of them, on every board
 *   npm run balance -- --board recursion-02  # one board, every loadout
 *   npm run balance -- --run some.run        # a recorded run, beside its board's layouts
 *   npm run balance -- --margin              # how much harder the curve would have to be
 *   npm run balance -- --json                # the same reports as JSON
 *
 * The board is part of a reading as of v1.8, and the pairing is the point: the same
 * layout name is declared on both boards, so `veteran` against `veteran` is a statement
 * about the two boards with the curve, the roster and the spending order held still.
 */

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const asMargin = args.includes('--margin');
const names = args.filter((arg) => !arg.startsWith('--'));

const boardFlag = args.indexOf('--board');
const boardId = boardFlag === -1 ? null : args[boardFlag + 1];
const runFlag = args.indexOf('--run');
const runPath = runFlag === -1 ? null : args[runFlag + 1];
// `--board x` and `--run p` put their values in `names`, where they would then be read
// as loadouts.
const wanted = names.filter((name) => name !== boardId && name !== runPath);

if (args.includes('--help')) {
  console.log('usage: npm run balance -- [loadout...] [--board id] [--run path] [--margin] [--json]');
  console.log(`loadouts: ${loadoutNames.join(', ')}`);
  console.log(`boards:   ${boards.map((board) => `${board.id} (${board.name})`).join(', ')}`);
  console.log('--margin: bisect the run-wide HP multiplier for the first leak and the loss');
  console.log('--run:    replay a recorded run and read it beside the layouts of its own board');
  process.exit(0);
}

/** One thing to measure: a layout, and the board whose tiles it is written on. */
interface Selection {
  board: Board;
  loadout: Loadout;
}

/**
 * The recorded run, replayed - the reason this instrument grew a flag. A log names its
 * own board, so `--run` alone selects the comparison the reading needs: the run that was
 * played, beside the layouts declared on the same board and measured by the same loop.
 */
const played = runPath === null || runPath === undefined ? null : replay(runPath);

/** The replayed report, and the board its log named - a report carries a board's name, not its id. */
function replay(path: string): { report: RunReport; boardId: string } {
  const log = parseRunLog(readFileSync(path, 'utf8'));
  if (!log) {
    console.error(`"${path}" is not a run log this build can read`);
    process.exit(1);
  }
  const outcome = replayRun(log);
  if (!outcome.replayed) {
    console.error(`"${path}" is a log of another game - ${outcome.refused}`);
    process.exit(1);
  }
  // Printed rather than swallowed, and it is the only line here that reports on the
  // instrument instead of on the game: a replay that does not reproduce is a determinism
  // bug, and every number under it would be about a run nobody played.
  if (outcome.differences.length > 0) {
    console.error(`WARNING: this run did not reproduce - ${outcome.differences.length} differences`);
    for (const difference of outcome.differences) console.error(`  ${difference}`);
    console.error('');
  }
  return { report: outcome.report, boardId: log.run };
}

const selectedBoards =
  boardId !== undefined && boardId !== null
    ? [resolveBoard(boardId)]
    : played
      ? [resolveBoard(played.boardId)]
      : boards;

function resolveBoard(id: string): Board {
  const board = findBoard(id);
  if (!board) {
    console.error(`unknown board "${id}" - try one of: ${boards.map((b) => b.id).join(', ')}`);
    process.exit(1);
  }
  return board;
}

if (wanted.some((name) => !loadoutNames.includes(name))) {
  const bad = wanted.find((name) => !loadoutNames.includes(name));
  console.error(`unknown loadout "${bad}" - try one of: ${loadoutNames.join(', ')}`);
  process.exit(1);
}

// Board-major: every layout on one board, then every layout on the next. A reading is
// about a board, and interleaving them would make the comparison the reader has to do
// a matter of scrolling.
const selected: Selection[] = selectedBoards.flatMap((board) =>
  board.loadouts.filter((loadout) => wanted.length === 0 || wanted.includes(loadout.name)).map((loadout) => ({ board, loadout })),
);

function clock(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function pad(value: string | number, width: number): string {
  return String(value).padStart(width);
}

const OUTCOME: Record<RunReport['status'], string> = {
  won: 'SYSTEM SECURED',
  lost: 'CORE BREACHED',
  playing: 'STILL RUNNING',
  timeout: 'TIMED OUT',
};

/**
 * `cost` is what the layout would have cost if bought whole, and a replayed run has no
 * such number: a log is what somebody did, not a plan they were working towards. So the
 * denominator is dropped rather than faked.
 */
function printReport(report: RunReport, cost: number | null): void {
  console.log(`${report.board} · ${report.loadout.toUpperCase()} - ${report.note}`);
  const called = report.totalCalledEarly > 0 ? `  (${report.totalCalledEarly} of it called early)` : '';
  console.log(
    `  ${OUTCOME[report.status]}  core ${report.coreHealth}/${MAX_CORE_HEALTH}  ` +
      `banked ${report.cyclesEnd}  earned ${report.totalEarned}  ` +
      `spent ${report.totalSpent}${cost === null ? '' : `/${cost}`}  ${clock(report.durationMs)}${called}`,
  );
  console.log('');
  console.log('  WAVE  SIZE  PEAK  LEAK  EARNED  SPENT  BANKED   TIME  BOUGHT');

  for (const wave of report.waves) {
    const row =
      `  ${pad(wave.wave, 4)}  ${pad(wave.spawned, 4)}  ${pad(wave.peakEnemies, 4)}  ${pad(wave.leaks, 4)}  ` +
      `${pad(wave.earned, 6)}  ${pad(wave.spent, 5)}  ${pad(wave.cyclesEnd, 6)}  ${pad(clock(wave.durationMs), 5)}  ` +
      `${wave.bought.join(', ')}`;
    console.log(row.trimEnd());
  }

  if (report.unbought.length > 0) {
    const never = report.unbought.map((build) => `${build.kind}@${build.x},${build.y} T${build.tier ?? 1}`);
    console.log(`  never afforded: ${never.join(', ')}`);
  }
}

function printSummary(all: RunReport[]): void {
  console.log('');
  console.log(`  ${waves.length} waves, ${STARTING_CYCLES} starting Cycles, ${MAX_CORE_HEALTH} core HP`);
  console.log('  BOARD         LOADOUT   RESULT          CORE  LEAK  EARNED  BANKED   TIME');
  for (const report of all) {
    console.log(
      `  ${report.board.padEnd(13)} ${report.loadout.padEnd(9)} ${OUTCOME[report.status].padEnd(15)} ${pad(report.coreHealth, 4)}  ` +
        `${pad(report.totalLeaks, 4)}  ${pad(report.totalEarned, 6)}  ${pad(report.cyclesEnd, 6)}  ${pad(clock(report.durationMs), 5)}`,
    );
  }
}

/** A margin, as a multiplier - or which end of the search range it fell off. */
function margin(value: number | null): string {
  if (value === null) return `>${MARGIN_MAX.toFixed(2)}`;
  if (value === MARGIN_MIN) return `<${MARGIN_MIN.toFixed(2)}`;
  return `${value.toFixed(2)}x`;
}

function printMargins(all: MarginReport[]): void {
  console.log('');
  console.log(`  ${waves.length} waves, run-wide HP multiplier bisected over ${MARGIN_MIN}x to ${MARGIN_MAX}x`);
  console.log('  BOARD         LOADOUT   AT 1x                FIRST LEAK  ON WAVE   LOSES AT  ON WAVE');
  for (const report of all) {
    console.log(
      `  ${report.board.padEnd(13)} ${report.loadout.padEnd(9)} ${(OUTCOME[report.status] + ` ${report.coreHealth}/${MAX_CORE_HEALTH}`).padEnd(20)} ` +
        `${pad(margin(report.firstLeak), 10)}  ${pad(report.firstLeakWave ?? '-', 7)}   ` +
        `${pad(margin(report.loss), 8)}  ${pad(report.lossWave ?? '-', 7)}`,
    );
  }
  console.log('');
  console.log('  Every row is a floor, not a measurement: the harness never fires Overclock.');
}

if (asMargin) {
  const margins = selected.map(({ board, loadout }) => runMargin(loadout, { level: board.level }));
  if (asJson) console.log(JSON.stringify(margins, null, 2));
  else printMargins(margins);
} else {
  const declared = selected.map(({ board, loadout }) => ({
    report: runBalance(loadout, { level: board.level }),
    cost: loadoutCost(loadout) as number | null,
  }));
  // Last, so it is the row the eye lands on after the layouts it is being read against.
  const rows = played ? [...declared, { report: played.report, cost: null }] : declared;

  if (asJson) {
    console.log(JSON.stringify(rows.map((row) => row.report), null, 2));
  } else {
    rows.forEach((row, index) => {
      if (index > 0) console.log('');
      printReport(row.report, row.cost);
    });
    // One report is its own summary; the table only earns its place as a comparison.
    if (rows.length > 1) printSummary(rows.map((row) => row.report));
  }
}
