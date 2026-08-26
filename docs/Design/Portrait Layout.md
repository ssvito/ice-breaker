# Portrait Layout

Part of [Design](./Design.md). Spec for the phone held upright - chosen as the v1.4 milestone 2026-08-25; build order in [Roadmap](../Roadmap.md). Drafted 2026-08-25.

The game is 16x9 and has only ever been held that way. Upright it still runs, and it looks like something left in the wrong drawer: the board floats in the middle of a tall black screen, the console is pinned to the bottom of the *window* with about 180px of nothing between it and the board it reports on, and the build menu, having no side band to tuck into, sits on top of the board's left edge.

This is the debt the log took on deliberately on 2026-08-23:

> known and accepted - in portrait there is no side band to tuck into [...] moving the menu into *that* band would mean an orientation-dependent layout, which is a bigger change than the complaint asked for.

The complaint is now asking for it, and the answer turned out to be bigger than moving the menu.

## The arithmetic that decided the shape

The world is 512x288 and `fitViewport` blits it at an **integer** scale. On a 390x844 phone at dpr 3 that gives three candidate layouts, and the whole spec follows from which one is picked:

| board | scale | CSS px | tile | band above/below |
|---|---|---|---|---|
| landscape, upright phone | 2 | 341 x 192 | 21px | 326px |
| **rotated 90 degrees** | **4** | **384 x 683** | **42px** | **81px** |
| rotated, one step down | 3 | 288 x 512 | 32px | 166px |

Leaving the board in landscape on an upright phone costs **three quarters of its area** and drops the tile to a 21px tap target, half of the 44px the rest of the UI keeps. The ceiling is the window's *width*: scale 3 would need 1536 device px against the phone's 1170.

Rotating it removes that ceiling entirely, because the long axis of the board and the long axis of the phone finally agree. At scale 4 the upright board is **the same size as the landscape one** - 42px tiles, no loss at all - and portrait stops being the lesser way to play.

What rotation costs is the empty band that started this whole conversation. The 326px of dead space above and below the landscape board is exactly what the rotated board eats: 81px is left on each side. **The board is maximal and the chrome has nowhere to stand.** That is the trade, taken deliberately, and everything below is its consequence.

## The chrome only fits because it collapses

81px holds one 44px row with margin. It does not hold an expanded console (136px), and it does not hold a four-button build row stacked under the status bar (86px together, 5px over).

So in portrait every piece of chrome has a collapsed footprint that fits the band, and expanding it is a drawer over the board:

- **Top band: the reading.** The status bar keeps the centered position it already has, and the two settings buttons - fullscreen and the orientation lock - anchor to its right. One 44px row against 81px of band, with the roomiest margin in the layout.
- **Bottom band: the controls.** One 44px row again, but this one is full: the build menu's toggle on the left and the console's collapsed header taking the rest. The 34px safe-area inset on a notched phone eats most of the 81px, so **there is room for exactly one row down here and no second one.**
- **Open, either drawer covers about 1.5 to 2 tiles** of the board's near edge and is dismissed with the same tap that opened it. Both open upward, into the board, because there is nothing below them to open into.

That split is what the bottom band's single row forces, and it lands the right way round. The things you read are at the top, the things you press are under the thumb, and the two settings that get touched once a session are the furthest from it.

This is the trade landscape already makes and the player already accepted - the log's verdict on the dock was "covers a fair slice of the bottom-center board but is playable". The difference is that portrait now has a gesture to take it off the board.

**The board does not resize when a drawer opens.** The bands are reserved for the collapsed state and stay reserved, so opening the menu changes what is drawn over the board and never what scale the board is drawn at. A world that re-scales mid-wave because a menu opened is the worst thing this layout could do, and it is worth one paragraph of spec to make sure nobody implements it that way by accident.

## The build menu becomes a drawer

In landscape the menu keeps the vertical column on the board's left edge, where the side band holds it. In portrait it becomes a **horizontal row of four buttons** opened from a 44px square button at the left end of the bottom strip, and closed the same way.

The open row is 44px tall, not the column's 56px, which means the label and the cost sit on one line (`FW 60`) instead of stacked. Four of those plus gaps is about 240px, comfortable inside 390px. The stacked form exists because a vertical column has width to spare and no height; a horizontal drawer has the opposite problem, and the drawer has to match the strip it grows out of.

Two drafts died before that, and both are worth keeping because they are why this one looks obvious:

The first rotated the tower buttons' labels 90 degrees so the column could shrink into the side band. Dropped on the numbers: a rotated column lands around 30-40px against a band that, with the board rotated, is **3px**. It never had a chance, and the button's short axis would have dropped under the 44px target for nothing.

The second kept the column upright on the board's left edge and accepted the overlap. Drawing it to scale killed it: the toolbar is 206px tall against a 192px board, so it covered the board's full height and 1.9 tiles of its width, including the spawn tile at `{x: 0, y: 2}` - the tile enemies walk out of.

**Does the menu close itself after a tower is placed?** Default no: building three towers should not cost three reopenings, and the console already behaves this way - it stays where you left it. Filed for verify, which is where a question about how a gesture feels belongs.

### The switch is a measured predicate, not a media query

Landscape keeps everything it has today. But the condition is not "portrait versus landscape", it is whether the board's own aspect and the window's agree:

```
rotate when (windowHeight / windowWidth) and (virtualWidth / virtualHeight) disagree
```

and, for the menu, whether the band that is left can hold what wants to stand in it. Asking about the room that exists rather than about which way the device is held gets the right answer for cases an orientation media query gets wrong on its own - a short landscape browser window on a tall phone, a narrow desktop window, a tablet. JS decides it in the same pass that publishes the layout candidates and toggles one class; CSS holds both layouts.

## Which way it rotates

**Counterclockwise: spawn at the bottom, core at the top, enemies climbing.**

Clockwise is the intuitive reading - the board's left edge goes to the top, so the trace keeps running "forwards" - and it puts the core at the bottom of the screen, which is exactly where the console opens. The console would cover the thing the player is defending, every time they read a tower.

Counterclockwise puts the core in the top band, which only ever holds a 44px row, and the spawn port at the bottom near the thumb. The cost is that the run's direction inverts against the landscape version: left-to-right becomes bottom-to-top. That is a reading decision rather than a pixel one, and it is the kind of thing a playthrough overturns, so verify owns it.

## The console anchors to the board

Independent of rotation, and true in both orientations: the console is the one piece of chrome still pinned to the window rather than to the board. In landscape the two happen to coincide; upright they do not.

The status bar and the build menu both publish a candidate position measured off `boardRect()` and let CSS `max()` pick it against a floor. The console cannot copy that one-liner, because it is anchored by its **bottom** edge and grows upward, so gluing its top under the board needs its own height - which changes with every collapse and every one of its four modes.

The rule inverts and takes a measurement:

```
top = min(boardBottom + gap, windowHeight - panelHeight - floor)
```

JS publishes `--panel-under-board` and the measured `--panel-h`; CSS does the `min()` and keeps `env(safe-area-inset-bottom)` inside the floor, where it already lives. A `ResizeObserver` on the panel re-runs the publish whenever its height changes, covering collapse, mode switches and reflow with one hook.

**The checkpoint is that landscape does not move a pixel.** There, the floor wins and the console lands exactly where it is today. If it moves, the formula is wrong.

## Hiding the phone

Two things, in dependency order.

**Unlocking the orientation is a prerequisite, not a feature.** The manifest says `orientation: 'landscape'`, so as an installed PWA the game never rotates and nothing above is reachable where it matters. It becomes `'any'`.

**Fullscreen** is `display: 'fullscreen'` in the manifest, which drops the Android navigation bar in the installed app for one line and no code, plus `requestFullscreen()` on a user gesture for the browser case. Feature-detected and silently absent on iOS, which has no Fullscreen API for anything but video - and where a home-screen PWA has no chrome to hide anyway.

Both matter more here than they would have with a landscape board: at scale 4 the rotated board leaves 81px of band, and an Android navigation bar is about 48px of it.

**The orientation lock comes after fullscreen because it depends on it**: `screen.orientation.lock()` rejects on Android unless the document is fullscreen or the app is installed, and does not exist on iOS at all. The button renders only where the API does.

A note on where that button came from. The milestone was chosen with "automatic, plus a way to lock it" as the answer for what switches the layout - but there is no discrete portrait mode to switch. Every box positions itself by arithmetic off `boardRect()`, so rotating the phone re-runs the same formula and the automatic half is free. What is left is a **screen orientation lock**: pinning the phone so the game does not rotate under a hand resting on its side. A different feature than the question assumed, worth having, named honestly.

## Where the buttons live

Fullscreen and the orientation lock were going into the console header next to `||` and `1x`, and the bottom band's one-row budget is what got them out of it. That header is a 320px box holding a flexing title and two 44px buttons; two more would have put 176px of buttons in it and left 144px for `> AES TURRET _`. It is the second time in two milestones that something wanted to live in that row, and the log had already flagged the crowding while there were still three things in it.

So they go **up top with the status bar instead**, anchored right while the glyphs stay centered. That is also where they belong on their own merits: they are set once a session, and the top of a tall phone is the hardest place to reach - which is a virtue for a control you do not want to hit by accident.

The build menu's toggle takes the bottom strip's left end, next to the thing it opens and under the thumb that opens it.

All of them are feature-detected or portrait-only, so desktop and landscape keep the header they have today.

## Out of scope, with reasons

- **A portrait-shaped map.** The waypoint format in [Map Layout](./Map%20Layout.md) would take a 9x16 level today, and it would avoid the sideways reading entirely. But a second map inheriting a curve should inherit a finished one - the same reason v1.3 gave for refusing map 2 - and the rotation above gets the space for free.
- **Re-authoring sprites for the rotated board.** The blit rotates everything: the trace, the core, the towers. Enemies already orient to travel direction and come out right by accident; the rest reads sideways. That is a look, not a bug, and changing it means a second set of art rather than a layout milestone.
- **Scaling the chrome with the board.** The chrome holds its size and the world grows around it, settled in v1.3 and unchanged here.
- **A start screen to hang the fullscreen gesture on.** The game starts on load, which is a deliberate portfolio property (thirty seconds of attention, no menu in the way). The gesture goes on a console button instead.
