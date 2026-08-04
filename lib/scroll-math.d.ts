/**
 * Types for scroll-math.mjs.
 *
 * The implementation is plain JavaScript so the test runner can import it with
 * no build step; this file exists so editors and `tsc` still understand it
 * inside a generated project.
 */

export type Rgb = readonly [number, number, number];

export type SequenceShape = {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly totalFrames: number;
};

export declare const SCROLL_MATH_VERSION: string;

/** How far down the page we are, 0 to 1. Safe when the page is short. */
export declare function scrollProgress(
  scrollY: number,
  scrollHeight: number,
  innerHeight: number,
): number;

/** Fractional frame index, clamped into range. */
export declare function frameIndex(progress: number, totalFrames: number): number;

/** The sequence whose aspect ratio is closest to the viewport, or null. */
export declare function selectSequence<T extends SequenceShape>(
  viewportWidth: number,
  viewportHeight: number,
  sequences: readonly T[],
): T | null;

/** Scale factor for drawing a frame into the viewport. */
export declare function computeScale(
  viewportWidth: number,
  viewportHeight: number,
  sequence: SequenceShape,
): number;

/** Mixes two border colors; the page paints the result behind the canvas. */
export declare function lerpColor(from: Rgb, to: Rgb, t: number): [number, number, number];

/** Scroll container height in vh, derived from the frame count. */
export declare function scrollHeightVh(totalFrames: number): number;
