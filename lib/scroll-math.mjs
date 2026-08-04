/**
 * Every piece of math that decides how the page looks.
 *
 * Pure functions, no DOM, no imports. Plain JavaScript rather than TypeScript
 * so the test runner imports it with no build step — if this were only
 * checkable in a browser, whether the page is right would be a matter of
 * opinion instead of a matter of fact.
 *
 * Copied into generated projects by `scaffold`, with scroll-math.d.ts alongside
 * for editor types.
 */

/** Bumped when the shape of anything here changes. */
export const SCROLL_MATH_VERSION = "1.0.0";

/**
 * The most of one dimension we will crop away to fill the viewport.
 *
 * Past this the subject itself starts disappearing, so it is better to show the
 * whole frame and let the edge-matched background cover what is left over.
 */
const MAX_CROP = 0.2;

/** Viewport height per frame, in vh. 50 frames gives the familiar 400vh. */
const VH_PER_FRAME = 8;

/** Below this a very short sequence would have almost nothing to scroll. */
const MIN_SCROLL_VH = 300;

/** Where the frame sits vertically when it does not fill the viewport. */
const VERTICAL_ANCHOR = 0.45;

/** The luminance grid is 6 cells across and 4 down, matching the pipeline. */
const LUMA_COLS = 6;
const LUMA_ROWS = 4;

/** Footage below this needs no scrim at all; copy reads fine on it. */
const SCRIM_FLOOR = 0.15;

/** How much brighter the footage has to get before the scrim maxes out. */
const SCRIM_RANGE = 0.5;

/** Never fully hide the footage behind its own caption. */
const SCRIM_MAX = 0.75;

/** Which third of the visible frame a block of copy sits over. */
const HORIZONTAL_BANDS = {
  left: { x0: 0, x1: 0.45 },
  center: { x0: 0.275, x1: 0.725 },
  right: { x0: 0.55, x1: 1 },
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * How far down the page we are, 0 to 1.
 *
 * Computed directly rather than through an animation library: it is one
 * division, keeping it pure makes it testable, and it avoids the conflict
 * between a smooth-scrolling library that virtualizes scroll and a hook that
 * reads native scroll.
 *
 * The `max(1, …)` matters — a page shorter than the viewport would otherwise
 * divide by zero and make every frame index NaN.
 */
export function scrollProgress(scrollY, scrollHeight, innerHeight) {
  return scrollY / Math.max(1, scrollHeight - innerHeight);
}

/**
 * Which frame belongs at this scroll position. Fractional, so the background
 * can interpolate between two frames' colors rather than jumping.
 *
 * The clamp is not defensive programming. Rubber-band scrolling on iOS pushes
 * progress outside 0..1 on its own, and an unclamped lookup returns undefined;
 * destructuring that throws inside the draw loop and scrubbing dies for the
 * rest of the session, with a console error most visitors never see.
 */
export function frameIndex(progress, totalFrames) {
  return clamp(progress, 0, 1) * Math.max(0, totalFrames - 1);
}

/**
 * The sequence whose shape is closest to this viewport.
 *
 * Compares aspect ratios numerically rather than matching media-query strings:
 * it generalizes past two sequences, needs no query parsing, and can be tested
 * without a browser. This is the only place in the system that knows more than
 * one sequence exists.
 */
export function selectSequence(viewportWidth, viewportHeight, sequences) {
  if (!sequences || sequences.length === 0) return null;

  const target = viewportWidth / viewportHeight;
  let best = null;
  let bestDistance = Infinity;

  for (const seq of sequences) {
    // Log distance, so 2x too wide and 2x too tall count equally.
    const distance = Math.abs(Math.log(seq.width / seq.height / target));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = seq;
    }
  }

  return best;
}

/**
 * How much to scale a frame to sit in the viewport.
 *
 *   suits the viewport      ──▶  fill it, accept a small crop
 *   does not suit it        ──▶  show the whole frame, background covers the rest
 *
 * "Suits it" is defined by the crop that filling would cost, not by an
 * arbitrary ratio: covering crops `1 - 1/mismatch` off one dimension, so a
 * MAX_CROP budget of 20% permits a mismatch up to 1.25.
 *
 *   1280x720 source on 1440x900   mismatch 1.11  ->  cover, 10% cropped
 *   810x1440 source on 375x812    mismatch 1.22  ->  cover, 18% cropped
 *   1280x720 source on 3440x1440  mismatch 1.34  ->  contain, background shows
 *   1280x720 source on 375x812    mismatch 3.85  ->  contain, background shows
 *
 * An earlier version was `min(cover, contain * 1.7)`. Because `cover/contain`
 * *is* the mismatch, that returns cover for every common desktop aspect —
 * making the edge-matched background dead code there — while phones were
 * cropped 41% and still left 56% of the screen as background.
 */
export function computeScale(viewportWidth, viewportHeight, sequence) {
  const sx = viewportWidth / sequence.width;
  const sy = viewportHeight / sequence.height;

  const viewportAspect = viewportWidth / viewportHeight;
  const sourceAspect = sequence.width / sequence.height;
  const ratio = viewportAspect / sourceAspect;
  const mismatch = Math.max(ratio, 1 / ratio);

  const maxMismatch = 1 / (1 - MAX_CROP);
  return mismatch <= maxMismatch ? Math.max(sx, sy) : Math.min(sx, sy);
}

/**
 * How visible a beat is at this scroll position, 0 to 1.
 *
 * Each beat declares only `at`, the point where it should be clearest. Its fade
 * windows are derived from where its neighbours sit, so adding, moving or
 * removing a beat means editing the list and recomputing nothing. The first
 * beat holds from the top and the last holds to the bottom, so the page is
 * never showing footage with no copy on it.
 */
export function fadeOpacity(sections, index, progress) {
  const beat = sections[index];
  if (!beat) return 0;

  const p = clamp(progress, 0, 1);
  const at = beat.at;

  // Neighbours by declaration order, so a list written out of order still
  // produces finite results rather than dividing by a negative window.
  const prev = index > 0 ? sections[index - 1] : null;
  const next = index < sections.length - 1 ? sections[index + 1] : null;

  // Windows reach all the way to the neighbouring beat, not to the midpoint
  // between them. Stopping at the midpoint means this beat has finished fading
  // out exactly as the next one starts fading in, so around every handoff the
  // page shows footage with almost no copy on it. Reaching the neighbour makes
  // it a crossfade: the two opacities always sum to 1.
  if (p <= at) {
    if (!prev) return 1;
    if (p <= prev.at) return 0;
    return clamp((p - prev.at) / Math.max(1e-6, at - prev.at), 0, 1);
  }

  if (!next) return 1;
  if (p >= next.at) return 0;
  return clamp((next.at - p) / Math.max(1e-6, next.at - at), 0, 1);
}

/**
 * Which part of the source frame is actually on screen, in 0..1 source coords.
 *
 * Needed because the scrim must read the footage the visitor can see. After a
 * crop, the outer columns of the source describe pixels that are not on screen,
 * and darkening text based on them is confidently wrong.
 */
export function visibleRect(viewportWidth, viewportHeight, sequence, scale) {
  const drawnW = sequence.width * scale;
  const drawnH = sequence.height * scale;

  const offsetX = (viewportWidth - drawnW) / 2;
  const offsetY = (viewportHeight - drawnH) * VERTICAL_ANCHOR;

  const x0 = clamp(-offsetX / drawnW, 0, 1);
  const y0 = clamp(-offsetY / drawnH, 0, 1);
  const x1 = clamp((viewportWidth - offsetX) / drawnW, 0, 1);
  const y1 = clamp((viewportHeight - offsetY) / drawnH, 0, 1);

  return {
    x0: Math.min(x0, x1),
    y0: Math.min(y0, y1),
    x1: Math.max(x0, x1),
    y1: Math.max(y0, y1),
  };
}

/**
 * How dark the backdrop behind a block of copy needs to be, 0 to 0.75.
 *
 * Reads the luminance grid over just the region that block occupies, inside the
 * part of the frame that is on screen. Dark footage gets almost no scrim and
 * the copy sits on a clean image; as the footage brightens the scrim comes up
 * to keep the text readable. Capped below 1 so the footage is never fully
 * hidden behind its own caption.
 */
export function scrimOpacity(sequence, frame, beat, rect) {
  const grid = sequence.lumaGrid?.[Math.round(frame)];
  if (!grid || grid.length === 0) return 0;

  const width = rect.x1 - rect.x0;
  const height = rect.y1 - rect.y0;

  // The block's footprint within the visible region.
  const bottomAnchored = beat.anchor === "bottom";
  const band = bottomAnchored
    ? { x0: 0, x1: 1, y0: 0.6, y1: 1 }
    : { ...HORIZONTAL_BANDS[beat.align ?? "center"], y0: 0.3, y1: 0.7 };

  const area = {
    x0: rect.x0 + band.x0 * width,
    x1: rect.x0 + band.x1 * width,
    y0: rect.y0 + band.y0 * height,
    y1: rect.y0 + band.y1 * height,
  };

  let total = 0;
  let n = 0;
  for (let row = 0; row < LUMA_ROWS; row++) {
    for (let col = 0; col < LUMA_COLS; col++) {
      const cell = {
        x0: col / LUMA_COLS,
        x1: (col + 1) / LUMA_COLS,
        y0: row / LUMA_ROWS,
        y1: (row + 1) / LUMA_ROWS,
      };
      const overlaps =
        cell.x1 > area.x0 && cell.x0 < area.x1 && cell.y1 > area.y0 && cell.y0 < area.y1;
      if (overlaps) {
        total += grid[row * LUMA_COLS + col] ?? 0;
        n++;
      }
    }
  }

  if (n === 0) return 0;
  const luma = total / n;
  return clamp((luma - SCRIM_FLOOR) / SCRIM_RANGE, 0, SCRIM_MAX);
}

/**
 * Mixes two frame border colors. The page paints the result behind the canvas,
 * so the frame has no visible edge against the page as it scrubs.
 */
export function lerpColor(from, to, t) {
  const k = clamp(t, 0, 1);
  return [
    Math.round(from[0] + (to[0] - from[0]) * k),
    Math.round(from[1] + (to[1] - from[1]) * k),
    Math.round(from[2] + (to[2] - from[2]) * k),
  ];
}

/**
 * How tall the scroll container should be, in vh.
 *
 * Derived from the frame count so scroll distance per frame stays constant when
 * someone changes how many frames a sequence has. Deliberately has no upper
 * clamp: a ceiling would reintroduce exactly the problem this exists to avoid,
 * with scroll-per-frame silently changing once the count crosses it.
 */
export function scrollHeightVh(totalFrames) {
  return Math.max(MIN_SCROLL_VH, Math.round(totalFrames * VH_PER_FRAME));
}
