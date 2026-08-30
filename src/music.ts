import type { AudioSystem } from './audio.ts';

/**
 * The soundtrack: one file, fetched late, played once through its intro and then
 * looping its body forever.
 *
 * Separate from `audio.ts` because that module is the desk and this one is a source
 * plugged into it. The separation is not ceremony - when the stems arrive this file
 * becomes the layer crossfader, holding four buffers and ramping four gains, and
 * `audio.ts` will not have to change at all.
 *
 * See [Audio](../docs/Design/Audio.md) for where every number below was measured.
 */

/**
 * The composition, in seconds. The track is 120.000 BPM with a 2.000s bar and an
 * 8.000s phrase, and these two edges land on that grid exactly - which is what lets
 * the loop be two assignments instead of a crossfade.
 *
 *     [0, 20)   intro, 10 bars, plays once
 *     [20, 76)  body, 28 bars, loops forever
 *
 * The outro that followed at 76s is not in the file: a loop can never reach it, so
 * carrying it would cost RAM forever for something played once.
 */
const LOOP_START_S = 20;
const LOOP_END_S = 76;
/** What the encoded file must decode to. Both encodes hit this exactly in Chrome. */
const TRACK_SECONDS = 76;

/**
 * Opus first, AAC second. Not a preference between codecs so much as a hedge on one
 * browser: Safari's `decodeAudioData` has historically accepted a narrower set of
 * formats than its `<audio>` element, and this path has no element to fall back on.
 * Tried in order rather than asked about - `canPlayType` answers "maybe" too often to
 * be worth trusting, and a failed decode is a definitive answer.
 */
const SOURCES = ['soundtrack.webm', 'soundtrack.m4a'];

/**
 * Cache-busting version for the encoded files, moved by hand when they are re-encoded.
 *
 * This exists because of the service worker, not the browser cache. `soundtrack.webm`
 * carries no content hash in its name - it is a hand-built file in `public/`, not
 * something the bundler emits - and the moment a `CacheFirst` route exists, a name
 * that never changes is a file served stale **forever**. Not until the next deploy:
 * forever, because never revalidating is precisely what that route is for.
 *
 * Versioning the request rather than hashing the name, because the file is produced by
 * two ffmpeg commands a person runs, and a hash would have to be computed and then
 * pasted in two places. Deriving it from the build would fail in the other direction:
 * every deploy would re-download 824 KB of music that did not change, which is the
 * thing the cache exists to prevent.
 *
 * So it is a number a human has to remember to move, which is a forgettable step - and
 * the place it stops being forgettable is the encode script the log already records as
 * owed. Bumping this belongs in whatever ends up running ffmpeg.
 */
const TRACK_VERSION = 1;

export interface Music {
  /** Whether the track is loaded and playing. */
  isPlaying(): boolean;
}

/**
 * Arms the soundtrack. Nothing is fetched until the context is actually running and
 * the player has not muted - a muted run should not spend 824 KB of someone's data on
 * audio it will never hear, and a fetch before the first gesture would sit in front of
 * the first frame for a context that cannot play it yet.
 *
 * Unmuting later is a state change like any other, so a player who starts muted and
 * changes their mind gets the download then.
 */
export function startMusic(audio: AudioSystem): Music {
  let source: AudioBufferSourceNode | null = null;
  let loading = false;

  function considerStarting(): void {
    if (source || loading) return;
    if (!audio.isRunning() || audio.isMuted()) return;
    loading = true;
    void load(audio)
      .then((node) => {
        source = node;
      })
      .catch((error) => {
        // A game that will not boot because it could not fetch its music has its
        // priorities backwards. Silence is a supported outcome.
        loading = false;
        if (import.meta.env.DEV) console.warn('[audio] no soundtrack:', error);
      });
  }

  audio.onChange(considerStarting);
  considerStarting();

  return { isPlaying: () => source !== null };
}

async function load(audio: AudioSystem): Promise<AudioBufferSourceNode> {
  const buffer = await decodeFirstAvailable(audio.ctx);
  const source = audio.ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  /*
   * The loop points are positions in a composition, and they only mean anything if
   * the decoder returned the composition that was encoded. That is the failure this
   * project chose its container to avoid: MP3 has nowhere standard to record encoder
   * delay, so each browser trims a different amount and a `loopStart` calibrated on
   * one machine is wrong on another. WebM and MP4 both record it, and Chrome and
   * ffmpeg both return 76.000000s to the sample.
   *
   * A decoder that disagrees anyway gets the whole file as its loop rather than a
   * body loop landing in the wrong bar. Wrong-but-musical beats wrong-and-lurching,
   * and the intro repeating is a thing a listener can name.
   */
  if (Math.abs(buffer.duration - TRACK_SECONDS) < 0.01) {
    source.loopStart = LOOP_START_S;
    // Equal to the buffer's end, so this is what the default would do anyway. Written
    // out because it is a musical decision, and because a file that later grows a tail
    // should not silently start looping through it.
    source.loopEnd = LOOP_END_S;
  } else if (import.meta.env.DEV) {
    console.warn(
      `[audio] expected ${TRACK_SECONDS}s, decoded ${buffer.duration.toFixed(4)}s - looping whole`,
    );
  }

  source.connect(audio.musicBus);
  // No fade in: the file begins at digital silence, so there is no step to smooth,
  // and the intro is written to arrive quietly on its own.
  source.start();
  return source;
}

async function decodeFirstAvailable(ctx: AudioContext): Promise<AudioBuffer> {
  const failures: string[] = [];
  for (const name of SOURCES) {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}${name}?v=${TRACK_VERSION}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // decodeAudioData detaches the buffer it is given, so a failure here consumes
      // this attempt's bytes and the next format has to be fetched fresh anyway.
      return await ctx.decodeAudioData(await response.arrayBuffer());
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(failures.join('; '));
}
