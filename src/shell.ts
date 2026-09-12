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
 * app is in the shell until a run starts, and (from the next step) it comes back here
 * when one ends. That is what gives records somewhere to be read and the waiting
 * service worker a seam to apply at.
 */
export interface Shell {
  setVisible(visible: boolean): void;
  /**
   * The stored records, and which of them the run that just ended took. The marks are
   * the shell's only acknowledgement that a run happened at all, and they are cleared
   * when the shell is hidden - a record is permanent, having just set it is not.
   */
  setRecords(records: Records, beaten: RecordKey[]): void;
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

export function createShell(
  host: HTMLElement,
  runs: RunDescriptor[],
  onStart: (run: RunDescriptor) => void,
): Shell {
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
   */
  const records = document.createElement('div');
  records.className = 'shell-records';
  box.appendChild(records);

  /**
   * **A list of one renders as a button, not as a menu.** The data is a list either
   * way, and the whole picker design of this milestone is that single line: a chooser
   * with one choice is worse than a start button, so the one case where the entry's
   * own name is worth printing is the case where there is something to choose between.
   *
   * The second entry, when it arrives, is a line in `runs.ts` - this loop already
   * builds it.
   */
  const oneRun = runs.length === 1;
  const buttons = runs.map((run) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shell-start';
    button.textContent = oneRun ? 'START' : run.name;
    button.addEventListener('click', () => onStart(run));
    box.appendChild(button);
    return button;
  });

  host.appendChild(root);

  let shown: Records = { furthestWave: 0, fastestClearMs: null, fewestLeaks: null };

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
  }

  return {
    setRecords(next: Records, beaten: RecordKey[]): void {
      shown = next;
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
