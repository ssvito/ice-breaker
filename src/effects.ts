import { VIRTUAL_TILE } from './canvas.ts';
import type { SpritePixel } from './sprites.ts';

export interface GlitchParticle {
  x: number; // grid coords (pre-centered, no tile offset needed at render time)
  y: number;
  vx: number; // grid units per second
  vy: number;
  ageMs: number;
  color: string;
}

const PARTICLE_LIFETIME_MS = 380;
const SCATTER_SPEED = 3.5; // grid units per second, outward baseline
const MAX_PARTICLES = 44; // cap so a big sprite doesn't spawn hundreds of particles

/**
 * Scatters the dead enemy's actual sprite pixels outward from (x, y) (grid
 * coords) - the Sprite Spec's "glitch-scatter, now literal" kill effect.
 * `pixels` are center-relative offsets in virtual px (see spritePixels).
 */
export function createGlitchBurst(x: number, y: number, pixels: SpritePixel[]): GlitchParticle[] {
  const particles: GlitchParticle[] = [];
  for (const pixel of samplePixels(pixels, MAX_PARTICLES)) {
    const dist = Math.hypot(pixel.dx, pixel.dy) || 1;
    const speed = SCATTER_SPEED * (0.4 + Math.random());
    particles.push({
      x: x + pixel.dx / VIRTUAL_TILE,
      y: y + pixel.dy / VIRTUAL_TILE,
      vx: (pixel.dx / dist) * speed + (Math.random() - 0.5),
      vy: (pixel.dy / dist) * speed + (Math.random() - 0.5),
      ageMs: 0,
      color: pixel.color,
    });
  }
  return particles;
}

/** Evenly thins a pixel list down to at most `max` entries. */
function samplePixels(pixels: SpritePixel[], max: number): SpritePixel[] {
  if (pixels.length <= max) return pixels;
  const step = pixels.length / max;
  const out: SpritePixel[] = [];
  for (let i = 0; i < max; i++) out.push(pixels[Math.floor(i * step)]);
  return out;
}

/** Advances a particle; returns false once its lifetime has expired. */
export function stepParticle(particle: GlitchParticle, dtMs: number): boolean {
  particle.ageMs += dtMs;
  particle.x += particle.vx * (dtMs / 1000);
  particle.y += particle.vy * (dtMs / 1000);
  return particle.ageMs < PARTICLE_LIFETIME_MS;
}

export function particleAlpha(particle: GlitchParticle): number {
  return Math.max(0, 1 - particle.ageMs / PARTICLE_LIFETIME_MS);
}
