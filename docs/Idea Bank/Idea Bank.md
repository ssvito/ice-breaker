# Idea Bank

Post-v1 ideas. Part of [Tower Defense PWA](../Tower%20Defense%20PWA.md). Brainstormed 2026-07-12 and otherwise unprioritized; items that graduated to a milestone are marked in place. A category graduates to its own note here when it outgrows this one.

Cross-cutting observations: the **tap-tower info panel** (Mobile / UX) is the foundation that upgrades, sell, and touch-friendly Overclock all sit on; the **physical-device test pass** guards everything else. Both were the reasoning behind picking v1.2.

## Gameplay depth

- Tower upgrades - **promoted to v1.2** (2026-08-23): specced in [Tower Panel](../Design/Tower%20Panel.md), build order in [Roadmap](../Roadmap.md).
- Sell/refund towers - **promoted to v1.2** (2026-08-23), same note.
- Wave preview + early-call bonus - show the next wave's composition; starting it early grants bonus Cycles. Risk/reward economy decision.
- New enemy behaviors - stealth (would re-justify IDS Scanner's dropped "reveals stealth" ability), healer/repair-bot, shielded enemy, EMP unit that briefly disables the nearest tower (mirrors Overclock's overheat).
- Endless mode - after the scripted waves, procedurally scale further waves; gives high scores something to measure.

## Content

- Map 2+ - the waypoint-only level format ([Map Layout](../Design/Map%20Layout.md)) was designed for this; add a map-select screen. Layout candidates: fork/merge path, spiral.
- Real wave design pass - 4 waves is a demo; a ~10-wave curve with deliberate difficulty pacing makes balancing a real (and instructive) discipline.

## Feel / juice

- Web Audio - SFX (fire, impact, glitch-kill, wave klaxon) + low ambient synth loop. Big learning module; the game is currently silent.
- Path pulse animation - data packets flowing along the trace; sells the PCB theme for little cost.
- Hit feedback - enemy flash on hit, health bars (or damage-state color shift), floating +Cycles on kill, subtle screen shake on core breach.
- Entity sprite/art pass - **promoted to v1.1** (2026-07-12): specced in [Sprite Spec](../Design/Sprite%20Spec.md), build order in [Roadmap](../Roadmap.md).

## Mobile / UX

- Physical-device test pass - **folded into v1.2's verify step** (2026-08-23) together with the QA still owed from v1.1; install/offline/safe-areas/toolbar have never been verified on a real phone, still the highest-risk unknown here.
- Tap-tower info panel - **promoted to v1.2** (2026-08-23): the milestone is built around it, see [Tower Panel](../Design/Tower%20Panel.md).
- Pause + 2x speed toggle - near-mandatory TD quality-of-life.
- First-run tutorial hints - portfolio visitors give it ~30 seconds; a "place a tower here" nudge decides whether they see the game at all.

## Engineering / learning modules (the project's actual driver)

- A* pathfinding + maze mode - towers block the path, enemies re-route; best isolated learning module here.
- Balance sim harness - headless run of waves-vs-tower-layouts to tune numbers; teaches deterministic sim/test discipline.
- Render perf pass - pre-render the static board to an offscreen canvas, object-pool projectiles/particles; addresses the low-end-mobile risk flagged in [Architecture](../Design/Architecture.md). Board prerender partially lands with the v1.1 sprite pass renderer step.
- Sprite editor mini-tool - tiny browser editor that round-trips the pixel-string sprite format ([Sprite Spec](../Design/Sprite%20Spec.md)); only worth it if text-editing sprites chafes after v1.1 - the dev gallery view covers most of the need.

## Meta / persistence

- Local high scores (best wave / score) via localStorage.
- Settings (sound toggle) once audio exists.
