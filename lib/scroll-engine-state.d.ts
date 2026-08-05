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
