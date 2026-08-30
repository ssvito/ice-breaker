import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnemy, damageTaken, ENEMY_KINDS, enemyStats, stepEnemy } from '../src/enemy.ts';
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
  // The wave's scaling is a birth-time stat and `speedMultiplier` is a per-tick effect,
  // and the trait only ever touches the second. A wave that makes a BEACON tougher or
  // faster still does both.
  const scaled = createEnemy('beacon', { hp: 2, speed: 1 });
  assert.equal(scaled.maxHp, enemyStats('beacon').maxHp * 2);
  assert.equal(scaled.hp, scaled.maxHp);
});

test('the wave speed axis reaches the one kind defined to ignore speed effects', () => {
  // The trap [Roster](../docs/Design/Roster.md) wrote down a step before the axis was
  // built: a wave speed axis written as a per-tick multiplier passes through exactly the
  // parameter a BEACON refuses, and the kind walks out of the difficulty curve without
  // anybody noticing - it just quietly stops getting harder. Born at 1.3x and slowed to
  // half in the same breath, it has to come out at 1.3x: the curve applies, the aura
  // does not.
  const fast = createEnemy('beacon', { hp: 1, speed: 1.3 });
  assert.equal(fast.speed, enemyStats('beacon').speed * 1.3, 'the curve sets what a BEACON is');

  stepEnemy(fast, 1000, PATH, 0.5);
  assert.equal(
    fast.distance,
    enemyStats('beacon').speed * 1.3,
    'a BEACON in an aura on a fast wave walks the fast wave, not the aura',
  );
});

test('armor is subtracted per hit, and the floor is zero rather than one', () => {
  // The whole design of the kind is in these four numbers: a tier-1 Firewall Node deals
  // 1 and a tier-3 AES Turret deals 11, so armor 1 erases the first entirely and costs
  // the second nine percent. A floor of one would have made both of them work.
  assert.equal(damageTaken('packer', 1), 0, 'chip damage does nothing to a PACKER');
  assert.equal(damageTaken('packer', 2), 1, 'a tier-2 Firewall Node gets half of its shot through');
  assert.equal(damageTaken('packer', 11), 10, 'a tier-3 AES Turret barely notices');
  assert.equal(damageTaken('worm', 1), 1, 'a kind without the trait takes the whole hit');
});

test('a hit can never heal, whatever the armor is', () => {
  // `hp -= damageTaken(...)` is the one place damage lands, so a negative result here
  // would not be a small error - it would be armor that repairs the enemy it protects.
  for (const kind of ENEMY_KINDS) {
    assert.ok(damageTaken(kind, 0) >= 0, `${kind} healed from a zero-damage hit`);
    assert.ok(damageTaken(kind, 1) >= 0, `${kind} healed from a one-damage hit`);
  }
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
