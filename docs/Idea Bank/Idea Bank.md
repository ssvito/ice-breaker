# Idea Bank

Post-v1 ideas. Part of [Tower Defense PWA](../Tower%20Defense%20PWA.md). Brainstormed 2026-07-12 and otherwise unprioritized; items that graduated to a milestone are marked in place. A category graduates to its own note here when it outgrows this one.

Cross-cutting observations: the **tap-tower info panel** (Mobile / UX) is the foundation that upgrades, sell, and touch-friendly Overclock all sit on; the **physical-device test pass** guards everything else. Both were the reasoning behind picking v1.2, and both are done. The next cross-cutting one is the **real wave design pass** (Content): the tier ladder v1.2 built needs a run long enough to reach it, which is why pacing, the harness and the curve all landed in v1.3 together.

## Gameplay depth

- Tower upgrades - **promoted to v1.2** (2026-08-23): specced in [Tower Panel](../Design/Tower%20Panel.md), build order in [Roadmap](../Roadmap.md).
- Sell/refund towers - **promoted to v1.2** (2026-08-23), same note.
- Wave preview + early-call bonus - **promoted to v1.3** (2026-08-23): specced in [Run Structure](../Design/Run%20Structure.md), build order in [Roadmap](../Roadmap.md).
- New enemy behaviors - stealth (would re-justify IDS Scanner's dropped "reveals stealth" ability), healer/repair-bot, shielded enemy, EMP unit that briefly disables the nearest tower (mirrors Overclock's overheat).
- Endless mode - after the scripted waves, procedurally scale further waves; gives high scores something to measure. Held out of v1.3 on purpose: it measures a run against a standard, and v1.3 is building the standard.

## Content

- Map 2+ - the waypoint-only level format ([Map Layout](../Design/Map%20Layout.md)) was designed for this; add a map-select screen. Layout candidates: fork/merge path, spiral.
- Real wave design pass - **promoted to v1.3** (2026-08-23), same note. 4 waves is a demo; a ~10-wave curve with deliberate difficulty pacing makes balancing a real (and instructive) discipline.

## Feel / juice

- Web Audio - SFX (fire, impact, glitch-kill, wave klaxon) + low ambient synth loop. Big learning module; the game is currently silent.
- Path pulse animation - data packets flowing along the trace; sells the PCB theme for little cost.
- Hit feedback - enemy flash on hit, health bars (or damage-state color shift), floating +Cycles on kill, subtle screen shake on core breach.
- Entity sprite/art pass - **promoted to v1.1** (2026-07-12): specced in [Sprite Spec](../Design/Sprite%20Spec.md), build order in [Roadmap](../Roadmap.md).

## Mobile / UX

- Physical-device test pass - **done in v1.2's verify step** (2026-08-23), together with the QA owed from v1.1. It stopped being the highest-risk unknown here and became a habit: every milestone verifies on a phone.
- Tap-tower info panel - **shipped in v1.2** (2026-08-23): see [Tower Panel](../Design/Tower%20Panel.md). Now the surface everything else reads through - v1.3's wave preview is its fourth mode.
- Pause + 2x speed toggle - **promoted to v1.3** (2026-08-23): near-mandatory TD quality-of-life, and the tool the ten-wave curve gets tuned with.
- First-run tutorial hints - portfolio visitors give it ~30 seconds; a "place a tower here" nudge decides whether they see the game at all.

## Engineering / learning modules (the project's actual driver)

- A* pathfinding + maze mode - towers block the path, enemies re-route; best isolated learning module here.
- Balance sim harness - **promoted to v1.3** (2026-08-23), same note. Cheaper than it looked: the sim is already deterministic (the only `Math.random()` is in cosmetic particles), so the cost is extracting it out of `main.ts`'s closure, which is its own win.
- Render perf pass - pre-render the static board to an offscreen canvas, object-pool projectiles/particles; addresses the low-end-mobile risk flagged in [Architecture](../Design/Architecture.md). Board prerender partially lands with the v1.1 sprite pass renderer step.
- Sprite editor mini-tool - tiny browser editor that round-trips the pixel-string sprite format ([Sprite Spec](../Design/Sprite%20Spec.md)); only worth it if text-editing sprites chafes after v1.1 - the dev gallery view covers most of the need.

## Meta / persistence

- Local high scores (best wave / score) via localStorage.
- Settings (sound toggle) once audio exists.
