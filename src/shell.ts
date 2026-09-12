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

  return {
    setVisible(visible: boolean): void {
      // Idempotent on purpose: the layout pass calls this on every resize, and a
      // re-show that refocused the button would steal focus from wherever it was.
      if (root.hidden === !visible) return;
      root.hidden = !visible;
      // The keyboard gets the same single move the thumb gets. It also means the one
      // thing on screen is visibly the thing to press, which is the difference between
      // a start screen and a screen that has stopped.
      if (visible) buttons[0]?.focus();
    },
  };
}
