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
 * They live behind a gear, as a column growing down out of it - the mirror of the
 * build menu, which is a column growing up out of a toggle in the opposite corner.
 * That is not only symmetry. The row used to be laid out sideways, and a third button
 * pushed it 52px further into the middle of a 390px band until it covered the wave
 * indicator: the status glyphs are centered and the tools are anchored right, so
 * every control added to the row walks toward the readings. Collapsed, the band's
 * footprint is one 44px button on every device no matter which controls exist, and
 * the collision cannot come back the next time something is added.
 *
 * Sound is last in the column, so the one control that renders everywhere sits in the
 * same place on every device. The two conditional ones fall away above it, and it is
 * the one that carries a glyph rather than a word: it has a symbol everyone knows and
 * the other two do not.
 */

interface ToolButton {
  root: HTMLButtonElement;
  setState(on: boolean): void;
}

/**
 * `label` is either a word or a pixel-string glyph. Both are captions; the glyph path
 * exists because two of these controls have a symbol everyone already knows and the
 * others do not, and a word where a symbol would do is a word to read.
 *
 * `kind` picks which of the two bracket vocabularies the button speaks. A `toggle`
 * says `[x]` / `[ ]` and is a thing that is on or off; a `drawer` says `[-]` / `[+]`
 * and is a thing that is open or shut. That distinction is not decoration - the build
 * menu and the console's collapse already use the second pair, so a drawer borrowing
 * the first would be claiming to be a setting.
 */
function makeButton(
  label: string | readonly string[],
  name: string,
  kind: 'toggle' | 'drawer',
  host: HTMLElement,
  onClick: () => void,
): ToolButton {
  const root = document.createElement('button');
  root.type = 'button';
  root.className = kind === 'drawer' ? 'phone-button tools-toggle' : 'phone-button';
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
      state.textContent = kind === 'drawer' ? (on ? '[-]' : '[+]') : on ? '[x]' : '[ ]';
      // Expanded for a drawer, pressed for a setting: the two mean different things
      // to a screen reader, and this button is one or the other, never both.
      root.setAttribute(kind === 'drawer' ? 'aria-expanded' : 'aria-pressed', String(on));
      // The spoken name is the word, not the abbreviation: "LOCK off" is what the
      // button says, "Orientation lock off" is what it means.
      const said = kind === 'drawer' ? (on ? 'open' : 'closed') : on ? 'on' : 'off';
      root.setAttribute('aria-label', `${name} ${said}`);
    },
  };
}

/**
 * A gear, and the one glyph here that is generated rather than drawn.
 *
 * Eight by eight was the first attempt, to match the note's exact 2x, and eight by
 * eight cannot hold a gear: hand-drawn candidates came out reading as a dumbbell, a
 * flower and a spool, and the player's verdict was that none of them looked like one.
 * A gear needs a ring, a hub and teeth, and three concentric features do not fit in
 * four pixels of radius.
 *
 * So this is sixteen by sixteen at **1x** - still an integer scale, still sixteen
 * device pixels tall, and four times the detail. The two glyphs in this row therefore
 * have different internal resolutions and the same footprint, which is the right way
 * round: the note is a silhouette and wants chunk, the gear is a ring and wants
 * pixels.
 *
 * The shape is polar arithmetic rather than a drawing, because tuning a gear by hand
 * means moving thirty pixels to change one radius. A point is filled when it sits
 * between the hub radius and an outer radius that alternates between the body and the
 * tooth tip every eighth of a turn. The three radii below were chosen by generating a
 * spread and looking at them at sixteen pixels: deeper valleys make a more obvious
 * gear right up until the ring breaks into arcs and starts reading as damage.
 */
const GEAR_ROWS = [
  '......#..#......',
  '....###..###....',
  '....########....',
  '....########....',
  '.##############.',
  '.#####....#####.',
  '#####......#####',
  '..###......###..',
  '..###......###..',
  '#####......#####',
  '.#####....#####.',
  '.##############.',
  '....########....',
  '....########....',
  '....###..###....',
  '......#..#......',
];

/** Adds whichever of the three this platform supports. Adds nothing if none. */
/**
 * `onAbout` is the ABOUT reading's toggle. It lives in this column and not in the
 * console's own header for the same reason the other three do: it is about the session
 * rather than about the run, and the console's header could not hold another 44px
 * target. It is also the only control here that is not a setting, which is why it speaks
 * the drawer vocabulary - it opens a thing rather than turning one on.
 */
export function createTopTools(host: HTMLElement, audio: AudioSystem | null, onAbout: (open: boolean) => void): void {
  const canFullscreen = typeof document.documentElement.requestFullscreen === 'function';
  // The lock's API check is not enough on its own: desktop Chrome defines lock()
  // and rejects every call, so a button gated on the method alone would render on
  // every desktop and never work once. A coarse pointer is the honest second half
  // of the question - this control is for a phone turning in a hand.
  const canLock =
    typeof screen.orientation?.lock === 'function' && window.matchMedia('(pointer: coarse)').matches;
  // No early return any more: ABOUT renders on every device, so the column is never
  // empty. It was guarding against a gear that opened onto nothing, and that case is gone.

  const root = document.createElement('div');
  root.className = 'top-tools';
  host.appendChild(root);

  /**
   * Shut by default, unlike the build menu, which opens with the game. These are set
   * once a session or not at all, and the menu's reason for standing open - that
   * building three towers should not cost three reopenings - has no equivalent here.
   *
   * It costs the sound button its second job. Shut, `SND` is no longer the visible
   * `[ ]` that doubled as this game's only start affordance, and a player whose audio
   * Safari interrupted has one more tap to find the repair. Both survive because any
   * tap anywhere resumes the context: the affordance is weaker, not gone.
   */
  let open = false;

  const drawer = document.createElement('div');
  drawer.className = 'tools-drawer';

  const toggle = makeButton(GEAR_ROWS, 'Settings', 'drawer', root, () => {
    open = !open;
    apply();
  });
  root.appendChild(drawer);

  function apply(): void {
    drawer.hidden = !open;
    toggle.setState(open);
  }

  let fullscreen: ToolButton | null = null;
  let lock: ToolButton | null = null;
  let locked = false;

  if (canFullscreen) {
    fullscreen = makeButton('FS', 'Fullscreen', 'toggle', drawer, () => {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void document.documentElement.requestFullscreen().catch(() => {});
      }
    });
    fullscreen.setState(false);
  }

  if (canLock) {
    lock = makeButton('LOCK', 'Orientation lock', 'toggle', drawer, () => {
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

  let aboutOpen = false;
  const about = makeButton('ABOUT', 'About this build', 'drawer', drawer, () => {
    aboutOpen = !aboutOpen;
    about.setState(aboutOpen);
    onAbout(aboutOpen);
  });
  about.setState(false);

  if (audio) addSound(drawer, audio);

  apply();

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
  const button = makeButton(NOTE_ROWS, 'Sound', 'toggle', row, () => {
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
