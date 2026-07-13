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
    offsetX: 0,
    offsetY: 0,
    dpr: 1,
  };
  fitViewport(viewport);
  return viewport;
}

/** Recomputes display size and the integer blit scale/offset. Call on resize. */
export function fitViewport(vp: Viewport): void {
  const dpr = window.devicePixelRatio || 1;
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;

  vp.display.style.width = `${cssW}px`;
  vp.display.style.height = `${cssH}px`;
  vp.display.width = Math.round(cssW * dpr);
  vp.display.height = Math.round(cssH * dpr);

  const fit = Math.min(vp.display.width / vp.virtualWidth, vp.display.height / vp.virtualHeight);
  // Integer scale keeps pixels crisp; only drop to fractional when the world can't fit even at 1x.
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  vp.scale = scale;
  vp.offsetX = Math.round((vp.display.width - vp.virtualWidth * scale) / 2);
  vp.offsetY = Math.round((vp.display.height - vp.virtualHeight * scale) / 2);
  vp.dpr = dpr;
  vp.ctx.imageSmoothingEnabled = false;
}

/** Blits the world canvas onto the display, scaled and letterboxed on black. */
export function present(vp: Viewport): void {
  const { ctx } = vp;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, vp.display.width, vp.display.height);
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

/** Converts a pointer event's client coordinates to a grid tile, accounting for the blit offset/scale. */
export function clientToGrid(vp: Viewport, clientX: number, clientY: number): GridPos {
  const rect = vp.display.getBoundingClientRect();
  const deviceX = (clientX - rect.left) * vp.dpr;
  const deviceY = (clientY - rect.top) * vp.dpr;
  const virtualX = (deviceX - vp.offsetX) / vp.scale;
  const virtualY = (deviceY - vp.offsetY) / vp.scale;
  return {
    x: Math.floor(virtualX / VIRTUAL_TILE),
    y: Math.floor(virtualY / VIRTUAL_TILE),
  };
}
