/**
 * Turning measurements into something a person can act on.
 *
 * The pipeline already computes all of this to build the contract, and until
 * now threw it away. Surfacing it means the builder can see what the footage is
 * doing — where it is bright, where the background lurches — before writing a
 * word of copy, instead of discovering it by squinting at a browser.
 *
 * Pure: takes a sequence, returns numbers. Formatting lives with the command.
 */

import { LUMA_COLS, LUMA_ROWS } from "./measure.mjs";

/** Copy sits in one of three horizontal bands, so the report speaks in those. */
export const REGIONS = ["left", "centre", "right"];

/** Which grid columns belong to each region. */
const REGION_COLUMNS = {
  left: [0, 1],
  centre: [2, 3],
  right: [4, 5],
};

/** Average luminance of one region in one frame. */
function regionOfFrame(grid, region) {
  const cols = REGION_COLUMNS[region];
  let total = 0;
  let n = 0;
  for (let row = 0; row < LUMA_ROWS; row++) {
    for (const col of cols) {
      total += grid[row * LUMA_COLS + col] ?? 0;
      n++;
    }
  }
  return n === 0 ? 0 : total / n;
}

/**
 * Luminance per region, sampled into buckets across the scroll.
 *
 * Buckets rather than per-frame because the builder is choosing where to put a
 * beat, and a beat covers a stretch of scroll rather than a single frame.
 *
 * @returns {{left: number[], centre: number[], right: number[]}}
 */
export function regionLuma(sequence, buckets) {
  const frames = sequence.lumaGrid ?? [];
  const table = {};

  for (const region of REGIONS) {
    table[region] = Array.from({ length: buckets }, (_, b) => {
      // Which frames fall in this bucket. With fewer frames than buckets the
      // ranges overlap rather than come up empty.
      const start = Math.floor((b / buckets) * frames.length);
      const end = Math.max(start + 1, Math.ceil(((b + 1) / buckets) * frames.length));

      let total = 0;
      let n = 0;
      for (let i = start; i < Math.min(end, frames.length); i++) {
        total += regionOfFrame(frames[i], region);
        n++;
      }
      return n === 0 ? 0 : total / n;
    });
  }

  return table;
}

/**
 * The largest background jump between two adjacent frames.
 *
 * The page interpolates its background between each frame's own border color.
 * A large jump means that interpolation is visible as a pulse while scrubbing,
 * which reads as a rendering fault rather than as footage.
 *
 * @returns {{delta: number, from: number, to: number}} 0-255 per-channel distance
 */
export function maxEdgeDelta(sequence) {
  const edges = sequence.edgeColors ?? [];
  let delta = 0;
  let from = 0;
  let to = 0;

  for (let i = 1; i < edges.length; i++) {
    const a = edges[i - 1];
    const b = edges[i];
    const d = Math.max(
      Math.abs(a[0] - b[0]),
      Math.abs(a[1] - b[1]),
      Math.abs(a[2] - b[2]),
    );
    if (d > delta) {
      delta = d;
      from = i - 1;
      to = i;
    }
  }

  return { delta, from, to };
}
