# ICE Breaker

A tower defense game where you defend a corp mainframe from malware, built as an installable PWA for desktop and mobile.

**[Play it](https://ssvito.github.io/ice-breaker/)**

Vanilla TypeScript and the raw Canvas API - no Phaser, no Kaboom, no Pixi. It's a learning project, so the game loop, path interpolation, targeting, wave state machine, sprite atlas, and virtual-resolution renderer are all written from scratch.

- Four towers (single-target, two slow auras, a heavy turret) and an Overclock ability that trades a fire-rate burst for a forced cooldown.
- Six enemy kinds including one that splits on death and a boss immune to a specific tower.
- Pixel art at a 32px virtual tile (512x288, integer-scaled with nearest-neighbour), authored as palette-enforced pixel-strings emitted by a generator script.
- Pointer Events for one mouse/touch code path, plus a DOM toolbar so it's playable on a phone.

## Docs

The full design notes, roadmap, and a dated build log live in [`docs/`](./docs/Tower%20Defense%20PWA.md) - including the decisions that got reversed and why.

## Development

```
npm install
npm run dev      # Vite dev server
npm run build    # tsc && vite build
```

Push to `main` deploys to GitHub Pages via Actions.
