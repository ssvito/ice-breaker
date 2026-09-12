import type { GridPos } from './map.ts';

/** Virtual pixels per grid tile. The world is rendered at this native resolution then scaled up. */
export const VIRTUAL_TILE = 32;

export interface Viewport {
  /** Display canvas that fills the window; the world is blitted onto it letterboxed. */
  display: HTMLCanvasElement;
  /** Display context, device pixels. HUD/overlays draw here at full resolution. */
  ctx: CanvasRenderingContext2D;
  /** Offscreen canvas holding the world at native virtual resolution (cols*32 x rows*32). */
  world: HTMLCanvasElement;
  worldCtx: CanvasRenderingContext2D;
  virtualWidth: number;
  virtualHeight: number;
  /** Device pixels per virtual pixel. Integer when the world fits; fractional only on tiny viewports. */
  scale: number;
  /**
   * True when the world is blitted rotated a quarter turn counterclockwise, so the
   * board's long axis runs along the window's. Set by fitViewport when that wins a
   * bigger scale; everything outside this module keeps working in world coords and
   * never learns it happened.
   */
  rotated: boolean;
  /** Letterbox offset of the world within the display, device pixels. */
  offsetX: number;
  offsetY: number;
  dpr: number;
}

/** Creates the display + offscreen world canvases and sizes them to the viewport. */
export function createViewport(display: HTMLCanvasElement, cols: number, rows: number): Viewport {
  const ctx = display.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  const world = document.createElement('canvas');
  world.width = cols * VIRTUAL_TILE;
  world.height = rows * VIRTUAL_TILE;
  const worldCtx = world.getContext('2d');
  if (!worldCtx) throw new Error('2D world context unavailable');
  worldCtx.imageSmoothingEnabled = false;

  const viewport: Viewport = {
    display,
    ctx,
    world,
    worldCtx,
    virtualWidth: world.width,
    virtualHeight: world.height,
    scale: 1,
    rotated: false,
    offsetX: 0,
    offsetY: 0,
    dpr: 1,
  };
  fitViewport(viewport);
  return viewport;
}

/**
 * Largest blit scale that fits a w x h footprint in the display, in device pixels.
 * Integer keeps pixels crisp; only drop to fractional when the world can't fit even at 1x.
 */
function fitScale(vp: Viewport, w: number, h: number): number {
  const fit = Math.min(vp.display.width / w, vp.display.height / h);
  return fit >= 1 ? Math.floor(fit) : fit;
}

/** Recomputes display size and the integer blit scale/offset/rotation. Call on resize. */
export function fitViewport(vp: Viewport): void {
  const dpr = window.devicePixelRatio || 1;
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;

  vp.display.style.width = `${cssW}px`;
  vp.display.style.height = `${cssH}px`;
  vp.display.width = Math.round(cssW * dpr);
  vp.display.height = Math.round(cssH * dpr);

  // Held upright, a 16x9 board fits at a quarter of the area it gets lying down.
  // Turning it a quarter turn is worth doing exactly when it buys a bigger scale -
  // asked that way rather than as "is the window portrait", a window that is taller
  // than wide but roomy enough for the board as it stands keeps it as it stands,
  // and a landscape window can never take the branch at all.
  const upright = fitScale(vp, vp.virtualWidth, vp.virtualHeight);
  const turned = fitScale(vp, vp.virtualHeight, vp.virtualWidth);
  const rotated = turned > upright;

  vp.rotated = rotated;
  vp.scale = rotated ? turned : upright;
  const { width, height } = displayedSize(vp);
  vp.offsetX = Math.round((vp.display.width - width) / 2);
  vp.offsetY = Math.round((vp.display.height - height) / 2);
  vp.dpr = dpr;
  vp.ctx.imageSmoothingEnabled = false;
}

/** On-screen footprint of the blitted world in device pixels, rotation included. */
export function displayedSize(vp: Viewport): { width: number; height: number } {
  const width = vp.virtualWidth * vp.scale;
  const height = vp.virtualHeight * vp.scale;
  return vp.rotated ? { width: height, height: width } : { width, height };
}

/**
 * The board's on-screen rect in CSS pixels - the letterboxed blit, not the full-window
 * display canvas. DOM chrome that wants to sit against the board rather than against
 * the window needs this, since the two only coincide when nothing is letterboxed.
 */
export function boardRect(vp: Viewport): { left: number; top: number; width: number; height: number } {
  const { width, height } = displayedSize(vp);
  return {
    left: vp.offsetX / vp.dpr,
    top: vp.offsetY / vp.dpr,
    width: width / vp.dpr,
    height: height / vp.dpr,
  };
}

/** Blits the world canvas onto the display, scaled, rotated if needed, letterboxed on black. */
/**
 * Black over the whole display. Every frame starts here, because the world is blitted
 * letterboxed and the band around it is not painted by anything else.
 *
 * Exported because a frame with no world to blit is *only* this: the app can be in a
 * state where no run exists, and a display left holding the last frame of a finished
 * run would be the game's most convincing lie.
 */
export function clearDisplay(vp: Viewport): void {
  const { ctx } = vp;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, vp.display.width, vp.display.height);
}

export function present(vp: Viewport): void {
  const { ctx } = vp;
  clearDisplay(vp);

  if (vp.rotated) {
    // A quarter turn counterclockwise: the world's left edge lands at the bottom of
    // the screen and its right edge at the top, so enemies spawn under the thumb and
    // climb toward the core. Clockwise reads more naturally but parks the core in the
    // bottom band, which is exactly where the console opens over it.
    //
    // Written as an explicit matrix rather than rotate(-Math.PI / 2) on purpose:
    // cos(-PI/2) is 6e-17, not 0, and a hair of skew is enough to resample every
    // pixel of a pixel-art blit.
    ctx.save();
    ctx.setTransform(0, -vp.scale, vp.scale, 0, vp.offsetX, vp.offsetY + vp.virtualWidth * vp.scale);
    ctx.drawImage(vp.world, 0, 0);
    ctx.restore();
    return;
  }

  ctx.drawImage(
    vp.world,
    0,
    0,
    vp.virtualWidth,
    vp.virtualHeight,
    vp.offsetX,
    vp.offsetY,
    vp.virtualWidth * vp.scale,
    vp.virtualHeight * vp.scale,
  );
}

/**
 * Converts a pointer event's client coordinates to continuous grid coords,
 * accounting for the blit offset/scale. Entities sit between tiles, so hit-testing
 * one needs the fractional position that clientToGrid throws away.
 */
export function clientToWorld(vp: Viewport, clientX: number, clientY: number): { x: number; y: number } {
  const rect = vp.display.getBoundingClientRect();
  const deviceX = (clientX - rect.left) * vp.dpr;
  const deviceY = (clientY - rect.top) * vp.dpr;
  const u = (deviceX - vp.offsetX) / vp.scale;
  const v = (deviceY - vp.offsetY) / vp.scale;
  // Inverse of present()'s matrix, so a tap resolves to the tile it visually landed on.
  if (vp.rotated) {
    return { x: (vp.virtualWidth - v) / VIRTUAL_TILE, y: u / VIRTUAL_TILE };
  }
  return { x: u / VIRTUAL_TILE, y: v / VIRTUAL_TILE };
}

/** Converts a pointer event's client coordinates to a grid tile. */
export function clientToGrid(vp: Viewport, clientX: number, clientY: number): GridPos {
  const world = clientToWorld(vp, clientX, clientY);
  return { x: Math.floor(world.x), y: Math.floor(world.y) };
}
