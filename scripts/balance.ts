import { findLoadout, loadoutCost, loadouts, MARGIN_MAX, MARGIN_MIN, runBalance, runMargin } from '../src/balance.ts';
import type { MarginReport, RunReport } from '../src/balance.ts';
import { MAX_CORE_HEALTH, STARTING_CYCLES } from '../src/game.ts';
import { waves } from '../src/wave.ts';

/**
 * CLI shell for the balance harness. All it does is read argv and print - the run
 * itself lives in `src/balance.ts`, where `tsc` type-checks it. Node strips the
 * types here at load; nothing compiles this file, which is why it is kept to
 * formatting with no numbers of its own.
 *
 *   npm run balance                # every declared loadout
 *   npm run balance -- focused     # one of them
 *   npm run balance -- --margin    # how much harder the curve would have to be
 *   npm run balance -- --json      # the same reports as JSON
 */

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const asMargin = args.includes('--margin');
const names = args.filter((arg) => !arg.startsWith('--'));

if (args.includes('--help')) {
  console.log('usage: npm run balance -- [loadout...] [--margin] [--json]');
  console.log(`loadouts: ${loadouts.map((loadout) => loadout.name).join(', ')}`);
  console.log('--margin: bisect the run-wide HP multiplier for the first leak and the loss');
  process.exit(0);
}

const selected = names.length > 0 ? names.map(resolve) : loadouts;

function resolve(name: string) {
  const loadout = findLoadout(name);
  if (!loadout) {
    console.error(`unknown loadout "${name}" - try one of: ${loadouts.map((l) => l.name).join(', ')}`);
    process.exit(1);
  }
  return loadout;
}

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

function printReport(report: RunReport): void {
  const loadout = findLoadout(report.loadout);
  const cost = loadout ? loadoutCost(loadout) : 0;

  console.log(`${report.loadout.toUpperCase()} - ${report.note}`);
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
  console.log('  LOADOUT   RESULT          CORE  LEAK  EARNED  BANKED   TIME');
  for (const report of all) {
    console.log(
      `  ${report.loadout.padEnd(9)} ${OUTCOME[report.status].padEnd(15)} ${pad(report.coreHealth, 4)}  ` +
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
  console.log('  LOADOUT   AT 1x                FIRST LEAK  ON WAVE   LOSES AT  ON WAVE');
  for (const report of all) {
    console.log(
      `  ${report.loadout.padEnd(9)} ${(OUTCOME[report.status] + ` ${report.coreHealth}/${MAX_CORE_HEALTH}`).padEnd(20)} ` +
        `${pad(margin(report.firstLeak), 10)}  ${pad(report.firstLeakWave ?? '-', 7)}   ` +
        `${pad(margin(report.loss), 8)}  ${pad(report.lossWave ?? '-', 7)}`,
    );
  }
  console.log('');
  console.log('  Every row is a floor, not a measurement: the harness never fires Overclock.');
}

if (asMargin) {
  const margins = selected.map((loadout) => runMargin(loadout));
  if (asJson) console.log(JSON.stringify(margins, null, 2));
  else printMargins(margins);
} else {
  const reports = selected.map((loadout) => runBalance(loadout));

  if (asJson) {
    console.log(JSON.stringify(reports, null, 2));
  } else {
    reports.forEach((report, index) => {
      if (index > 0) console.log('');
      printReport(report);
    });
    // One report is its own summary; the table only earns its place as a comparison.
    if (reports.length > 1) printSummary(reports);
  }
}
