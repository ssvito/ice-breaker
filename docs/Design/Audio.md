# Audio

Part of [Design](./Design.md). How the sound gets into the game, as opposed to
[Audio Brief](./Audio%20Brief.md), which is the delivery spec handed to the composer.
Background on the browser constraints behind every number here is in the vault note
`Áudio em PWA`.

The short version: this is the milestone that installs the **mixing desk**, and puts
one track through it. The four adaptive layers the brief asked for, and the
synthesized SFX, are the two milestones after it - and the whole point of the shape
below is that neither of them has to move anything this one builds.

## What arrived, and why the plan starts provisional

The brief asked for four WAV stems of 30 to 45 seconds. What came back is one
mastered MP3:

```
1:25 (84.7s) · 48kHz · joint stereo · MP3 CBR 160kbps · 1.66 MB · no Xing header
```

Those are the two things the brief specifically asked not to send. Said plainly
rather than worked around, because it decides what this milestone is: **a floor, not
the soundtrack**. Three numbers fall out of the file, and each one drives a decision
below.

| Reading | Consequence |
|---|---|
| 84.7s stereo decodes to **~32 MB** of float32 | the whole RAM budget the vault note reserved for four layers, spent on one track |
| **1.66 MB** over the wire, against ~25 KB for the entire PWA | the track is 66x the game, so it cannot be in the precache |
| MP3 records no encoder delay or padding | every browser trims a different amount, so the loop seam is not portable |

### What the measurements changed

Everything above survived contact with ffmpeg. Three other things in this note did
not, and they are recorded here rather than quietly edited, because each one was a
reasonable assumption that measurement overturned.

**The delivery is not "mastered to streaming level".** That was the assumption; the
file reads **-18.4 LUFS integrated** over the loop region, against a brief that asked
for -18. The composer hit the loudness target. What he missed is the true peak, at
**-0.1 dBTP** against a -6 ask - and those two numbers cannot both be met by a gain,
because the delivery carries ~18 dB of crest where the brief's pair implied 12. See
the level section below for which one wins and why.

**The piece does not loop as a whole - it has a shape, and the shape is better.** An
RMS profile makes it obvious:

```
 0-19s   ~-25 dBFS   intro
20-75s   ~-15.5 dBFS  body    <- 55s of very steady energy, LRA 1.1 LU
76-83s   ~-27 dBFS   outro, decaying
84s      digital silence
```

Looping the file whole would replay 19 seconds of quiet intro every 85 seconds and
drop out at 76. But the body is exactly the material a loop wants, and the grid it
sits on turned out to be exact.

**The track is at 120.000 BPM, and every edge lands on the bar.** Refining the
repeat period against long baselines puts it at 8.000s to within a sample - four bars
of 2.000s each. The section boundaries fall on that grid with no rounding:

| | | |
|---|---|---|
| intro | `[0, 20.000s)` | 10 bars |
| body | `[20.000s, 76.000s)` | **28 bars, 7 phrases** |
| outro | `[76.000s, ~83.9s)` | discarded, see below |

That is what makes the whole loop problem disappear rather than get solved.

## The graph is the deliverable, not the track

With a single file, `<audio loop>` and three lines would make sound today. That is
the mistake this note exists to refuse. What ships instead:

```
AudioBufferSource -+
                   +- musicBus -+
(later: synth) ----+            +- master - ceiling - destination
                     sfxBus ----+
```

Two decisions in that diagram, both of which pay off in a later milestone rather
than this one.

**Buses before the first sound.** The Idea Bank has wanted a sound toggle since
before there was sound, and the toggle is a property of the graph: with a bus, mute
is one gain going to zero; without one, it is an `if` at every call site, and the
first sound anyone adds later will forget it. A new sound must not be *able* to play
outside the bus.

**The track enters as a decoded buffer, not through a media element.** This note
originally said the opposite, and the reason was good: `<audio>` streams, so it keeps
the decoded megabytes off the heap. The structure above is what reverses it.

The music has an intro that plays once and a body that loops. `HTMLAudioElement.loop`
restarts at zero and there is no `loopStart`; getting intro-then-loop out of an
element means watching `currentTime` and seeking, which is the drifting, gapping thing
this whole note exists to avoid. `AudioBufferSourceNode` has `loopStart` and
`loopEnd`, does exactly this sample-accurately, and costs no code at all:

```js
source.loop = true;
source.loopStart = 20;   // the body's first bar
source.loopEnd = 76;     // 28 bars later
source.start();          // plays the intro once, then loops the body forever
```

So the buffer is a **requirement of the music**, not a preference. Which makes RAM the
binding constraint rather than a thing to dodge, and that is what decides mono below.
It also aligns this milestone with the next one: layers need buffers too, so the
provisional track and the real soundtrack use the same source node.

### The last node is a curve, not a compressor

`DynamicsCompressorNode` is the obvious node for the end of the chain and it is the
wrong one. Measured with a 440Hz sine through the exact settings that shipped first -
threshold -3, ratio 20, knee 0:

| in | out | |
|---|---|---|
| -24 dBFS | -22.29 | **+1.71** |
| -12 dBFS | -10.29 | **+1.71** |
| -3 dBFS | -1.29 | **+1.71** |

Chrome's implementation applies an implicit **makeup gain**, and it applies it always -
including at -24 dBFS, twenty-one decibels below a threshold it is nowhere near. A node
that raises the peak is not a net. Worse, the makeup is not in the specification, so
compensating for it would mean calibrating against a number another browser is free to
choose differently: the same trap this project rejected MP3 over, one layer down.

A `WaveShaperNode` has none of it. The curve is arithmetic written in `audio.ts`, so it
is identical everywhere, cannot add gain, and is the *identity* below the knee - not
approximately transparent, exactly transparent. Above the knee a tanh bend asymptotes
just under full scale, and because a shaper clamps its input to [-1, 1] before the
lookup, anything arriving over full scale is pinned to the curve's last value. The
ceiling is absolute rather than merely likely.

| in | out | |
|---|---|---|
| -24 dBFS | -24.00 | 0 |
| -6 dBFS | -6.00 | 0 |
| -3 dBFS | -3.00 | 0 |
| -1 dBFS | -1.21 | -0.21 |
| +2.52 dBFS | -0.62 | -3.14 |

## The track

**The file.** Trimmed to `[0, 76.000s)` and shipped in two encodes, no normalisation
and no re-mastering applied - the file stays the master and the mix lives in the bus
gain, so retuning the level is a constant and not a re-encode.

| | | |
|---|---|---|
| `public/soundtrack.webm` | Opus mono 80k | **799 KB** |
| `public/soundtrack.m4a` | AAC mono 128k | 1203 KB, fallback |

80k is the knee of the curve: measured against the source, 48k to 64k buys 2.3 dB and
64k to 80k buys 2.0, while 80k to 96k buys 0.6 for another 160 KB.

**Mono, against the vault note's own rule.** That note says mono for SFX and stereo
for the track, and it was written assuming the track streams. Once the loop structure
forces a decoded buffer, the note's other rule takes over - the one that says RAM is
what limits, not the network - and stereo doubles it: **13.9 MB mono against 27.8**.
The material makes that cheap: L/R correlate at 0.90 and the side channel sits 12.7 dB
under the mid, so there is width but not much of it, and most phones play through one
speaker anyway. Revisit when the stems arrive and the pad wants its width back.

**The outro is cut, not lost.** `[76s, 83.9s)` is a composed ending, which a loop can
never reach. Keeping it in the loop buffer would cost RAM forever for something played
once. If an end-screen sting is wanted later, it gets cut from the master as its own
short file - which is the right shape for it anyway.

**Verified round trip.** Both encodes decode to **exactly 3,648,000 samples** - 76.000000s,
delta zero - in Chrome as well as in ffmpeg. That is the check the vault note demands,
because it is precisely what MP3 cannot promise: with no standard place to record
encoder delay, each browser trims a different amount and `loopStart` stops being
portable. WebM and MP4 both record it, and both survived. Safari is still unverified
and is the reason the AAC fallback is load-bearing rather than decorative: Safari's
`decodeAudioData` has historically accepted a narrower set of formats than its
`<audio>` element, and the buffer path has no element to fall back on.

**Source.** Encoding proceeds from the delivered MP3 rather than waiting for the WAV,
because the graph does not know where the file came from: a re-encode later is a
build-script change and zero code. The lossy generation stacked in the meantime is a
known, temporary cost, taken with eyes open.

**Level, and the peak that is not where the file says it is.** `MUSIC_DB` was wrong
three times, and each wrong value was wrong for a different reason worth keeping.

*-12, by ear.* No measurement at all. Off by 5 dB.

*-4, from the source file's peak.* The brief asked for -18 LUFS and ~-6 dBTP; the body
reads -17.4 LUFS at -0.1 dBTP, so loudness was on target and only the peak was hot.
Since only 0.013% of samples pass -3 dBFS - eleven milliseconds across the track -
honoring loudness looked obviously right, with the trim derived from the limiter.

*-7, from the **decode**.* The step that was missing: the graph never sees the file,
it sees what `decodeAudioData` returns, and a lossy codec does not preserve peaks. The
delivered Opus decodes to a buffer peaking at **+2.52 dBFS** - above full scale - from
a source that measured -0.1. Material mastered with no headroom overshoots coming out
the other side, and the trim has to be derived from the number the graph will actually
handle. Nothing was ever going to clip, because Web Audio is float end to end and the
trim comes first; but the reasoning was calibrated against the wrong artifact.

So `MUSIC_DB` is **-7**: the ceiling bends at -3 dBFS, and -7 puts the music's loudest
sample at **-4.48 dBFS**, measured, with zero samples reaching the knee. The ceiling
stays inert until the SFX give it something to do, which is what a net is for.

The cost is loudness: the body lands near -24.4 LUFS where the brief asked for -18.
Those cannot both be had, because the delivery carries ~20 dB of crest against the 12
its pair of numbers implied. Not clipping wins, -24 LUFS is an ordinary bed level under
game audio, and this is the first knob to revisit if it reads quiet on a phone. **When
the WAV master arrives, encode it with a few dB of headroom** and the overshoot stops
being a thing to work around.

Gains are set in dB and applied with `setTargetAtTime`, never by writing `gain.value`,
which steps the amplitude and clicks.

## The gesture, and what it does not drag in

An `AudioContext` is born suspended and only resumes inside a real gesture handler.
The game enters straight into the first frame and has no title screen, and the vault
note's position is that audio forces one.

**It does not force one here.** A `once` listener on the first `pointerdown` or
`keydown` unlocks the context, and the audio button in the top band is the visible
control and the fallback. What that costs is a wave 1 that runs silent if the player
touches nothing for the first five seconds, which is a real cost and a small one -
and the roadmap already listed a start screen as out of scope in v1.4, so letting it
in through the audio door would be scope arriving sideways. The honest place to
revisit it is the SFX milestone: silence-until-first-tap stops being a curiosity when
every shot is supposed to make a noise.

Lifecycle, which is where audio disappears on a phone:

- `visibilitychange` suspends and resumes the context. Without it the game plays over
  whatever the player switched to, and burns battery doing it.
- `onstatechange` is the source of truth, rather than assuming `resume()` worked.
- Safari has an `interrupted` state - a call, another app taking the session - that is
  not `suspended`, and coming back from it can need a fresh gesture. The mute button
  is that gesture, which is the cheap reason it doubles as a resume.
- `navigator.audioSession.type = 'playback'` where it exists, which is what survives
  the iPhone's silent switch.

**Pause does not stop the music.** Pause in this game is for planning, and the brief's
own BED layer is defined as the thing that plays alone between waves. A pause that
also kills the sound reads as a bug. Hiding the tab does stop it; that is a different
question with a different answer.

## The control

A third button beside `FS` and `LOCK`, in the same bracketed `[x]` / `[ ]` vocabulary
as the console's collapse and the build drawer. It carries a **glyph rather than a
word**: sound has a symbol everyone already knows and fullscreen and the orientation
lock do not.

### The row became a drawer, because a third button broke it

Shipped as a row, the three buttons covered the wave indicator on a phone. The
arithmetic says why, and says it was inevitable: the status glyphs are **centered** and
the tools are **anchored right**, so every control added to the row walks toward the
readings. On the 390px reference phone the glyphs run 112 to 278 with `Lv N` at
230-265; two buttons put the row's left edge at 286 and cleared them, three put it at
238 and covered 27 of the wave indicator's 35 pixels.

Moving the row up - the first thing asked for - would not have fixed it. The band is
81px and the portrait spec budgets it as **one 44px row**, so lifting the tools out of
the glyphs' line means spending the band twice and leaves them under the notch in
browser mode.

So they collapse instead, behind a gear, as a column growing **down** out of it: the
mirror of the build menu, which is a column growing up out of a toggle in the opposite
corner. Shut, the band's footprint is one 44px button **on every device regardless of
which controls exist**, and the collision cannot come back the next time something is
added. Open, the column clears the core by 61px on the turned board.

Shut by default, unlike the build menu, which opens with the game: these are set once
a session or not at all, and the menu's reason for standing open - that building three
towers should not cost three reopenings - has no equivalent. That costs the sound
button its second job, though: shut, `SND` is no longer the visible `[ ]` that doubled
as this game's only start affordance. It survives because any tap anywhere resumes the
context, so the affordance is weaker rather than gone.

A beamed pair of eighth notes, drawn as whole pixels for the reason the HUD's heart is
- a glyph built that way belongs to the same art as the board, where one from an icon
font looks like it wandered in from another program. That builder came out of `hud.ts`
into `glyph.ts` the second time it was needed rather than being copied.

Two numbers in it were settled by looking rather than by taste. **The beam is one
pixel, not two**: a two-pixel beam was the first draft and reads top-heavy at the size
this renders, like a staple. And the glyph is **eight rows because that is the space
available** - a taller one pushes the button past the row's height, and the row is a
flex box, so it would take `FS` and `LOCK` up with it.

**The gear is generated, not drawn, and it is 16x16 where the note is 7x8.** Eight by
eight was the first attempt, to match the note's exact 2x, and it cannot hold a gear:
hand-drawn candidates read as a dumbbell, a flower and a spool, and the verdict from
the person looking at it was that none of them looked like one. A gear needs a ring, a
hub and teeth, and three concentric features do not fit in four pixels of radius. So
the gear is sixteen rows at **1x** - still integer, still sixteen device pixels tall,
four times the detail. Two glyphs, two internal resolutions, one footprint, which is
the right way round: the note is a silhouette and wants chunk, the gear is a ring and
wants pixels. Its shape is polar arithmetic rather than a drawing, because tuning a
gear by hand means moving thirty pixels to change one radius.

**The note is sized in pixels, not ems, and that is the interesting part.** At the `1.25em`
it started as, eight rows landed in 15px - a scale of 1.875 - and rasterising it
showed the damage: the one-pixel beam came out two pixels thick and the stems
alternated full and half coverage down their length. `shape-rendering: crispEdges`
snaps edges; it cannot invent a grid. At a flat `16px` the scale is exactly 2.00 and
every source pixel lands on a clean 2x2 block. This is the board renderer's own rule -
integer scaling in device pixels - arriving in the chrome, where nothing had been
enforcing it.

Which turned up something not fixed here: **the HUD's heart renders at 2.133x**
(`0.8em` over six rows) and has the same mush. It is a one-line change to `12px` and a
0.8px difference to look at, but it is the HUD in an audio milestone, so it is recorded
rather than taken.

**The row got renamed, because the sound button made its name wrong.** `phone.ts`
described itself as "two buttons that are about the phone rather than about the game",
and a sound toggle is not about the phone. It is now `top-tools.ts`: the controls that
belong to the session rather than to the run - how the screen behaves, and whether
there is sound - set once and then forgotten, which is why they sit in the hardest
corner of a tall phone to hit by accident.

The rename fixed a real bug and not only a label. Fullscreen and the lock are both
feature-detected, and **on an iPhone neither exists**, so the old module returned
before creating the row at all. That would have put no sound button on the one
platform where it is load-bearing: iOS is where the silent switch lives, and where a
phone call drops the context into a state that needs a fresh gesture to leave. Sound
is last in the row so that the one control which renders everywhere sits in the same
place on every device, with the two conditional ones falling away to its left.

**`[x]` means sound is coming out, which is stricter than "not muted".** A context
that has never seen a gesture, or that Safari has interrupted, is silent while nothing
is muted at all; showing `[x]` there would be a lie, and would hide the one control
that can fix it. So the reading is `running && !muted`, and a press always does the
obvious thing to the state being shown - unmute *and* resume when dark, mute when lit.
That is what makes the button double as the re-arm, at no extra surface.

A consequence worth naming rather than tolerating: on a fresh load it reads `[ ]`,
because it is telling the truth about a context nobody has unlocked yet. **That makes
it the nearest thing the game has to a start affordance**, which is convenient for a
milestone that deliberately refused to add a start screen - and it rights itself
untouched, since any first tap anywhere resumes the context.

Its state persists in `localStorage`, which is the **first** in the project. That is
worth noting rather than sliding in: it is the seam where "Settings (sound toggle)
once audio exists" from the Idea Bank actually lands, and where local high scores
would later plug in. It also does real work beyond remembering a preference - a run
that starts muted never fetches the track at all, so **799 KB of someone's data is not
spent on audio they have said they do not want**. Unmuting later is a state change like
any other, so a player who changes their mind gets the download then.

## PWA delivery

- **Not in the precache, and already not.** The worry was that Workbox precaches the
  whole `dist`, so a 1.66 MB file would stall the install and, on a failed fetch,
  reject the `addAll` and take the whole service worker down. Checked rather than
  assumed: `vite-plugin-pwa`'s default `globPatterns` covers `js,css,html,ico,png,svg`,
  so `.webm` and `.m4a` were never matched. The build confirms it - 7 precache entries,
  54 KiB, no audio. What is still owed is the other half: a runtime `CacheFirst` route,
  without which the installed game is silent offline.
- **No range requests.** The earlier draft budgeted for Workbox's `RangeRequestsPlugin`,
  because a media element asks for byte ranges and expects `206` and a handler
  returning the whole cached body with a `200` breaks seeking. Choosing the decoded
  buffer removed the entire class: `fetch` plus `decodeAudioData` pulls the file whole
  and issues no range request at all. One consequence of the source-node decision,
  cashed in two sections later.
- **Versioning.** Audio does not change per deploy: hashed filename, long cache. The
  shell is what rotates.
- **Offline.** An installed game that goes silent without a network is not an installed
  game. The runtime cache is what makes the second run offline-complete, and the first
  run is allowed to be quiet.

## Master files, and where they live

The vault note's rule is lossless master in the repo, deliveries generated from it at
build time. A 1:25 stereo WAV at 48kHz/24-bit is ~24 MB, which does not belong in git
without LFS for a project whose entire `dist` is 81 KB. So the rule bends here: the
repo carries the encoded deliveries, and the masters live outside it with a pointer.
Recorded as a deviation, not as the plan.

## Credit and licence

The brief treats this as blocking before any code lands, and the repo is public with
the game live as a portfolio piece. Two artifacts owed: a line in the README, and
somewhere in the game itself. There is no `about` surface today, so where that line
lives is a decision this milestone has to make rather than inherit.

## How it gets tested

Not "does it sound good", but most of what breaks is not aesthetic:

- The dB-to-linear gain mapping is a pure function. Extremes and midpoint, in the
  existing `npm test`, same as the wave economy.
- `OfflineAudioContext` renders deterministically and faster than real time, so "the
  master must not clip" becomes an assertion about samples rather than a sentence in
  this note. That is worth having in place before the SFX milestone, which is when
  forty simultaneous kills make it a real question.

## Deliberately not in scope

- **The four adaptive layers.** The whole reason the graph is built the way it is, and
  it cannot start until stems exist. Vertical layering by pressure threshold is the
  next milestone.
- **SFX.** Synthesized, per the vault note's line - synthesis for what repeats,
  production for what happens once. Its own milestone, after the layers, because
  polyphony (voice cap, retrigger floor, pitch jitter) is a genuine subsystem and not
  a corner of this one.
- **A start screen.** See above: revisited when SFX make it matter.
- **A settings panel, or a volume slider.** One toggle is the whole surface this
  milestone needs. A slider is a curve decision and a layout decision, and neither is
  ready.
