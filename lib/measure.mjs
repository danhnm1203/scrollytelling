/**
 * Measurement over raw RGB pixel buffers.
 *
 * Pure: no filesystem, no sharp, no image decoding. The pipeline decodes once
 * and hands the buffer here, which is what makes these answers checkable
 * against inputs whose correct result is known by construction, rather than
 * only through a whole-pipeline run nobody can verify by eye.
 *
 * Two things get measured, and both exist to fix a specific visible defect:
 *
 *   edgeColor  the page paints this behind the canvas, so the frame has no
 *              visible edge against the page. A single hardcoded color shows a
 *              rectangle on every frame whose border does not match it.
 *
 *   lumaGrid   the page darkens text backdrops by how bright the footage
 *              actually is behind that block. Fixed-opacity white text stops
 *              being readable the moment a frame brightens.
 */

/** The luminance grid is 6 cells across and 4 down. */
export const LUMA_COLS = 6;
export const LUMA_ROWS = 4;

/** How thick the border sample is, as a fraction of the shorter side. */
const EDGE_BAND = 0.02;

/**
 * Perceived brightness, 0 to 1, using Rec. 709 coefficients.
 * Green dominates because human vision is most sensitive to it.
 */
export function lumaOf(r, g, b) {
  const raw = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  // The coefficients sum to 1 in decimal but to 0.9999999999999999 in binary
  // floating point, so pure white would otherwise come back just under 1.
  // Callers are promised a 0..1 range; give them one.
  return Math.min(1, Math.max(0, raw));
}

/**
 * The average color of an image's border.
 *
 * Samples a band inset from all four sides and averages them together. All four
 * matter: a frame can be black on three sides and bright on the fourth, and
 * missing that is exactly the seam this is meant to hide.
 *
 * @param {Buffer} rgb - width * height * 3 bytes, no alpha
 * @returns {[number, number, number]} 0-255 integers
 */
export function edgeColor(rgb, width, height) {
  const band = Math.max(1, Math.round(Math.min(width, height) * EDGE_BAND));

  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;

  const take = (x, y) => {
    const i = (y * width + x) * 3;
    r += rgb[i];
    g += rgb[i + 1];
    b += rgb[i + 2];
    n++;
  };

  for (let y = 0; y < height; y++) {
    const onHorizontalBand = y < band || y >= height - band;
    if (onHorizontalBand) {
      // Whole row: this is the top or bottom band.
      for (let x = 0; x < width; x++) take(x, y);
    } else {
      // Middle rows contribute only their left and right ends.
      for (let x = 0; x < band; x++) take(x, y);
      for (let x = Math.max(band, width - band); x < width; x++) take(x, y);
    }
  }

  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/**
 * Luminance per cell, row-major, for a buffer already resized to the grid.
 *
 * The pipeline resizes the frame to exactly LUMA_COLS x LUMA_ROWS and passes
 * the result here, so each pixel already *is* a cell average — the resampler
 * does the averaging, which is both faster and better than doing it by hand.
 *
 * @param {Buffer} rgb - cols * rows * 3 bytes
 * @returns {number[]} cols * rows values in 0..1
 */
export function lumaGrid(rgb, cols = LUMA_COLS, rows = LUMA_ROWS) {
  const out = new Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    const p = i * 3;
    out[i] = lumaOf(rgb[p], rgb[p + 1], rgb[p + 2]);
  }
  return out;
}
