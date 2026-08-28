/**
 * Pixel-string glyphs for the DOM.
 *
 * The board's art is authored as pixel strings and baked into a canvas atlas
 * (`sprites.ts`). The chrome is DOM, so it cannot use that atlas - but it can be drawn
 * the same way, and the rule the HUD's heart wrote down is why it should be: a glyph
 * made of whole pixels belongs to the same art as the board, where one from an icon
 * font looks like it wandered in from another program.
 *
 * This is that heart's builder, lifted out the second time a glyph was needed rather
 * than copied. Rows are run-length encoded into one `<rect>` per horizontal run, which
 * keeps a 7x7 glyph at a handful of elements instead of forty-nine.
 */

/**
 * Renders `#` as filled and anything else as empty, at one SVG unit per pixel. The
 * caller's stylesheet gives it a size and a colour: `fill: currentColor` so it takes
 * the meaning of whatever it sits in, and `shape-rendering: crispEdges` so the edges
 * land on device pixels rather than blurring across them.
 */
export function pixelSvg(rows: readonly string[], className: string): string {
  const width = Math.max(...rows.map((row) => row.length));
  const rects: string[] = [];

  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== '#') {
        x++;
        continue;
      }
      let run = 0;
      while (x + run < row.length && row[x + run] === '#') run++;
      rects.push(`<rect x="${x}" y="${y}" width="${run}" height="1"/>`);
      x += run;
    }
  });

  return `<svg class="${className}" viewBox="0 0 ${width} ${rows.length}" aria-hidden="true">${rects.join('')}</svg>`;
}
