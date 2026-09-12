import { APP_BUILT, APP_VERSION } from './version.ts';
import { CURVE_LENGTH } from './records.ts';
import type { RecordKey, Records } from './records.ts';
import type { RunDescriptor } from './runs.ts';

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
   * The marks are the shell's only acknowledgement that a run happened at all, and they
   * are cleared when the shell is hidden - a record is permanent, having just set it is
   * not.
   *
   * `runId` is not decoration. With two boards there is no such thing as "your record",
   * so a readout that does not say which board it is about is a readout that is wrong
   * half the time - and it is wrong in the direction that looks right, because both
   * boards run the same fifteen waves.
   */
  setRecords(runId: string, records: Records, beaten: RecordKey[]): void;
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
   * Where the run that just ended is read out - and the reason the shell had to be a
   * state rather than a splash. A run that ended into the board had nowhere to say any
   * of this.
   *
   * Rows in the console's own `.stat`, dot leaders and all, because a readout in this
   * game looks like the console printing. Empty until there is something true to print:
   * a first-time visitor gets a title and a button.
   *
   * **One board's set, headed by that board's name.** Printing both would turn the way
   * into the game into a standings table, and it does not scale past the two boards that
   * happen to exist today. Which one is printed is the last one played, which after a run
   * is the run that just ended and on a cold open is the same answer one step later.
   */
  const records = document.createElement('div');
  records.className = 'shell-records';
  box.appendChild(records);

  /**
   * **A list of one renders as a button, not as a menu.** The data is a list either way,
   * and v1.7's whole picker design was that single line: a chooser with one choice is
   * worse than a start button, so the one case where the entry's own name is worth
   * printing is the case where there is something to choose between. v1.8 added the
   * second entry as a line in `runs.ts` and this loop had already built it.
   *
   * It is kept rather than deleted now that it reads false. It is the rule, not a
   * fallback: a board removed from `runs.ts` puts the list back to one, and START is
   * still the right thing to print on that day.
   *
   * **Nothing is pre-selected**, and that is the question the picker step had to answer
   * rather than assume. The list reads the same way every time it opens, in declaration
   * order, and the board you last played is remembered only for which records to print.
   * Reordering or pre-focusing by history would save one tap and cost the thing a list
   * is for - that the same board is in the same place every time your thumb goes there.
   */
  const oneRun = runs.length === 1;
  /**
   * The column the entries stand in, and it exists because there are two of them. A list
   * of one was a button and took the box's own 22px gap; a list of two needs its rows
   * closer to each other than either is to the title, or they read as two separate
   * offers rather than as a choice between two boards.
   *
   * Full width of the same column the records use, so the names line up under the
   * readout instead of each row being as wide as its own text.
   */
  const list = document.createElement('div');
  list.className = 'shell-runs';
  box.appendChild(list);

  const buttons = runs.map((run) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shell-start';
    button.textContent = oneRun ? 'START' : run.name;
    button.addEventListener('click', () => handlers.onStart(run));
    list.appendChild(button);
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

  let shown: Records = { furthestWave: 0, fastestClearMs: null, fewestLeaks: null };
  /**
   * Which board the readout is about. Starts on the first entry so the shell can render
   * before anything has told it otherwise; `main.ts` hands it the last board played
   * before the shell is ever shown.
   */
  let shownRun: RunDescriptor = runs[0];

  function row(label: string, value: string, isNew: boolean): void {
    const stat = document.createElement('div');
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
    records.appendChild(stat);
  }

  function renderRecords(beaten: RecordKey[]): void {
    records.replaceChildren();
    const cleared = shown.fastestClearMs !== null;

    // Before the curve has ever fallen, how far you got is the only claim a run can
    // make. After it has, that row would read 15/15 forever, so the two clear records
    // take its place rather than sitting under it.
    if (!cleared && shown.furthestWave > 0) {
      row('FURTHEST', `${shown.furthestWave}/${CURVE_LENGTH}`, beaten.includes('furthest'));
    }
    if (shown.fastestClearMs !== null) {
      row('FASTEST', formatClock(shown.fastestClearMs), beaten.includes('fastest'));
    }
    if (shown.fewestLeaks !== null) {
      row('CLEANEST', leakText(shown.fewestLeaks), beaten.includes('cleanest'));
    }

    // The heading goes on last and only if something is under it, which is what keeps
    // `.shell-records:empty` honest: a first-time visitor still gets a title and a
    // button, not a board name with nothing to say about it. Only worth printing when
    // there is more than one board it could have been.
    if (!oneRun && records.childElementCount > 0) {
      const heading = document.createElement('div');
      heading.className = 'shell-records-board';
      heading.textContent = shownRun.name;
      records.prepend(heading);
    }
  }

  return {
    setUpdateReady(ready: boolean): void {
      reload.hidden = !ready;
    },

    setRecords(runId: string, next: Records, beaten: RecordKey[]): void {
      shown = next;
      // An id that names no entry is a board that was removed from `runs.ts` with a
      // record still on the phone. Falling back to the first entry would print another
      // board's name over this one's numbers, which is the one thing this argument is
      // about, so the heading is dropped instead and the rows stand alone.
      shownRun = runs.find((run) => run.id === runId) ?? shownRun;
      renderRecords(beaten);
    },

    setVisible(visible: boolean): void {
      // Idempotent on purpose: the layout pass calls this on every resize, and a
      // re-show that refocused the button would steal focus from wherever it was.
      if (root.hidden === !visible) return;
      root.hidden = !visible;
      // Going away takes the NEW marks with it. They belong to the moment a run ended,
      // not to the record, and the next time this screen opens that moment is over.
      if (!visible) renderRecords([]);
      // The keyboard gets the same single move the thumb gets. It also means the one
      // thing on screen is visibly the thing to press, which is the difference between
      // a start screen and a screen that has stopped.
      if (visible) buttons[0]?.focus();
    },
  };
}
