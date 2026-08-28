# Idea Bank

Post-v1 ideas. Part of [Tower Defense PWA](../Tower%20Defense%20PWA.md). Brainstormed 2026-07-12 and otherwise unprioritized; items that graduated to a milestone are marked in place. A category graduates to its own note here when it outgrows this one.

Cross-cutting observations: the **tap-tower info panel** (Mobile / UX) is the foundation that upgrades, sell, and touch-friendly Overclock all sit on; the **physical-device test pass** guards everything else. Both were the reasoning behind picking v1.2, and both are done. The next cross-cutting one is the **real wave design pass** (Content): the tier ladder v1.2 built needs a run long enough to reach it, which is why pacing, the harness and the curve all landed in v1.3 together.

## Gameplay depth

- Tower upgrades - **promoted to v1.2** (2026-08-23): specced in [Tower Panel](../Design/Tower%20Panel.md), build order in [Roadmap](../Roadmap.md).
- Sell/refund towers - **promoted to v1.2** (2026-08-23), same note.
- Wave preview + early-call bonus - **promoted to v1.3** (2026-08-23): specced in [Run Structure](../Design/Run%20Structure.md), build order in [Roadmap](../Roadmap.md). Both shipped 2026-08-24, and the call left one thing behind, below.
- Give the early call a mechanical cost (2026-08-24) - as shipped it is free money for anyone with a plan: Cycles come only from kills and the countdown only starts once the board is clear, so the skipped seconds were not producing anything, and the harness measures identical defense with +77 Cycles. Its intended cost is reaction time, which a scripted player has infinitely much of. Two candidates, both rejected as out of scope mid-milestone: start the countdown when a wave finishes *spawning* rather than when the board clears (retunes the whole curve), or allow the call during `waiting-clear` so an early wave overlaps the stragglers still walking - an opt-in risk, and the more interesting of the two.
- New enemy behaviors - stealth (would re-justify IDS Scanner's dropped "reveals stealth" ability), healer/repair-bot, shielded enemy, EMP unit that briefly disables the nearest tower (mirrors Overclock's overheat).
- Endless mode - after the scripted waves, procedurally scale further waves; gives high scores something to measure. Held out of v1.3 on purpose: it measures a run against a standard, and v1.3 is building the standard.

## Content

- Map 2+ - the waypoint-only level format ([Map Layout](../Design/Map%20Layout.md)) was designed for this; add a map-select screen. Layout candidates: fork/merge path, spiral.
- Real wave design pass - **promoted to v1.3** (2026-08-23), same note. 4 waves is a demo; a ~10-wave curve with deliberate difficulty pacing makes balancing a real (and instructive) discipline.

## Feel / juice

- Web Audio - SFX (fire, impact, glitch-kill, wave klaxon) + low ambient synth loop. Big learning module. **Split across three milestones** (2026-08-27): the desk and one composed track are v1.5 (see [Audio](../Design/Audio.md)); the four adaptive layers wait on stems that do not exist yet; the SFX are their own milestone after, because polyphony - voice cap, retrigger floor, pitch jitter - is a real subsystem and the note that argued for synthesis over samples still holds.
- Path pulse animation - data packets flowing along the trace; sells the PCB theme for little cost.
- Hit feedback - enemy flash on hit, health bars (or damage-state color shift), floating +Cycles on kill, subtle screen shake on core breach.
- Entity sprite/art pass - **promoted to v1.1** (2026-07-12): specced in [Sprite Spec](../Design/Sprite%20Spec.md), build order in [Roadmap](../Roadmap.md).

## Mobile / UX

- Physical-device test pass - **done in v1.2's verify step** (2026-08-23), together with the QA owed from v1.1. It stopped being the highest-risk unknown here and became a habit: every milestone verifies on a phone.
- Tap-tower info panel - **shipped in v1.2** (2026-08-23): see [Tower Panel](../Design/Tower%20Panel.md). Now the surface everything else reads through - v1.3's wave preview is its fourth mode.
- Pause + 2x speed toggle - **promoted to v1.3** (2026-08-23): near-mandatory TD quality-of-life, and the tool the ten-wave curve gets tuned with.
- Portrait layout - **promoted to v1.4** (2026-08-25): specced in [Portrait Layout](../Design/Portrait%20Layout.md), build order in [Roadmap](../Roadmap.md). Was the debt the 2026-08-23 log accepted when the build menu was moved to the left edge and portrait was left with no side band to tuck into.
- Rotate the board 90 degrees in portrait - **promoted into v1.4** (2026-08-25), same note. Filed and promoted the same day: it started as the more interesting half of the problem and became the whole answer once the arithmetic was on the table. A 9x16 blit fits at scale 4 and gives back the *full landscape board area* (384x683, 42px tiles) on a phone held upright, where the unrotated board gets a quarter of it.
- Portrait-shaped map (2026-08-25) - the 9x16 level the waypoint format would already take, which is the version of the above where nothing reads sideways. Held out of v1.4 for the reason v1.3 gave for refusing map 2: a second map inheriting a curve should inherit a finished one.
- First-run tutorial hints - portfolio visitors give it ~30 seconds; a "place a tower here" nudge decides whether they see the game at all.
- **Tell the player a new build has arrived** (2026-08-28) - found while answering "how does the installed app update on my phone". Today it takes **two launches**: `sw.js` carries `skipWaiting()` and `clientsClaim()`, so a new service worker installs and takes control immediately, but the generated `registerSW.js` is the bare registration with no reload, and the page that is already open keeps running the JS it loaded. So launch one fetches the update and launch two shows it. (The `max-age=600` GitHub Pages puts on everything does not add to that: `updateViaCache` defaults to `imports`, so the top-level worker script skips the HTTP cache on every update check. The workaround meanwhile is to hard-refresh the same URL in a browser tab, which updates the worker for the installed app too, since it is one registration per origin and scope.)
  **Auto-reloading is the wrong fix**, which is why this is a note and not a one-liner: a run is six to eight minutes, and reloading during wave 9 destroys it. The two candidates are reloading only when nothing is at stake (no run started, or the end screen is up) and a quiet "new build" marker the player taps when they choose. The second is more this project's idiom - the console already narrates state, and the decision belongs to whoever is holding the phone.

## Engineering / learning modules (the project's actual driver)

- A* pathfinding + maze mode - towers block the path, enemies re-route; best isolated learning module here.
- Balance sim harness - **promoted to v1.3** (2026-08-23), same note. Cheaper than it looked: the sim is already deterministic (the only `Math.random()` is in cosmetic particles), so the cost is extracting it out of `main.ts`'s closure, which is its own win.
- Render perf pass - pre-render the static board to an offscreen canvas, object-pool projectiles/particles; addresses the low-end-mobile risk flagged in [Architecture](../Design/Architecture.md). Board prerender partially lands with the v1.1 sprite pass renderer step.
- Sprite editor mini-tool - tiny browser editor that round-trips the pixel-string sprite format ([Sprite Spec](../Design/Sprite%20Spec.md)); only worth it if text-editing sprites chafes after v1.1 - the dev gallery view covers most of the need.

## Meta / persistence

- Local high scores (best wave / score) via localStorage.
- Settings (sound toggle) once audio exists - **shipped in v1.5** (2026-08-27), and it turned out to be a property of the graph rather than a screen: one gain on a bus, one button in the top band, one `localStorage` key. It is also the project's first `localStorage`, so it is the seam local high scores plug into.
