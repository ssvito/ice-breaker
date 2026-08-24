# Roadmap

Part of [Tower Defense PWA](./Tower%20Defense%20PWA.md).

## Direction

- Driver: learning/portfolio, not shipping a commercial product - favor depth of learning over speed of delivery.
- Stack: vanilla TypeScript + raw Canvas API, no game framework (Phaser/Kaboom/Pixi). Deliberate choice to learn the fundamentals (game loop, spatial logic, entity management) rather than abstract them away.
- Multiplatform = PWA install (manifest + service worker) + responsive canvas + unified input (Pointer Events for mouse/touch).

## v1 build order (complete)

Sequenced so each step is independently visible/testable and unblocks the next. Movement/combat come before economy/waves deliberately - those are the riskiest, most foundational systems, worth de-risking before layering balancing on top. PWA packaging is last on purpose: no point wiring installability before there's a game worth installing.

- [x] Repo scaffold - Vite/TS, game loop, canvas scale-to-fit, map data, board render.
- [x] Enemy movement - spawn one enemy, lerp along the path polyline to the core, despawn on arrival.
- [x] Core health - enemy reaching core costs HP; HP hits 0 → game over. Minimal HUD text.
- [x] Tower placement - Pointer Events click/tap-to-place on buildable tiles, range-circle preview, one tower type (Firewall Node) placed but inert.
- [x] Combat - tower targets nearest in-range enemy, spawns a projectile, projectile travels/hits/damages, enemy dies and despawns.
- [x] Economy - Cycles: earned on kill, spent on placement, HUD display, block placement when short.
- [x] Waves - timed spawner with a wave definition list (counts/types/timing), between-wave state.
- [x] Content pass - remaining tower types (IDS Scanner, Honeypot, AES Turret) + enemy types (Trojan, Packet Sniffer, Ransomware split-on-death) + Overclock ability.
- [x] PWA shell - manifest + icons + service worker (`vite-plugin-pwa`), verify installability/offline on mobile.
- [x] Boss + polish - Zero-Day boss, glitch kill-effect, win/lose screens.

## v1.1: Entity sprite pass (chosen 2026-07-12)

What and why: [Sprite Spec](./Design/Sprite%20Spec.md) - pixel art, 32px virtual tile (512x288 native), per-entity sizes where bulk encodes threat. Authoring: **pixel-strings in TS** (see Sprite Spec's Authoring section). Sequenced like v1: each step is independently visible/testable and unblocks the next. Renderer comes first because every later step draws into the virtual space it creates; the pipeline is proven on one sprite before any real art is made.

- [x] Virtual-resolution renderer - render the world to a 512x288 offscreen canvas (integer `VIRTUAL_TILE = 32` replaces the float `tileSize` in `render.ts` draw code), blit to the display canvas with `imageSmoothingEnabled = false`. Try integer scaling in device pixels (letterboxing the small remainder) first, keep plain scale-to-fit as a one-line fallback if the letterbox feels wasteful. Update `clientToGrid` for the blit offset/scale, round draw positions to whole virtual pixels (fractional coords antialias and break pixel purity). HUD text and end-screen overlays stay on the display canvas at full resolution. Prerender the static board once (banks part of the render-perf idea from [Idea Bank](./Idea%20Bank/Idea%20Bank.md)). Done: `canvas.ts` `Viewport`; integer scale w/ fractional fallback below 1x.
- [x] Pixel-string atlas pipeline - sprite format (string grid, one char per pixel, palette-char map), a startup baker that paints every sprite into one atlas canvas, a `drawSprite(name, frame, x, y)` helper, and a dev-only gallery view (`?gallery` - every sprite and frame at 8x, hot-reload friendly). Done: `sprites.ts` (baker + `drawSprite` + `spritePixels`), `gallery.ts`. Authoring detour: strings are emitted by `scripts/gen-sprites.mjs`, not hand-written (see Log).
- [x] Enemy sprites - all 6 kinds at spec sizes/ratios, 2-frame idle each, oriented in 90-degree steps to travel direction (never arbitrary rotation - keeps pixels crisp). Pull colors back toward the strict theme palette: shape and size now carry identity, so the current six-hue `ENEMY_VISUALS` rainbow can go. Done: `ENEMY_VISUALS` deleted; orientation via `directionAlongPath`.
- [x] Tower sprites - 4 kinds, silhouette encodes function per spec. Overclock states keep their procedural treatments (overheat dim, boost outline); IDS Scanner's sweep stays a procedural rotating line over the sprite. Done; muzzle-flash frame added for attack towers (`tower.flashMs`).
- [x] Board entities + projectiles - core mainframe (48x48), spawn port, projectile sprites (3x3, AES 5x5). Trace/board art untouched unless it visibly clashes with the new entities. Done; trace fill dimmed (`palette.traceFill`) so bright sprites read over it.
- [x] Glitch integration + verify - kill burst scatters the dead enemy's actual sprite pixels (colors/offsets sampled from the atlas - the spec's "now literal" payoff), then a full playthrough at several window sizes and DPRs, desktop + mobile viewport. Code done (`createGlitchBurst` takes `spritePixels`); the multi-size/DPR + physical-mobile playthrough is still pending manual QA, **carried into v1.2's verify step** below rather than done twice.

## v1.2: Tower panel + upgrades (chosen 2026-08-23)

What and why: [Tower Panel](./Design/Tower%20Panel.md) - a placed tower is currently a dead object with no stats, no upgrade, no undo, and its one interaction (arm `Q`, then click) is a keyboard mode in a game that is meant to be played on a phone. One selection model fixes all four, which is why [Idea Bank](./Idea%20Bank/Idea%20Bank.md) already flagged the panel as the foundation under upgrades, sell, and touch Overclock.

Sequenced like v1 and v1.1: each step is independently visible/testable and unblocks the next. Selection comes first because every later step acts on the selected tower; sell lands before upgrades because it is the smallest mutation that exercises the whole select-act-deselect loop.

- [x] Selection model - tap a placed tower to select, tap elsewhere or Escape to deselect; selection ring + range circle drawn in the world canvas. New branch in `main.ts`'s `pointerdown` ahead of the placement branch (the two targets are disjoint: `isPlaceable` already rejects `occupied` tiles). No panel yet.
- [x] Panel shell - DOM panel (toolbar's visual language, 44px targets, safe-area aware) anchored opposite the toolbar, showing the selected tower's name and stats, appearing and disappearing with the selection. Read-only.
- [x] Sell - `invested` on the `Tower` entity (placement + upgrades, tracked rather than recomputed), partial refund at 60%, frees the tile and clears the selection.
- [x] Upgrade tiers - `TOWER_STATS` becomes a per-kind array of 3 tiers, `towerStats(kind, tier)`, `tier` on the entity. Attack towers buy damage + fire rate, aura towers buy slow strength + radius (Honeypot's radius stays tight - a wide Honeypot is just an IDS Scanner). Panel shows current vs next tier. Tier tell stays procedural; no tier sprites this milestone.
- [x] Overclock migration - `OC` moves into the panel, the `overclockArmed` mode and the toolbar `OC` button go, `Q` stays as a shortcut acting on the selection.
- [x] Build preview (added mid-milestone 2026-08-23, not in the original six) - with a panel on screen, showing stats only *after* you have paid for a tower is backwards. The panel now has two modes: selected tower, or the tower about to be built (cost, stats, and the placement rule). Toolbar buttons stop being `disabled` when short on Cycles, since a disabled button swallows the tap you need to read what you are saving for.
- [x] Console restyle + dock (added mid-milestone 2026-08-23, not in the original six) - panel and toolbar stack in one bottom-centered dock instead of sitting in opposite corners, and the panel is styled as a green-on-black terminal (dot leaders, scanlines, blinking cursor) using only palette colors. Open by default, collapsible from its header bar.
- [x] Enemy inspection (added mid-milestone 2026-08-23, not in the original six) - tap an enemy to read it in the console: HP, speed, bounty, and its special rule (boss immunity, split-on-death), both of which were previously invisible. Selection became one tower-or-enemy union; `clientToGrid` split into `clientToWorld` plus a floor, since entities sit between tiles.
- [x] Verify - full playthrough, **plus the multi-size/DPR and physical-device QA still owed from v1.1 step 6**. Folded in here on purpose: v1.2 is the milestone that rewrites touch interaction, so testing the old flow on a phone first would have tested something about to be deleted. Done: played on a phone and reported clean, which also discharges the QA v1.1 owed.

## v1.3: The run - wave curve + pacing (chosen 2026-08-23)

What and why: [Run Structure](./Design/Run%20Structure.md) - a run is 4 waves and pays out ~228 Cycles over the 100 you start with, while taking one AES Turret to tier 3 costs 210. The three-tier ladder v1.2 just built is content the run is too short to reach, and v1.2 explicitly deferred the wave pass to whenever upgrades stopped moving. They have.

Sequenced like the milestones before it: pacing controls first because they are the tool that makes everything after them testable, the extraction before the harness because nothing outside a browser can step the sim today, and the curve before the preview because a preview of an untuned wave previews nothing.

- [x] Pause + speed toggle - 1x/2x multiplying the sim timestep, not the render rate; pause stops the sim and leaves rendering alive so the board and console stay readable while stopped. Lives with the console, not the build menu. Smallest step, isolated in `game-loop.ts` + `main.ts`, and the tool the rest of the milestone is tuned with. Done: `GameLoop.setTimeScale` scales the accumulator so the fixed tick survives; `||`/`1x` buttons in the console header; `Space` and `F` as shortcuts. Not seen running - the Chrome extension was disconnected again.
- [x] Extract the simulation - explicit state object + `stepGame(state, dtMs)` in its own module; `main.ts` keeps input, selection, render, DOM. **The checkpoint is that nothing changes** - no new behavior, no new numbers. Unblocks the harness and shrinks the project's biggest file. Done: `game.ts` (268 lines) owns state, stepping, placement, sell and upgrade; `main.ts` went 435 to 341. The kill burst's atlas lookup is injected as a hook so the sim imports no canvas. First tests in the project came with it (`npm test`).
- [ ] Balance harness - headless script that runs the waves against a declared tower layout at a fixed timestep and reports leaks, core HP, and Cycles per wave. Cheap because the sim is already deterministic: the only `Math.random()` in `src/` is in the cosmetic glitch particles, and `tests/game.test.ts` already gates that property.
- [ ] Wave curve - ~10 waves with a deliberate shape, each enemy kind introduced alone before it appears mixed (today wave 3 opens with 10 Packet Sniffers, the first ten the player has ever seen), economy sized so topping out some towers is reachable and topping out all of them is not. Tuned with the harness, confirmed by playing.
- [ ] Wave preview - console's fourth mode: with nothing selected between waves, read the composition of what is coming. Same surface as build/tower/enemy.
- [ ] Early-call bonus - calling the next wave early pays Cycles scaled to the countdown skipped. After the preview on purpose: paying for a decision whose terms are hidden is a slot machine, not a decision.
- [ ] Verify - full playthrough of the ten-wave curve on desktop and phone, including a run that leans on 2x and a run that calls every wave early.

Deliberately out of scope, with reasons, in [Run Structure](./Design/Run%20Structure.md): audio, new enemy behaviors, endless/high scores, a second map.
