import test from 'node:test';
import assert from 'node:assert/strict';
import { SPRITE_DEFS } from '../src/sprite-data.ts';

/**
 * Invariants between sprites, as opposed to inside one. The generator already checks
 * that every frame is exactly the declared width and height and throws if it is not;
 * what it cannot see is a sprite that has to line up with another one.
 */

test('the armed spawn port covers the plain one completely', () => {
  // The plain port is painted once into the prerendered board and the armed port is
  // drawn over it every frame. That only works while the armed one is opaque everywhere
  // the plain one is: a single transparent pixel here is the old port showing through
  // the new one, which would read as a rendering fault rather than as a state.
  const port = SPRITE_DEFS.spawnPort;
  const call = SPRITE_DEFS.spawnPortCall;

  assert.equal(call.w, port.w, 'the two ports must be the same width to line up at all');
  assert.equal(call.h, port.h, 'and the same height');

  const plain = port.frames[0];
  for (const armed of call.frames) {
    for (let y = 0; y < port.h; y++) {
      for (let x = 0; x < port.w; x++) {
        if (plain[y][x] === '.') continue;
        assert.notEqual(armed[y][x], '.', `armed port is transparent at ${x},${y} where the plain port is not`);
      }
    }
  }
});
