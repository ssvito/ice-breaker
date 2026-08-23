# Sprite Spec

Part of [Design](./Design.md). Spec for the entity art revamp - chosen as the v1.1 milestone 2026-07-12; build order in [Roadmap](../Roadmap.md). Drafted 2026-07-12.

Style: pixel art - the [Theme](./Theme.md) identity (strict 4-5 neon colors on near-black, glitch/pixel-scatter kills) already implies it, and it is the cheapest style to make look deliberate solo.

## Virtual tile size

**32px per tile**, so the 16x9 grid ([Map Layout](./Map%20Layout.md)) gives a native virtual resolution of **512x288** (exact 16:9; x2 = 1024x576, x4 = 2048x1152). Author every sprite against this, scale the whole canvas.

- 16px/tile: easier to draw, but not enough budget to distinguish 5 enemies + 4 towers.
- 48-64px/tile: demands real pixel-art skill and more frames; the strict palette stops helping.
- 32px: enough room for silhouettes, small enough that the palette does most of the work.

## Guiding rules

- **Size encodes threat** - players read HP from bulk before color or shape.
- Enemies stay **narrower than the 32px trace** so swarms overlap without turning to soup.
- Tower **silhouette encodes function** (dish = aura, barrel = single-target), not just color.

## Per-entity sizes and ratios

| Entity | Sprite (px) | Ratio | Reasoning |
|---|---|---|---|
| Packet Sniffer | 10x6 | ~3:2 | Smallest on screen - literally a packet: tiny rectangle with a header stripe. Reads in groups of 10. |
| Worm | 16x8 | 2:1 | Only elongated enemy - segmented body, 2-frame undulate. Shape alone separates it. |
| Encryptor (split child) | 12x12 | 1:1 | ~60% of Ransomware so the split visibly "halves" the threat. |
| Ransomware | 20x20 | 1:1 | Mid bulk; a padlock motif fits in 20px. |
| Trojan | 24x24 | 1:1 | Fills most of the trace width - should feel like it barely fits. |
| Zero-Day (boss) | 40x40 | 1:1 | Deliberately overflows the 32px trace; a boss breaking the grid is the cheapest "this is different" signal. |
| Firewall Node | 28x28 in a 32 tile | 1:1 | Towers are chips soldered to the board: square, top-down, 2px margin so tile edges/selection still read. |
| IDS Scanner | 28x28 | 1:1 | Circular dish silhouette + rotating sweep line (auras want rotation, not muzzle flash). |
| Honeypot | 24x24 | 1:1 | Intentionally smaller/softer - it is bait, not a gun. |
| AES Turret | 30x30, may overhang to 36 tall | ~1:1 | Premium tower gets the heaviest silhouette; slight overhang past the tile sells mass. |
| Projectiles | 3x3 (AES: 5x5) | 1:1 | Dots/bolts; the trail does the work, not the sprite. |
| Core (mainframe) | 48x48 over its edge tile | 1:1 | The thing being defended should be the largest static object on the board. |

Threat ladder by bulk: Sniffer 10 → Encryptor 12 → Worm 16 → Ransomware 20 → Trojan 24 → Zero-Day 40. No two enemies within ~4px of each other except the deliberate Ransomware/Encryptor pair.

## Authoring (decided 2026-07-12)

**Pixel-strings in TS**: each sprite is a small text grid in code - one character per pixel, characters mapped to palette colors - baked into the offscreen atlas at load. Chosen over a hand-drawn PNG atlas because it is diffable in git, palette-enforced by construction (a sprite cannot use a color that has no character), and editable by Claude sessions via the repo-vault integration ([Repo & Deploy](../Repo%20&%20Deploy.md)). Migration later is mechanical: bake the strings to a PNG once and continue in a pixel editor. The palette-char map leaves room to add colors beyond the strict 4-5 if the art needs it.

Iteration tooling: a dev-only gallery view (every sprite/frame at 8x zoom, hot-reload friendly) instead of a dedicated editor - a sprite-editor mini-tool was considered and deferred as overkill (parked in [Idea Bank](../Idea%20Bank/Idea%20Bank.md)). Built at `?gallery`.

**Built note (2026-07-12):** hand-counting 40x40 / 48x48 char grids in the file proved too error-prone, so the strings are emitted by `scripts/gen-sprites.mjs`, which draws each sprite from primitives (rect/disc/ring) into a validated char grid and writes `src/sprite-data.ts` (marked AUTO-GENERATED). The committed artifact is still the diffable, palette-enforced pixel-string data this section intends - the generator is the editing surface. To tweak art, edit the generator's shape functions and re-run it (`--preview` prints ASCII); don't hand-edit `sprite-data.ts`.

## Rendering

- One sprite atlas; everything above fits in 256x256.
- Draw at native size to an offscreen canvas, scale up with `imageSmoothingEnabled = false` (nearest-neighbor), prefer integer scale factors (floor the fit scale, letterbox the remainder) - non-integer scaling is what smears pixel art. Dovetails with the render-perf idea in the [Idea Bank](../Idea%20Bank/Idea%20Bank.md).
- Animation budget: 2 frames per enemy idle, 1 fire-flash frame per tower, 4 for the boss. Glitch-scatter kill stays procedural - scatter the sprite's actual pixels, now literal. **Built note:** boss shipped with 2 frames, not 4 (reads fine; expand later if it feels static).
