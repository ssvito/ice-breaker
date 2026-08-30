# Before the Run

Part of [Idea Bank](./Idea%20Bank.md). A screen between launching the game and playing it: a place to start a run, choose which kind of run, read your records, and maybe sign in. Player's idea, 2026-08-30. Nothing chosen.

It arrived out of a different question - how to stop people playing a stale build - and the two turned out to be the same question wearing different clothes.

## The argument: this is a container four filed items already need

The game boots straight into a run. There is no moment that is *not* a run, and that single fact is what blocks a surprising number of things already written down:

- **Endless mode** ([Idea Bank](./Idea%20Bank.md), carried into [Difficulty](./Difficulty.md)) is a second kind of run, and a second kind of run needs somewhere to be chosen.
- **Difficulty modes** ([Difficulty](./Difficulty.md)) are the same shape - a knob set before a run, not during one.
- **Local high scores** ([Idea Bank](./Idea%20Bank.md)) have to be *read* somewhere, and the console reads the board rather than the history.
- **The update prompt** (below) needs a safe seam to apply at, and "before a run" is the only seam in the game that costs nothing.

None of those is blocked on wanting a title screen. They are blocked on there being no before. That is what makes this worth its own note rather than a bullet: it is not a feature, it is the place three features are waiting for.

It also gives a home to two things that have nowhere to be displayed today: the **soundtrack credit and licence** that v1.5 still owes the composer, which is the kind of thing that lives on a title screen in every game there is, and a **build version** the player can read back when reporting a bug.

## The trap: a record needs a metric, and a fixed curve barely has one

A run today ends in `SYSTEM SECURED` or `CORE BREACHED`, with core HP left, Cycles banked and a clock. That is a *verdict*, not a score. Best-of tables over a verdict collapse fast: once a player wins at 5/5 there is nothing left to beat except the clock.

Worse, **a record is a statement about a curve, and the curve moves.** v1.6 retuned it twice in one day. A leaderboard of "2/5 in 3:16" against a curve that no longer exists is a leaderboard of a moving target, and the honest fixes are both real work: scope every record to the curve version that produced it, or wait for a run whose length is the score.

Which is exactly what the endless note has said since it was filed - *"gives high scores something to measure"*. So the sequence is not a preference:

1. The shell, with a start button and whatever records the fixed curve honestly supports (best clear, fastest clear, fewest leaks - scoped to a curve version).
2. Endless, which turns the score into a number that keeps going.
3. The mode picker, which is only then a picker rather than a list with one item.

**Shipping a chooser with one choice is worse than shipping a start button.** The shell should be built so a second mode is a line of data, and should not pretend to offer a decision that does not exist yet.

## Login: split it into the half that needs a server and the half that does not

The two halves have completely different costs and it is worth refusing to discuss them together.

**Records that are yours on this device need no backend at all.** `localStorage` is already in the project - v1.5's mute toggle was the first key, and [Idea Bank](./Idea%20Bank.md) already notes it as the seam local high scores plug into. This half is cheap, works offline, and delivers most of what a player means by "keep my records".

**Login only earns its place when there is something login is for**: records that follow you to another device, or a leaderboard with other people on it. Wanting an account for its own sake buys nothing a `localStorage` key does not.

And the cost is architectural rather than incremental. This is a static build on GitHub Pages with no server anywhere, which is not an accident - it is what makes the deploy a push and the game work offline. A backend is the project's first server dependency, and it brings auth, a place to put personal data, and a feature that stops working on a plane. If it happens:

- **Anonymous first, account optional.** A device-local identity that can later be claimed by signing in, so nobody is asked to log in before they have anything to lose.
- **A managed backend rather than a hand-rolled one** - the learning value of this project is the simulation, and writing auth is not the module anyone is here for.
- **Offline stays the default path.** Local records are the truth; the server is a copy. A leaderboard that fails should degrade to a game that plays.

The honest reading is that login is the only item on this page that is a different project rather than a next step, and that it should be the last thing considered rather than the thing the shell is designed around.

## The update prompt, which is what started this

Today `registerType: 'autoUpdate'` ships a service worker that calls `skipWaiting` and `clientsClaim`, while the injected registration script does nothing but register. So the new worker takes over the running page in silence and the running page keeps executing the old build - the player sees the new version at the next cold start, and an installed app that is resumed rather than relaunched may not get one for weeks. `cleanupOutdatedCaches` also deletes the previous precache under a page that is still running, which is harmless while the app is a single bundle and is a 404 mid-run the day anything is dynamically imported.

The fix has three parts and the shell is where the third one lands:

- **`registerType: 'prompt'`**, and own the registration in `main.ts`. The new worker waits, and the running page keeps the exact build it started with. This is a correctness fix, not a UX one.
- **Check on resume**, not only on load: `registration.update()` on `visibilitychange`, with a slow interval behind it. An installed PWA is resumed far more often than it is launched.
- **Apply at a seam.** Reloading before a run costs nothing; reloading during one destroys it. With overlapping waves there is barely a "between waves" left, so the seams are the shell and the end of a run.

## Not decided

Whether the shell is DOM or canvas - everything chrome-shaped in this project is DOM (toolbar, console, menu) and there is no reason for this to be the exception, but a title screen is also the one piece of chrome that could carry the theme visually.

Whether the run ends *into* the shell or into the board as it does today, which is really a question about whether the shell is a screen or a state.
