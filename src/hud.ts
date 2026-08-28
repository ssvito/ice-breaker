import { pixelSvg } from './glyph.ts';

/**
 * The run's three numbers, as three glyphs: a heart for the core, a coin for
 * Cycles, a level for the wave. It used to be three lines of `CORE 5/5` /
 * `CYCLES 100` / `WAVE 1/10` painted into the top-left of the display canvas -
 * readable, and three times more words than the readings need. Denominators went
 * with the labels: the core's maximum and the curve's length are facts about the
 * game, not about this second of it.
 *
 * DOM rather than canvas for the same reason the toolbar and the console are:
 * these are real elements, so the wave indicator can be tapped to open the wave
 * in the console, and the whole bar gets native hit-testing and safe areas for
 * free. Nothing here is animated per frame - `update` writes only when a number
 * actually changed.
 *
 * Colors are the palette already in use, each one carrying the meaning it already
 * has: the heart is the core's own magenta, the coin is the amber the console
 * spends on values, the level is terminal green.
 */

export interface HudHandlers {
  /** The wave indicator is a button: tapping it opens the wave in the console. */
  onWave(): void;
}

export interface Hud {
  update(coreHealth: number, cycles: number, waveNumber: number): void;
  /** Parks the bar just above the board when the letterbox has room for it. */
  place(boardTop: number): void;
  setVisible(visible: boolean): void;
}

/**
 * A 7x6 pixel heart, drawn as whole pixels so it belongs to the same art as the
 * board rather than looking like an icon font wandered in.
 */
const HEART_ROWS = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];

export function createHud(handlers: HudHandlers, host: HTMLElement): Hud {
  const root = document.createElement('div');
  root.className = 'hud';

  const core = document.createElement('span');
  core.className = 'hud-item hud-core';
  core.innerHTML = `${pixelSvg(HEART_ROWS, 'hud-heart')}<span class="hud-value"></span>`;
  const coreValue = core.lastElementChild as HTMLElement;

  const cycles = document.createElement('span');
  cycles.className = 'hud-item hud-cycles';
  cycles.innerHTML = '<span class="hud-coin">C</span><span class="hud-value"></span>';
  const cyclesValue = cycles.lastElementChild as HTMLElement;

  // The only control in the bar, and the reason the bar is DOM at all.
  const wave = document.createElement('button');
  wave.type = 'button';
  wave.className = 'hud-item hud-wave';
  wave.innerHTML = '<span class="hud-lv">Lv</span><span class="hud-value"></span>';
  wave.addEventListener('click', () => handlers.onWave());
  const waveValue = wave.lastElementChild as HTMLElement;

  root.append(core, cycles, wave);
  host.appendChild(root);

  // Three numbers change at most a few times a second between them; a signature
  // keeps the render loop from rewriting text nodes sixty times a second for it.
  let signature = '';

  return {
    update(coreHealth: number, cyclesAmount: number, waveNumber: number): void {
      const stamp = `${coreHealth}|${cyclesAmount}|${waveNumber}`;
      if (stamp === signature) return;
      signature = stamp;

      coreValue.textContent = String(coreHealth);
      // The one state worth a colour change: a core this low is the reading the
      // player needs to notice without looking for it.
      core.classList.toggle('hud-critical', coreHealth <= 2);
      cyclesValue.textContent = String(cyclesAmount);
      waveValue.textContent = String(waveNumber);
      wave.setAttribute('aria-label', `Wave ${waveNumber}, show what is coming`);
    },

    place(boardTop: number): void {
      // Published as a candidate only; the floor lives in CSS with the safe-area
      // inset, and max() picks whichever sits lower. Same idiom as the toolbar
      // parking against the board's left edge.
      document.documentElement.style.setProperty('--hud-top', `${Math.round(boardTop)}px`);
    },

    setVisible(visible: boolean): void {
      root.hidden = !visible;
    },
  };
}
