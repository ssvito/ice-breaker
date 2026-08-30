import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countdownSeconds,
  createSpawner,
  earlyCallBonus,
  EARLY_CALL_RATE,
  nextWavePreview,
  stepSpawner,
  waves,
} from '../src/wave.ts';
import { createEnemy, ENEMY_KINDS, enemyStats, enemyTraits } from '../src/enemy.ts';
import type { EnemyKind } from '../src/enemy.ts';
import { STARTING_CYCLES, TICK_MS } from '../src/game.ts';
import { MAX_TIER, towerStats } from '../src/tower.ts';
import type { TowerKind } from '../src/tower.ts';

/**
 * The curve makes promises in prose - every kind gets a wave to itself first,
 * groups inside a wave overlap, a wave spawns what it says it spawns. Prose drifts
 * from data the first time someone retunes a number, so the promises are gated
 * here instead.
 */

/** Runs one wave to the end of its spawning and records what came out, and when. */
function spawnWave(waveNumber: number): { kind: EnemyKind; atMs: number }[] {
  const spawner = createSpawner();
  const spawned: { kind: EnemyKind; atMs: number }[] = [];

  let elapsedMs = 0;
  // Eight simulated minutes, up from three when the curve went to fifteen waves: this
  // walks every wave before the one it wants, and the lulls alone are now about two of
  // those minutes. The old cap did not fail loudly - it ran out mid-wave-15 and reported
  // a wave spawning seven of the eight sniffers it declares, which reads as a bug in the
  // spawner rather than as a stopwatch running out.
  for (let tick = 0; tick < 60 * 60 * 8; tick++) {
    for (const kind of stepSpawner(spawner, TICK_MS)) {
      if (spawner.waveIndex === waveNumber - 1) spawned.push({ kind, atMs: elapsedMs });
    }
    elapsedMs += TICK_MS;
    if (spawner.waveIndex >= waveNumber) break;
  }

  return spawned;
}

test('a wave spawns exactly the enemies it declares', () => {
  waves.forEach((wave, index) => {
    const spawned = spawnWave(index + 1);

    for (const group of wave.groups) {
      const got = spawned.filter((entry) => entry.kind === group.enemyKind).length;
      const declared = wave.groups
        .filter((other) => other.enemyKind === group.enemyKind)
        .reduce((total, other) => total + other.count, 0);
      assert.equal(got, declared, `wave ${index + 1} spawned ${got} ${group.enemyKind}, declared ${declared}`);
    }

    assert.equal(
      spawned.length,
      wave.groups.reduce((total, group) => total + group.count, 0),
      `wave ${index + 1} spawned a different number of enemies than it declares`,
    );
  });
});

test('groups inside a wave run concurrently, not in a queue', () => {
  // The reason `startMs` exists: Trojans arriving *while* the Worms are still
  // streaming is a different problem from Trojans arriving after them.
  const mixed = waves.findIndex((wave) => wave.groups.length > 1 && wave.groups.some((group) => group.startMs));
  assert.notEqual(mixed, -1, 'the curve should contain at least one wave with an offset group');

  const spawned = spawnWave(mixed + 1);
  const opener = waves[mixed].groups[0].enemyKind;
  const late = waves[mixed].groups.find((group) => group.startMs)!;

  const lastOpener = Math.max(...spawned.filter((e) => e.kind === opener).map((e) => e.atMs));
  const firstLate = Math.min(...spawned.filter((e) => e.kind === late.enemyKind).map((e) => e.atMs));

  assert.ok(
    firstLate < lastOpener,
    `wave ${mixed + 1}: the offset group starts at ${firstLate}ms, after the opener finished at ${lastOpener}ms - that is a queue, not a mix`,
  );
});

test('every kind gets a wave to itself before it turns up in a mix', () => {
  const introduced = new Set<EnemyKind>();

  waves.forEach((wave, index) => {
    const kinds = new Set(wave.groups.map((group) => group.enemyKind));
    const fresh = [...kinds].filter((kind) => !introduced.has(kind));
    // The finale is the one exception, and a narrow one: the rule exists so a kind
    // is understood before it arrives under load, and the last wave has nothing
    // left to teach for. It still may not introduce more than one kind, and its
    // escort still has to be kinds the player already knows.
    const isFinale = index === waves.length - 1;

    if (isFinale) {
      assert.ok(fresh.length <= 1, `the finale introduces ${fresh.length} new kinds; one boss is the limit`);
      return;
    }

    for (const kind of fresh) {
      assert.equal(
        kinds.size,
        1,
        `wave ${index + 1} introduces ${kind} alongside ${[...kinds].filter((k) => k !== kind).join(', ')} - a kind's first wave has to be its own`,
      );
      introduced.add(kind);
    }
  });

  // The Encryptor is the exception, and it is exempt for a reason worth asserting
  // rather than commenting: it is never spawned by a wave at all, only born from a
  // Ransomware splitting - so the wave that introduces Ransomware alone is also the
  // wave that introduces it, with nothing else on the board.
  assert.ok(!introduced.has('encryptor'), 'the Encryptor should have no group of its own anywhere in the curve');
  const ransomwareWave = waves.findIndex((wave) => wave.groups.some((group) => group.enemyKind === 'ransomware'));
  assert.equal(waves[ransomwareWave].groups.length, 1, 'the wave that introduces Ransomware must be Ransomware alone');
  assert.deepEqual(enemyTraits('ransomware').splitsInto, ['encryptor', 'encryptor']);
});

test('each scaling axis moves its own stat, and neither moves the bounty', () => {
  // This assertion used to read "the toughness ramp moves HP and nothing else", and half
  // of it was a statement about a curve with one axis rather than about the design. The
  // half that survives any number of axes is the bounty: a harder wave must not also be
  // a richer one, because counts are the economy and scaling is how a wave gets harder
  // without being paid for. The half that had to go said speed never moves, which the
  // speed axis contradicts on purpose - so it is replaced by the stronger claim, that
  // each axis moves its own stat and leaves the other alone.
  const plain = createEnemy('worm');
  const tougher = createEnemy('worm', { hp: 2.75, speed: 1 });
  const faster = createEnemy('worm', { hp: 1, speed: 1.3 });
  const stats = enemyStats('worm');

  assert.equal(plain.maxHp, stats.maxHp);
  assert.equal(plain.speed, stats.speed);

  assert.equal(tougher.maxHp, Math.round(stats.maxHp * 2.75));
  assert.equal(tougher.hp, tougher.maxHp, 'a scaled enemy starts full');
  assert.equal(tougher.speed, plain.speed, 'the HP axis is HP');

  assert.equal(faster.speed, stats.speed * 1.3);
  assert.equal(faster.maxHp, plain.maxHp, 'the speed axis is speed');

  assert.equal(tougher.reward, plain.reward, 'a harder wave must not also be a richer one');
  assert.equal(faster.reward, plain.reward, 'nor a faster one');
  assert.equal(createEnemy('packetSniffer', { hp: 0.1, speed: 1 }).maxHp, 1, 'nothing scales below one HP');
});

test('every kind in the roster has somewhere in the run to be met', () => {
  // Three kinds sat in `ENEMY_STATS` with sprites, traits and tests for a whole step
  // without appearing in a single wave, which was the plan and was still invisible from
  // everywhere except this file. A kind nobody can meet is content that does not exist,
  // and the failure mode is silence: nothing throws, nothing looks wrong, the run is
  // just missing a question it was built to ask.
  const spawned = new Set(waves.flatMap((wave) => wave.groups.map((group) => group.enemyKind)));
  const born = new Set(ENEMY_KINDS.flatMap((kind) => enemyTraits(kind).splitsInto ?? []));

  for (const kind of ENEMY_KINDS) {
    assert.ok(
      spawned.has(kind) || born.has(kind),
      `${kind} is in the roster and in no wave - nothing in a run can produce one`,
    );
  }
});

/** Everything a wave pays if nothing leaks, split children included. */
function wavePayout(kinds: EnemyKind[]): number {
  return kinds.reduce((total, kind) => {
    const children = enemyTraits(kind).splitsInto ?? [];
    return total + enemyStats(kind).reward + children.reduce((sum, child) => sum + enemyStats(child).reward, 0);
  }, 0);
}

/** Cost of taking one kind from empty tile to MAX_TIER. */
function ladderCost(kind: TowerKind): number {
  let total = 0;
  for (let tier = 1; tier <= MAX_TIER; tier++) total += towerStats(kind, tier).cost;
  return total;
}

test('a flawless run can top out some towers and not all of them', () => {
  // The economy rule the whole milestone is sized against, computed from the curve
  // rather than from a comment that can go stale: play perfectly, leak nothing, and
  // the ladder is still a choice about which towers, not a shopping list.
  const payout = waves.reduce(
    (total, wave) => total + wave.groups.reduce((sum, group) => sum + group.count * wavePayout([group.enemyKind]), 0),
    0,
  );
  const purse = STARTING_CYCLES + payout;

  const kinds: TowerKind[] = ['firewallNode', 'aesTurret', 'idsScanner', 'honeypot'];
  const ladders = kinds.map(ladderCost).sort((a, b) => b - a);
  const allFour = ladders.reduce((total, cost) => total + cost, 0);
  const twoDearest = ladders[0] + ladders[1];

  assert.ok(
    purse < allFour,
    `a perfect run banks ${purse} and topping out all four costs ${allFour} - the curve pays for the whole ladder, so there is no choice left in it`,
  );
  assert.ok(
    purse > twoDearest,
    `a perfect run banks ${purse} and the two dearest ladders cost ${twoDearest} - nothing can be topped out, so the tiers are decoration`,
  );
});

test('the preview reads the wave that is coming, from the moment the last one stops spawning', () => {
  const spawner = createSpawner();

  const opening = nextWavePreview(spawner);
  assert.ok(opening, 'the run opens on a countdown, so there is a wave to preview');
  assert.equal(opening.number, 1, 'before the first wave, the preview is the first wave');
  assert.equal(opening.total, waves.length);

  const seen = new Set<number>();
  let sawSpawningWithoutPreview = false;

  for (let tick = 0; tick < 60 * 60 * 8; tick++) {
    stepSpawner(spawner, TICK_MS);
    const preview = nextWavePreview(spawner);

    // Inverted by overlapping waves, and deliberately kept as an assertion rather than
    // deleted: while a wave is still *spawning* there is nothing to decide about the
    // next one, and the moment it stops, there is - which is the window the port and
    // the console are both reading. What went away is the long dead stretch after it,
    // where a wave was on the board, a countdown was not running, and the console had
    // nothing to say about a decision the player was already able to make.
    if (spawner.state === 'spawning') {
      assert.equal(preview, null, `wave ${spawner.waveIndex + 1} is still spawning; nothing to preview yet`);
      sawSpawningWithoutPreview = true;
      continue;
    }
    if (!preview) continue;

    // The preview is always one ahead of the wave that just finished.
    assert.equal(preview.number, spawner.waveIndex + 2);
    assert.ok(preview.countdownMs >= 0, 'a countdown never reads negative');
    seen.add(preview.number);

    const wave = waves[preview.number - 1];
    assert.equal(
      preview.composition.reduce((total, entry) => total + entry.count, 0),
      wave.groups.reduce((total, group) => total + group.count, 0),
      `the preview of wave ${preview.number} does not add up to what it spawns`,
    );
    assert.equal(
      new Set(preview.composition.map((entry) => entry.kind)).size,
      preview.composition.length,
      `the preview of wave ${preview.number} lists a kind twice instead of merging its groups`,
    );
    assert.equal(preview.scale.hp, wave.hpScale ?? 1);
    assert.equal(preview.scale.speed, wave.speedScale ?? 1);
  }

  assert.ok(sawSpawningWithoutPreview, 'the walk should have passed through a wave actually spawning');
  assert.equal(seen.size, waves.length, 'every wave in the curve should get previewed on the way past');
});

test('every surface that shows the countdown reads the same number', () => {
  // The console prints it, the spawn port lights one pip per second of it, and the early
  // call pays for it. They agree because they call one function, and this is the gate on
  // that staying true - a port showing 8 beside a button offering 7 is a small lie, and
  // a small lie about a number is what makes a player stop believing the rest of them.
  for (const ms of [-500, 0, 1, 999, 1000, 1001, 4500, 8000]) {
    assert.equal(earlyCallBonus(ms), countdownSeconds(ms) * EARLY_CALL_RATE);
    assert.ok(countdownSeconds(ms) >= 0, 'a countdown never reads negative');
  }
  assert.equal(countdownSeconds(-500), 0, 'a countdown past zero reads zero, not minus one');
  assert.equal(countdownSeconds(7001), 8, 'a part-second still owes the player a whole pip');
});
