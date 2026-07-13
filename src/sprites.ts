import { PALETTE, SPRITE_DEFS } from './sprite-data.ts';
import type { SpriteDef } from './sprite-data.ts';

export type SpriteName = keyof typeof SPRITE_DEFS;

interface BakedFrame {
  sx: number;
  sy: number;
}
interface BakedSprite {
  w: number;
  h: number;
  frames: BakedFrame[];
}

const PAD = 1; // 1px gutter between atlas entries to avoid bleed when scaled
let atlas: HTMLCanvasElement | null = null;
const baked = new Map<string, BakedSprite>();

/**
 * Paints every sprite/frame into one offscreen atlas canvas, one pixel per
 * character. Idempotent. Throws if a sprite's rows do not match its declared
 * w/h, so authoring mistakes surface loudly at startup.
 */
export function bakeAtlas(): void {
  if (atlas) return;

  const names = Object.keys(SPRITE_DEFS);
  let atlasW = 0;
  let cursorY = 0;
  const layout: { name: string; def: SpriteDef; y: number }[] = [];
  for (const name of names) {
    const def = SPRITE_DEFS[name];
    layout.push({ name, def, y: cursorY });
    atlasW = Math.max(atlasW, def.frames.length * (def.w + PAD));
    cursorY += def.h + PAD;
  }

  const canvas = document.createElement('canvas');
  canvas.width = atlasW;
  canvas.height = cursorY;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for sprite atlas');

  for (const { name, def, y } of layout) {
    const frames: BakedFrame[] = [];
    def.frames.forEach((rows, fi) => {
      if (rows.length !== def.h) {
        throw new Error(`sprite ${name} frame ${fi}: ${rows.length} rows, expected ${def.h}`);
      }
      const sx = fi * (def.w + PAD);
      for (let py = 0; py < def.h; py++) {
        const row = rows[py];
        if (row.length !== def.w) {
          throw new Error(`sprite ${name} frame ${fi} row ${py}: width ${row.length}, expected ${def.w}`);
        }
        for (let cx = 0; cx < def.w; cx++) {
          const color = PALETTE[row[cx]];
          if (!color) continue;
          ctx.fillStyle = color;
          ctx.fillRect(sx + cx, y + py, 1, 1);
        }
      }
      frames.push({ sx, sy: y });
    });
    baked.set(name, { w: def.w, h: def.h, frames });
  }

  atlas = canvas;
}

export function spriteSize(name: SpriteName): { w: number; h: number } {
  const b = baked.get(name);
  return b ? { w: b.w, h: b.h } : { w: 0, h: 0 };
}

/**
 * Draws a sprite centered on (cx, cy) in virtual pixels, snapped to whole
 * pixels so nothing antialiases. `orientation` is a rotation in radians;
 * pass only multiples of PI/2 to keep the pixel grid axis-aligned.
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  name: SpriteName,
  frame: number,
  cx: number,
  cy: number,
  orientation = 0,
): void {
  const b = baked.get(name);
  if (!b || !atlas) return;
  const f = b.frames[frame % b.frames.length];

  if (orientation === 0) {
    ctx.drawImage(atlas, f.sx, f.sy, b.w, b.h, Math.round(cx - b.w / 2), Math.round(cy - b.h / 2), b.w, b.h);
    return;
  }

  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy));
  ctx.rotate(orientation);
  ctx.drawImage(atlas, f.sx, f.sy, b.w, b.h, -Math.round(b.w / 2), -Math.round(b.h / 2), b.w, b.h);
  ctx.restore();
}

export interface SpritePixel {
  dx: number; // offset from sprite center, virtual px
  dy: number;
  color: string;
}

/** Opaque pixels of a frame, as center-relative offsets - the source for the glitch-scatter kill effect. */
export function spritePixels(name: SpriteName, frame = 0): SpritePixel[] {
  const def = SPRITE_DEFS[name];
  if (!def) return [];
  const rows = def.frames[frame % def.frames.length];
  const out: SpritePixel[] = [];
  for (let py = 0; py < def.h; py++) {
    for (let px = 0; px < def.w; px++) {
      const color = PALETTE[rows[py][px]];
      if (!color) continue;
      out.push({ dx: px - def.w / 2, dy: py - def.h / 2, color });
    }
  }
  return out;
}

/** For the dev gallery: the baked atlas canvas and its entry list. */
export function atlasCanvas(): HTMLCanvasElement | null {
  return atlas;
}
