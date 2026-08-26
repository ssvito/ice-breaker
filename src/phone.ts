/**
 * Two buttons that are about the phone rather than about the game: go fullscreen,
 * and stop the screen turning under a hand resting on its side.
 *
 * They live in the top band beside the status glyphs, anchored right while the
 * glyphs stay centered. That is where the bottom strip's one-row budget put them -
 * the console's header was the obvious home and could not hold two more 44px
 * targets - and it is also where they belong on their own merits: they are set once
 * a session, and the top of a tall phone is the hardest place to reach by accident.
 *
 * Both are feature-detected and simply absent where the API is, so desktop and iOS
 * keep the chrome they have today rather than growing a button that does nothing.
 * The lock depends on the fullscreen button next to it: on Android
 * screen.orientation.lock() rejects unless the document is fullscreen or the app is
 * installed, which is why the two ship together and in this order.
 */

interface PhoneButton {
  root: HTMLButtonElement;
  setState(on: boolean): void;
}

function makeButton(label: string, host: HTMLElement, onClick: () => void): PhoneButton {
  const root = document.createElement('button');
  root.type = 'button';
  root.className = 'phone-button';
  root.addEventListener('click', onClick);
  host.appendChild(root);

  const state = document.createElement('span');
  const name = document.createElement('span');
  name.textContent = label;
  root.append(name, state);

  return {
    root,
    setState(on: boolean): void {
      // Same bracketed vocabulary the console's collapse and the build drawer use.
      state.textContent = on ? '[x]' : '[ ]';
      root.setAttribute('aria-pressed', String(on));
      root.setAttribute('aria-label', `${label} ${on ? 'on' : 'off'}`);
    },
  };
}

/** Adds whichever of the two the platform supports. Adds nothing if neither. */
export function createPhoneControls(host: HTMLElement): void {
  const canFullscreen = typeof document.documentElement.requestFullscreen === 'function';
  // The lock's API check is not enough on its own: desktop Chrome defines lock()
  // and rejects every call, so a button gated on the method alone would render on
  // every desktop and never work once. A coarse pointer is the honest second half
  // of the question - this control is for a phone turning in a hand.
  const canLock =
    typeof screen.orientation?.lock === 'function' && window.matchMedia('(pointer: coarse)').matches;
  if (!canFullscreen && !canLock) return;

  const root = document.createElement('div');
  root.className = 'top-tools';
  host.appendChild(root);

  let fullscreen: PhoneButton | null = null;
  let lock: PhoneButton | null = null;
  let locked = false;

  if (canFullscreen) {
    fullscreen = makeButton('FS', root, () => {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void document.documentElement.requestFullscreen().catch(() => {});
      }
    });
    fullscreen.setState(false);
  }

  if (canLock) {
    lock = makeButton('LOCK', root, () => {
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
