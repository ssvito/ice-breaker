export interface GlitchParticle {
  x: number; // grid coords (pre-centered, no tile offset needed at render time)
  y: number;
  vx: number; // grid units per second
  vy: number;
  ageMs: number;
  color: string;
}

const PARTICLE_LIFETIME_MS = 350;
const PARTICLES_PER_BURST = 6;
const PARTICLE_SPEED = 3; // grid units per second
const GLITCH_COLORS = ['#ff2fd1', '#22e1ff', '#ffffff'];

export function createGlitchBurst(x: number, y: number): GlitchParticle[] {
  const particles: GlitchParticle[] = [];
  for (let i = 0; i < PARTICLES_PER_BURST; i++) {
    const angle = (Math.PI * 2 * i) / PARTICLES_PER_BURST + Math.random() * 0.5;
    const speed = PARTICLE_SPEED * (0.5 + Math.random() * 0.5);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      ageMs: 0,
      color: GLITCH_COLORS[i % GLITCH_COLORS.length],
    });
  }
  return particles;
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
