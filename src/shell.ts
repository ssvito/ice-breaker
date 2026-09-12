import { APP_BUILT, APP_VERSION } from './version.ts';
import { CURVE_LENGTH } from './records.ts';
import type { RecordKey, Records } from './records.ts';
import type { RunDescriptor } from './runs.ts';
import { rasterizePath } from './map.ts';
import type { LevelData } from './map.ts';
import { pixelSvg } from './glyph.ts';

/**
 * The before: the screen the app is on when no run exists. Five filed items were never
 * blocked on wanting a title screen - they were blocked on there being a moment that is
 * not a run - and this is that moment made visible.
 *
 * DOM like every other piece of chrome in this project, and for the same reason the
 * console and the toolbar are: a title screen is a poor excuse to open a second
 * rendering path, and real elements come with focus, tap targets and safe areas
 * already solved.
 *
 * **A state, not a splash.** Nothing here is timed and nothing dismisses itself; the
 * app is in the shell until a run starts, and it comes back here when one ends. That is what gives records somewhere to be read and the waiting
 * service worker a seam to apply at.
 */
export interface ShellHandlers {
  onStart(run: RunDescriptor): void;
  /** Let the waiting worker through and reload onto it. Free here: there is no run. */
  onReload(): void;
}

export interface Shell {
  setVisible(visible: boolean): void;
  /** Whether a newer build has finished downloading and is waiting to take over. */
  setUpdateReady(ready: boolean): void;
  /**
   * The stored records **for one board**, and which of them the run that just ended took.
   * They are printed inside that board's own card, so nothing has to say which board a
   * best time belongs to - the card it is in does. The marks are the shell's only
   * acknowledgement that a run happened at all, and they are cleared when the shell is
   * hidden: a record is permanent, having just set it is not.
   *
   * Called once per board at boot and again for the board a finished run was played on.
   * The shell reads no storage of its own, which is what keeps `main.ts` the only module
   * that knows where records live.
   */
  setRecords(runId: string, records: Records, beaten: RecordKey[]): void;
}

/**
 * The board, at one SVG unit per tile.
 *
 * Drawn with `pixelSvg`, the same builder the HUD's heart and the sound button's note
 * use, because a board *is* a grid of whole pixels - a map thumbnail made of anything
 * else would be the one picture in this project that is not pixel art. The trace is
 * rasterised to a `#` grid and handed over; run-length encoding turns each leg into one
 * `<rect>`, so a whole map costs about seven elements.
 *
 * Two layers rather than one, and the second is what makes the picture readable at
 * 64px: the trace alone says what shape the map is, and the endpoints say which way it
 * runs. Without them the two boards are a squiggle and a different squiggle.
 */
function thumbnail(map: LevelData): string {
  const tiles = rasterizePath(map.waypoints);
  const on = new Set(tiles.map((tile) => `${tile.x},${tile.y}`));
  const ends = new Set([tiles[0], tiles[tiles.length - 1]].map((tile) => `${tile.x},${tile.y}`));

  const grid = (keys: Set<string>) =>
    Array.from({ length: map.rows }, (_, y) =>
      Array.from({ length: map.cols }, (_, x) => (keys.has(`${x},${y}`) ? '#' : '.')).join(''),
    );

  return pixelSvg(grid(on), 'shell-thumb-trace') + pixelSvg(grid(ends), 'shell-thumb-ends');
}

/** Simulated milliseconds as a clock. Runs are minutes long, so no hours case. */
function formatClock(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function leakText(leaks: number): string {
  if (leaks === 0) return 'NO LEAKS';
  return `${leaks} LEAK${leaks === 1 ? '' : 'S'}`;
}

export function createShell(handlers: ShellHandlers, runs: RunDescriptor[], host: HTMLElement): Shell {
  /**
   * A full-bleed layer that catches nothing. Nothing in this project sets a `z-index`,
   * so a layer appended late paints over everything - including the gear column, which
   * is about the session rather than the run and stays reachable with no run on screen.
   * `pointer-events` is what keeps that true: the layer passes taps through and only
   * the box in the middle of it takes them.
   */
  const root = document.createElement('div');
  root.className = 'shell';
  root.hidden = true;

  const box = document.createElement('div');
  box.className = 'shell-box';
  root.appendChild(box);

  // The console's own title, in the console's own vocabulary - prompt, name, cursor.
  // The shell is the same machine talking, so it says so the same way rather than
  // introducing a second typographic voice for one screen.
  const title = document.createElement('h1');
  title.className = 'shell-title';
  title.textContent = 'ICE BREAKER';
  box.appendChild(title);

  /**
   * **A list of one renders as a button, not as a menu.** The data is a list either way,
   * and v1.7's whole picker design was that single line: a chooser with one choice is
   * worse than a start button, so the one case where the entry's own name is worth
   * printing is the case where there is something to choose between. v1.8 added the
   * second entry as a line in `runs.ts` and this loop had already built it.
   *
   * It is kept rather than deleted now that it reads false. It is the rule, not a
   * fallback: a board removed from `runs.ts` puts the list back to one, and START is
   * still the right thing to print on that day - with no thumbnail and no records beside
   * it, because with one board there is nothing to tell apart.
   *
   * **Nothing is pre-selected**, and that is the question the picker step had to answer
   * rather than assume. The list reads the same way every time it opens, in declaration
   * order. Reordering or pre-focusing by history would save one tap and cost the thing a
   * list is for - that the same board is in the same place every time your thumb goes
   * there.
   */
  const oneRun = runs.length === 1;

  /**
   * The column the entries stand in. A list of one was a button and took the box's own
   * 22px gap; a list of two needs its rows closer to each other than either is to the
   * title, or they read as two separate offers rather than as a choice between boards.
   */
  const list = document.createElement('div');
  list.className = 'shell-runs';
  box.appendChild(list);

  /**
   * One card per board: a picture of the map, its name, and what has been done on it.
   *
   * **This is where the records live, and putting them here deleted a whole mechanism.**
   * The first draft printed one shared readout above the list, which forced the shell to
   * decide *whose* records to show and forced storage to remember the last board played.
   * A card answers that by construction - a best time inside MAINFRAME 01's card is
   * MAINFRAME 01's best time - so the shared block, the board heading over it, and the
   * `ice-breaker:last-run` key all went away rather than being tidied.
   *
   * The card is still one button. Everything in it is the same tap target, because
   * everything in it is describing the same thing: the run you are about to start.
   */
  const cards = new Map<string, { button: HTMLButtonElement; stats: HTMLElement }>();

  const buttons = runs.map((run) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shell-run';
    button.addEventListener('click', () => handlers.onStart(run));

    if (!oneRun) {
      const thumb = document.createElement('span');
      thumb.className = 'shell-thumb';
      thumb.innerHTML = thumbnail(run.map);
      button.appendChild(thumb);
    }

    const text = document.createElement('span');
    text.className = 'shell-run-text';
    button.appendChild(text);

    const name = document.createElement('span');
    name.className = 'shell-run-name';
    name.textContent = oneRun ? 'START' : run.name;
    text.appendChild(name);

    // Empty until there is something true to print, and `:empty` keeps it from spending
    // the column's gap: a first-time visitor gets a title, two maps and no numbers.
    const stats = document.createElement('span');
    stats.className = 'shell-run-stats';
    text.appendChild(stats);

    list.appendChild(button);
    cards.set(run.id, { button, stats });
    return button;
  });

  /**
   * The fine print, and the whole of what moved out of the console's ABOUT reading.
   *
   * It is a foot rather than three more rows in the box, because the box is the way
   * into the game and this is not: a credit and a build stamp stacked over the start
   * button would turn the way in into a page to read. Along the bottom edge is where a
   * title screen has always put this, and it is the answer to the question the move
   * asked - a credit reads as a credit there, and becomes chrome anywhere else.
   *
   * All three lines were reachable before only by opening a gear and then a drawer.
   * Here they are simply on the screen the player already has to cross.
   */
  const foot = document.createElement('div');
  foot.className = 'shell-foot';
  root.appendChild(foot);

  /**
   * The reload, and **this is the place it was always waiting for**. `registerType:
   * 'prompt'` was chosen so a new worker could not seize a page mid-run; the cost of
   * that was a reload offered where taking it destroyed the run. Offered here it costs
   * nothing at all, which is what makes it an offer rather than a trap.
   */
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.className = 'shell-reload';
  reload.textContent = 'NEW BUILD · RELOAD';
  reload.hidden = true;
  reload.addEventListener('click', () => handlers.onReload());
  foot.appendChild(reload);

  /**
   * The soundtrack credit, moved from the console's ABOUT with the rest of that
   * reading. Same link, same target, same reason: an installed PWA that navigates away
   * from itself has no back button to come home with - and here, unlike in the console,
   * there is not even a run to lose.
   */
  const credit = document.createElement('a');
  credit.className = 'shell-credit';
  credit.href = 'https://www.ancestorsoundworks.com.br';
  credit.target = '_blank';
  credit.rel = 'noopener noreferrer';
  credit.innerHTML = 'MUSIC BY <span>ANCESTOR SOUNDWORKS</span>';
  foot.appendChild(credit);

  /**
   * Which build this is. It exists for the bug report that starts on a phone that is
   * not here: "it broke" and "it broke on `7e8329f`" are different reports, and only
   * one of them can be chased.
   */
  const build = document.createElement('div');
  build.className = 'shell-build';
  build.textContent = `BUILD ${APP_VERSION} · ${APP_BUILT}`;
  foot.appendChild(build);

  host.appendChild(root);

  /** What each card is currently printing, so hiding the shell can redraw it unmarked. */
  const shown = new Map<string, Records>();

  function row(into: HTMLElement, label: string, value: string, isNew: boolean): void {
    const stat = document.createElement('span');
    stat.className = 'stat';
    const labelEl = document.createElement('span');
    labelEl.className = 'stat-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'stat-value';
    valueEl.textContent = value;
    stat.append(labelEl, valueEl);
    if (isNew) {
      // The console's amber "this one just moved", reused rather than reinvented: it
      // means the same thing beside a record that it means beside an upgrade preview.
      const mark = document.createElement('span');
      mark.className = 'stat-next';
      mark.textContent = 'NEW';
      stat.appendChild(mark);
    }
    into.appendChild(stat);
  }

  function renderCard(runId: string, beaten: RecordKey[]): void {
    const card = cards.get(runId);
    const records = shown.get(runId);
    if (!card || !records) return;

    card.stats.replaceChildren();
    const cleared = records.fastestClearMs !== null;

    // Before the curve has ever fallen on this board, how far you got is the only claim a
    // run there can make. After it has, that row would read 15/15 forever, so the two
    // clear records take its place rather than sitting under it.
    if (!cleared && records.furthestWave > 0) {
      row(card.stats, 'FURTHEST', `${records.furthestWave}/${CURVE_LENGTH}`, beaten.includes('furthest'));
    }
    if (records.fastestClearMs !== null) {
      row(card.stats, 'FASTEST', formatClock(records.fastestClearMs), beaten.includes('fastest'));
    }
    if (records.fewestLeaks !== null) {
      row(card.stats, 'CLEANEST', leakText(records.fewestLeaks), beaten.includes('cleanest'));
    }
  }

  return {
    setUpdateReady(ready: boolean): void {
      reload.hidden = !ready;
    },

    setRecords(runId: string, next: Records, beaten: RecordKey[]): void {
      // An id that names no card is a board dropped from `runs.ts` with a record still on
      // the phone. There is nowhere to print it and nowhere it would be true, so it is
      // ignored rather than shown under some other board's name.
      shown.set(runId, next);
      renderCard(runId, beaten);
    },

    setVisible(visible: boolean): void {
      // Idempotent on purpose: the layout pass calls this on every resize, and a
      // re-show that refocused the button would steal focus from wherever it was.
      if (root.hidden === !visible) return;
      root.hidden = !visible;
      // Going away takes the NEW marks with it. They belong to the moment a run ended,
      // not to the record, and the next time this screen opens that moment is over.
      if (!visible) for (const runId of shown.keys()) renderCard(runId, []);
      // The keyboard gets the same single move the thumb gets. It also means the one
      // thing on screen is visibly the thing to press, which is the difference between
      // a start screen and a screen that has stopped.
      if (visible) buttons[0]?.focus();
    },
  };
}
