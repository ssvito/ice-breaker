import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * What build this is, stamped in at compile time so a player can read it back. A bug
 * reported from a phone is a bug nobody can place without one - "it broke" and "it broke
 * on 0ea9a9a" are different reports, and only the second one can be chased through a
 * repo. The short SHA rather than a semver: `package.json` says 0.0.0 and has never said
 * anything else, while the commit is the thing the log and the roadmap are indexed by.
 *
 * Falls back rather than failing. A build from a tarball with no git history is a real
 * situation and it should produce a game, not a broken build step.
 */
function gitVersion(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base: '/ice-breaker/',
  define: {
    __APP_VERSION__: JSON.stringify(gitVersion()),
    __APP_BUILT__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [
    VitePWA({
      /*
       * `prompt`, not `autoUpdate`, and the reason is correctness before it is manners.
       * Under `autoUpdate` the generated worker calls `skipWaiting` and `clientsClaim`,
       * so a new deploy takes over a page that is *already running the old build* and
       * `cleanupOutdatedCaches` deletes the precache underneath it. Today the app is one
       * bundle and that is survivable; the day anything is imported dynamically it is a
       * 404 in the middle of a run. Under `prompt` the new worker waits, and the page
       * keeps the exact build it started with until somebody says otherwise.
       *
       * The other half of what `autoUpdate` was not doing: the injected registration
       * script only ever registered. Nothing reloaded, and nothing re-checked, so an
       * installed app that is resumed rather than relaunched could sit on a stale build
       * indefinitely. `src/update.ts` owns registration now - hence `injectRegister:
       * null` - and re-checks when the app comes back to the foreground.
       */
      registerType: 'prompt',
      injectRegister: null,
      workbox: {
        /*
         * The soundtrack is the one asset the service worker has to be told about by
         * hand, and it is deliberately not precached. The default `globPatterns` never
         * matched `.webm` or `.m4a` - the build ships 7 precache entries at 54 KiB,
         * none of them audio - and that is the right default to leave alone: putting
         * 824 KB of music in the install step spends it before the first frame, for a
         * player who may never unmute. A runtime route caches the file the first time
         * it is actually fetched, which is after a gesture, and keeps it from then on.
         * Without this the installed game is silent offline, which is the whole step.
         *
         * `CacheFirst` and not `StaleWhileRevalidate`: for a given `?v=` the file is
         * immutable, so a revalidation is a request that can only ever answer "still
         * the same" - and on a phone it is a request that can also answer "offline"
         * while the cache already held the answer.
         */
        runtimeCaching: [
          {
            urlPattern: /\/soundtrack\.(webm|m4a)/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ice-breaker-audio',
              // Explicit, because a CacheFirst route that caches an error body serves
              // that error forever. Same-origin, so there are no opaque responses to
              // account for and 0 has no business in this list.
              cacheableResponse: { statuses: [200] },
              // Two entries: only one format is ever fetched in a working browser and
              // the other is the fallback nobody reaches. A `?v=` bump makes a third
              // and LRU drops the oldest, so a re-encode costs one stale generation
              // rather than growing without bound. No `maxAgeSeconds` on purpose - an
              // installed game should still have its music a year later, offline.
              expiration: { maxEntries: 2, purgeOnQuotaError: true },
            },
          },
        ],
      },
      manifest: {
        name: 'ICE Breaker',
        short_name: 'ICE Breaker',
        description: 'Cyberpunk tower defense — defend the mainframe from intrusion.',
        theme_color: '#0a0e14',
        background_color: '#0a0e14',
        // 'fullscreen', not 'standalone': it drops the Android navigation bar in the
        // installed app for one line and no code, and that bar is ~48px of an 81px
        // band once the board is turned.
        display: 'fullscreen',
        // 'any', not 'landscape': the installed PWA otherwise never rotates, and
        // portrait is a first-class layout as of v1.4.
        orientation: 'any',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
});
