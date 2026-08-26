import test from 'node:test';
import assert from 'node:assert/strict';
import { VIRTUAL_TILE, boardRect, clientToWorld, fitViewport } from '../src/canvas.ts';
import type { Viewport } from '../src/canvas.ts';
import { level1 } from '../src/map.ts';

/**
 * The viewport is the one piece of the renderer that can be tested without a canvas:
 * fitting and hit-testing are arithmetic over four numbers, and the only DOM they
 * touch is a width, a height and a device pixel ratio. Which is worth exercising,
 * because v1.4 gave that arithmetic a second branch - the board turns a quarter turn
 * when the window is upright - and the branch has to be provably invisible to the
 * landscape layout every earlier milestone was tuned against.
 */

/** A Viewport with the world canvases stubbed out; nothing under test draws. */
function makeViewport(cssW: number, cssH: number, dpr: number): Viewport {
  (globalThis as any).window = { innerWidth: cssW, innerHeight: cssH, devicePixelRatio: dpr };
  const display = {
    style: {},
    width: 0,
    height: 0,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  } as unknown as HTMLCanvasElement;

  const vp: Viewport = {
    display,
    ctx: { imageSmoothingEnabled: false } as unknown as CanvasRenderingContext2D,
    world: null as unknown as HTMLCanvasElement,
    worldCtx: null as unknown as CanvasRenderingContext2D,
    virtualWidth: level1.cols * VIRTUAL_TILE,
    virtualHeight: level1.rows * VIRTUAL_TILE,
    scale: 1,
    rotated: false,
    offsetX: 0,
    offsetY: 0,
    dpr: 1,
  };
  fitViewport(vp);
  return vp;
}

/** Where a world point lands on screen, in client px - present()'s matrix, forwards. */
function project(vp: Viewport, tileX: number, tileY: number): { x: number; y: number } {
  const wx = tileX * VIRTUAL_TILE;
  const wy = tileY * VIRTUAL_TILE;
  const device = vp.rotated
    ? { x: vp.offsetX + vp.scale * wy, y: vp.offsetY + (vp.virtualWidth - wx) * vp.scale }
    : { x: vp.offsetX + vp.scale * wx, y: vp.offsetY + vp.scale * wy };
  return { x: device.x / vp.dpr, y: device.y / vp.dpr };
}

test('landscape windows never turn the board', () => {
  const windows = [
    [1920, 1080, 1],
    [1440, 900, 2],
    [1280, 720, 1],
    [844, 390, 3], // the same phone, lying down
    [900, 600, 1.5],
    [400, 240, 1], // below 1x, where the scale goes fractional
  ];

  for (const [cssW, cssH, dpr] of windows) {
    const vp = makeViewport(cssW, cssH, dpr);
    assert.equal(vp.rotated, false, `${cssW}x${cssH}@${dpr} should not rotate`);

    // Exactly the pre-v1.4 formula, so the branch is provably invisible here.
    const fit = Math.min(vp.display.width / vp.virtualWidth, vp.display.height / vp.virtualHeight);
    const scale = fit >= 1 ? Math.floor(fit) : fit;
    assert.equal(vp.scale, scale);
    assert.equal(vp.offsetX, Math.round((vp.display.width - vp.virtualWidth * scale) / 2));
    assert.equal(vp.offsetY, Math.round((vp.display.height - vp.virtualHeight * scale) / 2));
  }
});

test('an upright phone turns the board and gets the landscape tile size back', () => {
  const vp = makeViewport(390, 844, 3); // the spec's reference phone

  assert.equal(vp.rotated, true);
  assert.equal(vp.scale, 4); // against 2 lying down: four times the area, not a quarter

  const rect = boardRect(vp);
  assert.equal(Math.round(rect.width), 384);
  assert.equal(Math.round(rect.height), 683);
  assert.ok(Math.abs((VIRTUAL_TILE * vp.scale) / vp.dpr - 42.67) < 0.01, 'tiles stay 42px');
});

test('a tall window with room for the board as it stands leaves it alone', () => {
  // Taller than wide, so an orientation test would turn it - but turning buys no
  // extra scale step here, and inverting the run's direction for nothing is a cost.
  const vp = makeViewport(1400, 1500, 1);
  assert.equal(vp.rotated, false);
  assert.equal(vp.scale, 2);
});

test('taps invert the blit, turned or not', () => {
  for (const vp of [makeViewport(1280, 720, 1), makeViewport(390, 844, 3)]) {
    for (const tile of [
      { x: 0, y: 0 },
      { x: 4.5, y: 2.5 },
      { x: 15.5, y: 6.5 },
      { x: 16, y: 9 },
    ]) {
      const client = project(vp, tile.x, tile.y);
      const world = clientToWorld(vp, client.x, client.y);
      assert.ok(Math.abs(world.x - tile.x) < 1e-9, `x ${world.x} != ${tile.x}`);
      assert.ok(Math.abs(world.y - tile.y) < 1e-9, `y ${world.y} != ${tile.y}`);
    }
  }
});

test('turned counterclockwise, enemies spawn at the bottom and climb to the core', () => {
  const vp = makeViewport(390, 844, 3);
  const spawn = level1.waypoints[0];
  const core = level1.waypoints[level1.waypoints.length - 1];

  const spawnAt = project(vp, spawn.x + 0.5, spawn.y + 0.5);
  const coreAt = project(vp, core.x + 0.5, core.y + 0.5);

  // Clockwise would swap these, and park the core under the console.
  assert.ok(spawnAt.y > coreAt.y, 'spawn sits below the core on screen');
  assert.ok(coreAt.y < boardRect(vp).height / 2, 'the core sits in the upper half');
});
