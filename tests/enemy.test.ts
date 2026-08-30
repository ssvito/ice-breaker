import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnemy, ENEMY_KINDS, enemyStats, enemyTraits, stepEnemy } from '../src/enemy.ts';
import { SPRITE_DEFS } from '../src/sprite-data.ts';

/**
 * The roster's rules, as opposed to the curve's. What a kind *is* is gated here;
 * where it shows up in the run is `tests/wave.test.ts`. See the design note in
 * `docs/Design/Roster.md` - a kind that asks no question of its own is content
 * rather than design, and a trait that only half works is worse than no trait.
 */

const PATH = 100;

test('an ordinary kind is slowed by an aura, and a BEACON is not', () => {
  const worm = createEnemy('worm');
  const beacon = createEnemy('beacon');

  stepEnemy(worm, 1000, PATH, 0.5);
  stepEnemy(beacon, 1000, PATH, 0.5);

  assert.equal(worm.distance, enemyStats('worm').speed * 0.5, 'a Worm walks at half speed inside an aura');
  assert.equal(
    beacon.distance,
    enemyStats('beacon').speed,
    'a BEACON walks its own speed inside an aura - the whole reason the kind exists',
  );
});

test('fixed movement ignores anything done to the enemy, not just the slows that exist today', () => {
  // The trait is written as "its speed is its own", so a multiplier that speeds an
  // enemy up has to bounce off it too. Nothing produces one yet; the point of gating
  // it now is that the day something does, this test is what says whether it was
  // meant to apply. See the note on `stepEnemy`.
  const hasted = createEnemy('beacon');
  stepEnemy(hasted, 1000, PATH, 3);
  assert.equal(hasted.distance, enemyStats('beacon').speed);
});

test('fixed movement does not exempt a kind from the curve', () => {
  // `hpScale` is a birth-time stat and `speedMultiplier` is a per-tick effect, and the
  // trait only ever touches the second. A wave that makes a BEACON tougher still does.
  const scaled = createEnemy('beacon', 2);
  assert.equal(scaled.maxHp, enemyStats('beacon').maxHp * 2);
  assert.equal(scaled.hp, scaled.maxHp);
});

test('every enemy kind has a sprite to draw it with', () => {
  // `render.ts` casts `enemy.kind as SpriteName` in three places and nothing checks the
  // sprite is really there, so a kind added without art compiles clean and throws at
  // draw time - in the wave that introduces it, in front of the player. This is that
  // check, and it costs one assertion instead of a startup gate on a hot path.
  for (const kind of ENEMY_KINDS) {
    const def = SPRITE_DEFS[kind];
    assert.ok(def, `enemy kind "${kind}" has no sprite in sprite-data.ts`);
    assert.ok(def.frames.length > 0, `enemy kind "${kind}" has a sprite with no frames`);
  }
});
