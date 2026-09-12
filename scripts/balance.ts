import { boards, findBoard, loadoutCost, loadoutNames, MARGIN_MAX, MARGIN_MIN, runBalance, runMargin } from '../src/balance.ts';
import type { Board, Loadout, MarginReport, RunReport } from '../src/balance.ts';
import { MAX_CORE_HEALTH, STARTING_CYCLES } from '../src/game.ts';
import { waves } from '../src/wave.ts';

/**
 * CLI shell for the balance harness. All it does is read argv and print - the run
 * itself lives in `src/balance.ts`, where `tsc` type-checks it. Node strips the
 * types here at load; nothing compiles this file, which is why it is kept to
 * formatting with no numbers of its own.
 *
 *   npm run balance                          # every declared loadout, on every board
 *   npm run balance -- focused               # one of them, on every board
 *   npm run balance -- --board recursion-02  # one board, every loadout
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
// `--board x` puts the id in `names`, where it would then be read as a loadout.
const wanted = names.filter((name) => name !== boardId);

if (args.includes('--help')) {
  console.log('usage: npm run balance -- [loadout...] [--board id] [--margin] [--json]');
  console.log(`loadouts: ${loadoutNames.join(', ')}`);
  console.log(`boards:   ${boards.map((board) => `${board.id} (${board.name})`).join(', ')}`);
  console.log('--margin: bisect the run-wide HP multiplier for the first leak and the loss');
  process.exit(0);
}

/** One thing to measure: a layout, and the board whose tiles it is written on. */
interface Selection {
  board: Board;
  loadout: Loadout;
}

const selectedBoards = boardId === undefined || boardId === null ? boards : [resolveBoard(boardId)];

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

function printReport(report: RunReport, loadout: Loadout): void {
  const cost = loadoutCost(loadout);

  console.log(`${report.board} · ${report.loadout.toUpperCase()} - ${report.note}`);
  const called = report.totalCalledEarly > 0 ? `  (${report.totalCalledEarly} of it called early)` : '';
  console.log(
    `  ${OUTCOME[report.status]}  core ${report.coreHealth}/${MAX_CORE_HEALTH}  ` +
      `banked ${report.cyclesEnd}  earned ${report.totalEarned}  spent ${report.totalSpent}/${cost}  ${clock(report.durationMs)}${called}`,
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
  const reports = selected.map(({ board, loadout }) => runBalance(loadout, { level: board.level }));

  if (asJson) {
    console.log(JSON.stringify(reports, null, 2));
  } else {
    reports.forEach((report, index) => {
      if (index > 0) console.log('');
      printReport(report, selected[index].loadout);
    });
    // One report is its own summary; the table only earns its place as a comparison.
    if (reports.length > 1) printSummary(reports);
  }
}
