import { registerSW } from 'virtual:pwa-register';

/**
 * Service worker registration, and the question "is there a newer build waiting".
 *
 * The game owns this rather than letting the plugin inject a one-liner, because the
 * injected one only ever registered: nothing re-checked while the app was open, and
 * nothing told the player. An installed PWA on a phone is **resumed far more often than
 * it is launched**, so "you get it on the next cold start" can mean weeks.
 *
 * What is deliberately *not* here is any decision about when to apply it. A reload in the
 * middle of a run destroys the run, and with overlapping waves there is barely a gap
 * between waves left to slip one into - so this reports readiness and waits to be asked.
 * See [Before the Run](../docs/Idea%20Bank/Before%20the%20Run.md): the seam this really
 * wants is a screen before the run, which does not exist yet.
 */
export interface UpdateWatcher {
  /** Whether a newer build has finished downloading and is waiting to take over. */
  isReady(): boolean;
  /** Let the waiting worker through and reload onto it. Costs the current run. */
  apply(): void;
}

/**
 * How often to ask the server whether there is a new build, with the app open and in
 * front of the player. Long, because it is the backstop rather than the mechanism: the
 * check that actually matters is the one on the way back from the background, and a
 * game left running on a desk does not need to be polled at browsing speed.
 */
const POLL_MS = 30 * 60 * 1000;

export function watchForUpdates(onReady: () => void): UpdateWatcher {
  let ready = false;

  const updateSW = registerSW({
    onNeedRefresh() {
      ready = true;
      onReady();
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;

      const check = (): void => {
        void registration.update().catch(() => {
          // Offline, or the server is having a day. Either is the normal state of a
          // phone and neither is worth a console line: the next check is a resume away.
        });
      };

      // The one that earns its place. `load` fires once and an installed app may not see
      // another for weeks, while coming back to the foreground is what a player actually
      // does between one session and the next.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.setInterval(check, POLL_MS);
    },
  });

  return {
    isReady: () => ready,
    apply: () => {
      // `true` reloads the page once the waiting worker has taken control. Without the
      // reload the new worker would serve the new build to a page still running the old
      // one, which is the exact state `registerType: 'prompt'` exists to prevent.
      void updateSW(true);
    },
  };
}
