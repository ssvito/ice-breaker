export interface SizedCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Logical (CSS) pixel size of one grid tile, after scale-to-fit. */
  tileSize: number;
}

/**
 * Sizes the canvas to fill the viewport while preserving the level's
 * aspect ratio (landscape-only board), and keeps the backing store
 * scaled to devicePixelRatio so rendering stays crisp.
 */
export function fitCanvasToViewport(
  canvas: HTMLCanvasElement,
  cols: number,
  rows: number,
): SizedCanvas {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  const dpr = window.devicePixelRatio || 1;
  const aspect = cols / rows;

  let cssWidth = window.innerWidth;
  let cssHeight = cssWidth / aspect;
  if (cssHeight > window.innerHeight) {
    cssHeight = window.innerHeight;
    cssWidth = cssHeight * aspect;
  }

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return { canvas, ctx, tileSize: cssWidth / cols };
}
