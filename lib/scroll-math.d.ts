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

/**
 * How far through the runway we are, 0 to 1 — what the sequence is scrubbed
 * against on a page that has anything below the hero. `runwayTop` is
 * document-relative, the same space as `scrollY`.
 */
export declare function runwayProgress(
  scrollY: number,
  runwayTop: number,
  runwayHeight: number,
  innerHeight: number,
): number;

/** Where to scroll to land at `progress`. The inverse of `runwayProgress`. */
export declare function runwayScrollTop(
  progress: number,
  runwayTop: number,
  runwayHeight: number,
  innerHeight: number,
): number;

/** Fractional frame index, clamped into range. */
export declare function frameIndex(progress: number, totalFrames: number): number;

/**
 * Move `current` toward `target` over `seconds`, frame-rate independent.
 * `seconds <= 0` returns `target`, which is a 1:1 lock to scroll position.
 */
export declare function damp(
  current: number,
  target: number,
  seconds: number,
  deltaMs: number,
): number;

/** Whether the eased position is near enough to stop the animation loop. */
export declare function hasSettled(
  current: number,
  target: number,
  totalFrames: number,
): boolean;

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

/** How many decoded frames fit in a byte budget. */
export declare function framesInBudget(
  budgetBytes: number,
  width: number,
  height: number,
): number;

/** The inclusive range of frames allowed to stay decoded, centred on `current`. */
export declare function decodeWindow(
  current: number,
  totalFrames: number,
  capacity: number,
): { from: number; to: number };

export type BeatShape = {
  readonly at: number;
  readonly align: "left" | "center" | "right";
  readonly anchor?: "middle" | "bottom";
};

export type VisibleRect = {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
};

export type GridSequence = SequenceShape & {
  readonly lumaGrid: readonly (readonly number[])[];
};

/** The same beats, each moved onto the nearest whole frame. */
export declare function alignBeats<T extends BeatShape>(
  sections: readonly T[],
  totalFrames: number,
): readonly T[];

/**
 * How visible a beat is at this scroll position, 0 to 1.
 *
 * Crossfades while the page is moving. `focus` is how far it has settled once
 * the scroll stopped: 0 is the plain crossfade, 1 leaves exactly one beat lit.
 */
export declare function fadeOpacity(
  sections: readonly BeatShape[],
  index: number,
  progress: number,
  focus?: number,
): number;

/** Which part of the source frame is on screen, in 0..1 source coordinates. */
export declare function visibleRect(
  viewportWidth: number,
  viewportHeight: number,
  sequence: SequenceShape,
  scale: number,
): VisibleRect;

/** How dark the backdrop behind a block of copy needs to be, 0 to 0.75. */
export declare function scrimOpacity(
  sequence: GridSequence,
  frame: number,
  beat: BeatShape,
  rect: VisibleRect,
): number;

/** Mixes two border colors; the page paints the result behind the canvas. */
export declare function lerpColor(from: Rgb, to: Rgb, t: number): [number, number, number];

/** Scroll container height in vh, derived from the frame count. */
export declare function scrollHeightVh(totalFrames: number): number;
