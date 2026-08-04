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
 * Pulls the beats out of the file the builder edits.
 *
 * `story.ts` is TypeScript, which Node cannot import, but the part that matters
 * is a plain array literal. Rather than depend on a TypeScript toolchain just
 * to read four objects, this finds the `sections` array by matching brackets
 * and evaluates that literal alone.
 *
 * Evaluating it is what makes comments, trailing commas, multi-line objects and
 * apostrophes in the copy all work — a regex over the same text would break on
 * every one of them. The scope is a file in the caller's own project, which
 * they are already running this tool inside.
 */
export function parseBeats(source) {
  return parseArrayLiteral(source, /\bsections\s*:\s*\[/, "sections");
}

/** The generated contract, read the same way. */
export function parseSequences(source) {
  return parseArrayLiteral(source, /\bSEQUENCES\s*=\s*\[/, "SEQUENCES");
}

/**
 * Finds a named array literal by matching brackets, and evaluates just that.
 *
 * See parseBeats for why evaluation rather than a regex over the contents.
 */
function parseArrayLiteral(source, pattern, name) {
  const key = pattern.exec(source);
  if (!key) {
    throw new Error(
      `no \`${name}\` array found in this file.\n` +
        "  Expected a file generated or scaffolded by open-scrollytelling.",
    );
  }

  const open = key.index + key[0].length - 1;
  let depth = 0;
  let close = -1;

  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }

  if (close === -1) throw new Error(`the \`${name}\` array is not closed`);

  const literal = source.slice(open, close + 1);
  let value;
  try {
    value = new Function(`return ${literal};`)();
  } catch (err) {
    throw new Error(`could not read the ${name} array: ${err.message}`);
  }

  if (!Array.isArray(value)) throw new Error(`\`${name}\` is not an array`);
  return value;
}

/**
 * How bright the footage is behind one beat.
 *
 * Mirrors what the page does at runtime: the frame at that scroll position, in
 * the region that block of copy occupies.
 */
export function beatLuma(sequence, beat) {
  const frames = sequence.lumaGrid ?? [];
  if (frames.length === 0) return 0;

  const at = Math.min(1, Math.max(0, Number(beat.at) || 0));
  const grid = frames[Math.round(at * (frames.length - 1))];
  if (!grid) return 0;

  if (beat.anchor === "bottom") {
    // Full width, lower half — where a bottom-anchored block sits.
    let total = 0;
    let n = 0;
    for (let row = Math.ceil(LUMA_ROWS / 2); row < LUMA_ROWS; row++) {
      for (let col = 0; col < LUMA_COLS; col++) {
        total += grid[row * LUMA_COLS + col] ?? 0;
        n++;
      }
    }
    return n === 0 ? 0 : total / n;
  }

  const region = beat.align === "left" || beat.align === "right" ? beat.align : "centre";
  return regionOfFrame(grid, region);
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
