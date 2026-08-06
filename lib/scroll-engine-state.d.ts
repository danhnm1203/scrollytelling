/**
 * Types for scroll-engine-state.mjs.
 *
 * The implementation is plain JavaScript so the test runner can import it with
 * no build step; this file exists so editors and `tsc` still understand it
 * inside a generated project.
 */

export type DecodeStrategy = "worker" | "main";

/** Where the next decode should happen. A failed worker is never retried. */
export declare function decodeStrategy(capability: {
  canUseWorker: boolean;
  workerFailed: boolean;
}): DecodeStrategy;

/**
 * The frames that were in flight when the worker died, ascending.
 *
 * Excludes anything already held or already known to have failed.
 */
export declare function framesToRetry(state: {
  pending: Iterable<number>;
  held: Iterable<number>;
  failed: Iterable<number>;
}): number[];

export type LoadState =
  | { phase: "loading"; done: number; total: number }
  | { phase: "ready"; failed: number[] }
  | { phase: "failed" };

/**
 * What the page should be showing now that one more opening frame has settled.
 * Null when the frame is beyond the opening window and so changes nothing.
 *
 * `failed` is the opening-window failures only — counting later ones makes a
 * page whose opening frames all decoded report that it has none.
 */
export declare function loadStateAfter(arrival: {
  index: number;
  initial: number;
  settled: number;
  failed: Iterable<number>;
}): LoadState | null;

/**
 * Where the sequence should be drawn this paint, and whether to keep going.
 *
 * `primed` is false on the first paint of a run, which snaps rather than eases.
 * `animating` false means the loop can stop — exponential easing never arrives
 * on its own.
 */
export declare function nextEased(step: {
  previous: number;
  target: number;
  primed: boolean;
  seconds: number;
  deltaMs: number;
  totalFrames: number;
}): { eased: number; animating: boolean };

/** The page background for this position, interpolated between frame edges. */
export declare function backgroundColor(at: {
  sequence: { totalFrames: number; edgeColors: readonly (readonly number[])[] };
  exact: number;
}): number[];

/** Where to put the image on the canvas, in CSS pixels. */
export declare function drawRect(viewport: {
  viewportWidth: number;
  viewportHeight: number;
  sequence: { width: number; height: number };
}): { x: number; y: number; width: number; height: number };

/** The closest decoded frame to draw, or null when there is nothing to draw. */
export declare function nearestDecoded(at: {
  exact: number;
  held: Iterable<number>;
  totalFrames: number;
}): number | null;

/** Which frames to fetch, and which decoded frames to release. */
export declare function windowDiff(state: {
  centre: number;
  totalFrames: number;
  capacity: number;
  held: Iterable<number>;
  pending: Iterable<number>;
  failed: Iterable<number>;
}): { request: number[]; release: number[] };
