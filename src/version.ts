/**
 * What build this is. Injected by Vite's `define` at compile time (see `vite.config.ts`),
 * so it costs nothing at runtime - these are string literals by the time the bundle is
 * written, not lookups.
 *
 * It exists to be read back. Everything this game does wrong, it does wrong on a phone
 * that is not here, and the difference between a report that can be chased and one that
 * cannot is whether it names a commit. The shell prints both along its bottom edge,
 * where crossing the screen is enough to have seen them.
 */
declare const __APP_VERSION__: string;
declare const __APP_BUILT__: string;

/** Short git SHA of the commit this was built from, or `dev` outside a repo. */
export const APP_VERSION: string = __APP_VERSION__;
/** Build date, `YYYY-MM-DD`. The SHA says which code; this says how old it is at a glance. */
export const APP_BUILT: string = __APP_BUILT__;
