import test from 'node:test';
import assert from 'node:assert/strict';
import { CEILING_KNEE_DB, MUSIC_DB, SOUNDTRACK_PEAK_DBFS, dbToGain } from '../src/audio.ts';

/**
 * Audio is the one system in the project that cannot be checked by looking at it, and
 * most of it cannot be checked here either - a graph needs a browser and a loop needs
 * ears. What is testable is the arithmetic underneath, which is also the part that
 * fails silently: a gain curve that is wrong does not throw, it just makes a mix that
 * feels off in a way nobody can point at.
 *
 * So this file gates the one pure function, the same way `wave.test.ts` gates the
 * economy the prose promises. The "master must not clip" assertion the design note
 * wants needs `OfflineAudioContext`, which Node does not have; it lands with the SFX
 * milestone, where forty simultaneous kills make it a real question rather than a
 * theoretical one.
 */

test('0 dB is unity, and the decade steps are where dB says they are', () => {
  assert.equal(dbToGain(0), 1);
  // 20 dB is a factor of ten, by definition of the unit. If this drifts, the whole
  // mix is being set in some other unit that merely looks like dB.
  assert.ok(Math.abs(dbToGain(-20) - 0.1) < 1e-12);
  assert.ok(Math.abs(dbToGain(-40) - 0.01) < 1e-12);
});

test('-6 dB is half the amplitude, to the precision that claim actually has', () => {
  // Half is at -6.0206 dB; "-6" is the rounding everyone reasons in. Both are
  // asserted because the tolerance is the interesting part: a mix argued in whole
  // dB is carrying ~0.2% of slop per step, which is fine, and worth having written
  // down the first time someone tightens one of these and watches it fail.
  assert.ok(Math.abs(dbToGain(-6.0206) - 0.5) < 1e-6);
  assert.ok(Math.abs(dbToGain(-6) - 0.5) < 0.002);
  assert.ok(Math.abs(dbToGain(-12) - 0.25) < 0.002);
});

test('silence is exactly zero, not merely small', () => {
  // An exponential approach to zero never arrives, so the curve needs a floor. A bus
  // sitting at 1e-7 instead of 0 is not audible, but it is a source still running.
  assert.equal(dbToGain(-60), 0);
  assert.equal(dbToGain(-90), 0);
  assert.equal(dbToGain(-Infinity), 0);
});

test('the curve is monotonic across its useful range', () => {
  let previous = -1;
  for (let db = -59; db <= 6; db++) {
    const gain = dbToGain(db);
    assert.ok(gain > previous, `gain should rise at ${db} dB`);
    previous = gain;
  }
});

test('the music alone never reaches the ceiling', () => {
  /*
   * The brief's headroom section as an assertion rather than a paragraph. This test
   * has now been wrong twice in the same way, which is why it is written against
   * constants instead of numbers: first as "the bus sits at least 6 dB down" (a
   * restatement of a by-ear guess, which the measured value would have failed), and
   * then against the source file's peak rather than the decode's - the graph never
   * sees the file, only what the decoder returns, and lossy decoding overshoots.
   *
   * The invariant underneath both mistakes is the engineering one: the ceiling is
   * meant to be a net for what the SFX will do later, so the music by itself has to
   * stay under its knee. A relation between three constants holds when any of them is
   * retuned, which a bound on one of them does not.
   */
  const musicPeak = SOUNDTRACK_PEAK_DBFS + MUSIC_DB;
  assert.ok(
    musicPeak < CEILING_KNEE_DB,
    `music peaks at ${musicPeak.toFixed(2)} dBFS, at or past the ceiling's ${CEILING_KNEE_DB} dB knee`,
  );
  // And with margin, so an encode that overshoots slightly more does not start
  // bending the music without anyone noticing.
  assert.ok(CEILING_KNEE_DB - musicPeak >= 1, 'less than 1 dB of margin under the knee');
  assert.ok(dbToGain(MUSIC_DB) > 0, 'music bus should not be muted by default');
  // And it must not be trimmed so far that the music is inaudible under the SFX.
  assert.ok(MUSIC_DB > -20, 'a trim past -20 dB is a mute with extra steps');
});

test('the decoded soundtrack overshoots full scale, and the trim is what saves it', () => {
  // Recorded as an assertion because it is the surprising half of the level story: a
  // buffer whose samples exceed 1.0 is fine in float and ruinous at the destination,
  // and the only thing between the two is MUSIC_DB.
  assert.ok(SOUNDTRACK_PEAK_DBFS > 0, 'this file is known to decode above full scale');
  assert.ok(SOUNDTRACK_PEAK_DBFS + MUSIC_DB < 0, 'the trim must bring it back under');
});
