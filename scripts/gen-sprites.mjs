// Generates src/sprite-data.ts. Each sprite is drawn into a char grid with
// simple primitives (rects, discs, rings) so every row is guaranteed to be
// exactly `w` wide and every frame exactly `h` tall - hand-counting 40x40 and
// 48x48 pixel grids by hand is too error-prone. The output is still a plain
// pixel-string data literal (diffable, palette-enforced); this script is the
// authoring tool for it. Re-run with `node scripts/gen-sprites.mjs` after
// tweaking a shape.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'sprite-data.ts');

// --- Drawing primitives ------------------------------------------------------

const T = '.'; // transparent

function grid(w, h) {
  return Array.from({ length: h }, () => Array(w).fill(T));
}
function px(g, x, y, c) {
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c;
}
function fillRect(g, x0, y0, x1, y1, c) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(g, x, y, c);
}
function strokeRect(g, x0, y0, x1, y1, c) {
  for (let x = x0; x <= x1; x++) {
    px(g, x, y0, c);
    px(g, x, y1, c);
  }
  for (let y = y0; y <= y1; y++) {
    px(g, x0, y, c);
    px(g, x1, y, c);
  }
}
/** Rounded rect: filled, with the four single corner pixels knocked out. */
function roundRect(g, x0, y0, x1, y1, fill, outline) {
  fillRect(g, x0, y0, x1, y1, fill);
  if (outline) strokeRect(g, x0, y0, x1, y1, outline);
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) px(g, x, y, T);
}
function disc(g, cx, cy, r, c) {
  const r2 = r * r;
  for (let y = 0; y < g.length; y++)
    for (let x = 0; x < g[0].length; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) px(g, x, y, c);
    }
}
/** Annulus: pixels with rInner < dist <= rOuter. */
function ring(g, cx, cy, rOuter, rInner, c) {
  const ro2 = rOuter * rOuter;
  const ri2 = rInner * rInner;
  for (let y = 0; y < g.length; y++)
    for (let x = 0; x < g[0].length; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= ro2 && d2 > ri2) px(g, x, y, c);
    }
}
function toStrings(g) {
  return g.map((row) => row.join(''));
}

// --- Enemies (authored facing +x) --------------------------------------------

function packetSniffer(frame) {
  const g = grid(10, 6);
  strokeRect(g, 0, 0, 9, 5, 'k');
  fillRect(g, 1, 1, 8, 4, 'c');
  fillRect(g, 1, 1, 2, 4, 'W'); // header stripe
  if (frame === 1) {
    px(g, 5, 2, 'C');
    px(g, 6, 3, 'C');
  }
  return toStrings(g);
}

function worm(frame) {
  const g = grid(16, 8);
  const hi = frame === 0 ? 2 : 3; // highlight row (undulates)
  const eye = frame === 0 ? 3 : 4;
  for (let s = 0; s < 4; s++) {
    const x = s * 4;
    const head = s === 3;
    // rounded 4x8 segment, body rows 2..5
    px(g, x + 1, 1, 'k');
    px(g, x + 2, 1, 'k');
    px(g, x + 1, 6, 'k');
    px(g, x + 2, 6, 'k');
    for (let y = 2; y <= 5; y++) {
      px(g, x + 0, y, 'k');
      px(g, x + 3, y, 'k');
      px(g, x + 1, y, y === hi ? 'G' : 'g');
      px(g, x + 2, y, y === hi ? 'G' : 'g');
    }
    if (head) px(g, x + 1, eye, 'c');
  }
  return toStrings(g);
}

function encryptor(frame) {
  const g = grid(12, 12);
  // shackle (open U)
  fillRect(g, 4, 0, 7, 0, 'M');
  fillRect(g, 3, 1, 3, 3, 'M');
  fillRect(g, 8, 1, 8, 3, 'M');
  // body
  roundRect(g, 0, 4, 11, 11, 'M', null);
  fillRect(g, 5, 6, 6, 9, 'p'); // keyhole
  if (frame === 1) fillRect(g, 3, 8, 8, 8, 'R');
  return toStrings(g);
}

function ransomware(frame) {
  const g = grid(20, 20);
  // shackle
  strokeRect(g, 6, 1, 13, 5, 'k');
  fillRect(g, 7, 2, 12, 2, 'M');
  fillRect(g, 7, 3, 8, 5, 'M');
  fillRect(g, 11, 3, 12, 5, 'M');
  // body
  fillRect(g, 2, 6, 17, 18, 'M');
  strokeRect(g, 2, 6, 17, 18, 'k');
  fillRect(g, 8, 8, 11, 13, 'p'); // keyhole
  if (frame === 1) fillRect(g, 3, 12, 16, 12, 'R');
  return toStrings(g);
}

function trojan(frame) {
  const g = grid(24, 24);
  const body = 'a';
  fillRect(g, 2, 0, 21, 21, body);
  strokeRect(g, 2, 0, 21, 21, 'k');
  fillRect(g, 3, 1, 20, 1, 'A'); // top highlight
  fillRect(g, 3, 19, 20, 19, 'A'); // bottom highlight
  // corner bolts
  for (const [x, y] of [[5, 4], [18, 4], [5, 17], [18, 17]]) px(g, x, y, 'o');
  // visor band with eye slit
  fillRect(g, 2, 9, 21, 9, 'k');
  fillRect(g, 2, 12, 21, 12, 'k');
  fillRect(g, 3, 10, 20, 11, frame === 0 ? 'c' : 'C');
  return toStrings(g);
}

function zeroDay(frame) {
  const g = grid(40, 40);
  const cx = 19.5;
  const cy = 19.5;
  disc(g, cx, cy, 19, 'W'); // outer glow ring base
  disc(g, cx, cy, 18, 'm'); // magenta body
  ring(g, cx, cy, 19.6, 18.5, 'k'); // dark rim
  disc(g, cx, cy, 10, 'c'); // cyan core
  ring(g, cx, cy, 10, 8.5, frame === 0 ? 'b' : 'C');
  // eye
  const ex = frame === 0 ? cx : cx + 2;
  disc(g, ex, cy, 5, 'W');
  disc(g, ex, cy, 4, 'k');
  disc(g, ex, cy, 2, frame === 0 ? 'm' : 'M'); // pupil
  return toStrings(g);
}

// --- Towers (top-down) -------------------------------------------------------

function firewallNode(frame) {
  const g = grid(28, 28);
  const flash = frame === 1;
  // pin nubs
  for (let i = 4; i <= 22; i += 3) {
    px(g, i, 1, 's');
    px(g, i, 26, 's');
    px(g, 1, i, 's');
    px(g, 26, i, 's');
  }
  strokeRect(g, 2, 2, 25, 25, 'k');
  fillRect(g, 3, 3, 24, 24, 'S');
  // brick grid: mortar lines + bricks
  const brick = flash ? 'w' : 'c';
  const mortar = flash ? 'C' : 'b';
  for (let y = 4; y <= 23; y++) {
    for (let x = 4; x <= 23; x++) {
      const row = y - 4;
      const mortarLine = row % 3 === 2;
      const offset = Math.floor(row / 3) % 2 === 0 ? 0 : 3;
      const vjoint = (x - 4 + offset) % 6 === 0;
      px(g, x, y, mortarLine || vjoint ? mortar : brick);
    }
  }
  return toStrings(g);
}

function idsScanner() {
  const g = grid(28, 28);
  const cx = 13.5;
  const cy = 13.5;
  disc(g, cx, cy, 13, 'C');
  ring(g, cx, cy, 13.6, 12.4, 'k');
  ring(g, cx, cy, 10, 8.5, 'b');
  ring(g, cx, cy, 6, 4.5, 'b');
  disc(g, cx, cy, 2.5, 'w');
  return toStrings(g);
}

function honeypot() {
  const g = grid(24, 24);
  const cx = 11.5;
  const cy = 11.5;
  disc(g, cx, cy, 10, 'a');
  ring(g, cx, cy, 10.5, 9.4, 'k');
  ring(g, cx, cy, 9, 7.5, 'A');
  ring(g, cx, cy, 6, 4.5, 'A');
  disc(g, cx, cy, 3, 'a');
  disc(g, cx, cy, 1.5, 'A'); // lure glow
  return toStrings(g);
}

function aesTurret(frame) {
  const g = grid(30, 30);
  const flash = frame === 1;
  const cx = 14.5;
  const cy = 13.5;
  disc(g, cx, cy, 13, 'r'); // base
  ring(g, cx, cy, 13.6, 12.4, 'k');
  ring(g, cx, cy, 12, 10.5, 'R'); // bevel
  // barrel pointing down (+y)
  fillRect(g, 12, 13, 17, 29, 'S');
  strokeRect(g, 12, 13, 17, 29, 'k');
  fillRect(g, 14, 14, 15, 29, flash ? 'A' : 'k'); // bore
  // hub
  disc(g, cx, cy, 5, 'k');
  disc(g, cx, cy, 3, flash ? 'W' : 'R');
  // muzzle flash
  if (flash) {
    disc(g, 14.5, 29, 3, 'A');
    disc(g, 14.5, 29, 1.5, 'W');
  }
  return toStrings(g);
}

// --- Board entities & projectiles --------------------------------------------

function projectile() {
  const g = grid(3, 3);
  px(g, 1, 0, 'm');
  px(g, 0, 1, 'm');
  px(g, 2, 1, 'm');
  px(g, 1, 2, 'm');
  px(g, 1, 1, 'M');
  return toStrings(g);
}

function projectileAes() {
  const g = grid(5, 5);
  disc(g, 2, 2, 2, 'r');
  disc(g, 2, 2, 1.4, 'R');
  px(g, 2, 2, 'W');
  return toStrings(g);
}

function concentricSquares(w, h, colors) {
  const g = grid(w, h);
  const layers = Math.min(Math.floor(w / 2), Math.floor(h / 2));
  for (let i = 0; i < layers; i++) {
    const c = colors[i % colors.length];
    strokeRect(g, i, i, w - 1 - i, h - 1 - i, c);
  }
  return toStrings(g);
}

function spawnPort() {
  // 24x24 green intake, 2px transparent margin -> 20x20 of rings
  const g = grid(24, 24);
  const inner = concentricSquares(20, 20, ['k', 'e', 'g', 'G']);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) g[y + 2][x + 2] = inner[y][x];
  return toStrings(g);
}

function core() {
  // 48x48 magenta mainframe, concentric plating with a bright center
  const g = grid(48, 48);
  const inner = concentricSquares(46, 46, ['k', 's', 'S', 'c', 'm', 'M', 'p', 'm', 'M', 'W']);
  for (let y = 0; y < 46; y++) for (let x = 0; x < 46; x++) g[y + 1][x + 1] = inner[y][x];
  disc(g, 23.5, 23.5, 4, 'W'); // glowing core
  disc(g, 23.5, 23.5, 2, 'm');
  return toStrings(g);
}

/**
 * BEACON - a transmitter that keeps its own clock. Its whole rule is that the slow
 * auras do nothing to it, so the sprite says that: everything else in the roster is
 * drawn as a body, and this one is drawn as a body plus a pulse that never breaks
 * rhythm. Red, because every other kind is already green, cyan, amber or magenta and
 * the one that ignores your Scanner should not be readable as a cousin of anything.
 */
function beacon(frame) {
  const g = grid(14, 14);

  // Arc first; the chassis paints over any overlap. Only the forward half survives -
  // ring() is a full annulus and there is no clip primitive, so the tail is erased.
  const r = frame === 0 ? 4 : 6;
  ring(g, 7, 9, r, r - 1, frame === 0 ? 'R' : 'r');
  for (let y = 0; y < 14; y++) for (let x = 0; x <= 8; x++) g[y][x] = T;

  // Mast and lamp.
  fillRect(g, 3, 0, 4, 5, 'k');
  fillRect(g, 3, 2, 3, 4, 'r');
  px(g, 3, 1, 'W');
  px(g, 4, 1, 'R');

  // Chassis.
  roundRect(g, 0, 6, 8, 13, 'r', 'k');
  fillRect(g, 1, 8, 7, 9, 'R');
  fillRect(g, 1, 11, 7, 12, 's');
  return toStrings(g);
}

// --- Assemble ----------------------------------------------------------------

const SPRITES = {
  packetSniffer: { w: 10, h: 6, frames: [packetSniffer(0), packetSniffer(1)] },
  worm: { w: 16, h: 8, frames: [worm(0), worm(1)] },
  beacon: { w: 14, h: 14, frames: [beacon(0), beacon(1)] },
  encryptor: { w: 12, h: 12, frames: [encryptor(0), encryptor(1)] },
  ransomware: { w: 20, h: 20, frames: [ransomware(0), ransomware(1)] },
  trojan: { w: 24, h: 24, frames: [trojan(0), trojan(1)] },
  zeroDay: { w: 40, h: 40, frames: [zeroDay(0), zeroDay(1)] },
  firewallNode: { w: 28, h: 28, frames: [firewallNode(0), firewallNode(1)] },
  idsScanner: { w: 28, h: 28, frames: [idsScanner()] },
  honeypot: { w: 24, h: 24, frames: [honeypot()] },
  aesTurret: { w: 30, h: 30, frames: [aesTurret(0), aesTurret(1)] },
  projectile: { w: 3, h: 3, frames: [projectile()] },
  projectileAes: { w: 5, h: 5, frames: [projectileAes()] },
  spawnPort: { w: 24, h: 24, frames: [spawnPort()] },
  core: { w: 48, h: 48, frames: [core()] },
};

// Validate dimensions before writing.
for (const [name, def] of Object.entries(SPRITES)) {
  def.frames.forEach((rows, fi) => {
    if (rows.length !== def.h) throw new Error(`${name} frame ${fi}: ${rows.length} rows, expected ${def.h}`);
    rows.forEach((row, ri) => {
      if (row.length !== def.w) throw new Error(`${name} frame ${fi} row ${ri}: width ${row.length}, expected ${def.w}`);
    });
  });
}

const PALETTE = {
  '.': 'null', k: '#05070a', d: '#0a0e14', s: '#12161f', S: '#2a3346',
  c: '#22e1ff', C: '#7dffe8', b: '#1aa0c8', g: '#39ff88', G: '#b6ffd0', e: '#1f9e5a',
  a: '#ffcc00', A: '#fff9b0', o: '#c8890a', m: '#ff2fd1', M: '#ff7ae8', p: '#a01e86',
  r: '#ff4477', R: '#ff90a8', w: '#eaffff', W: '#ffffff',
};

function paletteLiteral() {
  const lines = Object.entries(PALETTE).map(([ch, hex]) => {
    const key = /^[a-zA-Z]$/.test(ch) ? ch : `'${ch}'`;
    const val = hex === 'null' ? 'null' : `'${hex}'`;
    return `  ${key}: ${val},`;
  });
  return `{\n${lines.join('\n')}\n}`;
}

function spritesLiteral() {
  const entries = Object.entries(SPRITES).map(([name, def]) => {
    const frames = def.frames
      .map((rows) => `      [\n${rows.map((r) => `        '${r}',`).join('\n')}\n      ],`)
      .join('\n');
    return `  ${name}: {\n    w: ${def.w},\n    h: ${def.h},\n    frames: [\n${frames}\n    ],\n  },`;
  });
  return `{\n${entries.join('\n')}\n}`;
}

const header = `// AUTO-GENERATED by scripts/gen-sprites.mjs - do not edit by hand.
// Pixel-string sprite definitions (see vault: Design/Sprite Spec). Each sprite
// is a grid of chars, one per pixel, baked into the atlas at load. Edit the
// generator's shape functions and re-run \`node scripts/gen-sprites.mjs\`.

/** Palette-char map. \`.\` is transparent; every other char is one atlas color. */
export const PALETTE: Record<string, string | null> = ${paletteLiteral()};

export interface SpriteDef {
  w: number;
  h: number;
  /** One entry per animation frame; each frame is \`h\` rows of \`w\` chars. */
  frames: string[][];
}

export const SPRITE_DEFS: Record<string, SpriteDef> = ${spritesLiteral()};
`;

if (process.argv.includes('--preview')) {
  for (const [name, def] of Object.entries(SPRITES)) {
    console.log(`\n=== ${name} ${def.w}x${def.h} (frame 0) ===`);
    for (const row of def.frames[0]) console.log(row.replace(/\./g, ' '));
  }
} else {
  writeFileSync(OUT, header);
  console.log(`Wrote ${OUT}`);
  for (const [name, def] of Object.entries(SPRITES)) {
    console.log(`  ${name}: ${def.w}x${def.h} x${def.frames.length}`);
  }
}
