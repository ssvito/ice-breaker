# Before the Run

Part of [Idea Bank](./Idea%20Bank.md). A screen between launching the game and playing it: a place to start a run, choose which kind of run, read your records, and maybe sign in. Player's idea, 2026-08-30. **Called critical by the player on 2026-08-31**, with a fifth blocked item added that is the reason: a second map has nowhere to be chosen either. So this stops being one candidate among the idea bank's and becomes the thing the roadmap is organized around next. **Promoted to v1.7** the same day: build order in [Roadmap](../Roadmap.md), and the two questions this note left open - DOM or canvas, screen or state - are settled there rather than here.

It arrived out of a different question - how to stop people playing a stale build - and the two turned out to be the same question wearing different clothes.

## The argument: this is a container five filed items already need

The game boots straight into a run. There is no moment that is *not* a run, and that single fact is what blocks a surprising number of things already written down:

- **Endless mode** ([Idea Bank](./Idea%20Bank.md), carried into [Difficulty](./Difficulty.md)) is a second kind of run, and a second kind of run needs somewhere to be chosen.
- **Difficulty modes** ([Difficulty](./Difficulty.md)) are the same shape - a knob set before a run, not during one.
- **Local high scores** ([Idea Bank](./Idea%20Bank.md)) have to be *read* somewhere, and the console reads the board rather than the history.
- **The update prompt** (below) needs a safe seam to apply at, and "before a run" is the only seam in the game that costs nothing.
- **A second map** ([Idea Bank](./Idea%20Bank.md)) has nowhere to be chosen either - the waypoint-only level format was built for more maps and named a map-select screen as its cost the day it was filed. Added by the player 2026-08-31, and it is the item that moves this note from "worth doing" to "in the way": map 2 is content, and content is what the project would otherwise be adding next.

None of those is blocked on wanting a title screen. They are blocked on there being no before. That is what makes this worth its own note rather than a bullet: it is not a feature, it is the place five filed items are waiting for.

It also gives a home to two things that have nowhere to be displayed today: the **soundtrack credit and licence** that v1.5 still owes the composer, which is the kind of thing that lives on a title screen in every game there is, and a **build version** the player can read back when reporting a bug.

## The trap: a record needs a metric, and a fixed curve barely has one

A run today ends in `SYSTEM SECURED` or `CORE BREACHED`, with core HP left, Cycles banked and a clock. That is a *verdict*, not a score. Best-of tables over a verdict collapse fast: once a player wins at 5/5 there is nothing left to beat except the clock.

Worse, **a record is a statement about a curve, and the curve moves.** v1.6 retuned it twice in one day. A leaderboard of "2/5 in 3:16" against a curve that no longer exists is a leaderboard of a moving target, and the honest fixes are both real work: scope every record to the curve version that produced it, or wait for a run whose length is the score.

Which is exactly what the endless note has said since it was filed - *"gives high scores something to measure"*. So the sequence is not a preference:

1. The shell, with a start button and whatever records the fixed curve honestly supports (best clear, fastest clear, fewest leaks - scoped to a curve version).
2. Endless, which turns the score into a number that keeps going.
3. The mode picker, which is only then a picker rather than a list with one item.

**Shipping a chooser with one choice is worse than shipping a start button.** The shell should be built so a second mode is a line of data, and should not pretend to offer a decision that does not exist yet.

**What the fifth item changes about that sequence** (2026-08-31): endless was placed second because the picker needed a second entry before it was a picker. A second map is also a second entry, and a different *kind* of choice - what you play rather than how - so a map select is a list with two items the day map 2 lands, with no endless required first. That does not reorder anything: the shell is first either way. What it does is take endless off the critical path of the picker and leave it where it actually belongs, as the answer to what a record measures.

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

**Two thirds of this shipped on 2026-08-30**, ahead of the shell and deliberately: the first two parts are a correctness fix that does not need a screen, and only the third one does. What follows is the diagnosis as written, with what landed marked.

As found, `registerType: 'autoUpdate'` ships a service worker that calls `skipWaiting` and `clientsClaim`, while the injected registration script does nothing but register. So the new worker takes over the running page in silence and the running page keeps executing the old build - the player sees the new version at the next cold start, and an installed app that is resumed rather than relaunched may not get one for weeks. `cleanupOutdatedCaches` also deletes the previous precache under a page that is still running, which is harmless while the app is a single bundle and is a 404 mid-run the day anything is dynamically imported.

The fix has three parts and the shell is where the third one lands:

- **Done - `registerType: 'prompt'`**, with registration owned by `src/update.ts`. The new worker waits, and the running page keeps the exact build it started with. A correctness fix, not a UX one.
- **Done - check on resume**, not only on load: `registration.update()` on `visibilitychange`, with a half-hour interval behind it as the backstop. An installed PWA is resumed far more often than it is launched.
- **Waiting on this note - apply at a seam.** Reloading before a run costs nothing; reloading during one destroys it. With overlapping waves there is barely a "between waves" left, so the seams are the shell and the end of a run. What shipped instead is a `RELOAD` offered in the console's ABOUT reading and never taken on the player's behalf, plus the thing that makes that enough for most people: **a waiting worker activates on its own once the last client closes**, so an app that is genuinely restarted updates without anybody pressing anything. The button is for the installed app that is resumed for weeks and never restarted, which is the case that had no answer at all.

**ABOUT shipped with it**, in the gear column and rendered as a fifth console mode rather than a new box - the console already owns collapse, anchoring and dot leaders, and a second panel would rebuild all of it to say three lines. It reads the build's short git SHA, the build date and the update state. The SHA rather than a semver because `package.json` has said 0.0.0 since the first commit while the commit is what the log and the roadmap are indexed by. When the shell exists, ABOUT is one of the things that moves into it - along with the soundtrack credit, which still has nowhere to be.

## Not decided

Whether the shell is DOM or canvas - everything chrome-shaped in this project is DOM (toolbar, console, menu) and there is no reason for this to be the exception, but a title screen is also the one piece of chrome that could carry the theme visually.

Whether the run ends *into* the shell or into the board as it does today, which is really a question about whether the shell is a screen or a state.
