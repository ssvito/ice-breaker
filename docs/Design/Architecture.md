# Architecture

Part of [Design](./Design.md).

## v1 architecture

- **Game loop**: `requestAnimationFrame`, fixed-timestep update / separate render pass.
- **Map**: grid-based, single fixed enemy path (defer pathfinding).
- **Entities**: towers (2-3 types), enemies (2-3 types), projectiles. Plain arrays/objects, no ECS needed at this scale.
- **Waves**: timed spawner, escalating difficulty.
- **Economy**: gold from kills, spend on placing/upgrading towers.
- **Input**: Pointer Events to unify mouse + touch on one code path.
- **PWA shell**: manifest.json + service worker, cache-first for static assets, installable + offline.
- **Responsive canvas**: scale-to-fit, devicePixelRatio-aware.

## Risk areas to watch

- Touch vs. hover affordances (range preview, placement feedback) need distinct handling per input type.
- Safe-area insets on notched phones.
- Keeping the render loop cheap enough for low-end mobile GPUs.
