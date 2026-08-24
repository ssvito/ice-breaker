# Run Structure

Part of [Design](./Design.md). Spec for the shape of a run - chosen as the v1.3 milestone 2026-08-23; build order in [Roadmap](../Roadmap.md). Drafted 2026-08-23.

The problem is arithmetic. A run is four waves long and pays out about 228 Cycles on top of the 100 you start with. Taking a single AES Turret to tier 3 costs 210. The upgrade ladder [Tower Panel](./Tower%20Panel.md) just built - three tiers across four towers, with a sell refund to undo a bad call - is content the run is too short to reach. It is not a tuning problem; the milestone that built it has nowhere to happen.

This is also the debt v1.2 named on its way out: no wave rebalancing while upgrades were still moving, because the numbers would be wrong afterwards. They settled. It is that pass's turn.

## What a run should be

Ten waves, roughly, with a curve that has a shape rather than a slope: pressure, a breath, more pressure, the boss. Long enough that a player who commits to two towers early and tops them out is making a real bet against a player who spreads four thin, and long enough that selling a tower mid-run is sometimes the right move rather than a feature nobody has time to use.

The six enemy kinds arrive one at a time, each with a wave to itself before it shows up mixed. Today wave 3 opens with ten Packet Sniffers at 400ms - the first time the player meets the kind is also the moment ten of them are already on the trace. A kind's introduction is the game teaching a rule; teaching it under load teaches nothing.

Economy sized so that topping out *some* towers is reachable and topping out all of them is not. That is the whole decision the tier ladder exists to pose, and it only exists while Cycles stay scarce.

## Pacing controls

Pause, and a 1x/2x speed toggle. [Idea Bank](../Idea%20Bank/Idea%20Bank.md) files these under near-mandatory TD quality-of-life, and at four waves they were a nicety. At ten they are the difference between a run you play and a run you sit through - and they are also the tool that makes every later step of this milestone testable, which is why they land first.

Speed multiplies the simulation's timestep, not the render rate: the loop keeps drawing at whatever the display gives it and the sim is stepped twice as far per frame. Pause stops the sim and leaves rendering alive, so the board, the console, and the selection stay readable while stopped - a paused game you cannot inspect is just a stopped game.

Both live with the console rather than the build menu. The build menu answers "what do I place"; speed and pause are statements about the run, which is what the console already reads out.

## Wave preview and the early call

The console gets a fourth mode, next to selected tower, selected enemy, and build preview: with nothing selected and the game between waves, it reads the composition of the wave that is coming. Same surface, same dot leaders, one more thing the game stops hiding.

Calling the wave early pays a bonus in Cycles scaled to the countdown you skipped. That turns the between-wave lull from dead time into the run's recurring risk decision - bank the seconds and build, or take the money and meet the wave with what you have. It also gives an experienced player a way to compress a ten-wave run without the game having to be shorter for everyone.

The preview has to come before the bonus in the build order, and not only because it is smaller: paying a player for a decision they cannot see the terms of is a slot machine, not a decision.

## Balance harness

A headless run of the simulation, from a script, against a declared tower layout - counting leaks, core HP left, Cycles earned and spent, wave by wave.

Two reasons it is in this milestone rather than filed as a nice-to-have. The first is practical: ten waves cannot be tuned by playing them, and the tuning loop being "rebuild, sit through eight waves on a phone, change one number" is how a wave curve ends up shipped on vibes. The second is that this project's driver is learning, and [Idea Bank](../Idea%20Bank/Idea%20Bank.md) has had the harness filed under engineering modules since the start - deterministic simulation and test discipline, in a codebase with no tests at all today.

It is unusually cheap here, because the simulation is **already deterministic**: the only `Math.random()` in `src/` is in the glitch particles, which are cosmetic and do not feed back into the sim. Fixed timestep in, same result out, no seeded RNG to build.

What it does cost is the extraction below.

## Extracting the simulation

The sim currently lives in a closure inside `startGame()` in `main.ts`, reading a dozen local variables - `towers`, `enemies`, `cycles`, `coreHealth`, `gameState` - that only exist inside that function. Nothing outside a browser can step it.

So it moves: an explicit state object and a `stepGame(state, dtMs)` that mutates it, in its own module. `main.ts` keeps what it should have kept anyway - input, selection, rendering, DOM - and stops being the biggest file in the project by a wide margin.

The checkpoint for this step is that nothing changes. No new behavior, no new numbers; the game plays exactly as it did, and the win is that the harness and the speed toggle both become possible afterwards. A refactor that lands with a feature attached is a refactor nobody can verify.

## What the curve became

Three mechanics the spec above did not ask for, each one forced by a reading off the harness and kept because the curve needs it, not because it was planned:

- **Groups run concurrently inside a wave.** A `SpawnGroup` has a `startMs` offset and every group reads the wave's own clock, so wave 4 is Trojans walking through a Worm stream rather than after one. Before this, groups were a queue, and "introduced alone before it appears mixed" was a promise the data could not keep.
- **Waves past 6 carry an HP multiplier** (`hpScale`, 1.5x through 2.75x). Difficulty had to come from somewhere that is not counts, because counts are also the bounty, and the economy is the other half of what this milestone sizes. It moves HP only - not speed, not the reward. The ramp starts late because rounding makes a small multiplier a big jump on a three-HP Worm.
- **A Zero-Day breach costs 3 core HP.** It used to cost 1, like a Worm, so the boss could walk into the core and the run still ended in `SYSTEM SECURED`. Three, not five: a run that arrives clean survives it, a run that has been leaking does not, which keeps every earlier leak on the books until the last wave.

## Deliberately not in scope

- **Audio.** The biggest single learning module left and the loudest gap in a portfolio piece, which is exactly why it deserves a milestone instead of a corner of this one.
- **New enemy behaviors** - stealth, healers, shields, EMP. Adding units while tuning the curve means rebalancing against a target that is still moving, which is the same trap v1.2 avoided by refusing to touch waves.
- **Endless mode and high scores.** Both measure a run against a standard, and the standard is the thing this milestone is building. They come after the curve exists, not alongside it.
- **A second map.** The waypoint format is ready for one, but a new map inheriting a freshly tuned curve is a content pass, and it wants the curve finished first.
