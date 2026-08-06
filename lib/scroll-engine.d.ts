/**
 * Types for scroll-engine.mjs.
 *
 * The implementation is plain JavaScript so the test runner can import it with
 * no build step; this file exists so editors and `tsc` still understand it
 * inside a generated project.
 */

/**
 * Exactly what mount() emits — deliberately NOT a union with the internal
 * LoadState from scroll-engine-state.
 *
 * That type has its own `ready` and `failed` members without `progress` or
 * `reason`. Unioning the two produced two variants per phase, so narrowing on
 * `phase` yielded both and neither's extra fields were reachable. The engine
 * always enriches a ready state with progress and the sequence id before
 * emitting it, so this is the honest shape of the callback.
 */
export type EngineState =
  | { phase: "loading"; done: number; total: number }
  | { phase: "ready"; failed: number[]; progress: number; sequenceId: string }
  | { phase: "reduced"; sequenceId: string }
  | { phase: "failed"; reason?: "empty" | "context" };

export type MountOptions = {
  sequences: readonly {
    id: string;
    width: number;
    height: number;
    totalFrames: number;
    edgeColors: readonly (readonly [number, number, number])[];
    lumaGrid: readonly (readonly number[])[];
  }[];
  story?: unknown;
  framePath: (sequenceId: string, index: number) => string;
  onState?: (state: EngineState) => void;
  /** Logs one line naming the sequence, the decode budget and frames resident. */
  debug?: boolean;
  /** Defaults to globalThis. Present so tests can hand it a stub. */
  env?: unknown;
};

/**
 * Starts scrubbing inside `container`, and returns the function that stops it.
 *
 * The container is NOT assumed to be empty: a server-rendered poster carrying
 * `data-scrollytelling-poster` is adopted rather than replaced. Mounting twice
 * on a live container disposes the first mount and warns.
 *
 * The returned dispose is safe to call more than once.
 */
export declare function mount(container: Element, options: MountOptions): () => void;
