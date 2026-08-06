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

/** Which frames to fetch, and which decoded frames to release. */
export declare function windowDiff(state: {
  centre: number;
  totalFrames: number;
  capacity: number;
  held: Iterable<number>;
  pending: Iterable<number>;
  failed: Iterable<number>;
}): { request: number[]; release: number[] };
