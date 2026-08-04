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
