import { SPRITE_DEFS } from './sprite-data.ts';
import { bakeAtlas, drawSprite } from './sprites.ts';
import type { SpriteName } from './sprites.ts';

/**
 * Dev-only sprite gallery (open with `?gallery`): every sprite and frame at 8x,
 * so art can be eyeballed without playing. Vite reloads the page on edit.
 */
export function renderGallery(container: HTMLElement): void {
  bakeAtlas();

  const ZOOM = 8;
  const pad = 16;
  const labelH = 16;
  const nameCol = 150;

  const entries = Object.keys(SPRITE_DEFS).map((name) => ({ name, def: SPRITE_DEFS[name] }));

  let width = 0;
  let height = pad;
  for (const { def } of entries) {
    const rowW = nameCol + def.frames.length * (def.w * ZOOM + pad);
    width = Math.max(width, rowW);
    height += labelH + def.h * ZOOM + pad;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.display = 'block';
  canvas.style.imageRendering = 'pixelated';
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for gallery');
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = '#0a0e14';
  ctx.fillRect(0, 0, width, height);

  let y = pad;
  for (const { name, def } of entries) {
    ctx.fillStyle = '#e8f9ff';
    ctx.font = '12px monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(`${name}`, pad, y);
    ctx.fillStyle = '#7dffe8';
    ctx.fillText(`${def.w}x${def.h} x${def.frames.length}`, pad, y + labelH);

    const rowTop = y + labelH;
    let x = nameCol;
    def.frames.forEach((_, fi) => {
      ctx.save();
      ctx.translate(x, rowTop);
      ctx.scale(ZOOM, ZOOM);
      ctx.imageSmoothingEnabled = false;
      drawSprite(ctx, name as SpriteName, fi, def.w / 2, def.h / 2);
      ctx.restore();
      x += def.w * ZOOM + pad;
    });

    y = rowTop + def.h * ZOOM + pad;
  }

  document.body.style.overflow = 'auto';
  document.body.style.background = '#0a0e14';
  container.appendChild(canvas);
}
