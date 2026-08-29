/**
 * The mixing desk, built before there is anything to mix.
 *
 * Nothing here makes a sound. That is the point of the step: the graph, the gesture
 * unlock and the lifecycle are the parts that are hard to retrofit, and they are the
 * parts that have nothing to do with which file plays. A track connects into
 * `musicBus` in the next step; synthesized voices connect into `sfxBus` a milestone
 * after that; neither has to move anything in here.
 *
 * See [Audio](../docs/Design/Audio.md). The two rules that shaped this module:
 *
 * - **A sound must not be able to play outside a bus.** The mute toggle the Idea Bank
 *   has wanted since before there was sound is a property of the graph - one gain
 *   going to zero - and without a bus it becomes an `if` at every call site that the
 *   first sound added later will forget.
 * - **Gain is set in dB and moved with ramps.** Perception of loudness is
 *   logarithmic, so a linear 0-1 slider dies halfway through its travel; and writing
 *   `gain.value` mid-playback is a step discontinuity, which is a click.
 *
 * Deliberately free of DOM at module scope: `dbToGain` is arithmetic, and the tests
 * run this file on Node with no browser anywhere.
 */

/**
 * Peak of the soundtrack **as decoded**, in dBFS - measured on the AudioBuffer the
 * browser actually hands back, not on the file that was encoded.
 *
 * The distinction still matters, but it is worth a decibel and not the three it was
 * blamed for. This number read **+2.52** while the MP3 was the source, and the note
 * around it said lossy decoding overshoots. It does, by about 0.2 dB. The other 3 came
 * from `ffmpeg -ac 1`, whose stereo-to-mono rematrix preserves **energy** rather than
 * amplitude - it sums at 0.707 per channel, not 0.5, so correlated material comes out
 * 3 dB hot before a codec is involved at all. Downmixing with an explicit
 * `pan=mono|c0=0.5*c0+0.5*c1` is the whole fix.
 *
 * So the WAV master's -1.10 dBFS survives as -0.90 through Opus and -0.84 through AAC,
 * and this is the worse of the two. Nothing decodes above full scale any more, which
 * is what the brief asked for in the first place.
 */
export const SOUNDTRACK_PEAK_DBFS = -0.84;

/** Where the ceiling starts bending. Below this it is mathematically transparent. */
export const CEILING_KNEE_DB = -3;

/**
 * Where the music bus sits. Four values now, and the useful part is that they were
 * wrong for four different reasons: -12 by ear, -4 from the source file's peak, -7
 * from a decode that was 3 dB hot for a reason that had nothing to do with decoding,
 * and now -4 again - the same number, arrived at correctly.
 *
 * Two constraints, and for the first time one value satisfies both.
 *
 * *Peak.* The ceiling bends at -3 dBFS, and -4 puts the music's loudest sample at
 * **-4.90**, measured - 1.9 dB of margin, so the music by itself never touches the
 * nonlinearity and the ceiling stays inert until the SFX give it something to do.
 *
 * *Loudness.* The brief asked for -18 LUFS, and the body lands at **-17.96** at the
 * destination. Note that "at the destination" is doing work: the buffer is mono, and
 * a mono buffer feeding a stereo destination is copied to both channels, which is
 * +3.01 LU by BS.1770. The file measures -16.97.
 *
 * That both fall out of one number is the WAV master's doing rather than this file's.
 * The MP3 carried ~17.4 dB of crest against the 12 the brief's pair implied, so its
 * loudness and its peak could not both be honoured and not clipping won, at -24 LUFS.
 * The WAV comes in at 12.6 dB of crest, which is the ratio the brief described, and
 * the two targets stop fighting.
 */
export const MUSIC_DB = -4;

/** Below this, a gain is just zero - and an exponential approach to zero never arrives. */
const SILENCE_DB = -60;

/**
 * How fast a gain change travels, as the time constant of `setTargetAtTime` (~63% of
 * the way in this many seconds). Fast enough that muting feels immediate, slow enough
 * that the amplitude has no corner in it.
 */
const RAMP_SECONDS = 0.05;

const MUTED_KEY = 'ice-breaker:muted';

/**
 * Decibels to a linear gain multiplier. Pure, and exported because it is the one
 * piece of the audio system that can be asserted about without an audio context -
 * the same reason `canvas.ts` exports its fitting arithmetic.
 */
export function dbToGain(db: number): number {
  if (db <= SILENCE_DB) return 0;
  return 10 ** (db / 20);
}

export interface AudioSystem {
  /** The desk itself, for scheduling against `currentTime` rather than a frame clock. */
  readonly ctx: AudioContext;
  /** Where the track connects in the next step. */
  readonly musicBus: GainNode;
  /** Where synthesized voices connect a milestone after that. */
  readonly sfxBus: GainNode;

  isMuted(): boolean;
  setMuted(muted: boolean): void;
  /**
   * Whether sound would actually come out right now. False before the first gesture,
   * and false again after Safari interrupts the session - which is why the control
   * that reads this is also the control that can fix it.
   */
  isRunning(): boolean;
  /**
   * Ask the context to run. A no-op when it already is, and only reliable from inside
   * a real gesture handler - which is the whole reason the sound button calls it: a
   * press is a gesture, so the control that reports the silence can also end it.
   */
  resume(): void;
  /** Fires whenever `isRunning` or the mute state changes, so a button can redraw. */
  onChange(listener: () => void): void;
}

/** Only Safari implements this, so it is feature detection rather than a polyfill. */
interface AudioSessionCapable {
  audioSession?: { type: string };
}

/**
 * Builds the graph and arms the unlock. Returns null where there is no Web Audio at
 * all, so callers have to say what silence looks like rather than getting it by
 * accident.
 *
 *     source -> musicBus -+
 *                         +-> master -> limiter -> destination
 *               sfxBus ---+
 */
export function createAudio(): AudioSystem | null {
  if (typeof AudioContext !== 'function') return null;

  // 'interactive' asks for the smallest buffer the platform will give. The default,
  // 'balanced', is the right answer for a media player and the wrong one for a sound
  // that has to land with the muzzle flash.
  const ctx = new AudioContext({ latencyHint: 'interactive' });

  const ceiling = createCeiling(ctx);
  ceiling.connect(ctx.destination);

  const master = ctx.createGain();
  master.connect(ceiling);

  const musicBus = ctx.createGain();
  musicBus.gain.value = dbToGain(MUSIC_DB);
  musicBus.connect(master);

  const sfxBus = ctx.createGain();
  sfxBus.connect(master);

  const listeners: (() => void)[] = [];
  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  let muted = readMuted();
  // Straight assignment rather than a ramp: nothing is connected yet, so there is no
  // amplitude to step. Every change after this one ramps.
  master.gain.value = muted ? 0 : 1;

  function applyMute(): void {
    master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, RAMP_SECONDS);
  }

  /**
   * The gesture. `resume()` has to be called inside the handler itself - park it
   * behind an `await` and the gesture has expired by the time the promise settles,
   * which fails as silence and not as an error.
   *
   * Armed while the context is not running and disarmed once it is, rather than
   * fired `once` and forgotten. Safari's `interrupted` state - a phone call, another
   * app taking the audio session - drops a running context back to needing a fresh
   * gesture, and a listener that already spent itself would leave the game
   * permanently silent with no way back.
   */
  let unlock: AbortController | null = null;

  function armUnlock(): void {
    if (unlock) return;
    unlock = new AbortController();
    const resume = (): void => {
      void ctx.resume().catch(() => {});
      // What survives the iPhone's silent switch. Safari defaults to 'ambient',
      // which respects it - and Web Audio, unlike an <audio> element, is muted by it.
      const nav = navigator as Navigator & AudioSessionCapable;
      if (nav.audioSession) nav.audioSession.type = 'playback';
    };
    for (const event of ['pointerdown', 'keydown', 'touchend']) {
      window.addEventListener(event, resume, { signal: unlock.signal });
    }
  }

  function disarmUnlock(): void {
    unlock?.abort();
    unlock = null;
  }

  // The state is asked, never assumed: `resume()` returning is not the same as the
  // context running, and 'interrupted' is a third answer that is not 'suspended'.
  ctx.addEventListener('statechange', () => {
    if (ctx.state === 'running') disarmUnlock();
    else armUnlock();
    notify();
  });
  armUnlock();

  /**
   * Leaving the tab stops the desk. Without this the game plays over whatever the
   * player switched to and spends battery doing it.
   *
   * Only ever resumes a context this suspended itself: a context still waiting for
   * its first gesture must stay waiting, because resuming it here would be a resume
   * outside a gesture, which fails quietly and teaches nothing.
   */
  let suspendedWhileHidden = false;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (ctx.state !== 'running') return;
      suspendedWhileHidden = true;
      void ctx.suspend().catch(() => {});
    } else if (suspendedWhileHidden) {
      suspendedWhileHidden = false;
      void ctx.resume().catch(() => {});
    }
  });

  return {
    ctx,
    musicBus,
    sfxBus,

    isMuted: () => muted,

    setMuted(next: boolean): void {
      if (next === muted) return;
      muted = next;
      applyMute();
      writeMuted(muted);
      // Unmuting is a gesture like any other, and the button that calls this is the
      // documented way back from an interrupted session.
      if (!muted && ctx.state !== 'running') void ctx.resume().catch(() => {});
      notify();
    },

    isRunning: () => ctx.state === 'running',

    resume(): void {
      if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    },

    onChange(listener: () => void): void {
      listeners.push(listener);
    },
  };
}

/**
 * The project's first localStorage. Wrapped because the accessor itself throws in
 * some privacy modes rather than merely returning nothing, and a game that refuses
 * to boot because it could not read a mute flag has its priorities backwards.
 */
function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
  } catch {
    // Not being able to remember the setting is not a reason to refuse to apply it.
  }
}

/**
 * The ceiling: a fixed transfer curve rather than a `DynamicsCompressorNode`.
 *
 * The compressor was the obvious node and it is the wrong one, which measurement is
 * the only way to find out. Chrome's implementation applies an **implicit makeup
 * gain** - a 440Hz sine at -24 dBFS, nowhere near a -3 dB threshold, comes out at
 * -22.29. It adds 1.71 dB to everything, always, including material it is not
 * compressing. A node that raises the peak is not a net, it is a surprise; and
 * because the makeup is not in the spec, compensating for it would mean calibrating
 * against a number another browser is free to choose differently. That is the same
 * trap this project rejected MP3 over.
 *
 * A `WaveShaperNode` has none of that. The curve is arithmetic that this file writes,
 * so it is identical everywhere, cannot add gain, and is exactly transparent below
 * the knee - the curve is the identity there, sample for sample. Above it, a tanh
 * bend that asymptotes just under full scale. And because a shaper clamps its input
 * to [-1, 1] before the lookup, anything arriving over full scale is held at the
 * curve's last value, so the ceiling is absolute rather than merely likely.
 *
 * `4x` oversampling because bending a waveform generates harmonics, and harmonics
 * above Nyquist fold back down as aliasing.
 */
function createCeiling(ctx: AudioContext): WaveShaperNode {
  const shaper = ctx.createWaveShaper();
  const knee = dbToGain(CEILING_KNEE_DB);
  const room = 1 - knee;
  const size = 4096;
  const curve = new Float32Array(size);

  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    const magnitude = Math.abs(x);
    const shaped =
      magnitude <= knee ? magnitude : knee + room * Math.tanh((magnitude - knee) / room);
    curve[i] = Math.sign(x) * shaped;
  }

  shaper.curve = curve;
  shaper.oversample = '4x';
  return shaper;
}
