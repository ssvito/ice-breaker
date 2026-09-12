import {
  callWaveEarly,
  createGameState,
  MAX_CORE_HEALTH,
  placeTower,
  stepGame,
  TICK_MS,
  towerAt,
  upgradeTower,
} from './game.ts';
import type { GameState, GameStatus } from './game.ts';
import { level1, level2 } from './map.ts';
import type { LevelData } from './map.ts';
import { waves } from './wave.ts';
import { MAX_TIER, towerStats } from './tower.ts';
import type { Tower, TowerKind } from './tower.ts';

/**
 * The balance harness: run the whole wave curve headless against a declared tower
 * layout and report what it cost the player, wave by wave.
 *
 * Ten waves cannot be tuned by playing them. The loop "rebuild, sit through eight
 * waves on a phone, change one number" is how a curve ends up shipped on vibes,
 * so the curve gets a measuring instrument before it gets numbers.
 *
 * It is cheap because the simulation is already deterministic: `stepGame` with no
 * hooks reaches no `Math.random()` at all (`tests/game.test.ts` gates that), so a
 * fixed timestep in means the same report out, every time, with no seeded RNG.
 *
 * This module deliberately prints nothing and reads no argv - it lives in `src/`
 * so `tsc` type-checks it along with the simulation it measures, and `lib` here is
 * DOM, not Node. The CLI shell in `scripts/balance.ts` does the talking.
 */

/**
 * One tower in a build order: put a `kind` on this tile and take it to `tier`,
 * buying each step as soon as the Cycles are there, from `fromWave` onwards.
 */
export interface Build {
  kind: TowerKind;
  x: number;
  y: number;
  /** Target tier, 1..MAX_TIER. Defaults to 1 (place it and leave it). */
  tier?: number;
  /** Wave number (1-based) this build becomes eligible. Defaults to 1, i.e. opening buy. */
  fromWave?: number;
}

export interface Loadout {
  name: string;
  /** What this layout is meant to prove. Printed with the report. */
  note: string;
  /**
   * A build *order*, not a set: entries are bought strictly in sequence, and an
   * eligible entry the player cannot afford blocks the ones behind it until the
   * kills pay for it. That is what declaring a priority means, and it is what
   * makes "is tier 3 reachable by wave 8" a question the harness can answer.
   */
  builds: Build[];
  /**
   * Calls every wave the instant it can be called, taking the bonus and giving up
   * the lull. The aggressive end of the run: more Cycles, less time to spend them
   * in, and every wave met with whatever was already standing.
   */
  callWavesEarly?: boolean;
}

export interface WaveReport {
  wave: number;
  /**
   * Cycles taken for calling the *next* wave early, counted inside `earned`. Booked
   * to this row because the countdown it buys out belongs to this row - the lull
   * after a wave is charged to the wave that just finished, same as its seconds are.
   */
  calledEarly: number;
  /** Enemies the wave definition spawns. Split children are not counted; they show up in `peakEnemies`. */
  spawned: number;
  peakEnemies: number;
  leaks: number;
  coreHealth: number;
  earned: number;
  spent: number;
  cyclesEnd: number;
  durationMs: number;
  /** Purchases that landed during this wave, as `KIND T2` labels. */
  bought: string[];
}

export interface RunReport {
  /** Which board it was run on. A report that does not say is half a reading. */
  board: string;
  loadout: string;
  note: string;
  status: GameStatus | 'timeout';
  coreHealth: number;
  totalLeaks: number;
  cyclesEnd: number;
  totalEarned: number;
  totalSpent: number;
  /** Of `totalEarned`, how much came from calling waves early rather than from kills. */
  totalCalledEarly: number;
  durationMs: number;
  waves: WaveReport[];
  /** Builds the run never afforded, in the order they were still waiting in. */
  unbought: Build[];
}

export interface BalanceOptions {
  level?: LevelData;
  /** Safety net for a layout that can neither clear a wave nor lose - default 20 simulated minutes. */
  maxTicks?: number;
  /** Run-wide multiplier over every wave's own `hpScale`. 1 is the shipped curve. */
  hpScale?: number;
}

/** A build plus the tower it became, once it exists. */
interface PendingBuild {
  build: Build;
  targetTier: number;
  tower: Tower | null;
}

function label(kind: TowerKind, tier: number): string {
  return `${towerStats(kind).name} T${tier}`;
}

function waveSize(waveIndex: number): number {
  return waves[waveIndex].groups.reduce((total, group) => total + group.count, 0);
}

/**
 * Spends down the build order for as far as the balance reaches this tick.
 * Returns the labels of what was bought, so the wave that paid for a tower is the
 * wave it shows up under.
 */
function advanceBuildOrder(state: GameState, pending: PendingBuild[], waveNumber: number): string[] {
  const bought: string[] = [];

  for (const entry of pending) {
    if (entry.tower !== null && entry.tower.tier >= entry.targetTier) continue;
    if ((entry.build.fromWave ?? 1) > waveNumber) continue;

    let tower = entry.tower;
    if (tower === null) {
      // A later entry on a tile an earlier one already built reads as "and take
      // that one to tier 3" - the ladder is bought over the run, not at once, and
      // that is how a player actually spends. Adopting it costs nothing; without
      // this the entry would sit blocked on a tile it can never place on.
      const existing = towerAt(state, { x: entry.build.x, y: entry.build.y });
      tower = existing?.kind === entry.build.kind ? existing : null;

      if (tower === null) {
        tower = placeTower(state, entry.build.kind, { x: entry.build.x, y: entry.build.y });
        // Short on Cycles, or a tile the rules refuse. Either way this entry blocks
        // the ones behind it: a build order is an order.
        if (tower === null) break;
        bought.push(label(tower.kind, 1));
      }
      entry.tower = tower;
    }

    while (tower.tier < entry.targetTier && upgradeTower(state, tower)) {
      bought.push(label(tower.kind, tower.tier));
    }

    if (tower.tier < entry.targetTier) break;
  }

  return bought;
}

/** Cost of taking a build from nothing to its target tier, ignoring whether it is affordable. */
export function buildCost(build: Build): number {
  let total = towerStats(build.kind).cost;
  for (let tier = 2; tier <= (build.tier ?? 1); tier++) total += towerStats(build.kind, tier).cost;
  return total;
}

/**
 * Who plays the run, and the reason this instrument has an interface where it used to
 * have a build order.
 *
 * The wave accounting below - what a wave earned, spent, peaked at and leaked - is the
 * measurement, and it is the same measurement whoever is pressing the buttons. What
 * differs is only the answer to "what does the player do this tick": a declared layout
 * spends down a build order, and a recorded run replays what somebody actually did.
 * Writing the loop twice would be two instruments that have to agree about a reading,
 * which is the thing this project keeps deleting.
 */
export interface RunDriver {
  /** Names the run in the report, where a loadout name used to be the only possibility. */
  name: string;
  note: string;
  /**
   * The player's turn, taken before the tick is stepped. Returns the labels of whatever
   * it bought - so the wave that paid for a tower is the wave it shows up under - and
   * the Cycles an early call brought in, which is earnings rather than a refund.
   */
  act(state: GameState, wave: number): { bought: string[]; calledEarly: number };
  /**
   * Builds the run never afforded. A replay has none by construction: a log records what
   * happened, so there is no queue of things it was still waiting to do.
   */
  unbought?(): Build[];
}

/** Spends down a declared build order, taking every early call if the loadout says so. */
function loadoutDriver(loadout: Loadout): RunDriver {
  const pending: PendingBuild[] = loadout.builds.map((build) => ({
    build,
    targetTier: Math.min(build.tier ?? 1, MAX_TIER),
    tower: null,
  }));

  return {
    name: loadout.name,
    note: loadout.note,
    act(state, wave) {
      const bought = advanceBuildOrder(state, pending, wave);
      // After the buying, so the bonus is in hand for the wave it belongs to rather than
      // the one that just ended.
      const calledEarly = loadout.callWavesEarly ? callWaveEarly(state) : 0;
      return { bought, calledEarly };
    },
    unbought: () =>
      pending
        .filter((entry) => entry.tower === null || entry.tower.tier < entry.targetTier)
        .map((entry) => entry.build),
  };
}

export function runBalance(loadout: Loadout, options: BalanceOptions = {}): RunReport {
  return runSimulation(loadoutDriver(loadout), options);
}

export function runSimulation(driver: RunDriver, options: BalanceOptions = {}): RunReport {
  const { level = level1, maxTicks = 60 * 60 * 20, hpScale = 1 } = options;

  const state = createGameState(level, { hpScale });

  const reports: WaveReport[] = [];
  let wave = openWave(1);

  function openWave(number: number): WaveReport {
    return {
      wave: number,
      calledEarly: 0,
      spawned: number <= waves.length ? waveSize(number - 1) : 0,
      peakEnemies: 0,
      leaks: 0,
      coreHealth: state.coreHealth,
      earned: 0,
      spent: 0,
      cyclesEnd: state.cycles,
      durationMs: 0,
      bought: [],
    };
  }

  // `state.tick` rather than a counter kept here: the run counts its own ticks now, and
  // it is the same number the game's loop lands on and the same one every log entry is
  // stamped with. Two counters that must agree is one of them being wrong eventually.
  while (state.status === 'playing' && state.tick < maxTicks) {
    const cyclesBeforeActing = state.cycles;
    const { bought, calledEarly } = driver.act(state, wave.wave);
    wave.bought.push(...bought);
    wave.calledEarly += calledEarly;
    wave.earned += calledEarly;
    // What the player's turn cost, with the early call's bonus taken back out of the
    // delta: money that arrived is not money that was not spent.
    wave.spent += calledEarly + cyclesBeforeActing - state.cycles;

    const cyclesBeforeTick = state.cycles;
    const healthBeforeTick = state.coreHealth;
    stepGame(state, TICK_MS);

    // stepGame only ever adds Cycles (kill bounties), and only ever removes core
    // health (leaks), so both deltas are unambiguous without the sim reporting.
    wave.earned += state.cycles - cyclesBeforeTick;
    wave.leaks += healthBeforeTick - state.coreHealth;
    wave.peakEnemies = Math.max(wave.peakEnemies, state.enemies.length);
    wave.durationMs += TICK_MS;

    // The spawner is the clock: the wave index moving on is the wave ending. The
    // between-wave countdown is charged to the wave that just finished, which is
    // where the player actually spends it.
    const nextWave = state.spawner.waveIndex + 1;
    if (nextWave > wave.wave && nextWave <= waves.length) {
      wave.coreHealth = state.coreHealth;
      wave.cyclesEnd = state.cycles;
      reports.push(wave);
      wave = openWave(nextWave);
    }
  }

  wave.coreHealth = state.coreHealth;
  wave.cyclesEnd = state.cycles;
  reports.push(wave);

  return {
    board: boardOf(level).name,
    loadout: driver.name,
    note: driver.note,
    status: state.tick >= maxTicks ? 'timeout' : state.status,
    coreHealth: state.coreHealth,
    totalLeaks: MAX_CORE_HEALTH - state.coreHealth,
    cyclesEnd: state.cycles,
    totalEarned: reports.reduce((total, report) => total + report.earned, 0),
    totalCalledEarly: reports.reduce((total, report) => total + report.calledEarly, 0),
    totalSpent: reports.reduce((total, report) => total + report.spent, 0),
    durationMs: state.tick * TICK_MS,
    waves: reports,
    unbought: driver.unbought?.() ?? [],
  };
}

/**
 * The search range for the margin bisect, as a multiplier over the shipped curve. The
 * floor is not zero because the curve stops getting easier below it - `createEnemy`
 * floors every enemy at 1 HP, so somewhere under a quarter scale most of the roster is
 * already a one-shot and the reading would be measuring the floor rather than the board.
 */
export const MARGIN_MIN = 0.25;
export const MARGIN_MAX = 8;

/** Nine halvings of a five-octave range: the answer is good to under a percent. */
const MARGIN_STEPS = 9;

export interface MarginReport {
  board: string;
  loadout: string;
  note: string;
  /** The verdict at 1x, so a margin has something to be a margin *from*. */
  status: RunReport['status'];
  coreHealth: number;
  /**
   * Multiplier at which this layout takes its first leak, and the one at which it loses
   * the core. `null` means it survives the whole search range - a board the curve cannot
   * threaten inside 8x. A value equal to `MARGIN_MIN` means the opposite: it already
   * breaks at the floor, and the true number is somewhere below where measuring stops.
   */
  firstLeak: number | null;
  loss: number | null;
  /**
   * **Which wave broke, at each of those multipliers**, and the half of the reading the
   * first draft of this instrument did not print. A run-wide multiplier scales the whole
   * curve, so the threshold it finds is the *weakest link* in the run - and without a
   * wave number beside it there is no way to tell a board that dies to the finale from
   * one that dies in the opening, which are opposite problems reported as one number.
   * The first reading off this instrument was exactly that case, and it would have been
   * misread as a statement about the late curve.
   */
  firstLeakWave: number | null;
  lossWave: number | null;
}

/**
 * Smallest multiplier in the range at which `breaks` is true, by bisection **in log
 * space** - the answer is a multiplier, so a percent matters equally at 0.5x and at 4x,
 * and a linear bisect would spend most of its steps resolving the top octave nobody
 * reads.
 *
 * The bisect assumes `breaks` is monotone in the multiplier, which is a real assumption
 * and not a certainty: this is a deterministic simulation with targeting in it, so a
 * tougher enemy occasionally changes *which* enemy a tower shoots and a board can, in
 * principle, do better against a harder curve. It is the right assumption anyway - the
 * alternative is a linear sweep at a hundred times the cost to catch a case that would
 * be a finding in itself - and the way it would show up is a margin that moves the wrong
 * way when the curve is softened, which is worth watching for rather than guarding.
 */
function bisect(breaks: (multiplier: number) => boolean, lo: number, hi: number): number | null {
  if (!breaks(hi)) return null;
  if (breaks(lo)) return lo;

  let low = Math.log2(lo);
  let high = Math.log2(hi);
  for (let step = 0; step < MARGIN_STEPS; step++) {
    const mid = (low + high) / 2;
    if (breaks(2 ** mid)) high = mid;
    else low = mid;
  }
  return 2 ** high;
}

/**
 * How much harder the curve would have to be before this layout bleeds, and before it
 * dies. The reading the harness could not give: `runBalance` reports won or lost, and a
 * curve that every good board survives and every bad board loses to reports exactly the
 * same table whether the good boards are surviving by a hair or by a mile. That is the
 * complaint the players made and the instrument could not express.
 *
 * Two numbers rather than one because they say different things. The first leak is where
 * a run stops being clean, which is where a player *feels* the curve; the loss is where
 * it stops being winnable. The gap between them is how much room a run has to be played
 * badly, and a curve where they are the same number is a curve with no forgiveness in it.
 *
 * Every number here is **conservative by however much Overclock is worth**, and that is
 * not a small caveat in exactly the moments it matters: `triggerOverclock` is called from
 * `main.ts` and from nowhere else, so no row the harness prints has ever used the ability
 * a player leans on when a wave is going wrong. Cut from this step deliberately; the
 * consequence is that a real board's margin is wider than the one printed here, by an
 * unknown amount that is largest where the curve is hardest.
 */
export function runMargin(loadout: Loadout, options: BalanceOptions = {}): MarginReport {
  const baseline = runBalance(loadout, options);
  const at = (hpScale: number) => runBalance(loadout, { ...options, hpScale });

  const firstLeak = bisect((m) => at(m).totalLeaks > 0, MARGIN_MIN, MARGIN_MAX);
  // Losing is leaking five times, so the loss threshold cannot be below the leak one.
  // Starting the second search there is free and keeps the two answers consistent.
  const loss = bisect((m) => at(m).status === 'lost', firstLeak ?? MARGIN_MIN, MARGIN_MAX);

  return {
    board: baseline.board,
    loadout: loadout.name,
    note: loadout.note,
    status: baseline.status,
    coreHealth: baseline.coreHealth,
    firstLeak,
    loss,
    firstLeakWave: firstLeak === null ? null : bledOn(at(firstLeak)),
    lossWave: loss === null ? null : diedOn(at(loss)),
  };
}

/** First wave that leaked - at the first-leak threshold, the wave that drew blood. */
function bledOn(report: RunReport): number | null {
  return report.waves.find((wave) => wave.leaks > 0)?.wave ?? null;
}

/**
 * The wave the run ended on, which at the loss threshold is the wave that took the last
 * core HP. Deliberately not the first wave that leaked: a board that starts bleeding at
 * 10 and dies at 15 is being killed by the finale, and reporting 10 for both columns
 * would hide the run's whole second half behind its first mistake.
 */
function diedOn(report: RunReport): number | null {
  return report.waves[report.waves.length - 1]?.wave ?? null;
}

/**
 * The layouts the curve is tuned against. Not a test suite with pass/fail - the
 * point is the spread between them. `bare` says what the waves do to an empty
 * board, `starter` what the opening 100 Cycles survives, `spread` whether four
 * cheap towers beat two good ones, and `focused` whether the tier ladder v1.2
 * built is reachable inside a run at all.
 *
 * **A layout is tiles, and tiles belong to a board**, which is why v1.8 could not add a
 * map without adding a second set of these. The same seven names are declared on both
 * boards so the pair can be read as a controlled comparison - `veteran` against
 * `veteran` is a statement about the two boards, because everything else about the two
 * runs is the same curve, the same roster and the same spending order.
 *
 * Tiles here are on level 1's serpentine: the trace runs y=2 (x 0-4), down x=4, y=4
 * (x 4-9), down x=9, then y=6 (x 9-15).
 */
/**
 * Shared so `rush` differs from `veteran` in exactly one thing - the early call -
 * and the two reports can be read as a controlled comparison rather than as two
 * different runs that also happen to disagree about where the towers go.
 */
const VETERAN_BUILDS: Build[] = [
  { kind: 'firewallNode', x: 2, y: 3 },
  { kind: 'firewallNode', x: 5, y: 3 },
  { kind: 'honeypot', x: 6, y: 4 },
  { kind: 'firewallNode', x: 2, y: 3, tier: 3, fromWave: 3 },
  { kind: 'idsScanner', x: 3, y: 3, tier: 2, fromWave: 5 },
  { kind: 'firewallNode', x: 5, y: 3, tier: 3, fromWave: 7 },
  { kind: 'aesTurret', x: 12, y: 5, fromWave: 9 },
  // Act two, added when the curve grew to fifteen. A build order that stops at wave 9
  // measures nothing past wave 9 - it reports act two against a board that quit, and
  // reads as a curve that got hard when what got hard was the yardstick. The three
  // entries are what act two asks for by name: a second Scanner where the back half of
  // the trace is, because the ROOTKIT is only shootable inside one; the Turret's second
  // tier, because armor is what makes small hits worthless; and one more gun.
  { kind: 'idsScanner', x: 8, y: 5, fromWave: 10 },
  { kind: 'aesTurret', x: 12, y: 5, tier: 2, fromWave: 12 },
  { kind: 'firewallNode', x: 10, y: 5, fromWave: 14 },
];

const LEVEL1_LOADOUTS: Loadout[] = [
  {
    name: 'bare',
    note: 'nothing built - what the curve does to an empty board',
    builds: [],
  },
  {
    name: 'starter',
    note: 'the opening 100 Cycles, and nothing after it - how far a frozen board gets',
    builds: [
      { kind: 'firewallNode', x: 2, y: 3 },
      { kind: 'firewallNode', x: 5, y: 3 },
      { kind: 'honeypot', x: 6, y: 4 },
    ],
  },
  {
    name: 'spread',
    note: 'breadth: the same opening, then a new tier-1 tower every couple of waves',
    builds: [
      { kind: 'firewallNode', x: 2, y: 3 },
      { kind: 'firewallNode', x: 5, y: 3 },
      { kind: 'honeypot', x: 6, y: 4 },
      { kind: 'idsScanner', x: 8, y: 5, fromWave: 3 },
      { kind: 'aesTurret', x: 12, y: 5, fromWave: 5 },
      { kind: 'firewallNode', x: 10, y: 5, fromWave: 7 },
      { kind: 'honeypot', x: 12, y: 6, fromWave: 9 },
    ],
  },
  {
    name: 'focused',
    note: 'depth: the same opening, then every Cycle into upgrading the three towers it has',
    builds: [
      { kind: 'firewallNode', x: 2, y: 3 },
      { kind: 'firewallNode', x: 5, y: 3 },
      { kind: 'honeypot', x: 6, y: 4 },
      { kind: 'firewallNode', x: 2, y: 3, tier: 3, fromWave: 3 },
      { kind: 'firewallNode', x: 5, y: 3, tier: 3, fromWave: 5 },
      { kind: 'honeypot', x: 6, y: 4, tier: 3, fromWave: 7 },
    ],
  },
  {
    name: 'turret',
    note: 'the gamble: stay tier 1 at the front and bank for a tier-3 AES Turret late',
    builds: [
      { kind: 'firewallNode', x: 2, y: 3 },
      { kind: 'firewallNode', x: 5, y: 3 },
      { kind: 'honeypot', x: 6, y: 4 },
      { kind: 'idsScanner', x: 3, y: 3, tier: 2, fromWave: 3 },
      { kind: 'aesTurret', x: 12, y: 5, tier: 3, fromWave: 5 },
    ],
  },
  {
    name: 'veteran',
    note: 'mixed: upgrade what is already shooting, then widen with a slow and a turret',
    builds: VETERAN_BUILDS,
  },
  {
    name: 'rush',
    note: 'the veteran line, taking every early call - more Cycles, less time to spend them',
    builds: VETERAN_BUILDS,
    callWavesEarly: true,
  },
];

/**
 * Level 2's layouts, the same seven names on the S's tiles.
 *
 * **The difference is that the good tiles are inside the bends.** On level 1 a tower sits
 * beside a leg and covers a stretch of it; here the best tiles sit in an elbow and cover
 * two stretches at right angles - the near elbow between the entry leg and the spine, the
 * far one between the spine and the run-out. The board's best tile reaches 9 tiles of
 * trace against level 1's 7, and that gap is the whole board.
 *
 * Tiles are on the S: row 4 from x 0 to 3, down the column x=3, row 7 from x 3 to 7, then
 * six rows up the spine at x=7, row 1 from x 7 to 11, down the column x=11, and row 4 from
 * x 11 to the core. The two elbows are four columns wide each and mirror one another - the
 * near one around x 4-6 on rows 5-6, the far one around x 8-10 on rows 2-3.
 */
const VETERAN_BUILDS_2: Build[] = [
  // On the way in, covering the approach and the column that turns off it. Not in the
  // elbow on purpose: the elbow is the best real estate on the board but it is not where
  // the run starts, and the opening kills are what pay for everything behind them.
  { kind: 'firewallNode', x: 2, y: 5 },
  // And the second inside the near elbow, where the bottom bar and the spine both pass.
  // This is the board's thesis as a build order, and the harness says what it is worth -
  // the same ladder two tiles off these tiles loses the core.
  { kind: 'firewallNode', x: 5, y: 6 },
  // On the bottom bar, inside both of them.
  { kind: 'honeypot', x: 5, y: 7 },
  { kind: 'firewallNode', x: 2, y: 5, tier: 3, fromWave: 3 },
  { kind: 'idsScanner', x: 4, y: 6, tier: 2, fromWave: 5 },
  { kind: 'firewallNode', x: 5, y: 6, tier: 3, fromWave: 7 },
  // Act two moves to the far elbow, which is the mirror of the near one and the half of
  // the run the opening cannot reach - and the ROOTKIT has to be shootable up there.
  { kind: 'aesTurret', x: 9, y: 2, fromWave: 9 },
  { kind: 'idsScanner', x: 9, y: 3, fromWave: 10 },
  { kind: 'aesTurret', x: 9, y: 2, tier: 2, fromWave: 12 },
  { kind: 'firewallNode', x: 10, y: 2, fromWave: 14 },
];


/** The three the opening 100 Cycles buys, shared by every level 2 layout that has one. */
const LEVEL2_OPENING: Build[] = [
  { kind: 'firewallNode', x: 2, y: 5 },
  { kind: 'firewallNode', x: 5, y: 6 },
  { kind: 'honeypot', x: 5, y: 7 },
];

const LEVEL2_LOADOUTS: Loadout[] = [
  {
    name: 'bare',
    note: 'nothing built - what the curve does to an empty board',
    builds: [],
  },
  {
    name: 'starter',
    note: 'the opening 100 Cycles, and nothing after it - how far a frozen board gets',
    builds: LEVEL2_OPENING,
  },
  {
    name: 'spread',
    note: 'breadth: the same opening, then a new tier-1 tower every couple of waves',
    builds: [
      ...LEVEL2_OPENING,
      { kind: 'idsScanner', x: 9, y: 2, fromWave: 3 },
      { kind: 'aesTurret', x: 10, y: 3, fromWave: 5 },
      { kind: 'firewallNode', x: 10, y: 2, fromWave: 7 },
      { kind: 'honeypot', x: 9, y: 1, fromWave: 9 },
    ],
  },
  {
    name: 'focused',
    note: 'depth: the same opening, then every Cycle into upgrading the three towers it has',
    builds: [
      ...LEVEL2_OPENING,
      { kind: 'firewallNode', x: 2, y: 5, tier: 3, fromWave: 3 },
      { kind: 'firewallNode', x: 5, y: 6, tier: 3, fromWave: 5 },
      { kind: 'honeypot', x: 5, y: 7, tier: 3, fromWave: 7 },
    ],
  },
  {
    name: 'turret',
    note: 'the gamble: stay tier 1 at the front and bank for a tier-3 AES Turret late',
    builds: [
      ...LEVEL2_OPENING,
      { kind: 'idsScanner', x: 4, y: 6, tier: 2, fromWave: 3 },
      { kind: 'aesTurret', x: 9, y: 2, tier: 3, fromWave: 5 },
    ],
  },
  {
    name: 'veteran',
    note: 'mixed: upgrade what is already shooting, then widen with a slow and a turret',
    builds: VETERAN_BUILDS_2,
  },
  {
    name: 'rush',
    note: 'the veteran line, taking every early call - more Cycles, less time to spend them',
    builds: VETERAN_BUILDS_2,
    callWavesEarly: true,
  },
];

/**
 * A board the harness measures, and the layouts declared on its tiles.
 *
 * The grouping is what v1.8 needed and what makes the reading possible: a loadout name
 * alone stopped identifying a run the moment there were two boards, and a report that
 * does not say which board it is about would read as the curve moving when what moved
 * was the map. `id` matches `RunDescriptor.id` so the harness and the game agree on what
 * a board is called - gated in `tests/balance.test.ts`, because the two lists are in two
 * files and nothing but a test makes them stay in step.
 */
export interface Board {
  id: string;
  name: string;
  level: LevelData;
  loadouts: Loadout[];
}

export const boards: Board[] = [
  { id: 'mainframe-01', name: 'MAINFRAME 01', level: level1, loadouts: LEVEL1_LOADOUTS },
  { id: 'recursion-02', name: 'RECURSION 02', level: level2, loadouts: LEVEL2_LOADOUTS },
];

/** Which board a level belongs to, for a report that holds the level and needs the name. */
function boardOf(level: LevelData): Board {
  return boards.find((board) => board.level === level) ?? boards[0];
}

/** The layout names, which every board declares in full. */
export const loadoutNames: string[] = LEVEL1_LOADOUTS.map((loadout) => loadout.name);

export function findBoard(id: string): Board | null {
  return boards.find((board) => board.id === id) ?? null;
}

export function findLoadout(board: Board, name: string): Loadout | null {
  return board.loadouts.find((loadout) => loadout.name === name) ?? null;
}

/** Cheapest thing the harness can be asked: does the declared order ever fit? */
export function loadoutCost(loadout: Loadout): number {
  return loadout.builds.reduce((total, build) => total + buildCost(build), 0);
}
