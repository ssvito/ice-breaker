import type { AudioSystem } from './audio.ts';
import { pixelSvg } from './glyph.ts';

/**
 * The three controls that belong to the session rather than to the run: go fullscreen,
 * stop the screen turning under a hand resting on its side, and whether there is any
 * sound. None of them is a move in the game - you set them once and then forget them,
 * which is why they live in the hardest corner of a tall phone to hit by accident.
 *
 * They sit in the top band beside the status glyphs, anchored right while the glyphs
 * stay centered. That is where the bottom strip's one-row budget put them - the
 * console's header was the obvious home and could not hold three more 44px targets -
 * and it is also where they belong on their own merits.
 *
 * This was `phone.ts`, "two buttons that are about the phone rather than about the
 * game", and the sound toggle is what made the name wrong. It also made the old shape
 * unsafe: fullscreen and the lock are both feature-detected, and on an iPhone neither
 * exists, so a row built only when one of them renders would not exist on the single
 * platform where a sound button is load-bearing. iOS is where the silent switch lives
 * and where a phone call drops the audio context into a state that needs a fresh
 * gesture to leave.
 *
 * Sound is last in the row, so the one control that renders everywhere sits in the
 * same place on every device. The two conditional ones fall away to its left, and it
 * is the one that carries a glyph rather than a word: it has a symbol everyone knows
 * and the other two do not.
 */

interface ToolButton {
  root: HTMLButtonElement;
  setState(on: boolean): void;
}

/**
 * `label` is either a word or a pixel-string glyph. Both are captions; the glyph path
 * exists because one of these three controls has a symbol everyone already knows and
 * the other two do not, and a word where a symbol would do is a word to read.
 */
function makeButton(
  label: string | readonly string[],
  name: string,
  host: HTMLElement,
  onClick: () => void,
): ToolButton {
  const root = document.createElement('button');
  root.type = 'button';
  root.className = 'phone-button';
  root.addEventListener('click', onClick);
  host.appendChild(root);

  const state = document.createElement('span');
  const caption = document.createElement('span');
  if (typeof label === 'string') caption.textContent = label;
  else caption.innerHTML = pixelSvg(label, 'tool-glyph');
  root.append(caption, state);

  return {
    root,
    setState(on: boolean): void {
      // Same bracketed vocabulary the console's collapse and the build drawer use.
      state.textContent = on ? '[x]' : '[ ]';
      root.setAttribute('aria-pressed', String(on));
      // The spoken name is the word, not the abbreviation: "LOCK off" is what the
      // button says, "Orientation lock off" is what it means.
      root.setAttribute('aria-label', `${name} ${on ? 'on' : 'off'}`);
    },
  };
}

/** Adds whichever of the three this platform supports. Adds nothing if none. */
export function createTopTools(host: HTMLElement, audio: AudioSystem | null): void {
  const canFullscreen = typeof document.documentElement.requestFullscreen === 'function';
  // The lock's API check is not enough on its own: desktop Chrome defines lock()
  // and rejects every call, so a button gated on the method alone would render on
  // every desktop and never work once. A coarse pointer is the honest second half
  // of the question - this control is for a phone turning in a hand.
  const canLock =
    typeof screen.orientation?.lock === 'function' && window.matchMedia('(pointer: coarse)').matches;
  if (!canFullscreen && !canLock && !audio) return;

  const root = document.createElement('div');
  root.className = 'top-tools';
  host.appendChild(root);

  let fullscreen: ToolButton | null = null;
  let lock: ToolButton | null = null;
  let locked = false;

  if (canFullscreen) {
    fullscreen = makeButton('FS', 'Fullscreen', root, () => {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void document.documentElement.requestFullscreen().catch(() => {});
      }
    });
    fullscreen.setState(false);
  }

  if (canLock) {
    lock = makeButton('LOCK', 'Orientation lock', root, () => {
      if (locked) {
        screen.orientation.unlock();
        locked = false;
        lock?.setState(false);
        return;
      }
      // Pins whichever way the phone is being held right now - this is a screen
      // lock, not a layout lock. There is no discrete portrait mode to switch to:
      // every box positions itself by arithmetic off boardRect() either way.
      screen.orientation.lock(screen.orientation.type).then(
        () => {
          locked = true;
          lock?.setState(true);
        },
        () => {
          // Android rejects outside fullscreen, iOS rejects always. Say so by
          // dimming for a moment rather than by disabling: pressing FS first is
          // exactly what makes the next press work, and a disabled button hides
          // that the door is there at all.
          locked = false;
          lock?.setState(false);
          lock?.root.classList.add('denied');
          window.setTimeout(() => lock?.root.classList.remove('denied'), 1200);
        },
      );
    });
    lock.setState(false);
  }

  if (audio) addSound(root, audio);

  document.addEventListener('fullscreenchange', () => {
    const on = document.fullscreenElement !== null;
    fullscreen?.setState(on);
    // Leaving fullscreen drops an Android orientation lock with it, so the button
    // would otherwise sit there claiming a lock that the platform already released.
    if (!on && locked) {
      locked = false;
      lock?.setState(false);
    }
  });
}

/**
 * A beamed pair of eighth notes, drawn as whole pixels for the reason the HUD's heart
 * is: a glyph built this way belongs to the same art as the board, where one from an
 * icon font looks like it wandered in from another program. Beam one pixel, stems
 * five, heads three by two - the pair rather than a single note because the flag on a
 * lone quaver reads as noise this small, while two heads under a beam are
 * unmistakably music.
 *
 * Both of those numbers were picked by looking. A two-pixel beam was the first draft
 * and it reads top-heavy at the size this actually renders, like a staple rather than
 * a note; and eight rows is not a style choice but the space available, since a
 * taller glyph pushes the button past 44px and the row is a flex box, so it would
 * take `FS` and `LOCK` up with it.
 *
 * It is a music note on a control that mutes everything, which will be slightly wrong
 * the day the SFX land. Accepted: music is all there is to mute today, and a note is
 * how a mute button says "audio" in every game that has one.
 */
const NOTE_ROWS = ['..#####', '..#...#', '..#...#', '..#...#', '..#...#', '..#...#', '###.###', '###.###'];

/**
 * The sound toggle, which is really a "make sound happen" button with an off switch
 * attached - and the difference matters on exactly one platform.
 *
 * `[x]` means sound is coming out, which is a stricter claim than "not muted": an
 * audio context that has never seen a gesture, or that Safari interrupted for a phone
 * call, is silent while nothing is muted at all. Showing `[x]` there would be a lie,
 * and it would hide the one control that can fix it. So the reading is
 * `running && !muted`, and a press always does the obvious thing to the state it is
 * showing: unmute *and* resume when dark, mute when lit.
 *
 * A consequence worth naming rather than tolerating: on a fresh load this reads `[ ]`,
 * because it is telling the truth about a context that has not been unlocked yet. That
 * makes it the nearest thing the game has to a start affordance, which is convenient
 * for a milestone that deliberately refused to add a start screen. It rights itself
 * without being touched, since any first tap anywhere resumes the context.
 */
function addSound(row: HTMLElement, audio: AudioSystem): void {
  const button = makeButton(NOTE_ROWS, 'Sound', row, () => {
    if (audio.isRunning() && !audio.isMuted()) {
      audio.setMuted(true);
      return;
    }
    audio.setMuted(false);
    // Unconditional, because setMuted returns early when the state already matches -
    // and a context that is unmuted but suspended is precisely the case this press
    // exists to repair.
    audio.resume();
  });

  const sync = (): void => button.setState(audio.isRunning() && !audio.isMuted());
  audio.onChange(sync);
  sync();
}
