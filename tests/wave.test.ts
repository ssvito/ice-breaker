import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpawner, nextWavePreview, stepSpawner, waves } from '../src/wave.ts';
import { createEnemy, enemyStats, getSplitKinds } from '../src/enemy.ts';
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
  // Three simulated minutes: this walks every wave before the one it wants, and
  // the whole curve's spawning fits inside two.
  for (let tick = 0; tick < 60 * 60 * 3; tick++) {
    // liveEnemyCount 0 keeps the spawner rolling from wave to wave without a sim.
    for (const kind of stepSpawner(spawner, TICK_MS, 0)) {
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
  assert.deepEqual(getSplitKinds('ransomware'), ['encryptor', 'encryptor']);
});

test('the toughness ramp moves HP and nothing else', () => {
  const scaled = createEnemy('worm', 2.75);
  const plain = createEnemy('worm');
  const stats = enemyStats('worm');

  assert.equal(plain.maxHp, stats.maxHp);
  assert.equal(scaled.maxHp, Math.round(stats.maxHp * 2.75));
  assert.equal(scaled.hp, scaled.maxHp, 'a scaled enemy starts full');
  assert.equal(scaled.reward, plain.reward, 'a harder wave must not also be a richer one');
  assert.equal(scaled.speed, plain.speed, 'the ramp is HP, not speed');
  assert.equal(createEnemy('packetSniffer', 0.1).maxHp, 1, 'nothing scales below one HP');
});

/** Everything a wave pays if nothing leaks, split children included. */
function wavePayout(kinds: EnemyKind[]): number {
  return kinds.reduce((total, kind) => {
    const children = getSplitKinds(kind) ?? [];
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

test('the preview reads the wave that is coming, and only while one is coming', () => {
  const spawner = createSpawner();

  const opening = nextWavePreview(spawner);
  assert.ok(opening, 'the run opens on a countdown, so there is a wave to preview');
  assert.equal(opening.number, 1, 'before the first wave, the preview is the first wave');
  assert.equal(opening.total, waves.length);

  const seen = new Set<number>();
  let sawSpawningWithoutPreview = false;

  for (let tick = 0; tick < 60 * 60 * 5; tick++) {
    stepSpawner(spawner, TICK_MS, 0);
    const preview = nextWavePreview(spawner);

    if (spawner.state === 'spawning' || spawner.state === 'waiting-clear') {
      assert.equal(preview, null, `wave ${spawner.waveIndex + 1} is running; there is nothing to preview`);
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
    assert.equal(preview.hpScale, wave.hpScale ?? 1);
  }

  assert.ok(sawSpawningWithoutPreview, 'the walk should have passed through a wave actually spawning');
  assert.equal(seen.size, waves.length, 'every wave in the curve should get previewed on the way past');
});
